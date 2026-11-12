VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; whether real success definitions name objective ids that the covers-mapping function (deriveCriterionCovers) can read is unverified until a live run; the share of criteria that get a recorded covers list is measurable only on the next live /implement-trd run

# Audit report: re-prove-only-what-a-change-can-affect

- Date: 2026-11-11
- Audited commit: 705ec51b69ecc9c526411d47ad71b1f09681ef79
- TRD: docs/TRD/re-prove-only-what-a-change-can-affect.md
- PRD: none
- Findings: 5 · applied: 3 · rejected: 2 · still unverified: 0 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/re-prove-only-what-a-change-can-affect.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; whether real success definitions name objective ids that the covers-mapping function (deriveCriterionCovers) can read is unverified until a live run; the share of criteria that get a recorded covers list is measurable only on the next live /implement-trd run

Coverage: all 5 verifiers reported. 14 requirements and 4 tasks (FIX-001 to FIX-004) were indexed. No PRD was supplied, so the delivered code was checked against this TRD only. Validation against product requirements was not checked.

FIXED THE CITATION
- The pointer to the no-success-definition branch (FIX-003 grounding) said custody.js:461, which is a closing brace. It now says the branch is in `reconcile`, at packages/core/lib/custody.js:682.
- The pointer to the covers lookup (FIX-003 Replaces line) said lines ~296-306, which now hold `readReproof`. It now names the delivered locations: `affectedIds` at custody.js:452 and `liveEvidence.readCriterionCovers` at custody.js:476.

REJECTED THESE FINDINGS
- "#101 is not in merge-up-reproves-only-changed.md": the TRD uses #101 as a PR number, not as text inside that file. `git log` shows 0a0c3e73 "Merge pull request #101 from …/feature/20-merge-up-re-proves-only-what-changed". The rejection of TRD parsing in custody that it cites is in that file's Decision section (around line 59).
- "docs/OWNER-CALLS.md, OWNER-CALLS.md.bak, docs/TRD/other.md, packages/core/commands/x.md do not exist": these paths are not meant to exist. They are test inputs. packages/core/lib/record-files.test.js:66-67 uses the first two to check that a lookalike path does not count as a record file. packages/core/lib/custody.test.js:85 and :93 use the other two as rows in the path-classification table.

NO ACTION
- All 14 indexed requirements and the 4 tasks were found built and tested. The verifiers found nothing missing, nothing mismatched and no untested requirement.

Could Not Verify, rewritten in docs/TRD/re-prove-only-what-a-change-can-affect.md: added that no PRD was supplied. Kept the two live-run items, each with the reason it is out of scope here.
