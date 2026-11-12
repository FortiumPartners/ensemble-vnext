'use strict';

/**
 * Tests for records-cutover.js, on real throwaway git repositories (real linked worktrees, a real
 * bare origin); git is never mocked.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { seed } = require('./records-cutover');

const LIB = path.join(__dirname, 'records-cutover.js');
let cleanups = [];

function envFor(extra = {}) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', ...extra };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
  if (!('FORGE_FEATURE_ID' in extra)) delete env.FORGE_FEATURE_ID;
  return env;
}
function sh(cwd, args, extra) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: envFor(extra) });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return (r.stdout || '').trim();
}
function mkTmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `rc-${prefix}-`)));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, rel, content) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
function initRepo() {
  const dir = mkTmp('repo');
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['config', 'user.name', 'Test']);
  sh(dir, ['config', 'user.email', 't@example.com']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  put(dir, 'README.md', 'hi\n');
  sh(dir, ['add', '.']);
  sh(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}
const impl = (branch) => JSON.stringify({ version: 1, branch, tasks: {} }) + '\n';
const REF = (slug) => `refs/ensemble/records/${slug}`;
const show = (repo, slug, file) => spawnSync('git', ['cat-file', 'blob', `${REF(slug)}:${file}`], { cwd: repo, env: envFor() }).stdout;
const hasRef = (repo, slug) => spawnSync('git', ['rev-parse', '--verify', '-q', REF(slug)], { cwd: repo, env: envFor() }).status === 0;
const snapshot = (dirs) => dirs.map((d) => [sh(d, ['rev-parse', 'HEAD']), sh(d, ['status', '--porcelain=v1', '-uall']), sh(d, ['rev-list', '--count', 'HEAD']), fs.existsSync(path.join(d, '.git')) ? fs.readFileSync(path.join(sh(d, ['rev-parse', '--git-dir']).replace(/^(?!\/)/, d + '/'), 'index')).toString('hex') : '']);

/** main holds a legacy folder; a linked worktree on feature/x holds the in-flight folder `live`. */
function scene() {
  const repo = initRepo();
  put(repo, '.trd-state/legacy/implement.json', impl('feature/gone'));
  const wt = path.join(mkTmp('wt'), 'x');
  sh(repo, ['worktree', 'add', '-q', '-b', 'feature/x', wt]);
  put(wt, '.trd-state/live/implement.json', impl('feature/x'));
  put(wt, '.trd-state/live/verification-report.md', 'See ![shot](evidence/a.png)\n');
  put(wt, '.trd-state/live/evidence/a.png', 'PNGDATA');
  return { repo, wt };
}
const run = (cwd, opts = {}) => seed({ cwd, push: false, ...opts });
const reason = (r, slug) => (r.skipped.find((s) => s.slug === slug) || {}).reason;

afterEach(() => {
  for (const c of cleanups.reverse()) c();
  cleanups = [];
});

describe('seed', () => {
  test('seeds the in-flight folder byte for byte under the feature branch, with its image, from main', () => {
    const { repo, wt } = scene();
    const r = run(repo, { push: false });
    expect(r.ok).toBe(true);
    expect(r.seeded.map((s) => s.slug)).toEqual(['live']);
    expect(r.seeded[0]).toMatchObject({ branch: 'feature/x', ref: REF('live'), push: 'skipped' });
    expect(show(repo, 'live', 'implement.json').equals(fs.readFileSync(path.join(wt, '.trd-state/live/implement.json')))).toBe(true);
    expect(JSON.parse(show(repo, 'live', 'record.json')).branch).toBe('feature/x');
    expect(show(repo, 'live', 'evidence/a.png').toString()).toBe('PNGDATA');
    expect(reason(r, 'legacy')).toBe('branch-mismatch');
    expect(hasRef(repo, 'legacy')).toBe(false);
  });

  test("stamps the folder's own forge_feature_id, never the env's", () => {
    const { repo, wt } = scene();
    put(wt, '.trd-state/live/shipped.json', JSON.stringify({ startedAt: 'T1', status: 'running', work: { branch: 'feature/x', forge_feature_id: 'own-id' } }));
    const prev = process.env.FORGE_FEATURE_ID;
    process.env.FORGE_FEATURE_ID = 'other';
    try {
      expect(run(repo).seeded).toHaveLength(1);
    } finally {
      if (prev === undefined) delete process.env.FORGE_FEATURE_ID;
      else process.env.FORGE_FEATURE_ID = prev;
    }
    expect(JSON.parse(show(repo, 'live', 'record.json')).forge_feature_id).toBe('own-id');
  });

  test('without a folder feature id the env id is not stamped either', () => {
    const { repo } = scene();
    const prev = process.env.FORGE_FEATURE_ID;
    process.env.FORGE_FEATURE_ID = 'other';
    try {
      run(repo);
    } finally {
      if (prev === undefined) delete process.env.FORGE_FEATURE_ID;
      else process.env.FORGE_FEATURE_ID = prev;
    }
    expect(JSON.parse(show(repo, 'live', 'record.json')).forge_feature_id || null).toBeNull();
  });

  test('a closed folder is finished and gets no ref', () => {
    const { repo, wt } = scene();
    put(wt, '.trd-state/live/closed.json', '{}\n');
    const r = run(repo);
    expect(r.seeded).toEqual([]);
    expect(reason(r, 'live')).toBe('finished');
    expect(hasRef(repo, 'live')).toBe(false);
  });

  test('a folder with no recorded branch is skipped no-branch', () => {
    const { repo, wt } = scene();
    put(wt, '.trd-state/live/implement.json', '{"version":1}\n');
    expect(reason(run(repo), 'live')).toBe('no-branch');
  });

  test('a recorded branch that is not the worktree branch is branch-mismatch', () => {
    const { repo, wt } = scene();
    put(wt, '.trd-state/live/implement.json', impl('feature/other'));
    const r = run(repo);
    expect(reason(r, 'live')).toBe('branch-mismatch');
    expect(hasRef(repo, 'live')).toBe(false);
  });

  describe('closed feature with a ship run', () => {
    const ship = (wt, status, extra = {}) =>
      put(wt, '.trd-state/live/shipped.json', JSON.stringify({ startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z', status, work: { branch: 'feature/x' }, ...extra }));
    test.each(['running', 'waiting', 'stuck'])('status %s counts as unfinished and is seeded', (status) => {
      const { repo, wt } = scene();
      put(wt, '.trd-state/live/closed.json', '{}\n');
      ship(wt, status);
      expect(run(repo).seeded.map((s) => s.slug)).toEqual(['live']);
    });
    test('status done is finished', () => {
      const { repo, wt } = scene();
      put(wt, '.trd-state/live/closed.json', '{}\n');
      ship(wt, 'done');
      expect(reason(run(repo), 'live')).toBe('finished');
    });
    test('a tracked running copy behind a later done copy on the ref is finished', () => {
      const { repo, wt } = scene();
      put(wt, '.trd-state/live/closed.json', '{}\n');
      ship(wt, 'running');
      // The post-merge writer puts the later `done` copy straight onto a ref of this feature.
      const doneCopy = { startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', status: 'done', detached: true, work: { branch: 'feature/x' } };
      const recordRef = require('./record-ref');
      const w = recordRef.writeFiles({ slug: 'live', cwd: repo, push: false, files: [{ rel: 'shipped.json', content: JSON.stringify(doneCopy) }], identity: { branch: 'feature/x', forge_feature_id: null }, command: 't', step: 't' });
      expect(w.ok).toBe(true);
      const r = run(repo);
      expect(reason(r, 'live')).toBe('finished');
    });
  });

  test('an existing ref is skipped ref-exists and its tip is unchanged', () => {
    const { repo } = scene();
    expect(run(repo).seeded).toHaveLength(1);
    const tip = sh(repo, ['rev-parse', REF('live')]);
    const r = run(repo);
    expect(r.seeded).toEqual([]);
    expect(reason(r, 'live')).toBe('ref-exists');
    expect(sh(repo, ['rev-parse', REF('live')])).toBe(tip);
  });

  test('a ref that exists only on origin is ref-exists', () => {
    const { repo } = scene();
    const bare = mkTmp('bare');
    sh(bare, ['init', '-q', '--bare', '-b', 'main']);
    sh(repo, ['remote', 'add', 'origin', bare]);
    sh(repo, ['push', '-q', 'origin', `HEAD:${REF('live')}`]);
    expect(reason(seed({ cwd: repo, push: false }), 'live')).toBe('ref-exists');
    expect(hasRef(repo, 'live')).toBe(false);
  });

  test('an unreachable origin gives remote-unknown and no ref', () => {
    const { repo } = scene();
    sh(repo, ['remote', 'add', 'origin', path.join(os.tmpdir(), 'rc-does-not-exist-origin')]);
    const r = seed({ cwd: repo, push: false });
    expect(r.remoteError).toBeTruthy();
    expect(reason(r, 'live')).toBe('remote-unknown');
    expect(hasRef(repo, 'live')).toBe(false);
  });

  test('with a reachable origin the seed pushes the ref', () => {
    const { repo } = scene();
    const bare = mkTmp('bare');
    sh(bare, ['init', '-q', '--bare', '-b', 'main']);
    sh(repo, ['remote', 'add', 'origin', bare]);
    const r = seed({ cwd: repo });
    expect(r.seeded[0].push).toBe('pushed');
    expect(sh(bare, ['rev-parse', REF('live')])).toBe(sh(repo, ['rev-parse', REF('live')]));
  });

  test('a failed push is reported, the ref stays local and the seed does not fail', () => {
    const { repo } = scene();
    const bare = mkTmp('bare');
    sh(bare, ['init', '-q', '--bare', '-b', 'main']);
    sh(repo, ['remote', 'add', 'origin', bare]);
    fs.writeFileSync(path.join(bare, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const r = seed({ cwd: repo });
    expect(r.ok).toBe(true);
    expect(r.seeded[0].push).toBe('failed');
    expect(hasRef(repo, 'live')).toBe(true);
  });

  test('HEAD, index and commit count of every worktree are unchanged', () => {
    const { repo, wt } = scene();
    const before = snapshot([repo, wt]);
    run(repo);
    expect(snapshot([repo, wt])).toEqual(before);
  });

  test('a non-git cwd prints a refusal and exits 0', () => {
    const dir = mkTmp('plain');
    const r = spawnSync('node', [LIB, 'seed', '--no-push'], { cwd: dir, encoding: 'utf8', env: envFor() });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, seeded: [], reason: 'not a git work tree' });
  });

  test('the CLI seeds with --no-push and prints one JSON line', () => {
    const { repo } = scene();
    const r = spawnSync('node', [LIB, 'seed', '--no-push'], { cwd: repo, encoding: 'utf8', env: envFor() });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(r.stdout).seeded[0]).toMatchObject({ slug: 'live', push: 'skipped' });
  });

  test('underscore folders and unsafe slugs are ignored', () => {
    const { repo, wt } = scene();
    put(wt, '.trd-state/_shared/implement.json', impl('feature/x'));
    const r = run(repo);
    expect(r.seeded.map((s) => s.slug)).toEqual(['live']);
    expect(r.skipped.find((s) => s.slug === '_shared')).toBeUndefined();
  });
});
