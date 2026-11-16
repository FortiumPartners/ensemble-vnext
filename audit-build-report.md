VERDICT: proceed with these caveats: the coverage gate (O10, unit 60% / integration 50% from constitution.md) was never measured and no task covers it; no test pins that `/audit-build --defer-close` reaches its records-ref write (O8), so that rests on live evidence only; the AMEND-002 rule is proven by prose pins only (a resumed `/verify-build` closes without `--verified`); planned, not built yet: ABFV-T002, deferred because it is a [LIVE] headless model session in a fixtures slot that /implement-trd sets aside unless --include-deferred is passed (O7 is already shown by the verification run's own fixture transcript)

# Audit report: audit-before-functional-verification

- Date: 2026-11-16
- Audited commit: 5cb9bd6950c644a18c1e18bd9530adb4e932f0ef
- TRD: docs/TRD/audit-before-functional-verification.md
- PRD: docs/plan/audit-before-functional-verification.investigation.md
- Findings: 5 · applied: 1 · rejected: 3 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/audit-before-functional-verification.md    PRD: docs/plan/audit-before-functional-verification.investigation.md

VERDICT: proceed with these caveats: the coverage gate (O10, unit 60% / integration 50% from constitution.md) was never measured and no task covers it; no test pins that `/audit-build --defer-close` reaches its records-ref write (O8), so that rests on live evidence only; the AMEND-002 rule is proven by prose pins only (a resumed `/verify-build` closes without `--verified`); planned, not built yet: ABFV-T002, deferred because it is a [LIVE] headless model session in a fixtures slot that /implement-trd sets aside unless --include-deferred is passed (O7 is already shown by the verification run's own fixture transcript)

TRACEABILITY GAPS
- The deferred close reaching origin (O8): built, and shown live (evidence/fs8-records-ref-audit-rounds.jsonl), but no test pins that the `--defer-close` path runs "Write the records, once, last". The only test on that text (verify-command-surface.test.js:2736-2741) checks the trd-hash and the `record` call. Covered by ABFV-B001, so it chains to /implement-trd --reconcile. Half of the finding does not hold: whether audit-rounds.jsonl is folded onto the records ref needs no feature test, because record-ref.js folds every file in the state folder except dispatch.jsonl, implement.lock, .DS_Store and findings/ (packages/core/lib/record-ref.js:284).
- The coverage gate (O10): no task serves it, and implement.json and test-battery.json hold no coverage figure (only `npx jest` pass/fail and the 4 failures that were already failing before this feature). Recorded here, not closed. How to measure coverage for regex-pinned command prose is a design decision this command does not make.

UNTESTED-IN-PRACTICE
- The AMEND-002 fix (a `--resume` or targeted run closes without `--verified`): audit-first-order.test.js:115-123 checks the command text by regex only. That is the only proof available for model-read prose, and `consumeClose` and `pendingClose` in audit-rounds.test.js:305+ test the library behaviour. It hides no defect. The owner confirms whether text pins are enough.

PLANNED, NOT BUILT YET
- ABFV-T002 (the live fixture run that proves O7): deferred by design as [LIVE]. implement.json shows its status as `deferred`.

REJECTED THESE FINDINGS
- ABFV-T002 citation, "evidence/live/ABFV-T002/ and evidence/live-manifest.jsonl do not exist": rejected. These paths are outputs the deferred task must produce, not descriptions of something already on disk. implement.json lists ABFV-T002 as `deferred`, never run. Changing the Touches line would change what the task requires.
- ABFV-T002 citation, "work/slot-1 is absent": rejected for the same reason. The task requires the slot to be destroyed afterwards, and evidence/live/work/ exists, empty.

NO ACTION
- 8 of the 10 requirements are implemented, tested and sourced: O1–O7 and O9. O7 is proven by the verification run, not by its task.

Could Not Verify was rewritten. It now covers: the D20 residual risk; a real PR opened under `auto`; ABFV-T002's own run and its duration; and the two behaviours no live run reached (a re-audit inside Step 7.3, and anchorCommit after a verification Debug commit).
