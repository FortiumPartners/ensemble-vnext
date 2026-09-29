# Async-discipline rule

**Status:** active. Enforced as case A of the one model-judged `Stop` hook, `discipline-stop`
(`hookType: "prompt"`, prompt source
`packages/core/hooks/prompts/discipline-stop.source.md`) — the platform's own judge evaluates
the turn's final message against this rule directly, on every `Stop` event.

## The rule

An agent must **never claim async work** — "I'll let you know when done", "running in the
background", "I'll check back", "I'll report back", or any equivalent — without ALSO using
one of these primitives **in the same turn**:

1. **`Agent({run_in_background: true, …})`** — spawn a subagent asynchronously; the harness
   re-invokes the parent on completion.
2. **`ScheduleWakeup({delaySeconds: <ETA>, …})`** — self-rendezvous; the harness re-invokes
   the session after the delay with the prompt you set.
3. **`Monitor`** — hold the turn open streaming a background process's output until it exits
   (no idle gap).
4. **`/goal <condition>`** — keep the session working turn-after-turn until a machine-
   checkable condition is met. **This is the one primitive with no bound of its own — do not
   reach for it first.** The other three self-limit (an agent finishes, a wakeup fires once,
   `Monitor` ends when its process exits); `/goal` re-invokes until its condition reads true
   and does not stop if that condition is unreachable. Prefer `ScheduleWakeup` for a bounded
   re-entry; reserve `/goal` for conditions that are genuinely machine-checkable AND
   reachable.

If none of those apply, **do the work synchronously in the current turn and report results
inline.** Do NOT claim async.

**Why this exists:** an agent says *"I dispatched X, I'll let you know when done"* and ends
its turn, but the dispatch produces no notification path back — the work completes, the agent
sits idle until nudged. **The root cause is a hallucinated notification.**

## What counts as "async machinery in flight"

- `hookData.background_tasks` non-empty — a harness-tracked background task is running (set
  by `Agent({run_in_background: true})` or equivalent).

  **Exception: `Bash({run_in_background: true})` does NOT appear here.** The primitive is
  real, but invisible to the judge — an unhelpful `background_tasks` is not evidence against
  a claim naming one. It is a fifth primitive, the only one with a genuine notification path
  and no payload trace; the judge allows when a turn points at a specific, checkable process
  (task id, PID, log file).
- `hookData.session_crons` non-empty — `ScheduleWakeup` / `/schedule` registered a future
  wakeup or recurring task.
- `Monitor` in use, or `/goal` active — the Stop event wouldn't fire at all.

The first two are explicit signals the `Stop` hook can read; the last two prevent Stop from
firing while active.

## Teammate spawns — auto-delivery satisfies the rule

A team forms automatically the moment the first teammate spawns; a teammate's `SendMessage`
auto-re-invokes the lead as a new turn, satisfying the rule with no `ScheduleWakeup` needed.
Recommended but not mandatory: pair a team spawn with `ScheduleWakeup({delaySeconds,
prompt})` as cheap insurance, or `/goal <condition>` until deliverables are observable. No
command in this framework spawns teammates — this governs a teammate an AGENT spawns.

## What counts as a violation (judged, not pattern-matched)

The judge reads `last_assistant_message` for an ASSERTION that something will notify or
resume the agent later — however it's phrased — rather than matching a fixed phrase list.
**Self-documentation is not a violation**: a rule file explaining the pattern, or a quoted
example, is talk *about* a claim, not a live one — the judge tells them apart by context and
fails open (allows) when genuinely ambiguous, because a missed violation is recoverable and a
judge that leans toward blocking would eventually block this project's own documentation
about the rule.

**There is no "about to" escape at `Stop`.** A turn can make the same false claim in future
tense — **"I'm going to dispatch those three now,"** turn ends, nothing dispatched — and it's
judged the same as "I did X" or "I'm doing X": if the payload would show the asserted action
and it isn't there, it's unbacked. This must not catch ordinary mid-turn narration: the judge
only sees the FINAL message, so "I'm going to read the file" followed by actually reading it
in the same turn is normal. It fires only when the LAST message asserts an action as
imminent-and-unstarted and the turn ends right there, contradicted by the payload. Ambiguous
cases fail open — allow.

### How the platform actually asks the question

A prompt-type `Stop` hook is not run as free-standing instructions: Claude Code sends it as
`Condition: <the prompt>` under a stopping-condition system prompt that returns `{"ok":
false, "reason": "insufficient evidence in transcript"}` whenever the evidence is unclear —
so "unclear" means **block**. `discipline-stop.source.md` is written for this framing.

## Override

**There is no runtime kill switch and no build-time one either.** To disable or change this
guard, edit `packages/core/hooks/prompts/discipline-stop.source.md`, run
`build-judge-prompts.js` then `generate-hooks-artifacts.sh`, and deliver through `--refresh`.
Never set `if` on this hook, or on any `Stop`/`SubagentStop` hook: the field is a tool-call
permission matcher and these events have no tool call for it to match — any non-empty `if`
silently disables the hook.

## SubagentStop has no model judge

There is no model judge on `SubagentStop` (removed 2026-08-28) — it carries only two command
hooks. The failure it used to catch (a subagent burning tokens and returning nothing) is now
caught more cheaply by schema-forced returns, orchestrator result-checking in
`implement-phase.js`, and the phase gate plus end-of-run `/code-review`. **The lead's `Stop`
guard is unaffected.**

## Orchestration pattern: the scheduled nudge

`ScheduleWakeup` is unavailable to subagents but **available to the lead session**, and
`SendMessage` reaches a named background agent with its context intact. Combined, an
orchestrator can actively babysit dispatched background work instead of just hoping a
completion notification arrives — with no timeout mechanism (deliberate).

The shape: **dispatch** subagents in the background
(`Agent({subagent_type, run_in_background: true, name: "be-001", ...})`); **schedule a wake**
before ending the turn (`ScheduleWakeup({delaySeconds: <ETA>, prompt: "..."})`); **on wake,
read the dispatch ledger** rather than relying on remembered context —
`node .claude/hooks/dispatch-ledger.js --open` prints every subagent whose last recorded
event is not `stop`, oldest first (`--json`, `--session <id>`); **nudge anything stalled**
via `SendMessage`; **re-schedule** if work is still in flight, or proceed once everything has
reported in.

`dispatch-ledger.js` runs on **both** `SubagentStart` and `SubagentStop`, appending to
`.trd-state/<feature>/dispatch.jsonl` (or `_dispatch.jsonl` with no active feature) — a hook
cannot schedule the wake itself, so the lead calls `ScheduleWakeup` and the ledger makes that
wake useful. State is the last event per `agent_id`: `start` → running, `stop` → finished;
correlate on `agent_id`, not `prompt_id` (unstable across an agent's lifetime). An agent that
keeps running without progressing never stops, so this pattern — not a stop-time check — is
the only thing that catches it.

---

History and measurements: `FortiumPartners/ensemble-vnext`,
`docs/rules-history/async-discipline.md`.
