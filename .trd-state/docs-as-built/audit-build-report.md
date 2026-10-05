VERDICT: proceed with these caveats: the review's model-driven behaviour (fixing a requirement that was built differently, fixing a wrong TRD Status, keeping a part-stale doc's one valid section, and the two-run marker sequence) has never run live, because the headless end-to-end cases skip by default; no executed test checks that a cross-repo claim reaches the change set; the /audit-docs readout puts the push-and-PR shell command in NEXT, which command-status.md and your "no shell in NEXT" rule forbid; 3 Could Not Verify rows still need a live session (Opus model dispatch, headless edit permissions, nested settings key) and 1 needs your judgement (whether docs/TRD/ensemble-vnext.md should be skipped as in-flight)

# Audit report: docs-as-built

- Date: 2026-10-04
- Audited commit: 4026024
- TRD: docs/TRD/docs-as-built.md
- PRD: docs/PRD/docs-as-built.md
- Findings: 5 · applied: 3 · rejected: 2 · still unverified: 9 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/docs-as-built.md    PRD: docs/PRD/docs-as-built.md

VERDICT: proceed with these caveats: the review's model-driven behaviour (fixing a requirement that was built differently, fixing a wrong TRD Status, keeping a part-stale doc's one valid section, and the two-run marker sequence) has never run live, because the headless end-to-end cases skip by default; no executed test checks that a cross-repo claim reaches the change set; the /audit-docs readout puts the push-and-PR shell command in NEXT, which command-status.md and your "no shell in NEXT" rule forbid; 3 Could Not Verify rows still need a live session (Opus model dispatch, headless edit permissions, nested settings key) and 1 needs your judgement (whether docs/TRD/ensemble-vnext.md should be skipped as in-flight)

Coverage: all 5 verifiers reported, PRD supplied, 49 requirements and 9 tasks indexed.

TRACEABILITY GAPS
- Cross-repo claims in the change set (AC-F12.1). The code is built: docs-audit-deliver.js:326 surfaces them and audit-docs.js:267 passes them through. But no Jest test feeds a crossRepo record through, and the only test that checks it is the headless BATS case at audit-docs.test.sh:375, which skips by default. The no-correct/no-cut rule exists only in the prompt (contract "## Other repositories"). Covered by DABS-B003 and DABS-T002, so this goes to /implement-trd --reconcile.
- Model behaviour has no executed test: AC-F4.2 (fix a requirement built differently), AC-F5.2 (fix a wrong TRD Status), AC-F7.1/F7.2 (the one valid section survives and the doc stays), and R9 (an unmerged branch re-covers its window; a fresh clone sees the merged marker). The PRD names a manual run as the check for these, and the verification report leaves FS-18 and FS-20 "not verifiable here". DABS-T002 is marked success, but its headless cases (tests 46–58) have never run. Covered by DABS-T002 [LIVE], so this goes to /implement-trd --reconcile, or to running `SKIP_HEADLESS=false` once.

MISMATCH
- The readout's NEXT gives a shell command (NFR-3). packages/core/commands/audit-docs.md:181-183 says to give the push-and-PR command as a plain line in NEXT. command-status.md:115 says a NEXT step is "never a shell command", and you have stated the same rule. AC-F11.1 is already met because finalize prints the command, so NEXT can describe the step in words. Produced by DABS-B006, so this goes to /implement-trd --reconcile.

FIXED THE CITATION
- none. In the Could Not Verify rewrite I removed two rows that are now settled. First, `git grep -F` does search uncommitted edits: I checked it in a throwaway repo, and docs-audit-apply.js:158 passes no revision. Second, a marker on a commit that is not an ancestor of HEAD, or on an unknown commit, makes the run comprehensive (docs-audit-assemble.test.js:164-182). I also ran the delivered D19 skip rule over this repo: it skips 3 of 33 TRDs, all as in-flight, and I recorded that in the section.

REJECTED THESE FINDINGS
- The seam test lacks an outside-batch assertion (DABS-T001). The TRD's own acceptance for T001 (§4.3) lists only the three scenarios the seam test covers. The outside-batch rejection belongs to DABS-B002 and is proven by packages/core/lib/docs-audit-apply.test.js:89-105, with batch isolation at packages/core/workflows/audit-docs.test.js:222. The claim came from the verifier's index, not from the TRD.
- Indexes leave out untracked docs (AC-F9.1). This is not a narrowing. AC-F9.1 also says "nothing absent from it", and an untracked file is absent from the review branch the index is committed to. TRD OQ-6 already rules that untracked docs are only reported. Refuted by docs/PRD/docs-as-built.md:280-281 and docs/TRD/docs-as-built.md OQ-6.

NO ACTION
- 43 of 49 requirements are implemented, tested and traced to a source.
