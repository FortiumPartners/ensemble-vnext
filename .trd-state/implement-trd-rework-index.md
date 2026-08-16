# Index: implement-trd-rework PRD + TRD

**Purpose:** Enable verifiers to target their reads instead of scanning whole documents. Maps every task to its grounding, every requirement to serving tasks, and every open/unverified claim.

**Sources:**
- TRD: `docs/TRD/implement-trd-rework.md` (v1.7.0, 1,684 lines)
- PRD: `docs/PRD/implement-trd-rework.md` (v1.2.1, 989 lines)

**Status:** Written after reading entire documents; batch-mode extraction; no inference without evidence.

---

## Part 1: Task Map

**From TRD § 9. Task Grounding.** 19 live tasks (v1.5.0). Ordered by phase.

### Phase 1: Parser, Graph, State Machine

#### ITR-P001 — Sunstone read
- **Description:** Clone Sunstone-Partners/ensemble fresh; read the evidence-table findings
- **Touches:** `docs/modernization/runs/item8/sunstone-read.md` (new)
- **Serves:** R3, AC-F1.8
- **Reuse:** evidence-table shape from `docs/TRD/_workflow-test-stop-hook.md`

#### ITR-P002 — `/code-review` in-loop probe
- **Description:** Verify `/code-review` is model-startable and counts dispatch ledger usage
- **Touches:** `docs/modernization/runs/item8/` (probe record)
- **Serves:** AC-F8.6, R1
- **Reuse:** `packages/core/hooks/dispatch-ledger.js`, `.trd-state/*/dispatch.jsonl`

#### ITR-P003 — Workflow-runtime primitive probe
- **Description:** Determine whether workflow-started agents can spawn typed subagents, run background subagents, and invoke skills
- **Touches:** `docs/modernization/runs/item8/` (probe record)
- **Serves:** AC-F7.3, AC-F7.4, AC-F8.4, OQ-6, NFR-4

#### ITR-B001 — `packages/core/lib/trd-parser.js`
- **Description:** Parser consuming TRD Master Task List, Serves/Dependencies, grounding blocks, Could Not Verify, Open Questions
- **Touches:** `packages/core/lib/trd-parser.js` (new), `packages/core/lib/trd-parser.test.js` (new), `.claude/lib/` mirrors
- **Serves:** AC-F1.1, AC-F1.3, G1, G2, NFR-1, R3
- **Replaces:** inline parsing prose in `implement-trd.md:266`
- **Dependencies:** None (reads `trd-authoring.md` contract)

#### ITR-B002 — `packages/core/lib/task-graph.js`
- **Description:** Builds task dependency graph from parser records; emits blockedBy edges from Dependencies + Touches conflicts
- **Touches:** `packages/core/lib/task-graph.js` (new), `packages/core/lib/task-graph.test.js` (new), `.claude/lib/` mirrors
- **Serves:** AC-F1.4, AC-F1.5, AC-F1.6, AC-F1.9, G2, NFR-1
- **Replaces:** inline prose in `implement-trd.md:297` and `:804`
- **Dependencies:** ITR-B001 (parser output)
- **Blockedby:** ITR-B001 (needs parser records)

#### ITR-B003 — `packages/core/lib/implement-state.js`
- **Description:** State machine for cycle_position advancement; atomic writes to implement.json
- **Touches:** `packages/core/lib/implement-state.js` (new), its `.test.js`, `.claude/lib/` mirrors
- **Serves:** AC-F7.7, G2, NFR-1, NFR-9, R9
- **Replaces:** local CYCLE_ORDER constant in `status.js:210`
- **Dependencies:** None (pure state logic)
- **Blockedby:** ITR-B001, ITR-B002 (for verification context)

#### ITR-B014 — `copy_libs()` in `scaffold-project.sh` (NEW v1.1.0)
- **Description:** Add lib/ directory copy function to vendoring pipeline
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/scripts/validate-init.sh`, `packages/core/scripts/validate-init.test.sh`
- **Serves:** AC-F1.1, G2, R8
- **Reuse:** `copy_contracts()` pattern at :195, `copy_hook_libs()` at :563
- **Dependencies:** None (parallel with other Phase 1 tasks)
- **Blockedby:** None

#### ITR-B015 — smoke-fixture rework (NEW v1.1.0)
- **Description:** Convert bullet-list Master Task List to table format; remove verify-app assertion
- **Touches:** `test/smoke/lib/project.sh` (:157), `test/smoke/scenarios/implement-one-task.sh` (:96–99)
- **Serves:** AC-F1.7, AC-F15.1, NFR-8
- **Replaces:** bullet-list body in `smoke_write_trd()` (:170–178)
- **Dependencies:** ITR-B001 (parser must accept table format)
- **Blockedby:** ITR-B001

### Phase 2: Commands, Contracts, Hooks

#### ITR-D001 — `packages/core/contracts/task-delegation.md`
- **Description:** Extract Appendix A from implement-trd.md into standalone contract
- **Touches:** `packages/core/contracts/task-delegation.md` (new), `.claude/contracts/task-delegation.md` (new)
- **Serves:** G6, AC-F13.1, AC-F13.3, AC-F2.1, AC-F2.2, AC-F2.3, AC-F2.4
- **Replaces:** `implement-trd.md` Appendix A (:867–1354, 488 lines)
- **Reuse:** `trd-authoring.md:1-9` framing
- **Dependencies:** None (parallel)

#### ITR-B005 — rework `packages/core/commands/implement-trd.md`
- **Description:** Parse TRD with lib modules; inject Could Not Verify and Open Questions per task; remove stages F7 deletes; split command to workflow boundary
- **Touches:** `packages/core/commands/implement-trd.md` (1466 lines), `.claude/commands/implement-trd.md` (byte-identical mirror)
- **Serves:** G1, G6, G8, AC-F1.3, AC-F3.1, AC-F3.2, AC-F4.1, AC-F5.1, AC-F5.2, AC-F7.1, AC-F16.1, AC-F16.2
- **Replaces:** 
  - `### 3.1 Parse TRD Tasks` (:266)
  - `### 3.3 Cross-Task Dependencies` (:297)
  - `## Concurrency and File Conflict Detection` (:804)
  - Stages: VERIFY (:469), SIMPLIFY (:495), REVIEW (:500–508)
  - Appendix A (:867–1354)
- **Blockedby:** ITR-B001, ITR-B002, ITR-D001
- **Dependencies:** None sequentially; parallel with ITR-B006–B008

#### ITR-B006 — branch-derived active-TRD resolution
- **Description:** Remove current.json pointer; resolve TRD from branch name (D13 order: explicit arg, branch-derived, single in-progress, STUCK)
- **Touches:** `packages/core/commands/implement-trd.md`, `packages/core/templates/trd-state/implement.json.template`, `.claude/` mirrors
- **Serves:** AC-F11.1, AC-F11.2, AC-F11.3, AC-F11.4, G5
- **Replaces:** 3 `current.json` mentions in `implement-trd.md` (:12, :65, :78); `active_sessions: {}` in template
- **Blockedby:** ITR-B005

#### ITR-B004 — rewrite `packages/core/hooks/status.js`
- **Description:** Import CYCLE_ORDER from implement-state.js; remove hard-coded constant
- **Touches:** `packages/core/hooks/status.js`, `packages/core/hooks/status.test.js`, `.claude/hooks/status.js`
- **Serves:** AC-F7.7, NFR-9, R9
- **Replaces:** hard-coded CYCLE_ORDER at :210
- **Blockedby:** ITR-B003, ITR-B014

#### ITR-B008 — `packages/core/workflows/implement-phase.js`
- **Description:** Workflow orchestrating one phase: parallel() over waves; pipeline() over chains; phase-boundary review; dead-agent accounting
- **Touches:** `packages/core/workflows/implement-phase.js` (new), `.claude/workflows/implement-phase.js` (new)
- **Serves:** AC-F16.2, AC-F16.3, AC-F16.4, AC-F16.5, AC-F16.7, AC-F7.3, AC-F7.4, AC-F8.3, AC-F8.4, AC-F8.5, G3, G4, NFR-4, NFR-9, AC-F1.4
- **Reuse:** structural helpers from `audit-trd.js`
- **Blockedby:** ITR-P003 (for subagent_type and skill dispatch answers)

#### ITR-B010 — remove `code-reviewer` from the per-task loop
- **Description:** Delete REVIEW stage and its agent; verify-app/code-simplifier confined to phase boundary
- **Touches:** 10 files under `packages/core/` (verified count)
- **Serves:** AC-F7.5, AC-F9.1, G3, NG6, R6
- **Replaces:** REVIEW stage, `## A.7 Template: REVIEW` and `## A.8 Template: REJECTION-FIX`
- **Blockedby:** ITR-B005

#### ITR-B011 — `/audit-build`
- **Description:** Post-implementation verification: code ↔ TRD (verification), code ↔ PRD (validation), requirement → impl + test (traceability)
- **Touches:** `packages/core/commands/audit-build.md` (new), `packages/core/workflows/audit-build.js` (new), `.claude/` mirrors
- **Serves:** AC-F10.1, AC-F10.2, AC-F10.3, AC-F10.4, AC-F10.5, G7, AC-F9.2, R6
- **Reuse:** `audit-trd.js` end to end (meta, readArgs, required, VERIFIERS, parallel fan-out, dead-agent accounting, readout)
- **Blockedby:** ITR-B008 (structured phase completion)

#### ITR-B012 — remove the team commands
- **Description:** Delete `harden-trd-team.md` and `verify-trd-team.md`; merge jobs into loop
- **Touches:** both team commands, `test/integration/tests/notify-on-complete.test.sh` (7 arrays), `.claude/rules/command-status.md`
- **Serves:** AC-F14.4, NG13
- **Replaces:** both commands
- **Blockedby:** ITR-B008, ITR-B011

### Phase 3: Testing

#### ITR-T001 — BATS structure battery
- **Description:** New test file asserting module presence, mirror parity, Section 10 absence, `Serves` occurrence
- **Touches:** new `.test.sh` under `test/integration/tests/`, extend `vendoring.test.sh`
- **Serves:** AC-F1.1, AC-F6.2, AC-F9.3, G1, G2, R8
- **Reuse:** `notify-on-complete.test.sh` as model; `cmp`-based parity checks

#### ITR-T002 — `[LIVE]` end-to-end measurement
- **Description:** Extend `implement-one-task.sh` to measure real run; verify task count, banner, artifact, `implement.json`, agent invocations, branch
- **Touches:** `test/smoke/scenarios/implement-one-task.sh`, `test/smoke/lib/project.sh`, possibly `test/smoke/run-smoke.sh:57`
- **Serves:** AC-F7.6, AC-F10.2–.5, AC-N2, G3, NFR-8
- **Replaces:** single-task fixture body; may extend to multi-phase
- **Blockedby:** ITR-B015

#### ITR-T003 — observe the next real `/create-trd` run
- **Description:** Observe a TRD produced after item 10's grounding work; record `Touches` population and `Task Grounding` presence
- **Touches:** nothing in tree; deliverable is a finding
- **Serves:** AC-F1.9, AC-F6.1, G1, R3
- **Reuse:** `trd-authoring.md:390–425` (unit tests not tasks rule)

---

## Part 2: Requirement Map

**From PRD § 4–6 and TRD § 1.2 decisions.** Mapped by serving task.

### F1: Deterministic `lib/` — parser, graph, state machine

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F1.1 | Three modules exist under `packages/core/lib/` | ITR-B001, ITR-B002, ITR-B003, ITR-B014, ITR-T001 |
| AC-F1.2 | Jest coverage above 80% on three modules | ITR-B001, ITR-B002, ITR-B003 |
| AC-F1.3 | `implement-trd.md` calls the modules, not describes them | ITR-B001, ITR-B005 |
| AC-F1.4 | Graph emits `blockedBy` edges consumed by the command | ITR-B002, ITR-B008 |
| AC-F1.5 | Graph emits file-ownership partition | ITR-B002 |
| AC-F1.6 | Cycles detected and reported | ITR-B002 |
| AC-F1.7 | Smoke harness green after each increment | ITR-B001, ITR-B002, ITR-B003, ITR-B015 |
| AC-F1.8 | Sunstone fork cloned fresh; adoption decisions evidenced | ITR-P001 |
| AC-F1.9 | Partition from mandatory `Touches`; overlap serializes | ITR-B002 |
| **G2** | **Deterministic ops move to tested code; three modules, >80% coverage** | ITR-B001, ITR-B002, ITR-B003, ITR-B014 |

### F2: Evidence markers in delegation template

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F2.1 | Template defines `[read]` / `[ran]` / `[inferred]` | ITR-D001 |
| AC-F2.2 | Template instructs verification of `[inferred]` before reliance | ITR-D001 |
| AC-F2.3 | Template states `[ran]` is most trustworthy | ITR-D001 |
| AC-F2.4 | `grep -c "\[inferred\]"` > 0 in template | ITR-D001 |

### F3: `Replaces` surfaced as deletion instruction

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F3.1 | Producer `Replaces` maps to deletion instruction | ITR-B005 |
| AC-F3.2 | Deletion instruction survives the rework | ITR-B005 |
| AC-F3.3 | Implementer deletes named code and tests in same change | ITR-B005 |

### F4: `## Could Not Verify` reaches implementer

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F4.1 | Relevant CVV entries reach each task | ITR-B005 |
| AC-F4.2 | Delegation names the unverified claim | ITR-B005 |
| AC-F4.3 | No section when entries don't apply | ITR-B005 |

### F5: Owner-only `## Open Questions` surfaced before dispatch

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F5.1 | Owner-only Open Questions matched to covering tasks | ITR-B005 |
| AC-F5.2 | Surfaced before dispatch | ITR-B005 |
| AC-F5.3 | Does not violate autonomy rules | ITR-B005 |
| **NFR-2** | **Obeying autonomy.md; no mid-loop checkpoints outside four valid cases** | ITR-B005 |

### F6: `<design_references>` points at existing section

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F6.1 | Extraction sites name an existing TRD section | ITR-B005 |
| AC-F6.2 | `grep -n "Section 10"` returns nothing | ITR-T001 |
| AC-F6.3 | Element omitted when section absent | ITR-B005 |

### F7: Per-task loop collapsed to ~1 invocation

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F7.1 | Per-task cycle is IMPLEMENT → checks → [DEBUG] | ITR-B005 |
| AC-F7.2 | Orchestrator runs checks without spawning agent | ITR-B005 |
| AC-F7.3 | `verify-app` at phase boundary only | ITR-B008 |
| AC-F7.4 | `code-simplifier` at phase boundary only | ITR-B008 |
| AC-F7.5 | `code-reviewer` absent from per-task loop | ITR-B010 |
| AC-F7.6 | Invocations per task measured on real run | ITR-T002 |
| AC-F7.7 | `status.js` rewritten; no advance through deleted stages | ITR-B004 |
| **G3** | **Per-task invocations fall from ~5 to ~1** | ITR-B005, ITR-B008, ITR-B010 |

### F8: Code review per-phase and end-of-run

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F8.3 | Review scoped to phase diff | ITR-B008 |
| AC-F8.4 | Review runs as background subagent | ITR-B008, ITR-P003 |
| AC-F8.5 | Full-branch `/code-review high` at end | ITR-B008 |
| AC-F8.6 | In-loop non-ultra path verified empirically | ITR-P002 |
| AC-F8.7 | No `ultra` tier invoked | ITR-B008 |
| **G4** | **Code review ~6 times per feature (per-phase + end)** | ITR-B008 |
| **NFR-4** | **Per-phase review runs as background subagent** | ITR-B008, ITR-P003 |

### F9: `code-reviewer` leaves the loop everywhere

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F9.1 | All ten referencing files assessed | ITR-B010 |
| AC-F9.2 | AC verification relocated to `/audit-build` | ITR-B010, ITR-B011 |
| AC-F9.3 | Vendored `.claude/` copies in step | ITR-B010, ITR-T001 |

### F10: `/audit-build` verification, validation, traceability

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F10.1 | `/audit-build` follows index → verifiers → reconcile | ITR-B011 |
| AC-F10.2 | Checks code against TRD tasks | ITR-B011, ITR-T002 |
| AC-F10.3 | Checks code against PRD requirements | ITR-B011, ITR-T002 |
| AC-F10.4 | Reports implementation + test per requirement | ITR-B011, ITR-T002 |
| AC-F10.5 | Code-without-test reported as gap | ITR-B011, ITR-T002 |
| **G7** | **Every requirement has implementation and test proof** | ITR-B011 |

### F11: Branch-derived state; retire global pointer

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F11.1 | Active TRD derived from branch | ITR-B006 |
| AC-F11.2 | Explicit-argument fallback exists | ITR-B006 |
| AC-F11.3 | `current.json` no longer single source | ITR-B006 |
| AC-F11.4 | `active_sessions` resolved or removed | ITR-B006 |
| **G5** | **Active-TRD state from branch, not repo-wide pointer** | ITR-B006 |

### F13: Split authoring contract out of implement-trd.md

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F13.1 | Implementer contract in its own file | ITR-D001 |
| AC-F13.2 | `implement-trd.md` retains orchestration only | ITR-D001, ITR-B005 |
| AC-F13.3 | 400–600 lines lost from implement-trd.md | ITR-D001, ITR-B005 |
| **G6** | **`implement-trd.md` shrinks materially (400–600 lines)** | ITR-D001, ITR-B005 |

### F14: Replace team commands with loop stages

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F14.1 | Adversarial pass is verifier fan-out | ITR-B008, ITR-B012 |
| AC-F14.2 | E2E gate deterministic, no agents | ITR-B012 |
| AC-F14.3 | Two jobs separated | ITR-B012 |
| AC-F14.4 | Original commands removed/reduced | ITR-B012 |
| AC-F14.5 | Neither replacement spawns teammate | ITR-B008, ITR-B012 |

### F15: Confirm test-task placement rule

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F15.1 | Next `/create-trd` run has no standalone `Unit:` tasks | ITR-T003 |
| AC-F15.2 | Every non-terminal phase ends runnable | ITR-B008 |
| AC-F15.3 | No-exercisable-path stated in Quality Requirements | ITR-B008 |

### F16: Execution model — command + one parameterized workflow

| ID | Statement | Serves Tasks |
|----|-----------|--------------|
| AC-F16.1 | `/implement-trd` remains a command | ITR-B005 |
| AC-F16.2 | Exactly one parameterized `implement-phase.js` | ITR-B005, ITR-B008 |
| AC-F16.3 | `parallel()` over independents, `pipeline()` over chains | ITR-B008 |
| AC-F16.4 | Phase-boundary review runs inside workflow | ITR-B008 |
| AC-F16.5 | Command owns `implement.json`; workflow writes no durable state | ITR-B008 |
| AC-F16.6 | Phase retried whole; boundary in `implement.json` | ITR-B008 |
| AC-F16.7 | Only phase result reaches orchestrator context | ITR-B008 |
| **G8** | **Per-task results stop entering orchestrator context** | ITR-B005, ITR-B008 |

### Non-Functional Requirements

| ID | Requirement | Serves Tasks |
|----|-------------|--------------|
| NFR-1 | Jest coverage >80% on three `lib/` modules | ITR-B001, ITR-B002, ITR-B003 |
| NFR-3 | DISPATCHED / RESUMED / COMMAND COMPLETE banners | ITR-B005 |
| NFR-5 | Orchestrator owns task list; lib/ blockedBy applied by command | ITR-B005 |
| NFR-6 | No new subagent nesting; report conflicts | ITR-B008 |
| NFR-7 | `lib/` modules JavaScript/Node 18+ with Jest ^29 | ITR-B001, ITR-B002, ITR-B003 |
| NFR-8 | Smoke harness green after each `lib/` increment | ITR-B001, ITR-B002, ITR-B003, ITR-B015 |
| NFR-9 | `implement.json` and resume owned by command; workflow writes no state | ITR-B003, ITR-B008 |

### Goals

| ID | Goal | Serves Tasks |
|----|------|--------------|
| G1 | Consume every producer artifact | ITR-B001, ITR-B005, ITR-T001, ITR-T003 |
| G2 | Deterministic ops in tested code, >80% coverage | ITR-B001, ITR-B002, ITR-B003, ITR-B014 |
| G3 | Per-task invocations ~5 → ~1 | ITR-B005, ITR-B008, ITR-B010, ITR-T002 |
| G4 | ~6 reviews per 5-phase feature | ITR-B008 |
| G5 | Branch-derived state, retire global pointer | ITR-B006 |
| G6 | implement-trd.md shrinks 400–600 lines | ITR-D001, ITR-B005 |
| G7 | Every requirement has code + test proof | ITR-B011 |
| G8 | Per-task results stop entering orchestrator | ITR-B005, ITR-B008 |

---

## Part 3: Open Questions

**From TRD § 9.** As of v1.7.0: **2 open (owner-only), 5 answered, 7 resolved as defaults.**

### Still open — owner-only

| ID | Question | Answer/Default | Gating What |
|----|----------|---|---|
| OQ-1 | Should `trd-authoring.md` gain a Reference Documents section? | **OWNER-CALL answered:** point `<design_references>` at `## 9. Task Grounding`. Reconciled D11 with OQ-1 in v1.6.0. Loose heading-text match; element omitted when nothing matches. | AC-F6.1, D11 |
| OQ-5 | What should the two team-command replacements be called? | **SUPERSEDED v1.4.0:** both jobs moved into loop. No replacements; no new commands. | AC-F14.3, F14 |

### Answered this pass (v1.7.0 plus v1.1–1.6 refinements)

| ID | Answer | Evidence | Gating What |
|----|--------|----------|---|
| OQ-2 | `pipeline()` exists but cannot express heterogeneous chains; shell and filesystem absent from workflow scripts; `agent()` calls are subagents | Workflow tool contract, D7, D8 | AC-F16.3 not literal, AC-F7.2 not in tension with AC-F16.7 |
| OQ-3 | All 13 P0 features ship in release 1, including `/audit-build` | Owner ruling 2026-08-16 | F10 priority, task count |
| OQ-4 | Checks are: Jest, npm run smoke, shellcheck. No typecheck/lint in this repo (stack.md aspirational; `package.json` authoritative) | `package.json` devDependencies, no `.eslintrc*`, no `.prettierrc*` | D9, AC-F7.2 batteries |
| OQ-7 | Extend `implement-one-task.sh` (it's in default smoke set); F7 breaks its verify-app assertion anyway | Fixture must change when ITR-B005 lands | ITR-T002, ITR-B015 timing |
| OQ-6 | Phase gate belongs in workflow (D6 default) **conditioned on ITR-P003:** no existing script passes `subagent_type` | Unattested; four scripts use only label/phase/effort/model/schema | AC-F7.3, AC-F7.4, AC-F16.4 |

---

## Part 4: Could Not Verify

**From TRD § Could Not Verify (v1.7.0 rewritten by `/audit-trd`).** Audit scope: read documents and this repo's code. **5/5 verifiers reported.**

### Rows removed in v1.6–1.7 (settled via audit and refinement)

- `trd-authoring.md:390–425` is the unit-tests rule (line numbers corrected :344–382 → :390–425)
- `implement-trd.md` is 1466 lines / 53,685 bytes (confirmed v1.6.0; token count ~13.4k inherited)
- A `/create-trd` TRD carries `## 9. Task Grounding` heading with populated `Touches` (confirmed; only one TRD has grounding section)

### Rows carried forward (runtime behaviour; out of document-audit scope)

| Claim | Why Unverified | How to Settle | Gated By |
|-------|---|---|---|
| Workflow script can start a **background** subagent | Platform runtime behaviour, unreachable by reading | Run ITR-P003 probe; check dispatch.jsonl for background agents spawned inside workflow | AC-F8.4, NFR-4, OQ-6 |
| `agent()` accepts `subagent_type` for typed dispatch | Same — four existing scripts use only label/phase/effort/model/schema | Run ITR-P003 probe; attempt typed dispatch and observe dispatch.jsonl | AC-F7.3, AC-F7.4, OQ-6 |
| Workflow-started agent can invoke `/code-review` skill | Same — not attested in existing scripts | Run ITR-P003 probe or run `/code-review` from inside a workflow script | AC-F16.4 |
| Agents spawned inside workflow surface in lead session stream-json | Requires running canary | Run ITR-T002; inspect stream-json `tool_use` records for agents | AC-F7.6 (per ITR-B015 Careful) |
| `/code-review high` is model-startable in this environment | Requires starting one; PRD/SPEC inherit this as measured elsewhere | Run ITR-P002 probe; attempt `/code-review` invocation from command context | AC-F8.6, R1 |
| Sunstone repo contains parser/graph/deps modules with 76 tests | Repo not on this machine (`~/dev/ensemble` gone 2026-08-12) | Run ITR-P001: `git clone Sunstone-Partners/ensemble && ls lib/ && find . -name '*.test.js' | wc -l` | R3, AC-F1.8 |
| Phase sizes 4–5.4 tasks on profile TRDs | Profile TRDs (ensemble, herald) not fully in audit set | Measure on real runs; ensemble is in this repo | R5 |
| Extending `implement-one-task.sh` to multiple phases feasible in smoke budget | Requires timing multi-phase run | Run ITR-T002 multi-phase variant; observe elapsed time vs budget | ITR-T002 |
| AC-F5.2 "surfaced **before** dispatch" ordering holds in real run | Designed but not observed | Run ITR-T002; confirm question in DISPATCHED banner and delegation, before implementer starts | AC-F5.2 |
| `resumeFromRunId` is same-session only (D6's premise) | Inherited from SPEC; requires cross-session attempt | Run workflow, end session, attempt resume | D6, F16 |

### From PRD Could Not Verify (v1.2.1, 3/3 verifiers)

| Claim | Why Unverified | How to Settle |
|-------|---|---|
| `/code-review` fans out to 7 agents; found 14 defects in 1,495 lines | Inherited from SPEC; never re-measured in this repo | Count `start` events in `.trd-state/*/dispatch.jsonl` for a run |
| Test suite runs in 3.15 s | Inherited from SPEC | `time npm test` |
| `verify-app` costs $5–15; TRD authoring $39.45 | Inherited from SPEC | Check run-cost records from item-10 profile |
| `/implement-trd` runs ~5 invocations per task today | Inherited from SPEC | Count per-task invocation events in a real dispatch.jsonl |
| `implement-trd.md` is ~13.4k tokens | Measured: 1466 lines / 53,685 bytes; token count not computed | Run tokenizer on the file |
| Managed Code Review $15–25/review, ultra $5–25; route (b) subscription-covered | Inherited from SPEC's reading of `code.claude.com/docs` | Re-fetch live docs |
| Claude skips draft/closed/trivial/already-commented PRs | Inherited from SPEC's reading of live docs | Re-fetch `docs/en/code-review` |
| `/code-review` model-startable by default | Inherited from SPEC; **AC-F8.6 requires empirical verification** | Run ITR-P002 probe |
| Sunstone fork structure (parser, graph, phase-tracker, cross-trd-deps, 76 tests) | Repo not on this machine | `git clone && inspect` (ITR-P001) |
| Profile TRD shapes and costs | Herald repo not present; ensemble measurements incomplete | Measure on real runs |
| `resumeFromRunId` same-session only (D6 premise) | Inherited from SPEC | Cross-session experiment |

---

## Quick Reference by Verification Type

### Manual Review

Tasks requiring document/code inspection without running:
- ITR-B001 (acceptance criteria; no tests needed for parsing logic confirmation)
- ITR-B004 (hook rewrite; code inspection)
- ITR-B005 (command rework; ~16 acceptance criteria)
- ITR-B006 (active-TRD resolution; state machine review)
- ITR-B008 (workflow script; manual trace through examples)
- ITR-B010 (agent removal; grep-based verification)
- ITR-B011 (`/audit-build` structure; follows audit-trd precedent)
- ITR-B012 (team command removal; deletion verification)
- ITR-D001 (contract extraction; split verification)

### Structure Tests (BATS + grep)

- ITR-T001 (new BATS battery: module presence, parity, Section 10 absence, Serves occurrence)
- AC-F6.2: `grep -n "Section 10"` returns nothing
- AC-F7.5: `code-reviewer` absent from per-task loop

### Unit Tests (Jest)

- ITR-B001 (parser coverage >80%)
- ITR-B002 (graph: edges, partition, cycles)
- ITR-B003 (state machine: cycle order, atomic writes)
- ITR-B004 (hook: CYCLE_ORDER import, advance logic)

### Integration Tests

- ITR-B015 (smoke fixture rework; `npm run smoke` green)
- ITR-T001 (BATS suite extension)
- ITR-T002 (`[LIVE]` end-to-end: real run measurement)

### Probes (Experimental)

- ITR-P001 (Sunstone read; clone and inspect)
- ITR-P002 (`/code-review` model-startability; dispatch ledger observation)
- ITR-P003 (workflow runtime primitives; attempted invocations, dispatch.jsonl inspection)
- ITR-T003 (observe next `/create-trd` run; check Touches/grounding population)

---

**Generated after reading entire TRD and PRD; no inferences without evidence markers.**
