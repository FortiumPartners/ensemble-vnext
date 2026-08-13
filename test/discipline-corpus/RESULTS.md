# Discipline-corpus scoring results

## Regex floor — NOT YET RECORDED

As of 2026-08-13, `test/discipline-corpus/corpus.jsonl` (the labeled acceptance corpus,
DISC-B002) does not exist yet — only the unlabeled `candidates.jsonl` (DISC-B001 output, 1517
cases) is present. The scoring harness (`score.js`, DISC-B003) is built and self-tested against
`fixtures/basic.jsonl`, but the **regex floor** — the outgoing `detectDeferredWorkClaim`
implementation's score, which the incoming judge (DISC-T001) must beat per TRD §6.1 — can only
be computed once `corpus.jsonl` exists.

### How to regenerate this file once corpus.jsonl exists

```bash
node test/discipline-corpus/score.js --detector regex --json > /tmp/regex-floor.json
node test/discipline-corpus/score.js --detector regex
```

Paste the text-report output below, dated, under "Regex floor (dated)". Do not overwrite this
placeholder section — append the real results once available; the first run also becomes the
data-availability record for when DISC-B002 finished.

### Expected shape of the result (from harness self-tests against fixtures, not the real corpus)

The regex detector (`packages/core/hooks/subagent-discipline.js`'s `detectDeferredWorkClaim`,
scored via `test/discipline-corpus/detectors/regex.js`) is expected, **by construction**, to
score:

- **Zero recall on `no-result-returned`.** This class (TRD §2.3(2), §3.1) has no deferral
  vocabulary at all — an agent that burns tokens and returns nothing usable, without ever
  saying "I'll let you know" or similar. The regex detector is pattern/vocabulary-based, so it
  structurally cannot catch this shape. This is **the capability gap that motivates the switch
  to judge-based detection (TRD §1.1)** — it is not a bug in this scoring harness, and DISC-T001
  is explicitly required (§6.1 A4) to show recall > 0 on this class where the regex floor is 0.
- Reasonable recall on `deferral-explicit` and `deferral-novel-phrasing` (the regex's designed
  strength — see the harness self-test in `score.test.js`, which confirms both fixture cases,
  including the 4.1.8 live-miss verbatim text, are caught by the current patterns).
- Zero (or near-zero) false positives on `self-documentation` and `incidental-vocabulary` —
  the hard-negative classes the `SELF_DOC_MARKERS` / `META_MARKERS` machinery in
  `lib/async-claim-detector.js` exists specifically to protect.

These directional expectations are already confirmed against the 6-case
`fixtures/basic.jsonl` harness self-test (`score.test.js`, "end-to-end with the real 'regex'
detector"). They are not a substitute for the real floor — class sizes there are n=1 each, far
below the TRD §3.1 floors (10/5/5/5/15/10/5) needed for the acceptance thresholds in §6.1 to be
meaningful.

---

## Regex floor (dated)

_(Not yet recorded — append here once `corpus.jsonl` exists, per the regeneration steps above.)_
