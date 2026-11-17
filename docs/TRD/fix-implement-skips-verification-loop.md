# TRD: fix-implement-skips-verification-loop

**Source PRD**: None — defect reported by Forge's PM, brief at `docs/plans/fix-implement-skips-verification-loop/brief.md` in commit 884f451f (not in this branch's tree; read it with `git show 884f451f:docs/plans/fix-implement-skips-verification-loop/brief.md`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | The functional-verification loop runs whenever `verification.md` allows it; a scripted check plus unit tests is never accepted in its place, by `/implement-trd` or by `/plan --implement` | brief, Expected 1 | |
| O2 | A loop that does not run says why in the final readout and leaves `.trd-state/<slug>/verification-state.json` holding `outcome: "not-run"` and a `reason` string, the same reason the report shows | brief, Expected 2 | yes |
| O3 | A derive-agent source is passed by file path, never pasted, so no source is too large to dispatch, and a derive pass that never ran is retried once rather than silently skipped | brief, Expected 3 and cause A | |
| O4 | An environment problem reported by the setup check or by the loop's Exercise stage is re-checked once — the check run again and the diagnosis re-derived from the actual response — before the loop gives up on it | brief, Expected 4 | |

**Must pass** marks the objectives without which the feature does not exist. O2 is marked: it
is the one machine-readable fact a later `/verify-build` or Forge's PM reads to tell a skipped
loop from one never reached.

## Reproduction

### Steps

Line numbers in this section and in Task Grounding are as of `e9df0bcf`, the base commit
before FIX-001 to FIX-005; the fix has since moved them (for example `runSetupCheck` is now at
`verify-functional.js` line 2556, and §8.1's not-run exits now call `record-not-run`).

1. Read `packages/core/commands/implement-trd.md` §8.1 (lines 1793-1838) [read]: the two
   `not run` exits (`prd_resolved: false`, and a resolved source with no
   `success-definition.md`) render `verification-report.md` through `render-report` and record
   `not-run-no-source` / `not-run-no-definition` for Step 9 only. The blocking-policy exit at
   §8.1a step 6 (line 2109) does the same.
2. Search the library and workflow for any writer of `verification-state.json` with a `not-run`
   outcome [ran: `grep -n "not-run" packages/core/lib/functional-verification.js` — only the
   label map and the report's outcome enum]. The only state writers are inside
   `verify-functional.js` (`STEP 4` of the Judge, the Record agent, the state-sync agent), all
   reached only after the `Workflow` call that these exits skip.
3. Read §3.6 step 2-3 (lines 890-926) [read]: the derive agent is `run_in_background: true`,
   its prompt is `<contract text> + <the source> + ...`, nothing records that the dispatch
   happened, and Step 8 treats an absent definition as final.
4. Read `verify-functional.js` `runSetupCheck` (lines 2543-2597) [read]: a first setup verdict
   of `setup-failure` returns its problems at once; only a `refresh` verdict gets a second look.
   The Exercise prompt (lines 654-776) gives no instruction to retry a failing request before
   reporting the environment as the blocker.
5. Search `plan.md` and `implement-trd.md` for a rule against substituting another check for the
   loop [ran: no match for "substitute", "scripted", "instead of the loop"].

### Actual

- After a not-run exit, `.trd-state/<slug>/verification-state.json` does not exist (or holds an
  earlier run's verdicts), so a reader cannot tell "loop skipped, here is why" from "loop never
  reached". Measured by the reporter on dart's plan 2138ce70: 6 of 13 separate `/verify-build`
  runs, 6.2 h of 9.3 h, were spent re-verifying runs whose loop had been skipped.
- A derive agent that was never dispatched (cause A) and one that died read the same at Step 8:
  `not run: no definition produced`, with no second attempt.
- A source of about 740 KB (cause C) could not be dispatched at all.
- One wrong environment diagnosis (cause D: a 401 and schema lag) ended the loop.
- Nothing forbids a session from running a scripted Playwright check plus unit tests in the
  loop's place (cause B).

### Expected

1. The functional-verification loop runs whenever `verification.md` allows it. A scripted
   check (a Playwright script, curl) plus unit tests is never accepted in its place, by
   `/implement-trd` or by `/plan --implement`, and a run that did not run the loop cannot close
   the feature as verified.
2. A loop that does not run says why in the final readout and leaves
   `.trd-state/<slug>/verification-state.json` holding `outcome: "not-run"` and a `reason`
   string; `verification-report.md` names the same reason. An interrupted run's state file
   (`outcome: null`) is never overwritten by such a record.
3. The derive agent's source is passed by file path, never pasted into its prompt, so a source
   of any size (740 KB included) can be dispatched; and a derive pass that never ran, or ran
   and wrote nothing, is retried once before verification is recorded as not run.
4. An environment problem reported by the setup check, or by the Exercise stage, is re-checked
   once — the check run again and the diagnosis re-derived from the actual response — before
   the loop gives up on it.

Root cause [read]: the not-run exits are rendered as report text only, by prose, never as state;
the derive dispatch is fire-and-forget with no record and no size rule; the setup check treats
its first `setup-failure` verdict as final; and no rule states the loop is not substitutable.

## Decision

- **One library call records a not-run, for state and report together.** A new
  `record-not-run` subcommand in `functional-verification.js` (function `recordNotRun`), taking
  `--state-dir`, `--feature`, `--reason`, `--prd` (the report header's source line) and
  `--definition`, writes `verification-state.json` through `implement-state.save()` with
  `{ iteration: 0, criteria: [], gapsClosed: [], outcome: "not-run", reason, causes: [], exercised: [] }`
  (the setup-failure state's shape plus `reason`) and renders `verification-report.md` from the
  same `reason`, so the two can never disagree. `implement-trd.md`'s three report-writing
  not-run exits (no source, no definition, blocking policy does not parse) call it instead of
  hand-composing a `render-report` input. NOT: keep `render-report` in prose and add a second
  prose `save()` — two hand-written writes is how report and state drift.
- **An interrupted run is never overwritten.** When the state file on disk has `outcome: null`
  (reachable: the blocking-policy exit runs on the `--resume --verify` path before
  `verification-runs.js start`), `recordNotRun` writes the report but leaves the state file as
  it is and says so (`stateKept: true`), so the interrupted run stays resumable and is not later
  closed as abandoned and counted against the run limit. A FINISHED earlier state is
  overwritten: the latest run did not verify, and every reader of the file (custody's proven
  set, waived-defect facts, the re-run scope) then fails toward re-proving, which is the
  conservative direction.
- **Not written for `--no-verify`, `--chained`, or the run-limit exit.** `--no-verify` is the
  owner's own opt-out, `--chained` never reaches Step 8, and the run-limit exit deliberately
  keeps the earlier run's report and state for the ruling request — the same exclusions the
  run-limit exit already makes.
- **Closing reads the outcome from disk, not memory** (absorbed as a correction to how O1 is
  enforced: a prose rule alone leaves the close gate trusting the session's remembered outcome,
  so a session that ran a scripted check instead could still close with `--verified`). A new
  `read-outcome --state-dir <dir>` prints `{ present, outcome, reason, startedAt, fresh }`, where
  `fresh` is true only when the state file was written at or after the latest verification run's
  `started_at` in `implement.json`. Step 9's `--verified` close requires
  `outcome: "satisfied"` AND `fresh: true`; anything else closes nothing. Step 9's readout takes
  the not-run reason from the same call.
- **The source goes to the derive agent by file path, always** — OWNER-CALL, default taken
  2026-11-17: the threshold is 0 bytes. A size threshold on the source alone would not bound the
  prompt (it already carries the 50,616-byte contract), and one mode is simpler and testable
  without a size-mode helper. The command writes the extracted section source to
  `.trd-state/<feature>/derive-source.md` (preserving D5's isolation: the file holds the
  section, never the TRD) and passes that path; a PRD source is passed by its own path, never
  pasted. Applied in both places the derive agent is dispatched: `/implement-trd` §3.6 and
  `/verify-build` 3a (absorbed: `/verify-build` is the command Forge's PM re-runs, and O3 would
  not hold while it still pastes). The dispatch is never skipped because a source is large.
- **The derive dispatch is recorded and retried once.** §3.6 sets
  `functional_verification.derive_dispatched: true` after the `Agent` call. At §8.1, an absent
  definition is re-derived ONCE in the foreground, mirroring `/verify-build` 3a exactly:
  re-resolve the source in §3.6 step 1's order (cause A means §3.6 may never have run, so
  `prd_path` and `derive-source.md` may not exist), bind `prd_path`, dispatch the same agent with
  the same contract and wait. Only if the file is still absent is `not-run` recorded, with a
  reason saying whether the derive was never dispatched or ran and wrote nothing. NOT: the lead
  deriving the definition inline — the uncontracted production path §8.1 already forbids.
- **The single re-check rule** — OWNER-CALL, default taken 2026-11-17. (a) Exercise (the part
  aimed at cause D, and at cause E): before reporting the environment as the blocker for a
  criterion (an HTTP 4xx/5xx, a schema or migration mismatch, a crashed simulator or browser, a
  refused connection), the exerciser repeats the failing step once and states its reason from
  that second, actual response, quoting it; if the repeat works, it captures as usual. (b) Setup
  check: a first verdict of `setup-failure` dispatches one `setup-recheck` agent that gathers
  every fact again from scratch (no refresh) and records the actual response for each reported
  problem; its verdict replaces the first (`proceed` goes on to Exercise, `refresh` takes the
  existing refresh path, `setup-failure` ends the run with the re-check's problems). A dead
  re-check keeps the first problems; a re-check that ran a refresh is rejected as `setup` is.
  The post-refresh check is not re-checked: it already re-gathers against the refreshed build.
  Kept although the setup verdict is computed by `decideSetup` from facts, because those facts
  are gathered by a model agent and the brief names the setup check explicitly; it costs one
  Sonnet dispatch on a run that is otherwise about to end. Cause E gets the re-check and the
  readout line only, not simulator recovery.
- **The loop is not substitutable.** `implement-trd.md` Step 8 and `plan.md` Step 7 state that a
  scripted check, a Playwright script or unit tests never stand in for the loop; the only ways
  Step 8 ends without the `Workflow` call are the listed exits, each recorded through
  `record-not-run` (or the run-limit ruling request). The close gate above enforces it.
- absorbed: the close gate reading the outcome from disk — without it O1's rule is unenforced  [BLOCKS]
- absorbed: `/verify-build` 3a passing the source by path — O3 does not hold while the re-run command still pastes  [BLOCKS]
- not absorbed: the run-limit exit writing no state — separate behaviour, deliberately kept.

## Non-Goals

- No simulator, browser or device recovery (cause E beyond the re-check).
- No change to `/verify-build`'s not-run handling beyond the derive source path, and none to Forge.
- No change to `decideSetup`, `decideNext` or the Judge's cause set.
- No change to `fix-plan.js` (its chain arguments are correct; a test pins them).

## Verification Artifacts

None apply — no screen, design handoff, data view or screen-to-screen journey is in scope; the
work is command prose, a library and a workflow script.

## Verification Environment

**Environment**: local (fixtures for the live `/plan --implement` check)
**Refresh**: none declared for local; fixtures: `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>`
**Cannot be checked there**: `claude --remote` sessions and GitHub-runner-only failures (verification.md §5)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | What size counts as too large to inline? | Every size: the source always goes by file path (threshold 0), recorded as an OWNER-CALL | owner-only |
| OQ-2 | Does cause E need simulator recovery? | No: the re-check and the readout only | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `recordNotRun` / `record-not-run` and `readOutcome` / `read-outcome` to `functional-verification.js`, with Jest tests | O1, O2 | None | `record-not-run --state-dir <tmp> --feature f --reason "no definition produced" --prd "docs/TRD/f.md ## Intended Change" --definition <tmp>/success-definition.md` writes `<tmp>/verification-state.json` with `outcome: "not-run"` and that `reason`, and `<tmp>/verification-report.md` whose `**Reason**:` line is the same string and whose `**Source PRD**:` line is the `--prd` value; a missing `--reason` exits 1 and writes nothing; over a state file with `outcome: null` it writes the report and leaves the state byte-identical, printing `stateKept: true`; `read-outcome` reports `fresh: false` for a state file older than the latest run's `started_at` and `fresh: true` for one written after; the tests fail on today's code (no such subcommands) |
| FIX-002 | `implement-trd.md` (both copies): §3.6 always passes the source by path and records `derive_dispatched`; §8.1 re-derives once in the foreground (mirroring `/verify-build` 3a) and both not-run exits call `record-not-run`; §8.1a blocking-policy exit calls it; Step 8 states the loop is not substitutable; Step 9's `--verified` close requires `read-outcome` to return `satisfied` and fresh; Step 9 ISSUES names the not-run reason | O1, O2, O3 | FIX-001 | §3.6 names `.trd-state/<feature>/derive-source.md` and says the source is never pasted; §8.1's two exits and the blocking-policy exit each name `record-not-run`; no `fs.writeFileSync` report-input recipe remains in §8.1; Step 9's close condition names `read-outcome` and `fresh`; the two copies are byte-identical |
| FIX-003 | `plan.md` (both copies) Step 7: the chained `/implement-trd` runs its own loop and nothing substitutes for it; `verify-build.md` (both copies) 3a passes the source by path | O1, O3 | None | Step 7 carries the rule in words a prose test can match; `verify-build.md` 3a names `derive-source.md` and no longer shows `<the source>` pasted after the contract; each pair of copies is byte-identical |
| FIX-004 | `verify-functional.js` (both copies): one `setup-recheck` after a first `setup-failure`; Exercise prompt repeat-once rule; update and add workflow tests | O4 | None | a plan whose `setup` returns `setup-failure` and whose `setup-recheck` returns `proceed` reaches Exercise; one whose re-check also fails ends `setup-failure` with the re-check's problems and labels `['setup', 'setup-recheck', 'record']`; a dead re-check keeps the first problems; a re-check reporting `refreshesRun > 0` is rejected; the Exercise prompt carries the repeat-once rule; existing setup tests pass with updated label lists |
| FIX-005 | Prose test over `implement-trd.md`, `plan.md` and `verify-build.md` for FIX-002/FIX-003 | O1, O2, O3 | FIX-002, FIX-003 | `packages/core/commands/verification-not-run-prose.test.js` fails against the commit before FIX-002/FIX-003 and passes after |
| AMEND-001 | [test-gap] The final readout's 'Verification did not run: {reason}' line (half of the must-pass objective O2) has no test asserting it — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/commands/implement-trd.md:2637; grep finds the phrase in no test file; verification-not-run-prose.test.js has no readout assertion) | O2 | None | `verification-not-run-prose.test.js` asserts the readout's 'Verification did not run: {reason}' item, scoped to that item, including its `read-outcome` source and its fallback to the report's `**Reason**:` line |
| AMEND-002 | [test-gap] The prose test would still pass if the blocking-policy not-run exit (§8.1a step 6) stopped calling record-not-run — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: implement-trd.md:2142; verification-not-run-prose.test.js:31-33: the regex also matches line 1793, and the count of at least 2 is met by lines 1830 and 1863 alone) | O2 | None | each not-run exit's assertion in `verification-not-run-prose.test.js` reads only that exit's own text, so removing `record-not-run` from the blocking-policy exit (§8.1a step 6) fails the test |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `.claude/lib/functional-verification.js`
- **Reuse:** `renderReport` (line 1837) for the report; `implement-state.save()` (`packages/core/lib/implement-state.js:135`) for the state — it creates the folder; the CLI's existing flag parsing and `usage()`; `functional_verification.runs[].started_at` as written by `verification-runs.js` `start` (line 215) [read]
- **Replaces:** the hand-composed `render-report` input recipe in `implement-trd.md` §8.1 (lines 1805-1815) [read]
- **Follow:** the module's CLI pattern — `usage()` and exit 1 on misuse; require `implement-state` relative to `__dirname` so the `.claude/lib` copy finds its own sibling; keep `.claude/lib/functional-verification.js` byte-identical to the `packages/core` copy
- **Careful:** `verification-runs.js` `stateInterrupted` reads `outcome === null`, so never write null and never overwrite a null-outcome file; free-text values pass as argv values, never through a shell-interpolated JSON string; an unreadable `implement.json` makes `fresh` false, never true

### FIX-002
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`
- **Reuse:** `/verify-build` 3a's foreground derive (`packages/core/commands/verify-build.md:275-325`) as the pattern for §8.1's re-derive; the existing `Agent(subagent_type="product-manager", ...)` shape (line 894); §3.6's in-memory-then-`save()` rule for `derive_dispatched` [read]
- **Replaces:** §8.1's two `node -e ... writeFileSync` + `render-report` blocks, §8.1a step 6's "rendered through render-report exactly as §8.1's two not run exits are", and Step 9's "Step 8 ran and its outcome is `satisfied`" condition read from memory (line 2453) [read]
- **Follow:** the "Set it on the in-memory state object first, then persist" rule of §3.6 for any `functional_verification` key; both copies byte-identical (commit cf09d8fc's convention)
- **Careful:** keep D5's isolation — the derive prompt carries no TRD path and no task list, the source file holds the extracted section only; `--no-verify` and the run-limit exit write no not-run state; `verify-command-surface.test.js`, `verify-functional-trd-sync.test.js` and `implement-trd-run-limit-prose.test.js` read this file

### FIX-003
- **Touches:** `packages/core/commands/plan.md`, `.claude/commands/plan.md`, `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`
- **Reuse:** Step 7's existing paragraph after the `plan()` field table; `verify-build.md` 3a's dispatch block (line 283) [read]
- **Follow:** each pair byte-identical; one short paragraph in `plan.md`, no new step
- **Careful:** `fix-plan.test.js` pins `chainArgs`; do not touch `fix-plan.js`; `verify-build-criteria.test.js` and `verify-command-surface.test.js` read `verify-build.md`

### FIX-004
- **Touches:** `packages/core/workflows/verify-functional.js`, `.claude/workflows/verify-functional.js`, `packages/core/workflows/verify-functional.test.js`
- **Reuse:** `buildSetupPrompt` (line 1318) with a third stage `setup-recheck`; `SETUP_SCHEMA`; the `rejected`/`problemsOf` helpers in `runSetupCheck` (line 2543); `buildExercisePrompt` (line 654) [read]
- **Follow:** the refresh-once rule lives in the script, not a prompt; stage-specific payload file names (`setup-decide-<n>-recheck.json`); test plans keyed by label via `makeAgentStub` [read]
- **Careful:** existing tests assert exact label lists (`['setup', 'record']`, line 3311, and the cases around 3346-3361) — they gain `setup-recheck`; a map plan with no `setup-recheck` key resolves to null, which must keep the first problems

### FIX-005
- **Touches:** `packages/core/commands/verification-not-run-prose.test.js`
- **Reuse:** the shape of `packages/core/commands/implement-trd-run-limit-prose.test.js` [read]
- **Follow:** read `packages/core/commands/*.md` and assert byte-identity with the `.claude/commands` copy
- **Careful:** assert on behaviour-bearing phrases (subcommand names, the derive-source path, the close condition), not on whole sentences

### AMEND-001

- **Touches:** `packages/core/commands/verification-not-run-prose.test.js`

### AMEND-002

- **Touches:** `packages/core/commands/verification-not-run-prose.test.js`

## Could Not Verify

Updated by `/audit-build` on 2026-11-17. Five of five verifiers reported; four objectives and
five tasks were checked against the delivered code and tests.

- No PRD was supplied (the source is a defect brief), so the delivered code was checked against
  this TRD only. Whether the TRD itself captures everything the brief asked for was not checked
  by this audit.
- Not checked by this audit (it reads code and tests, not the reporter's runs): cause D most
  likely arose in the Exercise and Judge stages, not the setup check, because `decideSetup`
  counts a 401 as reachable and gathers no schema facts. The Exercise repeat-once rule is the
  part aimed at it; the setup re-check guards against a misgathered fact only.
- Not checked by this audit (outside this repository): the run records for dart's runs 23068,
  22854 and 24405 (in `/Users/james/dev/lightning-lane`) were not read; causes A-E are as
  Forge's PM reported them.
- Not checkable from prose, and not exercised by any test: whether a derive agent dispatched in
  the background can still be running at Step 8. If it writes late it can overwrite the
  foreground re-derive's definition; that is the same contract and agent, so the risk is a
  duplicate, not a wrong definition.
