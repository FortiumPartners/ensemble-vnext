VERDICT: do not proceed until the audit's in-place TRD edits are guarded so they cannot delete content (its first live run truncated this TRD; repaired by hand)

# Audit report: audit-notes-not-rounds

- Date: 2026-10-22
- Audited commit: c8111f7
- TRD: docs/TRD/audit-notes-not-rounds.md
- PRD: none
- Findings: 12 · applied: 4 · rejected: 2 · still unverified: 6 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/audit-notes-not-rounds.md    PRD: none

VERDICT: do not proceed until the audit's in-place TRD edits are guarded so they cannot delete content (its first live run truncated this TRD; repaired by hand)

Coverage: all 5 verifiers reported. 3 requirements and 3 tasks were indexed. No PRD exists, so validation against product requirements did not run.

MISMATCH — no task covers a fix, so this is reported for design, not chained
- In-place citation fixes, objective O2: the first live run of the widened reconcile stage deleted part of this TRD. To rewrite Could Not Verify, the agent grepped for "## Could Not Verify" (the instruction at packages/core/workflows/audit-build.js:481). The first hit was a quote of that phrase in the middle of FIX-002's grounding, and the agent replaced everything from there to the end of the file. That removed the rest of FIX-002's grounding, all of FIX-003's grounding and the real heading. Nothing in the workflow checks that an edit leaves the TRD's other headings in place. The TRD was restored by hand from c8111f7, keeping the agent's citation fixes, and the quote no longer contains "##". This defect predates the change, because the Could Not Verify rewrite already worked this way. But this change lets the agent edit anywhere in the TRD, so the guard is now part of making O2 safe.

FIXED THE CITATION
- The line numbers in FIX-001's grounding (audit-rounds.js, the lib that classifies audit findings) were corrected to the file as built: classify :69 (was :36), tally :91 (was :51), the deferred and gap rules :75/:79-80 (was :40/:41), the covered:false check in tally :97 (was :55), and the cli ctx/decide spread :208/:211 (was :164).
- FIX-002's grounding (the audit-build.js workflow) was corrected: report_only :102 (was :93), deferred read at :110, ACTIONS/CHECKS :167-168 (was :152-153), heading block ~656-675, verdict rule ~637-641. Both "Replaces" phrases are marked as removed; the widened opening is at ~:590-596.
- FIX-003's grounding (the /audit-build command) was corrected: workflow call :175 (was :171), heading block ~419-433 with the two new headings at :427-429 (was ~403-405), "After the workflow returns" ~252-385, commit block :336-337.
- Only descriptive text was edited. No objective, acceptance criterion or task requirement changed.

REJECTED THESE FINDINGS
- "PMI-T003 / PMI-P002 do not resolve" (confirm-wanted): the TRD says these are ids from forge-vnext's pm-interface TRD. They were never going to be found in this repo. Objectives O1/O2 in docs/TRD/audit-notes-not-rounds.md name that repo, so this is not a defect. Could Not Verify now records that they were not checked.
- "No PRD supplied" (validation): this is true, but it describes the audit's coverage, not the code. The TRD's header says on purpose that this change has no PRD. It is recorded in Could Not Verify.

NO ACTION
- All 3 tasks are built and tested: FIX-001 (the new lib classes), FIX-002 (the workflow prompt) and FIX-003 (the command wiring). audit-rounds.test.js, audit-build.test.js and verify-command-surface.test.js pass, 387 tests across the 3 suites. The .claude/ mirrors are byte-identical to packages/core/.

Could Not Verify in docs/TRD/audit-notes-not-rounds.md was rewritten. The 3 tasks were checked and removed from it. Added: no PRD; the forge-vnext evidence was not checked; this run's truncation and repair. Kept: the in-place edits are model-made (this run is the first live instance), the kind classification is the owner's call, and the web-chat-parity non-reproduction was not re-run.
