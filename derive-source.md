# Source for success definition: check-mergeability-before-wait-ci


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

