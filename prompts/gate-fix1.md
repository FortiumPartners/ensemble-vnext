<phase_verification phase="4 (audit fix run)">
  <tasks>AMEND-001, AMEND-002, AMEND-003</tasks>
  <acceptance_criteria>
AMEND-001: a BATS case reaches the refused settings write through --rebase and asserts written false / refused, unchanged settings.json bytes and the stamp step skipped with the guard reason; or the task honestly reports no real input reaches it and the strongest honest test is in place. No test-only switch was added to scaffold-project.sh (D12).
AMEND-002: .trd-state/deterministic-rebase-engine/evidence/coverage.md names the Jest command, subject, percentage against 60% and met/not met (or why no meaningful figure exists, backed by the jest output) and no longer says the Jest half was not run.
AMEND-003: the post-copy-steps case asserts the .gitignore and .gitattributes entries and the records cutover's effect, not only "ok".
  </acceptance_criteria>
</phase_verification>
<instructions>
Work in /private/tmp/ensemble-vnext-feature-20-deterministic-rebase-engine. Run bats packages/core/scripts/rebase-engine.test.sh and packages/core/scripts/scaffold-project.test.sh (in the background with output to a log if it may exceed 600 s), plus npx jest packages/core/lib/retired-files.test.js. Check each criterion against the files and test output, not the implementers' summaries; check git diff 3174946ca0668cebf7c744eb79f63c8aa266a698 for any scaffold-project.sh change and judge whether it is a real fix or a test-only switch. Record each suite with node .claude/lib/test-baseline.js record-run --state-dir .trd-state/deterministic-rebase-engine --suite <unit|integration> --command "<cmd>" --status <pass|fail> --duration <s> --failures-file <file>. Do not edit files. Never run live model-spending checks. Return pass only when every criterion is met.
</instructions>
