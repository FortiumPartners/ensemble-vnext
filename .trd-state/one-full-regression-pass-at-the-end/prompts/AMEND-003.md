<task>
  <id>AMEND-003</id>
  <description>Rework the live smoke scenario test/smoke/scenarios/verify-regression-pass.sh (criterion FS-19) per the owner ruling below. Today invoice.js and receipt.js are FROZEN, so a careful Debug sees the only fix breaks FS-2 and declines; all three live runs stalled. Changes: remove the FROZEN markers (~:19-20, :180, :185); point FR-1 / RGX-001 at the shared formatter fmt in format.js (it must show two decimals); restate FS-2 as an implicit printer limit, receipt.line(12345).length <= 8 (the fix turns $12345 into $12345.00, 9 chars, so FS-2 breaks); replace the frozen-file check (~:337-343) with a named INCONCLUSIVE when invoice.js changed but format.js did not. Keep the covers mapping unchanged so FS-2 is re-checked as covers-changed. Keep every existing INCONCLUSIVE path, so a miss can never pass. Do NOT run the scenario (it starts claude sessions); the verification loop runs it afterwards.</description>
</task>

<context>
  <trd_file>docs/TRD/one-full-regression-pass-at-the-end.md</trd_file>
  <strategy>tdd</strategy>
  <quality_gates><unit_coverage>60%</unit_coverage><integration_coverage>50%</integration_coverage></quality_gates>
  <completed_tasks>REGR-B001, REGR-B002, REGR-B003, REGR-B004, REGR-B005, REGR-B006, REGR-D001, REGR-T001</completed_tasks>
  <origin>Promoted from the verification plan .trd-state/one-full-regression-pass-at-the-end/verification-plan.md, owner ruling R3 (an OWNER-CALL decided by the --auto agent). The ruling, verbatim:
| R3 | **FS-19** (objective O9, not must-pass: a live fixture run shows the regression pass catching a criterion that a fix broke). Decision: keep the criterion and redesign the scenario. Today `invoice.js` and `receipt.js` are frozen, so a careful Debug sees that the only possible fix breaks FS-2 and declines. All three runs stalled. The changes: remove the FROZEN markers (:19-20, :180, :185); point FR-1 / RGX-001 at the shared formatter `fmt` in `format.js` (it must show two decimals); restate FS-2 as an implicit printer limit, `receipt.line(12345).length <= 8`. The fix turns `$12345` into `$12345.00`, which is 9 characters, so FS-2 breaks. Replace the frozen-file check (:337-343) with a named INCONCLUSIVE when `invoice.js` changed but `format.js` did not. The covers mapping is unchanged, so FS-2 is re-checked as `covers-changed`. Whether the live Debug actually picks the `format.js` fix is a belief, not a fact, and one run settles it. The existing INCONCLUSIVE paths mean a miss can never pass. **OWNER-CALL — decided by: agent (--auto)** | this plan only |
  </origin>
</context>

<grounding>
  <touches>test/smoke/scenarios/verify-regression-pass.sh</touches>
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
Rework the live smoke scenario test/smoke/scenarios/verify-regression-pass.sh (criterion FS-19) per the owner ruling below. Today invoice.js and receipt.js are FROZEN, so a careful Debug sees the only fix breaks FS-2 and declines; all three live runs stalled. Changes: remove the FROZEN markers (~:19-20, :180, :185); point FR-1 / RGX-001 at the shared formatter fmt in format.js (it must show two decimals); restate FS-2 as an implicit printer limit, receipt.line(12345).length <= 8 (the fix turns $12345 into $12345.00, 9 chars, so FS-2 breaks); replace the frozen-file check (~:337-343) with a named INCONCLUSIVE when invoice.js changed but format.js did not. Keep the covers mapping unchanged so FS-2 is re-checked as covers-changed. Keep every existing INCONCLUSIVE path, so a miss can never pass. Do NOT run the scenario (it starts claude sessions); the verification loop runs it afterwards.
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
  <unit>bash -n test/smoke/scenarios/verify-regression-pass.sh; shellcheck test/smoke/scenarios/verify-regression-pass.sh; bats test/integration/tests/smoke-registration.test.sh</unit>
  <instruction>
    Run the commands above. On failure, debug it yourself (5 Whys, fix, re-run) before returning; only report "failed" if still red after genuinely trying. Every packages/core file you edit must have its .claude/ mirror (and packages/full where one exists) updated byte-identically.
    NEVER run a live, model-spending check — anything that starts claude sessions, e.g. test/smoke/run-smoke.sh or claude -p. If a check would need one, report it "not run".
    Do not commit; the orchestrator commits at the phase checkpoint.
  </instruction>
</check_battery>

<discovered>
  <instruction>
    If you find work this task does not cover, RECORD it and carry on; do not fix it or spawn an agent for it:
      node -e 'require("./.claude/lib/discovered").record(".trd-state/one-full-regression-pass-at-the-end", { kind: "bug", foundBy: "AMEND-003", phase: 4, summary: "one line", file: "path", evidence: "how you know" })'
    kind is one of bug | scope-conflict | stale-grounding | gap | risk.
  </instruction>
</discovered>
