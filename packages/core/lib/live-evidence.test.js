'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { record, read, manifestPath, main, MAX_LINE_BYTES, COVERS_HASH_BYTES } = require('./live-evidence');

let dir; let state; let artifact; let src;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live-ev-')));
  state = path.join(dir, 'state');
  artifact = path.join(dir, 'shot.png');
  src = path.join(dir, 'a.js');
  fs.writeFileSync(artifact, 'png');
  fs.writeFileSync(src, 'one');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const entry = (o = {}) => ({ task: 'LIVE-1', artifact, shows: 'login ok', environment: 'local', covers: [src], ...o });

describe('record', () => {
  test('appends one line under the cap, with absolute paths, hashes and the injected clock', () => {
    expect(record(state, entry(), '2026-01-01T00:00:00.000Z')).toBe(true);
    const text = fs.readFileSync(manifestPath(state), 'utf8');
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(Buffer.byteLength(text)).toBeLessThan(MAX_LINE_BYTES);
    const row = JSON.parse(text);
    expect(row.ts).toBe('2026-01-01T00:00:00.000Z');
    expect(row.covers).toEqual([{ path: src, sha256: sha('one') }, { path: artifact, sha256: sha('png') }]);
    expect(path.isAbsolute(row.covers[0].path)).toBe(true);
  });

  test('the artifact itself is covered, so a later different capture at the same path reads as changed', () => {
    record(state, entry());
    const own = read(state)[0].covers.find((c) => c.path === artifact);
    expect(own).toEqual({ path: artifact, sha256: sha('png') });
  });

  test('a relative artifact path is stored absolute', () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try { expect(record(state, entry({ artifact: 'shot.png' }))).toBe(true); } finally { process.chdir(cwd); }
    expect(read(state)[0].artifact).toBe(artifact);
  });

  test('a covered file over COVERS_HASH_BYTES is rejected, not recorded as never-reusable', () => {
    const big = path.join(dir, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(COVERS_HASH_BYTES + 1));
    expect(record(state, entry({ covers: [big] }))).toBe(false);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
  });

  test('a relative covered path is stored absolute', () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try { expect(record(state, entry({ covers: ['a.js'] }))).toBe(true); } finally { process.chdir(cwd); }
    expect(read(state)[0].covers[0].path).toBe(src);
  });

  test('a symlink records its target, so retargeting it changes the hash', () => {
    const link = path.join(dir, 'link.js');
    fs.symlinkSync(src, link);
    record(state, entry({ covers: [link] }));
    expect(read(state)[0].covers[0]).toEqual({ path: src, sha256: sha('one') });
  });

  test.each([
    ['no artifact', { artifact: undefined }],
    ['artifact that does not exist', { artifact: '/nope/x.png' }],
    ['artifact that is a directory', { artifact: '__DIR__' }],
    ['empty covers', { covers: [] }],
    ['covers not an array', { covers: 'a.js' }],
    ['a missing covered path', { covers: ['/nope/missing.js'] }],
    ['a covered directory', { covers: ['__DIR__'] }],
    ['no task', { task: '' }],
  ])('rejects %s and writes nothing', (_n, over) => {
    for (const k of Object.keys(over)) if (over[k] === '__DIR__') over[k] = k === 'covers' ? [dir] : dir;
    expect(record(state, entry(over))).toBe(false);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
  });

  test('a line that would exceed the cap is rejected whole, never truncated', () => {
    const many = [];
    for (let i = 0; i < 40; i++) {
      const f = path.join(dir, `f-${'x'.repeat(40)}-${i}.js`);
      fs.writeFileSync(f, String(i));
      many.push(f);
    }
    expect(record(state, entry({ covers: many }))).toBe(false);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
  });
});

describe('read', () => {
  test('[] when the manifest is absent', () => {
    expect(read(state)).toEqual([]);
  });

  test('skips malformed lines and rows without artifact/covers', () => {
    record(state, entry());
    fs.appendFileSync(
      manifestPath(state),
      'not json\n{"artifact":"x"}\n{"covers":[]}\n{"artifact":"y","covers":[]}\n{"artifact":"","covers":[{"path":"/a","sha256":"b"}]}\n\n'
    );
    expect(read(state)).toHaveLength(1);
  });

  test('last entry for a repeated artifact wins', () => {
    record(state, entry({ shows: 'first' }));
    fs.writeFileSync(src, 'two');
    record(state, entry({ shows: 'second' }));
    const rows = read(state);
    expect(rows).toHaveLength(1);
    expect(rows[0].shows).toBe('second');
    expect(rows[0].covers[0].sha256).toBe(sha('two'));
  });
});

describe('CLI', () => {
  const run = (...args) => spawnSync('node', [path.join(__dirname, 'live-evidence.js'), ...args], { encoding: 'utf8' });

  test('record then read round-trips', () => {
    const r = run('record', '--state-dir', state, '--task', 'LIVE-1', '--artifact', artifact,
      '--covers', src, '--shows', 'login ok', '--environment', 'local');
    expect(r.status).toBe(0);
    const out = JSON.parse(run('read', '--state-dir', state).stdout);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ task: 'LIVE-1', artifact, shows: 'login ok', environment: 'local' });
    expect(out[0].covers[0].sha256).toBe(sha('one'));
  });

  test('read of an absent manifest prints []', () => {
    expect(run('read', '--state-dir', state).stdout.trim()).toBe('[]');
  });

  test('a rejected record exits 1 and writes nothing; bad usage exits 2', () => {
    const r = run('record', '--state-dir', state, '--task', 'T', '--artifact', artifact, '--covers', '/nope');
    expect(r.status).toBe(1);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
    expect(run('bogus', '--state-dir', state).status).toBe(2);
    expect(run('read').status).toBe(2);
  });

  test('a line over the cap is rejected with a stderr reason naming the cap, not a missing flag', () => {
    const many = [];
    for (let i = 0; i < 40; i++) {
      const f = path.join(dir, `f-${'x'.repeat(40)}-${i}.js`);
      fs.writeFileSync(f, String(i));
      many.push(f);
    }
    const r = run('record', '--state-dir', state, '--task', 'T', '--artifact', artifact, '--covers', many.join(','));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/line cap/);
    expect(r.stderr).not.toMatch(/need --task/);
  });

  test('main is callable in-process', () => {
    const chunks = [];
    expect(main(['read', '--state-dir', state], { write: (s) => chunks.push(s) })).toBe(0);
    expect(chunks.join('')).toBe('[]\n');
  });
});
