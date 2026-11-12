/**
 * status.js with the feature folder absent (real git, no mock-fs).
 *
 * status.js is deliberately unchanged by readers-fall-back-to-the-ref: it only walks existing
 * `.trd-state/<slug>/implement.json` files, so with the folder absent it has nothing to do, must
 * not materialise the folder from the records ref, and must not fetch. These tests pin that.
 * Kept apart from status.test.js because mock-fs there breaks real git.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const recordRef = require('../lib/record-ref');

const HOOK = path.join(__dirname, 'status.js');
const SLUG = 'feat';
const REF = `refs/ensemble/records/${SLUG}`;

let cleanups = [];

function env(extra = {}) {
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', ...extra };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'FORGE_FEATURE_ID', 'STATUS_HOOK_DISABLE', 'CLAUDE_PROJECT_DIR']) delete e[k];
  return e;
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: env() });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function tmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `st-${prefix}-`)));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repo whose records ref holds implement.json, pushed to a bare origin; the folder is then removed. */
function setup() {
  const origin = tmp('origin');
  git(origin, ['init', '-q', '--bare', '-b', 'main']);
  const repo = tmp('repo');
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Test']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-q', '-m', 'init']);
  git(repo, ['remote', 'add', 'origin', origin]);

  const stateDir = `.trd-state/${SLUG}`;
  fs.mkdirSync(path.join(repo, stateDir), { recursive: true });
  fs.writeFileSync(path.join(repo, stateDir, 'implement.json'),
    JSON.stringify({ tasks: { 'T-1': { status: 'in_progress', cycle_position: 'implement' } } }));
  const w = recordRef.write({ stateDir, command: 'implement-trd', step: 'phase 1', cwd: repo });
  expect(w.ok).toBe(true);
  git(repo, ['push', '-q', 'origin', REF]);

  fs.rmSync(path.join(repo, stateDir), { recursive: true, force: true });
  fs.writeFileSync(path.join(repo, '.trd-state', 'current.json'),
    JSON.stringify({ trd: `docs/TRD/${SLUG}.md`, status: `${stateDir}/implement.json` }));
  return { repo, origin, stateDir };
}

function runHook(repo) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd: repo, input: JSON.stringify({ cwd: repo }), encoding: 'utf8', env: env({ CLAUDE_PROJECT_DIR: repo })
  });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout.trim()).hookSpecificOutput.status;
}

afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

describe('status.js with the feature folder absent', () => {
  test('reports today\'s status and does not materialise the folder', () => {
    const { repo, stateDir } = setup();
    const status = runHook(repo);
    expect(['no_files', 'no_state']).toContain(status);
    expect(fs.existsSync(path.join(repo, stateDir))).toBe(false);
  });

  test('never fetches: a ref held only by origin is not brought in', () => {
    const { repo } = setup();
    git(repo, ['update-ref', '-d', REF]); // local ref gone; origin still holds it
    expect(git(repo, ['for-each-ref', 'refs/ensemble/records/'])).toBe('');
    runHook(repo);
    expect(git(repo, ['for-each-ref', 'refs/ensemble/records/'])).toBe('');
  });
});
