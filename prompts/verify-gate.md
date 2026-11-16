<phase_verification phase="1">
  <tasks>FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-006</tasks>
  <acceptance_criteria>
FIX-001: Tests prove: absent/true/null/string → trd, report, design, design-system on and prd, audit-prd, audit-trd, verification-report, audit-build, verify-design-comparison, docs-audit off; false → every kind off, with --requested too; --requested turns prd on; {"prd": true} → prd on, trd still on; {"trd": false} → trd off, --requested turns it back on; non-boolean object values ignored; missing and malformed settings file → defaults; CLI prints exactly the two line forms and exits 0; invalid kind exits 1
FIX-002: Each listed command contains artifacts.js publish --kind <its kind>; none contains a direct read of the old boolean; each says off records --url ""; verify-build's round republish names the resolver's answer; prose tests updated to the new wording
FIX-003: design-commands.md holds no publishArtifacts===false; §5 still says "Make no publish call at all"; design-commands.test.js updated and passing
FIX-004: BATS: refresh over false keeps false; refresh over {"prd": true, "trd": false} keeps that object; fresh scaffold ships true
FIX-005: Guard test passes on the tree and fails if one old sentence is restored; docs describe the three shapes and the default list
FIX-006: diff -r shows .claude/commands and .claude/lib/artifacts.js equal to their packages/core sources; npx jest passes; bats packages/core/scripts/scaffold-project.test.sh test/integration/tests/scaffold-delivery.test.sh test/integration/tests/notify-on-complete.test.sh passes
  </acceptance_criteria>
</phase_verification>
<instructions>
Run the full test suite against files changed since the last checkpoint (git diff 68ec58f9026e8470b96474ec1d8d4aba41953f0f, plus untracked files). Report pass/fail counts and unit/integration coverage %. Read .claude/rules/constitution.md verification_level (unit-only); no task is [LIVE]. Return status "pass" only when every acceptance criterion above is met.

Battery rules:
- After each suite you run, record it: node .claude/lib/test-baseline.js record-run --state-dir .trd-state/publish-artifacts-per-kind --suite <unit|integration|e2e> --command "<the command>" --status <pass|fail> --duration <seconds> --failures-file <file with one failing test id per line>.
- A suite that can outlast 600 s runs with Bash run_in_background and a timeout above its runtime, waited on with Monitor. Never foreground it.
- No base-branch failure baseline is captured yet: for any failure, check whether it also fails on origin/main (git stash is forbidden; use a temporary git worktree at 68ec58f9) and report it as "already failing on main" if so — that does not fail the gate.
- NEVER run a live, model-spending check (test/smoke/run-smoke.sh, claude -p).
</instructions>
<baseline base="main">none captured yet</baseline>