# TRD: conflict-classifier-and-stop-rules

**Source PRD**: None — small change decided by the owner's work plan: item 1 of `docs/plans/ship-graded-merge/roadmap.md` ("Conflict classifier and stop rules", feature F-1 of workplan ship-graded-merge), brief carried verbatim into `/plan --implement` on 2026-11-21

**Kind**: change · **Weight**: small

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A library `packages/core/lib/conflict-classifier.js` classifies a set of conflicted paths, each with the two sides' hunks, as exactly one of `record` (settled by the existing record-file path), `mechanical` (the model may resolve it), `behavioural` (stop) or `forbidden` (stop at once) | roadmap item 1 brief | yes |
| O2 | A path under `.claude/rules/`, or any file under `docs/TRD/` other than the TRD of the feature being shipped, classifies `forbidden` however its hunks look, and never as a record file | roadmap item 1 brief; source request "Limits" | yes |
| O3 | Both sides adding entries to a list, schema or barrel file, disjoint hunks in one region, and a test broken only by the base's changes classify `mechanical`; anything the library cannot place as mechanical (overlapping changes, the same key given two values, missing hunks, a deleted file) classifies `behavioural` | roadmap item 1 brief | yes |
| O4 | The stop rules are in the library: `forbidden` and `behavioural` stop (forbidden at once), and a mechanical conflict whose checks still fail after two failed fix attempts following a resolution becomes behavioural and stops | roadmap item 1 brief | yes |
| O5 | The library produces the STUCK text: a one-line Reason that names every file that forced the stop and the clash in each, and a Next line | roadmap item 1 brief | yes |
| O6 | `isRecordFile` in `packages/core/lib/record-files.js` stays the single definition of a record file: the classifier calls it and defines no record path of its own, and `record-files.test.js` still passes | roadmap item 1 brief | yes |
| O7 | A one-JSON-line command line (`classify`, `decide`, `stuck`) exists in the manner of `merge-up.js`, so a contract can call it; the library is mirrored to `packages/full/lib/` (symlink) and `.claude/lib/` (copy) like every other lib | roadmap item 1 brief | |

## Intended Change

**Before** (`[read]` 2026-11-21). `packages/core/lib/record-files.js` `mergeBase` merges the base into the PR head and settles a clash only when every unmerged path is a record file (`classifyClash` -> `recordOnly`); any other clash makes it abort with `clashes outside the record files` and `/ship-build` stops (`ship-primitive-merge.md`). Nothing grades a non-record clash, nothing names forbidden paths, and no stop rule or STUCK text for a conflict exists. `merge-up.js` shows the CLI shape to copy (`main(argv)` prints ONE JSON line and returns 0, even on refusal; exported `decide`, `syncHead`, `main`).

**After** — checkable (`npx jest packages/core/lib/conflict-classifier.test.js packages/core/lib/record-files.test.js`):

1. `classify({ files, featureTrd })` returns `{ ok: true, class, stop, stopNow, files: [{ path, class, reason, clash? }] }`. Set precedence: any forbidden file -> `forbidden` (`stopNow`); else any behavioural -> `behavioural`; else any mechanical -> `mechanical`; else `record`. `stop` is true for forbidden and behavioural. Empty or malformed input returns `ok: false` with a reason.
2. Per-file order: forbidden path, then `isRecordFile`, then the hunk rules. A hunk is `{ base: string[], ours: string[], theirs: string[] }` (lines of one conflict region; ours is the PR head, theirs the base branch). A file may carry `oldPath` (a rename's source, checked too), `mode` (git file mode), `deletedBy`, `binary`, and `testBrokenByBase` (the caller's measurement that the test passes on the PR head and fails only against the base's changes; a test that fails with no conflict text of its own is passed as an entry with that flag and no hunks).
3. Forbidden paths are matched after normalising (`./`, `..`, doubled slashes, backslashes), with the two prefixes matched case-insensitively: `.claude/rules` itself and everything below it; everything below `docs/TRD/` except the path `featureTrd`, which is compared exactly (case included) after the same normalising (with no `featureTrd` given, every TRD is forbidden). A path that is absolute, has a drive letter or still starts with `..` after normalising is forbidden too (outside the repository). `oldPath` is checked the same way. `isForbidden(path, featureTrd)` is exported for the later step that must check where the model writes. The feature's own TRD is not forbidden and is graded by its hunks. `isRecordFile` receives the path as given, never a lower-cased or normalised one, so a non-canonical spelling (`./.trd-state/x`, `.TRD-STATE/x`) is not a record file here exactly as in `mergeBase`.
4. Mechanical rules, each hunk of a file must pass or the file is behavioural: (a) both sides replaced the same base lines and their replacements share the same leading lines (the same edit to the old last entry, for example the comma both sides add in `package.json`), the remainder of each then counting as an insertion after those lines; (b) both sides only add lines, no base line changed, and the added lines are list entries (barrel, schema, manifest or list file by path, or lines shaped like imports, exports, bullets, keyed entries or quoted list items) with no same-key-different-value clash and no same-named declaration added differently; (c) the sides' edits touch different base lines and no insertion of one side sits at or beside a line the other changed; (d) a test file (by path) with `testBrokenByBase`, with or without hunks, is mechanical unless both sides changed the same base lines differently. Hunks larger than 500 lines per side, missing hunks, malformed hunks, `deletedBy`, `binary` and a `mode` other than a regular file (`100644`, `100755`) are behavioural. Every reason has a stable code (for example `overlap`, `same-key`, `no-hunks`, `deleted`, `non-regular`, `too-large`) which the tests assert.
5. `decide({ classification, resolved, checksFailed, failedAttempts })` returns `{ action, effectiveClass, stop, escalated, reason }`: forbidden -> stop at once; behavioural -> stop; record -> `record-merge`; mechanical -> `resolve` (not yet resolved), `commit` (resolved, checks passing), `fix` (checks failed, `failedAttempts` 0 or 1), and `stop` with `effectiveClass: 'behavioural'`, `escalated: true` when checks failed and `failedAttempts` is 2 or more.
6. `stuckText({ classification, command, failedAttempts, lastFailure })` returns `{ reason, next, text }`; `text` is `═══ COMMAND STUCK: <command> ═══\nReason: …\nNext:   …`, Reason is one line and names each stopping file with its clash (the differing lines for an overlap, the key for a clash, the rule for a forbidden path, the failing check for an escalation).
7. CLI: `node conflict-classifier.js classify|decide|stuck (--file <path> | --stdin)` (no `--json`: that name belongs to `gh`) prints one JSON line and exits 0, including for bad usage (`ok: false`).
8. `conflict-classifier.js` requires `./record-files` for `isRecordFile` and contains no record-file path literal of its own; a test pins both.

## Decision

**A pure, line-based classifier over supplied hunks; no git, no model.** The caller (the merge step, to come in a later item of this plan) gathers the conflicted paths and each region's base/ours/theirs lines; this library only grades them. That keeps every rule unit-testable and means the model's only job later is the hunks. Gathering hunks from a conflicted work tree, the check runner, the ship-record entry and the contract text are other items of the plan and are not built here.

**Placement uses a small line diff of base against each side** (longest-common-subsequence, hunks capped at 500 lines per side) to find which base lines each side changed and where each side only inserted. Alternative rejected: regexes over conflict markers — git's default marker style carries no base text, so "disjoint" cannot be decided from them.

**Conservative on every doubt.** An insertion beside (touching) a line the other side changed, two insertions at the same place in a file whose lines are not list entries, one key given two values, and a same-named declaration added with different bodies are all behavioural. "Anything it cannot place as mechanical is behavioural" is the brief's own rule. Edits to adjacent but different base lines are disjoint: git reports those as a conflict only because they touch, and that is exactly the brief's "disjoint hunks in the same region".

**`testBrokenByBase` is evidence supplied by the caller, not inferred.** The brief's "a test broken only by the base's changes" is a statement about a test run, which a hunk cannot show, and often there is no conflict text at all (the base renamed an API and a test on the feature side now fails); the caller then adds that test to the set as an entry with the flag and no hunks. An empty set still returns `ok: false`. A test file with the flag is mechanical unless both sides changed the same base lines differently (a real clash). Without the flag a test file is graded by its hunks like any other file.

**Two failed fix attempts counts fix attempts after the resolution, not the resolution itself:** resolution, checks fail, fix 1 fails, fix 2 fails -> stop. `failedAttempts` is passed in by the caller (the caller owns the loop and the ship record), so `decide` stays pure.

**`isRecordFile` is called, never copied** (single definition; `custody.classifyPath` and `mergeBase` read the same one). The forbidden check runs before it, so a path can never be both.

**A set mixing record and mechanical files is `mechanical`.** `mergeBase` aborts on any non-record path, so the resolution step must merge the record files itself; noted for that later item.

## Non-Goals

- No git access, no reading conflict markers from a work tree, no running of lint, typecheck or tests, no commit or push, and no ship-record writing: the in-place resolution item of the plan builds those on top of this library.
- No change to `record-files.js` or its tests, to `merge-up.js`, to `ship-primitive-merge.md`, `docs/guides/ship-build.md` or `CHANGELOG.md` (other items of the plan).
- No resolving of behavioural, forbidden or rules-file conflicts, ever.

## Verification Artifacts

None apply — this change has no UI design, no interaction diagram and renders no data.

## Verification Environment

**Environment**: local
**Refresh**: none declared (tests and libraries read the working tree)
**Cannot be checked there**: a live conflict on real GitHub (the plan's later live-proof item covers it)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | How does a caller show "a test broken only by the base's changes"? | a `testBrokenByBase` flag on the file, measured by the caller; the hunks alone cannot show it | |
| OQ-2 | Is an insertion beside a line the other side changed mechanical? | no, behavioural: the safer reading of "anything it cannot place" | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `packages/core/lib/conflict-classifier.js` (classify, decide, stuckText, CLI `main`), add the `packages/full/lib/` symlink and the `.claude/lib/` copy | O1, O2, O3, O4, O5, O6, O7 | None | Calling `classify` with `.claude/rules/x.md` returns `forbidden` with `stopNow`; two list additions to a barrel return `mechanical`; two different edits of the same line return `behavioural`; `.trd-state/a/implement.json` returns `record`; `decide` stops a mechanical conflict at `failedAttempts: 2` with `checksFailed: true` and not at 1; the CLI prints one JSON line; `diff` of core and `.claude/lib` copies is empty and `packages/full/lib/conflict-classifier.js` is a symlink to the core file |
| FIX-002 | Write `packages/core/lib/conflict-classifier.test.js` | O1, O2, O3, O4, O5, O6, O7 | FIX-001 | The file covers each class, each forbidden path form (rules file, nested rules file, another feature's TRD, `./`, `..` and upper-case spellings, no `featureTrd`), the feature's own TRD not forbidden, every mechanical rule and every behavioural reason, the two-attempt rule at 0, 1 and 2, the STUCK text for forbidden, behavioural and escalated stops, the CLI (`--file`, `--stdin`, bad usage), mixed sets (forbidden + mechanical is forbidden, record + mechanical is mechanical), the `package.json` comma case, the feature's own TRD graded mechanical when its hunks are, absolute, escaping and renamed (`oldPath`) paths, symlink mode, `isRecordFile` called (a mocked `isRecordFile` returning true for a made-up path yields `record`; `OWNER-CALLS.md` and `.claude/verification-notes.md` are record; `./.trd-state/x` and `.TRD-STATE/x` are not), every behavioural reason asserted by its code, the mirror (symlink target and byte-identical `.claude/lib` copy), and a pinned list of mutations the tests must catch (no normalising, no `featureTrd` exception, two-attempt limit changed, no beside-a-changed-line rule); `npx jest packages/core/lib/conflict-classifier.test.js packages/core/lib/record-files.test.js` is green |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/conflict-classifier.js`, `packages/full/lib/conflict-classifier.js`, `.claude/lib/conflict-classifier.js`
- **Reuse:** `isRecordFile` from `./record-files` (`record-files.js:34`); the CLI shape of `merge-up.js` (`flag`, `main(argv)` emitting `JSON.stringify(o) + '\n'` and returning 0, `if (require.main === module) process.exit(main(...))`, `module.exports`) [read]
- **Replaces:** nothing; `record-files.js` `classifyClash` keeps grading record-only clashes for `mergeBase` and is not touched [read]
- **Follow:** header comment states WHY A MODULE, the rules and the CLI as `merge-up.js` and `record-files.js` do; `spawnSync` array args only if git is ever called (it is not); no shell. New libs are mirrored as `packages/full/lib/<name>.js` -> `../../core/lib/<name>.js` (symlink, see `rerun-scope.js`) and a plain copy in `.claude/lib/` (`cp -L`, what `scaffold-project.sh copy_libs` does) [read]
- **Careful:** the forbidden check must normalise before matching (`path.posix.normalize`, strip `./`, lower-case) or `.claude/rules/../rules/x.md` slips through; `featureTrd` is compared after the same normalisation and exactly; do not define any `.trd-state` or `OWNER-CALLS` literal here (the single-definition test greps the source); the line diff must be bounded (cap 500 lines per side) so a large file cannot hang the merge step; do not edit `packages/core/templates/shipped-hashes.json` (release-time)

### FIX-002
- **Touches:** `packages/core/lib/conflict-classifier.test.js`
- **Reuse:** the layout of `merge-up.test.js` (CLI run through `spawnSync('node', [LIB, ...])`) and `record-files.test.js` [read]
- **Replaces:** nothing [read]
- **Follow:** Jest, `'use strict'`, one `describe` per rule group; CLI tests parse the single stdout line
- **Careful:** `jest.config.ci.js` excludes only `discovered.test.js`; keep the test free of network and of real git; a test must assert the class, not just `ok`

## Could Not Verify

After the delivered-code audit of 2026-11-21 (five of five verifiers reported; both tasks and 17 requirements checked against the code and `npx jest packages/core/lib/conflict-classifier.test.js packages/core/lib/record-files.test.js`, 143 tests passing):

- **A real conflict on GitHub.** Out of scope for this audit: it needs a live merge, and the plan's live-proof item covers it. The classifier is checked here only against hand-built hunks, including shapes taken from the source request's Storybook examples (`prisma/schema.prisma`, barrel files, `package.json`).
- **Fidelity to product requirements.** No PRD was supplied to the audit, so whether the objectives above match what the product asked for, and whether anything it asked for was left out, was not checked. Only TRD-to-code traceability was.
