VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; FIX-004's rule-file trim removed two section headings that three other documents still cite by name; nothing tests the live-check rule, the absence of plugin agent registration, or the byte ceilings on the rule files and CLAUDE.md

# Audit report: context-model-hygiene

- Date: 2026-09-29
- Audited commit: 418f5b6
- TRD: docs/TRD/context-model-hygiene.md
- PRD: none
- Findings: 8 · applied: 4 · rejected: 1 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/context-model-hygiene.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; FIX-004's rule-file trim removed two section headings that three other documents still cite by name; nothing tests the live-check rule, the absence of plugin agent registration, or the byte ceilings on the rule files and CLAUDE.md

Coverage: all 5 of 5 verifiers reported. 7 requirements and 5 tasks were indexed. There was no PRD, so validation against product requirements did NOT run. This audit checked the TRD against the code only.

TRACEABILITY GAPS: each is built, but no test proves it. A task covers every one, so each goes to /implement-trd --reconcile.
- The rule that implementers never run live, model-spending checks (O1, O7; FIX-001). The rule is present in trd-authoring.md:282, task-delegation.md:238 and implement-trd.md:599, and each matches its .claude/ copy. No test asserts the text. Note that the 4.7.2 standard dropped prose assertions against prompts, so the reconcile should decide whether this rule deserves a test at all.
- Agents registered once (O3; FIX-003). Nothing fails if an "agents" key is added back to packages/full/.claude-plugin/plugin.json. The rename to agents-lib is already guarded by scaffold-delivery.test.sh:251, agent-validation.test.js:43 and runtime-integrity.test.sh:214. The live `claude plugin details` count of 0 agents was recorded once, as evidence, and is not a test.
- Rule-file byte ceilings (O4; FIX-004). The files measure 8,041 + 8,187 = 16,228 bytes against the 17,000 ceiling, and command-status.md measures 12,206 against 12,500. No test holds either ceiling, so the files could grow back.
- CLAUDE.md byte ceiling (O5; FIX-005). It measures 14,961 bytes against 15,000. No test holds it.
- Model pins in audit-prd.js (O2). All four agent() calls are pinned, but that workflow has no harness test. The TRD already declares this.

MISMATCH: goes to /implement-trd --reconcile (FIX-004).
- The trim dropped the heading "How the guard works (at a glance)" from async-discipline.md. Two documents still cite it: docs/PRD/autonomy-judge-command-scope.md:390 and docs/TRD/autonomy-judge-command-scope.md:857. The rule itself survives: "A judge error or timeout allows." is now under "Override".
- The trim also folded "The dispatch ledger" into "Orchestration pattern: the scheduled nudge". docs/TRD/completed/implement-trd-rework.md:1095 still cites the old heading.
- docs/reference/hooks.md:290 was already repointed to the history file. The reconcile should repoint these three citations the same way.
- I did not fix them here: they sit outside this TRD's Could Not Verify section.

REJECTED THESE FINDINGS (in part):
- O1/O7 claimed that "even mirror drift on trd-authoring.md goes uncaught". That is wrong. test/integration/tests/runtime-integrity.test.sh:204-214 compares every file in packages/core/contracts against .claude/contracts. The missing content test still stands.

NO ACTION:
- O2's pins. verify-functional.js now pins Render to sonnet (:908) and both Judge calls to opus (:937, :1177). Seven workflow harness tests assert that every agent() call carries an agentType or a model. I re-ran the 8 workflow suites: 236 tests, all passing.

Could Not Verify, rewritten in docs/TRD/context-model-hygiene.md, now has 4 rows:
1. Fidelity to the owner's request: no PRD exists.
2. How much subagent starting context the change saved: needs a live measurement.
3. The full test battery: not re-run here. It was last green at commit 7abb6a8.
4. Whether cache reads bill against the owner's plan the same way as on the API.

NEXT: /implement-trd docs/TRD/context-model-hygiene.md --reconcile
