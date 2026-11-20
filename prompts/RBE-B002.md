<task>
  <id>RBE-B002</id>
  <description>Add rebase_engine_program() plan and apply for files (§3.2; D2, D3, D5, D6, D9's validation, D13, D14's file rules, D15, D16; D17's file writes, modes and path check) and the REBASE_RESULT line with all chatter on stderr, replacing RBE-B001's stub</description>
</task>

<context>
  <trd_file>docs/TRD/deterministic-rebase-engine.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates>
    <unit_coverage>60%</unit_coverage>
    <integration_coverage>50%</integration_coverage>
  </quality_gates>
  <completed_tasks>RBE-P001, RBE-B001, RBE-P002</completed_tasks>
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
- `render_plugin_tree()`, `normhash` and `authored_rules()` (RBE-B001): run `normhash` on both the render's and the target's agent directories and pass both outputs to `plan`, because the planner is its own `python3 -c` program and cannot import `normalise()`; the `python3 -c "$(...)" <mode> args` convention (`inject_agent_skills`, ~1434) [read]; `stamp_ensemble_version`'s write (`tempfile.mkstemp(dir=directory)`, `os.chmod(tmp, mode)`, `os.replace`) for every file write [read]; `sync_agents` (1539) for the `>&2` redirection of chatty steps; `retired-files.json` and `shipped-hashes.json` read from `$TEMPLATES_DIR`.
  </reuse>
  <replaces>
- the RBE-B001 stub dispatch (render and print a count); delete it rather than leave two code paths. The per-file "exists → skip unless `--force`" logic of the `copy_*` loops is NOT replaced: it still serves scaffold, the render and `--refresh` (O13).
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
- the `REFRESH_SUMMARY` last-line convention (`refresh_project()` echoes it as the final stdout line; `runtime-refresh.sh` parses it) for `REBASE_RESULT <json>` [read]; the path-traversal guard in `CLAUDE.md` (resolve, then prefix-check with the separator); `manifest_shippable_hooks`'s `validate_file`/`validate_source` style for rejecting `..` and absolute paths in the retired list [read].
  </follow>
  <careful>
- - Modes (D17): `mkstemp` creates 0600, which is why `stamp_ensemble_version` chmods its temp file ("mkstemp creates 0600", line 1686) [read]. A replaced file keeps its prior mode, an added file takes its rendered mode; after a scaffold, hooks are 755 and hook libs, commands and libs 644 [ran].
  - Symlinks: the render holds none [ran]; a target symlink is replaced by the rename, never written through. Compare `os.path.realpath` of each path's parent with the realpath of `.claude/` plus `os.sep`; on macOS `/tmp` is `/private/tmp` and `/var` is `/private/var`, so unresolved prefixes compare unequal.
  - Skills inside an installed folder: a file in an installed folder that the render lacks is `removed` only when a retired entry covers it, `preserved` otherwise. `--refresh`'s `copy_skills` `rm -rf`s and re-copies the whole folder (~1137–1143) [read], so the two modes differ here; the result lists such files.
  - Agents: an agent whose `normhash` matches the render's but whose preloads differ is `unchanged`; the preload step re-derives it (RBE-B004). The "listed" test uses the target agent's `normhash`.
  - Preserve-all (D14): agents and skills add only; commands, hooks, hook libs, hook prompts, workflows, libs, contracts classified normally; framework rules preserved; nothing removed [read: `rebase-project.md` Flag Behavior Summary].
  - The `..` and outside-symlink cases use a cache-shaped plugin copy (`cp -RL packages/full <tmp>`) for the edited `retired-files.json`, never the repository's own file.
  - CI's BATS job has `timeout-minutes: 10` and runs every suite through `check-test-suites.sh` [read]; each `--rebase` now also renders (about 1 s), so keep fixtures few.
  - Collision: shares `scaffold-project.sh` and `rebase-engine.test.sh` with RBE-B001 (before it) and RBE-B003, RBE-B004 (after it); already ordered by dependencies. RBE-B003 edits the same Python program.
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
BATS, on scaffolded fixtures: a missing framework command is added; the RBE-P002 fixture command and agent copied over their vendored files are replaced; a listed retired file and a retired directory are removed; a user agent and a user skill are preserved; an owner-edited command and agent (a line appended) are conflicts and byte-identical after the run; the six governance rules, verification.md filled with distinctive text, are byte-identical after apply in default and --preserve-all modes; --preserve-all replaces the older command, leaves the older agent, a differing framework rule and a retired file in place, and adds a missing agent; on a fixture whose expected added, replaced, removed, preserved and conflicts lists are each non-empty, --dry-run prints the same category lists as an apply on an identical copy and leaves git status --porcelain empty and every file mode unchanged; a replaced file at mode 0640 is still 0640, an added hook lib is 0644 and an added hook 0755 (their rendered modes), and no written file is 0600; a retired entry containing .. (in a cache-shaped plugin copy with an edited retired-files.json) and a target .claude/commands symlinked to a directory outside .claude/ each exit 1 with error naming the path and leave the target and a sentinel directory outside it unchanged; the last stdout line parses as JSON with all ten file categories and their six lists; the render and plan temp directories are gone after the run
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-B002", phase: 3, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>


<environment_note>
node_modules is installed. Six Jest suites fail with no relation to this change and are the recorded baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout: its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. In tests, create temp trees under BATS_TEST_TMPDIR / mktemp -d, not /tmp, and expect source modes may include setgid.
The tasks of this phase run one after another (B002, then B003, then B004) on the same files; build on what the earlier task left, do not redo it.
</environment_note>
