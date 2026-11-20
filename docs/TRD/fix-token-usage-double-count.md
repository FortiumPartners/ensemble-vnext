# TRD: fix-token-usage-double-count

**Source PRD**: None — defect (brief: `docs/plans/fix-token-usage-double-count/brief.md`)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `token-usage.js` counts each model message's usage once, keyed by `message.id` across the whole window, so the output/input/cache-write/cache-read totals and the message count equal one usage block per message id | the reproduction below, 2026-11-20 | yes |
| O2 | A transcript line whose message has no id is still counted, on its own | the brief's fix description, 2026-11-20 | |

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

## Decision

Deduplicate inside `aggregate()`: rows gain an optional `id` (the `message.id`). Rows inside the
window are collected into a Map keyed by id, the last row seen for an id replacing earlier ones;
a row with no id gets a key of its own so it is always counted. Only then is each surviving row
added to its group and the total. The CLI loop stops accumulating by itself: it builds rows
`{ usage, id, dir, model, ts }` from every file in the window and calls `aggregate(rows, BY,
since)` once, so the tested path is the path that runs, and deduplication spans every file
(a message repeated in a resumed or forked session's second transcript is counted once).
Rejected: a seen-id Set in the CLI loop alone — it would leave `aggregate()` (the tested
function) still double-counting and keep two copies of the grouping logic.

## Non-Goals
- Subagent transcripts (`<session>/subagents/*.jsonl`) are still not read; the reader is left as
  it is (owner's call, default taken 2026-11-20 — candidate follow-up). The header's claim that
  subagent turns are included is corrected to say they are not, rather than fixed.
- No pricing, no change to the four classes, the CLI flags or the printed table layout.

## Verification Artifacts

None apply — a command-line script with Jest tests and a shell check; no screens, designs, flows or rendered data.

## Verification Environment
**Environment**: local
**Refresh**: nothing — tests and the script read the working tree
**Cannot be checked there**: the original baseline transcripts (another OS user's home); checks 1 and 2 stand on their own

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Count subagent transcripts too? | Out of scope; header corrected to say they are not counted | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Deduplicate usage by `message.id` in `aggregate()`, route the CLI loop through `aggregate()`, correct the header and `add()` comments, and add Jest cases | O1, O2 | None | (1) `bash docs/plans/fix-token-usage-double-count/check.sh` prints PASS and exits 0 (it prints FAIL today); (2) a new Jest case — three rows sharing one id with identical usage plus one row with another id — gives `msgs: 2` and the sum of two usage blocks, and fails against today's `aggregate()`; (3) a row with no id is still counted; (4) the same id in rows from two different files/dirs counts once; (5) `npx jest packages/core/scripts/token-usage.test.js` passes |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/scripts/token-usage.js`, `packages/core/scripts/token-usage.test.js`
- **Reuse:** `groupKey()` already computes exactly the CLI's inline key (same project-dir regex, same model/day logic) [read]; `add()` and `blank()` unchanged in behaviour [read]
- **Replaces:** the CLI loop's inline key computation and its two `add()` calls (lines 112-117); they become a `rows.push({ usage: u, id: (d.message||{}).id, dir, model: (d.message||{}).model, ts })` and one `aggregate()` call after the file loop [read]
- **Follow:** existing comment style (WHY-first block comments); keep `module.exports` the same names; keep the `require.main === module` guard [read]
- **Careful:** keep the `since` filter applied before deduplication so out-of-window lines never replace in-window ones; the header line 11 ("Every assistant message carries a usage block") and line 27-28 (subagent claim) must be corrected; `add()` still counts one message per call — callers now call it once per id [read]

## Could Not Verify
- Check 3 of the brief (the original 6,104 / 8,402 baseline transcripts) — they live in another OS user's home folder and cannot be read from this account.
