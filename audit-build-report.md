VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test proves the conflict rules for settings conflicts, dry-run or apply errors (O3); the smoke banner check passes a STUCK run (O5); the required headless /rebase-project run has not been made; whether CLAUDE_PLUGIN_ROOT is set in a --plugin-dir session is still unknown

# Audit report: rebase-prompt-on-the-engine

- Date: 2026-11-20
- Audited commit: 676b0da7a2a1fd0aaa3828767b508e4e70b62693
- TRD: docs/TRD/rebase-prompt-on-the-engine.md
- PRD: none
- Findings: 7 · applied: 4 · rejected: 2 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/rebase-prompt-on-the-engine.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test proves the conflict rules for settings conflicts, dry-run or apply errors (O3); the smoke banner check passes a STUCK run (O5); the required headless /rebase-project run has not been made; whether CLAUDE_PLUGIN_ROOT is set in a --plugin-dir session is still unknown

Coverage: 5 of 5 verifiers reported. 11 requirements and 4 tasks were checked. No PRD was supplied, so nothing checked the delivered code against product requirements. Only the link between the TRD and the code was checked.

TRACEABILITY GAPS
- Conflict handling (O3) is in the prompt, but tests prove only one path. packages/core/commands/rebase-project.md has every rule: replace a file when git shows no owner commit, otherwise merge or keep the owner's copy; resolve or leave a settings conflict; resolve nothing under --dry-run; tell a planning error from an apply error; send settings.refused to ISSUES. I re-ran the grep across all six test files. The only test of any of this is the owner-line check in test/smoke/scenarios/rebase-old-tree.sh:124-130, and the smoke fixture plants no settings conflict. FIX-001's acceptance criteria name these rules, so this goes to /implement-trd --reconcile.

UNTESTED-IN-PRACTICE
- The banner check in the smoke test does not prove O5. test/smoke/scenarios/rebase-old-tree.sh:166-172 accepts either the COMPLETE or the STUCK banner, but O5 and FIX-003 require COMMAND COMPLETE. A run that applies the changes and then ends STUCK would pass. FIX-003 covers this, so it goes to /implement-trd --reconcile.

FIXED THE CITATION
- FIX-004's grounding said `README.md:98`, and the verifier read that as the 80-line root README. The file meant is docs/reference/README.md, which FIX-004 lists in Touches. Its line 98 was the "Steps 1–5" row the change rewrote. Corrected to the full path.
- FIX-004's grounding said CHANGELOG lines 27-28. Those lines were right when the TRD was written (commit 21878d97). The new "Changed" section has since moved them to lines 31-32. The citation now gives both.
- The Could Not Verify section said the notes at .claude/verification-notes.md lines 1456 and 1469 show runs using ${CLAUDE_PLUGIN_ROOT}. Those lines only show that headless --plugin-dir rebases finished. The entry now says that, and says the plugin-root question is still open.

REJECTED THESE FINDINGS
- The CHANGELOG mismatch (FIX-004). The F-3 bullets do exist; the change edited them as FIX-004 required. CHANGELOG.md:31 now reads "now calls `--rebase` (see Changed)". Commit 21878d97 shows the original bullets at lines 27-28. The verifier's grep was case-sensitive and missed "Not yet proven" at CHANGELOG.md:29. Only the line numbers were out of date, and those are fixed above.
- The missing scaffold-project.test.sh test (FIX-002). The test with that title existed at commit 3e27acd1 (line 2520). FIX-002 retargeted it, as required, and it is now packages/core/scripts/scaffold-project.test.sh:2520, "FIX-002: rebase-project.md delegates the agent steps to the engine in one call". The verifier searched for the old title after the rename.

NO ACTION
- O1, O2 and O4 are built and tested. So are the parts of O3 and O5 not listed above (the removed sections, the single engine call, the readout, rollback, and the fixture's file checks).

Could Not Verify, rewritten in docs/TRD/rebase-prompt-on-the-engine.md, now holds three entries: no PRD; the headless run not yet made; the CLAUDE_PLUGIN_ROOT question. The old "settings conflict is not planted" entry was a gap this audit confirmed, so it moved to the O3 line above. Separately, CHANGELOG.md:32 still says no headless /rebase-project run has been made. That is true until the run happens.
