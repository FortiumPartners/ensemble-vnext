/**
 * score.js Test Suite (DISC-B003)
 *
 * Proves the scoring harness itself is correct — a harness that miscounts
 * would silently invalidate every downstream decision (regex floor, judge
 * acceptance thresholds in TRD §6.1). Uses a synthetic "stub" detector with
 * known, hand-picked verdicts so the expected confusion matrix can be
 * computed by hand, plus the real "regex" detector against small fixtures
 * to prove the wiring (import path, CLI, JSON/text output) works end to end.
 *
 * Run with: npx jest test/discipline-corpus/score.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  loadCorpus,
  scoreCases,
  summarizeBucket,
  precisionOf,
  recallOf,
  mean,
  percentile,
  CorpusError,
  run,
} = require('./score');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const BASIC_FIXTURE = path.join(FIXTURES_DIR, 'basic.jsonl');
const PAYLOAD_DEPENDENT_FIXTURE = path.join(FIXTURES_DIR, 'payload-dependent.jsonl');

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'score-test-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// A detector whose verdicts are fully controlled by the test, keyed by case id.
function stubDetector(verdictsById) {
  return {
    name: 'stub',
    detect(testCase) {
      if (!(testCase.id in verdictsById)) {
        throw new Error(`stubDetector: no verdict configured for ${testCase.id}`);
      }
      return verdictsById[testCase.id];
    },
  };
}

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  test('parses --detector, --corpus, --json, --class', () => {
    const args = parseArgs(['--detector', 'regex', '--corpus', '/tmp/x.jsonl', '--json', '--class', 'clean-completion']);
    expect(args.detector).toBe('regex');
    expect(args.corpus).toBe('/tmp/x.jsonl');
    expect(args.json).toBe(true);
    expect(args.class).toBe('clean-completion');
  });

  test('defaults corpus to test/discipline-corpus/corpus.jsonl, json false', () => {
    const args = parseArgs(['--detector', 'regex']);
    expect(args.corpus.endsWith(path.join('discipline-corpus', 'corpus.jsonl'))).toBe(true);
    expect(args.json).toBe(false);
    expect(args.class).toBeNull();
  });

  test('throws on unknown argument', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// loadCorpus
// ---------------------------------------------------------------------------

describe('loadCorpus', () => {
  test('throws a clear CorpusError (not a raw stack trace) when the file is missing', () => {
    expect(() => loadCorpus('/nonexistent/path/corpus.jsonl')).toThrow(CorpusError);
    expect(() => loadCorpus('/nonexistent/path/corpus.jsonl')).toThrow(/Corpus not found/);
  });

  test('throws on an empty file', () => {
    const p = tmpFile('empty.jsonl', '');
    expect(() => loadCorpus(p)).toThrow(/empty/);
  });

  test('throws on malformed JSON with line number', () => {
    const p = tmpFile('bad.jsonl', '{"id":"a","text":"x","label":"clean","class":"clean-completion"}\nnot json\n');
    expect(() => loadCorpus(p)).toThrow(/:2 is not valid JSON/);
  });

  test('throws on a missing "text" field', () => {
    const p = tmpFile('no-text.jsonl', '{"id":"a","label":"clean","class":"clean-completion"}\n');
    expect(() => loadCorpus(p)).toThrow(/missing a string "text"/);
  });

  test('throws on an invalid label value', () => {
    const p = tmpFile('bad-label.jsonl', '{"id":"a","text":"x","label":"maybe","class":"clean-completion"}\n');
    expect(() => loadCorpus(p)).toThrow(/invalid "label"/);
  });

  test('throws on a missing class field', () => {
    const p = tmpFile('no-class.jsonl', '{"id":"a","text":"x","label":"clean"}\n');
    expect(() => loadCorpus(p)).toThrow(/missing a "class" field/);
  });

  test('skips (does not error on) unlabeled cases and reports the count', () => {
    const p = tmpFile(
      'mixed.jsonl',
      [
        '{"id":"a","text":"x","label":null,"class":"unlabeled"}',
        '{"id":"b","text":"y","label":"clean","class":"clean-completion"}',
      ].join('\n')
    );
    const { cases, skippedUnlabeled } = loadCorpus(p);
    expect(skippedUnlabeled).toBe(1);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe('b');
  });

  test('loads the real fixtures/basic.jsonl with all 6 cases labeled', () => {
    const { cases, skippedUnlabeled } = loadCorpus(BASIC_FIXTURE);
    expect(skippedUnlabeled).toBe(0);
    expect(cases).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// scoreCases — confusion matrix correctness (the core of the harness)
// ---------------------------------------------------------------------------

describe('scoreCases', () => {
  test('computes an exact confusion matrix against hand-picked stub verdicts', async () => {
    const cases = [
      { id: 'v1', text: 't', label: 'violation', class: 'A' }, // detector says true -> TP
      { id: 'v2', text: 't', label: 'violation', class: 'A' }, // detector says false -> FN
      { id: 'c1', text: 't', label: 'clean', class: 'A' }, // detector says false -> TN
      { id: 'c2', text: 't', label: 'clean', class: 'A' }, // detector says true -> FP
    ];
    const detector = stubDetector({ v1: true, v2: false, c1: false, c2: true });

    const { overall, byClass } = await scoreCases(cases, detector);

    expect(overall.tp).toBe(1);
    expect(overall.fn).toBe(1);
    expect(overall.tn).toBe(1);
    expect(overall.fp).toBe(1);
    expect(overall.misses).toHaveLength(1);
    expect(overall.misses[0].id).toBe('v2');
    expect(overall.falsePositives).toHaveLength(1);
    expect(overall.falsePositives[0].id).toBe('c2');

    // Single class "A" should mirror overall exactly.
    expect(byClass.A.tp).toBe(1);
    expect(byClass.A.fn).toBe(1);
    expect(byClass.A.tn).toBe(1);
    expect(byClass.A.fp).toBe(1);
  });

  test('splits cases across classes correctly', async () => {
    const cases = [
      { id: 'a1', text: 't', label: 'violation', class: 'alpha' },
      { id: 'a2', text: 't', label: 'clean', class: 'alpha' },
      { id: 'b1', text: 't', label: 'violation', class: 'beta' },
    ];
    const detector = stubDetector({ a1: true, a2: false, b1: false });

    const { byClass } = await scoreCases(cases, detector);

    expect(byClass.alpha.tp).toBe(1);
    expect(byClass.alpha.tn).toBe(1);
    expect(byClass.alpha.fp).toBe(0);
    expect(byClass.alpha.fn).toBe(0);

    expect(byClass.beta.tp).toBe(0);
    expect(byClass.beta.fn).toBe(1);
  });

  test('supports an async detector (for a future LLM-judge detector)', async () => {
    const cases = [{ id: 'v1', text: 't', label: 'violation', class: 'A' }];
    const detector = {
      async detect() {
        return true;
      },
    };
    const { overall } = await scoreCases(cases, detector);
    expect(overall.tp).toBe(1);
  });

  test('records per-case wall-clock timing for every case', async () => {
    const cases = [{ id: 'v1', text: 't', label: 'violation', class: 'A' }];
    const detector = stubDetector({ v1: true });
    const { overall } = await scoreCases(cases, detector);
    expect(overall.times).toHaveLength(1);
    expect(overall.times[0]).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// precision / recall / mean / percentile helpers
// ---------------------------------------------------------------------------

describe('precisionOf / recallOf', () => {
  test('precision and recall on a known bucket', () => {
    const bucket = { tp: 3, fp: 1, tn: 5, fn: 2 };
    expect(precisionOf(bucket)).toBeCloseTo(3 / 4);
    expect(recallOf(bucket)).toBeCloseTo(3 / 5);
  });

  test('returns null (not NaN or Infinity) when denominator is zero', () => {
    expect(precisionOf({ tp: 0, fp: 0, tn: 5, fn: 0 })).toBeNull();
    expect(recallOf({ tp: 0, fp: 0, tn: 5, fn: 0 })).toBeNull();
  });
});

describe('mean / percentile', () => {
  test('mean of a known array', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  test('mean of empty array is null', () => {
    expect(mean([])).toBeNull();
  });

  test('p95 of a known sorted array lands on the expected index', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    // ceil(0.95 * 100) - 1 = 94 (0-indexed) -> value 95
    expect(percentile(sorted, 95)).toBe(95);
  });

  test('percentile of empty array is null', () => {
    expect(percentile([], 95)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// summarizeBucket
// ---------------------------------------------------------------------------

describe('summarizeBucket', () => {
  test('n is the sum of all four confusion-matrix cells', () => {
    const bucket = { tp: 2, fp: 1, tn: 3, fn: 1, times: [1, 2, 3], misses: [], falsePositives: [] };
    const summary = summarizeBucket(bucket);
    expect(summary.n).toBe(7);
    expect(summary.meanMs).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// End-to-end against the real regex detector + fixtures
// ---------------------------------------------------------------------------

describe('end-to-end with the real "regex" detector against fixtures/basic.jsonl', () => {
  test('matches the known regex behavior on each fixture class', async () => {
    const { cases } = loadCorpus(BASIC_FIXTURE);
    const { getDetector } = require('./detectors');
    const detector = getDetector('regex');

    const { overall, byClass } = await scoreCases(cases, detector);

    // deferral-explicit and deferral-novel-phrasing: regex catches both (its
    // designed strength).
    expect(byClass['deferral-explicit'].tp).toBe(1);
    expect(byClass['deferral-novel-phrasing'].tp).toBe(1);

    // no-result-returned: regex is expected to score ZERO recall here BY
    // CONSTRUCTION (TRD §1.1, §6.1 A4) — no deferral vocabulary is present,
    // so this must land as a false negative, not a bug in the harness.
    expect(byClass['no-result-returned'].fn).toBe(1);
    expect(byClass['no-result-returned'].tp).toBe(0);

    // The three clean classes, including the hard negatives, must not false-positive.
    expect(byClass['clean-completion'].fp).toBe(0);
    expect(byClass['self-documentation'].fp).toBe(0);
    expect(byClass['incidental-vocabulary'].fp).toBe(0);

    expect(overall.tp + overall.fp + overall.tn + overall.fn).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// CLI (run()) — exit codes and error messaging
// ---------------------------------------------------------------------------

describe('run() CLI entrypoint', () => {
  let stdout;
  let stderr;
  let stdoutSpy;
  let stderrSpy;

  beforeEach(() => {
    stdout = '';
    stderr = '';
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += chunk;
      return true;
    });
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += chunk;
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('exits 1 with usage when --detector is missing', async () => {
    const code = await run(['--corpus', BASIC_FIXTURE]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/--detector is required/);
  });

  test('exits 1 with a clear message for an unknown detector', async () => {
    const code = await run(['--detector', 'nonexistent', '--corpus', BASIC_FIXTURE]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/Unknown detector "nonexistent"/);
  });

  test('exits 1 with a clear message (no stack trace) when the corpus is missing', async () => {
    const code = await run(['--detector', 'regex', '--corpus', '/nonexistent/corpus.jsonl']);
    expect(code).toBe(1);
    expect(stderr).toMatch(/Corpus not found/);
    expect(stderr).not.toMatch(/at Object\.<anonymous>/); // no raw stack trace
  });

  test('exits 0 and prints a text report against fixtures/basic.jsonl', async () => {
    const code = await run(['--detector', 'regex', '--corpus', BASIC_FIXTURE]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Discipline-corpus scoring report/);
    expect(stdout).toMatch(/detector: regex/);
    expect(stdout).toMatch(/Overall \(n=6\)/);
  });

  test('exits 0 and prints valid JSON with --json', async () => {
    const code = await run(['--detector', 'regex', '--corpus', BASIC_FIXTURE, '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.detector).toBe('regex');
    expect(parsed.overall.n).toBe(6);
    expect(parsed.byClass['deferral-explicit'].tp).toBe(1);
  });

  test('--class filters to a single class', async () => {
    const code = await run(['--detector', 'regex', '--corpus', BASIC_FIXTURE, '--json', '--class', 'clean-completion']);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.overall.n).toBe(1);
    expect(Object.keys(parsed.byClass)).toEqual(['clean-completion']);
  });

  test('--class with no matching cases exits 1', async () => {
    const code = await run(['--detector', 'regex', '--corpus', BASIC_FIXTURE, '--class', 'does-not-exist']);
    expect(code).toBe(1);
    expect(stderr).toMatch(/No labeled cases found for class/);
  });

  // -------------------------------------------------------------------------
  // §3.1.1 — "payload-dependent" exclusion
  // -------------------------------------------------------------------------
  //
  // Regression coverage for a real bug found while building DISC-B004's judge
  // detector: the TRD says payload-dependent cases (correct label depends on
  // background_tasks/session_crons, not on text alone) must be EXCLUDED from
  // text-only detector scoring, not scored against whatever a detector's
  // payload-less default happens to answer. Before this fix, score.js scored
  // them anyway — silently answering a question the case wasn't asking, and
  // quietly contaminating both overall and per-class numbers.

  test('excludes payload-dependent cases from overall scoring by default', async () => {
    const code = await run(['--detector', 'regex', '--corpus', PAYLOAD_DEPENDENT_FIXTURE, '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    // Fixture has 3 cases (1 violation, 1 clean, 1 payload-dependent); only
    // the first 2 should count toward the overall confusion matrix.
    expect(parsed.overall.n).toBe(2);
    expect(parsed.excludedPayloadDependent).toBe(1);
    expect(Object.keys(parsed.byClass)).not.toContain('payload-dependent');
  });

  test('text report surfaces the exclusion count', async () => {
    const code = await run(['--detector', 'regex', '--corpus', PAYLOAD_DEPENDENT_FIXTURE]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/excluded:\s+1 "payload-dependent" case/);
    expect(stdout).toMatch(/Overall \(n=2\)/);
  });

  test('--class payload-dependent explicitly still shows those cases (inspection, not scoring)', async () => {
    const code = await run(['--detector', 'regex', '--corpus', PAYLOAD_DEPENDENT_FIXTURE, '--json', '--class', 'payload-dependent']);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.overall.n).toBe(1);
    expect(parsed.excludedPayloadDependent).toBe(0);
    expect(Object.keys(parsed.byClass)).toEqual(['payload-dependent']);
  });

  test('does not exclude payload-dependent cases when filtering to a different class', async () => {
    // Sanity check: the exclusion must not accidentally eat cases of the
    // class actually being requested.
    const code = await run(['--detector', 'regex', '--corpus', PAYLOAD_DEPENDENT_FIXTURE, '--json', '--class', 'clean-completion']);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.overall.n).toBe(1);
    expect(Object.keys(parsed.byClass)).toEqual(['clean-completion']);
  });
});
