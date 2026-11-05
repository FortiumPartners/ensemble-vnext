# Verification plan: design-approve-verb

**Written**: 2026-11-05T21:24:00Z by /refine-verification
**From run**: must-pass-unproven at 20/27, report `.trd-state/design-approve-verb/verification-report.md`
**Agreed with**: the owner answered the one open item (how to settle the four must-pass command-order criteria): live fixture runs (R1). Everything else derived from the evidence.

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | Refresh the react-web fixture's vendored runtime to this branch first (copy `.claude/lib/design-map.js`, `.claude/commands/create-trd.md`, `plan.md`, `refine-design.md`, `.claude/workflows/create-trd.js`, `.claude/contracts/trd-authoring.md` from this checkout), then live headless `/create-trd --design` runs in `.trd-state/design-stage/evidence/live/work/react-web` on a fresh fixture design (draft to-be boards, one board held by a draft part, one uncommitted board edit): one run made to stop before the TRD is written (FS-20), one completed run (FS-21, FS-22, FS-23), one run on a design with no buildable board (FS-24). One fixture repository: run them one after another, each on its own branch | FS-20, FS-21, FS-22, FS-23, FS-24 |
| 2 | Live headless `/plan --design docs/ui/<slug> --boards <ids>` runs in the same fixture: one stopped before its TRD is written, one completed (TRD written, then approve, then `building`) | FS-25 |
| 3 | Live headless `/refine-design <slug> --approve <ids>` in the same fixture, naming an approved board edited since its approval and a draft part board | FS-19 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | The command-order criteria are proven by live headless sessions in the react-web fixture (`.trd-state/design-stage/evidence/live/work/react-web`), as the design-stage checks were; the verification loop may start `claude` sessions there for this run. Applied to all seven slash-command criteria, not only the four must-pass ones, since the same runs cover them | `docs/TRD/design-approve-verb.md` Open Questions |

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
