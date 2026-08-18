# TRD: Functional Verification of Delivered Software

**Version**: 1.1.0
**Status**: Draft
**Created**: 2026-08-17
**Last Updated**: 2026-08-17
**Author**: @technical-architect
**Source PRD**: `docs/PRD/functional-verification.md`
**Task ID Prefix**: FV

---

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-08-17 | Initial TRD creation | @technical-architect |
| 1.1.0 | 2026-08-17 | `/refine-trd` — six owner decisions applied. **D1 inverted**: the loop moves out of `/implement-trd` Step 7.3 and into `verify-functional.js`, which now owns iteration, judgment, remediation dispatch (`workflow('implement-phase', …)`, one level of nesting) and the report; Step 7.3 becomes a single `Workflow(verify-functional, …)` call. v1.0.1's rationale rested on a misread of `implement-trd-rework.md:79` ("unavailable inside subagents", not inside workflow scripts) and on treating the script's lack of a filesystem as the loop's lack of one — the agents it dispatches supply it, via the new Persist stage (§3.3a). Knock-on: D2, D3, D5, D8, D9, §1.1, §1.3, §1.4, §2.1–§2.4, §3.1, §3.3, §3.4, §3.6, §3.7, FV-B001/B002/B004/B005 and their grounding, §5's phase names, TR1/TR2, and a new TR4 for the unexercised nesting primitive. **OQ-1 decided**: iterations after the first exercise `priorGaps` plus the criteria whose `files` intersect the remediation's `Touches`, not the full set. **OQ-4 decided**: the derive pass uses the existing `product-manager` agent, not an untyped one and not a fourteenth agent type. **OQ-2/3/5/6 confirmed**; OQ-6 adds `R = Remediation` to `trd-authoring.md`'s category list via FV-P001. Task count unchanged at 7 | `/refine-trd` |
| 1.0.1 | 2026-08-17 | `/audit-trd` pass. Resolved two self-contradictions (`trd_hash` recomputation: §3.7 wins, TR2/FV-B005/§2.3 corrected; the absent-definition path: no wait, no inline derivation, `not run: no definition produced` per TR3). Removed FV-B005's undisciplined inline-derivation fallback. Replaced the undefined `Q-1` coverage identifier with §6.1's floor. Corrected §8's `PRD ID` column header (NG1–NG4 are TRD-local). Corrected OQ-6's stated parser mechanism. Added the missing `G2` citation to D1 and FV-B005. Rewrote Could Not Verify | `/audit-trd` |

---

## 1. Overview

### 1.1 Technical Summary

This feature adds one thing the implement chain does not have: a pass that asks whether a
user can do what the **PRD** says they can do, answered with artifacts rather than
assertions, and iterated on until it is satisfied or provably stalled.

It is built from parts that already exist. A background `product-manager` agent dispatched
before the phase loop derives a functional success definition from the PRD alone. At the tail
of the run — after Step 7's hardening and full-branch review — `/implement-trd` makes **one**
call, `Workflow(verify-functional, …)`, and that workflow owns the whole bounded loop: it fans
out one fresh-context agent per criterion to exercise the system and a second per criterion to
judge the evidence, and it dispatches remediation for whatever came back unmet through the
**existing phase workflow** (`implement-phase.js`), invoked as a nested `workflow()` call.

Two workflows, one command invocation. The script has no filesystem, so every disk touch —
reading the definition, writing evidence, mutating the TRD, writing the report — is an
`agent()` call the script makes, not an operation the script performs.

Three properties drive every decision below:

- **The judgment is delegated; the control flow is not.** Loop bounds, evidence gating and
  remediation-phase generation are pure functions in one unit-tested module
  (`packages/core/lib/functional-verification.js`), reached from the script through that
  module's CLI. An agent decides only whether a criterion is met.
- **Evidence outranks assertion.** A criterion is gated first by a deterministic check
  (the artifact exists, is non-empty, and is newer than HEAD) before any agent is asked what
  the artifact shows.
- **Fresh context, state on disk.** The success definition, the verifier's notes, the
  evidence and the loop state all live on disk, so a re-trigger resumes rather than
  re-derives.

The framework supplies *hints* about how to exercise a system, never a harness. A project
whose stack matches nothing in the hint table gets `not verifiable here` in the report,
which is the honest answer and the one that would have caught the 4.1.16 defects.

### 1.2 Key Technical Decisions

| ID | Decision | Choice | Serves Objective | Rationale | Alternatives Considered |
|----|----------|--------|------------------|-----------|------------------------|
| D1 | Where the loop lives | The outer loop lives **inside the workflow**. `packages/core/workflows/verify-functional.js` owns iteration, the exercise/judge fan-out, the loop-exit decision, remediation dispatch and the report. `/implement-trd`'s Step 7.3 is a **single** `Workflow(verify-functional, …)` call that hands over every input and receives one outcome | G2, FR-4, AC-5, AC-7 | The `Workflow` tool's own contract states that `workflow(nameOrRef, args)` *"runs another workflow inline as a sub-step and returns whatever it returns"*, sharing the parent run's concurrency cap, agent counter, abort signal and token budget, with nesting permitted to exactly one level (*"`workflow()` inside a child throws"*). One level is all remediation needs: `verify-functional` → `implement-phase`, and `implement-phase` invokes no workflow itself. The three capabilities v1.0.1 claimed only a command has are all reachable from a script: the script has no filesystem, but **the agents it dispatches via `agent()` do** — so reading the definition, inserting the remediation phase into the TRD, re-parsing it and writing the report are `agent()` calls (one Persist agent per iteration, §3.3a), not script operations. v1.0.1's rationale rested on a misread of `docs/TRD/completed/implement-trd-rework.md` §1.3, whose line 79 says *"`Workflow` is unavailable inside subagents"* — subagents, not workflow scripts. This restores improvement-plan item 9a's *"the loop is a WORKFLOW, not a Stop hook"* in full, rather than keeping only its second half | **Command-driven loop (v1.0.1's D1)** — rejected on re-reading: its premise was that a script cannot dispatch a phase, which the `Workflow` contract contradicts. It also put the loop's control flow in prose an LLM re-derives per run, which is what AC-5 is trying to make checkable. **A `Stop` hook / wiggum gate** — rejected, inherited from item 9a: wiggum's finest correction is a phase re-run, a granularity mismatch for a single failing criterion |
| D2 | Shape of one iteration | Inside the loop, each iteration is three stages: Exercise (`parallel()`, one agent per in-scope criterion, `agentType: 'verify-app'`), Judge (`parallel()`, one untyped agent per criterion), then Persist (one untyped agent, §3.3a) | FR-2, FR-3 | Fan-out of fresh-context agents whose per-agent output does **not** reach the orchestrator is exactly what `implement-phase.js` established (AC-F16.7 there). The whole run then costs the command one structured outcome, not 3N transcripts | **Direct `Agent` fan-out from the command** — rejected: per-criterion transcripts land in orchestrator context, and the loop runs up to three times. **Revisit** if the workflow's per-call overhead is ever measured to dominate the agent cost |
| D3 | Deterministic half | One module, `packages/core/lib/functional-verification.js`, exporting `checkEvidence()`, `decideNext()`, `renderRemediationPhase()`, `renderReport()`, plus a CLI entry point exposing all four as subcommands | FR-3, FR-4, AC-4, AC-5 | Every loop-control question — is this artifact real, has a gap closed, is the cap hit, what does the remediation phase look like — is arithmetic over data, and arithmetic belongs in a unit-tested pure module rather than in prose an LLM re-derives per run. Same shape as `trd-parser.js` / `task-graph.js`. A workflow script has no `require` (it is a prompt-DSL body, not a module — `test-harness.js`'s header), so the loop reaches this module the same way the judge reaches `checkEvidence`: through the CLI, invoked by the Persist agent. The module, not the script, stays the single source of the arithmetic | **Reimplement `decideNext()` inline in the workflow script** — rejected: two copies of the loop-exit rule is exactly the drift AC-5 is guarding against, and the script is testable through `test-harness.js` either way. **Four separate modules** — rejected: they share one verdict shape, and splitting it invites drift between the renderer and the checker |
| D4 | Tier-1 evidence gate placement | The **judge** agent's first action is to run the checker CLI over its criterion's artifact; it short-circuits to `not met` without reading content when tier 1 fails | FR-3, AC-4 | Keeps the whole pass to one workflow call per iteration. The exerciser and the judge are different agents, so the assertion is still not self-certified — which is what FR-3 is defending | **Tier 1 in the command between two workflow calls** (exercise → check → judge) — rejected: three dispatches per iteration for a saving that only applies to already-failing criteria. **Revisit** if judge dispatches on tier-1 failures show up as measurable waste in the first costed run |
| D5 | How the success definition is produced | A **background `product-manager` agent** dispatched by the command before the phase loop, whose entire instruction set is `packages/core/contracts/functional-verification.md`, handed the PRD path and never the TRD path or any TRD text | FR-1, AC-1, AC-2, AC-3 | Owner decision, 2026-08-17: *"I'd assumed a product manager would write up 'what constitutes success from the users perspective'."* `product-manager` is already on `constitution.md`'s 13-agent roster, so no roster change and no `agent-validation.test.js` change is needed, and its declared mandate — *"Analyze user needs and define acceptance criteria"* — is this task exactly. Its frontmatter already carries `background: true` [read] `packages/full/agents/product-manager.md:14`. `Agent({run_in_background: true})` is the primitive that makes "parallel, no wall clock" real rather than claimed. Independence is enforced structurally: the prompt names one file. PRD path is resolved by the command from the TRD's `**Source PRD**:` header, falling back to `.trd-state/current.json`'s `prd` | **An untyped `general-purpose` agent carrying the contract** (v1.0.1's choice) — rejected by the owner: the roster already holds the agent whose job this is, and an untyped agent discards its accumulated requirements discipline for no gain. **A new `prd-verifier` agent type** — rejected: `constitution.md`'s 13-agent roster is owner-governed and adding to it is an architecture change requiring approval (`agent-validation.test.js` enforces the list). **Adding `sourcePrd` to `trd-parser.js`** — rejected: that module's contract is Master Task List → records, and three commands depend on it; a header grep in the command is the smaller blast radius |
| D6 | `verify-app`'s role | **Repointed, not replaced**: a second mode that takes a success-definition criterion instead of a TRD acceptance criterion, plus the stack-keyed harness hint table and the notes discipline. Dispatched by the workflow as `agentType: 'verify-app'` for the Exercise stage | FR-2, FR-5, G1 | It already carries Verification Level Enforcement and a live-evidence format; this is the same move one level out, per item 9a. `agentType` from a workflow is attested (ITR-P003, cited in `implement-phase.js`) | **A sibling agent** — same roster objection as D5. **A plain untyped exerciser** — rejected: it would duplicate the verification-level and evidence-format text that already exists |
| D7 | Judge independence | The Judge stage uses an **untyped** agent, not `verify-app` | FR-3 | The exerciser has an interest in its own artifacts. A judge that is a different agent, reading only the artifact and the checker's output, is what makes "evidence, not assertion" structural rather than aspirational | **Same agent judges its own evidence** — rejected outright; it re-creates the failure FR-3 names |
| D8 | Remediation dispatch | Each unmet criterion becomes one task in a **remediation phase INSERTED into the TRD at two points — inside `## 4. Master Task List` and inside `## 9. Task Grounding`** (never appended: `findSection` bounds a section at the next heading of equal-or-lower level, so anything after `## Could Not Verify` is invisible to `parseTrd`, and the dispatch that follows is a silent no-op that reads as success), rendered deterministically by `renderRemediationPhase()`, then dispatched from inside the loop as `workflow('implement-phase', …)` — one level of workflow nesting, which the tool's contract permits (D1) | FR-4, AC-7, R2 | Inherited from D-9a-1. It buys wave partitioning, file-conflict serialization, `agentType` resolution, the phase gate and per-task accounting for free. **Added here:** when the judge implicates no files for a gap, the renderer emits that phase's tasks as a serial chain rather than a parallel wave, because an empty `Touches` conflicts with nothing and would let two blind fixes race | **A loose remediation agent** — rejected by D-9a-1: unscoped fixes inside a 3-iteration loop are how a fix for criterion 3 breaks criterion 1 |
| D9 | Persistent state layout | `success-definition.md`, `verification.json`, `verification-report.md` and `evidence/` all under `.trd-state/<feature>/`; the verifier's learned mechanics at `.claude/verification-notes.md` | FR-1, FR-4, FR-5, FR-6, AC-8 | Definition path is D-9a-3, verbatim. Notes path and its "not in `.claude/rules/`" placement are the owner's 2026-08-17 correction. All four are written by the loop's Persist agent (§3.3a), which is the only participant in this feature with a filesystem. Loop state is a **separate file from `implement.json`** because that file already has two writers (the command and `status.js` on `SubagentStop`) | **Extend `implement.json`** — rejected on the write-contention ground above. **Revisit** if a consumer ever needs the two atomically consistent |
| D10 | Evidence artifacts are not committed | `.trd-state/*/evidence/` is added to `.gitignore`; the definition, the report and the notes stay tracked | FR-3, FR-6 | `.trd-state/` is deliberately tracked, and screenshots/transcripts are binary working state with a per-run lifetime. Freshness is unaffected — the tier-1 check compares mtime to HEAD's commit time, not to git status | **Commit everything** — rejected: repository bloat with no consumer. **Revisit** if a reviewer ever needs to re-read an artifact after the branch merges |
| D11 | Opt-in flag | `/implement-trd --verify-functional`, default off | AC-6, R3 | AC-6 names this outright; D-9a-2 gives the reason (unpriced cost on a 1.0-agents-per-task loop) and the condition for flipping it | **On by default** — rejected until a real run yields a cost figure. **Revisit** is explicit: the first costed run |
| D12 | Harness knowledge | A stack-keyed **hint table** in the contract and in `verify-app`'s prompt (web UI → browser driving; HTTP API → request/response transcript diffed against the declared interface; CLI → invoke and assert on output; mobile → simulator harness), plus a mandate to read `CLAUDE.md` / `stack.md` / the existing suites. No harness is implemented | FR-2, FR-6, NG2 | The PRD's non-goal is explicit: this ships hints, not capability. A stack the table does not cover resolves to `not verifiable here` rather than to an invented harness | **Implement a generic harness** — rejected by NG2. **Require the PRD to declare a harness** — rejected: that is the upstream blocker item 9a's design removed |

### 1.3 Technology Stack

| Layer | Technology | Purpose | Notes |
|-------|------------|---------|-------|
| Deterministic core | JavaScript / Node.js 18+ | `packages/core/lib/functional-verification.js` — evidence gate, loop decision, remediation-phase and report renderers | `stack.md` Languages table; same shape as `trd-parser.js` / `task-graph.js` |
| Orchestration (loop and pass) | `Workflow` prompt-DSL script | `packages/core/workflows/verify-functional.js` — the bounded loop, its Exercise/Judge/Persist stages, and the nested `workflow('implement-phase', …)` remediation dispatch (D1) | No filesystem, no shell, no `require`, no `Date.now()`; every input arrives in `args`, every disk touch is an `agent()` call |
| Command surface | Command prompt (Markdown) | `/implement-trd` Step 7.3 — resolve inputs, one `Workflow(verify-functional, …)` call, banner | Commands are prompts with optional shell — `constitution.md` Principle 3 |
| Agent prompts | Markdown | `verify-app` second mode; `packages/core/contracts/functional-verification.md` | `constitution.md` Principle 2 — prompts only, no executable code |
| Unit tests | Jest ^29.7.0 | Lib module and workflow script | `stack.md` Testing table; workflow scripts are exercised through `packages/core/workflows/test-harness.js` |
| End-to-end | BATS ^1.9.0 + `test/smoke/` | `[LIVE]` scenario driving the real command | `stack.md`; `run-smoke.sh` scenario registry |

No new runtime dependency is introduced.

### 1.4 Integration Points

| System | Type | Direction | Notes |
|--------|------|-----------|-------|
| `packages/core/workflows/implement-phase.js` | Nested workflow invocation | Out | Remediation phases are dispatched through it unchanged, as `workflow('implement-phase', …)` from inside `verify-functional.js` (D1, D8) |
| `packages/core/lib/trd-parser.js`, `task-graph.js` | Node modules | In | Re-parsed by the Persist agent after the remediation phase is inserted, to produce that phase's waves |
| `packages/core/lib/implement-state.js` | Node module | In | `save()` is filepath-generic; reused by the Persist agent for `verification.json`'s atomic write |
| `docs/PRD/<feature>.md` | Markdown artifact | In | Sole input to the success-definition pass (D5) |
| `docs/TRD/<feature>.md` | Markdown artifact | Both | Read for task/phase structure; **mutated in place** with remediation phases at §3.7's two insertion points (D8) |
| `.claude/rules/stack.md`, `CLAUDE.md`, project memory | Markdown | In | How to exercise this project (D12); what is safe to exercise (S-2) |
| `git` | CLI | In | HEAD commit time supplies the tier-1 freshness baseline |
| `packages/core/scripts/scaffold-project.sh` | Shell | Out | Delivers the new contract, lib and workflow by directory glob — **no change required**; `copy_libs`/`copy_workflows`/`copy_contracts` add missing files on `--refresh` as of the 2026-08-16 fix |

---

## 2. System Architecture

### 2.1 Architecture Overview

```mermaid
graph TB
    subgraph CMD["/implement-trd (command)"]
        DERIVE["Step 3.6: dispatch success-definition agent<br/>Agent(product-manager, run_in_background: true)"]
        CALL["Step 7.3: ONE call<br/>Workflow(verify-functional, …)"]
    end

    subgraph WF["Workflow: verify-functional.js — owns the loop (D1)"]
        EX["Exercise — parallel<br/>agentType: verify-app"]
        JU["Judge — parallel, untyped<br/>runs checkEvidence first (D4)"]
        PS["Persist — one untyped agent (§3.3a)<br/>runs the lib CLI, touches disk"]
        DEC{"decideNext()<br/>via the CLI"}
    end

    subgraph LIB["packages/core/lib/functional-verification.js (D3)"]
        CHK["checkEvidence()"]
        DECF["decideNext()"]
        REM["renderRemediationPhase()"]
        REP["renderReport()"]
    end

    IP["Workflow: implement-phase.js<br/>(existing, unchanged)"]

    PRD[("docs/PRD/&lt;feature&gt;.md")] --> DERIVE
    DERIVE --> SD[(".trd-state/&lt;feature&gt;/success-definition.md")]
    SD --> CALL
    CALL -->|args: criteria, contract, notes, since| WF
    EX --> EV[(".trd-state/&lt;feature&gt;/evidence/")]
    EV --> JU
    JU -.->|CLI| CHK
    NOTES[(".claude/verification-notes.md")] <--> EX
    JU --> PS
    PS -.->|CLI| DECF
    PS -.->|CLI| REM
    PS -.->|CLI| REP
    PS --> DEC
    DEC -->|remediate| TRD[("docs/TRD/&lt;feature&gt;.md<br/>+ remediation phase")]
    TRD --> IP
    IP -->|"workflow('implement-phase')"| EX
    DEC -->|exit| RPT[(".trd-state/&lt;feature&gt;/verification-report.md")]
    WF -->|outcome| CALL
```

### 2.2 Component Architecture

#### 2.2.1 `packages/core/contracts/functional-verification.md`

**Responsibility**: The binding instruction set for every agent in this feature — how to
derive a success definition with mandatory PRD-line citation, how to exercise a system
(the D12 hint table), what an evidence artifact is, the notes discipline, and the report's
shape. Mirrors the `task-delegation.md` / `trd-authoring.md` pattern: a command reads it and
passes the text in `args`; the agents read the text, not the file.

**Interfaces**: consumed as prompt text by the success-definition `product-manager` agent (via
the command) and by the workflow's Exercise and Judge stages (via `args.contract`).
**Dependencies**: none.

#### 2.2.2 `packages/core/lib/functional-verification.js`

**Responsibility**: every deterministic decision in the loop.
**Interfaces**: `checkEvidence()`, `decideNext()`, `renderRemediationPhase()`,
`renderReport()`; plus a `require.main === module` CLI exposing all four as subcommands, so the
judge agent can invoke the evidence gate and the Persist agent can invoke the other three
without a `node -e` one-liner. The workflow script has no `require` (D3), so the CLI is the
only path from the loop to this module.
**Dependencies**: `fs` only (for `statSync` in `checkEvidence`). No git, no network.

#### 2.2.3 `packages/core/workflows/verify-functional.js`

**Responsibility**: the whole bounded loop (D1). Per iteration: Exercise each in-scope
criterion in parallel, Judge each in parallel with the tier-1 gate first, then Persist — one
agent that runs the lib CLI, writes state and, on `remediate`, mutates the TRD and returns the
assembled `implement-phase` args, which the script dispatches as `workflow('implement-phase', …)`.
**Interfaces**: `args` in (§3.3), one structured outcome out (§3.3).
**Dependencies**: the platform's `agent()` / `parallel()` / `phase()` / `log()` / `workflow()`;
nothing on disk, no `require`.

#### 2.2.4 `verify-app` (second mode)

**Responsibility**: exercising the built system against one functional criterion and
maintaining `.claude/verification-notes.md`.
**Interfaces**: dispatched with `agentType: 'verify-app'`; returns a claim, not a verdict.
**Dependencies**: `constitution.md` (verification level, already read), `stack.md`,
`CLAUDE.md`, the project's own suites.

#### 2.2.5 `/implement-trd` Step 7.3

**Responsibility**: input resolution and one dispatch. Resolve the PRD and dispatch the derive
pass early (Step 3.6); at Step 7.3 read the definition, the notes and the stack hints from disk,
resolve HEAD's commit time and the TRD's prefix/phase/id facts, make **one**
`Workflow(verify-functional, …)` call, and render the outcome into Step 8's banner. It does not
iterate, does not judge, and does not dispatch remediation — those moved into the workflow (D1).
The two pre-loop outcomes it still owns alone are `not run: no PRD resolved` and
`not run: no definition produced`, because both are conditions it detects before there is
anything to hand the workflow.
**Dependencies**: `verify-functional.js`, plus the lib CLI for the two `not run` reports.

### 2.3 Data Flow

```mermaid
sequenceDiagram
    participant C as /implement-trd
    participant D as derive agent (product-manager, background)
    participant W as verify-functional workflow
    participant E as exerciser (verify-app)
    participant J as judge (untyped)
    participant S as persist agent (untyped)
    participant P as implement-phase workflow

    C->>D: PRD path + contract (never the TRD)
    Note over C,D: runs during the phase loop — no wall clock
    D->>D: write success-definition.md
    Note over C: ... phases run, Step 7.1 hardening, Step 7.2 review dispatched ...
    C->>C: read success-definition.md, notes, stack hints, HEAD commit time
    alt file absent / PRD unresolved
        C->>C: renderReport(not-run) via the lib CLI
        C-->>C: workflow is not called (TR3 / §3.1)
    else definition present
        C->>W: ONE call — Workflow(verify-functional, {criteria, contract, notes, since, …})
        Note over W: zero criteria → Persist writes the empty report, no Exercise (AC-3)
        loop iteration 1..3 (owned by the workflow)
            W->>E: one agent per IN-SCOPE criterion (parallel)
            E-->>W: claim + artifact path (or reason none)
            W->>J: one agent per in-scope criterion (parallel)
            J->>J: checkEvidence CLI (tier 1) then content
            J-->>W: met / not met / not verifiable + files implicated
            W->>S: verdict + carried-forward statuses
            S->>S: decideNext CLI; write verification.json
            alt exit-satisfied / exit-stalled / exit-stuck
                S->>S: renderReport CLI → verification-report.md
                S-->>W: outcome
            else remediate
                S->>S: renderRemediationPhase CLI; insert at §3.7's two points; re-parse; assemble waves + prompts
                S-->>W: implement-phase args
                W->>P: workflow('implement-phase', args)
                P-->>W: phase result
                Note over W: next iteration exercises priorGaps + the regression subset (§3.3)
            end
        end
        W-->>C: { outcome, criteria[], reportPath, iterations }
    end
```

### 2.4 State Management

Four durable artifacts, three lifetimes:

| Artifact | Lifetime | Writer | Tracked |
|----------|----------|--------|---------|
| `.trd-state/<feature>/success-definition.md` | per feature | derive agent (`product-manager`) | yes |
| `.trd-state/<feature>/verification.json` | per feature | Persist agent, via `implement-state.save()` | yes |
| `.trd-state/<feature>/verification-report.md` | per feature, rewritten per run | Persist agent (command, on the two `not run` paths) | yes |
| `.trd-state/<feature>/evidence/` | per run | exerciser agents | **no** (D10) |
| `.claude/verification-notes.md` | per project, cumulative | `verify-app` | yes |

A re-trigger reads all of these and resumes: the definition is not re-derived, prior gaps
and prior iteration count are already on disk, and the notes carry what was learned about
how to start the app.

---

## 3. Technical Specifications

### 3.1 Success definition — `.trd-state/<feature>/success-definition.md`

**Purpose**: the promise the verifier checks against. Derived from the PRD alone (D5).

**Format** — a header block plus one table, one criterion per row (D-9a-3):

```markdown
# Functional Success Definition: <feature>

**Source PRD**: docs/PRD/<feature>.md
**Derived**: <ISO8601>
**Criteria**: <n>

| ID | Functional statement | Cites | Evidence that would prove it | Derivation |
|----|----------------------|-------|------------------------------|------------|
| FS-1 | A user can sign in with a valid password and reach the dashboard | FR-2, §4 line 51 | HTTP transcript: POST /auth/login → 200 with a session cookie; screenshot of the dashboard | [read] |
| FS-2 | A repeated submit does not create two orders | domain-derived: payment flows must not double-charge | Two POSTs with one idempotency key → one row in `orders` | domain-derived |
```

**Behavior**:
- Every row's `Cites` names a PRD line, or the row is labelled `domain-derived` with its
  reasoning inline. A row that can do neither is **dropped, not invented** (FR-1, AC-2).
- Zero rows is a legitimate outcome. The file is still written, with `**Criteria**: 0` and a
  one-paragraph statement of why the PRD yielded none (AC-3).
- `Evidence that would prove it` is what the exerciser aims to produce. It is a target, not
  a contract — an exerciser that produces a *different* artifact that proves the same thing
  records why in the notes.

**Error handling**:
- PRD path does not resolve → the file is not written; the command reports
  `not run: no PRD resolved` in the report and the banner. This is **distinct** from AC-3's
  empty definition and must not be reported as one.
- The file is absent when Step 7.3 begins → `not run: no definition produced` (TR3), which is
  again **distinct** from AC-3's empty definition. Step 7.3 reports it and does not call the
  workflow at all — there are no criteria to pass in `args`. The command does **not** wait on the
  background task and does **not** derive a definition inline: there is no attested primitive
  for a lead to block on a specific `Agent({run_in_background: true})`
  (`.claude/rules/async-discipline.md`, "Orchestration pattern: the scheduled nudge" — the
  documented mechanism is `ScheduleWakeup` plus `dispatch-ledger.js --open`, neither of which
  is a blocking wait), and an inline derivation would be a second production path for
  `success-definition.md` outside FV-P001's contract, without the mandatory-citation
  discipline R1 and AC-2 depend on. Step 7.3 runs at the tail of the run, hundreds of tool
  calls after the Step 3.6 dispatch, so an absent file means the agent died — which is
  information the report must carry, not a gap to paper over.

### 3.2 Evidence gate — `checkEvidence()`

**Purpose**: tier 1 of FR-3. Deterministic, cheap, and not settable by an agent.

**Interface**:

```typescript
interface EvidenceClaim {
  criterion: string;       // "FS-1"
  artifact: string | null; // repo-relative path, or null when the exerciser produced none
  reason?: string;         // why no artifact exists
}

interface EvidenceVerdict {
  criterion: string;
  tier1: 'pass' | 'fail';
  artifact: string | null;
  bytes: number | null;
  mtimeSec: number | null;
  failure?: 'missing' | 'empty' | 'stale' | 'no-artifact';
}

function checkEvidence(claims: EvidenceClaim[], sinceSec: number): EvidenceVerdict[];
```

**Behavior**:
- `missing` — the path does not exist.
- `empty` — it exists with zero bytes.
- `stale` — its mtime is not strictly greater than `sinceSec` (the HEAD commit time,
  supplied by the command from `git log -1 --format=%ct`). An artifact older than the code
  it claims to prove is not evidence.
- `no-artifact` — the claim carried none. Tier 1 fails; the criterion can still resolve to
  `not verifiable here` on the judge's reading of the stated reason.
- Pure apart from `fs.statSync`. No git, no clock: `sinceSec` is a parameter so the function
  is testable without a repository.

**CLI**: `node .claude/lib/functional-verification.js check-evidence '<claims-json>' <sinceSec>`
prints the verdict array as JSON. This is what the judge agent invokes (D4).

### 3.3 The loop — `verify-functional.js`

**Purpose**: the whole bounded loop, as a workflow (D1). One call in, one outcome out.

**Interface**:

```typescript
// args
interface VerifyFunctionalArgs {
  criteria: Array<{ id: string; statement: string; cites: string; evidence: string; derivation: string }>;
  contract: string;      // functional-verification.md text — the workflow cannot read files
  notes: string;         // .claude/verification-notes.md text, or "" when it does not exist
  stackHints: string;    // stack.md + CLAUDE.md excerpts the command resolved
  evidenceDir: string;   // ".trd-state/<feature>/evidence"
  checker: string;       // ".claude/lib/functional-verification.js"
  since: number;         // HEAD commit time, seconds
  cap: number;           // iteration cap, 3 (§3.4)
  trd: string;           // TRD path — cited in prompts, opened only by the Persist agent
  prefix: string;        // the TRD's task-ID prefix, e.g. "FV"
  phaseNumber: number;   // max existing phase + 1, for the first remediation phase
  existingIds: string[]; // task ids already in the TRD, for uniqueness
  statePath: string;     // ".trd-state/<feature>/verification.json"
  reportPath: string;    // ".trd-state/<feature>/verification-report.md"
  gate: { verifyPrompt: string; simplifyPrompt: string; reviewPrompt: string };
  resume: { iteration: number; priorGaps: string[] } | null;  // from a prior run's state file
  project: string;       // "" when the target is the repo the workflow runs in
}

// return
interface VerifyFunctionalResult {
  outcome: 'satisfied' | 'stalled' | 'stuck';
  reason: string;
  iterations: number;
  reportPath: string;
  criteria: Array<{
    id: string;
    status: 'met' | 'not_met' | 'not_verifiable';
    tier1: 'pass' | 'fail' | 'skipped';
    artifact: string | null;
    reason: string | null;   // required when status is not 'met'
    files: string[];         // implicated source files, for the remediation phase's Touches
    lastExercisedIteration: number | null;  // null when never exercised
  }>;
  gaps: string[];
  exercised: string;         // "5/6" for the final iteration — dead agents are visible, not laundered
  remediationPhases: number[];
  notesUpdated: boolean;
}
```

**Behavior** — the script's top level is a bounded `for` loop, `iteration = 1..cap`. Each
iteration runs three stages in order:

- **Exercise stage**: `parallel()` over the **in-scope** criteria, `agentType: 'verify-app'`,
  one thunk per criterion. Each agent receives the contract text, the notes text, the stack
  hints, its own criterion, and the evidence directory to write into.
- **Judge stage**: `parallel()` over the same in-scope criteria, untyped (D7). Each judge runs
  the checker CLI over its criterion's claim **first** and skips content analysis when tier 1
  fails, recording `tier1: 'fail'` and `status: 'not_met'`.
- **Persist stage**: one untyped agent, §3.3a. It is where the loop's arithmetic and every disk
  touch happen, and it returns either an exit outcome or the assembled `implement-phase` args.
  On `remediate` the script then calls `workflow('implement-phase', args)` and continues the loop.

**Which criteria are in scope** (owner decision, 2026-08-17, OQ-1 — *failed plus regression
subset*, not full re-verify):

- Iteration 1: every criterion in `args.criteria`.
- Iteration *i* > 1: `priorGaps` ∪ `regression`, where `regression` is every criterion whose
  recorded `files` intersect the union of the `Touches` lists on the tasks the previous
  iteration's remediation phase dispatched. Both sets are already in the workflow's hands —
  `priorGaps` from the previous Persist result and the `Touches` union from the args it
  assembled — so no new input and no extra agent is needed to compute it.
- A criterion in neither set is **not re-exercised**. Its previous status, artifact and reason
  carry forward verbatim into the verdict and into the report, with `lastExercisedIteration`
  naming the iteration that produced them, so AC-9's "every criterion appears" holds and a
  carried-forward pass is never mistaken for a fresh one.
- `resume.priorGaps` from a prior run's state file seeds `priorGaps` on iteration 1 when the
  loop is re-entered, which is the only case where iteration 1 is narrowed.

Rationale for narrowing: full re-verify is 3N exercise-plus-judge dispatches for N criteria.
The narrowed set is bounded by |gaps| plus whatever the fix actually touched, which is the
smallest set that still catches R2's "remediation for one criterion breaks another" — a break
can only reach a criterion through a file the remediation changed.

Other behavior:
- `not_verifiable` is returned when the project has no way to exercise the criterion — an
  absent harness, an unmatched stack, or a target `stack.md` does not authorize. It is never
  a substitute for `not_met`. A `not_verifiable` criterion is **not** a gap and is never
  remediated; it is carried forward unexercised on later iterations.
- `files` is populated on `not_met` so the remediation phase gets real `Touches` entries, and
  is retained on `met` so the regression subset can be computed.

**Error handling**:
- A dead `agent()` call returns `null`. Following `implement-phase.js` verbatim: record the
  criterion as `not_met` with `reason: "agent returned nothing"` rather than dereferencing
  it, and reflect the loss in `exercised`. A dead reviewer must never read as a clean one.
- A dead **Persist** agent is the one case that cannot be recorded and continued: nothing was
  written to disk and the loop has no decision. Following `audit-trd.js`'s Index stage, it is a
  thrown error via `required()` — the command sees the throw and reports `stuck`, which is
  honest, where continuing would silently drop an iteration's state.
- A `workflow('implement-phase', …)` call that throws is caught: the iteration records the
  remediation as failed, and the loop exits `stuck` with that reason rather than re-exercising
  against a phase that never ran.
- `readArgs` / `required` guards are copied from `implement-phase.js`, which copied them from
  `audit-trd.js`. Missing `criteria` is a thrown error (nothing downstream can run); an
  **empty** `criteria` array is not — it skips Exercise and Judge entirely, runs one Persist
  agent to write the empty report, and returns `outcome: 'satisfied', gaps: []` with
  `exercised: "0/0"` and `iterations: 0`. That is AC-3's correct outcome, not a crash.

### 3.3a Persist stage — the loop's hands

**Purpose**: the workflow script has no filesystem, no shell and no `require` (D3). Everything
in this feature that touches disk or the lib module is done by one untyped agent per iteration,
dispatched by the script with a fully-specified instruction set.

**What it is given**: the iteration number, the judge verdicts, the carried-forward statuses,
`args.statePath`, `args.reportPath`, `args.trd`, `args.prefix`, `args.phaseNumber`,
`args.existingIds`, `args.cap`, `args.gate` and the previous iteration's `priorGaps`.

**What it does, in order**:
1. `node .claude/lib/functional-verification.js decide-next '<json>'` — the loop-exit decision
   comes from the module (§3.4), never from the agent's own reading.
2. Writes `verification.json` through `implement-state.save()` (D9) **before** anything is
   dispatched — state-write-before-delegate, matching Step 4.1.
3. On any exit action: `render-report` over the full criterion set, written to
   `args.reportPath`. Returns the outcome.
4. On `remediate`: `render-remediation` over the gaps, inserts the two returned strings at
   §3.7's two insertion points in the TRD, re-parses the mutated file through `trd-parser.js`
   and `task-graph.js`, filters the waves to the new phase's task ids exactly as Step 4.2 does,
   assembles each task's delegation prompt and passes `args.gate` through unchanged, and returns
   that args object plus the phase's `Touches` union.

**Why an agent and not the script**: this is the mechanism the `Workflow` contract leaves open —
the script cannot open a file, but the agents it dispatches have `Read`, `Write` and `Bash`. Every
*decision* it makes still comes from the CLI; the agent supplies hands, not judgment. The one
judgment-shaped step is placing two rendered strings at two named headings, which is why §3.7
specifies the insertion points literally rather than saying "append".

### 3.4 Loop decision — `decideNext()`

**Purpose**: FR-4's three exits, as arithmetic (AC-5).

**Interface**:

```typescript
type LoopAction = 'exit-satisfied' | 'exit-stalled' | 'exit-stuck' | 'remediate';

function decideNext(input: {
  iteration: number;        // 1-based, the iteration whose verdict this is
  gaps: string[];
  previousGaps: string[] | null;   // null on iteration 1
  cap?: number;             // default 3
}): { action: LoopAction; reason: string; closed: string[] };
```

**Behavior**, evaluated in this order:
1. `gaps.length === 0` → `exit-satisfied`.
2. `previousGaps` is non-null and `closed.length === 0` → `exit-stalled`. `closed` is
   `previousGaps \ gaps`. An iteration that closes nothing is repeating itself.
3. `iteration >= cap` → `exit-stuck`.
4. otherwise → `remediate`.

The cap is **3**, matching `implement-trd.md`'s existing retry convention (`:599`) —
inherited, not chosen here. It reaches the function as `args.cap` (§3.3) so the workflow and the
module cannot disagree about it; the `cap = 3` default exists for the module's own unit tests.

`gaps` counts `not_met` only. A `not_verifiable` criterion is not a gap — it cannot be closed by
remediation, and counting it would make every unverifiable project exit `stuck` after three
empty remediation phases.

### 3.5 Remediation phase — `renderRemediationPhase()`

**Purpose**: turn gaps into a phase the existing workflow can dispatch (D8, AC-7).

**Interface**:

```typescript
function renderRemediationPhase(input: {
  gaps: Array<{ id: string; statement: string; reason: string; files: string[] }>;
  prefix: string;          // the TRD's task-ID prefix, e.g. "FV"
  phaseNumber: number;     // max existing phase + 1
  existingIds: string[];   // to guarantee ID uniqueness
  iteration: number;
}): { markdown: string; grounding: string; taskIds: string[] };
```

**Behavior**:
- One task per gap: `### Phase <n>: Functional remediation (iteration <i>)` followed by a
  Master-Task-List-shaped table whose rows carry `Serves` = the criterion id, and a matching
  Task Grounding block per task with `Touches` = the judge's `files`.
- **Serialization fallback**: any gap whose `files` is empty makes the whole phase a serial
  chain — each task lists the previous task in `Dependencies`. An empty `Touches` conflicts
  with nothing in `task-graph.js` by design, so without this two blind fixes could run
  concurrently against the same file. This is the mechanical half of R2's mitigation.
- The markdown it emits is parseable by `trd-parser.js` as written — same heading shape,
  same column set, same grounding bullet fields.

### 3.6 Report — `renderReport()`

**Purpose**: FR-6, AC-9.

**Interface**:

```typescript
function renderReport(input: {
  feature: string;
  prd: string;
  definitionPath: string;
  outcome: 'satisfied' | 'stalled' | 'stuck' | 'not-run';
  reason: string;
  criteria: Array<{
    id: string; statement: string; cites: string;
    status: 'met' | 'not_met' | 'not_verifiable';
    artifact: string | null; reason: string | null;
    attempts: Array<{ iteration: number; tasks: string[]; result: string }>;
    blocker: string | null;
  }>;
}): string;   // markdown
```

**Behavior**: every criterion in the definition appears in the report, including
`not_verifiable` ones and including criteria that were met on an early iteration and never
re-examined because the narrowed re-verify set (§3.3) excluded them — those render with the
iteration that last exercised them, so a carried-forward pass is legible as one (AC-9). `not_verifiable` renders in its own section with the stated reason, not
folded into failures.

### 3.7 Command surface — `/implement-trd`

**Flag**: `--verify-functional`. Absent → nothing in this TRD executes, including the
background derive pass (AC-6). The usage block, the `Parse:` line and the Execution Model
diagram all name it.

**Step 3.6 (new)** — after the graph is built and before the phase loop, when the flag is
set: resolve the PRD path, then

```
Agent({ subagent_type: "product-manager", run_in_background: true, name: "success-definition",
        prompt: <contract text> + <PRD path> + <output path> })
```

The prompt names the PRD path and the output path and **nothing else** — no TRD path, no TRD
excerpt, no task list (FR-1, AC-1). `product-manager` is the roster agent whose declared mandate
is *"Analyze user needs and define acceptance criteria"* (D5); its frontmatter already carries
`background: true`.

**Step 7.3 (new)** — after Step 7.2, and it is **one dispatch**, not a loop (D1):

1. Read `.trd-state/<feature>/success-definition.md`. Absent → report
   `not run: no definition produced` (TR3) and stop. An unresolvable PRD at Step 3.6 → report
   `not run: no PRD resolved` and stop. Both reports are rendered through the lib CLI's
   `render-report` so there is one renderer, and both are distinct from AC-3's empty definition.
2. Read `.claude/verification-notes.md` (or `""`), the `stack.md` / `CLAUDE.md` excerpts, and
   the contract text. Resolve `since` from `git log -1 --format=%ct`. Read the TRD's task-ID
   prefix, its highest existing phase number and its existing task ids. Assemble the three gate
   prompts exactly as Step 4.2 does. Read `verification.json` if a prior run left one, for
   `resume`.
3. `Workflow({ name: "verify-functional", args: { … §3.3 … } })` — once.
4. Render the returned outcome into Step 8's banner. Nothing else.

The TRD mutation, the re-parse, `verification.json` and the report all happen inside the
workflow's Persist stage (§3.3a). None of them recompute `trd_hash` — it has no producer
anywhere in the live tree and no consumer that would notice; re-parsing is what actually picks
up the inserted tasks.

**TRD insertion points** — the two literal headings the Persist agent inserts at, named here so
they are not re-derived: the phase table goes inside `## 4. Master Task List` (before the next
`##`), and the grounding blocks inside `## 9. Task Grounding` (before the next `##`).
`findSection()` bounds a section at the next heading of equal-or-lower level, so an end-of-file
append is invisible to `parseTrd` and the dispatch that follows is a silent no-op reading as
success.

**Step 8** — the completion banner gains a FUNCTIONAL VERIFICATION block naming the outcome,
the met/unmet/unverifiable counts and the report path. When the flag was not passed, the
block reads `not run (--verify-functional not set)` rather than being omitted, so its absence
is never mistaken for a pass.

---

## 4. Master Task List

### 4.1 Task ID Convention

Task IDs follow `[PREFIX]-[CATEGORY][SEQ]` with PREFIX `FV`.

- `P` = Plugin/Infrastructure setup, `B` = Backend implementation, `T` = Testing,
  `D` = Documentation, `I` = Integration, `R` = Remediation (emitted only by
  `renderRemediationPhase()`; added to the shared convention by FV-P001 — OQ-6).
- `[LIVE]` marks tasks that require verification against a running instance, overriding
  `constitution.md`'s project-level `verification_level: unit-only`.

### 4.2 Phase 1: Contract and deterministic core

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| FV-P001 | Write `packages/core/contracts/functional-verification.md`: the derive discipline (mandatory PRD citation, `domain-derived` labelling, empty-is-correct), the D12 stack-keyed harness hint table, what counts as an evidence artifact, the `[read]`/`[ran]`/`[inferred]` notes discipline and correct-don't-work-around rule, the credential rule (S-1), the authorization rule (S-2), and the report shape. Mirror to `.claude/contracts/`. **Also** add one line — `` `R` = Remediation `` — to the `[CATEGORY]` list in `packages/core/contracts/trd-authoring.md` §4.1 and its `.claude/` mirror, so the letter `renderRemediationPhase()` emits stops being undocumented (OQ-6) | FR-1, FR-3, FR-5, FR-6, AC-2, AC-3, S-1, S-2, D12, OQ-6 | | None | The contract exists in both trees and is byte-identical; it states the citation rule, the empty-definition rule, the four stack hint rows, the three derivation markers, and that credentials are recorded by location only; it contains no instruction to invent a criterion or a harness; `trd-authoring.md` §4.1's category list carries `R = Remediation` in both trees and its other six letters are unchanged |
| FV-B001 | Build `packages/core/lib/functional-verification.js` per §3.2–§3.6 — `checkEvidence`, `decideNext`, `renderRemediationPhase`, `renderReport`, plus a CLI exposing all four as subcommands (`check-evidence`, `decide-next`, `render-remediation`, `render-report`; D3 — the workflow has no `require` and reaches the module only this way) — with its Jest suite. Mirror to `.claude/lib/` | FR-3, FR-4, FR-6, AC-4, AC-5, AC-9, D3, D8, R2 | `jest` | None | Unit tests cover all four `checkEvidence` failure modes, all four `decideNext` branches including `previousGaps === null`, the empty-`files` serial-chain fallback in `renderRemediationPhase`, and a `renderReport` case containing one criterion of each status; the rendered remediation markdown round-trips through `trd-parser.js` to the expected task and grounding records; each of the four CLI subcommands is covered, including its JSON in/JSON-or-markdown out shape; `decideNext` honours `args.cap` rather than only its default, and `not_verifiable` criteria are excluded from `gaps`; the module uses no clock and no git; coverage of the module meets §6.1's unit-test floor (>= 60%, `constitution.md` Quality Gates) |

### 4.3 Phase 2: The loop workflow

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| FV-B002 | Build `packages/core/workflows/verify-functional.js` per §3.3/§3.3a — **the whole bounded loop** (D1): per iteration, Exercise stage (`parallel`, `agentType: 'verify-app'`, thunks), Judge stage (`parallel`, untyped, checker-first), Persist stage (one untyped agent running the lib CLI and touching disk), then `workflow('implement-phase', …)` on `remediate`. Includes the narrowed re-verify set (§3.3, OQ-1). With its Jest suite via `workflows/test-harness.js`. Mirror to `.claude/workflows/` | G2, FR-2, FR-3, FR-4, AC-4, AC-5, AC-7, D1, D2, D4, D7 | `jest` | FV-P001, FV-B001 | The script opens no file, runs no shell, uses no `require`, and uses no `Date.now()`/`Math.random()`/argless `new Date()`; tests assert Exercise completes before Judge dispatches and Judge before Persist, that `agentType: 'verify-app'` is passed on Exercise and absent on Judge and Persist, that a `null` Exercise/Judge result yields `not_met` with a stated reason and is reflected in `exercised` while a `null` Persist result throws, that an empty `criteria` array runs one Persist agent and no Exercise/Judge dispatch and returns `outcome: 'satisfied'` with `iterations: 0`, that the judge prompt instructs the checker CLI call before any content reading, that iteration 2 exercises only `priorGaps` plus criteria whose `files` intersect the previous remediation's `Touches` union while unexercised criteria carry their prior status and `lastExercisedIteration` forward, that remediation is dispatched through `workflow('implement-phase', …)` and never through `agent(`, and that the loop stops at `args.cap`; coverage meets §6.1's unit-test floor (>= 60%, `constitution.md` Quality Gates) |
| FV-B003 | Repoint `packages/full/agents/verify-app.md`: add a Functional Success Definition mode (input is one criterion, output is a claim plus an artifact path or a stated reason, never a verdict on its own evidence), the D12 hint table, the `stack.md`/`CLAUDE.md` read mandate, S-2's authorization rule, and the `.claude/verification-notes.md` read/write discipline. Mirror to `.claude/agents/` | FR-2, FR-5, AC-8, D6, D12, S-2 | | FV-P001 | The existing TRD-acceptance-criteria mode and Verification Level Enforcement are unchanged and still first in the file; the new mode states that the agent does not decide `met`/`not met`; the notes section names the three derivation markers and the correct-on-failure rule; `agent-validation.test.js` still passes with 13 agents |
| FV-B004 | Add `--verify-functional` to `/implement-trd` (`packages/core/commands/implement-trd.md`): usage block, `Parse:` line, Execution Model diagram, and Step 3.6's background derive dispatch with PRD-path resolution (TRD `**Source PRD**:` header → `.trd-state/current.json`). Mirror to `.claude/commands/` | FR-1, AC-1, AC-6, D5, D11 | | FV-P001 | Without the flag no derive agent is dispatched and no `.trd-state/*/success-definition.md` appears; with it the dispatch is `subagent_type: "product-manager"` with `run_in_background: true`, and its prompt contains the PRD path and the contract text and **no** TRD path or TRD excerpt; an unresolvable PRD path is reported as `not run: no PRD resolved`, distinct from an empty definition; `constitution.md`'s agent roster is unchanged and `agent-validation.test.js` still passes with 13 agents |

### 4.4 Phase 3: Command surface

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| FV-B005 | Add Step 7.3 to `/implement-trd` per §3.7 — **one dispatch, not a loop** (D1): read the definition from disk (absent → `not run: no definition produced` per §3.1/TR3; never wait on the background task and never derive one inline — no primitive exists for a lead to block on a specific `Agent({run_in_background})`, and an inline derivation would bypass FV-P001's citation discipline), read the notes / stack hints / contract, resolve `since` from `git log -1 --format=%ct`, read the TRD's prefix, highest phase number and existing task ids, assemble the three gate prompts as Step 4.2 does, then make a single `Workflow(verify-functional, …)` call and render its outcome. Also extend Step 6's state-file documentation and Step 8's banner, and add `.trd-state/*/evidence/` to `.gitignore`. Mirror to `.claude/commands/`. **Split from FV-B004 despite sharing `implement-trd.md`** on both permitted grounds: size (a whole new step with input resolution, gate-prompt assembly, banner and `.gitignore` work would return a partial result VERIFY could not judge alongside the flag work) and verifiability (AC-1/AC-6 and AC-3/AC-9 are separately checkable) | G2, FR-2, FR-6, AC-3, AC-9, D1, D9, D10, D11 | | FV-B001, FV-B002, FV-B003, FV-B004 | Step 7.3 sits after Step 7.2 and before Step 8; it contains exactly one `Workflow(` call and **no** iteration, no `decideNext` reasoning in prose, no TRD mutation and no `Agent(` call — all of those live in FV-B002's workflow; an absent definition file is reported as `not run: no definition produced` and no definition is derived inside Step 7.3; both `not run` reports are rendered through the lib CLI's `render-report`; the args it assembles carry every field §3.3 names, including a non-empty `gate` block (`implement-phase.js` dereferences `GATE.verifyPrompt`/`simplifyPrompt`/`reviewPrompt` unconditionally); `.gitignore` excludes evidence while the definition, report and notes stay tracked |

### 4.5 Phase 4: End-to-end

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|---------------------|
| FV-T001 | `[LIVE]`: add `test/smoke/scenarios/verify-functional.sh` and register it in `run-smoke.sh`'s `SCENARIO_TIMEOUT` and `LLM_OPT_IN_SCENARIOS`. It scaffolds a throwaway project with a one-requirement PRD and a matching one-task TRD, runs `/implement-trd` **without** the flag and asserts no success definition appears, then runs it **with** the flag and asserts the definition, the report and a COMMAND COMPLETE banner | AC-1, AC-6, AC-9, G3 | | FV-B005 | Both runs terminate with a banner; the no-flag run leaves no `success-definition.md`; the flag run produces a definition whose every row carries a `Cites` value or a `domain-derived` label, and a report naming every criterion in the definition; the scenario is opt-in (absent from `ALL_SCENARIOS`) and skips rather than fails when `claude` or `jq` is unavailable |

---

## 5. Execution Plan

### 5.1 Phase Overview

| Phase | Focus | Prerequisites | Parallelizable Sessions |
|-------|-------|---------------|------------------------|
| 1 | Contract and deterministic core (each task ships its own unit tests) | None | 1A, 1B in parallel |
| 2 | The loop workflow, `verify-app`'s second mode, the command flag | Phase 1 complete | 2A, 2B, 2C in parallel |
| 3 | Command surface — Step 7.3's single dispatch | Phase 2 complete | Single session |
| 4 | `[LIVE]` end-to-end | Phase 3 complete | Single session |

Unit tests ship inside FV-B001 and FV-B002; there is no separate unit-test task. FV-T001 is
the one thing that legitimately needs the whole system assembled.

### 5.2 Session Details

#### Phase 1

**Session 1A: Contract**
- Tasks: FV-P001
- Agent: @agent-implementer
- Can parallelize with: Session 1B

**Session 1B: Deterministic core**
- Tasks: FV-B001
- Agent: @backend-implementer
- Can parallelize with: Session 1A

#### Phase 2

**Session 2A: The loop workflow**
- Tasks: FV-B002
- Agent: @backend-implementer
- Blocked by: Sessions 1A, 1B

**Session 2B: verify-app repointing**
- Tasks: FV-B003
- Agent: @agent-implementer
- Blocked by: Session 1A
- Can parallelize with: 2A, 2C

**Session 2C: Command flag and derive dispatch**
- Tasks: FV-B004
- Agent: @agent-implementer
- Blocked by: Session 1A
- Can parallelize with: 2A, 2B

#### Phase 3

**Session 3A: Step 7.3**
- Tasks: FV-B005
- Agent: @agent-implementer
- Blocked by: 2A, 2B, 2C

#### Phase 4

**Session 4A: End-to-end**
- Tasks: FV-T001
- Agent: @backend-implementer
- Blocked by: 3A

### 5.3 Parallelization Map

```mermaid
gantt
    title Execution Plan (No time scale - dependency order only)
    dateFormat X
    axisFormat %s

    section Phase 1
    Session 1A (FV-P001): p1a, 0, 1
    Session 1B (FV-B001): p1b, 0, 1

    section Phase 2
    Session 2A (FV-B002): p2a, after p1a p1b, 1
    Session 2B (FV-B003): p2b, after p1a, 1
    Session 2C (FV-B004): p2c, after p1a, 1

    section Phase 3
    Session 3A (FV-B005): p3a, after p2a p2b p2c, 1

    section Phase 4
    Session 4A (FV-T001): p4a, after p3a, 1
```

### 5.4 Critical Path

`FV-P001 → FV-B002 → FV-B005 → FV-T001`, with `FV-B001 → FV-B002` joining at the same
point. FV-B003 and FV-B004 are off the critical path and can absorb slack.

FV-B004 and FV-B005 both touch `packages/core/commands/implement-trd.md` and therefore
serialize under `task-graph.js`'s file-conflict edge regardless of the phase boundary. That
serialization is intended, and the split is justified in FV-B005's row.

### 5.5 Offload Recommendations

| Task | Recommended Agent | Rationale |
|------|-------------------|-----------|
| FV-P001, FV-B003, FV-B004, FV-B005 | @agent-implementer | Contract text, agent prompts and command prompts are prompt engineering, which is that agent's stated domain |
| FV-B001, FV-B002 | @backend-implementer | JavaScript modules with Jest suites. FV-B002 now carries the loop as well as the fan-out (D1), which is control flow in JavaScript, not prompt text — the Persist agent's *instruction* text is the one prompt-shaped part of it |
| FV-T001 | @backend-implementer | BATS scenario plus shell fixture plumbing |

---

## 6. Quality Requirements

### 6.1 Testing Requirements

| Type | Coverage Target | Source | Scope |
|------|-----------------|--------|-------|
| Unit Tests | >= 60% | `constitution.md` Quality Gates | `packages/core/lib/functional-verification.js`, `packages/core/workflows/verify-functional.js` |
| Integration Tests | >= 50% **when applicable — not applicable here** | `constitution.md` Quality Gates ("when applicable") | This feature's integration surface is `test/smoke/scenarios/verify-functional.sh`, a BATS-driven live scenario. No coverage instrumentation exists for shell in this repository (`package.json`'s test script is `jest`; no kcov configuration exists anywhere outside design documents; `.github/workflows/ci.yml`'s `bats` job installs and invokes `bats` directly with no coverage step — read in full during the 2026-08-17 audit), so no percentage is measurable. The integration objective is discharged by FV-T001's named assertions instead |

No figure here exceeds a `constitution.md` floor.

### 6.2 Code Quality Standards

`constitution.md`'s Quality Gates also require, before completing any implementation: no
secrets in code, input validation present, documentation updated. The first is sharpened by
S-1 below; the third is satisfied inside FV-B005 (Step 6 and Step 8 documentation) rather
than as a separate documentation task.

`stack.md` names Prettier, ESLint and ShellCheck under Code Quality. Neither Prettier nor
ESLint is installed in this repository (`package.json` devDependencies are `bats`, `jest`,
`js-yaml`, `mock-fs`), so no lint gate is asserted for the JavaScript here — the same
finding `implement-trd-rework.md` v1.1.0 recorded and acted on.

### 6.3 Security Requirements

| ID | Objective | Source |
|----|-----------|--------|
| S-1 | `.claude/verification-notes.md`, the report and the success definition record **where** a credential comes from, never its value. The notes file is committed | `docs/modernization/2026-08-improvement-plan.md` item 9a: *"Security is unchanged: the file is committed. It records WHERE credentials come from, never their values"* |
| S-2 | The verifier exercises only a target the project authorizes — `stack.md`, `CLAUDE.md` or an explicitly local/ephemeral instance. Where nothing authorizes a target, the criterion resolves to `not verifiable here` rather than to a guessed endpoint | **domain-derived.** This feature hands an autonomous loop a browser, a shell and up to three remediation rounds. An unauthorized target is not a quality problem but a production-impact one, and the PRD's own non-goal ("how to exercise a given system is the project's responsibility") leaves target selection undefined — silence there is exactly where an agent would improvise |

### 6.4 Performance Requirements

None. No latency, throughput or uptime figure is stated in the PRD, in `stack.md`, in
`constitution.md`, or by the user. The one cost question anyone raised — what a verification
cycle costs — is an explicit PRD Open Question with no measurement behind it yet, and it is
the reason AC-6 makes the loop opt-in. Inventing a budget here would consume a task proving a
number nobody asked for; see OQ-1.

---

## 7. Risk Assessment

### 7.1 Risks Imported from PRD

| PRD Risk ID | Risk | Technical Mitigation |
|-------------|------|---------------------|
| R1 | The success definition manufactures criteria the PRD does not support | The citation rule is in the contract (FV-P001) and the definition's table has a mandatory `Cites` column (§3.1). A row with neither a citation nor a `domain-derived` label is dropped by the deriving agent, and its absence is visible because the report names every row that survived |
| R2 | Remediation for one criterion breaks another | Dispatch as a phase (D8), inheriting `task-graph.js`'s file-conflict serialization. Sharpened here: the judge returns implicated `files` per gap so the remediation tasks have real `Touches`, and `renderRemediationPhase()` falls back to a serial chain when it does not — an empty `Touches` conflicts with nothing by design and would otherwise defeat the very mechanism this mitigation relies on |
| R3 | Cost per cycle makes it unaffordable | Opt-in behind `--verify-functional` (D11). The E2E scenario is registered opt-in rather than in `ALL_SCENARIOS`, so it does not add cost to the default smoke run either |
| R4 | Notes accumulate wrong beliefs with no reviewer | Derivation markers and correct-on-failure are in the contract (FV-P001) and in `verify-app`'s prompt (FV-B003). The file is committed, so it is at least diff-reviewable |
| R5 | The verifier reports green for checks that never ran | `not verifiable here` is a distinct status all the way through the type: the workflow's return schema, `renderReport()`'s sections, and the completion banner's counts. The `exercised: "n/m"` field makes a dead agent visible rather than laundering it into a pass — the same defect `implement-phase.js` fixed with its `*Reported` flags |

### 7.2 Technical Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| TR1 | **FR-2's ordering is not fully achievable as written.** Step 7.2 dispatches `/code-review` and deliberately does **not** block on it (it forks to background subagents). Verification at Step 7.3 therefore runs after Step 7.1's *applied* hardening fixes, but possibly before Step 7.2's review fixes land | High | Med | Do not paper over it: Step 7.3 records in `verification.json` and in the report which review passes had completed when the loop started. Step 7.1's fan-out **is** blocking and is where fixes are applied inline, so the majority of "code after review" is real. **Owner-confirmed 2026-08-17 (OQ-2)**: the gap is resolved by sequencing, not by making Step 7.2 blocking — verification stays last and records what had landed |
| TR2 | Inserting a remediation phase mutates the TRD mid-run, invalidating the parse the command has in hand | Med | Med | The Persist agent (§3.3a, built in FV-B002) re-parses through `trd-parser.js`/`task-graph.js` before the script dispatches `workflow('implement-phase', …)`, so the wave partition sees the mutated document. It does **not** recompute `trd_hash` — §3.7 governs: nothing in `packages/core/lib/` or in `implement-trd.md` computes or compares that value (Step 2.3 requires only that the field be *present*), so there is no consumer a stale hash could mislead and computing one here would make this task the field's first producer for no reader. FV-B001's round-trip test (rendered markdown → parser → expected records) is what keeps the renderer and the parser from drifting |
| TR3 | The background derive agent is dispatched at Step 3.6 and read at Step 7.3, hundreds of tool calls later. If it died, the loop sees an absent file | Med | Low | Two outcomes are kept distinct by construction: an absent file is `not run: no definition produced`, a present file with zero rows is AC-3's correct empty outcome. Conflating them would report a crashed agent as "the PRD had nothing to verify" |
| TR4 | **D1 rests on `workflow()`-invokes-`workflow()`, which is documented in the `Workflow` tool's contract but exercised nowhere in this repository** — `grep` finds zero `workflow(` calls in `packages/core/workflows/` | Low | High | The contract is explicit that nesting is permitted to one level and that only a *child* calling `workflow()` throws, and this design uses exactly one level. It is nonetheless the first use here, so it is listed under Could Not Verify with the check that settles it, and FV-B002's test suite asserts the call through `test-harness.js`'s stub rather than proving the platform honours it. If the platform rejects it, the contingency is to move the remediation dispatch — and only that — back to the command: the workflow returns `outcome: 'remediate'` with the assembled args, the command dispatches `Workflow(implement-phase, …)` and re-enters `verify-functional` with `resume` set. The loop, the narrowing and the report stay where D1 puts them |

### 7.3 Contingency Plans

**TR1 Contingency**: if a costed run shows review fixes routinely landing after verification
started, the fix is to make Step 7.2 blocking for the `--verify-functional` path only, not to
move verification earlier. Verification must stay last; that is FR-2's substance.

**TR2 Contingency**: if re-parsing after mutation proves unreliable, the fallback is for the
Persist agent to write the remediation phase to the TRD and return an exit outcome of `stuck`
with the phase staged but undispatched, so the operator re-enters via `/implement-trd --resume`.
A wrong wave partition is worse than a manual re-entry.

---

## 8. Non-Goals (Scope Boundaries)

The following are **explicitly out of scope** per the PRD. Implementation agents MUST reject
requests that fall into these categories.

The PRD states these as four unlabelled bullets (`docs/PRD/functional-verification.md` §3).
The `NG1`–`NG4` identifiers below are **this TRD's**, assigned so the decisions and tasks above
can reference them; they are not PRD-assigned IDs.

| ID (TRD-local) | Non-Goal (PRD §3) | Rationale |
|--------|----------|-----------|
| NG1 | Replacing any existing verification | Per-task unit tests, the phase gate and `/audit-build` all stay. This adds the functional layer none of them cover |
| NG2 | A universal verification harness | How to exercise a given system is the project's responsibility (`CLAUDE.md`, `stack.md`, project memory, its existing suites). This ships hints, not capability |
| NG3 | Verifying acceptance criteria | Already covered three ways |
| NG4 | Running by default | Cost is unmeasured; see AC-6 |

---

## 9. Task Grounding

Written after reading `packages/core/lib/trd-parser.js`, `packages/core/lib/task-graph.js`,
`packages/core/lib/implement-state.js`, `packages/core/workflows/implement-phase.js`,
`packages/core/workflows/test-harness.js`, `packages/core/commands/implement-trd.md`,
`packages/full/agents/verify-app.md`, `.claude/agents/agent-validation.test.js`,
`packages/core/agents/agent-validation.test.js`, `packages/core/scripts/scaffold-project.sh`,
`.claude/contracts/trd-authoring.md`, `test/smoke/run-smoke.sh`, `test/smoke/lib/project.sh`,
`test/smoke/lib/assert.sh`, `test/smoke/scenarios/implement-one-task.sh`, `.gitignore`,
`package.json`, and the TRDs under `docs/TRD/`. Every claim carries `[read]`, `[ran]` or
`[inferred]`. Anchors are symbols and literal strings; line numbers sit beside them as a
convenience and rot on the first edit.

### Ground truth verified for the whole TRD

| Fact | Evidence |
|---|---|
| `packages/core/lib/` exists and holds `implement-state.js`, `task-graph.js`, `trd-parser.js` plus their `.test.js` siblings. `.claude/lib/` holds the same three modules, no tests | [ran] `ls packages/core/lib .claude/lib` |
| `packages/core/contracts/` holds exactly `prd-authoring.md`, `task-delegation.md`, `trd-authoring.md`. There is **no** `functional-verification.md` in either tree | [ran] `ls packages/core/contracts .claude/contracts` |
| `packages/core/workflows/` holds `audit-build.js`, `audit-prd.js`, `audit-trd.js`, `create-prd.js`, `create-trd.js`, `implement-phase.js`, two `*.test.js` and `test-harness.js`. `.claude/workflows/` holds the six non-test scripts only | [ran] `ls packages/core/workflows .claude/workflows` |
| `.claude/verification-notes.md` does not exist anywhere; the string appears only in `docs/modernization/2026-08-improvement-plan.md:1533` and in this TRD | [ran] `grep -rn verification-notes .` (excluding `node_modules`, `.git`, worktrees) |
| `copy_contracts()`, `copy_libs()` and `copy_workflows()` each glob their source directory and, under `--refresh`, copy files absent from the destination, logging `Added contract:` / `Added lib:` / `Added workflow:`. §1.4's "no change required" claim is correct | [read] `scaffold-project.sh`, `copy_contracts() {` (:195) with `info "Added contract: $c"` (:211); `copy_libs() {` (:262) with `info "Added lib: $l"` (:283); `copy_workflows() {` (:298) with `info "Added workflow: $wf"` (:339) |
| `copy_agents()` is the exception: under `--refresh` it **never creates** a file — *"Refresh: replace only if this agent already exists in the target. Never create — that stays /rebase-project's job."* | [read] `scaffold-project.sh`, `copy_agents() {` (:141) and that comment (:162) |
| `copy_libs()` skips `*.test.js`; `copy_workflows()` skips `*.test.js` **and** `test-harness.js` | [read] `[[ "$l" == *.test.js ]] && continue` (:281); `[[ "$wf" == *.test.js \|\| "$wf" == test-harness.js ]] && continue` (:331) |
| `.claude/` mirrors of `implement-trd.md`, `verify-app.md` and `trd-authoring.md` are byte-identical to their `packages/` originals today, and are plain files, not symlinks | [ran] `diff -q` on all three (no output); `ls -la .claude/contracts .claude/lib .claude/workflows` |
| The `Workflow` runtime gives a script no filesystem, no shell, and no `Date.now()`/`Math.random()`/argless `new Date()` | [read] `implement-phase.js` header comment, verbatim *"No filesystem or Node.js API access."* |
| `trd_hash` has **no producer**. It appears only in Step 2.3's required-field list and Step 6's schema; nothing computes it, and live state files carry non-hash values | [ran] `grep -rn trd_hash` → `implement-trd.md:224`, `:679`; `.trd-state/ensemble-vnext/implement.json:4` = `"phase3_complete"`, `.trd-state/testing-phase/implement.json:4` = `"phase-5-added"` |
| No agent file declares `disallowedTools` any more (constitution v1.3.0 removed them). `implement-phase.js:190`'s comment still asserts `verify-app` declares `disallowedTools: Agent` | [ran] `grep -n disallowedTools packages/full/agents/*.md .claude/agents/*.md` → no hits; [read] `implement-phase.js:190` |
| `**Source PRD**:` is a **documented convention with no parser behind it**: `trd-authoring.md:103` shows `**Source PRD**: [Link to PRD file]`, and no module reads it | [read] `.claude/contracts/trd-authoring.md:103`; [ran] `grep -rn "Source PRD" packages/` → no hits in code |
| The header's on-disk format is not uniform: markdown link (`docs/TRD/ensemble-vnext.md:8`), backticked link (`docs/TRD/completed/implement-trd-rework.md:8`), bare backticked path (this TRD, `:8`), and the literal `**Source PRD**: None — derived from …` (`docs/TRD/runtime-refresh.md:8`). Three TRDs carry no header at all — `discipline-judgment.md`, `testing-phase-telemetry-patterns.md`, `TRD-feedback.md` | [ran] `grep -rn "Source PRD" docs/TRD/` plus a per-file absence loop |
| An empty or absent `Touches` contributes **zero** file-conflict edges — the fact §3.5's serial-chain fallback rests on | [read] `task-graph.js`, `function computeFilePartition(tasks, grounding)` (:66), `const touches = (block && block.touches) \|\| []` (:71), and the comment *"An empty (or absent) `Touches` list is a deliberate choice … it just contributes zero file-conflict edges"* (:53–59) |
| `findSection()` bounds a section at *"the next heading whose level is <= the found heading's level"* — this governs both `Master Task List` and `Task Grounding` | [read] `trd-parser.js`, `function findSection(lines, phrase, …)` (:120) and its docblock (:106–110) |
| A task table is recognised only when a column header is exactly `ID` or `Task ID`; phase spans are found by heading **text** | [read] `trd-parser.js`, `function isIdHeader(header)` → `/^(task\s+)?id$/i` (:179), `if (roles.id === undefined) continue` (:331), `const PHASE_TEXT_RE = /Phase\s+(\d+)/i` (:21) |
| Grounding bullets are matched by `const BULLET_FIELD_RE = /^\s*-\s+\*\*(Touches\|Reuse\|Replaces\|Follow\|Careful)[^*]*?:\*\*\s*(.*)$/i` and a block missing `Touches` yields the warning `Grounding block for … is missing the mandatory Touches field` | [read] `trd-parser.js:30`, `:513` |
| `packages/core/agents/agent-validation.test.js` passes — 132 tests, 13 required agents including `verify-app`. The mirrored `.claude/agents/agent-validation.test.js` **fails to run**: its `AGENTS_DIR` resolves to `<repo>/full/agents`, which does not exist, so `describe.each` is handed an empty array | [ran] `npx jest packages/core/agents/agent-validation.test.js` → 132 passed; `npx jest .claude/agents/agent-validation.test.js` → *"`.each` called with an empty Array of table data"*; [read] `.claude/agents/agent-validation.test.js:43` `const AGENTS_DIR = path.join(__dirname, '../../full/agents')` |
| `constitution.md`'s floors are unit >= 60% / integration >= 50%; `/implement-trd`'s own completion banner prints `target: 80%` and `target: 70%` | [read] `.claude/rules/constitution.md:197`; `implement-trd.md:800–801` |
| `packages/core/workflows/` contains **zero** calls to `workflow(` — the nested-workflow primitive D1 depends on is documented in the `Workflow` tool's own contract but unexercised in this repository | [ran] `grep -rn "workflow(" packages/core/workflows/*.js` → no hits |
| **Workflow-dispatched agents DO have `Bash`** — *"The earlier statement that 'a workflow script has no shell' is true of the SCRIPT and false of its AGENTS."* This is the attested basis for the Persist stage (§3.3a) and the judge's checker CLI (D4) | [read] `docs/TRD/completed/implement-trd-rework.md:76–78` |
| `implement-trd-rework.md:79` reads *"`Workflow` is unavailable inside subagents"* — it constrains subagents, not workflow scripts. v1.0.1's D1 read it as the latter | [read] `docs/TRD/completed/implement-trd-rework.md:79` |
| `product-manager` is on `constitution.md`'s 13-agent roster, is dispatchable in the background (`background: true`), and its description names *"Analyze user needs and define acceptance criteria"* | [read] `packages/full/agents/product-manager.md:1–16`; `.claude/rules/constitution.md`'s roster table |
| Workflow scripts have **no `require`**: they are prompt-DSL bodies with a leading `export const meta` and a bare top-level `return`, *"not valid as a real Node module"* — `test-harness.js` loads them as source text and wraps them | [read] `packages/core/workflows/test-harness.js:1–19` |
| `trd-authoring.md` §4.1's `[CATEGORY]` list is `P/F/B/T/D/I` in both trees, with no `R` | [ran] `sed -n '249,260p'` on `packages/core/contracts/trd-authoring.md` and its `.claude/` mirror |
| There is no attested "wait on a named background `Agent`" primitive. The repository's documented mechanism for re-checking dispatched background work is `ScheduleWakeup` plus `node .claude/hooks/dispatch-ledger.js --open` | [read] `.claude/rules/async-discipline.md`, *"Orchestration pattern: the scheduled nudge"*; `packages/core/hooks/dispatch-ledger.js:17` usage line and `if (process.argv.includes('--open'))` (:183) |

---

### FV-P001

- **Touches:** `packages/core/contracts/functional-verification.md` (new),
  `.claude/contracts/functional-verification.md` (new mirror),
  `packages/core/contracts/trd-authoring.md`, `.claude/contracts/trd-authoring.md`
- **Reuse:** the contract genre already established by
  `packages/core/contracts/task-delegation.md` and `trd-authoring.md` — a command reads the
  file and passes its text; the agent reads the text, not the path [read] `trd-authoring.md`
  opening sections. Do not invent a new contract format.
- **Follow:** `trd-authoring.md`'s `### Section 10: Task Grounding` block for how a contract
  states a *discipline* (mandatory field, worked example, the failure it prevents) rather
  than a schema [read] `.claude/contracts/trd-authoring.md:603–660`.
- **Replaces:** nothing. Greenfield file; no existing contract carries verification
  discipline [ran] `ls packages/core/contracts` → three files, none of them this. The
  `trd-authoring.md` edit is additive — one bullet in an existing list.
- **Careful:** the `R = Remediation` line goes in `trd-authoring.md` §4.1's `**CATEGORY**`
  bullet list (`:252–258`), which is `P/F/B/T/D/I` today in both trees [ran]. Add the letter;
  do not renumber, reorder or reword the other six, and do not add a matching Examples line —
  no hand-authored TRD should be emitting `R` ids.
- **Careful:** delivery needs no scaffold change — `copy_contracts()` globs `"$src"/*.md` and
  adds absent files on `--refresh` [read] `scaffold-project.sh:195, :211`. But the mirror is a
  plain `cp`, not a symlink [ran] `ls -la .claude/contracts` — the two copies must be written
  in the same commit or they drift silently.
- **Careful:** the `[read]`/`[ran]`/`[inferred]` markers this task must state are the
  grounding pass's own convention, carried in the create-trd tooling rather than in
  `trd-authoring.md`'s Section 10 text [inferred] — Section 10 mandates the four axes but does
  not itself enumerate the three markers; write them out in full rather than cross-referencing.

### FV-B001

- **Touches:** `packages/core/lib/functional-verification.js` (new),
  `packages/core/lib/functional-verification.test.js` (new),
  `.claude/lib/functional-verification.js` (new mirror)
- **Reuse:** `parseTrd()` (`trd-parser.js`, exported in `module.exports`) and `buildGraph()`
  (`task-graph.js`) for the round-trip test — do not hand-roll a markdown parser to check
  `renderRemediationPhase()`'s output [read] both `module.exports` blocks.
- **Reuse:** `save(filePath, state)` in `implement-state.js:69` — it is filepath-generic and
  already does per-writer temp + `renameSync`, with the temp path keyed on `process.pid` and
  `Date.now()` so a second concurrent writer cannot consume it
  [read]. `verification.json` must use it rather than a second atomic-write implementation.
- **Follow:** the manual CLI entry point at `trd-parser.js:741` —
  `if (require.main === module) {` with a usage line on stderr and `process.exit(1)` [read].
  That is the shape all four CLI subcommands should match.
- **Careful (load-bearing):** the CLI is not a convenience. Workflow scripts have no `require`
  — they are prompt-DSL source text wrapped by `test-harness.js`, *"not valid as a real Node
  module"* [read] `test-harness.js:1–19` — so `decide-next`, `render-remediation` and
  `render-report` are the **only** way the loop reaches this module (D3). A subcommand that
  exists as an export but not on the CLI is unreachable from the feature that needs it.
- **Follow:** `computeFilePartition`'s empty-`Touches` semantics (see ground-truth table) —
  the serial-chain fallback exists precisely because an empty `Touches` conflicts with
  nothing [read] `task-graph.js:53–71`.
- **Replaces:** nothing.
- **Careful:** `renderRemediationPhase()`'s markdown is only parseable in the right
  *position*. `findSection()` ends `Master Task List` at the next `##` heading [read]
  `trd-parser.js:120` — the phase table belongs inside `## 4. Master Task List` and the
  grounding blocks inside `## 9. Task Grounding`. The renderer returning `{ markdown,
  grounding }` as two strings is correct; the consumer must place them separately.
- **Careful:** the emitted header row must use `Task ID` or `ID` verbatim — `isIdHeader` is
  `/^(task\s+)?id$/i` and a table whose id column is missing is skipped silently
  (`if (roles.id === undefined) continue`) [read] `trd-parser.js:179, :331`.
- **Careful:** duplicate ids are dropped with a warning, first occurrence winning
  (`Duplicate task id: ${id}`) [read] `trd-parser.js:350–354`. `existingIds` uniqueness is what
  keeps a remediation task from vanishing into that branch.
- **Careful:** the id column is taken verbatim via `stripMarkup(rawId)` [read]
  `trd-parser.js:348`; `ID_TOKEN_RE` (:25) governs only the Dependencies cell through
  `parseDependencies` (:253). `FV-R001` satisfies both, so OQ-6's conclusion holds — its
  stated mechanism does not (see findings).

### FV-B002

- **Touches:** `packages/core/workflows/verify-functional.js` (new),
  `packages/core/workflows/verify-functional.test.js` (new),
  `.claude/workflows/verify-functional.js` (new mirror)
- **Reuse:** `function readArgs(raw)` (`implement-phase.js:37`) and
  `function required(value, stage)` (`:57`) **verbatim** — both were already copied from
  `audit-trd.js`; §3.3 says to copy them and that is right [read].
- **Reuse:** `packages/core/workflows/test-harness.js` — `readScript(filename)` reads from
  `WORKFLOWS_DIR = __dirname`, and `makeAgentStub(plan)` records every call as
  `{ prompt, opts, at }` on `calls`, resolving an omitted/undefined plan entry to `null`
  [read] `test-harness.js:31, :50–60`. That `calls` array is the mechanism for FV-B002's
  three ordering/passthrough assertions; do not build a bespoke stub.
- **Follow:** `implement-phase.js`'s parallel-thunk form
  `await parallel(wave.map((id) => () => …))` (:127) and its null handling —
  `if (!result) { taskResults[id] = { … error: 'agent returned nothing (the agent died or was skipped)' } }` (:158)
  [read].
- **Follow:** `implement-phase.js`'s empty-input early return `if (WAVES.length === 0)` (:78),
  which returns a completed-shaped object with `skipped: true` rather than throwing — the
  same move §3.3 requires for an empty `criteria` array [read].
- **Follow:** the `simplifyReported` / `reviewReported` flags (:305–311) and the comment
  explaining why (*"a dead reviewer's `findings: 0` is byte-identical to a clean review"*)
  [read] — `exercised: "n/m"` is this TRD's version of the same defence.
- **Replaces:** nothing.
- **Careful (load-bearing):** this task owns the loop (D1, revised 2026-08-17). The nested
  `workflow('implement-phase', …)` call it makes is **unexercised in this repository** — [ran]
  `grep -rn "workflow(" packages/core/workflows/*.js` returns no hits, so there is no local
  precedent to copy. The `Workflow` contract permits exactly one level and `implement-phase.js`
  calls no workflow itself, so this design sits inside the limit; write the call, and let
  FV-T001 be where the platform's behaviour is actually observed. See TR4 for the contingency
  if it is rejected.
- **Careful:** `implement-phase.js` dereferences `GATE.verifyPrompt`, `GATE.simplifyPrompt` and
  `GATE.reviewPrompt` unconditionally (`:186`, `:203`, `:265`) [read] — the Persist agent must
  pass `args.gate` through to the remediation dispatch unchanged. Omitting it dispatches gate
  agents with `undefined` prompts.
- **Careful:** the Persist agent is dispatched by this script but is not a stage that can fail
  softly — §3.3's error handling makes it the one `required()` call, following `audit-trd.js`'s
  Index stage [read] `implement-phase.js:57` and the comment above it explaining why the task
  and gate agents deliberately do NOT take that path.
- **Careful:** the test file must not reach `.claude/workflows/` — `copy_workflows()` skips
  `*.test.js` and `test-harness.js` [read] `scaffold-project.sh:331`, and `.claude/workflows/`
  holds six scripts and no tests today [ran] `ls .claude/workflows`.
- **Careful:** `agentType: 'verify-app'` on the Exercise stage matches
  `implement-phase.js`'s attested usage (`agentType: 'verify-app'`, `:186`) [read].
  `verify-app.md`'s frontmatter declares `background: true` (`:14`) and, contrary to
  `implement-phase.js:190`'s comment, declares no `disallowedTools` [ran] — do not write a
  new comment repeating that claim.

### FV-B003

- **Touches:** `packages/full/agents/verify-app.md`, `.claude/agents/verify-app.md`
- **Reuse:** the existing `## Verification Level Enforcement` section (`:29`), its four-level
  table and the `Live Verification Evidence:` block (`:47–53`) [read] — the functional mode
  inherits them; restating the levels would create two sources of truth.
- **Follow:** the file's own section shape — `## Role Statement` (:18),
  `## Primary Responsibilities` (:56) containing `### Acceptance Criteria Verification` (:58)
  and `### Functional Verification` (:86), then `## Verification Process` (:114) and
  `## Deliverables` (:186) [read]. A new `###` under Primary Responsibilities keeps the
  existing mode first, as the acceptance criterion requires.
- **Replaces:** nothing. The existing acceptance-criteria mode stays.
- **Careful:** `copy_agents()` under `--refresh` replaces only files that already exist and
  **never creates** [read] `scaffold-project.sh:162`. `verify-app.md` exists in every
  scaffolded tree, so a refresh does deliver this edit — but the `.claude/agents/` mirror in
  *this* repo must be updated by hand in the same commit; it is byte-identical today [ran]
  `diff -q`.
- **Careful:** the acceptance criterion's `agent-validation.test.js` is ambiguous — two copies
  exist and only `packages/core/agents/agent-validation.test.js` runs (132 passed). The
  `.claude/agents/` copy is already broken before this task starts [ran] (see findings).
- **Careful:** do not re-add a `disallowedTools:` line while editing; constitution v1.3.0
  removed it from all eight worker agents and none carries one now [ran]
  `grep -n disallowedTools .claude/agents/*.md packages/full/agents/*.md` → no hits.

### FV-B004

- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`
- **Reuse:** the flag surface already has exactly three declaration sites plus a diagram —
  frontmatter `argument-hint:` (`:4`), the `> **Arguments:**` usage list (`:11–17`), and the
  `Parse: TRD path, --phase N, …` line (`:29`); the Execution Model fence is `:33–47` [read].
  Add to those four; do not introduce a fifth listing.
- **Follow:** Step 7.1's literal dispatch form —
  `Agent(subagent_type="code-reviewer", prompt="…")` (`:756–758`) [read] — for how this
  command writes an `Agent(...)` call in prose. Step 3.6's dispatch is the same shape with
  `subagent_type="product-manager"` and `run_in_background: true` (D5, owner decision).
- **Reuse:** the `product-manager` agent as it stands. Do **not** add a fourteenth agent, do not
  edit `constitution.md`'s roster, and do not edit `product-manager.md` — the contract text this
  step passes in the prompt is the entire instruction set (D5), and the agent already declares
  `background: true` [read] `packages/full/agents/product-manager.md:14`.
- **Follow:** the placement convention: a new `### 3.6` goes after
  `### 3.5 Assemble each task's delegation prompt` (`:373`) and before `## Step 4` (`:433`)
  [read].
- **Replaces:** nothing; the flag is additive and the no-flag path is the current behaviour.
- **Careful:** PRD-path resolution must handle four header shapes and a literal `None` — see
  the ground-truth table. `runtime-refresh.md:8` reads `**Source PRD**: None — derived from
  the Claude Code / Sunstone comparison review (2026-08-10/11)` [read]; that must resolve to
  `not run: no PRD resolved`, not to a file called `None`.
- **Careful:** the `.trd-state/current.json` fallback is **gitignored** (`.gitignore:26`) and
  written by Step 1.3a (`### 1.3a Write the feature pointer`, `:108`), which runs before
  Step 3 [read] — present in-session, absent on a fresh clone.
- **Careful:** no code reads `**Source PRD**:` today [ran] `grep -rn "Source PRD" packages/`
  → no hits. Cite `trd-authoring.md:103` as the *convention's* source, not as evidence a
  resolver exists.

### FV-B005

- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`,
  `.gitignore`
- **Reuse:** Step 4.2's `Workflow({ name: "implement-phase", args: { … } })` call form
  verbatim (`:462`) [read] — Step 7.3's single `Workflow({ name: "verify-functional", args: … })`
  call is the same shape with a different name and arg set. Do not invent a second dispatch idiom.
- **Reuse:** Step 4.2's gate-prompt assembly. `implement-phase.js` dereferences
  `GATE.verifyPrompt`, `GATE.simplifyPrompt` and `GATE.reviewPrompt` unconditionally (`:186`,
  `:203`, `:265`) [read], and Step 7.3 is now the only place those prompts can be built — the
  workflow has no filesystem and the Persist agent passes `args.gate` through unchanged. Assemble
  them here and put them in `args.gate`; a missing gate block dispatches remediation agents with
  `undefined` prompts.
- **Reuse:** the lib CLI's `render-report` for the two `not run` outcomes rather than writing
  report markdown in prose — one renderer, per D3.
- **Follow:** Step 5.1's `node -e` + `require("./.claude/lib/implement-state")` invocation form
  (`:608`) [read] for how this command shells into a lib module.
- **Replaces (load-bearing):** this row **replaces v1.0.1's FV-B005**, which put the whole loop
  in this step. Under the revised D1 the iteration, `decideNext()` application, TRD mutation,
  re-parse, `verification.json` write and report emission all move into FV-B002's workflow. If
  any of that prose survives in `implement-trd.md` after this task, there are two loops and the
  workflow's is the one that runs — delete it rather than leaving it as documentation.
- **Replaces:** nothing else becomes unreachable. Step 7.1's hardening fan-out, Step 7.2's
  full-branch review and `/audit-build` all stay (NG1) [read] `implement-trd.md:742, :764, :823`.
- **Careful:** Step 7.3 must sit between `### 7.2 End-of-run full-branch code review` (`:764`)
  and `## Step 8: Completion` (`:779`) [read].
- **Careful:** the TRD facts this step must resolve and pass in `args` — prefix, highest phase
  number, existing task ids — come from `parseTrd()` (`trd-parser.js`, exported in
  `module.exports`) [read]. Do not hand-roll a scan; the Persist agent re-parses with the same
  module after mutation, and the two must agree.
- **Careful:** `since` is `git log -1 --format=%ct`, resolved **here**. `checkEvidence` takes it
  as a parameter precisely so nothing downstream needs a clock or a repository [read] §3.2.
- **Careful:** do **not** compute `trd_hash`. It has no producer and no value-consumer — nothing
  in `packages/core/lib/` or `packages/core/commands/implement-trd.md` computes or compares it;
  the only references are the state template's `{{TRD_HASH}}` placeholder, the §2.3 "Required
  Fields" presence check, and an example state block [ran] `grep -rn "trd_hash\|sha256"
  packages/core/lib packages/core/commands/implement-trd.md packages/core/workflows`.
- **Careful:** §3.1's no-wait rule stands unchanged under the revised D1. There is no attested
  primitive for a lead to block on a specific `Agent({run_in_background: true})`; the
  repository's documented mechanism is `ScheduleWakeup` plus
  `node .claude/hooks/dispatch-ledger.js --open` [read] `.claude/rules/async-discipline.md`
  *"Orchestration pattern: the scheduled nudge"*; `dispatch-ledger.js:17, :183`. An absent
  definition is `not run: no definition produced` and the workflow is not called.
- **Follow:** `.gitignore`'s existing per-run-scratch precedent —
  `# Verifier findings are per-run scratch (create-prd / create-trd verify wave)` /
  `.trd-state/*/findings/` (`:68–69`) and `.trd-state/*/implement.lock` (`:65`) [read]. Put
  `.trd-state/*/evidence/` beside them and leave the *"`.trd-state/` IS tracked"* comment
  block (`:7–13`) intact.
- **Careful:** Step 8's banner is one fenced ASCII block (`:781–825`) whose last content
  section is `NEXT STEPS`; `For Wiggum mode, signal: <promise>COMPLETE</promise>` (`:829`)
  sits outside the fence and must stay after whatever is added [read].
- **Careful:** the banner already prints `Unit Coverage: {X}% (target: 80%)` /
  `Integration Coverage: {Y}% (target: 70%)` (`:800–801`) while `constitution.md:197` sets the
  floors at 60% / 50% [read] — this task edits that block, so the mismatch is now in reach
  (see findings).

### FV-T001

- **Touches:** `test/smoke/scenarios/verify-functional.sh` (new), `test/smoke/run-smoke.sh`
- **Reuse:** `test/smoke/lib/project.sh` — `smoke_scaffold_project()` (`:44`),
  `smoke_claude()` (`:108`), `smoke_final_text()` (`:142`), `smoke_write_trd()` (`:165`),
  `smoke_agent_invoked()` (`:233`); `test/smoke/lib/assert.sh` — `assert_file_exists` (`:63`),
  `assert_file_nonempty` (`:73`), `assert_last_line_matches` (`:105`), `assert_json_field`
  (`:166`), `smoke_timeout` (`:201`), `smoke_finish` (`:228`), `smoke_skip` (`:238`) [ran]
  `grep -n "^[a-z_]*()" test/smoke/lib/*.sh`.
- **Follow:** `test/smoke/scenarios/implement-one-task.sh` end to end — the
  `SCENARIO_DIR`/`SMOKE_DIR`/`REPO_ROOT` preamble, the `command -v claude` and `command -v jq`
  skip guards (`:33–38`), `mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-…"` with
  `trap cleanup EXIT INT TERM`, and the commit-the-fixture step [read]. It is the closest
  sibling and already asserts a COMMAND COMPLETE banner and `implement.json` fields.
- **Replaces:** nothing.
- **Careful:** this scenario is the first place `workflow('implement-phase', …)` from inside
  `verify-functional.js` actually meets the platform (TR4) — [ran] `grep -rn "workflow("
  packages/core/workflows/*.js` shows no existing call. A failure there is a platform finding,
  not a scenario bug: report it as such rather than working around it.
- **Careful:** there is **no** `smoke_write_prd` helper, and `smoke_write_trd()`'s heredoc
  emits no `**Source PRD**:` header — it goes from
  `# ${feature_name} — Technical Requirements Document` straight to `## 1. Overview`
  [read] `project.sh:165–207`. This task must supply both the PRD fixture and a resolvable
  header, or the flag run legitimately reports `not run: no PRD resolved` and the scenario
  fails for a reason that is not the one under test.
- **Careful:** registration is two literals, and a third that must **not** change:
  `declare -A SCENARIO_TIMEOUT=(` (`run-smoke.sh:57`, existing LLM scenarios budget `900`),
  `LLM_OPT_IN_SCENARIOS=(prd-run trd-run debug-path)` (`:110`), and
  `ALL_SCENARIOS=(hooks-health scaffold-integrity artifact-contracts implement-one-task)`
  (`:103`), which must not gain this scenario [read].
- **Careful:** `run-smoke.sh` exports `ENSEMBLE_RUNTIME_REFRESH_DISABLE=1` (`:93`) so the
  refresh hook cannot rewrite a fixture runtime mid-scenario [read] — the scenario's
  `.claude/lib/functional-verification.js` must arrive via `smoke_scaffold_project`, not via a
  refresh.
- **Careful:** the harness sets **no** model override by explicit policy — *"NO MODEL
  OVERRIDE. Deliberately."* (`:76–89`) [read]. Do not add one to make this scenario cheaper.

---

## Open Questions

All six are settled as of 2026-08-17 (`/refine-trd`, owner decisions). The questions are kept
rather than deleted so the reasoning stays reviewable and countermandable.

| ID | Question | Decision (2026-08-17) | Why it matters | If the decision is wrong |
|----|----------|-----------------------|----------------|--------------------------|
| OQ-1 | The PRD's own Open Question — what a verification cycle costs, and whether each iteration should re-verify everything or only failed criteria plus a regression subset | **Owner-decided: failed plus regression subset.** Iteration 1 exercises everything; iteration *i* > 1 exercises `priorGaps` ∪ the criteria whose recorded `files` intersect the previous remediation phase's `Touches` union. Unexercised criteria carry their status and `lastExercisedIteration` forward into the report (§3.3). Reasoning: full re-verify is 3N exercise-plus-judge dispatches for N criteria, and a remediation can only break a criterion through a file it changed — so the intersection is the smallest set that still catches R2 | A full re-verify at three iterations is 6N agent dispatches for N criteria. This is the affordability lever, and it is now taken up front rather than deferred to a costed run | A regression escapes because it reached a criterion through a file the judge did not implicate. The widening is one line in §3.3's scope rule — pass every criterion whose `files` is empty as well, or fall back to full re-verify |
| OQ-2 | FR-2 says verification runs after the full-branch review, but Step 7.2 does not block on `/code-review`. Should the `--verify-functional` path make it blocking? | **Owner-confirmed: leave it non-blocking.** The ordering gap is resolved by sequencing — verification stays last — not by blocking on `/code-review`. The loop records which passes had completed when it started (TR1) | An unblocked review means "the code after review fixes land" is aspirational for Step 7.2's half | Some verification failures are review findings already in flight, and a remediation phase fixes something twice. TR1's contingency (make Step 7.2 blocking for this path only) is still the fix |
| OQ-3 | Are evidence artifacts wanted in git? | **Owner-confirmed: no.** `.trd-state/*/evidence/` is gitignored (D10); the definition, the report and the notes stay tracked | Screenshots and transcripts are binary and per-run; committing them bloats a tracked directory that exists for coordination | A reviewer cannot re-read an artifact after the branch merges, and the `.gitignore` line has to come back out |
| OQ-4 | Should the derive pass be a registered agent type rather than an untyped background agent with a contract? | **Owner-decided: use the existing `product-manager` agent** (`agentType: 'product-manager'`) — not an untyped agent, and not a fourteenth agent type. Owner: *"I'd assumed a product manager would write up 'what constitutes success from the users perspective'."* Its declared mandate, *"Analyze user needs and define acceptance criteria"*, is this task exactly; it is already on the roster, so `constitution.md` and `agent-validation.test.js` are untouched; and it already declares `background: true` (D5) | The roster is owner-governed, and `agent-validation.test.js` enforces it. Reaching for an untyped agent discarded a roster agent whose stated job this is | The contract's discipline conflicts with `product-manager`'s own PRD-authoring instructions and the derived definition drifts toward PRD prose. The fix is to sharpen the contract text, not to change agent type |
| OQ-5 | Where does `.claude/verification-notes.md` come from in a freshly scaffolded project? | **Owner-confirmed: nowhere.** The agent creates it on first write. No scaffold template, no seeded stub — a stub gets trusted as observed fact, which is exactly what FR-5's stale-note rule exists to prevent | A seeded example is the sort of content that gets read as something someone verified | Projects want a documented starting shape and `scaffold-project.sh` needs a template |
| OQ-6 | The remediation phase's task-ID category letter — the convention names `P/F/B/T/D/I` and none of them means "remediation" | **Owner-confirmed: keep `R`, and document it.** FV-P001 adds `` `R` = Remediation `` to the `[CATEGORY]` list in `packages/core/contracts/trd-authoring.md` §4.1 and its `.claude/` mirror, so the letter stops being undocumented. It parses because the ID column is unconstrained — `stripMarkup(rawId)` takes it verbatim (`trd-parser.js:349`) and `ID_TOKEN_RE` (`:25`) governs only the Dependencies cell via `parseDependencies` (`:253–256`) [ran, 2026-08-17 audit] | A category letter nobody documented will confuse a later reader of the TRD | The letter changes to `B` and the `trd-authoring.md` line comes back out |

## Could Not Verify

| Claim | How I'd check it |
|-------|------------------|
| **A workflow script CAN invoke another workflow, one level deep (load-bearing for the revised D1, and for FV-B002's remediation dispatch)** | The `Workflow` tool's own contract states it: *"workflow(nameOrRef, args) — run another workflow inline as a sub-step and return whatever it returns. The child shares this run's concurrency cap, agent counter, abort signal, and token budget… Nesting is one level only: workflow() inside a child throws."* That is documentation, not observation: **zero calls to `workflow(` exist anywhere in `packages/core/workflows/`** [ran], so this design is the first use here. `implement-phase.js` calls no workflow itself, so `verify-functional` → `implement-phase` is exactly the one permitted level. Settled by FV-T001's live run, or earlier by a two-line scratch workflow that calls another and returns its result. TR4 carries the contingency. **This row replaces v1.0.1's inverse claim**, which read `implement-trd-rework.md:79` — *"`Workflow` is unavailable inside subagents"* — as a statement about workflow scripts |
| `Agent({subagent_type: "product-manager", run_in_background: true})` from a command reliably produces a file on disk that a much later step can read (D5, TR3) | Dispatch one against a trivial prompt in a scratch project and read the file after an unrelated long-running step; confirm the background task also appears in the `Stop` payload's `background_tasks` while in flight. **Still open after the 2026-08-17 audit, and now more load-bearing**: §3.1 was corrected to never wait on the task and never derive a definition inline, so a background agent that silently fails to write the file costs the whole pass (`not run: no definition produced`) rather than degrading |
| A workflow-dispatched agent can **write** files and mutate the TRD (the Persist stage, §3.3a — load-bearing for the revised D1) | Mostly settled, not fully: `implement-trd-rework.md:76–78` attests that workflow agents have `Bash` (*"true of the SCRIPT and false of its AGENTS"*), which is sufficient for every disk operation §3.3a needs. What is not separately attested is that such an agent can `require()` `trd-parser.js`/`task-graph.js` and return a large structured args object to the script — the same class of capability, exercised differently. Settle it on FV-T001's live run, or earlier with a scratch workflow whose one agent re-parses a TRD and returns its waves |
| A workflow-dispatched agent can invoke a Node CLI (the judge's tier-1 call, D4) | ITR-P003 attested that a workflow-started agent can invoke the `/code-review` skill and that `agent()` accepts `agentType`; a plain `Bash` call from such an agent is the same class of capability but is not separately attested. Run one in a scratch workflow. **Still open after the 2026-08-17 audit** — a live workflow run is outside a document audit's reach |
| `scaffold-project.sh` delivers a *new* file in `contracts/`, `lib/` and `workflows/` on `--refresh` without any change to the script | Read: `copy_libs`/`copy_workflows`/`copy_contracts` glob their source directory and, since the 2026-08-16 refresh-semantics fix, copy files absent from the destination as "Added". Confirm by running `scaffold-project.sh --refresh` against a project scaffolded before these files existed and checking all three arrive. **Still open after the 2026-08-17 audit** — the static read is done; only a run against a stale project settles it, and no such project was in reach |
| Whether Step 7.2's `/code-review` fixes routinely land before Step 7.3 starts (TR1, OQ-2 — FR-2's ordering guarantee) | Unresolvable without a costed run: `/code-review` forks to background subagents and Step 7.2 does not block, so the answer is a timing distribution, not a fact about the source. The audit confirmed the TRD states the gap rather than hiding it (TR1, TR1 Contingency, OQ-2 all present); it cannot confirm the PRD's FR-2 ordering is delivered. Measure on the first `--verify-functional` run by diffing the review's applied fixes against the loop's start time, which Step 7.3 already records |
| The wall-clock and token cost of a verification cycle (OQ-1; inherited from the PRD's own Could Not Verify) | No implementation exists to measure. Out of scope for a document audit; AC-6's opt-in default exists precisely because this is unmeasured. OQ-1's narrowing decision reduces the dispatch count from 3N to N + (gaps + regression subset) but does not make the figure known |

**Verified by the 2026-08-17 audit and therefore removed from this table:**

- *"No coverage instrumentation exists for BATS in this repository"* (§6.1) — confirmed:
  `.github/workflows/ci.yml` was read; its `bats` job (`:62`) installs `bats` (`:71`) and
  invokes it directly (`:102`) with no `kcov` or coverage step anywhere in the file, and
  `package.json`'s `test` script is `jest`. §6.1's "not applicable here" for integration
  coverage stands.
- *"`trd_hash` has no producer and no value-consumer"* (§3.7, TR2, FV-B005 grounding) —
  confirmed by `grep -rn "trd_hash\|sha256"` over `packages/core/lib/`,
  `packages/core/commands/implement-trd.md` and `packages/core/workflows/`: the only hits are
  the state template's `{{TRD_HASH}}` placeholder, §2.3's required-*field* presence check and
  an example state block. Nothing computes or compares the value. The three sites that
  disagreed about recomputing it now agree not to.
- *"`trd-parser.js` accepts an `FV-R###` task ID"* (OQ-6) — confirmed, with the mechanism
  corrected: the ID column is unconstrained (`stripMarkup(rawId)`, `:349`), and `ID_TOKEN_RE`
  (`:25`) applies only to the Dependencies cell (`:253–256`).
