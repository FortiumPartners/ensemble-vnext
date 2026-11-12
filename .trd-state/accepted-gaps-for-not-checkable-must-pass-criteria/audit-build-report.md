VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; planned, not built yet: OHP-T002 (the repeatable fixture scenario proving a host-only must-pass criterion settles `met` with the CI run id cited) -- tagged [LIVE], so /implement-trd sets it aside unless run with --include-deferred; it needs only the fixtures environment and a fake gh, so it can finish in that run; unresolved Could Not Verify rows: real-CI timing of `gh run list --commit=<HEAD>`, unit coverage of verify-functional.js (Jest cannot instrument it), integration coverage of the fixture run

# Audit report: accepted-gaps-for-not-checkable-must-pass-criteria

- Date: 2026-11-12
- Audited commit: 06e4995c49a681f36a13cc4d5c7d2ae718e9606d
- TRD: docs/TRD/accepted-gaps-for-not-checkable-must-pass-criteria.md
- PRD: none
- Findings: 2 · applied: 2 · rejected: 0 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/accepted-gaps-for-not-checkable-must-pass-criteria.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; planned, not built yet: OHP-T002 (the repeatable fixture scenario proving a host-only must-pass criterion settles `met` with the CI run id cited) -- tagged [LIVE], so /implement-trd sets it aside unless run with --include-deferred; it needs only the fixtures environment and a fake gh, so it can finish in that run; unresolved Could Not Verify rows: real-CI timing of `gh run list --commit=<HEAD>`, unit coverage of verify-functional.js (Jest cannot instrument it), integration coverage of the fixture run

Scope: a re-audit, limited to the first round's defects and to what changed since 4ddd05ac. Only the TRD changed, no code. 5 of 5 verifiers reported. 12 objectives and 9 tasks were indexed. No fresh sample was taken, so this does not show that every requirement is implemented and tested. No PRD was supplied, so validation against product requirements is UNCHECKED.

PLANNED, NOT BUILT YET
- O7 (a headless fixture run with a stubbed CI result shows the criterion settled `met` with the run id cited) is covered only by OHP-T002, and that task is deferred by design (implement.json line 120, status `deferred`). `test/smoke/scenarios/verify-off-host-proof.sh` does not exist. The behaviour was shown once by hand: in the it3 fixture session, the session's own `off-host-proofs` call returned stub run 987654321. The same missing scenario leaves the integration half of O11 (the 50% integration coverage target) unmeasured. This goes to `/implement-trd --include-deferred`. It is a note, not new work for --reconcile.

FIXED THE CITATION
- §6.1's coverage paragraph said that lines 932-1026 of functional-verification.js were "`lookupOffHostProofs` and its `runCmd` helper". I measured it with Jest: the range not covered in-process is 932-1026, and it spans four functions: `runCmd`, `uncommittedPaths`, `lookupOffHostProofs` and `offHostProven` (ends line 1031). The sentence now names all four. The range and AMEND-001's acceptance text are unchanged.
- In Could Not Verify, the PATH row said `it3/FS-32-state.json` carries the stub's run on commit 2c70bef, "a different sha from the pre-run lookup's bfe4165", and drew its conclusion from that. The two shas come from two separate fixture runs: 2c70bef is the earlier run at `evidence/FS-32-state.json`, and in it3 the state, HEAD and pre-run lookup all read bfe4165. The conclusion still holds, but on different evidence: `it3/FS-32-session.jsonl` shows the session's own `off-host-proofs` call returning the stub's run id. The row now cites that.
- The Could Not Verify preamble said "8 tasks". It now says 9, counting AMEND-001, and states the re-audit scope.

REJECTED THESE FINDINGS
- none. NO-PRD stands as the verdict's caveat.

NO ACTION
- The first round's other defect: O11 had no coverage evidence. AMEND-001 fixed it. §6.1 now records functional-verification.js 73%, spec-scope.js 86% and custody.js 94%, and the cited top-level `return` at verify-functional.js line 3744 checks out.
