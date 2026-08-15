# Design Corpus Index: Coordinated Multi-Platform Publish

**Scope**: Design decisions and architectural conventions applicable to coordinated-multi-platform-publish feature development.

**Purpose**: Reference map for TRD authors to inherit decisions instead of re-deciding them.

---

## Document Index (13 documents)

### Core Architecture Documents

| Path | Title | Decisions | Status |
|------|-------|-----------|--------|
| `docs/TRD/ensemble-vnext.md` | Ensemble vNext Technical Requirements | 6 base decisions | Active (v1.2.0) |
| `docs/PRD/ensemble-vnext.md` | Ensemble vNext Product Requirements | Architecture, 28 agents, 12 streamlined | Active (v1.6.0) |
| `docs/TRD/runtime-refresh.md` | Runtime Refresh & Delivery Coherence | 7 decisions (D1–D7) | Active (4.1.11+) |
| `docs/TRD/stop-hook-notification.md` | Stop Hook Notification | 8 base decisions | Active (Shipped 4.1.0) |
| `docs/TRD/_workflow-test-stop-hook.md` | Stop Hook Notification (Workflow Test) | 7 corrective decisions (D1–D7) | WTSH-B001 through WTSH-B004, WTSH-D001 |

### Discipline & Governance Documents

| Path | Title | Decisions | Status |
|------|-------|-----------|--------|
| `docs/TRD/discipline-judgment.md` | Discipline-Hook Judgment | 6 scope decisions (D1–D6); 3 unknowns (U1–U4); Shape A selected (DISC-D001) | Active; Phase 2 in progress (2026-08-13+) |

### Testing & Verification Documents

| Path | Title | Decisions | Status |
|------|-------|-----------|--------|
| `docs/TRD/testing-phase.md` | Ensemble vNext Testing Phase | 5 testing framework decisions | Active (v1.4.0 with Phase 5) |
| `docs/PRD/testing-phase.md` | Testing Phase PRD | User stories, 23 acceptance criteria | Active |
| `docs/TRD/testing-phase-telemetry-patterns.md` | Telemetry Analysis Patterns | 3 data sources, telemetry architecture | Reference (informational) |

### Feedback & Refinement Documents

| Path | Title | Purpose | Status |
|------|-------|---------|--------|
| `docs/PRD/PRD-feedback.md` | PRD Feedback | Refinement notes on Ensemble vNext PRD | Archive |
| `docs/TRD/TRD-feedback.md` | TRD Feedback | Refinement notes on Ensemble vNext TRD | Archive |

**Total**: 13 documents; 6 docs directly relevant to coordinated-multi-platform-publish.

---

## Key Decision Patterns

### Architecture Decisions (Inherited)

| Decision ID | Domain | Choice | Applies To |
|-------------|--------|--------|------------|
| — | Distribution | Claude Code Plugin Marketplace | All features |
| — | Runtime | Vendored `.claude/` directory committed to git | All features |
| — | Orchestration | Command-led (no single orchestrator agent) | All commands |
| — | State | JSON files in `.trd-state/` tracked in git | All TRD implementations |
| — | Hook Implementation | Bash for simple, Node.js for complex | All hooks |
| — | Configuration | JSON for settings, YAML frontmatter for agents/skills | All config |

### Technical Decisions (Domain-Specific)

#### Stop Hook Notification (`docs/TRD/stop-hook-notification.md` + `_workflow-test-stop-hook.md`)

| D# | Decision | Choice | Serves |
|----|----|------|--------|
| D1 | Hook file location | Single source: `packages/core/hooks/notify.sh` (symlinked to `packages/full/hooks/`) | AC-F4.1, AC-F4.2, AC-F2.3 |
| D2 | Environment variable naming | Export both `NOTIFY_WORKING_DIR` and `NOTIFY_CWD` (alias for published contract) | AC-F7.2 |
| D3 | Fallback command resolution | Three-state test on `${NOTIFY_ON_STOP_FALLBACK+set}` | AC-F8.1, AC-F8.2 |
| D4 | SEC-4 narrowing under F8 | Default fallback hardcoded; explicit env var overrides only | SEC-4, AC-F8.1 |
| D5 | ~~Rollback lever~~ WITHDRAWN | Was intended for kill-switch; not viable for prompt hooks (4.1.11) | — |
| D6 | Test disposition for retired hooks | Delete both assertions (not retarget); no `SessionEnd` hook exists | AC-F4.1 |
| D7 | Hook installer duplicate detection | Fix jq path AND containment match | Defect repair (no AC) |

**Related Supersessions**:
- NG5 (session metadata injection) superseded by F7 — no variable templating
- `learning.sh` retired in 4.1.0 — no `SessionEnd` hook

#### Runtime Refresh (`docs/TRD/runtime-refresh.md`)

| D# | Decision | Choice | Rationale |
|----|----|------|-----------|
| D1 | Refresh trigger | SessionStart hook (fires without user action) | Before any work begins |
| D2 | Refresh scope | Components **already present** in `.claude/` (cannot add surprises) | Safe automatic application |
| D3 | Add/remove components | `/rebase-project` only (judgment call, not mechanical) | Selection requires user decision |
| D4 | Version gate | Monotonic write (only when plugin > vendored) | Prevents ping-pong between versions |
| D5 | Plugin `hooks.json` | **Stays empty** (hooks registered via project `settings.json`) | Prevents double-firing |
| D6 | Skill library delivery | Ships as `skills-lib/`, unregistered (auto-updates with plugin) | Library available without selection pollution |
| D7 | Hook inventory | Single `hooks.manifest.json` (generates copy list, template block, docs) | Single source of truth |

#### Discipline Judgment (`docs/TRD/discipline-judgment.md`)

| D# | Decision | Choice | Context |
|----|----|------|---------|
| D1 | Probe first | Platform mechanics probed in Phase 1 before design locked | 4 unknowns (U1–U4) resolve design |
| D2 | Corpus model | Acceptance suite, not bake-off (defines "working", catches regressions) | Discipline corpus at `test/discipline-corpus/` |
| D3 | Corpus sourcing | Text from real transcripts (author vocabulary = exact failure being fixed) | 45 real + synthetic cases, labeled |
| D4 | Escape valves | Expressed in prompt wherever platform supports (if U2+ true) | Background task check in judge prompt |
| D5 | ~~Rollback lever~~ | Regenerate-and-refresh (not instant kill switch) | Prompt hooks have no code to execute |
| D6 | Constitution amendment | Constitution principle 4 amended as a task (user-approved 2026-08-13) | No longer a risk |
| **DISC-D001** | **Shape A selected** | Judge-only (no command-type gate), escape valves in prompt | U2 ✓ (payload visible), U3 ✓ (loop bounded) |

---

## ID Taxonomy & Conventions

### Acceptance Criteria Prefix: `AC-`

**Pattern**: `AC-<domain><number>` where domain is typically a feature letter or code:

| Domain | Meaning | Examples |
|--------|---------|----------|
| `AC-F` | Stop Hook Notification Feature criteria | AC-F1.1 through AC-F8.3 (32 criteria) |
| `AC-H` | Hook testing acceptance (unit/integration) | AC-H1 through AC-H8 (8 criteria) |
| `AC-HI` | Hook integration variants | AC-HI1 through AC-HI4 (4 criteria) |
| `AC-C` | Command workflow acceptance | AC-C1 through AC-C5 (5 criteria) |
| `AC-EF` | Eval framework acceptance | AC-EF1 through AC-EF4 (4 criteria) |
| `AC-A` | Agent effectiveness acceptance | AC-A1 through AC-A7 (7 criteria) |
| `AC-AB` | A/B test execution acceptance | AC-AB1 (1 criterion) |
| `AC-S` | Skill acceptance | AC-S1 through AC-S3 (3 criteria) |
| `AC-SK` | Skill-specific acceptance | AC-SK1 through AC-SK4 (4 criteria) |
| `AC-T` | Testing acceptance | AC-T1 through AC-T2 (2 criteria) |
| `AC-UA` | User analysis acceptance | AC-UA1 through AC-UA3 (3 criteria) |
| `AC-V` | Verification acceptance | AC-V1 through AC-V5 (5 criteria) |
| `AC-TR` | Transitive acceptance | AC-TR1 (1 criterion) |

**Convention**: Numeric suffix uses dot notation for sub-criteria (e.g., AC-F1.1, AC-F1.2, AC-F1.3, AC-F1.4 are sub-items of AC-F1).

### Task ID Prefix: `TRD-TEST-`

**Pattern**: `TRD-TEST-<number>` (three-digit, starting at TRD-TEST-001)

**Scope**: Execution phase tasks in testing TRD

| Range | Purpose |
|-------|---------|
| TRD-TEST-001 to TRD-TEST-009 | Unit test hook acceptance (Permitter, Router, Status) |
| TRD-TEST-010 to TRD-TEST-012 | Formatter hook acceptance (all extensions) |
| TRD-TEST-031 | A/B test parallel execution |
| TRD-TEST-054 to TRD-TEST-055 | /init-project command tests |
| TRD-TEST-056 to TRD-TEST-057 | /create-prd command tests |
| TRD-TEST-058 to TRD-TEST-059 | /create-trd command tests |
| TRD-TEST-060 to TRD-TEST-061 | /implement-trd command tests |
| TRD-TEST-066 to TRD-TEST-071 | Eval framework end-to-end |
| TRD-TEST-075 to TRD-TEST-079 | Skill eval scoring |
| TRD-TEST-080 to TRD-TEST-085 | Agent eval scoring |
| TRD-TEST-093 to TRD-TEST-100 | Hook integration testing (Phase 5 pending) |

### Probe/Investigation Prefix: `DISC-` (Discipline), `WTSH-` (Workflow Test Stop Hook)

| Prefix | Meaning | Examples |
|--------|---------|----------|
| `DISC-B` | **Discipline blocking decision** | DISC-B001, DISC-B002 (corpus mining), DISC-B003–B009 (implementation) |
| `DISC-D` | **Discipline design decision** | DISC-D001 (Shape A selected 2026-08-13) |
| `DISC-P` | **Discipline probe** | DISC-P001 (hook composition), DISC-P002, DISC-P003 (loop safety) |
| `DISC-T` | **Discipline test** | DISC-T002 (latency budget), DISC-T003 (loop safety live test) |
| `WTSH-B` | **WTSH blocking defect** | WTSH-B001 (env var gap), WTSH-B002 (fallback), WTSH-B003 (logging), WTSH-B004 (installer) |
| `WTSH-D` | **WTSH design** | WTSH-D001 (decision framework) |
| `WTSH-P` | **WTSH probe** | WTSH-P001 (test assertions stale) |
| `WTSH-T` | **WTSH test** | WTSH-T001, WTSH-T002, WTSH-T003 (failing test diagnosis) |

### Supersession Markers

**Convention**: When a document or decision is replaced, note in either the superseding document or the document header:

```
Superseded by: <path-to-new-doc> or <decision-ID>
Replaces: <old-decision-ID>
```

**Observed examples**:
- TRD-TEST-036 through TRD-TEST-053 (Skills/Agent routing tests) **superseded by eval framework specs** (new structure)
- NG5 (session metadata injection) **superseded by F7** (simpler approach selected)
- `learning.sh` **retired in 4.1.0** (no `SessionEnd` hook)
- D5 (rollback lever) **withdrawn in 4.1.11** (not viable for prompt hooks)

---

## Architectural Conventions

### State Management Pattern

**Files**: Stored in `.trd-state/<feature>/` (or `.trd-state/_` if no active feature)

**Format**: JSON, git-tracked

**Common files**:
- `current.json` — pointers to active PRD/TRD
- `implement.json` — implementation status, task tracking, cycle position
- `dispatch.jsonl` — subagent start/stop events (ledger pattern)

**Key principle**: Machine-readable, enables parallel session coordination

### Command Output Discipline

**From `.claude/rules/command-status.md`**:

| Banner | When | Format |
|--------|------|--------|
| `[STATUS: /<cmd>] DISPATCHED` | Turn ends with work in flight | `DISPATCHED → <count> <kind> in flight: <names>` |
| `[STATUS: /<cmd>] RESUMED` | Re-entry after ScheduleWakeup/SendMessage | `RESUMED → <reason>` |
| `[STATUS: /<cmd>] PHASE <N>/<M> COMPLETE` | Long-running phase boundary | `PHASE <N>/<M> COMPLETE → <summary>` |
| `═══ COMMAND COMPLETE: /<cmd> ═══` | Command finishes successfully | Last line of final turn |
| `═══ COMMAND STUCK: /<cmd> ═══` | Unrecoverable stuck condition | Last line with `Reason:` and `Next:` |

**Notification patterns**:
- **Path A** (`PushNotification`): Direct desktop/mobile alert (one-shot commands)
- **Path B** (`NOTIFY_ON_COMPLETE` env var): External system webhook/signal (long-running commands)
- **Path C** (`notify.sh` Stop hook): Per-Stop orchestration signal (all sessions)

### Hook Registration Pattern

**Source of truth**: `packages/core/hooks/hooks.manifest.json`

**Manifest schema**:
```json
{
  "hooks": [
    {
      "file": "filename.js|.sh",
      "event": "Stop|SubagentStop|SessionStart|PreToolCall",
      "order": <number>,
      "hookType": "command|prompt",
      "timeout": <seconds>,
      "matcher": "<pattern>" // empty string = fire always
    }
  ]
}
```

**Generation**: `generate-hooks-artifacts.sh` regenerates:
- `packages/full/hooks/` (via symlinks or copies)
- `packages/core/templates/claude-directory/settings.json` (`hooks` key)
- Documentation tables

**Distribution**: Vendored copy at `.claude/hooks/` refreshed via SessionStart hook

### Prompt-Type Hook Pattern (Post 4.1.11)

**Architecture**: Three discipline hooks now use model judgment

| Hook | Event | Evaluation |
|------|-------|-----------|
| `async-discipline.js` | `Stop` | Did lead claim async work with no machinery? |
| `autonomy-discipline.js` | `Stop` | Did command offer mid-loop pause? |
| `subagent-discipline.js` | `SubagentStop` | Did subagent claim deferred work it cannot do? |

**Loop safety**: `stop_hook_active` flag bounds re-entries to exactly one corrective round-trip

**Escape valves**: Payload includes `background_tasks`, `session_crons`, `stop_hook_active`, `agent_id`

### Testing Framework Pattern

**Unit tests** (deterministic):
- Jest for Node.js hooks
- pytest for Python hooks
- BATS for shell scripts

**Integration tests**:
- BATS for end-to-end CLI workflows
- Headless Claude sessions via `--print` (local) or `--remote` (cloud)

**Eval framework** (`test/evals/framework/`):
- YAML specs define variants and checks
- `run-eval.js` orchestrates parallel sessions
- `judge.js` evaluates artifacts with Claude Opus 4.5
- `aggregate.js` does statistical analysis (Welch's t-test)

**Spec categories**:
- `dev-loop/` — primary A/B comparison (3 variants)
- `skills/` — skill isolation testing
- `agents/` — agent routing testing
- `commands/` — command workflow testing

### Asynchronous Coordination Pattern

**From `.claude/rules/async-discipline.md`**:

Commands or leads dispatching background work must use **exactly one** of:

1. **`Agent({run_in_background: true})`** — spawn async subagent
2. **`ScheduleWakeup({delaySeconds, prompt})`** — self-rendezvous
3. **`Monitor`** — hold turn open streaming output
4. **`/goal <condition>`** — loop until condition met

**No async claim without machinery** — enforced by `async-discipline.js` Stop hook

**Team delivery**: Auto-delivery of teammate `SendMessage` satisfies the rule; optional paired `ScheduleWakeup` recommended as safety net

### Autonomous Execution Pattern

**From `.claude/rules/autonomy.md`**:

Commands run autonomously from invocation to `═══ COMMAND COMPLETE ═══`. Only four cases permit `AskUserQuestion`:

1. Genuine requirement ambiguity with no documented default
2. Missing information that cannot be derived
3. Truly irreversible destructive operations
4. STUCK conditions after retry exhaustion

**Anti-patterns forbidden**:
- "Should I proceed to phase 2?" (user already authorized via command invocation)
- "I'll continue unless you want me to pause" (hedged offers are still pauses)
- "Please review and confirm" (review happens post-COMMAND COMPLETE)
- "Should we check with stakeholders?" (decide based on PRD/TRD)

**Enforcement**: `autonomy-discipline.js` Stop hook blocks hedge offers and checkpoint requests

---

## Architectural Patterns Applicable to Coordinated Multi-Platform Publish

### Pattern A: Parallel Task Delegation

**Inheritance**: From `implement-trd` task graph structure

**Applicable**:
- Multiple platform deployments (iOS, Android, Web, Desktop) → parallel subagents
- Multi-region publish (US, EU, APAC) → platform-specific deployers

**Conventions**:
- Use `.trd-state/<feature>/implement.json` with `blockedBy` arrays for dependency ordering
- Write state before spawning subagents (D1 from constitution)
- Dispatch ledger at `.trd-state/<feature>/dispatch.jsonl` tracks which subagents started/stopped
- Schedule safety-net `ScheduleWakeup` after dispatch
- Read ledger on wake to distinguish stuck vs. completed

### Pattern B: Atomic State Updates

**Inheritance**: From implement.json write pattern

**Applicable**: Publishing state tracking, publish-point coordination

**Convention**: Temp file + atomic rename to prevent corruption under concurrent access

### Pattern C: Integration Point Registration

**Inheritance**: From hook manifest pattern

**Applicable**: Multi-platform publish integrations (store APIs, CDN configs, analytics)

**Convention**: Centralized manifest declarations; registration via template generation

### Pattern D: Acceptance Criteria Organization

**Inheritance**: AC- prefix taxonomy

**Suggestion for coordinated-multi-platform-publish**:
- `AC-P` prefix for platform acceptance (AC-P1, AC-P2, etc.)
- `AC-PUB` for publish workflow acceptance
- `AC-COORD` for coordination acceptance
- Numeric suffixes for related sub-criteria (e.g., AC-P1.1, AC-P1.2)

---

## Technology Stack Conventions

| Category | Technology | Notes |
|----------|-----------|-------|
| **Hook implementation** | Bash (simple) or Node.js (complex) | Python for router only; future refactor planned |
| **Commands/Agents** | Markdown prompt files | NOT code; LLM interprets at runtime |
| **Testing** | Jest, pytest, BATS | Match component language |
| **Configuration** | JSON for settings; YAML frontmatter for agents | Single `hooks.manifest.json` as source of truth |
| **State files** | JSON (structured), JSONL (streaming ledgers) | Git-tracked in `.trd-state/` |
| **Telemetry** | OpenTelemetry (native Claude Code) | No additional setup required |

---

## Known Gaps & Open Questions

| Question | Status | Impact |
|----------|--------|--------|
| Model pinning for prompt hooks | Unresolved (DISC-T002 pending) | May affect latency budget (< 2000ms p95) |
| Timeout-exceeded behavior for prompt hooks | Unknown | Edge case; may resolve to allow/block/error |
| Hook composition ordering for prompt-type on same event | Resolved (DISC-P001) | Multiple hooks compose; any block wins |
| Loop safety for prompt-type SubagentStop | Bounded by `stop_hook_active` (DISC-D001) | One corrective round-trip, hard cap at 8 |

---

## Recommended Reading Order for TRD Authors

1. **Start here**: `.claude/rules/constitution.md` — Core principles (1–3 minutes)
2. **Architecture**: `docs/TRD/ensemble-vnext.md` §2 (2–layer architecture, integration points)
3. **Your domain**: Pick the most relevant TRD (e.g., runtime-refresh for runtime-adjacent work)
4. **Conventions**: `.claude/rules/command-status.md` and `.claude/rules/async-discipline.md` (how your TRD's commands must behave)
5. **Decision ID patterns**: This document §"ID Taxonomy & Conventions"
6. **Testing**: `docs/TRD/testing-phase.md` if tests are in scope

---

**Generated**: 2026-08-15 | **TRD author guide for coordinated-multi-platform-publish**

