VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the readout's "skipped features, with why" line (objective O7) is built but no test pins it; two out-of-scope checks remain open in Could Not Verify (a Claude Code Web session's ref push/fetch, and whether Forge needs finished records in main's tree or only its history)

# Audit report: cutover-for-existing-projects

- Date: 2026-11-12
- Audited commit: 4b6eee57dd1357221157441db2a0e2686a8a3265
- TRD: docs/TRD/cutover-for-existing-projects.md
- PRD: none
- Findings: 5 · applied: 3 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/cutover-for-existing-projects.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; the readout's "skipped features, with why" line (objective O7) is built but no test pins it; two out-of-scope checks remain open in Could Not Verify (a Claude Code Web session's ref push/fetch, and whether Forge needs finished records in main's tree or only its history)

Coverage: 5 of 5 verifiers reported. 8 objectives and 3 tasks were checked against the code. There was no PRD, so checking the TRD against product requirements did not run. Only TRD-to-code traceability was checked.

TRACEABILITY GAPS — built, but no test proves it
- The skipped-features part of the /rebase-project readout (O7). The Step 4.7b report line "skipped: <slug> (why)" is at packages/core/commands/rebase-project.md:1151. packages/core/commands/records-cutover-prose.test.js checks for "files untracked", "refs seeded", [WARN] and ISSUES, but has no assertion on "skipped". The prose-test task (FIX-003) serves O7, so this chains to /implement-trd --reconcile. O7 is not must-pass.

FIXED THE CITATION (descriptive text only, in docs/TRD/cutover-for-existing-projects.md Task Grounding)
- The FORGE_FEATURE_ID read in the record-ref.js task (FIX-001): it now reads `:798` before this change, `:800` as built.
- The scaffold anchors in the --records-cutover task (FIX-002), which follow the existing `ensure_gitignore` function and the `--git-files` flag pattern: as built they are `:1811`, `:115`, `:183-185` and `:2228`. The pre-change anchors are kept beside them. The old exclusivity range `:163-169` is narrowed to `:164-166`, which `git show 211cccce` confirms.
- These citations were not invented. They were correct when the TRD was written (checked against commit 211cccce) and moved when this feature added lines. The "Before" section (`scaffold-project.sh:1781-1830`) is a dated snapshot of the pre-change code and is still accurate, so I left it alone.

REJECTED THESE FINDINGS
- none. Every citation finding was confirmed by re-opening packages/core/lib/record-ref.js and packages/core/scripts/scaffold-project.sh.

NO ACTION — 7 of 8 objectives are built and tested.

Could Not Verify, rewritten: it now records that product-requirement validation was not run (no PRD), and keeps the two out-of-scope items, each with why it is out of scope.

STATE
- Round 1 of at most 3. The only open item was a missing test, and no defect was found. The test gap went to the fix run, so the feature closes with no second audit.
- Fix run: 1 of 1 tasks built. New assertions in packages/core/commands/records-cutover-prose.test.js now check every report element objective O7 names: the skipped features with why, the seeded refs with pushed or kept local, and the folders the untracked files came from (commit 437644ee).
- The end-of-run code review applied 4 fixes (commit b60e4393). A finished sweep's ship-only folder no longer gets a ref. `git rm --cached` now reads record names literally, so a `[` or `*` in a file name no longer untracks its neighbours. A verification note that gave the wrong order for the seed line is corrected. The prose test no longer reads the file twice.
- Tests: the cutover's Jest suites (215 tests) and its 4 BATS tests pass, and ShellCheck is clean. Across the full Jest battery, 7 suites fail. They are the same environmental 7 recorded at the first checkpoint (Node 26 status test, the skill-template copy, Playwright Chromium not installed), and none of them touches this feature.
- Notes: 3 TRD citations corrected (line numbers that moved when this feature added code), and Could Not Verify was rewritten.
- The feature is closed, and its anchor commit (where a later /ship-build starts its re-proof) is b60e4393.

DECISIONS
- The code review covered only this feature's own commits, not the whole range since local `main`, because local `main` is behind `origin/main`.
- A first review attempt failed on a connection error before it changed anything. It was retried once, and the retry completed.

ISSUES
- Four review findings were left for a later change. None blocks the feature, and each is recorded as a non-blocking discovery. The owner decides whether to plan them:
  - A seeded feature's ref can still be overwritten. If that feature pushes its own records while /rebase-project is running, the seed's push is rejected and the older copy from the worktree is laid over the newer one. Closing this needs a compare-and-push option in record-ref.js.
  - `no-branch` skips are listed in ISSUES once per worktree, which can flood the rebase readout on a project with many old unclosed folders.
  - forge_feature_id is read from the tracked shipped.json, not from the current ship run, so a stale copy can leave it null.
  - The Rollback step `git restore --staged .trd-state` also unstages any edits the owner had staged under .trd-state.
- Two checks stay open in Could Not Verify because they are out of this feature's scope: whether the records ref pushes and fetches in a Claude Code Web session, and whether Forge needs finished records in main's tree or only in its history.

NEXT
1. Ship it:
   /ship-build docs/TRD/cutover-for-existing-projects.md
