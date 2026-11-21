# Functional Verification Report: narrow-re-proof-after-a-merge

**Source PRD**: docs/TRD/narrow-re-proof-after-a-merge.md ## Reproduction
**Success definition**: .trd-state/narrow-re-proof-after-a-merge/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 6 total — 6 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 6 of 6 proven — uncovered: none
**Must pass**: 3 of 3 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In the reproduction fixture (the feature edits line 1 of `next.config.ts` before the anchor, the base edits line 9, `git merge` merges cleanly), `custody.js reconcile --base origin/main` excuses `next.config.ts`: it is not listed in `differing`, the scope is not `full`, and with no recorded cover naming the file nothing is re-proved (the reverify list does not hold every must-pass criterion) | .trd-state/narrow-re-proof-after-a-merge/evidence/fs-cli-run.txt | 1 |
| FS-2 | In the same cleanly merged case, when a recorded cover names `next.config.ts`, the criteria whose covers name it are re-proved and no other criterion is | .trd-state/narrow-re-proof-after-a-merge/evidence/fs-cli-run.txt | 1 |
| FS-3 | A feature edit to a file after the anchor is not excused: the file still widens the re-proof — the criteria whose covers name it are re-proved, and an edited file no cover names still widens the scope as before | .trd-state/narrow-re-proof-after-a-merge/evidence/fs-cli-run.txt | 1 |
| FS-4 | A file whose merge conflict was resolved by hand is not excused: it still widens the re-proof | .trd-state/narrow-re-proof-after-a-merge/evidence/fs4-conflict-run.txt | 2 |
| FS-5 | The vendored runtime copy `.claude/lib/custody.js`, which `reconcile` is invoked through, shows the same excusing behaviour as `packages/core/lib/custody.js` | .trd-state/narrow-re-proof-after-a-merge/evidence/FS-5.txt | 1 |
| FS-6 | The case not absorbed by this fix — develop's `next.config.ts` pulling in 4 video-ending criteria — is recorded as a skipped test, not silently dropped | .trd-state/narrow-re-proof-after-a-merge/evidence/FS-6.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._