# Ensemble Concepts

Why Ensemble is shaped the way it is. This guide explains the problems and the ideas; it
does not teach command syntax. For that, read [PROCESS.md](PROCESS.md) (how to use the
commands) and [INSTALL.md](INSTALL.md) (how to set a project up).

> **The principle underneath everything**
>
> **Code decides the shape of the work. Language fills it in. You decide what matters and
> anything that leaves the building.**
>
> - **Code** owns control flow: counting, ordering, how many times a loop may run, and when
>   it stops.
> - **The model** owns the work that needs judgement: planning, implementing, weighing
>   evidence, deciding what is in scope.
> - **You** own product intent, approvals, changes to the project's rules, and anything
>   outward-facing: push, merge, deploy.

---

## Part 1 — What goes wrong when you build with AI

If you are new to AI-assisted development, these five problems are the reason the rest of
this guide exists. Every concept in Part 3 answers one or more of them.

| # | Problem | What it looks like |
|---|---|---|
| 1 | **Capable, not reliable** | It reports work done that wasn't, cites code that doesn't exist, and writes tests that check nothing — all in the same confident voice as its correct work. |
| 2 | **It invents** | It adds plausible requirements nobody asked for: a latency target, a retry policy, a coverage number. |
| 3 | **It forgets, and long sessions degrade** | Its working memory (the *context*) is finite. Early detail blurs, and when the conversation is summarized to make room, things drop out. |
| 4 | **It doesn't learn unless you make it** | Each session starts close to blank. Yesterday's hard-won lesson is gone unless it was written somewhere. |
| 5 | **Chat-and-edit drifts** | Asking for changes one message at a time is fine for small things. For large ones it produces code nobody planned and nobody can trace back to a reason. |

---

## Part 2 — Claude Code building blocks

Ensemble is built from parts Claude Code already provides. You don't need to master them, but
the names come up.

| Term | What it is |
|---|---|
| **Session** | One conversation with Claude Code, with its own context. ([How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)) |
| **Slash command** | A saved prompt you run by name, such as `/plan`. ([Skills and slash commands](https://code.claude.com/docs/en/skills)) |
| **Subagent** | A fresh Claude instance with a clean context, given one job. It returns only its result, not its working. ([Subagents](https://code.claude.com/docs/en/sub-agents)) |
| **Skill** | A packaged set of instructions the model loads when a task calls for it. ([Skills](https://code.claude.com/docs/en/skills)) |
| **Hook** | Code, or a short model check, that Claude Code runs automatically at set moments: when you submit a prompt, when a subagent finishes, when a turn ends. ([Hooks](https://code.claude.com/docs/en/hooks)) |
| **Workflow** | A script that runs agents in a fixed order: in parallel waves, in loops, fanned out and gathered back. ([Workflows](https://code.claude.com/docs/en/workflows)) |
| **Memory and `CLAUDE.md`** | What carries over from one session to the next. ([Memory](https://code.claude.com/docs/en/memory)) |
| **Plugin** | A package of all of the above that you install once. ([Plugins](https://code.claude.com/docs/en/plugins)) |

Ensemble is a plugin built from these parts.

---

## Part 3 — Ensemble's concepts

Eleven ideas in four stages: **PLAN → EXECUTE → PROVE → SUSTAIN.**

## PLAN

### 1. Write it down before you build it

**Answers:** forgetting (3), drift (5).

**The rule.** Work starts as a document, not a chat. A **PRD** (Product Requirements
Document) says what to build and why. A **TRD** (Technical Requirements Document) says how,
broken into tasks. Agents work from those files, and you review the files rather than a
scrolling conversation.

Progress is written to disk too, in `.trd-state/`: which tasks are done, what verification
found, what was published. Because the state is a file and not a memory, a run can resume
after an interruption, be re-checked against the code, or be handed to someone else.

**Where you'll meet it:** `docs/PRD/`, `docs/TRD/`, `.trd-state/`
([PROCESS.md §2](PROCESS.md#2-the-core-flow), [§7](PROCESS.md#7-where-state-lives)).

### 2. Match the process to the risk

**Answers:** drift (5), without making a one-line fix pay for a full feature's paperwork.

**The rule.** The question is *whose plan the work belongs to*, not how big it is.

| The work is… | Path |
|---|---|
| A new feature, or anything where the right behaviour is still a product decision | The full pipeline: PRD, then TRD, then build, then audit |
| A defect, a small change, or a refactor | `/plan`, which investigates and writes a plan sized to the work |
| A list of small, unrelated fixes | `/sweep`, which fixes them in parallel with no plan document |
| One change to the feature you're already building | `/amend`, which adds it to that feature's existing TRD |

**Example.** A change to the feature in flight looks small enough for `/plan`. But `/plan`
would write a second TRD for work the first one already understands, and the session loses
track of which plan it is following. So it goes through `/amend` instead.

**Where you'll meet it:** [PROCESS.md §1](PROCESS.md#1-choosing-a-path).

### 3. Everything traces to a source; plans are checked against the real code

**Answers:** invention (2), unreliability (1).

**The rule.** The model may invent *how* to build something. It may never invent *how well*:
every threshold, acceptance criterion and quality target must trace to the PRD, your project
rules, a measurement, or your own instruction. And every task in a TRD names the existing
code it reuses or replaces. Ensemble calls that step **grounding**: checking the plan against
what is actually in the repository.

The audits check both. `/audit-prd` and `/audit-trd` look for requirements that trace to
nothing, and for plans that describe code that isn't there. Documents say what someone
intended; the code shows what exists. When they disagree, the code wins and the
disagreement is recorded.

**Example.** A TRD says "responses under 200ms". If nothing in the PRD, the project rules or a
measurement says so, the refine and audit steps remove it or ask about it rather than letting
it quietly become a target.

**Where you'll meet it:** `/create-trd`, `/audit-prd`, `/audit-trd`, `/refine-prd`,
`/refine-trd` ([PROCESS.md §2](PROCESS.md#2-the-core-flow)).

## EXECUTE

### 4. You direct; specialists with fresh context do the work

**Answers:** long sessions degrading (3), unreliability (1).

**The rule.** Each task goes to a subagent that starts clean, with only a brief: the task, the
grounding for it, and the decisions it must respect. It returns a result, not a transcript.
Your main session (the *orchestrator*) keeps only the plan, so its context stays small.

Fresh context is also **independence**: the thing that checks the work never wrote it. The
success criteria verification uses are written from the PRD by an agent that never sees the
plan or the code, and the audits and final code review read work they had no hand in.

**The trade-off.** A subagent's reasoning does not come back, only its conclusion. A wrong
conclusion three layers down arrives looking confident, so agents dispatching agents is kept
shallow.

**Where you'll meet it:** `/implement-trd` sends each task to a specialist (frontend,
backend, mobile, or AI/agent work); the 13 agents live in `.claude/agents/`.

### 5. Workflows: a fixed skeleton, language at each step

**Answers:** unreliability (1), drift (5).

**The rule.** This is the principle at work: the order of the work is code, not a conversation. A TRD's tasks and their
dependencies become a graph, and the graph becomes **waves**: groups of tasks that can run in
parallel. Two tasks that touch the same file never run at the same time. Loops have a cap on
how many times they may run, and whether a loop stops is decided by code, not by the model
saying it is done.

At each step an agent does its work in natural language, then returns a result in a fixed
shape that code can check. A task that returns nothing, or a malformed result, is recorded as
a failure rather than passed over.

**Example.** The verification loop runs at most three rounds by default. After each round, a
plain function counts the open gaps and decides: stop as satisfied, stop because something
was never built, stop because a fix pass closed nothing, stop at the cap, or go again.

**Why it matters:** the same TRD produces the same waves every time, a run can resume from its
last checkpoint, and its timings can be measured.

**Where you'll meet it:** `/implement-trd`, `/verify-build`, the audits; the scripts are in
`.claude/workflows/`.

### 6. One command, one authorization, one result

**Answers:** drift (5), and the cost of babysitting a run.

**The rule.** Running a command means "take this all the way through". It doesn't stop to ask
about things it can decide for itself; it stops early only when it is genuinely stuck. It also
doesn't start the *next* command: `/create-trd` writes a TRD and ends, and its last line names
`/implement-trd` for you to run when you're ready. Naming the next step is a report, not a
request. Anything that leaves the building — a push, a merge, a deploy — comes back to you.

You always know where a run stands from its **banners** (`DISPATCHED`, `RESUMED`,
`COMMAND COMPLETE`, `COMMAND STUCK`) and a four-part **readout** at the end: what exists now,
what was decided for you, what's wrong and who acts, and the next command.

**Where you'll meet it:** every command
([PROCESS.md §6](PROCESS.md#6-what-youll-see-while-a-command-runs)); the rules are in
`.claude/rules/autonomy.md` and `command-status.md`.

### 7. Findings are recorded, not absorbed

**Answers:** drift (5), invention (2).

**The rule.** When an agent finds a problem outside its task, it writes it down; it does not
quietly fix it. Findings go into a ledger (`discovered.jsonl`). From there they come back to
you in the readout, or, if they block the feature, become TRD tasks the next time you run
`/implement-trd --reconcile` (which re-checks delivered work against the TRD). The plan that was approved is the plan that gets built.

**Example.** An implementer building a login form notices the password-reset email is broken.
It records the finding and finishes the login form. The reset bug reaches you as a line in the
readout, not as an unreviewed change buried in the login commit.

**Where you'll meet it:** the readout's ISSUES section, `.trd-state/<feature>/discovered.jsonl`,
`--reconcile` ([PROCESS.md §2](PROCESS.md#2-the-core-flow)).

## PROVE

### 8. "Done" means proven, not claimed

**Answers:** unreliability (1) most directly.

**The rule.** A feature is done when the running software is shown to do what the PRD asked,
not when an agent says so. Success criteria come from the PRD, and each one needs captured
evidence from exercising the software.

Results are honest. Each criterion comes out **met**, **not met**, **not verifiable here**, or
**not built**, and "could not check" is never counted as a pass. A run that ends *satisfied*
still says how many criteria were never exercised. Design comparisons, user-journey walks and
data checks, when the TRD selects them, are criteria like any other.

When verification can't get there, the path is: the report's **diagnosis** of why, then a
short conversation with you that turns it into a plan, then an unattended fix run that carries
it out. Deciding a feature is finished is a judgement on the evidence, including evidence you
bring yourself; a command for closing features is coming.

**Example** (a real run on this repository). A build reports *satisfied*, 6 of 32 criteria unchecked. That is not "fully
proven", and the report says so. The usual fix is to tell the loop how to reach an environment
it couldn't, not to write more code.

**Where you'll meet it:** the end of `/implement-trd`, `/verify-build`,
`.claude/rules/verification.md` ([PROCESS.md §3](PROCESS.md#3-verification),
[INSTALL.md §5](INSTALL.md#5-set-up-verification)).

## SUSTAIN

### 9. Hooks reinforce and guard the process

**Answers:** forgetting (3), unreliability (1).

**The rule.** A prompt can only ask the model to do something. A hook runs every time. So the
parts of the process that must not be skipped are hooks: code again owning what must happen,
the model judging only where judgement is needed.

| Job | What happens |
|---|---|
| **Remind** | Every ordinary prompt you type gets a short orientation (a slash command carries its own instructions, so it is skipped): which path fits the work, to look for a relevant skill, and to check the project's rules. Every session opens with a brief on the feature in flight. |
| **Remember** | Every subagent dispatched is recorded in a ledger. Before the conversation is summarized to free up context, the current decision trail is saved to a session log. Task progress advances on disk as agents finish. |
| **Guard** | When a turn ends, a model check reads the final message for a promise nothing will keep ("I'll let you know when it's done" with nothing running) and, while a command is running, for a needless "shall I continue?" pause. It sends the turn back once. |

Most hooks are plain scripts with tests. The one model-judged check is measured against
labelled stops from real sessions before any change to it ships.

**Where you'll meet it:** mostly you won't; that's the point. The guard shows up as
`Stop hook error:` in the CLI, which is a display quirk, not a fault
([PROCESS.md §6](PROCESS.md#6-what-youll-see-while-a-command-runs)).

### 10. Learning flows in fast; rules change slowly, and only with you

**Answers:** not learning (4), invention (2).

**The rule.** What a project learns lives in three layers, each with a different speed and a
different owner.

| Layer | Holds | Changes |
|---|---|---|
| **The corpus** | PRDs, TRDs and investigations kept up to date with what was built; ledgers of findings; verification notes; measured test sets | Every run adds to it. New plans cite it as their source, so decisions are inherited instead of re-invented |
| **Memory and `CLAUDE.md`** | Lessons, conventions, gotchas | Fast. `/update-project` adds, `/cleanup-project` prunes. Advisory: a remembered fact is checked against the code before anything depends on it |
| **Governance** | `constitution.md`, `stack.md`, `verification.md` | Slowly. The system may propose a change; only you ratify it |

**Example.** `/update-project` writes what a session learned into `CLAUDE.md` without asking,
but a proposed change to `constitution.md` waits for your approval.

**Where you'll meet it:** [PROCESS.md §5](PROCESS.md#5-maintenance).

### 11. You own the rules; the framework owns the machinery

**Answers:** drift (5), at the level of the framework itself.

**The rule.** Ensemble's runtime (its commands, agents, hooks and workflows) is copied into
your repository's `.claude/` directory and committed. That makes it reproducible (a web
session and a local one behave the same), reviewable (every framework change is a diff), and
stable (it changes only when the plugin does, through `/rebase-project` or a session-start
refresh that leaves the changes uncommitted for you to review). Your governance files are
never overwritten by an upgrade.

**Where you'll meet it:** [INSTALL.md §6](INSTALL.md#6-who-owns-what) and
[§7](INSTALL.md#7-keeping-current).
