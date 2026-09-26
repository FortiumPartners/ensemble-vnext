# Brief: a verification loop that converges

**Written** 2026-09-26. **Status:** input to one `/sweep` and one `/plan`. Not a TRD.

---

## The problem

**The loop proved 11 of 62 criteria and stopped. It restarts instead of converging.**

Three rounds, all 62 criteria each round, repairs interleaved with evidence-gathering, nothing
carried forward. Each round re-litigates everything from whatever it happened to capture that
time. A structure like that cannot improve on itself — and 11 of 62 is what it produced in 101
minutes. [ran]

**The same criteria, re-run as four sized slices with repairs held back, closed 21 more in 28
minutes.** No regressions. That is the whole case. [ran]

**Landing at 57 of 62 with five named gaps is a good outcome.** Landing at 11 and calling it
`stuck` is not. The target is convergence, not perfection.

## What converges

Five mechanics. **The framework already has every input for all five and consumes none of
them.**

1. **Slice the OPEN set, sized to what one agent can walk.** ~8 criteria with a stated scenario
   — which entry point, which dates, what to tap — not 62 and explore. The criterion count sits
   in `success-definition.md` before dispatch; nothing reads it.
2. **Evidence-only passes. Repairs batched between them.** Run 1 interleaved them: rounds 1 and
   2 each proved 4 because the budget went on fixes and rebuilds, and a rebuild between capture
   and judgement is what made 2 proven criteria revert. Run 2 ran at `cap: 1` — nothing rebuilt,
   nothing reverted.
3. **Carry forward what is proven.** The state file already holds `{id, status, artifact}` per
   criterion, and `previousGaps` is written every iteration. Neither is read as a starting
   position. The freshness check that makes carry-forward safe already exists and already fires.
4. **Terminate on no-progress, not on a round count.** Three is arbitrary. `gapsClosed` is
   already computed — `[0, 1, 9]` for Run 1. A loop that stops when the open set stops shrinking
   runs to 57; a loop that stops at round 3 quits at 11.
5. **Report the ratio and name the open set.** The loop knew it had proven 18% and exited
   `stuck` — a word meaning "I tried and the target resisted" for a run whose truth was "I never
   reached most of the target." Iteration 2 also held its count at 4 while swapping which 4,
   so anyone watching totals saw a plateau over a set turning over underneath.

## Two things that make a pass land

**Assert while you capture.** Across 30 Maestro flows: **73 `tapOn`, 39 `takeScreenshot`, 6
`assertVisible`.** They drove the app and photographed it instead of asserting against it. An
assertion emits text a deterministic check can read; a PNG does not. The one all-text slice had
the best hit rate and produced the only blockers that named a mechanism rather than a gap.

`assertVisible` needs no new format — the flow file is already the manifest — and generalises
free to Playwright's `expect().toBeVisible()`, whose reporter already serialises it. A few
criteria are genuinely pictorial (colours, spacing, scroll behaviour); mark those **judge-only
at authoring time** rather than letting one read as a code failure for three rounds.

**Bound slices by what the owner declared, and defer where a runner already schedules itself.**
Capacity has three owners:
- **The owner** declares the budget and the hazards — how many stacks may exist, what may be
  written to, what cannot be undone. `verification.md`'s job, rightly owner-governed.
- **The test runner** owns its own parallelism where it has one. Playwright already sets worker
  counts, declares per-project serial execution and reuses a shared server. `pytest-xdist` is
  installed in `tbd-backend` and switched off. **Pass a slice and defer — never re-schedule.**
- **The framework** sizes only the residue: device-bound or state-mutating exercise.

Do not build a capacity model. Build a capacity **reader**.

## The recurring failure

Thirteen instances of one thing: **the information was present and the consumer did not read
it.** `tier1` computed per criterion and dropped on write. `previousGaps` written every
iteration and never used. `verification.md` not among the loop's 15 arguments. `gcats` recording
that a probe row on its shared Supabase project *can never be removed* — the exact hazard that
manufactured this run's one false defect. `maestro hierarchy` queried for tap coordinates and
discarded while a PNG of the same screen was kept. A slice reporting a scratch-file collision in
its return value.

Prefer fixes that read something already produced over fixes that produce something new.

## What the loop got right — do not redesign this

- **8 real defects, 7 of which needed the running system.** An async race seeding a form before
  its data arrived, so the CTA was disabled on first open. Three restaurants sitting directly
  under a park, so `container_name` *was* the park name and the land line rendered the park. A
  diff reader would not have found these.
- **Debug red-proofed its own fix:** *"5 of the 6 new tests fail against the HEAD version."*
- **The governance boundary held under parallel agents with no enforcement.** The prep agent
  drafted `verification.md` and headed it a draft for the owner's approval; its sibling was
  explicitly forbidden to touch it.
- **The run's own agents discovered and wrote down everything needed to verify that repo** —
  ports, a container patch, a 401ing harness endpoint, a Maestro tap-by-point requirement that
  cost two iterations. Nothing reads any of it as a backlog.

## Change set

**The ten mechanical fixes have been carved out to `docs/plan/verification-sweep.md`** and are
summarised below for completeness only. Point `/sweep` at that file, not at this one: a sweep
fixer given this brief would try to triage the convergence design, and the design is a `/plan`.

### `/sweep` — independent, small (full statements in `verification-sweep.md`)

1. **Persist `tier1` alongside `status`.** It is already computed and returned, then dropped. It
   is what separates *never reached* from *reached and failed* — Run 1's `tier1: fail` column ran
   25 → 23 → 1 while real coverage went 4 → 4 → 11.
2. **Exit `insufficient-coverage`, not `stuck`, below a coverage floor**, and put the ratio where
   it cannot be missed. Report membership, not just counts.
3. **Terminate on no-progress** using the `gapsClosed` the loop already computes.
4. **Detect an unfilled `verification.md` by byte-comparing it to the shipped template**, before
   dispatching anything. A repo whose copy is identical cannot support functional verification —
   true of 2 of the 4 reference repos, and knowable in milliseconds.
5. **Fix `promoteToTrd`'s output** — placeholder `Serves`, single-file `Touches`, and an
   acceptance criterion that passes whatever happens.
6. **Promote `stalled` and `unbuilt` to TRD tasks — and `not_met`, but never
   `not_verifiable`.** A `not_met` criterion has something to build. A `not_verifiable` one
   does not: the blocker is environmental, and promoting it would mint tasks meaning "go deploy
   this". On current data that is 55 phantom tasks. This exclusion is a prerequisite for item 5,
   not a refinement of it.

### `/plan` — one coherent change

**Make the loop converge.** Carry-forward, evidence-only passes with repairs batched between,
open-set slicing sized to one walk, and tier 1 resolving a **locator per (criterion, artifact)
pair** rather than checking that a file exists.

That last one closes a real hole: the cheap existence check rewarded attaching an artifact, so
one jest log got cited for 25 criteria and the gate went blind. A locator cannot be satisfied by
attaching a file. Naming is neither necessary nor sufficient — one artifact named twelve
criteria and failed five of the seven citing it, while another named none and proved five of six.
State the limit plainly: **tier 1 cannot check image evidence**, which is why assertions matter.

Bound slices by reading the owner's declarations and the runner's own config. Judge and Debug
stay single agents.

11. **`--verify` becomes the default; `--no-verify` opts out.** It ran on **40 of 145**
    features precisely because it is opt-in, so this is the single change that puts
    verification in front of most work. It lands AFTER items 1–10 — before convergence,
    the default would make 11-of-62 the standard experience rather than the exception.

    **No size condition. The axis was investigated and rejected.** `/plan` already forces
    `--verify` unconditionally at every weight (`fix-plan.js:132` — "re-running the recorded
    criterion IS the acceptance"), so the whole 40-of-145 gap is the `/create-prd →
    /create-trd` path. That path records no weight at all: `**Weight**` appears in 2 of 19
    TRDs, both written by `/plan`, and neither `implement-trd.md` nor `trd-parser.js` reads
    it. Reaching `/create-trd` IS the size verdict. So a size rule would have to skip
    verification on the largest features — the exact ones a 62-criterion run exists for.

    **The brake is the cap, not a skip.** What prices the loop is criterion count, known at
    the derive pass (§3.6) before any loop cost is paid, and `--cap N` already bounds it: 62
    criteria at cap 3 is at most 3 passes. **Wall clock is still unpriced** — Run 1 cost 101
    minutes and the dispatch ledgers hold the data to estimate it across features; pull it
    before or alongside this flip, not after.

## Also in scope, from the wider investigation

These are independent of the convergence work and were established separately. They were
dropped from an earlier draft of this brief by over-correction; they are not lower value.

**`/sweep`, add to the list above:**

7. **Move the environment preflight from `implement-trd.md` §8.4a to §3.6.** It currently sits
   inside Step 8 — after the whole phase loop and the end-of-run review — so the single batched
   owner question lands hours into a run. §3.6 already does early `--verify` work. Mirror in
   `verify-build.md` §2, which delegates to it. Pure relocation. [ran]
8. **Pass `verification.md` to the loop.** It is not among the 15 arguments
   `verify-functional.js` receives, so it affects only the orchestrator's own preflight
   reasoning, which nothing records and no code checks. Every environment-aware behaviour below
   depends on this. [ran]
9. **Record the `not_verifiable` REASON in the state file, and make it re-checkable.** The field
   is empty in all 55 such entries; the explanation exists only as prose in the rendered report.
   Structured, it gives a post-deploy re-check list: 43 of 96 blockers needed a deploy, so those
   criteria are not permanently unverifiable — they are pending. Nothing brings them back today.
   [ran]
10. **A "wired?" check at the phase gate** — does every newly exported symbol have a non-test
    caller? Deterministic grep, no agent, independent of everything else here. It would have
    caught both "built but never wired" production failures quoted above. Generalises to every
    repo; needs no environment and no declarations.

**`/plan`, fold in with the convergence work:**

- **A data-permission column in `verification.md`.** The table has "may DEPLOY?" and "may
  RESTART?" and cannot express "read-only". `lightning-lane` authorises production for read-only
  verification in prose, where nothing can read it; `gcats` records that a probe row on its
  shared project can never be removed. That is the hazard that manufactured this run's one false
  defect. [ran]
- **Fast refresh versus full deploy, per environment.** A cheap path during iteration, the real
  one at the end. §2 of `verification.md` already has one refresh command per environment; this
  is a second. **The end-of-run full run must be a gate that fails loudly, not a convention.**
- **A `preview` row as the template's taught default**, ahead of `dev`/`staging`/`production`.
  A disposable per-branch target needs no deploy approval and no shared-state risk, which
  removes most of the asking rather than answering it. For `lightning-lane` this is the only
  thing that unblocks the 43 deploy-gated criteria — its `dev` and `production` both deploy by
  the owner's hand.

**Later, as its own piece of work:**

- **A dependency-discovery skill.** Reads the code *and* past verification reports, and triages
  **what can be mocked versus what genuinely cannot** — a Disney mock already exists; a deploy
  cannot be mocked. It **proposes a diff** to `verification.md` rather than writing it: that file
  is owner-governed, and the framework already honours this correctly (a prep agent drafted it
  and headed it a draft for approval while its sibling was forbidden to touch it). Its input is
  item 4's output — the list of resources a blank file cannot name.

## Rejected — do not re-propose without new evidence

- **`--harden`, a second implementation pass over completed tasks.** First-pass source survives
  at **96.4%** median across 37,300 lines and 14 feature commits, while 16–81 later commits touch
  those files. The existing end-of-run review already finds the readable cross-task holes and
  stays disciplined by working on code ≤3 days old (~85% of lines it removes). A revisit brief
  makes neighbours' code in scope by definition, and neighbours' code is the 96%. It also cannot
  see the dominant hole, which is an absence.
- **Lanes keyed on runtime.** Wrong unit. Key on declared mutation, and read the runner's own
  config where it has one.
- **An outer N-pass implement/review/verify loop.** Superseded by convergence inside the existing
  loop. Two capped loops give 9 attempts and two termination stories.
- **Retrying `not_verifiable` in the same session.** 43 of 96 need a deploy that will not happen
  mid-run. They belong on the post-deploy list.
- **Requiring an artifact to name the criteria it serves, or capping criteria per artifact.**
  Refuted in both directions: one artifact named twelve criteria and failed five of the seven
  citing it; another named none and proved five of six. Addressability, not cardinality.
- **Framework rules keyed on environment NAME.** No coded policy about `production` or `staging`
  exists and none should. The table is the entire policy.
- **Rate limiting as its own concept, read/write inference, environment probing.** Capacity *k*,
  two declared lanes, and declared-not-discovered respectively.

## Open, owner's call

1. **The coverage floor** below which a run exits `insufficient-coverage`. Any number is a
   policy choice; 18% was clearly below it.
2. **Whether an agent may create simulators or containers**, which the prep agent did via
   `xcrun simctl create`. Resource allocation on a shared machine is yours.
3. *(decided 2026-09-26 — moved into the change set as item 11.)*

## Sources

`~/dev/lightning-lane` `.trd-state/`, its session log for 2026-09-26T15:00–18:00Z, and
`~/dev/fortium/tbd/tbd-backend`, `~/dev/islaygold/conectiv/gcats`,
`~/dev/islaygold/conectiv/opsedge` for generalisability. Counts are `[ran]` unless marked.
Classification of commits and reasons is one agent's judgement over a bounded set — directional.
