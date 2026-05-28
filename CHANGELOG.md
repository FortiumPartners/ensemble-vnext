# Changelog

All notable changes to ensemble-vnext are documented in this file.

## [3.5.0] - 2026-05-28

Phase 2 modernization — closes the structural gaps surfaced in the Claude Code alignment
assessment, with emphasis on **durable cross-session memory** (state + decision trail survive
compaction and session end) and **structural enforcement of async discipline** (the
fire-and-forget failure mode is now blocked at the Stop hook, not just discouraged in prose).

### Added

- **Async-discipline rule + Stop-hook guard** (`async-discipline.md` + `async-discipline.js`).
  Addresses a real recurring failure mode: an agent claims "I'll let you know when done" /
  "running in the background" / "I'll report back" but uses no actual async machinery,
  then sits idle until the user nudges — at which point it instantly checks and sees the
  work completed long ago (hallucinated notification). The Stop hook now scans the last
  assistant turn for fire-and-forget claims; if a claim is present without any of the four
  legitimate async primitives in flight (`Agent({run_in_background: true})`,
  `ScheduleWakeup`, `Monitor`, `/goal`), the Stop is BLOCKED with a reason explaining the
  options. Constitution gains Prohibited Pattern #6 referencing the rule.
- **SessionStart context hook** (`session-context.js`). On every new session, reads
  `.trd-state/current.json` and surfaces the in-flight feature (PRD/TRD path + task progress
  from `implement.json` or assertion verdicts from `verify.json`) into `additionalContext`.
  Removes the "remind me what we're working on" friction at the start of every session.
- **PreCompact decision-trail archiver** (`precompact.js`). When `/compact` runs — or
  auto-compaction triggers at ~95% — appends a structured checkpoint to
  `.trd-state/<feature>/session-log.md`: timestamp + trigger, PRD/TRD, phase, strategy,
  branch, in-flight tasks (id + cycle + `current_problem`), tasks in retry, last 5
  completions, and a **Decisions & rationale (model: fill on resume)** stub. Hook returns
  `additionalContext` instructing the post-compact model to re-read the log and backfill the
  rationale stub. State records *what*; the log records *why* — both survive compaction.
- **Skill `paths:` globs for stack-specific auto-activation** (35+ skills). Language,
  framework, ORM, test-runner, vector-store, infra, and platform skills now declare
  `paths:` so Claude Code's native selector only auto-activates them when matching files
  are present (`developing-with-react` doesn't fire on a pure-backend session because the
  word "component" appeared; `rails` doesn't fire in a Python project). Sharpens routing
  without re-introducing the keyword router that 3.3.0 deliberately removed.
- **Phase 2 recommendations doc** (`docs/modernization/2026-05-phase2-recommendations.md`)
  capturing the assessment, the four Tier-1 items shipped in this release, and the
  anti-recommendations (e.g., why `mode: plan` is *not* the right primitive for this
  system-of-agents direction).

### Changed

- **Framework-shipped vs user-owned rules split**. Rules under `.claude/rules/` now come in
  two categories with opposite update policies:
  - **User governance** (`constitution.md`, `stack.md`, `process.md`) — generated/customized
    at `/init-project`; `/rebase-project` NEVER modifies.
  - **Framework-shipped** (`async-discipline.md`, plus any future `.md` in
    `templates/claude-directory/rules/`) — copied-if-missing on BOTH init AND rebase, so
    behavioral guarantees enforced by hooks have their accompanying explanation in every
    project. Folder-driven: the next framework rule is a drop-in file.
- **`implement-trd.md` §5.4** documents the `session-log.md` convention so the model knows
  to re-read it after compaction and backfill the **Decisions & rationale** stub.
- **`constitution.md.template`** ships Prohibited Pattern #6 (No false async claims) as a
  fixed entry; user-provided `ADDITIONAL_PROHIBITIONS` now number from 7.
- **`validate-init.sh`** required-file loop now includes `.claude/rules/async-discipline.md`.

### Fixed

- **Async-discipline false-positives on meta-discussion** (two iterations, real fires in the
  wild). The guard initially tripped on prose that discussed or quoted the pattern. Now:
  - `stripCitations()` removes fenced code blocks, inline code spans, and double-quoted
    strings before matching; single-quoted strings are stripped only when both quotes sit on
    word/sentence boundaries (preserving contractions like `don't` / `I'll` / `it's`).
  - `META_MARKERS` skips matches preceded within ~80 chars by `something like` / `for example`
    / `phrases like` / `the phrase` / `e.g.` / etc.
  - `readLastAssistantText` enforces a strict **turn boundary** — only scans assistant text
    produced AFTER the most recent user message, so earlier turns and hook-injected
    BLOCK_REASON content (user-side) can no longer leak into the scan.
  - `SELF_DOC_MARKERS` bypasses the entire match check when the text contains
    `[ASYNC-DISCIPLINE GUARD`, `async-discipline.md`, `async-discipline.js`, or the bare term
    `fire-and-forget` — self-evident meta-discussion.

### Why this matters

These four items close the gap between "the framework documents a principle" and "the
framework enforces it." Before 3.5.0:
- Agents could quietly fire-and-forget with no system pushback until the user noticed.
- Every new session started cold ("what are we working on?").
- Compaction summarized away the decision trail; only `implement.json`'s *what* survived.
- Stack-specific skills could mis-fire on unrelated turns, fighting the slim router.

After 3.5.0 each of those is structural: the Stop hook blocks the violation, SessionStart
auto-loads context, PreCompact archives the rationale, and `paths:` globs scope skill
activation to file-shape relevance.

---

## [3.4.0] - 2026-05-28

AI-feature direction release — fills the gap for projects building LLM-powered features
(provider SDKs, RAG, multi-agent orchestration, tool calling, memory, observability) and
establishes a **currency-check pattern** so the model never invokes deprecated/retired LLMs
or mis-states capabilities from memorized training data.

### Added

- **`agent-implementer` subagent** — the 13th specialist. Builds AI features end-to-end: LLM
  SDK integrations, RAG pipelines, agent loops, tool calling, agent memory, prompt
  observability/evals, with currency verification, retries, cost/latency awareness, and PII
  discipline baked into the role. Plugin manifest updated (`agents: 13`); `/implement-trd`
  agent-routing table gained a row for LLM/agent/RAG keywords → `agent-implementer`.
- **5 new skills** under `packages/skills/`:
  - **`using-pgvector`** — Postgres-native vector storage (HNSW/IVFFlat, vector/halfvec/sparsevec,
    distance ops, hybrid filters, raw SQL + Prisma + SQLAlchemy patterns). The Postgres-native
    alternative to `using-weaviate`.
  - **`building-rag-pipelines`** — End-to-end RAG architecture (chunking strategies, embedding
    model choice, retrieval, reranking, citation/grounding, evaluation). Provider- and
    store-agnostic; delegates wire-level concerns to the provider and vector-store skills.
  - **`building-agent-memory`** — Conversation buffer, summary memory, vector-backed long-term
    memory, hierarchical (working/short/long), eviction/compaction, PII redaction. Composes
    over the vector skills and provider primitives.
  - **`building-tool-orchestration`** — Modernized cross-provider tool-calling: agent loop,
    parallel tool calls, dynamic tool selection / retrieval for large tool sets, failure
    recovery (retry → fallback → escalate), structured outputs. Tool-call wire shape delegated
    to the provider skill's Stay-current.
  - **`using-langfuse`** — Prompt observability (tracing, prompt versioning, eval datasets,
    A/B testing, cost/latency, multi-provider integration). Designated default observability
    skill.
- **LLM-platform skills on `backend-implementer`** (already in the previous commit on this
  branch): `using-anthropic-platform`, `using-openai-platform`, `using-perplexity-platform`,
  `building-langgraph-agents`, `using-weaviate` — so backends that ship AI features have
  first-class access alongside the new `agent-implementer`.

### Changed

- **Currency-check pattern enforced across all LLM-ecosystem skills** (`using-anthropic-platform`,
  `using-openai-platform`, `using-perplexity-platform`, `building-langgraph-agents`,
  `using-weaviate`). Each now has a forceful "**Stay current**" section near the top of the
  body that REQUIRES `WebFetch` of provider-specific docs/pricing/changelog URLs **before**
  recommending a model, comparing options, citing pricing, or invoking a capability — and
  requires citing source URL + fetch date in deliverables. The same directive is surfaced in
  each skill's `when_to_use` frontmatter so it's visible on auto-activation. Existing
  point-in-time "Models" tables (e.g. "Claude Models (January 2026)", "GPT-5 Model Family",
  "Sonar Model Family") flagged with ⚠️ verify-current callouts. All 5 new skills inherit the
  same pattern.

### Why this matters

LLM lineups, pricing, tool-call shapes, and capability matrices change on a monthly cadence —
faster than any model training snapshot. Without an enforced currency check, agents reliably
pick stale/retired model strings, hallucinate context-window sizes, or assume older capability
shapes. The Stay-current sections + the `agent-implementer` acceptance checklist together
prevent that pattern.

### Fixed (post-3.4.0 review pass)

- **`/init-project` no longer false-positives "existing installation" on a bare `.claude/`
  directory.** Detection now requires an **ensemble fingerprint** (`.trd-state/` dir, or
  `.claude/rules/constitution.md`, or `.claude/settings.json` with an `"ensemble"` block,
  or one of our specialist agent files in `.claude/agents/`). If `.claude/` exists without
  fingerprint → treated as greenfield-with-existing-`.claude/`: scaffold around it, preserve
  user files, merge the `ensemble` block into any pre-existing `settings.json` rather than
  replacing it. (Many tools create `.claude/`; only ensemble installs leave the fingerprint.)
- **Hooks no longer break silently when `git` is missing or the directory isn't a repo.**
  Old wrapper `bash -c 'cd "$(git rev-parse --show-toplevel)" && X'` failed silently when git
  errored, leaving cd with an empty target and hooks not running. New wrapper tries
  `CLAUDE_PROJECT_DIR` (Claude Code sets it) → silenced `git rev-parse` → `pwd` fallback, so
  the cd always succeeds. Applied across both template and dogfood `settings.json` (6 hook
  commands each, both JSON-valid).
- **Sharpened routing for the 5 most-confused specialists** (longer, more imperative
  descriptions with USE/DO-NOT-USE clauses and concrete examples):
  - **`app-debugger`** — now explicit "debugger of LAST resort": use after implementer's
    retry failed, for intermittent/race/heisenbug, when symptom doesn't match obvious cause,
    or matches a TRD-documented risk; do NOT use for trivial bugs or first verify failure.
  - **`backend-implementer` ↔ `agent-implementer`** — boundary spelled out both ways: if
    the deliverable IS AI behavior (prompt, model, RAG, agent loop, evals) → `agent-implementer`;
    if the LLM is one component of conventional backend (an endpoint that wraps a completion)
    → `backend-implementer`. Both descriptions cross-reference each other with examples.
  - **`devops-engineer`** — explicit ALWAYS-use list (IaC, K8s/Helm, cloud-account/IAM,
    cluster sizing, observability stack); explicit NOT-FOR (CI pipeline config →
    `cicd-specialist`; app code → implementers).
  - **`cicd-specialist`** — explicit ALWAYS-use list (`.github/workflows/*`, `azure-pipelines.yml`,
    `Jenkinsfile`, deployment automation, release engineering); explicit NOT-FOR (infra
    provisioning → `devops-engineer`; app code → implementers).
- **Model defaults verified per stated convention:** implementers (frontend/backend/mobile/
  agent) + verify-app + devops + cicd = `sonnet/medium`; PM + technical-architect (`xhigh`) +
  spec-planner + code-reviewer + app-debugger = `opus/high`; code-simplifier = `opus/medium`.
  All 13 agents YAML-validated.

---

## [3.3.0] - 2026-05-27

Claude Code alignment release. Brings the plugin into line with the current Claude Code subagent /
skill / command frontmatter spec and team-orchestration model, and removes machinery that became
vestigial as native primitives took over. Mostly additive/internal; the one user-visible behavior
change is that learning capture is now deliberate (`/update-project`) rather than auto-on-SessionEnd.

Full assessment + rationale: `docs/modernization/2026-05-claude-code-alignment.md`.

### Added

- **`verify-goal` skill** (`packages/skills/verify-goal/SKILL.md`) — single-session, `/goal`-drivable
  live verification. The skill supplies the *structure* (per-assertion `verify.json` contract); `/goal`
  supplies the *loop*. `/verify-trd-team` emits a ready-to-paste `claude -p "/goal …"` invocation at
  preflight as the autonomous alternative to its team-based externally-managed loop.
- **`effort` frontmatter on all 12 subagents** — `technical-architect: xhigh`; PM / spec-planner /
  code-reviewer / app-debugger: `high`; implementers / verify-app / code-simplifier / devops / cicd:
  `medium`.
- **`argument-hint` frontmatter on 6 arg-taking commands** — `implement-trd`, `fix-issue`,
  `verify-trd-team`, `harden-trd-team`, `implement-trd-team`, `investigate-issue`.
- **`when_to_use` on all 56 skills** with explicit disambiguation between overlapping families
  (smoke-test-*, test runners per-language, detectors as "run-first-then-handoff", the Playwright
  trio, SDK / platform-manager / infra boundaries).
- **Agent teams shipped enabled** — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the template
  `settings.json` so `*-team` commands work out of the box.
- **Modernization roadmap** (`docs/modernization/2026-05-claude-code-alignment.md`) capturing the
  per-mechanism analysis, decisions, and the four follow-ups (#9 status.js deeper; #11 agent audit
  [done in this release]; #12 hook jest harness mock-fs incompat; permitter/lib copy issue).

### Changed

- **Subagent dispatch renamed** `Task(subagent_type=…)` → the **`Agent`** tool across `implement-trd`,
  `fix-issue`, `harden-trd-team`. Added a "Task vs Agent (do not conflate)" note so the
  `TaskCreate / TaskUpdate / TaskList / TaskGet` work-list verbs stay distinct from the spawner.
- **`router.py` slimmed 841 → 126 lines** — replaced keyword-routing against `router-rules.json` with
  a single static "leverage the framework" reminder + a judgment clause ("skip for trivial /
  informational replies"). Fixes misfiring on analysis/planning turns. New env: `ROUTER_DISABLE=1`.
  Tests rewritten end-to-end via subprocess (25 passing).
- **Team commands aligned to native shared-tree model** — research confirmed Agent Teams are
  designed around a *shared* working tree + file ownership + shared task list (`blockedBy` +
  file-locked claiming) + direct commits; `isolation: worktree` is opt-in for *independent*
  cross-feature work with no documented auto-merge. `implement-trd-team` API modernized:
  `Teammate({operation:"spawnTeam"})` → `TeamCreate`; `Task({team_name,…})` →
  `Agent({subagent_type, team_name, name, prompt})`; `SendMessage` shutdown uses the documented
  `{to, message:{type:"shutdown_request"}}` shape; cleanup → `TeamDelete`. Same in `fix-issue`'s
  lightweight team. Added Workspace-model note; reframed Step 3.3 as **File Ownership**
  (native safety mechanism). `harden-trd-team` / `verify-trd-team` inherit unchanged.
- **Agent skill lists reconciled with the 56-skill library** (over-listing intentional; `init-project`
  downsizes per project). Adds the orphaned skills to the right specialists — e.g. devops gains
  `kubernetes/helm/aws-cloud/flyio/cloud-provider-detector/tooling-detector`; verify-app gains the
  `smoke-test-*` family + `test-detector`; cicd gains `act-local-ci/changelog-generator/flyio`;
  implementers gain `rails/phoenix/blazor` and `git-town`; product-manager / spec-planner /
  technical-architect picked up issue-tracker + detector skills (they previously had empty `skills:`
  lists).
- **Template `settings.json` reconciled up to the working runtime** — fixed `Stop` hook
  (was mis-running `learning.sh`; now `wiggum.js + notify.sh`); added the `bash -c` repo-root
  wrapper on all hook commands; shipped the teams flag.
- **Capture model:** the `SessionEnd` hooks (`learning.sh`, `save-remote-logs.js`) are deliberately
  removed. Learning capture now flows through explicit `/update-project`; native file-based memory
  (`MEMORY.md`) is documented as the *personal/per-machine* complement to the *committed/team-shared*
  CLAUDE.md layer.
- **`status.js` SubagentStop hook header rewritten** to accurately describe the complementary design
  (command sets cycle_position on entry; hook advances on subagent completion) and document a
  KNOWN LIMITATION (over-advances on DEBUG retries / multi-subagent stages). No behavior change here —
  deeper reconciliation tracked as a follow-up.
- `implement-trd` description dropped stale "TaskTools" jargon (bumped command to 3.2.0).

### Fixed

- **`wiggum.js` autonomous loop was abandoning incomplete work every other Stop event.** A
  self-managed `stop_hook_active` flag (set on block, cleared+exit on next call) made the hook
  alternate block → allow-exit regardless of completion. Removed; the infinite-loop guard is now
  solely the iteration cap + completion detection. Real-fs sandbox verified 5 sequential Stops
  all `block` (iter 1→5), all-tasks-complete → `ALLOW-EXIT`. Test block rewritten with a regression
  guard. **NOTE:** jest cannot execute the hook suite on Node 25 (`mock-fs@5.2.0` incompat;
  pre-existing, tracked as a follow-up); fix verified via the sandbox.
- **`verify-app` had invalid `color: magenta`** per the current subagent spec (allowed:
  red/blue/green/yellow/purple/orange/pink/cyan). Changed to `pink`.
- **`app-debugger` body referenced a non-existent skill `playwright-test`.** Corrected to
  `writing-playwright-tests`.
- **Permitter scaffold dropped its `lib/` files silently.** The scaffold read the symlink
  target as a relative path, then resolved `[[ -d lib_dir ]]` against the *target project*'s
  CWD instead of the plugin dir, so `matcher.js` / `allowlist-loader.js` /
  `command-parser.js` never landed in scaffolded projects. Now anchored to the symlink's
  directory via `cd && pwd`. BATS scaffold suite: **42/42** (was 41/42).
- **`validate-init` had the wrong permitter path** (`permitter.js` vs the actual
  `permitter/permitter.js`), so it always reported "Missing required hook: permitter.js"
  even on a correctly scaffolded project. Path corrected.
- **`status.js` over-advanced `cycle_position` during DEBUG retries** (resolves the
  KNOWN LIMITATION + closes #9). `advanceCyclePosition()` now SKIPS when the in-progress
  task has `retry_count > 0` or `current_problem` set — both signal the command has put
  the task into a DEBUG cycle and will re-dispatch verify after `app-debugger`. Added
  `'verify_red'` to `CYCLE_ORDER` (advances to `'implement'`) for TDD support. Verified
  via a real-fs sandbox (5 scenarios incl. mid-DEBUG, current_problem, verify_red→implement,
  happy implement→verify regression).

### Removed

- **`router-rules.json` plumbing** (now vestigial after the slim router):
  - Commands: `generate-router-rules`, `generate-project-router-rules`.
  - JSON files: `packages/core/templates/claude-directory/router-rules.json`,
    `packages/router/lib/router-rules.json`, `.claude/router-rules.json`,
    `.claude/lib/router-rules.json`, `packages/full/.claude/router-rules.json`.
  - `init-project.md`: Steps 15 (Generate Project Router Rules) + 16 (Keyword Mapping Report) +
    Step 9's "Deploy router-rules.json" + header/Goals/inventory/validation/summary refs.
  - `update-project.md`: Step 5 "Regenerate Router Rules" (Step 6 Completion → Step 5).
  - Scaffold script: `copy_global_router_rules()` function + call site + template copy + 2 summary
    lines.
  - Tests: `validate-init.sh` JSON check + `validate-init.test.sh` block, `setup.sh`
    `verify_router_rules()` + export, `commands.test.sh` TRD-TEST-055 blocks,
    `prepare-variants.sh` Gate 2, `rebase-project.md` regeneration line,
    `implement-trd.md` compatibility line.
  - Scaffold + validate-init verified clean on a fresh temp-dir run; BATS scaffold 41/42 (1
    pre-existing permitter/lib/matcher.js failure unrelated); BATS validate-init 22/22 pass.
- **`SessionEnd` hook block** (`learning.sh` + `save-remote-logs.js`) from both the template and the
  dogfood `settings.json`. Dropped the vestigial `ENSEMBLE_SAVE_REMOTE_LOGS` env.

### Open / owner-decision flags

- Consider `memory: project` on `code-reviewer`, `app-debugger`, `technical-architect` (docs cite
  code-reviewer specifically).
- Consider LLM-platform skills on `backend-implementer` for AI-feature projects
  (`using-anthropic-platform`, `using-openai-platform`, `using-perplexity-platform`,
  `building-langgraph-agents`, `using-weaviate`).
### Follow-ups tracked separately

- **#12** — repair hook jest harness (replace `mock-fs@5.2.0` with `memfs` or real
  `os.tmpdir()` fixtures; mock-fs is incompatible with Node 25). The wiggum and status.js
  fixes in this release were verified via real-fs sandboxes since the jest hook suite
  cannot execute on Node 25.

---

## [3.2.0] - 2026-02-23

### Added

- **Agent Team commands** -- three new `/...-team` command variants using Claude Code's
  experimental Agent Teams for parallel multi-agent execution:

  - **`/create-prd-team`** (`packages/core/commands/create-prd-team.md`)
    Spawns parallel teammates (product-research, tech-feasibility, optional
    devils-advocate) for multi-perspective PRD analysis. Output structurally
    identical to `/create-prd`.

  - **`/create-trd-team`** (`packages/core/commands/create-trd-team.md`)
    Spawns domain-expert teammates (backend-arch, frontend-arch, quality-strategy,
    optional infra-perspective) who each propose tasks in their domain. Lead
    synthesizes into unified TRD with merged dependency graph and execution plan.

  - **`/implement-trd-team`** (`packages/core/commands/implement-trd-team.md`)
    Executes TRD work sessions in parallel -- one teammate per session within each
    phase. References `/implement-trd` templates (A.1-A.8), does not duplicate them.
    State files interoperable with sequential `/implement-trd`.

  Vendored copies in `.claude/commands/` for project runtime.

- **7 new skills** in `packages/skills/`:
  - `building-integrations` -- Third-party API integration patterns (webhooks,
    idempotency, retry with Polly, circuit breakers, HttpClientFactory)
  - `developing-with-dotnet` -- .NET 9 with Clean Architecture, MediatR CQRS,
    EF Core, minimal APIs (SKILL.md + REFERENCE.md)
  - `managing-azure-devops` -- Azure DevOps YAML pipelines, multi-stage deployments,
    template references, variable groups (SKILL.md + REFERENCE.md)
  - `playwright-automation` -- Production browser automation for RPA, web scraping,
    and workflow automation; distinct from E2E testing (SKILL.md + REFERENCE.md)
  - `using-azure-functions` -- Isolated worker model for .NET 8/9 with HTTP,
    Service Bus, Timer, and Durable Functions triggers (SKILL.md + REFERENCE.md)
  - `using-clerk` -- Clerk authentication with C# SDK, React integration,
    Svix webhook verification, organization multi-tenancy (SKILL.md)
  - `using-terraform-azure` -- Terraform with azurerm 4.x provider, Key Vault,
    Managed Identity, App Service, Azure Verified Modules (SKILL.md + REFERENCE.md)

- **Explicit skill invocation in delegation flow** -- skills declared in agent
  frontmatter are now actively injected into delegation prompts instead of
  relying on agents to independently discover them:

  - **`/create-trd`**: New `Skills` column in Master Task List phase tables,
    populated via dynamic discovery from target agent's frontmatter `skills:`
    list and each skill's description. New Section 4.1.2 "Skill Hints" with
    discovery instructions. Validation checklist updated.

  - **`/create-trd-team`**: `<skills>` element added to teammate task proposal
    XML contract. Teammate briefing includes skill discovery instructions.
    Synthesis preserves skill hints when merging tasks.

  - **`/implement-trd`**: Hardcoded keyword-to-skill table replaced with
    dynamic resolution (TRD Skills column > agent frontmatter fallback,
    intersected with agent's declared skills). New `<skills>` block with
    invocation instruction added to templates A.2 (IMPLEMENT), A.3 (VERIFY),
    A.6 (SIMPLIFY), A.7 (REVIEW). IMPLEMENT deliverables extended with
    SKILLS_USED and RULES_APPLIED reporting.

  - **`/implement-trd-team`**: `<skills>` element added to teammate task XML.
    Delegation instruction added to pass skills to subagents.

  Vendored copies in `.claude/commands/` updated.

- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var** added to project template
  (`packages/core/templates/claude-directory/settings.json`), project settings
  (`.claude/settings.json`), and global config (`~/.claude/settings.json`).

### Changed

- **Agent model assignments** -- all 12 agents now have explicit `model:` field:
  - **Opus**: product-manager, technical-architect, spec-planner, code-reviewer,
    code-simplifier, app-debugger
  - **Sonnet**: frontend-implementer, backend-implementer, mobile-implementer,
    verify-app, devops-engineer, cicd-specialist

- **Agent skill lists updated** -- new skills distributed to relevant agents:
  - `developing-with-dotnet` added to: backend-implementer, code-reviewer,
    code-simplifier, app-debugger
  - `using-azure-functions` added to: backend-implementer, devops-engineer,
    app-debugger, code-reviewer
  - `using-clerk` added to: frontend-implementer, backend-implementer,
    app-debugger, code-reviewer
  - `building-integrations` added to: backend-implementer, app-debugger,
    code-reviewer
  - `playwright-automation` added to: frontend-implementer, app-debugger,
    code-reviewer
  - `managing-azure-devops` added to: cicd-specialist, devops-engineer,
    code-reviewer
  - `using-terraform-azure` added to: devops-engineer, code-reviewer
  - Skill lists reformatted from inline to YAML list syntax for readability

- **Router injection templates** (`packages/router/lib/router-rules.json`)
  Added teammate routing hint to all 5 injection templates: "If spawning a
  teammate, use the most appropriate ensemble agent (subagent_type) for the task."

- **Plugin CLAUDE.md** (`packages/full/CLAUDE.md`)
  Added delegation guidance: "When delegating work -- whether via subagent or
  teammate -- always use the named agent matching the task domain."

- **`/init-project` command** -- support inline config for unattended initialization;
  expanded plugin-only commands (`init-project.md`, `rebase-project.md`).

- **`agent-validation.test.js`** -- updated to reflect new model field in agents.

## [3.1.0] - 2026-02-19

### Changed

- Consolidated `/implement-trd` with TaskTools integration for dependency chains
  and structural stage enforcement.
- Active cycle position advancement via `status.js` hook on SubagentStop.
- Context management: single-line result summaries, `/compact` recommendation
  at phase boundaries.
- State-write-before-delegate pattern for implement.json updates.
- SIMPLIFY template requires actual file reads and evidence.

### Added

- `resolve-project-root.js` lib for hooks that need project root resolution.
- `formatter.sh` hook for PostToolUse formatting.
- `save-remote-logs.js` improvements for session log capture.
- Verification level support in constitution.md (`unit-only`, `live-required`,
  `e2e-required`, `manual-required`).
- `[LIVE]` task marker for per-task verification level override.

## Prior Versions

See git log for history prior to changelog adoption.
