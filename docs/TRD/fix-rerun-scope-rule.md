# TRD: fix-rerun-scope-rule

**Source PRD**: None — small change decided in session (GitHub issue #157, owner ruling 2026-11-16)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | One shared contract, `packages/core/contracts/rerun-scope.md`, states the three scopes (none, targeted, full), the anchor each re-running command reads and what "related" means for it, the readout line, and the unsure-case behaviour (ask interactively, COMMAND STUCK unattended) | issue #157 Expected, 2026-11-16 | yes |
| O2 | Each of `/verify-build`, `/refine-verification`, `/audit-build`, `/ship-build` and `/implement-trd` has a step that reads the contract at the point it would re-run and records the choice; the custody gate and `wait-ci` contracts reference it | issue #157 Where, 2026-11-16 | yes |
| O3 | A plain `/verify-build` after a session restart continues the open criteria from `verification-state.json` (outcome `null`) instead of restarting the loop over every criterion | issue #157 Expected, last bullet | yes |
| O4 | A fact-only helper `.claude/lib/rerun-scope.js` lists files changed since an anchor, classed record/doc/framework/test/ci/deps/code; it decides nothing and reports an unreadable anchor as unreadable | issue #157 open question, default taken 2026-11-16 | |

## Intended Change

Prose contract plus a fact-only helper, referenced from five commands. The mechanisms that apply a
scope (`custody.js`, `verify-functional.js`, the CI-proof mechanism, the phase-gate battery) are
NOT changed: issues #153, #154, #155 and #156 land after this and are built separately.

## Decision

The scope is the model's judgment (owner ruling), made from facts a helper lists. Unattended means
a chained call, an automatic mode or a non-interactive session: COMMAND STUCK with the question and
a proposed default; otherwise ask once. No command detects Forge specifically. When unsure, never
default to full.

## Non-Goals

Changing `custody.js:501`, `verify-functional.js:3250-3256`, the CI-proof mechanism or the battery
(issues #153 to #156).

## Verification Artifacts

None apply — prose contracts, command prompts and one small library; Jest proves them.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | How does a command know it is unattended? | chained, automatic or non-interactive | none |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| RS-001 | Add `packages/core/lib/rerun-scope.js` (`changed --anchor`) with a Jest test; mirror to `.claude/lib/` and link in `packages/full/lib/` | O4 | None | the test fails if an unknown anchor reports an empty change instead of `readable: false`; a docs-only diff reports `counts.code` 0 |
| RS-002 | Write `packages/core/contracts/rerun-scope.md` and `rerun-scope.test.js`; mirror to `.claude/contracts/` | O1 | RS-001 | the test fails if any of the three scopes, an anchor row, the readout line, or the ask/STUCK behaviour is removed |
| RS-003 | Add the scope step to the five commands, the custody gate and `wait-ci`; add the restarted-run rule to `verify-build.md`; mirror to `.claude/commands/` and `.claude/contracts/` | O2, O3 | RS-002 | `grep -q rerun-scope` passes for each of the five commands in both copies; `verify-build.md` says a state file with `outcome: null` is resumed |

## Task Grounding

### RS-001
- **Touches:** `packages/core/lib/rerun-scope.js`, `packages/core/lib/rerun-scope.test.js`
- **Reuse:** `classifyPath` in `packages/core/lib/custody.js` and `isRecordFile` in `packages/core/lib/record-files.js` [read]
- **Replaces:** nothing [read]
- **Follow:** the one-JSON-line CLI shape of `packages/core/lib/flaky-ci.js` [read]
- **Careful:** an anchor that is not an ancestor must be unreadable, never an empty diff [ran]

### RS-002
- **Touches:** `packages/core/contracts/rerun-scope.md`, `packages/core/contracts/rerun-scope.test.js`
- **Reuse:** the mirror and content assertions in `packages/core/contracts/functional-verification.test.js` [read]
- **Replaces:** nothing [read]
- **Follow:** contracts live in `packages/core/contracts/` and are copied to `.claude/contracts/` [read]
- **Careful:** the verification report records no commit; the anchor is found from its finish time [read]

### RS-003
- **Touches:** `packages/core/commands/verify-build.md`, `packages/core/commands/refine-verification.md`, `packages/core/commands/audit-build.md`, `packages/core/commands/ship-build.md`, `packages/core/commands/implement-trd.md`, `packages/core/contracts/ship-custody-gate.md`, `packages/core/contracts/ship-primitive-wait-ci.md`
- **Reuse:** the existing `--resume` mechanism in `verify-build.md` for continuing open criteria [read]
- **Replaces:** nothing [read]
- **Follow:** `.claude/commands/` byte-identical to `packages/core/commands/` (several prose tests assert it) [ran]
- **Careful:** do not touch `custody.js`, `verify-functional.js` or the battery itself (issues #153 to #156) [read]

## Could Not Verify

- A live `/verify-build` session after a restart was not run; the restart rule is proven by prose assertions only.
