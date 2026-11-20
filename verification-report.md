# Functional Verification Report: fix-token-usage-double-count

**Source PRD**: docs/TRD/fix-token-usage-double-count.md § Reproduction
**Success definition**: .trd-state/fix-token-usage-double-count/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met, not verifiable here, or settled as an evidence gap
**Criteria**: 3 total — 3 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 3 of 3 proven — uncovered: none
**Must pass**: 3 of 3 proven
**Next**: close the feature — the command that ran this check closes it when an audit has already passed (its readout says whether it did); otherwise run `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Running the reproduction check from the repository root prints `PASS` and exits 0: the output-token total and message count that `token-usage.js --json --days 3650` reports over a real transcript equal the reference that keeps one usage block per `message.id` | .trd-state/fix-token-usage-double-count/evidence/fs1-check.txt | 1 |
| FS-2 | When one model message is written as several transcript lines (thinking, text, each tool call) that repeat the same `message.id` and the same `usage` block, the CLI's input, cache-write and cache-read totals, as well as its output total and message count, each equal the sum of one usage block per message id | .trd-state/fix-token-usage-double-count/evidence/fs2-out.json | 1 |
| FS-3 | The pure aggregation function `aggregate()` in `packages/core/scripts/token-usage.js`, given usage rows in which several share one message id, counts that message's usage once rather than once per row | .trd-state/fix-token-usage-double-count/evidence/fs3-aggregate.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._

