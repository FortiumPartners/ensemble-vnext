# Ensemble Process Guide

The step-by-step workflow for building features with Ensemble, from project setup through production-ready code.

---

## Overview

Every feature follows the same lifecycle:

```
/init-project             One-time project setup
       |
       v
/create-prd          -->  What are we building and why?
/refine-prd          -->  (optional) Iterate with stakeholder feedback
       |
       v
/create-trd          -->  How are we building it?
/review-trd          -->  (optional) Independent LLM review
/refine-trd          -->  (optional) Iterate with technical feedback
       |
       v
/implement-trd-team  -->  Pass 1: Build (TDD, meet acceptance criteria)
/fold-prompt + exit  -->  Capture learnings, restart fresh
/implement-trd-team  -->  Pass 2: Harden (edge cases, error handling)
  (CI/review pipeline)    (optional) Verify coverage and quality
/implement-trd-team  -->  Pass 3: Validate (live test against PRD)
/fold-prompt + exit  -->  Capture learnings
       |
       v
Human debug          -->  Developer finishes remaining ~5-15%
       |
       v
/fold-prompt         -->  Final learning capture
```

Each step is detailed below.

---

## Step 1: Initialize the Project (`/init-project`)

Run once per project. This bootstraps the full Ensemble runtime into your repository.

```
/init-project
```

### What Gets Created

```
.claude/
  agents/           13 specialist subagents, tailored to your stack
  commands/         Workflow slash commands
  hooks/            session-context, router, permitter, formatter, status,
                    async-discipline, autonomy-discipline, wiggum, notify, precompact
  skills/           Domain knowledge packs matched to your technology stack
  rules/
    constitution.md   Project guardrails and quality gates
    stack.md          Detected technology stack
    process.md        Workflow documentation
  settings.json     Hook wiring, permissions, directory paths

docs/
  PRD/              Product Requirements Documents
  TRD/              Technical Requirements Documents

.trd-state/         Implementation tracking (git-tracked)
```

### How It Works

1. **Repository analysis** -- scans your project for package.json, requirements.txt, Gemfile, Cargo.toml, etc. to detect your technology stack
2. **Interactive configuration** -- asks about project identity, development methodology (TDD, flexible, characterization), quality gates, and approval requirements
3. **Scaffolding** -- creates the directory structure and copies the runtime components
4. **Agent tailoring** -- deploys 13 subagents customized with your project context (stack, conventions, directory structure). Each agent gets instructions specific to your environment
5. **Skill selection** -- analyzes your stack definition and selects relevant skills from the library (e.g., a Python/FastAPI project gets `developing-with-python`, `pytest`; a React/TypeScript project gets `developing-with-typescript`, `jest`, `developing-with-react`)
6. **Hook installation** -- wires lifecycle hooks into `.claude/settings.json`
7. **Governance generation** -- creates `constitution.md` with your quality gates and `stack.md` with detected technologies
8. **CLAUDE.md update** -- populates your project's operating manual with architecture, conventions, and file structure

### Vendoring: Why Everything Lives in the Repo

The entire runtime is committed to git. This is deliberate:

- **Reproducibility** -- every developer and every Claude Code session (local CLI or web) gets identical behavior
- **Self-contained** -- no external plugin dependency at runtime
- **Customizable** -- you can edit agents, rules, and skills per-project without affecting other projects
- **Auditable** -- the full AI governance configuration is code-reviewable in your repo

### Greenfield Projects

For brand-new projects with no existing code, provide a baseline specification to help Ensemble tailor its setup:

```
/init-project

# When prompted, describe your project:
# "Python FastAPI backend with PostgreSQL, React frontend with TypeScript,
#  deployed to AWS via Terraform. TDD methodology, 80% unit coverage target."
```

The more context you provide upfront, the better the agents and skills will be tailored. You can also point to a reference codebase or API spec for additional grounding.

### After Init: Add Integrations

After initialization, configure any additional tooling your project needs:

- **MCP Servers** -- add to `.mcp.json` (e.g., Playwright for E2E testing, Context7 for documentation retrieval)
- **Custom skills** -- add project-specific domain knowledge to `.claude/skills/`
- **Custom agents** -- modify agent prompts in `.claude/agents/` to match your team's conventions

### Commit and Restart

```bash
git add .claude/ docs/ .trd-state/
git commit -m "Initialize Ensemble runtime"

# IMPORTANT: Restart Claude Code for it to pick up the new configuration
exit
claude
```

Claude Code loads configuration at session start. You must restart for the vendored runtime to take effect.

---

## Step 2: Create a PRD (`/create-prd` or `/create-prd-team`)

Define what you're building and why.

```
/create-prd <description of the feature or story>
```

The basic argument is your feature description -- a sentence, a paragraph, or a reference to an issue tracker ticket.

### Providing Context

The more context you provide, the better the PRD. Consider including:

- **Issue tracker references** -- if you have Jira or Linear integration, reference the ticket directly
- **Reference codebases** -- point to existing implementations to draw from: *"Similar to how the auth module works in ~/dev/other-project"*
- **API specs** -- reference existing OpenAPI specs to design against: *"Must integrate with the API documented at https://api.example.com/openapi.json"*
- **Constraints** -- call out non-obvious requirements: *"Must work offline, must support IE11, must handle 10k concurrent users"*

### Auto-Detection

The framework will auto-identify the current feature context if obvious (e.g., you're on a feature branch, there's already a `.trd-state/current.json` pointer). However, explicit context always helps, especially for the initial PRD.

### Team Variant

`/create-prd-team` spawns parallel specialists (product research, technical feasibility, devil's advocate) for richer multi-perspective analysis. The output structure is identical -- just broader input analysis. Use this for complex or ambiguous features where multiple viewpoints catch blind spots.

### Output

- `docs/PRD/<feature-name>.md` -- the PRD with user stories, acceptance criteria, edge cases, non-goals, risks, and Mermaid diagrams
- `.trd-state/current.json` -- updated to point to the new PRD

### Critical: Read It

AI review catches structural issues. Human review catches intent misunderstandings. **Read the PRD before proceeding.** A bad PRD produces a bad TRD, which produces bad code across three implementation passes. This is where your time investment has the highest leverage.

---

## Step 3: Refine the PRD (`/refine-prd`, optional)

Iterate on the PRD with stakeholder feedback.

```
/refine-prd <feedback or changes>
```

Or without arguments to trigger an interactive review interview that walks through requirements completeness.

The path to the PRD is auto-resolved from `.trd-state/current.json`. You can also specify explicitly: `/refine-prd docs/PRD/my-feature.md <feedback>`.

---

## Step 4: Create a TRD (`/create-trd` or `/create-trd-team`)

Transform the approved PRD into a technical plan.

```
/create-trd
```

The input is the PRD from the previous step (auto-resolved from `current.json`, or specified explicitly).

### Providing Context

As with PRDs, additional context sharpens the output:

- **Reference architecture** -- *"Follow the same layered architecture as ~/dev/reference-project/src"*
- **API contracts** -- *"Backend must implement the OpenAPI spec at docs/api/openapi.yaml"*
- **Existing patterns** -- *"Use the repository pattern established in src/repositories/"*
- **Constraints** -- *"Must use existing PostgreSQL instance, cannot add new dependencies without approval"*

### What It Produces

- **Architecture decisions** with rationale and alternatives considered
- **Master task list** with unique IDs (e.g., `AUTH-B001`, `AUTH-F002`), dependencies, and acceptance criteria
- **Execution plan** with phases, parallelizable work sessions, and a dependency-ordered Mermaid gantt chart
- **Quality requirements** including coverage targets and security requirements
- **Non-goals** imported from the PRD (agents will reject work in these areas)
- **Risk assessment** with technical mitigations

### Team Variant

`/create-trd-team` spawns parallel domain experts (backend architecture, frontend architecture, quality strategy, optionally infrastructure) who each propose tasks in their domain. The lead synthesizes these into a unified TRD. Use this for features spanning multiple domains where specialist perspectives improve the task breakdown.

### Output

- `docs/TRD/<feature-name>.md`
- `.trd-state/current.json` updated with TRD path

---

## Step 5: Review the TRD (`/review-trd`, optional)

Send the TRD to an independent LLM for a second opinion.

```
/review-trd
```

This uses an external review tool (Codex CLI or similar) to analyze the TRD against the PRD, the codebase, and general engineering best practices. The review is independent of the Claude session that created the TRD, providing a fresh perspective.

The review output identifies:
- Gaps between PRD requirements and TRD coverage
- Architectural concerns or anti-patterns
- Missing edge cases or error handling
- Task dependency issues
- Quality or security gaps

---

## Step 6: Refine the TRD (`/refine-trd`, optional)

Iterate on the TRD with technical feedback. If you ran `/review-trd`, feed its findings in here:

```
/refine-trd <paste review findings or provide your own feedback>
```

This is the last chance to course-correct the plan before implementation. The TRD is the flight plan -- everything downstream follows from it.

---

## Step 7: Implement (`/implement-trd-team`, Three Passes)

This is where the air traffic controller model comes to life. You launch implementation sessions with `--dangerously-skip-permissions` and let the agent team work autonomously through the TRD's task list. The recommended workflow runs three passes, each in a fresh session.

### Reinforcing Subagent Behavior

It's often helpful to reinforce the framework's patterns when launching implementation. Add guidance like:

```
/implement-trd-team

Use your subagents and skills. Follow the implement-verify-simplify-review
pattern for each task. Delegate to specialist agents based on task type.
```

This reminds the orchestrating agent to lean on the full staged execution loop rather than trying to do everything in the prime context.

### Pass 1: Build the Reference Implementation

```bash
claude --dangerously-skip-permissions
> /implement-trd-team
```

**Focus:** TDD-based implementation. Tests first, code second. Meet the TRD's acceptance criteria with passing tests. The goal is a working skeleton -- correctness over polish.

When complete:

```
/fold-prompt
exit
claude
```

### Pass 2: Harden Against the Reference

```bash
claude --dangerously-skip-permissions
> /implement-trd-team
```

**Focus:** Edge cases, error handling, robustness. The framework now has a reference implementation to harden against. This pass closes gaps, handles failure modes, and refines what Pass 1 built. The agents see the existing code and tests from Pass 1 and work to strengthen them.

When complete:

```
/fold-prompt
exit
```

### Optional: CI/Reviewer Pipeline

Between passes 2 and 3, run your CI/CD and code review pipeline. Let automated tools assess:

- Test coverage against your quality gate thresholds
- Lint and type-checking compliance
- Security scanning results
- Code quality metrics

Feed any findings back into the TRD or CLAUDE.md before launching Pass 3. This gives the final validation pass the best possible context.

### Pass 3: Validate Against the Original PRD

```bash
claude --dangerously-skip-permissions
> /implement-trd-team
```

**Focus:** Live testing against the original PRD's acceptance criteria and definition of done. This pass ensures the implementation actually delivers what was requested -- not just what was technically specified in the TRD, but what the product stakeholder intended in the PRD.

When complete:

```
/fold-prompt
exit
```

### Why Three Passes Work

Each pass operates against an increasingly complete codebase:

| Pass | Sees | Produces |
|------|------|----------|
| 1 | Empty project (or existing code) | Working skeleton with tests |
| 2 | Pass 1 code + tests | Hardened implementation |
| 3 | Pass 2 hardened code | Validated, production-proximate code |

This mirrors how experienced engineers naturally iterate, but at machine speed. A single pass rarely produces production-ready code -- just as a single draft rarely produces a publishable document.

---

## Step 8: Human Debug

After three passes, the code is substantially complete -- typically 85-95% of the way there. The remaining work is the kind of nuanced problem-solving that humans still do best:

- Edge cases that require domain knowledge the AI doesn't have
- Integration issues with external systems
- UX polish and subjective quality judgments
- Performance tuning based on real-world profiling
- Security hardening for your specific threat model

This is where you switch from air traffic controller back to pilot -- hands on the controls for the final approach and landing.

---

## Step 9: Final Fold (`/fold-prompt`)

After completing the feature, capture everything into CLAUDE.md:

```
/fold-prompt
```

This analyzes the session's work and updates CLAUDE.md with:
- New patterns and conventions discovered
- Architecture decisions made
- Debugging notes worth preserving
- Updated file structure references

These learnings persist across sessions and improve future runs of the framework on this project.

---

## Upgrading: Rebase the Project (`/rebase-project`)

When the Ensemble plugin is updated, upgrade your project's vendored runtime:

```
/rebase-project
```

This upgrades commands, hooks, and settings while preserving your customizations:

| Component | Behavior |
|-----------|----------|
| **Agents** | Preserved (your customizations kept, new agents added) |
| **Skills** | Recomputed based on current `stack.md` |
| **Commands** | Replaced (not customized per-project) |
| **Hooks** | Replaced (not customized per-project) |
| **Rules** | Always preserved (`constitution.md`, `stack.md`, `process.md` never modified) |
| **Settings** | Merged (new keys added, your overrides preserved) |

Backups are created before any destructive operation. Use `--dry-run` to preview changes first.

---

## Quick Reference

| Step | Command | Input | Output |
|------|---------|-------|--------|
| Setup | `/init-project` | Project description | Vendored runtime in `.claude/` |
| Requirements | `/create-prd` | Feature description, issue refs, API specs | `docs/PRD/<feature>.md` |
| Refine requirements | `/refine-prd` | Feedback | Updated PRD |
| Architecture | `/create-trd` | Approved PRD (auto-resolved) | `docs/TRD/<feature>.md` |
| Independent review | `/review-trd` | TRD (auto-resolved) | Review findings |
| Refine architecture | `/refine-trd` | Review findings or feedback | Updated TRD |
| Build (Pass 1) | `/implement-trd-team` | Approved TRD | Working code + tests |
| Harden (Pass 2) | `/implement-trd-team` or `/harden-trd-team` | Pass 1 code | Hardened implementation |
| Validate (Pass 3) | `/implement-trd-team` or `/verify-trd-team` | Pass 2 code | Validated implementation |
| Human finish | Manual debugging | Pass 3 code | Production-ready code |
| Capture learnings | `/fold-prompt` | Session context | Updated CLAUDE.md |
| Upgrade runtime | `/rebase-project` | New plugin version | Updated vendored runtime |

**Issue triage (outside the main feature loop):**

| Step | Command | Input | Output |
|------|---------|-------|--------|
| Triage | `/investigate-issue` | Issue report | Reproduction + classification → issue TRD or PRD spec |
| Fix | `/fix-issue` | Triaged issue TRD | Implement + verify + review in one compressed pass |
