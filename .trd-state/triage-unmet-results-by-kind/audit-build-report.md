VERDICT: proceed with these caveats: the passing fixture run's evidence is still filed in the wrong place (TRIAGE-T001's evidence folder and live-manifest.jsonl still hold the earlier failing run, and implement.json still reads "O8 partial"); this re-audit checked only the previous round's defects and the files changed since c8aeb339, so other requirements were not re-checked; the live Judge has called FS-2 an evidence gap in only one run of the committed scenario

# Audit report: triage-unmet-results-by-kind

- Date: 2026-11-11
- Audited commit: 34038dc152792b4a39fb5f60a43ba72004ea39be
- TRD: docs/TRD/triage-unmet-results-by-kind.md
- PRD: docs/plan/triage-unmet-results-by-kind.investigation.md
- Findings: 5 · applied: 1 · rejected: 0 · still unverified: 2 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/triage-unmet-results-by-kind.md    PRD: docs/plan/triage-unmet-results-by-kind.investigation.md

VERDICT: proceed with these caveats: the passing fixture run's evidence is still filed in the wrong place (TRIAGE-T001's evidence folder and live-manifest.jsonl still hold the earlier failing run, and implement.json still reads "O8 partial"); this re-audit checked only the previous round's defects and the files changed since c8aeb339, so other requirements were not re-checked; the live Judge has called FS-2 an evidence gap in only one run of the committed scenario

MISMATCH
- The evidence for the fixture run (TRIAGE-T001, which proves O8) is filed in the wrong place. The code is fine and O8 is met: evidence/fs30/ holds a run with 13 of 13 assertions passing, a report that shows 1 build defect, 1 evidence gap (FS-2, in the definition-problems section) and 1 not checkable here, and a state file with one of each kind. TRIAGE-T001's acceptance requires that run's report, state file and transcript under evidence/live/TRIAGE-T001/ and listed in live-manifest.jsonl. That folder still holds the earlier run (11 passed, 2 failed; FS-2 ruled a build defect). The manifest's three rows describe that same earlier run, and implement.json line 174 still has current_problem "O8 partial". All five findings describe this one defect, and each was confirmed on disk. This is bookkeeping only (copy the fs30 files in, add the manifest rows, clear current_problem), not code, so it goes to /implement-trd --reconcile under TRIAGE-T001. Note: evidence/ is gitignored (.gitignore:80), so the fix is in the working tree only and leaves no commit.

REJECTED THESE FINDINGS
- None rejected. One detail is weak: "git diff c8aeb33 touches no evidence files" is true but proves nothing, because evidence/ is gitignored. The filesystem check (run.log tails, manifest rows) is what confirms the finding.

NO ACTION
- The previous round's two code defects are fixed in commit 0f0a81a1. The setup-check test for preclassified criteria (AMEND-001) is in packages/core/workflows/verify-functional.test.js. The D21 log for a gap with no criterion entry, or with an entry that has no kind (AMEND-002), is at packages/core/workflows/verify-functional.js:2171-2173. No verifier reported either one still open.
- Coverage: 5 of 5 verifiers reported. 14 requirements and 12 tasks were indexed. No fresh sample was taken.

Could Not Verify (rewritten in docs/TRD/triage-unmet-results-by-kind.md): 2 rows. (1) Every requirement and task outside this re-audit's scope was not re-checked. (2) Whether the live Judge rules FS-2 an evidence gap on repeated runs: there is only one run of the committed scenario, and an audit runs no model session.
