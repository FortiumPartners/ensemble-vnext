# Functional Success Definition: design-quality-review-fixes

**Source**: TRD §Reproduction (extracted text, supplied verbatim by the orchestrator; no TRD path or task list was read)
**Source kind**: reproduction
**Derived**: 2026-11-07T05:11:37Z
**Criteria**: 7

A note on labels. The reproduction labels its three test failures O1, O2 and O3. Those are the
reproduction's own defect labels, and below they are always written as "defect O1" etc. The
`Must pass` column names the TRD's must-pass objectives, which also happen to be called O1 and
O2 and cover the same two defects. The reproduction's defect O3 (the design-direction reading)
has no must-pass objective, so its criteria are ordinary.

A criterion carrying a `Parts` count cannot pass incrementally: it is `met` only when every part
is proven.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | `/audit-design --drift` builds its comparison prompt without contract section 8 (the `RUBRIC: ${a.rubric}` visual-critique rubric) and passes a drift rubric instead, comparing only shipped and as-is boards | §Reproduction › Actual › Step 1, defect O1 bullet ("the drift prompt carries contract section 8 … and no drift rubric is passed"; test title "compares only shipped and as-is boards"); §Expected ("Each defect above no longer occurs") | Jest output for `packages/core/workflows/audit-design.test.js` showing the test `audit-design --drift … compares only shipped and as-is boards` passing on the fixed code; plus a captured drift prompt (from the test harness or a fixture run) that holds a drift rubric and holds no contract-section-8 rubric text | [read] | locator | | O1 |
| FS-2 | In `/create-design`'s draw stage, a critique score on any board other than the screen's to-be board (an as-is or parts board) is dropped before the fix round, the same way the measures already exclude as-is boards; an as-is board's score of 1 no longer reaches the fix round | §Reproduction › Actual › Step 1, defect O2 bullet ("`scoreFindings` … filters on score only and keeps the as-is board's score of 1. The measures already exclude as-is boards; the scores do not"; test title "drops a score on any board but the screen's to-be board"); §Expected | Jest output for `packages/core/workflows/create-design.test.js` showing the test `create-design stage draw … drops a score on any board but the screen's to-be board` passing on the fixed code; the fix-round findings captured from that run contain the to-be board's score and no as-is board score | [read] | locator | | O2 |
| FS-3 | When the design direction gives a style pack as `style`, the direction is not reported blank for it | §Reproduction › Actual › Step 1, defect O3 bullet ("`blank` (`design-map.js:435`) ignores `style`"; test title "a style pack given as style is not reported blank"); §Expected | Jest output for `packages/core/lib/design-map.test.js` showing the test `direction … a style pack given as style is not reported blank; a fractional target is read whole` passing; the direction result for a fixture with `style` set does not list it as blank | [read] | locator | | |
| FS-4 | A fractional pixel target such as `24.5 px` in the design direction is read whole, as 24.5, not as 5 | §Reproduction › Actual › Step 1, defect O3 bullet ("`/(\d+)\s*px/` (`:441`) reads `24.5 px` as `5`"; test title "a fractional target is read whole"); §Expected | The same passing `design-map.test.js` test as FS-3; the parsed target value from a `24.5 px` fixture shown as `24.5` | [read] | locator | | |
| FS-5 | `parseLabels()` in `test/design-critique-corpus/replay.js` rejects a `labels.jsonl` row whose `frame` points outside the corpus folder (`../../package.json`), instead of accepting it | §Reproduction › Actual › Step 2, first bullet ("unfixed `parseLabels` accepts `../../package.json`. The fix rejects it: \"frame file ../../package.json is outside the corpus folder\""); §Expected | Transcript of calling the fixed `parseLabels()` on an otherwise valid row with `frame: "../../package.json"`, run with no live critic, showing the rejection message `frame file ../../package.json is outside the corpus folder` | [read] | locator | | |
| FS-6 | `run()` in `test/design-critique-corpus/replay.js` survives a critic call that exits non-zero: it records that run with an `error` and carries on, instead of throwing and losing every run. With `run({ runs: 2, spawn })` and a stub `spawn` whose second call exits 1, it completes with 16 runs, 1 of them recorded with `error` | §Reproduction › Actual › Step 2, second bullet ("unfixed `run` throws after the second critic call (\"claude exited with code 1\"), losing every run. The fixed `run` completes with 16 runs, 1 of them recorded with `error`"); §Expected | Transcript of calling the fixed `run({ runs: 2, spawn })` with a stub `spawn` whose second call exits 1, run with no live critic: it returns rather than throwing `claude exited with code 1`, and its result shows 16 runs with exactly one carrying `error` | [read] | locator | | |
| FS-7 | Each of the 3 tests from the patch that failed on the unfixed code in step 1 passes on the fixed code | §Reproduction › Actual › Step 1 ("3 of the patch's new tests fail on the unfixed code"); §Expected ("the tests that failed in step 1 pass") | Output of `npx jest packages/core/lib/design-map.test.js packages/core/workflows/audit-design.test.js packages/core/workflows/create-design.test.js` on the fixed code, showing each of the three named tests passing and no failures in those three files | [read] | locator | 3 | |

## Coverage notes

- **Objective O1 is covered by FS-1 only as far as the reproduction states it.** The objective
  says the drift comparison uses `verify-design-comparison`'s own `## Rubric`. The reproduction
  says only that contract section 8 must not be in the drift prompt and that "no drift rubric is
  passed"; it does not name which rubric the drift prompt should carry. FS-1 therefore proves
  "section 8 absent, a drift rubric present", and does not assert that the rubric is
  `verify-design-comparison`'s. No criterion was invented to cover that part. A reader ruling
  O1 should treat the rubric's identity as unproven by this definition unless the evidence
  happens to show it.
- **Objective O2 is covered by FS-2.** The test title in the source ("drops a score on any board
  but the screen's to-be board") supports dropping scores on parts boards as well as as-is
  boards. The objective's closing clause, "so the fix round never edits a board that must match
  its screenshot", is a consequence of the drop rather than a separately stated behaviour, and
  has no criterion of its own.
- **Not turned into criteria:** the line numbers the reproduction quotes (`audit-design.js:371-372`,
  `create-design.js:663`, `:658`, `design-map.js:435`, `:441`) locate the unfixed code; they
  are not behaviour, so no criterion asserts them.
