# TRD: context-model-hygiene

**Source PRD**: None — small change decided in session (owner, 2026-09-28)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | An implementer never runs a live, model-spending scenario (anything that starts `claude` sessions, such as `test/smoke/run-smoke.sh`) as part of its own checks; it reports such a check as not run and leaves it to the verification step or the owner | owner, 2026-09-28: "implementers should not run live, model-spending scenarios"; measured: the `/close-feature` implementer ran the 11-run smoke scenario itself and waited on it with 605 `echo idle` and 225 `ps aux` calls, each re-reading 300k–650k tokens, about $171 of ~$740 subagent spend |
| O2 | Every `agent()` call in `packages/core/workflows/*.js` names its model, directly or through an `agentType` whose frontmatter sets one, so no workflow step inherits the session's model by accident | owner, 2026-09-28: "pin every workflow dispatch to a deliberately chosen model"; measured: verification Render ($34) and Judge ($15) ran on Opus because the lead session was Opus |
| O3 | The 13 agents are registered once per session, not twice | owner, 2026-09-28: "check whether plugin agents plus vendored project agents are both registered"; read: `packages/full/.claude-plugin/plugin.json` lists all 13 under `agents`, and every scaffolded project also vendors them into `.claude/agents/` |
| O4 | The rule files every agent loads carry the rules, not their history: `async-discipline.md` and `autonomy.md` together fall from ~55 KB to ≤ 17 KB, `command-status.md` from ~21 KB to ≤ 12.5 KB (amended 2026-09-29: the first targets, 15 KB and 12 KB, were only met by deleting rules; the end-of-run review caught it, and "no rule is deleted" outranks a byte target), with every rule kept and the history, measurements and incident narratives moved to `docs/rules-history/` | owner, 2026-09-28: "Keep every rule, move history and measurements out"; measured: every subagent starts at ~90k tokens, ~36k of it `CLAUDE.md` plus `.claude/rules/*.md` |
| O5 | This repository's own `CLAUDE.md` falls from ~31 KB to ≤ 15 KB: its Current Status keeps the latest release and what is open, and points at `CHANGELOG.md` for the rest | owner, 2026-09-28: "`CLAUDE.md` (~8k) is mostly release notes duplicated in `CHANGELOG.md`" |
| O6 | No other behaviour changes: every existing test still passes. The only intended differences are that implementers leave live checks to verification (O1), that live checks are planned as their own deferred tasks (O7), and that the verification Render step moves from an inherited Opus to a chosen Sonnet (O2) | owner, 2026-09-28: "without changing behaviour or capping agents"; adversarial review: the first draft understated this |
| O7 | A TRD never puts a live, model-spending run in a build task's acceptance criteria; such a check is its own `[LIVE]` (deferred) verification task | adversarial review of this TRD: the close-out TRD's own criterion (`docs/TRD/feature-close-out.md:438`, "`./test/smoke/run-smoke.sh close-feature` passes all eleven runs") is what told the implementer to run it — the root cause of O1's measurement |

## Intended Change

Measured before (this session, 270 subagent transcripts, 2026-09-28):

- Every subagent's first turn: median ~90k context tokens, whatever its job.
- `async-discipline.md` 35.9 KB, `autonomy.md` 19.0 KB, `command-status.md` 21.3 KB, `CLAUDE.md` 30.8 KB.
- Workflow steps with neither `agentType` nor `model`: `verify-functional.js` Render (~:903) and Judge (~:930, ~:1168). (`create-trd.js` sizing is already pinned: `agentType: 'technical-architect'` at :719, which sets `model: opus`.)
- The plugin's 13 agents are registered by Claude Code (this session lists both `ensemble-vnext:backend-implementer` and `backend-implementer`), and every project also vendors them.

After: the byte targets in O4 and O5 hold; each workflow's existing harness test fails if any
`agent()` call it records names neither `agentType` nor `model`; a session in a scaffolded project
lists each agent once; the TRD authoring contract keeps live checks out of build tasks, and the
implementer's check instruction says live scenarios are not its to run. A subagent dispatched in this repo after the
change starts measurably below ~90k (recorded in the readout, not gated: the platform's own
prompt is most of the rest).

## Decision

- **Rules stay in their files, cut to the rules.** `async-discipline.md` and `autonomy.md` stay
  separate files, each reduced to what an agent must do and not do, with a one-line pointer to
  its history under `docs/rules-history/`. Rejected: merging them into one file. The judge is
  already one prompt (`discipline-stop.source.md`); merging the rule files saves little beyond
  the shared header and renames paths that ~20 files and tests cite.
- **Models chosen per step:** Render → `sonnet` (it fills a fixed page template from judged
  results; mechanical). Judge → `opus`, stated explicitly: it rules met / not met on evidence,
  which decides the run's outcome; it was already Opus here, and at $15 over 11 runs it is not
  where the money goes. Sizing is left as it is (already a deliberate `technical-architect` /
  Opus choice). The point is that each is now a choice, not an inheritance.
- **Pins are checked at run time, not by parsing source.** Each workflow already has a harness
  test that records every `agent()` call and its options (`audit-trd.test.js:70-75` already
  asserts `agentType` this way). Extending that assertion to "`agentType` or `model`" in every
  workflow's test resolves spreads and later assignments for free. Rejected: a source-scanning
  test — it matches `agent(` inside comments and misses `opts.agentType = …` set after the object
  is built (`implement-phase.js:188`).
- **Agents are registered only where they run — the skills precedent, exactly.** Commit
  `8dc88ec` (RUNTIME-P002) found that dropping the manifest key was not enough: Claude Code
  discovers a plugin's default directories itself, so `skills/` was renamed to the unregistered
  `skills-lib/`, and `copy_skills()` reads `skills-lib/` with a fallback to `skills/` for older
  installs. Measured then with `claude plugin details`: 63 skills / ~12,366 always-on tokens → 2 /
  ~95. Do the same for agents: remove the `agents` array, rename `packages/full/agents/` to
  `packages/full/agents-lib/`, have `copy_agents()` read `agents-lib/` falling back to `agents/`,
  and update `/init-project` and `/rebase-project`'s source paths. The vendored `.claude/agents/`
  copies are the runtime.
- **Live checks are planned as their own tasks, and implementers report them as not run.** The
  root cause was the plan: a build task's acceptance criteria named a live, 11-run scenario. The
  TRD authoring contract now requires such a check to be a separate `[LIVE]` verification task,
  which `/implement-trd` already sets aside by default. The implementer instruction is the
  backstop for TRDs written before this rule: report the check "not run", never start, wait on
  or poll it.
- **History docs live in this repository, and the pointer says so.** The rule templates ship to
  consuming projects, where `docs/rules-history/` does not exist; each pointer names the
  framework repository (`FortiumPartners/ensemble-vnext`, `docs/rules-history/<file>.md`), not a
  relative path. Any section another file cites by name stays in the rule file.

absorbed:     none
not absorbed: `/implement-trd` pushes after every phase (`implement-trd.md:1184`) — recorded in the discovery ledger; unrelated to context or models
not absorbed: the lead session's own length — a way of working (fold or restart per feature), not a code change

## Non-Goals

- No cap on turns, tokens or time for any agent (owner, 2026-09-28: "Capping implementers is not the answer").
- No change to which model any agent's frontmatter already sets.
- No rule is deleted or reworded in substance; only history moves.
- No change to the Stop judge prompt.

## Verification Artifacts

None apply — no UI designs, interaction diagrams or data views; the surfaces are prompt files, workflow scripts and a plugin manifest.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should the verification Judge run on Opus or Sonnet? | Opus, pinned explicitly (it decides outcomes; it is cheap here) | owner-only |
| OQ-2 | Should the smoke scenarios themselves stop using Opus? They run headless `claude` on whatever the default model is | Out of scope; they ran ~6% of spend over three days | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Keep live, model-spending checks out of build tasks: add to `packages/core/contracts/trd-authoring.md` that an acceptance criterion needing a live run (anything that starts `claude` sessions, e.g. `test/smoke/run-smoke.sh`, `claude -p`) belongs to a separate `[LIVE]` verification task, never a build task's criteria; and add to the `<check_battery>` instruction in `implement-trd.md` §3.5 and to `packages/core/contracts/task-delegation.md` that the implementer reports any such check "not run" and never starts, waits on or polls it. Mirror to `.claude/` | O1, O7 | None | All three files carry the rule, naming `test/smoke/run-smoke.sh` and `claude -p`. Mirrors byte-identical. `npx jest` and the BATS battery pass |
| FIX-002 | Pin the three unpinned workflow dispatches: `verify-functional.js` Render (`model: 'sonnet'`) and both Judge sites (`model: 'opus'`), each with a one-line reason; mirror to `.claude/workflows/`. In each workflow's existing harness test (`verify-functional`, `create-prd`, `create-trd`, `audit-prd`, `audit-trd`, `audit-build`, `implement-phase`, `sweep`), assert that every recorded `agent()` call carries `agentType` or `model` (extend `audit-trd.test.js:70-75`'s pattern; where a workflow has no harness test covering its calls, say so in the return) | O2 | None | The assertions pass on the changed tree AND the `verify-functional` one fails when any of the three new `model:` lines is removed (a temporary local revert, not committed). Mirrors byte-identical. `npx jest` passes |
| FIX-003 | Stop the plugin registering agents, following commit `8dc88ec`'s skills fix: remove the `agents` array from `packages/full/.claude-plugin/plugin.json`; `git mv packages/full/agents packages/full/agents-lib`; `copy_agents()` in `scaffold-project.sh` reads `$PLUGIN_DIR/agents-lib` falling back to `$PLUGIN_DIR/agents`; update the source paths in `/init-project` and `/rebase-project` (all copies), and any test or script citing `packages/full/agents` | O3 | None | `claude plugin details full@ensemble-vnext` run against `packages/full` reports 0 agents (before/after counts in the return). A scaffold into a temp dir still produces 13 files in `.claude/agents/` (scaffold BATS pass). `check-version-sync.sh`, `npx jest` and the BATS battery pass |
| FIX-004 | Cut `async-discipline.md`, `autonomy.md` and `command-status.md` to their rules; move history, measurements, incident narratives and worked recipes to `docs/rules-history/{async-discipline,autonomy,command-status}.md`. Each rule file ends with one pointer line naming the framework repository and path. Before removing any section, grep the tree for its heading; a section cited by name elsewhere (e.g. "Orchestration pattern: the scheduled nudge", cited at `implement-trd.md:1441`; "How the platform actually asks the question"; "Write for someone who was not in the session") stays, trimmed. Apply to the templates in `packages/core/templates/claude-directory/rules/` and the vendored `.claude/rules/` copies | O4, O6 | None | `wc -c`: the two discipline files ≤ 17,000 bytes combined, `command-status.md` ≤ 12,500 (amended 2026-09-29, see O4). The return lists each moved block and where it went, and each cited heading and that it survived. Template and vendored copies byte-identical. `npx jest`, pytest and the BATS battery pass |
| FIX-005 | Cut this repository's `CLAUDE.md`: Current Status keeps the latest release paragraph and the known-open list and points at `CHANGELOG.md`; the Notify Hook env-var tables and usage examples move to `docs/reference/hooks.md` where that page does not already cover them. Keep every string a test asserts (e.g. `framework-skills.txt`, required by `runtime-integrity.test.sh:373`) — grep the test tree for `CLAUDE.md` assertions first | O5 | None | `wc -c CLAUDE.md` ≤ 15,000. Each removed release paragraph is present in `CHANGELOG.md`; each removed notify detail is in `docs/reference/hooks.md`. `runtime-integrity.test.sh` and the full BATS battery pass |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/contracts/trd-authoring.md`, `.claude/contracts/trd-authoring.md`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/contracts/task-delegation.md`, `.claude/contracts/task-delegation.md`
- **Reuse:** the existing `<check_battery>` block at `implement-trd.md` §3.5 (~line 587), whose `<instruction>` already governs what the implementer runs [read]
- **Replaces:** nothing
- **Follow:** mirror parity is enforced by `notify-on-complete.test.sh` (dogfood mirrors) [read]
- **Careful:** the phase gate's `verify-app` prompt is written by the orchestrator per phase; this task changes only the implementer's instruction [inferred]

### FIX-002
- **Touches:** `packages/core/workflows/verify-functional.js`, `.claude/workflows/verify-functional.js`, `packages/core/workflows/verify-functional.test.js`, `packages/core/workflows/create-prd.test.js`, `packages/core/workflows/create-trd.test.js`, `packages/core/workflows/audit-trd.test.js`, `packages/core/workflows/audit-build.test.js`, `packages/core/workflows/implement-phase.test.js`, `packages/core/workflows/sweep.test.js`
- **Reuse:** the existing comments at `create-trd.js:609-616` (`GROUND_OPTS`) and the audit reconcile stages, which explain why an unset `agentType` inherits the session model [read]
- **Replaces:** nothing
- **Follow:** `verify-functional.js` must stay clock-free and is covered by `verify-functional.test.js` and `verify-functional-trd-sync.test.js` [read]
- **Careful:** the Render site is at ~line 903; the Judge sites at ~930 (empty-criteria branch) and ~1168 [read]. `audit-prd.js` has no harness test file today (`audit-prd.test.js` absent) [read]; say so rather than inventing one

### FIX-003
- **Touches:** `packages/full/.claude-plugin/plugin.json`, `packages/full/agents/` → `packages/full/agents-lib/`, `packages/core/scripts/scaffold-project.sh`, `packages/core/commands/init-project.md`, `.claude/commands/init-project.md`, `packages/full/commands/plugin-only/init-project.md`, `packages/core/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`
- **Reuse:** `scaffold-project.sh:952`'s stated reason for not registering skills [read]
- **Replaces:** the `agents` array and the discoverable `agents/` directory name
- **Follow:** commit `8dc88ec`'s `copy_skills()` fallback shape [read]; `find_plugin_json agents skill-affinity.json` (`scaffold-project.sh:1058`) looks up a file under `agents/` and must follow the rename [read]
- **Careful:** a project not yet scaffolded has no agents until `/init-project` runs; every command that dispatches agents is itself vendored by `/init-project`, so none can run before it [inferred]

### FIX-004
- **Touches:** `packages/core/templates/claude-directory/rules/async-discipline.md`, `packages/core/templates/claude-directory/rules/autonomy.md`, `packages/core/templates/claude-directory/rules/command-status.md`, `.claude/rules/async-discipline.md`, `.claude/rules/autonomy.md`, `.claude/rules/command-status.md`, `docs/rules-history/async-discipline.md`, `docs/rules-history/autonomy.md`, `docs/rules-history/command-status.md`
- **Reuse:** the judge's own statement of the rules, `packages/core/hooks/prompts/discipline-stop.source.md` (~4 KB), as the shape a rule-only text takes [read]
- **Replaces:** the history, measurement and incident sections of the three rule files
- **Follow:** "L2: rule template (framework-shipped) is in sync with dogfood" in `notify-on-complete.test.sh` requires template and vendored copies to match [read]
- **Careful:** `autonomy.md` contains the exemptions for `/refine-*`, `verify-plan-recovery` and `verification-setup`, and `command-status.md` the banner, readout and artifact-link contracts that every command cites; those are rules, not history, and stay [read]

### FIX-005
- **Touches:** `CLAUDE.md`, `docs/reference/hooks.md`
- **Reuse:** `CHANGELOG.md` already holds each release's notes [read]; `docs/reference/hooks.md` §7 covers `notify.sh` [read]
- **Replaces:** the long Current Status history and the Notify Hook section's tables and examples in `CLAUDE.md`
- **Follow:** "How to talk to the owner", Core Principles, Approval Requirements and the known-open list stay
- **Careful:** `runtime-integrity.test.sh:373` requires the string `framework-skills.txt` in `CLAUDE.md`, which today appears only in the 4.10.0 and 4.9.0 paragraphs [read]; other docs cite `CLAUDE.md` sections by name [inferred]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| How much of a subagent's ~90k starting context the double agent registration adds | The platform's system prompt is not in transcripts; FIX-003's `claude plugin details` before/after and a fresh subagent's first-turn context after the change measure it |
| Whether cache reads count against the owner's plan allocation the same way they bill on the API | Not documented in anything read here |
