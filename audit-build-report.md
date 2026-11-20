VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this defect has a brief, not a PRD); the dedup tests cannot tell "last row wins" from "first row wins"; check 3 of the brief (the original 6,104 / 8,402 baseline transcripts) cannot be re-run from this account

# Audit report: fix-token-usage-double-count

- Date: 2026-11-20
- Audited commit: 052132fc877bd753533dde2c2b2c74eb6e782bd8
- TRD: docs/TRD/fix-token-usage-double-count.md
- PRD: none
- Findings: 4 · applied: 4 · rejected: 0 · still unverified: 2 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-token-usage-double-count.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this defect has a brief, not a PRD); the dedup tests cannot tell "last row wins" from "first row wins"; check 3 of the brief (the original 6,104 / 8,402 baseline transcripts) cannot be re-run from this account

Audit coverage: all 5 verifiers reported; 7 requirements and 1 task (FIX-001, the message-id deduplication fix) were indexed. No PRD was supplied, so the check against product requirements did not run.

UNTESTED-IN-PRACTICE
- Which row survives when several share a message id (FIX-001). Every row in the dedup tests that shares an id has the same usage block, so swapping "last wins" for "first wins" would still pass. The code (token-usage.js:86, a Map.set that overwrites) and the TRD's Decision both say last wins. That matters when streamed lines carry growing output_tokens. The behaviour is correct and only the test is weak. This goes to /implement-trd --reconcile, where FIX-001 already covers it.

FIXED THE CITATION
- docs/TRD/fix-token-usage-double-count.md, Root cause and the FIX-001 Task Grounding: the line numbers (CLI loop 104-118, aggregate() 68-79, add() calls 112-117, header 11 and 27-28) were right for the code before the fix (commit 82ac6c78) but do not point at the delivered file. Each one is now marked "before the fix" and also gives its current place: main() at 102-155, aggregate() at 78-94, the dedup note at 12-15, the subagent note at 30-32. No requirement text changed.

NO ACTION
- FIX-001 as built: aggregate() deduplicates by message id, rows with no id are still counted, the same id across two dirs counts once, the since filter runs before dedup, and the CLI sends every row through one aggregate() call. Re-run in this audit: check.sh printed PASS and exited 0 (30846 output / 89 messages from both sides), and all 14 tests in token-usage.test.js pass.
- Conformance with the project's rules: the diff adds no new dependency, no child_process and no exec, and keeps the require.main guard.

REJECTED THESE FINDINGS
- none

Could Not Verify (rewritten in the TRD): kept check 3 of the brief (the baseline transcripts sit in another OS user's home folder), with a note that checks 1 and 2 passed. Added that there was no PRD to validate against.
