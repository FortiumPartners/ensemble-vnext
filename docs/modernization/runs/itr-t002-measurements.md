# ITR-T002 — live measurement of the reworked `/implement-trd`

Three real headless runs, 2026-08-16, against throwaway scaffolded projects under
`$CLAUDE_JOB_DIR/tmp`. Nothing under `test/smoke/` was modified.

| Run | Fixture | Outcome |
|---|---|---|
| run1 | 2 phases, 3 tasks, one `Replaces` | COMMAND COMPLETE, both phases |
| run2 | deliberately-failing phase | COMMAND STUCK |
| run3 | two tasks colliding on `src/shared.js` | ended early, no banner |

Every claim below is marked `[ran]` or `[read]`. **Items that could not be measured say so
rather than carrying an inferred number** — this TRD exists because inferred numbers got
believed.

## Measured

**`Replaces` is obeyed, including the orphaned test — `[ran]`.** The strongest result here.
`src/foo.js` was added by the phase-1 checkpoint `fce359f` and deleted by the phase-2
checkpoint `795cb2a`, *in the same commit that added its replacement* `src/combined.js`.
`src/foo.test.js` went with it.

Checked as a deletion in git history, not as file-absence — "absent" would also be satisfied
by a file that was never created, which is the failure this check would otherwise miss:

```
git log --diff-filter=A -- src/foo.js   → fce359f  (phase 1)
git log --diff-filter=D -- src/foo.js   → 795cb2a  (phase 2)
```

A `Replaces` line that removes an implementation and strands its tests is the failure mode.
It did not happen.

**Per-phase review runs and produces findings — `[read]`.** Both checkpoints in
`implement.json` carry a review record: phase 1 → 3 findings, phase 2 → 5 findings. Review is
per-phase, not per-task, which is what the rework intended.

**Phases checkpoint as whole units — `[read]`.** `phase_cursor: 3` after two phases; all
three tasks `status=success`, `cycle=complete`, `retry_count=0`.

**Task scope held — `[ran]`.** run2's tasks left `src/impossible.test.js` untouched and
created no `package.json`, both Non-Goals of that fixture.

**Design-time serialization is correct — `[ran]`.** `task-graph.js` computes waves
`[[CX-001],[CX-002]]` for two tasks both touching `src/shared.js`. The *runtime* claim is
separate and is not measured (see below).

## Not measured, and why

**Agent invocations per task.** The headline claim (~1 per task against a ~5 baseline) is
**untested — neither confirmed nor refuted.** Two independent reasons:

1. **The ledger cannot attribute an agent to a task.** Every agent dispatched inside a
   workflow records `agent_type: "workflow-subagent"`, so per-task agents and per-phase gate
   agents are indistinguishable. The acceptance criterion — *"measure agent invocations per
   task from `dispatch.jsonl`"* — is not satisfiable as the ledger was written. Fixed in
   `4f03ec2` (label capture + an `extra` bag that reports the real payload shape on the next
   run); the fix cannot retroactively label these runs.

2. **The fixtures are too small to carry the signal, which is my error in approving them.**
   Raw totals were 15 agents / 3 tasks, 12 / 2, and 6 / 2 — but that metric conflates three
   different costs. `implement-phase.js` dispatches one agent per task, *plus* three fixed
   per-phase gate agents (`verify-app` → `code-simplifier` → review), *plus* a three-lens
   `code-reviewer` fan-out once per run. On a 3-task fixture the fixed floor is roughly three
   times the variable part; on a 19-task TRD it amortizes to near nothing. A fixture whose
   per-task cost dominates is required, and does not exist yet.

**Whether only phase-level results reach orchestrator context.** Not established from the
transcripts.

**Foreground/background status of the per-phase review.** The review is recorded, but its
execution mode was not measured — and the ledger's known missing `blocked` row means an
inference from it would not be sound.

**Whole-phase retry.** run2 reached COMMAND STUCK, which is plausible for a
deliberately-failing phase, but the retry-whole-phase-from-`implement.json` behaviour was not
confirmed. run3 ended before its collision could be observed at runtime.

## Defects found

1. **`current.json` was dropped by the rework** — zero references in the 908-line command.
   All three runs produced a populated `implement.json` beside an all-null `current.json`.
   Degrades silently: the ledger falls back to `_dispatch.jsonl` and keeps recording,
   `NOTIFY_FEATURE` goes empty, the SessionStart banner cannot answer "what are we working
   on". Fixed in `4f03ec2` (Step 1.3a).

2. **The ledger could not answer its own acceptance criterion** — see above. Fixed in
   `4f03ec2`.

3. **The TRD contradicts itself.** §4.5:721 asserts `ITR-B015` extended the fixture to
   multi-task/multi-phase; `ITR-B015`'s own row and grounding at §4.5:701 scope it to a
   bullet-list→table conversion. Both `/refine-trd` and `/audit-trd` passed over it — every
   verifier in the wave traverses *outward* (source→TRD, task→objective, citation→target) and
   none compares two rows of the same document. Logged in the improvement plan.

4. **A subagent's idle notification is a turn boundary, not a stopped agent.** Subagents have
   no primitive that blocks and waits, so dispatch-then-end-turn is their only shape. This
   orchestrator misread it as an agent that had given up. Logged in the improvement plan.

## What would close the gap

One fixture with enough tasks per phase that per-task cost dominates the fixed floor, run
after `4f03ec2` so the ledger carries labels. That single run answers the headline question
and the context-isolation question together. Until then the rework's central claim is
**plausible and unmeasured**, which is a different thing from supported.
