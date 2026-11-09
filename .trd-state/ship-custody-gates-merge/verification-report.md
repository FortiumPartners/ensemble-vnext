# Functional Verification Report: ship-custody-gates-merge

**Source PRD**: docs/TRD/ship-custody-gates-merge.md § Reproduction
**Success definition**: .trd-state/ship-custody-gates-merge/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 13 total — 13 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 13 of 13 proven — uncovered: none
**Must pass**: 11 of 11 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In the reproduction scenario, after the feature branch merges `main`, `custody.js reconcile` does not list `src/b.js` or `src/c.js` (paths whose head content equals the base tip and which the feature did not touch at the anchor) among the differing paths, and does not fail custody because of them | .trd-state/ship-custody-gates-merge/evidence/fs1-5-base-covers-a.txt | 1 |
| FS-2 | When reconcile excuses base-supplied paths, the custody anchor moves to the post-merge head and the move is recorded with the rule `base-merge` | .trd-state/ship-custody-gates-merge/evidence/fs1-5-base-covers-a.txt | 1 |
| FS-3 | After a base merge, a path the feature itself changed after the anchor still counts as differing and still fails custody | .trd-state/ship-custody-gates-merge/evidence/fs1-5-late-covers-a.txt | 1 |
| FS-4 | After a base merge, a path whose content a conflict resolution rewrote (head content differs from the base tip) is not excused and still fails custody | .trd-state/ship-custody-gates-merge/evidence/fs1-5-conflict-covers-b.txt | 1 |
| FS-5 | `.claude/verification-notes.md`, the verifier's own notes file, never appears among the differing paths and never counts as changed shipped code | .trd-state/ship-custody-gates-merge/evidence/fs1-5-base-covers-a.txt | 1 |
| FS-6 | The push step only pushes: it runs no custody reconcile and demands no re-proof before `git push`, so a branch whose custody would fail is still pushed | .trd-state/ship-custody-gates-merge/evidence/fs6-10-contract-text.txt | 1 |
| FS-7 | The merge step runs the custody gate before `gh pr merge`; when the gate fails, `gh pr merge` is not run and the PR stays unmerged | .trd-state/ship-custody-gates-merge/evidence/fs7-live-gate-fails.txt | 1 |
| FS-8 | A merge step whose custody gate passes runs the gate, then the pr-head check, then `gh pr merge`, in that order | .trd-state/ship-custody-gates-merge/evidence/fs8-live-gate-order.txt | 1 |
| FS-9 | A criterion that needs a preview of the pushed head can be proven: when the merge step's first reconcile asks for re-proof, the re-verification runs inside the merge step against the already-pushed head, and a second reconcile then re-anchors custody | .trd-state/ship-custody-gates-merge/evidence/fs9-live-reverify-in-merge.txt | 1 |
| FS-10 | Nothing is committed and nothing is pushed between the custody gate and `gh pr merge`, and the merge names the PR's own head commit, so a merge with `--match-head-commit` is not refused for a head mismatch | .trd-state/ship-custody-gates-merge/evidence/fs10-live-no-commit-match-head.txt | 1 |
| FS-11 | After the PR has merged, the run record `shipped.json` is written under the git common directory as an untracked file, and writing it needs no commit | .trd-state/ship-custody-gates-merge/evidence/fs11-12.txt | 1 |
| FS-12 | `shipped.json` is still read after the merged feature branch is deleted | .trd-state/ship-custody-gates-merge/evidence/fs11-12.txt | 1 |
| FS-13 | A re-verification limited to a subset of criteria (`/verify-build --criteria`) receives the verification plan's owner rulings, so its Judge rules with them | .trd-state/ship-custody-gates-merge/evidence/fs13-criteria-section.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 0 | 0 | 4 | 0 |

_None still open._

