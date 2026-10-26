# Verification plan: verification-preflight

**Written**: 2026-10-26T02:20:00Z by /refine-verification
**From run**: unbuilt at 20/21 (must pass 13/14), report `.trd-state/verification-preflight/verification-report.md`
**Agreed with**: derived from the evidence; no open items

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | "held by another checkout" on declared ports, re-judged under ruling R1 | FS-8 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-8 (the setup check reports an environment as held by another checkout) is judged on its port half only: a process listening on a declared localhost port whose git top-level is not this checkout's reads `other-checkout`, and one inside reads `this-checkout`. Its "or holding a declared resource" half follows the TRD's decision D9: lock files per resource are not built, because nothing declares one today, and a resource with no port reads `unknown`, which is a flag and never a failure. The port half was already shown working in iteration 1. Revisit when the owner declares a lock-file claim rule in `.claude/verification-notes.md` (D9's own revisit condition). Cites `docs/TRD/verification-preflight.md` §1.2 D9, which the owner approved at `/refine-trd` v1.3.0 (2026-10-25). | `docs/TRD/verification-preflight.md` §1.2 D9 (already recorded; no new edit) |

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
