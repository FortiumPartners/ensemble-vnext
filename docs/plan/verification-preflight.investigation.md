# Investigation: verification-preflight

**Kind**: change
**Weight**: medium
**Route**: plan

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | No environment or setup check stops, pauses or asks before implementation starts or continues. Every problem the checks find is recorded as a flag with a stated default, the build runs in full, and the flag appears in the readout. | owner instruction, 2026-10-23: "it can't block implementation from starting. It can flag problems but can't lead to stopping implementation" | yes |
| O2 | Before each verification attempt, the loop checks that the running build is the current HEAD and that no other checkout holds the dev stack. A failed check is reported as a setup failure naming the problem: the attempt is not judged, nothing is sent to the debugger, and it never counts toward `stalled`. | owner instruction, 2026-10-23 (fix list item 2) | yes |
| O3 | A verification run whose environment stays broken ends with a distinct outcome, `setup-failure`, that names what is wrong and what would fix it. It is never reported as `stalled` or `stuck`, and the run's banner and report say it is the environment, not the code. | owner instruction, 2026-10-23: "a broken setup should report as a setup failure, not 'stalled'" | yes |
| O4 | At plan time, the TRD records which environment verification runs against, whether the loop can refresh it, and what cannot be checked there. | owner instruction, 2026-10-23 (fix list item 2) | |

## Intended Change

The source is the owner's instruction in this session (2026-10-23), refining fix-list item 2
from the usage analysis: of 40 functional-verification runs, 14 ended without converging, and
at least 12 of those 14 were test-rig failures, not product defects. Examples include a simulator
running a stale build, a dev stack held by another checkout, and an evidence-path typo that held
one feature at "stalled, 55 of 57" for six days.

**Before** (all [read], cited in Grounding):
- `/implement-trd` §3.6a asks the owner one batched `AskUserQuestion` before the phase loop when
  an environment "needs one thing from the owner" (expired credential, deploy approval, service
  to start by hand). The run waits on that question. `/verify-build` step 2 repeats the same
  question.
- Nothing checks, per attempt, whether the running build is the current commit or whether
  another checkout holds the dev stack. No commit is recorded per iteration; the only freshness
  signal is a per-run timestamp floor on evidence files.
- When Exercise runs against a dead or stale stack, its failures are judged `not_met` and sent
  to the app-debugger. The debugger's fix cannot close the gap, so `decideNext` returns
  `exit-stalled` ("remediation is not converging"), which blames the code.
- No outcome distinguishes "the environment is broken" from "the code is wrong".
- No plan-time document asks which environment verification uses, whether it can be refreshed,
  or what cannot be checked there.

**After**, checkable:
1. §3.6a and `/verify-build` step 2 no longer call `AskUserQuestion` for an environment. An
   environment that needs the owner is recorded with a new status (`needs-owner`), the reason,
   and the default applied (criteria needing it resolve `not_verifiable`). The build proceeds
   with no wait, and the readout's ISSUES names each such environment and what the owner must do.
2. Each verification iteration starts with a setup check, before Exercise. It reports, per
   environment the iteration will touch, three things: whether the environment is reachable,
   whether its running build matches HEAD, and whether another checkout holds it.
   - "Matches HEAD" uses the identity method the project declares in `verification.md`. With
     none declared, the check records `unknown`: a flag, not a failure.
   - "Another checkout holds it": a process listening on a declared port, or holding a declared
     resource, whose working directory is outside this checkout.
3. When the setup check fails, the loop runs the declared fast refresh (verification.md §2) once
   and re-checks. If the check still fails, the iteration is recorded as a setup failure: Judge
   and Debug are skipped, the attempt does not count toward `stalled`, and the run ends with
   outcome `setup-failure`. The report names what is wrong and what would fix it.
4. `setup-failure` is a new outcome beside satisfied/stalled/stuck/unbuilt/insufficient-coverage/
   must-pass-unproven. It is labelled and rendered everywhere outcomes are rendered.
   `/refine-verification` treats it as an environment problem, not a code gap, and nothing
   promotes it to a fix task.
5. A setup failure never stops or retries the build. `/implement-trd` completes every phase, and
   its banner reports the verification outcome `setup-failure` with the named problem.
6. The light TRD template in `/plan` and the TRD authoring contract gain a section,
   `## Verification Environment`, that records: the environment, whether the loop can refresh
   it (and with what), and what cannot be checked there.
   - Absence is valid and is reported, never fatal.
   - `/implement-trd` §3.6a reads the section, when present, as the declared target for that
     feature.

## Decision

- **Flags, never stops** (owner rule, 2026-10-23). Every new or changed check records a status
  and a default. None calls `AskUserQuestion`, ends a run STUCK, or withholds the build. The one
  behaviour a check changes is how verification results are labelled.
- **The setup check is an agent step, not script code.** `verify-functional.js` has no shell
  and no filesystem (:16-18). The check is dispatched as a small schema-bound agent at the top
  of each iteration, before `phase('Exercise')` (:1298). Its result is decided by a pure lib
  function, the same way `decideNext` is, so the decision is unit-tested and the agent only
  gathers facts.
- **One refresh attempt, then report.** The loop already owns the declared fast refresh, though
  today only Debug runs it (:691-698). Running it once when the setup check fails is the cheapest
  repair, and verification.md §2 already authorizes it. Retrying beyond once would re-create the
  burned-iteration problem.
- **A setup failure ends the run rather than skipping one iteration.** A broken environment does
  not heal between iterations without a human, so continuing would only burn iterations.
  - Rejected alternative: keep iterating and let Exercise mark each criterion `not_verifiable`.
    That hides the cause across many criteria, which is today's failure.
- **Unknown build identity is a flag, not a failure.** Most projects declare no way to read
  their running build's commit. Failing on `unknown` would turn the new check into a new rig
  failure.
- absorbed: §3.6a's owner question → flag. [BLOCKS] O1 cannot hold while the question exists.
- absorbed: `/verify-build` step 2's copy of the same question. [BLOCKS] same reason; it is the
  same step reached from a different entry point.
- not absorbed: Exercise crashing mid-run against a stack that died after the setup check
  passed. It is still judged `not_met` and sent to Debug. The setup check catches the common
  case, a stack dead or stale before the attempt, and this work succeeds without the rare case.
  Reported in Could Not Verify.
- not absorbed: a per-criterion commit stamp on every `met` result (fix-list item 4, "tie each
  pass to its commit"). This is a separate item, and this one works without it.
- not absorbed: evidence-path typos (the six-day stall). That is a locator problem, already
  routed back to Exercise by `EVIDENCE_CAUSES`, not an environment problem.

## Grounding

- `packages/core/commands/implement-trd.md` §3.6a (:866-930) and its `.claude/` mirror.
  - The owner bucket is at :893-894 and the single `AskUserQuestion` at :896-899, with default
    `needs-owner-declined` (:899).
  - The persisted shape `environments: {status: usable|unusable|needs-owner-declined}` is at
    :911-917; its meaning is at :920-922, and the state schema mirror is at :1362 and :1389-1393.
  - §8.1a reads the shape back with no question (:1672-1675). A resume runs §3.6a late
    (:1643-1646).
  - Replaces: the `AskUserQuestion` paragraph and `needs-owner-declined`'s "owner did not answer"
    meaning. [read]
  - Step 9 banner: outcome diagnosis at :1930/:1951, Next line at :1990. [read]
- `packages/core/commands/verify-build.md` and its mirror.
  - Step 2 repeats §3.6a's question (:76-86). It is skipped under `--chained` (:88-90) and in
    the fix loop (:396-401, :608-617).
  - Outcome rendering is at :317-318, :347, :353, :364, :415, :504-506, :556-558.
  - `environment-unreachable` is never promoted to a fix task (:503). [read]
- `packages/core/workflows/verify-functional.js` and its mirror.
  - Loop at :1276; Exercise at :1298-1420; Judge at :1422-1431; settled-map fold at :1442-1459;
    exit at :1461-1473; gap split at :1477-1501; Debug at :1503-1542.
  - No shell or filesystem (:16-18). `REFRESH_COMMAND` is set at :66 and is used only by Debug's
    prompt (:691-698).
  - Judge schema outcome enum at :830, outcome list in prompts at :598/:627/:668, renders at
    :966/:1043/:1081, workflow `stuck` returns at :1251-1268 and :1548-1565.
  - A crashing Exercise is judged failed and goes to Debug (:565-566, :1346-1355, :1401). [read]
- `packages/core/lib/functional-verification.js` and its mirror.
  - `decideNext` is at :304-453, with precedence unbuilt → satisfied → stalled (:378-391) →
    stuck → remediate, then the coverage re-label (:412-432) and must-pass (:439-450).
  - `OUTCOME_LABEL` is at :796-804, `DIAGNOSIS_OUTCOMES` at :848, the `environment-unreachable`
    cause at :819-836, and the renderReport doc at :960.
  - The evidence `since` floor is per run (:94-117); no HEAD sha is recorded anywhere (grep
    `rev-parse|headSha|buildSha`: no hits). [ran]
  - Reuse: the `decideNext` pattern (a pure decision in the lib, facts from agents) for the new
    setup decision.
- `packages/core/contracts/functional-verification.md` lists outcomes at :565 and :575. [read]
- `packages/core/commands/refine-verification.md` has its Diagnose step at :70 and cause
  handling at :83-94. [read]
- Plan time:
  - `packages/core/commands/plan.md`'s light TRD template has `## Verification Artifacts` at
    :568-578, which selects check skills only.
  - `create-trd.md` Section 9a is at :605-631.
  - `trd-authoring.md` Section 9a is at :653-690.
  - No document asks for environment, refreshability or unverifiable areas.
  - `trd-parser.js` does not parse Verification Artifacts. It parses Could Not Verify (:655),
    Open Questions (:578) and Deferred (:700). [read]
- Detecting another checkout: nothing exists (grep `worktree|lsof|EADDRINUSE|another checkout`:
  no hits) [ran]. `verification.md` §1a's resource table names ports and resources and asks the
  owner how instances are told apart (template :47-59, :76-84); the framework only sizes slices
  from it. [read]
- Tests that pin the outcome set: `functional-verification.test.js`, `verify-functional.test.js`,
  `contracts/functional-verification.test.js`, `verify-command-surface.test.js`,
  `fix-plan.test.js`, smoke `verify-fix`, `verification-artifacts`, `verification-md-setup`. [ran]
- Mirrors: all ten files are byte-identical to `.claude/` today [ran]. Parity is enforced by
  `runtime-integrity.test.sh:53-99` for implement-trd.md and trd-parser.js, by
  `verify-command-surface.test.js:47-52`, by `verify-functional.test.js:3080-3083`, and by
  `contracts/functional-verification.test.js:24`. [read]
- Conventions: owner-governed `verification.md` is never edited by a run (constitution 1.4.0).
  This change reads it and adds nothing to it; any identity or claim method is read from what
  the owner already wrote (§1a, §2, `.claude/verification-notes.md`).

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | How does the setup check read a running build's commit, when projects differ (web dev server, simulator, deployed preview)? | It uses only a method the project already declares (verification.md §2 or verification-notes.md). With none declared it records `unknown`, which is a flag and never a failure. A later `/verification-setup` question can add a declared method; that skill is not changed here. | |
