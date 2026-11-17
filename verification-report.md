# Functional Verification Report: audit-before-functional-verification

**Source PRD**: docs/plan/audit-before-functional-verification.investigation.md
**Success definition**: .trd-state/audit-before-functional-verification/success-definition.md
**Outcome**: Stuck (no full-environment run declared)
**Reason**: 1 gap(s) still open when the run ended at iteration 2 of 3
**Criteria**: 27 total — 26 met, 1 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 26 of 27 proven — uncovered: FS-14
**Must pass**: 8 of 9 proven — unproven: FS-14 (not met)
**Diagnosis**: 1 open — 1 evidence gap — 1 evidence missing
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In a default `/implement-trd` run (not `--chained`), the code audit (`Skill(audit-build, "<trd> --prd <prd> --defer-close")`) is called after the end-of-run code review and before the `Workflow(verify-functional)` dispatch | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-default-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-2 | The audit's fix run (and any re-audit, up to the audit cap) finishes before verification starts, so the verification loop is dispatched once, on code that already carries the audit's fixes | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-default-order.txt | iteration 2 (regression pass 1) |
| FS-3 | `/implement-trd --chained` skips the audit step, so audit → fix run → audit does not recurse | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-chained-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-4 | `/implement-trd --no-verify` still runs the audit step | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-noverify-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-5 | `/audit-build --defer-close` on a passing audit runs no waived-defect gate, writes no `closed.json`, publishes nothing and opens no PR; it records a pending close (verdict, report path, `auditedCommit`, `anchorCommit` by today's rule) as a line in `audit-rounds.jsonl` carrying the round's run id and `closeDeferred: true`, and writes the records ref | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-defer-records-ref.txt | iteration 2 (regression pass 1) |
| FS-6 | `/audit-build --defer-close` ends with one `[STATUS: /audit-build] RETURN → …` line and emits no `COMMAND COMPLETE` banner, does not call `notify-complete.sh`, and sends no `PushNotification` | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-defer-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-7 | Under `--defer-close`, the non-close outcomes (re-audit, cap reached, uncovered) behave as they do today except that each ends with a RETURN line instead of a banner | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-uncovered-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-8 | Under `--defer-close`, the stale-wake check still applies, and `anchorCommit` still waits for the fix run's end-of-run review that can finish after the RETURN line | .trd-state/audit-before-functional-verification/evidence/regression-1/fs8-audit-build-grep.txt | iteration 2 (regression pass 1) |
| FS-9 | `/audit-build --close-deferred` with a pending close performs today's close tail from it — waived-defect gate, close step with `closedBy: "audit"` and the pending audit fields, commit of the TRD if needed, publish, records ref, PR per `ensemble.openPullRequest` — without re-running any verifier, then clears the pending close and ends with one RETURN line | .trd-state/audit-before-functional-verification/evidence/regression-1/pass3/p3-close-closed.json | iteration 2 (regression pass 1) |
| FS-10 | `/audit-build --close-deferred` with no pending close on record returns `RETURN → nothing to close` and closes nothing | .trd-state/audit-before-functional-verification/evidence/regression-1/p2b/fs10-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-11 | When `/implement-trd`'s audit step returned "passed, close deferred" and verification's outcome is `satisfied` with no `definition-problem` criterion, `/implement-trd` runs `audit-build --close-deferred` before its readout, and the readout's STATE says the feature is closed and names the PR (or the reason the PR was skipped or failed) | .trd-state/audit-before-functional-verification/evidence/regression-1/p2/fs11-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-12 | When the audit step returned "passed, close deferred" and verification was skipped by `--no-verify`, `/implement-trd` closes the feature through `--close-deferred` | .trd-state/audit-before-functional-verification/evidence/regression-1/p2/fs12-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-13 | A passing audit followed by a verification whose outcome is not `satisfied` (or is `satisfied` with a `definition-problem` criterion) closes nothing and opens no PR; the pending close stays on record; NEXT follows the verification outcome (`/refine-verification` → `/verify-build`, or the setup-failure fix) | .trd-state/audit-before-functional-verification/evidence/regression-1/p2b/fs13c-final.txt | iteration 2 (regression pass 1) |
| FS-15 | `/implement-trd`'s readout NEXT never names `/audit-build` merely because verification passed | .trd-state/audit-before-functional-verification/evidence/regression-1/fs15-implement-trd-grep.txt | iteration 2 (regression pass 1) |
| FS-16 | `/verify-build` with outcome `satisfied` (no `definition-problem` criterion) and a pending close on record runs `audit-build --close-deferred`, and its NEXT is shipping (`/ship-build`) or the PR step | .trd-state/audit-before-functional-verification/evidence/regression-1/p2b/fs16-tool-sequence.txt | iteration 2 (regression pass 1) |
| FS-17 | `/verify-build` with outcome `satisfied`, no pending close and no closed feature names `/audit-build` as NEXT | .trd-state/audit-before-functional-verification/evidence/regression-1/fs17-verify-build-grep.txt | iteration 2 (regression pass 1) |
| FS-18 | `/verify-build --chained`, and `/verify-build` on a sweep file, behave as they did before this change | .trd-state/audit-before-functional-verification/evidence/regression-1/fs18-verify-build-diff.txt | iteration 2 (regression pass 1) |
| FS-19 | `/audit-build` invoked by the owner with neither flag behaves as today: audits, chains its fix run, and on a pass runs the waived-defect gate, writes `closed.json` with `closedBy: "audit"`, commits the TRD, publishes, writes the records ref, opens the PR when `ensemble.openPullRequest` is `auto`, and ends with its `COMMAND COMPLETE` banner | .trd-state/audit-before-functional-verification/evidence/live/y1-standalone-order.txt | 1 |
| FS-20 | When the close follows a satisfied verification in the same run, the recorded `anchorCommit` is the head at close time, and code changed by verification's Debug stage after the audit does not invalidate the pending close | .trd-state/audit-before-functional-verification/evidence/regression-1/p2b/fs23b-state/closed.json | iteration 2 (regression pass 1) |
| FS-21 | A pending close is superseded by any later audit round, and becomes stale when the TRD has changed since the audit (its TRD hash, taken after the fix run, no longer matches); neither is closed from | .trd-state/audit-before-functional-verification/evidence/regression-1/fs21-22-pending-close.txt | iteration 2 (regression pass 1) |
| FS-22 | `audit-rounds.js` (source `packages/core/lib/`, mirror `.claude/lib/`) offers a `pending-close` CLI verb that reports the pending close recorded by a `--defer-close` round, folding a round's lines by run id | .trd-state/audit-before-functional-verification/evidence/regression-1/fs21-22-pending-close.txt | iteration 2 (regression pass 1) |
| FS-23 | The waived-defect gate runs after verification (inside `--close-deferred`), so it sees and files the failures verification waived under `Blocking: must-pass only` | .trd-state/audit-before-functional-verification/evidence/regression-1/p2b/fs23a-final.txt | iteration 2 (regression pass 1) |
| FS-24 | The pending close and other run records go to the feature's records ref and are never committed on the branch | .trd-state/audit-before-functional-verification/evidence/regression-1/fs24-records-ref-b.txt | iteration 2 (regression pass 1) |
| FS-25 | Every edited command is byte-identical between `packages/core/commands/` and `.claude/commands/`, `audit-rounds.js` is identical between `packages/core/lib/` and `.claude/lib/`, and `packages/full/` is refreshed by the repo's existing sync | .trd-state/audit-before-functional-verification/evidence/regression-1/fs25-mirror-cmp.txt | iteration 2 (regression pass 1) |
| FS-26 | The command text and the docs that describe the order state audit-first, and a grep finds no command text still saying verification runs before the audit | .trd-state/audit-before-functional-verification/evidence/fs26-grep-v2.txt | 2 |
| FS-27 | The tests that pin the order assert audit-first, and `npx jest` and `bats` for the touched command-surface tests pass | .trd-state/audit-before-functional-verification/evidence/regression-1/fs27-jest.txt | iteration 2 (regression pass 1) |

## Not Met

| ID | Statement | Kind | Tier 1 | Reason | Blocker | Attempts |
|----|-----------|------|--------|--------|---------|----------|
| FS-14 | When the audit does not pass, `/implement-trd` closes nothing, and NEXT follows the audit's own result (cap reached → `/close-feature`, uncovered → design work); a re-audit runs inside the audit step rather than being handed to the owner as a standalone `/audit-build` | evidence gap | fail | No evidence was captured this iteration at HEAD 37583973: the Exercise driver for two failed-audit /implement-trd fixture runs (evidence/live/z3.sh) had not finished when the pass ended, so tier 1 found no artifact. The defect seen last iteration (NEXT handing the owner a standalone /audit-build after an 'open' audit return) is neither confirmed nor shown fixed; the cap-reached branch has never been exercised. |  |  |

## Not Verifiable

_None._

## Regression pass

After the loop exited, the criteria whose covered files changed (or whose coverage was unknown) were re-checked against the finished build.

### Round 1 (iteration 2)

Scope: targeted — re-checked 24: covers-changed 7, no-covers 17

| ID | Why re-checked | Changed files |
|----|----------------|---------------|
| FS-1 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/audit-first-order.test.js, packages/core/commands/implement-trd.md |
| FS-2 | covers-changed | .claude/commands/implement-trd.md, packages/core/commands/audit-first-order.test.js, packages/core/commands/implement-trd.md |
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
| FS-27 | no-covers |  |

Caught: _none._

Not re-walked (covered files unchanged): FS-19, FS-26

Changed files no criterion covers: _none._


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | 1 | 7 | 1 |

| ID | Statement | Status | Cause | Stop reason |
|----|-----------|--------|-------|-------------|
| FS-14 | When the audit does not pass, /implement-trd closes nothing, and NEXT follows the audit's own result (cap reached → /close-feature, uncovered → design work); a re-audit runs inside the audit step rather than being handed to the owner as a standalone /audit-build | not_met | evidence missing | not buildable by cause: evidence missing — re-verified each round, never built. The Debug stage fixed the defect it saw in iteration 1 (an `open` audit return was followed by a standalone /audit-build in NEXT; commit 0abb1b75), but the fixture runs meant to re-prove it did not finish before the pass ended |

