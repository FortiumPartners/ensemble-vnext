<phase_verification phase="1">
  <tasks>RBE-P001, RBE-B001</tasks>
  <acceptance_criteria>
RBE-P001: The file parses and holds every name in the §2.1–§2.3 tables and the §2.4 paragraph plus the history-only deletions (create-prd-team.md, create-trd-team.md, implement-trd-proposed.md, implement-trd-tasklist.md, prompts/async-discipline.prompt.md, prompts/autonomy-discipline.prompt.md); hooks/hooks.json and commands/init-project.md.bak are absent; the Jest test passes on the committed file, and fails on a temp copy with one prose name removed, on a temp copy listing commands/plan.md (shipped by the current plugin, found through a render with every library skill selected), and on a temp copy holding an entry with ..

RBE-B001: BATS: every rejected flag combination in §3.1 exits 1; authored_rules prints the six names, and owner-rules.test.js, the scaffold-project.test.sh cases that grep local AUTHORED_RULES=( (~2323, ~2363) and runtime-integrity.test.sh (~55) pass with no edit to those files; for a target with jest installed and a stack.md naming pytest, the render holds skills/jest/SKILL.md, every skill in framework-skills.txt, every manifest hook, hook lib and hook prompt and every command except init-project.md and rebase-project.md, and holds no skills/pytest/, no symlink and none of the six owner-governed rules; --rebase with a relative --plugin-dir renders the same file list as with the absolute one; a cache-shaped plugin (cp -RL packages/full) renders the same file list as packages/full; the target's file list and hashes are unchanged by a render; normhash prints the same hash for an agent before and after inject_agent_skills and a different one after a one-line body edit; with an exclude list, the excluded agent is byte-identical after inject while another agent gains its preloads; every existing scaffold-project.test.sh case stays green
  </acceptance_criteria>
</phase_verification>
<instructions>
Work in /private/tmp/ensemble-vnext-feature-20-deterministic-rebase-engine. Run the tests covering files changed since the last checkpoint (git diff ae4136a9c13f5e987534ddd505a0489ec16619e2 plus untracked files): the Jest files and BATS files the tasks touched, plus packages/core/scripts/scaffold-project.test.sh and test/integration/tests/scaffold-delivery.test.sh and test/integration/tests/runtime-integrity.test.sh and packages/core/lib/owner-rules.test.js when scaffold-project.sh changed. Report pass/fail counts. verification_level is unit-only. Return status "pass" only when every acceptance criterion above is met; check each one against the code and test output, not against the implementer's summary.

Battery rules:
- After each suite you run, record it: node .claude/lib/test-baseline.js record-run --state-dir .trd-state/deterministic-rebase-engine --suite <unit|integration> --command "<the command>" --status <pass|fail> --duration <seconds> --failures-file <file with one failing test id per line>.
- A suite that can outlast 600 s runs with Bash run_in_background and a timeout above its runtime, waited on with Monitor.
- Failing tests already on the base branch are not this phase's failure; report them as already failing.
- NEVER run live model-spending checks (claude sessions, test/smoke/run-smoke.sh).
- Do not edit files; report only.
</instructions>
<baseline base="main">none captured yet</baseline>