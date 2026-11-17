# Functional Verification Report: audit-before-functional-verification

**Source PRD**: docs/plan/audit-before-functional-verification.investigation.md
**Success definition**: .trd-state/audit-before-functional-verification/success-definition.md
**Outcome**: exit-stalled (no full-environment run declared)
**Reason**: iteration closed no gaps and no causes — remediation is not converging
**Criteria**: 27 total — 19 met, 8 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 19 of 27 proven — uncovered: FS-1, FS-3, FS-4, FS-5, FS-6, FS-9, FS-14, FS-24
**Must pass**: 5 of 9 proven — unproven: FS-1 (not met), FS-5 (not met), FS-9 (not met), FS-14 (not met)

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-2 | The audit's fix run (and any re-audit, up to the audit cap) finishes before verification starts, so the verification loop is dispatched once, on code that already carries the audit's fixes | .trd-state/audit-before-functional-verification/evidence/live/x2-default-order.txt | 2 |
| FS-7 | Under `--defer-close`, the non-close outcomes (re-audit, cap reached, uncovered) behave as they do today except that each ends with a RETURN line instead of a banner | .trd-state/audit-before-functional-verification/evidence/regression-1/fs7-nonclose-prose.txt | iteration 2 (regression pass 1) |
| FS-8 | Under `--defer-close`, the stale-wake check still applies, and `anchorCommit` still waits for the fix run's end-of-run review that can finish after the RETURN line | .trd-state/audit-before-functional-verification/evidence/regression-1/fs8-defer-close-section.txt | iteration 2 (regression pass 1) |
| FS-10 | `/audit-build --close-deferred` with no pending close on record returns `RETURN → nothing to close` and closes nothing | .trd-state/audit-before-functional-verification/evidence/regression-1/fs10-final.txt | iteration 2 (regression pass 1) |
| FS-11 | When `/implement-trd`'s audit step returned "passed, close deferred" and verification's outcome is `satisfied` with no `definition-problem` criterion, `/implement-trd` runs `audit-build --close-deferred` before its readout, and the readout's STATE says the feature is closed and names the PR (or the reason the PR was skipped or failed) | .trd-state/audit-before-functional-verification/evidence/regression-1/fs11-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-12 | When the audit step returned "passed, close deferred" and verification was skipped by `--no-verify`, `/implement-trd` closes the feature through `--close-deferred` | .trd-state/audit-before-functional-verification/evidence/regression-1/fs12-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-13 | A passing audit followed by a verification whose outcome is not `satisfied` (or is `satisfied` with a `definition-problem` criterion) closes nothing and opens no PR; the pending close stays on record; NEXT follows the verification outcome (`/refine-verification` → `/verify-build`, or the setup-failure fix) | .trd-state/audit-before-functional-verification/evidence/regression-1/fs13b-pending-close.txt | iteration 2 (regression pass 1) |
| FS-15 | `/implement-trd`'s readout NEXT never names `/audit-build` merely because verification passed | .trd-state/audit-before-functional-verification/evidence/regression-1/fs15-implement-next.txt | iteration 2 (regression pass 1) |
| FS-16 | `/verify-build` with outcome `satisfied` (no `definition-problem` criterion) and a pending close on record runs `audit-build --close-deferred`, and its NEXT is shipping (`/ship-build`) or the PR step | .trd-state/audit-before-functional-verification/evidence/live/x2-fs16-evidence.txt | 2 |
| FS-17 | `/verify-build` with outcome `satisfied`, no pending close and no closed feature names `/audit-build` as NEXT | .trd-state/audit-before-functional-verification/evidence/regression-1/fs17-verify-build-next.txt | iteration 2 (regression pass 1) |
| FS-18 | `/verify-build --chained`, and `/verify-build` on a sweep file, behave as they did before this change | .trd-state/audit-before-functional-verification/evidence/regression-1/fs18-verify-build-diff.txt | iteration 2 (regression pass 1) |
| FS-19 | `/audit-build` invoked by the owner with neither flag behaves as today: audits, chains its fix run, and on a pass runs the waived-defect gate, writes `closed.json` with `closedBy: "audit"`, commits the TRD, publishes, writes the records ref, opens the PR when `ensemble.openPullRequest` is `auto`, and ends with its `COMMAND COMPLETE` banner | .trd-state/audit-before-functional-verification/evidence/live/x2-fs19-evidence.txt | 2 |
| FS-20 | When the close follows a satisfied verification in the same run, the recorded `anchorCommit` is the head at close time, and code changed by verification's Debug stage after the audit does not invalidate the pending close | .trd-state/audit-before-functional-verification/evidence/regression-1/fs23b-state/closed.json | iteration 2 (regression pass 1) |
| FS-21 | A pending close is superseded by any later audit round, and becomes stale when the TRD has changed since the audit (its TRD hash, taken after the fix run, no longer matches); neither is closed from | .trd-state/audit-before-functional-verification/evidence/regression-1/fs21-fs22-pending-close-cli.txt | iteration 2 (regression pass 1) |
| FS-22 | `audit-rounds.js` (source `packages/core/lib/`, mirror `.claude/lib/`) offers a `pending-close` CLI verb that reports the pending close recorded by a `--defer-close` round, folding a round's lines by run id | .trd-state/audit-before-functional-verification/evidence/regression-1/fs21-fs22-pending-close-cli.txt | iteration 2 (regression pass 1) |
| FS-23 | The waived-defect gate runs after verification (inside `--close-deferred`), so it sees and files the failures verification waived under `Blocking: must-pass only` | .trd-state/audit-before-functional-verification/evidence/regression-1/fs23a-final.txt | iteration 2 (regression pass 1) |
| FS-25 | Every edited command is byte-identical between `packages/core/commands/` and `.claude/commands/`, `audit-rounds.js` is identical between `packages/core/lib/` and `.claude/lib/`, and `packages/full/` is refreshed by the repo's existing sync | .trd-state/audit-before-functional-verification/evidence/regression-1/fs25-cmp.txt | iteration 2 (regression pass 1) |
| FS-26 | The command text and the docs that describe the order state audit-first, and a grep finds no command text still saying verification runs before the audit | .trd-state/audit-before-functional-verification/evidence/regression-1/fs26-grep.txt | iteration 2 (regression pass 1) |
| FS-27 | The tests that pin the order assert audit-first, and `npx jest` and `bats` for the touched command-surface tests pass | .trd-state/audit-before-functional-verification/evidence/regression-1/fs27-jest.txt | iteration 2 (regression pass 1) |

## Not Met

| ID | Statement | Kind | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|------|--------|--------|---------|----------|
| FS-1 | In a default `/implement-trd` run (not `--chained`), the code audit (`Skill(audit-build, "<trd> --prd <prd> --defer-close")`) is called after the end-of-run code review and before the `Workflow(verify-functional)` dispatch | evidence gap |  | Tier 1 failed (no artifact): the live default /implement-trd run in this regression pass had not started when the pass ended, so no transcript at HEAD shows the audit call landing between the code review and the verify-functional dispatch. Nothing seen shows the build misbehaving. |  | iter 1: met; iter 2: not_met |
| FS-3 | `/implement-trd --chained` skips the audit step, so audit → fix run → audit does not recurse | evidence gap |  | Tier 1 failed (no artifact): the live --chained run had not finished when the pass ended, so no complete tool sequence was captured to show the audit step skipped. Nothing seen shows the build misbehaving. |  | iter 1: met; iter 2: not_met |
| FS-4 | `/implement-trd --no-verify` still runs the audit step | evidence gap |  | Tier 1 failed (no artifact): the live --no-verify run had not started when the pass ended, so no transcript shows the audit call without a verify-functional dispatch. (A separate --no-verify run, FS-12, did call the audit, but it was not claimed for this criterion.) |  | iter 1: met; iter 2: not_met |
| FS-5 | `/audit-build --defer-close` on a passing audit runs no waived-defect gate, writes no `closed.json`, publishes nothing and opens no PR; it records a pending close (verdict, report path, `auditedCommit`, `anchorCommit` by today's rule) as a line in `audit-rounds.jsonl` carrying the round's run id and `closeDeferred: true`, and writes the records ref | evidence gap |  | Tier 1 failed (no artifact): the live standalone --chained --defer-close audit had not run, so there is no fresh audit-rounds.jsonl line with closeDeferred true and the four close fields claimed for this criterion. |  | iter 1: met; iter 2: not_met |
| FS-6 | `/audit-build --defer-close` ends with one `[STATUS: /audit-build] RETURN → …` line and emits no `COMMAND COMPLETE` banner, does not call `notify-complete.sh`, and sends no `PushNotification` | build defect | pass | The --defer-close audit made its Skill call but never printed a '[STATUS: /audit-build] RETURN ->' line, even with the strengthened prose in the slot. There was correctly no banner, notify-complete or PushNotification, but the required RETURN terminator is missing, and it still varies from run to run. |  | iter 1: not_met; iter 2: not_met |
| FS-9 | `/audit-build --close-deferred` with a pending close performs today's close tail from it — waived-defect gate, close step with `closedBy: "audit"` and the pending audit fields, commit of the TRD if needed, publish, records ref, PR per `ensemble.openPullRequest` — without re-running any verifier, then clears the pending close and ends with one RETURN line | evidence gap |  | Tier 1 failed (no artifact): the live --chained --close-deferred run depended on a defer-close run that had not run, so there is no fresh closed.json or transcript showing the close tail performed without a verifier and the pending close cleared. |  | iter 1: met; iter 2: not_met |
| FS-14 | When the audit does not pass, `/implement-trd` closes nothing, and NEXT follows the audit's own result (cap reached → `/close-feature`, uncovered → design work); a re-audit runs inside the audit step rather than being handed to the owner as a standalone `/audit-build` | build defect | pass | The audit found an uncovered requirement (FR-3, verdict 'do not proceed'). The run correctly closed nothing and did not hand off a standalone /audit-build, but it still dispatched verification, and NEXT followed verification's outcome (/refine-verification then /verify-build) instead of the audit's result, which for an uncovered requirement is design work. The cap-reached branch was not exercised. |  | iter 1: not_met; iter 2: not_met |
| FS-24 | The pending close and other run records go to the feature's records ref and are never committed on the branch | evidence gap |  | Tier 1 failed: the claimed locator "records(audit-before-functional-verification)" is not in the artifact, so the claim could not be anchored. Not ruled on content. |  | iter 1: met; iter 2: not_met |

## Causes

| Cause | Representative | Members | Status |
|-------|----------------|---------|--------|
| defer-close-return-line-not-printed | FS-6 | 1 (FS-6) | open |
| failed-audit-next-follows-verification | FS-14 | 1 (FS-14) | open |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

Scope: targeted — re-checked 22: covers-changed 6, no-covers 16

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/audit-first-order.test.js, packages/core/commands/implement-trd.md |
| FS-3 | no-covers |  |
| FS-4 | no-covers |  |
| FS-5 | covers-changed | .claude/commands/audit-build.md, .claude/commands/implement-trd.md, packages/core/commands/audit-build.md, packages/core/commands/implement-trd.md |
| FS-7 | no-covers |  |
| FS-8 | no-covers |  |
| FS-9 | covers-changed | .claude/commands/audit-build.md, .claude/commands/implement-trd.md, packages/core/commands/audit-build.md, packages/core/commands/implement-trd.md |
| FS-10 | no-covers |  |
| FS-11 | covers-changed | .claude/commands/audit-build.md, .claude/commands/implement-trd.md, packages/core/commands/audit-build.md, packages/core/commands/implement-trd.md |
| FS-12 | covers-changed | .claude/commands/audit-build.md, .claude/commands/implement-trd.md, packages/core/commands/audit-build.md, packages/core/commands/implement-trd.md |
| FS-13 | covers-changed | .claude/commands/audit-build.md, .claude/commands/implement-trd.md, packages/core/commands/audit-build.md, packages/core/commands/implement-trd.md |
| FS-15 | no-covers |  |
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

Not re-walked (covered files unchanged): FS-2, FS-16, FS-19

Changed files no criterion covers: _none._

Captures the pass could not make (recorded, not retried):

| ID | Statement | Reason |
|----|-----------|--------|
| FS-1 | In a default `/implement-trd` run (not `--chained`), the code audit (`Skill(audit-build, "<trd> --prd <prd> --defer-close")`) is called after the end-of-run code review and before the `Workflow(verify-functional)` dispatch | Tier 1 failed (no artifact): the live default /implement-trd run in this regression pass had not started when the pass ended, so no transcript at HEAD shows the audit call landing between the code review and the verify-functional dispatch. Nothing seen shows the build misbehaving. |
| FS-3 | `/implement-trd --chained` skips the audit step, so audit → fix run → audit does not recurse | Tier 1 failed (no artifact): the live --chained run had not finished when the pass ended, so no complete tool sequence was captured to show the audit step skipped. Nothing seen shows the build misbehaving. |
| FS-4 | `/implement-trd --no-verify` still runs the audit step | Tier 1 failed (no artifact): the live --no-verify run had not started when the pass ended, so no transcript shows the audit call without a verify-functional dispatch. (A separate --no-verify run, FS-12, did call the audit, but it was not claimed for this criterion.) |
| FS-5 | `/audit-build --defer-close` on a passing audit runs no waived-defect gate, writes no `closed.json`, publishes nothing and opens no PR; it records a pending close (verdict, report path, `auditedCommit`, `anchorCommit` by today's rule) as a line in `audit-rounds.jsonl` carrying the round's run id and `closeDeferred: true`, and writes the records ref | Tier 1 failed (no artifact): the live standalone --chained --defer-close audit had not run, so there is no fresh audit-rounds.jsonl line with closeDeferred true and the four close fields claimed for this criterion. |
| FS-9 | `/audit-build --close-deferred` with a pending close performs today's close tail from it — waived-defect gate, close step with `closedBy: "audit"` and the pending audit fields, commit of the TRD if needed, publish, records ref, PR per `ensemble.openPullRequest` — without re-running any verifier, then clears the pending close and ends with one RETURN line | Tier 1 failed (no artifact): the live --chained --close-deferred run depended on a defer-close run that had not run, so there is no fresh closed.json or transcript showing the close tail performed without a verifier and the pending close cleared. |
| FS-24 | The pending close and other run records go to the feature's records ref and are never committed on the branch | Tier 1 failed: the claimed locator "records(audit-before-functional-verification)" is not in the artifact, so the claim could not be anchored. Not ruled on content. |

