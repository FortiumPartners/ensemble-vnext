# TRD: records-ref-library

**Source PRD**: None — small change decided by the owner's work plan: item 1 of `docs/plans/run-records-off-branch/roadmap.md` ("Records ref library"), brief carried verbatim into `/plan` on 2026-11-12

**Kind**: change · **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A new library, `packages/core/lib/record-ref.js` (vendored byte-identical to `.claude/lib/record-ref.js`, symlinked from `packages/full/lib/record-ref.js`), writes a feature's run records to the git ref `refs/ensemble/records/<slug>` without changing the checked-out branch, and without touching the real index except to untrack folded records (O5) | roadmap item 1 brief | yes |
| O2 | The ref's commit tree is folder-rooted: its root is the contents of `.trd-state/<slug>/` (every record file, the verification loop's per-iteration files included), plus exactly the images under `evidence/` that the folder's `verification-report.md` references; never `dispatch.jsonl`, `implement.lock`, `findings/`, or any other file under `evidence/` | roadmap item 1 brief; Forge reader TRD D3 ("Folder-rooted: the ref commit's tree root is the state folder's contents") and O13 | yes |
| O3 | Every write adds `record.json` at the tree root holding exactly `forge_feature_id` (the `FORGE_FEATURE_ID` env var when non-empty, else `null`), `branch` (the current branch, `null` when detached) and `slug` — the names Forge's deployed reader parses (`records-ref.ts` `identityFromJson`, reader TRD D5) | roadmap item 1 brief; forge-vnext `origin/main:src/f3/phase-orchestrator/records-ref.ts:280-291` | yes |
| O4 | Each write commits on the previous ref value with a message naming the command and step, and moves the ref by compare-and-swap (`git update-ref <ref> <new> <old>`), retrying a bounded number of times on a lost swap; two writers racing one ref both land, with no file from either lost | roadmap item 1 brief; report §3 "Shape" | yes |
| O5 | After the ref moves, the writer pushes it to `origin` best effort. When the ref cannot be written, or the push is refused or fails, it commits the same records on the branch by pathspec (force-adding ignored paths) and reports which happened; a failure never throws and never fails the caller. On a write whose ref moved and whose push succeeded (or had no `origin` to push to), record files already tracked on the branch are folded into the ref and removed from the index (staged, not committed) | roadmap item 1 brief; joint decisions (2), (3), (6) | yes |
| O6 | The same writer serves the shared ref `refs/ensemble/records/_shared`, whose tree holds `_session-log.md` and `_sweep/discovered.jsonl` (paths relative to `.trd-state/`) | roadmap item 1 brief; joint decision (8) | |
| O7 | `read` returns one file at a ref (local ref, else fetched from `origin`), `list` lists the records refs, `restore` materialises a missing state folder from its ref; every operation is both a module function and a CLI verb that prints one JSON line and exits 0, never throws, and runs git only through `spawnSync` with an argument array | roadmap item 1 brief | yes |
| O8 | Proven live on `islayjames/ship-build-live-test` that pushing a `refs/ensemble/records/*` ref starts no GitHub workflow — once against the repo as it is, and once with a throwaway branch carrying an `on: push` workflow with no branch filter, the probe ref's commit parented on that branch's head — while the throwaway branch's own push does start its run; the throwaway branch and probe refs are deleted afterwards | roadmap item 1 brief, "How it will be checked" (live); joint decision (2) | yes |

## Intended Change

Today nothing in the framework writes a git ref for run records; every record is committed on the
feature branch (`implement-trd.md:1313`'s `git add -A`, `audit-build.md:379`, `close-feature.md:83`,
`/ship-build` Step 5) [read, report §1a]. After this change one library can do the ref write, and
nothing calls it yet — wiring it into commands is item 3 of the plan ("Writers move to the ref"),
and the reader fall-back is item 2 ("Readers fall back to the ref"); both are to come and are not
built here.

Checkable outcome, in a scratch git repository with a bare `origin`:

1. `node .claude/lib/record-ref.js write --state-dir .trd-state/demo --command /implement-trd --step "phase 1 checkpoint"`
   prints one JSON line with `"outcome":"ref"`, `"push":"pushed"`; `git cat-file -p refs/ensemble/records/demo:record.json`
   shows `{"forge_feature_id":null,"branch":"<branch>","slug":"demo"}`; `git cat-file -p refs/ensemble/records/demo:implement.json`
   equals the folder's file; `git status --porcelain` and `git rev-parse HEAD` are unchanged by the call;
   `git ls-remote origin refs/ensemble/records/demo` shows the same commit.
2. With the push refused (a bare origin whose `pre-receive` hook rejects `refs/ensemble/*`), the same call prints
   `"outcome":"fallback"` with a branch commit id, exits 0, and `git show --stat HEAD` lists only the state
   folder's selected files.
3. With no `.git` anywhere, it prints `{"ok":false,"outcome":"refused",...}` and exits 0.

The owner's brief, verbatim (roadmap item 1, "Brief"):

> Add one new library, `packages/core/lib/record-ref.js` (vendored to `.claude/lib/`), that writes, reads and pushes a feature's run records on a git ref, `refs/ensemble/records/<slug>`, without touching the index or the checked-out branch. Nothing calls it yet: wiring it into commands is a later item. A write builds a tree whose root is the feature's state folder `.trd-state/<slug>/` (every file report section 1a lists, including the verification loop's per-iteration files, plus exactly the images under `evidence/` that the folder's `verification-report.md` references; never `dispatch.jsonl`, `implement.lock` or `findings/`), adds a `record.json` at the tree root holding `forge_feature_id` (from the `FORGE_FEATURE_ID` env var, else null), `branch` (the current branch) and `slug`, commits it on the previous ref value with a message naming the command and step, and moves the ref by compare-and-swap (`git update-ref` with the old value), retrying a bounded number of times on a lost swap. It then pushes the ref to `origin` best effort; when the ref cannot be written or the push is refused or fails, it falls back to committing the records on the branch by pathspec as today (force-adding the ignored paths), and reports which happened. Any record files already tracked on the branch (left there by Forge's hand-over or stop commit, or by the fallback) are folded into the ref and removed from the index on the next successful write. The same writer serves one shared ref, `refs/ensemble/records/_shared`, for `.trd-state/_session-log.md` and `.trd-state/_sweep/discovered.jsonl`. It also offers `read` (one file at a ref: local ref, else fetched from `origin`), `list`, and `restore` (materialise a missing state folder from the ref). CLI and module, one JSON line, exit 0, never throws, `spawnSync` with argument arrays only. The ref's tree layout and `record.json` field names are a contract with Forge's deployed reader (forge-vnext `docs/TRD/run-records-ref-reader.md` D5, O13): match them exactly. Before this item closes, prove live, on `islayjames/ship-build-live-test` (environment `github-live-test` in `.claude/rules/verification.md`), that pushing a `refs/ensemble/records/*` ref starts no GitHub workflow: once against the repo as it is, and once with a throwaway branch carrying a workflow whose trigger is `on: push` with no branch filter, pushing a records ref whose commit is parented on that branch's head. Delete the throwaway branch and the probe refs afterwards. Whether a Claude Code Web session can push or fetch such a ref cannot be checked from this machine (`verification.md` §5); record it as a stated gap, and make sure the fallback path covers it.

How the owner said it will be checked, verbatim (roadmap item 1):

> `npx jest packages/core/lib/record-ref.test.js` covering: two writers racing one ref (both writes land, in some order, with no lost file); no git directory (prints a refusal, exits 0); a reader-only OS user simulated by an unwritable `objects/` directory (falls back, does not throw); a refused push (falls back to a branch commit, command not failed); branch-tracked records folded into the ref; `record.json` fields; evidence images included only when the report references them; the `_shared` ref. Live: `gh run list -R islayjames/ship-build-live-test` shows no run whose head SHA is a probe ref's commit, for both probes, while the throwaway branch's own push does show its run (proving the workflow is live).

## Decision

**One library, `record-ref.js`, beside `record-files.js`; a temporary index builds the tree.** Each
write hashes the selected files in one call, `git hash-object -w --no-filters --stdin-paths`
(`--no-filters` so a clean or LFS filter can never turn an image into a pointer file Forge cannot
serve), loads them into a throwaway index named by `GIT_INDEX_FILE` (a file in the OS temp directory,
removed in a `finally`), takes `git write-tree`, then `git commit-tree` and moves the ref with
`git update-ref --stdin` carrying `update <ref> <new> <old>`, or `create <ref> <new>` when the ref does
not exist yet — so creation is itself a compare-and-swap, and no all-zeros value has to be sized to the
repository's hash (SHA-1 or SHA-256). The real index and `HEAD` are never touched on this path. Rejected: `git mktree` per directory level — more calls and more code for the
same tree.

**A write overlays the ref's current tip only when the tip is the same feature; otherwise the tree is
this folder alone.** "Same feature" is Forge's own match rule (reader D5): the tip's `record.json` and
this writer's identity have the same non-null `forge_feature_id`, or, when either id is null, the same
non-null `branch`. When they match, the new tree is the tip's tree with every file this writer
selected laid over it, so a file only the tip has is kept — this is what makes two racing writers of
one feature both land with no lost file (the loser of a swap re-reads the new tip and overlays again),
and a writer cannot tell "a file I never had" from "a file someone deleted". When they do not match
(a slug reused by a later feature — slugs do repeat, reader D5 — or a tip with no `record.json`), the
tree is exactly this folder's selection, still parented on the tip so the history is kept; the old
feature's `closed.json`, `shipped.json` and `custody.json` therefore never reach the new feature's
tree, where Forge would read them as the new feature closed or shipped. Two further rules in both
cases: `evidence/` in the new tree is exactly the images referenced by the new tree's
`verification-report.md` (from this writer's folder, else, when overlaying, from the tip), so an image
only an older report referenced is dropped; and `record.json` is always this writer's.
Rejected: building every write from the folder alone (and proving the race by reachable commits
instead of present files) — the brief's race criterion asks for no lost file.

**The two shared logs are unioned by line, not overwritten.** `_session-log.md` and
`_sweep/discovered.jsonl` are append-only and are union-merged on the branch today (#102). On the
`_shared` ref, when the tip's copy differs from this writer's, the written blob is a three-way
`git merge-file --union -p <ours> <base> <theirs>` — the same tool and "ours, then theirs" order
`record-files.js` uses — with `<base>` the lines both copies hold, in order (common prefix, longest common subsequence of
the differing middle, common suffix); a prefix-only base re-added, on every later write, the lines a
worktree had already received through an earlier union. A line-set comparison was rejected: it drops repeated lines (blank
lines, `---`, identical headings) and splits multi-line entries. The `_shared` ref always overlays
(it belongs to no feature).

**Bounded retry: 5 attempts.** Each lost swap re-reads the tip and rebuilds. Exhausting them is "the ref
cannot be written" and takes the fallback.

**Push, then fold or fall back, in that order.** After the ref moves:
`git push --porcelain origin <ref>:<ref>` with `GIT_TERMINAL_PROMPT=0` and a 60 s timeout. The result's
`push` field is one of `"pushed"`, `"no-remote"`, `"skipped"` (caller passed `push: false`) or
`"failed"`. Outcomes:
- `pushed`, or `no-remote` (no `origin` remote at all: a project with no remote has nowhere a record
  could be lost to, so a branch commit would buy nothing) → fold: `git rm --cached -q` on exactly
  those tracked paths that this write put in the new tree — never an excluded file such as
  `findings/`, `dispatch.jsonl` or `evidence/criterion-covers.json`, which would otherwise leave the
  branch and reach no ref. Staged, never committed. `outcome: "ref"`.
- rejected as non-fast-forward (another clone pushed this ref first) → one reconcile: fetch the remote
  ref into a temporary ref `refs/ensemble/records-tmp/<slug>`, rebuild this write on it (same overlay
  rule, parents the remote tip and the local tip), compare-and-swap the local ref, push once more, and
  delete the temporary ref. Only if that also fails does the write fall back.
- push refused or failed otherwise → fallback: `git add -f -- <selected paths>` then
  `git commit -m <message> -- <selected paths>` (`--only` semantics, so the user's other staged
  changes are neither committed nor unstaged); skip the commit when nothing is staged for those
  paths. `outcome: "fallback"`, `fallbackReason: "push-failed"`. Nothing is folded: the records were
  just committed on the branch, and the next write that pushes folds them.
- the ref could not be written (no write permission on `objects/` or `refs/`, retries exhausted, no
  commit identity) → the same fallback, `fallbackReason: "ref-write-failed"`. When the fallback also
  fails (an unwritable `objects/` blocks a branch commit too; `git commit -- <paths>` refuses during an
  unfinished merge), `outcome: "failed"` with both reasons; still exit 0, still no throw.
Every `add`, `commit` and `rm` runs with `GIT_LITERAL_PATHSPECS=1`, so a file name is never read as a
glob or magic pathspec.
A caller may pass `push: false` (CLI `--no-push`): the ref is written, nothing is pushed, nothing is
folded, no fallback. Not used by this item; it exists so item 3 can choose where pushes happen.

**Slugs follow Forge's rule.** A state folder's basename must match Forge's `SAFE_SLUG_RE`
(`/^[A-Za-z0-9][A-Za-z0-9._-]*$/`, no `..`), or the write is refused (`outcome: "refused"`) — Forge
would never read a ref named otherwise (reader O12), and the name becomes part of a refspec. `_shared`
is the one reserved name and is reached only through the `shared` option, never from a folder name.

**Record selection is "everything except", not an allow-list.** Every regular file under the state
folder, recursively, except: `dispatch.jsonl`, `implement.lock`, anything under `findings/`, anything
under `evidence/` other than referenced images, `implement-state.js`'s atomic-save temp files
(`*.tmp.<pid>.<ms>`), and `.DS_Store`. Symlinks are skipped (never followed out of the folder). Caps:
a file over 10 MB or past the 1000th file is skipped and listed in `skipped`. Reason: report §1a's
table is long and grows (`prompts/*.md`, `report-published.json`), and an allow-list would silently
drop the next record file somebody adds. An image is "referenced" by the rule Forge's artifact reader
uses (forge-vnext `src/f3/pm/artifacts.ts` `extractImageReferences`, ~L207): a Markdown image
`![...](target)`, the target optionally wrapped in `<...>`, percent-decoded once, resolved against the
report's folder; plus, for reports that name a screenshot in prose or code spans, a bare
`evidence/<path>` mention (optionally prefixed by `.trd-state/<slug>/` or `./`). Either way the
resolved path must lie under `evidence/` with no `..` segment, and its extension (matched
case-insensitively) must be `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` or `.svg`. A referenced image
missing from the folder is listed in `missingImages`.

**`read` and `restore` fetch only when the local ref is missing**, into the local ref name itself:
`git fetch --no-tags --no-write-fetch-head origin +<ref>:<ref>`. `restore` refuses a state folder that
already holds files (it never overwrites), and writes every file of the ref except `record.json`.
Both return the ref's `record.json` identity beside the content, so a caller (item 2) can apply the
same-feature rule before trusting it.

**CLI shape** (run from the project root; one JSON line; exit 0 always):
```
node record-ref.js write   --state-dir <dir> --command <name> --step <text> [--no-push]
node record-ref.js write   --shared --command <name> --step <text> [--no-push]
node record-ref.js read    --slug <slug> --file <path-in-tree>
node record-ref.js list    [--remote]
node record-ref.js restore --state-dir <dir>
```

## Non-Goals

- No command, hook, workflow or other library calls `record-ref.js` (item 3, to come).
- No reader falls back to the ref (item 2, to come). `implement-state.js`, `custody.js`,
  `ship-sequencer.js`, `ship-record-dir.js`, `record-files.js` and every hook are unchanged.
- No `.gitignore` or `gitignore-framework.txt` change, no `ensemble.records` settings key, no untrack
  in `/rebase-project` (items 3 and 5, to come).
- No change in `forge-vnext`. No pruning of any ref.
- No edit to `.claude/rules/verification.md`.

## Verification Artifacts

None apply — the feature has no UI, no design frames, no data-rendering screen and no designed
screen-to-screen journey; its proof is the Jest suite and the live GitHub probe (FIX-003).

## Verification Environment

**Environment**: `local` for the Jest suite; `github-live-test` (`islayjames/ship-build-live-test`, the running OS user's `gh` login) for FIX-003's probe
**Refresh**: none declared — tests read the working tree; the live repo is driven directly by `git push` and `gh`
**Cannot be checked there**: `claude --remote` sessions (`verification.md` §5) — whether a Claude Code Web session may push or fetch `refs/ensemble/*`

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | With no `origin` remote configured, should a write fall back to a branch commit? | No: `push: "no-remote"`, the ref write stands and branch-tracked records are folded — a project with no remote has no clone that could lose the records | |
| OQ-2 | Should files under `evidence/` other than referenced images (`live-manifest.jsonl`, `criterion-covers.json`) go on the ref? | No — the brief says "exactly the images ... that the folder's `verification-report.md` references". Raised as a finding for item 2/3: custody's re-proof reads `criterion-covers.json` | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `packages/core/lib/record-ref.js` (module + CLI: `write`, `read`, `list`, `restore`) per `## Decision`; copy it byte-identical to `.claude/lib/record-ref.js`; add the symlink `packages/full/lib/record-ref.js -> ../../core/lib/record-ref.js`; add a CHANGELOG `## [Unreleased]` entry | O1, O2, O3, O4, O5, O6, O7 | None | Run from a scratch repo with a bare origin, `write` prints one JSON line with `outcome:"ref"` and the ref's `record.json` holds exactly the three fields; `HEAD` and `git status --porcelain` are unchanged by the call; with no git directory the CLI prints `outcome:"refused"` and exits 0; the file contains no `exec(`, `execSync(` or `shell: true`; `cmp` of the two copies succeeds and the symlink resolves |
| FIX-002 | Write `packages/core/lib/record-ref.test.js` covering every acceptance case of the brief against real temporary git repositories (no git mocks) | O1, O2, O3, O4, O5, O6, O7 | FIX-001 | `npx jest packages/core/lib/record-ref.test.js` passes with these cases, each able to fail if the behaviour is absent: (a) two writers racing one ref — two concurrent child processes, each with a different file, both `outcome:"ref"`, final tree holds both files; (b) no git directory → `refused`, exit 0, stdout one JSON line; (c) `objects/` and every subfolder of it made unwritable (`chmod 0555` recursively, restored in `afterEach`, skipped when running as root) → `outcome:"failed"` naming both the ref-write and the fallback reason, never a throw, exit 0; (d) a bare origin whose `pre-receive` rejects `refs/ensemble/*` → `outcome:"fallback"`, a new branch commit holding the records, exit 0; (e) records tracked on the branch before the write → after a pushed write they are in the ref's tree and `git ls-files` no longer lists them, while the working copy still has them and no commit was made; (f) `record.json` has exactly `forge_feature_id`, `branch`, `slug`, with `FORGE_FEATURE_ID` set and unset; (g) an image referenced by `verification-report.md` is in the tree and an unreferenced one is not, and `dispatch.jsonl`, `implement.lock`, `findings/x.json` are absent; (h) `write --shared` puts `_session-log.md` and `_sweep/discovered.jsonl` on `refs/ensemble/records/_shared`, and a log the tip extended with repeated lines (blank lines, `---`) keeps every line after a racing write; (i) a slug reused by a different feature (tip `record.json` with another `forge_feature_id`) — the tip's `closed.json` is NOT in the new tree, and the new commit's parent is the old tip; (j) folding leaves a tracked `findings/x.json` and `dispatch.jsonl` still tracked; (k) the fallback with an unrelated file staged — that file is still staged afterwards and absent from the fallback commit; (l) an image referenced only by the tip's older report is dropped when the new report does not reference it; (m) all retries lost (ref moved under the writer on every attempt, e.g. by a stub `update-ref` race helper or a ref locked with a held `<ref>.lock` file) → fallback with `ref-write-failed`; (n) a non-fast-forward push (origin's ref advanced by another clone) reconciles and ends `outcome:"ref"` with both clones' files on the remote ref; plus `read` (local, and from origin in a fresh clone), `list`, `restore` (materialises a deleted folder; refuses a non-empty one), a slug failing Forge's rule is refused, and the `.claude/lib` copy is byte-identical |
| FIX-003 | Live probe on `islayjames/ship-build-live-test` (environment `github-live-test`): prove pushing `refs/ensemble/records/*` starts no workflow, then clean up; record commands, SHAs and `gh run list` output in `.trd-state/records-ref-library/live-ci-probe.md` | O8 | FIX-001 | Probe 1: in a temp clone, seed the probe ref at `main`'s head (`git update-ref refs/ensemble/records/probe-asis-<stamp> <main head>`, so the probe commit's parent is that head), run `record-ref.js write` on a folder `.trd-state/probe-asis-<stamp>/` to add a records commit on it, and push it; after ≥90 s `gh run list -R islayjames/ship-build-live-test --json headSha,event,headBranch` shows no run with that commit as `headSha`. Probe 2: push throwaway branch `probe/records-ref-ci-<stamp>` adding `.github/workflows/probe-any-push.yml` (`on: push`, no branch filter, one `echo` job); confirm a run whose `headSha` is the branch head appears (workflow live); then seed `refs/ensemble/records/probe-branch-<stamp>` at that branch head the same way, write a records commit on it with `record-ref.js write` (its parent is the branch head — check with `git rev-parse <ref>^`), and push it; after ≥90 s no run has the probe commit as `headSha`. Cleanup: delete the throwaway branch and both probe refs on the remote (`git push origin --delete ...`), and `git ls-remote` shows none of them. The Claude Code Web gap is recorded in the probe file as unverifiable here, naming the fallback as its cover |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/record-ref.js` (new), `.claude/lib/record-ref.js` (new), `packages/full/lib/record-ref.js` (new symlink), `CHANGELOG.md`
- **Reuse:** the `git()` helper shape from `packages/core/lib/record-files.js:46-55` (`spawnSync('git', args, {encoding, input, maxBuffer})` returning `{ok, status, out, raw, err}`) [read]; the env scrub in `packages/core/lib/ship-record-dir.js:35-38` (delete `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` before a git call so a caller's environment cannot redirect it — then set `GIT_INDEX_FILE` deliberately for the temp index only) [read]; the "one JSON line, exit 0, even on refusal" CLI contract stated in `record-files.js:17-19` [read]
- **Replaces:** nothing — no ref writer exists today [ran: `grep -rn "refs/ensemble" packages .claude` finds only docs]
- **Follow:** `'use strict'`, CommonJS `module.exports`, a header comment stating WHY and the CLI, as `record-files.js` and `ship-record-dir.js` do; `packages/full/lib/*.js` are symlinks to core (`git ls-files -s` mode 120000) and `.claude/lib/*.js` are byte-identical copies [ran]; Forge's slug rule `SAFE_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/` and `!s.includes('..')` from forge-vnext `records-ref.ts:19,82` [read]; Forge reads identity from `<commit>:record.json` as top-level `forge_feature_id`/`branch` strings (`records-ref.ts:270-291`) [read]; CHANGELOG entries sit under a version heading — add `## [Unreleased]` above `## [4.17.5]` [read]
- **Careful:** `git update-ref` with an empty old value does NOT mean "must not exist" on every git version — pass forty zeros explicitly [inferred]; `git commit-tree` fails with no `user.name`/`user.email` — treat as ref-write-failed and fall back, never inject an identity [inferred]; the temp index must live outside the repo and be removed in a `finally`; `git push` must never prompt (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS` unset is fine) and must be time-bounded (`spawnSync` `timeout`); folded `git rm --cached` must name only files under the state folder (or the two shared paths) — never a pathspec that could widen; the fallback commit uses `--` pathspecs and must not sweep in the user's other staged changes (`git commit -- <paths>` is `--only` semantics) [inferred]; `.trd-state/**/record-*.json` in `.gitignore` does not match the root `record.json` (no dash) [ran]

### FIX-002
- **Touches:** `packages/core/lib/record-ref.test.js` (new)
- **Reuse:** temp-repo test style of `packages/core/lib/custody.test.js` and `record-files.test.js` (real `git init` in `os.tmpdir()`, `spawnSync` git, cleanup in `afterEach`) [read]; byte-identical vendoring assertion precedent `packages/core/lib/design-map.test.js:669` and symlink precedent `merge-up.test.js:116` [read]
- **Replaces:** nothing [ran]
- **Follow:** Jest ^29, run with `npx jest <file>`; set `user.name`/`user.email` with `git config` inside each temp repo, never globally; run the CLI through `spawnSync(process.execPath, [lib, ...args], {cwd})` so stdout/exit code are asserted as a caller sees them
- **Careful:** the race case must start both writers before either finishes (two child processes launched together, e.g. `child_process.spawn` with a shared start file, or loop until a retry is observed) — two sequential calls prove nothing; restore `chmod` in `afterEach` or the temp dir cannot be removed; `custody.test.js` flakes on all-digit commit hashes (CLAUDE.md known issue) — never assert on a hash's shape; the `pre-receive` hook must be executable (`chmod 0755`) in the bare origin

### FIX-003
- **Touches:** `.trd-state/records-ref-library/live-ci-probe.md` (new)
- **Reuse:** `.claude/lib/record-ref.js write` itself to build the probe commits (with `FORGE_FEATURE_ID` unset); `gh run list -R islayjames/ship-build-live-test --json headSha,event,headBranch,createdAt` [ran: repo reachable, viewer permission ADMIN]
- **Replaces:** nothing
- **Follow:** `.claude/rules/verification.md` §1 row `github-live-test` (may write, merges and releases there only) and §1a (one branch and its PR at a time — the throwaway branch is that one); never touch `FortiumPartners/ensemble-vnext`'s remote for this probe [read]
- **Careful:** the repo's `ci.yml` triggers on `push: branches: [main]` and `pull_request` only [ran: read via `gh api`] — probe 1 against it proves the as-is case only, which is why probe 2 adds an unfiltered `on: push` workflow; open no PR from the throwaway branch (a `pull_request` run would muddy the evidence); GitHub may take up to a minute to register a run, so wait before concluding "no run"; delete everything created even when a probe fails

## Could Not Verify

Adversarial review (code-reviewer, 2026-11-12) applied: same-feature rule before overlaying, fold only paths written to the tree, one non-fast-forward reconcile, three-way union for the shared logs, seeded probe refs, Forge's image-reference rule, `update-ref --stdin`, `--no-filters`, literal pathspecs, and seven added test cases. The reviewer judged "small" light for a git library of this size; kept, because the stage it would add (an audit of the TRD) would re-check a design a review has just corrected, and the implementation runs the full end-of-run code review and verification regardless.

- Whether a Claude Code Web (`claude --remote`) session can push or fetch `refs/ensemble/*`: not verifiable from this machine (`verification.md` §5). Covered by design: any failed push takes the branch-commit fallback, and `read`/`restore` report "no record" when the fetch fails. Stays a stated gap until an environment for it is listed.
- A non-fast-forward reconcile is attempted once per write; a remote ref moving again during that one retry still falls back for that write.
- Concurrent writers on the same machine are proven by the race test; writers on two machines pushing one ref are not exercised.
