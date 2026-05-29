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
[STATUS: /implement-trd-team] DISPATCHED → 3 teammates in flight: be-001, fe-001, qa-001
   waiting on: SendMessage delivery of per-task completion reports
   next wake: ScheduleWakeup in 1200s (fallback if auto-deliver stalls)
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
[STATUS: /implement-trd-team] RESUMED → teammate be-001 SendMessage received
   completed since last turn: AUTH-B003 success, files: api/login.ts, tests/login.test.ts
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
═══ COMMAND COMPLETE: /implement-trd-team ═══
Phase 2/4 complete: 8/8 tasks success, coverage unit 87% / int 62%, 2 commits on feature/AUTH-1234
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

For long, multi-phase commands (`/implement-trd`, `/implement-trd-team`, `/verify-trd-team`,
`/harden-trd-team`), emit at each phase boundary:

```
[STATUS: /<command-name>] PHASE <N>/<M> COMPLETE → <one-line summary>
```

Phase banners are not the final COMMAND COMPLETE — they're progress markers. They show
forward motion across long loops and pair with the durability of `implement.json`'s
checkpoints.

## Notification on completion

There are two delivery paths. Use them differently:

### Path A — `PushNotification` (preferred, direct, atomic with the banner)

For **multi-turn / long-running commands** (`/implement-trd`, `/implement-trd-team`,
`/verify-trd-team`, `/harden-trd-team`, `/fix-issue`, `/create-prd-team`,
`/create-trd-team`), pair the `COMMAND COMPLETE` banner with a direct `PushNotification`
call in the same final turn. This is precise (fires once, exactly when the command is
done) and atomic with the banner (no transcript grep, no race with intermediate Stops).

```
═══ COMMAND COMPLETE: /implement-trd-team ═══
Phase 4/4 done — 23/23 tasks success, coverage 87%/62%, branch feature/AUTH-1234
```
(emit the banner as text, then call:)
```javascript
PushNotification({
  status: "proactive",
  message: "implement-trd-team done: Phase 4/4, 23 tasks success, branch feature/AUTH-1234"
})
```

For `COMMAND STUCK` on the same long-running commands, also send a `PushNotification`
with the Reason and an actionable hint — the user needs to come back to unblock:

```javascript
PushNotification({
  status: "proactive",
  message: "implement-trd-team STUCK: AUTH-B005 failed 3 retries (missing OAUTH_CLIENT_SECRET). Set env + /implement-trd --resume."
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

### Path B — `notify.sh` Stop hook (orchestration / external integration)

The `notify.sh` Stop hook (`packages/core/hooks/notify.sh`) fires every time the session
stops and runs whatever's in the `NOTIFY_ON_STOP` env var. Configure once per machine;
works for every project. Use this for **orchestration patterns** that fire on every
Stop — webhook triggers, signal files for shell-script orchestration, queue messages,
tmux pings to a parent pane. Different purpose from Path A: Path A is "tell the user
the command is done"; Path B is "tell some external system the session went idle."

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
turns of a long `/implement-trd-team` loop (after each ScheduleWakeup re-entry). If that's
too noisy, gate the alert on the presence of the `COMMAND COMPLETE` banner in the most
recent assistant output. Rough recipe:

```bash
export NOTIFY_ON_STOP='grep -q "═══ COMMAND COMPLETE" "$NOTIFY_TRANSCRIPT_PATH" && osascript -e "display notification \"Command complete\" with title \"Ensemble\""'
```

## Enforcement

This is a documented contract, not a hook-blocked invariant — the existing
`async-discipline.js` Stop hook does not inspect output for these banners. The contract
relies on each command's prompt instructing the model to emit them, and on the user
noticing their absence as a sign of a broken command (file a fix).

If you find a command that doesn't end with `═══ COMMAND COMPLETE` or
`═══ COMMAND STUCK`, that's a bug — open an issue or patch the command's final-output
instructions.
