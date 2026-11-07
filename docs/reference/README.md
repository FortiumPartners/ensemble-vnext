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
| [verification.md](verification.md) | the functional-verification loop and its outcomes, `/verify-build` (fixes by default; `--no-fix` for report-only), `/refine-verification`, the check and support skills |
| [design.md](design.md) | the design stage: `/design-system`, `/create-design`, `/refine-design`, `/audit-design`, `/sync-design`, board statuses, `.claude/rules/design.md`, the design libraries |
| [other-commands.md](other-commands.md) | `/plan`, `/sweep`, `/amend`, `/task`, `/audit-build`, `/close-feature`, `/audit-docs`, and the maintenance commands |
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
| 5a | For UI work, the design stage (optional): `/design-system` builds the product's design system, `/create-design` draws boards for the feature, `/refine-design` and `/audit-design` revise and check them, and `/create-trd <prd> --design docs/ui/<slug>` builds a TRD from them — invoking it approves the boards it builds. | you, then code + model | see [design.md](design.md) |
| 6 | `/implement-trd` builds the TRD phase by phase, reviews the whole branch once, then runs functional verification (on by default). | you, then code + model | `implement-trd.md`; see [implement-trd.md](implement-trd.md) |
| 7 | `/verify-build` builds and re-verifies in rounds by default, once a plan exists; `--no-fix` re-runs verification alone. If it falls short, `/refine-verification [--auto]` agrees the plan the next round runs. | you | `verify-build.md`; see [verification.md](verification.md) |
| 8 | `/audit-build` checks delivered code against TRD and PRD. A task the TRD has but nobody built is set back to pending and `/implement-trd --reconcile` runs automatically; a requirement with no task stops for you, because deciding how to cover it is design. `--report-only` suppresses the chain. It re-audits only after a true product defect, at most twice; with no defect open it closes the feature (test gaps are fixed first, never re-audited): writes `.trd-state/<feature>/closed.json`, clears `current.json`, and commits the record with its report. | you, then code + model | `audit-build.md` "But it DOES close the loop", "Close the feature when the audit passes" |
| 9 | A closing audit opens the PR when `ensemble.openPullRequest` is `auto`; you merge it. Merging and releasing are never done by a command. | you | `.claude/rules/autonomy.md` "The authorization is scoped to ONE command" |
| 10 | `/close-feature` is the other way to close: you say the feature is closed, with an optional note. Same bookkeeping as the audit's close; no judgement. | you, then code | `close-feature.md` "The close step" |
| 11 | When the feature built design boards, both closing paths name `/sync-design <slug>` in NEXT, to run now or once the PR has merged (`/sync-design <slug> --trd <trd>` limits it to that feature's boards): it checks each board against the build and marks the matching ones shipped. Never run automatically. | you | `audit-build.md` / `close-feature.md` "Unsynced boards"; [design.md](design.md) |

### The shorter paths

`/plan` sizes work below the PRD threshold on two axes — **kind** (defect, change or
refactor) and **weight** (trivial, small or medium) — and writes a TRD to match. When its source
already lists acceptance criteria it locks them verbatim and can split the independent ones
into a sweep list (see [other-commands.md](other-commands.md) "the spec path"). `/amend`
adds one change to the feature already in flight. `/sweep` fixes a list of small unrelated
issues with no TRD at all. `/task` runs a job whose output is findings, not code. `/ship-build` ships what a closed feature left on the branch. The `/plan`
steps, in order:

| # | Step | Kind | Where it lives |
|---|---|---|---|
| 1 | Investigate by kind: reproduce a defect, locate a change, measure a refactor's test coverage; then ground the fix in the files it touches. | model | `plan.md` "Step 2: Investigate" |
| 2 | The exit test. The model writes one sentence answering "would a PRD have content the TRD would not?"; `route()` turns that single boolean into `'prd'` or `'plan'` and reads nothing else. | model, then code | `plan.md` "Step 3"; `lib/plan-weight.js` `route()` |
| 3 | Route `'prd'`: write the investigation record, then start the create-prd **workflow** directly (not the command, whose frontmatter blocks model invocation). That run's banner ends it. | code | `plan.md` "Route: 'prd'"; `lib/fix-plan.js` `plan()` |
| 4 | Decide the weight. `stages()` returns the stage list: trivial = investigate, author, implement; small adds the adversarial review; medium adds grounding and an audit and writes a phased TRD. | model, then code | `plan.md` "Step 4"; `lib/plan-weight.js` `stages()` |
| 5 | Adversarial review (small, medium): one `code-reviewer` judges root cause vs symptom, regressions, simpler fixes, local convention and whether the declared kind is right. It can send you back to step 4 once. | model | `plan.md` "Step 6" |
| 6 | Implement or stop. `plan()` decides; only `--implement` starts work, at every weight, and a touched path on the owner's never-unattended list (`verification.md` §5b) suppresses it. On a sweep list, `--implement` runs the sweep chain instead: `/sweep`, `/verify-build` on the sweep file, a commit, then `/implement-trd` on the core, each step chosen by `sweepChainNext()`. | code | `plan.md` "Step 7", "Step 7a"; `lib/fix-plan.js`, `functional-verification.js check-never-unattended` |

The other shorter paths:

| Command | Steps | Where it lives |
|---|---|---|
| `/task` | 1. Create `.trd-state/task-<slug>/` and write the step list as `implement.json` (**model** + **code**). 2. Run each step once; an undoable step is recorded `deferred` (**model**). 3. Record outputs with `artifacts.js record` (**code**). 4. Write `closed.json` with `outputs` and `followups` (**code**). | `task.md` Steps 1–4 |
| `/sweep` | 1. Resolve the list verbatim (**model**). 2. The sweep workflow triages, then dispatches one fixer per issue — different areas in parallel, one area in sequence (**code** + **model**). 3. The lead confirms every claimed file shows up in `git status`; an issue whose claimed files are untouched is reported failed (**code**). 4. Deferred items are recorded (**code**). | `sweep.md` Steps 1–4; `workflows/sweep.js` |
| `/amend` | 1. Is this one task — no ordering between parts, one specialism, no undecided product question? File count is deliberately not a signal (**model**). 2. Ground it (**model**). 3. Write the `AMEND-<nnn>` row into the TRD's Master Task List and a discovery row **before** the work (**code**). 4. One implementer, chosen by `lib/agent-routing.js` (**model** does the work). 5. Run the check battery and attest through `implement-state.js` `recordResult()`, which fails a success claim whose files do not exist (**code**). | `amend.md` Steps 1–5 |
| `/verify-build` | With a plan newer than the last report, rounds of: record buildable failures, chain `/implement-trd --reconcile --chained` once, re-verify open criteria, then `lib/functional-verification.js decide-fix-round` (code) says continue or stop. This is the default; `--no-fix` runs one verify pass and builds nothing. When it stops with work left, or with no plan at all, NEXT points you to `/refine-verification` (add `--auto` for an unattended answer), which writes `.trd-state/<feature>/verification-plan.md` for the next run. A broken environment ends the run `setup-failure` — the environment, not the code — and never stops to ask. | `verify-build.md` "`--fix [plan-path]`, `--no-fix`, and `--resume`"; see [verification.md](verification.md) |
| `/ship-build` | Runs the steps in `ship.md` in order, each a shipping primitive (push, open-pr, wait-ci, review rounds, merge, release); the sequencer, not the model, orders steps and decides where a run parks. Listing an outward step (merge, release, ...) does not authorize it: it runs only when `autonomy.md` carries the standing-authorization sentence (see [ship-build guide](../guides/ship-build.md#the-outward-authorization-gate)). Fill `ship.md` with the `ship-setup` skill. | `ship-build.md`; see [other-commands.md](other-commands.md) |
| `/sync-design` | After a build that used design boards: capture each `building` board's screen from the build, compare, mark matches `shipped`, rebuild boards an owner ruling accepts, report the rest. | `sync-design.md`; see [design.md](design.md) |

### Maintenance commands

| Command | You invoke it to | Where it lives |
|---|---|---|
| `/init-project` | scaffold `.claude/` into a project (plugin only; runs `scaffold-project.sh`) | `init-project.md` Steps 0–14 |
| `/rebase-project` | refresh a project's vendored runtime from the plugin (plugin only) | `rebase-project.md` Steps 1–5 |
| `/update-project` | capture learnings into `CLAUDE.md`; *propose* constitution and `stack.md` changes, which apply only when you confirm | `update-project.md` Steps 3b, 4b |
| `/cleanup-project` | prune `CLAUDE.md` with a backup and dry run | `cleanup-project.md` Steps 1–7 |
| `/fold-prompt` | tighten `CLAUDE.md` and related context for continued work | `fold-prompt.md` |
| `/audit-docs` | bring `docs/` back in line with the code as built, on a local review branch (light by default; `--comprehensive` for everything) | `audit-docs.md` Steps 1–7; see [other-commands.md](other-commands.md) |

Governance files — `constitution.md`, `stack.md`, `verification.md`, `design.md` — change only
with you. `verification.md` is written by the `verification-setup` skill and `design.md` by the
`design-setup` skill; running the skill is the approval (`.claude/rules/constitution.md`
"Governance Split"; `design.md`'s own header). No refresh or rebase overwrites either.

---

## Every command

Twenty-seven commands live in `packages/core/commands/`. Twenty-five are copied into every
project; `/init-project` and `/rebase-project` exist only in the plugin
(`packages/full/commands/plugin-only/`; `scaffold-project.sh` skips them). "Workflow" is the script in
`packages/core/workflows/` that the command hands its fixed skeleton to, via one
`Workflow({ name, args })` call. "Lead only" means the session that received the command
does all the work itself.

| Command | Produces | Workflow | Subagents it reaches | Page |
|---|---|---|---|---|
| `/create-prd` | `docs/PRD/<feature>.md`; `current.json` | `create-prd.js` | product-manager (conflict scan, author, drift check); a generic subagent (design-document index); a fork of the lead for the session-fidelity check | [authoring](authoring.md) |
| `/audit-prd` | corrections applied to the PRD; its `## Could Not Verify` rewritten | `audit-prd.js` | backend-implementer (index, verifiers, Could Not Verify rewrite); product-manager (reconcile) | [authoring](authoring.md) |
| `/refine-prd` | revised PRD | none | interactive: none (you answer); `--auto`: product-manager, plus a second, unnamed agent for the challenge pass | [authoring](authoring.md) |
| `/create-trd` | `docs/TRD/<feature>.md`; `current.json`; with `--design`, approved boards moved to `building` | `create-trd.js` | technical-architect (shape triage, author, sizing); backend-implementer (grounding, merge); a generic subagent (design-document index) | [authoring](authoring.md) |
| `/audit-trd` | corrections applied to the TRD; its `## Could Not Verify` rewritten | `audit-trd.js` | backend-implementer (index, verifiers, Could Not Verify rewrite); technical-architect (reconcile) | [authoring](authoring.md) |
| `/refine-trd` | revised TRD | none | interactive: none; `--auto`: product-manager, technical-architect | [authoring](authoring.md) |
| `/augment-trd-figma` | a Visual Design Context section in the TRD, and downloaded design assets | none | lead only — subagents cannot reach the Figma tools | [authoring](authoring.md) |
| `/implement-trd` | code and commits; `.trd-state/<feature>/implement.json`; `verification-report.md` | `implement-phase.js` (once per phase group), `verify-functional.js` (once) | the routed implementers, verify-app (phase gate, exercise), product-manager (success definition), app-debugger (verification fixes); the built-in `/code-review` skill over the branch | [implement-trd](implement-trd.md) |
| `/verify-build` | `verification-report.md`, `verification-state.json`; when fixing (the default, once a plan exists), a `## Fix run` section | `verify-functional.js` | verify-app, app-debugger; product-manager if no success definition exists yet; fixing chains `/implement-trd` | [verification](verification.md) |
| `/refine-verification` | `.trd-state/<feature>/verification-plan.md` (its only writer) | none | interactive: none (you answer); `--auto`: product-manager | [verification](verification.md) |
| `/audit-build` | `.trd-state/<feature>/audit-build-report.md`; `audit-rounds.jsonl`; on a pass, `closed.json` and a PR | `audit-build.js` | generic workflow agents (index, verifiers); backend-implementer, technical-architect (reconcile); chains `/implement-trd --reconcile --chained` | [other-commands](other-commands.md) |
| `/close-feature` | `.trd-state/<feature>/closed.json`; clears `current.json` | none | lead only | [other-commands](other-commands.md) |
| `/plan` | a light or phased TRD; `docs/plan/<slug>.investigation.md` on the medium and PRD routes | `create-trd.js` + `audit-trd.js` (medium), `create-prd.js` (PRD route) | code-reviewer (small, medium); chains `/implement-trd` with `--implement` | [other-commands](other-commands.md) |
| `/amend` | an `AMEND-<nnn>` TRD row, a discovery row, the change | none | one implementer, chosen by `lib/agent-routing.js` | [other-commands](other-commands.md) |
| `/sweep` | fixes; `.trd-state/_sweep/discovered.jsonl` for what was deferred | `sweep.js` | technical-architect (triage), backend-implementer (one per issue) | [other-commands](other-commands.md) |
| `/task` | `.trd-state/task-<slug>/implement.json` and `closed.json`; recorded report artifacts | none | lead only, or an implementer with an explicit type for an implementation-shaped step | [other-commands](other-commands.md) |
| `/ship-build` | `.trd-state/<feature>/shipped.json` and `custody.json`; the push, PR, merge and release the steps in `ship.md` perform | `ship-sequencer.js` (code); primitives run by the model | lead; a primitive may dispatch a fixer | [other-commands](other-commands.md) |
| `/audit-docs` | corrections on a local `docs-audit/<date>-<sha>` branch; `docs/PRD/INDEX.md`, `docs/TRD/INDEX.md`; a change set under `.trd-state/_docs-audit/runs/` | `audit-docs.js` (once per batch) | code-reviewer (drift score on Haiku; read-only verifiers on Opus for high-drift docs); backend-implementer (apply on Opus, or a single Sonnet review for medium drift) | [other-commands](other-commands.md) |
| `/design-system` | the design system's built files under `docs/ui/_design-system/`; a Design System artifact installed on each canvas | none | lead only | [design](design.md) |
| `/create-design` | `docs/ui/<slug>/` (brief, grounding, boards, `design-map.json`, rendered frames); a Design canvas | `create-design.js` (twice: ground, then draw) | backend-implementer (grounding, render), product-manager (brief), frontend-implementer (boards, fix), code-reviewer (challenge) | [design](design.md) |
| `/refine-design` | revised boards; with `--approve`, approved boards | none | lead only | [design](design.md) |
| `/audit-design` | `.trd-state/<slug>/audit-design-report.md`; changes no board | `audit-design.js` | backend-implementer (index, verifiers, reconcile) | [design](design.md) |
| `/sync-design` | boards moved to `shipped` or rebuilt; a History page on the canvas | `sync-design.js` | frontend-implementer (compare, rebuild); may chain `/design-system --sync --chained` | [design](design.md) |
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

- **Lead-only commands** (`/close-feature`, `/amend`, `/task`, `/refine-verification`,
  `/refine-design`, `/design-system`, `/augment-trd-figma`, the maintenance commands other than
  `/audit-docs`) skip step 3; the lead does the work or dispatches with the `Agent` tool directly.
- **Chaining commands** (`/plan --implement`, `/audit-build`, `/verify-build` when fixing) start
  `/implement-trd` in the same session with `Skill(...)`; `/plan --implement` on a sweep list
  also chains `/sweep --chained` and `/verify-build --chained`, and `/sync-design` chains
  `/design-system --sync --chained`. A chained command ends on a `[STATUS: …] RETURN →` line
  instead of a banner, so the run ends on exactly one banner (`command-status.md`
  "Enforcement").
