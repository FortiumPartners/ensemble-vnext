'use strict';

/**
 * merge-resolve.js -- the deterministic half of "resolve a mechanical merge conflict in place".
 *
 * WHY A LIBRARY: when GitHub says a PR clashes with its base and the clash is more than record
 * files, the merge step must grade each conflicted file (conflict-classifier.js), let the model
 * edit ONLY the conflict hunks of mechanical files, run the project's checks, and commit. Every
 * step except the hunk edit is code here, so it is unit-tested; the model never chooses what is
 * graded, what is checked, or what is committed.
 *
 * FLOW (one JSON line per call, exit 0 even on refusal):
 *   start   preconditions, a real "git merge --no-ff --no-commit", grade each unmerged file.
 *           Forbidden or behavioural: abort the merge, return the STUCK text. Mechanical: union
 *           the record files, leave markers in ONLY the mechanical files, snapshot the text
 *           outside their hunks, return the file list.
 *   check   refuse a file still holding markers or edited outside its hunks; run lint,
 *           typecheck and the affected tests; answer commit, fix or stop (conflict-classifier
 *           "decide": the third failed check stops).
 *   commit  after a passing check only: stage the mechanical files, commit. Never sends anything
 *           to a remote; the contract does that with a plain, non-forced command.
 *   abort   abort the merge.
 *   entry   print the ship-record entry the contract passes as data.resolution.
 *
 * CHECKS come from the project and are read from the pre-merge HEAD (git show HEAD:<path>), so a
 * hunk merged into settings.json or package.json can never choose the command that runs:
 *   ensemble.mergeChecks in .claude/settings.json, when it is an object:
 *     { "lint": [..argv], "typecheck": [..argv], "test": [..argv] }  -- the only source then;
 *     a name left out, or false, is skipped. An argv element equal to "{files}" expands to the
 *     affected (mechanical) files.
 *   otherwise detected: a package.json "lint" script; tsc --noEmit when tsconfig.json exists;
 *     jest --findRelatedTests when jest is configured.
 * A check with nothing to run is "skipped" with its reason, never a failure: CI on the merged
 * head is the proof.
 *
 * STATE between calls: <git dir>/merge-resolve.json (or <--state-dir>/merge-resolve.json).
 *
 * CLI (run from the project root):
 *   node merge-resolve.js start --base REF --branch NAME --pr-head SHA --trd PATH|none [--state-dir D]
 *   node merge-resolve.js check|commit|abort [--state-dir D]
 *   node merge-resolve.js entry [--state-dir D] [--reproof-ids ID,ID|none]
 *
 * Every git and check call is spawnSync with an argument array (no shell).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { classify, decide, stuckText } = require('./conflict-classifier');
const { isRecordFile } = require('./record-files');

const CHECK_NAMES = ['lint', 'typecheck', 'test'];
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const STATE_FILE = 'merge-resolve.json';
const STOPPED_BEFORE_GATE = 'none: stopped before the custody gate';

// ---------------------------------------------------------------- git

function git(args, cwd, input) {
  const r = spawnSync('git', args, { cwd, env: process.env, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: !r.error && r.status === 0,
    out: (r.stdout || '').trim(),
    raw: r.stdout || '',
    err: ((r.stderr || '') + (r.stdout && r.status ? r.stdout : '') || (r.error && r.error.message) || '').trim(),
  };
}

const refuse = (reason, extra) => ({ ok: false, outcome: 'refused', reason, ...extra });

/** Tracked paths with uncommitted changes (rename sources included); null when git fails. */
function dirtyTracked(cwd) {
  const r = git(['status', '--porcelain=v1', '-z', '--untracked-files=no', '--no-renames'], cwd);
  if (!r.ok) return null;
  return r.raw.split('\0').filter(Boolean).map((e) => e.slice(3));
}

const mergeInProgress = (cwd) => git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd).ok;

/** One unmerged path's index stages: {1,2,3} contents (null when absent) and the file mode. */
function readStages(cwd) {
  const r = git(['ls-files', '-u', '-z'], cwd);
  const byPath = new Map();
  for (const entry of r.raw.split('\0').filter(Boolean)) {
    const m = /^(\d+) ([0-9a-f]+) ([123])\t([\s\S]*)$/.exec(entry);
    if (!m) continue;
    const rec = byPath.get(m[4]) || { path: m[4], stages: {}, modes: {} };
    const blob = git(['cat-file', 'blob', m[2]], cwd);
    rec.stages[m[3]] = blob.ok ? blob.raw : null;
    rec.modes[m[3]] = m[1];
    byPath.set(m[4], rec);
  }
  return [...byPath.values()];
}

// ---------------------------------------------------------------- conflict text

const START = /^<{7}( .*)?$/;
const BASE_MARK = /^\|{7}( .*)?$/;
const MIDDLE = /^={7}$/;
const END = /^>{7}( .*)?$/;
const HAS_MARKER = /^(<{7}|>{7})( |$)/m;

const append = (arr, x) => {
  arr[arr.length] = x;
};
const toLines = (text) => text.replace(/\n$/, '').split('\n');

/**
 * Splits a marked file into its conflict hunks and the text outside them.
 * @returns {{hunks: {base: string[], ours: string[], theirs: string[]}[], outside: string[][]}}
 */
function parseMarked(text) {
  const hunks = [];
  const outside = [[]];
  let cur = null;
  let part = null;
  for (const line of toLines(text)) {
    if (!cur && START.test(line)) {
      cur = { base: [], ours: [], theirs: [] };
      part = 'ours';
    } else if (cur && BASE_MARK.test(line)) part = 'base';
    else if (cur && MIDDLE.test(line)) part = 'theirs';
    else if (cur && END.test(line)) {
      append(hunks, cur);
      cur = null;
      append(outside, []);
    } else if (cur) append(cur[part], line);
    else append(outside[outside.length - 1], line);
  }
  return { hunks, outside };
}

/** Hunks of a three-way merge of the stages, from git merge-file --diff3 (not from a marked file on disk). */
function stageHunks(stages, cwd, tmp) {
  const names = { ours: stages[2], base: stages[1] || '', theirs: stages[3] };
  for (const [k, v] of Object.entries(names)) fs.writeFileSync(path.join(tmp, k), v);
  const r = git(['merge-file', '-p', '--diff3', path.join(tmp, 'ours'), path.join(tmp, 'base'), path.join(tmp, 'theirs')], cwd);
  // merge-file exits with the number of conflicts, so only the text matters here.
  return parseMarked(r.raw).hunks;
}

const indexOfRun = (lines, run, from) => {
  if (run.length === 0) return from;
  for (let i = from; i + run.length <= lines.length; i++) {
    if (run.every((l, k) => lines[i + k] === l)) return i;
  }
  return -1;
};

/** True when the file still has every line outside the hunks, in order, at the start, between and at the end. */
function keepsOutsideText(text, outside) {
  const lines = toLines(text);
  const first = outside[0];
  const last = outside[outside.length - 1];
  if (outside.length === 1) return lines.length === first.length && first.every((l, i) => lines[i] === l);
  if (!first.every((l, i) => lines[i] === l)) return false;
  let cursor = first.length;
  for (const mid of outside.slice(1, -1)) {
    const at = indexOfRun(lines, mid, cursor);
    if (at < 0) return false;
    cursor = at + mid.length;
  }
  const tailStart = lines.length - last.length;
  return tailStart >= cursor && last.every((l, i) => lines[tailStart + i] === l);
}

// ---------------------------------------------------------------- record files

/** The union of both sides of one clashing record file (ours, then theirs), or {error}. */
function unionOf(rec, cwd, tmp) {
  const { 2: ours, 3: theirs } = rec.stages;
  if (ours == null || theirs == null) return { error: rec.path + ': deleted on one side, cannot be merged' };
  const files = { ours, base: rec.stages[1] || '', theirs };
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(tmp, k), v);
  const r = git(['merge-file', '--union', '-p', path.join(tmp, 'ours'), path.join(tmp, 'base'), path.join(tmp, 'theirs')], cwd);
  if (!r.ok) return { error: rec.path + ': git merge-file failed: ' + r.err };
  if (rec.path.endsWith('.json')) {
    try {
      JSON.parse(r.raw);
    } catch (e) {
      return { error: rec.path + ': both sides kept is not valid JSON' };
    }
  }
  return { text: r.raw };
}

// ---------------------------------------------------------------- the project's checks

function showHead(rel, cwd) {
  const r = git(['show', 'HEAD:' + rel], cwd);
  return r.ok ? r.raw : null;
}

function jsonOrNull(text) {
  try {
    return text == null ? null : JSON.parse(text);
  } catch (e) {
    return null;
  }
}

const isArgv = (v) => Array.isArray(v) && v.length > 0 && v.every((a) => typeof a === 'string' && a !== '');

/**
 * The check plan, read from the pre-merge HEAD. One entry per check name:
 * { name, command: string[] } or { name, skipped: reason } or { name, invalid: reason }.
 */
function planChecks(cwd) {
  const settings = jsonOrNull(showHead('.claude/settings.json', cwd));
  const configured = settings && settings.ensemble && settings.ensemble.mergeChecks;
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    return CHECK_NAMES.map((name) => {
      const v = configured[name];
      if (v === undefined || v === false || v === null) return { name, skipped: 'not set in ensemble.mergeChecks' };
      if (!isArgv(v)) return { name, invalid: 'ensemble.mergeChecks.' + name + ' is not an argument array of strings' };
      return { name, command: v };
    });
  }
  const pkg = jsonOrNull(showHead('package.json', cwd));
  const rootFiles = git(['ls-tree', '--name-only', 'HEAD'], cwd).out.split('\n');
  const hasJest = !!(pkg && (pkg.jest || (pkg.devDependencies && pkg.devDependencies.jest) || (pkg.dependencies && pkg.dependencies.jest))) ||
    rootFiles.some((f) => /^jest\.config\./.test(f));
  return [
    pkg && pkg.scripts && pkg.scripts.lint
      ? { name: 'lint', command: ['npm', 'run', 'lint', '--silent'] }
      : { name: 'lint', skipped: 'no lint script in package.json' },
    rootFiles.includes('tsconfig.json')
      ? { name: 'typecheck', command: ['npx', '--no-install', 'tsc', '--noEmit'] }
      : { name: 'typecheck', skipped: 'no tsconfig.json' },
    hasJest
      ? { name: 'test', command: ['npx', '--no-install', 'jest', '--findRelatedTests', '--passWithNoTests', '{files}'] }
      : { name: 'test', skipped: 'jest is not configured' },
  ];
}

const expandFiles = (argv, files) => argv.flatMap((a) => (a === '{files}' ? files : [a]));
const tail = (s, n = 1500) => (s.length > n ? '...' + s.slice(-n) : s).trim();

function runCheck(item, files, cwd) {
  if (item.skipped) return { name: item.name, status: 'skipped', reason: item.skipped };
  if (item.invalid) return { name: item.name, status: 'failed', output: item.invalid };
  const argv = expandFiles(item.command, files);
  const command = item.command.join(' ');
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env: process.env, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const output = r.error ? String(r.error.message) : tail((r.stdout || '') + (r.stderr || ''));
    return { name: item.name, status: 'failed', command, output };
  }
  return { name: item.name, status: 'passed', command };
}

// ---------------------------------------------------------------- state

function topOf(dir) {
  const t = git(['rev-parse', '--show-toplevel'], dir);
  return t.ok ? t.out : null;
}

function statePath(cwd, stateDir) {
  if (stateDir) return path.join(path.resolve(cwd, stateDir), STATE_FILE);
  const g = git(['rev-parse', '--absolute-git-dir'], cwd);
  return path.join(g.out, STATE_FILE);
}

function readState(cwd, stateDir) {
  try {
    return JSON.parse(fs.readFileSync(statePath(cwd, stateDir), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeState(cwd, stateDir, state) {
  const p = statePath(cwd, stateDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state));
}

const hashFiles = (cwd, files) => files.map((f) => {
  const p = path.join(cwd, f);
  return f + ':' + (fs.existsSync(p) ? require('crypto').createHash('sha1').update(fs.readFileSync(p)).digest('hex') : 'absent');
}).join('|');

// ---------------------------------------------------------------- the ship-record entry

/**
 * { outcome: 'resolved'|'stopped', class, files: [{path, class, reason?}], checks: [{name, status, command?}],
 *   reproofScope, failedAttempts, stuck? } -- what the merge step passes as data.resolution.
 */
function buildEntry(state, reproofIds) {
  const stopped = state.status === 'stopped' || state.status === 'aborted';
  const files = (state.classification ? state.classification.files : []).map((f) => ({ path: f.path, class: f.class, ...(f.reason && f.class !== 'record' && f.class !== 'mechanical' ? { reason: f.reason } : {}) }));
  let reproofScope = STOPPED_BEFORE_GATE;
  if (!stopped) {
    const ids = reproofIds === undefined ? state.reproofIds : reproofIds;
    const crit = ids == null ? 'not read yet (run the custody gate)' : ids.length ? ids.join(', ') : 'none';
    reproofScope = 'files: ' + files.map((f) => f.path).join(', ') + '; criteria: ' + crit;
  }
  return {
    outcome: stopped ? 'stopped' : 'resolved',
    class: state.effectiveClass || (state.classification && state.classification.class) || 'unknown',
    ...(state.escalated ? { escalated: true } : {}),
    files,
    checks: (state.checks || []).map((c) => ({ name: c.name, status: c.status, ...(c.command ? { command: c.command } : {}), ...(c.reason ? { reason: c.reason } : {}) })),
    reproofScope,
    failedAttempts: state.failedAttempts || 0,
    ...(state.stuck ? { stuck: state.stuck } : {}),
  };
}

// ---------------------------------------------------------------- start

/** Stops the run before any edit: aborts the merge and reports the STUCK text. */
function stopNow(cwd, stateDir, state, classification) {
  git(['merge', '--abort'], cwd);
  const st = stuckText({ classification, command: '/ship-build' });
  const next = { ...state, status: 'stopped', classification, effectiveClass: classification.class, stuck: st.text };
  writeState(cwd, stateDir, next);
  return { ok: false, outcome: 'stopped', action: 'stop', class: classification.class, files: classification.files, stuck: st, resolution: buildEntry(next) };
}

/** Aborts and reports a stop that is not a grade (a merge or a record file that cannot be settled). */
function failStart(cwd, reason) {
  git(['merge', '--abort'], cwd);
  return { ok: false, outcome: 'stopped', action: 'stop', reason };
}

function start({ base, branch, prHead, trd, stateDir }, dir = process.cwd()) {
  if (!base || !branch || !prHead || !trd) return refuse('start needs --base, --branch, --pr-head and --trd');
  const cwd = topOf(dir);
  if (!cwd) return refuse('not a git work tree');
  const cur = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!cur.ok || cur.out !== branch) return refuse('current branch is ' + (cur.out || 'unknown') + ', not ' + branch);
  if (!git(['merge-base', '--is-ancestor', prHead, 'HEAD'], cwd).ok) return refuse('HEAD does not contain the PR head ' + prHead);
  if (mergeInProgress(cwd)) return refuse('a merge is already in progress');
  const dirty = dirtyTracked(cwd);
  if (dirty === null) return refuse('git status failed');
  const dirtyCode = dirty.filter((p) => !isRecordFile(p));
  if (dirtyCode.length) return refuse('uncommitted changes outside the record files: ' + dirtyCode.join(', '), { notRecord: dirtyCode });

  // Read before the merge touches anything: a merged settings.json hunk must not pick the commands.
  const plan = planChecks(cwd);
  const preHead = git(['rev-parse', 'HEAD'], cwd).out;

  const m = git(['merge', '--no-ff', '--no-commit', base], cwd);
  const unmerged = readStages(cwd);
  if (!m.ok && !mergeInProgress(cwd) && unmerged.length === 0) return refuse('git merge refused: ' + m.err);
  if (unmerged.length === 0) {
    if (mergeInProgress(cwd)) {
      const c = git(['commit', '--no-edit'], cwd);
      if (!c.ok) return failStart(cwd, 'git commit failed: ' + c.err);
    }
    return { ok: true, outcome: 'clean', head: git(['rev-parse', 'HEAD'], cwd).out };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-resolve-'));
  try {
    const graded = unmerged.map((rec) => {
      const { 1: b, 2: o, 3: t } = rec.stages;
      const mode = rec.modes[2] || rec.modes[3];
      const f = { path: rec.path, mode };
      if (o == null || t == null) f.deletedBy = o == null ? 'the PR branch' : 'the base';
      else if ([b, o, t].some((s) => s != null && s.includes('\0'))) f.binary = true;
      else if (!isRecordFile(rec.path)) {
        const hunks = stageHunks(rec.stages, cwd, tmp);
        const disk = parseMarked(fs.readFileSync(path.join(cwd, rec.path), 'utf8'));
        // The hunks graded must be the regions on disk; a mismatch is graded as "no hunks".
        if (hunks.length > 0 && hunks.length === disk.hunks.length) {
          f.hunks = hunks;
          f.outside = disk.outside;
        }
      }
      return f;
    });
    const classification = classify({ files: graded.map(({ outside, ...f }) => f), featureTrd: trd === 'none' ? undefined : trd });
    if (!classification.ok) return failStart(cwd, classification.reason);
    const base0 = { branch, base, preHead, plan, failedAttempts: 0, failedChecks: 0, checks: [] };
    const d = decide({ classification });
    if (d.stop) return stopNow(cwd, stateDir, base0, classification);

    // Settle the record files exactly as record-files.js does; leave the mechanical files marked.
    const records = unmerged.filter((r) => isRecordFile(r.path));
    const unions = [];
    for (const rec of records) {
      const u = unionOf(rec, cwd, tmp);
      if (u.error) return failStart(cwd, u.error);
      append(unions, { path: rec.path, text: u.text });
    }
    for (const { path: p, text } of unions) {
      fs.writeFileSync(path.join(cwd, p), text);
      if (!git(['add', '--', p], cwd).ok) return failStart(cwd, 'git add ' + p + ' failed');
    }
    const mechanical = graded.filter((f) => classification.files.find((c) => c.path === f.path).class === 'mechanical');
    if (mechanical.length === 0) {
      const c = git(['commit', '--no-edit'], cwd);
      if (!c.ok) return failStart(cwd, 'git commit failed: ' + c.err);
      const head = git(['rev-parse', 'HEAD'], cwd).out;
      const state = { ...base0, status: 'committed', classification, effectiveClass: classification.class, head, mechanical: [] };
      writeState(cwd, stateDir, state);
      return { ok: true, outcome: 'resolved', head, mechanical: [], resolution: buildEntry(state) };
    }
    const state = {
      ...base0,
      status: 'resolving',
      classification,
      effectiveClass: 'mechanical',
      mechanical: mechanical.map((f) => ({ path: f.path, outside: f.outside })),
    };
    writeState(cwd, stateDir, state);
    return {
      ok: true,
      outcome: 'resolving',
      mechanical: mechanical.map((f) => f.path),
      records: records.map((r) => r.path),
      files: classification.files,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- check / commit / abort / entry

function loadResolving(stateDir, dir) {
  const cwd = topOf(dir);
  if (!cwd) return { error: refuse('not a git work tree') };
  const state = readState(cwd, stateDir);
  if (!state || state.status !== 'resolving') return { error: refuse('no resolution in progress (run start first)') };
  if (!mergeInProgress(cwd)) return { error: refuse('the merge is no longer in progress') };
  return { cwd, state };
}

function check({ stateDir }, dir = process.cwd()) {
  const loaded = loadResolving(stateDir, dir);
  if (loaded.error) return loaded.error;
  const { cwd, state } = loaded;

  const markers = [];
  const editedOutside = [];
  for (const f of state.mechanical) {
    const text = fs.existsSync(path.join(cwd, f.path)) ? fs.readFileSync(path.join(cwd, f.path), 'utf8') : '';
    if (HAS_MARKER.test(text)) append(markers, f.path);
    else if (!keepsOutsideText(text, f.outside)) append(editedOutside, f.path);
  }
  if (markers.length || editedOutside.length) {
    const why = [];
    if (markers.length) append(why, 'conflict markers remain in ' + markers.join(', '));
    if (editedOutside.length) append(why, 'text outside the conflict hunks changed in ' + editedOutside.join(', '));
    return refuse(why.join('; '), { markers, editedOutside });
  }

  const files = state.mechanical.map((f) => f.path).filter((p) => fs.existsSync(path.join(cwd, p)));
  const checks = state.plan.map((item) => runCheck(item, files, cwd));
  const failed = checks.filter((c) => c.status === 'failed');
  state.checks = checks.map(({ output, ...c }) => c);
  const failedChecks = state.failedChecks + (failed.length ? 1 : 0);
  // The first failed check is not a failed FIX attempt; each later one is.
  const failedAttempts = Math.max(0, failedChecks - 1);
  const d = decide({ classification: state.classification, resolved: true, checksFailed: failed.length > 0, failedAttempts });
  state.failedChecks = failedChecks;
  state.failedAttempts = failedAttempts;

  if (d.action === 'commit') {
    state.checkedHash = hashFiles(cwd, state.mechanical.map((f) => f.path));
    writeState(cwd, stateDir, state);
    return { ok: true, action: 'commit', checks: state.checks, failedAttempts };
  }
  if (d.action === 'fix') {
    writeState(cwd, stateDir, state);
    return {
      ok: true,
      action: 'fix',
      checks: state.checks,
      failures: failed.map((c) => ({ name: c.name, command: c.command, output: c.output })),
      failedAttempts,
    };
  }
  // stop: two fix attempts failed. The merge is left in place for repair by hand; nothing is sent.
  const lastFailure = failed.map((c) => c.name + ': ' + (tail(c.output || '', 300).split('\n').pop() || 'failed')).join('; ');
  const st = stuckText({ classification: state.classification, command: '/ship-build', failedAttempts, lastFailure });
  state.status = 'stopped';
  state.effectiveClass = d.effectiveClass;
  state.escalated = d.escalated;
  state.stuck = st.text;
  writeState(cwd, stateDir, state);
  return { ok: false, outcome: 'stopped', action: 'stop', stuck: st, checks: state.checks, failedAttempts, resolution: buildEntry(state) };
}

function commit({ stateDir }, dir = process.cwd()) {
  const loaded = loadResolving(stateDir, dir);
  if (loaded.error) return loaded.error;
  const { cwd, state } = loaded;
  const paths = state.mechanical.map((f) => f.path);
  if (!state.checkedHash) return refuse('the checks have not passed yet (run check)');
  if (state.checkedHash !== hashFiles(cwd, paths)) return refuse('files changed since the last passing check (run check again)');
  for (const p of paths) {
    if (!git(['add', '--', p], cwd).ok) return refuse('git add ' + p + ' failed');
  }
  const left = git(['diff', '--name-only', '--diff-filter=U', '-z'], cwd).raw.split('\0').filter(Boolean);
  if (left.length) return refuse('still unmerged: ' + left.join(', '), { unmerged: left });
  const c = git(['commit', '--no-edit'], cwd);
  if (!c.ok) return refuse('git commit failed: ' + c.err);
  const head = git(['rev-parse', 'HEAD'], cwd).out;
  state.status = 'committed';
  state.head = head;
  writeState(cwd, stateDir, state);
  return { ok: true, outcome: 'resolved', head, resolution: buildEntry(state) };
}

function abort({ stateDir }, dir = process.cwd()) {
  const cwd = topOf(dir);
  if (!cwd) return refuse('not a git work tree');
  const state = readState(cwd, stateDir);
  const wasMerging = mergeInProgress(cwd);
  if (wasMerging && !git(['merge', '--abort'], cwd).ok) return refuse('git merge --abort failed');
  if (state && state.status === 'resolving') {
    writeState(cwd, stateDir, { ...state, status: 'aborted', effectiveClass: state.effectiveClass });
  }
  return { ok: true, outcome: 'aborted', merging: wasMerging };
}

function entry({ stateDir, reproofIds }, dir = process.cwd()) {
  const cwd = topOf(dir);
  if (!cwd) return refuse('not a git work tree');
  const state = readState(cwd, stateDir);
  if (!state) return refuse('no resolution recorded (run start first)');
  let ids;
  if (reproofIds !== undefined) {
    ids = reproofIds === 'none' || reproofIds === '' ? [] : reproofIds.split(',').map((s) => s.trim()).filter(Boolean);
    state.reproofIds = ids;
    writeState(cwd, stateDir, state);
  }
  return { ok: true, resolution: buildEntry(state, ids) };
}

// ---------------------------------------------------------------- CLI

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE = 'usage: merge-resolve.js start --base REF --branch NAME --pr-head SHA --trd PATH|none | check | commit | abort | entry [--reproof-ids IDS|none]   (all: [--state-dir D])';

function main(argv) {
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o) + '\n');
    return 0;
  };
  const stateDir = flag(argv, '--state-dir');
  switch (argv[0]) {
    case 'start':
      return emit(start({ base: flag(argv, '--base'), branch: flag(argv, '--branch'), prHead: flag(argv, '--pr-head'), trd: flag(argv, '--trd'), stateDir }));
    case 'check':
      return emit(check({ stateDir }));
    case 'commit':
      return emit(commit({ stateDir }));
    case 'abort':
      return emit(abort({ stateDir }));
    case 'entry':
      return emit(entry({ stateDir, reproofIds: flag(argv, '--reproof-ids') }));
    default:
      return emit(refuse(USAGE));
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { start, check, commit, abort, entry, planChecks, parseMarked, keepsOutsideText, main };
