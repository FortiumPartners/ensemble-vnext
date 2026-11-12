# Investigation: triage-unmet-results-by-kind

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-1 of workplan `verification-targeted-loop` (`docs/plans/verification-targeted-loop/roadmap.md`
item 1; GitHub issue FortiumPartners/ensemble-vnext#113). Source of every objective: the PM's
instruction for this feature, 2026-11-11 (quoted in the `/plan` invocation). Items 2-6 of the
roadmap (targeted inner loop by shared cause, final regression pass, accepted gaps for must-pass,
materiality, follow-up ranking) are to come and are NOT built here.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every criterion the Judge rules not `met` carries exactly one kind — `build-defect`, `evidence-gap` or `not-checkable-here` — returned by the Judge, recorded on that criterion in `verification-state.json`, and shown in `verification-report.md`. | PM instruction, 2026-11-11 | yes |
| O2 | Only `build-defect` criteria are handed to the Debug stage; an iteration with no build defect dispatches no Debug agent. | PM instruction, 2026-11-11 | yes |
| O3 | An `evidence-gap` criterion gets exactly one re-capture per run. If the re-capture is still an evidence gap, it is settled as an evidence gap with its reason, reported as a definition problem ("the criterion asks for evidence the build does not produce"), and no longer counts as an open gap for the stalled and cap rules (neither as open nor as closed). | PM instruction, 2026-11-11 | yes |
| O4 | A `not-checkable-here` result is settled once with its reason and is not re-opened by a later invocation (resume, or a `/verify-build` fix round) unless `verification.md` has changed since it was recorded; when it has changed, the criterion re-opens. | PM instruction, 2026-11-11 | yes |
| O5 | Not-checkable results knowable before exercising — a parts-only design board's structure row; a design-structure row whose environment is a production/minified build — are classified at preflight from the definition, the design map and `verification.md`, enter the run already settled `not-checkable-here`, and are never handed to Exercise. | PM instruction, 2026-11-11 | |
| O6 | The setup check tolerates a dev server's cold start: a warm-up request and a generous first-response timeout before a target's reach is recorded as failed. | PM instruction, 2026-11-11 | |
| O7 | `/verify-build`'s fix rounds and `/refine-verification` read the recorded kind instead of re-deriving buildability from the cause (falling back to the cause only for a state file written before this change). | PM instruction, 2026-11-11 | |
| O8 | One headless fixture run of `/verify-build` (the `fixtures` environment in `verification.md`) on a fixture seeded with one defect, one missing capture and one host-only criterion shows all three kinds in its report. | PM instruction, 2026-11-11 (acceptance) | |

## Intended Change

Today (all `[read]` unless marked):

- `verify-functional.js:434` holds `EVIDENCE_CAUSES = ['evidence-missing', 'evidence-stale', 'locator-not-found']`.
  At `:1862-1887` the Judge's `debugGaps` are split by cause: evidence causes go back to the next
  Exercise pass as `evidenceRetries` (the `RE-CAPTURE REQUIRED` block in `buildExercisePrompt`,
  `:439-444`), every iteration, with no limit, until the cap or a stall. Everything else goes to
  Debug — including `never-exercised` gaps, and, when there are neither build nor evidence gaps,
  the fallback `buildGaps.length > 0 ? buildGaps : allDebugGaps` (`:1893`).
- `:1825-1843` settles `met`, `not_verifiable` and `unbuilt` within one invocation; `not_met`
  stays open and is re-walked every iteration.
- `:1576-1603` seeds a resume from `met` entries ONLY, so every `not_verifiable` verdict
  re-opens on each later invocation. `/verify-build`'s fix loop step 4
  (`packages/core/commands/verify-build.md`, "The fix loop" step 4) synthesises `resume` from
  `met` entries only, so each fix round re-walks every not-verifiable criterion too.
- The Judge schema (`JUDGE_CRITERION_SCHEMA`, `:933-970`) has `status` and `cause`; there is no
  kind. The cause vocabulary is `CAUSES` in `functional-verification.js:1051-1060` (eight causes).
- `decideNext` (`functional-verification.js:325-480`) computes `closed = previousGaps \ gaps`,
  stalls when `previousGaps` is non-empty and nothing closed, and stops at `iteration >= cap`
  with gaps open. It knows nothing of settled evidence gaps.
- `renderReport` (`:1224`) counts every non-`met` criterion by cause on the Diagnosis line;
  there is no kind anywhere in the report.
- The setup check's reach probe (`buildSetupPrompt`, `verify-functional.js:801-848`) is
  `curl ... --max-time 5`: a dev server still compiling its first response reads as
  unreachable and the run ends `setup-failure`.
- `implement-trd.md` §8.1a already resolves a criterion to "not verifiable here" when its
  environment is unusable, but that criterion still reaches the workflow as an open criterion in
  no lane (`noLaneClaims`, `verify-functional.js:1706-1719`) and costs a Judge ruling every
  invocation. A parts board's structure row (`ST-<board id>`, empty `components` in
  `design-map.json`; `packages/skills/verify-design-structure/SKILL.md:51-53`) is handed to
  Exercise, which claims it with `artifact: null`, every run.
- `/verify-build` fix loop step 2 treats "buildable" as cause `judged-failed`/`not-built`
  (D4), step 6 composes `not buildable by cause: ...` stop reasons; `/refine-verification`
  step 2 sorts Blockers / Accepted-as-not-verifiable by cause.

After:

1. **Kind vocabulary, one table.** `functional-verification.js` exports `KINDS`
   (`['build-defect', 'evidence-gap', 'not-checkable-here']`) and `KIND_BY_CAUSE`:
   `judged-failed`, `not-built` → `build-defect`; `evidence-missing`, `evidence-stale`,
   `locator-not-found`, `never-exercised` → `evidence-gap`; `environment-unreachable`,
   `capability-absent` → `not-checkable-here`; and `kindOf(cause)`. The workflow has no
   `require`, so it duplicates the map (as it already does `EVIDENCE_CAUSES`, which this
   replaces) and a test pins the copy to the lib's export.
2. **Judge returns the kind.** `JUDGE_CRITERION_SCHEMA` gains `kind` (enum of `KINDS`, null for
   `met`); the Judge prompt's STEP 2 asks for it beside `cause` and states the mapping. The
   script reconciles: when the returned kind is absent or disagrees with `KIND_BY_CAUSE[cause]`,
   the cause-derived kind is used and the disagreement is logged — routing never rests on an
   unchecked field. The kind is written on every non-`met` entry in the state file (STEP 4) and
   the report input (STEP 5), and carried unchanged on settled entries.
3. **Debug gets build defects only.** The split at `:1862` keys on kind. Debug receives only
   `build-defect` gaps; the `allDebugGaps` fallback is deleted. No build defect → no Debug agent
   (renders still run, as the evidence-only branch does today).
4. **One re-capture, then settle.** The script keeps a per-run `recaptured` set. An
   `evidence-gap` gap not yet in it goes to the next Exercise pass (today's `RE-CAPTURE REQUIRED`
   block) and joins the set. The next Judge prompt names the ids on their one re-capture; any of
   them still ruled `evidence-gap` is settled: kept at status `not_met`, `kind: 'evidence-gap'`,
   `settled: 'definition-problem'`, its reason kept, `provenAt` the iteration, never re-walked
   in this run. `decideNext` gains a required input `settledEvidenceGaps` (ids): they are
   excluded from `gaps` and from `previousGaps` before `closed`, the stall rule and the cap rule
   are computed, so settling one is neither a closure nor an open gap. A run whose only
   remaining non-`met` criteria are settled evidence gaps and not-checkable ones exits through
   the ordinary satisfied branch — still subject to the coverage floor and the must-pass step
   (a must-pass criterion settled as an evidence gap is not `met`, so the run ends
   `must-pass-unproven`, exactly as a not-verifiable must-pass does today). Across invocations a
   settled evidence gap re-opens (a new invocation may capture differently); only O4's kind
   persists.
5. **Not-checkable persists across invocations.** A new lib CLI
   `functional-verification.js verification-digest <path>` prints the sha256 of the
   `verification.md` content (`""` when the file is absent). The dispatching command passes it as
   a new workflow arg `verificationDigest`. Every settled `not-checkable-here` entry records
   `verificationDigest` (the current arg). On resume the workflow seeds, besides `met`, every
   `not_verifiable` entry whose `kind` is `not-checkable-here` and whose recorded
   `verificationDigest` is non-empty and equal to the current one; any other `not_verifiable`
   re-opens, as today. Per-entry rather than a fifth top-level state key, so the state file keeps
   its four top-level keys (the Judge prompt and `/implement-trd` §8.2 read exactly four).
   `/verify-build`'s fix loop step 4 and `--resume`, and `/implement-trd` §8.2, carry these
   entries in `resume` and pass `verificationDigest` in the dispatch (§8.3 / verify-build step 4).
6. **Preflight classification.** A new pure lib function `preclassifyNotCheckable({ criteria,
   boards, environmentByCriterion, minifiedEnvironments })` plus CLI `preclassify --file` returns
   `{ id, status: 'not_verifiable', kind: 'not-checkable-here', cause: 'capability-absent',
   reason }` for: a `check:verify-design-structure` row whose board has an empty `components`
   list in `design-map.json` (reason "parts board: the structure check does not run"), and a
   `check:verify-design-structure` row whose resolved environment is a production/minified
   build (reason names minified component names). `minifiedEnvironments` comes from a reader
   over `verification.md` §1 (`readMinifiedEnvironments`): an environment named `production`, or
   whose row says `production build`, `prod build` or `minified` (case-insensitive). `/verify-build`
   step 3c and `/implement-trd` §8.1a call it after resolving environments and pass the result as
   a new workflow arg `preclassified`. The workflow seeds them into `settled` at `provenAt: 0`
   with `verificationDigest` before the loop, so they are in no Exercise slice, no setup target's
   open set and no Judge open set, and appear in the state file and report like any settled entry.
7. **Cold-start tolerant setup probe.** `buildSetupPrompt` step 2's reach probe becomes: one
   warm-up request whose result is ignored, then a first-response timeout of 60 seconds
   (`--max-time 60`), retried until about 90 seconds have passed, before `reach.ok` is `false`.
   `decideSetup` is unchanged — this changes how the fact is gathered, not how it is decided.
8. **Report.** `renderReport` shows each non-`met` criterion's kind in its section rows; the
   Diagnosis line leads with counts by kind ("2 build defects, 1 evidence gap, 1 not checkable
   here") before the existing cause counts; a new `## Evidence gaps (definition problems)`
   section lists settled evidence gaps with their reason and the sentence "the criterion asks for
   evidence the build does not produce — change the criterion or the build's outputs"; the
   not-verifiable section marks preflight-classified rows. All kind rendering is gated on any
   criterion carrying `kind`, so a report built from an older input is byte-identical.
9. **Commands read the kind.** `/verify-build` fix loop step 2: a failing row is recorded for
   `kind: 'build-defect'` (cause `judged-failed`/`not-built` only when `kind` is absent — an
   older state file); step 6 stop reasons read "evidence gap — definition problem: <reason>" and
   "not checkable here: <reason>" by kind; `buildableOpen` counts `build-defect`.
   `/refine-verification` step 2: Blockers = `build-defect`; Accepted as not verifiable =
   `not-checkable-here` (must-pass rule unchanged — that is roadmap item 4, to come); a settled
   evidence gap is never a Blocker and goes under Owner rulings as a definition problem
   (`--auto`: an `OWNER-CALL` row). Mirrors in `.claude/` updated byte-identically.

Each criterion must be able to fail if the change does nothing: e.g. the evidence-gap test runs
the workflow with a Judge stub that keeps ruling `evidence-missing` and asserts exactly two
Exercise dispatches for that criterion (initial + one re-capture), that the third iteration has
no Exercise slice for it, and that `decideNext` returns `exit-satisfied`/not `exit-stalled` —
today's code gives three Exercise dispatches and a stall.

## Decision

Kind is a function of cause, stated once in the lib (`KIND_BY_CAUSE`), returned by the Judge and
reconciled by the script against the cause — chosen over a free Judge-chosen kind because the
eight-cause vocabulary already encodes the distinction (EVIDENCE_CAUSES is the evidence half of
it) and routing must not rest on one unchecked field. `never-exercised` is an evidence gap (no
claim was captured; Debug cannot fix a missing capture) — this changes today's behaviour, where a
`never-exercised` gap reached Debug.

The `verification.md` digest is recorded per not-checkable entry, not as a fifth top-level state
key — rejected because the state file's four top-level keys are read by name in the Judge prompt,
`/implement-trd` §8.2 and `/verify-build --resume`, and an unrecognised key is documented to be
read as absent.

Settled evidence gaps exit through the satisfied branch (guarded by the floor and must-pass)
rather than a new outcome — a new outcome string would ripple through every outcome reader
(eight lists in commands and tests) for what the report's own section already says.

Setup cold-start tolerance is in scope although the roadmap's fence lists it as out of scope:
the PM's instruction for this feature, written after the roadmap, includes it explicitly, and
the instruction is the source. Only the probe changes; "not counting a setup failure as a round"
(also in that fence line) stays out.

The fixture run (O8) is an ordinary final-phase task, not tagged `[LIVE]`: `/plan --implement`
does not pass `--include-deferred`, so a `[LIVE]` task would be set aside and O8 would never run.

absorbed: none.
not absorbed: base-merge and record-only commits re-opening custody (issue #113 item 8) — not in this feature's instruction.
not absorbed: grouping build defects by shared cause and re-checking only the addressed cause — roadmap item 2, to come.

## Grounding

- `packages/core/workflows/verify-functional.js` (1957 lines) [read]: replaces `EVIDENCE_CAUSES`
  (`:434`) with `KIND_BY_CAUSE`; `buildExercisePrompt` retry block (`:439`) reused as the one
  re-capture; `buildJudgePrompt` STEP 2 (`:610-626`), STEP 3 decide payload (`:640-656`), STEP 4
  state keys (`:666-686`), report-input key list (`:708`); `JUDGE_CRITERION_SCHEMA` (`:933`);
  resume seeding (`:1576-1603`); fold (`:1825-1843`); split + Debug dispatch (`:1862-1900`,
  delete the `allDebugGaps` fallback at `:1893`); `buildSetupPrompt` reach probe (`:826-828`);
  `endOnSetupFailure` writes `never-exercised` entries (`:1362-1372`) — give them a kind. Hazard:
  the script cannot `require`; constants duplicated from the lib are pinned by a test
  (cause-vocabulary test, `verify-functional.test.js`). Hazard: the Judge writes the state file
  and copies settled entries "EXACTLY as given" — the new keys (`kind`, `settled`,
  `verificationDigest`) must be added to every list of carried keys or they are silently dropped.
- `packages/core/lib/functional-verification.js` (2487 lines) [read]: `decideNext` (`:325`) gains
  required `settledEvidenceGaps` (throw on absence, the file's established style `:345-375`);
  `CAUSES`/`CAUSE_LABEL` (`:1051-1085`) — add `KINDS`, `KIND_BY_CAUSE`, `KIND_LABEL`, `kindOf`
  beside them; `renderReport` (`:1224`); `renderFixSummary` (`:1701`); CLI dispatch near
  `module.exports` (`:2023`) for `verification-digest` and `preclassify`; existing sha256 use at
  `:1831` to follow. Convention: every new export in `module.exports`, CLI subcommands read
  `--file` payloads.
- `packages/core/workflows/verify-functional.test.js` (3458 lines) [read]: harness
  `runWorkflow`/`makeAgentStub` (`test-harness.js`); existing evidence-gap suite at `:248-310`
  asserts retries every iteration — update it to the one-re-capture rule.
- `packages/core/lib/functional-verification.test.js` [inferred]: `decideNext` cases need the new
  required key added to every existing input.
- `packages/core/commands/verify-build.md` [read]: `--resume` (`:541-551`), fix loop steps 2, 4, 6
  (`:583-660`), dispatch args (`:300-320`). `packages/core/commands/verify-build-criteria.test.js`
  pins its prose and asserts the `.claude/commands/verify-build.md` mirror is byte-identical.
- `packages/core/commands/implement-trd.md` §8.1a (`:1735`), §8.2 (`:1704`), §8.3 (`:1854-1936`) [read].
- `packages/core/commands/refine-verification.md` step 2 (`:82-112`) [read].
- `packages/skills/verify-design-structure/SKILL.md:51-53, :110-115` [read]: parts board row
  `ST-<board id>` and minified-name rule.
- Mirrors [ran]: `.claude/workflows/verify-functional.js` is byte-identical to
  `packages/core/workflows/verify-functional.js`; `.claude/lib/functional-verification.js` and
  `.claude/commands/*.md` mirror their `packages/core` sources; `packages/full/workflows` is a
  symlink to `packages/core/workflows`.
- Fixture environment [read]: `verification.md` §1 `fixtures` row; slot creation
  `packages/core/scripts/scaffold-project.sh --plugin-dir packages/full .trd-state/<feature>/evidence/live/work/slot-<n>`;
  pattern `test/smoke/lib/project.sh`.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a run whose only open criteria are settled evidence gaps end `satisfied`? | Yes, through the existing satisfied branch, still blocked by the coverage floor and must-pass; the report's new section names each as a definition problem. | |
| OQ-2 | Is `never-exercised` an evidence gap? | Yes (no capture reached the Judge); it now re-captures once instead of reaching Debug. | |
