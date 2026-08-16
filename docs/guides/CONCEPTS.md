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

### Phase 3: Implementation

A single implementation pass rarely produces production-ready code -- just as a single draft rarely produces a publishable document. Ensemble used to run this as three separate commands, each in its own session (`/implement-trd`, then `/harden-trd-team`, then `/verify-trd-team`). As of 4.1.16 those two team commands are gone, and the work they did runs *inside* `/implement-trd` instead — one command, one session, still `--dangerously-skip-permissions` for uninterrupted execution.

**Why fold the passes into one loop?** The three-pass split existed because each pass needed an increasingly complete codebase to work against: skeleton, then hardening, then live validation. That's still true — but it turned out those checkpoints line up with phase boundaries `/implement-trd` already tracks, so there was no need for a human to manually launch a second and third session at the right moment. The command now inserts the hardening pass and the live-verification gate at the point in its own loop where the codebase is ready for them.

#### Per-phase loop

For every phase, and for every task within it:

```
IMPLEMENT --> VERIFY --> [DEBUG if fail] --> SIMPLIFY --> VERIFY --> REVIEW
```

1. The appropriate specialist agent implements the task
2. `verify-app` runs tests
3. If tests fail, `app-debugger` investigates (up to 3 retries)
4. `code-simplifier` refactors for clarity
5. `code-reviewer` checks for security and quality (phase-scoped review)

Each phase's gate (`implement-phase.js`) runs a `parallel()` verifier fan-out over that
phase's tasks — this is the adversarial "does the code hold up to scrutiny" check that used
to be `/harden-trd-team`'s job, now scoped to what just landed rather than run separately
after the fact. Any task marked `[LIVE]` in the TRD (or a TRD whose `verification_level` is
`live-required`/`e2e-required`) is verified against a running instance, not mocks — this is
the E2E gate that used to be `/verify-trd-team`'s job.

#### Feature-scale hardening pass

After the last phase's checkpoint and before the end-of-run review, `/implement-trd` runs
the same hardening agent once more, at feature scale — a lens no single phase's review could
apply, because interaction risk *between* phases only exists once every phase is assembled.
This is the "once more, but for the whole feature" half of what `/harden-trd-team` used to
do as a standalone pass.

#### After the run: `/audit-build`

`/implement-trd` finishing does not mean the feature is verified against its source
documents. Run `/audit-build` afterward for post-implementation verification (does the code
match the TRD's tasks?), validation (does it match the PRD's requirements?), and
traceability (does every requirement have both an implementation AND a test proving it?).
A requirement with code and no test is a **gap**, not a pass — that's the check nothing
else in this pipeline performs.

#### Human Finishes

At this point the code is substantially complete -- typically 85-95% -- and the remaining
work is the kind of nuanced problem-solving that humans still do best: debugging what
`/audit-build` surfaced, and final acceptance.

### Phase 4: Fold and Restart

Between phases of a long-running implementation (and at the end), fold learnings and restart:

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

Ensemble used to have two commands (`/harden-trd-team`, `/verify-trd-team`) that took the
sub-agent pattern further by running multiple specialists concurrently as agent-team
teammates spawned directly (`Agent({subagent_type, name, prompt})`) — a team forms
automatically on the first spawn, with no setup or teardown step. Both were removed in
4.1.16 (ITR-B012); their jobs did not disappear, they moved *inside* `/implement-trd`'s
own loop (see [Phase 3: Implementation](#phase-3-implementation)).

**Why fold parallel teams into the loop instead of keeping them as standalone commands?**
The team commands existed to run an entire phase's worth of independent hardening/verification
work concurrently. But `/implement-trd` already knows when a phase's tasks are done — it's
the one holding the phase boundary — so the natural place for that fan-out is the phase gate
itself, not a second command a human has to remember to launch afterward. `implement-phase.js`
now runs the hardening agent as a `parallel()` verifier fan-out at that gate, per phase, and
`/implement-trd` runs it once more at feature scale after the last phase. No standalone
replacement command was created for either job — a command adds nothing either job needs, and
`/implement-trd` was already the right place to reach concurrently-eligible work. (This is
a deliberate design decision, recorded as D15 in `docs/TRD/implement-trd-rework.md` — revisit
only if hardening code the loop did not build becomes routine; today `/code-review high`
covers that case.)

The `wiggum` hook still monitors progress and manages session lifecycle across the whole
run; the `status` hook still tracks which tasks complete and which need attention.

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
- **Between phases (for long runs):** Review progress via `/fold-prompt`, adjust plan, run CI/reviewer pipelines. Course-correct.
- **After the run:** Debug what `/audit-build` surfaced. Final testing and acceptance.
- **Always:** Make risk and priority decisions. Approve PRs and releases. Maintain team standards.

### AI Responsibilities

- Draft PRDs from requirements
- Generate TRDs with architecture, task breakdown, and execution plans
- Implement all tasks from TRDs, phase by phase, including in-loop hardening and live verification
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

## Where Agent Teams Still Run

Ensemble no longer has standalone "team variant" commands for implementation. Through
4.1.15, `/harden-trd-team` and `/verify-trd-team` ran *after* `/implement-trd` as separate
sessions that spawned parallel teammates for hardening and live verification. Both were
removed in 4.1.16 (see [Team Execution and Parallel Operation](#team-execution-and-parallel-operation)
above for why, and where their jobs live now — inside `/implement-trd`'s own phase gate and
feature-scale hardening pass).

Agent teams (`Agent({subagent_type, name, prompt})`, forming automatically on first spawn,
no setup/teardown step) are still used where a command's own work genuinely fans out into
independent pieces within a single session:

| Command | Team use |
|---------|----------|
| `/fix-issue` | Spawns one teammate per task (or group of related tasks) when an issue TRD has 2+ tasks; runs single-agent for 1 task |

Teammate `SendMessage` auto-delivery reliably re-invokes the orchestrating session as new
turns; commands pair each spawn with a recommended (not mandatory) `ScheduleWakeup`
safety-net (see `.claude/rules/async-discipline.md`).
