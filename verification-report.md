# Functional Verification Report: audit-before-functional-verification

**Source PRD**: docs/plan/audit-before-functional-verification.investigation.md
**Success definition**: .trd-state/audit-before-functional-verification/success-definition.md
**Outcome**: Satisfied (2 evidence gaps — definition problem) (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 24 total — 22 met, 2 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 22 of 24 proven — uncovered: FS-4, FS-23
**Must pass**: 9 of 9 proven
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | In a default `/implement-trd` run (no `--chained`), the code audit runs as `Skill(audit-build)` with `--defer-close`, after the end-of-run `/code-review` and before the `Workflow(verify-functional)` dispatch | .trd-state/audit-before-functional-verification/evidence/live/slot1-tool-sequence.txt | 1 |
| FS-2 | When the audit's fix run (`/implement-trd --reconcile --chained`) changes code, those changes are on the branch before the functional-verification loop starts, so verification runs on code that already carries the audit's fixes | .trd-state/audit-before-functional-verification/evidence/live/slot1-git-log.txt | 1 |
| FS-3 | A default `/implement-trd` run dispatches the functional-verification loop once, after the audit step has returned, so verification evidence is produced once, on the final code | .trd-state/audit-before-functional-verification/evidence/live/slot1-tool-sequence.txt | 1 |
| FS-5 | `/implement-trd --chained` skips the audit step, so implement-trd -> audit-build -> implement-trd --reconcile --chained does not recurse | .trd-state/audit-before-functional-verification/evidence/static/implement-trd-step73.txt | 1 |
| FS-6 | `/implement-trd --no-verify` still runs the audit step; only verification is skipped | .trd-state/audit-before-functional-verification/evidence/live/fs6-no-verify-evidence.txt | 2 |
| FS-7 | `/audit-build --defer-close` on a passing audit (where `decide` returns `close: true`) runs no waived-defect gate, writes no `closed.json`, publishes nothing and opens no PR | .trd-state/audit-before-functional-verification/evidence/live/slot1-closed-json-timeline.txt | 1 |
| FS-8 | `/audit-build --defer-close` on a passing audit records a pending close carrying the verdict, report path, `auditedCommit` and `anchorCommit` (computed by today's rule) in the feature's run records, and writes the records ref | .trd-state/audit-before-functional-verification/evidence/fs8-audit-rounds.jsonl | 1 |
| FS-9 | `/audit-build --defer-close` ends with exactly one `[STATUS: /audit-build] RETURN →` line (passed, close deferred; re-audit needed; cap reached; open: <why>; or STUCK: <why>) instead of a COMMAND COMPLETE banner, `notify-complete.sh` or `PushNotification` | .trd-state/audit-before-functional-verification/evidence/fs8-defer-close.transcript.txt | 1 |
| FS-10 | Under `--defer-close`, the non-close branches (re-audit, cap reached, uncovered) behave as they do today, except that each returns a RETURN line instead of printing a banner | .trd-state/audit-before-functional-verification/evidence/fs-s/FS-10-11-audit-build.diff | 1 |
| FS-11 | `/audit-build`'s stale-wake check, and the wait for the fix run's §7.2 review (which can finish after the RETURN line; `anchorCommit` waits for it), still apply inside `--defer-close` | .trd-state/audit-before-functional-verification/evidence/fs-s/FS-10-11-audit-build.diff | 1 |
| FS-12 | `/audit-build --close-deferred` reads the pending close and performs today's close tail from it: waived-defect gate, close step with `closedBy: "audit"` and the pending audit fields, commit of the TRD if needed, publish, records ref, and the PR per `ensemble.openPullRequest` | .trd-state/audit-before-functional-verification/evidence/fs12-closed.json | 1 |
| FS-13 | `/audit-build --close-deferred` runs no verifier wave, clears the pending close once consumed, and returns one RETURN line | .trd-state/audit-before-functional-verification/evidence/fs12-close-deferred.transcript.txt | 1 |
| FS-14 | `/audit-build --close-deferred` with no pending close on record returns `RETURN → nothing to close` and closes nothing | .trd-state/audit-before-functional-verification/evidence/fs14-no-pending.transcript.txt | 1 |
| FS-15 | When the audit step returned "passed, close deferred" AND verification's outcome is `satisfied` with no `definition-problem` criterion (or verification was skipped by `--no-verify`), `/implement-trd` runs `audit-build --close-deferred` before its readout, and the readout's STATE says the feature is closed and names the PR (or why it was skipped or failed) | .trd-state/audit-before-functional-verification/evidence/live/fs15-evidence.txt | 2 |
| FS-16 | A passing audit followed by a verification whose outcome is not `satisfied`, or is `satisfied` with a `definition-problem` criterion, closes nothing and opens no PR: no `closed.json` is written and the pending close stays on record | .trd-state/audit-before-functional-verification/evidence/live/fs16-evidence.txt | 2 |
| FS-17 | The waived-defect gate runs after verification, so it files the failures verification waived under `Blocking: must-pass only` | .trd-state/audit-before-functional-verification/evidence/fs17-command-order.txt | 1 |
| FS-18 | `/implement-trd`'s readout NEXT never names `/audit-build` merely because verification passed; it follows the verification outcome (`/refine-verification` then `/verify-build`, or the setup-failure fix) or the audit's own result (re-audit `/audit-build`, capped `/close-feature`, uncovered: design work) | .trd-state/audit-before-functional-verification/evidence/fs18-next-template.txt | 1 |
| FS-19 | `/verify-build` with outcome `satisfied` (no `definition-problem` criterion) and a pending close on record runs `audit-build --close-deferred`, and its NEXT is shipping (`/ship-build`) or the PR step | .trd-state/audit-before-functional-verification/evidence/live/fs19-evidence.txt | 2 |
| FS-20 | `/verify-build` with outcome `satisfied`, no pending close and no closed feature names `/audit-build` as NEXT; under `--chained` and for a sweep file its behaviour is unchanged | .trd-state/audit-before-functional-verification/evidence/fs-s/FS-20-verify-build.diff | 1 |
| FS-21 | `/audit-build` invoked by the owner with neither `--defer-close` nor `--close-deferred` audits, chains its fix run, and on a pass closes the feature (writes `closed.json` with `closedBy: "audit"`) and opens the PR when `ensemble.openPullRequest` is `auto`, exactly as today | .trd-state/audit-before-functional-verification/evidence/live/fs21-evidence.txt | 2 |
| FS-22 | The pending close is a line on `audit-rounds.jsonl`, and `audit-rounds.js` exposes it through a `pending-close` CLI verb that folds a round's lines by run id; a later audit round supersedes a pending close, a close consumes it, a change to the TRD since the audit makes it stale, and no ledger line is deleted | .trd-state/audit-before-functional-verification/evidence/fs-s/FS-22-pending-close-cli.txt | 1 |
| FS-24 | The command text and the docs that describe the order state audit-first: a grep finds no command text still saying verification runs before the audit; every edited command is byte-identical between `packages/core/commands/` and `.claude/commands/`; and `npx jest` and `bats` for the touched command-surface tests, rewritten to pin the new order, pass | .trd-state/audit-before-functional-verification/evidence/fs-s/FS-24-grep-cmp.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

## Evidence gaps (definition problems)

The criterion asks for evidence the build does not produce — change the criterion or the build's outputs.

| ID | Statement | Reason |
|----|-----------|--------|
| FS-4 | A re-audit decided by the audit runs inside `/implement-trd`'s audit step, up to the audit cap, before verification; NEXT never sends the owner to a standalone `/audit-build` for that re-audit | No live run reached a second audit round. The end-of-run /code-review --fix repaired every seeded defect before the audit ran (three attempts), so each audit found 0 defects and no re-audit was decided. Re-captured once already, so this is settled as evidence the fixture cannot produce. |
| FS-23 | When the close follows a satisfied verification in the same run, `anchorCommit` is the branch head at close time, so code changed by verification's Debug stage after the audit does not invalidate the pending close | No run had a verification Debug commit after the audit: the end-of-run /code-review --fix repaired all seeded bugs first, so verification was satisfied on its first iteration every time. Partial evidence only (evidence/live/fs23-attempts.txt). Re-captured once already, so this is settled as evidence the fixture cannot produce. |

