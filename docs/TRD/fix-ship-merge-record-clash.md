# TRD: fix-ship-merge-record-clash

**Source PRD**: None — small change decided by the owner on 2026-11-09 (GitHub issue 97, FortiumPartners/ensemble-vnext; workplan fix-ship-merge-record-clash, feature F-1)

**Kind**: change · **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A scaffolded project's root `.gitattributes` carries `.claude/verification-notes.md merge=union`, on the initial scaffold and on `--refresh`: the file is created when absent, the line appended when missing, no other line changed or reordered, and the line never duplicated | owner brief 2026-11-09, expected change 1 | yes |
| O2 | When `/ship-build`'s merge step finds the PR unable to merge with its base and the only clashes are in framework-written record files (`.claude/verification-notes.md`, anything under `.trd-state/`), it merges the base in, keeps both sides of each clashing file, commits, pushes and waits for CI on the new head, then runs the custody gate and merges, instead of stopping | owner brief 2026-11-09, expected change 2 | yes |
| O3 | When any other path clashes, or a resolved `.json` record file does not parse, the merge step leaves the branch as it was and stops, naming the offending paths | owner brief 2026-11-09, expected change 2 and decision on JSON | yes |
| O4 | The record-file rule is one exported definition that `custody.classifyPath` and the clash check both use, so the two cannot disagree | owner brief 2026-11-09, "ONE shared definition" | |

## Intended Change

Before (all `[ran]` or `[read]` 2026-11-09 on main at 5bbd2e8):

- `packages/core/scripts/scaffold-project.sh` writes no `.gitattributes` in either mode `[read]`.
- `packages/core/contracts/ship-primitive-merge.md` never asks whether the PR can merge; its step 1 is the custody gate, and a clash surfaces only as a failed `gh pr merge`, which returns `stop` with gh's message (line 39) `[read]`.
- `packages/core/lib/custody.js` holds the record-file rule privately: `FRAMEWORK_WRITTEN` (line 95, not exported) plus an inline `.trd-state/` prefix test in `classifyPath` (line 100) `[read]`.
- Reproduced in a scratch repo: a feature branch and its base each change `.claude/verification-notes.md` and `.trd-state/current.json`; `git merge --no-commit --no-ff main` stops with "Automatic merge failed" and `git diff --name-only --diff-filter=U` lists both paths (git 2.52.0) `[ran]`.
- Merged PRs on GitHub report `mergeable: UNKNOWN` permanently (islayjames/ship-build-live-test #1, #2, #5, read by the reviewer) `[ran]`.

After:

1. Scaffold and refresh both call one function, `ensure_gitattributes()`. It ensures that every rule line of a new template, `packages/core/templates/gitattributes-additions.txt` (one line: `.claude/verification-notes.md merge=union`), is present in `<project>/.gitattributes`. A failure in it warns and never aborts the scaffold or the refresh.
2. A new lib, `packages/core/lib/record-files.js`, exports:
   - `isRecordFile(path)`: true for `.claude/verification-notes.md`, for `.trd-state`, and for anything under `.trd-state/`; false for `.trd-statex/...`.
   - `classifyClash(paths)`, which returns `{ recordOnly, notRecord }`.
   - `mergeBase({ base, branch, prHead })`, also exposed as the CLI verb `merge-base-in --base <ref> --branch <name> --pr-head <sha>`, which prints one JSON line and exits 0.

   **The local merge is the source of truth for what clashes**, so the project's own `.gitattributes`, union line included, applies exactly as it would for a person merging. `mergeBase`:
   - refuses (`ok: false`, changing nothing) unless the current branch is `<branch>`, `HEAD` contains `<prHead>`, and no tracked file outside the record files has uncommitted changes;
   - runs `git merge --no-ff --no-commit <base>`;
   - lists unmerged paths (`git diff --name-only --diff-filter=U`);
   - with none, commits the merge and returns `outcome: "clean"`;
   - when every unmerged path is a record file, rewrites each as the union of both sides (`git merge-file --union` over index stages 2, 1 and 3, the base stage empty when absent), parses every resolved `.json`, then commits and returns `outcome: "resolved"`;
   - otherwise runs `git merge --abort` and returns `ok: false, outcome: "stopped"` with `notRecord` (the non-record paths) or the `.json` files that failed to parse. `HEAD` and the working tree are then as they were.

   A record path missing on one side (modify/delete) cannot be unioned; it stops the same way.
3. `custody.classifyPath` calls `isRecordFile` in place of `FRAMEWORK_WRITTEN` and its inline prefix test, and custody.js no longer defines a record-file list of its own. The work's TRD stays `ignored` through custody's separate `trdRel` check; it is not a record file.
4. `ship-primitive-merge.md` gains a new step 1, before the custody gate:
   - Read `gh pr view <pr> --json mergeable,state`. When it reads `MERGED`, skip this step. While `mergeable` reads `UNKNOWN`, poll up to 8 times, 15s apart; still `UNKNOWN`, go on to the gate, so that a real clash still stops at `gh pr merge` as it does today.
   - On `CONFLICTING`: `git fetch origin <base>`, then `record-files.js merge-base-in`.
   - On `ok: true` (`clean` or `resolved`): push the branch, poll until the PR's `headRefOid` equals the pushed commit (bounded as the gate's poll is), then wait for CI on that head as `wait-ci` does. A CI failure is a `stop`.
   - On `ok: false`: `stop`, naming the paths.

   Then the custody gate runs unchanged. The "One rule for every stop" list gains the new stops. The rule "commit and push nothing between the gate and `gh pr merge`" still holds, because the push happens before the gate.

## Decision

- **Keep the owner's record-file check, and decide clashes with a real local merge, not `git merge-tree`.** The reviewer showed that once the union line is present, git resolves the notes file itself, so a dry-run listing and GitHub can disagree. A real `git merge --no-commit` with the project's attributes is what will actually be committed, so its unmerged list is the right one. When GitHub says `CONFLICTING` and the local merge is clean, the merge is committed and pushed like any other.
- **Rejected: rely on `.gitattributes` alone** (extend the template with `.trd-state/**` union rules and drop the record-file check). Rejected because the owner specified one template line and a record-file check that names the paths that are not record files, and because projects not yet refreshed would get nothing.
- **One new module, `record-files.js`, holds the definition and the merge verb.** custody.js imports `isRecordFile` from it.
- **Union order is "ours, then theirs"**: the feature's lines first, then the base's, as `git merge-file --union` writes them and as the owner's reproduction shows.
- **Uncommitted record files are allowed.** The ship loop leaves `.trd-state/<feature>/shipped.json` uncommitted between steps, so refusing every dirty tree would make the fix do nothing on resumed runs. If the merge touches such a file, git refuses the merge, and the result is a stop carrying git's message. A merge that does not touch it leaves it as it was.
- **This repo gets the line too.** The repository root `.gitattributes` (absent today) is created with the same line, since this product's own parallel features clash on its committed `.claude/verification-notes.md`.
- **Two departures from local convention, both owner-ruled.** Root-file additions such as `gitignore-additions.txt` are applied by `/init-project` and never by `scaffold-project.sh`, and `--refresh` never creates a file. The owner ruled that this one line is written by the script in both modes, `.gitattributes` included. One consequence: in a project that lacks the line, the first refresh leaves `.gitattributes` uncommitted.
- **A `.trd-state/*.json` clash usually still stops**, because its union is rarely valid JSON (the owner ruled: abort and name the file). In practice the merge step resolves `.md` and `.jsonl` record files and the notes file.

absorbed: none. Nothing in the fix's path is broken.
not absorbed: re-verification after the base merge (out of scope by owner ruling). The custody gate runs unchanged. The note: after a base merge, a must-pass criterion whose files came in from the base can now make the gate return `reverify` and run `/verify-build` inside the merge step. That is the gate's existing rule meeting a new situation, not a change to it.

## Non-Goals

- Resolving clashes in code or in any other `.claude/` file (Forge's conflict-resolution session, islayjames/forge#265).
- Per-feature notes files.
- Narrowing or changing re-verification or the custody gate's own logic.
- Running the live check against a real GitHub PR clash (deferred; needs a scratch remote).

## Verification Artifacts

None apply — the change is a shell function, a Node lib and a contract prompt; no screen, design, data view or journey is in scope.

## Verification Environment
**Environment**: local
**Refresh**: nothing; tests and libraries read the working tree
**Cannot be checked there**: a real GitHub PR's `mergeable` field and a push to a live PR (github-live-test is the environment for that; deferred by the owner)

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `packages/core/lib/record-files.js` (`isRecordFile`, `classifyClash`, `mergeBase`, CLI verb `merge-base-in`); make `custody.classifyPath` use `isRecordFile` and delete custody's own list; symlink it into `packages/full/lib/` and copy both libs to `.claude/lib/`; add `packages/core/lib/record-files.test.js` | O2, O3, O4 | None | In temp repos (no `.gitattributes` unless stated): (a) branch and base both edit `.claude/verification-notes.md` and `.trd-state/current.json` → `classifyClash` of the unmerged list says `recordOnly: true`; adding a clash in `src/app.js` → `mergeBase` returns `ok: false, outcome: "stopped"`, `notRecord: ["src/app.js"]`, and `HEAD` and `git status --porcelain` match their values before the call. (b) a notes-only clash → `outcome: "resolved"`, a new merge commit whose notes file holds the feature line then the base line, with no conflict markers. (c) a `.trd-state/x.json` clash whose union is invalid JSON → `ok: false` naming that file, branch unchanged. (d) the same notes clash with a `.gitattributes` union line → `outcome: "clean"`, both lines kept. (e) a wrong current branch, a `--pr-head` not in `HEAD`, or an uncommitted change to `src/app.js` → refused, `HEAD` unchanged; an uncommitted change under `.trd-state/` that the merge does not touch → allowed, and still uncommitted afterwards. (f) for `.claude/verification-notes.md`, `.trd-state/x/y.json`, `.trd-statex/file`, `.claude/other.md` and `src/app.js`, `isRecordFile` is true exactly for the first two, and `custody.classifyPath` (no TRD) returns `ignored` exactly for those two. (g) custody.js requires `./record-files` and contains no `FRAMEWORK_WRITTEN` |
| FIX-002 | Add the new step 1 to `packages/core/contracts/ship-primitive-merge.md`, renumber the rest, extend "One rule for every stop", mirror it to `.claude/contracts/`, and update `ship-primitives.test.js` | O2, O3 | FIX-001 | `ship-primitives.test.js` asserts, in text order and before `ship-custody-gate.md`: `--json mergeable,state`, the `MERGED` skip, the bounded `UNKNOWN` poll, `record-files.js merge-base-in`, a push, the wait for `headRefOid` to equal the pushed commit, and the CI wait. It also asserts that the `ok: false` stop names the paths and that the new stops appear in "One rule for every stop". Each of those assertions fails against today's contract. The existing ordering assertions (gate, pr-head, `gh pr merge`, merge link) and "commit and push nothing between the gate and `gh pr merge`" still pass; the "already MERGED skips to step 3" assertion is updated to step 4 |
| FIX-003 | Add `ensure_gitattributes()` to `scaffold-project.sh`, reading `packages/core/templates/gitattributes-additions.txt`, called from both `scaffold_project()` and `refresh_project()`; add a BATS case; add this repo's root `.gitattributes` with the line | O1 | None | One BATS case: a fresh scaffold's `.gitattributes` contains the union line; a target whose `.gitattributes` holds only `*.png binary` with no trailing newline keeps that line, unchanged, as its first line and gains the union line on its own line after `--refresh`; a second `--refresh` leaves exactly one union line. The full `scaffold-project.test.sh` suite passes. Each assertion except "keeps `*.png binary`" fails against today's script |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/record-files.js`, `packages/core/lib/record-files.test.js`, `packages/core/lib/custody.js`, `packages/full/lib/record-files.js`, `.claude/lib/record-files.js`, `.claude/lib/custody.js`
- **Reuse:** custody.js's `run()` pattern: `spawnSync` with an argument array, never a shell `[read]`. The CLI convention: one JSON line on stdout, exit 0 even on refusal (custody.js header) `[read]`. custody.test.js's `tmp()`/`cleanEnv()` temp-repo pattern `[read]`.
- **Replaces:** `FRAMEWORK_WRITTEN` (custody.js:95 at 5bbd2e8) and the inline `.trd-state` test (custody.js:100 at 5bbd2e8); both are deleted, and `classifyPath` now calls `isRecordFile` (custody.js:99). Update custody.js's header classification note to point at record-files.js `[read]`.
- **Follow:** `packages/full/lib/*.js` entries are symlinks to `../../core/lib/<file>` `[read]`. `.claude/lib/` copies must match their source byte for byte (runtime-integrity.test.sh "every file mirrored into .claude/ matches its packages/ source") `[read]`. record-files.js must not require custody.js (that would be a cycle).
- **Careful:** `git merge --abort` keeps uncommitted changes in files the merge did not touch, and git refuses a merge that would overwrite a dirty file, so a refusal there is a stop carrying git's message. Read index stages with `git show :1:<p>`, `:2:<p>` and `:3:<p>`; a missing `:1:` means an empty base, and a missing `:2:` or `:3:` means a stop. Commit with `git commit --no-edit`. Test repos set `user.name`/`user.email` locally and run under a clean env.

### FIX-002
- **Touches:** `packages/core/contracts/ship-primitive-merge.md`, `.claude/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the `wait-ci` primitive's waiting (`gh pr checks <pr>`, `Monitor`, `timeout_ms: 1800000`), cited not restated (`ship-primitive-wait-ci.md`) `[read]`; the gate's bounded head poll (8 times, 15s apart) as the model for both new polls (`ship-custody-gate.md` step 1) `[read]`.
- **Replaces:** today's step 1 "Run the custody gate first" becomes step 2, and the steps after it move down by one `[read]`.
- **Follow:** numbered `## Do` steps, exact commands in fences, every stop listed under "One rule for every stop" `[read]`. Write the new read as `gh pr view <pr> --json mergeable,state`, so that the existing test that `ship-custody-gate.md` precedes `gh pr view <pr> --json state` keeps meaning the old state read `[read]`.
- **Careful:** a CI failure on the new head is a `stop`, so the merge never runs on red. The `MERGED` skip must come before the `UNKNOWN` poll, because merged PRs read `UNKNOWN` forever.

### FIX-003
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/templates/gitattributes-additions.txt`, `.gitattributes`
- **Reuse:** `$TEMPLATES_DIR` (scaffold-project.sh:44), `info`/`warn` helpers `[read]`; the test's `_get_plugin_dir` and `run "$SCAFFOLD_SCRIPT" --refresh --plugin-dir ...` pattern (scaffold-project.test.sh:479-517) `[read]`.
- **Replaces:** nothing; this is new.
- **Follow:** comment the function as the owner-ruled exception beside the refresh_project() comment block `[read]`. Skip the template's comment and blank lines, match lines whole (`grep -qxF` inside an `if`, since the script runs under `set -euo pipefail`), and add a newline before appending when the file lacks a trailing one.
- **Careful:** `refresh_project` must still print `REFRESH_SUMMARY` as its last stdout line; call the new function before the version stamp `[read]`. A write failure warns and returns 0. Both callers have already `cd`'d into the target `[read]`.

## Could Not Verify

After /audit-build, 2026-11-10:

- A real GitHub PR's `mergeable` value and the push, head-poll, CI and gate sequence on a live PR are not exercised; the owner deferred that live check (Non-Goals). FIX-002's tests check the contract's text and order only. Out of scope for this audit, which reads code and tests in the local tree.
- Whether GitHub honours `merge=union` when computing `mergeable` is unknown. The design does not depend on it: a `CONFLICTING` PR whose local merge is clean is merged locally and pushed. Out of scope for the same reason.
- No PRD exists for this change (the source is the owner's 2026-11-09 brief), so the audit checked the delivered code against this TRD only; whether the TRD faithfully and completely captures the owner's brief was not checked.
- The external references in the header and Non-Goals (GitHub issue 97 on FortiumPartners/ensemble-vnext, workplan feature F-1, islayjames/forge#265) live outside this repository and were not resolved.
