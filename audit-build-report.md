VERDICT: proceed with these caveats: no test proves that a `--rebase` run reports a refused settings write (O5); the Jest half of the 60% unit-coverage measurement (`retired-files.test.js`) was never run; no test checks what the git-files and records-cutover steps actually changed (O6); preserve-all replaces differing framework files, unlike the literal wording of the investigation's O11, and needs your confirmation; Could Not Verify still has 7 open rows, including the bash coverage floors, which cannot be measured here.

# Audit report: deterministic-rebase-engine

- Date: 2026-11-20
- Audited commit: 5afa42944324851a19d9ea7f72c9d29243c6dbb8
- TRD: docs/TRD/deterministic-rebase-engine.md
- PRD: docs/plan/deterministic-rebase-engine.investigation.md
- Findings: 8 · applied: 2 · rejected: 2 · still unverified: 7 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/deterministic-rebase-engine.md    PRD: docs/plan/deterministic-rebase-engine.investigation.md

VERDICT: proceed with these caveats: no test proves that a `--rebase` run reports a refused settings write (O5); the Jest half of the 60% unit-coverage measurement (`retired-files.test.js`) was never run; no test checks what the git-files and records-cutover steps actually changed (O6); preserve-all replaces differing framework files, unlike the literal wording of the investigation's O11, and needs your confirmation; Could Not Verify still has 7 open rows, including the bash coverage floors, which cannot be measured here.

Coverage: 5 of 5 verifiers reported. Source: docs/plan/deterministic-rebase-engine.investigation.md. 19 requirements and 8 tasks were checked.

TRACEABILITY GAPS
- The engine's report of a refused settings write (O5) has no test. `write_settings()` sets `settings.refused` (scaffold-project.sh:2676) and the stamp step is skipped (:3082), but `grep refused rebase-engine.test.sh` finds nothing. The guard itself is tested only through its standalone `guard` mode and a check on source order. Covered by RBE-B003, so it chains to /implement-trd --reconcile. The fix may need a decision first: a correct merge cannot trip the guard, and D12 rejected adding a test-only switch to force it.
- The Jest coverage figure in §6.1 was never measured. coverage.md says `retired-files.test.js` under `npx jest --coverage` "was not run". The Python half was measured at 86.9% (345 of 397 lines), above the 60% floor. Covered by RBE-T001, so it chains to /implement-trd --reconcile.

MISMATCH
- Preserve-all (O11). The investigation says preserve-all "replaces nothing". As built, it replaces framework files that differ from the plugin and regenerates the hooks block. This follows rebase-project.md's own flag table. The choice is recorded as an OWNER-CALL (OQ-4, D14). It needs your confirmation, not a code change. If you want the literal reading, change D14 and one BATS case.

UNTESTED-IN-PRACTICE
- The git-files and records-cutover steps (O6). The test asserts only that each step reports `ok`, which is what it reports whenever no warning line appears. Nothing checks `.gitignore`, `.gitattributes` or the records refs afterwards. Risk is low: `_rebase_git_files` and `_rebase_records_cutover` (scaffold-project.sh:3102-3103) call the same functions as the `--git-files` and `--records-cutover` modes, which have their own tests. Covered by RBE-B004, so it chains to /implement-trd --reconcile.

FIXED THE CITATION
- In D3's line references for scaffold-project.sh, the drifted numbers ~1192/~1434/~1452/~1608 now read ~1252/~1509/~1579/~1741. The line numbers in the grounding blocks were left unchanged: they match the merge-base file they record reading.

REJECTED THESE FINDINGS
- "rebase-engine.sh does not resolve" (D1): D1 names it only as a rejected alternative and never claims the file exists.
- "Python embedded in bash exceeds stack.md" (D3): the code does what D3 requires. Embedded `python3 -c` predates this branch: the merge-base scaffold-project.sh already has 3 calls, at 1434, 1452 and 1608. stack.md:94 already lists Python 3.x as a runtime dependency. This is a known scope note, not a mismatch.

NO ACTION
- 14 of 19 requirements are implemented, tested and sourced. "Every v* tag renders cleanly" was removed from Could Not Verify: `--seed` stops on the first tag that fails, and the committed shipped-hashes.json lists all 48 v* tags. Could Not Verify in docs/TRD/deterministic-rebase-engine.md was rewritten and now has 7 open rows.
