# Roadmap: Run records off the product branch (Ensemble's writer)

Plan: run-records-off-branch | Command: /plan-feature | Version: 1 | Date: 2026-11-12

Source: `docs/reports/run-records-off-branch-ensemble-side.md` (commit 3e69d941, branch
`docs/run-records-ensemble-side`; section 3 "Recommendation" and "Migration steps"), and ten joint
decisions agreed with Forge's PM on 2026-11-11/12, quoted from the owner's brief to `/plan-feature`
as "joint decision (n)". Those decisions are settled; nothing here reopens them.

**What this plan does, in one paragraph.** Today every Ensemble feature commits its run records
(the files under `.trd-state/<feature>/` that describe a run rather than the product) on its own
branch, so they reach `main` with every merge: 110 of the last 300 commits on `main` touched only
run records. This plan moves those records onto one git ref per feature,
`refs/ensemble/records/<slug>` — a ref that is not a branch, so it is not merged, not shown in
`git log main`, and fetched only on request — written by one new library at the points that commit
records today, pushed to `origin` best effort, with the worktree copy git-ignored. Forge's reader
for that ref is already deployed (Forge PR 319).

## Source spec

- One ref per feature, `refs/ensemble/records/<slug>`; every write carries `work.branch` and the Forge feature id when set -- source: conversation, joint decision (1): "one ref per feature, refs/ensemble/records/<slug>; every write carries work.branch and the Forge feature id when set (Forge matches by that id)"
- The identity is a `record.json` at the root of the ref's tree holding `forge_feature_id`, `branch` and `slug`, with `work.forge_feature_id` and `work.branch` also in `closed.json` and `shipped.json` -- source: probe: forge-vnext `origin/main:docs/TRD/run-records-ref-reader.md` D5 and `src/f3/phase-orchestrator/records-ref.ts:68,270-291` (the deployed reader parses exactly these names); the Forge feature id reaches a session as the env var `FORGE_FEATURE_ID` (`src/domain/spawner.ts:937`)
- The ref's tree root is the feature's state folder (`implement.json` at the root, images at `evidence/<path>`) -- source: probe: `records-ref.ts` reads `<commit>:record.json`, `<commit>:closed.json`; Forge TRD O13 serves "an image under `.trd-state/<slug>/evidence/`" from the ref; report section 2 option 2 ("a new commit whose tree is the feature's state folder")
- Each write is a compare-and-swap (`git commit-tree` then `git update-ref <ref> <new> <old>`) that never touches the index or the checked-out branch, retries a bounded number of times on a lost swap, prints one JSON line and never throws -- source: document: report section 3, "Shape"
- The writer pushes the ref to `origin` at each write point, best effort; a failed push never fails a command -- source: conversation, joint decision (2)
- Before cutover, prove live that pushing `refs/ensemble/*` starts no GitHub workflow, on `islayjames/ship-build-live-test` and on a repo whose workflow uses `on: push` with no branch filter (the live-test repo may be given such a workflow on a throwaway branch) -- source: conversation, joint decision (2); environment authorised in `.claude/rules/verification.md` §1 row `github-live-test`
- If the ref cannot be fetched or pushed (e.g. Claude Code Web), fall back to committing records on the branch as today; verify where possible, otherwise state it as a gap -- source: conversation, joint decision (3); `.claude/rules/verification.md` §5 lists `claude --remote` sessions as not verifiable from this machine
- Only `.claude/verification-notes.md` and `OWNER-CALLS.md` stay on the branch; everything else in report section 1a moves to the ref, with the worktree copy git-ignored -- source: conversation, joint decision (4); document: report section 1a (the full file list)
- The ref also carries the evidence images a verification report references -- source: conversation, joint decision (4); Forge TRD O13
- Keep every ref; no pruning -- source: conversation, joint decision (5)
- The writer moves any records Forge's hand-over or stop commit left on the branch into the ref on its next write -- source: conversation, joint decision (6)
- One shared ref `refs/ensemble/records/_shared` for `.trd-state/_session-log.md` and `.trd-state/_sweep/discovered.jsonl`, same compare-and-swap writer -- source: conversation, joint decision (8)
- Write at each existing commit point plus before every COMMAND COMPLETE/STUCK banner; no per-save writes -- source: conversation, joint decision (10); document: report section 3, "Where it is called"
- Ensemble readers (resume, custody, `/ship-build`, hooks) read from the worktree, then the ref, so a fresh clone or re-created worktree still resumes -- source: conversation ("Ensemble readers (--resume, custody, /ship-build, hooks) must read from the worktree, then the ref"); document: report Migration step 2
- Readers ship before writers; the writer change and the ignore lines ship together -- source: document: report Migration steps 2 and 3 ("the two must ship in one release")
- Ignore lines go through #102's mechanism (`gitignore-framework.txt`, delivered by `ensure_gitignore`); untracking runs only from `/rebase-project`, staged, never committed -- source: document: report Migration step 4; probe: `packages/core/scripts/scaffold-project.sh:1773-1810` (`ensure_gitignore untrack`)
- `/rebase-project` seeds a ref from each in-flight feature's current folder; finished features are not backfilled -- source: document: report Migration step 5
- The detached ship record (`<git common dir>/ensemble/ship/`) folds into the ref; runs started before the switch are still read from the old place -- source: document: report Migration step 6; probe: `packages/core/lib/ship-record-dir.js:1-47`
- The ship `push` step pushes the feature's ref beside its branch; resume fetches the ref explicitly when the worktree folder is absent -- source: document: report Migration step 7
- A settings key (`ensemble.records: "ref"`) stamped by the scaffold, so Forge knows the location without probing -- source: document: report Migration step 9
- Custody's record-file ignoring and the merge step's record-clash auto-resolution stay, as fallbacks for features started before the cutover -- source: conversation ("stay as fallbacks for features started before the cutover"); probe: `packages/core/lib/record-files.js:33-41`, `custody.js:13-15`

## Out-of-scope fence

- Retiring custody's `ignored` class, the merge step's record-file union, or the per-feature half of `isRecordFile` -- reason: they are the fallback for features started before the cutover; source: conversation (joint decisions, closing paragraph); report Migration step 8 ("later")
- Pruning, archiving or expiring any `refs/ensemble/records/*` ref -- reason: every ref is kept; source: conversation, joint decision (5)
- Backfilling refs for features already finished -- reason: their records stay readable on `main`; source: document: report Migration step 5 (Forge's N7)
- Moving `.claude/verification-notes.md` or `OWNER-CALLS.md` off the branch -- reason: project knowledge and an owner-facing log, not run records; source: conversation, joint decision (4)
- Any change in the Forge repository (`forge-vnext`), including its reader, its hand-over commit or its stop commit -- reason: Forge's reader is deployed (PR 319) and Forge never runs Ensemble scripts; source: conversation, joint decisions (6) and (7)
- `docs/ui/<slug>/design-map.json`, `canvas.json`, PRDs, TRDs, `.claude/rules/*` -- reason: design documents and governance, not run records; source: document: report section 1c, "Not run records, and out of scope"
- `.trd-state/_docs-audit/last-run.json` -- reason: written only on `/audit-docs`'s own review branch; source: document: report section 1c ("leave as is")
- Editing `.claude/rules/verification.md`, `stack.md` or `constitution.md` -- reason: owner-governed, changed only through their setup skills; source: `CLAUDE.md` "Approval Requirements"
- Cutting the plugin release (version bump, tag, marketplace) -- reason: `production` in `verification.md` §1 must not be touched by the loop; the owner cuts the release after the plan's items merge; source: `.claude/rules/verification.md` §1 and §1a (count 0)
- Running anything against `FortiumPartners/ensemble-vnext`'s remote other than pushing a feature branch, its records ref, and opening its PR -- reason: the live proofs belong on `islayjames/ship-build-live-test`; source: `.claude/rules/verification.md` §1

## Items

### 1. Records ref library

- Brief: Add one new library, `packages/core/lib/record-ref.js` (vendored to `.claude/lib/`), that writes, reads and pushes a feature's run records on a git ref, `refs/ensemble/records/<slug>`, without touching the index or the checked-out branch. Nothing calls it yet: wiring it into commands is a later item. A write builds a tree whose root is the feature's state folder `.trd-state/<slug>/` (every file report section 1a lists, including the verification loop's per-iteration files, plus exactly the images under `evidence/` that the folder's `verification-report.md` references; never `dispatch.jsonl`, `implement.lock` or `findings/`), adds a `record.json` at the tree root holding `forge_feature_id` (from the `FORGE_FEATURE_ID` env var, else null), `branch` (the current branch) and `slug`, commits it on the previous ref value with a message naming the command and step, and moves the ref by compare-and-swap (`git update-ref` with the old value), retrying a bounded number of times on a lost swap. It then pushes the ref to `origin` best effort; when the ref cannot be written or the push is refused or fails, it falls back to committing the records on the branch by pathspec as today (force-adding the ignored paths), and reports which happened. Any record files already tracked on the branch (left there by Forge's hand-over or stop commit, or by the fallback) are folded into the ref and removed from the index on the next successful write. The same writer serves one shared ref, `refs/ensemble/records/_shared`, for `.trd-state/_session-log.md` and `.trd-state/_sweep/discovered.jsonl`. It also offers `read` (one file at a ref: local ref, else fetched from `origin`), `list`, and `restore` (materialise a missing state folder from the ref). CLI and module, one JSON line, exit 0, never throws, `spawnSync` with argument arrays only. The ref's tree layout and `record.json` field names are a contract with Forge's deployed reader (forge-vnext `docs/TRD/run-records-ref-reader.md` D5, O13): match them exactly. Before this item closes, prove live, on `islayjames/ship-build-live-test` (environment `github-live-test` in `.claude/rules/verification.md`), that pushing a `refs/ensemble/records/*` ref starts no GitHub workflow: once against the repo as it is, and once with a throwaway branch carrying a workflow whose trigger is `on: push` with no branch filter, pushing a records ref whose commit is parented on that branch's head. Delete the throwaway branch and the probe refs afterwards. Whether a Claude Code Web session can push or fetch such a ref cannot be checked from this machine (`verification.md` §5); record it as a stated gap, and make sure the fallback path covers it.
- Dependencies: none
- How it will be checked: `npx jest packages/core/lib/record-ref.test.js` covering: two writers racing one ref (both writes land, in some order, with no lost file); no git directory (prints a refusal, exits 0); a reader-only OS user simulated by an unwritable `objects/` directory (falls back, does not throw); a refused push (falls back to a branch commit, command not failed); branch-tracked records folded into the ref; `record.json` fields; evidence images included only when the report references them; the `_shared` ref. Live: `gh run list -R islayjames/ship-build-live-test` shows no run whose head SHA is a probe ref's commit, for both probes, while the throwaway branch's own push does show its run (proving the workflow is live).
- Route: plan
- Route rigor: standard
- Deferred checks: Claude Code Web push/fetch of `refs/ensemble/*`, which waits on an environment that `.claude/rules/verification.md` does not list; stays a stated gap
- Dates: none

### 2. Readers fall back to the ref

- Brief: Make every Ensemble reader of a run record look in the worktree first and then at the feature's records ref, `refs/ensemble/records/<slug>` (local, else fetched from `origin`), so a fresh clone or a re-created worktree still resumes once records stop being committed. Use the `read` and `restore` operations of the records ref library (`packages/core/lib/record-ref.js`, built by the item before this one). Readers to cover, at least: `implement-state.js` load and the resume path of every command that resumes (`/implement-trd`, `/amend`, `/plan`, `/task`, `/verify-build`, `/refine-verification`, `/ship-build`); `custody.js` (its reads of `closed.json` and `custody.json`); `ship-sequencer.js`; `artifacts.js get` (so a re-created worktree updates an artifact link in place); the hooks `session-context.js`, `status.js`, `precompact.js` and `router.py` (Python: read the ref with `git cat-file`, never fail the hook). Hooks never fetch from the network; they read the local ref only. This item changes no writer: records are still committed on the branch while it ships, so its behaviour on today's repositories is unchanged. A missing ref, a missing remote or a git failure reads as "no record", exactly as a missing file does today.
- Dependencies: Records ref library (code_or_schema)
- How it will be checked: Jest and pytest suites of each touched reader gain a case where the worktree folder is absent and the ref holds the record, and a case where neither exists (behaviour unchanged); a BATS or Jest scenario that writes a ref, deletes the worktree's `.trd-state/<slug>/`, and resumes `implement-state` from the ref; the full battery (`npx jest`, `pytest packages/router/tests`, the touched BATS files) stays green.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 3. Writers move to the ref

- Brief: Cut over: every place that commits run records today writes the feature's records ref instead, through the records ref library (`packages/core/lib/record-ref.js`), and the worktree copy of those records becomes git-ignored. Commit points to replace (the plan session probes for the full list): `/implement-trd`'s phase checkpoint (which then commits product code only, still with `git add -A`, safe only because the folder is ignored), `/audit-build` (report, round ledger, close record), `/close-feature`, `/ship-build` Step 5 and each ship step, `/verify-build`'s result, every "store/record … link" commit after an artifact publish, `/plan`, `/amend`, `/refine-verification`, and `/task`'s close; `/sweep` and `precompact.js` write the shared ref `refs/ensemble/records/_shared`. Add one write before every COMMAND COMPLETE and COMMAND STUCK banner of a command that touched records, stated once in `.claude/rules/command-status.md`; no write per file save. The ship `push` step pushes the feature's ref beside its branch. Add the per-feature record files to `packages/core/templates/gitignore-framework.txt` (all of `.trd-state/` except `.trd-state/_docs-audit/`), delivered by the existing `ensure_gitignore`; `.claude/verification-notes.md` and `OWNER-CALLS.md` stay tracked. The scaffold stamps `ensemble.records: "ref"` in `.claude/settings.json` (backfilled with setdefault, like `ensemble.publishArtifacts`). Mirror every change into `packages/full` and `.claude/`, and update `docs/reference/` and `CHANGELOG.md`. Custody's record-file ignoring and the merge step's record-clash resolution stay unchanged, as fallbacks for features started before the cutover.
- Dependencies: Records ref library (code_or_schema), Readers fall back to the ref (code_or_schema)
- How it will be checked: a prose test per touched command asserting it names `record-ref.js write` where it used to commit records, and asserting no remaining `git commit` of a `.trd-state/` path outside the fallback; a fixture run (environment `fixtures` in `verification.md`) of `/plan` with the implement option on a small change, after which `git log` on the feature branch shows no commit touching only `.trd-state/`, and `git cat-file -p refs/ensemble/records/<slug>:implement.json` shows the finished task list; `bats packages/core/scripts/scaffold-project.test.sh` covers the new ignore lines and the settings key; full battery green.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 4. Fold the detached ship record into the ref

- Brief: `/ship-build` keeps its run record and custody anchor, from the merge onward, in a detached folder in the git common directory (`<git common dir>/ensemble/ship/<feature>/`, defined by `packages/core/lib/ship-record-dir.js`), so a merged branch is not left with dirty records. Now that records live on the feature's records ref, `refs/ensemble/records/<slug>`, write the post-merge `shipped.json` and `custody.json` to the ref through the records ref library instead, and stop writing the detached folder. Keep reading the detached folder for ship runs started before this change, after the ref, so a run in flight across the upgrade still resumes. `shipped.json` carries `work.branch` and `work.forge_feature_id` (Forge's reader matches on them). `ship-sequencer.js` and `custody.js` keep sharing one path rule; neither may require the other's.
- Dependencies: Records ref library (code_or_schema), Readers fall back to the ref (code_or_schema)
- How it will be checked: `npx jest packages/core/lib/ship-sequencer.test.js packages/core/lib/custody.test.js packages/core/lib/ship-build.seam.test.js` with new cases: a post-merge write lands on the ref and nothing new appears under `<common>/ensemble/ship/`; a run started before the change (fixture detached folder, no ref) resumes from the old folder; custody's merge and deploy links resolve the anchor from the ref.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 5. Cutover for existing projects

- Brief: Give projects that already run Ensemble a safe path onto the records ref. In `/rebase-project` (and only there, never in the scaffold's refresh), after the new ignore lines are delivered: untrack the per-feature record files from the index, staged and never committed (the existing `ensure_gitignore untrack` path, #102's rule: an unattended untrack on one feature branch gives a modify/delete conflict against its siblings); and seed a ref, `refs/ensemble/records/<slug>`, from each in-flight feature's current state folder (in flight: has `implement.json` and no `closed.json`, or a ship run that has not finished), so a feature that straddles the cutover has its history from that point on. Finished features are not backfilled; their records stay readable on `main`. Report what was untracked and which refs were seeded in the command's readout.
- Dependencies: Writers move to the ref (code_or_schema)
- How it will be checked: `bats packages/core/scripts/scaffold-project.test.sh` (or the rebase-project test file) with a fixture repo holding one in-flight and one finished feature: after the rebase, the in-flight feature has a ref whose `implement.json` equals the folder's, the finished one has none, the record files are untracked in the index and nothing was committed; a prose test on `rebase-project.md`.
- Route: plan
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 6. Cutover proof on a fixture project

- Brief: Report-only check that the cutover works end to end, run once the writer, the ship-record fold and the rebase cutover are merged. In a scaffolded fixture repo (environment `fixtures` in `.claude/rules/verification.md`) with a bare local `origin`: run a small change through `/plan` with the implement option to a passing audit; confirm the feature branch carries no commit that touches only `.trd-state/`; confirm `refs/ensemble/records/<slug>` exists locally and on `origin`, its root `record.json` names the branch and the `FORGE_FEATURE_ID` set for the run, and it carries `implement.json`, `closed.json`, `verification-report.md` and each image that report references; delete the worktree's `.trd-state/<slug>/`, clone `origin` afresh, and confirm the resume path finds the records from the ref. Then make `origin` refuse the ref push and confirm the run falls back to committing records on the branch without failing. Write the findings, with the commands and their output, to the task's report; list anything that failed as a follow-up. Ships no code.
- Dependencies: Writers move to the ref (code_or_schema), Fold the detached ship record into the ref (code_or_schema), Cutover for existing projects (code_or_schema)
- How it will be checked: the task's `closed.json` lists each of the six checks in the brief with pass or fail and the evidence for it; any fail is a follow-up for the PM.
- Route: task
- Route rigor: solo
- Deferred checks: none
- Dates: none

## Open questions

- Should the live CI proof be its own task ahead of the library? -- assumption: no; it is a must-pass check of the library item, because it exercises the library's own push and the writer item cannot start until it passes; asked of: none, settled by joint decision (2) ("before cutover") and the dependency of item 3 on item 1
- When a push fails for a transient reason (offline), does the writer still fall back to a branch commit? -- assumption: yes, any failed or refused push falls back for that write, and the next successful write folds those branch records back into the ref and untracks them; asked of: none, settled by joint decisions (3) and (6)
- Which per-iteration verification files go on the ref? -- assumption: all of report section 1a's list, including the `judge-*`, `record-*` and `setup-decide-*` files that #116 made git-ignored, because the verification loop's resume reads them; asked of: none, settled by joint decision (4) ("everything else in section 1a")
- The source report is committed only on branch `docs/run-records-ensemble-side`, not on `main` -- assumption: it reaches `main` with this plan's files in one PR before the plan is driven; each brief also stands alone without it; asked of: none (an ISSUES line for the PM)
