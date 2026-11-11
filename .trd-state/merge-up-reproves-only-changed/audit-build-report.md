VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the TRD's source is roadmap item 2, not a PRD, so the code was checked against the TRD only); live GitHub behaviour unproven (whether `BEHIND` appears only under an up-to-date rule, and the "at most one CI run" count on a real PR, which the owner deferred).

# Audit report: merge-up-reproves-only-changed

- Date: 2026-11-11
- Audited commit: 3e5e17b07df34c59e31b3254117c6206591b64db
- TRD: docs/TRD/merge-up-reproves-only-changed.md
- PRD: none
- Findings: 12 · applied: 5 · rejected: 1 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/merge-up-reproves-only-changed.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (the TRD's source is roadmap item 2, not a PRD, so the code was checked against the TRD only); live GitHub behaviour unproven (whether `BEHIND` appears only under an up-to-date rule, and the "at most one CI run" count on a real PR, which the owner deferred).

FIXED THE CITATION
- The TRD's grounding blocks gave line numbers from before the build. The code has since moved, so the file paths were right but the line numbers were stale. Corrected in docs/TRD/merge-up-reproves-only-changed.md:
  - custody.js (FIX-001): `baseCommit` is set at 420 (was 407); the `out()` helper is at 433 (was 415); the `reason === 'format'` check is at 443 (was 425); `noneAffectedRule` is at 458 (was 440); compare()'s early return is at 177 (was 173). The replaced no-covers branch `if (!covers) return true;` now reads, at line 304, `return !criterionIds.has(id) || !proven.has(id) || shipped.length > 0;`. I also fixed lines the verifiers did not flag: affectedIds 275-308, header comment 21-31, the path-comparison line 306.
  - ship-primitive-merge.md (FIX-003): the "One rule for every stop" paragraph is at 82 (was 75). Step 1 runs 23-55.
  - ship-primitives.test.js (FIX-003): the paragraph's order is pinned at 261-263, not 252.
  - ship-build.seam.test.js (FIX-004): `withDefinition()` is at 207 (was 196). `setup`, `playPush` and `playGate` are at 50/102/114. The seam file now has its own copy of `landOnBase`, at 355.
- O2's source pointed at a roadmap "Acceptance" label that does not exist. It now points at item 2's "How it will be checked".

REJECTED THESE FINDINGS
- "The branch edits owner-governed .claude/rules/verification.md, which the Non-Goals rule out." The verifier compared against the local `main` branch, which is stale (dbd3331). Against `origin/main` (05fc835), this branch changes no file under .claude/rules/. The github-live-test rows came from commit a4b53f9, which is already on origin/main (it came in with the custody live-test work, under the owner's 2026-11-08 ruling). Refuted by: `git diff origin/main...HEAD --stat -- .claude/rules/`, which prints nothing.

NO ACTION
- 3 objectives and 4 tasks are implemented and tested. The four suites the TRD names pass (241 tests): custody.test.js, merge-up.test.js, ship-build.seam.test.js and ship-primitives.test.js. The packages/full/lib/merge-up.js symlink is in place.
- One note: the no-covers rule as built is a little stricter than the one line the Decision quotes. A criterion that verification never recorded as met is still re-proved after a base-only merge-up. This is safe and does not break any acceptance criterion. It is left as written.

The Could Not Verify section was rewritten. It records the missing PRD and keeps the four live-GitHub and owner-call items, each with the reason it was out of scope.
