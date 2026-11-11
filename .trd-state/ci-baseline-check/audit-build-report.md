VERDICT: proceed with these caveats: no PRD exists for this change (its source is roadmap item 3 of docs/plans/ship-churn-fixes/roadmap.md, which the audit did not receive), so whether the TRD carries that brief faithfully was not checked; not proven on live GitHub: the recommended record-commit skip recipe on a PR's first push, and whether a required check actually sits pending under each gap shape; on this machine one older ship-setup test ("cp -RL dereferences both into real files", on main before this feature) fails because cp cannot set permissions in the temp directory, so "the ship-setup suite passes" (the ship-setup task, FIX-003) is CI's to confirm.

# Audit report: ci-baseline-check

- Date: 2026-11-11
- Audited commit: adfcfecd80cec25ee7cbf14b642037f96ad02a49
- TRD: docs/TRD/ci-baseline-check.md
- PRD: none
- Findings: 4 · applied: 1 · rejected: 3 · still unverified: 4 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/ci-baseline-check.md    PRD: none

VERDICT: proceed with these caveats: no PRD exists for this change (its source is roadmap item 3 of docs/plans/ship-churn-fixes/roadmap.md, which the audit did not receive), so whether the TRD carries that brief faithfully was not checked; not proven on live GitHub: the recommended record-commit skip recipe on a PR's first push, and whether a required check actually sits pending under each gap shape; on this machine one older ship-setup test ("cp -RL dereferences both into real files", on main before this feature) fails because cp cannot set permissions in the temp directory, so "the ship-setup suite passes" (the ship-setup task, FIX-003) is CI's to confirm.

Coverage of this audit: 5 of 5 verifiers reported; 18 requirements and 3 tasks indexed. No PRD, so the check against product requirements did not run; only TRD-to-code traceability was checked.

REJECTED THESE FINDINGS
- "Nothing tests that this repo's own CI shows three gaps" (R-IC2): the TRD's grounding for the test task (FIX-002) deliberately keeps the live gap set out of the unit test, because ci.yml will change, and makes it a verification check instead. That check passed (FS-4, .trd-state/ci-baseline-check/evidence/ci-baseline-cli-transcript.txt), and re-running the CLI today gives ok false with all three checks a gap. The unit test also fails if the docs/record-skip check stops being a gap.
- "Nothing tests that an unrecognised if: form is reported unclear, or the commit-message clause" (R-P-DOCSRECORD): packages/core/lib/ci-baseline.test.js, test "a job gated on github.event_name == pull_request is NOT excused", uses an unrecognised form; running it gives both skip checks unclear, naming job "test". The commit-message clause is proven by FS-19 (evidence/FS-19.txt), reproduced today. Weak spot: the jest assertion only says "not pass".
- "Nothing would notice if the vendored lib copy or the packages/full symlink drifted" (R-VENDOR): test/integration/tests/runtime-integrity.test.sh ("every file mirrored into .claude/ matches its packages/ source") compares packages/core/lib with .claude/lib byte for byte, and packages/core/scripts/scaffold-project.test.sh ("ITR-B014: fresh scaffold delivers .claude/lib/*.js matching packages/core/lib") fails if packages/full/lib lacks the module. Remaining hole: the mirror test silently skips a vendored file that is missing altogether.

FIXED THE CITATION
- The TRD's Could Not Verify section was rewritten: removed the fixtures-environment ship-setup run, which the verification loop proved (FS-21 to FS-24); added the missing-PRD gap and the local cp -RL test failure; kept the two live-GitHub items.

NO ACTION — the other 18 indexed requirements are implemented and tested or verified (ci-baseline jest suite green; functional verification 24 of 24 criteria met).

Noticed, not a finding: when one property is a gap for one reason and unclear for another, it is listed under both gaps and unclear (FS-19 fixture: the docs/record-skip check appears in both), so ship-setup's ISSUES can name that property twice.
