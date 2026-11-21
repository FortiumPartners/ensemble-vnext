# Functional Verification Report: check-mergeability-before-wait-ci

**Source PRD**: docs/TRD/check-mergeability-before-wait-ci.md ## Intended Change
**Success definition**: .trd-state/check-mergeability-before-wait-ci/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: All 11 criteria met, including the four must-pass ones (FS-1 to FS-4), in iteration 1.
**Criteria**: 11 total — 11 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 11 of 11 proven — uncovered: none
**Must pass**: 4 of 4 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When GitHub reports a pull request's mergeability as CONFLICTING, `merge-up.js pre-ci` answers `conflicted` | .trd-state/check-mergeability-before-wait-ci/evidence/pre-ci-live.txt | 1 |
| FS-2 | `wait-ci` reads mergeability first (step 0) and, for a CONFLICTING pull request, returns the result `conflicted` without entering the CI wait | .trd-state/check-mergeability-before-wait-ci/evidence/wait-ci-contract-excerpt.txt | 1 |
| FS-3 | When a step returns `conflicted` and its contract carries `redirect-on: conflicted=merge`, the sequencer moves the run's cursor to the next listed `merge` step, skipping the steps between | .trd-state/check-mergeability-before-wait-ci/evidence/sequencer-live-caseAB.txt | 1 |
| FS-4 | When `wait-ci` returns `conflicted` from inside a `merge` step's recovery loop, the sequencer moves the cursor back to that owning `merge` step | .trd-state/check-mergeability-before-wait-ci/evidence/sequencer-live-caseC.txt | 1 |
| FS-5 | When a step returns `conflicted` and no `merge` step is listed to redirect to, the run stops and its stop reason names the result `conflicted` | .trd-state/check-mergeability-before-wait-ci/evidence/sequencer-live-caseAB.txt | 1 |
| FS-6 | When GitHub reports MERGEABLE, `merge-up.js pre-ci` answers `proceed` and `wait-ci` goes on to the CI wait | .trd-state/check-mergeability-before-wait-ci/evidence/pre-ci-live.txt | 1 |
| FS-7 | When GitHub reports UNKNOWN, `merge-up.js pre-ci` answers `poll` and the mergeability read is repeated, neither redirecting to merge nor entering the CI wait on that read | .trd-state/check-mergeability-before-wait-ci/evidence/pre-ci-drive.txt | 1 |
| FS-8 | A pull request that is mergeable but merely BEHIND its base is not redirected: pre-ci does not answer `conflicted` for it and it still goes through the CI wait | .trd-state/check-mergeability-before-wait-ci/evidence/pre-ci-drive.txt | 1 |
| FS-9 | `merge-up.js pre-ci` answers with exactly one of `conflicted`, `proceed`, `poll` or `refused` | .trd-state/check-mergeability-before-wait-ci/evidence/pre-ci-drive.txt | 1 |
| FS-10 | The redirect target comes from the step's contract, not from the sequencer: a contract naming a different target in `redirect-on: conflicted=<target>` sends the cursor to that target | .trd-state/check-mergeability-before-wait-ci/evidence/jest-names.txt | 1 |
| FS-11 | When the conflict reached through this redirect is in a code file, the run still stops at the `merge` step, with record-files' reason as its stop reason | .trd-state/check-mergeability-before-wait-ci/evidence/record-files-names.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._