# TRD: merge-up-reproves-only-changed

**Source PRD**: None — small change decided by the owner: workplan ship-churn-fixes, feature F-2 (`docs/plans/ship-churn-fixes/roadmap.md` item 2)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | After a merge-up whose base changes touch none of a feature's covered files, the custody gate re-proves no criterion (returns no `reverify`), re-anchors custody once (one `base-merge` move) and the merge step goes on to `gh pr merge` in the same pass, with no second resume and one push (one CI run) | roadmap item 2, Brief and "How it will be checked", 2026-11-11 | yes |
| O2 | After a merge-up whose base changes touch a covered file, the gate re-proves exactly the must-pass criteria covering that file, and reuses the rest | roadmap item 2, Acceptance, 2026-11-11 | yes |
| O3 | The merge step merges the base in only when GitHub reports the PR `CONFLICTING`, or when the PR is behind a base whose protection requires an up-to-date branch (`mergeStateStatus` `BEHIND`); otherwise it merges the PR as it is | roadmap item 2, Brief, 2026-11-11 | yes |

## Intended Change

Today (`packages/core/lib/custody.js`, [read]):

- `compare()` excuses a shipped path the base brought in (head blob equals the new merge base's,
  and the feature's own diff never touched it). `affectedIds()` then treats those excused paths
  like any change: a must-pass criterion **with** a live-evidence `covers` record is re-proved
  only when one of its covered files is among them (already correct, `custody.test.js:670`), but
  a criterion **without** a covers record counts as affected "whenever anything changed" (OQ-2),
  so every such must-pass criterion is re-proved after every merge-up (`custody.test.js:688`).
  Covers are recorded only by `[LIVE]` tasks, so in practice most criteria have none, and a
  merge-up re-proves almost everything.
- Nothing names the two merge bases: the old one (`merge-base(anchor, newBase)`) and the new one.
- The merge contract (`ship-primitive-merge.md` step 1) merges the base in only on `CONFLICTING`.
  A PR that is `MERGEABLE` but behind a base whose protection requires up-to-date branches is
  sent straight to `gh pr merge`, which fails, and the run stops.

After:

1. For a **base-only** change (no shipped path differs except base-excused ones), a must-pass
   criterion with no covers record keeps its proof (`reused`): `affectedIds`' no-covers branch
   becomes `return shipped.length > 0` instead of `return true`. A criterion with a covers record
   is judged against the excused paths (the files that differ between the old and the new merge
   base and that the feature never touched before the anchor), as now. When a shipped
   (feature-side) path also differs, OQ-2 is unchanged: a no-covers criterion is affected. A
   must-pass objective that **no criterion names** (`cov.uncovered`) has no proof to reuse and
   stays affected on every change, base-only included.
2. `reconcile` reports the two merge bases (`mergeBases: {old, new}`) beside `excused` whenever
   `--base` is given and the base was taken in: `new` is the base commit the head took in, `old`
   is `git merge-base <anchor> <new>`, computed in `reconcile` itself (so it is present even when
   `compare()` returns early because nothing shipped differs).
3. A new library `packages/core/lib/merge-up.js` decides, from
   `gh pr view <pr> --json state,mergeable,mergeStateStatus`, whether to merge the base in:
   `MERGED` → `skip`; `mergeable` `UNKNOWN` → `poll`; `CONFLICTING` → `merge-in`; `MERGEABLE`
   with `mergeStateStatus` `BEHIND` → `merge-in` (protection requires an up-to-date branch);
   any other → `skip`. The merge contract's step 1 calls it instead of reading `mergeable` itself.
4. A seam test plays the merge contract end to end on a fixture repository with a bare origin and
   a stubbed `gh`, proving O1–O3.

Checkable outcome: `npx jest packages/core/lib/custody.test.js packages/core/lib/merge-up.test.js packages/core/lib/ship-build.seam.test.js packages/core/contracts/ship-primitives.test.js` passes, including the new cases below; before this change the O1 seam case fails (the gate returns `reverify` for a no-covers must-pass criterion) and the `BEHIND` case has no decision to call.

## Decision

- **A no-covers must-pass criterion keeps its proof across a base-only change** — one line,
  `if (!covers) return shipped.length > 0;`. NOT "treat it as covering the files the feature
  changed": `compare()` excuses a path only when the feature never touched it, so that set can
  never meet an excused path and the computation is dead code that disguises this rule (plan
  review finding). NOT "derive its files from the TRD's `Touches`": TRD parsing in custody for the
  same answer. NOT "keep OQ-2 for base-only changes": that is the churn this feature removes.
- **A must-pass objective no criterion names stays affected.** It never had a proof, so
  "reused" would be false; the no-covers rule above applies only to ids that are criteria. The safety net
  for base regressions is the CI run on the merged head, which step 1 already waits for before
  the gate, and the base's own pipeline.
- **OQ-2 stays for feature-side changes.** A shipped path the feature changed after the anchor
  still puts every no-covers must-pass criterion in doubt. Only base-only changes are narrowed.
- **The up-to-date rule reads GitHub's own `mergeStateStatus`, never the protection API.**
  `BEHIND` is GitHub's verdict that the head is out of date under a rule that requires it (branch
  protection or a ruleset); reading `/branches/<base>/protection` would miss rulesets and needs
  admin scope. NOT "merge the base in whenever the PR is behind": that is the churn the roadmap
  asks to stop.
- **The decision lives in a new file, `merge-up.js`, not in `record-files.js`.** Feature F-1 of
  the same plan (per-feature framework writes) edits `record-files.js`; a separate file keeps the
  two features from clashing. `isRecordFile` stays the single record-file definition and is not
  touched here.
- `merge-up.js` follows `custody.js`'s shape: a pure `decide()` plus a CLI that runs `gh` with
  `spawnSync` and an argument array, prints one JSON line and exits 0 on every expected outcome.

## Non-Goals

- No change to how a criterion with a covers record is judged, to `compare()`'s excuse rule, or
  to the `pr-head`, `merge` and `deploy` links.
- No change to `record-files.js` or `isRecordFile` (feature F-1 owns that file).
- No change to Forge's own `base_moved` merge-ups or its conflict brief (out-of-scope fence).
- No bypass of branch protection; `gh pr merge` failures still stop.
- No live GitHub run: the live "at most one CI run" count is deferred (see Could Not Verify).
- No edit to `.claude/rules/*.md` owner-governed files, and no `.claude/` refresh (done at release).

## Verification Artifacts

None apply — the change is a library, a contract's prose and their Jest tests; there are no
screens, designs, journeys or rendered data for a verification skill to check.

## Verification Environment
**Environment**: local
**Refresh**: nothing — tests and libraries read the working tree
**Cannot be checked there**: real GitHub `mergeStateStatus` values and the real CI-run count on a pull request (`github-live-test` exists but this feature's acceptance is proved with stubbed `gh`, by the owner's recorded decision)

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | May a must-pass criterion with no covers record keep its proof across a base-only merge-up, relying on the CI run on the merged head for base regressions? | Yes — it is what the roadmap asks ("re-prove only the criteria whose covered files differ"); recorded as an OWNER-CALL | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Narrow `affectedIds` for base-only changes and report the two merge bases in `custody.js` | O1, O2 | None | (a) base-only change, must-pass criterion with no covers record: `reconcile --base` returns `moved` rule `base-merge`, `reused` includes it, no `reverify` (replaces the expectation at `custody.test.js:688`); (a2) base-only change with a must-pass objective no criterion names: `reverify` naming that objective id; (b) base-only change touching a file in FS-1's covers but not FS-2's: `reverify` with `ids` exactly `['FS-1']`; (c) a feature-side shipped change plus a no-covers criterion still returns `reverify` naming it (OQ-2 unchanged); (d) the result carries `mergeBases: {old, new}` as full shas when `--base` is given and the base was taken in — including a merge-up that brought in only test or record files — and omits it otherwise; (e) every existing `custody.test.js` case except the one at :688 passes unchanged |
| FIX-002 | Add `packages/core/lib/merge-up.js` (`decide()` + `decide --pr N` CLI) with tests and the `packages/full/lib` symlink | O3 | None | `merge-up.test.js` covers, with a stubbed `gh` on PATH: `MERGED`→`skip`; `UNKNOWN`→`poll`; `CONFLICTING`→`merge-in`; `MERGEABLE`+`BEHIND`→`merge-in` with a reason naming the up-to-date requirement; `MERGEABLE`+`CLEAN`/`BLOCKED`/`UNSTABLE`→`skip`; a failing or unparseable `gh` → `ok: false` with the reason; a non-integer `--pr` → usage refusal; the CLI prints one JSON line and exits 0. `packages/full/lib/merge-up.js` is a symlink to `../../core/lib/merge-up.js` |
| FIX-003 | Rewrite step 1 of `ship-primitive-merge.md` to call `merge-up.js decide` (merge in on `CONFLICTING` or `BEHIND`), report `mergeBases` in `ship-custody-gate.md` step 4, and update the pins in `ship-primitives.test.js` | O3, O1 | FIX-001, FIX-002 | `ship-primitives.test.js` pins, in order before the gate: `merge-up.js decide`, the `MERGED` skip, the `UNKNOWN` poll (8 times, 15s apart), `merge-in` on `CONFLICTING` or `BEHIND`, base fetch, `merge-base-in`, push, head wait, CI wait; and pins that a `skip` goes straight to the gate. The custody-gate contract names `mergeBases` in its report step. Every other existing pin passes |
| FIX-004 | Seam test: play the merge contract on a fixture repo with a bare origin and stubbed `gh` through decide → merge-base-in → push → gate → pr-head check → `gh pr merge` | O1, O2, O3 | FIX-001, FIX-002, FIX-003 | In `ship-build.seam.test.js`: (1) base change touching no covered file, PR stubbed `CONFLICTING`: one merge commit pushed (origin's branch ref moves exactly once in the merge step), gate `moved` with one `base-merge` move, never `reverify`, pr-head check `ok`, the stubbed `gh pr merge` is called once with `--match-head-commit` equal to the pushed merge commit, and the step records `merged` with no `wait`; (2) base change touching FS-1's covered file: gate returns `reverify` with `ids` exactly `['FS-1']` and FS-2 in `reused`; (3) PR stubbed `MERGEABLE`+`CLEAN`: no merge-in, no push, gate `none`, merge called; (4) `MERGEABLE`+`BEHIND`: merge-in happens |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/custody.js`, `packages/core/lib/custody.test.js`
- **Reuse:** `affectedIds()` (lines 269-298) is the one place criteria are judged; pass it `shipped` beside the flat `changedPaths` so the no-covers branch can tell a base-only change, and keep `cov.uncovered` ids affected (track which ids came from `cov.criteria`) [read]. In `reconcile`, after `baseCommit` is set (line 407), run `git merge-base <anchor> <baseCommit>` for `mergeBases.old` — not inside `compare()`, whose early return at line 173 would skip it and where a new failure path would add a refusal [read]. The base-test helpers `landOnBase`/`mergeBase` in `custody.test.js` (from line 558) build the merge-up fixtures [read]
- **Replaces:** the "no covers → affected whenever anything changed" branch (`if (!covers) return true;`, line 293) for the base-only case only; the expectation of the test at `custody.test.js:688` (it encodes the behaviour this feature removes) [read]
- **Follow:** `out()` (line 415) adds fields only when `--base` was given, so a no-flag run reports exactly what it did before — put `mergeBases` there. Update the header comment (lines 21-27) and the `affectedIds` doc comment to say what a base-only change now does
- **Careful:** `reason === 'format'` (line 425) and `noneAffectedRule` (line 440) key on `shipped.length`; keep them unchanged. "Base-only" means `shipped.length === 0 && excused.length > 0` after `compare()` — `differing` stays the shipped list. Covers paths are absolute; compare in repo-relative form as line 295 does

### FIX-002
- **Touches:** `packages/core/lib/merge-up.js`, `packages/core/lib/merge-up.test.js`, `packages/full/lib/merge-up.js`
- **Reuse:** `custody.js`'s `run()` helper shape (spawnSync, argument array, `{ok, out, err}`) and its CLI pattern (`flag()`, `emit()` of one JSON line, exit 0) [read]; the stubbed-`gh` pattern in `custody.test.js` (`STUB_PR_JSON` env read by a script on PATH, lines 383-460) [read]
- **Replaces:** nothing — new file
- **Follow:** `'use strict'`, a header comment saying WHY A SCRIPT, `module.exports = { decide, main }`, `if (require.main === module) process.exit(main(process.argv.slice(2)))`. `packages/full/lib/*.js` are relative symlinks to `../../core/lib/<file>` (as `packages/full/lib/record-files.js` from PR #99)
- **Careful:** `state` `MERGED` must be checked before `mergeable`: a merged PR reads `UNKNOWN` forever (the existing contract's reason). `mergeStateStatus` `UNKNOWN` with `mergeable` `MERGEABLE` is `poll`, not `skip`, so a not-yet-computed BEHIND is not missed. Do not read the branch-protection API

### FIX-003
- **Touches:** `packages/core/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-custody-gate.md`, `packages/core/contracts/ship-primitives.test.js`
- **Reuse:** the existing step 1 text (lines 23-48): keep the fetch, `merge-base-in` call, push, head poll and CI wait word for word; only the decision changes [read]. The existing pin test at `ship-primitives.test.js:229` [read]
- **Replaces:** the inline `mergeable` read and its `MERGEABLE`/`CONFLICTING` bullets in step 1 [read]
- **Follow:** contract prose style: numbered Do steps, commands in fenced `bash` blocks, `stop` named with its reason; one rule for every stop (line 75) still lists every stop including a `decide` failure
- **Careful:** the "One rule for every stop" paragraph is pinned by `ship-primitives.test.js:252`; keep its order (merge-base-in, push, head wait, CI). Do not touch `.claude/contracts/` or `packages/full/contracts/` copies (refreshed at release)

### FIX-004
- **Touches:** `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** `setup()`, `playPush()` and `playGate()` (lines 47-124) and `withDefinition()` (line 196) [read]; `landOnBase` from `custody.test.js` (port it; the seam file has none) [read]; `record-files.js merge-base-in` as its CLI [read]; a stubbed `gh` script on PATH whose `pr view` reports `headRefOid` from `git ls-remote` against the bare origin (the merge commit does not exist until the step runs, so a fixed env JSON cannot carry it) and `mergeable`/`mergeStateStatus`/`state` from env, and logs `pr merge` arguments to a file. Put the stub on `process.env.PATH` as `custody.test.js:558-568` does, since `cleanEnv()` copies it
- **Replaces:** nothing
- **Follow:** the file's own rule: play the lead, stub only `gh` and the model's judgement; real git against a bare origin. Count pushes by reading `git reflog`/`ls-remote` on the bare origin before and after the merge step. The load-bearing assertion for O1 is that the pr-head check's `observed` equals the pushed merge commit and the gate made one `base-merge` move; the logged `gh pr merge` call only shows the test played the step
- **Careful:** `withDefinition()` defines one criterion with no manifest; the O2 case needs two must-pass criteria (FS-1 with a covers manifest via `live-evidence.js record`, FS-2 without) and a TRD with two must-pass objectives. Clear `GIT_DIR`/`GIT_WORK_TREE` with `cleanEnv()`

## Could Not Verify

- That GitHub reports `mergeStateStatus: BEHIND` only when a protection rule or ruleset requires an up-to-date branch [inferred from GitHub's GraphQL `MergeStateStatus` documentation, not checked against a live repository]. If GitHub also reports it for unprotected bases, the step merges the base in when not strictly needed — one extra CI run, not a wrong merge.
- `BEHIND` is read once, in step 1: if the base moves again before `gh pr merge`, or a missing review makes GitHub report `BLOCKED` instead, `gh pr merge` fails and the run stops — accepted under the non-goal that merge failures still stop.
- The live "at most one CI run" count on a real pull request — deferred by the owner's recorded decision; proved here only as "one push from the merge step" with stubbed `gh`.
- That narrowing base-only re-proof is safe for a criterion with no covers record depends on the CI run on the merged head catching base regressions (OQ-1).
