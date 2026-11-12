# TRD: fold-the-detached-ship-record-into-the-ref

**Source PRD**: None — small change decided by the owner's PM: workplan run-records-off-branch, feature F-4 (`docs/plans/run-records-off-branch/roadmap.md` item 4), plus a deferred high-severity review finding from "Readers fall back to the ref"

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | From the merge onward, `/ship-build` writes the run record (`shipped.json`) and the custody anchor (`custody.json`) to the feature's records ref `refs/ensemble/records/<slug>` through the records ref library, and writes nothing new under `<git common dir>/ensemble/ship/` | roadmap item 4 brief; PM instruction, 2026-11-12 | yes |
| O2 | A ship run started before this change (records in the detached folder, nothing on the ref) still loads and resumes from that folder; the folder is read after the ref | roadmap item 4 brief | yes |
| O3 | `shipped.json` on the ref carries `work.branch` and `work.forge_feature_id` (Forge's reader matches on them) | roadmap item 4 brief; forge-vnext reader contract D5 | |
| O4 | Custody's merge and deploy links resolve the anchor from the ref after the merge | roadmap item 4 "How it will be checked" | yes |
| O5 | A plain `/ship-build` start (no `--resume`) on a fresh checkout or re-created worktree, with `closed.json` only on the records ref, anchors custody at the audited commit, not HEAD; with `closed.json` in neither place, an unclosed feature is still refused | PM instruction, 2026-11-12 (review finding deferred from "Readers fall back to the ref") | yes |
| O6 | `ship-sequencer.js` and `custody.js` keep sharing one path rule (`ship-record-dir.js`); neither takes the other's | roadmap item 4 brief | |

## Intended Change

Kind: **change**, with one absorbed defect (O5). Decided by the PM in the `/plan` request of
2026-11-12. Before and after, confirmed by reading the code [read] and by the existing tests
[ran]:

**Before.** When a contract's `detach-on` result is recorded (the merge step's `merged`),
`ship-sequencer.js record` sets `state.detached = true` and `state.recordPath =
<common>/ensemble/ship/<slug>/<startedAt>.json` (`ship-sequencer.js:938-945`), writes the record
there, writes a pointer `current.json` in the same folder (`:949`), and calls
`custody.detach`, which copies the tracked `custody.json` to `<startedAt>.custody.json`
beside it (`custody.js:263-283`). `start` also writes the pointer on every run (`:666`, `:672`,
`:716`). Custody reads and writes the anchor at `ship-record-dir.js custodyPath`. Nothing of
the post-merge record reaches the records ref, so Forge's ref reader never sees `shipped.json`
reach `done`.

**After.**
1. At the detach, and on every later save of a detached run, the sequencer writes
   `shipped.json` to `refs/ensemble/records/<slug>` (one ref commit, pushed when there is an
   origin); `state.recordRef` names the ref and `recordPath` reads `<ref>:shipped.json`.
   `custody.detach` writes `custody.json` to the same ref, stamped with the run's `startedAt`;
   every later anchor move lands there too. No pointer and no file is written under
   `<common>/ensemble/ship/` unless a ref write fails (then the old file and pointer).
2. Reading a run: the tracked `shipped.json` (worktree), then the ref's copy of the same run
   (same `startedAt`, detached, the ref's identity matching the run's `work`), then the
   detached folder's file of the same run; of the copies found, the later `updatedAt` wins.
   With no tracked file: the ref's detached record (local read), then the pointer (old runs
   and fallbacks), again by later `updatedAt`. Custody reads the anchor of a
   run on the ref from the ref's `custody.json` (when stamped with that run), else the
   detached folder's `<startedAt>.custody.json`, else the tracked file.
3. A legacy run (detached folder, no ref) resumes from the folder; its next save moves it to
   the ref.
4. `start` without `--resume` first restores the state folder from the ref (the same
   `ensure` call `--resume` makes, with the work's branch), then removes a `shipped.json` that
   the restore brought back, so the plain start still begins a fresh run. `closed.json` and
   `custody.json` restored with it are what custody's `reconcile --set-only` reads next.

Checkable outcomes (each would fail if the change did nothing):
- after a `merged` record in a git repo, `git cat-file -p refs/ensemble/records/f:shipped.json`
  shows `detached: true` with the post-merge cursor, and `<common>/ensemble/ship/` does not exist;
- a fixture detached folder (record + pointer, no ref) is loaded by `status` and continued by
  `start --resume`; its next `record` lands on the ref;
- custody `check --link merge` and `--link deploy` pass against the ref's anchor when the
  tracked `custody.json` names a different commit;
- with the folder deleted and `closed.json` (`audit.auditedCommit` = X) only on the ref, a
  plain `start` followed by `custody reconcile --set-only` returns `anchor: X`, `source`
  `audited`, while HEAD is a later commit.

## Decision

**Write post-merge records with a new library call, `recordRef.writeFiles`, that commits given
file contents onto the ref and never touches the worktree, the index or the branch.** The
existing `write` takes its files from the worktree folder and, on a failed push, commits them
on the branch — after a merge the branch is the merged one (often `main`), the exact place
the detached folder exists to keep clean. `writeFiles` reuses `write`'s machinery
(`commitOn`, `swapRef`, `pushOnce`, `reconcile`): it overlays the ref's tip (so every other
record on the ref is kept), moves the ref by compare-and-swap, and pushes when there is an
origin. It never falls back to a branch commit and never folds anything out of the index.

**The identity written to the ref's `record.json` is the run's own, not the session's.** After
a merge the current branch is often `main`; `write` would stamp `main` and then fail Forge's
match rule. `writeFiles` takes `{branch: work.branch, forge_feature_id}` from the run record.
`start` now stores `work.forge_feature_id` (`FORGE_FEATURE_ID`, or null), and a write fills it
in for a run started before this change.

**A ref owned by another feature is never overwritten.** When the ref's tip names a different
feature (Forge's rule, `sameFeature`), `writeFiles` refuses. `write` replaces the tree in that
case; an unattended post-merge write must not destroy another feature's records.

**When the ref cannot be written, the record still lands in the detached folder.** A refused
or failed ref write (not a git work tree, a state folder outside `.trd-state/<slug>`, a
foreign ref, a git failure) falls back to the old file, and the run reports where it went. A
failed push alone is not a fallback: the local ref holds the record and the result says the
push failed. Losing the record of an outward act (a merge already done) is worse than one
more file in the git directory, and every reader still reads the folder.

**The path rule lives in `ship-record-dir.js`, the one module both sides already require.**
It gains: whether a run is held on the ref (`refRun`), reading and writing the run's custody
file wherever it lives, and writing a detached run record (ref first, folder as fallback). The
sequencer still requires `custody.js` lazily only for `detach` and `classifyPath`, as today;
custody never requires the sequencer.

**When two places hold the same run, the later `updatedAt` wins** (adversarial review, finding
1). The ref is normally the newer copy, but a save that fell back to the folder after an
earlier ref write is newer than the ref. Picking by place would load the older cursor and
re-run an outward step such as `release`. So a run's copies (tracked, ref, folder) are compared
by `startedAt` first and `updatedAt` second.

**A run with no tracked `shipped.json` is found on the ref, then by the old pointer** (finding
2). After the merge, on `main` with the worktree gone, `ensure` compares the ref with `main`
and restores nothing. So `loadState` with no tracked file reads the ref's `shipped.json`
locally (never fetched) and accepts it when it is detached and the ref's `record.json`
identity matches the record's own `work`. That is the trust the pointer had: a local file,
keyed by the state folder's name. A save that falls back to the folder also writes the
pointer, exactly as before, so a fallback run stays findable. When both a ref copy and a
pointed-to folder copy exist, the later `updatedAt` wins.

**The ref is read locally on the hot path; only `start --resume` fetches.** `loadState` runs
on every `next` and `record`. `start --resume` reads the ref once without `local`, so a fresh
clone fetches it. The `ensure` that `loadState` already calls (from the previous item) still
fetches when the folder holds no records; that is unchanged. A save from `next`, which only
records which step was handed out, commits to the local ref without pushing; the next save
from `record` pushes both (finding 5).

**A plain start restores from the ref but stays a fresh run.** It deletes a `shipped.json`
only when `ensure` reports `restored` and no `shipped.json` was there before; a worktree's own
`shipped.json` still makes a plain start continue that run, as today (finding 4). It also
deletes a restored `custody.json` that carries a `startedAt` stamp: only an earlier run's
post-merge anchor carries one, and keeping it would anchor the new run at that run's
anchor, not the audited commit (finding 3). This replaces the earlier
decision in `docs/TRD/readers-fall-back-to-the-ref.md` (FIX-004) that a plain start restores
nothing (PM ruling, 2026-11-12). Restoring brings back `closed.json` and `custody.json` so
custody anchors at the audited commit; deleting a restored `shipped.json` keeps the old
guarantee that only `--resume` continues an earlier run. Test (d) changes accordingly.

**Rejected:** writing post-merge records into the worktree folder and calling `write`. It
would leave untracked or staged-deletion files on the merged branch (the problem the detached
folder solved), and `write`'s failure path commits on that branch.

absorbed:     a plain start restores nothing, so custody anchors at HEAD (`ship-sequencer.js:662`) — named in scope by the PM; also the start path this change rewrites  [BLOCKS]
not absorbed: `record-ref.js write` run on a merged worktree would overwrite the ref's detached `shipped.json` with the stale tracked copy — a hazard for "Writers move to the ref" (roadmap item 3), which owns that call; this item works without it
not absorbed: `custody.test.js` flakes on all-digit commit hashes (CLAUDE.md known-open) — unrelated

## Non-Goals

- Moving any other writer to the ref (roadmap item 3), ignore lines or untracking (item 5),
  the cutover proof (item 6), or the `push` primitive pushing the ref (migration step 7).
- Deleting or migrating existing detached folders; they stay readable until no run needs them.
- Changing custody's comparison rules, tiers, links or the sequencer's step logic.
- Changing the shape of `shipped.json` beyond `work.forge_feature_id`, `recordRef`, and the
  `startedAt` stamp on a ref-held `custody.json`.

## Verification Artifacts

None apply — the deliverable is library behaviour proven by Jest against real git
repositories; there is no screen, rendered data, design or flow to compare.

## Verification Environment

**Environment**: local
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: pushing the ref to GitHub itself (tests use a local bare origin); Forge's reader consuming the ref

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a failed ref write fall back to the detached folder, or stop the run? | Fall back and report it (see Decision): the merge already happened, so the record must survive | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `record-ref.js`: add `writeFiles({cwd, slug, files: [{rel, content}], identity, command, step, push})` — commits the given contents onto the ref's tip (overlay kept), compare-and-swap, push when an origin exists (one reconcile on non-fast-forward), never touches the worktree, index or branch, refuses a ref owned by another feature or an identity with neither branch nor feature id; export it | O1, O3 | None | `npx jest packages/core/lib/record-ref.test.js` passes with new cases: a write adds `shipped.json` beside the tip's existing files and `record.json` carries the given branch, not the checked-out one; `git status --porcelain` is empty afterwards; a tip naming another feature is refused and the ref is unchanged; with a bare origin the ref is pushed |
| FIX-002 | `ship-record-dir.js`: the shared rule — `refRun(stateDir)` (the tracked run's copy on the ref: same `startedAt`, detached, identity matching), `writeRunRecord(stateDir, state)` (ref first, detached file as fallback), `readCustody`/`writeCustody` (ref copy stamped with the run, else detached file, else tracked), `custodyPath` naming `<ref>:custody.json` for a ref-held run; `writePointer` kept for reading old folders but no longer called by new code | O1, O2, O6 | FIX-001 | covered by FIX-003 and FIX-004's acceptance; `ship-record-dir.js` requires neither `ship-sequencer.js` nor `custody.js` |
| FIX-003 | `ship-sequencer.js`: detach to the ref through `writeRunRecord` (no pointer); `start` stores `work.forge_feature_id`; `loadState` reads tracked → ref → detached folder; `start --resume` reads the ref with a fetch; plain `start` calls `recordRef.ensure` with the work's branch and removes a restored `shipped.json`; update the header comment and test (d) | O1, O2, O3, O5 | FIX-002 | `npx jest packages/core/lib/ship-sequencer.test.js` passes with: a `merged` record puts `shipped.json` (detached, with `work.branch` and `work.forge_feature_id`) on the ref and no `<common>/ensemble/ship/` folder exists; a fixture detached folder with no ref is read by `status` and resumed by `start --resume`, and its next save lands on the ref; (d) a plain start with a parked run on the ref begins a new run whose `startedAt` differs, with the ref's other files restored; existing cases updated only where they asserted the old folder |
| FIX-004 | `custody.js`: `readCustody`/`writeCustody` through the shared rule; `detach` writes the anchor to the ref for a ref-held run (legacy copy otherwise); header comment | O1, O2, O4, O6 | FIX-002 | `npx jest packages/core/lib/custody.test.js` passes with: after a ref-held detach, `check --link merge` and `--link deploy` resolve the ref's anchor while the tracked `custody.json` names another commit, and a `reconcile` move lands on the ref, not the tracked file; the old-folder cases still pass |
| FIX-005 | `ship-build.seam.test.js` new cases through the CLIs: a full merge-detach run leaves `shipped.json` and `custody.json` on the ref and nothing under `<common>/ensemble/ship/`; a plain start with the folder deleted and `closed.json` only on the ref anchors custody at the audited commit, not HEAD; with `closed.json` nowhere, `read-record` finds none (the gate's refusal input) | O1, O4, O5 | FIX-003, FIX-004 | `npx jest packages/core/lib/ship-sequencer.test.js packages/core/lib/custody.test.js packages/core/lib/ship-build.seam.test.js` passes |
| FIX-006 | Docs and vendoring: `packages/core/commands/ship-build.md` Step 1 (a plain start now restores, dropping `shipped.json`), Step 5 and the readout (after a merge the record is on the ref; `custodyPath` may read `<ref>:custody.json`, read with `git show`); `docs/guides/ship-build.md` §"after the merge"; `CHANGELOG.md` `[Unreleased]`; the surface tests that pin the old wording; copy the changed libraries and command to `.claude/lib/` and `.claude/commands/` | O1, O5 | FIX-003, FIX-004 | `npx jest packages/core/commands packages/core/contracts` passes; `cmp` of each changed `packages/core/lib` file with its `.claude/lib` copy is equal |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/record-ref.js`, `packages/core/lib/record-ref.test.js`
- **Reuse:** `commitOn` (overlay, identity, evidence keep), `swapRef`, `pushOnce`, `reconcile`, `ensureLocal`, `sameFeature`, `identityAt`, `isSafeSlug`, `safeTreePath`, `cleanText` — all in `record-ref.js` [read]; write contents to files in the per-call temp dir so `commitOn`'s `hashFiles` works unchanged [inferred]
- **Replaces:** nothing; `write` is unchanged
- **Follow:** never throw (wrap like `write`); every git call through `git()` with an argument array; one JSON-shaped result `{ok, outcome: 'ref'|'refused'|'failed', commit, push, ...}`
- **Careful:** `commitOn` overlays the tip only when `sameFeature` holds — check identity BEFORE building, or a mismatch silently builds a tree without the tip's files; `ctx.repoPrefix` is only used for `written[].repo` (the fold), which `writeFiles` never calls

### FIX-002
- **Touches:** `packages/core/lib/ship-record-dir.js`
- **Reuse:** `recordDir`, `safeName`, `readPointer`, `currentStartedAt` [read]; `recordRef.read` (local), `recordRef.writeFiles`, `recordRef.sameFeature`, `recordRef.refFor`, `implementState.save` [read]
- **Replaces:** the ref-unaware `custodyPath` as the only custody location rule
- **Follow:** the module's never-throw, null-on-failure style; resolve the git top from the state dir's nearest existing ancestor, as `recordDir` does, because callers pass absolute state dirs from any cwd
- **Careful:** only a state dir that is `<top>/.trd-state/<slug>` can use the ref — anything else (tests use `<tmp>/state`) keeps the old file rule; `record-ref.js` must not require this module (no cycle)

### FIX-003
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`
- **Reuse:** `recordRef.ensure` (already called in `loadState` and `start`), `externalPath`, `matchingDetached`, `parseState` [read]
- **Replaces:** the detached-file write in `saveState`/`record` and every `writePointer` call
- **Follow:** `record` keeps returning `recordPath` and `custodyDetach`; `status` keeps `recordPath` and `custodyPath`
- **Careful:** the tracked `shipped.json` committed before the merge stays and is never written again (it is the merged branch's copy); a plain start must not resume a restored run; outside git or outside `.trd-state/<slug>` the old behaviour holds exactly

### FIX-004
- **Touches:** `packages/core/lib/custody.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `recordDirs.readCustody`/`writeCustody` from FIX-002 [inferred]
- **Replaces:** the local `readCustody`/`writeCustody` file reads at `custody.js:241-255`; the file copy in `detach` for a ref-held run
- **Follow:** custody's refusals stay `{action:'refused', reason}`; `detach` keeps its `{ok, action, path, reason}` shape
- **Careful:** `custody.test.js` flakes on all-digit commit hashes (known open) — not a regression

### FIX-005
- **Touches:** `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** the file's `setup()`, the merge-step `gh` stub, `playPush` [read]
- **Replaces:** nothing
- **Follow:** play the lead through the CLIs, as the file's header says
- **Careful:** start must pass `--branch feature/f` so the ref's identity matches

### FIX-006
- **Touches:** `packages/core/commands/ship-build.md`, `.claude/commands/ship-build.md`, `docs/guides/ship-build.md`, `CHANGELOG.md`, `packages/core/commands/ship-build-surface.test.js`, `packages/core/contracts/ship-primitives.test.js`, `.claude/lib/record-ref.js`, `.claude/lib/ship-record-dir.js`, `.claude/lib/ship-sequencer.js`, `.claude/lib/custody.js`
- **Reuse:** the existing `[Unreleased]` paragraph style in `CHANGELOG.md` [read]
- **Replaces:** the "untracked file under the git common directory" wording in Step 5 and the guide
- **Follow:** `.claude/` copies are byte copies of `packages/core` (`packages/full/lib` holds symlinks already)
- **Careful:** Step 1's gate still reads `closed.json` with `read-record` before `start`; only the "never restore" sentence changes

## Could Not Verify

After the build audit of 2026-11-12 (5 of 5 verifiers reported; O1-O6 and FIX-001 to FIX-006
checked against the code and found built and tested, so they are not listed here):

- No PRD exists for this change (its source is roadmap item 4 of
  `docs/plans/run-records-off-branch/roadmap.md` and the PM's instructions of 2026-11-12), so
  the build audit checked the delivered code against this TRD only. Whether the TRD itself
  carries everything the roadmap brief asked for, and nothing it did not, was not checked.
- Pushing the ref to GitHub and Forge's reader consuming the post-merge `shipped.json`: out of
  scope for this environment. Tests use a local bare origin, and the reader lives in
  forge-vnext.
- `record-ref.js write` (the folder writer) run on a merged worktree would overwrite the ref's
  detached `shipped.json` with the stale tracked copy; "Writers move to the ref" (roadmap
  item 3) must not call it after the detach. Out of scope here (item 3 owns that call); not
  exercised.
