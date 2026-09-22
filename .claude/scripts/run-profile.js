#!/usr/bin/env node
'use strict';

/**
 * run-profile.js — where did a run's time actually go?
 *
 * WHY THIS EXISTS
 *
 * Every timing claim made about this framework in the last two days was an argument from
 * structure: "this now runs in parallel", "this stage was serial". Three of those arguments
 * were wrong and had to be corrected by the owner — model routing, hook latency, and
 * phase-gate compounding — each one plausible, each one measured afterwards as false.
 *
 * The obstacle was never effort. A workflow script CANNOT time itself: the runtime blocks
 * `Date.now()`, `Math.random()` and argless `new Date()`, so no stage can record its own
 * duration. The task notification that arrives when a workflow ends carries one number —
 * total wall clock — and nothing about which stage spent it.
 *
 * But `dispatch-ledger.js` has been writing a `start` and a `stop` row, with a timestamp,
 * for every subagent this framework has ever launched — including the ones launched from
 * inside a workflow. The instrument was already there; nothing read it for timing.
 *
 * WHAT IT REPORTS, and why each line earns its place:
 *
 *   wall clock vs agent time  — their ratio is the parallelism factor. Below 1.0 means the
 *                               run spent more time outside agents than inside them, which
 *                               is what a real 6.42h run turned out to be doing (0.69x).
 *   unaccounted time          — wall clock minus the union of agent intervals. This is
 *                               orchestrator overhead: state writes, batteries, git. On that
 *                               same run it was ~2 hours, 31% of the total, and nobody had
 *                               ever looked at it.
 *   by agent type             — which specialist dominates. Answers "is grounding the 23
 *                               minutes, or is authoring?" without guessing.
 *   the longest single agent  — one 90-minute agent is a different problem from ninety
 *                               one-minute agents, and the fixes are unrelated.
 *
 * Usage:
 *   node run-profile.js <dispatch.jsonl>            profile one feature's run
 *   node run-profile.js --feature <name>            resolve .trd-state/<name>/dispatch.jsonl
 *   node run-profile.js <path> --since <ISO>        only rows at or after a timestamp
 *   node run-profile.js <path> --json               machine-readable
 *   node run-profile.js <path> --all                every run in the ledger, as one span
 *   node run-profile.js <path> --gap 45             minutes of silence that ends a run
 */

const fs = require('fs');
const path = require('path');

/**
 * Split rows into RUNS by gaps in activity.
 *
 * Session scoping was the first attempt and it does not work: one real ledger holds a single
 * session_id spanning 64 hours with gaps of 36, 15 and 14 hours between bursts of work. That
 * is a human going to bed, not a run, and profiling across it reported 0.01x parallelism —
 * arithmetic about calendar time.
 *
 * A run is a cluster of agent activity with no silent gap longer than the threshold. Default
 * 30 minutes: comfortably longer than the slowest single agent observed here (90 minutes is
 * the record, but it is ONE agent, so its start and stop bracket no internal gap), and far
 * shorter than any real break.
 */
const DEFAULT_GAP_MIN = 30;

function splitRuns(rows, gapMin = DEFAULT_GAP_MIN) {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const gapMs = gapMin * 60 * 1000;
  const runs = [[sorted[0]]];
  for (const r of sorted.slice(1)) {
    const prev = runs[runs.length - 1];
    const lastTs = Date.parse(prev[prev.length - 1].ts);
    if (Date.parse(r.ts) - lastTs > gapMs) runs.push([r]);
    else prev.push(r);
  }
  return runs;
}

function parseRows(file, since) {
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue; // a truncated final line must not blind the reader to the rest
    }
    if (!r.ts || !r.agent_id) continue;
    if (since && r.ts < since) continue;
    rows.push(r);
  }
  return rows;
}

/**
 * Pair start/stop rows into intervals.
 *
 * `prompt_id` is NOT stable across an agent's lifetime — a live run produced a stop row whose
 * prompt_id differed from its own start row — so `agent_id` is the only safe key.
 *
 * An agent with a start and no stop is still running, or the session died. Either way its
 * duration is unknown and it is reported separately rather than guessed at.
 */
function toIntervals(rows) {
  const byId = new Map();
  for (const r of rows) {
    const e = byId.get(r.agent_id) || { id: r.agent_id, type: r.agent_type || 'unknown' };
    if (r.event === 'start') e.start = Date.parse(r.ts);
    if (r.event === 'stop') e.stop = Date.parse(r.ts);
    if (r.agent_type) e.type = r.agent_type;
    byId.set(r.agent_id, e);
  }
  const done = [];
  const open = [];
  for (const e of byId.values()) {
    if (Number.isFinite(e.start) && Number.isFinite(e.stop) && e.stop >= e.start) {
      done.push({ ...e, ms: e.stop - e.start });
    } else {
      open.push(e);
    }
  }
  done.sort((a, b) => a.start - b.start);
  return { done, open };
}

/** Total time during which AT LEAST ONE agent was running — overlaps counted once. */
function unionMs(intervals) {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].stop;
  for (const iv of sorted.slice(1)) {
    if (iv.start > curEnd) {
      total += curEnd - curStart;
      curStart = iv.start;
      curEnd = iv.stop;
    } else if (iv.stop > curEnd) {
      curEnd = iv.stop;
    }
  }
  return total + (curEnd - curStart);
}

const fmt = (ms) => {
  const s = ms / 1000;
  if (s < 90) return `${s.toFixed(0)}s`;
  const m = s / 60;
  return m < 90 ? `${m.toFixed(1)}m` : `${(m / 60).toFixed(2)}h`;
};

function profile(file, opts = {}) {
  const all = parseRows(file, opts.since);
  const runs = splitRuns(all, opts.gapMin || DEFAULT_GAP_MIN);
  // Default to the most recent burst of work; --all profiles the whole ledger.
  const rows = opts.all ? all : runs[runs.length - 1] || [];
  const { done, open } = toIntervals(rows);
  if (!done.length) return { file, agents: 0, open: open.length };

  const wall = Math.max(...done.map((d) => d.stop)) - Math.min(...done.map((d) => d.start));
  const agentMs = done.reduce((a, b) => a + b.ms, 0);
  const busy = unionMs(done);

  const byType = {};
  for (const d of done) {
    const t = (byType[d.type] = byType[d.type] || { n: 0, ms: 0 });
    t.n += 1;
    t.ms += d.ms;
  }

  return {
    file,
    runsInLedger: runs.length,
    scopedTo: opts.all ? 'the whole ledger' : (rows[0] ? rows[0].ts : 'unknown'),
    agents: done.length,
    open: open.length,
    wallMs: wall,
    agentMs,
    busyMs: busy,
    idleMs: Math.max(0, wall - busy),
    parallelism: wall ? agentMs / wall : 0,
    byType,
    longest: done.slice().sort((a, b) => b.ms - a.ms)[0],
  };
}

function render(p) {
  if (!p.agents) {
    console.log(`${p.file}: no completed agents${p.open ? ` (${p.open} still open)` : ''}`);
    return;
  }
  console.log(`\n${p.file}`);
  console.log(`  ${p.agents} agents${p.open ? `, ${p.open} never returned` : ''}`);
  if (p.runsInLedger > 1 && p.scopedTo !== 'the whole ledger') {
    console.log(`  most recent of ${p.runsInLedger} runs in this ledger, starting ${p.scopedTo} (--all for every one)`);
  }
  console.log(`  wall clock        ${fmt(p.wallMs)}`);
  console.log(`  agent time        ${fmt(p.agentMs)}   (sum of every agent)`);
  console.log(
    `  parallelism       ${p.parallelism.toFixed(2)}x   ` +
      `(1.0 = fully serial; below 1.0 means time went somewhere other than agents)`
  );
  console.log(
    `  outside agents    ${fmt(p.idleMs)}   ` +
      `${p.wallMs ? ((100 * p.idleMs) / p.wallMs).toFixed(0) : 0}% — orchestrator overhead`
  );
  console.log('  by agent type:');
  for (const [type, t] of Object.entries(p.byType).sort((a, b) => b[1].ms - a[1].ms)) {
    const share = p.agentMs ? ((100 * t.ms) / p.agentMs).toFixed(0) : '0';
    console.log(`    ${String(type).padEnd(26)} ${String(t.n).padStart(3)} agents  ${fmt(t.ms).padStart(7)}  ${share}%`);
  }
  if (p.longest) {
    console.log(`  longest single    ${fmt(p.longest.ms)}  (${p.longest.type})`);
  }
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const asJson = args.includes('--json');
  const since = flag('--since');
  const feature = flag('--feature');
  const all = args.includes('--all');
  const gapMin = Number(flag('--gap')) || DEFAULT_GAP_MIN;

  let files = args.filter(
    (a, i) =>
      !a.startsWith('--') &&
      args[i - 1] !== '--since' &&
      args[i - 1] !== '--feature' &&
      args[i - 1] !== '--gap'
  );
  if (feature) files = [path.join('.trd-state', feature, 'dispatch.jsonl')];
  if (!files.length) {
    console.error('usage: run-profile.js <dispatch.jsonl> | --feature <name> [--since <ISO>] [--json]');
    return 1;
  }

  const results = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`no such ledger: ${f}`);
      continue;
    }
    results.push(profile(f, { since, all, gapMin }));
  }
  if (asJson) console.log(JSON.stringify(results, null, 2));
  else results.forEach(render);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { profile, toIntervals, unionMs, parseRows, splitRuns, DEFAULT_GAP_MIN };
