# Investigation: one-full-regression-pass-at-the-end

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-3 of workplan `verification-targeted-loop` (`docs/plans/verification-targeted-loop/roadmap.md`
item 3; GitHub issue FortiumPartners/ensemble-vnext#113). Source of every objective: the PM's
instruction for this feature, 2026-11-12 (quoted in the `/plan` invocation). That instruction is
newer than the roadmap's item 3 brief and differs from it in one place: the roadmap re-exercises
EVERY criterion at the end; the instruction scopes the pass by changed files and says plainly it
is NOT a literal re-run of every criterion (that would cost about what today's three iterations
cost and erase the gain). The instruction wins.

Builds on F-1, "Triage unmet results by kind" (`docs/TRD/triage-unmet-results-by-kind.md`, PR #115)
and F-2, "Targeted inner loop by shared cause" (`docs/TRD/targeted-inner-loop-by-shared-cause.md`,
PR #117): the `kind` on every unmet criterion, the cause map (`causeMap`, `closedCauseMap`), the
`awaiting: "regression"` marker on members of a closed cause, and the bridge F-2 left for this
item, `confirmAwaiting` (one Exercise + one Judge over awaiting members at exit). Roadmap items
4-6 (accepted gaps for not-checkable must-pass criteria, materiality, follow-up ranking) are to
come and are NOT built here.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When the inner loop exits with no build defect left, or at its cap, the verify-functional workflow runs one regression pass that re-exercises and re-judges exactly: (a) every settled-`met` criterion whose recorded covered files changed after its `provenAt`; (b) every member of each cause the inner loop fixed (the members awaiting regression); (c) every settled-`met` criterion with no covers record. | PM instruction, 2026-11-12 | yes |
| O2 | A settled-`met` criterion whose covered files did not change after its `provenAt` is not re-exercised or re-judged by the regression pass; its verdict, artifact and `provenAt` stand. | PM instruction, 2026-11-12 (acceptance) | yes |
| O3 | A criterion met in an early iteration whose covered file a later Debug edit changes is re-checked by the regression pass and, when that edit broke it, is ruled not met (caught) rather than left `met`. | PM instruction, 2026-11-12 (acceptance) | yes |
| O4 | The regression pass is the proof: for every criterion it re-checked, the verdict, artifact and `provenAt` recorded in `verification-state.json` and the report are the regression pass's, and those are what custody (`packages/core/lib/custody.js`) reads. | PM instruction, 2026-11-12 | yes |
| O5 | Build defects the regression pass surfaces, and only those, go back to the inner loop for one Debug round, followed by at most one more scoped regression pass. There is never a third pass. | PM instruction, 2026-11-12 (acceptance) | yes |
| O6 | Evidence gaps and not-checkable results the regression pass produces are recorded with their kind and reason and are not looped on. | PM instruction, 2026-11-12 | |
| O7 | The existing full-deploy gate (`computeFinalRun`, `FULL_RUN_COMMAND`) is unchanged and runs once with the exit, alongside the regression pass. 4.17.5's re-proof retry and scoped re-proof at ship are unchanged and read the regression pass's verdicts. | PM instruction, 2026-11-12 | |
| O8 | The report shows the regression pass: which criteria it re-checked and why (covers changed, cause member, no covers), which it caught as broken, and that untouched met criteria were not re-walked. | PM instruction, 2026-11-12 (acceptance) | |
| O9 | One headless fixture run (`fixtures` environment in `verification.md`) where a fix for one cause breaks an earlier-met criterion produces a report showing the regression pass catching it while untouched met criteria are not re-walked. | PM instruction, 2026-11-12 (acceptance) | |

## Intended Change

Today (all `[read]` unless marked):

- `packages/core/workflows/verify-functional.js` holds the run's memory in a `settled` Map
  (~`:2240`). `foldRulings` (~`:2481`) ignores any Judge entry for an id already in `settled`
  ("the carried-forward entry wins"), so a criterion settled `met` in iteration 1 is never
  re-checked after a later Debug edit. (The PM's `:1825-1843` predates F-2; the code moved.)
- At exit, `confirmAwaiting` (~`:2666`, F-2's "bridge until the end-of-run pass of the roadmap's
  third item") runs ONE Exercise + ONE Judge over the members of closed causes still marked
  `awaiting: "regression"`, with no Debug after it, the decide-next `cap` set to the exit
  iteration so it cannot remediate, the exit's gate result copied, and an `exit-stuck` reason
  naming members that still fail. It never looks at settled-`met` criteria.
- Debug (`DEBUG_SCHEMA`, ~`:1337`) returns `results: [{cause, addressed, result, unbuilt,
  preCheck}]` and `refresh`. It does not report which files it changed. The workflow has no
  filesystem and no `require`: every input arrives in `args`.
- Per-criterion covered files (4.17.5) are derived from the TRD's task Touches by
  `deriveCriterionCovers` (`packages/core/lib/live-evidence.js:256`) and written to
  `<stateDir>/evidence/criterion-covers.json` by `live-evidence.js record-criteria` AFTER the
  workflow returns (`packages/core/commands/verify-build.md:369`, `implement-trd.md:2017`), for
  met criteria only. The workflow never sees them.
- `computeFinalRun` (~`:1515`) derives the gate result from `FULL_RUN_COMMAND` and the Judge's
  `finalRun`; the Judge runs the gate once on the exit iteration.
- Custody (`packages/core/lib/custody.js` `affectedIds` ~`:450`, `reconcile` ~`:720`) reads each
  criterion's `status` and `artifact` from `verification-state.json`; it never reads `provenAt`.
  So "custody anchors on the regression pass" means: the state file custody reads holds the
  regression pass's verdicts for what it re-checked.

After this change:

- Both commands pass a new 29th arg, `criterionCovers` (id -> repo-relative covered paths), derived
  before the dispatch for EVERY criterion in the definition by a new `live-evidence.js
  derive-criteria` CLI over the existing `deriveCriterionCovers`.
- Debug returns `filesChanged` (repo-relative paths it created, modified or deleted this pass).
  The workflow records `{iteration, files}` per Debug pass; a Debug pass that returned nothing, or
  no `filesChanged` array, records `files: null` (unknown).
- `confirmAwaiting` is replaced by a regression pass at exit (not on `exit-unbuilt` or
  `exit-setup-failure`, the same two exceptions as today). Its scope is O1's (a)+(b)+(c), computed
  by the script. A covered file "changed after `provenAt`" when it is in the `files` of any Debug
  pass at an iteration >= that `provenAt` (Debug at iteration k runs after iteration k's Judge);
  an unknown pass at such an iteration puts every settled-met criterion proven at or before it in
  scope. When no Debug pass in this invocation changed anything and nothing is awaiting, no pass
  runs: a run satisfied first time costs nothing extra.
- In-scope settled-met criteria are taken out of `settled` before the pass and judged as open;
  a `met` ruling settles again with the pass's `provenAt` and a `regression` round marker. A
  regressed criterion (now a build defect) gets a cause key and joins the cause map.
- Regressed build defects only go to ONE Debug round (outside the cap, causes holding a regressed
  or awaiting id only), then ONE more scoped pass whose scope is recomputed the same way against
  that Debug's `filesChanged`, plus the ids it was sent. The second pass's action is final. Each
  pass's Judge runs with `cap` = iteration so it cannot remediate.
- The report input, state file and workflow result carry `regression`: per round, the scope with
  the reason per id and the ids caught; plus the settled-met ids not re-walked. `renderReport`
  renders a "Regression pass" section.

## Decision

- **Scope by changed files, not a re-run of everything.** The PM's instruction overrides the
  roadmap's "every criterion": a full re-run costs about three iterations.
- **Changed files come from Debug's own return (`filesChanged`), with "unknown" falling to
  re-check.** The workflow cannot run git. A Debug agent under-reporting is the risk, so a missing
  return widens scope, never narrows it. Rejected: asking an extra agent to diff the tree each
  iteration (one more agent per iteration for a value Debug already knows).
- **Covers come in as an arg derived from the TRD before dispatch (`criterionCovers`), the same
  derivation custody uses.** Rejected: reading `criterion-covers.json` (written only after the
  workflow and only for met ids, so absent on a first run). Matching mirrors custody's
  `coverMatcher` (directory prefix, glob) inline, because the workflow has no `require`; a parity
  test pins the two.
- **Replace `confirmAwaiting`, keep its guarantees.** No gate re-run (the exit's result is
  copied), decide-next cannot remediate, the false "iteration cap (N)" wording is corrected, and
  an `exit-stuck` names members still failing.
- **Custody needs no code change.** It already reads status and artifact per id from the state
  file; a custody test pins that it reads the regression pass's entries.
- **A resumed met criterion is scoped against this invocation's Debug changes only.** Edits an
  earlier, interrupted invocation made after the proof are not visible here (Could Not Verify).

absorbed: none
not absorbed: `custody.test.js` flake on all-digit commit hashes (CLAUDE.md "Known open") — separate fix, this one works without it

## Grounding

- `packages/core/workflows/verify-functional.js` (and its vendored copy
  `.claude/workflows/verify-functional.js`, kept byte-identical in the same commit, as F-2 did)
  [read]: `settled` Map ~`:2240`; `foldRulings` ~`:2481`; `exercisePass` ~`:2520`;
  `confirmAwaiting` ~`:2666` (replace); loop ~`:2745`, exit branch ~`:2860`; `DEBUG_SCHEMA`
  ~`:1337` (add `filesChanged`); `buildDebugPrompt` ~`:1040`; `buildExercisePrompt` ~`:515` and
  `buildJudgePrompt` ~`:629` (both take a `confirmation` argument today — becomes the regression
  round); `syncState`/`STATE_KEYS` ~`:1853-1925`; `buildFinalResult` ~`:1541`; `readArgs`/arg
  validation ~`:55-200` (add `criterionCovers`, validated like `liveEvidence`); exercised history
  entries carry `confirmation: true` today and are validated on resume (test ~`:4169`).
  Hazard: 3,000 lines; F-2 tests at ~`:4484` ("D15: the confirmation pass") must be updated, not
  deleted — their guarantees carry over.
- `packages/core/workflows/verify-functional.test.js` [read]: harness `runWorkflow`,
  `makeAgentStub` from `./test-harness`; helpers `baseArgs`, `satisfiedJudge`, `remediateJudge`.
- `packages/core/lib/live-evidence.js` [read]: `deriveCriterionCovers` ~`:256`; CLI `main` ~`:349`
  (add `derive-criteria`, printing `{id: [paths]}` for every criterion that maps).
- `packages/core/lib/custody.js` [read]: `coverMatcher` ~`:510`, `globToRegex`; `affectedIds`;
  `reconcile --reverified` ~`:720`. Unchanged.
- `packages/core/lib/custody.test.js` [read]: add the regression-pass state case.
- `packages/core/lib/functional-verification.js` [read]: `renderReport` ~`:1500-1600` (add the
  "Regression pass" section; the `Proven at` column already reads `provenAt`).
- `packages/core/commands/verify-build.md` §4 (~`:300-330`) and `packages/core/commands/implement-trd.md`
  §8.3 (~`:1958`) [read]: the 28-field dispatch blocks; both become 29 and the field-count tests
  `packages/core/workflows/verify-functional-trd-sync.test.js:70` and
  `packages/core/commands/verify-command-surface.test.js:263-279` move to 29.
- `packages/core/contracts/functional-verification.md` [inferred]: the loop contract, gets the
  regression-pass paragraph.
- `test/smoke/scenarios/verify-inner-loop-causes.sh` [read]: the pattern for a new
  `test/smoke/scenarios/verify-regression-pass.sh` headless fixture scenario.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | The acceptance says "custody reads `provenAt` from the regression pass", but custody reads status and artifact, never `provenAt`. | No custody code change; a custody test pins that it reads the regression pass's state entries (status, artifact, `provenAt` as written). | |
| OQ-2 | How should the second pass be numbered, since `provenAt` is an iteration number? | Both passes keep the exit iteration's number (outside the cap, as F-2's confirmation did); entries and exercised history carry a `regression: 1 \| 2` round marker. | |
