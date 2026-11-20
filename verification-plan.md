# Verification plan: deterministic-rebase-engine

**Written**: 2026-11-20T23:00:00Z by /refine-verification --auto
**From run**: must-pass-unproven at 27/27 (21/21 must-pass proven; objective O16 has no criterion), report `.trd-state/deterministic-rebase-engine/verification-report.md`
**Agreed with**: one open item (how must-pass objective O16 gets a criterion) answered by the `--auto` product-manager agent as an OWNER-CALL; everything else derived from the evidence
**Next run scope**: full — no satisfied report exists to anchor a narrower re-run (`.claude/contracts/rerun-scope.md`: no anchor reads as full); the new O16 criterion must be exercised either way

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | path-containment refusals (local working tree: BATS cases plus a direct `--rebase` run against a `..` retired entry and an outward `.claude/commands` symlink) | FS-28 (once added; see R1) |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | OWNER-CALL, decided by: agent (--auto). **Question:** must-pass objective O16 ("every path the engine writes or deletes stays inside the target's `.claude/`, whatever a data file or symlink says", TRD line 45) has no criterion, because the success definition was derived from `docs/plan/deterministic-rebase-engine.investigation.md`, whose Objectives stop at O15 (success-definition.md lines 52–53) — how is it covered? **Decision:** add criterion FS-28 to `success-definition.md` by hand (header `**Criteria**: 28`), citing the TRD; do not delete the definition to re-derive (the same source would reproduce the gap), do not drop O16's must-pass marking (a real safety guarantee), and no off-host proof is needed (it runs locally). **Reasoning:** O16 is specified (TRD lines 92, 100, 254) and its acceptance tests exist (`packages/core/scripts/rebase-engine.test.sh:542`, `:563`; `:327` for the generator) — a definition gap, not a build gap. **Proposed row:** `\| FS-28 \| The engine refuses, with exit 1 and before any write, a run where a retired entry is absolute or contains `..`, or where a planned path resolves outside the target's `.claude/` (for example `.claude/commands` symlinked outside it); the `error` names the offending path \| docs/TRD/deterministic-rebase-engine.md lines 45, 254, 291 (O16; D9, D17; RBE-B002 acceptance) \| BATS `rebase-engine.test.sh` cases at :542 and :563 passing; plus a direct `scaffold-project.sh --rebase --plugin-dir <fixture plugin>` run against (i) a fixture whose retired list holds a `..` entry and (ii) a fixture with `.claude/commands` symlinked to a sentinel directory outside `.claude/`: each exits 1, the `error` names the path, and a tree hash of the target and the sentinel is identical before and after \| [read] \| locator \| 2 \| O16 \|` | this plan only (an `--auto` ruling is never written into the PRD or TRD) |

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
