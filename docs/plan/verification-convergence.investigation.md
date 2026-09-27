# Investigation: verification-convergence

**Kind**: change
**Weight**: medium
**Route**: plan

Source brief: `docs/plan/verification-parallelism.brief.md` (measurements, rejected options,
open questions). This record re-grounds that brief against the code and **corrects it in two
places** — see Grounding.

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | An iteration exercises only the criteria not yet proven, so the loop's open set shrinks monotonically instead of being re-walked whole | the brief's measurement: 62 criteria re-walked 3 times proved 11 in 101 min; the same criteria as 4 sized slices with repairs held back closed 21 more in 28 min [ran] |
| O2 | A criterion's tier-1 evidence check resolves a locator INSIDE the claimed artifact, so attaching a file cannot satisfy it | one jest log was cited by 25 criteria and passed the existence gate for all 25; `checkEvidence` never opens the file [ran] |
| O3 | Evidence-gathering and repair do not interleave within one pass | 2 proven criteria reverted when a rebuild landed between capture and judgement; the `cap: 1` run rebuilt nothing and reverted nothing [ran] |
| O4 | A run that verified little exits under a name that says so, not `stuck` | the run exited `stuck` having proven 18%; `stuck` means "I tried and the target resisted", not "I never reached most of the target" [ran] |
| O5 | The owner's environment declarations can express read-only access, a cheap iteration refresh distinct from a full deploy, and a disposable per-branch target | the table has only "may DEPLOY?" and "may RESTART?"; `lightning-lane` authorises production for read-only verification in prose where nothing can read it, and `gcats` records a probe row that can never be removed — the hazard that manufactured the run's one false defect [ran] |
| O6 | `--verify` is the default, with `--no-verify` to opt out | it ran on 40 of 145 features precisely because it is opt-in; owner decision, 2026-09-26 |

## Intended Change

`beforeRunForbidden` is true for `kind: change` (`plan-weight.js`), so this section states the
outcome to reach and records no before-run.

**O1 — the open set.** `buildExercisePrompt` currently hands the Exercise agent every criterion
and instructs it: *"walk every one of the following N criteria … Every criterion below must
appear in your claims array exactly once, id-for-id — do not narrow to a subset."* After this
change an iteration receives only the open set — criteria not `met` in the carried-forward state
— and that set is split into slices sized to one walk of the system, dispatched through
`parallel()`. Proven criteria carry their prior artifact and status forward untouched.

Checkable: on a second iteration where iteration 1 proved k of N, the Exercise stage receives
N−k criteria, and the state file still reports k as `met` with their original artifacts.

**O2 — the locator.** A claim becomes `{criterion, artifact, locator}`. Tier 1 passes only when
`locator` is found inside `artifact`. `checkEvidence` gains a `failure: 'locator-not-found'`
alongside its existing `missing`/`empty`/`stale`/`not-a-file`/`no-artifact`.

**Stated limit: tier 1 cannot check image evidence.** A criterion whose only possible evidence
is pictorial (colour, spacing, scroll behaviour) is marked judge-only at authoring time and
skips tier 1 rather than failing it — which is why assertions matter more than screenshots.

Checkable: one artifact cited by two criteria with different locators passes for the criterion
whose locator is present and fails for the one whose is not — the case the existence check
could not distinguish.

**O3 — no interleaving.** Within one pass, Exercise captures and Judge rules; Debug's repairs
land between passes, never between capture and judgement.

Checkable: no iteration's dispatch ledger shows a Debug agent starting before that iteration's
Judge returned.

**O4 — the honest outcome.** A new terminal outcome `insufficient-coverage`, distinct from
`stuck`, with the report naming the ratio and the members of the uncovered set.

**It is the only new value in a state machine two other things read.** `outcome` is the
terminality marker `/implement-trd` §3.6 uses to decide whether `--verify --resume` re-enters
the loop, and both `/implement-trd` and `/verify-build` render it into a banner. All three must
handle the new value or a finished run is resumed forever.

**The floor is an open question (OQ-1), not a number to invent.** Make the outcome reachable and
the ratio visible; leave the threshold a named constant marked unset.

**O5 — the declarations.** Three additions to `verification.md` and its shipped template: a data
permission column (read-only / may write / must not be touched); a second refresh command per
environment, separating a cheap iteration refresh from the full deploy, where **the end-of-run
full run is a gate that fails loudly, not a convention**; and a `preview` row taught as the
default ahead of `dev`/`staging`/`production`.

**The framework reads this file and never writes it** (`verification.md`'s own header). The
template ships a new shape; filling it in stays the owner's.

**O6 — the default.** `--verify` on by default, `--no-verify` to opt out. **Sequenced last**:
before O1–O4 land, the default would make 11-of-62 the standard experience. Wall clock is
unpriced — the dispatch ledgers hold the data.

## Decision

**Scope the open set by carrying state forward; do not add a second loop.** An outer
implement/review/verify loop was considered and rejected in the brief: two capped loops give 9
attempts and two termination stories. Convergence belongs inside the existing loop.

**Fan out Exercise only. Judge and Debug stay single agents.** A human verifies a build by
starting it once and walking the list; N parallel exercisers means N startups competing for one
port. Slices are bounded by what the owner declared and what the test runner's own config
already says — Playwright sets worker counts, `pytest-xdist` exists in `tbd-backend` and is
switched off. **Pass a slice and defer; never re-schedule.** Build a capacity reader, not a
capacity model.

**Follow the skip-Exercise precedent already in the file.** The loop already skips Exercise
entirely when Debug reported unbuilt gaps, with a comment calling a re-walk "exactly the waste
this skip exists to avoid". O1 generalises that existing judgement; it does not introduce it.

**Prefer reading something already produced over producing something new.** Thirteen instances
in the source run were information present and unread.

Rejected, with reasons, in the brief and not revisited here: `--harden` (first-pass source
survives at 96.4%); lanes keyed on runtime (key on declared mutation); retrying
`not_verifiable` in-session (43 of 96 need a deploy that will not happen mid-run); requiring
artifacts to name their criteria or capping criteria per artifact (refuted both ways —
addressability, not cardinality); framework rules keyed on environment NAME (the table is the
entire policy).

**Absorbed / not absorbed.** Nothing was absorbed: the four blockers this investigation found in
the path were fixed and committed before this record was written (`53deea8`, `652f7dc`) — the
state file now persists `tier1` and `reason`, `not_verifiable` no longer promotes to a task, and
`verification.md` reaches the loop. O5 depends on that last one.

not absorbed: the phase-gate check that new exports have a non-test caller — deferred by sweep
triage as a new static-analysis capability, recorded in the ledger. This work succeeds without it.
not absorbed: `promoteToTrd`'s row defects — fixed in `652f7dc`, unrelated to convergence.

## Grounding

**`packages/core/workflows/verify-functional.js`** (and its byte-identical `.claude/` mirror —
`runtime-integrity.test.sh` requires both be edited).
- `buildExercisePrompt` (l.148) builds from `criteriaJson()` = all `CRITERIA`, and instructs
  "do not narrow to a subset". **This instruction is what O1 replaces** — the defect is not
  missing data, it is an explicit prohibition. [read]
- One Exercise agent per iteration (l.506), `agentType: 'verify-app'`. `parallel()` is **not
  used in this workflow**, though 7 other workflows use it and the test harness stubs it. [read]
- `skipExercise` (l.495) already skips Exercise wholly when Debug reported unbuilt gaps —
  the precedent named in the Decision. [read]
- `reconcileClaims` (l.398) maps over all `CRITERIA` and logs a short return; it must become
  open-set-relative or it will report every carried-forward criterion as unwalked. **Careful:
  this is the likeliest place to break a correct run.** [read]
- `previousGaps` (l.459, 536, 550) **IS read** — seeded from a resume snapshot, threaded into
  the judge prompt, and used for `closed` and the stall rule. **The brief's claim that it is
  "written every iteration and never used" is WRONG** and must not reach the TRD. What it is
  not used for is scoping Exercise. [read]
- The judge writes the state file itself, per the instruction at l.213-232; `tier1` and `reason`
  were added to that key list in `53deea8`. Carry-forward reads what that instruction persists,
  so the two must stay in step. [read]
- `JUDGE_SCHEMA` (l.320) and `OUTCOME_BY_ACTION` (l.410) both enumerate the four actions/
  outcomes; O4 adds to both. [read]

**`packages/core/lib/functional-verification.js`**
- `checkEvidence` (l.57) checks: artifact claimed, `statSync` succeeds, `isFile()`, non-zero
  bytes, `mtimeSec > sinceSec`. **It never opens the file** — which is exactly why one log
  satisfied 25 criteria. O2 changes this function. [read]
- `decideNext` (l.132) already exits `stalled` on the first zero-gap iteration (l.180), with
  `previousGaps.length > 0` load-bearing against a resumed run stalling immediately. **The
  brief's withdrawn item 3 claimed this did not exist.** O4 adds a branch beside it. [read]
- `isVerificationUnfilled` (added `652f7dc`) is the precedent for where an O5 reader belongs. [read]
- 788 Jest tests pass on HEAD; `functional-verification.test.js` and
  `verify-functional.test.js` are the suites this work must keep green. [ran]

**`.claude/rules/verification.md` + `packages/core/templates/claude-directory/rules/verification.md`**
- §1's table has `Loop may DEPLOY to it?` and `Loop may RESTART it?` and no data-permission
  column; §2 has one refresh command per environment. Both are what O5 extends. [read]
- **Owner-governed: an agent READS this and never writes it.** The TEMPLATE is ours to change;
  a filled-in copy is not. `scaffold-project.sh --refresh` must not overwrite a filled copy —
  that guard was added in 4.7.1 and this work must not regress it. [read]

**`packages/core/commands/implement-trd.md`, `verify-build.md`**
- Both parse `--verify` and both render the outcome into a banner; O4 and O6 touch both, in both
  mirrors. §3.6a now holds the environment preflight (moved in `652f7dc`). [read]

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | The coverage ratio below which a run exits `insufficient-coverage`. Any number is a policy choice; 18% was clearly below it | Left the threshold a named constant marked unset, with the outcome reachable and the ratio reported. No number invented | owner-only |
| OQ-2 | May an agent create simulators or containers? The source run's prep agent ran `xcrun simctl create`. Resource allocation on a shared machine is the owner's call | Assumed NO: slices are bounded by what is already declared and already running. A capacity reader, not an allocator | owner-only |
