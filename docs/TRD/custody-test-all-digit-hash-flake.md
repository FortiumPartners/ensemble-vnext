# TRD: custody-test-all-digit-hash-flake

**Source PRD**: None — defect (owner's bug report, 2026-11-12)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every test in `packages/core/lib/custody.test.js` that feeds a commit-hash prefix to the deploy link as a build token passes on every run, whatever digits the random commit hash happens to start with, while still checking the same behaviour it checks today | the reproduction below; owner's bug report, 2026-11-12 | |
| O2 | CLAUDE.md no longer lists "custody.test.js flakes on all-digit commit hashes" as known-open | owner's bug report, 2026-11-12 | |

## Reproduction

### Steps

```
for i in $(seq 1 40); do
  npx jest packages/core/lib/custody.test.js -t 'deploy link|merge and deploy links' || echo FAIL
done
```

(Filtered to the deploy-link tests because the whole file takes about 78s per run; the filter
keeps every test that builds a token from a hash prefix.)

### Actual

3 of 40 runs failed [ran 2026-11-12]. Failing tests seen: "skips an all-digit token and
passes on the real one beside it" (twice) and "passes when a token (git describe form)
resolves to a code-equal commit" (once, line 1095 — a fourth instance the bug report did not
list). The owner's report measured 3 of 21 on the full file, and CI failed three times on
PRs #125 and #127 (CI printed the token `20120044`).

### Expected

0 of 40 runs fail.

### Root cause [ran]

`custody.js:830-832` (the deploy link of `check`) drops every token that has no letter a–f,
because an all-digit token is a number (a count, a date), not a commit. That rule is correct
and stays. The tests build tokens with `sha.slice(0, 8)` (or `slice(0, 9)` after `g`) from a
commit created during the test, so its hash is random: the chance an 8-character prefix is
all digits is (10/16)^8 ≈ 2.3%, and for 9 characters ≈ 1.5%. Five prefix draws whose outcome
matters (lines 914, 1095, 1102, 1104, 1111) give ≈ 11–13% per run, matching the ~14%
measured. Line 917 also slices a prefix, but it expects `ok: false`, so an all-digit token
fails it the same way and it does not flake; it uses the helper anyway for consistency.

## Decision

Add one helper in the test file, `tokenOf(sha, n)`: the shortest prefix of `sha` that is at
least `n` characters long and contains a letter a–f; the full sha if it has no letter at all
(probability ≈ 10⁻⁸). Replace every `.slice(0, n)` that builds a deploy-link token with it
(lines 914, 917, 1095, 1102, 1104, 1111). A prefix stays short in practice (usually exactly
`n`), still names the same commit, and still goes through the deploy link's token parsing and
commit resolution, so each test checks what it checked before.

Rejected: retrying commit creation until the prefix has a letter — it changes the commits the
tests make (extra commits, varied messages) to work around a property of the token, and needs
a loop bound. Rejected: a fixed hash — the tests need a token that resolves to a commit they
created, so the hash cannot be chosen in advance. Rejected: changing `custody.js`'s all-digit
rule — the owner ruled it out, and the rule is correct.

## Non-Goals

- No change to `custody.js` or `functional-verification.js` (`BUILD_TOKEN`, the all-digit rule).
- No change to the other `slice` calls in the file: line 152 (`auditedCommit`, resolved by
  `git rev-parse`, which accepts an all-digit prefix) and line 208 (a 4-character prefix used
  to find an ambiguous id) do not go through the all-digit rule.
- No other test files.

## Verification Artifacts

None apply — a change to one unit-test file and one line of CLAUDE.md; no screen, design or
rendered data.

## Verification Environment

**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: the GitHub Actions runner itself (verification.md §5); the fix is
a property of the test's input, not of the runner, so local repetition is the evidence.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `tokenOf(sha, n)` to `custody.test.js`, use it at every deploy-link token built from a hash prefix (lines ~914, ~917, ~1095, ~1102, ~1104, ~1111), and add a unit test of the helper itself | O1 | None | (1) A new test calls `tokenOf` with a constructed sha whose first 10 characters are digits (e.g. `'2012004412' + 'ab' + '0'.repeat(28)`) and expects `'2012004412a'`; with a sha starting with a letter in the first 8, expects exactly 8 characters; with an all-digit sha, expects the full sha. Each of these fails against `sha.slice(0, n)`. (2) No `.slice(0, 8)` or `.slice(0, 9)` remains in a deploy-link `identityOutput` in the file. (3) `npx jest packages/core/lib/custody.test.js` passes 40 runs in a row (filtered to `-t 'deploy link\|merge and deploy links\|tokenOf'` is acceptable for the 40-run loop, plus one full-file run). |
| FIX-002 | Remove the "`custody.test.js` flakes on all-digit commit hashes." sentence from CLAUDE.md's Known open list (4.17.3–4.17.5 bullet), keeping the rest of that bullet | O2 | FIX-001 | `grep -c "flakes on all-digit" CLAUDE.md` prints 0; the rest of the 4.17.3–4.17.5 bullet is unchanged. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/custody.test.js`
- **Reuse:** the existing `deploy(s, identityOutput)` helper in the "check: deploy link" describe block and `check(s.args({ link: 'deploy', ... }))` in the ref-anchor describe block [read]
- **Replaces:** the inline `anchorA.slice(0, 8)`, `b.slice(0, 8)`, `head.slice(0, 9)`, `t.slice(0, 8)`, `bad.slice(0, 8)`, `head.slice(0, 8)` token builders [read]
- **Follow:** define the helper near the file's other top-level helpers (`setup()`, around line 48) as a plain function with a one-line JSDoc, matching the file's style; regex for a letter is `/[a-f]/` like `custody.js:831` [read]
- **Careful:** do not touch line 152 or line 208 (see Non-Goals). The whole file takes ~78s per run [ran]; the 40-run loop should be filtered. Line 1083's literal `'build 1234567'` and line 1111's literal `1234567` are deliberate all-digit tokens and must stay. [read]

### FIX-002
- **Touches:** `CLAUDE.md`
- **Reuse:** none
- **Replaces:** the sentence "`custody.test.js` flakes on all-digit commit hashes." in the 4.17.3–4.17.5 Known-open bullet [read]
- **Follow:** keep the bullet's remaining sentences and wrapping as they are [read]
- **Careful:** do not edit the Current Status release line or test counts [inferred]

## Could Not Verify

- That CI on GitHub Actions stops flaking: only provable by later CI runs; the local 40-run loop is the stand-in.
