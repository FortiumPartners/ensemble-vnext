VERDICT: proceed with these caveats: decide whether to build a record of the review findings the end-of-run code review leaves unfixed, or drop them as a filing source (OQ-W); decide whether verification.md's "may the loop deploy here" column still blocks a deploy stage outside production (OQ-X); confirm AC-F14.8's added rule that an ambiguous short commit id fails rather than guesses; approve the drafted constitution.md amendment for the WAITING stop (AC-F12.8); 10 claims still unchecked under Could Not Verify.

# Audit report: ship-build

- Date: 2026-11-01
- Audited commit: 19e1d84
- PRD: docs/PRD/ship-build.md
- Source: docs/plan/ship-build.brief.md

AUDIT: docs/PRD/ship-build.md    SOURCE: docs/plan/ship-build.brief.md

VERDICT: proceed with these caveats: decide whether to build a record of the review findings the end-of-run code review leaves unfixed, or drop them as a filing source (OQ-W); decide whether verification.md's "may the loop deploy here" column still blocks a deploy stage outside production (OQ-X); confirm AC-F14.8's added rule that an ambiguous short commit id fails rather than guesses; approve the drafted constitution.md amendment for the WAITING stop (AC-F12.8); 10 claims still unchecked under Could Not Verify.

17 of 20 findings applied to docs/PRD/ship-build.md (now version 1.3.1). The other 3 needed no change. None was wrong. All 3 verifiers reported; every disputed search and path was re-run in this repository before acting.

CORRECTED A STALE CLAIM — the PRD asserted something the code contradicts
- Current-work order (AC-F3.1): no command uses path → branch → current.json. implement-trd.md uses path → branch → a single in-progress feature; verify-build, audit-build and amend use path → current.json. The order stays, marked as new behaviour.
- Azure DevOps tracker (F10): managing-azure-devops/SKILL.md line 4 says the skill is pipelines-only, so no Azure DevOps work-item skill exists. Such a project falls under "no tracker declared" (AC-F10.3).
- How fixes get built (AC-F5.1): implement-trd.md admits only /verify-build and /audit-build as --chained callers (lines 992-1005, 1035). It must be amended to admit /ship-build.
- PR setting (F11, AC-F11.2): implement-trd.md also reads ensemble.openPullRequest to word its next steps (lines 2072-2077), and verify-command-surface.test.js locks that wording (lines 772-777, 1130). Both are now in the change list.
- Left-open review findings (AC-F9.1): nothing records them, so this filing source has nothing to read. A broad search of commands, libs and workflows found no producer, and Step 7.2 of /implement-trd writes none. Source kept; decision is yours as OQ-W.
- R12 measurement, re-run today: 16 of 19 audit-closed features changed files after their audited commit (was 15): 9 only the TRD, 7 tests or code (2 tests only, 5 shipped source).

ADDED BACK — in the source, missing from this PRD
- Deploy permissions (AC-F4.5): the brief says a deploy stage reuses verification.md's permissions as well as its command. The production ruling (OQ-F) now applies to production only, so a deploy to staging (marked "no") stops. Open as OQ-X.
- Decisions table: the rejected option of declaring the tracker in process.md, with a condition for revisiting it.

CONFIRM THESE ARE WANTED — no source names them
- AC-F14.8: the rule that an ambiguous short commit id fails is now labelled as this PRD's reading, not the owner's ruling.
- AC-F12.8 (new): drafts an amendment to constitution.md prohibited patterns 7 (last-line banner) and 8 (no defensive checkpointing), so a human-review wait listed in ship.md, ending with the WAITING banner, is permitted. Takes effect only with the owner's approval.
- OQ-W: build the record of left-open review findings, or drop the source.

FIXED THE CITATION — referenced ID did not resolve
- AC-F14.6: now cites audit-build.md lines 251 and 260, where the report header writes a short commit id and where the change belongs.
- close-feature.md: the pull-request step ends on line 96, not 95.
- pr-at-cycle-end.md: the TRD's decision is now quoted word for word from lines 63 and 123; the PRD had a paraphrase.

CAVEAT — what this run did NOT check
- 10 claims remain under Could Not Verify (session transcripts, CodeRabbit, GitHub, per-project infrastructure, code no verifier was asked to read).
- No verifier failed to report.

NO ACTION — sourced, listed for completeness
- Brief quotes: the brief §10 quotes and the #49 session are already listed under Could Not Verify.
- stack.md approval: already a stated F10 dependency.
- gh missing from stack.md: already a shipped dependency (pull-request.js lines 72-119); no PRD requirement exceeds a constitution floor, so nothing to lower.
