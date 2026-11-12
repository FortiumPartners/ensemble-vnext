'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const artifacts = require('./artifacts');

const CLI = path.join(__dirname, 'artifacts.js');
const NOW = () => new Date('2026-10-17T10:00:00.000Z');

let root;
let stateDir;
const manifest = () => path.join(stateDir, 'artifacts.json');
const raw = () => fs.readFileSync(manifest(), 'utf8');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-'));
  stateDir = path.join(root, '.trd-state', 'feat');
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const rec = (kind, entry, opts) =>
  artifacts.record(stateDir, kind, { command: '/create-prd', ...entry }, { root, now: NOW, ...opts });

describe('KINDS', () => {
  it('lists the eleven document kinds', () => {
    expect(artifacts.KINDS).toEqual([
      'prd', 'trd', 'audit-prd', 'audit-trd', 'success-definition',
      'verification-plan', 'verification-report', 'audit-build', 'report',
      'design', 'audit-design',
    ]);
  });

  it('round-trips kind report through record and get', () => {
    rec('report', { path: 'docs/a.md', url: 'https://x/report', command: '/task' });
    expect(artifacts.get(stateDir, 'report')).toBe('https://x/report');
    expect(artifacts.read(stateDir).report).toEqual(expect.objectContaining({
      path: 'docs/a.md', command: '/task',
    }));
  });

  it.each(artifacts.KINDS)('records %s with a path and version 2', (kind) => {
    rec(kind, { path: 'docs/a.md', url: 'https://x/' + kind });
    const data = JSON.parse(raw());
    expect(data.version).toBe(2);
    expect(Object.keys(data)[0]).toBe('version');
    expect(data[kind]).toEqual({
      path: 'docs/a.md', url: 'https://x/' + kind,
      updated_at: '2026-10-17T10:00:00.000Z', command: '/create-prd',
    });
    expect(raw().endsWith('}\n')).toBe(true);
  });
});

describe('read', () => {
  it('returns {version: 2} when the file is absent', () => {
    expect(artifacts.read(stateDir)).toEqual({ version: 2 });
  });

  it('reads a URL-only file as {url} entries', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(manifest(), JSON.stringify({ prd: 'https://p', trd: 'https://t' }));
    expect(artifacts.read(stateDir)).toEqual({
      version: 2,
      prd: { path: null, url: 'https://p', updated_at: null, command: null },
      trd: { path: null, url: 'https://t', updated_at: null, command: null },
    });
  });

  it('reads audit-build-report as audit-build, and audit-build wins when both exist', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(manifest(), JSON.stringify({ 'audit-build-report': 'https://old' }));
    expect(artifacts.read(stateDir)['audit-build'].url).toBe('https://old');
    expect(artifacts.read(stateDir)['audit-build-report']).toBeUndefined();
    fs.writeFileSync(manifest(), JSON.stringify({ 'audit-build-report': 'https://old', 'audit-build': 'https://new' }));
    expect(artifacts.read(stateDir)['audit-build'].url).toBe('https://new');
  });

  it('throws on malformed JSON rather than overwriting it', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(manifest(), '{nope');
    expect(() => artifacts.read(stateDir)).toThrow();
    expect(() => rec('prd', { path: 'docs/a.md' })).toThrow();
    expect(raw()).toBe('{nope');
  });
});

describe('record', () => {
  it('rewrites a URL-only file as version 2, keeping every other URL', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(manifest(), JSON.stringify({ prd: 'https://p', 'audit-build-report': 'https://ab' }));
    rec('trd', { path: 'docs/a.md', url: 'https://t' });
    const data = JSON.parse(raw());
    expect(data.version).toBe(2);
    expect(data.prd.url).toBe('https://p');
    expect(data['audit-build'].url).toBe('https://ab');
    expect(data['audit-build-report']).toBeUndefined();
    expect(data.trd.url).toBe('https://t');
  });

  it('stores url "" for a new kind with no URL, and keeps an existing URL', () => {
    rec('prd', { path: 'docs/a.md' });
    expect(JSON.parse(raw()).prd.url).toBe('');
    rec('prd', { path: 'docs/a.md', url: 'https://p' });
    rec('prd', { path: 'docs/a.md' }, { now: () => new Date('2027-01-01T00:00:00Z') });
    expect(JSON.parse(raw()).prd.url).toBe('https://p');
  });

  it('clears a URL when url is explicitly ""', () => {
    rec('prd', { path: 'docs/a.md', url: 'https://p' });
    rec('prd', { path: 'docs/a.md', url: '' });
    expect(JSON.parse(raw()).prd.url).toBe('');
  });

  it('leaves the bytes unchanged on a repeated identical record', () => {
    rec('prd', { path: 'docs/a.md', url: 'https://p' });
    const before = raw();
    const mtime = fs.statSync(manifest()).mtimeMs;
    rec('prd', { path: 'docs/a.md', url: 'https://p' }, { now: () => new Date('2027-01-01T00:00:00Z') });
    expect(raw()).toBe(before);
    expect(fs.statSync(manifest()).mtimeMs).toBe(mtime);
  });

  it('bumps updated_at when something changed', () => {
    rec('prd', { path: 'docs/a.md', url: 'https://p' });
    rec('prd', { path: 'docs/a.md', url: 'https://q' }, { now: () => new Date('2027-01-01T00:00:00.000Z') });
    expect(JSON.parse(raw()).prd.updated_at).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rewrites an old-format file even when the entry is unchanged', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(manifest(), JSON.stringify({ other: 'https://o' }));
    rec('prd', { path: 'docs/a.md' });
    rec('prd', { path: 'docs/a.md' });
    expect(JSON.parse(raw()).version).toBe(2);
    // an old file whose recorded entry already matches is still upgraded
    fs.writeFileSync(manifest(), JSON.stringify({
      prd: { path: 'docs/a.md', url: '', updated_at: '2026-10-17T10:00:00.000Z', command: '/create-prd' },
    }));
    rec('prd', { path: 'docs/a.md' });
    expect(JSON.parse(raw()).version).toBe(2);
  });

  it('creates the state dir when missing', () => {
    expect(fs.existsSync(stateDir)).toBe(false);
    rec('prd', { path: 'docs/a.md' });
    expect(fs.existsSync(manifest())).toBe(true);
  });

  it('leaves no temp files behind', () => {
    rec('prd', { path: 'docs/a.md' });
    expect(fs.readdirSync(stateDir)).toEqual(['artifacts.json']);
  });

  describe('rejections leave the manifest unchanged', () => {
    beforeEach(() => rec('prd', { path: 'docs/a.md', url: 'https://p' }));
    const cases = [
      ['a missing file', 'prd', { path: 'docs/missing.md' }],
      ['a directory', 'prd', { path: 'docs' }],
      ['an absolute path', 'prd', { path: '/etc/hosts' }],
      ['a ../ escape', 'prd', { path: '../outside.md' }],
      ['the kind version', 'version', { path: 'docs/a.md' }],
      ['an upper-case kind', 'PRD', { path: 'docs/a.md' }],
      ['a kind with a slash', 'a/b', { path: 'docs/a.md' }],
      ['an empty kind', '', { path: 'docs/a.md' }],
      ['an empty command', 'prd', { path: 'docs/a.md', command: '' }],
      ['an empty path', 'prd', { path: '' }],
    ];
    it.each(cases)('%s', (_n, kind, entry) => {
      const before = raw();
      expect(() => rec(kind, entry)).toThrow();
      expect(raw()).toBe(before);
    });
  });

  it('accepts a check-skill slug kind', () => {
    rec('check-security', { path: 'docs/a.md' });
    expect(JSON.parse(raw())['check-security']).toBeDefined();
  });
});

describe('get', () => {
  it('returns the URL, or "" when absent or cleared', () => {
    expect(artifacts.get(stateDir, 'prd')).toBe('');
    rec('prd', { path: 'docs/a.md' });
    expect(artifacts.get(stateDir, 'prd')).toBe('');
    rec('prd', { path: 'docs/a.md', url: 'https://p' });
    expect(artifacts.get(stateDir, 'prd')).toBe('https://p');
  });
});

describe('CLI', () => {
  const run = (...args) =>
    spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf8' });

  it('record then get prints only the URL and a newline', () => {
    const r = run('record', '--state-dir', stateDir, '--kind', 'prd', '--path', 'docs/a.md',
      '--command', '/create-prd', '--url', 'https://p');
    expect(r.status).toBe(0);
    const g = run('get', '--state-dir', stateDir, '--kind', 'prd');
    expect(g.status).toBe(0);
    expect(g.stdout).toBe('https://p\n');
  });

  it('get prints nothing and exits 0 when absent or url ""', () => {
    let g = run('get', '--state-dir', stateDir, '--kind', 'prd');
    expect(g.status).toBe(0);
    expect(g.stdout).toBe('');
    run('record', '--state-dir', stateDir, '--kind', 'prd', '--path', 'docs/a.md', '--command', '/c');
    g = run('get', '--state-dir', stateDir, '--kind', 'prd');
    expect(g.status).toBe(0);
    expect(g.stdout).toBe('');
  });

  it('read prints the normalised JSON', () => {
    expect(JSON.parse(run('read', '--state-dir', stateDir).stdout)).toEqual({ version: 2 });
    run('record', '--state-dir', stateDir, '--kind', 'trd', '--path', 'docs/a.md', '--command', '/c', '--url', 'u');
    expect(JSON.parse(run('read', '--state-dir', stateDir).stdout).trd.url).toBe('u');
  });

  it('record exits 1 with a stderr message on rejection', () => {
    const r = run('record', '--state-dir', stateDir, '--kind', 'version', '--path', 'docs/a.md', '--command', '/c');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/\S/);
    const r2 = run('record', '--state-dir', stateDir, '--kind', 'prd', '--path', '../x', '--command', '/c');
    expect(r2.status).toBe(1);
  });

  it('exits 1 on a missing --state-dir or unknown verb', () => {
    expect(run('read').status).toBe(1);
    expect(run('bogus', '--state-dir', stateDir).status).toBe(1);
  });
});

describe('record: path normalisation and prototype-named kinds', () => {
  it('stores ./ and ../ forms of a path as the one normalised path', () => {
    rec('prd', { path: './docs/a.md' });
    expect(JSON.parse(raw()).prd.path).toBe('docs/a.md');
    const before = raw();
    rec('prd', { path: 'docs/../docs/a.md' });
    expect(raw()).toBe(before);
  });

  it('treats a kind named like an Object.prototype member as a new kind', () => {
    rec('constructor', { path: 'docs/a.md', url: 'https://c' });
    expect(JSON.parse(raw()).constructor).toEqual({
      path: 'docs/a.md', url: 'https://c', updated_at: '2026-10-17T10:00:00.000Z', command: '/create-prd',
    });
    expect(artifacts.get(stateDir, 'constructor')).toBe('https://c');
    expect(artifacts.get(stateDir, 'tostring')).toBe('');
  });
});

describe('records-ref fallback', () => {
  const recordRef = require('./record-ref');
  const STATE = '.trd-state/feat';
  const git = (cwd, args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  };
  let repo;
  let savedCwd;
  let savedId;
  beforeEach(() => {
    savedCwd = process.cwd();
    savedId = process.env.FORGE_FEATURE_ID;
    delete process.env.FORGE_FEATURE_ID;
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-ref-')));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.name', 'T']);
    git(repo, ['config', 'user.email', 't@example.com']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-q', '-m', 'init']);
    process.chdir(repo);
  });
  afterEach(() => {
    process.chdir(savedCwd);
    if (savedId === undefined) delete process.env.FORGE_FEATURE_ID;
    else process.env.FORGE_FEATURE_ID = savedId;
    fs.rmSync(repo, { recursive: true, force: true });
  });
  const entry = (url) => ({ command: '/create-prd', url, path: 'docs/a.md' });

  it('(a) folder deleted, ref holds trd and prd: get reads the ref; record keeps prd and updates trd', () => {
    fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'a.md'), '# a\n');
    artifacts.record(STATE, 'prd', entry('https://x/prd'), { root: repo, now: NOW });
    artifacts.record(STATE, 'trd', entry('https://x/trd-old'), { root: repo, now: NOW });
    expect(recordRef.write({ stateDir: STATE, command: 'c', step: 's', cwd: repo, push: false }).ok).toBe(true);
    fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });

    expect(artifacts.get(STATE, 'trd')).toBe('https://x/trd-old');
    fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });
    artifacts.record(STATE, 'trd', entry('https://x/trd-new'), { root: repo, now: NOW });
    const m = JSON.parse(fs.readFileSync(path.join(repo, STATE, 'artifacts.json'), 'utf8'));
    expect(m.prd.url).toBe('https://x/prd');
    expect(m.trd.url).toBe('https://x/trd-new');
  });

  it('(b) no ref: get is empty and record creates a one-entry manifest', () => {
    fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'a.md'), '# a\n');
    expect(artifacts.get(STATE, 'trd')).toBe('');
    artifacts.record(STATE, 'trd', entry('https://x/t'), { root: repo, now: NOW });
    const m = JSON.parse(fs.readFileSync(path.join(repo, STATE, 'artifacts.json'), 'utf8'));
    expect(Object.keys(m).filter((k) => k !== 'version')).toEqual(['trd']);
  });
});
