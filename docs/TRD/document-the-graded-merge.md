# TRD: document-the-graded-merge

**Source PRD**: None — the feature description for feature 60 (document the graded merge and tell Storybook, F-6), given by the product PM; built in commit aa802d8b
**Kind**: docs change
**Weight**: trivial

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | The graded-merge entry is under `[Unreleased]` in `CHANGELOG.md` and in `docs/guides/ship-build.md` | feature description, acceptance (1) | yes |
| O2 | The entry names issue #97 (its graded-merge part) and issue #136 | feature description, acceptance (2) | yes |
| O3 | It carries one plain sentence telling Storybook's PM that it may turn on Forge's `ship_queue` `merge` scope, and that the setting is Storybook's PM's to make; no setting is changed | feature description, acceptance (3) | yes |
| O4 | The live-proof result is stated only as its report shows, with its caveats | feature description, acceptance (4) | yes |
| O5 | The doc-consistency tests pass | feature description, acceptance (5) | yes |

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

## Task Grounding

### DOC-001
- **Touches:** `CHANGELOG.md`, `docs/guides/ship-build.md`
