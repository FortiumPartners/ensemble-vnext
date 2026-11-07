# Ensemble vNext

Ensemble is a workflow framework for Claude Code, shipped as a plugin. It turns the way an
experienced user drives Claude Code (write the requirements, plan, build in phases, verify
against the requirements, review) into slash commands that run from one invocation to one
result, with state kept on disk so work can resume.

Version **4.16.1** (2026-11-06): 27 commands, 13 subagents. What changed in each release is in
[CHANGELOG.md](CHANGELOG.md).

## How it is built

| Layer | What it is |
|---|---|
| Plugin | Installed once per machine. Carries the templates, commands, agents, hooks and skill library |
| Project runtime | `/init-project` copies the runtime into the project's `.claude/` directory, and you commit it. `/rebase-project` refreshes it when you choose |

Commands orchestrate; the 13 subagents (product manager, technical architect, the
implementers, verifier, reviewer, debugger and others) do the specialised work. Commands,
agents and skills are prompts (Markdown); the deterministic parts are scripts and are
unit-tested.

## Install

```bash
claude plugin marketplace add FortiumPartners/ensemble-vnext
claude plugin install full@ensemble-vnext
```

Then, from a project's root in Claude Code, run `/init-project`. Prerequisites, what gets
committed and keeping a project current are in [docs/guides/INSTALL.md](docs/guides/INSTALL.md).

## Commands at a glance

| Group | Commands |
|---|---|
| Full pipeline (new feature) | `/create-prd` → `/audit-prd` → `/create-trd` → `/audit-trd` → `/implement-trd` → `/audit-build`; `/close-feature` closes a feature on your say-so |
| Shorter paths | `/plan` (defect, small change, refactor), `/amend` (one change to the feature in flight), `/sweep` (a list of small unrelated issues), `/task` (a job whose output is findings, not code) |
| Verification | `/verify-build` (re-check the build against the PRD, fixing by default), `/refine-verification` (agree a recovery plan after a run falls short) |
| Design stage | `/create-design`, `/refine-design`, `/audit-design`, `/design-system`, `/sync-design`: draw screens as boards on the Claude canvas, check them, build from approved boards, keep them in step with what shipped |
| Refinement | `/refine-prd`, `/refine-trd`, `/augment-trd-figma` |
| Maintenance | `/init-project`, `/rebase-project`, `/update-project`, `/cleanup-project`, `/audit-docs`, `/fold-prompt` |

Two owner-run setup skills fill the rules files the commands read: `verification-setup`
writes `.claude/rules/verification.md` (which environments verification may reach) and
`design-setup` writes `.claude/rules/design.md` (how the product is designed and how to reach
a screen).

Every command ends with a short readout (what exists, what it decided, what needs you, what to
run next) and a `COMMAND COMPLETE` or `COMMAND STUCK` line.

## Documentation

| Page | For |
|---|---|
| [docs/guides/README.md](docs/guides/README.md) | Start here: quick start and the guides |
| [docs/guides/QUICK-REFERENCE.md](docs/guides/QUICK-REFERENCE.md) | Which command to reach for, common flags, where files live, outcomes |
| [docs/reference/README.md](docs/reference/README.md) | Every command step by step, which agent does it, and where it is defined |
| [CHANGELOG.md](CHANGELOG.md) | Release history and what is not yet proven |

## Repository layout

| Path | Holds |
|---|---|
| `packages/core/` | Commands, agents, hooks, libraries, workflows, contracts, templates and scripts |
| `packages/full/` | The distributed plugin |
| `packages/router/` | The prompt-routing hook (Python) |
| `packages/skills/` | The skill library ([README](packages/skills/README.md)) |
| `test/` | Integration tests (BATS) and the eval framework |
| `docs/PRD/`, `docs/TRD/` | This project's own requirements documents |

Tests: Jest for JavaScript, pytest for the router, BATS for shell. Run `npm test` from the
repository root for the Jest suite.

## License

Developed and maintained by Fortium Partners.
