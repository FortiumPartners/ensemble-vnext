# Implementer brief — accepted-gaps-for-not-checkable-must-pass-criteria

Your dispatch prompt gives your task id, description, objective (acceptance) and touched files. This brief is the rest of the binding instruction set (packages/core/contracts/task-delegation.md, filled in). Follow every block.

<read_first>
  Before writing code, read these sections of docs/TRD/accepted-gaps-for-not-checkable-must-pass-criteria.md in full; they are part of this prompt:
  - the Master Task List row for <your task id>
  - `### <your task id>` under `## 9. Task Grounding` — your grounding. Evidence markers: [ran] executed and read (trust most); [read] opened and verified (trust); [inferred] deduced, not checked — VERIFY before relying on it, and report it if wrong. Do NOT reimplement anything under Reuse; DELETE what Replaces names (and its tests) in this change; match the pattern under Follow.
  - every `D<n>` decision the task row and grounding cite (the Decisions table in `## 1. Overview`/`## 3`), and `## 3. Technical Specifications`. The decisions are the approach chosen for THIS change, not prior art; they may describe behaviour another task is building now. If your task would contradict one, stop and report.
  - `## 8. Non-Goals` — if your work would address a non-goal, STOP and report the scope conflict.
  - `## Could Not Verify` — if a claim there touches your files, check it first; if false, stop and report.
</read_first>

<scope_discipline>
  <instruction>
    Implement what the task asks for. Do NOT add delivery machinery — feature flags,
    rollout phases, migration scaffolding, guard infrastructure, eval gates, config
    toggles — unless the task or the TRD explicitly calls for it and names the
    objective it serves. If you believe such machinery is genuinely needed, report it as a
    finding for the orchestrator; do not build it on your own judgment.
  </instruction>
</scope_discipline>

<skills>
  <matched>none</matched>
  <instruction>No skills matched. In your deliverables report SKILLS_USED: none available.</instruction>
</skills>

<strategy_instructions>
Strategy is: tdd

- **tdd** — write the failing test and the minimal fix within this task yourself (no separate RED stage runs before you); do not add beyond what the test requires, and do not refactor.
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

<mirrors>
  <instruction>
    Every packaged file you edit under packages/core/{lib,workflows,commands,contracts} has a byte-identical
    mirror under .claude/{lib,workflows,commands,contracts}; copy your final version over the mirror
    (cp) so they stay identical. Tests check this. Several other tasks edit other files in parallel
    with you: touch only the files your task names, and never run git add, git commit, git stash or
    git checkout — the orchestrator commits.
  </instruction>
</mirrors>

<check_battery>
  <unit>npx jest {the test files for the paths this task touches}</unit>
  <shell>shellcheck {changed .sh files, if any}</shell>
  <!-- typecheck and lint are empty for this project. Do not invent commands for them. -->
  <instruction>
    Run the commands above against files you changed. On failure, debug it yourself
    (5 Whys, fix, re-run) before returning — do NOT return status "failed" on the first
    red run. Only report "failed" if the battery is still red after you've genuinely
    tried to fix it. Note: in this environment three cp -RL skill-md tests and status.test.js
    (mock-fs on Node 26) fail for environment reasons on main too; ignore those.

    NEVER run a live, model-spending check — anything that starts `claude` sessions, e.g.
    `test/smoke/run-smoke.sh` or `claude -p`. If a check would need one, report it "not run".
  </instruction>
</check_battery>

<discovered>
  <instruction>
    If you find work this task does not cover -- a bug outside your scope, grounding that
    is stale, a gap nobody planned for -- RECORD it and carry on with your own task:

      node -e 'require("./.claude/lib/discovered").record(".trd-state/accepted-gaps-for-not-checkable-must-pass-criteria", { kind: "bug", foundBy: "<your task id>", phase: <your phase>, summary: "one line", file: "path", evidence: "how you know" })'

    kind is one of bug | scope-conflict | stale-grounding | gap | risk. This is a RECORD, not a task.
  </instruction>
</discovered>
