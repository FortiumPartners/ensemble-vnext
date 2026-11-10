# Verification plan: fix-ship-merge-record-clash

**Written**: 2026-11-10T00:00:00Z by /refine-verification
**From run**: stalled at 24/25 (iteration 2), report `.trd-state/fix-ship-merge-record-clash/verification-report.md`
**Agreed with**: derived from the evidence; no open items

## Blockers
none

## Slices
none

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-25 (end-to-end merge of a record-only-clash PR on real GitHub) is out of scope for this feature: the TRD's Non-Goals list "Running the live check against a real GitHub PR clash (deferred; needs a scratch remote)", and its Verification Environment and Could Not Verify sections record that the owner deferred that live check. The criterion is aligned with that decision, not built or exercised. Lifting the deferral is the owner's own call. | `docs/TRD/fix-ship-merge-record-clash.md` Non-Goals (line 71), Verification Environment (line 80), Could Not Verify (line 119) — already written; nothing added |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| FS-25 | accepted | the TRD defers the live GitHub check by owner decision (R1); not a must-pass criterion (its Must pass cell is empty), and the behaviour it would show end to end is covered piecewise by FS-8–FS-18 (the local merge, run) and FS-20–FS-24 (the contract's steps and order, read) |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
