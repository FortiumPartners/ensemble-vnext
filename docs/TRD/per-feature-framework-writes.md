# TRD: per-feature-framework-writes

**Source PRD**: None — small change decided by the owner (feature F-1 of workplan ship-churn-fixes, 2026-11-10 ruling)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Two features built in parallel on one project scaffolded by Ensemble merge into the base in either order with no conflict on any framework-written file | owner instruction, 2026-11-11 (workplan ship-churn-fixes F-1) | yes |
| O2 | Every framework-written file that is shared across features is either untracked (gitignored) or union-merged; a newly scaffolded project (`/init-project`) and an existing project refreshed or rebased (`--refresh`, `/rebase-project`) both receive the ignore lines and the union lines | owner instruction, 2026-11-11 | yes |
| O3 | An existing project that already tracks `.trd-state/current.json` stops tracking it, and the file stays on disk | owner instruction, 2026-11-11 | yes |
| O4 | `isRecordFile` in `packages/core/lib/record-files.js` stays the one definition of a record file; every union-merged path is a record file by that definition | owner instruction, 2026-11-11 | |

## Intended Change

**Today** [read]:
- `packages/core/templates/gitignore-additions.txt` is applied only by an LLM step in `/init-project` (Step 11 of `packages/core/commands/init-project.md`); no script applies it, so `/rebase-project` and `--refresh` never deliver it. Its comment block tells projects to COMMIT `.trd-state/current.json`, and it has no line for `.trd-state/_dispatch.jsonl` or `.trd-state/_command-runs/`.
- `scaffold-project.sh` writes `.trd-state/current.json` from a template at scaffold (line 1913) — so a new project's first commit tracks it, and every feature branch rewrites it (a merge conflict by construction).
- `dispatch-ledger.js` appends `.trd-state/_dispatch.jsonl` when no feature is active; `router.py` / `notify-complete.sh` write `.trd-state/_command-runs/<session>.json`. Both shared, both tracked in a scaffolded project.
- `precompact.js` (lines 55-59) falls back to one shared, append-only `.trd-state/_session-log.md` when `current.json` names no TRD.
- `/sweep` appends discovered-but-not-done items to one shared `.trd-state/_sweep/discovered.jsonl` (`packages/core/commands/sweep.md` Step 4; `discovered.js` `ledgerPath`), from whichever feature branch it runs on.
- `ensure_gitattributes()` (scaffold-project.sh:1712) writes lines from `templates/gitattributes-additions.txt` (today only `.claude/verification-notes.md merge=union`) on scaffold and `--refresh`, but `/rebase-project` never calls it.

**After**:
1. A new template `packages/core/templates/gitignore-framework.txt` lists the framework's per-session, shared working-state files: `.trd-state/current.json`, `.trd-state/_dispatch.jsonl`, `.trd-state/*/dispatch.jsonl`, `.trd-state/_command-runs/`. A new `ensure_gitignore()` in `scaffold-project.sh` appends each missing line to the project's `.gitignore` (same whole-line, idempotent, never-touch-other-lines, warn-and-return-0 contract as `ensure_gitattributes()`), then — only when asked to untrack (scaffold and the `--git-files` mode, never `--refresh`) and only inside a git work tree — runs `git rm --cached -r --quiet --ignore-unmatch` on each listed path that is currently tracked, so the file stays on disk and only the index entry goes (staged, never committed), and prints that the removal should be committed on the base branch.
2. `gitattributes-additions.txt` gains `.trd-state/_session-log.md merge=union` and `.trd-state/_sweep/discovered.jsonl merge=union` (both append-only logs that have no feature to move under).
3. `ensure_gitignore` runs wherever `ensure_gitattributes` runs (scaffold and `--refresh`), and a new strict standalone mode `scaffold-project.sh --git-files [dir]` runs both; `/rebase-project` calls it as a new always-run step just before its version stamp (4.8). `/init-project` Step 11 says the framework lines are written by the scaffold script, and `gitignore-additions.txt` stops telling projects to commit `current.json`.
4. This repository's own `.gitattributes` gains the two new union lines (it is itself a scaffolded project).
5. The non-strict version stamp (`stamp_ensemble_version` without `strict`, run by scaffold and `--refresh`) stops rewriting `ensemble.refreshed_at` in `.claude/settings.json`; it writes only `ensemble.version` (plus the existing `setdefault` backfills). Two feature branches that each refresh to the same plugin version then make byte-identical edits to `settings.json` and merge cleanly. The strict `--stamp-version` (run by `/rebase-project`, owner-invoked) keeps writing `refreshed_at` and `rebased_at`. Nothing in the framework reads `refreshed_at` [ran: grep over packages/core, packages/router, test].

Checkable outcome: on a fixture repo scaffolded by the script, two branches that each run framework writes (pointer, ledger fallback, command-run state, session-log fallback, sweep ledger, verification notes, their own `.trd-state/<feature>/` files) merge into the base in either order with zero conflicts — and the same scenario WITHOUT the new lines (control) does conflict.

## Decision

Deterministic, not prompted: the ignore and union lines are delivered by `scaffold-project.sh` functions, never by an LLM step, because an LLM step (today's `/init-project` Step 11) is exactly why existing projects never received them.

A SEPARATE template (`gitignore-framework.txt`) rather than running all of `gitignore-additions.txt` on refresh: that file also carries `.env`, editor and OS lines, which a silent refresh must not push into an existing project's `.gitignore`. The framework template holds only files the framework itself writes.

Untrack with `git rm --cached` (index only) and stage it; never commit (constitution prohibition 5 spirit: stage only). Skip silently outside a git work tree. **Never untrack from `--refresh`**: it runs unattended at session start on whatever branch is checked out, so a staged deletion there lands on one feature branch and gives a modify/delete conflict against a sibling that did not refresh; it would also break refresh's "never touches git state" convention. Untracking happens only at scaffold and in `--git-files`, which `/rebase-project` runs on the owner's say-so; its report tells the owner to commit the removal on the base branch.

`_session-log.md` and `_sweep/discovered.jsonl` get union lines rather than being ignored: both are append-only logs whose content matters across sessions (a lost discovery is rediscovered three sessions later). Neither has a feature to move under: the session-log fallback fires precisely when no TRD is named, and `/sweep` items are not tied to a feature.

`isRecordFile` is not changed — both union paths are under `.trd-state/`, which it already covers; a Jest test asserts every path in `gitattributes-additions.txt` satisfies `isRecordFile`, so the template and the one definition cannot drift.

Scaffold still writes `current.json` from its template; with the ignore line in place it is untracked local state, which is what every command already expects ("absent on a fresh clone").

absorbed:     `/rebase-project` never calls `ensure_gitattributes` — the union lines cannot reach existing projects through rebase without it  [BLOCKS]
absorbed:     `.trd-state/_sweep/discovered.jsonl` is a shared tracked append-log — two parallel features that each run `/sweep` conflict on it  [BLOCKS]
absorbed:     `ensemble.refreshed_at` in `.claude/settings.json` is rewritten with a fresh timestamp by every session-start refresh (`scaffold-project.sh:1585`), which runs on every feature branch cut from a base whose stamp lags the installed plugin — two parallel branches then conflict on a non-record file  [BLOCKS] (O1). Fix: the non-strict stamp writes only `version`; no key is removed, so no schema change.
not absorbed: `docs/ui/<slug>/design-map.json` — a design document, edited per board when a feature builds from a design; two features building different boards touch different entries. Not framework working state; reported as a finding.
not absorbed: `/audit-docs` writes `.trd-state/_docs-audit/last-run.json` and `docs/{PRD,TRD}/INDEX.md` — on its own review branch, never on a feature branch. Reported as a finding.

## Non-Goals

- No change to `/ship-build`'s merge step or to `record-files.js` merge logic.
- No change to `.claude/settings.json` schema (`refreshed_at`).
- No auto-commit: the index removal is staged, never committed.
- Not moving per-feature files (they are already under `.trd-state/<feature>/`).

## Verification Artifacts

None apply — no screen, design or data-rendering view; this is shell, templates and command prose, proved by BATS and Jest.

## Verification Environment

**Environment**: local (and a throwaway git repo in a BATS temp dir)
**Refresh**: nothing — tests read the working tree
**Cannot be checked there**: GitHub-hosted merges (not needed: the conflict behaviour is git's own, identical locally)

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Stop the non-strict version stamp writing `ensemble.refreshed_at`; add `templates/gitignore-framework.txt`; add the two union lines to `templates/gitattributes-additions.txt`; add `ensure_gitignore()` (append missing lines, then untrack tracked listed paths with `git rm --cached` inside a work tree) to `scaffold-project.sh`; call it beside both `ensure_gitattributes` calls; add a strict `--git-files` mode running both; add the two union lines to this repo's `.gitattributes` | O2, O3 | None | Scaffold of a fresh dir writes all four ignore lines and all three union lines; `--refresh` and `--git-files` on a project lacking them add them once, leave other lines untouched, and a second run changes nothing; in a git repo where `current.json` is tracked, after `--git-files` `git ls-files .trd-state/current.json` is empty and the file still exists with unchanged content; `--refresh` never changes the git index; after `--refresh` on a project already at an older version, `.claude/settings.json`'s `ensemble.refreshed_at` is unchanged while `ensemble.version` is updated; `--stamp-version` still writes `refreshed_at`; outside a git repo it exits 0 |
| FIX-002 | Update `/rebase-project` (new always-run step before 4.8 calling `scaffold-project.sh --git-files .`, reporting what it added/untracked and telling the owner to commit an untracking on the base branch; fix the stale line ~151 claiming `.gitignore` excludes only `*.local.*`; note 4.8 still writes `refreshed_at`), `/init-project` Step 11 (framework lines come from the scaffold script; keep user additions) and line ~618 (scaffold no longer stamps `refreshed_at`), and the `gitignore-additions.txt` comment block (stop saying commit `current.json`; name the untracked framework files). Keep the three byte-identical copies of each command in step: `packages/core/commands/`, `.claude/commands/`, `packages/full/commands/plugin-only/` | O2 | FIX-001 | `rebase-project.md` names `--git-files` in an always-run step; `gitignore-additions.txt` no longer says `current.json` should be committed; the three copies are identical; `scaffold-project.test.sh` and `runtime-integrity.test.sh` pass |
| FIX-003 | Tests: extend `scaffold-project.test.sh` (ignore lines on scaffold/refresh/`--git-files`, idempotent, untrack keeps file); new BATS `test/integration/tests/parallel-feature-merge.test.sh` — scaffold a fixture git repo, commit base, make two feature branches that each perform the framework writes, merge into base A-then-B and B-then-A with zero conflicts, plus a control (same writes with the new lines removed) that DOES conflict; Jest test in `record-files.test.js` that every path in `gitattributes-additions.txt` satisfies `isRecordFile` | O1, O2, O3, O4 | FIX-001 | New BATS passes both orders; control conflicts (so the test can fail); Jest assertion passes and fails if a non-record path is added to the template |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/templates/gitattributes-additions.txt`, `packages/core/templates/gitignore-framework.txt`, `.gitattributes`
- **Reuse:** `ensure_gitattributes()` at scaffold-project.sh:1712 — copy its loop (skip blank/`#` lines, `grep -qxF` whole-line match, trailing-newline guard, warn-and-return-0) [read]; mode parsing pattern of `--stamp-version` at lines 91-150 and dispatch at ~2038 [read]
- **Replaces:** nothing deleted; the LLM-only delivery in init-project Step 11 is superseded for the framework lines [read]
- **Follow:** callers have already `cd`'d into the target; use `git -C . rev-parse --is-inside-work-tree` to gate untracking; quote every variable; `set -euo pipefail` is in force, so every git call needs `|| true`/explicit handling
- **Careful:** `refresh_project` must stay "never fails on a missing hint" — untracking errors warn, never exit non-zero; the `REFRESH_SUMMARY` line must remain the final stdout line; `.trd-state/*/dispatch.jsonl` is a glob — pass it to `git rm --cached` as a pathspec (quoted), which git expands itself

### FIX-002
- **Touches:** `packages/core/commands/rebase-project.md`, `packages/core/commands/init-project.md`, `packages/core/templates/gitignore-additions.txt`, `.claude/commands/rebase-project.md`, `.claude/commands/init-project.md`, `packages/full/commands/plugin-only/rebase-project.md`, `packages/full/commands/plugin-only/init-project.md`
- **Reuse:** rebase-project.md §4.8 wording and bash block shape [read]
- **Replaces:** the "current.json - Current feature pointer" under "SHOULD be tracked" in gitignore-additions.txt [read]
- **Follow:** command prose style per `.claude/rules/command-status.md` (outcomes, glossed terms)
- **Careful:** `scaffold-project.test.sh:2596-2597`, `:2760-2769` and `runtime-integrity.test.sh:363-364`, `:393-394` require the three copies of each command to be byte-identical [read by reviewer]; edit the core copy, then copy it over the other two

### FIX-003
- **Touches:** `packages/core/scripts/scaffold-project.test.sh`, `test/integration/tests/parallel-feature-merge.test.sh`, `packages/core/lib/record-files.test.js`
- **Reuse:** existing test `gitattributes: scaffold and --refresh keep the record-file union line` at scaffold-project.test.sh:2772 [read]; `record-files.test.js` setup helper and the union-line test at line 130 [read]
- **Follow:** fixture repo in a `mktemp -d` dir, `git -c user.name=t -c user.email=t@t` for commits, never touch the real repo; scaffold without `--plugin-dir` is enough for template/gitattributes/gitignore writes [inferred]
- **Careful:** add a case in which both branches run `--refresh` against an older stamped version and still merge cleanly on `.claude/settings.json`; the control case must genuinely conflict (e.g. both branches rewrite `current.json` and append to `_sweep/discovered.jsonl`) — otherwise the main assertion proves nothing; `.gitattributes` union only applies when the file is committed on the base before branching

## Could Not Verify

- Whether GitHub's server-side pull-request merge honours `merge=union` from `.gitattributes` is not established. It does not affect `/ship-build`, which merges the base in locally first (`record-files.js` merge-base step), and the ignore lines (the main fix for `current.json` and the ledgers) do not depend on it.
- Rollout: a project that tracked `current.json` before this change is clean only once the untracking is committed on its base branch; until then a feature branch that rebased and one that did not can still meet a modify/delete on that file. `/rebase-project`'s report says so; no test covers that transitional state.
