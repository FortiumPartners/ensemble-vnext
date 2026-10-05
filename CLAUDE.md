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

Fuller guidance, with a worked before/after pair taken from a real session, is in
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
/implement-trd --> implementation + .trd-state/ tracking (review/hardening/verify INSIDE it)
/audit-build   --> verify delivered code against TRD and PRD; a passing audit closes the feature
/close-feature --> close a feature on your say-so (records it, clears its in-flight state)

SHORTER PATHS
/plan <what>   --> defect/small change/refactor: sizes work, writes a matching TRD —
                   light at trivial/small (no audit), phased+audited at medium. --implement builds.
/amend <what>  --> ONE change to the feature in flight. No new TRD.
/implement-trd --reconcile --> re-attest delivered work; re-open anything only claimed done
/refine-verification --> falls short? agree a plan (--auto: unattended)
/verify-build  --> fixes by default now too; --no-fix for report-only
```

**`/plan` vs `/amend`: whose plan it is, not size.** Work in flight is an amendment to ITS
TRD; `/plan` would fork a second TRD, losing the thread.

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

Full mechanism, every hook, and the measurements behind each one: `docs/reference/hooks.md`.
The two load-bearing ones, in brief:

**Discipline Hook (Stop) — model-judged.** One prompt-type `Stop` hook, `discipline-stop`
(manifest id `discipline-stop.js`, prompt source
`packages/core/hooks/prompts/discipline-stop.source.md`), enforces
`.claude/rules/async-discipline.md` (case A: a promise of later work that nothing will keep)
and `.claude/rules/autonomy.md` (case B: a mid-command pause). It runs on the platform's own
model judge, on `claude-sonnet-5`, rather than on regex matching inside a `.js` file — there
is no `SubagentStop` judge (removed 2026-08-28), and the three original discipline `.js` files
no longer exist (4.1.11). To change the guard: edit the source file, run
`build-judge-prompts.js` then `generate-hooks-artifacts.sh`, re-score with
`test/discipline-corpus/replay/`, refresh. Mechanism: `docs/reference/hooks.md` §6; history
and measurements: `docs/rules-history/`.

**Notify Hook (Stop).** `.claude/hooks/notify.sh` fires on every session stop and optionally
runs a notification command (`$NOTIFY_ON_STOP`) — for orchestration patterns where a parent
process or external system needs to know a session went idle. It is the last entry in the
`Stop` array, after the discipline judge, and fires independently of it. Full env-var surface
and usage patterns: `docs/reference/hooks.md` §7.1. Unit tests: `packages/core/hooks/notify.test.sh`.

---

## Eval Framework Usage

The eval framework at `test/evals/framework/` (`run-eval.js`, `run-session.sh`,
`collect-results.sh`, `judge.js`, `aggregate.js`, `schema.js`) enables A/B testing of skills
and agents. **Use `dev-loop/` specs by default** — 3 variants (baseline, framework,
full-workflow) — not `skills/`, `agents/` or `commands/`, which are for narrower isolation
testing. Session execution supports `--local` (uses `--print`) and remote (default, needs a
GitHub-pushed repo); the judge (`judge.js`) always runs locally and synchronously, on Opus 4.5.

```bash
# Run a dev-loop eval, collect, then judge and aggregate
node test/evals/framework/run-eval.js test/evals/specs/dev-loop/dev-loop-pytest.yaml --local
./test/evals/framework/collect-results.sh <session-id> <output-dir>
node test/evals/framework/judge.js <session-dir> code-quality
node test/evals/framework/aggregate.js <results-dir>
```

An eval spec is YAML: `variants` (each a `prompt_suffix`), `checks` (binary pass/fail) and
`metrics` (a `rubric` from `test/evals/rubrics/`, judged 1–5). See existing specs under
`test/evals/specs/` for the full shape.

---

## Headless Testing with Claude CLI

**Always use `--plugin-dir` and `--setting-sources project`** — this is what makes a headless
run use the development plugin and discover project agents. Test scripts do this
automatically via `PLUGIN_ROOT`.

```bash
# Local, non-interactive
PLUGIN_DIR="/home/james/dev/ensemble-vnext/packages/full"
echo "Build a calculator" | claude --print \
    --plugin-dir "$PLUGIN_DIR" \
    --setting-sources project \
    --dangerously-skip-permissions
```

`--remote` runs on Claude's cloud infrastructure instead: the prompt is the CLI argument (not
piped), it needs a GitHub-pushed repo, it does not accept `--dangerously-skip-permissions`,
`--session-id`, `--plugin-dir` or `--setting-sources`, it needs a TTY (wrap in `script` to
capture output), and it runs at the repo root rather than the invoking subdirectory.
`claude --teleport session_<id>` pulls a remote session back to the local CLI (branch must
already be pushed). Local session ids are UUIDs; remote ones are `session_<id>`.

---

## File Structure Reference

```
.claude/
  agents/        # 13 streamlined subagents
  commands/      # Workflow commands
  hooks/         # Hook executables
  skills/        # Compiled skills
  rules/         # constitution.md, stack.md, verification.md (owner-governed); process.md and discipline rules
  settings.json  # Committed configuration

docs/
  PRD/           # Product Requirements Documents
  TRD/           # Technical Requirements Documents
  standards/     # Symlinked governance docs

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
- Changes to constitution.md, stack.md or `.claude/rules/verification.md` (running
  `/verification-setup` is the owner's approval)

**No Approval Needed:**
- Reading files anywhere
- Creating files in `.claude/` and `docs/`
- Running tests
- Git operations (status, diff, log, add, commit)

---

## Current Status

Released at **4.13.0** (2026-10-05). 21 commands, 13 subagents. Test battery: 1815 Jest,
124 pytest, 604 BATS. **Full release history: `CHANGELOG.md`.**

4.13.0: `/audit-docs` corrects or cuts `docs/` against the code on a review branch;
PRD behaviour rewrites are listed for confirmation.

Every framework-shipped skill is named once, in `packages/skills/framework-skills.txt`,
marked `check` or `support`, and `/rebase-project` reads that list rather than a hardcoded
one (4.10.0/4.9.0).

**Known open**, newest first — see `CHANGELOG.md` for the fix or measurement behind each:
- 4.13.0: `/audit-docs` is unproven end to end live; a TRD moved to another folder can be
  skipped as having no implementation.
- 4.12.x: the sweep chain is unproven live; reused swept evidence ignores core edits to
  files a swept fix read but did not change.
- 4.11.0: after the re-audit cap, a fresh audit is still a narrow re-audit; live convergence
  on a real feature is unproven.
- 4.10.3: `/refine-verification` and fix-by-default are unproven in a live stalled run.
- 4.10.2: subagent starting context has not measurably fallen.
- 4.10.1: 2 of 124 replayed judgements judged an active `/goal` condition instead of the
  discipline rubric (only in sessions running `/goal`, each bounded to one turn by the block
  cap); consuming projects get the fix only after `/rebase-project`.
- 4.10.0: the coverage floor `/verification-setup` recommends applies only if the judge that
  reads it copies it into the loop.
- 4.8.0: the functional-verification loop runs by default now; its cost is still unmeasured.
- 4.7.2: `packages/core/lib/discovered.test.js` hangs on the GitHub runner only (cause
  unidentified after eliminating Node version, stdin, open handles and regex backtracking);
  excluded from CI via `jest.config.ci.js`, which holds the evidence.

The modernization backlog, `docs/modernization/2026-08-improvement-plan.md`, is the live list
for anything older than this.
