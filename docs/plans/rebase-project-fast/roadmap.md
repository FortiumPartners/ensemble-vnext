# Roadmap: Fast, mostly deterministic /rebase-project

Plan: rebase-project-fast | Command: /plan-feature | Version: 1 | Date: 2026-11-20

## Source spec

- Make `/rebase-project` fast: the owner's problem with vendoring is the time a rebase takes -- source: conversation: "my real issue with vendoring is the time consuming rebase" (owner, 2026-11-17)
- Measure one real rebase on a fixture project first, a full run and a `--dry-run`, timed per phase, as the baseline -- source: conversation: "first measure one real rebase on a fixture project (a full run and a --dry-run, timed per phase) so there is a baseline"
- Move every deterministic step into a script: the copy, the settings.json merge with its registration-count check, the hook enumeration, skill selection, byte compares, the version stamp, and removing retired files -- source: conversation: "move every deterministic step into a script ..."
- Removing retired files is not scripted today: `--refresh` is "replace present-only; never create, never delete", and the retired agent, skill, hook and command lists live only in the prompt prose -- source: probe: `packages/core/scripts/scaffold-project.sh:234` and `:1982` (refresh mode banner); `packages/core/commands/rebase-project.md` §2.1 (retired agents), §2.2 (retired skills), §2.4 (retired hooks)
- The settings.json merge, its registration-count check and the hook-path sanity check are done by the model today, not by a script -- source: probe: `packages/core/commands/rebase-project.md` §4.6 (lines ~965-1040: the merge rules and the inline `python3` count), and `refresh_project()` in `scaffold-project.sh:1956-2045` calls no settings merge
- Skill selection is done twice: the prompt matches skills against a ~30-row stack.md table plus capability-word inference, while `scaffold-project.sh`'s `reconcile_selected_skills()` already keeps `selected-skills.txt` in step -- source: conversation ("The prose redoes the skill matching ..."); probe: `rebase-project.md` §2.2 (lines ~307-430), `scaffold-project.sh:1467`
- The model handles only a genuine conflict (an owner-edited vendored file, an unmergeable settings key) and writes the readout -- source: conversation: "the model handles only a genuine conflict ... and writes the readout"
- Time a rebase again afterwards on the same fixture and report before and after numbers -- source: conversation: "a timed rebase afterwards on the same fixture, with before and after numbers"
- Owner-governed rule files are never overwritten -- source: conversation: "Owner-governed files (...) are never overwritten, as today"; probe: `scaffold-project.sh:1746` (`AUTHORED_RULES`: constitution, stack, process, verification, design, ship)
- The prompt is 1,451 lines; Step 2 (component diff) runs from line 237 and Step 4 (selective update) from line 684 to 1180 -- source: probe: `wc -l packages/core/commands/rebase-project.md`; headings at lines 237, 684, 1180
- A headless `/rebase-project` can run on a scaffolded fixture here, taking about 3 minutes on a near-current tree -- source: probe: `.claude/verification-notes.md` lines 1456 and 1472; `test/smoke/scenarios/rebase-old-tree.sh` already builds an aged tree and asserts on the filesystem

## Out-of-scope fence

- Dropping vendoring, or any other way of delivering the runtime -- reason: the vendored `.claude/` is the only documented way to give Claude Code web sessions the agents, skills, hooks and libraries; source: conversation: "Keep vendoring ... dropping it is out of scope"
- The SessionStart auto-refresh contract (`runtime-refresh.sh` calling `scaffold-project.sh --refresh`: replace what is present, never add, never remove) -- reason: it runs unattended on every session start; deleting files there is a different risk from a rebase the owner invoked; source: probe: `packages/core/hooks/runtime-refresh.sh` header (lines 12-18); owner's call 3 below
- Overwriting constitution.md, stack.md, process.md, verification.md, design.md or ship.md -- reason: owner-governed; source: conversation, and `scaffold-project.sh:1746`
- `/init-project` and its skill selection -- reason: not named; the work is the rebase; source: conversation (the ask names only `/rebase-project`)
- A numeric speed target -- reason: the owner asked for before and after numbers, not a target; none is invented; source: conversation
- Changing `/rebase-project`'s flags or their meaning (`--dry-run`, `--preserve-all`, `--force`) or its clean-tree precondition -- reason: not asked; source: probe: `rebase-project.md` lines 12-17, 147-183

## Items

### 1. Baseline rebase timing

- Brief: Measure how long `/rebase-project` takes today, before any change, so the plan has a baseline. Build one fixture project that has real drift: scaffold it from release v4.15.0 (a git worktree of tag `v4.15.0`, using its `packages/full`), commit it, then plant the cases a rebase must handle: one owner-edited vendored skill file, one user-added agent, one user-added hook registration in `.claude/settings.json`, and one retired file that the current plugin no longer ships (pattern: `test/smoke/scenarios/rebase-old-tree.sh`). Archive the committed fixture as a tarball under `.trd-state/rebase-project-fast/evidence/fixture/` with its sha256, so the after-run uses the identical tree. Against the plugin pinned at tag `v4.17.10` (a git worktree, so later merges cannot change the baseline), run headless `/rebase-project` in dry-run mode and then `/rebase-project` on fresh copies of the fixture (headless print mode, the plugin directory set to that worktree's `packages/full`, project setting sources, bypass permissions, as `test/smoke/lib/project.sh` does). For each run record total wall clock, time per step (Step 0 to Step 5, from the transcript's tool-call timestamps), tokens (`packages/core/scripts/token-usage.js`), and the resulting file tree (the porcelain git status plus a list of what changed). Write the numbers and the method to a report; no code ships.
- Dependencies: none
- How it will be checked: the report exists at `.trd-state/rebase-project-fast/baseline.md` with wall clock, per-step seconds and tokens for both runs, the fixture tarball and its sha256 exist, and `shasum -a 256` on the tarball matches the recorded hash
- Route: task
- Route rigor: solo
- Deferred checks: none
- Dates: none

### 2. Deterministic rebase engine

- Brief: Add a script mode that does every deterministic part of a rebase in one call, so the model no longer diffs or copies files. It must: copy every framework component (commands, agents, hooks and hook libs and prompts, workflows, libs, contracts, framework skills, framework-shipped rules), adding new files and replacing differing ones by byte comparison; remove retired files using one declared retired list (move the retired agent, skill, hook and command lists out of `rebase-project.md` prose into a data file the script reads, with a test that keeps it in step); select skills through the existing `reconcile_selected_skills()` logic rather than a second stack.md table; merge `.claude/settings.json` (regenerate the ensemble-owned `hooks` block from `hooks.manifest.json`, carry forward non-ensemble registrations per event without deduplicating by filename, keep every other local key) and refuse to write if the merged block has fewer registrations or prompt-type entries than the plugin default; drop registrations pointing at retired hooks; set hook file modes; re-inject agent skill preloads; stamp the version (the existing stamp-version mode of `scaffold-project.sh`); run the git-files and records-cutover steps it already has. It detects two kinds of conflict and leaves both untouched: a vendored framework file the owner has edited (the script must tell an owner edit apart from an older shipped version, for example by recording the hashes of the files it ships), and a settings key it cannot merge. It prints a machine-readable result (per category: added, replaced, removed, unchanged, preserved, conflicts) and, under a dry-run flag, writes nothing. It honours the preserve-all flag and never writes constitution.md, stack.md, process.md, verification.md, design.md or ship.md. The refresh mode keeps its present contract (never creates, never deletes).
- Dependencies: none
- How it will be checked: new BATS cases in `packages/core/scripts/scaffold-project.test.sh` (or a sibling test file) on aged fixtures prove: a retired file is removed; the six owner-governed rules are byte-identical after the run; the merged settings has at least the plugin's registration and prompt counts and keeps a user hook; an owner-edited framework file is reported as a conflict and left byte-identical; dry-run leaves `git status --porcelain` empty; a second run reports zero changes; `--refresh` still deletes nothing (existing tests stay green). Then the full battery: `npx jest`, `bats packages/core/scripts/*.test.sh test/integration/tests/*.test.sh`
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 3. Rebase prompt on the engine

- Brief: Rewrite `packages/core/commands/rebase-project.md` (and its vendored copy, `.claude/commands/rebase-project.md`) so it calls the deterministic rebase engine instead of having the model diff and update each component. The prompt keeps: Step 0 (installation check and the clean-tree precondition and its force override), the plugin-path resolution, one engine call (dry-run or apply), handling of each conflict the engine reports (an owner-edited vendored file: show the owner's change against the new shipped version and either merge or keep the owner's copy, saying which; an unmergeable settings key: resolve or leave it, saying which), and the four-section readout and banner. Step 2's per-component diff prose and Step 4's selective-update prose are removed, along with the stack.md skill table and capability-word inference. Keep the generated hook-enumeration block that `generate-hooks-artifacts.sh` writes into this file working, or retire it from the generator if the prompt no longer needs it. Update every test and smoke scenario that reads this prompt's text (`records-cutover-prose.test.js`, `check-hook-prose.py`, `test/smoke/scenarios/rebase-old-tree.sh`, `test/integration/tests/runtime-integrity.test.sh`, `scaffold-delivery.test.sh`).
- Dependencies: Deterministic rebase engine (code_or_schema)
- How it will be checked: `node packages/core/scripts/lint-command-structure.js` passes; `generate-hooks-artifacts.sh` runs with no diff afterwards; the full battery is green; a headless `/rebase-project` on a scaffolded, aged fixture slot ends with `═══ COMMAND COMPLETE: /rebase-project ═══`, and the filesystem assertions of `test/smoke/scenarios/rebase-old-tree.sh` pass
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 4. After-change rebase timing

- Brief: Time `/rebase-project` again on the same fixture as the baseline, now with the engine and the rewritten prompt, and report before and after numbers. Unpack the baseline fixture tarball (check its sha256 against the baseline report first), then run headless `/rebase-project` in dry-run mode and `/rebase-project` against the current `packages/full`, measured exactly as the baseline was: wall clock, time per step, tokens, and the resulting file tree. Write a before/after table (each number with its unit and the baseline beside it) and compare the two resulting trees: any file the old rebase changed that the new one did not, or the reverse, is listed and explained. No code ships.
- Dependencies: Baseline rebase timing (code_or_schema), Rebase prompt on the engine (code_or_schema)
- How it will be checked: `.trd-state/rebase-project-fast/after.md` exists with wall clock, per-step seconds and tokens for both runs beside the baseline numbers, the fixture sha256 matches the baseline's, and the tree comparison is present
- Route: task
- Route rigor: solo
- Deferred checks: none
- Dates: none

## Open questions

- Is `autonomy.md` owner-governed? The owner listed it with the never-overwritten files, but today it is framework-shipped and replaced whenever it differs (`rebase-project.md` lines 25 and 1065; not in `scaffold-project.sh:1746` `AUTHORED_RULES`), and its template already carries the ship.md standing-authorization sentence -- assumption: **owner's call**, default taken: `autonomy.md` stays framework-shipped, but the engine treats an owner-edited copy as a conflict and never overwrites it silently, which meets "never overwritten" for any edit the owner made; asked of: owner
- `process.md` is protected today but not in the owner's list -- assumption: it stays protected (today's behaviour, `scaffold-project.sh:1746`); asked of: none, settled by source
- Should removing retired files go into `--refresh` (which the SessionStart hook runs unattended) or only into the rebase engine? -- assumption: **owner's call**, default taken: only the rebase engine removes files; `--refresh` keeps its never-delete contract; asked of: owner
- How an owner edit is told apart from an older shipped file -- assumption: a routine engineering choice for item 2's `/plan` (recorded there as an OWNER-CALL); asked of: none
- Which older release to age the fixture from -- assumption: v4.15.0, for drift across the design stage, ship-build and records-ref releases; a routine choice; asked of: none
