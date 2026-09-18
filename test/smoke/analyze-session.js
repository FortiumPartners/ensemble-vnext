#!/usr/bin/env node
'use strict';

/**
 * analyze-session.js — attribute a run's wall-clock from its session JSONL.
 *
 * WHY THIS EXISTS
 *
 * implement-one-task went from 341s (baseline, 4.1.3) to ~780s at HEAD. Three plausible
 * causes were argued for hours with no way to separate them: item 8's accepted +74% wall
 * clock, the ~16.6s model-judge call now on every Stop/SubagentStop, and model routing.
 * One of those arguments (routing) turned out to be wrong, and it was wrong because nobody
 * could read where the time actually went — the scenario deleted its own session log.
 *
 * Guessing at a performance regression is how you spend a day fixing the wrong thing.
 *
 * WHAT IT MEASURES
 *
 * Each record carries a timestamp. The gap between consecutive records is time the harness
 * was NOT generating text, which is where hook latency, subagent dispatch and platform
 * overhead all live. Gaps are bucketed by what preceded them, so a Stop-hook judge call
 * shows up separately from a subagent doing real work.
 *
 * Usage: node analyze-session.js <session.jsonl> [--top N]
 */

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: analyze-session.js <session.jsonl> [--top N]');
  process.exit(1);
}
const topN = Number((process.argv.find((a) => a.startsWith('--top=')) || '--top=12').split('=')[1]);

const records = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('{'))
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

if (!records.length) {
  console.error('no JSON records found');
  process.exit(1);
}

const ts = (r) => (r.timestamp ? Date.parse(r.timestamp) : null);
const stamped = records.filter((r) => ts(r) !== null);
if (stamped.length < 2) {
  console.error(`only ${stamped.length} timestamped record(s) — cannot attribute time`);
  process.exit(1);
}

/** What kind of record is this, for bucketing the gap that FOLLOWS it. */
function label(r) {
  if (r.type === 'assistant') {
    const c = r.message?.content || [];
    const tools = c.filter((b) => b.type === 'tool_use').map((b) => b.name);
    if (tools.length) return `assistant -> ${[...new Set(tools)].join(',')}`;
    return 'assistant -> text';
  }
  if (r.type === 'user') {
    const c = r.message?.content || [];
    if (c.some?.((b) => b.type === 'tool_result')) return 'tool_result';
    if (r.isMeta) return 'meta (hook feedback)';
    return 'user';
  }
  return r.type || 'unknown';
}

const total = ts(stamped[stamped.length - 1]) - ts(stamped[0]);
const buckets = new Map();
const gaps = [];

for (let i = 1; i < stamped.length; i++) {
  const gap = ts(stamped[i]) - ts(stamped[i - 1]);
  if (gap <= 0) continue;
  const key = label(stamped[i - 1]);
  buckets.set(key, (buckets.get(key) || 0) + gap);
  gaps.push({ gap, from: key, to: label(stamped[i]) });
}

const pct = (ms) => ((ms / total) * 100).toFixed(1).padStart(5);
const secs = (ms) => (ms / 1000).toFixed(1).padStart(7);

console.log(`\nsession: ${file}`);
console.log(`records: ${records.length} (${stamped.length} timestamped)`);
console.log(`wall-clock spanned: ${(total / 1000).toFixed(1)}s\n`);

console.log('TIME BY WHAT PRECEDED THE GAP');
[...buckets.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, ms]) => console.log(`  ${secs(ms)}s  ${pct(ms)}%  ${k}`));

console.log(`\nSLOWEST ${topN} INDIVIDUAL GAPS`);
gaps
  .sort((a, b) => b.gap - a.gap)
  .slice(0, topN)
  .forEach((g) => console.log(`  ${secs(g.gap)}s  ${g.from}  ->  ${g.to}`));

const meta = gaps.filter((g) => g.to.startsWith('meta'));
if (meta.length) {
  const t = meta.reduce((a, g) => a + g.gap, 0);
  console.log(`\nHOOK FEEDBACK (blocks): ${meta.length} occurrence(s), ${(t / 1000).toFixed(1)}s preceding them`);
}
