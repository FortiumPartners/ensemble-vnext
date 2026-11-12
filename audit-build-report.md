VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; nothing tests that both close commands list each filed issue's URL in their STATE section; FIX-006's two literal grep acceptance checks fail as written, though the text they check is correct; no real GitHub issue was filed and no Linear or Jira tracker was exercised.

# Audit report: every-waived-failure-filed-as-a-defect-issue

- Date: 2026-11-12
- Audited commit: 53ca2af5a7772c6be9363adf2f501e1987cec80c
- TRD: docs/TRD/every-waived-failure-filed-as-a-defect-issue.md
- PRD: none
- Findings: 11 · applied: 8 · rejected: 2 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/every-waived-failure-filed-as-a-defect-issue.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; nothing tests that both close commands list each filed issue's URL in their STATE section; FIX-006's two literal grep acceptance checks fail as written, though the text they check is correct; no real GitHub issue was filed and no Linear or Jira tracker was exercised.

Coverage: all 5 verifiers reported. 14 requirements and 7 tasks indexed, and all 7 tasks are recorded as done. No PRD was supplied, so this audit could not check whether the TRD faithfully captures the owner's ruling or leaves anything out. It checked only TRD against code.

TRACEABILITY GAPS
- The close commands list filed issues in STATE, but nothing tests it (IC-5). Both close-feature.md:74 and audit-build.md:337 say "STATE lists each filed issue URL with its criterion". No test asserts that sentence; waived-defects-close-prose.test.js pins everything else in the close step. FIX-004 covers it, so this goes to /implement-trd --reconcile.

FIXED THE CITATION (in docs/TRD/every-waived-failure-filed-as-a-defect-issue.md; edits since the base commit dd0764bb moved these lines)
- recordNonBlockingFollowups is at functional-verification.js:1621, not :1582 (Intended Change and FIX-002 grounding).
- The [non-blocking] prefix is at :1643,1657, not :1605 (FIX-001 grounding).
- The **Not blocking** report line is at :1833, not :1780. The read-blocking-policy CLI is at :3248, not :3195.
- BLOCKING_ACTIVE is at verify-functional.js:168, not :156.
- The tests FIX-002 must keep green are at functional-verification.test.js 2475, 2535 and 5366. The 5366 block was cited as 5294.
- The FIX-002 grounding named a function trackerReachable that does not exist. It now names parseTracker / readTracker, and says reachability is checked by gh repo view inside gate (waived-defects.js:236) and by applyTrackerGate (functional-verification.js:1197).

REJECTED THESE FINDINGS
- The claim that six owner-facing files never say "defect issue" (FIX-006) is wrong. In plan.md:393-394, create-trd.md:239-240 and trd-authoring.md:152-153, and their .claude/ copies, the text reads "filed as a defect / issue", with the line break falling between the two words. A single-line grep misses it; the content is correct. packages/skills/verification-setup/template.md contains the phrase, contrary to the finding. packages/core/commands/waived-defect-wording.test.js matches /defect\s+issue/ in all eight source files and passes, 35 of 35 with the close-prose test.
- The claim that "listed and filed as" still appears (FIX-006) is wrong in substance. The only hit is the not.toContain check in waived-defect-wording.test.js:25. The owner-facing text is clean.
- Both rejections leave one loose end: FIX-006's acceptance criterion is a literal grep command, and as written it fails on both counts. That wording is the TRD's requirement, so this audit did not edit it. Rewording it is a /refine-trd decision.

NO ACTION: the other 13 indexed requirements are implemented and tested. The headless fixture run (FIX-007) left its evidence under .trd-state/every-waived-failure-filed-as-a-defect-issue/evidence/live/FIX-007/.

The TRD's Could Not Verify section now lists three items: no PRD was checked, Linear and Jira reachability is assumed, and no real GitHub issue was filed.