# Functional Verification Report: resume-re-proves-a-moved-pr-head

**Source PRD**: docs/TRD/resume-re-proves-a-moved-pr-head.md § Reproduction
**Success definition**: .trd-state/resume-re-proves-a-moved-pr-head/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 7 total — 7 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 7 of 7 proven — uncovered: none
**Must pass**: 6 of 6 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When the merge step runs in the reproduction scenario, it brings the local branch up to the moved head B before the custody gate, and the gate (`custody.js reconcile ... --head B`) then does not refuse — the step does not return `stop` with "local HEAD has shipped changes not on the PR head (or the PR head has changes not pulled here): src/c.js" | .trd-state/resume-re-proves-a-moved-pr-head/evidence/seam-it1-tests.txt | 1 |
| FS-2 | The merge step waits for CI on the moved head B even though B was pushed by another session rather than by the merge step's own merge-in, and does not reach `gh pr merge` before a CI result for B has been seen | .trd-state/resume-re-proves-a-moved-pr-head/evidence/seam-it1-tests.txt | 1 |
| FS-3 | When CI fails on the moved head B, the merge step does not merge B: it returns `red` naming B as the head, so the run enters the existing red-head fix loop instead of merging or ending STUCK | .trd-state/resume-re-proves-a-moved-pr-head/evidence/seam-it1-tests.txt | 1 |
| FS-4 | When the moved head B has passed CI and the custody gate, the merge step merges it pinned to B: `gh pr merge <pr> --<method> --match-head-commit B` (the new head, not the earlier head A) | .trd-state/resume-re-proves-a-moved-pr-head/evidence/seam-it1-tests.txt | 1 |
| FS-5 | On the moved head B the merge step collects review findings when B's change over the last judged head is more than a base merge, and does not require a findings round when the change is only a base merge | .trd-state/resume-re-proves-a-moved-pr-head/evidence/seam-it1-tests.txt | 1 |
| FS-6 | Each step that judges a head records which head it judged (`wait-ci` and `collect-findings` record the head they ruled on), and a head that `request-review` or `await-approval` merely observed is not treated as judged — so the merge step can tell that B is not the head the run last judged | .trd-state/resume-re-proves-a-moved-pr-head/evidence/seam-it1-tests.txt | 1 |
| FS-7 | Bringing the local branch up to the moved head never discards shipped work: if the local branch holds shipped commits that are not on the PR head, the catch-up does not overwrite them, and the custody gate still refuses that genuine divergence rather than merging | .trd-state/resume-re-proves-a-moved-pr-head/evidence/fs7-scratch-transcript.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

