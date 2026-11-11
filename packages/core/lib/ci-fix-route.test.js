'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { classifyFile, routeRow, checkDiff } = require('./ci-fix-route');

const CLI = path.join(__dirname, 'ci-fix-route.js');

describe('classifyFile', () => {
  test.each([
    ['src/foo.test.js', 'test'],
    ['.github/workflows/ci.yml', 'ci-config'],
    ['.github/workflows/ci.yaml', 'ci-config'],
    ['.gitlab-ci.yml', 'ci-config'],
    ['.circleci/config.yml', 'ci-config'],
    ['Jenkinsfile', 'ci-config'],
    ['src/foo.js', 'other'],
    ['docs/readme.md', 'other'],
    ['.claude/verification-notes.md', 'record'],
    ['.trd-state/x/implement.json', 'record'],
  ])('%s -> %s', (p, cls) => expect(classifyFile(p)).toBe(cls));
});

describe('routeRow', () => {
  const route = (row) => routeRow(row, {});
  test('test file is direct', () => expect(route({ files: ['src/foo.test.js'] }).route).toBe('direct'));
  test('singular file is read', () => expect(route({ file: 'src/foo.test.js' }).route).toBe('direct'));
  test('workflow is direct', () => expect(route({ files: ['.github/workflows/ci.yml'] }).route).toBe('direct'));
  test('record files alongside a test are ignored', () =>
    expect(route({ files: ['a.test.js', '.claude/verification-notes.md'] }).route).toBe('direct'));
  test('product code reconciles', () => {
    const r = route({ files: ['src/foo.js'] });
    expect(r.route).toBe('reconcile');
    expect(r.reason).toMatch(/product code: src\/foo\.js/);
  });
  test('mixed test and product reconciles', () =>
    expect(route({ files: ['a.test.js', 'src/foo.js'] }).route).toBe('reconcile'));
  test('no files reconciles with reason', () => {
    const r = route({ summary: 'x' });
    expect(r.route).toBe('reconcile');
    expect(r.reason).toMatch(/no files/);
  });
  test('lint row reconciles', () =>
    expect(route({ summary: '[lint] unused var', files: ['a.test.js'] }).route).toBe('reconcile'));
  test('traversal reconciles', () => {
    const r = route({ files: ['../x.test.js'] });
    expect(r.route).toBe('reconcile');
    expect(r.reason).toMatch(/unsafe path/);
  });
  test('absolute path reconciles', () => expect(route({ files: ['/etc/a.test.js'] }).route).toBe('reconcile'));
  test('record-only reconciles', () => {
    const r = route({ files: ['.claude/verification-notes.md'] });
    expect(r.route).toBe('reconcile');
    expect(r.reason).toMatch(/only record files/);
  });
  test('trd path counts as record', () =>
    expect(routeRow({ files: ['docs/TRD/x.md'] }, { trdRel: 'docs/TRD/x.md' }).reason).toMatch(/only record/));
});

describe('checkDiff', () => {
  test('test-only diff is ok', () => {
    const r = checkDiff({ paths: ['a.test.js'], diffText: '' });
    expect(r.ok).toBe(true);
    expect(r.refused).toEqual([]);
  });
  test('product path refused', () => {
    const r = checkDiff({ paths: ['a.test.js', 'src/foo.js'], diffText: '' });
    expect(r.ok).toBe(false);
    expect(r.refused[0].path).toBe('src/foo.js');
  });
  const wf = (line) =>
    `diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1 +1 @@\n${line}\n`;
  test.each(['+permissions: write-all', '+  token: ${{ secrets.X }}', '-      - uses: actions/checkout@v4', '+on:', '+  pull_request_target:'])(
    'workflow line %s refused',
    (line) => {
      const r = checkDiff({ paths: ['.github/workflows/ci.yml'], diffText: wf(line) });
      expect(r.ok).toBe(false);
      expect(r.refused[0].path).toBe('.github/workflows/ci.yml');
    },
  );
  test('benign workflow edit ok', () =>
    expect(checkDiff({ paths: ['.github/workflows/ci.yml'], diffText: wf('+      timeout-minutes: 20') }).ok).toBe(true));
  test('+++ header lines are not scanned as changes', () =>
    expect(checkDiff({ paths: ['.github/workflows/ci.yml'], diffText: wf('+  run: npm test') }).ok).toBe(true));
});

describe('CLI route', () => {
  test('prints rows with ts and summary for open blocking rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cifix-'));
    const rows = [
      { ts: '2026-01-01T00:00:00Z', kind: 'bug', summary: 'a test fails', files: ['x.test.js'], blocksFeature: true },
      { ts: '2026-01-01T00:00:01Z', kind: 'bug', summary: 'product bug', files: ['src/x.js'], blocksFeature: true },
      { ts: '2026-01-01T00:00:02Z', kind: 'bug', summary: 'not blocking', files: ['x.test.js'], blocksFeature: false },
    ];
    fs.writeFileSync(path.join(dir, 'discovered.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const res = spawnSync('node', [CLI, 'route', '--state-dir', dir, '--trd', 'none'], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout.trim());
    expect(out.ok).toBe(true);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ ts: rows[0].ts, summary: 'a test fails', route: 'direct' });
    expect(out.rows[1]).toMatchObject({ route: 'reconcile' });
  });
  test('bad usage exits 1', () => {
    const res = spawnSync('node', [CLI, 'route'], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(JSON.parse(res.stdout.trim()).ok).toBe(false);
  });
});
