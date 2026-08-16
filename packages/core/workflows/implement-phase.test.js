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
  it('distinguishes a dead code-simplifier from a genuine no-change via simplifyReported', async () => {
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

  // FIXED 2026-08-16. findings still defaults to 0 (there is no honest alternative number),
  // but `reviewReported: false` now says the reviewer never answered. Without that flag a
  // dead reviewer's 0 was byte-identical to a clean review and propagated into the
  // checkpoint commit message and PHASE banner as though a review had passed.
  it('distinguishes a dead review from a clean one via reviewReported', async () => {
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

    expect(result.gate.review.findings).toBe(0);
    expect(result.gate.reviewReported).toBe(false);
    expect(result.status).toBe('complete');
    expect(logs.some((l) => /review returned nothing/i.test(l))).toBe(true);
  });
});

describe('implement-phase: post-simplify re-verification', () => {
  // FIXED 2026-08-16. Previously `gateOk` read a verifyStatus captured BEFORE code-simplifier
  // ran, so a refactor that reddened the suite still produced a 'complete' phase. The
  // pre-rework loop ran VERIFY twice for exactly this reason; the rework dropped the second
  // pass. The script now re-verifies when, and only when, the simplifier reports `changed`.
  it('re-verifies after a simplifier that changed code, and fails the phase when the re-verify is red', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: true, notes: 'refactored X' };
      if (opts.label === 'gate:verify-app (post-simplify)') return { status: 'fail' };
      if (opts.label === 'gate:review') return { findings: 0 };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent, parallel: makeParallelStub(), args: baseArgs(),
    });

    expect(result.gate.simplify).toBe('changed');
    expect(result.gate.postSimplify).toBe('fail');
    expect(result.status).toBe('failed');
    expect(agent.calls.some((c) => c.opts.label === 'gate:verify-app (post-simplify)')).toBe(true);
  });

  it('does NOT re-verify when the simplifier changed nothing — the first pass stands', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: false };
      if (opts.label === 'gate:review') return { findings: 0 };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent, parallel: makeParallelStub(), args: baseArgs(),
    });

    // Conditional on `changed` so the common case costs nothing — re-running verify over an
    // unchanged tree can only reproduce the result already in hand.
    expect(agent.calls.some((c) => c.opts.label === 'gate:verify-app (post-simplify)')).toBe(false);
    expect(result.gate.postSimplify).toBeNull();
    expect(result.status).toBe('complete');
  });

  it('a dead post-simplify verify fails the phase rather than defaulting green', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: true };
      if (opts.label === 'gate:review') return { findings: 0 };
      return undefined;   // post-simplify verify dies
    });

    const { result } = await runWorkflow(SOURCE, {
      agent, parallel: makeParallelStub(), args: baseArgs(),
    });

    expect(result.gate.postSimplify).toBe('fail');
    expect(result.status).toBe('failed');
  });
});

describe('implement-phase: review findings are applied, not merely counted', () => {
  // FIXED 2026-08-16. The gate schema carried only `findings`, and additionalProperties:false
  // drops anything it does not name — so even a reviewer that fixed things could not say so.
  // Every per-phase finding was reduced to an integer that nothing gates on and which ends up
  // in a commit message reading like diligence.
  it('carries applied / reported / summary through the gate result', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: false };
      if (opts.label === 'gate:review') {
        return { findings: 4, applied: 3, reported: 1, summary: ['unbounded loop in parser'] };
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent, parallel: makeParallelStub(), args: baseArgs(),
    });

    expect(result.gate.review).toEqual({
      findings: 4, applied: 3, reported: 1, summary: ['unbounded loop in parser'],
    });
  });

  it('a reviewer that returns only a bare count still works (applied/reported default to 0)', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'task:A') return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      if (opts.label === 'gate:code-simplifier') return { changed: false };
      if (opts.label === 'gate:review') return { findings: 2 };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent, parallel: makeParallelStub(), args: baseArgs(),
    });

    expect(result.gate.review.findings).toBe(2);
    expect(result.gate.review.applied).toBe(0);
    expect(result.gate.review.reported).toBe(0);
  });
});

describe('implement-phase: empty waves', () => {
  // FIXED 2026-08-16. An empty waves array is a legitimate state, not an error: every task in
  // the phase already succeeded, which is what --resume sees after a crash between this
  // workflow returning and the command writing its checkpoint. Throwing turned an ordinary
  // resume into an unhandled workflow error the command has no catch for.
  it('skips the phase (rather than throwing) when every task already succeeded', async () => {
    const { result } = await runWorkflow(SOURCE, {
      agent: makeAgentStub(happyPlan()),
      parallel: makeParallelStub(),
      args: baseArgs({ tasks: { waves: [], records: [] } }),
    });

    expect(result.status).toBe('complete');
    expect(result.skipped).toBe(true);
    expect(result.tasks).toEqual([]);
    // The gate is marked skipped so nothing downstream mistakes it for a gate that ran green.
    expect(result.gate.verify).toBe('skipped');
    expect(result.gate.reviewReported).toBe(false);
  });

  it('still throws when waves is not an array at all', async () => {
    await expect(
      runWorkflow(SOURCE, {
        agent: makeAgentStub(happyPlan()),
        parallel: makeParallelStub(),
        args: baseArgs({ tasks: { waves: 'nope', records: [] } }),
      })
    ).rejects.toThrow(/must be an array of waves/i);
  });
});
