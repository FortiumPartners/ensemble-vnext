# TRD: reproof-ship-record

**Source PRD**: None — small change decided in session (workplan ship-cost-reduction, feature F-6; roadmap item 6, `docs/plans/ship-cost-reduction/roadmap.md`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | The ship record (`shipped.json`) carries a `reproof` block: `count` (the number of re-proof runs) and `runs`, one entry per re-proof with the criteria named, the criteria met (each with its `retried` flag from the re-proof retry), the outcome string the run returned, the custody action and change classes that triggered it, and the time it took | your instruction, 2026-11-11 (roadmap item 6) | yes |
| O2 | Each run is written by `ship-sequencer.js` (a library function and a `reproof` CLI subcommand), never by hand-editing `shipped.json`, and it lands in whichever file the record lives in (the tracked one, or the detached one after a detach) | your instruction, 2026-11-11 | yes |
| O3 | The custody gate (`packages/core/contracts/ship-custody-gate.md`) calls that subcommand once per re-proof it runs | your instruction, 2026-11-11 | |
| O4 | The ship-build guide (`docs/guides/ship-build.md`) names every field of the block so Forge can read it | your instruction, 2026-11-11 | |

## Intended Change

Today [read]: `ship-sequencer.js` writes `shipped.json` (`start`, `next`, `record`) with
`version`, `work`, `policy`, `steps`, `cursor`, `results`, `status`, `shipped`, timestamps and
the detach fields, and nothing about re-proofs. The custody gate's `reverify` branch runs
`/verify-build <trd> --criteria <ids> --no-fix --chained`, which (after F-3, PR #106) leaves the
merged result of the run and its one retry in `<stateDir>/reverify/verification-state.json`
(`criteria[]` with `status` and `retried: true` on re-judged ones, `outcome`, top-level
`retried` id list), and then re-reconciles. No trace of the run reaches the ship record.

After this change:

1. `start` writes `reproof: { count: 0, runs: [] }` into a new record.
2. `ship-sequencer.js reproof --state-dir <d> --custody '<the reconcile JSON line that returned reverify>' --reverified <path> --started-at <ISO time taken before /verify-build> [--outcome <word from the RETURN line>]`
   (library: `recordReproof(stateDir, {custody, reverifiedPath, startedAt, outcome})`)
   appends one entry and increments `count`:
   ```json
   { "step": "4", "primitive": "<the handed-out step's primitive>", "pass": 1,
     "criteria": ["FS-2", "FS-5"],
     "met": [{ "id": "FS-2", "retried": false }, { "id": "FS-5", "retried": true }],
     "outcome": "satisfied",
     "custody": { "action": "reverify", "classes": ["shipped"], "differing": ["src/a.js"], "excused": [] },
     "startedAt": "…", "endedAt": "…", "durationSeconds": 212 }
   ```
   - `criteria` = the custody line's `ids` (exactly what was passed to `--criteria`).
   - `met` = those of `criteria` whose status in the reverified file is `met`, each with
     `retried` true when the file marks it so. An unreadable or missing file, or one last
     modified before `startedAt` (a previous re-proof's file left in place when this run wrote
     none, e.g. `RETURN → not run: unknown criterion`), counts as missing: `met: []`.
   - `outcome` = `--outcome` when given, else the reverified file's `outcome`, else `null`.
   - `custody.classes` = the distinct `classifyPath` classes (`custody.js`) of the custody line's
     `differing` paths, plus `base` when `excused` is non-empty (a missing `excused`, as on a
     release gate run with no base, counts as `[]`). Today `differing` holds only shipped paths,
     so this reads `["shipped"]`, `["base"]` or both; finer classes appear here only if roadmap
     item 2 lets non-shipped paths trigger a re-proof.
   - `durationSeconds` = whole seconds from `startedAt` to the time of the call.
   - The step fields come from the step currently handed out (`handedOut`), so the entry names
     which act the gate was guarding without the sequencer naming a primitive. With no step
     handed out they are `null`; the run is still recorded (the record is reporting, not proof).
   - Refused (`ok: false`, record unchanged): no record, the run is `done`, the custody value is
     not JSON or has no `action` or no `ids` array, `startedAt` is not a parseable time.
   - A record written before this change (no `reproof` key) gains the block on its first run.
3. The custody gate's `reverify` bullet: note the time before `/verify-build`, and after it,
   before the repeat reconcile, run the subcommand above. A refused call is one readout line,
   never a stop: the record is reporting, not proof.
4. The guide's Custody section gains a "Re-proof record" table naming each field.

Checkable: `npx jest packages/core/lib/ship-sequencer.test.js` passes with a case that records
two re-proof runs (one with a retried criterion) and reads both back from `shipped.json` with
every field above, a proof file older than `--started-at` read as absent, and a call with no
step handed out recorded with null step fields; `grep` finds each field name in `docs/guides/ship-build.md`.

## Decision

The sequencer computes everything from what the gate already holds (the reconcile JSON line and
the reverified state file); the gate passes paths and the raw line, never hand-assembled
fields, so prose cannot drift from the record. Change classes are derived inside the sequencer
from `custody.classifyPath` (lazy `require`, as `record()` already does for `custody.detach`)
rather than added to `custody.js`'s reconcile output, because roadmap item 2 is changing
`custody.js` in parallel and this keeps the two changes in separate files. A proof file older
than the run's start is read as absent, the same staleness rule `merge-reproof-retry` applies
(`functional-verification.js`, `--second` older than `--first` is ignored).
The entry is appended outside the step cursor (no `record()` call, no result word) because a
re-proof happens inside a step, not as one. The sequencer stays primitive-blind: no primitive
name or result word appears in its source.

## Non-Goals

- No change to `custody.js`, `/verify-build`, the re-proof retry, or the `verify-functional` workflow.
- No change to step order, results, detach or resume behaviour.
- Nothing on Forge's side; nothing under the plan's out-of-scope fence (run records off the branch, Storybook-only work, ship-setup CI guidance).
- No step-level loop (roadmap item 5, "Fewer STUCK endings", to come; it also edits the sequencer — this change is kept to one new function, one CLI branch and one line in `start` so the two merge cleanly).

## Verification Artifacts

None apply — a library function, a CLI branch, contract prose and a guide; no UI, rendered data, design or screen flow for a check skill to exercise.

## Verification Environment
**Environment**: local
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: a live re-proof inside a real `/ship-build` merge (no live check is required by the roadmap item: "Deferred checks: none")

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `recordReproof` and the `reproof` CLI subcommand to `ship-sequencer.js`; `start` writes the empty block; update the header comment and USAGE; mirror to `.claude/lib/ship-sequencer.js` | O1, O2 | None | `npx jest packages/core/lib/ship-sequencer.test.js` passes with new cases: two runs recorded through the CLI (the second with a criterion `retried: true` and one not met) read back from `shipped.json` with `count: 2` and every field of each entry; `custody.classes` holds `base` when `excused` is non-empty and a missing `excused` reads as `[]`; a reverified file older than `--started-at` gives `met: []`; a call with nothing handed out records null step fields; a record without the key gains it; a detached record is written in its detached file, not the tracked one; refusals (no record, done run, bad custody JSON, bad time) leave the file byte-identical; "the module source names no primitive" still passes; `cmp` of the two copies is equal |
| FIX-002 | Custody gate contract: in the `reverify` bullet, take the start time and call the subcommand after `/verify-build`, before the repeat reconcile; a refused call is a readout line, not a stop; mirror to `.claude/contracts/` | O3 | FIX-001 | The contract text names `ship-sequencer.js reproof` with `--custody`, `--reverified`, `--started-at` and `--outcome`, placed between the `/verify-build` call and the `--reverified` reconcile; `npx jest packages/core/contracts packages/core/lib/ship-build.seam.test.js` passes; the two copies are equal |
| FIX-003 | Ship-build guide: a "Re-proof record" subsection under Custody naming every field (`reproof`, `count`, `runs`, `step`, `primitive`, `pass`, `criteria`, `met`, `id`, `retried`, `outcome`, `custody`, `action`, `classes`, `differing`, `excused`, `startedAt`, `endedAt`, `durationSeconds`) with its meaning, and where the record lives after a detach | O4 | FIX-001 | Each listed field name appears in the new subsection of `docs/guides/ship-build.md` |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`, `.claude/lib/ship-sequencer.js`
- **Reuse:** `loadState`/`saveState` (they already resolve the tracked vs detached file and write through `implement-state.save`) [read]; `locate(state, step)` for the handed-out step's primitive [read]; the lazy `require('./custody')` pattern in `record()` [read]; `custody.classifyPath(p, trdRel)` exported from `custody.js` [read]; the CLI's `argValue`/`emit` pattern and exit-2 usage convention [read]
- **Replaces:** nothing
- **Follow:** module header lists every CLI verb and state key — add `reproof`; tests build state through the real CLI against fixture contracts in a temp dir (see existing `start`/`next`/`record` cases) [read]
- **Careful:** the source must not contain any real contract's primitive name or result word (test at `ship-sequencer.test.js:468`), so never write a primitive name such as the merge or release act literally; `trdRel` for `classifyPath` is the work's TRD relative to cwd (`state.work.trd`), and a sweep has none [read]

### FIX-002
- **Touches:** `packages/core/contracts/ship-custody-gate.md`, `.claude/contracts/ship-custody-gate.md`
- **Reuse:** the existing step 3 `reverify` bullet and its `<work.stateDir>/reverify/verification-state.json` path [read]
- **Replaces:** nothing
- **Follow:** contracts give exact commands in fenced or backticked form with `<work.*>` placeholders [read]
- **Careful:** step 5 forbids committing between the gate and the act; the subcommand writes `shipped.json` uncommitted, which the sequencer already does on every `record` — do not add a commit [read]

### FIX-003
- **Touches:** `docs/guides/ship-build.md`
- **Reuse:** the Custody section (line ~279) and its table style [read]
- **Replaces:** nothing
- **Follow:** plain prose, field then meaning, one table [read]
- **Careful:** say that after a merge the record (and so this block) is in the detached file `status` reports as `recordPath` [read]

## Could Not Verify

State after `/audit-build` (2026-11-11): all three tasks (FIX-001 to FIX-003) were checked against the delivered code and its tests and confirmed built and tested; what remains below was not checked by that audit, and says why.

- No PRD exists for this change (it was decided in session from roadmap item 6, `docs/plans/ship-cost-reduction/roadmap.md`), so the delivered code was checked against this TRD only, never against product requirements: whether the objectives capture everything the roadmap item intended, and whether anything it asked for was left out, is unchecked.
- `--custody` takes the reconcile line as a single-quoted shell argument; a differing path containing `'` would break the gate's call. Reconcile paths come from git and none in this repo carry a quote; accepted, not guarded. Out of scope for the audit: a risk this TRD accepted, not a requirement to test.
- Whether Forge's planned per-PR ship record wants different field names; none were given beyond the roadmap brief, so the names above are this TRD's choice and the guide is the contract. Out of scope for the audit: it depends on Forge's side, which this repository does not hold.
- A live re-proof inside a real `/ship-build` merge was not exercised; the gate's call is proven only as contract text and by the unit and seam tests (local environment, per Verification Environment above; the roadmap item lists no deferred live check).
