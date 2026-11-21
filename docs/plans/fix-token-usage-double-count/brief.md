# Brief: token-usage.js counts each model message two or three times

`packages/core/scripts/token-usage.js` reports token use from Claude Code session transcripts
(`~/.claude/projects/<project>/<session>.jsonl`). Claude Code writes one model message as
several transcript lines (one each for thinking, text and each tool call), and every one of
those lines repeats the same `message.id` and the same `usage` block. The script adds the
usage of every line, so every figure it prints (output, input, cache written, cache read, and
the message count) comes out about twice the real value.

## Steps

1. Measured case (plan rebase-project-fast, baseline timing task, 2026-11-20, written up in
   `.trd-state/rebase-project-fast/baseline.md`): the headless `/rebase-project` dry run and
   full run against a v4.15.0 fixture. The CLI's own end-of-run `result` line reported
   6,104 output tokens (dry run) and 8,402 (full run). Counting one usage block per message id
   gives exactly those figures. `token-usage.js` reported 12,208 and 17,280, with 16 and 22
   "messages" for runs of 8 and 11 model turns. Raw output:
   `.trd-state/rebase-project-fast/evidence/baseline/token-usage-cli.json`.
2. Reproduced on 2026-11-20 on a single local transcript, copied into a throwaway HOME so
   nothing else is in the window: `token-usage.js` reported 16,608 output tokens over 24
   messages; one usage block per message id gives 9,245 over 11. Across all 24 lines, no two
   lines with the same message id carried different usage figures.
3. To reproduce: from the repository root, `bash docs/plans/fix-token-usage-double-count/check.sh`
   (see How to check).

## Expected

Each model message's usage is counted once, keyed by `message.id`, so the four token classes
and the message count match the CLI's `result` line for the same session (6,104 and 8,402
output tokens on the baseline runs).

## Actual

Every transcript line carrying a usage block is added. Today's check output:

```
token-usage.js (output, messages): 24891 40   once per message id: 10715 21
FAIL
```

## Where

- `packages/core/scripts/token-usage.js:104-118`: the CLI loop parses each line and calls
  `add()` for every line with a usage block, with no record of message ids already seen.
- `packages/core/scripts/token-usage.js:68-79`: `aggregate()`, the pure function the tests
  exercise, has the same shape: rows carry no message id, so it cannot deduplicate either.
  The fix belongs in both, ideally with the CLI loop building rows and calling `aggregate()`
  so the tested path is the path that runs.
- `packages/core/scripts/token-usage.js:11` and `:57`: the header says "every assistant
  message carries a usage block" and `add()` counts one message per call; both should
  describe one message per id after the fix.
- Tests: `packages/core/scripts/token-usage.test.js` (Jest).

How to fix, as the reference used in the measurements does: keep one usage block per
`message.id` (the last one seen; in every case measured all lines of one id carried identical
usage) and only then add it to its group and the total. A line whose message has no id is
counted on its own, as today. Deduplicate across the whole window, not per file, so a message
repeated in a second transcript file (a resumed or forked session) is still counted once.

## How to check

1. `bash docs/plans/fix-token-usage-double-count/check.sh` from the repository root. It copies
   the newest transcript under `~/.claude/projects` into a throwaway HOME, runs `token-usage.js`
   over it in JSON mode with a window wide enough to include it, and compares the output total
   and message count with a reference that keeps one usage block per message id. Prints FAIL
   and exits 1 today; must print PASS and exit 0 after the fix.
2. A new Jest case in `token-usage.test.js`: three rows with one message id and identical usage
   plus one row with another id give two messages and the sum of two usage blocks; a row with
   no id is still counted. Fails against today's `aggregate()`; `npx jest
packages/core/scripts/token-usage.test.js` passes after.
3. Optional confirmation on the original numbers: the baseline transcripts live under the home
   folder of the OS user that ran the baseline task, which other accounts cannot read. Run as
   that user, the two baseline slot projects' groups should show 6,104 and 8,402 output tokens.
   If those transcripts are gone, checks 1 and 2 stand on their own.

## Open questions

- Owner's call, default taken: subagent transcripts are not counted. While probing, the
  script was found to read only the top-level `*.jsonl` files of each project folder, but
  Claude Code writes subagent transcripts to `<session>/subagents/*.jsonl`, so subagent turns
  are missed even though the header (lines 27-28) says they are included. The baseline runs
  had no subagents, so this did not affect the measured figures. Default: out of scope for
  this fix; leave the reader as it is, and do not claim subagent coverage is fixed. It is a
  candidate follow-up fix.
- Owner's call, default taken: check 3 (the original baseline transcripts) is optional,
  because only the account that ran the baseline can read them. Default: checks 1 and 2 are
  the acceptance checks.

Decisions: subagent transcripts: out of scope for this fix, candidate follow-up (owner's call, default taken under unattended planning, 2026-11-20).
Decisions: confirmation on the original baseline transcripts: optional; checks 1 and 2 are the acceptance checks (owner's call, default taken under unattended planning, 2026-11-20).
