VERDICT: proceed with these caveats: the NativeWind bundling recipe has no unit test (AC-F4.3); the task record still marks the two live fixture-run tasks (DSGN-T002, DSGN-T003) "deferred" although the verification loop ran them; the parts-only Flutter run used a stand-in folder, not the flutter-widget fixture the PRD names (NFR-7); the optional "competitor patterns" grounding step was never built (AC-F8.2), and the owner needs to say whether it is wanted; refining a design from a canvas comment has never been exercised, because no tool here can create a comment (AC-F9.2, AC-F9.3); planned, not built yet: DSGN-T004 -- it runs only after the fixture build merges, a separate release after DSGN-T003; planned, not built yet: DSGN-T005 -- the owner has to look at the hosted canvases, and it needs a publish from the james account

# Audit report: design-stage

- Date: 2026-11-05
- Audited commit: a9d75ac
- TRD: docs/TRD/design-stage.md
- PRD: docs/PRD/design-stage.md
- Findings: 15 · applied: 2 · rejected: 7 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/design-stage.md    PRD: docs/PRD/design-stage.md

VERDICT: proceed with these caveats: the NativeWind bundling recipe has no unit test (AC-F4.3); the task record still marks the two live fixture-run tasks (DSGN-T002, DSGN-T003) "deferred" although the verification loop ran them; the parts-only Flutter run used a stand-in folder, not the flutter-widget fixture the PRD names (NFR-7); the optional "competitor patterns" grounding step was never built (AC-F8.2), and the owner needs to say whether it is wanted; refining a design from a canvas comment has never been exercised, because no tool here can create a comment (AC-F9.2, AC-F9.3); planned, not built yet: DSGN-T004 -- it runs only after the fixture build merges, a separate release after DSGN-T003; planned, not built yet: DSGN-T005 -- the owner has to look at the hosted canvases, and it needs a publish from the james account

Coverage: all 5 verifiers reported, the PRD was supplied, and 48 requirements and 22 tasks were indexed.

TRACEABILITY GAPS
- NativeWind recipe untested (AC-F4.3). Line 112 of `design-bundle.js` sets `jsxImportSource: 'nativewind'`, and `design-bundle.test.js` never mentions NativeWind, even though DSGN-B003's own acceptance text requires that test. A live run did show the recipe working (FS-12). Covered by DSGN-B003, so it goes to /implement-trd --reconcile.

MISSING IMPLEMENTATION
- Competitor patterns in grounding (AC-F8.2, "optionally"). The ground stage in `create-design.js` writes 5 files and none of them covers competitors. Covered by DSGN-B007. The owner should confirm it is wanted before it goes to /implement-trd --reconcile.

MISMATCH
- Stale task record for the live runs (DSGN-T002, DSGN-T003). `implement.json` still says "deferred: folder-trust prompt", but the verification loop ran create, refine, audit and build live (FS-20 to FS-57 met). Re-attesting them goes to /implement-trd --reconcile. The comment-driven refine part (FS-42) stays open.
- Flutter stand-in (NFR-7). FS-71's parts-only run happened in the React Native folder with `design.md` set to Flutter (`evidence/r2/fs71-summary.txt`). The code path works; the run on the named fixture is missing. Goes to /implement-trd --reconcile.

PLANNED, NOT BUILT YET
- DSGN-T005 covers the installed design system drawing on the hosted canvas (AC-F6.7), the NativeWind board on the hosted canvas (AC-F15.1) and a publish from the james account (AC-F15.2). It is owner-attended.
- DSGN-T004 covers the live run of /sync-design and /audit-design --drift (AC-F13.1 to AC-F13.7, FS-58 to FS-63). It waits for the fixture build to merge. The owner-ruling gate (AC-F13.4) is already unit-tested in `sync-design.test.js`.

FIXED THE CITATION
- TRD §3.1 `setup()`: the wording now says the template path is relative to the project (`<projectDir>/.claude/skills/...`) and is vendored from `packages/skills/design-setup/template.md`. The path itself was right.

REJECTED THESE FINDINGS
- AC-F8.5, "nothing proves the map carries screenshot_match": refuted by `evidence/iter3/cd/design-map.json:46-47` (a live map holding `screenshot_match: false` plus its note).
- NFR-7, "live runs have not happened", and DSGN-T002 / DSGN-T003 "never executed": refuted by `evidence/r2/fs71-summary.txt` (three /create-design runs reached COMMAND COMPLETE), the iter3 and iter4 run panes, and `evidence/iter5/verification-report.md` (DC- criteria from a TRD built from a design).
- The `.claude/skills/design-setup/template.md` "does not resolve" citation: `design-map.js:32` reads exactly that path inside the consuming project, and `scaffold-project.sh` vendors framework skills there. Only the wording was clarified.
- The `docs/ui/x/...` citations: they are a `git check-ignore` probe of example paths plus a test fixture that `docs-audit-assemble.test.js:144` creates in a temporary repo. Neither needs to exist.
- "stack.md not updated for playwright, esbuild and react": refuted by the TRD's Resolved Questions OQ-2, the owner's ruling "Add deps, stack.md untouched (Recommended)".

NO ACTION
- 41 of the 48 indexed requirements raised no finding that survived checking.

The Could Not Verify section is rewritten. Seven claims were confirmed by live evidence or unit tests and removed. The hosted-draw claim moved to this readout. Four rows remain open: canvas limits, fiber keys under react-native-web, the comment-driven refine, and the real flutter-widget fixture.
