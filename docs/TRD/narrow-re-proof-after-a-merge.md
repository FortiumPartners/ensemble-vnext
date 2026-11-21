# TRD: narrow-re-proof-after-a-merge

**Source PRD**: None — defect decided in the workplan ship-graded-merge (item 4)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | After a base merge, a base-only file no criterion covers (a framework config file, an unnamed file) re-proves nothing | roadmap item 4, 2026-11-21 | yes |
| O2 | A file the feature touched still re-proves the criteria covering it | roadmap item 4, 2026-11-21 | yes |

## Reproduction
### Steps
Fixture in `packages/core/lib/custody.test.js`: the feature edits line 1 of `next.config.ts` before the anchor, the base edits line 9, `git merge` merges cleanly, then `custody.js reconcile --base origin/main`.
### Actual
`differing: ['next.config.ts']`, `scope: full`, `reverify` (every must-pass criterion). Root cause [ran]: `compare` excuses a path only when the head blob equals the base blob and the feature never touched it; a clean auto-merge fails both, so `affectedIds` sees an unnamed modified path. Matches Storybook's epub row (`prisma/schema.prisma was modified or deleted and no recorded cover names it`).
### Expected
The path is excused; only criteria whose covers name it are re-proved.

## Decision
`compare` also excuses a path when the head's copy equals `git merge-file -p <anchor> <merge-base> <base>` (exit 0): nothing on the feature's side moved since the anchor. NOT loosening `affectedIds`: a feature edit after the anchor or a hand-resolved conflict must still widen.
not absorbed: develop's `next.config.ts` pulling in 4 video-ending criteria — session log unreadable, recorded as a skipped test

size: 3 files touched (packages/core/lib/custody.js with its .claude/lib copy, packages/core/lib/custody.test.js, CHANGELOG.md)

## Non-Goals
No change to `affectedIds`, the tiers, or the never-met / unnamed-objective rules.

## Verification Artifacts

None apply — a library change checked by Jest.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Which kind of base-only file pulled the 4 video-ending criteria in (Storybook row 2026-11-19T21:08)? | the cause is one of: a cover naming it, a both-sides edit (fixed), a never-met criterion | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Excuse a cleanly merged both-sides file in `compare` (`mergedCleanly`); mirror to `.claude/lib/custody.js` | O1, O2 | None | an uncovered both-sides clean merge gives an empty re-proof set; a covered one gives reverify for its criterion; a post-anchor feature edit gives scope full |
| FIX-002 | Fixture tests for a base-only config file, an unnamed base-only file, the both-sides cases and the skipped Storybook row | O1, O2 | FIX-001 | `npx jest packages/core/lib/custody.test.js packages/core/lib/narrow-reproof.seam.test.js` pass |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/custody.js`, `.claude/lib/custody.js`
- **Reuse:** `diffNames`, `run`, the base-excuse loop in `compare` [read]
- **Replaces:** the single-condition excuse test in `compare` [ran]
- **Follow:** spawnSync with array arguments, no shell [read]
- **Careful:** binary or missing blobs must read as not excused [read]

### FIX-002
- **Touches:** `packages/core/lib/custody.test.js`
- **Reuse:** `setup`, `landOnBase`, `mergeBase`, `withDefinition` [read]
- **Replaces:** nothing [read]
- **Follow:** the existing 'reconcile: base, head and set-only' describe [read]
- **Careful:** fixtures never touch live state [read]

## Could Not Verify
Storybook row 2026-11-19T21:08 (feature 20) could not be reproduced: its session log is not readable from this account.
