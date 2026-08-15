# Ensemble vNext — Improvement Plan

**Created**: 2026-08-11
**Status**: Item 1 complete (released as 4.1.1). Item 5a done. Item 5b's discipline-hook
conversion done (2026-08-13, `docs/TRD/discipline-judgment.md`); 5b's Wiggum sub-item is
still open, so item 5 as a whole remains open. Items 2–4, 5b–5d, 6–9 open.
**Basis**: Comparison against `Sunstone-Partners/ensemble` + audit of Claude Code features shipped March–August 2026
**Companion artifact**: https://claude.ai/code/artifact/13c683ff-2acf-4ec7-8078-4408126f7602

Eleven changes, in the order they pay off. Sequenced for 1–2 items at a time over roughly ten weeks.

---

## First: don't fix the eval harness

The framework in `test/evals/` — remote sessions, an Opus judge, Welch's t-test across variants —
answers *"is A better than B?"* That is an expensive question, and it isn't the one blocking you.
It last ran on 2026-01-16, and repairing it would consume most of the first month.

The question you actually need answered nine times out of ten is *"did I just break something?"*
That one is deterministic and cheap. Item 4 builds it in about a day, on fixtures you already have.

**Defer the eval harness — do not delete it.** `test/evals/` stays in the tree: the framework
(`run-eval.js`, `judge.js`, `aggregate.js`, `schema.js`), the rubrics, and the YAML specs are all
preserved, and the intent is to bring them back. What is being deferred is *repairing* them now, at
the cost of most of the first month, to answer a question that is not currently blocking anything.

Two things make deletion the wrong call. The specs and rubrics encode real judgment about what good
output looks like — that is the expensive part, and it does not rot the way the runner does. And
item 8 needs a quality comparison by name: its done-condition is a five-scenario comparison of the
workflow path against the prose path. Five hand-scored scenarios will beat a statistical framework
nobody trusts *for that decision*, but the direction of travel is back toward the harness once the
loop it measures has stopped moving.

Practically: leave it where it is, mark it dormant in its own README so nobody mistakes a stale run
for a current one, and keep it out of CI (already the case) so it cannot fail noisily while dormant.
Revisit deliberately — most likely after item 8's keep-or-revert call, when there is a stable loop
worth measuring.

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
| 2 | Remove `TeamCreate`; put groups on the task graph | 1–2 days | Calls a tool that no longer exists | **Done (4.1.2)** |
| 3 | Re-baseline the execution model | 1 day | Silent capability loss, no error | **Done (4.1.3)** |
| 4 | Behavioral smoke harness | 1 day | Makes every later change verifiable | **Done (4.1.6)** — `test/smoke/`, 4 deterministic scenarios |
| 5 | Rebuild the hook layer | 3–4 days | The whole enforcement surface, at once | **5a+5c+5e done; 5b discipline hooks done (4.1.9–4.1.11); Wiggum + 5d open** |
| 6 | `REVIEW.md` + retire reviewer CLI | 1 day | Best value-per-line on the list | |
| 7 | Extract a tested `lib/` — the task graph | 4–6 days | Prerequisite for item 8 | |
| 8 | One phase as a dynamic workflow | 3–5 days | The architectural bet | **Shipped for `/create-prd` + `/create-trd`** — unrun; keep-or-revert call outstanding |
| 9 | Native quality gates and worker loops | 1–2 days | Cheap once 8 lands | |
| 10 | Audit `/create-prd` + `/create-trd` for manufactured requirements | 2–4 days | Fabricated criteria burn whole tasks; 8 instances in one TRD | **Shipped** — generators, agents, refine modes, grounding |
| 11 | Learning loop — retain verified findings across sessions | 2–3 days | 7 probe docs from one session, referenced by nothing | |

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

### 2. Remove `TeamCreate`; put groups on the task graph — ✅ **Done (4.1.2)**

> **Status: DONE.** All dead tool calls removed. `implement-trd-team` was **deleted outright**
> rather than ported — see the decision note at the end of this item. `owner: "self"` fixed, and
> the `async-discipline` auto-delivery claim corrected against a live experiment. The four
> research/review team commands (`create-prd-team`, `create-trd-team`, `harden-trd-team`,
> `verify-trd-team`) keep using teams; they are the correct use case.


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

**Status (2026-08-12): done, with a scope change.** `implement-trd-team.md` was deleted
outright rather than rewritten — its teammates only ever messaged the lead (never each
other, the actual "team" use case), and it depended on `--resume` with
`teammate_session_id` recovery to span sessions, which agent teams cannot do (`/resume`
and `/rewind` do not restore in-process teammates). Parallel implementation returns to
`/implement-trd` once it has a real task graph (plan items 7 and 8); until then the
three-pass workflow is `/implement-trd` (build) → `/harden-trd-team` (harden) →
`/verify-trd-team` (validate).

Removed every reference to `implement-trd-team` from `packages/core/hooks/notify-complete.sh`,
the rules (`autonomy.md`, `command-status.md`, `async-discipline.md`, in both
`.claude/rules/` and `packages/core/templates/claude-directory/rules/`),
`verify-trd-team.md`, `harden-trd-team.md`, `fix-issue.md` (all inlined the orchestration
mechanics that used to say "follows `/implement-trd-team` Step N exactly"), the doc guides
(`ARCHITECTURE`, `CONCEPTS`, `PROCESS`, `INSTALL`, `README`), and
`test/integration/tests/notify-on-complete.test.sh` (dropped from the 18-command sweep
arrays, now 17; example strings repointed to `verify-trd-team`/`harden-trd-team`).
`docs/modernization/2026-05-*` was left untouched as a historical record.

Dropped the dead `TeamCreate`/`TeamDelete` calls and `team_name` parameter from the four
surviving team commands (`create-prd-team.md`, `create-trd-team.md`, `fix-issue.md` ×2,
plus the `team_name` mention in `init-project.md`) in favor of direct
`Agent({subagent_type, name, prompt})` spawns — teams now form automatically on first
spawn, no creation or teardown step. Where `team_name` previously encoded grouping, the
commands now point at task names plus `blockedBy` dependencies on the shared task list
instead.

Also fixed `owner: "self"` in `implement-trd.md` §4.2: the platform reads `owner` as an
agent name and files an unread task-assignment message into a `self` inbox, since no
teammate named "self" exists. Confirmed via grep that no ensemble code (`status.js`, the
state schema) reads or writes an `owner` field — it was purely a parameter passed through
to the platform's `TaskUpdate`, so dropping it is safe. Fixed to
`TaskUpdate({ taskId, status: "in_progress" })` with an inline note explaining why.

Downgraded the `async-discipline.md` "`Agent({team_name})` … has been observed to
silently stall" claim: a live experiment confirmed teammate `SendMessage` auto-delivery
reliably re-invokes the lead, so the paired `ScheduleWakeup` is now documented as
recommended insurance, not a mandatory pairing — updated in the rule and in every
surviving team command's Step 2a/3a.

Two intentional exceptions to the "zero occurrences" greps: `async-discipline.md` still
*names* `TeamCreate`/`TeamDelete`/`team_name` once each, in prose explaining that they no
longer exist / are ignored — removing the names would make the explanation unverifiable.
Several team commands likewise mention `team_name` once in prose ("team_name is accepted
but ignored, so express grouping via task dependencies instead") for the same reason. No
command contains a live `TeamCreate(...)`, `TeamDelete(...)`, or `Agent({team_name: ...})`
call.


#### Decision: `implement-trd-team` deleted, not ported

Porting its group-naming scheme to `blockedBy` would have built on a construct that is wrong for
it. Three independent reasons:

1. **It never used team semantics.** Its teammates only ever messaged the lead — status,
   completion, STUCK. They never messaged each other. Teams exist for peers who challenge each
   other's findings.
2. **Teams cannot do what it was designed to do.** It relied on `--resume` with
   `teammate_session_id` recovery to span sessions, and the docs are flat: *"`/resume` and
   `/rewind` do not restore in-process teammates."* An architectural incompatibility, not a bug.
3. **The docs name its exact workload as the wrong fit:** *"For sequential tasks, same-file
   edits, or work with many dependencies, a single session or subagents are more effective."*

Parallel implementation returns to `/implement-trd` once it has a real task graph — parallel sets
fall out of the graph itself, so concurrency becomes a property of the loop rather than a separate
command. That is items 7 and 8. The three-pass workflow is now
`/implement-trd` → `/harden-trd-team` → `/verify-trd-team`.

Also corrected here: `async-discipline.md` asserted that teammate auto-delivery "has been observed
to silently stall" and mandated a paired `ScheduleWakeup` on every team spawn. A live experiment
disproved it — a teammate's `SendMessage` calls auto-delivered and re-invoked the lead with no wake
involved. The wake is now documented as a recommended fallback. Evidence base is one experiment
plus current docs, so it stays as cheap insurance rather than being removed.

### 3. Re-baseline the execution model — ✅ **Done (4.1.3)**

> **Status: DONE.** Concurrency now derives from the task graph rather than a constant. All 13
> agents declare `background:` with a rationale. Nesting stance decided: permitted to depth 3,
> with `code-reviewer`/`code-simplifier`/`verify-app` restricted via `disallowedTools: Agent`.
> The teammate `skills:` gap was already closed by RUNTIME-D004's managed body block.
>
> One finding narrowed the work: the "background subagents lose the task tools" problem does
> not affect this framework, because all 23 Task-tool calls in `implement-trd` are
> orchestrator-side and no agent definition references them. That invariant is now written into
> `constitution.md` so it stays true deliberately rather than by accident.

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

**Sub-item status — check this before claiming item 5 is done.**

| | What | Status |
|---|---|---|
| 5a | Retire `learning.sh`, `save-remote-logs.js`, `permitter` | ✅ 4.1.0 |
| 5a | Router decision (was a modification, not a deletion) | ✅ 4.1.4 — kept, made conditional, rewritten |
| 5b | Discipline hooks → `type: "prompt"` hooks | ✅ done (2026-08-13, `docs/TRD/discipline-judgment.md`) |
| 5b | `transcript_path` → `last_assistant_message` (3 hooks) | ✅ 4.1.7 |
| 5b | Wiggum: re-inject current state + restated completion promise | ❌ **open** |
| 5c | `resolve-project-root` prefers `$CLAUDE_PROJECT_DIR` | ✅ 4.1.4 |
| 5c | Formatter: npx cost + `/init-project` installing what it configures | ✅ 4.1.5 / 4.1.6 |
| 5d | Adopt `InstructionsLoaded` | ❌ **open** |
| 5e | Discipline guard on `SubagentStop` | ✅ 4.1.7 |
| 5e | Scheduled-nudge pattern documented (no timeouts, per decision) | ✅ 4.1.7 |
| 5e | Dispatch ledger (`SubagentStart`+`SubagentStop`) + `--open` reporting | ✅ 4.1.8 |
| 5e | `/implement-trd` reads the ledger on every RESUMED turn | ✅ 4.1.8 |
| 5e | *Follow-up:* `--open` `type=` column shows the agent NAME for named dispatches (payload `agent_type` carries name-or-type, never both). Cosmetic; key is `agent_id` and correct. Deferred — `docs/TRD/discipline-judgment.md` §8 forbids touching `dispatch-ledger.js` | ⏸ deferred |
| 5b | *Follow-up:* async-discipline covers false CLAIMS but not silent NON-DELIVERY. An agent with real machinery in flight can end a turn having delivered nothing, and no guard fires — the claim was true, the omission is the failure. Proposed norm: "async machinery in flight excuses waiting; it does not excuse silence about what is already finished." Deferred — `docs/TRD/discipline-judgment.md` §8 forbids changing what the rules SAY | ⏸ deferred |

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

**5b. Rebuild the survivors on the right primitives.** ✅ **Discipline-hook conversion done,
2026-08-13** — see `docs/TRD/discipline-judgment.md` for the full build. Below is the original
planning rationale, kept for the "why," with the actual outcome noted where it diverged: the
three discipline hooks (`async-discipline.js`, `autonomy-discipline.js`, `subagent-discipline.js`)
are now `hookType: "prompt"`, evaluated by the platform's own judge — the "small fast model"
framing below undersold it; the shipped judge is a full evaluator call, and latency was measured
and explicitly withdrawn as an acceptance criterion (TRD §6.1.1) rather than assumed cheap. The
"split responsibility" idea (thin command hook for the deterministic half, prompt hook for the
semantic half) was investigated and found impossible — hooks on one event run as independent
generators with no way for one to gate another (TRD §3.4) — so the escape valves
(`background_tasks`/`session_crons`) live inside the judge prompt instead (TRD §2.2, "Shape A").
The regex phrase-matchers below **are deleted** (4.1.11, DISC-B009), which is what item 5b's
original framing assumed. They were briefly retained as the `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE`
rollback path, then dropped together with that lever once it was found the `.js` files it pointed
at are never delivered to a scaffolded project — the lever would have emitted command hooks with
no detection logic behind them (`docs/TRD/discipline-judgment.md` §3.4, §4.4.1). A frozen copy of
the battery survives only as a scoring fixture at `test/discipline-corpus/detectors/regex.js`, so
the published baseline stays reproducible.

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
- **`formatter.sh`** works — verified by feeding it a payload and watching it reformat. The real
  issue is not the hook, it is that **`/init-project` Step 10 does not install the formatter it
  configures.** Step 10 writes `.prettierrc` and then *"show install command and ask user to
  install."* So a scaffolded JS/TS project has the config and not the tool, and `npx prettier` is
  the only branch of the hook that ever fires for it.

  That makes the npx fallback load-bearing rather than a nicety. 4.1.4 briefly gated it behind an
  opt-in on the strength of a **single cold-cache measurement (~2s)**; warm npx is **~0.6s**, and
  the gate turned formatting off entirely for exactly the projects the framework scaffolds.
  Reverted in 4.1.5.

  The decision to make here is upstream: either Step 10 installs the formatter (which contradicts
  its current "ask the user" phrasing, and is arguably the autonomy rule's kind of unnecessary
  checkpoint), or the hook owns the npx path honestly and the docs stop implying a local install.
  Pick one; today the framework does neither.

  Separately, the hook still rewrites files silently after the model edits them, which can surface
  as diffs nobody in the conversation authored.

**5e. Guard the subagents, not just the main session.**

The discipline hooks only run on `Stop`, so they protect the orchestrator and nothing else.
Three subagents in one session ended with "I'll wait for the monitor notifications to arrive"
and "Waiting for background scenario completions" — burning ~240k tokens across 179 tool calls
and returning nothing. Precisely the failure `async-discipline` exists to catch, in the place
it does not look.

`SubagentStop` is a better position for this guard than `Stop`:

- It fires **in the parent session** when a subagent finishes.
- It receives **`last_assistant_message`** — the field 5b wants anyway.
- It **can block**: *"Prevents the subagent from stopping"*; exit 2 and the subagent continues.
- `status.js` already runs there, so the wiring exists.

And the rule is stronger for subagents than for the lead. **`ScheduleWakeup` is removed from
every subagent** (first tool filter, foreground and background alike), so a subagent claiming
deferred work is *definitionally* wrong — there is no mechanism by which it could come back.
The main-session hook has to check `background_tasks`/`session_crons` because the claim might
be true; for a subagent it never is. A fuzzy semantic judgment becomes near-deterministic.

**Verified empirically (2026-08-12), because the hooks reference is wrong or silent on all four
points.** A probe hook that returned `{"decision":"block","reason":...}` on `SubagentStop`:

| Docs say | Actually observed |
|---|---|
| `decision`/`reason` "not explicitly documented" for SubagentStop | **Works.** The block took effect and the subagent resumed |
| exit-2 stderr goes "to the user only", Claude doesn't see it | **The JSON `reason` reaches the subagent** — its next turn answered the reason's content directly |
| "no `stop_hook_active` field or similar mechanism" | **`stop_hook_active` IS in the payload** — loop prevention is available |
| `background_tasks` / `session_crons` "not mentioned" for SubagentStop | **Both present**, so the deterministic half works here too |

Full observed payload: `agent_id`, `agent_transcript_path`, `agent_type`, `background_tasks`,
`cwd`, `effort`, `hook_event_name`, `last_assistant_message`, `permission_mode`, `prompt_id`,
`session_crons`, `session_id`, `stop_hook_active`, `transcript_path`.

**It continues rather than redispatches**, which is the better behaviour: the same subagent
resumes with its existing context and the block reason as feedback, instead of a fresh agent
losing whatever work was already done. So `async-discipline.js` can be reused almost verbatim
on `SubagentStop` — same output shape, same fields, plus `stop_hook_active` as the loop guard
and `agent_type` for per-agent tuning.

**Hung subagents are a different problem, and a hook cannot solve it.** If a subagent never
returns, `SubagentStop` never fires. There is no documented watchdog, heartbeat, or timeout
hook. `implement-trd` documents a 30-minute task timeout as PROSE, which means the model has
to notice and act — a suggestion, not a guard. The fix is orchestrator-side: bound every
dispatch, the way `test/smoke/lib/` wraps each invocation in `smoke_timeout`. Do this when the
orchestration moves into code (items 7/8), where a timeout is one argument rather than a
paragraph the model must remember.

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

> **Re-read the Sunstone fork before writing any of this.** The original comparison was a survey; this
> item needs a close reading of specific modules, with three questions in mind:
>
> 1. **How does it build the task graph deterministically?** vNext infers dependencies from TRD prose on
>    every run. Sunstone has `trd-parser.js` and `trd-graph.js` with tests behind them — the question is
>    what its parser demands of the TRD *format*, because a graph is only as deterministic as its input.
>    If it requires structured task declarations, that is a change to `/create-trd`, not just to the parser.
> 2. **How does it verify completed output against requirements?** This is the weakest link in vNext's
>    loop: `verify-app` runs tests, `code-reviewer` reads code, but nothing systematically checks the
>    delivered thing against the acceptance criteria that specified it. If Sunstone has a mechanism here,
>    it is worth more than the graph work.
> 3. **`cross-trd-deps.js` is directly relevant to the open coordination question above.** The module name
>    says it reasons about dependencies *between* TRDs — exactly the multi-TRD problem filed in this item.
>    Read it before designing ours.
>
> Adopt selectively and with evidence, not wholesale — the plan's "deliberately not doing" list already
> rejects Sunstone's multi-runtime adapters and per-package marketplace split for good reasons.
>
> **The baseline is no longer on disk.** `CLAUDE.md` names `~/dev/ensemble` as the read-only source,
> but that directory does not exist on this machine as of 2026-08-12 — the original comparison was done
> against a checkout that has since gone. Clone `Sunstone-Partners/ensemble` fresh before starting, read
> only, and note that its `main` will have moved since the survey.

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

### 8. Prototype one phase as a dynamic workflow — retarget to `/create-trd`

> **Retargeted 2026-08-14.** This item was scoped to an `/implement-trd` phase. **`/create-trd`
> is the better prototype**, and it is available now rather than after item 7.
>
> Item 8 names three limits that keep workflows a hybrid rather than a replacement. All three
> bind `/implement-trd`. **None binds `/create-trd`:**
>
> | Limit | `/implement-trd` | `/create-trd` |
> |---|---|---|
> | Resume only within one session | Binds hard — `implement.json` must stay the durable outer loop | Doesn't bite; single-session command |
> | No mid-run user input | Binds — the STUCK `AskUserQuestion` path stays in the command | Doesn't bite; `autonomy.md` forbids it asking at all |
> | Script has no filesystem/shell access | Binds — the loop is all file mutation | Doesn't bite; agents do the reads and writes |
>
> **It also does not depend on item 7.** That prerequisite exists because `/implement-trd`
> needs the task graph to know what to fan out. `/create-trd` is a fixed five-stage pipeline
> (resolve → author → ground → verify ×6 → reconcile), already fully specified by item 10.
>
> What the script buys, concretely:
> - **`agent({schema})` enforces the findings contract.** Item 10 currently states it as prose
>   and hopes verifiers honour it; a schema validates at the tool-call layer and retries on
>   mismatch.
> - **The findings-to-disk mechanism becomes unnecessary.** It exists only to keep verifier
>   output out of the orchestrator's context; in a workflow, results live in script variables
>   and never enter a model's context except where the script passes them.
> - **Sequence becomes `await`, not prose** a model may reorder or skip.
> - **Nesting stops being a governance question** — the script fans out, so no agent spawns
>   another and `constitution.md` §1 simply does not apply.
>
> Cost: `create-trd.md` is 956 lines doing two jobs. Only the orchestration half belongs in a
> script; the content rules (typing, severity sourcing, grounding axes) move into agent
> prompts, where they arguably belong. There are **no workflows in this repo today** and the
> tooling is unverified here.
>
> **Status 2026-08-14: both converted.** `.claude/workflows/create-trd.js` (5 stages, 6
> parallel verifiers) and `.claude/workflows/create-prd.js` (3 stages, 3 verifiers). Commands
> now invoke `Workflow({name})` and keep the prose path as an explicit fallback, so a project
> without the scripts still runs — and the COMMAND COMPLETE summary states which path was
> taken, so a surprising result can be attributed.
>
> **Both are unrun.** The keep-or-revert call this item exists to make is still outstanding,
> and needs a real invocation against a real PRD.
>
> **Code review, 2026-08-14 (`code-reviewer` on the scripts).** Ten findings, nine fixed:
> null from a dead `agent()` was mapped into a truthy object, so `filter(Boolean)` never
> dropped it — every "incomplete coverage" warning was unreachable, and an all-verifiers-died
> run would have emitted *"NO ACTION — every objective traces to a source"* over a completely
> unverified TRD; `conformance` was missing from `create-trd`'s `check` enum, so that
> verifier's findings could never validate; `id`/`line` were required on a schema whose
> highest-value verifier (omission) produces findings that by construction have neither;
> unguarded null dereferences in every sequential stage, the reconcile one crashing *after*
> it had already edited the artifact; both author prompts pointed at
> `packages/core/commands/*.md`, a path that does not exist in any scaffolded project, so the
> binding typing rule reached the agent through no channel at all.
>
> **Open, unresolved:** both `technical-architect` and `product-manager` declare
> `background: true` (set deliberately in item 3). `agent()` awaits a result inline, and it is
> unverified which wins when a background-declared agent is driven from a workflow. This is
> the most likely first-run failure and should be tested before the keep-or-revert call, not
> reasoned about.
>
> Delivery gap found and fixed while wiring this: `scaffold-project.sh` had no `copy_workflows`,
> so a scaffolded project would have received the commands but not the scripts and silently
> taken the fallback forever — the same shape as the five hook files that never shipped before
> 4.1.1. Added, with `--refresh` semantics (updates what is present, never adds), a
> `workflows=` field in `REFRESH_SUMMARY`, and `packages/full/workflows/` symlinks.
>
> **Sequencing: validate item 10 first.** The conversion re-hosts the same prompts under a
> different executor. If the checks don't catch 7 of 8, a workflow faithfully runs wrong
> prompts in the right order; if they do, the passing fixture becomes the regression test that
> makes conversion safe. Converting first means converting blind, unable to distinguish a
> conversion bug from a prompt bug.



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

### 10. Audit `/create-prd` and `/create-trd` for manufactured requirements

> **Status: SHIPPED.** The root cause was substantially more mechanical than either design
> doc assumed — see "The generators were manufacturing it" below. Delivered: generator
> surgery on `/create-prd` + `/create-trd`, the typing rule in structured
> (parser-consumable) position, brownfield grounding as a producer feeding
> `/implement-trd`'s delegation template, the verifier wave, action-register readouts,
> mode-conditional refine commands, and the retirement of `/create-prd-team` and
> `/create-trd-team`. Designs: `item-10-prd-path.md`, `item-10-trd-path.md`.

#### The generators were manufacturing it

Both designs treated manufacture as a behavioural problem, to be corrected with verifier
subagents and readouts. Reading the actual generator commands found much of it was a
**template** problem, with a one-line root cause for the dominant failure:

`create-trd.md` hardcoded `Unit Tests ≥80%` / `Integration Tests ≥70%` while
`constitution.md` says `unit >= 60%, integration >= 50%`. **The template contradicted the
constitution.** `item-10-trd-path.md` §3.1 measured that 5 of 10 unsourced objectives — half
of everything found — were coverage targets above the constitution floor, and attributed it
to authors inventing strictness. They were not; the template was dictating it. The
corroborating detail was already sitting in §3.1 unexplained: *"the one TRD that used the
constitution's numbers verbatim is one of the two with zero unsourced objectives"* was
simply the one author who ignored the template.

`implement-trd.md`'s delegation template carried the same `or 80` / `or 70` fallback, so
three coverage numbers were in circulation. Now there is one: `constitution.md`.

The same shape ran through both generators — `| [e.g., Response time] | [e.g., < 200ms] |`
shipped as a template anchor, a pre-filled `WCAG 2.1 AA compliance` line, required
Performance and Risk tables, *"All sections are required unless marked (optional)"*, and
diagram **quotas** ("at least 3", "at least 2"). A quota is an instruction to manufacture.

Also confirmed, and broader than §3.5 claimed: `grep -icE
"reuse|deprecat|existing implementation|dead code"` returned **0** across both generator
commands *and* both agent definitions, not just the commands.

**Lesson for the remaining items: read the artifact before designing machinery to correct
its output.** A large share of the measured failure was deletable template text.


**The most consequential failure mode observed so far is not that something breaks or goes
unbuilt. It is that hours and tokens are spent solving problems the user never asked about,**
because the model's priors say an artifact of this type "should have" a section — and once a
requirement is written into a PRD or TRD, everything downstream treats it as real.

**The evidence is this project's own `docs/TRD/discipline-judgment.md`.** Acceptance criterion
A5 required "added latency at turn end, p95 ≤ 2000 ms". No user asked for it. No data motivated
it. It was written because an acceptance table looked incomplete without a latency row. It then
consumed a full task (`DISC-T002`), 100 timed samples, two incorrect analyses, a revision into
three sub-criteria to rescue it, and finally a withdrawal — after the user asked the only
question that mattered: *"what's the impact of this latency?"* The answer was none. The hook fires
after the assistant's text has streamed, so the cost lands inside the seconds a human spends
reading a message that already arrived, and in autonomous runs nobody is watching.

Not an isolated slip. The same TRD's §2.3 asserted a `no-result-returned` violation class as
"the capability that justifies switching", on a mis-reading of the motivating incident; measuring
it found **one** real instance in 1,274 transcripts, and the criterion built on it (A4) had to be
downgraded from gate to observation. Its §3.1 corpus floors were set at aspirational numbers that
real data could not supply, and §3.4 specified a runtime kill switch that is impossible for the
mechanism it governs. **Eight fabrications in one document** (an earlier revision of this line said four; the
full classification in `item-10-trd-path.md` §1 found eight), each caught only after work had been
spent on it.

The generator commands are where this originates, so that is where to look.

**What the audit should cover:**

- `/create-prd`, `/create-trd`, `/refine-prd`, `/refine-trd`, plus `docs/templates/` and the
  `product-manager` / `technical-architect` agent prompts.
- **Templates are the main suspect.** A section heading in a template is an instruction to fill
  it. If the template has "Non-Functional Requirements" or an acceptance-criteria table, the model
  will populate them whether or not the feature has any — and a plausible-sounding number is the
  easiest thing to produce.
- Every requirement should be **traceable to something the user said, a measured fact, or a
  documented constraint.** Requirements that trace only to "artifacts like this usually have one"
  are the target.
- Prefer **omission over invention**: a TRD with no latency criterion is correct when latency was
  never raised. An empty section is a stronger signal than a fabricated one.
- Consider requiring **provenance per acceptance criterion** — user request, measurement, or
  named constraint — so an unsourced criterion is visible at authoring time rather than after a
  task has been spent proving it.
- The cost is asymmetric and worth stating in the command prompt: a missing requirement surfaces
  as a question, while a fabricated one silently consumes a task, and everything downstream —
  `spec-planner`, `/implement-trd`, `verify-app` — treats it as legitimate because it is written
  down.

**Watch for the inverse.** Under-specifying is also a failure, and the same TRD shows it: the
corpus was text-only when the design's central mechanism resolves escape valves from
`background_tasks`, so the judge was scored on strictly less information than it has in
production. The goal is requirements that trace to something real — not fewer requirements.

#### `/refine-trd` is a ratchet — this is where the challenge belongs

**`/refine-trd` cannot currently remove anything.** Its Phase 1 interview asks five questions and
every one asks what is *absent*: missing technical considerations, granular *enough*, opportunities
we *missed*, *comprehensive* test strategy, concerns *not addressed*. Phase 2 is titled
**"Enhancement"** — clarify, refine, strengthen, update. Its "Validation" step checks that
requirements *align* and are *accurate*, never that they are *warranted*. **Deletion is not a
possible outcome of the command.**

Run it against a TRD carrying fabricated requirements and it makes things worse. Asked "are there
performance concerns not addressed?", the honest answer adds a latency criterion — **which is
precisely how `discipline-judgment.md`'s A5 came to exist.**

This is the right home for the challenge, for a reason beyond convenience: `/refine-trd` is the
one command explicitly exempt from autonomy discipline because it is *intentionally interactive*.
Questioning the user is already its purpose. `/create-trd` should avoid manufacturing requirements;
`/refine-trd` should be able to *remove* them.

**Add a challenge pass, and make deletion a first-class outcome.** For each requirement, four
checks — derived from the seven failures in `discipline-judgment.md`, which failed in five
distinct ways:

| Check | Catches | This TRD's instance |
|---|---|---|
| **Provenance** — traces to user input, a measurement, or a named constraint? | Fabricated, misread, aspirational | A5 latency; §2.3's premise; §3.1 floors |
| **Mechanism** — can this actually be built as specified? | Impossible requirements | §3.4's runtime kill switch, impossible for a prompt hook |
| **Consistency** — does it contradict a sibling requirement? | Individually-sound conflicts | B009 deleting the code D5's rollback lever needs |
| **Threshold** — is the *severity* sourced, not just the requirement? | Invented strictness | A2's "zero tolerance", justified by rhetoric; the real cost of a false positive is one turn |

The last two matter most because a provenance readout alone misses them. B009 and D5 were **both
legitimately derived**. A2 traces honestly to "don't break the repo" — what was invented was *how
strict it had to be*, and an unexamined threshold is un-negotiable in the wrong direction.

**Four of this TRD's seven bad requirements were caught only because a human asked a direct
question** — "what's the impact of this latency?", "why are we so concerned with false positives?",
"does it cover the case it was built for?". Nothing in the framework asks those. `spec-planner`,
`/implement-trd` and `verify-app` all treat a written requirement as legitimate by construction,
so a fabricated one is executed rather than examined.

#### Interactive and non-interactive modes for `/refine-trd` and `/refine-prd`

**Both refine commands should gain an explicit non-interactive mode.** Today they are
unconditionally interactive — `/refine-trd`'s Phase 1 says *"User Interview (REQUIRED)"* and
*"Wait for user responses before proceeding"* — and `autonomy.md` exempts them wholesale on that
basis: *"Applies to every workflow command EXCEPT `/refine-prd` and `/refine-trd` (which are
inherently iterative — soliciting user input is their purpose)."*

That exemption is why the challenge pass cannot currently run where it is most needed. A
fabricated requirement is *most* dangerous in an unattended run, because there is nobody to ask
"what's the impact of this latency?" — and four of this TRD's seven bad requirements were caught
only by exactly that kind of question.

| Mode | Behaviour |
|---|---|
| **Interactive** (today's behaviour, stays the default when a human invoked it) | Run the four checks, present findings, ask, apply the user's decisions. Deletion becomes a first-class outcome alongside enhancement. |
| **Non-interactive** | Run the same four checks and resolve deterministically: **unsourced requirements are removed** and listed in the readout; contradictions between requirements are a **STUCK** condition, since resolving them requires a judgment call; mechanism failures are reported with the evidence. No questions, one readout at the end. |

**Consequence that must not be missed: the autonomy exemption has to become conditional on mode,
not on command name.** A non-interactive `/refine-trd` that stops to ask questions is precisely
the defensive-checkpointing anti-pattern `autonomy.md` exists to forbid, and today's blanket
exemption would permit it. Interactive mode keeps the exemption; non-interactive mode obeys
autonomy discipline like every other command, with `AskUserQuestion` restricted to the four
documented cases — under which "this requirement has no source" is *not* a valid reason to ask,
because the deterministic resolution is to remove it and say so.

The non-interactive mode is also what lets the challenge pass be *composed* — `/implement-trd`
could run it against a TRD before executing, so a fabricated requirement is caught before a task
is spent proving it rather than after. That is the sequence that would have saved the most work in
this run.

#### The mechanism: a derived-requirements readout

**Fleshing out the PRD is the TRD's job, not a defect.** A TRD that adds nothing has failed. The
problem is not that requirements get added — it is that the additions are invisible without
reading 30–40 pages, so a fabricated one and a genuinely necessary one look identical.

So the guard is not suppression. It is a **short readout of everything the TRD added that the
PRD did not say**, emitted when `/create-trd` completes, reviewable in a minute or two.

Classify every TRD requirement into three buckets and print only the last two:

| Bucket | Meaning | In the readout |
|---|---|---|
| **Stated** | Traces directly to PRD text | No — needs no review |
| **Derived** | Follows from the PRD plus a *named* source: `stack.md`, `constitution.md`, an existing pattern in the codebase, a measured fact | **Yes** — one line, with the source named |
| **Unsourced** | Neither. Present because artifacts of this type usually have one | **Yes — flagged for deletion** |

Sketch:

```
DERIVED REQUIREMENTS — not stated in docs/PRD/<feature>.md

  Derived (7)
    NFR-2  Postgres for persistence          <- stack.md
    B-4    Idempotency keys on the webhook   <- existing pattern, packages/api/webhooks/
    T-1    Contract tests for the public API <- constitution.md quality gates
    ...
  Unsourced (2)  ← review these first
    A5     Latency p95 <= 2000ms             <- no source
    NFR-9  99.9% uptime target               <- no source
```

**Test it against the four known fabrications in `docs/TRD/discipline-judgment.md`.** A5 and the
§3.1 corpus floors would have printed as *unsourced* and died in seconds. §2.3's
`no-result-returned` premise would have printed as *derived — from the motivating incident*,
which is exactly the claim that turned out to be a mis-reading, and seeing it stated in one line
next to its source is what makes that checkable. §3.4's kill switch would have printed as
*derived — from D5*, correctly: its defect was implementability, not provenance, so the readout
would not have caught it. **Three of four, cheaply.**

Design constraints that matter:

- **Length is the whole point.** If the readout runs to three pages nobody reads it and the guard
  is worthless. Aim for one screen. If a TRD produces 40 derived requirements, the *count itself*
  is the finding — surface it as one.
- **Unsourced first**, and stated as deletion candidates rather than neutral entries. The default
  should be removal, not discussion.
- **One line each.** The readout is a review surface, not a summary of the TRD.
- It belongs in `/create-trd`'s `COMMAND COMPLETE` output, not a separate file nobody opens.
- `/refine-trd` should re-emit the delta for anything it adds, for the same reason.

**Done when:** the generator commands and templates instruct against unsourced requirements;
acceptance criteria carry provenance; `/create-trd` emits a one-screen derived-requirements
readout with unsourced items flagged first; and a re-read of an existing PRD/TRD pair produced by
the current commands identifies which of its requirements would not survive that test.

---

### 11. Learning loop — stop re-deriving what a previous session proved

**Sessions in this project produce durable, verified knowledge and then lose it.** The next
session starts from the same wrong priors, spends the same tokens re-establishing the same facts,
and — because the platform docs are unreliable here — sometimes gets them wrong again.

**The evidence is immediate.** `docs/modernization/probes/` now holds **seven** findings
documents from a single session: prompt-hook schema and payload fields, hook composition
semantics, the loop-bound constant, reason delivery, kill-switch mechanism, timeout behaviour,
live loop-safety. **None of them is referenced by `CLAUDE.md` or any rules file.** A new session
will not know they exist. Several were expensive — the timeout probe alone required forcing
aborts and reading `--debug-file` internals, because `--print` cannot distinguish "allowed
cleanly" from "timed out then allowed".

Concrete facts currently at risk of being re-derived from scratch:

- `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` defaults to 8; termination fires on cap+1
- Hooks on one event run **concurrently**, OR-composed — no hook can gate another
- `if` on `Stop`/`SubagentStop` is a tool-call matcher, so any non-empty value **silently
  disables the hook** — an active footgun
- A prompt-hook timeout resolves to **allow**; default timeout 30 s (prompt), 60 s (agent)
- `agent_type` carries the agent's **name** when one was given, the type otherwise — never both
- `stop_reason: tool_use` on a transcript's last text record means the turn **continued**; that
  text was never a final message
- Both the hard-cap path and the timeout path are **invisible under `--print`** — empty stdout,
  nothing in the transcript

**Why the existing mechanisms don't cover this.** `/update-project` is manual, aimed at
`CLAUDE.md`, and captures project learnings rather than platform facts. `learning.sh` was retired
in 4.1.0 because nothing invoked it. Memory files exist and help, but nothing routes a *verified
platform fact* into a place the next session reliably reads.

**Design constraints that make this harder than it looks:**

- **Version-scope everything, or the loop manufactures the problem it solves.** Every finding
  above is true of CLI **v2.1.229**. Recorded without a version and a verification date, they
  become exactly the stale confident claims that caused this session to re-probe in the first
  place. A finding needs: the claim, the version, the date, and **how it was verified**
  (observed / source-traced / inferred) — that last distinction repeatedly mattered here.
- **Respect the governance split** (`constitution.md`). `CLAUDE.md` is the fast layer,
  `constitution.md` and `stack.md` are slow and require confirmation. A learning loop must not
  quietly edit the slow layer, and per prohibited-pattern 5 nothing should auto-commit.
- **Capture corrections, not just discoveries.** This session corrected published claims of its
  own four times. A loop that records only new facts and not *retractions* leaves the wrong
  version in circulation alongside the right one.
- **Recurring failure modes are learnings too.** Three separate agents ended turns with completed
  work undelivered; the orchestrator emitted a `DISPATCHED` banner with nothing dispatched. Those
  recur across sessions and currently nothing accumulates them.
- **Cost discipline.** Loading every historical finding into every session is how the always-on
  budget got to ~12.4k tokens/turn before item 1. An index that points at detail, or
  progressive disclosure, beats inlining.

**Interaction with item 10.** These are the same failure viewed from both ends — item 10 stops
work being spent on requirements that were never real; item 11 stops work being spent
re-establishing facts that already are. Both are about tokens burnt on things nobody needed.

**Done when:** a verified platform finding recorded in one session is available to the next
without a human remembering it exists; findings carry version, date, and verification method;
retractions propagate; and the always-on cost of the mechanism is measured rather than assumed.

---

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
