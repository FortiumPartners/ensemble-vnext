---
name: investigate-issue
description: Triage an issue report — reproduce, classify, and produce either a lightweight issue TRD or a spec for /create-prd
argument-hint: "<issue description | URL | screenshot path>"
version: 1.0.0
category: maintenance
---

> **Usage:** `/investigate-issue <issue description or URL>`
>
> **Arguments:**
> - `<issue>` - Free-text issue report, GitHub/Linear/Jira issue URL, or screenshot path
>
> **Examples:**
> - `/investigate-issue The dashboard shows stale data after saving preferences`
> - `/investigate-issue https://linear.app/team/ENG-1234`
> - `/investigate-issue Users see 500 error when submitting empty form on /settings`

This command triages an issue report to determine if it's a quick fix or a feature request,
then produces the appropriate artifact for next steps.

**ULTRATHINK**: Before classifying, thoroughly reproduce the issue and understand root cause.

## User Input

```text
$ARGUMENTS
```

---

## Step 1: Gather Context

### 1.1 Parse Input

Determine input type:
- **Free text** — use as-is
- **Issue URL** — fetch issue details (use `gh`, Jira CLI, or Linear CLI as appropriate)
- **Screenshot path** — read the image for visual context

### 1.2 Understand the Area

1. Read any files referenced in the issue
2. Search the codebase for keywords from the issue description
3. Check recent git history for related changes: `git log --oneline -20 --all -- <likely paths>`
4. If a TRD exists for the area, skim it for context

---

## Step 2: Reproduce

### 2.1 Attempt Reproduction

Based on the issue description:

1. **Identify reproduction steps** — extract or infer from the report
2. **Trace the code path** — read the relevant code, follow the execution flow
3. **Confirm the bug** — one of:
   - Run tests that expose the failure
   - Read code and identify the defect logically
   - Start the app and reproduce (if practical)
   - Check logs/error output

### 2.2 Record Findings

```
Reproduction Status: CONFIRMED | LIKELY | CANNOT_REPRODUCE | NOT_A_BUG
Evidence: <what you found — code reference, test output, logical analysis>
Root Cause: <one-line description, or "investigation needed" if unclear>
Affected Files: <list of files involved>
```

If `CANNOT_REPRODUCE` or `NOT_A_BUG`:
- Report findings to user
- Ask for clarification
- STOP — do not proceed to classification

---

## Step 3: Classify

Determine if this is eligible for the lightweight fix path or needs the full PRD/TRD pipeline.

### 3.1 Eligibility Criteria

**Eligible for /fix-issue** (ALL must be true):
- Change touches **5 or fewer files**
- No new APIs, endpoints, or data models
- No architectural changes
- No user-facing workflow changes (behavior correction is fine)
- Blast radius is **minimal** — the fix is localized, not systemic
- Estimated tasks: **3 or fewer**

**Examples of eligible issues:**
- Bug: wrong status code returned, off-by-one error, null pointer
- Cosmetic: wrong label, missing field that already exists in the data, styling glitch
- Minor: missing input validation on existing endpoint, incorrect error message
- Config: wrong default value, missing environment variable handling

**NOT eligible — redirect to /create-prd:**
- Requires new features, screens, or API endpoints
- Changes user-facing workflows or data models
- Touches 6+ files across multiple domains
- Requires coordination across frontend/backend/infra
- Has moderate-to-high blast radius

### 3.2 Output Based on Classification

**If eligible:**
→ Proceed to Step 4 (Issue TRD)

**If NOT eligible:**
→ Proceed to Step 5 (PRD Spec)

---

## Step 4: Produce Issue TRD

Write a lightweight TRD to `docs/TRD/issues/<issue-id>.md`.

**Issue ID format:** `FIX-<short-descriptor>` (e.g., `FIX-stale-dashboard`, `FIX-empty-form-500`)
If an external issue ID exists (ENG-1234, GH-567), use it instead.

### 4.1 Issue TRD Template

```markdown
# Issue: <title>

| Field | Value |
|-------|-------|
| ID | <issue-id> |
| Type | bug / cosmetic / minor-enhancement |
| Severity | low / medium / high |
| Blast Radius | minimal |
| Source | <issue URL or "reported directly"> |
| Date | <ISO date> |

## Reproduction

### Steps
1. <step>
2. <step>

### Expected Behavior
<what should happen>

### Actual Behavior
<what actually happens>

### Evidence
<code references, error output, screenshots>

## Root Cause Analysis

<description of why the bug exists — code reference with file:line>

## Fix Plan

### Tasks

- [ ] **<issue-id>-001**: <description>
  - Files: <file paths>
  - Approach: <what to change>
  - Risk: <low/none>

- [ ] **<issue-id>-002**: <description> (if needed)
  - Files: <file paths>
  - Approach: <what to change>
  - Risk: <low/none>

### Verification Plan

1. <how to confirm the fix works — specific test or manual check>
2. <regression check — what else to verify didn't break>

## Non-Goals

- <what NOT to fix or refactor in this pass>

## Notes

<any additional context, related issues, follow-up work>
```

### 4.2 Set Up State Tracking

Create `.trd-state/current.json` pointer:
```json
{
  "trd": "docs/TRD/issues/<issue-id>.md",
  "status": ".trd-state/<issue-id>/implement.json",
  "branch": "fix/<issue-id>"
}
```

### 4.3 Create Branch

```bash
git checkout -b fix/<issue-id>
```

### 4.4 Report

```
===============================================================================
                    ISSUE INVESTIGATED
===============================================================================

Issue: <title>
Classification: <type> | Severity: <severity> | Blast Radius: minimal
Root Cause: <one-liner>

Issue TRD: docs/TRD/issues/<issue-id>.md
Branch: fix/<issue-id>
Tasks: <count>

Next step: /fix-issue
===============================================================================
```

---

## Step 5: Produce PRD Spec (Not Eligible)

If the issue is actually a feature request or too large for the lightweight path,
produce a structured spec that can be fed directly into `/create-prd`.

```
===============================================================================
                    ISSUE REQUIRES FULL WORKFLOW
===============================================================================

Issue: <title>
Reason: <why it's not eligible — too many files, new feature needed, etc.>

Root Cause: <one-liner from investigation>
Affected Area: <code area / domain>

SPEC FOR /create-prd:
---------------------
<structured description suitable as input to /create-prd, including:
 - What the user is experiencing
 - What the expected behavior should be
 - Technical context from the investigation
 - Root cause if identified
 - Suggested approach at high level>

Next step: /create-prd <paste the spec above>
===============================================================================
```

---

## Error Handling

| Error | Response |
|-------|----------|
| Issue URL not accessible | Ask user for issue details as text |
| Cannot reproduce | Report findings, ask for clarification |
| Root cause unclear | Document what IS known, proceed with best assessment |
| Classification borderline | Default to eligible — can always escalate during /fix-issue |
| Multiple issues in one report | Split into separate investigations, handle the primary one |


---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /investigate-issue ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /investigate-issue ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "investigate-issue" "complete" "<one-line summary>"
```

For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"`. The bracket-guard makes this a no-op when not configured.


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
