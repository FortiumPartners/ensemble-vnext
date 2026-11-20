<task>
  <id>RBE-T001</id>
  <description>One aged-fixture BATS case across the whole engine, as the investigation's checkable outcomes describe (an older shipped file, a missing file, a retired file, a user agent, a user hook registration, an owner-edited framework file, an owner-filled verification.md): apply, dry-run on a copy made first, a second apply; plus --refresh on a tree with a retired file. Then run the full battery against the pre-change baseline (D18), and measure the coverage §6.1 asks for</description>
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
- packages/core/scripts/rebase-engine.test.sh
  </touches>
  <reuse>
- The fixture pattern in `scaffold-project.test.sh`: `mktemp -d` in `setup()`, `_get_plugin_dir()` returning an absolute `packages/full`, `git init -q`, `git config user.email t@t`, `git config user.name t`, the `_cutover_fixture` shape [read]. Build the aged project with `scaffold-project.sh --plugin-dir <absolute> --copy-skills`, commit it, then mutate it.
  - The RBE-P002 fixtures in `test/fixtures/rebase-engine/` for the older shipped file; an owner edit is a line appended to another framework file.
  - `packages/core/scripts/check-test-suites.sh` runs every `*.test.sh` under `test` and `packages` and fails on a gather error, an empty file or a `setup_file` abort [read]; a new file is picked up with no registration.
  - `node .claude/lib/test-baseline.js record-baseline` and `compare` (D18) for the battery's failing ids, with `--state-dir .trd-state/deterministic-rebase-engine/battery-o15`, and `/implement-trd`'s battery rule 4 for the merge-base worktree procedure (`git worktree add --detach <tmp> <merge-base>`, `git worktree remove --force <tmp>` after) [read: `packages/core/commands/implement-trd.md` ~1374–1387]. `record-baseline` takes only `--suite`, `--base`, `--command`, `--duration` and `--failures-file`, and `compare` returns `{red, newFailures, baselineFailures, baselineKnown}` [read: `.claude/lib/test-baseline.js` `recordBaseline`, `compare`], so pass counts go in `battery-counts.json` and are compared by this task, not by the library.
  - Coverage (§6.1): extract the program with `bash -c 'set --; source packages/core/scripts/scaffold-project.sh; rebase_engine_program' > <tmp>/rebase_engine.py` and run it as `python3 -m trace --count --missing --summary --file <tmp>/counts --coverdir <tmp>/cover <tmp>/rebase_engine.py <mode> ...`, accumulating counts across the `plan`, `apply` and `guard` runs [ran: `python3 -m trace --help` works; `coverage`, `kcov` and `bashcov` are not installed]. Shortfalls are recorded with `node .claude/lib/discovered.js` (`record`), not fixed here.
  - The six governance rule names come from `authored_rules()`; compare bytes with `cmp`, and fill `verification.md` with distinctive text before the run, since the plugin ships a `verification.md` template.
  </reuse>
  <replaces>
none (greenfield test).
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
`_cutover_fixture` and the "cutover:" cases for a git fixture; the `--refresh` case "Framework skills: refresh never deletes an installed framework skill" for the refresh half.
  </follow>
  <careful>
- Make the fixture its own git repo under `mktemp -d`, committed, with no `origin`. `--rebase` cannot take `--no-push` and `records_cutover` seeds and pushes record refs, and `records-cutover.js` resolves the top level with `git rev-parse --show-toplevel`: a fixture nested inside this repository (for example under `.trd-state/.../evidence/live/work/`, which `verification.md` §1a uses for headless sessions) would act on this repository's refs.
  - The result line is the last stdout line and chatter goes to stderr (D16), so `run` (which merges the streams) cannot parse it; use `run --separate-stderr` and `${lines[-1]}`. No existing test does either [ran: no `separate-stderr` or `bats_require_minimum_version` in the repository]; `bats` is 1.13.0 locally and CI runs `npm install -g bats`, so add `bats_require_minimum_version 1.5.0`.
  - Second-apply comparison: hash every file and record every mode, except that `.claude/settings.json` is compared with `ensemble.refreshed_at` and `ensemble.rebased_at` removed (O14). Assert the owner-edited file is still a conflict with the owner's bytes on the second run.
  - Dry-run on a copy: copy the aged fixture (including `.git`) before the apply, run `--dry-run` on the copy, then check `git status --porcelain` empty and modes unchanged (`stat -f %Lp` on macOS, `stat -c %a` on Linux; or compare through one Python call).
  - The battery baseline [ran]: in this checkout `node_modules` is empty and `npx jest` reports 19 failed suites, 41 failed tests of 5,037 before any change: `Cannot find module 'js-yaml'` (`ci-baseline.test.js`, the `skill-md.test.js` suites), `'mock-fs'` (`status.test.js`), and `playwright is not installed` (`design-render*.test.js`). `pytest packages/router/tests` passes (136). A prior checkpoint (`5cadb7b5`) also records "18 suites already failing on main". Run the baseline and the branch battery under the same install state (`npm ci` in both), or the comparison measures the install, not the change.
  - CI's BATS job has a 10-minute timeout (`timeout-minutes: 10`) and runs every suite through `check-test-suites.sh`; keep the new case small (one apply, one dry-run, one second apply, one refresh).
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
The one apply lists every expected entry (added, replaced from the RBE-P002 fixtures, removed, preserved, a carried user registration, the owner edit under conflicts), with all six governance rules byte-identical; --dry-run on the copy prints the same, non-empty lists, with git status --porcelain empty and modes unchanged; the second apply reports zero added/replaced/removed and still lists the owner edit as a conflict with the owner's bytes; --refresh leaves the retired file in place. Battery: for npx jest, ./packages/core/scripts/check-test-suites.sh and pytest packages/router/tests, both the merge-base run and the branch run follow npm ci; failing test ids are recorded in .trd-state/deterministic-rebase-engine/battery-o15/ with record-baseline and pass/fail counts per suite in battery-o15/battery-counts.json, the merge base before the branch; test-baseline.js compare --state-dir .../battery-o15 reports no newFailures for any suite, and no suite's branch passed count is below its merge-base count. Coverage: .trd-state/deterministic-rebase-engine/evidence/coverage.md gives, for rebase_engine_program(), the command run, covered and total lines and the percentage against 60%, marked met or not met (a shortfall is recorded with discovered.record, not fixed in this task), and names the bash part and the integration figure as not measured, with the reason in §6.1
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-T001", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>



<environment_note>
node_modules is installed. Six Jest suites fail with no relation to this change and are the recorded phase-gate baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout: its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. In tests, create temp trees under BATS_TEST_TMPDIR / mktemp -d.
Phases 1-3 are built and committed (HEAD dd217f57): scaffold-project.sh --rebase, --dry-run, --preserve-all, the REBASE_RESULT line, settings merge, guard and post-copy steps all exist; packages/core/scripts/rebase-engine.test.sh already holds the B002-B004 cases. Build on them; do not redo them.
RBE-T001 and RBE-D001 run in parallel in this phase; RBE-D001 touches only CHANGELOG.md.
Any single Bash command that can run longer than 600 s (the full BATS sweep through check-test-suites.sh, npx jest on a fresh worktree) must run with Bash run_in_background and its output redirected to a log file you then wait on; a foreground call is cut off at 600 s and the result is lost.
</environment_note>
