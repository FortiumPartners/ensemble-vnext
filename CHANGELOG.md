# Changelog

All notable changes to ensemble-vnext are documented in this file.

## [3.3.5] - 2026-05-29

Patch release fixing a real limitation in 3.3.4's notification story: the Stop-hook
`notify.sh` fires on EVERY turn end — including dispatch turns and ScheduleWakeup
re-entries during multi-turn commands — so it can't reliably distinguish "the command
finished" from "we just spawned background work and idled." 3.3.4 hinted at a
transcript-grep gate as a workaround; this release adopts the right primitive instead.

### Changed

- **`command-status.md` rewritten notification section into two paths:**
  - **Path A — `PushNotification` (preferred for completion alerts).** The model calls
    Claude Code's native `PushNotification` tool **directly from the command's final
    turn** as part of the same atomic gesture that emits `═══ COMMAND COMPLETE ═══`.
    One precise fire when the command is done, zero false positives during intermediate
    Stops. Notification is delivered via Claude Code's own surfaces (desktop notification
    in the terminal where the session runs; if Remote Control is connected, also push to
    the user's phone).
  - **Path B — `notify.sh` Stop hook (orchestration / external integration).** Unchanged
    behavior; documented as the right path for webhook triggers, signal files, queue
    messages, tmux pings to a parent pane — anything that legitimately wants every Stop
    event.
- **All 7 long-running commands** (`/implement-trd`, `/implement-trd-team`,
  `/verify-trd-team`, `/harden-trd-team`, `/fix-issue`, `/create-prd-team`,
  `/create-trd-team`) — Output Discipline section gained a step 5 instructing the model
  to call `PushNotification({status: "proactive", message: "<cmd> done: <one-line
  summary>"})` from the FINAL turn only (never DISPATCHED, RESUMED, or PHASE turns).
  Same pattern for `COMMAND STUCK` with Reason + Next embedded in the message so the
  user knows what to come back and unblock.
- **Short one-shot commands** intentionally NOT updated — the user is watching their
  turn; a desktop ping would be noise. The COMMAND COMPLETE banner alone is sufficient
  signal. Per the `PushNotification` tool's own guidance ("err toward not sending one").
- **Notification budget rules documented** in the rule, lifted verbatim from the
  PushNotification tool: under 200 characters, one line, no markdown, lead with what
  the user would act on, err toward not sending. Distinguishes notifications that drive
  action from notifications that just announce.

---

## [3.3.4] - 2026-05-29

Patch release giving every workflow command a uniform, visually unmistakable completion
signal so the user always knows when a command is truly done versus mid-flight. Closes a
recurring "is it done yet?" friction point.

### Added

- **`.claude/rules/command-status.md`** — new framework-shipped rule defining the standard
  status-emission contract for every command:
  - **`[STATUS: /<cmd>] DISPATCHED → ...`** when a turn ends with work in flight
  - **`[STATUS: /<cmd>] RESUMED → ...`** at the start of a wake/message-driven turn
  - **`[STATUS: /<cmd>] PHASE N/M COMPLETE → ...`** at each phase boundary
  - **`═══ COMMAND COMPLETE: /<cmd> ═══`** as the **last line** of the command's final
    turn (box-drawing chars make it impossible to miss in terminal output)
  - **`═══ COMMAND STUCK: /<cmd> ═══`** with `Reason:` and `Next:` on unrecoverable
    failure
  Shipped via the framework-rules folder, so `/init-project` and `/rebase-project` copy
  it to every project automatically.
- **Constitution gains Prohibited Pattern #7: "No silent completion"** referencing the
  rule. A command that ends silently is now a documented bug. Mirrored in the
  `constitution.md.template` so new projects inherit the rule.
- **Inline output-discipline section added to all 18 workflow commands** so the model
  doesn't depend on reading the rule. Long-running commands (`/implement-trd`,
  `/implement-trd-team`, `/verify-trd-team`, `/harden-trd-team`, `/fix-issue`,
  `/create-prd-team`, `/create-trd-team`) get the full DISPATCHED + RESUMED + PHASE +
  COMPLETE pattern; single-turn commands get the COMPLETE banner instruction.
- **Notification recipes documented** in the new rule for the existing `notify.sh` Stop
  hook (`NOTIFY_ON_STOP` env var). Concrete copy-pasteable recipes for: macOS desktop
  notification + terminal bell, plain bell, Slack webhook. Includes guidance for the
  noisy-on-every-stop concern (gate the alert by `grep -q "COMMAND COMPLETE"` against
  the transcript when only end-of-command alerts are wanted).

### Why

You should never have to ask "is it done?", "what's it waiting for?", or "did it stall?"
Three banners — DISPATCHED, RESUMED, COMMAND COMPLETE — answer those three questions at a
glance. The COMMAND COMPLETE banner is intentionally visually heavy (`═══`) so it's
easy to find when scanning long output. Optional desktop notification via the existing
`notify.sh` hook closes the loop for long-running unattended runs.

---

## [3.3.3] - 2026-05-29

Patch release closing a real architectural gap in team-mode orchestration: when the lead
session spawns teammates via `Agent({team_name, ...})` and ends its turn, Claude Code's
auto-re-invocation on inbound teammate `SendMessage` deliveries is **not reliable**.
Observed failure: teammates complete, send their reports, the lead idles, and no new turn
fires until the user types the next prompt — messages queue indefinitely; the long-running
orchestration loop stalls.

### Fixed

- **Team-spawn safety-net pattern added to `/implement-trd-team`, `/create-prd-team`,
  `/create-trd-team`**. Each command now includes a MANDATORY Step 2a / 3a directly after
  the `Agent({team_name})` spawn that requires pairing with
  `ScheduleWakeup({delaySeconds: 1200, prompt: "<re-enter the command>"})`. If auto-
  delivery does fire, the scheduled wake is a harmless no-op; if it stalls, the wake
  catches the mailbox within 20 minutes. This is the documented re-invocation belt —
  treat it as non-optional. (`/harden-trd-team`, `/verify-trd-team`, `/fix-issue`
  inherit via their reference to `/implement-trd-team` Step 4.)
- **`async-discipline.md` rule updated** to declare `Agent({team_name})` partial async
  that requires pairing — explicitly NOT one of the four self-sufficient async
  primitives. New section "`Agent({team_name})` — partial async, requires pairing"
  documents the observed stall, the pairing requirement, and notes that the Stop-hook
  guard is conservative (accepts non-empty `background_tasks` as sufficient, which is a
  false-positive of safety in the team case) — correctness is enforced at the command
  level via the mandatory Step 2a/3a.
- **Rule template synced** so new projects scaffolded via `/init-project` and existing
  projects rebased via `/rebase-project` both get the updated rule documenting the
  pairing requirement.

### Known follow-up

The Stop-hook guard (`async-discipline.js`) currently accepts any non-empty
`background_tasks` as satisfying the async-claim check — including teammates spawned via
`Agent({team_name})`. A more sophisticated guard would distinguish "background work
in flight" from "lead has a re-invocation path" and flag claims like "waiting on teammate
reports" when no `session_crons` / `Monitor` / `/goal` is paired with the team spawn.
Deferred to a follow-up PR; the command-level enforcement above closes the practical gap.

---

## [3.3.2] - 2026-05-28

Patch release fixing a latent bug across all native-team-mode commands: teammates were
producing report XML as plain text and going idle, but the lead never saw the reports —
in native team mode (`Agent({team_name, ...})`), plain text output is invisible to the
lead and only `SendMessage` delivers. Reports were stuck in teammate transcripts.

### Fixed

- **`/create-prd-team`, `/create-trd-team`, `/implement-trd-team`** — added an explicit
  **Report Delivery** section after each command's XML contract documenting that
  teammates MUST conclude their turn with a `SendMessage({to: "team-lead", summary,
  message})` call carrying the full `<teammate_report>` payload. The SendMessage tool
  docs state plainly: *"Your plain text output is NOT visible to other agents — to
  communicate, you MUST call this tool."* The commands were originally authored against
  the older `Task` tool pattern (where the agent's final text is returned to the caller);
  the native team model is different — teammates are long-running and communicate via
  `SendMessage` only.
- **Teammate prompts updated to make delivery explicit** — every teammate prompt in
  `/create-prd-team` (3 prompts) and the briefing template in `/create-trd-team` now
  include a concrete `SendMessage` example with the right `to`/`summary`/`message` shape
  and the closing instruction "Conclude your turn with the `SendMessage` call — then go
  idle." `/implement-trd-team`'s teammate template gained the same delivery contract for
  per-task and final-completion status messages.
- **Wait instructions clarified** — lead-side "wait for all teammates" lines now say
  "wait for `SendMessage` deliveries" with explicit recovery guidance: if a teammate
  idles without sending, re-prompt them via `SendMessage` with an instruction to call
  the tool. A teammate going idle does NOT mean it delivered — only a received
  `SendMessage` does.

`/harden-trd-team`, `/verify-trd-team`, and `/fix-issue` inherit the fix via their
reference to `/implement-trd-team`'s orchestration mechanics — no direct edits needed.

---

## [3.3.1] - 2026-05-28

Patch release fixing real bugs in `/rebase-project` discovered during the first downstream
rollout of 3.3.0. All fixes are to the `rebase-project.md` command prompt; no runtime
code or agent/skill changes.

### Fixed

- **`/rebase-project` v1.0.0 → v2.0.0** — non-interactive, content-diff, always-backup.
  Three bugs in v1.0.0: (1) existing agents were never updated even when the plugin's
  content changed — frontmatter updates, sharpened descriptions, new skill lists never
  propagated; (2) skills only checked stack-match, never content drift — `paths:` globs,
  `when_to_use` rewrites, currency-check sections never propagated to existing projects;
  (3) blocked on `AskUserQuestion` with four options. Rewritten to byte-diff every shipped
  file against the plugin and replace any that differ, always create a timestamped backup,
  proceed without prompting. Removed the `--force` flag (its old semantics is now the
  default). `--dry-run` and `--preserve-all` retained.
- **Permitter subdirectory layout preserved by rebase.** v1.0.0's hook discovery scanned
  for flat `*.js` files and would have flattened the correct installed layout
  (`.claude/hooks/permitter/permitter.js` + `permitter/lib/*`) back to a flat
  `.claude/hooks/permitter.js`, losing the `lib/` files and breaking the `settings.json`
  reference. Added "Install-time layout transformations" section documenting the permitter
  + core-lib subdirectory layouts; added `permitter/permitter.js`, `permitter/lib/*.js`,
  and `lib/*.js` to the explicit install-path table; added a settings.json sanity check
  that fixes stale flat references rather than flattening the hook.
- **AI-ecosystem skill mapping in `/rebase-project` table.** The skill-matching table in
  §2.2 was missing the 5 new AI skills shipped in 3.3.0 (`using-langfuse`,
  `building-rag-pipelines`, `building-agent-memory`, `building-tool-orchestration`,
  `using-pgvector`). Result: rebases on AI projects mapped only the provider skill
  (`using-openai-platform`) and missed everything else. Added all 5 rows plus capability-
  inference hints ("Langfuse" / "RAG" / "tool calling" / "agent memory" / "pgvector") so
  the right skills land even when `stack.md` doesn't name them explicitly. Added a "when
  in doubt, include the skill" note — skills are lazy and cost nothing until invoked.

---

## [3.3.0] - 2026-05-28

Claude Code modernization release. Brings the plugin into line with the current Claude Code
subagent / skill / command frontmatter spec and team-orchestration model; introduces an AI-
feature specialist (`agent-implementer`) plus the LLM-ecosystem skill library that supports
it; and closes several structural gaps the framework had been documenting-but-not-enforcing
(fire-and-forget async claims, cold session starts, lost decision trail on compaction).

Full assessments + rationale: `docs/modernization/2026-05-claude-code-alignment.md` (Phase 1)
and `docs/modernization/2026-05-phase2-recommendations.md` (Phase 2).

### Added

#### New specialist & AI-ecosystem skills
- **`agent-implementer` subagent** — the 13th specialist. Builds AI features end-to-end: LLM
  SDK integrations, RAG pipelines, agent loops, tool calling, agent memory, prompt
  observability/evals — with currency verification, retries, cost/latency awareness, and PII
  discipline baked into the role. Plugin manifest updated (`agents: 13`); `/implement-trd`
  agent-routing table gained a row for LLM/agent/RAG keywords → `agent-implementer`.
- **5 new AI-ecosystem skills** under `packages/skills/`:
  - **`using-pgvector`** — Postgres-native vector storage (HNSW/IVFFlat, vector/halfvec/sparsevec,
    distance ops, hybrid filters, raw SQL + Prisma + SQLAlchemy patterns). Postgres-native
    alternative to `using-weaviate`.
  - **`building-rag-pipelines`** — End-to-end RAG architecture (chunking, embedding, retrieval,
    reranking, citation/grounding, evaluation). Provider- and store-agnostic; delegates
    wire-level concerns to the provider and vector-store skills.
  - **`building-agent-memory`** — Conversation buffer, summary memory, vector-backed long-term,
    hierarchical (working/short/long), eviction/compaction, PII redaction.
  - **`building-tool-orchestration`** — Modernized cross-provider tool-calling: agent loop,
    parallel tool calls, dynamic tool selection for large tool sets, failure recovery
    (retry → fallback → escalate), structured outputs.
  - **`using-langfuse`** — Prompt observability (tracing, prompt versioning, eval datasets,
    A/B testing, cost/latency, multi-provider integration). Designated default observability
    skill.
- **LLM-platform skills added to `backend-implementer`** so backends that ship AI features
  have first-class access alongside the new `agent-implementer`: `using-anthropic-platform`,
  `using-openai-platform`, `using-perplexity-platform`, `building-langgraph-agents`,
  `using-weaviate`.

#### Phase 2 structural primitives
- **Async-discipline rule + Stop-hook guard** (`.claude/rules/async-discipline.md` +
  `packages/core/hooks/async-discipline.js`). Addresses a real recurring failure mode: an
  agent claims "I'll let you know when done" / "running in the background" but uses no
  actual async machinery, then sits idle until the user nudges (hallucinated notification).
  The Stop hook scans the last assistant turn for fire-and-forget claims; if a claim is
  present without any of the four legitimate async primitives in flight
  (`Agent({run_in_background: true})`, `ScheduleWakeup`, `Monitor`, `/goal`), the Stop is
  BLOCKED with a reason explaining the options. Constitution gains Prohibited Pattern #6
  referencing the rule.
- **SessionStart context hook** (`packages/core/hooks/session-context.js`). On every new
  session, reads `.trd-state/current.json` and surfaces the in-flight feature (PRD/TRD
  paths, task progress from `implement.json` or assertion verdicts from `verify.json`)
  into `additionalContext`. Removes the "remind me what we're working on" friction.
- **PreCompact decision-trail archiver** (`packages/core/hooks/precompact.js`). Before
  `/compact` (or auto-compaction at ~95%), appends a structured checkpoint to
  `.trd-state/<feature>/session-log.md`: timestamp + trigger, PRD/TRD, phase, strategy,
  branch, in-flight tasks (id + cycle + `current_problem`), tasks in retry, last 5
  completions, and a **Decisions & rationale (model: fill on resume)** stub. State records
  *what*; the log records *why* — both survive compaction.
- **Skill `paths:` globs for stack-specific auto-activation** (35+ skills). Language,
  framework, ORM, test-runner, vector-store, infra, and platform skills now declare
  `paths:` so Claude Code's native selector only auto-activates them when matching files
  are present (`developing-with-react` doesn't fire on a pure-backend session because the
  word "component" appeared; `rails` doesn't fire in a Python project).

#### Tooling, frontmatter, governance
- **`verify-goal` skill** (`packages/skills/verify-goal/SKILL.md`) — single-session,
  `/goal`-drivable live verification. The skill supplies the *structure* (per-assertion
  `verify.json` contract); `/goal` supplies the *loop*. `/verify-trd-team` emits a
  ready-to-paste `claude -p "/goal …"` invocation at preflight as the autonomous
  alternative to its team-based loop.
- **`effort` frontmatter on all 13 subagents** — `technical-architect: xhigh`; PM /
  spec-planner / code-reviewer / app-debugger / code-simplifier: `high` (code-simplifier
  uses `opus/medium`); implementers / verify-app / devops / cicd: `medium`.
- **`argument-hint` frontmatter on every arg-taking command** — `implement-trd`,
  `fix-issue`, `verify-trd-team`, `harden-trd-team`, `implement-trd-team`,
  `investigate-issue`, plus the PRD/TRD authoring family and lifecycle commands.
- **`disable-model-invocation: true`** on user-only commands: `init-project`,
  `rebase-project`, `create-prd`, `create-prd-team`, `refine-prd`, `create-trd`,
  `create-trd-team`, `refine-trd`, `augment-trd-figma`.
- **`when_to_use` on all 56 skills** with explicit disambiguation between overlapping
  families (smoke-test-*, per-language test runners, detectors as "run-first-then-handoff",
  the Playwright trio, SDK / platform-manager / infra boundaries).
- **Framework-shipped vs user-owned rules split** in `.claude/rules/`:
  - **User governance** (`constitution.md`, `stack.md`, `process.md`) — generated/customized
    at `/init-project`; `/rebase-project` NEVER modifies.
  - **Framework-shipped** (`async-discipline.md`, plus any future `.md` in
    `templates/claude-directory/rules/`) — copied-if-missing on BOTH init AND rebase.
    Folder-driven; the next framework rule is a drop-in.
- **Agent teams shipped enabled** — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the template
  `settings.json` so `*-team` commands work out of the box.
- **Modernization roadmap docs** (`docs/modernization/2026-05-claude-code-alignment.md`,
  `docs/modernization/2026-05-phase2-recommendations.md`) capturing per-mechanism analysis,
  decisions, and tracked follow-ups.

### Changed

- **Subagent dispatch renamed** `Task(subagent_type=…)` → the **`Agent`** tool across
  `implement-trd`, `implement-trd-team`, `harden-trd-team`, `verify-trd-team`, `fix-issue`,
  `create-prd-team`, `create-trd-team`. Added a "Task vs Agent (do not conflate)" note so
  the `TaskCreate / TaskUpdate / TaskList / TaskGet` work-list verbs stay distinct from
  the spawner.
- **`router.py` slimmed 841 → 126 lines** — replaced keyword-routing against
  `router-rules.json` with a single static "leverage the framework" reminder + a judgment
  clause ("skip for trivial / informational replies"). Fixes misfiring on analysis turns.
  New env: `ROUTER_DISABLE=1`. Tests rewritten end-to-end via subprocess (25 passing).
- **Team commands aligned to native shared-tree model** — research confirmed Agent Teams are
  designed around a *shared* working tree + file ownership + shared task list (`blockedBy`
  + file-locked claiming) + direct commits; `isolation: worktree` is opt-in for
  *independent* cross-feature work with no documented auto-merge. `implement-trd-team`,
  `create-prd-team`, `create-trd-team`, and `fix-issue` API modernized:
  `Teammate({operation:"spawnTeam"})` → `TeamCreate`; `Task({team_name,…})` →
  `Agent({subagent_type, team_name, name, prompt})`; `SendMessage` shutdown uses
  `{to, message:{type:"shutdown_request"}}`; cleanup → `TeamDelete`. Added Workspace-model
  note; reframed Step 3.3 as **File Ownership** (native safety mechanism).
- **Agent skill lists reconciled with the 56-skill library** (over-listing intentional;
  `init-project` downsizes per project). Orphaned skills assigned to the right specialists
  (devops gains `kubernetes/helm/aws-cloud/flyio/cloud-provider-detector/tooling-detector`;
  verify-app gains the `smoke-test-*` family + `test-detector`; cicd gains
  `act-local-ci/changelog-generator/flyio`; implementers gain `rails/phoenix/blazor` and
  `git-town`; PM / spec-planner / technical-architect picked up issue-tracker + detector
  skills).
- **Currency-check pattern enforced across all LLM-ecosystem skills** (`using-anthropic-platform`,
  `using-openai-platform`, `using-perplexity-platform`, `building-langgraph-agents`,
  `using-weaviate`). Each gains a forceful "**Stay current**" section requiring `WebFetch`
  of provider-specific docs/pricing/changelog URLs **before** recommending a model, comparing
  options, or citing pricing — citing source URL + fetch date in deliverables. The directive
  is mirrored in each skill's `when_to_use`. Existing "Models" tables flagged with ⚠️
  verify-current callouts. All 5 new AI-ecosystem skills inherit the pattern.
- **Template `settings.json` reconciled** with the working runtime — fixed `Stop` hook
  (was mis-running `learning.sh`; now `async-discipline.js → wiggum.js → notify.sh`); all
  hook commands use a 3-strategy CWD-resolution wrapper (`CLAUDE_PROJECT_DIR` → silenced
  `git rev-parse` → `pwd`); registered the new `SessionStart`/`PreCompact` hooks; shipped
  the teams flag. Template and dogfood `settings.json` are byte-identical.
- **`implement-trd.md` cycle_position enum** — resume table and stageOrder constant now
  cover the full on-disk enum (`implement | verify_red | verify | debug | simplify |
  verify_post_simplify | review | update | complete`), with explicit anchor mapping into
  the four stage groups. Previously truncated to 4 values; a `--resume` on `verify_red`,
  `debug`, `verify_post_simplify`, `update`, or `complete` fell through to "resume from
  implement" and re-did work.
- **`implement-trd.md §5.4` + `verify-trd-team.md`** document the `session-log.md`
  convention so the post-compaction model knows to re-read it and backfill rationale.
- **Sharpened routing descriptions** for the 5 most-confused specialists (longer,
  imperative descriptions with USE/DO-NOT-USE clauses and examples): `app-debugger` is now
  explicit "debugger of LAST resort"; `backend-implementer ↔ agent-implementer` boundary
  spelled out both ways; `devops-engineer` vs `cicd-specialist` boundary explicit.
- **Capture model:** the `SessionEnd` hooks (`learning.sh`, `save-remote-logs.js`) are
  deliberately removed. Learning capture now flows through explicit `/update-project`;
  native file-based memory (`MEMORY.md`) is documented as the *personal/per-machine*
  complement to the *committed/team-shared* CLAUDE.md layer.
- **`status.js`** SubagentStop hook header rewritten to accurately describe the
  complementary design (command sets cycle_position on entry; hook advances on subagent
  completion).
- **`init-project.md` hook enumeration** updated to the current 9-hook set
  (`permitter/permitter.js, router.py, formatter.sh, status.js, wiggum.js, notify.sh,
  async-discipline.js, session-context.js, precompact.js`); `learning.sh` removed
  throughout.
- **`augment-trd-figma.md` frontmatter** — replaced non-standard `user_invocable: true`
  with `disable-model-invocation: true`.
- **`fold-prompt.md` / `cleanup-project.md` / `update-project.md`** got `version` /
  `category` / `argument-hint` frontmatter for consistency with the rest of the suite.

### Fixed

- **`/rebase-project` no longer leaves stale agents/skills/commands behind.** Three
  bugs in the previous implementation: (1) agents were PRESERVED whenever they existed
  locally — content changes from the plugin (frontmatter updates, sharpened descriptions,
  new skill lists) never propagated; (2) skills were checked for stack-match only — content
  drift (`paths:` globs, `when_to_use` rewrites, currency-check sections) never propagated;
  (3) the command blocked on `AskUserQuestion` with four options including a confusing
  "preserve existing skills" choice. Rewritten to: byte-diff every shipped file against the
  plugin and replace any that differ, always create a timestamped backup before replacing,
  non-interactive by default (display summary then proceed; `--dry-run` and
  `--preserve-all` remain as opt-in modes). Command bumped to v2.0.0.


- **`wiggum.js` autonomous loop was abandoning incomplete work every other Stop event.**
  A self-managed `stop_hook_active` flag (set on block, cleared+exit on next call) made
  the hook alternate block → allow-exit regardless of completion. Removed; the
  infinite-loop guard is now solely the iteration cap + completion detection. Real-fs
  sandbox verified 5 sequential Stops all `block`, all-tasks-complete → `ALLOW-EXIT`.
- **`status.js` over-advanced `cycle_position` during DEBUG retries.**
  `advanceCyclePosition()` now SKIPS when the in-progress task has `retry_count > 0` or
  `current_problem` set — both signal the command has put the task into a DEBUG cycle and
  will re-dispatch verify after `app-debugger`. Added `'verify_red'` to `CYCLE_ORDER`
  (advances to `'implement'`) for TDD support.
- **Async-discipline false-positives on meta-discussion** (two iterations from real fires):
  - `stripCitations()` removes fenced code blocks, inline code spans, double-quoted
    strings before matching; single-quoted strings are stripped only when both quotes sit
    on word/sentence boundaries (preserving contractions like `don't`, `I'll`, `it's`).
  - `META_MARKERS` skips matches preceded within ~80 chars by `something like` /
    `for example` / `phrases like` / `the phrase` / `e.g.` / etc.
  - `readLastAssistantText` enforces a strict **turn boundary** — only scans assistant
    text produced AFTER the most recent user message, so earlier turns and hook-injected
    BLOCK_REASON content (user-side) can no longer leak into the scan.
  - `SELF_DOC_MARKERS` bypasses the entire match check when the text contains
    `[ASYNC-DISCIPLINE GUARD`, `async-discipline.md`, `async-discipline.js`, or the term
    `fire-and-forget` — self-evident meta-discussion.
- **`/init-project` no longer false-positives "existing installation" on a bare `.claude/`
  directory.** Detection now requires an **ensemble fingerprint** (`.trd-state/` dir, or
  `.claude/rules/constitution.md`, or `.claude/settings.json` with an `"ensemble"` block,
  or one of our specialist agent files in `.claude/agents/`). If `.claude/` exists without
  fingerprint → treated as greenfield-with-existing-`.claude/`: scaffold around it, preserve
  user files, merge the `ensemble` block into any pre-existing `settings.json`.
- **Hooks no longer break silently when `git` is missing or the directory isn't a repo.**
  Old wrapper `bash -c 'cd "$(git rev-parse --show-toplevel)" && X'` failed silently when
  git errored. New wrapper tries `CLAUDE_PROJECT_DIR` → silenced `git rev-parse` → `pwd`
  fallback. Applied across both template and dogfood `settings.json` (all hook commands,
  both JSON-valid).
- **Permitter scaffold dropped its `lib/` files silently.** The scaffold read the symlink
  target as a relative path, then resolved `[[ -d lib_dir ]]` against the *target project*'s
  CWD instead of the plugin dir, so `matcher.js` / `allowlist-loader.js` /
  `command-parser.js` never landed. Now anchored to the symlink's directory via
  `cd && pwd`. BATS scaffold suite: **42/42** (was 41/42).
- **`validate-init`** had the wrong permitter path (`permitter.js` vs the actual
  `permitter/permitter.js`), so it always reported "Missing required hook: permitter.js"
  even on a correctly scaffolded project. Path corrected. `validate-init` also now checks
  for `.claude/rules/async-discipline.md`.
- **`verify-app` had invalid `color: magenta`** per the current subagent spec (allowed:
  red/blue/green/yellow/purple/orange/pink/cyan). Changed to `pink`.
- **`app-debugger` body referenced a non-existent skill `playwright-test`.** Corrected to
  `writing-playwright-tests`.

### Removed

- **`router-rules.json` plumbing** (vestigial after the slim router):
  - Commands: `generate-router-rules`, `generate-project-router-rules`.
  - JSON files: all `router-rules.json` copies under packages/templates/dogfood.
  - References across `init-project.md`, `update-project.md`, scaffold, BATS tests,
    rebase docs.
- **`SessionEnd` hook block** (`learning.sh` + `save-remote-logs.js`) from both template
  and dogfood `settings.json`. Capture moved to explicit `/update-project`.

### Follow-ups (tracked, separate PRs)

- **#12** — repair hook jest harness (`mock-fs@5.2.0` incompatible with Node 25). New
  hook behavior verified via real-fs sandboxes pending jest harness repair.
- Scheduled autonomous PM/architect runs via `--agent` + `/schedule`.
- `memory: project` flag decision on `code-reviewer`, `app-debugger`, `technical-architect`.

---

## [3.2.0] - 2026-02-23

### Added

- **Agent Team commands** -- three new `/...-team` command variants using Claude Code's
  experimental Agent Teams for parallel multi-agent execution:

  - **`/create-prd-team`** (`packages/core/commands/create-prd-team.md`)
    Spawns parallel teammates (product-research, tech-feasibility, optional
    devils-advocate) for multi-perspective PRD analysis. Output structurally
    identical to `/create-prd`.

  - **`/create-trd-team`** (`packages/core/commands/create-trd-team.md`)
    Spawns domain-expert teammates (backend-arch, frontend-arch, quality-strategy,
    optional infra-perspective) who each propose tasks in their domain. Lead
    synthesizes into unified TRD with merged dependency graph and execution plan.

  - **`/implement-trd-team`** (`packages/core/commands/implement-trd-team.md`)
    Executes TRD work sessions in parallel -- one teammate per session within each
    phase. References `/implement-trd` templates (A.1-A.8), does not duplicate them.
    State files interoperable with sequential `/implement-trd`.

  Vendored copies in `.claude/commands/` for project runtime.

- **7 new skills** in `packages/skills/`:
  - `building-integrations` -- Third-party API integration patterns (webhooks,
    idempotency, retry with Polly, circuit breakers, HttpClientFactory)
  - `developing-with-dotnet` -- .NET 9 with Clean Architecture, MediatR CQRS,
    EF Core, minimal APIs (SKILL.md + REFERENCE.md)
  - `managing-azure-devops` -- Azure DevOps YAML pipelines, multi-stage deployments,
    template references, variable groups (SKILL.md + REFERENCE.md)
  - `playwright-automation` -- Production browser automation for RPA, web scraping,
    and workflow automation; distinct from E2E testing (SKILL.md + REFERENCE.md)
  - `using-azure-functions` -- Isolated worker model for .NET 8/9 with HTTP,
    Service Bus, Timer, and Durable Functions triggers (SKILL.md + REFERENCE.md)
  - `using-clerk` -- Clerk authentication with C# SDK, React integration,
    Svix webhook verification, organization multi-tenancy (SKILL.md)
  - `using-terraform-azure` -- Terraform with azurerm 4.x provider, Key Vault,
    Managed Identity, App Service, Azure Verified Modules (SKILL.md + REFERENCE.md)

- **Explicit skill invocation in delegation flow** -- skills declared in agent
  frontmatter are now actively injected into delegation prompts instead of
  relying on agents to independently discover them:

  - **`/create-trd`**: New `Skills` column in Master Task List phase tables,
    populated via dynamic discovery from target agent's frontmatter `skills:`
    list and each skill's description. New Section 4.1.2 "Skill Hints" with
    discovery instructions. Validation checklist updated.

  - **`/create-trd-team`**: `<skills>` element added to teammate task proposal
    XML contract. Teammate briefing includes skill discovery instructions.
    Synthesis preserves skill hints when merging tasks.

  - **`/implement-trd`**: Hardcoded keyword-to-skill table replaced with
    dynamic resolution (TRD Skills column > agent frontmatter fallback,
    intersected with agent's declared skills). New `<skills>` block with
    invocation instruction added to templates A.2 (IMPLEMENT), A.3 (VERIFY),
    A.6 (SIMPLIFY), A.7 (REVIEW). IMPLEMENT deliverables extended with
    SKILLS_USED and RULES_APPLIED reporting.

  - **`/implement-trd-team`**: `<skills>` element added to teammate task XML.
    Delegation instruction added to pass skills to subagents.

  Vendored copies in `.claude/commands/` updated.

- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var** added to project template
  (`packages/core/templates/claude-directory/settings.json`), project settings
  (`.claude/settings.json`), and global config (`~/.claude/settings.json`).

### Changed

- **Agent model assignments** -- all 12 agents now have explicit `model:` field:
  - **Opus**: product-manager, technical-architect, spec-planner, code-reviewer,
    code-simplifier, app-debugger
  - **Sonnet**: frontend-implementer, backend-implementer, mobile-implementer,
    verify-app, devops-engineer, cicd-specialist

- **Agent skill lists updated** -- new skills distributed to relevant agents:
  - `developing-with-dotnet` added to: backend-implementer, code-reviewer,
    code-simplifier, app-debugger
  - `using-azure-functions` added to: backend-implementer, devops-engineer,
    app-debugger, code-reviewer
  - `using-clerk` added to: frontend-implementer, backend-implementer,
    app-debugger, code-reviewer
  - `building-integrations` added to: backend-implementer, app-debugger,
    code-reviewer
  - `playwright-automation` added to: frontend-implementer, app-debugger,
    code-reviewer
  - `managing-azure-devops` added to: cicd-specialist, devops-engineer,
    code-reviewer
  - `using-terraform-azure` added to: devops-engineer, code-reviewer
  - Skill lists reformatted from inline to YAML list syntax for readability

- **Router injection templates** (`packages/router/lib/router-rules.json`)
  Added teammate routing hint to all 5 injection templates: "If spawning a
  teammate, use the most appropriate ensemble agent (subagent_type) for the task."

- **Plugin CLAUDE.md** (`packages/full/CLAUDE.md`)
  Added delegation guidance: "When delegating work -- whether via subagent or
  teammate -- always use the named agent matching the task domain."

- **`/init-project` command** -- support inline config for unattended initialization;
  expanded plugin-only commands (`init-project.md`, `rebase-project.md`).

- **`agent-validation.test.js`** -- updated to reflect new model field in agents.

## [3.1.0] - 2026-02-19

### Changed

- Consolidated `/implement-trd` with TaskTools integration for dependency chains
  and structural stage enforcement.
- Active cycle position advancement via `status.js` hook on SubagentStop.
- Context management: single-line result summaries, `/compact` recommendation
  at phase boundaries.
- State-write-before-delegate pattern for implement.json updates.
- SIMPLIFY template requires actual file reads and evidence.

### Added

- `resolve-project-root.js` lib for hooks that need project root resolution.
- `formatter.sh` hook for PostToolUse formatting.
- `save-remote-logs.js` improvements for session log capture.
- Verification level support in constitution.md (`unit-only`, `live-required`,
  `e2e-required`, `manual-required`).
- `[LIVE]` task marker for per-task verification level override.

## Prior Versions

See git log for history prior to changelog adoption.
