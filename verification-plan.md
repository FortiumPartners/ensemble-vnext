# Verification plan: audit-before-functional-verification

**Written**: 2026-11-17T04:40:00Z by /refine-verification --auto
**From run**: stuck at 26/27 (must-pass 8 of 9), report `.trd-state/audit-before-functional-verification/verification-report.md`
**Agreed with**: derived from the evidence; no open items (no `product-manager` agent was needed). Ruling R1 is carried forward unchanged from the previous `--auto` plan.
**Next run scope**: targeted — the one open criterion FS-14, plus the met criteria that `0abb1b75` (the only commit since the report's head `37583973`: Step 9 NEXT prose in both `implement-trd.md` copies and a new pin in `audit-first-order.test.js`) can reach: FS-1, FS-2, FS-5, FS-9, FS-11, FS-12, FS-13 (their covers include `implement-trd.md`), FS-15 (the edit is to the NEXT branches whose rule FS-15 states), FS-25 (both command copies changed; they must still be identical), FS-26 (command text changed; the old-order grep must stay empty) and FS-27 (`audit-first-order.test.js` changed). FS-3, FS-4, FS-6–FS-8, FS-10, FS-16–FS-24 stand: no changed file reaches them.

## Diagnosis

The last run ended stuck at 26 of 27 criteria proven, with iteration 2 of 3 used. Must-pass: 8 of 9 proven. One unproven must-pass criterion, and it is the only open one:

- **When the audit does not pass, `/implement-trd` closes nothing, and NEXT follows the audit's own result (cap reached → `/close-feature`, a requirement with no task → the design work), with any re-audit run inside the audit step rather than handed to the owner as a standalone `/audit-build` (FS-14, must-pass)**: evidence gap — evidence missing. Nothing was captured at the run's head: the driver for the two failed-audit fixture runs (`evidence/live/z3.sh`, slot 3, run one after the other with a 45-minute limit each) was still inside its first run when the pass ended, so it left a partial transcript (`z3-nv.jsonl`, no `.rc` file) and no harvest. The defect iteration 1 saw — NEXT naming a standalone `/audit-build` after an `open` audit return — was fixed by the Debug stage after the report, in `0abb1b75`, and that fix is unproven. The `cap reached` branch has never been exercised.

Causes: 1 open on evidence missing. Nothing judged failed, nothing unbuilt, nothing unverifiable.

No `verification.md` need is recorded in the discovery ledger.

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| none | | | | |

FS-14 is an evidence gap, not a build defect: the fix for the defect last seen is already committed (`0abb1b75`). The next run re-captures; it builds only if the re-capture shows the defect is still there.

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | Failed-audit `/implement-trd` runs, judged against ruling R1, each in **its own** headless fixture slot so they run at once rather than in sequence (last time, sequencing them in one slot is why nothing finished). Start them first. **(a)** slot 1: the uncovered-requirement seed (`z3.sh` B1: FR-3 with no task, Cyrillic-e defect, `--resume --no-verify`): expect nothing closed, no `closed.json`, NEXT the design work in plain lines with no fenced `/audit-build` block. **(b)** slot 2: the same seed run default (`z3.sh` B2): verification also falls short, so NEXT is verification's own with one STATE line naming the audit's finding and that the close waits (R1). **(c)** slot 3: the `cap reached` branch, never yet exercised: seed `audit-rounds.jsonl` with prior non-passing rounds so the next round hits the audit cap that `audit-rounds.js decide` enforces, run `--resume --no-verify`, and expect `RETURN → cap reached`, nothing closed, and NEXT `/close-feature docs/TRD/smoke-fv.md` alone in its block. Each slot needs `git -C <slot> init -q -b main` and a `rev-parse --show-toplevel` check before any git command, and a check that no other driver holds the slot (`.claude/verification-notes.md`). Read `.rc` before reading a transcript | FS-14 |
| 2 | Re-read the existing transcripts for the readout-NEXT criteria against the new Step 9 text: a passing-audit close (FS-11, FS-12), a not-satisfied verification after a passing audit (FS-13) and the NEXT rule (FS-15). Re-walk live in slot 4 only if the prose change alters what their evidence must show; otherwise the regression pass confirms them on the changed covers | FS-1, FS-2, FS-5, FS-9, FS-11, FS-12, FS-13, FS-15 |
| 3 | Local re-checks: mirror identity of the two `implement-trd.md` copies, the old-order grep, and `npx jest packages/core/commands packages/core/lib/audit-rounds.test.js` | FS-25, FS-26, FS-27 |

Slice 1 uses three of the four headless fixture sessions `verification.md` §1a allows (slots 1–3); slice 2 may use the fourth. Slice 3 needs only the working tree.

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-14 is read as the TRD decides, not as worded: verification **does** still run after an audit that did not pass (D4: "Step 8 runs after Step 7.3 whatever its last RETURN says"; the alternative of skipping it was rejected), and NEXT follows the audit's result (`cap reached` → `/close-feature`, `open` → the design work) only when verification was `satisfied` or skipped. When verification also fell short, NEXT is verification's own, with one STATE line saying what the audit found and that the close waits (D10). Carried forward unchanged from the previous plan | this plan only (decided by: agent (--auto), aligning the criterion with TRD D4 and D10) |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| none | | |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | the four `check` skills (design comparison, design structure, flow-as-built, data fidelity) need a UI, a design or a data source; this feature has none of them |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
