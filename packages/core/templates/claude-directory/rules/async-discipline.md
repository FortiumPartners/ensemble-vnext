# Async-discipline rule

**Status:** active. Enforced by `packages/core/hooks/async-discipline.js` on every `Stop` event.

## The rule

An agent must **never claim async work** — "I'll let you know when done", "running in the
background", "I'll check back", "I'll report back", or any equivalent — without ALSO using
one of these primitives **in the same turn**:

1. **`Agent({run_in_background: true, …})`** — spawn a subagent asynchronously; the
   harness re-invokes the parent on completion.
2. **`ScheduleWakeup({delaySeconds: <ETA>, …})`** — self-rendezvous; the harness re-invokes
   the current session after the delay with the prompt you set.
3. **`Monitor`** — hold the current turn open streaming a background process's output
   line-by-line until it exits (no idle gap).
4. **`/goal <condition>`** — keep the session working turn-after-turn until a machine-
   checkable condition is met (the verify-goal pattern is one example).

If none of those apply, **do the work synchronously in the current turn and report results
inline.** Do NOT claim async.

## Why this exists

There is a recurring failure mode in which an agent says *"I dispatched X, I'll let you know
when done"* and then ends its turn — but the dispatch was a foreground `Bash` invocation or
some other call that produces no notification path back. The work completes, but the agent
sits idle until the user nudges it, at which point it checks and instantly sees the work was
done long ago. **The root cause is a hallucinated notification:** the agent thinks the
system will tell it, but nothing will.

This rule + the `Stop`-hook guard prevent that pattern structurally — the `Stop` hook
inspects the recent assistant text for fire-and-forget claims and the `Stop` input's
`background_tasks` / `session_crons` fields. A claim with no active async machinery is
blocked with a reason instructing the agent to either dispatch properly or complete the work
synchronously.

## What counts as "async machinery in flight"

- `hookData.background_tasks` is non-empty — at least one harness-tracked background task
  is running (set by `Agent({run_in_background: true})` or equivalent).
- `hookData.session_crons` is non-empty — `ScheduleWakeup` / `/schedule` registered a future
  wakeup or recurring task.
- `Monitor` is in use — the Stop event wouldn't fire (Monitor holds the turn open).
- `/goal` is active — the session keeps looping; Stop wouldn't fire to completion.

The first two are the explicit signals the `Stop` hook can read. The last two prevent Stop
from firing at all when active.

## How the guard works (at a glance)

```
Stop event fires
   ↓
async-discipline hook reads transcript_path
   ↓
scans the last assistant text for fire-and-forget phrases
   ↓
no claim?                → ALLOW stop
claim + background_tasks  → ALLOW stop (real async in flight)
claim + session_crons     → ALLOW stop (scheduled work in flight)
claim + nothing active    → BLOCK stop with a reason explaining the four primitives
```

## Phrase patterns the guard catches (conservative — designed to avoid false positives)

- "I'll let you know" / "I'll notify you" / "I'll report back" / "I'll check back"
- "I'll come back when …done/complete/finished/ready"
- "running in the background" / "happening in the background"
- "running/executing asynchronously"
- "dispatched … (will) let you know / report back / notify"
- "when it's done, I'll …"

The patterns require both a *deferral verb* ("I'll", "I will", "going to", etc.) and a
*notification intent* ("let you know", "report back", "come back"). Phrases like "running
tests in parallel" or "I'll let you know what I find" are not matched.

## Override

Diagnostics: `ENSEMBLE_ASYNC_DISCIPLINE_DEBUG=1` — stderr logging.

Disable entirely: `ENSEMBLE_ASYNC_DISCIPLINE_DISABLE=1`. **Not recommended** — the failure
mode this guards is real and recurring. Use only when actively debugging the hook itself.
