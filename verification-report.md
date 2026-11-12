# Functional Verification Report: cutover-for-existing-projects

**Source PRD**: docs/TRD/cutover-for-existing-projects.md § Intended Change
**Success definition**: .trd-state/cutover-for-existing-projects/success-definition.md
**Outcome**: exit-satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 27 total — 26 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 26 of 27 proven — uncovered: FS-7
**Must pass**: 17 of 17 proven

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Running `scaffold-project.sh --records-cutover <dir>` on a project whose `.trd-state/<slug>/` run records are tracked first writes the framework ignore lines into `.gitignore`, then removes from the index every path `git ls-files -ci --exclude-standard -- .trd-state` listed, printing one `Untracked <path>` line per path | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs1-5-cutover.txt | iteration 2 (regression pass 1) |
| FS-2 | The untracking is index-only and staged: every untracked file is still present on disk with its content unchanged, and `git status` shows each as a staged deletion | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs1-5-cutover.txt | iteration 2 (regression pass 1) |
| FS-3 | The whole cutover (untracking and seeding) creates no commit: `HEAD` of the target worktree and of every other worktree is the same commit before and after `--records-cutover` | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs1-5-cutover.txt | iteration 2 (regression pass 1) |
| FS-4 | `.trd-state/_docs-audit/` files stay tracked through the cutover: none is printed as `Untracked`, and each is still in `git ls-files` afterwards | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs1-5-cutover.txt | iteration 2 (regression pass 1) |
| FS-5 | No other scaffold mode untracks a run record: after `scaffold-project.sh --refresh`, a plain `scaffold-project.sh`, and `scaffold-project.sh --git-files`, each run on a repo with tracked `.trd-state/<slug>/` records, those records are still tracked | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs5-all-modes.txt | iteration 2 (regression pass 1) |
| FS-6 | `/rebase-project` runs the cutover as Step 4.7b, immediately after Step 4.7a, by invoking `scaffold-project.sh --records-cutover`; a `/rebase-project` run on a project with tracked records leaves them untracked (staged) and seeds the in-flight feature's ref | .trd-state/cutover-for-existing-projects/evidence/regression-1/fixture-state.txt | iteration 2 (regression pass 1) |
| FS-8 | The `/rebase-project` Rollback section says how to undo the staged removals and states that a pushed ref is not undone by `git restore` | .trd-state/cutover-for-existing-projects/evidence/it2-FS8-rollback.txt | 2 |
| FS-9 | `node records-cutover.js seed` prints exactly one line of JSON with `ok`, `seeded` (entries with `slug`, `worktree`, `branch`, `ref`, `commit`, `push`) and `skipped` (entries with `slug`, `worktree`, `reason`), and exits 0 | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-main.txt | iteration 2 (regression pass 1) |
| FS-10 | `records-cutover.js seed` never throws: run outside a git repository, or over a folder with a malformed `implement.json` or `shipped.json`, it still prints one JSON line and exits 0 | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs10-never-throws.txt | iteration 2 (regression pass 1) |
| FS-11 | An in-flight `.trd-state/<slug>/` folder in a worktree whose checked-out branch is the branch its records name, with no existing ref, gets `refs/ensemble/records/<slug>` created, and the `implement.json` in that ref is byte-identical to the folder's | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-details.txt | iteration 2 (regression pass 1) |
| FS-12 | Which copy of a ship run is current is decided as `ship-record-dir.js resolveRun` decides it: a folder whose current ship run has `status` `running`, `waiting` or `stuck` is treated as in flight and seeded, while one whose current run is `done` and is otherwise finished is skipped as `finished` | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-details.txt | iteration 2 (regression pass 1) |
| FS-13 | The seed walks every worktree `git worktree list --porcelain` lists, not only the one it runs in: an in-flight folder in a second linked worktree is seeded with that worktree as `cwd`, and its `seeded` entry names that worktree and that worktree's branch | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-details.txt | iteration 2 (regression pass 1) |
| FS-14 | Detached-HEAD and prunable worktrees are skipped: no ref is seeded from a folder that lives only in such a worktree | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-details.txt | iteration 2 (regression pass 1) |
| FS-15 | `_`-prefixed folders (for example `.trd-state/_docs-audit/`, `.trd-state/_shared/`) and folders with unsafe slugs are never seeded | .trd-state/cutover-for-existing-projects/evidence/it2-FS15-FS23-seed.txt | 2 |
| FS-16 | A finished feature's folder gets no ref and is reported in `skipped` with `reason: "finished"` | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-main.txt | iteration 2 (regression pass 1) |
| FS-17 | A folder whose recorded branch is not the branch checked out in its worktree gets no ref and is reported with `reason: "branch-mismatch"` | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-main.txt | iteration 2 (regression pass 1) |
| FS-18 | A folder whose records name no branch gets no ref and is reported with `reason: "no-branch"` | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-main.txt | iteration 2 (regression pass 1) |
| FS-19 | After the cutover, a finished feature's records remain readable from the history of the branch they were committed on | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs19-history.txt | iteration 2 (regression pass 1) |
| FS-20 | A ref that already exists locally is never seeded or overwritten: the slug is reported with `reason: "ref-exists"` and the ref still points at its original commit | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-main.txt | iteration 2 (regression pass 1) |
| FS-21 | A ref that exists on origin but not locally is never seeded or overwritten: the slug is reported with `reason: "ref-exists"`, and origin's ref still points at its original commit | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-main.txt | iteration 2 (regression pass 1) |
| FS-22 | When origin cannot be checked for an existing ref (for example origin unreachable), nothing is seeded for that folder: it is reported with `reason: "remote-unknown"` and the output carries `remoteError` | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs22-remote-unknown.txt | iteration 2 (regression pass 1) |
| FS-23 | A seeded ref's recorded Forge feature id is the folder's own: it is `shipped.json` `work.forge_feature_id` when present, and null when the folder has no such value, even when the session running the seed has `FORGE_FEATURE_ID` set to something else | .trd-state/cutover-for-existing-projects/evidence/it2-FS15-FS23-seed.txt | 2 |
| FS-24 | A seeded ref carries the evidence images the folder's `verification-report.md` references, alongside its records | .trd-state/cutover-for-existing-projects/evidence/regression-1/seed-details.txt | iteration 2 (regression pass 1) |
| FS-25 | `record-ref.js write` called without the `forgeFeatureId` key behaves as before, taking the Forge feature id from `FORGE_FEATURE_ID` in the environment; called with the key, the key's value is used instead | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs25-forge-id.txt | iteration 2 (regression pass 1) |
| FS-26 | `seed` pushes each seeded ref to origin by default, and with `--no-push` creates it locally without reaching origin; each `seeded` entry's `push` field says which happened | .trd-state/cutover-for-existing-projects/evidence/regression-1/fs26-no-push.txt | iteration 2 (regression pass 1) |
| FS-27 | In a scaffolded project, the vendored `--records-cutover` finds and runs the vendored `records-cutover.js` (from `.claude/lib/`, the scaffold's `../lib/`) and prints its JSON line after the `Untracked` lines | .trd-state/cutover-for-existing-projects/evidence/it2-FS27-vendored.txt | 2 |

## Not Met

| ID | Statement | Kind | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|------|--------|--------|---------|----------|
| FS-7 | The `/rebase-project` report lists the files it untracked, the refs it seeded and the features it skipped | evidence gap |  | Tier 1 failed: the claimed locator "other-feat has no worktree checked out" is not in the readout, which writes the slug in backticks. Read anyway, the readout names the seeded live-feat ref and the three skipped features with reasons, but gives only a count of untracked files (6), not their paths. |  |  |

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| rebase-rollback-omits-pushed-ref | FS-8 | 1 (FS-8) | closed at iteration 2 |
| cutover-seed-runs-before-untrack | FS-27 | 1 (FS-27) | closed at iteration 2 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | no-covers |  |
| FS-2 | no-covers |  |
| FS-3 | no-covers |  |
| FS-4 | no-covers |  |
| FS-5 | no-covers |  |
| FS-6 | no-covers |  |
| FS-7 | no-covers |  |
| FS-9 | no-covers |  |
| FS-10 | no-covers |  |
| FS-11 | no-covers |  |
| FS-12 | no-covers |  |
| FS-13 | no-covers |  |
| FS-14 | no-covers |  |
| FS-16 | no-covers |  |
| FS-17 | no-covers |  |
| FS-18 | no-covers |  |
| FS-19 | no-covers |  |
| FS-20 | no-covers |  |
| FS-21 | no-covers |  |
| FS-22 | no-covers |  |
| FS-24 | no-covers |  |
| FS-25 | no-covers |  |
| FS-26 | no-covers |  |

Caught: _none._

Not re-walked (covered files unchanged): FS-8, FS-15, FS-23, FS-27

Changed files no criterion covers: .claude/commands/rebase-project.md, packages/core/commands/rebase-project.md, packages/core/commands/records-cutover-prose.test.js, packages/core/scripts/scaffold-project.sh, packages/core/scripts/scaffold-project.test.sh, packages/full/commands/plugin-only/rebase-project.md

Captures the pass could not make (recorded, not retried):

| ID | Statement | Reason |
|----|-----------|--------|
| FS-7 | The `/rebase-project` report lists the files it untracked, the refs it seeded and the features it skipped | Tier 1 failed: the claimed locator "other-feat has no worktree checked out" is not in the readout, which writes the slug in backticks. Read anyway, the readout names the seeded live-feat ref and the three skipped features with reasons, but gives only a count of untracked files (6), not their paths. |

