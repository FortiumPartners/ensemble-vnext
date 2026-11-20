<task>
  <id>RBE-B003</id>
  <description>Add the settings merge (D11), its conflicts and the guard mode wired before the one settings write (D12), and preserve-all's settings rule (D14) to the planner and applier</description>
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
- - The plugin default is `packages/core/templates/claude-directory/settings.json`, read through `$TEMPLATES_DIR`; its `hooks` holds 10 registrations, 1 of them `prompt`-type (the Stop prompt), over 7 events; top-level keys `$schema`, `env`, `permissions` (`allow`), `hooks`, `ensemble` [ran]. Do not regenerate the block from `hooks.manifest.json`: `generate-hooks-artifacts.sh` (`build_hooks_block`) owns that, and its CI step (`generate-hooks-artifacts.sh --check`) plus the T007 drift cases in `scaffold-project.test.sh` keep the template equal to the manifest [read].
  - The write pattern in `stamp_ensemble_version()`: load with `object_pairs_hook=collections.OrderedDict`, `copy.deepcopy` the original, leave the file alone when `data == original`, else `tempfile.mkstemp(dir=<settings dir>)`, `os.chmod(tmp, <original mode>)`, `os.replace`, `json.dump(data, fh, indent=2)` plus a trailing newline [read]. Match it so the later strict stamp and this write agree on formatting.
  - The registration count in `rebase-project.md` §4.6 step 4: `sum(len(g['hooks']) for ev in s['hooks'].values() for g in ev)` and the `type=='prompt'` count [read]. One registration is one entry in a group's `hooks` list, not one group; `guard` uses the same unit.
  - `manifest_shippable_hooks()` (674; already validates flat basenames) for the manifest's hook file names; `retired-files.json` (RBE-P001) and `shipped-hashes.json` `promptHooks` (RBE-P002) for ownership; the RBE-P002 fixture Stop prompt for the old-text case.
  </reuse>
  <replaces>
- nothing in code becomes unreachable. The prose merge in `rebase-project.md` §4.6 (3a and the step-4 one-liner) is superseded in behaviour but stays untouched until F-3 (NG1). The `setdefault` backfills in `stamp_ensemble_version` (`ensemble.publishArtifacts`, `openPullRequest`, `records`, `verificationRunLimit`, `env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) overlap with the merge's "add absent plugin keys" rule; leave both, they agree.
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
- the "merge, never replace" comment block in `stamp_ensemble_version`: nested plugin keys are added, an owner's value is never overwritten.
  </follow>
  <careful>
- - Plan/apply split (D2): the merge result goes into the plan file; the apply branch only writes, through one function that runs the guard first.
  - Ownership by `.claude/hooks/<file>` (D11 2a): template commands look like `bash -c 'cd "${CLAUDE_PROJECT_DIR:-...}" && .claude/hooks/router.py'`, so extract the path with a regex over the command text, not a prefix match, and match the full `.claude/hooks/<file>` path, never the basename alone (`bash scripts/formatter.sh` is the user's). Retired entries are stored without the `.claude/` prefix and directory entries end in `/` (`hooks/permitter/`): match those by prefix. `discipline-stop.js` in the manifest is the entry id of a prompt hook, not a file in `.claude/hooks/` [read: `manifest_shippable_hooks` skips `hookType: prompt`].
  - Byte comparisons (D12): this task runs before RBE-B004 wires the stamp, but write every settings assertion in the form that survives it: the two timestamp keys removed from both sides, fixtures at the plugin's `ensemble.version`, plus `settings.written` from the result [ran: `--stamp-version` twice 1.2 s apart changed the file's SHA-1].
  - Compute the plugin's counts (10 and 1 today) from the template at run time; do not hard-code them.
  - A `settings.json` that is not JSON also makes the strict stamp fail later (`json.load` raises, reported as `Failed to stamp ... left unchanged`) [read]; that is a `failed:` entry in `steps` (RBE-B004), not an engine failure (§3.4). With no `settings.json`, writing the plugin default (D11 6) is also what lets the stamp, which errors on a missing file, succeed.
  - Collisions: `scaffold-project.sh` and `rebase-engine.test.sh` are also touched by RBE-B001, RBE-B002, RBE-B004 (and the test file by RBE-P002 and RBE-T001). All are serialized by the declared edges; none can share a wave with this task.
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
BATS (settings comparisons remove ensemble.refreshed_at and ensemble.rebased_at from both sides; fixtures carry the plugin's ensemble.version): a user command registration on PostToolUse and bash scripts/formatter.sh on PreToolUse are carried forward on their own events, once each; .claude/hooks/status.js registered on an event the manifest does not give it, and .claude/hooks/learning.sh (retired), are dropped; the RBE-P002 fixture's old Stop prompt is dropped and the plugin's prompt appears exactly once; with a plugin copy whose promptHooks is emptied, the current prompt still appears exactly once after two applies; a local env value and ensemble.openPullRequest: "auto" survive; a removed top-level plugin key and a removed permissions.allow are added back; hooks set to a list is a conflict with settings.written false and the hooks value unchanged, while the same fixture with a valid hooks holding one user registration gives settings.written true and a file holding that registration; a key whose local value is a string where the plugin has an object is a conflict with the local value kept, while another change in the same file is written; guard exits 1 naming both counts on the plugin block with one command registration removed and on the plugin block with its prompt entry replaced by a command (registration count equal, prompt count below), and exits 0 on the plugin block alone and plus a user registration; a first apply on a fixture missing a plugin key gives settings.written true and a second apply gives settings.written false with the file equal; under --preserve-all the old Stop prompt and the retired registration are still dropped and a removed top-level key is added, while a permissions object lacking allow and a local env value are unchanged; with no settings.json the plugin default is written and every key is in settings.added; a settings.json that is not JSON is a conflict and its bytes are unchanged. Review: the program has one settings-write function and it calls the guard check first
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-B003", phase: 3, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>


<environment_note>
node_modules is installed. Six Jest suites fail with no relation to this change and are the recorded baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout: its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. In tests, create temp trees under BATS_TEST_TMPDIR / mktemp -d, not /tmp, and expect source modes may include setgid.
The tasks of this phase run one after another (B002, then B003, then B004) on the same files; build on what the earlier task left, do not redo it.
</environment_note>
