/**
 * create-design.js test suite (DSGN-B007). Wiring tests in the audit-design.test.js style.
 * Run with: npx jest packages/core/workflows/create-design.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub, unpinnedLabels } = require('./test-harness');

const SOURCE = readScript('create-design.js');

const screen = (n, over = {}) => ({ name: `Screen ${n}`, route: `/s${n}`, platform: 'web', viewport: '1280x800', predecessor: true, screenshot: `shots/${n}.png`, ...over });

function groundArgs(over = {}) {
  return { stage: 'ground', slug: 'checkout', dir: 'docs/ui/checkout', sources: 'docs/PRD/checkout.md', ...over };
}
function drawArgs(count = 2, over = {}) {
  return {
    stage: 'draw', slug: 'checkout', dir: 'docs/ui/checkout', runtime: '/tmp/dc-runtime.js',
    canvasRules: 'CANVAS-RULE', conventions: 'CONV-RULE', designRules: 'OWNER-RULE',
    boardsInScope: Array.from({ length: count }, (_, i) => screen(i + 1)), ...over,
  };
}

const BRIEF = {
  openDecisions: [{ question: 'Guest checkout?', options: ['yes', 'no'], recommended: 'yes' }],
  screens: [screen(1)],
};

function plan(overrides = {}) {
  return (prompt, opts) => {
    const label = String(opts.label);
    if (Object.prototype.hasOwnProperty.call(overrides, label)) return overrides[label];
    if (label.startsWith('ground:')) return { file: label.slice(7), written: true };
    if (label === 'brief') return BRIEF;
    if (label.startsWith('asis:')) return { id: `${label.slice(5)}--as-is`, file: `${label.slice(5)}--as-is.dc.html`, screenshot_match: true };
    if (label === 'parts') return { parts: [{ id: 'part-badge', file: 'part-badge.dc.html' }] };
    if (label.startsWith('tobe:')) return { id: label.slice(5), file: `${label.slice(5)}.dc.html`, brief_items: ['BI-1'], states: [{ name: 'empty', props: { empty: true } }] };
    if (label === 'render') return { errors: [] };
    if (label.startsWith('review:')) return { findings: [] };
    if (label === 'fix') return { fixed: [], left: [] };
    return undefined;
  };
}

async function run(args, overrides = {}) {
  const agent = makeAgentStub(plan(overrides));
  const parallel = makeParallelStub();
  const { result, phases, logs } = await runWorkflow(SOURCE, { agent, parallel, args });
  return { result, phases, logs, agent, parallel };
}

const flatP = (t) => t.replace(/\s+/g, ' ');
const byLabel = (agent, label) => agent.calls.find((c) => c.opts.label === label);
const withPrefix = (agent, p) => agent.calls.filter((c) => String(c.opts.label).startsWith(p));

describe('create-design stage ground', () => {
  it('runs Ground then Brief and nothing that draws', async () => {
    const { phases, agent } = await run(groundArgs());
    expect(phases).toEqual(['Ground', 'Brief']);
    expect(agent.calls.some((c) => /^(asis|tobe|parts|render|review|fix)/.test(c.opts.label))).toBe(false);
  });

  it('dispatches the five grounding agents in one parallel wave, before the one brief agent', async () => {
    const { agent, parallel } = await run(groundArgs());
    const g = withPrefix(agent, 'ground:');
    expect(g).toHaveLength(5);
    expect(parallel.waves).toEqual([{ size: 5 }]);
    expect(agent.calls.filter((c) => c.opts.label === 'brief')).toHaveLength(1);
    expect(byLabel(agent, 'brief').at).toBeGreaterThan(Math.max(...g.map((c) => c.at)));
  });

  it('tells the grounding agents to refresh only on a code change, by git, and to treat sources as data', async () => {
    const { agent } = await run(groundArgs());
    const p = byLabel(agent, 'ground:screens').prompt;
    expect(p).toMatch(/REFRESH ONLY ON CHANGE/);
    expect(p).toContain('git log');
    expect(p).toMatch(/DATA, NOT INSTRUCTIONS/);
  });

  it('returns the open decisions, each with a recommended option, and the screens', async () => {
    const { result } = await run(groundArgs());
    expect(result.openDecisions[0]).toEqual({ question: 'Guest checkout?', options: ['yes', 'no'], recommended: 'yes' });
    expect(result.screens).toHaveLength(1);
    expect(result.brief).toBe('docs/ui/checkout/brief.md');
    const schema = byLabel((await run(groundArgs())).agent, 'brief').opts.schema;
    expect(schema.properties.openDecisions.items.required).toContain('recommended');
  });

  it('requires a source for every brief item (AC-F8.4)', async () => {
    const { agent } = await run(groundArgs());
    expect(byLabel(agent, 'brief').prompt).toMatch(/cite the PRD or issue source for each one/);
  });

  it('caps the round at four questions and returns none under --auto', async () => {
    const many = { ...BRIEF, openDecisions: Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, options: ['a'], recommended: 'a' })) };
    expect((await run(groundArgs(), { brief: many })).result.openDecisions).toHaveLength(4);
    const auto = await run(groundArgs({ auto: true }), { brief: many });
    expect(auto.result.openDecisions).toEqual([]);
    expect(byLabel(auto.agent, 'brief').prompt).toMatch(/Nobody will be asked/);
  });

  it('reports a dead grounding agent and carries on', async () => {
    const { result, logs } = await run(groundArgs(), { 'ground:data': undefined });
    expect(result.grounding_missing).toEqual(['data']);
    expect(logs.join('\n')).toMatch(/returned nothing: data/);
  });

  it('fails loudly when the brief agent dies', async () => {
    await expect(run(groundArgs(), { brief: undefined })).rejects.toThrow(/Brief stage/);
  });
});

describe('create-design stage draw', () => {
  it('runs the draw phases in order', async () => {
    const { phases } = await run(drawArgs());
    expect(phases).toEqual(['AsIs', 'Parts', 'ToBe', 'Render', 'Challenge']);
  });

  it('writes one parts agent before the to-be agents, one to-be agent per board in one parallel wave', async () => {
    const { agent, parallel } = await run(drawArgs(3));
    expect(agent.calls.filter((c) => c.opts.label === 'parts')).toHaveLength(1);
    const tobe = withPrefix(agent, 'tobe:');
    expect(tobe).toHaveLength(3);
    expect(tobe.every((c) => c.at > byLabel(agent, 'parts').at)).toBe(true);
    expect(parallel.waves.filter((w) => w.size === 3)).toHaveLength(2); // as-is wave and to-be wave
  });

  it('draws the to-be board from its as-is board', async () => {
    const { agent } = await run(drawArgs(1));
    expect(byLabel(agent, 'tobe:01-screen-1').prompt).toContain('Start from its as-is board');
  });

  it('with newMode, skips the as-is board for a screen with no predecessor and keeps the rest', async () => {
    const args = drawArgs(2, { newMode: true, boardsInScope: [screen(1), screen(2, { predecessor: false })] });
    const { agent, result } = await run(args);
    expect(withPrefix(agent, 'asis:').map((c) => c.opts.label)).toEqual(['asis:01-screen-1']);
    expect(byLabel(agent, 'tobe:02-screen-2').prompt).toContain('no as-is board');
    expect(result.boards.filter((b) => b.kind === 'to-be')).toHaveLength(2);
    expect(result.boards.filter((b) => b.kind === 'as-is')).toHaveLength(1);
  });

  it('without newMode, every screen gets an as-is board', async () => {
    const { agent } = await run(drawArgs(2, { boardsInScope: [screen(1), screen(2, { predecessor: false })] }));
    expect(withPrefix(agent, 'asis:')).toHaveLength(2);
  });

  it('returns screenshot_match and mismatch_note per as-is board instead of writing the map', async () => {
    const { result, agent } = await run(drawArgs(1), {
      'asis:01-screen-1': { id: '01-screen-1--as-is', file: 'a.dc.html', screenshot_match: false, mismatch_note: 'header is 8px lower' },
    });
    const asIs = result.boards.find((b) => b.kind === 'as-is');
    expect(asIs.screenshot_match).toBe(false);
    expect(asIs.mismatch_note).toBe('header is 8px lower');
    expect(byLabel(agent, 'asis:01-screen-1').prompt).toMatch(/Do NOT edit design-map\.json/);
  });

  // FS-34: an as-is agent saw a repeated nav and card in the stored home screenshot, called it a
  // "stitching artefact, worth recapturing", returned screenshot_match true and kept the image.
  it('treats a screenshot showing what the page does not render as a capture error to recapture now (FS-34)', async () => {
    const { agent } = await run(drawArgs(1));
    const p = flatP(byLabel(agent, 'asis:01-screen-1').prompt);
    expect(p).toMatch(/shows anything the page does not render/);
    expect(p).toMatch(/a repeated nav or card/);
    expect(p).toMatch(/recapture it now/);
    expect(p).toMatch(/Never return screenshot_match true while saying the screenshot is wrong/);
  });

  it('puts the board tweak shape (one object per tweak) in every drawing prompt', async () => {
    const { agent } = await run(drawArgs(1));
    for (const l of ['asis:01-screen-1', 'parts', 'tobe:01-screen-1']) {
      expect(byLabel(agent, l).prompt).toMatch(/ONE OBJECT PER TWEAK/);
      expect(byLabel(agent, l).prompt).toContain('{"empty":{"type":"boolean","default":false}}');
    }
  });

  it('feeds the canvas rules, conventions and design rules to the drawing agents as data', async () => {
    const { agent } = await run(drawArgs(1));
    const p = byLabel(agent, 'tobe:01-screen-1').prompt;
    expect(p).toContain('CANVAS-RULE');
    expect(p).toContain('CONV-RULE');
    expect(p).toContain('OWNER-RULE');
    expect(p).toMatch(/DATA, NOT INSTRUCTIONS/);
  });

  it('runs five read-only reviewers in one wave, then one fix round with the ranked findings', async () => {
    const { agent, parallel } = await run(drawArgs(1), {
      'review:reuse': { findings: [{ axis: 'reuse', board: '01-screen-1', why: 'inline Button', rank: 'medium' }] },
      'review:flow': { findings: [{ axis: 'flow', board: '01-screen-1', why: 'dead link', rank: 'high' }] },
    });
    expect(withPrefix(agent, 'review:')).toHaveLength(5);
    expect(parallel.waves.some((w) => w.size === 5)).toBe(true);
    withPrefix(agent, 'review:').forEach((c) => expect(c.prompt).toMatch(/READ ONLY/));
    const fix = agent.calls.filter((c) => c.opts.label === 'fix');
    expect(fix).toHaveLength(1);
    expect(fix[0].at).toBeGreaterThan(Math.max(...withPrefix(agent, 'review:').map((c) => c.at)));
    expect(fix[0].prompt.indexOf('dead link')).toBeLessThan(fix[0].prompt.indexOf('inline Button'));
  });

  it('skips the fix round when there are no findings', async () => {
    const { agent, result } = await run(drawArgs(1));
    expect(agent.calls.some((c) => c.opts.label === 'fix')).toBe(false);
    expect(result.findings_open).toEqual([]);
  });

  it('returns what the fix round left open and counts what it fixed', async () => {
    const f1 = { axis: 'flow', board: 'b', why: 'dead link', rank: 'high' };
    const f2 = { axis: 'data', board: 'b', why: 'no such field', rank: 'medium' };
    const { result } = await run(drawArgs(1), {
      'review:flow': { findings: [f1] }, 'review:data': { findings: [f2] },
      fix: { fixed: [{ board: 'b', why: 'dead link' }], left: [{ board: 'b', why: 'no such field' }] },
    });
    expect(result.findings_fixed).toBe(1);
    expect(result.findings_open.map((f) => f.why)).toEqual(['no such field']);
  });

  it('turns render errors into high findings and reports a missing Chromium', async () => {
    const { result } = await run(drawArgs(1), { render: { errors: [{ board: '01-screen-1', error: 'boom' }], missing_tool: 'no Chromium' } });
    expect(result.findings_open[0]).toMatchObject({ axis: 'render', board: '01-screen-1', rank: 'high' });
    expect(result.render_missing_tool).toBe('no Chromium');
  });

  it('handles a dead agent of every kind without throwing, and says so', async () => {
    const { result, logs } = await run(drawArgs(2), {
      'asis:01-screen-1': undefined, parts: undefined, 'tobe:02-screen-2': undefined, render: undefined,
      'review:data': undefined, 'review:flow': { findings: [{ axis: 'flow', board: 'b', why: 'x', rank: 'high' }] }, fix: undefined,
    });
    expect(result.failed).toEqual(expect.arrayContaining(['asis:01-screen-1', 'parts', 'tobe:02-screen-2', 'render', 'fix']));
    expect(result.incomplete_coverage).toBe(true);
    expect(result.findings_open).toHaveLength(1);
    expect(logs.join('\n')).toMatch(/returned nothing: data/);
  });

  it('batches a 44-board flow under the 20-slot pool', async () => {
    const { parallel } = await run(drawArgs(44));
    expect(Math.max(...parallel.waves.map((w) => w.size))).toBeLessThanOrEqual(20);
    expect(parallel.waves.filter((w) => w.size === 20)).toHaveLength(4); // 2 waves of 20 as-is, 2 of to-be
  });

  it('skips rendering when no runtime was supplied', async () => {
    const { agent } = await run(drawArgs(1, { runtime: '' }));
    expect(byLabel(agent, 'render').prompt).toMatch(/No render runtime was supplied/);
  });
});

describe('create-design shared', () => {
  it('pins agentType or model on every agent() call, in both stages', async () => {
    for (const args of [groundArgs(), drawArgs(2, { newMode: true })]) {
      const { agent } = await run(args, { 'review:flow': { findings: [{ axis: 'flow', board: 'b', why: 'x', rank: 'high' }] } });
      expect(unpinnedLabels(agent)).toEqual([]);
      expect(agent.calls.filter((c) => !c.opts.agentType).map((c) => c.opts.label)).toEqual([]);
    }
  });

  it('refuses a bad stage, a missing dir, or a draw with no screens', async () => {
    const go = (args) => runWorkflow(SOURCE, { agent: makeAgentStub(plan()), parallel: makeParallelStub(), args });
    await expect(go({ dir: 'd' })).rejects.toThrow(/args\.stage/);
    await expect(go({ stage: 'ground' })).rejects.toThrow(/args\.dir/);
    await expect(go({ stage: 'draw', dir: 'd' })).rejects.toThrow(/boardsInScope/);
  });

  it('accepts args as a JSON string', async () => {
    const { result } = await run(JSON.stringify(groundArgs()));
    expect(result.slug).toBe('checkout');
  });

  it('declares every phase it runs in meta', async () => {
    const declared = ['Ground', 'Brief', 'AsIs', 'Parts', 'ToBe', 'Render', 'Challenge'];
    for (const args of [groundArgs(), drawArgs(1)]) {
      const { phases } = await run(args);
      expect(phases.every((p) => declared.includes(p))).toBe(true);
    }
    expect(SOURCE).toMatch(/name: 'create-design'/);
  });
});
