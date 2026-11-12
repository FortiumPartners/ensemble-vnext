<task>
  <id>AMEND-001</id>
  <description>Add one Jest case to packages/core/workflows/verify-functional.test.js, after the O3 regression-pass test (~:4660, inside the same describe that defines journey/reproven/exitWith/bd), proving the end-of-run regression pass also runs when the Judge exits at the iteration-cap iteration (criterion FS-1). Use: journey(reproven, { args: { cap: 2 }, middle: exitWith("exit-stuck", [bd("FS-3","k")], { gaps: ["FS-3"] }), files: ["src/a.js"] }). Assert: exactly 3 Judge calls; the first regression Exercise covers exactly ["FS-1"] with scope reason covers-changed; result.regression.rounds[0] has round 1 and iteration 2. Name the test so it starts "FS-1:" and mentions the iteration cap. If the case fails because the workflow does not run the pass at the cap exit, that is a real defect: fix packages/core/workflows/verify-functional.js minimally and mirror it byte-identically to .claude/workflows/verify-functional.js and packages/full/workflows/ (check which mirrors exist). Test-only otherwise.</description>
</task>

<context>
  <trd_file>docs/TRD/one-full-regression-pass-at-the-end.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates><unit_coverage>60%</unit_coverage><integration_coverage>50%</integration_coverage></quality_gates>
  <completed_tasks>REGR-B001, REGR-B002, REGR-B003, REGR-B004, REGR-B005, REGR-B006, REGR-D001, REGR-T001</completed_tasks>
  <origin>Promoted from the verification plan .trd-state/one-full-regression-pass-at-the-end/verification-plan.md, owner ruling R1 (an OWNER-CALL decided by the --auto agent). The ruling, verbatim:
| R1 | **FS-1** (must pass, objective O1: the regression pass also runs at the iteration-cap exit). Question: change the criterion, or change the build's outputs? Decision: keep the criterion and its must-pass mark. Narrow the wording to "…or when the Judge returns an exit at the iteration-cap iteration, and a Debug pass changed files or criteria are awaiting regression…". Add a Jest case in `verify-functional.test.js` (after the O3 test, ~:4660): `journey(reproven, { args: { cap: 2 }, middle: exitWith('exit-stuck', [bd('FS-3','k')], { gaps: ['FS-3'] }), files: ['src/a.js'] })`. It asserts 3 Judge calls, a first regression exercise of `['FS-1']` with reason `covers-changed`, and `regression.rounds[0]` = `{round:1, iteration:2}`. Reasoning: the pass runs only on a Judge exit (`verify-functional.js:3345-3350`). The fall-through return when the Judge keeps returning remediate up to the cap (`:3498-3519`, `regression: null`) is a Judge failure the TRD planned (TRD :440), so it sits outside the criterion. The existing cap test (`verify-functional.test.js:728-742`) uses `filesChanged: []` and proves nothing about the pass. **OWNER-CALL — decided by: agent (--auto)** | this plan only |
  </origin>
</context>

<grounding>
  <touches>packages/core/workflows/verify-functional.test.js</touches>
  <follow>Read the surrounding tests in the touched file and copy their helpers and naming exactly. [read]</follow>
</grounding>

<decision>Read the TRD's `## Decision` section (D1-D18) before starting; it binds this task. In short: the end-of-run regression pass re-checks only met criteria whose covered files a Debug pass changed (covers-changed), or whose covers are unknown, once per Judge exit.</decision>

<scope_boundaries>
  <non_goals>
## 8. Non-Goals (Scope Boundaries)

| PRD ID | Non-Goal | Rationale |
|--------|----------|-----------|
| NG1 | A literal re-run of every criterion at the end | The roadmap item 3 brief did this. The PM instruction of 2026-11-12 overrides it: "about what today's three iterations cost" (investigation header) |
| NG2 | Roadmap items 4–6: accepted gaps for not-checkable must-pass criteria, materiality, follow-up ranking | To come, built separately (investigation header) |
| NG3 | Changing the full-deploy gate, the 4.17.5 re-proof retry, scoped re-proof at ship or custody's rules | Kept as shipped (roadmap fence; PM instruction; O7) |
| NG4 | The `custody.test.js` flake on all-digit commit hashes | Investigation "not absorbed": a separate fix |
| NG5 | Re-checking a criterion because a file no criterion covers changed | O2; listed in the report instead (D5, OQ-6) |
| NG6 | Knowing WHICH files an earlier, interrupted invocation's last Debug pass changed | Not recorded anywhere; D18(a) treats it as unknown, which widens the scope instead |
| NG8 | Edits `/verify-build`'s fix rounds make between workflow runs (`/implement-trd --reconcile --chained`, then a new run carrying `met` entries forward with their original `provenAt`, `verify-build.md` ~:632-648) | Outside the workflow and outside this feature's mechanism (Debug edits within a run). Follow-up: have the fix loop drop from its resume snapshot every `met` entry whose covers the round's `git diff` touches (/plan adversarial pass, Finding 1) |
| NG7 | Editing `.claude/rules/verification.md`, `constitution.md` or `stack.md` | Owner-governed (`CLAUDE.md` Approval Requirements). The O9 fixture writes its own `verification.md` inside its slot |
  </non_goals>
  <instruction>If the task would address a non-goal, STOP and report the scope conflict.</instruction>
</scope_boundaries>

<objective>
Add one Jest case to packages/core/workflows/verify-functional.test.js, after the O3 regression-pass test (~:4660, inside the same describe that defines journey/reproven/exitWith/bd), proving the end-of-run regression pass also runs when the Judge exits at the iteration-cap iteration (criterion FS-1). Use: journey(reproven, { args: { cap: 2 }, middle: exitWith("exit-stuck", [bd("FS-3","k")], { gaps: ["FS-3"] }), files: ["src/a.js"] }). Assert: exactly 3 Judge calls; the first regression Exercise covers exactly ["FS-1"] with scope reason covers-changed; result.regression.rounds[0] has round 1 and iteration 2. Name the test so it starts "FS-1:" and mentions the iteration cap. If the case fails because the workflow does not run the pass at the cap exit, that is a real defect: fix packages/core/workflows/verify-functional.js minimally and mirror it byte-identically to .claude/workflows/verify-functional.js and packages/full/workflows/ (check which mirrors exist). Test-only otherwise.
</objective>

<skills>
  <matched>none</matched>
  <instruction>Invoke each listed skill with the Skill tool if it is available to you before writing code; report SKILLS_USED and RULES_APPLIED (or "none available").</instruction>
</skills>

<strategy_instructions>
Strategy is: tdd — write the failing test and the minimal fix within this task yourself (no separate RED stage runs); do not add beyond what the tests require.
</strategy_instructions>

<deliverables>
1. Implementation complete per objective 2. Every file changed, with paths 3. Tests written 4. Brief outcome summary 5. Anything deleted under <replaces>, or a statement it was empty 6. [inferred] grounding checked and what you found 7. Scope compliance confirmation 8. Skills used and rules applied
</deliverables>

<check_battery>
  <unit>npx jest packages/core/workflows/verify-functional.test.js (and any mirror-parity test if you touch verify-functional.js)</unit>
  <instruction>
    Run the commands above. On failure, debug it yourself (5 Whys, fix, re-run) before returning; only report "failed" if still red after genuinely trying. Every packages/core file you edit must have its .claude/ mirror (and packages/full where one exists) updated byte-identically.
    NEVER run a live, model-spending check — anything that starts claude sessions, e.g. test/smoke/run-smoke.sh or claude -p. If a check would need one, report it "not run".
    Do not commit; the orchestrator commits at the phase checkpoint.
  </instruction>
</check_battery>

<discovered>
  <instruction>
    If you find work this task does not cover, RECORD it and carry on; do not fix it or spawn an agent for it:
      node -e 'require("./.claude/lib/discovered").record(".trd-state/one-full-regression-pass-at-the-end", { kind: "bug", foundBy: "AMEND-001", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>
