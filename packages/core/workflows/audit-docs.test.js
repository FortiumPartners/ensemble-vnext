/**
 * audit-docs.js test suite (docs-as-built DABS-B004).
 *
 * Harness tests: routing by score at and around each threshold, the null-score route, the
 * comprehensive raise, the empty light window, the Opus three-verifiers-then-apply shape, loose
 * batches, dead agents, and batch isolation.
 *
 * Run with: npx jest packages/core/workflows/audit-docs.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub, unpinnedLabels } = require('./test-harness');

const SOURCE = readScript('audit-docs.js');

const doc = (path, cls = 'prd', extra = {}) => ({ path, class: cls, text: true, ...extra });

function baseArgs(overrides = {}) {
  return {
    runId: '2026-10-04-abc1234', mode: 'light', repo: '/repo',
    assemblyPath: '/repo/.trd-state/_docs-audit/work/r/assembly.json',
    contractPath: '.claude/contracts/docs-audit.md',
    thresholds: { high: 70, medium: 40 },
    batch: { key: 'prd', chunk: 0, docs: [doc('docs/PRD/a.md')] },
    ...overrides,
  };
}

const REVIEW_OK = { outcome: 'edited', corrections: [{ section: '2', what: 'fixed' }], cuts: [], mapWritten: true };

/** scores: { path: number|null }; overrides: label -> value */
function plan(scores = {}, overrides = {}) {
  return (prompt, opts) => {
    const label = String(opts.label);
    if (Object.prototype.hasOwnProperty.call(overrides, label)) return overrides[label];
    if (label.startsWith('score:')) {
      const s = scores[label.slice(6)];
      return s === null || s === undefined ? undefined : { score: s, reason: `r${s}` };
    }
    if (label.startsWith('verify:')) return { findings: [] };
    return REVIEW_OK; // apply: / review:
  };
}

async function run(args, scores, overrides) {
  const agent = makeAgentStub(plan(scores, overrides));
  const parallel = makeParallelStub();
  const out = await runWorkflow(SOURCE, { agent, parallel, args });
  return { ...out, agent, parallel };
}

const labels = (agent, prefix) => agent.calls.map((c) => String(c.opts.label)).filter((l) => l.startsWith(prefix));

describe('audit-docs routing by score', () => {
  it.each([
    [100, 'opus'], [71, 'opus'], [70, 'opus'], [69, 'sonnet'], [40, 'sonnet'], [39, 'none'], [0, 'none'],
  ])('score %i routes to %s (high 70, medium 40)', async (score, depth) => {
    const { result } = await run(baseArgs(), { 'docs/PRD/a.md': score });
    expect(result.records[0].depth).toBe(depth);
    expect(result.records[0].score).toBe(score);
    expect(result.records[0].scoreReason).toBe(`r${score}`);
  });

  it('honours thresholds from args', async () => {
    const { result } = await run(baseArgs({ thresholds: { high: 90, medium: 10 } }), { 'docs/PRD/a.md': 50 });
    expect(result.records[0].depth).toBe('sonnet');
  });

  it('routes a null score (scorer returned nothing) to sonnet, never skips it', async () => {
    const { result, agent } = await run(baseArgs(), { 'docs/PRD/a.md': null });
    expect(result.records[0].depth).toBe('sonnet');
    expect(result.records[0].score).toBeNull();
    expect(labels(agent, 'review:')).toEqual(['review:docs/PRD/a.md']);
  });

  it('raises none to sonnet in a comprehensive run', async () => {
    const { result } = await run(baseArgs({ mode: 'comprehensive' }), { 'docs/PRD/a.md': 5 });
    expect(result.records[0].depth).toBe('sonnet');
  });

  it('leaves none untouched in a light run: no review agent, outcome not-reviewed', async () => {
    const { result, agent } = await run(baseArgs(), { 'docs/PRD/a.md': 5 });
    expect(result.records[0]).toMatchObject({ depth: 'none', outcome: 'not-reviewed' });
    expect(agent.calls).toHaveLength(1); // the scorer only
  });

  it('scores on haiku', async () => {
    const { agent } = await run(baseArgs(), { 'docs/PRD/a.md': 50 });
    expect(agent.calls[0].opts.model).toBe('haiku');
  });
});

describe('audit-docs empty light window', () => {
  it('dispatches no agent and records every doc as not-reviewed', async () => {
    const args = baseArgs({ window: { commits: 0 }, batch: { key: 'prd', chunk: 0, docs: [doc('docs/PRD/a.md'), doc('docs/PRD/b.md')] } });
    const { result, agent } = await run(args, {});
    expect(agent.calls).toHaveLength(0);
    expect(result.records.map((r) => [r.depth, r.outcome])).toEqual([['none', 'not-reviewed'], ['none', 'not-reviewed']]);
  });

  it('does not apply to a comprehensive run', async () => {
    const { agent } = await run(baseArgs({ mode: 'comprehensive', window: { commits: 0 } }), { 'docs/PRD/a.md': 50 });
    expect(agent.calls.length).toBeGreaterThan(0);
  });
});

describe('audit-docs Opus review', () => {
  it.each([
    ['prd', ['requirements', 'sections', 'paths']],
    ['trd', ['tasks', 'sections', 'paths']],
  ])('%s: exactly three verifiers, then one apply agent, all on opus', async (cls, keys) => {
    const path = `docs/${cls.toUpperCase()}/x.md`;
    const args = baseArgs({ batch: { key: cls, chunk: 0, docs: [doc(path, cls)] } });
    const { agent, result } = await run(args, { [path]: 95 });
    const calls = agent.calls.map((c) => c.opts.label);
    expect(calls).toEqual([`score:${path}`, ...keys.map((k) => `verify:${k}:${path}`), `apply:${path}`]);
    for (const c of agent.calls.slice(1)) expect(c.opts.model).toBe('opus');
    expect(result.records[0]).toMatchObject({ depth: 'opus', outcome: 'edited', mapWritten: true });
  });

  it('runs the apply agent only after all three verifiers finished', async () => {
    const { agent } = await run(baseArgs(), { 'docs/PRD/a.md': 95 });
    const order = agent.calls.map((c) => String(c.opts.label).split(':')[0]);
    expect(order.lastIndexOf('verify')).toBeLessThan(order.indexOf('apply'));
  });

  it('hands the verifiers findings to the apply agent and names a missing verifier', async () => {
    const { agent } = await run(baseArgs(), { 'docs/PRD/a.md': 95 }, {
      'verify:requirements:docs/PRD/a.md': { findings: [{ section: 'S1', claim: 'CLAIM-XYZ', why: 'w' }] },
      'verify:paths:docs/PRD/a.md': undefined,
    });
    const apply = agent.calls.find((c) => c.opts.label === 'apply:docs/PRD/a.md');
    expect(apply.prompt).toContain('CLAIM-XYZ');
    expect(apply.prompt).toMatch(/returned nothing: paths/);
  });

  it('still reports the doc when the apply agent returns a record', async () => {
    const { result, agent } = await run(baseArgs(), { 'docs/PRD/a.md': 95 }, {
      'verify:paths:docs/PRD/a.md': undefined, 'verify:sections:docs/PRD/a.md': undefined, 'verify:requirements:docs/PRD/a.md': undefined,
    });
    expect(labels(agent, 'apply:')).toHaveLength(1);
    expect(result.dead).toEqual([]);
  });

  it('keeps unbuilt only for a PRD and statusCorrection only for a TRD', async () => {
    const rec = { outcome: 'edited', unbuilt: [{ id: 'R1', statement: 's' }], statusCorrection: { from: 'Draft', to: 'Done' } };
    const args = baseArgs({ batch: { key: 'm', chunk: 0, docs: [doc('docs/PRD/a.md', 'prd'), doc('docs/TRD/b.md', 'trd')] } });
    const { result } = await run(args, { 'docs/PRD/a.md': 95, 'docs/TRD/b.md': 95 }, { 'apply:docs/PRD/a.md': rec, 'apply:docs/TRD/b.md': rec });
    expect(result.records[0].unbuilt).toHaveLength(1);
    expect(result.records[0].statusCorrection).toBeNull();
    expect(result.records[1].unbuilt).toEqual([]);
    expect(result.records[1].statusCorrection).toEqual({ from: 'Draft', to: 'Done' });
  });
});

describe('audit-docs sonnet and loose docs', () => {
  it('sonnet depth is one agent on sonnet', async () => {
    const { agent } = await run(baseArgs(), { 'docs/PRD/a.md': 50 });
    const review = agent.calls.filter((c) => !String(c.opts.label).startsWith('score:'));
    expect(review).toHaveLength(1);
    expect(review[0].opts.model).toBe('sonnet');
  });

  it('a loose batch dispatches no scorer: one sonnet agent per file, even in a light-looking mode', async () => {
    const args = baseArgs({ mode: 'comprehensive', batch: { key: 'loose:guides', chunk: 0, docs: [doc('docs/guides/a.md', 'loose'), doc('docs/guides/b.md', 'loose')] } });
    const { agent, result } = await run(args, {});
    expect(labels(agent, 'score:')).toEqual([]);
    expect(agent.calls.map((c) => c.opts.model)).toEqual(['sonnet', 'sonnet']);
    expect(result.records.every((r) => r.depth === 'sonnet' && r.score === null)).toBe(true);
  });

  it('a non-text loose file can only be kept or proposed for removal', async () => {
    const args = baseArgs({ mode: 'comprehensive', batch: { key: 'loose:img', chunk: 0, docs: [doc('docs/img/a.png', 'loose', { text: false })] } });
    const { result, agent } = await run(args, {}, { 'review:docs/img/a.png': { outcome: 'edited' } });
    expect(result.records[0].outcome).toBe('kept');
    expect(agent.calls[0].prompt).toMatch(/non-text/);
    const rm = await run(args, {}, { 'review:docs/img/a.png': { outcome: 'remove-proposed', removeReason: 'orphan' } });
    expect(rm.result.records[0]).toMatchObject({ outcome: 'remove-proposed', removeReason: 'orphan' });
  });
});

describe('audit-docs dead agents and shape', () => {
  it('a dead review agent is failed and listed in dead', async () => {
    const args = baseArgs({ batch: { key: 'prd', chunk: 2, docs: [doc('docs/PRD/a.md'), doc('docs/PRD/b.md')] } });
    const { result, logs } = await run(args, { 'docs/PRD/a.md': 50, 'docs/PRD/b.md': 50 }, { 'review:docs/PRD/a.md': undefined });
    expect(result.dead).toEqual(['docs/PRD/a.md']);
    expect(result.records[0].outcome).toBe('failed');
    expect(result.records[1].outcome).toBe('edited');
    expect(logs.join('\n')).toContain('docs/PRD/a.md');
    expect(result.batch).toEqual({ key: 'prd', chunk: 2 });
  });

  it('a dead opus apply agent is failed and listed in dead', async () => {
    const { result } = await run(baseArgs(), { 'docs/PRD/a.md': 95 }, { 'apply:docs/PRD/a.md': undefined });
    expect(result.dead).toEqual(['docs/PRD/a.md']);
    expect(result.records[0]).toMatchObject({ depth: 'opus', outcome: 'failed' });
  });

  it('returns one record per doc, in batch order', async () => {
    const docs = ['c', 'a', 'b'].map((n) => doc(`docs/PRD/${n}.md`));
    const { result } = await run(baseArgs({ batch: { key: 'prd', chunk: 0, docs } }), {});
    expect(result.records.map((r) => r.path)).toEqual(docs.map((d) => d.path));
  });

  it('accepts args as a JSON string', async () => {
    const { result } = await run(JSON.stringify(baseArgs()), { 'docs/PRD/a.md': 5 });
    expect(result.records).toHaveLength(1);
  });

  it('rejects a missing batch', async () => {
    await expect(run({ assemblyPath: 'x', thresholds: { high: 70, medium: 40 } })).rejects.toThrow(/batch\.docs/);
  });

  it('gives every agent an agentType or model', async () => {
    const { agent } = await run(baseArgs(), { 'docs/PRD/a.md': 95 });
    expect(unpinnedLabels(agent)).toEqual([]);
  });
});

describe('audit-docs batch isolation', () => {
  it('no agent prompt names a doc outside its own', async () => {
    const paths = ['docs/PRD/alpha.md', 'docs/PRD/bravo.md', 'docs/PRD/charlie.md'];
    const { agent } = await run(baseArgs({ batch: { key: 'prd', chunk: 0, docs: paths.map((p) => doc(p)) } }),
      { 'docs/PRD/alpha.md': 95, 'docs/PRD/bravo.md': 50, 'docs/PRD/charlie.md': 5 });
    expect(agent.calls.length).toBeGreaterThan(0);
    for (const c of agent.calls) {
      const mine = paths.find((p) => String(c.opts.label).endsWith(p));
      expect(mine).toBeDefined();
      for (const other of paths.filter((p) => p !== mine)) expect(c.prompt).not.toContain(other);
    }
  });

  it('reads the assembly and contract by path rather than inlining them', async () => {
    const { agent } = await run(baseArgs(), { 'docs/PRD/a.md': 95 });
    for (const c of agent.calls) expect(c.prompt).toContain('/repo/.trd-state/_docs-audit/work/r/assembly.json');
  });
});

describe('audit-docs cross-repo claims (AC-F12.1)', () => {
  const CROSS = [{ claim: 'the billing service retries 3 times', path: 'other-repo/billing/retry.js' }];

  it('carries a reviewer-reported crossRepo claim through to the returned record unchanged', async () => {
    const { result } = await run(baseArgs(), { 'docs/PRD/a.md': 50 }, {
      'review:docs/PRD/a.md': { outcome: 'kept', corrections: [], cuts: [], crossRepo: CROSS, mapWritten: false },
    });
    const rec = result.records[0];
    expect(rec.crossRepo).toEqual(CROSS);
    // reported, not corrected and not cut
    expect(rec.corrections).toEqual([]);
    expect(rec.cuts).toEqual([]);
  });

  it('defaults crossRepo to an empty list when the reviewer reports none', async () => {
    const { result } = await run(baseArgs(), { 'docs/PRD/a.md': 50 });
    expect(result.records[0].crossRepo).toEqual([]);
  });
});
