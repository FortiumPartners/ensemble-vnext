VERDICT: do not proceed until a `verification.md` that exists but cannot be read (a directory, or a file without read permission) reads as `Blocking: all criteria` instead of crashing `read-blocking-policy` (O2, task FIX-001); then the caveats remain: no source supplied — fidelity and omission unchecked; the live fixture scenario for O9 (FIX-010) has never been run.

# Audit report: block-only-on-material-failures

- Date: 2026-11-12
- Audited commit: 46d03934a0f04bf7443375e0a0fb555d4094b844
- TRD: docs/TRD/block-only-on-material-failures.md
- PRD: none
- Findings: 3 · applied: 5 · rejected: 0 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/block-only-on-material-failures.md    PRD: none

VERDICT: do not proceed until a `verification.md` that exists but cannot be read (a directory, or a file without read permission) reads as `Blocking: all criteria` instead of crashing `read-blocking-policy` (O2, task FIX-001); then the caveats remain: no source supplied — fidelity and omission unchecked; the live fixture scenario for O9 (FIX-010) has never been run.

Coverage: 5 of 5 verifiers reported, 9 requirements and 10 tasks indexed. No PRD was supplied, so validation against product requirements is UNCHECKED; only TRD-to-code traceability was checked.

MISMATCH — chains to /implement-trd --reconcile
- O2, the unreadable-file default (FIX-001). The `read-blocking-policy` CLI handles a missing file but not an unreadable one: `packages/core/lib/functional-verification.js:3177-3185` checks `existsSync` and then calls `readFileSync` with no try/catch. I ran it on a directory and it threw `EISDIR` with a stack trace, so it never returned the `all` default. O2 names "missing or unreadable", and the only CLI test (`functional-verification.test.js:2535`) covers just the missing case. The fix needs a guard plus a test for an unreadable path.

TRACEABILITY GAPS — a covering task exists (FIX-010), chains to /implement-trd --reconcile
- O9, the live proof (FIX-010). `test/smoke/scenarios/verify-blocking-policy.sh` is written and registered (`run-smoke.sh:148,202`, `README.md:49`), but there is no sign it was ever run. The evidence folder holds only Jest and grep output, the success definition has no criterion for the live run, and `implement.json` marks FIX-010 `success` with `commit: null`. The next step is one run of the scenario in the `fixtures` environment, with its state file and `discovered.jsonl` kept as evidence.

FIXED THE CITATION
- FIX-010 grounding: the registration lines cited as `run-smoke.sh ~:138-197` are now `~:138-148 and :202`, where `SCENARIO_TIMEOUT` and `LLM_OPT_IN_SCENARIOS` actually are.
- Could Not Verify: the `recommendCoverageFloor` location `~:1132` is now `~:1196`.

REJECTED THESE FINDINGS
- none. I re-opened both disputed files and both findings held.

NO ACTION
- 7 of 9 indexed requirements (O1, O3–O8) are implemented and tested, sourced to the PM instruction of 2026-11-12.

Could Not Verify in `docs/TRD/block-only-on-material-failures.md` was rewritten. It now lists: validation was unchecked because there is no PRD; claims stated only in the Intended Change, Decision and Non-Goals prose were not traced; FIX-010 can still come back inconclusive; and the coverage-floor recommendation may drift lower under `must-pass only`, which was reported but not changed.
