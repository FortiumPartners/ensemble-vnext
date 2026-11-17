# Verification plan: audit-before-functional-verification

**Written**: 2026-11-17T02:10:00Z by /refine-verification --auto
**From run**: stalled at 19/27 (must-pass 5 of 9), report `.trd-state/audit-before-functional-verification/verification-report.md`
**Agreed with**: derived from the evidence; no open items (no `product-manager` agent was needed)
**Next run scope**: targeted — the 8 open criteria (FS-1, FS-3, FS-4, FS-5, FS-6, FS-9, FS-14, FS-24) plus the met criteria the 7 changed files since `9f03cf2b` can reach: FS-2, FS-11, FS-12, FS-13, FS-19 (their covers include `implement-trd.md` / `audit-build.md`, both edited), FS-7 and FS-10 (their RETURN lines are what the edited "print the RETURN line" prose governs), FS-25 (both command copies changed, mirrors must still be identical), FS-26 (command text changed, grep must still find no old order) and FS-27 (`audit-first-order.test.js` changed). FS-8, FS-15–FS-18 and FS-20–FS-23 stand: no changed file reaches them.

## Diagnosis

The last run stopped making progress (`stalled`) at 19 of 27 criteria proven. Must-pass: 5 of 9 proven. Four unproven must-pass criteria:

- **The default run calls the audit after the code review and before verification (FS-1, objective O1)**: evidence gap. The live run for the regression pass never started, so no transcript at the current head exists. Nothing seen shows the build misbehaving.
- **A passing `--defer-close` audit records a pending close and closes nothing (FS-5, O2)**: evidence gap. The standalone run that would produce the `closeDeferred: true` ledger line never ran.
- **`--close-deferred` performs the close from the pending record without re-running verifiers (FS-9, O2)**: evidence gap. It depended on the FS-5 run, which did not happen.
- **A failed audit closes nothing and NEXT follows the audit's result (FS-14, O2)**: judged failed. The criterion's wording contradicts TRD decisions D4 and D10 (see Owner rulings R1). The build did what the TRD says.

Causes: 6 open on missing evidence (FS-1, FS-3, FS-4, FS-5, FS-9 never captured; FS-24's claim could not be matched to its artifact), 2 judged failed (FS-6: the chained audit's RETURN line not printed; FS-14: see R1).

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| B1 | Make `/audit-build --chained` (both `--defer-close` and `--close-deferred`) always print its `[STATUS: /audit-build] RETURN → …` line as reply text, including when its caller runs it inline through a `Skill` call. Commit `c8894259` (verification Debug stage, landed after the report) already adds this prose to both commands and pins it in `audit-first-order.test.js`. The `--fix` round re-checks it live first, and builds further only if the line is still missing | `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/audit-first-order.test.js` | — | FS-6 (and the RETURN-line parts of FS-5, FS-9) |

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | `/audit-build` caller-only modes, run in sequence in one headless fixture slot: `--chained --defer-close` on a passing audit (check the ledger line, the records ref and the printed RETURN), then `--chained --close-deferred` from that pending close. Claims for FS-24 must quote a locator that actually appears in the captured artifact (for example the `git show refs/ensemble/records/<slug>` output line), not the ref's display name | FS-5, FS-6, FS-9, FS-24, FS-7, FS-10 |
| 2 | Default and flagged `/implement-trd` runs in a headless fixture slot: a default run (audit call between the code review and the `verify-functional` dispatch), a `--chained` run (no audit call) and a `--no-verify` run (audit still called). Each needs a complete transcript at head. Start them early: last time they had not finished when the pass ended | FS-1, FS-2, FS-3, FS-4, FS-11, FS-12, FS-13 |
| 3 | A failed-audit `/implement-trd` run in a headless fixture slot, judged against ruling R1: the uncovered-requirement fixture with `--no-verify` (so NEXT must be the design work), plus the existing evidence from the run where verification also fell short (NEXT is verification's, with a STATE line naming the audit's finding) | FS-14 |
| 4 | Local re-checks: mirror identity, order grep, the Jest and BATS command-surface tests, standalone `/audit-build` unchanged | FS-19, FS-25, FS-26, FS-27 |

Slices 1–3 each hold one of the four headless fixture sessions `verification.md` §1a allows (slot 1, 2, 3), so they can run at once. Slice 4 needs only the working tree.

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-14 is read as the TRD decides, not as worded: verification **does** still run after an audit that did not pass (D4: "Step 8 runs after Step 7.3 whatever its last RETURN says"; the alternative of skipping it was rejected), and NEXT follows the audit's result (`cap reached` → `/close-feature`, `open` → the design work) only when verification was `satisfied` or skipped. When verification also fell short, NEXT is verification's own, with one STATE line saying what the audit found and that the close waits (D10). The run judged failed (uncovered requirement, verification `unbuilt`, NEXT `/refine-verification` → `/verify-build`, nothing closed, no standalone `/audit-build`) matches D4 and D10. Re-check: that the STATE line names the audit's finding, and the satisfied-or-skipped branch | this plan only (decided by: agent (--auto), aligning the criterion with TRD D4 and D10) |

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
