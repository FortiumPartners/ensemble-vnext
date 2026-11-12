VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (there is no PRD; this work is item 2 of docs/plans/run-records-off-branch/roadmap.md, so the code was checked against the TRD only); the identity refusal (a records ref belonging to a different feature is ignored) is tested in the shared record-ref.js helpers and in router.py, but not through each JavaScript reader; three Could Not Verify rows remain open (Claude Code Web / --remote fetch, end-to-end resume once records leave the branch, ship-build --resume from a foreign branch).

# Audit report: readers-fall-back-to-the-ref

- Date: 2026-11-12
- Audited commit: eeb917bfd2faba2fd4818714fae5ed350820f238
- TRD: docs/TRD/readers-fall-back-to-the-ref.md
- PRD: none
- Findings: 12 · applied: 12 · rejected: 0 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/readers-fall-back-to-the-ref.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (there is no PRD; this work is item 2 of docs/plans/run-records-off-branch/roadmap.md, so the code was checked against the TRD only); the identity refusal (a records ref belonging to a different feature is ignored) is tested in the shared record-ref.js helpers and in router.py, but not through each JavaScript reader; three Could Not Verify rows remain open (Claude Code Web / --remote fetch, end-to-end resume once records leave the branch, ship-build --resume from a foreign branch).

Coverage: all 5 verifiers reported; 7 objectives and 10 tasks indexed. PRD validation: UNCHECKED, because no PRD exists.

UNTESTED-IN-PRACTICE
- Refusing another feature's records ref (finding FS-15, Intended Change point 4). record-ref.test.js covers sameFeature, restore --match, ensure and readRecord returning "mismatch". router.py has its own test (test_router.py:1131). No test in implement-state, artifacts, custody, ship-sequencer, session-context or precompact feeds a reader a ref from another feature. These readers all go through ensure/readRecord, so the risk is small, but a reader that skipped the helper would not be caught. This is covered by FIX-001 and goes to /implement-trd --reconcile as a test addition.

FIXED THE CITATION (line references only, in docs/TRD/readers-fall-back-to-the-ref.md; no requirement text changed)
- Most of these were correct when the TRD was written (commit f7c8d03) and moved when the code was built. Two were already wrong at that commit: custody.js:309 and amend.md:163.
- Before paragraph: implement-state load :45→:46; custody closed.json read :309→:608; readCustody :240→:241; ship-sequencer start :654→:658; loadState :550→:553; artifacts readText :48→:55; router feature_in_flight :596→:706. The paragraph now says that its line numbers point into the delivered code.
- Decision: ship-sequencer resume-only rule :662→:669-670.
- FIX-001 grounding: ensureLocal :744, identityAt :150, sameFeature :166, currentBranch :136, selectFolder :262. The restore refusal now points at its records-only successor at :920. The removed per-file loop and rmSync lose their line numbers.
- FIX-002: load contract :31-45; amend.md existsSync :163→:171.
- FIX-003: readCustody :241, closed.json read :608.
- FIX-004: detached fallback :559; lazy custody requires :952 and :1007.
- FIX-006: closedFeatureLine :111→:159; sessionLogPath :52-63→:66-72.
- FIX-008: _safe_feature_dir :418, derive_feature :577.
- FIX-009: implement-trd guard :177-210, amend guard :51, verify-build inputs read :104, ship-build gate :83.
- verification.md §5 is now cited as .claude/rules/verification.md §5.

REJECTED THESE FINDINGS
- none. I reopened every cited file, and each finding matched the code.

NO ACTION
- Everything else the verifiers checked has an implementation and a test. All vendored .claude/ twins are byte-identical to their packages/ sources.

Could Not Verify (rewritten): it now opens with the missing PRD. It keeps the weight judgement (a planning call, out of scope here), the --remote fetch gap, end-to-end resume (needs item 3), and ship-build --resume from a foreign branch (a stated limit). Each row now gives the reason it was not checked.