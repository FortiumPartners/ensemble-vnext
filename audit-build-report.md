VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the old-run seam case (FIX-004 case f) plays a merge path the current contract no longer takes, so O4's "no judgedHead recorded" path has no behavioural test; FIX-001 case (e) checks a git diff instead of running custody; a model session following the new contract prose is still unproven live

# Audit report: resume-re-proves-a-moved-pr-head

- Date: 2026-11-13
- Audited commit: b4c6708ffe634bca0641edfee9d165cf7a1f658e
- TRD: docs/TRD/resume-re-proves-a-moved-pr-head.md
- PRD: none
- Findings: 4 · applied: 2 · rejected: 0 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/resume-re-proves-a-moved-pr-head.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the old-run seam case (FIX-004 case f) plays a merge path the current contract no longer takes, so O4's "no judgedHead recorded" path has no behavioural test; FIX-001 case (e) checks a git diff instead of running custody; a model session following the new contract prose is still unproven live

Audit coverage: 5 of 5 verifiers reported; 4 objectives and 5 tasks indexed. No PRD exists for this work (it fixes GitHub issue #98), so the code was checked against the TRD only. Nobody checked whether the TRD's objectives fully and faithfully cover the issue.

TRACEABILITY GAPS
- Recovering a run that is stuck on a moved head and was saved before the head-it-last-judged key (`judgedHead`) existed (O4). The code is right but its test proves a different path. Commit 897b51a7 changed the merge contract (packages/core/contracts/ship-primitive-merge.md:108-112): when no `judgedHead` is recorded, the merge waits for CI once, then merges pinned to the new head. It returns no `moved` result, spends no loop round and adds no issues line. The seam test's `playMerge` (packages/core/lib/ship-build.seam.test.js:531-537) never checks that `judgedHead` is recorded, so case (f) (lines 933-959) still asserts `first.moved` and runs collect-findings. Nothing plays the contract's real path: CI wait on B, then `--match-head-commit B`, then no `moved`. Only a prose pin covers it (ship-primitives.test.js:349). Task FIX-004 covers this, so it chains to /implement-trd --reconcile on this run.

UNTESTED-IN-PRACTICE
- Sync-head criterion (e) in FIX-001 says that once a local commit touching only record files is merged with the tip, `custody.js reconcile --head <tip>` stops refusing. The test (packages/core/lib/merge-up.test.js:209-216) only checks that `git diff --name-only` lists the record file and never calls custody. The behaviour looks right. Chains to /implement-trd --reconcile on this run, under FIX-001.

FIXED THE CITATION
- FIX-002's grounding pointed at ship-sequencer.test.js:913 as the line that reads the snapshot's `loop.on`. That read is at line 911 (`toMatchObject({ on: 'red', rounds: 2 })`), and the TRD now says 911. The other citation, ship-primitives.test.js:300, was already correct.

REJECTED THESE FINDINGS
- none. All four findings held up when I re-opened the cited files.

NO ACTION
- O1, O2 and O3 are implemented and have tests that assert specific outcomes (sync-head cases a-i, the sequencer's loop-on-list cases, seam cases a-e, contract-prose pins).

Could Not Verify, rewritten in the TRD: added a row saying no PRD was supplied. Kept the three rows the audit did not check: the Storybook replay, a live model session, and the cost for runs saved before `judgedHead` existed. Each now says why it was out of scope.
