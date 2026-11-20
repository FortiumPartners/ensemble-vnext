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

Root cause [ran]: `packages/core/scripts/token-usage.js` CLI loop (lines 104-118 before the fix, at
commit 82ac6c78; the CLI is now `main()`, lines 102-155) calls `add()`
for every line with a usage block and keeps no record of ids seen; `aggregate()` (lines 68-79
before the fix; now lines 78-94),
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
| AMEND-001 | [test-gap] The dedup tests use the same usage block for every row that shares an id, so they cannot tell last-row-wins (what the TRD and code specify) from first-row-wins. Add a case where rows with one id differ in output_tokens and assert the last value. — promoted from a gap discovery found by audit-build — find and fix every instance of this weakness across the feature's touched files, and list each one fixed (observed: packages/core/scripts/token-usage.test.js (row() helper uses one usage block); packages/core/scripts/token-usage.js:86 byId.set overwrites) | amendment — no objective recorded | None | [test-gap] The dedup tests use the same usage block for every row that shares an id, so they cannot tell last-row-wins (what the TRD and code specify) from first-row-wins. Add a case where rows with one id differ in output_tokens and assert the last value. no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/scripts/token-usage.js`, `packages/core/scripts/token-usage.test.js`
- **Reuse:** `groupKey()` already computes exactly the CLI's inline key (same project-dir regex, same model/day logic) [read]; `add()` and `blank()` unchanged in behaviour [read]
- **Replaces:** the CLI loop's inline key computation and its two `add()` calls (lines 112-117 before the fix, at commit 82ac6c78); they become a `rows.push({ usage: u, id: (d.message||{}).id, dir, model: (d.message||{}).model, ts })` and one `aggregate()` call after the file loop [read]
- **Follow:** existing comment style (WHY-first block comments); keep `module.exports` the same names; keep the `require.main === module` guard [read]
- **Careful:** keep the `since` filter applied before deduplication so out-of-window lines never replace in-window ones; the header line 11 ("Every assistant message carries a usage block") and line 27-28 (subagent claim), both numbered as before the fix at commit 82ac6c78, must be corrected (as delivered: the dedup note follows line 11 at lines 12-15, and the subagent note is lines 30-32); `add()` still counts one message per call — callers now call it once per id [read]

### AMEND-001

- **Careful:** no `file` was recorded for this discovery, so no `Touches` field is written here — the file-conflict guard in `task-graph.js` cannot protect this task from a concurrent one until an owner fills in `Touches` by hand. Until then this task has no inferred conflict edges and may be scheduled alongside anything.

## Could Not Verify
- Check 3 of the brief (the original 6,104 / 8,402 baseline transcripts) — they live in another OS user's home folder and cannot be read from this account. Not checked by the 2026-11-20 build audit, for the same reason. Checks 1 and 2 were run and passed (check.sh: 30846 output / 89 messages from both sides, PASS, exit 0; the 14 tests in token-usage.test.js pass).
- Validation against product requirements — no PRD exists for this defect (the brief is the source), so the 2026-11-20 build audit checked only that the delivered code matches this TRD, not whether the TRD covers everything a product owner wanted.
