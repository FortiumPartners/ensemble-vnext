VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; planned, not built yet: OHP-T002 (the repeatable live fixture scenario for off-host proof) — tagged [LIVE], so /implement-trd sets it aside unless run with --include-deferred; it needs only the fixtures environment and a fake gh on PATH; coverage of verify-functional.js cannot be measured, because Jest cannot instrument workflow scripts (O11); two runtime claims about gh and PATH are still unchecked (see Could Not Verify)

# Audit report: accepted-gaps-for-not-checkable-must-pass-criteria

- Date: 2026-11-12
- Audited commit: 4ddd05ac004bbe64b38f387ce7f62024a807a01f
- TRD: docs/TRD/accepted-gaps-for-not-checkable-must-pass-criteria.md
- PRD: none
- Findings: 11 · applied: 2 · rejected: 3 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/accepted-gaps-for-not-checkable-must-pass-criteria.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; planned, not built yet: OHP-T002 (the repeatable live fixture scenario for off-host proof) — tagged [LIVE], so /implement-trd sets it aside unless run with --include-deferred; it needs only the fixtures environment and a fake gh on PATH; coverage of verify-functional.js cannot be measured, because Jest cannot instrument workflow scripts (O11); two runtime claims about gh and PATH are still unchecked (see Could Not Verify)

Audit coverage: all 5 verifiers reported. They checked 12 objectives and 8 tasks. No PRD was supplied, so the delivered behaviour was checked against this TRD only, not against the investigation it comes from.

PLANNED, NOT BUILT YET
- The live fixture scenario for off-host proof (OHP-T002, which serves O7, a headless fixture run proving the behaviour) is not built: test/smoke/scenarios/verify-off-host-proof.sh does not exist, it is not registered in run-smoke.sh or the README, and evidence/live/OHP-T002/ and evidence/live-manifest.jsonl do not exist. The task's status in implement.json is "deferred". The TRD's reason: it is tagged [LIVE], so it runs only with --include-deferred. The behaviour itself was shown once, by hand, in the verification run (criterion FS-32: met, proof.kind off-host, stub run 987654321, in evidence/it3/FS-32-state.json). What is missing is a repeatable scenario. Five findings point at this one deferral: two on O7, one on OHP-T002, and the scenario-file and evidence-folder/manifest citations.

TRACEABILITY GAPS
- The coverage targets (O11: unit at least 60%, integration at least 50%) have no figure recorded in the tree, and no task's Serves column names O11. I measured it this run with Jest: whole-file line coverage is functional-verification.js 73%, spec-scope.js 86%, custody.js 94% (1117 tests passing). Two parts have no figure: verify-functional.js, which Jest cannot instrument because of a top-level return at line 2515, and the off-host lookup in functional-verification.js (lines 932-1026), whose tests run it as a separate process. Recorded here, not closed: how to measure a workflow script is a design decision this command does not make.

REJECTED THESE FINDINGS
- "The read-aloud CI job is cited as real": wrong. The TRD's own Objectives table (lines 32-45) has no Off-host proof column. §3.1 (lines 162-164) labels ci.yml#read-aloud hypothetical. D1 gives it as "for example". D17 and the OHP-T002 grounding use it as the fixture repo's job, which the stub gh answers. The custody test uses it as a string (packages/core/lib/custody.test.js:531).
- "FS-1/FS-2 are unanchored": wrong. They are ids local to the test helper in packages/core/lib/custody.test.js (lines 45 and 387, twoCriteria), which is exactly what line 509 describes.
- "OWNER-CALLS.md does not exist": wrong. The TRD names it as a path that record-files.js classifies (.claude/lib/record-files.js:31), not as a file that must exist.

NO ACTION
- 7 of 8 tasks are built as described and their related Jest suites pass. Done to the TRD: the Could Not Verify section is rewritten with five rows. It now holds the missing-source caveat, the unmeasurable verify-functional.js coverage and the deferred integration half of O11. The gh run-timing claim is still unchecked. The PATH claim now records the one hand-run that showed it holding.
