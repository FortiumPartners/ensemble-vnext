# Functional Verification Report: custody-test-all-digit-hash-flake

**Source PRD**: docs/TRD/custody-test-all-digit-hash-flake.md § Reproduction
**Success definition**: .trd-state/custody-test-all-digit-hash-flake/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 7 total — 7 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 7 of 7 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Running the reproduction's loop — 40 consecutive runs of `npx jest packages/core/lib/custody.test.js -t 'deploy link\|merge and deploy links'` — produces 0 failing runs | .trd-state/custody-test-all-digit-hash-flake/evidence/fs1-loop.log | 1 |
| FS-2 | The deploy-link tests no longer depend on the random hash at all: a run in which a test-created commit's 8- or 9-character prefix is all digits still passes, so the fix removes the failure mode rather than making it rarer | .trd-state/custody-test-all-digit-hash-flake/evidence/fs2-tokenOf-demo.txt | 1 |
| FS-3 | `custody.js`'s rule is unchanged: the deploy link of `check` still drops every token with no letter a–f, still fails an identity output holding only all-digit tokens with a reason naming them, and still skips an all-digit token beside a real one | .trd-state/custody-test-all-digit-hash-flake/evidence/fs3-custody-js-diff-lines.txt | 1 |
| FS-4 | Each of the 5 prefix-draw sites still checks what it checked before | .trd-state/custody-test-all-digit-hash-flake/evidence/fs4-custody-test-diff.txt | 1 |
| FS-5 | No deploy-link test was removed, skipped or renamed out of the filter: the filtered run still selects and passes the same 8 tests | .trd-state/custody-test-all-digit-hash-flake/evidence/fs5-filtered-verbose.txt | 1 |
| FS-6 | The whole of `custody.test.js` passes, so the fix to the deploy-link tests broke none of the file's other tests | .trd-state/custody-test-all-digit-hash-flake/evidence/fs6-full-file.txt | 1 |
| FS-7 | The CLAUDE.md known-open line "`custody.test.js` flakes on all-digit commit hashes." is removed, and the other known-open items in that same 4.17.3–4.17.5 entry stay | .trd-state/custody-test-all-digit-hash-flake/evidence/fs7-claude-md.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

