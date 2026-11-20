<task>
  <id>RBE-B001</id>
  <description>In scaffold-project.sh: parse --rebase, --dry-run, --preserve-all with the exclusivity rules of §3.1, resolve --plugin-dir to an absolute path for the mode, and add them to the usage text; add authored_rules() holding the unchanged local AUTHORED_RULES=(...) line and have refresh_rules() read it (D15); add render_plugin_tree() (D4, D13); add the normhash mode to agent_skills_program() and an optional exclude list to inject and inject_agent_skills() (D7, D17). The --rebase dispatch is a stub that renders and prints the rendered file count until RBE-B002. Kept apart from RBE-B002 because the hash generator (RBE-P002) needs the render and normhash before the planner exists</description>
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
- packages/core/scripts/scaffold-project.sh
- packages/core/scripts/rebase-engine.test.sh
  </touches>
  <reuse>
- the scaffold itself for the render. `scaffold_project()` (line 2058) already resolves both plugin layouts, applies every copy-loop exclusion (`copy_commands` 551 skips `init-project.md` and `rebase-project.md`; `copy_workflows` 485 and `copy_libs` 448 skip tests), copies skill folders with `cp -RL` (`copy_skills` 1090, `copy_framework_skills` 1031) and runs `ensure_hooks_executable` (876) [read]. Run it as a subprocess of this same file (`"$SCRIPT_DIR/scaffold-project.sh"`), so its globals (`FORCE`, `REFRESH`, `COPY_SKILLS`) start clean. For `normhash`: `strip_body_block()` (1232), `strip_skills()` (1240), `normalise()` (1287) and `read_agents()` (1302), at module level of `agent_skills_program()` (1192); the `status` mode (`if mode == "status":`, 1311) is the model for a read-only mode needing neither selection nor manifest [read]. For the exclude list: `inject_agent_skills()` (1410) and the program's `inject` branch.
  </reuse>
  <replaces>
- nothing becomes unreachable. The `local AUTHORED_RULES=(...)` line (1746) moves, unchanged, out of `refresh_rules()` into `authored_rules()`; no second copy remains.
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
- the exclusivity block at lines 148–203: each strict mode lists the modes it cannot combine with, prints `Error: ...` to stderr, `exit 1`. The `--stamp-version`, `--git-files` and `--records-cutover` checks enumerate earlier modes by name, so each needs `--rebase` added; `--no-push` (only with `--records-cutover`) and `--new-only` (only with `--sync-agents`) already exit 1 beside `--rebase` [read]. `agent_skills_program()` modes dispatch on `sys.argv[1]`, so `normhash <agents_dir>` is added as `status` is.
  </follow>
  <careful>
- - The moved line must stay one line of the exact form `local AUTHORED_RULES=("constitution.md" ... "ship.md")`, and stay the only text in the file matching `AUTHORED_RULES=(` (no comment may contain it): `scaffold-project.test.sh` (`framework_rules()` ~2323 and the `rebase-project.md: framework rules named ...` case ~2363) and `runtime-integrity.test.sh` (`authored_rules()` ~55) grep `local AUTHORED_RULES=\(` and take the quoted names off that line, and `owner-rules.test.js` takes the first match of `AUTHORED_RULES=\(([^)]*)\)` [read]. Do not edit those tests.
  - Relative plugin dir: `scaffold_project()` `cd`s into the target (line 2070) before any copy and nothing in the script makes `PLUGIN_DIR` absolute, so a relative `--plugin-dir` renders only rules and `settings.json`, exit 0 [ran]. Resolve it once (`cd "$PLUGIN_DIR" && pwd`) for `--rebase`. Existing tests pass `_get_plugin_dir`, which is already absolute, so the relative case is new.
  - Outside a git work tree: `ensure_gitignore untrack` blanks `untrack` when `git rev-parse --is-inside-work-tree` fails (line 1836); `ensure_gitattributes` and `append_missing_line` only append to files in the current directory [read]. A render into `mktemp -d` exits 0 and writes `.gitignore`, `.gitattributes`, `CLAUDE.md`, `.trd-state/current.json` and `docs/` beside `.claude/`, all inside the temp directory [ran]. `TMPDIR` can point inside a repository; setting `GIT_CEILING_DIRECTORIES` to the render's parent means no enclosing repository is ever found, so nothing is untracked even then.
  - The render also runs the scaffold's non-strict stamp and preload injection on its own copies. Neither matters: settings come from the template (D11) and agents compare by `normhash` (D7).
  - A render [ran, `--copy-skills`, selection `jest` and `frontend-design`] holds 13 agents, 26 commands, 9 hooks, 2 hook libs, 1 hook prompt, 45 libs, 12 workflows, 21 contracts, the framework skills plus the selected ones, all six template rules and no symlinks (`find .claude -type l` empty); hooks are 755, and libs, commands, hook libs and prompts 644. About 1 s wall time [ran].
  - User skill names in the render's selection make `copy_skills` warn `Skill not found`: expected and harmless. The scaffold prints to stdout (`info`, `echo`), so the render's output goes to stderr (D16).
  - A cache-shaped plugin for the two-layout case: `cp -RL packages/full <tmp>` (symlinks resolved); `agents-lib` has no `../core` fallback (`packages/core/agents` holds only `skill-affinity.json`) [read, ran].
  - `inject_agent_skills` callers (`scaffold_project`, `refresh_project`, `sync_agents`) pass one argument; the exclude list is an optional second, and an empty list must not trip `set -u` (this file's convention is `${arr[@]+"${arr[@]}"}`).
  - Sourcing leaks positional parameters: `scaffold-project.sh` parses `$@` at top level, so a script run as `gen.sh --seed` that sources it exits `Unknown option: --seed` [ran]. RBE-P002 must `set --` before sourcing; the BATS cases source it inside `bash -c`, where `$@` is empty.
  - Collision: this task and RBE-B002, B003, B004 all edit `scaffold-project.sh` and `rebase-engine.test.sh`; they are serialized by their declared dependencies. RBE-P002 calls this task's `render_plugin_tree` and `normhash` and adds cases to the shared test file.
  </careful>
  <instruction>
    This grounding was established by reading the codebase during TRD authoring. Treat it as findings you own: do NOT reimplement anything named in <reuse>; DELETE anything <replaces> names; match <follow>; weigh each line by its evidence marker and check [inferred] claims first; report any stale or wrong grounding in your deliverables.
  </instruction>
</grounding>

<decision>
The decisions for this whole change are the table in docs/TRD/deterministic-rebase-engine.md section "### 1.2 Key Technical Decisions" (D1 onward). READ THAT SECTION IN FULL, and section "## 3. Technical Specifications", before writing any code: they are binding on this task.
</decision>

<decision_note>The <decision> is the approach chosen for THIS change, decided during planning; it may describe behaviour that does not exist yet. Follow it as a constraint. If your task would contradict it, stop and report.</decision_note>

<open_question>
  <id>OQ-1</id>
  <question>Is autonomy.md owner-governed? (roadmap open question 1; owner-only)</question>
  <assumed>No: it stays framework-shipped and is replaced when it is an older shipped version; an owner-edited copy is a conflict and left untouched (the owner's recorded default)</assumed>
  <instruction>Proceed on the stated assumption and record it in your deliverables. Do NOT stop to ask.</instruction>
</open_question>

<open_question>
  <id>OQ-2</id>
  <question>Should --refresh also remove retired files? (roadmap open question 3; owner-only)</question>
  <assumed>No: only --rebase removes</assumed>
  <instruction>Proceed on the stated assumption and record it in your deliverables. Do NOT stop to ask.</instruction>
</open_question>

<open_question>
  <id>OQ-9</id>
  <question>--refresh (run at SessionStart after every plugin upgrade) already replaces framework files without comparing bytes, so O7's conflict detection protects only edits made since the last upgrade, or with refresh turned off. Should refresh skip owner-edited files using the same hash list? (owner-only)</question>
  <assumed>No change to refresh in this feature (out-of-scope fence; NG4, O13)</assumed>
  <instruction>Proceed on the stated assumption and record it in your deliverables. Do NOT stop to ask.</instruction>
</open_question>

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
BATS: every rejected flag combination in §3.1 exits 1; authored_rules prints the six names, and owner-rules.test.js, the scaffold-project.test.sh cases that grep local AUTHORED_RULES=( (~2323, ~2363) and runtime-integrity.test.sh (~55) pass with no edit to those files; for a target with jest installed and a stack.md naming pytest, the render holds skills/jest/SKILL.md, every skill in framework-skills.txt, every manifest hook, hook lib and hook prompt and every command except init-project.md and rebase-project.md, and holds no skills/pytest/, no symlink and none of the six owner-governed rules; --rebase with a relative --plugin-dir renders the same file list as with the absolute one; a cache-shaped plugin (cp -RL packages/full) renders the same file list as packages/full; the target's file list and hashes are unchanged by a render; normhash prints the same hash for an agent before and after inject_agent_skills and a different one after a one-line body edit; with an exclude list, the excluded agent is byte-identical after inject while another agent gains its preloads; every existing scaffold-project.test.sh case stays green
</objective>

<skills>
  <matched>developing-with-python</matched>
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-B001", phase: 1, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>
