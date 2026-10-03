# TRD: plan-from-spec

**Source PRD**: None — change decided in session; source record `docs/plan/plan-from-spec.investigation.md`
**Kind**: change
**Weight**: medium (re-weighed from small after the adversarial review, 2026-10-02)

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.3.0 | 2026-10-02 | Owner ruling on O4 (option B): the core's verification includes the swept criteria and reuses the sweep's captured evidence while each swept fix's files are byte-identical. FIX-004 persists per-item changed files; FIX-005 records the sweep's proven evidence in the core feature's live-evidence manifest; FIX-006 puts the swept criteria into the core's success definition. |
| 1.2.0 | 2026-10-02 | `/audit-trd`: sweep eligibility rule stated verbatim; `plan()` gains a sweep path (it hard-coded "re-run with --implement" and a TRD); `/verify-build`'s report and readout name the sweep's own next steps, no fix loop; the library rewrites the Objectives table and `**Source spec**:` header after the last model writer; header and sweep-file formats defined; guards placed in both documents; O4's source quoted; why FIX-002…FIX-006 stay split. |
| 1.1.0 | 2026-10-02 | Adversarial review: 17 findings applied (section-scoped extraction; library writes copied text; checks read documents; sweep deferral, commit order and `--implement` ordering; guards; verification through `/verify-build`; conditional authoring rule). Re-weighed to medium. |
| 1.0.0 | 2026-10-02 | First draft (small). |

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | When `/plan`'s source already carries acceptance criteria, its scope is locked: every criterion is carried verbatim with its id, nothing is added, reworded, merged, narrowed or widened, and a criterion that looks wrong becomes an owner-only open question quoting the spec line. | owner, 2026-10-02 (investigation record) |
| O2 | `/plan` splits such work: independent low-risk findings go to a `/sweep` list built first, and only the coupled core gets a TRD; every criterion lands in exactly one of the two, checked mechanically, or the plan stops. | owner, 2026-10-02 (investigation record) |
| O3 | The swept criteria are verified before the core is built, passed verbatim as criteria to the verification loop with no derive step, in one run grouped by surface; a failure goes back through `/sweep`, never into the TRD. | owner, 2026-10-02 (investigation record) |
| O4 | The core's verification covers every criterion, core and swept, verbatim from the locked spec rather than re-derived; it reuses the sweep's captured evidence for each swept criterion while the files that criterion's fix changed are byte-identical, and re-proves any whose files the core changed. | owner, 2026-10-02, request item (3): "so the core's verification reuses that evidence and proves only the core's criteria", clarified the same day as option B: carry the sweep's evidence forward rather than skip the swept criteria |

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
     id → verification line. Nothing found → `[]`, and the commands behave as today. With no
     `section`, `extract` reads the whole document (how a sweep file is read).
   - **Names its source in one format.** The header is `**Source spec**: <path> § <section
     heading text>`, the path relative to the repository holding the document. `source --file
     <doc>` returns `{spec, section}` from a TRD, investigation record or sweep file (plus
     `coreTrd` for a sweep file), or exits
     non-zero when the header is absent or does not parse. Every consumer (`/sweep`,
     `/verify-build`, `/implement-trd`) gets the spec and section from `source`, never by reading
     the line itself.
   - **Writes.** `render-sweep` writes the whole sweep file: the `**Source spec**:` header, a
     `**Core TRD**: docs/TRD/<slug>.md` line (or `none`), the swept criteria as list items under
     `## Acceptance criteria`, then every guard under a `**Regression guards:**` lead-in, so that
     `extract` with no section reads it back as items plus guards. `render-objectives --trd <file>`
     rewrites the TRD in place: it replaces the `## Objectives` table with one row per core
     criterion and then one per guard, and sets the `**Source spec**:` line under the title,
     changing nothing else. The text is copied by the library (`|` escaped in table cells). The
     model chooses ids; it never types criterion text.
   - **Checks the written documents.** `check --spec <path> --section <s> --sweep <file>
     --trd <file>` reads all three: core = every criterion id in the TRD's `## Objectives` table,
     sweep = every criterion id in the sweep file; it reports `missing` (a spec criterion in
     neither, or a guard absent from the TRD's Objectives), `duplicated` (a criterion in both),
     `added` (an Objectives row whose id is neither a spec criterion nor a guard), `reworded` (a
     row or item whose text, whitespace-collapsed, differs from the spec's), and `noHeader` (the
     TRD's `**Source spec**:` line is absent or does not parse). Guards are outside the split:
     they are never `duplicated`. `ok` only when all are empty.
   - **Turns criteria into a success definition.** `criteria --spec <path> --section <s> --ids
     <ids>` writes a whole `success-definition.md` (header lines included) whose rows are those
     criteria verbatim plus every guard, ordered by surface; Evidence quotes the spec's
     verification line for the id (blank when none); Tier 1 is `judge-only` when that line names
     a screenshot, else `locator`.
   - **Checks file overlap.** `overlap --sweep-files <list> --trd <file>` reports any swept file
     the TRD's grounding also touches.
2. **The authoring rule, conditional.** `trd-authoring.md`: when a TRD, or the source it is
   authored from, carries a `**Source spec**:` header, its objectives are the spec's core
   criteria and its guards verbatim with their ids, no others; swept criteria are listed under
   Non-Goals as "handled by `/sweep <file>`"; a criterion that looks wrong is an owner-only open
   question quoting the spec line. TRDs without the header, including every PRD-sourced TRD,
   are unchanged.
3. **`/plan`'s spec path.** When `extract` finds criteria in the source:
   - the exit test passes `prdWouldHaveContent: false` (the intent is settled);
   - each criterion is classified sweep or core by the owner's rule: a criterion is swept only
     when its fix is an independent low-risk finding — "no file shared with the core, no
     dependency on it, no auth/data/shared-contract change" (owner's request, item 2).
     Uncertain, guarded, or open-question criteria stay in the core. Step 4 weighs the core only;
   - the sweep list (`docs/plan/<slug>.sweep.md`) is written by `render-sweep`; the investigation
     record (medium) carries the `**Source spec**:` header and lists only core criteria;
   - after the last model writer (after `audit-trd` at medium, after Step 6's findings are
     applied at small), `render-objectives --trd` rewrites the core TRD's Objectives table and
     header, then `check` runs; a failure stops the plan, naming each problem;
   - all criteria swept → no TRD; all core → no sweep file;
   - with a sweep list written, `plan()` is called with `sweepList` and `coreTrd` set. It never
     chains (even with `--implement`), writes no state pointer, keeps a TRD only when `coreTrd`
     is true, and its banner gives NEXT in order: `/sweep docs/plan/<slug>.sweep.md`; verify the
     sweep with `/verify-build docs/plan/<slug>.sweep.md`; commit the swept fixes (the owner's
     split); `/implement-trd docs/TRD/<slug>.md` (omitted when no core TRD). DECISIONS says the
     sweep is built, verified and committed first.
4. **`/sweep` keeps every criterion accounted for.** When its list carries criterion ids
   (`extract` with no section finds them), triage uses each criterion id as the item id (`sweep.js`), deferred
   items keep their id, and after Step 3's attestation `/sweep` checks every criterion id landed
   in fixed / already fine / failed. A deferred or too-big criterion ends the run `COMMAND STUCK:
   /sweep` ("<id> is not a sweep item — re-run /plan to move it to the core"). It also runs
   `overlap` against the core TRD named on its `**Core TRD**:` line (skipped for `none`) and
   stops on any shared file. Lists without criterion ids behave as today.
5. **`/verify-build` verifies a sweep list or a spec-sourced TRD without deriving.** Given a
   sweep file, or a TRD with `**Source spec**:`, step 3a writes `success-definition.md` with
   `spec-scope.js criteria` (swept ids, or the TRD's Objectives ids) instead of dispatching the
   derive agent. A sweep file runs under feature `<slug>-sweep` (all state in
   `.trd-state/<slug>-sweep/`) with `cap: 1` — capture and judge only, no debug — so failures go
   back through `/sweep`. For a sweep file the fix loop (the `/refine-verification` plan and its
   `/implement-trd --reconcile --chained` rounds) never runs, and `prd_path` is the sweep file.
   Its report and readout name the sweep's own next steps instead of the general rule
   (satisfied → `/audit-build`, otherwise → `/refine-verification`): `renderReport`, given a
   `prd` ending in `.sweep.md`, writes satisfied → "commit the swept fixes, then build the core
   TRD named on the sweep file's `**Core TRD**:` line"; any other outcome → "re-run `/sweep
   <file>` for the failed criteria, then `/verify-build <file>`". The readout's NEXT says the
   same as literal commands: it resolves the core TRD with `spec-scope.js source` (which also
   returns `coreTrd` for a sweep file) and drops the `/implement-trd` step when it is `none`. `contracts/functional-verification.md` gains `spec` as
   a source kind.
6. **`/implement-trd` verifies the core against the locked criteria.** §3.6 step 1: a TRD with
   `**Source spec**:` writes its success definition with `spec-scope.js criteria` over its
   Objectives' criterion ids (guards are added by `criteria` itself), taking spec and section
   from `spec-scope.js source`, sets `source_kind: "spec"`, and dispatches no derive agent;
   §8.1b reads the spec section as its source text.

## Decision

- **The library writes the copied text; the model only picks ids.** Verbatim then holds by
  construction; `check` guards against later edits by other writers. A model copying text is the
  step that turned 18 criteria into 29 objectives. *Alternative rejected:* passing the rendered
  rows into `Workflow(create-trd)` for its author to place; `audit-trd` rewrites sections after
  it, so the text would again pass through model writers.
- **At medium weight the library writes last.** `create-trd`'s author types a whole TRD from
  its `**Source PRD**` template, and `audit-trd` then edits it, so `render-objectives --trd`
  overwrites the Objectives table and sets the `**Source spec**:` header after both, and `check`
  follows. The same order holds at small, after Step 6.
- **One header format, parsed in one place.** `**Source spec**: <path> § <section>`, read only by
  `spec-scope.js source`, so three consumers cannot each parse it differently. *Alternative
  rejected:* separate `**Source spec**:` and `**Spec section**:` lines; that is two lines to
  keep in step.
- **Extraction is anchored to the section and its "Acceptance criteria" heading.** Findings,
  task rows and other items use the same bold-id shape; only the heading tells them apart.
- **Checks read the documents, not the model's lists.** Otherwise an added objective passes.
- **The sweep is verified through `/verify-build`, not a new dispatch in `/sweep`.** One copy of
  the verification dispatch, not three; `/sweep` changes only to account for criteria.
- **One iteration, no debug, for the sweep's verification.** A failure is a sweep item that did
  not work; it goes back through `/sweep`, never fixed in place by the verification loop. The
  report and readout say so: a sweep run never points at `/refine-verification` or
  `/audit-build`, and the fix loop is skipped, because its `--reconcile` round would hand a
  sweep file to `/implement-trd` as if it were a TRD.
- **`plan()` owns the sweep path's ending, not the prose.** Step 7 does "exactly what `plan()`
  returns", and with `implement: false` today it returns "re-run with --implement" and a TRD at
  `docs/TRD/<slug>.md` (`fix-plan.js:130-147,163-181`), which contradicts the four-step order and
  the no-TRD case. *Alternative rejected:* overriding the banner in `plan.md`; that reopens the
  disagreeing-prose problem `plan()` exists to end.
- **The owner commits between sweep and core.** `/sweep` never commits, and `/implement-trd`
  needs a clean tree and commits phases with `git add -A`; an uncommitted sweep would be stashed
  away or folded into the core's commit.
- **Uncertain, guarded and open-question criteria stay in the core.** Misclassifying a risky item
  as sweepable is the expensive error.
- **Guards hold for both:** they join both verification runs and are outside the split. They are
  written into both documents, as Objectives rows in the core TRD and under `**Regression
  guards:**` in the sweep file, so each implementer is told they exist. `check` requires them in
  the TRD and never counts them as `added` or `duplicated`.
- **The core's verification carries the sweep's evidence forward (O4, owner ruling 2026-10-02,
  option B).** The sweep's verification records each proven criterion's artifact in the core
  feature's live-evidence manifest (`.trd-state/<slug>/evidence/live-manifest.jsonl`), covering
  the files that criterion's fix changed. The core's success definition includes the swept
  criteria, and the evidence checker reuses each artifact while those files are byte-identical,
  so nothing is captured twice when the split was right, and a swept criterion is re-proven if
  the core did touch its files. That turns the split from a rule we trust into one checked at the
  end. *Alternative rejected:* leaving the swept criteria out of the core's run and standing on
  the sweep's report; nothing would ever check that the split was right.
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
| FIX-001 | New `packages/core/lib/spec-scope.js` with `extract`, `source`, `renderObjectives`, `renderSweep`, `check`, `criteria`, `overlap` and a CLI for each; Jest tests; `.claude/lib/` mirror; `packages/full/lib` symlink | O1, O2, O3, O4 | None | Tests on a fixture copied verbatim from lightning-lane Item 4 (Issues addressed, Acceptance criteria with guards, Verification, Done when): `extract` yields exactly AC-4.1…AC-4.18 plus guards RG-4.1, RG-4.2, none of the W-/WM-/M- findings, text including the surface, ranges expanded in the verification map; a sweep file written by `render-sweep` reads back through `extract` with no section as its items plus the guards; `source` returns spec, section and (for a sweep file) core TRD, and exits non-zero on an absent or malformed header; `render-objectives --trd` replaces only the Objectives table and the header line of a TRD fixture (rest byte-identical) and writes guard rows; a wrapped criterion and one containing a pipe character round-trip through render and check; `check` reports missing (including a guard absent from the TRD), duplicated, added, reworded and noHeader (absent or unparseable) by id, never flags a guard as added or duplicated, and is ok only when all are empty; `criteria` writes a definition whose rows match the spec text, carry guards, and mark the Simulator-screenshot criterion judge-only; `overlap` reports a shared file |
| FIX-002 | `trd-authoring.md` (core and `.claude/contracts/` mirror): the conditional locked-scope rule beside "Omission is a failure too" | O1 | FIX-001 | A command-surface test asserts the rule applies only when the TRD or its source carries `**Source spec**:`, names verbatim core criteria and guards with ids, no other objectives, swept ids under Non-Goals, and an owner-only open question quoting the spec line; mirror byte-identical |
| FIX-003 | `plan.md` (core and mirror) and `fix-plan.js` (core and mirror): the spec path. In `plan.md`: exit test false; classify by the owner's stated rule (no shared file, no dependency on the core, no auth/data/shared-contract change); uncertain/guard/open-question to core; weigh the core; `render-sweep`; the investigation record carries the header; `render-objectives --trd` then `check` after the last model writer; all-swept/all-core cases; `sweepList`/`coreTrd` passed to `plan()`. In `plan()`: with `sweepList`, no chain and no pointer whatever `implement` says, `writeTrd` follows `coreTrd`, and the banner gives the four ordered steps | O1, O2 | FIX-001 | Command-surface tests assert each `plan.md` statement, including the three conditions of the classification rule and `render-objectives --trd` plus `check` placed after `audit-trd` and after Step 6; `fix-plan.test.js`: with `sweepList` and `implement: true` there is no chain and no pointer, the banner lists sweep → verify sweep → commit → implement in that order and contains no "re-run with --implement", and with `coreTrd: false` `writeTrd` is false and the banner omits `/implement-trd`; existing `fix-plan` tests pass; mirrors byte-identical |
| FIX-004 | `sweep.js` and `sweep.md` (core and mirrors): criterion ids as triage ids, deferred items keep ids, every criterion accounted for after attestation, STUCK on a deferred or too-big criterion, `overlap` against the core TRD, and each fixed criterion's changed files written to `.trd-state/<slug>-sweep/sweep-result.json` for FIX-005; unchanged without criterion ids | O2, O3, O4 | FIX-001 | `sweep.js` tests: with criterion ids the triage prompt requires them as ids and deferred items carry them; `sweep.md` names `sweep-result.json` with criterion id → changed files; `sweep.md` command-surface tests assert the accounting, the STUCK wording and the overlap stop; existing sweep tests pass; mirrors byte-identical |
| FIX-005 | `verify-build.md` (core and mirror): step 3a accepts a sweep file or a `**Source spec**:` TRD and writes the definition with `spec-scope.js criteria`, no derive; a sweep file runs as `<slug>-sweep` with `cap: 1`, `prd_path` set to the sweep file, no fix loop, and a readout NEXT of commit → `/implement-trd <core TRD>` when satisfied or `/sweep` → `/verify-build` otherwise; `renderReport` in `functional-verification.js` (core and mirror) writes that Next line for a `prd` ending in `.sweep.md`; `contracts/functional-verification.md` (core and mirror) adds source kind `spec`; after a satisfied sweep run, each `met` criterion's artifact is recorded in the core feature's live-evidence manifest, covering that criterion's changed files | O3, O4 | FIX-001 | Command-surface tests assert the no-derive branch for both inputs, the `-sweep` feature, `cap: 1`, the skipped fix loop and the sweep NEXT for a sweep file, and the contract's `spec` source kind; `verify-build.md` records each `met` swept criterion with `live-evidence.js record --state-dir .trd-state/<slug>` (the core feature), covers = that criterion's changed files from `sweep-result.json`; `functional-verification.test.js`: a sweep `prd` gets the sweep Next line for satisfied and for stuck, never `/refine-verification` or `/audit-build`, and a non-sweep `prd` keeps today's lines; mirrors byte-identical |
| FIX-006 | `implement-trd.md` §3.6 step 1 and §8.1b (core and mirror): a `**Source spec**:` TRD writes its definition with `spec-scope.js criteria` over its Objectives ids plus every id in `docs/plan/<slug>.sweep.md` when that file exists, `source_kind: "spec"`, no derive agent; §8.1b's source text is the spec section | O4 | FIX-001 | Command-surface tests assert the header check, the library call including the sweep file's ids, `source_kind: "spec"` and the skipped derive in that case only, and that §8.3's existing `liveEvidence` read is what lets the swept criteria reuse their evidence; mirror byte-identical |

FIX-002 to FIX-006 all touch `packages/core/commands/verify-command-surface.test.js`, so
`task-graph.js` serializes them in id order (file-conflict edges, `task-graph.js:18-22`); they
cannot run in parallel and cannot lose each other's edits. They stay separate tasks because each
changes a different command or contract with its own mirror and its own tests, and one task
spanning five surfaces would leave a single attestation covering all five.

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
- **Touches:** `packages/core/commands/plan.md`, `.claude/commands/plan.md`, `packages/core/lib/fix-plan.js`, `packages/core/lib/fix-plan.test.js`, `.claude/lib/fix-plan.js`, `packages/core/commands/verify-command-surface.test.js`
- **Owner:** `plan()` in `fix-plan.js` owns how `/plan` ends (Step 7: "do exactly what `plan()` returns, and nothing else"), so the sweep path's banner, chain and TRD decision belong there, not in `plan.md` prose [read]
- **Reuse:** Step 2 (`plan.md:156-288`), Step 3's `route()` (`:303-320`), the light-TRD template (`:470-560`), the medium path's writers (`:784-790` create-trd, `:889` Step 6, `:829-830` audit-trd), Step 7's `plan()` call (`:931`, `:943-948`) [read]; `finish()` and the `workBegins` exit (`fix-plan.js:130-147`, `:163-181`) [read]
- **Replaces:** the plan to pass `implement: false` when a sweep list exists. Through `finish()` that yields "re-run with --implement to build it" and always reports a TRD at `docs/TRD/<slug>.md` [read]
- **Careful:** `--implement` is honoured at every weight, and a sweep list must still suppress the chain; `packages/full/lib/fix-plan.js` is a symlink into core, not a separate copy [ran]

### FIX-004
- **Touches:** `packages/core/workflows/sweep.js`, `.claude/workflows/sweep.js`, `packages/core/workflows/sweep.test.js`, `packages/core/commands/sweep.md`, `.claude/commands/sweep.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** triage's schema and id hint (`sweep.js:105-146`, id example at `:130`), the fixer's `too-big` status (`:208-210`), `files_changed` in the result (`:286`); `sweep.md` Step 3 attestation (`:57-73`) [read]
- **Careful:** `/sweep` never commits (`sweep.md:141`) [read]; `sweep.test.js` exists [ran]

### FIX-005
- **Touches:** `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/contracts/functional-verification.md`, `.claude/contracts/functional-verification.md`, `packages/core/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `.claude/lib/functional-verification.js`, `packages/core/commands/verify-command-surface.test.js`
- **Owner:** `renderReport` owns the report's Next line (`functional-verification.js:846-870`), and `verify-build.md`'s readout rule mirrors it (`:249-263`), so the sweep's Next goes in both [read]
- **Reuse:** step 3a (`verify-build.md:118-128`), step 3's "present → use it" (`:94-95`), the `cap` argument (`:206`), the contract's source kinds (`functional-verification.md:72`) [read]; `decideNext` exits `stuck` before `remediate` once `iteration >= cap`, so `cap: 1` never dispatches Debug (`functional-verification.js:380-385`) [read]
- **Careful:** the fix loop chains `implement-trd <trd> --reconcile --chained` (`verify-build.md:330`, `:356`), which must not fire for a sweep file [read]
- **Careful:** a stale `success-definition.md` in `.trd-state/<slug>/` is reused as-is (`:94-95`), which is why the sweep runs as `<slug>-sweep` [read]; but the evidence record goes to the CORE feature's manifest (`.trd-state/<slug>/`), because that is where §8.3 of the core's run reads `liveEvidence` from [read]; `live-evidence.js record` resolves covered paths absolutely and adds the artifact itself to `covers` [ran]

### FIX-006
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** §3.6 step 1 (`implement-trd.md:711-760`) and §8.1b step 1 [read]
- **Careful:** `functional_verification` still needs `prd_resolved`, `source_kind` and `prd_path` set [read]

## Could Not Verify

State after `/audit-build` (2026-10-02; 5 of 5 verifiers reported; no PRD supplied). The audit checked the delivered code against this TRD and found every objective (O1–O4) built by its tasks (FIX-001…FIX-006) and covered by tests: the five suites those tasks touch pass (472 tests), and the functional verification run proved 25 of 25 criteria (`.trd-state/plan-from-spec/verification-report.md`). Those claims are no longer open. What remains is what a code audit cannot settle.

| Claim | Why not checked |
|-------|-----------------|
| O1–O4 say what the owner asked for, and nothing the owner asked for is missing | No source was supplied to `/audit-build`'s validation pass, so it did not run. This TRD's source is `docs/plan/plan-from-spec.investigation.md`; only traceability between this TRD and the code was checked |
| O4's "option B" reading (carry the sweep's evidence forward, re-prove only criteria whose files the core changed) is the owner's ruling | The ruling is recorded only in this TRD's changelog (v1.3.0); the investigation record quotes the original request (line 29) but not the clarification. Only the owner can confirm it |
| `/plan` classifies sweep versus core correctly | Model judgement; `check` proves completeness and `overlap` proves no shared files, but neither proves the "no dependency, no auth/data/shared-contract change" conditions, or that each item belongs where it landed |
| Specs other than lightning-lane's put criteria under an "Acceptance criteria" heading | Only that roadmap was used as a fixture; another format yields no criteria and today's behaviour |
| A reused swept criterion still holds after the core lands | By design the checker sees only the files that criterion's fix changed; a core change to a file it depends on but did not change leaves the evidence reused. Needs a live sweep-then-core run |
| The sweep-then-core order saves the build time the owner expects | Unmeasured until a real run (backlog item 25 names what to record) |
