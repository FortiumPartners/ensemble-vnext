VERDICT: proceed with these caveats: no source PRD was supplied, so the audit could not check whether the change does what the owner asked or whether anything was left out; the rule that implementers leave live, model-spending checks to verification (O1, O7) has no test, by design; `audit-prd.js` has no test proving its model pins; `docs/reference/agents.md` still points at the deleted `packages/full/agents/` directory; the full test battery was not re-run after the last test edit; no measurement shows that subagent starting context fell (two samples after the change read 109.6k and 107.6k tokens, against a median of about 90k before it)

# Audit report: context-model-hygiene

- Date: 2026-09-29
- Audited commit: 4a756b7
- TRD: docs/TRD/context-model-hygiene.md
- PRD: none
- Findings: 5 · applied: 1 · rejected: 0 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/context-model-hygiene.md    PRD: none

VERDICT: proceed with these caveats: no source PRD was supplied, so the audit could not check whether the change does what the owner asked or whether anything was left out; the rule that implementers leave live, model-spending checks to verification (O1, O7) has no test, by design; `audit-prd.js` has no test proving its model pins; `docs/reference/agents.md` still points at the deleted `packages/full/agents/` directory; the full test battery was not re-run after the last test edit; no measurement shows that subagent starting context fell (two samples after the change read 109.6k and 107.6k tokens, against a median of about 90k before it)

Coverage: all 5 verifiers reported. 7 requirements and 6 tasks were checked. Nothing was checked against a PRD because none exists for this feature (`.trd-state/current.json` has `"prd": null`).

TRACEABILITY GAPS
- The live-check rule for implementers and TRD authors (O1, O7). The rule is present in `packages/core/contracts/trd-authoring.md:282-284`, `packages/core/contracts/task-delegation.md:239-240` and the `<check_battery>` block of `implement-trd.md`, with byte-identical mirrors. No test asserts it. The TRD chose this on purpose in the FIX-006 row, citing 4.7.2: tests should catch accidents, and a prompt edit is a decision, not an accident. Recorded and reported here, not closed. No task covers it and none should.
- Model pinning in `packages/core/workflows/audit-prd.js` (part of O2). All four `agent()` calls name an explicit `agentType` or `model` (checked at lines 106/109, 163/166, 361, 472), but `audit-prd.test.js` does not exist, so nothing proves this. The problem predates this TRD, and FIX-002's grounding note defers it. Recorded and reported here, not closed. Whether to add a test harness is a design decision this command does not make.

MISSING IMPLEMENTATION
- The rename of the agent source directory (FIX-003) left stale references in the docs. `docs/reference/agents.md` lines 4 and 15 still cite `packages/full/agents/<name>.md` and `packages/full/agents/skill-affinity.json`. That directory no longer exists; the files are in `packages/full/agents-lib/`. FIX-003's stated scope covered commands, tests and scripts but not docs, so its own criteria still pass. For that reason `/implement-trd --reconcile` would not reopen it. Reported here, not closed. It is a two-line edit suited to `/amend` or `/sweep`.

REJECTED THESE FINDINGS
- None. I re-opened every disputed file and each finding matches what is on disk. The "no PRD, validation skipped" finding is correct. It is reflected in the verdict and in the first Could Not Verify row, not listed as a gap.

NO ACTION
- O3, O4, O5 and the rest of O2 are implemented and tested. The workflow model pins are held by `verify-functional.test.js:2255` and its sibling tests, which were confirmed to fail when a pin is removed. `runtime-integrity.test.sh` holds the check that no agents are registered and the byte ceilings on the rule files; I re-ran that file after `4912d11` edited it and all 17 of its tests passed.

Could Not Verify, rewritten in `/Users/james/dev/fortium/ensemble-vnext/docs/TRD/context-model-hygiene.md`:
- Kept, both still out of scope: whether the change delivers what the owner asked for (no PRD), and cache-read billing.
- Updated: the starting-context row. A figure after the change now exists but is above the baseline, and nothing isolates what the registration fix contributed.
- Updated: the full-battery row. The last green run was at `6613684`, and this audit re-ran only the one test file changed since.

NEXT: `/amend fix the stale packages/full/agents paths in docs/reference/agents.md`, then run the full battery (`npx jest`, pytest, BATS) before closing the feature.
