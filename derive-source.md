## Reproduction

### Steps
From the repository root: `bash docs/plans/fix-token-usage-double-count/check.sh`. It copies the
newest transcript under `~/.claude/projects` into a throwaway HOME (no live state is touched),
runs `token-usage.js --json --days 3650` over it, and compares the output total and message
count with a reference that keeps one usage block per `message.id`.

### Actual
[ran 2026-11-20] `token-usage.js (output, messages): 2514 11   once per message id: 1327 6` —
`FAIL`, exit 1. Each model message is written as several transcript lines (thinking, text, each
tool call) that repeat the same `message.id` and the same `usage` block, and every one is added.

Root cause [ran]: `packages/core/scripts/token-usage.js` CLI loop (lines 104-118) calls `add()`
for every line with a usage block and keeps no record of ids seen; `aggregate()` (lines 68-79),
the pure function the tests exercise, has the same shape, and its rows carry no id.

### Expected
The check prints `PASS` and exits 0: totals and message count equal one usage block per message
id (on the baseline runs in the brief, 6,104 and 8,402 output tokens, the CLI's own figures).

