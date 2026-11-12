# TRD: stop-run-record-dumps-on-main

**Source PRD**: None — small change decided by the owner, relayed by Forge's PM 2026-11-11 ("Yes on run records. Need to stop that."); brief `docs/plans/fix-run-record-dumps-on-main/brief.md` (feature F-1 of workplan fix-run-record-dumps-on-main)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A product scaffolded or rebased by Ensemble ignores verification evidence, verifier findings and the verification loop's per-iteration scratch files (`judge-*`, `record-*`, `setup-decide-*` JSON) under `.trd-state/`, at the feature level and under nested `reverify/` and `reverify/retry/` | brief § Expected; owner ruling 2026-11-11 | yes |
| O2 | When the scaffold or `--git-files` runs, already-tracked files those lines match are removed from the index only: staged, never committed, still on disk | brief § Expected | yes |
| O3 | The durable records stay tracked and are matched by no new line: `closed.json`, `shipped.json`, `custody.json`, `verification-state.json`, `implement.json`, `artifacts.json`, `success-definition.md`, `verification-report.md`, `verification-plan.md`, `audit-build-report.md` and the `audit-*` reports | brief § Expected | yes |
| O4 | `--refresh` adds the new lines but never changes the git index | owner decision 2026-11-11 (brief § Decisions) | |
| O5 | Ensemble's own repository ignores the same paths with the same depth, and its already-tracked scratch, evidence and findings files are untracked (index only) in this change, with the Jest battery still green on a fresh clone | owner decision 2026-11-11 (brief § Decisions) | |

## Intended Change

Before (ran 2026-11-11 in a temp repo holding the brief's sixteen files plus `reverify/retry/evidence/c.png`): `scaffold-project.sh --git-files .` adds only the four existing lines and all seventeen files stay tracked.

After: the same run adds these lines to `.gitignore`:

```
.trd-state/**/evidence/
.trd-state/**/findings/
.trd-state/**/judge-*.json
.trd-state/**/record-*.json
.trd-state/**/setup-decide-*.json
```

`git ls-files .trd-state` then lists exactly the nine durable files; the eight evidence/findings/scratch files are staged deletions and still on disk. A second run adds nothing. `--refresh` on a repo with an existing `.gitignore` adds the lines and leaves `git diff --cached` empty.

In Ensemble's own repo, `.gitignore` carries the same five lines (replacing the single-`*` evidence and findings lines), and every tracked file they match (313 scratch files and 26 evidence files as of 2026-11-11) is removed from the index, staged, files kept on disk.

## Decision

Use the brief's five `**` lines unchanged. `**` is needed because `/verify-build` re-proof writes into `reverify/` and `reverify/retry/`, which a single `*` does not reach.

`ensure_gitignore` needs one logic change, found by running it: a `:(glob)` pathspec that ends in `/` and contains a wildcard (`*` or `**`) matches nothing (`git ls-files ':(glob).trd-state/**/evidence/'` and `':(glob).trd-state/*/evidence/'` printed nothing while `':(glob).trd-state/**/evidence/**'` printed all three evidence files [ran]). So for a template line ending in `/`, the untrack pathspec appends `**`. The `.gitignore` line itself stays as written. This also covers the existing `.trd-state/_command-runs/` line, which already worked without it and keeps working with it [ran].

Refresh stays index-free (owner decision): it calls `ensure_gitignore` without `untrack`, as now. A test pins this.

The 26 tracked evidence files in Ensemble's own repo are the design-render walk boards, force-added on purpose under `.trd-state/task-dorch-t001-live-walk/evidence/boards/` (design-quality TRD D17) and read by `packages/core/lib/design-render-walk.test.js`. Untracking them as the owner ruled would leave CI's clone without them and fail that test. So they are copied, byte-identical, to `test/fixtures/design/walk/boards/` and the test reads from there. D17 considered that location and rejected it because the design-quality PRD cites the evidence path; the owner's untrack ruling now outweighs that, and the stale citation is listed below as not absorbed. The copied `README.md`'s paragraph about force-adding under an ignored folder is updated to say where the files now live; the evidence copy is then untracked like every other evidence file and stays on disk.

absorbed:     `ensure_gitignore` cannot untrack a `**/dir/` line — without the pathspec fix O2 fails for evidence and findings  [BLOCKS]
absorbed:     walk-board fixture tracked under `evidence/` and read by a Jest test — untracking it (O5) without relocating fails CI  [BLOCKS]
absorbed:     existing BATS test "untracks only what the ignore line covers, not deeper nested paths" asserts `evidence/x/dispatch.jsonl` stays tracked, which the new evidence line now correctly untracks — the test must move its nested probe out of `evidence/`  [BLOCKS]
not absorbed: `board_source` paths in `test/design-critique-corpus/labels.jsonl`, its README, `.claude/verification-notes.md` and the design-quality PRD/TRD still name the old evidence path — provenance strings, read by nothing from disk; this change works without editing them

## Non-Goals

- The fuller "run records off the product branch" design (separate work).
- Making `--refresh` untrack anything.
- Ignoring any durable record listed in O3, or any `.trd-state/` file outside evidence, findings and the three scratch patterns.
- Committing the untracking in a product repo; scaffold and `--git-files` only stage it.
- Rewriting provenance paths in the design-quality documents or the critique corpus.

## Verification Artifacts

None apply — the change is a shell script, an ignore template, `.gitignore` and tests; no screen, design frame, data-rendering view or user journey is in scope.

## Verification Environment

**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: failures that occur only on the GitHub Actions runner (verification.md §5)

## Open Questions

None. The brief's three were settled by the owner on 2026-11-11 (refresh stays index-free; ignore all of `evidence/`, accepting that Forge's artifact-image tool can no longer serve a finished feature's evidence images from git; untrack Ensemble's own files in this change).

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add the five ignore lines to the product ignore template, rewrite its header comment (name the new exception and its reason — bulky per-run scratch, reproducible by re-running the loop, holding no decision — and list the durable records that stay tracked), and make `ensure_gitignore`'s untrack pathspec append `**` to a line ending in `/` | O1, O2, O3, O4 | None | In a temp repo with the brief's files plus `reverify/retry/evidence/c.png` committed, `scaffold-project.sh --git-files .` leaves `git ls-files .trd-state` listing exactly the nine durable files (fails today: all seventeen listed); the eight others are staged deletions and exist on disk; `git log` still has one commit |
| FIX-002 | BATS tests in `scaffold-project.test.sh`: (1) scaffold writes the new lines and a second run adds nothing; (2) `--git-files` untracks evidence, findings (incl. `findings/grounding/**`) and scratch at feature level and under `reverify/` and `reverify/retry/`, keeps them on disk, stages only, commits nothing; (3) every durable record in O3, at feature level and under `reverify/`, is neither ignored (`git check-ignore` matches none) nor untracked; (4) `--refresh` adds the new lines to an existing `.gitignore` and leaves the index unchanged even with matching tracked files; (5) update the line-count test "scaffold writes four ignore lines and three union lines" to the nine lines; also move the nested-depth test's probe out of `evidence/` so it still tests what it says | O1, O2, O3, O4 | FIX-001 | `bats packages/core/scripts/scaffold-project.test.sh` passes; tests (1), (2) and (4) fail against the pre-change template, and (2) fails against the pre-change `ensure_gitignore` |
| FIX-003 | Ensemble's own repo: replace the `.trd-state/*/findings/` and `.trd-state/*/evidence/` lines in `.gitignore` with the five `**` lines (keeping their comments accurate); copy the walk boards to `test/fixtures/design/walk/boards/` and point `design-render-walk.test.js` there; then `git rm --cached` every tracked file the five lines match | O5 | None | `git ls-files -ci --exclude-standard` prints nothing under `.trd-state/`; the untracked files remain on disk; `git ls-files test/fixtures/design/walk/boards` lists the 26 board files; full Jest battery passes |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/templates/gitignore-framework.txt`, `packages/core/scripts/scaffold-project.sh`
- **Reuse:** `ensure_gitignore` (`scaffold-project.sh:1778-1812`) already reads the template line by line, appends missing lines via `append_missing_line`, and untracks with `git rm --cached -r --quiet --ignore-unmatch -- ":(glob)$line"` [read]. `packages/full/templates` and `packages/full/scripts` are symlinks to `packages/core/`, so there is no copy to regenerate [ran].
- **Replaces:** the header comment at template lines 1-4, which says per-feature state is deliberately not listed except dispatch logs [read]. In `ensure_gitignore`, `local spec=":(glob)$line"` becomes that plus `**` when `$line` ends in `/` [ran: the trailing-slash `**` pathspec matches nothing].
- **Follow:** keep comment lines starting `#`; `ensure_gitignore` skips them and blank lines [read]. Keep the pathspec quoted so git, not the shell, expands it.
- **Careful:** the `.gitignore` line must stay exactly as written (only the pathspec gets `**`), or the whole-line idempotence check re-appends it. Refresh (`scaffold-project.sh:1899-1901`) must keep calling `ensure_gitignore` with no argument. No durable name starts with `judge-`, `record-` or `setup-decide-` [read: verify-functional.js:579-582, 874, 927-928 are the only writers].

### FIX-002
- **Touches:** `packages/core/scripts/scaffold-project.test.sh`
- **Reuse:** the tests at ~2797 (line count), ~2813 (refresh never changes the index), ~2829 (untrack keeps the file, stages only, one commit) and ~2874 (nested depth) are the models: `cd "$TEST_DIR"`, `git init -q .`, local user config, `run "$SCAFFOLD_SCRIPT" --git-files "$TEST_DIR"` [read]. `_get_plugin_dir` supplies the plugin dir for scaffold and refresh [read].
- **Replaces:** the `for l in ...` list in the line-count test (four lines → nine) [read]. In the nested-depth test, `.trd-state/feat/evidence/x/dispatch.jsonl` is now ignored by the new evidence line, so its probe moves to a non-evidence folder such as `.trd-state/feat/notes/x/dispatch.jsonl` [inferred].
- **Follow:** create files with `mkdir -p` + `echo`; assert with `git ls-files`, `git diff --cached --name-only`, `git check-ignore`, `git log --oneline | wc -l`.
- **Careful:** `git check-ignore` exits 1 when nothing matches — use `run git check-ignore ...` and assert `status -eq 1`, not a bare call. The refresh test needs a scaffolded `.claude/` or the refresh path may stop before `ensure_gitignore`; follow the existing refresh test's setup.

### FIX-003
- **Touches:** `.gitignore`, `packages/core/lib/design-render-walk.test.js`, `test/fixtures/design/walk/boards/` (new)
- **Reuse:** `git rm --cached -r --quiet -- ':(glob).trd-state/**/evidence/**' ':(glob).trd-state/**/findings/**' ':(glob).trd-state/**/judge-*.json' ':(glob).trd-state/**/record-*.json' ':(glob).trd-state/**/setup-decide-*.json'` [ran: these pathspecs list 26 + 0 + 291 + 2 + 20 files].
- **Replaces:** `.gitignore:73-80` single-`*` findings and evidence lines [read]. `design-render-walk.test.js:14` `BOARDS` path under `.trd-state/task-dorch-t001-live-walk/evidence/boards` [read].
- **Follow:** copy the whole `boards/` folder preserving layout (`design-render.js` resolves `_design-system/` relative to it, per design-quality TRD D17) [read]. Update the test file's header comment and the copied `README.md`'s last paragraph, both of which say the boards are force-added under an ignored folder; the board files themselves stay byte-identical. Update the `.gitignore` comment above the evidence line to mention the scratch patterns.
- **Careful:** untrack only after the fixture copy is staged, or the test reads nothing on a fresh clone. Do not delete the on-disk evidence copies. `.trd-state/*/implement.lock`, `dispatch.jsonl` and `_command-runs/` lines stay as they are.

## Could Not Verify

- That nothing outside this repo (beyond Forge's artifact-image tool, accepted by the owner) reads these files from git — taken from the brief's reader survey, not re-run here.
- Transitional only: a branch cut before this lands that already committed new scratch files brings them back to `main` on merge (ignore rules do not stop a merge adding files), and a branch editing a file `main` has just untracked gets a modify/delete conflict. Low likelihood, since scratch names are per feature and per iteration.
- `design-render-walk.test.js` needs Chromium; if it is not installed locally the relocated fixture is proven only on CI.
