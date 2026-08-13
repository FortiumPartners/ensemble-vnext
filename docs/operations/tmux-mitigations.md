# Tmux mitigations for Claude Code TTY-backpressure hangs

**Status:** optional, opt-in. Documented escape valve for users who run multiple Claude
Code sessions inside tmux and have observed sessions hanging mid-work, only to "wake up"
when the user navigates into the pane.

This is a **workaround for an upstream Claude Code regression** — not a framework fix.
The right long-term fix lives in Claude Code itself (read timeouts on the SSE/streaming
response, non-blocking PTY write handling). Until that ships, these mitigations are the
best available defense.

---

## The symptom

You're running multiple Claude Code sessions in tmux panes (one per project / one per
agent). Sessions doing real work in unfocused panes appear to stall — the assistant has
finished a tool call, has more work queued, but the session sits idle. When you navigate
to the pane (`Ctrl-b <arrow>` or `tmux select-pane`), the queued work fires immediately,
as if your attention itself woke the session up.

This is **not your imagination** — it's a documented Claude Code bug with multiple open
issue reports at varying severity.

## Root cause (best understanding as of 2026-05)

Claude Code's Node.js event loop deadlocks under one of these conditions:

1. **SSE/streaming connection stall** — the API streams the assistant's response over HTTP;
   if the stream pauses (network glitch, server-side delay, or PTY backpressure), there's
   no read timeout, so the runtime waits indefinitely. ([#25979](https://github.com/anthropics/claude-code/issues/25979),
   [#57103](https://github.com/anthropics/claude-code/issues/57103))
2. **Tmux PTY backpressure** — tmux drains the PTY of an unfocused pane more slowly than
   the focused pane. When the buffer fills, Node.js's blocking write on the PTY pauses
   the event loop. ([tmux #2217](https://github.com/tmux/tmux/issues/2217))
3. **Multi-pane focus-out event handling** — tmux doesn't forward focus events correctly
   when multiple panes exist, so any Claude Code logic gated on focus changes never fires
   in those configurations. ([tmux #4909](https://github.com/tmux/tmux/issues/4909))
4. **Team-mode polling stall** — teammates' SendMessage polling silently breaks after
   extended activity. ([#34668](https://github.com/anthropics/claude-code/issues/34668),
   [#24108](https://github.com/anthropics/claude-code/issues/24108))

Focusing the pane breaks the deadlock because the active pane has higher drain priority +
tmux fires focus-in events + tmux refreshes the renderer, which advances Node's event
loop one tick — and that tick is where the queued work gets processed.

## The mitigations

Two pieces, both shipped in this framework:

### 1. tmux config changes

Idempotently appended by `ensemble-tmux-apply.sh` to your `~/.tmux.conf`:

| Setting | Why |
|---|---|
| `set -g focus-events on` | Propagate focus changes so streaming I/O stays reactive |
| `set -g history-limit 1000000` | Massive scrollback — much higher per-pane buffer before stall |
| `set -g buffer-limit 100` | Larger inter-process buffer cap in the tmux server |
| `set -g mouse on` | Mouse activity counts as a wake signal |
| `setw -g aggressive-resize off` | Avoid pty pauses on resize |
| `setw -g monitor-activity off` / `monitor-bell off` | Don't suppress output for activity-monitored panes |

### 2. Heartbeat daemon

A small background script (`~/.local/bin/ensemble-claude-tmux-heartbeat.sh`) that every
60 seconds iterates every tmux pane running `claude` or `node` and toggles
`tmux pipe-pane -O 'cat >/dev/null'` then `tmux pipe-pane` (off). This forces tmux to
drain the pane's PTY buffer — the same drain operation that focusing the pane manually
triggers — without disrupting the display or sending any keystrokes.

In practice this means an unfocused Claude pane that would have stalled gets unstuck
within ≤60 seconds, without you needing to navigate to it.

The heartbeat runs in its own tmux window named `ensemble-heartbeat`. View it via
`tmux select-window -t <session>:ensemble-heartbeat`; stop with `tmux kill-window`.

## How to apply

Run once (idempotent — safe to re-run):

```bash
bash packages/core/scripts/ensemble-tmux-apply.sh
```

What it does:
1. Verifies tmux is running and reports state
2. Backs up your existing `~/.tmux.conf` to `~/.tmux.conf.ensemble-bak-<timestamp>`
3. Appends the marker-delimited ENSEMBLE config block (replaces if already present)
4. `tmux source-file ~/.tmux.conf` — **live reload, no session restart**
5. Verifies key settings via `tmux show-options`
6. Installs `~/.local/bin/ensemble-claude-tmux-heartbeat.sh`
7. Starts the heartbeat in a new `ensemble-heartbeat` tmux window

No tmux session restarts. No Claude session restarts. No prompt loss.

## Tuning

Change the heartbeat interval (default 60s):

```bash
# Kill existing
tmux kill-window -t <session>:ensemble-heartbeat

# Restart with custom interval (e.g., 30s)
ENSEMBLE_HEARTBEAT_INTERVAL=30 tmux new-window -d -t <session>: -n ensemble-heartbeat \
  'bash ~/.local/bin/ensemble-claude-tmux-heartbeat.sh'
```

Trade-off: shorter interval = faster unstick, marginally more tmux command overhead
(negligible — `pipe-pane` is cheap).

## To revert

```bash
cp ~/.tmux.conf.ensemble-bak-<timestamp> ~/.tmux.conf && tmux source-file ~/.tmux.conf
tmux kill-window -t <session>:ensemble-heartbeat
rm ~/.local/bin/ensemble-claude-tmux-heartbeat.sh
```

## What this does NOT fix

- The underlying Claude Code regression — file/upvote the linked GitHub issues so
  Anthropic prioritizes the read-timeout + non-blocking PTY work.
- Sessions hanging when **not** running in tmux (e.g., raw terminal, iTerm direct,
  VS Code integrated terminal) — those have different mitigations.
- Permission prompts that block headless work — see `notify.sh` Stop hook +
  Mauro's PermissionRequest hook recipe ([blog post](https://medium.com/@microwalks/claude-code-kept-getting-stuck-while-i-was-afk-heres-how-i-fixed-it-with-hooks-90e1f15f7ca7)).

## Sources

- [#57103 — Claude Code freezes for extended periods at low context usage](https://github.com/anthropics/claude-code/issues/57103)
- [#34668 — Agent Teams: teammates stop receiving SendMessage after extended polling](https://github.com/anthropics/claude-code/issues/34668)
- [#24108 — Agent teams: teammates stuck at idle prompt in tmux split-pane mode](https://github.com/anthropics/claude-code/issues/24108)
- [#25979 — Claude Code hangs when API streaming connection stalls](https://github.com/anthropics/claude-code/issues/25979)
- [#20079 — Claude Code hangs during task execution with no progress indication](https://github.com/anthropics/claude-code/issues/20079)
- [#28482 — Agent hangs indefinitely mid-task](https://github.com/anthropics/claude-code/issues/28482)
- [tmux #2217 — Pause/resume pty output per pane](https://github.com/tmux/tmux/issues/2217)
- [tmux #4909 — Focus-out events not forwarded with multiple panes](https://github.com/tmux/tmux/issues/4909)
- [Node.js — Backpressuring in Streams](https://nodejs.org/learn/modules/backpressuring-in-streams)
