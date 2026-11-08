VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the live validation agent's use of the new `no-source` marker is checked only by a prompt-text test, not by a live run

# Audit report: fix-audit-build-plan-route-close

- Date: 2026-11-08
- Audited commit: 6c57675edee43311ab622efa9f8cdb51d2e511aa
- TRD: docs/TRD/fix-audit-build-plan-route-close.md
- PRD: none
- Findings: 7 · applied: 2 · rejected: 0 · still unverified: 2 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-audit-build-plan-route-close.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the live validation agent's use of the new `no-source` marker is checked only by a prompt-text test, not by a live run

Coverage: all 5 verifiers reported. 5 objectives and 2 tasks (FIX-001 the fix, FIX-002 its tests) indexed. No PRD exists (this is a /plan-route defect fix), so validation against product requirements was not checked. This audit checked the TRD against the code only.

UNTESTED-IN-PRACTICE
- The workflow prompt test (FIX-002) is weak. `packages/core/workflows/audit-build.test.js:108-112` only checks that the prompt text asks the validation verifier to return action `no-source` with id `NO-PRD`. It does not show that a live agent does so. It hides no defect: the counting it feeds is fully tested in `packages/core/lib/audit-rounds.test.js:54-74`, and this audit's own validation verifier did return exactly that item. This chains to /implement-trd --reconcile as a test gap. It is also recorded under Could Not Verify, because the strong form of the test needs a headless /audit-build run in a fixture repo.

FIXED THE CITATION
- The source column for objectives O1 to O5 said "issue #83, acceptance (1)…(5)". Issue #83 has no numbered acceptance list. That list is in the workplan's feature F-1 description in `docs/plans/fix-audit-build-plan-route-close/workplan-input.json`, and all five items match the objectives word for word. I changed the five source cells to point there and kept issue #83 on O1 as the defect reference. No objective wording changed.

NO ACTION — implemented, tested, sourced (5 of 5 objectives)
- O1 (the no-PRD item alone closes the audit): `audit-rounds.js:65` adds `no-source` to `NOTE_ACTIONS`. `tally` and `classify` treat it as a note. The test at `audit-rounds.test.js:56` checks that `tally` gives uncovered 0, notes 1 and that `decide` closes.
- O2 (a feature with a PRD and an uncovered requirement stays open), O3 (no PRD plus a real uncovered objective stays open), O4 (no PRD plus a real defect still chains a fix run): tested at `audit-rounds.test.js:62-74`, together with the existing `decide` tests for uncovered items.
- O5 (the two `audit-rounds.js` copies stay identical): `cmp` shows both lib copies and both workflow copies are byte-identical. The existing mirror check in `test/integration/tests/runtime-integrity.test.sh:217` guards this.
- The 2 suites pass now: 117 of 117 tests.

REJECTED THESE FINDINGS
- none. The no-PRD caveat (NO-PRD) is kept as a caveat in the verdict, not a requirement.

Could Not Verify in `docs/TRD/fix-audit-build-plan-route-close.md` is rewritten. It now has two rows: the live agent's use of the new marker, and validation that was skipped because there is no PRD.
