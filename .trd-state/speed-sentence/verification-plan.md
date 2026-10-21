# Verification plan: speed-sentence

**Written**: 2026-10-20T22:31:13Z by /refine-verification
**From run**: unbuilt at 11/12, report `.trd-state/speed-sentence/verification-report.md`
**Agreed with**: derived from the evidence; no open items

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | re-judge the measurement record's zero counts against the one-audit reading (no live run) | FS-10 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-10 (per-after-run zero counts and new audit gaps) is aligned with FIX-004, which plans ONE `/audit-build`, on after-run 1, against the baseline audit. FS-10 is met when all five after-runs carry failed-task, retry and reconcile-reopen counts (read from each `after/run-N/implement.json` and `after/reconcile-reopens.txt`) and after-run 1's audit shows no gap the baseline lacked. After-runs 2–5 need no audit. Cited: TRD Master Task List, FIX-004 ("run `/audit-build` once on the kept project of after-run 1") | `docs/TRD/speed-sentence.md` Decision, 2026-10-20 |

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
