# Functional Verification Report: objective-rows-all-tables

**Source PRD**: docs/TRD/objective-rows-all-tables.md § Reproduction
**Success definition**: .trd-state/objective-rows-all-tables/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 4 total — 4 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 4 of 4 proven — uncovered: none
**Must pass**: 4 of 4 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `node .claude/lib/spec-scope.js objectives --trd docs/TRD/design-stage.md` returns every row of each of the 17 tables under `## Objectives`, not only the 6 rows of the Goals table | .trd-state/objective-rows-all-tables/evidence/fs1-stdout.txt | 1 |
| FS-2 | In that same output, each of the six rows marked `yes` — AC-F2.4, AC-F5.6, AC-F8.9, AC-F9.4, AC-F11.2, AC-F12.1 — carries `mustPass: true` | .trd-state/objective-rows-all-tables/evidence/fs1-stdout.txt | 1 |
| FS-3 | `mustPassCoverageFromFiles()` in `functional-verification.js`, given the design-stage TRD, counts the must-pass objectives from tables after the first, not only from the Goals table | .trd-state/objective-rows-all-tables/evidence/fs3-output.txt | 1 |
| FS-4 | `criteria()` and `check()` in `spec-scope.js` see the rows of every table under `## Objectives`, including their must-pass marks, not only the first table's rows | .trd-state/objective-rows-all-tables/evidence/fs4-output.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

