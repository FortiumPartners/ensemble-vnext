#!/usr/bin/env node

/**
 * score.js — detector-agnostic scoring harness for the discipline-hook
 * judgment corpus (docs/TRD/discipline-judgment.md §3.2, task DISC-B003).
 *
 * Usage:
 *   node score.js --detector <name> [--corpus <path>] [--json] [--class <name>]
 *
 * The detector interface is TEXT IN, VERDICT OUT (see detectors/index.js).
 * Both the outgoing regex detector and the incoming judge (DISC-T001) are
 * scored by this exact same code — that is the whole point of §3.2: the
 * regex score is recorded once as a floor to beat, not as a candidate to
 * compare live.
 *
 * Exit codes: 0 on success (scoring ran, regardless of the scores), 1 on a
 * usage/environment error (missing corpus, unknown detector, bad args).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getDetector } = require('./detectors');

const DEFAULT_CORPUS_PATH = path.join(__dirname, 'corpus.jsonl');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    detector: null,
    corpus: DEFAULT_CORPUS_PATH,
    json: false,
    class: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--detector':
        args.detector = argv[++i];
        break;
      case '--corpus':
        args.corpus = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      case '--class':
        args.class = argv[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

const USAGE = `Usage: node score.js --detector <name> [--corpus <path>] [--json] [--class <name>]

  --detector <name>  Required. Which detector to score (see detectors/index.js).
  --corpus <path>    Path to a labeled JSONL corpus. Defaults to
                      test/discipline-corpus/corpus.jsonl.
  --class <name>     Score only cases whose "class" matches <name>.
  --json             Emit machine-readable JSON instead of a text report.
`;

// ---------------------------------------------------------------------------
// Corpus loading
// ---------------------------------------------------------------------------

/**
 * Loads and parses a labeled JSONL corpus. Throws a CorpusError with a clear,
 * actionable message (never a raw stack trace) on any structural problem:
 * missing file, empty file, malformed JSON, or missing/invalid required
 * fields. Cases with label === null (unlabeled, e.g. raw extractor output)
 * are skipped with a warning rather than scored — an unlabeled case has no
 * ground truth to score against.
 *
 * @param {string} corpusPath
 * @returns {{cases: Array<Object>, skippedUnlabeled: number}}
 */
class CorpusError extends Error {}

function loadCorpus(corpusPath) {
  if (!fs.existsSync(corpusPath)) {
    throw new CorpusError(
      `Corpus not found at ${corpusPath}\n\n` +
        `This is expected if DISC-B002 (labeling) hasn't produced corpus.jsonl yet. ` +
        `To generate a corpus:\n` +
        `  1. node test/discipline-corpus/extract.js   # produces candidates.jsonl (unlabeled)\n` +
        `  2. Label candidates.jsonl into corpus.jsonl per docs/TRD/discipline-judgment.md §3.1\n` +
        `  3. Re-run: node test/discipline-corpus/score.js --detector <name>\n\n` +
        `For harness development/self-testing without a real corpus, point --corpus at a fixture, e.g.:\n` +
        `  node test/discipline-corpus/score.js --detector regex --corpus test/discipline-corpus/fixtures/basic.jsonl`
    );
  }

  const raw = fs.readFileSync(corpusPath, 'utf-8');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new CorpusError(`Corpus at ${corpusPath} is empty (no non-blank lines).`);
  }

  const cases = [];
  let skippedUnlabeled = 0;

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new CorpusError(`Corpus at ${corpusPath}:${lineNo} is not valid JSON: ${err.message}`);
    }

    if (typeof parsed.text !== 'string') {
      throw new CorpusError(`Corpus at ${corpusPath}:${lineNo} is missing a string "text" field.`);
    }
    if (parsed.label === null || parsed.label === undefined) {
      skippedUnlabeled += 1;
      return;
    }
    if (parsed.label !== 'violation' && parsed.label !== 'clean') {
      throw new CorpusError(
        `Corpus at ${corpusPath}:${lineNo} has invalid "label" ${JSON.stringify(parsed.label)} — must be "violation" or "clean" (or null for unlabeled).`
      );
    }
    if (typeof parsed.class !== 'string' || parsed.class.length === 0) {
      throw new CorpusError(`Corpus at ${corpusPath}:${lineNo} is missing a "class" field.`);
    }

    cases.push(parsed);
  });

  return { cases, skippedUnlabeled };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return sortedValues[Math.max(0, idx)];
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function emptyBucket() {
  return { tp: 0, fp: 0, tn: 0, fn: 0, times: [], misses: [], falsePositives: [] };
}

function precisionOf(bucket) {
  const denom = bucket.tp + bucket.fp;
  return denom === 0 ? null : bucket.tp / denom;
}

function recallOf(bucket) {
  const denom = bucket.tp + bucket.fn;
  return denom === 0 ? null : bucket.tp / denom;
}

/**
 * Scores every case in `cases` against `detector`. Detector-agnostic: the
 * detector's `detect()` is the only thing that varies between "regex" and a
 * future "judge" — everything else (confusion-matrix bookkeeping, timing,
 * per-case miss/FP tracking) is identical for both, which is the point of
 * §3.2 (the regex and the judge must be measured by the same code).
 *
 * @param {Array<Object>} cases
 * @param {{detect: Function}} detector
 * @returns {Promise<{overall: Object, byClass: Object<string, Object>}>}
 */
async function scoreCases(cases, detector) {
  const overall = emptyBucket();
  const byClass = {};

  for (const testCase of cases) {
    const bucket = (byClass[testCase.class] = byClass[testCase.class] || emptyBucket());

    const start = process.hrtime.bigint();
    const predictedViolation = Boolean(await detector.detect(testCase));
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    overall.times.push(elapsedMs);
    bucket.times.push(elapsedMs);

    const actualViolation = testCase.label === 'violation';

    let outcome;
    if (actualViolation && predictedViolation) outcome = 'tp';
    else if (!actualViolation && predictedViolation) outcome = 'fp';
    else if (!actualViolation && !predictedViolation) outcome = 'tn';
    else outcome = 'fn';

    overall[outcome] += 1;
    bucket[outcome] += 1;

    const caseRecord = {
      id: testCase.id,
      class: testCase.class,
      event: testCase.event,
      source: testCase.source,
      expected: testCase.label,
      predicted: predictedViolation ? 'violation' : 'clean',
      elapsedMs: Number(elapsedMs.toFixed(3)),
      textSnippet: testCase.text.length > 200 ? `${testCase.text.slice(0, 200)}…` : testCase.text,
    };

    if (outcome === 'fn') {
      overall.misses.push(caseRecord);
      bucket.misses.push(caseRecord);
    } else if (outcome === 'fp') {
      overall.falsePositives.push(caseRecord);
      bucket.falsePositives.push(caseRecord);
    }
  }

  return { overall, byClass };
}

function summarizeBucket(bucket) {
  const sortedTimes = [...bucket.times].sort((a, b) => a - b);
  return {
    n: bucket.tp + bucket.fp + bucket.tn + bucket.fn,
    tp: bucket.tp,
    fp: bucket.fp,
    tn: bucket.tn,
    fn: bucket.fn,
    precision: precisionOf(bucket),
    recall: recallOf(bucket),
    meanMs: round(mean(bucket.times)),
    p95Ms: round(percentile(sortedTimes, 95)),
    misses: bucket.misses,
    falsePositives: bucket.falsePositives,
  };
}

function round(n) {
  return n === null || n === undefined ? null : Number(n.toFixed(3));
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fmtPct(x) {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

function formatCaseTable(title, records) {
  if (records.length === 0) return `  ${title}: none\n`;
  let out = `  ${title} (${records.length}):\n`;
  for (const r of records) {
    out += `    - [${r.class}] ${r.id} (${r.event}) expected=${r.expected} predicted=${r.predicted}\n`;
    out += `      source: ${r.source}\n`;
    out += `      text: ${JSON.stringify(r.textSnippet)}\n`;
  }
  return out;
}

function renderTextReport({ detectorName, corpusPath, skippedUnlabeled, overall, byClass }) {
  let out = '';
  out += `Discipline-corpus scoring report\n`;
  out += `  detector: ${detectorName}\n`;
  out += `  corpus:   ${corpusPath}\n`;
  if (skippedUnlabeled > 0) {
    out += `  skipped:  ${skippedUnlabeled} unlabeled case(s) (label === null)\n`;
  }
  out += `\nOverall (n=${overall.n}):\n`;
  out += `  TP=${overall.tp} FP=${overall.fp} TN=${overall.tn} FN=${overall.fn}\n`;
  out += `  precision=${fmtPct(overall.precision)} recall=${fmtPct(overall.recall)}\n`;
  out += `  latency: mean=${overall.meanMs}ms p95=${overall.p95Ms}ms\n`;

  out += `\nBy class:\n`;
  for (const [className, summary] of Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b))) {
    out += `  ${className} (n=${summary.n}): TP=${summary.tp} FP=${summary.fp} TN=${summary.tn} FN=${summary.fn} `;
    out += `precision=${fmtPct(summary.precision)} recall=${fmtPct(summary.recall)} `;
    out += `mean=${summary.meanMs}ms p95=${summary.p95Ms}ms\n`;
  }

  out += `\nMisses and false positives (per-case detail):\n`;
  out += formatCaseTable('False negatives (missed violations)', overall.misses);
  out += formatCaseTable('False positives (wrongly flagged clean)', overall.falsePositives);

  return out;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}`);
    return 1;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (!args.detector) {
    process.stderr.write(`--detector is required.\n\n${USAGE}`);
    return 1;
  }

  let detector;
  try {
    detector = getDetector(args.detector);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }

  let loaded;
  try {
    loaded = loadCorpus(args.corpus);
  } catch (err) {
    if (err instanceof CorpusError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }

  let { cases, skippedUnlabeled } = loaded;

  if (args.class) {
    cases = cases.filter((c) => c.class === args.class);
    if (cases.length === 0) {
      process.stderr.write(`No labeled cases found for class "${args.class}" in ${args.corpus}\n`);
      return 1;
    }
  }

  const { overall: overallBucket, byClass: byClassBuckets } = await scoreCases(cases, detector);

  const overall = summarizeBucket(overallBucket);
  const byClass = {};
  for (const [className, bucket] of Object.entries(byClassBuckets)) {
    byClass[className] = summarizeBucket(bucket);
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          detector: args.detector,
          corpus: args.corpus,
          skippedUnlabeled,
          overall,
          byClass,
        },
        null,
        2
      ) + '\n'
    );
  } else {
    process.stdout.write(
      renderTextReport({
        detectorName: args.detector,
        corpusPath: args.corpus,
        skippedUnlabeled,
        overall,
        byClass,
      })
    );
  }

  return 0;
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`Unexpected error: ${err.stack || err.message}\n`);
      process.exit(1);
    });
}

module.exports = {
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
};
