# CLAUDE.md - Ensemble vNext Development

## Project Overview

Ensemble vNext is a workflow framework for Claude Code that encodes power-user patterns into a repeatable, accessible system. This project is the plugin development for Ensemble vNext.

**Key Documents:**
- PRD: `docs/PRD/ensemble-vnext.md`
- TRD: `docs/TRD/ensemble-vnext.md`
- Testing TRD: `docs/TRD/testing-phase.md` (v1.4.0 with Phase 5)
- Constitution: `.claude/rules/constitution.md`
- Stack: `.claude/rules/stack.md`

---

## Core Principles

1. **Commands orchestrate, subagents execute** - Commands define workflow, agents do specialized work
2. **Skills and agents are PROMPTS only** - Markdown files interpreted by LLM, not executable code
3. **Commands are prompts with optional shell scripts** - Deterministic parts use scripts, LLM handles the rest
4. **Non-deterministic system** - Most testing is manual; use session logs to verify behavior

---

## Development Workflow

```
/create-prd    --> docs/PRD/<feature>.md
/create-trd    --> docs/TRD/<feature>.md
/implement-trd --> Implementation with .trd-state/ tracking
```

---

## Baseline Reference

**Read-only source**: `Sunstone-Partners/ensemble` (formerly checked out at `~/dev/ensemble`)

That local checkout **no longer exists** as of 2026-08-12. Clone the repo fresh when you need it —
read only, and under NO circumstances modify it. Note its `main` has moved since the original
comparison; treat any conclusion drawn from the old survey as needing re-verification.

Most of the copy-extensively phase is done. The remaining planned use is a close reading for
improvement-plan item 7 (`trd-parser.js`, `trd-graph.js`, `cross-trd-deps.js`) — see the callout in
`docs/modernization/2026-08-improvement-plan.md`.

Key sources for the remaining item-7 reading:
- `trd-parser.js`, `trd-graph.js` — deterministic task-graph construction, and what the parser
  demands of the TRD *format* (a graph is only as deterministic as its input)
- `cross-trd-deps.js` — dependencies *between* TRDs; directly relevant to the open concurrent-TRD
  coordination question
- Whatever mechanism it has for verifying delivered output against acceptance criteria — the weakest
  link in this framework's loop

The earlier "copy exactly" sources are historical: `packages/permitter/` was retired in 4.1.0, and
the agent/skill/command templates have long since been adapted and diverged.

---

## 12 Streamlined Subagents

| Agent | Based On | Purpose |
|-------|----------|---------|
| product-manager | product-management-orchestrator | PRD creation |
| technical-architect | tech-lead-orchestrator | TRD creation |
| spec-planner | (new) | Execution planning |
| frontend-implementer | frontend-developer | UI/client work |
| backend-implementer | backend-developer | API/server work |
| mobile-implementer | mobile-developer | Mobile apps |
| verify-app | (new) | Test execution |
| code-simplifier | (new) | Post-verify refactoring |
| code-reviewer | code-reviewer | Security/quality review |
| app-debugger | deep-debugger | Debug failures |
| devops-engineer | infrastructure-developer | Infrastructure |
| cicd-specialist | deployment-orchestrator | CI/CD pipelines |

---

## Testing Architecture

### Test Framework Stack

| Component | Framework | Location |
|-----------|-----------|----------|
| JavaScript Tests | Jest ^29.0.0 | `packages/*/tests/*.test.js` |
| Python Tests | pytest ^7.0.0 | `packages/router/tests/test_*.py` |
| Shell Tests | BATS ^1.9.0 | `packages/core/**/*.test.sh`, `test/integration/tests/*.test.sh` |
| Eval Specs | YAML | `test/evals/specs/**/*.yaml` |

### Testing Patterns

Given non-deterministic LLM output:

1. **Manual verification** - Primary for LLM-generated content
2. **Session log review** - Confirms correct skill/agent invocation
3. **Deterministic unit tests** - Jest for hooks, BATS for shell scripts
4. **Integration tests** - BATS tests verifying Claude CLI behavior
5. **Eval framework** - A/B testing with statistical analysis

---

## Hooks Reference

### Discipline Hooks (Stop / SubagentStop) — model-judged

Three hooks enforce `.claude/rules/async-discipline.md` and `.claude/rules/autonomy.md`:
`async-discipline.js` and `autonomy-discipline.js` on `Stop`, `subagent-discipline.js` on
`SubagentStop`. As of 2026-08-13 (`docs/TRD/discipline-judgment.md`) all three are
`hookType: "prompt"` in `packages/core/hooks/hooks.manifest.json` — evaluated by the
platform's own model judge (prompt text in `packages/core/hooks/prompts/`) rather than by
regex matching inside the `.js` files. The `.js` files and their pattern-matching code are
retained as the rollback path: setting `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` before running
`generate-hooks-artifacts.sh` regenerates all three as `hookType: "command"`, running that
code exactly as before. See the two rules files above for the full mechanism (loop guard,
escape valves, kill switch) — not duplicated here.

### Notify Hook (Stop)

The notify hook (`.claude/hooks/notify.sh`) fires when a Claude Code session stops and optionally executes a notification command. This enables orchestration patterns where a parent process or external system needs to know when a session has finished.

**Purpose:**
- Notify orchestrating agents when sessions complete
- Trigger webhooks for CI/CD pipelines
- Write signal files for shell script orchestration
- Send messages to queue systems

**Environment Variables (Input):**

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFY_ON_STOP` | (unset) | Command to execute when session stops. If unset, empty, or whitespace-only, the hook exits silently. |
| `NOTIFY_HOOK_DEBUG` | `0` | Set to `1` to enable debug logging to stderr. Sensitive values are masked. |
| `NOTIFY_HOOK_DISABLE` | `0` | Set to `1` to disable the hook entirely. |

**Environment Variables (Output - available to NOTIFY_ON_STOP command):**

| Variable | Description |
|----------|-------------|
| `NOTIFY_SESSION_ID` | Session ID from hook input, or "unknown" if not provided. |
| `NOTIFY_CWD` | Working directory from hook input, or "unknown" if not provided. |
| `NOTIFY_TRANSCRIPT_PATH` | Transcript file path from hook input, or "unknown" if not provided. |

**Usage Examples:**

```bash
# Pattern 1: tmux Notification (notify orchestrating pane)
export NOTIFY_ON_STOP="tmux send-keys -t orchestrator 'echo Session complete' Enter"
claude --remote "Implement feature X"

# Pattern 2: Webhook Notification (trigger CI/CD)
export NOTIFY_ON_STOP="curl -X POST https://webhook.example.com/session-complete"
claude --remote "Run tests"

# Pattern 3: File-based Signal (shell script orchestration)
export NOTIFY_ON_STOP="touch /tmp/session-complete-signal"
claude --remote "Build project"

# Pattern 4: Message Queue (AWS SQS)
export NOTIFY_ON_STOP="aws sqs send-message --queue-url https://sqs... --message-body 'done'"
claude --remote "Deploy to staging"

# Pattern 5: Using session context variables
export NOTIFY_ON_STOP='echo "Session $NOTIFY_SESSION_ID completed in $NOTIFY_CWD" >> /tmp/sessions.log'
claude --remote "Implement feature"

# Pattern 6: OpenClaw integration with session context
export NOTIFY_ON_STOP='openclaw gateway wake --session-id "$NOTIFY_SESSION_ID" --text "Done in $NOTIFY_CWD" --mode now'
claude --remote "Process data"
```

**Behavior:**
- Executes `NOTIFY_ON_STOP` via `/bin/sh -c` with a 30-second command timeout
- Falls back to `openclaw gateway wake` if the primary command fails
- Always exits 0 (non-blocking) to avoid blocking session termination
- Returns `{"continue": true}` to Claude Code

**Testing:**
- Unit tests: `packages/core/hooks/notify.test.sh`
- Run tests: `npx bats packages/core/hooks/notify.test.sh`

**Integration with Other Hooks:**

The notify hook is the last entry in the `Stop` hook array, after the discipline hooks and
`wiggum.js` (`learning.sh`, referenced here in older docs, was retired in 4.1.0 — see
`.claude/rules/constitution.md`'s Architecture Invariants):

```json
"Stop": [
  { "type": "prompt", "prompt": "...", "timeout": 5 },   // async-discipline.js
  { "type": "prompt", "prompt": "...", "timeout": 5 },   // autonomy-discipline.js
  { "type": "command", "command": ".claude/hooks/wiggum.js", "timeout": 10 },
  { "type": "command", "command": ".claude/hooks/notify.sh", "timeout": 60 }
]
```

All four fire on every session stop, independently — see the Discipline Hooks section
above for what the first two actually evaluate. The notify hook sends any configured
notification last.

---

## Eval Framework Usage

The eval framework at `test/evals/framework/` enables A/B testing of skills and agents.

### Spec Hierarchy

**Use `dev-loop/` specs by default.** Other categories serve specific purposes:

| Category | Purpose | When to Use |
|----------|---------|-------------|
| `dev-loop/` | **Primary A/B testing** with 3 variants (baseline, framework, full-workflow) | Default for comprehensive evaluation |
| `skills/` | Skill-specific isolation testing | Narrow skill effectiveness testing |
| `agents/` | Agent routing evaluation | Testing specific agent behaviors |
| `commands/` | Command workflow testing | Testing command implementations |

### Key Components

| File | Purpose | Execution Model |
|------|---------|-----------------|
| `run-eval.js` | YAML spec parsing, session orchestration | Async, parallel |
| `run-session.sh` | Session execution with `--remote` | Async cloud execution |
| `collect-results.sh` | Teleports sessions, extracts artifacts | Post-session |
| `judge.js` | Code evaluation with Claude Opus 4.5 | **Sync local execution** |
| `aggregate.js` | Statistical analysis (Welch's t-test) | Post-judging |
| `schema.js` | YAML spec validation | Validation |

### Important: Judge vs Session Execution

**Session execution** (`run-session.sh`): Supports both local and remote modes
```bash
# LOCAL mode (--local flag): Uses --print, supports all flags
./run-session.sh --local "Build a calculator"

# REMOTE mode (default): Uses --remote, requires git repo pushed to GitHub
# - Uses `script` command to capture TTY output
# - Prompt is argument to --remote (not piped)
# - Does NOT support --dangerously-skip-permissions or --session-id
./run-session.sh "Build a calculator"
```

**Judge execution** (`judge.js`): Runs locally and synchronously with Opus 4.5
```javascript
// Judge evaluates already-collected local artifacts
// No tool use needed - just rubric + code -> score
const CLAUDE_MODEL = 'claude-opus-4-5-20251101';
```

### Eval Spec Format

```yaml
name: skill-eval-name
variants:
  - id: with-skill
    prompt_suffix: "Use developing-with-python skill"
  - id: without-skill
    prompt_suffix: ""
checks:       # Binary pass/fail checks
  - name: file_created
    type: file_exists
    path: "*.py"
metrics:      # Judged metrics (1-5 scale)
  - name: code_quality
    rubric: code-quality  # References test/evals/rubrics/code-quality.md
```

### Running Evals

```bash
# RECOMMENDED: Run dev-loop eval for comprehensive A/B comparison
node test/evals/framework/run-eval.js test/evals/specs/dev-loop/dev-loop-pytest.yaml --local

# For skill-specific isolation testing (narrower scope)
node test/evals/framework/run-eval.js test/evals/specs/skills/pytest.yaml --local

# Collect results after sessions complete
./test/evals/framework/collect-results.sh <session-id> <output-dir>

# Judge collected artifacts
node test/evals/framework/judge.js <session-dir> code-quality

# Generate comparison report
node test/evals/framework/aggregate.js <results-dir>
```

---

## Headless Testing with Claude CLI

**Using Local Plugin (Required for Testing):**
```bash
# Always use --plugin-dir and --setting-sources project for testing
# This ensures tests use the development plugin and project agents are discovered
claude --plugin-dir /path/to/packages/full --setting-sources project <other args>

# The test scripts handle this automatically via PLUGIN_ROOT environment variable
```

**Local Headless Execution (`--print`):**
```bash
# Run a prompt non-interactively with local plugin
PLUGIN_DIR="/home/james/dev/ensemble-vnext/packages/full"
echo "Build a calculator" | claude --print \
    --plugin-dir "$PLUGIN_DIR" \
    --setting-sources project \
    --dangerously-skip-permissions

# With session ID for tracking
SESSION_ID=$(uuidgen)
echo "Create test.py" | claude --print \
    --plugin-dir "$PLUGIN_DIR" \
    --setting-sources project \
    --session-id "$SESSION_ID" \
    --dangerously-skip-permissions

# Sessions persist locally, can be resumed
claude --resume "$SESSION_ID"
```

**Remote Execution (`--remote`):**
```bash
# Run on Claude's cloud infrastructure
# IMPORTANT: Prompt is the ARGUMENT, not piped
claude --remote "Build a calculator"

# Key requirements:
# - Must run from a git repo that is pushed to GitHub
# - Prompt MUST be the argument to --remote (not piped via stdin)
# - Does NOT support --dangerously-skip-permissions
# - Does NOT support --session-id (auto-generated as session_xxx)
# - Does NOT support --plugin-dir or --setting-sources
# - Requires TTY - output redirection breaks it (use `script` command)
# - Runs at repo ROOT, not subdirectory you invoked from
```

**Remote Session Output Capture (for scripts):**
```bash
# Remote requires TTY, so use `script` to capture output
script -q -c 'claude --remote "Build a calculator"' output.txt

# Output contains session URL and teleport command:
# Created remote session: Build calculator app
# View: https://claude.ai/code/session_018oKtL6CSbVA9gNttj41T13?m=0
# Resume with: claude --teleport session_018oKtL6CSbVA9gNttj41T13
```

**Teleporting Web Sessions (`--teleport`):**
```bash
# Retrieve a remote session to local CLI
claude --teleport session_<REMOTE_SESSION_ID>

# Example: Transfer from remote to local
claude --teleport session_018oKtL6CSbVA9gNttj41T13

# Teleport checks out the branch and retrieves session context
# Requires the branch to be pushed to GitHub first
```

**Session ID Formats:**
- Local sessions: UUID format (`ebb01d82-e53e-4ddb-842f-3c77580c426c`)
- Remote/Web sessions: `session_<ID>` format (`session_018oKtL6CSbVA9gNttj41T13`)

### Known Limitations (as of v2.1.7)

- `--remote` requires TTY - cannot redirect stdout directly (use `script`)
- `--remote` runs at repo root, loses subdirectory context
- `--remote` does not support `--dangerously-skip-permissions` or `--session-id`
- `--teleport` requires branch to be pushed to GitHub first
- Remote sessions commit code but NOT session logs
- `/teleport` slash command has known bugs (may not appear)

---

## File Structure Reference

```
.claude/
  agents/        # 12 streamlined subagents
  commands/      # Workflow commands
  hooks/         # Hook executables
  skills/        # Compiled skills
  rules/         # constitution.md, stack.md, process.md
  settings.json  # Committed configuration

docs/
  PRD/           # Product Requirements Documents
  TRD/           # Technical Requirements Documents
  standards/     # Symlinked governance docs
  templates/     # Document templates

packages/
  permitter/     # Permission hook + tests (Jest)
  router/        # Routing hook + tests (pytest)
  core/
    hooks/       # Hook implementations + tests (Jest, BATS)
    scripts/     # Utility scripts + tests (BATS)

test/
  integration/
    scripts/     # Test infrastructure (run-headless.sh, verify-*.sh)
    tests/       # Integration tests (BATS)
    fixtures/    # Sample session data
    config/      # permissive-allowlist.json
  evals/
    framework/   # Eval orchestration (run-eval.js, judge.js, aggregate.js)
    specs/       # YAML eval specifications
      dev-loop/  # PRIMARY: Full dev loop A/B tests (3 variants)
      skills/    # Skill-specific isolation tests
      agents/    # Agent routing tests
      commands/  # Command workflow tests
    rubrics/     # Evaluation rubrics (code-quality.md, test-quality.md, error-handling.md)
    results/     # Eval output (gitignored)

.trd-state/      # Implementation tracking (git-tracked)
```

---

## Security Considerations

### Command Injection Prevention

Use `spawnSync` with array arguments instead of `execSync` with string interpolation:

```javascript
// WRONG: Command injection risk
execSync(`claude --prompt "${userInput}"`);

// CORRECT: Safe argument passing
spawnSync('claude', ['-p', userInput], { encoding: 'utf8' });
```

### Path Traversal Prevention

Validate paths stay within expected directories:

```javascript
const absoluteBase = path.resolve(baseDir);
const normalizedPath = path.normalize(targetPath);

if (!normalizedPath.startsWith(absoluteBase + path.sep)) {
  throw new Error('Path traversal detected');
}
```

### Shell Script Safety

- Use `set -euo pipefail` in BATS tests
- Apply file size limits (10M) and count limits (1000)
- Validate session ID format before use
- Quote all variables in shell scripts

---

## Approval Requirements

**Requires Approval:**
- Any modification to `~/dev/ensemble`
- Schema/architectural changes
- Changes to constitution.md or stack.md

**No Approval Needed:**
- Reading files anywhere
- Creating files in `.claude/` and `docs/`
- Running tests
- Git operations (status, diff, log, add, commit)

---

## Current Status

Project in Phase 4B implementation. Testing TRD v1.4.0 includes Phase 5 (Hook Integration Testing).

**Completed:**
- Phase 2: Integration Infrastructure
- Phase 3: Observability (verify-telemetry.sh, verify-skill.sh)
- Phase 4A: Structure Verification (vendoring.test.sh, commands.test.sh)
- Phase 4B: Eval Framework (run-eval.js, judge.js, aggregate.js, 9 eval specs)

**Pending:**
- Phase 1: Unit Tests (Jest, BATS for hooks)
- Phase 5: Hook Integration Testing (TRD-TEST-093-100)
