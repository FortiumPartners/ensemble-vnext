# Verification sweep — ten independent fixes

**For `/sweep`. Not a design document.** Each item below is self-contained: a defect, the file
it lives in, and what fixed looks like. Nothing here needs another item to land first except
where an item says so.

The design work these sit beside — making the verification loop converge instead of restarting —
is `docs/plan/verification-parallelism.brief.md`, and it is a `/plan`, not a sweep. Do not read
that brief for these ten; everything needed is here.

**Two grouping notes for triage**, because the file map is not what the item numbering suggests:

- **Items 1, 3 and 9 are the same few lines** — the judge's state-write instruction at
  `packages/core/workflows/verify-functional.js:213-232`. One fixer, one pass, three changes.
- **Items 5 and 6 are both `packages/core/lib/discovered.js`**, and 6 must land with or before
  5. One fixer.

**Every runtime file in this repo exists twice** — `packages/core/<x>` and the vendored
`.claude/<x>` mirror — and `runtime-integrity.test.sh` asserts they are byte-identical. Edit
both, always. A fix to one copy fails the battery.

---

## 1. The state file drops `tier1`, so a rerun cannot tell "never reached" from "reached and failed"

**Where:** `packages/core/workflows/verify-functional.js:217-218` — the judge is told to write
`"criteria": [ <one entry per criterion: "id", "status", "artifact"> ]`.

`tier1` (`pass` | `fail` | `skipped`) is already computed by
`packages/core/lib/functional-verification.js`, already returned in the workflow result, and
already permitted by `JUDGE_CRITERION_SCHEMA` at line 308. It is dropped only because that
instruction does not list it.

**Why it matters:** it is the only field separating a criterion that was never exercised from
one exercised and failed. In the run that motivated this, the `tier1: fail` count ran 25 → 23 →
1 across three iterations while genuine coverage went 4 → 4 → 11 — the two are not the same
number and the state file keeps neither.

**Fixed:** the enumerated key list includes `tier1`, and a state file written by a real run
carries it on every criterion.

## 2. A run below any reasonable coverage bar exits `stuck`, which reads as a crash

**Where:** `packages/core/workflows/verify-functional.js` — `OUTCOME_BY_ACTION` at line 410 and
the judge's `decide-next` instruction around line 251.

`stuck` currently covers both "this loop broke" and "this loop worked and verified almost
nothing". Those need different words, because the second is a normal result that calls for more
environment, not a bug report.

**Fixed:** a distinct `insufficient-coverage` outcome, and the report states the ratio and
**which** criteria are uncovered — membership, not just a count. A reader should not have to
diff two lists to find out who is missing.

**Note for the fixer:** the numeric floor is an open owner decision. Do not invent one. Make
the outcome reachable and the ratio visible; leave the threshold as a named constant with a
comment saying it is unset pending the owner, or key it off "any criterion uncovered" if that
is the only defensible reading. **Inventing a number here is the failure this framework
documents most often.**

## 3. Nothing terminates the loop on no progress

**Where:** same instruction block, `packages/core/workflows/verify-functional.js:229` — which
says outright: *"`gapsClosed` is an AUDIT RECORD, not a loop input: nothing reads it back to
drive the stall rule."*

So the count of gaps each iteration closed is computed, written, and never consulted. A loop
that closes zero gaps twice running will still burn its full cap.

**Fixed:** two consecutive iterations closing zero gaps ends the loop with the `stalled`
outcome that already exists, rather than running to the cap.

## 4. An unfilled `verification.md` is never detected, though it takes milliseconds

**Where:** new check, called before anything dispatches. Template to compare against:
`packages/core/templates/claude-directory/rules/verification.md`. Project copy:
`.claude/rules/verification.md`.

A project whose `verification.md` is byte-identical to the shipped template has declared no
environments, no refresh commands and no credentials — it **cannot** support functional
verification, and every criterion will come back environmentally blocked after a full loop has
run.

True of 2 of the 4 reference repos checked.

**Fixed:** the check runs before dispatch and reports plainly that the file is unfilled, naming
it. It does not have to block — reporting it up front is the whole value.

## 5. `promoteToTrd` emits a task row that cannot be implemented or verified

**Where:** `packages/core/lib/discovered.js`, `promoteToTrd()`.

Three defects in the row it generates: a placeholder `Serves` value that names no objective, a
`Touches` field carrying one file when the work spans several, and an acceptance criterion
phrased so that it passes whatever happens.

**Fixed:** `Serves` names a real objective or the row is not written; `Touches` carries every
file the record implicates; the acceptance criterion states an outcome that can fail.

**Land item 6 with this or before it.** Same file, and 6 governs which records reach this code
at all.

## 6. `not_verifiable` must never promote to a task

**Where:** `packages/core/lib/discovered.js` — the filter deciding which records `promoteToTrd`
converts.

A criterion that **failed** has something to build. A criterion that **could not be tested**
does not: its blocker is environmental. Promoting one mints a TRD task whose content means "go
deploy this", which no implementer can action.

On current data that is **55 phantom tasks**.

**Fixed:** `not_met`, `stalled` and `unbuilt` promote. `not_verifiable` never does. A test
covers the exclusion, because this is the item whose absence does visible damage.

## 7. The environment preflight sits hours too late in the run

**Where:** move from `packages/core/commands/implement-trd.md` §8.4a to §3.6. Mirror the change
in `packages/core/commands/verify-build.md` §2, which delegates to it.

§8.4a runs after the entire phase loop and the end-of-run review. So the single batched question
to the owner — the one asking for the one thing the environment needs — lands hours into an
unattended run, which is precisely when nobody is there to answer it. §3.6 already performs
early `--verify` work and is where it belongs.

**Pure relocation.** No behaviour change beyond when it happens. `[ran]`

## 8. `verification.md` never reaches the loop

**Where:** the argument list `packages/core/workflows/verify-functional.js` receives — 15 fields,
none of them this file.

So the owner's environment declarations affect only the orchestrator's own preflight reasoning,
which nothing records and no code checks. The loop itself runs blind to them.

**Fixed:** the file's text is passed as an argument and reaches the agents that need it. Every
environment-aware behaviour anyone builds later depends on this one line. `[ran]`

## 9. The reason a criterion was unverifiable is recorded nowhere structured

**Where:** same instruction block as items 1 and 3,
`packages/core/workflows/verify-functional.js:217-218`.

The `reason` field is empty in all 55 `not_verifiable` entries. The explanation exists only as
prose inside the rendered report, where nothing can query it.

**Why it matters:** structured, it yields a post-deploy re-check list. **43 of 96** blockers
needed a deploy — so those criteria are not permanently unverifiable, they are pending. Nothing
brings them back today.

**Fixed:** `reason` is in the enumerated key list and populated for every non-`met` criterion.
`[ran]`

## 10. Nothing checks that new code is actually reachable

**Where:** the phase gate in `packages/core/workflows/implement-phase.js`.

A deterministic grep, no agent: does every newly exported symbol have a non-test caller?

**Why it matters:** it would have caught both of the "built but never wired" production failures
behind this investigation — code that was written, tested, committed, and called by nothing.

It needs no environment, no declarations and no owner input, and generalises to every repo. It is
the cheapest item here and the most portable.

**Fixed:** the gate reports any exported symbol whose only callers are test files.
