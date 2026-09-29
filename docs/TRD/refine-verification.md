# TRD: refine-verification

**Source PRD**: None — small change decided in session (owner, 2026-09-29)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Planning a verification round is a command in the refine family, `/refine-verification [--auto]`. Interactive by default, it derives the plan from the evidence and asks the owner only what the evidence cannot settle, one item at a time, each shown with its evidence. `--auto` asks nothing: an agent answers every open item, each answer marked answered, default or OWNER-CALL, and the readout leads with every decision so the owner can review them | owner, 2026-09-29: "make this something like /refine-verification (to stay consistent), with the option to add --auto … the --auto argument forces the framework to use an agent to come up with its best possible answers" |
| O2 | `/refine-verification` is the only thing that writes `verification-plan.md`, and the only step between a verification run that fell short and the next one. The loop is: `/implement-trd` (verifies by default) → if not satisfied, `/refine-verification` → `/verify-build` → if still not satisfied, `/refine-verification` → `/verify-build` → … | owner, 2026-09-29: "always have /refine-verification (with or without --auto) as the step between a /implement-trd and /verify-build. That keeps us from having to put the same work in two places … if the first verification isn't sufficient, we refine the plan, run it again, repeat as necessary" |
| O3 | `/verify-build` builds and re-verifies by default, as `--fix` does today, the same way `/implement-trd` verifies by default. `--no-fix` gives today's report-only run | owner, 2026-09-29: "like we made --verify the default on /implement-trd, make --fix the default on /verify-build. I believe that is more symmetric" |
| O4 | A run that falls short names `/refine-verification` as its next step, in the report, in `/verify-build`'s readout and in `/implement-trd`'s readout | follows from O2; today the report names the skill (`functional-verification.js:654`) |
| O5 | The `verify-plan-recovery` skill is removed, both from this repository and from consuming projects on their next `/rebase-project`. Every live reference names the command instead | follows from O1 |

## Intended Change

Today:

- A run that falls short reports: "agree a recovery plan with `/verify-plan-recovery`, then run `/verify-build --fix`" (`functional-verification.js:654`).
- The skill writes `.trd-state/<feature>/verification-plan.md`. Since PR #11 it derives the plan and asks only what is left.
- `/verify-build` is report-only unless `--fix` is passed.
- `--fix` with no plan runs one round (`verify-build.md:286`, `:301-304`).

After:

- **`/refine-verification [feature-or-trd] [--auto]`** exists as a command and holds the planning rules.
  - Interactive mode asks one `AskUserQuestion` per open item, showing what the check saw beside the criterion, the attempts so far, and the cause.
  - `--auto` hands every open item to a `product-manager` subagent, which marks each answer `answered`, `default` or `OWNER-CALL`.
  - In both modes the readout opens with every ruling made.
- **`/verify-build`**
  - With a plan, it builds and re-verifies by default.
  - With `--no-fix`, it only verifies.
  - With no plan, it verifies once, builds nothing, and names `/refine-verification` as NEXT.
  - A run that falls short names `/refine-verification` as NEXT.
  - `/verify-build --fix [plan-path]` is still accepted, as a way to name a different plan.
- **The report and `/implement-trd`'s readout** name `/refine-verification` when verification fell short.
- **The skill is deleted.** `/rebase-project` removes it from consuming projects through a retired-skills list.

## Decision

- **One step between runs, one place the planning rules live.** `/refine-verification` is the only plan writer. `/verify-build` never plans. That supersedes this TRD's earlier draft, in which `--fix` derived its own plan from a shared contract (owner, 2026-09-29: "keeps us from having to put the same work in two places"). The rules live in the command itself, with no separate contract file.
- **A refine command, not a skill.** It follows `/refine-prd` and `/refine-trd`: interactive by default, `--auto` for unattended runs, and the same `--auto` verdicts. An `OWNER-CALL` is decided anyway and recorded for review.
  - It keeps `disable-model-invocation: true`, because nothing chains it.
  - Its frontmatter carries `category: verification`.
  - It supersedes decision D12 of `docs/TRD/verification-fix-loop.md` ("a skill conducts the chat"). D12 is amended in that TRD inline.
- **`--fix` becomes the default, symmetric with `/implement-trd`'s `--verify`** (4.8.0, VCON O6).
  - This is a breaking change to `/verify-build`'s default and is labelled as such.
  - `--no-fix` restores report-only.
  - `--resume` still continues an interrupted verification loop and builds nothing. It stays mutually exclusive with fixing (`verify-build.md:256`). A resume is picking up a check, not starting a repair.
- **Where rulings go.**
  - An agent ruling goes into the plan's `## Owner rulings` table only, marked `decided by: agent (--auto)`, so the Judge applies it.
  - Agent rulings are never written into the PRD or TRD, which record the owner's decisions.
  - An owner ruling from interactive mode is written into the PRD or TRD, as the skill does today.
- **Access only the owner has** (a password, an account) is never guessed. Under `--auto` the criterion is marked not verifiable and the need is recorded.
- **Interactive mode asks one question per open item**, on purpose. The owner wants interaction that earns its time, with evidence for each item, not a form to fill in.

absorbed:     consuming projects keep a stale, model-invocable `verify-plan-recovery` skill after
              `/rebase-project`, which keeps any skill the plugin no longer ships
              (`rebase-project.md:358-366`) — two things writing one file, which O5 removes.
              The retired-by-name mechanism exists for commands (`rebase-project.md:430-440`).  [BLOCKS]
not absorbed: `verification-setup` gaining `--auto` — its answers are infrastructure policy for an
              owner-governed file (`constitution.md` Governance Split); an agent answering them is
              what that rule forbids

## Non-Goals

- No change to how a fix run works once it has a plan: its rounds, the stop rule, blocker promotion, slicing.
- No change to `verification-plan.md`'s six sections or to `readStopRule()`.
- No `--auto` for `verification-setup`. Neither command ever edits `.claude/rules/verification.md`.
- No credential value is written anywhere. `/refine-verification` never starts `/verify-build`.

## Verification Artifacts

None apply: there are no UI designs, interaction diagrams or data views. The surfaces are command prompts, a report renderer and docs.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Which agent answers under `--auto`? | `product-manager`, the one `/refine-trd --auto` uses for its open questions. The open items are about what a criterion should mean, not about code | owner-only |
| OQ-2 | With `--fix` the default, what does `--resume` do? | It still only continues an interrupted verification loop and builds nothing, as today. Fixing after it is a fresh `/verify-build` | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Create `packages/core/commands/refine-verification.md` and its `.claude/commands/` mirror. Frontmatter: `argument-hint: "[feature-or-trd] [--auto]"`, `category: verification`, `disable-model-invocation: true`. Content: <ul><li>a Modes table, as in `refine-trd.md` §Modes;</li><li>Inputs: the report, the state file, the discovery ledger, any existing plan, the PRD/TRD, `verification.md` and `.claude/verification-notes.md`;</li><li>Derive: move the skill's Conversation steps 1–2, as merged in PR #11;</li><li>Open items: the skill's step 3;</li><li>Interactive: one `AskUserQuestion` per open item, showing what the check saw, the criterion text, the attempts and the cause;</li><li>`--auto`: one `product-manager` subagent answers every item with `answered`, `default` or `OWNER-CALL`, per `refine-trd.md` §`--auto`; access needs become not verifiable, with the need recorded;</li><li>Writes: the plan in `verification-fix-loop.md` §3.4's shape, with a complete example plan in a fenced block; agent rulings marked `decided by: agent (--auto)` go in the plan only; the `**Agreed with**` line;</li><li>Never: the skill's Never list;</li><li>Readout: STATE opens with every ruling; NEXT is `/verify-build`; banner; `notify-complete.sh`.</li></ul>Add a Jest test that extracts the example plan and asserts `readStopRule()` parses it | O1, O2 | None | <ul><li>The file exists with those frontmatter keys and sections.</li><li>The mirror is byte-identical.</li><li>The new test passes, and fails when the example's `max-rounds:` line is removed (a temporary local change, not committed).</li><li>`verify-command-surface.test.js` passes.</li></ul> |
| FIX-002 | `/verify-build` fixes by default. <ul><li>The build-and-reverify loop runs whenever a plan exists.</li><li>`--no-fix` makes the run report-only.</li><li>With no plan, it runs one verify pass and names `/refine-verification` as NEXT, instead of today's "one round".</li><li>`--fix [plan-path]` is still accepted to name a plan.</li><li>`--resume` still builds nothing (OQ-2).</li></ul>Update `argument-hint`, the `--fix`/`--resume` section and the Autonomy section (where the plan "comes from `/refine-verification`"). Change every `verify-plan-recovery` reference in `verify-build.md` (`:78,178,254,366,418`): each NEXT after a shortfall becomes `/refine-verification`. Change `functional-verification.js:654`'s Next line to "refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`". Update `implement-trd.md` §8.1b (`:1484`) and §9 NEXT (`:1856`) to match, and its other `/verify-build --fix` mentions to `/verify-build`. Update the tests: `functional-verification.test.js:1953,1964,2017` (the negative check at 1964 must name `/verify-plan-recovery` so it can still fail), `verify-command-surface.test.js` and `discovered-ref.test.js`. Mirror to `.claude/` | O2, O3, O4 | FIX-001 | <ul><li>`grep -n verify-plan-recovery` over `packages/core/commands/verify-build.md`, `implement-trd.md` and `functional-verification.js` returns nothing.</li><li>The renderer test asserts the new Next line, and fails against the old one.</li><li>`verify-build.md`'s `argument-hint` names `--no-fix`, and its no-plan path names `/refine-verification`.</li><li>`npx jest` passes.</li><li>The mirrors are byte-identical.</li></ul> |
| FIX-003 | Remove the skill. <ul><li>Delete `packages/skills/verify-plan-recovery/` and its tests.</li><li>Drop its row from `packages/skills/framework-skills.txt`.</li><li>Add a retired-skills list to `rebase-project.md` (all three copies), beside the retired-commands one, naming `verify-plan-recovery`.</li></ul>Update the live references: <ul><li>`fix-audit.js:57`, and its mirror;</li><li>`fix-audit.test.js`: use `verification-setup` as the support-role example;</li><li>`verification-setup/SKILL.md:12,32`;</li><li>`skill-selection-instructions.md:108`;</li><li>`trd-authoring.md:618`, and its mirror;</li><li>`runtime-integrity.test.sh:369`;</li><li>`scaffold-project.test.sh:762`;</li><li>`packages/skills/README.md`;</li><li>`test/smoke/scenarios/verify-fix.sh` and `test/smoke/README.md`: comments and the fixture's `**Written**` line only.</li></ul> | O5 | FIX-001 | <ul><li>`grep -rln verify-plan-recovery packages .claude test` lists only the `rebase-project.md` copies.</li><li>`fix-audit.test.js` still proves a support-role skill is rejected as a check.</li><li>`npx jest` and the BATS battery pass.</li><li>`shellcheck` is clean on `verify-fix.sh`, which is not run.</li></ul> |
| FIX-004 | Rules and docs. <ul><li>`autonomy.md`, and its template: list `/refine-verification` beside the refine commands, exempt in interactive mode only; replace the skill's paragraph.</li><li>`command-status.md`, and its template: `/verify-build --fix` → `/verify-build`.</li><li>`router.py` FLOW hint, `process.md` and `packages/core/templates/process.md.template`: show the loop `/implement-trd` → `/refine-verification` → `/verify-build`, and `--no-fix`.</li><li>`CLAUDE.md` workflow block; `docs/guides/PROCESS.md`, `docs/guides/INSTALL.md`, `docs/reference/verification.md`, `docs/reference/README.md`, `docs/reference/implement-trd.md` and `docs/reference/agents.md`: the loop, and `/verify-build` fixing by default.</li><li>Amend D12 in `docs/TRD/verification-fix-loop.md` inline: a strike and a cross-link, in the D15 style.</li></ul> | O2, O3, O5 | FIX-001 | <ul><li>The template and vendored copies of `autonomy.md` and `command-status.md` are byte-identical.</li><li>The byte-ceiling test in `runtime-integrity.test.sh` passes (`command-status.md` ≤ 12,500; `CLAUDE.md` ≤ 15,000).</li><li>pytest passes.</li><li>`grep -c verify-plan-recovery` is 0 on every doc listed here except `verification-fix-loop.md`.</li></ul> |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/commands/refine-verification.md`, `.claude/commands/refine-verification.md`, `packages/core/lib/functional-verification.test.js`
- **Reuse:**
  - the Conversation, Writes and Never sections of `packages/skills/verify-plan-recovery/SKILL.md` as merged in PR #11 (7b1b83f) [read]
  - `refine-trd.md` §Modes and the §`--auto` verdict table [read]
  - `readStopRule` [read]
- **Replaces:** the skill's role as the plan writer (the skill itself is deleted in FIX-003)
- **Follow:**
  - `refine-trd.md`'s frontmatter conventions [read]
  - the `category:` field that rebase reads (`rebase-project.md:424-428`) [read]
- **Careful:**
  - `autonomy.md` exempts interactive mode only, so the `--auto` section must say it asks nothing [read]
  - `readStopRule` returns `null` plus errors and never defaults (`functional-verification.js:790-793`) [read]

### FIX-002
- **Touches:** `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `packages/core/lib/functional-verification.js`, `.claude/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`, `packages/core/commands/verify-command-surface.test.js`, `packages/core/lib/discovered-ref.test.js`, `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`
- **Reuse:**
  - the whole existing `--fix` round machinery, unchanged [read]
  - `/implement-trd`'s default-on `--verify` / `--no-verify` wording as the model for `--fix` / `--no-fix` [read]
- **Replaces:** the report-only default, and the no-plan "one round" branch (`verify-build.md:286,301-304`)
- **Follow:** NEXT is a single command, never a menu (`command-status.md`) [read]
- **Careful:** `verify-command-surface.test.js` asserts `/verify-build --fix` wording in 9 places. Change what it asserts, don't delete it, so it can still fail [read]

### FIX-003
- **Touches:** `packages/skills/verify-plan-recovery/`, `packages/skills/framework-skills.txt`, `packages/core/commands/rebase-project.md`, `packages/full/commands/plugin-only/rebase-project.md`, `.claude/commands/rebase-project.md`, `packages/core/lib/fix-audit.js`, `.claude/lib/fix-audit.js`, `packages/core/lib/fix-audit.test.js`, `packages/skills/verification-setup/SKILL.md`, `packages/core/templates/skill-selection-instructions.md`, `packages/core/contracts/trd-authoring.md`, `.claude/contracts/trd-authoring.md`, `test/integration/tests/runtime-integrity.test.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/skills/README.md`, `test/smoke/scenarios/verify-fix.sh`, `test/smoke/README.md`
- **Reuse:**
  - the retired-commands table in `rebase-project.md:430-440` [read]
  - `verification-setup` as the remaining support-role skill [read]
- **Replaces:** the skill directory and its tests. Delete them
- **Follow:** `framework-skills.txt`'s `<name> <role>` format [read]
- **Careful:**
  - tests that count framework skills or support-role rows change by one [inferred; grep for counts]
  - `verify-fix.sh` is a live scenario: edit it, never run it [read]

### FIX-004
- **Touches:** `.claude/rules/autonomy.md`, `packages/core/templates/claude-directory/rules/autonomy.md`, `.claude/rules/command-status.md`, `packages/core/templates/claude-directory/rules/command-status.md`, `packages/router/hooks/router.py`, `.claude/rules/process.md`, `packages/core/templates/process.md.template`, `CLAUDE.md`, `docs/guides/PROCESS.md`, `docs/guides/INSTALL.md`, `docs/reference/verification.md`, `docs/reference/README.md`, `docs/reference/implement-trd.md`, `docs/reference/agents.md`, `docs/TRD/verification-fix-loop.md`
- **Reuse:**
  - the existing refine-commands exemption paragraph in `autonomy.md` [read]
  - D15's inline-amendment style (`verification-fix-loop.md:97`) [read]
- **Replaces:** the skill paragraph in `autonomy.md`
- **Follow:** the byte ceilings held by `runtime-integrity.test.sh` [read]
- **Careful:**
  - `command-status.md` is at 12,206 of 12,500 bytes and `CLAUDE.md` at 14,961 of 15,000 [read]
  - the router hint may be asserted in `test_router.py` [inferred; grep]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| Whether an `--auto` plan closes as many criteria as the owner-agreed plan did in lightning-lane (49 → 64 of 69 met) | Needs a live run that falls short. The only sample had the owner accept every default |
| Whether the `product-manager` agent's OWNER-CALL rulings match what the owner would choose | Needs live runs. The readout surfaces every ruling so one can be corrected by re-running `/refine-verification` |
