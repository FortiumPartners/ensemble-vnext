# Functional Success Definition: objective-rows-all-tables

**Source**: objective-rows-all-tables TRD §Reproduction (extracted text, supplied verbatim by the caller; the TRD file itself was not opened)
**Source kind**: reproduction
**Derived**: 2026-11-04T23:09:23Z
**Criteria**: 4

Derived from the extracted `## Reproduction` text only (Steps, Actual, Expected, Root cause).
Every criterion is a CLI or library check run with Node against this repository (CLI hint
row): invoke the command or call the named function as a user or consumer would, save its
output to a file under the evidence directory, and assert on that file. The real fixture is
the one the Steps name, `docs/TRD/design-stage.md`, whose `## Objectives` section the
reproduction says holds 17 tables with the header `| ID | Objective | Source | Must pass |`
and six rows marked `yes`. The exerciser may read that TRD to count its rows; the expected
total is not stated in the source and is not written here.

**A criterion carrying a `Parts` count cannot pass incrementally**: FS-1 resolves `met` only
when rows from all 17 tables are returned (16 of 17 is `not_met` with the missing table
named), and FS-2 only when all six named rows carry `mustPass: true` (5 of 6 is `not_met`
with the missing id named).

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | `node .claude/lib/spec-scope.js objectives --trd docs/TRD/design-stage.md` returns every row of each of the 17 tables under `## Objectives`, not only the 6 rows of the Goals table | §Reproduction › Expected ("All rows of all 17 tables"); §Actual ("It returns 6 rows, the Goals table only") | Saved stdout and exit code of the Steps command, with the returned row count set beside the row count the exerciser tallied from all 17 tables in the TRD; locator: an id from the last table (e.g. `AC-F12.1`) present in the output | [read] | locator | 17 | O1 |
| FS-2 | In that same output, each of the six rows marked `yes` — AC-F2.4, AC-F5.6, AC-F8.9, AC-F9.4, AC-F11.2, AC-F12.1 — carries `mustPass: true` | §Reproduction › Expected ("with those six rows marked `mustPass: true`"); §Actual ("six rows are marked `yes` … all in tables after the first") | The saved stdout of the Steps command, showing each of the six ids with `mustPass: true`; locator: the literal `mustPass` field text on the `AC-F12.1` row | [read] | locator | 6 | O1 |
| FS-3 | `mustPassCoverageFromFiles()` in `functional-verification.js`, given the design-stage TRD, counts the must-pass objectives from tables after the first, not only from the Goals table | §Reproduction › Root cause ("Every must-pass consumer goes through this one function: … `mustPassCoverageFromFiles()` in `functional-verification.js`") | Output of a Node call to `mustPassCoverageFromFiles()` against `docs/TRD/design-stage.md` (and any success definition it needs), saved to a file, listing the six must-pass ids from FS-2 as declared objectives; locator: `AC-F2.4` in that output | [read] | locator | | O1 |
| FS-4 | `criteria()` and `check()` in `spec-scope.js` see the rows of every table under `## Objectives`, including their must-pass marks, not only the first table's rows | §Reproduction › Root cause ("Every must-pass consumer goes through this one function: … and `criteria()` and `check()` in `spec-scope.js` itself") | Output of Node calls to `criteria()` and `check()` on a TRD whose `## Objectives` section holds two or more tables with a `Must pass` mark only in a later table (the design-stage TRD, or a fixture of that shape), saved to a file; locator: the id of a must-pass row from a table after the first | [read] | locator | | O1 |
