# Functional Verification Report: ci-fix-sized-to-failure

**Source PRD**: docs/TRD/ci-fix-sized-to-failure.md § Intended Change
**Success definition**: .trd-state/ci-fix-sized-to-failure/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 14 total — 14 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 14 of 14 proven — uncovered: none
**Must pass**: 12 of 12 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `collect-findings` records, on every CI-failure row, a `files` field holding the repo-relative files the failure log points at, exactly as the judge returned them | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs1-collect-findings-excerpt.txt | 2 |
| FS-2 | For TRD work, `fix-findings` routes every open blocking row by running `node .claude/lib/ci-fix-route.js route --state-dir <dir> --trd <trd>` before fixing anything | .trd-state/ci-fix-sized-to-failure/evidence/fs-route-output.txt | 1 |
| FS-3 | For sweep work, `fix-findings` does not route rows through `ci-fix-route.js`; it goes to its step 4 first, as before | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs3-sweep-excerpt.txt | 2 |
| FS-4 | The router returns `direct` for a row whose every file is a test file, as custody's `classifyPath` classifies it (`test-only`) | .trd-state/ci-fix-sized-to-failure/evidence/fs-route-output.txt | 1 |
| FS-5 | The router returns `direct` for a row whose every file is CI configuration (for example `.github/workflows/ci.yml`) | .trd-state/ci-fix-sized-to-failure/evidence/fs-route-output.txt | 1 |
| FS-6 | The router returns `reconcile`, with a reason, for a row pointing at any file that is neither a test file nor CI config — product code, docs or a dependency manifest — including a row that mixes such a file with test files | .trd-state/ci-fix-sized-to-failure/evidence/fs-route-output.txt | 1 |
| FS-7 | A row the classification cannot place is routed `reconcile`, never `direct`: a row with no `files`, and a row with a path that is not a safe repo-relative path (absolute, or escaping the repository with `..`) | .trd-state/ci-fix-sized-to-failure/evidence/fs-route-output.txt | 1 |
| FS-8 | A `[lint]` row is never fixed on the direct path; it keeps the handling it has today | .trd-state/ci-fix-sized-to-failure/evidence/fs-route-output.txt | 1 |
| FS-9 | Direct rows are fixed before any reconcile work, one row at a time, and each passes four checks in order: a clean working tree, an edit by a scoped agent that may refuse, a deterministic diff check, and a judge that sees only the diff | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs9-12-direct-path-excerpt.txt | 2 |
| FS-10 | After the four checks, the affected tests run for a test-file row and `actionlint` runs for a CI-config row | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs9-12-direct-path-excerpt.txt | 2 |
| FS-11 | When a direct row's run passes, its edit is committed by pathspec (only that row's files, not every change in the tree) and the row is resolved `fixed directly at <sha>` with the commit's sha | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs9-12-direct-path-excerpt.txt | 2 |
| FS-12 | When any direct-path step fails — a dirty tree, the agent refusing, the diff check, the judge, or the tests or `actionlint` — all of that row's edits are undone and the row goes to reconcile | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs9-12-direct-path-excerpt.txt | 2 |
| FS-13 | `/implement-trd --reconcile --chained --shipping` runs only when reconcile rows remain, as today; with none remaining it is not called and no whole-branch `/code-review` runs | .trd-state/ci-fix-sized-to-failure/evidence/iter2-fs13-reconcile-excerpt.txt | 2 |
| FS-14 | The `fix-findings` contract text routes a test-only row and a CI-config row to the direct path, whose text names neither `implement-trd` nor `/code-review`, and routes a product-code row to the reconcile path | .trd-state/ci-fix-sized-to-failure/evidence/fs-jest-output.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

