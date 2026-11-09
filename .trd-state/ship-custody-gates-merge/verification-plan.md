# Verification plan: ship-custody-gates-merge

**Written**: 2026-11-08T00:00:00Z by /refine-verification --auto
**From run**: must-pass unproven at 9/13, report `.trd-state/ship-custody-gates-merge/verification-report.md`
**Agreed with**: the `--auto` product-manager agent answered three open items — the way out for the four unreachable must-pass merge-step criteria (OWNER-CALL), whether a stubbed `gh` could prove them (default: no), and what only the owner holds (OWNER-CALL)

## Blockers
none

## Slices
none

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | OWNER-CALL — decided by: agent (--auto), the owner's call taken in their absence. **Question:** FS-7 (the merge step runs the custody gate before `gh pr merge`; a failing gate leaves the PR unmerged), FS-8 (gate, then pr-head check, then `gh pr merge`, in order), FS-9 (re-verification runs inside the merge step on the already-pushed head, then custody re-anchors) and FS-10 (nothing committed or pushed between gate and merge; `--match-head-commit` equals the PR's head) are must-pass and cannot be reached: `verification.md` §1 declares no GitHub repository, and production must not be touched. Which way out? **Decision:** keep the must-pass marking on objectives O3, O4 and O7; the way out is for the owner to declare a throwaway GitHub repository through `/verification-setup`. The other way out — removing the must-pass marking from the TRD's Objectives table for O3/O4/O7 — is not taken. **Reasoning:** these objectives are what the fix exists for; issues #86 and #88 only show up on GitHub (a PR head trailing the push, GitHub refusing `--match-head-commit`), so dropping the marking would close the feature without proving the defect gone. The route is known to work: `/ship-build` ran end to end on a throwaway repo on 2026-11-07 (CHANGELOG.md). **Meanwhile:** the contract text (`ship-primitive-merge.md`, `ship-custody-gate.md`), the ordering assertions in `ship-primitives.test.js`, and `custody.js` against a local bare origin are supporting evidence only, not proof; the next `/verify-build` would find these four not verifiable again until the environment exists. | this plan only |
| R2 | default — decided by: agent (--auto). A stub `gh` in a fixtures slot does not prove FS-7 to FS-10: the criteria ask for GitHub's own answers (`gh pr view` state OPEN/MERGED, `headRefOid` matching), and #88 happened precisely because real GitHub disagreed with the framework's assumptions. A stub would replay those assumptions (a harness artefact); call order is already proven by `ship-primitives.test.js`. Cause stays "environment not reachable"; no stub fixture is built. | this plan only |

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
