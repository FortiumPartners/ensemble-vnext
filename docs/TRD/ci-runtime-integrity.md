# TRD: ci-runtime-integrity

**Source PRD**: None — defect (CI red on `main`), owner instruction 2026-11-07

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `test/integration/tests/runtime-integrity.test.sh` passes on `main` with this repository's owner-filled `.claude/rules/verification.md` left exactly as the owner wrote it | the reproduction below / owner instruction, 2026-11-07 | yes |
| O2 | The two template-parity tests still fail when a framework-prose rule (`async-discipline.md`, `autonomy.md`, `command-status.md`) drifts from its shipped template | owner instruction, 2026-11-07 (the tests must keep guarding what they were written for) | yes |

## Reproduction

### Steps
1. On `origin/main` (9f61568): `bats test/integration/tests/runtime-integrity.test.sh`
2. CI run 42376712691 on the push of PR #75 reports the same: `runtime-integrity.test.sh (2 failing)`.

### Actual
- Test 2 "every .claude/rules/ file matches its shipped template" fails: `DRIFT: rules/verification.md`.
- Test 8 "every framework rule template matches the live copy it ships" fails: `templates/claude-directory/rules/verification.md and .claude/rules/verification.md differ`.

### Expected
Both pass. `verification.md` (and `design.md`) are owner-governed: the template ships a blank
shape the owner fills with `/verification-setup` / `/design-setup`. Commit 50e2adf filled this
repository's copy, as intended, and the tests broke.

**Root cause [ran]:** both tests loop over every file in
`packages/core/templates/claude-directory/rules/` and require byte equality with
`.claude/rules/`. That held only while this repo's `verification.md` was still the unfilled
template. `scaffold-project.sh` (`AUTHORED_RULES`, ~line 1678) and `rebase-project.md` (line 24)
already treat `verification.md` and `design.md` as owner-authored and never overwrite them; the
two tests did not carry the same exclusion.

## Decision

Exclude the owner-authored rules (`verification.md`, `design.md`) from both byte-parity tests,
using the same list as `scaffold-project.sh`'s `AUTHORED_RULES`. Rejected: copying the template
over the live file (destroys the owner's verification setup, which no autonomous run may edit)
and copying the live file over the template (ships this repo's environments to every scaffolded
project). `/rebase-project` would not change anything: it never modifies `verification.md`.

CLAUDE.md is not touched: on current `main` it is 15,870 bytes against a 16,000 ceiling. The
ship-build feature (PR #75, SHIP-D003) already did the one trim and raised the ceiling from
15,500 with a stated reason in the test. A second trim would be the loop the owner ruled out.

absorbed: none
not absorbed: CLAUDE.md size — already within its ceiling on `main`; the fix succeeds without it

## Non-Goals
- No change to `verification.md`, `design.md`, any template, or CLAUDE.md.
- No change to `scaffold-project.sh` or `rebase-project.md`.

## Verification Artifacts

None apply — a test-file-only change with no UI, data, design or flow; the BATS suite is the check.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Skip `verification.md` and `design.md` in tests 2 and 8 of `runtime-integrity.test.sh`, with a comment naming `AUTHORED_RULES` and why | O1, O2 | None | `bats test/integration/tests/runtime-integrity.test.sh` reports 0 failures with the owner-filled `verification.md` in place; temporarily appending a line to `.claude/rules/autonomy.md` makes tests 2 and 8 fail again (revert afterwards) |

## Task Grounding

### FIX-001
- **Touches:** `test/integration/tests/runtime-integrity.test.sh`
- **Reuse:** the `AUTHORED_RULES` list in `packages/core/scripts/scaffold-project.sh` (~line 1678): `constitution.md stack.md process.md verification.md design.md`; only the last two exist in the template dir [read]
- **Replaces:** nothing — adds a skip inside each test's existing loop [read]
- **Follow:** BATS style already in the file; test 8 keeps its `[ "$count" -ge 4 ]` floor, which must still hold with 3 framework rules counted — lower it to 3 so an emptied template dir still fails [inferred]
- **Careful:** test 17 (`command-status.md` in both copies) and test 18 (byte ceilings) must stay green; do not edit either rule copy

## Could Not Verify
- CI on the GitHub runner is only observed after the PR's own run; local BATS is the evidence before then.
