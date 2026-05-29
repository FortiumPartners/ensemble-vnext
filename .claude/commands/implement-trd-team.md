---
name: implement-trd-team
description: Execute TRD implementation using parallel teammate sessions for concurrent phase execution
argument-hint: "[trd-path] [--phase N] [--session <name>] [--resume] [--reset-state] [--wiggum]"
version: 1.0.0
category: implementation
---

> **Usage:** `/implement-trd-team [trd-path] [options]`
>
> **Arguments:** Same as `/implement-trd`:
> - `<trd-path>` - Path to TRD file (optional if `.trd-state/current.json` exists)
> - `--phase N` - Execute only phase N
> - `--session <name>` - Execute only named work session
> - `--resume` or `--continue` - Resume from last checkpoint
> - `--reset-state` - Clear state file and start fresh (requires confirmation)
> - `--wiggum` - Enable autonomous mode (intercepts exit until complete or max 50 iterations)
>
> **Examples:** `/implement-trd-team`, `/implement-trd-team --resume`, `/implement-trd-team --phase 2`, `/implement-trd-team docs/TRD/user-auth.md --wiggum`

This is the **team variant** of `/implement-trd`. It uses Claude Code Agent Teams to execute
TRD work sessions in parallel within each phase, with one teammate per session.

All delegation templates (Appendix A: A.1-A.8), state schema, staged execution loop, strategy
detection, quality gates, and error handling are defined in `/implement-trd` and referenced
here -- NOT duplicated. This command adds a **team orchestration layer** on top.

**ULTRATHINK**: Parse the TRD execution plan carefully to identify parallelization
opportunities before spawning teammates.

**Workspace model:** Teammates share ONE working tree and commit directly to the feature
branch — the native Agent Teams model. Parallel safety comes from **file ownership** (each
session owns a disjoint set of files; see Step 3.3) plus the **shared task list**
(`blockedBy` dependencies + file-locked task claiming), NOT from per-teammate git worktrees.
`isolation: worktree` is the documented tool for *independent cross-feature* work and is
deliberately NOT used here — it would manufacture an N→1 manual-merge problem the design avoids.

## User Input

```text
$ARGUMENTS
```

Parse: TRD path, `--phase N`, `--session <name>`, `--resume`/`--continue`, `--reset-state`, `--wiggum`.

---

## Execution Model

```
PREFLIGHT -> RESUME CHECK -> PHASE LOOP -> COMPLETE

Phase Loop (per phase):
  1. Parse parallelization map
  2. Group sessions by parallel eligibility
  3. For each parallel group:
     a. Create team (TeamCreate)
     b. Spawn one teammate per session (Agent tool with team_name)
     c. Monitor the shared task list for progress
     d. Wait for all teammates to complete
     e. Shutdown teammates (SendMessage shutdown_request), then TeamDelete
  4. Phase checkpoint (git commit, state update)
  5. Recommend /compact, advance to next phase
```

---

## Step 1: Preflight

Execute `/implement-trd` Steps 1.1-1.6 identically (Load Constitution, TRD Selection,
Git Branch Management, Strategy Detection, Concurrent Execution Check, Load Non-Goals/Risks).

**Additional validation:** Verify the TRD contains an Execution Plan (Section 5) with
phase overview, session details (name, agent type, task IDs), and parallelization map.

If no execution plan found, fall back to sequential `/implement-trd` with warning:
```
WARNING: TRD has no execution plan with parallelization map.
Falling back to sequential execution. Consider using /implement-trd instead.
```

---

## Step 2: Resume and Recovery

Execute `/implement-trd` Step 2 identically (2.1-2.4), with one extension:

**Teammate Session Recovery:** On `--resume`, check `teammate_session_id` fields in state.
For incomplete tasks with a `teammate_session_id`: if recent (<24 hours), note for potential
resume; if stale, clear and treat as fresh. The lead re-spawns the parallel group and lets
teammates pick up from persisted state rather than resuming individual sessions.

---

## Step 3: Parse Execution Plan

### 3.1 Extract Phase Structure

Read TRD Section 5 (Execution Plan). Extract per phase:
```
{ phase: 1, name: "Foundation", sessions: [
    { name: "phase1_backend",  agent: "backend-implementer",  tasks: ["AUTH-B001", "AUTH-B002"] },
    { name: "phase1_frontend", agent: "frontend-implementer", tasks: ["AUTH-F001"] }
]}
```

### 3.2 Build Session Dependency Graph

For each phase, determine parallel groups:
- **No inter-session dependencies** -> all sessions in one parallel group
- **Session B depends on Session A** (task dependencies cross sessions) -> A in group 1, B in group 2

```
Phase 1:  Group 1: [phase1_backend, phase1_frontend]  # independent
Phase 2:  Group 1: [phase2_api]  ->  Group 2: [phase2_integration]
```

### 3.3 File Ownership (primary parallel-safety mechanism)

Teammates share one working tree, so **each session in a parallel group MUST own a disjoint
set of files** — the native Agent Teams safety model ("break the work so each teammate owns a
different set of files"). Apply `/implement-trd` File Conflict Detection to partition: if two
sessions in the same group would touch the same file, either move the later one to the next
group (sequence them) or reassign files so ownership stays disjoint. Cross-session
dependencies are expressed via the shared task list's `blockedBy`, so blocked work cannot be
claimed early.

---

## Step 4: Phase Execution with Teams

For each phase (or single phase if `--phase N`):

### 4.1 Spawn and Execute Parallel Group

For each parallel group within the phase:

**1. Update state before spawn** -- for each task being assigned, write to implement.json:
```json
{ "status": "in_progress", "cycle_position": "implement", "teammate_session_id": "{session_name}" }
```
Update `active_sessions` map with session name entries.

**2. Create team:**
```javascript
TeamCreate({ team_name: "impl-phase-{N}-group-{G}",
             description: "TRD {trd_name} Phase {N} parallel execution" });
```
The team has a 1:1 shared task list; the stage sub-tasks created via `/implement-trd` Step 3
live on it.

**3. Spawn teammates** -- one per session, using the **Agent** tool with `team_name`:
```javascript
Agent({ subagent_type: session_agent, team_name: "impl-phase-{N}-group-{G}",
        name: session_name, prompt: "[Teammate Prompt - Section 4.2]" });
```
Assign each session's task(s) to its teammate with
`TaskUpdate({ taskId, owner: session_name })`. Do NOT pass `isolation: "worktree"` — teammates
share the working tree (see Workspace model).

**3a. MANDATORY: schedule the safety-net wake-up before ending the turn.**

In practice, **`Agent({team_name})` is NOT a reliable re-invocation primitive on its own.**
The team docs promise that teammate `SendMessage` deliveries arrive as new lead turns
automatically — but this has been observed to silently stall: teammates complete, send
their messages, the lead session goes idle, and no new turn fires until the user types
the next prompt. Messages queue indefinitely; the orchestration loop dies.

Treat `team_name` spawns as **partial async**: real work is in flight, but the lead has
no guaranteed wake. Pair every team spawn with a `ScheduleWakeup` as the explicit
re-invocation belt. If teammate `SendMessage` auto-delivery DOES fire, the scheduled wake
just no-ops (the lead resumes, sees state already advanced, schedules the next phase or
exits). If it stalls, the wake catches it within the delay window.

```javascript
ScheduleWakeup({
  delaySeconds: 1200,                                       // 20 min — long enough to
                                                            //   avoid cache-burn, short
                                                            //   enough to catch stalls
  reason: "team-mailbox drain fallback for impl-phase-{N}-group-{G}",
  prompt: "/implement-trd-team [original arguments here]"   // re-enter the loop
});
```

This is the **same enforcement rule** as `.claude/rules/async-discipline.md` Prohibited
Pattern #6 — `Agent({team_name})` does not count as one of the four async primitives;
combine it with `ScheduleWakeup` (or `/goal`) to satisfy the rule.

**4. Monitor** -- teammate messages arrive as new lead turns whenever Claude Code's
auto-delivery fires; otherwise the scheduled wake-up from step 3a fires at the deadline
and drains the mailbox on the next turn. Either way the lead wakes; it never depends
solely on the user prompting. Teammates also advance the shared task list. Wait for ALL
teammates in the group to complete.

**5. Collect results** -- for each teammate extract: task status (success/failed/blocked),
files changed, coverage metrics, single-line summary per task. Update implement.json.

**6. Cleanup:**
```javascript
// Gracefully shut down each teammate, then delete the team
for (const session of group.sessions)
  SendMessage({ to: session.name, message: { type: "shutdown_request" } });
// TeamDelete fails while members are still active — only after all have shut down:
TeamDelete({});
```

### 4.2 Teammate Prompt Template

Each teammate runs the full staged cycle and delegates to specialist subagents within
its own session.

```xml
<team_session>
  <trd>{trd_path}</trd>
  <phase>{phase_number}</phase>
  <session>{session_name}</session>
</team_session>

<assigned_tasks>
  <task id="{task_id}" description="{task_description}">
    <acceptance_criteria>{extracted from TRD}</acceptance_criteria>
    <skills>{from TRD Skills column or inferred by lead}</skills>
    <dependencies>{dependency task IDs, should already be complete}</dependencies>
  </task>
</assigned_tasks>

<execution_context>
  <strategy>{strategy}</strategy>
  <quality_gates>
    <unit_coverage>{target}%</unit_coverage>
    <integration_coverage>{target}%</integration_coverage>
  </quality_gates>
  <verification_level>{from constitution.md}</verification_level>
</execution_context>

<non_goals>{from TRD Section 8 -- DO NOT implement}</non_goals>
<risk_context>{from TRD Section 7 with mitigations}</risk_context>

<instructions>
You are executing a work session for TRD implementation.

For EACH assigned task, execute the full staged cycle using /implement-trd
Appendix A delegation templates:

1. IMPLEMENT (A.2): Write the code. You are @{agent_type}.
2. VERIFY (A.3): Delegate to @verify-app (subagent_type: "verify-app").
3. DEBUG (A.5, if verify fails and strategy blocks): Delegate to @app-debugger
   (subagent_type: "app-debugger"). Max 3 retries. Report STUCK if exhausted.
4. SIMPLIFY (A.6): Delegate to @code-simplifier (subagent_type: "code-simplifier").
5. VERIFY POST-SIMPLIFY (A.3): Re-verify via @verify-app.
6. REVIEW (A.7): Delegate to @code-reviewer (subagent_type: "code-reviewer").
   If REJECTED (A.8): fix issues, return to VERIFY.
7. UPDATE: Mark TRD checkbox done, git commit, TaskUpdate status completed.

When delegating to subagents, pass the task's <skills> list explicitly in each
delegation template's <skills><matched> field. Instruct each subagent to invoke
matched skills via the Skill tool before working.

Strategy enforcement follows /implement-trd Section 4.4 rules.

**Delivery (CRITICAL):** Your plain text output is NOT visible to the lead in native
team mode. Per-task status and final completion MUST be sent via `SendMessage` or they
are invisible. After ALL tasks complete, send a completion message to the team lead:

```javascript
SendMessage({
  to: "team-lead",
  summary: "session {session_name} complete",
  message: "[{task_id}] {STATUS} | files: {file_list} | coverage: unit {X}% int {Y}%\n…"
})
```

If STUCK (3+ retries), send an immediate `SendMessage` with the same shape but
`STATUS: STUCK` and a short reason — do not just stop and idle. A teammate going idle
without `SendMessage` is invisible to the lead.
</instructions>
```

### 4.3 Phase Checkpoint

After ALL parallel groups in a phase complete:

1. **Aggregate** results across teammates (completed/failed/blocked, file list, coverage)
2. **Quality gate** -- same as `/implement-trd` Step 5.1 (verify-app full suite)
3. **Git checkpoint** -- same as `/implement-trd` Step 5.2
4. **Update state** -- same as `/implement-trd` Step 5.3 (checkpoint entry, advance phase_cursor)
5. **Context management**:
   ```
   Phase {N} checkpoint complete.
   Completed: {list} | Teammates: {session_names}
   State: .trd-state/<trd-name>/implement.json
   Recommendation: Run /compact before Phase {N+1}.
   ```

---

## Step 5: Completion

Same as `/implement-trd` Step 7 completion report, with added team metrics:
- Mode: Team (parallel sessions)
- Parallel groups executed: {count}
- Total teammate sessions: {count}

For Wiggum mode, signal: `<promise>COMPLETE</promise>`

---

## Step 6: Pause for User

Same as `/implement-trd` Step 8, with one additional option:
```
6. "reassign" - Reassign stuck task to a different agent type
```

---

## State Schema Extension

Uses `/implement-trd` Step 6 schema. Additions per task entry:

```json
{
  "tasks": {
    "AUTH-B001": {
      "teammate_session_id": "phase1_backend",
      "...": "(all standard fields from /implement-trd)"
    }
  },
  "active_sessions": {
    "phase1_backend": "sess_abc123",
    "phase1_frontend": "sess_def456"
  }
}
```

- `teammate_session_id`: Name of the teammate session that executed this task
- `active_sessions`: Maps session names to teammate identifiers for resume tracking

---

## Error Handling

All `/implement-trd` error handling applies. Team-specific additions:

| Error | Response |
|-------|----------|
| Teammate fails to spawn | Retry once; if still failing, execute session sequentially as lead |
| Teammate silent (30+ min) | Send message; if no response, mark tasks as stalled |
| File conflict between teammates | Pause later teammate, wait for first to commit, resume |
| Team cleanup fails | Send shutdown_request to remaining, wait, retry cleanup |
| No execution plan in TRD | Warn and fall back to sequential `/implement-trd` |

---

## Compatibility

- Requires Claude Code Agent Teams feature (experimental)
- Falls back to sequential `/implement-trd` if Teams unavailable or TRD lacks parallelization map
- All `/implement-trd` compatibility notes apply
- State files interoperable: start with `/implement-trd`, resume with `/implement-trd-team` or vice versa


---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /implement-trd-team] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /implement-trd-team] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /implement-trd-team] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /implement-trd-team ═══
   <one-line summary>
   ```

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /implement-trd-team ═══` with Reason + Next.
