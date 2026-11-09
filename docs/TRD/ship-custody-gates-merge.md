# TRD: ship-custody-gates-merge

**Source PRD**: None — defect; GitHub issues FortiumPartners/ensemble-vnext #85, #86, #87, #88, and the brief `docs/plans/fix-ship-custody-order/brief.md` (feature F-1 of workplan fix-ship-custody-order)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | After a base merge, a path whose content at the head equals the base tip, and which the feature never touched at the anchor, does not fail custody; a path the feature changed, or a conflict resolution rewrote, still fails it | #85 part 2; brief Expected 1; owner's call taken by Forge 2026-11-08 | yes |
| O2 | `.claude/verification-notes.md` (framework-written verifier notes) never counts as shipped code | #85 part 3; brief Expected 2 | yes |
| O3 | The push step is not gated by custody; custody gates the merge (and the release): the merge step runs the custody gate before `gh pr merge`, and a gate failure leaves the PR unmerged | #85 part 1, #86; brief Expected 3 | yes |
| O4 | A preview criterion can be proven after the push: the re-verification happens inside the merge step, on a head that is already pushed, and the run then re-anchors | #86; brief Expected 3 | yes |
| O5 | After the PR has merged, the run record (`shipped.json`) is written to an untracked file under the git directory, needs no commit, and is still read after the branch is deleted | #85 part 4; brief Expected 4; owner's call taken by Forge 2026-11-08 | yes |
| O6 | Re-verification after a base merge is handed the feature's owner/PM rulings, and a must-pass criterion whose evidence covers only files unchanged between the old anchor and the merge head is reused, not re-verified | #87; brief Expected 5 | |
| O7 | The re-anchor never leaves the merge head mismatched: nothing is committed or pushed between the custody gate and `gh pr merge`, which matches the PR's own head | #88; brief Expected 6 | yes |
| O8 | Every changed file under `packages/core/` has an identical vendored copy under `.claude/` | your instruction, 2026-11-08 (acceptance 8) | |

## Reproduction

### Steps

[ran 2026-11-08, scratch repo] A repo with `src/a.js`, `src/b.js` and a TRD. The feature branch changes `src/a.js`, and that commit is the anchor. `main` then gains `src/c.js` and changes `src/b.js` (another PR). The feature branch merges `main` and commits `.claude/verification-notes.md`. `node custody.js reconcile --state-dir .trd-state/f --trd docs/TRD/f.md` then runs.

### Actual

`differing: [".claude/verification-notes.md", "src/b.js", "src/c.js"]`. Every file the base brought in, plus the verifier's own notes file, counts as changed shipped code. With a success definition present, the result is `reverify` for every must-pass criterion that has no covered-file record. Read from the code and the issues [read]:

- `ship-primitive-push.md` steps 2–4 reconcile custody and demand re-proof before `git push`, so a criterion that needs a preview of the pushed head can never be proven (#86, a deadlock).
- `ship-build.md` Step 5 commits the state directory, and in the Storybook run that commit was pushed after the re-anchor, which moved the PR head after CI and made `--match-head-commit` refuse the merge (#88).
- `shipped.json` lives in the tracked state directory, so after the merge its last state has nowhere to be committed (#85 part 4).
- Under `--criteria`, `verify-build.md` implies `--no-fix` and skips the plan entirely, so the plan's owner rulings never reach the subset run's Judge (#87).

### Expected

- Base-supplied paths are excused, and the anchor moves with the rule `base-merge`.
- The notes file is ignored.
- Push only pushes. The merge step runs the custody gate (reconcile, re-verify on the pushed head if needed, reconcile again) and then the existing pr-head check, merging with the PR's own head id. Nothing is committed in between.
- After the merge the sequencer writes `shipped.json` under the git common directory.
- The subset re-verification receives the rulings.

**Root cause** [ran] for O1/O2 (reproduced above): `compare()` diffs raw commits, and `classifyPath()` ignores only `.trd-state/` and the TRD. [read] for O3–O7: ordering in the push and merge contracts, the location of `STATE_FILE`, and the `--criteria` overrides in `verify-build.md`.

## Decision

- **Base excuse, made stricter than the brief's literal rule and recorded as a decision.** A differing shipped path is excused when (a) its blob at the head equals its blob at the **base commit the head took in**, `git merge-base <head> <base ref>` after `git fetch origin <base>` (absent at both counts as equal; adversarial pass: comparing against the moving tip would re-fail every base file once another PR lands on the base) **and** (b) the feature's own diff, from `git merge-base <anchor> <base>` to the anchor, does not touch it. Condition (b) is an addition: without it, a conflict resolution that took the base's version wholesale would silently drop a verified feature change and still pass. Adding it only excuses fewer paths, so it stays inside the owner's call. The excuse is applied by `reconcile` only, given an explicit `--base <ref>`. `check` is unchanged: once `reconcile` has moved the anchor onto the merge head, every link compares raw against it. This avoids a post-merge merge link becoming vacuous, because after the merge the base tip contains the feature itself.
- **A base-only change can still re-verify a criterion.** When every shipped difference is excused, `reconcile` still asks which must-pass criteria are affected: one whose evidence `covers` includes an excused or shipped path, and one with no covers record whenever anything shipped or excused changed (OQ-2 unchanged: no record means it cannot show its sources are untouched; adversarial pass). Only those are re-verified. Must-pass ids not re-verified are returned as `reused`. This is the evidence reuse #87 asks for: their earlier proof stands because the files it rests on did not change.
- **One custody gate, written once.** It goes in a new non-primitive contract `packages/core/contracts/ship-custody-gate.md` (the sequencer loads only `ship-primitive-*.md`, so it is never a step). `merge` runs it **first, before reading the PR state**, so a PR merged by hand while the run was parked still re-anchors before the merge-link proof (adversarial pass). `release` runs it before its command with the default head (the local HEAD) and `--base origin/<context.base>` when a PR step gave one, so `push, release` and a post-merge `run npm version` both work. `push` keeps only `reconcile --set-only` (sets the anchor when none exists, never compares or moves it), so unaudited and sweep work keep a pre-push anchor (adversarial pass). `push` drops its gate and push-link check, and `open-pr` drops its push-link check; the `push` link stays in `custody.js` for direct use.
- **The gate reconciles the PR's head, not the local HEAD.** `reconcile --head <sha>` sets the commit judged. It refuses when the local HEAD differs from it in shipped paths ("local HEAD has shipped changes not on the PR head"), because re-verification runs on the working tree. A `.trd-state/`-only state commit made at an earlier stop therefore never blocks a resume. Before reconciling, the gate polls `gh pr view --json headRefOid` (up to 8 times, 15s apart) until it equals the local HEAD's pushed id, because the PR's reported head can trail a push by about 80s.
- **No commit between the gate and the merge.** `custody.json`'s re-anchor stays uncommitted until after the merge, so the PR head is still the one CI checked and `--match-head-commit <observed>` matches (#88).
- **The `--reason format` shortcut moves the anchor only when the formatter commit is the sole un-excused change.** That means `compare(anchor, HEAD^)` is equal; otherwise reconcile falls through to the normal path. Absorbed `[BLOCKS]`: with the push reconcile gone, the anchor can still be the audited commit when `fix-findings` runs, and the old shortcut would then excuse every change since.
- **The post-merge record is moved by a generic contract key.** A contract's `detach-on: <results>` front-matter key makes the sequencer write `shipped.json` to `<git common dir>/ensemble/ship/<state dir name>/<startedAt>.json` from that result onward; the file name carries the run's `startedAt`, so a later run under the same slug never reads an old run's record. `loadState` prefers the external file only when its `startedAt` matches the tracked record's (adversarial pass). The sequencer stays primitive-blind: it reads the key, it never names `merge`. With no git directory it keeps the tracked file.
- **Rulings reach the subset run.** Under `--criteria`, `verify-build.md` folds `verification-plan.md`'s `## Owner rulings` and `## Accepted as not verifiable` tables into `notes`, whatever the plan's timestamp (a ruling stands until superseded), and still builds nothing.

absorbed:     `--reason format` excusing every change since an audited anchor — the gate move opens it  [BLOCKS]
absorbed:     `open-pr`'s push-link check — with no anchor before the merge it would stop every run  [BLOCKS]
absorbed:     `release` reconciling itself — push no longer sets the anchor, so `release` without `merge` would always fail "no anchor"  [BLOCKS]
not absorbed: `fix-findings` `format=` in `/ship-setup` — out of scope by your decision
not absorbed: `custody.test.js` flaking on all-digit commit hashes — separate known issue; this fix works with it present

## Non-Goals

- No change to how criteria are judged, to the evidence checker's freshness rules, or to how work with no `ship.md` ships (it still only pushes).
- No change to the `pr-head`, `merge` or `deploy` link comparisons.
- `custody.json` does not move out of the tree after the merge; only `shipped.json` does.
- No reading of rule files from the base branch (feature F-2, to come).

## Verification Artifacts

None apply — the change is to libraries and prompt contracts with no UI, no rendered data, no design and no screen-to-screen flow; every objective is checked by Jest and the BATS mirror test.

## Verification Environment
**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: a real GitHub PR merge, a Vercel preview, and branch protection (no live repo is listed in `verification.md` §1)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should the base excuse also require that the feature never touched the path (condition b)? | Yes. It is stricter than the brief, so it is within the call Forge took. | owner-only |
| OQ-2 | After a base-only change, should a must-pass criterion with no evidence `covers` record be re-verified? | Yes, it is re-verified: it cannot show its sources are untouched. This costs a re-check per base merge for such criteria | owner-only |
| OQ-3 | A new non-primitive contract file and a new `detach-on` front-matter key are architecture-shaped changes | Taken as a routine engineering call under Forge's charter (OWNER-CALL), not yet reviewed by the owner | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `custody.js`: ignore framework-written files; base-aware `compare` with an `excused` list; `reconcile --base <ref> --head <sha>` with the `base-merge` move, the local-HEAD refusal, the covers-based affected set, the `reused` list and the guarded `--reason format`; CLI flags and usage; tests in `custody.test.js` | O1, O2, O4, O6, O7 | None | New tests in `packages/core/lib/custody.test.js` fail on the current code and pass after. (1) Base files only: `reconcile --base origin/main` moves (also after the base tip moves past the merged commit) the anchor with `base-merge` and `check --link pr-head` then passes. (2) A feature edit after the anchor, alongside the base merge, is still `differing`. (3) A conflict-resolved file is still `differing`, and so is a resolution that took the base's version. (4) `.claude/verification-notes.md` classifies as `ignored`. (5) A base-only change to a file in a must-pass criterion's evidence `covers` returns `reverify` with that id. A criterion whose covers are untouched is in `reused`, not `ids`. (6) `--head <sha>` judges that commit, and refuses when the local HEAD has a shipped change not in it. A `.trd-state/`-only local commit is accepted. (7) `--reason format` with an earlier unverified change does not move with `format`. (9) `--set-only` sets an absent anchor and never moves an existing one. (10) A no-covers must-pass criterion is in `ids` after a base-only change. (8) An anchor at the head plus a `.trd-state/`-only commit still passes pr-head. |
| FIX-002 | `ship-sequencer.js`: the `detach-on` contract key; the external record path under `git rev-parse --git-common-dir`; `loadState` prefers it; `saveState` writes it once detached; `record`/`status` report `recordPath`; tests in `ship-sequencer.test.js` | O5 | None | New tests fail before and pass after. (1) In a temp git repo, recording a `detach-on` result writes `<common dir>/ensemble/ship/<name>/shipped.json`. The tracked `shipped.json` is not written by that or any later record. (2) After `git checkout main && git branch -D <feature>`, with the pre-merge record committed and merged, `status` still reads the detached record as done/shipped. (3) Outside a git repo the tracked file is used, as today. (4) A contract without the key behaves exactly as before. (5) A new run whose tracked `startedAt` differs never reads the old external record. |
| FIX-003 | Contracts: new `ship-custody-gate.md`. `push` loses reconcile and push-link. `open-pr` loses the push-link check. `merge` runs the gate (`--base origin/<base> --head <PR headRefOid>`) before pr-head, commits nothing before `gh pr merge`, and declares `detach-on: merged`. `release` runs the gate before releasing. `run` and `fix-findings` wording follow; `fix-findings` treats `reverify` from the format reconcile as "go on, the gate re-verifies". Update `ship-primitives.test.js` | O3, O4, O7 | FIX-001, FIX-002 | `packages/core/contracts/ship-primitives.test.js` asserts, failing before and passing after: (1) the push contract runs only `custody.js reconcile --set-only` and no `--link push`; open-pr has no `--link push`. (2) In `merge`, the gate comes before the `gh pr view <pr> --json state` read and before `--link pr-head`, which comes before `gh pr merge`. A gate `stop` is returned before `gh pr merge`. (3) The gate contract runs `/verify-build <work.trd> --criteria <ids> --no-fix --chained` after the head is on the PR, then `--reverified`. (4) The merge contract forbids a commit or push between the gate and `gh pr merge`. (5) `merge`'s front matter carries `detach-on: merged`, and the sequencer loads every contract with no error. (6) `release` runs the gate before its command, with the local HEAD. (7) The gate polls `headRefOid` before reconciling and fetches the base. |
| FIX-004 | Commands: `verify-build.md` `--criteria` folds the plan's owner rulings and accepted-as-not-verifiable rulings into `notes`. `ship-build.md` Step 5: after a merge, nothing is committed and the readout names the detached record path; the "commit it on the default branch" NEXT line goes. Text tests | O5, O6 | FIX-002, FIX-003 | Assertions in `ship-primitives.test.js` (or a sibling command-text test) fail before and pass after. `verify-build.md`'s `--criteria` section names `## Owner rulings` and `## Accepted as not verifiable` going into `notes`. `ship-build.md` no longer tells the owner to commit the state directory on the default branch after a merge, and names the record under the git directory. |
| FIX-005 | Mirror every changed `packages/core/` file into `.claude/` (`lib/custody.js`, `lib/ship-sequencer.js`, the contracts including the new gate, `commands/verify-build.md`, `commands/ship-build.md`) and run the battery | O8 | FIX-001, FIX-002, FIX-003, FIX-004 | `bats test/integration/tests/runtime-integrity.test.sh` passes ("every file mirrored into .claude/ matches its packages/ source"). `npx jest packages/core/lib/custody.test.js packages/core/contracts/ship-primitives.test.js packages/core/lib/ship-sequencer.test.js` passes. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/custody.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `run()` (spawnSync, argument arrays), `resolveCommit`, `compare`, `move`, `affectedIds`, `liveEvidence.read`, and the test `setup()` helper (temp repo with a bare origin) [read]
- **Replaces:** `classifyPath`'s two-rule ignore with a set that also holds `.claude/verification-notes.md`. `affectedIds`' single shipped list becomes shipped plus excused, where a covers record matches either and a no-covers id is affected only by shipped changes. The unconditional `reason === 'format'` move becomes a guarded one [read]
- **Follow:** every result stays one JSON line with `action`/`reason`, and nothing throws for an expected condition. `check` never writes. Base tip by `git rev-parse --verify <ref>^{commit}`; the feature's diff by `git merge-base` then `git diff --no-renames --name-only -z`. Head-versus-base equality by one `git diff --no-renames --name-only -z <head> <base>` set, not per-file calls [read]
- **Careful:** `--no-renames` must stay on every diff (the file's own header explains why). With no `--base`, behaviour is byte-for-byte today's. The module header comment and `USAGE` must describe the new flags [read]

### FIX-002
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`
- **Reuse:** `loadPrimitives` (add `detachOn` the way `stopsOn` is parsed: `listOf(fm['detach-on'])` filtered to declared results), `implementState.save`, `loadState`/`saveState` [read]
- **Replaces:** the single `statePath(stateDir)` in `loadState`/`saveState` with a pair: the tracked path, and the external path when the state carries `detached: true` or the external file exists [read]
- **Follow:** the module stays primitive-blind (the header says so; name no primitive). The git common dir comes from `git rev-parse --git-common-dir`, run in the nearest existing ancestor of `stateDir` and resolved against it. Use spawnSync with an argument array. Update the header's STATE paragraph [read]
- **Careful:** the existing suite's temp dirs sit under `os.tmpdir()`, outside any git repo, so its behaviour must not change. A test that makes a repo must clear `GIT_DIR`/`GIT_WORK_TREE`, as `custody.test.js`'s `cleanEnv` does [read]

### FIX-003
- **Touches:** `packages/core/contracts/ship-custody-gate.md`, `packages/core/contracts/ship-primitive-push.md`, `packages/core/contracts/ship-primitive-open-pr.md`, `packages/core/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-primitive-release.md`, `packages/core/contracts/ship-primitive-run.md`, `packages/core/contracts/ship-primitive-fix-findings.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the existing reverify wording in `ship-primitive-push.md` step 2 moves into the gate, nearly verbatim, including the `reverify/verification-state.json` path. Keep `merge`'s step 1 pr-head paragraph as is [read]
- **Replaces:** push steps 2 and 4, and open-pr step 4. The test blocks `push`, `open-pr` and `merge` in `ship-primitives.test.js`, plus the `EXPECTED` table entry for `merge` if it asserts front matter keys [read]
- **Follow:** contracts are the whole instruction set for one step. Keep `## Input`/`## Do`/`## Result`/`## Waiting`. The gate file is not a primitive and carries no primitive front matter. A failure "returns `stop` with the reason and the differing files" [read]
- **Careful:** `scaffold-project.sh` copies every `contracts/*.md`, so the gate file ships into projects automatically. The sequencer's loader matches only `ship-primitive-*.md` [read]

### FIX-004
- **Touches:** `packages/core/commands/verify-build.md`, `packages/core/commands/ship-build.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the fix loop's step-0 wording ("Fold its `## Owner rulings` table into `notes` under a `## Owner rulings (verification-plan.md)` heading") [read]
- **Replaces:** in `ship-build.md` Step 5, the "NEXT says to commit the state directory on the default branch" sentence, and its NEXT bullet "Merged with the state directory uncommitted" [read]
- **Follow:** `--criteria` still implies `--no-fix` and builds nothing; only the rulings are read [read]
- **Careful:** `verify-build.md` is also touched by feature F-2 (to come); keep the edit inside the `--criteria` section [read]

### FIX-005
- **Touches:** `.claude/lib/custody.js`, `.claude/lib/ship-sequencer.js`, `.claude/contracts/ship-custody-gate.md`, `.claude/contracts/ship-primitive-push.md`, `.claude/contracts/ship-primitive-open-pr.md`, `.claude/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-release.md`, `.claude/contracts/ship-primitive-run.md`, `.claude/contracts/ship-primitive-fix-findings.md`, `.claude/commands/verify-build.md`, `.claude/commands/ship-build.md`, `docs/guides/ship-build.md`
- **Reuse:** plain `cp` from `packages/core/`; tests (`*.test.js`) are not mirrored [read]
- **Follow:** `test/integration/tests/runtime-integrity.test.sh` is the check [read]
- **Careful:** the docs in `docs/guides/ship-build.md` describe the push-time reconcile; update its custody paragraph so it does not contradict the contracts [inferred]

## Could Not Verify

- No live GitHub merge, Vercel preview or branch protection was exercised; O3, O4 and O7 are proven on contract text and on `custody.js` against a local bare origin.
- A detached record cannot be seen from a fresh CI runner, which matters only for resuming after the merge (accepted in the owner's call).
- After the branch and worktree are gone, `custody.json` is gone too, so a `release` resumed then stops with "no anchor" (safe: it stops before releasing).
