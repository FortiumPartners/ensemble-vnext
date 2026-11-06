VERDICT: proceed with these caveats: the owner should confirm that marking the three superseded design-stage items inline is wanted, since docs-as-built NG3 rejects in-content "superseded" signposts (SUP-1, DQ-D001); 5 claims in the TRD's Could Not Verify need a render or a live run that this audit did not do

# Audit report: design-quality

- Date: 2026-11-06
- Audited commit: 48fb454
- TRD: docs/TRD/design-quality.md
- Source: docs/PRD/design-quality.md

AUDIT: docs/TRD/design-quality.md    SOURCE: docs/PRD/design-quality.md

VERDICT: proceed with these caveats: the owner should confirm that marking the three superseded design-stage items inline is wanted, since docs-as-built NG3 rejects in-content "superseded" signposts (SUP-1, DQ-D001); 5 claims in the TRD's Could Not Verify need a render or a live run that this audit did not do

ADDED BACK — in the source, missing from this artifact
- The PRD goal "model-judged scores can be trusted" (G5) is now a row in the Objectives table. DQ-T003 cited it, but nothing in the TRD defined it.
- Adding contract §8 breaks the contract test's seven-entry HEADINGS list. DQ-P003 now owns updating that list and the test title (D10).
- /sync-design's rebuild render was still skipped when no runtime was passed. DQ-P003 now changes sync-design.md's runtime arg to the pinned file and corrects docs/reference/design.md (D1). .claude/verification-notes.md is a record of commands already run, so it is left as written.
- DQ-P002 acceptance: approve tests that pass no runtime stub render, so the test suite does not start real Chromium.

REDESIGNED — could not be built as written
- Where the walk boards are kept (D17, DQ-P001): the evidence folder is git-ignored (.gitignore:78), so a plain git add commits nothing. The task now uses git add -f, and its acceptance checks git ls-files. A .gitignore negation was rejected because it would also un-ignore the scratch files.
- Code measurement (D3, §3.2): it now reads both tokens.json shapes, the list shape design-system.md documents and the grouped shape actually written. Hex and rgb tokens are compared after normalising; any other colour syntax is reported "not measured". Only borders wider than 0, non-transparent backgrounds, direct text nodes and the first font family in a stack are compared. The console listener is attached before page load. Measures are grouped one per distinct value per frame with a count, which bounds what a visual agent must copy into its return (the D9 relay finding).
- frontend-design (D7, DQ-B003): it keeps being preloaded into the frontend, mobile and reviewer agents. Step 4 of skill-selection-instructions.md and the scaffold comment are corrected. Without this, new projects would install it but stop preloading it.
- As-is boards (D8, DQ-B005): the as-is prompt now says the design direction, style pack and departure latitude change nothing the screenshot shows.

PICK ONE — these contradict
- Inserting the direction step "after step 1" would renumber contract §1, and about ten commands and one test cite its steps by number. I picked: append it as §1 step 7, run only by /create-design, /refine-design and /audit-design. DQ-B007 and DQ-B009 change "six steps" to "seven"; create-trd.md, plan.md and design-system.md stay correct.

CONFIRM THESE ARE WANTED — invented machinery, no objective named
- Supersession marks (SUP-1 / DQ-D001): the PRD lists the three items but asks for no mark. The objective now cites the precedent (design-stage.md ~line 674, verification-artifacts.md D2) and the conflict with docs-as-built NG3. It needs the owner's yes.

FIXED THE CITATION — referenced ID did not resolve
- DQ-D001 and D1 quoted "fixture for tests only", which appears nowhere in design-stage.md. They now quote D14, NG4 and OQ-1's real wording.

REJECTED THESE FINDINGS — and the file that refutes each
- Drop DQ-B001's dependency on DQ-P002: kept. Tasks that share files are serialised anyway (.claude/lib/task-graph.js lines 18-25), and the TRD labels this edge as a shared-file edge, not a data dependency. Dropping it only reorders two independent tasks.
- Drop DQ-P003's dependency on DQ-B001, and DQ-B005's on DQ-P003: kept. Each crosses a phase boundary, and phases run one after another (.claude/rules/process.md, /implement-trd), so dropping them changes no execution.

CAVEAT — what this run did NOT check: 5 claims left unchecked (see the TRD's ## Could Not Verify): offline render of the walk boards; measurement inside the board iframe; whether workflow agents can read PNGs; whether visual agents copy measures verbatim; how often the live runtime drifts. All 5 of 5 verifiers reported. The tokens.json-shape row was resolved and removed.

During the edit, one rewrite cut off the tail of the TRD (DQ-B009 through Open Questions). I restored it word for word from the earlier read, and the TRD parser again finds all 17 tasks, 17 grounding blocks and 12 open questions.

NEXT
1. Settle the one owner question, whether the three superseded design-stage items get an inline mark (the supersession marks, DQ-D001):
```
/refine-trd docs/TRD/design-quality.md
```
2. Commit the PRD, the TRD and their state on feature/design-quality/prd.
3. Build it:
```
/implement-trd docs/TRD/design-quality.md
```
