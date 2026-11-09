VERDICT: proceed with these caveats: no source supplied, so fidelity to product requirements and omissions were not checked; the merge-contract test does not actually check that the gate gets the PR's head commit (FIX-003); there is no explicit test that a contract without the detach-on key behaves as before (FIX-002 acceptance 4); a Vercel preview and a protected branch were never exercised (neither is listed in verification.md)

# Audit report: ship-custody-gates-merge

- Date: 2026-11-08
- Audited commit: f263b73dfd94270be73de16e20a940319f11b402
- TRD: docs/TRD/ship-custody-gates-merge.md
- PRD: none
- Findings: 4 · applied: 2 · rejected: 0 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/ship-custody-gates-merge.md    PRD: none

VERDICT: proceed with these caveats: no source supplied, so fidelity to product requirements and omissions were not checked; the merge-contract test does not actually check that the gate gets the PR's head commit (FIX-003); there is no explicit test that a contract without the detach-on key behaves as before (FIX-002 acceptance 4); a Vercel preview and a protected branch were never exercised (neither is listed in verification.md)

Coverage: all 5 verifiers reported. No PRD exists for this defect, so validation against product requirements was not done. The audit checked 8 objectives and 5 tasks for traceability between the TRD and the delivered code only.

TRACEABILITY GAPS
- FIX-002, acceptance (4): the TRD requires a test showing that a contract without the `detach-on` key behaves exactly as before. That behaviour is built, but no test asserts it inside a git repo. Every detach-on test in `packages/core/lib/ship-sequencer.test.js` (lines 529–692) uses a contract that declares the key. The nearest test, "a blocked (non-detach) result keeps the tracked file" (line 604), varies the result, not the key. The `alpha` step in a git repo never has its `recordPath` asserted. Covered by FIX-002, so this goes to /implement-trd --reconcile.

UNTESTED-IN-PRACTICE
- FIX-003, the merge contract passing the PR's head commit to the custody gate: the test "passes --head with the PR headRefOid to the gate" (`packages/core/contracts/ship-primitives.test.js:223`) uses the regex `/--head <PR headRefOid>|--head/`. Its second alternative matches any `--head`, so the test cannot fail on this point. The contract itself is correct (`ship-primitive-merge.md:22` names `headRefOid`). The assertion needs tightening. Goes to /implement-trd --reconcile.

FIXED THE CITATION
- The TRD's Verification Environment section said no live repo is listed in `verification.md` §1. It now names `github-live-test` (§1 line 33; capacity 1 in §1a line 60). It also says that no preview environment or protected branch is listed.
- Rewrote the TRD's Could Not Verify section. The old entry "no live GitHub merge was exercised" was false, because the verification run merged live on islayjames/ship-build-live-test (FS-7 to FS-10). The section now names the missing PRD, the unexercised preview and protected branch, and the two accepted limits on custody after the merge.

NO ACTION
- O1, O2, O5, O6, O7 and O8, and the rest of O3 and O4: implemented, tested and sourced to issues #85–#88 and the brief. The audit raised no finding against them.
STATE
- Round 1 of at most 3. No code defects were found, only two weak tests, so the audit fixed them and closed the feature without a second audit.
- Both weak tests were fixed by the chained fix run (2 of 2 tasks built, commit 6b4e073). The merge-contract test now requires `--head` to be tied to the PR's `headRefOid` (one similar loose assertion in `custody.test.js` was tightened too). A new test proves that a contract without `detach-on` keeps its record in the tracked `shipped.json`.
- Tests: the three test files this feature touches pass. Across `packages/core`, 33 of 3,016 Jest tests fail, and they fail the same way on f263b73 without these edits: `status.test.js` and four design-render suites, none of which this feature touches.
- The feature is closed (`closed.json`, closed by the audit), and `.trd-state/current.json` has been cleared.
- Notes, nobody needs to act: the TRD's Verification Environment line and its Could Not Verify section were corrected to say the live merge was exercised on `github-live-test`.

DECISIONS
- The phase check was counted as passing although the full `packages/core` run has failures, because all 33 also fail on the unmodified commit and none are in a file this feature touches.

ISSUES
- No PRD exists for this defect, so the build was checked against the TRD and issues #85–#88 only. A Vercel preview and a protected branch were never exercised, because `verification.md` lists neither. These are accepted limits, and nobody needs to act on them for this feature.
- The 33 failures that already exist (`status.test.js`, style-packs, design-bundle, design-render, design-render-walk) are outside this feature. They are worth a separate `/plan` or `/sweep` (your call).
