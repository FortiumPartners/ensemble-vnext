#!/usr/bin/env node
'use strict';
/**
 * Per-agent-type timing from dispatch ledgers (.trd-state/<feature>/dispatch.jsonl
 * or .trd-state/_dispatch.jsonl, written by .claude/hooks/dispatch-ledger.js).
 *
 * Usage: node test/smoke/ledger-timing.js [--json] <ledger.jsonl> [more.jsonl ...]
 *        node test/smoke/ledger-timing.js [--json] --per-task <ledger.jsonl>
 *        node test/smoke/ledger-timing.js [--json] --compare --before <ledger>... --after <ledger>...
 * (--compare pairs before-run k with after-run k; one ledger per run.)
 *
 * Output (one line per agent_type, sorted by name):
 *   backend-implementer median 90s max 120s n=2
 *   unfinished 0
 * All files are pooled. Start and stop are paired on agent_id (never prompt_id);
 * agent_type comes from the start event, since stop events often omit it.
 * A start with no stop is counted as unfinished, never as a duration.
 */
const fs = require('fs');
const path = require('path');

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Pair start and stop events on agent_id (the one pairing; summarize and perTask both use it).
 * First start and first stop win. agent_type comes from the start event.
 * @param {string[]} lines raw ledger lines
 * @returns {{id:string,type:string,startMs:number,stopMs:number|null,seconds:number|null,transcriptPath:string|null}[]}
 *   in start order; an agent with no stop has seconds null (unfinished).
 */
function pairAgents(lines) {
  const starts = new Map(); // agent_id -> {ms, type}
  const stops = new Map(); // agent_id -> {ms, transcriptPath}
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object' || !e.agent_id) continue;
    const ms = Date.parse(e.ts);
    if (Number.isNaN(ms)) continue;
    if (e.event === 'start' && !starts.has(e.agent_id)) {
      starts.set(e.agent_id, { ms, type: e.agent_type || 'unknown' });
    } else if (e.event === 'stop' && !stops.has(e.agent_id)) {
      stops.set(e.agent_id, { ms, transcriptPath: e.agent_transcript_path || null });
    }
  }
  const agents = [];
  for (const [id, s] of starts) {
    const stop = stops.get(id);
    agents.push({
      id, type: s.type, startMs: s.ms,
      stopMs: stop ? stop.ms : null,
      seconds: stop ? (stop.ms - s.ms) / 1000 : null,
      transcriptPath: stop ? stop.transcriptPath : null,
    });
  }
  return agents;
}

/** @param {string[]} lines raw ledger lines (any number of files, concatenated) */
function summarize(lines) {
  const durations = {};
  let unfinished = 0;
  for (const a of pairAgents(lines)) {
    if (a.seconds === null) { unfinished++; continue; }
    (durations[a.type] ||= []).push(a.seconds);
  }
  const types = {};
  for (const t of Object.keys(durations).sort()) {
    types[t] = { median: median(durations[t]), max: Math.max(...durations[t]), n: durations[t].length };
  }
  return { types, unfinished };
}

/** Tool calls and output tokens from a transcript. One message.id can span several streamed
 *  rows: count tool_use blocks over every row, take the largest output_tokens per message.id. */
function transcriptStats(text) {
  let toolCalls = 0;
  const tokens = new Map();
  let anon = 0;
  for (const line of text.split('\n')) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const m = r && r.message;
    if (!m || m.role !== 'assistant') continue;
    if (Array.isArray(m.content)) toolCalls += m.content.filter((c) => c && c.type === 'tool_use').length;
    const out = m.usage && m.usage.output_tokens;
    if (typeof out === 'number') {
      const key = m.id || `anon-${anon++}`;
      tokens.set(key, Math.max(tokens.get(key) || 0, out));
    }
  }
  let outputTokens = 0;
  for (const v of tokens.values()) outputTokens += v;
  return { toolCalls, outputTokens };
}

/**
 * Per finished agent whose stop row names a transcript: label, phase, seconds, tool calls,
 * output tokens. Label and phase come from the sibling <transcript>.meta.json
 * (description, workflowPhase). Unfinished agents and agents without a transcript are omitted.
 * @param {string[]} lines raw ledger lines
 * @param {(path:string)=>string} readFile injected reader; throws when the file is missing
 * @param {{ledgerDir?:string}} [opts] when the absolute transcript path is gone, tries
 *   <ledgerDir>/transcripts/<basename> (an archived run)
 */
function perTask(lines, readFile, opts = {}) {
  const read = (p) => {
    try { return readFile(p); } catch {
      if (!opts.ledgerDir) return null;
      try { return readFile(path.join(opts.ledgerDir, 'transcripts', path.basename(p))); } catch { return null; }
    }
  };
  const out = [];
  for (const a of pairAgents(lines)) {
    if (a.seconds === null || !a.transcriptPath) continue;
    let meta = {};
    const metaText = read(a.transcriptPath.replace(/\.jsonl$/, '.meta.json'));
    if (metaText) { try { meta = JSON.parse(metaText) || {}; } catch { meta = {}; } }
    const text = read(a.transcriptPath);
    const stats = text === null ? { toolCalls: null, outputTokens: null } : transcriptStats(text);
    out.push({
      id: a.id, type: a.type, label: meta.description || null, phase: meta.workflowPhase || null,
      seconds: a.seconds, toolCalls: stats.toolCalls, outputTokens: stats.outputTokens,
    });
  }
  return out;
}

const change = (before, after) => (before && after !== null ? (after - before) / before : null);
// A count is unknown (null) once any dispatch summed into it had no readable transcript, so a
// missing transcript reads as n/a rather than as zero tool calls (a false -100%).
const addCount = (sum, v) => (sum === null || v === null ? null : sum + v);

/** Group one run's perTask rows by comparison key (task:<id> for implementers, the
 *  workflowPhase for gates), summing a key dispatched more than once. */
function groupRun(rows) {
  const g = new Map();
  for (const r of rows) {
    let key; let kind;
    if (r.label && r.label.startsWith('task:')) { key = r.label; kind = 'implementer'; }
    else if (r.label && r.label.startsWith('gate:') && r.phase) { key = r.phase; kind = 'gate'; }
    else continue;
    const cur = g.get(key) || { kind, seconds: 0, toolCalls: 0, outputTokens: 0, dispatches: 0 };
    cur.seconds += r.seconds; cur.toolCalls = addCount(cur.toolCalls, r.toolCalls);
    cur.outputTokens = addCount(cur.outputTokens, r.outputTokens); cur.dispatches++;
    g.set(key, cur);
  }
  return g;
}

/**
 * Pair before-run k with after-run k (arrays of perTask rows). Keys present on one side only
 * are reported unmatched. Medians are over every pair's per-key relative change, by kind.
 * @returns {{pairs:object[], medians:{implementer:number|null, gate:number|null}}}
 */
function compareRuns(beforeRuns, afterRuns) {
  const n = Math.min(beforeRuns.length, afterRuns.length);
  const pairs = [];
  const changes = { implementer: [], gate: [] };
  for (let k = 0; k < n; k++) {
    const b = groupRun(beforeRuns[k]); const a = groupRun(afterRuns[k]);
    const keys = [];
    const unmatched = { before: [], after: [] };
    for (const [key, bv] of b) {
      const av = a.get(key);
      if (!av) { unmatched.before.push(key); continue; }
      const sec = change(bv.seconds, av.seconds);
      keys.push({
        key, kind: bv.kind,
        seconds: { before: bv.seconds, after: av.seconds, change: sec },
        toolCalls: { before: bv.toolCalls, after: av.toolCalls, change: change(bv.toolCalls, av.toolCalls) },
        outputTokens: { before: bv.outputTokens, after: av.outputTokens, change: change(bv.outputTokens, av.outputTokens) },
        dispatches: { before: bv.dispatches, after: av.dispatches },
      });
      if (sec !== null) changes[bv.kind].push(sec);
    }
    for (const key of a.keys()) if (!b.has(key)) unmatched.after.push(key);
    pairs.push({ run: k + 1, keys, unmatched });
  }
  return {
    pairs,
    medians: {
      implementer: changes.implementer.length ? median(changes.implementer) : null,
      gate: changes.gate.length ? median(changes.gate) : null,
    },
  };
}

function formatText({ types, unfinished }) {
  const rows = Object.entries(types).map(([t, v]) => `${t} median ${v.median}s max ${v.max}s n=${v.n}`);
  rows.push(`unfinished ${unfinished}`);
  return rows.join('\n');
}

function readLines(files) {
  const lines = [];
  for (const f of files) lines.push(...fs.readFileSync(f, 'utf8').split('\n'));
  return lines;
}

function perTaskFor(file) {
  return perTask(readLines([file]), (p) => fs.readFileSync(p, 'utf8'), { ledgerDir: path.dirname(file) });
}

const pct = (c) => (c === null ? 'n/a' : `${(c * 100).toFixed(1)}%`);

function formatCompare({ pairs, medians }) {
  const rows = [];
  for (const p of pairs) {
    for (const k of p.keys) {
      rows.push(`pair ${p.run} ${k.key} ${k.seconds.before}s -> ${k.seconds.after}s ${pct(k.seconds.change)}` +
        ` tools ${pct(k.toolCalls.change)} tokens ${pct(k.outputTokens.change)}` +
        ` dispatches ${k.dispatches.before}/${k.dispatches.after}`);
    }
    for (const u of p.unmatched.before) rows.push(`pair ${p.run} ${u} unmatched (before only)`);
    for (const u of p.unmatched.after) rows.push(`pair ${p.run} ${u} unmatched (after only)`);
  }
  rows.push(`median implementer ${pct(medians.implementer)}`);
  rows.push(`median gate ${pct(medians.gate)}`);
  return rows.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  try {
    if (args[0] === '--per-task') {
      if (args.length !== 2) throw Object.assign(new Error('usage'), { usage: true });
      const rows = perTaskFor(args[1]);
      process.stdout.write((json ? JSON.stringify(rows) : rows.map((r) =>
        `${r.label || r.id} ${r.phase || '-'} ${r.seconds}s tools ${r.toolCalls} tokens ${r.outputTokens}`).join('\n')) + '\n');
      return 0;
    }
    if (args[0] === '--compare') {
      const bi = args.indexOf('--before'); const ai = args.indexOf('--after');
      if (bi !== 1 || ai < 0 || ai === 2 || ai === args.length - 1) throw Object.assign(new Error('usage'), { usage: true });
      const result = compareRuns(args.slice(bi + 1, ai).map(perTaskFor), args.slice(ai + 1).map(perTaskFor));
      process.stdout.write((json ? JSON.stringify(result) : formatCompare(result)) + '\n');
      return 0;
    }
    if (args.length === 0) throw Object.assign(new Error('usage'), { usage: true });
    const result = summarize(readLines(args));
    process.stdout.write((json ? JSON.stringify(result) : formatText(result)) + '\n');
    return 0;
  } catch (err) {
    if (err.usage) {
      process.stderr.write('usage: ledger-timing.js [--json] <dispatch.jsonl> [...]\n' +
        '       ledger-timing.js [--json] --per-task <dispatch.jsonl>\n' +
        '       ledger-timing.js [--json] --compare --before <ledger>... --after <ledger>...\n');
      return 2;
    }
    process.stderr.write(`ledger-timing: ${err.message}\n`);
    return 1;
  }
}

// exitCode, not exit(): process.exit() can cut off stdout still flushing to a pipe.
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { summarize, pairAgents, perTask, compareRuns, transcriptStats, formatText, formatCompare, median };
