VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this is a defect TRD with no PRD, so the audit checked only that the code does what the TRD asks)

# Audit report: objective-rows-all-tables

- Date: 2026-11-04
- Audited commit: 5248df2
- TRD: docs/TRD/objective-rows-all-tables.md
- PRD: none
- Findings: 4 · applied: 2 · rejected: 3 · still unverified: 1 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/objective-rows-all-tables.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this is a defect TRD with no PRD, so the audit checked only that the code does what the TRD asks)

Coverage: all 5 verifiers reported. No PRD was supplied, so the check against product requirements did not run. 6 requirements and 1 task were indexed.

FIXED THE CITATION
- The design-stage TRD path in the reproduction step. `docs/TRD/design-stage.md` is not on this branch. It lives on branch `58-design-prd` (commit 2978849). I added a sentence under Reproduction → Steps saying where it lives and how to fetch it. The acceptance criterion's wording is unchanged.

REJECTED THESE FINDINGS
- "The last clause of the multi-table read fix (FIX-001), that the command returns the six marked ids, cannot be checked." Wrong. The file is on another branch, not missing. I fetched it with `git show 58-design-prd:docs/TRD/design-stage.md` and ran `node .claude/lib/spec-scope.js objectives` against that copy. It returned 105 rows, and exactly the six expected rows were marked must-pass: AC-F2.4, AC-F5.6, AC-F8.9, AC-F9.4, AC-F11.2, AC-F12.1. Refuted by docs/TRD/design-stage.md on branch 58-design-prd.
- "The design-stage TRD is unbuilt (gap-unbuilt)." Wrong. It is a document on branch 58-design-prd, not code this feature owes. The run above resolved it. Refuted by the same file.
- "Objective O1's six must-pass ids do not resolve." Wrong. The ids are in that branch's copy, and the command marks all six must-pass. O1 is also proven directly by the new test 'reads every table in the Objectives span, not only the first' in packages/core/lib/spec-scope.test.js. Refuted by both files.

NO ACTION
- Objectives O1 and O2 and task FIX-001 are built and tested. In packages/core/lib/spec-scope.test.js, the multi-table test, the new test that a non-ID table is ignored and the existing single-table tests all pass: 430 of 430 tests in spec-scope plus functional-verification. `.claude/lib/spec-scope.js` is byte-identical to `packages/core/lib/spec-scope.js`, and `packages/full/lib/spec-scope.js` is a symlink to the core copy.

The Could Not Verify section in docs/TRD/objective-rows-all-tables.md now holds one entry: the check against a product requirement did not run, because this TRD has no PRD.
