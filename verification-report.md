# Functional Verification Report: core-boards-in-designs

**Source PRD**: docs/TRD/core-boards-in-designs.md § Intended Change
**Success definition**: .trd-state/core-boards-in-designs/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 17 total — 17 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 17 of 17 proven — uncovered: none
**Must pass**: 15 of 15 proven
**Screenshots**: 1 shown
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Map validation accepts a `design-map.json` whose boards carry `"core": true` or `"core": false`, with no more than 8 Core boards, all of kind `to-be` or `as-is` | .trd-state/core-boards-in-designs/evidence/iter1/FS-1/validate.txt | 1 |
| FS-2 | Map validation rejects a `design-map.json` that marks more than 8 boards Core, and says the limit was exceeded | .trd-state/core-boards-in-designs/evidence/iter1/FS-2/validate.txt | 1 |
| FS-3 | Map validation rejects `"core": true` on a board that is neither `to-be` nor `as-is` (for example a `part` board or a `flow` board) | .trd-state/core-boards-in-designs/evidence/iter1/FS-3/validate.txt | 1 |
| FS-4 | A legacy map, one in which no board carries a `core` key, is read with every screen board treated as Core: the comparison-row generator classes the default-state frame of every screen board `core` | .trd-state/core-boards-in-designs/evidence/iter1/FS-4/rows.txt | 1 |
| FS-5 | The design-comparison rows are produced by a CLI from the map, not written by a model, and the same map always yields the same rows | .trd-state/core-boards-in-designs/evidence/iter1/FS-5/diff.txt | 1 |
| FS-6 | Every generated comparison row carries a class: `core` for the default-state frame of a Core board, and `evidence-only` for every other frame, including every frame of a non-Core board and a Core board's non-default states and second viewport | .trd-state/core-boards-in-designs/evidence/iter1/FS-6/summary.txt | 1 |
| FS-7 | A 12-board fixture design with 8 Core boards yields exactly 8 must-pass (`core`) and 4 `evidence-only` design-comparison criteria | .trd-state/core-boards-in-designs/evidence/iter1/FS-7/summary.txt | 1 |
| FS-8 | The success definition written for a design-comparison check records each row's class, so a reader of the definition file can tell which rows are `core` and which are `evidence-only` | .trd-state/core-boards-in-designs/evidence/iter1/FS-8/success-definition.md | 1 |
| FS-9 | The verification loop gets the set of evidence-only criterion ids by reading the success-definition file in code, not from a model's reading | .trd-state/core-boards-in-designs/evidence/iter1/FS-9/parsed.json | 1 |
| FS-10 | An `evidence-only` criterion ruled `not_met` is not an open gap: it is not handed to the Debug stage and does not make the loop iterate again | .trd-state/core-boards-in-designs/evidence/iter1/FS-10/only-evidence.out.json | 1 |
| FS-11 | A run whose only failures are `not_met` rulings on `evidence-only` criteria exits `satisfied`, under the default blocking policy as well as under `Blocking: must-pass only` | .trd-state/core-boards-in-designs/evidence/iter1/FS-11/must-pass.out.json | 1 |
| FS-12 | `evidence-only` criteria are left out of the coverage ratio, so unproven evidence-only rows cannot push a run below the coverage floor | .trd-state/core-boards-in-designs/evidence/iter1/FS-12/control-empty.out.json | 1 |
| FS-13 | An `evidence-only` frame is still captured and shown for review: its row appears in the verification report with its screenshot, even though its ruling cannot fail the run | .trd-state/core-boards-in-designs/evidence/iter1/FS-13/report.md | 1 |
| FS-14 | A `core` design-comparison criterion is must-pass: under the default blocking policy (`Blocking: all`) a `not_met` ruling on it stops the run from exiting `satisfied` | .trd-state/core-boards-in-designs/evidence/iter1/FS-14/core-all.out.json | 1 |
| FS-15 | A `core` design-comparison criterion still blocks under `Blocking: must-pass only`: a `not_met` ruling on it stops the run from exiting `satisfied` and is not filed as a non-blocking defect | .trd-state/core-boards-in-designs/evidence/iter1/FS-15/core-must-pass.out.json | 1 |
| FS-16 | Each of the 3 design commands, `/create-design`, `/refine-design` and `/audit-design`, carries the Core rule: at most 8 Core boards, and only `to-be` and `as-is` boards may be Core | .trd-state/core-boards-in-designs/evidence/iter1/FS-16/grep.txt | 1 |
| FS-17 | A lib step writes the Core marker into the `canvas.json` title of each Core board, and leaves the title of every non-Core board unmarked | .trd-state/core-boards-in-designs/evidence/FS-17/r3/titles.after.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

## Evidence

### FS-13 — An `evidence-only` frame is still captured and shown for review: its row appears in the verification report with its screenshot, even though its ruling cannot fail the run (met)

![FS-13](evidence/iter1/FS-13/home-loading-capture.png)


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | 1 | 1 | 0 |

_None still open._

