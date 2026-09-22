/**
 * audit-trd.js test suite.
 *
 * WHY NOW. audit-trd is the second most expensive stage in the pipeline — 867s median across
 * 64 real runs — and had no tests at all. It is about to be restructured for speed, and
 * there was no baseline recording what it does today.
 *
 * Wiring tests, in the house style: does a thing one stage produces reach the stage that
 * consumes it? That is the defect class this repo actually ships.
 *
 * Run with: npx jest packages/core/workflows/audit-trd.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

const SOURCE = readScript('audit-trd.js');

function baseArgs(overrides = {}) {
  return { trd: 'docs/TRD/f.md', source: 'docs/PRD/f.md', ...overrides };
}

const INDEX = {
  objectives: [{ id: 'O1', text: 'make it work' }],
  decisions: [{ id: 'D1', text: 'use X' }],
  tasks: [{ id: 'F-B001', description: 'build it', touches: ['src/a.ts'] }],
  could_not_verify: [],
  open_questions: [],
};

const NO_FINDINGS = { findings: [] };

function plan(overrides = {}) {
  return (prompt, opts) => {
    const label = String(opts.label);
    if (Object.prototype.hasOwnProperty.call(overrides, label)) return overrides[label];
    if (label === 'index') return INDEX;
    if (label.startsWith('verify:')) return NO_FINDINGS;
    if (label === 'reconcile:could-not-verify') return { could_not_verify_remaining: 0 };
    if (label === 'reconcile') {
      return { applied: 0, rejected: 0, could_not_verify_remaining: 0, readout: 'AUDIT: clean' };
    }
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

describe('audit-trd wiring', () => {
  it('runs index, verify and reconcile', async () => {
    const { phases } = await audit();
    expect(phases).toEqual(['Index', 'Verify', 'Reconcile']);
  });

  it('fans the verifiers out in one wave', async () => {
    const { agent, parallel } = await audit();
    expect(verifiers(agent).length).toBeGreaterThan(1);
    expect(parallel.waves.length).toBeGreaterThanOrEqual(1);
  });

  it('gives every agent an explicit agentType — none may inherit the session model', async () => {
    // The whole file set agentType zero times while create-trd sets it seven. An unset
    // agentType is not "no agent": it is the generic workflow subagent on the SESSION
    // model, which in an Opus-led session is Opus, unchosen, at ~5x a Sonnet agent.
    const { agent } = await audit();
    const missing = agent.calls.filter((c) => !c.opts.agentType).map((c) => c.opts.label);
    expect(missing).toEqual([]);
  });

  it('feeds the index into the verifiers that reason about objectives and tasks', async () => {
    const { agent } = await audit();
    const derivation = verifiers(agent).find((c) => c.opts.label.includes('derivation'));
    expect(derivation.prompt).toContain('F-B001');
  });

  it('carries findings from the verifiers into reconcile', async () => {
    const { agent } = await audit({
      'verify:design-audit': { findings: [{ check: 'buildability', why: 'D1 cannot be built as written' }] },
      reconcile: { applied: 1, rejected: 0, could_not_verify_remaining: 0, readout: 'AUDIT: 1 applied' },
    });
    expect(byLabel(agent, 'reconcile').prompt).toContain('D1 cannot be built as written');
  });

  it('takes the cheap path when every verifier comes back clean', async () => {
    const { agent } = await audit();
    expect(byLabel(agent, 'reconcile:could-not-verify')).toBeDefined();
    expect(byLabel(agent, 'reconcile')).toBeUndefined();
  });

  it('reports incomplete coverage rather than treating a dead verifier as clean', async () => {
    // A verifier that returns nothing has NOT cleared its dimension. Silently counting it as
    // clean is how an audit reports success over an unchecked artifact.
    const { logs } = await audit({ 'verify:omission-audit': undefined });
    expect(logs.join('\n')).toMatch(/verifier|coverage|returned nothing/i);
  });

  it('surfaces the readout the reconcile stage produced', async () => {
    const { result } = await audit({
      'verify:design-audit': { findings: [{ check: 'buildability', why: 'x' }] },
      reconcile: { applied: 2, rejected: 1, could_not_verify_remaining: 0, readout: 'AUDIT: 2 applied, 1 rejected' },
    });
    expect(result.readout).toContain('2 applied');
  });

  it('refuses to run without a TRD', async () => {
    const agent = makeAgentStub(plan());
    await expect(runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: { source: 'x' } }))
      .rejects.toThrow();
  });
});
