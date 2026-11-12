# Verification plan: one-full-regression-pass-at-the-end

**Written**: 2026-11-12T00:00:00Z by /refine-verification --auto
**From run**: must-pass-unproven at 16/19 (must-pass 10/12), report `.trd-state/one-full-regression-pass-at-the-end/verification-report.md`
**Agreed with**: the `--auto` product-manager agent answered all three open items (FS-1, FS-12, FS-19), each OWNER-CALL decided in the owner's absence

## Blockers
none. No criterion failed on the build. All three open criteria are definition problems: evidence gaps that stayed gaps after their one re-capture.

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | local Jest evidence (working tree, one at a time): the cap-exit regression test in `packages/core/workflows/verify-functional.test.js`, and the custody artifact-covers test in `packages/core/lib/custody.test.js`, per R1 and R2 | FS-1, FS-12 |
| 2 | live fixture run (`fixtures` environment, slot-1): rework `test/smoke/scenarios/verify-regression-pass.sh` per R3, then run it once | FS-19 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | **FS-1** (must pass, objective O1: the regression pass also runs at the iteration-cap exit). Question: change the criterion, or change the build's outputs? Decision: keep the criterion and its must-pass mark. Narrow the wording to "…or when the Judge returns an exit at the iteration-cap iteration, and a Debug pass changed files or criteria are awaiting regression…". Add a Jest case in `verify-functional.test.js` (after the O3 test, ~:4660): `journey(reproven, { args: { cap: 2 }, middle: exitWith('exit-stuck', [bd('FS-3','k')], { gaps: ['FS-3'] }), files: ['src/a.js'] })`. It asserts 3 Judge calls, a first regression exercise of `['FS-1']` with reason `covers-changed`, and `regression.rounds[0]` = `{round:1, iteration:2}`. Reasoning: the pass runs only on a Judge exit (`verify-functional.js:3345-3350`). The fall-through return when the Judge keeps returning remediate up to the cap (`:3498-3519`, `regression: null`) is a Judge failure the TRD planned (TRD :440), so it sits outside the criterion. The existing cap test (`verify-functional.test.js:728-742`) uses `filesChanged: []` and proves nothing about the pass. **OWNER-CALL — decided by: agent (--auto)** | this plan only |
| R2 | **FS-12** (must pass, objective O4: custody reads the regression pass's artifact as well as its status). Decision: keep the criterion and its must-pass mark. Add a test in `custody.test.js`, inside `describe('a state written by the regression pass…')` (~:456-503). Give the FS-2 regression entry a real artifact, recorded with `liveEvidence.record` and covering `src/c.js`. Commit `src/c.js`, then assert that reconcile returns `reverify` for `['FS-2']` and reuses `['FS-1']`. Reasoning: custody reads covers from the artifact first (`custody.js:469, 478-483`), and every regression entry in today's fixtures has `artifact: null` (`custody.test.js:462, 465`), so that branch is never reached. **OWNER-CALL — decided by: agent (--auto)** | this plan only |
| R3 | **FS-19** (objective O9, not must-pass: a live fixture run shows the regression pass catching a criterion that a fix broke). Decision: keep the criterion and redesign the scenario. Today `invoice.js` and `receipt.js` are frozen, so a careful Debug sees that the only possible fix breaks FS-2 and declines. All three runs stalled. The changes: remove the FROZEN markers (:19-20, :180, :185); point FR-1 / RGX-001 at the shared formatter `fmt` in `format.js` (it must show two decimals); restate FS-2 as an implicit printer limit, `receipt.line(12345).length <= 8`. The fix turns `$12345` into `$12345.00`, which is 9 characters, so FS-2 breaks. Replace the frozen-file check (:337-343) with a named INCONCLUSIVE when `invoice.js` changed but `format.js` did not. The covers mapping is unchanged, so FS-2 is re-checked as `covers-changed`. Whether the live Debug actually picks the `format.js` fix is a belief, not a fact, and one run settles it. The existing INCONCLUSIVE paths mean a miss can never pass. **OWNER-CALL — decided by: agent (--auto)** | this plan only |

## Accepted as not verifiable
none

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
