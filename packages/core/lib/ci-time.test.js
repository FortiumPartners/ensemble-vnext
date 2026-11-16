'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const ct = require('./ci-time');

const SCRIPT = path.join(__dirname, 'ci-time.js');

// The shape of `gh run view <run-id> --json jobs`.
const JOBS = {
  jobs: [
    { name: 'changes', status: 'completed', conclusion: 'success', startedAt: '2026-11-16T10:00:00Z', completedAt: '2026-11-16T10:00:20Z' },
    { name: 'unit', status: 'completed', conclusion: 'success', startedAt: '2026-11-16T10:00:25Z', completedAt: '2026-11-16T10:08:25Z' },
    { name: 'e2e', status: 'completed', conclusion: 'success', startedAt: '2026-11-16T10:00:30Z', completedAt: '2026-11-16T10:11:12Z' },
    { name: 'docs', status: 'completed', conclusion: 'skipped', startedAt: '0001-01-01T00:00:00Z', completedAt: '0001-01-01T00:00:00Z' },
    { name: 'ci', status: 'completed', conclusion: 'success', startedAt: '2026-11-16T10:11:14Z', completedAt: '2026-11-16T10:11:20Z' },
  ],
};

describe('wallTime', () => {
  test('first job start to last job end, not the sum, skipped jobs left out', () => {
    const w = ct.wallTime(JOBS);
    expect(w.wallSeconds).toBe(680); // 10:00:00 -> 10:11:20
    expect(w.jobCount).toBe(4);
  });
  test('names the slowest jobs, slowest first', () => {
    expect(ct.wallTime(JOBS).slowest).toEqual([
      { name: 'e2e', seconds: 642 },
      { name: 'unit', seconds: 480 },
      { name: 'changes', seconds: 20 },
    ]);
  });
  test('no job that ran gives null, never zero', () => {
    expect(ct.wallTime({ jobs: [] }).wallSeconds).toBeNull();
    expect(ct.wallTime({ jobs: [{ name: 'x', startedAt: null, completedAt: null }] }).wallSeconds).toBeNull();
    expect(ct.wallTime(null).wallSeconds).toBeNull();
  });
});

describe('readBudget', () => {
  test('default is 10 minutes with no line', () => {
    expect(ct.readBudget('# Release policy\n')).toEqual({ minutes: 10, source: 'default' });
    expect(ct.readBudget(null)).toEqual({ minutes: 10, source: 'default' });
  });
  test('reads the line', () => {
    expect(ct.readBudget('## CI budget\n\nCI budget: 12 min\n')).toEqual({ minutes: 12, source: 'ship.md' });
  });
  test('15 is accepted; above 15 is a problem and uses 15', () => {
    expect(ct.readBudget('CI budget: 15 min').problem).toBeUndefined();
    const r = ct.readBudget('CI budget: 20 min');
    expect(r.minutes).toBe(15);
    expect(r.problem).toMatch(/above the 15 min limit/);
  });
  test('a line inside a code fence (an example) is not read', () => {
    expect(ct.readBudget('```\nCI budget: 14 min\n```\n').source).toBe('default');
  });
});

describe('measure: wall time against budget', () => {
  test('over budget names the slowest jobs', () => {
    const m = ct.measure(JOBS, 'CI budget: 10 min\n');
    expect(m).toMatchObject({ wallSeconds: 680, budgetSeconds: 600, over: true, budgetSource: 'ship.md' });
    expect(m.slowest[0].name).toBe('e2e');
  });
  test('inside budget is not over', () => {
    expect(ct.measure(JOBS, 'CI budget: 12 min').over).toBe(false);
  });
  test('exactly at budget is not over', () => {
    expect(ct.measure(JOBS, 'CI budget: 11 min').over).toBe(true); // 680 s > 660 s
    const exact = { jobs: [{ name: 'a', startedAt: '2026-11-16T10:00:00Z', completedAt: '2026-11-16T10:10:00Z' }] };
    expect(ct.measure(exact, null).over).toBe(false);
  });
  test('no timing: over is false and wallSeconds null', () => {
    expect(ct.measure({ jobs: [] }, null)).toMatchObject({ wallSeconds: null, over: false, budgetSeconds: 600 });
  });
});

describe('CLI', () => {
  test('reads jobs JSON on stdin and prints one JSON line', () => {
    const r = spawnSync('node', [SCRIPT, 'measure'], { input: JSON.stringify(JOBS), encoding: 'utf8' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout.trim());
    expect(out).toMatchObject({ ok: true, wallSeconds: 680, budgetSeconds: 600, over: true });
  });
  test('bad usage and bad JSON exit 0 with ok:false', () => {
    expect(JSON.parse(spawnSync('node', [SCRIPT, 'x'], { encoding: 'utf8' }).stdout).ok).toBe(false);
    const bad = spawnSync('node', [SCRIPT, 'measure'], { input: 'not json', encoding: 'utf8' });
    expect(bad.status).toBe(0);
    expect(JSON.parse(bad.stdout).ok).toBe(false);
  });
});
