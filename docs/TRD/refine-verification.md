# TRD: refine-verification

**Source PRD**: None — small change decided in session (owner, 2026-09-29)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Planning the next verification round is a command in the refine family, `/refine-verification [--auto]`. Interactive is the default: it derives the plan and asks the owner only what the evidence cannot settle, one item at a time, each shown with its evidence. With `--auto`, an agent answers every open item, and each answer is marked answered, default or OWNER-CALL so the owner can review it afterwards | owner, 2026-09-29: "make this something like /refine-verification (to stay consistent), with the option to add --auto … the --auto argument forces the framework to use an agent to come up with its best possible answers" |
| O2 | Every plan, whoever wrote it, is the same `verification-plan.md` that `/verify-build --fix` already reads, derived by the same written rules | owner, 2026-09-29 (same turn); `verify-build.md` `--fix` step 0 reads the plan's six sections and `readStopRule()` |
| O3 | `/verify-build --fix` plans the round itself, unattended, whenever it has no plan or only a stale agent-written one. With no earlier verification run, it verifies first, then plans, then runs its rounds. It never falls back to a single round for lack of a plan | owner, 2026-09-29: "a way to just move straight into /verify-build that doesn't require this, that can be non-interactive"; measured: lightning-lane `trip-dates-disney-sync` went from 49 to 64 of 69 met on plan content the skill derived, with every owner answer a default |
| O4 | Every ruling an agent made on the owner's behalf is visible in the readout of the run that made it, so the owner reviews it after the run instead of answering questions during it | adversarial review of this TRD: `/refine-trd` requires the same (`refine-trd.md:88-89`); without it, an agent-changed criterion is judged against its new meaning and the owner never sees the change |
| O5 | The `verify-plan-recovery` skill is removed from this repository and from consuming projects on their next `/rebase-project`; every live reference names the command instead | follows from O1; otherwise two things write one file |

## Intended Change

**Today:**
- A stalled run's report says "agree a recovery plan with `/verify-plan-recovery`, then run `/verify-build --fix`" (`functional-verification.js:654`).
- That skill, run by the owner, derives the plan and asks what is left (it has done so since PR #11), then writes `.trd-state/<feature>/verification-plan.md`.
- `/verify-build --fix` with no plan runs a single round: `readStopRule` returns `null` with an error, and `verify-build.md:286` applies `{maxRounds: 1}`.

**After:**
- **One contract holds the planning rules.** `packages/core/contracts/verification-plan.md` states how to derive each plan section from the evidence, which items are left open, how `--auto` answers them, how rulings are recorded, and when a plan is stale.
- **`/refine-verification [feature-or-trd] [--auto]` follows that contract.**
  - *Interactive:* it asks one `AskUserQuestion` per open item, each showing the evidence: what the check saw beside the criterion text, plus the attempts and the cause.
  - *`--auto`:* it asks nothing. A `product-manager` subagent answers every open item with a verdict: `answered`, `default` or `OWNER-CALL`.
  - *Either mode:* its readout leads with every ruling.
- **`/verify-build --fix` plans for itself when it needs to.** It derives an `--auto` plan in-process from the same contract, without chaining a command, when:
  - no plan exists; or
  - the plan was agent-written and the latest verification report is newer than it.
  
  If no report exists yet, it runs one plain verify pass first. Its readout lists every agent ruling under DECISIONS. A plan the owner agreed in interactive mode is reused until the owner re-runs `/refine-verification`.
- **The stalled report's single next step becomes `/verify-build --fix`.** A second line names `/refine-verification` for owners who want to review the plan first.
- **The skill is deleted.** `/rebase-project` removes it from consuming projects through a retired-skills list.

## Decision

- **A refine command, not a skill.** It matches `/refine-prd` and `/refine-trd`, including their mode vocabulary and their `--auto` verdicts (`answered` / `default` / `OWNER-CALL`: decide anyway, record it for review). It keeps `disable-model-invocation: true` like the other refine commands, because nothing chains it. It carries `category: verification`. This supersedes decision D12 of `docs/TRD/verification-fix-loop.md` at the owner's direction; D12 is amended there inline.
- **One contract, two readers, no nested command.** `--fix` reads the contract and derives the plan in its own run instead of chaining `/refine-verification --auto`. A chained command would bring a second banner and a `notify-complete.sh` call, which sets `state=none` mid-run and switches off the Stop judge's pause check (case B). It would also fire the owner's completion webhook early. The contract precedent is `trd-authoring.md` and `task-delegation.md`.
- **When `--fix` re-plans.** It re-plans when there is no plan, or when an agent-written plan (`**Agreed with**: agent (--auto)`) is older than the latest `verification-report.md`. Otherwise every later `--fix` run would reuse the first auto plan with stale blockers. An owner-agreed plan is the owner's, and is reused until they re-run `/refine-verification`.
- **Where rulings go.** Agent rulings are written into the plan's `## Owner rulings` table only, marked `decided by: agent (--auto)`, so the Judge applies them to this run. They are never written into the PRD or TRD, which record owner decisions only. Owner rulings from interactive mode are written into the PRD or TRD, as the skill does today.
- **Access only the owner has** (a password, an account) is never guessed. Under `--auto` the criterion becomes not verifiable, and the need is recorded as a discovery (`blocksFeature: false`), named in ISSUES.
- **Interactive mode asks one item at a time.** This departs from the skill's single batched question on purpose: the owner wants interaction worth having, with evidence per item, not a form to fill in.

absorbed:     consuming projects keep a stale, model-invocable `verify-plan-recovery` skill after
              `/rebase-project`, because rebase keeps any skill the plugin no longer ships
              (`rebase-project.md:358-366`). Otherwise two paths write one file, which is exactly
              what O5 removes. The mechanism already exists for commands
              (`rebase-project.md:430-440`, retired by name).  [BLOCKS]
not absorbed: `verification-setup` gaining `--auto`. Its answers are infrastructure policy for
              an owner-governed file (`constitution.md` Governance Split). An agent answering them
              is what that rule forbids.

## Non-Goals

- No change to how `--fix` runs its rounds, applies the stop rule, or promotes blockers.
- No change to `verification-plan.md`'s six sections or to `readStopRule()`.
- No `--auto` for `verification-setup`, and no edit to `.claude/rules/verification.md` in any mode.
- Neither mode writes a credential's value. `/refine-verification` never starts `--fix`.

## Verification Artifacts

None apply — no UI designs, interaction diagrams or data views; the surfaces are command prompts, a contract, a report renderer and docs.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Which agent answers under `--auto` (in the command and inside `--fix`)? | `product-manager`, the one `/refine-trd --auto` uses to close its questions: the open items concern what a criterion should mean, not code | owner-only |
| OQ-2 | When should `--fix` re-plan instead of reusing a plan? | When there is no plan, or the plan is agent-written and older than the latest report. An owner-agreed plan is reused until the owner re-runs `/refine-verification` | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `packages/core/contracts/verification-plan.md` (+ `.claude/contracts/` mirror). It holds: the plan's six sections and their shape (from `verification-fix-loop.md` §3.4); how to derive each section from the evidence (moved from the skill's Conversation steps 1–2 as merged in PR #11); the list of what is left open (the skill's step 3); the `--auto` verdicts (`answered`/`default`/`OWNER-CALL`, as `refine-trd.md` §`--auto`); ruling recording (`decided by: owner` or `agent (--auto)`, agent rulings in the plan only); the `**Agreed with**` line; the staleness rule (OQ-2); and a complete example plan in a fenced block. Add a Jest test that extracts that example and asserts `readStopRule()` parses it to `{maxRounds: 3, closedBelow: 1}` | O2, O3, O4 | None | The contract exists with each part named above, and the mirror is byte-identical (`runtime-integrity.test.sh` compares contracts). The new test passes, and it fails if the example's `max-rounds:` line is removed (a temporary local change, not committed) |
| FIX-002 | Create `packages/core/commands/refine-verification.md` (+ `.claude/commands/` mirror). Frontmatter: `argument-hint: "[feature-or-trd] [--auto]"`, `category: verification`, `disable-model-invocation: true`. It reads the contract for every rule and does not restate them. Modes table as in `refine-trd.md` §Modes. Interactive: one `AskUserQuestion` per open item, showing the artifact the check saw, the criterion text, the attempts and the cause. `--auto`: one `product-manager` subagent answers every item per the contract. Readout: STATE opens with every ruling made (owner's or agent's). NEXT is `/verify-build --fix`. Banner and `notify-complete.sh` as for any other command | O1, O4 | FIX-001 | The file exists with those frontmatter keys and sections, and the mirror is byte-identical. `grep -c 'contracts/verification-plan.md'` on the command is at least 1. `verify-command-surface.test.js` passes |
| FIX-003 | `/verify-build`: `--fix` step 0 re-plans per the contract when there is no plan or the plan is stale (OQ-2). If no report or state file exists, it first runs steps 4–5 once as a plain verify pass. It then dispatches the `product-manager` subagent with the contract's `--auto` rules, writes the plan, and continues. The readout's DECISIONS lists every agent ruling. Replace every `verify-plan-recovery` reference (`verify-build.md:78,178,254,366,418`) with the command, or with in-run planning where `--fix` now plans itself. Change `functional-verification.js:654`'s Next line to "run `/verify-build --fix` — it plans the next round and fixes unattended" and add one line under it: "To review the plan with you first: `/refine-verification`". Update `implement-trd.md:1484,1856` to match. Update the tests: `functional-verification.test.js:1953,1964,2017` (the negative assertion at 1964 must name `/verify-plan-recovery`, so it can still fail) and `verify-command-surface.test.js:549,589`. Mirror everything to `.claude/` | O3, O4 | FIX-001 | `grep -n verify-plan-recovery` over `packages/core/commands/verify-build.md`, `packages/core/commands/implement-trd.md` and `packages/core/lib/functional-verification.js` returns nothing. The renderer test asserts the new Next line and fails against the old one. `verify-build.md`'s `--fix` step 0 names the no-report path and the staleness rule. `npx jest` passes, and the mirrors are byte-identical |
| FIX-004 | Remove the skill. Delete `packages/skills/verify-plan-recovery/` and its tests, and drop its row from `packages/skills/framework-skills.txt`. Add a retired-skills list to `rebase-project.md` (all copies) beside the retired-commands one, naming `verify-plan-recovery`, so a rebase deletes the vendored copy. Update the live references: `fix-audit.js:57` (+ mirror), `fix-audit.test.js` (use `verification-setup` as the support-role example), `verification-setup/SKILL.md:12,32`, `skill-selection-instructions.md:108`, `trd-authoring.md:618` (+ mirror), `runtime-integrity.test.sh:369`, `scaffold-project.test.sh:762`, `packages/skills/README.md`, and `test/smoke/scenarios/verify-fix.sh` (comments and the fixture's `**Written**` line only; its "cannot run headless" comment becomes "the scenario supplies its own plan") | O5 | FIX-002 | `grep -rln verify-plan-recovery packages .claude test` lists only `rebase-project.md` copies (the retired list) and none of the other files named here. `fix-audit.test.js` still proves a support-role skill is rejected as a check. `npx jest` and the BATS battery pass. `shellcheck test/smoke/scenarios/verify-fix.sh` is clean; the scenario is not run |
| FIX-005 | Rules and docs. `autonomy.md` (+ template) lists `/refine-verification` beside the refine commands as exempt in interactive mode only, and replaces the skill's paragraph. `router.py`'s FLOW hint and `process.md` (+ `packages/core/templates/process.md.template`) name the command. Update the `CLAUDE.md` workflow block, `docs/guides/PROCESS.md`, `docs/guides/INSTALL.md`, `docs/reference/verification.md` (lines 32, 50 and 343–421), `docs/reference/README.md` and `docs/reference/implement-trd.md`. Amend D12 in `docs/TRD/verification-fix-loop.md` inline, with a strike and a cross-link, in the D15 style | O1, O5 | FIX-002 | The template and vendored `autonomy.md` are byte-identical, and the byte-ceiling test in `runtime-integrity.test.sh` passes (the discipline files are at 16,431 of 17,000; `CLAUDE.md` at 14,961 of 15,000). pytest passes. `grep -c verify-plan-recovery` is 0 on every doc listed here except `verification-fix-loop.md`, where it appears only in the amended D12 and historical rows |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/contracts/verification-plan.md`, `.claude/contracts/verification-plan.md`, `packages/core/lib/functional-verification.test.js`
- **Reuse:** the Conversation, Writes and Never sections of `packages/skills/verify-plan-recovery/SKILL.md` as merged in PR #11 (7b1b83f) [read]; `refine-trd.md` §`--auto` verdict table [read]; `readStopRule` in `functional-verification.js` [read]
- **Replaces:** nothing yet (the skill is deleted in FIX-004)
- **Follow:** contracts live in `packages/core/contracts/` and are mirrored to `.claude/contracts/`, compared file by file by `runtime-integrity.test.sh:204-214` [read]
- **Careful:** `readStopRule` returns `null` plus errors for a missing or unreadable rule, and does not default (`functional-verification.js:790-793`) [read]

### FIX-002
- **Touches:** `packages/core/commands/refine-verification.md`, `.claude/commands/refine-verification.md`
- **Reuse:** `packages/core/commands/refine-trd.md` Modes and `--auto` sections as the shape [read]
- **Replaces:** the skill's role as the owner's planning conversation
- **Follow:** frontmatter conventions of `refine-trd.md` (`disable-model-invocation: true`) and the `category:` field rebase reads (`rebase-project.md:424-428`) [read]
- **Careful:** `autonomy.md` exempts interactive mode only; the `--auto` section must say it asks nothing [read]

### FIX-003
- **Touches:** `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/lib/functional-verification.js`, `.claude/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `packages/core/commands/verify-command-surface.test.js`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`
- **Reuse:** `--fix` step 0's existing plan-reading path, unchanged once a plan exists [read]; steps 4–5 as the plain verify pass [read]
- **Replaces:** the "no plan → one round" behaviour at `verify-build.md:286` and its no-plan branch at `:301-304`
- **Follow:** the `--fix` step numbering in `verify-build.md`; `--fix` asks the owner nothing (O3 of the verification-fix-loop TRD), so in-run planning must use `--auto` rules only [read]
- **Careful:** the plan's `**Written**` timestamp keys blocker promotion (`verify-build.md:295-297`), so a re-derived plan gets a fresh one. NEXT stays a single command (`command-status.md`: "not a menu"); the `/refine-verification` line sits in the report body, not in NEXT [read]

### FIX-004
- **Touches:** `packages/skills/verify-plan-recovery/`, `packages/skills/framework-skills.txt`, `packages/core/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/core/lib/fix-audit.js`, `.claude/lib/fix-audit.js`, `packages/core/lib/fix-audit.test.js`, `packages/skills/verification-setup/SKILL.md`, `packages/core/templates/skill-selection-instructions.md`, `packages/core/contracts/trd-authoring.md`, `.claude/contracts/trd-authoring.md`, `test/integration/tests/runtime-integrity.test.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/skills/README.md`, `test/smoke/scenarios/verify-fix.sh`
- **Reuse:** the retired-commands table and deletion step in `rebase-project.md:430-440` [read]; `verification-setup` as the remaining support-role skill [read]
- **Replaces:** the skill directory and its tests (delete them)
- **Follow:** `framework-skills.txt`'s `<name> <role>` line format [read]
- **Careful:** tests that count shipped framework skills or support-role rows change by one [inferred; grep for counts]. `verify-fix.sh` is a live scenario, so edit it and never run it [read]

### FIX-005
- **Touches:** `.claude/rules/autonomy.md`, `packages/core/templates/claude-directory/rules/autonomy.md`, `packages/router/hooks/router.py`, `.claude/rules/process.md`, `packages/core/templates/process.md.template`, `CLAUDE.md`, `docs/guides/PROCESS.md`, `docs/guides/INSTALL.md`, `docs/reference/verification.md`, `docs/reference/README.md`, `docs/reference/implement-trd.md`, `docs/TRD/verification-fix-loop.md`
- **Reuse:** the existing refine-commands exemption paragraph in `autonomy.md` [read]; D15's inline-amendment style in `verification-fix-loop.md:97` [read]
- **Replaces:** `autonomy.md`'s verify-plan-recovery paragraph
- **Follow:** the byte ceilings held by `runtime-integrity.test.sh` [read]
- **Careful:** `CLAUDE.md` has 39 bytes of headroom, so net additions must be offset [read]; the router hint may be asserted in `test_router.py` [inferred; grep]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| Whether `--fix`'s in-run `--auto` plan closes as many criteria as the owner-agreed plan did in lightning-lane (49 → 64 of 69) | Needs a live stalled run. The only sample had every owner answer as a default, which suggests it will, but that is one run |
| Whether the `product-manager` agent's OWNER-CALL rulings match what the owner would choose | Needs live runs. The readout surfaces every ruling (O4) so the owner can correct one by re-running `/refine-verification` |
