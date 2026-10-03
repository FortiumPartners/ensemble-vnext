# Investigation: plan-sweep-chain

**Kind**: change
**Weight**: medium (re-weighed from small after the adversarial review found 14 problems across more surfaces than first assessed, four letting the never-unattended brake fail open)
**Route**: plan

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | With a sweep list and `--implement`, `/plan` runs `/sweep`, `/verify-build` on the sweep file, a commit of the swept fixes, then `/implement-trd` on the core. Without `--implement` it lists the steps, as today. | owner, 2026-10-03: "chain the sweep ending when --implement is passed: sweep, verify the sweep, commit the swept fixes, then implement the core" |
| O2 | The chain stops when the sweep's verification is not satisfied. | owner, 2026-10-03: "stop if the sweep is not satisfied" |
| O3 | Criteria the sweep finds are not sweep items are folded into the core plan, and the chain continues without asking. | owner, 2026-10-03: "If the sweep determines that items need to be folded back into the plan step, accommodate that and automatically continue" |
| O4 | One banner per run. | `.claude/rules/command-status.md` |
| O5 | Never-unattended paths are never edited unattended; an unreadable list stops the chain. | `.claude/rules/verification.md` §5b; `fix-plan.js:129-139` |

## Intended Change

The owner's request, verbatim (2026-10-03): "chain the sweep ending when --implement is passed:
sweep, verify the sweep, commit the swept fixes, then implement the core; stop if the sweep is not
satisfied. If the sweep determines that items need to be folded back into the plan step,
accommodate that and automatically continue."

Current behaviour [read]: `fix-plan.js` `finishSweep` (lines 206–239) returns `chain: false`
whatever `--implement` says, and NEXT lists the four steps. `/sweep` ends `COMMAND STUCK` when a
criterion is not a sweep item or overlaps the core (`sweep.md` Step 3a), telling the owner to
re-run `/plan`.

## Decision

See the TRD's `## Decision`: `/plan` runs the steps as `Skill()` calls, with `sweepChainNext` in
`fix-plan.js` deciding each step from what the previous one wrote to disk; `/sweep` and
`/verify-build` gain `--chained`; fold-back re-enters `/plan`'s own split for the returned ids.

## Grounding

The adversarial review (2026-10-03) grounded every surface with file:line evidence; its findings
are applied in the TRD (v1.1.0) and its Task Grounding carries the citations.

## Open Questions

none
