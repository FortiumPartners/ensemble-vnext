# TRD: cutover-for-existing-projects

**Source PRD**: None — small change decided by the owner's work plan: item 5 of `docs/plans/run-records-off-branch/roadmap.md` ("Cutover for existing projects", feature F-5 of workplan run-records-off-branch), brief carried verbatim into `/plan --implement` on 2026-11-12

**Kind**: change · **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `/rebase-project` (and only it, never the scaffold's `--refresh`, a plain scaffold or `--git-files`) untracks, after the ignore lines are delivered, every tracked run-record file under `.trd-state/` that the project's `.gitignore` now ignores: index only, staged, never committed, files kept on disk; `.trd-state/_docs-audit/` stays tracked | roadmap item 5 brief; report Migration step 4 | yes |
| O2 | `/rebase-project` seeds `refs/ensemble/records/<slug>` from each in-flight feature's current state folder, so the ref's `implement.json` equals the folder's. In flight: the folder has `implement.json` and no `closed.json`, or its current ship run (as `ship-record-dir.js resolveRun` decides) has not finished; AND the folder is in a worktree of this repository whose checked-out branch is the branch the folder's records name | roadmap item 5 brief; adversarial review (21 legacy folders in this repo have `implement.json`, no `closed.json`, and merged or deleted branches) | yes |
| O3 | A finished feature gets no ref, and neither does a folder whose recorded branch is not the branch checked out in its worktree; finished records stay readable in `main`'s history | roadmap item 5 brief; Forge N7 | yes |
| O4 | Nothing is committed by the cutover — not the untracking, not the seeding | roadmap item 5 brief ("staged and never committed"; acceptance "nothing was committed") | yes |
| O5 | The seeded ref has the tree layout and `record.json` fields (`forge_feature_id`, `branch`, `slug`) of Forge's reader contract, including the evidence images the folder's verification report references; `branch` is the feature's own branch, and `forge_feature_id` is the folder's own (never the rebase session's `FORGE_FEATURE_ID`) | forge-vnext `docs/TRD/run-records-ref-reader.md` D5/O13, as matched by `record-ref.js` | yes |
| O6 | A ref that already exists (locally or on `origin`), or whose existence on `origin` cannot be checked, is never seeded or overwritten | adversarial review (a stale worktree copy would replace the feature's newer records) | yes |
| O7 | `/rebase-project`'s readout reports which files were untracked, which refs were seeded, and which in-flight features were skipped, with why | roadmap item 5 brief | |
| O8 | A BATS test in `packages/core/scripts/scaffold-project.test.sh` with a fixture repo holding one in-flight and one finished feature proves O1–O4; a prose test on `rebase-project.md` pins the new step; mirrors, `docs/reference/` and `CHANGELOG.md` are updated; the battery stays green | roadmap item 5, "How it will be checked" | |

## Intended Change

**Before** (`[read]` 2026-11-12 unless marked):

- `packages/core/templates/gitignore-framework.txt` already ignores `.trd-state/*` (except
  `!.trd-state/_docs-audit/`), but those lines sit after a `# @ignore-only` marker, so
  `ensure_gitignore untrack` (`scaffold-project.sh:1781-1830`) writes them to `.gitignore` and
  never untracks them: "records already tracked stay tracked until /rebase-project's cutover".
  The cutover itself does not exist yet.
- `/rebase-project` Step 4.7a runs `scaffold-project.sh --git-files .`, which delivers the lines
  and untracks only the scratch lines above the marker (`rebase-project.md:1105-1127`).
- `record-ref.js write` builds the ref from a folder (records, plus the evidence images its
  `verification-report.md` references, plus `shipRecordsToKeep` protection of a further-along ship
  record); its identity is the current branch of the worktree it runs in and `FORGE_FEATURE_ID`
  from the environment; with `fallback: false` it never commits and never folds
  (`record-ref.js:740-905`). `writeFiles` drops evidence images on a new ref (reproduced by the
  adversarial review, `record-ref.js:978-979`, `:484-490`) and is not used here.
- `implement.json` carries `branch` (79 of 79 tracked `implement.json` files in this repo
  `[ran]`); `shipped.json` carries `status` (`running|waiting|stuck|done`), `work.branch`,
  `work.forge_feature_id`; which copy of a ship run is current is `ship-record-dir.js resolveRun`.
- `git ls-files -ci --exclude-standard -- .trd-state` lists exactly the tracked files the ignore
  rules cover and honours the `!.trd-state/_docs-audit/` negation `[ran]` (scratch repo).

**After:**

1. `record-ref.js write` gains one option, `forgeFeatureId` (string or null; when the key is
   given it replaces `process.env.FORGE_FEATURE_ID` for this write). Nothing else in `write`
   changes.
2. A new library `packages/core/lib/records-cutover.js` (vendored to `.claude/lib/`, symlinked in
   `packages/full/lib/`) with `seed({cwd, push})` and CLI `node records-cutover.js seed [--no-push]`,
   printing one JSON line `{ok, seeded:[{slug, worktree, branch, ref, commit, push}],
   skipped:[{slug, worktree, reason}], remoteError?}`, exit 0, never throws. It walks every
   worktree from `git worktree list --porcelain` (skipping bare, prunable and detached ones),
   classifies each `.trd-state/<slug>/` folder there (skipping `_`-prefixed and unsafe slugs), and
   for each in-flight one (O2) whose ref does not exist calls `record-ref.js write` with
   `cwd: <that worktree>`, `fallback: false`, `push`, and `forgeFeatureId` from the folder's own
   `shipped.json` `work.forge_feature_id` (else null), command `/rebase-project`, step
   `cutover seed`. Skip reasons: `finished`, `branch-mismatch`, `no-branch`, `ref-exists`,
   `remote-unknown`, or the write's own refusal/failure.
3. A new strict standalone scaffold mode, `scaffold-project.sh --records-cutover [dir]`:
   delivers the ignore lines (`ensure_gitignore untrack`, as `--git-files` does), then untracks
   (`git rm --cached`, staged, never committed) every path `git ls-files -z -ci --exclude-standard
   -- .trd-state` lists, printing one `Untracked <path>` line each, then runs
   `records-cutover.js seed` from `${SCRIPT_DIR}/../lib/` and prints its JSON line. No other mode
   untracks a record.
4. `/rebase-project` gains Step 4.7b, right after 4.7a, running `--records-cutover`; its report
   carries the untracked files, the seeded refs and the skipped features; its Rollback section
   says how to undo the staged removals and that a pushed ref is not undone by `git restore`.

## Decision

Seed through `record-ref.js write`, run in the feature's own worktree with `fallback: false`. It
already selects the folder's records, adds the images the report references, and keeps a
further-along ship record on the tip; run in the feature's worktree, its identity (the current
branch) is the feature's own branch, so readers on that branch accept the ref (`sameFeature`);
`fallback: false` means it never commits and never folds. NOT `writeFiles`: it loses evidence
images on a new ref. NOT `write` from the rebase's own checkout: its identity would be `main`.
The one addition is an explicit `forgeFeatureId`, so a rebase run inside a Forge session cannot
stamp its own feature id onto other features' refs.

In flight requires the folder's recorded branch to be the one checked out in its worktree: that is
what separates a live feature from the many legacy folders on `main` with `implement.json` and no
`closed.json` (their branches are merged or deleted). A feature whose branch has no worktree is not
seeded; its records fold onto its ref on its own next `record-ref.js write` (record-ref.js
`fold`), so it still crosses over, from that write on.

A ship run's state is read through `ship-record-dir.js resolveRun` (run with that worktree as
cwd), never from the tracked `shipped.json` alone: after a merge the tracked copy is the frozen
pre-merge one.

A ref that exists locally or on `origin` (one `record-ref.js list({remote: true})` per run) is
never re-seeded (`ref-exists`): the feature is already writing its ref and the worktree copy may be
older. When `origin` exists but cannot be listed, the in-flight folders are skipped
(`remote-unknown`) rather than risk a push that reconciles a stale copy over newer records. With no
`origin`, local refs alone decide.

The seed pushes the ref best effort, like every other writer (pushing `refs/ensemble/*` starts no
workflow, proven live in item 1); `--no-push` exists for tests and offline use.

Untrack by `git ls-files -ci --exclude-standard -- .trd-state`, not by globbing the template's
lines: it is exactly "tracked and now ignored", it honours the `!.trd-state/_docs-audit/` negation,
and it covers the shared logs (`_session-log.md`, `_sweep/discovered.jsonl`), which
`refs/ensemble/records/_shared` now carries. The shared ref is not seeded: its writer unions the
log on its next write. Untracking finished features' records too is what the brief asks ("untrack
the per-feature record files"): once the owner commits the removal, those records leave `main`'s
tree and stay readable in its history, at the commits that carried them.

The mode lives in `scaffold-project.sh` (strict, standalone, exclusive with every other mode) so
the BATS acceptance test runs exactly what `/rebase-project` runs. Step 4.7b runs in every mode that
applies changes; `--dry-run` only says the cutover would run (no listing mode is built).

absorbed: none.
not absorbed: an in-flight feature whose branch has no worktree — it crosses over on its own next write; the cutover works without it.

## Non-Goals

- Backfilling refs for finished features; pruning any ref; seeding `refs/ensemble/records/_shared`.
- Untracking anything from `--refresh`, a plain scaffold or `--git-files` (#102's rule).
- Committing the untracking (the owner commits it on the base branch).
- Retiring custody's `ignored` class or the merge step's record-file union (roadmap fence).
- A `--dry-run` listing of what would be untracked or seeded.
- Any change in `forge-vnext`; cutting a release.

## Verification Artifacts

None apply — no screens, data views, designed flows or design boards; the checks are BATS and Jest.

## Verification Environment
**Environment**: local
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: `claude --remote` sessions (verification.md §5)

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add the `forgeFeatureId` option to `record-ref.js write`, and the new `records-cutover.js` library (`seed`, CLI) with Jest tests; vendor to `.claude/lib/`, symlink in `packages/full/lib/` | O2, O3, O4, O5, O6 | None | `npx jest packages/core/lib/records-cutover.test.js packages/core/lib/record-ref.test.js` green, with cases built on a throwaway repo whose `main` worktree holds a legacy folder and whose linked worktree on `feature/x` holds the in-flight folder: the in-flight folder is seeded and `git cat-file -p refs/ensemble/records/<slug>:implement.json` equals the folder's file byte for byte; `record.json` `branch` is `feature/x` although the seed ran from `main`; an evidence image the report references is on the ref; `forge_feature_id` is the folder's own with `FORGE_FEATURE_ID=other` in the env; a folder with `closed.json` gets no ref (`finished`); a folder with `implement.json`, no `closed.json` and a recorded branch that is not its worktree's gets no ref (`branch-mismatch`); `closed.json` + current ship run `status: "running"` is seeded; `waiting`/`stuck` count as unfinished, `done` as finished, and a tracked `running` copy behind a later `done` copy on the ref is finished; an existing ref is skipped `ref-exists` with its tip unchanged; an unreachable `origin` gives `remote-unknown` and no ref; HEAD, index and commit count of every worktree unchanged after seed; non-git cwd prints a refusal and exits 0; `write` without `forgeFeatureId` still reads the env (existing tests green) |
| FIX-002 | Add `--records-cutover` strict mode to `scaffold-project.sh` (deliver lines, untrack tracked-ignored `.trd-state/` paths, run seed); BATS acceptance test | O1, O2, O3, O4, O8 | FIX-001 | `bats packages/core/scripts/scaffold-project.test.sh` green with a new test: fixture repo with the records of one in-flight feature (its branch checked out) and one finished feature committed; after `--records-cutover`, the in-flight feature's ref `implement.json` equals the folder's, the finished one has no ref, `git ls-files .trd-state` lists only `_docs-audit/` paths, the removals are staged (`git diff --cached --diff-filter=D`), files still on disk, commit count unchanged; a test that a plain scaffold, `--git-files` and `--refresh` leave records tracked; `--records-cutover` combined with another mode exits 1 with the error naming `--records-cutover` |
| FIX-003 | `/rebase-project` Step 4.7b, its report lines and Rollback note; prose test; mirror to `.claude/commands/` and `packages/full/commands/plugin-only/`; `docs/reference/other-commands.md`, `CHANGELOG.md` | O1, O7, O8 | FIX-002 | `npx jest packages/core/commands/records-cutover-prose.test.js packages/core/commands/records-ref-writers-prose.test.js` green: `rebase-project.md` names `--records-cutover` in a Step 4.7b placed after 4.7a and before 4.8, says untracking is staged and never committed, says finished features get no ref, its report lists untracked files and seeded refs, and Rollback names `git restore --staged .trd-state`; the three `rebase-project.md` copies are identical; `bats test/integration/tests/runtime-integrity.test.sh` green |
| AMEND-001 | [test-gap] The /rebase-project readout's 'skipped: <slug> (why)' line for in-flight features (objective O7) is built, but no prose test asserts it — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/commands/rebase-project.md:1151 has the line; packages/core/commands/records-cutover-prose.test.js has no assertion on 'skipped') | amendment — no objective recorded | None | [test-gap] The /rebase-project readout's 'skipped: <slug> (why)' line for in-flight features (objective O7) is built, but no prose test asserts it no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/record-ref.js`, `packages/core/lib/record-ref.test.js`, `packages/core/lib/records-cutover.js`, `packages/core/lib/records-cutover.test.js`, `.claude/lib/record-ref.js`, `.claude/lib/records-cutover.js`, `packages/full/lib/records-cutover.js`
- **Reuse:** `record-ref.js` `write` (`cwd`, `fallback: false`, `push`), `list({remote})` (returns `remoteError` when `ls-remote` fails), `isSafeSlug`, `REF_PREFIX`; `ship-record-dir.js` `resolveRun(stateDir, tracked, {local: true})` for the ship run's current copy [read]
- **Replaces:** nothing — no seeding exists today [read]
- **Follow:** record-ref.js conventions: `'use strict'`, `spawnSync` with argument arrays only, one JSON line on stdout, exit 0, never throws; JSDoc header stating WHY; tests build throwaway repos under `os.tmpdir()` like `record-ref.test.js` (linked worktree via `git worktree add`) [read]
- **Careful:** `record-ref.js write` reads `FORGE_FEATURE_ID` at `record-ref.js:798` before this change (`:800` as built); the new option must apply only when the key is present. `resolveRun` resolves `stateDir` against `process.cwd()` — pass an absolute state dir or confirm. `.claude/lib/record-ref.js` stays byte-identical to `packages/core/lib/record-ref.js`; `packages/full/lib/records-cutover.js` is a symlink `../../core/lib/records-cutover.js` like its siblings. `git worktree list --porcelain` paths may be symlinked (macOS `/tmp`): compare realpaths.

### FIX-002
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`
- **Reuse:** `ensure_gitignore untrack` (`scaffold-project.sh:1811` as built, `:1781` before this change), the `--git-files` flag parsing, exclusivity check and dispatch (as built `:115`, `:183-185`, `:2228`; before this change `:104`, `:164-166`, `:2128`) as the pattern; BATS helpers `_seed_paths` and the `--git-files` tests at `scaffold-project.test.sh:2834-2955` [read]
- **Replaces:** nothing; `--git-files` keeps its current behaviour (records stay tracked) [read]
- **Follow:** strict standalone mode, documented in the header comment block like `--git-files`; `info`/`warn` helpers; errors warn and the mode exits 0 except a rejected flag combination (exit 1); lib path `${SCRIPT_DIR}/../lib/records-cutover.js` (works in `packages/core/scripts` and through the `packages/full/scripts` symlink) [read]
- **Careful:** read `git ls-files -z` NUL-separated and pass paths to `git rm --cached --quiet --` in chunks (no shell glob expansion); a missing `node` or lib warns and skips seeding; outside a git repo it delivers the lines and skips untrack and seed.

### FIX-003
- **Touches:** `packages/core/commands/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`, `packages/core/commands/records-cutover-prose.test.js`, `docs/reference/other-commands.md`, `CHANGELOG.md`
- **Reuse:** Step 4.7a's shape and report bullets (`rebase-project.md:1105-1127`); the prose-test style of `packages/core/commands/records-ref-writers-prose.test.js` [read]
- **Replaces:** the sentences in 4.7a and "Recovery is git" saying the ignore-only lines are "never untracked" — now true of 4.7a only; the Rollback section's "exactly one commit's worth" claim (`rebase-project.md:1266-1280`) [read]
- **Follow:** report lines in plain language ("Records cutover: N files untracked (staged, not committed); refs seeded: <slug> on <branch> …; skipped: <slug> (why)"), each `[WARN]` under ISSUES; the NEXT line telling the owner to commit the removal on the base branch is a plain line, not a shell command [read]
- **Careful:** `records-ref-writers-prose.test.js` fails on any code span with `git commit` followed by `.trd-state` in a command file — word the commit step without one; the three copies of `rebase-project.md` must be identical (`runtime-integrity.test.sh:363-364`); CHANGELOG entry under an Unreleased heading, no version bump.

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

State after `/audit-build` (2026-11-12). Five of five verifiers reported; 8 objectives and 3 tasks were checked against the delivered code and tests.

- **Product-requirement validation was not run.** This TRD has no PRD (its source is item 5 of `docs/plans/run-records-off-branch/roadmap.md`), so the audit checked the TRD against the code only; whether the objectives faithfully and completely capture the roadmap brief was not checked.
- Behaviour in a Claude Code Web session (ref push/fetch) — out of scope: `verification.md` §5 lists remote sessions as not reproducible from this machine. The seed then reports `push: failed` and keeps the ref local.
- Whether Forge's N7 needs finished records in `main`'s tree rather than its history — out of scope: it is a question about Forge's reader, not this repository's code. The brief asks for the untracking, which the owner then commits; read here as "readable in history".
