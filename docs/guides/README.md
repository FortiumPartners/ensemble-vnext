# Ensemble for Claude Code

**AI-Augmented Engineering: From Copilot to Autopilot**

Ensemble is a workflow framework for Claude Code that transforms ad-hoc AI-assisted coding into a governed, repeatable engineering process. It provides the structure, guardrails, and specialist agents that make AI-generated code production-ready.

## The Problem

Teams adopt AI coding tools and get an initial productivity boost, only to hit a wall when shipping to production. The issue isn't the AI -- it's the lack of governance and specifications.

- Inconsistent code quality that varies between sessions
- Thin specifications lead to endless rework loops
- Fast prototypes that can't survive production scrutiny
- Hidden technical debt that surfaces during code review

## The Solution: Artifact-First + Gates

Ensemble's core insight is simple: **write down what you're building before you build it, and validate what you've built before you ship it.**

- **Artifacts before implementation** -- PRD and TRD specs drive code generation
- **Gates before merging** -- automated tests, CI checks, and code review enforce quality
- **Agents execute, humans course-correct** -- specialist AI agents do the work; you set the plan and adjust after each pass

## How It Works

Ensemble adds four building blocks to any Claude Code project:

| Block | What It Does |
|-------|-------------|
| **Commands** | Slash commands (`/create-prd`, `/implement-trd`) that encode proven workflow patterns |
| **Agents** | 13 specialist AI workers (backend, frontend, mobile, AI/agent, testing, debugging, etc.) that receive focused tasks |
| **Skills** | Domain knowledge packs (pytest, TypeScript, React, etc.) loaded on demand |
| **Hooks** | Automated guardrails that run on every prompt, edit, and session boundary |

Together they create a development loop:

```
Story/Idea
    |
    v
/create-prd  -->  Product Requirements Document (what + why)
    |
    v
/create-trd  -->  Technical Requirements Document (how + tasks)
    |
    v
/implement-trd  -->  Code + Tests + Review (governed execution)
    |
    v
/fold-prompt  -->  Update CLAUDE.md with learnings
    |
    v
Quit + Restart  -->  Fresh context for next iteration
```

## Quickstart

### Prerequisites

- **Claude Code CLI** installed and configured
- **Node.js** 18+ and npm
- **Git** 2.x+

### 1. Install the Ensemble Plugin

```bash
# Clone the repository
git clone https://github.com/fortiumPartners/ensemble.git ~/dev/ensemble
cd ~/dev/ensemble && npm install

# Register as a local plugin marketplace
claude plugins add-marketplace ./

# Install at user scope (available across all projects)
claude plugin install ensemble-full --scope user
```

### 2. Initialize Your Project

Open Claude Code in any project and run:

```
/init-project
```

This analyzes your project and creates:
- `.claude/agents/` -- 13 specialist subagents
- `.claude/commands/` -- workflow commands
- `.claude/hooks/` -- quality guardrails
- `.claude/skills/` -- domain knowledge matched to your stack
- `.claude/rules/constitution.md` -- project guardrails and quality gates
- `.claude/rules/stack.md` -- detected technology stack

### 3. Build Your First Feature

```
/create-prd     # Describe the feature, get a structured PRD
                 # READ IT. AI review catches structure; human review catches intent.

/create-trd     # Generate architecture, task breakdown, and execution plan
                 # READ IT. This is your flight plan.
```

### 4. Run the Three-Pass Implementation

We recommend running with `--dangerously-skip-permissions` and executing the TRD three times:

```bash
# Pass 1: Build the reference implementation (TDD, meet acceptance criteria)
claude --dangerously-skip-permissions
> /implement-trd-team

# Pass 2: Harden (edge cases, error handling, close gaps)
claude --dangerously-skip-permissions
> /implement-trd-team

# (Optional: run CI/reviewer pipeline between passes 2 and 3)

# Pass 3: Validate against the original PRD with live testing
claude --dangerously-skip-permissions
> /implement-trd-team
```

After three passes, the human developer steps in to debug and get it over the finish line. See [Concepts](./CONCEPTS.md#the-three-pass-implementation) for the full rationale.

### 5. Fold and Restart

Between passes (and at the end), fold learnings into CLAUDE.md:

```
/fold-prompt     # Capture learnings into CLAUDE.md
exit             # Quit Claude Code
claude           # Restart with fresh context
```

This prevents context bloat and ensures each session starts with consolidated knowledge.

## Key Concepts

### You Are Air Traffic Controller, Not Pilot

The mental model isn't hand-flying one aircraft -- it's orchestrating multiple flights from a control tower. You file the flight plan (PRD/TRD), clear flights for takeoff (`--dangerously-skip-permissions`), monitor several in-flight simultaneously (team agents), and course-correct when they land. The framework handles the flying; you handle the plan and the adjustments between passes.

### Trust the Plan, Iterate on Results

Perfect execution on the first pass isn't the goal. A perfect *plan* is the goal. With a solid PRD/TRD and three implementation passes, the framework converges on production-ready code through iteration -- not through constant human supervision of every line.

### Context Is a Budget

AI context is finite. Quality degrades as it fills up. Write important decisions into artifacts (PRD, TRD, CLAUDE.md), not just chat. Plan to fold and restart when context reaches 50-60%.

### Durable IP vs Swappable Tools

Your workflow (commands, templates, quality gates) is durable IP that survives tool churn. The specific LLM, IDE, or CI platform is swappable. Invest in process, not tool memorization.

## Documentation

| Document | Purpose |
|----------|---------|
| [Installation Guide](./INSTALL.md) | Detailed setup, configuration, updating, and troubleshooting |
| [Concepts](./CONCEPTS.md) | Mental models, artifact flow, context management, human/AI responsibilities |
| [Process Guide](./PROCESS.md) | Step-by-step workflow from init through three-pass implementation |
| [Architecture](./ARCHITECTURE.md) | Complete reference for agents, commands, hooks, skills, and governance files |

## License

Ensemble is developed and maintained by **Fortium Partners**.
