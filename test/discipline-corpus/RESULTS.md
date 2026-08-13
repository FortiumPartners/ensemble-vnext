# Corpus scoring results

Regenerate with:

```bash
node test/discipline-corpus/score.js --detector regex           # human-readable
node test/discipline-corpus/score.js --detector regex --json    # machine-readable
```

---

## Regex baseline — the floor to beat (recorded 2026-08-13)

The **outgoing** implementation: `detectDeferredWorkClaim` from
`packages/core/hooks/subagent-discipline.js`, composing `FIRE_AND_FORGET_PATTERNS` with
`SUBAGENT_DEFERRAL_PATTERNS`. This is the *patched* battery — it includes 4.1.8's
"waiting on" / "awaiting" fix — so the incoming judge must beat the **fixed** version,
not the broken one that shipped the live miss.

Corpus: `corpus.jsonl`, 64 cases (DISC-B002).

```
Overall (n=64):  TP=3  FP=0  TN=36  FN=25
                 precision=100.0%   recall=10.7%
                 latency: mean=0.07ms  p95=0.214ms
```

| Class | n | Recall | Note |
|---|---|---|---|
| `deferral-explicit` | 8 | **0.0%** | Includes the single real case in the corpus — see below |
| `deferral-novel-phrasing` | 7 | 42.9% | Catches the 4.1.8 live miss (patched), misses 4 others |
| `no-result-returned` | 7 | **0.0%** | Zero **by construction** — no vocabulary to match |
| `autonomy-hedge` | 6 | **0.0%** | Zero by construction |
| `clean-completion` | 17 | — | 17 TN, 0 FP |
| `self-documentation` | 11 | — | 11 TN, 0 FP |
| `incidental-vocabulary` | 8 | — | 8 TN, 0 FP |

### How to read this — do NOT quote 10.7% as a field catch-rate

The corpus is **deliberately adversarial** and weighted toward classes the regexes cannot
address. `no-result-returned` and `autonomy-hedge` (13 of 25 violations) have no
vocabulary signature at all, so a pattern matcher scores zero on them by construction.
That is the capability gap motivating the switch, not a defect in the battery or the
harness. The honest summary is:

- **Precision is perfect (100%, zero false positives across all 36 clean cases** — including
  the 11 hard `self-documentation` negatives). The regexes are *conservative*, and the
  anti-false-positive apparatus (code-span stripping, meta-markers, `SELF_DOC_MARKERS`)
  is doing its job. Any replacement must match this; §6.1 A2 makes it zero-tolerance.
- **Recall is the problem, and it is structural.** The battery only finds what someone
  already thought to write a pattern for.

### The most damning single case

`c-721c6cbae6f1` — real, from a live subagent transcript, and a textbook explicit deferral
that the battery misses completely:

> "Waiting for p1_consolidate's go-ahead. When it arrives I'll make the edit, verify tsc,
> and report back to team-lead."

It fails both relevant patterns:

- `waiting for` requires a following `notification|monitor|completion|event|result|to
  arrive|arrives|completes|finishes`. The object here is "go-ahead" — none of them.
- `I'll…report back` requires `once|when|after` **after** the phrase. Here "When it
  arrives" comes **before** it.

This is the third independent instance of the same failure mode (after 4.1.8's "waiting
on" live miss and the `no-result-returned` class), and the first found in real production
text rather than by construction. Two near-misses on one sentence is what a vocabulary
matcher looks like when the vocabulary is anyone's but the author's.

---

## Judge — pending

Recorded by DISC-T001 against §6.1 A1–A5. Add `--detector judge` to
`detectors/index.js`; `score.js` needs no changes.
