'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const flaky = require('./flaky-ci');
const discovered = require('./discovered');

const LIB = path.join(__dirname, 'flaky-ci.js');
let tmp;
let root;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-'));
  root = path.join(tmp, '.trd-state');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const dir = (f) => path.join(root, f);
const refRows = (f) => discovered.readAll(dir(f)).filter((r) => r.ref === 'flaky:unit');

describe('import (first-time filing)', () => {
  it('files one non-blocking row the first time, none after, in any feature', () => {
    const a = flaky.importFlake(dir('a'), { job: 'unit', runId: '1' }, { root });
    expect(a.filed).toBe(true);
    const row = refRows('a')[0];
    expect(row).toMatchObject({ kind: 'gap', foundBy: 'wait-ci', blocksFeature: false });
    expect(row.summary).toBe('[flaky-ci] unit failed then passed on rerun (1 flake(s) recorded)');
    expect(flaky.importFlake(dir('a'), { job: 'unit', runId: '2' }, { root }).filed).toBe(false);
    expect(flaky.importFlake(dir('b'), { job: 'unit', runId: '3' }, { root }).filed).toBe(false);
    expect(refRows('a')).toHaveLength(1);
    expect(refRows('b')).toHaveLength(0);
  });

  it('a different job is filed separately', () => {
    flaky.importFlake(dir('a'), { job: 'unit', runId: '1' }, { root });
    expect(flaky.importFlake(dir('a'), { job: 'lint', runId: '1' }, { root }).filed).toBe(true);
  });

  it('writes only flaky.jsonl and discovered.jsonl in the feature dir', () => {
    flaky.importFlake(dir('a'), { job: 'unit', runId: '1' }, { root });
    expect(fs.readdirSync(dir('a')).sort()).toEqual(['discovered.jsonl', 'flaky.jsonl']);
    expect(fs.readdirSync(root)).toEqual(['a']);
  });
});

describe('cap', () => {
  it('2nd flake not capped, 3rd across two features capped', () => {
    expect(flaky.recordFlake(dir('a'), { job: 'unit', runId: '1' }, { root })).toMatchObject({ count: 1, capped: false });
    expect(flaky.recordFlake(dir('b'), { job: 'unit', runId: '2' }, { root })).toMatchObject({ count: 2, capped: false });
    expect(flaky.recordFlake(dir('a'), { job: 'unit', runId: '3' }, { root })).toMatchObject({ count: 3, capped: true });
    expect(flaky.FLAKE_CAP).toBe(3);
  });

  it('the same run id twice counts once', () => {
    flaky.recordFlake(dir('a'), { job: 'unit', runId: '1' }, { root });
    const again = flaky.recordFlake(dir('b'), { job: 'unit', runId: '1' }, { root });
    expect(again).toMatchObject({ count: 1, recorded: false });
    expect(flaky.countFlakes('unit', { root })).toBe(1);
  });

  it('underscore directories are not counted; malformed lines are skipped', () => {
    fs.mkdirSync(dir('_sweep'), { recursive: true });
    fs.writeFileSync(path.join(dir('_sweep'), 'flaky.jsonl'), JSON.stringify({ job: 'unit', runId: '9' }) + '\n');
    fs.mkdirSync(dir('a'), { recursive: true });
    fs.writeFileSync(path.join(dir('a'), 'flaky.jsonl'), 'not json\n');
    expect(flaky.countFlakes('unit', { root })).toBe(0);
    expect(flaky.recordFlake(dir('a'), { job: 'unit', runId: '1' }, { root }).count).toBe(1);
  });

  it('rejects missing arguments', () => {
    expect(() => flaky.recordFlake(dir('a'), { job: 'unit' }, { root })).toThrow();
  });
});

describe('CLI', () => {
  const run = (args) => {
    const r = spawnSync('node', [LIB, ...args], { cwd: tmp, encoding: 'utf8' });
    return { status: r.status, out: JSON.parse(r.stdout.trim()) };
  };

  it('import then count, relative paths against cwd', () => {
    const r1 = run(['import', '--state-dir', '.trd-state/a', '--job', 'unit', '--run-id', '1']);
    expect(r1.status).toBe(0);
    expect(r1.out).toMatchObject({ ok: true, count: 1, capped: false, filed: true });
    run(['record', '--state-dir', '.trd-state/b', '--job', 'unit', '--run-id', '2']);
    const r3 = run(['record', '--state-dir', '.trd-state/b', '--job', 'unit', '--run-id', '3']);
    expect(r3.out).toMatchObject({ count: 3, capped: true });
    expect(run(['count', '--job', 'unit']).out).toMatchObject({ ok: true, count: 3, capped: true });
  });

  it('--root overrides the default', () => {
    run(['record', '--root', 'other', '--state-dir', 'other/a', '--job', 'unit', '--run-id', '1']);
    expect(run(['count', '--root', 'other', '--job', 'unit']).out.count).toBe(1);
    expect(run(['count', '--job', 'unit']).out.count).toBe(0);
  });

  it('bad usage exits 1 with ok:false', () => {
    const r = run(['record', '--job', 'unit']);
    expect(r.status).toBe(1);
    expect(r.out.ok).toBe(false);
    expect(run(['bogus']).status).toBe(1);
  });
});

describe('mirrors', () => {
  const rootDir = path.join(__dirname, '..', '..', '..');
  it('.claude/lib copy is identical and packages/full/lib is a link', () => {
    expect(fs.readFileSync(path.join(rootDir, '.claude', 'lib', 'flaky-ci.js'), 'utf8')).toBe(fs.readFileSync(LIB, 'utf8'));
    const link = path.join(rootDir, 'packages', 'full', 'lib', 'flaky-ci.js');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('../../core/lib/flaky-ci.js');
  });
});
