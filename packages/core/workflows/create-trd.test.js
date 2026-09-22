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
    'triage:shape': { shape: 'one-change', why: 'the parts depend on each other' },
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
  it('runs its declared phases in order, triage first', async () => {
    const { phases } = await run();
    expect(phases).toEqual(['Triage', 'Corpus', 'Author', 'Ground']);
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

  it('renders a dependency finding through the existing gfLines block, naming both tasks', async () => {
    // FIX-001: the dependency challenge travels through the EXISTING findings array as a
    // new `check` enum member, not a new top-level field — so it needs no new render block.
    const { result } = await run({
      'ground:brownfield': {
        ...GROUNDED,
        findings: [
          { check: 'dependency', why: 'F-B002 declares depends_on F-B001 but consumes nothing F-B001 creates', id: 'F-B002', confidence: 'medium', action: 'drop-dependency' },
        ],
      },
    });
    expect(result.grounding_findings).toBe(1);
    expect(result.readout).toContain('[dependency]');
    expect(result.readout).toContain('F-B002');
    expect(result.readout).toContain('consumes nothing F-B001 creates');
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

/* Fan-out, added 2026-09-21. The Ground stage grounded every task in one serial agent;
 * /create-trd's median is 1384s over 57 real runs and a 17-task TRD was abandoned at 22.7
 * minutes. These pin the three properties the change has to have. */
describe('create-trd grounding fan-out', () => {
  const manyTasks = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `F-B${String(i + 1).padStart(3, '0')}`,
      description: `task ${i + 1}`,
      serves: ['O1'],
      depends_on: [],
    }));

  /** Records every ground:* dispatch and returns a well-formed chunk result. */
  function groundingPlan(tasks) {
    return (prompt, opts) => {
      if (opts.label === 'corpus-index') return CORPUS;
      if (opts.label === 'author:technical-architect') return { ...AUTHORED, tasks };
      if (opts.label === 'ground:merge') return { findings: [] };
      if (String(opts.label).startsWith('ground:brownfield')) {
        // Ground exactly the ids this agent was told to ground.
        const mine = tasks.map((t) => t.id).filter((id) => {
          const m = /GROUND EXACTLY THESE, AND NO OTHERS: ([^\n]+)/.exec(prompt);
          return m && m[1].split(',').map((x) => x.trim()).includes(id);
        });
        return {
          blocks_markdown: mine.map((id) => `### ${id}\n- Touches: src/${id}.ts`).join('\n'),
          grounded_task_ids: mine,
          replaces_found: [],
          findings: [],
        };
      }
      return undefined;
    };
  }

  async function runWith(n) {
    const tasks = manyTasks(n);
    const agent = makeAgentStub(groundingPlan(tasks));
    const parallel = makeParallelStub();
    const { result, logs } = await runWorkflow(SOURCE, { agent, parallel, args: baseArgs() });
    const grounders = agent.calls.filter((c) => String(c.opts.label).startsWith('ground:brownfield'));
    const merges = agent.calls.filter((c) => c.opts.label === 'ground:merge');
    return { result, logs, agent, parallel, grounders, merges, tasks };
  }

  it('stays a single writing agent below the fan-out threshold', async () => {
    // A 3-task TRD must not pay for a merge step it does not need.
    const { grounders, merges } = await runWith(3);
    expect(grounders).toHaveLength(1);
    expect(merges).toHaveLength(0);
  });

  it('splits a large TRD across several agents and merges once', async () => {
    const { grounders, merges, parallel } = await runWith(17);
    expect(grounders.length).toBeGreaterThan(1);
    expect(grounders.length).toBeLessThanOrEqual(6);
    expect(merges).toHaveLength(1);
    expect(parallel.waves.length).toBe(1); // one wave, all grounders in it
  });

  it('gives every task to exactly one agent, and none to two', async () => {
    // Overlap would mean two agents writing blocks for one task; a gap means a task ships
    // ungrounded, which is how reimplementation happens.
    const { grounders, tasks } = await runWith(17);
    const assigned = grounders.flatMap((c) => {
      const m = /GROUND EXACTLY THESE, AND NO OTHERS: ([^\n]+)/.exec(c.prompt);
      return m ? m[1].split(',').map((x) => x.trim()) : [];
    });
    expect(assigned.slice().sort()).toEqual(tasks.map((t) => t.id).sort());
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('shows every agent the WHOLE task roster, not just its own slice', async () => {
    // Without this, trd-authoring.md's "two tasks touching one file will serialize" rule is
    // unenforceable: Touches is written here, and the rule needs sight of the other tasks.
    const { grounders, tasks } = await runWith(17);
    for (const c of grounders) {
      for (const t of tasks) expect(c.prompt).toContain(t.id);
    }
  });

  it('caps the number of grounding agents', async () => {
    const { grounders } = await runWith(60);
    expect(grounders.length).toBeLessThanOrEqual(6);
  });

  it('reports partial coverage instead of claiming every task was grounded', async () => {
    const tasks = manyTasks(17);
    const base = groundingPlan(tasks);
    let killed = false;
    const agent = makeAgentStub((prompt, opts) => {
      if (String(opts.label).startsWith('ground:brownfield') && !killed) { killed = true; return undefined; }
      return base(prompt, opts);
    });
    const { logs } = await runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs() });
    expect(logs.join('\n')).toMatch(/returned nothing|no grounding block/i);
  });
});

/* Sizing, added 2026-09-21. The PRD->TRD path had no size judgement at all, and an owner's
 * "moderate change" reached an unattended run as 17 tasks across two deploy cycles. The
 * defect class these guard against is the one this repo keeps producing: a field computed,
 * logged, and wired to nothing. */
describe('create-trd sizing', () => {
  const SIZE_CLEAN = {
    one_change: true, one_run: true, deploy_cycles: 1,
    reasons: [], deferred: [], proposed_split: [],
  };
  const SIZE_TOO_BIG = {
    one_change: false, one_run: false, deploy_cycles: 2,
    reasons: ['a rename sweep and three CI guards grew around a caller change'],
    deferred: [{ id: 'F-B016', why: 'runs one deploy cycle after F-B013 reaches the environment' }],
    proposed_split: [
      { tasks: 'F-B001..B003', ships: 'ledger identity — stops the bleeding on its own' },
      { tasks: 'F-B004..B016', ships: 'the rename sweep', after: 'F-B001..B003' },
    ],
  };

  const sizePlan = (size) => (prompt, opts) => {
    if (opts.label === 'corpus-index') return CORPUS;
    if (opts.label === 'author:technical-architect') return AUTHORED;
    if (opts.label === 'size') return size;
    if (opts.label === 'defer:write') return { written: true };
    if (String(opts.label).startsWith('ground')) return { ...GROUNDED, blocks_markdown: '### F-B001' };
    return undefined;
  };

  async function sized(size) {
    const agent = makeAgentStub(sizePlan(size));
    const { result } = await runWorkflow(SOURCE, {
      agent, parallel: makeParallelStub(), args: baseArgs(),
    });
    return { result, agent };
  }

  it('judges size in the same wave as grounding, costing no extra wall time', async () => {
    const { agent } = await sized(SIZE_CLEAN);
    const size = call(agent, 'size');
    expect(size).toBeDefined();
    expect(size.opts.phase).toBe('Ground');
  });

  it('shows the sizing agent the tasks AND the source it must judge drift against', async () => {
    // Absolute size is not the question — drift from what was actually asked for is.
    const { agent } = await sized(SIZE_CLEAN);
    const prompt = call(agent, 'size').prompt;
    expect(prompt).toContain('docs/PRD/f.md');
    expect(prompt).toContain('F-B001');
    expect(prompt).toContain('build the thing');
  });

  it('says so plainly when the plan is one change', async () => {
    const { result } = await sized(SIZE_CLEAN);
    expect(result.readout).toMatch(/SIZE — one change, one run/);
    expect(result.one_change).toBe(true);
    expect(result.deploy_cycles).toBe(1);
  });

  it('puts the split proposal in the readout, not just the return value', async () => {
    const { result } = await sized(SIZE_TOO_BIG);
    expect(result.readout).toContain('SPLIT THIS BEFORE IMPLEMENTING');
    expect(result.readout).toContain('2 deploy cycle(s)');
    expect(result.readout).toContain('F-B001..B003');
    expect(result.readout).toContain('ledger identity');
  });

  it('writes deferred tasks INTO the TRD, because implement-trd parses the document', async () => {
    const { agent, result } = await sized(SIZE_TOO_BIG);
    const w = call(agent, 'defer:write');
    expect(w).toBeDefined();
    expect(w.prompt).toContain('## Deferred by design');
    expect(w.prompt).toContain('F-B016');
    expect(result.deferred).toEqual(['F-B016']);
    expect(result.readout).toContain('DEFERRED BY DESIGN');
  });

  it('does not write a deferred section when nothing is deferred', async () => {
    const { agent, result } = await sized(SIZE_CLEAN);
    expect(call(agent, 'defer:write')).toBeUndefined();
    expect(result.readout).not.toContain('DEFERRED BY DESIGN');
  });

  it('never refuses or asks — it reports and proposes', async () => {
    // A gate that refuses is the same overreach as a guard that compels, and create-trd.md
    // forbids gating on AskUserQuestion. An oversized plan still produces a TRD.
    const { result } = await sized(SIZE_TOO_BIG);
    expect(result.trd).toBe('docs/TRD/f.md');
    expect(result.next).toContain('/audit-trd');
  });

  it('survives the sizing agent dying, rather than losing the TRD', async () => {
    const { result } = await sized(undefined);
    expect(result.trd).toBe('docs/TRD/f.md');
    expect(result.readout).toContain('not judged');
    expect(result.one_change).toBeNull();
  });

  it('renders a LONG TASKS line and exposes long_tasks on the return when the agent finds one', async () => {
    const { result } = await sized({
      ...SIZE_CLEAN,
      long_tasks: [{ id: 'F-B002', why: 'chains "wire it up" with an unrelated migration and a CI guard' }],
    });
    expect(result.long_tasks).toEqual([{ id: 'F-B002', why: 'chains "wire it up" with an unrelated migration and a CI guard' }]);
    expect(result.readout).toContain('LONG TASKS');
    expect(result.readout).toContain('F-B002');
    expect(result.readout).toContain('chains "wire it up"');
  });

  it('renders no LONG TASKS heading when the agent finds none', async () => {
    const { result } = await sized(SIZE_CLEAN);
    expect(result.long_tasks).toEqual([]);
    expect(result.readout).not.toContain('LONG TASKS');
  });

  it('exposes an empty long_tasks array, not undefined, when the sizing agent returns nothing', async () => {
    const { result } = await sized(undefined);
    expect(result.long_tasks).toEqual([]);
    expect(result.readout).not.toContain('LONG TASKS');
  });
});

/* Pre-authoring triage, added 2026-09-21. Sizing asks "is this still one change" AFTER the
 * TRD is written — too late for one input shape. An owner pointed this command at ~25
 * walkthrough findings; it authored for 22.7 minutes and was killed unfinished. */
describe('create-trd pre-authoring triage', () => {
  const shapePlan = (shape) => (prompt, opts) => {
    if (opts.label === 'triage:shape') return shape;
    if (opts.label === 'corpus-index') return CORPUS;
    if (opts.label === 'author:technical-architect') return AUTHORED;
    if (opts.label === 'size') return { one_change: true, one_run: true, deploy_cycles: 1, reasons: [], deferred: [], proposed_split: [] };
    if (String(opts.label).startsWith('ground')) return { ...GROUNDED, blocks_markdown: '### F-B001' };
    return undefined;
  };
  const withShape = async (shape) => {
    const agent = makeAgentStub(shapePlan(shape));
    const { result } = await runWorkflow(SOURCE, { agent, parallel: makeParallelStub(), args: baseArgs() });
    return { result, agent };
  };

  it('stops BEFORE authoring when the source is a list, not one change', async () => {
    // The whole point: the expensive stage must not run first and report afterwards.
    const { result, agent } = await withShape({
      shape: 'a-list', why: '25 unrelated walkthrough findings', item_count: 25,
    });
    expect(agent.calls.map((c) => c.opts.label)).toEqual(['triage:shape']);
    expect(result.trd).toBeNull();
    expect(result.readout).toContain('NO TRD WRITTEN');
    expect(result.next).toContain('/sweep');
  });

  it('proceeds normally when the parts depend on each other', async () => {
    const { result, agent } = await withShape({ shape: 'one-change', why: 'coupled design' });
    expect(agent.calls.some((c) => c.opts.label === 'author:technical-architect')).toBe(true);
    expect(result.trd).toBe('docs/TRD/f.md');
  });

  it('authors anyway when triage dies — it must never be a single point of failure', async () => {
    const { result } = await withShape(undefined);
    expect(result.trd).toBe('docs/TRD/f.md');
  });

  it('names unrelated strays without dropping the real design', async () => {
    const { result } = await withShape({
      shape: 'one-change', why: 'a real design with noise alongside',
      strays: ['the footer link is wrong'],
    });
    expect(result.trd).toBe('docs/TRD/f.md');
  });
});
