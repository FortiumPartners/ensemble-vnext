# Ensemble vNext — Improvement Plan

**Created**: 2026-08-11
**Status** (refreshed 2026-08-21): Items 1–4, 9a, 10 shipped. Item 5 open on 5d only. Items 6, 7, 8, 11, 12 open — 12 partly done in 4.1.18. HISTORICAL TEXT BELOW may lag; the table above is authoritative.

Item 1 complete (released as 4.1.1). Item 5a done. Item 5b's discipline-hook
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
| 5 | Rebuild the hook layer | 3–4 days | The whole enforcement surface, at once | **5a+5b+5c+5e done. Only 5d (`InstructionsLoaded`) open** |
| 6 | `REVIEW.md` + retire reviewer CLI | 1 day | Best value-per-line on the list | |
| 7 | Extract a tested `lib/` — the task graph | 4–6 days | Prerequisite for item 8 | |
| 8 | One phase as a dynamic workflow | 3–5 days | The architectural bet | **Shipped for `/create-prd` + `/create-trd`** — unrun; keep-or-revert call outstanding |
| 9 | Native quality gates and worker loops | 1–2 days | Cheap once 8 lands | **RETIRED 2026-08-16 → item 9a** |
| 9a | Functional verification of delivered software | 3–5 days | A green suite says nothing about whether a user can do what the PRD promised | **Shipped 4.1.18** — `--verify`, `/verify-build`, live-verified 20/20 |
| 10 | Audit `/create-prd` + `/create-trd` for manufactured requirements | 2–4 days | Fabricated criteria burn whole tasks; 8 instances in one TRD | **Shipped** — generators, agents, refine modes, grounding |
| 11 | Learning loop — retain verified findings across sessions | 2–3 days | 7 probe docs from one session, referenced by nothing | |
| 12 | Command-fix delivery — get a framework bug fix into existing projects | 2–3 days | Every bug found in a shipped command is fixed in `packages/core` and reaches nobody until a rebase that was itself broken | **Partly done 4.1.18** — see §12 |

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
assistant message; `resolve-project-root` prefers `$CLAUDE_PROJECT_DIR`; every surviving hook loads and exits 0 on a
minimal payload (asserted in item 4's harness); item 1's hook manifest lists exactly the hooks that
remain.

> **Why item 9 is not merged here.** Item 9 adopts *new* platform hook events — `TaskCompleted`,
> `TaskCreated`, `TeammateIdle`, and agent hooks — as quality gates. That is additive work on a
> different surface, and it depends on the task graph (item 7) and the team-command rework (item 2)
> existing first. This item is about the hooks that exist today. Sequencing, not subject matter,
> separates them.

### 6. Ship a `REVIEW.md`; retire the reviewer CLI — ⛔ **RETIRED 2026-08-16**

> **RETIRED — it no longer applies.** `REVIEW.md`'s only consumer is Anthropic's managed Code
> Review service, which is not enabled on this repo and is not part of item 8's shipped design.
> A file nothing reads is not worth shipping, and "inert" is not operationally different from
> "retired": either way nobody does the work.
>
> The one part with standalone merit is **done** — `packages/reviewer/` deleted 2026-08-16, no
> live references. The other part (re-scope `code-reviewer.md` toward acceptance-criteria
> verification) is superseded: `/audit-build` owns that job now, and the agent's surviving role
> is the three-lens hardening fan-out at Step 7.1.
>
> **Why it was wrongly promoted to a blocker**, kept because the mistake is instructive: the
> framing below conflated two different reviewers.
>
> - **`REVIEW.md` is read by Anthropic's managed Code Review** — the service that reviews pushes
>   to a PR branch. The 2026-08-15 qualification already verified none is enabled on this repo.
> - **Item 8 shipped using the LOCAL `/code-review` skill**, invoked in-loop: per phase via the
>   gate's `reviewPrompt`, and once over the full branch at Step 7.2. Confirmed in the 2026-08-16
>   ledger — a workflow agent really did call `Skill({skill: "code-review", args: "high <sha>"})`.
>   **The local skill does not read `REVIEW.md`.**
>
> So item 8's review design does NOT depend on this item, and shipping `REVIEW.md` would not have
> changed what the per-phase reviewer knows. The two remaining parts of this item stand on their
> own merits and neither is urgent:
>
> - delete `packages/reviewer/cli/review.js` — still correct, still trivial
> - re-scope `code-reviewer.md` toward acceptance-criteria verification with `ReportFindings`
>   output — **partly superseded**: `/audit-build` now owns acceptance-criteria checking, and the
>   agent's surviving role is the three-lens hardening fan-out at Step 7.1
>
> Ship `REVIEW.md` if a managed reviewer is ever enabled. Until then it is a file nothing reads.
>
> **The transferable lesson** is the conflation itself. This project has now made the
> local-vs-managed `/code-review` mistake twice in one day: once when I claimed I could not invoke
> `/code-review` (the `ultra` restriction applies to the cloud tier, not the local skill), and once
> in the framing corrected here. When a plan entry names "the built-in reviewer", it must say WHICH.

> **Superseded framing, retained for the record — promoted 2026-08-15 to a hard dependency of item 8.** Item 8 removes our `code-reviewer`
> agent from the implement loop and hands code review to the built-in reviewer running on
> every push to the PR branch. `REVIEW.md` then becomes the ONLY channel through which this
> project's Quality Gates, Definition of Done and prohibited-pattern table reach the reviewer
> doing the work. It is no longer one improvement among several — item 8's review design does
> not function without it.
>
> **Qualified 2026-08-15:** `REVIEW.md` only pays off if a reviewer that reads it is actually
> enabled on the repo. Verified: none is today — no Claude review app in `.github/`, and the
> one existing PR was reviewed by `coderabbitai`. Ship `REVIEW.md` regardless (it costs
> little and is mostly relocating constitution content), but the enablement decision in item
> 8 is what determines whether anything consumes it.

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

### 7. Extract a tested `lib/` — build the task graph — **MOSTLY DELIVERED 2026-08-16; coordination design DEFERRED**

> **Status, measured against this item's own "Done when" clauses:**
>
> | Clause | Verdict |
> |---|---|
> | Three modules under `packages/core/lib/`, Jest coverage >80% | **MET** — 96.16% stmts overall (implement-state 100%, task-graph 99.28%, trd-parser 94.50%), 117 tests |
> | `implement-trd.md` calls them instead of describing them | **MET** — 4 `require()` calls; command 1466 → 1042 lines (the item predicted losing 400–600; actual 424) |
> | Graph emits `blockedBy` edges consumed by the team commands | **SUPERSEDED** — the graph emits exactly that, including file-ownership edges, but `/harden-trd-team` and `/verify-trd-team` were deleted by ITR-B012. The consumer is now `implement-trd.md`. The intent (the graph is consumed, not re-derived from prose) holds |
> | Smoke harness still green | **UNVERIFIED** — the harness runs real Claude sessions and item 4, which builds it, is itself still open |
>
> Delivered as a side effect of item 8 rather than before it, which inverts the intended order.
>
> **DEFERRED, owner decision 2026-08-16: the open design question below.** Cross-TRD
> coordination — two TRDs racing the same files, worktree scope for `.trd-state/`, reading
> Sunstone's `cross-trd-deps.js` — is NOT done and is not scheduled. Item 8 answered part of it
> incidentally: `current.json` is now gitignored (killing the merge-conflict-by-construction
> problem), branch-derived TRD selection replaced the global pointer, and file ownership within
> a single TRD is explicit in the graph. What remains is genuinely cross-TRD: `implement.lock`
> is per-TRD, so two features touching the same files cannot see each other.
>
> Deferring is reasonable while there is one developer on one TRD at a time — the failure needs
> concurrency to occur. It should be split into its own item before that stops being true,
> rather than left as a blockquote on an otherwise-delivered item.


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

### 8. Rework `/implement-trd` — wire it to what the planner now produces — **DELIVERED 2026-08-16**

> **Delivered** in `539258e` (4.2.0), TRD archived at `docs/TRD/completed/implement-trd-rework.md`.
> Measured on an identical 8-task fixture against the pre-rework command: **1.00 vs 5.00 agents
> per task, $67.13 vs $131.24 (−49%), 26.7M vs 41.0M tokens (−35%), 20.0 vs 11.5 min wall clock
> (+74%)**. The wall-clock cost is an architectural trade, not a defect — concentrating five
> agents into one lengthens the per-task critical path; parallelism is essentially unchanged
> (1.69x → 1.54x), and the penalty scales with the longest task in a phase rather than with
> task count, so it does not compound.
>
> Twenty defects were found across four review lenses plus `/audit-build`'s own first
> execution; sixteen fixed. **The three that would have broken real users all shared one shape
> — correct in this checkout, wrong where it ships** (`npm run smoke` hardcoded,
> `packages/core/lib/` in require paths, hand-edited generated prompts). None failed a test,
> and four green end-to-end runs passed anyway because the executing model routed around two
> of them and the generator had not been re-run for the third. **A prompt-based command masks
> its own defects: the executor adapts, so passing runs are not evidence a hardcoded path is
> correct.** That is the transferable lesson from this item, and it now has three structural
> guards behind it (mirror parity, rules-template parity, generator no-op).
>
> Still open, none blocking: coverage severed end-to-end with a printed target nothing
> produces; `known_risks` reaches no agent; no wave cap against the 20-slot pool;
> `trd-parser.js` has no fenced-code-block awareness.


*Replaces the former "prototype one phase as a dynamic workflow" item, which item 10
delivered and superseded: `create-prd.js` is 2 stages, `create-trd.js` is 3, and the
verification wave lives in `audit-prd.js` / `audit-trd.js`.*

**Take this next, while the planning work is fresh.** Item 10 rebuilt the producer and left
the consumer untouched. `/implement-trd` was last shaped for TRDs that no longer exist.

#### The gap, measured 2026-08-15

| Producer now emits | `/implement-trd` mentions it |
|---|---|
| `[read]` / `[ran]` / `[inferred]` evidence markers | **0 times** |
| `Replaces` — the line naming what becomes unreachable | **0 times** |
| `## Could Not Verify` (written by `/audit-*`) | **0 times** |
| `## Open Questions` (owner-only items `/refine` left open) | **0 times** |
| `Serves` columns (objective each task derives from) | **0 times** |

It is not wholly unwired — the delegation template at `implement-trd.md:921` does pass the
Task Grounding block verbatim per task. But it hands over evidence markers **without the
key**. The markers exist so an implementer can tell a claim someone ran from a claim someone
guessed; passing them unexplained returns the document to uniform-looking precision, which is
the exact failure they were introduced to fix: *"precision that isn't uniformly earned is
worse than vagueness, because it stops the implementer checking."*

**A concrete defect found while measuring this:** the `<design_references>` extraction at
`implement-trd.md:1056` reads *"TRD Section 10 'Reference Documents'"*. No generated TRD
contains such a section — real TRDs run `## 1. Overview` through `## 9. Task Grounding`.
The extraction targets a phantom.

#### Why now, and why it is where the money is

Planning is no longer the expensive half. Measured: TRD authoring $39.45, and **~5 agent
invocations per task** in the implement loop. The same feature at 43 tasks is 215 invocations;
at 12 it is 60. Every per-task overhead multiplies by task count, so the loop — not the
planner — now dominates total cost.

#### Done conditions

1. The delegation template explains the evidence markers, and instructs an implementer to
   **verify any `[inferred]` claim before relying on it** and to trust `[ran]` most.
2. `Replaces` is surfaced as an explicit deletion instruction, not prose in a passed block.
   This is the line that stops superseded code accumulating — the `poi/reconcile/` problem.
3. `## Could Not Verify` reaches the implementer for the tasks it touches. A task resting on
   an unverified claim must be treated differently from one resting on a checked fact.
4. An unresolved **owner-only** `## Open Question` covering a task is surfaced before that
   task runs, not discovered mid-implementation.
5. `<design_references>` points at a section that exists.
6. The 5-invocations-per-task loop is re-examined against measured cost. `SIMPLIFY → VERIFY`
   re-running a full verify may not earn its place on every task.
7. `implement-trd.md` is ~13.4k tokens and re-caches every turn. The `create-trd` fix —
   splitting the authoring contract out from orchestration detail — cut author cost
   materially and applies here unchanged.

#### The review layer — decided 2026-08-15

**Our `code-reviewer` agent leaves the implement loop.** Owner judgment, stated directly:
it is *"a poor substitute for the built in one — not nearly as effective."* Re-scoping it
(the earlier item-6 proposal) is not enough; the loop should not be spending an agent per
task on a job something else does better.

**CORRECTED 2026-08-15 — the premise below was not verified when first written.** The
original text asserted that Anthropic's Code Review runs on this repo's PRs, sourcing that
to item 6's description of `REVIEW.md`. That is a design document describing a product, not
evidence the product is wired here. Checked afterwards: there is **no Claude review action or
app in `.github/`**, and the repository's only PR to date was reviewed by **`coderabbitai`**.
This is the same failure the item-10 profile measured (`sanitize_error_detail()`): a document
describing a capability treated as proof it exists.

**What is verified:** `/code-review` is `disable-model-invocation`, so no command can invoke
it — that part holds. `ci.yml` is `on: pull_request`, which fires on every push to a PR
branch. `/implement-trd` opens a PR at `implement-trd.md:719`, at the END of the run.

**RESOLVED 2026-08-15 — interface verified against live docs**
(`https://code.claude.com/docs/en/github-actions`). Automating review needs no change to any
model-invocation rule, because **the CI path involves no model invocation at all** — the
GitHub runner executes the action.

Two supported routes, both real:

- **(a) Code Review app** — `docs/en/code-review`: *"automatic review on every pull request,
  without writing a workflow."* Install once; no workflow file to maintain.
- **(b) `anthropics/claude-code-action@v1` in `ci.yml`** — a file this project fully controls
  and can scaffold into every project it initializes. The documented review workflow:

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 1 }
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          plugin_marketplaces: "https://github.com/anthropics/claude-code.git"
          plugins: "code-review@claude-code-plugins"
          prompt: "/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'
```

**`synchronize` is what makes per-phase review work** — it fires on every push to the PR
branch. Pushing at each phase checkpoint therefore triggers a review per phase, exactly as
designed below, with no orchestration.

**CORRECTION to the per-phase design: the PR must NOT be a draft.** The docs state Claude
skips draft and closed pull requests, pull requests it judges trivial, and any that already
carry a Claude comment. The earlier "open a draft PR at the start" instruction would have
produced zero reviews. Open a normal PR early instead, or mark ready at the first checkpoint
(`ready_for_review` is a trigger type).

**Two inputs are load-bearing and easy to omit:** `--comment` in the prompt (without it
findings go only to the workflow run log, not the PR), and the `claude_args --allowedTools`
line — the action starts the inline-comment MCP server only when `--allowedTools` names it,
even though the skill's own frontmatter already does.

**Still owner-only:** which route, and the `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`
secret, which needs repo-admin access. `/install-github-app` automates route (a) plus the
secret. Note the org caveat: an OAuth token is tied to whoever ran `claude setup-token`, so
shared use wants an API key.

**`REVIEW.md` — CONFIRMED, and NOT a dependency of this design** (`docs/en/code-review`).
Item 6 was right about what it does: *"review-only instructions, injected directly into every
agent in the review pipeline as highest priority."* But it applies **only to the managed Code
Review service**, and the local command — the one this design uses — explicitly *"follows your
`CLAUDE.md` like any Claude Code session, but it doesn't read `REVIEW.md`."*

**So `CLAUDE.md` is the governance channel for the reviewer actually in the loop.** Review
guidance goes where this framework already writes, not into a new file. Ship `REVIEW.md` for
whoever enables the PR service; it is not on the critical path for item 8, and OQ-2 in
`docs/PRD/implement-trd-rework.md` is right to flag the contradiction it inherited from a
source written before this was settled.

**BILLING — decisive for route choice, and they are not equivalent:**

| | route (a) managed Code Review | route (b) `claude-code-action` |
|---|---|---|
| Plans | **Team / Enterprise only** (research preview) | Pro, Max, Team, Enterprise |
| Auth | org-level GitHub App | `claude_code_oauth_token` from `claude setup-token` |
| Billing | **usage credits, ~$15–25 per review**, separate from plan usage | *"runs use your Claude subscription instead of API billing"* |
| Reads `REVIEW.md` | yes | not documented |
| Not available with | Zero Data Retention | — |

At $15–25 per review, per-phase review on route (a) costs **$75–125 for a five-phase
feature**, on top of the plan. Route (b) with an OAuth token is subscription-covered. **That
inverts the earlier recommendation: prefer (b) unless `REVIEW.md` governance is worth
per-review credits.** Route (b)'s YAML above should use
`claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` rather than the API key the
docs' examples show.

**THREE TIERS, AND THEY ARE NOT INTERCHANGEABLE** (verified `docs/en/ultrareview`,
`docs/en/code-review`). Confusing them is what produced two wrong conclusions in this
section's history:

| Tier | Fan-out? | Can Claude start it? | Billing |
|---|---|---|---|
| local `/code-review` | **YES — measured at 7 agents** (parent + 6 children, `dispatch.jsonl` 2026-08-16 04:08–04:11) | **Yes — verified empirically** | normal plan usage |
| `/code-review ultra` | **Yes** — *"multi-agent fleet with independent verification"* | **NO** — *"Claude doesn't start an ultrareview on its own"* | 3 free (Pro/Max), then $5–25 credits |
| managed Code Review | **Yes** — *"fleet of specialized agents… then a verification step"* | n/a — automatic on PRs | Team/Enterprise only, $15–25 credits |

**CORRECTED 2026-08-16 — the local review DOES fan out.** An earlier revision of this section
claimed it was a single agent, reading *"runs as a background subagent with its own context
window"* as a statement about its internals. That phrase describes the launch wrapper. The
dispatch ledger settles it: one `/code-review` run at default effort produced a parent plus
**six** child agents. The ultrareview docs say ultra uses *"a **larger** fleet"* — comparative,
not fleet-versus-none.

**So the free, model-startable tier is already a fan-out review**, and it found 14 real
defects in 1,495 lines of this project's own workflow code, including two that surviving a
full end-to-end run on two codebases had not surfaced.

What `ultra` still adds over it: a larger fleet, **independent reproduction and verification
of every finding**, and a cloud sandbox that leaves local resources free. That is a
confidence and scale difference, not a fan-out difference — and it is worth paying for
pre-merge, not per phase.

**`claude ultrareview` is the automation seam.** The subcommand *"launches the same review as
`/code-review ultra`, blocks until the remote review finishes, and prints the findings to
stdout"*, and is explicitly *"to start an ultrareview from CI or a script without an
interactive session."* Running it constitutes billing consent, `--json` gives a parseable
payload, `--timeout` defaults to 30 min, exit 0 completed / 1 failed / 130 interrupted.
Note `claude -p '/code-review ultra'` is NOT equivalent — it stops before launching whenever
credits would bill.

**Design that follows, and both tiers earn a place:**

- **per phase** — local `/code-review`, started by `/implement-trd` itself. Model-startable,
  plan-billed, background subagent so it costs no orchestrator context. Fast feedback while
  the phase is fresh.
- **end of run** — one more `/code-review high` over the FULL branch diff. Phase-scoped
  reviews are blind to exactly one class, cross-phase integration, and today's run found that
  class in miniature: *"both handoffs drop `--source`/`--project`"* spans create → audit and
  no single-scope review sees it. One extra review covers it.

**DECIDED 2026-08-16 — review per phase, not only at the end.** Owner ruled out the paid
`ultra` step, so the whole design runs on the plan-billed 7-agent local review.

Reasoning, from measurement rather than preference:

- **Today review runs per TASK.** End-only would swing from the most frequent option to the
  least. Per-task review was removed because a reviewer seeing one task cannot judge
  integration — not because review should happen later. Per phase is the smallest coherent
  scope.
- **The failure being optimised against is the late find.** The item-10 profile measured
  `sanitize_error_detail()` surviving two passes into delivered code. A flaw found in phase 1
  and built on through phase 5 is the expensive case, and end-only review guarantees it.
- **`--fix` degrades with age.** A fix applied to phase-1 code during phase 1 is mechanical;
  the same fix at the end lands on code later phases have built on and can conflict. Today's
  14 findings applied cleanly to a settled tree — the easy case, and the one per-phase review
  reproduces.
- **Scope the review to the PHASE DIFF, not the branch.** Reviewing the whole branch each
  phase re-reviews settled code and produces churn. Anthropic's own managed-service guidance
  concedes this, suggesting *"after the first review, suppress new nits and post Important
  findings only"* — a phase-scoped diff solves it structurally instead of by instruction.

Cost, measured: 3.5 min for 413 lines, 8.5 min for 1,495. Roughly six reviews on a five-phase
feature, ~25–45 min, against the ~4 agent invocations per task the loop rework removes.

**What would change this:** phases of 8+ tasks make the phase diff unbounded and the churn
argument returns. The answer then is smaller phases, not less review. Measured on the two
profile TRDs, phases are well inside that: ensemble 12 tasks / 3 phases (~4 each), herald 27
/ 5 (~5.4 each), split by dependency structure rather than count. Watch it on the first real
run.

#### Test-task placement — fixed in the contract 2026-08-16

Measured on the same two TRDs: **test tasks are real tasks, not assumed follow-on** — 3 of 12
and 7 of 27 carry `-T###` IDs with their own dependencies and acceptance criteria, and
herald's `CPUB-T007` is a `[LIVE]` Playwright E2E assigned to `@verify-app`. Good.

**But both TRDs put every verification task in the FINAL phase** (ensemble phase 3 of 3,
herald phase 5 of 5), and nothing in `trd-authoring.md` asked for it — both authors reached
for that shape independently. It directly contradicts the per-phase review cadence decided
above:

- every phase but the last ends with nothing runnable, so the phase gate has nothing to check
  and the phase-boundary review reads code instead of running it
- the per-task deterministic checks the loop rework depends on have nothing to execute
- a phase-1 defect surfaces only after phases 2–4 were built on it — the expensive failure
  this pipeline exists to move earlier

**REVISED within the hour — the first fix moved the wrong thing.** It relocated unit-test
tasks to earlier phases while leaving them as separate tasks. Owner's model is better: unit
tests as you go, feature-level verification at the end. The tasks should not exist.

The double-count is verifiable. Herald's constitution states *"No production code is written
before a failing test exists for it"*, and its implementation tasks' grounding already names
the test files they touch — yet the TRD also created `CPUB-T004/T005/T006`, all prefixed
`Unit:`. The unit tests were in the plan twice: once implicitly inside the implementation
task where TDD puts them, once as standalone tasks. Ensemble did the same with `DRIFT-T001`.

`packages/core/contracts/trd-authoring.md` now says: **unit tests are not tasks** — they are
acceptance criteria on the task that adds the behaviour. What earns a task is (a) an
integration test crossing a seam no single implementation task owns, and (b) `[LIVE]`
end-to-end verification of the assembled feature, which is the one thing that legitimately
belongs in a terminal phase. E2E remains required as a task; a feature with no exercisable
path must say so in Quality Requirements rather than silently omitting it.

This solves the runnable-phase problem structurally rather than by scheduling rule: code and
its unit tests land together, so every phase ends executable by construction.

Expected effect on the profile TRDs: ensemble 12 → 11 tasks, herald 27 → 24.

Unmeasured: whether the instruction takes. Both the corpus mechanism and this are prompt
changes awaiting their first real run — and this session twice measured that a stated rule
does not by itself produce the behaviour.

**ITEM 6'S disable-model-invocation CLAIM IS OUTDATED for the local tier — but holds for
`ultra`.**
`docs/en/code-review` states plainly: *"Claude can start `/code-review` on its own. Ask it to
review your changes in plain language and it can run the skill without you typing the
command, and a scheduled task with `/code-review` as its prompt runs the review."* There is
even a `skillOverrides: {"code-review": "user-invocable-only"}` setting to DISABLE that,
which implies the default permits it. Documented exceptions: cloud-provider sessions, the
Claude apps gateway, and privacy env vars.

If that holds, `/implement-trd` may be able to invoke `/code-review` directly at a phase
boundary, and this item's whole CI detour becomes optional rather than necessary. Two
caveats before relying on it: the **`ultra` cloud tier is separately restricted** (user-typed
and billed), and a scheduled task *"never launches the cloud review"*. Verify the non-ultra
in-loop path empirically before designing on it — this claim has already been wrong once in
the other direction.

**The design below is conditional on that decision.** If per-phase automated review is
available by any of those routes, run it per phase rather than once at the end:
`/implement-trd` already opens a PR (`implement-trd.md:719`) — but at the END, so today
exactly one review happens, after all the work is done, when findings cost the most to act
on.

Fix: **open a draft PR at the start of implementation and push at each phase checkpoint.**
The command already commits at checkpoints, so this is a reordering, not new machinery. The
result is the good reviewer running four or five times instead of once, at zero cost to the
loop, with no `disable-model-invocation` problem — nothing is being invoked by a model.

**`code-reviewer`'s one distinctive job is not code review.** Acceptance-criteria
verification — does the delivered code satisfy AC-F2.3, and is there a test proving it — is
traceability, and it belongs in `/audit-build` (below). The agent is referenced by
`fix-issue`, `harden-trd-team`, `implement-trd` and `init-project`; each needs the same
treatment.

**This makes item 6 (`REVIEW.md`) a hard dependency, not an adjacent improvement.** If the
built-in reviewer is doing essentially all code review, `REVIEW.md` is the only channel
through which this project's Quality Gates, Definition of Done and prohibited-pattern table
reach it. Without it, review is handed to a capable reviewer that does not know the rules.
**Do item 6 first.**

#### The loop — decided 2026-08-15

| | today | target |
|---|---|---|
| per task | IMPLEMENT → VERIFY → SIMPLIFY → VERIFY → REVIEW | IMPLEMENT → deterministic checks → [DEBUG on fail] |
| agents / task | 5 | **~1** |
| per phase | — | `verify-app` on acceptance criteria; push → built-in review |
| at end | PR created, one review | `/audit-build` |

At 43 tasks that is ~215 agent invocations today against ~50.

**Verification does not need an agent when it is deterministic.** This repo's full suite
runs in **3.15 s**; a verify agent costs $5–15. The expensive thing is not running tests, it
is spawning an agent to decide whether they passed. The orchestrator runs targeted tests,
typecheck and lint itself; a `verify-app` agent is warranted only where acceptance criteria
need judgment — at the phase boundary.

**`SIMPLIFY` drops out of the per-task loop.** It costs two of the five invocations (itself
plus the re-verify it forces) to refactor code that just passed, by an agent lacking the
authoring context, at the moment the implementer's local choices were most deliberate.
Duplication *between* tasks is the real target and is only visible at a phase boundary.
Demoted there rather than deleted — there is no measurement either way, which is itself the
reason not to delete it outright.

#### State — decided 2026-08-15

**Derive the active TRD from the branch; stop storing a global pointer.** `current.json` is
a single repo-wide pointer, and `active_sessions` in `implement.json` is `{}` — the
multi-session mechanism was designed and never used. Branch names already encode the
workstream (`<issue-id>-<session>`, `feature/<trd-name>/<session>`) and git already isolates
them per worktree, so a file that must be hand-synced with the branch will drift by
construction. That is the reported symptom. Fall back to an explicit argument when the
branch does not resolve.

#### `/audit-build` — new, post-implementation

Verification **and** validation, plus the part nothing covers today:

- (a) delivered code matches TRD tasks — *verification* (built it right)
- (b) delivered code matches PRD requirements — *validation* (built the right thing)
- (c) **every requirement has both an implementation and a test proving it** — traceability

(c) is the highest-value check and the one with no current owner. A requirement with code
and no test is exactly how `sanitize_error_detail()` survived two review passes.

Same proven shape as `audit-prd` / `audit-trd` — index → parallel verifiers → reconcile —
except the artifact is the delivered code and the source is TRD + PRD.

#### `harden-trd-team` / `verify-trd-team` — replaced, decided 2026-08-16

1,607 lines doing two unrelated jobs — adversarial edge-case hunting, and forcing an
end-to-end test path. Neither needs a team.

**Hardening is NOT redundant with code review, and the distinction is load-bearing: review
examines what you wrote; hardening asks what you did not.** Review finds bugs in existing
lines. Hardening finds the missing error path, the unhandled boundary, the behaviour with no
test. A per-line review structurally cannot see a line that is not there — the same reason
`audit-*` carries a separate `omission-audit` verifier rather than folding omission into the
others.

Replacement, in three parts:

1. **Hardening's mandate moves into `CLAUDE.md`** — "flag missing error handling, unhandled
   boundary conditions, and behaviour with no test." The local `/code-review` reads
   `CLAUDE.md`, so this reaches every phase review at no additional cost and with no command
   to maintain.
2. **One terminal adversarial pass before the PR** — a verifier fan-out, the shape that found
   real defects on both codebases in the item-10 profile. Whole-feature weaknesses only exist
   once the whole feature does, so this cannot be folded into a phase.
3. **The `[LIVE]` E2E task** already required by `trd-authoring.md`, which is the
   forcing-an-end-to-end-path half of what these commands were for.

#### State ownership and `status.js` — decided 2026-08-16

**`implement.json` is maintained by the COMMAND, and that is forced by the platform, not
chosen: workflow scripts have no filesystem access.** The command writes phase-in-flight
before dispatch and results after the workflow returns. A phase workflow returns values; it
never persists them.

**`status.js` breaks under the new loop and must be rewritten or retired — a deliverable
nothing in this plan previously named.** It advances `cycle_position` on every SubagentStop
through `CYCLE_ORDER = ['verify_red','implement','verify','simplify','verify_post_simplify',
'review', …]` — exactly the five-stage cycle this item deletes. A phase workflow fires 5–7
SubagentStops; the hook would advance a cursor through stages that no longer exist, once per
agent. Its own header describes it as a safety net for a model where *"the command sets
cycle_position when ENTERING a stage"*; when the workflow drives execution instead, the safety
net becomes a hazard. `wiggum.js` and `precompact.js` also write this file and need the same
audit.

**`implement.json` has no schema.** It carries a `version` field and nothing validates shape,
with five writers (command + three hooks + a workflow's returned results). It is also the only
cross-session coordination point in the design, so a malformed write is precisely how a resume
silently loses a phase. **Item 7's `lib/` is the home for a schema and validator** — it is the
tested deterministic layer, and this is the cheapest possible thing to put in it.

#### `--auto` closes every question — contract corrected 2026-08-16

The original `--auto` marked a question **owner-only** and left it open, and nothing downstream
gated on it. That was wrong for the mode's purpose: `--auto` exists to produce a finished
artifact unattended, and an open question ships an incomplete document that
`/create-trd`, `/audit-*` and `/implement-trd` all run straight over.

**Owner ruling:** `--auto` decides everything. A `product-manager` subagent — separate from the
agent running the technical challenge pass, because product judgment and code checking are
different mandates — makes the best call the evidence supports, and the artifact records the
question, **the decision, and the reasoning**, marked `OWNER-CALL`. The owner reviews the
thinking afterwards and countermands what they disagree with. Nothing waits on them.

The failure this replaces is not "an agent answered a question it should not have" — it is "an
agent answered without showing its work." A decision with no reasoning can only be accepted,
not reviewed.

Applied: `refine-prd.md` and `refine-trd.md` rewritten; the item-8 TRD's OQ-1 and OQ-5 closed
as `OWNER-CALL` with reasoning and countermand conditions.

#### OWNER DECISION OWED — `stack.md` names tools that are not installed

`.claude/rules/stack.md:65-66` lists Prettier (`.prettierrc`) and ESLint (`.eslintrc`).
Neither is installed and neither config exists — `package.json` devDependencies are exactly
`bats`, `jest`, `js-yaml`, `mock-fs`. ShellCheck IS present.

The TRD's refine pass removed both from the check battery and **declined to edit `stack.md`**,
correctly: the Governance Split makes it owner-governed. So the divergence stands until the
owner either installs the toolchain or corrects the file. It is recorded, not reconciled in
either direction.

#### Concurrency across TRDs — status and the shape that follows, 2026-08-16

**Within a phase: solved, by construction.** Workflow scripts have no filesystem access, so
parallel agents never touch `implement.json` — they return values and the command writes once
when the workflow returns. Single writer, no contention. The platform constraint that forced
command-owned state removed intra-phase races for free.

**Across TRDs: two of item 7's five breakages are answered, three remain.**

| Breakage | Status |
|---|---|
| `implement.json` collision | **Never existed** — already per-feature at `.trd-state/<feature>/` |
| `current.json` single git-tracked pointer | **FIXED 2026-08-16** — untracked and gitignored; derive from the branch, fall back to an explicit path |
| Cross-TRD *file* conflicts (`implement.lock` is per-TRD) | **Open** |
| `.trd-state/` per-repo vs per-worktree | **Open** |
| Session-scoped task list, never uploaded | **Open** |

**Two-worktree pointer conflict — FIXED, narrowly.** `.gitignore` carried
*"`.trd-state/` IS tracked for parallel execution coordination — Do NOT add `.trd-state/` to
gitignore"*, and `current.json` had **4 distinct TRD values committed** across history. Every
feature branch rewrote one shared tracked file; two worktrees off one repo conflict on merge
by construction.

Both `current.json` and `wiggum-state.json` are now untracked and gitignored. They are
per-session working state, not project artifacts: the first is a pointer that coordinates
nothing, the second is within-session loop counters that two `--wiggum` runs would otherwise
share. Everything else under `.trd-state/` stays tracked — `implement.json` is per-feature,
carries durable progress, and never collided.

**Follow-up owed:** 17 commands, 4 hooks and 3 scripts read `current.json`. Existing checkouts
keep the file, but a NEW worktree will not have it — which is precisely the case being fixed.
Each reader needs the documented fallback (derive from branch, then explicit argument). That
is item 8 scope.

**Cross-implementation parallel guards are OUT OF SCOPE** — each session manages merging into
its own branch. The claims-file sketch below is recorded as the shape item 7 would take if it
is ever wanted, not as planned work.

**The shape that follows from decisions already made.** Item 7's own observation is the key:
*"cross-TRD conflict detection is the same computation as intra-TRD, just over a wider set."*
`Touches` was already adopted to gate parallelism inside a phase; the cross-TRD mechanism is
the same data published somewhere shared. A phase appends its `Touches` set to a **repo-wide
claims file** before dispatch; another TRD's phase reads it before dispatching its own.

That also splits the per-repo/per-worktree question rather than answering it once, which is
what item 7 suspected:

- **`implement.json` is per-branch** — it tracks one TRD's progress and should travel with the
  worktree.
- **The claims file is repo-wide** — a lock nobody else can see is not a lock.

Still genuinely open: what a claim conflict *does* (block, warn, or queue), and whether the
session-scoped task list needs replacing at all once claims are file-based rather than
task-based. Both are item 7 design work, not decided here.

#### Hardening is a dedicated agent, decided 2026-08-16

**Revises the CLAUDE.md-only answer given earlier the same day.** Hardening gets its own agent,
run per phase, in parallel with the phase review.

The reasoning that overturns the earlier answer is this project's own: `audit-*` carries a
dedicated `omission-audit` verifier *because* a per-line audit cannot see a line that is not
there. Hardening asks the identical question — what is missing — so appending it to a reviewer
whose mandate is finding bugs in written lines merges two different questions into one prompt.
`CLAUDE.md` is also the wrong channel: it applies to every Claude Code session, so hardening
instructions would leak into implementation sessions, not just reviews.

Shape: hardening agent and `/code-review high` run **concurrently, both read-only**, over the
phase diff; their findings reconcile together and apply once. That is the audit pattern —
parallel verifiers → reconcile → apply — and it avoids `--fix` writing underneath a concurrent
reader. Cost: one extra agent per phase, 4–6 per feature.

The terminal adversarial pass still stands for whole-feature weaknesses, which only exist once
the whole feature does.

#### Parallelism and file ownership — decided 2026-08-16

**`Touches` gates parallelism, not just the dependency graph. On overlap, serialize — do not
isolate into worktrees.**

Dependency-independent is NOT the same as safe to run concurrently. Two tasks with disjoint
`Blocked by` can both write `broadcast_db.py`; two agents editing one file is a lost update
that raises no error. The TRD already carries the data to prevent this — 18 `Touches` blocks
in the herald plan — and nothing currently consumes it for this purpose.

**Measured, before choosing a mechanism:** in a real 27-task TRD only **1 of 7** tracked files
is shared (`broadcast_db.py`, by CPUB-B001/B004/B007), and the dependency graph had **already
serialized all three** — B001 in phase 1, B004 and B007 inside phase 2's session 2A, which is
*"sequential internally."* Overlap is rare, and when it occurs the DAG frequently orders it
anyway. The residual case is small.

**Why not `isolation: "worktree"` per implementer**, despite the platform's guidance that it
is for agents that "mutate files in parallel and would otherwise conflict":

- **Worktrees solve the race, not the merge.** Isolation prevents the lost update and says
  nothing about integrating two divergent versions of one file. That integration needs an
  agent, which costs more than the serialization saved.
- **Textual mergeability is not semantic correctness.** Two agents each adding a method merge
  cleanly and can still produce duplicate helpers or incompatible assumptions. Git sees
  disjoint hunks; nothing catches the rest until the phase review, by which point both tasks
  report done.
- **Cleanup is a real cost, demonstrated here.** This repository is carrying **275 MB across
  four abandoned agent worktrees** from one day of experiments, and they broke jest discovery
  (205 stale test files against 19 real) until `28ef0f8`.
- **Serialization is nearly free at this scale.** Phases are 4–6 tasks; serializing an
  overlapping pair costs one task's duration inside a phase that still completes in a session.

**Where worktrees DO belong: the workstream level.** Two developers, two TRDs, two branches —
what git worktrees are actually for, where the merge is a normal PR merge under human review.
That is item 7's concurrent-TRD problem, not intra-phase task scheduling.

**Escape hatch:** a phase with many genuinely independent tasks on one file is a design smell
— the file is doing too much, or the tasks are wrong-sized. Report it as a finding rather than
engineering around it.

#### NEW FINDING 2026-08-16 — the loop-continuation guarantee is behind a flag

Measured during this TRD's own implementation. The orchestrator stopped **four times** with
work remaining, always at a boundary and always immediately after emitting a good status
summary: after preflight, after ITR-B001 verified, after the Phase 1 gate, after the Phase 2
gate. Never mid-task, never on ambiguity, never lacking information.

**The mechanism: the summary IS the stopping behaviour.** A phase banner and a verified table
complete a narrative arc, and the turn ends because the narrative finished rather than the
work. The cleaner the report, the stronger the pull.

**No guard catches it.** All four stops were grammatically declarative -- *"dispatching all
three"*, *"ITR-B005 is next"* -- so nothing asked permission:

| Stop hook | Catches | Caught these? |
|---|---|---|
| `async-discipline` (prompt) | false claims of work in flight | no claim was made |
| `autonomy-discipline` (prompt) | asking permission mid-loop | nothing was asked |
| `wiggum.js` (command) | exit while work remains | **gated on `WIGGUM_ACTIVE=1`, set only by `--wiggum`** |

So an honest, complete report followed by silence with tasks outstanding falls between the two
model-judged guards, and the one mechanism that would catch it is opt-in. Only the `/goal`
condition caught it -- four times.

`implement-trd.md:516` already forbids this in prose: *"Phase boundaries are NOT user-pause
points… immediately spawn the next phase."* The rule was open in the editor, had just been
rewritten, and was violated four times. **Same shape as every other finding in this plan: a
stated rule that produces no behaviour.**

**Why `async-discipline` did not catch it, and why widening it is the wrong fix.** Its
"about to" clause names two tenses -- *"the same underlying falsehood as claiming the action
already happened, differing only in tense"* -- and every example is an explicit future marker
(*"Next I'll run"*, *"now I'll read"*). **"Dispatching all three" is a bare present participle**:
neither *"I'll dispatch"* nor *"I dispatched"*. It reads as an action already underway, which is
precisely what a compliant DISPATCHED banner sounds like -- and the prompt exempts those. With
its fail-open-on-ambiguity instruction, the judge behaved correctly by its own rules.

The deeper reason is scope. `async-discipline` asks *"are you claiming work is running
asynchronously?"* -- and "Dispatching all three" claims nothing of the kind. No notification is
promised. It is an **action claim that was false when made**. The question that catches it is
neither guard's:

| Guard | Its question |
|---|---|
| `async-discipline` | are you falsely claiming async work? |
| `autonomy-discipline` | are you asking permission? |
| **absent** | **did you do what you just said you did?** |

Widening `async-discipline` to judge tense would make it brittle in exactly the way its own
history warns about: the regex battery it replaced died on *"waiting on"* versus *"waiting
for"*. A bigger dictionary is the same mistake in a new form.

**Proposed fix, ungated:** a `Stop` hook that reads `implement.json` -- if a TRD is in flight,
tasks remain incomplete, and no `COMMAND COMPLETE` banner was emitted, block and name the next
eligible task. `wiggum.js` already proves the shape works and that `{"decision":"block"}` is
honoured on `Stop`; it needs to fire on the default path rather than behind a flag. Not in the
current TRD -- this is a hook, and belongs to item 5's surface.

**This hook needs no tense judgement at all**, which is its main advantage over widening a
model-judged guard. It reads `implement.json` for ground truth: a TRD in flight, tasks
incomplete, no COMMAND COMPLETE emitted. That catches "Dispatching all three", "ITR-B005 is
next", AND a silent stop making no claim whatsoever -- three shapes, one check, no grammar.

**One cheap addition to `async-discipline` regardless:** name the present-progressive form in
the "about to" clause. It is the shape most easily mistaken for a compliant DISPATCHED banner,
and the clause currently names only past and future.

#### Execution model — decided 2026-08-16

**`/implement-trd` stays a command. A workflow runs ONE phase.** Not a workflow per phase, and
not a workflow for the whole run.

The constraint is already recorded in item 7's open-design block: *"Workflows cannot resume
across sessions, which makes the durable state file the only cross-session coordination
point."* `resumeFromRunId` is same-session only, and an implement run spans sessions —
`--resume`, checkpoints, compaction, hours across sittings. A whole-run workflow would trade
away exactly the durability `implement.json` exists to provide.

| Layer | Owns |
|---|---|
| `/implement-trd` (prompt) | TRD parsing, the task graph, phase sequencing, `implement.json`, cross-session resume |
| `implement-phase.js` (workflow) | one phase: `parallel()` over independent tasks, `pipeline()` over chains, then the phase-boundary `/code-review high` |

**One parameterized script, never generated per phase:**
`Workflow({ name: "implement-phase", args: { trd, phase, tasks, project } })` — the task list
comes from item 7's graph.

**A phase is the right unit because it is the largest chunk that reliably completes inside one
session.** Measured on the profile TRDs: 4–5.4 tasks per phase; at ~1 agent per task after the
loop rework plus one review, that is 5–7 agents — the same shape as `audit-trd`, which ran 7
agents in 13 minutes. A phase either completes or is retried whole, and `implement.json`
carries the boundary.

It also delivers what the loop most needs: **per-task results stop entering orchestrator
context.** `implement-trd.md` is ~13.4k tokens re-cached every turn today — the same problem
the item-10 conversion already solved for `create-trd`.

#### Dependency — item 7 merges into this item

The concurrent-TRD question gates the state model, and the two are the same problem:
deterministic sequencing is what makes phase boundaries meaningful, and branch-derived state
is what makes concurrent workstreams possible. **Item 10 already laid the groundwork** —
tasks now carry `Dependencies` and `Serves` in structured, parser-consumable position, so
tasks + dependencies → DAG is mechanical, and "what can run in parallel" becomes
deterministic rather than LLM-judged. Build item 7's `lib/` as part of this item, not after.

### 12. Command-fix delivery — getting a framework bug fix into existing projects

**The gap:** every defect found in a shipped command is fixed in `packages/core`, mirrored to
`.claude/`, committed — and reaches no existing project until someone runs `/rebase-project`.
That path was itself broken in three independent ways, all found on 2026-08-20 from live
projects rather than from tests:

- `/rebase-project` never delivered `workflows/`, `lib/` or `contracts/` at all. Any project
  scaffolded before those directories existed and rebased since never received them, and the
  failure is SILENT — every affected command documents a fallback, so `/implement-trd` simply
  lost its task graph and carried on looking like it worked.
- It copied hook content without restoring the execute bit, so `.js`/`.py` hooks failed with
  `Permission denied` on every event. `scaffold-project.sh` had always done this correctly, so
  a scaffolded-then-rebased project came out WORSE than one never rebased.
- Retired commands classified as stale were then not deleted. `harden-trd-team`,
  `verify-trd-team` and `implement-trd-team` remained invokable — not inert leftovers but
  working alternate paths that bypass the phase gate, the hardening lenses and the
  verification loop.

**Done in 4.1.18:** all three fixed; retired commands named explicitly rather than left to
frontmatter inference; agents given a Stale category they never had; and mirror parity moved
from a hardcoded 14-file list to a discovered sweep (which immediately found
`.claude/hooks/wiggum.js` committed at an older revision than its source).

**Still open, and why this is an item rather than a closed bug:**

1. **No test proves a real rebase works.** Step 4.5 is prose executed by a model. The BATS
   assertions prove the command *instructs* correctly, not that a run obeyed — and the bug it
   fixes hid for months precisely because nothing exercised the path. A smoke scenario that
   scaffolds an OLD project, rebases it, and asserts the three directories arrive is the
   missing check.
2. **Version skew is undetectable from inside a project.** A project can sit three releases
   behind with no signal. `runtime-refresh.sh` gates on a monotonic version, so it upgrades
   what is PRESENT and cannot add what is absent — the same present-only limitation that
   caused this class.
3. **Multi-repo has no answer.** A parent repo holding `.claude/` with nested independent
   repos (each possibly carrying its own vendored runtime) drifts per-tree. Observed in
   fanfare: 4.1.16 at one level, 4.1.18 at another.
4. **No way to ask "what would change?"** `--dry-run` exists for the diff, but there is no
   command that answers "which of my projects are stale, and on what."

**Why it sits here:** this is the delivery half of every other item on this list. A fix that
cannot reach a project is a fix nobody has.

### 9. Native quality gates and worker loops — **RETIRED 2026-08-16, replaced by item 9a**

> **Retired, not deferred.** Two of this item's three "Done when" clauses target machinery
> item 8 removed:
>
> - **`TaskCompleted` / `TaskCreated` gates** — `implement-trd.md:55` now states the command
>   "does not use the platform's `TaskCreate`/`TaskUpdate`/`TaskList` work-list tools". The
>   task list was replaced by a deterministic graph plus one workflow per phase, so
>   `TaskCompleted` **can never fire in the main implementation flow.** Building gates on it
>   would produce structurally unreachable hooks — the same defect class as the
>   `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` lever this project deleted for pointing at files no
>   scaffolded project ever received.
> - **`TeammateIdle` re-engagement** — scoped for three team commands, two of which
>   (`/harden-trd-team`, `/verify-trd-team`) were deleted by ITR-B012. Only `/fix-issue`
>   still spawns teammates.
>
> The third clause — an **agent hook** (`type: "agent"`, a subagent with `Read`/`Grep`/`Glob`)
> verifying acceptance criteria against code — is a good mechanism aimed at a problem
> `/audit-build` now owns, and **the 2026-08-16 evidence says it would not have helped.**
>
> `implement.json` recorded **19/19 tasks success**, every acceptance criterion met, and
> `/audit-build` confirmed traceability. Four defects would still have broken the release for
> every user: an empty `.claude/lib/` on install, `--refresh` withholding every new file,
> `npm run smoke` hardcoded into the phase gate, and hand-edited generated prompts. **None is
> an acceptance-criteria failure.** An agent hook checking "does this task satisfy its
> criteria" passes all four — while adding one subagent per transition to a loop whose headline
> result is 1.0 agents per task.
>
> Zero of this item was built (no `TaskCompleted`, `TaskCreated`, `TeammateIdle`, or
> `type: "agent"` entries in the manifest), so retiring it costs nothing.

### 9a. Full-scope TRD verification — the vehicle, not the hook

**The gap is real and it is command-shaped.** `/verify-trd-team` did live E2E verification
against a running instance — API testing, UI testing, a Completion Promise decomposed into
checkable assertions. ITR-B012 folded it into the loop, and what survived is **one conditional
line** in the phase-gate verify prompt (`implement-trd.md:495`). That is a genuine reduction in
capability, and it is what needs rebuilding.

**Design the axes from what actually caught defects on 2026-08-16**, not from what sounds
thorough. Measured yield that day, across 20 findings:

| Axis | What it found |
|---|---|
| **Environment realism** — does it work where it SHIPS, not where it was authored | 2 release-breakers, in minutes, by filesystem inspection alone |
| **Differential** — what did this change silently REMOVE | 2 blockers, from diffing the old command against the new |
| **Adversarial lenses with distinct mandates** | 18 findings across three agents with near-zero overlap |
| **Live functional** — Completion Promise decomposition | the axis we deleted; unmeasured because it did not run |
| **End-to-end execution** | the performance numbers — **and it MASKED two defects** |

**Environment realism leads.** It is the cheapest axis and had the highest yield: two defects
that would each have broken the release outright, found by inspecting a real plugin-cache
install and simulating a scaffold without the `../core` sibling. No LLM runs. `/verify-trd-team`
never had this axis, and neither does `/audit-build`.

**Live functional follows**, reviving the Completion Promise mechanism from
`git show b78f34a~1:packages/core/commands/verify-trd-team.md` — the decomposition into
assertions was the good part and should come back close to intact.

**The finding that should shape the whole item:** end-to-end execution is NOT verification when
the executor is adaptive. Four green runs passed while silently routing around two hardcoded
paths — one run's own log reads *"Framework libs live at `.claude/lib/`, not
`packages/core/lib/` — used the actual paths"*, and it proceeded to COMMAND COMPLETE. A
verification pass that only runs the thing will be defeated the same way. It has to inspect the
artifact where it lands.

### 9a.1 Verify the PRD, not the TRD — and iterate on DEFECTS, not phases

**Owner correction, 2026-08-17. The design previously recorded here was wrong on two counts.**

**Wrong artifact.** It verified TRD acceptance criteria. The implement chain already runs those:
each task ships its own unit tests, the phase gate runs `verify-app` plus the resolved battery,
and `/audit-build` checks traceability. Re-checking ACs adds a fourth pass over the same
question. **The unverified question is the PRD's — can a user actually do the thing the PRD says
they can do?** That is a different artifact and a different kind of check.

**Wrong iteration unit.** It put the gate in wiggum, blocking `Stop` until a condition held.
Wiggum's re-injection reaches the ORCHESTRATOR, whose unit of work is a phase workflow — so the
finest correction it can make is *re-run a phase*, and at worst re-run the graph. That is a
catastrophic granularity mismatch for "the login button 404s". Wiggum's existing job (do not stop
with tasks incomplete) is correctly scoped because its unit matches: task and phase. Verification's
unit is a **defect**, and it does not.

### The design: a parallel success-definition pass + a re-triggerable post-implement gate

**Owner proposal, 2026-08-17. This supersedes the remediation-phase sketch below it, and it is
better for a specific reason: it removes the upstream blocker.**

```
  DURING implementation (parallel, off the critical path)
    subagent reads the PRD -> "true functional success" definition
      independent of the TRD by construction: it never sees the TRD,
      so it cannot inherit the TRD's interpretation of the PRD

  AFTER everything else in /implement-trd
    verification agent runs TRUE end-to-end checks against that definition
      -> per criterion: PASS + evidence, or FAIL + evidence
      -> re-triggerable: a small step, cheap to run again
```

**Why this beats the previously-recorded design.** That one required `/create-prd` to name
evidence per functional requirement before anything could be built — upstream, expensive,
blocking. Deriving the success definition from the PRD at implement time removes that dependency
entirely. No format change, nothing to sequence first.

**Why parallel matters twice.** It costs no wall clock, and the independence is load-bearing: a
success definition written after reading the TRD would restate the TRD. Today's regression review
lens found two release-breakers precisely because it compared old against new instead of reviewing
the new code on its own terms — same principle.

**`verify-app` is a repointing, not a new capability.** It already carries Verification Level
Enforcement (`unit-only` / `live-required` / `e2e-required`) and already claims to confirm
software functionality rather than test execution. But it is TRD-scoped today — 26 TRD/acceptance
mentions, **zero** PRD mentions. Either repoint it or add a sibling whose input is the success
definition.

### How to verify is the PROJECT's responsibility; we supply hints and the loop

**Owner decision, 2026-08-17. This closes the "how do we exercise a system generically" question
by declining to solve it generically.**

We do not need a universal verification harness. We need:

1. **The promise** — the functional success definition, derived from the PRD in parallel with
   implementation (see above).
2. **An agent that knows HOW to test in this project** — and that knowledge belongs to the
   project, not to the framework: `CLAUDE.md`, `stack.md`, project memories, git history, the
   existing test suites.
3. **A bounded loop** against the promise.
4. **A clean report** of exactly where things stand.

**The framework supplies hints, not capability.** A stack-keyed table in the agent's prompt —
web UI → Playwright / browser driving; HTTP API → request/response transcripts diffed against the
declared interface; mobile → simulator harness; CLI → invoke and assert on output — steers the
agent toward the right tool. It does not implement any of them. A project with no browser harness
gets told so in the report rather than having one invented for it.

**This is an existing pattern, not a new one.** `verify-app` already reads `constitution.md` for
`verification_level` and honours per-task `[LIVE]` markers. Extending it to read `stack.md` and
project memory for *how* to exercise the system is the same move one level out.

### `.claude/verification-notes.md` — the verifier's OWN memory, agent-written

**Owner correction, 2026-08-17. I first proposed this as a governance doc and objected to
`verify-app` maintaining it. Both halves of that were wrong.**

This is not governance. It is the **disk half of the Ralph loop** — *"the file system instead of
conversation history as its memory."* A fresh context each iteration is only affordable if the
expensive discoveries persist. Without this file, every iteration rediscovers the boot sequence,
the health endpoint, the seeding step, and where the Playwright config actually lives.

Two different kinds of knowledge, and I collapsed them:

| | Owner | Lives in |
|---|---|---|
| **Governance** — how things SHOULD be: coverage floors, verification level, prohibited patterns | human, requires confirmation | `constitution.md`, `stack.md`, `CLAUDE.md` |
| **Learned mechanics** — how this app ACTUALLY works: boot time, health path, seed script, harness location, which env vars must be set | **the verifier**, by design | `.claude/verification-notes.md` |

An agent writing the second is not an agent rewriting policy. The 4.1.0 precedent I cited
(`learning.sh`, `save-remote-logs.js`) is about agents mutating governance and committing on
ambient triggers — a different thing from an agent keeping its own notes.

**Not in `.claude/rules/`.** That directory signals governance; putting agent-written notes there
invites exactly the confusion above. Committed, so the team and every future run share it.

**What it holds** — observations, not decisions:

- how the app starts, how long it takes, how you know it is ready
- the health/readiness path, and what a healthy response looks like
- setup steps a cold environment needs (seed scripts, migrations, fixture users)
- where the harness config actually is, and how to invoke it
- known-flaky checks and what makes them flake
- **what could not be verified, and why** — so a later run does not re-attempt a dead end

**Team decisions still belong to the owner.** Which shared instance is safe to exercise, whether
preview deployments exist, where secrets live — those are infrastructure policy, not observation.
They belong in `stack.md`, and the notes file may only record what it OBSERVED about them.

**Two disciplines this file needs, learned the hard way today.**

1. **Every note carries how it was established.** The `[read]` / `[ran]` / `[inferred]` markers
   already used in task grounding apply directly. *"Health path is `/healthz` `[ran]`"* is worth
   keeping; *"health path is probably `/health` `[inferred]`"* is a lead, not a fact.
2. **A note that fails must be corrected, never worked around.** If the file says `/healthz` and
   it 404s, the fix is to update the note — a stale note is worse than no note, because the next
   fresh context trusts it completely. This session wrote three successive wrong conclusions into
   a rule file before the data settled it; agent-written memory has the same failure mode and no
   reviewer.

**Security is unchanged:** the file is committed. It records WHERE credentials come from, never
their values.

### Grounding overturned three of those decisions (2026-08-17)

`/create-trd`'s grounding stage read the code and found three things in the design above that
**cannot be built as specified.** All three were mine. Recorded because the corrections matter
more than the original decisions.

**1. `D-9a-1`'s "append a remediation phase" is a SILENT NO-OP.**

`trd-parser.js`'s `findSection` (`:120`) bounds a section at *the next heading whose level is
<= the found heading's level*. So `## 4. Master Task List` ends at `## 5. Execution Plan`, and
`Task Grounding` ends at `## Open Questions`. **A phase appended after `## Could Not Verify` sits
outside every span the parser reads.** `parseTrd` returns zero new tasks, `buildGraph` returns no
waves, and the `Workflow(implement-phase, …)` dispatch **succeeds while doing nothing** — reading
as a completed remediation.

Grounding proved it by running the parser both ways: the same content inside `## 9. Task
Grounding` yields 7 ids and zero warnings; appended after `## Could Not Verify` it is invisible.

**Corrected to: INSERT at two points — inside §4 and inside §9.** Never append.

**2. Nothing can wait on a background agent, and nothing needs to.**

I specced the parallel success-definition pass as something Step 7.3 would *wait on*. Grounding
grepped every command: `run_in_background` appears once, in a list of primitives — **no command
performs a wait**, and the documented mechanism (`ScheduleWakeup` + the dispatch ledger) is
explicitly non-blocking.

**Corrected to: read the definition from disk; generate it inline if absent.** Step 7.3 runs at
the tail of the run, so the dispatch has long finished — there was never anything to wait for.
The design's own Ralph property (disk state, no conversation coupling) already made the wait
unnecessary, and I reached for a primitive that does not exist anyway.

**3. `trd_hash` has no producer.**

A task said "recompute `trd_hash`". Nothing in `packages/core/lib/` mentions it; on-disk state
files carry `"phase3_complete"` and `"phase-5-added"` in that field. Only an archived v3 command
ever described computing it.

**Corrected to: re-parse the mutated TRD, and do not touch `trd_hash`.** The real concern —
mutating the TRD mid-run invalidates the parse — is solved by re-parsing, which the design
already needs in order to pick up the inserted tasks. Hashing added nothing.

**Two pre-existing defects surfaced as a side effect**, neither caused by this feature:

- `implement-trd.md:800` prints `Unit Coverage (target: 80%)` / `Integration (70%)` while
  `constitution.md:197` sets `>= 60%` / `>= 50%`. The command prints a stricter target than the
  constitution it loads at Step 1.1.
- `implement-phase.js:189` states `verify-app` declares `disallowedTools: Agent`. Removed from
  all agents in constitution v1.3.0 — `grep` returns zero hits. The comment is false and is now
  load-bearing for two new tasks.

**What this says about the pipeline:** grounding is the stage that reads code, and it caught
three unbuildable specs in a design that had already survived five rounds of review. Buildability
remains the cheapest check and the one nobody performs.

### Resolved design decisions (2026-08-17)

**D-9a-1: remediation is a TRD PHASE dispatch, not a loose agent.**

I had drifted to writing *"agent(remediate: fix exactly verdict.gaps)"*, which leaves scope
unbounded — and an unscoped agent inside a loop that runs three times is how a fix for criterion 3
breaks criterion 1. That is the same file-conflict problem `task-graph.js` already solves, and a
bare agent call throws the solution away.

**Decision:** each verification failure becomes a task appended to the TRD as a remediation phase,
and the loop dispatches `implement-phase.js` for that phase — the same workflow the implement loop
already uses. It inherits, for free:

- wave partitioning and **file-conflict serialization** across simultaneous gap fixes
- `agentType` resolution (TRD assignment → keyword → `backend-implementer`)
- the phase gate: `verify-app`, `code-simplifier`, post-simplify re-verify, scoped review
- per-task `filesChanged` accounting, and `retry_count` / `current_problem` on disk

No new agent type. No new scope mechanism. The remediation step is a phase, and the loop is the
thing that decides whether to run another one.

**D-9a-2: the loop is OPT-IN — `/implement-trd --verify-functional`, default off.**

Three iterations of (judge + remediation phase) is roughly a 40% agent increase on a command whose
headline result is 1.0 agents per task, and the harness cost on top is unmeasured. Turning that on
for every run without a number would repeat the mistake this project keeps finding — shipping a
cost nobody priced.

It also matches existing convention: `/audit-build` is an expensive verification wave and is
invoked deliberately, not automatically. Default flips to on once a real run produces a cost
figure, which is a measurement, not a design question.

**D-9a-3: the promise lives at `.trd-state/<feature>/success-definition.md`.**

Markdown, one criterion per row: id, the functional statement, the **PRD line it cites**, the
evidence that would prove it, and how it was derived (`[read]` / `[inferred]` / `domain-derived`).
Sits beside `implement.json` because it is per-feature working state with the same lifetime.

**If the PRD yields no citable criteria, the pass writes that and the loop does not run.** An
empty success definition is a correct, reportable outcome. Inventing criteria to have something to
verify is the manufactured-requirement failure in its most expensive form — the invented criterion
generates remediation work that is then *executed*.

**D-9a-4: ordering and re-trigger.**

The loop runs at the very tail of `/implement-trd`, **after** Step 7's end-of-run hardening and
full-branch review — so the code being verified is the code after review fixes land, not before.

Re-triggering runs the loop again from current disk state: the success definition and prior gaps
are already persisted, so a re-trigger resumes rather than restarting. That is the Ralph property
doing real work — fresh context, disk state, no re-derivation.

### Loop bound: 3, plus a no-progress exit

**Not 50.** `wiggum.js`'s `DEFAULT_MAX_ITERATIONS = 50` was sized for a turn-by-turn per-task loop
and is meaningless here. This project's established convention is **3 attempts, then STUCK**
(`implement-trd.md:599`), and the verification loop should match it — an operator reading a STUCK
report should not have to learn a second retry rule.

**A raw cap is not enough on its own.** Add a convergence check:

```
  stop when   verdict.satisfied              -> success
  stop when   an iteration closes ZERO gaps  -> stalled, more attempts will not help
  stop when   iterations == 3                -> STUCK, report what remains
```

The middle condition is the valuable one and it is cheaper than the cap: an iteration that closes
3 of 5 gaps is converging and has earned another turn; one that closes none is repeating itself,
and two more rounds of the same will cost three agents apiece to learn nothing. This is the
`loop-until-dry` shape the Workflow docs already describe, inverted — stop when dry, rather than
continue until dry.

### The report is a deliverable, not a log line

"Exactly where we are" means, per success criterion:

| | |
|---|---|
| **status** | met / not met / **not verifiable here** |
| **evidence** | the artifact that proves it, or the reason none exists |
| **attempts** | what remediation tried, across iterations |
| **blocker** | for anything unmet after the loop ends |

**`not verifiable here` is a first-class outcome**, not a failure. A project with no browser
harness cannot have its UI criteria verified, and saying so plainly is worth more than a green
tick from a check that did not run — that failure shape has already cost this project a release
(`19/19` acceptance criteria met, four defects that would have broken every install).

### The loop is a WORKFLOW, not a Stop hook — and that is a true Ralph loop

**Owner proposal, 2026-08-17, and researching the original pattern confirms it.**

A genuine Ralph/Wiggum loop (Geoffrey Huntley, mid-2025) works like this:

> *"Each iteration starts with a **clean context window**, reads persistent state **from disk**,
> completes a bounded unit of work, and writes results back before restarting."*
> *"...using **the file system instead of conversation history** as its memory."*
> *"Progress does not lie in the model's memory but in the repository: in specifications, in a
> continuously updated plan, in tests, in Git history."*
> — codecentric, AgentPatterns.ai

**Fresh context is the point.** It is what prevents accumulation and degradation.

**Our `wiggum.js` is therefore not a Ralph loop.** It blocks `Stop` and continues the SAME
session, so context accumulates until compaction removes it — the exact failure Ralph's design
avoids. It is a nagging loop, not a fresh-context loop. (An earlier note in this plan claimed the
classic practice was to feed the transcript forward. That is backwards and is corrected here.)

**A workflow loop at the tail of `/implement-trd` is the correct implementation:**

```
  phase loop completes
    ↓
  Workflow(verify-functional):
    while (!satisfied && i < CAP) {
      verdict = agent(judge PRD success definition against the built system)   // fresh context
      if (verdict.satisfied) break
      agent(remediate: fix exactly verdict.gaps)                               // fresh context
      i++
    }
    return { satisfied, iterations: i, gaps: verdict.gaps }
```

| Ralph property | How the workflow satisfies it |
|---|---|
| fresh context per iteration | every `agent()` call is a fresh context by construction |
| state on disk, not conversation | `implement.json`, the success definition, evidence artifacts |
| deterministic driver | the script's `while` — same role as Ralph's shell loop, better tooling |
| bounded unit of work | one verify → judge → remediate cycle |
| hard stop condition | `verdict.satisfied === true`, plus an iteration cap |
| *"if a test suite can confirm completion, Ralph can probably get there"* | the success definition IS that confirmation |

**The split is the strength: control flow deterministic, judgment delegated.** The workflow decides
whether to loop; the agent decides only whether the promise is met. That is stronger than the
original shell-loop Ralph, which has no structured verdict and simply re-runs until a human looks.
It also sidesteps the `stop_hook_active` bypass entirely — there is no `Stop` to block, so a
determined stop cannot defeat it.

**This also answers "what changes between iterations":** the judge returns `gaps`, and the
remediation agent receives exactly those. Not "try again" — a specific list, from disk.

**Placement:** a workflow at the tail of `/implement-trd`, after the last phase and after the
end-of-run review. Re-triggerable on its own, because a workflow invocation is just a call.

### The two things this design still owes

**1. What changes between iterations.** Re-running a verifier against unchanged code returns the
same answer. "Re-triggered many times, iterating toward the solution" needs a remediation step
between runs. The remediation-phase mechanism below still applies — appending gap tasks and
running `/implement-trd --phase N` — but it is far lighter here, because the success definition
gives precise targets rather than a vague gap list.

**2. The success definition is an INTERPRETATION and can manufacture.** An agent asked "what does
true success look like?" will produce criteria whether or not the PRD supports them. That is item
10's exact failure, in a new place. It needs the discipline the generators already carry:

> **Every success criterion cites the PRD line it derives from. A criterion that cannot cite one
> is dropped, not invented.** Domain-derived criteria (a payment flow must not double-charge) are
> permitted but must be labelled as such, exactly as `/create-trd` labels domain-derived
> objectives.

Without that rule the verifier tests requirements nobody wrote, and its failures generate
remediation work nobody asked for — the most expensive possible form of manufactured requirement,
because it is executed rather than merely read.

### Evidence, still — that part survives

A functional requirement is verified by an ARTIFACT, not an assertion. `status: "success"` is
settable by an agent; *"a screenshot at `evidence/AC-3.png`, newer than HEAD, showing the
post-login dashboard"* is not. Two tiers: existence and freshness are deterministic and cheap;
content (does the screenshot show it, does the response match the contract) is one agent per
artifact and only runs on artifacts that passed tier 1.

This still implies **the PRD must name its evidence per functional requirement**, which is a
change to `/create-prd` — same shape as the `Touches`/`Replaces` grounding `/create-trd` already
demands. Without it a verifier invents what proof looks like, which is the manufactured-requirement
failure item 10 exists to prevent.

### What drives the outer loop

`/goal` with a machine-checkable condition on the verification artifact — *"`/verify-prd` reports
zero failures"* — not wiggum. Re-running verification is the loop's natural checkpoint, and it is
far cheaper than re-running the implementation graph.

### Open, and worth resolving before building

- **Cost per verification cycle.** Exercising a live system per functional requirement is the
  expensive part. Unknown whether a full re-verify per fix is affordable, or whether it should
  re-check only the failed requirement plus a regression subset.
- **How to exercise a system generically.** Playwright covers web UI; API contracts need request
  transcripts diffed against a declared interface. A CLI or worker has neither. The command may
  have to declare which harness applies, or the PRD may.
- **What `/verify-prd` does when the PRD has no evidence fields yet** — degrade to reporting
  which requirements are unverifiable, rather than guessing.

**Done when:** a command exists that (1) verifies delivered artifacts in a realistic install /
refresh layout rather than the dev checkout, (2) diffs against the prior version for silently
dropped capability, (3) runs live functional assertions from a Completion Promise, and
(4) reports what it could NOT verify. Its first run must be against a TRD it did not author.

---

### 9-original. Native quality gates and worker loops (retained for reference)

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
>
> **Extended 2026-08-15 — split into create / refine / audit, and profiled.** The
> verification wave moved out of `create` into standalone `/audit-prd` and `/audit-trd`,
> which re-derive their own index from the document and therefore run on ANY artifact,
> including one written by hand years ago, and more than once. `--light` was dropped —
> `create` *is* light now. `refine` gained interactive and `--auto` modes consuming
> `## Open Questions`; `audit` consumes and rewrites `## Could Not Verify`, so every
> artifact carries its own verification state.
>
> Measured end-to-end on two codebases (ensemble-vnext + herald), non-interactive:
> PRD $32.70 → $21.49 create+audit (−34%); TRD $76.25 → $67.75 (−11%); tasks on the same
> feature 43 → 12. Full profile and the pre-registered rubric:
> `docs/modernization/runs/profile/RESULTS.md`.
>
> **One pre-registered failure condition triggered:** an author cited a design document as
> evidence that `sanitize_error_detail()` exists. It does not. Both create workflows now
> require a source-file citation for any claim that something IS built — a mechanism, where
> the corpus rule had been only a prohibition. Two defects in the audit workflow itself were
> found by running it (`18faa57`, `2d90735`) and one delivery bug by scaffolding it
> (`fb72dbf`) — none were visible in review.

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

- **`packages/full/commands/router` is a dangling symlink.** It points at `../../router/commands`,
  which does not exist — `packages/router/` holds only `hooks/` and `tests/`, and no
  `generate-router-rules` command exists anywhere in the tree. Found 2026-08-16 while correcting
  the founding TRD's component table, which listed it as a live component. A scaffold does not
  currently break on it, but it is a dangling reference inside the shipped plugin and should
  either be removed or the commands written. Note the founding TRD had claimed it for months.

- **Add an internal-consistency verifier to the audit wave — TRD row vs TRD row.** Found
  2026-08-16 by `ITR-T002` while reading its own prerequisites. `implement-trd-rework.md`
  §4.5:721 asserts that `ITR-B015` extended the smoke fixture to a multi-task, multi-phase
  TRD. `ITR-B015`'s own row and grounding block at §4.5:701 claim nothing of the sort — they
  scope it to a bullet-list→table conversion and note *"Overlaps `ITR-T002`'s Touches"*,
  which implies `T002` was expected to do the extension itself. Two adjacent rows in one
  section, one asserting a deliverable the other never promised.

  **Both `/refine-trd` and `/audit-trd` ran over this document and neither caught it**, which
  is the part worth acting on. The five verifiers each traverse a different axis and none of
  them is this one: `omission-audit` goes source→TRD, `derivation-audit` goes task→objective,
  `design-audit` asks whether a decision is buildable, `deterministic` resolves citations
  outward. Nothing compares what one task row says a *sibling task* delivers against what
  that sibling's own row and acceptance criteria claim. It is a cheap check — the assertions
  are adjacent and both are already parsed — and the failure it catches is expensive, because
  a task that believes its prerequisite is done starts work that cannot succeed.

  Note the shape: this is not a hallucinated requirement or a dropped one, the two failure
  modes the wave was built around. It is a **cross-reference internal to the artifact**, and
  it survived precisely because every existing verifier looks outward.

- **A subagent's idle notification means "turn ended", not "work stopped" — the lead has no
  way to tell them apart.** Observed 2026-08-16. `ITR-T002` dispatched three real headless
  `/implement-trd` runs and ended its turn, because **a subagent has no primitive that blocks
  and waits inside one turn** for a multi-minute external process: `ScheduleWakeup` is removed
  from subagents by the platform's tool filter, so dispatch-then-end-turn is the only shape
  available. From the lead's side that is indistinguishable from an agent that gave up. This
  orchestrator read `stop` in the ledger, saw nothing on disk, and concluded the agent had
  stopped without working — wrong, and it cost a nudge round-trip. Three `claude --print`
  processes were alive the whole time (verified by PID).

  It compounds with the known `blocked`-row gap: since the prompt-hook conversion nothing
  writes a `blocked` row, so `dispatch-ledger.js --open` cannot separate "finished",
  "blocked-and-resumed" and "mid-flight between turns". This agent's ledger read
  `stop / stop / start / stop` on a single `agent_id` — resumption churn that looks like
  completion.

  The lesson is the cheap half: **the ledger is necessary but not sufficient, and the check
  that actually resolved it was looking at the world** — `ps` for live PIDs, `wc -l` on the
  output logs twice a few seconds apart. Before concluding a subagent has stopped, check
  whether its work is still running. A fix worth considering is having dispatching agents
  write their PIDs somewhere the lead can poll, so "is it alive" does not depend on the lead
  guessing which process to look for.

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
