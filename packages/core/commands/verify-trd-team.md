---
name: verify-trd-team
description: Live verification pass — confirms implemented TRD delivers promised functionality through API testing, UI testing, and service integration validation
argument-hint: "[trd-path] [--promise \"<text>\"] [--phase N] [--session <name>] [--resume] [--reset-state] [--wiggum]"
version: 1.0.0
category: verification
---

> **Usage:** `/verify-trd-team [trd-path] [options]`
>
> **Arguments:**
> - `<trd-path>` - Path to TRD file (optional if `.trd-state/current.json` exists)
> - `--promise "<text>"` - Custom completion promise (overrides default)
> - `--phase N` - Execute only phase N
> - `--session <name>` - Execute only named work session
> - `--resume` or `--continue` - Resume from last checkpoint
> - `--reset-state` - Clear verify state AND reset run counter (requires confirmation)
> - `--wiggum` - Enable autonomous mode
>
> **Examples:**
> - `/verify-trd-team` — verify with default promise
> - `/verify-trd-team --promise "All CRUD endpoints return correct status codes and the dashboard renders with live data"` — custom promise
> - `/verify-trd-team --resume` — continue interrupted verification

This is the **live verification pass** that follows `/implement-trd` and optionally
`/harden-trd-team`. It does NOT check that unit tests pass — it verifies that the
implementation delivers its promised functionality end-to-end.

This command is designed to be run repeatedly as part of an externally-managed loop.
Each run is tracked. After 3 runs without full satisfaction, it halts and requires
human intervention.

All team orchestration (spawning, monitoring, cleanup, phase checkpoints, error handling)
is defined in **Step 4** below: teammates spawn directly via
`Agent({subagent_type, name, prompt})` — a team forms automatically on the first spawn,
with no setup step and no cleanup step. This command defines a different **stage cycle**
and **delegation templates** purpose-built for live verification.

**ULTRATHINK**: Read the TRD, PRD, and completion promise. Understand what "done" looks
like from the user's perspective before spawning any teammates.

---

## Autonomous alternative: `/goal` + the `verify-goal` skill

This command runs an **externally-managed** loop (re-run up to 3×, parallel teammates). For
a **single-session, self-driving** loop, use the `verify-goal` skill under `/goal` instead —
`/goal` keeps the session working turn-after-turn until the verify.json contract is
satisfied (works headless via `claude -p` and remote).

A command cannot activate `/goal` itself (slash commands fire only from direct user input),
so **at the end of Preflight this command emits the concrete, ready-to-paste invocation**
for the resolved TRD:

```bash
claude -p "/goal Every assertion in .trd-state/<trd-name>/verify.json has verdict \"pass\" (or acceptable \"blocked\"); zero \"pending\" or \"fail\". Use the verify-goal skill against <trd-path>."
```

Both paths share the same verify.json schema and PROBE/FIX cycle defined below, so you can
switch freely. Use this team command for parallel assertion groups + a bounded run count;
use `verify-goal` + `/goal` for hands-off completion.

## User Input

```text
$ARGUMENTS
```

Parse: TRD path, `--promise "<text>"`, `--phase N`, `--session <name>`, `--resume`/`--continue`, `--reset-state`, `--wiggum`.

---

## Completion Promise

The completion promise defines what "verified" means. It is the exit criteria for the
entire verification pass.

### Default Promise

If no `--promise` is provided, use:

> Live verification — through API testing, UI testing, and (to the extent practical)
> non-destructive read-only third-party service testing — confirms the implementation
> is functional, aligned with the PRD, and delivers the intended user outcomes.

### Custom Promise

If `--promise` is provided, use it verbatim. The promise is stored in the verify state
file and persists across runs/resumes.

### Promise Decomposition

Before verification begins, decompose the promise into **verifiable assertions** — concrete,
testable statements that collectively satisfy the promise. Each assertion maps to one or
more TRD tasks.

```
Promise: "Users can sign up, log in, and see their dashboard with live data"

Assertions:
  V-001: POST /api/auth/register returns 201 with valid payload and creates user record
  V-002: POST /api/auth/login returns 200 with JWT for valid credentials
  V-003: POST /api/auth/login returns 401 for invalid credentials
  V-004: GET /dashboard renders without error when authenticated
  V-005: Dashboard displays data fetched from /api/dashboard endpoint
  V-006: Unauthenticated access to /dashboard redirects to login
```

Assertions are the unit of work for teammates. Each gets a verdict: PASS, FAIL, or BLOCKED.

---

## Execution Model

```
PREFLIGHT -> RUN COUNTER CHECK -> DECOMPOSE PROMISE -> PHASE LOOP -> VERDICT -> COMPLETE/RERUN

Stage Cycle (per assertion group):
  PROBE -> [FIX -> RE-PROBE] -> VERDICT

Not the implement-trd cycle. No SIMPLIFY, no REVIEW.
Focus is: does it work? If not, fix it until it does.
```

**Strategy:** Not applicable — this is verification, not implementation.

---

## Step 1: Preflight

Execute `/implement-trd` Steps 1.1-1.3 (Load Constitution, TRD Selection, Git Branch).

**Skip:** Strategy Detection (1.4) — not applicable.

**Additional:**

1. **Load PRD:** Read the PRD linked from TRD Section 10 (Reference Documents) or
   `.trd-state/current.json` `prd` field. The PRD defines user-facing outcomes that
   the promise ultimately traces back to.

2. **Implementation existence check:** Same as `/harden-trd-team` — verify code exists
   by checking files, not just state. Trust code over state file.

3. **Environment check:** Determine what's needed for live verification:
   - Can the application be started locally? (look for start scripts, docker-compose, etc.)
   - Are there API endpoints to test? (look for route definitions)
   - Is there a UI to test? (look for frontend entry points)
   - Are there third-party services? (look for API keys, SDK imports — test read-only only)

4. **Emit the `/goal` invocation:** Print the ready-to-paste `claude -p "/goal …"` line from
   the "Autonomous alternative" section above, with `<trd-name>` and `<trd-path>` resolved to
   the selected TRD, so the user can opt into single-session `/goal`-driven verification.

---

## Step 2: Run Counter Check

Read `.trd-state/<trd-name>/verify.json`. Check `run_counter`:

```
If run_counter >= 3:
  ===============================================================================
                    VERIFICATION HALTED — MAX RUNS REACHED
  ===============================================================================

  This TRD has been through {run_counter} verification runs without fully
  satisfying the completion promise.

  Unsatisfied assertions:
  {list of FAIL/BLOCKED assertions from last run}

  To continue:
  1. Debug manually and fix the remaining issues
  2. Run: /verify-trd-team --reset-state
     This resets the run counter and clears all verification state.
     You may provide a new --promise to narrow scope.

  ===============================================================================

  STOP. Do not proceed.
```

If `run_counter < 3`: Increment `run_counter`, record `run_started_at`, proceed.

If no state file exists: Create with `run_counter: 1`.

If `--reset-state`: Confirm, then delete `verify.json` and start fresh with `run_counter: 1`.

---

## Step 3: Decompose Promise into Assertions

### 3.1 Read TRD + PRD

Read the full TRD Master Task List and the PRD user stories / acceptance criteria.
Understand the feature from the user's perspective.

### 3.2 Generate Assertions

For each TRD task (or group of related tasks), generate verifiable assertions that
would confirm the promise is met for that area. Assertions should be:

- **Observable** — can be confirmed by running something and checking output
- **Specific** — exact endpoint, exact UI element, exact behavior
- **Independent** — each can be verified without the others (where possible)
- **Traceable** — maps back to TRD task IDs and PRD acceptance criteria

Store assertions in verify state file.

### 3.3 Carry Forward Prior Run State

If this is run 2 or 3, load assertions from prior run:
- Assertions that were PASS last run: re-verify (regressions happen during fixes)
- Assertions that were FAIL last run: prioritize — these are the reason we're re-running
- New assertions may be added if prior runs revealed gaps

### 3.4 Group Assertions for Parallel Execution

Group assertions by the TRD execution plan sessions. Assertions that share infrastructure
(same service, same UI flow) go to the same teammate. As with `/implement-trd`, partition
so each parallel group's teammates own a disjoint set of files (the native Agent Teams
safety model); cross-group dependencies are expressed via the shared task list's
`blockedBy`, not via `team_name` — which is accepted but ignored by the platform.

---

## Step 4: Phase Execution with Teams

For each phase (or single phase if `--phase N`), for each parallel group within the phase:

**1. Update state before spawn** -- for each assertion group being assigned, write to
verify.json: `{ "run": run_counter, "teammate_session_id": "{session_name}" }`.

**2. Spawn teammates directly** -- one per session, using the **Agent** tool. No team
creation step is needed: a team forms automatically on the first spawn.
```javascript
Agent({ subagent_type: session_agent, name: session_name, prompt: "[Teammate Prompt - Section 4.1]" });
```
Express phase and group identity as task names plus `blockedBy` dependencies on the shared
task list (`TaskCreate`, then `TaskUpdate({taskId, addBlockedBy: [...]})`) if assertions are
tracked as tasks. Do NOT pass `isolation: "worktree"` — teammates share the working tree.

**2a. Recommended: schedule a safety-net wake-up before ending the turn.** Teammate
`SendMessage` auto-delivery reliably re-invokes the lead (see
`.claude/rules/async-discipline.md`), so this is cheap insurance rather than a known
necessity:
```javascript
ScheduleWakeup({
  delaySeconds: 1200,
  reason: "team-mailbox drain fallback for phase {N} group {G}",
  prompt: "/verify-trd-team [original arguments here]"
});
```

**3. Monitor** -- teammate messages arrive as new lead turns via auto-delivery; the
optional scheduled wake-up from step 2a is a harmless no-op if auto-delivery already fired.
Wait for ALL teammates in the group to complete.

**4. Collect results** -- for each teammate extract per-assertion verdicts, evidence,
fixes applied, and tests written. Update verify.json.

**5. No teardown step is required** -- cleanup is automatic when a teammate's session
exits; there is no team-delete call to make.

### 4.1 Teammate Prompt Template

```xml
<team_session>
  <trd>{trd_path}</trd>
  <prd>{prd_path}</prd>
  <phase>{phase_number}</phase>
  <session>{session_name}</session>
  <mode>verify</mode>
  <run_number>{run_counter} of 3</run_number>
</team_session>

<completion_promise>
{the completion promise text}
</completion_promise>

<assigned_assertions>
  <assertion id="V-{NNN}" task_ids="{TRD task IDs}" prior_verdict="{PASS|FAIL|NEW}">
    {assertion text}
  </assertion>
  ...
</assigned_assertions>

<execution_context>
  <verification_level>{from constitution.md}</verification_level>
  <prior_run_failures>
    <!-- Only present on run 2+ -->
    {failure details from prior run for these assertions}
  </prior_run_failures>
</execution_context>

<non_goals>{from TRD Section 8}</non_goals>

<instructions>
You are performing LIVE VERIFICATION of implemented functionality.

Your job is NOT to check that unit tests pass. Your job is to confirm that the
application actually works — that a user (or API consumer) would get the promised
experience.

For each assigned assertion, execute the PROBE cycle:

1. PROBE: Attempt to verify the assertion through live testing.

   **For API assertions:**
   - Start the service if not running (check for existing process first)
   - Make actual HTTP requests (curl, fetch, or test framework)
   - Verify response status codes, body shapes, and content
   - Test both happy path AND error cases described in the assertion
   - Use Playwright MCP or API test frameworks as appropriate

   **For UI assertions:**
   - Start the application if not running
   - Use Playwright MCP to navigate, interact, and screenshot
   - Verify elements render, interactions work, data displays correctly
   - Check responsive behavior if assertion specifies it

   **For third-party service assertions:**
   - Only perform non-destructive, read-only operations
   - Verify SDK initialization, connection, and read operations
   - Do NOT send real emails, charge cards, or modify external state
   - If destructive testing is required, note as BLOCKED with reason

   **For each assertion, record:**
   - Verdict: PASS, FAIL, or BLOCKED
   - Evidence: actual output, screenshot path, response body (truncated)
   - If FAIL: specific description of what went wrong

2. FIX (if FAIL): If a probe fails, you have authority to fix the code.

   - Diagnose the root cause (read code, check logs, trace the request)
   - If it's a straightforward fix (missing route, wrong query, UI bug):
     Fix it directly. You are authorized to edit application code.
   - If it requires deep debugging: Delegate to @app-debugger
     (subagent_type: "app-debugger") with the failure evidence.
   - After fixing, write or update a test that covers the fix.
   - Max 3 fix attempts per assertion. If still failing, mark FAIL with
     detailed diagnosis and move on.

3. RE-PROBE (after fix): Re-verify the assertion. Also re-verify any
   previously-PASS assertions that touch the same files (regression check).

4. DEVELOP PERSISTENT TESTS: For each PASS assertion, ensure there is a
   durable test (API test, Playwright test, integration test) that will
   catch regressions in CI. If no such test exists, write one.

   - API assertions → API/integration test (supertest, httpx, etc.)
   - UI assertions → Playwright E2E test
   - Store test files in appropriate test directories

When delegating to subagents for debugging, pass the assertion details and
failure evidence. Instruct subagents to invoke matched skills via the Skill tool.

**Third-party service safety rules:**
- NEVER send real emails, SMS, or push notifications
- NEVER charge real payment methods or modify billing
- NEVER write to production external databases
- NEVER delete or modify external resources
- READ-ONLY operations and mock/sandbox endpoints are acceptable
- If a sandbox/test mode is available, use it
- Document any third-party tests as "sandbox-verified" or "connection-verified"

After ALL assertions are evaluated, send completion message to team lead:
  PASS: {count} | FAIL: {count} | BLOCKED: {count} | FIXED: {count}
  [{assertion_id}] {VERDICT} — {one-line evidence summary}

If a previously-PASS assertion regressed during fixes, flag it prominently.
</instructions>
```

### 4.2 Phase Checkpoint

After all parallel groups in a phase complete:

```
Phase {N} verification checkpoint.
Run: {run_counter}/3
Assertions: {pass}/{total} PASS | {fail} FAIL | {blocked} BLOCKED
Fixes applied: {count} | Tests written: {count}
State: .trd-state/<trd-name>/verify.json
Recommendation: Run /compact before Phase {N+1}.

**Decision-trail durability (PreCompact hook).** When `/compact` runs — or auto-compaction
triggers at ~95% — the `precompact.js` hook appends a structured checkpoint to
`.trd-state/<trd-name>/session-log.md` (in-flight assertions, current PROBE/FIX cycle,
`run_counter`, recent verdicts). **After compaction, re-read `session-log.md` first** to
recover the reasoning trail; if you have rationale or open questions from the just-summarized
turns that aren't captured in `verify.json`, append them under the most recent
**Decisions & rationale** section of the log before continuing the verification loop. State
records *what* verified; the log records *why* it was attempted that way.
```

---

## Step 5: Verdict

After all phases complete, evaluate the completion promise:

### 5.1 Assertion Rollup

```
All PASS (including BLOCKED with acceptable justification) -> PROMISE SATISFIED
Any FAIL -> PROMISE NOT SATISFIED
```

**BLOCKED handling:** An assertion is acceptably blocked if:
- It requires destructive third-party operations (by design)
- The service/dependency is unavailable and cannot be started locally
- It requires infrastructure not present in development environment

Unacceptable blocks (count as FAIL):
- Code errors preventing the test from running
- Missing implementation
- Configuration issues that should be fixable

### 5.2 Promise Satisfied

```
===============================================================================
                    VERIFICATION COMPLETE — PROMISE SATISFIED
===============================================================================

TRD: {trd_filename}
Branch: {branch_name}
Run: {run_counter}/3

COMPLETION PROMISE:
{promise text}

ASSERTION RESULTS
-----------------
Total assertions: {N}
  PASS:    {count}
  BLOCKED: {count} (acceptable)

TESTS DEVELOPED
---------------
API tests:        {count} ({file paths})
E2E tests:        {count} ({file paths})
Integration tests: {count} ({file paths})

FIXES APPLIED THIS RUN
----------------------
{list of files changed with one-line descriptions}

COMMITS
-------
{list of commit SHAs with messages}

===============================================================================
```

For Wiggum mode, signal: `<promise>COMPLETE</promise>`

### 5.3 Promise Not Satisfied

```
===============================================================================
                    VERIFICATION INCOMPLETE — RUN {run_counter}/3
===============================================================================

TRD: {trd_filename}
Branch: {branch_name}
Run: {run_counter}/3

COMPLETION PROMISE:
{promise text}

ASSERTION RESULTS
-----------------
Total assertions: {N}
  PASS:    {count}
  FAIL:    {count}
  BLOCKED: {count}

FAILED ASSERTIONS
-----------------
{For each FAIL:}
  [{assertion_id}] {assertion text}
    Mapped to: {TRD task IDs}
    Evidence: {failure description}
    Fix attempts: {count}/3
    Root cause: {diagnosis or "unknown"}

BLOCKED ASSERTIONS (unacceptable)
----------------------------------
{For each unacceptably blocked assertion}

TESTS DEVELOPED
---------------
{same as satisfied report}

FIXES APPLIED THIS RUN
----------------------
{list of files changed}

NEXT STEPS
----------
{If run_counter < 3:}
  Re-run: /verify-trd-team --resume
  The next run will prioritize failed assertions.
  {run_counter} of 3 maximum runs used.

{If run_counter >= 3:}
  MAX RUNS REACHED. Human intervention required.
  Run: /verify-trd-team --reset-state
  to reset counter after manual debugging.

COMMITS
-------
{list of commit SHAs with messages}

===============================================================================
```

---

## Step 6: Pause for User

Same as `/implement-trd` Step 8, adapted for verification context:

```
OPTIONS:
1. "fix <guidance>" - Provide specific guidance for a failed assertion
2. "skip <assertion_id>" - Accept this assertion as blocked
3. "retry" - Re-probe failed assertions
4. "abort" - Stop and save state
5. "rerun" - Start next verification run (if counter allows)
```

---

## State Schema

Stored at `.trd-state/<trd-name>/verify.json`:

```json
{
  "version": "1.0.0",
  "mode": "verify",
  "trd_file": "docs/TRD/<feature>.md",
  "prd_file": "docs/PRD/<feature>.md",
  "trd_hash": "<sha256>",
  "branch": "<branch-name>",
  "completion_promise": "<promise text>",
  "run_counter": 1,
  "max_runs": 3,
  "runs": [
    {
      "run_number": 1,
      "started_at": "ISO8601",
      "completed_at": "ISO8601 or null",
      "verdict": "satisfied|not_satisfied|interrupted",
      "assertions_pass": 0,
      "assertions_fail": 0,
      "assertions_blocked": 0,
      "fixes_applied": 0,
      "tests_written": 0
    }
  ],
  "phase_cursor": 1,
  "assertions": {
    "V-001": {
      "text": "Assertion description",
      "task_ids": ["AUTH-B001", "AUTH-B002"],
      "verdict": "pass|fail|blocked|pending",
      "evidence": "Description of evidence or null",
      "fix_attempts": 0,
      "max_fix_attempts": 3,
      "tests_created": ["path/to/test.spec.ts"],
      "history": [
        {
          "run": 1,
          "verdict": "fail",
          "evidence": "...",
          "fix_applied": "description or null"
        }
      ]
    }
  },
  "checkpoints": [],
  "recovery": {
    "last_healthy_checkpoint": null,
    "last_checkpoint_timestamp": null,
    "interrupted": false,
    "interrupt_reason": null
  },
  "metrics": {
    "total_assertions": 0,
    "total_fixes": 0,
    "total_tests_written": 0,
    "total_regressions": 0
  }
}
```

---

## Error Handling

All `/implement-trd` error handling applies, plus team-specific cases (teammate fails to
spawn -> retry once, then run sequentially as lead; teammate silent 30+ min -> send
message, mark stalled if no response; file conflict between teammates -> pause later
teammate, wait for first to commit, resume). Verification-specific additions:

| Error | Response |
|-------|----------|
| Application won't start | BLOCK all assertions for that service; report startup error |
| Port already in use | Attempt to find/kill stale process; if user process, ask |
| Third-party service unavailable | Mark dependent assertions BLOCKED (acceptable) |
| Playwright MCP unavailable | Fall back to API-only testing; mark UI assertions BLOCKED |
| Run counter exceeded | HALT — do not proceed, require --reset-state |
| Fix introduced regression | Revert fix, mark assertion FAIL, try alternative approach |
| Database not seeded | Attempt to run seed/migration scripts; if missing, report |

---

## Compatibility

- Requires implementation to exist (code check, not state check)
- State file (`verify.json`) is independent from `implement.json` and `harden.json`
- Workflow: `/implement-trd` → `/harden-trd-team` (optional) → `/verify-trd-team`
- Can be re-run up to 3 times before requiring manual reset
- Custom promises can be set per run via `--reset-state` + `--promise`
- Same branch as implementation — no separate PR
- Requires Claude Code Agent Teams feature (experimental); falls back to sequential
  `/implement-trd`-style execution if Teams unavailable or TRD lacks a parallelization map

---

# Appendix V: Verification Templates

## V.1 Template: PROBE

```xml
<probe_request>
  <assertion id="{assertion_id}" task_ids="{TRD task IDs}">
    {assertion text}
  </assertion>
  <prior_verdict>{PASS|FAIL|BLOCKED|NEW}</prior_verdict>
  <prior_evidence>{evidence from last run, if any}</prior_evidence>
</probe_request>

<skills>
  <matched>{test framework skills: jest, pytest, writing-playwright-tests, etc.}</matched>
  <instruction>
    Invoke matched skills for test framework patterns when writing durable tests.
  </instruction>
</skills>

<instructions>
Verify this assertion through live testing.

1. Determine the verification method:
   - API endpoint -> make HTTP requests, check responses
   - UI behavior -> use Playwright to navigate and interact
   - Data flow -> trace from input to storage to output
   - Service integration -> read-only probe of external service

2. Execute the probe:
   - Start services if needed (check first, don't duplicate)
   - Perform the verification action
   - Capture evidence (response bodies, screenshots, logs)

3. Record verdict:
   - PASS: assertion holds, evidence confirms it
   - FAIL: assertion does not hold, evidence shows why
   - BLOCKED: cannot verify due to external constraint (explain)

4. If PASS: ensure a durable test exists that will catch regression.
   If no test covers this assertion, write one now.

Deliverables:
- verdict: PASS | FAIL | BLOCKED
- evidence: concrete output (response body, screenshot path, log excerpt)
- test_file: path to durable test (existing or newly created)
- services_started: list of services you started (for cleanup)
</instructions>
```

## V.2 Template: FIX

```xml
<fix_request>
  <assertion id="{assertion_id}">
    {assertion text}
  </assertion>
  <failure_evidence>{evidence from PROBE}</failure_evidence>
  <fix_attempt>{N} of 3</fix_attempt>
  <prior_fixes>{descriptions of prior fix attempts, if any}</prior_fixes>
</fix_request>

<skills>
  <matched>{implementation skills matching the code area}</matched>
  <instruction>
    Invoke matched skills for framework-specific fix patterns.
  </instruction>
</skills>

<instructions>
The live verification probe failed. Fix the underlying issue.

1. Diagnose: Read the failing code, check logs, trace the execution path.
   The evidence from the probe should point you to the area.

2. Fix: Make the minimal change to make the assertion pass.
   - Do NOT refactor unrelated code
   - Do NOT change test expectations to match broken behavior
   - If the fix requires changing multiple files, that's fine — but
     each change must be justified by the assertion failure

3. Test: Write or update a test that covers this specific fix.

4. Verify: Confirm the fix addresses the failure. Also check that
   no other assertions in this session regressed.

If this is attempt 2+, review prior fix attempts to avoid repeating
the same approach. If the root cause is unclear, delegate to
@app-debugger (subagent_type: "app-debugger") for deep analysis.

Deliverables:
- files_changed: list of modified files
- root_cause: one-line description of what was wrong
- fix_description: what you changed and why
- regression_check: list of other assertions re-verified
- SKILLS_USED: exact skill names invoked
</instructions>
```

---

# Appendix S: Stage Handoff Contract

| Stage | Agent | Returns | Used By |
|-------|-------|---------|---------|
| PROBE | *-implementer / verify-app | verdict, evidence, test_file | FIX (if FAIL) or VERDICT |
| FIX | *-implementer | files_changed, root_cause, fix_description | RE-PROBE |
| RE-PROBE | same as PROBE | verdict, evidence | VERDICT |
| DEBUG | app-debugger | files_fixed, root_cause | RE-PROBE |

**Handoff Rules:**
- PROBE must complete before FIX starts
- After FIX, always RE-PROBE (never assume fix worked)
- RE-PROBE must also check for regressions on other assertions in the same session
- Max 3 fix attempts per assertion — then mark FAIL and move on
- Teammates write durable tests; these survive beyond the verification run


---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /verify-trd-team] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /verify-trd-team] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /verify-trd-team] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /verify-trd-team ═══
   <one-line summary>
   ```

5. **PushNotification ON FINAL TURN ONLY** — this is a long-running command; the user has likely walked away. In the same final turn that emits COMMAND COMPLETE, also call:
   ```javascript
   PushNotification({
     status: "proactive",
     message: "verify-trd-team done: <one-line summary, under 200 chars, leads with what they'd act on>"
   })
   ```
   On `COMMAND STUCK`, send a `PushNotification` whose message states the Reason + Next action (the user needs to come back to unblock). Do NOT send notifications on intermediate Stops, DISPATCHED turns, RESUMED turns, or PHASE boundaries — only the truly-final turn. If the push tool reports "not sent," that's expected; do not retry.

6. **PROGRAMMATIC NOTIFY ON FINAL TURN ONLY** — for orchestration / webhooks / queues / shell pipelines, invoke the user's `NOTIFY_ON_COMPLETE` shell command via Bash on the SAME final turn:
   ```bash
   .claude/hooks/notify-complete.sh "verify-trd-team" "complete" "<one-line summary>"
   ```
   For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"` and use the Reason as the summary. The bracket-guard means it's a no-op when the user hasn't configured it. Same single-fire timing as the PushNotification — only on the truly-final turn.

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /verify-trd-team ═══` with Reason + Next (and the PushNotification above).


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
