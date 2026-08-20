#!/usr/bin/env node
'use strict';

/**
 * token-usage.js — token consumption across Claude Code sessions, from the transcripts.
 *
 * WHY THIS EXISTS: the framework's cost claims have all been per-run measurements taken by
 * hand ("40 agents vs 16", "$131 vs $67"). There was no way to answer "what did the last week
 * actually cost, and where did it go" without re-deriving it each time.
 *
 * WHAT IT COUNTS. Every assistant message carries a `usage` block with four token classes,
 * and they are NOT interchangeable:
 *
 *   output               generated. The expensive one, ~5x input on every published rate card.
 *   input                fresh prompt tokens, uncached.
 *   cache_creation       written to cache — charged at a PREMIUM over plain input.
 *   cache_read           served from cache — charged at a large DISCOUNT.
 *
 * Summing them into one number is the obvious mistake and it is badly wrong: a long session
 * is mostly cache_read, so a raw total tracks session LENGTH rather than cost. They are
 * reported separately here for that reason, and `output` is what to watch.
 *
 * NO PRICING. This deliberately prints no dollar figure. Rates differ by model and tier,
 * change without notice, and a stale hardcoded rate produces a confident wrong number --
 * worse than none. Multiply by your own current rates.
 *
 * Subagent turns are included: they write into the same transcript tree and their tokens are
 * as real as the lead's. That is the point -- fan-out is where the spend goes.
 *
 *   node token-usage.js [--days N] [--by project|model|day] [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(os.homedir(), '.claude', 'projects');
const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const DAYS = Number(arg('--days', 7));
const BY = arg('--by', 'project');
const AS_JSON = argv.includes('--json');

const since = Date.now() - DAYS * 86400_000;
const blank = () => ({ output: 0, input: 0, cacheCreate: 0, cacheRead: 0, msgs: 0 });

/**
 * Accumulate ONE usage block. The four classes stay separate on purpose -- see the header.
 * There is deliberately no `total` field: a caller that wants one has to decide which classes
 * to combine and own that decision, rather than inheriting a meaningless sum from here.
 */
const add = (a, u) => {
  a.output += u.output_tokens || 0;
  a.input += u.input_tokens || 0;
  a.cacheCreate += u.cache_creation_input_tokens || 0;
  a.cacheRead += u.cache_read_input_tokens || 0;
  a.msgs += 1;
};

/** Which bucket a row belongs to. Pure, so the grouping is testable without a filesystem. */
function groupKey(by, { dir = '', model = '', ts = 0 }) {
  if (by === 'model') return model || 'unknown';
  if (by === 'day') return new Date(ts).toISOString().slice(0, 10);
  return dir.replace(/^-Users-[a-z]+-/, '').replace(/-/g, '/');
}

/** Fold rows -> {groups, total}. Pure: rows are {usage, dir, model, ts}. */
function aggregate(rows, by, since) {
  const groups = {};
  const total = blank();
  for (const r of rows || []) {
    if (!r || !r.usage) continue;
    if (Number.isFinite(since) && !(r.ts >= since)) continue;
    const k = groupKey(by, r);
    add((groups[k] = groups[k] || blank()), r.usage);
    add(total, r.usage);
  }
  return { groups, total };
}

module.exports = { aggregate, groupKey, blank, add };

// Everything below is the CLI. Guarded so `require()` gets the pure functions only --
// a top-level `return` here is valid in CommonJS but Babel (and therefore jest) rejects it.
if (require.main === module) main();

function main() {

const groups = {};
const total = blank();
let files = 0, skipped = 0;

for (const dir of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
  const full = path.join(ROOT, dir);
  let entries;
  try { entries = fs.readdirSync(full).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
  for (const file of entries) {
    const fp = path.join(full, file);
    // Cheap pre-filter: a transcript untouched since the window cannot contain rows in it.
    try { if (fs.statSync(fp).mtimeMs < since) { skipped++; continue; } } catch { continue; }
    files++;
    let raw;
    try { raw = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line || line.indexOf('"usage"') === -1) continue;   // avoid parsing every row
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const u = (d.message || {}).usage;
      if (!u) continue;
      const ts = Date.parse(d.timestamp || '');
      if (!Number.isFinite(ts) || ts < since) continue;
      const key =
        BY === 'model' ? ((d.message || {}).model || 'unknown')
      : BY === 'day'   ? new Date(ts).toISOString().slice(0, 10)
      :                  dir.replace(/^-Users-[a-z]+-/, '').replace(/-/g, '/');
      add((groups[key] = groups[key] || blank()), u);
      add(total, u);
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ days: DAYS, by: BY, total, groups }, null, 2));
  process.exit(0);
}

const M = (n) => (n / 1e6).toFixed(1) + 'M';
const rows = Object.entries(groups).sort((a, b) => b[1].output - a[1].output);
const w = Math.min(46, Math.max(12, ...rows.map(([k]) => k.length)));

console.log(`\nToken usage — last ${DAYS} day(s), grouped by ${BY}`);
console.log(`${files} transcript(s) in window, ${skipped} skipped as older\n`);
console.log(`${'GROUP'.padEnd(w)}  ${'OUTPUT'.padStart(8)}  ${'INPUT'.padStart(8)}  ${'CACHE-WR'.padStart(8)}  ${'CACHE-RD'.padStart(9)}  ${'MSGS'.padStart(7)}`);
console.log('-'.repeat(w + 50));
for (const [k, v] of rows) {
  console.log(`${k.slice(0, w).padEnd(w)}  ${M(v.output).padStart(8)}  ${M(v.input).padStart(8)}  ${M(v.cacheCreate).padStart(8)}  ${M(v.cacheRead).padStart(9)}  ${String(v.msgs).padStart(7)}`);
}
console.log('-'.repeat(w + 50));
console.log(`${'TOTAL'.padEnd(w)}  ${M(total.output).padStart(8)}  ${M(total.input).padStart(8)}  ${M(total.cacheCreate).padStart(8)}  ${M(total.cacheRead).padStart(9)}  ${String(total.msgs).padStart(7)}`);
console.log(`\nOUTPUT is the one to watch — roughly 5x input per token on every published rate card.`);
console.log(`CACHE-RD is heavily discounted; a big number there means long sessions, not big spend.`);
console.log(`No dollar figures: rates vary by model and tier and change. Multiply by your own.\n`);
}
