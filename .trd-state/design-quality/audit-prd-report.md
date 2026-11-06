VERDICT: proceed with these caveats: confirm the R1 fallback that renders with the live runtime when publishing is on; confirm per-dimension labels and agreement in calibration (AC-F9.1, AC-F9.2); five Could Not Verify rows are still open, among them whether the pinned dc-runtime.js can be kept current

# Audit report: design-quality

- Date: 2026-11-06
- Audited commit: 48fb454
- PRD: docs/PRD/design-quality.md
- Source: docs/PRD/design-quality.brief.md

AUDIT: docs/PRD/design-quality.md    SOURCE: docs/PRD/design-quality.brief.md

VERDICT: proceed with these caveats: confirm the R1 fallback that renders with the live runtime when publishing is on; confirm per-dimension labels and agreement in calibration (AC-F9.1, AC-F9.2); five Could Not Verify rows are still open, among them whether the pinned dc-runtime.js can be kept current

FIXED THE CITATION — referenced ID did not resolve
- Parent PRD version: the header now says `docs/PRD/design-stage.md` v1.2.2, not v1.1.0. Its own header reads 1.2.2. The rows this PRD supersedes (AC-F1.4, AC-F14.2) are still in that version.
- F9's constitution quote now says "labeled corpus", spelled as in `.claude/rules/constitution.md` line 92.
- The nav quote "unchanged from src/main.jsx" (§1.1, cause 3) now cites the brief. The phrase is a BI-10 comment in the walk's board markup. A search of `.trd-state/task-dorch-t001-live-walk/` finds it nowhere. `06a-create-trd-home-pane.txt` line 94 stays as the source for the 24 px claim only.

CORRECTED A STALE CLAIM — the PRD asserted something the code contradicts
- Blank design.md field (AC-F1.6): the design commands already keep going when a field is blank. They stop only when design.md is missing or identical to the template (`packages/core/lib/design-map.js` setup(); `packages/core/contracts/design-commands.md` §1 step 1). AC-F1.6 now says the new part is naming each blank direction field in ISSUES, and that a design.md identical to the template still ends STUCK.

ALREADY BUILT — name the file; decide whether the requirement survives
- Missing Playwright (AC-F3.4): the ISSUES line naming the missing tool and its install step already exists. Sources: `packages/core/workflows/create-design.js` (`render_missing_tool`), `packages/core/commands/create-design.md` line 140, `packages/core/commands/refine-design.md` line 146, and the render verifier in `packages/core/workflows/audit-design.js`. The requirement stays, but only "the critique is listed as not run" is new. AC-F3.4 now tells the TRD to extend those paths instead of adding a second one.

CONFIRM THESE ARE WANTED — no source names them
- Per-dimension calibration (AC-F9.1, AC-F9.2): the brief says only "calibrated against a labelled set". The owner's answer to the label-source question (OQ-10) gives one overall good/poor label per frame. AC-F9.2 now reports per-dimension agreement only for frames that have per-dimension labels, so it no longer conflicts with AC-F9.4. Whether optional per-dimension labels are wanted at all is still your call.
- R1 contingency: if the pinned runtime cannot be kept current, it renders with the live runtime when publishing is on. Neither the brief nor the invocation asks for that. The publishing-off path still uses the pinned runtime, so the requirement that rendering works with publishing on or off (NFR-3) still holds. Left unchanged.

REJECTED THESE FINDINGS — and the file that refutes each
- Part of the per-dimension finding: it said AC-F9.1's "(overall, or per dimension where the owner gives one)" contradicts the 1.0.0 changelog. It does not. The session transcript (`~/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/7348a86a-641c-4089-9f06-0c4cf6808534.jsonl`) shows the session-fidelity pass removed the mandatory per-dimension label and wrote this exact wording to replace it. The part of the finding about AC-F9.2 was right and is handled above.

CAVEAT — what this run did NOT check: 5 claims left unchecked (see the PRD's ## Could Not Verify). All 3 verifiers reported. Each of the 5 needs a live canvas, a fixture count, a parser read or a spike. Each row now says why it is still open.

NO ACTION — sourced, listed for completeness
- The PRD's other requirements were not flagged by any verifier.

Edits are in /Users/james/dev/fortium/ensemble-vnext/docs/PRD/design-quality.md, now version 1.1.1 with a changelog row for this audit.
