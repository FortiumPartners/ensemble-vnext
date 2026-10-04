# Functional Verification Report: plan-sweep-chain

**Source PRD**: docs/TRD/plan-sweep-chain.md ## Intended Change
**Success definition**: .trd-state/plan-sweep-chain/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 20 total — 20 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 20 of 20 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `plan()` given a sweep list with `implement: true`, no never-unattended hits and a brake status other than `invalid` returns `chain: true`, a handoff line, `banner: null`, `notify: false`, `chainSkill: null`, and `chainSteps` holding the skill and args for each of `sweep`, `verify` and `implement` | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-2 | `plan()` given a sweep list WITHOUT `implement` still returns `chain: false` and lists the four steps (`/sweep`, `/verify-build`, commit, `/implement-trd`) in that order, exactly as before the change | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-3 | `plan()` given a sweep list with `implement: true` does NOT chain when a never-unattended path is hit or the never-unattended status is `invalid` (an unreadable list) | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-4 | `sweepChainNext` returns `fold-back` when the sweep result names criteria that are not sweep items (deferred, too big, overlapping the core, or touching a never-unattended path) and no fold-back has yet happened in the run | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-5 | `sweepChainNext` returns `verify` after a sweep with sweep ids still to verify and no verification outcome written in this run | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-6 | `sweepChainNext` returns `commit` after a `satisfied` verification when the brake on the sweep's changed files has no hits | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-7 | `sweepChainNext` returns `commit` without requiring a verification outcome when a fold-back left no sweep ids | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-8 | `sweepChainNext` returns `stop` — never `commit` or `implement` — when the verification outcome is anything other than `satisfied` (e.g. `stalled`, `stuck`, `unbuilt`, `insufficient-coverage`), and the stop carries a banner, its body and a notify status | .trd-state/plan-sweep-chain/evidence/sweepChainNext-direct-run.txt | 1 |
| FS-9 | `sweepChainNext` returns `stop` with the fixes uncommitted when the brake on the sweep's changed files reports a hit, and its body names the §5b paths that were edited | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-10 | `sweepChainNext` returns `implement` after the commit when a core TRD exists and the never-unattended check on that core TRD is clean | .trd-state/plan-sweep-chain/evidence/fix-plan-jest.txt | 1 |
| FS-11 | `sweepChainNext` returns `stop` with a banner instead of `implement` when the never-unattended check on the core TRD reports a hit or is `invalid` | .trd-state/plan-sweep-chain/evidence/sweepChainNext-direct-run.txt | 1 |
| FS-12 | `sweepChainNext` never returns `fold-back` a second time in one run | .trd-state/plan-sweep-chain/evidence/sweepChainNext-direct-run.txt | 1 |
| FS-13 | The never-unattended check the chain relies on reports a hit for a core TRD whose touched paths contain a §5b fragment, and reports `invalid` for an unreadable §5b list, so neither reads as "no brake" | .trd-state/plan-sweep-chain/evidence/check-never-unattended-run.txt | 1 |
| FS-14 | `plan.md`, on the sweep-chain path, creates or switches to `feature/<slug>/impl` before `/sweep` runs, decides each next step only by calling `sweepChainNext`, and emits no banner of its own once `/implement-trd` is reached (`/implement-trd` ends the run; `/plan` emits the banner only on an earlier stop). Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/plan-md-step7a.txt | 1 |
| FS-15 | `sweep.md` under `--chained` strips its flags before reading the list, keeps any item whose fix would touch a never-unattended path out of the fix (deferred), and ends with one RETURN line and no banner. Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/sweep-md-chained.txt | 1 |
| FS-16 | `sweep.md` under `--chained` records not-a-sweep-item and overlapping ids in `sweep-result.json` as `notSweepItems` and `overlap` instead of ending STUCK, and records no `_sweep` discovery for them. Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/sweep-md-chained.txt | 1 |
| FS-17 | `verify-build.md` under `--chained` on a sweep file asks no question (an environment needing the owner takes its stated default), still writes the report and carries the evidence over to the core, and ends with one RETURN line and no banner. Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/verify-build-md-chained.txt | 1 |
| FS-18 | `plan.md`'s fold-back runs, in this order: `render-sweep` with the remaining ids and `--core-trd docs/TRD/<slug>.md` → a task row and grounding block per folded criterion (or a light core TRD per Step 5a when none existed) → `audit-trd` once more at medium → `render-objectives` → §5a.1's checks → Step 6a's `check` → the never-unattended check on the core TRD; it never re-runs `/sweep`; and when every sweep id was folded back it skips `render-sweep`, leaving the sweep file as `/sweep` read it. Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/plan-md-step7a.txt | 1 |
| FS-19 | `plan.md`'s commit step builds its file list from status lines and content hashes taken before and after the sweep (not from the fixers' claims), adds the sweep file and `.trd-state/<slug>-sweep/`, matches that list against §5b before committing, commits with `git add -- <list>` then `git commit -- <list>`, and skips the commit (continuing the chain) when nothing in the list is staged — never attempting an empty commit. Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/FS-19-plan-md-commit-step.txt | 2 |
| FS-20 | `command-status.md`'s chaining exception names the sweep chain: `/sweep --chained` and `/verify-build --chained` emit no banner inside `/plan --implement`, and the run's one banner comes from `/implement-trd` or from `/plan` on an earlier stop. Prompt-only behaviour | .trd-state/plan-sweep-chain/evidence/command-status-chaining-exception.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

