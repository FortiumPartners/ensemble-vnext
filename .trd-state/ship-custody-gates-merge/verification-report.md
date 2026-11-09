# Functional Verification Report: ship-custody-gates-merge

**Source PRD**: docs/TRD/ship-custody-gates-merge.md § Reproduction
**Success definition**: .trd-state/ship-custody-gates-merge/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass criteria not proven: FS-7, FS-8, FS-9, FS-10 — the core was not shown to work
**Criteria**: 13 total — 9 met, 0 not met, 4 not verifiable, 0 unbuilt
**Coverage**: 9 of 13 proven — uncovered: FS-7, FS-8, FS-9, FS-10
**Must pass**: 7 of 11 proven — unproven: FS-7 (not verifiable), FS-8 (not verifiable), FS-9 (not verifiable), FS-10 (not verifiable)
**Diagnosis**: 4 open — 4 environment not reachable
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In the reproduction scenario (src/a.js changed on the feature branch at the anchor; main then adds src/c.js and changes src/b.js; the feature branch merges main and commits .claude/verification-notes.md), after the merge `custody.js reconcile` (with --base) does not list src/b.js or src/c.js among the differing paths, and does not fail custody because of them | .trd-state/ship-custody-gates-merge/evidence/fs1-5-base-covers-a.txt | 1 |
| FS-2 | When reconcile excuses base-supplied paths, the custody anchor moves to the post-merge head and the move is recorded with the rule base-merge | .trd-state/ship-custody-gates-merge/evidence/fs1-5-base-covers-a.txt | 1 |
| FS-3 | After a base merge, a path the feature itself changed after the anchor still counts as differing and still fails custody | .trd-state/ship-custody-gates-merge/evidence/fs1-5-late-covers-a.txt | 1 |
| FS-4 | After a base merge, a path whose content a conflict resolution rewrote (head content differs from the base) is not excused and still fails custody | .trd-state/ship-custody-gates-merge/evidence/fs1-5-conflict-covers-b.txt | 1 |
| FS-5 | .claude/verification-notes.md, the verifier's own notes file, never appears among the differing paths and never counts as changed shipped code | .trd-state/ship-custody-gates-merge/evidence/fs1-5-base-covers-a.txt | 1 |
| FS-6 | The push step only pushes: it runs no custody gate (no reconcile that can stop it, no re-proof) before git push, so a branch whose custody would fail is still pushed | .trd-state/ship-custody-gates-merge/evidence/fs6-10-contract-text.txt | 1 |
| FS-11 | After the PR has merged, the run record shipped.json is written under the git common directory as an untracked file, and writing it needs no commit | .trd-state/ship-custody-gates-merge/evidence/fs11-12.txt | 1 |
| FS-12 | shipped.json is still read after the merged feature branch is deleted | .trd-state/ship-custody-gates-merge/evidence/fs11-12.txt | 1 |
| FS-13 | A re-verification limited to a subset of criteria (/verify-build --criteria) receives the verification plan's owner rulings, so its Judge rules with them | .trd-state/ship-custody-gates-merge/evidence/fs13-criteria-section.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-7 | The merge step runs the custody gate before gh pr merge; when the gate fails, gh pr merge is not run and the PR stays unmerged | Needs a live /ship-build merge step against a GitHub pull request (transcript with gh pr merge / gh pr view). No GitHub repository environment is declared in verification.md section 1 (only local, fixtures, claude-artifacts, and production, which must not be touched), so it cannot be exercised here. The merge contract text (packages/core/contracts/ship-primitive-merge.md, ship-custody-gate.md) does instruct this behaviour, but contract text is not the transcript this criterion asks for. |
| FS-8 | A merge step whose custody gate passes runs the gate, then the pr-head check, then gh pr merge, in that order | Needs a live /ship-build merge step against a GitHub pull request (transcript with gh pr merge / gh pr view). No GitHub repository environment is declared in verification.md section 1 (only local, fixtures, claude-artifacts, and production, which must not be touched), so it cannot be exercised here. The merge contract text (packages/core/contracts/ship-primitive-merge.md, ship-custody-gate.md) does instruct this behaviour, but contract text is not the transcript this criterion asks for. |
| FS-9 | A criterion that needs a preview of the pushed head can be proven: when the merge step's first reconcile asks for re-proof, the re-verification runs inside the merge step against the already-pushed head, and a second reconcile then re-anchors custody | Needs a live /ship-build merge step against a GitHub pull request (transcript with gh pr merge / gh pr view). No GitHub repository environment is declared in verification.md section 1 (only local, fixtures, claude-artifacts, and production, which must not be touched), so it cannot be exercised here. The merge contract text (packages/core/contracts/ship-primitive-merge.md, ship-custody-gate.md) does instruct this behaviour, but contract text is not the transcript this criterion asks for. |
| FS-10 | Nothing is committed and nothing is pushed between the custody gate and gh pr merge, and the merge names the PR's own head commit, so a merge with --match-head-commit is not refused for a head mismatch | Needs a live /ship-build merge step against a GitHub pull request (transcript with gh pr merge / gh pr view). No GitHub repository environment is declared in verification.md section 1 (only local, fixtures, claude-artifacts, and production, which must not be touched), so it cannot be exercised here. The merge contract text (packages/core/contracts/ship-primitive-merge.md, ship-custody-gate.md) does instruct this behaviour, but contract text is not the transcript this criterion asks for. |

