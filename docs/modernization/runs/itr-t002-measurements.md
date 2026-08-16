# ITR-T002 — live measurement of the reworked `/implement-trd`

Four real headless runs, 2026-08-16, against throwaway scaffolded projects under
`$CLAUDE_JOB_DIR/tmp`. Nothing under `test/smoke/` was modified.

| Run | Fixture | Outcome |
|---|---|---|
| run1 | 2 phases, 3 tasks, one `Replaces` | COMMAND COMPLETE, both phases |
| run2 | deliberately-failing phase | COMMAND STUCK |
| run3 | two tasks colliding on `src/shared.js` | ended early, no banner |
| run4 | **1 phase, 8 independent tasks** | COMMAND COMPLETE, 8/8 |

`run4` exists because runs 1–3 could not test the rework's central claim in either
direction: with three tasks, the fixed per-phase and per-run agent cost is roughly three
times the per-task cost, so the ratio mostly measures fixture size. Sizing a fixture so a
claim *can* fail is part of testing it.

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

## The headline claim — MEASURED, and it holds

**1.0 agent per task.** `run4` (`smoke-measure`, added after the first three runs proved
unable to test this) put **eight independent tasks in one phase**, so per-task cost dominates
the fixed floor. Result: COMMAND COMPLETE, 8/8 tasks success, all 8 modules and 8 tests
produced, fixture `jest` 8/8 green.

```
16 agents total for 8 tasks
   9  workflow-subagent      8 task agents (one wave) + 1
   3  code-reviewer          end-of-run 3-lens fan-out, once per run
   2  general-purpose
   1  verify-app             ┐ per-phase gate
   1  code-simplifier        ┘
```

**The dispatch order is the evidence, not the arithmetic:**

```
W W W W W W W W  verify-app  code-simplifier  W  general  code-reviewer ×3  general
└──── 8 untyped, one wave ────┘ └──────────── gates, then end-of-run review ────────┘
```

Eight untyped agents dispatched first and together, before any typed agent appears. Gate
agents are identifiable because `implement-phase.js` sets `agentType` explicitly; the task
agents are untyped because this fixture's tasks carry no agent hint. Earlier I attributed
task agents by count alone, which was inference; the ordering corroborates it independently.

Against the pre-rework loop's ~5 invocations per task, these 8 tasks would have cost ~40
agents. Fixed overhead was 8 — a floor that is paid once per phase and once per run, and so
amortizes as task count grows. **This is why the earlier 3-task fixtures could not test the
claim in either direction**, and why their raw ratios (5.0, 6.0, 3.0) were not evidence
of anything except fixture size.

**Deviation from the acceptance criterion, recorded rather than glossed:** the AC asks for
the count "from `dispatch.jsonl`" via labels. Labels do not exist (see below), so the count
comes from agent-type plus dispatch ordering. The number is measured; the method is not the
one the AC assumed.

## Measured: `opts.label` never reaches a hook

Every ledger row in `run4` — written with the label-capture fix from `4f03ec2` in place —
came back `label=None` **and** `extra=None`. The `extra` bag was built to report whatever
unrecognised keys *do* arrive; it came back empty, which makes this a definitive negative
rather than a failed guess. The `SubagentStart` payload carries only the known fields.

## Not measured, and why

**Runtime file-collision serialization.** `run3` ended before its collision could be
observed. Design-time serialization is confirmed (see above); the runtime half is not.

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

## Where this leaves the rework

The central claim — ~1 agent per task — is **measured and holds at 1.0**, on a fixture built
so the claim could fail if it were false. Fixed overhead is real but amortizes.

What remains genuinely open is narrower than it was: runtime file-collision serialization,
context isolation, and whole-phase retry. None of those is load-bearing for the rework's
main argument, and each needs a differently-shaped fixture rather than a bigger one.
