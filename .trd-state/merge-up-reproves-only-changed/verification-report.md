# Functional Verification Report: merge-up-reproves-only-changed

**Source PRD**: docs/TRD/merge-up-reproves-only-changed.md §Intended Change
**Success definition**: .trd-state/merge-up-reproves-only-changed/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 11 total — 11 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 11 of 11 proven — uncovered: none
**Must pass**: 7 of 7 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | On a base-only change, a must-pass criterion with no covers record is not affected: `affectedIds` keeps its proof (`reused`) instead of re-proving it | .trd-state/merge-up-reproves-only-changed/evidence/iter1-custody.json | 1 |
| FS-2 | On a base-only change, a must-pass criterion with a covers record is affected exactly when one of its covered files is among the excused paths (files differing between the old and new merge base that the feature never touched before the anchor); one whose covered files are all outside them is reused | .trd-state/merge-up-reproves-only-changed/evidence/iter1-custody.json | 1 |
| FS-3 | When a shipped (feature-side) path also differs, a must-pass criterion with no covers record is still affected (OQ-2 unchanged) | .trd-state/merge-up-reproves-only-changed/evidence/iter1-custody.json | 1 |
| FS-4 | A must-pass objective that no criterion names (`cov.uncovered`) stays affected on every change, a base-only change included | .trd-state/merge-up-reproves-only-changed/evidence/iter1-custody.json | 1 |
| FS-5 | `reconcile`, given `--base` with the base taken in, reports `mergeBases: {old, new}` beside `excused`, where `new` is the base commit the head took in and `old` is `git merge-base <anchor> <new>` | .trd-state/merge-up-reproves-only-changed/evidence/iter1-custody.json | 1 |
| FS-6 | `mergeBases` is present even when nothing shipped differs, i.e. when `compare()` returns early | .trd-state/merge-up-reproves-only-changed/evidence/iter2-custody-fs6.json | 2 |
| FS-7 | `packages/core/lib/merge-up.js` decides from `gh pr view <pr> --json state,mergeable,mergeStateStatus`: state `MERGED` → `skip`; `mergeable` `UNKNOWN` → `poll`; `CONFLICTING` → `merge-in`; `MERGEABLE` with `mergeStateStatus` `BEHIND` → `merge-in`; any other → `skip` | .trd-state/merge-up-reproves-only-changed/evidence/iter1-merge-up.json | 1 |
| FS-8 | The merge contract's step 1 (`ship-primitive-merge.md`) calls `merge-up.js` to decide whether to merge the base in, instead of reading `mergeable` itself | .trd-state/merge-up-reproves-only-changed/evidence/iter1-ship-primitives.json | 1 |
| FS-9 | Played end to end on a fixture repository (bare origin, stubbed `gh`), a merge-up whose base changes touch none of the feature's covered files makes the custody gate re-prove no criterion (no `reverify`), re-anchor custody once (one `base-merge` move), and go on to `gh pr merge` in the same pass, with no second resume and one push | .trd-state/merge-up-reproves-only-changed/evidence/iter1-ship-build.seam.json | 1 |
| FS-10 | In the same seam setting, a merge-up whose base changes touch a covered file makes the gate re-prove exactly the must-pass criteria covering that file and reuse the rest | .trd-state/merge-up-reproves-only-changed/evidence/iter1-ship-build.seam.json | 1 |
| FS-11 | In the same seam setting, the merge step merges the base in only when the stubbed `gh` reports the PR `CONFLICTING`, or `MERGEABLE` with `mergeStateStatus` `BEHIND`; for any other report it merges the PR as it is, without merging the base in | .trd-state/merge-up-reproves-only-changed/evidence/iter1-ship-build.seam.json | 1 |

## Not Met

_None._

## Not Verifiable

_None._

