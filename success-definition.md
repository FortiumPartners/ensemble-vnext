# Functional Success Definition: custody-test-all-digit-hash-flake

**Source**: docs/TRD/custody-test-all-digit-hash-flake.md §Reproduction (received as extracted text; the TRD file itself was not read)
**Source kind**: reproduction
**Derived**: 2026-11-12T18:40:00Z
**Criteria**: 7

Baseline, measured before any fix [ran 2026-11-12, on commit 77b2849b]: one run of
`npx jest packages/core/lib/custody.test.js -t 'deploy link|merge and deploy links'` reports
`Tests:       173 skipped, 8 passed, 181 total` in about 6 s. The 8 are the 7 tests under
`describe('check: deploy link')` (custody.test.js:1061) plus
`merge and deploy links resolve the ref anchor while the tracked custody.json names another commit`
(custody.test.js:904).

Source lines cited below, by short name:
- **Steps**: the 40-iteration loop of the filtered jest command.
- **Expected**: "0 of 40 runs fail."
- **Actual**: "3 of 40 runs failed ... The owner's report measured 3 of 21 on the full file, and CI failed three times on PRs #125 and #127."
- **Root cause**: "`custody.js:830-832` ... drops every token that has no letter a–f ... That rule is correct and stays. The tests build tokens with `sha.slice(0, 8)` (or `slice(0, 9)` after `g`) from a commit created during the test, so its hash is random ... Five prefix draws whose outcome matters (lines 914, 1095, 1102, 1104, 1111)".
- **Owner's instruction**: "fix the tests, not custody.js's rule, keeping what each test checks; remove the CLAUDE.md known-open line 'custody.test.js flakes on all-digit commit hashes' when fixed."

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Running the reproduction's loop — 40 consecutive runs of `npx jest packages/core/lib/custody.test.js -t 'deploy link\|merge and deploy links'` — produces 0 failing runs | Expected ("0 of 40 runs fail"); Steps | A log of the 40-iteration loop exactly as in Steps, with each iteration's jest summary line kept and a closing tally line the loop itself prints (for example `failed=0 of 40`); every iteration shows `8 passed` and no `FAIL` line appears. At the measured rate (≈ 11–13% of runs draw an all-digit prefix) about 5 of the 40 runs are expected to hit the old failure condition naturally | [ran] | locator | 40 | |
| FS-2 | The deploy-link tests no longer depend on the random hash at all: a run in which a test-created commit's 8- or 9-character prefix is all digits still passes, so the fix removes the failure mode rather than making it rarer | Root cause (the flake is the chance a random prefix is all digits); domain-derived: a fix that only lowers the probability (for example a longer prefix) would still flake and could pass 40 runs by chance, so 0 of 40 alone does not show the cause is gone | A jest run of the filtered tests in which at least one deploy-link test's commit hash has an all-digit prefix of the length the old test sliced, and that test passes (an exerciser may find such a run by looping with each test's hash logged, without editing source); or, substituted with the reason recorded, a transcript of the deploy-link tests' source showing that every token built from a test-created commit contains a letter a–f whatever that commit's hash is | [ran] | locator | | |
| FS-3 | `custody.js`'s rule is unchanged: the deploy link of `check` still drops every token with no letter a–f, still fails an identity output holding only all-digit tokens with a reason naming them, and still skips an all-digit token beside a real one | Root cause ("That rule is correct and stays"); Owner's instruction ("fix the tests, not custody.js's rule") | `git diff <base commit 77b2849b> -- packages/core/lib/custody.js` producing no change to the all-digit filter (custody.js:830-832 at the base commit: `tokens.filter((t) => /[a-f]/i.test(t))` and `fail('only all-digit tokens in the identity output')`), plus a passing jest run of `fails with only an all-digit token` (custody.test.js:1081) | [read] | locator | | |
| FS-4 | Each of the 5 prefix-draw sites still checks what it checked before: line 914 — a deploy token from the ref anchor passes with `observed` equal to that anchor; line 1095 — a `git describe`-form token (`v1.2.3-4-g<prefix>`) resolves to a code-equal commit and passes with `observed` equal to head; line 1102 — a token for a later test-only commit passes; line 1104 — a token for a later commit that changes shipped code fails with `differing` equal to `['src/b.js']`; line 1111 — an all-digit token (`1234567`) beside a real token is skipped and the check passes | Root cause (the five lines listed); Owner's instruction ("keeping what each test checks") | The diff of `packages/core/lib/custody.test.js` against base commit 77b2849b, paired line by line against the five assertions as they stood at the base commit (quoted in this row): each `expect(...)` keeps its expected value (`ok: true, observed: anchorA`; `ok: true, observed: head`; `.ok).toBe(true)`; `differing).toEqual(['src/b.js'])`; `.ok).toBe(true)`), the line-1095 token keeps its `git describe` shape `-g<hex>`, and the line-1111 output still holds the all-digit token `1234567` beside the real one | [read] | locator | 5 | |
| FS-5 | No deploy-link test was removed, skipped or renamed out of the filter: the filtered run still selects and passes the same 8 tests | Owner's instruction ("keeping what each test checks"); domain-derived: deleting or skipping a flaky test would also give 0 of 40 failures while checking nothing | One jest run of the filtered command with `--verbose`, showing `8 passed` with the eight test names present (the seven under `check: deploy link` and `merge and deploy links resolve the ref anchor while the tracked custody.json names another commit`), compared against the baseline above (`173 skipped, 8 passed, 181 total`) | [ran] | locator | | |
| FS-6 | The whole of `custody.test.js` passes, so the fix to the deploy-link tests broke none of the file's other tests | Actual ("The owner's report measured 3 of 21 on the full file, and CI failed"); domain-derived: the failure was reported on the full file, so the full file is where its absence is shown | One run of `npx jest packages/core/lib/custody.test.js` (about 78 s per the source) whose summary shows `0 failed` — every test passing, with the total not lower than the baseline's 181 | [ran] | locator | | |
| FS-7 | The CLAUDE.md known-open line "`custody.test.js` flakes on all-digit commit hashes." is removed, and the other known-open items in that same 4.17.3–4.17.5 entry stay | Owner's instruction ("remove the CLAUDE.md known-open line ... when fixed") | Transcript of `grep -n 'flakes on all-digit commit hashes' CLAUDE.md; echo "exit=$?"` showing no match and `exit=1`, plus `grep -n 'A merge re-dispatched after its branch is deleted stops at custody' CLAUDE.md` still matching | [read] | locator | | |

A criterion carrying a `Parts` count cannot pass incrementally: FS-1 is `met` only when all 40
runs pass, and FS-4 only when all 5 sites keep their check; 39 of 40, or 4 of 5, is `not_met`
with the shortfall named.

No criterion carries a `Must pass` mark: the must-pass objectives block given to this
derivation was empty.
