---
name: implement-trd
description: Execute TRD implementation with staged specialist delegation, dependency-tracked tasks, risk-aware debugging, and quality gates
argument-hint: "[trd-path] [--phase N] [--session <name>] [--resume] [--reset-state] [--verify]"
version: 4.0.0
category: implementation
---

> **Usage:** `/implement-trd [trd-path] [options]` from project root with `docs/TRD/` directory.
>
> **Arguments:**
> - `<trd-path>` - Path to TRD file (optional — derived from the current branch name, or from the single in-progress TRD, if omitted; see Step 1.2)
> - `--phase N` - Execute only phase N
> - `--session <name>` - Execute only named work session
> - `--resume` or `--continue` - Resume from last checkpoint (attempts session resume first)
> - `--reset-state` - Clear state file and start fresh (requires confirmation)
> - `--verify` - Opt in to the functional-verification pass (default off, D11): dispatches a background success-definition derive early (Step 3.6) and, at the tail of the run, an outcome-bearing verification loop. Composes with `--resume` (D13): with both set and a non-terminal `.trd-state/<feature>/verification-state.json` on disk, the run skips the derive pass and the whole phase loop and re-enters the verification loop directly; `--resume` alone keeps its existing meaning (resume the implementation checkpoint) and is unaffected when `--verify` is absent.
>
> **Examples:** `/implement-trd`, `/implement-trd --resume`, `/implement-trd --phase 2`, `/implement-trd docs/TRD/user-auth.md`, `/implement-trd --verify`, `/implement-trd --verify --resume`

---

## User Input

```text
$ARGUMENTS
```

Parse: TRD path, `--phase N`, `--session <name>`, `--resume`/`--continue`, `--reset-state`, `--verify`.

---

## Execution Model

```
PREFLIGHT -> RESUME CHECK -> PARSE TRD + BUILD GRAPH -> PHASE LOOP -> END-OF-RUN HARDENING & REVIEW -> FUNCTIONAL VERIFICATION -> COMPLETE

  --verify (Step 3.6, D5): right after the graph is built, before the phase
  loop, dispatch the success-definition derive pass in the background —
  Agent({subagent_type: "product-manager", run_in_background: true, ...}) — and continue
  straight into the phase loop with no wait. Absent the flag, no derive agent is
  dispatched and no .trd-state/<feature>/success-definition.md appears.

  FUNCTIONAL VERIFICATION (Step 8, D1): one dispatch, not a loop. After Step 7's hardening
  and review, resolve the definition from disk (never wait, never derive inline) and make
  a single Workflow(verify-functional, {...}) call; render its outcome into Step 9's
  banner. Absent the flag, this step is skipped entirely.

Phase Loop (per phase N):
  mark phase N's tasks in_progress (state-write-before-dispatch)
  -> Workflow(implement-phase, {trd, phase: N, tasks, gate, project})
       (per task, inside the workflow: IMPLEMENT -> checks -> [self-debug on fail])
       (phase gate, inside the workflow: verify-app -> phase-scoped /code-review high)
  -> command runs the full deterministic battery (resolved per project) at the phase gate
  -> on failure: retry the WHOLE phase (whole-phase retry, capped) or STUCK
  -> checkpoint + commit + PHASE banner -> next phase (no pause)

--verify --resume composition (§3.7, D13): `--resume` alone keeps its existing
meaning (resume the implementation checkpoint) regardless of `--verify`. When
BOTH are set and `.trd-state/<feature>/verification-state.json` exists with a non-terminal
outcome, the run skips the derive pass and the whole phase loop and re-enters the
verification loop directly at the iteration after the last completed one. `--verify`
with no prior state file starts derivation and the phase loop as usual — the two flags
compose rather than overloading each other.
```

The per-task cycle — `IMPLEMENT -> checks -> [DEBUG on fail]` — happens **inside**
`packages/core/workflows/implement-phase.js`, dispatched once per task with no
separate debugging agent (D8): the implementer runs its own targeted check battery and
self-corrects before returning. This command never spawns a per-task agent directly; it
computes the graph, assembles every prompt the workflow needs, and dispatches one
`Workflow(implement-phase, …)` call per phase.

**Task vs Agent:** this command does not use the platform's `TaskCreate`/`TaskUpdate`/`TaskList`
work-list tools. The task graph — dependency chains, eligibility waves, file-conflict
serialization — is now computed deterministically by `packages/core/lib/task-graph.js`, and
dispatch is a single `Workflow` call per phase rather than a claimed-and-tracked TaskTools
item per stage. `constitution.md` Principle 1's "orchestrator owns the task list" still holds
for the **subagent-nesting** question this command answers by construction: it never lets a
subagent spawn a subagent, because it never spawns per-task subagents itself — the phase
workflow does, and workflow-started agents have no `Agent` tool at all (§1.3 of the TRD).

---

## Step 1: Preflight

### 1.1 Load Constitution

Read `.claude/rules/constitution.md`. Extract quality gates:
- Unit coverage target (default: 80%)
- Integration coverage target (default: 70%)

### 1.2 TRD Selection (branch-derived, D13)

The legacy per-tree active-TRD pointer file under `.trd-state/` is not part of this chain,
and its absence is never an error — `.gitignore` untracks it deliberately; see that file's
comment for why a git-tracked pointer breaks two worktrees off one repo. **Priority order,
stopping at the first hit:**

1. **Explicit path argument** — `$ARGUMENTS` names a TRD path that exists. This step is
   first because it is a user override (AC-F11.2): an explicit argument must win even when
   the branch would resolve to something else.
2. **Branch-derived** — read the current branch (`git branch --show-current`) and parse it
   against the two documented patterns from `.claude/rules/process.md`'s "## Branch Naming"
   (`<issue-id>-<session>`, `feature/<trd-name>/<session>`); match the derived slug against
   `docs/TRD/*.md` filenames and `.trd-state/*/` directory names.
3. **Single in-progress** — exactly one `.trd-state/*/implement.json` exists with
   uncompleted tasks; use its `trd_file`.
4. **STUCK** — emit `═══ COMMAND STUCK ═══` naming the current branch and every candidate
   TRD/state-dir found in steps 2–3. This is a legitimate `AskUserQuestion` case under
   `autonomy.md` case 2 (information that cannot be derived), but STUCK with the candidates
   listed is the cheaper answer and is preferred.

**Validation:** Must contain a "Master Task List" section, parsed by `trd-parser.js` (Step 3) —
see that step's Error Handling for what a missing or unparseable section does.

### 1.3 Git Branch Management

Branch naming: `<issue-id>-<session>` or `feature/<trd-name>/<session>` — the same two
patterns Step 1.2 parses to derive the active TRD, so a branch created here resolves
correctly on the next invocation with no argument.

1. Check `git status` for current branch
2. Switch to feature branch (create if missing)
3. Ensure working directory is clean (suggest `git stash` if dirty)

### 1.3a Write the feature pointer — `.trd-state/current.json`

**Do this once the TRD and branch are both known, before Step 3 builds the graph.**

```json
{ "prd": "<path or null>", "trd": "<resolved TRD path>",
  "status": ".trd-state/<feature>/implement.json", "branch": "<branch>" }
```

Preserve any key you cannot determine rather than nulling it — a `--resume` run that
rediscovers the TRD from the branch must not blank a `prd` a previous run recorded.

**This is not bookkeeping.** Three consumers read this file and each degrades differently
without it:

- `dispatch-ledger.js` resolves the ledger path through it. With a null `trd` it falls back
  to `.trd-state/_dispatch.jsonl` — it still records, so nothing looks broken, but every
  feature's dispatches pile into one undifferentiated file.
- `notify-complete.sh` derives `NOTIFY_FEATURE` from it; a null yields an empty variable in
  the user's webhook payload.
- The SessionStart context banner reads it to answer "what are we working on?" — the whole
  point of the pointer.

Measured 2026-08-16: three real runs produced a populated
`.trd-state/<feature>/implement.json` alongside an all-null `current.json`, and the ledger
duly wrote to the fallback path. The rework dropped this step — the pre-rework command
wrote the pointer during branch management and no task in this TRD carried it forward.
**Silent degradation is what makes it worth an explicit step:** every consumer has a
fallback, so nothing fails loudly and the omission survives a full run looking like success.

### 1.4 Strategy Detection

**Priority:** Explicit argument > TRD declaration > Constitution default > Auto-detect > Default (`tdd`)

| Strategy | Behavior | Auto-detect Keywords |
|----------|----------|---------------------|
| `tdd` | Implementer writes the failing test and the fix in the same task; block on failures | (default) |
| `characterization` | Document AS-IS, failures informational | legacy, brownfield, untested |
| `test-after` | Implement then test | prototype, spike, POC |
| `bug-fix` | Reproduce -> failing test -> fix | bug fix, regression, defect |
| `refactor` | Tests pass before AND after | refactor, optimize, tech debt |
| `flexible` | No enforcement, log only | (explicit only) |

**Note on `tdd` (changed from v3.2.0):** the old model had `verify-app` write RED in a
separate stage before the implementer ran. The per-task cycle is now one agent invocation
(D8) — no separate RED dispatch exists in `implement-phase.js`. For `tdd` strategy, the
per-task prompt (Step 3.5) instructs the implementer to write the failing test and the
minimal fix **within its own task**, not to wait for a prior stage's output. This is a
documented deviation from `task-delegation.md`'s `<strategy_instructions>` text, which still
describes RED as something the implementer "receives" — see this task's deliverables for the
finding.

### 1.5 Concurrent Execution Check

Check for `.trd-state/<trd-name>/implement.lock`:
- If recent (<30 min): Warn user, offer "wait"/"force"/"abort"
- Create lock on start with session_id, timestamp
- Release lock on exit or staleness

### 1.6 Load Non-Goals and Risks

**Non-Goals (TRD Section 8):** Extract as hard boundaries. Agents MUST reject work in non-goal categories.

**Risks (TRD Section 7):** Extract PRD risks, technical risks, implementation risks, contingency plans. Used during self-debug (Step 3.5's check battery instruction) for risk matching.

---

## Step 2: Resume and Recovery

### 2.1 Handle --reset-state

If provided:
1. Display current progress summary
2. Require "confirm" to proceed
3. Delete state file and start fresh

### 2.2 Handle --resume/--continue

These flags have identical behavior:

**1. Load state:**

```bash
node -e '
  const { load } = require("./.claude/lib/implement-state");
  console.log(JSON.stringify(load(process.argv[1])));
' ".trd-state/<trd-name>/implement.json"
```

**2. Verify Git State**

```bash
git log --oneline -1 {checkpoint_commit}
```

If checkpoint commit missing, offer: "pull" / "ignore" / "reset"

**3. Resume point.** Set `phase_cursor` to the last incomplete phase (the first phase with any
task not `status: "success"`). There is no per-task TaskTools re-expansion step — Step 3 rebuilds
the graph from the TRD on every invocation (parsing is cheap and deterministic), and Step 4
re-dispatches whichever phase `phase_cursor` names. A task already `status: "success"` is
excluded from that phase's wave partition before the `Workflow` call is made, so a resumed
phase does not re-implement finished work — see Step 4.2.

A task's `cycle_position` (`implement | checks | debug | complete`, per `implement-state.js`
`CYCLE_ORDER`) is a **diagnostic** field on resume, not a re-entry point: because dispatch is
per-phase (not per-task), there is no partial-phase resume finer than "this task is done" /
"this task is not done yet". A task stuck mid-cycle from a killed session is simply re-run
whole the next time its phase's `Workflow` call fires.

### 2.3 State Validation

On every start, validate state file:

1. **JSON Structure:** `implement-state.load()` throws on unreadable/malformed JSON — catch
   and treat as corrupted.
2. **Required Fields:** version, trd_file, trd_hash, phase_cursor, tasks
3. **Task ID Match:** Compare TRD task IDs (from Step 3's parse) vs state file. Report mismatches.
4. **Commit Verification:** Check task commits exist in git history.

### 2.4 State Repair (Git Reconstruction)

If validation fails, attempt automatic reconstruction:

```bash
git log --oneline --grep="TRD-" -- .
```

Parse commit messages for patterns:
- `feat(TRD-XXX):` -> task completed
- `fix(TRD-XXX):` -> task completed
- `chore(phase N):` -> phase checkpoint

**Reconstruction Limitations:**
- Requires commit messages follow `<type>(TRD-XXX): description` format
- Squashed/rebased commits may lose individual task tracking
- Multiple commits per task: only LAST commit recorded
- Unmatched tasks default to `status: "pending"`

**User Options:**
1. "accept" - Accept partial reconstruction
2. "checkpoint" - Reset to last valid checkpoint
3. "fresh" - Start completely fresh

---

## Step 3: Parse the TRD and Build the Task Graph

This step replaces v3.2.0's prose-driven "Expand Tasks to TaskTools" (Section 3), "Cross-Task
Dependencies" (Section 3.3) and "Concurrency and File Conflict Detection". All three described,
in prose, exactly what `packages/core/lib/trd-parser.js` and `packages/core/lib/task-graph.js`
now compute deterministically. Call them; do not re-derive their output by reading the TRD text
directly.

### 3.1 Parse

```bash
node -e '
  const { parseTrd } = require("./.claude/lib/trd-parser");
  const { buildGraph } = require("./.claude/lib/task-graph");
  const fs = require("fs");
  const trdPath = process.argv[1];
  const markdown = fs.readFileSync(trdPath, "utf8");
  const parsed = parseTrd(markdown, { path: trdPath });
  const graph = buildGraph(parsed.tasks, parsed.grounding);
  console.log(JSON.stringify({ ...parsed, ...graph }, null, 2));
' "$TRD_PATH"
```

Read the result as one object carrying: `tasks[]`, `phases{}`, `grounding{}`,
`couldNotVerify[]`, `openQuestions[]`, `warnings[]` (from `trd-parser.js`), and `nodes[]`,
`edges[]`, `waves[][]`, `criticalPath[]`, `cycles[][]`, `partition{}` (from `task-graph.js`).

**Error Handling:**
- `tasks.length === 0` (parser's own warning: "zero tasks were parsed") — STUCK. Report the
  file path and suggest checking the Master Task List is a table, per
  `packages/core/contracts/trd-authoring.md`.
- `cycles.length > 0` — STUCK, naming every participating task ID from `cycles`. This is
  AC-F1.6: report, do not loop trying to resolve it.
- Non-empty `warnings` that are genuine defects (malformed rows, unknown dependency IDs,
  a grounding block missing the mandatory `Touches` field) — report them in the DISPATCHED
  banner for the affected phase; they are not individually fatal.

### 3.2 Surface owner-only Open Questions before dispatch

For every `openQuestions[]` entry where `ownerOnly === true`: determine which task(s) it
covers (its `question`/`assumed` text names a file in that task's `grounding.touches`, or
names the task's ID directly). Before dispatching **any** phase whose tasks are covered,
include the question's `id`, `question` and `assumed` text in that phase's DISPATCHED banner.
This is informational surfacing (NFR-2) — never `AskUserQuestion` for it; the assumption is
proceeded on, and the per-task delegation (Step 3.5) carries it into the prompt itself so the
implementer sees it before starting, not after (AC-F5.2 — the ordering is structural: the
question is written into the prompt string assembled before the `Workflow` call, so there is
no path on which it reaches the implementer after work has begun).

### 3.3 Implementer selection

For every task, resolve `agentType` (passed through to `implement-phase.js`, which forwards
it to `agent()` as `opts.agentType` when present), **in this precedence order**:

**1. The TRD's own assignment — `task.agent`, and it wins.** `trd-parser.js` extracts it from
the Execution Plan's Session Details (§5.2), where `/create-trd` writes blocks like:

```
**Session 1B: Review-path probe**
- Tasks: ITR-P002
- Agent: @agent-implementer
```

The architect chose that specialist with the entire design in front of it. Keyword-matching a
one-line task summary re-derives the same decision from strictly less information, so it is a
fallback, never an override. On this project's own TRD the parser recovers assignments for
14 of 19 tasks — including `agent-implementer` for the prompt-engineering work and
`verify-app` for the measurement tasks.

**2. Keyword match** on the task description, when the TRD assigned nothing:

| Task Keywords | agentType |
|---------------|-----------|
| backend, api, endpoint, database, server, service | `backend-implementer` |
| frontend, ui, component, react, vue, angular, web, page | `frontend-implementer` |
| mobile, flutter, react-native, ios, android, app | `mobile-implementer` |
| infra, deploy, docker, k8s, aws, cloud, terraform | `devops-engineer` |
| pipeline, ci, cd, github actions, workflow | `cicd-specialist` |
| llm, agent, rag, prompt, embedding, vector, langgraph, langfuse, openai, anthropic, claude, gpt, sonar, retrieval, tool-calling, multi-agent | `agent-implementer` |

**3. When neither the TRD nor a keyword decides, use `backend-implementer`.** Do NOT leave
`agentType` unset.

An unset `agentType` does not mean "no agent" — it means the platform's generic workflow
subagent, which **inherits the session model**. In a session led by Opus that routes ordinary
implementation work to Opus, silently and at roughly five times the token price of the Sonnet
implementer that should have taken it.

Measured 2026-08-16 on an identical 8-task fixture run through both the pre-rework and
reworked commands. The pre-rework command carried a named fallback
(`taskState.implementer_type || "backend-implementer"`); this one dropped it during the
rework:

| | pre-rework | reworked (before this fix) |
|---|---|---|
| model turns | 367 Opus / **330 Sonnet** | 393 Opus / **8 Sonnet** |
| task agents | 8 × `backend-implementer` | 8 × generic workflow subagent |

The fixture's tasks — "create a module, add a Jest test" — match no keyword in the table
above, which is not an exotic case: plenty of real tasks are phrased without a routing noun.

`backend-implementer` is the right default because it is the broadest implementer, it is
Sonnet-tier, and being wrong about it is cheap — a frontend task handled by
`backend-implementer` still gets a competent implementer, whereas an unset type silently
escalates the model tier for every unmatched task in the run. **Fail toward the cheaper
agent, never toward the more expensive one.**

### 3.4 Skill Matching (per task)

Before assembling each task's prompt, resolve `matched_skills[]`:

1. **TRD task table `Skills` column** — highest priority, author-declared. Parse the task's
   `skills` field (comma-separated).
2. **Agent frontmatter fallback** — if empty, read the target agent's `.claude/agents/{agent}.md`
   frontmatter `skills:` list.

**Intersection rule:** only include skills that appear in the target agent's `skills:`
frontmatter, so a task never carries a skill its implementer doesn't declare.

### 3.5 Assemble each task's delegation prompt

Read `packages/core/contracts/task-delegation.md` — it is the complete, binding per-task
instruction set (evidence markers, `<replaces>` deletion instruction, `<unverified_claims>`,
`<open_question>`, `<ui_context>`, scope discipline, strategy instructions, deliverables).
**This command fills its placeholders; it does not restate its content.**

For task `id`:

- `{task_id}`, `{task_description}` — from `tasks[]`.
- `{trd_path}`, `{strategy}` — Step 1.
- `{constitution.unit_coverage}` / `{constitution.integration_coverage}` — Step 1.1.
- `{completed_tasks}` — every task ID with `state.tasks[id].status === "success"` so far,
  across all phases including earlier waves of this one.
- `<grounding>` — omit the whole element (evidence key included) when `grounding[id]` is
  absent. Otherwise emit `<touches>`, `<reuse>`, `<replaces>`, `<follow>`, `<careful>` from
  the parsed arrays. Evidence markers (`[ran]`/`[read]`/`[inferred]`) live inline in the
  prose of `reuse`/`replaces`/`follow`/`careful` (the parser preserves them — only `touches`
  is stripped to bare paths, since a marker there annotates a claim about the file, not the
  file's identity).
- `<unverified_claims>` — emit **only** when a `couldNotVerify[]` entry's `claim` or `check`
  text names a file in `grounding[id].touches`, or names task `id` directly. Never emit an
  empty element.
- `<open_question>` — emit **only** for the owner-only, unresolved question(s) from Step 3.2
  that cover this task. Never emit an empty element.
- `<decision>` — emit from `parsed.decision` (the TRD's top-level `## Decision` section)
  into **every** task's prompt, and append `grounding[id].decision` when that task carries a
  per-task override. Omit the element entirely when both are empty.

  **This element exists because its absence was measured.** A blind trace (2026-08-23) walked
  every placeholder in this list and found the `## Decision` section reached NO implementer by
  any route — not through `<grounding>`, not `<scope_boundaries>` (Non-Goals only), not
  `<objective>`, and not via `serves`, which the parser captures but this step never emits. The
  only working carrier was an author manually duplicating the decision into each task's
  `**Follow:**` bullet, under a field whose own instruction calls it *"an existing pattern in
  this repository"* — untrue of a decision being taken right now.

  The cost is measured too: on a real run FIX-001 was told to emit `{}` while FIX-002, a
  different agent, wrote a test asserting the opposite. The phase gate caught it, after a
  failed gate and a repair pass. **Two tasks of one change must not have to rediscover its
  decision independently.**

- `<scope_boundaries>` — non-goals from Step 1.6.
- `<objective>` — the task's acceptance criteria (Master Task List row).
- `<skills>` — `matched_skills[]` from Step 3.4.
- `<tdd_context>` — omit. No RED phase runs separately (Step 1.4's note); the `tdd` branch of
  `<strategy_instructions>` still describes RED as prior output, which no longer applies —
  the per-task prompt appends a corrective note when `strategy === "tdd"` telling the
  implementer to write the failing test itself, in this same task, before the fix.
- `<ui_context>` — per the contract's own D11 match rule: search the whole TRD (appendices
  included) for a heading containing `Task Grounding`, then `Design References`, then
  `Reference Documents`, first match wins. Omit the whole element when none matches.

**Then append a check-battery element the contract does not carry** (D9, resolved per-project
— this repo has no TypeScript and no installed linter, so those two slots stay empty rather
than filled with a tool that isn't there):

```xml
<check_battery>
  <unit>npx jest {paths this task touches that Jest can run}</unit>
  <shell>shellcheck {changed .sh files, if any}</shell>
  <!-- typecheck and lint are empty for this project — no tsconfig, no eslint/prettier
       config anywhere in the tree. Do not invent commands for them. -->
  <instruction>
    Run the commands above against files you changed. On failure, debug it yourself
    (5 Whys, fix, re-run) before returning — do NOT return status "failed" on the first
    red run. Only report "failed" if the battery is still red after you've genuinely
    tried to fix it. This is the entire DEBUG step for this task: no separate debugging
    agent is spawned for it (D8).
  </instruction>
</check_battery>
```

**Then append the discovery channel** — the answer to "I found something that is not my
task":

```xml
<discovered>
  <instruction>
    If you find work this task does not cover -- a bug outside your scope, grounding that
    is stale, a gap nobody planned for -- RECORD it and carry on with your own task. Do not
    fix it, do not expand your scope, and do not spawn an agent for it:

      node .claude/lib/discovered.js  # (module; call from a one-liner)
      node -e 'require("./.claude/lib/discovered").record(
        ".trd-state/{feature}", {
          kind: "bug",            // bug | scope-conflict | stale-grounding | gap | risk
          foundBy: "{task_id}",
          phase: {phase},
          summary: "one line, what it is",
          file: "path/to/file.js", // optional
          evidence: "how you know"  // optional
        })'

    This is a RECORD, not a task. The orchestrator reads it at the phase boundary and
    decides. Recording costs you nothing and loses nothing; the alternative -- which is
    what happened before this channel existed -- is that your finding lives in your
    return summary, gets compressed into one line, and is gone.
  </instruction>
</discovered>
```

The assembled string is `rec.prompt` in `implement-phase.js`'s `args.tasks.records[]`.

### 3.6 `--verify`: dispatch the background success-definition derive pass

**Only when `--verify` is set.** Absent the flag, skip this step entirely — no
derive agent is dispatched and no `.trd-state/<feature>/success-definition.md` appears
(functional-verification TRD AC-6).

**0. The `--resume` composition gate (§3.7, D13).** When `--verify` AND
`--resume`/`--continue` are both set and `.trd-state/<feature>/verification-state.json`
exists with a **non-terminal** outcome — that is, its top-level `outcome` key is `null` (the
run stopped mid-loop) — this run re-enters the verification loop and nothing else: **skip
this step entirely — dispatch no derive agent — and skip the phase loop (Steps 4–6) and the
end-of-run hardening (Step 7)**, going straight to Step 8, which reads that state file as its
`resume` argument. A definition already exists from the run that wrote the state file;
deriving a second one would overwrite it mid-loop. Every other combination is unaffected:
`--verify` with no state file (or a terminal one) derives and runs the phase loop
as usual, and `--resume` without `--verify` keeps its existing meaning.

**Read `outcome` and nothing else to decide this.** A non-null `outcome` (`satisfied`,
`unbuilt`, `stalled`, `stuck`) means the loop finished and MUST NOT be re-entered; a `null`
one means it stopped mid-loop and should be. A state file with no `outcome` key at all is a
file written by a Judge that did not follow its instructions — treat it as terminal (do not
resume) and say so in the banner, because the alternative reading resumes forever.

Do NOT try to infer terminality from `criteria` instead: `unbuilt` and `stalled` runs both
finish with `not_met` criteria still on the books at an iteration below the cap, so any
"there are still open gaps, therefore resumable" rule misreads both as resumable and re-enters
a loop that already gave its final answer.

**1. Resolve the PRD path**, in order:

1. Read the TRD's `**Source PRD**:` header (the line parsed in Step 1). Its on-disk form is
   not uniform — handle all of these:
   - a bare backticked path: `` **Source PRD**: `docs/PRD/<feature>.md` ``
   - a markdown link: `**Source PRD**: [docs/PRD/<feature>.md](docs/PRD/<feature>.md)`
   - a backticked link: `` **Source PRD**: [`docs/PRD/<feature>.md`](docs/PRD/<feature>.md) ``
   - the literal `**Source PRD**: None — <reason>` — this resolves to **no PRD**, not to a
     file literally named `None`.
   - no header at all — treat as **no PRD** and fall through to step 2.
2. If step 1 yields no PRD, fall back to `.trd-state/current.json`'s `prd` field (written by
   Step 1.3a). This file is gitignored — present in-session, absent on a fresh clone — so its
   absence is a normal fallback miss, not an error.
3. If neither resolves to an existing file path there is **no PRD** — but that is no longer
   the end of it. Fall through to the TRD's own sections, in order:

   a. **`## Reproduction`** (a defect): extract the section text — steps, actual, expected.
      Source kind `reproduction`.
   b. **`## Intended Change`** (a small change decided in conversation): extract the section
      text. Source kind `intended-change`.
   c. **`## Behaviour Preserved`** (a refactor): extract the section text — the test command
      that passed before, and the public surface that must not move. Source kind
      `behaviour-preserved`. The criterion a refactor yields is *"the named tests still pass
      and the named surface is unchanged"*, which is a real, checkable statement even though
      nothing about the system's behaviour was meant to change.

   **Extract the SECTION TEXT. Never pass the TRD path.** The dispatch below is required to
   carry the source "and nothing else — no TRD path, no TRD excerpt, no task list" (FR-1,
   AC-1, D5), and that isolation is what stops the deriver writing criteria the plan satisfies
   by construction. A reproduction and a recorded decision are statements of *outcome* and are
   legitimate sources; the TRD file containing them also contains the *plan*, and handing that
   over would make verification circular. Passing the extracted section honours D5 exactly.

4. If none of the three resolves, no success definition can be derived: record
   `not run: no success definition derivable` for Step 8 to report later
   (functional-verification TRD §3.1, §3.7) and skip the rest of this step — dispatch nothing.

**Record which source won.** Write `functional_verification` with `source_kind`
(`prd` | `reproduction` | `intended-change` | `behaviour-preserved` | `none`) alongside the existing keys. `prd_path`
keeps its meaning when `source_kind` is `prd`; for the two section kinds it holds the TRD path
plus the section name (for the report header only — Step 8 renders it, nothing resolves it).
`prd_resolved` stays for compatibility and means "a source resolved", true for all three.

   **Persist it — this is the only place the fact exists.** Step 8 runs hundreds of tool
   calls later, possibly after a compaction; in-context memory does not survive that (the
   same reasoning `.claude/rules/async-discipline.md`'s dispatch ledger exists for). Record
   the fact in `implement.json` (Step 6's state file) so Step 8 reads it back rather than
   inferring it from an absent `success-definition.md` — that absence is a **different,
   distinct** outcome (`not run: no definition produced`, when the PRD resolved but the
   background derive agent died) that must not be conflated with this one.

   **Set it on the in-memory state object first, then persist — in that order, and never as
   a bare `writeFileSync` to disk.** Two facts about this step's position in the run make the
   obvious "read the file, add the key, write it back" wrong in both directions:

   - On a fresh run, `.trd-state/<feature>/implement.json` **does not exist yet** — Step 4.1's
     `implement-state.save()` is its first writer. A `readFileSync` here throws `ENOENT` and
     the fact is never recorded at all.
   - Even where the file does exist (a `--resume`), Step 4.1 writes the **whole** in-memory
     `state` object through `implement-state.save()`. A key that exists only on disk is
     clobbered by that first phase write, hundreds of tool calls before Step 8 reads it —
     silently, and precisely into the `prd_resolved`-absent case Step 8 treats as "the PRD
     resolved". That turns `not run: no success definition derivable` into `not run: no definition produced`,
     which is the exact conflation this field exists to prevent (TR3).

   So mutate the state object the command is already carrying:

   ```javascript
   // PRD unresolvable:
   state.functional_verification = { prd_resolved: false, prd_path: null };
   // PRD resolved (set before the step-2 dispatch below):
   state.functional_verification = { prd_resolved: true, prd_path: "<resolved PRD path>" };
   ```

   then persist it with the only sanctioned writer, which needs no prior file to exist:

   ```bash
   node -e '
     const { save } = require("./.claude/lib/implement-state");
     save(process.argv[1], JSON.parse(process.argv[2]));
   ' ".trd-state/<feature>/implement.json" "<the full state object as JSON>"
   ```

   Because the key now lives on the in-memory object, every later `save()` — Step 4.1's and
   every checkpoint's — carries it forward instead of dropping it.

**2. Dispatch the derive pass in the background**, same call shape as Step 7.1's
`Agent(subagent_type=..., prompt="…")` verifier fan-out (the agent type differs; see §7.1):

```
Agent(subagent_type="product-manager", run_in_background: true,
      prompt="<packages/core/contracts/functional-verification.md text> + <the source> + <output path .trd-state/<feature>/success-definition.md>")
```

`<the source>` is whatever step 1 resolved: the **PRD path** for `source_kind: prd`, or the
**extracted section text** for `reproduction` / `intended-change`.

The prompt carries the source and the output path and **nothing else** — no TRD path, no
TRD excerpt, no task list (functional-verification TRD FR-1, AC-1, D5). `product-manager` is
already on `constitution.md`'s 13-agent roster and its frontmatter already declares
`background: true`; this step adds no agent, no roster edit, and no change to
`product-manager.md` — the contract text passed in the prompt is the entire instruction set.

**3. Do not wait.** This is a fire-and-forget dispatch: the command continues straight into
the phase loop in the same turn. Nothing here blocks on the derive agent, and nothing here
reads its output — that happens at Step 8, hundreds of tool calls later, which reads
whatever `success-definition.md` contains (or reports `not run: no definition produced` if
the agent never wrote one).

---

## Step 4: Main Execution Loop — Per Phase

### 4.1 Mark phase tasks in progress (state-write-before-dispatch)

Before calling `Workflow`, for every task in phase N not already `status: "success"`:

```javascript
task.status = "in_progress";
task.cycle_position = "implement";
```

Write `implement.json` (`implement-state.save()`) **before** the `Workflow` call. The
`SubagentStop` hook (`status.js`) advances every `in_progress` task by one `CYCLE_ORDER` step
on each subagent completion it observes — this is a best-effort safety net, not the
authoritative write; it does not correlate a specific `SubagentStop` to a specific task
(parallel waves put more than one task `in_progress` at once by design).

### 4.2 Compute this phase's wave partition and dispatch

```javascript
const phaseTaskIds = tasks.filter(t => t.phase === N && state.tasks[t.id].status !== "success").map(t => t.id);
const phaseWaves = graph.waves
  .map(wave => wave.filter(id => phaseTaskIds.includes(id)))
  .filter(wave => wave.length > 0);
```

Dispatch:

```javascript
Workflow({ name: "implement-phase", args: {
  trd: trdPath,
  phase: N,
  tasks: {
    waves: phaseWaves,
    records: phaseTaskIds.map(id => ({ ...taskRecord(id), prompt: assembledPrompt(id), agentType: agentTypeFor(id) }))
  },
  gate: { verifyPrompt, reviewPrompt },   // Step 4.3
  project: ""   // set only when the TRD targets a codebase other than this repo
} })
```

### 4.3 Assemble the phase-gate prompts

`implement-phase.js` runs these two **inside** the workflow (`verify-app`
dispatched by `agentType`, foreground; the review is a foreground
`agent()` call whose prompt instructs it to invoke the `/code-review` Skill — that skill
self-forks to background, which is what satisfies "costs no orchestrator context" without
the workflow needing a background variant of `agent()` itself). This command assembles all
three prompt strings — the workflow opens no file and runs no `git`.

**`verifyPrompt`** — full test suite for this phase's changed files, scoped against every
acceptance criterion of every task in phase N:

```xml
<phase_verification phase="{N}">
  <tasks>{task ids in this phase}</tasks>
  <acceptance_criteria>{concatenated acceptance criteria for this phase's tasks}</acceptance_criteria>
</phase_verification>
<instructions>
Run the full test suite against files changed since the last checkpoint (git diff
{last_checkpoint_commit_or_merge_base}). Report pass/fail counts and unit/integration
coverage %. Read .claude/rules/constitution.md's verification_level; if any task in this
phase carries [LIVE] or the level is live-required/e2e-required, start the service and
verify against a running instance — do not approve on mocked tests alone.
Return status "pass" only when every acceptance criterion above is met.
</instructions>
```

**`reviewPrompt`** — scoped to the **phase diff**, not the branch (AC-F8.3):

```xml
<phase_review_request phase="{N}">
  <diff_range>{last_checkpoint_commit_or_merge_base}</diff_range>
</phase_review_request>
<instructions>
Invoke the code-review Skill at "high" effort, scoped to the diff range above (the
working tree against that commit — this phase's changes only, not the full branch).

APPLY what you find, do not merely count it. Mirror Step 7.1 and audit-trd.js's
reconcile stage: apply straightforward, clearly-justified fixes inline; report
anything non-trivial, ambiguous, or outside this phase's scope as a finding rather
than guessing at a fix.

Return `findings` (total), `applied` (fixed inline), and `reported` (left for the
human), plus a one-line summary of each reported item.
</instructions>
```

`{last_checkpoint_commit_or_merge_base}` is `state.checkpoints`'s last entry's `commit` when
one exists, else `git merge-base main HEAD` (phase 1, nothing checkpointed yet).

**Why apply rather than count.** Until 2026-08-16 this prompt said only "Report the total
finding count", and nothing downstream did anything with the number: Step 4.4 does not gate
on it and Step 5.2 writes it into a commit message. Every finding from every per-phase review
was therefore reduced to an integer and discarded — while `review 4 finding(s)` in the git log
read like diligence.

The asymmetry was backwards. Step 7.1's end-of-run pass already applies what it finds; the
per-phase review is the *cheaper* place to fix, because the diff is small, scoped, and the
work just happened. Fixing at the end of the run means fixing across a branch-wide diff with
the context cold.

### 4.4 Interpret the phase result

`Workflow` returns `{ phase, tasks: [{id, status, filesChanged, error?}], gate: {verifyApp,
simplify, review: {findings}}, status: "complete"|"failed" }`.

For every task in the result: `implement-state.recordResult(state, id, {status, filesChanged,
error})`. On `status: "success"`, set `task.cycle_position = "complete"` explicitly — per
`implement-state.js`'s own documented ambiguity, `recordResult()` deliberately does not
perform the `checks -> complete` skip on a passing result; this command, as the documented
state-write owner, makes that write.

**Run the deterministic phase-gate battery** (D8: the command runs the FULL battery here;
the per-task battery in Step 3.5 was targeted).

**Resolve the battery command for THIS project — do not assume one.** In priority order:

1. A command named by `stack.md` or `constitution.md` for the full suite.
2. A `package.json` script, preferred in this order: `smoke`, `test:ci`, `test`.
3. The language-conventional runner when its config is present: `pytest` (`pytest.ini`,
   `pyproject.toml`), `go test ./...`, `cargo test`, `bundle exec rspec`, `mvn test`.
4. **None found → SKIP the battery and say so** in the phase banner:
   `phase gate: no project-wide battery resolved — gate rests on verify-app alone`.

**A missing battery is not a phase failure.** Skipping is the correct behaviour: the phase
gate already ran `verify-app` inside the workflow, so the deterministic battery is a second,
project-wide check on top of it — not the only one.

This step read `npm run smoke` literally until 2026-08-16. That is this repository's own
script name, and `scaffold-project.sh`'s `copy_commands()` ships this file verbatim to every
project while `templates/` carries no smoke harness. In any scaffolded project the command
was missing, Step 4.4 read the non-zero exit as phase failure, and the phase retried three
times and went STUCK — **blaming the tasks for a gate that never existed.** Step 3.5's
per-task `<check_battery>` had been marked "empty for THIS project"; the phase gate got the
same this-repo resolution with none of the marking.

It went undetected through four green end-to-end runs because the executing model routed
around it: one run's own log reads *"No `package.json` exists, so `npm run smoke` … does not
exist in this project"* and it proceeded anyway. **A prompt-based command masks its own
defects, because the executor adapts.** Passing runs are not evidence that a hardcoded path
is correct — only that the model papered over it.

**On phase success** (`status === "complete"` and the resolved battery green, or skipped):
proceed to Step 5.

**On phase failure** (`status === "failed"`, or a *resolved* battery red): the workflow does not
retry itself (§3.4's Error Handling — retry policy is durable state and belongs to this
command). Increment a phase-level retry counter (stored per failed task's `retry_count`,
already incremented by `recordResult`). If every failed task's `retry_count < 3`: re-dispatch
the **whole phase** (AC-F16.6 — "a retried phase re-runs its whole task set", including tasks
that succeeded on the prior attempt, since `implement-phase.js` has no partial-retry input).
If any failed task's `retry_count >= 3`: STUCK (Step 10.1), naming the task, the phase, and
whether the failure matches a documented risk (Step 1.6).

---

## Step 5: Phase Checkpoint

After a phase's `Workflow` call returns `status: "complete"` and the resolved battery is green (or was skipped):

### 5.1 Update State

```bash
node -e '
  const { checkpoint, save } = require("./.claude/lib/implement-state");
  const state = require(process.argv[1]);
  checkpoint(state, Number(process.argv[2]), { commit: process.argv[3], review: JSON.parse(process.argv[4]) });
  save(process.argv[1], state);
' ".trd-state/<trd-name>/implement.json" "$N" "$COMMIT_SHA" "$REVIEW_JSON"
```

Advance `phase_cursor`.

### 5.2 Git Checkpoint

```bash
git add -A
git commit -m "chore(phase {N}): checkpoint (battery {green|red|skipped}; verify-app {status}; simplify {changed|no-change}; review {findings} finding(s): {applied} applied, {reported} open)"
git push -u origin {branch_name}
```

### 5.3 Context Management at Phase Boundary — DO NOT PAUSE

**Phase boundaries are NOT user-pause points.** After a phase checkpoint, emit the PHASE
banner (per `.claude/rules/command-status.md`) and **immediately spawn the next phase in
the same orchestration loop** — no "Run /compact" prompt, no waiting for user input.

```
[STATUS: /implement-trd] PHASE {N}/{M} COMPLETE → {completed-task-count} tasks success, battery {green|skipped}, review {findings} finding(s) ({applied} applied, {reported} open), commit {sha}
   open findings: {one line per reported item, or "none"}
```

**Then print the discovery channel**, which is separate from review findings — a review
finding is about code that was written; a discovery is about work that was NOT done:

```bash
node -e 'process.stdout.write(require("./.claude/lib/discovered").render(".trd-state/<feature>", {phase: <N>}))'
```

It prints nothing when nothing was recorded, deliberately: an empty "DISCOVERED: none"
section reads as "checked, found none", and that is a different claim from "nothing was
recorded". Do not synthesise one.

**Discoveries are NOT a pause condition and NOT auto-actioned.** Print them and continue.
To act on one, it goes into the TRD and the next `--resume` picks it up through the normal
parse → graph → dispatch path — never by injecting a task into a dispatch already in
flight, which would leave the wave partition, the file-conflict serialization and the phase
gate all computed against a task set that no longer exists.

**Print the reported findings, do not just count them.** `gate.review.summary` carries one
line per item the reviewer left open. A phase that fixed three things and left one for a
human is a different phase from one that found four and fixed none, and the banner is the
only place a human sees either. Open findings are NOT a pause condition — print them and
continue; Step 7's feature-scale pass sees them again over the whole branch.

Then continue into the next phase. Pause ONLY on the explicit conditions enumerated in
Step 10 (STUCK with retry exhaustion, unrecoverable error, user `Ctrl+C`). Routine phase
transitions are NOT pause conditions.

**Compaction is automatic, not user-driven.** `/compact` will auto-fire at ~95% context;
the `precompact.js` hook captures the in-flight task + recent decisions into
`.trd-state/<feature>/session-log.md` before summarization. The state file (`implement.json`)
preserves all task-level progress across compaction independently. The loop survives both.

**Decision-trail durability (PreCompact hook).** When `/compact` runs — or auto-compaction
triggers at ~95% context — the `precompact.js` hook appends a structured checkpoint to
`.trd-state/<feature>/session-log.md` capturing the in-flight task, retry context, and
recent completions. After compaction, **re-read `session-log.md` first** to recover the
reasoning trail; if you have decision rationale or open questions from the just-summarized
turns that aren't captured in `implement.json`, append them under the most recent
**Decisions & rationale** section of the log before continuing the loop. Treat the log as
the durable companion to `implement.json` — state records *what* happened, the log records
*why*.

---

## Step 6: State Management

### State File Location

`.trd-state/<trd-name>/implement.json`

### State File Schema

```json
{
  "version": "4.0.0",
  "trd_file": "docs/TRD/<feature>.md",
  "trd_hash": "<sha256>",
  "branch": "<branch-name>",
  "strategy": "tdd|characterization|test-after|bug-fix|refactor|flexible",
  "phase_cursor": 1,
  "tasks": {
    "TRD-XXX": {
      "description": "Task description",
      "phase": 1,
      "status": "pending|in_progress|success|failed|blocked",
      "cycle_position": "implement|checks|debug|complete",
      "current_problem": "Description or null",
      "retry_count": 0,
      "files_changed": [],
      "commit": "sha or null",
      "started_at": "ISO8601 or null",
      "completed_at": "ISO8601 or null"
    }
  },
  "checkpoints": [
    {
      "phase": 1,
      "commit": "sha",
      "review": { "findings": 0 },
      "timestamp": "ISO8601"
    }
  ],
  "recovery": {
    "last_healthy_checkpoint": "sha",
    "last_checkpoint_timestamp": "ISO8601",
    "interrupted": false,
    "interrupt_reason": null
  },
  "functional_verification": {
    "prd_resolved": true,
    "prd_path": "docs/PRD/<feature>.md or null"
  }
}
```

**On `functional_verification` (present only when `--verify` was set, FV-B005):**
written by Step 3.6 at PRD-resolution time, not by the loop itself — `verification-state.json`
and `verification-report.md` (both written by the workflow's Judge agent, §3.3a) are the
loop's own durable record; this field exists only to carry the **one** fact that predates the
loop and would otherwise be lost to it. Step 3.6 runs hundreds of tool calls before Step 8,
across a possible compaction, so `not run: no success definition derivable` cannot survive as in-context
memory (the same reasoning `.claude/rules/async-discipline.md`'s dispatch ledger exists for
— see its "Orchestration pattern" section). It is set on the in-memory `state` object, not
written to disk on its own, so that Step 4.1's `implement-state.save()` — which writes the
whole object — carries it forward rather than clobbering it. Step 8 reads `prd_resolved`
first and, only when it is `true` (or, defensively, the field is missing altogether, which
under `--verify` can only mean the state write was lost), falls through to
checking whether `success-definition.md` exists on disk. This keeps the
three outcomes §3.1 requires distinct: `prd_resolved: false` → `not run: no success definition derivable`;
`prd_resolved: true` and the definition file absent → `not run: no definition produced`
(the derive agent died); `prd_resolved: true` and the file present with zero rows → AC-3's
legitimate empty definition, which Step 8 does NOT report as either `not run` case.

**On `cycle_position`:** reduced to `implement-state.js`'s exported `CYCLE_ORDER` —
`implement | checks | debug | complete`. The v3.2.0 five-position enum
(`verify_red|verify|debug|simplify|verify_post_simplify|review`) no longer exists; `status.js`
imports `CYCLE_ORDER` from the same module (D5) so the two cannot drift.

**On the retired session-coordination map and the legacy pointer file (ITR-B006, D13):**
neither appears in the schema above or anywhere in Step 1.2/1.3 any more. The
session-coordination map existed for cross-implementation coordination that NG13 descopes;
it held an empty object on every `implement.json` this project ever produced, so removing
it changes nothing observable. The pointer file is untracked (`.gitignore`) and out of the
active-TRD resolution chain entirely — Step 1.2 derives the active TRD from the branch name
or from the single in-progress state file instead.

### Session vs Persistent State

| Scope | Storage | Purpose |
|-------|---------|---------|
| Persistent | `.trd-state/*/implement.json` | Cross-session recovery, audit trail |

There is no session-scoped TaskTools mirror in this design — dispatch is per-phase via
`Workflow`, not per-task via claimed TaskTools items (see Execution Model, above).

---

## Step 7: End-of-Run Hardening and Review

After the final phase's checkpoint (Step 5) and before Step 8's functional verification
(when `--verify` is set) and Step 9's completion report:

### 7.1 Feature-scale hardening pass (verifier fan-out)

The per-phase adversarial pass already ran inside `implement-phase.js`'s gate (the phase-scoped
review). This step is the "once more at feature scale" half (D15, AC-F14.1): a lens no
single phase's review could apply, because interaction risk between phases only exists once
every phase is assembled.

Dispatch the following in **one turn** (the Agent tool runs same-turn calls concurrently —
this is a plain foreground fan-out from this command, not a nested subagent spawn, and not a
team: no `Agent({name, team_name})` is used, satisfying AC-F14.5):

```
Agent(subagent_type="code-reviewer", prompt="<edge-case lens over the full branch diff>")
Agent(subagent_type="code-reviewer", prompt="<contract-compliance lens: does every task's grounding <replaces> actually get deleted; do declared <reuse> targets get used>")
Agent(subagent_type="code-reviewer", prompt="<regression + cross-phase interaction lens: does anything from an earlier phase break under a later phase's changes>")
```

Each prompt scopes to `git diff {branch_base}...HEAD` (full branch diff, computed once via
`git merge-base main HEAD`). Collect findings; apply straightforward, clearly-justified fixes
inline (mirroring `audit-trd.js`'s reconcile stage — "apply what survives"); report anything
non-trivial as a finding rather than guessing at a fix outside this task's scope.

### 7.2 End-of-run full-branch code review

```
Skill({ skill: "code-review", args: "high {branch_base}...HEAD" })
```

This is the **full branch diff** review (AC-F8.5), distinct from every phase-scoped review
that already ran. Per the attested finding (ITR-P002/ITR-P003), `/code-review` is
model-startable and forks itself to background subagents — this command does not block
waiting for it to finish, and does not claim it "will report back": it states, in the past
tense, that the review was dispatched (with its session reference, if the tool returns one),
which is a factual statement about a completed dispatch, not a deferred-notification claim.

---

## Step 8: Functional Verification (`--verify` only)

**Only when `--verify` is set.** Absent the flag, skip this step entirely — Step 9's
banner reads `not run (--verify not set)` (functional-verification TRD §3.7, AC-6).

This step is **one dispatch, not a loop** (D1, G2, FR-2). It contains exactly one `Workflow(`
call. Everything that iterates, judges, or decides what to do next belongs to
`verify-functional.js` (FV-B002) — this step never reasons about `decideNext`'s branches in
prose, never reads or mutates the TRD, and never calls `Agent(` directly. Its whole job is
resolving inputs from disk and rendering what the workflow returns.

### 8.1 Resolve the definition, distinguishing all three outcomes (§3.1)

1. Read `.trd-state/<feature>/implement.json`'s `functional_verification` field (written by
   Step 3.6, §6 above) — `prd_resolved` decides which branch below runs, `source_kind` says
   which of the three sources won, and `prd_path` is the display string §8.1's second branch
   and §8.3's `prd` argument both need (Step 3.6 ran hundreds of tool calls ago; this file,
   not memory, is where it lives). If `prd_resolved` is `false`: **no source resolved at all** —
   no PRD, no `## Reproduction`, no `## Intended Change`, no `## Behaviour Preserved`. Render
   `not run: no success definition derivable` through the lib CLI's `render-report` — **do not
   write this by hand** (D3, one renderer):

   ```bash
   node -e '
     const fs = require("fs");
     const input = {
       feature: process.argv[1], prd: "", definitionPath: process.argv[2],
       outcome: "not-run", reason: "no success definition derivable", criteria: [],
     };
     fs.writeFileSync(process.argv[3], JSON.stringify(input));
   ' "<feature>" ".trd-state/<feature>/success-definition.md" "/tmp/fv-report-input-<feature>.json"
   node .claude/lib/functional-verification.js render-report --file /tmp/fv-report-input-<feature>.json \
     > ".trd-state/<feature>/verification-report.md"
   ```

   Skip the rest of this step — no `Workflow` call. Record the outcome as `not-run-no-source`
   for Step 9's banner and continue to Step 9.

2. Otherwise (`prd_resolved` is `true` — a source of some kind resolved; or, defensively, the
   whole `functional_verification` field is missing even though the flag was set — Step 3.6 writes it on both branches, so
   that can only mean the state write itself was lost, and falling through here at least
   produces a real report instead of a spurious `no success definition derivable`), check whether
   `.trd-state/<feature>/success-definition.md` exists on disk. **Do not wait on the background
   derive agent and do not derive a definition inline** — there is no attested primitive for a
   lead session to block on a specific `Agent({run_in_background: true})`
   (`.claude/rules/async-discipline.md`, "Orchestration pattern: the scheduled nudge"), and an
   inline derivation would be a second, undisciplined production path for
   `success-definition.md` outside FV-P001's mandatory-citation contract. Step 8 runs at the
   tail of the run, hundreds of tool calls after the Step 3.6 dispatch — an absent file at this
   point means the derive agent died, which is information the report must carry, not a gap to
   paper over silently.

   Absent → render `not run: no definition produced` (TR3), same renderer, same shape as
   above but with `reason: "no definition produced"` and `prd` set to `prd_path` from the
   state file (step 1) — which for a section source is the TRD path plus section name, a
   display string only. Skip the rest of this step — no `Workflow` call. Record `not-run-no-definition`
   for Step 9 and continue.

   Present → parse its table into `criteria` (§3.1's format; column → field: `ID` → `id`,
   `Functional statement` → `statement`, `Cites` → `cites`, `Evidence that would prove it` →
   `evidence`, `Derivation` → `derivation`). **Zero rows is legitimate** (AC-3) — proceed to
   §8.3 with `criteria: []` rather than treating it as either `not run` outcome; the workflow's
   own empty-criteria branch (§3.3, Error Handling) runs one Judge call and returns
   `outcome: 'satisfied'` with a real, rendered report — that is the correct handling for a PRD
   that yielded no functional criteria, and it is not this step's job to special-case it.

### 8.2 The `--resume` composition (§3.7, D13) — already gated at Step 3.6

When Step 3.6's step 0 fired (both flags set, a non-terminal `verification-state.json` on
disk), the phase loop and Step 7 were skipped entirely and this is the first thing the run
does. The definition file is guaranteed present in that case (the state file could only exist
from a prior run that resolved one) — resolve `criteria` from it exactly as in §8.1's "Present"
branch, then read `.trd-state/<feature>/verification-state.json` and pass its contents as
`resume: { iteration, criteria, gapsClosed }` (D13) — `outcome` is read by Step 3.6's gate,
not passed to the workflow, which derives its own. On a fresh run (no prior state file, or a
terminal one), `resume` is `null`.

### 8.3 Assemble the remaining args and dispatch

Read `.claude/verification-notes.md` (or `""` when it does not exist), `.claude/rules/stack.md`
and `CLAUDE.md` (repo root) as `stackHints`, and `packages/core/contracts/functional-verification.md`
as `contract`.

**Resolve `since` as the LATER of HEAD's commit time and this run's loop start time**
(functional-verification TRD §3.2):

```bash
HEAD_SEC=$(git log -1 --format=%ct)
LOOP_START_SEC=$(date +%s)
SINCE=$(( HEAD_SEC > LOOP_START_SEC ? HEAD_SEC : LOOP_START_SEC ))
```

HEAD's commit time alone is only a proxy for "when the code last changed", and on the
`--resume` composition that proxy breaks: §8.2's path skips the phase loop, so no new commit
exists, HEAD dates from the **prior** run, and that run's leftover artifacts under
`.trd-state/<feature>/evidence/` all carry mtimes newer than it. Every one of them would clear
the tier-1 freshness gate having proved nothing about this run — so a criterion whose new
Exercise produces nothing could be scored against a stale artifact at the same path. Raising
the floor to the loop start enforces the invariant actually wanted (*this artifact was
produced by THIS run's verification loop*) and rejects nothing legitimate, because D2 has
every iteration re-walk every criterion — all evidence on a resumed run is freshly produced
anyway.

Keep the `max`, do not simplify it to `date +%s`: a commit authored on a machine with a
skewed clock can carry a timestamp ahead of local now, and the floor must never fall below
HEAD. And take `LOOP_START_SEC` **here**, at the dispatch — not earlier in the run — or it
stops being the loop's start.

The derivation lives in this step and nowhere else: `verify-functional.js` must stay
clock-free (`Date.now()` is forbidden in workflow source by a source-level test) and
`checkEvidence()` must stay pure, so only the resulting number crosses either interface.

```javascript
Workflow({ name: "verify-functional", args: {
  criteria,                                                    // §8.1
  contract,                                                    // packages/core/contracts/functional-verification.md text
  notes,                                                        // .claude/verification-notes.md text, or ""
  stackHints,                                                   // stack.md + CLAUDE.md excerpts
  evidenceDir: ".trd-state/<feature>/evidence",
  checker: ".claude/lib/functional-verification.js",
  since,                                                         // max(HEAD commit time, loop start) -- see above, TRD §3.2
  cap: 3,
  statePath: ".trd-state/<feature>/verification-state.json",
  reportPath: ".trd-state/<feature>/verification-report.md",
  resume,                                                        // §8.2, null on a fresh run
  project: "",                                                   // set only when the TRD targets a codebase other than this repo
  feature: "<feature>",                                          // Finding A: renderReport()'s header
  prd: prd_path,                                                 // Finding A — from implement.json's functional_verification (§8.1 step 1)
  definitionPath: ".trd-state/<feature>/success-definition.md",  // Finding A
} })
```

Same call shape as Step 4.2's `Workflow({ name: "implement-phase", args: {…} })` — one
dispatch, one return, no fan-out helper. Notably absent from the arg list: `gate`, `prefix`,
`phaseNumber`, `existingIds` — those exist only to feed `implement-phase.js`'s task-graph
machinery (D8), which this loop has none of; carrying them here would be assembling args
nothing reads.

`verification-state.json` and `verification-report.md` are written **inside** the workflow, by
its Judge agent (§3.3a) — this step does not write either one on the dispatch path (only on
the two `not run` short-circuits in §8.1, which never reach the workflow at all).

### 8.4 Render the outcome

The `Workflow` call returns `{ outcome, reason, iterations, reportPath, criteria, gaps,
unbuilt, exercised, debugAttempts, notesUpdated }` (§3.3). Carry `outcome` and `reportPath`
into Step 9's FUNCTIONAL VERIFICATION block, along with `criteria` — the banner's
met/not-met/not-verifiable/unbuilt counts are a tally of that array's `status` values, so
dropping it here leaves those four counts with nothing to come from. Nothing beyond those
three — no re-reading the rendered report, no re-deriving the verdict; the report and the
state file are already the durable record.

---

### 8.4a Preflight the environment BEFORE spending iterations

Read `.claude/rules/verification.md` and resolve, per criterion, whether it can be exercised
at all — **before** the `Workflow` call, not four criteria into iteration 1.

For each criterion, one of:

- **exercisable** — the environment it needs is listed, reachable, and (if the loop will need
  to correct) has a refresh command in §2.
- **not verifiable here** — no environment listed covers it, the tooling is not installed, or
  §5 already names it as unverifiable. Mark it now. It goes into the report as
  `not_verifiable` with the reason, and it is never handed to the debugger.
- **needs one thing from the owner** — a credential that has expired, an approval to deploy to
  a shared environment, a service that must be started by hand.

**That third bucket is the ONLY legitimate `AskUserQuestion` on this path, and it is asked
ONCE, here, as a single batched question** naming every criterion affected and the default
you will apply if unanswered (mark them `not_verifiable` and continue). This is
`autonomy.md` case 2 — information that genuinely cannot be derived — and asking it up front
is the difference between one question before the run and a discovery mid-loop that strands
half the criteria.

**Then run the loop on whatever remains.** A partial verification with the gaps stated is
worth far more than no verification: the criteria you CAN check still get checked, and the
ones you cannot are named rather than silently absent.

Observed 2026-08-20 (fanfare): a run reached iteration 1, discovered an expired Salesforce
token blocking four criteria, and reported those four as `not_met` — recording them as code
failures when the code was never exercised. Both halves were avoidable here: the expiry was
discoverable before the loop started, and `not_verifiable` is the status that distinguishes
"we could not look" from "we looked and it is broken".

---

### 8.5 While the loop is in flight, its gaps are NOT yours to fix

**The loop owns remediation. The orchestrator does not touch it, does not offer to, and
does not dispatch anyone else to.** This holds from the `Workflow(verify-functional, …)`
call until it returns, and it holds even when the fix is obvious and one line.

If the owner asks what the loop has found so far, **report the findings and say the loop
owns them.** Do not offer to fix one "in parallel" — that offer is the failure, not the
fixing.

Four reasons, and the first two are correctness rather than tidiness:

- **Two writers, one tree.** The Debug stage edits the same files. A concurrent orchestrator
  edit races it, and the loser is silently overwritten.
- **It destroys the evidence gate.** The next Exercise pass measures a tree someone else is
  editing, so `checkEvidence`'s freshness check stops meaning "this artifact proves this
  code" — the whole tier-1 mechanism rests on the code being still while it is measured.
- **It corrupts the loop's own accounting.** `gapsClosed` and the stall rule assume the
  Debug stage closed what closed. A gap fixed from outside reads as the debugger succeeding,
  so a debugger that is actually failing looks effective.
- **It pre-empts the answer.** Whether the loop can close a gap on its own is the thing the
  loop exists to establish. Fixing it first replaces a measurement with an assumption.

**Observed 2026-08-20 (fanfare).** The loop surfaced a real editor crash and a UI gap. The
owner asked about the interim results, and the orchestrator offered to *"start on the
editor-crash fix in parallel"* while the loop was still running. Nothing here forbade it,
which is why this section exists. The findings were correct and useful; the offer was still
wrong.

**The one thing to do instead:** record it, exactly as an implementer would
(`node -e 'require("./.claude/lib/discovered").record(...)'`), and let the loop finish. If
the loop exits `stuck` or `stalled` with that gap still open, THEN it is the orchestrator's
— and by then you know the loop could not close it, which is information you did not have
before.

---

## Step 9: Completion

When all phases complete:

```
===============================================================================
                    TRD IMPLEMENTATION COMPLETE
===============================================================================

TRD: {trd_filename}
Branch: {branch_name}
Strategy: {strategy}

PROGRESS
--------
Total tasks: {N}
Completed: {completed_count}
Failed: {failed_count}

QUALITY METRICS
---------------
Unit Coverage:        {X}% (target: 80%)  {PASS/FAIL}
Integration Coverage: {Y}% (target: 70%)  {PASS/FAIL}
Battery:              {green/red/skipped} ({resolved command}, last phase gate)

HARDENING & REVIEW
-------------------
Feature-scale hardening findings: {count} ({applied} applied, {reported} reported)
End-of-run /code-review high:     dispatched over {branch_base}...HEAD

FUNCTIONAL VERIFICATION
------------------------
Outcome: {not run (--verify not set) | not run: no success definition derivable | not run: no definition produced | satisfied | unbuilt | stalled | stuck}
Met: {count}  Not met: {count}  Not verifiable: {count}  Unbuilt: {count}
Report: {report_path or "n/a"}

COMMITS
-------
{list of commit SHAs with messages}

DISCOVERED (work this run found but did not do)
-----------------------------------------------
{render(".trd-state/<feature>") across ALL phases, or the line "none recorded"}

NEXT STEPS
----------
1. Verify delivery against the TRD and PRD: /audit-build {trd_path} --prd {prd_path}
2. Review changes: git diff main...{branch_name}
3. Create PR: gh pr create --title "{TRD title}"
4. After merge: mv docs/TRD/{filename} docs/TRD/completed/

===============================================================================
```

**Why `/audit-build` leads that list.** D16/ITR-B010 moved the acceptance-criteria check OUT
of the per-task loop and INTO `/audit-build` — the relocation happened, but until 2026-08-16
the handoff did not: this command never invoked it and never named it, so nobody checked a
single task's acceptance criteria unless the user independently remembered a command the
completion banner never mentioned.

It is a recommendation to the user rather than an automatic invocation because it is a
separate, individually-priced verification wave (7 agents on this project's own TRD), and
`.claude/rules/autonomy.md` governs what this command does unattended — not what it spends
on a second command's behalf. Naming it is the fix; auto-running it is a different decision.

**Filling the FUNCTIONAL VERIFICATION block.** When `--verify` was never passed,
this block is not omitted — it reads `Outcome: not run (--verify not set)` with
every count at 0 and `Report: n/a`, so its absence is never mistaken for a pass
(functional-verification TRD §3.7). When the flag was set, Step 8 resolved one of five
states: the two `not run` short-circuits (§8.1 — no success definition derivable, no definition produced),
or one of the workflow's four terminal outcomes (§8.4 — `satisfied`, `unbuilt`, `stalled`,
`stuck`). The met/not-met/not-verifiable/unbuilt counts come from tallying the `criteria`
array the workflow returned (or are all 0 for the two `not run` cases, since no criteria were
ever evaluated); `Report` is `Step 8`'s `reportPath` in every case — the two `not run` reports
are written by the same `render-report` CLI call, so the path is populated even when the loop
itself never ran.

### 9.0a Artifact link, if the project opted in (see `.claude/rules/command-status.md`)

When `.claude/settings.json` sets `ensemble.publishArtifacts: true` **and this run used
`--verify`**, publish the verification report:

```
Artifact({ file_path: ".trd-state/<feature>/verification-report.md", favicon: "✅",
           url: "<artifacts.json's verification-report key, if present>" })
```

Store the returned URL back into `.trd-state/<feature>/artifacts.json` under
`verification-report`, so a later `/verify-build` updates the same link rather than minting a
second one that competes with it.

**Emit the link inside the report block, above the banner.** Publishing failure is one line
of prose — never a STUCK, never a retry, never a missing banner. The report on disk is the
deliverable.

### 9.1 The banner closes the turn — nothing after it

**Emit `═══ COMMAND COMPLETE: /implement-trd ═══` plus its one-line summary as the LAST
lines of the turn, immediately after the report block above.** The report's `====` rule is
not the end of the output; the banner is.

**Nothing may follow it** — not a caveat, not a finding, not a recommendation, not an
explanation of something the run noticed. Anything worth saying goes ABOVE the report block
or inside it, and anything worth keeping goes in a commit message or a file, not in trailing
prose. `.claude/rules/command-status.md` states this and it is not decorative: the banner is
how a human and a harness both detect that the command terminated.

**Measured 2026-08-19**, third live run of the `verify-functional` smoke scenario: the run
completed successfully, wrote every artifact, and then continued past the report with three
paragraphs of genuinely useful analysis — a scaffold gap, two checker bugs, a note on review
scope. All worth having. None of it belonged after the banner, and the banner was never
emitted at all, so the scenario's terminator assertion failed on an otherwise clean run. The
step ended on the report block and said nothing about what came next, so there was nothing
here to obey.

If the run discovered something important, that is exactly what the `NEXT STEPS` list and
the commit trail are for.

---

## Step 10: Pause Conditions (NOT phase boundaries)

The command runs **uninterrupted** through every phase from start to completion — phase
checkpoints emit the PHASE banner and immediately spawn the next phase. The ONLY
conditions under which the command pauses for user input are below. Routine phase
transitions, /compact recommendations, and successful checkpoint commits are NOT pause
conditions.

### 10.1 STUCK (retry count >= 3, or a cycle in the task graph)

```
===============================================================================
                    IMPLEMENTATION PAUSED
===============================================================================

Task: {task_id}
Stage: {cycle_position}
Problem: {current_problem}
Retry attempts: {retry_count}/3

{If problem matches documented risk:}
RISK MATCH DETECTED:
- Risk ID: {risk_id}
- Documented Mitigation: {mitigation}
- Contingency Plan: {plan or "None"}

OPTIONS:
1. "fix <guidance>" - Provide specific guidance
2. "skip" - Skip this task (mark blocked)
3. "retry" - Reset retry count
4. "abort" - Stop and save state
{If contingency exists:}
5. "contingency" - Apply documented contingency plan

Waiting for input...
===============================================================================
```

A cycle detected at Step 3.1 uses the same banner shape, with `Stage` replaced by "graph
cycle" and `Problem` naming every participating task ID.

---

## Error Handling

| Error | Response |
|-------|----------|
| No TRD found | List available in `docs/TRD/`, suggest `/create-trd` |
| TRD parses to zero tasks | STUCK — check Master Task List is a table (Step 3.1) |
| Cycle in task graph | STUCK — name participants (Step 3.1) |
| Git branch conflict | Suggest `git stash` or `git commit` |
| Phase failure (3+ retries) | Pause for user (Step 10) |
| Resolved battery red at phase gate | Treated as phase failure (Step 4.4) |
| No battery resolvable for the project | SKIPPED, reported in the banner — never a failure (Step 4.4) |
| State file corrupted | Attempt git reconstruction, offer `--reset-state` |
| Network error (git push) | Retry 3x with backoff, then pause |

---

## Task Priority (within a wave)

`task-graph.js`'s `waves` already fix the eligibility order across waves. Within one wave,
tasks run concurrently via `parallel()` inside `implement-phase.js`, so priority only affects
narration order in banners, not execution:

1. **Critical path first** — tasks on `graph.criticalPath` narrated first
2. **Deterministic fallback** — alphabetical by task ID

---

## Task Timeout

If a dispatched `Workflow(implement-phase, …)` call has not returned within 30 minutes:

1. Log timeout to state file's `recovery` section
2. Mark the phase as `stalled` in persistent state
3. Present user options:
   - "wait" - Continue waiting
   - "restart" - Restart the phase from current tasks
   - "skip" - Mark as blocked and continue

---

## Compatibility

- Works with/without `.claude/rules/constitution.md`
- Standard TRD task format supported (table-based Master Task List; see Step 3.1)
- State files git-tracked for coordination
- Local CLI and Claude Code web supported

---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /implement-trd] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /implement-trd] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

   **On every RESUMED turn, read the dispatch ledger before deciding anything:**

   ```bash
   node .claude/hooks/dispatch-ledger.js --open
   ```

   Do NOT reconstruct the in-flight set from memory. This command runs long enough to be
   compacted mid-loop, and the dispatch list is exactly what a summary drops. The ledger is
   written by hooks on `SubagentStart`/`SubagentStop`, so it is correct whether or not this
   turn remembers anything.

   Act on what it reports:
   - **Nothing open** — every dispatched subagent finished. Fold their results into
     `implement.json` and continue the loop.
   - **Something open and progressing** — leave it alone and schedule the next wake.
   - **Something open and suspiciously old** (running far longer than its stage's peers,
     or flagged `[resumed after discipline block]`) — nudge it rather than killing it:
     ```
     SendMessage({to: "<agent_id>", message: "status check — what have you completed so far, and what is blocking you?"})
     ```
     The agent resumes with its full context. There is deliberately no timeout: a timeout
     kills work that may be nearly done, and this framework does not use one here.

   `--json` gives machine-readable output; `--session <id>` scopes to this session.
   See `.claude/rules/async-discipline.md` § "Orchestration pattern: the scheduled nudge".

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /implement-trd] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /implement-trd ═══
   <one-line summary>
   ```

5. **PushNotification ON FINAL TURN ONLY** — this is a long-running command; the user has likely walked away. In the same final turn that emits COMMAND COMPLETE, also call:
   ```javascript
   PushNotification({
     status: "proactive",
     message: "implement-trd done: <one-line summary, under 200 chars, leads with what they'd act on>"
   })
   ```
   On `COMMAND STUCK`, send a `PushNotification` whose message states the Reason + Next action (the user needs to come back to unblock). Do NOT send notifications on intermediate Stops, DISPATCHED turns, RESUMED turns, or PHASE boundaries — only the truly-final turn. If the push tool reports "not sent," that's expected; do not retry.

6. **PROGRAMMATIC NOTIFY ON FINAL TURN ONLY** — for orchestration / webhooks / queues / shell pipelines, invoke the user's `NOTIFY_ON_COMPLETE` shell command via Bash on the SAME final turn:
   ```bash
   .claude/hooks/notify-complete.sh "implement-trd" "complete" "<one-line summary>"
   ```
   For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"` and use the Reason as the summary. The bracket-guard means it's a no-op when the user hasn't configured it. Same single-fire timing as the PushNotification — only on the truly-final turn.

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /implement-trd ═══` with Reason + Next (and the PushNotification above).


---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner.
**Do NOT pause mid-flow to ask the user to confirm decisions, review artifacts, verify
checkpoints, or defer to stakeholders.** The user already authorized the run by invoking
the command; do not ask them to authorize it again, in pieces.

`AskUserQuestion` is permitted ONLY in these four cases:

1. **Genuine requirement ambiguity** — the PRD/TRD/stack.md is silent on a decision
   that MUST be made, AND no reasonable default exists from documented constraints.
   *Try a default first; ask only if none fits.*
2. **Missing information that cannot be derived** — a value not in the codebase, env,
   config, or anywhere derivable (a user-specific URL, API key not in env, etc.).
3. **Truly irreversible destructive operations** — `--reset-state` with progress,
   `git push --force`, deleting user-authored files. Routine state mutations do NOT
   qualify.
4. **STUCK conditions** — retry exhaustion after the documented mitigations have run.

Outside these four cases: **decide based on documented constraints, document the
rationale in the artifact, and proceed.** The user iterates via `/refine-prd`,
`/refine-trd`, or `/implement-trd --resume` — not via mid-loop confirmation prompts.

Forbidden patterns:
- "Should I proceed to phase N+1?" → no — emit PHASE banner, proceed.
- "Please review this artifact before I continue." → no — finish the artifact, emit
  COMMAND COMPLETE.
- "Multiple approaches possible; which do you prefer?" → pick the best fit, document
  why, mention alternatives in the artifact if useful.
- "Should I check with product/legal/stakeholders?" → no — decide based on documented
  goals; the user can correct via /refine-*.
- "Checkpoint reached. Continue?" → continue. Always.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- "Given the previous step went cleanly, do you want me to pause and review?" → self-defeating: you just acknowledged there's nothing to address. PROCEED.

### Autonomy is the default, not a mode

The COMMAND COMPLETE banner is the first and only return of control. A STUCK condition after
retry exhaustion is the one thing that stops a run early. Everything in the table above is
forbidden unconditionally — there is no flag that turns this on, and none that turns it off.
