# TRD: writers-move-to-the-ref

**Source PRD**: None — small change decided by the owner's work plan: item 3 of `docs/plans/run-records-off-branch/roadmap.md` ("Writers move to the ref", feature F-3 of workplan run-records-off-branch), brief carried verbatim into `/plan --implement` on 2026-11-12

**Kind**: change · **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every place that commits run records today writes the feature's records ref instead, through `record-ref.js write`: `/implement-trd`'s phase checkpoint, `/audit-build` (report, round ledger, close record, artifact link), `/close-feature`, `/ship-build` Step 5 and each ship step, `/verify-build`'s result, every "store/record … link" commit after an artifact publish, `/plan` (including its sweep chain's commit), `/amend`, `/refine-verification` and `/task`'s close | roadmap item 3 brief | yes |
| O2 | The worktree copy of the run records is git-ignored: `packages/core/templates/gitignore-framework.txt` ignores all of `.trd-state/` except `.trd-state/_docs-audit/`, delivered by the existing `ensure_gitignore`; `.claude/verification-notes.md` and `OWNER-CALLS.md` stay tracked | roadmap item 3 brief | yes |
| O3 | `/implement-trd`'s phase checkpoint commits product code only, still with `git add -A`, and the checkpoint it records names that code commit | roadmap item 3 brief | yes |
| O4 | One write before every COMMAND COMPLETE and COMMAND STUCK banner of a command that touched records, stated once in `.claude/rules/command-status.md`; no write per file save | roadmap item 3 brief; joint decision (10) | |
| O5 | The ship `push` step pushes the feature's records ref beside its branch | roadmap item 3 brief; report Migration step 7 | |
| O6 | `/sweep` and `precompact.js` write the shared ref `refs/ensemble/records/_shared` | roadmap item 3 brief; joint decision (8) | |
| O7 | The scaffold stamps `ensemble.records: "ref"` in `.claude/settings.json`, backfilled with `setdefault` like `ensemble.publishArtifacts` | roadmap item 3 brief; report Migration step 9 | |
| O8 | A fixture run (environment `fixtures`) of `/plan --implement` on a small change leaves no commit on the feature branch that touches only `.trd-state/`, and `git cat-file -p refs/ensemble/records/<slug>:implement.json` shows the finished task list | roadmap item 3, "How it will be checked" | yes |
| O9 | Run records are never committed on the default branch, and a write made there never replaces a feature's ref with one naming the default branch: when a write cannot reach the ref there, the records stay in the worktree as they do today | `/close-feature` §4 and `/audit-build` "Commit" ("On the default branch, don't commit"); reproduction below; adversarial review | yes |
| O13 | `record-ref.js write` never replaces a ref's post-merge `shipped.json` or `custody.json` with an older worktree copy: when the ref's ship record is further along (it records the merge, or more step results) than the worktree's, the ref keeps its own copies of both files | product PM, 2026-11-12, from the audit of "Fold the detached ship record into the ref" (PR #121, merged): this feature makes commands call the writer at every commit point and before every banner, so a merged worktree holding an older folder would otherwise overwrite the post-merge record | yes |
| O12 | A write that moves branch-tracked records onto the ref also commits their removal from the branch (feature branches only, never the shared logs), so the removal does not ride the PR to `main` or block the ship merge step's merge-in; hooks and the ship loop never make a branch commit | adversarial review (reproduced: a staged record removal makes `git merge --no-ff --no-commit main` refuse) | yes |
| O10 | A command restores a feature's folder from its ref before it first writes into `.trd-state/<feature>/`, so a fresh worktree never creates a folder that hides the ref | `docs/TRD/readers-fall-back-to-the-ref.md` `## Decision` ("that writer-side obligation … belongs to item 3") | |
| O11 | Every change is mirrored into `packages/full` and `.claude/`; `docs/reference/` and `CHANGELOG.md` describe it; custody's record-file ignoring and the merge step's record-clash resolution are unchanged; a prose test per touched command names `record-ref.js write` and finds no remaining `git add`/`git commit` of a `.trd-state/` path; `bats packages/core/scripts/scaffold-project.test.sh` covers the ignore lines and the settings key; the full battery is green | roadmap item 3 brief and "How it will be checked" | |

## Intended Change

**Before** (`[read]` 2026-11-12 unless marked; `[ran]` where run). Records reach the branch through
explicit commits and through the `git add -A` checkpoint:

- `/implement-trd` §5.1 records the checkpoint with `$COMMIT_SHA` *before* §5.2 runs `git add -A;
  git commit` (`implement-trd.md:1305-1322`), so the recorded SHA is the previous commit
  (`docs/reference/implement-trd.md:379` already notes the lead must reorder) and the now-dirty
  `implement.json` is then committed in a separate improvised "record phase checkpoint" commit.
- `/audit-build` commits the TRD, `audit-build-report.md` and `closed.json` in one commit
  (`audit-build.md:375-386`), then `artifacts.json` in a second ("store audit report link",
  `:401-410`), and opens its PR only "when … the audit commit above succeeded" (`:413-416`).
- `/close-feature` §4 commits `closed.json` on a non-default branch, then §5 opens the PR "after
  a successful close commit" (`close-feature.md:76-95`).
- `/ship-build` Step 5 commits the state directory by pathspec at the end of the run, and pushes
  it at a `wait` carrying `remoteResume: true` (`ship-build.md:197-218`); the `push` primitive
  pushes the branch only (`contracts/ship-primitive-push.md`, Do step 3); the resume workflow
  template says the parked record "is on the branch" (`templates/github/ensemble-ship-resume.yml:5-7`).
- `/plan` §7a.5 commits `.trd-state/<slug>-sweep/` with the swept fixes (`plan.md:1186-1195`).
- `/verify-build`, `/refine-verification`, `/amend`, `/task` and every command that calls
  `artifacts.js record` say nothing about committing; on `main`, 110 of the last 300 commits
  touched only records, under improvised messages such as "store verification report link" (8)
  and "verification satisfied …" (13) `[ran]` (`git log origin/main`, classified 2026-11-12).
- `/sweep` and `/task` never commit; `precompact.js` appends to `.trd-state/_session-log.md`
  (`precompact.js:266`) and nothing carries it anywhere but a later `git add -A`.
- `gitignore-framework.txt` ignores only scratch (`evidence/`, `findings/`, `judge-*`,
  `record-*`, `setup-decide-*`, `dispatch.jsonl`, `current.json`, `_command-runs/`) and says the
  durable records "stay tracked"; `scaffold-project.test.sh:2912` pins that.
- `ensure_gitignore untrack` (`scaffold-project.sh:1778-1817`) untracks line by line while it
  appends, with a `:(glob)` pathspec per line. Run on `.trd-state/*` it would untrack only
  `.trd-state/`'s direct files — in this repo the tracked shared log `_session-log.md` — which is
  the sibling-branch modify/delete conflict #102's rule exists to avoid. It runs from scaffold,
  `/init-project --force` and `/rebase-project --git-files` (every mode).
- `record-ref.js`'s fold (`:552-567`) untracks branch-tracked records after a write and leaves the
  removal staged; nothing but `/implement-trd`'s `git add -A` would commit it, and a staged
  removal makes `git merge --no-ff --no-commit <base>` refuse (reproduced by the review), which
  `record-files.js:117-119` turns into a stopped merge step. The fold also runs for `--shared`
  writes, and a `push: false` write still falls back to a branch commit when the ref write fails
  (`:705` before `:715`).
- On the default branch the writer stamps `branch: main` into `record.json` (`:661`) and keeps the
  ref's existing files only when the identity matches (`:398`), so a `/close-feature` run on
  `main` would replace a feature's ref with one holding only `closed.json` under `main`.
- `init-project.md:738` says "Do NOT add … `.trd-state/` to gitignore" and `:712-714`,
  `rebase-project.md:151` describe the ignore lines as the per-branch working files only.
- `scaffold-project.sh:1617-1625` backfills `agents_dir`, `publishArtifacts`, `openPullRequest`
  with `setdefault`; there is no `records` key.
- `record-ref.js write` falls back to a branch commit whenever the ref cannot be written or
  pushed, on any branch. `[ran]` In a scratch repo on `main` with an unreachable `origin`,
  `write --state-dir .trd-state/demo` printed `"outcome":"fallback","fallbackReason":"push-failed"`
  and `git log main` gained `records(demo): /close-feature - close`.
- `/close-feature` and `/audit-build` create the feature folder without first calling `ensure`
  (no `record-ref` line in either file); `/implement-trd` (`:190`), `/amend` (`:59`),
  `/verify-build` (`:110`), `/refine-verification` (`:55`), `/task` (`:212`) and `/ship-build`
  (`:71`) already call it in their opening steps.

**After** — checkable:

1. `grep -nE 'git (add|commit).*(\.trd-state|<state-dir>|<work\.stateDir>)' packages/core/commands/*.md packages/core/contracts/*.md`
   finds nothing, `plan.md` §7a.5's commit list names no `.trd-state/` path, and each of `implement-trd`, `audit-build`, `close-feature`, `ship-build`,
   `verify-build`, `plan`, `amend`, `refine-verification`, `task` and `sweep` names
   `record-ref.js write` (plus `contracts/ship-primitive-push.md`); a Jest prose test pins both.
2. In a repo scaffolded by `scaffold-project.sh`, `git check-ignore --no-index` reports
   `.trd-state/<f>/implement.json`, `closed.json`, `artifacts.json`, `.trd-state/_session-log.md`
   and `.trd-state/_sweep/discovered.jsonl` as ignored, and does NOT report
   `.trd-state/_docs-audit/last-run.json`, `.claude/verification-notes.md` or `OWNER-CALLS.md`;
   `--git-files` and scaffold leave every already-tracked record tracked (untracking them is item
   5's cutover, with its ref seeding); the scratch lines still untrack as today;
   `.claude/settings.json` has `ensemble.records == "ref"`, and an owner's other value survives
   `--refresh` (the key is informational, for Forge — no writer reads it).
3. `/implement-trd` Step 5 runs `git add -A; git commit` first, records the checkpoint with that
   commit's id, then `record-ref.js write`. In a fixture run the checkpoint's `commit` equals the
   code commit, and the branch has no records-only commit.
4. `record-ref.js write` on the default branch (or a detached HEAD) never creates a branch
   commit and never untracks anything: a failed push returns `outcome: "ref"`, `push: "failed"`
   (the ref was written locally), and a ref that could not be written returns
   `outcome: "failed"` with `fallbackSkipped: "default-branch"`; `git log main` is unchanged.
   There, a ref whose tip names a different feature is not touched: `outcome: "refused"`,
   reason `identity`. With `--no-fallback` (any branch) the same no-commit rule applies. A
   `--shared` write never untracks. On a feature branch a write that untracked records commits
   that removal by pathspec (`records(<slug>): moved to refs/ensemble/records/<slug>`), after
   which `merge-base-in` against the base succeeds; otherwise the fallback is exactly as before.
5. `precompact.js` with no feature writes `refs/ensemble/records/_shared` locally (no push, no
   network) after appending to `_session-log.md`; `/sweep` writes the shared ref at its end.
6. (Amendment, product PM, 2026-11-12.) With a post-merge `shipped.json` and `custody.json` on
   `refs/ensemble/records/<slug>` (written by the ship sequencer after a merge) and an older,
   pre-merge copy of both left in the worktree's `.trd-state/<slug>/`, a `record-ref.js write`
   leaves the ref holding the post-merge copies of both files, while the folder's other records
   are updated on the ref as usual; when the worktree's copy is the further-along one, it is
   written as before.

## Decision

**`record-ref.js write` is the only way a run record leaves the worktree.** Every explicit record
commit is replaced by `node .claude/lib/record-ref.js write --state-dir .trd-state/<feature>
--command /<name> --step "<what happened>"`, and the one rule for everything else lives in
`.claude/rules/command-status.md`: a command that wrote under `.trd-state/<feature>/` runs one
write immediately before its COMMAND COMPLETE or COMMAND STUCK banner (under `--chained`, before
its RETURN line — the run still ends on someone's banner, and the records must be on the ref by
then); never one per file save; never `git add`/`git commit` of a `.trd-state/` path by hand —
the library's own fallback is the only branch commit of one. The outcome is reported, never
STUCK: `ref` with `push` `pushed` or `no-remote` is silent; `ref` with `push: "failed"`
("the records ref was written here but did not reach origin"), `fallback`, `failed` and
`refused` are each one ISSUES line. The many commands
that only call `artifacts.js record` (`/create-prd`, `/audit-trd`, …) get no edit of their own:
the rule in `command-status.md` covers them, which is what "stated once" asks for. The commands
the brief names get an explicit write at their commit point because that is where they commit
today, and the prose test pins each.

**The ignore lines are `.trd-state/*` and `!.trd-state/_docs-audit/`, and this item untracks
nothing with them.** `*` keeps the `.trd-state` folder itself un-ignored, so the negation can
re-include `_docs-audit/` (`_docs-audit/work/` stays ignored by its own existing line). The
template gains an ignore-only marker: lines after a `# @ignore-only` comment are appended to
`.gitignore` but `ensure_gitignore untrack` never untracks them, and it never untracks a `!`
line. The rest of the loop is untouched. Reason: untracking every record from
`/rebase-project --git-files` or `/init-project --force` is item 5's cutover, which seeds refs for
in-flight features first and leaves finished features readable on `main`; doing it here would
untrack this repo's 732 record files with no ref behind them, and running the existing loop on
`.trd-state/*` would untrack just the shared `_session-log.md` (a sibling-branch
modify/delete conflict). An ignored file that is already tracked stays tracked and `git add -A`
still stages its changes — each feature's own ref write moves it off the branch (below).
Rejected: listing each record filename (a new record file would silently ride the branch), and
a two-pass untrack (correct only at full depth, and then it is item 5).

**A write that untracks records commits that removal, on a feature branch, by pathspec.**
`record-ref.js`'s fold already removes branch-tracked copies from the index after a pushed (or
no-remote) write; this item has it commit exactly those paths
(`git commit -o -m "records(<slug>): moved to refs/ensemble/records/<slug>" -- <paths>`), once per
feature, only when something was tracked. Left staged, the removal reached `main` with the PR
from every command but `/implement-trd`, and it made the ship merge step's merge-in refuse.
A `--shared` write never folds: the shared logs are changed by sibling branches, and #102's rule
keeps their untracking off feature branches.

**Write options, additive, for the callers that must never commit.** `--no-fallback`
(`fallback: false`): a failed ref write or push never becomes a branch commit and never folds —
used by `precompact.js` (a hook must never commit, even when this OS user cannot write the object
store) and by `/ship-build`'s per-step writes between the push and the merge (the merge contract
forbids new commits there, `ship-primitive-merge.md:85`).

**`/implement-trd` Step 5 reorders: commit the code, then record the checkpoint, then write the
ref.** `git add -A` is safe only because the folder is ignored; records still tracked from before
the cutover ride along on that commit as today and are folded out of the index by the ref write
that follows (the next checkpoint commits that removal). Rejected: writing the ref before the
code commit — the checkpoint could not name its own commit.

**On the default branch (or a detached HEAD) the library never commits or untracks, and never
replaces another feature's ref.** That is the rule every command already states for itself ("On
the default branch, don't commit"), and the fallback must not break it: a lost push keeps the local
ref and leaves the records in the worktree, exactly today's default-branch behaviour. And because
the writer stamps the current branch into `record.json`, a write from `main` onto a ref whose tip
names a different feature (`sameFeature` false) is refused with reason `identity` — the records
stay in the worktree, as today, instead of a `closed.json`-only tip under `branch: main` that
Forge's reader would not match. A ref with no tip, or one already written from that branch (a
`/task` run on `main`, `task-<slug>`), is written normally. "Default branch": `origin/HEAD`'s
target when it is set; otherwise any of `main`, `master` and `git config init.defaultBranch` —
an unknown default errs toward no commit (`pull-request.js:16-17`: "never assume `main`").

**PR gates: the close happened, not "the commit succeeded".** `/audit-build` opens its PR when
the audit closed the feature, the run is not `--report-only`, and the TRD-only commit succeeded
when one was needed; `/close-feature` when the close record parses, on a feature branch. The
records write's outcome is reported (ISSUES when not silent) and gates nothing — nothing about
the PR depends on the records being on the branch.

**`/ship-build` writes the ref after each step result until the merge, and at Step 5.** After
the merge the sequencer writes the detached record, which item 4 ("Fold the detached ship record
into the ref", to come) moves to the ref — so this item keeps Step 5's existing "PR already
merged" skip and adds nothing after the merge. The per-step writes pass `--no-fallback`; Step 5's
end-of-run write does not. The `push` primitive writes the ref *before*
`git push -u origin <branch>`, so a fallback commit (push refused) rides out with the branch; for
sweep work its commit pathspec now leaves out every `.trd-state/` path, not just the state
directory (this repo tracks `.trd-state/_session-log.md`). The park push at a `remoteResume` wait
becomes a ref write: `/ship-build --resume` already restores the folder from `origin`'s ref (item
2), so the resume workflow needs only the ref, and its template comment says so. If that write
ends in `fallback`, the branch is pushed as today (the record is in that branch commit); if it
ends `failed`, ISSUES says the remote resume will not find the run.

**Hooks never touch the network and never commit.** `precompact.js` writes `--shared --no-push --no-fallback` after appending to
`.trd-state/_session-log.md` (inside its 5 s budget: two files, local git only; a failure is
swallowed). The feature's own `session-log.md` rides on that feature's next command write. The
shared ref reaches `origin` on `/sweep`'s write, which pushes.

**`ensemble.records: "ref"` is informational.** It tells Forge where a product keeps its records
without probing (report Migration step 9); no Ensemble writer reads it, and `command-status.md`
says so, so an owner who edits it is not misled into thinking it switches the writers.

**This repository dogfoods it.** Its own `.gitignore` gets the two lines (its stale "Do NOT add
.trd-state/" comment is rewritten), and `.claude/settings.json` gets `ensemble.records: "ref"`.
Already-tracked records here stay tracked — untracking them is `/rebase-project`'s cutover
(item 5) — and each feature's next write folds its own.

**Absorbed into this scope:**
```
absorbed:     record-ref.js falls back to committing records on the default branch — every command that moves to it states it never commits there  [BLOCKS]
absorbed:     ensure_gitignore would untrack .trd-state's tracked shared log under the new ".trd-state/*" line — an ignore-only marker keeps the new lines from untracking anything  [BLOCKS]
absorbed:     record-ref.js's fold leaves the removal of branch-tracked records staged — once commands stop committing records, it reaches main with the PR and blocks the ship merge-in  [BLOCKS]
absorbed:     record-ref.js stamps branch: main on a write from the default branch and drops the feature's other files from the ref — /close-feature and /audit-build support running there  [BLOCKS]
absorbed:     a push:false write (the hook) and the ship loop's mid-run writes can still fall back to a branch commit — hooks must never commit, and the merge contract forbids new commits before the merge  [BLOCKS]
absorbed:     record-ref.js folds the shared logs on a feature branch — /sweep's shared write would untrack files sibling branches change  [BLOCKS]
absorbed:     /close-feature and /audit-build create the folder without record-ref.js ensure — once records leave the branch, a fresh worktree's close would hide the ref (handed to this item by readers-fall-back-to-the-ref)  [BLOCKS]
absorbed:     implement-trd records the checkpoint SHA before the commit exists — the code-only checkpoint commit cannot be named otherwise  [BLOCKS]
not absorbed: /amend Step 5 and a fresh /implement-trd as folder creators (named by readers-fall-back-to-the-ref) — both already call ensure in their opening step (amend.md:59, implement-trd.md:190)
not absorbed: retiring custody's ignored class, isRecordFile's per-feature half, the merge step's record-file union — the fallback for features started before the cutover (out-of-scope fence)
not absorbed: seeding refs for in-flight features and reporting untracked files in /rebase-project — item 5, to come
not absorbed: post-merge shipped.json / custody.json on the ref — item 4, to come
not absorbed: status.test.js cannot load mock-fs under Node 26 — environmental (CI runs Node 20)
```

## Non-Goals

- No change to custody's record-file ignoring, `record-files.js`'s `isRecordFile` or the merge
  step's record-clash resolution (fallbacks for features started before the cutover).
- No `/rebase-project` cutover logic (untracking the records, seeding refs, reporting what was
  untracked) — item 5. The new ignore lines untrack nothing; the existing scratch lines untrack as
  today.
- No change to where the post-merge ship record is written — item 4.
- No pruning, no backfill of finished features, no edit to Forge, `verification.md`, `stack.md`
  or `constitution.md`, no release cut.
- No change to `record-ref.js`'s tree layout, `record.json` fields or read/restore/ensure; on a
  feature branch its only change is committing the fold's removal and never folding the shared
  logs.
- No untracking of this repository's own already-tracked records.

## Verification Artifacts

None apply — the work is command prose, one library, one hook, a scaffold script and templates;
no screen, design or data-rendering view is in scope.

## Verification Environment

**Environment**: `local` for the unit, library and prose checks; `fixtures` for O8 (a headless `/plan --implement` session in a scaffolded fixture repo under `.trd-state/writers-move-to-the-ref/evidence/live/work/slot-<n>`)
**Refresh**: `packages/core/scripts/scaffold-project.sh --refresh --plugin-dir packages/full <slot folder>` (about 2 s per slot)
**Cannot be checked there**: `claude --remote` sessions (Claude Code Web pushing or fetching `refs/ensemble/*`) — `verification.md` §5; the fallback path covers it

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | "`/ship-build` Step 5 and each ship step": does each step mean a write after every step result? | Yes: one `--no-fallback` write after each step result until the merge step has run, plus Step 5's ordinary write; a write with nothing changed still pushes, which keeps `origin`'s ref current for a remote resume | no |
| OQ-2 | Should a records write's `fallback` or `failed` outcome stop a command? | No: one ISSUES line, never STUCK (`command-status.md` treats a failed artifact link the same way; the records stay in the worktree) | no |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `record-ref.js write`: (a) on the default branch or a detached HEAD, never fall back to a branch commit and never fold; a lost push returns `outcome: "ref"`, `push: "failed"`; a ref that cannot be written returns `outcome: "failed"`, `fallbackSkipped: "default-branch"`; a tip naming a different feature is refused (`identity`); (b) `fallback: false` / `--no-fallback` gives the same no-commit, no-fold rule on any branch; (c) `--shared` writes never fold; (d) on a feature branch, a fold that untracked paths commits exactly them (`records(<slug>): moved to refs/ensemble/records/<slug>`). Jest cases. Vendor to `.claude/lib/record-ref.js` | O9, O12 | None | Jest: on `main` with an unreachable `origin`, `git log main` and `git ls-files` unchanged, `ref`/`push: failed`; broken object store on `main` → `failed` + `fallbackSkipped`; a feature-branch ref then a write from `main` → `refused`/`identity`, tip unchanged; a fresh `task-x` ref from `main` is written; `--no-fallback` with an unwritable `objects/` on a feature branch → `git log` unchanged; a `--shared` write leaves a tracked `_session-log.md` tracked; a feature branch tracking `implement.json` → after `write`, one new commit removing it and `node record-files.js` `mergeBase` (or `git merge --no-ff --no-commit <base>`) succeeds; `origin/HEAD` → `trunk` makes `trunk` default; no `origin/HEAD` makes `master` default; existing race/fallback cases still pass |
| FIX-002 | Ignore lines and settings key: `gitignore-framework.txt` gains a `# @ignore-only` marker followed by `.trd-state/*` and `!.trd-state/_docs-audit/` (comment rewritten: records live on `refs/ensemble/records/<slug>`; untracking them is `/rebase-project`'s cutover); `ensure_gitignore` appends every line but never untracks a line after the marker or a `!` line; `stamp` backfills `ensemble.setdefault("records", "ref")`; the settings template and `packages/full/.claude/settings.json` gain `"records": "ref"`; this repo's `.gitignore` and `.claude/settings.json` get the same; BATS cases replace "durable records stay tracked" (now: ignored, still tracked) and adjust the line count | O2, O7 | None | `bats packages/core/scripts/scaffold-project.test.sh` passes with cases: every record path listed in After §2 is ignored (`check-ignore --no-index`), `_docs-audit/last-run.json`, `.claude/verification-notes.md` and `OWNER-CALLS.md` are not; after `--git-files` every tracked record (nested, and the shared `_session-log.md`) is still tracked and nothing is staged for them, while the scratch lines still untrack; a second run adds no line; `ensemble.records == "ref"` after scaffold, and an owner's `"branch"` survives `--refresh`; `--refresh` leaves the index unchanged |
| FIX-003 | `command-status.md` (template and `.claude/rules/`): a "Run records go to the records ref" section — ensure before the first write into a folder, one `record-ref.js write` before every COMPLETE/STUCK banner (before RETURN under `--chained`), `--shared` for no-feature logs, never `git add`/`git commit` a `.trd-state/` path, outcome reporting; the "Artifact links" paragraph says the manifest leaves on that write | O4, O10 | None | The section exists in both copies (identical); it names `record-ref.js write` and `record-ref.js ensure`; the Artifact links section no longer implies a commit of `artifacts.json` |
| FIX-004 | `/implement-trd` Step 5: §5.1 `git add -A; git commit` (product code only), `COMMIT_SHA=$(git rev-parse HEAD)`; §5.2 record the checkpoint with it; §5.3 `record-ref.js write --step "phase N checkpoint"`; the final write before every banner and before the `--chained` RETURN; Step 9.0 notes the ref is pushed by its writes; `docs/reference/implement-trd.md` rows updated (the `:379` reorder note retired) | O1, O3, O4 | FIX-003 | Prose: Step 5 orders commit → checkpoint → write; no `git add`/`git commit` of a `.trd-state/` path; `record-ref.js write` named at the checkpoint and before the banners |
| FIX-005 | `/audit-build` and `/close-feature`: `record-ref.js ensure` at the start; replace the report/close-record commit with a TRD-only commit (when the audit fixed a citation, non-default branch) plus `record-ref.js write`; replace the "store audit report link" commit with nothing (the write after `artifacts.js record` carries it); `/close-feature` §4 becomes the write; PR gates: the feature closed, not `--report-only`, the TRD-only commit succeeded when needed (`/close-feature`: the close record parses, feature branch) — the write's outcome is reported, never a gate; NEXT no longer tells the owner to commit records on the default branch; reference docs updated | O1, O9, O10 | FIX-003 | Prose: both name `ensure` and `write`; no `.trd-state/` path in any `git add`/`git commit`; the PR step's condition does not mention the records write |
| FIX-006 | `/ship-build`: Step 4 writes the ref with `--no-fallback` after each step result until the merge step has run; Step 5 becomes an ordinary write (keeping the merged-PR skip); the `remoteResume` park push becomes the write, then a branch push only on `fallback`, an ISSUES line on `failed`; `contracts/ship-primitive-push.md` writes the ref before `git push -u origin <branch>`, and its sweep pathspec leaves out every `.trd-state/` path; `ensemble-ship-resume.yml`'s comment says the record is on the ref and `--resume` restores it | O1, O5, O12 | FIX-001, FIX-003 | Prose: `ship-build.md` and `ship-primitive-push.md` name `record-ref.js write`; no `git add -- <state-dir>`/`git commit … <state-dir>` remains; `ship-primitives.test.js`, `ship-build-surface.test.js`, `ship-build.seam.test.js` and `implement-trd-shipping.test.js` green (updated where they pin the old commit) |
| FIX-007 | `/verify-build`, `/refine-verification`, `/amend`, `/task`, `/plan`: one `record-ref.js write` before each banner (and before `/verify-build --chained`'s RETURN line); `/task`'s close writes the task's ref ("nothing committed" stays true); `/plan` writes before its own banners (not before a hand-off — the chained command writes) and §7a.5 drops `.trd-state/<slug>-sweep/` from the commit list and writes that folder to its ref instead | O1, O4 | FIX-003 | Prose: each file names `record-ref.js write`; `plan.md` §7a.5's `git add`/`git commit` lists hold no `.trd-state/` path; `verify-build-criteria.test.js` and `verify-command-surface.test.js` green |
| FIX-008 | Shared ref: `/sweep` writes `--shared` (its `_sweep/discovered.jsonl`) and its `.trd-state/<slug>-sweep/` folder at its end ("Never commit" stays true); `precompact.js` writes `{ shared, push: false, fallback: false }` after appending to `_session-log.md`, swallowing every failure; Jest case in `precompact.test.js`; mirror to `.claude/hooks/precompact.js`; `docs/reference/hooks.md` row | O6, O12 | FIX-001, FIX-003 | Precompact test: with no feature in flight, after the hook `git rev-parse refs/ensemble/records/_shared` resolves and its tree holds `_session-log.md`, no fetch/push was attempted, `git log` is unchanged even with an unwritable `objects/`, and the hook exits 0 when git is unavailable; `sweep.md` names `record-ref.js write --shared` |
| FIX-009 | Prose test `packages/core/commands/records-ref-writers-prose.test.js`: for every command and ship contract, no `git add`/`git commit` line naming a `.trd-state/` path, `<state-dir>` or `<work.stateDir>`; `plan.md` §7a.5's commit-list sentence names no `.trd-state/` path; each touched command (O1's list, `sweep`, `ship-primitive-push.md`) names `record-ref.js write`; `command-status.md` (template and `.claude/`) carries the rule; every `packages/core/commands/*.md` equals its `.claude/commands/` copy for the touched files | O1, O4, O11 | FIX-003, FIX-004, FIX-005, FIX-006, FIX-007, FIX-008 | `npx jest packages/core/commands/records-ref-writers-prose.test.js` passes, and fails if any one touched command's write line is removed or a `git commit -- .trd-state/x` line is added |
| FIX-010 | `CHANGELOG.md` `[Unreleased]` entry (writers cut over, ignore lines and the ignore-only marker, `ensemble.records`, the library's default-branch, no-fallback, shared-no-fold and fold-commit rules) and remaining `docs/reference/` rows (`README.md`, `other-commands.md` sweep/close/task/verify rows); the init/rebase prose that contradicts the new rule (`init-project.md:712-714,738`, `rebase-project.md:151,1117-1119`, source and `.claude/` copies); full battery | O11 | FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-006, FIX-007, FIX-008, FIX-009 | `npx jest`, `pytest packages/router/tests` and the touched BATS files green, except failures shown to be environmental on this machine (the `cp -RL` skill-template cases and `status.test.js` under Node 26) |
| FIX-011 | Amendment (product PM, 2026-11-12): after merging `origin/main` (item 4, PR #121, which also changed `record-ref.js` and writes the post-merge `shipped.json`/`custody.json` to the ref through `writeFiles`), make `write` keep the ref tip's `shipped.json` and `custody.json` whenever the tip's ship record is further along than the worktree's copy (the tip records a merge result the worktree's does not, or holds more step results), so a folder write never rolls the post-merge record back. Jest case in `record-ref.test.js`. Vendor to `.claude/lib/record-ref.js` | O13 | FIX-001 | Jest: write a post-merge `shipped.json` (and `custody.json`) to the ref with `writeFiles`, leave a pre-merge copy of both in the worktree folder, run `write`; the ref still holds the post-merge `shipped.json` and `custody.json`, and every other worktree record is updated on the ref; when the worktree copy is the further-along one, it wins as before; existing `record-ref` suites and item 4's `ship-sequencer`/`ship-record-dir`/`ship-build.seam` suites green |

## Task Grounding

### FIX-011
- **Touches:** `packages/core/lib/record-ref.js`, `packages/core/lib/record-ref.test.js`, `.claude/lib/record-ref.js`
- **Reuse:** item 4's `writeFiles` (the ship sequencer's own path to the ref) for the test's setup; `commitOn`'s overlay of the tip's tree and `blobAt(top, commit, path)` to read the tip's `shipped.json`; `ship-sequencer.js`'s record shape (`results[]` with each step's primitive and result) to decide "further along" [read]
- **Replaces:** nothing; the folder write's unconditional overwrite of these two files is narrowed [inferred]
- **Follow:** the writer never throws and prints one JSON line; a kept file is reported (additive field, e.g. `kept: ["shipped.json","custody.json"]`)
- **Careful:** read the shape from item 4's code after the merge, not from this description [inferred]; an unparseable tip or worktree `shipped.json` falls back to today's behaviour (worktree wins) rather than throwing; `custody.json` follows `shipped.json`'s decision (the two are one ship record); `--shared` writes are unaffected

### FIX-001
- **Touches:** `packages/core/lib/record-ref.js`, `packages/core/lib/record-ref.test.js`, `.claude/lib/record-ref.js`
- **Reuse:** `currentBranch(top)` (`record-ref.js:136`) for the branch; the `git()` helper (argument array, env scrubbed); the existing `fallback` closure and `fold` call sites in `writeInner` (`:693-735`) are the only two places to gate [read]
- **Replaces:** the unconditional `branchCommit` in `fallback(...)` (`:693-701`), the `push === false` early return that skips nothing on a failed ref write (`:705` runs before `:715`), and the unconditional `fold(...)` after a push (`:722-725`): gated on default branch / detached HEAD / `fallback: false` / `shared`; `fold` gains the pathspec commit of what it untracked [read]
- **Follow:** "default branch" = `git symbolic-ref --quiet refs/remotes/origin/HEAD` stripped of `refs/remotes/origin/` when set; else the set {`main`, `master`, `git config init.defaultBranch`} (an unknown default errs toward no commit — `pull-request.js:16-17`); the identity check reuses `identityAt`/`sameFeature` (`:150-187`) against the tip before building; the fold commit uses `git commit -q -o -m <msg> --pathspec-from-file=- --pathspec-file-nul` like `branchCommit`; CLI `--no-fallback` parsed by `parseArgs`; nothing throws; one JSON line; outcomes keep their names and new fields are additive (`fallbackSkipped`, `foldCommit`)
- **Careful:** `packages/full/lib/record-ref.js` is a symlink — do not replace it with a copy; `.claude/lib/record-ref.js` is a real copy and must equal the core file byte for byte; the identity refusal applies only on the default branch / detached HEAD (on a feature branch a mismatched tip is today's behaviour: the new identity's files replace it — unchanged); the fold commit must not include the user's other staged changes (`-o` with the pathspec); the existing race, fold and fallback tests run on a feature branch — keep them there and update the fold test's expectation (removal now committed)

### FIX-002
- **Touches:** `packages/core/templates/gitignore-framework.txt`, `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/templates/claude-directory/settings.json`, `packages/full/.claude/settings.json`, `.gitignore`, `.claude/settings.json`
- **Reuse:** `append_missing_line` (whole-line match) and the existing `ensure_gitignore` callers (scaffold `untrack`, `--git-files` `untrack`, `--refresh` without) unchanged; the `ensemble.setdefault("publishArtifacts", True)` pattern at `scaffold-project.sh:1621`; the test helpers `_durable_paths`, `_scratch_paths`, `_seed_paths`, `_stamp_json` [read]
- **Replaces:** the template comment that says durable records "stay tracked"; the BATS case "durable run records are never ignored and stay tracked after --git-files" (`:2912`), whose premise this change reverses (now: ignored, still tracked); the line count in "scaffold writes nine ignore lines" (`:2797`) [read]
- **Follow:** the untrack loop (`scaffold-project.sh:1796-1814`) stays as it is except for two skips: once a line equal to `# @ignore-only` has been read, later lines are appended but not untracked, and a line starting with `!` is never untracked; untrack stays staged, never committed, and only under `untrack`; quote every variable; errors warn and return 0
- **Careful:** comment lines are skipped by the reader today (`[[ "$line" == \#* ]] && continue`) — check for the marker before that skip; the marker and the new lines go last in the template; `!.trd-state/_docs-audit/` must come after `.trd-state/*` (later lines win); `.trd-state/*` (not `.trd-state/`) or the negation cannot re-include anything; `.trd-state/current.json` and the other existing lines stay and keep untracking; the BATS case at `:2981` ("not deeper nested paths") still holds for the scratch `dispatch.jsonl` line and stays; this repo's `.gitignore` header comment at `:7-8` says the opposite of the new rule and must be rewritten; do NOT untrack this repo's own records; `packages/full/.claude/settings.json` and the template are separate files and both are read by `generate-hooks-artifacts.sh` — keep them identical

### FIX-003
- **Touches:** `packages/core/templates/claude-directory/rules/command-status.md`, `.claude/rules/command-status.md`
- **Reuse:** the existing "Artifact links" section's shape (rule, fenced command, "Failure is never fatal" paragraph) and the four-section readout rules for where outcomes are reported [read]
- **Replaces:** the implication in "Store the URL and redeploy to it" that the manifest is a branch file; nothing else [read]
- **Follow:** "Write for someone who was not in the session" — name the ref and what it is the first time ("the feature's records ref, `refs/ensemble/records/<slug>`, a git ref that is not a branch"); state the rule once, here, including which outcomes are an ISSUES line (`ref` with `push: "failed"`, `fallback`, `failed`, `refused`) and that `ensemble.records` is informational; `command-status.md` is not owner-governed (`CLAUDE.md` "Approval Requirements" lists constitution, stack, verification only)
- **Careful:** the banner stays the LAST line — the write goes before it, and its outcome line goes into the readout, never after the banner; the chained exception (`/plan --implement`, `/implement-trd --chained`, `/sweep --chained`, `/verify-build --chained`) emits no banner, so the rule names the RETURN line for those

### FIX-004
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `docs/reference/implement-trd.md`
- **Reuse:** the existing `checkpoint(state, N, { commit, review })` call (`implement-trd.md:1305-1312`) unchanged except for its position; `record-ref.js write` CLI as documented in its header (`record-ref.js:20-38`) [read]
- **Replaces:** the §5.1/§5.2 order (state before commit) and the "Commit only — no push here" paragraph's claim that nothing is pushed per phase (the ref write pushes; the branch still is not); `docs/reference/implement-trd.md:379`'s note that the lead must reorder [read]
- **Follow:** heredoc and argument conventions pinned by `command-heredocs.test.js`; banners per `command-status.md`; under `--shipping` the same writes happen (records are not product code)
- **Careful:** a phase with nothing to commit must not abort the write; `$COMMIT_SHA` must be read after the commit (`git rev-parse HEAD`); Step 7.2's end-of-run review commit stays pathspec-only and never names a `.trd-state/` path; `implement-trd-shipping.test.js` and `verify-command-surface.test.js` pin parts of this file — update them only where they pin the old order

### FIX-005
- **Touches:** `packages/core/commands/audit-build.md`, `packages/core/commands/close-feature.md`, `.claude/commands/audit-build.md`, `.claude/commands/close-feature.md`, `docs/reference/other-commands.md`
- **Reuse:** the `record-ref.js ensure` block exactly as `amend.md:57-62` writes it (outcome handling: anything but `present`/`restored` is no record; `failed` is one ISSUES line); `pull-request.js ensure` unchanged [read]
- **Replaces:** `audit-build.md:375-386` (report + close commit → TRD-only commit + write), `:401-410` (manifest commit → covered by the write), the PR gate at `:413-416` (→ closed, not `--report-only`, TRD commit succeeded when needed), the "Closed on the default branch (nothing was committed)" NEXT line at `:497`; `close-feature.md` §4 commit and §5's "after a successful close commit" (→ the close record parses, on a feature branch), and the default-branch NEXT line at `:111` [read]
- **Follow:** the write runs after `closed.json`, the report, `audit-rounds.jsonl` and `artifacts.js record` are all written, so one write carries them; the TRD commit keeps today's "drop the TRD when the audit fixed no citation" rule and the default-branch "do not commit" rule
- **Careful:** `/audit-build` chains `/implement-trd --reconcile` for unbuilt tasks — that chained run writes its own ref before its RETURN; the audit's write must come after the chain returns so the close record and report are on the ref last; a re-audit, a capped audit and `--report-only` still write (they wrote the report)

### FIX-006
- **Touches:** `packages/core/commands/ship-build.md`, `.claude/commands/ship-build.md`, `packages/core/contracts/ship-primitive-push.md`, `.claude/contracts/ship-primitive-push.md`, `packages/core/templates/github/ensemble-ship-resume.yml`, `packages/core/contracts/ship-primitives.test.js`, `packages/core/commands/ship-build-surface.test.js`
- **Reuse:** the merged-PR test already in Step 5 (`gh pr list --head <branch> --state merged …`); `<state-dir>` as the sequencer reports it (`.trd-state/<feature>` or `.trd-state/ship-sweep-<id>`, both valid slugs) [read]
- **Replaces:** `ship-build.md:199-204` (the pathspec commit), `:214-218` (push the state directory at a `remoteResume` wait); `ship-primitive-push.md:28-31`'s "except the state directory" (→ except every `.trd-state/` path); the template comment `ensemble-ship-resume.yml:5-7` [read]
- **Follow:** a ship step's prompt never calls `AskUserQuestion`; a failed write is a `data.issues` line for a primitive, an ISSUES line for the command; per-step writes pass `--no-fallback` because `ship-primitive-merge.md:85` forbids new commits between the push and the merge
- **Careful:** do not touch `ship-sequencer.js`, `ship-record-dir.js` or custody (item 4 owns the post-merge record); `implement-trd-shipping.test.js` and `ship-build.seam.test.js` may assert the old commit text — update the assertion, not the behaviour they guard

### FIX-007
- **Touches:** `packages/core/commands/verify-build.md`, `packages/core/commands/refine-verification.md`, `packages/core/commands/amend.md`, `packages/core/commands/task.md`, `packages/core/commands/plan.md`, and their `.claude/commands/` copies
- **Reuse:** the write line from FIX-003's section, verbatim, with each command's name and step; `/task`'s existing `ensure` at `task.md:212` [read]
- **Replaces:** `task.md:196`'s "Do not commit or push" (becomes "Do not commit; the records write pushes only the task's records ref"); `plan.md:1186-1195`'s `.trd-state/<slug>-sweep/` entry in the commit list (the brake list at `:1188` keeps checking it — it is a list of paths, not a commit) [read]
- **Follow:** `plan.md`'s own banner discipline — a `banner: null` hand-off emits nothing and writes nothing (the chained `/implement-trd` writes); `/verify-build --chained` writes before its `[STATUS: /verify-build] RETURN →` line
- **Careful:** `plan.md` is the file this very run is executing — edit the source and the vendored copy, and keep §7a's step numbering (fix-plan.js's `sweepChainNext` names steps, not numbers, but the prose cross-references them)

### FIX-008
- **Touches:** `packages/core/commands/sweep.md`, `.claude/commands/sweep.md`, `packages/core/hooks/precompact.js`, `packages/core/hooks/precompact.test.js`, `.claude/hooks/precompact.js`, `docs/reference/hooks.md`
- **Reuse:** `precompact.js`'s existing lazy `recordRef` require (`:35`) and its `_session-log.md` path choice (`:62-72`); `write({ shared: true, command, step, push: false, fallback: false, cwd })` (the `fallback` option comes from FIX-001) [read]
- **Replaces:** nothing; adds one call after `fs.appendFileSync` (`:266`) when the log written is `_session-log.md` [read]
- **Follow:** hooks never block, never throw, never touch the network (`docs/reference/hooks.md:450`); `sweep.md:160,206` "Nothing is committed" stays true
- **Careful:** the hook's timeout is 5 s; the write must be skipped (not attempted) when `recordRef` failed to load; `precompact.test.js` must use a real temp git repo for this case (not mock-fs, which breaks real git — the reason `status` got a separate file in item 2)

### FIX-009
- **Touches:** `packages/core/commands/records-ref-writers-prose.test.js`
- **Reuse:** the reading pattern of `packages/core/commands/records-ref-readers-prose.test.js` (item 2's prose test) [read]
- **Replaces:** nothing [read]
- **Follow:** fenced and inline code both count; the regex is line-based: `/git\s+(add|commit)\b.*(\.trd-state|<state-dir>|<work\.stateDir>)/` (in JavaScript; never `[^\n]` inside a shell grep, where it excludes the letter `n`)
- **Careful:** `plan.md`'s brake command lists `.trd-state/<slug>-sweep/` inside `check-never-unattended --files` — that line is not a git add/commit and must not trip the test; `rebase-project.md` mentions `git commit` with no `.trd-state/` path — fine

### FIX-010
- **Touches:** `CHANGELOG.md`, `docs/reference/README.md`, `docs/reference/other-commands.md`, `packages/core/commands/init-project.md`, `packages/core/commands/rebase-project.md`, `.claude/commands/init-project.md`, `.claude/commands/rebase-project.md`
- **Reuse:** the `[Unreleased]` section's existing paragraphs for items 1 and 2 (same voice: what changed, then the CLI) [read]
- **Replaces:** `docs/reference/other-commands.md:135`'s sweep-chain `commit` row text naming `.trd-state/<slug>-sweep/` [read]
- **Follow:** no version bump and no release (the out-of-scope fence: the owner cuts the release)
- **Careful:** the battery's known environmental failures on this machine are the three `cp -RL` skill-template cases and `status.test.js` (mock-fs under Node 26); anything else red is real

## Could Not Verify

- Claude Code Web (`claude --remote`) pushing or fetching `refs/ensemble/*`: not reproducible from this machine (`verification.md` §5). The library's branch-commit fallback covers it on a feature branch; on the default branch the records stay in the worktree, as today.
- Whether the `ensemble-ship-resume.yml` workflow can restore the ref on a real GitHub runner: the template is only a comment change here and its live proof is still open (its own header, SHIP-T002).
- This feature's own records: this `/plan` run executes the pre-change commands, so the early phase checkpoints of this very run may still commit `.trd-state/writers-move-to-the-ref/` on the branch; the fixture run (O8) is the proof, not this branch's history.
