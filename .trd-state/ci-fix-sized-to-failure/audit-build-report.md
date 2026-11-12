VERDICT: proceed with these caveats: the fix-findings contract test does not yet assert the sweep-first rule, the clean-tree rule or the diff-only judge (sent to the fix run); the direct path has not been proven on a live ship (needs github-live-test)

# Audit report: ci-fix-sized-to-failure

- Date: 2026-11-11
- Audited commit: 4d5f902a84dcf6971827d0ce0fae5b2c033beaef
- TRD: docs/TRD/ci-fix-sized-to-failure.md
- PRD: none
- Findings: 2 · applied: 1 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/ci-fix-sized-to-failure.md    PRD: none

VERDICT: proceed with these caveats: the fix-findings contract test does not yet assert the sweep-first rule, the clean-tree rule or the diff-only judge (sent to the fix run); the direct path has not been proven on a live ship (needs github-live-test)

  UNTESTED-IN-PRACTICE
    - The routing contract task (FIX-002): its text is right, but packages/core/contracts/ship-primitives.test.js does not assert three things the task's acceptance criteria name: sweep work goes to step 4 before any routing (line 417 matches /sweep/, which the old text also matched), the direct path's clean-tree rule (`git status --porcelain`) and its diff-only `code-reviewer` judge, and `## Result` naming a direct fix. Covered by FIX-002/FIX-004; chained to /implement-trd --reconcile, which built it as AMEND-001 (commit bf531bd; review edits 74e4330). The contract test now passes 143 of 143.
  REJECTED THESE FINDINGS
    - none. (An earlier, premature workflow notification in this session named tasks CIF-001..004 and a `ci.yml:41` citation that do not exist in this TRD; it was discarded and is not this audit's result.)
  FIXED THE CITATION
    - The TRD's Could Not Verify section was rewritten for the delivered code: the claims now proven (routing library, contract text, `files` field, mirrors) were removed; it now names the missing PRD (product validation unchecked), model behaviour on the direct path, and the deferred live ship.
  NO ACTION — the row classifier (FIX-001), collect-findings recording `files` (FIX-003) and the routing tests (FIX-004) are implemented and each acceptance criterion has a test asserting its outcome: packages/core/lib/ci-fix-route.test.js (direct/reconcile per row shape, reasons, `ts`/`summary` in CLI output, check-diff refusing product paths and permissions/secrets/uses/on/trigger lines, accepting a test-only diff); ship-primitives.test.js:428-458; mirrors byte-identical, checked by test/integration/tests/runtime-integrity.test.sh:217. All 4 objectives (O1-O4) are served. `npx jest` on both suites: 180 of 180 pass.
  STILL UNVERIFIED (in the TRD's Could Not Verify)
    - No PRD: the TRD's source is roadmap item 4, so the code was checked against the TRD only.
    - Whether a model following the contract stays inside test/CI files and whether the diff-only judge catches every weakened assertion: judgment, bounded deterministically by check-diff.
    - The direct path end to end on a live ship: needs a run on github-live-test, deferred by the plan.
