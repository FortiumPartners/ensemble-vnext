# Verification plan: fix-design-command-defects

**Written**: 2026-11-16T10:00:00Z by /refine-verification --auto
**From run**: stuck at 16/19 proven (13 of 15 must-pass), report `.trd-state/fix-design-command-defects/verification-report.md`
**Agreed with**: derived from the evidence; the one open item (FS-2, a must-pass criterion that cannot be checked here) is recorded as an OWNER-CALL by the --auto agent

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| B1 | When a run republishes both the canvas and the Design System page, `artifacts.json` must hold the new URL (and `previous_url`) for each; the run left one entry under its dead URL in both the `/refine-design` and the `/design-system --sync` fixture runs. Commit 1418e2ed already edits these files for this; the next round re-proves it rather than assuming it worked | `packages/core/contracts/design-commands.md`, `packages/core/commands/refine-design.md`, `packages/core/commands/design-system.md` | — | FS-5 |

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | headless fixture sessions, `/refine-design` and `/design-system --sync` with both artifacts unreadable; check `artifacts.json` after each run ends | FS-5 |
| 2 | headless fixture session where the canvas read fails with an error that is not not-found/no-access; let the run finish (the last capture stopped while the visual critic was still running) and snapshot `design-map.json` and `artifacts.json` after COMMAND COMPLETE | FS-10 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | FS-2 (a canvas read that returns no-access, not just not-found, still republishes) is must-pass (objective O1) and cannot be checked here: the Artifact tool gives one combined error for deleted and not-shared artifacts, and no artifact owned by another account exists in the authorized environments. Not accepted as unverifiable. The three ways out: declare an environment that can reach it (via `/verification-setup`); declare an off-host proof (`<workflow file>#<job name>`) on O1 in the TRD's Objectives table; or remove the must-pass marking from O1. Until the owner picks one, the run cannot report satisfied. decided by: agent (--auto), OWNER-CALL — recommended: the no-access branch shares one code path with not-found (the command treats both as "unreadable"), so the owner may reasonably drop must-pass for FS-2's share of O1 | plan only (not written to the TRD) |

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
