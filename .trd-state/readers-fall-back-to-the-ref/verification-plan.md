# Verification plan: readers-fall-back-to-the-ref

**Written**: 2026-11-12T00:00:00Z by /refine-verification --auto
**From run**: must-pass-unproven at 16/16, report `.trd-state/readers-fall-back-to-the-ref/verification-report.md`
**Agreed with**: one open item (must-pass objective O3 had no criterion) answered by the `--auto` product-manager agent; everything else derived from the evidence

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | command resume paths reach the records ref (O3): command prose order plus the `record-ref.js ensure` CLI, local working tree only | FS-17, FS-18, FS-19 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | OWNER-CALL, decided by: agent (--auto), verdict answered (TRD Objectives row O3, `docs/TRD/readers-fall-back-to-the-ref.md:13`; FIX-009 acceptance, line 196). Question: how should must-pass objective O3 ("the resume path of /implement-trd, /amend, /plan, /task, /verify-build, /refine-verification and /ship-build reaches the ref when the feature's folder is absent") be covered, given the success definition wrote no criterion for it (success-definition.md:39-43)? Decision: keep O3 must-pass and cover it with three local criteria, no live headless session per command (a command is a prompt; its resume path reaches the ref when its prose calls `ensure` first and `ensure` restores the folder; FS-1 already proves the read after a restore). **FS-17**: in `/implement-trd` (before the closed-feature guard's `closed.json` check), `/amend`, `/task`, `/verify-build`, `/refine-verification` and `/ship-build`, `record-ref.js ensure --state-dir .trd-state/<feature>` precedes the first `.trd-state/<feature>/` read; `/plan` reads only via `artifacts.js get` (FS-4). Evidence: passing `packages/core/commands/records-ref-readers-prose.test.js`, per-file line numbers of `ensure` vs first state read, and `cmp` of each `.claude/commands/` copy against `packages/core/commands/`. **FS-18**: on the fixture with the folder deleted and the ref holding it, `node .claude/lib/record-ref.js ensure --state-dir .trd-state/<slug>` prints `restored` and the folder returns with the ref's files; a second call prints `present`. Evidence: both stdouts and an empty `diff -r` against a pre-deletion snapshot. **FS-19**: on the fixture with neither folder nor ref, the same call prints `no-record` and creates no folder. Evidence: stdout, exit code, `ls` showing no folder. All three: environment local, Must pass O3. The alternative (drop the must-pass mark on O3) was rejected: it would leave a stated objective unchecked when a local check costs seconds. | this plan only (agent ruling; never PRD/TRD) |

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
