---
name: create-prd-team
description: Create comprehensive PRD using parallel team analysis for richer multi-perspective insights
version: 1.0.0
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

Spawn these teammates in parallel using the Task tool. Each teammate is a specialist
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

---

## Phase 1: Parallel Analysis

Use the Task tool to spawn all teammates simultaneously. Each receives the full
product description plus their specific focus instructions.

### Teammate: product-research

Spawn with `subagent_type: product-manager`:

> Analyze the following product description from a user research and product strategy
> perspective. Do NOT write a full PRD. Return your findings using the teammate_report
> XML contract.
>
> Focus on:
> - Target user identification and detailed personas
> - User journey mapping (provide Mermaid journey diagram syntax)
> - Feature decomposition with P0/P1/P2 prioritization using RICE or similar framework
> - Acceptance criteria for each identified feature
> - Non-goals that should be explicitly excluded
>
> Product description: {product_description}

### Teammate: tech-feasibility

Spawn with `subagent_type: technical-architect`:

> Analyze the following product description from a technical feasibility perspective.
> Do NOT write a full PRD or TRD. Return your findings using the teammate_report
> XML contract.
>
> Focus on:
> - Solution architecture viability (provide Mermaid graph diagram syntax)
> - Technical constraints and dependencies
> - Integration requirements with external systems
> - Performance, security, and scalability implications
> - Technical risks and complexity assessment
>
> Product description: {product_description}

### Teammate: devils-advocate (optional)

Spawn with `subagent_type: product-manager` only when complexity warrants it:

> You are the devils-advocate for this product analysis. Your job is to challenge
> assumptions, find blind spots, and stress-test the product concept. Do NOT write
> a full PRD. Return your findings using the teammate_report XML contract.
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

Wait for all teammates to return their reports before proceeding to Phase 2.

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
