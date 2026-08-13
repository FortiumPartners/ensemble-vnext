# Ensemble vNext — Phase 2 Recommendations (post-3.4.0)

**Date:** 2026-05-28
**Companion to:** `docs/modernization/2026-05-claude-code-alignment.md` (Phase 1 = 3.3.0/3.4.0)
**Lens for every recommendation:** Ensemble's core philosophy — **structured development +
human-orchestrated iteration**. Recommendations either *reinforce structure* (so the human
can trust what the framework is doing) or *sharpen the human's leverage* (so iteration is
faster/cheaper without surrendering judgment). Recommendations that push toward unchecked
autonomy are explicitly anti-recommended.

---

## 1. Assessment summary

The 3.3.0 / 3.4.0 release brought the plugin into alignment with the *foundational* current-
Claude-Code primitives: the Agent tool family, native Task tools with `blockedBy`, agent teams
on a shared working tree, the `/goal` autonomy path (`verify-goal`), `effort` levels,
file-based memory (documented as complementary), and the AI-feature specialist + skill set
with enforced currency checks.

What we **still under-use** falls into a clear pattern: Claude Code now offers a number of
**structural primitives** (programmatic plan mode, per-agent hook matchers, `paths:` skill
gating, `SessionStart`/`PreCompact` hooks, skill `context: fork`, plan-approval teammate
flows) that are *exactly* the kind of thing Ensemble's philosophy values — but the framework
hasn't adopted them yet. The framework relies on prose ("operates in plan mode", "run
/compact at phase boundaries") where it could rely on enforced primitives.

The five Tier-1 recommendations below close those gaps. Tier-2 are useful but smaller.
Tier-3 / anti-recommendations are listed so future passes don't go down those roads.

---

## 2. Tier-1 recommendations (high leverage, philosophy-aligned)

### 2.1 Async-discipline rule + Stop-hook guard (fixes the "fire-and-forget" failure)

**Gap.** The framework is moving toward a *system of agents* where agents orchestrate work.
A recurring failure mode: the agent claims *"I dispatched X, I'll let you know when done"* —
but it didn't actually use any async primitive (no `Agent(run_in_background:true)`, no
`ScheduleWakeup`, no `Monitor`, no `/goal`). It just launched a foreground Bash, returned,
and ended its turn. There's no notification path back. The agent sits idle for 30+ minutes
until the user nudges it, at which point it checks and instantly sees the work was done long
ago. **The root cause is a hallucinated notification — the agent thinks the system will tell
it, but nothing will.**

**Recommendation.** Two reinforcing changes:

1. **Behavioral rule** in `.claude/rules/async-discipline.md` (also referenced from
   `constitution.md`):

   > **No false async claims.** An agent must never tell the user or another agent
   > "I'll let you know when done", "running in the background", "I'll check back", etc.,
   > without ALSO doing one of the following *in the same turn*:
   >
   > 1. Spawning via `Agent({run_in_background: true, …})` — the harness re-invokes the
   >    parent on completion.
   > 2. Calling `ScheduleWakeup({delaySeconds: <ETA>, …})` to self-rendezvous.
   > 3. Holding the turn open with `Monitor` until the work completes.
   > 4. Setting a `/goal` whose condition the work satisfies.
   >
   > If none of these apply, **do the work synchronously in the current turn** — do NOT
   > claim async.

2. **`Stop`-hook guard** (`packages/core/hooks/async-discipline.{js,sh}`). On every `Stop`,
   the hook:
   - Scans the recent assistant transcript chunk for fire-and-forget phrases
     (small conservative regex set — "I'll let you know", "in the background",
     "I'll check back", "will report back", "running asynchronously").
   - Inspects the `Stop` input's `background_tasks` / `session_crons` fields
     (Claude Code v2.1.145+).
   - **If a fire-and-forget claim is present AND no async machinery is active →**
     returns `{"continue": true, "decision": "block", "reason": "You claimed async work but
     no run_in_background / ScheduleWakeup / Monitor / goal is active. Dispatch via one of
     those, OR complete the work synchronously before ending the turn."}`.
   - Same proven mechanism wiggum.js uses — well-understood semantics.

**Why this is high-leverage and aligned with system-of-agents.**
- Addresses a real, recurring failure mode the user has experienced.
- The *system* catches the violation — not the human. No interactive checkpoint, no silent
  write fail, no plan-approval handshake. Pure structural guard.
- Forces the agent to either use a real async primitive or stay synchronous; no middle ground
  where the work hangs in limbo.
- Composes naturally with the existing `Stop`-hook chain (wiggum, notify).

**Effort.** Small. One rule file + one Node hook script + register in both `settings.json`.
Sandbox-test with crafted transcripts: (a) fire-and-forget phrase + no async → must BLOCK;
(b) fire-and-forget phrase + active background_task → must PASS; (c) no claim → must PASS;
(d) edge cases (legitimate parallel Bash where the agent uses "parallel" innocuously).

---

### 2.2 SessionStart hook that injects current TRD/PRD context

**Gap.** Every new Claude Code session in an Ensemble project has to be told "we're working
on docs/TRD/X — see .trd-state/current.json". The information is sitting on disk, in a known
location, but the agent has to ASK for it (or the user has to feed it). Friction every session.

**Recommendation.** A small `SessionStart` hook (`packages/core/hooks/session-context.sh`)
that:

1. Reads `.trd-state/current.json` if present.
2. Reads the linked PRD + TRD's top-of-file metadata (status, phase cursor, last checkpoint
   commit).
3. Reads `implement.json` summary (X/Y tasks complete, current cycle position).
4. Outputs `{"hookSpecificOutput": {"hookEventName": "SessionStart",
   "additionalContext": "<formatted brief>"}}` — so every session opens with:
   ```
   ENSEMBLE: in-flight feature docs/TRD/user-auth.md (Phase 2/4, 7/12 tasks done,
   on branch USER-AUTH-impl, last checkpoint a7cffc4)
   ```

**Why this is high-leverage and aligned.**
- Removes per-session friction without changing any behavior.
- Reinforces durability (state on disk is the source of truth; it's *automatically* loaded).
- Pure additive; nothing breaks if `.trd-state/current.json` is absent.
- Pairs naturally with the slim router (one more piece of high-signal context the model gets
  for free).

**Effort.** Tiny. ~50 lines of shell + register in both `settings.json` files. Sandbox-test
with present/absent state files.

---

### 2.3 PreCompact hook that archives durable decision context

**Gap.** When a long `/implement-trd` run hits `/compact` (or auto-compaction at ~95%), the
conversation history is summarized away — including the *reasoning trail* for in-flight
decisions (why we chose this approach, which risks we accepted, what we tried and rejected).
The state file has *task status* but not *decision rationale*. Post-compaction, the model
has to re-derive context it just had.

**Recommendation.** A `PreCompact` hook that, before compaction, appends a compaction
checkpoint to `.trd-state/<trd>/session-log.md`:

```markdown
## Compaction checkpoint — 2026-05-28T14:32:00Z

**Feature:** docs/TRD/user-auth.md  | **Phase:** 2/4  | **Cycle:** simplify
**In-flight task:** AUTH-B005 (POST /api/login token refresh)
**Recent decisions (last 30 turns):**
- Chose JWT refresh-token rotation over session-cookie sliding window (see TRD §4.3)
- Rejected single-call OAuth proxy due to scope-creep risk (TRD non-goal NG-002)
- Adopted using-clerk skill for the C# side per stack.md
**Open questions:** none
**Next action when resumed:** code-simplifier on AUTH-B005, then VERIFY
```

The model is instructed to re-read session-log.md after compaction. The append is small,
durable, and survives session end.

**Why this is high-leverage and aligned.**
- Closes a real gap in cross-session durability (already a stated philosophy point: state on
  disk survives compaction).
- The data is what a human reviewer would want to skim after stepping away.
- No new autonomy; just better memory of *what was decided* alongside *what was done*.

**Effort.** Small-medium. Hook script + a documented "session-log.md" convention + an
implement-trd note to re-read after compaction. Test by triggering compaction mid-loop.

---

### 2.4 Skill `paths:` globs to scope auto-activation

**Gap.** The 3.3.0 slim router relies on Claude Code's native description-based skill
selection. But skills auto-activate on description match anywhere — `developing-with-react`
can fire in a pure-backend session because the user said "component"; `rails` can fire in a
Python project. This fights the routing the slim router was supposed to enable.

**Recommendation.** Add `paths:` glob to language/framework/test-runner skills so they only
auto-activate when relevant files are present:

| Skill | `paths:` |
|-------|----------|
| `developing-with-react` | `src/**/*.{tsx,jsx}, components/**, package.json` (with `react` dep) |
| `developing-with-python` | `**/*.py, requirements*.txt, pyproject.toml` |
| `developing-with-typescript` | `**/*.{ts,tsx}, tsconfig*.json` |
| `rails` | `Gemfile, app/**/*.rb, config/routes.rb` |
| `phoenix` | `mix.exs, lib/**/*_web/**` |
| `using-prisma` | `prisma/schema.prisma, **/prisma/*.ts` |
| `using-pgvector` | `**/*.sql with CREATE EXTENSION pgvector, schema.prisma with @db.Vector` |
| `using-weaviate` | `**/weaviate*.{ts,py}, docker-compose*.yml with weaviate` |
| `figma-pixel-perfect` | `**/*.{tsx,jsx,vue,html}, tests/visual/**` |

**Why this is high-leverage and aligned.**
- Sharpens routing without re-introducing the keyword-router (which the slim router
  intentionally removed).
- Per-project relevance is implicit in the file layout, not in a hand-maintained rules file.
- Pure metadata addition; no behavioral risk.

**Effort.** Medium-bulk (~30-40 skills get a `paths:` line; many won't need one). Ideal for
delegation to a subagent like the Pass-1 clarity sweep.

---

### 2.5 PM / architect agents as scheduled autonomous runs (`--agent` + `/schedule`)

**Gap.** `product-manager` and `technical-architect` are spawned per-command and then exit.
There's no Ensemble pattern for a *persistent* PM that watches PRDs/TRDs, flags drift,
detects stalled features, prompts for refresh. As the framework moves toward system-of-agents,
this kind of background project oversight should run AUTONOMOUSLY on a cadence, not require
manual launch. Claude Code now supports `--agent <name>` (run a subagent AS the main session,
seeded by `initialPrompt`) and `/schedule` (cron-style scheduled remote agent runs). The
library already includes a `forge-workplan-pm` skill that exemplifies the pattern.

**Recommendation.** Two pieces:

1. Add `initialPrompt` to `product-manager` and `technical-architect` frontmatter so they
   produce a useful run when launched standalone via `--agent`:
   ```bash
   claude --agent product-manager
   # initialPrompt scans docs/PRD/, .trd-state/, recent commits → drift / stall report
   ```
2. A documented pattern in `process.md` for **scheduling** these as autonomous recurring
   runs via `/schedule`:
   ```
   /schedule "0 9 * * 1" claude --agent product-manager   # weekly Mon 9am drift report
   ```
   The schedule launches the agent; the agent runs autonomously, surfaces signals via
   `PushNotification` / commits a report file / opens an issue (depending on project
   conventions); then exits. No human in the launch loop.

**Why this is high-leverage and aligned with system-of-agents.**
- Project oversight becomes an autonomous background activity, not a human task.
- Bounded autonomy: each run is a single scheduled invocation with a clear goal; no
  open-ended loops.
- Uses two existing Claude Code primitives (`--agent`, `/schedule`) directly without new
  orchestration code.

**Effort.** Small. Frontmatter addition (`initialPrompt`) + a one-page "scheduled autonomous
runs" guide in `docs/guides/`. Possibly a worked example schedule entry for the dogfood project.

---

## 3. Tier-2 recommendations (good, smaller leverage)

### 3.1 Per-agent `SubagentStop` matchers
Today `status.js` fires on every `SubagentStop` and tries to advance `cycle_position` for
whichever agent stopped (with the 3.3.0 active-debugging guard from #9). Per-agent matchers
would let us split into targeted hooks (one for implementer-stop, one for verify-stop, one
for review-stop), each with cleaner advance semantics. Pairs with the deeper status.js
reconciliation already tracked as a follow-up; do them together if/when status.js gets a
larger pass.

### 3.2 `terminalSequence` desktop notifications
Extend `notify.sh` with the v2.1.141+ `terminalSequence` output to emit OS-level desktop
notifications when long runs complete (verify-trd-team all-PASS, implement-trd phase
checkpoint, /goal satisfied). Useful for headless / long autonomy runs. Low effort; pairs
with the existing notify hook.

### 3.3 Skill `context: fork` for heavy retrievers
Skills like `building-rag-pipelines`, `using-weaviate`, `using-pgvector`, and
`building-langgraph-agents` can pull large amounts of context during exploration (live docs
fetches, schema introspection). Running them with `context: fork` would isolate that to a
sub-session, freeing the orchestrator's context. Worth measuring before adopting widely.

### 3.4 Inline `mcpServers` on specialist subagents
For *project-local* agent definitions (plugin-shipped subagents ignore `mcpServers` for
security), `init-project` could **suggest** MCP server attachments per specialist —
`devops-engineer` ↔ Terraform/AWS MCPs; `agent-implementer` ↔ Langfuse MCP;
`frontend-implementer` ↔ Figma MCP. Adds opt-in capability without changing the shipped
plugin's contract.

### 3.5 `/loop` or `/schedule`-based TRD health checks
A `/check-trd-health` (or scheduled equivalent) that scans `.trd-state/` for stalled tasks
(>N days since last update), broken state files, and stale `current.json` pointers, then
surfaces findings for the human. Aligns with "human-orchestrated" because it produces a
report, not an action. Pairs naturally with 2.5 (PM monitor sessions).

---

## 4. Anti-recommendations (do NOT adopt)

These have been considered and rejected for fit:

- **Worktree isolation in the team commands.** Already analyzed in Phase 1 §2.3 / decision 2;
  research confirms it's against the grain of Agent Teams and manufactures a manual-merge
  problem the design avoids. Recommend revisiting only if Claude Code documents an auto-merge
  path for N→1 branch flows.
- **Replacing `wiggum.js` with `/goal`.** The C0 spike confirmed a command cannot programmatically
  activate `/goal`; full replacement loses vendored auto-activation with no native substitute.
  The "goal-native verify" pattern (3.3.0) is the right adoption.
- **Adopting native file-based memory as the project-learning layer.** Native memory is
  per-user, per-machine, uncommitted — incompatible with the framework's committed,
  team-shared CLAUDE.md learning model. Use natively as a personal complement only.
- **Generic autonomous loops (untracked `/loop` or open-ended `/goal`).** Anti-philosophy.
  Any autonomy must be bounded (wiggum's iteration cap, verify-goal's verify.json contract,
  3-run verify cap) — never open-ended.
- **Background subagents for design/review phases.** Reviewing and design need human
  attention as they happen; backgrounding them would let bad decisions land before review.
- **`mode: plan` on spawned agents (the design-phase enforcement).** Initially considered as
  Tier-1; withdrawn after recognizing it conflicts with the system-of-agents direction. Plan
  mode introduces either (a) interactive plan-approval checkpoints (human-in-the-loop), or
  (b) agent-to-agent approval handshakes (more orchestration code), or (c) silent write
  failures if a downstream agent attempts a write while still in plan mode. None of those fit
  a framework where agents are increasingly orchestrating each other. The convention "design
  first, then implement" is still encoded in PRD→TRD→implement, just not harness-enforced.

---

## 5. Suggested next-PR scope

If you want a single focused follow-on PR, the **highest leverage** for the effort is:

| Order | Item | Effort | Why now |
|---|------|--------|---------|
| 1 | 2.2 `SessionStart` context hook | XS | Smallest unit; proves the SessionStart pattern works end-to-end before the bigger items |
| 2 | 2.4 Skill `paths:` globs (delegated) | M (bulk) | Pure metadata pass; delegate to a subagent in parallel to free orchestrator throughput |
| 3 | 2.1 Async-discipline rule + Stop-hook guard | S–M | Highest-value structural fix — directly addresses the user-reported fire-and-forget failure mode. Worth focused attention. |
| 4 | 2.3 `PreCompact` durability hook ✓ implemented (`precompact.js`) | S | Appends structured checkpoint to `.trd-state/<feat>/session-log.md` (timestamp, phase, in-flight task w/ cycle + retry context, last 5 completions, **Decisions & rationale** stub). PreCompact `additionalContext` instructs post-compact model to re-read the log. Registered in both `settings.json` files. `implement-trd.md` §5.4 documents the convention. |

Hold for a later PR:
- 2.5 Scheduled autonomous PM/architect runs (small but introduces a new usage pattern worth
  its own walkthrough — `/schedule` + `--agent` are new primitives for the framework)
- 3.1 per-agent SubagentStop matchers (bundle with any future deeper status.js work)
- 3.3 skill `context: fork` (measure before adopting widely)

---

## 6. What "done" looks like for this Phase 2

Phase 2 is *complete* when:

- Agents cannot silently fire-and-forget — async claims are either backed by real async
  machinery (`run_in_background` / `ScheduleWakeup` / `Monitor` / `/goal`) or rejected at
  the `Stop` hook before the turn ends.
- Every new session in an Ensemble project starts with the in-flight feature context
  auto-loaded.
- Compaction during a long structured run preserves the *decision trail*, not just the
  state file.
- Skills' native description-based selection is scoped by file paths so the right skill
  fires for the right code area.
- (Follow-up) PM / architect agents can run as scheduled autonomous oversight runs via
  `--agent` + `/schedule`.

Implementing all four Tier-1 items in the suggested next-PR completes the structural core
of Phase 2 and brings the framework to the "the *system* enforces its discipline" target —
the natural endpoint of the current modernization arc as it evolves toward system-of-agents.
