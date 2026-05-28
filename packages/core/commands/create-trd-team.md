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
team model (`TeamCreate` once, then one `Agent({subagent_type, team_name, ...})` per teammate
— NOT the `Task` tool, which is reserved for the work-list tools `TaskCreate`/`TaskUpdate`/etc.):

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

**Step 1 — Create the team:**
```javascript
TeamCreate({ team_name: "trd-domain-analysis",
             description: "Parallel TRD domain-perspective gathering" });
```

**Step 2 — Spawn each teammate** via the **`Agent`** tool with `team_name` set:
```javascript
Agent({ subagent_type: "backend-implementer",  team_name: "trd-domain-analysis",
        name: "backend-arch",     prompt: "[backend briefing]" });
Agent({ subagent_type: "frontend-implementer", team_name: "trd-domain-analysis",
        name: "frontend-arch",    prompt: "[frontend briefing]" });
Agent({ subagent_type: "verify-app",           team_name: "trd-domain-analysis",
        name: "quality-strategy", prompt: "[quality briefing]" });
// Conditionally:
Agent({ subagent_type: "devops-engineer",      team_name: "trd-domain-analysis",
        name: "infra-perspective", prompt: "[infra briefing]" });
```
Do NOT pass `isolation: "worktree"` — these are read-only analysis teammates; shared tree
is fine and they produce no commits.

**Step 3 — Collect & shut down** once all `<teammate_report>` responses are received:
```javascript
for (const teammate of ["backend-arch","frontend-arch","quality-strategy","infra-perspective"])
  SendMessage({ to: teammate, message: { type: "shutdown_request" } });
TeamDelete({});  // only after all members have shut down
```

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
> Return ONLY the `<teammate_report>` XML block.

Collect all reports before proceeding to Phase 3.

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
