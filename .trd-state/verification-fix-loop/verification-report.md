# Functional Verification Report: verification-fix-loop

**Source PRD**: docs/plan/verification-fix-loop.investigation.md
**Success definition**: .trd-state/verification-fix-loop/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 38 total — 38 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 38 of 38 proven — uncovered: none

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Every criterion the verification state file records as not `met` carries a `cause` taken from one fixed, enumerated set of causes | .trd-state/verification-fix-loop/evidence/FS-1-4-CAUSES.txt | 1 |
| FS-2 | A criterion's `cause` survives a resume: a criterion settled in one run keeps the same `cause` when the next run carries it forward | .trd-state/verification-fix-loop/evidence/FS-2-settled-carry.txt | 1 |
| FS-3 | A criterion that fails the deterministic evidence check is given a cause saying which way it failed — evidence missing, evidence stale, locator not found, and so on — distinct from a criterion whose evidence passed that check and which the Judge ruled failed | .trd-state/verification-fix-loop/evidence/FS-3-FS-5-FS-6.txt | 1 |
| FS-4 | The causes distinguish, besides the evidence-check failures, at least: judged failed, environment not reachable, capability absent, and never exercised | .trd-state/verification-fix-loop/evidence/FS-1-4-CAUSES.txt | 1 |
| FS-5 | The per-cause counts are computed from the stored `cause` field, never by pattern-matching the free-text reason | .trd-state/verification-fix-loop/evidence/FS-3-FS-5-FS-6.txt | 1 |
| FS-6 | The report for a run ending `stalled`, `stuck`, `unbuilt` or `insufficient-coverage` carries a **Diagnosis** block directly under its Coverage line, giving a count per cause, and those counts agree with the per-criterion causes in the state file | .trd-state/verification-fix-loop/evidence/FS-3-FS-5-FS-6.txt | 1 |
| FS-7 | The readout printed by `/verify-build`, and by `/implement-trd`'s verification step, on those same four outcomes gives the same diagnosis by cause with counts | .trd-state/verification-fix-loop/evidence/FS-7-8-implement-trd.txt | 1 |
| FS-8 | On those four outcomes, both `/verify-build` and `/implement-trd` name the next step: a short chat with the bridge skill, then `/verify-build --fix` | .trd-state/verification-fix-loop/evidence/FS-7-8-implement-trd.txt | 1 |
| FS-9 | The bridge skill, run as a short chat between the orchestrator and the owner, writes `.trd-state/<feature>/verification-plan.md` in a fixed shape with six parts: blockers (each small enough to be one task), slicing and order, owner rulings, criteria accepted as not verifiable, extra checks to add, and a stop rule | .trd-state/verification-fix-loop/evidence/verify-plan-recovery-SKILL.md.txt | 1 |
| FS-10 | Owner rulings made in the bridge chat are written into the PRD or TRD as well as into `verification-plan.md` | .trd-state/verification-fix-loop/evidence/verify-plan-recovery-SKILL.md.txt | 1 |
| FS-11 | The bridge skill ships to every project the way the check skills do: a freshly scaffolded project and an existing project after `--refresh` (and after a rebase) both have it in `.claude/skills/`, whatever `selected-skills.txt` says | .trd-state/verification-fix-loop/evidence/refresh-out.txt | 1 |
| FS-12 | The bridge skill is never selectable as a verification check: check selection in `/implement-trd`'s verification step, in `trd-authoring.md` and in the `/audit-trd` script never offers it, and a TRD naming it in `## Verification Artifacts` does not get it run as a check | .trd-state/verification-fix-loop/evidence/FS-12-13-14.txt | 1 |
| FS-13 | The framework-shipped skills are declared in ONE list, where each entry has a role of `check` or `support`; the three verification check skills are `check` and the bridge skill is `support` | .trd-state/verification-fix-loop/evidence/FS-13.txt | 2 |
| FS-14 | No reader of the framework skills keeps its own hand-copied set of names: the scaffold script, the three `rebase-project.md` copies, `trd-authoring.md`, the `/audit-trd` script, `/implement-trd`'s check selection, `packages/skills/README.md`, `CLAUDE.md`, and the runtime-integrity and scaffold tests each read or point to the one list | .trd-state/verification-fix-loop/evidence/FS-12-13-14.txt | 1 |
| FS-15 | Adding a framework skill is a one-line edit to the list: a new entry with role `support` ships on scaffold and refresh with no other file changed, and a new entry with role `check` also becomes selectable as a verification check | .trd-state/verification-fix-loop/evidence/FS-15.txt | 1 |
| FS-16 | `/verify-build` accepts `--fix`, with an optional plan path | .trd-state/verification-fix-loop/evidence/FS-16.txt | 2 |
| FS-17 | A `--fix` round records each open `not_met` or `unbuilt` criterion, and each blocker in the plan, as a discovery row that blocks the feature; a row recorded for a criterion carries that criterion's id | .trd-state/verification-fix-loop/evidence/FS-17-18-19.txt | 1 |
| FS-18 | Promoting discoveries to the TRD de-duplicates on criterion id: two discovery rows for the same criterion, worded differently, become one TRD row | .trd-state/verification-fix-loop/evidence/FS-17-18-19.txt | 1 |
| FS-19 | `not_verifiable` criteria and an `insufficient-coverage` outcome are never turned into build tasks by `--fix` | .trd-state/verification-fix-loop/evidence/FS-19.txt | 2 |
| FS-20 | With a plan that lists blockers, `--fix` builds the blockers before it runs its first re-verification | .trd-state/verification-fix-loop/evidence/verify-build.md.txt | 1 |
| FS-21 | `--fix` builds through `/implement-trd --reconcile` in a chained mode that prints no `COMMAND COMPLETE` banner, sends no completion notification, and runs no functional verification of its own | .trd-state/verification-fix-loop/evidence/FS-21-22-chained.txt | 1 |
| FS-22 | Invoking `/implement-trd --reconcile` directly, not chained, still ends with its own banner and still runs verification by default | .trd-state/verification-fix-loop/evidence/FS-22.txt | 2 |
| FS-23 | Each `--fix` round runs ONE fix batch covering everything that failed, then re-verifies only criteria still open; criteria already `met` are carried forward and not exercised again | .trd-state/verification-fix-loop/evidence/FS-23.txt | 2 |
| FS-24 | After each `--fix` round the check pages are republished to their stored URLs, and the owner's comments on them are read before the next round begins | .trd-state/verification-fix-loop/evidence/FS-24.txt | 2 |
| FS-25 | With a plan, `--fix` keeps repeating rounds until the plan's stop rule fires, and stops when it does | .trd-state/verification-fix-loop/evidence/FS-25-26-27-28.txt | 1 |
| FS-26 | The stop rule is written in a small, fixed vocabulary that the bridge skill documents and `--fix` reads — for example a maximum number of rounds, stopping when a round closes fewer than N gaps, stopping when only blocked criteria remain | .trd-state/verification-fix-loop/evidence/FS-25-26-27-28.txt | 1 |
| FS-27 | Without a plan, `--fix` runs exactly one fix-and-re-verify round, then reports | .trd-state/verification-fix-loop/evidence/FS-25-26-27-28.txt | 1 |
| FS-28 | A plan that omits its stop rule still produces a bounded run: `--fix` applies a default stop rule and the readout says which one it applied | .trd-state/verification-fix-loop/evidence/FS-28.txt | 2 |
| FS-29 | Without `--fix`, neither `/verify-build` nor `/implement-trd` goes beyond its one bounded verification loop: no gap is recorded as a build task, no build starts, and no fix is offered — the readout names the next step and the run ends | .trd-state/verification-fix-loop/evidence/verify-build.md.txt | 1 |
| FS-30 | A `--fix` run asks the owner no questions from start to finish | .trd-state/verification-fix-loop/evidence/FS-30.txt | 2 |
| FS-31 | When a `--fix` run stops, its report lists every criterion still not `met`, each with a reason | .trd-state/verification-fix-loop/evidence/FS-31.txt | 2 |
| FS-32 | A `--fix` run, however many rounds it takes, ends with exactly ONE `COMMAND COMPLETE` or `COMMAND STUCK` banner, as its last line | .trd-state/verification-fix-loop/evidence/verify-build.md.txt | 1 |
| FS-33 | An autonomous `--fix` run never edits `.claude/rules/verification.md`; a change it finds it needs is recorded for the next bridge chat instead | .trd-state/verification-fix-loop/evidence/FS-33.txt | 2 |
| FS-34 | NG2 in `docs/TRD/verification-convergence.md` is amended, not deleted: it still exists and now cites the owner's reversal of 2026-09-27 and its two conditions — the outer loop runs only on explicit `--fix`, and it has one stop rule | .trd-state/verification-fix-loop/evidence/FS-34.txt | 2 |
| FS-35 | `.claude/rules/process.md` and `packages/core/templates/process.md.template` say that `--verify` with `--resume` re-enters an **interrupted** verification loop, not a stalled one | .trd-state/verification-fix-loop/evidence/FS-35.txt | 2 |
| FS-36 | `packages/core/commands/verify-build.md` no longer tells the user `--resume` picks up a run that "crashed, stalled, or was interrupted"; what it says `--resume` re-enters agrees with its own `--resume` section | .trd-state/verification-fix-loop/evidence/FS-36.txt | 2 |
| FS-37 | `docs/TRD/functional-verification.md` and `docs/TRD/verification-convergence.md` place lane derivation at `/implement-trd` §8.1a, not §3.6a, and `functional-verification.md` says resume state is passed only when the resume flag was given explicitly and the prior run's outcome is unrecorded — not whenever a state file exists | .trd-state/verification-fix-loop/evidence/FS-37.txt | 2 |
| FS-38 | `packages/core/lib/fix-plan.js` no longer says `--verify` is required when chaining into `/implement-trd`; its text agrees that verification is on by default | .trd-state/verification-fix-loop/evidence/FS-38.txt | 2 |

## Not Met

_None._

## Not Verifiable

_None._

