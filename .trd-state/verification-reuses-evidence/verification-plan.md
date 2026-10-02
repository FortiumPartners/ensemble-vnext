# Verification plan: verification-reuses-evidence

**Written**: 2026-10-02T23:17:08Z by /refine-verification --auto
**From run**: stalled at 25/26, report `.trd-state/verification-reuses-evidence/verification-report.md`
**Agreed with**: derived from the evidence; no open items

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | Judge prompt wording: capture the assembled Judge prompt text (build it with the workflow's test harness, or print the joined template), not a `grep` of the source, where each sentence spans concatenated string literals; claim a locator copied verbatim from that capture | FS-25 |

## Owner rulings
none

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
