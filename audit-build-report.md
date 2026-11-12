VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the TRD has no PRD; the PM's instruction of 2026-11-12, issue #113, was not given to the audit); this was a scoped re-audit, so objectives O1–O8 were only re-checked where their files changed after commit 46d03934; the O9 live fixture scenario has passed on one recorded run only; the coverage-floor recommendation may drift lower under `must-pass only` (no objective covers it; reported, not changed)

# Audit report: block-only-on-material-failures

- Date: 2026-11-12
- Audited commit: fd92a9f26271b7dd128877ef779be8c153d47c8c
- TRD: docs/TRD/block-only-on-material-failures.md
- PRD: none
- Findings: 3 · applied: 2 · rejected: 1 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/block-only-on-material-failures.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the TRD has no PRD; the PM's instruction of 2026-11-12, issue #113, was not given to the audit); this was a scoped re-audit, so objectives O1–O8 were only re-checked where their files changed after commit 46d03934; the O9 live fixture scenario has passed on one recorded run only; the coverage-floor recommendation may drift lower under `must-pass only` (no objective covers it; reported, not changed)

Coverage: 5 of 5 verifiers reported. 9 requirements and 12 tasks were indexed. This re-audit checked only whether the previous round's two defects are fixed, plus the files changed since commit 46d03934. Validation against product requirements is UNCHECKED because no PRD was supplied.

  FIXED THE CITATION
  - In Could Not Verify, the location of `recommendCoverageFloor` was given as `~:1196`. That line is inside the JSDoc block. The function is declared at `packages/core/lib/functional-verification.js:1198`, and the TRD now says so.

  REJECTED THESE FINDINGS
  - "The live fixture scenario for O9 (FIX-010) has no recorded run" is wrong. The verifier only looked at the top level of `evidence/` and missed `evidence/live/AMEND-002/`. That folder holds `run.log` (15 of 15 assertions passed, exit 0), `verification-state.json` (outcome `satisfied`; FS-1, the must-pass criterion, is `met`; FS-2 is `not_met`), `verification-report.md`, `discovered.jsonl` (one `[non-blocking]` FS-2 row with `blocksFeature:false`) and the session transcript. `evidence/live-manifest.jsonl` and `implement.json` record that evidence under AMEND-002, the task added to close this gap.

  NO ACTION
  - Both defects from the previous round are closed: the O9 live run (above), and an unreadable `verification.md` now reads as `Blocking: all criteria` instead of crashing `read-blocking-policy` (AMEND-001, commit 59319671, with tests in `functional-verification.test.js`). No verifier re-raised either.

STATE
- Round 2 of at most 3. No defects and no test gaps, so the feature closes; no fix run was needed this round.
- The TRD's Could Not Verify section was rewritten: the two closed gaps came out, four entries were kept, one was added saying objectives O1–O8 were not re-checked this round.
- Notes (nobody has to act): one citation corrected in the TRD (above).

DECISIONS
- The "no recorded live run" finding was rejected on the evidence in `evidence/live/AMEND-002/` (above).

ISSUES
- Noticed outside this re-audit's scope (recorded as non-blocking follow-ups): the O9 live evidence sits under `.trd-state/…/evidence/live/`, which `.gitignore:23` excludes, so it is on disk and on the records ref but not in a branch commit; and `implement.json` records the live-scenario task (FIX-010) and its fix (AMEND-002) as done with no commit id. Bookkeeping only.
