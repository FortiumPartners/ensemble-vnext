'use strict';

/**
 * ship-record-dir.js -- where a /ship-build run's detached records live, and which run is current.
 *
 * WHY: a merge changes the branch under the run. The tracked `<stateDir>/shipped.json` and
 * `custody.json` would then be dirty files on a merged branch, so after the detach the run's
 * records live in the git common dir (shared by every worktree, so they outlive the branch):
 *   <git common dir>/ensemble/ship/<basename(stateDir)>/
 *     current.json              pointer: { startedAt, work: {kind,id,branch}, at }
 *     <safeName(startedAt)>.json           the detached run record (written by ship-sequencer)
 *     <safeName(startedAt)>.custody.json   the detached custody anchor (written by custody)
 *
 * Both ship-sequencer.js and custody.js require this; neither may require the other's path rule
 * from anywhere else. Only `startedAt` of the pointer is ever read; `work` and `at` are for a
 * person looking at the folder.
 *
 * Example: custodyPath('.trd-state/f') -> '<tracked>/custody.json' until the run detaches, then
 * '<common>/ensemble/ship/f/2026-11-08T10-00-00-000Z.custody.json'.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const implementState = require('./implement-state');

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
function readPointer(stateDir) {
  const dir = recordDir(stateDir);
  if (!dir) return null;
  const p = readJson(path.join(dir, POINTER_FILE));
  return p && typeof p.startedAt === 'string' && p.startedAt ? p : null;
}

/** Writes the pointer. Returns its path, or null outside git or without a startedAt. */
function writePointer(stateDir, { startedAt, work } = {}) {
  if (!startedAt) return null;
  const dir = recordDir(stateDir);
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, POINTER_FILE);
  implementState.save(file, { startedAt, work: work || null, at: new Date().toISOString() });
  return file;
}

/**
 * The current run's startedAt: the tracked shipped.json's when readable (loadState's own
 * precedence, so a worktree whose tracked record names run B never follows a pointer moved to
 * run A), otherwise the pointer's. Null when neither names one.
 */
function currentStartedAt(stateDir) {
  const tracked = readJson(path.join(stateDir, 'shipped.json'));
  if (tracked && typeof tracked.startedAt === 'string' && tracked.startedAt) return tracked.startedAt;
  const p = readPointer(stateDir);
  return p ? p.startedAt : null;
}

/**
 * Where the custody anchor lives: the detached file when it exists or the run's detached record
 * exists (so a first anchor set after the detach still lands outside the tree), else the tracked
 * `<stateDir>/custody.json`.
 */
function custodyPath(stateDir) {
  const tracked = path.join(stateDir, 'custody.json');
  const s = currentStartedAt(stateDir);
  const dir = s ? recordDir(stateDir) : null;
  if (!dir) return tracked;
  const stem = path.join(dir, safeName(s));
  if (fs.existsSync(`${stem}.custody.json`) || fs.existsSync(`${stem}.json`)) return `${stem}.custody.json`;
  return tracked;
}

module.exports = { recordDir, safeName, readPointer, writePointer, currentStartedAt, custodyPath };
