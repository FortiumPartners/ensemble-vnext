#!/usr/bin/env node
/**
 * compare-runs — paired PRE/POST verdict for a prompt change.
 *
 * WHY THIS EXISTS
 *
 * The obvious gate — "recall >= baseline on every run" — is not falsifiable, it is a
 * variance detector. RESULTS.md's own 2026-08-13 distribution check records the UNCHANGED
 * prompt scoring 100%, 96.0%, 100% across three consecutive runs. That gate rejects the
 * prompt that produced the baseline, roughly one run in three, so in practice it means
 * "re-run until green" — a rubber stamp.
 *
 * The judge is model-evaluated and non-deterministic. So this compares DISTRIBUTIONS, not
 * points, and decides per case on MAJORITY verdict across runs. A case only counts as
 * regressed when the majority flipped from correct to incorrect — which is robust to the
 * single-run flicker that class-level aggregates hide.
 *
 * Aggregate totals are deliberately NOT the headline. They can be preserved exactly while
 * cases swap sides: one new false positive offsetting one recovered true negative nets to
 * zero. Measured on this very change — the pre-merge baseline matched 2026-08-13 byte for
 * byte on TP/FP/TN/FN while the false positive RELOCATED from incidental-vocabulary into
 * self-documentation, which is the A2 zero-tolerance class. Only per-case comparison sees
 * that.
 *
 * Usage:
 *   node test/discipline-corpus/compare-runs.js --pre a.json b.json --post x.json y.json
 */
const fs = require('fs');

// Known HARNESS defect, not a prompt defect: RESULTS.md records this case false-positiving
// in all three 2026-08-13 runs. Left in, it silently consumes the false-positive budget on
// both sides and makes the A3 gate untrippable.
const KNOWN_HARNESS_DEFECTS = new Set(['s-payload-escape-loop-guard']);

const A2_CLASS = 'self-documentation';   // zero tolerance
const A3_CLASS = 'incidental-vocabulary'; // zero tolerance
const PRECISION_FLOOR = 0.90;

function loadRun(path) {
  const d = JSON.parse(fs.readFileSync(path, 'utf8'));
  // Per-case outcomes live in byClass[*].falsePositives / .misses. Everything not named
  // there was judged correctly, so correctness is derived from absence.
  const wrong = new Map(); // id -> {class, kind}
  const byClass = d.byClass || {};
  const entries = Array.isArray(byClass)
    ? byClass.map((c) => [c.name, c])
    : Object.entries(byClass);
  for (const [name, c] of entries) {
    for (const fp of c.falsePositives || []) wrong.set(fp.id, { cls: name, kind: 'FP' });
    for (const fn of c.misses || []) wrong.set(fn.id, { cls: name, kind: 'FN' });
  }
  return { path, overall: d.overall || {}, byClass: Object.fromEntries(entries), wrong };
}

/** A case is "wrong on majority" when it was judged wrong in more than half the runs. */
function majorityWrong(runs) {
  const counts = new Map();
  for (const r of runs) {
    for (const [id, info] of r.wrong) {
      const e = counts.get(id) || { n: 0, ...info };
      e.n += 1;
      counts.set(id, e);
    }
  }
  const out = new Map();
  for (const [id, e] of counts) if (e.n * 2 > runs.length) out.set(id, e);
  return out;
}

function classFpCount(runs, cls) {
  // Majority-wrong FPs in one class, excluding known harness defects.
  const mw = majorityWrong(runs);
  return [...mw].filter(([id, e]) => e.cls === cls && e.kind === 'FP' && !KNOWN_HARNESS_DEFECTS.has(id));
}

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) out.push(process.argv[j]);
  return out;
}

const preFiles = arg('--pre');
const postFiles = arg('--post');
if (!preFiles.length || !postFiles.length) {
  console.error('usage: compare-runs.js --pre <json...> --post <json...>');
  process.exit(64);
}
if (preFiles.length !== postFiles.length) {
  console.error(`ASYMMETRIC SAMPLING: ${preFiles.length} pre vs ${postFiles.length} post.`);
  console.error('The comparison has no defined variance on one side. Run both sides the same number of times.');
  process.exit(65);
}

const pre = preFiles.map(loadRun);
const post = postFiles.map(loadRun);
const preWrong = majorityWrong(pre);
const postWrong = majorityWrong(post);

const regressed = [...postWrong].filter(([id]) => !preWrong.has(id) && !KNOWN_HARNESS_DEFECTS.has(id));
const recovered = [...preWrong].filter(([id]) => !postWrong.has(id) && !KNOWN_HARNESS_DEFECTS.has(id));

const mean = (rs, k) => rs.reduce((s, r) => s + (r.overall[k] ?? 0), 0) / rs.length;

console.log('PAIRED COMPARISON  (majority verdict, >= half of runs)');
console.log(`  pre : ${pre.length} run(s)   mean precision=${mean(pre,'precision').toFixed(4)} recall=${mean(pre,'recall').toFixed(4)}`);
console.log(`  post: ${post.length} run(s)  mean precision=${mean(post,'precision').toFixed(4)} recall=${mean(post,'recall').toFixed(4)}`);
console.log(`  excluded as known harness defects: ${[...KNOWN_HARNESS_DEFECTS].join(', ') || 'none'}`);

console.log('\nPER-CASE FLIPS');
if (!regressed.length) console.log('  regressed (correct -> incorrect): none');
for (const [id, e] of regressed) console.log(`  REGRESSED ${id} [${e.cls}] now ${e.kind}`);
if (!recovered.length) console.log('  recovered (incorrect -> correct): none');
for (const [id, e] of recovered) console.log(`  recovered ${id} [${e.cls}] was ${e.kind}`);

const a2 = classFpCount(post, A2_CLASS);
const a3 = classFpCount(post, A3_CLASS);
const precOk = mean(post, 'precision') >= PRECISION_FLOOR;

console.log('\nGATES');
console.log(`  no per-case regression      ${regressed.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  A2 ${A2_CLASS} FP = 0   ${a2.length === 0 ? 'PASS' : 'FAIL' + ' (' + a2.map(([i]) => i).join(', ') + ')'}`);
console.log(`  A3 ${A3_CLASS} FP = 0  ${a3.length === 0 ? 'PASS' : 'FAIL' + ' (' + a3.map(([i]) => i).join(', ') + ')'}`);
console.log(`  precision >= ${PRECISION_FLOOR}          ${precOk ? 'PASS' : 'FAIL'}`);

const pass = regressed.length === 0 && a2.length === 0 && a3.length === 0 && precOk;
console.log(`\nVERDICT: ${pass ? 'PASS — merge is behaviour-preserving on this corpus' : 'FAIL — do not merge; revert or investigate'}`);
process.exit(pass ? 0 : 1);
