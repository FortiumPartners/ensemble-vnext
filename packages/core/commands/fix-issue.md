---
name: fix-issue
description: Fix a triaged issue using the lightweight issue TRD — implement, verify, and review in a single compressed pass
argument-hint: "[issue-trd-path] [--resume] [--reset-state]"
version: 1.0.0
category: maintenance
---

> **Usage:** `/fix-issue [issue-trd-path] [options]`
>
> **Arguments:**
> - `<issue-trd-path>` - Path to issue TRD (optional if `.trd-state/current.json` points to one)
> - `--resume` or `--continue` - Resume from last checkpoint
> - `--reset-state` - Clear state and start fresh
>
> **Examples:**
> - `/fix-issue` — uses current.json
> - `/fix-issue docs/TRD/issues/FIX-stale-dashboard.md`
> - `/fix-issue --resume`

This is the **compressed implementation pipeline** for issues triaged by `/investigate-issue`.
It runs the same fundamental stages as `/implement-trd` but in a single pass optimized for
small, low-risk changes.

**Key differences from /implement-trd:**
- No phase structure — all tasks run in one pass
- Compressed cycle: FIX → VERIFY → [DEBUG] → DONE per task (no SIMPLIFY — it's already
  small); review runs once, after final verification, via the `/code-review` skill —
  not per task via a `code-reviewer` subagent (see Step 4.5)
- Built-in verification against reproduction steps (not just unit tests)
- Uses a team only when 2+ tasks exist; single-agent for 1 task
- Max 2 debug retries (not 3) — small fixes shouldn't need deep debugging
- Automatic verification run at the end (no separate /verify-trd-team needed)

## User Input

```text
$ARGUMENTS
```

Parse: issue TRD path, `--resume`/`--continue`, `--reset-state`.

---

## Execution Model

```
PREFLIGHT -> [TEAM SPAWN if 2+ tasks] -> FIX LOOP -> FINAL VERIFY -> REVIEW -> COMPLETE

Fix Loop (per task):
  FIX -> VERIFY -> [DEBUG if fail, max 2] -> UPDATE
```

Review is a single end-of-run stage (Step 4.5), not part of the per-task loop — the
built-in `/code-review` skill covers the whole fix's diff in one pass, which is both more
effective than a per-task `code-reviewer` delegation and cheaper for a compressed pipeline.

**Strategy:** Always `bug-fix` — reproduce, write failing test, fix.

---

## Step 1: Preflight

### 1.1 Load Issue TRD

**Priority order:**
1. Explicit path from `$ARGUMENTS`
2. Active TRD from `.trd-state/current.json` (field: `trd`)
3. Most recent file in `docs/TRD/issues/`
4. Prompt user

**Validation:** Must contain "Fix Plan" section with tasks in format `- [ ] **ID-NNN**: Description`.

### 1.2 Extract Issue Context

From the issue TRD, extract:
- **Reproduction steps** — these become the final verification checklist
- **Root cause** — context for the implementer
- **Verification plan** — specific checks to confirm the fix
- **Non-goals** — boundaries for the fix
- **Tasks** — the fix plan items

### 1.3 Git Branch

Check current branch. If not already on the fix branch:
```bash
git checkout fix/<issue-id>
# or create if needed:
git checkout -b fix/<issue-id>
```

### 1.4 State File

Location: `.trd-state/<issue-id>/implement.json`

Uses the same schema as `/implement-trd` Step 6, with:
- `strategy: "bug-fix"`
- `mode: "fix-issue"`

---

## Step 2: Resume and Recovery

If `--resume`: Same as `/implement-trd` Step 2, operating on the issue state file.

If `--reset-state`: Confirm, delete state, start fresh.

---

## Step 3: Execute Fix

### 3.1 Single Task (no team)

If the issue TRD has only 1 task, execute directly without spawning a team:

1. **FIX** — Delegate to appropriate implementer (Template F.1)
2. **VERIFY** — Delegate to verify-app (Template F.2)
3. **DEBUG** — If verify fails, delegate to app-debugger (max 2 retries)
4. **UPDATE** — Mark complete, commit

### 3.2 Multiple Tasks (team mode)

If 2+ tasks, spawn teammates directly — no team creation step is needed; a team forms
automatically on the first spawn:

```javascript
Agent({ subagent_type, name, prompt });
```

Spawn one teammate per task (or group related tasks). Each teammate runs the FIX -> VERIFY
-> [DEBUG] -> UPDATE cycle using the templates below — REVIEW is not part of the per-task
cycle; it runs once, over the whole issue's diff, at Step 4.5. Teammates share the working
tree (no
`isolation: "worktree"`); keep each teammate's files disjoint. Express task grouping via
task names plus `blockedBy` dependencies on the shared task list
(`TaskCreate`, then `TaskUpdate({taskId, addBlockedBy: [...]})`) rather than `team_name`,
which is accepted but ignored by the platform.

**Recommended, not mandatory:** pair the spawn with a safety-net wake-up before ending the
turn — teammate `SendMessage` auto-delivery reliably re-invokes the lead (see
`.claude/rules/async-discipline.md`), so this is cheap insurance:
```javascript
ScheduleWakeup({
  delaySeconds: 1200,
  reason: "team-mailbox drain fallback for fix-<issue-id>",
  prompt: "/fix-issue [original arguments here]"
});
```

Monitor for teammate `SendMessage` completions and collect results. No teardown step is
required — cleanup is automatic when a teammate's session exits.

---

## Step 4: Final Verification

After all tasks complete, run one final verification against the **reproduction steps**
from the issue TRD. This is the "does the bug actually stay fixed?" check.

```xml
<final_verification>
  <issue_id>{issue_id}</issue_id>
  <reproduction_steps>{from issue TRD}</reproduction_steps>
  <verification_plan>{from issue TRD}</verification_plan>
  <files_changed>{all files modified across all tasks}</files_changed>
</final_verification>

<instructions>
Final verification for issue fix. Two checks:

1. **Reproduction check**: Follow the reproduction steps from the issue.
   Confirm the bug NO LONGER occurs. If you can run the app or tests, do so.
   If not, trace the code path and confirm the fix addresses the root cause.

2. **Regression check**: Run the full test suite for affected files.
   Confirm nothing else broke.

3. **Verification plan**: Execute each item in the verification plan.

Report:
- reproduction_fixed: true/false
- regression_issues: list (should be empty)
- verification_plan_results: pass/fail per item
</instructions>
```

**Invoke:** `Agent(subagent_type="verify-app", prompt="[above]")`

If final verification fails:
- If reproduction still occurs: route back to fix loop for the relevant task
- If regression: route to app-debugger, then re-verify
- Max 1 additional cycle — if still failing, pause for user

---

## Step 4.5: Code Review

Once final verification passes, review the whole fix in a single pass over the issue's
diff — not per task, and not via a `code-reviewer` subagent delegation (removed, ITR-B010):
the built-in reviewer is more effective and this pipeline is compressed enough that one
pass over the full diff is proportional.

```
Skill({ skill: "code-review", args: "medium {branch_base}...HEAD" })
```

`{branch_base}` is `main` (or the branch `/fix-issue` started from). Apply straightforward,
clearly-justified findings inline; if a finding is non-trivial or changes scope, report it
in Step 5's output rather than guessing at a fix.

---

## Step 5: Completion

### 5.1 Git Commit and Cleanup

```bash
git add -A
git commit -m "fix(<issue-id>): <issue title>

<one-line root cause>
<one-line fix description>"
```

### 5.2 Report

```
===============================================================================
                    ISSUE FIXED
===============================================================================

Issue: <title>
ID: <issue-id>
Branch: fix/<issue-id>

FIX SUMMARY
-----------
Tasks completed: <count>
Files changed: <list>
Tests added/modified: <list>

VERIFICATION
------------
Reproduction check: PASS
Regression check: PASS
Verification plan: <N>/<N> PASS

NEXT STEPS
----------
1. Review changes: git diff main...fix/<issue-id>
2. Create PR: gh pr create --title "fix(<issue-id>): <title>"
3. After merge: move docs/TRD/issues/<issue-id>.md to docs/TRD/completed/

===============================================================================
```

If verification did NOT fully pass:

```
===============================================================================
                    ISSUE PARTIALLY FIXED
===============================================================================

Issue: <title>
ID: <issue-id>

REMAINING ISSUES
----------------
<list what didn't pass with details>

OPTIONS
-------
1. "fix <guidance>" - Provide guidance for remaining issues
2. "accept" - Accept current state, create PR with known limitations
3. "escalate" - This needs the full /implement-trd pipeline

===============================================================================
```

---

## State Schema

Same as `/implement-trd` Step 6 at `.trd-state/<issue-id>/implement.json`, with additions:

```json
{
  "version": "1.0.0",
  "mode": "fix-issue",
  "strategy": "bug-fix",
  "issue_trd": "docs/TRD/issues/<issue-id>.md",
  "reproduction_status": "confirmed|fixed|still_failing",
  "final_verification": {
    "reproduction_fixed": null,
    "regression_issues": [],
    "verification_plan_results": {}
  }
}
```

---

## Error Handling

| Error | Response |
|-------|----------|
| No issue TRD found | Suggest `/investigate-issue` first |
| Issue TRD has no tasks | Report format error |
| Fix introduces regression | Route to app-debugger, max 2 retries |
| Reproduction still occurs after fix | Pause for user — root cause may be wrong |
| Task exceeds 5 files changed | Warn: "This may be too large for /fix-issue. Consider /implement-trd." |
| Debug retries exhausted | Pause with escalation option |

---

# Appendix F: Fix Delegation Templates

## F.1 Template: FIX

```xml
<fix_request>
  <issue_id>{issue_id}</issue_id>
  <task_id>{task_id}</task_id>
  <description>{task_description}</description>
  <files>{likely affected files from issue TRD}</files>
  <approach>{approach from issue TRD}</approach>
</fix_request>

<issue_context>
  <root_cause>{from issue TRD}</root_cause>
  <reproduction_steps>{from issue TRD}</reproduction_steps>
  <expected_behavior>{from issue TRD}</expected_behavior>
  <actual_behavior>{from issue TRD}</actual_behavior>
</issue_context>

<non_goals>{from issue TRD}</non_goals>

<skills>
  <matched>{matched skill names}</matched>
  <instruction>
    Invoke matched skills using the Skill tool before writing code.
  </instruction>
</skills>

<instructions>
You are fixing a bug. Follow the bug-fix methodology:

1. **REPRODUCE**: Write a failing test that captures the bug.
   The test should fail with the current code and pass after your fix.
   This prevents regression.

2. **FIX**: Implement the minimal fix described in the approach.
   - Stay within the files listed
   - Do NOT refactor surrounding code
   - Do NOT add features beyond the fix
   - Respect non-goals

3. **CONFIRM**: Verify your fix makes the failing test pass.

Deliverables:
- files_changed: list of modified files
- test_added: path to the regression test
- fix_description: one-line summary of what you changed
- SKILLS_USED: exact skill names invoked
</instructions>
```

**Invoke:** `Agent(subagent_type="{implementer_type}", prompt="[above]")`

## F.2 Template: VERIFY

```xml
<verification_request>
  <issue_id>{issue_id}</issue_id>
  <task_id>{task_id}</task_id>
  <files_changed>{from FIX stage}</files_changed>
  <test_added>{from FIX stage}</test_added>
  <reproduction_steps>{from issue TRD}</reproduction_steps>
</verification_request>

<skills>
  <matched>{test framework skills}</matched>
  <instruction>Invoke matched skills for test runner patterns.</instruction>
</skills>

<instructions>
Verify the bug fix:

1. Run the new regression test — must PASS
2. Run the full test suite for affected files — must PASS (no regressions)
3. If practical, follow the reproduction steps and confirm the bug is fixed

Report:
- regression_test: pass/fail
- test_suite: pass/fail (total, passed, failed)
- reproduction_check: fixed/still_failing/not_testable
- coverage: unit%, integration%
</instructions>
```

**Invoke:** `Agent(subagent_type="verify-app", prompt="[above]")`

---

# Appendix S: Stage Handoff Contract

| Stage | Agent | Returns | Used By |
|-------|-------|---------|---------|
| FIX | *-implementer | files_changed, test_added, fix_description | VERIFY |
| VERIFY | verify-app | pass/fail, reproduction_check | DEBUG or UPDATE |
| DEBUG | app-debugger | files_fixed, root_cause | VERIFY (retry) |
| FINAL VERIFY | verify-app | reproduction_fixed, regression_issues | REVIEW |
| REVIEW | `/code-review` skill (Step 4.5) | applied fixes, reported findings | COMPLETE |


---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /fix-issue] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /fix-issue] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /fix-issue] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /fix-issue ═══
   <one-line summary>
   ```

5. **PushNotification ON FINAL TURN ONLY** — this is a long-running command; the user has likely walked away. In the same final turn that emits COMMAND COMPLETE, also call:
   ```javascript
   PushNotification({
     status: "proactive",
     message: "fix-issue done: <one-line summary, under 200 chars, leads with what they'd act on>"
   })
   ```
   On `COMMAND STUCK`, send a `PushNotification` whose message states the Reason + Next action (the user needs to come back to unblock). Do NOT send notifications on intermediate Stops, DISPATCHED turns, RESUMED turns, or PHASE boundaries — only the truly-final turn. If the push tool reports "not sent," that's expected; do not retry.

6. **PROGRAMMATIC NOTIFY ON FINAL TURN ONLY** — for orchestration / webhooks / queues / shell pipelines, invoke the user's `NOTIFY_ON_COMPLETE` shell command via Bash on the SAME final turn:
   ```bash
   .claude/hooks/notify-complete.sh "fix-issue" "complete" "<one-line summary>"
   ```
   For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"` and use the Reason as the summary. The bracket-guard means it's a no-op when the user hasn't configured it. Same single-fire timing as the PushNotification — only on the truly-final turn.

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /fix-issue ═══` with Reason + Next (and the PushNotification above).


---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

This command runs **autonomously** from this invocation to the COMMAND COMPLETE banner.
**Do NOT pause mid-flow to ask the user to confirm decisions, review artifacts, verify
checkpoints, or defer to stakeholders.** The user already authorized the run by invoking
the command; do not ask them to authorize it again, in pieces.

`AskUserQuestion` is permitted ONLY in these four cases:

1. **Genuine requirement ambiguity** — the PRD/TRD/stack.md is silent on a decision
   that MUST be made, AND no reasonable default exists from documented constraints.
   *Try a default first; ask only if none fits.*
2. **Missing information that cannot be derived** — a value not in the codebase, env,
   config, or anywhere derivable (a user-specific URL, API key not in env, etc.).
3. **Truly irreversible destructive operations** — `--reset-state` with progress,
   `git push --force`, deleting user-authored files. Routine state mutations do NOT
   qualify.
4. **STUCK conditions** — retry exhaustion after the documented mitigations have run.

Outside these four cases: **decide based on documented constraints, document the
rationale in the artifact, and proceed.** The user iterates via `/refine-prd`,
`/refine-trd`, or `/implement-trd --resume` — not via mid-loop confirmation prompts.

Forbidden patterns:
- "Should I proceed to phase N+1?" → no — emit PHASE banner, proceed.
- "Please review this artifact before I continue." → no — finish the artifact, emit
  COMMAND COMPLETE.
- "Multiple approaches possible; which do you prefer?" → pick the best fit, document
  why, mention alternatives in the artifact if useful.
- "Should I check with product/legal/stakeholders?" → no — decide based on documented
  goals; the user can correct via /refine-*.
- "Checkpoint reached. Continue?" → continue. Always.
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- "Given the previous step went cleanly, do you want me to pause and review?" → self-defeating: you just acknowledged there's nothing to address. PROCEED.

### `--wiggum` and other autonomous-mode flags

When the user has passed `--wiggum` on this command, the autonomy contract is **doubly enforced**: every "should I continue?" question is already answered YES by the flag itself. The FOUR valid `AskUserQuestion` cases shrink to ONE — only STUCK conditions after retry exhaustion. All other questions, hedged offers, and "want me to pause?" framings are forbidden. The COMMAND COMPLETE banner is the FIRST and ONLY return of control to the user during a `--wiggum` run.
