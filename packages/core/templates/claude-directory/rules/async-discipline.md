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

## Teammate spawns (`Agent({subagent_type, name, ...})`) — auto-delivery satisfies the rule

As of Claude Code v2.1.178, `TeamCreate`/`TeamDelete` no longer exist and `team_name` on
the `Agent` tool is accepted but ignored — a team forms automatically the moment the first
teammate spawns, with no setup step and no cleanup step. Teammates communicate with the
lead via `SendMessage`.

**Auto-delivery works and satisfies this discipline on its own.** A live experiment
confirmed it: a spawned teammate's `SendMessage` calls were auto-delivered and re-invoked
the lead with no `ScheduleWakeup` involved. This matches the current team docs, which
promise that teammate deliveries auto-arrive as new lead turns. A prior version of this
rule claimed auto-re-invocation "has been observed to silently stall" and mandated a
paired `ScheduleWakeup` on every team spawn — that claim was not reproduced and is now
known to be stale; it has been removed.

**Recommended, not mandatory:** pair a team spawn with a fallback in the same turn —
- `ScheduleWakeup({delaySeconds, prompt})` — cheap insurance; the wake re-enters the
  orchestrating command and is a harmless no-op if auto-delivery already fired (default
  cadence for team commands: 1200s / 20 min).
- `/goal <condition>` — keeps the session looping until the team's deliverables are
  observable.

Treat this as best-practice belt-and-suspenders (the evidence base is one live experiment
plus the current docs, not exhaustive), not as a requirement the async-discipline hook
enforces. The commands that spawn teammates (`/create-prd-team`, `/create-trd-team`,
`/harden-trd-team`, `/verify-trd-team`, `/fix-issue`) still document a Step 2a/3a
"schedule the safety-net wake-up" — it remains recommended there, downgraded from
mandatory.

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

## The SubagentStop counterpart: `subagent-discipline.js`

`async-discipline.js` only runs on `Stop`, so it protects the main session and nothing
else. Subagents fail the same way — three subagents in one observed session ended with
"I'll wait for the monitor notifications to arrive" and "Waiting for background scenario
completions", burning ~240k tokens across 179 tool calls and returning nothing.
`subagent-discipline.js` (`.claude/hooks/subagent-discipline.js`, registered on
`SubagentStop`, right after `status.js`) catches this in the place `async-discipline.js`
never looks, by reusing the same pattern battery and matcher from
`.claude/hooks/lib/async-claim-detector.js` rather than maintaining a second regex engine.

**The rule is stricter for subagents than for the lead**, verified empirically
(2026-08-12 — see `docs/modernization/2026-08-improvement-plan.md` item 5e for the full
probe results, since the platform's hooks reference is wrong or silent on all four
points):

- `ScheduleWakeup` is removed from every subagent by the platform's first tool filter
  (foreground and background alike). A subagent claiming it will "come back later" or
  "check back when X finishes" is false **by construction** — there is no mechanism by
  which it could. So `subagent-discipline.js` does NOT treat a non-empty `session_crons`
  as a legitimate escape valve the way `async-discipline.js` does for the lead — a
  subagent cannot have populated it.
- `Agent({run_in_background: true})` is not filtered the same way, so a non-empty
  `background_tasks` IS still treated as legitimate (the subagent dispatched its own
  nested background work).
- `{"decision":"block","reason":...}` **works** on `SubagentStop` — the subagent
  resumes with its existing context (it does not respawn), and the `reason` text
  reaches it; its next turn answers the reason directly.
- `stop_hook_active` **is** present in the `SubagentStop` payload, same as `Stop`.

**Loop safety.** Blocking forever is worse than the failure being guarded. A subagent
that genuinely cannot proceed must be allowed to stop, with the situation visible in its
final message. `subagent-discipline.js` persists a per-`agent_id` consecutive-block
counter (small JSON file under the OS temp dir — hook invocations are isolated
processes, nothing else survives between them) and caps it at
`MAX_CONSECUTIVE_BLOCKS` (2): the third consecutive claim from the same `agent_id` is
allowed through unconditionally and the counter resets. The counter also resets the
moment a turn does NOT contain a deferred-work claim. If `agent_id` is absent from the
payload the loop cannot be bounded safely, so the guard degrades to allow rather than
risk blocking without a cap.

Env vars: `ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE=1` (skip the guard),
`ENSEMBLE_SUBAGENT_DISCIPLINE_DEBUG=1` (stderr diagnostics).

## Orchestration pattern: the scheduled nudge

`ScheduleWakeup` is unavailable to subagents but **available to the lead session**, and
`SendMessage` reaches a named background agent with its context intact. Combined, these
give an orchestrator a way to actively babysit dispatched background work instead of
just hoping a completion notification arrives — without any timeout mechanism (this
project deliberately does not use timeouts for this; `subagent-discipline.js`'s block
cap is a *loop* guard, not a *time* guard).

The shape:

1. **Dispatch** one or more subagents in the background:
   `Agent({subagent_type, run_in_background: true, name: "be-001", ...})`.
2. **Schedule a wake before ending the turn** — this is the same safety-net pairing
   already mandated for `Agent({team_name})` spawns elsewhere in this file:
   `ScheduleWakeup({delaySeconds: <ETA>, prompt: "check on be-001 / fe-001 progress"})`.
3. **On wake**, inspect what is actually running — `background_tasks` in the
   re-invocation payload, each agent's last reported status/output — rather than
   assuming silence means either "done" or "stuck."
4. **Nudge anything that looks stalled**: `SendMessage({to: "be-001", message: "status
   check — what have you completed and what's blocking you?"})`. The agent resumes with
   its full context; the nudge is informational, not a kill switch.
5. **Re-schedule another wake** if work is still in flight, or proceed once everything
   has reported in.

This is the lead-session mirror of what `subagent-discipline.js` enforces from the
hook side: a subagent is never allowed to just claim it'll check back later, and the
orchestrator is never left purely hoping a notification arrives — it actively re-checks
and nudges. Neither side relies on a timer; both rely on an explicit re-entry point
(`ScheduleWakeup` for the lead, the block/loop-cap for the subagent).
