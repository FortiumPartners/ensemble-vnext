# Product check: Ensemble main after "Ship graded merge" (report-only)

Checked: `origin/main` at `52f28b75` (merge of PR #199), fresh clone, `npm ci`, Node v26.12.0, 2026-11-21.
Baseline: tag `v4.17.11` (`62648fe8`), checked out as a second worktree. Nothing in the owner's working tree was changed; nothing committed.

**Verdict: not releasable as 4.17.12 yet.** One new test failure on main (the shipped-hashes list lacks `v4.17.11`, 2 BATS tests) and the CHANGELOG's `[Unreleased]` section omits PR #189's three fixes. Both are small; every other check is clean.

## 1. Results

| Check | Result | New on main? |
|---|---|---|
| Jest (`npx jest --ci`, 137 suites) | 136 suites pass; 5566 tests pass, 2 skipped; **1 suite fails to load** (`packages/core/hooks/status.test.js`) | No: fails identically on v4.17.11 |
| pytest (`packages/router/tests`) | 138 passed | n/a |
| BATS `packages/core` (6 files, 413 tests) | 411 pass, **2 fail** (`rebase-engine.test.sh` tests 216 and 221) | **Yes**: both pass on v4.17.11 |
| BATS `test/integration/tests` (9 files) | 148 of 148 pass | n/a |
| `check-version-sync.sh` | OK, all four manifests at 4.17.11 | n/a |
| `generate-hooks-artifacts.sh --check` | exit 0 | n/a |
| `generate-shipped-hashes.sh --check` | **fails** (see failure B) | Yes |
| Packaging: `packages/full/lib` against `packages/core/lib` | every non-test library file is linked; the only files absent are `__fixtures__/` test data; no broken links in `packages/full` | n/a |
| Packaging: `workflows` | `packages/full/workflows` is a symlink to the whole `packages/core/workflows` directory, so nothing can be missed | n/a |
| Packaging: references from commands, skills, hooks and workflows | 31 distinct `.claude/lib/*` and `.claude/workflows/*` paths referenced; all 31 resolve under `packages/full` (including `merge-resolve.js`, the #196 gap) | n/a |
| CHANGELOG `[Unreleased]` | 5 of 6 PRs present; **PR #189 absent**; no caveat issues listed (see section 3) | Yes |

Not run: `check-test-suites.sh` and `check-jest-known-failing.sh` (CI-bookkeeping scripts; the first timed out at 120s and was left to finish in the background). `generate-*-artifacts --check` was run for hooks only; no other `generate-*-artifacts` script exists in `packages/core/scripts` (the other generator is `generate-shipped-hashes.sh`).

## 2. Failures, exact output

### A. `packages/core/hooks/status.test.js` fails to load (pre-existing, not new)

```
FAIL packages/core/hooks/status.test.js
  ● Test suite failed to run
    TypeError: Cannot read properties of undefined (reading 'read')
      12 | 'use strict';
      13 |
    > 14 | const mockFs = require('mock-fs');
         |                ^
      at Object.<anonymous>.exports.patchReadFileContext (node_modules/mock-fs/lib/readfilecontext.js:40:30)
      at Object.<anonymous> (packages/core/hooks/status.test.js:14:16)
Tests: 0 total
```

Same output on v4.17.11. The error is inside the `mock-fs` library at import time, which points at that library not supporting this machine's Node v26.12.0 (not confirmed against the CI Node version, which this check did not read). `CLAUDE.md` says CI excludes only `discovered.test.js`, so this may also fail in CI; I did not check.

### B. `rebase-engine.test.sh` tests 216 and 221 (NEW on main; both pass on v4.17.11)

```
not ok 216 generate --check: exits 0 on the committed files
# (in test file packages/core/scripts/rebase-engine.test.sh, line 260)
#   `[ "$status" -eq 0 ]' failed
not ok 221 generate --check: a retired entry covers a listed path no render ships
# (in test file packages/core/scripts/rebase-engine.test.sh, line 316)
#   `[ "$status" -eq 0 ]' failed
```

Cause, from running the script directly (`packages/core/scripts/generate-shipped-hashes.sh --check`):

```
structure: ok
coverage: ok
shipped-hashes: newest v* tag merged into HEAD is v4.17.11, but the list's newest is v4.17.10; run: generate-shipped-hashes.sh --append v4.17.11
history: checked
```

`packages/core/templates/shipped-hashes.json` has no `v4.17.11` entry. On the v4.17.11 tag the check passes only because that tag is HEAD itself, which the script does not require in the list. On main, `v4.17.11` is an older commit, so it is required. The 4.17.11 release did not append its own hashes. This is a release-bookkeeping omission, not a defect in any of the six PRs. The script's own message gives the fix (`--append v4.17.11`); I did not run it.

## 3. CHANGELOG `[Unreleased]` against the six PRs

| PR | Title | In CHANGELOG? | Accurate? |
|---|---|---|---|
| #189 | Fix stop-check scope, audit over uncoverable requirements, verify identity re-check | **No.** Nothing in `[Unreleased]` mentions the stop-check scope fix, the audit's uncoverable-requirement fix or the identity re-check after each Exercise pass | n/a |
| #191 | Check mergeability before `wait-ci` | Yes, under Fixed (issue #136) | Yes; matches the PR title |
| #192 | Narrow re-proof after a merge | Yes, under Fixed (custody paragraph) | Yes; the `next.config.ts` skipped test exists (`custody.test.js:1466`) |
| #193 | Conflict classifier and stop rules | Yes, under Added | Yes; the 500-line-per-side limit (`MAX_LINES = 500`) and the `.claude/rules/` stop (`rules-file`) are in `conflict-classifier.js` |
| #196 | Resolve mechanical conflicts in place | Yes, under Added; its packaging fix is named | Yes; `ensemble.mergeChecks` is read in `merge-resolve.js` |
| #199 | Document the graded merge | Yes: the guide link and the Storybook note | Yes |

The CHANGELOG cites only the issue numbers #97 and #136 and PR #196. It names none of the five open caveat issues, and the PR numbers #189, #191, #192, #193 and #199 do not appear. The live-proof section does state three of #197's caveats in prose (package not exercised, narrowed re-proof not shown, checks need configuration).

| Open issue | Caveat | In CHANGELOG? |
|---|---|---|
| #190 (PR #189) | standalone `/audit-build` has no coverage figure; stop-check production/credentials change untested on real violations | No (PR #189 itself is missing) |
| #194 (PR #191) | TRD unchecked against roadmap; two untested branches; not proven on real GitHub | No |
| #195 (PR #193) | TRD unchecked against roadmap; not proven on a real conflict | No (the live proof covers the second point in prose) |
| #197 (PR #196) | roadmap unchecked; narrowed re-proof not shown live; checks need configuration; local `shipped.json` stale after merge; fixture sessions load this repo's rules (154.6k characters) | Partly: three of five in the live-proof section |
| #198 | a docs-only `/plan --implement` leaves no TRD, so neither close path works | No |

## 4. Follow-ups (for the owner; none acted on)

1. Append `v4.17.11` to `packages/core/templates/shipped-hashes.json` (turns tests 216 and 221 green) before cutting 4.17.12, and make the release step do it.
2. Add PR #189's three fixes to `[Unreleased]`.
3. Decide whether the CHANGELOG should list the open caveat issues (#190, #194, #195, #197, #198) beside the entries they belong to.
4. `status.test.js` fails to load on Node v26.12.0; decide whether it is a known CI exclusion or needs `mock-fs` updated.
