'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const discovered = require('./discovered');
const fr = require('./followup-rank');

const LIB = path.join(__dirname, 'followup-rank.js');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fr-'));
const rec = (dir, e) => discovered.record(dir, { kind: 'gap', foundBy: 't', phase: 1, ...e });

describe('classOf', () => {
  it.each([
    [{ summary: '[flaky-ci] j' }, 'tooling'],
    [{ summary: '[flaky-capped] j' }, 'tooling'],
    [{ summary: '[not-verifiable] c' }, 'not-verifiable'],
    [{ summary: 'x', status: 'not_verifiable' }, 'not-verifiable'],
    [{ summary: '[review:major] x' }, 'product'],
    [{ summary: '[below-bar] x' }, 'product'],
    [{ summary: '[review-pending] x' }, 'product'],
    [{ summary: 'plain', kind: 'stale-grounding' }, 'paperwork'],
    [{ summary: 'plain' }, 'product'],
    [{ summary: '[flaky-ci] j', rankClass: 'host' }, 'host'],
    [{ summary: '[flaky-ci] j', rankClass: 'bogus' }, 'tooling'],
  ])('%j -> %s', (row, cls) => expect(fr.classOf(row)).toBe(cls));
});

describe('rank', () => {
  it('orders classes and keeps ledger order within one', () => {
    const rows = [
      { summary: '[not-verifiable] a' }, { summary: 'g', kind: 'stale-grounding' },
      { summary: '[flaky-ci] t' }, { summary: 'h', rankClass: 'host' },
      { summary: 'p1' }, { summary: '[review:minor] p2' },
    ];
    const out = fr.rank(rows);
    expect(out.map((r) => r.class)).toEqual(['product', 'product', 'host', 'tooling', 'paperwork', 'not-verifiable']);
    expect(out.slice(0, 2).map((r) => r.summary)).toEqual(['p1', '[review:minor] p2']);
    expect(rows[0].class).toBeUndefined();
  });
});

describe('record rankClass', () => {
  it('keeps a valid one and drops an invalid one', () => {
    const d = mk();
    rec(d, { summary: 'a', rankClass: 'host' });
    rec(d, { summary: 'b', rankClass: 'nope' });
    const rows = discovered.readAll(d);
    expect(rows[0].rankClass).toBe('host');
    expect(rows[1].rankClass).toBeUndefined();
  });
});

describe('CLI', () => {
  const run = (args) => spawnSync('node', [LIB, ...args], { encoding: 'utf8' });
  it('merges two ledgers, ranks, and tags dir', () => {
    const a = mk(); const b = mk();
    rec(a, { summary: '[flaky-ci] j' });
    rec(b, { summary: '[below-bar] p' });
    const r = run(['open', '--state-dir', a, '--state-dir', b]);
    expect(r.status).toBe(0);
    const rows = JSON.parse(r.stdout);
    expect(rows.map((x) => [x.class, x.dir])).toEqual([['product', b], ['tooling', a]]);
  });
  it('missing ledger yields []', () => {
    expect(JSON.parse(run(['open', '--state-dir', path.join(mk(), 'none')]).stdout)).toEqual([]);
  });
  it('bad usage exits 2', () => {
    for (const args of [[], ['open'], ['bogus'], ['open', '--state-dir']]) {
      const r = run(args);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/usage/);
    }
  });
});

describe('mirrors', () => {
  const root = path.join(__dirname, '..', '..', '..');
  it('.claude/lib copy identical; packages/full/lib is a link', () => {
    for (const n of ['followup-rank.js', 'discovered.js']) {
      expect(fs.readFileSync(path.join(root, '.claude', 'lib', n), 'utf8'))
        .toBe(fs.readFileSync(path.join(__dirname, n), 'utf8'));
    }
    const link = path.join(root, 'packages', 'full', 'lib', 'followup-rank.js');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('../../core/lib/followup-rank.js');
  });
});
