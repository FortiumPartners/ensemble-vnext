VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this change has no PRD; it comes from item 1 of the ship-cost-reduction roadmap); the live /audit-build then /ship-build run on github-live-test has not happened yet (the plan deferred it until after this build); the wait for the background review before the close and the STUCK-vs-success reading of the fix run's RETURN line are model-followed prose, and only contract tests check them

# Audit report: custody-anchor-after-audit-fixes

- Date: 2026-11-11
- Audited commit: 1d5b3791ceda1d941cf7425f3186ed8c1c43dc03
- TRD: docs/TRD/custody-anchor-after-audit-fixes.md
- PRD: none
- Findings: 3 · applied: 3 · rejected: 1 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/custody-anchor-after-audit-fixes.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this change has no PRD; it comes from item 1 of the ship-cost-reduction roadmap); the live /audit-build then /ship-build run on github-live-test has not happened yet (the plan deferred it until after this build); the wait for the background review before the close and the STUCK-vs-success reading of the fix run's RETURN line are model-followed prose, and only contract tests check them

Coverage: all 5 verifiers reported. 7 requirements and 2 tasks were indexed. No PRD was supplied, so the delivered code was checked against the TRD only. Validation against product requirements is UNCHECKED.

FIXED THE CITATION
- The old name of the custody reader (FIX-001). The TRD's grounding and its "Today" prose name `auditedCommitOf(closedPath)` at custody.js ~244. That name was correct when the TRD was written (`git show 39cc32d:packages/core/lib/custody.js:244`). The build did what the TRD asked and generalised it into `auditCommitOf(audit, field)`, now at packages/core/lib/custody.js:248. Both mentions (TRD lines 20 and 111) now give the as-built name and line as well.
- The line number of the mirror test (FIX-002). The grounding put the "vendored audit-build.md is identical" test at ~878. It was there before the change, and new tests have since moved it to ~909. The TRD's line 120 now names the test and gives both line numbers.

REJECTED THESE FINDINGS
- FIX-002's claim that no identity test covers audit-build.md. It is refuted by packages/core/commands/verify-command-surface.test.js:909-910 ("the mirrors are byte-identical"), which compares .claude/commands/audit-build.md with packages/core/commands/audit-build.md. The verifier searched for a different test title. Only the line number was stale, and that is fixed above.

NO ACTION
- Both tasks are implemented and tested: the custody rule (FIX-001) and the anchorCommit record in /audit-build's close (FIX-002). The new tests are custody.test.js:129-161 for the post-fix anchor, the null fallback and the refused bad id, plus the contract tests in verify-command-surface.test.js. The library mirror is identical (diff -q clean), and so is the command mirror.

The Could Not Verify section in docs/TRD/custody-anchor-after-audit-fixes.md now records the missing PRD, keeps the deferred live run, and keeps the two model-followed prose behaviours with the reason they could not be checked.