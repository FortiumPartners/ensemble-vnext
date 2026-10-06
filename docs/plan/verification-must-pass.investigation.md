# Investigation: verification-must-pass

**Kind**: change
**Weight**: medium
**Route**: plan

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A plan can mark objectives as "must pass": the true core functionality of the feature | your instruction, 2026-10-05: "The plan needs a way to identify items that are 'must pass'—the true core functionality" |
| O2 | The must-pass marking is carried into the success definition, so verification knows which criteria are must-pass | your instruction, 2026-10-05 (/plan argument): "carried into the success definition" |
| O3 | Verification cannot end `satisfied` unless every must-pass criterion is `met`, whatever the coverage-floor percentage | your instruction, 2026-10-05: "verification cannot pass without them regardless of %" |
| O4 | A must-pass criterion that is `not_verifiable` (or `not_met`, or `unbuilt`) blocks `satisfied` exactly as a missing one would | your instruction, 2026-10-05 (/plan argument): "regardless of not-verifiable status" |
| O5 | When verification is blocked by must-pass criteria, the report and the readout name each blocking criterion, so the owner sees which core item was not proven | domain-derived from O3: a block nobody can trace is the failure this replaces (owner: "verification satisfied level doesn't make sense in practice") |

## Intended Change

**Before** (checked 2026-10-05):

- `decideNext` in `packages/core/lib/functional-verification.js` returns `exit-satisfied` whenever
  no criterion is `not_met` and none is `unbuilt`: "every criterion is met or not verifiable here".
  A `not_verifiable` criterion never blocks. The only other gate is the coverage floor
  (`verification.md` §5a), one percentage over all criteria, which re-labels the exit to
  `insufficient-coverage`. [read]
- 14 of the last 15 verified features in this repository ended `satisfied`
  (`.trd-state/*/verification-report.md`). On `docs-as-built` the two criteria that proved the
  feature's core (FS-18, FS-20: the live review behaviour) were `not_verifiable`, and the run still
  read "Satisfied (2 of 30 not verifiable)". [ran]
- Nothing marks any objective or criterion as more important than another: the TRD Objectives
  table (`| ID | Objective | Source |`, written by `/plan`, `create-trd` and `spec-scope.js
  render-objectives`) and the success-definition table (`| ID | Functional statement | Cites |
  Evidence that would prove it | Derivation | Tier 1 | Parts |`) carry no priority. [read]

**After:**

1. The TRD Objectives table can mark an objective must-pass. The plan author (or the owner)
   marks it; an unmarked objective is ordinary.
2. The success definition carries the marking per criterion, and every must-pass objective is
   covered by at least one must-pass criterion. A must-pass objective with no criterion is
   reported, not silently dropped.
3. A run whose criteria are otherwise all met or not verifiable, but with any must-pass criterion
   not `met`, does not end `satisfied`. It ends with a distinct outcome that names each unproven
   must-pass criterion. The coverage floor still applies, separately, over all criteria.
4. The block is enforced deterministically by the workflow after the Judge returns, not only by
   the Judge's own call, because the Judge is a model and the workflow already recomputes what it
   can (`computeFinalRun`, `OUTCOME_BY_ACTION`).
5. The readouts of `/implement-trd` and `/verify-build` and the rendered report name the
   unproven must-pass criteria, and NEXT routes the new outcome the way it routes the other
   non-satisfied ones (to `/refine-verification`, then `/verify-build`).

A criterion that would read the same if the change did nothing is not one: the decisive test is a
definition whose must-pass criterion is `not_verifiable` while all others are met — today it ends
`satisfied`, after this change it must not.

## Decision

- **Where the marking lives:** a `Must pass` column on the TRD Objectives table, and a matching
  `Must pass` column on the success-definition table. The objectives table is the plan's own
  statement of intent, which is where the owner asked for the marking; the definition is what
  verification reads.
- **How it crosses into the definition without breaking the deriver's isolation:** the deriver is
  given only the source (PRD or TRD section) and nothing of the plan, so it cannot invent criteria
  the plan satisfies by construction (functional-verification TRD D5). It is now also given the
  must-pass objectives' statements, as text only — no tasks, no TRD path — and marks the criteria
  that prove each one, naming the objective. On the spec path, where criteria ids are the
  objective ids, `spec-scope.js criteria` copies the marking deterministically. A command-side
  check then confirms every must-pass objective is covered.
- **The new outcome** is computed in `decideNext` and re-checked in `verify-functional.js` after
  the Judge returns. Rejected: folding it into `insufficient-coverage`, which is a percentage
  statement and would hide which core item failed — the exact complaint.
- **No must-pass objective marked** keeps today's behaviour and adds one readout line saying none
  was declared. Rejected: requiring a marking, which would stop every existing TRD from verifying.

not absorbed: the "(no full-environment run declared)" suffix on every report — separate wording fix.
not absorbed: text-only proof counting the same as exercised proof for ordinary criteria — separate; see OQ-1 for must-pass only.

## Grounding

- `packages/core/lib/functional-verification.js` — `decideNext` (exit order: unbuilt, satisfied,
  stalled, stuck, remediate; then the coverage re-label over `COVERAGE_RELABELABLE_ACTIONS`);
  `renderReport` (outcome labels at `satisfied: 'Satisfied'`, the not-verifiable suffix, the
  Diagnosis/Next lines for non-satisfied outcomes); the CLI `decide-next`. [read]
- `packages/core/workflows/verify-functional.js` — the Judge prompt names the five exit actions and
  `decide-next`; `JUDGE_SCHEMA` enumerates them; `OUTCOME_BY_ACTION` maps action to outcome;
  `buildFinalResult` and `coverageOf` assemble the return; `computeFinalRun` is the precedent for
  recomputing rather than trusting the Judge. [read]
- `packages/core/contracts/functional-verification.md` — the success-definition table format and
  the deriver's rules (citation, Tier 1, Parts). [read]
- `packages/core/commands/implement-trd.md` §3.6 (derive dispatch, carries the source only), §8.1
  (parses the definition table into `criteria`, column by column), §9 readout; and
  `packages/core/commands/verify-build.md` (same derive and parse). [read]
- `packages/core/lib/spec-scope.js` `criteria()` writes the definition on the spec path with the
  same column set; `render-objectives` writes the TRD Objectives table. [read]
- `packages/core/commands/plan.md` (light TRD and investigation-record Objectives templates),
  `packages/core/workflows/create-trd.js` and `packages/core/contracts/trd-authoring.md`
  (objectives authoring). [read]
- `packages/core/lib/trd-parser.js` parses the Objectives table; a new column must not break it. [inferred]
- Every file naming the outcome list: implement-trd.md, verify-build.md,
  functional-verification.md, functional-verification.js, verify-functional.js, and the
  `verification.md` template. Each needs the new outcome. [ran]
- Hazards: `.claude/` mirrors must stay byte-identical; `refine-verification` reads outcomes to
  diagnose; `audit-build` reads the report's outcome line. [inferred]

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Does a must-pass criterion proven only by finding the instruction in a prompt file (no behaviour exercised) count as `met`? On prompt-only features that is often the only proof available. | Yes, it counts, but the report labels a text-only must-pass proof as such so it is visible. | owner-only |
| OQ-2 | Should a plan with no must-pass objective be allowed? | Yes: today's behaviour plus a readout line saying none was declared. | owner-only |
