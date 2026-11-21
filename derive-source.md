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
