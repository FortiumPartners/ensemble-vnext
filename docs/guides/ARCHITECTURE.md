# Ensemble Architecture

What makes up Ensemble, what each part does, and where it lives. For how to use the commands,
read [PROCESS.md](PROCESS.md); for why it is shaped this way, [CONCEPTS.md](CONCEPTS.md). The
step-by-step detail of each part is in [`docs/reference/`](../reference/README.md).

---

## 1. Two layers: the plugin and the runtime

```
Plugin (installed once per machine)        Runtime (committed in each project)
-----------------------------------        -----------------------------------
/init-project, /rebase-project       -->   .claude/commands/   25 workflow commands
agents-lib/                          -->   .claude/agents/     13 subagents
skills-lib/  (the skill library)     -->   .claude/skills/     skills for this stack + framework skills
hooks + hooks manifest               -->   .claude/hooks/      and their registration in settings.json
templates/                           -->   .claude/rules/, CLAUDE.md, docs/, .trd-state/
workflows/, lib/, contracts/         -->   .claude/workflows/, .claude/lib/, .claude/contracts/
```

The **plugin** is the generator. It keeps only the two commands that create or upgrade a
project's runtime: `/init-project` and `/rebase-project`. It registers no agents and no hooks of
its own; everything that runs in a session comes from the project's `.claude/`.

The **runtime** is what the plugin copies into a project. It is committed to git, so:

- a local CLI session and a web session (which sees only the repository) behave the same;
- each project stays pinned to its own runtime version until you upgrade it;
- every framework change arrives as a diff you can review.

---

## 2. Keeping the runtime current: refresh and rebase

Vendoring buys reproducibility at a price: each project holds its own copy of the runtime. Two
mechanisms keep that copy current, and they are deliberately different.

| | **Refresh** (automatic) | **Rebase** (deliberate) |
|---|---|---|
| Trigger | `runtime-refresh.sh`, a `SessionStart` hook, every session | You run `/rebase-project` |
| Scope | Framework files **already present** in `.claude/` | Any framework file, including new ones |
| Adds or removes components | Never | Yes: adds new ones, removes retired commands, agents and skills |
| Touches your rule files | Never | Never (`constitution.md`, `stack.md`, `process.md`, `verification.md`, `design.md`) |
| Commits | No: leaves the changes for you to review | No: needs a clean tree, because git is the undo |

**Refresh is safe unattended because of what it cannot do.** It replaces what is already there
and nothing else, so it can neither add a component you never selected nor delete one you
depend on. Anything that needs a decision belongs to `/rebase-project`.

### The version stamp

`.claude/settings.json` carries `ensemble.version`, the plugin version the runtime came from.
`/init-project` and every `/rebase-project` stamp it (a rebase does so as its last step; a
project left without one is treated as out of date). A refresh writes it too, with
`refreshed_at`.

The refresh gate is **monotonic**: it acts only when the installed plugin is strictly newer
than the stamp. That stops two teammates on different plugin versions from flipping committed
runtime files back and forth. A project with no stamp reads as *unknown*, not *older*, so it
never auto-refreshes; run `/rebase-project` once.

### When refresh does nothing

`runtime-refresh.sh` always exits 0. It skips:

1. **No plugin installed** (CI, a fresh clone): silently.
2. **The project is inside the plugin's own checkout**: silently, so a stale plugin cache can
   never overwrite live source. It checks ancestors too, so a fixture nested in the checkout is
   covered.
3. **A task is in progress** (an `implement.json` task marked `in_progress` within the last 30
   minutes): with a one-line notice. A multi-session `/implement-trd` must not pick up
   different command text halfway through. An older `in_progress` mark, left by a crashed
   session, no longer blocks it.
4. **The plugin is not newer**: silently.

### Changes land in the next session

Claude Code loads `.claude/` before `SessionStart` hooks run, so a refresh rewrites files the
current session has already read. The message says so:

```
ENSEMBLE runtime refreshed 4.14.0 → 4.15.0 — 6 commands, 1 hook updated.
Changes take effect in the NEXT session (this session's components were already loaded).
```

| Env var | Effect |
|---|---|
| `ENSEMBLE_RUNTIME_REFRESH_DISABLE=1` | Skip refresh entirely |
| `ENSEMBLE_RUNTIME_REFRESH_DEBUG=1` | Log every guard decision to stderr |

---

## 3. What a project holds

```
your-project/
|-- CLAUDE.md                     # project operating notes (grows via /update-project)
|-- .claude/
|   |-- agents/                   # the 13 subagents
|   |-- commands/                 # 25 workflow commands
|   |-- workflows/                # workflow scripts: the fixed skeleton of the heavy commands
|   |-- lib/                      # deterministic libraries the commands and workflows call
|   |-- contracts/                # reference text several commands share
|   |-- hooks/                    # hook scripts, plus prompts/ for the model-judged Stop check
|   |-- skills/                   # skills for this stack, plus the framework skills
|   |-- rules/                    # rule files (section 8)
|   +-- settings.json             # hook registrations, env, and the "ensemble" settings
|-- docs/
|   |-- PRD/, TRD/                # requirements and plans, kept as-built
|   |-- plan/                     # sweep lists /plan splits off a finished spec
|   +-- ui/                       # designs: one folder per design, plus _design-system/
+-- .trd-state/                   # progress and evidence, committed with the feature
    |-- current.json              # the feature in flight
    |-- <feature>/                # implement.json, reports, ledgers, artifacts.json, closed.json
    +-- task-<slug>/              # a /task run
```

The full list of state files and what each holds is in
[PROCESS.md §7](PROCESS.md#7-where-state-lives).

---

## 4. Commands

A command is a Markdown prompt, sometimes with shell blocks for its deterministic steps. It
**orchestrates**: it reads state, runs libraries, starts a workflow or dispatches agents, and
ends with the four-part readout and one banner. It owns the task list; agents return results
and never mark their own tasks done.

| Group | Commands |
|---|---|
| Plugin only | `/init-project`, `/rebase-project` |
| Full pipeline | `/create-prd`, `/audit-prd`, `/refine-prd`, `/create-trd`, `/audit-trd`, `/refine-trd`, `/implement-trd`, `/audit-build`, `/close-feature` |
| Design stage (optional) | `/design-system`, `/create-design`, `/audit-design`, `/refine-design`, `/sync-design` |
| Shorter paths | `/plan`, `/amend`, `/sweep`, `/task` |
| Verification | `/verify-build`, `/refine-verification` |
| Design input from Figma | `/augment-trd-figma` |
| Maintenance | `/update-project`, `/cleanup-project`, `/audit-docs`, `/fold-prompt` |

Two setup steps are **skills** you invoke like commands, not commands: `/verification-setup`
(writes `verification.md`) and `/design-setup` (writes `design.md`). Neither can be started by
an agent.

**Who can start a command.** You can start any of them. The authoring commands, which are
expensive and read like a request you would type (`/create-prd`, `/refine-prd`, `/create-trd`,
`/refine-trd`, `/create-design`, `/refine-design`, `/augment-trd-figma`), are marked so that only
you can. An agent can start the others, including the audits, `/verify-build` and
`/refine-verification`, but a command's authorization still ends at its own banner: nothing
chains into the next stage unless you asked for a chain.

**One banner per run.** A few commands run another as one of their steps: `/audit-build` runs
`/implement-trd --reconcile --chained` to fix what it found; `/verify-build` does the same for its
fix rounds; `/plan --implement` runs `/sweep --chained` and `/verify-build --chained`;
`/sync-design` runs `/design-system --sync --chained`. The inner command prints no banner, and
the run ends on the outer one.

---

## 5. Workflows and libraries: code owns the shape

The heavy commands hand their skeleton to a **workflow** script in `.claude/workflows/`: which
agents run, in what order, in parallel or in sequence, how many times a loop may go round, and
when it stops. Agents do the judgement at each step and return a result in a fixed shape that
code checks.

| Workflow | Used by | Does |
|---|---|---|
| `create-prd.js`, `create-trd.js` | `/create-prd`, `/create-trd` | Index related documents, author in a fresh agent, ground every TRD task in the code |
| `audit-prd.js`, `audit-trd.js`, `audit-build.js` | the three audits | Run independent verifiers in parallel, then reconcile their findings |
| `implement-phase.js` | `/implement-trd`, once per phase | Dispatch the phase's tasks in waves, then gate the phase |
| `verify-functional.js` | `/implement-trd`, `/verify-build` | The bounded verification loop: setup check, exercise, judge, debug |
| `sweep.js` | `/sweep` | Triage the list, then one grounded fixer per issue |
| `audit-docs.js` | `/audit-docs`, once per batch | Score, route and review documents for drift |
| `create-design.js`, `audit-design.js`, `sync-design.js` | the design commands | Ground and draw boards; check boards; capture and compare the build |

Decisions that must come out the same every time live in **libraries** in `.claude/lib/`,
unit-tested. The main ones:

| Library | Decides |
|---|---|
| `trd-parser.js`, `task-graph.js` | What tasks a TRD holds and which can run together (tasks touching the same file never do) |
| `implement-state.js` | Reading and writing `implement.json` |
| `functional-verification.js` | The verification loop's next step and its outcome (satisfied, unbuilt, stalled, stuck, insufficient-coverage, must-pass-unproven, setup-failure), and the report |
| `spec-scope.js` | Copying a finished spec's acceptance criteria verbatim and checking nothing was added or dropped; must-pass marks |
| `audit-rounds.js` | Classifying audit findings (defect, test gap, note, deferred) and whether to fix, re-audit or close |
| `fix-plan.js` | `/verify-build`'s fix rounds and `/plan`'s sweep chain |
| `trd-grounding.js` | Writing a TRD's Task Grounding section from each grounding agent's file |
| `artifacts.js` | The `artifacts.json` manifest: one path and link per document kind |
| `pull-request.js` | Pushing the branch and opening or updating the PR (never merging) |
| `design-map.js`, `design-mirror.js`, `design-render.js`, `design-bundle.js` | Board statuses and approval, canvas sync, rendering boards to PNG, bundling the design system |

---

## 6. Agents

Agents are Markdown prompts with YAML frontmatter, no code. Each runs as a subagent: a fresh
context given one task. Every agent declares its model and effort. The full table of who
dispatches each agent, and where, is [reference/agents.md](../reference/agents.md).

| Agent | Used for |
|---|---|
| `product-manager` | Writing PRDs; deriving the success definition verification checks against; answering open questions under `--auto` |
| `technical-architect` | Writing TRDs; judging audit findings; triaging `/sweep` lists |
| `frontend-implementer`, `backend-implementer`, `mobile-implementer`, `agent-implementer` | Building tasks. `agent-implementer` is for work where the deliverable is the AI behaviour itself (prompts, retrieval, agent loops, evals) |
| `devops-engineer`, `cicd-specialist` | Infrastructure tasks; CI/CD pipeline tasks |
| `verify-app` | The phase gate; the Exercise stage of verification |
| `app-debugger` | The Debug stage of verification: fixes not-met criteria in place, reports missing features as unbuilt |
| `code-reviewer` | `/plan`'s adversarial review pass. `/implement-trd`'s end-of-run review uses the built-in `/code-review` instead |
| `spec-planner`, `code-simplifier` | Available on request; no command dispatches them (task ordering is computed by `task-graph.js`) |

Agents may dispatch agents, with one exception: an agent never spawns its own type for the same
task. An implementer that meets work outside its task reports it rather than delegating it.

---

## 7. Hooks

Hooks run automatically at fixed moments. All but one are scripts that cannot block anything;
the one model-judged hook can send a turn back once. Every detail (what each reads, writes and
puts into the model's context) is in [reference/hooks.md](../reference/hooks.md).

| Event | Hook | What it does |
|---|---|---|
| SessionStart | `session-context.js` | Exports the session id for later tools; prints a brief on the feature in flight |
| SessionStart | `runtime-refresh.sh` | Refreshes framework files from a newer plugin (section 2) |
| UserPromptSubmit | `router.py` | Marks a slash command as running (which the Stop check reads); on ordinary prompts, adds a short orientation hint |
| PostToolUse (Edit, Write) | `formatter.sh` | Formats the edited file, with Prettier only when the project declares a Prettier config |
| SubagentStart, SubagentStop | `dispatch-ledger.js` | Records every subagent start and stop in `.trd-state/<feature>/dispatch.jsonl` |
| SubagentStop | `status.js` | Advances task progress in `implement.json` |
| PreCompact | `precompact.js` | Saves the decision trail to a session log before the conversation is summarized |
| Stop | `discipline-stop` (model-judged) | Checks the turn's last message for a promise nothing will keep ("I'll let you know when it's done" with nothing running) and, while a command is running, for a needless "shall I continue?" pause. Sends the turn back once |
| Stop | `notify.sh` | Runs your `NOTIFY_ON_STOP` command on every turn end ([stop-hook-notification.md](stop-hook-notification.md)) |
| (called by commands) | `notify-complete.sh` | Runs your `NOTIFY_ON_COMPLETE` command once, when a command finishes or gets stuck |

A block from the Stop check appears in the CLI as `Stop hook error: …`. That is a Claude Code
display quirk, not a fault in your setup.

---

## 8. Rule files

`.claude/rules/` holds two kinds of file. The framework rules load into every session and every
agent; the owner files are yours.

| File | Owner | Says |
|---|---|---|
| `constitution.md` | You | Project absolutes: quality gates, what needs your approval, prohibited patterns, verification level |
| `stack.md` | You | Languages, frameworks, test tools, hosting. Drives skill selection |
| `process.md` | You | The workflow as this project uses it |
| `verification.md` | You, only via `/verification-setup` | How verification reaches a running instance; resource counts; refresh commands; where credentials live; what cannot be verified; the coverage floor; never-unattended paths |
| `design.md` | You, only via `/design-setup` | The design system, each platform, how to reach a screen, design rules |
| `async-discipline.md` | Framework | Never claim background work without something real that will report back |
| `autonomy.md` | Framework | A command runs from your invocation to its banner without asking you to confirm what it can decide, and authorizes only itself |
| `command-status.md` | Framework | The banners, the four-part readout, artifact links, completion notifications |

`/update-project` may propose a change to `constitution.md` or `stack.md`; it is applied only
with your approval. No upgrade and no unattended run changes an owner file.

---

## 9. Skills

Skills are Markdown knowledge packs loaded when a task calls for them. They are prompts, not
code.

- **Stack skills** are chosen by `/init-project` from the plugin's library to match
  `stack.md` (languages, test runners, platforms, AI SDKs, issue trackers), and recomputed by
  `/rebase-project`. The library is `packages/skills/` in the plugin repository.
- **Framework skills** ship to every project, listed once in the plugin's
  `packages/skills/framework-skills.txt`:

| Skill | Role |
|---|---|
| `verify-design-comparison`, `verify-flow-as-built`, `verify-data-fidelity`, `verify-design-structure` | Verification checks a TRD can select under `## Verification Artifacts` |
| `verification-setup`, `design-setup` | Owner interviews that write `verification.md` and `design.md` |
| `designing-on-canvas`, `design-grounding` | Read by the design commands: canvas conventions, and grounding a design in the code |

You can add your own skills under `.claude/skills/<name>/SKILL.md`; a rebase keeps them.

---

## 10. Settings

`.claude/settings.json` holds the hook registrations, two environment values the Stop check
relies on (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=1` bounds it to one corrective turn), and the
`ensemble` block:

| Key | Default | Meaning |
|---|---|---|
| `version` | the plugin version at init | The runtime version (section 2) |
| `publishArtifacts` | `true` | Publish documents as private claude.ai pages |
| `openPullRequest` | `never` | `auto` lets a passing `/audit-build` or `/close-feature` open the PR |
| `docsAudit.thresholds.high`, `.medium` | 70, 40 (not written to the file; add the key to override) | `/audit-docs` drift scores that earn a thorough or a light review |
| `agents_dir`, `skills_dir`, `rules_dir`, `state_dir`, `docs_dir`, `prd_dir`, `trd_dir` | `.claude/…`, `.trd-state`, `docs`, … | Where things live |

A refresh or rebase adds missing keys and never overwrites a value you set. Machine-specific
settings go in `.claude/settings.local.json`, which is git-ignored.
