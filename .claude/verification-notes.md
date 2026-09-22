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
