---
name: fold-prompt
description: Optimize Claude environment through intelligent project analysis and context management
version: 1.0.0
category: project-memory
---

Advanced Claude environment optimization through intelligent project analysis, context
management, and documentation enhancement for maximum productivity gains. Optimizes
CLAUDE.md, README.md, and agent configurations for improved Claude Code performance.

## Workflow

### Phase 1: Intelligent Discovery & Context Mapping

**1. Deep Project Analysis**
   Scan directory structure with pattern recognition

   - Analyze codebase architecture and technology stack
   - Identify documentation gaps
   - Map integration points
   - Detect Claude Code configuration opportunities

**2. Context Intelligence Gathering**
   Extract project context and patterns

   - Extract project goals from existing docs
   - Analyze commit history and development patterns
   - Identify productivity bottlenecks
   - Assess current Claude environment effectiveness

### Phase 2: Strategic Optimization & Enhancement

**1. CLAUDE.md Intelligence Enhancement**
   Optimize for Claude Code context retention

   - Add productivity-focused quick reference sections
   - Implement intelligent memory management strategies
   - Configure output styles and behavior preferences

**2. Multi-Document Consistency Engine**
   Align all documentation

   - Align README.md with enhanced architecture
   - Synchronize all markdown documentation
   - Update agent configurations

### Phase 3: Advanced Integration & Validation

**1. Agent Integration**
   Configure specialized agents for project workflows

**2. Claude Environment Optimization**
   Configure MCP servers and memory management

**3. Quality Assurance & Standards Validation**
   Validate against project standards

## Expected Output

**Format:** Optimized Claude Configuration

**Structure:**
- **CLAUDE.md**: Optimized with intelligent context management
- **README.md**: Aligned with current status and enhanced with productivity metrics
- **Agent Configurations**: Project-specific optimizations for specialized agents

## Usage

```
/fold-prompt
```


---

## Output discipline (see `.claude/rules/command-status.md`)

**End your final turn with the banner — last line of output, nothing after it:**

```
═══ COMMAND COMPLETE: /fold-prompt ═══
<one-line summary of what was produced>
```

On unrecoverable failure, use `═══ COMMAND STUCK: /fold-prompt ═══` followed by `Reason:` and `Next:` lines.

**Programmatic completion notify** — on the same final turn, invoke the user's `NOTIFY_ON_COMPLETE` shell command (if set) for webhook/queue/shell-pipeline integration:

```bash
.claude/hooks/notify-complete.sh "fold-prompt" "complete" "<one-line summary>"
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
- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- "Given the previous step went cleanly, do you want me to pause and review?" → self-defeating: you just acknowledged there's nothing to address. PROCEED.

### Autonomy is the default, not a mode

The COMMAND COMPLETE banner is the first and only return of control. A STUCK condition after
retry exhaustion is the one thing that stops a run early. Everything in the table above is
forbidden unconditionally — there is no flag that turns this on, and none that turns it off.
