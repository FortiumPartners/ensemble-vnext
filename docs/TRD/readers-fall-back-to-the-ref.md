# TRD: readers-fall-back-to-the-ref

**Source PRD**: None — small change decided by the owner's work plan: item 2 of `docs/plans/run-records-off-branch/roadmap.md` ("Readers fall back to the ref", feature F-2 of workplan run-records-off-branch), brief carried verbatim into `/plan` on 2026-11-12

**Kind**: change · **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every Ensemble reader of a run record named below looks in the worktree first and then at the feature's records ref `refs/ensemble/records/<slug>` (the local ref, else fetched from `origin`), using `record-ref.js`'s `read` and `restore`, so a fresh clone or a re-created worktree with no `.trd-state/<slug>/` still finds the feature's records | roadmap item 2 brief | yes |
| O2 | `implement-state.js` `load` falls back to the ref: with the worktree's `.trd-state/<slug>/` deleted and the ref holding the record, `load(".trd-state/<slug>/implement.json")` returns the ref's task list, and the command's resume continues from it | roadmap item 2 brief and "How it will be checked" | yes |
| O3 | The resume path of `/implement-trd`, `/amend`, `/plan`, `/task`, `/verify-build`, `/refine-verification` and `/ship-build` reaches the ref when the feature's folder is absent | roadmap item 2 brief | yes |
| O4 | `custody.js` (its reads of `closed.json` and `custody.json`), `ship-sequencer.js` and `artifacts.js get` fall back to the ref; a re-created worktree updates an artifact link in place rather than starting a new manifest | roadmap item 2 brief | |
| O5 | The hooks `session-context.js`, `status.js`, `precompact.js` and `router.py` fall back to the LOCAL ref only — no hook ever fetches from the network — and never fail the hook; `router.py` reads the ref with `git cat-file` | roadmap item 2 brief | yes |
| O6 | Behaviour on today's repositories is unchanged: no writer changes, and a missing ref, a missing remote or a git failure reads as "no record", exactly as a missing file does today | roadmap item 2 brief | yes |
| O7 | The full battery stays green: `npx jest`, `pytest packages/router/tests`, and the touched BATS files | roadmap item 2, "How it will be checked" | |

## Intended Change

**Before** (`[ran]`/`[read]` 2026-11-12; line numbers point at the same functions in the delivered code): every reader opens the file in the working tree only.
`implement-state.load()` (`.claude/lib/implement-state.js:46`) is `readFileSync` + `JSON.parse` and
throws ENOENT on a missing file; `custody.js` reads `closed.json` (`reconcile`, `:608`) and `custody.json`
(`readCustody`, `:241`); `ship-sequencer.js` `start` (`:658`) and `loadState` (`:553`) read
`shipped.json`, then the detached record under the git common dir; `artifacts.js` `readText`
(`:55`) returns null on ENOENT, so `get` answers "none" and `record` starts a fresh manifest; the
hooks read `current.json` then the feature's `closed.json` / `implement.json` with `fs`; `router.py`
`feature_in_flight` (`:706`) reads `closed.json` and `implement.json` with `open`. With the
worktree's `.trd-state/<slug>/` deleted, every one of them answers "no record", even when
`refs/ensemble/records/<slug>` holds the folder. `record-ref.js` (item 1, merged in #118) offers
`read` (always fetches when the local ref is missing) and `restore` (refuses any non-empty folder,
checks no identity).

**After** — checkable:

1. With a ref written by `record-ref.js write` from `.trd-state/<slug>/` (holding `implement.json`,
   `closed.json`, `custody.json`, `shipped.json`, `artifacts.json`) and that folder then deleted:
   `implement-state.load` returns the ref's `implement.json`; `custody.js check`/`reconcile` see the
   ref's anchor and `closed.json`; `ship-sequencer.js start --resume` loads the ref's run record
   (`resumed: true`); `artifacts.js get` prints the ref's stored URL and `record` keeps every other
   entry; `session-context.js` shows the Closed:/Impl: line; `router.py feature_in_flight` reports
   the feature closed; `precompact.js` summarises the ref's task list; `status.js` materialises the
   folder without advancing any task.
2. With neither the folder nor the ref: each reader gives exactly today's answer (load throws the
   same ENOENT error; `get` prints nothing; hooks emit what they emit today).
3. A hook run with no local ref and an `origin` holding one does NOT fetch it (the local ref stays
   absent after the hook).
4. A ref whose `record.json` names a different feature (other `forge_feature_id`, or no id and a
   different branch) is never used: the reader answers "no record".

## Decision

**The fallback is per folder, not per file.** When `.trd-state/<slug>/` holds at least one record
file, the worktree is authoritative for every file in it and a file missing there is missing — no
ref lookup. Only when the folder is absent or holds no record file does the ref stand in for the
whole folder. A per-file fallback was rejected: it would mix a worktree `implement.json` with a
ref `closed.json` (a feature read as closed that is not), and it would spend a network fetch on
every ordinary "not written yet" read (custody's `closed.json` check before an audit, `artifacts.js
get` before a first publish). "Record file" is exactly what `record-ref.js` writes to a ref
(`selectFolder`): everything except `dispatch.jsonl`, `implement.lock`, `.DS_Store`, `findings/`,
`evidence/` and atomic-save temp files — because `dispatch-ledger.js` (a hook) writes
`.trd-state/<feature>/dispatch.jsonl` on the first subagent start, before any command reads, and a
folder holding only that must still restore.

**Readers that go on to write into the folder materialise it with `restore`; pure readers use
`read`.** `implement-state.load` (its callers save next), `custody.js`, `ship-sequencer.js`,
`artifacts.js` (`get` and `record` share `readText`), `precompact.js` and every
command's resume step call one new helper, `ensure`, which restores the folder from the ref before
the ordinary file reads run unchanged. `session-context.js` and `router.py`, which never write
records, read single files from the ref in memory. Reason: a writer that reads the ref in memory
and then saves one file creates a folder holding one record — after which `restore` refuses and
the rest of the records (prompts, verification state, discovered items) are unreachable.

**Identity before use (reader contract D5).** Before a ref's content is used, its root
`record.json` must match this session: the same non-null `forge_feature_id` (the
`FORGE_FEATURE_ID` env var), or, when either id is null, the same non-null branch (the current
branch, or the work's own branch where the caller knows it — `ship-sequencer.js` passes
`work.branch`). A ref with no `record.json` or a different identity reads as "no record"
(`outcome: "mismatch"`). This is `record-ref.js`'s existing `sameFeature` rule, reused; slugs repeat
over time, and a reused slug's old `closed.json` must not close a new feature.

**Hooks read the local ref only.** `read` and `restore` gain a `local` option (CLI `--local`) that
skips `ensureLocal`'s fetch. Hooks always pass it; libraries and commands do not. `router.py`
re-implements the read in Python with `git cat-file blob <ref>:<file>` (argument list, 2 s
timeout, `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` scrubbed, slug checked against Forge's rule
`^[A-Za-z0-9][A-Za-z0-9._-]*$` with no `..` before it reaches argv), every failure caught.

**"No ref" and "could not ask" are different answers.** Today `ensureLocal` returns false both
when `origin` has no such ref and when the fetch itself failed (offline, auth, timeout). `ensure`
must tell them apart: no `origin` remote, or a fetch that reports the remote ref does not exist,
is `no-record`; any other fetch failure is `failed`. Both still read as "no record" for the
caller's answer, but a command prints a `failed` in its ISSUES, because a writer that then
creates the folder would hide the ref from every later `ensure` (that writer-side obligation —
ensure before creating a state folder — belongs to item 3, which names `/close-feature`,
`/audit-build`, `/amend` Step 5 and a fresh `/implement-trd` run as folder creators). Reader
fetches use a 15 s timeout, not the writer's 60 s.

**`status.js` is covered by not changing it (OWNER-CALL).** The brief lists it among the hooks
to cover. It only rewrites `implement.json` files that already exist in the worktree
(`status.js:105-122`) and never creates one, so with the folder absent it has nothing of its own
to fall back to; making it restore would put a git restore inside a 5 s SubagentStop timeout and
need a special case so a just-restored file's fresh mtime is not read as a subagent's edit. The
command that is running already restored the folder through its own `ensure` before any subagent
stopped. A test pins that the hook neither creates the folder nor fetches with the folder absent.

**A hook that cannot restore never creates the folder.** `precompact.js` today appends to
`.trd-state/<feature>/session-log.md`, creating the folder if needed. With the folder absent and
`ensure --local` not `restored`, it appends to the existing no-feature log
`.trd-state/_session-log.md` instead, so a hook never leaves a one-file folder that blocks a later
restore. On today's repositories the folder exists and nothing changes.

**`ship-sequencer start` restores only under `--resume`.** With no tracked `shipped.json`, only
`--resume` may continue an earlier run (`ship-sequencer.js:669-670`); `start` without it calls no
`ensure`, so a restored record never turns a fresh start into a resume.

**Library additions to `record-ref.js` (item 1's library), reader-side only — `write` is not
touched:**
- `restore` accepts a folder that exists but holds no record file (today it refuses any non-empty
  folder). It writes the tree into a temporary sibling folder first (one `git cat-file --batch`,
  not a process per file), then moves each file into place, skipping any path that already
  exists; a failure removes the temporary folder and leaves the destination as it was, so a
  restore cut off part-way never leaves a folder that reads as complete. A pre-existing
  `dispatch.jsonl` or `evidence/` file is never touched.
- `restore({ match: true, branch })` checks identity before writing anything (`outcome:
  "mismatch"`).
- `ensure({ stateDir, cwd, local, branch })` → `{ ok, outcome }` with outcome `present` (folder
  already holds records; no git call), `restored`, `no-record` (no ref locally or on `origin`, or
  no `origin`), `mismatch`, `refused` or `failed` (git or the fetch failed — see above).
  Never throws. CLI: `node record-ref.js ensure --state-dir <d> [--local] [--branch <b>]`.
- `readRecord({ stateDir, file, cwd, local, branch })` → `{ found, content, source:
  'worktree'|'ref'|null }`, applying the per-folder rule and the identity check. Never throws.
- `hasRecords(folderAbs)` exported, so every caller uses `selectFolder`'s one definition.

**Absorbed into this scope:**
```
absorbed:     restore refuses a folder holding only dispatch.jsonl — a re-created worktree's first subagent start writes that file, after which no reader could restore  [BLOCKS]
absorbed:     read always fetches when the local ref is missing — hooks must never touch the network  [BLOCKS]
absorbed:     restore checks no identity — a reused slug's ref would restore another feature's closed.json into this one  [BLOCKS]
absorbed:     artifacts.js record (not only get) reads through the fallback — get alone would print the old link, then record would write a one-entry manifest and block every later restore  [BLOCKS]
not absorbed: status.test.js cannot load mock-fs under Node 26 (passes under Node 22, CI uses Node 20) — environmental, the new status case lives in a separate real-git test file
not absorbed: writers that create a state folder without first calling ensure (/close-feature, /audit-build, /amend Step 5, fresh /implement-trd) — item 3 moves every writer and owns this; today the folder is committed, so they cannot hide a ref
not absorbed: ship-build --resume run from a branch other than the work's own, with FORGE_FEATURE_ID unset — identity cannot match; it falls through to the detached record as today (item 4 folds the detached record into the ref)
```

**`/plan`'s resume is `artifacts.js get` and the chained `/implement-trd`.** `/plan` keeps no
run state of its own between invocations: the one prior record it reads is its stored TRD link
(`artifacts.js get`, covered by the artifacts task, FIX-005) and `--implement` resumes through
`/implement-trd` (the command-prose task, FIX-009). Its sweep chain reads only files written earlier in the same run. No prose change to
`plan.md` is needed; the prose test asserts the reasons hold.

**Mirroring.** `packages/core/` is the source; `.claude/lib/`, `.claude/hooks/` and
`.claude/commands/` are byte-identical vendored copies (checked by
`test/integration/tests/vendoring.test.sh` and `record-ref.test.js`'s vendoring case);
`packages/full/` symlinks into `packages/core/`. Every task that edits a source file copies it to
its `.claude/` twin in the same task. `router.py`'s source is `packages/router/hooks/router.py`,
twin `.claude/hooks/router.py`.

## Non-Goals

- No writer changes: nothing new writes a ref; records are still committed on the branch (item 3).
- No ignore lines, no `ensemble.records` settings key (item 3); no change to the detached ship
  record's write path (item 4); no `/rebase-project` seeding (item 5).
- No per-file fallback inside a folder that holds records.
- No network access from any hook.
- No change to `record-ref.js write`, its tree layout or `record.json` fields.

## Verification Artifacts

None apply — no screen, design, data-rendering view or flow is in scope; every criterion is a
library, hook or prose behaviour checked by Jest, pytest and BATS.

## Verification Environment

**Environment**: local (this working tree: `npx jest`, `pytest packages/router/tests`, `bats <file>`)
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: `claude --remote` sessions and GitHub-runner-only failures (`.claude/rules/verification.md` §5)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a hook that writes into the folder materialise it from the local ref, or only read? | `precompact.js` materialises (`ensure --local`) and, when that fails, writes the shared log rather than create the folder; `status.js` is left unchanged (see `## Decision`) | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `record-ref.js` reader additions: `local` option on `read`/`restore` (CLI `--local`); `restore` tolerates a folder holding no record file and on failure removes only what it wrote; `restore({match, branch})` identity check; new `ensure` and `readRecord`; export `hasRecords`; CLI verb `ensure`. Copy to `.claude/lib/record-ref.js` | O1, O5, O6 | None | `npx jest packages/core/lib/record-ref.test.js` passes with new cases: (a) `read --local` with no local ref and an `origin` holding it returns `no-record` and the local ref is still absent afterwards, while `read` without it fetches; (b) `restore` into a folder holding only `dispatch.jsonl` and `findings/x` restores and keeps both files; (c) `restore` into a folder holding `implement.json` is still refused; (d) `restore --match` against a ref whose `record.json` names another branch (no ids) returns `mismatch` and writes nothing; with `FORGE_FEATURE_ID` equal on both sides and different branches it restores; (e) `ensure` returns `present` without running git when the folder holds records (asserted by a cwd that is not a git repo still answering `present`), `restored`, `no-record` (no ref and no remote; and an `origin` that lacks the ref), `failed` with an `origin` URL pointing at a missing path, `mismatch`; (e2) a restore whose blob read fails part-way (simulated by a ref naming a missing blob, or a stubbed `git`) leaves the destination exactly as before — a pre-existing `dispatch.jsonl` and `evidence/a.png` still present, no record file written; (f) `readRecord` returns `source: 'worktree'` when the folder holds records even if the ref has a different file, `found: false` for a file missing in a folder that holds records, `source: 'ref'` when the folder is absent; (g) every new export never throws (called with garbage args); all existing cases pass; `.claude/lib/record-ref.js` byte-identical |
| FIX-002 | `implement-state.load(filePath, opts)`: on ENOENT for a path of the form `<top>/.trd-state/<slug>/<file>`, call `recordRef.ensure` on that folder (passing `opts.local`), and when it returns `restored` read once more; otherwise rethrow the ORIGINAL error. Copy to `.claude/lib/` | O2, O6 | FIX-001 | `npx jest packages/core/lib/implement-state.test.js` passes with: (a) the scenario — temp repo, write `.trd-state/<slug>/implement.json` with two tasks (one `success`, one `pending`) plus `prompts/T2.md`, `record-ref.js write --no-push`, `rm -rf .trd-state/<slug>`, then `load` returns the two tasks, `prompts/T2.md` exists again, and `save` + `load` round-trips; (b) neither folder nor ref: `load` throws an error with `code === 'ENOENT'` and the same message as before this change; (c) malformed JSON in the worktree still throws a SyntaxError (no fallback); (d) a path outside `.trd-state/` gets no git call (non-repo cwd, still ENOENT) |
| FIX-003 | `custody.js`: `reconcile` and `check` call `recordRef.ensure({ stateDir, cwd })` at entry, before `readCustody` (`:241`) and, in `reconcile`, the `closed.json` read (`:608`); `detach` untouched. Copy to `.claude/lib/` | O4, O6 | FIX-001 | `npx jest packages/core/lib/custody.test.js` passes with: (a) a folder holding `closed.json` (with `audit.anchorCommit`) and `custody.json` written to the ref then deleted: `reconcile --set-only` returns `action: 'none'` with the ref's anchor (not `set`), and `check --link pr-head` resolves the ref's anchor; (b) neither: `reconcile` behaves exactly as the existing "no closed.json" case; all existing cases pass |
| FIX-004 | `ship-sequencer.js`: `start` WITH `resume` and `loadState` (so `next`, `record`, `reproof`, `status`) call `recordRef.ensure` before reading `shipped.json`, passing `work.branch` as `branch` in `start`; `start` without `resume` calls no `ensure`. Order stays worktree → ref → detached record. Copy to `.claude/lib/` | O3, O4, O6 | FIX-001 | `npx jest packages/core/lib/ship-sequencer.test.js packages/core/lib/ship-build.seam.test.js` passes with: (a) `shipped.json` (parked run) on the ref, folder deleted: `start --resume` returns `resumed: true` with the ref's status and `next` returns the parked step; (b) neither ref nor tracked file but a detached record: resumes from the detached record exactly as today; (c) neither anything: `start` begins a new run as today; (d) ref holds a parked `shipped.json`, folder deleted, `start` WITHOUT `--resume`: begins a new run (`resumed` absent) and the folder holds no restored `shipped.json`; all existing cases pass |
| FIX-005 | `artifacts.js`: `readText(stateDir)` calls `recordRef.ensure` before its read, so `get` and `record` both see the ref's manifest. Copy to `.claude/lib/` | O3, O4, O6 | FIX-001 | `npx jest packages/core/lib/artifacts.test.js` passes with: (a) manifest with `trd` and `prd` entries on the ref, folder deleted: `get --kind trd` prints the ref's URL; then `record --kind trd --url <new>` leaves `prd` intact and `trd` updated in place; (b) neither: `get` prints nothing and `record` creates a one-entry manifest as today |
| FIX-006 | Hooks `session-context.js` and `precompact.js`: `session-context` reads `closed.json` and the status file through `recordRef.readRecord({ local: true })`; `precompact` calls `recordRef.ensure({ local: true })` for the current feature's folder before reading `implement.json`; when the folder is still absent afterwards it appends to `.trd-state/_session-log.md` instead of creating the folder. `require('../lib/record-ref')` guarded by try/catch (a missing lib means no fallback). Copy both to `.claude/hooks/` | O1, O5, O6 | FIX-001 | `npx jest packages/core/hooks/session-context.test.js packages/core/hooks/precompact.test.js` passes with: (a) real temp repo, `current.json` naming the feature, ref holding `closed.json`, no folder: the banner carries the `Closed:` line; ref holding `implement.json` instead: the `Impl:` line; (b) neither: output identical to today's; (c) a bare `origin` holds the ref and the local ref is absent: no `Closed:` line AND `git rev-parse --verify refs/ensemble/records/<slug>` still fails after the hook (no fetch); (d) precompact with ref and no folder: the appended checkpoint summarises the ref's task counts and `.trd-state/<slug>/implement.json` exists; (d2) precompact with neither: the checkpoint lands in `.trd-state/_session-log.md` and `.trd-state/<slug>/` does not exist; with the folder present: it lands in `.trd-state/<slug>/session-log.md` as today; (e) both hooks exit 0 when git is not on PATH |
| FIX-007 | Hook `status.js`: no code change (see `## Decision`); pin its behaviour with the folder absent. | O5, O6 | FIX-001 | New real-git test file `packages/core/hooks/status-ref.test.js` passes: with `current.json` naming the feature, the local ref and a bare `origin` both holding `implement.json`, and no folder: the hook's output is today's (`no_files` or `no_state`), `.trd-state/<slug>/` still does not exist, and the local ref is not created (no fetch). `git diff --quiet packages/core/hooks/status.js`. Existing `status.test.js` passes under Node 22 (`mock-fs` does not load under Node 26) |
| FIX-008 | `router.py`: `feature_in_flight` — when the feature's folder holds no record file, read `closed.json` and `implement.json` from the local ref with `git cat-file blob`, after the identity check on the ref's `record.json`; every git failure, timeout or parse error reads as "no record"; the hook never fails. Copy to `.claude/hooks/router.py` | O1, O5, O6 | None | `pytest packages/router/tests` passes with new cases using a real temp repo: (a) no folder, local ref holds `closed.json` matching the current branch: `feature_in_flight` returns `""`; (b) ref holds `implement.json` with every task `success`: `""`; one task pending: the feature; (c) neither: the feature (today's answer); (d) ref's `record.json` names another branch: the feature; (e) a slug failing the safe-slug rule makes no git call; (f) git missing from PATH: no exception, today's answer; (g) a remote-only ref is not fetched |
| FIX-009 | Command resume paths call `record-ref.js ensure --state-dir .trd-state/<feature>` before their first state read: `/implement-trd` BEFORE its closed-feature guard (`implement-trd.md:177-210`, which runs in every mode ahead of §1.3, §2.2 and §3.6), `/amend`'s closed-feature guard, `/task`'s Resume (when the worktree scan finds nothing: one `git fetch origin '+refs/ensemble/records/task-*:refs/ensemble/records/task-*'` with a short timeout, then `record-ref.js list` and `read --local` of each `task-*` ref's `implement.json`, then `ensure` the chosen one), `/verify-build --resume`, `/refine-verification`'s inputs, `/ship-build`'s closed gate. One shared sentence: any outcome but `present`/`restored` means "no record" — carry on as today — and a `failed` outcome is one ISSUES line ("records ref could not be fetched"). Copy each to `.claude/commands/` | O3, O6 | FIX-001 | New `packages/core/commands/records-ref-readers-prose.test.js` passes, asserting for each of the six commands that `record-ref.js ensure --state-dir` appears before the FIRST `.trd-state/<feature>/` read anywhere in the file after its argument parsing (for `implement-trd.md`, before the closed-feature guard's `closed.json` check), that `task.md` names the single `task-*` fetch and `read --local`, that `task.md` names `record-ref.js list --remote`, and that `plan.md` still reads its stored link through `artifacts.js get` (the reason `/plan` needs no prose of its own); `command-heredocs.test.js` and the existing command prose tests pass; `.claude/commands/*.md` byte-identical |
| FIX-010 | Docs: a `CHANGELOG.md` `[Unreleased]` paragraph naming the readers that now fall back and the per-folder and identity rules; one short paragraph in `docs/reference/hooks.md` stating hooks read the local records ref only and never fetch | O1, O5 | FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-006, FIX-007, FIX-008, FIX-009 | `CHANGELOG.md` `[Unreleased]` names `implement-state`, `custody`, `ship-sequencer`, `artifacts`, the four hooks and `ensure`; `docs/reference/hooks.md` states "never fetch"; full battery green: `npx jest` (Node 22), `pytest packages/router/tests`, `bats test/integration/tests/vendoring.test.sh test/integration/tests/runtime-integrity.test.sh` |
| AMEND-001 | [test-gap] Identity refusal (a records ref naming another feature reads as no record) not tested through individual JS readers (implement-state.load, artifacts get/record, custody, ship-sequencer, session-context, precompact); tested only in the shared record-ref.js helpers and router.py — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/lib/record-ref.test.js:394,:928,:979,:1013; packages/router/tests/test_router.py:1131; no mismatch case in implement-state.test.js, artifacts.test.js, custody.test.js, ship-sequencer.test.js, session-context.test.js, precompact.test.js) | amendment — no objective recorded | None | [test-gap] Identity refusal (a records ref naming another feature reads as no record) not tested through individual JS readers (implement-state.load, artifacts get/record, custody, ship-sequencer, session-context, precompact); tested only in the shared record-ref.js helpers and router.py no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/record-ref.js`, `.claude/lib/record-ref.js`, `packages/core/lib/record-ref.test.js`
- **Reuse:** `ensureLocal` (`:744`), `resolveRef`, `identityAt` (`:150`), `sameFeature` (`:166`), `currentBranch` (`:136`), `selectFolder` (`:262`) for the record-file definition, `refused()`, test helpers `initRepo`/`initBare`/`withOrigin`/`cloneOf`/`doWrite` in `record-ref.test.js` [read]
- **Replaces:** `restore`'s blanket "already holds files" refusal (now the records-only refusal at `:920`), its per-file `cat-file` loop and its whole-folder `rmSync` on failure (both removed); `ensureLocal`'s single boolean (`:744`) gains a reason [read]
- **Follow:** every git call through `git()` (argument array, env scrubbed); one JSON line per CLI verb, exit 0; nothing throws; `local` is a plain option, defaulting to today's fetching behaviour so item 1's callers and tests are unchanged
- **Careful:** `hasRecords` must not walk `evidence/` (can hold whole fixture repos — `walkFiles` already skips it); `ensure`'s `present` path must make no git call (it runs on every command step); a restore into a folder holding `evidence/` must not clobber a newer worktree image with an older ref copy — skip a path that already exists; the temporary sibling folder must live inside `.trd-state/` (same filesystem, so the move is a rename) and be named so `hasRecords` and `/task`'s scan never mistake it for a feature folder (e.g. `.trd-state/.restore-<slug>-<pid>`)

### FIX-002
- **Touches:** `packages/core/lib/implement-state.js`, `.claude/lib/implement-state.js`, `packages/core/lib/implement-state.test.js`
- **Reuse:** `recordRef.ensure` (FIX-001); `record-ref.test.js`'s temp-repo pattern [read]
- **Replaces:** nothing; `load` gains a catch around its existing `readFileSync` [read]
- **Follow:** `load` keeps throwing on a missing record (documented contract, `:31-45`); the original ENOENT error object is rethrown unchanged so callers that catch ENOENT keep working (`/amend` Step 5 tests `fs.existsSync` first, `amend.md:171`, so it relies on the command-prose step, not on `load`)
- **Careful:** `status.js` requires `implement-state` but uses its own reader — do not route the hook through a fetching `load`; require `record-ref` lazily inside the catch so a plain `load` pays nothing

### FIX-003
- **Touches:** `packages/core/lib/custody.js`, `.claude/lib/custody.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `recordRef.ensure` [read]
- **Replaces:** nothing [read]
- **Follow:** custody's refusals stay `{action:'refused', reason}` shaped; an `ensure` failure is not a refusal — it reads as "no record"
- **Careful:** `custodyPath` may point at the detached record (`ship-record-dir.js:103`) — `ensure` only ever touches `.trd-state/<slug>/`; `custody.test.js` flakes on all-digit commit hashes (CLAUDE.md known-open) — do not mistake that flake for a regression

### FIX-004
- **Touches:** `packages/core/lib/ship-sequencer.js`, `.claude/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`
- **Reuse:** `recordRef.ensure` with `branch: work.branch` [read]
- **Replaces:** nothing; `loadState`'s detached-record fallback (`:559`) stays after the ref [read]
- **Follow:** ship-sequencer never requires custody at load time (lazy requires at `:952`, `:1007`); keep `record-ref` a plain require (it has no dependency on either)
- **Careful:** sweep ship runs use `.trd-state/ship-sweep-<id>/` — a valid slug, same rule

### FIX-005
- **Touches:** `packages/core/lib/artifacts.js`, `.claude/lib/artifacts.js`, `packages/core/lib/artifacts.test.js`
- **Reuse:** `recordRef.ensure` [read]
- **Replaces:** nothing [read]
- **Follow:** malformed JSON still throws (`parseRaw`, never silently replaced)
- **Careful:** callers pass `--state-dir .trd-state/<feature>`; a state dir outside `.trd-state/` gets `refused` from `ensure` and must read exactly as today

### FIX-006
- **Touches:** `packages/core/hooks/session-context.js`, `.claude/hooks/session-context.js`, `packages/core/hooks/session-context.test.js`, `packages/core/hooks/precompact.js`, `.claude/hooks/precompact.js`, `packages/core/hooks/precompact.test.js`
- **Reuse:** `recordRef.readRecord`, `recordRef.ensure` with `local: true`; `closedFeatureLine` (`session-context.js:159`), `summarizeImplement` (precompact) [read]
- **Replaces:** the `fs.existsSync(closedPath)` presence check and `safeReadJson(statusPath)` read in session-context; the `fs.existsSync(guess)` read in precompact, and `sessionLogPath`'s per-feature choice when the folder is absent (`precompact.js:66-72`) [read]
- **Follow:** hooks never block and never throw; `require` paths are `../lib/record-ref` (works in both `packages/core/hooks` and `.claude/hooks`, as `status.js` does for `implement-state`)
- **Careful:** all four hooks start from `.trd-state/current.json`, which is git-ignored, so a fresh clone has none until a command writes it — the fallback matters when `current.json` exists and the folder does not (a command wrote the pointer, or the folder was deleted); the tests set `current.json` by hand for that reason. A `closed.json` present but unparseable on the ref keeps today's "record unreadable" line; the status file path in `current.status` may be absolute or point outside `.trd-state/` — only a `.trd-state/<slug>/<file>` path falls back

### FIX-007
- **Touches:** `packages/core/hooks/status-ref.test.js`
- **Reuse:** `record-ref.test.js`'s temp-repo helpers; `status.js`'s exported `main`/stdin harness as `status.test.js` drives it [read]
- **Replaces:** nothing [read]
- **Follow:** `STATUS_HOOK_DISABLE` unset in the test so the real path runs
- **Careful:** `status.test.js` uses `mock-fs`, which breaks real git, hence the separate file; `status.js` itself is not edited

### FIX-008
- **Touches:** `packages/router/hooks/router.py`, `.claude/hooks/router.py`, `packages/router/tests/test_router.py`
- **Reuse:** `_safe_feature_dir` (`:418`), `derive_feature` (`:577`) [read]
- **Replaces:** nothing; the worktree reads stay first [read]
- **Follow:** `subprocess.run([...], timeout=2, capture_output=True)` with `cwd=root`, never `shell=True`; identity rule identical to `record-ref.js sameFeature`
- **Careful:** `feature_in_flight` already fails toward "in flight" on unreadable state (`return feature`) — the ref path must keep that bias: a ref read error is "no record", never "closed"

### FIX-009
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/commands/amend.md`, `packages/core/commands/task.md`, `packages/core/commands/verify-build.md`, `packages/core/commands/refine-verification.md`, `packages/core/commands/ship-build.md`, `.claude/commands/implement-trd.md`, `.claude/commands/amend.md`, `.claude/commands/task.md`, `.claude/commands/verify-build.md`, `.claude/commands/refine-verification.md`, `.claude/commands/ship-build.md`, `packages/core/commands/records-ref-readers-prose.test.js`
- **Reuse:** the existing state-read sites: `implement-trd.md` closed-feature guard (`:177-210`, the first read in every mode), `amend.md` closed-feature guard (`:51`), `task.md` Resume (`:199`), `verify-build.md` inputs read that `--resume` reaches (`:104`), `refine-verification.md` Inputs (`:50`), `ship-build.md` closed gate (`:83`) [read]
- **Replaces:** nothing [read]
- **Follow:** the command-heredoc convention (`command-heredocs.test.js`); the line is a plain bash block, not prose about a bash block
- **Careful:** do not add a step to `plan.md` (see `## Decision`); `/ship-build --resume` already passes `--resume` to `ship-sequencer start`, which ensures by itself (FIX-004), so its prose step covers only the closed gate that runs before it

### FIX-010
- **Touches:** `CHANGELOG.md`, `docs/reference/hooks.md`
- **Reuse:** the existing `[Unreleased]` paragraph for `record-ref.js` [read]
- **Replaces:** nothing [read]
- **Follow:** "How to talk to the owner": name the thing, then its id
- **Careful:** do not bump the version; the release is the owner's

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

Rewritten by `/audit-build` on 2026-11-12, after delivery. All five verifiers reported; seven
objectives and ten tasks were indexed.

- **Fidelity to product requirements: unchecked.** No PRD exists for this work (it is item 2 of
  `docs/plans/run-records-off-branch/roadmap.md`, carried into `/plan`), so the audit checked the
  delivered code against this TRD only, never against a product source. Whether the objectives
  above capture everything the roadmap item asked for, or add anything it did not, was not checked.
- Weight: the adversarial reviewer judged `small` an undersell for ten tasks across four libraries, three hooks, a Python reader and six command prompts. Kept at `small`: there is one approach, no open product decision, and the review found corrections to how tasks are written, not a misread cause; the heavier `medium` stages (re-authoring and a TRD audit) would re-check the same design. Out of scope for a delivered-code audit: a planning judgement, not a property of the code.
- Behaviour in a `claude --remote` / Claude Code Web session (`.claude/rules/verification.md` §5): whether such a session can fetch `refs/ensemble/*` is item 1's stated gap; a fetch failure there reads as "no record", which is today's answer. Not checkable from this machine.
- End-to-end resume on a real re-created worktree once records stop being committed: that needs item 3's writers; item 6 proves it on a fixture project. Out of scope until those writers exist.
- `/ship-build --resume` run from a branch other than the work's own with `FORGE_FEATURE_ID` unset: the ref's identity cannot match there, so it resumes from the detached record as today. A stated limit (the "not absorbed" list under `## Decision`), not exercised by this audit.
