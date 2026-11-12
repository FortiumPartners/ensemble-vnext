# TRD: fewer-stuck-ship-endings

**Source PRD**: None — small change decided by the owner's plan (`docs/plans/ship-cost-reduction/roadmap.md` item 5, "Fewer STUCK endings in a ship run")

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When CI fails on the PR head inside the `merge` step (the named case: the head a merge-up just pushed), the run does not end STUCK: it runs collect-findings, fix-findings, push and wait-ci, then hands `merge` out again, and merges once the head is green — all within the bound | roadmap item 5 brief, 2026-11-11 | yes |
| O2 | The loop is bounded by a new `rounds=` parameter on `merge`, default 2 (the `repeat` default, `DEFAULT_ROUNDS`); when the bound is spent the run stops STUCK with a reason naming the rounds, and `gh pr merge` never runs on a red head | roadmap item 5 brief, 2026-11-11 | yes |
| O3 | Every stop in the merge contract's "One rule for every stop" list and every `stuck` path in `ship-sequencer.js` is classified as a wait, a bounded loop or a real stop (table in Decision); waits and loops are converted, real stops kept; a run that merges today still merges | roadmap item 5 brief, 2026-11-11 | |
| O4 | No path merges without the custody proof or bypasses branch protection: the custody gate, the pr-head check, `--match-head-commit` and the merge-link proof stay in front of and behind every `gh pr merge` | roadmap item 5 brief and out-of-scope fence, 2026-11-11 | yes |
| O5 | The sequencer stays primitive-blind: the loop is declared in the merge contract's front matter and the sequencer source names no primitive | `ship-sequencer.js` header (D41); existing test "the module source names no primitive" | |

## Intended Change

Today, inside the merge step (`packages/core/contracts/ship-primitive-merge.md` step 1), a CI
failure on the head a merge-up just pushed returns `stop`; the run ends `COMMAND STUCK`, and in
Forge that is an escalation and a new session (57 ship-stage escalations in 14 days for Storybook).
The sequencer has no way to loop a single step: a `stops-on` result outside a `repeat` always ends
the run (`record()`, "the run stops here").

After this change:

1. **A step-level recovery loop in the sequencer, declared by the contract.** Three new front-matter
   keys: `loop-on: <result>` (must also be listed in `stops-on`), `loop-via: <primitives, in order>`
   (each must be `outward: no` and must not itself declare `loop-via`; the loader refuses either)
   and `loop-rounds: <param>` (a declared parameter whose value is a whole number). At parse time a
   top-level step whose contract declares `loop-via` gets a `loop` — `{ on, rounds, body }`, the
   bound stored in the snapshot like `repeat.rounds` — **only when every `loop-via` primitive is
   already listed as a step before it** in `ship.md` (a repeat body counts) **and rounds is above
   0**. Body step ids are `<step id>.1`, `<step id>.2`, …; each takes the params of the nearest
   earlier listed step of the same primitive, so the loop runs the owner's own fix-findings and
   wait-ci, `format=` and `bar=` included. A policy that lists no fix steps gets no loop: the run
   never runs a fix the owner did not list.
2. **Recording the `loop-on` result** on that step, with rounds left, moves the cursor to the loop's
   first body step instead of stopping. The body runs in order; its last step's success hands the
   owning step out again. A body step's `stops-on` result (wait-ci `failed`) starts the next round.
   A body step's `repeat-until` result (collect-findings `clean`) ends the loop and hands the owning
   step out again, exactly as it ends a `repeat`. The pass sequence for `rounds=2`, literally:
   merge pass 1 `red` → body round 1 → merge pass 2 `red` → body round 2 (`final: true`) → merge
   pass 3 `red` → stuck; or, inside round 2, wait-ci `failed` → stuck. So `rounds=N` means N body
   rounds and at most N+1 attempts of the owning step (a `repeat` with `rounds=N` makes N+1 body
   passes; the two differ and the guide says so). The stuck reason names the owning step and the
   step that ended it: `step <owner id> (<primitive>) loop ended after <n> rounds: step <id>
   (<primitive>) recorded <result>`. `rounds=0` synthesizes no loop (today's behaviour). A snapshot
   taken before this change has no `loop` and stops exactly as today. Inside a `repeat` no loop is
   synthesized: the repeat already loops. `laterNeedsOf` counts the owner and the next round while
   rounds remain; `status()` marks each loop step `loop: true` so the readout counts it only once it
   has run; `authorization()` includes loop bodies.
3. **The merge contract** declares `params: method=merge rounds=2`, `results: merged, red`,
   `stops-on: red`, `loop-on: red`, `loop-via: collect-findings, fix-findings, push, wait-ci`,
   `loop-rounds: rounds`. Step 1 waits for the PR head's checks as `wait-ci` does (find, `Monitor`
   re-armed while pending, re-run failed jobs once, record flakes) **only when the head is one no
   recorded step judged**: this attempt pushed a merge commit, or the PR's `headRefOid` differs from
   the `commit` of the latest `pushed` result in `context` (a merge commit an earlier, stopped
   attempt pushed). A head the owner's repeat already judged keeps that verdict, so a run that
   merges today still merges. Failed: re-read `gh pr view <pr> --json state`; `MERGED` (merged by
   hand during the wait) goes to step 2; otherwise return `red` with `data: { failed, head }` —
   before the custody gate, so no merge on red. Passed or no checks: go on to the gate. The stops
   are reclassified per the table in Decision.

Checkable: `npx jest packages/core/lib/ship-sequencer.test.js packages/core/contracts
packages/core/lib/ship-build.seam.test.js` passes, including a seam case where a merge-up head is
red, the run loops through collect-findings, fix-findings, push and wait-ci, and `gh pr merge` is
called once, matched to the fixed head, within the bound; and one where CI stays red, the bound is
spent, the run is `stuck` and `gh pr merge` was never called.

## Decision

**The loop lives in the sequencer, declared by the contract — not in contract prose.** Prose that
says "run fix-findings, then wait-ci, up to N times" would be re-derived on every run, could not be
resumed at the right sub-step, and could not be tested; the sequencer already owns order, bounds
and resume (its header, D1/D45). It stays primitive-blind: the three keys name primitives only in
the contract file. Rejected: a new result that tells the lead to jump back to an earlier `repeat` —
jumping backwards would re-run request-review and the owner's whole review loop.

**The loop runs only steps the owner listed.** Synthesized only when every `loop-via` primitive is
listed before the merge, with those steps' params. This keeps the principle the table applies to a
top-level `wait-ci`: never add a fix step the owner did not list. It also leaves `trdRefusal`
unchanged in effect (the loop's fix-findings is one the policy already lists).

**Loop order: collect-findings, fix-findings, push, wait-ci.** The head is already red, so findings
come first; wait-ci last decides whether the step is retried (green) or the next round starts (red).
`final` is true on the last round, and collect-findings `clean` exits the loop, so its below-bar and
final-pass rules behave as in a `repeat`.

**Merge waits for CI only on a head nothing judged.** Waiting on every attempt would turn a red
check the owner's findings bar accepted (a `[below-bar]` or final-pass `[below-critical]` row) into
a `red` loop that ends stuck: a regression. Waiting on a head this step or an earlier stopped
attempt pushed is what keeps "no merge on red" for merge-up commits, including on `--resume`.

**Classification of every stop** (the TRD's required list). *Wait* = a later check clears it with no
decision; *loop* = bounded mechanical retry; *real* = needs a person.

| Where | Stop | Class | New behaviour |
|-------|------|-------|---------------|
| merge step 1 | `decide` `ok: false`: could not read the PR (gh/API error) | wait | re-run `decide` up to 8 times, 15s apart; still unreadable: `stop` (auth or network: a person) |
| merge step 1 | `decide` `ok: false`: PR closed without being merged | real | `stop`, unchanged |
| merge step 1 | `decide` `poll` (mergeability `UNKNOWN`) | wait | unchanged: 8 polls, 15s apart, then treated as `skip` |
| merge step 1 | `merge-base-in` `ok: false` (clash outside record files, invalid JSON record, git failure) | real | `stop`, unchanged: resolving a code clash is a judgement |
| merge step 1 | the push of the merge commit fails | real | `stop`, unchanged: auth, or another writer on the branch |
| merge step 1 | the PR's `headRefOid` still trails the push | wait | poll up to 40 times, 15s apart (10 minutes, was 8 = 2 minutes) inside the step; still trailing: `stop` |
| merge step 1 | CI still running on the head | wait | unchanged: `Monitor`, re-armed while a check is pending |
| merge step 1 | CI failed on an unjudged head (after one rerun) | loop | return `red`: the sequencer runs the merge loop, up to `rounds`; with no loop synthesized, `red` stops as today |
| merge step 2 | custody gate stop (head trail, `refused`, re-proof not met) | real | `stop`, unchanged; the shared gate document is not edited |
| merge step 3 | pr-head check fails (a commit reached the PR after verification) | real | `stop`, unchanged: never merged unverified |
| merge step 3 | `gh pr merge` fails (branch protection, a required review, head mismatch, the base moved) | real | `stop` with gh's message, unchanged; never bypass protection. A base that moved is cleared by `--resume` (step 1 merges it in), not by an in-step retry that would push between gate and merge |
| merge step 4 | merge-link proof fails | real | `stop`, unchanged |
| sequencer | `shipped.json` missing, unreadable or wrong version | real | unchanged |
| sequencer | contracts unreadable, cursor step not in snapshot, contract gone | real | unchanged |
| sequencer | `not authorized: <primitive>` | real | unchanged: the owner's authorization |
| sequencer | a contract's `stop` result | — | as that contract classifies it (merge: above) |
| sequencer | a `stops-on` result outside a repeat with no loop (a top-level `wait-ci` `failed`; merge `red` when `ship.md` lists no fix steps) | real | unchanged: adding a fix step would act beyond the owner's policy |
| sequencer | a `loop-on` result with rounds left | loop | new: runs the step's loop |
| sequencer | a `repeat`, or a step's loop, spent without its exit | real | stop with the bound named (the bound was the loop) |

Every `stop` keeps the merge contract's "One rule for every stop" (re-read the PR state; `MERGED`
sets `data: { merged: true, base }`).

**Weight kept at small, noted.** The review called the scope closer to medium (a new snapshot shape,
three keys, a new result). It is four tasks with one approach and no product question; the review
pass already did the design check an audit would add, and its corrections are applied here.

## Non-Goals

- Changing `wait-ci`, `fix-findings`, `collect-findings` or `push` contracts (their behaviour is reused as-is).
- Looping a top-level `wait-ci` `failed`, or `release` — not asked, and it would add fix steps the owner did not list.
- Changing the custody gate's proof, the re-proof retry (item 3, built) or the fix sizing (item 4, built).
- Forge's handling of a parked run; the run-record location (item 6 of the strategy); anything only Storybook needs; CI guidance in ship-setup.
- Editing this repository's owner-governed `.claude/rules/ship.md`.

## Verification Artifacts

None apply — the change is a library and contract prose with no UI, no data-rendering screen, no design and no screen-to-screen flow; the Jest battery named in Intended Change is the proof.

## Verification Environment

**Environment**: local
**Refresh**: none declared — tests read the working tree
**Cannot be checked there**: real GitHub behaviour (mergeability, checks, protection); the live merge-up with red CI on `github-live-test` is deferred to after this build

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | How long may the merge step loop on a red head? | `rounds=2` default (the `repeat` default), `rounds=0` disables; roadmap open question, default taken unattended | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Sequencer: load `loop-on`/`loop-via`/`loop-rounds` (refuse an outward or loop-declaring `loop-via` primitive), synthesize a top-level step's loop at parse only when every `loop-via` primitive is listed before it and rounds > 0, with the bound stored in the snapshot and params from those listed steps; run it in `record()`/`next()`; loop branches in `flatten`, `laterNeedsOf`, `status()` (`loop: true`) and `authorization()`; add the three keys to the header comment; unit tests over fixture contracts; mirror to `.claude/lib/` | O1, O2, O5 | None | `npx jest packages/core/lib/ship-sequencer.test.js` passes with new cases: the literal `rounds=2` pass sequence (owner pass 1 `loop-on` → body round 1 → owner pass 2 → body round 2 with `final: true` → owner pass 3 `loop-on` → stuck, reason naming the owner step, the ending step and 2 rounds, next top-level step never handed out); owner success on pass 2 advances to the next top-level step; a body `stops-on` result starts the next round, and on the last round stops; a body `repeat-until` result hands the owner out again; no loop when a `loop-via` primitive is not listed before the owner, when `rounds=0`, inside a `repeat`, or in a snapshot step without `loop` (each stops on the `loop-on` result as today); loop body params equal the earlier listed step's; `status()` flags loop steps; `authorization()` lists loop-body primitives; loader errors for `loop-on` not in `stops-on`, an unknown, outward or loop-declaring `loop-via` primitive, a `loop-rounds` naming no param; "the module source names no primitive" still passes |
| FIX-002 | Merge contract: new front matter; step 1 waits for CI only on a head no recorded step judged, re-reads `MERGED` before returning `red`, returns `red` before the gate; decide read retry; head-trail poll 40×15s; "One rule for every stop" list updated; update `ship-primitives.test.js` (EXPECTED merge results `merged, red`, `rounds` default 2, loop keys load, text assertions); mirror to `.claude/contracts/` | O1, O2, O3, O4 | FIX-001 | `npx jest packages/core/contracts` passes; it asserts `contracts.get('merge')` has `params.rounds.default === '2'`, `loopOn: 'red'`, `loopVia` in order, the CI wait and `red` precede the custody gate, the `MERGED` re-read precedes `red`, the CI-wait condition names the latest `pushed` commit, and the gate / pr-head / `--match-head-commit` / merge-link order and "Commit and push nothing between the gate and `gh pr merge`" are unchanged; `ship-custody-gate.md` is not modified |
| FIX-003 | Seam test: play the lead through a red merge-up head that the loop fixes and merges green within the bound, and one where CI stays red until the bound is spent; stub `gh pr checks`; policy lists push, open-pr, a repeat with wait-ci, collect-findings, fix-findings, then merge | O1, O2, O4 | FIX-001, FIX-002 | `npx jest packages/core/lib/ship-build.seam.test.js` passes; case 1 asserts merge records `red`, then the loop steps are handed out in order collect-findings, fix-findings, push, wait-ci, then merge (pass 2), status done, exactly one `gh pr merge` call matched to the fixed head; case 2 asserts `status: stuck`, reason names 2 rounds, zero `gh pr merge` calls; existing merge cases still pass unchanged in outcome |
| FIX-004 | Docs: `ship-build.md` command Step 4 (a `loop-on` result keeps the loop going), `docs/guides/ship-build.md` (merge `rounds=` and result `red`, the loop keys in the contract key list, how loop rounds differ from repeat passes, the stop classification), ship-setup skill's merge description; mirror the command to `.claude/commands/`; keep `ship-build-surface.test.js` green | O3 | FIX-002 | `npx jest packages/core/commands/ship-build-surface.test.js packages/core/contracts` passes; the guide's merge row names `rounds` (default 2) and the result `red` |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/ship-sequencer.js`, `packages/core/lib/ship-sequencer.test.js`, `.claude/lib/ship-sequencer.js`
- **Reuse:** `loadPrimitives` (add `loopOn`, `loopVia`, `loopRounds`; validate after all files load), `parseSectionSteps`/`validateSteps` (attach `step.loop`), `flatten` (add `loop` entries after their owner), `record()`'s repeat branch arithmetic (`pass < rounds + 1`), `laterNeedsOf`, `next()`'s `final` [read]
- **Replaces:** nothing removed; the `contract.stopsOn` branch in `record()` now runs only when no loop round is left [read]
- **Follow:** primitive-blind source (test "the module source names no primitive"); one JSON line per CLI call; the snapshot is the only source after `start` (`ship.md` never re-read); fixture contracts in the test's `CONTRACTS` map [read]
- **Careful:** `handedOut`/`cursor.pass` must move together; old snapshots without `loop` must behave exactly as today; read the bound from `step.loop`, never from the contract at record time (the snapshot is the only source); `packages/full/lib` is a symlink — do not copy there [ran]

### FIX-002
- **Touches:** `packages/core/contracts/ship-primitive-merge.md`, `packages/core/contracts/ship-primitives.test.js`, `.claude/contracts/ship-primitive-merge.md`
- **Reuse:** `ship-primitive-wait-ci.md` Do steps 1-3 by reference (checks, `Monitor` `timeout_ms: 1800000`, rerun once, `flaky-ci.js record`); `merge-up.js decide` [read]
- **Replaces:** step 1's "A CI failure on the new head is a `stop`, so the merge never runs on red"; the 8-poll head wait becomes 40 polls [read]
- **Follow:** keep the existing tested phrases that still hold (gate before `gh pr view <pr> --json state`, "Commit and push nothing between the gate and `gh pr merge`", "Never bypass protection", "One rule for every stop", `--match-head-commit <observed>`); byte-identical mirror test [read]
- **Careful:** the existing text tests pin the step-1 marker order ending in `wait-ci` before the gate and the "One rule" list order (`merge-base-in … push … head wait … CI`); update them deliberately, do not weaken the custody-order assertions [read]

### FIX-003
- **Touches:** `packages/core/lib/ship-build.seam.test.js`
- **Reuse:** the `merge step` describe's `gh` stub, `twoCriteria`, `landOnBase`, `playMerge`, `playPush`, `playGate` [read]
- **Replaces:** nothing [read]
- **Follow:** the test plays the lead; real sequencer CLI, real contracts, real custody, bare origin; extend the stub with `pr checks` driven by an env var (a file listing red heads) [read]
- **Careful:** with no loop-via steps listed before merge no loop is synthesized, so the policy must list them; a fix commit to shipped source makes the gate `reverify` — fix a file the criteria do not cover or pass `reverifiedStatus: 'met'`; add new env vars to `STUB_VARS` so they are cleared [inferred]

### FIX-004
- **Touches:** `packages/core/commands/ship-build.md`, `.claude/commands/ship-build.md`, `docs/guides/ship-build.md`, `packages/skills/ship-setup/SKILL.md`
- **Reuse:** the guide's contract-key list (line ~118) and primitive table (line ~90) [read]
- **Replaces:** the guide's merge row results `merged` only [read]
- **Follow:** `command-status.md` prose rules; byte-identical command mirror [read]
- **Careful:** `packages/core/commands/ship-build-surface.test.js` pins command text [read]

## Could Not Verify

- Real GitHub behaviour of a red merge-up head being fixed and merged — deferred live check on `github-live-test`, after this build.
- Whether Forge resumes a run parked at `wait` without an escalation is Forge's side.
