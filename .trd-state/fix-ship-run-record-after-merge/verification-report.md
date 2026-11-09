# Functional Verification Report: fix-ship-run-record-after-merge

**Source PRD**: docs/TRD/fix-ship-run-record-after-merge.md § Reproduction
**Success definition**: .trd-state/fix-ship-run-record-after-merge/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 6 total — 6 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 6 of 6 proven — uncovered: none
**Must pass**: 6 of 6 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | After a merge stop is recorded and the branch and tracked shipped.json are deleted, start --resume continues the same run at step 3 | .trd-state/fix-ship-run-record-after-merge/evidence/fs1-5-transcript.txt | 1 |
| FS-2 | Recording merge stop with data.merged true moves the run record to a detached copy independent of the tracked file and branch | .trd-state/fix-ship-run-record-after-merge/evidence/fs1-5-transcript.txt | 1 |
| FS-3 | A finished run on old-branch is not loaded by start --resume --branch new-branch: no resumed, status running | .trd-state/fix-ship-run-record-after-merge/evidence/fs1-5-transcript.txt | 1 |
| FS-4 | After FS-3 start, status reports the new running run on new-branch, not old-branch done | .trd-state/fix-ship-run-record-after-merge/evidence/fs1-5-transcript.txt | 1 |
| FS-5 | A custody anchor move made after merge survives deletion of the branch and tracked state dir | .trd-state/fix-ship-run-record-after-merge/evidence/fs1-5-transcript.txt | 1 |
| FS-6 | repro.sh exits 0 | .trd-state/fix-ship-run-record-after-merge/evidence/fs6-repro-run.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

