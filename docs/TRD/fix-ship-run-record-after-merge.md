# TRD: fix-ship-run-record-after-merge

**Source PRD**: None — defect, scope and open-question defaults decided by the owner 2026-11-08

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Once the PR has merged, the run record (`shipped.json`) is detached to `<git common dir>/ensemble/ship/<state dir name>/<startedAt>.json` whatever the merge step records: `merged`, a `stop` after `gh pr merge` landed, or a `stop` on a PR merged by hand (any result whose `data.merged` is `true`). With the tracked file gone, `start --resume` continues at the merge step's recorded outcome, not at step 1 | the reproduction below (block 1); your instruction, 2026-11-08 | yes |
| O2 | When the sequencer detaches, `custody.json` (the verified-code anchor and its moves) is detached into the same folder, named by the run's startedAt; `custody.js` reads and writes it there from then on and stays its only writer, so an anchor move made after the merge survives the branch being deleted | your instruction, 2026-11-08 | yes |
| O3 | With no tracked record, `start --resume` loads a detached record only when its work kind, id and branch match what `start` was given; otherwise a fresh run begins. `start` writes a pointer in the same folder naming the startedAt of the run it loaded or created, and `next`, `record` and `status` follow that pointer instead of taking the newest record by `updatedAt` | the reproduction below (block 2); your instruction, 2026-11-08 | yes |
| O4 | `custody.js check` no longer has a `push` link: `--link push` returns the existing `unknown link push` failure; the `pr-head`, `merge` and `deploy` links are unchanged | your instruction, 2026-11-08 | |
| O5 | Every edited file under `packages/core/` has a byte-identical copy under `.claude/`, and `npx jest packages/core/lib packages/core/contracts` passes | your instruction, 2026-11-08 | |

## Reproduction

`docs/plans/fix-ship-run-record-after-merge/repro.sh` (recreated in this branch; it works in a
throwaway git repo under `mktemp -d`, never live state). Policy: `push`, `open-pr`, `merge`,
then `close-issue` after shipping.

### Steps
1. **Block 1.** Start a run on `feature`; record `push` → `pushed`, `open-pr` → `opened`, then
   `merge` → `stop` with `data.merged: true` (the merge landed, its proof failed). Check out
   `main`, delete branch `feature` and the tracked `.trd-state/f/shipped.json` (what a merged,
   deleted branch leaves). Run `start --resume` with the same kind and id and `--branch feature`
   (the work's own branch, which `/ship-build` Step 3 passes on a resume after this fix), then
   `status`.
2. **Block 2.** In a second repo, finish a run on `old-branch` (`pushed`, `opened`, `merged`,
   `closed`; status `done`). Delete the tracked record, switch to `new-branch`, and run
   `start --resume --branch new-branch` with the same kind and id.

### Actual  [ran 2026-11-08]
```
block 1: steps after resume: push:null open-pr:null merge:null close-issue:null; cursor at step "1"
block 2: start --resume on new-branch -> {"ok":true,"status":"done","errors":[],"resumed":true}
```
Block 1 began a fresh run at step 1, so the merged PR would be pushed and opened again. Block 2
loaded another branch's finished run and reported this work as already shipped.

### Expected
Block 1: cursor on step `3` (merge) with `push:pushed open-pr:opened merge:stop`. Block 2:
`start` returns no `resumed` and `status: running`. `repro.sh` exits 0 then; it exits 1 today.

### Root cause  [ran]
- **Block 1:** `record()` (`packages/core/lib/ship-sequencer.js:799-806`) detaches only on a
  result listed in the contract's `detach-on` and never on `wait`/`stop`. The merge contract
  lists only `merged`, so a `stop` after the PR merged stays in the tracked file, which the
  merged-and-deleted branch takes with it. `start --resume` then finds no detached record and
  starts over.
- **Block 2:** `latestExternal()` (`ship-sequencer.js:472-486`) returns the newest detached
  record in the folder by `updatedAt`, with no check that it belongs to this work's branch, and
  `loadState()` (`:505-528`) feeds it to `start --resume` and to every `next`/`record`/`status`.
- **Custody (O2):** `custody.json` lives only at `<stateDir>/custody.json`
  (`packages/core/lib/custody.js:193-210`). Step 5 of `/ship-build` never commits the state
  directory after a merge, and the custody gate leaves its re-anchor uncommitted, so the last
  anchor move is lost with the branch.

## Decision

**One shared module, `packages/core/lib/ship-record-dir.js`, owns the detached-record folder, the
pointer, and which run is current.** It exports:
- `recordDir(stateDir)`: the existing `externalDir` logic moved verbatim
  (`<git common dir>/ensemble/ship/<basename(stateDir)>`, or `null` outside git);
- `safeName(startedAt)`: the existing `[^A-Za-z0-9_-]` → `-` replacement;
- `readPointer(stateDir)` / `writePointer(stateDir, {startedAt, work})`: the pointer is
  `current.json` in that folder, `{ "startedAt", "work": {kind, id, branch}, "at" }`. Only
  `startedAt` is read; `work` and `at` are diagnostic, for a person looking at the folder;
- `currentStartedAt(stateDir)`: the tracked `<stateDir>/shipped.json`'s `startedAt` when that
  file is readable, otherwise the pointer's. This is `loadState`'s own precedence, so a worktree
  whose tracked record names run B never follows a pointer another worktree moved to run A;
- `custodyPath(stateDir)`: with `s = currentStartedAt(stateDir)` and a record folder, it returns
  `<recordDir>/<safeName(s)>.custody.json` when that file exists **or** the run's detached
  record `<recordDir>/<safeName(s)>.json` exists (so a first anchor set after the detach still
  lands outside the tree); otherwise `<stateDir>/custody.json`.

Both `ship-sequencer.js` and `custody.js` require it; the sequencer is the pointer's only
writer, `custody.js` the custody files' only writer. Rejected: duplicating `externalDir` into
`custody.js` (two copies of one path rule drift), and `custody.js` requiring
`ship-sequencer.js` (the sequencer requires `custody.js` to call its detach: a require cycle).

**Sequencer.**
- **Detach on merge without naming merge.** The sequencer is primitive-blind: it names no
  primitive and no result word. So the merge contract gains a front-matter key,
  `detach-on-data: merged`, parsed beside `detach-on` into `contract.detachOnData` (a list of
  data keys). `record()` detaches when the result is in `detach-on` (real results only, as now)
  **or** `(data || {})[k] === true` for any `k` in `detachOnData`, on any result, `stop` and
  `wait` included. On detach it writes the pointer and calls `custody.detach({stateDir,
  startedAt})` (required lazily, inside the same `try` that fills the returned `custodyDetach`
  field; a custody failure never fails the record).
- `latestExternal()` is deleted. `loadState()` with no tracked file reads the pointer and loads
  `<recordDir>/<safeName(pointer.startedAt)>.json` when it exists and is `detached`; no pointer
  or no such file is the existing `no shipped.json … run start first` error. With a tracked
  file it is unchanged.
- `start()` with a tracked file loads it as now. With none and `resume: true`, it scans the
  folder's record files (skipping `current.json` and `*.custody.json`), keeps those that are
  `detached` and whose `work.kind`, `work.id` and `work.branch` equal what `start` was given
  (`branch` absent compares as `null`), and loads the newest by `updatedAt`. No match: a fresh
  run, exactly as a plain `start`. Loaded or created, `start` writes the pointer (inside git).
- `status()` adds `custodyPath` (from `ship-record-dir.js`) so the readout names where the
  custody anchor now lives.

**`/ship-build` (`ship-build.md`).** Step 3: under `--resume`, `--branch` is the work's own
branch, `branch` from `.trd-state/<feature>/implement.json` (the field Step 1 already reads),
falling back to the current branch; a kept record is continued only when its kind, id and
branch match. Without this the real resume, run from `main` after the branch is deleted,
matches nothing and starts over: the block 1 defect by another route. Step 6: the custody
anchor and moves are read from `status`'s `custodyPath`, not from `<state-dir>/custody.json`.

**Merge contract (`ship-primitive-merge.md`).** One rule, for every path: before any `stop` this
contract returns (a custody-gate stop, a `pr-head` failure, a `gh pr merge` failure, a merge-link
failure), read `gh pr view <pr> --json state`; when it reads `MERGED`, the stop carries
`data: { merged: true, base }`. The Result section says the sequencer detaches on it
(`detach-on-data: merged`). `detach-on: merged` stays.

**Custody.** `custody.js` gains `detach({stateDir, startedAt})` and a CLI verb
`detach --state-dir D --started-at T`. It copies the tracked `custody.json` to
`<recordDir>/<safeName(startedAt)>.custody.json` (no-op when that file already exists or there is
no tracked anchor) and returns `{ok, action: 'detached'|'none', path, reason}`. The tracked file
is left in place and never written again, as the sequencer leaves the tracked `shipped.json`:
deleting it after the merge would put an uncommitted deletion on the merged branch, which the
detach exists to avoid (OQ-1). `readCustody` and `writeCustody` both use
`custodyPath(stateDir)`, so `reconcile` and its `move` write outside the tree after the detach,
and `check` reads from there.

**Push link removed.** The `if (link === 'push')` branch, the header CLI line, the JSDoc union
member, the usage string's push alternative and `[--branch B]`, the `branch` argument in `main`,
and the `check: push link` tests go. The unknown-link test moves to the top of `check()`, before
the anchor is read, so `--link push` returns `unknown link push` with or without an anchor. The
CLI test that used the push link checks `--link push` → `unknown link push` instead. No caller
uses the push link, so this part is a refactor (dead-code removal) carried under a defect
because the owner bundled the four issues.

**Copies.** Each edited `packages/core/` file is copied byte-for-byte to `.claude/` (`cp`, then
`cmp`); the new module also gets the symlink `packages/full/lib/ship-record-dir.js ->
../../core/lib/ship-record-dir.js`, like its siblings.

absorbed:     `ship-build.md` Step 3 passes the work's branch on `--resume` — without it the branch match makes the real post-merge resume start over  [BLOCKS]
absorbed:     `ship-build.md` Step 6 reads custody from `custodyPath` — after the detach the tracked `custody.json` is stale or gone, so the readout would report the wrong anchor  [BLOCKS]
not absorbed: `/ship-build` Step 5 says nothing about `custody.json` after a merge — documentation; the fix works without it
not absorbed: a merge step handed out again from `main` runs `reconcile --head <PR head>`, which refuses when `main` holds base commits the PR head lacks — a separate custody-gate limit, recorded under Could Not Verify

## Non-Goals

- No change to which primitives exist, to how `detach-on` is parsed, or to `loadState` when the
  tracked `shipped.json` is present.
- No migration of detached records written before this fix (they have no pointer; a matching
  `start --resume` writes one).
- No change to the `pr-head`, `merge` or `deploy` links, to `reconcile`'s rules, or to
  `ship-custody-gate.md`.
- No cleanup of old detached records.

## Verification Artifacts

None apply — the change is to two Node libraries, one command and one prompt contract; no
screen, design, data view or user flow is in scope. Jest and `repro.sh` are the evidence.

## Verification Environment
**Environment**: local (this working tree: `npx jest`, `node <lib>`)
**Refresh**: none declared (tests read the working tree)
**Cannot be checked there**: a live `/ship-build` merge on GitHub; `github-live-test` exists for that but is outside this fix's scope

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should detaching `custody.json` delete the tracked copy ("moving")? | Copied out; the tracked copy is left untouched and never written again, like `shipped.json`, because deleting it would dirty the merged branch | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `ship-record-dir.js` (`recordDir`, `safeName`, pointer read/write, `currentStartedAt`, `custodyPath`). In `custody.js` add `detach` (function and CLI verb), route `readCustody`/`writeCustody` through `custodyPath`, and remove the `push` link. Update `custody.test.js`. Copy to `.claude/lib/`; symlink in `packages/full/lib/` | O2, O4, O5 | None | (a) custody test: anchor set, pointer written, `detach` returns `detached` and the external `<startedAt>.custody.json` holds the anchor; a later `reconcile` move lands in the external file, not the tracked one; after the tracked `.trd-state` is deleted, `check` still reads the moved anchor. Fails today (no `detach`). (b) custody test: two runs share a state-dir name; the tracked `shipped.json` names run B while the pointer names detached run A with an `A.custody.json`; `reconcile`/`check` use the tracked `custody.json`, never A's. (c) custody test: with the run's detached record present and no anchor yet, `reconcile --set-only` writes `<startedAt>.custody.json`, not the tracked file. (d) `check` with `link: 'push'` returns `ok: false`, reason `unknown link push`, with and without an anchor; no `check: push link` tests remain; `custody.js` has no push branch, no push alternative in its usage string and no `--branch` flag |
| FIX-002 | In `ship-sequencer.js`: parse `detach-on-data`; detach on a `detach-on` result or on any result whose `data` sets a `detach-on-data` key to `true`; on detach write the pointer and call `custody.detach`; delete `latestExternal`; `loadState` without a tracked file follows the pointer; `start --resume` loads only a kind/id/branch-matched detached record and `start` always writes the pointer; `status` reports `custodyPath`. Update the header and CLI notes. Add Jest tests for both reproduction scenarios. Copy to `.claude/lib/` | O1, O2, O3, O5 | FIX-001 | (a) test: with a contract declaring `detach-on-data: merged`, a `stop` with `data.merged: true` writes the external record; after checking out `main`, deleting the branch and the tracked file, `start --resume` with the work's branch returns `resumed: true` and `status` shows the cursor on that step with the earlier results kept. Fails today. (b) test: a finished, detached run on `old-branch`; tracked file deleted; `start --resume` with `branch: 'new-branch'` returns no `resumed`, `status: 'running'`, cursor on step 1; then the new run's tracked file is deleted and `status` returns the `run start first` error, not old-branch's `done`. Fails today. (c) test: a `stop` without `data.merged` keeps the tracked file. (d) on detach the pointer names the run's startedAt and `<startedAt>.custody.json` exists when a tracked anchor existed; `record` returns `custodyDetach`. (e) the existing test asserting no `.git/ensemble` for a contract without `detach-on` is narrowed to "no `<startedAt>.json` record under `.git/ensemble/ship/f`", and every other existing test passes. (f) `docs/plans/fix-ship-run-record-after-merge/repro.sh` exits 0 (it exits 1 today) |
| FIX-003 | Merge contract: add `detach-on-data: merged`; every `stop` it returns first reads `gh pr view <pr> --json state` and, on `MERGED`, carries `data: { merged: true, base }`; the Result section says the sequencer detaches on it. `ship-build.md`: Step 3 passes the work's branch on `--resume` and states the kind/id/branch match; Step 6 reads custody from `status`'s `custodyPath`. Copy both to `.claude/` | O1, O3, O5 | FIX-002 | (a) a contract test asserts the merge contract's front matter loads with `detachOnData: ['merged']` and that one rule in its body ties every `stop` to the `MERGED` re-read and `data.merged`. Fails today. (b) a surface test asserts `ship-build.md` Step 3 takes the resume branch from `implement.json` and Step 6 names `custodyPath`. Fails today. (c) `npx jest packages/core/lib packages/core/contracts packages/core/commands` passes, and `cmp` of every edited `packages/core/` file with its `.claude/` copy succeeds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/ship-record-dir.js`, `.claude/lib/ship-record-dir.js`, `packages/full/lib/ship-record-dir.js`, `packages/core/lib/custody.js`, `.claude/lib/custody.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `externalDir`/`externalPath` bodies at `ship-sequencer.js:443-465` (strip `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`, walk up to an existing dir, `git rev-parse --git-common-dir`) [read]; `implementState.save` for atomic writes, as `writeCustody` does at `custody.js:204-207` [read]; `setup()`, `anchored()`, `s.args()` and `cleanEnv()` in `custody.test.js` [read]
- **Replaces:** the `push` branch at `custody.js:484-491`, header line 40, the JSDoc union at 470, usage at 558, the `branch` argument in `main` (~588), the `describe('check: push link')` block at `custody.test.js:300-339`, and the push check in the CLI test at `custody.test.js:713-723` [read]
- **Follow:** every git call is `spawnSync` with an argument array; every CLI verb prints one JSON line and exits 0, `refused`/`ok:false` on failure (`custody.js` header CONTRACT) [read]
- **Careful:** with no record folder (outside git) or no pointer and no tracked `shipped.json`, `custodyPath` must return the tracked path, so `/verify-build` and pre-ship calls behave as today [read]

### FIX-002
- **Touches:** `packages/core/lib/ship-sequencer.js`, `.claude/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`
- **Reuse:** `ship-record-dir.js` from FIX-001; the `detach-on` parsing at `ship-sequencer.js:~205-215` as the model for `detach-on-data`; the `describe('detach-on')` helpers `makeRepo`, `startIn`, `handOut`, `step` at `ship-sequencer.test.js:529-571` [read]
- **Replaces:** `latestExternal` (`ship-sequencer.js:472-486`), the `fallback` option of `loadState` (`:500-529`), the `externalDir`/`externalPath` bodies (moved to the shared module), the detach condition at `:799-806`, the STATE/CLI header text at `:21-45`; the `.git/ensemble` absence assertion at `ship-sequencer.test.js:630` [read]
- **Follow:** "PRIMITIVE-BLIND: this module names no primitive and no primitive's result word" (`ship-sequencer.js:10-14`): the data key comes from the contract's `detach-on-data`, never a literal in the sequencer [read]
- **Careful:** the existing test 'a record never committed before the merge is still found after the branch is deleted' calls `status` before `start --resume`; it must pass through the pointer written at `start`. `next()` writes the tracked file before `record()` detaches (`:731`); keep that. A `stop` leaves `status: 'stuck'` with the cursor on the step, which is what makes a resume hand that step out again [read]

### FIX-003
- **Touches:** `packages/core/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-primitives.test.js`, `packages/core/commands/ship-build.md`, `.claude/commands/ship-build.md`, `packages/core/commands/ship-build-surface.test.js`
- **Reuse:** merge step 2's existing `gh pr view <pr> --json state` read; Step 1's `implement.json` `branch` read at `ship-build.md:48` [read]
- **Replaces:** the Result sentence "After `merged` the sequencer keeps the run record outside the tracked tree" (widened to a post-merge `stop`); Step 3's `--branch <current branch>` on a resume; Step 6's custody source [read]
- **Follow:** contracts give numbered steps saying what to run and what to record; front-matter keys are parsed by `loadPrimitives`, so `results:` and `detach-on:` stay as they are [read]
- **Careful:** `ship-primitives.test.js` and `ship-build-surface.test.js` already assert text in these files (for example that no contract uses `--link push`); run both [read]

## Could Not Verify

- A live merge on GitHub; the fix is proven against the sequencer and custody libraries with real local git repos only.
- A merge step handed out again from `main` after the branch is deleted runs the custody gate's `reconcile --head <PR head>`, which compares local `HEAD` with the PR head (`custody.js:337-345`) and refuses when `main` holds base commits the PR head lacks. The resumed run then stops again at the merge step, with its record kept, rather than starting over. Fixing that gate behaviour is outside this TRD.
