# TRD: authoring-parallelism-advice

**Source PRD**: None — small change decided in session, 2026-09-21

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A `/create-trd` readout names the declared dependencies that grounding could not justify against the code, and says which of them sit on the chain that sets the plan's depth | your instruction, 2026-09-21 |
| O2 | A `/create-trd` readout names the tasks that will run long enough to dominate their wave, and proposes how to split them | your instruction, 2026-09-21 |
| O3 | The narrow-plan diagnostic attributes narrowness to whichever edge kind actually causes it, and prints the already-computed critical path instead of leaving it on the floor | absorbed blocker, see `## Decision` |

## Intended Change

Today `/create-trd` reports average wave width and, whenever that average is under 2, blames
shared files. Two advisory judgments are added to stages that already run, and the diagnostic
is corrected to point at the real cause.

**Before.** The readout prints `waves: 1,2,3,1,1,2,2 — 12 tasks in 7 wave(s), avg 1.71 wide`
and then `these files serialize the most tasks:` — naming one file touched by two tasks. On
that plan 13 of 14 graph edges are declared dependencies and 1 is a file conflict, so the
diagnostic points away from the cause. The chain that actually sets the depth —
`AJCS-P001 → B001 → B002 → T001 → B005 → B006 → D001` — is computed on every run and printed
nowhere.

**After.** The same readout names which edge kind dominates, prints that chain, lists the
declared dependencies grounding could not justify with which of them lie on the chain, and
lists the tasks sizing expects to run long with a proposed split. All advisory: the TRD is
still written, nothing is rewritten, no question is asked.

## Decision

**Both judgments go in stages that already run, and cost no extra wall time.** The dependency
challenge joins the Ground stage's existing second job — it already judges buildability,
consistency and grounding completeness, and it is the only agent holding both the full task
roster and the code. The long-task judgment joins the sizing agent, which already runs in the
same parallel wave and already reads the roster and the source. Neither adds an agent.

**The dependency challenge travels through the EXISTING `findings` array, as a new `check`
enum member — NOT a new top-level field.** This was corrected by the adversarial pass and the
correction is load-bearing. `check` is a closed enum at `create-trd.js:428` with no member for
this, which is what tempted a separate array; but a separate array reaches none of the
machinery findings depend on. Findings flow `findings` → the four-key merge at
`create-trd.js:757-762` → `.trd-state/<feature>/findings/grounding.json` → `/audit-trd`, and
render through `gfLines`. A new array would have existed only in one return value in one
context window — precisely the loss the "Why both" paragraph was written after 2026-09-20 to
prevent. One enum member buys all of it.

**NO projected-width helper. Print the critical path instead.** This is the adversarial pass's
strongest finding and it refuted the original design with arithmetic. Average width is
`taskCount / waveCount`, so it only moves when a removed edge lies on the longest chain.
Measured on `docs/TRD/autonomy-judge-command-scope.md` [ran]:

```
baseline                          7 waves, avg 1.7143
all 13 dependency edges removed   2 waves, avg 6.0000
critical-path edges removed       5 waves, avg 2.4000
OFF-path edges removed only       7 waves, avg 1.7143   ← unchanged
```

A model-judged projection of a derived ratio would have reported "no improvement" for every
off-path edge it correctly identified as narrative. `buildGraph` already returns
`criticalPath` (`task-graph.js:194`), deterministic and free, and `renderWaveProfile` has
never printed it. The useful output is the chain plus which challenged dependencies sit on it.

**NOT enforcement.** A gate refusing a TRD over wave width would be the same overreach as a
block reason that compels an action, and `create-trd.md` forbids gating on `AskUserQuestion`.

**Absorbed blockers, both coherence defects this change would otherwise create:**
- `task-graph.js:206-208` states *"The cause is rarely declared dependencies"* and explains
  narrowness via shared files. The measurement above refutes it, and the same claim is
  repeated at `task-graph.test.js:409-410`. [BLOCKS] — leaving it puts the refuted
  explanation in the source while the corrected one is in the readout, which is the exact
  two-contradictory-explanations defect O3 exists to remove.
- `implement-trd.md:357` describes `renderWaveProfile`'s output as "one line — how many tasks,
  how many waves, the average width — plus, when the plan is close to serial, the files doing
  the serializing." FIX-002 makes that false. [BLOCKS] — this command prints the profile in its
  first DISPATCHED banner, so its own documentation would misdescribe what the owner sees.

**Not absorbed:** worktree isolation per task, which would remove file-conflict edges
entirely — larger, and the measured data says file edges are the minority on every TRD here.
**Not absorbed:** attributing dispatch-ledger timestamps to task ids, which is what would let
any of this be measured rather than argued — real, needed, not in this fix's path.
**Not absorbed:** reaching the point where the cost is actually paid. The adversarial pass
correctly notes that `/implement-trd`'s banner is the last moment this information is free to
act on, and nothing here changes what that command does with it beyond correcting its
description.

## Non-Goals

- No stage may refuse to produce a TRD, ask the owner a question, or rewrite the author's
  `Dependencies` column.
- No new top-level field on the grounding return. The dependency challenge is a `findings`
  entry or it does not ship.
- No projected-width computation, and no second copy of the wave levelisation. `buildGraph`
  owns levelisation and its determinism rule (D3); nothing here re-implements it.
- No task-duration measurement or estimate in minutes. The long-task judgment reads task
  text, it does not predict timing.
- No change to `/implement-trd`'s dispatch behaviour. Its documentation changes; its
  behaviour does not.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | In `packages/core/workflows/create-trd.js`: add `dependency` to the `check` enum in `FINDING_ITEMS` and `drop-dependency` to its `action` enum; add a DEPENDENCY NECESSITY axis to the Ground stage's second job instructing that a declared dependency is real only if the blocked task consumes something the blocker creates, reported as a finding naming the pair; add a LONG TASKS judgment plus a `long_tasks` array to the sizing schema; render `long_tasks` in the returned readout and expose it on the return object. Copy to `.claude/workflows/create-trd.js`. | O1, O2 | None | A grounding return whose `findings` include two `check: "dependency"` entries renders them through the existing `gfLines` block naming both task pairs, and they appear in `.trd-state/<feature>/findings/grounding.json` — verified by reading the file, not the return. A sizing return with one `long_tasks` entry renders a line naming that task and its split; a return with none renders no heading. Agent count is unchanged: one sizing agent plus the grounding fan-out. |
| FIX-002 | In `packages/core/lib/task-graph.js`: have `waveProfile` report how many edges are declared dependencies versus file conflicts; have `renderWaveProfile` name the dominant kind, print `criticalPath` as a chain, and print the serializing-files list ONLY when file edges are what causes the narrowness. Replace the docstring claim at `:206-208` that declared dependencies are rarely the cause with the measured finding. Copy to `.claude/lib/task-graph.js`. | O1, O3 | None | On `docs/TRD/autonomy-judge-command-scope.md` (13 dependency edges, 1 file edge) the output attributes narrowness to declared dependencies, prints the chain `AJCS-P001 → B001 → B002 → T001 → B005 → B006 → D001`, and does NOT print the serializing-files list. On the existing 3-file-conflict fixture at `task-graph.test.js:424` it still prints that list. Two invariants hold: removing a critical-path dependency edge raises average width (1.7143 → 2.4000), and removing only off-path edges leaves it at 1.7143. No new levelisation function exists in the module. |
| FIX-003 | In `packages/core/commands/create-trd.md`: document the two new readout blocks in the action-named grammar the readout section requires, and say to cross-reference the challenged dependencies against the printed critical path — an off-path one costs nothing to keep. In `packages/core/commands/implement-trd.md`: correct the description at `:357` of what the profile prints. Copy both to their `.claude/` mirrors. | O1, O2, O3 | FIX-002 | The `node -e` snippet in the wave-profile step runs as written against a real TRD and its output includes the critical-path chain. `implement-trd.md`'s description matches `renderWaveProfile`'s actual output field for field, checked by running it. Both `.claude/` mirrors are byte-identical to their `packages/core` sources. |
| FIX-004 | Tests, each shown RED first. In `packages/core/workflows/create-trd.test.js`: the two new enum members, the dependency finding reaching `gfLines`, and `long_tasks` in its three readout states. In `packages/core/lib/task-graph.test.js`: the edge-kind split, the suppression rule in both directions, the critical-path line, and the two width invariants from FIX-002 using the committed TRDs. Correct the comment at `:409-410` repeating the refuted claim. | O1, O2, O3 | FIX-001, FIX-002 | Every new test is demonstrated failing against the pre-change implementation before it passes. Jest total is strictly greater than 1102; pytest stays 107 and BATS stays 648. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/workflows/create-trd.js`, `.claude/workflows/create-trd.js`
- **Reuse:** `FINDING_ITEMS` at `create-trd.js:421-437` — `check` is a 9-member closed enum (`provenance`, `severity`, `omission`, `buildability`, `consistency`, `derivation`, `grounding`, `citation`, `conformance`) and `action` an 8-member one; both take one new member [read]. The Ground stage's second job already lists BUILDABILITY, CONSISTENCY and GROUNDING COMPLETENESS with the `FINDABLE ONLY` rule — the new axis is a fourth bullet there, not a new section [read]. `TASK_ROSTER` at `:477` already renders every task with `[declared after ...]` and is already given to every grounding agent including for tasks it is not grounding [read]. The sizing prompt's `DEFERRED BY DESIGN` and `PROPOSE A SPLIT` blocks are the pattern for a judgment that names ids and proposes an action [read].
- **Replaces:** nothing is made unreachable. Both enums gain members; no existing member, field or readout line dies. Do not delete anything here.
- **Follow:** `deferLines` and `gfLines` at `create-trd.js:859-872` — a conditional empty string, a heading naming the action rather than the classification, indented `id — why` lines [read]. Follow `sizeLines`' guard for an agent that returned nothing [read]. Dependency findings need NO new render block: they arrive inside `findings` and `gfLines` already prints `[${f.check}] ${f.id}: ${f.why}` [read].
- **Careful:** the four-key merge at `create-trd.js:757-762` flatMaps exactly `grounded_task_ids`, `replaces_found`, `greenfield_task_ids` and `findings`. A field outside those four is silently dropped before the readout whatever the schema says — this is why the challenge must be a finding [read]. Schemas are `additionalProperties: false` with explicit `required`, so `long_tasks` must be added to `properties` and left out of `required` to stay optional [read]. The sizing agent MUST NOT WRITE: `create-trd.js:655` states grounding is writing the TRD at that moment and two writers on one file is a lost update raising no error [read]. Grounding is fanned out, so a challenged dependency may point at a task in another agent's subset — judge from the roster plus the code, never from "I could not see it" [read]. The per-file enums already diverge (`audit-trd.js:95`) and the findings file is read as prose at `audit-trd.js:325`, so a new member needs no revalidation downstream [read].

### FIX-002
- **Touches:** `packages/core/lib/task-graph.js`, `.claude/lib/task-graph.js`
- **Reuse:** `graph.edges` already carries `kind` on every edge — `{"dependency":13,"file-conflict":1}` and `{"dependency":27,"file-conflict":12}` measured on two real TRDs [ran]. `buildGraph` already computes and returns `criticalPath` at `:194`/`:196` via `computeCriticalPath(waves, edges)` — it is free, deterministic and currently printed nowhere [read]. `waveProfile` already derives `chains` from `graph.partition` [read].
- **Replaces:** two things, both of which must actually go. The unconditional `if (p.avgWidth < (opts.narrowBelow || 2) && p.chains.length)` branch at `:248` is superseded by the same condition plus a dominant-kind check — remove the old condition, do not add a second branch beside it. The docstring sentence at `:206-208`, *"The cause is rarely declared dependencies"* and the shared-file explanation following it, is refuted and must be rewritten, not left standing beneath a corrected implementation.
- **Follow:** this module is pure — no `fs`, no `process.env` — which the file header names as what makes its coverage bar reachable without fixtures [read]. Keep `renderWaveProfile` returning an array of lines so callers indent themselves [read]. Render the chain with the same `->`/`→` joining style already used for `criticalPath` elsewhere.
- **Careful:** do NOT add a levelisation function. The measurements in `## Decision` were produced by filtering `task.dependencies` and calling `buildGraph` again, four lines, reusing the one levelisation; a second copy would duplicate the `ready.sort()` determinism rule (D3, `:23-28`) that keeps waves identical across runs [ran]. `waveProfile` takes the GRAPH, not `(tasks, graph)` — calling it with two arguments silently returns all zeros, which cost a wrong measurement earlier in this session [ran]. An empty `Touches` contributes zero file-conflict edges and must not be treated as conflicting with everything [read]. The return-shape addition is safe for the existing spread at `implement-trd.md:349`, which spreads `...graph` and never the profile [read].

### FIX-003
- **Touches:** `packages/core/commands/create-trd.md`, `.claude/commands/create-trd.md`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`
- **Reuse:** the wave-profile step at `create-trd.md:918-930` is already a `node -e` snippet that parses the TRD and calls `renderWaveProfile` — it needs NO new argument, because the critical path arrives inside the graph [read]. The readout section's stated rule, "every line names the action, not the classification", governs both new blocks [read].
- **Replaces:** the sentence at `implement-trd.md:357` describing the profile's contents is superseded and must be rewritten, not appended to.
- **Follow:** the file's own reason for computing this in the command rather than the workflow — workflow scripts have no filesystem access and cannot `require` [read]. Keep any new computation inside that one snippet.
- **Careful:** these are prompts, not code; a snippet that does not run as written is a defect discovered at the worst moment, so run it against a real TRD before claiming this done. `implement-trd.md` has a `.claude/` mirror that is currently byte-identical — a stale mirror is live behaviour in this repo, which cost a partially-applied fix earlier today [ran]. Do not widen this task into `/implement-trd`'s dispatch logic; the Non-Goals forbid it.

### FIX-004
- **Touches:** `packages/core/workflows/create-trd.test.js`, `packages/core/lib/task-graph.test.js`
- **Reuse:** `create-trd.test.js`'s existing wiring-harness pattern — tests written against current behaviour, driving the workflow through `test-harness.js`'s `runWorkflow` and asserting on `agent.calls` [read]. `task-graph.test.js` builds fixtures inline and asserts on wave shapes [read]. The existing 3-file-conflict fixture at `:424` is the suppression rule's negative case and already exists [read]. Use the committed real TRDs for the invariant assertions — they are the measured cases and they are in git.
- **Replaces:** the comment at `task-graph.test.js:409-410` repeats the refuted "shared files are the cause" claim and must be corrected with the change it documents.
- **Follow:** `task-graph.test.js`'s inline-fixture style, which needs no files and keeps the module's pure-function coverage reachable [read].
- **Careful:** every new test must be SEEN failing against the pre-change implementation. A test written after the code and never seen red asserts whatever the code does — how this repo shipped a `waveProfile` call with the wrong arity under a green suite [ran]. Run the FULL battery, not these two files: `packages/core/workflows/` alone passed 128/128 today while a vendored mirror was stale [ran]. There is no test mirror under `.claude/lib/`, so no test file needs copying [read].

## Could Not Verify

Rewritten by `/audit-build` on 2026-09-21. Five verifiers of five reported; Jest 1114 passing
(promised >1102), pytest 107, BATS 648 — all as FIX-004 required. Gaps this audit found are
in its readout, not here. What remains below is what the audit deliberately did not or could
not check.

**Not checked — no product requirements document exists.** The header records `Source PRD:
None`, `.trd-state/current.json` carries `"prd": null`, and `docs/PRD/` holds nothing for
this feature. So the audit's validation pass — does the delivered code do what the product
asked for — never ran. Everything below and in the readout is checked against this TRD's own
tasks and objectives only. If the change was wanted for a reason this TRD states wrongly,
nothing here would catch it.

**Not checked — whether either advisory judgment produces advice worth acting on.** Both are
prompt additions evaluated by a model. The audit confirmed the mechanism: the `dependency`
finding reaches the readout through `gfLines`, and `long_tasks` renders in all three states
(one entry, none, agent returned nothing). The quality of the judgment is not testable from a
committed tree and no test asserts it.

**Not checked — that a dependency finding is actually written to disk.** FIX-001's acceptance
criterion asks for the finding to appear in `.trd-state/<feature>/findings/grounding.json`,
"verified by reading the file, not the return". That write is an instruction to the grounding
agent in prompt text (`create-trd.js:595`), not code the suite can exercise, so confirming it
needs a live `/create-trd` run. This audit ran none.

**Not checked — that FIX-004's tests were seen failing before they passed.** The task required
each new test demonstrated RED against the pre-change implementation. That is a fact about the
order work happened in, not about the tree, and it cannot be recovered from the committed
result. The audit substituted the one check it could make — deliberately breaking the
implementation and observing whether the suite noticed — which is how the enum gap in the
readout was found.

**Not checked — what any of this is worth in wall clock.** No `/implement-trd` run has per-task
timing, so "removing narrative dependencies shortens runs" still rests on edge counts and one
skewed duration sample, not a before-and-after. The critical-path chain now printed is
deterministic arithmetic on the graph, not a prediction of minutes.

**Not checked — whether the six off-chain dependency edges on
`docs/TRD/autonomy-judge-command-scope.md` are in fact removable.** They read as story order,
and the committed tests confirm the arithmetic: removing them leaves average width at 1.7143
unchanged. Whether they are genuinely unnecessary is a judgment about that TRD's code, which
FIX-001 delegates to grounding at authoring time. Nobody has made it.

**Partly resolved — whether the advice reaches the point where the cost is paid.**
`implement-trd.md:357` now describes `renderWaveProfile`'s output correctly and its `.claude/`
mirror is byte-identical, both confirmed. What stands unchanged is the substance: this TRD's
own non-goals forbid touching `/implement-trd`'s dispatch behaviour, so the command still
prints the profile and does nothing further with it.
