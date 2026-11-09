VERDICT: proceed with these caveats: there is no PRD, so the build was checked against the TRD only; the wiring test for the functional-verification contract checks that the base-copy read (`owner-rules.js path verification.md`) appears somewhere in the file, not at each of its two verification.md reads

# Audit report: owner-rules-from-base

- Date: 2026-11-08
- Audited commit: 8dee9cb3b1419b2e9eb727bf34b1580f2a5a87c1
- TRD: docs/TRD/owner-rules-from-base.md
- PRD: none
- Findings: 3 · applied: 3 · rejected: 2 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/owner-rules-from-base.md    PRD: none

VERDICT: proceed with these caveats: there is no PRD, so the build was checked against the TRD only; the wiring test for the functional-verification contract checks that the base-copy read (`owner-rules.js path verification.md`) appears somewhere in the file, not at each of its two verification.md reads

Coverage: all 5 verifiers reported; 9 requirements and 4 tasks indexed. No PRD exists for this change (it came from issue #90 via the owner's delegate), so validation against product requirements was not done.

  UNTESTED-IN-PRACTICE
  - The wiring test for the functional-verification contract (the wiring-test task, FIX-004) is weaker than the TRD's "reads through it" wording. `packages/core/commands/owner-rules-wiring.test.js:31-34` only checks the contract contains `owner-rules.js path verification.md` once; the contract reads verification.md at lines 450 and 513, so either could revert to the branch copy and the test would still pass. Behaviour is correct today (no branch-copy read remains). Chains to /implement-trd --reconcile as a test gap.
  - Narrower than the verifier reported it: two stronger tests it missed already exist — `owner-rules-wiring.test.js` has negative checks on implement-trd's raw reads, and `packages/core/contracts/ship-primitives.test.js:329-341` covers the release and close-issue contracts and ship-build's `--policy` argument.

  FIXED THE CITATION
  - The TRD said the sync-design ship step "is already safe … needs no change" (the ship-wiring task, FIX-003). Its own step order says otherwise: the design.md check (step 2) runs before the switch to `origin/<base>` (step 4). The delivered change — reading design.md via `owner-rules.js path` and the new `design-map.js setup --file` — is what O1 requires. Corrected the Decision bullet and added the sync-design contract and `design-map.js` files to FIX-003's Touches. `--file` is tested in `packages/core/lib/design-map.test.js`.

  NO ACTION
  - The other 8 requirements are implemented and tested. The fixture-repo tests in `owner-rules.test.js` (bare origin, base and feature branch) assert returned content, and the coverage floor reads 80 end to end on a base-only change. 243 of 243 tests pass across the owner-rules, wiring, ship-primitive and design-map suites.

  REJECTED THESE FINDINGS — 2 rejected by the reconcile stage (refuted by the stronger tests named above).

Could Not Verify in the TRD now holds three items: no PRD, so product fidelity was unchecked; whether a live model session follows the new prose (out of scope for a code audit); the Storybook reproduction on the other product's repository (out of scope).

After the fix run (`/implement-trd --reconcile`, chained by this audit): 1 of 1 tasks built. The weak wiring test became task AMEND-001; the tests now count every read site and reject any direct read of the branch copy in the functional-verification contract, `implement-trd.md` and `verify-build.md`. The end-of-run code review applied 7 fixes to `packages/core/lib/owner-rules.js` (saved base cleared on fallback and tied to its branch, temp folder owner-checked, CRLF-safe comparison, explicit fetch target, 30s timeouts, header wording) with 3 new tests. It left 3 findings for the owner, recorded in `.trd-state/owner-rules-from-base/discovered.jsonl`. The most important: when the base deletes a rule file the branch never touched (for example ship.md withdrawn on main), an older branch still reads its own copy.
