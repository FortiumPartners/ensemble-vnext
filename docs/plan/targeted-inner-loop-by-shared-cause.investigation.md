# Investigation: targeted-inner-loop-by-shared-cause

**Kind**: change
**Weight**: medium
**Route**: plan

Feature F-2 of workplan `verification-targeted-loop` (`docs/plans/verification-targeted-loop/roadmap.md`
item 2; GitHub issue FortiumPartners/ensemble-vnext#113). Source of every objective: the PM's
instruction for this feature, 2026-11-11 (quoted in the `/plan` invocation). That instruction is
newer than the roadmap's item 2 brief and differs from it in one place: the roadmap re-checks a
cause's other members in the inner loop once its representative passes; the instruction moves
them to the end-of-run regression pass. The instruction wins.

Builds on F-1, "Triage unmet results by kind" (`docs/TRD/triage-unmet-results-by-kind.md`,
merged in PR #115): the `kind` on every unmet criterion, `KIND_BY_CAUSE`, the one evidence-gap
re-capture and the `settledEvidenceGaps` input to `decideNext`. Roadmap items 3-6 (one full
regression pass at the end, accepted gaps for must-pass criteria, materiality, follow-up
ranking) are to come and are NOT built here.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | After a Debug pass, the next iteration's Exercise pass is dispatched only for the representative criterion of each cause that Debug pass addressed (plus any evidence-gap re-capture F-1 already schedules). No other open criterion is exercised or re-judged in that iteration. | PM instruction, 2026-11-11 | yes |
| O2 | The Judge groups build-defect criteria by shared root cause: every build-defect criterion carries one cause key, and criteria with the same root cause carry the same key. The workflow records each cause (key, members, representative) in `verification-state.json` and shows it in `verification-report.md`. | PM instruction, 2026-11-11 | yes |
| O3 | Debug fixes each cause once, from one gap per cause rather than one per criterion. Independent causes may be fixed in parallel (the PM's words: "independent causes may be fixed in parallel"); whether to is an engineering choice. | PM instruction, 2026-11-11 | |
| O4 | A cause with many members (for example 20 criteria) is re-checked in the inner loop through exactly one representative. When the representative passes, the cause is closed and its other members are left for the end-of-run regression pass, not re-checked in the inner loop. | PM instruction, 2026-11-11 (acceptance) | yes |
| O5 | Criteria of a cause that the last Debug pass did not address stay open and untouched: they are not exercised or re-judged, and their last verdict stands. | PM instruction, 2026-11-11 (acceptance) | yes |
| O6 | A check-derived criterion (`derivation: check:<skill>`, such as design comparison) takes part in the inner loop only as its cause's representative. A representative is chosen from criteria that are not check-derived whenever its cause has one, so a design check is re-captured only when every member of its cause is check-derived. | PM instruction, 2026-11-11 | |
| O7 | A targeted unit test or Playwright spec may run as a fast pre-check before the representative is re-captured. A failing pre-check means the cause is not re-captured that iteration. A passing pre-check never settles a criterion `met`: only the criterion's own evidence, judged, does. | PM instruction, 2026-11-11 (acceptance) | yes |
| O8 | The inner loop stays bounded by the existing iteration cap and stalled rule. The stalled rule counts closed causes as well as closed criteria: an iteration that closes a cause has made progress even if no criterion's status changed. | PM instruction, 2026-11-11 | yes |
| O9 | One headless fixture run (`fixtures` environment in `verification.md`) seeded with two causes spread over at least six criteria, one cause fixed and one not, produces a `verification-state.json` whose second iteration exercised only the fixed cause's representative. | PM instruction, 2026-11-11 (acceptance) | |

## Intended Change

Today (all `[read]` unless marked):

- `packages/core/workflows/verify-functional.js:1955` (the loop head) computes
  `openCriteria = CRITERIA.filter((c) => !settled.has(c.id))` every iteration, and every open
  criterion in a lane is sliced and exercised. So every `not_met` criterion is re-walked each
  iteration, whatever Debug touched. (The PM's citation `:1652-1656` predates F-1; the code
  moved.)
- The Judge's criterion schema (`JUDGE_CRITERION_SCHEMA`, ~`:1020-1052`) carries `status`,
  `cause` and, since F-1, `kind`. There is no cause key and no notion of a shared root cause.
- Debug gets one gap per criterion (`judgeResult.debugGaps`, filtered to build defects at
  ~`:2162-2177`) in ONE `app-debugger` agent (~`:2199-2212`). Its schema (`DEBUG_SCHEMA`)
  returns `results: [{criterion, result, unbuilt}]` and `refresh`. There is no pre-check.
- `decideNext` (`packages/core/lib/functional-verification.js:327`) computes
  `closed = previousGaps \ openGaps` and returns `exit-stalled` when `previousGaps` is non-empty
  and `closed` is empty. It is run by the Judge agent through the `decide-next` CLI with a
  payload the workflow's prompt describes (`buildJudgePrompt`, ~`:700-722`). The workflow has no
  `require` and duplicates the lib's constants under a pinning test.
- State (`verification-state.json`) is written by the Judge with four top-level keys
  (`iteration`, `criteria`, `gapsClosed`, `outcome`); the script corrects it through
  `syncKindState` (F-1, D20) when it overrides the Judge. No record of which criteria each
  iteration exercised exists.

After this change:

- The Judge returns `causeKey` on every build-defect criterion it rules. The workflow validates
  it (a missing or malformed key makes the criterion its own cause, `criterion:<id>`, logged),
  keeps a cause map in the script, and picks one representative per cause deterministically:
  the first member in definition order that is not check-derived, else the first member.
- Debug receives one gap per open cause (the representative's evidence plus the members'
  statements). Causes are partitioned into Debug batches by shared implicated files; each batch
  is one `app-debugger`, batches run in parallel. Debug returns, per cause, whether it addressed
  it and optionally a pre-check `{command, exitCode}`.
- The iteration after a Debug pass exercises only: the representatives of causes Debug
  addressed whose pre-check did not fail, plus F-1's evidence-gap re-captures. Every other open
  criterion is carried untouched to the Judge as "open, not re-checked this iteration".
- When a representative is judged `met`, its cause closes and its other members are marked
  awaiting the regression pass. They are excluded from `decideNext`'s gaps, the same way F-1
  excludes settled evidence gaps.
- `decideNext` takes `causes` and `previousCauses` and returns `closedCauses`; it stalls only
  when neither a criterion nor a cause closed.
- Because the end-of-run regression pass (roadmap item 3) does not exist yet, the workflow runs
  one bounded confirmation pass over the awaiting members at exit (see Decision). Item 3
  replaces it.
- The first iteration of every invocation (fresh run, resume, `/verify-build` fix round)
  exercises the whole open set as today; targeting applies only after a Debug pass within the
  invocation.
- The state file gains a top-level `exercised` history (one entry per iteration: the ids
  Exercise was dispatched for) and per-criterion `causeKey` and `awaiting`; the report gains a
  Causes section.

## Decision

1. **Cause key from the Judge, cause map in the script.** The Judge is the only stage that reads
   evidence, so it assigns the key; the script owns the map, the representative and the open
   set, as it already owns `settled` (verify-functional "the open set is arithmetic"). Rejected:
   letting Debug group causes, since Debug runs after the grouping is needed and does not see
   met/not-met evidence.
2. **Representative is deterministic, from a lib function** (`causeGroups` in
   `functional-verification.js`, mirrored in the workflow under a pinning test like F-1's
   `KIND_BY_CAUSE`). Rejected: the Judge choosing it, because it must be stable across
   iterations and prefer a cheap (not check-derived) member.
3. **A cause closes when its representative is no longer failing for that cause** (met, or now
   failing under a different key). Its remaining members carry `awaiting: "regression"`.
4. **Bridge until item 3: one confirmation pass at exit.** When the loop reaches an exit action
   other than `exit-unbuilt` or `exit-setup-failure` and members are awaiting, the workflow runs
   ONE Exercise + Judge pass over only those members, outside the iteration cap and with no
   Debug after it. Its `decide-next` payload carries `cap` equal to the current iteration, so it
   can never return `remediate`. A member still failing there keeps the run from `satisfied`.
   Without this, a run whose representatives all pass would end `satisfied` with siblings never
   re-checked, or would never end at all. Item 3 replaces this pass with the full regression
   pass; this feature does not re-check `met` criteria and adds no extra inner-loop round.
5. **Pre-check lives in Debug's return, never in the Judge's input.** A failing pre-check
   (non-zero exit) marks the cause not addressed, so its representative is not re-captured. A
   passing one is passed to Exercise as a hint only; the Judge prompt never sees it.
6. **Targeting starts after the first Debug pass of an invocation.** A resume or fix round does
   not know what was fixed in between, so its first iteration walks the whole open set and
   regroups. Rejected: persisting addressed causes across invocations.
7. **Stall counts causes.** `decideNext` gains required `causes` and `previousCauses`
   (`previousCauses` may be null like `previousGaps`); `closedCauses = previousCauses \ causes`;
   stall only when `closed` and `closedCauses` are both empty. A script-side backstop overrides
   a Judge `exit-stalled` when the script's own cause map shows a cause closed.
8. **Two new top-level state keys** (`exercised`, `causes`) supplied to the Judge as literals by
   the script, the same way `gapsClosed` is; the resume reader (`implement-trd.md` Step 8.2,
   `verify-build.md` fix loop) ignores keys it does not use, which must be confirmed and tested.

absorbed:     the confirmation pass over awaiting members — without it the run cannot end correctly before item 3 exists  [BLOCKS]
absorbed:     `decideNext` excluding awaiting members from gaps — without it a closed cause's siblings hold the loop open to the cap  [BLOCKS]
not absorbed: re-checking `met` criteria at the end — roadmap item 3
not absorbed: restricting per-iteration Render re-dispatch for check skills — renders reuse existing evidence, separate cost question
not absorbed: moving design checks to `/sync-design` — out of the roadmap's fence

## Grounding

- `packages/core/workflows/verify-functional.js` (2268 lines) [read]: the loop (`for (; iteration <= CAP; ...)`
  ~`:1950`), `openCriteria` computed per iteration, lane slicing over `openCriteria`,
  `buildJudgePrompt` (~`:566`), `buildDebugPrompt` (~`:823`), `enrichDebugGaps`,
  `JUDGE_CRITERION_SCHEMA`/`JUDGE_SCHEMA`/`DEBUG_SCHEMA` (~`:1000-1130`), `reconcileJudgeKinds`
  (~`:1407`) and `syncKindState` (D20) as the pattern for script-side correction of the
  Judge-written state, `recheckAndReconcile` (must-pass backstop) as the pattern for overriding
  a Judge action, `KIND_BY_CAUSE` duplicated from the lib (~`:461`). Reuse all of these.
  Replace: the single Debug dispatch with batched parallel dispatch (reuse
  `MAX_PARALLEL_SLICES` batching pattern); the "open set = everything not settled" Exercise
  input after a Debug pass. Hazard: the file is a Workflow script with no `require` and no
  filesystem; every lib rule it needs is duplicated and pinned by a test.
- `.claude/workflows/verify-functional.js` [read]: byte-identical mirror; every edit lands in both.
- `packages/core/lib/functional-verification.js` [read]: `decideNext` (~`:327`) with F-1's
  `settledEvidenceGaps` as the exact precedent for a new required array input that is removed
  from both `gaps` and `previousGaps` up front; `KIND_BY_CAUSE`, `kindOf` (~`:1080-1100`);
  `renderReport` (~`:1263`); CLI `decide-next`. New: `causeGroups`, `closedCauses`, the
  `causes`/`previousCauses`/`awaitingRegression` inputs. Hazard: existing tests omit several
  fields and assert the earliest field's message, so new validation goes after
  `settledEvidenceGaps`'s.
- `.claude/lib/functional-verification.js` [read]: mirror; `describe('mirror parity'` asserts it.
- `packages/core/lib/functional-verification.test.js` (4646 lines), `packages/core/workflows/verify-functional.test.js` (3884 lines) [read]:
  the workflow test drives the script with stubbed `agent`/`parallel`; every `decideNext(` call
  site and CLI payload needs the new required inputs.
- `packages/core/contracts/functional-verification.md` and mirror [read]: the contract the Judge
  reads; gains the cause-key vocabulary and the representative rule.
- `packages/core/commands/implement-trd.md` Step 8.2 and `packages/core/commands/verify-build.md`
  fix loop [read]: build the `resume` snapshot from the state file's `iteration`, `criteria`,
  `gapsClosed`. Must keep reading only those keys. [inferred: extra keys are ignored; confirm]
- `test/smoke/scenarios/verify-triage-kinds.sh` and `test/smoke/lib/project.sh` [read]: the
  F-1 fixture scenario, the pattern for O9's scenario; registration rules in
  `test/integration/tests/smoke-registration.test.sh` and `test/smoke/run-smoke.sh`.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Until item 3 lands, how are a closed cause's other members re-checked? | One confirmation pass over only those members at exit, outside the cap, no Debug after it (Decision 4). Item 3 replaces it. | |
| OQ-2 | Does a resumed run or `/verify-build` fix round keep the previous invocation's targeting? | No: its first iteration walks the whole open set (Decision 6). | |
| OQ-3 | How many Debug agents may run in parallel? | At most 4 per iteration, matching the fixtures pool size in `verification.md` §1a; batches beyond that run in sequence. | |
| OQ-4 | A representative that now fails under a different cause key: does its old cause close? | Yes: the old cause closes, its other members await the regression pass, and the representative joins the new cause (Decision 3). | |
