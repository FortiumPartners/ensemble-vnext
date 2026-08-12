# Ensemble vNext — Improvement Plan

**Created**: 2026-08-11
**Status**: Item 1 complete (released as 4.1.1). Item 5a done. Items 2–4, 5b–5d, 6–9 open.
**Basis**: Comparison against `Sunstone-Partners/ensemble` + audit of Claude Code features shipped March–August 2026
**Companion artifact**: https://claude.ai/code/artifact/13c683ff-2acf-4ec7-8078-4408126f7602

Ten changes, in the order they pay off. Sequenced for 1–2 items at a time over roughly ten weeks.

---

## First: don't fix the eval harness

The framework in `test/evals/` — remote sessions, an Opus judge, Welch's t-test across variants —
answers *"is A better than B?"* That is an expensive question, and it isn't the one blocking you.
It last ran on 2026-01-16, and repairing it would consume most of the first month.

The question you actually need answered nine times out of ten is *"did I just break something?"*
That one is deterministic and cheap. Item 4 builds it in about a day, on fixtures you already have.
Archive `test/evals/` with a note; revisit only at item 8, where quality genuinely needs comparing —
and even there, five hand-scored scenarios will beat a statistical framework you don't trust.

Everything below is sequenced on that assumption.

---

## Loop and graph engineering, concretely

Both terms trended mid-2026 as if they were new disciplines. Neither is a Claude Code feature —
there is no `/graph` command and no "loop" primitive. Both name patterns the platform already ships
under plainer names, and vNext already implements versions of both. The question is not whether to
adopt them; it is whether vNext's homegrown versions should give way to the native substrate.

**Graph** means: decompose work into a dependency graph, run independent nodes in parallel, and gate
integration nodes behind their prerequisites. vNext's version is `.trd-state/<feature>/implement.json`
— but that file is a *status blob*, not a graph. Phase and parallel-group membership live in TRD prose
that the model re-derives every run. The native substrate is the shared task list's `blockedBy` edges,
which Claude Code resolves automatically. Items **2** and **7** are the graph work.

**Loop** means: the outer iteration — specify, implement, verify, feed the result back, repeat until a
condition holds. vNext's staged loop is mature loop engineering already; what changed is that its two
moving parts now have native counterparts. Turn-by-turn continuation is `/goal`, documented as "a
wrapper around a session-scoped prompt-based Stop hook." Per-worker continuation is the `TeammateIdle`
hook, where exit code 2 sends feedback and keeps the worker going. Items **5** and **9** are the loop work.

The third pattern has no vNext equivalent at all: **moving the orchestration itself out of the model's
context and into a script**. That is item **8**, and it is the only genuinely new capability on this list.

---

## At a glance

| # | Item | Effort | Why it sits here | Status |
|---|------|--------|------------------|--------|
| 1 | Runtime refresh and delivery coherence | 2–3 days | ~12.4k tok/turn wasted; new projects 3 releases behind | **Done (4.1.1)** |
| 2 | Remove `TeamCreate`; put groups on the task graph | 1–2 days | Calls a tool that no longer exists | |
| 3 | Re-baseline the execution model | 1 day | Silent capability loss, no error | |
| 4 | Behavioral smoke harness | 1 day | Makes every later change verifiable | |
| 5 | Rebuild the hook layer | 3–4 days | The whole enforcement surface, at once | **5a done (4.1.0)** |
| 6 | `REVIEW.md` + retire reviewer CLI | 1 day | Best value-per-line on the list | |
| 7 | Extract a tested `lib/` — the task graph | 4–6 days | Prerequisite for item 8 | |
| 8 | One phase as a dynamic workflow | 3–5 days | The architectural bet | |
| 9 | Native quality gates and worker loops | 1–2 days | Cheap once 8 lands | |

---

## Phase A — Ship what you actually run (Week 1)

### 1. Runtime refresh and delivery coherence

> **Status: DONE, shipped as 4.1.1.** All four done-conditions met. Always-on plugin context cost went
> **12,366 → 95 tokens**. Hardcoded `skills:` preloads were removed from all 13 agents (`c4962d0`)
> and replaced with deterministic per-project assignment via `skill-affinity.json` (`d3fde6e`).
> Detailed spec: `docs/TRD/runtime-refresh.md`.

The architecture is sound and not in question: `packages/` is the home, `.claude/` is the vendored
runtime, and the plugin is a delivery mechanism. Keeping the runtime committed is what makes it
reproducible, diffable, and functional in cloud sessions and CI without a plugin install. None of
that changes.

**What's broken is that the delivery path is hand-maintained and has fallen three releases behind,
while the dogfood copy stays current through daily use.** Three defects, one root cause:

- **The plugin registers the whole skill library.** `plugin.json` declared `"skills": "./skills"`,
  so all 61 library skills loaded as plugin skills — globally defeating `/init-project`'s curation.
  `claude plugin details` measured the cost at ~12,366 tokens added to every session, on every
  project on the machine. Plugin skills can't be trimmed by `skillOverrides`, so a project had no
  way to shed them.
- **Five hook files never shipped.** `scaffold-project.sh:272` copies from a hardcoded seven-entry
  array, and `packages/full/hooks/` has no symlinks for `async-discipline.js`,
  `autonomy-discipline.js`, `precompact.js`, `session-context.js`, or `notify-complete.sh`. The
  template `settings.json` agrees with that stale array — it still registers `learning.sh` and
  `save-remote-logs.js` under `SessionEnd`. A project scaffolded before this fix receives none of
  the 3.3.9–3.3.12 work.
- **No version stamp.** `.claude/settings.json` had no `ensemble.version`, so `/rebase-project`'s
  detection at `:118` always fell through to "unknown → full sync," and nothing could be automated.

**The fix has two halves.** A `hooks.manifest.json` declares each hook once — file, event, timeout,
and whether it is registered, model-invoked, or deliberately unregistered — and generates the scaffold
copy list, the template settings block, and the hook table in `init-project.md`. Adding a hook becomes
one entry instead of five hand-edits.

Then `scaffold-project.sh` gains a `--refresh` mode that updates only components *already present*
in `.claude/`, wired to a SessionStart hook. Because it adds nothing and removes nothing, it cannot
un-curate, which makes automatic application safe. Adding or removing components stays with
`/rebase-project`, where the judgment belongs. Four guards keep it honest: skip when no plugin is
installed, skip when the repo *is* the plugin (the marketplace is a directory source pointing here,
so a stale cache would otherwise overwrite live edits), skip while a task is `in_progress`, and write
only when the plugin version is strictly newer — which also prevents teammates on different versions
from ping-ponging the committed files.

One correction to an earlier read: `packages/full/hooks/hooks.json` being `{"hooks": {}}` is
*correct*, not a bug. The project's `settings.json` owns hook registration; if the plugin registered
them too, every hook would fire twice.

**Done when:** `claude plugin details` reports always-on cost under 500 tokens; a freshly scaffolded
project registers the same ten hooks this repo runs; a version bump refreshes a project's existing
components automatically without touching `constitution.md`, `stack.md`, or `.trd-state/`; one version
number appears in all four manifests.

---

## Phase B — Fix what is actually broken (Weeks 2–3)

### 2. Remove `TeamCreate`; put groups on the task graph — *broken today*

The agent-teams docs are unambiguous: as of v2.1.178, `TeamCreate` and `TeamDelete` **no longer
exist**, and `team_name` on the Agent tool is "accepted but ignored." vNext calls the dead tool in
four places — `fix-issue.md:121`, `implement-trd-team.md:146`, `create-trd-team.md:136`, and
`create-prd-team.md`.

The architecture matters more than the call. `implement-trd-team` creates a team per parallel group
per phase (`impl-phase-{N}-group-{G}`). That is now impossible: a session has exactly one team,
auto-created on first spawn and named from the session ID. The grouping scheme has nowhere to live.

The rewrite is a simplification. Drop the creation step, spawn teammates directly with
`Agent({subagent_type, name, prompt})`, and push phase and group identity into **task names plus
`blockedBy` dependencies** on the shared task list — which is where the docs say coordination belongs.
Update `async-discipline.md`'s Prohibited Pattern #6 to match.

**Done when:** No occurrence of `TeamCreate` or `team_name` remains; `/implement-trd-team --phase 1`
completes end to end against a fixture; parallel groups are expressed as task dependencies.

### 3. Re-baseline the execution model — *silent*

Four platform changes landed that vNext hasn't absorbed. Three degrade it silently; one leaves
capability on the table.

**Subagents run in the background by default** (v2.1.198/2.1.216), and a background subagent keeps
every MCP tool but only a fixed list of built-ins. `TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`,
and `AskUserQuestion` are *not* on that list. Any agent expected to claim or update work on the shared
task list currently cannot — and the docs state the removal "reports no error." The constitution's
"omit `tools:` for full access" no longer yields what it used to. Set `background: false` on agents
that must touch the task list or ask a question; leave result-only agents in the background.

**The `skills:` field is ignored for teammates.** It works when an agent runs as a subagent — but when
the same definition is spawned as a teammate, the docs are explicit that `skills` and `mcpServers` are
not applied. Teammates still load skills normally from project and user settings and can invoke them
via the Skill tool; what is lost is the startup preload of full `SKILL.md` content.

**The parallelism budget is off by an order of magnitude.** `implement-trd.md:805` reads "Max 2
concurrent tasks" — a heuristic written when subagents didn't nest and concurrency was tight. The
platform now defaults to **20 concurrent subagents** (tunable via `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`),
and the per-session 200-spawn cap was removed. Re-derive the limit from file-ownership conflicts.

**Subagents now nest three deep, not one.** This is the unused capability. The constitution's "commands
orchestrate, subagents execute" assumed a flat hierarchy because that was the only option. An implementer
can now spawn its own verifier and iterate privately. Decide deliberately whether to allow it — the
principle may still be worth keeping for debuggability — but decide it.

**Done when:** Every agent has an explicit `background:` value with a rationale; a test asserts that
agents in the implement loop can call `TaskUpdate`; the teammate skill gap is closed or documented;
the concurrency limit derives from file ownership; the nesting-depth stance is written down.

---

## Phase C — Get a safety net that runs (Week 4)

### 4. Behavioral smoke harness

Not a repair of `test/evals/`. A new, much smaller thing that answers "did I break it?" with
deterministic checks and no LLM judge.

Most of the parts exist. `ensemble-vnext-test-fixtures/variants/` already holds five configurations
across seven sample projects. `test/integration/tests/` has BATS scaffolding, and `run-headless.sh`
knows how to drive `claude --print` with `--plugin-dir`. What's missing is a short list of assertions
over *observable side effects* rather than output quality:

- The command terminates and its last line is `═══ COMMAND COMPLETE` or `═══ COMMAND STUCK`
- The expected agents appear in the session log (`verify-telemetry.sh` already does this)
- `.trd-state/<feature>/implement.json` advanced to the expected `cycle_position`
- The expected files exist; git is on the expected branch
- No hook wrote to stderr; no Stop hook blocked more than *n* times

Three or four scenarios is enough: a PRD run, a single-task implement run, a deliberately failing
verify to exercise the debug path, and one team command. Target ten minutes wall-clock so you'll
actually run it before each commit.

**Done when:** `npm run smoke` exercises 3–4 scenarios headlessly and fails loudly on a regression;
you have a green baseline captured.

---

## Phase D — Delete code you shouldn't own (Weeks 5–7)

### 5. Rebuild the hook layer

*Consolidates the former "prompt hooks for discipline rules" and "assess `permitter.js`"
items, the router and `InstructionsLoaded` entries from the opportunistic list, and four
defects found while auditing the runtime during item 1.*

Hooks are the framework's entire enforcement surface — every guarantee the constitution makes
is either a hook or a wish. There are 14 hook files; 10 are registered. Treating them one at a
time has meant each is examined only when it breaks. Do the layer at once.

Three distinct problems, handled together because the retirements change what the rest has to cover:

**5a. Retire what shouldn't exist.** ✅ **Done in 4.1.0** — pulled forward ahead of item 1's
Phase 2, because that phase authors a `hooks.manifest.json` enumerating every hook file, and
declaring hooks that were about to be deleted would mean writing the declaration twice.
`learning.sh`, `save-remote-logs.js`, and `permitter` (plus `packages/permitter/`) are gone;
there is now no `SessionEnd` hook anywhere in the framework. The permitter decision resolved
to *delete*: it had been throwing `Cannot find module` on every permission request in every
scaffolded project, so removing it changed no actual behaviour. Router is the one item here
still open — it was a modification, not a deletion.

- **`learning.sh`** — orphaned. Unregistered in this repo, registered in the template, invoked by
  nothing. `/update-project` does not call it, despite documentation that said it did. 20 of its
  41 tests fail. It stages files at `SessionEnd` that nobody asked it to stage.
- **`save-remote-logs.js`** — *commits session transcripts to the repository*, gated only on
  `ENSEMBLE_SAVE_REMOTE_LOGS=1`. A stale export in a shell profile silently commits transcripts
  from every session. Remove it; log archival that writes to git should be explicit, not ambient.
- **`permitter.js`** — 241 lines in the security path, never examined. It predates **auto mode**
  (a background classifier for commands and protected-directory writes) and **prompt-based
  `PermissionRequest` hooks**, either of which may now cover it, and it is bypassed entirely in the
  permissions mode this framework recommends. The platform is hardening this surface fast —
  v2.1.222 alone fixed a Bash permission bypass and a prompt-spoofing hole using invisible Unicode
  padding — and a hand-rolled hook has to keep pace independently.

  Decisive new evidence: **it has been completely broken in every scaffolded project and nobody
  noticed.** The plugin ships `hooks/permitter.js` flat while `settings.json` registers
  `.claude/hooks/permitter/permitter.js`, and its `allowlist-loader`, `command-parser`, and
  `matcher` modules never shipped at all — `Cannot find module` on every `PermissionRequest`. That
  is a strong signal about its real value, but it is evidence for the decision, not the decision.
  Run `/fewer-permission-prompts` first to see what a generated allowlist covers, then choose:
  delete in favour of auto mode plus allowlist rules, reduce it to a prompt hook, or keep it and
  document the specific behaviour neither native path provides. Any of the three is fine; an
  unexamined 241 lines in the security path is not.
- **`router.py`** — now just a static per-prompt reminder to use the framework, costing ~100 tokens
  on every turn including purely conversational ones. Its original keyword matching was removed for
  misfiring on analysis turns. Decide whether the residual nudge earns a per-turn tax, or should
  fire conditionally.

**5b. Rebuild the survivors on the right primitives.**

`async-discipline.js` (296 LOC) and `autonomy-discipline.js` (287 LOC) are regex phrase-matchers
over hand-extracted transcript text. The changelog records the whack-a-mole: 3.3.11 "forbid hedged
offers," then 3.3.12 adding twelve patterns including "the exact user-reported phrase from 3.3.11."
Enumerating natural language with regex is the wrong tool, and an entire layer exists — stripping
fenced blocks, quoted strings, and `e.g.` markers — purely to stop the matcher firing on its own
documentation.

Hooks now accept `type: "prompt"`, which sends the payload to a small fast model and takes a
structured decision back. Not speculative: `/goal` is documented as "a wrapper around a
session-scoped prompt-based Stop hook." A prompt asking *"does this turn claim deferred work
without dispatching it, or offer to pause mid-command?"* generalizes across phrasings you will
never enumerate. Split the responsibility — keep a thin command hook for the deterministic half
(is `background_tasks` or `session_crons` non-empty?), move the semantic half to a prompt hook.

Independently: both discipline hooks and `wiggum.js:339` parse `transcript_path` by hand, but the
Stop payload now carries **`last_assistant_message`** directly, and the docs warn the transcript
file can lag. Switch to the field and delete the readers.

**Keep `wiggum.js`** — a command body cannot seed `/goal`, and v2.1.210 tightened that further —
but change what it re-injects. Today it blocks Stop and replays *the original prompt* verbatim into
a context that has since grown, with no statement of position. The model re-derives where it is
from a stale instruction every iteration, which is why `/goal` empirically sustains progress better.
**A true wiggum feeds back current state AND a completion promise:** state read from `implement.json`
at block time (phase, tasks succeeded/remaining, current task, retry count, last failure), and a
restatement of the completion contract the model must satisfy to exit. The hook already *detects*
`<promise>COMPLETE</promise>` without ever restating it — the contract exists but runs one direction
only. Closing that loop is the substance; shedding the transcript forensics is the cleanup. The
iteration cap stays as the termination guarantee.

**5c. Fix what is quietly wrong.**

- **`lib/resolve-project-root.js`** walks up from `hookData.cwd` looking for `.claude`, `.trd-state`,
  or `.git`. If `cwd` is outside the project it does not fail — it **silently resolves to a different
  project**, because any sibling or nested git repo satisfies the `.git` marker, and hooks then read
  and write the wrong `.trd-state/`. Prefer `$CLAUDE_PROJECT_DIR` when set and fall back to the walk,
  matching how `settings.json` already wraps every hook invocation.
- **`formatter.sh`** works — verified by feeding it a payload and watching it reformat. Two rough
  edges: it shells to `npx prettier` when prettier isn't a devDependency, downloading on every
  invocation (~2s measured), and it rewrites files silently after the model edits them, which can
  surface as diffs the model didn't author.

**5d. Adopt `InstructionsLoaded`.** It fires when `CLAUDE.md` or `.claude/rules/*.md` loads — the
invented rules directory is now a natively recognised path. Both a validation point and a place to
assert rule integrity at load time.

**Done when:** ~~`learning.sh` and `save-remote-logs.js` are gone~~ ✅; a written decision exists for ~~`permitter`~~ ✅ (deleted)
and for `router`, with a test behind it if kept; both discipline hooks are under
~80 LOC with semantic matching in a prompt hook; no hook reads `transcript_path` to find the last
assistant message; `wiggum` re-injects state plus a restated completion promise;
`resolve-project-root` prefers `$CLAUDE_PROJECT_DIR`; every surviving hook loads and exits 0 on a
minimal payload (asserted in item 4's harness); item 1's hook manifest lists exactly the hooks that
remain.

> **Why item 9 is not merged here.** Item 9 adopts *new* platform hook events — `TaskCompleted`,
> `TaskCreated`, `TeammateIdle`, and agent hooks — as quality gates. That is additive work on a
> different surface, and it depends on the task graph (item 7) and the team-command rework (item 2)
> existing first. This item is about the hooks that exist today. Sequencing, not subject matter,
> separates them.

### 6. Ship a `REVIEW.md`; retire the reviewer CLI

The highest value per line of work on the list. `REVIEW.md` is read by Anthropic's Code Review and
injected into *every agent in the review pipeline as the highest-priority instruction block* — the docs
note explicitly that repo-specific rules "land more reliably than the same rules in a long `CLAUDE.md`."

`constitution.md`'s Quality Gates, the Definition of Done, and the prohibited-pattern table are exactly
that content. Have `/init-project` scaffold a `REVIEW.md` derived from the constitution, and ship one in
vNext's own root. Governance then gets enforced by a reviewer you don't maintain.

At the same time: delete `packages/reviewer/cli/review.js`. A single-file CLI cannot compete with a
multi-agent verified reviewer, and `/code-review` now runs as a background subagent with effort levels,
`--fix`, `--comment`, and an `ultra` cloud tier.

**Keep the `code-reviewer` agent** — `/code-review` is marked `disable-model-invocation`, so the implement
loop cannot call it programmatically. But re-scope it: stop duplicating generic OWASP coverage the platform
now does better, and point it at TRD acceptance-criteria verification, which nothing native does. Have it
emit through the `ReportFindings` tool instead of prose you parse.

**Done when:** `REVIEW.md` exists in-repo and is scaffolded by `/init-project`; `packages/reviewer/` is
gone; `code-reviewer.md` describes acceptance-criteria verification and specifies `ReportFindings` output.

## Phase E — Move logic out of prose (Weeks 8–10)

### 7. Extract a tested `lib/` — build the task graph

> #### Open design question — concurrent TRDs, sessions, worktrees, and developers
>
> **Carry this into items 7 and 8. It is not solved today and neither item works without an
> answer.** The current state model assumes exactly one TRD being implemented, by one person,
> in one session, in one working tree. Every one of those assumptions breaks in normal use:
>
> - **`.trd-state/current.json` is a single pointer** (`prd`, `trd`, `status`, `branch`) and is
>   **git-tracked**. Two developers on two TRDs both rewrite it; two worktrees off the same
>   repo disagree about what "current" means. It is a merge conflict by construction.
> - **`implement.lock` is per-TRD**, so it prevents two sessions racing the *same* TRD but says
>   nothing about two TRDs racing the same *files*. File-ownership conflicts are currently
>   reasoned about within a single TRD only.
> - **The shared task list is session-scoped** (`~/.claude/tasks/session-<id>/`) and never
>   uploaded. Nothing coordinates across sessions, so a second session has no view of what the
>   first has claimed.
> - **Workflows cannot resume across sessions**, which makes the durable state file the only
>   cross-session coordination point — and it is exactly the thing that is currently
>   single-tenant.
> - **Worktrees** raise the open question of whether `.trd-state/` is shared across a repo or
>   per-tree, and the answer differs for the state file (per-branch) versus a cross-TRD lock
>   (must be repo-wide to be useful).
>
> Item 7 is where this gets designed, because the task graph is where file ownership becomes
> explicit — and cross-TRD conflict detection is the same computation as intra-TRD, just over a
> wider set. Item 8 then inherits whatever item 7 decides. Sketching a solution before the graph
> exists would be guesswork.
>
> One precedent already in the tree: RUNTIME's refresh gate is monotonic specifically so
> teammates on different plugin versions cannot ping-pong committed files. The same class of
> problem, solved narrowly — worth reusing the reasoning, not the mechanism.


This is where the graph actually gets built, and it is the prerequisite for item 8. `packages/core/`
contains `agents/ commands/ hooks/ scripts/ templates/` and **no `lib/` at all**. Meanwhile
`implement-trd.md` is 1,372 lines, much of it describing fully deterministic operations the model re-reads
and re-interprets on every invocation.

Sunstone has `trd-parser.js`, `trd-graph.js`, `phase-tracker.js`, and `cross-trd-deps.js` with 76 test
files behind them. You don't need that whole surface — you need the three pieces carrying the most prose weight:

- **TRD parser** — Master Task List → structured tasks with IDs, dependencies, and phase assignment
- **Task graph** — edges from declared dependencies *and* inferred file-ownership conflicts; eligibility,
  parallel sets, critical path, cycle detection
- **State machine** — `implement.json` transitions, `cycle_position` advancement, retry counting, checkpoints

The graph module pays twice. It replaces prose the model currently re-derives, and it emits exactly what
item 2 needs: a set of `blockedBy` edges to hand to the native task list, and the file-ownership partition
the team commands need for safe parallelism. Today both are inferred from TRD text on every run.

Expect `implement-trd.md` to lose 400–600 lines. Do it incrementally: parser first, verify with the smoke
harness, then the graph, then state.

**Done when:** Three modules exist under `packages/core/lib/` with Jest coverage above 80%;
`implement-trd.md` calls them instead of describing them; the graph module emits `blockedBy` edges consumed
directly by the team commands; smoke harness still green.

---

## Phase F — The architectural bet (Week 11 onward)

### 8. Prototype one implement phase as a dynamic workflow

> Inherits the concurrent-TRD/session/worktree design question raised in item 7 — see the
> callout there. A workflow's inability to resume across sessions makes it more acute, not less.

The workflows documentation reads like a critique of `/implement-trd`. Where subagents, skills, and teams
all have "Claude, turn by turn" deciding what runs next and intermediate results landing in the context
window, a workflow has *the script* deciding and results living in *script variables*. The staged loop —
implement → verify → debug → simplify → verify → review → update — *is* a script, currently expressed as prose.

As a workflow it becomes roughly 80 lines: `pipeline()` per task, `agent({schema})` forcing structured
verify verdicts instead of prose you parse, per-stage `effort` and `model`, and `isolation: 'worktree'`
only where it actually helps. Saved workflows become commands in `.claude/workflows/`, and plugins can ship
a `workflows/` directory — a first-class distribution path you don't have today.

**Three limits protect the existing design, so this is a hybrid, not a replacement.** Workflow resume works
only within the same session — exit Claude Code and the next session starts fresh — so `implement.json`
remains the durable outer loop. There is no mid-run user input, so the STUCK-condition `AskUserQuestion`
path stays in the command. And the script itself has no filesystem or shell access; agents do the work.

The shape: the command stays the resumable outer loop over `implement.json`; each phase's fan-out becomes
one workflow invocation. Prototype on *one* phase against a fixture, compare it to the prose path on five
hand-scored scenarios, and only then decide whether to convert the rest.

**Done when:** One phase runs as a saved workflow end to end; a five-scenario comparison against the prose
path is written down; you have made an explicit keep-or-revert call.

### 9. Native quality gates and worker loops

Three hook events now exist that are purpose-built for what the team commands enforce in prose.
`TaskCompleted` and `TaskCreated` block the transition and return feedback on exit code 2 — that is where
"coverage below threshold" and "tests didn't run" belong, rather than in a command's instructions.
`TeammateIdle` does the same when a worker is about to stop: exit 2 sends feedback and keeps it going,
which is per-worker wiggum with no transcript parsing at all.

Use the right hook type for each. A coverage threshold is arithmetic — a command hook. "Does this task's
implementation actually satisfy its acceptance criteria?" is not, and that is what **agent hooks**
(`type: "agent"`) are for: they spawn a subagent with `Read`, `Grep`, and `Glob` to verify a condition
against the code before allowing the transition. That is a materially stronger gate than any exit code a
script can compute, and it is the natural home for the acceptance-criteria checking item 6 re-scopes
`code-reviewer` toward.

While here: teams support **plan approval** — spawn a worker that stays read-only until the lead approves
its approach, with the lead deciding autonomously against criteria you set. That is a native version of the
review gate the risky-task path describes in prose.

**Done when:** Coverage and DoD gates fire from `TaskCompleted`; at least one gate is an agent hook verifying
acceptance criteria against code; `TeammateIdle` re-engages a worker that stopped with work outstanding.

---

## Opportunistic — do these while you're already in the file

- **Retire the ULTRATHINK keyword.** Eight commands still use it. `effort` is the structured successor and
  is already set on all 13 agents. Redundant at best, conflicting at worst.
- **Re-test teammate auto-delivery.** A 30-minute experiment. `implement-trd-team.md:163` asserts
  auto-re-invocation "silently stalls," but the docs now say teammate messages deliver automatically and idle
  teammates notify the lead, and v2.1.226 fixed headless message parking. If it's fixed, the mandatory
  `ScheduleWakeup` pairing becomes belt-and-braces.
- **Try `memory: project` on the agents.** Writes to `.claude/agent-memory/<agent>/` — committable and
  team-shared. This partly refutes the May conclusion that native memory is inherently per-user and uncommitted.
- **Give the vendored runtime an upgrade story.** The real cost of vendoring isn't duplication, it's that every
  consumer project holds a frozen fork. Stamp the runtime with a version so `/rebase-project` can compute a diff
  instead of inferring one.
- **Use forks where context matters more than isolation.** A fork inherits the entire conversation instead of
  starting fresh, while still keeping its tool calls out of your context. The right primitive for review and
  verify steps that currently need long re-explanation in the delegation prompt.
- **`isolation: worktree` on the read-mostly agents.** The rejection of worktrees for team commands was correct
  and still is. But `code-reviewer` and `verify-app` aren't in that argument.
- **Set `CLAUDE_CODE_SUBAGENT_MODEL` for harness runs.** One env var overrides every subagent's model, making
  smoke-harness runs cheap without editing thirteen agent files.

---

## Deliberately not doing

- **Repairing the statistical eval framework.** Answers a question you rarely ask, at high cost. Item 4 covers
  the common case. Revisit only if item 8's five-scenario comparison proves inconclusive.
- **Sunstone's YAML-to-Markdown generator.** The composition benefit is real — `implement-trd-team` currently
  says "see `/implement-trd` Appendix A" as a note to the model rather than an include. But build item 7 first;
  if extraction shrinks the prose enough, the generator may not earn its keep.
- **Multi-runtime adapters (Codex, OpenCode, pi).** You've chosen Claude Code. Sunstone maintains four generated
  targets for ~39 commands; that is most of where its 535 commits went.
- **Per-package marketplace split.** Sunstone's own `packages/full` exists because the modular split was
  inconvenient in practice. The vendored single runtime is the right call for a hook-heavy framework.
- **beads, metrics telemetry, agent proliferation.** External dependency, phone-home analytics, and ~30 agents
  against your 13. The consolidation to 13 was correct; don't undo it. An orchestrator-routing agent would also
  violate "commands orchestrate, subagents execute."

---

## What this plan is based on

Two inputs. The Sunstone comparison came from reading the current `main` of `Sunstone-Partners/ensemble` —
535 commits, 28 packages — against this repo. The Claude Code items were verified against `code.claude.com`
and the published changelog, covering roughly v2.1.139 through v2.1.227.

Two honest limits. The training data behind this review ends before that window, so everything platform-related
was read from live documentation rather than recalled — which is the right way round, but it means coverage is
only as complete as the pages fetched. And several items rest on documented behaviour not observed running in
this repo: the teammate auto-delivery fix, the exact background tool filter, and agent-hook latency all deserve
a five-minute check before building on them. The findings verified directly in the tree — the dead `TeamCreate`
calls, the stale scaffold path, the stale concurrency limit, and the 12,366-token skill registration — are
stated as facts because they were checked.
