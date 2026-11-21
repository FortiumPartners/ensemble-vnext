# Functional Verification Report: conflict-classifier-and-stop-rules

**Source PRD**: docs/TRD/conflict-classifier-and-stop-rules.md ## Intended Change
**Success definition**: .trd-state/conflict-classifier-and-stop-rules/success-definition.md
**Outcome**: exit-satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 24 total — 24 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 24 of 24 proven — uncovered: none
**Must pass**: 17 of 17 proven

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | `classify({ files, featureTrd })` on a valid set of conflicted files returns `{ ok: true, class, stop, stopNow, files: [{ path, class, reason, clash? }] }`, with `class` exactly one of `record`, `mechanical`, `behavioural`, `forbidden` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-1.txt | iteration 2 (regression pass 1) |
| FS-2 | When files of several classes are present the set's class follows precedence forbidden > behavioural > mechanical > record; `stop` is true for forbidden and behavioural only, and `stopNow` is true for forbidden | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-2.txt | iteration 2 (regression pass 1) |
| FS-3 | Empty or malformed `classify` input returns `ok: false` with a reason rather than throwing or classifying | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-3.txt | iteration 2 (regression pass 1) |
| FS-4 | A set made only of record files (as `isRecordFile` defines them) classifies `record`, so it is settled by the existing record-file path | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-4.txt | iteration 2 (regression pass 1) |
| FS-5 | A file is checked for a forbidden path first, then `isRecordFile`, then the hunk rules: a forbidden path classifies `forbidden` whatever its hunks look like, even hunks that would otherwise be mechanical, and never `record` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-5.txt | iteration 2 (regression pass 1) |
| FS-6 | `.claude/rules` itself and every path below it is forbidden, matched after normalising `./`, `..`, doubled slashes and backslashes, with the prefix matched case-insensitively | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-6.txt | iteration 2 (regression pass 1) |
| FS-7 | Every path below `docs/TRD/` is forbidden except `featureTrd`, which is compared exactly (case included) after the same normalising; with no `featureTrd` given every TRD is forbidden; the feature's own TRD is not forbidden and is graded by its hunks | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-7.txt | iteration 2 (regression pass 1) |
| FS-8 | A path that is absolute, carries a drive letter, or still starts with `..` after normalising classifies `forbidden` (outside the repository) | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-8.txt | iteration 2 (regression pass 1) |
| FS-9 | A file's `oldPath` (a rename's source) is checked against the forbidden rules the same way, so a rename out of a forbidden path classifies `forbidden` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-9.txt | iteration 2 (regression pass 1) |
| FS-10 | `isForbidden(path, featureTrd)` is exported from the library and gives the same answer the classifier uses | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-10.txt | iteration 2 (regression pass 1) |
| FS-11 | `isRecordFile` receives the path as given, never lower-cased or normalised, so a non-canonical spelling (`./.trd-state/x`, `.TRD-STATE/x`) is not a record file here, exactly as in `mergeBase` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-11.txt | iteration 2 (regression pass 1) |
| FS-12 | Rule (a): both sides replaced the same base lines and their replacements share the same leading lines (for example the comma both add after the old last entry in `package.json`); the remainder of each counts as an insertion after those lines, and the file classifies `mechanical` when that remainder passes | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-12.txt | iteration 2 (regression pass 1) |
| FS-13 | Rule (b): both sides only add lines (no base line changed) and the added lines are list entries (a barrel, schema, manifest or list file by path, or lines shaped like imports, exports, bullets, keyed entries or quoted list items) → `mechanical` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-13.txt | iteration 2 (regression pass 1) |
| FS-14 | Under rule (b), the same key given two different values, or a same-named declaration added differently by the two sides, classifies `behavioural` with reason code `same-key` (or the declaration's stable code) and names the key in `clash` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-14.txt | iteration 2 (regression pass 1) |
| FS-15 | Rule (c): the sides' edits touch different base lines and no insertion of one sits at or beside a line the other changed → `mechanical`; an insertion at or beside the other side's changed line → `behavioural` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-15.txt | iteration 2 (regression pass 1) |
| FS-16 | Rule (d): a test file (by path) flagged `testBrokenByBase`, with or without hunks, classifies `mechanical` unless both sides changed the same base lines differently, which classifies `behavioural` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-16.txt | iteration 2 (regression pass 1) |
| FS-17 | Overlapping changes (both sides changed the same base lines differently, matching no rule) classify `behavioural` with reason code `overlap`, and the `clash` carries the differing lines | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-17.txt | iteration 2 (regression pass 1) |
| FS-18 | Missing hunks, malformed hunks, `deletedBy`, `binary`, a `mode` other than `100644` or `100755`, and a hunk larger than 500 lines on a side each classify `behavioural`, with stable codes including `no-hunks`, `deleted`, `non-regular` and `too-large` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-18.txt | iteration 2 (regression pass 1) |
| FS-19 | Every reason the classifier gives carries a stable code, and the test file asserts those codes | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-19.txt | iteration 2 (regression pass 1) |
| FS-20 | `decide` stops a forbidden classification at once, stops a behavioural one, and returns `record-merge` for a record one, each returning `{ action, effectiveClass, stop, escalated, reason }` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-20.txt | iteration 2 (regression pass 1) |
| FS-21 | For a mechanical classification `decide` returns `resolve` when not yet resolved, `commit` when resolved with checks passing, `fix` when checks failed with `failedAttempts` 0 or 1, and `stop` with `effectiveClass: 'behavioural'` and `escalated: true` when checks failed with `failedAttempts` 2 or more | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-21.txt | iteration 2 (regression pass 1) |
| FS-22 | `stuckText` returns `{ reason, next, text }` where `text` is `═══ COMMAND STUCK: <command> ═══`, then `Reason: …`, then `Next:   …`; Reason is one line naming every stopping file with its clash: the differing lines for an overlap, the key for a same-key clash, the rule for a forbidden path, the failing check for an escalation | .trd-state/conflict-classifier-and-stop-rules/evidence/fs22-iter2/fs22-transcript.txt | 2 |
| FS-23 | The CLI `node conflict-classifier.js classify\|decide\|stuck (--file <path> \| --stdin)` prints exactly one JSON line and exits 0 in every case, including bad usage (`ok: false`); it takes no `--json` flag | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-23.txt | iteration 2 (regression pass 1) |
| FS-24 | `conflict-classifier.js` requires `./record-files` for `isRecordFile` and holds no record-file path literal of its own; a test pins both; and `record-files.test.js` still passes alongside `conflict-classifier.test.js` | .trd-state/conflict-classifier-and-stop-rules/evidence/regression-1/FS-24.txt | iteration 2 (regression pass 1) |

## Not Met

_None._

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| stuck-reason-omits-behavioural-in-forbidden-set | FS-22 | 1 (FS-22) | closed at iteration 2 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

Scope: targeted — re-checked 23: covers-changed 16, no-covers 7

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-2 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-3 | no-covers |  |
| FS-4 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-5 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-6 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-7 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-8 | no-covers |  |
| FS-9 | no-covers |  |
| FS-10 | no-covers |  |
| FS-11 | no-covers |  |
| FS-12 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-13 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-14 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-15 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-16 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-17 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-18 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-19 | no-covers |  |
| FS-20 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-21 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |
| FS-23 | no-covers |  |
| FS-24 | covers-changed | .claude/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.js, packages/core/lib/conflict-classifier.test.js |

Caught: _none._

Not re-walked (covered files unchanged): FS-22

Changed files no criterion covers: _none._