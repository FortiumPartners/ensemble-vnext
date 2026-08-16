/**
 * audit-build.js test suite.
 *
 * audit-build.js is not a CommonJS/ESM module -- it's a prompt-DSL body executed by the
 * platform's `Workflow` tool. See __tests__/harness.js for how it's loaded and run here.
 *
 * Run with: npx jest packages/core/workflows/__tests__/audit-build.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

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
    const findings = { 'verify:traceability-audit': [{ check: 'traceability', why: 'no test', confidence: 'high', action: 'gap' }] };
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
