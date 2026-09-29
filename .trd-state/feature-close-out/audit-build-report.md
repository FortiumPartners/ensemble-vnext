VERDICT: proceed with these caveats: publishing the audit report as a link (O2/D2) has never run: the stored `audit-build-report` URL, its reuse on the next run and the `publishArtifacts: false` branch are all unproven; the no-TRD stop (D14) has never run; the verification report counts both as proven, but the evidence it cites is a copy of the command's own text; `/close-feature` giving the same verdict on repeated runs is unmeasured, because the smoke scenario was recorded running once

# Audit report: feature-close-out

- Date: 2026-09-28
- Audited commit: 8fe751a
- TRD: docs/TRD/feature-close-out.md
- PRD: docs/plan/feature-close-out.investigation.md
- Findings: 10 · applied: 7 · rejected: 5 · still unverified: 1 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/feature-close-out.md    PRD: docs/plan/feature-close-out.investigation.md

VERDICT: proceed with these caveats: publishing the audit report as a link (O2/D2) has never run: the stored `audit-build-report` URL, its reuse on the next run and the `publishArtifacts: false` branch are all unproven; the no-TRD stop (D14) has never run; the verification report counts both as proven, but the evidence it cites is a copy of the command's own text; `/close-feature` giving the same verdict on repeated runs is unmeasured, because the smoke scenario was recorded running once

TRACEABILITY GAPS (built, but nothing proves they work)
- Publishing the audit report as an artifact and remembering its link (O2, decision D2). `packages/core/commands/audit-build.md` specifies it correctly. No test covers it, and no run has ever exercised it: `.trd-state/feature-close-out/artifacts.json` still has no `audit-build-report` key. The failure branch did happen once. Both real transcripts (`evidence/FS-1-readout-transcript-iter3.txt:33`, `FS-4-readout-transcript.txt:21`) show one line saying no link was made, and each run still ended COMMAND COMPLETE. The success path, reusing the link on a second run, and the publishing-off setting remain unproven. CLOSE-B002 covers this work, so it chains to /implement-trd --reconcile.
- `/audit-build` with no TRD path and an empty `current.json` ends COMMAND STUCK without calling the workflow (D14). This is written in `audit-build.md` lines 22-30. No test and no recorded run shows it; the phrase "no TRD path given" appears only in copies of the command text. CLOSE-B002 covers this, so it chains to /implement-trd --reconcile.

UNTESTED-IN-PRACTICE (the evidence doesn't prove what it claims)
- `.trd-state/feature-close-out/verification-report.md` says "34 of 34 proven". Four of those criteria cite evidence files that only quote `audit-build.md`, not output from a run: publish and store the link (FS-5), republish to the same link (FS-6), degrade quietly when publishing is off or fails (FS-7), and the no-TRD stop (FS-8). FS-7 is partly proven by the two transcripts above. The honest count is 30 proven, 1 partly proven and 3 unexercised. The fix is to re-run verification with `/verify-build` once the gaps above are built and exercised.
- FS-2 (the five counts) and FS-3 (the date and audited commit) also cite text-quote files. The behaviour itself is proven by a live report, `evidence/FS-1-report-iter3.md`, so no action beyond re-pointing the evidence.

REJECTED THESE FINDINGS
- "No test proves the audit report is ever written to disk" (O1), and "the command, not the workflow, writes it" (D1). Refuted by `.trd-state/feature-close-out/evidence/FS-1-report-iter3.md` and `FS-1-readout-transcript-iter3.txt`. A live `/audit-build` run wrote the report with the VERDICT line first, the date, the audited commit (`git rev-parse --short HEAD`) and all five counts, and ended COMMAND COMPLETE. `audit-build.js` has no file-write calls. This project proves prompt behaviour with live runs, not text assertions against prompts (the 4.7.2 policy).
- Three "wrong citation" findings (D13, D5, O5). The TRD is correct as written: D1 is at `docs/TRD/feature-close-out.md:77`, D5 at :81, D9 at :85 and D13 at :89. The Serves columns in the Master Task List (:411-419) credit D5 and O5 to CLOSE-B001 and CLOSE-B004, and D13 to CLOSE-B003. The mislabelling was in the verifier's own working index, so there is nothing in the TRD to fix.

NO ACTION
- 12 of 15 requirements are built and proven by a test, a smoke assertion or live evidence. That includes the `/close-feature` smoke scenario (all 11 runs, 70 of 70 assertions, five scaffolded projects with no `origin`) and `session-context.test.js` (6 of 6 pass).

STATE
- The TRD's Could Not Verify section is rewritten. Two claims are settled and removed: the no-`origin` fallback to `main` works, and Jest can capture the SessionStart hook's output in-process. One stays open: whether the close verdict is stable across repeated runs.
