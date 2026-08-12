---
name: create-trd-team
description: Create TRD using parallel domain-expert team for comprehensive multi-perspective architecture
version: 1.0.0
category: planning
argument-hint: "[path-to-prd]"
disable-model-invocation: true
---

This command is the **team variant** of `/create-trd`. Instead of delegating to a single
@technical-architect, it spawns parallel domain-expert teammates who each analyze the PRD
from their specialist perspective, then synthesizes their findings into a unified TRD.

The final TRD uses the **exact same structure** as `/create-trd` (see that command for the
full section-by-section specification). This command differs only in *how* the analysis is
performed -- through multi-agent collaboration rather than single-agent generation.

**ULTRATHINK**: This is a complex technical planning task requiring deep analysis of
requirements, architecture decisions, and implementation strategy. Take time to
thoroughly evaluate technical approaches before generating the TRD.

## User Input

```text
$ARGUMENTS
```

If no path provided, resolve from `.trd-state/current.json` field `prd`.
Error if neither available.

---

## Team Composition

You (the lead) operate as **@technical-architect**. Spawn these teammates via the native
team model: one `Agent({subagent_type, name, prompt})` call per teammate — NOT the `Task`
tool, which is reserved for the work-list tools `TaskCreate`/`TaskUpdate`/etc. No setup
step is needed; a team forms automatically the moment the first teammate spawns.

| Teammate | subagent_type | Domain Letter | Focus |
|----------|---------------|---------------|-------|
| backend-arch | backend-implementer | B | API design, data model, service boundaries, database schema |
| frontend-arch | frontend-implementer | F | Component structure, state management, UX flow |
| quality-strategy | verify-app | T | Test plan, verification approach, risk analysis, coverage strategy |
| infra-perspective | devops-engineer | D/I | Deployment, scaling, security architecture |

**Optional teammate**: `infra-perspective` is spawned only when the PRD contains
infrastructure-significant concerns (deployment, scaling, multi-region, security architecture,
or cloud service integrations). Skip for purely application-level features.

---

## Teammate Report Contract

Each teammate MUST return their analysis in this XML structure (include verbatim in briefings):

```xml
<teammate_report perspective="{teammate-name}" domain="{category_letter}">
  <task_proposals>
    <task id="{PREFIX}-{CAT}{SEQ}" live="{true|false}">
      <description>Task description</description>
      <skills>Comma-separated skill names from agent's available skills</skills>
      <dependencies>Comma-separated task IDs or "None"</dependencies>
      <acceptance_criteria>Specific, testable criteria</acceptance_criteria>
    </task>
  </task_proposals>
  <interface_contracts>
    API contracts, component interfaces, data schemas for this domain.
    Use TypeScript interfaces or OpenAPI fragments where applicable.
  </interface_contracts>
  <dependencies>
    Cross-domain dependencies identified from this perspective.
  </dependencies>
  <risk_assessment>
    Domain-specific risks with likelihood and impact ratings.
  </risk_assessment>
  <architecture_recommendations>
    Patterns, technology choices, and design decisions for this domain.
  </architecture_recommendations>
</teammate_report>
```

Teammates propose IDs using the PREFIX and their category letter with three-digit sequences
starting at 001. The lead reassigns final IDs during synthesis to ensure uniqueness.

### Report Delivery (CRITICAL — read this before writing teammate briefings)

In native team mode (`Agent({subagent_type, name, prompt})`), **a teammate's plain text output is NOT
visible to the lead.** The only way a teammate's report reaches the lead is via
`SendMessage`. Teammates that produce the XML as their last assistant turn and then go
idle have NOT delivered — the lead never sees the report. (Per the SendMessage tool docs:
*"Your plain text output is NOT visible to other agents — to communicate, you MUST call
this tool."*)

**Every teammate MUST conclude its turn with a `SendMessage` call** carrying the full
`<teammate_report>…</teammate_report>` XML as the message body:

```javascript
SendMessage({
  to: "team-lead",
  summary: "backend-arch report",   // short label for the lead's inbox
  message: "<teammate_report perspective=\"backend-arch\" domain=\"B\">…</teammate_report>"
})
```

After sending, the teammate goes idle — the lead acks via `SendMessage` or issues the
`shutdown_request`. **Do not output the XML as plain text — it's discarded.**

---

## Phase 1: PRD Analysis (Lead)

Before spawning teammates, the lead performs initial analysis:

1. **Read the PRD** in full. Extract: feature name/scope/goals, non-goals (verbatim for
   TRD Section 8), risks (for Section 7), acceptance criteria, and technology constraints
   (from PRD or `.claude/rules/stack.md`).

2. **Determine Task ID prefix** from the feature name (e.g., AUTH, CHECKOUT, NOTIFY).
   Verify uniqueness against existing TRDs in `docs/TRD/`.

3. **Determine if infra-perspective is needed** based on PRD content.

4. **Prepare teammate briefings** containing: full PRD content, task ID prefix with assigned
   category letter, the report contract XML, domain-specific focus guidance, and the
   project technology stack from `.claude/rules/stack.md`.

---

## Phase 2: Parallel Domain Analysis

Spawn all teammates **simultaneously** using the native team model. Each receives their
briefing and returns a `<teammate_report>` response.

**Step 1 — Spawn each teammate directly** via the **`Agent`** tool. No team-creation step
is needed: a team forms automatically on the first spawn, and `team_name` on the `Agent`
tool is accepted but ignored by the platform, so it is omitted below.
```javascript
Agent({ subagent_type: "backend-implementer",
        name: "backend-arch",     prompt: "[backend briefing]" });
Agent({ subagent_type: "frontend-implementer",
        name: "frontend-arch",    prompt: "[frontend briefing]" });
Agent({ subagent_type: "verify-app",
        name: "quality-strategy", prompt: "[quality briefing]" });
// Conditionally:
Agent({ subagent_type: "devops-engineer",
        name: "infra-perspective", prompt: "[infra briefing]" });
```
Do NOT pass `isolation: "worktree"` — these are read-only analysis teammates; shared tree
is fine and they produce no commits.

**Step 1a — Recommended: schedule a safety-net wake-up before ending the turn.**

Teammate `SendMessage` deliveries reliably auto-re-invoke the lead as new turns (see
`.claude/rules/async-discipline.md`), so the spawn alone satisfies the async-discipline
rule. Pairing it with a `ScheduleWakeup` is cheap insurance, not a requirement:

```javascript
ScheduleWakeup({
  delaySeconds: 1200,
  reason: "team-mailbox drain fallback for trd-domain-analysis",
  prompt: "/create-trd-team [original arguments here]"   // re-enter to drain + synthesize
});
```

If auto-delivery fires (the expected case), the wake just no-ops.

**Step 2 — Collect** all `<teammate_report>` responses as they arrive via `SendMessage`.
No teardown step is required — cleanup is automatic when each teammate's session exits.

**Briefing template** (adapt per teammate):

> You are analyzing a PRD from the **{domain}** perspective for a TRD. Your task ID prefix
> is `{PREFIX}` and your category letter is `{CAT}`.
>
> Produce a structured analysis using the XML report format below. Focus on
> {domain-specific focus areas}. Propose concrete tasks with dependencies and acceptance
> criteria. Identify cross-domain interfaces.
>
> **Skill Discovery:** For each task you propose, populate the `<skills>` element.
> Read your agent's `.claude/agents/{your-agent-name}.md` frontmatter to find
> your `skills:` list. For each skill, check if its description aligns with the
> task's domain. Include matching skill names comma-separated in `<skills>`.
> Leave empty if no clear match.
>
> **PRD Content:** {prd_content}
> **Report Format:** {xml_contract}
>
> **Delivery:** Conclude your turn with `SendMessage({to: "team-lead", summary:
> "{your-perspective-name} report", message: "<teammate_report perspective=
> \"{your-perspective-name}\" domain=\"{CAT}\">…</teammate_report>"})`. Do NOT output the
> XML as plain text — see the **Report Delivery** section. After sending, go idle.

Wait for `SendMessage` deliveries from all teammates before proceeding to Phase 3. A
teammate going idle does NOT mean it delivered — only a received `SendMessage` does. If
a teammate idles without sending, re-prompt them via `SendMessage` with an explicit
instruction to call the tool with their XML report.

---

## Phase 3: Synthesis (Lead as @technical-architect)

With all teammate reports collected, synthesize the final TRD:

### 3.1 Merge Task Proposals

- Collect all `<task>` elements, assign final unique IDs: `[PREFIX]-[CAT][SEQ]`
- Renumber sequences per category to eliminate gaps and collisions
- Preserve `<skills>` hints from teammate reports into the TRD Skills column
- Add missing infrastructure/setup tasks (category `P`) the lead identifies
- Ensure every task has explicit dependencies (resolve cross-domain references)

### 3.2 Build Dependency Graph

- Map dependencies across all domains into a unified graph
- Resolve circular dependencies (break cycles with interface contracts)
- Determine the **critical path** and flag parallelizable tasks

### 3.3 Resolve Interface Contracts

- Collect all `<interface_contracts>`, identify overlaps or conflicts
- Resolve conflicts -- prefer contracts satisfying both consumer and provider
- Consolidate into Technical Specifications (TRD Section 3)

### 3.4 Create Execution Plan

- Group tasks into phases based on dependency layers
- Identify parallelizable sessions within each phase
- Assign recommended agents; generate Mermaid gantt diagram

### 3.5 Synthesize Risk Assessment

- Merge all `<risk_assessment>` sections, deduplicate and categorize
- Add cross-domain integration risks; document contingency plans for high-impact risks

### 3.6 Generate Final TRD

Produce the TRD using the **exact structure defined in `/create-trd`**:
Sections 1-10 (Changelog, Overview, System Architecture, Technical Specifications,
Master Task List, Execution Plan, Quality Requirements, Risk Assessment, Non-Goals,
Appendices). See `/create-trd` for full section specifications.

Set **Author** to `@technical-architect (team: backend-arch, frontend-arch, quality-strategy[, infra-perspective])`.

---

## Output Management

### File Location
Save to `docs/TRD/<feature-name>.md`

### State Update
Update `.trd-state/current.json`:
```json
{
  "prd": "docs/PRD/<feature-name>.md",
  "trd": "docs/TRD/<feature-name>.md",
  "status": "trd-created",
  "branch": null
}
```

### Validation Checklist

Before completing, verify:
- [ ] All teammate reports received and incorporated
- [ ] Task ID prefix unique within project
- [ ] All tasks have unique IDs following `[PREFIX]-[CAT][SEQ]` convention
- [ ] Cross-domain dependencies resolved (no dangling references)
- [ ] Interface contracts consistent between producer and consumer
- [ ] At least 3 Mermaid diagrams (architecture, data flow, execution plan)
- [ ] Parallelization opportunities identified in execution plan
- [ ] Non-goals imported verbatim from PRD
- [ ] Risks imported with technical mitigations added
- [ ] Quality strategy reflects quality-strategy teammate recommendations
- [ ] Skills column populated for implementation tasks (P, F, B categories)
- [ ] No timing estimates in execution plan
- [ ] `[LIVE]` markers applied to tasks requiring running service verification

---

## Usage

```
/create-trd-team [path-to-prd]
```

Path is optional if `.trd-state/current.json` has PRD reference.

### Examples

```
/create-trd-team docs/PRD/user-authentication.md
/create-trd-team docs/PRD/checkout-flow.md
/create-trd-team   # Uses current.json
```

### When to use /create-trd-team vs /create-trd

| Scenario | Recommended Command |
|----------|-------------------|
| Simple feature, single domain | `/create-trd` |
| Multi-domain feature (frontend + backend + infra) | `/create-trd-team` |
| Feature with complex integration points | `/create-trd-team` |
| Quick prototype or spike | `/create-trd` |
| Production feature with quality requirements | `/create-trd-team` |

---

## Handoff

After TRD creation:
1. Review TRD with stakeholders
2. Use `/refine-trd` for adjustments if needed
3. Use `/implement-trd` to begin execution


---

## Output discipline (see `.claude/rules/command-status.md`)

This command spans multiple turns. Emit these standard status lines so the user always knows the state:

1. **DISPATCHED** — when a turn ends with subagents/teammates in flight or a wake scheduled:
   ```
   [STATUS: /create-trd-team] DISPATCHED → <count> <kind> in flight: <names>
      waiting on: <observable signal>
      next wake: <ScheduleWakeup ETA | "teammate SendMessage auto-deliver">
   ```

2. **RESUMED** — at the START of each new turn after a wake or teammate message:
   ```
   [STATUS: /create-trd-team] RESUMED → <reason>
      completed since last turn: <summary | "none">
   ```

3. **PHASE N/M COMPLETE** — at each phase boundary (progress marker, NOT completion):
   ```
   [STATUS: /create-trd-team] PHASE <N>/<M> COMPLETE → <summary>
   ```

4. **COMMAND COMPLETE** — as the LAST line of the FINAL turn (only when the whole command is truly done; never at phase boundaries):
   ```
   ═══ COMMAND COMPLETE: /create-trd-team ═══
   <one-line summary>
   ```

5. **PushNotification ON FINAL TURN ONLY** — this is a long-running command; the user has likely walked away. In the same final turn that emits COMMAND COMPLETE, also call:
   ```javascript
   PushNotification({
     status: "proactive",
     message: "create-trd-team done: <one-line summary, under 200 chars, leads with what they'd act on>"
   })
   ```
   On `COMMAND STUCK`, send a `PushNotification` whose message states the Reason + Next action (the user needs to come back to unblock). Do NOT send notifications on intermediate Stops, DISPATCHED turns, RESUMED turns, or PHASE boundaries — only the truly-final turn. If the push tool reports "not sent," that's expected; do not retry.

6. **PROGRAMMATIC NOTIFY ON FINAL TURN ONLY** — for orchestration / webhooks / queues / shell pipelines, invoke the user's `NOTIFY_ON_COMPLETE` shell command via Bash on the SAME final turn:
   ```bash
   .claude/hooks/notify-complete.sh "create-trd-team" "complete" "<one-line summary>"
   ```
   For `COMMAND STUCK`, set `NOTIFY_STATUS="stuck"` and use the Reason as the summary. The bracket-guard means it's a no-op when the user hasn't configured it. Same single-fire timing as the PushNotification — only on the truly-final turn.

Nothing after the COMMAND COMPLETE banner. On unrecoverable failure use `═══ COMMAND STUCK: /create-trd-team ═══` with Reason + Next (and the PushNotification above).


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
