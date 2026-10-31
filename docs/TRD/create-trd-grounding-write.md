# TRD: create-trd-grounding-write

**Source PRD**: None — defect, GitHub FortiumPartners/ensemble-vnext#49; fix decided in session 2026-10-30

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | After a `create-trd` run, every grounding block that reached disk is in the TRD's `## 9. Task Grounding` section, put there by deterministic code — no agent is trusted to paste blocks into the TRD | #49 "Expected"; your instruction, 2026-10-30 | yes |
| O2 | The readout's grounded count and its list of ungrounded tasks come from parsing the TRD on disk immediately before the readout, never from agents' return values | #49 "Expected"; your instruction, 2026-10-30 | yes |
| O3 | A task no grounding agent returned a block for gets one targeted re-ground; a task still missing after that is named as ungrounded in the readout and the run completes — it does not stop as stuck, even when every grounding agent died | your instruction, 2026-10-30 | |
| O4 | The `## Deferred by design` table is written by the same deterministic code, and a missing deferred list is reported as missing, never read as "nothing deferred" | your instruction, 2026-10-30; adversarial review | |
| O5 | The merge agent only reports contradictions between blocks; it writes nothing | your instruction, 2026-10-30 | |

## Reproduction

### Steps

`[ran]` with the workflow's own test harness (`packages/core/workflows/test-harness.js`). The
fixture has 8 tasks, so grounding fans out to 2 agents. The merge agent is stubbed to return
`{ findings: [] }` and write nothing, which is the shape of the Forge
`feature-control-account-policy` run in #49. Script:
`/private/tmp/claude-501/-Users-james-dev-fortium-ensemble-vnext/bd5166ee-639a-4c69-8f11-9a9db3014a86/scratchpad/repro49.js`.

### Actual

```
merge schema requires: ["findings"]
grounded_tasks reported: 8 / 8
readout line: grounded 8 tasks; 0 things named for deletion
```

The TRD received no section, and the run still reported every task grounded.

### Expected

Either the section is on disk with all 8 blocks, or the readout names the tasks that have none.

### Root cause `[ran]`

Two things together, both in `packages/core/workflows/create-trd.js`:

1. **The write is delegated to a model that has no way to report it.** In the fan-out path the
   `ground:merge` agent is told to "Write the section with Write/Edit" (`create-trd.js:790-818`),
   but its schema requires only `findings` (`:814`). A merge that writes nothing looks the same as
   one that worked. The only guard (`:820`) fires when it returns nothing at all.
2. **The readout counts what agents claimed.** `grounded.grounded_task_ids` is the union of the
   ground agents' returns (`:781-786`) and is printed as `grounded N tasks` (`:925`). Nothing reads
   the file.

The workflow cannot check the file itself, because workflow scripts have no filesystem access
(confirmed in the workflow-authoring reference). So the fix moves the TRD write into deterministic
code that the calling command runs, and the readout counts from that code's parse of the file.

The same pattern sits at `:831-846`. There `defer:write` asks an agent to paste a table the
script already built, and trusts the agent's own `written: true`.

## Decision

**Agents produce blocks; code writes the TRD.**

- Each grounding agent writes its blocks to its **own** scratch file, so no two writers share a
  file; avoiding a shared file is why the merge agent existed. The files go in
  `.trd-state/<feature>/findings/grounding/<run-stamp>/`, which is gitignored by
  `.gitignore:72`'s `.trd-state/*/findings/` rule. The caller stamps the path and passes it in as
  `args.grounding_dir`, so a previous run's blocks are never assembled into this one.
- After the workflow returns, the command runs `node .claude/lib/trd-grounding.js assemble`. The
  helper builds the TRD's `## 9. Task Grounding` section from those files and writes the
  `## Deferred by design` table from `sizing.json`. It then parses the TRD back and prints
  grounded, ungrounded and unknown task ids plus the deferred status. It is idempotent.
- Before the readout, the command runs `trd-grounding.js report` (a parse only, no write) and
  takes its figures from that. On `/plan`'s medium path the code-reviewer pass and `audit-trd`
  still rewrite sections after `assemble`, so a count taken at `assemble` time could be stale.
- **What is still an agent write, and why that is acceptable.** Getting blocks onto disk at all
  still takes an agent write: each grounding agent writes its own file. That is the agent's main
  output, written the same way it already writes `findings/grounding.json`. What changes is that
  a missing file is now visible. The task appears in the `ungrounded` list instead of being
  counted as grounded. The TRD itself is never edited by an agent at this stage.
- The merge agent stays, used only when grounding fans out, and is read-only: it compares the
  returned blocks and reports contradictions. The TRD is built from the files, so the merge
  agent judges the returned copies. Both copies come from the same agent in the same turn.
- **Re-ground once, inside the workflow**, covering tasks missing from every agent's
  `grounded_task_ids` and `greenfield_task_ids`. If every grounding agent died, the retry covers
  every task, instead of the current `required(null, 'Ground')` throw (`:776`). The workflow sees
  only what agents returned, not the files. An agent that returned blocks but wrote no file
  therefore shows up in the helper's `ungrounded` list.
- **The retry agent returns its findings and does not write `findings/grounding.json`.** The
  first agent already wrote that file, and `/audit-trd` reads it (`audit-trd.js:50`). A second
  writer would overwrite it. The retry's findings still reach the readout through the
  workflow's return value.
- **Deferred list: the schema-checked return stays the record of truth.** The sizing agent also
  writes its result to `sizing.json` for the helper. The helper reports `sizing: "missing"` when
  the file is absent, and never reads absence as "nothing deferred". The command compares the
  helper's deferred ids with the workflow's returned `deferred` ids, which are short task ids
  only, and reports any difference in ISSUES.
- **Ungrounded is reported, not fatal.** `/implement-trd` does not change. Hand-written TRDs
  legitimately have no grounding, so refusing to build them would be a new failure mode.
- `args.grounding_dir` is optional in the workflow, so a caller that invokes it directly does
  not break. That matters for Forge, where #49 came from. When the arg is absent, the default is
  `.trd-state/<feature>/findings/grounding/default/`, with a `log()` warning that blocks left
  there by an earlier run could be picked up. Both commands in this repo always pass a stamped
  path.

Rejected: having the helper read the workflow's `journal.jsonl`, which is where #49's blocks were
recovered by hand. Its format is internal to the platform and unversioned, so a lib that parses it
breaks silently on the next platform change.

absorbed:     none — every task is the fix itself; the review's findings changed how the three tasks are written, not how many there are
not absorbed: fanned-out grounding agents all write the same `.trd-state/<feature>/findings/grounding.json` (`create-trd.js:595`) — a pre-existing lost update; the grounding write works without fixing it
not absorbed: #46, audit gaps promoted into `Deferred by design` with empty descriptions — `discovered.promoteToTrd` appends to the last `| Task ID |` table; this fix keeps the Deferred table's placement, so it neither causes nor fixes #46
not absorbed: `create-trd.md:918-921` still says grounding runs "sequentially and alone", which has been stale since the 2026-09-21 fan-out — documentation drift, unrelated to the write

## Non-Goals

- No change to how grounding is *decided*. The ground prompt's content rules, chunk size and
  agent type stay as they are; only where blocks are written changes.
- No change to `/implement-trd`, `/audit-trd`, or `trd-parser.js`'s behaviour on an ungrounded
  TRD.
- No new STUCK path in `/create-trd` or `/plan`. The only hard error is the helper failing to
  write the TRD (disk or permissions), which is reported as an ordinary error.

## Verification Artifacts

None apply — the change is a lib, a workflow and two command prompts. The Jest suites, the BATS
scaffold-delivery test and greps of the command files cover it, and no page, report or image is
produced.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should ungrounded tasks also be recorded in the TRD itself (e.g. a line in `## Could Not Verify`), not only in the readout? | Readout only. `trd-parser.js:845-851` already warns about each ungrounded task when `/implement-trd` parses the TRD, so the fact resurfaces where it matters. | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | New deterministic helper `packages/core/lib/trd-grounding.js` (+ `.test.js`) with two CLI modes. `assemble --trd <path> --dir <grounding_dir>`: build the Task Grounding section from the `blocks-*.md` files, write the Deferred-by-design table from `sizing.json`, parse back, print JSON. `report --trd <path>`: parse only, print the same JSON. Deliver it: `packages/full/lib/` symlink, `.claude/lib/` copy, and add it to the scaffold-delivery test's module list. | O1, O2, O4 | None | (1) A TRD with no grounding section plus two block files gives a TRD whose `parseTrd().grounding` has every block's task id, each with its `touches`. (2) A TRD carrying an unnumbered `## Task Grounding` section with an old block for `F-B001`, plus new block files, gives exactly one heading containing "Task Grounding", the old block's text gone and the new one present. (3) A task in the Master Task List with no block is listed in `ungrounded`, exit 0. (4) A block for a task id not in the Master Task List is dropped and listed in `unknown`. (5) `sizing.json` with 2 deferred items gives a `parseTrd().deferred` with both ids and reasons. `sizing.json` with none writes no Deferred section and reports `sizing: "ok"`. No `sizing.json` reports `sizing: "missing"`. (6) Running `assemble` twice gives a byte-identical TRD. (7) A `--dir` with no block files leaves the TRD unchanged and reports `blocksFound: 0`. (8) A TRD that quotes `## 9. Task Grounding` inside a code fence leaves the fenced text untouched. (9) `report` on a TRD that `assemble` wrote returns the same grounded/ungrounded lists as `assemble`. (10) `scaffold-delivery.test.sh`'s module list includes `trd-grounding`, and the test passes. |
| FIX-002 | Change `packages/core/workflows/create-trd.js` (+ `create-trd.test.js`). Accept optional `args.grounding_dir`, defaulting with a warning. Every grounding agent writes its blocks to its own file there, including the single-agent path, and no agent edits the TRD. The sizing agent also writes `sizing.json` there. One `ground:retry` agent covers task ids no agent returned, or every task if all agents died, writing `blocks-retry.md` and no findings file. The merge agent becomes read-only. Remove `defer:write`. Rename the return field `grounded_tasks` to `grounded_claimed`, and take the agent-claimed count out of the readout. Mirror to `.claude/workflows/`. | O1, O3, O4, O5 | FIX-001 | (1) Every `ground:brownfield*` and `ground:retry` prompt names a distinct file under `grounding_dir`, and none says `Write/Edit` against the TRD path. (2) Ground stubs returning ids for all but `F-B002` give exactly one `ground:retry` call whose prompt grounds only `F-B002` and does not mention `findings/grounding.json`. When all ids are returned there is no retry call. (3) When every `ground:brownfield*` stub returns null, the workflow does not throw, and one `ground:retry` call covers every task id. (4) The `ground:merge` prompt contains neither `Write/Edit` nor the TRD path as a write target. (5) With the `SIZE_TOO_BIG` fixture (which has deferred items) no call is labelled `defer:write`, and the `size` prompt names `sizing.json` under `grounding_dir`. (6) The `readout` string contains no `grounded <n> tasks` figure. (7) Without `grounding_dir`, the workflow logs the default-path warning and still runs. |
| FIX-003 | Update `packages/core/commands/create-trd.md` (workflow path AND fallback path) and `packages/core/commands/plan.md` (medium path). Pass `grounding_dir: ".trd-state/<feature>/findings/grounding/<UTC stamp>"`, run `trd-grounding.js assemble` right after `Workflow(create-trd)` returns, and run `trd-grounding.js report` just before the readout, taking the grounded count, the ungrounded list and the deferred check from it. Rewrite the Ground-stage descriptions that say a merge step assembles Section 10. Mirror to `.claude/commands/`. | O1, O2, O3, O4 | FIX-001, FIX-002 | (1) Both files contain `trd-grounding.js assemble` after their `Workflow({ name: "create-trd"` block, and `trd-grounding.js report` before their readout section. (2) Both pass `grounding_dir` under `findings/grounding/`. (3) `create-trd.md`'s fallback path names the same `assemble` step. (4) `create-trd.md`'s readout instructions name `report`'s `ungrounded` list and `sizing` status as their source, and say a non-empty list is reported, not STUCK. (5) `grep -n "merge agent assembles\|ONE merge agent\|assembles one Section 10\|a merge step assembles"` over both files returns nothing. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/trd-grounding.js`, `packages/core/lib/trd-grounding.test.js`, `packages/full/lib/trd-grounding.js`, `.claude/lib/trd-grounding.js`, `test/integration/tests/scaffold-delivery.test.sh`
- **Reuse:** `parseTrd()` from `packages/core/lib/trd-parser.js` for the parse-back; its `grounding` object and `deferred` array are what the report needs [read]. `findSection`, `maskFencedLines` and `headingContains` are already exported (`trd-parser.js:897-905`). Mask fenced lines before locating sections, as `parseTrd` does at `:833,843` [read]
- **Follow:** the CLI-plus-pure-function shape of `packages/core/lib/spec-scope.js`, whose `render-objectives` rewrites one TRD section in place and is called from `plan.md` [read]. Heading `## 9. Task Grounding` and blocks `### <TASK-ID>` with bold field labels, per `packages/core/contracts/trd-authoring.md` "Section 10: Task Grounding" [read]. The Deferred table is `| Task ID | Why it cannot run now |`, placed immediately after the Master Task List as `create-trd.js:832-840` writes it today; the parser reads it with `strategy: 'last'` (`trd-parser.js:701`) [read]. The `packages/full/lib/*.js -> ../../core/lib/*.js` per-file symlink convention [ran: `ls -la packages/full/lib`]
- **Careful:** Insertion point when no grounding section exists: before the first of `## Open Questions` / `## Could Not Verify` / `## Appendices` that comes after the Master Task List, else end of document. Phased TRDs put grounding before Open Questions (`docs/TRD/functional-verification.md`) [read by reviewer]. Delivery: `scaffold-project.sh` `copy_libs` reads `$PLUGIN_DIR/lib` and adds new files on refresh (`scaffold-project.sh:403-421`), so the `packages/full/lib` symlink is what ships it. `scaffold-delivery.test.sh:82-85` records this same gap once before, for `plan-weight` [ran]. The Deferred table's `| Task ID |` header is what `discovered.promoteToTrd` appends to (#46), so keep its placement unchanged

### FIX-002
- **Touches:** `packages/core/workflows/create-trd.js`, `packages/core/workflows/create-trd.test.js`, `.claude/workflows/create-trd.js`
- **Replaces:** the `defer:write` agent (`create-trd.js:831-846`) — delete it and its tests near `create-trd.test.js:381-395` [read]. The single-agent "Emit them as a `## Task Grounding` section into the TRD (Write/Edit)" branch of `groundPrompt` (`:537-538`) [read]. The merge prompt's "Write the section with Write/Edit … Copy them." paragraph (`:794-796`) and its "may be unwritten" warning (`:820`) [read]. The `if (!liveGround.length) required(null, 'Ground')` throw (`:776`), which the all-died retry replaces [read]
- **Reuse:** `groundPrompt(mine)` and `GROUND_OPTS` for the retry agent: same prompt with the missing ids as `mine` and label `ground:retry`. Add a parameter, or a variant, that swaps the findings-file paragraph (`:593-607`) for "return findings only" [read]. Use the `groundingPlan` / `runWith` helpers (`create-trd.test.js:228-258`) and the `SIZE_TOO_BIG` fixture (`:323`) for the new cases [ran: grep]
- **Follow:** the existing "WRITE YOUR FINDINGS TO DISK … `.trd-state/${FEATURE}/findings/grounding.json`" instruction (`:593-607`); the block-file instruction takes the same shape [read]
- **Careful:** `grounded_tasks` is read only by `create-trd.test.js:128` [ran: `grep -rn grounded_tasks packages .claude`]. Rename it there too. The test titled "stays a single writing agent below the fan-out threshold" (`:260`) needs a new name, since nothing writes the TRD now. `baseArgs()` (`:24-31`) is the single place to add `grounding_dir`. `meta` must stay a pure literal. Keep the merge agent conditional on `FANNED_OUT`

### FIX-003
- **Touches:** `packages/core/commands/create-trd.md`, `packages/core/commands/plan.md`, `.claude/commands/create-trd.md`, `.claude/commands/plan.md`
- **Reuse:** the existing "Wave profile — run this before the readout" block in `create-trd.md` (~line 1000), which already parses the TRD after the workflow returns. Put `assemble` before it and `report` just before the readout [read]
- **Follow:** `plan.md`'s `node .claude/lib/spec-scope.js render-objectives …` style for calling a lib CLI from a command [read]
- **Careful:** On `plan.md`'s medium path, Step 6 (the code-reviewer pass) and `audit-trd` rewrite sections after `assemble` (`plan.md` §5b, "rewrite whole sections"), so `report` must run at the readout, not at `assemble` [read by reviewer]. The `create-trd.md` fallback path ("run the stages below directly", ~`:835-838`) needs the same `assemble` step [read by reviewer]. Rewrite the merge-assembles wording at `create-trd.md:866-867` and `:886-895` [read]

## Could Not Verify

- A live `/create-trd` run on a TRD large enough to fan out has not been done. The reproduction
  uses the workflow harness with stubbed agents, which proves the wiring but not that real agents
  follow the "write your own file" instruction. An agent that returns blocks but writes no file is
  caught by the helper's `ungrounded` list (O3), not prevented.
- Forge, or any other caller of `Workflow(create-trd)` outside this repo, has not been checked.
  Making `grounding_dir` optional with a default is what keeps such a caller working. Its stale-run
  risk is logged, not prevented.
