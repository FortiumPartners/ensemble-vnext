# Result: speed-sentence replay (second measurement)

**Verdict: remove.** The sentence stays out of the tree.

- **Implementer time did not fall.** Across the 20 matched task pairs, the median change was **+1.7%**, against the 20% fall the rule requires.
- **Gate time fell by 33.7%** (median of 6 matched phase pairs). That would have been enough on its own, but the rule needs both to fall.
- **The after side added two real gaps**, both in after-run 1:
  - the CI gate script ignores its `--root` flag (AVAIL-P001);
  - the chat route has no test proving it hides a stale board (AVAIL-B005).

  Neither before-run has either defect (checked directly in each run's code, below). The rule counts a gap the after side adds as a failure, and names that case "remove". Even without those gaps the result would only be "no measurable difference", because implementer time did not fall. Either way the sentence stays out.
- **Nothing else was added.** Failed tasks, retries and reconcile reopenings were 0 on all four runs, both sides.

What the sentence did change: implementers did less work.

| Per-task median change, implementers (n=20) | |
|---|---|
| Seconds | **+1.7%** |
| Tool calls | **−21.0%** |
| Output tokens | **−15.6%** |

Summed over all 20 pairs:
- tool calls 752 → 606;
- output tokens 373,790 → 324,563;
- seconds 3,614 → 3,768.

Fewer actions did not make tasks finish sooner. One reading: wall time is dominated by the test runs and model latency inside each task, not by the number of actions. And in one of two after-runs, the reduced effort dropped required work: one missing flag and one missing test. With two runs per side, that is a signal worth a look, not a measured rate.

## Setup

- **Fixed workload:** the lightning-lane availability-consolidation TRD, 10 tasks in 3 phases (`test/smoke/fixtures/speed-replay/availability-consolidation/`).
  - It is replayed on a fresh clone at `e04cfe0ed`, the commit before that feature was merged.
  - Every clone runs today's runtime, 4.13.6.
- **The two sides:** both are clones of this repo at `2601e3f`, which runs without the sentence (the before side).
  - The after side adds `34b7ae7` and `fcb64cb`, the sentence at the six named prompts.
  - The two sides differ in exactly nine files (`replay-abab.sh sides`), and the prepared clones differ only in the four workflow files.
- **Run conditions:** `/implement-trd --no-verify`, headless, one machine, one run at a time.
- **Order:** before-1, after-1, before-2, then after-2.
  - After-2 ran last, 28 minutes after before-2 ended, instead of straight after it. Its first attempt failed before any model call (see "Deviations").
- **The completion banner was reached on all four runs.**
  - Three sessions then stayed alive after it and were stopped by the watchdog: "completed (process hung)".

| Run | Start → end (UTC, 2026-10-21) | Wall time | Model cost |
|---|---|---|---|
| before-1 | 02:54 → 03:35 | 41.3 min | $20.36 |
| after-1 | 03:35 → 04:20 | 44.8 min | $20.10 |
| before-2 | 04:20 → 04:54 | 33.8 min | $20.04 |
| after-2 | 05:22 → 06:04 | 42.4 min | $20.59 |

## The judged medians

From `node test/smoke/ledger-timing.js --compare` (`compare.txt`, `compare.json`). Each pair is the same task id, or the same phase gate, in before-run k and after-run k.

| | Pairs | Median change, seconds | Needed to keep | Median change, tool calls | Median change, output tokens |
|---|---|---|---|---|---|
| Implementer | 20 | **+1.7%** | below −20% | −21.0% | −15.6% |
| Gate (`verify-app`) | 6 | **−33.7%** | below −20% | −13.3% | −24.3% |

**Control.** The end-of-run review never receives the sentence. It took 519.6s and 514.1s on the before-runs, and 663.7s and 498.4s on the after-runs. The two before-runs agree within 1%, but after-1's review took 28% longer than after-2's. That is the same spread seen within single tasks above, so per-task numbers carry run-to-run noise of that order.

## Every pair

Seconds are the agent's time from the dispatch ledger; tool calls and output tokens come from its transcript.

| Pair | Task or phase | Seconds, before → after | Change | Tool calls | Output tokens |
|---|---|---|---|---|---|
| 1 | AVAIL-B001 | 210s → 217.5s | 3.6% | 27 → 24 | 15210 → 13028 |
| 2 | AVAIL-B001 | 177.4s → 420s | 136.8% | 35 → 29 | 14531 → 18271 |
| 1 | AVAIL-B002 | 462.5s → 470.3s | 1.7% | 117 → 82 | 48462 → 49120 |
| 2 | AVAIL-B002 | 422.3s → 429.5s | 1.7% | 75 → 91 | 44734 → 42299 |
| 1 | AVAIL-B003 | 307.4s → 236.4s | -23.1% | 52 → 31 | 25692 → 19335 |
| 2 | AVAIL-B003 | 301.4s → 433.8s | 43.9% | 50 → 41 | 29090 → 24184 |
| 1 | AVAIL-B004 | 208.5s → 256.5s | 23% | 45 → 28 | 24554 → 19541 |
| 2 | AVAIL-B004 | 198.6s → 214s | 7.8% | 45 → 47 | 25230 → 22423 |
| 1 | AVAIL-B005 | 115.3s → 93.8s | -18.6% | 39 → 17 | 12578 → 8042 |
| 2 | AVAIL-B005 | 116.5s → 101.8s | -12.7% | 25 → 19 | 11349 → 7129 |
| 1 | AVAIL-B006 | 167.8s → 100.2s | -40.3% | 37 → 22 | 20976 → 12804 |
| 2 | AVAIL-B006 | 195.2s → 146.8s | -24.8% | 44 → 31 | 23067 → 18462 |
| 1 | AVAIL-B007 | 69s → 40.8s | -40.9% | 18 → 7 | 7998 → 5093 |
| 2 | AVAIL-B007 | 39.9s → 61s | 53% | 7 → 11 | 5572 → 5778 |
| 1 | AVAIL-B008 | 62s → 65.8s | 6.1% | 17 → 10 | 7800 → 6775 |
| 2 | AVAIL-B008 | 81.4s → 60.1s | -26.2% | 18 → 15 | 8746 → 7055 |
| 1 | AVAIL-B009 | 215.5s → 135.5s | -37.1% | 47 → 28 | 19895 → 12783 |
| 2 | AVAIL-B009 | 174.5s → 175.6s | 0.6% | 38 → 48 | 14959 → 17796 |
| 1 | AVAIL-P001 | 44.2s → 45.3s | 2.3% | 5 → 11 | 6855 → 6310 |
| 2 | AVAIL-P001 | 44.1s → 63.6s | 44.2% | 11 → 14 | 6492 → 8335 |
| 1 | Phase 1 | 108.4s → 58.5s | -46% | 5 → 9 | 2099 → 2651 |
| 2 | Phase 1 | 53.2s → 71.1s | 33.7% | 11 → 11 | 2287 → 1840 |
| 1 | Phase 2 | 54.7s → 63.9s | 16.7% | 11 → 12 | 3979 → 3247 |
| 2 | Phase 2 | 107.2s → 34.2s | -68.1% | 18 → 9 | 4808 → 2216 |
| 1 | Phase 3 | 41.4s → 32.5s | -21.5% | 15 → 11 | 3629 → 2363 |
| 2 | Phase 3 | 119s → 37.2s | -68.8% | 17 → 9 | 3599 → 2551 |

## The counts, per run

| Run | Failed tasks | Retries (`retry_count` sum) | Tasks reopened by `reconcile()` |
|---|---|---|---|
| before-1 | 0 | 0 | 0 of 10 |
| after-1 | 0 | 0 | 0 of 10 |
| before-2 | 0 | 0 | 0 of 10 |
| after-2 | 0 | 0 | 0 of 10 |

Failed tasks and retries come from each run's `implement.json`. Reopenings come from `reconcile()` (`.claude/lib/implement-state.js`), run from inside each kept clone (`reconcile-reopens.txt`). Run from this repo instead, it resolves every claimed path against the wrong tree and "reopens" 9 of 10 on every run.

## Audit gaps against the baseline

There are three `/audit-build --report-only` runs: one on before-run 1's clone (the baseline) and one on each after-run's. All three returned "proceed with these caveats" (`audit/<label>/audit-build-report.md`).

An audit is a model's reading, and two readings of similar code differ. So each finding missing from the baseline report was also checked directly in all four runs' code:

| Finding | In the baseline audit? | before-1 code | before-2 code | after-1 code | after-2 code | Counted against the sentence? |
|---|---|---|---|---|---|---|
| Eval Tier B never run (AC-F6.4) | yes | — | — | — | — | no (all three audits; the fixture removed that task) |
| Live end-to-end check never run (AVAIL-T001) | yes | — | — | — | — | no (same) |
| CI gate script ignores `--root` (AVAIL-P001); reported by the after-1 audit | no | handles it | handles it | **ignores it** | handles it | **yes, after-1** |
| No test drives the chat route's stale-board drop (AC-F1.4, AVAIL-B005); after-1 audit | no | test present | test present | **no test** | test present | **yes, after-1** |
| Mock adapter's new response shape untested (AVAIL-B007); after-1 audit | no | untested | untested | untested | untested | no (the baseline code has it too) |
| Comment still names the deleted `TipboardCacheEntry` (AVAIL-B003); after-2 audit | no | **present** | absent | present | present | no (the baseline code has it too) |

The direct checks: `grep -- --root scripts/check-tipboard-reader.ts`, a search of `apps/web` tests for `resolveLlTipboardExperiences`, `grep TipboardCacheEntry` on `llTipboard.ts`, and the shape assertions in `mockAdapterAvailability.test.ts`. Each was run on every run's kept clone.

## Deviations

- **before-1's first attempt was aborted at 22 minutes** (`aborted/before-run-1-bg-ceiling/`). Headless `claude --print` stops background tasks 10 minutes after the lead's last turn, and that killed the Phase 2 workflow. Fixed in `test/smoke/lib/project.sh` (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`), then all four runs ran.
- **after-2's first attempt failed before any model call.** Lightning-lane's own pre-run test battery hit a rare flake in its mock server: a real-clock test got `502`, not `409`. A different mock-server flake, a socket hang-up, appeared once during preparation. Both are recorded as risks in `discovered.jsonl`.
  - The run and its audit were redone with `replay-abab.sh rerun after 2`. The void attempts are kept under `aborted/`.
  - The redo puts after-2 28 minutes after before-2 instead of straight after it. Its review time (498s) is within 3% of before-2's (514s), so no latency drift shows in the control.
- **Lightning-lane's own refs moved during the measurement.** Two of its branches (`feature/alert-cancel-outcome/impl`, `feature/web-chat-parity/impl`) gained commits from the owner's other worktrees. None of those commits exists in any replay clone, and the clones have no remotes, so the replay wrote nothing to `~/dev/lightning-lane`.

## What this does and does not show

- **Shown:** on real minute-long tasks, the sentence cut the implementers' tool calls by about a fifth and their output tokens by about a sixth, with no change in their time. Phase gates ran faster.
- **Not shown:** that the gate result is real rather than noise. Six pairs is few, and single gates varied by up to 69% between runs.
- **Not shown:** how often the reduced effort drops required work. It happened in one of two after-runs, twice in that run, and in neither before-run. A rate needs more runs.
- **Kept as history:** the first measurement's result (`../result.md`, "no measurable difference" on a one-task fixture) stands.

Raw data, per run, in `<side>/run-<k>/`: `dispatch.jsonl`, `implement.json`, `per-task.txt` (before-1), `final_text.txt`, `project.txt`, `source-commit.txt`, `result.env` and `scenario.log`. Also `runs.tsv`, `compare.txt`, `compare.json`, `reconcile-reopens.txt` and `audit/`. Raw transcripts and session logs (~14 MB per run) stay on disk, untracked.
