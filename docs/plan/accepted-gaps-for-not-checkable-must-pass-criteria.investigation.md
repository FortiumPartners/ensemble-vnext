# Investigation: accepted-gaps-for-not-checkable-must-pass-criteria

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-4 of workplan `verification-targeted-loop` (`docs/plans/verification-targeted-loop/roadmap.md`
item 4; GitHub issue FortiumPartners/ensemble-vnext#113). Source of every objective: the PM's
instruction for this feature, 2026-11-12 (quoted in the `/plan` invocation). That instruction is
newer than the roadmap's item 4 brief and differs from it in substance, and the instruction wins:

- The roadmap records an "accepted gap" that custody does not re-prove and the run treats as
  satisfied. The instruction instead **proves** the criterion off-host: a CI job declared up front
  whose green result on the same commit settles the criterion `met`, with the CI run id as its
  evidence. Nothing is "accepted"; an unproven criterion stays unproven.
- The roadmap lets `/refine-verification` accept a gap with a named environment. The instruction
  forbids `/refine-verification --auto` from adding or changing an off-host proof (D16 stands);
  only an interactive refinement with the owner, or the TRD author at plan time, may declare one.
- The roadmap has custody skip accepted gaps. The instruction has custody treat a CI-proven
  criterion like any other `met` criterion: re-proved when its covered files change.

Builds on F-1 "Triage unmet results by kind" (`docs/TRD/triage-unmet-results-by-kind.md`, PR #115:
the `kind` on every unmet criterion, `not-checkable-here` re-statused `not_verifiable` and settled,
preclassification, the verification.md digest) and F-3 "One full regression pass at the end"
(`docs/TRD/one-full-regression-pass-at-the-end.md`, PR #120: the regression pass whose verdicts and
`provenAt` are the proof, `criterionCovers`, the Debug `filesChanged` history). F-2 "Targeted inner
loop by shared cause" (PR #117) is in place. Roadmap items 5 ("Block only on material failures")
and 6 ("Rank follow-ups, product items first") are to come and are NOT built here.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A success definition can declare, up front, an off-host proof for a must-pass criterion: a named CI job (workflow file and job name). The declaration is read deterministically from the definition; on a row that is not must-pass it is ignored and reported, never acted on. | PM instruction, 2026-11-12 | yes |
| O2 | When a must-pass criterion with a declared off-host proof is triaged `not-checkable-here`, the loop checks that job's conclusion for the run's commit (`gh run list` / `gh run view`). A green job settles the criterion `met`, citing the CI run id (and its URL) as evidence; a red, cancelled, still-running or absent job leaves it unproven, and the run ends `must-pass-unproven` as today. | PM instruction, 2026-11-12 (acceptance) | yes |
| O3 | The loop never accepts a gap by itself and never invents a proving environment at run time: a must-pass not-checkable criterion with no declared off-host proof still ends the run `must-pass-unproven`, and a must-pass criterion of kind `build-defect` or `evidence-gap` is never settled by an off-host proof, whatever CI says. | PM instruction, 2026-11-12 (acceptance) | yes |
| O4 | `/refine-verification --auto` may not add or change an off-host proof on a must-pass criterion (D16 stands, `refine-verification.md:92`, `refine-verification-must-pass.test.js`); only an interactive refinement with the owner, or the TRD author at plan time, may declare one. | PM instruction, 2026-11-12 (acceptance) | yes |
| O5 | Custody (`packages/core/lib/custody.js`) treats a CI-proven criterion like any other `met` criterion: it is re-proved when its covered files change and its proof is reused when they do not. | PM instruction, 2026-11-12 | |
| O6 | The verification report and `/ship-build`'s readout name each criterion proven off-host and by which CI run. | PM instruction, 2026-11-12 | |
| O7 | A headless fixture run (the `fixtures` environment in `verification.md`) with one host-only must-pass criterion and a stubbed CI result shows the criterion settled `met` with the run id cited. | PM instruction, 2026-11-12 (acceptance) | |

## Intended Change

**Today** [read]: a must-pass criterion the host cannot check (read-aloud, which needs host audio)
is ruled `not_met` with cause `environment-unreachable` or `capability-absent`; the workflow's fold
(`reconcileJudgeKinds`, `packages/core/workflows/verify-functional.js:1816`) gives it kind
`not-checkable-here` and re-statuses it `not_verifiable` (D21), or the caller preclassifies it
(`PRECLASSIFIED`, `:306`, seeded at `:2466`). The Judge's decide-next (`decideNext` step 5,
`packages/core/lib/functional-verification.js:500-517`) then relabels a clean `exit-satisfied` as
`exit-must-pass-unproven`, and the script's backstop `applyMustPassRecheck` (`verify-functional.js:1711`)
does the same. Nothing in the success definition can say where such a criterion IS proven, so the
run can only end `must-pass-unproven` and every custody reconcile at ship lists it.
`/refine-verification` routes it to Owner rulings, never to "Accepted as not verifiable"
(`refine-verification.md:92`, D16), with two ways out: declare an environment, or remove the mark.

**After**:

1. **Declaration.** The success-definition table gains an optional last column, `Off-host proof`,
   after `Must pass`. Its cell names one CI job as `<workflow file>#<job name>` (for example
   `.github/workflows/ci.yml#read-aloud`). The TRD author declares it at plan time in an optional
   `Off-host proof` column of the TRD's `## Objectives` table, on a must-pass objective; the
   definition's deriver copies that cell onto every criterion row whose `Must pass` cell names the
   objective. A definition with no such column behaves exactly as today. One deterministic reader in
   `functional-verification.js` (beside `must-pass-coverage`) returns the declarations, keyed by
   criterion id, only for must-pass rows; a cell on any other row, or a malformed cell, is returned
   as `ignored` with a reason and never acted on.
2. **The CI lookup is a lib CLI, not the workflow and not a model.** A new verb in
   `functional-verification.js` takes the declarations and the commit (HEAD) and, for each, runs
   `gh run list --workflow <file> --commit <sha> --json databaseId,status,conclusion,url,headSha`
   then `gh run view <id> --json jobs`, all through `spawnSync` with argument arrays (no shell). It
   returns one result per criterion: `green` (job conclusion `success`, with run id, URL, commit),
   `red` (any other completed conclusion), `pending` (latest run not completed), `missing` (no run
   for that commit, or no job of that name), `dirty` (the working tree has uncommitted changes to a
   path the criterion covers, per `criterionCovers`, or to any shipped path when it has no covers
   record: the commit is then not the code under test), or `error` (gh failed). Only `green`
   proves anything.
3. **Dispatch.** `/implement-trd` §8 and `/verify-build` run the reader and the CLI before
   dispatching the workflow and pass the result as a new workflow arg, `offHostProofs`
   (`[{id, workflow, job, status, runId, url, commit}]`; `[]` when none is declared). The
   workflow validates it like `preclassified`: every id must be a must-pass criterion of this run.
   A `--criteria` subset or a sweep file passes `[]`.
4. **Settling, in the script (deterministic).** When a criterion is settled `not_verifiable` with
   kind `not-checkable-here` (in the fold, in a regression round, or by preclassification), and it
   is a must-pass criterion with a `green` entry in `offHostProofs`, and no Debug pass in this
   invocation changed one of its covered files (an unknown `filesChanged` counts as changed; a
   criterion with no covers record counts as changed by any Debug change), the script settles it
   `met` instead, with `proof: {kind: 'off-host', workflow, job, runId, url, commit}`, `artifact`
   the run URL, and a reason naming the job and run. Any other result leaves it `not_verifiable`
   with a reason that names the declared job and why it did not prove it (red, pending, missing,
   dirty, error, or changed by Debug in this run). A `not_met` criterion of kind `build-defect` or
   `evidence-gap` is never touched.
5. **The exit.** When that settling turns the last unproven must-pass criterion `met` on an
   `exit-must-pass-unproven` action (which `decideNext` only produces from a clean `exit-satisfied`
   that already cleared the floor), the action becomes `exit-satisfied`, and the state and report
   are brought in step by the existing state-sync agent. `applyMustPassRecheck` sees the criterion
   `met` and does not block. No other action is upgraded.
6. **Report and readout.** `render-report` prints a `**Proven off-host**:` line naming each such
   criterion, its job and run (URL), only when one exists, so earlier reports stay byte-identical.
   `/ship-build`'s STATE names each criterion proven off-host and by which run, read from
   `verification-state.json` by one lib call.
7. **Custody.** No change to its rules: a CI-proven criterion is `met` in `verification-state.json`,
   so `affectedIds` treats it like any other met criterion (reused when its covers did not change,
   re-proved when they did). New tests pin this.
8. **`/refine-verification`.** D16 stands. The must-pass not-checkable Owner ruling names a third
   way out, "declare an off-host proof (a CI workflow and job) in the TRD's Objectives table and
   the success definition", which only the owner may choose, interactively. Under `--auto` the
   ruling is recorded as an `OWNER-CALL` as today, and the command never writes, edits or removes
   an `Off-host proof` cell.

## Decision

- **Prove, never accept.** The instruction replaces the roadmap's "accepted gap" with an off-host
  proof: green CI settles `met`; anything else leaves the criterion unproven. Rejected: an
  accepted-gap status custody skips (the roadmap's design) -- the instruction is newer and says
  custody treats a CI-proven criterion as met and re-proves it when its covers change.
- **The CI lookup runs in a lib CLI called by the command before dispatch; the workflow only
  applies the result.** The workflow script has no shell (`verify-functional.js:15-19`), and a
  model running `gh` would be a model deciding a proof. Rejected: a new agent stage in the workflow
  that runs `gh` at exit (one more model hop between CI and the verdict). The cost of checking
  before dispatch is staleness, which the script closes deterministically: a Debug pass that
  touched the criterion's covered files in this invocation voids the proof, and the regression
  pass (F-3) re-checks such a criterion anyway.
- **The commit is HEAD, and only a clean working tree for the criterion's covers counts.** CI
  proves a commit; verification runs on the working tree. Rejected: proving against the merge
  base or the PR head -- the instruction says "the same commit".
- **Upgrade only `exit-must-pass-unproven` → `exit-satisfied`.** `decideNext` produces that action
  only by relabelling a clean satisfied exit that cleared the floor, so the reverse is exact. An
  `exit-insufficient-coverage` is not upgraded: its base action is not knowable from the result.
- **Declared per objective in the TRD, copied per criterion in the definition.** The TRD author
  knows objectives at plan time, not criterion ids; the reader acts on the definition's column.

## Grounding

- `packages/core/workflows/verify-functional.js` (3,533 lines) [read]: arg validation block
  (`readArgs`, `PRECLASSIFIED` at `:306-325` is the pattern for validating `offHostProofs`);
  `imageKeys` (`:290`) is the carry-only-when-present key list a settled entry travels with (add
  `proof`); `reconcileJudgeKinds` (`:1816-1890`) is the one fold shared by the inner loop (`:3317`)
  and the regression round (`:3035`), where the not-checkable re-status happens (`:1851`);
  preclassified seeding at `:2466`; `debugChanges` (`:1796`, `[{iteration, files}]`, `files: null`
  = unknown) and `CRITERION_COVERS` (`:113`) give the Debug-touched test;
  `replaceStalledExit` (`:1907`) + `syncState` (`:2003`) are the precedent for the script changing
  an exit action and writing state/report through the state-sync agent; `applyMustPassRecheck`
  (`:1711`) and `mustPassSummary` (`:1693`) need no rule change (they read `met`) but
  `mustPassSummary` may report the off-host ids. Hazard: every result-building path
  (`buildFinalResult`, `endOnSetupFailure`, the resume and zero-criteria branches, `:2349`, `:2457`,
  `:3530`) must carry the same shape -- the file's own comments call this out repeatedly.
- `packages/core/lib/functional-verification.js` (2,888 lines) [read]: `mustPassCoverage` /
  `mustPassCoverageFromFiles` (`:739-815`) find columns by header name -- the reader for the new
  column follows the same pattern; `decideNext` must-pass step (`:500-517`) unchanged;
  `renderReport` (`:1294`) must-pass line (`:1437-1453`) is where the `**Proven off-host**:` line
  goes, under the same "only when present, earlier reports byte-identical" rule; CLI dispatch
  (`:2441-2600`).
- `packages/core/lib/custody.js` (896 lines) [read]: `affectedIds` (`:452-503`) reads
  `verification-state.json` `status === 'met'` as proven; a CI-proven criterion needs no rule
  change. Every git/gh call is `spawnSync` with arrays (`run`, `:100`) -- the CI CLI follows it.
- `packages/core/lib/custody.test.js` [read]: stubs `gh` by prepending a temp dir holding a fake
  `gh` script to `PATH` (`:792-800`, `:840-849`) -- the pattern for the CI CLI's tests and the
  headless fixture's stubbed CI result. No new env var is needed.
- `packages/core/commands/refine-verification.md` (`:83-115`) [read]: Accepted-as-not-verifiable
  and Owner rulings bullets; `refine-verification-must-pass.test.js` pins D16 by text and checks the
  `.claude/` mirror is byte-identical.
- `packages/core/commands/verify-build.md` (`:287-357`, `:517-526`) and
  `packages/core/commands/implement-trd.md` (`:1635`, `:1862-1885`, `:1943-1990`) [read]: where
  `mustPassIds`, `preclassified` and `criterionCovers` are computed and passed; a test pins the
  workflow arg list ("the list is the 29 fields", `verify-build.md:357`,
  `verify-command-surface.test.js`), which the new field changes.
- `packages/core/commands/ship-build.md` Step 6 (`:220-260`) [read]: STATE is where the off-host
  line goes.
- `packages/core/contracts/functional-verification.md` (`:93`, `:259-286`) [read]: the definition
  table's columns and the `Must pass` rules; `packages/core/contracts/trd-authoring.md` `## Objectives`
  (`:137`) [read]: where the TRD column is documented.
- `.claude/` mirrors [ran]: `.claude/workflows/verify-functional.js` and `.claude/lib/custody.js`
  are byte-identical to `packages/core/`; tests check several mirrors (`refine-verification-must-pass.test.js`
  "the mirror is byte-identical"), so every edited packaged file is copied to its `.claude/` mirror.
- `test/smoke/scenarios/verify-triage-kinds.sh`, `verify-regression-pass.sh` [read]: the pattern
  for a headless `fixtures` scenario; registered in `test/smoke/run-smoke.sh` and `test/smoke/README.md`
  (a registration test checks both).

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a CI run that is still in progress be waited for? | No: `pending` leaves the criterion unproven, as "missing" does; the instruction says red or missing leaves it unproven, and the loop has no bounded way to wait. A later `/verify-build` after CI finishes settles it. | |
| OQ-2 | Should an `exit-insufficient-coverage` run be upgraded when an off-host proof lifts it over the floor? | No: only `exit-must-pass-unproven` → `exit-satisfied` is upgraded, because that relabel is exactly reversible and the other's base action is not knowable from the result. | |
