<task>
  <id>AMEND-003</id>
  <description>Strengthen the post-copy-steps BATS case in packages/core/scripts/rebase-engine.test.sh (~lines 851-908) so it checks what the gitFiles and recordsCutover steps actually did, not only that they report ok: after the apply, .gitignore and .gitattributes in the fixture hold the entries the --git-files mode writes (assert the specific lines, taken from ensure_gitignore / ensure_gitattributes in scaffold-project.sh), and the records cutover left its expected trace (the record refs it seeds, or its no-remote outcome, as records_cutover / records-cutover.js define it). Check the same for any other step in that case that asserts only "ok".</description>
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
  node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "gap", foundBy: "AMEND-003", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'</instruction>
</discovered>

<deliverables>
1. What you changed, with every file path 2. Tests written and their result 3. Any product-code change and the defect that justified it 4. Scope compliance 5. Anything you could not do, and why
</deliverables>

<grounding>
  <touches>
- packages/core/scripts/rebase-engine.test.sh
  </touches>
  <careful>
- Another task (AMEND-001) edited this same test file just before you; build on its version, do not revert it.
- Read the existing --git-files and --records-cutover tests in packages/core/scripts/scaffold-project.test.sh for the exact expected contents; reuse their assertions rather than inventing new expectations.
- The fixture is its own git repo with no origin; records_cutover then pushes nothing.
  </careful>
</grounding>
<objective>The post-steps case asserts the .gitignore and .gitattributes entries and the records cutover's effect, every step it lists is checked by its effect, and the whole rebase-engine.test.sh passes.</objective>
