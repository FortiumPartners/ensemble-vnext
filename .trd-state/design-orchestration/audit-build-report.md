VERDICT: proceed with these caveats: planned, not built yet: DORCH-T001 (the live end-to-end walk of the multi-feature path) -- the TRD tags it [LIVE], so /implement-trd sets it aside unless run with --include-deferred, because it needs headless command runs in a copy of the react-web fixture; the TRD still says the create-design workflow assigns no decision ids, but the delivered code numbers them (OD-n) on purpose, so the TRD must be amended to match the code; docs/TRD/design-stage.md line 674 still shows the old decision shape that DORCH-D001 was meant to strike through; the /create-trd --boards stop rules and the /sync-design --trd filter are pinned by wording tests only

# Audit report: design-orchestration

- Date: 2026-11-05
- Audited commit: 2ee2e80
- TRD: docs/TRD/design-orchestration.md
- PRD: docs/plan/design-orchestration.investigation.md
- Findings: 9 · applied: 1 · rejected: 0 · still unverified: 5 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/design-orchestration.md    PRD: docs/plan/design-orchestration.investigation.md

VERDICT: proceed with these caveats: planned, not built yet: DORCH-T001 (the live end-to-end walk of the multi-feature path) -- the TRD tags it [LIVE], so /implement-trd sets it aside unless run with --include-deferred, because it needs headless command runs in a copy of the react-web fixture; the TRD still says the create-design workflow assigns no decision ids, but the delivered code numbers them (OD-n) on purpose, so the TRD must be amended to match the code; docs/TRD/design-stage.md line 674 still shows the old decision shape that DORCH-D001 was meant to strike through; the /create-trd --boards stop rules and the /sync-design --trd filter are pinned by wording tests only

MISMATCH -- chains to /implement-trd --reconcile
- How decisions get their ids (DORCH-B002, decisions D7/D8, §3.2). The TRD says the ground stage returns decisions "with no `id` field" and the command numbers them. The delivered code works differently. packages/core/workflows/create-design.js takes a new `odNext` argument and assigns `OD-<odNext+k-1>` in code. packages/core/commands/create-design.md step 2 counts odNext from brief.md and passes it in. packages/core/workflows/create-design.test.js:107-113 tests this. The change was deliberate: commit 152992e made it during the verification debug so that ids never repeat across re-runs, and success criterion FS-17 requires ids. It meets the source objective O6, which asks only that each decision carry an id. The code is right and the TRD text is stale. That text is a task's acceptance criterion and a decision, so I did not edit it here. Reconcile should amend D7, D8, §3.2 line 214, the B002 row and the B002 grounding note (which still shows `'OD-' + (i + 1)`) to describe odNext, and add a changelog entry. Two verifiers raised this (verification and consistency); it is one defect.
- Old decision shape still in an earlier TRD (DORCH-D001). B002's grounding hands "docs/TRD/design-stage.md l.674 `openDecisions: [{ question, options, recommended }]`" to D001. D001's Touches list never included that file, so the line was not struck through. docs/reference/design.md was updated. Reconcile should apply the supersession strike-through (the same convention D001 used in unsynced-boards.md).

UNTESTED-IN-PRACTICE
- DORCH-B006 and the /sync-design --trd filter. create-trd-design-prose.test.js and sync-design-prose.test.js only check that the prompt text contains the right wording. They would pass even if a model ignored that wording. The code-level parts have real outcome tests, with no hidden defect: design-map.js validate, buildableByItems, the `--items` CLI flag, and audit-design's no-board / no-brief-item checks. This is inherent to command prose, and DORCH-T001 is what would cover it. Recorded in Could Not Verify.

PLANNED, NOT BUILT YET
- DORCH-T001: the live walk. It covers /create-design --auto, buildable --items over two disjoint item sets, /refine-design --auto "OD-n: <option>", /audit-design followed by a refine with no feedback, and two /create-trd --boards runs ending in the expected stop. It is still `deferred` in implement.json, and evidence/live/ does not exist. Until it runs, must-pass objectives O1 (--boards) and O6 (decision records), plus O7 and O8, rest on wording tests. Five findings named this (traceability D15, verification, validation O1/O6, test-quality, citation); one deferral. Run it with --include-deferred.

REJECTED THESE FINDINGS
- none; every finding matched the code when I re-opened the files.

NO ACTION
- The other requirements of the 16 indexed are implemented and tested. All 8 design test files pass (241 of 241).

Could Not Verify in docs/TRD/design-orchestration.md has been rewritten. The confirmed O1/O6 row moved here as the T001 finding. One row was added for the wording-only command rules. Kept: the live-only model-behaviour rows, the consuming-project grep, and squash-merge sha preservation.
