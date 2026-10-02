# TRD: audit-convergence

**Source PRD**: None — small change decided in session (owner, 2026-10-01)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A feature is re-audited only when the previous round found a true product defect, and at most twice; after that it closes, with anything left named as caveats | owner, 2026-10-01: "Let's cap at two, if true defects are found" — after lightning-lane's one-active-trip took six audits, of which only rounds 1–2 found product defects |
| O2 | Test-only gaps (a missing or weak test, with no product defect) are still fixed, in the same fix pass as everything else, but they never cause another audit: the feature closes with them fixed, or named as caveats if a fix fails | owner, same turn: "but get the others" |
| O3 | A re-audit builds on the previous one: when the TRD is unchanged since the previous round, it reuses that round's requirement list, and its verifiers check what changed since the previous audited commit plus that report's open items first | lightning-lane session 851e03b3: trip-dates-disney-sync's requirement list was 34, then 28, then 12 items across rounds; one-active-trip's later rounds found long-standing weaknesses one sample at a time |
| O4 | A fix run that closes an audit finding fixes every instance of that weakness across the feature, not only the one the audit named | same session: rounds 3–6 of one-active-trip kept finding siblings of the weakness the previous round's fix had just patched in one place |
| O5 | A scheduled wake-up for an audit that already finished does nothing; it never starts a new audit | same session: one wake-up fired twice, 21 minutes apart, and the second fire launched an audit nobody asked for |

## Intended Change

**Today:**
- `/audit-build` closes a feature only when its verdict is not "do not proceed" and nothing is handed to `/implement-trd --reconcile` on that run (`audit-build.md:221-232`). Any finding with a covering task is handed off, so a round that finds even one missing test leaves the feature open. The fix run is started without `--chained` (`audit-build.md:133`), so it runs as its own command, verification and banner included, and its NEXT is another `/audit-build`.
- Nothing counts audit rounds. The verifiers' findings carry an optional `action` (`audit-build.js:108-121`), but `gap` covers both "no test" and "not built" (`:309-314`), and the reconcile stage returns only prose plus `applied`/`rejected` (`:565-592`). So nothing can tell a product defect from a test gap without re-judging.
- Every audit rebuilds its requirement list (`audit-build.js:207-264`), and the test-quality check reads "a representative sample" (`:170`). Nothing reads the previous report.
- Chainable gaps reach the fix run only when something records them as discoveries; `audit-build.md` has no step that does, so the fix-task text never reaches them.
- Fallback wake-ups are the model's own `ScheduleWakeup` calls; nothing ties a wake-up to the run it was scheduled for.

**After:**
- **The verifiers say what kind of gap they found.** `FINDING_ITEMS.action` replaces `gap` with `gap-unbuilt` (the requirement or task has no implementation) and `gap-untested` (it is built, but no test proves it), and `action` becomes required.
- **A round ledger, and a deterministic decision.** New `packages/core/lib/audit-rounds.js`:
  - `classify({ action, check })` returns `defect`, `test-gap` or `other`.
    - `defect`: `mismatch` (except from the citation or consistency checks) or `gap-unbuilt`.
    - `test-gap`: `gap-untested` or `untested`.
    - `other`: `fix-citation`, `confirm-wanted`, and anything else.
  - The ledger is `.trd-state/<feature>/audit-rounds.jsonl`, one small append-only line per completed, non-report-only audit: `{ round, runId, auditedCommit, trdHash, verdict, defects, testGaps, uncovered, ts }`. It has its own writer; a round line is a few hundred bytes. The requirement list goes to a separate file, `.trd-state/<feature>/audit-index.json`, overwritten each round.
  - `decide({ rounds, verdict, defects, testGaps, uncovered, reportOnly })` returns `{ chain, reaudit, close, capReached, caveats }`. The rules:
    - **`--report-only`** → no hand-off, no close, no ledger line.
    - **`uncovered > 0`**, meaning a required behaviour has no task covering it → those items stop for design and are never handed off. The feature stays open. Covered items in the same round are still handed off.
    - **"do not proceed" with nothing to hand off** → stays open.
    - **No defects, no uncovered items, verdict not "do not proceed"** → hand off any test gaps, then close. Never re-audit.
    - **Defects found, fewer than 2 re-audits used** → hand off defects and test gaps, then re-audit.
    - **Defects found, 2 re-audits used** → hand off everything, then close, naming "these defect fixes were not re-audited" as a caveat. `capReached` is true.
  - The round count restarts after a close (rounds are counted since the last `closed.json`).
  - `staleWake({ ledger, runId, head })` is true when the ledger already has `runId`, or when the last round's `auditedCommit` equals `head` and nothing has changed since.
- **The fix run is chained, so the audit owns the run's one banner.** `/audit-build` records each handed-off item as a discovery (`foundBy: 'audit-build'`, `blocksFeature: true`, with its class), so `--reconcile` promotes it to a task. It then starts `/implement-trd <trd> --reconcile --chained`. `implement-trd.md` §3.7 lists `/audit-build` as a second sanctioned caller.
  - Under `--chained`, the fix run skips its own verification and banner and returns one RETURN line. The audit's re-audit is the check on defect fixes; test-gap fixes are checked by the fix run's own tests.
  - When `close` is true, `/audit-build` then writes the close record, commits it and the report together, opens the PR, and prints the run's single banner. Anything the fix run reports as not done becomes a caveat.
  - When `reaudit` is true, NEXT is `/audit-build`; otherwise NEXT is what the close leaves (merge the PR, or the design work for uncovered items).
  - The readout names the round ("round 2 of at most 3") and why it closes or re-audits.
- **Re-audits build on the previous round.** On a re-audit, `/audit-build` passes `previous: { reportPath, auditedCommit, index }` to the workflow.
  - When the TRD's hash matches the previous round's `trdHash`, the workflow reuses `previous.index` and skips the Index stage; when it has changed, it rebuilds as today.
  - The verifiers are told to check the files changed since `auditedCommit`, and the previous report's open items, first. The test-quality check reads those instead of a fresh sample.
  - The clean-path return and the normal return both carry `handoff` and `index`.
- **A stale wake-up does nothing.** Every fallback `ScheduleWakeup` `/audit-build` schedules carries the workflow run id in its prompt. On any re-entry, `/audit-build` calls `stale-wake`; when it is true, it prints one line saying the audit already ran at this commit and stops.
- **Fix runs fix the class, not the instance.** Rows that `promoteToTrd` writes for `foundBy: 'audit-build'` discoveries tell the implementer to find and fix every instance of that weakness across the feature's touched files and to list each one, and `implement-trd.md` §2.1a says the same.

## Owner rulings, 2026-10-01 (after the first build)

These supersede anything above that disagrees with them.

1. **Never close while a true defect is open, not even with a caveat.** At the cap, the defects still go to the fix run, but the feature stays open and NEXT is the owner's call, not another audit.
2. **Tests are not the product.** A finding about a weak or missing test matters only if the weak test masks a real defect. When it does, the finding is reported as that defect, and it counts as a defect for re-audits. When it doesn't, the test is fixed as secondary work; it never blocks closing and never triggers a re-audit. So a finding from the test-quality check is always a test gap, and a masked defect is reported by its own check.
3. **An audit is not a verification.** It samples, so a re-audit must not take a fresh sample. A re-audit checks only two things: whether the previous round's defects are fixed, and the code changed since that audit. Anything it notices outside that scope is recorded as a non-blocking discovery, never raised as a finding.

## Decision

- **The decision to re-audit is code.** `decide()` owns it, with tests, the same way `fix-plan.js`'s `plan()` owns whether `/plan` chains. The rule that let one-active-trip run six rounds lived in prose that read sensibly paragraph by paragraph.
- **The class is set at the source, not re-judged.** Splitting `gap` into `gap-unbuilt` and `gap-untested` lets `classify()` be a pure function of what the verifier said. A known limit: a weak test that hides a real defect is reported as a test gap, so its defect gets fixed but not re-audited.
- **Chained, not separate.** `--chained` exists precisely so a caller can run a build inside its own run and keep the one banner. `/verify-build` already uses it the same way.
- **The cap counts re-audits after defects, not audits.** That's one first audit plus at most two re-audits: three audit runs per feature at most, counted since the feature was last closed.
- **Requirement-list reuse only when the TRD is unchanged.** Detecting what a changed TRD added would need an agent to read it; when the hash differs, the Index stage simply runs again.
- **A stale wake is recognised where it lands.** The platform can fire a wake twice; the command can recognise a run id or commit it has already audited.

absorbed:     `--chained` gains `/audit-build` as a caller [BLOCKS] — without it, closing after the fix
              run would print a second banner in the same run
absorbed:     `audit-build.md` records hand-offs as discoveries [BLOCKS] — without it, the fix task
              never carries O4's instruction and reconcile has nothing to promote
not absorbed: first-round sampling — the first audit's coverage is a separate question
not absorbed: `/verify-build`'s own loop — it already caps its iterations

## Non-Goals

- No change to the VERDICT forms, or to what a first audit checks beyond the `action` split.
- No change to `/verify-build`'s loop or its cap.
- No automatic merge; the PR step is unchanged.
- No change to `async-discipline.md` or `autonomy.md`; together they are 5 bytes under their ceiling.

## Verification Artifacts

None apply — no UI designs, interaction diagrams or data views; the surfaces are a lib, a workflow, and command prompts.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | When the cap is reached with defect fixes not yet re-audited, should the feature close with a caveat, or stay open for you? | **Answered by the owner, 2026-10-01: stay open.** "We don't close with a caveat if there are true defects open." See AMEND-001 | answered |
| OQ-2 | Under `--chained` the fix run skips functional verification. Is that acceptable for audit-chained fixes? | Yes: a re-audit checks defect fixes, and test-gap fixes are themselves tests | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Create `packages/core/lib/audit-rounds.js` as in Intended Change: `classify`, `record(stateDir, round)` with its own small append-only writer, `readRounds(stateDir)` (rounds since the last `closed.json`), `decide`, `staleWake`, and a CLI (`decide`, `classify`, `stale-wake`, `record`). Mirror to `.claude/lib/` and symlink `packages/full/lib/audit-rounds.js`. Jest tests:<br>• `classify` for every `action` value, including a consistency `mismatch` → `other`;<br>• `decide`: no findings; test gaps only in rounds 1, 2 and 3; defects in rounds 1, 2 and 3 (cap); uncovered items stop and never chain; "do not proceed" with nothing chainable stays open; report-only adds no line;<br>• a reopened feature restarts the count;<br>• `staleWake` by run id, by unchanged commit, and false otherwise;<br>• the one-active-trip sequence (defect, defect, test gaps) closes after round 3 | O1, O2, O5 | None | <ul><li>The tests pass.</li><li>A test fails if test gaps alone ever return `reaudit: true`.</li><li>A test fails if a third re-audit is allowed.</li><li>A test fails if an uncovered item is ever chained.</li><li>The mirror is identical and the symlink resolves.</li></ul> |
| FIX-002 | `packages/core/workflows/audit-build.js`:<br>• split `action`'s `gap` into `gap-unbuilt` and `gap-untested`, make `action` required, and update the traceability prompt (`:309-314`) to say which to use;<br>• the reconcile stage returns `handoff: [{ id, action, check, summary, evidence, covered }]` (no class; the lib derives it);<br>• both the clean-path return (`:441-465`) and the normal return (`:581-592`) carry `handoff` and `index`;<br>• accept `args.previous { reportPath, auditedCommit, index, trdHash }` and `args.trdHash`: when they match, skip the Index stage and use `previous.index`; when `previous` is set, tell every verifier to check files changed since `auditedCommit` and the previous report's open items first, and drop the test-quality "representative sample" wording.<br>Mirror to `.claude/workflows/`. Extend `audit-build.test.js` | O2, O3 | None | <ul><li>A test asserts the schema's `action` enum has `gap-unbuilt` and `gap-untested` and no bare `gap`.</li><li>A test asserts that with a matching `previous.trdHash` no Index-stage agent is dispatched, and with a different hash one is; each fails if the reuse logic is removed.</li><li>A test asserts the verifier prompts name the changed-files scope only when `previous` is set.</li><li>A test asserts both return paths carry `handoff` and `index`.</li><li>`npx jest packages/core/workflows` passes.</li></ul> |
| FIX-003 | `packages/core/commands/audit-build.md`:<br>• after the workflow returns, classify each `handoff` item with `audit-rounds.js classify`, count defects, test gaps and uncovered items, record the round, and call `decide`;<br>• record each item `decide` hands off as a discovery (`foundBy: 'audit-build'`, `blocksFeature: true`), then chain `/implement-trd <trd> --reconcile --chained`; when `close` is true, write the close record after the chained run returns, commit it with the report, open the PR, and print the single banner, adding anything the fix run did not finish as a caveat;<br>• on a re-audit, pass `previous` (from the ledger and `audit-index.json`) and the TRD's hash;<br>• every fallback wake-up carries the run id, and every re-entry first runs `stale-wake`;<br>• the readout names the round and why it closes or re-audits, and NEXT names `/audit-build` only when `reaudit` is true;<br>• replace the close rule at `:221-232` and the chain step at `:130-133` with this.<br>In `packages/core/commands/implement-trd.md` §3.7, add `/audit-build` as a caller of `--chained`. Mirror both. Add command-surface assertions | O1, O2, O5 | FIX-001, FIX-002 | <ul><li>New assertions in `verify-command-surface.test.js` require that `audit-build.md` names `audit-rounds.js decide`, `stale-wake` and `--reconcile --chained`, no longer requires "nothing is chained" to close, and that `implement-trd.md` §3.7 names `/audit-build` as a caller. Each fails against today's files.</li><li>The mirrors are identical.</li></ul> |
| FIX-004 | Class, not instance: in `packages/core/lib/discovered.js` `promoteToTrd` (`:308-312`), rows promoted from `foundBy: 'audit-build'` discoveries add to their description: find and fix every instance of this weakness across the feature's touched files, and list each one fixed. Say the same in `packages/core/commands/implement-trd.md` §2.1a. Mirror both | O4 | None | <ul><li>A `discovered.test.js` case shows an audit-found row carries the instruction and a non-audit row does not; it fails without the change.</li><li>A command-surface assertion requires §2.1a to name it; it fails against today's file.</li></ul> |
| FIX-005 | Docs: in `docs/reference/other-commands.md` (`/audit-build`) and `docs/reference/implement-trd.md`, describe the round cap, the defect vs test-gap split, re-audits building on the previous round, chaining with `--chained`, and the stale-wake rule | O1, O2, O3, O5 | FIX-003 | <ul><li>`grep -c "audit-rounds"` is at least 1 in each doc; it is 0 today.</li></ul> |
| AMEND-001 | `packages/core/lib/audit-rounds.js` per Owner rulings 1–2:<br>• at the cap, `decide()` returns `chain: true, close: false, reaudit: false, capReached: true` when defects are present, and the caveat text is removed;<br>• `classify()` returns `test-gap` for any finding whose `check` is `test-quality`, whatever its `action`;<br>• `staleWake()` matches by run id only, dropping the same-commit rule (review finding: it could silence an audit still in progress at the same commit).<br>Update `audit-rounds.test.js`: at the cap with defects the feature stays open; a test-quality `mismatch` is a test gap; the same commit with a new run id is not stale. Mirror to `.claude/lib/` | O1, O2, O5 | FIX-001 | <ul><li>A test fails if `decide()` ever returns `close: true` with defects > 0.</li><li>A test fails if a test-quality finding is ever classed as a defect.</li><li>A test fails if a new run id at an unchanged commit reads as stale.</li><li>Mirror identical.</li><li>`npx jest packages/core/lib/audit-rounds.test.js` passes.</li></ul> |
| AMEND-002 | `packages/core/workflows/audit-build.js` per Owner rulings 2–3:<br>• the test-quality verifier is told that a weak or missing test matters only if it masks a defect; when it does, it reports the defect itself (`action` `mismatch` or `gap-unbuilt`, with the masked behaviour as evidence) under the `verification` or `traceability` check; otherwise it reports the test under `test-quality`;<br>• when `previous` is set, every verifier is limited to (a) whether each defect in the previous report is fixed and (b) the files changed since `previous.auditedCommit`; anything outside that scope goes in a separate `outOfScope` list in its return, never in `findings`; the test-quality sample is not taken on a re-audit;<br>• the requirement-list reuse hash covers only the TRD's Objectives and Master Task List sections, so promoted rows and a rewritten Could Not Verify section don't defeat it (review finding).<br>Mirror to `.claude/workflows/`. Extend `audit-build.test.js` | O2, O3 | FIX-002 | <ul><li>A test asserts that with `previous` set, the verifier prompts name the previous-defects-plus-diff scope and the `outOfScope` rule; it fails if removed.</li><li>A test asserts that the test-quality prompt names the masks-a-defect rule; it fails if removed.</li><li>A test asserts that changing only the Could Not Verify section leaves the reuse hash unchanged.</li><li>Mirror identical.</li></ul> |
| AMEND-003 | `packages/core/commands/audit-build.md` and the reference docs per Owner rulings 1 and 3: when `capReached`, the readout says the feature stays open with the defects named, and NEXT is the owner's call (`/close-feature` once satisfied), never `/audit-build`; on a re-audit, the workflow's `outOfScope` items are recorded as non-blocking discoveries (`blocksFeature: false`) and listed, never chained. Update `docs/reference/other-commands.md` and `docs/reference/implement-trd.md` to match. Mirror the command. Add command-surface assertions | O1, O3 | AMEND-001, AMEND-002 | <ul><li>New `verify-command-surface.test.js` assertions require `audit-build.md` to say a capped feature stays open, and to record `outOfScope` items as non-blocking; each fails against the current file.</li><li>Mirror identical.</li></ul> |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/audit-rounds.js`, `packages/core/lib/audit-rounds.test.js`, `.claude/lib/audit-rounds.js`, `packages/full/lib/audit-rounds.js`
- **Reuse:**
  - `fix-plan.js`'s pure decide-then-execute shape and its test style [read]
  - `closed.json`'s `closedAt`, to find where the current rounds start [read]
- **Replaces:** nothing
- **Follow:**
  - `packages/full/lib/*.js` are relative symlinks into `packages/core/lib` [ran]
  - `.claude/lib/*.js` are byte-identical copies [ran]
- **Careful:**
  - The ledger is append-only, and its lines are small. The requirement list goes to `audit-index.json`, never into the ledger: `discovered.js`'s writer drops lines over 4096 bytes (`:38-40`) [read]

### FIX-002
- **Touches:** `packages/core/workflows/audit-build.js`, `packages/core/workflows/audit-build.test.js`, `.claude/workflows/audit-build.js`
- **Reuse:**
  - `FINDING_ITEMS` at `audit-build.js:108-121` [read]
  - the traceability prompt at `:309-314` [read]
  - the Index stage at `:207-264` [read]
  - the clean path at `:441-465` [read]
  - the reconcile stage and return at `:565-592` [read]
- **Replaces:**
  - the bare `gap` action;
  - the test-quality "representative sample" wording (`:170`), which now applies only to first audits [read]
- **Follow:** workflow scripts open no files and have no clock; everything arrives in `args` [read]
- **Careful:** `audit-build.test.js` stubs agents (`:52-58`), so test the dispatch decisions and the schema, not a stubbed agent's output [read]

### FIX-003
- **Touches:** `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:**
  - "But it DOES close the loop" (`:112-146`), the close rule (`:221-232`), and the commit, publish and PR steps [read]
  - `implement-trd.md` §3.7's `--chained` contract [read]
- **Replaces:**
  - the chain step (`:130-133`), which runs the fix as a separate command;
  - the close condition "nothing is chained…" (`:225`) [read]
- **Follow:**
  - one banner per run; under `--chained` the fix run ends with a RETURN line, and `/audit-build` prints the run's banner [read]
  - NEXT is one command in a fenced block [read]
- **Careful:**
  - `sweep/2026-10-01` also edits `audit-build.md` (`--expect-branch`). Build after that sweep is merged [read]
  - Do not touch `autonomy.md` or `async-discipline.md` (5 bytes under the ceiling) [ran]

### FIX-004
- **Touches:** `packages/core/lib/discovered.js`, `packages/core/lib/discovered.test.js`, `.claude/lib/discovered.js`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`
- **Reuse:** `promoteToTrd`'s row builder at `discovered.js:308-312`, as reworded by the 2026-10-01 sweep [read]
- **Replaces:** nothing
- **Follow:** the sweep's gap-row wording ("<summary> is met"; evidence in the description) [read]
- **Careful:** the same sweep edited `discovered.js`; build after it merges [read]

### FIX-005
- **Touches:** `docs/reference/other-commands.md`, `docs/reference/implement-trd.md`
- **Reuse:** the existing `/audit-build` description [read]
- **Replaces:** nothing
- **Follow:** plain language [read]
- **Careful:** none

### AMEND-001
- **Touches:** `packages/core/lib/audit-rounds.js`, `packages/core/lib/audit-rounds.test.js`, `.claude/lib/audit-rounds.js`
- **Reuse:** `decide`, `classify` and `staleWake` as built and reviewed (commits e705510, 59c428c) [read]
- **Replaces:** the cap's close-with-caveat branch; the same-commit stale rule [read]
- **Follow:** Owner rulings 1–2 [read]
- **Careful:** `stale-wake` reads all rounds, including those before a close (review fix); keep that [read]

### AMEND-002
- **Touches:** `packages/core/workflows/audit-build.js`, `packages/core/workflows/audit-build.test.js`, `.claude/workflows/audit-build.js`
- **Reuse:** the `previous` and `trdHash` arguments and the test-quality verifier prompt as built in FIX-002 [read]
- **Replaces:** the whole-TRD hash for requirement-list reuse; the "check changed files first" wording, which becomes a hard scope on re-audits [read]
- **Follow:** Owner ruling 3; workflow scripts open no files, so the command computes the section hash and passes it in [read]
- **Careful:** a first audit (no `previous`) keeps today's sampling and scope [read]

### AMEND-003
- **Touches:** `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`, `packages/core/commands/verify-command-surface.test.js`, `docs/reference/other-commands.md`, `docs/reference/implement-trd.md`
- **Reuse:** the decide-driven readout and NEXT from FIX-003 and its review fixes [read]
- **Replaces:** any text saying a capped feature closes with a caveat [read]
- **Follow:** NEXT is one command in a fenced block; the owner's call at the cap is `/close-feature` once satisfied [read]
- **Careful:** never edit `autonomy.md` or `async-discipline.md` (5 bytes under their ceiling); the command must compute the Objectives + Master Task List hash for AMEND-002 [read]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| A real feature converges in at most three audits | Needs a live run on a real feature; the tests prove the decision table and the one-active-trip sequence, not an audit's behaviour |
| Verifiers choose `gap-unbuilt` versus `gap-untested` correctly | Model judgement; the prompt asks for it, the tests check only the schema |
| A weak test that hides a real defect is reported as that defect (Owner ruling 2) | Model judgement: the test-quality verifier is told to report the masked defect; the tests check only that the prompt says so |
