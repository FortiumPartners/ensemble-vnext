# ensemble-vnext Constitution

Project absolutes and architecture invariants for Claude Code Plugin Development.

---

## Core Principles

### 1. Commands Orchestrate, Subagents Execute

- **Commands** define and control workflow logic
- **Subagents** perform specialized work delegated by commands
- This separation provides visibility, debuggability, and determinism

**The orchestrator owns the task list.** Task-list mutation (`TaskCreate`, `TaskUpdate`,
`TaskGet`, `TaskList`) is the command's job, never a subagent's. A subagent does not complete
a task — it returns a result, and the orchestrator records completion based on that return.
This is not merely convention: background subagents (the platform default) have the task tools
**removed**, and *"the removal reports no error."* A delegation template that instructs a
subagent to update its own task fails silently. If a worker genuinely needs to self-claim,
that is an agent-team teammate (teammates keep the task tools), not a subagent — and needing
one is a signal the wrong construct was chosen.

**Nesting stance: forbidden by default, permitted only with a named fan-out rationale.**
Subagents *may* spawn subagents (platform default; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), and
this project deliberately does not use that capability.

**Revised 2026-08-14, user-approved, against an observed failure.** The previous stance permitted
nesting by default and forbade it for three named leaf agents. That inverted its own justification:
the rationale given was *"agents whose work genuinely fans out — the canonical case is a reviewer
dispatching a verifier per finding"*, and `code-reviewer` — the canonical case — was one of the
three forbidden. Meanwhile every implementer, which fans nothing out, was permitted by default.

What that produced, observed in a live session:
`backend-implementer → backend-implementer → backend-implementer`, with an **identical task
description at the last two levels**. Not decomposition — an agent handed a task and spawning a
copy of itself with the same task. Roughly **567k tokens** across the chain, the deepest agent
doing the actual work while two wrappers waited on it.

- **Forbidden for every agent that does work and reports it** — which is all of them today.
  `backend-implementer`, `frontend-implementer`, `mobile-implementer`, `agent-implementer`,
  `app-debugger`, `code-reviewer`, `code-simplifier` and `verify-app` all declare
  `disallowedTools: Agent`.
- **Permitted only where an agent's work genuinely fans out**, stated as a named rationale in that
  agent's own definition. No agent qualifies today. Adding one is a deliberate act, not a default.
- **Same-type self-delegation is forbidden outright**, even where nesting is otherwise permitted.
  A depth limit does not catch it: three levels of the same agent on the same task is within
  depth 3 and is pure recursion.
- **Concurrency counts the whole tree.** Nested subagents occupy the same 20-slot pool
  (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).

**An implementer that hits work outside its scope reports the conflict; it does not delegate.**
The orchestrator owns the task list, so a scope conflict is information the orchestrator must
receive — a nested spawn hides both the decision and its reasoning from the only context that can
act on it. The three implementers previously carried an explicit *"delegate appropriately"*
instruction for cross-domain work, which contradicted this principle and has been removed.

The cost this avoids: intermediate output from a nested subagent is *designed* not to reach the
orchestrator, so a wrong conclusion several layers down arrives as a confident summary with its
reasoning discarded.

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
- Hooks are no longer uniformly deterministic (amended 2026-08-13, see Changelog). Most hooks
  are `hookType: "command"` — scripts, unit-tested like any other code. Three Stop/SubagentStop
  discipline hooks (`async-discipline.js`, `autonomy-discipline.js`, `subagent-discipline.js`)
  are `hookType: "prompt"` — evaluated by the platform's own model judge instead of our code,
  per `.claude/rules/async-discipline.md` and `.claude/rules/autonomy.md`
- Model-judged hooks are verified differently: against a labeled corpus, with acceptance
  thresholds stated over multiple runs rather than a single pass/fail, because the judge has
  been observed to vary its false-positive and false-negative calls across identical repeated
  runs on the same corpus
- The deterministic-layer claim survives in narrowed form: command-type hooks, `lib/`, and the
  generator (`generate-hooks-artifacts.sh`) remain deterministic and unit-tested

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

There is no `SessionEnd` hook anywhere in the framework as of 4.1.0. `learning.sh` (which
staged files at session end) and `save-remote-logs.js` (which committed session transcripts
when `ENSEMBLE_SAVE_REMOTE_LOGS=1`) were both retired: `learning.sh` was invoked by nothing —
`/update-project` does its own analysis and does not call it — and `save-remote-logs.js` wrote
to git on an ambient env var, which is not a thing that should happen without an explicit
request. Their removal is what makes the "no auto-commit in `SessionEnd`" prohibition below
structural rather than aspirational.

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

### Version 1.1.0 (2026-08-13)

- Principle 4 amended: hooks are no longer uniformly deterministic — three discipline hooks
  (`async-discipline.js`, `autonomy-discipline.js`, `subagent-discipline.js`) moved to
  `hookType: "prompt"` (model-judged), per `docs/TRD/discipline-judgment.md`. User-approved
  2026-08-13 (recorded in that TRD as decision D6).

### Version 1.2.0 (2026-08-14)

- Nesting stance inverted: forbidden by default, permitted only with a named fan-out rationale.
  Prompted by an observed `backend-implementer → backend-implementer → backend-implementer` chain
  with an identical task at the last two levels. User-approved.

### Version 1.0.0 (2026-01-22)

- Initial constitution generated by /init-project

---

*This constitution is maintained by the user and requires explicit confirmation for changes.*
*Generated by /init-project on 2026-01-22*
