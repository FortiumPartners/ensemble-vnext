VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this is a defect TRD with no PRD, so nothing checked the change against product requirements); the amendment's acceptance criterion (AMEND-001) expects a "next wake" line in the DISPATCHED banner of four commands, but only /implement-trd has a DISPATCHED banner at all, so the owner should confirm that is what was meant; two open questions in Could Not Verify: whether a live session really stops scheduling the fallback, and whether a dead session's wake-ups ever fire

# Audit report: cancel-backup-wakeup

- Date: 2026-11-05
- Audited commit: b60213d
- TRD: docs/TRD/cancel-backup-wakeup.md
- PRD: none
- Findings: 9 · applied: 6 · rejected: 1 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/cancel-backup-wakeup.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this is a defect TRD with no PRD, so nothing checked the change against product requirements); the amendment's acceptance criterion (AMEND-001) expects a "next wake" line in the DISPATCHED banner of four commands, but only /implement-trd has a DISPATCHED banner at all, so the owner should confirm that is what was meant; two open questions in Could Not Verify: whether a live session really stops scheduling the fallback, and whether a dead session's wake-ups ever fire

Coverage: 5 of 5 verifiers reported. 6 requirements and 3 tasks were indexed. Validation against a PRD did not run because no PRD exists.

FIXED THE CITATION (6, all corrected in place in docs/TRD/cancel-backup-wakeup.md; only descriptive text changed)
- Root-cause paragraph: the quoted DISPATCHED and scheduled-nudge wording is now marked as the text before the fix, with its old lines (command-status.md:17-23, async-discipline.md:117-122). The paragraph now points to where the delivered text lives: command-status.md:15-28 and async-discipline.md:108-122.
- FIX-001 Reuse: the section title "the scheduled nudge" was renamed when the rule was rewritten. The note now gives its current title, "dispatch, end the turn, nudge only if late".
- FIX-001 Careful: the byte sizes are now labelled as measured before the change (12,983 and 8,041). The delivered sizes are 13,377 and 7,684.
- FIX-002 Reuse: the line range for plan.md step 7a.6 was ~:1199-1201 and is now ~:1195-1197.
- FIX-002 Replaces: the quoted "Never on a chained run" wording was correctly removed, as the task required. The line now records the replacement at plan.md:1258, "Never on a handoff to a chained command".

REJECTED THESE FINDINGS
- The deterministic verifier reported AMEND-001 as unbuilt for /audit-build, /verify-build and /plan. That is wrong, because nothing in those files was left unchanged that needed changing:
  - verify-build.md and plan.md had no DISPATCHED banner and no ScheduleWakeup before the work started (checked at the base commit 537a3a9), and they still have none.
  - audit-build.md:283-286 now states that it schedules no fallback.
  - The DISPATCHED banner form every command uses, at .claude/rules/command-status.md:22, names "auto-deliver on completion".
  So the question is how the criterion is worded, not missing code. It is listed under ISSUES below.

NO ACTION (checked and confirmed)
- No "stop: true" remains in either copy of the commands or the rules.
- Both rule files say not to schedule a fallback wake-up for work Claude Code already tracks, and keep ScheduleWakeup for outside state such as CI, a deploy or a remote queue.
- implement-trd.md:2305 reads "auto-deliver on completion".
- audit-build.md step 0 still runs stale-wake.
- All four command mirrors and both rule mirrors are byte-identical to their sources.
- I re-ran the 19 tests in the "no fallback wake-up" group of verify-command-surface.test.js, and all 19 pass.
- FIX-001's and FIX-002's cancel criteria are marked as superseded by AMEND-001 in the TRD.

STATE
- docs/TRD/cancel-backup-wakeup.md was edited and is not committed: 6 citation fixes, plus a rewritten Could Not Verify section.
- The Could Not Verify section now has 3 entries: the missing PRD, live behaviour, and dead-session wake-ups. The two entries about the final-turn cancel were dropped, because AMEND-001 removed the cancel.

DECISIONS
- I treated AMEND-001's four-command wording as a question for the owner, not a gap. Adding DISPATCHED banners to commands that dispatch nothing they would have to wait on would be new scope.

ISSUES
- Owner: confirm that AMEND-001's "the four commands' DISPATCHED next wake lines" is met by the single shared banner form in command-status.md plus implement-trd's own banner. If it is, reword the criterion with /refine-trd. If not, say which commands should gain a banner.

NEXT
1. Settle the AMEND-001 wording (the ISSUES item above), if it needs a change:
```
/refine-trd docs/TRD/cancel-backup-wakeup.md
```
