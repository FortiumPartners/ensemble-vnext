# Investigation: core-boards-in-designs

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-3 of workplan `storybook-framework-requests` (roadmap
`docs/plans/storybook-framework-requests/roadmap.md` item 3, committed on local `main` at
`bf2cf062`, not on this branch). The roadmap item, verbatim:

> In /create-design (and its refine, audit and verify siblings), mark at most 8 boards as Core:
> the main screens in their normal state, with a visible Core mark on the canvas and a flag in
> design-map.json. Core boards stay must-pass, pixel-perfect design comparisons. Every other
> board (errors, loading, empty, edge cases, extra viewports) becomes evidence only: its
> screenshot is produced for review and never fails verification; its behaviour is proven by
> forced-state component tests. A design with more than 8 candidates picks 8 and says which
> were left out. Designs made before this change count every board as Core until refined.
>
> How it will be checked: jest tests on design-map.json handling and the
> verify-design-comparison criteria generation; a fixture design with 12 boards yields 8
> must-pass and 4 evidence-only criteria.
>
> Deferred checks: a live canvas run showing the visible Core mark waits on a design round
> using the canvas service.

The owner's words behind it (roadmap source spec): *"I care that the core UI of the app is
pixel perfect... in most UI designs it's 3, 5, MAYBE 8 boards that matter. Not the 50, 60, 80
that we often produce."* The 8-board cap is an OWNER-CALL recorded in the roadmap's open
questions.

Scope: this feature only. The other three roadmap items (audit before verification, a cap on
verification runs, per-kind artifact publishing) are built separately and are not touched here.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `design-map.json` carries a per-board Core flag; validation rejects more than 8 Core boards and a Core flag on a `part` or `flow` board | roadmap item 3 brief | yes |
| O2 | A map in which no board carries the Core flag (a design made before this change) reads every screen board as Core | roadmap item 3 brief ("count every board as Core until refined") | yes |
| O3 | The design-comparison criteria are generated deterministically from the map: the default-state frame of each Core board yields a must-pass criterion; every other frame (non-Core boards, and non-default states of Core boards) yields an evidence-only criterion. A 12-board fixture design with 8 Core boards yields exactly 8 must-pass and 4 evidence-only criteria | roadmap item 3 "How it will be checked" | yes |
| O4 | An evidence-only criterion never fails verification: its screenshot is captured and shown for review, but a `not_met` ruling on it is never an open gap, is never sent to Debug, never blocks the run's outcome and is left out of the coverage ratio | roadmap item 3 brief ("never fails verification") | yes |
| O5 | A Core criterion is must-pass whatever the project's blocking policy: it blocks under `Blocking: all` (today's default) and also under `Blocking: must-pass only` | roadmap item 3 brief ("Core boards stay must-pass") | yes |
| O6 | `/create-design` marks at most 8 Core boards (the main screens in their normal state) and, when there were more than 8 candidates, names the ones left out in its readout and in the brief; `/refine-design` can change the Core set and, on an older map, writes explicit flags (that is the "until refined" moment); `/audit-design` reports the Core set and flags a map over the cap | roadmap item 3 brief | |
| O7 | Each Core board carries a visible Core mark on the canvas: its `canvas.json` title carries a fixed Core marker, applied by code from the map, not typed by a drawing agent | roadmap item 3 brief ("a visible Core mark on the canvas") | |
| O8 | Evidence-only boards' behaviour is proven by forced-state component tests: the TRD-authoring rule for design-built work says a non-Core board's state is covered by a component test that forces that state, not by a pixel comparison | roadmap item 3 brief | |

## Intended Change

Today, before the change [read]:

- `design-map.json` boards have `id, file, kind, platform, viewport, status` plus optional
  fields; there is no Core concept (`packages/core/lib/design-map.js:42-45`, `validate()` at
  103). `grep -rn "core" packages/core/commands/create-design.md` finds no Core mark.
- `verify-design-comparison`'s Criteria section (`packages/skills/verify-design-comparison/SKILL.md`
  "Criteria") tells the orchestrator to append one `DC-<frame stem>` row per non-spec frame,
  every row with `Must pass` blank. No code generates these rows; the model builds them in
  `/implement-trd` §8.1b step 3 (`packages/core/commands/implement-trd.md:1736-1800`).
- Every `DC-` row is an ordinary criterion: under the default blocking policy a `not_met` on
  any frame (an error state, a loading state, a second viewport) blocks `satisfied`, and under
  `Blocking: must-pass only` none of them block, because a blank `Must pass` cell is ordinary
  (`functional-verification.js` `mustPassCoverage`, 813).

After the change:

1. A board in `design-map.json` may carry `"core": true|false`. At most 8 boards are Core;
   only `to-be` and `as-is` boards may be. A map where no board has a `core` key is a legacy
   map, and every screen board in it reads as Core (an accessor, e.g. `isCore(map, board)` /
   `coreBoards(map)`, owns that rule so no caller re-derives it).
2. A new deterministic CLI generates the comparison rows from the map, the frames on disk and
   the skill's existing status/kind rules (approved/building/shipped to-be boards; as-is
   baselines not replaced; no row for parts, flows or `screenshot_match: false`). Each row
   carries its class: `core` for the default-state frame (`NN-name.png`) of a Core board,
   `evidence` for every other frame (`NN-name--<state>.png`, and every frame of a non-Core
   board). The skill's Criteria section and `/implement-trd` §8.1b point at the CLI instead of
   having the model enumerate frames.
3. The success definition records the class per row (a column, e.g. `Board class`), and the
   verification loop reads the evidence-only ids deterministically from the definition file,
   the way it already reads must-pass ids (`must-pass-coverage`), never from a model's
   reading of the table. `decideNext` takes the evidence-only ids as a required input and
   removes them from the open gaps up front, as it already does for `settledEvidenceGaps` and
   `awaitingRegression`; they are excluded from Debug and from the coverage ratio; the report
   and the comparison page still show their screenshots and verdicts, labelled evidence only.
4. A `core` row is must-pass: the must-pass reading treats a comparison row of class `core` as
   must-pass without needing an objective id in its cell.
5. `/create-design`, `/refine-design` and `/audit-design` (and the `create-design` and
   `audit-design` workflows) carry the Core rule; the `designing-on-canvas` skill states the
   convention; a lib step writes the Core marker into each Core board's `canvas.json` title
   and removes it from a board that stops being Core.

## Decision

- **Core is board-level, must-pass is frame-level.** A Core board's default-state frame is the
  must-pass comparison ("main screens, normal state"); its other states are evidence only,
  like every frame of a non-Core board. Rejected: every frame of a Core board must-pass — it
  brings error/loading/empty states back into the pixel-perfect set the owner wants to shrink.
- **Legacy rule is map-wide, not per board.** "No board in the map has a `core` key" means
  legacy, so all screen boards are Core. A map with any `core` key is explicit and a missing
  key on a board reads `false`. Rejected: per-board default `true` — a refined map that adds
  one board without the key would silently grow the Core set past the cap.
- **Evidence-only is decided by code, never by the Judge.** The ids come from the definition
  file through a CLI, and `decideNext` requires them (an absent list throws, the same rule as
  `mustPass`), because an absent list read as "nothing is evidence-only" would make every
  state frame block again.
- **Evidence-only rows are still captured and judged.** They stay in the definition and on
  the page because the brief says the screenshot "is produced for review"; only their
  verdict's power to fail the run is removed. Rejected: dropping them from the definition —
  the screenshots would never be produced.
- **The Core mark is a title marker in `canvas.json`, written by code.** A live canvas showing
  it is the deferred check; the testable part is that the title the canvas renders carries
  the mark.
- **Forced-state component tests are a TRD-authoring rule, not new test machinery.** This
  feature adds the rule to `.claude/contracts/trd-authoring.md` "Design as a source"; it does
  not build a test runner.

## Grounding

- `packages/core/lib/design-map.js` (744 lines) [read]: owns the map's shape — `validate()`
  (103), `REQUIRED_BOARD_FIELDS` (44), `KINDS` (42), `approve`, `transition`, `refresh`,
  CLI `parseArgs` (673), exports (734). Add the Core field to `validate`, the legacy accessor,
  and the criteria generator (or put the generator in a sibling lib that requires
  design-map). Convention: pure functions plus a thin CLI; JSON on stdout. `.claude/lib/` is a
  vendored copy of `packages/core/lib/` (identical today, `diff -q` [ran]) — edit the package
  copy and refresh the vendored one the way the repo already does.
- `packages/core/lib/design-map.test.js` [read]: the existing Jest suite for the map; add the
  Core-field and legacy tests beside it.
- `packages/core/lib/design-render.js:14` [read]: frame naming — `<out>/NN-name.png` is the
  default state, `NN-name--<state>.png` the others. The generator's core/evidence split keys on
  that naming.
- `packages/core/lib/design-covers.js:201` [read]: resolves a `DC-<stem>` row back to its
  board by stripping `DC-`; any change to row ids must keep that working (keep `DC-<stem>`).
- `packages/core/lib/functional-verification.js` [read]: `decideNext` (≈357, input contract
  300-337, validation pattern 364-405, `settledEvidenceGaps`/`awaitingRegression` removal),
  `mustPassCoverage` (813), `readDefinitionRows` (847), `mustPassCoverageFromFiles` (870), the
  CLI `must-pass-coverage` (3110). Add the evidence-only reader beside the must-pass one and
  the `core` must-pass reading inside `mustPassCoverage`'s caller, not by loosening its
  objective-id rule for ordinary rows.
- `packages/core/workflows/verify-functional.js` (4005 lines) [read]: reads `mustPassIds` /
  `mustPassUncovered` from args (153-175), puts them into the Judge's `decideNext` call
  (915-935), filters debug gaps (2069-2206), builds the final result (1711). The evidence-only
  ids follow the same path as `mustPassIds`: an arg, validated, passed to `decideNext`, and
  filtered out of `debugGaps`.
- `packages/core/commands/implement-trd.md` §8.1a-8.1b (≈1720-1800) and
  `packages/core/commands/verify-build.md` (≈300-345) [read]: where check rows are built and
  where `must-pass-coverage` is called; both pass the new evidence-only ids to the workflow.
- `packages/core/contracts/functional-verification.md` "Check criteria" (≈284-330) [read]:
  fixes the eight columns of a check row and says check rows leave `Must pass` blank. It must
  describe the new class column and the evidence-only rule.
- `packages/skills/verify-design-comparison/SKILL.md` "Criteria" (≈52-95), "Page" (≈200-240)
  [read]: replace the hand enumeration with the CLI; the page labels evidence-only cards.
  `packages/skills/verify-design-comparison/__tests__/skill-md.test.js` pins its prose.
- `packages/core/commands/create-design.md` step 5 "Write the map once" (144-152) [read],
  `refine-design.md`, `audit-design.md`, and `packages/core/workflows/create-design.js` /
  `audit-design.js` [read]: where the Core set is chosen, written and audited. Prose tests:
  `create-design-prose.test.js`, `refine-design-prose.test.js`, `audit-design-prose.test.js`,
  `packages/core/workflows/create-design.test.js`, `audit-design.test.js`.
- `packages/skills/designing-on-canvas/SKILL.md` [read]: convention 6 says the title is the
  `title` key in `canvas.json`, never in the board file; the Core marker follows that rule.
- `test/fixtures/design/walk/boards/trips-refresh/design-map.json` [read]: the one existing
  fixture map; a new 12-board fixture goes beside it.
- Hazards [inferred]: `verify-functional.js` is large and its `decideNext` input is assembled
  in a Judge prompt, so the evidence-only list must be validated in the workflow before it
  reaches the prompt; `sync-design` reads `status` transitions and must not be changed by this
  feature beyond reading Core where it already reports boards.

## Open Questions

none
