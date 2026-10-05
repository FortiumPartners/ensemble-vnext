# TRD: audit-docs-prd-handling

**Source PRD**: None — small change decided in session, 2026-10-04 (owner, after reviewing the
`/audit-docs` trial run's PRD edits)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A PRD whose feature is in flight is not reviewed: it is skipped, and the change set lists it as skipped with the reason | your instruction, 2026-10-04: "skip PRDs whose feature is in flight" |
| O2 | A PRD requirement corrected because the code behaves differently from what it states (a change someone using the product would notice, not a naming or mechanism detail) is listed in the change set under its own heading for owner confirmation, apart from ordinary corrections | your instruction, 2026-10-04: "list behaviour-level corrections separately in the change set for owner confirmation" |
| O3 | Each such behaviour correction adds one dated line to the PRD's own changelog naming the requirement and what changed; a missing line is reported | your instruction, 2026-10-04: "add a dated changelog line in the PRD per behaviour correction" |
| O4 | A PRD non-goal the code contradicts is left as written and reported, never rewritten | your instruction, 2026-10-04: "report rather than rewrite a broken non-goal" |

## Intended Change

**Before** (checked in the trial run of 2026-10-04 and in the code):

- `docs-audit-assemble.js` skips only TRDs (`trdSkip`: `no-implementation` or `in-flight`).
  Every tracked PRD is batched and reviewed, including one whose feature is mid-build. [read]
- The contract's PRD procedure (`## PRD procedure`) has one "Built differently" outcome:
  "Correct the requirement to what is built". Every correction is returned in one
  `corrections` list, and the change set prints all of them as `- Corrected — …`. In the
  trial, the stop-hook PRD's two behaviour changes (output logged only in debug mode, AC-F2.3;
  session metadata now injected, against non-goal NG5) sat among 13 corrections with the same
  label. [read, ran]
- Non-goals are "checked as claims only where they assert something about the code", and a
  contradicted one is corrected like any claim: the trial rewrote NG5. [read, ran]
- No changelog entry is written for any correction. [ran]

**After:**

1. A PRD is skipped with reason `in-flight` when a TRD that cites it (its path appears in the
   TRD's first 40 lines, or the TRD shares its basename) is itself skipped `in-flight` by the
   existing TRD rule (`trdSkip`: an unclosed `implement.json` with a development task not yet
   done). `.trd-state/current.json` is not consulted: it is gitignored (`.gitignore:21`), so it
   is absent at HEAD, and it uses a looser meaning of in flight than `trdSkip`. A skipped PRD
   leaves the batches and appears in the change set's Documents table as `skipped (in-flight)`.
   A PRD whose TRD was skipped `no-implementation` is still reviewed (its requirements surface
   as unbuilt, which is today's safe behaviour).
2. "Built differently" splits in two. A **mechanism** correction (a name, a path, an internal
   ordering, a registration detail; nothing a user or the owner would observe change) is
   corrected and returned in `corrections`, as today. A **behaviour** correction (what the
   product does, as someone using it would see it) is corrected **and** returned in a new
   `behaviourChanges` list `{ id, was, now }` (and not also in `corrections`), **and** adds one
   row to the PRD's existing changelog table (`## Changelog` or `## Version History`), filling
   that table's own columns: the run date in its date column, `/audit-docs` in its author
   column when it has one, and the requirement id and what changed in its changes column. Only
   when the PRD has no changelog does the agent add `## Changelog` with `| Date | Change |`.
3. A non-goal the code contradicts is not edited. It is returned in a new `brokenNonGoals`
   list `{ id, statement, evidence }` and left exactly as written.
4. The change set gains a section, `## Requirements changed to match the code — confirm`,
   listing every behaviour correction as `<prd>: <id> — was: <was>; now: <now>`, only for PRDs
   whose edit actually landed (in an apply result's `edited` list; a doc reverted for a banner
   or a stray edit is not listed). The batch commit message counts behaviour changes with the
   corrections, so it does not undercount.
   Broken non-goals and changelog defects go under `## Surfaced for the owner`.
5. `docs-audit-apply.js` checks every PRD record carrying `behaviourChanges`: the diff must add
   a line containing the requirement id and the run date. A missing one is a
   `changelogDefect`, reported and never reverted (same treatment as a map defect).
6. The `/audit-docs` readout lists skipped PRDs under STATE. Under ISSUES, because each needs
   the owner, it lists the confirm list, broken non-goals and changelog defects.

A criterion that would look the same if the fix did nothing is not one: each test below
asserts on a fixture where the old code produces the wrong output (a mid-build PRD batched; a
behaviour change printed only as `Corrected`; a contradicted non-goal not listed; a missing
changelog row not reported).

## Decision

Classify behaviour versus mechanism **in the reviewing agent**, recorded in the returned
record, and keep every check on the result deterministic in the libraries. The distinction is
a judgement about meaning (does a user see a difference?), which no library can make; what a
library can do is hold the agent to having recorded it (the changelog-row check) and present
it apart (the change set). Rejected: a keyword or diff-size heuristic in `docs-audit-apply.js`
to detect behaviour changes. It would manufacture a ruler with no source, the failure
`plan-weight.js`'s exit test was written to avoid.

The changelog row is a row, never a banner. It carries no "superseded", "archived" or
"deprecated" wording, so the existing banner revert (`isSignpostLine`) does not fire on it, and
the contract says so.

PRD in-flight detection reuses the TRD skip already computed (`trdSkip`) rather than adding a
second notion of "in flight". `current.json` was considered and rejected (adversarial review):
it is gitignored since cb9fcda, so it never exists at HEAD, and it would skip the PRD of a
built-but-unclosed feature that `trdSkip` reviews.

The verifiers carry the distinction too: the finding `action` enum in `audit-docs.js` gains
`behaviour` (a requirement the code contradicts in a way a user would see) and `non-goal` (a
non-goal the code contradicts), so the single writer receives the classification from three
independent checks rather than inventing it.

absorbed: none.
not absorbed: `docs/TRD/completed/implement-trd-rework.md` is skipped `no-implementation` although all 19 tasks succeeded (the implement.json lookup and touched-files check do not follow the move) — separate fix; O1 keys only on `in-flight`, so this change works with it present.
not absorbed: inconsistent TRD Status words across runs (Implemented / Approved / Active) — separate fix to the TRD procedure.
not absorbed: the Haiku scorer under-rating stale docs — separate.
not absorbed: `docs/PRD/docs-as-built.md` and `docs/TRD/docs-as-built.md` describing the old PRD procedure — `/audit-docs` corrects them on its next run, which is the feature's own purpose.

## Non-Goals

- Changing how TRDs or loose docs are reviewed.
- Skipping PRDs whose feature has not started; only `in-flight` skips.
- Fixing the moved-TRD skip bug or the Status-word inconsistency (separate fixes).
- Any banner, archive folder or moved content (the existing correct-or-cut rules stand).

## Verification Artifacts

None apply — no UI, no design frames, no screens; every change is a library, a workflow
schema or prompt text, covered by Jest.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a PRD whose TRD was skipped `no-implementation` (planned, not yet built) also be skipped? | No: only `in-flight`, as asked. Its requirements surface as unbuilt and are left in place, which is safe | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Backend: skip a PRD whose feature is in flight in `docs-audit-assemble.js` — after the TRD loop, set `skip: 'in-flight'` on a PRD cited (first 40 lines, or same basename) by a TRD skipped `in-flight`; add Jest tests | O1 | None | Fixture: an unclosed implement.json with an open development task for a TRD citing `docs/PRD/x.md` → the assembly's `skipped` lists `docs/PRD/x.md` with reason `in-flight` and no batch contains it (fails on today's code). Same, with the TRD sharing the PRD's basename and not citing it → skipped (fails on today's code). Regression guards, which pass today and must keep passing: the same TRD closed → the PRD is batched; TRD skipped `no-implementation` → the PRD is batched |
| FIX-002 | Backend: contract and workflow — rewrite the contract's `## PRD procedure` (mechanism vs behaviour correction; the changelog row appended in the existing table's columns, with no banner word; broken non-goals reported not edited) and `## What you return` (`behaviourChanges`, `brokenNonGoals`); add both to `REVIEW_SCHEMA`, `baseRecord` and `withResult` in `audit-docs.js` (PRD only, emptied for other classes); add `behaviour` and `non-goal` to the verifier finding `action` enum and name them in the PRD verifier and writer prompts; mirror to `.claude/contracts/`, `packages/full/contracts/`, `.claude/workflows/`, `packages/full/workflows/` | O2, O3, O4 | None | `audit-docs.test.js`: a PRD review returning `behaviourChanges` and `brokenNonGoals` reaches the batch record with both lists equal to what was returned (fails today: the fields are dropped); a TRD review returning them gets `[]` for both. The verifier schema accepts `action: "behaviour"` and `action: "non-goal"` (fails today). Contract text tests: names the changelog row, says to use the existing table's columns, forbids editing a contradicted non-goal. Mirrors byte-identical (regression guard) |
| FIX-003 | Backend: changelog check in `docs-audit-apply.js` — for each PRD record with an `edited` outcome and non-empty `behaviourChanges`, check for an added line containing each change's `id` and the run date (first 10 characters of the assembly's `runId`); a miss is pushed to a new `changelogDefects` list `{ path, id }`, never reverted; add Jest tests | O3 | FIX-002 | Fixture PRD edited with a behaviour change and no changelog line → `changelogDefects` equals `[{ path, id }]` and the edit stays (fails today). With the row added → `changelogDefects` strictly equals `[]` (fails today: the field is undefined). Regression guard: a row reading "this section is superseded" still reverts as a banner |
| FIX-004 | Backend: change set and commit message in `docs-audit-deliver.js` — add `## Requirements changed to match the code — confirm` listing `behaviourChanges` of records whose path is in some apply result's `edited` list; add broken non-goals and `changelogDefects` to `## Surfaced for the owner`; in `commitBatch`, count behaviour changes with corrections in the message; add Jest tests | O2, O3, O4 | FIX-002, FIX-003 | A record with one behaviour change and its path in `edited` renders under the confirm heading as `<prd>: <id> — was: …; now: …` (fails today). The same record with its path reverted, not in `edited` → not listed. A broken non-goal and a changelog defect each appear under Surfaced (fails today). With none, the confirm section reads `None.` A batch with 2 corrections and 1 behaviour change commits as `3 corrected` (fails today: `2 corrected`) |
| FIX-005 | Backend: command readout and lib mirrors — in `packages/core/commands/audit-docs.md` step 7 and the Readout, name skipped PRDs (STATE), and the confirm list, broken non-goals and changelog defects (ISSUES); copy to `.claude/commands/audit-docs.md`; copy the three changed libs to `.claude/lib/` | O1, O2, O3, O4 | FIX-001, FIX-003, FIX-004 | `.claude/commands/audit-docs.md` and `.claude/lib/docs-audit-{assemble,apply,deliver}.js` are byte-identical to their `packages/core` sources; the command text names `behaviourChanges`, `brokenNonGoals` and `changelogDefects` and says PRDs are skipped `in-flight` (fails today). Regression guards: the copies byte-identical, the full Jest suite and `runtime-integrity.test.sh` pass |
| AMEND-001 | [test-gap] No change-set test shows a PRD skipped in flight getting its skipped (in-flight) row; the only skip-row test uses a TRD fixture — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/lib/docs-audit-deliver.test.js:251,354 (TRD-only skip row); packages/core/lib/docs-audit-deliver.js:275-281 (row handles prd and trd alike)) | amendment — no objective recorded | None | [test-gap] No change-set test shows a PRD skipped in flight getting its skipped (in-flight) row; the only skip-row test uses a TRD fixture is met |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/docs-audit-assemble.js`, `packages/core/lib/docs-audit-assemble.test.js`
- **Reuse:** the per-file `skip` field and its consumers — `reviewable` filters on `f.skip === null` and `skipped` lists every non-null skip, so a PRD with `skip: 'in-flight'` leaves the batches and is listed with no further change [read] [read]; the D19 test fixtures in `docs-audit-assemble.test.js` ("TRD parse and D19 skip tests") for building an unclosed implement.json [read]
- **Replaces:** nothing; PRDs currently never get a `skip` value (`analyseTrd` runs for `cls.class === 'trd'` only) [read]
- **Follow:** the second pass runs after the file loop, because a PRD may sort before the TRD that cites it; match the cited path with the same `docs/PRD/…\.md` token shape the TRD headers use (`**Source PRD**:` / `PRD:` lines, verified on 9 TRDs) [ran]
- **Careful:** `docs-audit-deliver.js` `renderChangeSet` already prints a skipped PRD row (`f.class !== 'prd' && f.class !== 'trd'` is the only class filter), so do not add a second rendering path; do not read `.trd-state/current.json` — it is gitignored and absent at HEAD [read]

### FIX-002
- **Touches:** `packages/core/contracts/docs-audit.md`, `packages/core/workflows/audit-docs.js`, `packages/core/workflows/audit-docs.test.js`, `.claude/contracts/docs-audit.md`, `packages/full/contracts/docs-audit.md`, `.claude/workflows/audit-docs.js`, `packages/full/workflows/audit-docs.js`
- **Reuse:** the `unbuilt` field's whole path as the template — schema entry in `REVIEW_SCHEMA`, empty default in `baseRecord`, class-gated copy in `withResult` (`doc.class === 'prd' ? … : []`) [read]
- **Replaces:** the single "Built differently → Correct the requirement" row of the PRD procedure table, and the sentence "Non-goals … are checked as claims only where they assert something about the code" as it applies to a contradicted non-goal [read]
- **Follow:** the contract's section list at the top ("The ten sections") stays accurate; keep the contract's own wording style (a table per procedure, one-line rules)
- **Careful:** the changelog row must contain no banner word (superseded / archived / deprecated), or `isSignpostLine` (its self-subject form, "the section is deprecated") reverts the whole doc — say so in the contract; 9 of 15 PRDs already have a 4-column `| Version | Date | Changes | Author |` table and one uses `## Version History`, so the row follows the existing columns [read]

### FIX-003
- **Touches:** `packages/core/lib/docs-audit-apply.js`, `packages/core/lib/docs-audit-apply.test.js`
- **Reuse:** `addedLines(repo, p)` for the diff's added lines; the map-defect check (step 3, "Code-map presence and format") as the shape — reported, never reverted [read]
- **Replaces:** nothing
- **Follow:** run after the banner check, on records still `edited` and not reverted; add `changelogDefects: []` to the result object alongside `mapDefects` [read]
- **Careful:** the run date comes from `assembly.runId` (`<YYYY-MM-DD>-<sha7>`), validated by `assemble` [read]

### FIX-004
- **Touches:** `packages/core/lib/docs-audit-deliver.js`, `packages/core/lib/docs-audit-deliver.test.js`
- **Reuse:** `renderChangeSet`'s per-doc detail loop, the `surfaced` array and its `applieds` argument (for the `edited` filter); `commitBatch`'s count of `corrections` (`docs-audit-deliver.js` around :163) [read]
- **Replaces:** nothing; behaviour changes are rendered only under the new heading, so the agent must not also list them in `corrections` (the contract in FIX-002 says so; the renderer does not deduplicate)
- **Follow:** headings in the existing order — the confirm section sits before `## Surfaced for the owner`, after `## Removals blocked`
- **Careful:** `cell()` escaping applies only to the table; list lines take the text as given [read]

### FIX-005
- **Touches:** `packages/core/commands/audit-docs.md`, `.claude/commands/audit-docs.md`, `.claude/lib/docs-audit-assemble.js`, `.claude/lib/docs-audit-apply.js`, `.claude/lib/docs-audit-deliver.js`
- **Reuse:** the Readout section's STATE and ISSUES bullets [read]
- **Replaces:** "TRDs skipped, with the reason" in STATE becomes "TRDs and PRDs skipped, with the reason" [read]
- **Follow:** runtime-integrity requires the `.claude/` copies byte-identical to their sources [read]
- **Careful:** `packages/full/lib/docs-audit-*.js` are symlinks to `packages/core/lib`; do not replace them with copies [ran]

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

Rewritten by `/audit-build`, 2026-10-04. This audit checked the five tasks (FIX-001 to FIX-005)
against the delivered code and tests; what it confirmed is no longer listed here.

| Claim | Why it was not checked | How to check |
|-------|------------------------|--------------|
| The delivered behaviour matches what the owner asked for, beyond what this TRD restates | No PRD exists for this change (Source PRD: none, decided in session 2026-10-04), so `/audit-build` compared the code with this TRD only; fidelity to the owner's intent and anything omitted from the TRD were not checked | Owner reads the four objectives (O1–O4) against the 2026-10-04 instructions they quote |
| A reviewing agent sorts mechanism from behaviour corrections the way the owner would (on the trial's stop-hook PRD: AC-F2.3 behaviour, NOTIFY_CWD mechanism) | Model behaviour; Jest checks the record plumbing, not the judgement. Out of scope for a code audit | Re-run the 2026-10-04 trial's PRD batch on the isolated copy after the change, and compare its confirm list to that split |
| This change lands after `/audit-docs` itself (PR #26, `feature/docs-as-built/trd`) | A merge-order fact, not a code claim. The branch is built on PR #26's tip (8e8156c is an ancestor of HEAD); PR #26 was still open on 2026-10-04 | Merge PR #26 first, or merge this branch into it |
