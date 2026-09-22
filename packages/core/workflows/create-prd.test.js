/**
 * create-prd.js test suite.
 *
 * WHY THIS EXISTS. create-prd.js was the only workflow without one, and the gap had a cost:
 * a `supersedes` field was added on 2026-09-20, log()ed, and wired to nothing -- absent from
 * the return, the readout and the /audit-prd handoff. It shipped with a commit message
 * claiming otherwise. A code review caught it; the author's own verification did not.
 *
 * So these tests are deliberately about WIRING, not about model judgement. They ask whether
 * a thing the stages produce actually reaches the place that consumes it. That is the class
 * of defect that has actually occurred here, twice.
 *
 * Run with: npx jest packages/core/workflows/create-prd.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub } = require('./test-harness');

const SOURCE = readScript('create-prd.js');

function baseArgs(overrides = {}) {
  return {
    source: '', brief: 'docs/PRD/f.brief.md',
    prd: 'docs/PRD/f.md', feature: 'f',
    ...overrides,
  };
}

/** corpus with documents, a conflict scan that finds one, an author that records it. */
function plan({ documents = [{ path: 'docs/TRD/rsr.md', decisions: ['D1'] }],
                conflicts = [], supersedes = [] } = {}) {
  return (prompt, opts) => {
    if (opts.label === 'corpus-index') return { documents, conventions: [], skipped_count: 0 };
    if (opts.label === 'conflict-scan') return { conflicts };
    if (opts.label === 'author:product-manager') {
      return { prd_path: 'docs/PRD/f.md', requirements: [{ id: 'R1', statement: 's', source: 'src' }], supersedes };
    }
    return null;
  };
}

const CONFLICT = {
  document: 'docs/TRD/rsr.md', decision: 'bookings is authoritative',
  source_says: 'schedule_items is the one timeline', same_question: true, implemented: 'no',
};

describe('create-prd: the conflict scan reaches the author', () => {
  it('runs the scan when a corpus exists, and puts its findings in the author prompt', async () => {
    const agent = makeAgentStub(plan({ conflicts: [CONFLICT] }));
    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    const scan = agent.calls.find((c) => c.opts.label === 'conflict-scan');
    expect(scan).toBeDefined();

    // The whole point: the author must SEE the conflict, not have to notice it.
    const author = agent.calls.find((c) => c.opts.label === 'author:product-manager');
    expect(author.prompt).toContain('CONFLICTS ALREADY FOUND');
    expect(author.prompt).toContain('schedule_items is the one timeline');
    expect(author.prompt).toMatch(/THE SOURCE GOVERNS/);
  });

  it('skips the scan entirely when the corpus is empty — nothing to contradict', async () => {
    const agent = makeAgentStub(plan({ documents: [] }));
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(agent.calls.find((c) => c.opts.label === 'conflict-scan')).toBeUndefined();
  });

  it('adds no conflict block to the author prompt when the scan finds nothing', async () => {
    const agent = makeAgentStub(plan({ conflicts: [] }));
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    const author = agent.calls.find((c) => c.opts.label === 'author:product-manager');
    expect(author.prompt).not.toContain('CONFLICTS ALREADY FOUND');
  });
});

describe('create-prd: supersedes leaves the script', () => {
  // The regression this file was written for. It was log()ed and nothing more.
  it('carries supersedes into the RETURN, not just a log line', async () => {
    const sup = [{ document: 'docs/TRD/rsr.md', decision: 'a', source_says: 'b', why: 'stale' }];
    const agent = makeAgentStub(plan({ conflicts: [CONFLICT], supersedes: sup }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.supersedes).toEqual(sup);
  });

  it('renders supersedes in the readout the owner actually reads', async () => {
    const sup = [{ document: 'docs/TRD/rsr.md', decision: 'a', source_says: 'b', why: 'stale' }];
    const agent = makeAgentStub(plan({ conflicts: [CONFLICT], supersedes: sup }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.readout).toContain('OVERRIDES 1 documented decision(s)');
    expect(result.readout).toContain('docs/TRD/rsr.md');
  });

  it('says nothing about overrides when there are none', async () => {
    const agent = makeAgentStub(plan({ conflicts: [], supersedes: [] }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.readout).not.toContain('OVERRIDES');
    expect(result.supersedes).toEqual([]);
  });
});

describe('create-prd: the scan/PRD gap is the interesting signal', () => {
  it('WARNS when the scan found a conflict and the PRD recorded no supersession', async () => {
    // A PRD that quietly sided with a document reads as well-grounded. This gap is the
    // only cheap signal that it happened.
    const agent = makeAgentStub(plan({ conflicts: [CONFLICT], supersedes: [] }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.conflicts_found).toBe(1);
    expect(result.readout).toMatch(/WARNING: the conflict scan found 1 disagreement/);
    expect(result.readout).toMatch(/silently side with a document/);
  });

  it('does not warn when the PRD recorded the supersession', async () => {
    const sup = [{ document: 'docs/TRD/rsr.md', decision: 'a', source_says: 'b', why: 'stale' }];
    const agent = makeAgentStub(plan({ conflicts: [CONFLICT], supersedes: sup }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.readout).not.toContain('WARNING');
  });
});

/* Scope drift, added 2026-09-21. The sizing judgment in /create-trd runs after a TRD exists,
 * which is downstream of where scope actually grows: an owner's "moderate change" was already
 * an 85KB PRD with 37 requirements before any TRD was written, and reached implementation as
 * 17 tasks across two deploy cycles. */
describe('create-prd scope drift', () => {
  const driftPlan = (drift) => (prompt, opts) => {
    if (opts.label === 'corpus-index') return { documents: [], conventions: [] };
    if (opts.label === 'author:product-manager') return { prd_path: 'docs/PRD/f.md', requirements: ['R1'] };
    if (opts.label === 'drift') return drift;
    return undefined;
  };
  const withDrift = async (drift, args) => {
    const agent = makeAgentStub(driftPlan(drift));
    const { result } = await runWorkflow(SOURCE, {
      agent, args: args || baseArgs({ source: 'make the rate box bigger' }),
    });
    return { result, agent };
  };

  it('compares the PRD against the request VERBATIM', async () => {
    const { agent } = await withDrift({ recognisable: true, drift: [] });
    const call = agent.calls.find((c) => c.opts.label === 'drift');
    expect(call.prompt).toContain('make the rate box bigger');
  });

  it('says so plainly when the PRD matches the request', async () => {
    const { result } = await withDrift({ recognisable: true, drift: [] });
    expect(result.readout).toContain('SCOPE — matches the request');
    expect(result.scope_recognisable).toBe(true);
  });

  it('names what grew, and says to cut it BEFORE it becomes tasks', async () => {
    const { result } = await withDrift({
      recognisable: false,
      drift: [{ requirement: 'a database migration with a backfill', why: 'the request only asked for a wider input' }],
    });
    expect(result.readout).toContain('SCOPE GREW BEYOND THE REQUEST');
    expect(result.readout).toContain('a database migration with a backfill');
    expect(result.readout).toContain('before /create-trd turns them into tasks');
    expect(result.scope_drift).toHaveLength(1);
  });

  it('treats a session brief as the request too, not only a source document', async () => {
    // SOURCE_PACKAGE is source + brief. A brief IS what was asked for, so drift is still
    // checkable against it — there is no "no request" case while either exists.
    const { agent } = await withDrift({ recognisable: true, drift: [] }, baseArgs({ source: '' }));
    expect(agent.calls.find((c) => c.opts.label === 'drift')).toBeDefined();
  });

  it('never has a "no request" case — the workflow refuses before it gets here', async () => {
    // Why the drift check needs no conditional: without source or brief this never runs.
    await expect(
      withDrift(undefined, { prd: 'docs/PRD/f.md', feature: 'f', source: '', brief: '' })
    ).rejects.toThrow(/one of args.source \/ args.brief is required/);
  });

  it('still produces the PRD when the drift agent dies', async () => {
    const { result } = await withDrift(undefined);
    expect(result.prd).toBe('docs/PRD/f.md');
    expect(result.scope_recognisable).toBeNull();
  });
});
