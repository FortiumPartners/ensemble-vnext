# Brief: verification that runs wide, produces work, and says what it did not check

**Written** 2026-09-26, from a long owner session. **Status:** input to one `/sweep` and one
`/plan`. Not a TRD. Nothing here is a requirement until one of those authors it.

**Why this exists:** the investigation is done and it changed direction three times. A fresh
`/plan` that re-derives it will probably land somewhere worse, because two of the three
rejected designs look obviously right until you measure them. Read §5 before proposing
anything.

---

## 1. The problem, in one paragraph

`/implement-trd --verify` runs a bounded loop that exercises a delivered feature against
criteria derived from the source. It is opt-in, it walks every criterion with a single agent,
and when it cannot reach something it says so in prose nothing can query. The result is a loop
that almost never fails and routinely checks a fraction of what it was given, while reporting
`satisfied`.

## 2. What was measured

All figures from `~/dev/lightning-lane` unless stated. Method noted where it matters.

**Coverage of the mechanism**
- **41 of 145** feature state directories have a verification report. `--verify` is opt-in
  (`default off`, D11), so roughly three in four features were never exercised. [ran]
- **23** `verification-state.json` files carry criteria. Of those runs: **21 `satisfied`,
  1 `stuck`, 1 `unbuilt`**. [ran]

**What the runs actually concluded** — re-measured 2026-09-26 after a live run landed mid-brief;
the earlier figures in this session's conversation (168 criteria) are superseded:
- **230 criteria** across those 23 runs: **111 met (48.3%), 63 not_met (27.4%),
  55 not_verifiable (23.9%), 1 unbuilt.** Nearly a quarter of all criteria were never checked,
  and 21 of 23 runs still reported `satisfied`. [ran]
- **The `not_met` count is the alarming one, and it is a mislabelling.** It jumped from 12 to 63
  when the 62-criterion run landed — the run that proved 11 in three rounds. Its 51 unproven
  criteria were recorded as **`not_met`**, meaning "the code fails this", when the truth is "the
  exerciser never reached this". 12 + 51 = 63 exactly. So a criterion starved by the serial walk
  is reported as a defect in the delivered code.
- That is the same failure §8.4a of `implement-trd.md` already records from 2026-08-20
  (*"reported those four as `not_met` — recording them as code failures when the code was never
  exercised"*), recurring after the text warning against it was written. A status for
  *not reached this run* is missing, and it is distinct from both `not_met` and
  `not_verifiable`: the environment was fine and the code may be fine; the loop simply ran out
  of walk. [ran]
- The `reason` field is **empty in all 55** `not_verifiable` entries in the state files. The
  explanation exists only as prose in the rendered markdown report. [ran]

**Why criteria could not be checked** — 96 reasons parsed from the rendered reports:
- **43** need a **deploy** (the fix is not in the running environment; "prod runs main")
- **37** need a **live third-party system** (Disney's APIs)
- **3** need a running instance or a browser
- **12** other/uncategorised
  [ran, regex classification — directional, not exact]

**The serial-walk cost, from a live run in that repo's session log**
- One feature: **62 criteria, 11 proven in 3 rounds.** One Exercise agent per round walked all
  62. Rounds 1 and 2 each proved 4 because the Debug stage spent them on fixes and rebuilds;
  one fix changed the layout and invalidated screenshots already collected. ~20 of the 62
  needed no simulator at all and were stranded behind ~45 that did. A single cited evidence
  file — console noise with no test names — sank **25** criteria. [read, session log
  `-Users-james-dev-lightning-lane/e4914591…jsonl`, 16:10–16:16]
- That session then hand-built the fan-out the framework does not provide: dispatched a prep
  agent for "build, 3 simulators, test data" and a second agent to fix `verification.md`
  mid-run. **The owner's most important project is manually reconstructing this.** [ran]

**First-pass quality, which is what killed the second-pass idea**
- **Median 96.4% survival** of first-pass source lines at HEAD, minimum 76.9%, across **14
  feature commits and 37,300 lines** — while 16–81 later commits touched those same files.
  [method: lines added per squash-merge commit, then `git blame HEAD` attribution]
- The existing end-of-run `/code-review` rewrites **1–8%** of what the first pass wrote, and
  **~85% of the lines it removes are ≤3 days old** (median age 0 days). It almost never
  reaches outside code the run just wrote.
- ~**15 of 25** review-written discovery-ledger entries are cross-task integration holes — the
  class a second pass was meant to find. It already finds them.

**Post-completion repair cost**
- 9 completed features, 201 tasks. Stacked filters: 1,694 post-completion commits on the
  feature's own files → 366 within 7 days → 188 non-`feat` → **60 same-feature first-week
  repairs → 37 (62%) in the class a full-context pass could plausibly have caught.** About
  4 per feature. [one agent's classification of 60 commits; conservative by instruction]
- Variance is the finding: **5 of 9 features would have paid for a second pass, 4 would not**,
  and the split is not size — a 91-task UI feature and a 25-task router feature sit at
  opposite ends.
- The dominant shape has a name in that repo: **"built but never wired."** A task builds a
  component, no later task connects it, every test passes because it works in isolation. Two
  verbatim cases: *"the entire reactive-turn block was silently skipped: decisions were written
  to the ledger and bookings committed, but the user never got a message or push"*;
  *"terminateSearchConfig … was implemented + unit-tested but NEVER called anywhere in the
  worker."* Both were found by **running** the system (*"Sixth bug found via live
  verification"*), not by reading it.

**The carry-forward link**
- `promoteToTrd` in `discovered.js` turns a recorded discovery into a TRD task row. Its only
  invocation anywhere is a prose `node -e` block in `implement-trd.md` — **no code calls it.**
  Across 6 ledgers and 53 records, **zero** set `blocksFeature: true`, the flag that makes a
  record promotable. Its own header calls it *"THE MISSING LINK."* [ran]
- It fired for the first time on 2026-09-26, by hand, and its output needed three corrections:
  a placeholder `Serves`, a `Touches` naming one file for a twelve-file change, and the
  acceptance criterion *"The discovery no longer reproduces"* — which passes whatever happens.
  All three parsed cleanly, so nothing warned. [ran]
- Nothing reads the ledger's `resolved` / `retracted` fields, and `record()` cannot write them —
  15 records carry hand-edited annotations that `render()` ignores, so a record marked "fixed,
  verified" still prints as open at every phase boundary. [ran]
- The decisive failure, verbatim from `lightning-lane` commit `934b100ad`: **"F10 shipped
  SERVER-ONLY and the feature was not delivered. … Root cause was orchestration, not
  implementation: B010 was told not to touch client files that wave and to record the client
  half as a discovery. It did. The discovery was never routed to a task and phase 5 closed with
  both green."** All five phase reviews recorded `findings: 0`. [ran — commit read directly]

**`verification.md` reachability**
- `.claude/rules/verification.md` is **not among the 15 arguments** the verification workflow
  receives. Its only effect is on the orchestrator's own preflight reasoning, which nothing
  records and no code checks. [ran]
- The environment preflight (§8.4a of `implement-trd.md`, line ~1304) sits **inside Step 8** —
  after the whole phase loop and the end-of-run review. Its heading says "BEFORE spending
  iterations" and means the loop's; the owner experiences it as a question asked hours in.
  §3.6 already does early `--verify` work and is where it belongs. [ran]
- In this repo the file is the **untouched shipped template**, naming an `npm run dev` script
  that does not exist. In `tbd-backend` and `opsedge` likewise untouched. `gcats` and
  `lightning-lane` are filled in. So **2 of 4 reference repos run on a blank file**, and the
  design must be useful with one. [ran]

## 3. Reference-repo shapes, so this is not designed around one project

| Repo | Runtime a criterion needs | Notes |
|---|---|---|
| `lightning-lane` | iOS simulator + Maestro, mock Disney API, Railway dev, prod on merge | device-bound UI evidence; the only multi-device case |
| `tbd-backend` | docker-compose stack, Supabase | **no test script at all** (`echo "Error: no test specified" && exit 1`) |
| `gcats` | one pnpm web+api dev stack on fixed ports | no docker, no e2e |
| `opsedge` | `next dev` + Prisma/Supabase, vitest + **Playwright** | Playwright manages its own browser workers |

**Three of the four are single-runtime.** For them the current single-Exercise design is already
optimal and the fan-out below is a no-op. Only `lightning-lane` changes. That is the guard
against fitting this to one project.

## 4. The core insight

D2 in `docs/TRD/functional-verification.md` fixed one iteration as three sequential agents —
Exercise, Judge, Debug — with this rationale, verbatim:

> A human verifies a build by starting it once and walking the list. **N parallel exercisers
> means N startups of the same application competing for the same port**, each paying the boot
> cost, to parallelise a walk that one boot already affords.

**Boot once is right. Walk once does not follow.** A running server serves many concurrent
readers. D2's rejected alternative was *"2N agents and N application startups"* — it assumed
fan-out implies re-booting, so it never considered one boot with N walkers. The analogy to a
human doing it is the load-bearing step, and it is not a constraint.

**The real exclusivity is narrower than "the runtime."** It is what a criterion does to shared
mutable state:

- **reads** (an HTTP GET, a file, a unit test) — unbounded; sixty-two wide is fine
- **mutates shared state** (seeds the same test persona, writes the same row) — conflicting
- **drives a device** (two Maestro sessions on one screen) — genuinely exclusive
- **rate-limited third party** — throughput, not exclusivity; capacity *k* is close enough

**The owner's four resource categories collapse into two declared fields** — capacity, and a
command to get another instance. "We need to wait" is not a category; it is what a full lane
does.

**The mechanism already exists.** `task-graph.js`'s `buildGraph(tasks, grounding)` serialises
units that share declared state and parallelises the rest — used by every implement run,
already tested. Criteria map onto it directly: `{id:'FS-1'}` plus
`{'FS-1':{touches:['sim-a','persona-x']}}`. **No change to `task-graph.js`.** This answers D2's
third objection — that a task graph would be *"a whole mechanism whose only job was to contain
a concurrency the design did not need"* — because the mechanism is already paid for.

**Default stance:** fan out as wide as the work allows; **serialisation is what must be
justified by a declared conflict**, not the reverse.

## 5. Rejected — do not re-propose without new evidence

- **`--harden` / a second implementation pass over completed tasks.** Rejected on the 96.4%
  survival data and on the existing review already finding the readable cross-task holes while
  staying inside ≤3-day-old code. A revisit brief ("is your slice wrong in light of its
  neighbours?") makes neighbours' code in scope by definition, and neighbours' code is the 96%.
  It also cannot see the dominant hole, which is an absence.
- **Lanes keyed on runtime.** Wrong unit — it imports D2's error one level up. Key on declared
  mutation instead.
- **An outer N-pass implement/review/verify loop (owner's original item 3).** Shrunk by
  agreement to: promote `stalled` and `unbuilt` to TRD tasks and see whether a second full pass
  is ever wanted. The loop already caps at 3 internally with a stall rule; an outer 3 gives 9
  and two termination stories.
- **Retrying `not_verifiable` criteria within the same session.** 43 of 96 need a deploy that
  will not happen mid-run. The retry belongs after a deploy, as a pending list `/verify-build`
  consumes.
- **Flipping `--verify` on by default *before* the fan-out exists.** At 12 criteria the serial
  loop is fine; at 62 it produces a long run proving a sixth and reporting `satisfied`. Order
  matters: fan-out first.
- **Rate limiting as its own concept, read/write inference, and environment probing.** Capacity
  *k* covers the first; the owner declares two lanes for the second; the third is declared, not
  discovered — though a "how to get another" command lets the loop scale up when authorized.
- **Framework rules keyed on environment NAME.** There is no coded policy about `production` or
  `staging` anywhere, and there must not be. `lightning-lane` authorises prod for **read-only
  verification** (owner, 2026-09-25) under a stated alpha exception. The table is the entire
  policy.

## 6. The change set

### 6a. For `/sweep` — independent, small, separately verifiable

1. **Record the `not_verifiable` reason in `verification-state.json`.** Empty in all 55
   entries today; the explanation lives only in the rendered report, so nothing can query why a
   third of criteria went unchecked. ~25 logical lines.
2. **Move the environment preflight from `implement-trd.md` §8.4a to §3.6**, so the one batched
   owner question is asked in the first minutes rather than after the phase loop. Mirror the
   change in `verify-build.md` §2, which delegates to it. Pure relocation and reframing; no new
   machinery. ~75 logical lines.
3. **Promote `stalled` and `unbuilt` to TRD tasks.** Both are terminal today and both are
   exactly "something the loop says was never built" — which is a task. Uses `promoteToTrd`.
   ~20 logical lines.
4. **Fix `promoteToTrd`'s output** — it emits a placeholder `Serves`, a single-file `Touches`,
   and an acceptance criterion that cannot fail. Prerequisite for 3 and for anything else that
   carries findings forward. ~30 logical lines.
5. **Add a status for "not reached this run"**, distinct from `not_met` and `not_verifiable`.
   51 criteria starved by a serial walk are currently reported as code failures. The status set
   lives in `functional-verification.js`; `decideNext`'s exit rules must treat the new one as
   neither a gap to debug nor a silent pass. ~40 logical lines — the largest of the sweep items
   and the one most worth doing first.
6. **Require machine-readable evidence for test-run claims** (`--verbose --json` or equivalent,
   per project). One unreadable log sank 25 criteria in a single run. ~15 lines, contract text.

### 6b. For `/plan` — one coherent change

**Fan out Exercise on a conflict graph.**

- The success definition gains two columns: what each criterion **needs** (a resource token) and
  what it **mutates**. Written by the deriver, which already states the need in prose in its
  evidence column.
- `verification.md` gains, per resource: **capacity** (how many concurrent) and **how to get
  another** (a command, or blank meaning fixed). Plus a column for what the loop may do there —
  deploy, restart, write — since the table is the whole policy and currently cannot express
  read-only.
- `verify-functional.js`: replace the single `await agent(buildExercisePrompt…)` at ~line 503
  with a wave loop over `parallel()`, waves from `buildGraph`. One boot per distinct runtime,
  shared by all readers. Per-lane evidence subdirectories.
- **Judge and Debug stay single agents.** D7 — nothing certifies its own evidence — depends on
  one judge seeing all evidence together, and one debugger cannot collide with itself. Only
  Exercise changes.
- **Blank-file default:** one implicit lane, working tree, unlimited. Every file-only criterion
  runs wide; everything else is `not_verifiable` **naming the missing resource**. Strictly better
  than today's silent unverifiability, and that list is the input to 6c.
- Keep the fan-out **inside the workflow** via `parallel()`. D2's other rejection — direct
  `Agent` fan-out from the command, because per-criterion transcripts land in orchestrator
  context — stays rejected, and this is not it.

**Rough size:** ~800 lines touched across 8 files, of which ~250 is new logic and about half the
total is mirror duplication (every runtime file exists twice: `packages/core/<x>` and the
vendored `.claude/<x>`; `packages/full` is a symlink, so no third copy). Expect `small`.

### 6c. Later, not now

- **A dependency-discovery skill.** Reads the code *and* past verification reports, and triages
  **what can be mocked versus what genuinely cannot** — a Disney mock already exists; a deploy
  cannot be mocked. It should propose a diff to `verification.md`, not write it: that file says
  *"Owner-governed… An agent READS this and never writes it,"* and which environment is safe to
  touch is policy, not an observation.
- **A "wired?" check at the phase gate** — does every newly exported symbol have a non-test
  caller? Deterministic grep, no agent, and it would have caught both quoted production
  failures. Independent of everything above.
- **Flip `--verify` to on by default** once the fan-out lands.
- **Preview-environment-per-branch** as the template's taught default, which removes most
  deploy-approval questions rather than asking them.

## 7. Open, owner's call

1. **Does the loop discover capacity or only read what is declared?** Argued: declared — the
   framework reads policy, never probes. Against: that session booted three simulators by hand,
   which is exactly the discovery case. This changes the design.
2. **`dev` deploy authorization.** `local` and `production` answer themselves in every repo
   examined. Whether the loop may deploy to a shared `dev` unattended is policy. For
   `lightning-lane` the answer is already no — deploys go through `test` branch CI and a merge
   to `main`, both by hand — so that repo stays deploy-blocked until a preview environment
   exists.
3. **Whether a "fast refresh" / "full deploy" split is worth two commands per environment.** If
   taken, the end-of-run full run must be a gate that fails loudly, not a convention. Three
   times in the authoring session a piped exit code reported green over a real failure.

## 8. Evidence markers

`[ran]` — executed and read the output. `[read]` — opened and verified. Classification counts
in §2 marked as such are one agent's judgement over a bounded commit set, conservative by
instruction, and are directional rather than exact.
