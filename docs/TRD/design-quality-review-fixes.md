# TRD: design-quality-review-fixes

**Source PRD**: None — defects found by a code review of the already-merged design-quality code (PR #70), 2026-11-06; fixes saved as `.trd-state/design-render-pnpm-critique-keep/out-of-scope-review-fixes.patch`

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `/audit-design --drift` compares a board with a fresh capture using `verify-design-comparison`'s own `## Rubric`, never contract section 8 (the ten-dimension visual critique rubric) | the reproduction below; owner instruction 2026-11-06 ("drift rubric") | yes |
| O2 | In `/create-design`'s draw stage, a critique score reaches the fix round only for the to-be board the screen critic was given; a score on an as-is or parts board is dropped, so the fix round never edits a board that must match its screenshot | the reproduction below; owner instruction ("as-is scores") | yes |
| O3 | `direction()` does not report `style_pack` blank when a pack is in use through `style` (`--style` or the brief's Style pack line), and reads a fractional touch-target floor (`24.5 px`) whole | the reproduction below; owner instruction ("style-pack blank", "fractional target floor") | |
| O4 | The critique-corpus replay records a failed critic run and carries on, rather than throwing away every run so far; and it rejects a label whose `frame` or `measures` path resolves outside the corpus folder | the reproduction below; owner instruction ("replay abort", "corpus path confinement"); `CLAUDE.md` "Path Traversal Prevention" | |
| O5 | The overlapping-targets measure reads each target's rectangle once, not twice per pair, with its findings unchanged; and the render CLI's doc comment is well-formed | owner instruction ("overlap-check perf") | |

## Reproduction

### Steps

Run on branch `feature/design-quality-review-fixes/fix` (cut from the PR #71 head, 91b7d18):

1. Apply the saved patch, then put the four source files back to their unfixed versions while keeping the patch's new tests, and run
   `npx jest packages/core/lib/design-map.test.js packages/core/workflows/audit-design.test.js packages/core/workflows/create-design.test.js`.
2. Replay defects, against the unfixed and fixed `test/design-critique-corpus/replay.js`, with no live critic:
   - `parseLabels()` on a valid row from `labels.jsonl` whose `frame` is `../../package.json`;
   - `run({ runs: 2, spawn })` with a stub `spawn` whose second call exits 1.

### Actual

- Step 1 [ran]: 3 of the patch's new tests fail on the unfixed code:
  - O1: `audit-design --drift … compares only shipped and as-is boards` fails because the drift prompt carries contract section 8 (`RUBRIC: ${a.rubric}`, `audit-design.js:371-372`), and no drift rubric is passed.
  - O2: `create-design stage draw … drops a score on any board but the screen's to-be board` fails because `scoreFindings` (`create-design.js:663`) filters on score only and keeps the as-is board's score of 1. The measures already exclude as-is boards (`asIsIds`, `:658`); the scores do not.
  - O3: `direction … a style pack given as style is not reported blank; a fractional target is read whole` fails. `blank` (`design-map.js:435`) ignores `style`, and `/(\d+)\s*px/` (`:441`) reads `24.5 px` as `5`.
  - (A fourth failure, the `.claude/lib/design-map.js` byte-identity check, was an artefact of reverting only the package copy.)
- Step 2 [ran]:
  - unfixed `parseLabels` accepts `../../package.json`. The fix rejects it: "frame file ../../package.json is outside the corpus folder".
  - unfixed `run` throws after the second critic call ("claude exited with code 1"), losing every run. The fixed `run` completes with 16 runs, 1 of them recorded with `error`.
- With the whole patch applied [ran]: 238 of 238 tests pass across the design-map, audit-design, create-design and design-render suites, and 33 of 33 replay tests pass.

### Expected

Each objective above holds, and the tests that failed in step 1 pass.

## Decision

Apply the saved patch, task by task, as written: each hunk is the fix the review wrote and tested. Every runtime file is edited in `packages/core/` and copied byte-for-byte to its `.claude/` mirror (a parity test requires it).

- **Drift rubric:** add a separate `driftRubric` input, rather than repointing `rubric`. `rubric` is still contract section 8, which `/audit-design`'s visual critics need in the same run.
- **The two replay defects:** the patch has no tests for them. FIX-004 adds tests to `replay.test.js` that fail on the unfixed code. The fix also relies on `buildReport()` accepting `mean: null`, which the step 2 run showed it does.
- **Overlap measure:** a refactor. A source-level test pins the change, and the existing design-render tests show its findings are unchanged.

**Corrections from the adversarial pass (2026-11-06), folded into the tasks:**
- **The patch's replay catch-all hid total failure.** With `claude` missing, every run errored, the report said "8 frame(s) unscored" and exit was 0. FIX-004 now keeps a failed spawn fatal and reports failed runs by count.
- **The drift prompt needs its own verdict mapping and a missing-rubric finding.** It now states how comparison verdicts become findings, as `sync-design.js:110-112` does, and reports a missing `driftRubric` instead of silently comparing without one (FIX-001).
- **The create-design critic is now told which board to score**, which addresses the cause. The code filter stays as a backstop (FIX-002).
- **Declared kind:** FIX-005 is a refactor plus a doc-comment typo, and the path confinement in FIX-004 is hardening. Both stay in this TRD because they come from the same review and touch nothing else.

absorbed: none
not absorbed: `/audit-design` reporting measured faults on as-is boards as VISUAL FINDINGS (`audit-design.js:427`). Whether the audit should report the current product's faults is an owner call, and these fixes work without it.
not absorbed: under `--explore`, each direction re-renders the as-is board (`create-design.js:259`). Rendering it once would remove directions b and c's comparison baseline, which changes behaviour. Separate fix.
not absorbed: floor-flag building is duplicated with different null checks (`audit-design.js:270`). Tidiness.
not absorbed: the Playwright lookup follow-ups from PR #71's review: no walk-up to a parent `pnpm-workspace.yaml`, `**` entries, load errors read as "not installed", and the install hint. Recorded in `.trd-state/design-render-pnpm-critique-keep/discovered.jsonl`. Separate fix.

## Non-Goals

- Any change to what the visual critics score, or to contract section 8.
- Any change to `/audit-design`'s handling of as-is measured faults (above).
- Running a live critic or a live design command. No `claude` session is started.

## Verification Artifacts

None apply — the changes are workflow prompt assembly, finding filters, a markdown parse and a test harness; no screens, frames or API data are added.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Give `/audit-design --drift` its own rubric: the `driftRubric` input in `audit-design.js` (the args summary at `:17-19`, the per-argument comment, and the drift prompt's `RUBRIC:` block), a stated mapping from the comparison's verdicts to findings, a reported finding when `driftRubric` is missing, and the `/audit-design` command text that passes it | O1 | None | (1) The drift prompt carries `driftRubric` and never `rubric` (contract section 8). The patch's drift test asserts `DRIFT-RUBRIC-TEXT` present and `RUBRIC-TEXT` absent, and it fails on the unfixed code. (2) The drift prompt says `match` and `minor` are not findings, `deviates` is a board-drift finding, `uncaptured` is not a finding, and no `verdicts.json` is written. A test asserts that sentence. (3) With no `driftRubric`, the drift verifier reports one "drift rubric not supplied" finding and stops, as a missing `capture` already does (`:369`). A test covers the missing case. (4) `audit-design.md` says to pass `driftRubric` from the `## Rubric` text of `verify-design-comparison`, and `audit-design-prose.test.js` asserts it. (5) The `.claude/` copies of `audit-design.js` and `audit-design.md` are byte-identical to the package files. |
| FIX-002 | Name the to-be board's id in `create-design.js`'s screen-critic prompt, and filter `scoreFindings` to the to-be board(s) the critic was given | O2 | None | (1) A score on `01-screen-1--as-is` is dropped and the to-be score is kept. The patch's test asserts exactly `['01-screen-1']` and fails on the unfixed code. (2) The screen critic's prompt names the to-be board id it must score, matching `audit-design.js:288` ("Score ONLY the to-be board …"), including each explore direction's own id. A test asserts the id is in the prompt. (3) Every existing create-design draw test still passes. (4) `.claude/workflows/create-design.js` is byte-identical to the package file. |
| FIX-003 | In `design-map.js` `direction()`, don't report `style_pack` blank when `style` is given, and read a decimal touch-target floor | O3 | None | (1) The patch's direction test passes: `style` given means `style_pack` is not in `blank`, and `targets 24.5 px` gives `floor.target === 24.5`. It fails on the unfixed code. (2) The `.claude/` copy is byte-identical. |
| FIX-004 | Make the corpus replay survive a failed critic run without hiding it, keep a missing or unstartable critic CLI fatal, and confine label paths to the corpus folder; add tests for all three to `replay.test.js` | O4 | None | (1) A new test: `run()` with a stub `spawn` whose critic exits non-zero once completes, records that run with `mean: null` and an `error`, and keeps every other run. It fails on the unfixed `replay.js`. (2) A new test: `formatReport()` on a result with failed runs prints "N of M critic runs failed: <first error>", and does not count those frames as "unscored (every dimension not judged)". (3) A new test: when the spawn itself fails (`res.error`, e.g. ENOENT for a missing `claude`), `run()` still throws, so `main` exits 1. (4) A new test: `parseLabels()` rejects a valid row whose `frame` (and, separately, `measures`) is `../../package.json`, naming "outside the corpus folder". It fails on the unfixed code. (5) All replay tests pass. |
| FIX-005 | Read the targets' rectangles once in the overlap measure, and restore the missing ` * ` on the render CLI's doc-comment line | O5 | None | (1) A source-level test asserts that, in `MEASURE_SCRIPT`, `getBoundingClientRect` does not appear inside the overlap pair loop, and that the doc-comment block has no line lacking its ` * `. Both fail on the unfixed file. (2) Every `design-render.test.js` test passes, including its overlap cases, so findings are unchanged. (3) The `.claude/` copy is byte-identical. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/workflows/audit-design.js`, `.claude/workflows/audit-design.js`, `packages/core/workflows/audit-design.test.js`, `packages/core/commands/audit-design.md`, `.claude/commands/audit-design.md`, `packages/core/commands/audit-design-prose.test.js`
- **Reuse:** the patch hunks for these files in `.trd-state/design-render-pnpm-critique-keep/out-of-scope-review-fixes.patch` [ran: they apply cleanly and their test passes]
- **Replaces:** `RUBRIC:\n${a.rubric || ''}` in the drift prompt (`audit-design.js:371-372`) [read]
- **Follow:** apply the patch's version. `RUBRIC` at `:66` stays contract section 8 for the visual critics. Do not touch it.
- **Careful:** the command's Workflow example line (`audit-design.md:84`) keeps `rubric: "<contract section 8 text>"`; only the `--drift` paragraph changes. `READ_ONLY` (`audit-design.js:87-89`) forbids writes only under the design folder, so the prompt must say plainly that no `verdicts.json` is written.

### FIX-002
- **Touches:** `packages/core/workflows/create-design.js`, `.claude/workflows/create-design.js`, `packages/core/workflows/create-design.test.js`
- **Reuse:** the patch's `scoredIds(it)` helper and test [ran]; `asIsIds` at `create-design.js:658` is the sibling filter the measures already use [read]
- **Replaces:** the score-only filter at `create-design.js:663-664` [read]
- **Follow:** apply the patch's version. A parts item scores nothing, so `scoredIds` returns an empty set for it.
- **Careful:** `r.item` is the item the visual agent was given (`{ ...r, item: it }`, `create-design.js:538`) [read]. Name the to-be id in the critic prompt at `:508-509`, or under `--explore` a critic that labels direction a's scores with the screen id would have every score dropped by the filter.

### FIX-003
- **Touches:** `packages/core/lib/design-map.js`, `.claude/lib/design-map.js`, `packages/core/lib/design-map.test.js`
- **Reuse:** the patch hunks and test [ran]
- **Replaces:** `filter((k) => !fields[k])` at `design-map.js:435` and `/(\d+)\s*px/` at `:441` [read]
- **Follow:** apply the patch's version, which mirrors the contrast regex `/(\d+(?:\.\d+)?)\s*:\s*1/` already on the line above.
- **Careful:** `blank` also feeds the readout's "design direction: … is blank" ISSUES line. Only `style_pack` is exempted, and only when `style` is truthy.

### FIX-004
- **Touches:** `test/design-critique-corpus/replay.js`, `test/design-critique-corpus/replay.test.js`
- **Reuse:** the patch's two `replay.js` hunks [ran]; the existing `run (whole replay, spawn mocked)` describe at `replay.test.js:229` and `parseLabels` describe at `:113` for the new tests' setup [read]
- **Replaces:** the unguarded `invokeCritic` call at `replay.js:219` and the `path.join` existence check at `:56` [read]
- **Follow:** the path check follows `CLAUDE.md`'s pattern: `path.resolve(base, p).startsWith(base + path.sep)`.
- **Careful:** `buildReport` and `formatReport` accept a run with `mean: null`: every aggregate filters on `typeof mean === 'number'` [read], and the fixed replay completed a 16-run report with one such run [ran]. But the patch's catch-all also swallowed spawn failures, so a missing CLI read as "unscored" and exited 0 [ran by the reviewer]. Catch only a critic that ran and failed. Rethrow when `res.error` is set (`replay.js:194`).

### FIX-005
- **Touches:** `packages/core/lib/design-render.js`, `.claude/lib/design-render.js`, `packages/core/lib/design-render.test.js`
- **Reuse:** the patch's two `design-render.js` hunks [ran]
- **Replaces:** the per-pair `getBoundingClientRect()` calls at `design-render.js:480`, and the doc-comment line at `:23` that lacks ` * ` [read]
- **Follow:** `MEASURE_SCRIPT` is ES5 inside `String.raw` (it runs in the page), so keep `var` and `function`.
- **Careful:** the `contains()` skip stays per pair. Only the rectangle reads move.

## Could Not Verify

- That the drift comparison judges better with its own rubric. That needs a live `/audit-design --drift` run; the unit test proves only which text reaches the prompt.
- The overlap measure's speed-up is not measured; the claim rests on reading 500 rectangles once rather than about 250,000 times.
