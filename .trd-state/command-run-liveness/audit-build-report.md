VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this feature has no PRD, so the code was checked against the TRD only, never against product requirements); two claims that only a live run can settle remain open: waits with no subagent activity still lapse after 30 minutes, and whether the Stop judge's pause check then behaves correctly on long runs

# Audit report: command-run-liveness

- Date: 2026-09-30
- Audited commit: 5f8dda4
- TRD: docs/TRD/command-run-liveness.md
- PRD: none
- Findings: 1 · applied: 2 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/command-run-liveness.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this feature has no PRD, so the code was checked against the TRD only, never against product requirements); two claims that only a live run can settle remain open: waits with no subagent activity still lapse after 30 minutes, and whether the Stop judge's pause check then behaves correctly on long runs

COVERAGE: all 5 of 5 verifiers reported, over 2 objectives and 2 tasks. Validation against a PRD was UNCHECKED: none exists. The TRD header says "Source PRD: None — small change decided in session", and .trd-state/current.json has "prd": null.

NO ACTION — 2 of 2 tasks are implemented and tested. Re-checked directly, not just taken from the verifiers:
- The router's liveness extension (FIX-001) is built. packages/router/hooks/router.py has _is_framework_owned_command and _last_sign_of_life_is_fresh, which reads a 64 KB tail of each ledger file and handles open agents with "last event wins". The .claude/hooks/router.py copy is byte-identical. Numbered pytest cases are in packages/router/tests/test_router.py. All 124 router tests pass as of this audit.
- The docs change (FIX-002) is in. autonomy.md no longer has the "known gap" sentence (grep count 0), and CLAUDE.md no longer has the ceiling item (grep count 0). The vendored and template copies of autonomy.md are byte-identical. docs/reference/hooks.md describes the extension at lines 189-204.

REJECTED THESE FINDINGS — none. The only finding (validation-audit: "no PRD exists") is accurate. It is not a gap in the delivered code. It is a limit on this audit's coverage, so it is recorded as a Could Not Verify row and carried in the verdict. It does not go to /implement-trd.

COULD NOT VERIFY (rewritten in docs/TRD/command-run-liveness.md):
- 2 rows kept. Both need a live long run, which this audit does not do: long waits with no ledger activity, and whether the Stop judge applies its pause check correctly on the extended turns.
- 1 row added: fit to product intent was unchecked because there is no PRD.

OPEN, OWNER-ONLY: OQ-1, the 4-hour limit on how long one agent with no stop row still counts as a sign of life, remains an assumption the owner has not confirmed.
