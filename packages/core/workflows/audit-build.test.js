/**
 * audit-build.js test suite.
 *
 * audit-build.js is not a CommonJS/ESM module -- it's a prompt-DSL body executed by the
 * platform's `Workflow` tool. See __tests__/harness.js for how it's loaded and run here.
 *
 * Run with: npx jest packages/core/workflows/__tests__/audit-build.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub, unpinnedLabels } = require('./test-harness');

const SOURCE = readScript('audit-build.js');

function baseArgs(overrides = {}) {
  return {
    trd: 'docs/TRD/example.md',
    prd: 'docs/PRD/example.md',
    project: '',
    ...overrides,
  };
}

const EMPTY_INDEX = {
  requirements: [],
  tasks: [],
  could_not_verify: [],
  open_questions: [],
};

const NONEMPTY_INDEX = {
  requirements: [{ id: 'AC-1', statement: 'does the thing', source: 'TRD', served_by: ['T-1'] }],
  tasks: [{ id: 'T-1', description: 'build the thing', touches: ['src/thing.js'] }],
  could_not_verify: [],
  open_questions: [],
};

// The verifiers array in audit-build.js has five entries: traceability-audit, verification-audit,
// validation-audit, test-quality-audit, deterministic. Their labels are `verify:<key>`.
const VERIFIER_LABELS = [
  'verify:traceability-audit',
  'verify:verification-audit',
  'verify:validation-audit',
  'verify:test-quality-audit',
  'verify:deterministic',
];

function planWithIndex(index, verifierFindings = {}) {
  return (prompt, opts) => {
    if (opts.label === 'index') return index;
    if (VERIFIER_LABELS.includes(opts.label)) {
      return { findings: verifierFindings[opts.label] || [] };
    }
    if (opts.label === 'reconcile:could-not-verify') return { could_not_verify_remaining: [] };
    if (opts.label === 'reconcile') {
      return { readout: 'READOUT TEXT', applied: [], rejected: [], could_not_verify_remaining: [] };
    }
    return null;
  };
}

describe('audit-build: empty index', () => {
  it('reports INCONCLUSIVE with counts and incomplete_coverage: true when both requirements and tasks are empty', async () => {
    const agent = makeAgentStub(planWithIndex(EMPTY_INDEX));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.incomplete_coverage).toBe(true);
    expect(result.findings).toBe(0);
    expect(result.readout).toMatch(/INCONCLUSIVE/);
    expect(result.readout).toContain('0 requirements');
    expect(result.readout).toContain('0 tasks');
  });

  it('reports incomplete_coverage: true when only requirements are empty (tasks present)', async () => {
    const index = { ...EMPTY_INDEX, tasks: NONEMPTY_INDEX.tasks };
    const agent = makeAgentStub(planWithIndex(index));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.incomplete_coverage).toBe(true);
    expect(result.readout).toMatch(/INCONCLUSIVE/);
  });

  it('does NOT report INCONCLUSIVE when the index is non-empty and no verifier findings occurred', async () => {
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.incomplete_coverage).toBe(false);
    expect(result.readout).not.toMatch(/INCONCLUSIVE/);
    expect(result.readout).toMatch(/NO ACTION/);
  });

  it('caps the verdict when no PRD was supplied, even with zero findings', async () => {
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs({ prd: '' }),
    });

    expect(result.readout).toContain('VERDICT: proceed with these caveats');
    expect(result.readout).toContain('no source supplied');
    expect(result.readout).not.toContain('VERDICT: safe to proceed');
  });
});

describe('audit-build: dead verifier handling', () => {
  it('sets incomplete_coverage: true and reports verifiers_reporting as a fraction when a verifier dies', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'index') return NONEMPTY_INDEX;
      if (opts.label === 'verify:traceability-audit') return undefined; // dead
      if (VERIFIER_LABELS.includes(opts.label)) return { findings: [] };
      if (opts.label === 'reconcile:could-not-verify') return { could_not_verify_remaining: [] };
      if (opts.label === 'reconcile') {
        return { readout: 'READOUT', applied: [], rejected: [], could_not_verify_remaining: [] };
      }
      return null;
    });

    const { result, logs } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.incomplete_coverage).toBe(true);
    expect(result.verifiers_reporting).toBe('4/5');
    expect(logs.some((l) => /verifier\(s\) returned nothing/i.test(l))).toBe(true);
  });

  it('carries dead-verifier coverage info into the zero-findings readout when the only dead verifier reported no findings', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'index') return NONEMPTY_INDEX;
      if (opts.label === 'verify:deterministic') return undefined; // dead
      if (VERIFIER_LABELS.includes(opts.label)) return { findings: [] };
      if (opts.label === 'reconcile:could-not-verify') return { could_not_verify_remaining: [] };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.findings).toBe(0);
    expect(result.incomplete_coverage).toBe(true);
    expect(result.verifiers_reporting).toBe('4/5');
    expect(result.readout).toMatch(/CAVEAT/);
    expect(result.readout).toContain('deterministic');
  });

  it('reports incomplete_coverage: false when all verifiers report, even with zero findings', async () => {
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.incomplete_coverage).toBe(false);
    expect(result.verifiers_reporting).toBe('5/5');
  });
});

describe('audit-build: clean path', () => {
  it("returns the TRD's path under `trd` on the non-empty, zero-findings, full-coverage path", async () => {
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs({ trd: 'docs/TRD/my-feature.md' }),
    });

    expect(result.trd).toBe('docs/TRD/my-feature.md');
  });

  it('returns `trd` on the findings path too (reconcile branch)', async () => {
    const findings = { 'verify:traceability-audit': [{ check: 'traceability', why: 'no test', confidence: 'high', action: 'gap-untested' }] };
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX, findings));

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs({ trd: 'docs/TRD/my-feature.md' }),
    });

    expect(result.trd).toBe('docs/TRD/my-feature.md');
    expect(result.findings).toBe(1);
    expect(result.readout).toBe('READOUT TEXT');
  });
});

describe('audit-build: required() guard on a dead Index', () => {
  it('throws when the index agent dies (nothing downstream can run without it)', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'index') return undefined; // dead
      return null;
    });

    await expect(
      runWorkflow(SOURCE, {
        agent,
        parallel: makeParallelStub(),
        args: baseArgs(),
      })
    ).rejects.toThrow(/Index stage returned no result/i);
  });
});

describe('audit-build: every agent() call is pinned', () => {
  // Extends audit-trd.test.js's "gives every agent an explicit agentType" pattern
  // (packages/core/workflows/audit-trd.test.js:70-75). Run once per reconcile branch, since
  // the clean branch (reconcile:could-not-verify) and the findings branch (reconcile) are
  // mutually exclusive within a single run.
  it('pins every call on the clean (no-findings) reconcile branch', async () => {
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX));
    await runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs() });
    expect(agent.calls.length).toBeGreaterThan(0);
    expect(unpinnedLabels(agent)).toEqual([]);
  });

  it('pins every call on the findings reconcile branch', async () => {
    const findings = { 'verify:traceability-audit': [{ check: 'traceability', why: 'no test', confidence: 'high', action: 'gap-untested' }] };
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX, findings));
    await runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs() });
    expect(agent.calls.length).toBeGreaterThan(0);
    expect(unpinnedLabels(agent)).toEqual([]);
  });
});

describe('audit-build: gap kinds, handoff and re-audit reuse', () => {
  const run = (args, findings) => {
    const agent = makeAgentStub(planWithIndex(NONEMPTY_INDEX, findings));
    return runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs(args) }).then((r) => ({ ...r, agent }));
  };
  const FINDING = { 'verify:traceability-audit': [{ check: 'traceability', why: 'x', confidence: 'high', action: 'gap-unbuilt' }] };
  const PREV = { reportPath: 'r.md', auditedCommit: 'abc123', index: NONEMPTY_INDEX, trdHash: 'h1' };
  const verifierCalls = (agent) => agent.calls.filter((c) => VERIFIER_LABELS.includes(c.opts.label));

  it('schema action enum has gap-unbuilt and gap-untested, no bare gap, and is required', async () => {
    const { agent } = await run();
    const schema = verifierCalls(agent)[0].opts.schema.properties.findings.items;
    expect(schema.properties.action.enum).toEqual(expect.arrayContaining(['gap-unbuilt', 'gap-untested']));
    expect(schema.properties.action.enum).not.toContain('gap');
    expect(schema.required).toContain('action');
  });

  it('reconcile schema returns a handoff with no class field', async () => {
    const { agent } = await run({}, FINDING);
    const props = agent.calls.find((c) => c.opts.label === 'reconcile').opts.schema.properties.handoff.items;
    expect(props.required).toEqual(['id', 'action', 'check', 'summary', 'evidence', 'covered']);
    expect(props.properties.class).toBeUndefined();
  });

  it('skips the Index agent when previous.trdHash matches args.trdHash', async () => {
    const { agent, result } = await run({ previous: PREV, trdHash: 'h1' });
    expect(agent.calls.some((c) => c.opts.label === 'index')).toBe(false);
    expect(result.index).toEqual(NONEMPTY_INDEX);
  });

  it('dispatches the Index agent when the hash differs or previous.index is absent', async () => {
    const a = await run({ previous: PREV, trdHash: 'h2' });
    expect(a.agent.calls.some((c) => c.opts.label === 'index')).toBe(true);
    const b = await run({ previous: { ...PREV, index: undefined }, trdHash: 'h1' });
    expect(b.agent.calls.some((c) => c.opts.label === 'index')).toBe(true);
  });

  it('names the changed-files scope in every verifier prompt only when previous is set', async () => {
    const withPrev = await run({ previous: PREV, trdHash: 'h1' });
    const calls = verifierCalls(withPrev.agent);
    expect(calls).toHaveLength(5);
    calls.forEach((c) => expect(c.prompt).toMatch(/abc123/));
    const without = await run();
    verifierCalls(without.agent).forEach((c) => expect(c.prompt).not.toMatch(/RE-AUDIT SCOPE/));
  });

  it('keeps the representative-sample wording only on a first audit', async () => {
    const first = await run();
    expect(verifierCalls(first.agent).find((c) => c.opts.label === 'verify:test-quality-audit').prompt).toMatch(/representative sample/);
    const re = await run({ previous: PREV, trdHash: 'h1' });
    expect(verifierCalls(re.agent).find((c) => c.opts.label === 'verify:test-quality-audit').prompt).not.toMatch(/representative sample/);
  });

  it('both return paths carry handoff and index', async () => {
    const clean = await run();
    expect(clean.result.handoff).toEqual([]);
    expect(clean.result.index).toEqual(NONEMPTY_INDEX);
    const agent = makeAgentStub((p, o) => o.label === 'reconcile'
      ? { readout: 'R', applied: [], rejected: [], handoff: [{ id: 'AC-1', action: 'gap-unbuilt', check: 'traceability', summary: 's', evidence: 'e', covered: false }] }
      : planWithIndex(NONEMPTY_INDEX, FINDING)(p, o));
    const { result } = await runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs() });
    expect(result.handoff).toHaveLength(1);
    expect(result.index).toEqual(NONEMPTY_INDEX);
  });
});
