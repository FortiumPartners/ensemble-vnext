# TRD: Rework `/implement-trd` and Build the Deterministic Task Graph

**Version**: 1.1.0
**Status**: Draft
**Created**: 2026-08-16
**Last Updated**: 2026-08-16
**Author**: @technical-architect
**Source PRD**: [`docs/PRD/implement-trd-rework.md`](../PRD/implement-trd-rework.md) (v1.2.1)
**Task ID Prefix**: `ITR`

---

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-08-16 | Initial TRD creation from PRD v1.2.1 (items 7 + 8 of the improvement plan) | @technical-architect |
| 1.1.0 | 2026-08-16 | `/refine-trd --auto` pass. **Open questions:** OQ-2, OQ-3, OQ-4, OQ-7 **answered** from the `Workflow` tool contract and from code; OQ-6 recorded as a **default**; OQ-1 and OQ-5 confirmed **owner-only** and left open. **Removed:** ESLint and Prettier from D9's check battery, §1.3's stack table, §6.2's Code Quality row and ITR-B005's acceptance criteria — neither is installed or configured in this repo (`package.json` devDependencies are `bats`, `jest`, `js-yaml`, `mock-fs`; no `.eslintrc*` / `.prettierrc*` / `eslint.config.*` anywhere); the claim traced to `stack.md`'s Code Quality table, a design document, not to the code. **Removed:** D8's "have `implement-phase.js` shell out per task" alternative and TR1's shell half — a workflow script has no shell and no filesystem access, so the alternative was never available. **Corrected:** D7 (`pipeline()` exists but applies uniform stages to items and cannot express heterogeneous dependency chains — sequential `await` is now the decision, not a fallback); §3.4 (the workflow cannot read `task-delegation.md` from disk — the command assembles the prompt and passes it in `args`); §3.1's phase-heading rule (real TRDs use `### 4.2 Phase 1:`, `### 4.1 Phase 1 —` and `### 5.1 Phase 1 —`); ITR-B001's acceptance criterion (its own grounding shows `discipline-judgment.md`'s five-column schema would warn on every row); §7.1 R8 and ITR-T001's `vendoring.test.sh` premise (that file contains zero occurrences of `packages/core`, performs no `diff`/`cmp`, and is skipped by default); the `notify-on-complete.test.sh` hard-coded command array count (**seven** loops, not five). **Added:** ITR-B014 (`copy_libs()` in `scaffold-project.sh` — `packages/core/lib/` had no delivery path into a scaffolded `.claude/`), ITR-B015 (smoke-fixture rework in Phase 2 — the fixture's bullet-list Master Task List parses to zero tasks and its hard `verify-app` assertion goes red at ITR-B005), AC-N2 to ITR-T002, G1's five-artifact metric to ITR-T001, and `G4` / `G5` / `AC-N1` / `AC-N8` / `AC-N9` references that had no `Serves` entry. **STUCK:** none. | @technical-architect |

---

## 1. Overview

### 1.1 Technical Summary

This is a consumer-side rework of a producer/consumer pair whose producer was rebuilt without
it. Three things change, and they are separable only in the sense that they land in
dependency order:

1. **Deterministic operations move out of prose and into `packages/core/lib/`** — a TRD
   parser, a task graph, and an `implement.json` state machine, unit-tested with Jest. Today
   `packages/core/lib/` does not exist (verified: `packages/core/` contains `agents commands
   contracts hooks scripts templates workflows`), and dependency resolution, eligibility,
   parallel sets and file-ownership conflicts are re-derived from TRD prose by the model on
   every invocation.
2. **The execution model splits along the durability line.** `/implement-trd` stays a command
   and keeps everything that must survive a session boundary — TRD parsing, phase sequencing,
   `implement.json`, `--resume`. A single parameterized workflow, `implement-phase.js`, runs
   **one phase** and writes no durable state. This is the F16 decision, and its constraint is
   that workflows cannot resume across sessions.
3. **The per-task loop collapses.** `IMPLEMENT → VERIFY → SIMPLIFY → VERIFY → REVIEW` becomes
   `IMPLEMENT → deterministic checks → [DEBUG on fail]`. `verify-app`, `code-simplifier` and
   `/code-review high` move to the phase boundary. `code-reviewer` leaves the loop entirely
   and its one distinctive job — acceptance-criteria verification — relocates to a new
   `/audit-build`.

Four smaller wiring fixes ride along because they are all edits to the same delegation
template: the evidence-marker key (`[read]` / `[ran]` / `[inferred]`), the `Replaces` deletion
instruction, `## Could Not Verify` routing, and owner-only `## Open Questions` surfacing. The
`<design_references>` extraction target — which today names a TRD "Section 10 'Reference
Documents'" that no generated TRD has — is corrected in the same file.

The shape is deliberately conservative about scope: this TRD builds three library modules, one
new workflow, one new command, two command replacements, one contract file, and edits an
existing command and one hook. It does not touch the producer (`/create-trd`) unless the
Sunstone read (ITR-P001) shows the parser cannot consume what the producer emits — a risk the
PRD names as R3 and which has its own contingency.

### 1.2 Key Technical Decisions

| ID | Decision | Choice | Serves Objective | Rationale | Alternatives Considered |
|----|----------|--------|------------------|-----------|------------------------|
| D1 | `lib/` module boundary | Three CommonJS modules under `packages/core/lib/`: `trd-parser.js`, `task-graph.js`, `implement-state.js` | AC-F1.1, G2 | The three names the source itself uses; each has a distinct input (markdown / task records / state file) and can be unit-tested in isolation, which is what the >80% bar requires | (a) One `lib/implement.js` — rejected, couples parser failures to state-machine tests and makes the coverage bar meaningless per-concern. (b) Port Sunstone's whole surface (parser, graph, phase-tracker, cross-trd-deps, 76 test files) — rejected by NG1. **Revisit** if a fourth concern appears that fits none of the three |
| D2 | Parser input contract | Parse the TRD's Master Task List tables, `Dependencies`, `Serves`, phase headings, and the `## 9. Task Grounding` blocks (incl. `Touches`, `Replaces`), plus `## Could Not Verify` and `## Open Questions`, exactly as `packages/core/contracts/trd-authoring.md` specifies them today. **No producer format change in this TRD.** | AC-F1.3, AC-F4.1, AC-F5.1, R3 | The producer contract already puts every field the graph needs in structured, parser-consumable position. Changing the producer to suit the parser would make this a two-sided change with a much larger blast radius | Demand structured task declarations (YAML front-matter per task, or a machine block) — rejected for now; it converts a parser change into a `/create-trd` + contract change. **Revisit** when ITR-P001's Sunstone read shows a specific field the markdown form cannot express unambiguously — R3's contingency covers this |
| D3 | Graph edge model | `blockedBy` edges are the **union** of (a) declared `Dependencies` and (b) `Touches`-overlap conflicts. Conflict edges are oriented by task-ID lexical order so the same TRD always yields the same graph | AC-F1.4, AC-F1.5, AC-F1.9 | AC-F1.9 requires overlapping `Touches` to serialize even when the dependency graph would permit parallelism. Making both edge kinds the same edge type means eligibility, parallel sets and cycle detection each have one code path | Keep the two edge kinds separate and intersect the parallel sets afterwards — rejected: two representations of "cannot run yet" is where the current prose-derived version already goes wrong. **Revisit** if a conflict edge ever needs a different retry semantics from a dependency edge |
| D4 | Cycle handling | Kahn's algorithm; nodes remaining after the queue drains are reported as a cycle finding with the participating task IDs, and the run stops | AC-F1.6 | AC-F1.6 asks for detection and reporting *rather than looping*. A topological sort that reports its residue gives both properties from one pass | DFS colouring to name the exact back-edge — rejected as more code for a strictly better error message; the residue set is enough to act on. **Revisit** if residue sets in practice are large enough to be unhelpful |
| D5 | Reduced cycle order, single source | `implement-state.js` exports `CYCLE_ORDER = ['implement', 'checks', 'debug', 'complete']`. `packages/core/hooks/status.js` **imports** it rather than declaring its own | AC-F7.7, AC-F7.1, R9 | `status.js:210` today hard-codes `['verify_red','implement','verify','simplify','verify_post_simplify','review','complete']` and advances `cycle_position` along it on every `SubagentStop` (manifest order 1). F7 deletes three of those stages, so the hook would advance in-progress tasks through stages that no longer exist. One exported constant makes divergence impossible | (a) Retire `status.js` outright — rejected: `cycle_position` is the durable marker `--resume` reads, and nothing else writes it on subagent completion. (b) Duplicate the constant in the hook — rejected, this is exactly R9. **Revisit** if the hook ever needs a cycle order that differs from the command's |
| D6 | Execution-model split | `/implement-trd` (command) owns TRD parsing, the graph, phase sequencing, `implement.json`, `--resume`. `implement-phase.js` (workflow) owns one phase and writes no durable state | AC-F16.1, AC-F16.2, AC-F16.5, NFR-9, G8 | Inherited verbatim from the source's 2026-08-16 execution-model decision. `resumeFromRunId` is same-session only; an implement run spans sessions | A whole-run workflow, or one workflow generated per phase — both rejected in the PRD's §8 table. **Revisit** if workflows gain cross-session resume |
| D7 | Chain composition inside a phase | `parallel()` over each eligibility wave from the graph; **sequential `await` composition** over dependency chains within the workflow script | AC-F16.3 | `parallel()` and `agent()` are the only composition primitives observed in all four existing workflow scripts (`audit-prd.js`, `audit-trd.js`, `create-prd.js`, `create-trd.js`); `pipeline()` appears nowhere in this repository. Sequential `await` is semantically identical to a pipeline over a chain, and is known to work here | Use `pipeline()` as the source names it — **conditionally preferred**: ITR-P003 probes whether the runtime exposes it, and ITR-B009 uses it if so. Sequential `await` is the fallback, not a rejection. **Revisit** at ITR-P003's result |
| D8 | Where deterministic checks run | Per task: the implementer runs the targeted check battery inside its own task and returns the verbatim result — **no additional agent is spawned**. Per phase: the command runs the full battery itself at the phase gate | AC-F7.1, AC-F7.2, AC-F16.7 | AC-F7.2's requirement is "without spawning an agent"; the implementer is the agent already doing the task, so it costs zero extra invocations. Running the phase-level battery in the command keeps a non-agent, non-workflow check on the phase boundary even if the workflow runtime has no shell primitive (unverified — see §10) | Have `implement-phase.js` shell out per task — preferred if the runtime allows it, and ITR-P003 decides. **Revisit** at ITR-P003's result |
| D9 | Per-task check battery, resolved per project | From `stack.md` + `package.json`. For **this** repo: `npx jest <paths touched>` for targeted unit tests, `npm run smoke` at the phase gate, ESLint on changed JS, ShellCheck on changed shell, Prettier `--check` on changed md/json/yaml | AC-F7.2, OQ-4 (PRD §8, resolved) | The source names only "targeted tests, typecheck and lint" and leaves the concrete commands to TRD authoring. There is no typecheck step in this repo — it has no TypeScript — so that slot is empty here rather than invented | A fixed cross-project battery — rejected; `stack.md` is per-project by design. **Revisit** when a project using this framework has a typecheck step |
| D10 | Review routing | `/code-review high` scoped to the phase diff, started **inside** `implement-phase.js` as a background subagent; one further `/code-review high` over the full branch diff started by the command at end of run | AC-F8.3, AC-F8.4, AC-F8.5, AC-F16.4, NFR-4 | Inherited from PRD F8. Phase-scoped reviews are structurally blind to cross-phase integration, which is what the end-of-run pass covers | The R1 contingency route (`claude-code-action@v1` on `synchronize`) — held in reserve, not built. Its route and secret are owner-only (NG11). **Revisit** if ITR-P002 shows `/code-review` is not model-startable here |
| D11 | `<design_references>` extraction target | Match the TRD heading **by text, loosely** — any heading containing "Design References" or "Reference Documents", anywhere in the document, including inside Appendices. Emit the element only when the match succeeds | AC-F6.1, AC-F6.2, AC-F6.3 | `trd-authoring.md` defines no "Reference Documents" section, and section numbers shift as authors renumber. A loose text match survives renumbering; the absent case is explicitly an omission, not a guess | Add a "Reference Documents" section to `trd-authoring.md` so the number is real — rejected here as a producer change outside this TRD's scope, and one that would put a section in every TRD to serve UI tasks only. **Revisit** if a project's TRDs routinely carry design references and the loose match proves unreliable — see OQ-1 |
| D12 | Contract split | The per-task implementer instruction set moves to `packages/core/contracts/task-delegation.md`; `implement-trd.md` keeps orchestration only | AC-F13.1, AC-F13.2, AC-F13.3, G6 | Direct precedent: `packages/core/contracts/{prd,trd}-authoring.md` already carry the authoring halves of `/create-prd` and `/create-trd`, and `trd-authoring.md:1–9` records the measured saving (~10.5k tokens re-cached ~17 times per run) | Leave it inline and cut length elsewhere — rejected; the re-cache cost is per-turn and the delegation template is the largest re-cached block. **Revisit** never for this file; the precedent is settled |
| D13 | Active-TRD resolution order | (1) explicit path argument, (2) branch-derived, (3) single in-progress TRD, (4) STUCK. `current.json` is removed from the chain. `active_sessions` is removed from the template and from all writes | AC-F11.1, AC-F11.2, AC-F11.3, AC-F11.4 | `cb9fcda` already untracked `current.json` and `wiggum-state.json`, and the `.gitignore` comment states this exact fallback order. `active_sessions` is `{}` in all three `implement.json` files on disk — the mechanism was designed and never used, and NG13 descopes the coordination it existed for | Keep `active_sessions` and give it a purpose — rejected under NG13. **Revisit** if cross-implementation coordination comes back into scope |
| D14 | `/audit-build` shape | Command + `packages/core/workflows/audit-build.js`, mirroring `audit-trd.js`: index → `parallel()` verifiers → reconcile. Three verifiers: verification (code ↔ TRD tasks), validation (code ↔ PRD requirements), traceability (requirement → implementation → test) | AC-F10.1, AC-F10.2, AC-F10.3, AC-F10.4, AC-F10.5, AC-F9.2, G7 | The PRD asks for "the same proven shape as `audit-prd`/`audit-trd`". Reusing that shape means reusing its `required()` guard, its dead-verifier accounting, and its Could Not Verify rewrite, all of which already exist | One monolithic verifier agent — rejected: `audit-trd.js` explicitly reports partial coverage when a verifier dies, which a single agent cannot. **Revisit** never; this is a deliberate copy of a working shape |
| D15 | Team-command replacements | Two separate artifacts: `/harden-build` (verifier fan-out workflow, no teammates) and `/verify-build` (deterministic E2E gate, no agents at all) | AC-F14.1, AC-F14.2, AC-F14.3, AC-F14.5 | AC-F14.3 forbids collapsing the two jobs into one replacement. The E2E gate convenes nothing — it runs the tests | Fold the E2E gate into `/audit-build` — rejected by AC-F14.3. **Revisit** if the two are measured to always run together with no independent value |
| D16 | `code-reviewer` disposition | The agent file **stays on disk** and stays in the scaffolded agent set. Only its per-task-loop references are removed; its acceptance-criteria job relocates to `/audit-build`'s traceability verifier | AC-F9.1, AC-F9.2 | PRD F9: "The agent is **not deleted**." `validate-init.sh:125` and `validate-init.test.sh:66` both assert `code-reviewer.md` is present in a scaffolded project; keeping the file means those assertions need no change, and `agent-validation.test.js:58,498` keeps its leaf-agent entry valid | Delete the agent — rejected by F9. **Revisit** if `/audit-build` fully subsumes it and nothing invokes it for two releases |
| D17 | Vendoring | Every `packages/core/` change in this TRD is mirrored to `.claude/` in the **same task**, not in a sweep at the end | AC-F9.3, R8 | `.claude/` carries its own copies of commands, contracts, agents, hooks and workflows. A change this wide, mirrored at the end, is where drift enters; `vendoring.test.sh` catches it but only after the fact | A single terminal sync task — rejected: it makes every intermediate phase gate fail its own vendoring check. **Revisit** never |
| D18 | `lib/` build order | Parser → graph → state machine, in that order, each landing with its own unit tests and with `npm run smoke` green before the next starts | AC-F1.7, NFR-8 | The source's own instruction: "Build incrementally: parser first, verify with the smoke harness, then the graph, then state." The graph consumes parser output, so the order is also the dependency order | Build all three then verify — rejected; NFR-8 requires green *after each increment* |

### 1.3 Technology Stack

| Layer | Technology | Purpose | Notes |
|-------|------------|---------|-------|
| Deterministic library | JavaScript / Node.js 18+ | `packages/core/lib/` parser, graph, state machine | Per `stack.md`; NFR-7 |
| Unit tests | Jest ^29.7.0 | `packages/core/lib/*.test.js`, `status.test.js` | Already the project's runner (`package.json` `"test": "jest"`) |
| Workflow scripts | JavaScript (ESM, `Workflow` runtime) | `implement-phase.js`, `audit-build.js`, `harden-build.js` | Same shape as the four existing scripts in `packages/core/workflows/` |
| Commands / contracts | Markdown | `implement-trd.md`, `task-delegation.md`, `/audit-build`, `/harden-build`, `/verify-build` | Prompts only, per constitution principle 2/3 |
| Hooks | JavaScript / Node.js | `status.js` rewrite | `hookType: "command"`, `SubagentStop` order 1 |
| Structure / integration tests | BATS ^1.9.0 | banner assertions, vendoring, structure greps | `test/integration/tests/` |
| Behavioural smoke | Bash | `npm run smoke` → `test/smoke/run-smoke.sh` | Seven scenarios incl. `implement-one-task.sh` |
| Shell lint | ShellCheck | changed shell in the check battery | Named in `stack.md` Code Quality |
| JS lint / format | ESLint, Prettier | changed JS / md / json / yaml | Named in `stack.md` Code Quality |

No new runtime dependency is introduced. No database, no service, no network call on the
primary path.

### 1.4 Integration Points

| System | Type | Direction | Notes |
|--------|------|-----------|-------|
| `/create-trd` + `/audit-trd` (producer) | Markdown artifact | In | Supplies Master Task List, `Serves`, `Dependencies`, Task Grounding (`Touches`, `Replaces`), `## Could Not Verify`, `## Open Questions`. **Read-only in this TRD** — D2 changes nothing on the producer side |
| `implement.json` | JSON state file | Both | Written by the command (D6) and by `status.js` (D5); read by `--resume` |
| `packages/core/hooks/status.js` | Hook, `SubagentStop` order 1 | Both | Imports `CYCLE_ORDER` from `implement-state.js` after D5 |
| `dispatch-ledger.js` | Hook, `SubagentStart`/`SubagentStop` | Out | Supplies the evidence for AC-F7.6, AC-F8.4, AC-F14.5, AC-N4, AC-N6 |
| `/code-review` (built-in skill) | Slash command / subagent | Out | Local, plan-billed tier only; `high` effort; never `ultra` (AC-F8.7) |
| `git` | CLI | Both | Branch derivation (D13), phase-diff scoping (D10), checkpoint commits |
| `.claude/` vendored tree | File mirror | Out | D17; asserted by `vendoring.test.sh` |
| `Sunstone-Partners/ensemble` | Git clone, read-only | In | Evidence source for ITR-P001 only. Not on this machine; must be cloned fresh |

---

## 2. System Architecture

### 2.1 Architecture Overview

```mermaid
graph TB
    subgraph Producer["Producer — unchanged by this TRD"]
        TRD["TRD markdown<br/>Master Task List, Serves, Dependencies<br/>Task Grounding (Touches, Replaces)<br/>Could Not Verify, Open Questions"]
    end

    subgraph Lib["packages/core/lib/ — NEW (D1)"]
        PARSE["trd-parser.js<br/>markdown → task records,<br/>phases, grounding, CNV, Open Qs"]
        GRAPH["task-graph.js<br/>blockedBy = deps ∪ Touches-overlap<br/>eligibility waves, cycles, critical path"]
        STATE["implement-state.js<br/>implement.json transitions,<br/>CYCLE_ORDER, retries, checkpoints"]
        PARSE --> GRAPH
    end

    subgraph Cmd["/implement-trd — COMMAND (durable, cross-session)"]
        RESOLVE["Active-TRD resolution<br/>arg → branch → single-in-progress (D13)"]
        SEQ["Phase sequencing<br/>implement.json, --resume<br/>phase-gate check battery (D8)"]
        ENDREV["End-of-run /code-review high<br/>FULL branch diff (D10)"]
    end

    subgraph WF["implement-phase.js — WORKFLOW (one phase, same-session)"]
        WAVE["parallel() over eligibility waves<br/>sequential await over chains (D7)"]
        DELEG["task-delegation.md contract (D12)<br/>evidence-marker key · Replaces deletion<br/>Could Not Verify · owner-only Open Qs"]
        GATE["Phase gate:<br/>verify-app on ACs · code-simplifier<br/>/code-review high on PHASE DIFF (D10)"]
        WAVE --> DELEG --> GATE
    end

    HOOK["hooks/status.js<br/>imports CYCLE_ORDER (D5)"]
    AB["/audit-build — NEW (D14)<br/>verification · validation · traceability"]
    HB["/harden-build (D15)<br/>verifier fan-out, no team"]
    VB["/verify-build (D15)<br/>deterministic E2E gate, no agents"]

    TRD --> PARSE
    TRD --> DELEG
    GRAPH -->|blockedBy edges,<br/>Touches partition| SEQ
    STATE --> SEQ
    STATE --> HOOK
    RESOLVE --> SEQ
    SEQ -->|"Workflow(implement-phase,<br/>{trd, phase, tasks, project})"| WAVE
    GATE -->|phase result only| SEQ
    SEQ --> ENDREV --> AB
    AB --> HB
    AB --> VB
```

### 2.2 Component Architecture

#### 2.2.1 `packages/core/lib/trd-parser.js`

**Responsibility**: Turn a TRD markdown file into structured records. Task rows (ID,
description, `Serves`, `Skills`, `Dependencies`, acceptance criteria, `[LIVE]` marker), phase
assignment from the `### 4.N Phase N:` headings, per-task grounding blocks from `## 9. Task
Grounding` (including `Touches` and `Replaces`), and the two document-level sections
`## Could Not Verify` and `## Open Questions` — both matched by loose heading text, because
authors number them into the document's own scheme.

**Interfaces**: `parseTrd(markdown, { path }) → { tasks, phases, grounding, couldNotVerify, openQuestions, warnings }`

**Dependencies**: none (pure function over a string).

#### 2.2.2 `packages/core/lib/task-graph.js`

**Responsibility**: Build the `blockedBy` graph, compute eligibility waves and the critical
path, detect cycles, and emit the file-ownership partition.

**Interfaces**: `buildGraph(tasks, grounding) → { nodes, edges, waves, criticalPath, cycles, partition }`

**Dependencies**: `trd-parser.js` output shape only — it takes records, not markdown, so it is
testable without a TRD fixture.

#### 2.2.3 `packages/core/lib/implement-state.js`

**Responsibility**: Own `implement.json`. Legal transitions, `cycle_position` advancement along
the exported `CYCLE_ORDER`, retry counting, checkpoint records, and atomic write
(temp file + rename, matching the pattern `status.js` already uses).

**Interfaces**: `CYCLE_ORDER`, `advance(state, taskId)`, `recordResult(state, taskId, result)`,
`checkpoint(state, phase)`, `load(path)`, `save(path, state)`

**Dependencies**: none. **Consumers**: `/implement-trd`, `packages/core/hooks/status.js` (D5).

#### 2.2.4 `packages/core/workflows/implement-phase.js`

**Responsibility**: Execute exactly one phase. Fan out over the eligibility waves supplied in
`args.tasks`, compose chains sequentially, then run the phase gate. **Writes no durable state**
(NFR-9) — it returns a phase result and nothing else.

**Interfaces**: `Workflow({ name: "implement-phase", args: { trd, phase, tasks, project } })`

**Dependencies**: `task-graph.js` output (via the command, as `args.tasks`);
`packages/core/contracts/task-delegation.md` for the per-task prompt.

#### 2.2.5 `packages/core/contracts/task-delegation.md`

**Responsibility**: The complete per-task instruction set handed to an implementer. Carries the
evidence-marker key, the `Replaces` deletion instruction, the `Could Not Verify` element, the
owner-only `Open Questions` element, scope discipline, and the deliverables list.

**Dependencies**: none — it is a prompt. **Consumers**: `implement-phase.js` only.

#### 2.2.6 `packages/core/hooks/status.js` (rewritten)

**Responsibility**: Unchanged in kind — advance `cycle_position` for the single in-progress task
on `SubagentStop`. Changed in substance: `CYCLE_ORDER` is imported from `implement-state.js`
rather than declared locally, so it cannot advance a task through a stage the command deleted.

### 2.3 Data Flow — one phase

```mermaid
sequenceDiagram
    participant U as User
    participant C as /implement-trd (command)
    participant L as packages/core/lib/
    participant W as implement-phase.js
    participant I as implementer subagent
    participant R as /code-review high (bg)
    participant S as status.js hook

    U->>C: /implement-trd [--resume]
    C->>C: resolve active TRD: arg → branch → single-in-progress (D13)
    C->>L: parseTrd(markdown)
    L-->>C: tasks, grounding, Could Not Verify, Open Questions
    C->>L: buildGraph(tasks, grounding)
    L-->>C: waves, partition, cycles
    alt cycles non-empty
        C-->>U: COMMAND STUCK — cycle in task graph, participants listed
    end
    C->>C: surface owner-only Open Questions covering this phase (NFR-2)
    C->>L: implement-state.save(phase started)
    C->>W: Workflow(implement-phase, {trd, phase, tasks, project})

    loop each eligibility wave
        W->>I: parallel() — task prompt from task-delegation.md
        I->>I: implement + run targeted check battery (D8)
        I-->>W: status, files_changed, check output
        I-->>S: SubagentStop
        S->>S: advance cycle_position via imported CYCLE_ORDER (D5)
        alt checks failed
            W->>I: app-debugger on the failing task
        end
    end

    W->>W: phase gate — verify-app on ACs, code-simplifier
    W->>R: /code-review high, scoped to PHASE DIFF, background (D10)
    R-->>W: findings
    W-->>C: PHASE RESULT ONLY (AC-F16.7)
    C->>C: run full check battery at the gate (D8)
    C->>L: implement-state.checkpoint(phase)
    C->>C: commit checkpoint
    C-->>U: [STATUS] PHASE n/m COMPLETE
```

### 2.4 State Management

`implement.json` remains the single durable coordination point, owned by the command (NFR-9).
Three changes:

- `cycle_position` moves onto the reduced `CYCLE_ORDER` (D5). The `simplify`,
  `verify_post_simplify` and `review` positions cease to exist per task; the work they named
  now happens once per phase and is recorded in the phase checkpoint, not the task record.
- `active_sessions` is removed from `packages/core/templates/trd-state/implement.json.template`
  and from every write path (D13). It is `{}` in all three on-disk state files and NG13
  descopes the coordination it existed for.
- `current.json` leaves the active-TRD resolution chain entirely (D13). It is already
  gitignored (`cb9fcda`), so a fresh clone or a new worktree has none, and the command must
  tolerate its absence.

Phase-level retry is whole-phase (AC-F16.6): the checkpoint records the phase boundary, and a
retried phase re-runs its whole task set. Per-task retry counting stays in the task record and
is unchanged in kind.

---

## 3. Technical Specifications

### 3.1 `trd-parser.js`

**Purpose**: Deterministic markdown → records, with no interpretation.

**Interface**:

```javascript
/**
 * @param {string} markdown  full TRD text
 * @param {{path?: string}} opts
 * @returns {ParseResult}
 */
function parseTrd(markdown, opts = {}) {}

/**
 * @typedef {Object} Task
 * @property {string}   id            e.g. "ITR-B002"
 * @property {string}   description
 * @property {string[]} serves        objective / decision IDs
 * @property {string[]} skills
 * @property {string[]} dependencies  task IDs, [] when the cell reads "None"
 * @property {string}   acceptance
 * @property {number}   phase
 * @property {boolean}  live          true when the description carries [LIVE]
 *
 * @typedef {Object} Grounding
 * @property {string[]} touches       MANDATORY per trd-authoring.md
 * @property {string[]} reuse
 * @property {string[]} replaces
 * @property {string[]} follow
 * @property {string[]} careful
 *
 * @typedef {Object} ParseResult
 * @property {Task[]}                    tasks
 * @property {Object<number,string>}     phases          phase number → phase name
 * @property {Object<string,Grounding>}  grounding       task id → block
 * @property {{claim:string, check:string}[]}  couldNotVerify
 * @property {{id:string, question:string, assumed:string, ownerOnly:boolean}[]} openQuestions
 * @property {string[]}                  warnings
 */
```

**Behavior**:
- Heading matching for `## Could Not Verify` and `## Open Questions` is **loose**: any heading
  whose text contains the phrase, at any level, with or without a leading number. `audit-trd.js`
  already documents why (authors number these into the document's own scheme).
- A task with no grounding block yields no `grounding[id]` entry — absence is meaningful and is
  not filled with an empty object.
- `ownerOnly` is set when the Open Question row's text marks it as such (the PRD's own
  convention: an explicit "owner-only" / "owner ruling" marker). A question with no such marker
  is not owner-only and is not surfaced by F5.

**Error Handling**:
- No Master Task List section → throw with the file path and the heading it looked for. This is
  the existing validation `implement-trd.md` performs in prose; it moves here.
- A `Dependencies` cell naming a task ID that does not exist → recorded in `warnings`, not
  thrown. The graph decides whether it is fatal.
- Malformed table row (wrong column count) → recorded in `warnings` with the line number; the
  row is skipped rather than half-parsed.

### 3.2 `task-graph.js`

**Purpose**: One graph, two edge sources, deterministic output.

**Interface**:

```javascript
/**
 * @param {Task[]} tasks
 * @param {Object<string,Grounding>} grounding
 * @returns {GraphResult}
 */
function buildGraph(tasks, grounding) {}

/**
 * @typedef {Object} Edge
 * @property {string} from        blocking task id
 * @property {string} to          blocked task id
 * @property {'dependency'|'file-conflict'} kind
 * @property {string} [file]      the overlapping path, for kind === 'file-conflict'
 *
 * @typedef {Object} GraphResult
 * @property {string[]}   nodes
 * @property {Edge[]}     edges
 * @property {string[][]} waves          eligibility waves; waves[0] runs first
 * @property {string[]}   criticalPath
 * @property {string[][]} cycles         empty when acyclic
 * @property {Object<string,string[]>} partition   file path → task ids that touch it
 */
```

**Behavior**:
- `blockedBy(t)` = declared `Dependencies` ∪ `{ u : Touches(u) ∩ Touches(t) ≠ ∅ ∧ u <ᴵᴰ t }`.
  Orienting the conflict edge by lexical task ID (D3) is what makes the graph identical across
  runs of the same TRD.
- A task with **no** grounding block, and therefore no `Touches`, contributes no conflict edges
  and is emitted in `warnings` by the caller's own check — `Touches` is the one mandatory
  grounding field, so its absence is a producer defect worth surfacing, not something to
  silently tolerate.
- `waves` is the Kahn levelisation: every task in `waves[i]` has all blockers in
  `waves[0..i-1]`. `implement-phase.js` maps one wave to one `parallel()` call (D7).

**Error Handling**:
- Cycles: `cycles` is non-empty and `waves` covers only the acyclic prefix. The command treats
  a non-empty `cycles` as STUCK (AC-F1.6) and names the participating task IDs.
- A dependency on an unknown task ID is dropped from the graph and reported; it must not make
  a task permanently ineligible and silently stall the run.

### 3.3 `implement-state.js`

**Purpose**: The only writer of `implement.json` semantics.

**Interface**:

```javascript
const CYCLE_ORDER = ['implement', 'checks', 'debug', 'complete'];

function load(path) {}
function save(path, state) {}          // atomic: temp file + rename
function advance(state, taskId) {}     // returns {state, from, to} or null when not advanceable
function recordResult(state, taskId, {status, filesChanged, error}) {}
function checkpoint(state, phase, {commit, review}) {}
```

**Behavior**:
- `advance()` preserves the existing safety property in `status.js`: it advances only when
  **exactly one** task is `in_progress`, and skips when a task signals active debugging.
- `debug` is a position on the path, not a branch off it: a task that fails its checks moves
  `checks → debug`, and a successful debug moves `debug → complete`. This keeps `CYCLE_ORDER`
  a total order, which is what makes `status.js`'s index-plus-one advance correct.
- `save()` is atomic. Two writers exist by construction — the command and the `SubagentStop`
  hook — and this is already the pattern `status.js` uses.

**Error Handling**:
- Unknown `cycle_position` (e.g. a state file written before this change, carrying `simplify`)
  → `advance()` returns null and records a migration warning rather than throwing. A
  half-migrated state file must not wedge `--resume`.

### 3.4 `implement-phase.js`

**Purpose**: One phase, no durable state.

**Interface**:

```javascript
// args
{
  trd:     string,   // path to the TRD
  phase:   number,   // 1-based phase number
  tasks:   { waves: string[][], records: Task[], grounding: Record<string,Grounding>,
             couldNotVerify: CNV[], openQuestions: OQ[] },
  project: string    // project root; '' means the repo the workflow runs in
}

// return
{
  phase:        number,
  tasks:        { id: string, status: 'success'|'failed', filesChanged: string[], error?: string }[],
  gate:         { verifyApp: 'pass'|'fail', simplify: 'changed'|'no-change', review: {findings: number} },
  status:       'complete'|'failed'
}
```

**Behavior**:
- For each wave: `await parallel(wave.map(id => () => agent(delegationPrompt(id), {...})))`.
  Chains between waves are the sequential `await` (D7).
- The delegation prompt is assembled from `task-delegation.md` plus, per task: the grounding
  block verbatim, the `Could Not Verify` rows whose text names a file or task this task touches
  (AC-F4.1), and — when present — the owner-only Open Question covering it.
- The phase gate runs `verify-app` against the phase's acceptance criteria, then
  `code-simplifier` across the phase's changed files, then starts `/code-review high` scoped to
  the phase diff as a background subagent.
- **The return value is the phase result.** Per-task agent output is consumed inside the
  workflow and does not appear in the return (AC-F16.7).

**Error Handling**:
- A task agent that dies returns null (documented `agent()` behaviour, and the reason
  `create-trd.js` carries a `required()` guard). The workflow records it as `failed` with an
  explicit "agent returned nothing" error rather than dereferencing it.
- A failed phase returns `status: 'failed'` with per-task detail; the command decides whether to
  retry the phase whole (AC-F16.6). The workflow never retries itself — retry policy is durable
  state and belongs to the command.

### 3.5 `task-delegation.md` — the elements this TRD adds

**Purpose**: What an implementer reads. Four new elements, one corrected one.

```xml
<grounding>
  <evidence_key>
    <!-- F2. NEW. -->
    [ran]      Someone executed this and read the output. Trust it most.
    [read]     Someone opened the file and verified the claim. Trust it.
    [inferred] Deduced, not checked. VERIFY IT BEFORE YOU RELY ON IT.
               If it turns out to be wrong, say so in your deliverables —
               the next task's grounding is probably wrong the same way.
  </evidence_key>
  <touches>...</touches>
  <reuse>...</reuse>
  <replaces>
    <!-- F3. Present today at implement-trd.md:926; must survive the split. -->
    {what this makes unreachable} — DELETE it and its tests in the same change.
  </replaces>
  <follow>...</follow>
  <careful>...</careful>
</grounding>

<unverified_claims>
  <!-- F4. NEW. Emitted ONLY when the TRD's Could Not Verify names something
       this task touches. Absence is meaningful — no empty element. -->
  <claim check="{how the author would have checked it}">{claim verbatim}</claim>
  <instruction>
    This task rests on a claim nobody verified. Check it first. If it is false,
    stop and report — do not build on it.
  </instruction>
</unverified_claims>

<open_question>
  <!-- F5. NEW. Owner-only, unresolved, and covering this task. Informational:
       state the assumption and proceed. Do NOT ask (autonomy.md, NFR-2). -->
  <id>{OQ id}</id>
  <question>{verbatim}</question>
  <assumed>{what the TRD assumed}</assumed>
</open_question>

<ui_context>
  <!-- F6. CORRECTED. Heading matched by TEXT ("Design References" /
       "Reference Documents"), not by section number. Omit the whole
       element when no such heading exists (AC-F6.3). -->
  <design_references>{paths from the matched section}</design_references>
</ui_context>
```

**Behavior**:
- `<unverified_claims>` and `<open_question>` are both omitted entirely when nothing applies.
  AC-F4.3 makes this explicit: absence carries information.
- The owner-only Open Question is **surfaced, not asked**. It is written into the delegation and
  into the DISPATCHED banner. Turning it into an `AskUserQuestion` would be exactly the
  defensive-checkpoint anti-pattern `autonomy.md` forbids (NFR-2, AC-F5.3), unless it
  independently meets one of that rule's four cases.

**Error Handling**:
- A TRD with no Task Grounding section at all → `<grounding>` is omitted wholly, as today. The
  evidence key is not emitted on its own; a key with nothing to key is noise.

### 3.6 Active-TRD resolution (D13)

**Behavior**, in order, stopping at the first hit:

1. **Explicit path argument** — `$ARGUMENTS` names a TRD path that exists.
2. **Branch-derived** — parse the current branch against the two documented patterns
   (`<issue-id>-<session>`, `feature/<trd-name>/<session>`) and match the derived slug against
   `docs/TRD/*.md` and `.trd-state/*/`.
3. **Single in-progress** — exactly one `.trd-state/*/implement.json` with uncompleted tasks.
4. **STUCK** — emit `COMMAND STUCK` naming the branch and the candidates found. This is a
   legitimate `AskUserQuestion` case under `autonomy.md` case 2 (information that cannot be
   derived), but STUCK with the candidates listed is the cheaper answer and is preferred.

`current.json` appears nowhere in this chain, and its absence is never an error.

---

## 4. Master Task List

### 4.1 Task ID Convention

`ITR-[CATEGORY][SEQ]` — `P` infrastructure/probe, `B` backend (library, workflow, command,
hook), `T` testing, `D` documentation/contract. `ITR` is unused elsewhere in `docs/TRD/`
(existing prefixes: `DISC`, `NOTIFY`, `RUNTIME`, `TRD`, `WTSH`).

### 4.2 Phase 1: Evidence and the deterministic library

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| ITR-P001 | Clone `Sunstone-Partners/ensemble` fresh (read-only) and read `trd-parser.js`, `trd-graph.js`, `cross-trd-deps.js` against the source's three named questions. Record adoption decisions with per-decision evidence into `docs/modernization/runs/item8/sunstone-read.md` | AC-F1.8, D2, R3 | | None | A written record naming, per module, what is adopted and what is not, each with a file:line citation from the clone; an explicit verdict on R3 — whether the parser needs a TRD format `/create-trd` does not produce; the clone is never modified |
| ITR-P002 | Empirically verify the in-loop local `/code-review` path: that a model can start `/code-review high`, that it fans out as background subagents, and that no `ultra` tier is reachable by accident. Record the dispatch-ledger evidence | AC-F8.6, AC-F8.7, D10, R1 | | None | A recorded run showing `/code-review high` started from within a session, with the resulting agents visible in `.trd-state/*/dispatch.jsonl`; a stated verdict; if it fails, R1's contingency is escalated before ITR-B009 starts |
| ITR-P003 | Probe the `Workflow` runtime's primitive surface: whether `pipeline()` exists, whether a workflow script can run shell/`Bash`, and whether it can start a background subagent. Record findings alongside ITR-P001's | D7, D8, D10, TR1 | | None | A written finding per primitive with the probe that established it; D7's and D8's chosen branch is fixed by this result and recorded before ITR-B009 begins |
| ITR-B001 | Build `packages/core/lib/trd-parser.js` per §3.1 — tasks, phases, grounding (incl. `Touches`, `Replaces`), and loose-matched `## Could Not Verify` / `## Open Questions` | AC-F1.1, AC-F4.1, AC-F5.1, AC-N7, NFR-7, D2, D18 | `jest` | ITR-P001 | Parses `docs/TRD/discipline-judgment.md` and this TRD without warnings other than genuine defects; runs on Node 18+ under Jest ^29 with no new runtime dependency; ships its own Jest unit tests incl. malformed-table and missing-section cases; `npm run smoke` green; module + tests mirrored to `.claude/` |
| ITR-B002 | Build `packages/core/lib/task-graph.js` per §3.2 — union edge model, eligibility waves, critical path, Kahn cycle detection, `Touches` partition | AC-F1.4, AC-F1.5, AC-F1.6, AC-F1.9, D3, D4, D18 | `jest` | ITR-B001 | Two tasks with overlapping `Touches` are serialized even with no declared dependency; a cyclic fixture yields non-empty `cycles` and terminates; identical input yields identical `waves` across runs; ships its own Jest unit tests; `npm run smoke` green; mirrored to `.claude/` |
| ITR-B003 | Build `packages/core/lib/implement-state.js` per §3.3 — exported `CYCLE_ORDER`, transitions, retry counting, checkpoints, atomic save | AC-F1.1, D5, D18 | `jest` | ITR-B001 | `CYCLE_ORDER` is `['implement','checks','debug','complete']` and is the module's only declaration of it; a state file carrying a retired position (`simplify`) does not throw; concurrent-write safety by temp-file+rename; ships its own Jest unit tests; `npm run smoke` green; mirrored to `.claude/` |

### 4.3 Phase 2: Consumer rework

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| ITR-B004 | Rewrite `packages/core/hooks/status.js` to import `CYCLE_ORDER` from `implement-state.js`; delete the local declaration at line 210 and the `simplify` / `verify_post_simplify` / `review` positions; update `status.test.js` to assert the import rather than restate the order | AC-F7.7, D5, R9 | `jest` | ITR-B003 | `grep -c "verify_post_simplify" packages/core/hooks/status.js` returns 0; a `SubagentStop` against a state file at `checks` advances to `debug` or `complete`, never to a deleted stage; existing `status.test.js` cases for the single-in-progress and active-debugging guards still pass; mirrored to `.claude/` |
| ITR-D001 | Create `packages/core/contracts/task-delegation.md` carrying the per-task implementer instruction set moved out of `implement-trd.md` Appendix A, with the four new elements and one correction from §3.5 | AC-F2.1, AC-F2.2, AC-F2.3, AC-F2.4, AC-F3.1, AC-F3.2, AC-F4.2, AC-F4.3, AC-F5.3, AC-F6.1, AC-F6.3, AC-F13.1, D11, D12 | | None | All three evidence markers defined; `[inferred]` carries a verify-before-relying instruction; `[ran]` named most trustworthy; the `<replaces>` deletion instruction present verbatim; `<unverified_claims>` and `<open_question>` documented as omitted-when-empty; `<design_references>` matched by heading text with no section number anywhere in the file; mirrored to `.claude/` |
| ITR-B005 | Rework `packages/core/commands/implement-trd.md`: per-task cycle becomes IMPLEMENT → checks → [DEBUG]; call the `lib/` modules instead of describing them; delegate one phase per `Workflow` call; run the phase-gate check battery (D9) in the command itself; move the delegation template out to `task-delegation.md`; retain orchestration only; keep DISPATCHED / RESUMED / COMMAND COMPLETE banners | AC-F1.3, AC-F7.1, AC-F7.2, AC-F7.3, AC-F7.4, AC-F7.5, AC-F13.2, AC-F13.3, AC-F16.1, NFR-3, D6, D9, D12 | | ITR-B002, ITR-B003, ITR-B004, ITR-D001 | `verify-app`, `code-simplifier` and `code-reviewer` appear nowhere in the per-task loop; the phase-gate battery (targeted Jest, `npm run smoke`, ESLint, ShellCheck, Prettier `--check`) runs without spawning an agent; the file remains a command (YAML frontmatter, not a `.js` workflow); `wc -l` shows 400–600 lines lost from the 1466-line baseline; banners present and COMMAND COMPLETE is the last line; mirrored to `.claude/` |
| ITR-B006 | Implement branch-derived active-TRD resolution per §3.6 in `implement-trd.md`; remove all three `current.json` reads; remove `active_sessions` from `packages/core/templates/trd-state/implement.json.template` and from every write path | AC-F11.1, AC-F11.2, AC-F11.3, AC-F11.4, D13 | | ITR-B003 | `grep -c "current.json" packages/core/commands/implement-trd.md` returns 0; a run on a branch matching either documented pattern resolves without `current.json` present; an explicit path argument overrides; `active_sessions` absent from the template; mirrored to `.claude/` |
| ITR-B007 | Route the parsed `## Could Not Verify` rows and owner-only unresolved `## Open Questions` to the tasks they touch, and surface a covered task's Open Question in the DISPATCHED banner before dispatch — informationally, without an `AskUserQuestion` | AC-F4.1, AC-F5.1, AC-F5.2, NFR-2 | | ITR-B001, ITR-B005, ITR-D001 | A task whose grounding names a file cited in a Could Not Verify row receives that row; a task with no relevant rows receives no `<unverified_claims>` element; the Open Question appears in the banner before the dispatch that covers it; no `AskUserQuestion` outside `autonomy.md`'s four cases |
| ITR-B008 | Build `packages/core/workflows/implement-phase.js` per §3.4 — parameterized by `{trd, phase, tasks, project}`, `parallel()` over waves, chain composition per ITR-P003's verdict, phase gate with `verify-app` + `code-simplifier` + background `/code-review high` on the phase diff, returning a phase result and writing no durable state | AC-F7.3, AC-F7.4, AC-F8.3, AC-F8.4, AC-F16.2, AC-F16.3, AC-F16.4, AC-F16.5, AC-F16.7, NFR-4, NFR-9, D6, D7, D10 | | ITR-P002, ITR-P003, ITR-B002, ITR-D001 | Exactly one such script exists and is never generated per phase; the review call names the phase diff, not the branch; no `fs` write to `.trd-state/` anywhere in the file; the return value contains no per-task agent output; mirrored to `.claude/` |
| ITR-B009 | Add the end-of-run full-branch `/code-review high` to `implement-trd.md`, after the last phase and before PR creation (today at `implement-trd.md:719`); assert no `ultra` tier is invoked anywhere in the reworked surface | AC-F8.5, AC-F8.7, D10 | | ITR-B005, ITR-P002 | One `/code-review high` over `main...<branch>` at end of run; `grep -rn "ultra" ` over the reworked command, contract and workflow returns nothing invoking that tier; mirrored to `.claude/` |
| ITR-B010 | Remove `code-reviewer` from the per-task loop across all ten referencing files under `packages/core/`, keeping the agent itself on disk; reconcile `scripts/validate-init.sh` and `scripts/validate-init.test.sh` so scaffolding neither asserts a stale expectation nor drops the agent | AC-F9.1, AC-F9.3, D16, D17, R8 | | ITR-B005 | All ten files assessed with a per-file verdict; `code-reviewer.md` still ships and `validate-init.sh:125` still passes; `harden-trd-team.md` and `fix-issue.md` no longer place it in a per-task loop; `vendoring.test.sh` green |

### 4.4 Phase 3: `/audit-build` and the team-command replacements

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| ITR-B011 | Build `/audit-build` — `packages/core/commands/audit-build.md` plus `packages/core/workflows/audit-build.js` on the `audit-trd.js` shape (index → `parallel()` verifiers → reconcile), with verification, validation and traceability verifiers | AC-F10.1, AC-F10.2, AC-F10.3, AC-F10.4, AC-F10.5, AC-F9.2, G7, D14 | | ITR-B005 | Follows index → verifiers → reconcile; reports per requirement whether an implementation exists and whether a test proving it exists; a requirement with code and no test is reported as a **gap**, not a pass; a dead verifier is reported as incomplete coverage, matching `audit-trd.js`; mirrored to `.claude/` |
| ITR-B012 | Replace `harden-trd-team.md` (765 lines) with `/harden-build` — the adversarial pass as a verifier fan-out workflow, convening no teammate | AC-F14.1, AC-F14.3, AC-F14.4, AC-F14.5, D15 | | ITR-B011 | No `Agent({name:...})` teammate spawn anywhere in the replacement; the adversarial pass runs as `parallel()` verifiers; the original command is removed or reduced to a pointer; mirrored to `.claude/` |
| ITR-B013 | Replace `verify-trd-team.md` (842 lines) with `/verify-build` — a deterministic E2E gate that runs the tests and convenes no agent to interpret them | AC-F14.2, AC-F14.3, AC-F14.4, AC-F14.5, D15 | | ITR-B011 | The gate runs the project's E2E command and reports its exit status; no `Agent` invocation in the gate path; the original command is removed or reduced to a pointer; mirrored to `.claude/` |

### 4.5 Phase 4: Cross-seam verification and measurement

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| ITR-T001 | Structure-test battery over the reworked surface, as BATS in `test/integration/tests/` — the grep-shaped assertions that no single implementation task owns because they span the command, the contract and the workflow | AC-F2.4, AC-F6.2, AC-F7.5, AC-F9.1, AC-N3, AC-F9.3 | | ITR-B005, ITR-D001, ITR-B008, ITR-B010 | `grep -c "\[inferred\]"` over the delegation contract > 0; `grep -n "Section 10"` over `implement-trd.md` returns nothing; `code-reviewer` absent from the per-task loop; DISPATCHED / RESUMED / COMMAND COMPLETE banners asserted, COMMAND COMPLETE last; `vendoring.test.sh` covers every file this TRD adds |
| ITR-T002 | `[LIVE]` end-to-end run of the reworked `/implement-trd` against the `implement-one-task` smoke fixture extended to a multi-task, multi-phase TRD; measure agent invocations per task from `dispatch.jsonl` against the ~1 target, confirm only phase results reach orchestrator context, and confirm a task carrying a `Replaces` line has the named code and its tests deleted in the same change | AC-F3.3, AC-F7.6, AC-F16.6, AC-F16.7, AC-N4, AC-N5, AC-N6, G3, G8, R2 | | ITR-B008, ITR-B009, ITR-B010 | A real run completes with a COMMAND COMPLETE banner; invocations per task counted from the ledger and reported against ~1; per-phase review present as a background subagent; no task-tool call from a subagent; no `Agent` invocation from an implementer; a deliberately failed phase is retried whole from `implement.json`; the fixture's `Replaces` target is absent from the tree after the run |
| ITR-T003 | Observe the next real `/create-trd` run for standalone `Unit:`-prefixed tasks and for the runnable-phase property; report whether the already-applied contract rule takes effect | AC-F15.1, AC-F15.2, AC-F15.3, R2 | | None | The next generated TRD is checked and the finding recorded; if standalone unit-test tasks reappear, the failure is reported as a prompt-rule failure (R2) rather than patched with more prompt text |

**Note on unit tests.** They are acceptance criteria on ITR-B001 through ITR-B013, never tasks
of their own. ITR-T001 and ITR-T002 earn tasks because they cross seams no single
implementation task owns: ITR-T001 asserts properties spanning three files written by three
tasks, and ITR-T002 needs the whole assembled command.

---

## 5. Execution Plan

### 5.1 Phase Overview

| Phase | Focus | Prerequisites | Parallelizable Sessions |
|-------|-------|---------------|------------------------|
| 1 | Evidence probes + the deterministic `lib/` (each module ships its own unit tests) | None | 1A, 1B, 1C run in parallel; 1D is blocked by 1A |
| 2 | Consumer rework — hook, contract, command, workflow (each ships its own unit tests) | Phase 1 complete | 2A, 2B, 2C parallel after their named blockers |
| 3 | `/audit-build` and the two team-command replacements | Phase 2 complete | 3A, then 3B and 3C in parallel |
| 4 | Cross-seam structure tests + `[LIVE]` end-to-end measurement | Phase 3 complete | 4A, 4B parallel; 4C independent |

### 5.2 Session Details

#### Phase 1: Evidence and library

**Session 1A: Sunstone read**
- Tasks: ITR-P001
- Agent: @backend-implementer
- Can parallelize with: 1B, 1C

**Session 1B: Review-path probe**
- Tasks: ITR-P002
- Agent: @agent-implementer
- Can parallelize with: 1A, 1C

**Session 1C: Workflow-runtime probe**
- Tasks: ITR-P003
- Agent: @agent-implementer
- Can parallelize with: 1A, 1B

**Session 1D: The three modules**
- Tasks: ITR-B001 → ITR-B002, ITR-B003
- Agent: @backend-implementer
- Blocked by: 1A. ITR-B002 and ITR-B003 both depend only on ITR-B001 and can split once the
  parser's output shape is fixed — but they touch no common file, so the `Touches` partition
  permits it.

#### Phase 2: Consumer rework

**Session 2A: Hook and state resolution**
- Tasks: ITR-B004, ITR-B006
- Agent: @backend-implementer
- Blocked by: ITR-B003

**Session 2B: The delegation contract**
- Tasks: ITR-D001
- Agent: @agent-implementer
- Can parallelize with: 2A (touches no file 2A touches)

**Session 2C: Command and workflow**
- Tasks: ITR-B005 → ITR-B007, ITR-B008, ITR-B009, ITR-B010
- Agent: @agent-implementer
- Blocked by: 2A, 2B, and ITR-P002 / ITR-P003. ITR-B005, ITR-B007 and ITR-B009 all edit
  `implement-trd.md`, so the `Touches` partition serializes them regardless of the dependency
  graph — this is the D3 conflict edge doing its job.

#### Phase 3: New commands

**Session 3A: `/audit-build`**
- Tasks: ITR-B011
- Agent: @agent-implementer
- Blocked by: 2C

**Session 3B: `/harden-build`**
- Tasks: ITR-B012
- Agent: @agent-implementer
- Blocked by: 3A; can parallelize with 3C

**Session 3C: `/verify-build`**
- Tasks: ITR-B013
- Agent: @agent-implementer
- Blocked by: 3A; can parallelize with 3B

#### Phase 4: Verification

**Session 4A: Structure battery**
- Tasks: ITR-T001
- Agent: @verify-app
- Can parallelize with: 4B

**Session 4B: Live end-to-end measurement**
- Tasks: ITR-T002
- Agent: @verify-app
- Blocked by: Phase 3 complete

**Session 4C: Producer observation**
- Tasks: ITR-T003
- Agent: @verify-app
- Independent of everything; runs whenever the next `/create-trd` run happens

### 5.3 Parallelization Map

```mermaid
gantt
    title Execution Plan (no time scale — dependency order only)
    dateFormat X
    axisFormat %s

    section Phase 1
    1A Sunstone read      : p1a, 0, 1
    1B Review probe       : p1b, 0, 1
    1C Runtime probe      : p1c, 0, 1
    1D lib modules        : p1d, after p1a, 1

    section Phase 2
    2A Hook + state       : p2a, after p1d, 1
    2B Delegation contract: p2b, after p1d, 1
    2C Command + workflow : p2c, after p2a p2b p1b p1c, 1

    section Phase 3
    3A audit-build        : p3a, after p2c, 1
    3B harden-build       : p3b, after p3a, 1
    3C verify-build       : p3c, after p3a, 1

    section Phase 4
    4A Structure battery  : p4a, after p3b p3c, 1
    4B Live measurement   : p4b, after p3b p3c, 1
    4C Producer check     : p4c, 0, 1
```

### 5.4 Critical Path

`ITR-P001 → ITR-B001 → ITR-B002 → ITR-B005 → ITR-B008 → ITR-B011 → ITR-B012/ITR-B013 → ITR-T002`

The Sunstone read gates the parser because R3 — whether the parser needs a TRD format the
producer does not emit — is answerable only from that read, and answering it late converts a
parser task into a producer change mid-flight.

ITR-P002 and ITR-P003 are not on the critical path but they gate ITR-B008. If either comes back
negative, ITR-B008's design changes (D7/D8/D10 each name their fallback branch) — which is why
both are Phase 1 rather than "figure it out when we get there".

### 5.5 Offload Recommendations

| Task | Recommended Agent | Rationale |
|------|-------------------|-----------|
| ITR-P002, ITR-P003 | @agent-implementer | Both are probes of agent/workflow runtime behaviour, which is that agent's declared domain |
| ITR-D001, ITR-B005, ITR-B008, ITR-B011–ITR-B013 | @agent-implementer | Prompts, contracts, commands and workflow scripts are agent-behaviour artifacts, not application backend code |
| ITR-B001–ITR-B004, ITR-B006 | @backend-implementer | Plain Node modules and a hook, with Jest tests |
| ITR-T001, ITR-T002 | @verify-app | Test execution and measurement against a running command |

---

## 6. Quality Requirements

### 6.1 Testing Requirements

| Type | Coverage Target | Source | Scope |
|------|-----------------|--------|-------|
| Unit Tests | ≥ 60% | `constitution.md` Quality Gates | All JavaScript changed by this TRD **outside** `packages/core/lib/` — `status.js` and any helper it grows |
| Unit Tests (`packages/core/lib/` only) | > 80% | PRD NFR-1 / AC-F1.2, quoting SPEC.md item 7 *"Done when"*: *"Three modules exist under `packages/core/lib/` with Jest coverage above 80%"*. **This exceeds the constitution's 60% floor because the source states this specific bar for these three modules**, and because they are the only place in this change where a wrong answer is silent — a mis-derived graph produces a plausible execution order rather than an error | `trd-parser.js`, `task-graph.js`, `implement-state.js` |
| Integration Tests | ≥ 50% when applicable | `constitution.md` Quality Gates | BATS structure battery (ITR-T001) and the smoke scenarios |
| Behavioural smoke | Green after **each** of the three `lib/` increments, and at every phase gate | PRD NFR-8, quoting SPEC.md item 7 *"Done when"*: *"smoke harness still green"* | `npm run smoke` → `test/smoke/run-smoke.sh` |

**End-to-end coverage.** This feature has an exercisable path — `/implement-trd` run headlessly
against a fixture TRD — and it is a task: **ITR-T002, marked `[LIVE]`**. It extends the existing
`test/smoke/scenarios/implement-one-task.sh` canary from one task to a multi-task, multi-phase
TRD, which is the smallest fixture that can exercise a phase boundary at all.

### 6.2 Code Quality Standards

| Standard | Source |
|----------|--------|
| Prettier for Markdown, JSON, YAML; ESLint for JavaScript; ShellCheck for shell | `stack.md` Code Quality table |
| `set -euo pipefail` in BATS tests; quote all variables in shell scripts | `CLAUDE.md` Shell Script Safety |
| Atomic writes (temp file + rename) for `implement.json` | Existing pattern in `status.js`; two concurrent writers exist by construction |
| No executable code in skills or agents; commands are prompts with optional shell | `constitution.md` principles 2 and 3 |
| Subagents do not mutate the task list; no subagent nesting | `constitution.md` principle 1 (NFR-5, NFR-6) |
| DISPATCHED / RESUMED / COMMAND COMPLETE banners; COMMAND COMPLETE is the last line | `command-status.md`; `constitution.md` prohibited pattern 7 (NFR-3) |
| `AskUserQuestion` only in `autonomy.md`'s four cases | `autonomy.md`; `constitution.md` prohibited pattern 8 (NFR-2) |

### 6.3 Security Requirements

None. This feature handles no credentials, no personal data, no payments, no tenancy boundary,
and no external input — it reads markdown from the repository and writes JSON and source files
into it. The only secret anywhere near this design (`ANTHROPIC_API_KEY` /
`CLAUDE_CODE_OAUTH_TOKEN`) belongs to the R1 CI contingency, which NG11 places out of scope; if
that contingency fires, the secret decision returns to the owner and a security objective would
be authored then.

### 6.4 Performance Requirements

**No enforced latency, throughput or uptime threshold exists.** The PRD states this explicitly
(§5, closing paragraph). Three cost figures do appear in the source and are recorded here as
**targets, not enforced gates**:

| Target | Value | Source | Measured by |
|--------|-------|--------|-------------|
| Agent invocations per task | ~5 → ~1 | PRD G3, source-stated | ITR-T002, from `dispatch.jsonl` |
| Total invocations on a 43-task feature | ~215 → ~50 | PRD G3, source-stated | Not measured by this TRD — no 43-task feature exists here to run it against |
| `implement-trd.md` line reduction | 400–600 lines from the 1466-line baseline | PRD G6 / AC-F13.3, source-stated, baseline re-measured 2026-08-15 | ITR-B005, `wc -l` |

The first is a target the run reports against; the third is an acceptance criterion on ITR-B005
and therefore an enforced gate on that task. The second is unmeasurable in this repository and
is recorded so its absence is visible rather than silent.

---

## 7. Risk Assessment

### 7.1 Risks Imported from PRD

| PRD Risk ID | Risk | Technical Mitigation |
|-------------|------|---------------------|
| R1 | The in-loop `/code-review` path is not model-startable here, and F8's per-phase design has no mechanism | **ITR-P002 is a Phase 1 task and gates ITR-B008.** The design is not written against this claim until the probe returns. D10 names the fallback (route (b), `claude-code-action@v1` on `synchronize`), which is owner-gated by NG11 and therefore an escalation, not a silent substitution |
| R2 | A stated prompt rule does not produce the behaviour — F2/F3/F4/F5 are all prompt changes | Every prompt-change task is verified against a **run**, not against the file's text: ITR-T002 (dispatch ledger + session log) and ITR-T003 (next real `/create-trd`). Where a structure grep is the only available check (ITR-T001), it is labelled as checking presence, not effect |
| R3 | The parser demands a TRD format `/create-trd` does not produce, turning a parser change into a producer change | **ITR-P001 gates ITR-B001** and must return an explicit R3 verdict. D2 fixes the answer as "no producer change" *provisionally*; the read is what confirms or overturns it. The contingency — scope a matching `trd-authoring.md` + `/create-trd` change in the same item rather than weakening the parser — is inherited unchanged |
| R5 | Phases grow to 8+ tasks, the phase diff becomes unbounded, and the churn argument against per-phase review returns | This TRD's own phases are 6, 7, 3 and 3 tasks. ITR-T002 reports the phase-diff size it reviewed, so the first real data point is produced by this work rather than awaited |
| R6 | Removing `code-reviewer` from the loop drops acceptance-criteria verification, which nothing else owns until `/audit-build` exists | ITR-B010 (removal) is Phase 2 and ITR-B011 (`/audit-build`) is Phase 3 — the removal lands **before** the replacement, which is the exposed window R6 names. D16 narrows it: the agent stays on disk and can still be invoked end-of-run under the PRD's R6 contingency until ITR-B011 lands |
| R8 | The vendored `.claude/` copies drift from `packages/core/` during a change this wide | D17 makes mirroring part of each task rather than a terminal sweep, and every task's acceptance criteria name it. `vendoring.test.sh` is extended by ITR-T001 to cover the files this TRD adds |
| R9 | `status.js` keeps advancing `cycle_position` through stages F7 deletes | D5 removes the possibility rather than mitigating it: the hook imports `CYCLE_ORDER` and has no local declaration to drift. ITR-B004 depends on ITR-B003 so the constant exists before the hook is rewritten |

R4 and R7 are retired in the PRD (concurrent-TRD design descoped to NG13; `REVIEW.md`
dependency answered) and are not carried forward.

### 7.2 Technical Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| TR1 | The `Workflow` runtime exposes neither `pipeline()` nor a shell primitive, so `implement-phase.js` can neither compose chains as the source describes nor run the deterministic checks itself | Med | Med | Grounded, not speculative: all four existing workflow scripts use only `agent()`, `parallel()` and `log()`, and `pipeline()` appears nowhere in this repository. ITR-P003 settles it in Phase 1; D7 and D8 each carry a fallback that is already known to work (sequential `await`; implementer-run checks plus a command-run phase-gate battery) |
| TR2 | R6's exposure window is real in this plan's own ordering — acceptance-criteria verification has no owner between ITR-B010 and ITR-B011 | Med | Med | Deliberate and bounded: the two tasks are one phase apart and `code-reviewer` remains on disk (D16), so the PRD's R6 contingency (end-of-run AC check only, never per-task) is executable during the window without reinstating NG6 |

### 7.3 Contingency Plans

**TR1 Contingency**: Build `implement-phase.js` on sequential `await` composition and move the
deterministic check battery to the two places that are known to have shell — the implementer
inside its own task, and the command at the phase gate. This is D7's and D8's stated fallback
and costs no extra agent invocation, so AC-F7.2 and AC-F16.7 both still hold. Record the
runtime's actual surface in the same file so the next author does not re-probe it.

**TR2 Contingency**: If Phase 3 slips, run `code-reviewer` once at end of run against the
acceptance criteria only — not per task — until ITR-B011 lands. This is the PRD's R6
contingency verbatim and does not reinstate NG6.

---

## 8. Non-Goals (Scope Boundaries)

The following are **explicitly out of scope** per the PRD. Implementation agents MUST reject
requests that fall into these categories.

| PRD ID | Non-Goal | Rationale |
|--------|----------|-----------|
| NG1 | Porting Sunstone's whole `trd-parser.js` / `trd-graph.js` / `phase-tracker.js` / `cross-trd-deps.js` surface (76 test files) | *"You don't need that whole surface"* — adopt three pieces, *"selectively and with evidence, not wholesale"* |
| NG2 | Sunstone's multi-runtime adapters and per-package marketplace split | Already on the improvement plan's "deliberately not doing" list |
| NG3 | Recreating an `/implement-trd-team` command for parallelism | ITEM-2-D1: deleted, not ported. Parallelism derives from task-graph properties |
| NG4 | Paid `/code-review ultra` anywhere in the design | Owner ruled it out 2026-08-16; the whole design runs on the plan-billed local review |
| NG5 | Opening a **draft** PR at the start of implementation | Claude skips draft PRs, so a draft-PR instruction would produce zero reviews. Moot on the primary path (no PR event is involved) but still governs the R1 contingency |
| NG6 | Keeping `code-reviewer` in the per-task implement loop | Owner judgment: *"a poor substitute for the built in one — not nearly as effective."* ITEM-8-R3 |
| NG7 | Deleting `SIMPLIFY` outright | Demoted to the phase boundary, not deleted — *"there is no measurement either way, which is itself the reason not to delete it outright"* |
| NG8 | Reviewing the whole branch diff at each phase | Re-reviews settled code and produces churn; each phase review is scoped to the phase diff |
| NG9 | Reintroducing unit tests as standalone TRD tasks | Already fixed in `packages/core/contracts/trd-authoring.md:344–382` |
| NG10 | Solving concurrent-TRD coordination before the task graph exists | *"Sketching a solution before the graph exists would be guesswork"* |
| NG11 | Installing the managed Code Review app (route a) or the `claude-code-action` workflow | Route choice and the `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` secret are owner-only, needing repo-admin access |
| NG12 | Changing any model-invocation rule to enable CI review | *"The CI path involves no model invocation at all"* — the GitHub runner executes the action |
| NG13 | Cross-implementation parallel guards — coordinating two TRDs, sessions or developers against each other | Owner ruling 2026-08-16: out of scope; each session manages merging into its own branch. The worktree-pointer half already shipped (`cb9fcda`) |

**Scope note on NG13 and D13.** Removing `active_sessions` (ITR-B006) is the *consequence* of
NG13, not a violation of it: the field existed to coordinate concurrent sessions, that
coordination is now out of scope, and leaving a dead `{}` in the template would imply a
mechanism this design does not have. AC-F11.4 explicitly requires it be resolved rather than
left dead.

---

## 9. Task Grounding

Written after reading `packages/core/hooks/status.js`, `packages/core/hooks/hooks.manifest.json`,
`packages/core/commands/implement-trd.md`, `packages/core/commands/create-trd.md`,
`packages/core/contracts/trd-authoring.md`, all four `packages/core/workflows/*.js`,
`packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/validate-init.sh`,
`packages/core/templates/trd-state/implement.json.template`,
`test/smoke/run-smoke.sh`, `test/smoke/lib/project.sh`,
`test/smoke/scenarios/implement-one-task.sh`, `test/integration/tests/vendoring.test.sh`,
`test/integration/tests/notify-on-complete.test.sh`, `package.json`, `.gitignore`, and the
TRDs under `docs/TRD/`. Every claim below carries `[read]`, `[ran]` or `[inferred]`.

**Applies to every task.** Anchors are symbols and literal strings; line numbers are a
convenience beside them and rot on the first edit.

### Ground truth verified for the whole TRD

| Fact | Evidence |
|---|---|
| `packages/core/lib/` and `.claude/lib/` do not exist. `packages/core/` holds `agents commands contracts hooks scripts templates workflows` | [ran] `ls packages/core/lib` → *No such file or directory*; `ls packages/core/` |
| The only JS-library delivery path into a vendored tree is `copy_hook_libs()`, which globs `hooks/lib/*.js`. There is **no** copy function for a top-level `lib/` | [read] `scaffold-project.sh`, `copy_hook_libs() {` (:563), beside `copy_contracts()` (:195) and `copy_workflows()` (:225) |
| `.claude/hooks/lib/` contains exactly `dispatch-ledger.js`, `resolve-project-root.js` | [ran] `ls .claude/hooks/lib/` |
| ESLint and Prettier are **not installed and not configured** in this repo | [ran] `package.json` devDependencies = `bats`, `jest`, `js-yaml`, `mock-fs`; `find` for `.eslintrc* .prettierrc* eslint.config.*` returns nothing; `command -v eslint` and `command -v prettier` both fail. ShellCheck **is** present (`/opt/homebrew/bin/shellcheck`) |
| Workflow scripts use only `agent()`, `parallel()`, `log()`, `phase()`. `pipeline(` appears nowhere in `packages/` or `.claude/workflows/` | [ran] `grep -rn "pipeline(" packages/ .claude/workflows/` → one hit, in `packages/skills/using-langfuse/SKILL.md` prose |
| `.claude/` mirrors of `implement-trd.md`, `trd-authoring.md`, `audit-trd.js`, `status.js` are byte-identical to `packages/core/` today | [ran] `cmp` on each |
| The 13 agent `.md` files live in `.claude/agents/` and `packages/full/agents/`. `packages/core/agents/` holds only `agent-validation.test.js` and `skill-affinity.json` | [ran] `ls packages/core/agents/ .claude/agents/ packages/full/agents/` |
| All eight worker agents already declare `disallowedTools: Agent` | [ran] `grep -l disallowedTools .claude/agents/*.md` → agent/backend/frontend/mobile-implementer, app-debugger, code-reviewer, code-simplifier, verify-app |
| `packages/full/` reaches core by symlink for `contracts`, `workflows`, `templates`, `scripts`. `packages/full/lib/` is a **real** directory holding only `plugin-config.sh` (shell) | [ran] `ls -l packages/full/` |
| Exactly one `/create-trd`-produced TRD on disk carries a grounding section: `docs/TRD/_workflow-test-stop-hook.md:626` `## 9. Task Grounding`, with 9 `- **Touches:**` lines. Every other TRD has zero | [ran] `grep -rn "^#\+ .*Task Grounding" docs/TRD/*.md`; `grep -c "^- \*\*Touches:\*\*"` per file — **this settles the Could Not Verify row about `Touches` being populated in practice: it is, in the one TRD authored after the grounding pass existed** |

---

### ITR-P001 — Sunstone read

- **Touches:** `docs/modernization/runs/item8/sunstone-read.md` (new; `docs/modernization/runs/item8/` exists and currently holds only `SPEC.md`) [ran]
- **Reuse:** nothing in this repo. The clone is external and read-only.
- **Replaces:** nothing.
- **Follow:** the evidence-table shape already used in `docs/TRD/_workflow-test-stop-hook.md`'s
  "Verified ground truth for the whole TRD" (`### 9. Task Grounding` preamble, :634-648) — fact
  in one column, `file:line` evidence in the other [read].
- **Careful:** `CLAUDE.md`'s Baseline Reference section states the `~/dev/ensemble` checkout no
  longer exists as of 2026-08-12 and that `main` has moved [read]. Clone fresh; the
  approval rule "Any modification to `~/dev/ensemble`" (CLAUDE.md, Approval Requirements)
  applies to the fresh clone too.

### ITR-P002 — `/code-review` in-loop probe

- **Touches:** `docs/modernization/runs/item8/` (probe record; file name unfixed by this TRD)
- **Reuse:** `packages/core/hooks/dispatch-ledger.js` and the ledger it writes. Ledger files
  exist and are being written today: `.trd-state/_dispatch.jsonl`,
  `.trd-state/discipline-judgment/dispatch.jsonl`, `.trd-state/runtime-refresh/dispatch.jsonl` [ran].
  Do not build a second invocation counter — read `dispatch.jsonl`.
- **Replaces:** nothing.
- **Follow:** `async-discipline.md`'s "The dispatch ledger" section documents the ledger's
  state model (`start` → running, `stop` → finished) and the CLI `node .claude/hooks/dispatch-ledger.js --open` [read].
- **Careful:** that same section records a **known open gap** — no `blocked` row is written any
  more, so `--open` cannot distinguish "finished" from "blocked and resumed" [read]. A probe
  that counts agents from the ledger inherits that imprecision; say so in the record.
  `/code-review` is a **Skill**, not a subagent type, so `smoke_agent_invoked`-style
  `subagent_type` matching will not find it [inferred from `test/smoke/lib/project.sh:236-241`,
  which matches `select(.input.subagent_type==$a)`].

### ITR-P003 — Workflow-runtime primitive probe

- **Touches:** `docs/modernization/runs/item8/` (probe record)
- **Reuse:** the four existing scripts as the control surface —
  `packages/core/workflows/{audit-prd,audit-trd,create-prd,create-trd}.js`. `audit-trd.js`
  demonstrates the whole observed vocabulary in one file: `readArgs()` (:25), `required()`
  (:34), `await agent(` (:83), `await parallel(VERIFIERS.map((v) => () => agent(...)))` (:288),
  `log(` (:304), `phase('Reconcile')` (:307) [read].
- **Replaces:** nothing.
- **Follow:** `packages/core/commands/create-trd.md`, "Execution: the workflow is the
  orchestrator" (:706) and the literal `Workflow({ name: "create-trd", args: {` (:711) — this
  is how a command hands off to a workflow here, and the shape ITR-B005 must copy [read].
- **Careful:** `create-trd.md:753` carries a **Fallback** clause ("If the workflow is
  unavailable, run the stages below directly") [read]. Whatever ITR-P003 concludes, the
  command-side fallback path is an established convention here, not an invention.

### ITR-B001 — `packages/core/lib/trd-parser.js`

- **Touches:** `packages/core/lib/trd-parser.js` (new), `packages/core/lib/trd-parser.test.js`
  (new), and their `.claude/lib/` mirrors (D17). **`.claude/lib/` does not exist and nothing
  creates it** [ran] — see Careful.
- **Reuse:** `packages/core/contracts/trd-authoring.md` is the format authority, not a
  guess: Section 5 Master Task List (:240), `### 4.1.1 Live Verification Marker` (:266),
  `### 4.1.2 Skill Hints` (:282), Section 10 Task Grounding (:561) with the worked block at
  :590-597 and *"**Only `Touches` is mandatory.**"* at :599 [read]. `.claude/contracts/trd-authoring.md`
  is byte-identical [ran `cmp`].
- **Replaces:** the prose parsing instruction in `packages/core/commands/implement-trd.md`
  `### 3.1 Parse TRD Tasks` (:266) becomes unreachable once ITR-B005 calls this module —
  delete that subsection there, do not leave it as documentation.
- **Follow:** CommonJS with a `module.exports = {...}` tail, as `packages/core/hooks/status.js:401-412`
  does [read]; `jest` picks up `*.test.js` anywhere outside the four ignore globs in
  `package.json`'s `jest.testPathIgnorePatterns` [read].
- **Careful (three format facts that contradict §3.1 as written):**
  1. §3.1 says phases come from `### 4.N Phase N:` headings. Real output does not number them
     that way — `docs/TRD/_workflow-test-stop-hook.md:356` is `### 4.2 Phase 1: Restore a
     trustworthy baseline`, and this TRD's own `### 4.2 Phase 1:` (:561) does the same [read].
     Parse the phase number from the heading **text**, not from the section number.
  2. `docs/TRD/discipline-judgment.md:353` uses a five-column schema
     `| ID | Task | Description | Dependencies | Assignee |` and an em-dash heading
     `### 4.1 Phase 1 — Resolve the mechanics` (:351) [read]. Under §3.1's "wrong column
     count → warning" rule every row of that file warns, which contradicts this task's own
     acceptance criterion.
  3. `test/smoke/lib/project.sh`'s `smoke_write_trd()` (:157) writes `## 4. Master Task List`
     as a **bullet list** (`- [ ] **${task_id}**: Create src/greet.js exporting greet()`), not
     a table [read]. A table-only parser returns zero tasks for the default smoke canary.
- **Careful (delivery):** a new top-level `packages/core/lib/` has **no** vendoring path.
  `scaffold-project.sh` copies contracts, workflows, hook scripts, hook prompts and
  `hooks/lib/*.js`; nothing globs a top-level `lib/` [read]. Mirroring by hand into `.claude/lib/`
  satisfies D17 in *this* checkout and delivers nothing to a scaffolded project — the exact
  failure mode `async-discipline.md`'s Override section records for
  `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` [read].

### ITR-B002 — `packages/core/lib/task-graph.js`

- **Touches:** `packages/core/lib/task-graph.js` (new), `packages/core/lib/task-graph.test.js`
  (new), `.claude/lib/` mirrors.
- **Reuse:** `trd-parser.js`'s records only — the module takes records, not markdown (§3.2).
  Do not re-parse.
- **Replaces:** `packages/core/commands/implement-trd.md` `## Concurrency and File Conflict
  Detection` (:804) and `### 3.3 Cross-Task Dependencies` (:297) describe in prose exactly what
  this module computes [read]. Both become unreachable at ITR-B005 — name them for deletion
  there, and do not implement a second conflict-detection rule.
- **Follow:** pure-function module, no `fs`, no `process.env` — the shape that makes the >80%
  bar reachable without fixtures.
- **Careful:** the `Touches` values in the one real grounding section are markdown-inline-code
  paths inside a `- **Touches:**` bullet, sometimes several per line
  (`docs/TRD/_workflow-test-stop-hook.md`, `### WTSH-T001` block at :655) [read]. Normalise
  (strip backticks, split on commas, trim) before intersecting, or D3's conflict edges will be
  computed over strings that never compare equal.

### ITR-B003 — `packages/core/lib/implement-state.js`

- **Touches:** `packages/core/lib/implement-state.js` (new), its `.test.js`, `.claude/lib/` mirrors.
- **Reuse:** the atomic-write body inside `advanceCyclePosition()` —
  `const tmpPath = filePath + '.tmp'` … `fs.renameSync(tmpPath, filePath)`
  (`packages/core/hooks/status.js:265-267`), including its `unlinkSync` cleanup on throw (:274) [read].
  Also reuse the two safety guards verbatim in behaviour: the single-`in_progress` check
  (`if (inProgressEntries.length !== 1)`, :233) and the active-debugging skip
  (`retry_count > 0 || current_problem`, :244) [read].
- **Replaces:** `status.js`'s local `const CYCLE_ORDER = [...]` (:210) — deleted by ITR-B004,
  not by this task. The `implement.json` schema prose in
  `packages/core/commands/implement-trd.md` `### State File Schema` (:590), specifically the
  `"cycle_position": "implement|verify|verify_red|debug|simplify|verify_post_simplify|review|complete"`
  line (:608), is superseded — name it for correction at ITR-B005 [read].
- **Follow:** `module.exports` tail as in `status.js:401-412` [read].
- **Careful:** `status.js` is **not** uniformly atomic today, contrary to §3.3's "this is
  already the pattern": `clearSessionId()` writes with a bare
  `fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')` (:198) and runs in the
  same `main()` loop as the atomic advance (:331-339) [read]. If `save()` becomes the only
  writer, that call site has to move onto it too.

### ITR-B004 — rewrite `packages/core/hooks/status.js`

- **Touches:** `packages/core/hooks/status.js`, `packages/core/hooks/status.test.js`,
  `.claude/hooks/status.js` (byte-identical mirror today [ran `cmp`]).
- **Reuse:** everything except the constant. `resolveProjectRoot` is already imported from
  `./lib/resolve-project-root` (:52); `findTrdStateDir` (:74), `findImplementFiles` (:94),
  `advanceCyclePosition` (:223) all stay.
- **Replaces:** the literal line
  `const CYCLE_ORDER = ['verify_red', 'implement', 'verify', 'simplify', 'verify_post_simplify', 'review', 'complete'];`
  (`status.js:210`) [read]. Delete it, and delete any `status.test.js` case that restates the
  order rather than asserting the import. The header comment block at :17-25 names
  `'verify_red'` and `'verify_post_simplify'` explicitly — it goes stale in the same edit.
- **Follow:** the manifest entry is unchanged — `SubagentStop` order 1, command-type, no
  `hookType` key [ran, over `hooks.manifest.json`].
- **Careful — this is the task's real constraint.** `status.js` runs from **two** locations:
  `packages/core/hooks/` (canonical) and `.claude/hooks/` (vendored, and the one the platform
  actually executes). A `require` of `implement-state.js` must resolve in **both**. From
  `.claude/hooks/status.js`, `require('../lib/implement-state')` targets `.claude/lib/`, which
  does not exist and which `scaffold-project.sh` never creates [ran + read]. The only
  directory the scaffolder already delivers JS into, beside the hooks themselves, is
  `hooks/lib/` via `copy_hook_libs()` (:563) [read]. Either place `implement-state.js` under
  `hooks/lib/` (contradicting D1) or add a copy function (a `scaffold-project.sh` change no
  task in this TRD owns). Do not resolve this by leaving the constant duplicated — that is R9.

### ITR-D001 — `packages/core/contracts/task-delegation.md`

- **Touches:** `packages/core/contracts/task-delegation.md` (new), `.claude/contracts/task-delegation.md`
  (new). `packages/full/contracts` is a symlink to `../core/contracts`, so `packages/full` needs
  no separate edit [ran `ls -l packages/full/`].
- **Reuse:** `packages/core/contracts/trd-authoring.md:1-9` is the direct precedent and states
  the measured saving verbatim (*"~10.5k tokens re-cached ~17 times per run"*) and the framing
  *"If you are authoring, read this file and nothing else from the command layer."* [read].
  Copy that opening move. `copy_contracts()` (`scaffold-project.sh:195`) globs the directory,
  so a new contract file is delivered with no scaffolder change [read].
- **Replaces:** `packages/core/commands/implement-trd.md` Appendix A in whole —
  `# Appendix A: Delegation Prompt Templates` (:867) through `## A.8 Template: REJECTION-FIX`
  (:1308), ending at the Output-discipline heading (:1355) [read]. Once this contract exists,
  those 488 lines are unreachable duplication; ITR-B005 deletes them.
- **Follow:** the existing `<grounding>` element is already written and must be carried across,
  not re-invented: `<touches>` (:924), `<reuse>` (:925), `<replaces>` (:926), `<follow>` (:927),
  `<careful>` (:928), and the `<instruction>` block (:929-944) whose `<replaces>` sentence is
  already *"If `<replaces>` names something, DELETE it and its tests in the same change."* (:936) [read].
  Also carry `<scope_discipline>` (:947), `<scope_boundaries>` (:971), `<skills>` (:987),
  `<deliverables>` (:1040).
- **Careful:** the stale `Section 10 "Reference Documents"` string occurs **twice** in
  `implement-trd.md`, not once — `:1056` (A.2 IMPLEMENT `<ui_context>`) and `:1118` (A.3
  VERIFY's `<visual_verification_request>`, `{extracted from TRD Section 10 or "Design
  References" section}`) [ran `grep -n "Section 10"`]. Both must land corrected in the new
  contract, or ITR-T001's grep will still find one.

### ITR-B005 — rework `packages/core/commands/implement-trd.md`

- **Touches:** `packages/core/commands/implement-trd.md` (1466 lines [ran `wc -l`]),
  `.claude/commands/implement-trd.md` (byte-identical today [ran `cmp`]).
- **Reuse:** the YAML frontmatter block (:1-7, `version: 3.2.0`) — bump it, do not rewrite the
  shape [read]. Keep `### 5.4 Context Management at Phase Boundary — DO NOT PAUSE` (:553) and
  `## Step 8: Pause Conditions (NOT phase boundaries)` (:729): both already encode `autonomy.md`
  and are the NFR-2/NFR-3 surface [read]. Keep the `## Output discipline` (:1355) and
  `## Autonomous-execution discipline` (:1429) blocks — `notify-on-complete.test.sh:314` greps
  for the literal string `Autonomous-execution discipline` in this file [read].
- **Replaces (name each for deletion):**
  - `### 4.4 Stage Execution`'s `**Stage: VERIFY**` (:469), `**Stage: SIMPLIFY**` (:495) and
    `**Stage: REVIEW**` (:500-508) — the three stages F7 deletes [read].
  - `### 3.2 Stage Expansion` (:276) and the stage map `review: "code-reviewer"` (:195),
    `AUTH-F001:review [owner: code-reviewer, blockedBy: :simplify]` (:287),
    `metadata: { ... stage: "review", intended_agent: "code-reviewer" }` (:353) [read].
  - `### 3.1 Parse TRD Tasks` (:266), `### 3.3 Cross-Task Dependencies` (:297) and
    `## Concurrency and File Conflict Detection` (:804) — superseded by `lib/` (ITR-B001/B002).
  - The whole of Appendix A (:867-1354) — moved to `task-delegation.md` by ITR-D001.
  - `### 5.1 Quality Gate Verification` (:523), which today delegates the phase gate to
    `verify-app` from the command; under D6/OQ-6 that moves into the workflow.
- **Follow:** `packages/core/commands/create-trd.md`, `## Execution: the workflow is the
  orchestrator` (:706) and its literal `Workflow({ name: "create-trd", args: { ... } })` (:711),
  plus the "the workflow does not own every stage" carve-out (:730) and the Fallback (:753) [read].
- **Careful:**
  - The line budget is real and measurable: baseline **1466** [ran]; Appendix A alone is 488
    lines, so the 400-600 target is met roughly by the ITR-D001 split plus the stage-expansion
    deletions.
  - The check battery this task must run is **not** available: no ESLint, no Prettier, no config
    for either [ran]. `stack.md`'s Code Quality table names them, but a design document is not
    evidence that a tool is installed. Only `npx jest`, `npm run smoke` and `shellcheck` are
    executable here today.
  - `notify-on-complete.test.sh` greps this file for the `notify-complete.sh` call with
    `implement-trd` as its first arg (:210, :227), for absence of the legacy inline form (:246),
    for the `.claude/` mirror being in sync (:263), and for the autonomy block (:314) [read].
    All five survive a rewrite only if those elements are preserved verbatim.

### ITR-B006 — branch-derived active-TRD resolution

- **Touches:** `packages/core/commands/implement-trd.md`,
  `packages/core/templates/trd-state/implement.json.template`, and both `.claude/` mirrors.
- **Reuse:** the branch patterns are already documented in `.claude/rules/process.md`
  (`## Branch Naming`: `<issue-id>-<session>`, `feature/<trd-name>/<session>`, `hotfix/<issue-id>`) [read].
- **Replaces:** the three `current.json` sites in `implement-trd.md` — the usage note
  *"optional if `.trd-state/current.json` exists"* (:12), resolution step
  *"3. Active TRD from `.trd-state/current.json` (field: `trd`)"* (:65), and
  *"4. Update `.trd-state/current.json` with branch name"* (:78) [ran `grep -n current.json`,
  exactly 3 hits — matches the task's acceptance criterion]. Plus `"active_sessions": {},`
  in the template (:15) [read].
- **Follow:** `.gitignore:15-17`'s comment block, which is the recorded rationale [read].
- **Careful:**
  - `active_sessions` has **more sites than OQ-4 lists**: `implement-trd.md` :123, :125, :600,
    :649; `harden-trd-team.md` :166, :388; `verify-trd-team.md` :233, :586; template :15
    [ran `grep -rn active_sessions packages/core/`]. "Every write path" is nine references, not three.
  - There are **four** `implement.json` files under `.trd-state/`, not three:
    `discipline-judgment`, `ensemble-vnext`, `testing-phase` carry `active_sessions: {}`;
    `runtime-refresh/implement.json` has no such key at all [ran]. Removal must tolerate both.
  - `.gitignore`'s comment states the fallback as *"If absent, derive from the branch name;
    fall back to an explicit path argument"* — branch first [read]. §3.6 orders it
    explicit-path first. The comment is not evidence for §3.6's order; the order is this TRD's
    own choice.
  - `notify-on-complete.test.sh:127` has a live test *"L1: feature discovery from
    `.trd-state/current.json` (jq path)"* against `notify-complete.sh` [read]. That helper's
    `current.json` read is **out of scope** for D13 (it is notification metadata, not TRD
    resolution) — do not delete it while removing the command's reads.

### ITR-B007 — route Could Not Verify + owner-only Open Questions to tasks

- **Touches:** `packages/core/commands/implement-trd.md` (dispatch/banner path),
  `packages/core/contracts/task-delegation.md` (the elements), `.claude/` mirrors.
- **Reuse:** `trd-parser.js`'s `couldNotVerify` / `openQuestions` output (ITR-B001). Do not
  re-grep the TRD from the command.
- **Replaces:** nothing — these elements do not exist today (`grep` for `unverified_claims` /
  `open_question` in `packages/core/` returns nothing) [ran].
- **Follow:** the loose-heading rationale is already written and cited in `audit-trd.js`'s CNV
  stage — *"grep ${TRD} for `## Could Not Verify` and read what is actually there. Do NOT rely
  on the index"* (:311-330), including the recorded failure where an index returned an empty
  list for a section with four populated rows [read]. Same hazard applies to routing.
- **Careful:** this TRD's own `## Could Not Verify` and `## Open Questions` headings carry **no
  section number** (:873, :887) while `## 8. Non-Goals` (:844) does [read] — which is exactly
  why §3.1 mandates loose matching. `_workflow-test-stop-hook.md` places its open-questions
  content in a table *inside* the grounding preamble, not under a `## Open Questions` heading
  [read]; absence must be handled, not assumed.

### ITR-B008 — `packages/core/workflows/implement-phase.js`

- **Touches:** `packages/core/workflows/implement-phase.js` (new), `.claude/workflows/implement-phase.js`
  (new). `packages/full/workflows` is a symlink to `../core/workflows` [ran], and
  `copy_workflows()` (`scaffold-project.sh:225`) globs the directory — no scaffolder change needed [read].
- **Reuse:** copy the structural helpers from `audit-trd.js` rather than rewriting them:
  `export const meta = {name, description, whenToUse, phases}` (:1-10), `readArgs(raw)` (:25)
  with its "args arrived as a string" error, and `required(value, stage)` (:34) whose message is
  *"stage returned no result (the agent died or was skipped)"* [read]. The dead-agent accounting
  §3.4 asks for already exists at :300-305 (`alive = waves.filter(Boolean)`, `deadKeys`,
  `log('WARNING: … coverage is incomplete for this run')`) [read].
- **Replaces:** nothing yet — the per-task loop it supersedes lives in `implement-trd.md` and
  is deleted by ITR-B005.
- **Follow:** the wave idiom is literally
  `await parallel(VERIFIERS.map((v) => () => agent(prompt, {label, phase, effort, model, schema}).then(...)))`
  (`audit-trd.js:288-297`) [read] — thunks, not promises, into `parallel()`.
- **Careful:** no observed primitive starts a **background** subagent, executes shell, or
  composes a `pipeline()`; all four scripts use foreground `agent()` inside `parallel()`
  [ran + read]. That is why ITR-P003 gates this task — but note the ACs here ("the review call
  names the phase diff", "background") are written as though the branch is already settled.
  `verify-app` declares `background: true` and `disallowedTools: Agent` in its frontmatter
  [read `.claude/agents/verify-app.md`], so it cannot fan out further from inside the gate.

### ITR-B009 — end-of-run full-branch review

- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`.
- **Reuse:** the existing completion block already prints the exact diff range —
  `1. Review changes: git diff main...{branch_name}` (:718), immediately above
  `2. Create PR: gh pr create --title "{TRD title}"` (:719) [read]. That is the insertion point
  the task names, and it is accurate.
- **Replaces:** nothing; this is an addition inside `## Step 7: Completion` (:677).
- **Follow:** `## Step 7`'s fenced report block ends with `<promise>COMPLETE</promise>` for
  Wiggum mode (:725) [read] — the review must run before that, not after.
- **Careful:** `grep -rn "ultra"` over `packages/core/` currently returns nothing in the command,
  contract or workflow surface [ran], so AC-F8.7's assertion starts satisfied; the risk is
  reintroduction, not removal.

### ITR-B010 — remove `code-reviewer` from the per-task loop

- **Touches:** the ten files under `packages/core/` that name it — verified count [ran
  `grep -rln "code-reviewer" packages/core/ | wc -l` → 10]:
  `commands/implement-trd.md` (:195, :287, :353, :502, :1304, :1314, :1344),
  `commands/harden-trd-team.md` (:149, :255-256, :657, :669),
  `commands/fix-issue.md` (:113, :408, :419),
  `commands/init-project.md` (:411),
  `scripts/validate-init.sh` (:125), `scripts/validate-init.test.sh` (:66),
  `agents/agent-validation.test.js` (:58, :498), `agents/skill-affinity.json` (:88),
  `templates/constitution.md.template` (:110), `templates/process.md.template` (:127, :250) [ran].
- **Reuse:** nothing to build.
- **Replaces:** the per-task REVIEW stage only. `## A.7 Template: REVIEW` (`implement-trd.md:1260`)
  and its `**Invoke:** Agent(subagent_type="code-reviewer", …)` (:1304), plus
  `## A.8 Template: REJECTION-FIX` (:1308) which exists solely to consume a REVIEW rejection —
  both become unreachable; delete rather than relocate. Same for
  `harden-trd-team.md:657` and `fix-issue.md:408` if those loops are reworked.
- **Follow:** D16's "stays on disk" is satisfied by leaving `validate-init.sh:125`
  `"code-reviewer.md"` inside `REQUIRED_AGENTS` and `agent-validation.test.js:498`'s
  `const LEAF_AGENTS = ['code-reviewer', 'code-simplifier', 'verify-app'];` untouched [read].
- **Careful:** the agent **file** is not under `packages/core/` at all — it is
  `.claude/agents/code-reviewer.md` and `packages/full/agents/code-reviewer.md` [ran]. The
  scaffolder ships agents from `packages/full/agents/`; neither of the two `validate-init`
  assertions reads `packages/core/`. `vendoring.test.sh` also asserts
  `code-reviewer.md agent exists` in a scaffolded project (`@test "TRD-TEST-034: code-reviewer.md
  agent exists"`, :269) [read].

### ITR-B011 — `/audit-build`

- **Touches:** `packages/core/commands/audit-build.md` (new),
  `packages/core/workflows/audit-build.js` (new), `.claude/` mirrors of both.
- **Reuse:** `audit-trd.js` end to end, not as inspiration but as the template: `meta` (:1),
  `readArgs` (:25), `required` (:34), the `SCOPE` / `CORPUS_RULE` / `FINDABLE_ONLY` / `BATCH`
  prompt constants (:50, :59, :66, :75), the `VERIFIERS` array (:199), `FINDING_SCHEMA` (:177),
  the `parallel()` fan-out (:288), dead-verifier accounting (:302-304), the CNV rewrite (:311)
  and the readout agent (:385) [read]. `packages/core/commands/audit-trd.md` is 186 lines [ran]
  and is the command-side size to match.
- **Replaces:** the per-task acceptance-criteria job removed by ITR-B010 — say so in the command
  header so the relocation is traceable (D16/R6).
- **Follow:** `copy_contracts`/`copy_workflows` glob directories, so no scaffolder edit is needed
  for the workflow; the command file is delivered through the commands copy path [read].
- **Careful:** `test/integration/tests/notify-on-complete.test.sh` enumerates *"all 17 workflow
  commands"* in a hard-coded array at :210, :227, :246, :263 and :314 [read]. A new command must
  be added to those arrays **and** must carry the `notify-complete.sh` call with its own name
  plus the `Autonomous-execution discipline` block, or L2/L2b fail. No task in this TRD names
  that file.

### ITR-B012 — `/harden-build`

- **Touches:** `packages/core/commands/harden-trd-team.md` (765 lines [ran]),
  `packages/core/commands/harden-build.md` (new),
  `packages/core/workflows/harden-build.js` (new), `.claude/` mirrors.
- **Reuse:** `audit-build.js` from ITR-B011 (same fan-out shape) and the adversarial prompt
  content already in `harden-trd-team.md` — extract it, do not re-author it.
- **Replaces:** `harden-trd-team.md`'s teammate machinery: the stage table row
  `| REVIEW | code-reviewer | decision, issues[], recommendations[] | UPDATE or HARDEN |` (:669),
  `**Invoke:** Agent(subagent_type="code-reviewer", …)` (:657), the per-task stage line
  `AUTH-F001:review [owner: code-reviewer, blockedBy: :verify]` (:149), and
  `active_sessions` at :166 and :388 [read].
- **Follow:** `/audit-build`'s command+workflow split from ITR-B011.
- **Careful:** `harden-trd-team` is in the hard-coded 17-command array in
  `notify-on-complete.test.sh` at :210, :227, :246, :263 and :314, each of which greps
  `${CANON_COMMANDS}/harden-trd-team.md` [read]. **Deleting the file fails five tests.**
  Reducing it to a pointer only passes if the pointer still contains the
  `notify-complete.sh "harden-trd-team" …` call and the `Autonomous-execution discipline`
  heading. The AC's "removed or reduced to a pointer" is not free in either direction.

### ITR-B013 — `/verify-build`

- **Touches:** `packages/core/commands/verify-trd-team.md` (842 lines [ran]),
  `packages/core/commands/verify-build.md` (new), `.claude/` mirrors.
- **Reuse:** `test/smoke/run-smoke.sh` is the existing deterministic gate in this repo —
  `ALL_SCENARIOS=(hooks-health scaffold-integrity artifact-contracts implement-one-task)` (:103),
  `LLM_OPT_IN_SCENARIOS=(prd-run trd-run debug-path)` (:110), per-scenario budgets via
  `declare -A SCENARIO_TIMEOUT=(` (:57) and `SMOKE_TOTAL_BUDGET` (:71) [read]. A "deterministic
  E2E gate that convenes no agent" should invoke this, not reimplement a runner.
- **Replaces:** `verify-trd-team.md`'s `active_sessions` sites (:233, :586) and its teammate
  convening path [read].
- **Follow:** ITR-B012's replacement shape, for family consistency (OQ-5).
- **Careful:** identical to ITR-B012 — `verify-trd-team` is in the same five hard-coded arrays in
  `notify-on-complete.test.sh` [read]. Also `.claude/rules/command-status.md` uses
  `/verify-trd-team` as its worked example in four places [read]; a rename leaves that rule file
  documenting a command that no longer exists.

### ITR-T001 — BATS structure battery

- **Touches:** `test/integration/tests/` (new `.test.sh`), and `test/integration/tests/vendoring.test.sh`
  (extension named by the AC).
- **Reuse:** `test/integration/tests/notify-on-complete.test.sh` is the working model for exactly
  this kind of grep-shaped, cross-file assertion — `CANON_COMMANDS="${REPO_ROOT}/packages/core/commands"`
  (:32), the L1/L2/L2b layering, and the mirror-sync test *"L2: dogfood .claude/commands mirrors
  stay in sync with canonical"* (:262) [read]. Its `cmp`-style mirror check is the pattern D17/R8
  actually needs.
- **Replaces:** nothing.
- **Follow:** `test/integration/tests/run-all.sh` is the runner; `helpers/setup.sh` is sourced by
  the existing suites [ran `ls test/integration/tests/`].
- **Careful (the AC rests on a false premise):** `vendoring.test.sh` does **not** check
  `packages/core/` ↔ `.claude/` drift. It contains zero occurrences of `packages/core` and no
  `diff`/`cmp` call [ran]; it runs `/init-project` headlessly into a fixture and asserts the
  *scaffolded project's* structure (`@test "TRD-TEST-034: Vendoring creates 13 agent files"`, :193),
  and its headless block is gated on `if [[ "${SKIP_HEADLESS:-true}" != "true" ]]` in
  `setup_file` — **skipped by default** [read]. §7.1's R8 mitigation ("`vendoring.test.sh`
  catches it but only after the fact") is not supported by the file. The drift assertion this
  TRD needs is closer to `notify-on-complete.test.sh:262`. Also `grep -n "Section 10"` over
  `implement-trd.md` must clear **two** sites (:1056, :1118), not one [ran].

### ITR-T002 — `[LIVE]` end-to-end measurement

- **Touches:** `test/smoke/scenarios/implement-one-task.sh`, `test/smoke/lib/project.sh`
  (`smoke_write_trd()` at :157), possibly `test/smoke/run-smoke.sh`'s `SCENARIO_TIMEOUT` map (:57).
- **Reuse:** `smoke_scaffold_project`, `smoke_write_trd`, `smoke_agent_invoked` (:227),
  `assert_json_field`, `assert_tail_matches`, `smoke_skip` — all already in
  `test/smoke/lib/{assert,project}.sh` [read]. `dispatch.jsonl` is the invocation ledger; do not
  add a counter.
- **Replaces:** the single-task fixture body inside `smoke_write_trd()` — if it becomes
  multi-phase, the one-task variant is superseded rather than retained (OQ-7's stated choice).
- **Follow:** `implement-one-task.sh`'s existing assertion order — exit code (:67), banner tail
  (:72), artifact (:75), `implement.json` fields (:79, :81), agent invocation (:87, :96), branch (:102) [read].
- **Careful (two blocking facts):**
  1. `implement-one-task.sh:96-99` **hard-asserts** `smoke_agent_invoked "$SESSION_FILE" "verify-app"`
     and calls `assert_fail_raw "verify-app agent invoked"` otherwise [read]. F7 removes
     `verify-app` from the per-task loop and D6 moves the phase gate inside the workflow. This
     scenario is in `run-smoke.sh:103`'s default set, so `npm run smoke` — the acceptance
     criterion on ITR-B001, ITR-B002, ITR-B003 — goes red at ITR-B005, three phases before this
     task is scheduled to fix it.
  2. `smoke_agent_invoked` matches `select(.type=="tool_use") | select(.name=="Agent" or
     .name=="Task") | select(.input.subagent_type==$a)` in the **lead** session's stream-json
     (`project.sh:236-241`) [read]. Whether agents spawned inside a `Workflow` script surface as
     lead-session `tool_use` records is unverified — if they do not, every agent-invocation
     assertion in this scenario silently stops observing anything.
  3. The fixture TRD written by `smoke_write_trd()` uses a **bullet-list** Master Task List, not
     a table (:170-178) [read]; §3.1's parser will not read it.

### ITR-T003 — observe the next real `/create-trd` run

- **Touches:** nothing in the tree; the deliverable is a recorded finding.
- **Reuse:** the rule is already in place and its citation checks out —
  `packages/core/contracts/trd-authoring.md:348` *"**UNIT TESTS ARE NOT TASKS. They are part of
  the implementation task.**"*, with the runnable-phase clause *"Do not collect unit tests into
  a terminal 'Verification' phase"* at :380 [read]. NG9's cited range (:344-382) is accurate.
- **Replaces:** nothing.
- **Follow:** `docs/TRD/_workflow-test-stop-hook.md` is the newest `/create-trd` output on disk
  and the natural before/after comparison — it already carries `## 9. Task Grounding` (:626) and
  9 `Touches` lines [ran].
- **Careful:** §5.1 lists Phase 4's prerequisite as "Phase 3 complete" while §5.2 Session 4C
  says this task is "Independent of everything" and its Dependencies cell reads `None` [read
  this TRD]. It is not gated by Phase 3; scheduling it there delays a purely observational task.

---

## Open Questions

| ID | Question | What I assumed | Why it matters | If I'm wrong |
|----|----------|----------------|----------------|--------------|
| OQ-1 | `trd-authoring.md` defines no "Reference Documents" or "Design References" section, so AC-F6.1's "a section that exists in a generated TRD" has no canonical target. Should the producer contract gain one? | Loose heading-text matching anywhere in the TRD, with the element omitted when no match (D11). No producer change. | AC-F6.1 is satisfiable two ways — fix the consumer's matcher, or add the section to the producer. I picked the consumer-only fix because a producer change would put a section into every TRD to serve UI tasks that most TRDs do not have | The matcher finds nothing in real TRDs and `<design_references>` is permanently omitted — i.e. F6 is "fixed" into a no-op. A producer-side section would be needed after all |
| OQ-2 | Does the `Workflow` runtime expose `pipeline()`, shell execution, and background-subagent spawning to a workflow script? The source names `pipeline()`; this repository's four existing workflow scripts use only `agent()`, `parallel()` and `log()`. | Unknown, and probed rather than assumed: ITR-P003 settles it in Phase 1, and D7/D8/D10 each name a fallback that works with only the observed primitives | AC-F16.3 names `pipeline()` directly, AC-F8.4 requires the phase review to be a background subagent started *inside* the workflow, and AC-F7.2 needs a non-agent way to run tests | The fallbacks are what ships: sequential `await` for chains, implementer-run checks per task, command-run battery at the gate. Functionally equivalent; AC-F16.3's literal wording would then not be met and would need amending |
| OQ-3 | AC-F7.2 says "the orchestrator runs targeted tests, typecheck and lint without spawning an agent", but F16 puts task execution inside the phase workflow. Where does "orchestrator" end? | "Without spawning an agent" means *without an additional agent*: the implementer runs its own targeted battery inside the task it is already doing, and the command runs the full battery at the phase gate (D8) | Read strictly the other way, the command would have to run per-task checks itself — which means per-task results re-entering orchestrator context, contradicting AC-F16.7 | If the owner meant per-task checks in the command, AC-F16.7 and AC-F7.2 are in tension and one must give; the phase-gate battery would become per-task and G8's context saving shrinks |
| OQ-4 | `active_sessions` — remove, or repurpose? AC-F11.4 says "removed or given a purpose". | Removed from the template and every write path (D13), because NG13 descopes the coordination it existed for | It is `{}` in all three on-disk state files and referenced by `implement-trd.md:123`, `harden-trd-team.md:166` and `verify-trd-team.md:233` — two of which this TRD replaces anyway | A future concurrent-TRD design has to reintroduce the field. Cheap to reverse: it is one template key and three read sites |
| OQ-5 | What should the two team-command replacements be called? The PRD specifies behaviour (verifier fan-out; deterministic E2E gate) and explicitly leaves delete-vs-rewrite as an implementation choice, but names nothing | `/harden-build` and `/verify-build`, to sit alongside `/audit-build` and read as a family | Command names are user-facing and appear in `process.md`, `CLAUDE.md` and the scaffold | Renaming is cheap at this stage and expensive after the scaffold ships them |
| OQ-6 | Does `verify-app` at the phase boundary belong to the workflow or to the command? AC-F7.3 says "at the phase boundary"; AC-F16.4 places only the review inside the workflow | The workflow (D6/§3.4): `verify-app` and `code-simplifier` both run in the phase gate, so the command sees one phase result rather than three | Putting `verify-app` in the command means its judgment output enters orchestrator context, partially undoing G8 | The gate splits across two layers; AC-F16.7 still holds for task results but the phase gate's own output is no longer uniformly summarised |
| OQ-7 | Which `[LIVE]` end-to-end fixture should ITR-T002 use? The existing `implement-one-task.sh` canary has exactly one task, so it cannot exercise a phase boundary at all | Extend it to a multi-task, multi-phase fixture TRD rather than authoring a second scenario, so there is one implement canary and not two that drift | AC-F16.6 (whole-phase retry) and AC-F16.7 (phase-result-only) are both unobservable on a one-task, one-phase run | A second scenario is needed, and the two must be kept in step — the drift class D17 exists to prevent |

---

## Could Not Verify

| Claim | How I'd check it |
|-------|------------------|
| The `Workflow` runtime exposes `pipeline()` | Inferred from absence: `grep -rn "pipeline(" packages/core/workflows/ .claude/workflows/` returns nothing, which shows this repo does not *use* it, not that it does not *exist*. ITR-P003 probes it directly |
| A workflow script can execute shell (`Bash`) — needed if `implement-phase.js` is to run the check battery itself | Same inference: no shell call appears in any of the four existing scripts. ITR-P003 probes it |
| A workflow script can start a background subagent (required by AC-F8.4 / NFR-4 for the phase review) | Not attested anywhere in this repository. `audit-trd.js` uses `parallel()` over foreground `agent()` calls. ITR-P003 probes it |
| `/code-review high` is model-startable in this environment and fans out to ~7 agents | Inherited from the PRD's own Could Not Verify, which inherits it from SPEC.md. AC-F8.6 makes empirical verification a requirement; ITR-P002 is that verification |
| `Sunstone-Partners/ensemble` contains `trd-parser.js`, `trd-graph.js`, `cross-trd-deps.js` with 76 test files | The checkout is not on this machine (`~/dev/ensemble` gone as of 2026-08-12). `git clone` and read — that is ITR-P001 |
| `/implement-trd` runs ~5 agent invocations per task today, which is the baseline G3's ~1 target is measured against | Inherited from SPEC.md via the PRD. Count `start` events per task ID in a completed run's `.trd-state/<feature>/dispatch.jsonl`. I read the *stage list* in `implement-trd.md` (5 stages) but did not count a real run |
| `implement-trd.md` is ~13.4k tokens, the figure D12's saving is argued from | Inherited. I verified 1466 lines / 53,685 bytes by `wc`; the token count is not independently computed |
| `resumeFromRunId` is same-session only — the constraint D6 turns on | Inherited from SPEC:465–468 via the PRD. Check the live workflow docs, or run a workflow, end the session, and attempt resume |
| Phase sizes of 4–5.4 tasks on the profile TRDs, which R5's assessment rests on | Inherited from SPEC.md. This TRD's own phases (6/7/3/3) are measured; the profile TRDs' are not |
| The `Touches` field is populated in practice by real `/create-trd` output — D3's conflict edges are inert if it is empty | Read the contract (`trd-authoring.md:591,599`: *"Only `Touches` is mandatory"*) but did not check a generated TRD's grounding blocks for it; `docs/TRD/discipline-judgment.md` predates the grounding section. Grep a TRD produced after item 10 |
| Extending `implement-one-task.sh` to multiple phases is feasible within the smoke harness's per-scenario budget | Read the scenario's header and the harness's budget mechanism (`declare -A` per-scenario budgets) but did not measure a multi-phase run's elapsed time. Run it |
