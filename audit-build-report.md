VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the TRD came from issue #157 and an owner ruling, not a PRD, so only TRD-to-code traceability was checked); the restart rule (O3: a plain /verify-build after a restart continues the open criteria) is proven by prose assertions only, with no live session run.

# Audit report: fix-rerun-scope-rule

- Date: 2026-11-16
- Audited commit: 260115cece876b936da322af17d9d887b95adeb3
- TRD: docs/TRD/fix-rerun-scope-rule.md
- PRD: none
- Findings: 4 · applied: 3 · rejected: 1 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-rerun-scope-rule.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the TRD came from issue #157 and an owner ruling, not a PRD, so only TRD-to-code traceability was checked); the restart rule (O3: a plain /verify-build after a restart continues the open criteria) is proven by prose assertions only, with no live session run.

Coverage: 5 of 5 verifiers reported; 7 requirements and 3 tasks indexed. Validation against product requirements is UNCHECKED because no PRD was supplied.

FIXED THE CITATION
- Non-Goals and Intended Change in docs/TRD/fix-rerun-scope-rule.md cited bare verify-functional.js:3250-3256 and custody.js. They now name packages/core/workflows/verify-functional.js (regressionScope(), line 3255, mirrored in .claude/workflows/) and packages/core/lib/custody.js:501. Descriptive text only; no objective or task changed.

REJECTED THESE FINDINGS
- "Issues #153 to #156 cannot be resolved": wrong. gh issue view resolves all four as OPEN in this repository's tracker (#153 custody re-proof re-checks every must-pass criterion, #154 functional verification re-checks criteria with no covers record, #155 CI-proven criterion re-proof, #156 phase gates run the battery twice). The verifier searched only git log and docs.

NO ACTION
- 4 objectives and 3 tasks are implemented and tested: rerun-scope.js in packages/core/lib, .claude/lib and packages/full/lib; the contract in packages/core/contracts and .claude/contracts; all five commands in both copies reference rerun-scope, as do the custody-gate and wait-ci contracts; verify-build.md states an outcome: null state file is resumed. The two Jest suites pass, 34 of 34 tests.
