# Functional Success Definition: fix-token-usage-double-count

**Source**: .trd-state/fix-token-usage-double-count/derive-source.md §Reproduction
**Source kind**: reproduction
**Derived**: 2026-11-20T00:00:00Z
**Criteria**: 3

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | Running the reproduction check from the repository root prints `PASS` and exits 0: the output-token total and message count that `token-usage.js --json --days 3650` reports over a real transcript equal the reference that keeps one usage block per `message.id` | §Reproduction › Steps (`bash docs/plans/fix-token-usage-double-count/check.sh`); §Expected ("The check prints `PASS` and exits 0: totals and message count equal one usage block per message id"); §Actual (the `FAIL` run, 2514 vs 1327 output, 11 vs 6 messages) | stdout and exit code of `bash docs/plans/fix-token-usage-double-count/check.sh`, captured to a file, showing the two figure pairs agreeing, the word `PASS`, and exit status 0 | [read] | locator | | O1 |
| FS-2 | When one model message is written as several transcript lines (thinking, text, each tool call) that repeat the same `message.id` and the same `usage` block, the CLI's input, cache-write and cache-read totals, as well as its output total and message count, each equal the sum of one usage block per message id | §Expected ("totals and message count equal one usage block per message id"); §Actual ("Each model message is written as several transcript lines ... that repeat the same `message.id` and the same `usage` block, and every one is added") | `token-usage.js --json` output over a transcript (copied into a throwaway HOME, as the check does) whose messages span multiple lines sharing an id, placed beside a per-id reference sum for every total field it reports; every field agrees | [read] | locator | | O1 |
| FS-3 | The pure aggregation function `aggregate()` in `packages/core/scripts/token-usage.js`, given usage rows in which several share one message id, counts that message's usage once rather than once per row | §Actual, root cause ("`aggregate()` (lines 68-79), the pure function the tests exercise, has the same shape, and its rows carry no id") | output of a direct call to `aggregate()` (or a test run that exercises it) on rows repeating a message id, showing totals and message count equal to one usage block per id | [read] | locator | | O1 |

Considered and not made a criterion: the brief's baseline figures in §Expected ("6,104 and 8,402
output tokens, the CLI's own figures"). The source does not state what those runs should report
once fixed, so no corrected value can be cited; inventing one would breach the citation rule.
The "no live state is touched" clause in §Steps describes how the check script runs, not behaviour
of the fix, so it is not a criterion either.
