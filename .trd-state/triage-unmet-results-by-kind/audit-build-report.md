VERDICT: proceed with these caveats: no test proves a preclassified criterion's environment is left out of the setup check (O5, TRIAGE-B007 acceptance case 2); a reply from the Judge that lists a gap without a matching criterion is sent to Debug correctly but not logged, as D21 requires (TRIAGE-B004); the live run that shows all three kinds (O8) is saved under evidence/fs30/, not the TRIAGE-T001 folder the task names, and the live manifest still lists only a failing earlier run; a live Judge has given the intended kinds on the committed fixture only once.

# Audit report: triage-unmet-results-by-kind

- Date: 2026-11-11
- Audited commit: c8aeb33913e5307ae02a039d304fbbd3cf31d647
- TRD: docs/TRD/triage-unmet-results-by-kind.md
- PRD: docs/plan/triage-unmet-results-by-kind.investigation.md
- Findings: 4 · applied: 1 · rejected: 1 · still unverified: 1 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/triage-unmet-results-by-kind.md    PRD: docs/plan/triage-unmet-results-by-kind.investigation.md

VERDICT: proceed with these caveats: no test proves a preclassified criterion's environment is left out of the setup check (O5, TRIAGE-B007 acceptance case 2); a reply from the Judge that lists a gap without a matching criterion is sent to Debug correctly but not logged, as D21 requires (TRIAGE-B004); the live run that shows all three kinds (O8) is saved under evidence/fs30/, not the TRIAGE-T001 folder the task names, and the live manifest still lists only a failing earlier run; a live Judge has given the intended kinds on the committed fixture only once.

Coverage: 5 of 5 verifiers reported. Source investigation supplied. 12 requirements and 10 tasks checked.

TRACEABILITY GAPS (built, but no test proves it)
- Preclassified criteria are left out of the setup check (O5; TRIAGE-B007 acceptance case 2). The code does it: packages/core/workflows/verify-functional.js:1955 filters setup targets on the `settled` map, and preclassified entries are seeded into that map. The preclassified test (verify-functional.test.js:3776-3783) only checks the Exercise prompt and the Judge's open set, and no test passes `preclassified` together with `setupTargets`. TRIAGE-B007 covers this, so it goes to /implement-trd --reconcile.

MISMATCH (built, but does something other than required)
- D21 says a not-met gap whose debugGaps item has no matching criteria entry is treated as a build defect and logged. verify-functional.js:2171 routes it as a build defect but writes no log line. Only the null-cause case is logged, in reconcileJudgeKinds (~1437). The behaviour is right and only the log is missing. The verifier filed this as untested; it is really a small mismatch. TRIAGE-B004 covers it, so it goes to /implement-trd --reconcile.

NEEDS YOUR CONFIRMATION (evidence bookkeeping, not code)
- O8 / TRIAGE-T001. The committed scenario test/smoke/scenarios/verify-triage-kinds.sh (commit 6dd93b85, 21:31) was run once at 21:40, and that run passed all 13 assertions. Its report reads "1 build defect, 1 evidence gap, 1 not checkable here" and has the "Evidence gaps (definition problems)" section. That run is saved only under .trd-state/triage-unmet-results-by-kind/evidence/fs30/, where the verify-build loop's criterion FS-30 cites it. The folder TRIAGE-T001 names, evidence/live/TRIAGE-T001/, and live-manifest.jsonl hold only the two earlier runs on the older fixture: 21:23 with 11 passed and 2 failed, and attempt-1 with 10 passed and 3 failed. In both, FS-2 was ruled a build defect. implement.json still says "O8 partial". What remains is to copy the fs30 run into the named folder, record it with live-evidence.js, and clear current_problem. Goes to /implement-trd --reconcile.

REJECTED THESE FINDINGS
- Part of the TRIAGE-T001 verification finding. It says the live run "never saw an evidence gap re-captured and settled" and that only attempt-1 is saved. evidence/fs30/run.log ("FS-2 ... carries kind evidence-gap", 13 passed, 0 failed) and evidence/fs30/verification-state.json (FS-2 settled "definition-problem") refute the first claim. The top-level files in evidence/live/TRIAGE-T001/ are a second run (11 passed, 2 failed), not copies of attempt-1. The part of the finding about where the evidence is recorded is accepted and merged into the O8 item above.

NO ACTION
- The other 10 of the 12 requirements are built, tested and sourced. The slot folder was removed after the run, as TRIAGE-T001 requires (evidence/live/work/ is empty).

Could Not Verify rewritten in docs/TRD/triage-unmet-results-by-kind.md. Both earlier rows were confirmed from the fs30 run and removed. One row remains: whether a live Judge gives the intended kinds on the committed fixture on repeated runs, which has been run only once.
