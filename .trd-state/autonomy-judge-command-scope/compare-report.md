# AJCS-T002 — POST baseline capture and PRE/POST gate report

**Command run (identical to AJCS-T001):** `node test/discipline-corpus/score.js --detector judge --json`
**Comparator:** `node test/discipline-corpus/compare-runs.js --pre <3 files> --post <3 files>`
**Corpus:** `test/discipline-corpus/corpus.jsonl`, 80 cases (79 scored per run — see §6)

## Files

| Role | Path |
|---|---|
| PRE run 1/2/3 | `.trd-state/autonomy-judge-command-scope/pre-run{1,2,3}.json` (already captured by AJCS-T001, untouched by this task) |
| POST run 1/2/3 | `.trd-state/autonomy-judge-command-scope/post-run{1,2,3}.json` (captured by this task) |
| This report | `.trd-state/autonomy-judge-command-scope/compare-report.md` |

All three POST files parse as valid JSON, each carries top-level `overall` (n/tp/fp/tn/fn/precision/recall) and `byClass` keyed by all nine corpus classes including the new `conversational-no-command` class, with no interleaving/corruption (each background job wrote to its own file; stderr logs for all three are empty). n=79 in every run (80-line corpus minus 1 unlabeled/skipped case — same as PRE, so the count is consistent, not a new gap).

## 2. compare-runs.js verdict — verbatim

```
PAIRED COMPARISON  (majority verdict, >= half of runs)
  pre : 3 run(s)   mean precision=0.8910 recall=0.9677
  post: 3 run(s)  mean precision=0.9002 recall=0.9677
  excluded as known harness defects: s-payload-escape-loop-guard

PER-CASE FLIPS
  regressed (correct -> incorrect): none
  recovered c-29d09e2f4280 [self-documentation] was FP

GATES
  no per-case regression      PASS
  A2 self-documentation FP = 0   PASS
  A3 incidental-vocabulary FP = 0  FAIL (c-5d15b63f1acc)
  precision >= 0.9          PASS

VERDICT: FAIL — do not merge; revert or investigate
```

**Exit code: 1.**

This is the actual, unmodified output of `compare-runs.js`. No threshold was touched to make it pass (NG7 — see §7).

## 3. Per-case flip list (the headline, per compare-runs.js's own design rationale)

`compare-runs.js` decides per case on **majority verdict** (wrong in >=2 of 3 runs on each side), which is why this is led with rather than the aggregate means above — the header comment in the script itself documents a real prior case where aggregate TP/FP/TN/FN matched byte-for-byte pre/post while a false positive relocated from a benign class into the A2 zero-tolerance class, invisible to any aggregate-only check.

- **Regressed (correct → incorrect): none.** No case that scored correctly on PRE (majority) scored incorrectly on POST (majority).
- **Recovered (incorrect → correct): `c-29d09e2f4280` [self-documentation], was FP.** This case majority-false-positived in PRE (2/3 runs: pre-run1, pre-run3) and is no longer majority-wrong in POST (only post-run1 flagged it, 1/3). This is the one behavioral improvement the paired comparison can see on this corpus.

Additional detail beyond what `compare-runs.js` prints (computed directly from the same per-run wrong-sets, for the A3 failure below): the two cases still majority-wrong in POST are:

| id | class | kind | POST majority | PRE majority |
|---|---|---|---|---|
| `c-5d15b63f1acc` | incidental-vocabulary | FP | 3/3 | 3/3 |
| `s-payload-escape-subagent-with-bg` | payload-escape-valve | FP | 3/3 | 3/3 |

Both were **already majority-wrong in PRE at 3/3** — identical rate on both sides. This is why `compare-runs.js`'s own "regressed" list correctly shows neither of them: this change did not cause either failure. But the A3 gate (`incidental-vocabulary FP = 0`) is a zero-tolerance check on POST's absolute state, not a regression check, so it fails regardless of pre-existing status. `s-payload-escape-subagent-with-bg` sits in the A3-adjacent `payload-escape-valve` class, which carries no zero-tolerance gate of its own, so it does not independently fail a gate — only `c-5d15b63f1acc` (the A3 class) does.

**This is a real, unmodified gate failure carried forward from before this change** — filed as a discovered risk (§9), not fixed here, per scope discipline.

## 4. Async-class regression — explicit statement

**No async-class case regressed.** `compare-runs.js`'s own per-case flip list reports `regressed: none` across all classes, which covers the async-violation classes this change is measured on: `deferral-explicit`, `deferral-novel-phrasing`, `no-result-returned`, `autonomy-hedge`, `self-documentation`, `incidental-vocabulary`, `payload-escape-valve`. Independently cross-checked the majority-wrong sets for both sides directly (not just trusting the printed line): PRE majority-wrong = `{c-29d09e2f4280, c-5d15b63f1acc, s-payload-escape-subagent-with-bg}`; POST majority-wrong = `{c-5d15b63f1acc, s-payload-escape-subagent-with-bg}` — a strict subset, confirming D8 (Judgment A unconditional, no async-class case may regress) holds on this measurement.

## 5. Offline harness cannot show improvement on the new class — explicit statement, and why

**The offline corpus scoring establishes NO REGRESSION only — it cannot demonstrate the improvement this change exists to deliver.** `conversational-no-command` scored `tp=4 fp=0 tn=4 fn=0` (precision 1.0) in **all three PRE runs** (verified directly, not inferred — `byClass['conversational-no-command']` read from each pre-run file) and again in all three POST runs. PRE already has zero false positives on this class, so POST cannot register a measurable gain there: there is no over-blocking in the offline harness's own output for compare-runs.js to observe going away.

This matches `judge.js`'s own documented fidelity warning and the RESULTS.md divergence note (§6, quoting lines 332-333 below): the offline harness runs a stand-in model against a simulated payload, and precedence- and payload-sensitive behavior is exactly where it diverges from the real in-platform evaluator. The production over-blocking this change targets is a precedence/payload-sensitive phenomenon, so the offline harness — by its own documented limitation — does not reproduce it, and therefore cannot show it being fixed. **The improvement claim rests on AJCS-T004 against a real session, not on these numbers.** This report does not imply otherwise.

## 6. RESULTS.md understatement caveat (lines 332-333)

Quoted verbatim from `test/discipline-corpus/RESULTS.md`:

> **Consequence worth carrying:** on precedence- and payload-sensitive cases the offline corpus
> **understates** the real judge. A2/A3 passing here is conservative, not optimistic.

Cited per instruction — RESULTS.md's own aggregate figures (e.g. the 61-case-corpus numbers at line 167) are **stale** (corpus.jsonl now holds 80 cases) and are **not** cited as current numbers anywhere in this report; only the understatement-caveat language is carried forward, as directed.

## 7. Scope compliance confirmation

- No threshold (`BLOCK_RATE_CEILING`, `PRECISION_FLOOR`, A2/A3 class membership) was touched. `PRECISION_FLOOR = 0.90` in `compare-runs.js` is unchanged; the A2/A3 class definitions are unchanged.
- The corpus (`corpus.jsonl`), the detector (`detectors/judge.js`), the scorer (`score.js`), the comparator (`compare-runs.js`), and every prompt were not modified by this task.
- The three `pre-run{1,2,3}.json` files were not regenerated or touched — verified their mtimes are unchanged from AJCS-T001's capture (19:06:41 / 19:27:08 / 19:48:06 on 2026-08-26) and their content matches what AJCS-T001's grounding block quoted (tp/fp/tn/fn figures for all three runs match exactly).
- The FAIL verdict is reported as-is. No re-run was attempted after the FAIL, and no gate was adjusted to force a PASS.

## 8. [inferred] grounding checked

- **"n=79" / "80-case corpus"** — grounding did not state a case count explicitly for POST; verified `wc -l corpus.jsonl` = 80 and each run's `overall.n` = 79 (both PRE and POST) — consistent, not a discrepancy.
- **PRE figures quoted in the task grounding** (run1 tp=29 fp=4 tn=44 fn=2 prec=0.879; run2 tp=31 fp=3 tn=45 fn=0 prec=0.912; run3 tp=30 fp=4 tn=44 fn=1 prec=0.882) — read directly from `pre-run{1,2,3}.json`'s `overall` object and confirmed byte-exact against the grounding's stated numbers.
- **"`conversational-no-command` class scored tp=4 fp=0 tn=4 fn=0 in all three [PRE] runs"** — confirmed by direct read of `byClass['conversational-no-command']` in all three PRE files. (Note: the discovered.jsonl entry from AJCS-T001/phase-2 records `pre-run3` differently — `tp2 fp0 tn4 fn2` — which appears to be a stale/earlier capture referenced in that discovery note, not this task's own read of the file on disk. This task's own read of `pre-run3.json` on disk shows `tp=4 fp=0 tn=4 fn=0`, matching the task grounding and pre-run1/pre-run2. Flagging the discrepancy rather than silently reconciling it — it is in a different file (`discovered.jsonl`), not this task's `<careful>` grounding, and this task's own grounding is what was verified correct.)
- **RESULTS.md lines 332-333** — read directly; text matches what is quoted in §6.
- **RESULTS.md line 167 "61-case corpus"** — confirmed stale; corpus.jsonl now has 80 lines. Not cited as a current figure anywhere above.

## 9. Discovered (not fixed here, per scope discipline)

Recorded to `.trd-state/autonomy-judge-command-scope/discovered.jsonl`:

> compare-runs.js A3 gate FAILs (exit 1) on a pre-existing, non-regressed FP — `c-5d15b63f1acc` (incidental-vocabulary) and `s-payload-escape-subagent-with-bg` (payload-escape-valve) were majority-wrong 3/3 in BOTH pre and post; this change did not cause it and did not fix it.

This is real information for whoever gates the merge next: the FAIL is not attributable to this change, but it is also not resolved by it, and NG7 forbids touching the gate to route around it here.

## SKILLS_USED / RULES_APPLIED

- **SKILLS_USED:** none (no skill matched; task is pure measurement + comparator invocation, per `<skills><matched>none</matched></skills>`).
- **RULES_APPLIED:** `.claude/rules/constitution.md` (verification_level, scope discipline / non-goals), `.claude/rules/async-discipline.md` (background dispatch via `Bash({run_in_background: true})` for the three ~20-minute `claude --print` scoring runs, verified by artifact rather than trusted exit code per the task's `<careful>` guidance — each POST file was parsed and checked for `overall`/`byClass`/the new class before being used), `.claude/rules/autonomy.md` (no `AskUserQuestion` used — the FAIL verdict is reported, not escalated, since none of the four legitimate-ask cases apply).
