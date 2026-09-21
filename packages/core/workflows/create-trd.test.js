/**
 * create-trd.js test suite.
 *
 * WHY THIS EXISTS. create-trd.js is the most expensive workflow in the framework — measured
 * at a 1384s median across 57 real runs — and it was the last one with no tests at all. The
 * next three changes planned for it (parallel grounding, an agent type on the Ground stage,
 * passing task descriptions down) all rewrite its dispatch, and there was no baseline saying
 * what it does today.
 *
 * Like create-prd.test.js, these are WIRING tests, not judgements about model output. They
 * ask whether a thing one stage produces reaches the stage that consumes it. That is the
 * defect class that has actually occurred in this repo — twice in workflows, and a third
 * time when a field was log()ed and wired to nothing.
 *
 * Run with: npx jest packages/core/workflows/create-trd.test.js
 */

'use strict';

const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

const SOURCE = readScript('create-trd.js');

function baseArgs(overrides = {}) {
  return {
    trd: 'docs/TRD/f.md',
    prd: 'docs/PRD/f.md',
    feature: 'f',
    ...overrides,
  };
}

const CORPUS = {
  documents: [{ path: 'docs/TRD/old.md', subject: 'prior design', decisions: ['D1: use X'] }],
  conventions: ['tasks are prefixed FEAT-'],
};

const AUTHORED = {
  trd_path: 'docs/TRD/f.md',
  objectives: [{ id: 'O1', text: 'make it work' }],
  decisions: [{ id: 'D1', text: 'use X' }],
  tasks: [
    { id: 'F-B001', description: 'build the thing', serves: ['O1'], depends_on: [] },
    { id: 'F-B002', description: 'wire it up', serves: ['O1'], depends_on: ['F-B001'] },
  ],
};

const GROUNDED = {
  grounded_task_ids: ['F-B001', 'F-B002'],
  replaces_found: ['old/thing.js'],
  findings: [],
};

/** Default plan: every stage returns a well-formed result, keyed by opts.label. */
function plan(overrides = {}) {
  const byLabel = {
    'corpus-index': CORPUS,
    'author:technical-architect': AUTHORED,
    'ground:brownfield': GROUNDED,
    ...overrides,
  };
  return (prompt, opts) => byLabel[opts.label];
}

async function run(overrides = {}, args = baseArgs()) {
  const agent = makeAgentStub(plan(overrides));
  const parallel = makeParallelStub();
  const { result, phases, logs } = await runWorkflow(SOURCE, { agent, parallel, args });
  return { result, phases, logs, agent, parallel };
}

const call = (agent, label) => agent.calls.find((c) => c.opts.label === label);

describe('create-trd wiring', () => {
  it('runs its three declared phases in order', async () => {
    const { phases } = await run();
    expect(phases).toEqual(['Corpus', 'Author', 'Ground']);
  });

  it('feeds the corpus index into the author prompt', async () => {
    // The corpus stage is worthless if its output never reaches the author.
    const { agent } = await run();
    const authorPrompt = call(agent, 'author:technical-architect').prompt;
    expect(authorPrompt).toContain('docs/TRD/old.md');
    expect(authorPrompt).toContain('D1: use X');
  });

  it('names every authored task to the grounding stage', async () => {
    const { agent } = await run();
    const groundPrompt = call(agent, 'ground:brownfield').prompt;
    expect(groundPrompt).toContain('F-B001');
    expect(groundPrompt).toContain('F-B002');
  });

  it('routes the author to the technical-architect agent', async () => {
    // agentType decides which model runs the stage. An unset one silently inherits the
    // session model, which is how an 8-task fixture once went 330 Sonnet -> 8 Sonnet.
    const { agent } = await run();
    expect(call(agent, 'author:technical-architect').opts.agentType).toBe('technical-architect');
  });

  it('routes grounding to an explicit agent, never inheriting the session model', async () => {
    // An unset agentType runs the generic workflow subagent on the SESSION model — Opus in
    // an Opus-led session, unchosen and ~5x the price. The value is a reversible call; that
    // it is SET at all is the invariant.
    const { agent } = await run();
    expect(call(agent, 'ground:brownfield').opts.agentType).toBeTruthy();
  });

  it('reports task and objective counts from the author, not from thin air', async () => {
    const { result } = await run();
    expect(result.tasks).toBe(2);
    expect(result.objectives).toBe(1);
  });

  it('carries grounding results into the return and the readout', async () => {
    const { result } = await run();
    expect(result.grounded_tasks).toBe(2);
    expect(result.replaces_found).toBe(1);
    expect(result.readout).toContain('docs/TRD/f.md');
  });

  it('surfaces grounding findings in the readout without applying them', async () => {
    // Findings are reported, never fixed here — a generative stage applying its own
    // findings blurs the create/audit line.
    const { result } = await run({
      'ground:brownfield': {
        ...GROUNDED,
        findings: [{ kind: 'buildability', detail: 'F-B002 cites a file that does not exist' }],
      },
    });
    expect(result.grounding_findings).toBe(1);
    expect(result.readout).toMatch(/F-B002 cites a file that does not exist|NOTED BY GROUNDING/);
  });

  it('hands off to /audit-trd, never verifying its own output', async () => {
    const { result } = await run();
    expect(result.next).toContain('/audit-trd');
    expect(result.next).toContain('docs/TRD/f.md');
    expect(result.readout).toContain('NOT YET VERIFIED');
  });

  it('forwards --project through to the handoff when designing another repo', async () => {
    const { result } = await run({}, baseArgs({ project: '/srv/other' }));
    expect(result.next).toContain('--project /srv/other');
  });

  it('fails loudly when a stage returns nothing', async () => {
    // agent() returns null when a subagent dies. Every stage is wrapped in required()
    // so the run stops rather than writing a TRD built on a hole.
    await expect(run({ 'author:technical-architect': undefined })).rejects.toThrow(/Author/i);
    await expect(run({ 'ground:brownfield': undefined })).rejects.toThrow(/Ground/i);
  });

  it('refuses to run with no source at all', async () => {
    const agent = makeAgentStub(plan());
    await expect(
      runWorkflow(SOURCE, { agent, args: { trd: 'docs/TRD/f.md', feature: 'f' } })
    ).rejects.toThrow();
  });
});
