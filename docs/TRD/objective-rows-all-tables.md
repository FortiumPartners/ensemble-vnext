# TRD: objective-rows-all-tables

**Source PRD**: None — defect found by `/audit-trd` on `docs/TRD/design-stage.md`, 2026-11-04
**Kind**: defect
**Weight**: trivial

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every `Must pass` mark in any table under a TRD's `## Objectives` heading reaches verification, not only marks in the first table | the reproduction below; owner instruction via `/plan`, 2026-11-04 | yes |
| O2 | A TRD with a single Objectives table reads exactly as it does today | the reproduction below; existing `spec-scope.test.js` cases | |

## Reproduction

### Steps

`node .claude/lib/spec-scope.js objectives --trd docs/TRD/design-stage.md`

### Actual

It returns 6 rows, the Goals table only, and none is marked must-pass [ran]. The section holds
17 tables with the header `| ID | Objective | Source | Must pass |`, and six rows are marked
`yes` (AC-F2.4, AC-F5.6, AC-F8.9, AC-F9.4, AC-F11.2, AC-F12.1), all in tables after the first
[ran].

### Expected

All rows of all 17 tables, with those six rows marked `mustPass: true`.

### Root cause [ran]

`objectiveRows()` in `packages/core/lib/spec-scope.js` takes
`findTables(masked, obj.start, obj.end)[0]`, the first table in the span, and ignores the
rest. Every must-pass consumer goes through this one function: the CLI `objectives` verb, which
`/verify-build` and `/implement-trd` use; `mustPassCoverageFromFiles()` in
`functional-verification.js`; and `criteria()` and `check()` in `spec-scope.js` itself [read].

## Decision

Read every table in the Objectives span, in document order: the first table as today, and a
later table only when its first column is `ID`. Revised during implementation, 2026-11-04: the
first version read every table unfiltered, and the end-of-run review showed that a metrics or
glossary table under a `###` subsection of `## Objectives` would then be read as objectives,
breaking O2. The `ID` test is the one `trd-parser.js` already uses to find an id column.

`renderObjectives()` keeps editing only the first table. It serves the spec path, which always
writes a single table, so it is not in this defect's path.

absorbed: none.
not absorbed: `renderObjectives` reads marks from table [0] only. It is a separate concern;
spec-path TRDs have one table.

## Non-Goals

- No change to `renderObjectives`, `check`'s rules, `readMark`, or the TRD templates.
- No restructuring of the design-stage TRD.

## Verification Artifacts

None apply — a library change proven by unit tests; no UI, flow or data surface.

## Open Questions

None.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `objectiveRows()` reads every table under `## Objectives`, in order; mirror to `.claude/lib/spec-scope.js`; tests added to `spec-scope.test.js` | O1, O2 | None | New test: a TRD with two Objectives tables where only the second carries a `yes` mark returns rows from both and that row `mustPass: true`. This test fails on the current code. All existing `spec-scope.test.js` and `functional-verification` must-pass tests pass unchanged. `node .claude/lib/spec-scope.js objectives --trd docs/TRD/design-stage.md` returns the six marked ids. `.claude/lib/spec-scope.js` is byte-identical to the package copy |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/spec-scope.js`, `.claude/lib/spec-scope.js`, `packages/core/lib/spec-scope.test.js`
- **Reuse:** `findTables` from `trd-parser.js` already returns every table in a span; `parseObjectiveTable` already parses one table [read].
- **Replaces:** the `[0]` index and the `if (!table) return rows` guard in `objectiveRows()` [read].
- **Follow:** the existing `objectiveRows` test style in `spec-scope.test.js` (`trdWith(four([...]))` helpers) [read].
- **Careful:** `packages/full/lib/spec-scope.js` is a symlink to the core copy, so nothing to add there [ran: ls -la]. `.claude/lib/spec-scope.js` is a regular-file copy, identical today [ran: diff -q]. `runtime-integrity.test.sh` fails on mirror drift.

## Could Not Verify

None.
