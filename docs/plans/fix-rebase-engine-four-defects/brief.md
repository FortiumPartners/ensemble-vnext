# Brief: four defects in the scripted rebase (skill selection, dry-run report, temp file, banner totals)

The owner's list, verbatim (only flag tokens changed, to "double-dash <name>"):

> Four defects in the new scripted rebase (engine `scaffold-project.sh` double-dash rebase, PR #181; prompt packages/core/commands/rebase-project.md, PR #183), found by the after-change timing run (.trd-state/rebase-project-fast/after.md, 2026-11-20). (1) Regression: the engine selects skills only from .claude/selected-skills.txt, so a project without that file (anything scaffolded before it existed, e.g. the v4.15.0 fixture) gains no stack-matched skills on a rebase; the old prompt added the jest skill to that fixture from its stack.md. Expected: with no selected-skills.txt, the engine derives the selection from stack.md through the existing reconcile_selected_skills() logic (as the scaffold does), writes the file, and copies the selected skills; the readout no longer tells the owner to re-run /init-project for this. (2) The engine reports settings.written: true on double-dash dry-run while writing nothing (re-run on a clean slot: git status empty, written true). Expected: written is false on a dry run (report would_write instead if useful). (3) The prompt lets the model save the engine result to a fixed /tmp file; a stale /tmp/rr.txt owned by another OS user made it read another project's result and re-run the engine. Expected: the prompt pipes or captures the engine result directly (or uses a per-run mktemp path), never a fixed /tmp name. (4) The readout banner's added-file totals are model arithmetic and were wrong (64 and 52; actual 49 framework files plus 2 git files). Expected: the banner totals come from the engine's machine-readable counts (have the engine print totals), not from the model adding. How to check: BATS cases for (1) no selected-skills.txt plus a stack.md naming Jest yields the jest skill and a written selected-skills.txt, and (2) dry-run reports written false; a prose test that the prompt names no fixed /tmp result file and takes banner totals from the engine's totals. All four fail today.

Context for all four. The rebase engine is `packages/core/scripts/scaffold-project.sh` run in its rebase mode (function `rebase_project()`, line 2915 on `main` at `c115ebf3`); it plans every change in an embedded Python program (`def plan(` line 2691, `def apply(` line 2864), applies it, runs post-copy steps (`rebase_post_steps()`), and prints one line `REBASE_RESULT <json>` as its last stdout line. The prompt `packages/core/commands/rebase-project.md` (434 lines) makes one engine call (Step 1, line 191) and writes a readout from that JSON. Line numbers below are on `origin/main` (`c115ebf3`); the main checkout was 31 commits behind when this was written, so read the files at `origin/main`. The four issues are independent: none needs another built first, though 2 and 4 both touch the engine's result JSON and 1, 3 and 4 all touch the prompt.

Reproduction used throughout: unpack the baseline fixture `.trd-state/rebase-project-fast/evidence/fixture/rebase-fixture-v4.15.0.tar.gz` (in the `feature/40-after-change-rebase-timing` worktree; sha256 `10b4d39d…6272fc496`) into a scratch folder, then run `bash packages/full/scripts/scaffold-project.sh` with the rebase flag, the plugin-dir flag pointing at `packages/full`, and the fixture path, once with the dry-run flag and once without, keeping the last stdout line.

## 1. A project with no selected-skills.txt gains no stack-matched skills on a rebase

### Steps
1. Unpack the fixture. It has no `.claude/selected-skills.txt`; its `.claude/rules/stack.md` says "Node.js (no framework). Jest available if needed."; `.claude/skills/` holds only framework skills (design-grounding, design-setup, designing-on-canvas, verification-setup, the four verify-* skills).
2. Run the engine in apply mode on it.

### Expected
With no `selected-skills.txt`, the rebase derives a stack-matched selection from `stack.md` (for this fixture, at least `jest`), writes `selected-skills.txt`, copies the selected skill folders from the plugin's `skills-lib/`, and then the existing `selection` and `preloads` steps run on it, so the agents preload the new skills. On a dry run the derived selection is reported and nothing is written. The readout no longer advises re-running `/init-project` to get stack skills.

### Actual
Reproduced 2026-11-20: `steps.selection` = `skipped: no selected-skills.txt or skills directory`, `steps.preloads` = `skipped: no selected-skills.txt or agents directory`; afterwards `.claude/skills/jest` does not exist and `.claude/selected-skills.txt` does not exist. The pre-engine prompt added `jest` to the same fixture (after.md, "The two resulting trees"). The after-change run's readout told the owner to re-run `/init-project`.

### Where
- `packages/core/scripts/scaffold-project.sh:1520` `render_plugin_tree()`: the render's selection is exactly the skill folders already installed in the target (decision D13, "the installed folder is the truth"), so nothing new can ever be selected.
- `packages/core/scripts/scaffold-project.sh:3029-3030` in `rebase_post_steps()`: the `selection` step skips when the file is missing; line 3045 does the same for `preloads`.
- `packages/core/scripts/scaffold-project.sh:1600` `reconcile_selected_skills()`: it only keeps the file in step with installed folders and returns early when the file is missing (line 1604). **It holds no stack.md logic**: the report's "through the existing reconcile_selected_skills() logic (as the scaffold does)" does not match the code. Stack-based selection at scaffold time is done by the model in `/init-project`, guided by `packages/core/templates/skill-selection-instructions.md`, whose "Reference: Common Skill Mappings" list (for example "Jest-configured projects → `jest`") is the only stack-to-skill table in the repository.
- `packages/core/commands/rebase-project.md:51`: the prompt states the engine "does not read `stack.md`".

### How to check
A new BATS case in `packages/core/scripts/rebase-engine.test.sh`: a target with no `selected-skills.txt` and a `stack.md` naming Jest; after an apply, `.claude/skills/jest/SKILL.md` exists, `.claude/selected-skills.txt` exists and lists `jest`, and `steps.selection` is `ok`. A second case: the same target on a dry run reports the derived selection and writes neither file. Both fail on `main` today (reproduced above by hand).

## 2. A dry run reports settings.written: true while writing nothing

### Steps
1. Unpack the fixture (clean `git status`).
2. Run the engine with the dry-run flag; read `settings.written` from the result.
3. Run `git status` (short form).

### Expected
`settings.written` is `false` on a dry run. If the prompt needs to say a write would happen, the result carries a separate field (for example `settings.would_write: true`).

### Actual
Reproduced 2026-11-20: `{"mode":"dry-run","settings":{"written":true}, ...}`, every `steps` entry `not run`, and `git status` (short form) empty.

### Where
`packages/core/scripts/scaffold-project.sh:2663`: `plan_settings()` sets `sres["written"] = True` whenever it builds merged content, during planning, before and regardless of the apply stage; `write_settings()` (line 2667) is the only place a write happens and is not reached on a dry run (`rebase_project()` skips apply at line 2975 when dry-run). The prompt reads `written` (`rebase-project.md:205`). The existing BATS case "settings: dry-run reports the same settings lists as an apply and writes nothing" (`rebase-engine.test.sh:768`) does not assert `written`.

### How to check
A BATS case in `rebase-engine.test.sh`: a target whose `settings.json` differs from the plugin's; on a dry run `settings.written` is `false` (and `would_write` is `true` if that field is added) and the file's bytes are unchanged; on an apply `written` is `true`. Fails on `main` today.

## 3. The prompt lets the model save the engine result to a fixed /tmp file

### Steps
1. Read `rebase-project.md` Step 1 (lines 191-213).
2. Run `/rebase-project` on a machine where another OS user has left `/tmp/rr.txt`.

### Expected
The prompt tells the model to capture the engine's result directly (pipe the engine's stdout through `tail -n 1`, or a per-run `mktemp` path) and never to write it to, or read it from, a fixed `/tmp` name.

### Actual
In the after-change dry run the model wrote the result line to `/tmp/rr.txt`; the file existed and was owned by another user, so the write was denied and the model first read that stale file, which held another project's result (five conflicts the fixture does not have). It noticed, re-ran the engine piped, and lost about 3 s and one turn (after.md, "Issues found while measuring"). The prompt today says only "Read only the last line of standard output" (line 201); it neither names a capture method nor forbids a temp file. It contains no `/tmp` string at all, so a test that only checks for the absence of a fixed `/tmp` name passes today and proves nothing.

### Where
`packages/core/commands/rebase-project.md:195-201` (the Step 1 command block and the "Read only the last line" paragraph).

### How to check
A Jest prose test beside `packages/core/commands/records-cutover-prose.test.js` that reads `rebase-project.md` and asserts both: the Step 1 command captures the result directly (the engine command is piped to `tail -n 1`, or a `mktemp` path is used), and the text says never to save the result to a fixed `/tmp` file; and that no fixed `/tmp/<name>` path appears. The positive assertion fails today.

## 4. The readout banner's added-file totals are the model's own arithmetic

### Steps
1. Run the engine in apply mode on the fixture; read the result.
2. Look for an overall count field.

### Expected
The engine's result carries machine-readable totals (for example a top-level `totals` object: `added`, `replaced`, `removed`, `preserved`, `conflicts`, summed over `categories`, with the git files the `gitFiles` step adds counted separately), and the prompt's banner and readout take every total from that field instead of adding the per-category lists.

### Actual
Reproduced 2026-11-20: the result has no `totals` field (`.totals` is null); the `categories` lists sum to 49 added files, and the `gitFiles` step added `.gitignore` and `.gitattributes`. In the after-change runs the banner said 64 added (dry run) and 52 added (full run); the per-category lines in both readouts were right.

### Where
- `packages/core/scripts/scaffold-project.sh:2691` `def plan(` builds `res` (printed at 2706/2708); `def apply(` at 2864 prints at 2880-2901; `rebase_post_steps()` (around line 3092) rewrites `res` after the git-file step, which is where git-file counts are known.
- `packages/core/commands/rebase-project.md:201-207` lists the result fields; the readout bullets at 270-282 and the banner section at 375-381 say nothing about where totals come from.

### How to check
A BATS case in `rebase-engine.test.sh`: after an apply and after a dry run, `totals.added` equals the sum of `categories.*.added` lengths (49 on the fixture shape, or the test fixture's own count). The Jest prose test from issue 3 also asserts the prompt names the engine's `totals` as the source of the banner's numbers. Both fail today.

## Open questions

- **Issue 1, how the rebase derives a selection: owner's call, default taken.** The report asks the engine to do it "through reconcile_selected_skills() (as the scaffold does)", but neither the scaffold script nor that function reads `stack.md`; stack selection today is model reasoning in `/init-project`, and `skill-selection-instructions.md` says plainly it is "NOT a lookup table". The owner's check (a BATS case on the engine) requires the derivation to live in the engine. Default taken: add a small deterministic stack-to-skill table to the engine, built from that file's "Common Skill Mappings" list, matched case-insensitively as whole words against `stack.md`, used only when `selected-skills.txt` is absent, never applied to a project that has the file, and never adding a framework skill (`framework-skills.txt`). It writes the file and copies the folders before `render_plugin_tree()` runs (so D13 still holds: the render follows the installed folders). The alternative, having the prompt run the model-based selection before the engine call, keeps one source of selection judgment but cannot be checked by a BATS case.
- **Issue 4, git files in the totals: default taken.** Count `.gitignore`/`.gitattributes` changes separately (for example `totals.gitFiles`), so "49 framework files plus 2 git files" can be stated exactly as the report states it.

Decisions:
- Ship path: `CLAUDE.md` "Shipped" names merge to `main` plus `.github/workflows/ci.yml` green; the workflow exists on `main` and references no secrets; no migrations are involved. Passed, nothing to decide.
- Issue 1 selection mechanism: deterministic table in the engine, used only when `selected-skills.txt` is absent (owner's call, default taken under unattended planning, 2026-11-20).
- Issue 4 git-file counting: separate count (owner's call, default taken, 2026-11-20).
