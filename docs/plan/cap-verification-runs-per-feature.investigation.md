# Investigation: cap-verification-runs-per-feature

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-2 of workplan `storybook-framework-requests` (roadmap
`docs/plans/storybook-framework-requests/roadmap.md` on `main`, item 2, "Cap verification runs
per feature"). Requested by the Storybook PM (message b8002d99): *"Cap verification RUNS per
feature, not only rounds per run ... after 2 full runs, everything still open goes to one PM or
owner ruling (ship, fix one named thing, or drop it), with no third recovery plan."*

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every counted verification run of a feature is recorded in `.trd-state/<feature>/implement.json` as `functional_verification.runs`, one entry per run, and the count is carried across `/implement-trd`'s verification pass, `/verify-build`, `/refine-verification` and every `--resume` of either command — no command starts a fresh count, and resuming an interrupted run does not add a second entry for it | the PM's instruction (this /plan invocation, 2026-11-16) and roadmap item 2 brief | yes |
| O2 | When a feature already has as many counted runs as the limit allows, `/verify-build` (and `/implement-trd`'s own verification pass) starts no further run: it dispatches nothing, writes one ruling request listing everything still open, and ends on that request | the PM's instruction, 2026-11-16; roadmap item 2 acceptance "a third run is refused with a ruling request" | yes |
| O3 | When a feature has reached the limit, `/refine-verification` writes no `verification-plan.md`; it writes (or re-reads) the same ruling request and ends on it | the PM's instruction, 2026-11-16; roadmap item 2 acceptance "/refine-verification declines a third plan" | yes |
| O4 | A run that ends not satisfied and brings the count to the limit names the ruling request as its NEXT step, not `/refine-verification` | roadmap item 2 brief: "After 2 full runs ... stop recovering" | |
| O5 | The ruling request lists every criterion still open (in plain words, with its cause and how many runs it stayed open) and offers exactly three outcomes — ship as is, fix one named thing, drop it — each with the step that carries it out; it is addressed to the product PM, who may escalate to the owner | the PM's instruction, 2026-11-16; Decisions: "the ruling goes to the product PM, who may escalate: OWNER-CALL (PM, 2026-11-16)" | |
| O6 | The limit is a setting, `ensemble.verificationRunLimit` in `.claude/settings.json`, defaulting to 2 when absent; a refresh never overwrites an owner's value | the PM's instruction: "The limit is a setting defaulting to 2" | |
| O7 | Shipping or dropping an open criterion through the ruling leaves it filed as a defect issue in the project's tracker, as every other waived criterion is | standing owner rule, 2026-11-12: "ANY such requirements must be captured as issues" | yes |

## Intended Change

**Before** (confirmed by reading, 2026-11-16):

- Nothing counts verification runs. `packages/core/commands/verify-build.md:378` passes
  `cap: capArg ?? 3` — an iteration cap **inside one run**; its `--resume` section
  (`verify-build.md:660-662`) says that cap is "a total budget across every resume of one run,
  not a fresh budget each time". The fix loop (`verify-build.md:640-760`) bounds rounds per
  invocation by the plan's stop rule (`max-rounds: 3`). Nothing bounds how many times
  `/refine-verification` → `/verify-build` can be repeated: `verify-build.md:630-641` says
  "Refine, run, repeat".
- `/refine-verification` (`packages/core/commands/refine-verification.md`) always writes a
  plan when the latest run fell short.
- `implement.json`'s `functional_verification` holds `prd_resolved`, `source_kind`,
  `prd_path`, `target`, `environments` and (under the fix loop) `fix`
  (`implement-trd.md:1506-1521`, `verify-build.md:682`). `implement-trd.md:825-827` **replaces
  the whole object** at §3.6 on every run (`state.functional_verification = { prd_resolved: …
  }`), so any new key there would be wiped by the next `/implement-trd` run.

**After:**

1. One counted run = one dispatch of the `verify-functional` workflow over a feature's own
   success definition, started by `/implement-trd`'s verification pass (§8.3) or by a
   `/verify-build` invocation (its first dispatch; the fix loop's later rounds inside the same
   invocation belong to that one run). **Not counted:** a `--resume` (or the automatic
   resume of a state file whose `outcome` is `null`, `verify-build.md` step 1a.1) — it
   continues the run already counted; `--criteria` subset re-proofs (`/ship-build`'s custody
   re-verification, written under `reverify/`); a sweep file (its own `<slug>-sweep` feature,
   `cap: 1`, never refined); a rerun scope of `none` (nothing runs).
2. Each counted run appends `{ n, command, started_at, scope, outcome, finished_at }` to
   `functional_verification.runs` at dispatch, and fills `outcome`/`finished_at` when the
   workflow returns. Count = number of entries.
3. Before starting a counted run, the command asks the library whether one is allowed. When
   `runs.length >= limit`, the answer is no: the command dispatches nothing, renders the ruling
   request to `.trd-state/<feature>/ruling-request.md`, publishes/records it as an artifact
   like the verification report, and ends with `═══ COMMAND STUCK: /<command> ═══`,
   `Reason: verification run limit reached (<n> of <limit> runs)`, `Next:` the ruling request.
4. A run that ends not `satisfied` with `runs.length >= limit` writes the ruling request too,
   and its NEXT names the request instead of `/refine-verification`.
5. `/refine-verification` checks the same count first; at the limit it writes no plan, writes
   the ruling request, and ends STUCK the same way.
6. The ruling request's three outcomes and what carries each out:
   - **ship as is** — every open criterion is recorded as a waived (`[non-blocking] `) row via
     the existing `recordNonBlockingFollowups` path, so `waived-defects.js gate` files each as a
     defect issue before close; then `/audit-build`.
   - **fix one named thing** — the named criterion goes to `/amend` (one change to the feature
     in flight, grounded, verified); the others are recorded as waived as under "ship".
   - **drop it** — every open criterion is recorded as waived with the reason "dropped by
     ruling", and filed the same way (the standing rule: a person decides not to fix it; the
     issue records that they did).
   The library records the chosen outcome (`record-ruling`); applying it is the PM's act. The
   framework writes the request; it never picks an outcome itself.

## Decision

A new library, `packages/core/lib/verification-runs.js`, owns the count, the limit, the
refusal and the rendering of the ruling request; the three commands call its CLI rather than
re-deriving any of it in prose. Not added to `functional-verification.js`, which is already
3495 lines and documented as pure (no clock, no git); this one reads settings and writes state.

The count lives in `implement.json` (as the PM specified), not in `verification-state.json`,
because the workflow's Judge rewrites `verification-state.json` on every run and a fresh run
starts it over — it cannot carry a count across runs.

`/implement-trd` §3.6 must spread the existing object (`{ ...state.functional_verification,
prd_resolved, … }`) instead of replacing it, or every re-run of `/implement-trd` (for example
`--reconcile`) resets the count.

The refusal ends `COMMAND STUCK`, not `COMMAND COMPLETE`: the command did not do what it was
invoked to do and a person must decide before anything moves. `/implement-trd`'s own banner
stays as its other work dictates (tasks were built); the refused verification pass is its
FUNCTIONAL VERIFICATION outcome `not run: verification run limit reached`, an ISSUES line and
NEXT naming the request.

The limit applies whatever the latest outcome was: a third counted run is refused even after
a `satisfied` run (the request then lists nothing open and says so). Custody re-proofs are
unaffected because they are not counted.

Rejected: counting fix-loop rounds as runs (the ask is explicitly runs, "not only rounds per
run"); storing the limit in `verification.md` (owner-governed, and the PM asked for a
setting).

absorbed:     `implement-trd.md` §3.6 replaces `functional_verification` wholesale — the count cannot survive a re-run of `/implement-trd` without spreading it  [BLOCKS]
absorbed:     a way to record a "ship"/"drop" ruling as waived rows — without it a shipped open criterion is never filed, breaking the 2026-11-12 standing rule the ruling must obey  [BLOCKS]
not absorbed: end-of-run order of audit vs verification — roadmap item 1, `feature/10-audit-before-functional-verification` (no commits yet beyond `main`); this change works in either order
not absorbed: per-kind artifact publishing — roadmap item 4; this change records the ruling request with the existing `artifacts.js` and the existing `publishArtifacts` switch

## Grounding

- `packages/core/commands/verify-build.md` — Step 1a (rerun scope, auto-resume) is where the
  "is a run allowed / does this one count" check belongs, before Step 2. Step 4's dispatch
  (`:372-404`) is the start of the run; Step 5 and the fix loop's step 6 are where it finishes.
  Readout NEXT rule O4 (`:470-480`) and the fix loop's step 6 NEXT both need the at-limit
  branch. `--chained` (sweep) and `--criteria` paths must stay uncounted. [read]
- `packages/core/commands/refine-verification.md` — Inputs (`:79-95`) then Derive; the
  limit check belongs before Derive, after `record-ref.js ensure`. Writes / Never / Readout
  sections need the decline branch. [read]
- `packages/core/commands/implement-trd.md` — §3.6 `:825-827` (the wholesale replace; spread
  instead); §8.3 `:2003` (dispatch — check and count here); §8.4 `:2131` (finish the entry);
  state schema `:1506-1521` and its prose `:1523-1545` (document `runs`); Step 9 readout
  (FUNCTIONAL VERIFICATION block, NEXT). Hazard: `/implement-trd` holds `state` in memory and
  `implement-state.save()` writes the whole object (`:957-960`); a CLI that writes
  `implement.json` behind it is clobbered by the next save unless the command reloads state
  after the CLI call, or the count is mutated in memory and saved through `save()`. [read]
- `packages/core/lib/implement-state.js` — `load()`/`save()` (`:46`, `:101`); `save()` now
  creates the state folder. The only sanctioned writer of `implement.json`; the new library
  uses it. [read]
- `packages/core/lib/functional-verification.js` — `recordNonBlockingFollowups(stateDir,
  nonBlocking, nowIso)` (`:1682`) writes `[non-blocking] ` discovery rows idempotently; reuse
  for ship/drop rulings. `verification-state.json` entries carry `status`, `kind`, `cause`,
  `reason` — the ruling request reads these. [read]
- `packages/core/lib/waived-defects.js` — `gate` files every `[non-blocking] ` row as a
  defect issue before close; nothing new needed there. [read]
- `packages/core/lib/docs-audit-assemble.js:81-115` — the existing pattern for reading and
  validating an `ensemble.*` setting from `.claude/settings.json`; follow it. [read]
- `packages/core/scripts/scaffold-project.sh:1647-1658` — `setdefault` backfill of `ensemble`
  keys; add `verificationRunLimit` (2) the same way. `packages/core/templates/claude-directory/settings.json`
  carries the shipped default. Test: `packages/core/scripts/scaffold-project.test.sh`. [read]
- `packages/core/lib/artifacts.js` — kinds list; add `ruling-request` beside
  `verification-report` (`command-status.md` lists the kinds; update that list in
  `packages/core/templates/claude-directory/rules/command-status.md` and `.claude/rules/command-status.md`). [inferred]
- Vendoring: each edited `packages/core/commands/*.md`, `packages/core/lib/*.js` and template
  is mirrored into `.claude/` in the same commit, and a new library gets a symlink in
  `packages/full/lib/` (pattern: `packages/full/lib/rerun-scope.js -> ../../core/lib/rerun-scope.js`,
  commit 70a16a7b). [read]
- Docs: `docs/reference/verification.md`, `docs/reference/implement-trd.md`,
  `docs/reference/other-commands.md` describe the loop and its caps. [inferred]
- Fixtures: `.claude/rules/verification.md` §1 `fixtures` environment authorises a headless
  session for "/refine-verification declining a third plan". [read]

## Open Questions

none
