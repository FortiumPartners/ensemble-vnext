# Ensemble for Claude Code

Ensemble is a Claude Code plugin that turns "ask the AI and edit what comes back" into a
repeatable engineering process. You write down what to build, specialist agents build it, and
the result is proven against the running software, not just claimed.

> **Code decides the shape of the work. Language fills it in. You decide what matters and
> anything that leaves the building.**
>
> Scripts own the order of work, the loop limits and when to stop. The model owns the
> judgement: planning, writing code, weighing evidence. You own product intent, approvals,
> the project's rules, and anything outward-facing: push, merge, deploy.

---

## What it answers

AI coding agents are capable but not reliable, and the ways they fail are predictable. Each
has an answer built into the framework ([CONCEPTS.md](CONCEPTS.md) takes each in turn).

| What goes wrong | What Ensemble does |
|---|---|
| Work reported as done that isn't, in the same confident voice as work that is | A feature is done only when its criteria are proven with evidence captured from the running software |
| Requirements nobody asked for | Every requirement must trace to a source: your words, a document, a measurement. Audits remove what traces to nothing |
| Long sessions forget and degrade | Each task goes to a fresh specialist agent (a subagent) given only what that task needs; plans and progress live on disk, so a run can resume |
| Nothing learned between sessions | Findings, notes and test examples accumulate in the repo; the rules change only with you |
| Chat-and-edit drifts into code nobody planned | Work flows through written plans, sized to the risk: a product requirements document (PRD) and a technical plan with tasks (TRD) for a feature, a light plan for a small fix |

## How the work flows

```
new feature            /create-prd → /audit-prd → /create-trd → /audit-trd → /implement-trd → /audit-build → PR
  with screens         ... /create-prd → /create-design → /audit-design → /create-trd --design → ... → PR → /sync-design
a bug or small change  /plan   (writes a plan sized to the risk; --implement builds it)
a list of small fixes  /sweep
one change to the feature you're building   /amend
findings or a report, not code              /task
verification fell short                     /refine-verification → /verify-build
finished work to push, merge, release       /ship-build   (steps listed in .claude/rules/ship.md)
```

`/implement-trd` builds in phases, reviews the whole branch once, and then verifies the running
software against criteria written from the PRD. That verification runs by default.
`/audit-build` then checks the delivered code against the TRD and PRD; a passing audit closes
the feature and, if you allow it, opens the pull request. You merge, unless you have set up
`/ship-build`, which can run the steps your `ship.md` lists; an outward step (merge, release)
also needs your authorization in `autonomy.md` ([ship-build.md](ship-build.md)). The full map,
with a diagram for every command, is in [PROCESS.md](PROCESS.md).

## Quick start

You need the Claude Code CLI, git, Node.js 18+ and Python 3.

**1. Install the plugin** (once per machine), then restart Claude Code:

```bash
claude plugin marketplace add FortiumPartners/ensemble-vnext
claude plugin install full@ensemble-vnext
```

**2. Set up a project.** From its root, in Claude Code:

```
/init-project
```

This detects your stack, asks a few questions, writes your rules to `.claude/rules/`, and
copies the runtime (commands, agents, hooks, skills) into `.claude/`. Commit it.

**3. Tell verification how to reach your app.** Run the `/verification-setup` skill. It
interviews you and writes `.claude/rules/verification.md`: which environments exist, what the
checks may touch, where test credentials live (never their values). If you will draw designs
before building, also run `/design-setup`, which writes `.claude/rules/design.md`. To have
`/ship-build` push and merge for you, run the `/ship-setup` skill, which writes
`.claude/rules/ship.md`.

**4. Build something.**

```
/create-prd "Users can reset their password by email"
/audit-prd
/create-trd
/audit-trd
/implement-trd docs/TRD/<feature>.md
/audit-build
```

Each command picks up the file the previous one wrote, except `/implement-trd`: give it the
TRD path that `/create-trd` prints, unless your branch is named `feature/<feature>/<session>`.

Each command ends with a short readout (what exists now, what it decided, what needs you, and
the next command) and a `COMMAND COMPLETE` or `COMMAND STUCK` line. Commands run from start to
finish without asking you to confirm each step.

For a bug, start with `/plan <what's wrong>` instead.

On one page: every command, its flags, the verification outcomes and the files that matter are
in the [quick reference](QUICK-REFERENCE.md).

## The documents

**Guides**: read these first.

| Guide | For |
|---|---|
| [QUICK-REFERENCE.md](QUICK-REFERENCE.md) | One page: every command and flag, the verification outcomes, the settings and the files that matter |
| [INSTALL.md](INSTALL.md) | Installing, setting a project up (including verification and design setup), what gets committed, settings, and keeping it current with `/rebase-project` |
| [ship-build.md](ship-build.md) | Shipping: `/ship-build`, `ship.md`, the 13 primitives, the outward-authorization gate, resuming a parked run |
| [PROCESS.md](PROCESS.md) | Using the commands: which path to take, what each command does, the design stage, verification, and where state lives |
| [CONCEPTS.md](CONCEPTS.md) | Why it works this way: the problems, and the twelve ideas that answer them |
| [ARCHITECTURE.md](ARCHITECTURE.md) | What a project's `.claude/` holds and how the parts fit: plugin and runtime, refresh and rebase, agents, commands, workflows, hooks, skills, rule files, settings |
| [stop-hook-notification.md](stop-hook-notification.md) | Running your own command (a webhook, a tmux ping, a signal file) whenever a session goes idle |

**Reference**: look things up here. Every command step in order, which agent does it, and the
file and section it comes from.

| Page | Covers |
|---|---|
| [reference/README.md](../reference/README.md) | Index, and every command at a glance |
| [reference/implement-trd.md](../reference/implement-trd.md) | Everything `/implement-trd` does, flag by flag |
| [reference/authoring.md](../reference/authoring.md) | Creating, refining and auditing PRDs and TRDs |
| [reference/verification.md](../reference/verification.md) | The verification loop, its outcomes, the check skills, and recovery |
| [reference/other-commands.md](../reference/other-commands.md) | `/plan`, `/sweep`, `/amend`, `/task`, `/audit-build`, `/close-feature`, maintenance |
| [reference/design.md](../reference/design.md) | The design stage: the five design commands, board statuses, `design.md`, the design libraries |
| [reference/hooks.md](../reference/hooks.md) | Every hook: when it fires, what it reads and writes |
| [reference/agents.md](../reference/agents.md) | The 13 subagents and where each is used |

What changed in each release is in [CHANGELOG.md](../../CHANGELOG.md). This guide set
describes 4.17.3.

## License

Ensemble is developed and maintained by **Fortium Partners**.
