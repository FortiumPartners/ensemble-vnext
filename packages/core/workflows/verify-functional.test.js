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
const { readScript, runWorkflow, makeAgentStub } = require('./test-harness');

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

  it('contains no workflow( call and no parallel( call', () => {
    expect(SOURCE).not.toMatch(/\bworkflow\s*\(/);
    expect(SOURCE).not.toMatch(/\bparallel\s*\(/);
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
    // Finding: `exercised` must reflect the FINAL iteration (§3.3), which skipped Exercise --
    // not the "2/2" the first iteration's real Exercise call reported.
    expect(result.exercised).toBe('0/2');
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

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

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
  // exited satisfied -- made every later `--verify-functional --resume` skip the derive pass,
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

    // null on remediate, a real outcome string otherwise -- both halves stated.
    expect(capturedPrompt).toMatch(/null when decide-next returned "remediate"/);
    expect(capturedPrompt).toMatch(/"satisfied", "unbuilt", "stalled" or "stuck"/);
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

// --------------------------------------------------------------------------- full criteria every iteration

describe('verify-functional: every criterion is passed to Exercise on every iteration', () => {
  it('includes all criterion ids in the Exercise prompt on both the first and a later iteration', async () => {
    const exercisePrompts = [];
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompts.push(prompt);
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed it' }] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(exercisePrompts).toHaveLength(2);
    for (const p of exercisePrompts) {
      expect(p).toMatch(/"FS-1"/);
      expect(p).toMatch(/"FS-2"/);
    }
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

describe('verify-functional: mirror parity', () => {
  it('is byte-identical to the .claude/workflows/ copy', () => {
    const mirrorPath = path.join(__dirname, '..', '..', '..', '.claude', 'workflows', 'verify-functional.js');
    const mirrored = fs.readFileSync(mirrorPath, 'utf8');
    expect(mirrored).toBe(SOURCE);
  });
});
