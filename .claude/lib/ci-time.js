'use strict';

/**
 * ci-time.js -- how long a CI run took, and whether that is inside the project's CI budget.
 *
 * `wait-ci` reads `gh run view <run-id> --json jobs`, pipes it here, and records the answer in
 * its result `data`. The `/ship-build` readout states it ("CI took 11.2 min, budget 10 min") and,
 * over budget, adds ONE ISSUES line naming the slowest jobs. The budget is a reported constraint:
 * nothing here fails a step or blocks a ship.
 *
 * WALL TIME is first job start to last job end, not the sum of job times: jobs run in parallel,
 * and the wait the owner feels is the wall. A job that never ran (skipped, or a start time of
 * 0001-01-01) is left out.
 *
 * BUDGET lives in `.claude/rules/ship.md` as one line, `CI budget: <n> min`, written by
 * `/ship-setup`. Default 10, at most 15. `ship-sequencer.js` reads only the `## Ship` and
 * `## After shipping` sections, so the line is ignored by it. A line above 15 is a problem, not a
 * budget: the reader uses 15 and says so in `problem`.
 *
 * CLI (prints ONE JSON line, exits 0):
 *   gh run view <run-id> --json jobs | node ci-time.js measure [--policy .claude/rules/ship.md]
 *   node ci-time.js measure --jobs <file> [--policy <file>]
 *
 * Dependency-free: copied into consuming projects' `.claude/lib/`.
 */

const fs = require('fs');

const DEFAULT_MINUTES = 10;
const MAX_MINUTES = 15;
const SLOWEST = 3;

/** @returns {number|null} epoch ms, or null for a missing, unparseable or zero-value time. */
function stamp(v) {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * Wall time and the slowest jobs of one run.
 * @param {{jobs?: Array<{name?: string, startedAt?: string, completedAt?: string}>}|Array} input
 * @returns {{wallSeconds: number|null, jobCount: number, slowest: Array<{name: string, seconds: number}>}}
 */
function wallTime(input) {
  const list = Array.isArray(input) ? input : (input && Array.isArray(input.jobs) ? input.jobs : []);
  const ran = [];
  for (const j of list) {
    const s = stamp(j && j.startedAt);
    const e = stamp(j && j.completedAt);
    if (s !== null && e !== null && e >= s) ran.push({ name: String(j.name || ''), start: s, end: e });
  }
  if (!ran.length) return { wallSeconds: null, jobCount: 0, slowest: [] };
  const first = Math.min(...ran.map((j) => j.start));
  const last = Math.max(...ran.map((j) => j.end));
  const slowest = ran
    .map((j) => ({ name: j.name, seconds: Math.round((j.end - j.start) / 1000) }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))
    .slice(0, SLOWEST);
  return { wallSeconds: Math.round((last - first) / 1000), jobCount: ran.length, slowest };
}

/**
 * The CI budget a ship.md text states: one `CI budget: <n> min` line outside code fences.
 * @param {string|null|undefined} text
 * @returns {{minutes: number, source: 'ship.md'|'default', problem?: string}}
 */
function readBudget(text) {
  let fenced = false;
  for (const line of String(text == null ? '' : text).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^\s*(?:[-*]\s+)?CI budget:\s*(\d+(?:\.\d+)?)\s*min(?:ute)?s?\b/i.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (!(n > 0)) return { minutes: DEFAULT_MINUTES, source: 'default', problem: `CI budget ${m[1]} min is not a positive number; used the ${DEFAULT_MINUTES} min default` };
    if (n > MAX_MINUTES) return { minutes: MAX_MINUTES, source: 'ship.md', problem: `CI budget ${m[1]} min is above the ${MAX_MINUTES} min limit; used ${MAX_MINUTES}` };
    return { minutes: n, source: 'ship.md' };
  }
  return { minutes: DEFAULT_MINUTES, source: 'default' };
}

/**
 * Wall time against budget, in the shape `wait-ci` records in `data`.
 * @returns {{wallSeconds: number|null, budgetSeconds: number, over: boolean, slowest: Array, budgetSource: string, problem?: string}}
 */
function measure(jobsInput, policyText) {
  const w = wallTime(jobsInput);
  const b = readBudget(policyText);
  const budgetSeconds = Math.round(b.minutes * 60);
  const out = {
    wallSeconds: w.wallSeconds,
    budgetSeconds,
    over: w.wallSeconds !== null && w.wallSeconds > budgetSeconds,
    slowest: w.slowest,
    budgetSource: b.source,
  };
  if (b.problem) out.problem = b.problem;
  return out;
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function main(argv) {
  const emit = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`); return 0; };
  const usage = 'usage: ci-time.js measure [--jobs <file>] [--policy <file>]  (jobs JSON on stdin without --jobs)';
  if (argv[0] !== 'measure') return emit({ ok: false, error: usage });
  try {
    const jobsFile = flag(argv, '--jobs');
    const raw = fs.readFileSync(jobsFile === undefined ? 0 : jobsFile, 'utf8');
    let policy = null;
    const pf = flag(argv, '--policy');
    if (pf !== undefined) {
      try { policy = fs.readFileSync(pf, 'utf8'); } catch (e) { policy = null; }
    }
    return emit({ ok: true, ...measure(JSON.parse(raw), policy) });
  } catch (e) {
    return emit({ ok: false, error: `ci-time failed: ${e.message}` });
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { wallTime, readBudget, measure, main, DEFAULT_MINUTES, MAX_MINUTES };
