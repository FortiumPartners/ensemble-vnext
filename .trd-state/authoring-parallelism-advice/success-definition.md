# Functional Success Definition: authoring-parallelism-advice

**Source**: docs/TRD/authoring-parallelism-advice.md §Intended Change (supplied as extracted text only — no plan, no task list, no TRD path contents were read)
**Source kind**: intended-change
**Derived**: 2026-09-22T04:34:02Z
**Criteria**: 6

## How to exercise these criteria

Per the project's own docs (`.claude/rules/stack.md`: no web UI, no HTTP API — this is a
Claude Code plugin; JS lives in `packages/core/lib/`), the applicable stack-hint row is
**CLI**: invoke as an owner would and assert on stdout.

The readout under test is the wave-profile block a `/create-trd` run prints. The block is
rendered by `renderWaveProfile()` in `packages/core/lib/task-graph.js`, which an owner can
invoke directly over any committed TRD in `docs/TRD/`. Every criterion below is therefore
proved by **captured command output over a real committed TRD**, not by a screenshot and not
by a unit test asserting on a fixture the same change authored.

Reference invocation (the exerciser adapts the parser's return shape as needed; the
`Evidence` column is a target, not a contract):

```bash
cd /Users/james/dev/fortium/ensemble-vnext
node -e '
  const fs = require("fs");
  const { parseTrd } = require("./packages/core/lib/trd-parser.js");
  const tg = require("./packages/core/lib/task-graph.js");
  const parsed = parseTrd(fs.readFileSync(process.argv[1], "utf8"));
  const graph = tg.buildGraph(parsed.tasks, parsed.grounding);
  console.log(tg.renderWaveProfile(graph).join("\n"));
' docs/TRD/authoring-parallelism-advice.md | tee <artifact>
```

`docs/TRD/authoring-parallelism-advice.md` is the plan the source quotes its own numbers
from (`avg 1.71 wide`, the `AJCS-P001 → … → D001` chain), so it is the one TRD where the
expected output is stated in the source rather than inferred. A second committed TRD with a
different edge mix — e.g. `docs/TRD/ensemble-vnext.md` or `docs/TRD/testing-phase.md` — is
used to show the dominance call tracks the graph rather than being hard-coded.

Each artifact must be newer than HEAD's commit time (currently 2026-09-21T21:31:50-07:00) to
count as evidence of what the current code does.

## Criteria

| ID | Functional statement | Cites | Evidence that would prove it | Derivation |
|----|----------------------|-------|------------------------------|------------|
| FS-1 | On a plan whose average wave width is under 2, the readout states **which edge kind dominates** the graph — declared dependencies vs file conflicts — rather than leaving the reader to guess. On `authoring-parallelism-advice` that statement is consistent with the source's own count of 13 declared-dependency edges to 1 file-conflict edge. | §Intended Change, After: *"The same readout names which edge kind dominates"*; Before: *"13 of 14 graph edges are declared dependencies and 1 is a file conflict"* | Captured stdout of the reference invocation over `docs/TRD/authoring-parallelism-advice.md`, containing a line that names the dominant edge kind with its counts | [read] |
| FS-2 | The readout no longer presents shared files as the explanation for a low average width when file conflicts are **not** what set the depth. On `authoring-parallelism-advice` the bare `these files serialize the most tasks:` diagnostic — which today names one file touched by two tasks — is either absent or subordinated to the dominant edge kind. | §Intended Change: *"whenever that average is under 2, blames shared files"*; *"the diagnostic points away from the cause"*; *"the diagnostic is corrected to point at the real cause"* | The same captured stdout as FS-1: the file-serialization diagnostic does not stand as the run's explanation of the depth. Contrast run over a second committed TRD whose graph IS file-conflict dominated, where a file-based diagnostic is the correct output — showing the change corrected the attribution rather than deleting the diagnostic | [read] |
| FS-3 | The readout **prints the chain that sets the depth** — the longest dependency path through the plan. Over `authoring-parallelism-advice` the printed chain is `AJCS-P001 → B001 → B002 → T001 → B005 → B006 → D001`. | §Intended Change, Before: *"The chain that actually sets the depth — `AJCS-P001 → B001 → B002 → T001 → B005 → B006 → D001` — is computed on every run and printed nowhere"*; After: *"prints that chain"* | The same captured stdout as FS-1, containing that seven-task chain. The source states the exact expected value, so this is a literal string check rather than a judgment | [read] |
| FS-4 | The readout **lists the declared dependencies that grounding could not justify**, and for each one says whether it lies on the depth-setting chain. | §Intended Change, After: *"lists the declared dependencies grounding could not justify with which of them lie on the chain"* | Captured stdout of a `/create-trd` run (grounding runs there, so its justification verdicts are available) showing a list of unjustified declared dependencies, each marked on-chain or off-chain. If grounding justifies every declared dependency on the TRD used, an empty list with that stated reason is the correct output and satisfies this criterion | [read] |
| FS-5 | The readout **lists the tasks sizing expects to run long**, and for each one a **proposed split**. | §Intended Change, After: *"lists the tasks sizing expects to run long with a proposed split"* | Captured stdout of the same `/create-trd` run showing each long-running task named with a concrete proposed split. An empty list is correct output only if sizing expects no task to run long, and must say so | [read] |
| FS-6 | The two judgments are **advisory**: the TRD is still written, the run does not rewrite the plan it just advised on, and it asks the owner no question. | §Intended Change, After: *"All advisory: the TRD is still written, nothing is rewritten, no question is asked"* | Three checks on one `/create-trd` run: (a) `docs/TRD/<feature>.md` exists and is non-empty after the run; (b) the TRD's task table and dependency column are byte-identical before and after the advisory output is produced — `md5` of the file taken either side of the reference invocation is unchanged, and the run's own diff shows one authoring write rather than a post-hoc edit of the task table; (c) the captured run output contains no `AskUserQuestion` call and ends on a `COMMAND COMPLETE` banner | [read] |

## What was considered and deliberately not turned into a criterion

- *"Two advisory judgments are added to stages that already run"* — this states **where the
  work is placed** (inside grounding and sizing, not in a new pass). That is a structural
  property of the implementation, not an outcome a user could observe in the readout, so no
  criterion asserts it. FS-4 and FS-5 check the two judgments' **output**, which is the part
  the source describes as a visible change.
- The source's `avg 1.71 wide` figure is quoted as today's output for one specific plan, not
  as a target the change should move. No criterion requires the average width to change —
  the source is explicit that nothing is rewritten, so the partition, and therefore the
  average, is expected to be the same afterwards.
- No latency, run-time or coverage figure appears in any criterion. The source states none,
  and inventing one would be a fabricated requirement.
