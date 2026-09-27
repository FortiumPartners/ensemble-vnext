# Verification notes

What the verifier has learned about running this project, across runs of the
functional-verification loop. Every line carries an evidence marker: `[ran]` (executed and
read the output), `[read]` (opened and verified), `[inferred]` (deduced, not checked).

## Exercising `renderWaveProfile()` (task-graph.js)

- [ran] `renderWaveProfile()` can be exercised directly with no server, browser, or full
  `/create-trd` run — invoke it in a one-off `node -e` script requiring
  `.claude/lib/task-graph.js` and `.claude/lib/trd-parser.js`, parse a committed TRD with
  `parseTrd(fs.readFileSync(f,'utf8'), {path:f})`, then call
  `tg.renderWaveProfile(tg.buildGraph(p.tasks, p.grounding||{}))`. Confirmed against
  `docs/TRD/autonomy-judge-command-scope.md` (dependency-dominated, 13/14 ordering
  constraints, narrow line + critical path emitted, no shared-files list),
  `docs/TRD/discipline-judgment.md` (avg width 7.00, no narrow line — wide as documented),
  and `docs/TRD/completed/implement-trd-rework.md` (avg width 2.38, above the narrowBelow
  default of 2, no narrow line).
- [ran] A file-dominated wave profile has no committed TRD example in this repo as of
  2026-09-21 (all three referenced example TRDs are dependency-dominated or wide/zero-edge).
  To exercise the "shared files" branch of `renderWaveProfile`, build a synthetic graph
  inline: `buildGraph(tasks, grounding)` takes tasks with no `dependsOn` and a `grounding`
  object keyed by task id with a `touches: [<path>]` array — giving 4 tasks the same
  `touches` path produces `narrow — driven by shared files (6 of 6 ordering constraints)`
  plus the "these files serialize the most tasks" block. This is the substituted-evidence
  path referenced by the contract's "Evidence that would prove it is a target, not a
  contract" clause, used because FS-2 requires a file-dominated contrast run and none
  exists as committed TRD fixture data.
- [inferred] FS-4/FS-5/FS-6 (grounding's dependency-justification verdicts, sizing's
  long-task splits, and TRD-byte-identity-plus-no-AskUserQuestion) require a full
  `/create-trd` run against a real PRD, which the stack hints in this loop's dispatch state
  takes ~20 minutes. Not attempted in this Exercise pass — no PRD was supplied and the
  time cost is out of scope for a single exercise iteration. Left `not_verifiable` with
  that reason; a future run with a PRD in hand and time budgeted for a full pipeline pass
  could produce this evidence.

## Exercising the audit-{trd,prd,build} readout headings (2026-09-25 run, `audit-readout-tense`)

- [read] All 12 criteria in this success definition are static-text checks over the readout
  heading definitions in six files: `packages/core/{workflows,commands}/audit-{trd,prd,build}.
  {js,md}`. No server/browser/database/credential is involved — grep and `git diff
  main...HEAD` over those six files is sufficient evidence for every criterion here; no live
  `/audit-*` run was needed or attempted.
- [ran] Confirmed `.claude/{workflows,commands}/audit-{trd,prd,build}.{js,md}` are
  byte-identical to their `packages/core/` counterparts (`diff -q`, zero output, all six
  pairs) — so checking `packages/core` alone is sufficient; the task's own warning about a
  fallback-only check does not apply here because both layers were in fact updated in lockstep
  in this diff.
- [ran] `git diff main...HEAD -- <the six files>` is the single most useful command for this
  whole criterion set — it shows every heading-text change side by side and made FS-1 through
  FS-6, FS-10 essentially self-evident without needing per-criterion greps.
- [ran] One inconsistency found and recorded in FS-4.txt/FS-12.txt evidence, NOT resolved to a
  verdict (that's the judge's job): `audit-build.js`/`audit-build.md`'s `FIX THE CITATION`
  heading was left in imperative form, even though its own description text says the audit
  corrects the citation directly (the same mechanical action FS-4 requires past tense
  `FIXED THE CITATION` for in the audit-trd/audit-prd layers), and it is not one of the four
  audit-build headings the task text names as deliberately-imperative exceptions
  (TRACEABILITY GAPS / MISSING IMPLEMENTATION / MISMATCH / UNTESTED-IN-PRACTICE). Worth a
  second look by the judge stage.

## Exercising plan-weight.js / fix-plan.js / fix-sizing.js (2026-09-23 run)

- [ran] `plan-weight.js`'s `KINDS`/`WEIGHTS`/`ROUTES` exports, `stages()`, `verification()` and
  `route()`, plus `fix-plan.js`'s `plan()`, are all exercisable with no server, browser or
  live `/plan` session via a one-off `node -e` script requiring
  `./packages/core/lib/plan-weight.js` and `./packages/core/lib/fix-plan.js` directly. No TRD
  or PRD fixture is needed for these — pure functions, no filesystem reads.
- [ran] `fix-sizing.js` no longer exports `MAX_TASKS`/`DEFAULT_MAX_FILES`/`DEFAULT_MAX_CALLERS`
  — confirmed by reading the file and by `grep -rn "MAX_TASKS\|DEFAULT_MAX_FILES" packages/core/lib/*.js`
  returning zero hits, contrasted with the same file at base commit `f5890c8` (`git show
  f5890c8:packages/core/lib/fix-sizing.js`), which defined all three. Any future criterion
  phrased as "the ceiling remains N" needs to be read against its cited source's actual
  wording (does the source forbid *raising*, or forbid *removing*?) before treating a
  deletion as a pass or a fail — those are different claims and the delivered code here
  satisfies one and not the other verbatim.
- [inferred] Criteria naming a full `/plan` *run* (a captured session transcript showing
  actual dispatch behaviour, stage execution, banner counts, `AskUserQuestion` absence, or a
  written artifact from a real run) still require the same ~20-minute live session the prior
  Exercise pass on this project flagged for `/create-trd`. No environment beyond the working
  tree is authorized by `.claude/rules/verification.md` (its `local` row names a `npm run dev`
  script that does not exist in this repo), so these were left `not_verifiable` again this
  run, same reasoning as the prior entry. This applies to: FS-9, FS-19, FS-20, FS-21 (needs a
  TRD `/plan` actually wrote, not a synthetic fixture), FS-22, FS-24.

## Evidence staleness in the tense-rule run (FS-12, 2026-09-25)

- [ran] FS-12 arrived at Debug with the citation heading already past tense in all four files
  (`packages/core/workflows/audit-build.js:509`, `packages/core/commands/audit-build.md:196`,
  and both `.claude/` mirrors). The evidence artifact
  `.trd-state/audit-readout-tense/evidence/FS-12.txt` was written 22:52; all four files were
  last modified 22:54. The verdict was correct against the tree the Exercise pass read and
  stale by two minutes against the tree Debug was handed.
- [learned] On a project whose Exercise step is a grep, evidence can go stale between Judge and
  Debug when more than one fix lands in the same iteration. Cheapest guard, and what closed
  this one: re-grep the cited file:line before editing, and read `git diff` on it — the pre-edit
  wording showed up as the `-` side of the working-tree diff, which is what identified the gap
  as already closed rather than absent.
- [ran] `FIX THE CITATION` still exists in `create-trd.{md,js}` (line ~985 / ~632) and in the
  stale `.claude/worktrees/agent-*` copies. Those are a different command and untracked scratch
  trees respectively. A repo-wide grep for the imperative spelling will hit them and read as a
  failure; scope the grep to the six audit-layer files
  (`packages/core/{workflows/audit-*.js,commands/audit-*.md}`) plus their `.claude/` mirrors.
- [ran] Mirror parity for these six files is a plain `diff -q packages/core/<f> .claude/<f>` —
  no need to invoke the BATS `runtime-integrity.test.sh` suite to check one change. `node --check`
  on the three workflow scripts confirms the template literals still parse after a heading edit.
- [ran] No test in `test/` asserts any readout heading string, so a heading rename breaks no
  deterministic check — the only thing that can catch a half-applied rename is the two-layer
  grep plus the mirror diff.

## Iteration 2 re-check (same run, `audit-readout-tense`, 2026-09-25)

- [ran] The FS-4/FS-12 gap the prior iteration flagged for the judge was fixed by Debug:
  `FIX THE CITATION` in `audit-build.{js,md}` (both layers) is now `FIXED THE CITATION`, and
  the fix also narrowed the claim to the in-run-rewrite case only, adding "reported, not
  fixed" for a citation elsewhere in the TRD — a correctness improvement riding along with
  the tense rename. Re-grepped all six files fresh after the debug edit
  (`packages/core/workflows/audit-build.js` mtime 22:56:41, after the FS-4 evidence's
  original 22:51:56 capture) — this is the exact staleness pattern the iteration-1 note
  already named for FS-12; the fix here was to re-grep rather than trust the stale
  evidence file. Confirmed zero remaining hits for the literal imperative string
  `"FIX THE CITATION"` across the six audit-{trd,prd,build} files
  (`packages/core/{workflows,commands}` — `.claude/` mirrors byte-identical, `diff -q`
  all six). Updated `FS-4.txt` and `FS-12.txt` evidence files to the current (fixed) state
  rather than leaving the iteration-1 "one inconsistency found" note standing as if
  unresolved.
- [ran] Confirmed `node --check` still passes on all three workflow `.js` files post-edit —
  the heading-string edit didn't break template-literal syntax.
- [inferred] General pattern worth carrying forward: when a criterion set spans an
  iteration boundary (Exercise -> Judge -> Debug -> Exercise again), always re-grep the
  cited file:line before reusing a prior iteration's evidence file verbatim, even when the
  file "looks done" — mtimes are the cheap tell (evidence mtime vs. source mtime), same
  method the iteration-1 note already established for the FS-12/Debug handoff.
