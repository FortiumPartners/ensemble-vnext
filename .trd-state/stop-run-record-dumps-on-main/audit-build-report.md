VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the change has no PRD; its source is the owner's ruling and the brief, so only TRD-to-code traceability was checked); the design-render walk test (design-render-walk.test.js) needs Chromium and was not run by this audit, so its relocated fixture is proven passing only by CI; the brief's survey of outside readers of these files was not re-run.

# Audit report: stop-run-record-dumps-on-main

- Date: 2026-11-11
- Audited commit: c1eb94c2656907765a2f9d6cf8c2fe7240284e9d
- TRD: docs/TRD/stop-run-record-dumps-on-main.md
- PRD: none
- Findings: 7 · applied: 5 · rejected: 2 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/stop-run-record-dumps-on-main.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the change has no PRD; its source is the owner's ruling and the brief, so only TRD-to-code traceability was checked); the design-render walk test (design-render-walk.test.js) needs Chromium and was not run by this audit, so its relocated fixture is proven passing only by CI; the brief's survey of outside readers of these files was not re-run.

Coverage: all 5 verifiers reported. 5 objectives and 3 tasks were indexed. No PRD was supplied, so validation is UNCHECKED.

FIXED THE CITATION (in docs/TRD/stop-run-record-dumps-on-main.md, descriptive text only)
- The refresh path's ensure_gitignore call (FIX-001, Careful line): cited at scaffold-project.sh:1899-1901. It is at :1904, and the citation now says so. While checking this I also found that the ensure_gitignore function ends at :1815, not :1812, and corrected that too.
- The source of the owner decisions (O4, O5): cited as "brief § Decisions", but the brief has no such heading. The decisions are the "Decisions:" lines under § Open questions, and the citation now points there.
- The nested-depth model test (FIX-002, Reuse line): cited at ~2874, actually at ~2981. Two neighbouring cites were also off and are corrected: the refresh test is at ~2815 (was ~2813) and the untrack test at ~2833 (was ~2829).
- The single-* ignore lines FIX-003 replaced: cited as .gitignore:73-80. On main they were at :72 and :78; the replacement ** lines are now at :75 and :83. The citation now gives all four.

REJECTED THESE FINDINGS
- "stack.md:158 still calls .trd-state/ git-tracked, which contradicts the new ignore lines" (owner question): no new contradiction. On main, .gitignore:72 and :78 already ignored .trd-state/*/findings/ and */evidence/ (check with git show main:.gitignore), and implement.lock and _command-runs/ were ignored too. This change widens existing exceptions, and the durable records stay tracked.
- "verification.md was changed outside /verification-setup" (owner question): commit a4b53f99 belongs to another feature on this branch (ship-custody-gates-merge), not to this TRD. Its message records the owner's approval: "Owner approval 2026-11-08 (option A, relayed by the product PM), standing in for /verification-setup" (git show a4b53f99).

NO ACTION: 5 of 5 objectives and 3 of 3 tasks are implemented and tested. The ignore template now has the five ** lines. ensure_gitignore turns a line ending in / into a pathspec ending in /**. Refresh calls ensure_gitignore with no argument. BATS tests at scaffold-project.test.sh:2880-2981 cover adding the lines, untracking at every nesting level, keeping durable records tracked, and refresh leaving the index unchanged. The walk boards were moved to test/fixtures/design/walk/boards/, and design-render-walk.test.js:14 reads them from there.

The Could Not Verify section is rewritten. It now adds that no PRD exists and that the audit did not run Jest, and it keeps the outside-readers row and the merge-transition row with the reason each was out of scope.