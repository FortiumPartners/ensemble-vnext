VERDICT: proceed with these caveats: planned, not built yet: VRL-T001 -- the live check is a [LIVE] task that needs headless model sessions in a fixtures slot, so /implement-trd set it aside to run as a separate live pass after the build; owner question: `--reset-state` clears the run count, which goes against O1's "no command starts a fresh count" (the TRD assumed this in OQ-5, and nobody has confirmed it); O9's coverage floor (60% unit / 50% integration) was never measured for this feature; no test covers a second record-ruling call.

# Audit report: cap-verification-runs-per-feature

- Date: 2026-11-16
- Audited commit: 177d2898cc576f1ad20876888a0566e7c25daad6
- TRD: docs/TRD/cap-verification-runs-per-feature.md
- PRD: docs/plan/cap-verification-runs-per-feature.investigation.md
- Findings: 12 · applied: 6 · rejected: 4 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/cap-verification-runs-per-feature.md    PRD: docs/plan/cap-verification-runs-per-feature.investigation.md

VERDICT: proceed with these caveats: planned, not built yet: VRL-T001 -- the live check is a [LIVE] task that needs headless model sessions in a fixtures slot, so /implement-trd set it aside to run as a separate live pass after the build; owner question: `--reset-state` clears the run count, which goes against O1's "no command starts a fresh count" (the TRD assumed this in OQ-5, and nobody has confirmed it); O9's coverage floor (60% unit / 50% integration) was never measured for this feature; no test covers a second record-ruling call.

All 7 build tasks (VRL-B001 to VRL-D004) are built and their tests pass. Only the live check (VRL-T001) is still open.

TRACEABILITY GAPS
- A second ruling on the same feature (VRL-B001). TRD section 3.1 says a second `record-ruling` replaces the stored ruling and keeps the waived rows already written, one per criterion. The code does this: `verification-runs.js:366-371` replaces the ruling, and `functional-verification.js:1703-1708` skips any criterion that already has a `[non-blocking]` row. No test calls `recordRuling` twice. VRL-B001 covers it, so this chains to /implement-trd --reconcile.

PLANNED, NOT BUILT YET
- VRL-T001: the live check of O2, O3 and O4. That is the refusal at 2 of 2 runs in `/refine-verification --auto` and `/verify-build`, and the 1-of-2 run whose NEXT must name the ruling request. Neither `evidence/live/VRL-T001/` nor `live-manifest.jsonl` exists yet. The fs10 and fs13 transcripts come from an earlier pass, not from this task.

OWNER QUESTION
- `--reset-state` resets the count (O1). It deletes `implement.json`, which holds the runs. TRD OQ-5 and `docs/reference/verification.md:68` call this "the one owner-confirmed exception", but the investigation never mentions `--reset-state`, so nobody has actually confirmed it. No test checks the reset. A typed "confirm" is the only thing stopping someone using it to get past the limit. Keep the exception, or have the reset carry `runs` into the new file: that is your decision.

FIXED THE CITATION (line numbers that moved when the build edited the commands; descriptive text only)
- The default cap of 3 (§1.1, D7): `verify-build.md:371` changed to `:429`.
- D3's whole-object replace: now says the replace existed before the change (investigation `:825-827`), that both assignments are now spreads at `implement-trd.md:833` and `:835`, and that §3.6a's spread is at `:987-988`.
- D9: the "does not apply to a satisfied run" rule is now cited at `refine-verification.md:127`, and the limit-wins rule at `:113-115`.
- D13's "report and readout never disagree": now cited at `verify-build.md:553-554` and `implement-trd.md:2462`.
- TR1: the investigation's `:957-960` (its line numbers from before the build) is kept, and the TRD now also points to `implement-trd.md:821-823`, where the whole-object save is described today.
- Could Not Verify rewritten. It drops the old "eleven-kind count" claim, which the build has since made false (there are twelve kinds). It now lists only what is still unchecked: O9 coverage, the live behaviour (VRL-T001), and the limits under Verification Environment.

REJECTED THESE FINDINGS
- O2 "mismatch, eleven vs twelve kinds". The code does what VRL-B003 asks: `artifacts.test.js:29` reads "lists the twelve document kinds", and `grep eleven packages/core/lib/artifacts*.js` finds nothing. The stale sentence was in Could Not Verify, which is now rewritten.
- D13 "implement-trd.md has no rulingDue". It has many: `implement-trd.md:2235-2240`, `:2446` and `:2562`. Only the line number was wrong, and it is fixed above.
- The missing `live-manifest.jsonl`. It is a file VRL-T001 will write when it runs, not a file the build had to deliver. Its absence is the deferral already listed above.
- The DSGN-T002 path "still does not resolve". The TRD does not cite that file. `docs/TRD/cap-verification-runs-per-feature.md:465` says the file cannot be reached from this checkout and cites `docs/TRD/design-orchestration.md:517-520` in its place, which is the correction the v1.0.2 changelog describes.

NO ACTION
- 7 of the 9 indexed requirements (O2 to O8) are built, tested and traced to a source. O1 is built and tested; its open item is the reset question above. O9 is not measured (see Could Not Verify).