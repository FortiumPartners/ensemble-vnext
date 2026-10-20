# TRD: speed-sentence

**Source PRD**: None — small change decided in session, 2026-10-19/20

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every implementer task prompt, the phase-gate verify-app prompt, every sweep fix prompt, and the mechanical stages (verify-functional's render and reconcile, create-trd's grounding merge) end with the time-matters sentence, word for word | your instruction, 2026-10-20 | yes |
| O2 | No audit verifier, judge, exercise, debug, triage or authoring prompt carries the sentence | your instruction, 2026-10-20 ("not audit verifiers or the judge") | yes |
| O3 | A before/after measurement on one fixed task reports per-task time from the dispatch ledger, and the change is kept only if time falls while failed tasks, retries, reconcile reopenings and new audit gaps all stay at zero | your instruction, 2026-10-20 | yes |

## Intended Change

Add this sentence, verbatim, to the end of the prompts named in O1:

> Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better.

Before: no workflow or agent prompt mentions time (grep for "Time matters" over `packages/` and
`.claude/` returns nothing [ran]). After: the sentence is appended at exactly the dispatch sites
O1 names and nowhere else, and a measurement shows whether it helped.

**Success, stated so it can fail:** across 5 runs of the same fixed task before and 5 after,
the median implementer task time and the median verify-app gate time both fall by more than
20%, and every after-run has 0 failed tasks, 0 retries, 0 tasks reopened by reconcile, and
`/audit-build` reports no gap that the baseline audit did not also report. A run where time
falls but any of those counts is non-zero is a failure, and the sentence is removed.

## Decision

**Append the sentence at the dispatch sites in the workflow scripts, not in the agent
definition files.** The agent files (`packages/full/agents-lib/*.md`) look like the obvious
single place, but `backend-implementer` is also the generic worker type the audit workflows
use: audit-prd and audit-trd verifiers default to it (`audit-prd.js:106`, `audit-trd.js:126`),
as do their index and could-not-verify stages and audit-docs' apply and review stages [read].
`verify-app` is likewise the exercise agent inside verify-functional (`verify-functional.js:1343`),
which gathers evidence for the judge. Putting the sentence in either agent file would reach
exactly the verifiers O2 excludes.

**One constant per workflow file, identical text, held identical by a test.** Workflow
scripts are executed as self-contained bodies by the platform's Workflow tool and cannot
`require` a shared module (`test-harness.js` header) [read], so the sentence is declared as
`const TIME_MATTERS = '...'` in each of the four files and a test asserts the four copies match.

**Measure with the existing `implement-one-task` smoke scenario**, run with `SMOKE_KEEP=1` so
the throwaway project (and its `.trd-state/<feature>/dispatch.jsonl`) survives. It is a fixed
one-task TRD that exercises exactly the two biggest targets: an implementer and the verify-app
phase gate. Run it with `--no-verify` on both sides (via a new `SMOKE_IMPL_ARGS` variable),
because the scenario otherwise runs the functional-verification loop, whose exercise stage
also dispatches `verify-app` (`verify-functional.js:1343`), and the ledger records no label to
tell that apart from the gate (`dispatch-ledger.js:98-112`). 5 runs per side, and differences
under 20% count as no difference: this scenario's wall clock has already drifted from 341s to
about 780s with no prompt change, so fewer runs or a narrower band would read noise as a result.

**The measurement covers the implementer and the gate only.** The smoke run never reaches the
sweep fix prompt or create-trd's grounding merge, and with `--no-verify` it never reaches
render or reconcile. Those four sites get the sentence on the strength of the implementer
result, and their effect is unmeasured (see Could Not Verify).

**2026-10-20, after the measurement:** O3 (keep only if time falls) and FIX-004's
acceptance text (revert only on a "remove" verdict) disagreed on the "no measurable
difference" outcome, which is what the measurement returned. O3 is the must-pass objective
and wins: the sentence was reverted. It can be re-applied by cherry-picking the FIX-003
commit once a fixture large enough to show a difference is measured
(`.trd-state/speed-sentence/result.md`).

## Non-Goals

- No change to agent definition files, command files, or any audit-*.js, create-prd.js, or the
  verify-functional judge, exercise or debug stages.
- No mod, no hook, no runtime toggle. The before/after is two code states, not a flag.
- No change to models or effort levels.

## Verification Artifacts

None apply — the change is prompt text in workflow scripts plus a timing script; no UI,
document page or design surface is produced.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Is a one-file trivial task large enough to show a speed difference? | Use it anyway (it is the fixed task that exists and hits both targets); if the medians are within 20% of each other, report "no measurable difference" rather than a win | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `test/smoke/ledger-timing.js`: reads one or more `dispatch.jsonl` files, pairs start/stop by `agent_id`, prints median and max duration (seconds) per `agent_type`, and counts agents with a start but no stop. Add an optional `SMOKE_IMPL_ARGS` variable to `implement-one-task.sh`, appended to its `/implement-trd` prompt (default empty, so the scenario's behaviour is unchanged) | O3 | None | Given a fixture ledger with two backend-implementer agents (60s, 120s) and one verify-app (30s), it prints backend-implementer median 90s max 120s n=2 and verify-app 30s n=1; an unmatched start is counted as unfinished, not as a duration; a Jest test asserts this. With `SMOKE_IMPL_ARGS` unset the scenario's prompt is exactly `/implement-trd docs/TRD/smoke-greet.md`, and with it set to `--no-verify` the prompt ends with `--no-verify` |
| FIX-002 | BEFORE runs: on the unchanged code, run `SMOKE_KEEP=1 SMOKE_IMPL_ARGS=--no-verify test/smoke/run-smoke.sh implement-one-task` 5 times, sequentially; save each kept project's `.trd-state/*/dispatch.jsonl`, `.trd-state/_dispatch.jsonl` (whichever exist) and `implement.json` under `.trd-state/speed-sentence/baseline/run-N/`; run `/audit-build` once on the kept project of baseline run 1 and save its gap list; run FIX-001's script over the ledgers [LIVE] | O3 | FIX-001 | Five run directories exist, each with a ledger holding at least one implementer and one verify-app start/stop pair; `baseline/summary.txt` holds the script's output; `baseline/audit-gaps.txt` lists the baseline audit's gaps (possibly none) |
| FIX-003 | Add `TIME_MATTERS` and append it (after a blank line) to: every task prompt in `implement-phase.js`, its gate `verifyPrompt`; `fixPrompt` in `sweep.js`; the render and reconcile prompts in `verify-functional.js`; the `ground:merge` prompt in `create-trd.js`. Mirror all four files to `.claude/workflows/` | O1, O2 | FIX-002 | A harness test (`test-harness.js` `runWorkflow` with a recording `agent` stub) shows the captured prompt for `task:*`, `gate:verify-app`, `fix:*`, `render`, `reconcile` (verify-functional) and `ground:merge` ending with the sentence; the captured prompts for audit-trd's `verify:*`, verify-functional's `judge`, `exercise` and `debug`, and sweep's `triage` do not contain "Time matters"; each of the four `TIME_MATTERS` constants equals the sentence quoted under Intended Change character for character (the test holds that exact string as a literal and compares against it, so a paraphrase or a typo fails); each pair under `packages/core/workflows/` and `.claude/workflows/` is byte-identical |
| FIX-004 | AFTER runs and verdict: repeat FIX-002's 5 runs on the changed code into `.trd-state/speed-sentence/after/run-N/`; for each after-run, run `reconcile()` from `implement-state.js` over its `implement.json` and record the reopened count; run `/audit-build` once on the kept project of after-run 1 and compare its gaps with `baseline/audit-gaps.txt`; write `.trd-state/speed-sentence/result.md` with before/after medians, the zero-counts, and the verdict [LIVE] | O3 | FIX-003 | `result.md` states implementer and verify-app median seconds before and after; failed tasks, retries (`retry_count`), reconcile reopenings per after-run, and audit gaps not present in the baseline audit; and one verdict line: keep (both medians fell by more than 20%, all counts 0), remove (any count non-zero), or no measurable difference (both medians within 20%). If the verdict is remove, FIX-003's edits are reverted in the same task |

## Task Grounding

### FIX-001
- **Touches:** `test/smoke/ledger-timing.js`, `test/smoke/ledger-timing.test.js`, `test/smoke/scenarios/implement-one-task.sh`
- **Reuse:** the ledger shape written by `.claude/hooks/dispatch-ledger.js` — `start` events carry `agent_type`, `stop` events do not, so correlate on `agent_id` (async-discipline.md: "correlate on `agent_id`, not `prompt_id`") [read]
- **Replaces:** nothing; the earlier per-type durations in this session were computed ad hoc [read]
- **Follow:** plain Node, no dependencies, `'use strict'`, CLI takes file paths as arguments
- **Careful:** a smoke run's ledger may land in `.trd-state/_dispatch.jsonl` when no feature pointer is set; accept either path. The scenario builds its prompt at `implement-one-task.sh:69` (`PROMPT="/implement-trd ${TRD_REL}"`) [read]; append `${SMOKE_IMPL_ARGS:+ $SMOKE_IMPL_ARGS}` there and nowhere else

### FIX-002
- **Touches:** `.trd-state/speed-sentence/baseline/`
- **Reuse:** `test/smoke/scenarios/implement-one-task.sh` and `SMOKE_KEEP=1`, which keeps the throwaway project (`implement-one-task.sh:45-51`) [read]
- **Replaces:** nothing
- **Follow:** run sequentially, never in parallel, so runs do not compete for the subagent pool
- **Careful:** each run is a live model session of roughly 5–13 minutes with a 14-minute cap (`smoke_claude ... 840`) [read], so the 5 baseline runs take roughly an hour; must run before FIX-003 changes any workflow file. `packages/full/workflows` links to `packages/core/workflows`, so a smoke run picks up whatever is in `packages/core` at that moment [read by reviewer]

### FIX-003
- **Touches:** `packages/core/workflows/implement-phase.js`, `packages/core/workflows/sweep.js`, `packages/core/workflows/verify-functional.js`, `packages/core/workflows/create-trd.js`, `.claude/workflows/implement-phase.js`, `.claude/workflows/sweep.js`, `.claude/workflows/verify-functional.js`, `.claude/workflows/create-trd.js`, `packages/core/workflows/speed-sentence.test.js`
- **Reuse:** dispatch sites `implement-phase.js:189` (`agent(rec.prompt, opts)`) and `:229` (`GATE.verifyPrompt`); `sweep.js:240` (`fixPrompt`); `verify-functional.js:1121` (reconcile) and `:734` (`buildRenderPrompt`); `create-trd.js` `ground:merge` at ~`:809` [read]. `test-harness.js` `runWorkflow` + `makeAgentStub`, whose `agent.calls` records each prompt [read]
- **Replaces:** nothing
- **Follow:** append as `prompt + '\n\n' + TIME_MATTERS` at the call site, so the base prompt text is unchanged
- **Careful:** `implement-phase.js` and `create-trd.js` both dispatch `backend-implementer`; only the named labels get the sentence, never every call of an agent type. `.claude/workflows/` copies are currently byte-identical to `packages/core/workflows/` [ran] and must stay so

### FIX-004
- **Touches:** `.trd-state/speed-sentence/after/`, `.trd-state/speed-sentence/result.md`
- **Reuse:** FIX-001's script; `reconcile()` in `.claude/lib/implement-state.js` (as used by `/implement-trd --reconcile`) [read]
- **Replaces:** nothing
- **Follow:** report numbers with their unit and their baseline ("84s, was 139s")
- **Careful:** a single trivial task may finish so fast that no difference shows; that is OQ-1's "no measurable difference" verdict, not a failure

## Could Not Verify

- Whether workflow agents dispatched with an `agentType` also receive the sentence through any other path (for example a platform-level system prompt): assumed not, since no prompt in `packages/` or `.claude/` mentions time today.
- The effect of the sentence on the sweep fix, grounding merge, render and reconcile prompts: the fixed-task run never reaches them, so they are covered only by FIX-003's prompt test and inherit the implementer verdict (a remove verdict removes them too).
- Whether a gain on one trivial task carries over to real multi-task features: the measurement is deliberately small; the dispatch ledgers of later real runs (implementer median 139s, slowest 10% over 468s, n=253) are the wider check.
