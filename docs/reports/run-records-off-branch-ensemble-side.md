# Run records off the product branch: Ensemble's side

**Date:** 2026-11-11 · **Kind:** report-only design input, no code change · **For:** the joint
Forge and Ensemble decision on where Ensemble's per-feature run records live. Forge's side is
`docs/reports/run-records-off-branch-forge-side.md` in `forge-vnext`, branch
`feature/8-run-records-off-branch-design` (read from that branch's worktree: on 2026-11-11 the
file was written but not yet committed).

**Run records** here means what Ensemble writes *about* a feature's run rather than its product
code. Today `isRecordFile` (`packages/core/lib/record-files.js`) defines them as anything under
`.trd-state/`, plus `.claude/verification-notes.md` and the root `OWNER-CALLS.md`. Most are
committed on the feature branch and reach `main` with every merge.

## Summary

- **The cost here, measured:** of the last 300 non-merge commits on `origin/main`
  (2026-11-05 to 2026-11-11, head `a01ba5be`), **110 touch only run records** and 231 touch at
  least one. Forge measured 159 of 300 on its own `main`. 104 of the 110 are `chore(...)` commits
  whose only job is to save a record: "store audit report link" (23), "record phase 1
  checkpoint" or "record checkpoint" (14), "store/record verification report link" (11),
  two `chore: auto-commit at session hand-over` commits made by Forge. Any push that carries only
  such commits still runs this repository's full CI on its PR (`ci.yml` triggers on every
  `pull_request`, with no path filter).
- **What 4.17.4 already fixed, and what it did not.** The per-feature framework writes change
  (#102) stopped the *conflicts*: the shared working files (`current.json`, the dispatch ledgers,
  `_command-runs/`) are now git-ignored, and the two shared logs (`_session-log.md`,
  `_sweep/discovered.jsonl`) and `verification-notes.md` are union-merged. It deliberately left
  the per-feature files where they were ("Not moving per-feature files", its Non-Goals). So the
  *commits* — and the CI runs, review noise and Forge's branch-guessing code that come with them —
  are untouched.
- **Recommendation: agree with Forge's option B, a per-feature git ref**, written by one new
  Ensemble library at exactly the points that commit records today, with the working copy
  git-ignored in the worktree. It is the only option that keeps a record after the worktree is
  gone without depending on anyone copying it in time, works with no Forge present, and is a
  generalisation of something Ensemble already does (the detached ship record in the git common
  directory). Two files should stay on the branch: `verification-notes.md` (project knowledge,
  not a run record) and `OWNER-CALLS.md` (Forge writes it, and the owner reviews it).
- **Two things nobody can check from this machine and that decide the push half of B:** whether
  a Claude Code Web session can push and fetch a non-branch ref, and whether pushing such a ref
  starts CI in the products' workflows (§6, questions 2 and 3).

## 1. Every run-record file Ensemble writes

"Committed" says whether the file reaches `main` today. "Forge row" refers to the numbered rows
of section 2 of Forge's report. `<f>` is the feature's state folder, `.trd-state/<feature>/`.

### 1a. Per-feature files, committed today — these are what option B moves

| File | Written by | Read by (Ensemble) | Read by Forge | Committed by |
|---|---|---|---|---|
| `<f>/implement.json` — task list, status, checkpoints | `/implement-trd`, `/amend`, `/plan --implement`, `/task` (all through `implement-state.js`) | `--resume` of every one of those; `/audit-build`, `/verify-build`, `/close-feature`, `/ship-build`; hooks `session-context.js`, `status.js`, `router.py`, `precompact.js`; `pull-request.js` | row 11 (task counts) | phase checkpoint (`git add -A`, `implement-trd.md:1313`) |
| `<f>/closed.json` — the close record, with the audit's anchor commits | `/audit-build` (passing audit), `/close-feature`, `/task` | **custody** (`reconcile` anchors at `audit.anchorCommit`, else `audit.auditedCommit`); `/ship-build` (refuses an unclosed feature); `/amend`, `audit-rounds.js`, `design-map.js`, `session-context.js`, `router.py`; ship primitives `push`, `file-followups` | rows 3, 4, 5, 11, 12 — **gates `done`** | `/audit-build` (`audit-build.md:379`), `/close-feature` (`close-feature.md:83`); `/task` does not commit |
| `<f>/shipped.json` — the ship run record (state, step, PR, merged head, release) | `/ship-build` (`ship-sequencer.js`) | `/ship-build --resume`; `ci-baseline.js`; the `ensemble-ship-resume.yml` workflow template | rows 1, 2, 6–10, 14 — **gates `done`**; mtime used for polling | `/ship-build` Step 5, by pathspec, until the merge |
| `<f>/custody.json` — the custody anchor commit | **custody** (`custody.js reconcile`, the only writer) | custody `check` (pr-head, merge and deploy links), `ship-sequencer.js` | row 1 (custody anchor) | `/ship-build` Step 5 |
| `<f>/verification-state.json` — the functional-verification run, its outcome and per-criterion verdicts | the verify-functional workflow (`functional-verification.js`), run by `/implement-trd` and `/verify-build` | `/refine-verification`, `/verify-build --resume`, `/plan`; **custody** (`--reverified`: which criteria were re-proven); `live-evidence.js`; ship `file-followups` | rows 11, 13, 14 | phase/verification commits, "store verification report link" |
| `<f>/success-definition.md` — the criteria to prove | `/implement-trd`, `/verify-build`, `/plan` | the verification workflow; **custody** (which must-pass criteria a changed path puts in doubt); `spec-scope.js`; verification-check skills | — | as above |
| `<f>/verification-report.md`, `<f>/verification-plan.md` | the workflow; `/refine-verification` (the only writer of the plan) | `/verify-build`, `/refine-verification` | via `artifacts.json` (row 12) | as above |
| `<f>/judge-*-N.json`, `setup-decide-N.json`, `record-*-N.json` — per-iteration scratch of the verification loop | verify-functional workflow | the same workflow on resume (`--resume` with `outcome: null`) | — | swept in by `git add -A` at checkpoints (24 of the 110 records-only commits carry them) |
| `<f>/audit-build-report.md`, `audit-index.json` | `/audit-build` | `/audit-build` next round | via `closed.json` `audit.report` (row 12) | `/audit-build` |
| `<f>/audit-rounds.jsonl` — one line per audit round | `/audit-build` (`audit-rounds.js`) | `/audit-build` (round count, convergence) | row 11 | "store audit report link and round ledger" |
| `<f>/audit-prd-report.md`, `audit-trd-report.md` | `/audit-prd`, `/audit-trd` | the next audit; the owner | via `artifacts.json` | the audit command |
| `<f>/artifacts.json` — the published-artifact links | `artifacts.js record`, called by every document-producing command | the same commands on a later run (to update a link in place) | row 12 | **the single largest source**: 69 of the 110 records-only commits touch it |
| `<f>/discovered.jsonl` — found-but-not-done items | `discovered.js`: `/implement-trd`, `/refine-verification`, ship `collect-findings` | `/refine-verification`, `flaky-ci.js`, ship `file-followups` | — | checkpoints |
| `<f>/prompts/*.md` — assembled task prompts | `/implement-trd`, `/amend` | the phase workflow on resume | — | checkpoints |
| `<f>/session-log.md` | `precompact.js` (hook) | `/pickup-session`, `/handoff-session` | — | checkpoints |
| `<f>/report-published.json` | `/implement-trd` | `/implement-trd` | — | checkpoints |

### 1b. Already off the branch

| File | Written by | Why it is not committed |
|---|---|---|
| `.trd-state/current.json` — which feature this worktree is on | every pipeline command; `/task` | git-ignored since #102. Forge still reads it from a live worktree (row 12) |
| `.trd-state/_command-runs/<session>.json` | `router.py`, `notify-complete.sh` | git-ignored; per session |
| `.trd-state/*/dispatch.jsonl`, `_dispatch.jsonl` | `dispatch-ledger.js` hook | git-ignored |
| `.trd-state/*/evidence/`, `findings/`, `implement.lock` | verification Exercise stage; verify waves; `/implement-trd` | git-ignored (26 evidence files are still tracked from before the rule) |
| `<git common dir>/ensemble/ship/<f>/<startedAt>.json`, `.custody.json`, `current.json` | `ship-sequencer.js`, `custody.js` via `ship-record-dir.js`, from the merge onward | detached so a merged branch is not left with dirty records; shared by every worktree. **This is option B in miniature, without the git object store** |

### 1c. Shared files that are not per-feature

| File | Written by | Read by | Recommendation |
|---|---|---|---|
| `.claude/verification-notes.md` | the verification Exercise agent (it "owns" the file), `/refine-verification`, `verification-setup` skill | every later verification run, `/refine-verification`, `ci-baseline.js` | **Keep on the branch**, union-merged as now. It is the project's accumulated knowledge of how to exercise it, read by every future feature. It is not a run record, and it appears in only 20 of the 110 records-only commits |
| `OWNER-CALLS.md` | not Ensemble: Forge PM sessions write it (the PM charter: "records each as an OWNER-CALL for the owner to review later") | the owner; Forge's conflict briefs only | **Forge's call.** Ensemble only lists it in `isRecordFile` so custody ignores it. Suggest it stays on the branch: it is an owner-facing decision log |
| `.trd-state/_session-log.md`, `_sweep/discovered.jsonl` | `precompact.js` with no feature; `/sweep` | `/pickup-session`; `/sweep`, `flaky-ci.js` | Union-merged since #102. Move with option B to one shared ref (question 8) |
| `.trd-state/_docs-audit/last-run.json` | `/audit-docs` | `/audit-docs` | Written only on the audit's own review branch; leave as is |

**Not run records, and out of scope:** `docs/ui/<slug>/design-map.json` and `canvas.json` (design
documents; #102 classed them the same way), PRDs, TRDs, and `.claude/rules/*`.

### 1d. What reads records from git rather than from the worktree

Inside Ensemble, almost nothing. Every reader above opens the file in the working tree. The two
places Ensemble leans on records being *committed* are indirect:

1. **A fresh clone or another machine.** `--resume` on a Claude Code Web session, a teammate's
   checkout, or a re-created Forge worktree finds `implement.json`, `verification-state.json` and
   `closed.json` only because the branch carries them.
2. **Custody's anchor is a commit that must still exist.** `closed.json` records the audited
   commit; custody fetches it once if missing. That is a code commit, so it is unaffected by
   where the record lives — but the record holding its id must be findable.

Custody's own comparisons ignore record files (`ignored` class, `custody.js:13-15`), and
`/ship-build`'s merge step auto-resolves clashes in them (`record-files.js mergeBase`). Both
are code that exists *because* records travel on the branch, the Ensemble twin of Forge's
section 3. They become fallbacks for old features once records move.

## 2. Options for where records live

The five things the brief asks about, judged against each option:

- **Custody proofs** — can `custody.js` still find the anchor and the close record, and does the
  proof stay "this code was verified"?
- **Resume** — can `--resume` pick up after the worktree, session or machine is gone?
- **Audit history** — can a person (or `/audit-build`'s next round) see what happened on a feature
  after it merged?
- **Claude Code Web** — a remote session starts from a fresh clone of a pushed branch.
- **Multi-account** — Forge runs as root and hands a worktree between spawn OS users; the
  records must be readable and writable by all of them.

### Option 1: a separate records branch (one branch, e.g. `ensemble-records`)

Every feature commits its records to one shared branch with a worktree-free writer
(`git commit-tree` + `update-ref`).

- **Breaks:** concurrency. One ref with many writers means every write is a compare-and-swap that
  loses when a sibling wrote first, and the retry must rebuild the tree including the sibling's
  folder. A pushed shared branch is *a branch*: GitHub Actions `push` triggers on `branches: ['**']`
  would fire on it, and branch protection, PR templates and bots see it.
- **Keeps:** custody, resume, audit history (one place to look), Web if pushing a branch is allowed.
- **Verdict:** a worse version of option 2 — same writer, plus a shared hot spot.

### Option 2: one git ref per feature, not a branch (Forge's option B)

`refs/ensemble/records/<key>`: each write is a new commit whose tree is the feature's state
folder, parented on the previous write, made with `git commit-tree` and `git update-ref <ref>
<new> <old>` (compare-and-swap) without touching the index or the checked-out branch. The working
copy stays in the worktree, git-ignored.

- **Custody proofs:** unaffected. The anchor is a code commit; custody reads `closed.json` and
  `custody.json` from the worktree, falling back to the ref. The `ignored` class and the
  merge-step union become old-feature fallbacks.
- **Resume:** works from any worktree of the same clone (the ref sits in the common directory) and
  after the worktree is deleted. On another clone, only if the ref was pushed and is fetched
  explicitly — the default refspec fetches only branches and tags.
- **Audit history:** better than today per feature — the ref's own commit chain is a log of
  every checkpoint — but no longer visible in `git log main`. Lasts as long as the ref is kept
  (question 5).
- **Claude Code Web:** **unknown.** It needs the session to push and fetch a non-branch ref, and
  the remote session's git access may allow only its own branch. `verification.md` §5 lists
  `claude --remote` as not verifiable from this machine.
- **Multi-account:** the same as the detached ship record today: writes go to the common
  directory's `refs/` and `objects/`, which need group write. `ship-record-dir.js` already
  documents that a common directory shared between OS users "may not be writable by this one";
  Forge says issue 201's permissions cover it (its N6).

### Option 3: git notes

Records attached as notes to the feature's commits, under `refs/notes/ensemble`.

- **Breaks:** notes key on a commit id, and a run record belongs to a *feature*, not a commit —
  every new commit, rebase, merge-up or squash-merge orphans or splits it. All features share one
  notes ref, so it has option 1's single-writer contention, and notes merging (`git notes merge`)
  is manual. Notes are not fetched or pushed by default, and GitHub stopped displaying them.
  Resume and audit history depend on finding the right commit first — the guessing problem Forge
  wants to delete, moved.
- **Keeps:** nothing option 2 does not keep better.
- **Verdict:** rejected.

### Option 4: a local store outside the repository (e.g. `~/.ensemble/<repo-id>/<feature>/`)

- **Breaks:** multi-account (a home directory is per OS user; a Forge hand-over loses the record),
  Web (nothing outside the clone exists there), any second machine, and audit history beyond this
  machine. Root-owned or per-user paths need a repo identity scheme that survives clones.
- **Keeps:** custody and resume on one machine for one user.
- **Verdict:** rejected as the store of record. The git common directory is the right "local"
  place, and option 2 already uses it.

### Option 5: Forge's own store (Forge's option C)

- **Breaks:** Ensemble without Forge — other owners, standalone runs, this repository's own
  development. Custody and resume would need a network call to Forge, and a Forge outage would
  stop a ship. Ensemble would need a local copy anyway, so it is option 2 or 4 plus an upload,
  with two writers to keep consistent.
- **Verdict:** rejected for Ensemble. Forge's snapshot table is the right *cache* on Forge's
  side and should stay one.

### Comparison

|  | Custody | Resume, same clone | Resume, other clone / Web | Audit history | Multi-account | Works without Forge | New structure |
|---|---|---|---|---|---|---|---|
| Today (on the branch) | yes | yes | yes | in `git log main` | yes | yes | — |
| 1 shared records branch | yes | yes | if pushed | one branch | as 2 | yes | branch + contended writer |
| **2 per-feature ref** | yes | yes | if pushed and fetched; Web unknown | per-feature ref log | as today's detached ship record | yes | one ref namespace + writer |
| 3 git notes | fragile | fragile | if pushed and fetched | lost on squash | as 2 | yes | notes ref |
| 4 local store | yes | same user only | no | this machine | **no** | yes | path scheme |
| 5 Forge store | needs Forge | needs Forge | needs Forge | in Forge | yes | **no** | table, API, identity |

## 3. Recommendation: option 2, the per-feature ref

It agrees with Forge's recommendation, for Ensemble's own reasons: it is the only option that
works the same with and without Forge, it keeps git as the one store both sides already read, and
`ship-record-dir.js` has already proven the common-directory half of it in production since
4.17.3. What it adds is git objects instead of loose files, so the record can be pushed, has a
history, and is atomic per write.

**Shape.** One library, `record-ref.js`, beside `record-files.js`:

- `write --state-dir <f>` — builds a tree from the folder's tracked-by-definition files (not
  `evidence/`, `findings/`, locks), commits it on the previous ref value, and moves the ref with a
  compare-and-swap; a lost swap re-reads and retries a bounded number of times. Prints one JSON
  line, never throws, never touches the index. Each record file is already written atomically
  through `implement-state.js` `save(` (temporary file then rename), so the folder is consistent at
  write time.
- `read --key <k> --file <name>` and `list` — for Ensemble's own fallback and for Forge, which can
  equally read the tree directly (`repo-files.ts` already reads a tree at a commit).
- The ref's commit message names the command and step; the tree also carries `work.branch` and
  the feature id, which Forge asks for in every option.

**Where it is called.** At exactly the places that commit records today, and in their place:
`/implement-trd`'s phase checkpoint (which then commits product code only), `/audit-build` (report,
round ledger, close record), `/close-feature`, `/ship-build` Step 5 and each ship step,
`/verify-build`'s result, the "store … link" steps after an artifact publish, and `/task`'s close.
The rule Forge needs (its N4) becomes a single sentence in `command-status.md`: the ref is written
before the `COMMAND COMPLETE` or `COMMAND STUCK` banner.

### Migration steps

1. **Library and tests.** `record-ref.js` with Jest coverage of the compare-and-swap race (two
   writers, one ref), the "no git directory" case, and a reader-only OS user.
2. **Readers fall back to the ref.** `implement-state.js` `load(`, `custody.js`,
   `ship-sequencer.js`, `session-context.js` read the worktree first, then the ref. This ships
   first and changes nothing while records are still committed.
3. **Writers move.** Replace each records commit with `record-ref.js write`. `/implement-trd`'s
   `git add -A` checkpoint stays safe only because step 4 ignores the folder — the two must ship
   in one release.
4. **Ignore lines, through #102's mechanism.** `gitignore-framework.txt` gains the per-feature
   record files (`.trd-state/*/` with the existing exceptions inverted), delivered by
   `ensure_gitignore` on scaffold, `--refresh` and `/rebase-project --git-files`. Untracking
   (`git rm --cached`, staged, never committed) runs only from `/rebase-project`, never from
   `--refresh` — #102's rule, for the same reason: an unattended untrack on one feature branch
   gives a modify/delete conflict against its siblings.
5. **Seed in-flight features.** `/rebase-project` writes a ref from each in-flight feature's
   current folder, so a feature that straddles the cutover has its history from that point on.
   Finished features are not backfilled: their records stay readable on `main` (Forge's N7).
6. **Fold the detached ship record into the ref.** `ship-record-dir.js` keeps reading
   `<common>/ensemble/ship/` for runs started before the switch, and stops writing there.
7. **Push.** The `push` ship primitive pushes the feature's ref beside its branch
   (`git push origin <branch> refs/ensemble/records/<key>`), subject to question 2. `--resume`
   fetches the ref explicitly when the worktree folder is absent.
8. **Retire the branch-only code, later.** Custody's `ignored` class, the merge step's
   record-file union and `isRecordFile`'s per-feature half stay until no live feature predates
   the switch; then they shrink to `verification-notes.md` and `OWNER-CALLS.md`.
9. **Release marker.** A settings key (e.g. `ensemble.records: "ref"`) stamped by the scaffold,
   so Forge knows which location a product uses without probing.

**Cost, estimated:** one new library and its tests; edits to about eight commands and four
libraries; one template line set. No schema change to any record file.

## 4. Open questions that need a joint decision with Forge

1. **What the ref is keyed by.** Ensemble knows the state-folder slug; Forge keys features by id
   and branch. A slug can repeat across time (`/task` adds `-2`), a branch can be re-cut. Proposal:
   `refs/ensemble/records/<slug>`, with `work.branch` and, when Forge sets it, the Forge feature id
   inside every write; Forge stores the ref name on the feature (as it stores `state_slug` today).
2. **Push to `origin`, or local only?** Pushed refs survive a deleted clone and reach other
   machines; local refs avoid touching the remote at all. If pushed: who pushes (Ensemble's `push`
   primitive, Forge's hand-over, both?), and does a non-branch ref push start CI in Storybook's
   and BD4's workflows? (`on: push` without a `branches` filter is the case to check.)
3. **Claude Code Web.** Can a remote session push and fetch `refs/ensemble/*`? If not, Web runs
   would keep committing records on their branch (a per-session fallback), and the cutover must
   say so. This cannot be verified from this machine.
4. **What stays on the branch.** Proposed: `verification-notes.md` and `OWNER-CALLS.md`. Does the
   owner also want the audit report (`audit-build-report.md`) visible in `main`'s tree, or is a link
   in `closed.json` and the artifact enough?
5. **Retention.** Keep every ref forever (they are small), prune N days after merge, or fold
   merged features into one archive ref? Forge reads them for done, metrics and dependency gates
   after merge; Ensemble's `/audit-docs` and the owner read them for history.
6. **Forge's own record commits.** Forge's hand-over commit (`git add -A`) and finished-session
   backstop commit whatever is in `.trd-state/`. Once ignored, they commit nothing there. Should
   Forge instead call `record-ref.js write` before a hand-over or stop, as a backstop for a session
   that died before its banner?
7. **Cutover order.** Forge ships "read the ref first, the branch second" before Ensemble ships the
   writer, or both in one coordinated release? Proposed: Forge's reader first, then Ensemble's
   steps 1–2, then 3–7 together.
8. **The two shared logs** (`_session-log.md`, `_sweep/discovered.jsonl`) belong to no feature.
   One shared ref (`refs/ensemble/records/_shared`) with the same compare-and-swap writer, or keep
   them union-merged on the branch as #102 left them?
9. **Forge's "last changed" time (its N5).** The worktree mtime stays the live source; is the ref
   commit's time an acceptable fallback once the worktree is gone?
10. **Write frequency.** Proposed: at each existing commit point plus before every banner. Forge
    polls the live worktree between those, so it does not need a ref write per file save —
    confirm.

## Method

- Commit count: `git log --no-merges -300 --format=%H origin/main` (local `main` is behind
  `origin/main`), each commit's files from `git diff-tree --no-commit-id --name-only -r`, matched
  against the `isRecordFile` definition (`.trd-state/…`, `.claude/verification-notes.md`,
  `OWNER-CALLS.md`). 110 records-only, 231 touching at least one. Widening "records" to also
  include anything under `docs/` gives 174, but that mixes in real PRD and TRD edits, so the 110 is
  the comparable figure to Forge's 159.
- Writers and readers: a search of `.claude/commands`, `lib`, `hooks`, `workflows`, `contracts` and
  `skills` for each file name, then reading the headers of `record-files.js`, `custody.js`,
  `ship-record-dir.js`, `ci-baseline.js` and the per-feature framework writes TRD
  (`docs/TRD/per-feature-framework-writes.md`).
- Nothing was changed in either repository except this report.
