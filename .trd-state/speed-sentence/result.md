# Result: speed-sentence

**Verdict: no measurable difference.** Implementer time fell 19% and gate time rose 13%. Both are inside the 20% band that the TRD set in advance, so neither counts as a change. No task failed, retried or was reopened by reconcile on any after-run. The one after-run that was audited (run 1) had no audit gap the baseline lacked; after-runs 2–5 were not audited.

**The sentence has been removed.** The TRD's must-pass objective O3 says the change "is kept only if time falls", and it did not measurably fall. The narrower reading in the FIX-004 task text, "revert only on a remove verdict", contradicted O3, and the objective outranks the task text (decided 2026-10-20 and recorded in the TRD's Decision section). The revert restores the four workflow files to `main` and deletes `speed-sentence.test.js`. To put it back, cherry-pick `34b7ae7` (the sentence) and `fcb64cb` (the code-review fixes to it).

The baseline runs ran on commit `f733465` (FIX-001, before the sentence); the after runs ran on commit `34b7ae7` (FIX-003), which adds the sentence, verbatim, at the six dispatch sites:

> Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better.

## Time per agent, from the dispatch ledger

Fixed task: `implement-one-task` (a one-file TRD, `smoke-greet`), run with `--no-verify`, 5 runs per side, one after another.

| Agent | Baseline median (5 runs) | After median (5 runs) | Change |
|---|---|---|---|
| Implementer (`backend-implementer`) | 17.1s | 13.9s | −19.0%, inside the 20% band |
| Phase-gate check (`verify-app`) | 12.1s | 13.7s | +13.1%, inside the 20% band |
| End-of-run review (`general-purpose`), no sentence (control) | 58.6s | 72.3s | +23.2% |

Each run's values, in seconds (implementer / gate):

| Run | Baseline | After |
|---|---|---|
| 1 | 22.4 / 19.0 | 37.8 / 13.7 |
| 2 | 15.1 / 11.2 | 15.6 / 11.5 |
| 3 | 17.1 / 10.5 | 13.9 / 23.7 |
| 4 | 13.6 / 12.1 | 12.6 / 12.4 |
| 5 | 20.7 / 15.6 | 13.4 / 28.6 |

Within each side the spread (12.6–37.8s for the implementer after the change) is larger than the gap between the medians.

The end-of-run review never received the sentence, yet it slowed by 23%. That points to model latency drifting between the two batches (baseline 11:01–11:16, after 11:37–12:06, Pacific, from each side's `runs.tsv`) by about as much as any effect being measured.

## The zero counts

| Count | After-runs 1–5 | Required | Read from |
|---|---|---|---|
| Failed tasks | 0, 0, 0, 0, 0 | 0 | tasks with `status: "failed"` in each `after/run-N/implement.json` |
| Retries (`retry_count`) | 0, 0, 0, 0, 0 | 0 | the sum of `retry_count` over the tasks in each `after/run-N/implement.json` |
| Tasks reopened by `reconcile()` | 0, 0, 0, 0, 0 | 0 | `reconcile()` from `.claude/lib/implement-state.js` (unchanged since `34b7ae7`), run over each `after/run-N/implement.json` against that run's kept project (`after/run-N/project.txt`); output in `after/reconcile-reopens.txt`. Each run had one success claim (SMOKE-001) and all of its files were present |
| `/audit-build` gaps not in the baseline audit | after-run 1: 0; after-runs 2–5: **not audited** | 0 | see "Audit coverage", below |

The runs used `--no-verify`, so `/implement-trd` itself never ran a reconcile. The reconcile counts come from the separate run described above, not from the runs themselves.

### Audit coverage, per after-run

| Run | `/audit-build` report | Gaps | Gaps not in the baseline |
|---|---|---|---|
| Baseline (run-1 project) | `baseline/audit-build-report.md` (rc 0) | 0 (`baseline/audit-gaps.txt`) | — |
| After-run 1 | `after/audit-build-report.md` (rc 143: killed at the 1500s timeout after the report was written) | 0 | none |
| After-run 2 | none | unknown | unknown |
| After-run 3 | none | unknown | unknown |
| After-run 4 | none | unknown | unknown |
| After-run 5 | none | unknown | unknown |

The TRD's FIX-004 task asked for one audit, on after-run 1. The success rule says "every after-run … `/audit-build` reports no gap that the baseline audit did not also report", which reads as one audit per after-run. Only after-run 1 was audited, so for after-runs 2–5 the audit condition is **unproven, not zero**. Closing that needs four more live `/audit-build` runs, on the kept projects listed in `after/run-2..5/project.txt`. The verdict does not depend on it: it is "no measurable difference" on the timing figures alone, and a non-zero count could only change it to "remove", which has the same effect.

Both audits that were run returned the same verdict: proceed with one caveat, that no source PRD was supplied, because the fixture TRD names none.

## Anomalies, neither caused by the sentence

- **After-run 4 was killed at the scenario's 840s timeout (exit 143).** Its agents had finished by 110s and its final message carried a COMMAND COMPLETE banner. The `claude --print` process stayed alive after the session's last turn and never exited. The after-run audit session ended the same way: its report was written and its last turn ended normally, but it was killed at 1500s. The edited prompts belong to subagents, so neither hang involves them.
- **Baseline run 4's final message was empty,** so that run failed the banner assertion. Its task succeeded.

## What this does and does not show

- On a task this small, each agent runs for 10–25 seconds, mostly fixed overhead. The sentence has almost nothing to remove. This is the risk the TRD named as its open question (OQ-1), and it played out.
- The result does not show that the sentence is useless. It shows that this fixture cannot detect a 20% effect against this much noise.
- **Recommended next measurement:** a fixture where the implementer takes minutes, for example a three-to-five-task TRD of real substance, or a past feature's TRD replayed on a scratch copy. Real implementers in this repo have a median of 139s (n=253), and the slowest tenth take over 468s. Run both sides interleaved (A, B, A, B, …) rather than in two batches, so latency drift falls on both equally.

Raw data: `baseline/` and `after/`, each holding `runs.tsv`, `summary.txt`/`summary.json`, `run-N/{dispatch.jsonl, implement.json, smoke.out, smoke.err, project.txt}` and `audit-build-report.md`; `after/reconcile-reopens.txt` holds the per-after-run reconcile output.
