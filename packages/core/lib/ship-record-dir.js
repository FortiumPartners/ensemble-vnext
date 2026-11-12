'use strict';

/**
 * ship-record-dir.js -- where a /ship-build run's post-merge records live, and which run is current.
 *
 * WHY: a merge changes the branch under the run. The tracked `<stateDir>/shipped.json` and
 * `custody.json` would then be dirty files on a merged branch, so from the detach onward the run's
 * records are kept off the tree:
 *   1. ON THE RECORDS REF (the normal path): `refs/ensemble/records/<slug>` holds `shipped.json`
 *      (the run record) and `custody.json` (the anchor, stamped with the run's `startedAt`),
 *      written through `record-ref.js writeFiles`, which never touches the worktree or the branch.
 *      Only a state dir shaped `<git top>/.trd-state/<slug>` can use the ref.
 *   2. IN THE DETACHED FOLDER (legacy runs, and the fallback when a ref write fails):
 *      <git common dir>/ensemble/ship/<basename(stateDir)>/
 *        current.json              pointer: { startedAt, work: {kind,id,branch}, at }
 *        <safeName(startedAt)>.json           the detached run record
 *        <safeName(startedAt)>.custody.json   the detached custody anchor
 *
 * Both ship-sequencer.js and custody.js require this; neither may require the other's path rule
 * from anywhere else. This module requires neither of them (and record-ref.js does not require
 * this one). Only `startedAt` of the pointer is ever read; `work` and `at` are for a person.
 *
 * WHICH COPY WINS: a run can have up to three copies (tracked, ref, folder). They are compared by
 * `startedAt` first and `updatedAt` second; the later wins; a tie goes ref, then folder, then
 * tracked (the tracked copy is the pre-merge one). See `resolveRun`.
 *
 * Every function here is local-only by default (never fetches); pass `{local: false}` to let a
 * read fetch the ref from origin. Nothing here throws.
 *
 * Example: custodyPath('.trd-state/f') -> '<tracked>/custody.json' until the run detaches, then
 * 'refs/ensemble/records/f:custody.json' (ref-held) or
 * '<common>/ensemble/ship/f/2026-11-08T10-00-00-000Z.custody.json' (legacy folder run).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const implementState = require('./implement-state');
const recordRef = require('./record-ref');

const POINTER_FILE = 'current.json';

/**
 * The detached-record folder for a state directory, or null when it is not inside a git directory.
 */
function recordDir(stateDir) {
  let dir = path.resolve(stateDir);
  while (!fs.existsSync(dir)) {
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: dir, encoding: 'utf8', env });
  if (r.status !== 0 || !r.stdout.trim()) return null;
  const common = path.resolve(dir, r.stdout.trim());
  return path.join(common, 'ensemble', 'ship', path.basename(path.resolve(stateDir)));
}

/** A startedAt as a file-name stem. */
const safeName = (startedAt) => String(startedAt).replace(/[^A-Za-z0-9_-]/g, '-');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** The pointer's contents, or null (no folder, no pointer, or unreadable). */
function readPointer(stateDir, dir = recordDir(stateDir)) {
  if (!dir) return null;
  const p = readJson(path.join(dir, POINTER_FILE));
  return p && typeof p.startedAt === 'string' && p.startedAt ? p : null;
}

/**
 * Writes the pointer. Returns its path, or null outside git, without a startedAt, or when the
 * folder cannot be written (a git common dir shared between OS users may not be writable by
 * this one). Never throws: a missing pointer only stops a later read from finding a detached run.
 */
function writePointer(stateDir, { startedAt, work } = {}) {
  if (!startedAt) return null;
  const dir = recordDir(stateDir);
  if (!dir) return null;
  const file = path.join(dir, POINTER_FILE);
  try {
    fs.mkdirSync(dir, { recursive: true });
    implementState.save(file, { startedAt, work: work || null, at: new Date().toISOString() });
  } catch {
    return null;
  }
  return file;
}

// ---------------------------------------------------------------------------
// the records ref
// ---------------------------------------------------------------------------

const STATE_ROOT = '.trd-state';
const RUN_FILE = 'shipped.json';
const CUSTODY_FILE = 'custody.json';
const COMMAND = 'ship-build';

/**
 * Where `stateDir` sits on the ref: `{top, slug, ref}` when it is `<git top>/.trd-state/<slug>`
 * (the folder itself need not exist) with a slug Forge reads, else null. `top` is the work tree's
 * realpath. Anything else (a test's `<tmp>/state`) cannot use the ref and keeps the file rule.
 */
function refTarget(stateDir) {
  try {
    const abs = path.resolve(stateDir);
    let dir = abs;
    while (!fs.existsSync(dir)) {
      const up = path.dirname(dir);
      if (up === dir) return null;
      dir = up;
    }
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_WORK_TREE;
    delete env.GIT_INDEX_FILE;
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', env });
    if (r.status !== 0 || !r.stdout.trim()) return null;
    const top = fs.realpathSync(r.stdout.trim());
    const dest = path.join(fs.realpathSync(dir), path.relative(dir, abs));
    const rel = path.relative(top, dest).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || path.posix.dirname(rel) !== STATE_ROOT) return null;
    const slug = path.posix.basename(rel);
    if (!recordRef.isSafeSlug(slug) || slug === recordRef.SHARED_SLUG) return null;
    return { top, slug, ref: recordRef.refFor(slug) };
  } catch {
    return null;
  }
}

/** The run's identity as the ref's `record.json` carries it: its own branch and Forge feature id. */
function identityOf(state) {
  const w = (state && state.work) || {};
  return {
    branch: typeof w.branch === 'string' && w.branch ? w.branch : null,
    forge_feature_id: typeof w.forge_feature_id === 'string' && w.forge_feature_id ? w.forge_feature_id : null,
  };
}

/** One JSON file off the ref (local unless `local === false`), with the ref's commit and identity; else null. */
function readRefJson(target, file, local) {
  const r = recordRef.read({ slug: target.slug, file, cwd: target.top, local: local !== false });
  if (!r.ok || r.encoding !== 'utf8') return null;
  try {
    const json = JSON.parse(r.content);
    return json && typeof json === 'object' ? { json, commit: r.commit, identity: r.identity } : null;
  } catch {
    return null;
  }
}

const trackedRun = (stateDir) => readJson(path.join(stateDir, RUN_FILE));

/**
 * The run record held on the records ref, or null.
 *
 * Reads `shipped.json` at `refs/ensemble/records/<slug>` (the local ref only, unless
 * `opts.local === false`, which lets a missing ref be fetched). Accepts it only when ALL hold:
 * the record is `detached`; its `startedAt` equals `opts.startedAt` -- or, when that is not
 * given, the tracked `<stateDir>/shipped.json`'s `startedAt` when a tracked file is readable
 * (any run is accepted when there is neither); and the ref's `record.json` identity matches the
 * record's own `work` (Forge's rule: the same feature id, else the same branch). Anything else,
 * including a state dir that cannot use the ref, is null.
 *
 * @example refRun('.trd-state/f') // => { state: {...detached run...}, ref: 'refs/ensemble/records/f', commit: '<sha>' }
 * @param {string} stateDir
 * @param {{startedAt?: string, local?: boolean}} [opts]
 * @returns {{state: object, ref: string, commit: string}|null}
 */
function refRun(stateDir, opts = {}) {
  try {
    const target = refTarget(stateDir);
    if (!target) return null;
    const want = opts.startedAt || (trackedRun(stateDir) || {}).startedAt || null;
    const got = readRefJson(target, RUN_FILE, opts.local);
    if (!got) return null;
    const state = got.json;
    if (!state.detached || typeof state.startedAt !== 'string' || !state.startedAt) return null;
    if (want && state.startedAt !== want) return null;
    if (!recordRef.sameFeature(got.identity, identityOf(state))) return null;
    return { state, ref: target.ref, commit: got.commit };
  } catch {
    return null;
  }
}

/** The detached folder's record for `startedAt` (must be detached), or null. */
function folderRun(stateDir, startedAt) {
  const dir = recordDir(stateDir);
  if (!dir || !startedAt) return null;
  const state = readJson(path.join(dir, `${safeName(startedAt)}.json`));
  return state && state.detached && state.startedAt === startedAt ? state : null;
}

/**
 * Which copy of the run is current. `tracked` is the parsed tracked `shipped.json` or null.
 *
 * With a tracked run, the candidates are the tracked copy, the ref's copy of the SAME run and the
 * detached folder's copy of it. With none, they are the ref's detached record (identity-matched,
 * any `startedAt`) and the detached record the folder's pointer names. The winner has the later
 * `startedAt`, then the later `updatedAt`; a tie goes ref, then folder, then tracked. This is what
 * stops a save that fell back to the folder after an earlier ref write from being read as older.
 *
 * @example resolveRun('.trd-state/f', tracked) // => { state, source: 'ref', ref: 'refs/ensemble/records/f' }
 * @param {string} stateDir
 * @param {object|null} tracked
 * @param {{local?: boolean}} [opts] `local: false` lets the ref be fetched (`start --resume` only)
 * @returns {{state: object, source: 'tracked'|'ref'|'folder', ref?: string}|null}
 */
function resolveRun(stateDir, tracked, opts = {}) {
  try {
    const have = tracked && typeof tracked.startedAt === 'string' && tracked.startedAt ? tracked : null;
    const cands = [];
    const viaRef = refRun(stateDir, { startedAt: have ? have.startedAt : undefined, local: opts.local });
    if (viaRef) cands.push({ state: viaRef.state, source: 'ref', ref: viaRef.ref });
    let folder = null;
    if (have) folder = folderRun(stateDir, have.startedAt);
    else {
      const ptr = readPointer(stateDir);
      folder = ptr ? folderRun(stateDir, ptr.startedAt) : null;
    }
    if (folder) cands.push({ state: folder, source: 'folder' });
    if (tracked) cands.push({ state: tracked, source: 'tracked' });
    // Array order is the tie order; a strictly later key replaces the best so far.
    const key = (c) => [String(c.state.startedAt || ''), String(c.state.updatedAt || '')];
    let best = null;
    for (const c of cands) {
      if (!best) best = c;
      else {
        const [a1, a2] = key(c);
        const [b1, b2] = key(best);
        if (a1 > b1 || (a1 === b1 && a2 > b2)) best = c;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Writes the detached run record: onto the records ref first, the detached folder as fallback.
 *
 * Mutates `state`: `work.forge_feature_id` is filled from `FORGE_FEATURE_ID` (or null) when the
 * run predates the field, and `recordRef` / `recordPath` are set to where the record landed --
 * `refs/ensemble/records/<slug>` and `<ref>:shipped.json` for the ref, or `recordPath` = the
 * folder file (and `recordRef` removed, the pointer written as before) for the fallback. The
 * caller sets `detached` and `updatedAt`. The ref write is one `record-ref.js writeFiles` commit
 * (other files on the ref are kept; the worktree, index and branch are never touched), pushed
 * when there is an origin unless `opts.push === false` (a save from `next`). A failed push alone
 * is not a fallback: the local ref holds the record and `push` says `failed`.
 *
 * @example writeRunRecord(stateDir, state) // => { ok: true, where: 'ref', recordPath: 'refs/ensemble/records/f:shipped.json', push: 'pushed' }
 * @param {string} stateDir
 * @param {object} state the run record
 * @param {{push?: boolean, localOnly?: boolean, step?: string}} [opts] `localOnly: true` is `push: false` under
 *   a name ship-sequencer.js can use (its source may not name a shipping primitive, and `push` is one)
 * @returns {{ok: boolean, where: 'ref'|'folder'|'none', recordPath: string|null, push?: string,
 *   pushError?: string, refError?: string, reason?: string}}
 */
function writeRunRecord(stateDir, state, opts = {}) {
  try {
    const w = (state.work = state.work || {});
    if (typeof w.forge_feature_id === 'undefined') w.forge_feature_id = process.env.FORGE_FEATURE_ID || null;
    const target = refTarget(stateDir);
    let refError = null;
    if (target) {
      state.recordRef = target.ref;
      state.recordPath = `${target.ref}:${RUN_FILE}`;
      const r = recordRef.writeFiles({
        cwd: target.top,
        slug: target.slug,
        files: [{ rel: RUN_FILE, content: JSON.stringify(state, null, 2) }],
        identity: identityOf(state),
        command: COMMAND,
        step: opts.step || 'record run',
        push: opts.push !== false && !opts.localOnly,
      });
      if (r.ok && r.outcome === 'ref') {
        return { ok: true, where: 'ref', recordPath: state.recordPath, push: r.push, ...(r.pushError ? { pushError: r.pushError } : {}) };
      }
      refError = r.reason || r.outcome || 'ref write failed';
      delete state.recordRef;
    }
    const dir = recordDir(stateDir);
    if (!dir || !state.startedAt) return { ok: false, where: 'none', recordPath: null, ...(refError ? { refError } : {}), reason: 'no place to write the run record' };
    const file = path.join(dir, `${safeName(state.startedAt)}.json`);
    state.recordPath = file;
    fs.mkdirSync(dir, { recursive: true });
    implementState.save(file, state);
    writePointer(stateDir, { startedAt: state.startedAt, work: { kind: w.kind, id: w.id, branch: w.branch } });
    return { ok: true, where: 'folder', recordPath: file, ...(refError ? { refError } : {}) };
  } catch (e) {
    return { ok: false, where: 'none', recordPath: null, reason: e && e.message };
  }
}

// ---------------------------------------------------------------------------
// custody
// ---------------------------------------------------------------------------

/**
 * The current run's startedAt: the tracked shipped.json's when readable (loadState's own
 * precedence, so a worktree whose tracked record names run B never follows a pointer moved to
 * run A), otherwise the ref's detached run (local read), otherwise the pointer's. Null when none
 * names one.
 */
function currentStartedAt(stateDir, dir) {
  const tracked = trackedRun(stateDir);
  if (tracked && typeof tracked.startedAt === 'string' && tracked.startedAt) return tracked.startedAt;
  const viaRef = refRun(stateDir);
  if (viaRef) return viaRef.state.startedAt;
  const p = readPointer(stateDir, dir);
  return p ? p.startedAt : null;
}

const hasAnchor = (c) => Boolean(c && c.anchor && typeof c.anchor.commit === 'string');

/**
 * Where the custody anchor is read from and written to. `read` is the first copy that holds an
 * anchor: the ref's `custody.json` stamped with this run's `startedAt` (unless the detached
 * `<startedAt>.custody.json` carries a later `savedAt`: a ref write fell back to it), else the
 * detached file, else the tracked file. `write` is the ref for a ref-held run
 * (`refRun`), else the detached file when it or the run's detached record exists there (so a
 * first anchor set after the detach still lands outside the tree), else the tracked file.
 */
function custodyPlaces(stateDir, local) {
  const tracked = path.join(stateDir, CUSTODY_FILE);
  const target = refTarget(stateDir);
  const dir = recordDir(stateDir); // one `git rev-parse` per call
  // currentStartedAt's rule, inlined so the ref's run record is read once, not twice.
  let startedAt = null;
  let held = null;
  if (dir || target) {
    const t = trackedRun(stateDir);
    if (t && typeof t.startedAt === 'string' && t.startedAt) startedAt = t.startedAt;
    else if (target) {
      held = refRun(stateDir, { local });
      if (held) startedAt = held.state.startedAt;
    }
    if (!startedAt) {
      const p = readPointer(stateDir, dir);
      startedAt = p ? p.startedAt : null;
    }
  }
  if (target && startedAt && !held) held = refRun(stateDir, { startedAt, local });
  const stem = dir && startedAt ? path.join(dir, safeName(startedAt)) : null;
  const folderCustody = stem ? `${stem}.custody.json` : null;

  let onRef = null;
  if (target && startedAt) {
    const got = readRefJson(target, CUSTODY_FILE, local);
    if (got && got.json.startedAt === startedAt && hasAnchor(got.json)) onRef = got.json;
  }
  const refPath = target ? `${target.ref}:${CUSTODY_FILE}` : null;
  const folder = folderCustody && fs.existsSync(folderCustody) ? readJson(folderCustody) : null;
  // A ref write that failed fell back to the folder file: its later `savedAt` beats the ref's
  // older copy. An unstamped (legacy) folder copy never beats a ref copy.
  const folderNewer = Boolean(onRef && hasAnchor(folder) && String(folder.savedAt || '') > String(onRef.savedAt || ''));

  let read;
  if (onRef && !folderNewer) read = { kind: 'ref', path: refPath, custody: onRef };
  else if (folderCustody && fs.existsSync(folderCustody)) read = { kind: 'file', path: folderCustody, custody: folder };
  else read = { kind: 'tracked', path: tracked, custody: readJson(tracked) };

  let write;
  if (held) write = { kind: 'ref', path: refPath, target, state: held.state };
  else if (stem && (fs.existsSync(folderCustody) || fs.existsSync(`${stem}.json`))) write = { kind: 'file', path: folderCustody };
  else write = { kind: 'file', path: tracked };
  return { read, write, startedAt, folderCustody };
}

/**
 * The custody anchor's location as a string: `<ref>:custody.json` (e.g.
 * `refs/ensemble/records/f:custody.json`, readable with `git show`) when the ref holds this run's
 * anchor, or when the run is ref-held and nothing holds an anchor yet; otherwise a file path
 * (detached folder or tracked). Where a ref or folder anchor exists this is where `readCustody`
 * reads it; otherwise it is where the next `writeCustody` will put one.
 */
function custodyPath(stateDir, opts = {}) {
  const { read, write } = custodyPlaces(stateDir, opts.local !== false);
  // A tracked anchor is not "where it lives" once the run is detached: the write target is.
  return hasAnchor(read.custody) && read.kind !== 'tracked' ? read.path : write.path;
}

/**
 * The custody anchor, or null. Precedence: the ref's `custody.json` when stamped with the run's
 * `startedAt` (an unstamped or other run's copy is ignored) unless the detached
 * `<startedAt>.custody.json` was saved later (its `savedAt`), else that detached file, else the tracked `<stateDir>/custody.json`. A copy without
 * `anchor.commit` is no anchor. Local read; never fetches unless `opts.local === false`.
 * @returns {object|null} the stored object (a ref copy includes its `startedAt` stamp)
 */
function readCustody(stateDir, opts = {}) {
  try {
    const { custody } = custodyPlaces(stateDir, opts.local !== false).read;
    return hasAnchor(custody) ? custody : null;
  } catch {
    return null;
  }
}

/**
 * Writes the custody anchor where `custodyPlaces().write` says. For a ref-held run that is one
 * `writeFiles` commit of `custody.json` stamped with the run's `startedAt` (identity from the
 * run record; pushed unless `opts.push === false`); if the ref write fails the anchor is written
 * to the detached folder file instead, so a move is never lost. Both copies carry `savedAt`, and
 * on read a folder copy saved later than the ref's wins. Otherwise it is the file write as before.
 * @returns {{ok: boolean, where: 'ref'|'file', path: string|null, push?: string, refError?: string, reason?: string}}
 */
function writeCustody(stateDir, custody, opts = {}) {
  try {
    const { write, folderCustody, startedAt } = custodyPlaces(stateDir, true);
    let refError = null;
    const stamped = write.kind === 'ref' ? { ...custody, startedAt, savedAt: new Date().toISOString() } : custody;
    if (write.kind === 'ref') {
      const r = recordRef.writeFiles({
        cwd: write.target.top,
        slug: write.target.slug,
        files: [{ rel: CUSTODY_FILE, content: JSON.stringify(stamped, null, 2) }],
        identity: identityOf(write.state),
        command: COMMAND,
        step: opts.step || 'custody anchor',
        push: opts.push !== false,
      });
      if (r.ok && r.outcome === 'ref') return { ok: true, where: 'ref', path: write.path, push: r.push };
      refError = r.reason || r.outcome || 'ref write failed';
    }
    const file = write.kind === 'ref' ? folderCustody : write.path;
    if (!file) return { ok: false, where: 'file', path: null, ...(refError ? { refError } : {}), reason: 'no place to write the anchor' };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    implementState.save(file, stamped);
    return { ok: true, where: 'file', path: file, ...(refError ? { refError } : {}) };
  } catch (e) {
    return { ok: false, where: 'file', path: null, reason: e && e.message };
  }
}

module.exports = {
  recordDir,
  safeName,
  readPointer,
  writePointer,
  currentStartedAt,
  refTarget,
  refRun,
  resolveRun,
  writeRunRecord,
  custodyPath,
  readCustody,
  writeCustody,
};
