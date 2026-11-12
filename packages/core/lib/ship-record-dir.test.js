'use strict';

/**
 * Tests for ship-record-dir.js, the shared path rule of /ship-build's post-merge records.
 * Every case runs against real temporary git repositories; git is never mocked.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dirs = require('./ship-record-dir');
const recordRef = require('./record-ref');

const SLUG = 'f';
const REF = `refs/ensemble/records/${SLUG}`;
const T1 = '2026-11-08T10:00:00.000Z';
let cleanups = [];
let savedFeatureId;

function git(cwd, args) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
}

function repo({ origin = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'srd-')));
  cleanups.push(root);
  const top = path.join(root, 'work');
  fs.mkdirSync(top);
  git(top, ['init', '-q', '-b', 'main']);
  git(top, ['config', 'user.email', 't@example.com']);
  git(top, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(top, 'a.txt'), 'a\n');
  git(top, ['add', '.']);
  git(top, ['commit', '-qm', 'init']);
  git(top, ['checkout', '-qb', 'feature/f']);
  let bare = null;
  if (origin) {
    bare = path.join(root, 'origin.git');
    git(root, ['init', '-q', '--bare', bare]);
    git(top, ['remote', 'add', 'origin', bare]);
  }
  const stateDir = path.join(top, '.trd-state', SLUG);
  fs.mkdirSync(stateDir, { recursive: true });
  return { top, stateDir, bare };
}

const run = (over = {}) => ({
  version: 2,
  startedAt: T1,
  updatedAt: '2026-11-08T10:05:00.000Z',
  detached: true,
  work: { kind: 'trd', id: 'f', branch: 'feature/f' },
  cursor: 3,
  ...over,
});

const onRef = (top, file) => git(top, ['show', `${REF}:${file}`]);
const common = (top) => path.resolve(top, git(top, ['rev-parse', '--git-common-dir']).out);

beforeEach(() => {
  savedFeatureId = process.env.FORGE_FEATURE_ID;
  delete process.env.FORGE_FEATURE_ID;
});
afterEach(() => {
  if (savedFeatureId === undefined) delete process.env.FORGE_FEATURE_ID;
  else process.env.FORGE_FEATURE_ID = savedFeatureId;
  for (const d of cleanups) fs.rmSync(d, { recursive: true, force: true });
  cleanups = [];
});

describe('refTarget', () => {
  test('names the ref for <top>/.trd-state/<slug>, even before the folder exists', () => {
    const { top } = repo();
    const t = dirs.refTarget(path.join(top, '.trd-state', 'later'));
    expect(t).toEqual({ top, slug: 'later', ref: 'refs/ensemble/records/later' });
  });
  test('is null outside .trd-state/<slug>, outside git, and for an unsafe slug', () => {
    const { top } = repo();
    expect(dirs.refTarget(path.join(top, 'state'))).toBeNull();
    expect(dirs.refTarget(path.join(top, '.trd-state', 'a', 'b'))).toBeNull();
    expect(dirs.refTarget(path.join(top, '.trd-state', '_shared'))).toBeNull();
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'srd-plain-'));
    cleanups.push(plain);
    expect(dirs.refTarget(path.join(plain, '.trd-state', 'f'))).toBeNull();
  });
});

describe('writeRunRecord', () => {
  test('puts the record on the ref with the run identity, leaves the tree clean, writes no folder', () => {
    const { top, stateDir } = repo();
    process.env.FORGE_FEATURE_ID = 'feat-9';
    git(top, ['checkout', '-q', 'main']); // post-merge: the session is on main, not the run's branch
    const state = run({ work: { kind: 'trd', id: 'f', branch: 'feature/f' } });
    const r = dirs.writeRunRecord(stateDir, state);
    expect(r).toMatchObject({ ok: true, where: 'ref', recordPath: `${REF}:shipped.json`, push: 'no-remote' });
    const stored = JSON.parse(onRef(top, 'shipped.json').out);
    expect(stored).toMatchObject({ detached: true, cursor: 3, recordRef: REF, recordPath: `${REF}:shipped.json` });
    expect(stored.work.forge_feature_id).toBe('feat-9');
    expect(JSON.parse(onRef(top, 'record.json').out)).toMatchObject({ branch: 'feature/f', forge_feature_id: 'feat-9' });
    expect(git(top, ['status', '--porcelain']).out).toBe('');
    expect(fs.existsSync(path.join(common(top), 'ensemble', 'ship'))).toBe(false);
    expect(state.recordRef).toBe(REF);
  });

  test('keeps a forge_feature_id the run already has', () => {
    const { stateDir } = repo();
    process.env.FORGE_FEATURE_ID = 'other';
    const state = run({ work: { kind: 'trd', id: 'f', branch: 'feature/f', forge_feature_id: 'mine' } });
    dirs.writeRunRecord(stateDir, state);
    expect(state.work.forge_feature_id).toBe('mine');
  });

  test('pushes to origin, and push:false commits locally only', () => {
    const { top, stateDir, bare } = repo({ origin: true });
    expect(dirs.writeRunRecord(stateDir, run(), { push: false }).push).toBe('skipped');
    expect(git(bare, ['rev-parse', '--verify', '-q', REF]).ok).toBe(false);
    expect(dirs.writeRunRecord(stateDir, run({ cursor: 4 })).push).toBe('pushed');
    expect(git(bare, ['rev-parse', REF]).out).toBe(git(top, ['rev-parse', REF]).out);
  });

  test('falls back to the detached folder and pointer when the ref is refused', () => {
    const { top, stateDir } = repo();
    // a different feature owns the ref
    expect(dirs.writeRunRecord(stateDir, run({ work: { kind: 'trd', id: 'f', branch: 'feature/other' } })).where).toBe('ref');
    const before = git(top, ['rev-parse', REF]).out;
    const state = run();
    const r = dirs.writeRunRecord(stateDir, state);
    expect(r.where).toBe('folder');
    expect(r.refError).toMatch(/another feature/);
    expect(git(top, ['rev-parse', REF]).out).toBe(before);
    const file = path.join(common(top), 'ensemble', 'ship', SLUG, '2026-11-08T10-00-00-000Z.json');
    expect(r.recordPath).toBe(file);
    expect(state.recordPath).toBe(file);
    expect(state.recordRef).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).detached).toBe(true);
    expect(dirs.readPointer(stateDir).startedAt).toBe(T1);
  });

  test('a state dir outside .trd-state/<slug> uses the folder', () => {
    const { top } = repo();
    const odd = path.join(top, 'state');
    fs.mkdirSync(odd);
    const r = dirs.writeRunRecord(odd, run());
    expect(r.where).toBe('folder');
    expect(git(top, ['rev-parse', '--verify', '-q', 'refs/ensemble/records/state']).ok).toBe(false);
  });

  test('outside git it reports where:none and never throws', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'srd-plain-'));
    cleanups.push(plain);
    expect(dirs.writeRunRecord(path.join(plain, 'state'), run())).toMatchObject({ ok: false, where: 'none' });
  });

  test('keeps other files already on the ref', () => {
    const { top, stateDir } = repo();
    dirs.writeRunRecord(stateDir, run());
    const state = run({ cursor: 5 });
    dirs.writeRunRecord(stateDir, state);
    expect(JSON.parse(onRef(top, 'shipped.json').out).cursor).toBe(5);
    dirs.writeCustody(stateDir, { anchor: { commit: 'abc' } });
    dirs.writeRunRecord(stateDir, run({ cursor: 6 }));
    expect(JSON.parse(onRef(top, 'custody.json').out).anchor.commit).toBe('abc');
  });
});

describe('refRun', () => {
  test('returns the ref copy of the tracked run; null for another run, an undetached record or another identity', () => {
    const { top, stateDir } = repo();
    expect(dirs.refRun(stateDir)).toBeNull(); // no ref
    dirs.writeRunRecord(stateDir, run());
    fs.writeFileSync(path.join(stateDir, 'shipped.json'), JSON.stringify(run({ detached: false, cursor: 1 })));
    expect(dirs.refRun(stateDir)).toMatchObject({ ref: REF, state: { cursor: 3 } });
    fs.writeFileSync(path.join(stateDir, 'shipped.json'), JSON.stringify(run({ startedAt: '2026-11-09T00:00:00.000Z' })));
    expect(dirs.refRun(stateDir)).toBeNull();
    expect(dirs.refRun(stateDir, { startedAt: T1 })).not.toBeNull(); // explicit run wins over tracked
    fs.rmSync(path.join(stateDir, 'shipped.json'));
    expect(dirs.refRun(stateDir)).not.toBeNull();
    // identity: the ref's record.json says feature/f but the record's own work names another branch
    const spoof = run({ work: { kind: 'trd', id: 'f', branch: 'feature/zzz' } });
    const w = recordRef.writeFiles({ cwd: top, slug: SLUG, files: [{ rel: 'shipped.json', content: JSON.stringify(spoof) }], identity: { branch: 'feature/f' }, command: 'x', step: 'y' });
    expect(w.ok).toBe(true);
    expect(dirs.refRun(stateDir)).toBeNull();
  });

  test('rejects an undetached record on the ref', () => {
    const { stateDir } = repo();
    dirs.writeRunRecord(stateDir, run({ detached: false }));
    expect(dirs.refRun(stateDir)).toBeNull();
  });

  test('a state dir outside .trd-state/<slug> is never ref-held', () => {
    const { top } = repo();
    expect(dirs.refRun(path.join(top, 'state'))).toBeNull();
  });
});

describe('resolveRun', () => {
  const folderWrite = (stateDir, s) => {
    const dir = dirs.recordDir(stateDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${dirs.safeName(s.startedAt)}.json`), JSON.stringify(s));
    dirs.writePointer(stateDir, { startedAt: s.startedAt, work: s.work });
  };

  test('with no tracked file, finds the ref run (no pointer needed)', () => {
    const { stateDir } = repo();
    dirs.writeRunRecord(stateDir, run());
    expect(dirs.resolveRun(stateDir, null)).toMatchObject({ source: 'ref', state: { cursor: 3 } });
  });

  test('with no tracked file and no ref, follows the pointer to a legacy folder run', () => {
    const { stateDir } = repo();
    folderWrite(stateDir, run({ cursor: 2 }));
    expect(dirs.resolveRun(stateDir, null)).toMatchObject({ source: 'folder', state: { cursor: 2 } });
  });

  test('the later updatedAt wins between ref and folder, whichever place holds it', () => {
    const { stateDir } = repo();
    dirs.writeRunRecord(stateDir, run({ cursor: 3, updatedAt: '2026-11-08T10:05:00.000Z' }));
    folderWrite(stateDir, run({ cursor: 4, updatedAt: '2026-11-08T10:09:00.000Z' }));
    expect(dirs.resolveRun(stateDir, null)).toMatchObject({ source: 'folder', state: { cursor: 4 } });
    dirs.writeRunRecord(stateDir, run({ cursor: 5, updatedAt: '2026-11-08T10:20:00.000Z' }));
    expect(dirs.resolveRun(stateDir, null)).toMatchObject({ source: 'ref', state: { cursor: 5 } });
  });

  test('a tracked pre-merge copy loses to the detached copy of the same run, and wins when newer', () => {
    const { stateDir } = repo();
    const tracked = run({ detached: false, cursor: 1, updatedAt: '2026-11-08T09:00:00.000Z' });
    dirs.writeRunRecord(stateDir, run());
    expect(dirs.resolveRun(stateDir, tracked)).toMatchObject({ source: 'ref', state: { cursor: 3 } });
    expect(dirs.resolveRun(stateDir, { ...tracked, updatedAt: '2026-11-08T11:00:00.000Z' }).source).toBe('tracked');
  });

  test('a ref copy of a different run than the tracked one is not a candidate', () => {
    const { stateDir } = repo();
    dirs.writeRunRecord(stateDir, run({ startedAt: '2026-11-01T00:00:00.000Z' }));
    const tracked = run({ detached: false, cursor: 1 });
    expect(dirs.resolveRun(stateDir, tracked).source).toBe('tracked');
  });

  test('null when nothing holds a run', () => {
    const { stateDir } = repo();
    expect(dirs.resolveRun(stateDir, null)).toBeNull();
  });
});

describe('custody', () => {
  const anchor = (commit) => ({ anchor: { commit }, history: [] });

  test('a state dir outside .trd-state/<slug> keeps the tracked file', () => {
    const { top } = repo();
    const odd = path.join(top, 'state');
    fs.mkdirSync(odd);
    expect(dirs.custodyPath(odd)).toBe(path.join(odd, 'custody.json'));
    expect(dirs.writeCustody(odd, anchor('aaa')).where).toBe('file');
    expect(dirs.readCustody(odd).anchor.commit).toBe('aaa');
  });

  test('before the run is detached the anchor is the tracked file', () => {
    const { stateDir } = repo();
    fs.writeFileSync(path.join(stateDir, 'shipped.json'), JSON.stringify(run({ detached: false })));
    expect(dirs.custodyPath(stateDir)).toBe(path.join(stateDir, 'custody.json'));
    dirs.writeCustody(stateDir, anchor('t1'));
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, 'custody.json'), 'utf8')).anchor.commit).toBe('t1');
  });

  test('for a ref-held run the anchor is written to the ref, stamped, and read from it over the tracked file', () => {
    const { top, stateDir } = repo();
    fs.writeFileSync(path.join(stateDir, 'custody.json'), JSON.stringify(anchor('tracked')));
    fs.writeFileSync(path.join(stateDir, 'shipped.json'), JSON.stringify(run({ detached: false })));
    dirs.writeRunRecord(stateDir, run());
    expect(dirs.readCustody(stateDir).anchor.commit).toBe('tracked'); // nothing on the ref yet
    expect(dirs.custodyPath(stateDir)).toBe(`${REF}:custody.json`); // where the next anchor will land
    expect(dirs.writeCustody(stateDir, anchor('onref'))).toMatchObject({ ok: true, where: 'ref', path: `${REF}:custody.json` });
    expect(JSON.parse(onRef(top, 'custody.json').out)).toMatchObject({ startedAt: T1, anchor: { commit: 'onref' } });
    expect(dirs.readCustody(stateDir).anchor.commit).toBe('onref');
    expect(dirs.custodyPath(stateDir)).toBe(`${REF}:custody.json`);
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, 'custody.json'), 'utf8')).anchor.commit).toBe('tracked');
    expect(JSON.parse(onRef(top, 'shipped.json').out).cursor).toBe(3); // the run record is kept
  });

  test('works with no tracked files at all (a re-created worktree), found through the ref', () => {
    const { stateDir } = repo();
    dirs.writeRunRecord(stateDir, run());
    dirs.writeCustody(stateDir, anchor('x'));
    expect(dirs.readCustody(stateDir).anchor.commit).toBe('x');
  });

  test('ignores a ref anchor stamped with another run', () => {
    const { stateDir } = repo();
    dirs.writeRunRecord(stateDir, run({ startedAt: '2026-11-01T00:00:00.000Z' }));
    dirs.writeCustody(stateDir, anchor('old'));
    fs.writeFileSync(path.join(stateDir, 'shipped.json'), JSON.stringify(run({ detached: false })));
    fs.writeFileSync(path.join(stateDir, 'custody.json'), JSON.stringify(anchor('tracked')));
    expect(dirs.readCustody(stateDir).anchor.commit).toBe('tracked');
  });

  test('a legacy folder run still reads and writes its detached custody file', () => {
    const { top, stateDir } = repo();
    fs.writeFileSync(path.join(stateDir, 'shipped.json'), JSON.stringify(run({ detached: false })));
    fs.writeFileSync(path.join(stateDir, 'custody.json'), JSON.stringify(anchor('tracked')));
    const dir = dirs.recordDir(stateDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '2026-11-08T10-00-00-000Z.json'), JSON.stringify(run()));
    expect(dirs.custodyPath(stateDir)).toBe(path.join(dir, '2026-11-08T10-00-00-000Z.custody.json')); // run exists, no anchor yet
    dirs.writeCustody(stateDir, anchor('legacy'));
    expect(dirs.readCustody(stateDir).anchor.commit).toBe('legacy');
    expect(dirs.custodyPath(stateDir)).toBe(path.join(dir, '2026-11-08T10-00-00-000Z.custody.json'));
    expect(git(top, ['rev-parse', '--verify', '-q', REF]).ok).toBe(false);
  });

  test('a failed ref write lands the anchor in the detached folder', () => {
    const { top, stateDir } = repo();
    dirs.writeRunRecord(stateDir, run());
    // A stale lock on the ref makes every compare-and-swap fail, while reads still work.
    fs.writeFileSync(path.join(common(top), `${REF}.lock`), '');
    const r = dirs.writeCustody(stateDir, anchor('fallback'));
    fs.rmSync(path.join(common(top), `${REF}.lock`));
    const file = path.join(dirs.recordDir(stateDir), '2026-11-08T10-00-00-000Z.custody.json');
    expect(r).toMatchObject({ ok: true, where: 'file', path: file });
    expect(r.refError).toBeTruthy();
    expect(onRef(top, 'custody.json').ok).toBe(false);
    expect(dirs.readCustody(stateDir).anchor.commit).toBe('fallback');
  });

  test('never throws on an unreadable state dir', () => {
    expect(dirs.readCustody('/nonexistent/x/.trd-state/f')).toBeNull();
    expect(typeof dirs.custodyPath('/nonexistent/x/.trd-state/f')).toBe('string');
  });
});
