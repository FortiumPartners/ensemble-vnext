# AJCS-T004 — `hook-verdict-rate.js` against a post-change session

**This is the only instrument that sees the production judge.** The offline corpus (AJCS-T001)
cannot show improvement — its PRE run already scored fp=0 on the conversational class — so the
entire improvement claim for this change rests on the measurement below.

## Session measured

`c0643bd5-b00e-4d45-83aa-4b36d3d4caad` (this repository's own working session), transcript at:

```
/Users/james/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/c0643bd5-b00e-4d45-83aa-4b36d3d4caad.jsonl
```

Command run:

```
node packages/core/scripts/hook-verdict-rate.js \
  /Users/james/.claude/projects/-Users-james-dev-fortium-ensemble-vnext/c0643bd5-b00e-4d45-83aa-4b36d3d4caad.jsonl
```

## Tool's full output, verbatim

```
  c0643bd5-b00e-4d45-83aa-4b36d3d4caad.jsonl
    hook evaluations:            43
    BLOCKS delivered:            9   <- the guards working, not failures
    ALLOWS surfaced (anomalous): 0

  TOTAL: 43 evaluations | 9 blocks (20.9%) | 0 anomalous allows (0.0%)
  Blocks are the guards working UP TO A POINT. Above ~8% of evaluations they are
  interrupting correct work more than they are catching defects -- a guard the owner
  disables protects nothing. Both rates are defect signals; they just fail differently.
  A block shown as "Stop hook error:" is anthropics/claude-code#62139 — an OPEN upstream
  TUI labelling bug, not a fault here. An ALLOW shown that way is ours: it means the
  judge attached a `reason` to an ok:true verdict. See build-judge-prompts.js.
  VERDICT: block rate 20.9% exceeds 8% — the guards are
           interrupting correct work. Shorten or narrow them; a disabled guard is worth nothing.
  VERDICT: allow-leak rate nominal
```

(exit code 3 — the tool's own convention for "block-rate ceiling exceeded"; not a run
failure)

## Headline figures

| Metric | Value |
|---|---|
| Hook evaluations | 43 |
| BLOCKS delivered | 9 |
| Block rate | **20.9%** (VERDICT: exceeds the 8% `BLOCK_RATE_CEILING`) |
| ALLOWS surfaced (anomalous) | 0 |
| Anomalous-allow rate | **0.0%** (VERDICT: nominal) |

Both verdict lines from the tool, reproduced exactly:

> `VERDICT: block rate 20.9% exceeds 8% — the guards are interrupting correct work. Shorten or narrow them; a disabled guard is worth nothing.`
> `VERDICT: allow-leak rate nominal`

Block rate and anomalous-allow rate are different defect classes and fail in different
directions (blocks interrupt correct work; allow-leaks surface a verdict that should have
stayed silent) — both are reported here, not one standing in for the other.

## THE MIXED PRE/POST-PRECONDITION LIMITATION — stated explicitly

The precondition (AJCS-B005/B006) shipped **mid-session**, at commit `03cae25` —
`feat(phase 3): the precondition ships, and the harness can actually match a marker` —
timestamped `2026-08-26T18:46:23-07:00` (`2026-08-27T01:46:23.000Z`). That commit
regenerated all four prompt copies and all three `settings.json` copies, so it is the correct
boundary for "the live Stop judge started running with the precondition."

This session's transcript spans `2026-08-11T23:22:03Z` through `2026-08-27T02:51:21Z` (a
long-running, resumed session, not a single sitting), so the 43-evaluation total mixes traffic
from well before this change existed with a small amount of traffic after it shipped. Splitting
the same 43 evaluations at that commit boundary, using the tool's own classification logic
(`ALLOW_SHAPE` regex, entries-not-records counting):

| Bucket | Evaluations | Blocks | Block rate | Anomalous allows |
|---|---|---|---|---|
| PRE (before 2026-08-26T18:46:23-07:00) | 41 | 9 | 22.0% | 0 |
| POST (after 2026-08-26T18:46:23-07:00) | 2 | 0 | 0.0% | 0 |

**This POST bucket (n=2) is too small to support any conclusion on its own** — it is
consistent with the guard having improved, and equally consistent with simply not having
encountered a triggering turn yet. Essentially all of the measured block activity in this
transcript (9 of 9 blocks, 41 of 43 evaluations) predates the precondition shipping. The
headline 20.9%/0.0% figures reported above are therefore **not a clean post-change
measurement** — they are dominated by pre-change traffic, and the honest reading is: this
session does not yet contain enough post-precondition Stop-hook traffic to demonstrate the
change's effect. A future session with substantially more post-`03cae25` traffic is needed
before this instrument can show whether the block rate actually moved.

## Session composition vs. the 957-evaluation reference

Reference figure (grounding, [ran]): `-Users-james-dev-lightning-lane-prompt-fixes` —
957 evaluations / 100 blocks (10.4%) / 3 anomalous allows (0.3%).

That is a **different project with different composition** — a reference point, not a
controlled comparison:

- **Scale**: the reference session carried 957 hook evaluations; this session carries 43 —
  roughly 4% of the reference's volume. A 9-block sample moves the rate in large swings (one
  more or fewer block shifts the percentage by over 2 points), where the reference's 100-block
  sample is comparatively stable.
- **Project/workload**: `lightning-lane-prompt-fixes` is a different repository with its own
  command mix and its own rate of workflow-command Stop events vs. plain conversational turns.
  This repo's session is itself split across two eras (pre- and post-precondition, above), so
  even within-project the 43 evaluations are not homogeneous.
- **Anomalous allows**: this session shows 0/43 (0.0%) vs. the reference's 3/957 (0.3%) — both
  are "nominal" by the tool's own 5% threshold, so this is not evidence of a difference, just
  two small numbers both near zero.
- **No like-for-like delta is claimed.** The reference number is context for scale, not a
  baseline this session's rate is being subtracted from.

## `[inferred]` grounding checked

- **Grounding claimed a post-change session exists at this session ID** — `[ran]`, verified
  directly: the transcript exists at the stated path and does contain both pre- and
  post-precondition hook traffic, exactly as described. No discrepancy found.
- **Grounding's suggestion to report the post-precondition portion separately "if the
  transcript lets you locate the boundary"** — the boundary was locatable via the shipping
  commit's timestamp (`03cae25`, `git show --stat` confirms it touched `.claude/settings.json`
  and all four prompt files). Done above; the result is that the post-boundary sample is too
  small (n=2) to be informative on its own, which is itself the honest finding, not a workaround.
- No other `[inferred]` items in the grounding required checking; the reference figure and the
  reuse note were both already `[ran]`/marked as trusted.

## Scope compliance confirmation

No threshold was touched (`BLOCK_RATE_CEILING`, `PRECISION_FLOOR` — NG7 — untouched). No prompt
file was edited. No tool code was modified. This task only ran the existing instrument against
an existing transcript and recorded its output and a boundary split of the same data using the
tool's own classification regex (not a new implementation) for descriptive purposes.

## SKILLS_USED and RULES_APPLIED

- **SKILLS_USED**: none — this is a measurement/recording task with no applicable skill in the
  matched list (`<skills><matched>none</matched></skills>`).
- **RULES_APPLIED**: `.claude/rules/async-discipline.md` ("Verify the fix by counting" register —
  state the measurement, name the session, don't compare across differing metric definitions);
  `.claude/rules/constitution.md` Principle 4 (model-judged hooks are verified against a
  corpus/session with stated thresholds, not a single pass/fail); the TRD's Decision Table
  (D5, D8, D12) governing how absent markers, Judgment A, and failure direction are read —
  none of those decisions were invoked as live edge cases in this run (no absent-marker
  ambiguity arose in the scan), recorded here for completeness per the task's `<decision>` block.
