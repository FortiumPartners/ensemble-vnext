# Functional Verification Report: ship-build-live-fixes

**Source PRD**: docs/TRD/ship-build-live-fixes.md § Reproduction
**Success definition**: .trd-state/ship-build-live-fixes/success-definition.md
**Outcome**: Stalled (no full-environment run declared)
**Reason**: iteration closed no gaps — remediation is not converging
**Criteria**: 11 total — 10 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 10 of 11 proven — uncovered: FS-8
**Must pass**: 5 of 5 proven
**Diagnosis**: 1 open — 1 locator not found
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The headless reviewer that `request-review tool=claude` starts is permitted to run `gh`: its `claude -p "/code-review <pr-url> --comment"` invocation carries a permission setting that allows `gh`, so a default project's reviewer is not refused on every `gh` call | .trd-state/ship-build-live-fixes/evidence/jest-ship-verbose.txt | 1 |
| FS-3 | A `merge` that follows an `await-approval` park reads the PR's `headRefOid` at merge time and passes that id to `gh pr merge --match-head-commit`, not `context.head`, so a park push that moved the PR head does not make the merge fail with `Head branch was modified` | .trd-state/ship-build-live-fixes/evidence/jest-ship-verbose.txt | 1 |
| FS-4 | Before merging with the re-read head, the merge proves that head's code equals the custody anchor: a difference confined to `.trd-state/` counts as equal and the merge proceeds; a difference in any file outside `.trd-state/` is not proved equal and no merge is run | .trd-state/ship-build-live-fixes/evidence/jest-ship-verbose.txt | 1 |
| FS-5 | When the PR's author is the account this run uses, the `await-approval` wait reason says the PR's author is this run's account and another person must approve, rather than asking the owner to approve their own PR | .trd-state/ship-build-live-fixes/evidence/jest-ship-verbose.txt | 1 |
| FS-6 | `await-approval trigger=github-actions` records `remoteResume: true` only when the repository secret the resume workflow needs (`ANTHROPIC_API_KEY`) is present; when it is absent the run records `remoteResume: false` and adds an ISSUES line saying so | .trd-state/ship-build-live-fixes/evidence/jest-ship-verbose.txt | 1 |
| FS-10 | A `wait-ci` step placed after `merge` waits on the checks of the merge commit, not on the PR's head commit | .trd-state/ship-build-live-fixes/evidence/jest-ship-verbose.txt | 1 |
| FS-11 | When the merge commit's checks fail, the run stops at that post-merge `wait-ci` and the following `release` step does not run | .trd-state/ship-build-live-fixes/evidence/sequencer-direct-fs8-fs11.txt | 1 |
| FS-2 | `request-review tool=claude` recognises a review as the tool's only when all of these hold: its author is the login `gh api user` returns, it is on the PR's current head commit, and it was submitted after this step requested it. A review that fails any one of them is not recognised, and the match is made in code, not by judgment | .trd-state/ship-build-live-fixes/evidence/jest-fs2-fs8-run2.txt | 1 |
| FS-7 | When `fix-findings` chains `/implement-trd <trd> --reconcile --chained --shipping`, any file edited by that build's end-of-run `/code-review high --fix` is committed on the branch before the fix build returns, so no review edit is left uncommitted for the next `push` to miss | .trd-state/ship-build-live-fixes/evidence/fs7-fs9-text-run2b.txt | 1 |
| FS-9 | When `/ship-setup` writes a ship string containing steps that need `autonomy.md`'s standing-authorization sentence and the project's `autonomy.md` lacks that sentence, its readout's ISSUES names the missing sentence and the steps it blocks, rather than ending COMPLETE without saying so | .trd-state/ship-build-live-fixes/evidence/fs7-fs9-text-run2b.txt | 1 |

## Not Met

| ID | Statement | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|--------|--------|---------|----------|
| FS-8 | `/ship-build` start, given a ship string containing `fix-findings` and a TRD with no "Master Task List" heading, returns `ok: false` naming the TRD path and the parser's message, and runs no step (no push, no PR) | fail | Tier 1 failed: the locator text No "Master Task List" heading found in was not found in the artifact (locator-not-found), so the artifact content was not read or credited. The same gap was open last iteration and was not closed. | Evidence locator not found in the artifact two iterations running; likely a locator/artifact text mismatch (quoting or escaping), not a proven build fault. | iter 1: not_met; iter 2: not_met (locator-not-found) |

## Not Verifiable

_None._

