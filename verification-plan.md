# Verification plan: fix-implement-skips-verification-loop

**Written**: 2026-11-17T18:05:00Z by /refine-verification
**From run**: must-pass-unproven at 8/11, report `.trd-state/fix-implement-skips-verification-loop/verification-report.md`
**Agreed with**: the `--auto` product-manager agent answered the three definition problems (FS-4, FS-9, FS-11); everything else derived from the evidence
**Next run scope**: targeted — only the open criteria FS-4, FS-9 and FS-11. Since the last run (anchor `529fcc2d`) only `.claude/verification-notes.md`, a record, changed; no code the eight met criteria rest on moved, so they carry forward.

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| none | | | | |

No criterion failed: all three open ones lack evidence, and nothing shows the build misbehaving.

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | Live headless `/implement-trd` fixture run forced down the "no source" not-run exit (`fixtures`, slot-2): copy `evidence/live/fs1-driver.sh`, drop the fixture TRD's `**Source PRD**` line and do not write the PRD file, so no source resolves (implement-trd.md §8.1 step 1). Artifact: the session's final assistant message, containing "Verification did not run: <reason>" matching the state file's `reason`. | FS-4 |
| 2 | Live headless `/implement-trd` fixture run with an empty derive pass (`fixtures`, slot-3): unmodified fs1 fixture, but after scaffolding replace the slot's `.claude/agents/product-manager.md` with a stub that returns at once and writes no `success-definition.md`. Transcript must show the background derive dispatch, a second foreground `Agent(product-manager)` dispatch, then `record-not-run` with the "no definition produced" reason. Its final readout is a second capture for FS-4. Refresh the slot afterwards (`scaffold-project.sh --refresh`). Slices 1 and 2 may run at once (pool of 4 fixture sessions, §1a); about 20 minutes each. | FS-9, FS-4 |
| 3 | Re-judge against the narrowed criterion (ruling R3) from existing evidence `evidence/iter2-fs11-recheck.txt` (`local`) | FS-11 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | OWNER-CALL, decided by: agent (--auto). The readout criterion (FS-4, must-pass for objective O2: a loop that does not run says why in the final readout) is kept unchanged; it asks for evidence the run never captured, not evidence the build cannot produce. The line exists (`packages/core/commands/implement-trd.md:2637-2643`) and a test checks its presence (`verification-not-run-prose.test.js:99-109`), but no live run has shown it; slices 1 and 2 capture it. If it still cannot be shown, the owner's three ways out: declare an environment that reaches it (via `/verification-setup`); declare an off-host CI proof (`<workflow file>#<job>`) on O2 in the TRD's Objectives table — the owner's to write, never this command's; or remove the must-pass mark from O2. | this plan only |
| R2 | OWNER-CALL, decided by: agent (--auto). The derive-retry criterion (FS-9) is kept and captured live (slice 2). No stub-agent test can stand in: the retry is command prose the model follows (`implement-trd.md:1846-1866`), and the only test checks the words are present (`verification-not-run-prose.test.js:89-91`). | this plan only |
| R3 | OWNER-CALL, decided by: agent (--auto). The Exercise re-check criterion (FS-11) is narrowed to: "The Exercise prompt the loop sends tells the exerciser to repeat a failing step once and state its environment diagnosis from the second response." That is the build's whole deliverable here (`packages/core/workflows/verify-functional.js:732-735`, shown in a real dispatch and asserted by a test, `evidence/iter2-fs11-recheck.txt`). One live run would sample the model's judgement, not the build. **Not proven, named rather than dropped:** an exerciser actually obeying the rule is shown by no run. Restore the behavioural criterion if the repeat moves into code, or if a later run shows an exerciser blaming the environment without repeating the step. | this plan only |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| none | | |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

No `check`-role skill fits: none of the open criteria concern a design, a screen's data or a screen-to-screen flow.

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build
