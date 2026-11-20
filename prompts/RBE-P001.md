<task>
  <id>RBE-P001</id>
  <description>Create packages/core/templates/retired-files.json (D9), seeded from the three retired tables and the retired-hooks paragraph in rebase-project.md and from git log --diff-filter=D over the framework source directories, and its Jest test packages/core/lib/retired-files.test.js (D10)</description>
</task>

<context>
  <trd_file>docs/TRD/deterministic-rebase-engine.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates>
    <unit_coverage>60%</unit_coverage>
    <integration_coverage>50%</integration_coverage>
  </quality_gates>
  <completed_tasks>none</completed_tasks>
</context>

<grounding>
  <evidence_key>
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables.
  </evidence_key>
  <touches>
- packages/core/templates/retired-files.json
- packages/core/lib/retired-files.test.js
  </touches>
  <reuse>
- the prose is the seed: the skills table at `rebase-project.md` "Retired framework skills" (`verify-plan-recovery`, line ~394), the commands table "Retired framework commands" (7 rows, line ~468), the agents table "Retired framework agents" (one row, `*(none yet ...)*`, line ~289), and the paragraph `**Retired hooks.**` (line ~516) [read: `packages/core/commands/rebase-project.md`]. Parse or copy them; do not re-derive them from memory. For assertion (b), the plugin's own scaffold is the render: run `scaffold-project.sh --plugin-dir <absolute packages/full> --copy-skills <tmp>` with `spawnSync` and an argument array, after writing `<tmp>/.claude/selected-skills.txt` listing every folder under `packages/skills`; this needs nothing from RBE-B001. `packages/full/templates` is a directory symlink to `../core/templates`, so the new JSON reaches the plugin-cache layout with no new link [read: `ls -la packages/full`].
  </reuse>
  <replaces>
- nothing. The prose tables stay until F-3 (NG1) and this test holds them equal to the data file.
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
- `packages/core/lib/owner-rules.test.js` for Jest style (CommonJS, `spawnSync('git', ...)` helper, `tmpRoots` cleanup) and for a test that reads `scaffold-project.sh` as text and compares it with another source of truth [read]. The prose-versus-code guard already exists once in BATS: `rebase-project.md: framework rules named equal the template rules directory minus AUTHORED_RULES` in `scaffold-project.test.sh` (~line 2357) [read]. Write each assertion as a function of a file path, so the negative cases run it on a mutated temp copy.
  </follow>
  <careful>
- - §2.1 (agents, empty), §2.2 (skills) and §2.3 (commands) are tables; §2.4's retired hooks are one prose paragraph (`**Retired hooks.** \`permitter/\`, \`learning.sh\`, ...`) with `lib/` and `prompts/` names inside it, so assertion (a) needs a backtick-name extractor for that paragraph, not a table parser [read].
  - Seed only installed paths. `git log --diff-filter=D` over the source directories also names files that were never installed: `packages/full/hooks/permitter.js` (a symlink to `../../permitter/hooks/permitter.js`), `packages/full/commands/router` and `packages/full/skills` (directory symlinks), `*.test.js` files and fixtures [ran: `git show <sha>^:<path>`]. This test carries no history assertion; completeness against what releases installed is RBE-P002's coverage check.
  - `retiredIn`: tags start at `4.1.9` and come in two styles (`4.1.9`–`4.1.23`, then `v4.2.0`–`v4.17.10`) [ran: `git tag | sort -V`], while the prose dates `permitter/`, `learning.sh` and `save-remote-logs.js` to 4.1.0, before any tag. Take the prose version where it states one, the first tag containing the deletion otherwise, `null` when neither exists.
  - The scaffold `cd`s into its target before copying and never makes `--plugin-dir` absolute, so the render for (b) must pass an absolute plugin directory: a relative `packages/full` renders only rules and `settings.json`, with exit 0 [ran].
  - The Jest tests under `packages/core/lib/` run from `package.json`'s `jest` key; `jest.config.ci.js` only adds an exclusion for `discovered.test.js`, so a new `*.test.js` is picked up on CI with no config change [read].
  - No collision with another task's files; it shares Phase 1 with RBE-B001.
  </careful>
  <instruction>
    This grounding was established by reading the codebase during TRD authoring. Treat it as findings you own: do NOT reimplement anything named in <reuse>; DELETE anything <replaces> names; match <follow>; weigh each line by its evidence marker and check [inferred] claims first; report any stale or wrong grounding in your deliverables.
  </instruction>
</grounding>

<decision>
The decisions for this whole change are the table in docs/TRD/deterministic-rebase-engine.md section "### 1.2 Key Technical Decisions" (D1 onward). READ THAT SECTION IN FULL, and section "## 3. Technical Specifications", before writing any code: they are binding on this task.
</decision>

<decision_note>The <decision> is the approach chosen for THIS change, decided during planning; it may describe behaviour that does not exist yet. Follow it as a constraint. If your task would contradict it, stop and report.</decision_note>

<scope_discipline>
  <instruction>Implement what the task asks for. Do NOT add delivery machinery (feature flags, rollout phases, migration scaffolding, config toggles) unless the task or TRD explicitly calls for it. Report such needs as findings instead.</instruction>
</scope_discipline>

<scope_boundaries>
  <non_goals>
| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Rewriting `packages/core/commands/rebase-project.md` or its vendored copy, and removing its retired tables | Roadmap item 3 (F-3). The tables stay, held equal to the data file by RBE-P001's test, until F-3 removes them |
| NG2 | Resolving a conflict (merging an owner edit, fixing an unmergeable settings key) | The roadmap gives that to the model, in F-3; the engine only reports |
| NG3 | Baseline and after-change timing; any numeric speed target | Roadmap items 1 and 4; the fence rules out a target |
| NG4 | Any change to `--refresh` or the SessionStart refresh contract, including removing retired files there and skipping owner-edited files there | Roadmap fence; O13; OQ-2; OQ-9 |
| NG5 | Dropping vendoring | Roadmap fence |
| NG6 | `/init-project` and its skill selection, and adding library skills by stack inference | Roadmap fence; O3. A library skill newly relevant to a project's stack is not added by a rebase (OQ-7) |
| NG7 | Changing `/rebase-project`'s flags, their meaning, or its clean-tree precondition; the engine has no `--force` | Roadmap fence; the precondition stays in the prompt |
| NG8 | Rebasing this repository's own vendored `.claude/` | Investigation size note |
| NG9 | Telling an owner-edited retired file from an unedited one | The retired list is the owner's declared deletion list; git is the undo (OQ-8) |
| NG10 | Recognising files installed from an untagged build as older versions | D6's fail-safe direction; covering them would need a record of every build ever installed (TR1) |
  </non_goals>
  <instruction>If the task or your approach would address any non-goal item, STOP and report the scope conflict.</instruction>
</scope_boundaries>

<objective>
The file parses and holds every name in the §2.1–§2.3 tables and the §2.4 paragraph plus the history-only deletions (create-prd-team.md, create-trd-team.md, implement-trd-proposed.md, implement-trd-tasklist.md, prompts/async-discipline.prompt.md, prompts/autonomy-discipline.prompt.md); hooks/hooks.json and commands/init-project.md.bak are absent; the Jest test passes on the committed file, and fails on a temp copy with one prose name removed, on a temp copy listing commands/plan.md (shipped by the current plugin, found through a render with every library skill selected), and on a temp copy holding an entry with ..
</objective>

<skills>
  <matched>jest</matched>
  <instruction>You MUST invoke each listed skill using the Skill tool BEFORE writing code. Report SKILLS_USED and RULES_APPLIED (1-2 concrete rules per skill) in your deliverables.</instruction>
</skills>

<strategy_instructions>
Strategy is: tdd — write the failing test and the minimal implementation within THIS task (no separate RED stage runs before you); do not add beyond what the tests require.
</strategy_instructions>

<deliverables>
1. Implementation complete per objective
2. Every file changed, with paths
3. Tests written
4. Brief outcome summary
5. Anything deleted under <replaces>, named explicitly — or a statement that <replaces> was empty
6. Any [inferred] grounding you checked, and what you found
7. Scope compliance confirmation (no non-goal work performed)
8. Skills used and rules applied
</deliverables>

<check_battery>
  <unit>npx jest {Jest test files this task touches}; bats {BATS files this task touches or that cover scaffold-project.sh: packages/core/scripts/scaffold-project.test.sh, packages/core/scripts/rebase-engine.test.sh, test/integration/tests/scaffold-delivery.test.sh, test/integration/tests/runtime-integrity.test.sh as relevant}</unit>
  <shell>shellcheck {changed .sh files}</shell>
  <instruction>
    Run the commands above against files you changed. On failure, debug it yourself (5 Whys, fix, re-run) before returning — do NOT return status "failed" on the first red run. Only report "failed" if still red after genuinely trying. No separate debugging agent is spawned.
    NEVER run a live, model-spending check — anything that starts `claude` sessions (test/smoke/run-smoke.sh, claude -p). If a check would need one, report it "not run".
    Do not commit; the orchestrator commits at the phase checkpoint. Do not edit docs/TRD/ files.
  </instruction>
</check_battery>

<discovered>
  <instruction>
    If you find work this task does not cover (a bug outside your scope, stale grounding, an unplanned gap), RECORD it and carry on; do not fix it or spawn an agent for it:
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-P001", phase: 1, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>
