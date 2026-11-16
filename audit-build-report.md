VERDICT: proceed with these caveats: the owner has not yet chosen between two rules for re-checking a criterion that has no covers record. The code follows the investigation's same-directory rule. TRD decision D10, the NRS-B005 acceptance text and four docs give the wider "any code-class file" rule. The owner has also not confirmed three departures from the source: custody re-proves everything when an unnamed shipped file was modified or deleted (D3/NG7); a `DC-<board>--<state>` row is given its board's covers (D8); and O9 coverage of `verify-functional.js` cannot be measured. Separately, no test pins the O7 wording.

# Audit report: narrow-reproof-scope

- Date: 2026-11-16
- Audited commit: 774006d54f399959b8f03b3ea23e2861fc0eefe6
- TRD: docs/TRD/narrow-reproof-scope.md
- PRD: docs/plan/narrow-reproof-scope.investigation.md
- Findings: 7 · applied: 2 · rejected: 1 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/narrow-reproof-scope.md    PRD: docs/plan/narrow-reproof-scope.investigation.md

VERDICT: proceed with these caveats: the owner has not yet chosen between two rules for re-checking a criterion that has no covers record. The code follows the investigation's same-directory rule. TRD decision D10, the NRS-B005 acceptance text and four docs give the wider "any code-class file" rule. The owner has also not confirmed three departures from the source: custody re-proves everything when an unnamed shipped file was modified or deleted (D3/NG7); a `DC-<board>--<state>` row is given its board's covers (D8); and O9 coverage of `verify-functional.js` cannot be measured. Separately, no test pins the O7 wording.

MISMATCH (chains to /implement-trd --reconcile, but only after the owner rules on the no-covers rule)
- The docs give a wider no-covers rule than the code runs (O5; NRS-D001 and NRS-D002). The built `regressionScope` (packages/core/workflows/verify-functional.js:3360-3361, `reopensNoCovers`) re-checks an uncovered criterion only for a code-class file that sits in a directory with a recorded cover, or when no cover is recorded anywhere. That is the investigation's intended outcome 4, word for word. Four docs still describe the "any code-class file" rule: packages/core/contracts/functional-verification.md:497-498, docs/reference/verification.md:309, packages/core/commands/implement-trd.md:1988-1989, and the D10 amendment notes in docs/TRD/one-full-regression-pass-at-the-end.md (:87, REGR-B004 (3), OQ-4). Whichever rule the owner picks, the code and these docs have to agree.

OWNER QUESTIONS (confirm-wanted, not edited in place: each changes a decision or an acceptance criterion)
- Which no-covers rule? (NRS-D10; O5, OQ-2, NG8.) The code follows the source. TRD D10, §1.1 item 3, NG8, TR4 and the NRS-B005 acceptance text ("re-checked when Debug changed any code-class file such as `src/a/new.ts`") give the wider rule. Changelog 1.0.2 records this as an OWNER-CALL. The risk of the built rule: an uncovered criterion whose files sit in a directory no cover names is never re-checked. If the owner keeps the source rule, `/refine-trd` updates D10 and its acceptance text, then reconcile fixes the docs. If the owner wants D10, reconcile reverts `reopensNoCovers`.
- Custody re-proves every must-pass criterion when an unnamed shipped path was modified or deleted (O2, must-pass; D3/NG7). packages/core/lib/custody.js `affectedIds` narrows only added paths. This errs toward re-proving more than O2 asks.
- `DC-<board>--<state>` rows get their board's covers (O4, must-pass; D8). packages/core/lib/design-covers.js `boardIdsFor` also tries the stem with the `--<state>` suffix removed. The source says any other stem gets no covers. This one errs the less safe way: giving a row covers lets custody reuse its proof instead of re-proving. NG8 has an entry; D8 has none under Non-Goals.

TRACEABILITY GAPS
- No test pins the O7 wording ("full manual CI run" in trd-authoring.md:165-166, and `gh run rerun ... --job` in verify-build.md:335-337 and implement-trd.md:2011-2013). The text is there and the mirrors are byte copies. NRS-D001 covers it, so this chains to /implement-trd --reconcile. It is low priority, because this project checks prose by hand.
- No task measures O9 coverage. This audit measured it: 79.6% of lines across custody, design-covers, live-evidence and functional-verification, 70-99% per file, above the 60% floor. `verify-functional.js` cannot be measured, because the test harness loads it as text. That is recorded under Could Not Verify. With no covering task, this is reported here and not closed.

FIXED THE CITATION
- The TRD header said Version 1.0.1, but the changelog had already reached 1.0.2. The header is now 1.0.3, with a 1.0.3 changelog row for this audit.

REJECTED THESE FINDINGS
- Part of O9 only: the claim that "the coverage numbers are never asserted". This audit ran Jest coverage over the four changed libraries and the seam test (834 tests passed). The figures above refute the claim for everything except verify-functional.js.

NO ACTION
- O1, O3, O6 and O8 are implemented, tested and sourced.

Could Not Verify in docs/TRD/narrow-reproof-scope.md has been rewritten: 4 rows. Two `gh rerun` and job-id rows need a real run. One row covers `baseline` against a real base-branch run. One covers coverage of verify-functional.js.
