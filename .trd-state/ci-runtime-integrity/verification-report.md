# Functional Verification Report: ci-runtime-integrity

**Source PRD**: docs/TRD/ci-runtime-integrity.md § Reproduction
**Success definition**: .trd-state/ci-runtime-integrity/success-definition.md
**Outcome**: Satisfied (1 of 8 not verifiable) (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 8 total — 7 met, 0 not met, 1 not verifiable, 0 unbuilt
**Coverage**: 7 of 8 proven — uncovered: FS-8
**Must pass**: 6 of 6 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The test "every .claude/rules/ file matches its shipped template" passes in this repository, with its owner-filled `.claude/rules/verification.md` in place | .trd-state/ci-runtime-integrity/evidence/fs1-3-bats-main.txt | 1 |
| FS-2 | The test "every framework rule template matches the live copy it ships" passes in this repository, with its owner-filled `.claude/rules/verification.md` in place | .trd-state/ci-runtime-integrity/evidence/fs1-3-bats-main.txt | 1 |
| FS-3 | Running the reproduction's command, `bats test/integration/tests/runtime-integrity.test.sh`, reports no failing test and exits 0 | .trd-state/ci-runtime-integrity/evidence/fs1-3-bats-main.txt | 1 |
| FS-4 | This repository's `.claude/rules/verification.md` is left exactly as the owner wrote it: the fix does not re-blank it or copy the template over it | .trd-state/ci-runtime-integrity/evidence/fs4-diff.txt | 1 |
| FS-5 | An owner-filled `.claude/rules/design.md` — differing from its blank shipped template, as `/design-setup` would leave it — does not make either template-parity test fail | .trd-state/ci-runtime-integrity/evidence/fs5-bats-design-filled.txt | 1 |
| FS-6 | The test "every .claude/rules/ file matches its shipped template" still fails when a rule file that is not owner-governed (framework prose, not filled by a setup skill) differs from its shipped template | .trd-state/ci-runtime-integrity/evidence/fs6-7-bats-autonomy-edited.txt | 1 |
| FS-7 | The test "every framework rule template matches the live copy it ships" still fails when a framework-prose rule template and its live copy differ | .trd-state/ci-runtime-integrity/evidence/fs6-7-bats-autonomy-edited.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-8 | The CI run on the push carrying the fix reports `runtime-integrity.test.sh` with no failing tests | Needs the GitHub Actions run on the fix's push; GitHub Actions is not an environment listed in .claude/rules/verification.md section 1, so it is not authorized for exercise here. The PR's CI result is reported separately by the orchestrator. |

