<task>
  <id>AMEND-002</id>
  <description>Measure the Jest half of TRD §6.1's unit coverage: run npx jest --coverage on packages/core/lib/retired-files.test.js and add the result to .trd-state/deterministic-rebase-engine/evidence/coverage.md: the command run, which source file(s) the figure is for, the line percentage against the 60% floor, and met or not met. Replace the "was not run" bullet under "Not measured". A shortfall is recorded with discovered.record, not fixed here.</description>
</task>

<context>
  <trd_file>docs/TRD/deterministic-rebase-engine.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates><unit_coverage>60%</unit_coverage><integration_coverage>50%</integration_coverage></quality_gates>
  <completed_tasks>RBE-P001, RBE-B001, RBE-P002, RBE-B002, RBE-B003, RBE-B004, RBE-T001, RBE-D001</completed_tasks>
</context>

<decision>
The decisions for this whole change are the table in docs/TRD/deterministic-rebase-engine.md section "### 1.2 Key Technical Decisions" (D1 onward). Read the decisions this task touches (D12, D16, D17, D18 and §6.1) before writing anything; they are binding. If your task would contradict one, stop and report.
</decision>

<scope_boundaries>
Non-goals NG1-NG10 in docs/TRD/deterministic-rebase-engine.md section 8 are hard boundaries. In particular: no change to --refresh (NG4), no rewrite of rebase-project.md (NG1). This task adds TESTS or MEASUREMENT only; change product code only if a test exposes a real defect, and say so.
</scope_boundaries>

<check_battery>
  <unit>bats packages/core/scripts/rebase-engine.test.sh; npx jest packages/core/lib/retired-files.test.js</unit>
  <shell>shellcheck on any .sh you changed</shell>
  <instruction>Run against what you changed; debug failures yourself before returning. Never run live model-spending checks (claude sessions, test/smoke). Do not commit. Do not edit docs/TRD/. Create temp trees under BATS_TEST_TMPDIR or mktemp -d. node_modules is installed; six unrelated Jest suites already fail (status.test.js, live-evidence.test.js, design-criteria.test.js, three skill-md.test.js) — ignore them. Any command that can exceed 600 s runs with Bash run_in_background, output to a log file.</instruction>
</check_battery>

<discovered>
  <instruction>Work outside your scope: record it, do not fix it:
  node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "gap", foundBy: "AMEND-002", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'</instruction>
</discovered>

<deliverables>
1. What you changed, with every file path 2. Tests written and their result 3. Any product-code change and the defect that justified it 4. Scope compliance 5. Anything you could not do, and why
</deliverables>

<grounding>
  <touches>
- .trd-state/deterministic-rebase-engine/evidence/coverage.md
  </touches>
  <careful>
- Read TRD §6.1 to see exactly which subject the Jest figure is meant to cover. If retired-files.test.js exercises a data file and a shell script rather than a JS module (so Jest coverage reports nothing meaningful), say so in coverage.md with the actual jest output, and state the verdict that output supports — do not invent a figure.
- Use --collectCoverageFrom to scope the report to the subject, and --coverageReporters=text-summary.
- Do not edit any test or product file.
  </careful>
</grounding>
<objective>coverage.md names the Jest command, the subject, the percentage against 60% and met/not met (or why no meaningful figure exists), and no longer says the Jest half was not run.</objective>
