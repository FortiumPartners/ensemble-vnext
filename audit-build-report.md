VERDICT: proceed with these caveats: planned, not built yet: CBD-T002 -- whether the hosted canvas visibly shows the [Core] mark needs a design round on the live canvas service, and the request itself defers it; the canvas.json shape the mark is written into (boards[<file>].title) rests on one sample read outside the repo and is unconfirmed (still in Could Not Verify); three design-criteria.test.js cases could not be confirmed on this machine because copying the fixture's screens/png directory fails with a file-permission error (EPERM) in this checkout before they assert anything (still in Could Not Verify)

# Audit report: core-boards-in-designs

- Date: 2026-11-16
- Audited commit: bdf09be66c12e9f4e208b9a23d3fe9cd7d35a77a
- TRD: docs/TRD/core-boards-in-designs.md
- PRD: docs/plan/core-boards-in-designs.investigation.md
- Findings: 4 · applied: 5 · rejected: 1 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/core-boards-in-designs.md    PRD: docs/plan/core-boards-in-designs.investigation.md

VERDICT: proceed with these caveats: planned, not built yet: CBD-T002 -- whether the hosted canvas visibly shows the [Core] mark needs a design round on the live canvas service, and the request itself defers it; the canvas.json shape the mark is written into (boards[<file>].title) rests on one sample read outside the repo and is unconfirmed (still in Could Not Verify); three design-criteria.test.js cases could not be confirmed on this machine because copying the fixture's screens/png directory fails with a file-permission error (EPERM) in this checkout before they assert anything (still in Could Not Verify)

Coverage: all 5 verifiers reported. 10 requirements and 13 tasks were indexed. Source: docs/plan/core-boards-in-designs.investigation.md, an investigation record used in place of a PRD.

PLANNED, NOT BUILT YET
- Visible Core mark on a live canvas (O7, CBD-T002 [LIVE]): coreMarks() in packages/core/lib/design-map.js writes "[Core] " into the canvas.json title, and design-map.test.js tests that. Nobody has checked the hosted canvas. docs/reference/design.md says so under "Not yet proven". This is a note, not work.

FIXED THE CITATION (TRD now v1.1.1; descriptive text only, no objective, criterion or task changed)
- D5's "AC-F2.3" now names its source: AC-F2.3 of docs/PRD/design-stage.md.
- Risk table (§7.1, Hazard 2): bare `sync-design.js` is now packages/core/workflows/sync-design.js. `git diff main...HEAD` confirms the branch does not touch it.
- D24 fixture description (the verifier filed this as a mismatch): D24 now describes the fixture as built. It has 14 entries: 12 screen boards plus a part and a flow, 8 of them Core. The 4 evidence-only rows are state frames of Core boards. The 4 non-Core boards each test one exclusion rule.

REJECTED THESE FINDINGS
- D24 as a MISMATCH. The fixture differs from D24's old wording but does what is required. Running `design-criteria.js comparison-rows` on it gives 12 rows: 8 core and 4 evidence-only, with nothing missing. That meets O3, CBD-B003 and CBD-T001 as written, and design-criteria.test.js and core-boards-seam.test.js both pass on it. The one route the fixture leaves out, a non-Core board that still yields an evidence-only row, is proven on the trips-refresh copy (design-criteria.test.js line 118, `01-home--as-is`). Only the description was wrong, so it was corrected above and nothing goes to /implement-trd.

NO ACTION
- The other 9 requirements are implemented, tested and sourced. design-map.test.js and core-boards-seam.test.js pass in full. design-criteria.test.js passes 18 of its 21 cases; its 3 failures are EPERM inside the test's fixture-copy helper (Node 26.12 fs.cpSync on a directory that in this checkout carries a setgid bit and a macOS provenance attribute; copying a single file from it succeeds), not a wrong result. The same behaviours pass elsewhere: the missing-frame case on the trips fixture, and the cap check in design-map.test.js.

Could Not Verify in docs/TRD/core-boards-in-designs.md is rewritten to three rows: the canvas.json shape, the live Core mark (CBD-T002), and the three design-criteria cases blocked by EPERM.
