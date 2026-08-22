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
/implement-trd       -->  Build, phase by phase (TDD, meet acceptance criteria);
                          each phase gate runs an adversarial hardening pass and,
                          for [LIVE] tasks, live verification; the last phase adds
                          one more feature-scale hardening pass before the run ends
/fold-prompt + exit  -->  (optional, between phases on a long run) capture learnings
/audit-build         -->  Verify + validate delivered code against the TRD/PRD,
                          with traceability (implementation AND test per requirement)
       |
       v
Human debug          -->  Developer finishes remaining ~5-15%, guided by /audit-build's report
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
  hooks/            session-context, runtime-refresh, router, formatter, status,
                    notify-complete, precompact
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

## Step 2: Create a PRD (`/create-prd`)

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

### Verification wave

`/create-prd` authors the PRD in a single fresh `product-manager` subagent, then fans out
**verifiers** — source-fidelity, grounding, conformance — in parallel. The distinction is
deliberate: independent agents outperform a single one when *challenging* work, and
manufacture requirements when *generating* it. The retired `/create-prd-team` had this
backwards, fanning out generation and briefing each specialist additively.

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

## Step 4: Create a TRD (`/create-trd`)

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

### Grounding and verification

`/create-trd` authors in one fresh `technical-architect` subagent, runs a sequential
`grounding` pass that reconciles the plan against the existing codebase (reuse, what
becomes unreachable, per-task context), then fans out **verifiers** in parallel —
objective provenance and severity, buildability and consistency, task derivation,
omission against the PRD, and citation checks.

Fan-out is for verification only. The retired `/create-trd-team` fanned out *domain
experts asked what else to add*, which is generation-by-committee applied to the artifact
where manufactured requirements were already worst.

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

## Step 7: Implement (`/implement-trd`)

This is where the air traffic controller model comes to life. You launch one implementation
session with `--dangerously-skip-permissions` and let the agents work autonomously through
the TRD's task list, phase by phase.

> **Note on history:** through 4.1.15 this step ran as three separate commands and sessions
> — `/implement-trd`, then `/harden-trd-team`, then `/verify-trd-team`, each a fresh pass
> over an increasingly complete codebase. Both team commands were removed in 4.1.16; their
> jobs (adversarial hardening, live verification) did not go away, they moved *inside*
> `/implement-trd`'s own loop, because the command already knows exactly when a phase is
> done and is the natural place to trigger both. There is no replacement command for either
> — that was a deliberate decision (D15 in `docs/TRD/implement-trd-rework.md`).

### Reinforcing Subagent Behavior

It's often helpful to reinforce the framework's patterns when launching implementation. Add guidance like:

```
/implement-trd

Use your subagents and skills. Follow the implement-verify-simplify-review
pattern for each task. Delegate to specialist agents based on task type.
```

This reminds the orchestrating agent to lean on the full staged execution loop rather than trying to do everything in the prime context.

### Run the implementation

```bash
claude --dangerously-skip-permissions
> /implement-trd
```

**Per phase:** TDD-based implementation of that phase's tasks — tests first, code second,
meeting the TRD's acceptance criteria. At the phase gate, `implement-phase.js` runs
`verify-app`, `code-simplifier`, a phase-scoped `code-review`, and a `parallel()` adversarial
hardening fan-out over the phase's tasks (closing gaps, edge cases, and regressions —
the job `/harden-trd-team` used to do as a separate pass). Any task marked `[LIVE]`, or any
TRD whose `verification_level` is `live-required`/`e2e-required`, is verified against a
running instance rather than mocks (the job `/verify-trd-team` used to do as a separate
pass).

**After the last phase:** the hardening agent runs once more at feature scale — catching
interaction risk between phases that no single phase's gate could see — before the
end-of-run review.

For a long-running implementation, fold between phases if context is filling up:

```
/fold-prompt
exit
claude
> /implement-trd --resume
```

### Optional: CI/Reviewer Pipeline

You can still run your own CI/CD and code review pipeline on top of what `/implement-trd`
produces. Let automated tools assess:

- Test coverage against your quality gate thresholds
- Lint and type-checking compliance
- Security scanning results
- Code quality metrics

Feed any findings back into the TRD or CLAUDE.md before running `/audit-build`.

### After the run: `/audit-build`

```bash
> /audit-build
```

**Focus:** verification (does the code match the TRD's tasks?), validation (does it match
the PRD's requirements?), and traceability (does every requirement have both an
implementation AND a test proving it — a requirement with code and no test is a gap, not a
pass). This is the check that confirms the implementation delivers what the PRD's
stakeholder actually intended, not just what the TRD technically specified.

When complete:

```
/fold-prompt
exit
```

---

## Step 8: Human Debug

After `/implement-trd` and `/audit-build`, the code is substantially complete -- typically
85-95% of the way there. The remaining work is the kind of nuanced problem-solving that
humans still do best, guided by what `/audit-build` surfaced:

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
| Build (phase loop) | `/implement-trd` | Approved TRD | Working, hardened, live-verified code + tests |
| Post-build audit | `/audit-build` | Implemented code, TRD, PRD | Verification/validation/traceability report |
| Human finish | Manual debugging | Audit report | Production-ready code |
| Capture learnings | `/fold-prompt` | Session context | Updated CLAUDE.md |
| Upgrade runtime | `/rebase-project` | New plugin version | Updated vendored runtime |

**Issue triage (outside the main feature loop):**

| Step | Command | Input | Output |
|------|---------|-------|--------|
| Triage | `/investigate-issue` | Issue report | Reproduction + classification → issue TRD or PRD spec |
| Fix | `/fix-issue` | Triaged issue TRD | Implement + verify + review in one compressed pass |
