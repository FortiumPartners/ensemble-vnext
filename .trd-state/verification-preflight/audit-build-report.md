VERDICT: proceed with these caveats: planned, not built yet: VPRE-T001 (the live /verify-build smoke scenario) -- tagged [LIVE], it runs a real /verify-build against a fixture, so /implement-trd sets it aside unless --include-deferred is passed; the owner has to confirm that the setup check leaving out "holding a declared resource" (decision D9 checks ports only) is wanted; six Could Not Verify claims that can only be checked on a live run are still open (lsof behaving the same on macOS and Linux, listener working directories, the identity check not seeing Debug's uncommitted edits, simulator targets, a stack dying between Setup and Exercise, and implement.json readers outside this repo)

# Audit report: verification-preflight

- Date: 2026-10-25
- Audited commit: 91b4de7
- TRD: docs/TRD/verification-preflight.md
- PRD: docs/plan/verification-preflight.investigation.md
- Findings: 4 · applied: 1 · rejected: 0 · still unverified: 6 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/verification-preflight.md    PRD: docs/plan/verification-preflight.investigation.md

VERDICT: proceed with these caveats: planned, not built yet: VPRE-T001 (the live /verify-build smoke scenario) -- tagged [LIVE], it runs a real /verify-build against a fixture, so /implement-trd sets it aside unless --include-deferred is passed; the owner has to confirm that the setup check leaving out "holding a declared resource" (decision D9 checks ports only) is wanted; six Could Not Verify claims that can only be checked on a live run are still open (lsof behaving the same on macOS and Linux, listener working directories, the identity check not seeing Debug's uncommitted edits, simulator targets, a stack dying between Setup and Exercise, and implement.json readers outside this repo)

Coverage: all 5 verifiers reported. The source was docs/plan/verification-preflight.investigation.md. 6 requirements and 9 tasks were indexed.

MISMATCH
- The setup check's "another checkout holds it" test covers only half of what the investigation asks for (O2). After-2, lines 49-50, says "a process listening on a declared port, or holding a declared resource". The code (packages/core/lib/functional-verification.js:611-638) and decision D9 handle localhost ports only. A resource with no port reads `unknown`, which is a flag and never a failure. D9 records lock files as "not built" with a revisit trigger. But the narrowing is not listed in Non-Goals, and it is not among the six owner rulings in the v1.3.0 changelog. Ruling R1 in the verification plan is headed "derived from the evidence", so it is not an owner answer. D9's rationale also quotes the PRD with an ellipsis that leaves out the resource half. I did not edit that, because it sits inside a decision. This needs your decision before any reconcile: either confirm D9 (then /refine-trd moves the resource half to Non-Goals), or have /implement-trd --reconcile build it.

PLANNED, NOT BUILT YET
- The live smoke scenario (VPRE-T001), test/smoke/scenarios/verification-preflight.sh, is not built, and test/smoke/run-smoke.sh does not register it. Three verifiers reported this (traceability, verification, citation). They all describe the same deferred task, so it counts once. The TRD's reason: it is tagged [LIVE] and is the owner's live proof after the build. Unit and surface tests already prove O1-O3. Only the headless transcript evidence is missing: no AskUserQuestion, a Setup Failure outcome, no app-debugger, and the closing banner.

REJECTED THESE FINDINGS
- None. I re-checked each disputed path myself (ls test/smoke/scenarios/, grep in run-smoke.sh, TRD:327-341, functional-verification.js D9 holder logic).

NO ACTION
- 5 of the 6 requirements (O1, O3, O4, O5, O6) are implemented, tested and sourced. So is O2's port half.

TRD EDIT
- I rewrote the Could Not Verify section of docs/TRD/verification-preflight.md as its state after this audit. The six live-only rows stay, each with why it was out of scope. The needs-owner-declined row now covers only readers outside this repo: in-repo, only this TRD, its investigation and the pre-audit snapshot still contain the old status name, and verify-command-surface.test.js:1972-1973 asserts it never appears in the command surface.
