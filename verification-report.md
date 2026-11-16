# Functional Verification Report: core-boards-in-designs

**Source PRD**: docs/TRD/core-boards-in-designs.md § Intended Change
**Success definition**: .trd-state/core-boards-in-designs/success-definition.md
**Outcome**: Stalled (no full-environment run declared)
**Reason**: iteration closed no gaps and no causes — remediation is not converging
**Criteria**: 17 total — 16 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 16 of 17 proven — uncovered: FS-16
**Must pass**: 15 of 15 proven
**Screenshots**: 1 shown
**Diagnosis**: 1 open — 1 build defect — 1 judged failed
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Map validation accepts a `design-map.json` whose boards carry `"core": true` or `"core": false`, with no more than 8 Core boards, all of kind `to-be` or `as-is` | .trd-state/core-boards-in-designs/evidence/FS-1/validate.txt | 1 |
| FS-2 | Map validation rejects a `design-map.json` that marks more than 8 boards Core, and says the limit was exceeded | .trd-state/core-boards-in-designs/evidence/FS-2/validate.txt | 1 |
| FS-3 | Map validation rejects `"core": true` on a board that is neither `to-be` nor `as-is` (for example a `part` board or a `flow` board) | .trd-state/core-boards-in-designs/evidence/FS-3/validate.txt | 1 |
| FS-4 | A legacy map, one in which no board carries a `core` key, is read with every screen board treated as Core: the comparison-row generator classes the default-state frame of every screen board `core` | .trd-state/core-boards-in-designs/evidence/regression-1/FS-4/summary.txt | iteration 2 (regression pass 1) |
| FS-5 | The design-comparison rows are produced by a CLI from the map, not written by a model, and the same map always yields the same rows | .trd-state/core-boards-in-designs/evidence/regression-1/FS-5/diff.txt | iteration 2 (regression pass 1) |
| FS-6 | Every generated comparison row carries a class: `core` for the default-state frame of a Core board, and `evidence-only` for every other frame, including every frame of a non-Core board and a Core board's non-default states and second viewport | .trd-state/core-boards-in-designs/evidence/regression-1/FS-6/summary.txt | iteration 2 (regression pass 1) |
| FS-7 | A 12-board fixture design with 8 Core boards yields exactly 8 must-pass (`core`) and 4 `evidence-only` design-comparison criteria | .trd-state/core-boards-in-designs/evidence/regression-1/FS-7/summary.txt | iteration 2 (regression pass 1) |
| FS-8 | The success definition written for a design-comparison check records each row's class, so a reader of the definition file can tell which rows are `core` and which are `evidence-only` | .trd-state/core-boards-in-designs/evidence/regression-1/FS-8/summary.txt | iteration 2 (regression pass 1) |
| FS-9 | The verification loop gets the set of evidence-only criterion ids by reading the success-definition file in code, not from a model's reading | .trd-state/core-boards-in-designs/evidence/regression-1/FS-9/summary.txt | iteration 2 (regression pass 1) |
| FS-10 | An `evidence-only` criterion ruled `not_met` is not an open gap: it is not handed to the Debug stage and does not make the loop iterate again | .trd-state/core-boards-in-designs/evidence/regression-1/FS-10/only-evidence.out.json | iteration 2 (regression pass 1) |
| FS-11 | A run whose only failures are `not_met` rulings on `evidence-only` criteria exits `satisfied`, under the default blocking policy as well as under `Blocking: must-pass only` | .trd-state/core-boards-in-designs/evidence/regression-1/FS-11/only-evidence-must-pass.out.json | iteration 2 (regression pass 1) |
| FS-12 | `evidence-only` criteria are left out of the coverage ratio, so unproven evidence-only rows cannot push a run below the coverage floor | .trd-state/core-boards-in-designs/evidence/regression-1/FS-12/with-evidenceOnly.out.json | iteration 2 (regression pass 1) |
| FS-13 | An `evidence-only` frame is still captured and shown for review: its row appears in the verification report with its screenshot, even though its ruling cannot fail the run | .trd-state/core-boards-in-designs/evidence/regression-1/FS-13/report.md | iteration 2 (regression pass 1) |
| FS-14 | A `core` design-comparison criterion is must-pass: under the default blocking policy (`Blocking: all`) a `not_met` ruling on it stops the run from exiting `satisfied` | .trd-state/core-boards-in-designs/evidence/regression-1/FS-14/core-notmet-all.out.json | iteration 2 (regression pass 1) |
| FS-15 | A `core` design-comparison criterion still blocks under `Blocking: must-pass only`: a `not_met` ruling on it stops the run from exiting `satisfied` and is not filed as a non-blocking defect | .trd-state/core-boards-in-designs/evidence/regression-1/FS-15/core-notmet-must-pass.out.json | iteration 2 (regression pass 1) |
| FS-17 | A lib step writes the Core marker into the `canvas.json` title of each Core board, and leaves the title of every non-Core board unmarked | .trd-state/core-boards-in-designs/evidence/FS-17/r3/titles.after.txt | 2 |

## Not Met

| ID | Statement | Kind | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|------|--------|--------|---------|----------|
| FS-16 | Each of the 3 design commands, `/create-design`, `/refine-design` and `/audit-design`, carries the Core rule: at most 8 Core boards, and only `to-be` and `as-is` boards may be Core | build defect | pass | /refine-design (line 204) and /audit-design (line 73) state the full Core rule (at most 8, only to-be and as-is may be Core). /create-design states the cap of 8 (line 75) but nowhere states that only to-be and as-is boards may be Core; it says only that core is true on a Core to-be board, false on every as-is board and absent on a part (line 151), and is silent on flow boards. Both copies of create-design.md are identical. | create-design.md never states that only to-be and as-is boards may be Core | iter 1: not_met; iter 2: not_met |

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| design-commands-missing-core-rule | FS-16 | 1 (FS-16) | open |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

Scope: targeted — re-checked 12: covers-changed 12

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-4 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md, packages/core/commands/audit-design.md, packages/core/commands/refine-design.md |
| FS-5 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-6 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-7 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-8 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-9 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-10 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-11 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-12 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-13 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-14 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |
| FS-15 | covers-changed | .claude/commands/audit-design.md, .claude/commands/refine-design.md |

Caught: _none._

Not re-walked (covered files unchanged): FS-1, FS-2, FS-3, FS-17

Changed files no criterion covers: _none._

## Evidence

### FS-13 — An `evidence-only` frame is still captured and shown for review: its row appears in the verification report with its screenshot, even though its ruling cannot fail the run (met)

![FS-13](evidence/regression-1/FS-13/home-loading-capture.png)

