# TRD: rebase-skill-selection-and-sync-report

**Source PRD**: None — defect; the two problems 4.13.4 left open (`CHANGELOG.md` [4.13.4] "Known open"), planned on the owner's instruction 2026-10-16

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | After `/rebase-project`, every agent's skill preloads (the `skills:` list and the generated "Project Skills" section) match the skills the rebase left installed: a skill the rebase added is preloaded, with its description, by every agent whose affinity pool names it, and a skill the rebase removed is preloaded by none | the reproduction below; the owner's instruction, 2026-10-16 | yes |
| O2 | `--sync-agents` never reports an agent it rewrote as `unchanged`: a body replaced from the plugin reads `updated`, and a rewrite of only the generated preloads reads `refreshed` | the owner's instruction, 2026-10-16 | yes |

## Reproduction

### Steps

Run in a scratch directory, never against this repo's `.claude/` [ran 2026-10-16]:

1. Scaffold a project with `selected-skills.txt` = `jest`, `pytest` and `--copy-skills`. Its
   `backend-implementer` preloads `pytest`, `jest`; its affinity pool also names
   `developing-with-python`.
2. Do what `/rebase-project` §4.2 step 2 does for a newly matching skill: copy
   `packages/skills/developing-with-python/` into `.claude/skills/`. Then run
   `scaffold-project.sh --sync-agents`, which is what §4.1 runs. Running it after the copy
   is the order the owner asked for.
3. Do what §4.2 step 1 does for a stale skill: delete `.claude/skills/pytest/`, then run
   `--sync-agents` again.
4. **The sync report** [ran 2026-10-16, against the released 4.13.4 script]. On a fresh
   scaffold with the same `jest`, `pytest` selection, hash every agent file. Append
   `developing-with-python` to `selected-skills.txt`, copy its folder into
   `.claude/skills/`, run `--sync-agents`, then hash every agent file again.

### Actual

1. After step 2, `backend-implementer`'s `skills:` list is still `pytest`, `jest`.
   `developing-with-python` is not preloaded and does not appear in its Project Skills
   section. Its one mention is line 178, the agent's own shipped text. `--sync-agents`
   printed 13 `unchanged`.
2. After step 3, 4 agents still preload `pytest`, a skill no longer installed.
3. After step 4, all 13 agent files changed: `backend-implementer` now preloads
   `developing-with-python`, and every agent's skills section was regenerated. Yet
   `--sync-agents` printed `unchanged` for all 13.

### Expected

1. `backend-implementer` preloads `developing-with-python`, and its Project Skills section
   lists it with the skill's description.
2. No agent preloads `pytest`.
3. No agent whose file the sync rewrote is printed `unchanged`. An agent whose body was
   replaced from the plugin prints `updated`, as it does today. An agent where only the
   generated skill content was rewritten prints `refreshed`, so a skill change does not read
   as 13 changed agents.

**Root cause** [ran]: the injection step reads `.claude/selected-skills.txt`
(`scaffold-project.sh` `inject_agent_skills`). `/rebase-project` §4.2 adds and removes skill
folders but never edits that file. `copy_skills`' own comment says "adding or removing
selections stays /rebase-project's job", but no step in the command does it.

The 4.13.4 changelog blamed the order alone (agents sync in §4.1, before skills change in
§4.2), and that diagnosis was wrong. Reordering without updating the selection file changes
nothing: step 2 above already runs the sync after the copy. The order does still matter
once the selection is kept up to date. For the report (step 4) [ran]: `sync_agents` prints
`$report`, which is the classification it made before copying, so a rewrite it made itself
never shows. The injection also reads each skill's description
from `.claude/skills/<name>/SKILL.md`, so it must run after the skill folders are in place.

## Decision

- **FIX-001: the script keeps the selection file in step with what is installed.**
  `--sync-agents` reconciles `.claude/selected-skills.txt` before it runs the preload step,
  reading the result of the skill step rather than trusting the model to have edited the
  file. The rule:
  - it drops a line naming a plugin-library skill that is no longer installed under
    `.claude/skills/`;
  - it appends each installed plugin-library skill that is not listed yet, sorted, after
    the existing lines;
  - it keeps comments, blank lines, the order of the lines it keeps, and any name not in
    the plugin library;
  - it never adds a framework skill (`framework-skills.txt`); no affinity pool names one;
  - it does nothing when the file is absent, matching the preload step, which skips a
    project with no selection file;
  - it copes with a file that has no trailing newline.
- **Skills run before agents.** The skill step becomes §4.1 and the agent step §4.2, so the
  sync reads the new skill folders and their descriptions. Every reference to the two
  numbers moves with them, including the three `runtime-integrity` tests that slice the
  command by its `#### 4.2 Update Skills` heading.
- **Corrected after review:** the first draft had the model edit the selection file in
  prose. The reviewer pointed out that a step reading the outcome does not need the
  model's decision and is correct whatever the model did. This keeps the 4.13.4 rule for
  the agent step: run the script, never do it by hand.
- **FIX-002: a preload-only rewrite gets its own state, `refreshed`.** `sync_agents` hashes
  each project agent before the copy and again after the preload step:
  - a line it would print as `unchanged` whose bytes changed prints `refreshed`;
  - `updated` keeps its meaning: the agent's body was replaced from the plugin;
  - §4.2 reports `refreshed` agents in one line, "Refreshed skill preloads: [names]".
- **Corrected after review, and a departure from the literal instruction ("report as
  updated").** Every agent lists every selected skill, either as a preload or in its "Also
  installed" line. Adding or removing any one skill therefore rewrites all 13 files.
  Printing those as `updated` would bring back exactly the "every agent changed" report
  that 4.13.4 fixed. A distinct state meets the objective, that a rewritten agent is never
  reported `unchanged`, without that noise. `--agent-status` is not changed.
- Considered per item:
  - absorbed: the rebase never updates `selected-skills.txt`. Without that, the requested
    reorder delivers nothing; step 2 of the reproduction shows this. [BLOCKS]
  - absorbed: removed skills stay preloaded. It is the same missing step and the same fix.
    [BLOCKS]
  - absorbed: the three `runtime-integrity` tests that slice by section heading. The swap
    breaks them. [BLOCKS]
  - not absorbed: under `--new-only`, an agent that differs from the plugin but is left
    alone prints `updated`. That is a separate reporting question; `--preserve-all`
    already reports "Existing agents preserved".

## Non-Goals

- No change to what `inject_agent_skills` writes for a given selection. The golden fixture
  `test/integration/fixtures/agent-inject-golden/` stays byte-identical.
- No change to `--agent-status` output.
- No change to how `/init-project` or `--copy-skills` writes or reads the selection file. Only `--sync-agents` reconciles it.
- No change to `/init-project`'s skill selection, or to which skills a stack matches.
- No change to the `--refresh` path or its `REFRESH_SUMMARY` line.

## Verification Artifacts

None apply — the work is a command's prose and a shell script's output; nothing is visual, and there are no design frames, screen-to-screen journeys or data pipelines.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | In `scaffold-project.sh`, add selection reconciliation (the Decision's rule) and call it at the start of `sync_agents`, before the copy and the preload step. In `rebase-project.md`, swap §4.1 (agents) and §4.2 (skills) so skills come first and update every reference to either number. Keep the three copies of the command identical. Re-point the three `runtime-integrity` slices at the new heading. Add BATS tests to `scaffold-project.test.sh`. | O1 | None | Tests that fail today and pass after, on a scratch project of its own with selection `jest`, `pytest` (not `_agent_proj`, which already selects `developing-with-python`): (a) copy `developing-with-python` into `.claude/skills/`, delete `.claude/skills/pytest/`, run `--sync-agents`; then `backend-implementer`'s `skills:` list contains `developing-with-python` and not `pytest`, its Project Skills section has a `developing-with-python` line carrying that skill's description, and no agent preloads `pytest`; (b) the selection file then lists `developing-with-python` and not `pytest`, and keeps a comment line and the original order of the lines it kept; (c) a framework skill folder and a custom skill folder (absent from the plugin library) under `.claude/skills/` are not added to the selection; (d) a selection file with no trailing newline gets the new skill on its own line; (e) with no selection file, `--sync-agents` creates none; (f) in `rebase-project.md` the `#### 4.1` heading is the skill step, `#### 4.2` is the agent step, and the first `--sync-agents` in Step 4 comes after the skill step's heading. The `runtime-integrity` suite passes. |
| FIX-002 | In `sync_agents`, hash each project agent file before the copy and after the preload step, and print `refreshed` in place of `unchanged` for an agent whose bytes changed. Update the function's header comment, the script's usage text if it lists the states, and §4.2's report wording (`refreshed` is reported as one line, "Refreshed skill preloads: [names]"). Add BATS tests. | O2 | FIX-001 | (a) On an injected project, add to `selected-skills.txt` (and `.claude/skills/`) a skill that `backend-implementer`'s pool names, then run `--sync-agents`. Every agent whose file bytes changed (hash before and after) prints `refreshed`, and every agent whose bytes did not change prints `unchanged`. `backend-implementer` is `refreshed`. (b) A second `--sync-agents` prints every agent `unchanged`. (c) `--agent-status` on that project still prints `backend-implementer` `unchanged`. (d) An agent whose plugin body changed still prints `updated`, not `refreshed`. (e) The existing FIX-002 (a)–(g) tests of `rebase-governance-and-agent-diff` and the golden fixture still pass. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/commands/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`, `packages/core/scripts/scaffold-project.test.sh`, `test/integration/tests/runtime-integrity.test.sh`
- **Reuse:**
  - `load_framework_skills` (`scaffold-project.sh:915`) for the framework list [read];
  - the skills-library lookup in `copy_skills` (`skills-lib/`, falling back to `skills/`, lines 1018–1023) [read];
  - the selection parsing tolerance in `copy_skills` (`|| [[ -n "$skill" ]]`, `#` comments skipped) [read];
  - `_agent_proj`'s scaffold call as the pattern for a fresh project with its own selection [read].
- **Replaces:**
  - the §4.1-agents / §4.2-skills order;
  - the reference at `rebase-project.md:263` ("here and in §4.1");
  - the `sed -n '/^#### 4.2 Update Skills/,/^#### 4.3/p'` slices at `runtime-integrity.test.sh:314, 341, 364` [read].
- **Follow:**
  - The three copies of the command must stay byte-identical (`generate-hooks-artifacts.sh:78`: plugin-only holds real copies, not symlinks). Edit the core file and copy it.
  - In `--sync-agents`, stdout carries status lines only; reconciliation messages go to stderr.
  - Write the selection file atomically: temp file, then rename [read].
- **Careful:**
  - No affinity pool names a framework skill [ran].
  - `skill_preserve=true` still adds skills and skips removals; reconciliation follows whatever folders exist, so it holds under `--preserve-all` too [read].
  - Grep the command for `§4.1`, `§4.2`, "4.1 Update" and "4.2 Update" before and after the swap [inferred].
  - ShellCheck runs on the script in CI [read].

### FIX-002
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/commands/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`
- **Reuse:** `sync_agents` (`scaffold-project.sh:1378`) and its `<state>\t<name>` loop; `_status_of` (`scaffold-project.test.sh:2310`); `cksum`, already used by the tests (line 2391) and POSIX [read]
- **Replaces:** printing `$report`, the classification made before the copy, verbatim at the end of `sync_agents` [read]
- **Follow:** stdout carries status lines only [read]
- **Careful:**
  - Take the before-hashes before the copy loop, not between the copy and the preload step, which rewrites every agent [read].
  - A `new` agent has no before-state and stays `new` [inferred].
  - Under `--new-only`, an `updated` agent that was not copied keeps printing `updated` (Decision, not absorbed) [read].

## Could Not Verify

- That a model running the edited command runs the skill step before the agent step and copies and deletes the right skill folders. That is prompt adherence for the skill step's folder copies and deletes. The selection file and the agent preloads no longer depend on it, because `--sync-agents` reconciles from what is on disk. Out of scope for `/audit-build` (audit 2026-10-16), which reads code and tests; it needs a live `/rebase-project` run.
- Fidelity to product requirements: this TRD has no PRD (a defect planned on the owner's instruction, 2026-10-16), so the 2026-10-16 `/audit-build` checked the TRD against the delivered code only. Whether O1 and O2 are the right objectives was not checked against any source document.
- Line citations in Task Grounding (`scaffold-project.sh:915`, `:1378`, lines 1018–1023; `scaffold-project.test.sh:2391`) were written against the tree before this feature's own commit `b32d826` and no longer resolve as cited; the named functions exist (`load_framework_skills` at 928, `sync_agents` at 1463, the skills-library lookup in `plugin_skills_src` at 230–234, `cksum` at 2394). That section was not edited by the audit.
