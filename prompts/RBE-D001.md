<task>
  <id>RBE-D001</id>
  <description>Add a CHANGELOG.md entry for the --rebase mode, its two data files, the generator and the release step contributors now run (generate-shipped-hashes.sh --append <previous tag>), with a Not-yet-proven list</description>
</task>

<context>
  <trd_file>docs/TRD/deterministic-rebase-engine.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates>
    <unit_coverage>60%</unit_coverage>
    <integration_coverage>50%</integration_coverage>
  </quality_gates>
  <completed_tasks>RBE-P001, RBE-B001, RBE-P002, RBE-B002, RBE-B003, RBE-B004</completed_tasks>
</context>

<grounding>
  <evidence_key>
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables.
  </evidence_key>
  <touches>
- CHANGELOG.md
  </touches>
  <reuse>
no test asserts the changelog's content [ran: a search of the packages, test and workflow directories finds the name only as a doc basename in a custody rule and in unrelated prose]. The entry shape already used: a bold lead sentence per change with its issue number, `### Added`, and a `### Not yet proven` list [read: the 4.17.9 and 4.17.10 entries].
  </reuse>
  <replaces>
nothing.
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
the 4.17.9 `Added` bullets. State the user-visible surface only: the `--rebase` mode and its `--dry-run` and `--preserve-all` modifiers, the `REBASE_RESULT` last-line JSON, the two data files (`packages/core/templates/retired-files.json`, `packages/core/templates/shipped-hashes.json`), the generator's `--seed`, `--append` and `--check` modes, and the release step (append the previous tag).
  </follow>
  <careful>
do not bump `package.json` or plugin versions (release process; `check-version-sync.sh` is not involved). Under `### Not yet proven`: `/rebase-project` does not call `--rebase` yet (F-3 rewrites the prompt; NG1); no headless `/rebase-project` run was made (§6.1); `--refresh` still overwrites owner-edited framework files at SessionStart without comparing bytes, so conflict detection protects only edits made since the last upgrade (OQ-9); files installed from an untagged build read as conflicts (TR1). Contributors learn regeneration steps from `CLAUDE.md` today, which changes through `/update-project`; this task is scoped to `CHANGELOG.md`, so leave `CLAUDE.md`.
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
The entry names the mode, its flags, the result line, retired-files.json and shipped-hashes.json, the generator's three modes and the release step; its ### Not yet proven list says /rebase-project does not call --rebase yet (F-3), no headless /rebase-project run was made, --refresh still overwrites owner-edited framework files without comparing (OQ-9) so conflict detection protects only edits made since the last upgrade, and files installed from untagged builds read as conflicts
</objective>

<skills>
  <matched>none</matched>
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-D001", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>



<environment_note>
node_modules is installed. Six Jest suites fail with no relation to this change and are the recorded phase-gate baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout: its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. In tests, create temp trees under BATS_TEST_TMPDIR / mktemp -d.
Phases 1-3 are built and committed (HEAD dd217f57): scaffold-project.sh --rebase, --dry-run, --preserve-all, the REBASE_RESULT line, settings merge, guard and post-copy steps all exist; packages/core/scripts/rebase-engine.test.sh already holds the B002-B004 cases. Build on them; do not redo them.
RBE-T001 and RBE-D001 run in parallel in this phase; RBE-D001 touches only CHANGELOG.md.
Any single Bash command that can run longer than 600 s (the full BATS sweep through check-test-suites.sh, npx jest on a fresh worktree) must run with Bash run_in_background and its output redirected to a log file you then wait on; a foreground call is cut off at 600 s and the result is lost.
</environment_note>
