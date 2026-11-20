<task>
  <id>RBE-P002</id>
  <description>Write packages/core/scripts/generate-shipped-hashes.sh (--seed, --append <tag>, --check; D8); run --seed and commit packages/core/templates/shipped-hashes.json; add to retired-files.json every path the coverage check finds; commit older-version fixtures in test/fixtures/rebase-engine/: a command and an agent copied from an older tag's render, and that tag's Stop prompt string</description>
</task>

<context>
  <trd_file>docs/TRD/deterministic-rebase-engine.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates>
    <unit_coverage>60%</unit_coverage>
    <integration_coverage>50%</integration_coverage>
  </quality_gates>
  <completed_tasks>RBE-P001, RBE-B001</completed_tasks>
</context>

<grounding>
  <evidence_key>
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables.
  </evidence_key>
  <touches>
- packages/core/scripts/generate-shipped-hashes.sh
- packages/core/templates/shipped-hashes.json
- packages/core/templates/retired-files.json
- test/fixtures/rebase-engine/
- packages/core/scripts/rebase-engine.test.sh
  </touches>
  <reuse>
- `render_plugin_tree()` and `normhash` from RBE-B001 for the current render and every agent hash (source `scaffold-project.sh` after `set --`); each tag's own `packages/core/scripts/scaffold-project.sh` for that tag's render: the `v*` scripts sampled all accept `--plugin-dir` and `--copy-skills` and read `.claude/selected-skills.txt` [read: `git show <tag>:packages/core/scripts/scaffold-project.sh` for v4.2.0, v4.6.0, v4.10.0, v4.15.0]; `generate-hooks-artifacts.sh` for how a generator with a `--check` mode is written [read].
  </reuse>
  <replaces>
- nothing.
  </replaces> — DELETE what this names, and its tests, in the same change.
  <follow>
- `generate-hooks-artifacts.sh` (`--check` exits non-zero and names what drifted). Sorted keys and lists, one hash per line when pretty-printed, so an append's diff is reviewable. ShellCheck at `--severity=warning` (`ci.yml`) [read].
  </follow>
  <careful>
- - Tags [ran: `git tag | sort -V`]: 48 `v*` tags, `v4.2.0`–`v4.17.10`, and 15 unprefixed ones, `4.1.9`–`4.1.23`; D8 renders the `v*` ones (OQ-10). The newest `v*` tag merged into HEAD is `v4.17.10`, and this worktree is not shallow [ran].
  - Export each tag with `git archive <tag>` piped to `tar -x -C <tmp>`: it keeps the `packages/full` → `../core` symlinks and writes nothing into this repository's `.git` (a `git worktree add` leaves `.git/worktrees` state behind on a crash).
  - The tag's skill library is `packages/full/skills-lib` (a symlink to `../skills`) at every tag sampled [ran: `git ls-tree`]; fall back to `packages/full/skills` if a tag lacks it. List every folder in it in the render's selection file.
  - Every render needs an absolute `--plugin-dir` and `GIT_CEILING_DIRECTORIES` (RBE-B001 Careful). The four sampled old scripts have no `ensure_gitignore` and no `git rm` at all [read]; later ones untrack, which the ceiling makes a no-op.
  - Prompt strings: read every `type: prompt` registration's `prompt` field from the render's `.claude/settings.json` as a decoded JSON string, hashed as UTF-8 with nothing added or stripped, the same value the planner hashes (D11). Every sampled `v*` template carries 10 registrations and 1 prompt [ran]; v4.6.0's text begins with an ANSI escape and "STOP HOOK FIRED", today's "Ensemble stop discipline:", so there are at least two distinct prompt hashes.
  - Category mapping and exclusions are D4's: files an old render puts outside the category directories are ignored, and the current owner-governed rules are never hashed.
  - Old renders hold files since retired (for example `hooks/async-discipline.js`, `hooks/prompts/autonomy-discipline.prompt.md`); the coverage check is what makes the retired list complete for every release since `v4.2.0`. Few framework files were deleted after `v4.2.0` [ran: `git log --diff-filter=D v4.2.0..HEAD` over the source directories lists `commands/investigate.md`, `skills/verify-plan-recovery/` and `hooks/hooks.json`, never installed], so expect few additions beyond the prose.
  - The coverage check renders the current plugin with every library skill selected and needs no history, so it runs on CI's shallow checkout.
  - Fixtures: choose a command and an agent that changed after the chosen tag (for example `commands/plan.md` and `agents/backend-implementer.md` from a `v4.15.0` render), copy them, and that tag's Stop prompt string, into `test/fixtures/rebase-engine/`. RBE-B002, B003 and T001 use them as "an older shipped version", so no test needs git history at runtime (CI is shallow: `actions/checkout@v4`, no `fetch-depth` [read]).
  - History-check test: build a throwaway repo inside the test and point `--check` at it with `--repo` and `--list`; a `git clone --depth 1 file://<repo>` of it is the shallow case. That is how the not-skipped path runs on CI.
  - `--seed` renders 48 tags with every library skill, a few hundred files each; it is a one-time local run. If a tag will not render, stop and report it as a scope conflict rather than dropping it: its installs would read as conflicts with no trace.
  - Untagged installs: `.claude-plugin/marketplace.json` points at `./packages/full` with no ref [read], so an install made between a merge and the next tag holds bytes no tag rendered (TR1).
  </careful>
  <instruction>
    This grounding was established by reading the codebase during TRD authoring. Treat it as findings you own: do NOT reimplement anything named in <reuse>; DELETE anything <replaces> names; match <follow>; weigh each line by its evidence marker and check [inferred] claims first; report any stale or wrong grounding in your deliverables.
  </instruction>
</grounding>

<decision>
The decisions for this whole change are the table in docs/TRD/deterministic-rebase-engine.md section "### 1.2 Key Technical Decisions" (D1 onward). READ THAT SECTION IN FULL, and section "## 3. Technical Specifications", before writing any code: they are binding on this task.
</decision>

<decision_note>The <decision> is the approach chosen for THIS change, decided during planning; it may describe behaviour that does not exist yet. Follow it as a constraint. If your task would contradict it, stop and report.</decision_note>

<unverified_claims>
  <claim check="After --seed, render each tag twice with different skill selections and compare the two normhash outputs per agent (RBE-P002 proves one tag through its fixture)">normalise(strip(...)) removes the preload block every v* tag's scaffold wrote, not just today's (13 of 13 current agents measured 2026-10-12 by the sibling TRD)</claim>
  <claim check="Run --seed (RBE-P002); it stops on the first tag that fails">Every v* tag's own scaffold renders cleanly outside a git work tree with an absolute --plugin-dir and --copy-skills (four tags' scripts read for the flags, none run)</claim>
  <instruction>This task rests on a claim nobody verified. Check it first. If it is false, stop and report — do not build on it.</instruction>
</unverified_claims>

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
--check exits 0 on the committed files, and on a git clone --depth 1 copy of the repository runs its structural and coverage parts and prints history: skipped (shallow clone); a BATS case builds its own full git repo (two commits, v0.0.1 on the first) and asserts --check --repo prints history: checked and exits 0 with a list whose newest tag is v0.0.1, exits 1 naming v0.0.2 once that tag exists in the repo but not in the list, and prints history: skipped (shallow clone) on a --depth 1 clone of it, so the not-skipped path runs on CI too; --check exits 1 naming the path on a list copy holding a path no current render ships and no retired entry covers, and on a list copy holding a hash that is not 40-hex; the fixture command's blob id and the fixture agent's normhash are listed under their paths, and each differs from the current plugin's file; the fixture Stop prompt's hash is in promptHooks and differs from the current template's prompt; tags holds every v* tag merged into HEAD at seed time (48 today, v4.2.0–v4.17.10); where tags exist (skipped with that reason on a shallow clone), --append of an already-listed tag leaves a copy of the file byte-identical, and a live render of the fixture's tag yields hashes equal to the fixtures'
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
      node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "bug", foundBy: "RBE-P002", phase: 2, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>


<environment_note>
node_modules is installed (npm ci ran). Six Jest suites fail with no relation to this change and are the recorded baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout because its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. If you copy trees in tests, copy into mktemp -d under $TMPDIR (BATS_TEST_TMPDIR), not /tmp.
</environment_note>
