VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; this was a re-audit limited to round 1's defects and the files changed since c8111f7, so FIX-001 to FIX-003 were not re-sampled; the truncation guard (AMEND-001) is proven on test fixtures only and has not yet caught a real truncation live; the forge-vnext evidence behind O1 and O2 (PMI-T003, PMI-P002) was not checked

# Audit report: audit-notes-not-rounds

- Date: 2026-10-23
- Audited commit: 5723bf8
- TRD: docs/TRD/audit-notes-not-rounds.md
- PRD: none
- Findings: 3 · applied: 4 · rejected: 0 · still unverified: 7 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/audit-notes-not-rounds.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; this was a re-audit limited to round 1's defects and the files changed since c8111f7, so FIX-001 to FIX-003 were not re-sampled; the truncation guard (AMEND-001) is proven on test fixtures only and has not yet caught a real truncation live; the forge-vnext evidence behind O1 and O2 (PMI-T003, PMI-P002) was not checked

Coverage: 5 of 5 verifiers reported. No PRD was supplied, so validation against product requirements did not run. 8 requirements and 4 tasks were indexed. The three Jest suites named in the acceptance criteria pass at 5723bf8: 395 tests, was 387. The 8 new tests are AMEND-001's.

FIXED THE CITATION
The AMEND-001 commit (5723bf8) added lines above code the Task Grounding blocks cite by line number. Round 1's citation fixes were correct at c8111f7 but went stale. Each fix below was checked against the file at HEAD; descriptive text only.
- Classifier and counter in audit-rounds.js, FIX-001's grounding: `classify` :69→:72, `tally` :91→:94, the deferred return :75→:78, the gap-unbuilt rule :79→:82, the citation/consistency 'note' rule :80→:83, the covered:false check :97→:100, `cli` :202→:229, the ctx build :208→:235, the decide spread :211→:238.
- Command prompt audit-build.md, FIX-003's grounding: the workflow call :175→:183, the after-workflow section ~252-385→~276-409, the commit block :336-337→:360-361, the heading block ~419-433→~443-457, the two new headings :427-429→:451-453.
- Reconcile prompt in audit-build.js, FIX-002's grounding: no verifier flagged it, but the same commit moved it 5 lines. The opening ~590-596→~595-601, the verdict rule ~637-641→~642-646, the heading block ~656-675→~661-680. Still-correct citations were left as they were: :102, :110, :167-168, trd-parser.js:875-890 and verify-command-surface.test.js:776-828.

REJECTED THESE FINDINGS
- None. Both citation findings checked out against packages/core/lib/audit-rounds.js and packages/core/commands/audit-build.md. The validation item was a statement that no PRD was supplied, not a finding against the code. It is carried as the first caveat.

NO ACTION
- AMEND-001's diff (trd-snapshot and trd-guard, plus the heading-only search for Could Not Verify) was in this re-audit's scope. No verifier raised anything against it, and its tests pass.

Could Not Verify, rewritten in docs/TRD/audit-notes-not-rounds.md:
- The bullet "nothing in the workflow checks the other headings survive" was dropped; AMEND-001 now does that check. In its place: the guard is proven on fixtures only.
- The note on model-made in-place edits now counts two live runs, both of which touched citations only.
- Added a scope line saying FIX-001 to FIX-003 were not re-sampled this round.
- Kept the no-PRD, cross-repo evidence, kind-classification and web-chat-parity bullets.
All 13 headings are intact after the rewrite.
