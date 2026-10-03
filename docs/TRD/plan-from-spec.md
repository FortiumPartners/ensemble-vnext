# TRD: plan-from-spec

**Source PRD**: None — change decided in session; source record `docs/plan/plan-from-spec.investigation.md`
**Kind**: change
**Weight**: medium (re-weighed from small after the adversarial review, 2026-10-02)

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-10-02 | Adversarial review: 17 findings applied (section-scoped extraction; library writes copied text; checks read documents; sweep deferral, commit order and `--implement` ordering; guards; verification through `/verify-build`; conditional authoring rule). Re-weighed to medium. |
| 1.0.0 | 2026-10-02 | First draft (small). |

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | When `/plan`'s source already carries acceptance criteria, its scope is locked: every criterion is carried verbatim with its id, nothing is added, reworded, merged, narrowed or widened, and a criterion that looks wrong becomes an owner-only open question quoting the spec line. | owner, 2026-10-02 (investigation record) |
| O2 | `/plan` splits such work: independent low-risk findings go to a `/sweep` list built first, and only the coupled core gets a TRD; every criterion lands in exactly one of the two, checked mechanically, or the plan stops. | owner, 2026-10-02 (investigation record) |
| O3 | The swept criteria are verified before the core is built, passed verbatim as criteria to the verification loop with no derive step, in one run grouped by surface; a failure goes back through `/sweep`, never into the TRD. | owner, 2026-10-02 (investigation record) |
| O4 | The core's verification proves only the core's criteria, taken verbatim from the locked spec rather than re-derived. | owner, 2026-10-02 (investigation record) |

## Intended Change

Measured case: lightning-lane Item 4 (roadmap `### Acceptance criteria`, 18 criteria and 2
regression guards). `/plan` wrote 29 objectives plus four unasked consolidations and put all 26
findings through one TRD (33 tasks, a 2 h 41 min live-check phase, a 40-criterion verification).
About 20 findings were independent one-file fixes.

After this change:

1. **A library reads, writes and checks the criteria** (`packages/core/lib/spec-scope.js`):
   - **Reads, scoped.** `extract(markdown, { section })` reads only the named section (its
     heading to the next heading of the same or higher level), and inside it only list items and
     table rows under a heading containing "Acceptance criteria". A criterion is a bolded id
     (letters, dash, digits and dots; a colon inside the bold allowed) opening a list item or a
     table row's first cell. Its text is the first line plus deeper-indented continuation lines
     and nested sub-bullets, joined with single spaces, and includes the surface label (`Web
     desktop + Web phone width: …`); a trailing `*(Traces: …)*` is kept as `traces`, not text.
     Ids listed under a "Regression guards" lead-in are `kind: 'guard'`. It also reads the
     section's "Verification" subsection, expanding ranges ("AC-4.1 to AC-4.3"), into a map of
     id → verification line. Nothing found → `[]`, and the commands behave as today.
   - **Writes.** `render-objectives` produces the TRD's Objectives rows and `render-sweep`
     the sweep list's items, each from ids alone, with the text copied by the library (`|`
     escaped in table cells). The model chooses ids; it never types criterion text.
   - **Checks the written documents.** `check --spec <path> --section <s> --sweep <file>
     --trd <file>` reads all three: core = every id in the TRD's `## Objectives` table, sweep =
     every id in the sweep file; it reports `missing` (a spec criterion in neither), `duplicated`
     (in both), `added` (an Objectives row whose id is not a spec criterion), `reworded` (a row
     or item whose text, whitespace-collapsed, differs from the spec's), and `noHeader` (the TRD
     lacks `**Source spec**:`). Guards are ignored by the split. `ok` only when all are empty.
   - **Turns criteria into a success definition.** `criteria --spec <path> --section <s> --ids
     <ids>` writes a whole `success-definition.md` (header lines included) whose rows are those
     criteria verbatim plus every guard, ordered by surface; Evidence quotes the spec's
     verification line for the id (blank when none); Tier 1 is `judge-only` when that line names
     a screenshot, else `locator`.
   - **Checks file overlap.** `overlap --sweep-files <list> --trd <file>` reports any swept file
     the TRD's grounding also touches.
2. **The authoring rule, conditional.** `trd-authoring.md`: when a TRD carries a `**Source
   spec**:` header, its objectives are the spec's criteria verbatim with their ids, no others;
   swept criteria are listed under Non-Goals as "handled by `/sweep <file>`"; a criterion that
   looks wrong is an owner-only open question quoting the spec line. TRDs without the header,
   including every PRD-sourced TRD, are unchanged.
3. **`/plan`'s spec path.** When `extract` finds criteria in the source:
   - the exit test passes `prdWouldHaveContent: false` (the intent is settled);
   - each criterion is classified sweep or core by the owner's rule; uncertain, guarded, or
     open-question criteria stay in the core; Step 4 weighs the core only;
   - the sweep list (`docs/plan/<slug>.sweep.md`, naming the spec, section and core TRD) and the
     core TRD's Objectives are written by `render-sweep` / `render-objectives`; the investigation
     record (medium) lists only core criteria;
   - `check` runs after the last writer (after `audit-trd` at medium, after Step 6 at small) and
     a failure stops the plan, naming each problem;
   - all criteria swept → no TRD; all core → no sweep file;
   - with a sweep list written, `plan()` is called with `implement: false` and DECISIONS says the
     sweep is built, verified and committed first;
   - NEXT, in order: `/sweep docs/plan/<slug>.sweep.md`; verify the sweep with `/verify-build
     docs/plan/<slug>.sweep.md`; commit the swept fixes (the owner's split); `/implement-trd
     docs/TRD/<slug>.md`.
4. **`/sweep` keeps every criterion accounted for.** When its list carries criterion ids
   (`extract` finds them), triage uses each criterion id as the item id (`sweep.js`), deferred
   items keep their id, and after Step 3's attestation `/sweep` checks every criterion id landed
   in fixed / already fine / failed. A deferred or too-big criterion ends the run `COMMAND STUCK:
   /sweep` ("<id> is not a sweep item — re-run /plan to move it to the core"). It also runs
   `overlap` against the core TRD and stops on any shared file. Lists without criterion ids
   behave as today.
5. **`/verify-build` verifies a sweep list or a spec-sourced TRD without deriving.** Given a
   sweep file, or a TRD with `**Source spec**:`, step 3a writes `success-definition.md` with
   `spec-scope.js criteria` (swept ids, or the TRD's Objectives ids) instead of dispatching the
   derive agent. A sweep file runs under feature `<slug>-sweep` (all state in
   `.trd-state/<slug>-sweep/`) with `cap: 1` — capture and judge only, no debug — so failures go
   back through `/sweep`. `contracts/functional-verification.md` gains `spec` as a source kind.
6. **`/implement-trd` verifies the core against the locked criteria.** §3.6 step 1: a TRD with
   `**Source spec**:` writes its success definition with `spec-scope.js criteria` over its
   Objectives ids, sets `source_kind: "spec"`, and dispatches no derive agent; §8.1b reads the
   spec section as its source text.

## Decision

- **The library writes the copied text; the model only picks ids.** Verbatim then holds by
  construction; `check` guards against later edits by other writers. A model copying text is the
  step that turned 18 criteria into 29 objectives.
- **Extraction is anchored to the section and its "Acceptance criteria" heading.** Findings,
  task rows and other items use the same bold-id shape; only the heading tells them apart.
- **Checks read the documents, not the model's lists.** Otherwise an added objective passes.
- **The sweep is verified through `/verify-build`, not a new dispatch in `/sweep`.** One copy of
  the verification dispatch, not three; `/sweep` changes only to account for criteria.
- **One iteration, no debug, for the sweep's verification.** A failure is a sweep item that did
  not work; it goes back through `/sweep`, never fixed in place by the verification loop.
- **The owner commits between sweep and core.** `/sweep` never commits, and `/implement-trd`
  needs a clean tree and commits phases with `git add -A`; an uncommitted sweep would be stashed
  away or folded into the core's commit.
- **Uncertain, guarded and open-question criteria stay in the core.** Misclassifying a risky item
  as sweepable is the expensive error.
- **Guards hold for both:** they join both verification runs and are outside the split.
- **The rule binds only TRDs with `**Source spec**:`.** PRD-sourced TRDs keep the typing rule's
  constitution- and domain-derived objectives (`trd-authoring.md:21, 49-54`). The standard path
  is backlog item 25.
- not absorbed: "Done when" is not verified separately; it restates criteria already listed.

## Non-Goals

- No change when the source has no criteria under an "Acceptance criteria" heading.
- No change to PRD-sourced TRDs or `/create-trd`'s behaviour (backlog item 25).
- No new verification mechanism: the existing workflow, fed criteria from the library.
- No automatic sweep/core classification by code analysis: the split is `/plan`'s judgement,
  checked for completeness and file overlap, not for correctness.
- "Done when" lines are not turned into criteria.

## Verification Artifacts

None apply — a library and command prompt text; no screens, journeys or data views.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | New `packages/core/lib/spec-scope.js` with `extract`, `renderObjectives`, `renderSweep`, `check`, `criteria`, `overlap` and a CLI for each; Jest tests; `.claude/lib/` mirror; `packages/full/lib` symlink | O1, O2, O3, O4 | None | Tests on a fixture copied verbatim from lightning-lane Item 4 (Issues addressed, Acceptance criteria with guards, Verification, Done when): `extract` yields exactly AC-4.1…AC-4.18 plus guards RG-4.1, RG-4.2, none of the W-/WM-/M- findings, text including the surface, ranges expanded in the verification map; a wrapped criterion and one containing a pipe character round-trip through render and check; `check` reports missing, duplicated, added, reworded and noHeader by id and is ok only when all are empty; `criteria` writes a definition whose rows match the spec text, carry guards, and mark the Simulator-screenshot criterion judge-only; `overlap` reports a shared file |
| FIX-002 | `trd-authoring.md` (core and `.claude/contracts/` mirror): the conditional locked-scope rule beside "Omission is a failure too" | O1 | FIX-001 | A command-surface test asserts the rule applies only with `**Source spec**:`, names verbatim criteria with ids, no other objectives, swept ids under Non-Goals, and an owner-only open question quoting the spec line; mirror byte-identical |
| FIX-003 | `plan.md` (core and mirror): the spec path — exit test false, classify, uncertain/guard/open-question to core, weigh the core, write via `render-sweep`/`render-objectives`, `check` after the last writer, all-swept/all-core cases, `implement: false` with a sweep list, NEXT in four ordered steps | O1, O2 | FIX-001 | Command-surface tests assert each of those statements, including `check` placed after `audit-trd` and after Step 6, and NEXT ordering sweep → verify sweep → commit → implement; mirror byte-identical |
| FIX-004 | `sweep.js` and `sweep.md` (core and mirrors): criterion ids as triage ids, deferred items keep ids, every criterion accounted for after attestation, STUCK on a deferred or too-big criterion, `overlap` against the core TRD; unchanged without criterion ids | O2, O3 | FIX-001 | `sweep.js` tests: with criterion ids the triage prompt requires them as ids and deferred items carry them; `sweep.md` command-surface tests assert the accounting, the STUCK wording and the overlap stop; existing sweep tests pass; mirrors byte-identical |
| FIX-005 | `verify-build.md` (core and mirror): step 3a accepts a sweep file or a `**Source spec**:` TRD and writes the definition with `spec-scope.js criteria`, no derive; a sweep file runs as `<slug>-sweep` with `cap: 1`; `contracts/functional-verification.md` (core and mirror) adds source kind `spec` | O3, O4 | FIX-001 | Command-surface tests assert the no-derive branch for both inputs, the `-sweep` feature and `cap: 1` for a sweep file, and the contract's `spec` source kind; mirrors byte-identical |
| FIX-006 | `implement-trd.md` §3.6 step 1 and §8.1b (core and mirror): a `**Source spec**:` TRD writes its definition with `spec-scope.js criteria` over its Objectives ids, `source_kind: "spec"`, no derive agent; §8.1b's source text is the spec section | O4 | FIX-001 | Command-surface tests assert the header check, the library call, `source_kind: "spec"` and the skipped derive in that case only; mirror byte-identical |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/spec-scope.js`, `packages/core/lib/spec-scope.test.js`, `.claude/lib/spec-scope.js`, `packages/full/lib/spec-scope.js`
- **Reuse:** CLI shapes of `audit-rounds.js` (subcommand plus JSON) and `live-evidence.js` (flags) [read]; the success-definition format at `contracts/functional-verification.md:68-81` [read]; `trd-parser.js`'s section finder for reading the TRD's Objectives table [read]
- **Follow:** `packages/full/lib/*.js` are relative symlinks into `packages/core/lib` [ran]; the fixture is copied verbatim from `lightning-lane/docs/plans/trip-management-correction-roadmap.md` Item 4 (`### Issues addressed` ~1009, `### Acceptance criteria` 1201-1232, `### Verification` 1234-1239, `### Done when` 1248-1250) — never modify that repo [read]
- **Careful:** findings use the same bold-id shape (roadmap:1015) — only the "Acceptance criteria" heading distinguishes criteria [read]; guards are `- **RG-4.1:** …` with the colon inside the bold [read]; verification lines use ranges [read]

### FIX-002
- **Touches:** `packages/core/contracts/trd-authoring.md`, `.claude/contracts/trd-authoring.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** "Omission is a failure too" (`trd-authoring.md:72-80`) [read]
- **Careful:** the typing rule allows constitution- and domain-derived objectives (`:21`, `:49-54`); the new rule must not apply without the header [read]

### FIX-003
- **Touches:** `packages/core/commands/plan.md`, `.claude/commands/plan.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** Step 2 (`plan.md:156-288`), Step 3's `route()` (`:303-320`), the light-TRD template (`:470-560`), the medium path's writers (`:784-790` create-trd, `:889` Step 6, `:829-830` audit-trd), Step 7's `plan()` call (`:931`, `:943-948`) [read]
- **Careful:** `--implement` is honoured at every weight; a sweep list must suppress the chain by passing `implement: false` [read]

### FIX-004
- **Touches:** `packages/core/workflows/sweep.js`, `.claude/workflows/sweep.js`, `packages/core/workflows/sweep.test.js`, `packages/core/commands/sweep.md`, `.claude/commands/sweep.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** triage's schema and id hint (`sweep.js:105-146`, id example at `:130`), the fixer's `too-big` status (`:208-210`), `files_changed` in the result (`:286`); `sweep.md` Step 3 attestation (`:57-73`) [read]
- **Careful:** `/sweep` never commits (`sweep.md:141`) [read]; `sweep.test.js` exists [ran]

### FIX-005
- **Touches:** `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/contracts/functional-verification.md`, `.claude/contracts/functional-verification.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** step 3a (`verify-build.md:118-128`), step 3's "present → use it" (`:94-95`), the `cap` argument (`:206`), the contract's source kinds (`functional-verification.md:72`) [read]
- **Careful:** a stale `success-definition.md` in `.trd-state/<slug>/` is reused as-is (`:94-95`), which is why the sweep runs as `<slug>-sweep` [read]

### FIX-006
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** §3.6 step 1 (`implement-trd.md:711-760`) and §8.1b step 1 [read]
- **Careful:** `functional_verification` still needs `prd_resolved`, `source_kind` and `prd_path` set [read]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| `/plan` classifies sweep versus core correctly | Model judgement; `check` proves completeness and `overlap` proves no shared files, not that each item belongs where it landed |
| Specs other than lightning-lane's put criteria under an "Acceptance criteria" heading | Only that roadmap was read; another format yields no criteria and today's behaviour |
| The sweep-then-core order saves the build time the owner expects | Unmeasured until a real run (backlog item 25 names what to record) |
