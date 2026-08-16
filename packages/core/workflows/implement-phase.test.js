/**
 * implement-phase.js test suite.
 *
 * implement-phase.js is not a CommonJS/ESM module -- it's a prompt-DSL body executed by the
 * platform's `Workflow` tool. See __tests__/harness.js for how it's loaded and run here.
 *
 * Run with: npx jest packages/core/workflows/__tests__/implement-phase.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

const SOURCE = readScript('implement-phase.js');

function baseArgs(overrides = {}) {
  return {
    trd: 'docs/TRD/example.md',
    phase: 1,
    tasks: { waves: [['A']], records: [{ id: 'A', prompt: 'do A' }] },
    gate: { verifyPrompt: 'verify', simplifyPrompt: 'simplify', reviewPrompt: 'review' },
    ...overrides,
  };
}

// A plan that makes every task succeed and every gate pass cleanly -- the common "everything
// worked" baseline other tests deviate from.
function happyPlan() {
  return (prompt, opts) => {
    if (opts.label.startsWith('task:')) return { status: 'success', filesChanged: [] };
    if (opts.label === 'gate:verify-app') return { status: 'pass' };
    if (opts.label === 'gate:code-simplifier') return { changed: false };
    if (opts.label === 'gate:review') return { findings: 0 };
    return null;
  };
}

describe('implement-phase: wave sequencing', () => {
  it('dispatches tasks within a wave in parallel and waves sequentially, later wave never starting before an earlier one finishes', async () => {
    // Track resolve order relative to when each wave's parallel() call started, using a manual
    // ordering log rather than timers -- deterministic even under CI scheduling jitter.
    const events = [];
    let releaseWaveOne;
    const waveOneGate = new Promise((resolve) => {
      releaseWaveOne = resolve;
    });

    const agent = makeAgentStub(async (prompt, opts) => {
      const label = opts.label;
      if (label === 'task:A' || label === 'task:B') {
        events.push(`start:${label}`);
        await waveOneGate; // wave 1 tasks block until explicitly released
        events.push(`end:${label}`);
        return { status: 'success', filesChanged: [] };
      }
      if (label === 'task:C') {
        // Wave 2's single task -- if this fires before wave 1 released, sequencing is broken.
        events.push('start:task:C');
        events.push('end:task:C');
        return { status: 'success', filesChanged: [] };
      }
      if (label === 'gate:verify-app') return { status: 'pass' };
      if (label === 'gate:code-simplifier') return { changed: false };
      if (label === 'gate:review') return { findings: 0 };
      return null;
    });
    const parallel = makeParallelStub();

    const runPromise = runWorkflow(SOURCE, {
      agent,
      parallel,
      args: baseArgs({
        tasks: {
          waves: [['A', 'B'], ['C']],
          records: [
            { id: 'A', prompt: 'do A' },
            { id: 'B', prompt: 'do B' },
            { id: 'C', prompt: 'do C' },
          ],
        },
      }),
    });

    // Give wave 1's two tasks a microtask turn to both start before we release them -- proves
    // A and B dispatch concurrently (both "start" events land before either "end").
    await new Promise((r) => setImmediate(r));
    expect(events).toEqual(['start:task:A', 'start:task:B']);
    expect(events).not.toContain('start:task:C');

    releaseWaveOne();
    const { result } = await runPromise;

    expect(events).toEqual([
      'start:task:A',
      'start:task:B',
      'end:task:A',
      'end:task:B',
      'start:task:C',
      'end:task:C',
    ]);
    expect(parallel.waves.map((w) => w.size)).toEqual([2, 1]);
    expect(result.status).toBe('complete');
  });
});

describe('implement-phase: agentType passthrough', () => {
  it('forwards record.agentType to opts.agentType when present', async () => {
    const agent = makeAgentStub(happyPlan());
    await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs({
        tasks: {
          waves: [['A']],
          records: [{ id: 'A', prompt: 'do A', agentType: 'backend-implementer' }],
        },
      }),
    });

    const call = agent.calls.find((c) => c.opts.label === 'task:A');
    expect(call.opts.agentType).toBe('backend-implementer');
  });

  it('does not set opts.agentType when the record has none', async () => {
    const agent = makeAgentStub(happyPlan());
    await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    const call = agent.calls.find((c) => c.opts.label === 'task:A');
    expect(call.opts).not.toHaveProperty('agentType');
  });
});

describe('implement-phase: dead task agent', () => {
  it('records a dead task agent (agent() -> null) as a failure rather than dropping it, and fails the phase', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return undefined; // -> null via the stub's contract
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: false };
      if (opts.label === 'gate:review') return { findings: 0 };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ id: 'A', status: 'failed' });
    expect(result.tasks[0].error).toMatch(/agent returned nothing/i);
    expect(result.status).toBe('failed');
  });
});

describe('implement-phase: gate fallbacks (dead gate agents)', () => {
  it('defaults a dead verify-app to fail', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return undefined; // dead
      if (opts.label === 'gate:code-simplifier') return { changed: false };
      if (opts.label === 'gate:review') return { findings: 0 };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.gate.verifyApp).toBe('fail');
    expect(result.status).toBe('failed');
  });

  // PINNED, NOT ENDORSED: a dead code-simplifier is recorded as 'no-change', which reads
  // identically to "the simplifier ran and found nothing to change" -- there is no way for a
  // reader of the phase result to distinguish "simplifier died" from "simplifier had no work."
  // This is a known reporting fail-open (see the team-lead's brief); this test documents current
  // behaviour so a future change to it is a deliberate diff, not a silent regression.
  it('[PINNED, known fail-open] records a dead code-simplifier as no-change, indistinguishable from "nothing to change"', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return undefined; // dead
      if (opts.label === 'gate:review') return { findings: 0 };
      return null;
    });

    const { result, logs } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.gate.simplify).toBe('no-change');
    // The phase still "completes" -- the dead simplifier does not fail the gate.
    expect(result.status).toBe('complete');
    expect(logs.some((l) => /code-simplifier returned nothing/i.test(l))).toBe(true);
  });

  // PINNED, NOT ENDORSED: a dead review is recorded as findings: 0, indistinguishable from a
  // genuinely clean review. Same fail-open shape as code-simplifier above.
  it('[PINNED, known fail-open] records a dead review as findings: 0, indistinguishable from a clean review', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: false };
      if (opts.label === 'gate:review') return undefined; // dead
      return null;
    });

    const { result, logs } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.gate.review).toEqual({ findings: 0 });
    expect(result.status).toBe('complete');
    expect(logs.some((l) => /review returned nothing/i.test(l))).toBe(true);
  });
});

describe('implement-phase: gateOk reads verifyStatus captured before code-simplifier runs', () => {
  // PINNED, KNOWN DEFECT (implement-phase.js ~line 182 vs ~line 185): `verifyStatus` is read
  // into `gateOk` from the verify-app call that ran BEFORE code-simplifier, not re-checked after
  // it. A code-simplifier that breaks something introduced after verify-app already passed has
  // no mechanism in this script to fail the phase on that basis -- the phase still reports
  // 'complete'. This test demonstrates and pins that behaviour; it does not endorse it.
  it('a simplifier that (per its own report) changed code after verify-app already passed still yields a complete phase', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      // code-simplifier reports it changed something -- nothing re-verifies after this.
      if (opts.label === 'gate:code-simplifier') return { changed: true, notes: 'refactored X, potentially unsafe' };
      if (opts.label === 'gate:review') return { findings: 0 };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel: makeParallelStub(),
      args: baseArgs(),
    });

    expect(result.gate.simplify).toBe('changed');
    // Known defect: no re-verification happens, so the phase is still reported complete even
    // though code-simplifier's own change is now unverified.
    expect(result.status).toBe('complete');
  });
});

describe('implement-phase: empty waves', () => {
  // PINNED: args.tasks.waves = [] throws, per the script's own explicit guard
  // ("args.tasks.waves is required and must be a non-empty array of waves"). This documents
  // that as current behaviour -- callers must never pass an empty waves array.
  it('throws when args.tasks.waves is an empty array', async () => {
    await expect(
      runWorkflow(SOURCE, {
        agent: makeAgentStub(happyPlan()),
        parallel: makeParallelStub(),
        args: baseArgs({ tasks: { waves: [], records: [] } }),
      })
    ).rejects.toThrow(/non-empty array of waves/i);
  });
});
