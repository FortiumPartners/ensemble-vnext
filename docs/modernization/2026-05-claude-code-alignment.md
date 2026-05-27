# Ensemble vNext — Claude Code Alignment Assessment

**Date:** 2026-05-27
**Plugin version:** 3.2.0 → recommended **4.0.0**
**Author:** Modernization review (James Simmons)
**Status:** Roadmap — approved direction, implementation pending per tranche

---

## 1. Executive summary

Ensemble vNext is a **vendored** workflow framework for Claude Code. Much of it was designed
before Claude Code shipped native orchestration primitives, so the plugin re-implements several of
them in prose and custom hooks. Since the last substantive update (~Feb–Mar 2026), Claude Code has
added or matured:

- **Task tools** (`TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput`) with `blockedBy`
  dependency graphs — *already partially adopted in `/implement-trd` v3.1.0*.
- The **Agent tool** family for spawning subagents, with `isolation: worktree`,
  `run_in_background`, `team_name`, and `mode` parameters.
- **`/goal`** — keep working turn-after-turn until a condition is met (works headless and remote).
- **Effort levels** (`low|medium|high|xhigh|max`) as a structured successor to the `ultrathink`
  keyword, settable in frontmatter.
- **Agent teams** (`TeamCreate`, `SendMessage`) — already enabled in this repo's runtime.
- **File-based memory** (`MEMORY.md` index + `memory/` fact files), semi-automatic.
- Richer **frontmatter** across agents, commands, and skills.

**Posture.** Adopt natives where they are *true* equivalents; **consciously keep** custom
mechanisms where the native option would lose something essential. Two things we keep on purpose:

1. The **durable `implement.json` state machine** — native tasks are session-scoped and do not
   survive `/compact` or session end.
2. The **committed, team-shared CLAUDE.md learning layer** — native memory is per-user/per-machine,
   uncommitted, and emergent.

---

## 2. Per-mechanism analysis

For each: capability → native counterpart → what we gain → **what we'd lose** → verdict.
Confidence noted where Claude Code docs were ambiguous (verified 2026-05-27 against
`code.claude.com/docs`).

### 2.1 `implement.json` durable state + `status.js` (SubagentStop)
- **Capability:** survives session end *and* `/compact`; per-task status, `cycle_position`, retries,
  commit SHAs, coverage, git-reconstruction recovery. `status.js` advances `cycle_position`.
- **Native counterpart:** Task tools with `blockedBy` chains.
- **Gain:** dependency gating, parallel-claim file-locking, live progress UI.
- **Lose:** *everything durable.* **CONFIRMED session-scoped** — "Tasks are session-scoped … stop
  when you start a new one" (scheduled-tasks docs). No `/compact` survival.
- **Verdict: KEEP `implement.json` as source of truth.** Native tasks = in-session execution layer
  (already the v3.1.0 design). Cleanup only: audit `status.js` for double-advance vs the command's
  own `TaskUpdate`; tighten doc language separating "work-list" from "spawner".

### 2.2 `Task(subagent_type=…)` dispatch → **Agent tool**
- Old spelling of the subagent spawner. Current canonical is the **Agent** tool (`subagent_type`),
  which also unlocks `isolation`, `run_in_background`, `team_name`, `mode`.
- **Lose:** nothing. **Verdict: straight modernize.** Resolves the confusing overload between
  "TaskTools" (the durable/work-list verbs) and the Agent spawner.

### 2.3 Manual parallelism ("max 2 concurrent" + file-conflict inference) → `isolation: worktree`
- **Gain:** true isolation — parallel teammates cannot collide on files.
- **Lose / caveat (CONFIDENCE ~40% on native behavior):** worktree **merge-back is manual and
  undocumented for the many-worktrees→one-branch case.** Docs confirm a changed worktree persists
  and prompts to keep/merge; **no documented auto-merge.** Integrating N teammates onto one feature
  branch needs explicit orchestration.
- **Verdict: ADOPT in team commands WITH explicit merge orchestration** (decision below). Do not
  assume auto-merge.

### 2.4 `wiggum.js` autonomous loop (`--wiggum`, Stop hook) → **`/goal`**
- **Native `/goal` (CONFIRMED real):** works turn-after-turn until a condition; runs in headless
  (`-p`) and remote; live overlay. The robust native version of "re-inject until done".
- **Lose:** (a) **vendored auto-activation** (wiggum flips on via env var the command sets) —
  *open spike: can a command body seed `/goal`?*; (b) domain-specific completion detection
  (`implement.json` task counts + `<promise>COMPLETE</promise>`); (c) the tested max-iteration /
  lock-file safety machinery.
- **Verdict (REVISED after C0 spike): KEEP `wiggum.js`; ADD `/goal` as the headless/manual run
  mode.** **C0 result (CONFIRMED): a command body cannot programmatically seed `/goal`** — slash
  commands fire only from direct user input; `/goal` works in `-p`/`--remote` only when the
  user/orchestrator passes it explicitly. The Claude Code docs explicitly name a **Stop hook** as the
  mechanism for command-driven autonomous completion — i.e. exactly what `wiggum.js` is
  (`goal.md`: "`/goal` and a Stop hook both fire after every turn… A Stop hook lives in your settings
  file, applies to every session in its scope"). So a full replacement would *lose* the
  `--wiggum` auto-activation with no native substitute. `/loop` is also out — confirmed
  session-scoped and machine-dependent.

### 2.5 `model:` pins + `ULTRATHINK` keyword → **`effort` + `model: inherit`**
- **Native:** `effort: low|medium|high|xhigh|max` in frontmatter; `model: inherit`; fast mode.
- **Lose:** nothing material; deliberate pins stay where wanted.
- **Verdict: ADDITIVE modernize.** Add `effort` by role; keep intentional pins
  (e.g. `code-reviewer: opus`); consider `inherit` for model-agnostic agents.

### 2.6 `router.py` keyword routing (UserPromptSubmit) → native description-based selection
- **Native:** skill auto-invocation via `description`/`when_to_use`; agent delegation from
  descriptions — far stronger than when the router was written.
- **Lose:** deterministic explicit nudges.
- **Evidence it misfires:** during this very review the router injected "Delegate to
  backend-implementer … use jest skill" onto pure analysis/planning turns — noise.
- **Verdict: SLIM DOWN** to a static framework-leverage hint (decision below).

### 2.7 `learning.sh` + CLAUDE.md learnings layer → native file-based memory
- **Decisive distinction (CONFIRMED):** native memory is **per-user/per-machine**
  (`~/.claude/projects/…`), **uncommitted, not team-shared, emergent**. CLAUDE.md learnings are
  **committed, shared, deterministic**.
- **Verdict: KEEP the shared learning layer.** Native memory is complementary (personal scratchpad),
  not a replacement, for a plugin built on vendored/reproducible/team-shared governance.

---

## 3. Feature-area review (mapped to the original request)

| Area | State in plugin | Native now | Action |
|------|-----------------|-----------|--------|
| **Planning / Task mgmt** | `implement-trd` uses Task tools + `blockedBy` (v3.1.0); durable JSON alongside | Task tools session-scoped | Keep dual layer; fix Task→Agent naming (§2.1–2.2) |
| **Team mgmt** | `*-team` commands spawn teammates in prose; `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` already set in runtime | `TeamCreate`/`SendMessage`, teams GA-ish behind flag | Align to current Agent/team semantics; worktree isolation (Tranche D) |
| **Subagent mgmt** | 12 agents, `model`+`color`+`skills` frontmatter, no `tools` restriction | `effort`, `mode`, `isolation`, `mcpServers`, `memory`, `disallowedTools` available | Add `effort`; evaluate `mode: plan` teammates (Tranche A/E) |
| **YAML frontmatter** | Commands minimal (`name`/`description`/`version`); skills sporadic `allowed-tools` | `argument-hint`, `model`, `effort`, `disable-model-invocation`, `when_to_use`, `context: fork` | Modernize (Tranche A3) |
| **New tools** | `Task(subagent_type)` dispatch | `Agent` tool + params | Rename (Tranche A1) |
| **Orchestration** | Custom `wiggum.js` loop; manual concurrency | `/goal`, `/loop`, `ScheduleWakeup`, Cron, `Monitor` | Replace wiggum with `/goal` (Tranche C) |
| **Model / context / effort** | `model` pins; `ULTRATHINK`; manual `/compact` recommendation | `effort` levels; auto-compaction; `/context`; fast mode | Add `effort`; keep `/compact` guidance (Tranche A2) |
| **Memory** | `learning.sh` → committed CLAUDE.md; `/update-project`, `/cleanup-project` | File-based memory (personal/emergent) | Keep shared layer; complement only (Tranche E) |
| **Hooks** | permitter, router, formatter, status, wiggum, notify, learning, save-remote-logs | New events exist (review against changelog before relying) | Slim router; retire wiggum; reconcile settings (B/C/E) |
| **MCP** | Figma via `augment-trd-figma`; `compatibility` frontmatter | Inline subagent `mcpServers`, deferred tool loading | No change required now; note for future |

---

## 4. Decisions & rationale (locked)

1. **Autonomy → "goal-native verify" design** *(revised after C0 — see §2.4)*. A command cannot
   seed `/goal`, so instead of replacing wiggum we make the verify procedure **goal-drivable**:
   the *skill* supplies the structure + a machine-checkable completion contract; `/goal` supplies
   the loop. Concretely:
   - A **`verify` skill** whose durable state is `.trd-state/<trd>/verify.json` (per-assertion
     verdicts `pass|fail|blocked|pending`) with one unambiguous predicate: *every assertion `pass`,
     zero `pending`/`fail`, no open regressions.* Each turn: probe → fix → re-probe → update file.
   - A **structured `/goal` launch** that targets the predicate (not ad-hoc text):
     `claude -p "/goal verify.json for <trd> shows every assertion verdict=pass, zero pending/fail.
     Follow the verify-trd procedure."` — model checks the *file artifact* each turn.
   - `/verify-trd` and `/verify-trd-team` **emit that exact invocation** (they cannot self-activate
     it); optionally a thin `verify --goal <trd>` wrapper.
   - `verify.json` stays the durable record (survives the loop and `/compact`). Skill = structure,
     `/goal` = loop, `verify.json` = state.
   - **`wiggum.js` is kept** for the fully-vendored zero-touch Stop-hook path; the same goal-native
     pattern can later offer an interactive/headless alternative for the implement loop.
2. **Worktrees → push into team commands.** Adopt `isolation: worktree` in the `*-team` commands
   *and add explicit merge orchestration* to land N worktrees onto one feature branch.
3. **Router → slim down.** Replace keyword routing with a single static reinforcing instruction
   ("aggressively leverage the framework: skills, agents, commands, constitution"). Native
   description-based selection carries routing.
4. **Memory → keep shared layer.** The `SessionEnd` removal is **deliberate** — capture shifts to
   explicit `/update-project`. Native memory stays complementary/personal.

---

## 5. Reconciliation findings (pre-work)

- **Workflow commands are content-identical** across `.claude/commands/` (dogfood) and
  `packages/core/commands/` (template) — all key files match, same versions. **Canonical edit point
  = `packages/core/commands/`**, then sync the dogfood copy (or `/rebase-project`).
  `augment-trd-figma.md` lives in core but is not yet vendored into `.claude/` — vendor on next rebase.
- **The two `settings.json` have diverged, and the *template* is stale/incorrect.** The vendored
  `.claude/settings.json` is more advanced — correct `Stop` (wiggum + notify) / `SessionEnd`
  (learning + save-remote-logs) split, and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. The template
  `packages/full/.claude/settings.json` mis-places `learning.sh` in `Stop`, has no `SessionEnd`, and
  omits wiggum/notify. **Tranche E must first reconcile the template up to the working runtime,
  then apply the deliberate changes.**
- **Agent teams are already enabled** in the dogfood runtime → Tranche D is operationally viable now.

---

## 6. Prioritized backlog (tranches)

| Tranche | Scope | Risk | Depends on |
|---------|-------|------|-----------|
| **A** | Task→Agent rename; `effort` + model hygiene; command/skill frontmatter | Low | — |
| **B** | Slim `router.py`; strengthen descriptions; fate of `router-rules` | Low–Med | — |
| **C** | *(revised)* keep+modernize wiggum; add `/goal` headless run-mode; verify commands emit a `/goal` invocation | Med | A (Agent rename) |
| **D** | `isolation: worktree` + merge orchestration in team commands | **High** | A, C |
| **E** | Reconcile + finalize settings; audit `status.js`; document memory split | Low–Med | — |

**Suggested sequence:** A → B → E (low-risk, independent) → C (after seed-`/goal` spike) → D (last,
needs its own headless validation).

### Open spikes
- **C0 — RESOLVED (NO):** A command/skill body CANNOT seed/activate `/goal` (slash commands fire
  only from direct user input; no env/settings/tool to set a goal). `/goal` runs in `-p`/`--remote`
  only when explicitly passed. Docs name a Stop hook as the command-driven-autonomy mechanism →
  wiggum stays.
- **D:** Worktree merge-back ergonomics for N→1 branch; validate with a headless multi-teammate dry
  run incl. a deliberate conflict before trusting it.

### Unconfirmed (do not build on without verification)
- `run_in_background: true` on the Agent tool is present in this runtime's tool schema but **not in
  public docs**; `background: true` frontmatter is the documented path.
- Specific new hook events (e.g. `MessageDisplay`, `TaskCreated/Completed`) — verify against the
  live changelog before adopting.

---

## 7. Version impact

Recommend **4.0.0**. The `--wiggum` → `/goal` change is user-facing; the dispatch rename and team
worktree/merge orchestration change runtime contracts. Bump
`packages/full/.claude-plugin/plugin.json` and note migration in command help + CHANGELOG.

---

## 8. Critical files

- **Commands (canonical):** `packages/core/commands/*.md`, `packages/router/commands/*.md`,
  `packages/full/commands/plugin-only/{init-project,rebase-project}.md`. Sync dogfood `.claude/commands/`.
- **Agents:** `packages/full/agents/*.md` (12).
- **Hooks:** `packages/core/hooks/{wiggum.js,status.js,learning.sh,save-remote-logs.js,notify.sh,formatter.sh}`,
  `packages/router/hooks/router.py`, `packages/core/hooks/lib/resolve-project-root.js`.
- **Settings template:** `packages/full/.claude/settings.json`. **Manifest:**
  `packages/full/.claude-plugin/plugin.json`.
- **Tests:** `packages/router/tests/` (pytest), `packages/core/hooks/*.test.{js,sh}` (jest/BATS),
  `test/integration/tests/*.test.sh` (BATS), `test/evals/specs/dev-loop/` (A/B).

## 9. Verification strategy

Non-deterministic system → manual + session-log review + evals; unit tests only for hooks/scripts.
- **Deterministic:** `router.py` (pytest); wiggum removal updates jest; structure via
  `vendoring.test.sh` + `commands.test.sh` (BATS).
- **Propagation:** `/rebase-project --dry-run` confirms clean vendoring.
- **Behavioral (headless, `--plugin-dir packages/full --setting-sources project`):**
  (a) `/verify-trd-team` driven by `/goal` reaches all-PASS; (b) `implement-trd-team` with worktree
  isolation lands N teammates on one branch and handles a deliberate conflict; (c) slimmed router
  no longer misfires on an analysis prompt.
- **A/B regression:** `test/evals/specs/dev-loop/` before vs after (`run-eval.js` → `judge.js` →
  `aggregate.js`).
