VERDICT: proceed with these caveats: no source supplied, so whether the TRD matches what the roadmap asked for is unchecked; one sequencer branch has no test (a conflicted wait-ci inside the merge step's own retry loop returns to that merge step); the wait-ci re-poll on "mergeability not computed yet" is covered only as contract prose; issue #136 and live GitHub behaviour are unverified (Could Not Verify)

# Audit report: check-mergeability-before-wait-ci

- Date: 2026-11-21
- Audited commit: 00d3e6ec2455b343efbaa73677d2a470e9b8cb11
- TRD: docs/TRD/check-mergeability-before-wait-ci.md
- PRD: none
- Findings: 8 · applied: 5 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/check-mergeability-before-wait-ci.md    PRD: none

VERDICT: proceed with these caveats: no source supplied, so whether the TRD matches what the roadmap asked for is unchecked; one sequencer branch has no test (a conflicted wait-ci inside the merge step's own retry loop returns to that merge step); the wait-ci re-poll on "mergeability not computed yet" is covered only as contract prose; issue #136 and live GitHub behaviour are unverified (Could Not Verify)

Coverage: all 5 of 5 verifiers reported. 2 objectives, 1 acceptance criterion and 1 task (FIX-001) were indexed. No PRD was supplied, so only code against TRD was checked.

UNTESTED-IN-PRACTICE — a test exists but does not prove the requirement
- Loop-owner redirect (FIX-001, objective O1): packages/core/lib/ship-sequencer.js record() (~line 954) returns the cursor to the owning step with pass+1 when wait-ci records `conflicted` inside that step's recovery loop. No test reaches it: the fixture's redirect target (lima) is never the loop owner (kilo). Work for /implement-trd --reconcile (FIX-001 covers it).
- wait-ci re-poll on UNKNOWN (objective O2): merge-up.test.js:108 proves `pre-ci` answers poll; the poll-then-proceed handling (8 tries, 15s apart) exists only as contract prose and ship-primitives.test.js:413-419 does not assert it. Low severity. Work for /implement-trd --reconcile.

NO ACTION — implemented, tested, sourced
- O1 (conflicting PR goes to the merge step, not the CI wait): merge-up.js:83, wait-ci contract `redirect-on: conflicted=merge`, merge-up.test.js:96, ship-primitives.test.js:413-419.
- Every FIX-001 Touches path resolves; .claude/ copies are byte-identical; Node built-ins only, spawnSync with array args.

REJECTED THESE FINDINGS — none.
