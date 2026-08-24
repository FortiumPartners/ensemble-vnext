# Command-status discipline

**Status:** active. Required of every workflow command (slash-command-driven session).

## Why this exists

You should never have to ask "is it done?", "what's it waiting for?", or "did it stall?"
Three standard banners answer those three questions. They're the contract every command
honors so a glance at the last output line tells you the state without scrolling.

## The three banners

Use these literal forms — leave the box characters intact; they make the banners visually
unmistakable in terminal output.

### 1. DISPATCHED (turn ends with work in flight)

When a command spawns subagents/teammates or schedules a wake-up and is about to end
its turn awaiting their completion, emit a DISPATCHED line **right before ending the
turn**:

```
[STATUS: /<command-name>] DISPATCHED → <count> <kind> in flight: <names>
   waiting on: <observable signal>
   next wake: <ScheduleWakeup ETA | "auto-deliver on teammate SendMessage" | "/goal condition">
```

Example:
```
[STATUS: /implement-trd] DISPATCHED → phase 2 workflow in flight: 4 tasks, 2 waves
   waiting on: Workflow(implement-phase) return
   next wake: on workflow completion
```

### 2. RESUMED (turn starts after a wake)

When the command re-enters via ScheduleWakeup, a teammate SendMessage, or /goal looping,
emit a RESUMED line **as the first line** of the new turn:

```
[STATUS: /<command-name>] RESUMED → <reason>
   completed since last turn: <summary or "none">
```

Example:
```
[STATUS: /implement-trd] RESUMED → phase 2 workflow returned
   completed since last turn: AUTH-B003 verified, files: api/login.ts, tests/login.test.ts
```

### 3. COMMAND COMPLETE / COMMAND STUCK (the LAST line of the final turn)

When the command finishes its end-to-end work, its **last output line** must be one of:

```
═══ COMMAND COMPLETE: /<command-name> ═══
<one-line summary: what was produced / accomplished>
```

or, if the command exits with an unrecoverable stuck state:

```
═══ COMMAND STUCK: /<command-name> ═══
Reason: <one-line>
Next:   <what would unblock — usually a user decision or external fix>
```

Examples:
```
═══ COMMAND COMPLETE: /create-prd ═══
PRD written to docs/PRD/user-auth.md (9 sections, 3 personas, 12 acceptance criteria)
```

```
═══ COMMAND COMPLETE: /implement-trd ═══
Phase 4/4 complete: 8/8 tasks implemented, coverage unit 87% / int 62%, 2 commits on feature/AUTH-1234
```

```
═══ COMMAND STUCK: /implement-trd ═══
Reason: AUTH-B005 failed 3 debug retries — root cause is missing OAuth client secret
Next:   set OAUTH_CLIENT_SECRET env var and run /implement-trd --resume
```

**Rules for the COMPLETE/STUCK banner:**
- It is the **LAST line of the turn**. Nothing after it. Not even a final reminder.
- Use it only when the command itself is done — not at phase boundaries, not when handing
  off to a teammate. (Phase boundaries get a PHASE banner; see optional below.)
- For commands that span many turns and ScheduleWakeup cycles, the banner fires only on
  the turn that completes the entire command (not on every intermediate wake).

## Optional: PHASE banner

For long, multi-phase commands (`/implement-trd`, `/audit-build`,
`/fix`), emit at each phase boundary:

```
[STATUS: /<command-name>] PHASE <N>/<M> COMPLETE → <one-line summary>
```

Phase banners are not the final COMMAND COMPLETE — they're progress markers. They show
forward motion across long loops and pair with the durability of `implement.json`'s
checkpoints.

## Notification on completion

There are two delivery paths. Use them differently:

### Path A — `PushNotification` (preferred, direct, atomic with the banner)

For **multi-turn / long-running commands** (`/implement-trd`,
`/audit-build`, `/fix`), pair the `COMMAND COMPLETE` banner with a direct `PushNotification`
call in the same final turn. This is precise (fires once, exactly when the command is
done) and atomic with the banner (no transcript grep, no race with intermediate Stops).

```
═══ COMMAND COMPLETE: /implement-trd ═══
Phase 4/4 done — 23/23 tasks implemented, coverage 87%/62%, branch feature/AUTH-1234
```
(emit the banner as text, then call:)
```javascript
PushNotification({
  status: "proactive",
  message: "implement-trd done: Phase 4/4, 23 tasks implemented, branch feature/AUTH-1234"
})
```

For `COMMAND STUCK` on the same long-running commands, also send a `PushNotification`
with the Reason and an actionable hint — the user needs to come back to unblock:

```javascript
PushNotification({
  status: "proactive",
  message: "implement-trd STUCK: AUTH-B005 failed 3 retries (missing OAUTH_CLIENT_SECRET). Set env + /implement-trd --resume."
})
```

**Don't send `PushNotification` from short one-shot commands** (`/create-prd`,
`/refine-prd`, `/cleanup-project`, etc.) — the user is watching that turn; a desktop
ping is noise. The COMMAND COMPLETE banner alone is enough.

**Notification budget rules** (from the tool's own guidance):
- Under 200 characters, one line, no markdown.
- Lead with what the user would act on ("build failed: 2 auth tests" beats "task done").
- Err toward NOT sending. A notification the user didn't need accumulates as annoyance.
- If the tool result says the push wasn't sent, that's expected — no follow-up needed.

### Path B — `NOTIFY_ON_COMPLETE` env var (programmatic, atomic with COMMAND COMPLETE)

**Use this when you want a programmatic completion signal you can route to a webhook,
shell command, queue, or signal file — and you want it to fire EXACTLY ONCE per command,
at the actual completion moment (never during dispatch or intermediate Stops).**

How it works: the command, on the same final turn that emits `═══ COMMAND COMPLETE ═══`,
invokes a vendored helper script `.claude/hooks/notify-complete.sh` with three positional
args (`cmd`, `status`, `summary`). The helper discovers all session identity context from
the environment + working tree, exports it as `NOTIFY_*` env vars, and dispatches the
user's `$NOTIFY_ON_COMPLETE` shell command via `/bin/sh -c`. The Bash invocation goes
through the model's tool surface, so it fires exactly once, precisely when the command
finishes — never during DISPATCHED or RESUMED turns.

**User setup** (once per machine, e.g. in `~/.zshrc` or `~/.bashrc`):

```bash
# Webhook example — rich identity for routing/grouping in the receiver
export NOTIFY_ON_COMPLETE='curl -fsS -X POST -H "Content-Type: application/json" \
  -d @- "$ENSEMBLE_WEBHOOK_URL" <<JSON
{
  "project":      "$NOTIFY_PROJECT",
  "cwd":          "$NOTIFY_CWD",
  "branch":       "$NOTIFY_BRANCH",
  "feature":      "$NOTIFY_FEATURE",
  "session_id":   "$NOTIFY_SESSION_ID",
  "tmux_session": "$NOTIFY_TMUX_SESSION",
  "tmux_pane":    "$NOTIFY_TMUX_PANE",
  "cmd":          "$NOTIFY_CMD",
  "status":       "$NOTIFY_STATUS",
  "summary":      "$NOTIFY_SUMMARY"
}
JSON'

# Signal file example — one-line append for tail/grep
export NOTIFY_ON_COMPLETE='echo "[$NOTIFY_PROJECT/$NOTIFY_BRANCH] $NOTIFY_CMD $NOTIFY_STATUS: $NOTIFY_SUMMARY" >> ~/ensemble-completions.log'

# Send a status line back to the same tmux pane the user is in
export NOTIFY_ON_COMPLETE='[ -n "$NOTIFY_TMUX_PANE" ] && \
  tmux display-message -t "$NOTIFY_TMUX_PANE" "Claude: $NOTIFY_CMD $NOTIFY_STATUS — $NOTIFY_SUMMARY"'

# Slack (with project context)
export NOTIFY_ON_COMPLETE='curl -fsS -X POST "$SLACK_WEBHOOK" \
  -d "{\"text\":\":white_check_mark: \`$NOTIFY_PROJECT\`/\`$NOTIFY_BRANCH\` — $NOTIFY_CMD: $NOTIFY_SUMMARY\"}"'
```

**Context vars exported to the user's `NOTIFY_ON_COMPLETE` command:**

| Var | Value | Discovery source |
|---|---|---|
| `NOTIFY_CMD` | Slash command without leading slash (e.g. `implement-trd`) | Helper arg 1 |
| `NOTIFY_STATUS` | `complete` or `stuck` | Helper arg 2 |
| `NOTIFY_SUMMARY` | One-line summary from the COMMAND COMPLETE / STUCK banner | Helper arg 3 |
| `NOTIFY_PROJECT` | `basename "$PWD"` | Working directory |
| `NOTIFY_CWD` | Full `$PWD` | Working directory |
| `NOTIFY_BRANCH` | Current git branch (empty if no git / detached HEAD) | `git branch --show-current` |
| `NOTIFY_FEATURE` | Feature name from `.trd-state/current.json` (basename of TRD path; empty if none) | `jq -r .trd current.json` |
| `NOTIFY_SESSION_ID` | Claude Code session ID (`unknown` if SessionStart didn't capture it) | `$CLAUDE_SESSION_ID` (set by `session-context.js` via `$CLAUDE_ENV_FILE` on SessionStart) |
| `NOTIFY_TMUX_SESSION` | tmux session name (empty if not in tmux) | `tmux display-message -p '#S'` |
| `NOTIFY_TMUX_PANE` | tmux pane id like `%0` (empty if not in tmux) | `$TMUX_PANE` |

**Model-side invocation** (the command runs this Bash call as part of the final turn,
AFTER emitting the COMMAND COMPLETE banner):

```bash
.claude/hooks/notify-complete.sh "<cmd>" "<complete|stuck>" "<one-line summary>"
```

The helper is silent and exits 0 if `$NOTIFY_ON_COMPLETE` is unset/empty — zero cost when
not configured. Discovery failures (no git / no jq / not in tmux) fall back to empty
strings rather than blocking dispatch. No timeout — the user's command owns its own
timeout discipline.

**Why this is distinct from Path A and Path C below:**

| Path | Audience | Mechanism | Fires |
|---|---|---|---|
| A. PushNotification | The user (desktop / phone alert) | Native Claude Code tool | Once, on final turn |
| B. NOTIFY_ON_COMPLETE | External systems (webhook, queue, shell pipeline) | Bash call invoking user's shell command | Once, on final turn |
| C. NOTIFY_ON_STOP | Per-Stop orchestration patterns (tmux pane, parent process) | Stop hook (`notify.sh`) | Every Stop — including dispatch + wake turns |

A and B are precise — they fire **only** when a command completes. C fires on every turn
end. Use A to alert yourself, B to trigger external systems, C only for "I genuinely
want to know every time the session goes idle" (rare).

### Path C — `notify.sh` Stop hook (per-Stop orchestration only)

The `notify.sh` Stop hook (`packages/core/hooks/notify.sh`) fires every time the session
stops and runs whatever's in the `NOTIFY_ON_STOP` env var. Different scope from Path B:
this fires on EVERY Stop, including dispatch turns and ScheduleWakeup re-entries.
Appropriate when you genuinely want per-Stop signals — tmux pings to a parent pane,
signal files for shell-script orchestration that doesn't care about command boundaries.
For "tell external system this command finished," use Path B instead.

**macOS terminal bell + desktop notification:**
```bash
export NOTIFY_ON_STOP='osascript -e "display notification \"Claude session idle\" with title \"Ensemble\"" && printf "\a"'
```

**macOS notification with last assistant line as body:**
```bash
export NOTIFY_ON_STOP='osascript -e "display notification \"$(tail -3 \"$NOTIFY_TRANSCRIPT_PATH\" 2>/dev/null | head -1 | tr -d \"\\\"\")\" with title \"Claude\""'
```

**Plain terminal bell (any platform):**
```bash
export NOTIFY_ON_STOP='printf "\a"'
```

**Slack webhook:**
```bash
export NOTIFY_ON_STOP='curl -s -X POST -H "Content-Type: application/json" -d "{\"text\":\"Claude session $NOTIFY_SESSION_ID idle in $NOTIFY_CWD\"}" "$SLACK_WEBHOOK"'
```

**Important caveat:** `notify.sh` fires on every Stop event — including the intermediate
turns of a long `/implement-trd` loop (after each ScheduleWakeup re-entry). If that's
too noisy, gate the alert on the presence of the `COMMAND COMPLETE` banner in the most
recent assistant output. Rough recipe:

```bash
export NOTIFY_ON_STOP='grep -q "═══ COMMAND COMPLETE" "$NOTIFY_TRANSCRIPT_PATH" && osascript -e "display notification \"Command complete\" with title \"Ensemble\""'
```

## Artifact links (opt-in)

A command that produces a document — a PRD, a TRD, a verification report — may publish it as
an **artifact**: a private page on claude.ai the owner can click into, and later share if they
choose. Off by default; enable per project with `ensemble.publishArtifacts: true` in
`.claude/settings.json`.

### Publish the FILE. Do not render it.

```
Artifact({ file_path: "docs/TRD/<feature>.md", favicon: "📐",
           description: "<one sentence>", url: "<stored URL, if this is an update>" })
```

Markdown files publish directly. Three reasons this matters more than it looks:

- **It costs one tool call.** Authoring an HTML rendering would cost output tokens
  proportional to the document, and TRDs here run to 129 KB.
- **Mermaid renders natively** from ```` ```mermaid ```` fences, so architecture and
  dependency diagrams are drawn rather than shown as source. That is most of the value.
- **A rendering is a second copy that drifts.** Publishing the file means the artifact is the
  document, not a paraphrase of it.

### Store the URL, and redeploy to it

Write the returned URL to `.trd-state/<feature>/artifacts.json` keyed by artifact kind
(`prd`, `trd`, `verification-report`). On a later `/refine-prd`, `/refine-trd` or re-verify,
pass that URL back as `url:` so the same link updates in place.

**Without this the link goes stale silently**, which is the failure this framework fights
everywhere else: someone clicks a URL from three refinements ago and reads a superseded plan
that looks current. A stale artifact is worse than none.

### Where the link goes

**Above the `COMMAND COMPLETE` banner, never after it** — the banner is the last line of the
turn and nothing may follow it. One line:

```
📐 TRD: https://claude.ai/artifact/...
═══ COMMAND COMPLETE: /create-trd ═══
<summary>
```

### Failure is never fatal

If the tool is unavailable or the publish fails, **say so in one line and carry on**. The
document on disk is the deliverable; the artifact is a convenience. A command must not go
STUCK, retry, or lose its banner because a link could not be made.

### Why opt-in rather than default

Publishing sends the document to an external service, where it may be cached or indexed even
if later deleted. That is the owner's call to make for their own repository, not a default a
framework imposes — a consuming project's TRD may carry design detail they would not choose to
publish. The artifact is private by default, which makes this a small risk rather than none.

**Never publish a document that contains a credential.** `verification.md` already requires
recording where credentials live rather than their values; this is the reason that rule is
load-bearing rather than tidy.

---

## Enforcement

This is a documented contract, not a hook-blocked invariant — the existing
`async-discipline.js` Stop hook does not inspect output for these banners. The contract
relies on each command's prompt instructing the model to emit them, and on the user
noticing their absence as a sign of a broken command (file a fix).

If you find a command that doesn't end with `═══ COMMAND COMPLETE` or
`═══ COMMAND STUCK`, that's a bug — open an issue or patch the command's final-output
instructions.

**One legitimate exception: a command that CHAINS into another.** `/fix` on an AUTO tier
invokes `/implement-trd` and deliberately emits no banner of its own, because the banner is
the LAST line of the turn and an implementation run follows it. The run still terminates with
a banner; it carries the chained command's name. Emitting one before the chain would put a
terminator mid-turn; emitting one after would put text after `/implement-trd`'s. Both are the
thing this rule forbids.

So the invariant is **one banner per RUN, not one per command name**. A chaining command that
emits none is correct, and mechanically auditing every command for its own banner produces a
false report against exactly the commands that hand off properly.
