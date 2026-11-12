# Functional Success Definition: ci-runtime-integrity

**Source**: TRD §Reproduction (extracted text, passed verbatim; the TRD itself was not read)
**Source kind**: reproduction
**Derived**: 2026-11-07T00:00:00Z
**Criteria**: 8

Citations name the reproduction's own parts: **Steps 1** (local `bats` run on `origin/main` 9f61568),
**Steps 2** (CI run 42376712691, "2 failing"), **Actual 1** (test 2, `DRIFT: rules/verification.md`),
**Actual 2** (test 8, the template and live `verification.md` differ), **Expected** ("Both pass.
`verification.md` (and `design.md`) are owner-governed: the template ships a blank shape the owner
fills ... Commit 50e2adf filled this repository's copy, as intended, and the tests broke.").

Tests are named by title, not number: a test added above them would renumber them, and the
reproduction identifies each by its title as well as its number.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | The test "every .claude/rules/ file matches its shipped template" passes in this repository, with its owner-filled `.claude/rules/verification.md` in place | Actual 1; Expected ("Both pass"; "Commit 50e2adf filled this repository's copy, as intended") | Captured output of `bats test/integration/tests/runtime-integrity.test.sh` showing `ok <n> every .claude/rules/ file matches its shipped template` and no `DRIFT: rules/verification.md` line | [read] | locator | | O1 |
| FS-2 | The test "every framework rule template matches the live copy it ships" passes in this repository, with its owner-filled `.claude/rules/verification.md` in place | Actual 2; Expected ("Both pass") | The same captured `bats` output showing `ok <n> every framework rule template matches the live copy it ships` and no `templates/claude-directory/rules/verification.md and .claude/rules/verification.md differ` line | [read] | locator | | O1 |
| FS-3 | Running the reproduction's command, `bats test/integration/tests/runtime-integrity.test.sh`, reports no failing test and exits 0 | Steps 1; Steps 2 ("2 failing" — the two tests above were the only failures); Expected ("Both pass") | Captured `bats` output whose summary shows 0 failures, plus the recorded exit status `0` | [read] | locator | | O1 |
| FS-4 | This repository's `.claude/rules/verification.md` is left exactly as the owner wrote it: the fix does not re-blank it or copy the template over it | Expected ("Commit 50e2adf filled this repository's copy, as intended"; "owner-governed: the template ships a blank shape the owner fills with `/verification-setup`") | `git diff --stat 9f61568 HEAD -- .claude/rules/verification.md` output that is empty (no lines changed), recorded alongside the command | [read] | locator | | O1 |
| FS-5 | An owner-filled `.claude/rules/design.md` — differing from its blank shipped template, as `/design-setup` would leave it — does not make either template-parity test fail | Expected ("`verification.md` (and `design.md`) are owner-governed: the template ships a blank shape the owner fills with `/verification-setup` / `/design-setup`") | In a scratch copy of the repository, fill a field of `.claude/rules/design.md` so it differs from its template, run the `bats` file, and capture output showing both parity tests `ok` and no `DRIFT: rules/design.md` line | [read] | locator | | |
| FS-6 | The test "every .claude/rules/ file matches its shipped template" still fails when a rule file that is not owner-governed (framework prose, not filled by a setup skill) differs from its shipped template | Actual 1 (the test's own title states its purpose: every rules file matches its template); Expected (the exemption is grounded in owner-governance — "the template ships a blank shape the owner fills" — which framework-prose rules do not have) | In a scratch copy, edit one non-owner-governed rule such as `.claude/rules/autonomy.md`, run the `bats` file, and capture output showing `not ok <n> every .claude/rules/ file matches its shipped template` with a `DRIFT:` line naming that file | [read] | locator | | O2 |
| FS-7 | The test "every framework rule template matches the live copy it ships" still fails when a framework-prose rule template and its live copy differ | Actual 2 (the test's own title states its purpose); Expected (the exemption is grounded in owner-governance only) | In the same kind of scratch copy, edit one non-owner-governed live rule (or its template), run the `bats` file, and capture output showing `not ok <n> every framework rule template matches the live copy it ships` with a `differ` line naming that file | [read] | locator | | O2 |
| FS-8 | The CI run on the push carrying the fix reports `runtime-integrity.test.sh` with no failing tests | Steps 2 (CI run 42376712691 reported "runtime-integrity.test.sh (2 failing)"); Expected ("Both pass") | `gh run view <run-id> --log` output for the fix's push, saved to a file, showing the runtime-integrity step with no `not ok` lines and the job succeeding | [read] | locator | | |

**Notes on scope.**

- FS-8 is left ordinary rather than marked must-pass: the CI result exists only after a push, and
  `verification.md` §5 records that runner-only behaviour cannot be reproduced from this machine.
  FS-1 to FS-3 prove the same outcome locally.
- FS-5 has no must-pass mark because the objectives name only `verification.md`; it is kept because
  the Expected line names `design.md` as owner-governed on the same grounds. This repository's
  `design.md` is currently the unfilled template, so the criterion is exercised in a scratch copy.
