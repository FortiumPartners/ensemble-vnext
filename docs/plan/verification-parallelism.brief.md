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

### `/sweep` — independent, small

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
6. **Promote `stalled` and `unbuilt` to TRD tasks.**

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

## Open, owner's call

1. **The coverage floor** below which a run exits `insufficient-coverage`. Any number is a
   policy choice; 18% was clearly below it.
2. **Whether an agent may create simulators or containers**, which the prep agent did via
   `xcrun simctl create`. Resource allocation on a shared machine is yours.
3. **Whether `--verify` becomes the default** once convergence lands. Before it lands, the
   default would make 11-of-62 the standard experience.

## Sources

`~/dev/lightning-lane` `.trd-state/`, its session log for 2026-09-26T15:00–18:00Z, and
`~/dev/fortium/tbd/tbd-backend`, `~/dev/islaygold/conectiv/gcats`,
`~/dev/islaygold/conectiv/opsedge` for generalisability. Counts are `[ran]` unless marked.
Classification of commits and reasons is one agent's judgement over a bounded set — directional.
