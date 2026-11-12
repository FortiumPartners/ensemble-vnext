# TRD: rank-follow-ups-product-first

**Source PRD**: None — small change decided in session (feature F-6 of workplan
verification-targeted-loop; roadmap `docs/plans/verification-targeted-loop/roadmap.md` item 6;
issue FortiumPartners/ensemble-vnext#113)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every follow-up row has a rank class, one of `product`, `host`, `tooling`, `paperwork`, `not-verifiable`; a row recorded with no class (a legacy row) gets one from its summary prefix (`[not-verifiable]` → not-verifiable, `[flaky-ci]` → tooling, `[review:<label>]` → product, and so on) | your instruction, 2026-11-11 (roadmap item 6 brief) | yes |
| O2 | `file-followups` files and lists rows in rank order — product, host, tooling, paperwork, not-verifiable — across every ledger it reads, and records each row's class with it | your instruction, 2026-11-11 | yes |
| O3 | `/ship-build`'s readout lists filed and unfiled follow-ups in that same order with the class shown, so the product items are read first | your instruction, 2026-11-11 | |

## Intended Change

Today `file-followups` (`packages/core/contracts/ship-primitive-file-followups.md` steps 3-5)
reads open rows with `discovered.readAll(dir, { open: true })`, which returns them in ledger
(append) order, and files and lists them in that order. Rows carry only a summary prefix
(`[not-verifiable]`, `[flaky-ci]`, `[review:<label>]`, `[below-critical]` ...). `/ship-build`'s
readout (`packages/core/commands/ship-build.md:217-244`) lists `data.filed` and the
`data.issues` lines in the order recorded. On the Storybook ship in issue #113 that put about 12
product items somewhere in a list of 37. [read]

After this change:

- A new library, `packages/core/lib/followup-rank.js`, owns the five classes and their order.
  `classOf(row)` returns the row's class: its recorded `rankClass` when valid, otherwise one
  derived from its summary prefix and status. `rank(rows)` returns the rows stably sorted into
  class order, each carrying `class`. Its CLI, `node .claude/lib/followup-rank.js open
  --state-dir <dir> [--state-dir <dir> ...]`, prints every open row of those ledgers, merged,
  ranked, each row carrying `class` and the `dir` of its ledger (so `discovered.resolve` targets
  the right one).
- `discovered.record` keeps a valid `rankClass` field on a new row, so a writer can name a class
  no prefix carries (`host`, `paperwork`; the to-come item "Block only on material failures" can
  set `product`). Every producer this repo has today is classed from its prefix, status or kind
  at read time, so no producer changes.
- `file-followups` step 3 reads rows through that CLI; step 4 files in that order and records
  `{ summary, url, class }` per filed row; step 5 writes its `data.issues` row lines in that
  order, each starting with the class. `data.unfiled` lists summaries in that order.
- `/ship-build`'s readout states the order and shows the class on every filed, unfiled and
  "recorded, not yet filed" follow-up line (that snippet selects only `[below-critical]`,
  `[not-this-feature]` and `[below-bar]` rows, all `product`, so it needs no re-ordering).
- `docs/guides/ship-build.md`'s `file-followups` row says rows are filed product first.

The prefix map (legacy rows, and any new row with no `rankClass`):

| Class | Prefixes / signals |
|---|---|
| product | `[review:<label>]`, `[below-critical]`, `[not-this-feature]`, `[below-bar]`, `[review-pending]`, `[out-of-scope]`, `[task-followup]`; and anything not matched below |
| host | only a recorded `rankClass: "host"` |
| tooling | `[flaky-ci]`, `[flaky-capped]` |
| paperwork | a row of `kind: "stale-grounding"` (a grounding/document mismatch), or a recorded `rankClass: "paperwork"` |
| not-verifiable | `[not-verifiable]`, or `status: "not_verifiable"` |

Order of precedence: recorded `rankClass`, then `status: "not_verifiable"`, then the prefix,
then `kind: "stale-grounding"`, then `product`.

## Decision

One library (`followup-rank.js`) owns the classes, the order and the prefix map; the contract and
the readout call it rather than restating the map in prose. A recorded `rankClass` wins over the
prefix; a row matching no known prefix ranks `product`. NOT a lower default: the defect in issue
#113 was product items being hidden, so an unknown row must err toward being read, not buried.
`[task-followup]` rows and implementers' prefix-less rows therefore rank `product`.
`[review-pending]` (a review whose findings never arrived) ranks `product`, not `tooling`: it may
be hiding product findings. Below-the-bar review rows (`[below-bar]`, `[review:minor|nit|...]`)
rank `product` too — they are about what the app does; they are still left unfiled without
`below-bar=yes`, and within `product` they keep ledger order. The one `data.issues` line that names
no row (the record of unfixed review findings) goes last. No prefix is invented for host or
paperwork: a writer that knows the class records `rankClass`, which is why `record` keeps it
(reviewer's alternative — classify only at read time — was rejected for that reason: without it
`host` would be unreachable).
Ranking is a stable sort (ledger order is kept within a class) across all ledgers the step reads,
not per ledger. The class list lives in `discovered.js` as `RANK_CLASSES` (so `record` can
validate it without a circular require); `followup-rank.js` re-exports it. `data.unfiled` stays a
list of summary strings (only its order changes), so existing readers are unaffected; `data.filed`
entries gain a `class` field.

## Non-Goals

- No materiality judgement and no new producer of non-material product rows — that is the
  to-come item "Block only on material failures" (roadmap item 5); its rows rank `product` from
  this feature's default or a `rankClass` it sets.
- No change to which rows are filed (below-bar, review-pending, flaky-capped rules unchanged).
- No one-issue-per-class or single ranked issue; each row is still its own issue.
- No change to Forge, to `verification.md`, or to the verification loop.

## Verification Artifacts

None apply — the change is a library, two contract/command prose files and their tests; no
screen renders data, no design frames, no screen-to-screen journey.

## Verification Environment

**Environment**: local
**Refresh**: none declared (tests read the working tree)
**Cannot be checked there**: nothing known; a live `/ship-build` filing against a real tracker is not exercised

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add `followup-rank.js` (classes, `classOf`, `rank`, `open` CLI) with unit tests; add `RANK_CLASSES` and `rankClass` persistence to `discovered.js`; mirror both to `.claude/lib/` and symlink `followup-rank.js` in `packages/full/lib/` | O1, O2 | None | `npx jest packages/core/lib/followup-rank.test.js packages/core/lib/discovered.test.js` passes; a legacy row with only `[flaky-ci]` / `[not-verifiable]` / `[review:major]` / `kind: stale-grounding` / no prefix classes as tooling / not-verifiable / product / paperwork / product; a recorded `rankClass` overrides the prefix; an invalid `rankClass` is dropped by `record`; `rank` puts a mixed list product, host, tooling, paperwork, not-verifiable and keeps ledger order within a class; the CLI merges two ledgers and tags each row with its `dir`; `.claude/lib/followup-rank.js` is byte-identical and `packages/full/lib/followup-rank.js` is a symlink to the core file |
| FIX-002 | Rewrite `file-followups` steps 1, 3, 4, 5 and Result, and `/ship-build` Step 6 STATE/ISSUES follow-up lines, to rank through the library and show the class; mirror both to `.claude/`; update `ship-tracker.test.js`'s pinned data shape | O2, O3 | FIX-001 | `ship-primitives.test.js` new cases pass: the contract reads rows through `followup-rank.js open`, files in rank order, records `class` in `data.filed`, writes class-led `data.issues` lines in rank order; `ship-build.md` names the order product, host, tooling, paperwork, not-verifiable and shows the class on filed, unfiled and recorded-not-yet-filed lines; mirrors byte-identical |
| FIX-003 | Seam test cases in `ship-build.seam.test.js`: play the lead over a mixed ledger (work ledger plus a task ledger) of product, host, tooling, paperwork and not-verifiable rows, some legacy prefix-only — file through the CLI order, resolve each, and assert the filed list and the unfiled list come out product first with each row's class; a legacy prefix-only row gets its class | O1, O2, O3 | FIX-001, FIX-002 | `npx jest packages/core/contracts/ship-primitives.test.js packages/core/lib/ship-build.seam.test.js` passes with the new cases; the cases fail against ledger order (rows are recorded deliberately out of rank order) |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/followup-rank.js`, `packages/core/lib/followup-rank.test.js`, `packages/core/lib/discovered.js`, `.claude/lib/followup-rank.js`, `.claude/lib/discovered.js`, `packages/full/lib/followup-rank.js`
- **Reuse:** `discovered.readAll(dir, { open: true })` for reading (`discovered.js:603`), its `record` validation pattern (`VERIFICATION_STATUSES.includes(entry.status)`, `discovered.js:525`) for `rankClass`; `flaky-ci.js`'s CLI shape (`node .claude/lib/flaky-ci.js import --state-dir ...`) for the `open` subcommand; `flaky-ci.test.js:108-109`'s mirror and symlink assertions [read]
- **Replaces:** nothing — new module; `record` gains one optional field [read]
- **Follow:** the `## Decision` above. `'use strict'`, CommonJS, a header comment saying why the module exists (as `discovered.js` and `flaky-ci.js` do); CLI prints JSON to stdout, usage to stderr with exit 2. `packages/full/lib/<name>.js` is a relative symlink `../../core/lib/<name>.js`; `.claude/lib/` holds a byte copy (scaffold copies `*.js` from the plugin `lib/`, `scaffold-project.sh:419-424`) [read]
- **Careful:** `record` must keep the row under `MAX_LINE_BYTES` (2048) — `rankClass` is short and fixed, and is never trimmed by the ladder; do not add a `require('./followup-rank')` inside `discovered.js` (circular). `flaky-ci.js` is not touched [read]

### FIX-002
- **Touches:** `packages/core/contracts/ship-primitive-file-followups.md`, `.claude/contracts/ship-primitive-file-followups.md`, `packages/core/commands/ship-build.md`, `.claude/commands/ship-build.md`, `packages/core/contracts/ship-primitives.test.js`, `packages/core/contracts/ship-tracker.test.js`, `docs/guides/ship-build.md`
- **Reuse:** the existing step structure of the contract (steps 1-5, Result) and Step 6's STATE/ISSUES bullets in `ship-build.md:217-244`; the existing `flat()` helper and `describe('the after-shipping primitives')` block in `ship-primitives.test.js:546` [read]
- **Replaces:** step 3's `discovered.readAll(dir, { open: true })` as the read; the readout's `discovered.readAll` one-liner for "recorded, not yet filed"; `ship-tracker.test.js:130`'s pinned `{ filed: [{ summary, url }], ... }` [read]
- **Follow:** the `## Decision` above. Keep every existing sentence the current tests pin (`Import what has no row yet`, `discovered.resolve(dir, row, "filed <url>")`, `reads no row of the sweep ledger`, `[review-pending]`, `[flaky-capped]` ... `reported, never filed`, `below-bar=yes`; and from `ship-tracker.test.js:90-123`: `No tracker, or a failed call: file nothing for that row and leave it open`, `one line per item, each naming the row by its summary and its ledger path`, `no tracker declared in stack.md`, the `stack.md`'s `## Issue Tracker` section sentence and `as close-issue reads it`); the mirror test (`ship-primitives.test.js:71`) requires `.claude/contracts/` byte-identical [read]
- **Careful:** leave the step-1 import one-liner as it is (its rows are classed by prefix); `resolve` must be called against each row's own `dir`; the class-led `data.issues` lines must still name the row by its summary and its ledger path [read]

### FIX-003
- **Touches:** `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** the existing `describe('a finding filed once is not filed on a re-run')` pattern (`ship-build.seam.test.js:290-302`) and `setup()` / `s.abs(s.stateDir)`; `spawnSync('node', [...])` against the lib path as the file already does for `SEQ`/`CUSTODY` [read]
- **Replaces:** nothing [read]
- **Follow:** the `## Decision` above; the file's "PLAYS THE LEAD" convention (header comment) — real lib CLI, stubbed tracker (the test chooses the URL) [read]
- **Careful:** record the rows out of rank order (e.g. not-verifiable first, product last) so the assertion can fail if ranking does nothing [inferred]

## Could Not Verify

- The class split in issue #113 (about 12 product, 9 host or tooling, 7 paperwork, 9 not-verifiable) is from the product repo's issue #105, which was not read; no producer in this repo yet emits `host` rows — that class is reached only through a recorded `rankClass`; `paperwork` is reached through `kind: "stale-grounding"` or a recorded `rankClass`.
- A live `/ship-build` run filing against a real tracker is not exercised; the seam test stubs the tracker.
