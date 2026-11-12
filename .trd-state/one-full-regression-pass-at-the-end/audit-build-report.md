VERDICT: proceed with these caveats: the live fixture run has not yet shown the regression pass catching a criterion a fix broke (O9; its one recorded run was INCONCLUSIVE, which the live task REGR-T001 allows); the smoke README still lists a frozen-file INCONCLUSIVE case the reworked scenario removed (REGR-T001/AMEND-003); the two command-pin tests do not assert the covers derive step (REGR-B006 check 2)

# Audit report: one-full-regression-pass-at-the-end

- Date: 2026-11-12
- Audited commit: ea3834e5e9ed0bad0ded6af4c1d8921c1effb6c1
- TRD: docs/TRD/one-full-regression-pass-at-the-end.md
- PRD: docs/plan/one-full-regression-pass-at-the-end.investigation.md
- Findings: 12 · applied: 5 · rejected: 5 · still unverified: 2 · verifiers reporting: 5/5 (audit workflow) + 4/4 (parallel re-check)

AUDIT-BUILD: docs/TRD/one-full-regression-pass-at-the-end.md    PRD: docs/plan/one-full-regression-pass-at-the-end.investigation.md

VERDICT: proceed with these caveats: the live fixture run has not yet shown the regression pass catching a criterion a fix broke (O9; its one recorded run was INCONCLUSIVE, which the live task REGR-T001 allows); the smoke README still lists a frozen-file INCONCLUSIVE case the reworked scenario removed (REGR-T001/AMEND-003); the two command-pin tests do not assert the covers derive step (REGR-B006 check 2)

All five must-pass objectives (O1–O5: what the end-of-run regression pass re-checks, what it leaves alone, catching a broken criterion, its verdicts being the proof custody reads, never a third pass) are implemented and proven by tests that assert the specific outcome. The feature's named test set passes: 8 Jest suites, 1430 tests, plus the smoke-registration BATS suite; every `.claude/` mirror is byte-identical to its `packages/core/` source. Old reports are unaffected: 35 report inputs saved by earlier features render identically under `main`'s renderer and this branch's.

  MISMATCH — built, but does something other than what was required. Chains to /implement-trd --reconcile.
    - Stale README row for the live scenario (REGR-T001, reworked by AMEND-003): `test/smoke/README.md:48` still says a Debug that "edits a frozen file" is INCONCLUSIVE. AMEND-003 removed the frozen files; the scenario's INCONCLUSIVE cases are now "invoice.js or receipt.js changed but format.js did not" and "format.js unchanged" (`test/smoke/scenarios/verify-regression-pass.sh:345`, `:350`). Documentation only, not behaviour.

  TRACEABILITY GAPS — implemented, no test proving it. A covering task exists: chains to /implement-trd --reconcile.
    - The covers derive step in both commands (REGR-B006, acceptance check 2): `implement-trd.md:1936-1947` and `verify-build.md:300-305` name `derive-criteria`, pass `{}` for a sweep file and fall back to `{}` on failure, but neither `verify-command-surface.test.js` nor `verify-build-criteria.test.js` asserts any of the three (they pin only the field order and the 29-field count, `:268` and `:79`).

  CAVEAT — not a defect, not chained
    - The live proof (O9, REGR-T001). The scenario is built and registered. Its one recorded run (`evidence/live/REGR-T001/run.log`, 03:26) ended INCONCLUSIVE: Debug fixed the invoice without touching the shared formatter `src/money/format.js`, so no regression pass ran. That run predates AMEND-003's rework of the scenario, and the reworked version has not run, because the fixture slot could not be scaffolded in this sandbox (`cp: chmod: Operation not permitted`). REGR-T001's acceptance criteria accept a named INCONCLUSIVE with its evidence, and O9 is not must-pass; Jest proves the mechanism. The evidence folder is gitignored (`.gitignore:83`), so it is not on the branch.

  FIXED THE CITATION — TRD §9 Task Grounding, line numbers only (a note, not a defect)
    - REGR-B001: `deriveCriterionCovers` :256 → :259, `main` :349 → :353, and the adjacent record-criteria, `--state-dir` and `ids: met` lines.
    - REGR-B002: the Met row loop :1541-1559 → :1581-1600; the Not Met row loop :1563-1590 → :1603-1631.
    - REGR-B004: `exercisePass` :2520 → :2679 (third parameter now `regressionRound`); `reconcileJudgeKinds` :1691 → :1815; `buildExercisePrompt` → :547; `reportInputFileFor` → :1786; `VerifyFunctionalArgs` :548 → :549 and `liveEvidence?` :604 → :605 in `functional-verification.md`.
    - Could Not Verify rewritten: the row asking whether `derive-criteria` maps most criteria was checked and removed (on this feature's own TRD it maps 12 of 19, so the no-covers group is about a third: more re-checks, never missed ones). Two rows remain open, both needing live runs: does a live Debug report its changed files, and can the fixture reliably produce the break.

  REJECTED THESE FINDINGS
    - A first result reporting tasks "ORP-001..ORP-007" and gaps in `packages/core/lib/implement-trd-prose.test.js`: no such ids exist in the TRD (its tasks are REGR-B001..B006, REGR-D001, REGR-T001, AMEND-001..003) and no such file exists in the tree.
    - O9 as a fix-run item: refuted by REGR-T001's acceptance criteria (`docs/TRD/one-full-regression-pass-at-the-end.md`, REGR-T001 row: "A run where the live model does not produce the setup is a named INCONCLUSIVE, recorded with its evidence"); re-running it is a live-session problem, not a code fix.
    - O9 "passes, the recorded report shows the catch": refuted by `evidence/live/REGR-T001/verification-report.md` (outcome exit-stalled, no Regression pass section) and its `run.log`.
    - O12 "documentation has no test": REGR-D001's acceptance checks (2) and (3) are inspection checks, and the inspection passed (markers present in every amended sibling TRD; no sentence in the contract or `docs/reference/verification.md` describes a confirmation pass as current).
    - "AC 3 does not exist" (REGR-B003 grounding): it means REGR-B003's own acceptance check (3); the grounding now says "this task's acceptance check (3)".

  NO ACTION — implemented, tested, sourced: O1–O8, O10, O11, O13 and the remaining investigation requirements; REGR-B001..B005, REGR-D001, AMEND-001, AMEND-002.
