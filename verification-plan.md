# Verification plan: core-boards-in-designs

**Written**: 2026-11-16T21:30:00Z by /refine-verification --auto
**From run**: stalled at 16/17 (must-pass 15/15 proven), report `.trd-state/core-boards-in-designs/verification-report.md`
**Agreed with**: derived from the evidence; no open items
**Next run scope**: targeted — only the open criterion FS-16 (the three design commands state the Core rule). Nothing has changed since the last run's anchor `b78d4572`; the one planned blocker edits only `packages/core/commands/create-design.md` and its vendored copy `.claude/commands/create-design.md`, and no other criterion's covered files include either.

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| B1 | state the full Core rule in `/create-design`: alongside the existing cap of 8 (line ~75), say that only `to-be` and `as-is` boards may be Core — never a `part` or `flow` board — in the same words `/refine-design` (line ~204) and `/audit-design` (line ~73) now use; keep both copies identical | `packages/core/commands/create-design.md`, `.claude/commands/create-design.md` | — | FS-16 |

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | design command prompt text (local working tree, grep over the 3 command files) | FS-16 |

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
