VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this change has no PRD; its source is roadmap item 4 and the PM's instructions, so the code was checked against the TRD only); pushing the records ref to GitHub and Forge's reader consuming the post-merge shipped.json were not exercised (tests use a local bare origin, and the reader lives in forge-vnext); the folder writer (record-ref.js write) would overwrite the ref's post-merge shipped.json if run on a merged worktree, a hazard left to roadmap item 3 ("Writers move to the ref")

# Audit report: fold-the-detached-ship-record-into-the-ref

- Date: 2026-11-12
- Audited commit: cc8c738e7848d5d26f0a24dcc31c2c293860326a
- TRD: docs/TRD/fold-the-detached-ship-record-into-the-ref.md
- PRD: none
- Findings: 1 · applied: 1 · rejected: 0 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fold-the-detached-ship-record-into-the-ref.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked (this change has no PRD; its source is roadmap item 4 and the PM's instructions, so the code was checked against the TRD only); pushing the records ref to GitHub and Forge's reader consuming the post-merge shipped.json were not exercised (tests use a local bare origin, and the reader lives in forge-vnext); the folder writer (record-ref.js write) would overwrite the ref's post-merge shipped.json if run on a merged worktree, a hazard left to roadmap item 3 ("Writers move to the ref")

Coverage: all 5 verifiers reported; 12 requirements and 6 tasks indexed; no PRD supplied, so the check against product requirements was skipped.

NO ACTION — implemented, tested, sourced
- All 6 objectives (O1-O6) and all 6 tasks (FIX-001 to FIX-006) are built and tested. Re-checked here: record-ref.js exports writeFiles; ship-record-dir.js holds refRun, writeRunRecord, readCustody and writeCustody; the seam test checks that nothing is written under <common>/ensemble/ship/ and that a plain start with closed.json only on the ref anchors custody at the audited commit. The record-ref, ship-sequencer, custody and ship-build seam suites pass (371 of 371 tests). All 4 changed libraries and ship-build.md are byte-identical to their .claude/ copies.

The no-PRD finding (NO-PRD) is accepted as a caveat. It is carried in the verdict and is not a gap.

The Could Not Verify section of docs/TRD/fold-the-detached-ship-record-into-the-ref.md has been rewritten. It keeps the GitHub push / Forge reader item and the record-ref.js write hazard, each with why it was out of scope, and adds the missing PRD. No citations needed fixing and no findings were rejected.
