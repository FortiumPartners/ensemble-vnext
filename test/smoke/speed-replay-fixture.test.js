'use strict';
// Guards the speed-replay fixture (docs/TRD/speed-sentence.md, FIX-005): a past
// lightning-lane TRD of ten tasks that the A/B replay runs through /implement-trd.
// If today's parser read it any differently, the replay would measure a different
// task graph than the one the TRD promises, so the parse result is pinned here.
const fs = require('fs');
const path = require('path');
const { parseTrd } = require('../../packages/core/lib/trd-parser');
const { buildGraph, phaseGroups } = require('../../packages/core/lib/task-graph');

const DIR = path.join(__dirname, 'fixtures', 'speed-replay', 'availability-consolidation');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const EXPECTED = {
  'AVAIL-B001': { phase: 1, deps: [] },
  'AVAIL-B002': { phase: 2, deps: ['AVAIL-B001'] },
  'AVAIL-B003': { phase: 2, deps: ['AVAIL-B001'] },
  'AVAIL-B004': { phase: 2, deps: ['AVAIL-B001'] },
  'AVAIL-B005': { phase: 2, deps: ['AVAIL-B001'] },
  'AVAIL-B006': { phase: 2, deps: ['AVAIL-B001'] },
  'AVAIL-B007': { phase: 3, deps: ['AVAIL-B004'] },
  'AVAIL-B008': { phase: 3, deps: ['AVAIL-B002'] },
  'AVAIL-B009': { phase: 3, deps: ['AVAIL-B002', 'AVAIL-B003'] },
  'AVAIL-P001': {
    phase: 3,
    deps: ['AVAIL-B002', 'AVAIL-B003', 'AVAIL-B004', 'AVAIL-B005', 'AVAIL-B006'],
  },
};

describe('speed-replay fixture: availability-consolidation', () => {
  const trd = read('trd.md');
  const parsed = parseTrd(trd);

  it('parses to exactly the ten replay tasks', () => {
    expect(parsed.tasks.map((t) => t.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('places tasks in phases 1, 2 (five) and 3 (four) with the source dependencies', () => {
    const phaseCount = {};
    for (const t of parsed.tasks) {
      expect(t.phase).toBe(EXPECTED[t.id].phase);
      expect([...t.dependencies].sort()).toEqual([...EXPECTED[t.id].deps].sort());
      phaseCount[t.phase] = (phaseCount[t.phase] || 0) + 1;
    }
    expect(phaseCount).toEqual({ 1: 1, 2: 5, 3: 4 });
  });

  it('has no live, deferred tasks or parser warnings', () => {
    expect(parsed.tasks.every((t) => t.live === false)).toBe(true);
    expect(parsed.tasks.some((t) => t.deferred)).toBe(false);
    expect(parsed.deferred).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it('groups phases one at a time', () => {
    const graph = buildGraph(parsed.tasks, parsed.grounding);
    expect(phaseGroups(parsed.tasks, graph)).toEqual([[1], [2], [3]]);
  });

  it('gives every task a grounding block', () => {
    for (const id of Object.keys(EXPECTED)) expect(parsed.grounding[id]).toBeDefined();
  });

  it('carries no live marker on any Master Task List row', () => {
    const list = trd.split('## 4. Master Task List')[1].split(/^## 5\./m)[0];
    const rows = list.split('\n').filter((l) => /^\|\s*AVAIL-/.test(l));
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(r).not.toMatch(/\[LIVE\]/);
    expect(list).not.toMatch(/Live: against the local stack/);
  });

  it('has fixture.json naming the source, base and every document', () => {
    const f = JSON.parse(read('fixture.json'));
    expect(f.base).toBe('e04cfe0edfffbe3a11e2332f362ca4d571e72c17');
    expect(f.prCommit).toBe('9fac17fbbb023b39a7ad6f7d1eb3cf2bfffaa723');
    expect(f.trdCommit).toBe('0356413bf');
    expect(f.sourceRepo).toBeTruthy();
    expect(f.battery).toMatch(/^pnpm turbo test/);
    expect(Object.keys(f.docs).sort()).toEqual(['prd.brief.md', 'prd.md', 'proposal.md', 'trd.md']);
    for (const [file, dest] of Object.entries(f.docs)) {
      expect(fs.existsSync(path.join(DIR, file))).toBe(true);
      expect(dest).not.toMatch(/^\//);
    }
    expect(f.docs['trd.md']).toBe('docs/TRD/availability-consolidation.md');
  });

  it('records provenance for each task in the header', () => {
    for (const id of Object.keys(EXPECTED)) expect(trd.split('## 1. Overview')[0]).toContain(id);
  });
});
