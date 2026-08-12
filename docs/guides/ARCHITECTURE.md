# Ensemble Architecture

What actually makes up Ensemble, what each component does, and where everything lives.

---

## Two-Layer Architecture

Ensemble has two distinct layers:

```
Plugin (Generator Layer)              Vendored Runtime (Execution Layer)
-----------------------------------   -----------------------------------
/init-project command           -->   .claude/agents/
/rebase-project command         -->   .claude/commands/
Skills library                  -->   .claude/skills/
Hook templates                  -->   .claude/hooks/
                                      .claude/rules/
                                      .claude/settings.json
```

The **plugin** is the generator -- it has only two global commands (`/init-project` and `/rebase-project`) that bootstrap and update projects. Everything else lives in the **vendored runtime** inside the project's `.claude/` directory.

This design means:
- The runtime is committed to git for reproducibility
- Behavior is identical in local CLI and Claude Code Web sessions
- Projects are self-contained -- no external plugin dependency at runtime
- Each project can customize its agents, skills, and rules independently

---

## Keeping the Runtime Current: Refresh vs Rebase

Vendoring buys reproducibility at a price: every project holds a frozen fork of the
runtime. Two mechanisms keep that fork current, and they are deliberately different.

| | **Refresh** (automatic) | **Rebase** (deliberate) |
|---|---|---|
| Trigger | `SessionStart` hook, every session | You run `/rebase-project` |
| Scope | Components **already present** in `.claude/` | Any component, including new ones |
| Adds components | **Never** | Yes |
| Removes components | **Never** | Yes, with backup |
| Touches governance files | **Never** | Prompts before changing |
| Requires judgment | No — mechanical replacement | Yes — that's the point |

**Refresh is safe to run unattended precisely because of what it cannot do.** It replaces
what is already there and nothing else. It cannot add a component you never selected, so
it cannot un-curate a project; it cannot delete one the plugin dropped, so it cannot
silently remove something you depend on. Anything requiring a decision belongs to
`/rebase-project`, where you are present to make it.

### The version stamp

`.claude/settings.json` carries an `ensemble` block with a `version` field, written by the
scaffold on `/init-project` and on every successful refresh:

```json
"ensemble": {
  "version": "4.1.1",
  "refreshed_at": "2026-08-11T22:14:03Z",
  "agents_dir": ".claude/agents"
}
```

The refresh gate is **monotonic** — it writes only when the installed plugin's version is
strictly newer than the stamp. That is what stops two teammates on different plugin
versions from ping-ponging committed runtime files back and forth in git.

A project scaffolded before the stamp existed has no `ensemble.version`. That reads as
*unknown*, not *older*, so it never auto-refreshes. Run `/rebase-project` once to adopt
the stamp; refresh engages from then on.

### The four guards

`runtime-refresh.sh` skips, silently and exiting 0, when any of these hold:

1. **No plugin installed** — CI, fresh clones, and anyone using the vendored runtime
   without the plugin hit this constantly. It must be quiet, not a warning.
2. **The project is inside the plugin's own checkout** — the marketplace is a `directory`
   source pointing at the ensemble repository, so without this a stale plugin cache would
   overwrite live source and silently revert a developer's uncommitted work. The check
   walks *ancestors*, not just the project root, because a project nested inside the
   checkout (an eval fixture, say) resolves to itself and would otherwise never see the
   markers above it.
3. **A task is in progress** — any `.trd-state/*/implement.json` with an `in_progress`
   task. A multi-session `/implement-trd` loop must not pick up different command text
   halfway through a feature.
4. **The plugin is not newer** — equal, older, or unparseable versions do nothing.

A hook that blocks session start is worse than a stale runtime, so every path exits 0,
including malformed JSON, a missing plugin, and a failing scaffold.

### Changes land in the NEXT session

**This is the part that surprises people.** Claude Code loads `.claude/` *before*
`SessionStart` hooks run. A refresh therefore writes files the current session has already
read — the session you are in continues with the components it loaded at start, and the
updated ones take effect when you next start a session.

This was verified empirically, not assumed: a `SessionStart` hook that rewrote a command's
frontmatter fired and wrote to disk, but the session still reported the pre-write text; the
following session reported the new text. The behaviour is stable, not a race.

The refresh message says so explicitly:

```
ENSEMBLE runtime refreshed 4.1.0 → 4.1.1 — 4 commands, 2 hooks, 1 skill updated.
Changes take effect in the NEXT session (this session's components were already loaded).
```

That second line is not optional. Silently applying a change that appears to do nothing is
worse than a one-session lag you can see.

### Turning it off

| Env var | Effect |
|---|---|
| `ENSEMBLE_RUNTIME_REFRESH_DISABLE=1` | Skip entirely |
| `ENSEMBLE_RUNTIME_REFRESH_DEBUG=1` | Log every guard decision to stderr |

---

## Directory Structure

```
your-project/
|-- CLAUDE.md                        # Project operating instructions (auto-updated)
|-- .claude/
|   |-- agents/                      # 13 specialist subagents
|   |   |-- product-manager.md
|   |   |-- technical-architect.md
|   |   |-- spec-planner.md
|   |   |-- frontend-implementer.md
|   |   |-- backend-implementer.md
|   |   |-- mobile-implementer.md
|   |   |-- agent-implementer.md
|   |   |-- verify-app.md
|   |   |-- code-simplifier.md
|   |   |-- code-reviewer.md
|   |   |-- app-debugger.md
|   |   |-- devops-engineer.md
|   |   +-- cicd-specialist.md
|   |-- commands/                    # Workflow slash commands
|   |   |-- init-project.md
|   |   |-- rebase-project.md
|   |   |-- create-prd.md
|   |   |-- create-prd-team.md
|   |   |-- create-trd.md
|   |   |-- create-trd-team.md
|   |   |-- refine-prd.md
|   |   |-- refine-trd.md
|   |   |-- implement-trd.md
|   |   |-- implement-trd-team.md
|   |   |-- harden-trd-team.md
|   |   |-- verify-trd-team.md
|   |   |-- investigate-issue.md
|   |   |-- fix-issue.md
|   |   |-- fold-prompt.md
|   |   |-- update-project.md
|   |   +-- cleanup-project.md
|   |-- hooks/                       # Automated guardrails
|   |   |-- router.py                # Prompt routing (UserPromptSubmit)
|   |   |-- permitter/permitter.js   # Permission validation
|   |   |-- formatter.sh             # Auto-formatting (PostToolUse)
|   |   |-- status.js                # Implementation tracking (SubagentStop)
|   |   |-- async-discipline.js      # Blocks hallucinated async claims (Stop)
|   |   |-- autonomy-discipline.js   # Blocks hedged-pause offers (Stop)
|   |   |-- wiggum.js                # Autonomous-loop / session-end processing (Stop)
|   |   |-- notify.sh                # Per-Stop notifications (Stop)
|   |   |-- notify-complete.sh       # COMMAND-COMPLETE notification helper
|   |   |-- session-context.js       # Session identity capture (SessionStart)
|   |   |-- precompact.js            # Pre-compaction handling (PreCompact)
|   |   |-- learning.sh              # Learning capture
|   |   |-- save-remote-logs.js      # Remote session log archival
|   |   +-- lib/                     # Shared hook helpers (resolve-project-root, etc.)
|   |-- skills/                      # Domain knowledge packs
|   |   |-- developing-with-python/
|   |   |-- developing-with-typescript/
|   |   |-- jest/
|   |   |-- pytest/
|   |   +-- test-detector/
|   |-- rules/                       # Governance files
|   |   |-- constitution.md          # Project absolutes
|   |   |-- stack.md                 # Technology stack
|   |   |-- process.md               # Workflow documentation
|   |   |-- async-discipline.md      # No hallucinated async claims
|   |   |-- autonomy.md              # Autonomous-execution discipline
|   |   +-- command-status.md        # DISPATCHED / RESUMED / COMPLETE banners
|   +-- settings.json                # Hooks, permissions, configuration
|-- docs/
|   |-- PRD/                         # Product Requirements Documents
|   +-- TRD/                         # Technical Requirements Documents
+-- .trd-state/                      # Implementation tracking (git-tracked)
    |-- current.json                 # Pointer to active feature
    +-- <feature>/
        +-- implement.json           # Task status and checkpoints
```

---

## Agents

Agents are Markdown files with YAML frontmatter that define specialized AI workers. They are **prompts only** -- no executable code. Claude Code's subagent system interprets these files to create focused contexts for specific tasks.

### Agent File Structure

Each agent file (`.claude/agents/<name>.md`) contains:
- **YAML frontmatter** -- metadata like name, description
- **Role description** -- what this agent does and doesn't do
- **Instructions** -- specific behavioral guidelines
- **Quality criteria** -- what "done" looks like

### The 13 Agents

#### Artifact Agents

| Agent | File | Invoked By | Output |
|-------|------|-----------|--------|
| `product-manager` | `product-manager.md` | `/create-prd`, `/refine-prd` | `docs/PRD/<feature>.md` |
| `technical-architect` | `technical-architect.md` | `/create-trd`, `/refine-trd` | `docs/TRD/<feature>.md` |

These agents generate the specification artifacts that drive implementation.

#### Planning Agent

| Agent | File | Invoked By | Output |
|-------|------|-----------|--------|
| `spec-planner` | `spec-planner.md` | `/implement-trd` (planning phase) | Execution plan with parallelization |

Analyzes task dependencies to create optimal implementation schedules.

#### Implementation Agents

| Agent | File | Invoked By | Specialty |
|-------|------|-----------|-----------|
| `frontend-implementer` | `frontend-implementer.md` | `/implement-trd` | UI, components, client logic |
| `backend-implementer` | `backend-implementer.md` | `/implement-trd` | APIs, services, data layer |
| `mobile-implementer` | `mobile-implementer.md` | `/implement-trd` | Flutter, React Native |
| `agent-implementer` | `agent-implementer.md` | `/implement-trd` | AI/agent apps — prompts, model selection, RAG, tool calling, agent memory |

The router hook determines which implementer to use based on the task description and project stack. `agent-implementer` owns work where the deliverable *is* the AI behavior (prompt design, RAG pipelines, agent loops, eval); `backend-implementer` handles conventional backends that merely call an LLM as one component.

#### Quality Agents

| Agent | File | Invoked By | Purpose |
|-------|------|-----------|---------|
| `verify-app` | `verify-app.md` | `/implement-trd` (verify stage) | Run tests, check coverage |
| `code-simplifier` | `code-simplifier.md` | `/implement-trd` (simplify stage) | Post-verification refactoring |
| `code-reviewer` | `code-reviewer.md` | `/implement-trd` (review stage) | Security review, quality checks |
| `app-debugger` | `app-debugger.md` | `/implement-trd` (on test failure) | Root cause analysis, TDD fix |

Quality agents run in sequence after implementation: verify, then simplify, then review. If verify fails, the debugger gets up to 3 attempts before escalating.

#### DevOps Agents

| Agent | File | Invoked By | Purpose |
|-------|------|-----------|---------|
| `devops-engineer` | `devops-engineer.md` | `/implement-trd` (infra tasks) | Cloud infrastructure, IaC |
| `cicd-specialist` | `cicd-specialist.md` | `/implement-trd` (pipeline tasks) | CI/CD configuration |

---

## Commands

Commands are Markdown files with optional shell scripts that define workflow steps. They are invoked as slash commands in Claude Code (e.g., `/create-prd`). Commands are **prompts with rails** -- they guide Claude through proven patterns while allowing flexibility within each step.

### Command Categories

#### Setup & Maintenance

| Command | Purpose |
|---------|---------|
| `/init-project` | Initialize a project with Ensemble runtime (plugin-level, one-time) |
| `/rebase-project` | Upgrade vendored runtime to newer plugin version (plugin-level) |
| `/update-project` | Manual learning capture with constitution/stack updates |
| `/cleanup-project` | Review and prune CLAUDE.md and project artifacts |
| `/fold-prompt` | Optimize CLAUDE.md with session learnings |

#### Product Workflow

| Command | Input | Output |
|---------|-------|--------|
| `/create-prd` | Story description or issue reference | `docs/PRD/<feature>.md` |
| `/create-prd-team` | Same (uses parallel team analysis) | `docs/PRD/<feature>.md` |
| `/refine-prd` | Existing PRD + feedback | Updated PRD |

#### Development Workflow

| Command | Input | Output |
|---------|-------|--------|
| `/create-trd` | Approved PRD | `docs/TRD/<feature>.md` |
| `/create-trd-team` | Same (uses parallel architecture team) | `docs/TRD/<feature>.md` |
| `/refine-trd` | Existing TRD + feedback | Updated TRD |
| `/implement-trd` | Approved TRD | Code + tests + `.trd-state/` tracking |
| `/implement-trd-team` | Same (uses concurrent agent team) | Code + tests + `.trd-state/` tracking |
| `/harden-trd-team` | Implemented TRD | Gap/edge-case/regression hardening via parallel teammates |
| `/verify-trd-team` | Implemented TRD | Live verification (API/UI/integration) that the feature actually works |

#### Issue Triage & Fixes

| Command | Input | Output |
|---------|-------|--------|
| `/investigate-issue` | Issue report | Reproduction + classification → lightweight issue TRD or a spec for `/create-prd` |
| `/fix-issue` | Triaged issue TRD | Implement + verify + review in a single compressed pass |

### /implement-trd Options

| Option | Description |
|--------|-------------|
| `--phase N` | Execute only phase N |
| `--session <name>` | Execute only named work session |
| `--wiggum` | Enable autonomous mode |
| `--resume` / `--continue` | Resume from last checkpoint |

### The Three-Pass Workflow

The recommended approach is to run `/implement-trd-team` three times, each in a fresh `--dangerously-skip-permissions` session:

| Pass | Focus | What Happens |
|------|-------|-------------|
| **Pass 1** | Build reference implementation | TDD-based: tests first, code second. Meet acceptance criteria. |
| **Pass 2** | Harden | Edge cases, error handling, robustness against reference. |
| *(Optional)* | *CI/Reviewer pipeline* | *Automated quality/coverage/security assessment between passes.* |
| **Pass 3** | Validate against PRD | Live testing against original requirements. True definition of done. |
| **Human** | Debug and finish | Developer steps in for remaining ~5-15% of nuanced work. |

Between each pass, run `/fold-prompt`, exit, and restart Claude Code for fresh context.

See [Concepts: The Three-Pass Approach](./CONCEPTS.md#phase-3-implementation-the-three-pass-approach) for the full rationale.

### The Staged Execution Loop

Within each pass, `/implement-trd` follows a strict cycle for each task:

```
IMPLEMENT --> VERIFY --> [DEBUG if fail] --> SIMPLIFY --> VERIFY --> REVIEW --> COMPLETE
     |                       |                                          |
     |                  (max 3 retries)                            UPDATE
     |                                                          implement.json
     v
  Delegate to
  specialist agent
  (frontend/backend/mobile/devops/cicd)
```

---

## Hooks

Hooks are executable scripts that fire automatically in response to Claude Code lifecycle events. They are the enforcement layer -- where guardrails become automatic rather than aspirational.

### Hook Events and Handlers

| Event | When It Fires | Handler(s) | What It Does |
|-------|--------------|------------|-------------|
| **SessionStart** | When a session begins | `session-context.js` | Captures session identity (session ID, cwd) and exports it via `CLAUDE_ENV_FILE` for downstream Bash tooling and notifications. |
| **UserPromptSubmit** | Every user message | `router.py` | Analyzes the prompt and recommends appropriate agents and skills. Appends routing context to the prompt. |
| **PermissionRequest** | Before dangerous operations | `permitter.js` | Validates the requested operation against a configurable allowlist. Auto-approves safe operations. |
| **PostToolUse** | After Edit/Write/MultiEdit | `formatter.sh` | Auto-formats the changed file using the project's formatter (Prettier, Black, etc.). |
| **SubagentStop** | When a sub-agent completes | `status.js` | Advances cycle position in `implement.json`. Tracks which stage (implement, verify, simplify, review) just completed. |
| **Stop** | When a session stops | `async-discipline.js` → `autonomy-discipline.js` → `wiggum.js` → `notify.sh` | The Stop chain runs in order: `async-discipline` blocks hallucinated "I'll report back" claims with no async machinery; `autonomy-discipline` blocks hedged-pause offers in workflow commands; `wiggum` handles autonomous-loop / session-end processing; `notify.sh` runs last, executing any optional `NOTIFY_ON_STOP` command. |
| **PreCompact** | Before context compaction | `precompact.js` | Handles pre-compaction bookkeeping so important state survives lossy summarization. |

### Hook Architecture Details

**Router (`router.py`):**
- Written in Python for pattern matching flexibility
- Scans the prompt for technology keywords
- Maps keywords to agents and skills
- Returns routing suggestions as context appended to the prompt
- Does not block -- only advises

**Permitter (`permitter.js`):**
- JavaScript for Claude Code hook compatibility
- Reads allowlist from `.claude/settings.json` permissions
- Auto-approves operations matching the allowlist
- Prompts the user for unlisted operations
- **Note:** When running with `--dangerously-skip-permissions` (the recommended mode for implementation passes), the permitter is bypassed entirely. It remains useful for interactive sessions where you want selective permission control.

**Async-discipline (`async-discipline.js`):**
- First hook in the Stop chain — a defensive guard, not advisory
- Scans the last assistant turn for fire-and-forget claims ("I'll let you know", "running in the background") that have no backing async machinery (`Agent({run_in_background})`, `ScheduleWakeup`, `Monitor`, `/goal`)
- Blocks the Stop with a corrective reason so the agent either dispatches properly or completes the work synchronously
- See `.claude/rules/async-discipline.md`

**Autonomy-discipline (`autonomy-discipline.js`):**
- Second hook in the Stop chain — backstop for the autonomy contract
- Detects hedged-pause offers ("I'll continue unless...", "Want me to keep going, or pause?") in workflow-command context (only when a `[STATUS: /...]` or `═══ COMMAND` banner is present)
- `/refine-prd` and `/refine-trd` are exempt (intentionally interactive)
- See `.claude/rules/autonomy.md`

**Wiggum (`wiggum.js`):**
- Third hook in the Stop chain — autonomous-loop and session-end processing
- Manages session lifecycle for team and multi-pass workflows
- Enables the "launch and land" pattern where sessions run unattended (the `--wiggum` autonomous mode on `/implement-trd`)

**Status (`status.js`):**
- Active hook (not passive) -- advances cycle position
- Fires on SubagentStop to track implementation progress
- Updates `.trd-state/<feature>/implement.json` atomically
- Uses temp file + rename pattern for safe concurrent writes

**Notify (`notify.sh`):**
- Last hook in the Stop chain — executes `NOTIFY_ON_STOP` as a shell command on *every* Stop
- Enables per-Stop orchestration patterns (tmux notifications, webhooks, file signals)
- Always exits 0 (non-blocking) with 30-second command timeout
- Exports session context as `NOTIFY_SESSION_ID`, `NOTIFY_CWD`, `NOTIFY_TRANSCRIPT_PATH`

**Notify-complete (`notify-complete.sh`):**
- Not a lifecycle hook — a helper a workflow command invokes on its final turn, right after emitting the `═══ COMMAND COMPLETE ═══` banner
- Fires the user's `NOTIFY_ON_COMPLETE` command *exactly once*, at true command completion (never during dispatch or intermediate Stops)
- Discovers and exports rich identity (`NOTIFY_PROJECT`, `NOTIFY_BRANCH`, `NOTIFY_FEATURE`, `NOTIFY_SESSION_ID`, tmux context) for routing in the receiver
- See `.claude/rules/command-status.md` (Path B) for the full contract

**Session-context (`session-context.js`):**
- SessionStart hook — captures the Claude Code session ID and working directory
- Appends `export` lines to `CLAUDE_ENV_FILE` so later Bash tool calls and notification helpers can read the session identity

**Precompact (`precompact.js`):**
- PreCompact hook — runs before Claude Code compacts context
- Preserves state that would otherwise be lost to lossy summarization

---

## Skills

Skills are domain knowledge packs -- Markdown files that provide Claude with specialized expertise for specific technologies. They are **prompts only**, loaded on demand by the router hook or by explicit user invocation.

### Skill Structure

Each skill lives in `.claude/skills/<skill-name>/` and contains:

| File | Purpose |
|------|---------|
| `SKILL.md` | Primary skill content -- patterns, best practices, examples |
| `REFERENCE.md` | (Optional) API reference, configuration details |
| `README.md` | (Optional) Skill documentation |

### Built-in Skills

Skills are compiled from the plugin library based on your project's `stack.md` definition during `/init-project`.

#### Languages & Frameworks

| Skill | Description |
|-------|-------------|
| `developing-with-python` | Python 3.11+ with type hints, async patterns, FastAPI |
| `developing-with-typescript` | TypeScript 5.x with type system, generics, strict mode |
| `developing-with-react` | React 18+ with hooks, state management, component patterns |
| `developing-with-flutter` | Flutter SDK for cross-platform iOS, Android, Web |
| `developing-with-php` | Modern PHP 8.x with type system, attributes, enums |
| `developing-with-laravel` | Laravel patterns: Eloquent, migrations, routing, queues |
| `developing-with-dotnet` | .NET 9 with Clean Architecture, MediatR, EF Core |
| `styling-with-tailwind` | Tailwind CSS 3.x utility-first patterns |
| `nestjs` | NestJS backend with dependency injection |

#### Testing

| Skill | Description |
|-------|-------------|
| `jest` | Jest tests for JavaScript/TypeScript projects |
| `pytest` | pytest tests for Python with fixtures and parametrization |
| `rspec` | RSpec tests for Ruby with let bindings and mocking |
| `xunit` | xUnit tests for C#/.NET with FluentAssertions |
| `exunit` | ExUnit tests for Elixir with setup callbacks |
| `writing-playwright-tests` | Playwright E2E test patterns and selectors |
| `test-detector` | Auto-detect test frameworks from project configuration |

#### Platforms & Infrastructure

| Skill | Description |
|-------|-------------|
| `managing-vercel` | Vercel CLI for deployments and domains |
| `managing-railway` | Railway CLI for service deployment |
| `managing-supabase` | Supabase CLI for database and Edge Functions |
| `managing-azure-devops` | Azure DevOps YAML pipelines |
| `using-terraform-azure` | Terraform with azurerm provider |
| `using-prisma` | Prisma ORM with schema-first design |
| `using-celery` | Celery distributed task queue |

#### AI Platforms

| Skill | Description |
|-------|-------------|
| `using-anthropic-platform` | Claude SDK: Messages API, Tool Use, Extended Thinking |
| `using-openai-platform` | OpenAI SDK: GPT-5, Responses API, tool calling |
| `using-perplexity-platform` | Perplexity Sonar API with search-augmented generation |
| `building-langgraph-agents` | LangGraph for stateful multi-agent applications |

#### Issue Tracking

| Skill | Description |
|-------|-------------|
| `managing-jira-issues` | Jira CLI for issue CRUD, search, hierarchy |
| `managing-linear-issues` | Linear CLI with JSON output and smart ID resolution |

#### Other

| Skill | Description |
|-------|-------------|
| `using-weaviate` | Weaviate vector database for semantic search |
| `using-clerk` | Clerk authentication with C# SDK and React |
| `using-azure-functions` | Azure Functions isolated worker model |
| `building-integrations` | Third-party API integration patterns |
| `frontend-design` | Production-grade frontend interfaces |
| `git-town` | Git-town workflow commands |
| `playwright-automation` | Browser automation for RPA and scraping |

### Custom Skills

You can add project-specific skills by creating new directories under `.claude/skills/`:

```
.claude/skills/my-custom-skill/
  SKILL.md            # Skill content
  REFERENCE.md        # Optional reference material
```

The router hook will discover custom skills automatically.

---

## Governance Files

Governance files define the rules that constrain and guide the AI's behavior. They form a three-tier system with different change frequencies:

### Constitution (`.claude/rules/constitution.md`)

**Change frequency:** Rare -- requires explicit user confirmation.

The constitution defines project absolutes:
- Core principles (commands orchestrate, agents execute; skills are prompts only)
- Architecture invariants (vendored runtime, two-layer architecture)
- Quality gates (test coverage thresholds, security requirements)
- Approval requirements (what needs human sign-off)
- Prohibited patterns (no executable code in skills, no blocking hooks)
- Verification level (unit-only, live-required, e2e-required)

### Stack Definition (`.claude/rules/stack.md`)

**Change frequency:** Occasional -- requires explicit user confirmation.

Defines the project's technology stack:
- Languages and versions
- Frameworks and libraries
- Testing tools and configuration
- Infrastructure and CI/CD platforms
- MCP server integrations

The stack definition drives skill selection during `/init-project` and router behavior during development.

### Discipline Rules (`.claude/rules/`)

**Change frequency:** Rare — these encode framework invariants.

Three additional rule files govern how commands and agents behave during autonomous execution. They are documented contracts, partly enforced by the Stop-hook chain:

| Rule | Enforces | Backing hook |
|------|----------|--------------|
| `async-discipline.md` | Never claim async work ("I'll report back") without real async machinery in flight | `async-discipline.js` |
| `autonomy.md` | Workflow commands run autonomously from one invocation to one result; no mid-loop "should I proceed?" prompts (four narrow exceptions) | `autonomy-discipline.js` |
| `command-status.md` | Every workflow command emits `DISPATCHED` / `RESUMED` / `═══ COMMAND COMPLETE ═══` status banners | (documented contract) |

### Process Documentation (`.claude/rules/process.md`)

**Change frequency:** Occasional.

Documents the expected workflow:
- Command reference and usage
- Artifact flow
- Branch naming conventions
- State management patterns
- Quality gate checklists

### CLAUDE.md

**Change frequency:** Frequent -- updated automatically by `/fold-prompt`.

The project's operating manual for AI sessions:
- Architecture decisions and conventions
- File structure reference
- Testing patterns and commands
- Key debugging notes and gotchas
- Agent delegation preferences

---

## Settings (`.claude/settings.json`)

The settings file configures Claude Code's behavior for the project:

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(pytest:*)"
    ]
  },
  "hooks": {
    "SessionStart": [...],
    "UserPromptSubmit": [...],
    "PermissionRequest": [...],
    "PostToolUse": [...],
    "SubagentStop": [...],
    "Stop": [...],
    "PreCompact": [...]
  },
  "ensemble": {
    "agents_dir": ".claude/agents",
    "skills_dir": ".claude/skills",
    "rules_dir": ".claude/rules",
    "state_dir": ".trd-state",
    "docs_dir": "docs",
    "prd_dir": "docs/PRD",
    "trd_dir": "docs/TRD"
  }
}
```

The `permissions.allow` list auto-approves safe operations (git, test runners, formatters). The `hooks` section wires lifecycle events to their handlers. The `ensemble` section configures directory paths.

**Local overrides:** Create `.claude/settings.local.json` (gitignored) for machine-specific settings like MCP server enablement:

```json
{
  "enableAllProjectMcpServers": true
}
```

---

## How Components Interact

### A Typical Feature Flow

1. **User types** `/create-prd Add user authentication`
2. **Command** `create-prd.md` is loaded as the prompt
3. **Router hook** fires on UserPromptSubmit, detects no special routing needed
4. **Command** delegates to `product-manager` agent with the requirements
5. **Agent** generates the PRD, writes to `docs/PRD/user-auth.md`
6. **State** updated in `.trd-state/current.json`

7. **User reviews PRD**, runs `/create-trd`
8. **Command** reads current PRD from state, delegates to `technical-architect`
9. **Agent** generates TRD with task breakdown

10. **User reviews TRD**, runs `/implement-trd`
11. **Command** parses TRD for tasks, creates execution plan
12. For each task:
    - **Router** selects the appropriate implementer agent
    - **Implementer** writes code
    - **Formatter hook** fires on every file write
    - **Permitter hook** validates any dangerous operations
    - **Status hook** updates implement.json on agent completion
    - **Verify agent** runs tests
    - **Simplifier agent** refactors if tests pass
    - **Reviewer agent** does security/quality check

13. **User runs** `/fold-prompt`
14. **Command** analyzes session, updates CLAUDE.md
15. **Stop hooks** fire in order: async-discipline and autonomy-discipline vet the final turn, wiggum.js processes the session, notify.sh sends any configured notification

### Data Flow

```
User Prompt
    |
    v
[Router Hook] --> routing context appended
    |
    v
[Command Prompt] --> structured workflow
    |
    v
[Agent Delegation] --> fresh sub-agent context
    |
    v
[Code Changes] --> [Formatter Hook] --> formatted files
    |
    v
[Permission Requests] --> [Permitter Hook] --> auto-approve or prompt
    |
    v
[Agent Completes] --> [Status Hook] --> implement.json updated
    |
    v
[Session Stops] --> [Async + Autonomy Guards] --> [Wiggum + Notify] --> cleanup + notifications
```
