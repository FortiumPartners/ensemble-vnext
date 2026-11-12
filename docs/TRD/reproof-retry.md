# TRD: reproof-retry

**Source PRD**: None — small change decided in session (workplan ship-cost-reduction, feature F-3; roadmap item 3, `docs/plans/ship-cost-reduction/roadmap.md`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When a re-proof (`/verify-build --criteria <ids> --no-fix --chained`) finishes its one iteration with any named criterion not `met`, it re-runs only those criteria exactly once more, with no code edit and no Debug stage, and the second result is the one taken | your instruction, 2026-11-11 (roadmap item 3) | yes |
| O2 | A criterion met on the retry is recorded as `met` with `retried: true` in `.trd-state/<feature>/reverify/verification-state.json` — the file the custody gate reads — so the ship proceeds and the flake stays visible; a criterion still not met after the retry ends the ship as today (custody refuses, the run stops) | your instruction, 2026-11-11 | yes |
| O3 | The subset keeps its paths under `.trd-state/<feature>/reverify/` and ends on the existing `[STATUS: /verify-build] RETURN → <outcome>, <met> of <total> met` line, counted over the whole named subset after the retry | your instruction, 2026-11-11 | |
| O4 | The retry set and the merge of the two runs are computed by a library function with unit tests, not by the model | your instruction, 2026-11-11 (acceptance: "a unit test of whatever library computes the retry set") | |

## Intended Change

Today (`packages/core/commands/verify-build.md`, section "`--criteria <ids>`" [read]): a re-proof
dispatches the `verify-functional` workflow once with `cap: 1`, so any criterion not met — a
flaky one included — leaves `reverify/verification-state.json` with a non-`met` status, the
custody gate's second `custody.js reconcile --reverified …` returns `refused`
(`custody.js:486-489` [read]: anything `!== 'met'` refuses), and the ship ends STUCK. Measured
in Storybook: 10 of 28 re-proof runs (roadmap item 3).

After this change, under `--criteria` only:

1. After the first dispatch, `node .claude/lib/functional-verification.js reproof-retry-set
   .trd-state/<feature>/reverify/verification-state.json` prints `{"retry": [<ids not met>]}`.
   An empty list (all met, or no state written) means no retry: the run reports as today.
2. A non-empty list: the workflow is dispatched **once more**, into its own folder
   `.trd-state/<feature>/reverify/retry/` (`statePath`, `reportPath`, `evidenceDir` and
   `pagesDir` all under it, so the second run shares no state, report, evidence or iteration-1
   scratch file with the first), with the same 26 fields except: `criteria` = the retry set,
   `mustPassIds` restricted to it, `resume: null`, and `since` recomputed as
   max(HEAD commit time, the retry's own start) so evidence left by the first run cannot pass
   as fresh. `cap` stays `1` and `--no-fix` still holds: no Debug, no code edit, no build.
3. `node .claude/lib/functional-verification.js merge-reproof-retry --first
   .trd-state/<feature>/reverify/verification-state.json --second
   .trd-state/<feature>/reverify/retry/verification-state.json` writes the merged state back to
   the first path, through `implement-state.js`'s `save()` (the repository's only sanctioned
   writer of a `.trd-state` JSON file): every first-run criterion in first-run order, each
   retried one replaced by its second-run entry and marked `retried: true`; outcome `satisfied`
   when every criterion is `met`, otherwise the retry's outcome (the first run's when the retry
   wrote no state). The file keeps the workflow's four keys (`iteration`, `criteria`,
   `gapsClosed`, `outcome`) and adds `retried` (the list of retried ids). It prints
   `{outcome, met, total, retried}`.
4. The RETURN line uses those merged counts. `reverify/verification-report.md` stays the first
   run's report and `reverify/retry/verification-report.md` is the retry's; the merged state
   file, not either report, is the record. The custody gate reads the same path as today and is
   unchanged in behaviour; its contract gains one sentence saying the file holds the merged
   result after the one retry and that `retried` marks a criterion re-judged on the second try.

A criterion that is `met` only on the retry is a pass for custody (it reads status only) and is
visible as a flake through `retried: true`. Recording retry results in `shipped.json` is roadmap
item 6, to come; it is not built here.

## Decision

One re-run of only the not-met criteria, no Debug pass (owner's call, default taken unattended,
2026-11-11). A Debug pass inside a ship would edit code outside the recorded path, which would
then need its own review and re-proof. The retry runs in its own folder, `reverify/retry/`, rather than moving the first run's files aside (simpler, and the two runs share no scratch file or evidence; adversarial review). It lives in the command prose plus two pure
library functions, NOT in the `verify-functional` workflow: the workflow's argument list stays
the 26 fields `implement-trd.md` §8.3 defines (pinned by `verify-build-criteria.test.js`), and a
`cap: 2` would reach the workflow's in-place Debug stage, which is exactly what the decision
rules out. "Not met" means any status other than `met` (`not_met`, `not_verifiable`, `unbuilt`),
matching what custody refuses. `retried: true` is set on every retried criterion, met or not;
the status says how the retry went.

## Non-Goals

- No Debug stage, no code edit, no build inside a re-proof; no second retry.
- No change to `custody.js`, to the `verify-functional` workflow, or to the 26-field argument list.
- No change to the full (non-`--criteria`) `/verify-build` run or to `/implement-trd`.
- No `reproof` block in `shipped.json` (roadmap item 6, to come).
- Nothing under the plan's out-of-scope fence (run records off the branch, Storybook-only work, Forge's side, ship-setup CI guidance).

## Verification Artifacts

None apply — the change is a library function and command prose; there is no UI, rendered data, design or screen-to-screen flow for a check skill to exercise.

## Verification Environment
**Environment**: local
**Refresh**: none declared — tests and libraries read the working tree
**Cannot be checked there**: a live re-proof with a deliberately flaky criterion inside a real ship (deferred; needs a fixture slot)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Does a `not_verifiable` or `unbuilt` criterion get the retry, or only `not_met`? | All non-`met` statuses are retried: custody refuses all of them alike, and a preview environment still coming up reads `not_verifiable` exactly like a flake | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `reproofRetrySet(state)` and `mergeReproofRetry(first, second)` to `functional-verification.js`, with CLI subcommands `reproof-retry-set <statePath>` and `merge-reproof-retry --first <p> --second <p>` (writes the merged state back to `--first` via `implement-state.save`); unit tests; copy to the `.claude/lib/` mirror | O1, O2, O4 | None | `npx jest packages/core/lib/functional-verification.test.js` passes with cases: retry set is the ids whose status is not `met` (including `not_verifiable`, `unbuilt`), empty when all met or state unreadable; merge replaces only retried entries, sets `retried: true` on each, leaves unretried entries without the flag, outcome `satisfied` only when all are met, otherwise the retry's outcome; a missing second state keeps the first statuses and outcome; CLI writes the merged file to the `--first` path (four workflow keys plus `retried`) and prints `{outcome, met, total, retried}`. Each case fails against code that returns the first state unchanged |
| FIX-002 | Specify the retry in `verify-build.md`'s "`--criteria <ids>`" section and step 4's `--criteria` override paragraph; add one sentence to `ship-custody-gate.md` step 3; copy both to their `.claude/` mirrors; pin with tests | O1, O2, O3 | FIX-001 | `npx jest packages/core/commands/verify-build-criteria.test.js packages/core/contracts` passes with new cases asserting the criteria-subset section specifies exactly one retry of only the not-met criteria (via `reproof-retry-set`), no Debug and no code edit, the retry's own folder `reverify/retry/` and a recomputed `since`, the merge via `merge-reproof-retry` with the `retried` flag, paths under `reverify/`, and the unchanged RETURN line; the custody gate names the merged file and `retried`; all existing cases (26 fields, `cap: 1`, mirrors byte-identical) still pass |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `.claude/lib/functional-verification.js`
- **Reuse:** the CLI's `if (require.main === module)` dispatch and its usage block (`functional-verification.js:2093-2114`, dispatch from `:2099`; the new `reproof-retry-set` / `merge-reproof-retry` branches at `:2333-2375`), following `read-coverage-floor`'s file-path form (`:2323`) rather than a JSON payload, since these read files the workflow already wrote [read]. State shape: `{iteration, criteria:[{id,status,…}], gapsClosed, outcome}` with status one of `met|not_met|not_verifiable|unbuilt` (`renderReport` JSDoc, `:1199-1222`) [read]. `packages/full/lib/functional-verification.js` is a symlink to core, so it needs no copy [ran].
- **Replaces:** nothing; new exports beside `readFullDeploy` in `module.exports` (`:2023`; `readFullDeploy` is exported at `:2039`).
- **Follow:** pure functions take parsed objects and never touch the filesystem; only the CLI branch reads and writes. Add both to the usage text and the comment block of CLI forms. The `.claude/lib/` copy must be byte-identical (it is today [ran]).
- **Careful:** the state the workflow writes has exactly four keys, `iteration`, `criteria`, `gapsClosed`, `outcome` (`verify-functional.js:664-676`) [read]; the merge keeps those four and adds `retried` (ids), with `criteria` the full first-run list in first-run order. Do not set `retried: true` on criteria that were not retried. Write the merged file through `require('./implement-state').save` (atomic temp+rename; `verify-functional.js:658-660` calls it the only sanctioned `.trd-state` JSON writer) [read], never `fs.writeFileSync`. A missing or unparseable `--second` is not an error: keep the first statuses, mark the retried ids, keep the first outcome. A missing or unparseable `--first` exits non-zero with a reason.

### FIX-002
- **Touches:** `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/commands/verify-build-criteria.test.js`, `packages/core/contracts/ship-custody-gate.md`, `.claude/contracts/ship-custody-gate.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the existing "`--criteria <ids>`" bullet list (`verify-build.md` ~line 451-480) and step 4's "**Under `--criteria`**" paragraph (~line 327-331) [read]; the test file's `criteria()` slice and `flat()` helper [read]; `ship-primitives.test.js`'s `gateFlat` (line ~160) [read].
- **Replaces:** the `cap: 1` bullet gains a sentence that the one retry below is not a second iteration of the loop; the bullet's existing wording ("never reaches its in-place Debug stage") stays, as an existing test pins it.
- **Follow:** write the retry as a new bullet ("**One retry, no Debug**") after the "Only the named criteria" bullet, with the two commands in code. Keep "No field is added or removed: the list stays the 26 fields." Mirrors are byte-identical copies (pinned by `verify-build-criteria.test.js` and the contracts' mirror checks).
- **Careful:** the `--chained` section's RETURN line text must not change. The custody gate already points at `reverify/verification-state.json` (a test pins it); add to that sentence, don't move the path.

## Could Not Verify

After `/audit-build` (2026-11-11): FIX-001's two library functions and CLI subcommands and FIX-002's prose and contract sentence were checked against the code and tests (655 tests pass across the three named suites; the `.claude/lib/` mirror is byte-identical). What remains unchecked:

- **No PRD exists for this change** (it is a `/plan`-sized fix from the ship-cost-reduction roadmap, item 3), so the audit checked the delivered code only against this TRD's objectives, never against product requirements. Whether the objectives themselves say the right thing rests on the owner's instruction of 2026-11-11, not on a document.
- A live re-proof with one deliberately flaky criterion in a fixture slot, showing met-on-retry — out of scope for this audit, which reads code and runs unit and prose tests; those cannot show a model actually follows the new steps. Deferred by the roadmap until this item is built (it now is).
- The retry helps a flaky check, not an environment that is slow to come up: it starts immediately with no wait, so a preview still building at the first run will usually fail the setup check again on the retry (`verify-functional.js:1367-1371` marks every open criterion `not_verifiable` on a setup failure) [read]. The retry still runs for it; it is just unlikely to change the result. A known limit of the design, not a defect; no test covers it because no objective asks for it.
