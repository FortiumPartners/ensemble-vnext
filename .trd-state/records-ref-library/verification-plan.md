# Verification plan: records-ref-library

**Written**: 2026-11-12T00:00:00Z by /refine-verification (--auto)
**From run**: stalled at 24/25 (must-pass 20/21), report `.trd-state/records-ref-library/verification-report.md`
**Agreed with**: derived from the evidence; no open items (the one open criterion contradicts a decision the TRD already records, so it is aligned with that decision rather than asked about; no `--auto` agent was needed)

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | re-judge the unwritable-`objects/` case against the realigned criterion (ruling R1), on the local working tree; existing evidence `.trd-state/records-ref-library/evidence/fs9-10-iter2-transcript.txt` lines 22-23 and the Jest case (c) in `packages/core/lib/record-ref.test.js` | FS-10 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-10 (a reader-only user, simulated by an unwritable `objects/`, "falls back to a branch commit") asks for something the TRD's own decision rules out: a branch commit also has to write objects, so with `objects/` unwritable the fallback must fail too. The TRD decided this case already — "When the fallback also fails (an unwritable `objects/` blocks a branch commit too …), `outcome: "failed"` with both reasons; still exit 0, still no throw" — and task FIX-002 case (c) sets the same acceptance. FS-10 is therefore read as: **the write attempts the branch-commit fallback, and when that also fails it prints one JSON line with `outcome:"failed"`, both the ref-write error and the fallback error, exits 0 and does not throw; HEAD is unchanged.** Not a new decision: aligned with the owner-approved TRD, so no `OWNER-CALL` is needed. | already in `docs/TRD/records-ref-library.md` § Decision (lines 109-111) and § Master Task List, FIX-002 case (c); the plan only records the alignment |

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
