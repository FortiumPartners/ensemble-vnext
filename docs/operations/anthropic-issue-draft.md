# Anthropic GitHub issue draft — Claude Code hangs in unfocused tmux panes

**Action:** paste the body below into https://github.com/anthropics/claude-code/issues/new
(or comment on issue [#57103](https://github.com/anthropics/claude-code/issues/57103) /
[#34668](https://github.com/anthropics/claude-code/issues/34668) to add weight to existing
reports).

---

**Title:** Claude Code sessions hang in unfocused tmux panes; "wake up" instantly when pane gains focus

**Body:**

## Symptom

Running multiple Claude Code sessions in tmux panes (one per project, several with
ensemble-style `Agent({team_name: ...})` orchestration). Sessions doing real work in
unfocused panes appear to silently stall mid-task — no error, no spinner update, no log
entry. When I navigate to the affected pane (`Ctrl-b <arrow>` or `tmux select-pane`),
the queued work fires **immediately**, as if focus itself unblocked the event loop.

Most striking failure mode: spawned teammates (Agent Teams) complete their work,
emit `SendMessage` to the lead, then idle. The lead session never processes those
messages — until I navigate to either the teammate panes or the lead pane, at which point
the queue drains all at once.

This behavior is consistent with — and almost certainly the same root cause as —
[#57103 — Claude Code freezes for extended periods](https://github.com/anthropics/claude-code/issues/57103)
and [#34668 — Agent Teams: teammates stop receiving SendMessage after extended polling](https://github.com/anthropics/claude-code/issues/34668),
narrowed to a specific reproducible trigger (tmux + unfocused pane).

## Environment

- macOS [version]
- tmux [version — `tmux -V`]
- Terminal: [iTerm2 / Terminal.app / Alacritty / Ghostty / etc.]
- Claude Code: [version — `claude --version`]
- Pattern: 10+ sessions, each in its own tmux session/window, with Agent Teams active
  (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)

## Reproduction

1. Open tmux with 3+ sessions/panes, each running `claude`
2. In session A, spawn a quick team:
   ```
   TeamCreate({team_name: "test"})
   Agent({subagent_type: "...", team_name: "test", name: "x", prompt: "echo done; SendMessage to team-lead"})
   ```
3. Switch focus to a DIFFERENT pane (session B, etc.) immediately after the spawn
4. Wait 60+ seconds
5. The teammate has finished and SendMessaged, but session A's lead has not re-entered
   the loop and processed the message
6. Navigate back to session A's pane
7. Observe: the SendMessage arrives instantly as a new turn, as if it had just been
   received — but the timestamp shows it was actually delivered minutes ago

## What we believe is happening

A combination of:
1. **Tmux PTY backpressure on unfocused panes** — tmux drains unfocused panes' PTY
   buffer more slowly. When the buffer fills, Node's `write()` on the PTY blocks. A
   blocked write means the Node event loop pauses, including the
   `SendMessage`-delivery / mailbox-poll tick. ([tmux #2217](https://github.com/tmux/tmux/issues/2217))
2. **Tmux multi-pane focus-out** — tmux doesn't forward focus events correctly when
   multiple panes exist, so any Claude Code logic gated on focus events never fires.
   ([tmux #4909](https://github.com/tmux/tmux/issues/4909))
3. **No read timeout on the SSE response** (already documented in
   [#25979](https://github.com/anthropics/claude-code/issues/25979)) — so when the API
   side is also waiting on the client, the deadlock has no break point.

Focusing the pane triggers tmux to actively drain the PTY, which unblocks the write,
which advances the event loop, which fires the queued mailbox processing.

## Workaround (currently working for us)

- `~/.tmux.conf` mitigations: `focus-events on`, `history-limit 1000000`,
  `buffer-limit 100`, `mouse on`
- A 60-second tmux heartbeat that toggles `pipe-pane -O 'cat >/dev/null'` then
  `pipe-pane` on every pane running `claude` — forces drain without sending keystrokes
- For team-mode work specifically: pair every `Agent({team_name})` spawn with
  `ScheduleWakeup({delaySeconds: 1200})` as a server-side re-invocation backstop

These let things keep moving but they're band-aids — the real fix is in Claude Code's
event-loop / PTY-write handling.

## Suggested fix

1. **Add a read timeout on the SSE stream** (per [#25979](https://github.com/anthropics/claude-code/issues/25979))
2. **Use non-blocking writes for PTY output** — wrap `process.stdout.write` so backpressure
   on the PTY pauses the upstream READ rather than blocking the event loop
3. **Decouple the mailbox poller / SendMessage handler from PTY I/O** — those should
   advance independently of stdout flushing
4. **Document tmux as a "tested configuration" or "known-limited"** — make this a
   first-class supported scenario or surface a warning at startup when running inside
   tmux

## Severity

For users running multi-session ensemble workflows, this makes long unattended runs
unreliable. We're working around it but losing meaningful productivity to the workarounds.
Would gladly help test a patch.

---

## Related issues to link

- [#57103](https://github.com/anthropics/claude-code/issues/57103) — exact pattern, broader scope
- [#34668](https://github.com/anthropics/claude-code/issues/34668) — SendMessage polling stall
- [#24108](https://github.com/anthropics/claude-code/issues/24108) — teammates stuck in tmux split-pane
- [#25979](https://github.com/anthropics/claude-code/issues/25979) — no SSE read timeout
- [#28482](https://github.com/anthropics/claude-code/issues/28482) — hangs indefinitely mid-task
- [#20079](https://github.com/anthropics/claude-code/issues/20079) — hangs with no progress indication
- [tmux #2217](https://github.com/tmux/tmux/issues/2217) — tmux PTY pause/resume
- [tmux #4909](https://github.com/tmux/tmux/issues/4909) — tmux focus-out not forwarded with multiple panes
