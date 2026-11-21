# TRD: check-mergeability-before-wait-ci

**Source PRD**: None — change decided in the ship-graded-merge roadmap, item 2 (issue #136)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A PR GitHub reports CONFLICTING never enters the CI wait; the run goes to the merge step | roadmap item 2, 2026-11-21 | yes |
| O2 | MERGEABLE goes on to the CI wait; UNKNOWN polls | roadmap item 2, 2026-11-21 | |

## Intended Change

`merge-up.js pre-ci` answers conflicted / proceed / poll / refused. `wait-ci` runs it first (step 0) and returns the new result `conflicted`. The sequencer's new contract key `redirect-on: conflicted=merge` moves the cursor to the next listed `merge` step (or back to the owning `merge` step from inside its recovery loop); with none listed the run stops naming the result.

## Decision

Only CONFLICTING redirects: a merely BEHIND head still gets CI. The sequencer stays primitive-blind (the target is named in the contract). A code-file conflict reached this way still stops at the merge step with record-files' reason.

## Non-Goals

Resolving code conflicts in place (to come, item 3).

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | pre-ci check, wait-ci step 0, redirect-on, tests | O1, O2 | None | stubbed gh: CONFLICTING→conflicted, MERGEABLE→proceed, UNKNOWN→poll; sequencer redirects; ship-primitives tests pass |
| AMEND-001 | [test-gap] Add a sequencer test for the loop-owner redirect: wait-ci records conflicted inside the recovery loop of the redirect-target step; cursor returns to the owner with pass+1. — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/lib/ship-sequencer.js record() ~954-957; ship-sequencer.test.js fixture redirect target lima is not loop owner kilo (lines 34,40,357-402)) | amendment — no objective recorded | None | [test-gap] Add a sequencer test for the loop-owner redirect: wait-ci records conflicted inside the recovery loop of the redirect-target step; cursor returns to the owner with pass+1. no longer holds |
| AMEND-002 | [test-gap] Assert wait-ci's poll handling on pre-ci poll (re-poll up to 8 times 15s apart, then proceed) in the contract prose test. — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: merge-up.test.js:108; ship-primitive-wait-ci.md step 0; ship-primitives.test.js:413-419) | amendment — no objective recorded | None | [test-gap] Assert wait-ci's poll handling on pre-ci poll (re-poll up to 8 times 15s apart, then proceed) in the contract prose test. no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/merge-up.js`, `packages/core/lib/ship-sequencer.js`, `packages/core/contracts/ship-primitive-wait-ci.md`
- **Reuse:** `decide`'s gh read and polling convention [read]
- **Replaces:** nothing
- **Follow:** contract front-matter keys parsed in loadPrimitives [read]
- **Careful:** .claude/ copies must stay byte-identical (tested) [ran]

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

### AMEND-002

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

Rewritten by /audit-build, 2026-11-21. Everything else this TRD claims was checked against the delivered code and tests.

| Claim | Why it was not verified |
|-------|-------------------------|
| The objectives match what the ship-graded-merge roadmap (item 2) asked for | No PRD or roadmap text was supplied to the audit, so the TRD was checked only against the code, never against its source: whether O1/O2 say what was wanted, and whether anything asked for was left out, is unchecked. |
| Issue #136 is the provenance of this change (also cited at `packages/core/lib/merge-up.js` line 28) | The issue lives on GitHub, not in this repository; the citation is consistent but was not opened. |
| GitHub starts no `pull_request` CI run for a PR that conflicts with its base, and a real conflicting PR is redirected to the merge step end to end | Platform behaviour and a live `/ship-build` run were out of scope for a code audit; the `github-live-test` environment in `.claude/rules/verification.md` is where it could be exercised. |
