# Ensemble vNext Agent Oversight Guide

A comprehensive guide for overseeing AI-augmented development workflows.

---

## Part 1: Initialization Status Check

### How to Verify a Directory is Properly Initialized

Check for these required components in sequential order. All must be present for a valid installation.

#### Quick Check (Essential Files)

```bash
# All 5 of these must exist:
ls -la .claude/settings.json
ls -la .claude/router-rules.json
ls -la .trd-state/current.json
ls -la CLAUDE.md
ls -la .claude/rules/constitution.md
```

#### Full Validation Checklist

| Component | Path | Expected Count | Validation |
|-----------|------|----------------|------------|
| Agents | `.claude/agents/*.md` | 12 files | product-manager, technical-architect, spec-planner, frontend-implementer, backend-implementer, mobile-implementer, verify-app, code-simplifier, code-reviewer, app-debugger, devops-engineer, cicd-specialist |
| Commands | `.claude/commands/*.md` | 8 files | create-prd, refine-prd, create-trd, refine-trd, implement-trd, fold-prompt, update-project, cleanup-project |
| Rules | `.claude/rules/*.md` | 3 files | constitution.md, stack.md, process.md |
| Hooks | `.claude/hooks/` | 6 components | permitter/ (directory with permitter.js + lib/), router.py, formatter.sh, status.js, wiggum.js, learning.sh |
| Skills | `.claude/skills/` | 1+ folders | At least one skill directory based on detected stack |
| Settings | `.claude/settings.json` | Valid JSON | Hook configuration |
| Router Rules | `.claude/router-rules.json` | Valid JSON | Routing patterns |
| State | `.trd-state/current.json` | Valid JSON | Current feature pointer |
| Project Config | `CLAUDE.md` | No placeholders | Must not contain `{{...}}` template markers |

#### Validation Script

```bash
#!/bin/bash
# Save as: validate-ensemble-init.sh

ERRORS=0

echo "Validating Ensemble vNext installation..."

# Check directories exist
for dir in .claude/agents .claude/commands .claude/rules .claude/hooks .claude/skills .trd-state; do
  if [ ! -d "$dir" ]; then
    echo "MISSING: $dir directory"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check agent count
AGENT_COUNT=$(ls -1 .claude/agents/*.md 2>/dev/null | wc -l)
if [ "$AGENT_COUNT" -ne 12 ]; then
  echo "INVALID: Expected 12 agents, found $AGENT_COUNT"
  ERRORS=$((ERRORS + 1))
fi

# Check command count
CMD_COUNT=$(ls -1 .claude/commands/*.md 2>/dev/null | wc -l)
if [ "$CMD_COUNT" -ne 8 ]; then
  echo "INVALID: Expected 8 commands, found $CMD_COUNT"
  ERRORS=$((ERRORS + 1))
fi

# Check essential files
for file in .claude/settings.json .claude/router-rules.json .trd-state/current.json CLAUDE.md; do
  if [ ! -f "$file" ]; then
    echo "MISSING: $file"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check for unresolved placeholders in CLAUDE.md
if grep -q '{{.*}}' CLAUDE.md 2>/dev/null; then
  echo "INCOMPLETE: CLAUDE.md contains unresolved placeholders"
  ERRORS=$((ERRORS + 1))
fi

# Check hooks
for hook in permitter/permitter.js router.py formatter.sh status.js; do
  if [ ! -f ".claude/hooks/$hook" ]; then
    echo "MISSING: .claude/hooks/$hook"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "VALID: Ensemble vNext installation is complete"
  exit 0
else
  echo "FAILED: $ERRORS issues found"
  exit 1
fi
```

---

## Part 2: Initialization Instructions

### Interactive Mode (Default)

```
/init-project
```

This will:
1. Analyze the project structure and detect tech stack
2. Ask questions about project identity, methodology, quality gates, and approval requirements
3. Deploy all components with customization based on answers
4. Generate project-specific routing rules

### Non-Interactive Mode (Minimal Prompts)

```
/init-project minimal
```

This uses detected defaults without prompting. Suitable for:
- CI/CD environments
- Scripted setup
- When defaults are acceptable

### Force Mode (Overwrite Existing)

```
/init-project force
```

This overwrites all existing `.claude/` content without prompting for migration options. Suitable for:
- Reinstalling from scratch
- Upgrading to new plugin version
- Fixing corrupted installations

### Combined Non-Interactive + Force

For fully automated initialization that overwrites without any prompts:

```
/init-project minimal force
```

Or via CLI with prompt argument:

```bash
claude -p "/init-project minimal force" --dangerously-skip-permissions
```

### Headless Testing Context

When testing initialization in CI or scripts:

```bash
# With local plugin development
PLUGIN_DIR="/path/to/ensemble-vnext/packages/full"
echo "/init-project minimal force" | claude --print \
    --plugin-dir "$PLUGIN_DIR" \
    --setting-sources project \
    --dangerously-skip-permissions
```

---

## Part 3: Development Workflow Loop

### Overview

The workflow follows this cycle:

```
Specification → PRD → TRD → Implementation → Verification → Fold → Next Cycle
```

### Detailed Workflow Steps

#### Step 1: Create PRD from Specification

**Command:** `/create-prd <specification>`

**Input Requirements:**
- Be as verbose and detailed as possible with the initial specification
- Include user stories, acceptance criteria, edge cases
- Describe the "why" not just the "what"
- Reference existing patterns in the codebase if applicable

**Example:**
```
/create-prd We need a user authentication system that supports:
- Email/password login with secure password hashing
- OAuth2 integration with Google and GitHub
- JWT tokens with refresh token rotation
- Rate limiting on login attempts (5 per minute)
- Password reset via email with expiring tokens

User stories:
1. As a new user, I can register with email/password
2. As a returning user, I can login with saved credentials
3. As a security-conscious user, I can link OAuth providers
4. As a forgetful user, I can reset my password via email

Edge cases:
- Handle duplicate email registration attempts gracefully
- Support case-insensitive email matching
- Prevent timing attacks on login validation
```

**Output:** `docs/PRD/<feature>.md`

**Delegation:** Uses `product-manager` subagent with extended thinking

#### Step 2: Review and Refine PRD

**Manual Review Checklist:**
- [ ] All user stories are complete and testable
- [ ] Acceptance criteria are specific and measurable
- [ ] Edge cases are addressed
- [ ] Non-functional requirements are specified (performance, security)
- [ ] Dependencies and constraints are documented

**If Changes Needed:**
```
/refine-prd <feedback>
```

Or with explicit PRD path:
```
/refine-prd docs/PRD/user-auth.md "Add rate limiting details and clarify OAuth flow"
```

**Iterate until PRD is approved.** The PRD quality directly determines implementation quality.

#### Step 3: Create TRD from PRD

**Command:** `/create-trd`

Uses the current PRD from `.trd-state/current.json`, or specify explicitly:
```
/create-trd docs/PRD/user-auth.md
```

**Output:** `docs/TRD/<feature>.md` containing:
- Technical architecture decisions
- Master task list (TRD-XXX format)
- Execution plan with phases and work sessions
- Quality requirements and testing strategy

**Delegation:** Uses `technical-architect` subagent with extended thinking

#### Step 4: Review and Refine TRD

**Technical Review Checklist:**
- [ ] Architecture decisions are justified
- [ ] Task breakdown is granular enough (4-8 hours per task)
- [ ] Dependencies between tasks are mapped
- [ ] Testing strategy is comprehensive
- [ ] Security considerations are addressed
- [ ] Performance implications are documented

**If Changes Needed:**
```
/refine-trd <technical feedback>
```

**Iterate until TRD is approved.** Poor task breakdown leads to implementation delays.

#### Step 5: Implement TRD

**Command:** `/implement-trd`

**Options:**
| Flag | Purpose |
|------|---------|
| `--phase N` | Execute only phase N from the TRD |
| `--session <name>` | Execute only a specific work session |
| `--wiggum` | Autonomous mode (minimal human intervention) |
| `--resume` or `--continue` | Resume from last checkpoint |

**Staged Execution Loop:**

```
IMPLEMENT → VERIFY → [DEBUG if fail] → SIMPLIFY → VERIFY → REVIEW → UPDATE → COMPLETE
```

For each task:

1. **IMPLEMENT**: Appropriate specialist executes the task
   - `frontend-implementer` for UI/components
   - `backend-implementer` for APIs/services
   - `mobile-implementer` for mobile apps
   - `devops-engineer` for infrastructure
   - `cicd-specialist` for pipelines

2. **VERIFY**: `verify-app` runs tests
   - Unit tests execute
   - Coverage is measured
   - Integration tests run if applicable

3. **DEBUG** (if verification fails):
   - `app-debugger` investigates failures
   - Maximum 3 retry attempts
   - Uses 5 Whys analysis and trace investigation

4. **SIMPLIFY**: `code-simplifier` refactors
   - Post-verification cleanup
   - Removes complexity
   - Applies DRY principles

5. **REVIEW**: `code-reviewer` validates
   - Security review (OWASP Top 10)
   - Quality gate verification
   - Definition of Done checklist

6. **UPDATE**: State tracking updated
   - `.trd-state/<feature>/implement.json` records progress
   - Checkpoints are created
   - Coverage metrics logged

**Strategy-Aware Implementation:**

The implementation adapts to the detected strategy:
- **TDD**: Tests written before implementation
- **Characterization**: Tests added to existing code without changes
- **Test-After**: Implementation first, tests follow
- **Bug-Fix**: Focus on regression tests
- **Refactor**: Maintain existing test coverage
- **Flexible**: Trust developer judgment

#### Step 6: Manual Verification Phase

**After implementation completes:**

1. **Functional Testing**
   - Exercise the implemented feature manually
   - Test edge cases documented in PRD
   - Verify acceptance criteria are met

2. **UI/UX Verification** (if applicable)
   - Visual inspection of interfaces
   - Accessibility testing
   - Responsive design validation

3. **Integration Testing**
   - End-to-end flows work correctly
   - External dependencies respond as expected
   - Error states are handled gracefully

4. **Performance Validation**
   - Response times are acceptable
   - Resource usage is within bounds
   - No memory leaks or connection issues

**Document any issues found and loop back to Step 5 with `/implement-trd --resume`**

#### Step 7: Context Fold

**Command:** `/fold-prompt`

**When to Use:**
- After completing a feature or phase
- When context window approaches 50-60% usage
- Before starting a new major task
- At natural break points in development

**What It Does:**
- Captures essential context from current session
- Creates optimized summary for continuation
- Preserves key decisions and state
- Prepares for fresh context in next session

**Post-Fold Actions:**
1. Review the fold summary for accuracy
2. Start a new session if needed
3. Continue with next feature or phase

---

## Part 4: Quality Gates

### Before Completing Any Implementation

| Gate | Threshold | Verification |
|------|-----------|--------------|
| Unit Test Coverage | ≥ 60% (Standard) or ≥ 80% (High) | Run coverage report |
| Integration Coverage | ≥ 50% (Standard) or ≥ 70% (High) | Run integration tests |
| Security Review | Pass | No OWASP Top 10 violations |
| Input Validation | Present | All user inputs validated |
| No Secrets | Pass | No hardcoded credentials |
| Documentation | Updated | README/API docs current |

### Escalation Triggers

Notify human oversight when:
- More than 3 debug retries fail
- Security vulnerabilities detected
- Architecture deviations required
- Test coverage cannot meet thresholds
- External dependencies are unavailable

---

## Part 5: State Management

### Current Feature Pointer

**File:** `.trd-state/current.json`

```json
{
  "prd": "docs/PRD/<feature>.md",
  "trd": "docs/TRD/<feature>.md",
  "status": ".trd-state/<feature>/implement.json",
  "branch": "<branch-name>"
}
```

Commands use this to know what feature is active without explicit paths.

### Implementation Status

**File:** `.trd-state/<feature>/implement.json`

Tracks:
- Task status (pending, in_progress, success, failed)
- Current cycle position (implement, verify, simplify, review, complete)
- Checkpoints for recovery
- Coverage metrics
- Recovery information

---

## Part 6: Weakness Awareness

### Known Limitations

1. **Live/UI Verification Gap**
   - Framework cannot perform visual UI testing automatically
   - Manual verification required for styling, animations, responsiveness
   - Accessibility testing needs human review

2. **Specification Quality Dependency**
   - Output quality directly proportional to input specification quality
   - Vague specs lead to vague implementations
   - Missing edge cases in PRD = missing handling in code

3. **Non-Deterministic Outputs**
   - LLM responses vary between runs
   - Same prompt may produce different (but valid) code
   - Manual review required for critical paths

4. **Context Window Limits**
   - Long sessions may lose early context
   - Use `/fold-prompt` proactively at 50-60% context usage
   - Complex features may require multiple sessions

### Mitigation Strategies

- **For UI gaps**: Include explicit manual testing checklist in TRD
- **For spec quality**: Use comprehensive PRD templates, iterate with `/refine-prd`
- **For non-determinism**: Run tests after every change, review diffs
- **For context limits**: Fold early, fold often

---

## Part 7: Strength Utilization

### When This Framework Excels

1. **Complex Tasks** (+27.8% improvement per eval report)
   - Multi-file implementations
   - Cross-cutting concerns
   - System-level features

2. **Well-Specified Work**
   - Clear acceptance criteria
   - Defined edge cases
   - Explicit quality requirements

3. **Staged Workflows**
   - PRD → TRD → Implementation flow
   - Built-in verification loops
   - Automatic quality gates

4. **Parallel Execution**
   - Independent tasks can run concurrently
   - Specialist agents work simultaneously
   - Phase-based parallelization in TRD

### Maximizing Value

- Invest time in PRD quality upfront
- Use TRD task breakdown for clear scope
- Trust the staged execution loop
- Let specialists handle their domains
- Use `/fold-prompt` to maintain context quality

---

## Quick Reference: Command Summary

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/init-project` | Initialize ensemble runtime | First time setup |
| `/create-prd` | Generate PRD | New feature/story |
| `/refine-prd` | Iterate on PRD | After review feedback |
| `/create-trd` | Generate TRD from PRD | After PRD approval |
| `/refine-trd` | Iterate on TRD | After technical review |
| `/implement-trd` | Execute implementation | After TRD approval |
| `/fold-prompt` | Optimize context | End of cycle or 50-60% context |
| `/update-project` | Capture learnings | After significant work |
| `/cleanup-project` | Prune artifacts | Periodic maintenance |

---

*This guide is designed for autonomous agent oversight. Follow the workflow sequentially, validate each step, and escalate when quality gates fail.*
