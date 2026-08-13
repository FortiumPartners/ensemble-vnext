# Ensemble Concepts

The mental models, principles, and patterns that make AI-augmented engineering reliable.

---

## The Evolution of AI Development

Understanding where Ensemble fits helps clarify both its power and its boundaries.

| Stage | Description | Human Role |
|-------|-------------|------------|
| **Manual** | Developer writes every line, makes every decision | Full control |
| **Copilot** | IDE suggests completions and snippets | Drives every decision, gets typing help |
| **Vibe Coding** | AI generates substantial code from prompts | Prompts, reviews, iterates |
| **Autopilot** | Governed agent execution with specifications driving implementation | Sets plan, monitors, intervenes on exceptions |

Ensemble operates at the **Autopilot** level: specifications drive implementation, gates ensure quality, and humans monitor for exceptions. Intervention is exception-based, not constant.

---

## Ground Rules

Success with AI-augmented engineering requires a fundamental mindset shift. These aren't restrictions -- they're enabling constraints that make speed safe and sustainable.

### You Are Air Traffic Controller, Not Pilot

The mental model isn't hand-flying one aircraft -- it's orchestrating multiple flights from a control tower. You file the flight plan (PRD/TRD), clear flights for takeoff (`--dangerously-skip-permissions`), monitor several in-flight simultaneously (team agents), and course-correct when they land. The framework handles the flying; you handle the plan and the adjustments between passes.

Think like an air traffic controller:
- **You** file the flight plans (PRD/TRD specifications)
- **You** clear flights for takeoff (launch `--dangerously-skip-permissions` sessions)
- **You** monitor the airspace (review results between passes)
- **You** course-correct when flights land (adjust plan, re-run)
- **AI** flies the aircraft (implements tasks autonomously)
- **AI** follows the filed plan (adheres to TRD specs)
- **AI** reports position on landing (fold-prompt, status hooks)
- **AI** handles all in-flight operations (routing, formatting, testing)

The key insight: you don't need to watch every line of code being written any more than a controller watches every control input in every cockpit. You trust the system, verify on landing, and intervene only on exceptions.

### Perfect Plan Over Perfect Execution

The goal isn't perfect code on the first pass -- it's a perfect *plan* that converges on production-ready code through iteration. With a solid PRD/TRD and three implementation passes, the framework gets you there without constant human supervision of every line.

This is counterintuitive for engineers accustomed to writing code themselves. The instinct is to watch everything, correct in real-time, and hand-tune each function. That approach doesn't scale. Instead, invest your time in the specification (PRD and TRD), trust the framework to execute, and course-correct between passes based on results.

### Review Artifacts Before Code

Specifications drive implementation quality. Catching errors in the PRD or TRD is 10x cheaper than fixing them in code. A bad PRD produces a wrong TRD, which produces misaligned code that needs to be thrown away.

### Trust Tests + CI Over Vibes

Automated validation provides objective confidence. Subjective assessment without gates leads to hidden technical debt. "It looks right" is not a quality gate.

### Stop Early When Narrative Smells Wrong

AI drift compounds. If the output feels generic, superficial, or off-track, pause immediately and redirect rather than letting it continue. The cost of stopping and correcting is always less than the cost of building on a bad foundation.

---

## Core Concepts

### Artifacts = Source of Truth

Artifacts are written specifications that persist across sessions, enable safe restarts, and provide reviewable quality gates. They're not optional documentation -- they're the operating system of your autopilot.

**The three core artifacts:**

| Artifact | Defines | Audience | Created By |
|----------|---------|----------|------------|
| **PRD** (Product Requirements Document) | What and why. User stories, acceptance criteria, edge cases, constraints. | Product review | `/create-prd` |
| **TRD** (Technical Requirements Document) | How. Architecture, API contracts, data models, task breakdown, test plan. | Technical review | `/create-trd` |
| **CLAUDE.md** | Project memory. Patterns, conventions, past decisions, debugging notes. | AI sessions | `/fold-prompt` |

**Quality indicators for artifacts:**
- PRD includes edge cases and non-goals
- TRD tasks map 1:1 to acceptance criteria
- CLAUDE.md captures decisions and rationale
- Artifacts are reviewable without running code

### Gates = Quality Enforcement

Gates are automated validation checkpoints that provide objective confidence before code moves forward. They transform "hope" into "proof."

| Gate | What It Checks | When |
|------|---------------|------|
| **Tests** | Unit, integration, E2E -- components work correctly | During implementation |
| **CI Checks** | Lint, type checking, build, security scanning, coverage | On every commit |
| **PR Protections** | CI passing, human code review, approval required | Before merge |
| **Fold Prompt** | Learnings captured, CLAUDE.md updated | Session end |

Without gates, speed creates chaos. With gates, speed creates value.

### Context Is a Budget

This is perhaps the most counterintuitive but critical concept: AI context is a finite, degrading resource. Managing it well is the difference between reliable and unreliable output.

**Why context management matters:**

As context fills up, output quality degrades. The AI starts making simplifications, forgetting earlier decisions, and generating confident but incorrect responses. Auto-compaction makes this worse by compressing earlier work into lossy summaries.

**The degradation curve:**
- **0-50% context:** Quality remains high and stable
- **50-60% context:** Subtle degradation -- slightly generic responses, minor oversimplifications
- **80%+ context:** Unreliable -- confident but wrong simplifications, lost constraints

**The heuristic:** If something is important enough to remember, write it down in an artifact (PRD, TRD, CLAUDE.md), don't just mention it in chat. Artifacts persist; chat history gets compressed or forgotten.

**Practical rules:**
- Keep the prime agent lean and focused
- Push detailed work into sub-agents (they get fresh context)
- Restart sessions before quality degrades (fold at 50-60%)
- Use artifacts to preserve decisions across sessions

### Durable IP vs Swappable Tools

One of the most important strategic insights: invest in workflows and patterns that survive technology churn, not in mastering specific tools that will be obsolete in 18 months.

| Durable (Your IP) | Swappable (Tool Layer) |
|-------------------|----------------------|
| Command patterns and orchestration logic | Specific LLM model (Claude, GPT, Gemini) |
| Artifact templates (PRD/TRD/CLAUDE.md) | IDE or code editor |
| Quality gates and acceptance criteria | Ticketing system integration |
| Team habits around fold and restart | UI generator tool |
| Project-specific conventions and decisions | Test framework (within reason) |

The workflow survives tool churn. When a better model ships next quarter, you don't rebuild your process -- you just swap the model.

---

## The Development Loop

### Artifact Flow

Every feature follows the same flow, whether it takes 30 minutes or 3 weeks:

```
Story / Idea
     |
     v
/create-prd  ---------->  docs/PRD/<feature>.md
     |
     v  (optional: /refine-prd)
     |
/create-trd  ---------->  docs/TRD/<feature>.md
     |
     v  (optional: /refine-trd)
     |
/implement-trd  ------->  Code + Tests + Review
     |                     .trd-state/<feature>/implement.json
     v
/fold-prompt  ---------->  Updated CLAUDE.md
     |
     v
Quit + Restart  -------->  Fresh context for next iteration
```

### Phase 1: Requirements (PRD)

`/create-prd` takes a feature description and produces a comprehensive Product Requirements Document. You can feed requirements directly from your lifecycle management system:

- **Jira:** Use the `managing-jira-issues` skill
- **Linear:** Use the `managing-linear-issues` skill
- **Azure DevOps:** Use the relevant MCP server

**Critical:** Even with AI review via `/refine-prd`, it is essential to **thoroughly read the PRD yourself**. AI review catches structural issues; human review catches requirements misunderstandings.

### Phase 2: Architecture (TRD)

`/create-trd` transforms the approved PRD into a Technical Requirements Document with:
- Architecture decisions and trade-offs
- API contracts and data models
- Master task list with unique IDs (TRD-XXX format)
- Execution plan with phases and work sessions
- Testing strategy and quality requirements

### Phase 3: Implementation (The Three-Pass Approach)

A single implementation pass rarely produces production-ready code -- just as a single draft rarely produces a publishable document. Ensemble's recommended workflow runs three commands in sequence, each pass with a different focus. Each pass runs in its own Claude Code session with `--dangerously-skip-permissions` for uninterrupted execution.

**Why three passes?** Each pass operates against an increasingly complete codebase. The first pass creates the skeleton. The second pass strengthens it. The third pass validates it against the original requirements. This mirrors how experienced engineers naturally iterate, but at machine speed.

#### Pass 1: Build the Reference Implementation

```bash
claude --dangerously-skip-permissions
> /implement-trd
```

Focus: TDD-based implementation meeting acceptance criteria. Tests first, code second. The goal is a working skeleton that satisfies the TRD's task list with passing tests.

#### Pass 2: Harden Against the Reference

```bash
claude --dangerously-skip-permissions
> /harden-trd-team
```

Focus: Edge cases, error handling, robustness. The framework now has a reference implementation to harden against. This pass closes gaps, handles failure modes, and refines the code that Pass 1 built, using parallel teammates.

**(Optional: CI/Reviewer Pipeline)** Between passes 2 and 3, run your CI/CD and code review pipeline. Let automated tools assess coverage, quality, and security requirements. Feed any findings back into the TRD or CLAUDE.md before Pass 3.

#### Pass 3: Validate Against the Original PRD

```bash
claude --dangerously-skip-permissions
> /verify-trd-team
```

Focus: Live testing against the original PRD's acceptance criteria and definition of done. This pass ensures the implementation actually delivers what was requested, not just what was technically specified.

#### After Three Passes: Human Finishes

After three passes, the human developer steps in to debug remaining issues and get the feature over the finish line. At this point, the code is substantially complete -- typically 85-95% -- and the remaining work is the kind of nuanced problem-solving that humans still do best.

Within each pass, `/implement-trd` executes a staged loop for every task:

```
IMPLEMENT --> VERIFY --> [DEBUG if fail] --> SIMPLIFY --> VERIFY --> REVIEW
```

For each task in the TRD:
1. The appropriate specialist agent implements the task
2. `verify-app` runs tests
3. If tests fail, `app-debugger` investigates (up to 3 retries)
4. `code-simplifier` refactors for clarity
5. `code-reviewer` checks for security and quality

### Phase 4: Fold and Restart

Between each pass (and at the end), fold learnings and restart:

```bash
/fold-prompt     # Capture learnings into CLAUDE.md
exit             # Quit Claude Code
claude           # Restart with fresh context
```

`/fold-prompt` analyzes the session's work and updates CLAUDE.md with:
- New patterns and conventions discovered
- Architecture decisions made
- Debugging notes worth preserving
- Updated file structure references

Restarting Claude Code ensures each session starts with fresh context and consolidated knowledge. This prevents context degradation (see [Context Is a Budget](#context-is-a-budget) above) and ensures each pass operates at peak quality.

---

## Orchestration Model

### Commands Orchestrate, Agents Execute

This is a fundamental architectural principle. **Commands** define and control workflow logic. **Agents** perform specialized work delegated by commands. This separation provides visibility, debuggability, and determinism.

Think of it as structured prompting with rails. The commands guide Claude through proven workflows while allowing flexibility within each step.

### The Prime + Sub-Agent Pattern

Instead of one bloated conversation trying to handle everything, Ensemble maintains a lean coordinator (the prime agent) and creates fresh, focused contexts for specific tasks via sub-agents.

**Why this matters:**
- Sub-agents get fresh context (no accumulated noise)
- Each specialist agent has focused instructions
- The prime agent stays lean and strategic
- Context budget is spent efficiently

### Team Execution and Parallel Operation

The team variants (`/create-prd-team`, `/create-trd-team`, `/harden-trd-team`, `/verify-trd-team`) take the sub-agent pattern further by running multiple specialists concurrently. Instead of sequential task execution, team mode spawns teammates directly (`Agent({subagent_type, name, prompt})`) that work on independent tasks simultaneously — a team forms automatically on the first spawn, with no setup or teardown step.

This is what makes the air traffic controller model concrete: you launch a team session with `--dangerously-skip-permissions`, and multiple agents work in parallel -- just as multiple aircraft fly simultaneously under ATC coordination. The `wiggum` hook monitors progress and manages session lifecycle. The `status` hook tracks which tasks complete and which need attention.

The tradeoff is API cost for speed and breadth. A single `/implement-trd` session processes tasks sequentially; `/harden-trd-team` and `/verify-trd-team` can process an entire phase's worth of independent tasks concurrently via parallel teammates.

### The 13 Specialist Agents

| Category | Agent | Responsibility |
|----------|-------|---------------|
| **Artifact** | `product-manager` | PRD creation and refinement |
| **Artifact** | `technical-architect` | TRD creation and refinement |
| **Planning** | `spec-planner` | Execution planning and parallelization |
| **Implementation** | `frontend-implementer` | UI, components, client logic |
| **Implementation** | `backend-implementer` | APIs, services, data layer |
| **Implementation** | `mobile-implementer` | Mobile apps (when applicable) |
| **Implementation** | `agent-implementer` | AI/agent apps — prompts, model selection, RAG, tool calling, agent memory |
| **Quality** | `verify-app` | Test execution and verification |
| **Quality** | `code-simplifier` | Post-verification refactoring |
| **Quality** | `code-reviewer` | Security and quality review |
| **Quality** | `app-debugger` | Debug verification failures and bugs |
| **DevOps** | `devops-engineer` | Infrastructure and deployment |
| **DevOps** | `cicd-specialist` | CI/CD pipeline configuration |

---

## Human vs AI Responsibilities

Clarity about who does what prevents confusion and quality degradation. This isn't about replacing humans -- it's about optimal task allocation based on comparative advantage.

The boundary has shifted further toward AI autonomy than most engineers initially expect. The human role is concentrated at the *beginning* (specification) and *end* (final debugging and approval) of the cycle, with AI handling the bulk of execution in the middle.

### Human Responsibilities

- **Before execution:** Define intent, goals, and constraints. Review and approve PRD and TRD.
- **Between passes:** Review results, adjust plan, run CI/reviewer pipelines. Course-correct.
- **After three passes:** Debug remaining issues. Final testing and acceptance.
- **Always:** Make risk and priority decisions. Approve PRs and releases. Maintain team standards.

### AI Responsibilities

- Draft PRDs from requirements
- Generate TRDs with architecture, task breakdown, and execution plans
- Implement all tasks from TRDs across three passes (TDD, hardening, validation)
- Write and run tests based on acceptance criteria
- Debug test failures (up to 3 retries per task)
- Refactor for clarity and review for security
- Track progress across sessions via state management
- Summarize and document decisions via fold-prompt

**The golden rule:** Humans set the plan and validate the result. AI handles everything in between. The quality of the plan determines the quality of the output.

---

## Implementation Strategies

`/implement-trd` supports different strategies based on the nature of the work:

| Strategy | Best For | Behavior |
|----------|----------|----------|
| `tdd` | Greenfield projects | Tests first, RED-GREEN-REFACTOR |
| `characterization` | Legacy/brownfield | Document current behavior AS-IS, no refactoring |
| `test-after` | Prototypes, UI work | Implement then test |
| `bug-fix` | Regressions | Reproduce with failing test, fix, verify |
| `refactor` | Tech debt | Tests pass before AND after |

---

## State Management

Ensemble tracks implementation progress across sessions using `.trd-state/`.

### Current Feature Pointer

`.trd-state/current.json` remembers which feature you're working on:

```json
{
  "prd": "docs/PRD/<feature>.md",
  "trd": "docs/TRD/<feature>.md",
  "status": ".trd-state/<feature>/implement.json"
}
```

This enables commands to work without explicit path arguments -- just run `/create-trd` and it knows which PRD to use.

### Implementation Status

`.trd-state/<feature>/implement.json` tracks:
- Task status (pending, in_progress, success, failed)
- Cycle position (implement, verify, simplify, review, complete)
- Checkpoints for safe resume
- Coverage metrics

Use `--resume` or `--continue` with `/implement-trd` to pick up where you left off.

---

## Team Variants

For complex features that benefit from parallel work, Ensemble offers team variants of the requirements commands:

| Standard | Team Variant | Difference |
|----------|-------------|------------|
| `/create-prd` | `/create-prd-team` | Multiple domain experts analyze in parallel |
| `/create-trd` | `/create-trd-team` | Parallel architecture perspectives |

Implementation is a single sequential command (`/implement-trd` — see plan item 7/8 for a
future task-graph-driven parallel mode). Two team commands operate *after* an
implementation pass, using parallel teammates:

| Command | Purpose |
|---------|---------|
| `/harden-trd-team` | Hardening pass — closes gaps, edge cases, contract/interaction risks, and regressions against an implemented TRD |
| `/verify-trd-team` | Live verification pass — confirms the feature actually works via API, UI, and service-integration testing |

These map onto the three-pass workflow: `/implement-trd` for the build pass, `/harden-trd-team` for hardening, and `/verify-trd-team` for validation against the PRD.

Team variants use Claude Code's agent teams feature to run multiple specialists simultaneously, trading API cost for speed and breadth of analysis. Teammates spawn directly via `Agent({subagent_type, name, prompt})` — a team forms automatically on the first spawn, with no setup or teardown step. Teammate `SendMessage` auto-delivery reliably re-invokes the orchestrating session as new turns; commands additionally pair each spawn with a recommended (not mandatory) `ScheduleWakeup` safety-net (see `.claude/rules/async-discipline.md`).

**`/harden-trd-team` and `/verify-trd-team` are the recommended commands for passes 2 and 3 of the three-pass workflow.** They launch parallel teammate sessions for independent tasks within each phase, significantly reducing wall-clock time compared to sequential execution. Combined with `--dangerously-skip-permissions`, a full pass can run unattended while you work on other things -- the air traffic controller model in practice.
