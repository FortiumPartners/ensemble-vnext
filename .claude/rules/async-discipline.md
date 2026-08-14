# Async-discipline rule

**Status:** active. Enforced as a model-judged `Stop` hook (`hookType: "prompt"`, prompt text
at `packages/core/hooks/prompts/async-discipline.prompt.md`) on every `Stop` event — the
platform's own judge evaluates the turn's final message against this rule directly, rather
than a regex matcher inside `async-discipline.js`. That file was deleted in 4.1.11; the
manifest entry keeps `async-discipline.js` as its `file` value, which is now an entry
IDENTIFIER rather than a path — nothing resolves it to disk. See
`docs/TRD/discipline-judgment.md` for the conversion.

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

This rule + the `Stop`-hook guard prevent that pattern structurally — the `Stop` hook is
evaluated by a model judge that reads the turn's final message for a deferral claim and
checks it against the `Stop` payload's `background_tasks` / `session_crons` fields. A claim
with no active async machinery is blocked with a reason instructing the agent to either
dispatch properly or complete the work synchronously.

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
enforces. The commands that spawn teammates (`/harden-trd-team`, `/verify-trd-team`,
`/fix-issue`) still document a Step 2a/3a
"schedule the safety-net wake-up" — it remains recommended there, downgraded from
mandatory.

## How the guard works (at a glance)

```
Stop event fires
   ↓
stop_hook_active == true?         → ALLOW stop unconditionally (loop guard — see below)
   ↓ (false)
judge reads last_assistant_message + payload for a deferral claim
   ↓
no claim?                         → ALLOW stop
claim + background_tasks          → ALLOW stop (real async in flight)
claim + session_crons             → ALLOW stop (scheduled work in flight)
claim + nothing active            → BLOCK stop with a reason explaining the four primitives
```

`stop_hook_active` is the loop guard: `false` the first time a turn reaches this hook, `true`
on any re-entry that followed a block from THIS hook. The judge is instructed to allow
unconditionally on `stop_hook_active: true`, which guarantees at most one corrective
round-trip. The platform's own `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default 8) is a hard
backstop underneath that, not the mechanism this rule relies on. A judge call that errors or
times out resolves to **allow** — the hook never wedges a session on evaluator
unavailability.

## What counts as a violation (judged, not pattern-matched)

The judge reads `last_assistant_message` for an ASSERTION that something will notify or
resume the agent later — however it happens to be phrased — instead of matching a fixed
phrase list. A regex battery used to do this job and it failed in production on a
one-character paraphrase: a real subagent wrote “waiting **on** the monitor event for
completion” and was not caught, because every pattern (and all 24 tests written against
them) used “waiting **for**” — see `docs/TRD/discipline-judgment.md` §1.1. Those patterns
were deleted in 4.1.11; a frozen copy survives only as a scoring fixture at
`test/discipline-corpus/detectors/regex.js`, so the published baseline the judge is measured
against stays reproducible.

### Self-documentation is not a violation

Rule files, TRDs, hook source comments, commit messages, and everyday conversation *about*
this rule are saturated with the exact vocabulary a violation would use — “waiting for”,
“I'll report back”, “come back when done”. The judge distinguishes a live claim
(`last_assistant_message` itself asserting, in the present tense, “I am waiting” / “I will
come back later”) from talk *about* such a claim (a rule file explaining the pattern, a
quoted example, a corrected retelling, a report of what a *different* turn said) by reading
context, not by stripping code spans or quoted strings the way the retired regex matcher
did. When genuinely ambiguous, the judge is instructed to allow: a missed violation is a
bounded, recoverable cost (an idle session someone eventually notices); a judge that leans
toward blocking would eventually block this project's own documentation about the rule,
which makes the project unmaintainable.

### There is no "about to" at `Stop` (added 2026-08-13, third violation shape)

**Scope note:** this clause is deliberately an exception to `docs/TRD/discipline-judgment.md`
§8, which otherwise forbids this conversion from changing what the rules *say*. It changes
what counts as a violation, not just how enforcement works — recorded as an explicit
override, not a silent expansion; see the TRD for the full rationale and the measurements
that motivated it.

The first two claim shapes ("I did X" / "I'm doing X" — past and present tense) were already
covered. A turn can make the identical false claim in future tense and it was, until now, a
blind spot: **"I'm going to dispatch those three now,"** turn ends, nothing dispatched. That
is not a *pending* claim waiting to be fulfilled — the turn is over, so at the moment this
hook fires, the assertion is already false, in exactly the way "I dispatched them" would be.
Confirmed empirically: this exact phrasing was missed three times in one build session before
the clause existed, alongside a control (identical banner prose, dispatch genuinely real) that
the judge correctly allowed — proof the payload check itself works; the gap was that
future-tense claims weren't being checked against it at all.

Judge it the same way as the other two tenses: if the payload would show the asserted action
(a real dispatch in `background_tasks`, a real schedule in `session_crons`) and it is not
there, "I'm about to X" is unbacked exactly like "I did X" or "I'm doing X" would be.

**This must not catch ordinary mid-turn narration.** The judge only ever sees the turn's
FINAL message. "I'm going to read the file" followed, within that same turn, by actually
reading it and reporting the result is completely normal — that intermediate sentence isn't
even what gets evaluated. This clause fires only when the LAST message itself asserts an
action as imminent-and-unstarted and the turn ends right there, contradicted by the payload.
Ambiguous cases (is this stage-setting for something the message goes on to do, or a bare
assertion the turn stops on?) fail open — allow.

## Override

**There is no runtime kill switch, and as of 4.1.11 there is no build-time one either.**
To disable or change this guard, edit `packages/core/hooks/prompts/async-discipline.prompt.md`
(or remove the entry from `hooks.manifest.json`), re-run `generate-hooks-artifacts.sh`, and
deliver the result through the usual `--refresh` channel.

A regenerate-time lever did briefly exist — `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` (D5 /
DISC-B007) regenerated every `hookType: "prompt"` entry as `command`-type, pointing back at
each hook's regex predecessor. It was dropped together with those predecessors in 4.1.11
(`docs/TRD/discipline-judgment.md` §4.4.1) because it never worked outside the development
checkout: the generator prunes `packages/full/hooks/<file>` for prompt-type entries and
`scaffold-project.sh` copies through that directory, so no scaffolded project ever received
the `.js` files the lever pointed at, with or without the variable set. It would have emitted
valid `command` hooks that silently allow everything — a safety net that reports as present
while having no detection logic behind it. Reverting to regex detection is a `git revert` of
4.1.11, not an environment variable.

`ENSEMBLE_ASYNC_DISCIPLINE_DEBUG` and `ENSEMBLE_ASYNC_DISCIPLINE_DISABLE` belonged to the
deleted `async-discipline.js` and no longer exist. A prompt-type hook is evaluated entirely
by the platform, with no code of ours in the loop and no environment in its payload — see
`docs/modernization/probes/U5-kill-switch-mechanism.md` for the proof that no env-var
mechanism of any shape is available to it.

Never set `if` on this hook, or on any `Stop`/`SubagentStop` hook: the field's schema is a
tool-call permission matcher ("Permission rule syntax to filter when this hook runs"), and
`Stop`/`SubagentStop` have no associated tool call for it to match against — any non-empty
`if` on one of these events silently disables the hook unconditionally.

## The SubagentStop counterpart: `subagent-discipline.js`

`async-discipline.js` only runs on `Stop`, so it protects the main session and nothing
else. Subagents fail the same way — three subagents in one observed session ended with
"I'll wait for the monitor notifications to arrive" and "Waiting for background scenario
completions", burning ~240k tokens across 179 tool calls and returning nothing.
`subagent-discipline.js` (registered on `SubagentStop`, right after `status.js`) catches
this in the place `async-discipline.js` never looks. Like `async-discipline.js`, it is now
model-judged (`hookType: "prompt"`, prompt text at
`packages/core/hooks/prompts/subagent-discipline.prompt.md`) rather than driven by a pattern
battery. That battery — and the `.js` files that held it — were deleted in 4.1.11; see
Override, above.

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
- A judge call that errors or times out resolves to **allow** on `SubagentStop` too — same
  as `Stop`; see "How the guard works," above.

**Loop safety.** Blocking forever is worse than the failure being guarded. A subagent
that genuinely cannot proceed must be allowed to stop, with the situation visible in its
final message. The loop guard is the same
`stop_hook_active` precedence check the lead's guard uses: `false` the first time a
turn reaches the hook, `true` on any re-entry that followed a block from THIS hook, and the
judge is instructed to allow unconditionally on `true` — exactly one corrective round-trip,
no persisted state needed (see the bullet list above: `stop_hook_active` is present on
`SubagentStop` too). Unlike the lead's guard, there is no `session_crons` escape valve for a
subagent's own claim (see above), so a subagent still blocked after its one corrective turn
has nothing left to try except stating the blocker plainly and stopping — which the judge is
instructed to allow.

The platform's own `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default 8) is a hard backstop
underneath that, not something the guard relies on.

Before 4.1.11 the command-type `subagent-discipline.js` bounded the loop differently, with a
per-`agent_id` consecutive-block counter persisted to a small JSON file under the OS temp dir
and capped at 2. That file, its counter, and its `ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE` /
`ENSEMBLE_SUBAGENT_DISCIPLINE_DEBUG` env vars no longer exist — `stop_hook_active` reaches
the same bound with no persisted state, which is why the counter was not carried forward.

## Orchestration pattern: the scheduled nudge

`ScheduleWakeup` is unavailable to subagents but **available to the lead session**, and
`SendMessage` reaches a named background agent with its context intact. Combined, these
give an orchestrator a way to actively babysit dispatched background work instead of
just hoping a completion notification arrives — without any timeout mechanism (this
project deliberately does not use timeouts for this; the subagent guard's `stop_hook_active`
bound is a *loop* guard, not a *time* guard).

The shape:

1. **Dispatch** one or more subagents in the background:
   `Agent({subagent_type, run_in_background: true, name: "be-001", ...})`.
2. **Schedule a wake before ending the turn** — this is the same safety-net pairing
   already mandated for `Agent({team_name})` spawns elsewhere in this file:
   `ScheduleWakeup({delaySeconds: <ETA>, prompt: "check on be-001 / fe-001 progress"})`.
3. **On wake, read the dispatch ledger** — do NOT rely on remembering what you
   dispatched. That memory is exactly what compaction destroys, and compaction is the
   case this pattern exists to survive:

   ```bash
   node .claude/hooks/dispatch-ledger.js --open
   ```

   It prints every subagent whose last recorded event is not `stop`, oldest first, with
   how long each has been running. `--json` for machine-readable output, `--session <id>`
   to scope to the current session. Cross-check against `background_tasks` in the
   re-invocation payload rather than assuming silence means either "done" or "stuck."
4. **Nudge anything that looks stalled**: `SendMessage({to: "<agent_id>", message:
   "status check — what have you completed and what's blocking you?"})`. The agent
   resumes with its full context; the nudge is informational, not a kill switch.
5. **Re-schedule another wake** if work is still in flight, or proceed once everything
   has reported in.

### The dispatch ledger

`dispatch-ledger.js` runs on **both** `SubagentStart` and `SubagentStop` and appends to
`.trd-state/<feature>/dispatch.jsonl` (or `.trd-state/_dispatch.jsonl` with no active
feature). It exists because a hook **cannot** schedule the wake for you: hooks are
separate processes with no tool surface, and `SubagentStart` is command-type only — a
prompt-type hook there is rejected outright. The lead must still call `ScheduleWakeup`
itself. What the ledger does is make that wake *useful*.

Two facts, both established by probing the live payloads rather than reading the docs:

- **There is no `name` field on either event — but the name is not lost.** Corrected
  2026-08-13, after the 4.1.8 notes claimed the name "never reaches a hook": it does,
  through `agent_type`. That field carries the **name** when one was given
  (`Agent({name: "be-001"})` → `agent_type: "be-001"`) and the actual subagent type when
  one was not (`agent_type: "general-purpose"`). So a named dispatch trades the type away
  for the name; there is no payload in which both appear.

  The ledger still keys on `agent_id`, and that is still right: `agent_id` is stable and
  unambiguous, whereas the CLI changelog records `SendMessage` misrouting when a
  re-spawned agent reused a previous agent's name. But `--open`'s `type=` column is
  therefore showing the name for named agents, which is misleading labelling rather than
  a wrong key.
- **`prompt_id` is not stable across an agent's lifetime.** A live run produced a `stop`
  row whose `prompt_id` differed from its own `start` row. Correlate on `agent_id` only.

State is the last event per `agent_id`: `start` → running, `stop` → finished, `blocked`
→ running. **No `blocked` row is currently written.** The compensating-row logic
(`recordBlockInLedger`) lived inside `subagent-discipline.js`'s own JS `main()`, which
stopped executing when the hook became model-judged — the platform evaluates the prompt
directly and no code of ours runs — and that file was deleted outright in 4.1.11. A judge
block on `SubagentStop` therefore lets `dispatch-ledger.js` (order 3, still command-type,
runs after) write its `stop` row exactly as if the subagent had actually finished, because
nothing tells it otherwise. **This is a known gap introduced by the conversion to
`hookType: "prompt"`, not yet closed**: `--open`'s output cannot be trusted to distinguish
"genuinely finished" from "blocked and resumed". Cross-check against the session transcript
or `background_tasks` if that distinction matters, until the gap is closed.

This is the lead-session mirror of what the `SubagentStop` guard enforces from the
hook side: a subagent is never allowed to just claim it'll check back later, and the
orchestrator is never left purely hoping a notification arrives — it actively re-checks
and nudges. Neither side relies on a timer; both rely on an explicit re-entry point
(`ScheduleWakeup` for the lead, the `stop_hook_active` bound for the subagent).

**What this still does not cover.** The `SubagentStop` guard only fires when an agent
*stops*. An agent that keeps running without progressing never stops, so nothing blocks
it — the ledger plus a scheduled nudge is the only thing that reaches that case. That is
the whole reason the ledger exists rather than being another hook guard.
