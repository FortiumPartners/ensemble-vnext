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
