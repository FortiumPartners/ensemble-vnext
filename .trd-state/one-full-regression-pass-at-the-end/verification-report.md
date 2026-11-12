# Functional Verification Report: one-full-regression-pass-at-the-end

**Source PRD**: docs/plan/one-full-regression-pass-at-the-end.investigation.md
**Success definition**: .trd-state/one-full-regression-pass-at-the-end/success-definition.md
**Outcome**: Satisfied (1 of 19 not verifiable) (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 19 total — 18 met, 0 not met, 1 not verifiable, 0 unbuilt
**Coverage**: 18 of 19 proven — uncovered: FS-19
**Must pass**: 12 of 12 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When the verify-functional workflow's inner loop exits with no build defect left, or at its iteration cap, and a Debug pass in this invocation changed files or criteria are awaiting regression, the workflow runs one regression pass (an Exercise and a Judge) before it returns, in place of the old `confirmAwaiting` step | .trd-state/one-full-regression-pass-at-the-end/evidence/iter1/fs1-full-jest.txt | 1 |
| FS-2 | A settled-met criterion whose covered file appears in the `filesChanged` of a Debug pass at an iteration greater than or equal to its `provenAt` is re-exercised and re-judged by the regression pass | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-2.txt | 1 |
| FS-3 | Every member of a cause the inner loop fixed, still marked `awaiting: "regression"`, is re-exercised and re-judged by the regression pass | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-3.txt | 1 |
| FS-4 | A settled-met criterion that has no entry in `criterionCovers` is re-exercised and re-judged by the regression pass whenever a regression pass runs | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-4.txt | 1 |
| FS-5 | When a Debug pass returned nothing, or returned no `filesChanged` array, its changed files are treated as unknown, and every settled-met criterion proven at or before that pass's iteration is in the regression pass's scope | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-5.txt | 1 |
| FS-6 | A settled-met criterion none of whose covered files changed after its `provenAt` is neither re-exercised nor re-judged by the regression pass, and its verdict, artifact and `provenAt` in `verification-state.json` are byte-for-byte what they were before the pass | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-6.txt | 1 |
| FS-7 | When no Debug pass in this invocation changed anything and nothing is awaiting regression, no regression pass runs: no Exercise or Judge is dispatched after the inner loop exits | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-7.txt | 1 |
| FS-8 | No regression pass runs when the loop exits `unbuilt` or `setup-failure` | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-8.txt | 1 |
| FS-9 | A criterion met in an early iteration whose covered file a later Debug edit changes, and which that edit broke, is ruled `not_met` with kind `build-defect` by the regression pass, receives a cause key and joins the cause map, rather than being left `met` | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-9.txt | 1 |
| FS-10 | A criterion the regression pass re-checks and rules `met` settles again with the regression pass's `provenAt` and a `regression` round marker (1 or 2), not the earlier iteration's | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-10.txt | 1 |
| FS-11 | For every criterion the regression pass re-checked, the verdict, artifact and `provenAt` recorded in `verification-state.json` and in the report are the regression pass's own | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-11.txt | 1 |
| FS-12 | Custody (`packages/core/lib/custody.js`), given a state file written after a regression pass, reads each re-checked criterion's status and artifact from the regression pass's entry | .trd-state/one-full-regression-pass-at-the-end/evidence/iter1/fs12-jest.txt | 1 |
| FS-13 | Build defects the regression pass surfaces go to exactly one further Debug round, outside the iteration cap, and that round is handed only causes holding a regressed or awaiting criterion | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-13.txt | 1 |
| FS-14 | After that one Debug round, at most one more regression pass runs, scoped against that Debug's `filesChanged` plus the ids it was sent; its ruling is final, and no third pass and no further Debug follow, whatever it rules | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-14.txt | 1 |
| FS-15 | Evidence gaps and not-checkable results the regression pass produces are recorded in the state file with their kind and reason and are not sent to Debug or re-walked | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-15.txt | 1 |
| FS-16 | Each regression pass's Judge runs with decide-next's `cap` equal to the iteration so it cannot start remediation, and the full-deploy gate (`computeFinalRun`, `FULL_RUN_COMMAND`) is not re-run: the exit iteration's gate result is copied to the result unchanged | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-16.txt | 1 |
| FS-17 | When criteria still fail after the final regression pass, the run's `exit-stuck` reason names each failing criterion and does not claim the iteration cap was reached when it was not | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-17.txt | 1 |
| FS-18 | The verification report has a "Regression pass" section showing, per round, each criterion re-checked with its reason (covers changed, cause member, or no covers), which were caught as broken, and the settled-met criteria that were not re-walked | .trd-state/one-full-regression-pass-at-the-end/evidence/FS-18.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Kind | Reason |
|----|-----------|------|--------|
| FS-19 | In a headless fixture run where the fix for one cause breaks a criterion met earlier, the report shows the regression pass catching that criterion while untouched met criteria are not re-walked | not checkable here | The fixtures environment is unusable from this session: three attempts at test/smoke/scenarios/verify-regression-pass.sh failed while scaffolding the slot, before any model session ('cp: chmod: ... Operation not permitted' copying framework skills in the sandbox), so no report or verification-state.json was produced. Earlier live runs reached a session but ended inconclusive. The behaviour is covered by the Jest cases for FS-9, FS-6 and FS-18; the live demonstration needs a session that can scaffold a fixture slot. |


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | AMEND-001, AMEND-002, AMEND-003 | FS-1, FS-12 | FS-19 |

| ID | Statement | Status | Cause | Stop reason |
|----|-----------|--------|-------|-------------|
| FS-19 |  |  | unrecorded | not checkable here: the fixture slot could not be scaffolded from this session ('cp: chmod: Operation not permitted' in the sandbox), so the live run never started |

