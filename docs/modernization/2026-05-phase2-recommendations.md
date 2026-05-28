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

### 2.1 Adopt `mode: plan` for the read-only / design phases

**Gap.** The framework *philosophically* uses plan-then-implement, but it does not use the
native `mode: plan` parameter on spawned agents. Today, an architect spawned by `/create-trd`
*could* edit code mid-design; an `app-debugger` *could* start patching files during root-cause
analysis. The constitution and command prose say "design first" — but the harness lets the
agent do anything.

**Recommendation.** Spawn read-only/design phases with `mode: "plan"` so the harness enforces
read-only:

- `/create-trd` — spawn `technical-architect` with `mode: "plan"`. The architect explores,
  reasons, and produces the TRD; cannot edit code in the design pass.
- `/investigate-issue` — the whole triage is `mode: "plan"`. Output is a TRD or PRD spec,
  not code changes.
- `app-debugger` — first invocation runs in `mode: "plan"` for root-cause analysis; only
  exits plan mode to apply the diagnosed fix (or hands off to an implementer).
- `create-trd-team` — architect teammates run in `mode: "plan"` and use the documented
  **plan-approval flow** (`{type: "plan_approval_request"}` ↔ `plan_approval_response`) so
  the lead can approve/reject each domain's proposed plan before any implementation happens.

**Why this is high-leverage and aligned.**
- Turns "design first" from a *convention* into an *enforced contract*.
- Catches a real failure mode the user has experienced (architect/debugger editing during
  analysis).
- Composes perfectly with the existing PRD→TRD→implement structure; no philosophy change.
- Adds zero autonomy; if anything, reduces autonomy in design phases.

**Effort.** Small. Per-spawn frontmatter edit + a short plan-approval handshake in the
team commands. Sandbox-validate that the harness honors `mode: plan` for `Agent` spawns.

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

### 2.5 Promote PM/architect agents to long-running monitor sessions via `/agent`

**Gap.** `product-manager` and `technical-architect` are spawned per-command and then exit.
There's no Ensemble pattern for a *persistent* PM that watches PRDs/TRDs across days/weeks,
flags drift, prompts for refresh — the kind of "human-orchestrated iteration" check-in that
the framework's philosophy wants but currently requires the human to manually invoke each
time. Claude Code now supports `--agent <name>` to run a subagent AS the main session, with
an `initialPrompt` to seed it. The library already includes a `forge-workplan-pm` skill that
exemplifies this pattern.

**Recommendation.** Add `initialPrompt` to `product-manager` and `technical-architect`
frontmatter so they can be launched as long-running sessions:

```bash
# Standalone PM session for ongoing oversight
claude --agent product-manager
# (the initialPrompt loads docs/PRD/, checks freshness, surfaces drift)
```

Plus a documented pattern in `process.md` for "scheduled project check-ins" (potentially
combined with `/loop` or `/schedule` for cadence — but the LAUNCH is always human-decided).

**Why this is high-leverage and aligned.**
- Brings the "human-orchestrated iteration" loop a recurring check-in primitive without
  introducing autonomous decision-making.
- The human still launches and sets cadence; the agent surfaces signals.
- Uses an existing Claude Code primitive (`--agent`) directly.

**Effort.** Small. Frontmatter addition + a one-page "scheduled check-ins" doc in
`docs/guides/`.

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

---

## 5. Suggested next-PR scope

If you want a single focused follow-on PR, the **highest leverage** for the effort is:

| # | Item | Effort | Why now |
|---|------|--------|---------|
| 2.2 | `SessionStart` context hook | XS | Pure win, near-zero risk, immediately improves every session |
| 2.1 | `mode: plan` on architect / investigate-issue / app-debugger | S | Closes the biggest structural gap; turns a stated convention into an enforced contract |
| 2.3 | `PreCompact` durability hook | S | Real durability win for long runs; pairs with the structured state model |
| 2.4 | Skill `paths:` globs | M (delegated bulk) | Sharpens slim-router routing; ideal subagent delegation |

Hold for a later PR:
- 2.5 PM monitor sessions (small but introduces a new usage pattern worth its own walkthrough)
- 3.1 per-agent SubagentStop matchers (bundle with the deeper status.js reconciliation
  follow-up #9-already-closed → if a sequel is wanted)
- 3.3 skill `context: fork` (measure before adopting widely)

---

## 6. What "done" looks like for this Phase 2

Phase 2 is *complete* when:

- Every read-only/design phase in the framework runs in enforced plan mode.
- Every new session in an Ensemble project starts with the in-flight feature in context
  automatically.
- Compaction during a long structured run preserves the *decision trail*, not just the
  state file.
- Skills' description-based selection is scoped by file paths so the right skill fires for
  the right code area.
- The `/agent` invocation path is documented for PM/architect oversight sessions, with a
  worked example.

Implementing all five Tier-1 items completes Phase 2 and brings the framework to the
"structurally enforces its philosophy" target — the natural endpoint of the current
modernization arc.
