'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const tb = require('./test-baseline');

const SCRIPT = path.join(__dirname, 'test-baseline.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tb-'));

describe('compare: baseline failures are not red, new failures are', () => {
  test('a failure already on the base is reported as baseline and the gate is not red', () => {
    const d = tmp();
    tb.recordBaseline(d, { suite: 'unit', base: 'abc', command: 'npm test', failures: ['a > fails', 'b > fails'] });
    const r = tb.compare(d, 'unit', ['a > fails']);
    expect(r).toEqual({ red: false, newFailures: [], baselineFailures: ['a > fails'], baselineKnown: true });
  });
  test('a failure not in the baseline is new and red, even beside baseline ones', () => {
    const d = tmp();
    tb.recordBaseline(d, { suite: 'unit', base: 'abc', command: 'npm test', failures: ['a > fails'] });
    const r = tb.compare(d, 'unit', ['a > fails', 'c > new']);
    expect(r.red).toBe(true);
    expect(r.newFailures).toEqual(['c > new']);
    expect(r.baselineFailures).toEqual(['a > fails']);
  });
  test('no baseline captured: every failure is new, nothing is excused', () => {
    const r = tb.compare(tmp(), 'unit', ['a']);
    expect(r).toMatchObject({ red: true, newFailures: ['a'], baselineKnown: false });
  });
  test('a baseline for another suite does not excuse this one', () => {
    const d = tmp();
    tb.recordBaseline(d, { suite: 'e2e', base: 'abc', command: 'x', failures: ['a'] });
    expect(tb.compare(d, 'unit', ['a']).red).toBe(true);
  });
  test('no failures is green', () => {
    expect(tb.compare(tmp(), 'unit', []).red).toBe(false);
  });
});

describe('reuse: a suite that already ran on this tree is not run again', () => {
  test('same tree is reused', () => {
    const d = tmp();
    tb.recordRun(d, { suite: 'unit', command: 'npm test', status: 'pass', durationSeconds: 90, tree: 'sha1+aa' });
    const r = tb.reuse(d, 'unit', 'sha1+aa');
    expect(r.reuse).toBe(true);
    expect(r.reason).toMatch(/not run again/);
  });
  test('an edit changes the tree and the suite runs again', () => {
    const d = tmp();
    tb.recordRun(d, { suite: 'unit', command: 'x', status: 'pass', tree: 'sha1+aa' });
    expect(tb.reuse(d, 'unit', 'sha1+bb').reuse).toBe(false);
  });
  test('never ran, or an unknown tree, is never reused', () => {
    const d = tmp();
    expect(tb.reuse(d, 'unit', 'sha1+aa').reuse).toBe(false);
    tb.recordRun(d, { suite: 'unit', command: 'x', status: 'pass', tree: null });
    expect(tb.reuse(d, 'unit', null).reuse).toBe(false);
  });
});

describe('background: suites that can outlast the 600 s Bash limit', () => {
  test('from the last recorded duration', () => {
    const d = tmp();
    tb.recordRun(d, { suite: 'unit', command: 'x', status: 'pass', durationSeconds: 100, tree: 't' });
    tb.recordRun(d, { suite: 'e2e', command: 'x', status: 'pass', durationSeconds: 1900, tree: 't' });
    expect(tb.background(d, 'unit', 'unit').background).toBe(false);
    const e = tb.background(d, 'e2e', 'e2e');
    expect(e.background).toBe(true);
    expect(e.timeoutSeconds).toBeGreaterThan(1900);
  });
  test('the timeout is above the Bash limit even for a suite just over the threshold', () => {
    const d = tmp();
    tb.recordRun(d, { suite: 'it', command: 'x', status: 'pass', durationSeconds: 430, tree: 't' });
    expect(tb.background(d, 'it', 'integration').timeoutSeconds).toBeGreaterThan(600);
  });
  test('with no recorded duration, integration and e2e run in the background and unit does not', () => {
    const d = tmp();
    expect(tb.background(d, 'integration', 'integration').background).toBe(true);
    expect(tb.background(d, 'e2e', 'e2e').background).toBe(true);
    expect(tb.background(d, 'unit', 'unit').background).toBe(false);
  });
  test("the baseline's duration counts when the suite has not run yet", () => {
    const d = tmp();
    tb.recordBaseline(d, { suite: 'unit', base: 'b', command: 'x', durationSeconds: 800, failures: [] });
    expect(tb.background(d, 'unit', 'unit').background).toBe(true);
  });
});

describe('treeId and the CLI', () => {
  test('treeId changes with an edit and not otherwise', () => {
    const d = tmp();
    const git = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(d, 'a.txt'), '1');
    git('add', '.'); git('commit', '-qm', 'one');
    const t1 = tb.treeId(d);
    expect(tb.treeId(d)).toBe(t1);
    fs.writeFileSync(path.join(d, 'a.txt'), '2');
    expect(tb.treeId(d)).not.toBe(t1);
    expect(tb.treeId(os.tmpdir())).toBeNull();
  });

  test('record-run then reuse and compare through the CLI, one JSON line each', () => {
    const d = tmp();
    const cli = (...a) => JSON.parse(spawnSync('node', [SCRIPT, ...a], { encoding: 'utf8', cwd: path.join(__dirname, '..', '..', '..') }).stdout.trim());
    const f = path.join(d, 'f.txt');
    fs.writeFileSync(f, 'x > one\nx > two\n');
    expect(cli('record-baseline', '--state-dir', d, '--suite', 'unit', '--base', 'abc', '--command', 'npm test', '--failures-file', f).failures).toEqual(['x > one', 'x > two']);
    fs.writeFileSync(f, 'x > one\n');
    expect(cli('compare', '--state-dir', d, '--suite', 'unit', '--failures-file', f)).toMatchObject({ ok: true, red: false, baselineFailures: ['x > one'] });
    expect(cli('record-run', '--state-dir', d, '--suite', 'unit', '--command', 'npm test', '--status', 'pass', '--duration', '12').status).toBe('pass');
    expect(cli('reuse', '--state-dir', d, '--suite', 'unit')).toMatchObject({ ok: true, reuse: true });
  });

  test('bad usage is ok:false and exits 0', () => {
    const r = spawnSync('node', [SCRIPT, 'bogus'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(false);
    expect(JSON.parse(spawnSync('node', [SCRIPT, 'reuse'], { encoding: 'utf8' }).stdout).ok).toBe(false);
  });

  test('a corrupt record file reads as empty, never throws', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'test-battery.json'), '{nope');
    expect(tb.compare(d, 'unit', ['a']).red).toBe(true);
  });
});
