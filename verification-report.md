# Functional Verification Report: audit-before-functional-verification

**Source PRD**: docs/plan/audit-before-functional-verification.investigation.md
**Success definition**: .trd-state/audit-before-functional-verification/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 27 total — 27 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 27 of 27 proven — uncovered: none
**Must pass**: 9 of 9 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In a default `/implement-trd` run (not `--chained`), the code audit (`Skill(audit-build, "<trd> --prd <prd> --defer-close")`) is called after the end-of-run code review and before the `Workflow(verify-functional)` dispatch | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-default-order.txt | iteration 2 (regression pass 2) |
| FS-2 | The audit's fix run (and any re-audit, up to the audit cap) finishes before verification starts, so the verification loop is dispatched once, on code that already carries the audit's fixes | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-default-order.txt | iteration 2 (regression pass 2) |
| FS-3 | `/implement-trd --chained` skips the audit step, so audit → fix run → audit does not recurse | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-chained-tool-sequence.txt | iteration 2 (regression pass 2) |
| FS-4 | `/implement-trd --no-verify` still runs the audit step | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-noverify-tool-sequence.txt | iteration 2 (regression pass 2) |
| FS-5 | `/audit-build --defer-close` on a passing audit runs no waived-defect gate, writes no `closed.json`, publishes nothing and opens no PR; it records a pending close (verdict, report path, `auditedCommit`, `anchorCommit` by today's rule) as a line in `audit-rounds.jsonl` carrying the round's run id and `closeDeferred: true`, and writes the records ref | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-defer-audit-rounds.jsonl | iteration 2 (regression pass 2) |
| FS-6 | `/audit-build --defer-close` ends with one `[STATUS: /audit-build] RETURN → …` line and emits no `COMMAND COMPLETE` banner, does not call `notify-complete.sh`, and sends no `PushNotification` | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-defer-final.txt | iteration 2 (regression pass 2) |
| FS-7 | Under `--defer-close`, the non-close outcomes (re-audit, cap reached, uncovered) behave as they do today except that each ends with a RETURN line instead of a banner | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs7-nonclose-branches.txt | iteration 2 (regression pass 2) |
| FS-8 | Under `--defer-close`, the stale-wake check still applies, and `anchorCommit` still waits for the fix run's end-of-run review that can finish after the RETURN line | .trd-state/audit-before-functional-verification/evidence/regression-2/fs8-audit-build-defer-close.txt | iteration 2 (regression pass 2) |
| FS-9 | `/audit-build --close-deferred` with a pending close performs today's close tail from it — waived-defect gate, close step with `closedBy: "audit"` and the pending audit fields, commit of the TRD if needed, publish, records ref, PR per `ensemble.openPullRequest` — without re-running any verifier, then clears the pending close and ends with one RETURN line | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-close-closed.json | iteration 2 (regression pass 2) |
| FS-10 | `/audit-build --close-deferred` with no pending close on record returns `RETURN → nothing to close` and closes nothing | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs10-final.txt | iteration 2 (regression pass 2) |
| FS-11 | When `/implement-trd`'s audit step returned "passed, close deferred" and verification's outcome is `satisfied` with no `definition-problem` criterion, `/implement-trd` runs `audit-build --close-deferred` before its readout, and the readout's STATE says the feature is closed and names the PR (or the reason the PR was skipped or failed) | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs11-tool-sequence.txt | iteration 2 (regression pass 2) |
| FS-12 | When the audit step returned "passed, close deferred" and verification was skipped by `--no-verify`, `/implement-trd` closes the feature through `--close-deferred` | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs12-state/audit-rounds.jsonl | iteration 2 (regression pass 2) |
| FS-13 | A passing audit followed by a verification whose outcome is not `satisfied` (or is `satisfied` with a `definition-problem` criterion) closes nothing and opens no PR; the pending close stays on record; NEXT follows the verification outcome (`/refine-verification` → `/verify-build`, or the setup-failure fix) | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs13-pending.txt | iteration 2 (regression pass 2) |
| FS-14 | When the audit does not pass, `/implement-trd` closes nothing, and NEXT follows the audit's own result (cap reached → `/close-feature`, uncovered → design work); a re-audit runs inside the audit step rather than being handed to the owner as a standalone `/audit-build` | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-nv-final.txt | iteration 2 (regression pass 2) |
| FS-15 | `/implement-trd`'s readout NEXT never names `/audit-build` merely because verification passed | .trd-state/audit-before-functional-verification/evidence/regression-2/fs15-implement-trd-step9.txt | iteration 2 (regression pass 2) |
| FS-16 | `/verify-build` with outcome `satisfied` (no `definition-problem` criterion) and a pending close on record runs `audit-build --close-deferred`, and its NEXT is shipping (`/ship-build`) or the PR step | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs16-tool-sequence.txt | iteration 2 (regression pass 2) |
| FS-17 | `/verify-build` with outcome `satisfied`, no pending close and no closed feature names `/audit-build` as NEXT | .trd-state/audit-before-functional-verification/evidence/regression-2/fs17-verify-build.txt | iteration 2 (regression pass 2) |
| FS-18 | `/verify-build --chained`, and `/verify-build` on a sweep file, behave as they did before this change | .trd-state/audit-before-functional-verification/evidence/regression-2/fs18-verify-build-diff-main.txt | iteration 2 (regression pass 2) |
| FS-19 | `/audit-build` invoked by the owner with neither flag behaves as today: audits, chains its fix run, and on a pass runs the waived-defect gate, writes `closed.json` with `closedBy: "audit"`, commits the TRD, publishes, writes the records ref, opens the PR when `ensemble.openPullRequest` is `auto`, and ends with its `COMMAND COMPLETE` banner | .trd-state/audit-before-functional-verification/evidence/live/y1-standalone-order.txt | 1 |
| FS-20 | When the close follows a satisfied verification in the same run, the recorded `anchorCommit` is the head at close time, and code changed by verification's Debug stage after the audit does not invalidate the pending close | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs23b-state/closed.json | iteration 2 (regression pass 2) |
| FS-21 | A pending close is superseded by any later audit round, and becomes stale when the TRD has changed since the audit (its TRD hash, taken after the fix run, no longer matches); neither is closed from | .trd-state/audit-before-functional-verification/evidence/regression-2/fs21-22-pending-close-cli.txt | iteration 2 (regression pass 2) |
| FS-22 | `audit-rounds.js` (source `packages/core/lib/`, mirror `.claude/lib/`) offers a `pending-close` CLI verb that reports the pending close recorded by a `--defer-close` round, folding a round's lines by run id | .trd-state/audit-before-functional-verification/evidence/regression-2/fs21-22-pending-close-cli.txt | iteration 2 (regression pass 2) |
| FS-23 | The waived-defect gate runs after verification (inside `--close-deferred`), so it sees and files the failures verification waived under `Blocking: must-pass only` | .trd-state/audit-before-functional-verification/evidence/regression-2/r2-fs23a-final.txt | iteration 2 (regression pass 2) |
| FS-24 | The pending close and other run records go to the feature's records ref and are never committed on the branch | .trd-state/audit-before-functional-verification/evidence/regression-2/fs24-records-ref.txt | iteration 2 (regression pass 2) |
| FS-25 | Every edited command is byte-identical between `packages/core/commands/` and `.claude/commands/`, `audit-rounds.js` is identical between `packages/core/lib/` and `.claude/lib/`, and `packages/full/` is refreshed by the repo's existing sync | .trd-state/audit-before-functional-verification/evidence/regression-2/fs25-mirror-identity.txt | iteration 2 (regression pass 2) |
| FS-26 | The command text and the docs that describe the order state audit-first, and a grep finds no command text still saying verification runs before the audit | .trd-state/audit-before-functional-verification/evidence/regression-2/fs26-grep-regression2.txt | iteration 2 (regression pass 2) |
| FS-27 | The tests that pin the order assert audit-first, and `npx jest` and `bats` for the touched command-surface tests pass | .trd-state/audit-before-functional-verification/evidence/regression-2/fs27-jest.txt | iteration 2 (regression pass 2) |

## Not Met

_None._

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| readout-pr-reason-not-in-state | FS-11 | 1 (FS-11) | closed at iteration 2 |
| step9-next-audit-build-after-open-audit | FS-14 | 1 (FS-14) | closed at iteration 2 |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

Scope: targeted — re-checked 25: covers-changed 7, no-covers 18

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-2 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-3 | no-covers |  |
| FS-4 | no-covers |  |
| FS-5 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-6 | no-covers |  |
| FS-7 | no-covers |  |
| FS-8 | no-covers |  |
| FS-9 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-10 | no-covers |  |
| FS-12 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-13 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-14 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-15 | no-covers |  |
| FS-16 | no-covers |  |
| FS-17 | no-covers |  |
| FS-18 | no-covers |  |
| FS-20 | no-covers |  |
| FS-21 | no-covers |  |
| FS-22 | no-covers |  |
| FS-23 | no-covers |  |
| FS-24 | no-covers |  |
| FS-25 | no-covers |  |
| FS-26 | no-covers |  |
| FS-27 | no-covers |  |

Caught: FS-14
Repair round: causes step9-next-audit-build-after-open-audit; files changed: .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md

### Round 2 (iteration 2)

Scope: targeted — re-checked 26: covers-changed 7, no-covers 18, sent-to-debug 1

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-2 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-3 | no-covers |  |
| FS-4 | no-covers |  |
| FS-5 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-6 | no-covers |  |
| FS-7 | no-covers |  |
| FS-8 | no-covers |  |
| FS-9 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-10 | no-covers |  |
| FS-11 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-12 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-13 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/implement-trd.md |
| FS-14 | sent-to-debug |  |
| FS-15 | no-covers |  |
| FS-16 | no-covers |  |
| FS-17 | no-covers |  |
| FS-18 | no-covers |  |
| FS-20 | no-covers |  |
| FS-21 | no-covers |  |
| FS-22 | no-covers |  |
| FS-23 | no-covers |  |
| FS-24 | no-covers |  |
| FS-25 | no-covers |  |
| FS-26 | no-covers |  |
| FS-27 | no-covers |  |

Caught: _none._

Not re-walked (covered files unchanged): FS-19

Changed files no criterion covers: _none._


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | 0 | 1 | 0 |

_None still open._

