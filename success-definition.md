# Functional Success Definition: narrow-re-proof-after-a-merge

**Source**: .trd-state/narrow-re-proof-after-a-merge/derive-source.md §Reproduction (with its §Decision)
**Source kind**: reproduction
**Derived**: 2026-11-21T20:33:46.561Z
**Criteria**: 6

A criterion carrying a `Parts` count cannot pass incrementally; none here carries one.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | In the reproduction fixture (the feature edits line 1 of `next.config.ts` before the anchor, the base edits line 9, `git merge` merges cleanly), `custody.js reconcile --base origin/main` excuses `next.config.ts`: it is not listed in `differing`, the scope is not `full`, and with no recorded cover naming the file nothing is re-proved (the reverify list does not hold every must-pass criterion) | §Expected "The path is excused"; §Actual (`differing: ['next.config.ts']`, `scope: full`, `reverify` = every must-pass criterion — the defect being fixed) | Output of `node .claude/lib/custody.js reconcile --base origin/main` run in that fixture, showing `differing` without `next.config.ts` and a non-full scope; plus the Jest run of `packages/core/lib/custody.test.js` passing the fixture's test | [read] | locator | | O1 |
| FS-2 | In the same cleanly merged case, when a recorded cover names `next.config.ts`, the criteria whose covers name it are re-proved and no other criterion is | §Expected "only criteria whose covers name it are re-proved" | Reconcile output (or Jest assertion output) for a fixture where one criterion's cover names `next.config.ts` and another's does not: the reverify list holds the first and not the second | [read] | locator | | O2 |
| FS-3 | A feature edit to a file after the anchor is not excused: the file still widens the re-proof — the criteria whose covers name it are re-proved, and an edited file no cover names still widens the scope as before | §Decision "NOT loosening `affectedIds`: a feature edit after the anchor ... must still widen" | Jest output from `custody.test.js` / `narrow-reproof.seam.test.js` with a fixture whose feature edits the file after the anchor, asserting the file appears in `differing` and the covering criteria (or full scope when uncovered) are in the re-proof | [read] | locator | | O2 |
| FS-4 | A file whose merge conflict was resolved by hand is not excused: it still widens the re-proof | §Decision "a hand-resolved conflict must still widen" | Jest output with a fixture where base and feature edit the same lines, the conflict is resolved by hand, and reconcile still lists the file in `differing` and widens | [read] | locator | | |
| FS-5 | The vendored runtime copy `.claude/lib/custody.js`, which `reconcile` is invoked through, shows the same excusing behaviour as `packages/core/lib/custody.js` | domain-derived: the reproduction's step runs `custody.js reconcile`, and commands in this project execute the vendored `.claude/lib` copy, so a fix present only in `packages/core/lib` leaves the reported behaviour unchanged for every run; the source's size line also names "custody.js with its .claude/lib copy" | Reconcile output from `node .claude/lib/custody.js reconcile --base origin/main` in the FS-1 fixture matching the `packages/core/lib` result; or a byte comparison of the two files showing them identical | domain-derived | locator | | |
| FS-6 | The case not absorbed by this fix — develop's `next.config.ts` pulling in 4 video-ending criteria — is recorded as a skipped test, not silently dropped | §Decision "not absorbed: develop's `next.config.ts` pulling in 4 video-ending criteria — session log unreadable, recorded as a skipped test" | Jest output for `custody.test.js` listing that case as skipped (a `skipped`/`todo` count of at least 1 and the case's name) | [read] | locator | | |

## Notes on derivation

- O1 is proven by FS-1; O2 by FS-2 and FS-3. Neither objective is cited as a source; each criterion stands on a source line.
- FS-3 and FS-4 come from the recorded decision's own guard ("NOT loosening `affectedIds`"): the fix must not turn the narrowing into a blanket excuse.
- Not turned into a criterion: the size line's mention of `CHANGELOG.md` — it states what files the change touches, not an outcome to verify.
- The root-cause sentence in §Actual (`compare` excuses a path only when the head blob equals the base blob and the feature never touched it) and the Storybook epub row are descriptions of the defect, not further expected outcomes; they are covered by FS-1.
