/**
 * verify-functional.js test suite.
 *
 * verify-functional.js is not a CommonJS/ESM module -- it's a prompt-DSL body executed by the
 * platform's `Workflow` tool. See test-harness.js for how it's loaded and run here.
 *
 * Run with: npx jest packages/core/workflows/verify-functional.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

const SOURCE = readScript('verify-functional.js');

function criterion(id, overrides = {}) {
  return { id, statement: `statement for ${id}`, cites: 'FR-1', evidence: 'some artifact', derivation: '[read]', ...overrides };
}

function baseArgs(overrides = {}) {
  return {
    criteria: [criterion('FS-1'), criterion('FS-2')],
    contract: 'contract text',
    notes: '',
    stackHints: 'stack hints',
    evidenceDir: '.trd-state/example/evidence',
    checker: '.claude/lib/functional-verification.js',
    since: 1700000000,
    cap: 3,
    statePath: '.trd-state/example/verification-state.json',
    reportPath: '.trd-state/example/verification-report.md',
    resume: null,
    project: '',
    // §3.3 declares 15 fields; these three were absent until 2026-08-26. They are
    // unguarded (`|| ''`), so omitting them failed nothing -- which is exactly how
    // Finding A happened: renderReport()'s header rendered `undefined` for all three
    // and no fixture disagreed. baseArgs() is the only executable statement of this
    // interface, so it states all 15.
    feature: 'example',
    prd: 'docs/PRD/example.md',
    definitionPath: '.trd-state/example/success-definition.md',
    ...overrides,
  };
}

function satisfiedJudge(overrides = {}) {
  return {
    action: 'exit-satisfied',
    reason: 'all criteria met',
    criteria: [
      { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
      { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] },
    ],
    gaps: [],
    unbuilt: [],
    closed: [],
    notesUpdated: false,
    ...overrides,
  };
}

function remediateJudge(overrides = {}) {
  return {
    action: 'remediate',
    reason: 'FS-1 not met',
    criteria: [
      { id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: ['src/a.js'] },
      { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] },
    ],
    gaps: ['FS-1'],
    unbuilt: [],
    closed: [],
    notesUpdated: false,
    debugGaps: [{ id: 'FS-1', statement: 'statement for FS-1', reason: 'no artifact', artifact: null, files: ['src/a.js'] }],
    ...overrides,
  };
}

function exercisePlanClaims(claims) {
  return { claims };
}

// --------------------------------------------------------------------------- source constraints

describe('verify-functional: source-level constraints', () => {
  it('opens no file, runs no shell, uses no require', () => {
    expect(SOURCE).not.toMatch(/\brequire\s*\(/);
    expect(SOURCE).not.toMatch(/\bfs\./);
    expect(SOURCE).not.toMatch(/child_process/);
  });

  it('uses no Date.now(), Math.random(), or argless new Date()', () => {
    expect(SOURCE).not.toMatch(/Date\.now\s*\(/);
    expect(SOURCE).not.toMatch(/Math\.random\s*\(/);
    expect(SOURCE).not.toMatch(/new Date\s*\(\s*\)/);
  });

  it('contains no workflow( call', () => {
    // The `parallel(` half of this assertion is superseded by VCON-B006 (§6.1): lane slicing
    // dispatches through `parallel()`, following sweep.js's own batching pattern. The separate
    // `waves` assertion just below is NOT changed by that -- this workflow still says "batch",
    // "slice" and "lane", never "wave".
    expect(SOURCE).not.toMatch(/\bworkflow\s*\(/);
  });

  it('contains no reference to buildGraph, waves, remediation tasks, or the TRD', () => {
    expect(SOURCE).not.toMatch(/buildGraph/);
    expect(SOURCE).not.toMatch(/\bwaves\b/i);
    expect(SOURCE).not.toMatch(/remediation task/i);
    expect(SOURCE).not.toMatch(/\bTRD\b/);
  });
});

// --------------------------------------------------------------------------- ordering & agentType

describe('verify-functional: stage ordering and agentType', () => {
  it('dispatches Exercise, then Judge, then Debug in order, one call each', async () => {
    // Second iteration must resolve satisfied so the loop terminates.
    let judgeCalls = 0;
    const agent2 = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a', reason: '' }, { criterion: 'FS-2', artifact: 'b', reason: '' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent: agent2, args: baseArgs({ cap: 3 }) });

    const labels = agent2.calls.map((c) => c.opts.label);
    expect(labels).toEqual(['exercise', 'judge', 'debug', 'exercise', 'judge']);
    expect(result.outcome).toBe('satisfied');
  });

  it('sets agentType verify-app on Exercise, no agentType on Judge, app-debugger on Debug', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return remediateJudge({ action: 'exit-stuck' }); // exits immediately, no debug
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    const exerciseCall = agent.calls.find((c) => c.opts.label === 'exercise');
    const judgeCall = agent.calls.find((c) => c.opts.label === 'judge');
    expect(exerciseCall.opts.agentType).toBe('verify-app');
    expect(judgeCall.opts).not.toHaveProperty('agentType');
  });

  it('sets agentType app-debugger on the Debug stage', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    const debugCall = agent.calls.find((c) => c.opts.label === 'debug');
    expect(debugCall.opts.agentType).toBe('app-debugger');
  });

  it('does not dispatch Debug when the Judge returns an exit action', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge();
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(agent.calls.some((c) => c.opts.label === 'debug')).toBe(false);
  });
});

// --------------------------------------------------------------------------- dead agents

describe('verify-functional: dead Exercise agent', () => {
  it('records not_met for every criterion with a stated reason, exercised 0/N, and still runs the Judge', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return undefined; // -> null
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(agent.calls.some((c) => c.opts.label === 'judge')).toBe(true);
    expect(result.exercised).toBe('0/2');
    expect(capturedJudgePrompt).toMatch(/exerciser returned nothing/);
    expect(capturedJudgePrompt).toMatch(/"criterion":"FS-1"/);
  });
});

describe('verify-functional: dead Judge agent', () => {
  it('throws rather than continuing when the Judge returns nothing', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return undefined; // -> null
      return null;
    });

    await expect(runWorkflow(SOURCE, { agent, args: baseArgs() })).rejects.toThrow(/Judge stage returned no result/);
  });
});

describe('verify-functional: dead Debug agent', () => {
  it('leaves the gaps open and continues the loop rather than throwing', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return undefined; // -> null
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(result.outcome).toBe('satisfied');
    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(2);
    expect(agent.calls.filter((c) => c.opts.label === 'judge')).toHaveLength(2);
  });
});

// --------------------------------------------------------------------------- unbuilt from Debug

describe('verify-functional: Debug reports unbuilt', () => {
  it('skips the next Exercise and dispatches exactly one final Judge call', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediateJudge();
        return satisfiedJudge({ action: 'exit-unbuilt', gaps: [], unbuilt: ['FS-1'] });
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'capability absent', unbuilt: true }] };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(1); // only the first
    expect(agent.calls.filter((c) => c.opts.label === 'judge')).toHaveLength(2); // one final call
    expect(result.outcome).toBe('unbuilt');
    // Finding: `exercised` must reflect the FINAL iteration (§3.3), over the OPEN set (§3.4) --
    // not the "2/2" the first iteration's real Exercise call reported. FS-2 was judged "met" on
    // iteration 1 (remediateJudge()'s fixture) and so is settled and out of the open set by the
    // time iteration 2's (skipped) Exercise pass would have run -- only FS-1 remains open.
    expect(result.exercised).toBe('0/1');
  });
});

// --------------------------------------------------------------------------- empty criteria

describe('verify-functional: empty criteria array', () => {
  it('runs exactly one Judge agent, no Exercise/Debug, and returns satisfied with iterations 0', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'judge') return satisfiedJudge({ criteria: [], gaps: [] });
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [] }) });

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0].opts.label).toBe('judge');
    expect(result.outcome).toBe('satisfied');
    expect(result.iterations).toBe(0);
    expect(result.exercised).toBe('0/0');
  });
});

// --------------------------------------------------------------------------- Judge prompt content

describe('verify-functional: Judge prompt instructs checker-first', () => {
  it('instructs the checker CLI call before any content-reading instruction', async () => {
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    const checkerIdx = capturedPrompt.indexOf('check-evidence');
    const readIdx = capturedPrompt.indexOf('read the');
    expect(checkerIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeGreaterThan(-1);
    expect(checkerIdx).toBeLessThan(readIdx);
  });

  it('never interpolates JSON payloads directly into a quoted CLI argument', async () => {
    // Finding: an exerciser's free-text reason ("couldn't start the server") would terminate a
    // '<json>'-quoted shell argument mid-command. The judge prompt must route every payload
    // through a file (--file <path>) instead of inlining it in the command line.
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: null, reason: "couldn't start the server" }]);
      }
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(capturedPrompt).not.toMatch(/check-evidence\s+'/);
    expect(capturedPrompt).not.toMatch(/decide-next\s+'/);
    expect(capturedPrompt).not.toMatch(/render-report\s+'/);
    expect(capturedPrompt).toMatch(/check-evidence --file/);
    expect(capturedPrompt).toMatch(/decide-next --file/);
    expect(capturedPrompt).toMatch(/render-report --file/);
  });
});

// --------------------------------------------------------------------------- report header (Finding A)

describe('verify-functional: feature/prd/definitionPath reach the report header', () => {
  // Finding A: renderReport() destructures feature/prd/definitionPath but nothing in the
  // original args interface supplied them, so every report rendered "undefined" for all
  // three. The judge has no other source for these -- they must arrive via args and be
  // embedded verbatim in the judge's render-report instructions.
  it('embeds args.feature/args.prd/args.definitionPath verbatim in the judge prompt', async () => {
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [criterion('FS-1')],
        feature: 'functional-verification',
        prd: 'docs/PRD/functional-verification.md',
        definitionPath: '.trd-state/functional-verification/success-definition.md',
      }),
    });

    expect(capturedPrompt).toContain('"feature": "functional-verification"');
    expect(capturedPrompt).toContain('"prd": "docs/PRD/functional-verification.md"');
    expect(capturedPrompt).toContain(
      '"definitionPath": ".trd-state/functional-verification/success-definition.md"'
    );
  });

  it('defaults feature/prd/definitionPath to empty strings when args omits them', async () => {
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    // Omission stated explicitly rather than inherited from baseArgs(): the fixture now
    // supplies all 15 fields §3.3 declares, so a test about DEFAULTING must say which three
    // it is dropping. Depending on the fixture being incomplete made this test silently
    // sensitive to an unrelated fixture edit.
    const args = baseArgs({ criteria: [criterion('FS-1')] });
    delete args.feature;
    delete args.prd;
    delete args.definitionPath;

    await runWorkflow(SOURCE, { agent, args });

    expect(capturedPrompt).toContain('"feature": ""');
    expect(capturedPrompt).toContain('"prd": ""');
    expect(capturedPrompt).toContain('"definitionPath": ""');
  });
});

// --------------------------------------------------------------------------- resume state shape

describe('verify-functional: the Judge is told the exact state-file key names', () => {
  // implement-trd Step 8.2 reads verification-state.json back and passes it as
  // `resume: { iteration, criteria, gapsClosed }`. RESUME_ITERATION/RESUME_CRITERIA treat an
  // unrecognised key as absent, which silently restarts the loop at iteration 1 -- so the
  // writer (this prompt) and the reader (Step 8.2) must agree on the spelling.
  it('names iteration / criteria / gapsClosed / outcome in STEP 4', async () => {
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(capturedPrompt).toContain('"iteration": 1');
    expect(capturedPrompt).toContain('"criteria"');
    expect(capturedPrompt).toContain('"gapsClosed"');
    expect(capturedPrompt).toContain('"outcome"');
    expect(capturedPrompt).toContain('four top-level keys');
  });

  // THE TERMINALITY MARKER. implement-trd Step 3.6 step 0 gates the --resume composition on
  // this state file having a non-terminal outcome. Before `outcome` existed the Judge wrote
  // exactly three keys and none of them was one, so "carries no terminal outcome at all" was
  // ALWAYS true: any existing verification-state.json -- including one left by a run that
  // exited satisfied -- made every later `--verify --resume` skip the derive pass,
  // the entire phase loop AND the end-of-run hardening, and dispatch nothing. Composed with a
  // cap-exhausted resume, the whole run became a silent no-op that blamed the Judge for it.
  // Terminality cannot be derived from the other three keys: exit-unbuilt and exit-stalled
  // both leave not_met criteria behind at an iteration below the cap, so any
  // "has open gaps -> resumable" rule misreads both as resumable.
  it('tells the Judge that outcome is null on remediate and non-null on an exit action', async () => {
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    // null on remediate, a real outcome string otherwise -- both halves stated, now including
    // insufficient-coverage (VCON-B004, D10).
    expect(capturedPrompt).toMatch(/null when decide-next returned "remediate"/);
    expect(capturedPrompt).toMatch(/"satisfied", "unbuilt", "stalled", "stuck" or "insufficient-coverage"/);
    // The consequence is spelled out, so a judge that is tempted to omit the key knows why not.
    expect(capturedPrompt).toMatch(/Omitting the key\s+entirely reads as null/);
    expect(capturedPrompt).toContain('Write it on EVERY iteration');
    // gapsClosed is explicitly demoted to a record so nobody reads it as driving the loop.
    expect(capturedPrompt).toMatch(/"gapsClosed" is an AUDIT RECORD, not a loop input/);
  });

  // §3.3a step 3 and FV-B001's Reuse clause both bind the state write to
  // `implement-state.save()` -- a bare Write can leave a truncated state file that the next
  // `--resume` throws on. The script cannot require the module, so the prompt must name it.
  it('instructs the state write through implement-state.save(), not a plain file write', async () => {
    let capturedPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedPrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(capturedPrompt).toContain('./.claude/lib/implement-state');
    expect(capturedPrompt).toMatch(/save\(filePath, state\)/);
    expect(capturedPrompt).toMatch(/Do NOT write it with a plain file write/);
  });
});

// --------------------------------------------------------------------------- notesUpdated

describe('verify-functional: notesUpdated is sourced from the Exercise stage', () => {
  it('forwards the Exercise agent\'s notesUpdated report into the Judge prompt and the final result', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        return { claims: [{ criterion: 'FS-1', artifact: 'a' }], notesUpdated: true };
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ notesUpdated: true });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(capturedJudgePrompt).toMatch(/DID add or correct/);
    expect(result.notesUpdated).toBe(true);
  });

  it('reports false when the Exercise agent did not touch the notes file', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        return { claims: [{ criterion: 'FS-1', artifact: 'a' }], notesUpdated: false };
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ notesUpdated: false });
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(capturedJudgePrompt).toMatch(/did NOT add or correct/);
  });
});

// --------------------------------------------------------------------------- Exercise is scoped to the OPEN set (VCON-B006)

// This behaviour flipped under VCON-B006 (D4, §3.5): the Exercise prompt used to carry the
// WHOLE criteria set on every iteration (`buildExercisePrompt`'s only coupling was `iteration`).
// It now carries only this iteration's own SLICE of the OPEN set -- a criterion already settled
// (FS-1 here, proven met on iteration 1) is excluded from what a later iteration's slice is told
// about, because handing a slice agent a criterion outside its own list is the exact failure
// lane slicing exists to stop.
describe('verify-functional: Exercise is scoped to the open set, per slice', () => {
  it('carries every open criterion on the first iteration, and only what is STILL open on a later one', async () => {
    const exercisePrompts = [];
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompts.push(prompt);
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        // Iteration 1 settles FS-1 as met; FS-2 stays open and drives a second iteration.
        return judgeCalls === 1
          ? remediateJudge({
              criteria: [
                { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
                { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: [] },
              ],
              gaps: ['FS-2'],
              debugGaps: [{ id: 'FS-2', statement: 'statement for FS-2', reason: 'no artifact', artifact: null, files: [] }],
            })
          : satisfiedJudge({ criteria: [{ id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-2', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(exercisePrompts).toHaveLength(2);
    expect(exercisePrompts[0]).toMatch(/"FS-1"/);
    expect(exercisePrompts[0]).toMatch(/"FS-2"/);
    // FS-1 is settled by the time iteration 2's slice is built -- it must not reappear.
    expect(exercisePrompts[1]).not.toMatch(/"FS-1"/);
    expect(exercisePrompts[1]).toMatch(/"FS-2"/);
  });
});

// --------------------------------------------------------------------------- resume

describe('verify-functional: resume', () => {
  it('starts the loop at the next iteration and seeds previousGaps from the resume snapshot', async () => {
    let capturedExercisePrompt = null;
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        capturedExercisePrompt = prompt;
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    const resume = {
      iteration: 2,
      criteria: [
        { id: 'FS-1', status: 'not_met', artifact: null, reason: 'still broken' },
        { id: 'FS-2', status: 'met', artifact: 'b.txt', reason: null },
      ],
      gapsClosed: [],
    };

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume }) });

    expect(capturedExercisePrompt).toMatch(/iteration 3/);
    expect(capturedJudgePrompt).toMatch(/"FS-1"/); // previousGaps JSON includes the seeded gap
    expect(result.iterations).toBe(3);
  });

  // Cross-phase regression: implement-trd Step 3.6 step 0 skips the derive pass, the phase
  // loop AND the hardening step whenever a verification-state.json exists, then hands its
  // contents here as `resume`. A prior run that spent the whole cap leaves exactly such a
  // file, so this composition is reachable in normal use -- and before the guard below
  // existed it dispatched zero agents, rendered no report, and blamed the Judge for a cap
  // exhaustion the Judge was never given a turn to declare.
  it.each([
    ['at the cap', 3],
    ['past the cap', 5],
  ])('resuming %s dispatches nothing and says why, instead of blaming the Judge', async (_label, resumeIteration) => {
    const agent = makeAgentStub(() => satisfiedJudge());
    const resume = {
      iteration: resumeIteration,
      criteria: [
        { id: 'FS-1', status: 'not_met', artifact: null, reason: 'still broken' },
        { id: 'FS-2', status: 'met', artifact: 'b.txt', reason: null },
      ],
      gapsClosed: [],
    };

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume, cap: 3 }) });

    expect(agent.calls).toHaveLength(0);
    expect(result.outcome).toBe('stuck');
    expect(result.reason).toMatch(/prior run already spent the whole budget/);
    expect(result.reason).not.toMatch(/without the Judge returning an exit action/);
    // The banner tallies result.criteria; an empty array would report every count as 0 and
    // read as "nothing was ever established", which is false on a resume.
    expect(result.criteria).toHaveLength(2);
    expect(result.gaps).toEqual(['FS-1']);
    expect(result.iterations).toBe(resumeIteration);
  });
});

// --------------------------------------------------------------------------- cap

describe('verify-functional: iteration cap', () => {
  it('stops dispatching once args.cap is reached', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return remediateJudge(); // never resolves -- always asks to remediate
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'tried' }] }; // never marks unbuilt
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 2 }) });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(2);
    expect(agent.calls.filter((c) => c.opts.label === 'judge')).toHaveLength(2);
    expect(result.outcome).toBe('stuck');
  });
});

describe('verify-functional: args.cap validation', () => {
  it('throws rather than silently no-op-ing when cap is missing', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs();
    delete args.cap;
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.cap is required/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws when cap is non-numeric', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 'three' }) })).rejects.toThrow(/args\.cap is required/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws when cap is zero or negative', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 0 }) })).rejects.toThrow(/args\.cap is required/);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ cap: -1 }) })).rejects.toThrow(/args\.cap is required/);
  });
});

describe('verify-functional: required-argument guards', () => {
  it('throws naming evidenceDir when args.evidenceDir is missing', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs();
    delete args.evidenceDir;
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.evidenceDir/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws naming checker when args.checker is missing', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs();
    delete args.checker;
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.checker/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws naming since when args.since is missing', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs();
    delete args.since;
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.since/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws naming statePath when args.statePath is missing', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs();
    delete args.statePath;
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.statePath/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws naming reportPath when args.reportPath is missing', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs();
    delete args.reportPath;
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.reportPath/);
    expect(agent.calls).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------- project scoping

describe('verify-functional: args.project scoping', () => {
  it('adds no path-scoping line when project is empty', async () => {
    const prompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      prompts.push(prompt);
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge();
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ project: '' }) });

    for (const p of prompts) expect(p).not.toMatch(/PATH SCOPING/);
  });

  it('scopes every dispatched stage to args.project when it is set', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ project: '/tmp/target-repo' }) });

    const labels = ['exercise', 'judge', 'debug'];
    for (const label of labels) {
      const call = agent.calls.find((c) => c.opts.label === label);
      expect(call).toBeDefined();
      expect(call.prompt).toMatch(/PATH SCOPING/);
      expect(call.prompt).toMatch(/\/tmp\/target-repo/);
    }
  });

  // Cross-phase: `checker`, `evidenceDir`, `statePath` and `reportPath` are supplied by
  // implement-trd Step 8.3 as paths relative to the ORCHESTRATING repo (".claude/lib/...",
  // ".trd-state/<feature>/..."). A scope line that told the agent to re-root "every ... path"
  // under args.project would send it looking for the checker inside the target repo. The
  // scope line must therefore exempt the run's own artifacts explicitly.
  it('exempts the run-owned paths (checker, evidence, state, report, notes) from re-rooting', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge();
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ project: '/tmp/target-repo' }) });

    for (const call of agent.calls) {
      expect(call.prompt).toMatch(/do not re-root them under \/tmp\/target-repo/);
      expect(call.prompt).toMatch(/checker CLI, the evidence directory, the state file/);
      // The old wording claimed evidence and state paths resolve against the project.
      expect(call.prompt).not.toMatch(/config, evidence and state path resolves against THAT project/);
    }
  });
});

// --------------------------------------------------------------------------- malformed resume

describe('verify-functional: malformed resume snapshot', () => {
  it('does not throw or produce a NaN iteration when the state file is missing fields', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge();
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume: {} }) });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(1);
    expect(result.iterations).toBe(1);
    expect(result.outcome).toBe('satisfied');
  });
});

// --------------------------------------------------------------------------- mirror parity

describe('verify-functional: Exercise claim reconciliation', () => {
  it('drops a claim for an unknown criterion id and does not count it as exercised', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        // FS-2 is never walked; FS-99 is not in the definition at all.
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-99', artifact: 'z' }]);
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    const { result, logs } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    // Before reconciliation this read '2/2' -- two claims, two criteria -- even though one of
    // them was for an id the definition does not contain and FS-2 was never walked.
    expect(result.exercised).toBe('1/2');
    expect(capturedJudgePrompt).not.toMatch(/FS-99/);
    expect(logs.join('\n')).toMatch(/FS-99/);
  });

  it('synthesises an unbacked claim for a criterion the exerciser omitted', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }]);
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(result.exercised).toBe('1/2');
    const claimsLine = capturedJudgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1];
    const claims = JSON.parse(claimsLine);
    expect(claims.map((c) => c.criterion)).toEqual(['FS-1', 'FS-2']);
    expect(claims[1]).toMatchObject({ artifact: null });
    expect(claims[1].reason).toMatch(/no claim for this criterion/);
  });

  it('keeps the first of duplicate claims for the same criterion', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        return exercisePlanClaims([
          { criterion: 'FS-1', artifact: 'first' },
          { criterion: 'FS-1', artifact: 'second' },
          { criterion: 'FS-2', artifact: 'b' },
        ]);
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(result.exercised).toBe('2/2');
    const claims = JSON.parse(capturedJudgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1]);
    expect(claims).toHaveLength(2);
    expect(claims[0].artifact).toBe('first');
  });
});

// --------------------------------------------------------------------------- capture/repair boundary (VCON-B003, D11)

describe('verify-functional: Exercise capture-only prohibition', () => {
  it('every Exercise prompt, in every branch, forbids edit/rebuild/restart/re-deploy and is not preceded by any build/restart instruction', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 3 }) });

    const exerciseCalls = agent.calls.filter((c) => c.opts.label === 'exercise');
    expect(exerciseCalls.length).toBeGreaterThan(0);
    for (const call of exerciseCalls) {
      expect(call.prompt).toMatch(/CAPTURE ONLY/);
      expect(call.prompt).toMatch(/may bring the system up when nothing is already running/);
      expect(call.prompt).toMatch(/may\s+NOT edit source, rebuild, restart or re-deploy/);
      // No instruction telling the exerciser to build or restart anything precedes the walk.
      expect(call.prompt).not.toMatch(/\brebuild\b.*\bnow\b/i);
      expect(call.prompt).not.toMatch(/run the (refresh|build|deploy) command/i);
    }
  });
});

describe('verify-functional: Debug refresh (D11)', () => {
  it('runs the given refreshCommand as its last instructed act, after the fixes', async () => {
    let judgeCalls = 0;
    let capturedDebugPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') {
        capturedDebugPrompt = prompt;
        return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ refreshCommand: 'npm run dev:refresh' }) });

    expect(capturedDebugPrompt).toMatch(/npm run dev:refresh/);
    // The refresh instruction is the LAST thing in the prompt body (before the return-shape
    // instruction), not a step that precedes "fix the code in place".
    const fixIdx = capturedDebugPrompt.indexOf('Fix the code in place');
    const refreshIdx = capturedDebugPrompt.indexOf('npm run dev:refresh');
    expect(refreshIdx).toBeGreaterThan(fixIdx);
    expect(capturedDebugPrompt).toMatch(/LAST STEP/);
  });

  it('runs nothing and reports no error when refreshCommand is absent (defaults to "")', async () => {
    let judgeCalls = 0;
    let capturedDebugPrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') {
        capturedDebugPrompt = prompt;
        return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() }); // no refreshCommand

    expect(result.outcome).toBe('satisfied');
    expect(capturedDebugPrompt).toMatch(/No refresh command is declared/);
    expect(capturedDebugPrompt).not.toMatch(/LAST STEP/);
  });

  it('never appears in any Exercise prompt', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ refreshCommand: 'npm run dev:refresh' }) });

    const exerciseCalls = agent.calls.filter((c) => c.opts.label === 'exercise');
    for (const call of exerciseCalls) {
      expect(call.prompt).not.toMatch(/npm run dev:refresh/);
    }
  });
});

// --------------------------------------------------------------------------- settled/open partition (VCON-B004, D1/D2, §3.4)

function openIdsFrom(prompt) {
  const line = prompt.match(/still open, under judgement this iteration \(\d+ of \d+\):\n(.*)/)[1];
  return JSON.parse(line).map((c) => c.id);
}

function settledFrom(prompt) {
  const line = prompt.match(/do not belong in your "criteria" return below, which is for this iteration's judgements only:\n(.*)/)[1];
  return JSON.parse(line);
}

describe('verify-functional: settled/open partition across iterations', () => {
  it('narrows the Judge prompt and the claims payload to N-k criteria once k are proven met, and carries the k forward with their original artifact and provenAt', async () => {
    let judgeCalls = 0;
    const judgePrompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }, { criterion: 'FS-2', artifact: 'b.txt' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        judgePrompts.push(prompt);
        // Iteration 1 judges the whole (still fully open) definition: FS-1 met (k=1 of N=2),
        // FS-2 stays open.
        if (judgeCalls === 1) {
          return remediateJudge({
            reason: 'FS-2 not met',
            criteria: [
              { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
              { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: ['src/b.js'] },
            ],
            gaps: ['FS-2'],
            debugGaps: [{ id: 'FS-2', statement: 'statement for FS-2', reason: 'no artifact', artifact: null, files: ['src/b.js'] }],
          });
        }
        return satisfiedJudge({ criteria: [{ id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-2', result: 'fixed it' }] };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(judgePrompts).toHaveLength(2);
    // Iteration 1: nothing settled yet -- both criteria open, no settled entries.
    expect(openIdsFrom(judgePrompts[0])).toEqual(['FS-1', 'FS-2']);
    expect(settledFrom(judgePrompts[0])).toEqual([]);
    // Iteration 2: FS-1 (proven on iteration 1) is out of the open set (N-k = 1) and carried,
    // verbatim, as a settled entry with its original artifact and provenAt.
    expect(openIdsFrom(judgePrompts[1])).toEqual(['FS-2']);
    const settled2 = settledFrom(judgePrompts[1]);
    expect(settled2).toEqual([{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, provenAt: 1, statement: 'statement for FS-1', cites: 'FR-1' }]);
    // And the workflow's own final result -- which nothing but the settled map can supply,
    // since the Judge's structured return only ever carried FS-2 -- still reports FS-1 met.
    expect(result.criteria).toContainEqual(expect.objectContaining({ id: 'FS-1', status: 'met', artifact: 'a.txt', provenAt: 1 }));
  });

  it('excludes an already-settled criterion from the Exercise claims reconciliation', async () => {
    let judgeCalls = 0;
    let secondJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        // The exerciser is unaware of settlement and still walks everything (buildExercisePrompt
        // is untouched by this task) -- it returns a claim for the already-settled FS-1 too.
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'still-here.txt' }, { criterion: 'FS-2', artifact: 'b.txt' }]);
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [
              { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
              { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: [] },
            ],
            gaps: ['FS-2'],
            debugGaps: [{ id: 'FS-2', statement: 'statement for FS-2', reason: 'no artifact', artifact: null, files: [] }],
          });
        }
        secondJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [{ id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-2', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    // FS-1's claim on iteration 2 is discarded -- not passed to the Judge, not counted as
    // exercised, and not logged as unknown (it IS in the definition, just already settled).
    const claimsLine = secondJudgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1];
    const claims = JSON.parse(claimsLine);
    expect(claims.map((c) => c.criterion)).toEqual(['FS-2']);
  });

  it('ignores and logs a Judge entry for an already-settled criterion rather than overwriting it', async () => {
    let judgeCalls = 0;
    const judgePrompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }, { criterion: 'FS-2', artifact: 'b.txt' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        judgePrompts.push(prompt);
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [
              { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
              { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: [] },
            ],
            gaps: ['FS-2'],
            debugGaps: [{ id: 'FS-2', statement: 'statement for FS-2', reason: 'no artifact', artifact: null, files: [] }],
          });
        }
        // Iteration 2 misbehaves: it re-includes FS-1 (already settled as "met") with a
        // DIFFERENT status, as though re-judging it.
        return satisfiedJudge({
          criteria: [
            { id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'regressed', files: [] },
            { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] },
          ],
        });
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-2', result: 'fixed it' }] };
      return null;
    });

    const { result, logs } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    // The carried-forward entry wins -- FS-1 is still "met" with its original artifact, not
    // "not_met" with the bogus re-judgement, and the incident is logged.
    expect(result.criteria).toContainEqual(expect.objectContaining({ id: 'FS-1', status: 'met', artifact: 'a.txt' }));
    expect(result.criteria).not.toContainEqual(expect.objectContaining({ id: 'FS-1', status: 'not_met' }));
    expect(logs.join('\n')).toMatch(/already-settled criterion FS-1/);
  });

  it('stamps judgeOnly from the criterion row\'s tier1, discarding whatever the exerciser returned', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        // FS-1 is judge-only per the definition; the exerciser nonetheless returns a locator, as
        // though it thought tier 1 applied. FS-2 is an ordinary locator criterion.
        return exercisePlanClaims([
          { criterion: 'FS-1', artifact: 'pic.png', locator: 'a string it claims to have seen' },
          { criterion: 'FS-2', artifact: 'b.txt' },
        ]);
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [criterion('FS-1', { tier1: 'judge-only' }), criterion('FS-2')] }),
    });

    const claims = JSON.parse(capturedJudgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1]);
    expect(claims.find((c) => c.criterion === 'FS-1')).toMatchObject({ judgeOnly: true });
    expect(claims.find((c) => c.criterion === 'FS-2')).toMatchObject({ judgeOnly: false });
  });

  it('treats a Tier 1 cell carrying its reason ("judge-only — <why>", the contract\'s own form) as judge-only', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'pic.png' }]);
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [criterion('FS-1', { tier1: 'judge-only — pixel/colour comparison, no text assertion is possible' })] }),
    });

    const claims = JSON.parse(capturedJudgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1]);
    expect(claims[0]).toMatchObject({ criterion: 'FS-1', judgeOnly: true });
  });

  it('reloads only met resume entries as settled -- a not_verifiable entry goes back into the open set (D2)', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-2', artifact: 'b.txt' }, { criterion: 'FS-3', artifact: null, reason: 'env unreachable' }]);
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [
          { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] },
          { id: 'FS-3', status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'env unreachable', files: [] },
        ] });
      }
      return null;
    });

    const resume = {
      iteration: 1,
      criteria: [
        { id: 'FS-1', status: 'met', artifact: 'a.txt', reason: null, tier1: 'pass', provenAt: 1 },
        { id: 'FS-2', status: 'not_met', artifact: null, reason: 'still broken' },
        { id: 'FS-3', status: 'not_verifiable', artifact: null, reason: 'env unreachable, previous invocation' },
      ],
      gapsClosed: [],
    };

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], resume }),
    });

    // FS-1 (met) is the only one seeded as settled -- FS-3 (not_verifiable in a PRIOR
    // invocation) is back in the open set for this one, alongside FS-2 (never settled).
    expect(openIdsFrom(capturedJudgePrompt)).toEqual(['FS-2', 'FS-3']);
    const settled = settledFrom(capturedJudgePrompt);
    expect(settled).toEqual([{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, provenAt: 1, statement: 'statement for FS-1', cites: 'FR-1' }]);
    expect(result.criteria).toContainEqual(expect.objectContaining({ id: 'FS-1', status: 'met' }));
  });
});

// --------------------------------------------------------------------------- STEP 2's third clause (D7, §3.4)

describe('verify-functional: Judge STEP 2 is taught the "skipped" tier-1 verdict', () => {
  it('states that a skipped tier-1 verdict is judge-only, with no tier-1 gate in front of it', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'pic.png' }]);
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [{ id: 'FS-1', status: 'met', tier1: 'skipped', artifact: 'pic.png', reason: null, files: [] }] });
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1', { tier1: 'judge-only' })] }) });

    expect(capturedJudgePrompt).toMatch(/tier-1 verdict is "skipped" is judge-only/);
    expect(capturedJudgePrompt).toMatch(/no tier-1 gate in front of it/);
    expect(capturedJudgePrompt).toMatch(/absence from the "pass" list is not evidence against it/);
  });
});

// --------------------------------------------------------------------------- insufficient-coverage (VCON-B004, D10)

describe('verify-functional: insufficient-coverage is a first-class outcome', () => {
  it('maps a Judge exit-insufficient-coverage action to outcome "insufficient-coverage"', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        return satisfiedJudge({
          action: 'exit-insufficient-coverage',
          reason: 'proven ratio 1/2 (50.0%) is below the coverage floor 0.8',
        });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(result.outcome).toBe('insufficient-coverage');
  });

  it('is present in the JUDGE_SCHEMA action enum, in the run meta, and in the judge prompt\'s stated outcome list', async () => {
    // Source-level: the enum literal and the meta description both name the value directly, so
    // a Judge that returns it is not rejected outright and the loop's own self-description is
    // not left silently behind the vocabulary it now accepts.
    expect(SOURCE).toMatch(/enum:\s*\[[^\]]*'exit-insufficient-coverage'[^\]]*\]/);
    expect(SOURCE).toMatch(/insufficient/i);
    expect(SOURCE.match(/description:\s*\n?\s*'[^']*insufficient[^']*'/)).not.toBeNull();

    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] }] });
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(capturedJudgePrompt).toMatch(/"exit-insufficient-coverage"/);
    expect(capturedJudgePrompt).toMatch(/"insufficient-coverage"/);
  });
});

// --------------------------------------------------------------------------- decide-next's met/total (D8, §3.4)

describe('verify-functional: met/total reach the decide-next payload', () => {
  it('instructs "met" as the settled-met membership plus this iteration\'s own, and "total" as the whole definition\'s count', async () => {
    let judgeCalls = 0;
    let secondJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }, { criterion: 'FS-2', artifact: 'b.txt' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [
              { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
              { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: [] },
            ],
            gaps: ['FS-2'],
            debugGaps: [{ id: 'FS-2', statement: 'statement for FS-2', reason: 'no artifact', artifact: null, files: [] }],
          });
        }
        secondJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [{ id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-2', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    // Iteration 2: FS-1 is the one settled-met id carried in, total is the whole definition (2).
    expect(secondJudgePrompt).toMatch(/the 1 settled met id\(s\) carried below \(\["FS-1"\]\)/);
    expect(secondJudgePrompt).toMatch(/"total" is the whole definition's count, 2/);
    expect(secondJudgePrompt).toMatch(/"total":2/);
  });
});

// --------------------------------------------------------------------------- result coverage (§3.3)

describe('verify-functional: result carries coverage over the whole definition (§3.3)', () => {
  it('reports proven/total/uncovered from the final criteria, so /implement-trd §8.4 has a coverage line to render', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        return satisfiedJudge({
          criteria: [
            { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
            { id: 'FS-2', status: 'not_verifiable', tier1: 'skipped', artifact: null, reason: 'no environment', files: [] },
          ],
        });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(result.coverage).toEqual({ proven: 1, total: 2, uncovered: ['FS-2'] });
  });

  it('reports 0 of 0 with nothing uncovered when the definition is empty', async () => {
    const agent = makeAgentStub((prompt, opts) => (opts.label === 'judge' ? satisfiedJudge({ criteria: [] }) : null));

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [] }) });

    expect(result.coverage).toEqual({ proven: 0, total: 0, uncovered: [] });
  });
});

// --------------------------------------------------------------------------- end-of-run full-environment gate (D14, VCON-B005)

describe('verify-functional: end-of-run full-environment gate (D14)', () => {
  it('defaults to finalRun {command: "", status: "skipped"} when fullRunCommand is absent, and the Judge prompt says so', async () => {
    let judgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() }); // no fullRunCommand

    expect(result.finalRun).toEqual({ command: '', status: 'skipped' });
    expect(judgePrompt).toMatch(/no fullRunCommand is declared for this run/);
    expect(judgePrompt).toMatch(/meaning nobody declared one, never that one passed/);
  });

  it('instructs the Judge to run a declared fullRunCommand once, unless the action is exit-unbuilt, and does not run it in Exercise or Debug prompts', async () => {
    let judgePrompt = null;
    let exercisePrompt = null;
    let debugPrompt = null;
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompt = prompt;
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        judgePrompt = prompt;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge({ finalRun: { command: 'npm run deploy:check', status: 'pass' } });
      }
      if (opts.label === 'debug') {
        debugPrompt = prompt;
        return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ fullRunCommand: 'npm run deploy:check' }) });

    expect(judgePrompt).toMatch(/npm run deploy:check/);
    expect(judgePrompt).toMatch(/unless the action above is "exit-unbuilt"/);
    expect(result.finalRun).toEqual({ command: 'npm run deploy:check', status: 'pass' });
    expect(exercisePrompt).not.toMatch(/npm run deploy:check/);
    expect(debugPrompt).not.toMatch(/npm run deploy:check/);
  });

  it('a failed full run is reported without changing the outcome string', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge({ finalRun: { command: 'npm run deploy:check', status: 'fail' } });
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ fullRunCommand: 'npm run deploy:check' }) });

    expect(result.outcome).toBe('satisfied');
    expect(result.finalRun).toEqual({ command: 'npm run deploy:check', status: 'fail' });
  });

  it('is always skipped on exit-unbuilt, even if the Judge returns something else', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        return remediateJudge({ action: 'exit-unbuilt', unbuilt: ['FS-1'], finalRun: { command: 'npm run deploy:check', status: 'pass' } });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ fullRunCommand: 'npm run deploy:check' }) });

    expect(result.outcome).toBe('unbuilt');
    expect(result.finalRun).toEqual({ command: 'npm run deploy:check', status: 'skipped' });
  });

  it('reports a fail rather than a skip when a command is declared, the exit calls for it, and the Judge omits finalRun', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge(); // no finalRun on the return
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ fullRunCommand: 'npm run deploy:check' }) });

    expect(result.finalRun).toEqual({ command: 'npm run deploy:check', status: 'fail' });
  });

  it('zero-criteria run still computes finalRun through the same Judge call', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'judge') return satisfiedJudge({ criteria: [], gaps: [], finalRun: { command: 'npm run deploy:check', status: 'pass' } });
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [], fullRunCommand: 'npm run deploy:check' }) });

    expect(result.finalRun).toEqual({ command: 'npm run deploy:check', status: 'pass' });
  });

  it('finalRun is null on a not-run exit: a resume with no iteration budget left dispatches nothing', async () => {
    const agent = makeAgentStub(() => satisfiedJudge());
    const resume = {
      iteration: 3,
      criteria: [
        { id: 'FS-1', status: 'not_met', artifact: null, reason: 'still broken' },
        { id: 'FS-2', status: 'met', artifact: 'b.txt', reason: null },
      ],
      gapsClosed: [],
    };

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume, cap: 3, fullRunCommand: 'npm run deploy:check' }) });

    expect(agent.calls).toHaveLength(0);
    expect(result.outcome).toBe('stuck');
    expect(result.finalRun).toBeNull();
  });

  it('finalRun is null on a not-run exit: the cap is reached without the Judge ever returning an exit action', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return remediateJudge(); // never resolves
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'tried' }] };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 2, fullRunCommand: 'npm run deploy:check' }) });

    expect(result.outcome).toBe('stuck');
    expect(result.reason).toMatch(/without the Judge returning an exit action/);
    expect(result.finalRun).toBeNull();
  });
});

// --------------------------------------------------------------------------- lane-based Exercise slicing (VCON-B006, D4/D5, §3.5)

function manyCriteria(n, prefix = 'FS') {
  return Array.from({ length: n }, (_, i) => criterion(`${prefix}-${i + 1}`));
}

// Every scenario below settles on the FIRST judge call so exactly one Exercise iteration
// dispatches -- the slicing arithmetic is the thing under test, not the loop's iteration count.
function firstIterationSatisfied(allIds) {
  return satisfiedJudge({ criteria: allIds.map((id) => ({ id, status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] })) });
}

describe('verify-functional: lane-based Exercise slicing', () => {
  it('absent exerciseLanes dispatches exactly one Exercise agent over the whole open set (today\'s behaviour)', async () => {
    const ids = manyCriteria(5).map((c) => c.id);
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims(ids.map((id) => ({ criterion: id, artifact: 'a' })));
      if (opts.label === 'judge') return firstIterationSatisfied(ids);
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: manyCriteria(5) }) });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(1);
    expect(result.exercised).toBe('5/5');
  });

  it('one lane of 20 open at concurrency 4 dispatches 3 slices of 7 / 7 / 6, not 4', async () => {
    const criteria = manyCriteria(20);
    const ids = criteria.map((c) => c.id);
    const sliceSizes = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        sliceSizes.push(parsed.length);
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied(ids);
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria, exerciseLanes: [{ resource: 'simulator', concurrency: 4, createCommand: '', criteria: ids }] }),
    });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(3);
    expect(sliceSizes.sort((a, b) => b - a)).toEqual([7, 7, 6]);
    expect(sliceSizes.reduce((a, b) => a + b, 0)).toBe(20);
    expect(result.exercised).toBe('20/20');
  });

  it('the same 20-open lane at concurrency 1 dispatches exactly one agent with all 20', async () => {
    const criteria = manyCriteria(20);
    const ids = criteria.map((c) => c.id);
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied(ids);
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria, exerciseLanes: [{ resource: 'simulator', concurrency: 1, createCommand: '', criteria: ids }] }),
    });

    const exerciseCalls = agent.calls.filter((c) => c.opts.label === 'exercise');
    expect(exerciseCalls).toHaveLength(1);
    expect(JSON.parse(exerciseCalls[0].prompt.match(/Criteria:\n(.*)/)[1])).toHaveLength(20);
    expect(result.exercised).toBe('20/20');
  });

  it('two lanes -- a queue of 9 and a pool of 20 at concurrency 4 -- dispatch 4 slices in ONE batch, and the queue slice carries only its own 9 (O12)', async () => {
    const queueCriteria = manyCriteria(9, 'Q');
    const poolCriteria = manyCriteria(20, 'P');
    const allCriteria = [...queueCriteria, ...poolCriteria];
    const allIds = allCriteria.map((c) => c.id);
    const sliceSizes = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        sliceSizes.push(parsed.length);
        // O12's assertion: a slice from the queue lane must carry ONLY queue criteria.
        if (parsed.length === 9) {
          expect(parsed.every((c) => c.id.startsWith('Q-'))).toBe(true);
        }
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied(allIds);
      return null;
    });
    const parallel = makeParallelStub();

    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel,
      args: baseArgs({
        criteria: allCriteria,
        exerciseLanes: [
          { resource: 'probe-row', concurrency: 1, createCommand: '', criteria: queueCriteria.map((c) => c.id) },
          { resource: 'simulator', concurrency: 4, createCommand: 'xcrun simctl create', criteria: poolCriteria.map((c) => c.id) },
        ],
      }),
    });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(4);
    expect(sliceSizes.sort((a, b) => b - a)).toEqual([9, 7, 7, 6]);
    expect(parallel.waves).toHaveLength(1); // one batch: 4 slices is well under the 20-way cap
    expect(parallel.waves[0].size).toBe(4);
    expect(result.exercised).toBe('29/29');
  });

  it('lane concurrencies summing to 25 produce 25 slices dispatched as two batches (20 then 5), no criterion dropped', async () => {
    const criteria = manyCriteria(200); // plenty of open criteria to fill every slice
    const ids = criteria.map((c) => c.id);
    const seenIds = new Set();
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        for (const c of parsed) seenIds.add(c.id);
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied(ids);
      return null;
    });
    const parallel = makeParallelStub();

    // Two lanes of concurrency 20 and 5, each with enough open criteria that
    // ceil(openInLane / SLICE_SIZE) reaches the lane's own concurrency -- 160 criteria gives
    // ceil(160/8) = 20, and 40 gives ceil(40/8) = 5 -- so sliceCount === concurrency for both
    // and this produces exactly 20 + 5 = 25 slices.
    const { result } = await runWorkflow(SOURCE, {
      agent,
      parallel,
      args: baseArgs({
        criteria,
        exerciseLanes: [
          { resource: 'a', concurrency: 20, createCommand: '', criteria: ids.slice(0, 160) },
          { resource: 'b', concurrency: 5, createCommand: '', criteria: ids.slice(160) },
        ],
      }),
    });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(25);
    expect(parallel.waves).toHaveLength(2);
    expect(parallel.waves.map((w) => w.size).sort((a, b) => b - a)).toEqual([20, 5]);
    expect(seenIds.size).toBe(200); // every criterion reached some slice
    expect(result.exercised).toBe('200/200');
  });

  it('a resource: null lane of 9 criteria at concurrency 9 dispatches ceil(9/8) = 2 slices -- the concurrency term does not bind', async () => {
    const criteria = manyCriteria(9);
    const ids = criteria.map((c) => c.id);
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied(ids);
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria, exerciseLanes: [{ resource: null, concurrency: 9, createCommand: '', criteria: ids }] }),
    });

    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(2);
    expect(result.exercised).toBe('9/9');
  });

  it('a slice in a lane with a non-empty createCommand is told it may create at most one instance and must tear it down; an empty createCommand says it may not', async () => {
    const withCreate = manyCriteria(2, 'C');
    const withoutCreate = manyCriteria(2, 'N');
    const prompts = { create: null, noCreate: null };
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        if (parsed[0].id.startsWith('C-')) prompts.create = prompt;
        else prompts.noCreate = prompt;
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied([...withCreate, ...withoutCreate].map((c) => c.id));
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [...withCreate, ...withoutCreate],
        exerciseLanes: [
          { resource: 'simulator', concurrency: 1, createCommand: 'xcrun simctl create', criteria: withCreate.map((c) => c.id) },
          { resource: 'other', concurrency: 1, createCommand: '', criteria: withoutCreate.map((c) => c.id) },
        ],
      }),
    });

    expect(prompts.create).toMatch(/MAY create AT MOST ONE instance/);
    expect(prompts.create).toMatch(/xcrun simctl create/);
    expect(prompts.create).toMatch(/MUST tear it down/);
    expect(prompts.noCreate).toMatch(/No create\/destroy command is declared/);
    expect(prompts.noCreate).toMatch(/you may NOT create one/);
  });

  it('a criterion in no lane is exercised by nothing, reaches the Judge as one synthesized not_verifiable-shaped claim, and does not stay open', async () => {
    const inLane = criterion('FS-1');
    const orphan = criterion('FS-2');
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        // FS-2 must never be handed to any Exercise agent -- it is in no lane.
        expect(parsed.some((c) => c.id === 'FS-2')).toBe(false);
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({
          criteria: [
            { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'FS-2', status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'no exercise lane: the declarations reach no environment that covers this criterion', files: [] },
          ],
        });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [inLane, orphan],
        exerciseLanes: [{ resource: 'simulator', concurrency: 1, createCommand: '', criteria: ['FS-1'] }],
      }),
    });

    const claimsLine = capturedJudgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1];
    const claims = JSON.parse(claimsLine);
    const fs2Claim = claims.find((c) => c.criterion === 'FS-2');
    expect(fs2Claim).toBeTruthy();
    expect(fs2Claim.artifact).toBeNull();
    expect(fs2Claim.reason).toMatch(/no exercise lane: the declarations reach no environment that covers this criterion/);
    expect(result.criteria).toContainEqual(expect.objectContaining({ id: 'FS-2', status: 'not_verifiable' }));
    // exercised counts only the ONE actually-exercised criterion, not the orphan.
    expect(result.exercised).toBe('1/2');
  });

  it('a slice agent returning nothing leaves only that slice\'s criteria open, without failing the iteration', async () => {
    const laneA = manyCriteria(2, 'A');
    const laneB = manyCriteria(2, 'B');
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        const parsed = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]);
        if (parsed[0].id.startsWith('A-')) return undefined; // -> null: dead slice
        return exercisePlanClaims(parsed.map((c) => ({ criterion: c.id, artifact: 'a' })));
      }
      if (opts.label === 'judge') return firstIterationSatisfied([...laneA, ...laneB].map((c) => c.id));
      return null;
    });

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [...laneA, ...laneB],
        exerciseLanes: [
          { resource: 'a', concurrency: 1, createCommand: '', criteria: laneA.map((c) => c.id) },
          { resource: 'b', concurrency: 1, createCommand: '', criteria: laneB.map((c) => c.id) },
        ],
      }),
    });

    // Lane B's two criteria were actually walked; lane A's two were not -- exercised is 2/4, not
    // 0/4 (one dead slice does not fail the whole iteration) and not 4/4 (a dead slice's
    // criteria are not counted as walked).
    expect(result.exercised).toBe('2/4');
  });
});

describe('verify-functional: exerciseLanes validation', () => {
  it('throws when exerciseLanes is not an array', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ exerciseLanes: { resource: null } }) })).rejects.toThrow(/exerciseLanes must be an array/);
  });

  it('throws when a lane concurrency is not a positive integer', async () => {
    const agent = makeAgentStub(() => null);
    await expect(
      runWorkflow(SOURCE, { agent, args: baseArgs({ exerciseLanes: [{ resource: null, concurrency: 0, createCommand: '', criteria: ['FS-1', 'FS-2'] }] }) })
    ).rejects.toThrow(/invalid concurrency/);
  });

  it('throws when a lane names a criterion id absent from the definition', async () => {
    const agent = makeAgentStub(() => null);
    await expect(
      runWorkflow(SOURCE, { agent, args: baseArgs({ exerciseLanes: [{ resource: null, concurrency: 1, createCommand: '', criteria: ['FS-1', 'NOT-A-CRITERION'] }] }) })
    ).rejects.toThrow(/unknown criterion id/);
  });

  it('throws when the same criterion id appears in two lanes', async () => {
    const agent = makeAgentStub(() => null);
    await expect(
      runWorkflow(SOURCE, {
        agent,
        args: baseArgs({
          exerciseLanes: [
            { resource: 'a', concurrency: 1, createCommand: '', criteria: ['FS-1'] },
            { resource: 'b', concurrency: 1, createCommand: '', criteria: ['FS-1', 'FS-2'] },
          ],
        }),
      })
    ).rejects.toThrow(/appears in more than one lane/);
  });
});

describe('verify-functional: mirror parity', () => {
  it('is byte-identical to the .claude/workflows/ copy', () => {
    const mirrorPath = path.join(__dirname, '..', '..', '..', '.claude', 'workflows', 'verify-functional.js');
    const mirrored = fs.readFileSync(mirrorPath, 'utf8');
    expect(mirrored).toBe(SOURCE);
  });
});
