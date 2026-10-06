VERDICT: proceed with these caveats: the live end-to-end smoke test (VMP-T001, a [LIVE] task deferred by design) was never written, so the path where a must-pass criterion is "not verifiable" and blocks the run has been proven only by unit tests, never in a live session; one Could Not Verify row (whether every TRD lacking an Objectives table is PRD-sourced) stays open as planning context.

# Audit report: verification-must-pass

- Date: 2026-10-06
- Audited commit: 974f4da
- TRD: docs/TRD/verification-must-pass.md
- PRD: docs/plan/verification-must-pass.investigation.md (investigation record; no PRD)
- Findings: 3 · applied: 1 · rejected: 0 · still unverified: 2 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/verification-must-pass.md    PRD: docs/plan/verification-must-pass.investigation.md

VERDICT: proceed with these caveats: the live end-to-end smoke test (VMP-T001, a [LIVE] task deferred by design) was never written, so the path where a must-pass criterion is "not verifiable" and blocks the run has been proven only by unit tests, never in a live session; one Could Not Verify row (whether every TRD lacking an Objectives table is PRD-sourced) stays open as planning context.

Coverage of this audit: 5 of 5 verifiers reported; source docs/plan/verification-must-pass.investigation.md; 8 objectives and 9 tasks indexed. 8 of 9 tasks are built (implement.json: success). I re-ran the 8 related suites: 734 of 734 tests pass.

MISSING IMPLEMENTATION
- The live smoke scenario (VMP-T001). test/smoke/scenarios/verification-must-pass.sh does not exist, and it is not registered in LLM_OPT_IN_SCENARIOS (test/smoke/run-smoke.sh:181). All 3 findings are this same gap, reported by 3 verifiers. The TRD defers this task on purpose, so it is reported for your call, not chained: building it needs /implement-trd --include-deferred and a live model session. The behaviour it would test, which is O3 to O5 (a must-pass item blocks "satisfied" and is named in the report), is already proven by unit tests in verify-functional.test.js (from line 2645) and functional-verification.test.js. The recorded verification run reads "Satisfied, must pass 3 of 3 proven". That run never hit the blocking path, though, and the scenario's second fixture is the only planned live test of it.

REJECTED THESE FINDINGS
- none. All three match the files on disk.

NO ACTION
- 8 of 8 objectives are implemented and tested, and each traces to the investigation record.
- Could Not Verify was rewritten. I checked four of the claims /audit-trd left open against the code and closed them. (1) The test harness drives the Judge-override path: verify-functional.test.js:2645-2720. (2) An absent Must pass cell reads as blank: functional-verification.js uses `row.cells[mpCol] ?? ''`, though no test feeds it a short row. (3) All 9 changed .claude/ mirrors are byte-identical to their packages/core sources. (4) Nothing else reads the report's Outcome line: the only other match is unrelated C# in the building-integrations skill. Two rows remain: VMP-T001's live seam, and the PRD-sourced count (now 16 of 36 TRDs, was 16 of 35).
