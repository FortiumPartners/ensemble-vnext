VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; a live merge on GitHub was not run for this fix (it was proven only against real local git repos); a merge step handed out again from main after the branch is deleted still stops at the custody gate (a separate limit this TRD leaves out of scope)

# Audit report: fix-ship-run-record-after-merge

- Date: 2026-11-08
- Audited commit: 0a1a08afe8325c3392a8dc5ba3b5d125b862b7c7
- TRD: docs/TRD/fix-ship-run-record-after-merge.md
- PRD: none
- Findings: 3 · applied: 3 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-ship-run-record-after-merge.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; a live merge on GitHub was not run for this fix (it was proven only against real local git repos); a merge step handed out again from main after the branch is deleted still stops at the custody gate (a separate limit this TRD leaves out of scope)

Coverage: all 5 verifiers reported. 5 objectives and 3 tasks were indexed. No PRD exists for this defect, so the build was checked against the TRD only. Whether it meets product requirements was not checked.

FIXED THE CITATION
- The Could Not Verify row cited custody.js:337-345 for the check that refuses a resume when local HEAD and the PR head differ. Those lines are only the JSDoc. It now cites custody.js:348-373, with HEAD read at 351 and the refusal at 371.
- Root cause and the Replaces lines under Task Grounding cited code this fix deleted: latestExternal, the push-link branch, and the 'check: push link' tests. They now say their line numbers are at base commit 2c4d123, before the fix. They also say where the code stands now: check accepts only pr-head, merge and deploy (custody.js:506), and the push tests became describe('check: unknown link (the push link is gone)') at custody.test.js:302.

REJECTED THESE FINDINGS
- none. Both citation findings held up when I reopened packages/core/lib/custody.js, custody.test.js and ship-sequencer.js.

NO ACTION
- All 5 objectives and all 3 tasks are built and tested. I re-ran the checks myself:
  - 399 of 399 Jest tests pass across custody, the sequencer, the contracts and the ship-build surface tests.
  - docs/plans/fix-ship-run-record-after-merge/repro.sh exits 0. Before the fix it exited 1.
  - All 5 edited packages/core files match their .claude/ copies byte for byte, and the packages/full/lib/ship-record-dir.js symlink is in place.

Could Not Verify, rewritten in /private/tmp/ensemble-vnext-feature-0-fix-ship-run-record-after-merge/docs/TRD/fix-ship-run-record-after-merge.md:
- Kept: the live GitHub merge. It is outside this fix's verification environment. The owner's 2026-11-08 ruling to prove a fix live on islayjames/ship-build-live-test was about the custody-ordering fix (PR #94), not this one.
- Kept: the custody-gate refusal when the merge step is handed out again from main. The TRD's Decision leaves it out of scope.
- Added: no PRD, so fidelity to product requirements is unchecked.
