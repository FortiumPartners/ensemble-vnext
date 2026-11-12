VERDICT: proceed with these caveats: the resumed-run half of FS-4 (a resume's first iteration exercises the whole open set) is built but no test proves it; the Playwright pre-check row in Could Not Verify stays open because there is no Playwright project here

# Audit report: targeted-inner-loop-by-shared-cause

- Date: 2026-11-12
- Audited commit: 759e95a5f4b9bf170585a0c87c2736072619b451
- TRD: docs/TRD/targeted-inner-loop-by-shared-cause.md
- PRD: docs/plan/targeted-inner-loop-by-shared-cause.investigation.md
- Findings: 5 · applied: 2 · rejected: 3 · still unverified: 1 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/targeted-inner-loop-by-shared-cause.md    PRD: docs/plan/targeted-inner-loop-by-shared-cause.investigation.md

VERDICT: proceed with these caveats: the resumed-run half of FS-4 (a resume's first iteration exercises the whole open set) is built but no test proves it; the Playwright pre-check row in Could Not Verify stays open because there is no Playwright project here

Audit coverage: all 5 verifiers reported. The PRD was docs/plan/targeted-inner-loop-by-shared-cause.investigation.md. 20 requirements and 7 tasks were indexed.

UNTESTED-IN-PRACTICE
- First-iteration targeting after a resume (FS-4, from D18). The code is correct. In packages/core/workflows/verify-functional.js, exerciseSetOf returns the whole live set while `addressedCauses` is null, and nothing sets it before a Debug pass in the same invocation. The only multi-criterion resume test (verify-functional.test.js ~:651-677) checks the iteration number and the Judge prompt but never the ids sent to Exercise. The D18 seeding test (~:4178) uses a single criterion, so it cannot tell a targeted set from the whole set. The fresh-run half is proven (exercisedIdsOf at ~:3980). Next: /implement-trd --reconcile adds an exercisedIdsOf assertion on a resume with several open criteria and prior cause state. The task is CAUSE-B002.

FIXED THE CITATION
- In the TRD, CAUSE-D001 Reuse (~:563) cited "functional-verification.md §3.x", which is not a section number. It now names the actual passages: §3.3, §3.3a, §3.4, §3.5 and §3.6, matching the task's own Touches line and the headings at functional-verification.md :511, :879, :941, :1035 and :1078.

REJECTED THESE FINDINGS
- The O9 fixture path (CAUSE-B005, TRD ~:582). That sentence describes the earlier triage fixture, not this feature's fixture, and that fixture does write src/legacy/total.js with a FROZEN header (test/smoke/scenarios/verify-triage-kinds.sh:134-135). Nothing is wrong.
- `./src/a.js` (TRD ~:527). This is an example of path spelling in a note about normalising paths, not a citation of a file. No source is needed.
- NG7, "the branch edits .claude/rules/verification.md". The verifier compared against a stale local `main`. Commit a4b53f99 (Nov 8, before this TRD existed) belongs to the ship-custody-gates-merge work, its message records the owner's approval, and it is already on origin/main. `git log $(git merge-base origin/main HEAD)..HEAD -- .claude/rules/verification.md` is empty, so this feature does not touch the file.

NO ACTION
- The other 19 indexed requirements were not flagged by any verifier.

Could Not Verify was rewritten in docs/TRD/targeted-inner-loop-by-shared-cause.md. Two rows were checked against the delivered code and removed:
- The `awaiting` reader changes landed in refine-verification.md (~:88-90) and in verify-build.md fix loop steps 2, 5 and 6.
- `endOnSetupFailure` does drop the awaiting marker on a Setup-check failure, as the row predicted. Those members are recorded as not verifiable and walked again on the next round, so no objective is affected.
One row remains: the Playwright pre-check (O7). It needs a project with Playwright installed, and verification.md §4 lists none here.

AFTER THE AUDIT — the fix run and the end-of-run review
- Fixed: the missing resumed-run test (FS-4) is now written as task AMEND-001, in packages/core/workflows/verify-functional.test.js. It asserts the exact criteria ids the first resumed Exercise pass receives. The full Jest suite passes except the same 4 suites that fail only in this environment, as at the last checkpoint.
- The end-of-run code review applied 3 fixes to verify-functional.js. (1) The end-of-run confirmation pass now counts a member as "still failing its regression check" only when it is re-judged a real build defect. A dead capture no longer counts. (2) A confirmation reason that ends below the cap no longer quotes a false iteration cap. (3) Two dead checks were removed. No new tests cover fixes (1) and (2).
- The review reported 3 possible defects it did not fix, because each changes a decision the TRD made (D4 and D15). Recorded as non-blocking discoveries:
  - If the Judge gives a new failure the key of a cause that already closed, the closed record is dropped. That cause's members still waiting for the end-of-run check then belong to no cause.
  - If the Judge gives the same failing representative a different cause key each round, every rename counts as progress. The stall rule never fires, and the run uses its whole iteration budget.
  - If the end-of-run confirmation pass finds a regression, the run ends stuck even with iterations left, because no Debug pass follows it.
