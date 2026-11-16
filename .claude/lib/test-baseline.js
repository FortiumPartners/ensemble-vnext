'use strict';

/**
 * test-baseline.js -- what the phase-gate battery already knows, so it is not found out again.
 *
 * ONE FILE per feature, `.trd-state/<feature>/test-battery.json` (a run record: it travels on the
 * records ref with the command's own writes, never in a commit of its own):
 *
 *   baseline  the tests that already fail on the base branch, captured ONCE per feature on the
 *             merge base (a temporary git worktree), per suite: { base, capturedAt, suites: {
 *             <suite>: { command, durationSeconds, failures: [<test id>, ...] } } }
 *   runs      the last run of each suite at this feature: { <suite>: { tree, status, command,
 *             durationSeconds, failures, at } }. `tree` identifies the exact working tree the
 *             suite ran on, so a suite that already ran on THIS tree is not run again.
 *
 * WHAT IT DECIDES (three things, each a pure function below, each with the CLI beside it):
 *   reuse       a suite recorded on the same tree id is not run again (the readout says so);
 *   compare     a failing test that is in the baseline is "already failing on the base" and is
 *               not red; a failing test that is not in it is new and is red;
 *   background  a suite expected to outlast the Bash limit (600 s) runs with run_in_background.
 *
 * TREE ID: `<HEAD sha>` plus a short hash of the uncommitted diff and the untracked file list,
 * so "same commit, no edits" is one string comparison. A tree id that cannot be read (not a git
 * repository) is `null` and `reuse` then says no: an unknown tree is never reused.
 *
 * CLI (prints ONE JSON line, exits 0; a usage or read problem is {ok:false,error}):
 *   node test-baseline.js tree
 *   node test-baseline.js record-baseline --state-dir D --suite S --base SHA --command C [--duration N] [--failures-file F]
 *   node test-baseline.js record-run      --state-dir D --suite S --command C --status pass|fail [--duration N] [--failures-file F]
 *   node test-baseline.js reuse           --state-dir D --suite S
 *   node test-baseline.js compare         --state-dir D --suite S --failures-file F
 *   node test-baseline.js background      --state-dir D --suite S --kind unit|integration|e2e
 * `--failures-file` holds one failing test id per line (or a JSON array of ids).
 *
 * Every git call is `spawnSync` with an argument array (no shell). Dependency-free: copied into
 * consuming projects' `.claude/lib/`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const FILE = 'test-battery.json';
/** The Bash tool's hard limit is 600 s; a suite expected past this runs in the background. */
const BASH_LIMIT_SECONDS = 600;
/** Leave headroom: a suite last seen above this is treated as one that can outlast the limit. */
const BACKGROUND_AT_SECONDS = 420;
const LONG_KINDS = new Set(['integration', 'e2e']);

const emptyDoc = () => ({ version: 1, baseline: null, runs: {} });

function filePath(stateDir) {
  return path.join(stateDir, FILE);
}

/** @returns {object} the stored document, or an empty one when the file is missing or unreadable. */
function load(stateDir) {
  try {
    const d = JSON.parse(fs.readFileSync(filePath(stateDir), 'utf8'));
    if (d && typeof d === 'object' && !Array.isArray(d)) return { ...emptyDoc(), ...d, runs: d.runs && typeof d.runs === 'object' ? d.runs : {} };
  } catch (e) { /* missing or corrupt: start empty, never block a gate on a record */ }
  return emptyDoc();
}

function save(stateDir, doc) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(filePath(stateDir), `${JSON.stringify(doc, null, 2)}\n`);
}

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => String(x).trim()).filter(Boolean))].sort();

/** The identity of the working tree right now, or null when git cannot say. */
function treeId(cwd) {
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const head = git('rev-parse', 'HEAD');
  if (head.status !== 0) return null;
  const diff = git('diff', 'HEAD');
  const untracked = git('ls-files', '--others', '--exclude-standard');
  if (diff.status !== 0 || untracked.status !== 0) return null;
  const h = crypto.createHash('sha1').update(diff.stdout).update('\0').update(untracked.stdout).digest('hex').slice(0, 12);
  return `${head.stdout.trim()}+${h}`;
}

function recordBaseline(stateDir, { suite, base, command, durationSeconds, failures }) {
  const doc = load(stateDir);
  if (!doc.baseline) doc.baseline = { base: String(base || ''), capturedAt: new Date().toISOString(), suites: {} };
  doc.baseline.suites[suite] = { command: String(command || ''), durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null, failures: ids(failures) };
  save(stateDir, doc);
  return doc.baseline.suites[suite];
}

function recordRun(stateDir, { suite, command, status, durationSeconds, failures, tree }) {
  const doc = load(stateDir);
  doc.runs[suite] = {
    tree: tree === undefined ? treeId() : tree,
    status: status === 'pass' ? 'pass' : 'fail',
    command: String(command || ''),
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    failures: ids(failures),
    at: new Date().toISOString(),
  };
  save(stateDir, doc);
  return doc.runs[suite];
}

/**
 * Was this suite already run on this exact tree? Reused only when it ran, on the same known tree.
 * @returns {{reuse: boolean, reason: string, run?: object}}
 */
function reuse(stateDir, suite, currentTree) {
  const run = load(stateDir).runs[suite];
  const now = currentTree === undefined ? treeId() : currentTree;
  if (!run) return { reuse: false, reason: `${suite} has not run at this feature` };
  if (!now || !run.tree) return { reuse: false, reason: 'the tree could not be identified, so no result is reused' };
  if (run.tree !== now) return { reuse: false, reason: `${suite} last ran on ${run.tree}, the tree is now ${now}` };
  return { reuse: true, reason: `${suite} already ran on this tree (${run.status}), not run again`, run };
}

/**
 * Sort one run's failing tests against the base branch's. A failure in the baseline is "already
 * failing on the base" and does not make the gate red; any other failure is new and does.
 * With no baseline captured for the suite, every failure is new: nothing is excused unrecorded.
 * @returns {{red: boolean, newFailures: string[], baselineFailures: string[], baselineKnown: boolean}}
 */
function compare(stateDir, suite, failures) {
  const doc = load(stateDir);
  const entry = doc.baseline && doc.baseline.suites && doc.baseline.suites[suite];
  const known = new Set(entry ? entry.failures : []);
  const all = ids(failures);
  const baselineFailures = all.filter((f) => known.has(f));
  const newFailures = all.filter((f) => !known.has(f));
  return { red: newFailures.length > 0, newFailures, baselineFailures, baselineKnown: Boolean(entry) };
}

/**
 * Run this suite in the background? From its last recorded duration (the run, else the
 * baseline's); with none recorded, integration and e2e always, unit never.
 * @returns {{background: boolean, reason: string, timeoutSeconds: number|null}}
 */
function background(stateDir, suite, kind) {
  const doc = load(stateDir);
  const last = (doc.runs[suite] && doc.runs[suite].durationSeconds) || (doc.baseline && doc.baseline.suites[suite] && doc.baseline.suites[suite].durationSeconds) || null;
  if (last !== null) {
    const bg = last >= BACKGROUND_AT_SECONDS;
    return {
      background: bg,
      reason: `${suite} last took ${last} s (${bg ? 'at or above' : 'below'} ${BACKGROUND_AT_SECONDS} s)`,
      // A timeout above its runtime: half again the last time, never below the Bash limit.
      timeoutSeconds: bg ? Math.max(Math.ceil(last * 1.5), BASH_LIMIT_SECONDS + 60) : null,
    };
  }
  const long = LONG_KINDS.has(String(kind));
  return {
    background: long,
    reason: `${suite} has no recorded duration; ${long ? `${kind} suites run in the background` : 'it runs in the foreground'}`,
    timeoutSeconds: long ? 3600 : null,
  };
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function readFailures(file) {
  if (file === undefined) return [];
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) return JSON.parse(raw);
  return raw.split(/\r?\n/);
}

function main(argv) {
  const emit = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`); return 0; };
  const usage = 'usage: test-baseline.js tree | record-baseline | record-run | reuse | compare | background (see the file header)';
  const cmd = argv[0];
  try {
    const stateDir = flag(argv, '--state-dir');
    const suite = flag(argv, '--suite');
    const dur = flag(argv, '--duration');
    const durationSeconds = dur === undefined ? undefined : Number(dur);
    const need = (v, n) => { if (v === undefined) throw new Error(`${n} is required`); return v; };
    if (cmd === 'tree') return emit({ ok: true, tree: treeId() });
    if (cmd === 'record-baseline') {
      return emit({ ok: true, ...recordBaseline(need(stateDir, '--state-dir'), { suite: need(suite, '--suite'), base: flag(argv, '--base'), command: flag(argv, '--command'), durationSeconds, failures: readFailures(flag(argv, '--failures-file')) }) });
    }
    if (cmd === 'record-run') {
      return emit({ ok: true, ...recordRun(need(stateDir, '--state-dir'), { suite: need(suite, '--suite'), command: flag(argv, '--command'), status: flag(argv, '--status'), durationSeconds, failures: readFailures(flag(argv, '--failures-file')) }) });
    }
    if (cmd === 'reuse') return emit({ ok: true, ...reuse(need(stateDir, '--state-dir'), need(suite, '--suite')) });
    if (cmd === 'compare') return emit({ ok: true, ...compare(need(stateDir, '--state-dir'), need(suite, '--suite'), readFailures(need(flag(argv, '--failures-file'), '--failures-file'))) });
    if (cmd === 'background') return emit({ ok: true, ...background(need(stateDir, '--state-dir'), need(suite, '--suite'), flag(argv, '--kind')) });
    return emit({ ok: false, error: usage });
  } catch (e) {
    return emit({ ok: false, error: `test-baseline failed: ${e.message}` });
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { treeId, load, recordBaseline, recordRun, reuse, compare, background, main, BASH_LIMIT_SECONDS, BACKGROUND_AT_SECONDS };
