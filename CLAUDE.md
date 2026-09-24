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

## How to talk to the owner

This is a natural-language framework. Its output is read by a person, so prose quality is a
feature of the product, not a courtesy — and like everything else here it gets better by
repetition rather than by passing a check.

**An id is a lookup key, not a description.** Write "the clamp-order defect (FIX-001)", never
"FIX-001" alone. The reader should not have to go and find out what a thing is before your
sentence means anything.

**Gloss an internal term the first time, or use ordinary words.** "the class that must stay
clean" beats "the A3 zero-tolerance class". "right 88% of the time when it flags something"
beats "precision 0.8752".

**Technical is fine. Cryptic is not.** The failure is never that a sentence is too technical
or too long — it is that it asks for two or three lookups before it parses. The owner is an
engineer; write for an engineer who was not in this session.

**State outcomes, not activities.** "3 of 4 tasks built; the fourth needs a decision from you"
beats "dispatched the phase workflow, ran the gate, applied review findings."

**Numbers carry their unit and their baseline.** "677s, was 341s" beats "improved latency."

Fuller guidance, with worked before/after pairs taken from a real session, is in
`.claude/rules/command-status.md` under "Write for someone who was not in the session". The
router's orientation hint carries a short form of this on every turn. Neither will land every
time; that is expected, and it is why the guidance appears in more than one place.

---

## Core Principles

1. **Commands orchestrate, subagents execute** - Commands define workflow, agents do specialized work
2. **Skills and agents are PROMPTS only** - Markdown files interpreted by LLM, not executable code
3. **Commands are prompts with optional shell scripts** - Deterministic parts use scripts, LLM handles the rest
4. **Non-deterministic system** - Most testing is manual; use session logs to verify behavior

---

## Development Workflow

```
FULL PIPELINE
/create-prd    --> docs/PRD/<feature>.md
/audit-prd     --> verify the PRD against its source
/create-trd    --> docs/TRD/<feature>.md
/audit-trd     --> verify the TRD against the PRD
/implement-trd --> implementation + .trd-state/ tracking (review and hardening run INSIDE it)
/audit-build   --> verify delivered code against TRD and PRD

SHORTER PATHS
/plan <what>         --> defect / small change / refactor: sizes the work and writes a TRD
                         sized to match — light at trivial/small (no audit), phased and
                         audited at medium. --implement to build.
/amend <what>        --> ONE change to the feature in flight. No new TRD.
/implement-trd --reconcile --> re-attest delivered work; re-open anything only claimed done
```

**`/plan` vs `/amend` is about whose plan the work belongs to, not size.** Work on the
feature in flight, sitting in its path, is an amendment to ITS TRD; `/plan` would fork
a second TRD for something already understood, which is how a session loses its thread.

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

## 13 Streamlined Subagents

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
| agent-implementer | (new) | AI/agent behaviour: prompts, RAG, agent loops, evals |

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
`async-discipline` and `autonomy-discipline` on `Stop`, `subagent-discipline` on
`SubagentStop`. As of 2026-08-13 (`docs/TRD/discipline-judgment.md`) all three are
`hookType: "prompt"` in `packages/core/hooks/hooks.manifest.json` — evaluated by the
platform's own model judge (prompt text in `packages/core/hooks/prompts/`) rather than by
regex matching inside a `.js` file.

**There are no `.js` files behind these three any more** (4.1.11, DISC-B009):
`async-discipline.js`, `autonomy-discipline.js`, `subagent-discipline.js`,
`lib/async-claim-detector.js` and `lib/transcript-text.js` were deleted, together with the
`ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` lever that regenerated them as command-type. The lever
never worked outside this checkout — those files were never delivered to a scaffolded
project — so it would have shipped a safety net with no detection behind it. Their manifest
entries keep the `.js` names as **identifiers**; nothing resolves them to disk. A frozen copy
of the regexes lives at `test/discipline-corpus/detectors/regex.js` purely so the scoring
baseline stays reproducible; it is a test fixture, not runtime code.

**As of 2026-09-24 the two `Stop` judgments share one hand-authored prompt**,
`packages/core/hooks/prompts/discipline-stop.source.md` (~4 KB, replacing a 14.9 KB prompt
assembled from blocks), and run on `claude-sonnet-5` rather than the default small model.
Consecutive blocks are capped at 1 by `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` in settings `env`.
The judge's own loop guard was measured being ignored. Evidence: `FINDINGS.md`.

To change the guard: edit the source file, run `build-judge-prompts.js` then
`generate-hooks-artifacts.sh`, re-score with `test/discipline-corpus/replay/`, refresh.
See the two rules files above for the full mechanism — not duplicated here.

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

The notify hook is the last entry in the `Stop` hook array, after the discipline
guard (`learning.sh` and `wiggum.js`, both referenced here in older docs, were retired in
4.1.0 and 4.1.18 respectively — see `.claude/rules/constitution.md`'s Architecture
Invariants):

```json
"Stop": [
  { "type": "prompt", "prompt": "...", "timeout": 60, "model": "claude-sonnet-5" },  // discipline-stop.js
  { "type": "command", "command": ".claude/hooks/notify.sh", "timeout": 60 }
]
```

Both fire on every session stop, independently — see the Discipline Hooks section above for
what the first evaluates. The notify hook sends any configured notification last.

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

Released at **4.7.0** (2026-09-24). 18 commands, 13 subagents. Test battery: 1120 Jest,
107 pytest, 658 BATS.

4.7.0 rebuilds the `Stop`-hook judge from measurement. Across 3,158 real stops it blocked
about 1 in 5, and about 95% of sampled blocks were correct turns. It now runs a hand-authored
~4 KB prompt (`discipline-stop.source.md`) on `claude-sonnet-5`, and consecutive blocks are
capped at 1 by the platform. On 153 labelled real stops it wrongly blocked 0 of 432
correct-turn judgements and caught 9 of 9 violations. **Breaking:** the autonomy check
applies only on an explicit `state=active` marker, which makes the marker's 30-minute
ceiling a real gap for long commands; that is the next fix. **Verify after refresh** with
`hook-verdict-rate.js` on a live session. The replay tools in `test/discipline-corpus/replay/`
are how any future edit gets scored.

4.6.0 renames `/investigate` to `/plan` — deleted, not aliased — and sizes work on two axes
instead of one tier ladder: a `kind` (defect | change | refactor) and a `weight` (trivial |
small | medium), with `feature` as the exit to `/create-prd`. `kind` changes the stage list,
not just the scoring. The weights are strict supersets, and none of the nine cells gets its own
name. Both size ceilings are deleted rather than raised, and `fix-sizing.js` is down to
`matchNeverUnattended()` — the owner's policy list is the only brake left, which is the point.

**Weights select a pipeline shape, never a permission.** `--implement` remains the only thing
that starts work and is honoured at every weight.

Verified by three live runs rather than a code read, including a decoy defect where `/plan`
found the real cause and left the plant untouched. Functional verification derived its criteria
from the PRD with the TRD withheld: 29 of 32 met, 0 not met, 3 open on the open-question
channel.

4.5.0 makes `/create-trd`'s readout advise on **depth** rather than width: it names whichever
cause actually makes a plan serial — declared dependencies or shared files — and prints the
chain that sets the depth, which `buildGraph` has always computed and never shown. Grounding
now challenges dependencies it cannot justify; sizing names tasks that will run long. Both
advisory. Both `Stop`-hook guards were also recalibrated after measuring 10 blocks in 33
evaluations with none of them correct — **that change is unmeasured; if the block rate does not
fall, revert it.**

4.4.0 was the release aimed at **time**: `/sweep` (a list of small fixes, no TRD), scope-drift
and sizing checks at three points in the pipeline, parallel grounding in `/create-trd`,
phase-group dispatch in `/implement-trd`, and `run-profile.js` — which reads timestamps the
dispatch ledger has always written and reports where a run's wall clock actually went.

The modernization run in `docs/modernization/2026-08-improvement-plan.md` is the live
backlog — read it rather than this section for what is open. Items 1–13 are delivered;
14 (review cadence) and 15 (phantom success) landed in 4.2.x–4.3.x.

**Known open, as of 4.4.0:**
- `[LIVE]` verification tasks are still planned without reading `.claude/rules/verification.md`.
  4.4.0 narrows this rather than closing it: tasks that say in their own text they cannot
  finish here are now predicted and skipped with a report (`parseDeferred`), but the `[LIVE]`
  flag itself still has no consumer in `implement-phase.js`.
- Item 15.4: a readout glyph can read "verified" where the verdict was `unbuilt`.
- **The two audit stages are the next real speed reduction** — `/audit-prd` at 9.1 min and
  `/audit-trd` at 14.5 min, both untouched, both already using the fan-out pattern. Two
  specific findings sit ready: `/audit-trd` never reads the buildability findings
  `/create-trd` writes to disk for it, and both audits sequence verifiers behind an index
  several of them do not use.
- **Nothing has been timed since 4.4.0's changes.** The 1,384-second `/create-trd` median
  (57 runs) is the baseline; no run has been taken against it.
