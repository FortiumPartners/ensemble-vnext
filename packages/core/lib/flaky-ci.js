'use strict';

/**
 * flaky-ci.js -- the history of CI jobs that failed and then passed on rerun, the cap on how
 * often one may do so, and the one-time filing of a follow-up for it.
 *
 * WHY ONE MODULE: wait-ci, collect-findings and file-followups all need the same answer to
 * "how many times has this job flaked?". They call this library; none keeps its own count.
 *
 * HISTORY: one append-only `flaky.jsonl` per state directory (`<root>/<feature>/flaky.jsonl`).
 * Counting reads every such file under the root, skipping directories whose name starts with
 * `_` (framework-internal, e.g. `_sweep`). A shared counter file is deliberately not used: it
 * would be the shared mutable file the per-feature rule forbids.
 *
 * A job is identified by its job name (as `gh run view <run-id> --json jobs` shows it).
 * Recording the same (job, runId) twice counts once.
 *
 * FIRST TIME: decided at `importFlake`, by looking for an existing `ref: "flaky:<job>"` row in
 * any non-underscore `<root>/*\/discovered.jsonl` (filed or not, resolved or not). If none,
 * ONE non-blocking row is recorded via discovered.record. wait-ci itself never files.
 *
 * CLI (prints ONE JSON line; exit 0 on success, 1 with {ok:false,error} on bad usage):
 *   node flaky-ci.js record --state-dir <dir> --job <name> --run-id <id> [--root <dir>]
 *   node flaky-ci.js import --state-dir <dir> --job <name> --run-id <id> [--root <dir>]
 *   node flaky-ci.js count  --job <name> [--root <dir>]
 */

const fs = require('fs');
const path = require('path');
const discovered = require('./discovered');

/** A job that has flaked this many times (across all features) is capped. */
const FLAKE_CAP = 3;
const DEFAULT_ROOT = '.trd-state';
const FILE = 'flaky.jsonl';
// Keeps `flaky:<job>` inside discovered's 80-char ref limit and each line small.
const MAX_JOB = 60;
const MAX_RUN_ID = 40;

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

/** Feature state directories under root (non-underscore), as absolute paths. */
function featureDirs(root) {
  let entries;
  try {
    entries = fs.readdirSync(path.resolve(root), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => path.join(path.resolve(root), e.name));
}

function readFlakes(dir) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, FILE), 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r === 'object' && r.job) rows.push(r);
    } catch {
      /* skip malformed */
    }
  }
  return rows;
}

/** Run ids of every recorded flake of (already-cleaned) job `j`, across root's feature dirs plus extra dirs. */
function knownRunIds(j, root, extraDirs = []) {
  const seen = new Set();
  const dirs = new Set([...featureDirs(root), ...extraDirs.map((d) => path.resolve(d))]);
  for (const d of dirs) {
    for (const r of readFlakes(d)) if (r.job === j) seen.add(String(r.runId));
  }
  return seen;
}

/** Distinct (job, runId) flakes of `job` across all feature dirs under root, plus extra dirs. */
function countFlakes(job, { root = DEFAULT_ROOT, extraDirs = [] } = {}) {
  return knownRunIds(clean(job, MAX_JOB), root, extraDirs).size;
}

/**
 * Record one flake of `job` in stateDir's history (deduped on job+runId).
 * @returns {{job:string, runId:string, count:number, capped:boolean, recorded:boolean}}
 */
function recordFlake(stateDir, { job, runId } = {}, { root = DEFAULT_ROOT, nowIso } = {}) {
  const j = clean(job, MAX_JOB);
  const id = clean(runId, MAX_RUN_ID);
  if (!stateDir || !j || !id) throw new Error('stateDir, job and runId are required');
  const dir = path.resolve(stateDir);
  const known = knownRunIds(j, root, [dir]);
  let recorded = false;
  if (!known.has(id)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(
        path.join(dir, FILE),
        JSON.stringify({ ts: nowIso || new Date().toISOString(), job: j, runId: id }) + '\n',
      );
      recorded = true;
    } catch {
      /* a lost history line costs a count; it must not fail the ship run */
    }
  }
  const count = known.size + (recorded ? 1 : 0);
  return { job: j, runId: id, count, capped: count >= FLAKE_CAP, recorded };
}

/** True when any non-underscore feature ledger already holds a `flaky:<job>` row. */
function alreadyFiled(job, root, extraDirs) {
  const ref = `flaky:${job}`;
  const dirs = new Set([...featureDirs(root), ...extraDirs.map((d) => path.resolve(d))]);
  for (const d of dirs) {
    if (discovered.readAll(d).some((r) => r.ref === ref)) return true;
  }
  return false;
}

/**
 * Record the flake, then (first time this job has ever been seen flaking) add ONE
 * non-blocking ledger row to stateDir. Later flakes, in any feature, add none.
 * @returns {{job, runId, count, capped, recorded, filed: boolean}}
 */
function importFlake(stateDir, args, opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const res = recordFlake(stateDir, args, opts);
  let filed = false;
  if (!alreadyFiled(res.job, root, [stateDir])) {
    filed = discovered.record(
      path.resolve(stateDir),
      {
        kind: 'gap',
        foundBy: 'wait-ci',
        blocksFeature: false,
        ref: `flaky:${res.job}`,
        summary: `[flaky-ci] ${res.job} failed then passed on rerun (${res.count} flake(s) recorded)`,
      },
      opts.nowIso,
    );
  }
  return { ...res, filed: filed === true };
}

function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/** @returns {{code:number, out:object}} */
function main(argv) {
  const [cmd] = argv;
  const root = flag(argv, 'root') || DEFAULT_ROOT;
  try {
    if (cmd === 'count') {
      const job = flag(argv, 'job');
      if (!job) throw new Error('count needs --job');
      const count = countFlakes(job, { root });
      return { code: 0, out: { ok: true, job: clean(job, MAX_JOB), count, capped: count >= FLAKE_CAP } };
    }
    if (cmd === 'record' || cmd === 'import') {
      const stateDir = flag(argv, 'state-dir');
      const job = flag(argv, 'job');
      const runId = flag(argv, 'run-id');
      if (!stateDir || !job || !runId) throw new Error(`${cmd} needs --state-dir, --job and --run-id`);
      const fn = cmd === 'record' ? recordFlake : importFlake;
      return { code: 0, out: { ok: true, ...fn(stateDir, { job, runId }, { root }) } };
    }
    throw new Error('usage: flaky-ci.js record|import|count ...');
  } catch (e) {
    return { code: 1, out: { ok: false, error: e.message } };
  }
}

if (require.main === module) {
  const { code, out } = main(process.argv.slice(2));
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = code;
}

module.exports = { FLAKE_CAP, recordFlake, importFlake, countFlakes, main };
