/**
 * audit-design.js test suite (DSGN-B010). Wiring tests in the audit-trd.test.js style.
 * Run with: npx jest packages/core/workflows/audit-design.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub, unpinnedLabels } = require('./test-harness');

const SOURCE = readScript('audit-design.js');

const board = (n) => ({ id: `${String(n).padStart(2, '0')}-b`, file: `b${n}.dc.html`, kind: 'to-be', platform: 'web', viewport: '1280x800', status: 'draft' });
const mapWith = (count) => JSON.stringify({ boards: Array.from({ length: count }, (_, i) => board(i + 1)) });

function baseArgs(overrides = {}) {
  return {
    slug: 'checkout', dir: 'docs/ui/checkout', map: mapWith(2),
    conventions: 'RULE-ONE', runtime: '/tmp/dc-runtime.js', ...overrides,
  };
}

const INDEX = {
  brief_items: [{ id: 'BI-7', statement: 'order summary screen', line: '12' }],
  sources: [{ name: 'src/Cart.tsx', feeds: ['01-b'] }],
};
const NO_FINDINGS = { findings: [] };
const RECONCILED = { readout: 'VERDICT: safe to proceed', accepted: [], rejected: [], could_not_verify: [] };

function plan(overrides = {}) {
  return (prompt, opts) => {
    const label = String(opts.label);
    if (Object.prototype.hasOwnProperty.call(overrides, label)) return overrides[label];
    if (label === 'index') return INDEX;
    if (label.startsWith('verify:')) return NO_FINDINGS;
    if (label === 'reconcile') return RECONCILED;
    return undefined;
  };
}

async function audit(overrides = {}, args = baseArgs()) {
  const agent = makeAgentStub(plan(overrides));
  const parallel = makeParallelStub();
  const { result, phases, logs } = await runWorkflow(SOURCE, { agent, parallel, args });
  return { result, phases, logs, agent, parallel };
}

const byLabel = (agent, label) => agent.calls.find((c) => c.opts.label === label);
const verifiers = (agent) => agent.calls.filter((c) => String(c.opts.label).startsWith('verify:'));

describe('audit-design wiring', () => {
  it('runs index, verify and reconcile', async () => {
    const { phases } = await audit();
    expect(phases).toEqual(['Index', 'Verify', 'Reconcile']);
  });

  it('dispatches every verifier in one parallel wave, after the index', async () => {
    const { agent, parallel } = await audit();
    const v = verifiers(agent);
    expect(v.length).toBeGreaterThan(1);
    expect(parallel.waves).toHaveLength(1);
    expect(parallel.waves[0].size).toBe(v.length);
    const indexAt = byLabel(agent, 'index').at;
    expect(v.every((c) => c.at > indexAt)).toBe(true);
    expect(byLabel(agent, 'reconcile').at).toBeGreaterThan(Math.max(...v.map((c) => c.at)));
  });

  it('pins agentType or model on every agent() call', async () => {
    const { agent } = await audit();
    expect(unpinnedLabels(agent)).toEqual([]);
    expect(agent.calls.filter((c) => !c.opts.agentType).map((c) => c.opts.label)).toEqual([]);
  });

  it('feeds the brief items and the supplied conventions to the verifiers', async () => {
    const { agent } = await audit();
    expect(byLabel(agent, 'verify:traceability').prompt).toContain('BI-7');
    expect(byLabel(agent, 'verify:conventions-1').prompt).toContain('RULE-ONE');
  });

  it('tells every verifier and the reconcile agent that nothing may be edited', async () => {
    const { agent } = await audit();
    for (const c of agent.calls.filter((c) => c.opts.label !== 'index')) {
      expect(c.prompt).toMatch(/READ ONLY/);
    }
    expect(byLabel(agent, 'reconcile').prompt).toMatch(/EDIT NOTHING/);
    expect(byLabel(agent, 'reconcile').prompt).not.toMatch(/using Edit/i);
  });

  it('sends render output to a scratch folder, never under the design dir', async () => {
    const { agent } = await audit();
    const p = byLabel(agent, 'verify:render-1').prompt;
    expect(p).toContain('design-render.js render --dir docs/ui/checkout');
    expect(p).toMatch(/MUST NOT be docs\/ui\/checkout\/screens\/png/);
  });

  it('batches boards so a large design stays under the agent pool', async () => {
    const { agent } = await audit({}, baseArgs({ map: mapWith(44) }));
    expect(agent.calls.length).toBeLessThanOrEqual(20);
    expect(verifiers(agent).filter((c) => c.opts.label.startsWith('render-') || c.opts.label.startsWith('verify:render-')).length).toBeLessThanOrEqual(5);
  });
});

describe('audit-design findings and result', () => {
  const FINDINGS = {
    'verify:traceability': { findings: [
      { check: 'no-source', board: '02-b', line: '4', why: 'no source feeds 02-b', confidence: 'high' },
      { check: 'no-board', board: 'BI-7', line: '12', why: 'no board answers BI-7', confidence: 'high' },
    ] },
  };

  it('carries board-and-line findings into reconcile', async () => {
    const { agent } = await audit(FINDINGS);
    const p = byLabel(agent, 'reconcile').prompt;
    expect(p).toContain('no source feeds 02-b');
    expect(p).toContain('no board answers BI-7');
    expect(p).toContain('"line": "4"');
  });

  it('requires board, line and a refuting file in the schemas', async () => {
    const { agent } = await audit();
    const findingItem = byLabel(agent, 'verify:traceability').opts.schema.properties.findings.items;
    expect(findingItem.required).toEqual(expect.arrayContaining(['board']));
    expect(Object.keys(findingItem.properties)).toContain('line');
    expect(findingItem.properties.check.enum).toEqual(expect.arrayContaining(['no-source', 'no-board']));
    const rej = byLabel(agent, 'reconcile').opts.schema.properties.rejected.items;
    expect(rej.required).toContain('refuting_file');
  });

  it('tells reconcile a rejected finding must name the file that refutes it', async () => {
    const { agent } = await audit(FINDINGS);
    expect(byLabel(agent, 'reconcile').prompt).toMatch(/MUST carry refuting_file/);
  });

  it('returns the reconcile lists and no board edits', async () => {
    const { result } = await audit({
      ...FINDINGS,
      reconcile: {
        readout: 'VERDICT: proceed with these caveats: x',
        accepted: [{ board: '02-b', line: '4', why: 'no source' }],
        rejected: [{ board: 'BI-7', line: '12', why: 'wrong', refuting_file: 'docs/ui/checkout/b1.dc.html' }],
        could_not_verify: ['render not run'],
      },
    });
    expect(result.findings).toBe(2);
    expect(result.rejected[0].refuting_file).toBe('docs/ui/checkout/b1.dc.html');
    expect(result.could_not_verify).toEqual(['render not run']);
    expect(Object.keys(result).sort()).toEqual([
      'accepted', 'could_not_verify', 'dir', 'findings', 'incomplete_coverage', 'readout', 'rejected', 'slug', 'verifiers_reporting',
    ]);
  });

  it('passes the previous Could Not Verify rows to reconcile', async () => {
    const { agent } = await audit({}, baseArgs({ priorCnv: ['row from last run'] }));
    expect(byLabel(agent, 'reconcile').prompt).toContain('row from last run');
  });

  it('states system drift and an unrun stale check in coverage', async () => {
    const stale = await audit({}, baseArgs({ stale: { stale: true, changed_paths: ['a.tsx', 'b.tsx'] } }));
    expect(byLabel(stale.agent, 'reconcile').prompt).toContain('STALE: 2 component file(s)');
    // FS-27: the changed paths are named and drift is a finding line, never weighed away.
    expect(byLabel(stale.agent, 'reconcile').prompt).toContain('a.tsx, b.tsx');
    expect(byLabel(stale.agent, 'reconcile').prompt).toMatch(/SYSTEM OUT OF DATE/);
    const none = await audit();
    expect(byLabel(none.agent, 'reconcile').prompt).toContain('UNCHECKED');
  });

  it('reports incomplete coverage rather than treating a dead verifier as clean', async () => {
    const { result, agent, logs } = await audit({ 'verify:traceability': undefined });
    expect(result.incomplete_coverage).toBe(true);
    expect(logs.join('\n')).toMatch(/returned nothing/);
    expect(byLabel(agent, 'reconcile').prompt).toContain('NO REPORT FROM: traceability');
  });

  it('reports a design with no render runtime as a caveat finding, without running the render', async () => {
    const { agent } = await audit({}, baseArgs({ runtime: '' }));
    expect(byLabel(agent, 'verify:render-1').prompt).toMatch(/No render runtime was supplied/);
  });

  it('refuses to run without a dir or a map, or with a malformed map', async () => {
    const run = (args) => runWorkflow(SOURCE, { agent: makeAgentStub(plan()), parallel: makeParallelStub(), args });
    await expect(run({ map: mapWith(1) })).rejects.toThrow(/args\.dir/);
    await expect(run({ dir: 'd' })).rejects.toThrow(/args\.map/);
    await expect(run({ dir: 'd', map: '{nope' })).rejects.toThrow(/not valid JSON/);
  });

  it('accepts args as a JSON string', async () => {
    const { result } = await audit({}, JSON.stringify(baseArgs()));
    expect(result.slug).toBe('checkout');
  });

  it('fails loudly when the index agent dies', async () => {
    const agent = makeAgentStub(plan({ index: undefined }));
    await expect(runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs() })).rejects.toThrow(/Index stage/);
  });
});

describe('audit-design traceability from the map (DORCH-B005)', () => {
  const items = ['S1', 'S2', 'S3'].map((id, i) => ({ id, statement: id, line: String(i + 1) }))
  const idx = { ...INDEX, brief_items: items }
  const tb = (id, brief_items, extra = {}) => ({ ...board(1), id, kind: 'to-be', brief_items, ...extra })
  const mapOf = (boards, top) => JSON.stringify({ boards, ...(top ? { brief_items: top } : {}) })
  const run = (boards, o = {}, top) => audit({ index: idx, ...o }, baseArgs({ map: mapOf(boards, top) }))
  const accepted = (r) => byLabel(r.agent, 'reconcile').prompt

  it('flags an unserved item as no-board and a to-be board with [] or an unknown id as no-brief-item', async () => {
    const r = await run([tb('a', ['S1']), tb('b', ['S2']), tb('c', []), tb('d', ['S9'])])
    const p = accepted(r)
    expect(p).toContain('"check": "no-board"')
    expect(p).toContain("no board's brief_items names S3")
    expect(p).toContain('to-be board c records no brief item')
    expect(p).toContain('names S9, which the brief does not have')
    expect(r.result.findings).toBe(3)
    expect(p).not.toMatch(/Could Not Verify row saying so/)
  })

  it('yields nothing for part, as-is, flow and superseded boards, and counts any board as serving', async () => {
    const r = await run([
      tb('a', ['S1', 'S2', 'S3'], { kind: 'as-is' }),
      tb('p', [], { kind: 'part' }), tb('f', [], { kind: 'flow' }), tb('s', [], { status: 'superseded' }),
      tb('sh', ['S1'], { status: 'shipped' }),
    ])
    expect(r.result.findings).toBe(0)
  })

  it('stops asking the traceability verifier for no-board on this path', async () => {
    const r = await run([tb('a', ['S1'])])
    const p = byLabel(r.agent, 'verify:traceability').prompt
    expect(p).not.toMatch(/no-board:\s+a brief item/)
    expect(p).toContain('no-source:')
  })

  it("reads the map's top-level item list when recorded, else the index", async () => {
    const r = await run([tb('a', ['S1'])], {}, [{ id: 'S1', source: 'x' }, { id: 'Z7', source: 'y' }])
    expect(accepted(r)).toContain("names Z7")
    expect(accepted(r)).not.toContain('names S3')
  })

  it('skips the board side and says so when the index is empty', async () => {
    const r = await run([tb('a', ['S1'])], { index: { ...INDEX, brief_items: [] } })
    expect(r.result.findings).toBe(0)
    expect(accepted(r)).toMatch(/item list came back empty/)
  })

  it('falls back to the verifier when no board records the field, with a Could Not Verify instruction', async () => {
    const r = await audit({ index: idx }, baseArgs())
    expect(byLabel(r.agent, 'verify:traceability').prompt).toMatch(/no-board:\s+a brief item/)
    expect(accepted(r)).toMatch(/Could Not Verify row saying so/)
    expect(r.result.findings).toBe(0)
  })

  it('carries the new check value, the heading, and the Index id instruction', async () => {
    const r = await run([tb('a', ['S1'])])
    expect(byLabel(r.agent, 'verify:traceability').opts.schema.properties.findings.items.properties.check.enum).toContain('no-brief-item')
    expect(accepted(r)).toContain('BOARDS SERVING NO BRIEF ITEM')
    expect(byLabel(r.agent, 'index').prompt).toMatch(/copy the id the brief itself gives the item/)
  })
})

describe('audit-design --drift (DSGN-B015)', () => {
  const shipped = { id: '09-s', file: 's.dc.html', kind: 'to-be', platform: 'web', viewport: '1280x800', status: 'shipped', shipped_commit: 'abc1234' };
  const asIs = { id: '10-a', file: 'a.dc.html', kind: 'as-is', platform: 'web', viewport: '1280x800', status: 'approved' };
  const driftArgs = (o = {}) => baseArgs({
    map: JSON.stringify({ boards: [board(1), shipped, asIs] }), drift: true,
    routes: ['/cart', '/orders'], capture: 'CAPTURE-TEXT', rubric: 'RUBRIC-TEXT',
    systemVersions: { installed: 'v1', current: 'v2' }, ...o,
  });

  it('without drift the verifier set and count are unchanged', async () => {
    const { agent, result } = await audit({}, baseArgs({ map: JSON.stringify({ boards: [board(1), shipped, asIs] }) }));
    expect(verifiers(agent).filter((c) => c.opts.label.includes('drift'))).toEqual([]);
    expect(result.verifiers_reporting).toBe(`${verifiers(agent).length}/${verifiers(agent).length}`);
    expect(result).not.toHaveProperty('undesigned_screens');
  });

  it('drift: true adds the four drift verifiers to the one parallel wave', async () => {
    const base = await audit({}, baseArgs());
    const { agent, parallel } = await audit({}, driftArgs());
    const labels = verifiers(agent).map((c) => c.opts.label);
    expect(labels).toEqual(expect.arrayContaining(['verify:drift-boards-1', 'verify:drift-system', 'verify:drift-code', 'verify:drift-undesigned']));
    expect(parallel.waves).toHaveLength(1);
    expect(parallel.waves[0].size).toBe(labels.length);
    expect(labels.length).toBeGreaterThan(verifiers(base.agent).length);
  });

  it('compares only shipped and as-is boards, with fresh captures sent outside the design dir', async () => {
    const { agent } = await audit({}, driftArgs());
    const p = byLabel(agent, 'verify:drift-boards-1').prompt;
    expect(p).toContain('09-s');
    expect(p).toContain('10-a');
    expect(p).not.toContain('"01-b"');
    expect(p).toMatch(/MUST NOT be under docs\/ui\/checkout/);
    expect(p).toContain('CAPTURE-TEXT');
    expect(p).toMatch(/never staging or production/);
  });

  it('gives the system verifier both versions, and reports a missing comparison rather than skipping it', async () => {
    const { agent } = await audit({}, driftArgs());
    const p = byLabel(agent, 'verify:drift-system').prompt;
    expect(p).toContain('v1');
    expect(p).toContain('v2');
    const none = await audit({}, driftArgs({ systemVersions: null }));
    expect(byLabel(none.agent, 'verify:drift-system').prompt).toMatch(/not compared: no versions supplied/);
  });

  it('checks code changed since each shipped commit, and routes with no board', async () => {
    const { agent } = await audit({}, driftArgs());
    expect(byLabel(agent, 'verify:drift-code').prompt).toContain('abc1234');
    const u = byLabel(agent, 'verify:drift-undesigned').prompt;
    expect(u).toContain('/orders');
    const none = await audit({}, driftArgs({ routes: [] }));
    expect(byLabel(none.agent, 'verify:drift-undesigned').prompt).toMatch(/not checked: no route list supplied/);
  });

  it('keeps every drift agent read-only and pinned, and carries them into reconcile', async () => {
    const { agent } = await audit({
      'verify:drift-undesigned': { findings: [{ check: 'undesigned', board: '/orders', why: 'no board covers this route', confidence: 'high' }] },
    }, driftArgs());
    expect(unpinnedLabels(agent)).toEqual([]);
    for (const c of verifiers(agent).filter((c) => c.opts.label.includes('drift'))) expect(c.prompt).toMatch(/READ ONLY/);
    expect(byLabel(agent, 'reconcile').prompt).toContain('no board covers this route');
    expect(byLabel(agent, 'reconcile').prompt).toContain('SCREENS NEVER DESIGNED');
    expect(byLabel(agent, 'reconcile').prompt).toMatch(/EDIT NOTHING/);
  });

  it('lists each accepted undesigned screen for an as-is rebuild, and still returns no board edits', async () => {
    const { result } = await audit({
      'verify:drift-undesigned': { findings: [{ check: 'undesigned', board: '/orders', why: 'no board', confidence: 'high' }] },
      reconcile: { ...RECONCILED, accepted: [{ board: '/orders', check: 'undesigned', why: 'no board' }, { board: '09-s', check: 'board-drift', why: 'x' }] },
    }, driftArgs());
    expect(result.undesigned_screens).toEqual(['/orders']);
    expect(Object.keys(result)).not.toEqual(expect.arrayContaining(['edits', 'boards']));
  });
});
