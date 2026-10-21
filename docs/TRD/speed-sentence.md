# TRD: speed-sentence

**Source PRD**: None — small change decided in session, 2026-10-19/20
**Version**: 1.1.1 (2026-10-20) — see Changelog at the end

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Every implementer task prompt, the phase-gate verify-app prompt, every sweep fix prompt, and the mechanical stages (verify-functional's render and reconcile, create-trd's grounding merge) end with the time-matters sentence, word for word | your instruction, 2026-10-20 | yes |
| O2 | No audit verifier, judge, exercise, debug, triage or authoring prompt carries the sentence | your instruction, 2026-10-20 ("not audit verifiers or the judge") | yes |
| O3 | A replay of a real ten-task lightning-lane TRD (the availability-consolidation fixture, see Decision), run twice per side in the order before, after, before, after, reports each task's implementer time and each phase's gate time from the dispatch ledger, with each task's output tokens and tool calls from its transcript beside them (reported, not judged). The sentence is kept only if the median over matched task pairs of the per-task change (after against before, same task id) falls by more than 20% for the implementer, AND the median over matched gate pairs (same phase) falls by more than 20%, AND no after-run has more failed tasks, retries or tasks reopened by reconcile than the before-run it is paired with (before-run 1 with after-run 1, before-run 2 with after-run 2), and no after-run has an `/audit-build` gap absent from the baseline audit | your instruction, 2026-10-20 ("kept only if time falls"); replay design from your `/refine-trd` feedback and rulings, 2026-10-20; the 20% band carried over from the first measurement's success rule; counts judged against the paired before-run by your ruling on OQ-2, 2026-10-20 | yes |

## Intended Change

Add this sentence, verbatim, to the end of the prompts named in O1:

> Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better.

Before: no workflow or agent prompt mentions time (grep for "Time matters" over `packages/` and
`.claude/` returns nothing [ran]). After: the sentence is appended at exactly the dispatch sites
O1 names and nowhere else, and a measurement shows whether it helped.

**Current state (2026-10-20):** the sentence is out of the tree (reverted in `adc1192`; grep for
"Time matters" over `packages/` and `.claude/` prints nothing [ran]). The replay measures it from a
separate after-side build, and it returns to the tree only on a keep verdict (FIX-009).

**Success, stated so it can fail (replay, from 2026-10-20):** across two runs per side of the
ten-task fixture, run before, after, before, after, the median over the 20 matched implementer
pairs (ten tasks, two run pairs) of the per-task change falls by more than 20%, and the median over
the 6 matched gate pairs (three phases, two run pairs) falls by more than 20%. Neither
after-run has more failed tasks, retries or tasks reopened by reconcile than its paired before-run,
and each has an `/audit-build` report with no gap that the baseline audit (on before-run 1) did not
also report. A count the fixture causes on both sides cancels out; a count the after side adds is
a failure, and the sentence stays out, even if time fell. Anything short of both medians falling by
more than 20% with no added count also leaves it out; the result names which case it was: remove
(the after side added a count or a gap) or no measurable difference.

*First measurement (done 2026-10-20; verdict: no measurable difference):* across 5 runs of the same
fixed task before and 5 after, the median implementer task time and the median verify-app gate time
both fall by more than 20%, and every after-run has 0 failed tasks, 0 retries, 0 tasks reopened by
reconcile, and `/audit-build` reports no gap that the baseline audit did not also report. A run where
time falls but any of those counts is non-zero is a failure, and the sentence is removed.

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

**2026-10-20, /refine-verification:** the success rule's "every after-run … `/audit-build`
reports no gap" is read as FIX-004 wrote it: ONE `/audit-build`, on after-run 1, compared
with the baseline audit. The per-after-run counts (failed tasks, retries, reconcile
reopenings) stay required for all five after-runs. The success-definition row that expected an
audit per after-run (FS-10) is aligned with this, so no further live audits are run.
(This reading governs the first measurement. The replay follows owner ruling 2 below.)

### 2026-10-20, owner rulings for the replay (interactive `/refine-trd`)

Your feedback, verbatim: *"redo the speed measurement with a few bigger runs: a smoke scenario
that replays a past 8–12 task TRD from this repo on a scratch copy at its pre-feature commit;
per-task pairing across sides plus output tokens and tool calls per task from transcripts; 2 runs
per side alternated before/after/before/after with the sentence (cherry-pick 34b7ae7, fcb64cb) only
on the after side; /audit-build on every after-run; judged on the median of per-task changes for
implementer and gate, with the existing zero-count rule"*. Rulings given in the same session:

1. **The fixture comes from lightning-lane, not this repo.** Your words: "Look in lightning-lane
   for good tasks to use". This repo's 8–12-task TRDs had implementer medians of only about 35s;
   lightning-lane's real implementers ran minutes (the chosen fixture's ten tasks: median 510s,
   below).
2. **One baseline audit.** A single `/audit-build` on before-run 1. Each of the two after-runs gets
   its own `/audit-build`, compared with that one baseline audit, so the replay runs 3 audits.
3. **OQ-1 is resolved by the first measurement.** The one-task fixture was too small to show
   anything (`.trd-state/speed-sentence/result.md`; see Open Questions).

### 2026-10-20, the replay's design (decisions taken in this refinement; each serves O3)

**Fixture: lightning-lane's availability-consolidation TRD, ten tasks, base `e04cfe0ed`.** The
source is `docs/TRD/availability-consolidation.md` v1.1.1 at commit `0356413bf`, the text the
original implementation ran against: its sha256 equals the `trd_hash` in the committed
`implement.json` [ran]. The feature merged as squash PR #1288 (`9fac17fbb`), whose parent
`e04cfe0ed` is the base [ran]. At the base, none of the 13 files the PR adds exists, all 74 it
modifies and all 3 it deletes do, and the TRD and PRD are absent; `0356413bf` is not an ancestor of
the base [ran]. All ten tasks finished `success` with `retry_count` 0 in the original run [ran].

| Task | Phase | Depends on | Original seconds | Tool calls | Output tokens | Original agent |
|------|-------|------------|------------------|-----------|---------------|----------------|
| AVAIL-B001 | 1 | none | 421 | 70 | 34,968 | backend-implementer |
| AVAIL-B002 | 2 | B001 | 1270 | 242 | 122,101 | backend-implementer |
| AVAIL-B003 | 2 | B001 | 759 | 159 | 74,715 | backend-implementer |
| AVAIL-B004 | 2 | B001 | 848 | 114 | 66,246 | backend-implementer |
| AVAIL-B005 | 2 | B001 | 520 | 97 | 48,472 | backend-implementer |
| AVAIL-B006 | 2 | B001 | 501 | 89 | 51,049 | backend-implementer |
| AVAIL-B007 | 3 | B004 | 194 | 50 | 18,002 | backend-implementer |
| AVAIL-B008 | 3 | B002 | 201 | 41 | 20,713 | backend-implementer |
| AVAIL-B009 | 3 | B002, B003 | 637 | 176 | 48,214 | backend-implementer |
| AVAIL-P001 | 3 | B002–B006 | 258 | 45 | 27,262 | cicd-specialist |

Seconds come from the committed ledger `.trd-state/availability-consolidation/dispatch.jsonl`, paired
by agent id; labels, tool calls and output tokens come from the subagent transcripts and
`.meta.json` files still on this machine [ran]. The original gates took 98s, 2102s and 562s. That run
used runtime 4.6.0 under `verification_level: live-required`, so its phase-2 gate included a docker
build [ran]. Its implementation took 92 minutes (22:55–00:27 UTC), followed by a 7-minute
`/code-review` and a 9-minute `/audit-build` [ran].

Dropped from the source TRD: AVAIL-T001, a live local-stack end-to-end check, and AVAIL-T002, a paid
eval run that needs network and an API key. No fixture task depends on either.

Alternatives surveyed, from every committed lightning-lane ledger and `implement.json` [ran]:
- **party-data-safety:** 7 tasks, median 226s — below the 8-task floor.
- **facility-catalog-persist-meal-periods:** FIX-001 needs `prisma migrate deploy` on a database,
  and only 6 tasks have original labels.
- **jev-decider-spike:** 6 original tasks plus 7 amendment rows.
- **retire-hold-count-authority:** median 1046s, max 1925s — a run would take hours.
- **web-dining-alert-parity:** 5 `[LIVE]` tasks.
- **trip-party-and-booking, unified-create-alert, trip-dates-disney-sync** (27–35 tasks each):
  `[LIVE]` and Prisma tasks are interleaved, so any 8–12-task subset cuts dependencies.
- **signup-disney-optional and trip-shell-and-editing:** task medians of 71s and 85s, too short to
  show a 20% change over fixed overhead. That is OQ-1's failure again.

**Two edits to AVAIL-B004's row, the only departures from the source task text.** The `[LIVE]`
marker is removed from its ID cell, and its final acceptance sentence is removed: "Live: against the
local stack, a same-day request records no Disney call in the mock's `CallLogger` output."
Three reasons:
- **The owner's rule.** No `[LIVE]` tasks in the fixture.
- **Today's parser misreads the verbatim row** [ran]. It returns the task id `"AVAIL-B004 [LIVE]"`
  with `live: false`, reports AVAIL-B007's and AVAIL-P001's dependency on `AVAIL-B004` as an unknown
  id, and finds no grounding block for it.
- **The live clause did real work against a shared stack.** The original AVAIL-B004 implementer ran
  12 commands against the shared `dart-localdev` stack and its checkout, starting with
  `make localdev-claim` and including `docker exec` into its worker container [ran].

The unit half of B004's acceptance already asserts that a same-day request never constructs a Disney
client. Alternative: drop B004 and the two tasks that depend on it, leaving 7 tasks, below the 8-task
floor (OQ-3). With both edits, today's parser returns exactly the ten tasks, no warnings, none live
or deferred, phase groups `[[1],[2],[3]]`, and all ten grounding blocks [ran on a scratch copy].

**Each run gets a fresh clone at the base, with today's runtime installed by script, not by
`/rebase-project`.** Each run makes a local `git clone` of `~/dev/lightning-lane` into a new temp dir,
checks out the base on a local branch, and removes the remote. The clone's `origin` otherwise points
at `~/dev/lightning-lane`, so an agent's push would write there [ran]. The base carries runtime 4.5.0
[ran]. The install runs `scaffold-project.sh` in plain mode, which creates missing components and
keeps existing ones, then with `--refresh`, which replaces existing ones, both from the side's
`packages/full`. It then replaces the clone's `settings.json` `hooks` block with the template's,
because neither script mode touches hook wiring and the base's Stop hook is a 4.5.0 prompt [ran].

Tried on a scratch clone, this left `CLAUDE.md`, `constitution.md`, `stack.md`, `process.md`,
`verification.md` and `verification-notes.md` byte-identical, stamped `ensemble.version` 4.13.6, and
made the four workflow files and `dispatch-ledger.js` byte-identical to `packages/core` [ran]. The
template's hooks block equals this repo's own generated wiring [ran]. Alternatives:
- **`--force`:** replaces `CLAUDE.md` and `settings.json` from templates [read].
- **`/rebase-project`:** a model turn whose classification cannot be checked byte for byte.

**Four project-config edits in the clone, identical on both sides.** Each keeps the runs offline and
comparable, and keeps lightning-lane and its shared stack untouched (Non-Goals).
1. **`verification_level` set to `unit-only`.** The base constitution says `live-required` (line
   180). Under that level the gate prompt tells verify-app to start the service and verify against a
   running instance (`implement-trd.md` §4.3) [read].
2. **`stack.md` names the phase-gate battery.** A command named there comes first in
   `/implement-trd`'s battery resolution [read]. The command (FIX-006 grounding) is green offline:
   1,424 test files in 69s at the base, 1,425 in 77s at the PR commit [ran]. The project's own
   `pnpm test` is red offline at the base on five suites: four `@ll/data` migration and DB tests, and
   `diningAlertSimulation.replay.test.ts` [ran]. `/implement-trd` treats a red resolved battery as
   phase failure and retries the whole phase [read].
3. **`CLAUDE.md` gets a short replay-sandbox block.** It says the "Local-First Iteration
   (MANDATORY)" section does not apply, and there is no running stack, docker or network.
4. **A PATH shim refuses `docker` and `make localdev-*`.** An agent that ignores the sandbox block
   still cannot reach the shared stack.

Every suite the PR touched passes offline with no `DATABASE_URL` or `REDIS_URL` at the PR commit,
including its one `.integration.test.ts`, and so do the new CI gate, its test and the `@ll/workers`
typecheck [ran].

**Both sides are built from one commit of this repo, never by toggling the main checkout.** The
before side is a clone of this repo at the commit that holds FIX-005 to FIX-007. The after side is
the same commit plus `cherry-pick 34b7ae7` (clean) and `cherry-pick fcb64cb`. The second conflicts
only in `.trd-state/speed-sentence/result.md`, resolved by keeping the tree's copy [ran]. The after
side then differs from the before side in exactly the four workflow files, under both
`packages/core/workflows/` and `.claude/workflows/`, plus `speed-sentence.test.js`. Its 14 tests pass
there, so O1 holds on the after side during the measurement [ran]. Each side's dir supplies both the
clone's runtime and `claude --plugin-dir`, so which copy a named workflow resolves to cannot matter.

**Pairing.** Before-run k is paired with after-run k, the two runs adjacent in the ABAB order, so
each pair shares latency conditions. In the first measurement, a control that never received the
sentence slowed 23% between the two batches (`result.md`).
- **Implementer key:** the `task:<id>` label from each transcript's `.meta.json`, whatever the agent
  type (AVAIL-P001 ran as `cicd-specialist`).
- **Gate key:** the `workflowPhase` field (`Phase 1`..`Phase 3`). `implement-phase.js` sets it on
  every task and gate dispatch, and the fixture's phases do not merge [ran].
- **Per-pair change:** (after − before) / before. The judged figures are the medians over the 20
  implementer pairs and over the 6 gate pairs. A key dispatched more than once in a run (a retried
  phase) is summed, and its dispatch count reported.

Alternative: average each task over its two runs and compare once per task (10 pairs). That mixes
conditions from across the four-run block, which the ABAB order exists to avoid.

**Run conditions.**
- **Order and machine:** `--no-verify` on both sides, as before, sequentially on one machine.
- **Run cap: 3 hours.** The expected run is about 75 minutes (FIX-008 grounding), and a retried
  phase adds roughly 20–30.
- **Hung processes:** a run killed by the cap counts as completed when its final message carries a
  COMMAND COMPLETE/STUCK banner, or when all ten tasks are terminal in `implement.json` and every
  ledger start has a stop. `claude --print` stayed alive after its last turn twice in the first
  measurement.
- **Audits:** `/audit-build --report-only` runs after all four runs, each capped at 45 minutes under
  the same completion rule.

## Non-Goals

- No change to agent definition files, command files, or any audit-*.js, create-prd.js, or the
  verify-functional judge, exercise or debug stages.
- No mod, no hook, no runtime toggle. The before/after is two code states, not a flag.
- No change to models or effort levels.
- **Lightning-lane is never modified.** No edit, commit, checkout, stash, push or ref change in
  `~/dev/lightning-lane`, whose working tree holds someone's uncommitted work. It is read only through
  `git log`, `git show`, `git ls-tree` and `git clone`, and every replay clone has its remote removed.
  The shared `dart-localdev` stack is never claimed, restarted or reached.
- The replay does not measure the sweep fix, grounding merge, render or reconcile sites. Its
  `/implement-trd --no-verify` run never reaches them, as before.
- No database, network or paid eval in the replay: AVAIL-T001 and AVAIL-T002 are not replayed.

## Verification Artifacts

None apply — the change is prompt text in workflow scripts plus a timing script; no UI,
document page or design surface is produced.

## Open Questions

| ID | Question | What I assumed | Owner-only | Status |
|----|----------|----------------|------------|--------|
| OQ-1 | Is a one-file trivial task large enough to show a speed difference? | Use it anyway (it is the fixed task that exists and hits both targets); if the medians are within 20% of each other, report "no measurable difference" rather than a win | owner-only | **Resolved 2026-10-20 by the first measurement: no.** Each agent ran 10–25s, mostly fixed overhead. The spread within one side (12.6–37.8s for the implementer after the change) was larger than the gap between the medians (`.trd-state/speed-sentence/result.md`). The replay uses a ten-task fixture instead |
| OQ-2 | The zero-count rule judges each after-run on its own, not against the before-runs. The fixture's original run needed two repair passes, which its older runtime did not count as retries: three stale tests fixed after the phase-2 gate, and seven decisioning regressions fixed after phase 3 [ran]. Today's `/implement-trd` retries the whole phase on a red battery and counts it. If both sides retry, the rule returns "remove" for a reason that is not the sentence. Should a count that the before-runs also show still fail the after side? | Applied as written ("the existing zero-count rule"). The before-runs' counts are reported beside the after-runs', so a count the fixture causes is visible | owner-only | **Resolved 2026-10-20, owner:** judge against the before-runs. An after-run fails only if it has more failed tasks, retries or reconcile reopenings than its paired before-run, or an audit gap the baseline lacked. O3, the success paragraph and FIX-009 updated to match |
| OQ-3 | AVAIL-B004 is replayed with two edits: its `[LIVE]` marker and its final "Live: …" acceptance sentence are removed. Is that acceptable, or should B004 and the two tasks that depend on it be dropped (leaving 7 tasks, below the 8-task floor)? | Edits applied, and recorded in the fixture's provenance header and in Decision | owner-only | **Resolved 2026-10-20, owner:** accept the edit; replay 10 tasks with B004's `[LIVE]` marker and final "Live: …" sentence removed |

## Master Task List

FIX-001 to FIX-004 are done history: the first measurement, commits `f733465`..`adc1192`, verdict in
`.trd-state/speed-sentence/result.md`. FIX-005 onward is the replay.

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `test/smoke/ledger-timing.js`: reads one or more `dispatch.jsonl` files, pairs start/stop by `agent_id`, prints median and max duration (seconds) per `agent_type`, and counts agents with a start but no stop. Add an optional `SMOKE_IMPL_ARGS` variable to `implement-one-task.sh`, appended to its `/implement-trd` prompt (default empty, so the scenario's behaviour is unchanged) | O3 | None | Given a fixture ledger with two backend-implementer agents (60s, 120s) and one verify-app (30s), it prints backend-implementer median 90s max 120s n=2 and verify-app 30s n=1; an unmatched start is counted as unfinished, not as a duration; a Jest test asserts this. With `SMOKE_IMPL_ARGS` unset the scenario's prompt is exactly `/implement-trd docs/TRD/smoke-greet.md`, and with it set to `--no-verify` the prompt ends with `--no-verify` |
| FIX-002 | BEFORE runs: on the unchanged code, run `SMOKE_KEEP=1 SMOKE_IMPL_ARGS=--no-verify test/smoke/run-smoke.sh implement-one-task` 5 times, sequentially; save each kept project's `.trd-state/*/dispatch.jsonl`, `.trd-state/_dispatch.jsonl` (whichever exist) and `implement.json` under `.trd-state/speed-sentence/baseline/run-N/`; run `/audit-build` once on the kept project of baseline run 1 and save its gap list; run FIX-001's script over the ledgers [LIVE] | O3 | FIX-001 | Five run directories exist, each with a ledger holding at least one implementer and one verify-app start/stop pair; `baseline/summary.txt` holds the script's output; `baseline/audit-gaps.txt` lists the baseline audit's gaps (possibly none) |
| FIX-003 | Add `TIME_MATTERS` and append it (after a blank line) to: every task prompt in `implement-phase.js`, its gate `verifyPrompt`; `fixPrompt` in `sweep.js`; the render and reconcile prompts in `verify-functional.js`; the `ground:merge` prompt in `create-trd.js`. Mirror all four files to `.claude/workflows/` | O1, O2 | FIX-002 | A harness test (`test-harness.js` `runWorkflow` with a recording `agent` stub) shows the captured prompt for `task:*`, `gate:verify-app`, `fix:*`, `render`, `reconcile` (verify-functional) and `ground:merge` ending with the sentence; the captured prompts for audit-trd's `verify:*`, verify-functional's `judge`, `exercise` and `debug`, and sweep's `triage` do not contain "Time matters"; each of the four `TIME_MATTERS` constants equals the sentence quoted under Intended Change character for character (the test holds that exact string as a literal and compares against it, so a paraphrase or a typo fails); each pair under `packages/core/workflows/` and `.claude/workflows/` is byte-identical |
| FIX-004 | AFTER runs and verdict: repeat FIX-002's 5 runs on the changed code into `.trd-state/speed-sentence/after/run-N/`; for each after-run, run `reconcile()` from `implement-state.js` over its `implement.json` and record the reopened count; run `/audit-build` once on the kept project of after-run 1 and compare its gaps with `baseline/audit-gaps.txt`; write `.trd-state/speed-sentence/result.md` with before/after medians, the zero-counts, and the verdict [LIVE] | O3 | FIX-003 | `result.md` states implementer and verify-app median seconds before and after; failed tasks, retries (`retry_count`), reconcile reopenings per after-run, and audit gaps not present in the baseline audit; and one verdict line: keep (both medians fell by more than 20%, all counts 0), remove (any count non-zero), or no measurable difference (both medians within 20%). If the verdict is remove, FIX-003's edits are reverted in the same task |
| FIX-005 | Commit the replay fixture under `test/smoke/fixtures/speed-replay/availability-consolidation/`. `trd.md` is lightning-lane's `docs/TRD/availability-consolidation.md` at `0356413bf` (v1.1.1), changed only as Decision lists: the Phase 4 table, the "Deferred by design" section and the AVAIL-T001/T002 grounding blocks removed, AVAIL-B004's marker and final live sentence removed. It gains a provenance header naming the source repo, the TRD commit, PR #1288 (`9fac17fbb`), the base `e04cfe0ed`, the edits, and for each task its source id with original seconds, tool calls and output tokens. Copy `prd.md`, `prd.brief.md` and `proposal.md` verbatim from the same commit. Write `fixture.json` naming the source repo, the base commit, each document's path in the clone, and the battery command. Add `test/smoke/speed-replay-fixture.test.js` | O3 | None | Jest: `parseTrd` on `trd.md` returns exactly AVAIL-B001..B009 and AVAIL-P001 in phases 1, 2 (five tasks) and 3 (four tasks), with dependencies as in the source table, every `live` false, none deferred and no warnings; `phaseGroups` returns `[[1],[2],[3]]`; each of the ten has a grounding block; no Master Task List row contains the live marker. A one-time check, recorded in the commit message: `diff` of `git -C ~/dev/lightning-lane show 0356413bf:docs/TRD/availability-consolidation.md` against `trd.md` shows only the header and the listed edits, and the other three documents' sha256 equal their sources |
| FIX-006 | Write the replay. `test/smoke/scenarios/replay-fixture.sh` performs ONE run of ONE side. It clones lightning-lane at the fixture's base into a new temp dir and removes its remote; installs today's runtime from the side's source dir; applies the four config edits Decision lists; copies in the fixture documents; installs dependencies offline; commits; and checks the result. It then runs `/implement-trd docs/TRD/availability-consolidation.md --no-verify` headlessly with that side's `--plugin-dir`, keeps the clone, and copies the ledger, `implement.json`, final text, session log and subagent transcripts into an output dir. `REPLAY_PREPARE_ONLY=1` stops it before the model call. `test/smoke/replay-abab.sh` has two subcommands: `sides` builds the before and after source dirs from one commit; `run` performs before-1, after-1, before-2, after-2, then the three audits, in that order. Add one row to `test/smoke/README.md` | O3 | FIX-005 | With `REPLAY_PREPARE_ONLY=1`, one prepared clone per side [ran]: no git remote; `ensemble.version` 4.13.6; settings `hooks` equal to the template's; `CLAUDE.md`, `constitution.md` and `stack.md` differ from the base only by the sandbox block, the `unit-only` line and the battery line; `process.md`, `verification.md` and `verification-notes.md` byte-identical to the base; the four workflow files byte-identical to that side's `packages/core/workflows/`; the two prepared clones differ only in those four files; `docker` on the run's PATH prints the shim's refusal and exits non-zero; the battery command exits 0. `replay-abab.sh sides` produces an after dir that differs from the before dir in exactly the nine files named in Decision and whose `speed-sentence.test.js` passes, and a before dir where `grep -rn "Time matters" packages/ .claude/` prints nothing. `git -C ~/dev/lightning-lane for-each-ref` output is identical before and after |
| FIX-007 | Extend `test/smoke/ledger-timing.js`. Factor the start/stop pairing out of `summarize()` into an exported `pairAgents(lines)`. Add an exported `perTask(lines, readFile)`: for each finished agent whose stop row names a transcript, return its label and phase (from the sibling `.meta.json`'s `description` and `workflowPhase`), its seconds, tool calls and output tokens. Add an exported `compareRuns(beforeRuns, afterRuns)`: pair before-run k with after-run k, implementer keys by `task:<id>` and gate keys by `workflowPhase`; return each pair's relative change and the two judged medians, with token and tool-call changes reported beside them. Add CLI flags `--per-task <ledger>` and `--compare` | O3 | None | Jest, with fixture ledgers, `.meta.json` files and transcript rows held in the test. A before-run with two task agents (60s, 120s) and a gate, and an after-run with the same labels at 45s and 120s plus a gate, give per-pair changes of −25% and 0% and an implementer median of −12.5%. A transcript in which one `message.id` appears on two rows (text, then tool_use; `output_tokens` 41, then 123) counts 1 tool call and 123 output tokens for that message. An agent with a start and no stop is unfinished and in no pair. A label present on one side only is reported as unmatched, not paired. A key dispatched twice in one run is summed, with its dispatch count. `summarize()`'s output is unchanged and its existing test still passes |
| FIX-008 | Live runs. Pre-flight: one short headless turn in a prepared clone runs `docker ps` and must report the shim's refusal. Then `replay-abab.sh run` performs before-1, after-1, before-2, after-2 sequentially on one machine, saving each under `.trd-state/speed-sentence/replay/<side>/run-<k>/`. After before-run 1, run FIX-007's `--per-task` over its ledger, and stop unless it finds all ten `task:` keys and three gate phases. Then run `/audit-build docs/TRD/availability-consolidation.md --prd docs/PRD/availability-consolidation.md --report-only` on the kept clones of before-run 1 (the baseline), after-run 1 and after-run 2. Run `reconcile()` over every run's `implement.json` against its kept clone [LIVE] | O3 | FIX-005, FIX-006, FIX-007 | Four run directories, each holding `dispatch.jsonl`, `implement.json`, the final text, `project.txt` (the kept clone's path), `transcripts/` and the side's source commit. `replay/runs.tsv` records start, end, exit code and completion reason for each run, in ABAB order with no overlap. Three `audit-build-report.md` files (baseline, after-1, after-2), each with its exit code. `replay/reconcile-reopens.txt` holds the reopened count for each run. `git -C ~/dev/lightning-lane for-each-ref` output is unchanged from before the runs |
| FIX-009 | Verdict and write-up. Run FIX-007's `--compare` over the four runs. Write `.trd-state/speed-sentence/replay/result.md` with: the two judged medians; every task's and phase's pair values, with tokens and tool calls beside them; the end-of-run review time as an unjudged control; the zero counts for all four runs; each after-audit's findings, marked present or absent in the baseline audit; and one verdict line (keep, remove, or no measurable difference). On keep, re-apply the sentence permanently (cherry-pick `34b7ae7`, then `fcb64cb` keeping the tree's `result.md`) and run `speed-sentence.test.js`. On any other verdict, leave the tree as it is | O1, O2, O3 | FIX-008 | `replay/result.md` states each judged median of per-pair change with both sides' seconds; failed tasks, `retry_count` sums and reconcile reopenings for each after-run, with the before-runs' figures beside them; and every after-audit finding with "also in baseline: yes/no". Its verdict follows O3 exactly: keep only if both medians fell by more than 20%, no after-run count exceeds its paired before-run's, and no after-audit gap is absent from the baseline. On keep, the FIX-003 harness test passes in the tree and the four workflow pairs are byte-identical. Otherwise `grep -rn "Time matters" packages/ .claude/` prints nothing |
| AMEND-001 | [test-gap] FIX-001: SMOKE_IMPL_ARGS prompt append (unset -> exactly /implement-trd docs/TRD/smoke-greet.md; set to --no-verify -> prompt ends with it) has no Jest or BATS test — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: test/smoke/scenarios/implement-one-task.sh:70 is the only reference to SMOKE_IMPL_ARGS under test/, packages/, .claude/) | amendment — no objective recorded | None | [test-gap] FIX-001: SMOKE_IMPL_ARGS prompt append (unset -> exactly /implement-trd docs/TRD/smoke-greet.md; set to --no-verify -> prompt ends with it) has no Jest or BATS test is met |
| AMEND-002 | [defect] FIX-009: the non-keep acceptance check grep -rn "Time matters" packages/ .claude/ prints one line, a verification note quoting the grep command, not the sentence; the sentence itself is absent — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: .claude/verification-notes.md:948 (added in e316da0); no workflow or prompt file contains the sentence or TIME_MATTERS) | amendment — no objective recorded | None | [defect] FIX-009: the non-keep acceptance check grep -rn "Time matters" packages/ .claude/ prints one line, a verification note quoting the grep command, not the sentence; the sentence itself is absent is met |

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

### FIX-005
- **Touches:** `test/smoke/fixtures/speed-replay/availability-consolidation/trd.md`, `.../prd.md`, `.../prd.brief.md`, `.../proposal.md`, `.../fixture.json`, `test/smoke/speed-replay-fixture.test.js`
- **Reuse:** `parseTrd` (`packages/core/lib/trd-parser.js`) and `buildGraph` / `phaseGroups` (`packages/core/lib/task-graph.js`), the functions `/implement-trd` itself uses [read]; the source text via `git -C ~/dev/lightning-lane show 0356413bf:<path>` for `docs/TRD/availability-consolidation.md`, `docs/PRD/availability-consolidation.md`, `docs/PRD/availability-consolidation.brief.md` and `docs/proposals/availability-consolidation.md` (948, 288, 45 and 89 lines) [ran]
- **Replaces:** nothing. Creating a fixture directory is new: `test/smoke/` has no fixtures today, and the one-task scenario writes its TRD inline (`smoke_write_trd`), which cannot hold a 900-line source document [read]
- **Follow:** `fixture.json` carries `sourceRepo`, `base` (`e04cfe0edfffbe3a11e2332f362ca4d571e72c17`), `prCommit` (`9fac17fbbb023b39a7ad6f7d1eb3cf2bfffaa723`), `trdCommit` (`0356413bf`), a `docs` map from each fixture file to its path in the clone (the same paths as at `0356413bf`, so the TRD's `../PRD/` link resolves), and `battery`. The test sits beside `ledger-timing.test.js`, where Jest's default match finds it [read]
- **Careful:**
  - **How the parser reads the marker.** It looks for the live marker in the title and description cells only, and keeps the marker as part of the id when it sits in the ID cell. Verbatim, B004 parses as `"AVAIL-B004 [LIVE]"`, and two dependency edges are lost [ran].
  - **No table in the header.** Keep the provenance header free of any table under a "Phase N" heading, or the parser reads it as tasks.
  - **The PR also carries post-hoc work.** AMEND-001, "Fix three stale phase-2 tests" and "Fix 7 decisioning regressions" are in the PR diff, and none of them is fixture text [ran].
  - **Formatting.** This repo has no Prettier config, so the PostToolUse formatter leaves `.md` files verbatim [ran].
  - **Credentials.** A credential scan of the four documents found none [ran]. Only the dropped AVAIL-T001 block names harness tokens, by variable name.

### FIX-006
- **Touches:** `test/smoke/scenarios/replay-fixture.sh`, `test/smoke/replay-abab.sh`, `test/smoke/README.md`
- **Reuse:**
  - From `test/smoke/lib/project.sh`: `smoke_claude` (headless invocation; it takes the plugin dir from `PLUGIN_DIR`) and `smoke_final_text`. From `lib/assert.sh`: `smoke_timeout`, a portable timeout that works without GNU `timeout` [read].
  - `packages/core/scripts/scaffold-project.sh` in plain mode, then with `--refresh` [ran].
  - The hooks block of `packages/core/templates/claude-directory/settings.json`, which equals this repo's own [ran].
  - FIX-005's `fixture.json`.
- **Replaces:** nothing. `implement-one-task.sh` keeps its own purpose. A new scenario is needed because that one scaffolds an empty project and writes a synthetic TRD (`smoke_write_trd`, `:64`) [read]. A replay starts from a real repository's commit with that project's own `CLAUDE.md` and rules, which `smoke_scaffold_project` overwrites with fixed content.
- **Follow:** `implement-one-task.sh`'s structure: one model run per invocation, the project always kept (as with `SMOKE_KEEP=1`), plus a prepare-only mode for the deterministic part.
- **Careful:**
  - **Never write to `~/dev/lightning-lane`.** Never `cd` into it or run anything there that writes, `git status` included, since it can rewrite the index: use `git --no-optional-locks` for any read beyond `log`, `show` and `for-each-ref`. Make a local `git clone` (1.4 GB of history, objects hard-linked), check out the base on a new local branch, then `git remote remove origin` [ran].
  - **Plain mode then `--refresh`, never `--force`.** `--force` replaces `CLAUDE.md` and `.claude/settings.json` from templates [read]. Neither mode touches hook wiring, so replace the `hooks` key from the template and keep the clone's `permissions`, `env` and `ensemble` [ran]. Two leftover 4.5.0 commands (`investigate.md`, `seed-dev.md`) stay; nothing invokes them [ran].
  - **The four config edits, identical on both sides.**
    - Constitution line 180: `verification_level: live-required` becomes `verification_level: unit-only` [ran].
    - `stack.md`, under its "### Testing" table: one "Full suite (phase-gate battery)" line naming the battery.
    - `CLAUDE.md`: a short sandbox block at the top. It says the "Local-First Iteration (MANDATORY)" section (`CLAUDE.md:161`) does not apply, and there is no running stack, docker or network.
    - A shim dir first on `PATH`: `docker` always refuses; `make` refuses `localdev*` targets and passes everything else through.
  - **The battery** [ran: green offline at the base, 1,424 files in 69s; at the PR commit, 1,425 in 77s]:
    `pnpm turbo test --filter='!@ll/mobile' --filter='!@ll/data' --filter='!@ll/workers' --continue && pnpm --filter @ll/data exec vitest run --exclude '**/{bookingEntitlementsMigration.test,facilityMealPeriodsMigration.test,perGuestBookingEntitlementsMigration.test,mealWindows.integration.test}.ts' && pnpm --filter @ll/workers exec vitest run --exclude '{**/__tests__/live/**,**/diningAlertSimulation.replay.test.ts}'`
    Vitest 1.6 accepts only one `--exclude` value, so a turbo passthrough fails in the workers and agents packages, whose scripts already pass one [ran]. `@ll/mobile` is excluded as CI excludes it.
  - **Dependencies.** `CI=1 pnpm install --offline --frozen-lockfile` takes about 13s from the local pnpm store and runs `prisma generate` offline [ran]. Run it in every run clone, since `node_modules` is not cloned.
  - **Sides.** Build both by cloning this repo into a temp dir, never as a worktree of, or a checkout in, the main checkout. For the after side, `fcb64cb`'s conflict on `.trd-state/speed-sentence/result.md` is resolved to the tree's copy [ran].
  - **Pass the side's dir as both sources.** Use it for the scaffold source and for `claude --plugin-dir`. `packages/full/workflows` links to `packages/core/workflows` [read by reviewer], and which copy a named workflow resolves to is unverified.
  - **Env:**
    - `ENSEMBLE_RUNTIME_REFRESH_DISABLE=1`: the clone's SessionStart `runtime-refresh.sh` would otherwise refresh its runtime from the plugin [read].
    - `npm_config_offline=true`.
  - **Timeouts and completion.**
    - Run cap 10800s; audit cap 2700s.
    - A timeout counts as "completed (process hung)" when the banner is in the final message, or when all ten tasks are terminal and every ledger start has a stop.
    - In the first measurement, after-run 4 hung after its banner, and baseline run 4 ended with an empty final message after its task had succeeded (`result.md`).
  - **Do not register the scenario with `run-smoke.sh`.**
    - Leaving it out of `LLM_OPT_IN_SCENARIOS` keeps a 3-hour run out of every `--with-llm` pass.
    - Calling it through `run-smoke.sh` would cap it at the 300s default for unlisted scenarios [read].
    - Invoke it directly instead.

### FIX-007
- **Touches:** `test/smoke/ledger-timing.js`, `test/smoke/ledger-timing.test.js`
- **Reuse:** the start/stop pairing by `agent_id` and `median()` already in `ledger-timing.js` [read]. Factor the pairing out of `summarize()`; do not write a second one. `process.exitCode`, not `process.exit()`, so piped output is not cut off (the `fcb64cb` fix) [read].
- **Replaces:** nothing. `summarize()` keeps its output. This extends the existing owner of ledger timing rather than adding a sibling, because pairing starts with stops is the part that must not be written twice.
- **Follow:** plain Node, `'use strict'`, no dependencies; transcripts are read through the injected `readFile` so the test needs no real files.
- **Careful:**
  - **Labels and phases come from `.meta.json`.** The label is `description` (`task:<id>`, `gate:verify-app`) and the phase is `workflowPhase` (`Phase N`), as verified on `.trd-state/speed-sentence/after/run-2/` [ran].
  - **Streaming rows.** One `message.id` can appear on several assistant rows, each carrying a different content block, with `output_tokens` growing across them (41 then 123; 8 then 214) [ran]. So count `tool_use` blocks over every row, and take the largest `output_tokens` per `message.id` before summing.
  - **Where each field lives.** The stop row carries `agent_transcript_path` and the start row carries `agent_type` [read].
  - **Archived runs.** When the absolute transcript path is gone, look for `<ledger dir>/transcripts/<basename>`, so a run copied by FIX-008 can be recomputed after Claude Code prunes its project logs.
  - **Key on the label, not the type.** Workflow subagents can show `agent_type: workflow-subagent` in a ledger [ran].

### FIX-008
- **Touches:** `.trd-state/speed-sentence/replay/before/run-1/`, `.../replay/before/run-2/`, `.../replay/after/run-1/`, `.../replay/after/run-2/`, `.../replay/audits/`, `.../replay/runs.tsv`, `.../replay/reconcile-reopens.txt`
- **Reuse:** FIX-006's `replay-abab.sh` and scenario; FIX-007's `--per-task`; `reconcile()` in `.claude/lib/implement-state.js`, run as FIX-004 ran it [read]
- **Replaces:** nothing. The first measurement's `baseline/` and `after/` directories stay as they are.
- **Follow:**
  - **Order:** before-1, after-1, before-2, after-2, then the three audits, so no audit sits between two timed runs.
  - **Audit plugin dir:** audit each kept clone with the same side's plugin dir it ran with.
  - **Long processes:** start the driver in the background and wait with `Monitor`, never in a foreground Bash call (10-minute cap).
- **Careful:**
  - **Expected time:** about 75 minutes per run (roughly 60–110), so about 5 hours for the four runs [inferred, not measured]. Add three audits of about 10–25 minutes each. The estimate is the original run's 92-minute implementation, minus most of its 35-minute docker-bound phase-2 gate, plus a 7-minute end-of-run review [ran on the original ledger].
  - **Not a dispatched phase task.** `/implement-trd` marks a phase workflow stalled after 30 minutes (`implement-trd.md` "Task Timeout") [read], so the lead session runs this task itself rather than dispatching it inside a phase.
  - **Disk:** each kept clone is about 3.6 GB, with `node_modules` hard-linked to the pnpm store. 621 GB free [ran].
  - **Transcripts:** they live under `~/.claude/projects/<slug of the run dir>/`. Copy each run's `subagents/` into its run directory right after the run.
  - **Check extraction before spending hours:** after before-run 1, fail if extraction finds fewer than ten task keys or three gate phases. Failing after one run costs about 75 minutes; failing after four costs about 6 hours.
  - **Gap matching:** compare audit findings by the task or requirement id each finding names, plus its check (verification, validation, traceability, test quality). It is a reading of two model-written reports, not a machine diff.

### FIX-009
- **Touches:** `.trd-state/speed-sentence/replay/result.md`. On keep only: `packages/core/workflows/implement-phase.js`, `sweep.js`, `verify-functional.js`, `create-trd.js`, their `.claude/workflows/` copies, and `packages/core/workflows/speed-sentence.test.js`
- **Reuse:** FIX-007's `--compare` output; the first `result.md`'s layout, including its control row (the end-of-run review, which never receives the sentence) [read]
- **Replaces:** on keep, the first measurement's "no measurable difference" stops being the sentence's standing verdict; the old `result.md` stays as history
- **Follow:** numbers carry their unit and baseline ("84s, was 139s"); name each task, then its id
- **Careful:**
  - **Re-applying on keep:** `cherry-pick 34b7ae7` applies cleanly; `fcb64cb` conflicts only in `result.md`, resolved to the tree's copy [ran].
  - **Any other verdict:** the tree already matches it, because the sentence is out now [ran].
  - **Counts:** each after-run's failed tasks, retries and reconcile reopenings are judged against its paired before-run's: more on the after side fails (OQ-2, resolved by the owner 2026-10-20).

### AMEND-001

- **Touches:** `test/smoke/implement-one-task-prompt.test.js` (new), `test/smoke/scenarios/implement-one-task.sh` (only if the prompt line must be made testable)
- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

### AMEND-002

- **Touches:** `.claude/verification-notes.md`
- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify

*Rewritten by `/audit-build` round 2 on 2026-10-21. This round was a re-audit limited to whether
round 1's defects are fixed and to the files changed since `e316da0`; it took no fresh sample.
It confirmed the two round-1 amendments: the `SMOKE_IMPL_ARGS` prompt test (AMEND-001,
`test/smoke/implement-one-task-prompt.test.js`, 4 tests passing) and the grep that no longer
matches its own note (AMEND-002: `grep -rn "Time matters" packages/ .claude/` now prints
nothing). Every row below was carried over from round 1 and was NOT re-checked by this round,
because it lies outside that scope.*

- **No PRD, so validation against product intent is unchecked.** This TRD has no source PRD
  (`docs/PRD/speed-sentence.md` does not exist), so both audit rounds checked the delivered tree
  against the TRD only. Whether the work matches what the owner wanted, beyond what O1 to O3
  record, was not checked.
- **How often the sentence drops required work.** One after-run of two dropped two pieces of
  required work (a flag and a test); neither before-run did. Two runs per side show a signal, not a
  rate (`replay/result.md`, "What this does and does not show"). Not re-checked: replay evidence,
  unchanged since `e316da0`.
- **Whether the gate's 33.7% fall is real.** It rests on 6 phase pairs, and single gates varied by
  up to 69% between runs. Not re-checked: replay evidence.
- **The sweep fix, grounding merge, render and reconcile prompts were never measured.** The
  replay's `--no-verify` run does not reach them. Moot while the verdict is remove: the sentence is
  in none of them.
- **Whether the result holds for features of other sizes.** The replay used one ten-task fixture.
- **Which copy of a named workflow wins** when both the project's `.claude/workflows/` and the
  plugin dir carry one. Not checked. The replay made it irrelevant by supplying both from the same
  side.
- **Whether the PATH shim reaches subagents' Bash calls.** The pre-flight probed the lead session
  only (`replay/docker-probe.txt`: `docker` refused, exit 1). Subagents are inferred to inherit the
  same environment, not checked.
- **Why `diningAlertSimulation.replay.test.ts` fails offline at the base** was not diagnosed. It
  is excluded from the battery either way.
- **Audit findings the audits did not raise were not searched for.** Gap matching is a reading of
  model-written reports. Each finding absent from the baseline audit was then checked by grep in
  all four kept clones (`replay/result.md`), but nothing was checked that no audit flagged.
- **Latency drift** between the four runs is limited by pairing adjacent runs, not removed. The
  control (the end-of-run review, which never gets the sentence) took 664s and 498s on the two
  after-runs, against 520s and 514s on the before-runs.
- **The fixture's own text is not fully verbatim.** Its Q-2 objective and section 6.1 still say
  `live-required` while the clone runs `unit-only`, and section 5 still describes the dropped
  phase 4. All three audits read the same text, so any gap it causes appears in the baseline too.

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.1.1 | 2026-10-20 | `/refine-trd`, your answers to OQ-2 and OQ-3. **Changed:** the zero-count rule now judges each after-run against its paired before-run instead of against zero (O3, the success paragraph and FIX-009's criteria), so a retry the fixture causes on both sides no longer rejects the sentence; previously any non-zero after-run count meant remove. **Resolved:** OQ-2 (as above), OQ-3 (AVAIL-B004's two edits accepted). Nothing removed |
| 1.1.0 | 2026-10-20 | `/refine-trd` from your feedback, for a second, larger measurement. **Changed:** O3 rewritten for the replay (previously: "A before/after measurement on one fixed task reports per-task time from the dispatch ledger, and the change is kept only if time falls while failed tasks, retries, reconcile reopenings and new audit gaps all stay at zero"); the "Success, stated so it can fail" paragraph rewritten to match, with the first measurement's rule kept beneath it. **Recorded:** your rulings — the fixture comes from lightning-lane, not this repo; one baseline `/audit-build` on before-run 1, plus one on each after-run (3 in all); OQ-1 resolved by the first measurement. **Added:** the replay's design decisions (fixture, AVAIL-B004's two edits, runtime install, clone config edits, side builds, pairing, run conditions); two Non-Goals (lightning-lane and its shared stack never touched; no database, network or paid eval); OQ-2 and OQ-3; FIX-005 to FIX-009 with grounding; nine Could Not Verify rows. FIX-001 to FIX-004 unchanged, marked done history. O1 and O2 unchanged |
| 1.0.0 | 2026-10-19/20 | Initial TRD: O1–O3, FIX-001 to FIX-004 (first measurement on the one-task smoke fixture) |
