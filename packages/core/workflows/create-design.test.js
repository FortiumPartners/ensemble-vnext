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
    stage: 'draw', slug: 'checkout', dir: 'docs/ui/checkout',
    canvasRules: 'CANVAS-RULE', conventions: 'CONV-RULE', designRules: 'OWNER-RULE',
    direction: { latitude: 'refine', text: 'DIRECTION-TEXT' }, craft: 'CRAFT-TEXT', stylePack: { name: 'clean-product', text: 'PACK-TEXT' },
    rubric: 'RUBRIC-TEXT', floor: { contrast: 4.5, target: 44 },
    boardsInScope: Array.from({ length: count }, (_, i) => screen(i + 1)), ...over,
  };
}

const BRIEF = {
  openDecisions: [{ question: 'Guest checkout?', options: ['yes', 'no'], recommended: 'yes', why: 'The PRD is silent', weak: true, brief_items: ['S1'] }],
  items: [{ id: 'S1', source: 'AC-F3.1' }, { id: 'BI-1', source: 'AC-F3.2' }],
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
    if (label.startsWith('direction:')) {
      const m = /^direction:(.+)-([abc])$/.exec(label);
      return { id: `${m[1]}--dir-${m[2]}`, file: `${m[1]}--dir-${m[2]}.dc.html`, brief_items: ['BI-1'], states: [] };
    }
    if (label.startsWith('rank:')) return { ranking: [{ direction: 'b', reason: 'clearest hierarchy' }, { direction: 'a', reason: 'safe' }, { direction: 'c', reason: 'too far' }] };
    if (label.startsWith('visual:')) return { errors: [], measures: [], scores: [] };
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
    expect(agent.calls.some((c) => /^(asis|tobe|parts|visual|review|fix)/.test(c.opts.label))).toBe(false);
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
    expect(result.openDecisions[0]).toEqual({ id: 'OD-1', question: 'Guest checkout?', options: ['yes', 'no'], recommended: 'yes', why: 'The PRD is silent', weak: true, brief_items: ['S1'] });
    expect(result.items).toEqual(BRIEF.items);
    expect(result.screens).toHaveLength(1);
    expect(result.brief).toBe('docs/ui/checkout/brief.md');
    const schema = byLabel((await run(groundArgs())).agent, 'brief').opts.schema;
    expect(schema.properties.openDecisions.items.required).toContain('recommended');
  });

  it('requires a source for every brief item (AC-F8.4)', async () => {
    const { agent } = await run(groundArgs());
    expect(byLabel(agent, 'brief').prompt).toMatch(/cite the PRD or issue source for each one/);
  });

  it('returns every decision in both modes, uncapped, each with an OD-n id from OD-1 on a new brief', async () => {
    const many = { ...BRIEF, openDecisions: Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, options: ['a'], recommended: 'a', why: 'w', weak: false, brief_items: [] })) };
    for (const over of [{}, { auto: true }]) {
      const { result } = await run(groundArgs(over), { brief: many });
      expect(result.openDecisions).toHaveLength(6);
      expect(result.openDecisions.map((d) => d.id)).toEqual(['OD-1', 'OD-2', 'OD-3', 'OD-4', 'OD-5', 'OD-6']);
      expect(result.openDecisions[2]).toMatchObject({ question: 'q2', options: ['a'], recommended: 'a' });
    }
  });

  it('numbers decisions from odNext, the first OD-n free in an existing brief', async () => {
    const two = { ...BRIEF, openDecisions: [0, 1].map((i) => ({ question: `q${i}`, options: ['a'], recommended: 'a', why: 'w', weak: false, brief_items: [] })) };
    const { result } = await run(groundArgs({ auto: true, odNext: 4 }), { brief: two });
    expect(result.openDecisions.map((d) => d.id)).toEqual(['OD-4', 'OD-5']);
    const str = await run(groundArgs({ auto: true, odNext: '4' }), { brief: two });
    expect(str.result.openDecisions.map((d) => d.id)).toEqual(['OD-4', 'OD-5']);
    for (const bad of [0, -2, 'x', 1.5, '']) {
      const r = await run(groundArgs({ auto: true, odNext: bad }), { brief: two });
      expect(r.result.openDecisions.map((d) => d.id)).toEqual(['OD-1', 'OD-2']);
    }
  });

  it('requires why, weak, brief_items and items in the brief schema', async () => {
    const { schema } = byLabel((await run(groundArgs())).agent, 'brief').opts;
    expect(schema.required).toContain('items');
    expect(schema.properties.openDecisions.items.required).toEqual(expect.arrayContaining(['why', 'weak', 'brief_items']));
    expect(schema.properties.items.items.required).toEqual(['id', 'source']);
  });

  it('keeps a source id only when it labels exactly one item, with unique ids', async () => {
    const p = flatP(byLabel((await run(groundArgs())).agent, 'brief').prompt);
    expect(p).toMatch(/unique id/);
    expect(p).toMatch(/Keep the id the source gives it/);
    expect(p).toMatch(/labels exactly one item/);
    expect(p).not.toContain('Give every brief item an id (BI-1, BI-2, ...)');
    expect(p).toContain('items: [{ id, source }]');
  });

  it('does not write open decisions into brief.md and keeps an existing decisions section', async () => {
    for (const over of [{}, { auto: true }]) {
      const p = flatP(byLabel((await run(groundArgs(over))).agent, 'brief').prompt);
      expect(p).toMatch(/Do not write open decisions into brief\.md/);
      expect(p).toContain('## Decisions taken by default');
      expect(p).toMatch(/word for word/);
      expect(p).not.toMatch(/Nobody will be asked/);
    }
  });

  it('names no product or orchestrator in the auto brief prompt', async () => {
    const p = byLabel((await run(groundArgs({ auto: true }))).agent, 'brief').prompt;
    expect(p).not.toMatch(/forge|orchestrator/i);
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
    expect(phases).toEqual(['AsIs', 'Parts', 'ToBe', 'Critique', 'Challenge']);
  });

  it('writes one parts agent before the to-be agents, one to-be agent per board in one parallel wave', async () => {
    const { agent, parallel } = await run(drawArgs(3));
    expect(agent.calls.filter((c) => c.opts.label === 'parts')).toHaveLength(1);
    const tobe = withPrefix(agent, 'tobe:');
    expect(tobe).toHaveLength(3);
    expect(tobe.every((c) => c.at > byLabel(agent, 'parts').at)).toBe(true);
    expect(parallel.waves.filter((w) => w.size === 3)).toHaveLength(2); // as-is wave and to-be wave
    expect(parallel.waves.filter((w) => w.size === 4)).toHaveLength(1); // 3 screens + the parts agent
  });

  it('requires brief_items from every to-be draw agent', async () => {
    const { agent } = await run(drawArgs(1));
    expect(byLabel(agent, 'tobe:01-screen-1').opts.schema.required).toContain('brief_items');
  });

  it('gives each to-be agent the recorded brief item ids as the only ids it may return', async () => {
    const { agent } = await run(drawArgs(1, { items: [{ id: 'S1', source: 'AC-F3.1' }, { id: 'BI-1', source: 'AC-F3.2' }] }));
    const p = flatP(byLabel(agent, 'tobe:01-screen-1').prompt);
    expect(p).toContain('S1');
    expect(p).toContain('BI-1');
    expect(p).toMatch(/only ids/i);
    expect(byLabel(agent, 'tobe:01-screen-1').opts.schema.properties.brief_items.items.enum).toEqual(['S1', 'BI-1']);
  });

  it('tells the to-be agent to return an empty list when no ids were recorded', async () => {
    const { agent } = await run(drawArgs(1));
    expect(flatP(byLabel(agent, 'tobe:01-screen-1').prompt)).toMatch(/no brief item ids/i);
  });

  it('reads the as-is board for components and data, and draws within the departure latitude (D12)', async () => {
    const { agent } = await run(drawArgs(1));
    const p = flatP(byLabel(agent, 'tobe:01-screen-1').prompt);
    expect(p).not.toContain('Start from its as-is board');
    expect(p).toContain('for the components, content and data it shows');
    expect(p).toContain('departure latitude, refine: keep the information architecture and navigation');
  });

  it('puts the direction, craft and style pack in every as-is, parts, to-be and fix prompt', async () => {
    const { agent } = await run(drawArgs(1), { 'review:flow': { findings: [{ axis: 'flow', board: 'b', why: 'x', rank: 'high' }] } });
    for (const l of ['asis:01-screen-1', 'parts', 'tobe:01-screen-1', 'fix']) {
      const p = byLabel(agent, l).prompt;
      expect(p).toContain('DESIGN DIRECTION');
      expect(p).toContain('DIRECTION-TEXT');
      expect(p).toContain('CRAFT-TEXT');
      expect(p).toContain('STYLE PACK (clean-product)');
      expect(p).toContain('PACK-TEXT');
    }
  });

  it('tells the as-is agent the direction, pack and latitude change nothing the screenshot shows (D8)', async () => {
    const p = flatP(byLabel((await run(drawArgs(1))).agent, 'asis:01-screen-1').prompt);
    expect(p).toMatch(/change nothing the screenshot shows/);
  });

  it('gives the reuse reviewer the latitude and the layout-is-not-reuse sentence, and keeps the cluttered ban', async () => {
    const { agent } = await run(drawArgs(1));
    const reuse = flatP(byLabel(agent, 'review:reuse').prompt);
    expect(reuse).toContain('a layout change the latitude permits is not a reuse finding; reuse is about components and tokens');
    expect(reuse).toContain('refine');
    expect(flatP(byLabel(agent, 'review:flow').prompt)).toContain('FORBIDDEN');
  });

  it('runs one opus visual agent per screen plus one for parts, none writing into the design folder', async () => {
    const { agent } = await run(drawArgs(2));
    const v = withPrefix(agent, 'visual:');
    expect(v.map((c) => c.opts.label).sort()).toEqual(['visual:01-screen-1', 'visual:02-screen-2', 'visual:parts']);
    v.forEach((c) => {
      expect(c.opts.model).toBe('opus');
      expect(c.opts.agentType).toBe('code-reviewer');
      expect(c.prompt).not.toMatch(/--out docs\/ui\/checkout/);
      expect(c.prompt).toContain('--floor-contrast 4.5 --floor-target 44');
      expect(c.prompt).not.toMatch(/--runtime/);
    });
    expect(flatP(byLabel(agent, 'visual:01-screen-1').prompt)).toContain('RUBRIC-TEXT');
    expect(byLabel(agent, 'visual:01-screen-1').prompt).toContain('01-screen-1--as-is');
    expect(byLabel(agent, 'visual:parts').prompt).toContain('part-badge');
  });

  it('dispatches 25 screens and the parts agent in waves of 20 and 6', async () => {
    const { parallel } = await run(drawArgs(25));
    const sizes = parallel.waves.map((w) => w.size);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
    expect(sizes.filter((n) => n === 6)).toHaveLength(1);
  });

  it('maps measured and critique findings to ranks in code, ignoring any rank the agent gives', async () => {
    const { result } = await run(drawArgs(1), {
      'visual:01-screen-1': {
        errors: [{ board: '01-screen-1', error: 'boom' }],
        measures: [
          { board: '01-screen-1', check: 'contrast', verdict: 'below-floor', value: 3.1, element: 'button.pay', rank: 'low' },
          { board: '01-screen-1', check: 'layout', verdict: 'fault', detail: 'clipped-text', value: 'x', element: 'h1' },
          { board: '01-screen-1', check: 'contrast', verdict: 'not-measured', value: null },
        ],
        scores: [
          { board: '01-screen-1', dimension: 'Hierarchy', judged: true, score: 1, element: 'hero', change: 'enlarge' },
          { board: '01-screen-1', dimension: 'Craft', judged: true, score: 2, element: 'body', change: 'raise size' },
          { board: '01-screen-1', dimension: 'Density', judged: true, score: 3, element: 'list', change: 'space' },
          { board: '01-screen-1', dimension: 'Consistency', judged: true, score: 4 },
          { board: '01-screen-1', dimension: 'States', judged: false },
        ],
      },
    });
    const by = (axis) => result.findings_open.filter((f) => f.axis === axis);
    expect(by('render')).toEqual([expect.objectContaining({ rank: 'high', why: 'render error: boom' })]);
    expect(by('measure').map((f) => f.rank).sort()).toEqual(['high', 'medium']);
    expect(by('critique').map((f) => f.rank).sort()).toEqual(['high', 'low', 'medium']);
    expect(result.findings_open.some((f) => /Consistency|States/.test(f.why))).toBe(false);
    expect(result.critique.find((c) => c.screen === '01-screen-1').scores).toHaveLength(5);
  });

  it('lists the boards of a dead visual agent in critique_not_run and flags incomplete coverage', async () => {
    const { result } = await run(drawArgs(2), { 'visual:02-screen-2': undefined });
    expect(result.critique_not_run).toEqual(['02-screen-2--as-is', '02-screen-2']);
    expect(result.incomplete_coverage).toBe(true);
    expect(result.failed).toContain('visual:02-screen-2');
  });

  it('lists a screen as not critiqued when its visual agent found no render tool', async () => {
    const { result } = await run(drawArgs(1), { 'visual:01-screen-1': { errors: [], measures: [], scores: [], missing_tool: 'no Chromium' } });
    expect(result.critique_not_run).toEqual(['01-screen-1--as-is', '01-screen-1']);
    expect(result.render_missing_tool).toBe('no Chromium');
    expect(result.incomplete_coverage).toBe(true);
    expect(result.critique).toEqual(expect.not.arrayContaining([expect.objectContaining({ screen: '01-screen-1' })]));
  });

  it('carries no skip-rendering branch and no runtime flag in the render command', async () => {
    const { agent } = await run(drawArgs(1));
    for (const c of agent.calls) expect(c.prompt).not.toMatch(/skip rendering|--runtime/);
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

  it('handles a dead agent of every kind without throwing, and says so', async () => {
    const { result, logs } = await run(drawArgs(2), {
      'asis:01-screen-1': undefined, parts: undefined, 'tobe:02-screen-2': undefined, 'visual:01-screen-1': undefined,
      'review:data': undefined, 'review:flow': { findings: [{ axis: 'flow', board: 'b', why: 'x', rank: 'high' }] }, fix: undefined,
    });
    expect(result.failed).toEqual(expect.arrayContaining(['asis:01-screen-1', 'parts', 'tobe:02-screen-2', 'visual:01-screen-1', 'fix']));
    expect(result.incomplete_coverage).toBe(true);
    expect(result.findings_open).toHaveLength(1);
    expect(logs.join('\n')).toMatch(/returned nothing: data/);
  });

  it('batches a 44-board flow under the 20-slot pool', async () => {
    const { parallel } = await run(drawArgs(44));
    expect(Math.max(...parallel.waves.map((w) => w.size))).toBeLessThanOrEqual(20);
    expect(parallel.waves.filter((w) => w.size === 20)).toHaveLength(6); // 2 waves of 20 as-is, 2 of to-be, 2 of visual (44 screens + parts = 20, 20, 5)
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
    const declared = ['Ground', 'Brief', 'AsIs', 'Parts', 'ToBe', 'Critique', 'Rank', 'Challenge'];
    for (const args of [groundArgs(), drawArgs(1), drawArgs(1, { explore: true })]) {
      const { phases } = await run(args);
      expect(phases.every((p) => declared.includes(p))).toBe(true);
    }
    expect(SOURCE).toMatch(/name: 'create-design'/);
  });
});

describe('create-design stage draw with explore (D15)', () => {
  const ex = (count = 2, over = {}) => drawArgs(count, { explore: true, ...over });

  it('dispatches 6 direction, 6 screen visual (plus parts) and 2 rank agents for 2 screens, and no single to-be agent', async () => {
    const { agent, phases } = await run(ex(2));
    expect(withPrefix(agent, 'direction:')).toHaveLength(6);
    expect(withPrefix(agent, 'tobe:')).toHaveLength(0);
    expect(withPrefix(agent, 'visual:').filter((c) => c.opts.label !== 'visual:parts')).toHaveLength(6);
    expect(byLabel(agent, 'visual:parts')).toBeDefined();
    expect(withPrefix(agent, 'rank:')).toHaveLength(2);
    expect(phases).toEqual(['AsIs', 'Parts', 'ToBe', 'Critique', 'Rank', 'Challenge']);
  });

  it('names the letter, the emphasis and the file in each direction prompt, with the same direction and pack text', async () => {
    const { agent } = await run(ex(1));
    const ps = ['a', 'b', 'c'].map((l) => flatP(byLabel(agent, `direction:01-screen-1-${l}`).prompt));
    expect(ps[0]).toContain('01-screen-1--dir-a.dc.html');
    expect(ps[0]).toContain('direction A of 3');
    expect(ps[0]).toMatch(/as close to today's layout/);
    expect(ps[1]).toMatch(/hierarchy and composition/);
    expect(ps[2]).toMatch(/as far from today's layout/);
    ps.forEach((p) => { expect(p).toContain('DIRECTION-TEXT'); expect(p).toContain('PACK-TEXT'); expect(p).toContain('01-screen-1.dc.html'); });
  });

  it('ranks only after every visual agent has returned', async () => {
    const { agent } = await run(ex(2));
    const last = Math.max(...withPrefix(agent, 'visual:').map((c) => c.at));
    withPrefix(agent, 'rank:').forEach((c) => expect(c.at).toBeGreaterThan(last));
  });

  it('honours directions: 2 and clamps it to 2..3, coercing a string', async () => {
    expect(withPrefix((await run(ex(1, { directions: 2 }))).agent, 'direction:')).toHaveLength(2);
    expect(withPrefix((await run(ex(1, { directions: '2' }))).agent, 'direction:')).toHaveLength(2);
    expect(withPrefix((await run(ex(1, { directions: 9 }))).agent, 'direction:')).toHaveLength(3);
    expect(withPrefix((await run(ex(1, { directions: 1 }))).agent, 'direction:')).toHaveLength(2);
  });

  it('gives the rank agent the frames folder each visual agent returned, and returns the ranking, chosen and every direction record', async () => {
    const over = {};
    for (const l of ['a', 'b', 'c']) over[`visual:01-screen-1-${l}`] = { errors: [], measures: [], scores: [], out: `/tmp/frames-${l}` };
    const { agent, result } = await run(ex(1), over);
    const p = byLabel(agent, 'rank:01-screen-1').prompt;
    ['a', 'b', 'c'].forEach((l) => expect(p).toContain(`/tmp/frames-${l}`));
    expect(result.explore).toHaveLength(1);
    expect(result.explore[0]).toMatchObject({ screen: '01-screen-1', chosen: 'b' });
    expect(result.explore[0].ranking.map((r) => r.direction)).toEqual(['b', 'a', 'c']);
    expect(result.explore[0].directions.map((d) => d.id)).toEqual(['01-screen-1--dir-a', '01-screen-1--dir-b', '01-screen-1--dir-c']);
    expect(result.explore[0].directions[0]).toMatchObject({ file: expect.any(String), brief_items: ['BI-1'] });
    expect(result.boards.filter((b) => b.kind === 'to-be').map((b) => b.id)).toEqual(['01-screen-1--dir-b']);
  });

  it('sends findings for chosen directions only to the fix round, and scopes the reviewers', async () => {
    const f = (board) => ({ axis: 'flow', board, why: `w-${board}`, rank: 'high' });
    const { agent, result } = await run(ex(1), {
      'review:flow': { findings: [f('01-screen-1--dir-a'), f('01-screen-1--dir-b'), f('part-badge')] },
      'visual:01-screen-1-c': { errors: [{ board: '01-screen-1--dir-c', error: 'boom' }], measures: [], scores: [] },
    });
    const p = byLabel(agent, 'fix').prompt;
    expect(p).toContain('w-01-screen-1--dir-b');
    expect(p).toContain('w-part-badge');
    expect(p).not.toContain('--dir-a"');
    expect(p).not.toContain('boom');
    expect(result.findings_open.map((x) => x.board).sort()).toEqual(['01-screen-1--dir-b', 'part-badge']);
    const rv = flatP(byLabel(agent, 'review:consistency').prompt);
    expect(rv).toContain('Review ONLY these boards');
    expect(rv).toContain('01-screen-1--dir-b.dc.html');
    expect(rv).not.toMatch(/Review ONLY[^.]*dir-a\.dc/);
  });

  it('takes direction a and says so when the rank agent dies', async () => {
    const { result, logs } = await run(ex(1), { 'rank:01-screen-1': undefined });
    expect(result.explore[0].chosen).toBe('a');
    expect(result.explore[0].note).toMatch(/rank agent returned nothing: took direction a/);
    expect(result.failed).toContain('rank:01-screen-1');
    expect(result.boards.some((b) => b.id === '01-screen-1--dir-a')).toBe(true);
  });

  it('ignores a ranking that names no drawn direction', async () => {
    const { result } = await run(ex(1), { 'rank:01-screen-1': { ranking: [{ direction: 'c', reason: 'x' }] }, 'direction:01-screen-1-c': undefined });
    expect(result.explore[0].chosen).toBe('a');
    expect(result.failed).toContain('direction:01-screen-1-c');
  });

  it('skips the rank agent when only one direction came back', async () => {
    const { agent, result } = await run(ex(1), { 'direction:01-screen-1-a': undefined, 'direction:01-screen-1-c': undefined });
    expect(withPrefix(agent, 'rank:')).toHaveLength(0);
    expect(result.explore[0].chosen).toBe('b');
    expect(result.explore[0].note).toMatch(/only direction b/);
  });

  it('without explore the dispatch is the single to-be path and returns no explore', async () => {
    const { agent, result } = await run(drawArgs(2));
    expect(withPrefix(agent, 'direction:')).toHaveLength(0);
    expect(withPrefix(agent, 'rank:')).toHaveLength(0);
    expect(withPrefix(agent, 'tobe:')).toHaveLength(2);
    expect(result.explore).toBeUndefined();
    expect(flatP(byLabel(agent, 'review:flow').prompt)).not.toContain('Review ONLY');
  });
});
