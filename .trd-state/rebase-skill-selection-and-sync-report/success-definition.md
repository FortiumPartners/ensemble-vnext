# Functional Success Definition: rebase-skill-selection-and-sync-report

**Source**: §Reproduction (extracted text handed to the deriver; line numbers below are lines of that extracted text, where line 1 is the `## Reproduction` heading)
**Source kind**: reproduction
**Derived**: 2026-10-16T23:07:34Z
**Criteria**: 7

All criteria are exercised the way the source's Steps (lines 5-19) say: in a scratch directory,
never against this repo's `.claude/`, scaffolding with `selected-skills.txt` = `jest`, `pytest`
and `--copy-skills`. FS-1 to FS-4 then perform what `/rebase-project` §4.2 does for an added
skill (`developing-with-python`) and a removed one (`pytest`), each followed by
`scaffold-project.sh --sync-agents` as §4.1 runs it. "What §4.2 does" means what the command
does as delivered, not the manual copy/delete alone: the source's root cause (lines 42-45) is
that the command never updated the selection the injection reads. FS-5 and FS-6 follow step 4
(lines 16-19): hash every agent file, add the skill to the selection and copy its folder, run
`--sync-agents`, hash again.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | After a rebase adds `developing-with-python`, the scratch project's `backend-implementer` lists `developing-with-python` in its `skills:` frontmatter | §Expected 1, lines 34-35; §Actual 1, lines 23-24 (the defect: list stayed `pytest`, `jest`) | Contents of the scratch project's `.claude/agents/backend-implementer.md` after step 2, with `developing-with-python` inside the `skills:` frontmatter list | [read] | locator | | O1 |
| FS-2 | After the same rebase, `backend-implementer`'s generated Project Skills section lists `developing-with-python` together with that skill's description as it appears in `.claude/skills/developing-with-python/SKILL.md` | §Expected 1, lines 34-35; §Actual 1, lines 24-25 (absent from Project Skills; only mention was the agent's shipped text); root cause, lines 52-53 (description is read from the installed `SKILL.md`) | Paired text: the Project Skills section of the scratch `backend-implementer.md` (between the `ENSEMBLE:SKILLS` markers) and the `description` from the installed `developing-with-python/SKILL.md`, showing the same description text in both | [read] | locator | | O1 |
| FS-3 | After a rebase removes `pytest`, no agent in the scratch project preloads `pytest`: it is absent from every agent's `skills:` list and from every agent's generated Project Skills section | §Expected 2, line 36; §Actual 2, line 27 (4 agents still preloaded it) | Search output over the scratch project's `.claude/agents/*.md` after step 3 showing zero `pytest` entries in any `skills:` list or Project Skills section, alongside a listing showing `.claude/skills/pytest/` no longer exists | [read] | locator | | O1 |
| FS-4 | Every agent in the scratch project whose affinity pool names `developing-with-python` preloads it after the rebase adds it, not only `backend-implementer` | domain-derived: lines 8-9 give the affinity pool naming the skill as the reason `backend-implementer` should preload it (Expected 1, lines 34-35); the same reason holds for any other agent whose pool names it, so preloading it for one such agent and not another would be the same defect | For each agent whose affinity pool names `developing-with-python`, its `skills:` list after step 2 includes `developing-with-python` (one line per agent from a search over `.claude/agents/*.md`) | domain-derived | locator | | O1 |
| FS-5 | In step 4, no agent whose file the sync rewrote is printed `unchanged` | §Expected 3, line 37; §Actual 3, lines 28-30 (all 13 files changed, all 13 printed `unchanged`) | Paired text: the before/after hash list of every agent file from step 4, and the captured stdout of that `--sync-agents` run, showing that no agent whose hash changed carries the status `unchanged` | [read] | locator | | O2 |
| FS-6 | In step 4, an agent where only the generated skill content was rewritten is printed `refreshed` | §Expected 3, lines 38-40; §Actual 3, lines 28-30 (every agent's skills section was regenerated, none reported as such) | Captured stdout of the step 4 `--sync-agents` run showing `refreshed` against the agents whose files changed only in generated skill content (the `skills:` list and the Project Skills section), with a diff of one such agent's file before and after confirming nothing else changed | [read] | locator | | O2 |
| FS-7 | When the sync replaces an agent's body from the plugin, that agent is printed `updated` | §Expected 3, lines 37-38 ("prints `updated`, as it does today") | Captured stdout of a `--sync-agents` run on a scratch project where one agent's body differs from the plugin's shipped version, showing that agent reported `updated` (not `refreshed` or `unchanged`), with its file afterwards matching the plugin's body | [read] | locator | | O2 |

**Must-pass coverage.** O1 (an agent's preloads match the skills the rebase left installed) is
proven by FS-1 to FS-4. O2 (`--sync-agents` never reports a rewritten agent as `unchanged`) is
proven by FS-5 to FS-7. Both objectives are fully supported by the source now. FS-7 needs a
setup the source's steps do not contain. Step 4 starts from a fresh scaffold, whose agent bodies
already match the plugin, so no body is replaced there. The exerciser therefore has to create an
agent whose body differs from the plugin's before running the sync. The source does not say
what an agent that the sync left untouched should print, so no criterion checks that.
