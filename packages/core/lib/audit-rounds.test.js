'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const A = require('./audit-rounds');

const R = (n, extra = {}) => ({ round: n, runId: `r${n}`, auditedCommit: `c${n}`, trdHash: 'h', verdict: 'proceed', defects: 0, testGaps: 0, uncovered: 0, ts: `2026-10-01T00:00:0${n}Z`, ...extra });
const rounds = (n) => Array.from({ length: n }, (_, i) => R(i + 1));

describe('classify', () => {
  test.each([
    [{ action: 'gap-unbuilt', check: 'traceability' }, 'defect'],
    [{ action: 'mismatch', check: 'verification' }, 'defect'],
    [{ action: 'mismatch', check: 'citation' }, 'other'],
    [{ action: 'mismatch', check: 'consistency' }, 'other'],
    [{ action: 'gap-untested', check: 'traceability' }, 'test-gap'],
    [{ action: 'untested', check: 'test-quality' }, 'test-gap'],
    [{ action: 'fix-citation', check: 'citation' }, 'other'],
    [{ action: 'confirm-wanted', check: 'x' }, 'other'],
    [{ action: 'whatever' }, 'other'],
  ])('%j -> %s', (input, cls) => expect(A.classify(input)).toBe(cls));
});

describe('decide', () => {
  test('no findings closes, no chain, no reaudit', () => {
    expect(A.decide({ rounds: rounds(1), verdict: 'proceed' })).toEqual({ chain: false, reaudit: false, close: true, capReached: false, caveats: [] });
  });
  test.each([1, 2, 3])('test gaps only in round %i chain then close, never reaudit', (n) => {
    const d = A.decide({ rounds: rounds(n), verdict: 'proceed', testGaps: 2 });
    expect(d).toMatchObject({ chain: true, reaudit: false, close: true, capReached: false });
  });
  test('defects in rounds 1 and 2 reaudit', () => {
    for (const n of [1, 2]) {
      expect(A.decide({ rounds: rounds(n), verdict: 'proceed', defects: 1 })).toMatchObject({ chain: true, reaudit: true, close: false });
    }
  });
  test('defects in round 3 hit the cap: chain, close, caveat, no third reaudit', () => {
    const d = A.decide({ rounds: rounds(3), verdict: 'proceed', defects: 1 });
    expect(d).toEqual({ chain: true, reaudit: false, close: true, capReached: true, caveats: ['these defect fixes were not re-audited'] });
  });
  test('uncovered items stop: feature stays open, never chained on their own', () => {
    const d = A.decide({ rounds: rounds(1), verdict: 'proceed', uncovered: 2 });
    expect(d).toMatchObject({ chain: false, reaudit: false, close: false });
  });
  test('uncovered with covered items: covered still chain, feature open, no reaudit', () => {
    const d = A.decide({ rounds: rounds(1), verdict: 'proceed', defects: 1, testGaps: 1, uncovered: 1 });
    expect(d).toMatchObject({ chain: true, reaudit: false, close: false });
  });
  test('do not proceed with nothing chainable stays open', () => {
    expect(A.decide({ rounds: rounds(1), verdict: 'do not proceed' })).toMatchObject({ chain: false, close: false, reaudit: false });
  });
  test('do not proceed with defects still reaudits', () => {
    expect(A.decide({ rounds: rounds(1), verdict: 'do not proceed', defects: 1 })).toMatchObject({ chain: true, reaudit: true });
  });
  test('report-only does nothing', () => {
    expect(A.decide({ rounds: [], verdict: 'proceed', defects: 3, testGaps: 1, reportOnly: true })).toEqual({ chain: false, reaudit: false, close: false, capReached: false, caveats: [] });
  });
  test('one-active-trip: defects, defects, test gaps closes after round 3 (3 audits)', () => {
    const led = [];
    const plan = [{ defects: 2 }, { defects: 1 }, { testGaps: 3 }];
    const decisions = plan.map((f, i) => {
      led.push(R(i + 1));
      return A.decide({ rounds: led, verdict: 'proceed', ...f });
    });
    expect(decisions.map((d) => d.reaudit)).toEqual([true, true, false]);
    expect(decisions[2]).toMatchObject({ chain: true, close: true, capReached: false });
    expect(led).toHaveLength(3);
  });
});

describe('staleWake', () => {
  test('by run id', () => expect(A.staleWake({ rounds: rounds(2), runId: 'r1', head: 'zzz' })).toBe(true));
  test('by unchanged commit', () => expect(A.staleWake({ rounds: rounds(2), runId: 'new', head: 'c2' })).toBe(true));
  test('false otherwise', () => expect(A.staleWake({ rounds: rounds(2), runId: 'new', head: 'c9' })).toBe(false));
  test('false on empty ledger', () => expect(A.staleWake({ rounds: [], runId: 'x', head: 'y' })).toBe(false));
});

describe('ledger', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-rounds-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('record appends without rewriting earlier lines', () => {
    A.record(dir, R(1));
    const first = fs.readFileSync(path.join(dir, 'audit-rounds.jsonl'), 'utf8');
    A.record(dir, R(2));
    const both = fs.readFileSync(path.join(dir, 'audit-rounds.jsonl'), 'utf8');
    expect(both.startsWith(first)).toBe(true);
    expect(both.trim().split('\n')).toHaveLength(2);
  });
  test('readRounds is empty with no ledger', () => expect(A.readRounds(dir)).toEqual([]));
  test('readRounds returns all rounds if never closed', () => {
    A.record(dir, R(1)); A.record(dir, R(2));
    expect(A.readRounds(dir).map((r) => r.round)).toEqual([1, 2]);
  });
  test('a reopened feature restarts the count', () => {
    A.record(dir, R(1, { ts: '2026-10-01T00:00:01Z' }));
    A.record(dir, R(2, { ts: '2026-10-01T00:00:02Z' }));
    fs.writeFileSync(path.join(dir, 'closed.json'), JSON.stringify({ closedAt: '2026-10-01T00:00:05Z' }));
    expect(A.readRounds(dir)).toEqual([]);
    A.record(dir, R(1, { runId: 'again', ts: '2026-10-01T00:00:09Z' }));
    const rs = A.readRounds(dir);
    expect(rs).toHaveLength(1);
    // a defect in the first round after reopening gets a reaudit, not a capped close
    expect(A.decide({ rounds: rs, verdict: 'proceed', defects: 1 }).reaudit).toBe(true);
  });
  test('malformed lines are skipped', () => {
    fs.writeFileSync(path.join(dir, 'audit-rounds.jsonl'), 'not json\n' + JSON.stringify(R(1)) + '\n');
    expect(A.readRounds(dir)).toHaveLength(1);
  });
});

describe('CLI', () => {
  const run = (cmd, input) => {
    const r = spawnSync('node', [path.join(__dirname, 'audit-rounds.js'), cmd], { input: JSON.stringify(input), encoding: 'utf8' });
    return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr };
  };
  test('classify', () => expect(run('classify', { action: 'gap-untested' }).out).toEqual({ class: 'test-gap' }));
  test('decide', () => expect(run('decide', { rounds: rounds(1), verdict: 'proceed', defects: 1 }).out.reaudit).toBe(true));
  test('stale-wake', () => expect(run('stale-wake', { rounds: rounds(1), runId: 'r1', head: 'x' }).out).toEqual({ stale: true }));
  test('record then decide from stateDir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-rounds-cli-'));
    try {
      expect(run('record', { stateDir: dir, round: R(1) }).out).toEqual({ ok: true });
      expect(run('decide', { stateDir: dir, verdict: 'proceed', testGaps: 1 }).out).toMatchObject({ close: true, reaudit: false });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  test('unknown subcommand exits non-zero', () => expect(run('nope', {}).status).toBe(1));
});
