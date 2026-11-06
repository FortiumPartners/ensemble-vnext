VERDICT: proceed with these caveats: planned, not built yet: the end-to-end live runs (DQ-T002), a [LIVE] task set aside unless --include-deferred; planned, not built yet: the first calibration replay and its record RESULTS.md (DQ-T003), a [LIVE] task set aside by default, so the PRD goal that the critic's scores can be trusted (G5) has no evidence yet; the test that an old-template design.md reads as unfilled now returns early and asserts nothing (D6); replay.js reports an "agreement by band" figure that uses a cut point TRD decision D16 rejected; two Could Not Verify rows remain open until DQ-T002 runs

# Audit report: design-quality

- Date: 2026-11-06
- Audited commit: 82b31ca
- TRD: docs/TRD/design-quality.md
- PRD: docs/PRD/design-quality.md
- Findings: 16 · applied: 3 · rejected: 6 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/design-quality.md    PRD: docs/PRD/design-quality.md

VERDICT: proceed with these caveats: planned, not built yet: the end-to-end live runs (DQ-T002), a [LIVE] task set aside unless --include-deferred; planned, not built yet: the first calibration replay and its record RESULTS.md (DQ-T003), a [LIVE] task set aside by default, so the PRD goal that the critic's scores can be trusted (G5) has no evidence yet; the test that an old-template design.md reads as unfilled now returns early and asserts nothing (D6); replay.js reports an "agreement by band" figure that uses a cut point TRD decision D16 rejected; two Could Not Verify rows remain open until DQ-T002 runs

Coverage: 5 of 5 verifiers reported, against docs/PRD/design-quality.md; 51 requirements and 17 tasks indexed.

MISMATCH
- replay.js scores a frame "good" when its mean rounds to 4 or 5 (bandAgreement, test/design-critique-corpus/replay.js ~line 93; README lines 69-71). D16 rejected exactly this ("a cut point — an invented threshold"). It only reports and gates nothing, and the ranking measure D16 asked for is also there. The owner decides: keep it and amend D16 through /refine-trd, or remove it through /implement-trd --reconcile.

UNTESTED-IN-PRACTICE
- The prior-template check (D6, DQ-B001): the design-map.test.js test at ~line 382 returns early whenever HEAD's template contains "5. Design direction", which it now always does. So nothing tests that a design.md holding the previous template reads as unfilled. The hash in design-map.js:45 is correct today; the gap is that nothing would catch it changing. Chains to /implement-trd --reconcile.

PLANNED, NOT BUILT YET
- DQ-T002, the [LIVE] end-to-end runs (/create-design --auto and --explore, /audit-design, /refine-design --auto, one run with publishing on). No run happened and .trd-state/design-quality/evidence/live/ does not exist. Its acceptance criteria are covered by Jest prose and workflow tests and by fixture harnesses, never by a real command run.
- DQ-T003, the [LIVE] first calibration (replay.js --runs 3, then commit test/design-critique-corpus/RESULTS.md). The file is absent. Two-run replays from the verification loop exist only in ignored evidence (FS-40-live-replay-stdout.txt). G5 and AC-F9.3 depend on this task alone.

FIXED THE CITATION
- DQ-T003 grounding (Touches): it said test/design-critique-corpus/ did not exist. It now lists what DQ-B010 delivered (README, labels.jsonl, replay.js, replay.test.js, frames/, measures/).
- DQ-P003 grounding: the AC-F3.6 test needle is now marked as an id from the design-stage PRD, not this one.
- Could Not Verify rewritten. Removed as confirmed: walk boards render offline (design-render-walk.test.js) and measurement runs in the iframe through page.frames() (design-render.test.js). I re-ran both and they pass. Kept: PNG reading by workflow agents and relay of measures, both waiting on DQ-T002, and how often the runtime changes, which needs time.

REJECTED THESE FINDINGS
- ".claude/design-packs does not exist" (D7): TRD line 130 names it as a rejected alternative, not a location.
- "test/fixtures/design/walk does not exist" (D17): TRD line 140 names it as a rejected alternative, and line 596 calls it OQ-10's alternative.
- ".claude/skills/design-setup/template.md missing": TRD line 610 already says this repo has no such folder. design-map.js:40 reads it from the consuming project.
- Evidence paths of DQ-T002 and DQ-T003 "do not exist": they are outputs of deferred tasks, described as still to be written, and are covered under PLANNED.
- Playwright and @babel/standalone "outside stack.md": neither was introduced by this feature. main's packages/core/lib/design-render.js:243 already loads Playwright from the project, and main's __fixtures__/design/dc-runtime.js already names babel/standalone@7.29.0. Adding them to stack.md is the owner's call, separate from this feature.

NO ACTION
- Every other indexed requirement: implemented, tested and sourced.
