# TRD: document-the-graded-merge

**Source PRD**: None — the feature description for feature 60 (document the graded merge and tell Storybook, F-6), given by the product PM (`docs/plans/ship-graded-merge/workplan-input.json:84`; roadmap item 6, `docs/plans/ship-graded-merge/roadmap.md:79-88`); built in commit aa802d8b
**Kind**: docs change
**Weight**: trivial

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | The graded-merge entry is under `[Unreleased]` in `CHANGELOG.md` and in `docs/guides/ship-build.md` | feature description (`docs/plans/ship-graded-merge/workplan-input.json:84`, the F-6 entry), acceptance (1) | yes |
| O2 | The entry names issue #97 (its graded-merge part) and issue #136 | feature description (`docs/plans/ship-graded-merge/workplan-input.json:84`, the F-6 entry), acceptance (2) | yes |
| O3 | It carries one plain sentence telling Storybook's PM that it may turn on Forge's `ship_queue` `merge` scope, and that the setting is Storybook's PM's to make; no setting is changed | feature description (`docs/plans/ship-graded-merge/workplan-input.json:84`, the F-6 entry), acceptance (3) | yes |
| O4 | The live-proof result is stated only as its report shows, with its caveats | feature description (`docs/plans/ship-graded-merge/workplan-input.json:84`, the F-6 entry), acceptance (4) | yes |
| O5 | The doc-consistency tests pass | feature description (`docs/plans/ship-graded-merge/workplan-input.json:84`, the F-6 entry), acceptance (5); roadmap item 6 names the check as "`npx jest` doc-consistency tests" (`docs/plans/ship-graded-merge/roadmap.md:84`): no suite carries that name; the suites that read these two files are `packages/core/lib/ship-build.seam.test.js`, `packages/core/commands/run-limit-reference-docs.test.js`, `packages/core/commands/record-criteria-prose.test.js`, `packages/core/lib/custody.test.js` and `packages/core/workflows/verify-functional.test.js` | yes |

## Decision

A docs-only change, recorded here so it has a TRD to audit against. It was built in commit
aa802d8b before this TRD was written; the TRD describes that delivered change. The product PM,
acting as the owner's delegate, decided to add this minimal light TRD (OWNER-CALL, option a).

## Non-Goals

- No code change, no setting change in Forge or Storybook.
- No release: the entry stays under `[Unreleased]`.

## Verification Artifacts

None apply — documentation only; no UI, flow or data surface.

## Open Questions

None.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| DOC-001 | Document the graded merge in `CHANGELOG.md` (under `[Unreleased]`) and `docs/guides/ship-build.md` | O1, O2, O3, O4, O5 | None | (1) The graded-merge entry is under `[Unreleased]` in `CHANGELOG.md` and in `docs/guides/ship-build.md`. (2) It names issues #97 (graded-merge part) and #136. (3) It carries one plain sentence telling Storybook's PM that it may turn on Forge's `ship_queue` merge scope and that the setting is Storybook's PM's to make, changing no setting. (4) The live-proof result is stated only as the report shows, with its caveats. (5) The doc-consistency tests pass |
| AMEND-001 | [test-gap] No test asserts the new graded-merge doc text (#97/#136, the ship_queue sentence for Storybook's PM, the live-proof caveats) in CHANGELOG.md or docs/guides/ship-build.md. Grep confirms it is all present and it masks no defect; the roadmap's planned check for this item is grep, not a test — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: grep of packages/ and test/ tests for '#136', 'ship_queue', 'Storybook' finds nothing; the only guide test is packages/core/lib/ship-build.seam.test.js:1031-1060, which checks older content; text at CHANGELOG.md:13-41 and docs/guides/ship-build.md:101-150) | amendment — no objective recorded | None | [test-gap] No test asserts the new graded-merge doc text (#97/#136, the ship_queue sentence for Storybook's PM, the live-proof caveats) in CHANGELOG.md or docs/guides/ship-build.md. Grep confirms it is all present and it masks no defect; the roadmap's planned check for this item is grep, not a test no longer holds |

## Task Grounding

### DOC-001
- **Touches:** `CHANGELOG.md`, `docs/guides/ship-build.md`

### AMEND-001
- **Touches:** `packages/core/lib/graded-merge-docs.test.js`

## Could Not Verify

Rewritten by `/audit-build` on 2026-11-21. Content claims O1–O4 were checked by reading both files
against the code and the live-proof report, and O5 by a full `npx jest` run; they are not repeated here.

- **Fidelity to a PRD.** No PRD exists for this change, so whether the docs say everything the
  product needs, and nothing it does not, was checked only against the F-6 feature description,
  never against product requirements.
- **The owner's check on the wording of the Storybook sentence.** Roadmap item 6 lists it as a
  check waiting on the owner (`docs/plans/ship-graded-merge/roadmap.md:84`); an audit cannot make it.
- **19 of 136 Jest suites could not run in this worktree.** It has no `node_modules` (missing
  `js-yaml`, `glob`, `mock-fs`, `playwright`, `esbuild`) and one suite hit a sandbox `EPERM` under
  `/tmp`. None of them reads `CHANGELOG.md` or `docs/guides/ship-build.md`; every suite that reads
  either file passed. CI on the merge to `main` is the full run.
- **O4's source is not durable.** The live-proof report the CHANGELOG cites,
  `.trd-state/ship-graded-merge/live-proof-report.md`, is not in git and not on any records ref
  (`refs/ensemble/records/task-live-proof-ship-build-test-repo` lists it as an output but does not
  hold it). This audit read it from feature 50's working tree. Once that tree is removed, O4 can be
  re-checked only against the report's published artifact page (that ref's `artifacts.json`).
