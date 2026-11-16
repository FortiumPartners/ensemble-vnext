'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const rs = require('./rerun-scope');

const LIB = path.join(__dirname, 'rerun-scope.js');

describe('classify', () => {
  test.each([
    ['.trd-state/f/implement.json', 'record'],
    ['docs/TRD/x.md', 'doc'],
    ['README.md', 'doc'],
    ['.claude/rules/autonomy.md', 'framework'],
    ['src/a.test.js', 'test'],
    ['.github/workflows/ci.yml', 'ci'],
    ['package-lock.json', 'deps'],
    ['src/layout/Phone.tsx', 'code'],
  ])('%s is %s', (p, c) => expect(rs.classify(p, null)).toBe(c));

  test('the TRD itself is a doc', () => expect(rs.classify('docs/TRD/x.md', 'docs/TRD/x.md')).toBe('doc'));
});

describe('changed', () => {
  let dir;
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  const commit = (file, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', file);
    return git('rev-parse', 'HEAD').stdout.trim();
  };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rerun-scope-'));
    git('init', '-q');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('lists changed files with classes and counts since the anchor', () => {
    const anchor = commit('src/a.js', '1');
    commit('docs/x.md', '1');
    commit('.trd-state/f/r.json', '{}');
    commit('src/b.js', '1');
    const r = rs.changed({ anchor, cwd: dir });
    expect(r.readable).toBe(true);
    expect(r.counts).toMatchObject({ doc: 1, record: 1, code: 1 });
    expect(r.files.map((f) => f.path).sort()).toEqual(['.trd-state/f/r.json', 'docs/x.md', 'src/b.js']);
  });

  test('a docs-only change reports no code', () => {
    const anchor = commit('src/a.js', '1');
    commit('docs/x.md', '1');
    expect(rs.changed({ anchor, cwd: dir }).counts.code).toBe(0);
  });

  test('an unknown anchor is unreadable, never an empty change', () => {
    commit('src/a.js', '1');
    const r = rs.changed({ anchor: 'deadbeef', cwd: dir });
    expect(r.readable).toBe(false);
    expect(r.files).toEqual([]);
  });

  test('an anchor that is not an ancestor is unreadable', () => {
    const base = commit('src/a.js', '1');
    git('checkout', '-qb', 'other');
    const other = commit('src/b.js', '1');
    git('checkout', '-q', '-');
    expect(rs.changed({ anchor: other, head: 'HEAD', cwd: dir }).readable).toBe(false);
    expect(base).toBeTruthy();
  });

  test('accepts a relative revision such as HEAD~1', () => {
    commit('src/a.js', '1');
    commit('docs/x.md', '1');
    const r = rs.changed({ anchor: 'HEAD~1', cwd: dir });
    expect(r.readable).toBe(true);
    expect(r.counts.doc).toBe(1);
  });

  test('refuses an anchor that is not a plain ref', () => {
    expect(rs.changed({ anchor: '--output=x', cwd: dir }).readable).toBe(false);
  });

  test('CLI prints one JSON line, exit 0, usage on bad args', () => {
    const anchor = commit('src/a.js', '1');
    commit('src/b.js', '1');
    const ok = spawnSync('node', [LIB, 'changed', '--anchor', anchor], { cwd: dir, encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).files).toHaveLength(1);
    const bad = spawnSync('node', [LIB], { cwd: dir, encoding: 'utf8' });
    expect(JSON.parse(bad.stdout).ok).toBe(false);
  });
});
