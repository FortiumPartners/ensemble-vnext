---
name: harden-trd-team
description: Hardening pass over implemented TRD — closes gaps, edge cases, contracts, regressions, and interaction risks using parallel teammates
argument-hint: "[trd-path] [--phase N] [--session <name>] [--resume] [--reset-state] [--wiggum]"
version: 1.0.0
category: implementation
---

> **Usage:** `/harden-trd-team [trd-path] [options]`
>
> **Arguments:**
> - `<trd-path>` - Path to TRD file (optional if `.trd-state/current.json` exists)
> - `--phase N` - Execute only phase N
> - `--session <name>` - Execute only named work session
> - `--resume` or `--continue` - Resume from last checkpoint
> - `--reset-state` - Clear harden state file and start fresh (requires confirmation)
> - `--wiggum` - Enable autonomous mode (intercepts exit until complete or max 50 iterations)
>
> **Examples:** `/harden-trd-team`, `/harden-trd-team --resume`, `/harden-trd-team docs/TRD/user-auth.md --wiggum`

This is the **hardening pass** that follows `/implement-trd-team`. It re-examines every
implemented task against the TRD, focusing on contract compliance, edge cases, regression
safety, interaction risks, and shortcut cleanup. It uses Claude Code Agent Teams for
parallel execution, identical to `/implement-trd-team`.

All team orchestration (spawning, monitoring, cleanup, phase checkpoints, error handling)
follows `/implement-trd-team` exactly. This command defines a different **stage cycle**
and **delegation templates** purpose-built for hardening.

**ULTRATHINK**: Parse the TRD execution plan and cross-reference with existing code to
understand implementation state before spawning teammates.

## User Input

```text
$ARGUMENTS
```

Parse: TRD path, `--phase N`, `--session <name>`, `--resume`/`--continue`, `--reset-state`, `--wiggum`.

---

## Execution Model

```
PREFLIGHT -> RESUME CHECK -> PHASE LOOP -> COMPLETE

Stage Cycle (per task):
  AUDIT -> HARDEN -> VERIFY -> [DEBUG if fail] -> REVIEW -> UPDATE

vs implement-trd:
  IMPLEMENT -> VERIFY -> [DEBUG] -> SIMPLIFY -> VERIFY -> REVIEW -> UPDATE
```

**Key difference:** The AUDIT stage forces the agent to read and analyze before touching
anything. HARDEN is targeted fixes, not greenfield. SIMPLIFY is removed — hardening IS
the cleanup.

**Strategy:** Always `refactor`. Tests must pass before AND after every change.

---

## Step 1: Preflight

Execute `/implement-trd` Steps 1.1-1.6 with these overrides:

- **1.4 Strategy Detection:** Override to `refactor` regardless of TRD declaration or arguments.
- **1.6 Load Non-Goals and Risks:** Same extraction, but also extract the Master Task List
  acceptance criteria per task — these become the audit checklist.

**Additional validation:**

1. Verify the TRD contains an Execution Plan (Section 5) with parallelization map.
   If missing, fall back to sequential execution with warning.

2. **Implementation existence check:** For each TRD task, verify code actually exists.
   Do NOT rely solely on `implement.json` status fields — the state file may be wrong
   or stale. Before excluding any task from hardening:

   ```
   For each task:
     1. Read implement.json status (if available)
     2. REGARDLESS of status, check if files/code described by the task exist
     3. If code exists -> include in hardening pass
     4. If code does NOT exist -> exclude with warning:
        "WARNING: {task_id} appears unimplemented (no matching code found). Skipping."
   ```

   **Default assumption:** If someone has run `/harden-trd-team` on a TRD, the code is
   implemented. Trust the code over the state file.

---

## Step 2: Resume and Recovery

Execute `/implement-trd` Step 2 identically, but operate on the **harden state file**:

`.trd-state/<trd-name>/harden.json`

This is a separate file from `implement.json`. The harden pass has its own state,
checkpoints, and recovery — it never reads or writes `implement.json`.

Teammate session recovery follows `/implement-trd-team` Step 2 rules.

---

## Step 3: Parse Execution Plan

Identical to `/implement-trd-team` Step 3 (extract phase structure, build session
dependency graph, file conflict detection).

### 3.1 Stage Expansion

Each TRD task expands to sub-tasks with dependencies:

```
TRD Task: AUTH-F001 -> frontend-implementer

Creates TaskTools tasks:
  AUTH-F001:audit    [owner: {original implementer type}]
  AUTH-F001:harden   [owner: {original implementer type}, blockedBy: :audit]
  AUTH-F001:verify   [owner: verify-app, blockedBy: :harden]
  AUTH-F001:review   [owner: code-reviewer, blockedBy: :verify]
```

**Agent selection for AUDIT and HARDEN:** Use the same implementer type that built the
original code. Check `implement.json` `implementer_type` field if available, otherwise
infer from task keywords per `/implement-trd` Section 4.3.

---

## Step 4: Phase Execution with Teams

Follows `/implement-trd-team` Step 4 orchestration exactly (spawn team, spawn teammates,
monitor, collect results, cleanup). The only difference is the **Teammate Prompt Template**.

### 4.1 Teammate Prompt Template

```xml
<team_session>
  <trd>{trd_path}</trd>
  <phase>{phase_number}</phase>
  <session>{session_name}</session>
  <mode>harden</mode>
</team_session>

<assigned_tasks>
  <task id="{task_id}" description="{task_description}">
    <acceptance_criteria>{extracted from TRD}</acceptance_criteria>
    <skills>{from TRD Skills column or inferred by lead}</skills>
    <dependencies>{dependency task IDs}</dependencies>
    <known_files>{files from implement.json or inferred from task}</known_files>
  </task>
</assigned_tasks>

<execution_context>
  <strategy>refactor</strategy>
  <quality_gates>
    <unit_coverage>{target}%</unit_coverage>
    <integration_coverage>{target}%</integration_coverage>
  </quality_gates>
  <verification_level>{from constitution.md}</verification_level>
</execution_context>

<non_goals>{from TRD Section 8 -- DO NOT implement}</non_goals>
<risk_context>{from TRD Section 7 with mitigations}</risk_context>

<instructions>
You are executing a HARDENING pass on already-implemented code.

This is NOT greenfield implementation. The code exists and nominally works. Your job is
to make it robust, correct, and safe by closing gaps the initial implementation left open.

For EACH assigned task, execute the hardening stage cycle:

1. AUDIT (Template H.1): Read the TRD acceptance criteria AND the existing code.
   Produce a structured findings report. You are @{agent_type}.
   DO NOT write any code during audit — only analyze.

2. HARDEN (Template H.2): Fix every finding from your audit. You are @{agent_type}.
   Targeted changes only — do not rewrite working code that has no findings.

3. VERIFY (A.3 from /implement-trd): Delegate to @verify-app
   (subagent_type: "verify-app"). Zero regressions is mandatory.
   If verify fails and the failure is a regression YOU introduced, fix it immediately
   and re-verify. If it's a pre-existing failure, document it and continue.

4. DEBUG (A.5, if verify fails): Delegate to @app-debugger
   (subagent_type: "app-debugger"). Max 3 retries. Report STUCK if exhausted.

5. REVIEW (Template H.3): Delegate to @code-reviewer
   (subagent_type: "code-reviewer"). Reviewer gets your audit findings as context.
   If REJECTED: fix issues, return to VERIFY.

6. UPDATE: Mark task complete, git commit, TaskUpdate status completed.

When delegating to subagents, pass the task's <skills> list explicitly.
Instruct each subagent to invoke matched skills via the Skill tool before working.

Strategy enforcement: `refactor` — all tests must pass before AND after every change.
Run the test suite BEFORE making any changes to establish a baseline.

After ALL tasks complete, send completion message to team lead:
  [{task_id}] {STATUS} | findings: {count} | fixed: {count} | files: {file_list} | regressions: {count}

If STUCK (3+ retries), report immediately.
</instructions>
```

### 4.2 Phase Checkpoint

Identical to `/implement-trd-team` Step 4.3, with hardening-specific summary:

```
Phase {N} hardening checkpoint complete.
Completed: {list} | Teammates: {session_names}
Total findings: {count} | Fixed: {count} | Deferred: {count}
Regressions introduced: {count} (must be 0)
State: .trd-state/<trd-name>/harden.json
Recommendation: Run /compact before Phase {N+1}.
```

---

## Step 5: Completion

```
===============================================================================
                    TRD HARDENING COMPLETE
===============================================================================

TRD: {trd_filename}
Branch: {branch_name}
Strategy: refactor (enforced)

HARDENING SUMMARY
-----------------
Total tasks hardened:   {N}
Total findings:         {count}
  - Contract gaps:      {count}
  - Edge cases:         {count}
  - Regression risks:   {count}
  - Interaction risks:  {count}
  - Shortcut cleanup:   {count}
Findings fixed:         {count}
Findings deferred:      {count} (with justification)

QUALITY METRICS
---------------
Unit Coverage:        {X}% (target: {T}%)  {PASS/FAIL}
Integration Coverage: {Y}% (target: {T}%)  {PASS/FAIL}
Regressions:          {count} (must be 0)
Security Review:      {Clean/Issues found}

COMMITS
-------
{list of commit SHAs with messages}

NEXT STEPS
----------
1. Review changes: git diff {pre_harden_sha}...HEAD
2. Run full test suite: {test_command}
3. Create PR when satisfied

===============================================================================
```

For Wiggum mode, signal: `<promise>COMPLETE</promise>`

---

## Step 6: Pause for User

Same as `/implement-trd` Step 8.

---

## State Schema

Uses `/implement-trd` Step 6 schema stored at `.trd-state/<trd-name>/harden.json`.

Additions per task entry:

```json
{
  "version": "1.0.0",
  "mode": "harden",
  "trd_file": "docs/TRD/<feature>.md",
  "trd_hash": "<sha256>",
  "branch": "<branch-name>",
  "strategy": "refactor",
  "pre_harden_commit": "<sha of HEAD before hardening started>",
  "phase_cursor": 1,
  "tasks": {
    "AUTH-B001": {
      "description": "Task description",
      "phase": 1,
      "status": "pending|in_progress|success|failed|blocked",
      "cycle_position": "audit|harden|verify|debug|review|complete",
      "implementer_type": "backend-implementer",
      "teammate_session_id": "phase1_backend",
      "audit_findings": {
        "contract_gaps": [],
        "edge_cases": [],
        "regression_risks": [],
        "interaction_risks": [],
        "shortcut_cleanup": []
      },
      "findings_count": 0,
      "findings_fixed": 0,
      "findings_deferred": 0,
      "regressions_introduced": 0,
      "retry_count": 0,
      "commit": "sha or null",
      "started_at": "ISO8601 or null",
      "completed_at": "ISO8601 or null"
    }
  },
  "active_sessions": {},
  "coverage": { "unit": 0.0, "integration": 0.0, "e2e": 0.0 },
  "checkpoints": [],
  "recovery": {
    "last_healthy_checkpoint": null,
    "last_checkpoint_timestamp": null,
    "interrupted": false,
    "interrupt_reason": null
  },
  "metrics": {
    "total_tasks": 0,
    "completed_tasks": 0,
    "failed_tasks": 0,
    "total_findings": 0,
    "total_fixed": 0,
    "total_deferred": 0,
    "total_regressions": 0,
    "total_retries": 0
  }
}
```

---

## Error Handling

All `/implement-trd-team` error handling applies. Hardening-specific additions:

| Error | Response |
|-------|----------|
| Task appears unimplemented | Warn and skip — do not implement from scratch |
| Pre-existing test failure | Document and continue — do not fix unrelated failures |
| Regression introduced by harden | BLOCK — must fix before proceeding |
| Audit finds no issues | Valid outcome — document evidence, mark complete |
| State file missing/wrong | Check code directly — trust code over state |

---

## Compatibility

- Requires implementation to exist (code check, not just state check)
- State files (`harden.json`) are independent from `implement.json`
- Can be re-run — resets harden state, re-audits everything
- Same branch as implementation — no separate PR
- Workflow: `/implement-trd-team` → `/harden-trd-team` → PR
- All `/implement-trd-team` compatibility notes apply

---

# Appendix H: Hardening Delegation Templates

These templates replace the IMPLEMENT/SIMPLIFY templates from `/implement-trd` Appendix A.
VERIFY (A.3), DEBUG (A.5), and REJECTION-FIX (A.8) are reused from `/implement-trd`.

## H.1 Template: AUDIT

```xml
<audit_request>
  <task_id>{task_id}</task_id>
  <description>{task_description}</description>
  <acceptance_criteria>{extracted from TRD}</acceptance_criteria>
  <known_files>{files from implement.json or inferred}</known_files>
</audit_request>

<skills>
  <matched>{matched skill names}</matched>
  <instruction>
    Invoke each listed skill using the Skill tool BEFORE analyzing.
    Use framework-specific knowledge to identify idiom violations and
    framework-provided safety features that aren't being used.
  </instruction>
</skills>

<instructions>
You are performing a hardening AUDIT on already-implemented code.

DO NOT WRITE ANY CODE. This stage is analysis only.

1. **Baseline**: Run the test suite against the files for this task.
   Record pass/fail state. This is your regression baseline.

2. **Read the code**: Read EVERY file listed in known_files, plus any
   files they import/require. Understand what the code actually does.

3. **Read the TRD**: Re-read the acceptance criteria for this task.
   Compare what the code does vs what the TRD specifies.

4. **Produce findings** in these categories:

   **Contract Gaps** — Where the implementation doesn't fully satisfy
   the TRD acceptance criteria. Missing API contract enforcement (input
   validation, output shapes, error response formats, status codes).
   Promises made in the TRD that the code doesn't deliver.

   **Edge Cases** — Unhandled inputs, states, or sequences:
   - Null/undefined/empty values
   - Boundary values (0, -1, MAX_INT, empty string, huge payloads)
   - Concurrent access / race conditions
   - Error propagation paths (what happens when dependencies fail?)
   - Partial failure scenarios

   **Regression Risks** — Code that would break silently if adjacent
   code changes. Missing test coverage for critical paths. Implicit
   ordering dependencies. Hardcoded assumptions about environment or data.

   **Interaction Risks** — How this code interacts with other parts of
   the codebase. Shared mutable state. Import cycles. Assumptions about
   initialization order. Side effects that callers may not expect.
   Event/callback chains that could cascade failures.

   **Shortcut Cleanup** — TODOs left in code, hardcoded values that
   should be configurable, missing input validation, overly broad
   try/catch that swallows errors, console.log/print debugging left in,
   commented-out code, magic numbers.

5. **Classify severity** for each finding:
   - **must-fix**: Contract violation, data loss risk, security gap
   - **should-fix**: Edge case, missing validation, regression risk
   - **nice-to-fix**: Style, naming, minor cleanup

Deliverables (ALL required):
- files_read: every file you examined (with line counts)
- baseline_tests: pass/fail count before any changes
- findings: structured list per category with severity
- findings_count: total number of findings
- must_fix_count: findings that are blocking
- summary: 2-3 sentence overview of code health for this task
</instructions>
```

**Invoke:** `Agent(subagent_type="{implementer_type}", prompt="[above]")`

---

## H.2 Template: HARDEN

```xml
<harden_request>
  <task_id>{task_id}</task_id>
  <description>{task_description}</description>
  <audit_findings>{structured findings from AUDIT stage}</audit_findings>
  <baseline_tests>{pass/fail counts from AUDIT}</baseline_tests>
</harden_request>

<skills>
  <matched>{matched skill names}</matched>
  <instruction>
    Invoke matched skills for framework-specific patterns when fixing findings.
  </instruction>
</skills>

<instructions>
You are performing targeted HARDENING based on audit findings.

**Strategy: refactor** — All existing tests MUST continue to pass. You are
improving robustness, not changing behavior.

**Rules:**
- Fix ALL must-fix and should-fix findings from the audit
- Fix nice-to-fix findings only if the change is low-risk and localized
- Do NOT rewrite working code that has no findings against it
- Do NOT add features beyond what the TRD specifies
- Every change must be justified by a specific audit finding

**For each finding, in priority order (must-fix first):**

1. Write or update tests that expose the gap BEFORE fixing it
   (characterize the current behavior, then fix)
2. Implement the fix — minimal, targeted change
3. Verify the fix addresses the finding
4. Verify no existing tests broke

**Edge case handling:**
- Add test cases for identified edge cases
- Add input validation where missing
- Add error handling for unhandled failure paths
- Replace hardcoded values with constants or configuration

**Contract enforcement:**
- Add/fix input validation to match TRD-specified contracts
- Ensure error responses match documented formats
- Add type guards or runtime checks where static types are insufficient

**Interaction safety:**
- Add defensive checks at module boundaries
- Document assumptions about callers/callees with inline comments (brief)
- Add guard clauses for shared state access

**If a finding cannot be fixed** without changing behavior or exceeding scope:
- Document WHY it's deferred with a code comment: `// HARDEN-DEFERRED: {reason}`
- Include in deferred_findings output

Deliverables (ALL required):
- files_changed: list of files modified with paths
- findings_addressed: list of finding IDs/descriptions that were fixed
- findings_deferred: list of findings not addressed, with justification
- tests_added: list of new test cases
- regression_check: confirmation that all baseline tests still pass
- SKILLS_USED: exact skill names invoked
- RULES_APPLIED: concrete rules per skill that influenced fixes
</instructions>
```

**Invoke:** `Agent(subagent_type="{implementer_type}", prompt="[above]")`

---

## H.3 Template: REVIEW (Hardening)

```xml
<review_request>
  <task_id>{task_id}</task_id>
  <files_to_review>{list of all files modified during HARDEN stage}</files_to_review>
  <acceptance_criteria>{from TRD task description}</acceptance_criteria>
  <audit_findings>{original findings from AUDIT stage}</audit_findings>
  <findings_addressed>{list from HARDEN stage}</findings_addressed>
  <findings_deferred>{list from HARDEN stage with justifications}</findings_deferred>
</review_request>

<skills>
  <matched>{all skills from AUDIT + HARDEN stages}</matched>
  <instruction>
    Invoke matched skills to validate fixes follow framework conventions.
  </instruction>
</skills>

<instructions>
You are reviewing a HARDENING pass, not a fresh implementation.

Your review has two dimensions:

**1. Standard Review (from /implement-trd A.7):**
- Security: OWASP Top 10, input validation, secrets, auth
- Quality: complexity, naming, error handling, test quality
- DoD: acceptance criteria met, coverage thresholds

**2. Hardening-Specific Review:**

- **Audit coverage**: Were all must-fix findings addressed?
  Cross-reference audit_findings against findings_addressed.
  Flag any must-fix finding that was NOT addressed and NOT deferred with justification.

- **Deferred findings**: Are the deferral justifications legitimate?
  A deferred must-fix requires strong justification (e.g., "requires API change
  outside this TRD's scope"). Reject weak justifications.

- **Regression safety**: Did the hardening changes introduce any new risks?
  Look for behavioral changes disguised as "hardening." Check that test
  assertions weren't weakened to make tests pass.

- **Contract completeness**: Are API boundaries now properly guarded?
  Input validation, output shape enforcement, error format consistency.

- **Interaction safety**: Are module boundaries clean? Are assumptions
  about callers/dependencies documented or enforced?

Report:
- APPROVED: All must-fix addressed, no regressions, contracts enforced
- APPROVED_WITH_RECOMMENDATIONS: Minor gaps remain but acceptable
- REJECTED: Must-fix findings unaddressed, regressions detected, or
  weak deferrals on critical findings (list specific issues)
</instructions>
```

**Invoke:** `Agent(subagent_type="code-reviewer", prompt="[above]")`

---

# Appendix S: Stage Handoff Contract

| Stage | Agent | Returns | Used By |
|-------|-------|---------|---------|
| AUDIT | *-implementer | findings{}, baseline_tests, files_read | HARDEN |
| HARDEN | *-implementer | files_changed[], findings_addressed[], findings_deferred[], tests_added[] | VERIFY |
| VERIFY | verify-app | pass/fail, coverage_metrics, failure_details[] | DEBUG or REVIEW |
| DEBUG | app-debugger | files_fixed[], root_cause | VERIFY (retry) |
| REVIEW | code-reviewer | decision, issues[], recommendations[] | UPDATE or HARDEN |

**Handoff Rules:**
- AUDIT MUST complete before HARDEN starts (findings drive all changes)
- HARDEN passes audit_findings to REVIEW for cross-referencing
- Regressions (tests that passed in AUDIT baseline but fail after HARDEN) are BLOCKING
- REJECTED review -> SAME implementer with rejection issues + original audit findings


---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /harden-trd-team] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /harden-trd-team] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /harden-trd-team] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /harden-trd-team ═══
   <one-line summary>
   ```

5. **PushNotification ON FINAL TURN ONLY** — this is a long-running command; the user has likely walked away. In the same final turn that emits COMMAND COMPLETE, also call:
   ```javascript
   PushNotification({
     status: "proactive",
     message: "harden-trd-team done: <one-line summary, under 200 chars, leads with what they'd act on>"
   })
   ```
   On `COMMAND STUCK`, send a `PushNotification` whose message states the Reason + Next action (the user needs to come back to unblock). Do NOT send notifications on intermediate Stops, DISPATCHED turns, RESUMED turns, or PHASE boundaries — only the truly-final turn. If the push tool reports "not sent," that's expected; do not retry.

6. **PROGRAMMATIC NOTIFY ON FINAL TURN ONLY** — for orchestration / webhooks / queues / shell pipelines, invoke the user's `NOTIFY_ON_COMPLETE` shell command via Bash on the SAME final turn:
   ```bash
   .claude/hooks/notify-complete.sh "harden-trd-team" "complete" "<one-line summary>"
   ```
   For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"` and use the Reason as the summary. The bracket-guard means it's a no-op when the user hasn't configured it. Same single-fire timing as the PushNotification — only on the truly-final turn.

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /harden-trd-team ═══` with Reason + Next (and the PushNotification above).


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
