#!/usr/bin/env node
'use strict';
/**
 * Per-agent-type timing from dispatch ledgers (.trd-state/<feature>/dispatch.jsonl
 * or .trd-state/_dispatch.jsonl, written by .claude/hooks/dispatch-ledger.js).
 *
 * Usage: node test/smoke/ledger-timing.js [--json] <ledger.jsonl> [more.jsonl ...]
 *
 * Output (one line per agent_type, sorted by name):
 *   backend-implementer median 90s max 120s n=2
 *   unfinished 0
 * All files are pooled. Start and stop are paired on agent_id (never prompt_id);
 * agent_type comes from the start event, since stop events often omit it.
 * A start with no stop is counted as unfinished, never as a duration.
 */
const fs = require('fs');

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** @param {string[]} lines raw ledger lines (any number of files, concatenated) */
function summarize(lines) {
  const starts = new Map(); // agent_id -> {ms, type}
  const stops = new Map(); // agent_id -> ms (first stop wins)
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object' || !e.agent_id) continue;
    const ms = Date.parse(e.ts);
    if (Number.isNaN(ms)) continue;
    if (e.event === 'start' && !starts.has(e.agent_id)) {
      starts.set(e.agent_id, { ms, type: e.agent_type || 'unknown' });
    } else if (e.event === 'stop' && !stops.has(e.agent_id)) {
      stops.set(e.agent_id, ms);
    }
  }
  const durations = {};
  let unfinished = 0;
  for (const [id, s] of starts) {
    if (!stops.has(id)) { unfinished++; continue; }
    (durations[s.type] ||= []).push((stops.get(id) - s.ms) / 1000);
  }
  const types = {};
  for (const t of Object.keys(durations).sort()) {
    types[t] = { median: median(durations[t]), max: Math.max(...durations[t]), n: durations[t].length };
  }
  return { types, unfinished };
}

function formatText({ types, unfinished }) {
  const rows = Object.entries(types).map(([t, v]) => `${t} median ${v.median}s max ${v.max}s n=${v.n}`);
  rows.push(`unfinished ${unfinished}`);
  return rows.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const files = argv.filter((a) => a !== '--json');
  if (files.length === 0) {
    process.stderr.write('usage: ledger-timing.js [--json] <dispatch.jsonl> [...]\n');
    return 2;
  }
  const lines = [];
  for (const f of files) {
    try { lines.push(...fs.readFileSync(f, 'utf8').split('\n')); } catch (err) {
      process.stderr.write(`ledger-timing: cannot read ${f}: ${err.message}\n`);
      return 1;
    }
  }
  const result = summarize(lines);
  process.stdout.write((json ? JSON.stringify(result) : formatText(result)) + '\n');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { summarize, formatText, median };
