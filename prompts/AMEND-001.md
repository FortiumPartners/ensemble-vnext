<task>
  <id>AMEND-001</id>
  <description>Prove, with a BATS case in packages/core/scripts/rebase-engine.test.sh, that a --rebase run whose settings guard refuses the merged write reports it: REBASE_RESULT's settings has written false and refused set, settings.json's bytes are unchanged, and the steps' stamp entry reads "skipped: settings write refused by the guard" (ensemble.version not stamped). The audit found nothing in the test file asserts this (grep refused finds nothing); today the guard is tested only through its standalone guard mode (test 43) and a source-order check (test 49).</description>
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
  node -e 'require("./.claude/lib/discovered").record(".trd-state/deterministic-rebase-engine", { kind: "gap", foundBy: "AMEND-001", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'</instruction>
</discovered>

<deliverables>
1. What you changed, with every file path 2. Tests written and their result 3. Any product-code change and the defect that justified it 4. Scope compliance 5. Anything you could not do, and why
</deliverables>

<grounding>
  <touches>
- packages/core/scripts/rebase-engine.test.sh
- packages/core/scripts/scaffold-project.sh (read; change only for a real defect)
  </touches>
  <careful>
- D12 REJECTED adding a test-only switch to force the guard. Do not add an env var or flag whose only purpose is tests. Find an honest input that drives a refusal end-to-end, for example a cache-shaped plugin copy (the pattern existing tests already use to edit retired-files.json in a plugin copy) whose shipped settings default or manifest makes the merged hooks block hold fewer registrations or prompts than the plugin block the guard compares against. Read write_settings() (~scaffold-project.sh:2676), the guard, and the stamp skip (~:3082) first.
- If, after reading the code, no real input can make a correct merge trip the guard (the audit suspected this), do not fake one: write the strongest honest test available (for example drive the program's apply mode directly with a crafted plan whose merged block is short, if apply accepts a plan as input), and say plainly in your deliverables which path you took and why.
- The result line is the last stdout line and chatter is on stderr: use run --separate-stderr and ${lines[-1]}, as the existing cases do.
  </careful>
</grounding>
<objective>A BATS case passes that reaches the refused settings write through --rebase and asserts written false / refused, unchanged settings.json bytes, and the stamp step skipped with the guard reason; or, if no real input can reach it, the deliverables say so and the strongest honest test is in place.</objective>
