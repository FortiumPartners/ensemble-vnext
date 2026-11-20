<task>
  <id>RBE-B004</id>
  <description>Wire the post-copy steps in D17's order (hook modes, reconcile_selected_skills, inject_agent_skills excluding conflicted agents, git files, records cutover, stamp_ensemble_version strict last) and report each in steps</description>
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
- - `ensure_hooks_executable "$dest" "$names"`, fed `manifest_shippable_hooks "$manifest" | cut -f1` with `manifest="$(find_plugin_json hooks hooks.manifest.json)"`, exactly as `copy_hooks()` does [read].
  - `reconcile_selected_skills "$target"`: reads only `selected-skills.txt`, the plugin skills directory and `framework-skills.txt`, never `stack.md` [read], which is what the `pytest` criterion needs. It returns 0 silently without a selection file or a skills directory.
  - `inject_agent_skills "$target" "$excluded"` with RBE-B001's optional exclude list, fed the agents the plan lists under `conflicts`. Its `inject` branch rewrites every `*.md` with an affinity pool when the text changes [read], which is why the exclude list exists.
  - `ensure_gitignore untrack` and `ensure_gitattributes`, which use relative paths: run them as `(cd "$target" && ensure_gitignore untrack && ensure_gitattributes)`, as the `--git-files` arm at the bottom of the file does.
  - `records_cutover "$target"`: it calls `ensure_gitignore` and `ensure_gitattributes` itself and then `cd`s into the target without returning [read], so run it in a subshell.
  - `stamp_ensemble_version "$target" strict`, last (returns 1 with an error on stderr for every failure).
  </reuse>
  <replaces>
- nothing becomes unreachable. The standalone modes `--sync-agents`, `--stamp-version`, `--git-files` and `--records-cutover` are what `rebase-project.md` §4.7a, §4.7b, §4.8 and the agent step call until F-3 (NG1); keep every one.
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
- `sync_agents()` for stdout discipline (`inject_agent_skills "$target_dir" >&2`), `refresh_project()` for stamping only after every other step, and the `--git-files` arm for the subshell form.
  </follow>
  <careful>
- - `info` and `warn` write to stdout [read: `info() { echo -e ...}`], and `--records-cutover` prints `[INFO] Added to .gitignore: ...` and `[INFO] Records seed: {...}` there [ran]. Redirect every post-copy step to stderr, or "the last stdout line is `REBASE_RESULT`" holds only by accident. The `inject` Python also prints `AGENT_SKILLS_INJECTED ...` to stdout.
  - Step status cannot be read from return codes: `reconcile_selected_skills` and `inject_agent_skills` return 0 when they skip; `ensure_gitignore`, `ensure_gitattributes` and `records_cutover` warn and return 0 on a failed write or untrack; `ensure_hooks_executable` always returns 0. Derive `ok`/`skipped: <reason>`/`failed: <reason>` from each step's preconditions and its captured `[WARN]` lines, as `rebase-project.md` §4.7a/§4.7b tell the model to read them. Only `stamp_ensemble_version strict` returns non-zero; under `set -euo pipefail` capture with `if ! out="$(step 2>&1 >/dev/null)"` so a failed step does not abort the run.
  - `steps` is built after `apply` has printed its JSON, so the final line merges the two (a small Python call or a result file) rather than printing twice. RBE-B002 owns the emission; this task extends it.
  - `records_cutover` reads the global `NO_PUSH`, false in this mode because `--no-push` is exclusive with `--rebase`. With an `origin` it pushes the seeded record refs (best effort), as §4.7b does today; with none it exits 0 and prints `{"ok":true,"seeded":[],"skipped":[]}` [ran: `--records-cutover` in a fresh `git init` repo]; the `no-remote` outcome is in `record-ref.js`.
  - Strict stamp: the first stamp on a project with no version writes `refreshed_at` only; a later one adds `rebased_at`; `previous_version` is written only when the version changed [ran, read]. So a second apply moves only the two timestamps (O14).
  - Preserve-all: an older (not conflicted) agent is not excluded, so its generated block is re-derived, which matches `sync_agents` with `--new-only`.
  - Collisions: same files as RBE-B003; serialized by the edge.
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
BATS on one fixture git repo (committed, no origin) scaffolded with --copy-skills and jest selected, then aged: every manifest hook chmod -x, ensemble.version set to 4.15.0, every agent's preloads stripped (raw agents-lib copies), one agent owner-edited, one framework command deleted, stack.md naming pytest. The first apply: steps lists modes, selection, preloads, gitFiles, recordsCutover, stamp in that order, each ok (the cutover's no-remote push outcome reported inside its ok, the one skip a remote-less fixture cannot avoid); every manifest hook is executable; selected-skills.txt is non-empty and names jest and not pytest, and .claude/skills/pytest/ is absent; every agent with an affinity pool carries its skills: preload again; the owner-edited agent is byte-identical; ensemble.version equals the plugin's and previous_version is 4.15.0; categories.commands.added names the deleted command. A second apply then reports empty added, replaced and removed in every category and changes no file's bytes or mode except settings.json's ensemble.refreshed_at and ensemble.rebased_at
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-B004", phase: 3, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>


<environment_note>
node_modules is installed. Six Jest suites fail with no relation to this change and are the recorded baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout: its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. In tests, create temp trees under BATS_TEST_TMPDIR / mktemp -d, not /tmp, and expect source modes may include setgid.
The tasks of this phase run one after another (B002, then B003, then B004) on the same files; build on what the earlier task left, do not redo it.
</environment_note>
