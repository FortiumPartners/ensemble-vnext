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

## `Agent({team_name})` — partial async, requires pairing

`Agent({team_name})` spawns long-running teammates that communicate via `SendMessage`. The
team docs promise that teammate deliveries auto-arrive as new lead turns — but **this
auto-re-invocation has been observed to silently stall**: teammates complete, send their
messages, the lead session idles, and no new turn fires until the user types the next
prompt. The "background_tasks" the hook sees from a team spawn are the teammates' own
sessions — they don't guarantee the lead will be re-invoked.

**Rule:** `Agent({team_name})` does NOT satisfy this discipline on its own. **Every team
spawn must be paired in the same turn with either:**
- `ScheduleWakeup({delaySeconds, prompt})` — recommended; the wake re-enters the
  orchestrating command, harmless no-op if auto-delivery already fired (default cadence
  for team commands: 1200s / 20 min).
- `/goal <condition>` — keeps the session looping until the team's deliverables are
  observable.

This rule is implemented at the COMMAND level: `/implement-trd-team`, `/create-prd-team`,
`/create-trd-team`, `/harden-trd-team`, `/verify-trd-team`, and `/fix-issue` include a
mandatory Step 2a / Step 3a "schedule the safety-net wake-up before ending the turn"
right after each `Agent({team_name})` spawn. The hook is conservative (it accepts
`background_tasks` non-empty as sufficient — a false-positive of safety in the team case)
and relies on the commands to enforce correctness. Treat the commands' Step 2a/3a as
non-optional.

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

### What the guard deliberately IGNORES

To avoid blocking meta-discussion *about* the rule itself, the matcher first strips:

- Fenced code blocks (between triple backticks)
- Inline code spans (between single backticks)
- Double-quoted strings (straight `"…"` and curly `“…”`)
- Single-quoted strings where both quotes sit on word/sentence boundaries (so
  contractions like `don't` / `I'll` / `it's` and possessives are NOT eaten)

It also skips a match preceded within ~80 characters by an explicit meta-discussion marker:
`something like`, `for example`, `for instance`, `such as`, `phrases like`, `the phrase`,
`the literal`, `example of`, `e.g.`, `i.e.`, `saying`, `matched phrase`, etc.

Practical implication: documenting, describing, or quoting the pattern (in code spans, inside
quotes, or after a meta marker) does NOT trigger the guard. Real claims in prose still do.

## Override

Diagnostics: `ENSEMBLE_ASYNC_DISCIPLINE_DEBUG=1` — stderr logging.

Disable entirely: `ENSEMBLE_ASYNC_DISCIPLINE_DISABLE=1`. **Not recommended** — the failure
mode this guards is real and recurring. Use only when actively debugging the hook itself.
