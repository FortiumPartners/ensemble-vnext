# Functional Success Definition: design-render-pnpm-critique-keep

**Source**: docs/TRD/design-render-pnpm-critique-keep.md §Reproduction
**Source kind**: reproduction
**Derived**: 2026-11-07T02:07:17Z
**Criteria**: 7

"The worktree" below is the live-test worktree the reproduction names,
`/Users/james/dev/lightning-lane-design-desktop`: a pnpm workspace (`apps/*`, `packages/*`) where
only `apps/web/package.json` declares `@playwright/test` and the `playwright` package itself sits
only in pnpm's store (Actual A). Step 1 of the reproduction runs against it read-only.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Asking `resolveTool` for `playwright` against the worktree returns a module instead of throwing, even though the worktree declares only `@playwright/test`, and only in a workspace package (`apps/web`), not at the root | Expected A ("resolveTool("playwright", <worktree>) returns a module"); Steps 1; Actual A ("all three FAIL"; only apps/web/package.json:52 declares @playwright/test) | CLI transcript of reproduction step 1 (or the same call for `playwright` alone) against the worktree, printing `playwright found` where it printed `playwright FAIL` | [read] | locator | | O1, O2 |
| FS-2 | The module `resolveTool("playwright", <worktree>)` returns has a `chromium.launch` that works: calling it starts a browser, which then closes cleanly | Expected A ("a module whose chromium.launch works") | CLI transcript of a node script that resolves `playwright` through `resolveTool` against the worktree, calls `chromium.launch()`, prints the launched browser's version, and closes it, exiting 0 | [read] | locator | | O1, O2 |
| FS-3 | A design board in the worktree renders to an image through the design commands' render path, instead of the render being skipped as "not installed" | Actual A, last sentence ("Every design command's render ... then skip as "not installed""); Expected A | Log or transcript of the design render run against a worktree board, showing the image file it wrote and no "not installed" skip; the rendered image attached as the screenshot | [read] | locator | | O1, O2 |
| FS-4 | In the worktree, the design commands' critique and ranking, and `/audit-design`'s visual verifiers, run on rendered boards rather than skipping as "not installed" | Actual A, last sentence ("Every design command's render, critique and ranking, and /audit-design's visual verifiers, then skip as "not installed"") | Transcript or output files of a design run and an `/audit-design` run against the worktree, showing critique scores and a ranking produced from rendered boards and the visual verifiers' results, with no "not installed" skip for any of them | [read] | locator | | O1 |
| FS-5 | After `/refine-design --auto` with no feedback, on a design whose `critique.md` held sections for four boards, `critique.md` still holds a section for every one of those four boards, not only the boards the run changed | Expected B ("the four boards' sections all survive a refine"); Steps 2; Actual B ("critique.md holds only the boards the run changed") | `critique.md` captured before the refine (as `04-critique.md` was) and after it, with the after file showing a section for each of the four boards, including `01-trips-home` and `02-trip-editor` | [read] | locator | | O3 |
| FS-6 | A board the refine did not change keeps its whole critique section: the ten-dimension tables for `01-trips-home` and `02-trip-editor` are still present after the refine, with the scores they had before it | Actual B ("the ten-dimension tables for 01-trips-home and 02-trip-editor ... are gone"); Expected B ("the four boards' sections all survive a refine") | Before/after pair of `critique.md` around a no-feedback `/refine-design --auto`, with the two unchanged boards' ten-dimension tables present in the after file and matching the before file | [read] | locator | | O3 |
| FS-7 | A board the refine changed but could not re-judge keeps its earlier scores in `critique.md`, labelled as predating this run's change, rather than being reduced to "not judged" | Expected B ("a changed board this run could not re-judge keeps its earlier scores, labelled as predating this run's change"); Actual B ("each scored "not judged"; ... the earlier scores for the two changed boards ... are gone") | Before/after pair of `critique.md` around a no-feedback `/refine-design --auto` in which a changed board was not re-judged: the after file carries that board's earlier scores and a label saying they predate this run's change | [read] | locator | | O3 |

**Lines considered and not made criteria.** Step 1 also looks up `@playwright/test` and
`tailwindcss`, and Actual A reports all three as failing, but the expected-behaviour line names
only `playwright`; nothing in the source says what those two lookups should return, so no
criterion asserts on them. Actual A's statement that `require.resolve` from `apps/web` succeeds
is a diagnostic observation, not an expected outcome, and is not a criterion either.
