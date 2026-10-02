# Ensemble reference

The guides in [`docs/guides/`](../guides/) tell you **what to run and why**:
[INSTALL](../guides/INSTALL.md) sets a project up, [PROCESS](../guides/PROCESS.md) says which
path to take, [CONCEPTS](../guides/CONCEPTS.md) explains the ideas. This reference says **what
happens when you run it**: every step in order, who performs it, and what it reads and writes.
Each step names the file and section it lives in, so you can check any claim in the source in
under a minute. Where these pages and the source disagree, the source is right and the page
is a bug.

| Page | Covers |
|---|---|
| this page | where each path's steps live, every command at a glance, the steps every command shares |
| [authoring.md](authoring.md) | `/create-prd`, `/audit-prd`, `/refine-prd`, `/create-trd`, `/audit-trd`, `/refine-trd`, `/augment-trd-figma` |
| [implement-trd.md](implement-trd.md) | `/implement-trd`, step by step |
| [verification.md](verification.md) | the functional-verification loop, `/verify-build` (fixes by default; `--no-fix` for report-only), `/refine-verification`, the check and support skills |
| [other-commands.md](other-commands.md) | `/plan`, `/sweep`, `/amend`, `/audit-build`, `/close-feature`, and the maintenance commands |
| [hooks.md](hooks.md) | every hook: when it fires, what it reads, what it can block |
| [agents.md](agents.md) | the 13 subagents, who dispatches each, and how dispatch works |

## Who decides each step

Every step in these pages is one of three kinds. This is the framework's core split: code
decides the shape of the work, a model fills it in, you decide what matters.

| Mark | Kind | Meaning |
|---|---|---|
| **code** | deterministic | a workflow script (`packages/core/workflows/*.js`), a lib (`packages/core/lib/*.js`) or a hook script decides it. Same input, same result; unit-tested. |
| **model** | judgement | the lead session reading a command's prose, or a subagent, decides it. |
| **you** | owner | nothing happens until you act: invoking a command, answering a question, merging, approving a governance change. |

The pictures of the process live in the guides: the overall flow and one diagram per command
in [PROCESS](../guides/PROCESS.md) (start at §1, "Choosing a path"), and how a single command
runs in [CONCEPTS](../guides/CONCEPTS.md). The tables below are the step-by-step detail
behind them, with the source location of every step.


---

## The paths, step by step

The diagrams for these paths are in [PROCESS](../guides/PROCESS.md) §1 onward. This section
says where each step lives.

### The full pipeline, for a new feature

| # | Step | Kind | Where it lives |
|---|---|---|---|
| 1 | You invoke `/create-prd` with a story, an issue or a document. It writes `docs/PRD/<feature>.md` and points `.trd-state/current.json` at it. | you, then code + model | `create-prd.md` "Workflow: source, author, verify"; `workflows/create-prd.js` |
| 2 | `/audit-prd` checks the PRD against its source, the existing design documents and the code, applies what survives checking, and rewrites the PRD's `## Could Not Verify`. | you, then code + model | `audit-prd.md`; `workflows/audit-prd.js` |
| 3 | `/refine-prd` (optional) answers the PRD's open questions — with you by default, by subagents with `--auto` — and strikes requirements that trace to nothing. | you; model with `--auto` | `refine-prd.md` "Modes", "Phase 1: Challenge pass" |
| 4 | `/create-trd` turns the PRD into a TRD with a task list, then checks every task against the code that already exists ("grounding"). | you, then code + model | `create-trd.md`; `workflows/create-trd.js` |
| 5 | `/audit-trd`, `/refine-trd` and `/augment-trd-figma` (optional) are the TRD's equivalents of steps 2–3, plus a Figma extraction for UI work. | you | `audit-trd.md`, `refine-trd.md`, `augment-trd-figma.md` |
| 6 | `/implement-trd` builds the TRD phase by phase, reviews the whole branch once, then runs functional verification (on by default). | you, then code + model | `implement-trd.md`; see [implement-trd.md](implement-trd.md) |
| 7 | `/verify-build` builds and re-verifies in rounds by default, once a plan exists; `--no-fix` re-runs verification alone. If it falls short, `/refine-verification [--auto]` agrees the plan the next round runs. | you | `verify-build.md`; see [verification.md](verification.md) |
| 8 | `/audit-build` checks delivered code against TRD and PRD. A task the TRD has but nobody built is set back to pending and `/implement-trd --reconcile` runs automatically; a requirement with no task stops for you, because deciding how to cover it is design. `--report-only` suppresses the chain. It re-audits only after a true product defect, at most twice; with no defect open it closes the feature (test gaps are fixed first, never re-audited): writes `.trd-state/<feature>/closed.json`, clears `current.json`, and commits the record with its report. | you, then code + model | `audit-build.md` "But it DOES close the loop", "Close the feature when the audit passes" |
| 9 | A closing audit opens the PR when `ensemble.openPullRequest` is `auto`; you merge it. Merging and releasing are never done by a command. | you | `.claude/rules/autonomy.md` "The authorization is scoped to ONE command" |
| 10 | `/close-feature` is the other way to close: you say the feature is closed, with an optional note. Same bookkeeping as the audit's close; no judgement. | you, then code | `close-feature.md` "The close step" |

### The shorter paths

`/plan` sizes work below the PRD threshold on two axes — **kind** (defect, change or
refactor) and **weight** (trivial, small or medium) — and writes a TRD to match. `/amend`
adds one change to the feature already in flight. `/sweep` fixes a list of small unrelated
issues with no TRD at all. The `/plan` steps, in order:

| # | Step | Kind | Where it lives |
|---|---|---|---|
| 1 | Investigate by kind: reproduce a defect, locate a change, measure a refactor's test coverage; then ground the fix in the files it touches. | model | `plan.md` "Step 2: Investigate" |
| 2 | The exit test. The model writes one sentence answering "would a PRD have content the TRD would not?"; `route()` turns that single boolean into `'prd'` or `'plan'` and reads nothing else. | model, then code | `plan.md` "Step 3"; `lib/plan-weight.js` `route()` |
| 3 | Route `'prd'`: write the investigation record, then start the create-prd **workflow** directly (not the command, whose frontmatter blocks model invocation). That run's banner ends it. | code | `plan.md` "Route: 'prd'"; `lib/fix-plan.js` `plan()` |
| 4 | Decide the weight. `stages()` returns the stage list: trivial = investigate, author, implement; small adds the adversarial review; medium adds grounding and an audit and writes a phased TRD. | model, then code | `plan.md` "Step 4"; `lib/plan-weight.js` `stages()` |
| 5 | Adversarial review (small, medium): one `code-reviewer` judges root cause vs symptom, regressions, simpler fixes, local convention and whether the declared kind is right. It can send you back to step 4 once. | model | `plan.md` "Step 6" |
| 6 | Implement or stop. `plan()` decides; only `--implement` starts work, at every weight, and a touched path on the owner's never-unattended list suppresses it. | code | `plan.md` "Step 7"; `lib/fix-plan.js`, `lib/fix-sizing.js` `matchNeverUnattended()` |

The other shorter paths:

| Command | Steps | Where it lives |
|---|---|---|
| `/sweep` | 1. Resolve the list verbatim (**model**). 2. The sweep workflow triages, then dispatches one fixer per issue — different areas in parallel, one area in sequence (**code** + **model**). 3. The lead confirms every claimed file shows up in `git status`; an issue whose claimed files are untouched is reported failed (**code**). 4. Deferred items are recorded (**code**). | `sweep.md` Steps 1–4; `workflows/sweep.js` |
| `/amend` | 1. Is this one task — no ordering between parts, one specialism, no undecided product question? File count is deliberately not a signal (**model**). 2. Ground it (**model**). 3. Write the `AMEND-<nnn>` row into the TRD's Master Task List and a discovery row **before** the work (**code**). 4. One implementer, chosen by `lib/agent-routing.js` (**model** does the work). 5. Run the check battery and attest through `implement-state.js` `recordResult()`, which fails a success claim whose files do not exist (**code**). | `amend.md` Steps 1–5 |
| `/verify-build` | With a plan, rounds of: record buildable failures, chain `/implement-trd --reconcile --chained` once, re-verify open criteria, then `lib/functional-verification.js decide-fix-round` (code) says continue or stop. This is now the default; `--no-fix` runs one verify pass and builds nothing. When it stops with work left, or with no plan at all, NEXT points you to `/refine-verification` (add `--auto` for an unattended answer), which writes `.trd-state/<feature>/verification-plan.md` for the next run. | `verify-build.md` "`--fix [plan-path]`", "`--no-fix`"; see [verification.md](verification.md) |

### Maintenance commands

| Command | You invoke it to | Where it lives |
|---|---|---|
| `/init-project` | scaffold `.claude/` into a project (plugin only; runs `scaffold-project.sh`) | `init-project.md` Steps 0–14 |
| `/rebase-project` | refresh a project's vendored runtime from the plugin (plugin only) | `rebase-project.md` Steps 1–5 |
| `/update-project` | capture learnings into `CLAUDE.md`; *propose* constitution and `stack.md` changes, which apply only when you confirm | `update-project.md` Steps 3b, 4b |
| `/cleanup-project` | prune `CLAUDE.md` with a backup and dry run | `cleanup-project.md` Steps 1–7 |
| `/fold-prompt` | tighten `CLAUDE.md` and related context for continued work | `fold-prompt.md` |

Governance files — `constitution.md`, `stack.md`, `verification.md` — change only with you.
`verification.md` is written by the `verification-setup` skill, and running it is the
approval (`.claude/rules/constitution.md` "Governance Split").

---

## Every command

Nineteen commands live in `packages/core/commands/`. Seventeen are copied into every project;
`/init-project` and `/rebase-project` exist only in the plugin
(`packages/full/commands/plugin-only/`). "Workflow" is the script in
`packages/core/workflows/` that the command hands its fixed skeleton to, via one
`Workflow({ name, args })` call. "Lead only" means the session that received the command
does all the work itself.

| Command | Produces | Workflow | Subagents it reaches | Page |
|---|---|---|---|---|
| `/create-prd` | `docs/PRD/<feature>.md`; `current.json` | `create-prd.js` | product-manager (conflict scan, author, drift check); a generic subagent (design-document index); a fork of the lead for the session-fidelity check | [authoring](authoring.md) |
| `/audit-prd` | corrections applied to the PRD; its `## Could Not Verify` rewritten | `audit-prd.js` | backend-implementer (index, verifiers, Could Not Verify rewrite); product-manager (reconcile) | [authoring](authoring.md) |
| `/refine-prd` | revised PRD | none | interactive: none (you answer); `--auto`: product-manager, plus a second, unnamed agent for the challenge pass | [authoring](authoring.md) |
| `/create-trd` | `docs/TRD/<feature>.md`; `current.json` | `create-trd.js` | technical-architect (shape triage, author, sizing); backend-implementer (grounding, merge, deferred write); a generic subagent (design-document index) | [authoring](authoring.md) |
| `/audit-trd` | corrections applied to the TRD; its `## Could Not Verify` rewritten | `audit-trd.js` | backend-implementer (index, verifiers, Could Not Verify rewrite); technical-architect (reconcile) | [authoring](authoring.md) |
| `/refine-trd` | revised TRD | none | interactive: none; `--auto`: product-manager, technical-architect | [authoring](authoring.md) |
| `/augment-trd-figma` | a Visual Design Context section in the TRD, and downloaded design assets | none | lead only — subagents cannot reach the Figma tools | [authoring](authoring.md) |
| `/implement-trd` | code and commits; `.trd-state/<feature>/implement.json`; `verification-report.md` | `implement-phase.js` (once per phase group), `verify-functional.js` (once) | the routed implementers, verify-app (phase gate, exercise), product-manager (success definition), app-debugger (verification fixes); the built-in `/code-review` skill over the branch | [implement-trd](implement-trd.md) |
| `/verify-build` | `verification-report.md`, `verification-state.json`; when fixing (the default, once a plan exists), a `## Fix run` section | `verify-functional.js` | verify-app, app-debugger; product-manager if no success definition exists yet; fixing chains `/implement-trd` | [verification](verification.md) |
| `/audit-build` | `.trd-state/<feature>/audit-build-report.md` | `audit-build.js` | generic workflow agents (index, verifiers); backend-implementer, technical-architect (reconcile); chains `/implement-trd --reconcile` | [other-commands](other-commands.md) |
| `/close-feature` | `.trd-state/<feature>/closed.json`; clears `current.json` | none | lead only | [other-commands](other-commands.md) |
| `/plan` | a light or phased TRD; `docs/plan/<slug>.investigation.md` on the medium and PRD routes | `create-trd.js` + `audit-trd.js` (medium), `create-prd.js` (PRD route) | code-reviewer (small, medium); chains `/implement-trd` with `--implement` | [other-commands](other-commands.md) |
| `/amend` | an `AMEND-<nnn>` TRD row, a discovery row, the change | none | one implementer, chosen by `lib/agent-routing.js` | [other-commands](other-commands.md) |
| `/sweep` | fixes; `.trd-state/_sweep/discovered.jsonl` for what was deferred | `sweep.js` | technical-architect (triage), backend-implementer (one per issue) | [other-commands](other-commands.md) |
| `/update-project` | `CLAUDE.md` edits; proposed governance changes | none | lead only | [other-commands](other-commands.md) |
| `/cleanup-project` | pruned `CLAUDE.md`, plus a backup | none | lead only | [other-commands](other-commands.md) |
| `/fold-prompt` | optimised context files | none | lead only | [other-commands](other-commands.md) |
| `/init-project` | `.claude/` scaffold and governance files | none (runs `scaffold-project.sh`) | lead only | [other-commands](other-commands.md) |
| `/rebase-project` | refreshed `.claude/` runtime | none (runs `scaffold-project.sh`) | lead only | [other-commands](other-commands.md) |

Which step reaches which agent, with model and effort, is in [agents.md](agents.md).

---

## How a command runs

Every workflow command has the same outer shape, whatever it does inside. The diagram is in
[CONCEPTS](../guides/CONCEPTS.md); this is the step detail.

| # | Step | Kind | Where it lives |
|---|---|---|---|
| 1 | You type the command. The `UserPromptSubmit` hook `router.py` records that a command is running in `.trd-state/_command-runs/<session>.json` and injects a one-line `ENSEMBLE_COMMAND state=active` marker plus a short framework orientation hint (and the feature in flight, if any) into the lead's context. | code | `packages/router/hooks/router.py` `write_command_run_state()`, `build_marker()` |
| 2 | The lead session reads the command's prose (the `.md` file) and resolves every input from disk: which TRD, which PRD, the rules files, prior state. | model | each command's first steps, e.g. `implement-trd.md` "Step 1: Preflight" |
| 3 | The lead hands the fixed part of the work to a workflow script in one call. The script opens no files and runs no shell; everything arrives in `args`. | code | e.g. `implement-trd.md` §4.2; `workflows/implement-phase.js` header |
| 4 | The script dispatches subagents with `agent(prompt, { agentType, model, effort, schema })`. The schema forces a structured return, so a subagent that ends without a result produces no valid return and is recorded as failed. | code dispatches, model works | `workflows/*.js`; [agents.md](agents.md) "How dispatch works" |
| 5 | Around each subagent, `dispatch-ledger.js` appends start and stop rows to `.trd-state/<feature>/dispatch.jsonl`, and `status.js` advances task progress in `implement.json` as a safety net. | code | `hooks.manifest.json` (SubagentStart, SubagentStop); `hooks/dispatch-ledger.js`, `hooks/status.js` |
| 6 | Every `Edit`, `Write` or `MultiEdit`, by the lead or a subagent, triggers `formatter.sh`. | code | `hooks.manifest.json` (PostToolUse) |
| 7 | The script returns one object. The lead checks its claims against disk (files named as changed exist; `recordResult()` in `lib/implement-state.js`), writes state, and commits where the command says to. | code + model | e.g. `sweep.md` Step 3, `amend.md` Step 5 |
| 8 | The lead prints the four-section readout (STATE, DECISIONS, ISSUES, NEXT), publishes any document as an artifact link, runs `notify-complete.sh` (which sets the run state to `none` and fires your `NOTIFY_ON_COMPLETE`), and ends on the `COMMAND COMPLETE` or `COMMAND STUCK` banner. | model + code | `.claude/rules/command-status.md`; `hooks/notify-complete.sh` |
| 9 | When the turn ends, the `Stop` hooks run: `discipline-stop` (a model judge, `claude-sonnet-5`) blocks a promise of later work with nothing behind it, and — only while a command is marked active — a mid-command pause; `notify.sh` fires your `NOTIFY_ON_STOP`. A block gets one corrective turn. | model (judge), code | `hooks.manifest.json` (Stop); see [hooks.md](hooks.md) |

Two variations on this shape:

- **Lead-only commands** (`/close-feature`, `/amend`, `/augment-trd-figma`, the maintenance
  commands) skip step 3; the lead does the work or dispatches with the `Agent` tool directly.
- **Chaining commands** (`/plan --implement`, `/audit-build`, `/verify-build` when fixing) start
  `/implement-trd` in the same session with `Skill(...)`. The run ends on exactly one banner,
  printed by whichever command finishes last (`command-status.md` "Enforcement").
