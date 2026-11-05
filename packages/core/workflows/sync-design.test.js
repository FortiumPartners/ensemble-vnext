/**
 * sync-design.js test suite (DSGN-B015). Wiring tests in the audit-design.test.js style.
 * Run with: npx jest packages/core/workflows/sync-design.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub, unpinnedLabels } = require('./test-harness');

const SOURCE = readScript('sync-design.js');

const board = (id, status = 'building') => ({ id, file: `${id}.dc.html`, kind: 'to-be', platform: 'web', viewport: '1280x800', status });
const mapOf = (...boards) => JSON.stringify({ boards });

function baseArgs(overrides = {}) {
  return {
    slug: 'checkout', dir: 'docs/ui/checkout', map: mapOf(board('01-a'), board('02-b')),
    capture: 'CAPTURE-TEXT', rubric: 'RUBRIC-TEXT', environment: 'local', ...overrides,
  };
}

const MATCH = { verdict: 'match', note: 'ok' };
const DIFFERS = { verdict: 'differs', note: 'button is blue in the build', frames: ['as-built/png/02-b.png'] };

function plan(overrides = {}) {
  return (prompt, opts) => {
    const label = String(opts.label);
    if (Object.prototype.hasOwnProperty.call(overrides, label)) return overrides[label];
    if (label.startsWith('compare:')) return MATCH;
    if (label.startsWith('rebuild:')) return { rebuilt: true, note: 'redrawn' };
    return undefined;
  };
}

async function sync(overrides = {}, args = baseArgs()) {
  const agent = makeAgentStub(plan(overrides));
  const parallel = makeParallelStub();
  const { result, phases, logs } = await runWorkflow(SOURCE, { agent, parallel, args });
  return { result, phases, logs, agent, parallel };
}

const byLabel = (agent, label) => agent.calls.find((c) => c.opts.label === label);
const labelled = (agent, prefix) => agent.calls.filter((c) => String(c.opts.label).startsWith(prefix));

describe('sync-design wiring', () => {
  it('runs compare then rebuild', async () => {
    const { phases } = await sync();
    expect(phases).toEqual(['Compare', 'Rebuild']);
  });

  it('dispatches one compare agent per building board, in one parallel wave', async () => {
    const map = mapOf(board('01-a'), board('02-b'), board('03-c', 'approved'), board('04-d', 'shipped'));
    const { agent, parallel } = await sync({}, baseArgs({ map }));
    expect(labelled(agent, 'compare:').map((c) => c.opts.label).sort()).toEqual(['compare:01-a', 'compare:02-b']);
    expect(parallel.waves).toHaveLength(1);
    expect(parallel.waves[0].size).toBe(2);
  });

  it('pins agentType or model on every agent() call', async () => {
    const { agent } = await sync({ 'compare:02-b': DIFFERS }, baseArgs({ rulings: [{ board: '02-b', owner: true, cite: 'PRD ruling OQ-2' }] }));
    expect(unpinnedLabels(agent)).toEqual([]);
    expect(agent.calls.filter((c) => !c.opts.agentType).map((c) => c.opts.label)).toEqual([]);
  });

  it('passes the Capture and Rubric text and the environment to every compare agent', async () => {
    const { agent } = await sync();
    for (const c of labelled(agent, 'compare:')) {
      expect(c.prompt).toContain('CAPTURE-TEXT');
      expect(c.prompt).toContain('RUBRIC-TEXT');
      expect(c.prompt).toMatch(/Never\s+staging or production/);
      expect(c.prompt).toContain('docs/ui/checkout/as-built/png/');
    }
  });

  it('batches past 20 boards without dropping any', async () => {
    const boards = Array.from({ length: 25 }, (_, i) => board(`b${i}`));
    const { agent, parallel, result } = await sync({}, baseArgs({ map: mapOf(...boards) }));
    expect(parallel.waves.map((w) => w.size)).toEqual([20, 5]);
    expect(result.matched).toHaveLength(25);
    expect(agent.calls).toHaveLength(25);
  });
});

describe('sync-design verdicts', () => {
  const OWNER = { board: '02-b', owner: true, cite: 'PRD ruling OQ-2' };

  it('reports matches and rebuilds nothing when every board matches', async () => {
    const { result, agent } = await sync();
    expect(result.matched).toEqual(['01-a', '02-b']);
    expect(labelled(agent, 'rebuild:')).toHaveLength(0);
    expect(result.reported).toEqual([]);
  });

  it('rebuilds a differing board only when an owner ruling accepts the difference', async () => {
    const { result, agent } = await sync({ 'compare:02-b': DIFFERS }, baseArgs({ rulings: [OWNER] }));
    expect(labelled(agent, 'rebuild:').map((c) => c.opts.label)).toEqual(['rebuild:02-b']);
    expect(byLabel(agent, 'rebuild:02-b').prompt).toContain('PRD ruling OQ-2');
    expect(result.rebuilt).toEqual([{ board: '02-b', ruling: 'PRD ruling OQ-2', note: 'redrawn' }]);
    expect(result.matched).toEqual(['01-a']);
  });

  it('reports, and does not rebuild, a difference with no ruling', async () => {
    const { result, agent } = await sync({ 'compare:02-b': DIFFERS });
    expect(labelled(agent, 'rebuild:')).toHaveLength(0);
    expect(result.reported).toEqual([{ board: '02-b', note: DIFFERS.note, ruling: 'none' }]);
    expect(result.matched).not.toContain('02-b');
  });

  it('reports, and does not rebuild, a difference citing only an architect-written TRD decision', async () => {
    const architect = { board: '02-b', owner: false, cite: 'TRD decision D9 (architect)' };
    const { result, agent } = await sync({ 'compare:02-b': DIFFERS }, baseArgs({ rulings: [architect] }));
    expect(labelled(agent, 'rebuild:')).toHaveLength(0);
    expect(result.reported.map((r) => r.board)).toEqual(['02-b']);
  });

  it('ignores a ruling for a board that matched', async () => {
    const { agent } = await sync({}, baseArgs({ rulings: [OWNER] }));
    expect(labelled(agent, 'rebuild:')).toHaveLength(0);
  });

  it('keeps an uncaptured board out of matched and out of the rebuild', async () => {
    const { result, agent } = await sync({ 'compare:02-b': { verdict: 'uncaptured', note: 'route needs login' } }, baseArgs({ rulings: [OWNER] }));
    expect(result.uncaptured).toEqual([{ board: '02-b', note: 'route needs login' }]);
    expect(result.matched).toEqual(['01-a']);
    expect(labelled(agent, 'rebuild:')).toHaveLength(0);
  });

  it('lists a dead compare agent and a failed rebuild under failed, never as matched', async () => {
    const dead = await sync({ 'compare:01-a': undefined });
    expect(dead.result.failed).toEqual([{ board: '01-a', note: 'compare agent returned nothing' }]);
    expect(dead.result.matched).toEqual(['02-b']);
    const bad = await sync({ 'compare:02-b': DIFFERS, 'rebuild:02-b': { rebuilt: false, note: 'render error' } }, baseArgs({ rulings: [OWNER] }));
    expect(bad.result.failed).toEqual([{ board: '02-b', note: 'render error' }]);
    expect(bad.result.rebuilt).toEqual([]);
  });

  it('edits no map or canvas: the result carries lists only', async () => {
    const { result } = await sync();
    expect(Object.keys(result).sort()).toEqual(['dir', 'failed', 'matched', 'rebuilt', 'reported', 'slug', 'uncaptured']);
  });

  it('tells the rebuild agent to leave the map and canvas.json to the command', async () => {
    const { agent } = await sync({ 'compare:02-b': DIFFERS }, baseArgs({ rulings: [OWNER] }));
    expect(byLabel(agent, 'rebuild:02-b').prompt).toMatch(/Edit no map and no canvas\.json/);
  });
});

describe('sync-design input checks', () => {
  const run = (args) => runWorkflow(SOURCE, { agent: makeAgentStub(plan()), parallel: makeParallelStub(), args });

  it('refuses to run without a dir, a map, or the Capture and Rubric text, or with a malformed map', async () => {
    await expect(run({ map: mapOf() })).rejects.toThrow(/args\.dir/);
    await expect(run({ dir: 'd' })).rejects.toThrow(/args\.map/);
    await expect(run({ dir: 'd', map: mapOf() })).rejects.toThrow(/capture and args\.rubric/);
    await expect(run({ dir: 'd', map: '{nope', capture: 'c', rubric: 'r' })).rejects.toThrow(/not valid JSON/);
  });

  it('accepts args as a JSON string', async () => {
    const { result } = await sync({}, JSON.stringify(baseArgs()));
    expect(result.slug).toBe('checkout');
  });

  it('with no building boards runs no agent and returns empty lists', async () => {
    const { result, agent } = await sync({}, baseArgs({ map: mapOf(board('01-a', 'draft')) }));
    expect(agent.calls).toHaveLength(0);
    expect(result.matched).toEqual([]);
  });
});
