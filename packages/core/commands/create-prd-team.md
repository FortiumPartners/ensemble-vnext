---
name: create-prd-team
description: Create comprehensive PRD using parallel team analysis for richer multi-perspective insights
version: 1.0.0
category: planning
argument-hint: "[product-description-or-issue-ref]"
disable-model-invocation: true
---

Team variant of `/create-prd` that spawns parallel teammates to analyze the product
from multiple perspectives before synthesizing into a single PRD. The final document
is structurally identical to `/create-prd` output but benefits from cross-perspective
analysis, contested assumptions, and deeper risk identification.

**ULTRATHINK**: This is a complex document creation task requiring deep analysis of
user needs, business requirements, and acceptance criteria. Take time to thoroughly
analyze before generating content.

## User Input

```text
$ARGUMENTS
```

If no arguments provided, conduct a user interview to gather product description.
Once you have the product description, proceed with team orchestration below.

---

## Team Composition

Spawn these teammates in parallel using the native team model (`TeamCreate` once, then
one `Agent({subagent_type, team_name, ...})` per teammate). Each teammate is a specialist
perspective contributing structured findings -- NOT a full PRD.

| Teammate | subagent_type | Focus |
|----------|---------------|-------|
| product-research | product-manager | User research, personas, journey mapping, feature prioritization, acceptance criteria |
| tech-feasibility | technical-architect | Technical feasibility, constraints, integration challenges, performance/security implications |
| devils-advocate | product-manager | **Optional** -- spawn only for complex or high-risk products. Challenge assumptions, stress-test non-goals, identify blind spots, question priority assignments |

**When to spawn devils-advocate**: Products involving new architecture, multiple integration points, ambiguous scope, or high business impact. Skip for straightforward features or well-understood problem domains.

---

## Teammate Report Contract

Each teammate MUST return findings in this exact structure:

```xml
<teammate_report perspective="{teammate-name}">
  <findings>
    Key observations, analysis results, and structured data relevant to this perspective.
    Use markdown tables and lists for structured content.
  </findings>
  <recommendations>
    Specific actionable recommendations for the final PRD.
    Include priority suggestions (P0/P1/P2) where applicable.
  </recommendations>
  <risks_identified>
    Risks discovered from this perspective with likelihood/impact assessment.
  </risks_identified>
  <disagreements>
    Areas where this perspective conflicts with likely assumptions or other perspectives.
    Leave empty if none.
  </disagreements>
</teammate_report>
```

### Report Delivery (CRITICAL — read this before writing teammate prompts)

In native team mode (`Agent({team_name, ...})`), **a teammate's plain text output is NOT
visible to the lead.** The only way a teammate's findings reach the lead is via
`SendMessage`. Teammates that produce the XML as their last assistant turn and then go
idle have NOT delivered — the lead never sees the report. (Confirmed in the SendMessage
tool docs: *"Your plain text output is NOT visible to other agents — to communicate, you
MUST call this tool."*)

**Every teammate MUST conclude its turn with a `SendMessage` call** carrying the full
`<teammate_report>…</teammate_report>` XML as the message body:

```javascript
SendMessage({
  to: "team-lead",
  summary: "product-research report",   // short label for the lead's inbox
  message: "<teammate_report perspective=\"product-research\">…</teammate_report>"
})
```

After sending, the teammate goes idle — the lead acks via `SendMessage` or issues the
`shutdown_request`. **Do not output the XML as plain text — it's discarded.**

---

## Phase 1: Parallel Analysis

Spawn all teammates simultaneously using the native team model. Each receives the full
product description plus their specific focus instructions.

**Step 1 — Create the team:**
```javascript
TeamCreate({ team_name: "prd-analysis",
             description: "Parallel PRD perspective gathering" });
```

**Step 2 — Spawn each teammate** via the **`Agent`** tool with `team_name` set (NOT the
`Task` tool — that's reserved for the work-list tools `TaskCreate`/`TaskUpdate`/etc.):
```javascript
Agent({ subagent_type: "product-manager", team_name: "prd-analysis",
        name: "product-research", prompt: "[teammate prompt below]" });
Agent({ subagent_type: "technical-architect", team_name: "prd-analysis",
        name: "tech-feasibility", prompt: "[teammate prompt below]" });
// Optionally:
Agent({ subagent_type: "product-manager", team_name: "prd-analysis",
        name: "devils-advocate", prompt: "[teammate prompt below]" });
```
Do NOT pass `isolation: "worktree"` — these are read-only analysis teammates; shared tree
is fine and they produce no commits.

**Step 2a — MANDATORY: schedule the safety-net wake-up before ending the turn.**

`Agent({team_name})` does NOT reliably auto-re-invoke the lead when teammates SendMessage
back; messages may queue until the next user prompt. Pair every team spawn with a
`ScheduleWakeup` as the explicit re-invocation belt:

```javascript
ScheduleWakeup({
  delaySeconds: 1200,
  reason: "team-mailbox drain fallback for prd-analysis",
  prompt: "/create-prd-team [original arguments here]"   // re-enter to drain + synthesize
});
```

If auto-delivery DOES fire, the scheduled wake just no-ops (the lead resumes, sees all
reports already collected, proceeds to Phase 2). If it stalls, the wake catches it.
This is required by `.claude/rules/async-discipline.md` Prohibited Pattern #6 —
`Agent({team_name})` alone is not one of the four legitimate async primitives.

**Step 3 — Collect & shut down** once all teammate reports are received via `SendMessage`:
```javascript
for (const teammate of ["product-research", "tech-feasibility", "devils-advocate"])
  SendMessage({ to: teammate, message: { type: "shutdown_request" } });
TeamDelete({});  // only after all members have shut down
```

### Teammate: product-research

Spawn with `subagent_type: product-manager`:

> Analyze the following product description from a user research and product strategy
> perspective. Do NOT write a full PRD. Deliver your findings as ONE `<teammate_report>`
> XML payload sent to the lead via `SendMessage({to: "team-lead", summary:
> "product-research report", message: "<teammate_report perspective=\"product-research\">…"})`.
> Do NOT output the XML as plain text — see the **Report Delivery** section.
>
> Focus on:
> - Target user identification and detailed personas
> - User journey mapping (provide Mermaid journey diagram syntax)
> - Feature decomposition with P0/P1/P2 prioritization using RICE or similar framework
> - Acceptance criteria for each identified feature
> - Non-goals that should be explicitly excluded
>
> Product description: {product_description}
>
> Conclude your turn with the `SendMessage` call — then go idle.

### Teammate: tech-feasibility

Spawn with `subagent_type: technical-architect`:

> Analyze the following product description from a technical feasibility perspective.
> Do NOT write a full PRD or TRD. Deliver your findings as ONE `<teammate_report>` XML
> payload sent to the lead via `SendMessage({to: "team-lead", summary: "tech-feasibility
> report", message: "<teammate_report perspective=\"tech-feasibility\">…"})`. Do NOT
> output the XML as plain text — see the **Report Delivery** section.
>
> Focus on:
> - Solution architecture viability (provide Mermaid graph diagram syntax)
> - Technical constraints and dependencies
> - Integration requirements with external systems
> - Performance, security, and scalability implications
> - Technical risks and complexity assessment
>
> Product description: {product_description}
>
> Conclude your turn with the `SendMessage` call — then go idle.

### Teammate: devils-advocate (optional)

Spawn with `subagent_type: product-manager` only when complexity warrants it:

> You are the devils-advocate for this product analysis. Your job is to challenge
> assumptions, find blind spots, and stress-test the product concept. Do NOT write
> a full PRD. Deliver your findings as ONE `<teammate_report>` XML payload sent to the
> lead via `SendMessage({to: "team-lead", summary: "devils-advocate report", message:
> "<teammate_report perspective=\"devils-advocate\">…"})`. Do NOT output the XML as
> plain text — see the **Report Delivery** section.
>
> Focus on:
> - Assumptions that could be wrong
> - Scope boundaries that are unclear or likely to creep
> - User segments being overlooked
> - Risks the team might underestimate
> - Non-goals that should be goals (or vice versa)
> - Edge cases and failure modes
>
> Product description: {product_description}
>
> Conclude your turn with the `SendMessage` call — then go idle.

Wait for `SendMessage` deliveries from all teammates before proceeding to Phase 2. A
teammate going idle does NOT mean it delivered — only a received `SendMessage` does. If
a teammate idles without sending, re-prompt them via `SendMessage` with an explicit
instruction to call the tool with their XML report.

---

## Phase 2: Synthesis

As the lead agent, synthesize all teammate reports into a final PRD. The PRD MUST
use the **exact same document structure** as `/create-prd` -- all 9 sections:

1. **Changelog** -- standard initial entry
2. **Product Summary** -- merge product-research findings with tech-feasibility architecture diagram
3. **User Analysis** -- primarily from product-research, enriched by devils-advocate challenges
4. **Goals and Non-Goals** -- product-research priorities, stress-tested by devils-advocate
5. **Feature Requirements** -- product-research decomposition, validated by tech-feasibility
6. **Technical Requirements** -- primarily from tech-feasibility
7. **Acceptance Criteria Summary** -- from product-research, cross-checked with tech-feasibility
8. **Risk Assessment** -- consolidated from ALL perspectives; highlight areas of disagreement
9. **Appendices** -- include a "Team Analysis Notes" appendix summarizing key disagreements

### Synthesis Rules

- Where teammates **agree**: state the finding with confidence
- Where teammates **disagree**: present both perspectives in the Risk Assessment section, pick the more conservative recommendation for the main section
- Devils-advocate challenges that are valid: incorporate into Non-Goals or Risks
- Devils-advocate challenges that are rejected: note in Appendix with rationale

### Diagram Requirements

Same as `/create-prd`: minimum 2 Mermaid diagrams (Solution Architecture + User Journey).
Prefer diagrams sourced from teammate reports. No ASCII art.

---

## Output Management

### File Location

Save to `docs/PRD/<feature-name>.md` using lowercase hyphenated names.

### State Update

Update `.trd-state/current.json`:
```json
{
  "prd": "docs/PRD/<feature-name>.md",
  "trd": null,
  "status": "prd-created",
  "branch": null
}
```

### Validation Checklist

Before completing, verify:
- [ ] All 9 required PRD sections present
- [ ] At least 2 Mermaid diagrams included (no ASCII art)
- [ ] All features have acceptance criteria
- [ ] Non-goals are specific and actionable
- [ ] Risks have mitigation strategies
- [ ] Priority labels (P0/P1/P2) assigned to all features
- [ ] All teammate reports were received and incorporated
- [ ] Disagreements between perspectives are documented
- [ ] Output is structurally indistinguishable from `/create-prd` output

---

## Usage

```
/create-prd-team <product description or feature idea>
```

### Examples

```
/create-prd-team User authentication with OAuth2 support and SSO integration
/create-prd-team Real-time collaborative document editor with offline support
/create-prd-team E-commerce marketplace with multi-vendor fulfillment
```

---

## Handoff

After PRD creation:
1. Review with stakeholders (team analysis notes in Appendix aid discussion)
2. Use `/refine-prd` for iterations
3. When approved, use `/create-trd` to generate technical requirements


---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /create-prd-team] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /create-prd-team] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /create-prd-team] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /create-prd-team ═══
   <one-line summary>
   ```

5. **PushNotification ON FINAL TURN ONLY** — this is a long-running command; the user has likely walked away. In the same final turn that emits COMMAND COMPLETE, also call:
   ```javascript
   PushNotification({
     status: "proactive",
     message: "create-prd-team done: <one-line summary, under 200 chars, leads with what they'd act on>"
   })
   ```
   On `COMMAND STUCK`, send a `PushNotification` whose message states the Reason + Next action (the user needs to come back to unblock). Do NOT send notifications on intermediate Stops, DISPATCHED turns, RESUMED turns, or PHASE boundaries — only the truly-final turn. If the push tool reports "not sent," that's expected; do not retry.

6. **PROGRAMMATIC NOTIFY ON FINAL TURN ONLY** — for orchestration / webhooks / queues / shell pipelines, invoke the user's `NOTIFY_ON_COMPLETE` shell command via Bash on the SAME final turn:
   ```bash
   .claude/hooks/notify-complete.sh "create-prd-team" "complete" "<one-line summary>"
   ```
   For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"` and use the Reason as the summary. The bracket-guard means it's a no-op when the user hasn't configured it. Same single-fire timing as the PushNotification — only on the truly-final turn.

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /create-prd-team ═══` with Reason + Next (and the PushNotification above).


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
