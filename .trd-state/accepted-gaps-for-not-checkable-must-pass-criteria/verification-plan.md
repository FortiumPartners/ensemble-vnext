# Verification plan: accepted-gaps-for-not-checkable-must-pass-criteria

**Written**: 2026-11-12T15:10:00Z by /refine-verification --auto
**From run**: satisfied at 32/32, **superseded** — report `.trd-state/accepted-gaps-for-not-checkable-must-pass-criteria/verification-report.md`
**Agreed with**: derived from the evidence; no open items (every ruling below aligns a criterion with a decision already written in `docs/TRD/accepted-gaps-for-not-checkable-must-pass-criteria.md`, so none needed the `--auto` agent)

## Diagnosis

The last run reported `satisfied` (32 of 32 proven, 21 of 21 must-pass), but that result is void.
Its Debug stage reached it by rewriting correct code to match criteria that describe the design
the TRD rejected: an `Off-host proof` column in the success definition, copied there by the
deriver (rejected by TRD D1 and NG10), and settling a preclassified criterion off-host (rejected
by D7 and NG11). Those edits were reverted in commit df966ffe
(`debug-stage-reverted.patch`), so every piece of evidence in that report was gathered against
code that no longer exists. Nothing is proven on the code as it stands: all 32 criteria,
including all 21 must-pass ones, need re-checking.

The current code matches the TRD (read 2026-11-12): the reader `offHostDeclarations` reads the
TRD's Objectives column and joins through `Must pass`, with ignore reasons `not must-pass`,
`malformed` and `not declared for every named objective` (`packages/core/lib/functional-verification.js:877-912`);
the settling helper `settleOffHost` has exactly two call sites, the fold and the resume seeding
(`packages/core/workflows/verify-functional.js:2038`, `:2618`); `/verify-build`'s `--criteria`
subset looks proofs up with `--ids` (`.claude/commands/verify-build.md:528`).

The definition problem is eight criteria whose wording contradicts the TRD. The success
definition file is not edited here (this command writes only this plan); the rulings below are
folded into the Judge's notes by the next `/verify-build` and govern how those criteria are read.

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| none | | | | |

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | declaration reader and CI lookup verb (local working tree, lib calls with stub gh) | FS-1, FS-2, FS-3, FS-4, FS-6, FS-7, FS-8, FS-9, FS-10, FS-11, FS-12 |
| 2 | workflow settling, voiding and exit upgrade (local working tree, workflow runs with stub agents) | FS-15, FS-16, FS-17, FS-18, FS-19, FS-20, FS-21, FS-22, FS-23, FS-24 |
| 3 | command wiring, contracts and `/refine-verification` text (local working tree, text and Jest) | FS-5, FS-13, FS-14, FS-27, FS-30, FS-31 |
| 4 | report line and custody (local working tree, render-report and Jest) | FS-25, FS-26, FS-28, FS-29 |
| 5 | live fixture proof (one `fixtures` slot, stub gh on PATH) | FS-32 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-1 (must-pass, O1) is read as: given a TRD whose `## Objectives` table has an `Off-host proof` column, the reader returns one declaration per must-pass criterion whose `Must pass` cell names only must-pass objectives that all declare the same job, keyed by criterion id, with `<workflow file>#<job name>` split into workflow and job. The success definition has no such column. Aligned with TRD D1, D2, NG10 | this plan only (Judge notes); success definition unchanged |
| R2 | FS-2 (must-pass, O1) is read as: an `Off-host proof` cell on a TRD objective not marked must-pass produces no declaration and is returned under `ignored` with reason `not must-pass`; and a criterion whose named must-pass objectives do not all declare the same job is `ignored` with `not declared for every named objective`. Aligned with TRD D2 | this plan only (Judge notes) |
| R3 | FS-3 (must-pass, O1) is read as: a malformed `Off-host proof` cell on a must-pass TRD objective (for example one with no `#<job name>`) produces no declaration and is returned under `ignored` with reason `malformed`. Aligned with TRD D1, D2 | this plan only (Judge notes) |
| R4 | FS-4 is read as: a TRD with no `Off-host proof` column yields no declarations and no ignored entries, and the run behaves as before. Aligned with TRD O9, D1 | this plan only (Judge notes) |
| R5 | FS-5 (must-pass, O1) is read as: the TRD-authoring contract (`packages/core/contracts/trd-authoring.md`) documents the optional `Off-host proof` column on the TRD's `## Objectives` table, declared on a must-pass objective, and states that the success definition gains no column and joins through `Must pass`; mirrors byte-identical. The functional-verification contract is **not** required to document a definition column or a deriver copy rule, and must not instruct the deriver to copy one. Aligned with TRD D1, D3, NG10 | this plan only (Judge notes) |
| R6 | FS-14 is read as: a sweep-file run passes `offHostProofs: []`; a `--criteria` subset run calls `off-host-proofs --ids <the named ids>` (and recomputes with `--ids <retry set>` on its retry), never `[]` by rule. Aligned with TRD D11 and OQ-3 (a labelled departure from the investigation) | this plan only (Judge notes) |
| R7 | FS-17 (must-pass, O2, 3 parts) is read as: the green-proof settling happens on each of the 3 paths that settle a not-checkable must-pass criterion: the Judge fold, a regression round (which passes through the fold), and the resume seeding of a persisting `not_verifiable` entry. Preclassification is **not** a path and must not be built as one. Aligned with TRD D7, D10(b), NG11 | this plan only (Judge notes) |
| R8 | FS-30 (must-pass, O4) is read as: the third way out names declaring an off-host proof on every must-pass objective the criterion's `Must pass` cell names, **in the TRD's Objectives table only**; the success definition is not written. Aligned with TRD D16, D1 | this plan only (Judge notes) |
| R9 | For every criterion above: where its text in `success-definition.md` disagrees with the ruling, the ruling wins, and the Debug stage must not change code to match the old wording. A gap that only the old wording produces is a definition problem, not a build defect | this plan only (Judge notes) |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| none | | |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
