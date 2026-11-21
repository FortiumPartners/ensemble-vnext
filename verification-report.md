# Functional Verification Report: resolve-mechanical-conflicts-in-place

**Source PRD**: docs/TRD/resolve-mechanical-conflicts-in-place.md ## Intended Change
**Success definition**: .trd-state/resolve-mechanical-conflicts-in-place/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 22 total — 22 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 22 of 22 proven — uncovered: none
**Must pass**: 16 of 16 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | On a scratch fixture repo whose base clashes with the branch in a file graded mechanical, start leaves a real merge in progress with markers in the mechanical files only and returns them | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-1.txt | 1 |
| FS-2 | Every conflicted file start reports carries the class conflict-classifier.js classify gives it | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-2.txt | 1 |
| FS-3 | Record-file clashes are unioned exactly as record-files.js does and not returned for the model | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-3.txt | 1 |
| FS-4 | start refuses on wrong branch, uncontained PR head, or dirty tree, without starting a merge | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-4.txt | 1 |
| FS-5 | check refuses while markers remain, not reporting commit | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-5.txt | 1 |
| FS-6 | check refuses edits outside the hunks; hunk-only edits pass the guard | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-6.txt | 1 |
| FS-7 | check runs lint, typecheck and affected tests, reports them, returns commit when all pass | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-7.txt | 1 |
| FS-8 | checks are spawned with argument arrays (spawnSync), never a shell string | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-8.txt | 1 |
| FS-9 | failing check returns fix under two failed attempts, then stop with STUCK text, no commit | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-9.txt | 1 |
| FS-10 | commit refuses unless the last check passed, makes no commit | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-10.txt | 1 |
| FS-11 | after a passing check, commit makes the merge commit with --no-edit and returns the new head with base as second parent | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-11.txt | 1 |
| FS-12 | no merge-resolve.js subcommand pushes or force-pushes | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-12.txt | 1 |
| FS-13 | the merge contract pushes the resolved merge with a plain git push, no force | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-13.txt | 1 |
| FS-14 | a behavioural clash aborts the merge and returns stuckText STUCK text naming the file plus the resolution entry | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-14.txt | 1 |
| FS-15 | a forbidden clash aborts the merge and returns the STUCK text naming the file plus the entry | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-15.txt | 1 |
| FS-16 | a behavioural or forbidden file beside mechanical files aborts the whole merge | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-16.txt | 1 |
| FS-17 | abort ends an in-progress merge: no MERGE_HEAD, HEAD pre-merge, clean tree | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-17.txt | 1 |
| FS-18 | entry prints files, checks, reproofScope, failedAttempts and outcome for a resolved merge | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-18.txt | 1 |
| FS-19 | entry prints the same five keys for a stopped run | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-19.txt | 1 |
| FS-20 | the merge contract passes entry output as data.resolution on resolved and stopped paths | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-13.txt | 1 |
| FS-21 | vendored copies match their sources | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-21.txt | 1 |
| FS-22 | the new and changed jest suites pass | .trd-state/resolve-mechanical-conflicts-in-place/evidence/fvx1/FS-22.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._