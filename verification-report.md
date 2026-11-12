# Functional Verification Report: block-only-on-material-failures

**Source PRD**: docs/TRD/block-only-on-material-failures.md § Intended Change
**Success definition**: .trd-state/block-only-on-material-failures/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 18 total — 18 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 18 of 18 proven — uncovered: none
**Must pass**: 10 of 10 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `readBlockingPolicy` reads a `## 5c. Blocking policy` section of `verification.md` and returns `{ policy: 'must-pass', status: 'declared' }` for the line `Blocking: must-pass only` and `{ policy: 'all', status: 'declared' }` for `Blocking: all criteria`, each with the line as `raw` | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-2 | When the `## 5c. Blocking policy` heading is absent, the `Blocking:` line is absent, or `verification.md` does not exist, `readBlockingPolicy` returns `policy: 'all'` with `status: 'absent'` | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-3 | Any `Blocking:` value other than the two allowed ones, or a section holding two `Blocking:` lines, makes `readBlockingPolicy` return `status: 'invalid'` (`policy: null`) | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-4 | An invalid blocking value stops verification before the verify-functional workflow is dispatched, and the stop message names the offending line | .trd-state/block-only-on-material-failures/evidence/surface-blocking.txt | 1 |
| FS-5 | Under `Blocking: must-pass only`, with at least one criterion marked must-pass, a run whose only open failures after the inner loop is done (it would exit `stalled` or `stuck`) and the closing regression pass has run are on criteria not marked must-pass, and which has no `unbuilt` criterion, ends `satisfied` | .trd-state/block-only-on-material-failures/evidence/fs5-fs7-jest.txt | 1 |
| FS-6 | The policy takes effect only once the inner loop is done: while the loop is still iterating, a `build-defect` failure on a non-must-pass criterion is still handed to Debug and still re-checked by the closing regression pass, rather than being waved through early | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-7 | A run converted under the must-pass policy carries `nonBlocking: [{ id, reason }]` — one entry per converted failure — in the workflow's result, in the state file and in the report | .trd-state/block-only-on-material-failures/evidence/fs5-fs7-jest.txt | 1 |
| FS-8 | Each `nonBlocking` entry is written to `discovered.jsonl` as a product follow-up row | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-9 | Under `Blocking: must-pass only`, a run that has any `unbuilt` criterion is not converted to `satisfied` | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-10 | Under `Blocking: must-pass only` with no criterion marked must-pass (a sweep file, or a TRD with none marked), a failure on any criterion still keeps the run from `satisfied`, exactly as today | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-11 | A `satisfied` reached by conversion is still subject to the coverage floor (below it the run reports `insufficient-coverage`) and to the must-pass recheck (an unproven must-pass criterion or uncovered must-pass objective yields `must-pass-unproven`), exactly as for any other `satisfied` | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-12 | A failure on a criterion marked must-pass is never converted: a run with an open must-pass `not_met` does not end `satisfied` under `Blocking: must-pass only`, nor under `Blocking: all criteria` | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-13 | Under `Blocking: all criteria`, or with no blocking setting at all, any open `not_met` that is not a settled evidence gap keeps the run from `satisfied`, and the run exits `stalled` or `stuck` exactly as today | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-14 | Under `Blocking: all criteria`, or with no setting, no new key appears: the state file, the report and `decideNext`'s return carry no `nonBlocking` (or other policy) key | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |
| FS-15 | `/verify-build`'s fix rounds treat a failure the run listed as non-blocking as not buildable: it produces no failing discovery row and is not counted in `buildableOpen` | .trd-state/block-only-on-material-failures/evidence/surface-blocking.txt | 1 |
| FS-16 | Authoring guidance carries the four-part definition of a material failure: main user flow broken; data lost or corrupted; private data exposed; money or AI spend charged wrongly | .trd-state/block-only-on-material-failures/evidence/fs16-grep.txt | 1 |
| FS-17 | No prompt asks the Judge to rate a failure (no severity or materiality rating is requested of the Judge) | .trd-state/block-only-on-material-failures/evidence/fs17-grep.txt | 1 |
| FS-18 | The three named Jest suites pass: `packages/core/workflows/verify-functional.test.js`, `packages/core/lib/functional-verification.test.js` and `packages/core/lib/custody.test.js` | .trd-state/block-only-on-material-failures/evidence/jest-three-suites.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

