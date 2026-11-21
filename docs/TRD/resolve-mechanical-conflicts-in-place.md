# TRD: resolve-mechanical-conflicts-in-place

**Source PRD**: None — small change decided in session (feature F-3 of workplan ship-graded-merge; roadmap item 3, `docs/plans/ship-graded-merge/roadmap.md`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When `merge-up.js decide` says `merge-in` and the base clashes with the PR head in more than record files, each conflicted file is graded by `conflict-classifier.js`; a mechanical-only conflict is resolved in place (model edits only conflict hunks), checked by a tested library (lint, typecheck, affected unit tests), committed, and pushed without force. | your instruction, 2026-11-21 | yes |
| O2 | A behavioural file, a forbidden file, or checks still failing after two fix attempts each end the run in a well-formed STUCK that names the files and the clash; the merge is aborted (or left for hand repair on the two-failure path) and nothing is pushed. | your instruction, 2026-11-21 | yes |
| O3 | Every resolution (resolved or stopped) is written into the ship record: files, class, checks run, re-proof scope, two-attempt count. | your instruction, 2026-11-21 | yes |
| O4 | `packages/core/contracts/ship-primitive-merge.md` (and its `.claude/contracts` mirror) and `docs/guides/ship-build.md` describe the graded behaviour. | your instruction, 2026-11-21 | |

## Intended Change

size: 7 files touched (`packages/core/lib/merge-resolve.js` new, `.claude/lib/merge-resolve.js` copy, `packages/core/lib/merge-resolve.test.js` new, `packages/core/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-merge.md`, `docs/guides/ship-build.md`, `packages/core/contracts/ship-primitives.test.js`) plus one added seam case in `packages/core/lib/ship-build.seam.test.js` (8 in all)

predecessor: Conflict classifier and stop rules (merged 2026-11-21, 6cda21f6) already provides: `classify`, `decide` (the two-attempt rule), `stuckText`, the forbidden-path rules. rebuilds: none — this change calls them and adds no grading logic.

The new library `merge-resolve.js` owns every deterministic step the merge step needs when the base clashes beyond record files; the model's only job is editing conflict hunks:

- `start --base origin/<base> --branch B --pr-head SHA --trd <path|none> --state-dir D`: same preconditions as `record-files.js merge-base-in` (branch, PR head contained, clean tree), runs a real `git merge --no-ff --no-commit`, reads each unmerged file's three stages into hunks, grades with `classify`, then `decide`. Record-file clashes are unioned exactly as `record-files.js` does. Forbidden or behavioural: aborts the merge, returns the STUCK text from `stuckText` and the resolution entry. Mechanical: leaves the merge in progress with markers in only the mechanical files, saves, straight from the merged files on disk (before the model touches them), a snapshot of each file's text outside the hunks, and returns the file list.
- `check --state-dir D`: refuses a file that still holds markers or whose text outside the hunks changed (the model edited more than the hunks); then runs lint, typecheck and the affected tests through `spawnSync` with argument arrays; calls `decide` with `checksFailed` and the failed-attempt count; returns `commit`, `fix` or `stop` plus the STUCK text.
- `commit --state-dir D`: only after a passing check; `git add` of the mechanical files, `git commit --no-edit`; returns the new head. Never pushes and never forces; the contract pushes with a plain `git push origin <branch>`.
- `abort --state-dir D`, `entry --state-dir D`: abort the merge; print the ship-record entry (`{ files: [{path, class}], checks, reproofScope, failedAttempts, outcome }`) the contract passes as `data.resolution` of the step's result.

## Decision

A new library beside the classifier, not an extension of `record-files.js` (the single definition of a record file, and out of this feature's scope) and not of the classifier (kept pure: no git). NOT prompt-driven checks: the owner required the check runner be a tested library. The record goes into the merge step's result `data.resolution`, which the sequencer already persists in `shipped.json`; no change to the sequencer. Checks come from the project, read from the pre-merge `HEAD` with `git show HEAD:<path>` so a merged `settings.json` or `package.json` hunk can never choose the command that runs: `ensemble.mergeChecks` in `.claude/settings.json` when set (`{lint, typecheck, test}` each an argument array, `{files}` expands to the affected files), else detected (`package.json` `lint` script, `tsc --noEmit` when a `tsconfig.json` exists, `jest --findRelatedTests` when jest is configured); a check with nothing to run is `skipped` with its reason and never counts as a failure, because CI on the merged head is the proof. The re-proof scope recorded is the resolved files plus the custody gate's own narrowed ids (read after the gate); a stop records `none: stopped before the custody gate`. The library keeps its own few lines of record-file union (`git merge-file --union`, JSON validity check) rather than editing `record-files.js`, which is out of scope; a mixed record-plus-mechanical test pins it. The contract runs the graded flow only when `merge-base-in` returns `outcome: "stopped"` with a non-empty `notRecord`; `outcome: "refused"` (including its dirty-tree refusal, which also lists `notRecord`) still returns `stop`. Rejected alternative: resolving in a throwaway worktree: the clean-tree preflight and `--match-head-commit` custody rules already assume the lead's working tree.

## Non-Goals

Forge's `ship_queue` `merge` scope and delegate resolver; changing `record-files.js`; resolving behavioural clashes; the mergeability check before wait-ci (feature 2, built); the narrowed re-proof (feature 4); the live proof (item 5); the CHANGELOG entry (item 6).

## Verification Artifacts

None apply — plugin prose and libraries; unit and fixture-repo tests prove the behaviour, the live proof is a later item.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `packages/core/lib/merge-resolve.js` (`start`, `check`, `commit`, `abort`, `entry`; one JSON line each, exit 0) and its byte-identical `.claude/lib` copy. | O1, O2, O3 | None | Each command returns the documented JSON; `start` on a behavioural or forbidden clash leaves HEAD and tree as before; `check` rejects an edit outside the hunks; the third failed check returns `stop` (classifier rule); `start` on a behavioural clash returns the STUCK text naming the files; the file contains no `push` or `--force`; checks are read from the pre-merge `HEAD`. |
| FIX-002 | Write `packages/core/lib/merge-resolve.test.js`: fixture git repo with a bare origin; cases: mechanical resolved, checked, committed and pushed as a fast-forward of origin (no force); behavioural STUCK names files and clash; forbidden (`.claude/rules/x.md`) STUCK; mechanical with failing checks stops after two fix attempts; mixed record + mechanical; marker left in file refused; edit outside hunks refused; each case's `entry` output. | O1, O2, O3 | FIX-001 | `npx jest packages/core/lib/merge-resolve.test.js` passes; deleting the two-attempt handling makes the two-failure case fail; also asserts `.claude/lib/merge-resolve.js` is byte-identical to the source; a merged `.claude/settings.json` hunk cannot change the command that runs. |
| FIX-003 | Update the merge contract (step 1's `merge-in` branch: `record-files.js merge-base-in` first, on `notRecord` the graded flow; STUCK format; `data.resolution` on every result) in `packages/core/contracts/ship-primitive-merge.md` and its `.claude/contracts` mirror; add surface assertions to `ship-primitives.test.js`. | O1, O2, O3, O4 | FIX-001 | `npx jest packages/core/contracts/ship-primitives.test.js` passes including mirror identity; the surface test fails on the old contract text; the existing order test (gate file named only after `return red`) still passes; the graded flow is gated on `outcome: "stopped"`, not on `notRecord` alone. |
| FIX-004 | Update `docs/guides/ship-build.md` (graded merge: what resolves, what stops, limits, the record entry table) and add a seam case to `ship-build.seam.test.js` that plays the graded flow and records `data.resolution` through `ship-sequencer.js record`. | O3, O4 | FIX-001, FIX-003 | `npx jest packages/core/lib/ship-build.seam.test.js packages/core/lib/merge-up.test.js` passes; the seam case builds the entry with `merge-resolve.js entry` (not by hand) and reads it back from `shipped.json`; a guide test greps for the graded-merge heading, the STUCK cases and the record fields. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/merge-resolve.js`, `.claude/lib/merge-resolve.js`
- **Reuse:** `classify`, `decide`, `stuckText` from `./conflict-classifier` [read]; `isRecordFile` from `./record-files` [read]; the `git()` spawnSync helper pattern, the `--no-commit` merge, `git merge-file --union` and the one-JSON-line CLI shape of `record-files.js` [read]
- **Replaces:** nothing; `record-files.js merge-base-in` stays the first call and keeps handling record-only clashes [read]
- **Follow:** `spawnSync` with argument arrays, never a shell (CLAUDE.md Security); `.claude/lib` copy byte-identical, as `conflict-classifier.test.js:606` checks for its sibling [read]
- **Careful:** hunks come from the three index stages via `git merge-file -p --diff3`, not from parsing a marked file the model may have edited; an aborted merge must leave HEAD and tree as they were; never `git push --force`; check commands come from settings or detection, never from model text.

### FIX-002
- **Touches:** `packages/core/lib/merge-resolve.test.js`
- **Reuse:** the bare-origin fixture and `cleanEnv` pattern of `ship-build.seam.test.js` [read]; the classifier's hunk shapes [read]
- **Replaces:** nothing
- **Follow:** Jest, `afterAll` removes temp dirs, `GIT_DIR` variables cleared
- **Careful:** tests must not depend on the host's lint or tsc; use `ensemble.mergeChecks` with `node -e` commands in the fixture.

### FIX-003
- **Touches:** `packages/core/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the existing step 1 prose and "One rule for every stop" [read]
- **Replaces:** the sentence that returns `stop` on any `notRecord` clash [read]
- **Follow:** the contract's front matter (results, stops-on) is unchanged; no `AskUserQuestion` and no `forge` word (a test forbids both) [read]
- **Careful:** `ship-primitives.test.js` greps exact phrases such as `ok: false` ... `notRecord`; update those assertions with the text.

### FIX-004
- **Touches:** `docs/guides/ship-build.md`, `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** the guide's "Re-proof record" table style; the seam test's `setup`, `landOnBase` and `playMerge` helpers [read]
- **Replaces:** the guide's statement that a clash `merge-base-in` cannot resolve stops [read]
- **Follow:** write for an engineer who was not in the session
- **Careful:** do not touch the CHANGELOG (item 6).

## Could Not Verify

- **No PRD (audit-build, 2026-11-21).** This TRD has no source PRD (it was decided in session), so the delivered code was checked against this TRD's objectives and tasks only. Whether those objectives capture everything the owner wanted, and whether anything was left out, was not checked.
- **A live model following the contract prose (not checked: out of scope).** Unit, contract and fixture-repo tests prove the library and the contract text; whether a model running `/ship-build` follows the graded-merge steps on a real conflict is not provable here. The live proof (item 5) covers it.
