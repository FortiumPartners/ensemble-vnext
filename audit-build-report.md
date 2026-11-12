VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; four of the delivered behaviours are correct but no automated test would catch them regressing (the phase checkpoint's commit-then-record-then-write order, ensure-before-write in /close-feature and /audit-build, the push step writing the ref before the branch push, and a writers test too loose to catch one removed write line); two live paths remain unverifiable here (Claude Code Web pushing refs/ensemble/*, and the ship-resume workflow on a real GitHub runner)

# Audit report: writers-move-to-the-ref

- Date: 2026-11-12
- Audited commit: 5a11e98acbb7b5eb8c32b9b58d8c7f297148ca06
- TRD: docs/TRD/writers-move-to-the-ref.md
- PRD: none
- Findings: 8 · applied: 2 · rejected: 1 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/writers-move-to-the-ref.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; four of the delivered behaviours are correct but no automated test would catch them regressing (the phase checkpoint's commit-then-record-then-write order, ensure-before-write in /close-feature and /audit-build, the push step writing the ref before the branch push, and a writers test too loose to catch one removed write line); two live paths remain unverifiable here (Claude Code Web pushing refs/ensemble/*, and the ship-resume workflow on a real GitHub runner)

TRACEABILITY GAPS — implemented, no test proving it
- Phase checkpoint order (O3, and the TRD's After item 3, which is the same gap): implement-trd.md Step 5 commits product code first, reads COMMIT_SHA after that commit, records the checkpoint, then writes the ref (lines 1305-1340). No test pins this order, so moving the write above the commit would keep every test green. The task that covers it is FIX-004, so this chains to /implement-trd --reconcile.
- Restore-before-first-write (O10): close-feature.md:51 and audit-build.md:31 both call `record-ref.js ensure`. But neither file is in records-ref-readers-prose.test.js's FIRST_READ ordering map, verify-command-surface.test.js:876 only checks that audit-build contains the string, and no test names `ensure` for close-feature at all. Covered by FIX-005, so this chains to /implement-trd --reconcile.
- Push step writes the ref before `git push` (O5): ship-primitive-push.md Do step 3 does this with --no-fallback, and its sweep pathspec leaves out every .trd-state/ path. The only check is a contains-string test; ship-primitives.test.js asserts nothing about either behaviour. Covered by FIX-006, so this chains to /implement-trd --reconcile.

UNTESTED-IN-PRACTICE
- The writers prose test (FIX-009) checks only that each touched command contains `record-ref.js write` at least once. FIX-009's own acceptance criterion says the test must fail when any one write line is removed. implement-trd.md has 3 such lines and ship-build, plan and sweep have 2 each, so removing one write before a banner still passes. Chains to /implement-trd --reconcile.

FIXED THE CITATION
- FIX-001's grounding cited `currentBranch(top)` at record-ref.js:136. Since this change it sits at :148; the TRD now says `:148; :136 before this change`.

REJECTED THESE FINDINGS
- The scaffold test line number (Intended Change, scaffold-project.test.sh:2912): this sentence is in the Before section and describes the code before the change. At the commit before this feature (5f5b9cf1^), line 2912 is exactly the cited test, "durable run records are never ignored and stay tracked". The test now at :2913 pins the reversed premise (records ignored, still tracked), so moving the citation there would make the sentence wrong. What refutes the finding: `git show 5f5b9cf1^:packages/core/scripts/scaffold-project.test.sh`.

COULD NOT VERIFY (rewritten in the TRD)
- Added: no PRD exists (the source is roadmap item 3), so validation against product requirements was never run.
- Kept: Claude Code Web ref push/fetch, and ship-resume.yml on a real runner. Both are out of scope on this machine.
- Removed: "this run's early checkpoints may commit .trd-state/writers-move-to-the-ref/". Checked: `git log origin/main..HEAD -- .trd-state/writers-move-to-the-ref` is empty, nothing under that path is tracked, and refs/ensemble/records/writers-move-to-the-ref exists.

NO ACTION
- The remaining 15 of 19 indexed requirements raised no finding from any of the 5 verifiers.

Files: /private/tmp/ensemble-vnext-feature-30-writers-move-to-the-ref/docs/TRD/writers-move-to-the-ref.md