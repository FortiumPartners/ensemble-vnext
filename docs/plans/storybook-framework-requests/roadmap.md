# Roadmap: Storybook framework requests

Plan: storybook-framework-requests | Command: /plan-feature | Version: 1 | Date: 2026-11-16

## Source spec

- Run the code audit before or alongside functional verification, so audit fixes stop discarding verification evidence -- source: conversation: "Run the code audit (/audit-build) before or alongside functional verification, not after it. Today audit fixes land after verification and throw away its evidence." (Storybook PM message b8002d99)
- Count verification runs per feature and stop after 2 full runs with one ruling -- source: conversation: "Cap verification RUNS per feature, not only rounds per run ... after 2 full runs, everything still open goes to one PM or owner ruling (ship, fix one named thing, or drop it), with no third recovery plan."; probe: packages/core/commands/verify-build.md:345 (cap default 3 is per run, nothing counts runs)
- Mark at most 8 core boards; every other board is evidence only -- source: conversation: owner's words "I care that the core UI of the app is pixel perfect... in most UI designs it's 3, 5, MAYBE 8 boards that matter. Not the 50, 60, 80 that we often produce"; probe: no "core" mark in packages/core/commands/create-design.md
- Publish artifacts per kind; default publishes trd, task/spike reports and design canvases only -- source: conversation: "spikes, design rounds, TRDs always publish. Others do not unless requested."; probe: ensemble.publishArtifacts is a single boolean in .claude/settings.json and read by 14 commands (grep publishArtifacts under packages/core)

## Out-of-scope fence

- Tolerances or lower priority for individual criteria -- reason: separate request; source: open issue #126
- Any change to what /audit-build checks, or to which criteria are must-pass outside design boards -- reason: the request moves order and counts, not content; source: message b8002d99
- Deleting or unpublishing artifacts already published -- reason: the framework never deletes an artifact; source: .claude/rules/verification.md section 1a
- Changes to the Storybook repository's local copies of items 1, 3 and 4 -- reason: another product's files; source: message b8002d99

## Items

### 1. Audit before functional verification

- Brief: Change the delivery order so the code audit (/audit-build) runs before the functional-verification loop, not after it, in /implement-trd's end-of-run sequence, its NEXT text and /verify-build's hand-off, so fixes the audit causes land before verification and verification evidence is produced once, on the final code. A passing audit still opens the PR when ensemble.openPullRequest is auto, but only after verification has also run. Keep /audit-build usable on its own after the fact. Update the command text, the docs that describe the order and the tests that pin it.
- Dependencies: none
- How it will be checked: npx jest and bats for the touched command-surface tests pass; a grep shows no command text still saying verification runs before the audit; a headless fixture session shows /implement-trd running the audit step first.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 2. Cap verification runs per feature

- Brief: Count full verification runs per feature in implement.json (functional_verification.runs), carried across /verify-build, /refine-verification and resumes, so a new recovery cycle does not start a fresh budget. After 2 full runs, /verify-build and /refine-verification stop recovering: they write one ruling request listing everything still open, with three outcomes (ship as is, fix one named thing, drop it), and the command ends with that request rather than a third recovery plan. The limit of 2 is a setting with that default. Update the command text, report and tests.
- Dependencies: Audit before functional verification (related)
- How it will be checked: jest tests prove the run counter survives a resume and the third run is refused with a ruling request; a headless fixture run shows /refine-verification declining a third plan.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

### 3. Core boards in designs

- Brief: In /create-design (and its refine, audit and verify siblings), mark at most 8 boards as Core: the main screens in their normal state, with a visible Core mark on the canvas and a flag in design-map.json. Core boards stay must-pass, pixel-perfect design comparisons. Every other board (errors, loading, empty, edge cases, extra viewports) becomes evidence only: its screenshot is produced for review and never fails verification; its behaviour is proven by forced-state component tests. A design with more than 8 candidates picks 8 and says which were left out. Designs made before this change count every board as Core until refined.
- Dependencies: none
- How it will be checked: jest tests on design-map.json handling and the verify-design-comparison criteria generation; a fixture design with 12 boards yields 8 must-pass and 4 evidence-only criteria.
- Route: plan
- Route rigor: standard
- Deferred checks: a live canvas run showing the visible Core mark waits on a design round using the canvas service.
- Dates: none

### 4. Publish artifacts per kind

- Brief: Replace the single publishArtifacts switch with a per-kind setting. Default: publish trd, task and spike reports, and design canvases; for verification-report, audit-build, audit-prd, audit-trd and check-skill pages only record the path, unless the run is asked to publish. ensemble.publishArtifacts false still turns every publish off, and a rebase never reverses an owner's false; an existing true maps to the new per-kind default. Update every command that reads the setting, the settings template, scaffold-project.sh, the artifacts library and docs, with tests.
- Dependencies: none
- How it will be checked: jest tests on the settings resolution (false stays off, true maps to the default, per-kind overrides); a bats test that scaffold-project.sh refresh preserves an owner's false; a grep shows no command reading the old boolean directly.
- Route: plan
- Route rigor: standard
- Deferred checks: none
- Dates: none

## Open questions

- Should "alongside" in item 1 mean in parallel? -- assumption: no, audit runs first, then verification, because parallel runs would still discard evidence on audit fixes; asked of: none, settled by the request's reason (OWNER-CALL)
- Who rules after 2 runs in item 2? -- assumption: the product PM, who can escalate to the owner; the framework only writes the request; asked of: none (OWNER-CALL)
- Default limit of 2 runs and the 8-board cap -- assumption: taken as the Storybook PM proposed and the owner quoted them; asked of: none (OWNER-CALL)
