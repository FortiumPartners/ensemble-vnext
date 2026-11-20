<phase_verification phase="2">
  <tasks>RBE-P002</tasks>
  <acceptance_criteria>
RBE-P002: --check exits 0 on the committed files, and on a git clone --depth 1 copy of the repository runs its structural and coverage parts and prints history: skipped (shallow clone); a BATS case builds its own full git repo (two commits, v0.0.1 on the first) and asserts --check --repo prints history: checked and exits 0 with a list whose newest tag is v0.0.1, exits 1 naming v0.0.2 once that tag exists in the repo but not in the list, and prints history: skipped (shallow clone) on a --depth 1 clone of it, so the not-skipped path runs on CI too; --check exits 1 naming the path on a list copy holding a path no current render ships and no retired entry covers, and on a list copy holding a hash that is not 40-hex; the fixture command's blob id and the fixture agent's normhash are listed under their paths, and each differs from the current plugin's file; the fixture Stop prompt's hash is in promptHooks and differs from the current template's prompt; tags holds every v* tag merged into HEAD at seed time (48 today, v4.2.0–v4.17.10); where tags exist (skipped with that reason on a shallow clone), --append of an already-listed tag leaves a copy of the file byte-identical, and a live render of the fixture's tag yields hashes equal to the fixtures'
  </acceptance_criteria>
</phase_verification>
<instructions>
Work in /private/tmp/ensemble-vnext-feature-20-deterministic-rebase-engine. Run the tests covering files changed since the last checkpoint (git diff 163c1fe7 plus untracked files): the Jest files and BATS files the tasks touched, plus packages/core/scripts/scaffold-project.test.sh and test/integration/tests/scaffold-delivery.test.sh and test/integration/tests/runtime-integrity.test.sh and packages/core/lib/owner-rules.test.js when scaffold-project.sh changed. Report pass/fail counts. verification_level is unit-only. Return status "pass" only when every acceptance criterion above is met; check each one against the code and test output, not against the implementer's summary.

Battery rules:
- After each suite you run, record it: node .claude/lib/test-baseline.js record-run --state-dir .trd-state/deterministic-rebase-engine --suite <unit|integration> --command "<the command>" --status <pass|fail> --duration <seconds> --failures-file <file with one failing test id per line>.
- A suite that can outlast 600 s runs with Bash run_in_background and a timeout above its runtime, waited on with Monitor.
- Failing tests already on the base branch are not this phase's failure; report them as already failing.
- NEVER run live model-spending checks (claude sessions, test/smoke/run-smoke.sh).
- Do not edit files; report only.
</instructions>
<baseline base="main">none captured yet</baseline>

<environment_note>
node_modules is installed (npm ci ran). Six Jest suites fail with no relation to this change and are the recorded baseline: packages/core/hooks/status.test.js and packages/core/lib/live-evidence.test.js (fail on main too); packages/skills/{design-setup,verification-setup,ship-setup}/__tests__/skill-md.test.js and packages/core/lib/design-criteria.test.js (fail only in this checkout because its folders carry the setgid bit and copying into /tmp cannot set it). Do not try to fix them. If you copy trees in tests, copy into mktemp -d under $TMPDIR (BATS_TEST_TMPDIR), not /tmp.
</environment_note>
