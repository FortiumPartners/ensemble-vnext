# ensemble-vnext Constitution

Project absolutes and architecture invariants for Claude Code Plugin Development.

---

## Core Principles

### 1. Commands Orchestrate, Subagents Execute

- **Commands** define and control workflow logic
- **Subagents** perform specialized work delegated by commands
- This separation provides visibility, debuggability, and determinism

### 2. Skills and Agents are PROMPTS Only

- Skills are `.md` files interpreted by the LLM at runtime
- Agents are `.md` files with YAML frontmatter
- No executable code in skill or agent definitions
- Prompt engineering is the implementation medium

### 3. Commands are Prompts with Optional Shell Scripts

- Commands fundamentally are prompts (Markdown files with YAML frontmatter)
- Deterministic operations (scaffolding, validation) use shell scripts
- LLM handles non-deterministic operations (content generation, analysis)

### 4. Non-Deterministic System

- LLM outputs are inherently variable
- Most testing must be manual due to non-deterministic nature
- Test mechanism: `claude --prompt "..." --session-id xxx --dangerously-skip-permissions`
- Review session logs to verify agents, skills, and hooks used
- Unit testing applies only to hooks and utility scripts

---

## Architecture Invariants

### Vendored Runtime

- All runtime components live in `.claude/` directory
- Runtime is committed to git for reproducibility
- Identical behavior in local CLI and Claude Code Web sessions
- Local settings (`.local.json`) are gitignored

### Two-Layer Architecture

```
Plugin (Generator Layer)     Vendored Runtime (Execution Layer)
------------------------     ---------------------------------
Generator Commands     -->   Project Subagents
Skills Library         -->   Compiled Skills (based on stack)
Hook Templates         -->   Installed Hooks
Review CLI             -->   Workflow Commands
```

### Artifact Flow

```
Story/Idea --> PRD --> TRD (with Execution Plan) --> Implementation
```

### Governance Split

| Layer | Artifact | Change Frequency | Owner |
|-------|----------|------------------|-------|
| Slow | `constitution.md` | Rare, requires confirmation | User |
| Slow | `stack.md` | Occasional, requires confirmation | User |
| Fast | `CLAUDE.md` | Frequent, on request | `/update-project`, `/cleanup-project` |

`CLAUDE.md` is updated by explicitly invoking `/update-project` (capture learnings) or
`/cleanup-project` (prune). No hook rewrites `CLAUDE.md` on its own.

`learning.sh` (in `.claude/hooks/`) is the staging helper `/update-project` builds on. It is
**not** registered in this repo's own `.claude/settings.json` — this repo has no `SessionEnd`
hook at all. The framework settings template
(`packages/core/templates/claude-directory/settings.json`) *does* register `SessionEnd` →
`learning.sh` + `save-remote-logs.js`, so a scaffolded project runs them at session end. Those
hooks only **stage** files and save logs; they never commit and never rewrite `CLAUDE.md`, per
the "no auto-commit in SessionEnd" prohibition below.

---

## Technology Stack

See `stack.md` for complete technology stack definition.

### Primary Context

Claude Code Plugin Development - Target: Claude Code marketplace distribution

### Languages

| Purpose | Language |
|---------|----------|
| Hook implementation | JavaScript/Node.js |
| Router hook | Python |
| Integration tests | Shell/BATS |
| Prompts, skills, agents | Markdown |

### Runtime Dependencies

- Claude Code CLI (latest)
- Node.js 18+ (for hooks)
- Git 2.x+ (for version control)
- Python 3.x (for router hook)

---

## 13 Streamlined Subagents

| Category | Agent | Responsibility |
|----------|-------|----------------|
| Artifact | `product-manager` | PRD creation and refinement |
| Artifact | `technical-architect` | TRD creation and refinement |
| Planning | `spec-planner` | Execution planning and parallelization |
| Implement | `frontend-implementer` | UI, components, client logic |
| Implement | `backend-implementer` | APIs, services, data layer |
| Implement | `mobile-implementer` | Mobile apps (when applicable) |
| Implement | `agent-implementer` | AI/agent behavior: prompts, RAG, agent loops, evals |
| Quality | `verify-app` | Test execution and verification |
| Quality | `code-simplifier` | Post-verification refactoring |
| Quality | `code-reviewer` | Security and quality review |
| Quality | `app-debugger` | Debug verification failures and bugs |
| DevOps | `devops-engineer` | Infrastructure and deployment |
| DevOps | `cicd-specialist` | Pipeline configuration |

---

## Quality Gates

Before completing any implementation:

- [ ] Tests pass (unit >= 60%, integration >= 50% when applicable)
- [ ] No secrets in code
- [ ] Input validation present
- [ ] Documentation updated

---

## Verification Requirements

verification_level: unit-only

This is a plugin development project. Standard unit/integration tests are sufficient. Tasks marked `[LIVE]` in TRDs override this default.

---

## Approval Requirements

### Requires User Approval

- Architecture changes
- Changes to constitution.md or stack.md
- Modifications to baseline ~/dev/ensemble (read-only reference)

### No Approval Needed

- Reading files from anywhere
- Creating new files in `.claude/` and `docs/`
- Running tests
- Git operations: status, diff, log, add, commit
- Creating/modifying files during implementation workflow

---

## Prohibited Patterns

1. **No tool restrictions by default** - Subagents have all tools enabled (omit `tools:` line)
2. **No executable code in skills/agents** - Prompts only
3. **No implicit knowledge** - Workflows must be explicit in commands
4. **No blocking hooks** - Hooks never block unless explicitly required
5. **No auto-commit in SessionEnd** - Stage only, let user/system handle commits
6. **No false async claims** - See `.claude/rules/async-discipline.md`. An agent claiming
   "I'll let you know when done" / "running in the background" / "I'll report back" without
   using `Agent({run_in_background: true})`, `ScheduleWakeup`, `Monitor`, or `/goal` in the
   same turn is a hallucinated notification — the agent will sit idle until prompted.
   Enforced by the `async-discipline.js` Stop hook (blocks the violation; one of the
   explicit-exception cases under rule 4).
7. **No silent completion** - See `.claude/rules/command-status.md`. Every workflow
   command emits standard `[STATUS: ...] DISPATCHED`, `[STATUS: ...] RESUMED`, and
   `═══ COMMAND COMPLETE: ... ═══` banners so the user can always tell what state the
   work is in. The COMMAND COMPLETE banner is the LAST line of the command's final turn.
   A command that ends silently is a bug.
8. **No defensive checkpointing** - See `.claude/rules/autonomy.md`. Workflow commands
   run autonomously from one explicit user invocation to one final result. They do NOT
   pause to ask the user to confirm decisions the command already has enough information
   to make, to review mid-loop artifacts, to verify checkpoints, or to defer to
   stakeholders. `AskUserQuestion` is restricted to four cases: (1) genuine requirement
   ambiguity with no documented default, (2) missing information that cannot be derived,
   (3) truly irreversible destructive operations, (4) STUCK conditions after retry
   exhaustion. Outside those four cases, decide and proceed. Exempt: `/refine-prd` and
   `/refine-trd` (intentionally interactive).

---

## Testing Philosophy

Given the non-deterministic nature of LLM-based systems:

1. **Manual verification** is primary testing method
2. **Session log review** confirms correct agent/skill invocation
3. **Deterministic scripts** (hooks, utilities) get unit tests
4. **Integration testing** uses controlled prompts and session inspection
5. **OpenTelemetry** traces for execution verification (when feasible)

---

## Changelog

### Version 1.0.0 (2026-01-22)

- Initial constitution generated by /init-project

---

*This constitution is maintained by the user and requires explicit confirmation for changes.*
*Generated by /init-project on 2026-01-22*
