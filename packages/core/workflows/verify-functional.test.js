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
const { readScript, runWorkflow, makeAgentStub, makeParallelStub, unpinnedLabels } = require('./test-harness');

const SOURCE = readScript('verify-functional.js');

function criterion(id, overrides = {}) {
  return { id, statement: `statement for ${id}`, cites: 'FR-1', evidence: 'some artifact', derivation: '[read]', ...overrides };
}

// A check-derived criterion (D15): derivation "check:<skill>", judge-only tier 1 (design rows
// are pictorial; flow/data rows use "locator" instead, per §3.1 -- tests that need that
// distinction override tier1 explicitly).
function checkCriterion(id, skill, overrides = {}) {
  return criterion(id, { derivation: `check:${skill}`, tier1: 'judge-only -- pictorial comparison', ...overrides });
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent: agent2, args: baseArgs({ cap: 3 }) });

    const labels = agent2.calls.map((c) => c.opts.label);
    // The trailing state-sync is the exit's own state write after a Debug pass (regression pass D18b).
    expect(labels).toEqual(['exercise', 'judge', 'debug', 'exercise', 'judge', 'state-sync']);
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
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

    const { result, logs } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(result.outcome).toBe('satisfied');
    // A dead Debug agent addresses no cause (causes D9), so the next Exercise set holds nothing:
    // no representative is re-captured and no loop exerciser is dispatched. What it changed is
    // unknown, though, so the regression pass at the exit re-checks the one criterion already proven.
    const exercises = agent.calls.filter((c) => c.opts.label === 'exercise');
    expect(exercises).toHaveLength(2);
    expect(exercises[1].prompt).toMatch(/regression pass 1 at the end of iteration 2/);
    expect(exercises[1].prompt).toContain('"id":"FS-2"');
    expect(exercises[1].prompt).not.toContain('"id":"FS-1"');
    expect(agent.calls.filter((c) => c.opts.label === 'judge')).toHaveLength(3);
    expect(logs.join('\n')).toMatch(/Debug returned nothing -- no cause addressed/);
  });
});

// --------------------------------------------------------------------------- evidence-capture gaps skip Debug

describe('verify-functional: evidence-capture gaps go back to Exercise, not Debug', () => {
  for (const cause of ['locator-not-found', 'evidence-missing', 'evidence-stale']) {
    it(`${cause}: no Debug dispatch; the next Exercise prompt states the failure`, async () => {
      let judgeCalls = 0;
      const agent = makeAgentStub((prompt, opts) => {
        if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
        if (opts.label === 'judge') {
          judgeCalls += 1;
          if (judgeCalls > 1) return satisfiedJudge();
          const j = remediateJudge();
          j.criteria[0] = { ...j.criteria[0], cause, reason: 'locator "Total: 5" not in artifact' };
          j.debugGaps = [{ id: 'FS-1', statement: 'statement for FS-1', reason: 'locator "Total: 5" not in artifact', artifact: 'a', files: [] }];
          return j;
        }
        return null;
      });

      const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

      expect(result.outcome).toBe('satisfied');
      expect(agent.calls.filter((c) => c.opts.label === 'debug')).toHaveLength(0);
      const exercisePrompts = agent.calls.filter((c) => c.opts.label === 'exercise').map((c) => c.prompt);
      expect(exercisePrompts).toHaveLength(2);
      expect(exercisePrompts[0]).not.toMatch(/RE-CAPTURE REQUIRED/);
      expect(exercisePrompts[1]).toMatch(/RE-CAPTURE REQUIRED/);
      expect(exercisePrompts[1]).toContain(cause);
      expect(exercisePrompts[1]).toContain('not in artifact');
    });
  }

  it('a mixed set sends only the build gap to Debug and the capture gap to Exercise', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls > 1) return satisfiedJudge();
        return remediateJudge({
          criteria: [
            { id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'wrong output', cause: 'judged-failed', files: [] },
            { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'stale copy', cause: 'evidence-stale', files: [] },
          ],
          gaps: ['FS-1', 'FS-2'],
          debugGaps: [
            { id: 'FS-1', statement: 's1', reason: 'wrong output', artifact: null, files: [] },
            { id: 'FS-2', statement: 's2', reason: 'stale copy', artifact: null, files: [] },
          ],
        });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed' }], filesChanged: [] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    const debugCalls = agent.calls.filter((c) => c.opts.label === 'debug');
    expect(debugCalls).toHaveLength(1);
    expect(debugCalls[0].prompt).toContain('wrong output');
    expect(debugCalls[0].prompt).not.toContain('stale copy');
    expect(agent.calls.filter((c) => c.opts.label === 'exercise')[1].prompt).toMatch(/RE-CAPTURE REQUIRED[\s\S]*evidence-stale/);
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'capability absent', unbuilt: true }], filesChanged: [] };
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
    expect(agent.calls[0].opts.model).toBe('opus'); // pinned even on the empty-criteria Judge call
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
    expect(capturedPrompt).toContain('six top-level keys');
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
    expect(capturedPrompt).toMatch(/"satisfied", "unbuilt", "stalled", "stuck", "insufficient-coverage", "must-pass-unproven" or "setup-failure"/);
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
      // The first prompts only: the resumed FS-2 is re-checked by the regression pass at the exit, because
      // a resume that continues a run cannot say what its last Debug pass changed (regression pass D18a).
      if (opts.label === 'exercise') {
        capturedExercisePrompt = capturedExercisePrompt || prompt;
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = capturedJudgePrompt || prompt;
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
    // the first resumed pass walks every criterion the snapshot does not hold as met
    expect(JSON.parse(capturedExercisePrompt.match(/\nCriteria:\n(\[.*\])\n/)[1]).map((c) => c.id)).toEqual(['FS-1']);
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'tried' }], filesChanged: [] }; // never marks unbuilt
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
        return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ refreshCommand: 'npm run dev:refresh' }) });

    expect(capturedDebugPrompt).toMatch(/npm run dev:refresh/);
    // The command appears once. The refresh is the last step that changes anything: it follows the
    // fix instruction, and the named pre-checks (causes D10) come after it, never before.
    expect(capturedDebugPrompt.split('npm run dev:refresh')).toHaveLength(2);
    const fixIdx = capturedDebugPrompt.indexOf('Fix every cause once');
    const refreshIdx = capturedDebugPrompt.indexOf('npm run dev:refresh');
    const preCheckIdx = capturedDebugPrompt.indexOf('PRE-CHECKS');
    expect(fixIdx).toBeGreaterThan(-1);
    expect(refreshIdx).toBeGreaterThan(fixIdx);
    expect(preCheckIdx).toBeGreaterThan(refreshIdx);
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
        return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
    expect(settled2).toEqual([{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, provenAt: 1, statement: 'statement for FS-1', cites: 'FR-1' }]);
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
    let capturedExercisePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        capturedExercisePrompt = prompt;
        return exercisePlanClaims([{ criterion: 'FS-2', artifact: 'b.txt' }, { criterion: 'FS-3', artifact: null, reason: 'env unreachable' }]);
      }
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [
          { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, files: [] },
          { id: 'FS-3', status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'env unreachable', files: [] },
        ] });
      }
      return null;
    });

    // iteration 0 (a /verify-build fix-round snapshot): this test is about which entries seed `settled`;
    // a snapshot that continues a run (iteration >= 1) also queues its `met` for the regression pass.
    const resume = {
      iteration: 0,
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
    expect(JSON.parse(capturedExercisePrompt.match(/\nCriteria:\n(\[.*\])\n/)[1]).map((c) => c.id)).toEqual(['FS-2', 'FS-3']);
    const settled = settledFrom(capturedJudgePrompt);
    expect(settled).toEqual([{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, provenAt: 1, statement: 'statement for FS-1', cites: 'FR-1' }]);
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed it' }], filesChanged: [] };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() });

    // Iteration 2: FS-1 is the one settled-met id carried in, total is the whole definition (2).
    expect(secondJudgePrompt).toMatch(/the 1 settled met id\(s\) carried below \(\["FS-1"\]\)/);
    expect(secondJudgePrompt).toMatch(/"total" is the whole definition's count, 2/);
    expect(secondJudgePrompt).toMatch(/"total":2/);
  });
});

// --------------------------------------------------------------------------- coverageFloor (D8, §3.3)

describe('verify-functional: args.coverageFloor reaches the decide-next payload', () => {
  it('carries a declared fraction into the STEP 3 payload as "coverageFloor":<value>', async () => {
    let judgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ coverageFloor: 0.6 }) });

    expect(judgePrompt).toMatch(/"coverageFloor":0\.6/);
  });

  it('defaults to "coverageFloor":null when omitted, leaving decideNext\'s re-label dormant', async () => {
    let judgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs() }); // no coverageFloor

    expect(judgePrompt).toMatch(/"coverageFloor":null/);
  });

  it('treats an explicit null the same as omitted', async () => {
    let judgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgePrompt = prompt;
        return satisfiedJudge();
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ coverageFloor: null }) });

    expect(judgePrompt).toMatch(/"coverageFloor":null/);
  });
});

describe('verify-functional: args.coverageFloor validation', () => {
  it('throws before any agent is dispatched on a percentage (>1), not a fraction', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ coverageFloor: 60 }) })).rejects.toThrow(
      /args\.coverageFloor must be null or a number in \[0, 1\]/
    );
    expect(agent.calls).toHaveLength(0);
  });

  it('throws on a negative fraction', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ coverageFloor: -0.1 }) })).rejects.toThrow(
      /args\.coverageFloor must be null or a number in \[0, 1\]/
    );
    expect(agent.calls).toHaveLength(0);
  });

  it('throws on a string, even one that parses as a number', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ coverageFloor: '0.6' }) })).rejects.toThrow(
      /args\.coverageFloor must be null or a number in \[0, 1\]/
    );
    expect(agent.calls).toHaveLength(0);
  });

  it('throws on NaN', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ coverageFloor: NaN }) })).rejects.toThrow(
      /args\.coverageFloor must be null or a number in \[0, 1\]/
    );
    expect(agent.calls).toHaveLength(0);
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
        return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
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
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'tried' }], filesChanged: [] };
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

// --------------------------------------------------------------------------- checks/checkComments/pagesDir (VART-B004, §3.6)

describe('verify-functional: checks/checkComments/pagesDir validation', () => {
  it('throws before any agent when a check criterion has no matching checks[<skill>] text', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs({
      criteria: [checkCriterion('DC-1', 'verify-design-comparison')],
      checks: {},
      pagesDir: '.trd-state/example/verification-artifacts',
    });
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.checks has no text for skill/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws when args.checks is not a plain object', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ checks: ['nope'] }) })).rejects.toThrow(/args\.checks must be a plain object/);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ checks: 'nope' }) })).rejects.toThrow(/args\.checks must be a plain object/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws when args.checkComments is not an array', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ checkComments: {} }) })).rejects.toThrow(/args\.checkComments must be an array/);
    expect(agent.calls).toHaveLength(0);
  });

  it('throws when a check criterion exists and args.pagesDir is empty', async () => {
    const agent = makeAgentStub(() => null);
    const args = baseArgs({
      criteria: [checkCriterion('DC-1', 'verify-design-comparison')],
      checks: { 'verify-design-comparison': 'SKILL TEXT' },
      pagesDir: '',
    });
    await expect(runWorkflow(SOURCE, { agent, args })).rejects.toThrow(/args\.pagesDir is required/);
    expect(agent.calls).toHaveLength(0);
  });

  it('does not require pagesDir when no criterion is check-derived', async () => {
    const agent = makeAgentStub((prompt, opts) => (opts.label === 'judge' ? satisfiedJudge({ criteria: [], gaps: [] }) : null));
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [], pagesDir: '' }) })).resolves.toBeDefined();
  });
});

// --------------------------------------------------------------------------- Exercise: check-skill injection (D11, §3.6)

describe('verify-functional: check-skill prompt injection -- Exercise', () => {
  it('a slice holding a check row carries that skill\'s text and "Capture"; a slice without one carries no skill text', async () => {
    const exercisePrompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompts.push(prompt);
        const ids = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]).map((c) => c.id);
        return exercisePlanClaims(ids.map((id) => ({ criterion: id, artifact: 'a' })));
      }
      if (opts.label === 'judge') {
        return satisfiedJudge({
          criteria: [
            { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
          ],
        });
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [criterion('FS-1'), checkCriterion('DC-1', 'verify-design-comparison')],
        checks: { 'verify-design-comparison': 'THE SKILL TEXT MARKER' },
        pagesDir: '.trd-state/example/verification-artifacts',
        exerciseLanes: [
          { resource: 'a', concurrency: 1, createCommand: '', criteria: ['FS-1'] },
          { resource: 'b', concurrency: 1, createCommand: '', criteria: ['DC-1'] },
        ],
      }),
    });

    expect(exercisePrompts).toHaveLength(2);
    const withCheck = exercisePrompts.find((p) => p.includes('THE SKILL TEXT MARKER'));
    const withoutCheck = exercisePrompts.find((p) => p !== withCheck);
    expect(withCheck).toBeDefined();
    expect(withoutCheck).toBeDefined();
    expect(withCheck).toMatch(/CHECK `verify-design-comparison`/);
    expect(withCheck).toMatch(/Capture/);
    expect(withoutCheck).not.toContain('THE SKILL TEXT MARKER');
    expect(withoutCheck).not.toMatch(/CHECK `/);
  });
});

// --------------------------------------------------------------------------- checkComments routing (D18, §3.6, VART-B004)
//
// D18: `checkComments: [{ criterion | null, skill, text }]`. A comment naming a specific
// criterion is scoped to that criterion in Exercise (the slice holding it); a comment naming
// no criterion (`criterion: null`) is a skill-wide remark the Judge alone must see, per D18
// ("the Judge must address every comment on it") and the Exercise injection comment above
// ("scoped to the criteria that slice actually holds").

describe('verify-functional: checkComments reach the Exercise and Judge prompts', () => {
  it('routes a criterion-scoped comment to its own Exercise slice and to the Judge; a skill-wide (criterion: null) comment reaches only the Judge', async () => {
    const exercisePrompts = [];
    const judgePrompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompts.push(prompt);
        const ids = JSON.parse(prompt.match(/Criteria:\n(.*)/)[1]).map((c) => c.id);
        return exercisePlanClaims(ids.map((id) => ({ criterion: id, artifact: 'a' })));
      }
      if (opts.label === 'judge') {
        judgePrompts.push(prompt);
        return satisfiedJudge({
          criteria: [
            { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'DC-2', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
          ],
        });
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [checkCriterion('DC-1', 'verify-design-comparison'), checkCriterion('DC-2', 'verify-design-comparison')],
        checks: { 'verify-design-comparison': 'THE SKILL TEXT' },
        pagesDir: '.trd-state/example/verification-artifacts',
        // one lane per criterion, so each ends up in its own Exercise slice
        exerciseLanes: [
          { resource: 'a', concurrency: 1, createCommand: '', criteria: ['DC-1'] },
          { resource: 'b', concurrency: 1, createCommand: '', criteria: ['DC-2'] },
        ],
        checkComments: [
          { criterion: 'DC-1', skill: 'verify-design-comparison', text: 'OWNER SAYS DC-1 IS WRONG' },
          { criterion: null, skill: 'verify-design-comparison', text: 'OWNER GENERAL REMARK' },
        ],
      }),
    });

    expect(exercisePrompts).toHaveLength(2);
    // Identify each slice by the criteria it actually holds (its `Criteria:` line), the same
    // way the stub above does -- never by a substring the injected comments could also carry.
    const sliceIds = (p) => JSON.parse(p.match(/Criteria:\n(.*)/)[1]).map((c) => c.id);
    const dc1Prompt = exercisePrompts.find((p) => sliceIds(p).includes('DC-1'));
    const dc2Prompt = exercisePrompts.find((p) => sliceIds(p).includes('DC-2'));
    expect(dc1Prompt).not.toBe(dc2Prompt);
    expect(dc1Prompt).toBeDefined();
    expect(dc2Prompt).toBeDefined();

    // The criterion-scoped comment lands only in the slice that actually holds DC-1.
    expect(dc1Prompt).toContain('OWNER SAYS DC-1 IS WRONG');
    expect(dc2Prompt).not.toContain('OWNER SAYS DC-1 IS WRONG');

    // The skill-wide (criterion: null) comment reaches neither Exercise slice -- Exercise
    // injection is scoped to the criteria a slice actually holds, and `null` never matches a
    // slice's own id list.
    expect(dc1Prompt).not.toContain('OWNER GENERAL REMARK');
    expect(dc2Prompt).not.toContain('OWNER GENERAL REMARK');

    // The Judge sees both comments for the skill, unscoped by criterion id -- D18's "must
    // address every comment on it" is skill-wide, not id-scoped.
    expect(judgePrompts).toHaveLength(1);
    expect(judgePrompts[0]).toContain('OWNER SAYS DC-1 IS WRONG');
    expect(judgePrompts[0]).toContain('OWNER GENERAL REMARK');
  });

  it('a comment for a different skill never appears in a slice or Judge prompt for the skill under test', async () => {
    const exercisePrompts = [];
    const judgePrompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompts.push(prompt);
        return exercisePlanClaims([{ criterion: 'DC-1', artifact: 'a' }]);
      }
      if (opts.label === 'judge') {
        judgePrompts.push(prompt);
        return satisfiedJudge({ criteria: [{ id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] }] });
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [checkCriterion('DC-1', 'verify-design-comparison')],
        checks: { 'verify-design-comparison': 'THE SKILL TEXT' },
        pagesDir: '.trd-state/example/verification-artifacts',
        // Both scopes, so the Exercise half is not vacuous: a `criterion: null` comment never
        // reaches Exercise whatever its skill, so only the DC-1-scoped one exercises the
        // skill filter there.
        checkComments: [
          { criterion: 'DC-1', skill: 'a-different-skill', text: 'SHOULD NEVER APPEAR (scoped)' },
          { criterion: null, skill: 'a-different-skill', text: 'SHOULD NEVER APPEAR (skill-wide)' },
        ],
      }),
    });

    expect(exercisePrompts[0]).not.toContain('SHOULD NEVER APPEAR');
    expect(judgePrompts[0]).not.toContain('SHOULD NEVER APPEAR');
  });
});

// --------------------------------------------------------------------------- Judge: STEP 2a (D11, D18, §3.6)

describe('verify-functional: check-skill prompt injection -- Judge STEP 2a', () => {
  it('carries STEP 2a, the skill text and verdicts.json only when the open set holds check rows', async () => {
    const judgePrompts = [];
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'DC-1', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgePrompts.push(prompt);
        judgeCalls += 1;
        if (judgeCalls === 1) {
          // Settle DC-1 (the only check row) on iteration 1, so iteration 2's open set holds
          // FS-1 only -- STEP 2a must disappear on that second prompt.
          return remediateJudge({
            criteria: [
              { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'b', reason: null, files: [] },
              { id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', files: [] },
            ],
            gaps: ['FS-1'],
            debugGaps: [{ id: 'FS-1', statement: 'statement for FS-1', reason: 'no artifact', artifact: null, files: [] }],
          });
        }
        return satisfiedJudge({ criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [criterion('FS-1'), checkCriterion('DC-1', 'verify-design-comparison')],
        checks: { 'verify-design-comparison': 'THE RUBRIC MARKER' },
        pagesDir: '.trd-state/example/verification-artifacts',
      }),
    });

    expect(judgePrompts).toHaveLength(2);
    expect(judgePrompts[0]).toMatch(/STEP 2a/);
    expect(judgePrompts[0]).toContain('THE RUBRIC MARKER');
    expect(judgePrompts[0]).toContain('.trd-state/example/verification-artifacts/verify-design-comparison/verdicts.json');
    expect(judgePrompts[1]).not.toMatch(/STEP 2a/);
    expect(judgePrompts[1]).not.toContain('THE RUBRIC MARKER');
  });
});

// --------------------------------------------------------------------------- Debug: gap enrichment (D11, §3.6)

describe('verify-functional: Debug gap enrichment', () => {
  it('a Debug gap for a check row carries its cites', async () => {
    let debugPrompt = null;
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'DC-1', artifact: null, reason: 'deviates' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [{ id: 'DC-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'deviates', files: [] }],
            gaps: ['DC-1'],
            debugGaps: [{ id: 'DC-1', statement: 'DC-1 statement', reason: 'deviates', artifact: null, files: [] }],
          });
        }
        return satisfiedJudge({ criteria: [{ id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') {
        debugPrompt = prompt;
        return { results: [{ cause: 'criterion:DC-1', addressed: true, result: 'fixed it' }], filesChanged: [] };
      }
      return null;
    });

    await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({
        criteria: [checkCriterion('DC-1', 'verify-design-comparison', { cites: 'design/frame-3.png' })],
        checks: { 'verify-design-comparison': 'SKILL TEXT' },
        pagesDir: '.trd-state/example/verification-artifacts',
      }),
    });

    expect(debugPrompt).toContain('"cites":"design/frame-3.png"');
    expect(debugPrompt).toMatch(/begins with "check:"/);
  });
});

// --------------------------------------------------------------------------- Render stage (D8, §3.6)

describe('verify-functional: Render stage', () => {
  function twoSkillArgs(overrides = {}) {
    return baseArgs({
      criteria: [checkCriterion('DC-1', 'verify-design-comparison'), checkCriterion('FL-1', 'verify-flow-as-built')],
      checks: {
        'verify-design-comparison': 'DESIGN SKILL TEXT',
        'verify-flow-as-built': 'FLOW SKILL TEXT',
      },
      pagesDir: '.trd-state/example/verification-artifacts',
      ...overrides,
    });
  }

  it('a remediate iteration dispatches Debug and one render agent per skill in one parallel() call', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        return exercisePlanClaims([
          { criterion: 'DC-1', artifact: null, reason: 'deviates' },
          { criterion: 'FL-1', artifact: null, reason: 'deviates' },
        ]);
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [
              { id: 'DC-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'deviates', files: [] },
              { id: 'FL-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'deviates', files: [] },
            ],
            gaps: ['DC-1', 'FL-1'],
            debugGaps: [
              { id: 'DC-1', statement: 'DC-1', reason: 'deviates', artifact: null, files: [] },
              { id: 'FL-1', statement: 'FL-1', reason: 'deviates', artifact: null, files: [] },
            ],
          });
        }
        return satisfiedJudge({
          criteria: [
            { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'FL-1', status: 'met', tier1: 'pass', artifact: 'b', reason: null, files: [] },
          ],
        });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:DC-1', addressed: true, result: 'fixed' }, { cause: 'criterion:FL-1', addressed: true, result: 'fixed' }], filesChanged: [] };
      if (opts.label === 'render') return { rendered: true, page: 'x/index.html', cards: 1, reason: '' };
      return null;
    });

    const parallel = makeParallelStub();
    const { result } = await runWorkflow(SOURCE, { agent, parallel, args: twoSkillArgs() });

    // The remediate wave combines Debug with one render agent per skill in ONE parallel() call.
    const remediateWave = parallel.waves.find((w) => w.size === 3);
    expect(remediateWave).toBeDefined();
    expect(agent.calls.filter((c) => c.opts.label === 'render')).toHaveLength(4); // 2 skills x (1 remediate + 1 exit)
    expect(agent.calls.filter((c) => c.opts.label === 'debug')).toHaveLength(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages.map((p) => p.skill).sort()).toEqual(['verify-design-comparison', 'verify-flow-as-built']);
    expect(result.pages.every((p) => p.rendered)).toBe(true);
  });

  it('an exit iteration dispatches the renders before returning', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'DC-1', artifact: 'a' }, { criterion: 'FL-1', artifact: 'b' }]);
      if (opts.label === 'judge') {
        return satisfiedJudge({
          criteria: [
            { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'FL-1', status: 'met', tier1: 'pass', artifact: 'b', reason: null, files: [] },
          ],
        });
      }
      if (opts.label === 'render') return { rendered: true, page: 'p.html', cards: 2, reason: '' };
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: twoSkillArgs() });

    expect(agent.calls.filter((c) => c.opts.label === 'render')).toHaveLength(2);
    expect(agent.calls.some((c) => c.opts.label === 'debug')).toBe(false);
    expect(result.pages).toHaveLength(2);
    expect(result.outcome).toBe('satisfied');
  });

  it('gives every agent() call an explicit agentType or model -- none may inherit the session model', async () => {
    // Extends audit-trd.test.js's "gives every agent an explicit agentType" pattern
    // (packages/core/workflows/audit-trd.test.js:70-75) to this workflow's own convention:
    // Exercise/Debug pin an agentType (verify-app / app-debugger); Render and Judge pin a
    // `model` directly instead, because there is no dedicated subagent type for either. An
    // unset agentType AND unset model is not "no agent" -- it is the platform's generic
    // workflow subagent on the SESSION model, unchosen.
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        return exercisePlanClaims([
          { criterion: 'DC-1', artifact: null, reason: 'deviates' },
          { criterion: 'FL-1', artifact: null, reason: 'deviates' },
        ]);
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [
              { id: 'DC-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'deviates', files: [] },
              { id: 'FL-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'deviates', files: [] },
            ],
            gaps: ['DC-1', 'FL-1'],
            debugGaps: [
              { id: 'DC-1', statement: 'DC-1', reason: 'deviates', artifact: null, files: [] },
              { id: 'FL-1', statement: 'FL-1', reason: 'deviates', artifact: null, files: [] },
            ],
          });
        }
        return satisfiedJudge({
          criteria: [
            { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'FL-1', status: 'met', tier1: 'pass', artifact: 'b', reason: null, files: [] },
          ],
        });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:DC-1', addressed: true, result: 'fixed' }, { cause: 'criterion:FL-1', addressed: true, result: 'fixed' }], filesChanged: [] };
      if (opts.label === 'render') return { rendered: true, page: 'x/index.html', cards: 1, reason: '' };
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: twoSkillArgs() });

    expect(agent.calls.length).toBeGreaterThan(0);
    const unpinned = unpinnedLabels(agent);
    expect(unpinned).toEqual([]);
  });

  it('a dead render agent yields rendered: false and the loop continues', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'DC-1', artifact: 'a' }, { criterion: 'FL-1', artifact: 'b' }]);
      if (opts.label === 'judge') {
        return satisfiedJudge({
          criteria: [
            { id: 'DC-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
            { id: 'FL-1', status: 'met', tier1: 'pass', artifact: 'b', reason: null, files: [] },
          ],
        });
      }
      if (opts.label === 'render') return undefined; // -> null
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: twoSkillArgs() });

    expect(result.outcome).toBe('satisfied');
    expect(result.pages).toHaveLength(2);
    expect(result.pages.every((p) => p.rendered === false)).toBe(true);
    expect(result.pages.every((p) => p.reason === 'render agent returned nothing')).toBe(true);
  });

  it('with no check rows, no render agent is dispatched and pages is empty', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge();
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });

    expect(agent.calls.some((c) => c.opts.label === 'render')).toBe(false);
    expect(result.pages).toEqual([]);
  });
});

// --------------------------------------------------------------------------- pages on every early-return path (§3.6)

describe('verify-functional: pages is present on the no-Judge-turn early returns', () => {
  it('the empty-criteria path returns pages: []', async () => {
    const agent = makeAgentStub((prompt, opts) => (opts.label === 'judge' ? satisfiedJudge({ criteria: [], gaps: [] }) : null));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [] }) });
    expect(result.pages).toEqual([]);
  });

  it('the resume-at-cap path returns pages: []', async () => {
    const agent = makeAgentStub(() => satisfiedJudge());
    const resume = {
      iteration: 3,
      criteria: [{ id: 'FS-1', status: 'met', artifact: 'a', reason: null }],
      gapsClosed: [],
    };
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume, cap: 3 }) });
    expect(result.pages).toEqual([]);
  });
});

// --------------------------------------------------------------------------- cause (D3, §3.1; VFIX-B002)

describe('verify-functional: cause', () => {
  it("the schema's cause enum equals CAUSES from the lib", () => {
    // Source-level, not a live object comparison: this script has no `require` (see "opens no
    // file, runs no shell, uses no require" above), so JUDGE_CRITERION_SCHEMA's `cause` enum is
    // a literal duplicated from packages/core/lib/functional-verification.js's `CAUSES`. This
    // diffs the two lists directly rather than trusting them to stay in step by hand, the same
    // source-text-extraction technique already used for the `exit-insufficient-coverage` enum
    // value above.
    const { CAUSES } = require('../lib/functional-verification');
    const match = SOURCE.match(/cause:\s*\{\s*type:\s*\['string',\s*'null'\],\s*enum:\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    const values = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s !== 'null')
      .map((s) => s.replace(/^'(.*)'$/, '$1'));
    expect(values).toEqual(CAUSES);
  });

  it('STEP 2 names the fixed cause vocabulary and STEP 4 names "cause" as a required key for non-met entries', async () => {
    let capturedJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt' }]);
      if (opts.label === 'judge') {
        capturedJudgePrompt = prompt;
        return satisfiedJudge({ criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, files: [] }] });
      }
      return null;
    });

    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    // STEP 2: the fixed set is named, including that a crash during capture is judged-failed.
    expect(capturedJudgePrompt).toMatch(/assign a "cause" from this fixed set/);
    expect(capturedJudgePrompt).toMatch(/"judged-failed" -- the build was reached and did the wrong thing, INCLUDING crashing or\s+erroring during capture/);
    // STEP 4: "cause" is in the exact-key list, alongside the existing "reason" requirement.
    expect(capturedJudgePrompt).toMatch(/"id", "status", "tier1", "artifact", "reason", "cause",\s+"provenAt"/);
    expect(capturedJudgePrompt).toMatch(/"cause" MUST likewise be populated.*every criterion whose status is not "met"/);
    // STEP 5 (report input): "cause" is in its own key list alongside "reason" and "provenAt".
    expect(capturedJudgePrompt).toMatch(/cites, status, /);
    expect(capturedJudgePrompt).toMatch(/artifact, reason, cause, provenAt, attempts, blocker/);
    // The Return spec's per-criterion shape also carries "cause".
    expect(capturedJudgePrompt).toMatch(/"id","status","tier1","artifact","reason","cause","files"/);
  });

  it('carries cause through a resume: a settled met entry keeps its cause: null unchanged', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-2', artifact: 'b.txt' }]);
      if (opts.label === 'judge') return satisfiedJudge({ criteria: [{ id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, cause: null, files: [] }] });
      return null;
    });
    // iteration 0 (a fix-round snapshot): a snapshot that continues a run would re-check FS-1 in the
    // regression pass; this test is about the carry, not the re-check.
    const resume = {
      iteration: 0,
      criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, provenAt: 1 }],
      gapsClosed: [1],
    };

    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [criterion('FS-1'), criterion('FS-2')], resume }),
    });

    expect(result.criteria).toContainEqual(expect.objectContaining({ id: 'FS-1', status: 'met', cause: null, provenAt: 1 }));
  });

  it('folds a non-met cause from this iteration\'s Judge return into the settled map and the final result', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: null, reason: 'env unreachable' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return satisfiedJudge({
          criteria: [{ id: 'FS-1', status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'env unreachable', cause: 'environment-unreachable', files: [] }],
        });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });

    expect(result.criteria).toContainEqual(
      expect.objectContaining({ id: 'FS-1', status: 'not_verifiable', cause: 'environment-unreachable' })
    );
  });
});

// --------------------------------------------------------------------------- report images (RIMG-B003; D2, D3, D13, D14, D15)

describe('verify-functional: report images', () => {
  const KS1 = "An image that shows a password, token, key or other credential value is never cited as a criterion's image; one that cannot be cleared is recorded as excluded, with the reason.";
  const KS2 = 'A criterion is about UI when it names a screen, element, layout or visual state, or its Tier 1 is judge-only for a visual property.';
  const flat = (t) => t.replace(/\s+/g, ' ');

  it("EXERCISE_SCHEMA's claim item declares screenshot and JUDGE_CRITERION_SCHEMA declares image, ui and imageExcluded", () => {
    const ex = SOURCE.match(/const EXERCISE_SCHEMA = \{[\s\S]*?\nconst JUDGE_CRITERION_SCHEMA/)[0];
    expect(ex).toMatch(/screenshot:\s*\{\s*type:\s*\['string',\s*'null'\]\s*\}/);
    expect(ex.match(/additionalProperties: false/g)).toHaveLength(2);
    const jc = SOURCE.match(/const JUDGE_CRITERION_SCHEMA = \{[\s\S]*?\nconst JUDGE_SCHEMA/)[0];
    expect(jc).toMatch(/image:\s*\{\s*type:\s*\['string',\s*'null'\]\s*\}/);
    expect(jc).toMatch(/ui:\s*\{\s*type:\s*'boolean'\s*\}/);
    expect(jc).toMatch(/imageExcluded:\s*\{\s*type:\s*\['string',\s*'null'\]\s*\}/);
    expect(jc).toMatch(/additionalProperties: false/);
  });

  it('the Exercise return spec names "screenshot"', async () => {
    let ex = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        ex = prompt;
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      return opts.label === 'judge' ? satisfiedJudge() : null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(ex).toMatch(/"screenshot": "<path>" \| null/);
  });

  it('the Judge prompt names the image keys in its return spec, STEP 4 and STEP 5, the evidence/ form and the exclusion reason', async () => {
    let jp = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        jp = prompt;
        return satisfiedJudge();
      }
      return null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(jp).toMatch(/"id","status","tier1","artifact","reason","cause","files","image","ui","imageExcluded"/);
    expect(jp).toMatch(/"provenAt", "image", "ui", "imageExcluded"/);
    expect(jp).toMatch(/artifact, reason, cause, provenAt, attempts, blocker, image, ui, imageExcluded/);
    expect(jp).toContain('evidence/<path under the evidence directory>');
    expect(jp).toContain('.trd-state/example/evidence/');
    expect(jp).toContain('outside the evidence directory');
    // existing pins still hold (append-only key lists)
    expect(jp).toMatch(/"id", "status", "tier1", "artifact", "reason", "cause",\s+"provenAt"/);
  });

  it('KS-1 and KS-2 appear word for word in the contract and in the Judge prompt', async () => {
    const contract = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'functional-verification.md'), 'utf8');
    let jp = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        jp = prompt;
        return satisfiedJudge();
      }
      return null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    for (const sentence of [KS1, KS2]) {
      expect(flat(contract)).toContain(sentence);
      expect(flat(jp)).toContain(sentence);
    }
  });

  it('a criterion ruled met with an image keeps image and ui unchanged in the next iteration and the result', async () => {
    let judgeCalls = 0;
    const prompts = [];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a.txt', screenshot: 'evidence/FS-1/shot.png' }, { criterion: 'FS-2', artifact: 'b.txt' }]);
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed' }], refresh: { ran: false, exitCode: null }, filesChanged: [] };
      if (opts.label === 'judge') {
        judgeCalls += 1;
        prompts.push(prompt);
        if (judgeCalls === 1) {
          return remediateJudge({
            criteria: [
              { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, files: [], image: 'evidence/FS-1/shot.png', ui: true, imageExcluded: null },
              { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'x', cause: 'judged-failed', files: ['src/b.js'] },
            ],
            gaps: ['FS-2'],
            debugGaps: [{ id: 'FS-2', statement: 'statement for FS-2', reason: 'x', artifact: null, files: ['src/b.js'] }],
          });
        }
        return satisfiedJudge({ criteria: [{ id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, cause: null, files: [] }] });
      }
      return null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(judgeCalls).toBe(2);
    const settledJson = JSON.parse(prompts[1].match(/judgements only:\n(.*)/)[1]);
    expect(settledJson).toContainEqual(expect.objectContaining({ id: 'FS-1', image: 'evidence/FS-1/shot.png', ui: true, imageExcluded: null }));
    expect(result.criteria).toContainEqual(expect.objectContaining({ id: 'FS-1', image: 'evidence/FS-1/shot.png', ui: true }));
  });

  it('a resume entry carrying image, ui and imageExcluded reaches the Judge prompt settled list unchanged; one without them is not backfilled', async () => {
    let jp = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-3', artifact: 'c.txt' }]);
      if (opts.label === 'judge') {
        jp = prompt;
        return satisfiedJudge({ criteria: [{ id: 'FS-3', status: 'met', tier1: 'pass', artifact: 'c.txt', reason: null, cause: null, files: [] }] });
      }
      return null;
    });
    const resume = {
      iteration: 0, // a fix-round snapshot: this test is about the settled list, not the regression pass
      criteria: [
        { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, provenAt: 1, image: 'evidence/FS-1/shot.png', ui: true, imageExcluded: null },
        { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, cause: null, provenAt: 1 },
      ],
      gapsClosed: [1],
    };
    await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], resume }) });
    const settledJson = JSON.parse(jp.match(/judgements only:\n(.*)/)[1]);
    expect(settledJson.find((e) => e.id === 'FS-1')).toEqual(expect.objectContaining({ image: 'evidence/FS-1/shot.png', ui: true, imageExcluded: null }));
    const old = settledJson.find((e) => e.id === 'FS-2');
    expect(old).not.toHaveProperty('image');
    expect(old).not.toHaveProperty('ui');
    expect(old).not.toHaveProperty('imageExcluded');
  });
});

describe('verify-functional: liveEvidence (reuse of evidence a [LIVE] task captured)', () => {
  const entry = (over = {}) => ({
    task: 'T-9',
    artifact: '/repo/.trd-state/example/evidence/live/T-9/home.txt',
    shows: 'the home page at 1280px',
    environment: 'local',
    covers: [{ path: '/repo/src/home.js', sha256: 'abc123' }],
    ...over,
  });

  async function run(liveEvidence, exerciseClaims) {
    const prompts = { exercise: null, judge: null };
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        prompts.exercise = prompt;
        return exercisePlanClaims(exerciseClaims || [{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        prompts.judge = prompt;
        return satisfiedJudge();
      }
      return null;
    });
    const args = baseArgs(liveEvidence === undefined ? {} : { liveEvidence });
    await runWorkflow(SOURCE, { agent, args });
    return prompts;
  }

  const claimsOf = (judgePrompt) => JSON.parse(judgePrompt.match(/This iteration's Exercise claims:\n(.*)/)[1]);

  it('lists a manifest artifact path and the reuse instruction in the Exercise prompt', async () => {
    const { exercise } = await run([entry()]);
    expect(exercise).toContain(entry().artifact);
    expect(exercise).toMatch(/already proves it/);
  });

  it('adds no reuse block when liveEvidence is absent or empty', async () => {
    for (const le of [undefined, []]) {
      const { exercise } = await run(le);
      expect(exercise).not.toMatch(/already proves it/);
    }
  });

  // AMEND-001: no hash is copied into the claims; the checker reads the manifest itself.
  it('drops an exerciser-supplied covers on a manifest artifact and copies no hashes into the claims', async () => {
    const { judge } = await run([entry()], [
      { criterion: 'FS-1', artifact: entry().artifact, covers: [{ path: '/etc/passwd', sha256: 'forged' }] },
      { criterion: 'FS-2', artifact: 'b' },
    ]);
    const claims = claimsOf(judge);
    expect(claims[0]).not.toHaveProperty('covers');
    expect(judge).not.toMatch(/abc123/);
  });

  it('tells the Judge to run check-evidence with --state-dir, so the checker reads the manifest itself', async () => {
    const { judge } = await run([entry()], [
      { criterion: 'FS-1', artifact: entry().artifact },
      { criterion: 'FS-2', artifact: 'b' },
    ]);
    expect(judge).toMatch(/check-evidence --file \S+ --state-dir \S+ \d+/);
  });

  it('gives a claim on a non-manifest artifact no covers, even when the exerciser sent some', async () => {
    const { judge } = await run([entry()], [
      { criterion: 'FS-1', artifact: 'not-in-manifest.txt', covers: [{ path: '/x', sha256: 'y' }] },
      { criterion: 'FS-2', artifact: null, reason: 'none' },
    ]);
    const claims = claimsOf(judge);
    expect(claims[0]).not.toHaveProperty('covers');
    expect(claims[1]).not.toHaveProperty('covers');
  });

  it('drops exerciser covers even when no liveEvidence is supplied', async () => {
    const { judge } = await run(undefined, [
      { criterion: 'FS-1', artifact: 'a', covers: [{ path: '/x', sha256: 'y' }] },
      { criterion: 'FS-2', artifact: 'b' },
    ]);
    expect(claimsOf(judge)[0]).not.toHaveProperty('covers');
  });

  it('stops offering live evidence once a Debug stage has run, so a stale artifact is not re-claimed', async () => {
    const exercisePrompts = [];
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exercisePrompts.push(prompt);
        return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      }
      if (opts.label === 'judge') {
        judgeCalls++;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed' }], filesChanged: [] };
      return null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs({ liveEvidence: [entry()] }) });
    expect(exercisePrompts).toHaveLength(2);
    expect(exercisePrompts[0]).toMatch(/already proves it/);
    expect(exercisePrompts[1]).not.toMatch(/already proves it/);
    expect(exercisePrompts[1]).not.toContain(entry().artifact);
  });

  it('teaches the Judge about reused passes and judge-only stale claims', async () => {
    const { judge } = await run([entry()]);
    expect(judge).toMatch(/reused/);
    expect(judge).toMatch(/stale: true/);
    expect(judge).toMatch(/evidence-stale/);
  });

  it('throws naming the index when liveEvidence is not an array', async () => {
    const agent = makeAgentStub(() => null);
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ liveEvidence: { artifact: 'x' } }) })).rejects.toThrow(/liveEvidence must be an array/);
    expect(agent.calls).toHaveLength(0);
  });

  it.each([
    ['no artifact', { artifact: undefined }],
    ['an empty artifact', { artifact: '' }],
    ['no covers', { covers: undefined }],
    ['empty covers', { covers: [] }],
  ])('throws naming the index for an entry with %s, before any agent runs', async (_n, over) => {
    const agent = makeAgentStub(() => null);
    await expect(
      runWorkflow(SOURCE, { agent, args: baseArgs({ liveEvidence: [entry(), entry(over)] }) })
    ).rejects.toThrow(/liveEvidence\[1\]/);
    expect(agent.calls).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------- must-pass (VMP-B002, D7, D11, D12)

describe('verify-functional: must-pass enforcement', () => {
  // FS-1 is met; FS-2 is the must-pass criterion and is NOT proven (not_verifiable has no gap,
  // so decide-next sees a clean base `exit-satisfied`). That is the defect this task closes.
  const unprovenCriteria = [
    { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] },
    { id: 'FS-2', status: 'not_verifiable', tier1: 'skipped', artifact: null, reason: 'no environment reaches it', cause: 'environment-unreachable', files: [] },
  ];

  function run({ judge, args = {}, reconcile } = {}) {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return judge;
      if (opts.label === 'reconcile') return reconcile === undefined ? { reconciled: true } : reconcile;
      return null;
    });
    return runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2'], ...args }) }).then((r) => ({ ...r, agent }));
  }
  const reconcileCalls = (agent) => agent.calls.filter((c) => c.opts.label === 'reconcile');

  it('overrides a Judge exit-satisfied to must-pass-unproven, after exactly one reconcile dispatch', async () => {
    const { result, agent } = await run({ judge: satisfiedJudge({ criteria: unprovenCriteria }) });

    expect(result.outcome).toBe('must-pass-unproven');
    expect(result.mustPass).toEqual({
      criteria: ['FS-2'],
      uncovered: [],
      unproven: [{ id: 'FS-2', status: 'not_verifiable' }],
      overridden: true,
    });
    expect(result.reason).toMatch(/FS-2/);
    expect(result.reason).toMatch(/core was not shown to work/);
    expect(reconcileCalls(agent)).toHaveLength(1);
    const [call] = reconcileCalls(agent);
    expect(call.opts.model).toBe('sonnet');
    expect(call.opts.schema).toBeDefined();
    // The reconcile agent is handed everything it needs directly (a Judge that forgot to copy
    // the must-pass literals into the report input cannot starve it).
    expect(call.prompt).toContain('.trd-state/example/judge-report-input-1.json');
    expect(call.prompt).toContain('.trd-state/example/verification-state.json');
    expect(call.prompt).toContain('.trd-state/example/verification-report.md');
    expect(call.prompt).toContain('.claude/lib/functional-verification.js');
    expect(call.prompt).toContain('.claude/lib/implement-state');
    expect(call.prompt).toContain('must-pass-unproven');
    expect(call.prompt).toContain('["FS-2"]');
    expect(unpinnedLabels(agent)).toEqual([]);
  });

  it('dispatches the reconcile agent before the Render agents, so Render prints the final action', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return satisfiedJudge({ criteria: unprovenCriteria });
      if (opts.label === 'reconcile') return { reconciled: true };
      if (opts.label === 'render') return { rendered: true, page: 'p', cards: 1 };
      return null;
    });
    const args = baseArgs({
      mustPassIds: ['FS-2'],
      criteria: [criterion('FS-1'), checkCriterion('FS-2', 'design-check')],
      checks: { 'design-check': 'CHECK SKILL TEXT' },
      pagesDir: '.trd-state/example/pages',
    });
    await runWorkflow(SOURCE, { agent, args });
    const labels = agent.calls.map((c) => c.opts.label);
    expect(labels.indexOf('reconcile')).toBeGreaterThan(-1);
    expect(labels.indexOf('reconcile')).toBeLessThan(labels.indexOf('render'));
    const render = agent.calls.find((c) => c.opts.label === 'render');
    expect(render.prompt).toContain("The Judge's action this iteration: exit-must-pass-unproven.");
  });

  it('a Judge that already returns exit-must-pass-unproven is taken as is: no override, no reconcile dispatch', async () => {
    const { result, agent } = await run({
      judge: satisfiedJudge({ action: 'exit-must-pass-unproven', reason: 'FS-2 not proven', criteria: unprovenCriteria }),
    });
    expect(result.outcome).toBe('must-pass-unproven');
    expect(result.reason).toBe('FS-2 not proven');
    expect(result.mustPass.overridden).toBe(false);
    expect(reconcileCalls(agent)).toHaveLength(0);
  });

  it("with no must-pass declared the result is today's plus a quiet mustPass key, and nothing is reconciled", async () => {
    const { result, agent } = await run({
      args: { mustPassIds: undefined },
      judge: satisfiedJudge({ criteria: unprovenCriteria }),
    });
    expect(result.outcome).toBe('satisfied');
    expect(result.mustPass).toEqual({ criteria: [], uncovered: [], unproven: [], overridden: false });
    expect(reconcileCalls(agent)).toHaveLength(0);
  });

  it('a proven must-pass criterion passes through untouched', async () => {
    const { result, agent } = await run({ args: { mustPassIds: ['FS-1'] }, judge: satisfiedJudge({ criteria: unprovenCriteria }) });
    expect(result.outcome).toBe('satisfied');
    expect(result.mustPass).toEqual({ criteria: ['FS-1'], uncovered: [], unproven: [], overridden: false });
    expect(reconcileCalls(agent)).toHaveLength(0);
  });

  it('an uncovered objective alone blocks, and the result carries its id', async () => {
    const { result, agent } = await run({
      args: { mustPassIds: [], mustPassUncovered: [{ id: 'O3', text: 'Users can sign in' }] },
      judge: satisfiedJudge(),
    });
    expect(result.outcome).toBe('must-pass-unproven');
    expect(result.reason).toMatch(/O3/);
    expect(result.mustPass.uncovered).toEqual(['O3']);
    expect(result.mustPass.overridden).toBe(true);
    expect(reconcileCalls(agent)).toHaveLength(1);
    expect(reconcileCalls(agent)[0].prompt).toContain('Users can sign in');
  });

  describe('against the coverage floor (D9, D11)', () => {
    const zeroGapCoverage = (overrides) =>
      satisfiedJudge({ action: 'exit-insufficient-coverage', reason: 'proven ratio 1/2 is below the floor', criteria: unprovenCriteria, ...overrides });

    it('a Judge insufficient-coverage with zero gaps becomes must-pass-unproven when no floor is set', async () => {
      const { result, agent } = await run({ judge: zeroGapCoverage() });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(result.mustPass.overridden).toBe(true);
      expect(reconcileCalls(agent)).toHaveLength(1);
    });

    it('... and when the floor is cleared (1 of 2 proven, floor 0.5)', async () => {
      const { result } = await run({ args: { coverageFloor: 0.5 }, judge: zeroGapCoverage() });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(result.mustPass.overridden).toBe(true);
    });

    it('is kept, with no reconcile, when the floor is really missed (floor 0.8)', async () => {
      const { result, agent } = await run({ args: { coverageFloor: 0.8 }, judge: zeroGapCoverage() });
      expect(result.outcome).toBe('insufficient-coverage');
      expect(result.reason).toBe('proven ratio 1/2 is below the floor');
      expect(result.mustPass.overridden).toBe(false);
      expect(reconcileCalls(agent)).toHaveLength(0);
    });

    it('a Judge exit-satisfied with the floor missed becomes insufficient-coverage, naming the must-pass ids', async () => {
      const { result, agent } = await run({ args: { coverageFloor: 0.8 }, judge: satisfiedJudge({ criteria: unprovenCriteria }) });
      expect(result.outcome).toBe('insufficient-coverage');
      expect(result.reason).toMatch(/FS-2/);
      expect(result.reason).toMatch(/coverage floor 80%/);
      expect(result.mustPass.overridden).toBe(true);
      expect(reconcileCalls(agent)).toHaveLength(1);
      expect(reconcileCalls(agent)[0].prompt).toContain('"insufficient-coverage"');
    });
  });

  it('never overrides a Judge exit-stalled (a gap is present, so the base action already blocks)', async () => {
    const { result, agent } = await run({
      judge: satisfiedJudge({
        action: 'exit-stalled',
        reason: 'nothing closed',
        criteria: [
          { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] },
          { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'x', files: [] },
        ],
        gaps: ['FS-2'],
      }),
    });
    expect(result.outcome).toBe('stalled');
    expect(result.mustPass.overridden).toBe(false);
    expect(result.mustPass.unproven).toEqual([{ id: 'FS-2', status: 'not_met' }]);
    expect(reconcileCalls(agent)).toHaveLength(0);
  });

  it("does not override a satisfied exit that still has a not_met criterion elsewhere (the Judge's call stands)", async () => {
    const { result } = await run({
      judge: satisfiedJudge({
        criteria: [
          { id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'x', files: [] },
          { id: 'FS-2', status: 'not_verifiable', tier1: 'skipped', artifact: null, reason: 'y', cause: 'capability-absent', files: [] },
        ],
      }),
    });
    expect(result.outcome).toBe('satisfied');
    expect(result.mustPass.overridden).toBe(false);
  });

  it("reads the final criteria list, settled entries included, not just this iteration's returns", async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediateJudge(); // FS-2 met and settled, FS-1 open
        // Iteration 2 returns only the open criterion; FS-2 (the must-pass one) is settled met.
        return satisfiedJudge({ criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] }] });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed' }], filesChanged: [] };
      return null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2'] }) });
    expect(result.outcome).toBe('satisfied');
    expect(result.mustPass.unproven).toEqual([]);
    expect(result.mustPass.overridden).toBe(false);
    expect(agent.calls.filter((c) => c.opts.label === 'reconcile')).toHaveLength(0);
  });

  it('a dead reconcile agent adds the stale-report suffix to the reason and still returns the overridden outcome', async () => {
    const { result, agent } = await run({ judge: satisfiedJudge({ criteria: unprovenCriteria }), reconcile: null });
    expect(result.outcome).toBe('must-pass-unproven');
    expect(result.reason).toMatch(/\(report file still shows the Judge's outcome — the reconcile agent returned nothing\)$/);
    expect(reconcileCalls(agent)).toHaveLength(1);
  });

  it('runs the re-check on the zero-criteria branch too, reconciling against iteration 0', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'judge') return satisfiedJudge({ criteria: [], reason: 'no criteria' });
      if (opts.label === 'reconcile') return { reconciled: true };
      return null;
    });
    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [], mustPassIds: [], mustPassUncovered: [{ id: 'O1', text: 'The core thing works' }] }),
    });
    expect(result.outcome).toBe('must-pass-unproven');
    expect(result.mustPass.uncovered).toEqual(['O1']);
    const calls = agent.calls.filter((c) => c.opts.label === 'reconcile');
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain('judge-report-input-0.json');
  });

  it('carries mustPass on the resume-exhausted exit and on the cap fall-through exit', async () => {
    const resumed = await runWorkflow(SOURCE, {
      agent: makeAgentStub({}),
      args: baseArgs({
        mustPassIds: ['FS-2'],
        resume: { iteration: 3, criteria: [{ id: 'FS-1', status: 'met' }, { id: 'FS-2', status: 'not_met' }], gapsClosed: [] },
      }),
    });
    expect(resumed.result.outcome).toBe('stuck');
    expect(resumed.result.mustPass).toEqual({ criteria: ['FS-2'], uncovered: [], unproven: [{ id: 'FS-2', status: 'not_met' }], overridden: false });

    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }]);
      if (opts.label === 'judge') return remediateJudge();
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'tried' }], filesChanged: [] };
      return null;
    });
    const fell = await runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2', 'FS-9'], cap: 1 }) });
    expect(fell.result.outcome).toBe('stuck');
    expect(fell.result.mustPass.criteria).toEqual(['FS-2', 'FS-9']);
    // FS-2 was proven and settled; FS-9 is named by a mark but absent from the definition:
    // reported 'missing', never thrown on.
    expect(fell.result.mustPass.unproven).toEqual([{ id: 'FS-9', status: 'missing' }]);
  });

  describe('arg validation, before any agent runs', () => {
    const bad = [
      ['mustPassIds not an array', { mustPassIds: 'FS-2' }, /args\.mustPassIds/],
      ['mustPassIds holding a non-string', { mustPassIds: ['FS-2', 7] }, /args\.mustPassIds/],
      ['mustPassUncovered not an array', { mustPassUncovered: { id: 'O1' } }, /args\.mustPassUncovered/],
      ['mustPassUncovered entry without an id', { mustPassUncovered: [{ text: 'x' }] }, /args\.mustPassUncovered/],
      ['mustPassUncovered entry with a non-string id', { mustPassUncovered: [{ id: 3 }] }, /args\.mustPassUncovered/],
      ['mustPassUncovered holding a bare string', { mustPassUncovered: ['O1'] }, /args\.mustPassUncovered/],
    ];
    it.each(bad)('%s throws', async (_name, overrides, pattern) => {
      const agent = makeAgentStub(() => satisfiedJudge());
      await expect(runWorkflow(SOURCE, { agent, args: baseArgs(overrides) })).rejects.toThrow(pattern);
      expect(agent.calls).toHaveLength(0);
    });
  });

  describe('the Judge prompt', () => {
    it('names the must-pass literals, the id-only uncovered list, the verbatim report-input list and the new outcome and action', async () => {
      let prompt = null;
      const agent = makeAgentStub((p, opts) => {
        if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
        if (opts.label === 'judge') {
          prompt = p;
          return satisfiedJudge({ action: 'exit-must-pass-unproven', criteria: unprovenCriteria });
        }
        return null;
      });
      await runWorkflow(SOURCE, {
        agent,
        args: baseArgs({ mustPassIds: ['FS-2'], mustPassUncovered: [{ id: 'O3', text: 'Users can sign in' }] }),
      });
      expect(prompt).toContain('"mustPass":["FS-2"]');
      expect(prompt).toContain('"mustPassUncovered":["O3"]'); // decide-next gets ids only
      expect(prompt).toContain('"mustPassUncovered": [{"id":"O3","text":"Users can sign in"}]'); // the report gets {id,text}
      expect(prompt).toContain('"mustPass": ["FS-2"]');
      expect(prompt).toContain('must-pass-unproven');
      expect(prompt).toContain('"exit-must-pass-unproven"');
    });

    it('carries both literals as [] when nothing is declared, because decideNext requires them', async () => {
      let prompt = null;
      const agent = makeAgentStub((p, opts) => {
        if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }]);
        if (opts.label === 'judge') {
          prompt = p;
          return satisfiedJudge();
        }
        return null;
      });
      await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: [criterion('FS-1')] }) });
      expect(prompt).toContain('"mustPass":[]');
      expect(prompt).toContain('"mustPassUncovered":[]');
    });

    it('lists the action in JUDGE_SCHEMA and the outcome in the outcome map', () => {
      expect(SOURCE).toMatch(/enum:\s*\[[^\]]*'exit-must-pass-unproven'[^\]]*\]/);
      expect(SOURCE).toMatch(/'exit-must-pass-unproven': 'must-pass-unproven'/);
    });
  });
});

// --------------------------------------------------------------------------- setup check (preflight B003)

function setupTarget(overrides = {}) {
  return { environment: 'local', url: 'http://localhost:3000', ports: [3000], identity: '', refreshable: false, criteria: ['FS-1', 'FS-2'], ...overrides };
}

function setupResult(overrides = {}) {
  return { action: 'proceed', reason: 'all setup checks passed', problems: [], flags: [], refreshesRun: 0, ...overrides };
}

const BROKEN = { environment: 'local', problem: 'nothing answers at http://localhost:3000', fix: 'start local' };

// A stub plan: label-keyed overrides on top of an Exercise that claims everything and a Judge
// that is satisfied. `judge` may be an array (one entry per call).
function setupPlan(over = {}) {
  const counts = {};
  return (prompt, opts) => {
    counts[opts.label] = (counts[opts.label] || 0) + 1;
    const planned = over[opts.label];
    if (planned !== undefined) return typeof planned === 'function' ? planned(counts[opts.label], prompt) : planned;
    if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
    if (opts.label === 'judge') return satisfiedJudge();
    return null;
  };
}

const labelsOf = (agent) => agent.calls.map((c) => c.opts.label);

describe('verify-functional: setupTargets validation, before any agent runs', () => {
  const rejects = async (setupTargets, pattern, extra = {}) => {
    const agent = makeAgentStub(setupPlan());
    await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets, ...extra }) })).rejects.toThrow(pattern);
    expect(agent.calls).toHaveLength(0);
  };

  it('rejects a non-array', () => rejects('local', /setupTargets must be an array/));
  it('rejects an entry with no environment name', () => rejects([setupTarget({ environment: '' })], /non-empty environment/));
  it('rejects a non-string url or identity', async () => {
    await rejects([setupTarget({ url: null })], /string url/);
    await rejects([setupTarget({ identity: 3 })], /string identity/);
  });
  it('rejects non-integer ports and a non-boolean refreshable', async () => {
    await rejects([setupTarget({ ports: ['3000'] })], /ports array of integers/);
    await rejects([setupTarget({ refreshable: 'yes' })], /boolean refreshable/);
  });
  it('rejects a criterion id the definition does not have', () => rejects([setupTarget({ criteria: ['FS-9'] })], /unknown criterion id "FS-9"/));
  it('rejects two refreshable entries', () =>
    rejects([setupTarget({ refreshable: true }), setupTarget({ environment: 'dev', refreshable: true })], /at most one setupTargets entry may be refreshable/, { refreshCommand: 'npm run refresh' }));
  it('rejects a refreshable entry when no refresh command is declared', () => rejects([setupTarget({ refreshable: true })], /no refreshCommand is declared/));
});

describe('verify-functional: the Setup phase', () => {
  it('dispatches no setup agent without setupTargets, and carries a Debug result without refresh as null', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub(setupPlan({ judge: () => (++judgeCalls === 1 ? remediateJudge() : satisfiedJudge()), debug: { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'x' }], filesChanged: [] } }));
    const { result, phases } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(labelsOf(agent).filter((l) => l.startsWith('setup') || l === 'record')).toEqual([]);
    expect(phases).not.toContain('Setup');
    expect(result.setup).toEqual({ checked: 0, refreshed: 0, flags: [], problems: [] });
    const judgePrompts = agent.calls.filter((c) => c.opts.label === 'judge').map((c) => c.prompt);
    expect(judgePrompts[1]).toContain('"refreshFailed":false');
  });

  it('dispatches setup before Exercise, pinned to sonnet with no agentType, and proceeds', async () => {
    const agent = makeAgentStub(setupPlan({ setup: setupResult({ flags: [{ environment: 'local', flag: 'no identity declared', default: 'treated as fine for this attempt' }] }) }));
    const { result, phases } = await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: [setupTarget()] }) });
    expect(labelsOf(agent)).toEqual(['setup', 'exercise', 'judge']);
    expect(phases.indexOf('Setup')).toBeLessThan(phases.indexOf('Exercise'));
    const call = agent.calls[0];
    expect(call.opts.model).toBe('sonnet');
    expect(call.opts.agentType).toBeUndefined();
    expect(call.prompt).toContain('decide-setup --file');
    expect(call.prompt).toContain('"refreshCount": 0');
    expect(unpinnedLabels(agent)).toEqual([]);
    expect(result.outcome).toBe('satisfied');
    expect(result.setup).toEqual({
      checked: 1,
      refreshed: 0,
      flags: [{ environment: 'local', flag: 'no identity declared', default: 'treated as fine for this attempt' }],
      problems: [],
    });
  });

  it('checks only targets that hold an open criterion, and not at all once they are settled', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub(
      setupPlan({
        judge: () =>
          ++judgeCalls === 1
            ? remediateJudge({ criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, files: [] }, { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no', files: [] }], gaps: ['FS-2'], debugGaps: [{ id: 'FS-2' }] })
            : satisfiedJudge(),
        debug: { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'ok' }], refresh: { ran: false, exitCode: null }, filesChanged: [] },
        setup: setupResult(),
      })
    );
    const targets = [setupTarget({ environment: 'one', criteria: ['FS-1'] }), setupTarget({ environment: 'two', criteria: ['FS-2'] })];
    await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: targets }) });
    const setupCalls = agent.calls.filter((c) => c.opts.label === 'setup');
    expect(setupCalls).toHaveLength(2);
    expect(setupCalls[0].prompt).toContain('"environment":"one"');
    expect(setupCalls[0].prompt).toContain('"environment":"two"');
    expect(setupCalls[1].prompt).not.toContain('"environment":"one"');
    expect(setupCalls[1].prompt).toContain('"environment":"two"');
  });

  it('is not dispatched when Exercise is skipped', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub(
      setupPlan({
        judge: () => (++judgeCalls === 1 ? remediateJudge() : satisfiedJudge()),
        debug: { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'absent', unbuilt: true }], refresh: { ran: false, exitCode: null }, filesChanged: [] },
        setup: setupResult(),
      })
    );
    await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: [setupTarget()] }) });
    expect(labelsOf(agent)).toEqual(['setup', 'exercise', 'judge', 'debug', 'judge', 'state-sync']);
  });

  it('copies each target\'s refreshable into the prompt', async () => {
    const agent = makeAgentStub(setupPlan({ setup: setupResult() }));
    await runWorkflow(SOURCE, { agent, args: baseArgs({ refreshCommand: 'npm run dev:refresh', setupTargets: [setupTarget({ refreshable: true })] }) });
    expect(agent.calls[0].prompt).toContain('"refreshable":true');
    expect(agent.calls[0].prompt).toContain('npm run dev:refresh');
  });

  it('a dead setup agent yields a flag and Exercise still runs', async () => {
    const agent = makeAgentStub(setupPlan({ setup: null }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: [setupTarget()] }) });
    expect(labelsOf(agent)).toEqual(['setup', 'exercise', 'judge']);
    expect(result.outcome).toBe('satisfied');
    expect(result.setup.checked).toBe(1);
    expect(result.setup.flags).toHaveLength(1);
    expect(result.setup.flags[0].flag).toMatch(/returned nothing/);
  });
});

describe('verify-functional: refresh-once is decided by the script', () => {
  const refreshArgs = () => baseArgs({ refreshCommand: 'npm run dev:refresh', setupTargets: [setupTarget({ refreshable: true })] });

  it('dispatches exactly one setup-refresh on a refresh return, then proceeds', async () => {
    const agent = makeAgentStub(
      setupPlan({
        setup: setupResult({ action: 'refresh', problems: [BROKEN] }),
        'setup-refresh': setupResult({ refreshesRun: 1 }),
      })
    );
    const { result } = await runWorkflow(SOURCE, { agent, args: refreshArgs() });
    expect(labelsOf(agent)).toEqual(['setup', 'setup-refresh', 'exercise', 'judge']);
    const refreshCall = agent.calls[1];
    expect(refreshCall.opts.model).toBe('sonnet');
    expect(refreshCall.prompt).toContain('EXACTLY ONCE');
    expect(refreshCall.prompt).toContain('"refreshCount": 1');
    expect(result.outcome).toBe('satisfied');
    expect(result.setup).toMatchObject({ checked: 1, refreshed: 1, problems: [] });
  });

  it.each([
    ['a setup return that reports a refresh it ran', { setup: setupResult({ refreshesRun: 1 }) }, /none is allowed/],
    ['a setup-refresh that reports two refreshes', { setup: setupResult({ action: 'refresh', problems: [BROKEN] }), 'setup-refresh': setupResult({ refreshesRun: 2 }) }, /ran 2 refreshes; one is allowed/],
    ['a setup-refresh that reports it ran no refresh', { setup: setupResult({ action: 'refresh', problems: [BROKEN] }), 'setup-refresh': setupResult({ refreshesRun: 0 }) }, /ran it 0 times/],
    ['a setup-refresh that asks for a second refresh', { setup: setupResult({ action: 'refresh', problems: [BROKEN] }), 'setup-refresh': setupResult({ action: 'refresh', problems: [BROKEN], refreshesRun: 1 }) }, /asked for a second refresh/],
  ])('ends setup-failure on %s', async (_name, plan, reason) => {
    const agent = makeAgentStub(setupPlan({ ...plan, record: { recorded: true } }));
    const { result } = await runWorkflow(SOURCE, { agent, args: refreshArgs() });
    expect(result.outcome).toBe('setup-failure');
    expect(result.setup.problems[0].problem).toMatch(reason);
    expect(labelsOf(agent)).not.toContain('exercise');
    expect(labelsOf(agent).filter((l) => l === 'setup-refresh').length).toBeLessThanOrEqual(1);
  });

  it('a dead setup-refresh ends setup-failure with the problems setup found', async () => {
    const agent = makeAgentStub(setupPlan({ setup: setupResult({ action: 'refresh', problems: [BROKEN] }), 'setup-refresh': null, record: { recorded: true } }));
    const { result } = await runWorkflow(SOURCE, { agent, args: refreshArgs() });
    expect(result.outcome).toBe('setup-failure');
    expect(result.setup.problems).toEqual([BROKEN]);
  });

  it('a setup-refresh that still fails ends setup-failure with its problems', async () => {
    const still = { environment: 'local', problem: 'the declared refresh exited 1', fix: 'run it by hand' };
    const agent = makeAgentStub(setupPlan({ setup: setupResult({ action: 'refresh', problems: [BROKEN] }), 'setup-refresh': setupResult({ action: 'setup-failure', problems: [still], refreshesRun: 1 }), record: { recorded: true } }));
    const { result } = await runWorkflow(SOURCE, { agent, args: refreshArgs() });
    expect(result.outcome).toBe('setup-failure');
    expect(result.setup.problems).toEqual([still]);
    expect(result.setup.refreshed).toBe(1);
  });
});

describe('verify-functional: the setup-failure exit', () => {
  it('dispatches one Record agent and no Judge, Debug or Render, and rewrites only open criteria', async () => {
    const agent = makeAgentStub(
      setupPlan({
        setup: setupResult({ action: 'setup-failure', problems: [BROKEN], reason: 'broken' }),
        record: { recorded: true },
      })
    );
    const resume = { iteration: 1, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }], gapsClosed: [2] };
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume, setupTargets: [setupTarget()], fullRunCommand: 'make all' }) });

    expect(labelsOf(agent)).toEqual(['setup', 'record']);
    expect(result.outcome).toBe('setup-failure');
    expect(result.iterations).toBe(1); // iteration 2 failed; 2 - 1 completed
    expect(result.finalRun).toBeNull();
    expect(result.gaps).toEqual([]);
    expect(result.setup.problems).toEqual([BROKEN]);
    expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'met', artifact: 'a' });
    expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({
      status: 'not_verifiable',
      cause: 'never-exercised',
      artifact: null,
      tier1: null,
      provenAt: null,
    });
    expect(result.criteria.find((c) => c.id === 'FS-2').reason).toBe('not exercised: the setup check failed — local: nothing answers at http://localhost:3000');

    const recordCall = agent.calls[1];
    expect(recordCall.opts.model).toBe('sonnet');
    expect(recordCall.prompt).toContain('render-report --file');
    expect(recordCall.prompt).toContain('save(');
    const stateJson = JSON.parse(recordCall.prompt.match(/to [^\n]*record-state-2\.json:\n(.*)\n/)[1]);
    expect(stateJson).toMatchObject({ iteration: 1, outcome: 'setup-failure', gapsClosed: [2] });
    expect(stateJson.criteria).toHaveLength(2);
    const reportJson = JSON.parse(recordCall.prompt.match(/to [^\n]*record-report-input-2\.json:\n(.*)\n/)[1]);
    expect(reportJson).toMatchObject({ outcome: 'setup-failure', finalEnvironmentRun: null, setup: { problems: [BROKEN] }, feature: 'example' });
    expect(reportJson.criteria[1]).toMatchObject({ id: 'FS-2', statement: 'statement for FS-2' });
  });

  it('records one gapsClosed entry per completed iteration, seeded from the resume', async () => {
    let judgeCalls = 0;
    let setupCalls = 0;
    const agent = makeAgentStub(
      setupPlan({
        judge: () => (++judgeCalls === 1 ? remediateJudge({ closed: ['FS-2'] }) : satisfiedJudge()),
        debug: { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'ok' }], refresh: { ran: false, exitCode: null }, filesChanged: [] },
        setup: () => (++setupCalls === 1 ? setupResult() : setupResult({ action: 'setup-failure', problems: [BROKEN] })),
        record: { recorded: true },
      })
    );
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ resume: { iteration: 0, criteria: [], gapsClosed: [5] }, setupTargets: [setupTarget()] }) });
    expect(result.outcome).toBe('setup-failure');
    const recordCall = agent.calls.find((c) => c.opts.label === 'record');
    const stateJson = JSON.parse(recordCall.prompt.match(/record-state-2\.json:\n(.*)\n/)[1]);
    expect(stateJson.gapsClosed).toEqual([5, 1]);
    expect(stateJson.iteration).toBe(1);
  });

  it('a dead Record agent is logged and the result still returns', async () => {
    const agent = makeAgentStub(setupPlan({ setup: setupResult({ action: 'setup-failure', problems: [BROKEN] }), record: null }));
    const { result, logs } = await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: [setupTarget()] }) });
    expect(result.outcome).toBe('setup-failure');
    expect(logs.some((l) => /record agent returned nothing/.test(l))).toBe(true);
  });

  it('every other return path carries setup', async () => {
    const empty = await runWorkflow(SOURCE, { agent: makeAgentStub(setupPlan({ judge: satisfiedJudge({ criteria: [] }) })), args: baseArgs({ criteria: [] }) });
    expect(empty.result.setup).toEqual({ checked: 0, refreshed: 0, flags: [], problems: [] });
    const atCap = await runWorkflow(SOURCE, { agent: makeAgentStub(setupPlan()), args: baseArgs({ cap: 3, resume: { iteration: 3, criteria: [], gapsClosed: [] } }) });
    expect(atCap.result.setup).toEqual({ checked: 0, refreshed: 0, flags: [], problems: [] });
    const fallThrough = await runWorkflow(SOURCE, { agent: makeAgentStub(setupPlan({ judge: remediateJudge(), debug: { results: [], refresh: { ran: false, exitCode: null }, filesChanged: [] } })), args: baseArgs({ cap: 1 }) });
    expect(fallThrough.result.outcome).toBe('stuck');
    expect(fallThrough.result.setup).toEqual({ checked: 0, refreshed: 0, flags: [], problems: [] });
  });

  it('de-duplicates flags across iterations', async () => {
    let judgeCalls = 0;
    const flag = { environment: 'local', flag: 'no identity declared', default: 'treated as fine for this attempt' };
    const agent = makeAgentStub(setupPlan({ judge: () => (++judgeCalls === 1 ? remediateJudge() : satisfiedJudge()), debug: { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'x' }], refresh: { ran: false, exitCode: null }, filesChanged: [] }, setup: setupResult({ flags: [flag] }) }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: [setupTarget()] }) });
    expect(result.setup.checked).toBe(2);
    expect(result.setup.flags).toEqual([flag]);
  });
});

describe('verify-functional: Debug\'s refresh report (D16)', () => {
  const failedRefresh = { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed' }], refresh: { ran: true, exitCode: 1 }, filesChanged: [] };

  it('DEBUG_SCHEMA requires refresh and the prompt asks for it', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub(setupPlan({ judge: () => (++judgeCalls === 1 ? remediateJudge() : satisfiedJudge()), debug: failedRefresh }));
    await runWorkflow(SOURCE, { agent, args: baseArgs({ refreshCommand: 'npm run dev:refresh' }) });
    const debugCall = agent.calls.find((c) => c.opts.label === 'debug');
    expect(debugCall.opts.schema.required).toEqual(['results', 'refresh', 'filesChanged']);
    expect(debugCall.opts.schema.properties.refresh.required).toEqual(['ran', 'exitCode']);
    expect(debugCall.prompt).toMatch(/"refresh": \{"ran": true, "exitCode": <its exit code>\}/);
    const noRefresh = makeAgentStub(setupPlan({ judge: () => (++judgeCalls === 3 ? remediateJudge() : satisfiedJudge()), debug: failedRefresh }));
    await runWorkflow(SOURCE, { agent: noRefresh, args: baseArgs() });
    expect(noRefresh.calls.find((c) => c.opts.label === 'debug').prompt).toMatch(/"refresh": \{"ran": false, "exitCode": null\}/);
  });

  it('carries a failed refresh into the next setup prompt as debugRefresh, and clears it once consumed', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub(setupPlan({ judge: () => (++judgeCalls < 3 ? remediateJudge() : satisfiedJudge()), debug: failedRefresh, setup: setupResult() }));
    await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 4, refreshCommand: 'npm run dev:refresh', setupTargets: [setupTarget()] }) });
    const setupPrompts = agent.calls.filter((c) => c.opts.label === 'setup').map((c) => c.prompt);
    expect(setupPrompts[0]).toContain('null when none since the last check): null');
    expect(setupPrompts[1]).toContain('): {"ran":true,"exitCode":1}');
    // Consumed by the second check; the third sees the second Debug pass's report, again failed.
    const judgePrompts = agent.calls.filter((c) => c.opts.label === 'judge').map((c) => c.prompt);
    expect(judgePrompts[1]).toContain('"refreshFailed":false'); // consumed by Setup this iteration
  });

  it('injects refreshFailed:true into decide-next when no Setup check consumed the fact, and false after exitCode 0', async () => {
    let judgeCalls = 0;
    let debugCalls = 0;
    const agent = makeAgentStub(
      setupPlan({
        judge: () => (++judgeCalls < 3 ? remediateJudge() : satisfiedJudge()),
        debug: () => (++debugCalls === 1 ? failedRefresh : { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'ok' }], refresh: { ran: true, exitCode: 0 }, filesChanged: [] }),
      })
    );
    await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 4, refreshCommand: 'npm run dev:refresh' }) });
    const judgePrompts = agent.calls.filter((c) => c.opts.label === 'judge').map((c) => c.prompt);
    expect(judgePrompts[0]).toContain('"refreshFailed":false');
    expect(judgePrompts[1]).toContain('"refreshFailed":true');
    expect(judgePrompts[2]).toContain('"refreshFailed":false');
  });

  it('a dead Debug agent resets the carried refresh to null', async () => {
    let judgeCalls = 0;
    let debugCalls = 0;
    const agent = makeAgentStub(setupPlan({ judge: () => (++judgeCalls < 3 ? remediateJudge() : satisfiedJudge()), debug: () => (++debugCalls === 1 ? failedRefresh : null) }));
    await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 4 }) });
    const judgePrompts = agent.calls.filter((c) => c.opts.label === 'judge').map((c) => c.prompt);
    expect(judgePrompts[1]).toContain('"refreshFailed":true');
    expect(judgePrompts[2]).toContain('"refreshFailed":false');
  });
});

describe('verify-functional: exit-setup-failure from the Judge', () => {
  const exitJudge = () => remediateJudge({ action: 'exit-setup-failure', reason: 'the last Debug pass\'s refresh failed', debugGaps: undefined });

  it('maps to outcome setup-failure with finalRun null, even with a fullRunCommand declared, and one problem', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub(
      setupPlan({
        judge: () => (++judgeCalls === 1 ? remediateJudge() : exitJudge()),
        debug: { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'x' }], refresh: { ran: true, exitCode: 2 }, filesChanged: [] },
      })
    );
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ refreshCommand: 'npm run dev:refresh', fullRunCommand: 'make all' }) });
    expect(result.outcome).toBe('setup-failure');
    expect(result.finalRun).toBeNull();
    expect(result.setup.problems).toEqual([
      { environment: 'running build', problem: 'the last Debug pass\'s refresh failed', fix: 'make the declared fast refresh (npm run dev:refresh) succeed, then run /verify-build' },
    ]);
  });

  it('is also null with no fullRunCommand declared', async () => {
    const agent = makeAgentStub(setupPlan({ judge: exitJudge() }));
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.finalRun).toBeNull();
  });

  it('the Judge prompt names the new value in its gate, outcome list and action list', async () => {
    const agent = makeAgentStub(setupPlan({ judge: satisfiedJudge() }));
    await runWorkflow(SOURCE, { agent, args: baseArgs({ fullRunCommand: 'make all' }) });
    const prompt = agent.calls.find((c) => c.opts.label === 'judge').prompt;
    expect(prompt).toMatch(/unless the action above is "exit-unbuilt" or "exit-setup-failure"/);
    expect(prompt).toMatch(/"must-pass-unproven" or "setup-failure"/);
    expect(prompt).toMatch(/"exit-must-pass-unproven"\|"exit-setup-failure"\|"remediate"/);
  });

  it('JUDGE_SCHEMA and OUTCOME_BY_ACTION each gain exactly exit-setup-failure', async () => {
    const agent = makeAgentStub(setupPlan());
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    const schema = agent.calls.find((c) => c.opts.label === 'judge').opts.schema;
    expect(schema.properties.action.enum).toEqual(['exit-satisfied', 'exit-unbuilt', 'exit-stalled', 'exit-stuck', 'exit-insufficient-coverage', 'exit-must-pass-unproven', 'exit-setup-failure', 'remediate']);
    const map = SOURCE.match(/const OUTCOME_BY_ACTION = \{([^}]*)\}/)[1];
    expect(map.match(/'exit-[a-z-]+':/g)).toHaveLength(7);
    expect(map).toContain("'exit-setup-failure': 'setup-failure'");
  });
});

// --------------------------------------------------------------------------- triage: route by kind (TRIAGE-B004)

describe('verify-functional: kind routing (triage D1-D6, D20-D23)', () => {
  const ev = (id, cause = 'evidence-missing', extra = {}) => ({ id, status: 'not_met', tier1: 'fail', artifact: null, reason: `${cause} for ${id}`, cause, files: [], ...extra });
  const gapOf = (id) => ({ id, statement: `statement for ${id}`, reason: `gap ${id}`, artifact: null, files: [] });
  const remediate = (criteria, overrides = {}) => ({
    action: 'remediate',
    reason: 'open gaps',
    criteria,
    gaps: criteria.filter((c) => c.status === 'not_met').map((c) => c.id),
    unbuilt: [],
    closed: [],
    notesUpdated: false,
    debugGaps: criteria.filter((c) => c.status === 'not_met').map((c) => gapOf(c.id)),
    ...overrides,
  });
  const met = (id) => ({ id, status: 'met', tier1: 'pass', artifact: `${id}.txt`, reason: null, files: [] });
  const claimsFor = (...ids) => exercisePlanClaims(ids.map((id) => ({ criterion: id, artifact: `${id}.txt` })));
  const exercisedIds = (call) => (call.prompt.match(/FS-\d/g) || []).filter((v, i, a) => a.indexOf(v) === i);

  it('the pinned KIND_BY_CAUSE equals the lib export (D3)', () => {
    const { KIND_BY_CAUSE, CAUSES } = require('../lib/functional-verification');
    const m = SOURCE.match(/const KIND_BY_CAUSE = \{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    const pairs = [...m[1].matchAll(/'([a-z-]+)':\s*'([a-z-]+)'/g)].map((x) => [x[1], x[2]]);
    expect(Object.fromEntries(pairs)).toEqual(KIND_BY_CAUSE);
    expect(pairs.map((p2) => p2[0])).toEqual(CAUSES);
    expect(SOURCE).not.toMatch(/EVIDENCE_CAUSES/);
    expect(SOURCE).not.toMatch(/allDebugGaps/);
  });

  it('re-captures an evidence gap once, then settles it as a definition problem and never walks it again', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediate([ev('FS-1'), met('FS-2')]);
        if (judgeCalls === 2) return remediate([ev('FS-1')]); // Judge keeps ruling evidence-missing
        return satisfiedJudge({ criteria: [], gaps: [] });
      }
      return null;
    });

    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 5 }) });

    const exercises = agent.calls.filter((c) => c.opts.label === 'exercise');
    expect(exercises).toHaveLength(2); // the first pass and ONE re-capture; none on iteration 3
    expect(exercises.filter((c) => c.prompt.includes('statement for FS-1'))).toHaveLength(2);
    expect(exercises[1].prompt).toMatch(/RE-CAPTURE REQUIRED/);
    expect(agent.calls.filter((c) => c.opts.label === 'debug')).toHaveLength(0);
    const fs1 = result.criteria.find((c) => c.id === 'FS-1');
    expect(fs1).toMatchObject({ status: 'not_met', kind: 'evidence-gap', settled: 'definition-problem', provenAt: 2 });
    const judges = agent.calls.filter((c) => c.opts.label === 'judge').map((c) => c.prompt);
    expect(judges[2]).toMatch(/"settledEvidenceGaps":<\["FS-1"\]/);
    expect(judges[1]).toMatch(/re-captured once[\s\S]*\["FS-1"\]/);
    expect(result.gaps).toEqual([]);
  });

  it('a re-capture id is absent from the previousGaps handed to the next Judge (D23)', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediate([ev('FS-1'), met('FS-2')]) : satisfiedJudge({ criteria: [met('FS-1')] });
      }
      return null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    const judges = agent.calls.filter((c) => c.opts.label === 'judge').map((c) => c.prompt);
    expect(judges[1]).toContain('Previous iteration\'s gaps (null on a fresh run\'s first iteration): []');
    expect(judges[1]).toContain('"previousGaps":[]');
  });

  it('a dead slice on the re-capture iteration does not settle the gap', async () => {
    let judgeCalls = 0;
    let exerciseCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') {
        exerciseCalls += 1;
        return exerciseCalls === 2 ? undefined : claimsFor('FS-1', 'FS-2');
      }
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls <= 2) return remediate([ev('FS-1', judgeCalls === 1 ? 'evidence-missing' : 'never-exercised'), ...(judgeCalls === 1 ? [met('FS-2')] : [])]);
        return satisfiedJudge({ criteria: [met('FS-1')] });
      }
      return null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ cap: 5 }) });
    // Iteration 2 had a dead slice, so FS-1 kept its one re-capture: iteration 3 re-captured it.
    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(3);
    expect(agent.calls.filter((c) => c.opts.label === 'debug')).toHaveLength(0);
    expect(result.criteria.find((c) => c.id === 'FS-1').status).toBe('met');
  });

  it('a skipped Exercise on the re-capture iteration does not settle the gap', async () => {
    let judgeCalls = 0;
    let debugCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2', 'FS-3');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediate([ev('FS-1'), ev('FS-3', 'judged-failed'), met('FS-2')]);
        if (judgeCalls === 2) return remediate([ev('FS-1', 'never-exercised'), ev('FS-3', 'judged-failed')]);
        return satisfiedJudge({ criteria: [met('FS-1'), met('FS-3')] });
      }
      if (opts.label === 'debug') {
        debugCalls += 1;
        return { results: [{ cause: 'criterion:FS-3', addressed: true, result: 'missing', unbuilt: debugCalls === 1 }], filesChanged: [] };
      }
      return null;
    });
    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], cap: 6 }),
    });
    // Debug reported FS-3 unbuilt, so iteration 2 skipped Exercise; FS-1 was NOT re-captured then
    // and so cannot be a definition problem. It is re-captured on iteration 3.
    const exercises = agent.calls.filter((c) => c.opts.label === 'exercise');
    expect(exercises).toHaveLength(2);
    expect(exercises[1].prompt).toContain('statement for FS-1');
    expect(exercises[1].prompt).toMatch(/RE-CAPTURE REQUIRED/);
    expect(result.criteria.find((c) => c.id === 'FS-1').settled).toBeUndefined();
  });

  it('a skipped Exercise carries an open build defect with its last verdict, and rules only the unbuilt id (O1, causes D6)', async () => {
    let judgeCalls = 0;
    let secondJudgePrompt = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediate([ev('FS-1', 'judged-failed'), ev('FS-2', 'judged-failed')]);
        secondJudgePrompt = prompt;
        // Exercise was skipped: the Judge rules only the id Debug reported unbuilt; FS-1 is carried.
        return remediate(
          [{ id: 'FS-2', status: 'unbuilt', tier1: null, artifact: null, reason: 'absent', cause: 'not-built', files: [] }],
          { action: 'exit-unbuilt', gaps: ['FS-1'], unbuilt: ['FS-2'], debugGaps: [] }
        );
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'missing', unbuilt: true }], filesChanged: [] };
      return null;
    });
    const { result } = await runWorkflow(SOURCE, {
      agent,
      args: baseArgs({ criteria: [criterion('FS-1'), criterion('FS-2')], cap: 4 }),
    });
    expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(1);
    const fs1 = result.criteria.find((c) => c.id === 'FS-1');
    expect(fs1).toMatchObject({ status: 'not_met', cause: 'judged-failed', kind: 'build-defect', reason: 'judged-failed for FS-1' });
    // AC 8: the forced id is ruled, not carried; the other open id is carried, not ruled.
    expect(secondJudgePrompt).toMatch(/Rule each of them "unbuilt"/);
    const carriedBlock = secondJudgePrompt.match(/Open criteria NOT re-checked this iteration[^\n]*\n(\[.*\])/)[1];
    expect(JSON.parse(carriedBlock).map((e) => e.id)).toEqual(['FS-1']);
    const underJudgement = secondJudgePrompt.match(/Criteria still open, under judgement this iteration \(\d+ of \d+\):\n(\[.*\])/)[1];
    expect(JSON.parse(underJudgement).map((c) => c.id)).toEqual(['FS-2']);
  });

  it('never-exercised goes to Exercise, not Debug; Debug gets only build defects and not even a not-built-free iteration', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediate([ev('FS-1', 'never-exercised'), ev('FS-2', 'judged-failed')]);
        return satisfiedJudge({ criteria: [met('FS-1'), met('FS-2')] });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-2', addressed: true, result: 'fixed' }], filesChanged: [] };
      return null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    const debugs = agent.calls.filter((c) => c.opts.label === 'debug');
    expect(debugs).toHaveLength(1);
    expect(debugs[0].prompt).toContain('gap FS-2');
    expect(debugs[0].prompt).not.toContain('gap FS-1');
    expect(agent.calls.filter((c) => c.opts.label === 'exercise')[1].prompt).toMatch(/RE-CAPTURE REQUIRED[\s\S]*never-exercised/);
  });

  it('a not_met gap with cause null still reaches Debug as a build defect (D21)', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediateJudge() : satisfiedJudge();
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed' }], filesChanged: [] };
      return null;
    });
    const { logs } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(agent.calls.filter((c) => c.opts.label === 'debug')).toHaveLength(1);
    expect(logs.join('\n')).toMatch(/FS-1 is not_met with no usable cause/);
  });

  it('a debugGaps item with no matching criterion is a build defect: it reaches Debug and is logged (D21)', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls > 1) return satisfiedJudge();
        return remediateJudge({
          debugGaps: [{ id: 'FS-9', statement: 'statement for FS-9', reason: 'no artifact', artifact: null, files: [] }],
        });
      }
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-9', addressed: true, result: 'fixed' }], filesChanged: [] };
      return null;
    });
    const { logs } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    const debugs = agent.calls.filter((c) => c.opts.label === 'debug');
    expect(debugs).toHaveLength(1);
    expect(debugs[0].prompt).toContain('"id":"FS-9"');
    expect(logs.join('\n')).toMatch(/FS-9 is in debugGaps with no matching criterion -- treating it as a build defect \(it goes to Debug\)/);
  });

  it('a not_met gap whose cause is not-checkable is re-statused not_verifiable and never reaches Debug (D21)', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        return judgeCalls === 1 ? remediate([ev('FS-1', 'capability-absent'), met('FS-2')]) : satisfiedJudge({ criteria: [] });
      }
      return null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(agent.calls.filter((c) => c.opts.label === 'debug')).toHaveLength(0);
    expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_verifiable', kind: 'not-checkable-here', provenAt: 1 });
  });

  it('on an exit iteration a Judge kind that disagrees with its cause is overridden, logged, and written to state and report', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        return satisfiedJudge({ criteria: [ev('FS-1', 'judged-failed', { kind: 'evidence-gap' }), met('FS-2')], action: 'exit-stalled', gaps: ['FS-1'] });
      }
      if (opts.label === 'state-sync') return { synced: true };
      return null;
    });
    const { result, logs } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(result.criteria.find((c) => c.id === 'FS-1').kind).toBe('build-defect');
    expect(logs.join('\n')).toMatch(/returned kind "evidence-gap" for FS-1 but its cause "judged-failed" gives build-defect/);
    const syncs = agent.calls.filter((c) => c.opts.label === 'state-sync');
    expect(syncs).toHaveLength(1);
    // the state file save and the report input rewrite both carry the corrected kind, then render-report runs
    expect(syncs[0].prompt).toMatch(/"id":"FS-1","status":"not_met"[^\n]*"kind":"build-defect"/);
    expect(syncs[0].prompt).toMatch(/"outcome":"stalled"/);
    expect(syncs[0].prompt).toMatch(/\[\{"id":"FS-1","status":"not_met","reason":"[^"]*","kind":"build-defect"(,"causeKey":"criterion:FS-1")?\}/);
    expect(syncs[0].prompt).toContain('render-report --file');
    expect(syncs[0].prompt).toContain('judge-report-input-1.json');
  });

  it('writes nothing extra when the Judge left kind out and the cause gives it', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') return satisfiedJudge({ criteria: [ev('FS-1', 'judged-failed'), met('FS-2')], action: 'exit-stalled', gaps: ['FS-1'] });
      return null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(agent.calls.some((c) => c.opts.label === 'state-sync')).toBe(false);
    expect(result.criteria.find((c) => c.id === 'FS-1').kind).toBe('build-defect');
  });

  it('a met entry never gains a kind key', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      return opts.label === 'judge' ? satisfiedJudge({ criteria: [{ ...met('FS-1'), kind: null, settled: null }, met('FS-2')] }) : null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs() });
    for (const c of result.criteria) expect(c).not.toHaveProperty('kind');
  });

  it('the Judge prompt names kind and settled in the return spec, STEP 2-5, and the settled header', async () => {
    let jp = null;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        jp = prompt;
        return satisfiedJudge();
      }
      return null;
    });
    await runWorkflow(SOURCE, { agent, args: baseArgs() });
    expect(jp).toMatch(/"also return its "kind"|also return its "kind"/);
    expect(jp).toMatch(/"provenAt", "image", "ui", "imageExcluded", "kind", "settled"/);
    expect(jp).toMatch(/imageExcluded, kind, settled\)/);
    expect(jp).toMatch(/"imageExcluded","kind","settled","verificationDigest"(,"causeKey")? \}/);
    expect(jp).toMatch(/"settledEvidenceGaps":</);
    expect(jp).toMatch(/not_met evidence gap with "settled":"definition-problem"/);
    expect(jp).not.toMatch(/absent\/null for a "not_met" criterion, which stays\s+open/);
  });

  it('a must-pass settled evidence gap ends the run must-pass-unproven (D7)', async () => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return claimsFor('FS-1', 'FS-2');
      if (opts.label === 'judge') {
        judgeCalls += 1;
        if (judgeCalls === 1) return remediate([ev('FS-1'), met('FS-2')]);
        return satisfiedJudge({ criteria: [ev('FS-1')], gaps: [] });
      }
      if (opts.label === 'reconcile') return { reconciled: true };
      if (opts.label === 'state-sync') return { synced: true };
      return null;
    });
    const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-1'], cap: 4 }) });
    expect(result.outcome).toBe('must-pass-unproven');
    expect(result.mustPass.unproven).toEqual([{ id: 'FS-1', status: 'not_met' }]);
    expect(agent.calls.filter((c) => c.opts.label === 'reconcile')).toHaveLength(1);
  });
});

describe('verify-functional: digest-persisted and preclassified not-checkable entries (triage D8, D11-D13)', () => {
  const NC = (id, extra = {}) => ({ id, status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'no env', cause: 'capability-absent', kind: 'not-checkable-here', files: [], ...extra });
  const metC = (id) => ({ id, status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, files: [] });
  const resumeWith = (entry) => ({
    iteration: 0, // a fix-round snapshot: these tests are about what persists, not the regression pass
    criteria: [{ id: 'FS-1', status: 'met', artifact: 'a.txt', reason: null, tier1: 'pass', provenAt: 1 }, { id: 'FS-2', ...entry }],
    gapsClosed: [],
  });
  const ncEntry = (extra = {}) => ({ status: 'not_verifiable', artifact: null, reason: 'no env', cause: 'capability-absent', kind: 'not-checkable-here', provenAt: 1, ...extra });
  const run = async (args, judge) => {
    const prompts = { judge: [], exercise: [] };
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') { prompts.exercise.push(prompt); return exercisePlanClaims([{ criterion: 'FS-2', artifact: 'b.txt' }]); }
      if (opts.label === 'judge') { prompts.judge.push(prompt); return judge ? judge() : satisfiedJudge({ criteria: [metC('FS-2')] }); }
      if (opts.label === 'state-sync') return { synced: true };
      return null;
    });
    const out = await runWorkflow(SOURCE, { agent, args: baseArgs(args) });
    return { ...out, prompts, agent };
  };
  const two = { criteria: [criterion('FS-1'), criterion('FS-2')] };

  it('an equal non-empty digest keeps the entry settled: not exercised, not judged again', async () => {
    const { prompts, result } = await run({ ...two, verificationDigest: 'abc', resume: resumeWith(ncEntry({ verificationDigest: 'abc' })) }, () => satisfiedJudge({ criteria: [] }));
    expect(prompts.exercise).toHaveLength(0);
    expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'not_verifiable', kind: 'not-checkable-here', verificationDigest: 'abc' });
  });

  it('a different digest, no recorded digest, or an empty digest re-opens the entry', async () => {
    for (const [digest, rec] of [['new', { verificationDigest: 'old' }], ['abc', {}], ['', { verificationDigest: '' }]]) {
      const { prompts } = await run({ ...two, verificationDigest: digest, resume: resumeWith(ncEntry(rec)) });
      expect(openIdsFrom(prompts.judge[0])).toEqual(['FS-2']);
    }
  });

  it('a preclassified id is in no Exercise prompt, no Judge open set, and is settled with provenAt 0', async () => {
    const pre = [{ id: 'FS-2', status: 'not_verifiable', kind: 'not-checkable-here', cause: 'capability-absent', reason: 'parts board', preclassified: true }];
    const { prompts, result } = await run({ ...two, preclassified: pre, verificationDigest: 'abc' }, () => satisfiedJudge({ criteria: [metC('FS-1')] }));
    expect(prompts.exercise.join('\n')).not.toContain('statement for FS-2');
    expect(openIdsFrom(prompts.judge[0])).toEqual(['FS-1']);
    expect(settledFrom(prompts.judge[0])).toEqual([expect.objectContaining({ id: 'FS-2', provenAt: 0, kind: 'not-checkable-here', preclassified: true, verificationDigest: 'abc', reason: 'parts board' })]);
    expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'not_verifiable', provenAt: 0 });
  });

  it('a preclassified entry overrides a resume entry for the same id', async () => {
    const pre = [{ id: 'FS-2', status: 'not_verifiable', kind: 'not-checkable-here', reason: 'minified' }];
    const resume = resumeWith({ status: 'met', artifact: 'x', reason: null, tier1: 'pass', provenAt: 1 });
    const { prompts } = await run({ ...two, preclassified: pre, resume }, () => satisfiedJudge({ criteria: [] }));
    expect(settledFrom(prompts.judge[0]).find((c) => c.id === 'FS-2')).toMatchObject({ status: 'not_verifiable', provenAt: 0 });
  });

  it('a setup target whose criteria are all preclassified is not checked; one holding an open criterion still is', async () => {
    const pre = [{ id: 'FS-2', status: 'not_verifiable', kind: 'not-checkable-here', cause: 'capability-absent', reason: 'parts board', preclassified: true }];
    const targets = [setupTarget({ environment: 'settled-env', criteria: ['FS-2'] }), setupTarget({ environment: 'open-env', criteria: ['FS-1'] })];
    const { agent } = await run({ ...two, preclassified: pre, setupTargets: targets }, () => satisfiedJudge({ criteria: [metC('FS-1')] }));
    const setupCalls = agent.calls.filter((c) => c.opts.label === 'setup');
    expect(setupCalls).toHaveLength(1);
    expect(setupCalls[0].prompt).toContain('"environment":"open-env"');
    expect(setupCalls[0].prompt).not.toContain('"environment":"settled-env"');
  });

  it('dispatches no setup agent at all when every setup target is wholly preclassified', async () => {
    const pre = [{ id: 'FS-2', status: 'not_verifiable', kind: 'not-checkable-here', cause: 'capability-absent', reason: 'parts board', preclassified: true }];
    const { agent } = await run({ ...two, preclassified: pre, setupTargets: [setupTarget({ environment: 'settled-env', criteria: ['FS-2'] })] }, () => satisfiedJudge({ criteria: [metC('FS-1')] }));
    expect(agent.calls.filter((c) => c.opts.label === 'setup')).toHaveLength(0);
  });

  it('a target holding one preclassified and one open criterion is still checked', async () => {
    const pre = [{ id: 'FS-2', status: 'not_verifiable', kind: 'not-checkable-here', cause: 'capability-absent', reason: 'parts board', preclassified: true }];
    const { agent } = await run({ ...two, preclassified: pre, setupTargets: [setupTarget({ environment: 'mixed-env', criteria: ['FS-1', 'FS-2'] })] }, () => satisfiedJudge({ criteria: [metC('FS-1')] }));
    const setupCalls = agent.calls.filter((c) => c.opts.label === 'setup');
    expect(setupCalls).toHaveLength(1);
    expect(setupCalls[0].prompt).toContain('"environment":"mixed-env"');
  });

  it('rejects bad argument shapes before any dispatch', async () => {
    const bad = [
      [{ verificationDigest: 5 }, /verificationDigest must be a string/],
      [{ preclassified: 'x' }, /preclassified must be an array/],
      [{ preclassified: [{ id: 'NOPE', status: 'not_verifiable', kind: 'not-checkable-here' }] }, /not a criterion id/],
      [{ preclassified: [{ id: 'FS-1', status: 'met', kind: 'not-checkable-here' }] }, /status must be "not_verifiable"/],
      [{ preclassified: [{ id: 'FS-1', status: 'not_verifiable', kind: 'build-defect' }] }, /kind must be "not-checkable-here"/],
      [{ preclassified: [null] }, /preclassified\[0\]/],
    ];
    for (const [extra, pattern] of bad) {
      const agent = makeAgentStub(() => null);
      await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ ...two, ...extra }) })).rejects.toThrow(pattern);
      expect(agent.calls).toHaveLength(0);
    }
  });

  it('the setup prompt warms up, probes with --max-time 60 inside one call, and drops --max-time 5', async () => {
    const agent = makeAgentStub(setupPlan());
    await runWorkflow(SOURCE, { agent, args: baseArgs({ setupTargets: [setupTarget()] }) });
    const prompt = agent.calls.find((c) => c.opts.label === 'setup').prompt;
    expect(prompt).toMatch(/warm-up request/);
    expect(prompt).toContain('--max-time 60');
    expect(prompt).toMatch(/about 90 seconds/);
    expect(prompt).not.toContain('--max-time 5 ');
  });

  it('a not-checkable verdict on the exit iteration is saved by the script with the current digest', async () => {
    const { agent, prompts, result } = await run({ ...two, verificationDigest: 'abc123' }, () =>
      satisfiedJudge({ criteria: [metC('FS-1'), NC('FS-2')] }));
    expect(prompts.judge[0]).toContain('"verificationDigest": "abc123"');
    expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ kind: 'not-checkable-here', verificationDigest: 'abc123' });
    const sync = agent.calls.find((c) => c.opts.label === 'state-sync');
    expect(sync.prompt).toMatch(/"id":"FS-2","status":"not_verifiable"[^\n]*"verificationDigest":"abc123"/);
  });

  it('stamps nothing when the digest is empty', async () => {
    const { result } = await run({ ...two }, () => satisfiedJudge({ criteria: [metC('FS-1'), NC('FS-2')] }));
    expect(result.criteria.find((c) => c.id === 'FS-2')).not.toHaveProperty('verificationDigest');
  });
});

// --------------------------------------------------------------------------- shared-cause targeting

describe('verify-functional: shared-cause targeting (causes D1-D6, D13, D16-D18)', () => {
  const bd = (id, key, extra = {}) => ({
    id,
    status: 'not_met',
    tier1: 'fail',
    artifact: null,
    reason: `r-${id}`,
    cause: 'judged-failed',
    files: [`src/${id}.js`],
    ...(key === undefined ? {} : { causeKey: key }),
    ...extra,
  });
  const gapOf = (c) => ({ id: c.id, statement: `statement for ${c.id}`, reason: c.reason, artifact: null, files: c.files });
  const remediate = (criteria, overrides = {}) => ({
    action: 'remediate',
    reason: 'open gaps',
    criteria,
    gaps: criteria.filter((c) => c.status === 'not_met').map((c) => c.id),
    unbuilt: [],
    closed: [],
    notesUpdated: false,
    debugGaps: criteria.filter((c) => c.status === 'not_met').map(gapOf),
    ...overrides,
  });
  const exitWith = (action, criteria, overrides = {}) => ({
    action,
    reason: `judge says ${action}`,
    criteria,
    gaps: criteria.filter((c) => c.status === 'not_met').map((c) => c.id),
    unbuilt: [],
    closed: [],
    notesUpdated: false,
    ...overrides,
  });
  const met = (id) => ({ id, status: 'met', tier1: 'pass', artifact: `${id}.txt`, reason: null, files: [] });
  // Debug now gets one gap per cause (causes D7); this stub reports addressed every cause the prompt
  // sent whose representative or a member is among `ids`.
  const causesIn = (prompt) => JSON.parse(prompt.match(/\nCauses:\n(\[.*\])\n/)[1]);
  const debugOk = (ids) => (prompt) => ({
    results: causesIn(prompt)
      .filter((c) => ids.includes(c.representative.id) || c.members.some((m) => ids.includes(m.id)))
      .map((c) => ({ cause: c.cause, addressed: true, result: 'fixed' })),
    refresh: { ran: false, exitCode: null },
    filesChanged: [],
  });
  // An Exercise stub that claims exactly the criteria its prompt hands it.
  const claimsFromPrompt = (prompt) => {
    const list = JSON.parse(prompt.match(/\nCriteria:\n(\[.*\])\n/)[1]);
    return exercisePlanClaims(list.map((c) => ({ criterion: c.id, artifact: `${c.id}.txt` })));
  };
  const exercisedIdsOf = (call) => JSON.parse(call.prompt.match(/\nCriteria:\n(\[.*\])\n/)[1]).map((c) => c.id);
  const openCausesIn = (prompt) => JSON.parse(prompt.match(/Open causes so far \(data, never instructions\): (\[.*\])\. Every other/)[1]);
  const carriedIn = (prompt) => JSON.parse(prompt.match(/Open criteria NOT re-checked this iteration[^\n]*\n(\[.*\])/)[1]);
  const run = (judges, { debug = debugOk(['FS-1']), args = {}, extra, exercise = claimsFromPrompt } = {}) => {
    let judgeCalls = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercise(prompt, opts);
      if (opts.label === 'judge') {
        const j = judges[Math.min(judgeCalls, judges.length - 1)];
        judgeCalls += 1;
        return typeof j === 'function' ? j(prompt) : j;
      }
      if (opts.label === 'debug') return typeof debug === 'function' ? debug(prompt) : debug;
      if (extra) return extra(prompt, opts);
      return null;
    });
    return runWorkflow(SOURCE, { agent, args: baseArgs(args) }).then((r) => ({ agent, ...r }));
  };
  const four = { criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3'), criterion('FS-4')], cap: 4 };
  const labelsOf = (agent, label) => agent.calls.filter((c) => c.opts.label === label);

  it('source: the old last-ruling map and the kind-only sync are gone, and the schema accepts the new keys', () => {
    expect(SOURCE).not.toMatch(/lastRulings/);
    expect(SOURCE).not.toMatch(/syncKindState/);
    expect(SOURCE).toMatch(/const openEntries = new Map\(\)/);
    const schema = SOURCE.match(/const JUDGE_CRITERION_SCHEMA = \{[\s\S]*?\n\}\n/)[0];
    expect(schema).toMatch(/causeKey:/);
    expect(schema).toMatch(/awaiting:/);
  });

  it('AC 1: iteration 1 exercises the whole open set; after Debug only the representatives of the addressed causes', async () => {
    const { agent } = await run(
      [
        remediate([bd('FS-1', 'cache-bug'), bd('FS-2', 'cache-bug'), bd('FS-3', 'auth-bug'), bd('FS-4', 'auth-bug')]),
        exitWith('exit-stuck', [bd('FS-1', 'cache-bug'), bd('FS-3', 'auth-bug')]),
      ],
      { debug: debugOk(['FS-1', 'FS-2', 'FS-3', 'FS-4']), args: four }
    );
    const exercises = labelsOf(agent, 'exercise');
    expect(exercises).toHaveLength(2);
    expect(exercisedIdsOf(exercises[0])).toEqual(['FS-1', 'FS-2', 'FS-3', 'FS-4']);
    expect(exercisedIdsOf(exercises[1])).toEqual(['FS-1', 'FS-3']);
  });

  it('AC 1: every iteration before the first Debug pass exercises the whole open set', async () => {
    const gap = (id) => ({ id, status: 'not_met', tier1: 'fail', artifact: null, reason: `r-${id}`, cause: 'evidence-missing', files: [] });
    const { agent } = await run([remediate([gap('FS-1'), gap('FS-2'), gap('FS-3')]), exitWith('exit-stuck', [gap('FS-1'), gap('FS-2'), gap('FS-3')])], {
      args: { criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], cap: 3 },
    });
    expect(labelsOf(agent, 'debug')).toHaveLength(0);
    const exercises = labelsOf(agent, 'exercise');
    expect(exercises.map(exercisedIdsOf)).toEqual([
      ['FS-1', 'FS-2', 'FS-3'],
      ['FS-1', 'FS-2', 'FS-3'],
    ]);
  });

  it('AC 2: a missing or malformed causeKey makes the criterion its own cause, criterion:<id>, and is logged', async () => {
    const { agent, logs } = await run(
      [remediate([bd('FS-1', 'Not A Key!'), bd('FS-2'), bd('FS-3', 'shared'), bd('FS-4', 'shared')]), exitWith('exit-stuck', [bd('FS-1', 'x')])],
      { debug: debugOk(['FS-1', 'FS-2', 'FS-3', 'FS-4']), args: four }
    );
    const causes = openCausesIn(labelsOf(agent, 'judge')[1].prompt);
    expect(causes.map((c) => c.key)).toEqual(['criterion:FS-1', 'criterion:FS-2', 'shared']);
    expect(causes.find((c) => c.key === 'shared')).toMatchObject({ representative: 'FS-3', members: ['FS-3', 'FS-4'] });
    expect(logs.join('\n')).toMatch(/FS-1 has causeKey "Not A Key!", which fails .* its own cause, criterion:FS-1/);
    expect(logs.join('\n')).toMatch(/FS-2 has no causeKey -- it is its own cause, criterion:FS-2/);
  });

  it('a causeKey on a met or non-build-defect entry is dropped and logged', async () => {
    const { agent, logs } = await run([
      exitWith('exit-satisfied', [{ ...met('FS-1'), causeKey: 'stray' }, { ...bd('FS-2', 'stray', { cause: 'evidence-missing' }) }], { gaps: [] }),
    ]);
    expect(logs.join('\n')).toMatch(/causeKey "stray" for FS-1, which is met -- dropping it/);
    expect(logs.join('\n')).toMatch(/causeKey "stray" for FS-2, which is not an open build defect -- dropping it/);
    expect(labelsOf(agent, 'state-sync')).toHaveLength(1);
  });

  describe('AC 3: the representative (D3)', () => {
    const checks = { design: 'Capture: screenshot it.\nPage: render it.' };
    const checkArgs = (criteria) => ({ criteria, checks, pagesDir: '.trd-state/example/pages', cap: 4 });

    it('is the first non-check-derived member in definition order', async () => {
      const { agent } = await run([remediate([bd('FS-1', 'k'), bd('FS-2', 'k'), bd('FS-3', 'k')]), exitWith('exit-stuck', [bd('FS-2', 'k')])], {
        debug: debugOk(['FS-1', 'FS-2', 'FS-3']),
        args: checkArgs([checkCriterion('FS-1', 'design'), criterion('FS-2'), checkCriterion('FS-3', 'design')]),
      });
      expect(openCausesIn(labelsOf(agent, 'judge')[1].prompt)).toEqual([expect.objectContaining({ key: 'k', representative: 'FS-2' })]);
      expect(exercisedIdsOf(labelsOf(agent, 'exercise')[1])).toEqual(['FS-2']);
    });

    it('is the first member when every member is check-derived', async () => {
      const { agent } = await run([remediate([bd('FS-1', 'k'), bd('FS-2', 'k')]), exitWith('exit-stuck', [bd('FS-1', 'k')])], {
        debug: debugOk(['FS-1', 'FS-2']),
        args: checkArgs([checkCriterion('FS-1', 'design'), checkCriterion('FS-2', 'design')]),
      });
      expect(openCausesIn(labelsOf(agent, 'judge')[1].prompt)).toEqual([expect.objectContaining({ key: 'k', representative: 'FS-1' })]);
    });

    it('is kept across iterations while it is a member and still eligible, even when an earlier member joins', async () => {
      const { agent } = await run(
        [
          remediate([bd('FS-1', 'other'), bd('FS-2', 'k'), bd('FS-3', 'k')]),
          // FS-1 now joins k, ahead of FS-2 in definition order; FS-2 stays the representative.
          remediate([bd('FS-1', 'k'), bd('FS-2', 'k')]),
          exitWith('exit-stuck', [bd('FS-2', 'k')]),
        ],
        { debug: debugOk(['FS-1', 'FS-2', 'FS-3']), args: { criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], cap: 4 } }
      );
      const exercises = labelsOf(agent, 'exercise');
      expect(exercisedIdsOf(exercises[1])).toEqual(['FS-1', 'FS-2']); // reps of 'other' and 'k'
      expect(openCausesIn(labelsOf(agent, 'judge')[2].prompt).find((c) => c.key === 'k')).toMatchObject({ representative: 'FS-2', members: ['FS-1', 'FS-2', 'FS-3'] });
      expect(exercisedIdsOf(exercises[2])).toEqual(['FS-2']);
    });

    it('moves off a check-derived representative once a non-check-derived member exists', async () => {
      const { agent } = await run(
        [
          remediate([bd('FS-1', 'k'), bd('FS-2', 'other'), bd('FS-3', 'k')]),
          remediate([bd('FS-1', 'k'), bd('FS-2', 'k')]), // FS-2 (plain) joins k; FS-1 is check-derived
          exitWith('exit-stuck', [bd('FS-2', 'k')]),
        ],
        {
          debug: debugOk(['FS-1', 'FS-2', 'FS-3']),
          args: checkArgs([checkCriterion('FS-1', 'design'), criterion('FS-2'), checkCriterion('FS-3', 'design')]),
        }
      );
      expect(openCausesIn(labelsOf(agent, 'judge')[1].prompt).find((c) => c.key === 'k').representative).toBe('FS-1');
      expect(openCausesIn(labelsOf(agent, 'judge')[2].prompt).find((c) => c.key === 'k').representative).toBe('FS-2');
    });
  });

  it('AC 4: a carried criterion keeps its last verdict in the result, the state sync, the must-pass recheck and the render rows', async () => {
    const checks = { design: 'Capture: screenshot it.\nPage: render it.' };
    const { agent, result } = await run(
      [
        remediate([bd('FS-1', 'k'), bd('FS-2', 'k')]),
        // FS-1 is the representative and passes; FS-2 is carried, awaiting the regression pass at the exit.
        exitWith('exit-satisfied', [met('FS-1')], { gaps: [], closed: ['FS-1'] }),
        // The regression pass re-checks FS-2 and finds it still failing: the carried verdict is replaced by the ruling.
        exitWith('exit-satisfied', [bd('FS-2', 'k')], { gaps: [] }),
      ],
      {
        debug: debugOk(['FS-1', 'FS-2']),
        args: { criteria: [criterion('FS-1'), checkCriterion('FS-2', 'design')], checks, pagesDir: '.trd-state/example/pages', cap: 3, mustPassIds: ['FS-2'] },
        extra: (prompt, opts) => (opts.label === 'render' ? { rendered: true, page: 'p.html', cards: 1 } : null),
      }
    );
    // The carried entry reaches the Judge as a carried block with its last verdict.
    const carried = carriedIn(labelsOf(agent, 'judge')[1].prompt);
    expect(carried).toEqual([expect.objectContaining({ id: 'FS-2', status: 'not_met', reason: 'r-FS-2', cause: 'judged-failed', causeKey: 'k' })]);
    // The result keeps it, not as a placeholder.
    expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'not_met', reason: 'r-FS-2', kind: 'build-defect', causeKey: 'k' });
    // The must-pass recheck sees the carried gap, so the Judge's own exit stands (no reconcile).
    expect(labelsOf(agent, 'reconcile')).toHaveLength(0);
    expect(result.outcome).toBe('satisfied');
    // The render rows (iteration 2's exit renders) carry its last verdict and reason.
    const renders = labelsOf(agent, 'render');
    const lastRender = renders[renders.length - 1].prompt;
    expect(lastRender).toMatch(/"id":"FS-2"[^}]*"status":"not_met","reason":"r-FS-2"/);
  });

  it('AC 4: the state sync writes a carried criterion with its last verdict, not a placeholder', async () => {
    const { agent } = await run([remediate([bd('FS-1', 'k'), bd('FS-2', 'k')]), exitWith('exit-stuck', [bd('FS-1', 'Bad Key')])], {
      debug: debugOk(['FS-1', 'FS-2']),
      args: { criteria: [criterion('FS-1'), criterion('FS-2')], cap: 3 },
    });
    const sync = labelsOf(agent, 'state-sync');
    expect(sync).toHaveLength(1);
    const written = JSON.parse(sync[0].prompt.match(/exactly as given, to [^\n]*:\n(\{.*\})\n/)[1]);
    expect(written.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'not_met', tier1: 'fail', reason: 'r-FS-2', cause: 'judged-failed', causeKey: 'k' });
    // FS-1 is the representative of 'k'; its malformed key is the fallback, which never closes a cause (D4),
    // so it stays in 'k'.
    expect(written.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_met', causeKey: 'k' });
    expect(written.causes.map((c) => c.key)).toEqual(['k']);
    expect(written.exercised).toEqual([
      { iteration: 1, ids: ['FS-1', 'FS-2'] },
      { iteration: 2, ids: ['FS-1'] },
    ]);
    // Patches for the report input add the key and the top-level causes.
    expect(sync[0].prompt).toMatch(/"id":"FS-1"[^}]*"causeKey":"k"/);
    expect(sync[0].prompt).toMatch(/top-level "causes"/);
  });

  it('AC 5: the Judge prompt names the cause literals, the closure rule with the key pattern, six keys and causes written after ruling', async () => {
    const { agent } = await run([remediate([bd('FS-1', 'k'), bd('FS-2', 'k')]), exitWith('exit-stuck', [bd('FS-1', 'k')])], {
      debug: debugOk(['FS-1', 'FS-2']),
      args: { criteria: [criterion('FS-1'), criterion('FS-2')], cap: 3 },
    });
    const [first, second] = labelsOf(agent, 'judge').map((c) => c.prompt);
    for (const p of [first, second]) {
      expect(p).toContain('"causes":');
      expect(p).toContain('"previousCauses":');
      expect(p).toContain('"awaitingRegression":');
      expect(p).toContain('six top-level keys');
      expect(p).toMatch(/AFTER you have ruled/);
      expect(p).toContain('^[a-z0-9][a-z0-9._-]{0,63}$');
    }
    expect(first).toContain('"previousCauses":null');
    // Iteration 2: previousCauses is the open keys, and the closure rule for k quotes the pattern.
    expect(second).toContain('"previousCauses":["k"]');
    expect(second).toMatch(/Cause "k" \(representative "FS-1", other members \["FS-2"\]\): if you rule "FS-1" "met", or "not_met" with a cause key that matches \^\[a-z0-9\]\[a-z0-9\._-\]\{0,63\}\$ and differs from "k", leave "k" out of "causes" and add \["FS-2"\] to "awaitingRegression"; otherwise \(including a key that fails that pattern, or none\) put "k" in "causes"/);
    expect(second).toMatch(/exercised": \[\{"iteration":1,"ids":\["FS-1","FS-2"\]\},\{"iteration":2,"ids":\["FS-1"\]\}\]/);
  });

  it('a cause whose representative is not re-checked is handed to the Judge as a literal to keep', async () => {
    const { agent } = await run(
      [remediate([bd('FS-1', 'a'), bd('FS-2', 'b')]), remediate([bd('FS-1', 'a')]), exitWith('exit-stuck', [bd('FS-1', 'a')])],
      { debug: debugOk(['FS-1']), args: { criteria: [criterion('FS-1'), criterion('FS-2')], cap: 4 } }
    );
    // Iteration 2's Debug is sent only FS-1, so iteration 3 re-checks cause a's representative alone.
    const exercises = labelsOf(agent, 'exercise');
    expect(exercisedIdsOf(exercises[2])).toEqual(['FS-1']);
    const third = labelsOf(agent, 'judge')[2].prompt;
    expect(third).toContain('"previousCauses":["a","b"]');
    expect(third).toMatch(/starting from \["b"\] \(the open causes whose representative is not re-checked/);
    expect(third).toMatch(/Cause "a" \(representative "FS-1"/);
    expect(third).not.toMatch(/Cause "b" \(representative/);
  });

  describe('AC 6: resume.exercised (D18)', () => {
    const resumeWith = (exercised) => ({ iteration: 1, criteria: [], gapsClosed: [0], exercised, outcome: null, causes: [{ key: 'ignored' }], extra: true });

    it('drops a malformed value with a log line and starts the history empty', async () => {
      for (const bad of ['nope', [{ iteration: 'x', ids: [] }], [{ iteration: 1, ids: [3] }], [{ iteration: 1, ids: [], confirmation: false }], [{ iteration: 1, ids: [], regression: 3 }], [{ iteration: 1, ids: [], regression: true }], [{ iteration: 1, ids: [], regression: '1' }], [null]]) {
        const { agent, logs } = await run([exitWith('exit-satisfied', [met('FS-1')], { gaps: [] })], {
          args: { criteria: [criterion('FS-1')], cap: 3, resume: resumeWith(bad) },
        });
        expect(logs.join('\n')).toMatch(/resume\.exercised is not an array of .* dropping it; the exercised history starts empty/);
        expect(labelsOf(agent, 'judge')[0].prompt).toMatch(/"exercised": \[\{"iteration":2,"ids":\["FS-1"\]\}\]/);
      }
    });

    it('does not log for an absent value', async () => {
      const { logs } = await run([exitWith('exit-satisfied', [met('FS-1')], { gaps: [] })], {
        args: { criteria: [criterion('FS-1')], cap: 3, resume: { iteration: 1, criteria: [], gapsClosed: [0] } },
      });
      expect(logs.join('\n')).not.toMatch(/resume\.exercised/);
    });

    it('seeds a valid value, entries carrying confirmation: true (older files) or regression: 1 | 2 included, into the Judge literal and the synced state', async () => {
      const seeded = [
        { iteration: 1, ids: ['FS-1'] },
        { iteration: 1, ids: ['FS-1'], confirmation: true },
        { iteration: 1, ids: ['FS-1'], regression: 1 },
        { iteration: 1, ids: ['FS-1'], regression: 2 },
      ];
      const { agent, logs } = await run([exitWith('exit-stuck', [bd('FS-1', 'Bad Key')])], {
        args: { criteria: [criterion('FS-1')], cap: 3, resume: resumeWith(seeded) },
      });
      expect(logs.join('\n')).not.toMatch(/resume\.exercised/);
      expect(labelsOf(agent, 'judge')[0].prompt).toContain(
        '"exercised": [{"iteration":1,"ids":["FS-1"]},{"iteration":1,"ids":["FS-1"],"confirmation":true},{"iteration":1,"ids":["FS-1"],"regression":1},{"iteration":1,"ids":["FS-1"],"regression":2},{"iteration":2,"ids":["FS-1"]}]'
      );
      const sync = labelsOf(agent, 'state-sync');
      expect(sync).toHaveLength(1);
      const written = JSON.parse(sync[0].prompt.match(/exactly as given, to [^\n]*:\n(\{.*\})\n/)[1]);
      expect(written.exercised).toEqual([...seeded, { iteration: 2, ids: ['FS-1'] }]);
    });
  });

  it('FS-4 (resume): the first Exercise pass of a resumed invocation receives the whole open set, whatever cause state the snapshot carries', async () => {
    const open = (id, causeKey) => ({ id, status: 'not_met', tier1: 'fail', artifact: null, reason: `r-${id}`, cause: 'build-defect', kind: 'build-defect', causeKey, files: [] });
    const resume = {
      iteration: 1,
      criteria: [open('FS-1', 'cache-bug'), open('FS-2', 'cache-bug'), open('FS-3', 'auth-bug'), open('FS-4', 'auth-bug')],
      gapsClosed: [0],
      exercised: [{ iteration: 1, ids: ['FS-1', 'FS-2', 'FS-3', 'FS-4'] }],
    };
    const { agent } = await run([exitWith('exit-stuck', [bd('FS-1', 'cache-bug'), bd('FS-2', 'cache-bug'), bd('FS-3', 'auth-bug'), bd('FS-4', 'auth-bug')])], {
      args: { ...four, resume },
    });
    const exercises = labelsOf(agent, 'exercise');
    expect(labelsOf(agent, 'debug')).toHaveLength(0);
    // A targeted set would be the representatives only (FS-1, FS-3); the first resumed pass walks all four.
    expect(exercises.map(exercisedIdsOf)[0]).toEqual(['FS-1', 'FS-2', 'FS-3', 'FS-4']);
  });

  it('AC 7: the zero-criteria branch hands decide-next causes: [], previousCauses: null and awaitingRegression: []', async () => {
    const { agent } = await run([exitWith('exit-satisfied', [], { gaps: [] })], { args: { criteria: [] } });
    const prompt = labelsOf(agent, 'judge')[0].prompt;
    expect(prompt).toContain('"causes":[],"previousCauses":null,"awaitingRegression":[]');
    expect(prompt).toContain('six top-level keys');
  });

  it('AC 8: an id Debug reported unbuilt is ruled unbuilt and left out of the carried block; the rest are carried', async () => {
    const { agent } = await run(
      [
        remediate([bd('FS-1', 'a'), bd('FS-2', 'b'), bd('FS-3', 'c')]),
        exitWith('exit-unbuilt', [{ id: 'FS-2', status: 'unbuilt', tier1: null, artifact: null, reason: 'absent', cause: 'not-built', files: [] }], { unbuilt: ['FS-2'], gaps: ['FS-1', 'FS-3'] }),
      ],
      {
        debug: { results: [{ cause: 'b', addressed: true, result: 'absent', unbuilt: true }], refresh: { ran: false, exitCode: null }, filesChanged: [] },
        args: { criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], cap: 4 },
      }
    );
    expect(labelsOf(agent, 'exercise')).toHaveLength(1);
    const second = labelsOf(agent, 'judge')[1].prompt;
    expect(second).toMatch(/Rule each of them "unbuilt"/);
    expect(carriedIn(second).map((e) => e.id)).toEqual(['FS-1', 'FS-3']);
    expect(JSON.parse(second.match(/under judgement this iteration \(\d+ of \d+\):\n(\[.*\])/)[1]).map((c) => c.id)).toEqual(['FS-2']);
  });

  describe('Debug per cause (causes D7-D11)', () => {
    const debugReturn = (results) => ({ results, refresh: { ran: true, exitCode: 0 }, filesChanged: [] });
    const hasCauses = [bd('FS-1', 'a', { files: ['./src/x.js', 'src/y.js'] }), bd('FS-2', 'a', { files: ['src/x.js', 'src/z.js'] }), bd('FS-3', 'b'), bd('FS-4', 'b')];
    const stuck = exitWith('exit-stuck', [bd('FS-1', 'a'), bd('FS-3', 'b')]);

    it('dispatches ONE app-debugger per remediate iteration with one gap per cause: representative, members, normalised union of files', async () => {
      const { agent } = await run([remediate(hasCauses), stuck], { debug: debugOk(['FS-1', 'FS-3']), args: four });
      const debugs = labelsOf(agent, 'debug');
      expect(debugs).toHaveLength(1);
      expect(debugs[0].opts.agentType).toBe('app-debugger');
      const causes = causesIn(debugs[0].prompt);
      expect(causes.map((c) => c.cause)).toEqual(['a', 'b']);
      expect(causes[0].representative).toMatchObject({ id: 'FS-1', statement: 'statement for FS-1', reason: 'r-FS-1' });
      expect(causes[0].members.map((m) => m.id)).toEqual(['FS-1', 'FS-2']);
      expect(causes[0].members[1]).toMatchObject({ id: 'FS-2', reason: 'r-FS-2' });
      // './src/x.js' and 'src/x.js' are one file
      expect(causes[0].files).toEqual(['src/x.js', 'src/y.js', 'src/z.js']);
    });

    it('DEBUG_SCHEMA is per cause: cause, addressed and result required, preCheck optional, refresh still required', async () => {
      const { agent } = await run([remediate(hasCauses), stuck], { debug: debugOk(['FS-1']), args: four });
      const schema = labelsOf(agent, 'debug')[0].opts.schema;
      expect(schema.required).toEqual(['results', 'refresh', 'filesChanged']);
      expect(schema.properties.results.items.required).toEqual(['cause', 'addressed', 'result']);
      expect(schema.properties.results.items.properties.preCheck.required).toEqual(['command', 'exitCode']);
      expect(schema.properties.results.items.properties.criterion).toBeUndefined();
    });

    it('re-captures only the causes Debug addressed; an unaddressed or unlisted cause is left out and logged', async () => {
      const { agent, logs } = await run([remediate(hasCauses), stuck], {
        debug: debugReturn([{ cause: 'a', addressed: true, result: 'fixed' }, { cause: 'b', addressed: false, result: 'could not' }]),
        args: four,
      });
      expect(labelsOf(agent, 'exercise').map(exercisedIdsOf)).toEqual([['FS-1', 'FS-2', 'FS-3', 'FS-4'], ['FS-1']]);
      expect(logs.join('\n')).toMatch(/Debug did not address cause b/);

      const missing = await run([remediate(hasCauses), stuck], { debug: debugReturn([{ cause: 'a', addressed: true, result: 'fixed' }]), args: four });
      expect(labelsOf(missing.agent, 'exercise').map(exercisedIdsOf)[1]).toEqual(['FS-1']);
      expect(missing.logs.join('\n')).toMatch(/Debug returned no entry for cause b -- not addressed/);
    });

    it('a pre-check that fails, or has no exit code, keeps its cause out of the next Exercise set; a passing one is a hint to that slice only', async () => {
      const { agent } = await run([remediate(hasCauses), stuck], {
        debug: debugReturn([
          { cause: 'a', addressed: true, result: 'fixed', preCheck: { command: 'npx jest a.test.js', exitCode: 0 } },
          { cause: 'b', addressed: true, result: 'fixed', preCheck: { command: 'npx jest b.test.js', exitCode: 1 } },
        ]),
        args: four,
      });
      const exercises = labelsOf(agent, 'exercise');
      expect(exercisedIdsOf(exercises[1])).toEqual(['FS-1']);
      expect(exercises[1].prompt).toMatch(/Debug ran the check shown and it passed/);
      expect(exercises[1].prompt).toContain('npx jest a.test.js');
      expect(exercises[1].prompt).not.toContain('b.test.js');
      expect(exercises[0].prompt).not.toContain('a.test.js');
      // the Judge never sees a pre-check, so one can never settle a criterion met
      for (const j of labelsOf(agent, 'judge')) expect(j.prompt).not.toMatch(/a\.test\.js|b\.test\.js|pre-check/i);

      const noCode = await run([remediate(hasCauses), stuck], {
        debug: debugReturn([{ cause: 'a', addressed: true, result: 'fixed', preCheck: { command: 'npx jest a.test.js', exitCode: null } }]),
        args: four,
      });
      expect(labelsOf(noCode.agent, 'exercise')).toHaveLength(1);
      expect(noCode.logs.join('\n')).toMatch(/pre-check for cause a .* recorded no exit code/);
    });

    it('the hint does not outlive the iteration it was given in', async () => {
      const once = (() => {
        let n = 0;
        return () => (++n === 1 ? debugReturn([{ cause: 'a', addressed: true, result: 'fixed', preCheck: { command: 'npx jest a.test.js', exitCode: 0 } }]) : undefined);
      })();
      const { agent } = await run([remediate(hasCauses), remediate(hasCauses), stuck], { debug: once, args: four });
      const exercises = labelsOf(agent, 'exercise');
      expect(exercises[1].prompt).toContain('npx jest a.test.js');
      // the second Debug pass is dead: nothing addressed, so no third Exercise pass is dispatched
      expect(exercises).toHaveLength(2);
    });

    it('a cause reported unbuilt puts all its members into forcedUnbuilt', async () => {
      const { agent } = await run([remediate(hasCauses), exitWith('exit-unbuilt', [], { gaps: ['FS-3', 'FS-4'] })], {
        debug: debugReturn([{ cause: 'a', addressed: false, result: 'absent', unbuilt: true }, { cause: 'b', addressed: true, result: 'fixed' }]),
        args: four,
      });
      expect(labelsOf(agent, 'exercise')).toHaveLength(1);
      expect(labelsOf(agent, 'judge')[1].prompt).toContain('["FS-1","FS-2"]');
    });

    it('debugAttempts records one line per cause', async () => {
      const { result } = await run([remediate(hasCauses), stuck], {
        debug: debugReturn([{ cause: 'a', addressed: true, result: 'fixed x' }, { cause: 'b', addressed: true, result: 'fixed y' }]),
        args: four,
      });
      expect(result.debugAttempts[0].result).toBe('a: fixed x; b: fixed y');
    });
  });

  describe('how a cause ends (causes D4, D14, D15)', () => {
    const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `FS-${from + i}`);
    const defs = (n) => range(1, n).map((id) => criterion(id));
    const recordsIn = (prompt) => JSON.parse(prompt.match(/before this ruling: (\[.*\])\. Apply the closure/)[1]);
    const syncedState = (call) => JSON.parse(call.prompt.match(/exactly as given, to [^\n]*:\n(\{.*\})\n/)[1]);
    const gate = { fullRunCommand: 'make e2e' };
    const passRun = { command: 'make e2e', status: 'pass' };

    it('AC 1: a 20-member cause is re-checked through its representative; when it is met the cause closes and 19 members await, outside every later inner-loop Exercise prompt', async () => {
      const a = range(1, 20);
      const { agent } = await run(
        [
          remediate([...a.map((id) => bd(id, 'a')), bd('FS-21', 'b'), bd('FS-22', 'b')]),
          remediate([met('FS-1'), bd('FS-21', 'b')]),
          exitWith('exit-stuck', [bd('FS-21', 'b')]),
        ],
        { debug: debugOk(['FS-1', 'FS-21']), args: { criteria: defs(22), cap: 5 } }
      );
      const exercises = labelsOf(agent, 'exercise');
      expect(exercisedIdsOf(exercises[0])).toHaveLength(22);
      expect(exercisedIdsOf(exercises[1])).toEqual(['FS-1', 'FS-21']);
      expect(exercisedIdsOf(exercises[2])).toEqual(['FS-21']); // none of the 19 waiting members
      // the second Debug pass is sent only the open cause
      expect(causesIn(labelsOf(agent, 'debug')[1].prompt).map((c) => c.cause)).toEqual(['b']);
      // the third Judge is handed the 19 as carried, awaiting; the cause is closed, with closedAt
      const judge3 = labelsOf(agent, 'judge')[2].prompt;
      const carried = carriedIn(judge3);
      expect(carried.filter((c) => c.awaiting === 'regression').map((c) => c.id)).toEqual(range(2, 20));
      expect(recordsIn(judge3).find((c) => c.key === 'a')).toMatchObject({ status: 'closed', closedAt: 2, representative: 'FS-1' });
      // and they are checked once, at the exit, after the loop (D15)
      expect(exercises).toHaveLength(4);
      expect(exercisedIdsOf(exercises[3])).toEqual(range(2, 20));
    });

    it('AC 2: a representative ruled not_met under a new valid key closes its old cause and joins the new one', async () => {
      const { agent, logs } = await run(
        [
          remediate([bd('FS-1', 'a'), bd('FS-2', 'a'), bd('FS-3', 'b')]),
          remediate([bd('FS-1', 'c'), bd('FS-3', 'b')]),
          exitWith('exit-unbuilt', [bd('FS-1', 'c')], { unbuilt: ['FS-1'] }),
        ],
        { debug: debugOk(['FS-1', 'FS-2', 'FS-3']), args: { criteria: defs(3), cap: 5 } }
      );
      const judge3 = labelsOf(agent, 'judge')[2].prompt;
      const open = openCausesIn(judge3);
      expect(open.find((c) => c.key === 'c')).toMatchObject({ representative: 'FS-1', members: ['FS-1'] });
      expect(open.find((c) => c.key === 'a')).toBeUndefined();
      expect(recordsIn(judge3).find((c) => c.key === 'a')).toMatchObject({ status: 'closed', closedAt: 2 });
      expect(carriedIn(judge3).find((c) => c.id === 'FS-2')).toMatchObject({ awaiting: 'regression' });
      expect(logs.join('\n')).toMatch(/FS-1 now fails under cause c, not a -- a closes and FS-1 joins c/);
    });

    it('AC 3: a representative with a missing or malformed key stays in its cause, which does not close, and a log line names it', async () => {
      const { agent, logs } = await run(
        [
          remediate([bd('FS-1', 'a'), bd('FS-2', 'a')]),
          remediate([bd('FS-1', 'Bad Key')]),
          exitWith('exit-unbuilt', [bd('FS-1', 'a')], { unbuilt: ['FS-1'] }),
        ],
        { debug: debugOk(['FS-1', 'FS-2']), args: { criteria: defs(2), cap: 5 } }
      );
      const judge3 = labelsOf(agent, 'judge')[2].prompt;
      expect(openCausesIn(judge3).find((c) => c.key === 'a')).toMatchObject({ representative: 'FS-1', members: ['FS-1', 'FS-2'] });
      expect(carriedIn(judge3).some((c) => c.awaiting)).toBe(false);
      expect(logs.join('\n')).toMatch(/FS-1 has the fallback key criterion:FS-1 .* it stays in cause a, which does not close/);
      // the Judge-written file named the malformed key, so the script corrected it
      expect(labelsOf(agent, 'state-sync').length).toBeGreaterThan(0);
    });

    it('AC 4: a representative ruled an evidence gap leaves its cause; the cause takes a new representative, exercised next iteration with no Debug pass', async () => {
      const gap = { id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', cause: 'evidence-missing', files: [] };
      const { agent } = await run(
        [remediate([bd('FS-1', 'a'), bd('FS-2', 'a'), bd('FS-3', 'a')]), remediate([gap]), exitWith('exit-stuck', [bd('FS-2', 'a')])],
        { debug: debugOk(['FS-1', 'FS-2', 'FS-3']), args: { criteria: defs(3), cap: 5 } }
      );
      expect(labelsOf(agent, 'debug')).toHaveLength(1); // the first iteration's only
      const exercises = labelsOf(agent, 'exercise');
      expect(exercisedIdsOf(exercises[1])).toEqual(['FS-1']);
      // FS-1 (the re-capture) and FS-2 (a's new representative, by definition order)
      expect(exercisedIdsOf(exercises[2])).toEqual(['FS-1', 'FS-2']);
      expect(openCausesIn(labelsOf(agent, 'judge')[2].prompt).find((c) => c.key === 'a')).toMatchObject({ representative: 'FS-2', members: ['FS-2', 'FS-3'] });
    });

    it('re-captures an evidence gap the Judge ruled but left out of debugGaps, so a targeted iteration does not strand it', async () => {
      const gap = { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', cause: 'evidence-missing', files: [] };
      const { agent } = await run(
        [remediate([bd('FS-1', 'a'), gap], { debugGaps: [gapOf(bd('FS-1', 'a'))] }), exitWith('exit-stuck', [bd('FS-1', 'a'), met('FS-2')])],
        { debug: debugOk(['FS-1']), args: { criteria: defs(2), cap: 5 } }
      );
      expect(exercisedIdsOf(labelsOf(agent, 'exercise')[1])).toEqual(['FS-1', 'FS-2']);
    });

    describe('D14: the stall backstop', () => {
      const stalled = (extra = {}) => exitWith('exit-stalled', [met('FS-1'), bd('FS-2', 'b')], { reason: 'no progress', finalRun: passRun, ...extra });
      const two = { criteria: defs(2), ...gate };

      it('turns exit-stalled into remediate below the cap, rewrites outcome to null, builds Debug gaps from the criteria entries and discards the stalled gate', async () => {
        const { agent, result, logs } = await run(
          [remediate([bd('FS-1', 'a'), bd('FS-2', 'b')]), stalled(), exitWith('exit-stuck', [bd('FS-2', 'b')], { finalRun: { command: 'make e2e', status: 'fail' } })],
          { debug: debugOk(['FS-1', 'FS-2']), args: { ...two, cap: 3 } }
        );
        // Two writes: the replaced exit's (outcome null, the run goes on) and the real exit's, which
        // the regression pass owns after a Debug pass (regression pass D18b).
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(2);
        expect(syncedState(sync[0]).outcome).toBeNull();
        expect(syncedState(sync[1]).outcome).toBe('stuck');
        // one Debug pass for the open cause, from the Judge's criteria entry (the return has no debugGaps)
        const debugs = labelsOf(agent, 'debug');
        expect(debugs).toHaveLength(2);
        expect(causesIn(debugs[1].prompt)).toEqual([
          expect.objectContaining({ cause: 'b', representative: expect.objectContaining({ id: 'FS-2', reason: 'r-FS-2', files: ['src/FS-2.js'] }) }),
        ]);
        // the stalled exit's gate is gone: the final result carries the real exit's, and the real exit's Judge was told to run it
        expect(result.outcome).toBe('stuck');
        expect(result.finalRun).toEqual({ command: 'make e2e', status: 'fail' });
        expect(labelsOf(agent, 'judge')[2].prompt).toContain('make e2e');
        expect(logs.join('\n')).toMatch(/exit-stalled but cause\(s\) a closed .* becomes remediate/);
        expect(logs.join('\n')).toMatch(/stalled exit's full-environment run is discarded/);
      });

      it('at the cap the replacement is exit-stuck, with the state file outcome and the report input rewritten', async () => {
        const { agent, result } = await run([remediate([bd('FS-1', 'a'), bd('FS-2', 'b')]), stalled()], {
          debug: debugOk(['FS-1', 'FS-2']),
          args: { ...two, cap: 2 },
        });
        expect(result.outcome).toBe('stuck');
        expect(result.reason).toBe('iteration cap (2) reached with 1 gap(s) still open');
        expect(result.finalRun).toEqual(passRun); // still an exit: the gate that ran stands
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        expect(syncedState(sync[0]).outcome).toBe('stuck');
        expect(sync[0].prompt).toMatch(/top-level "outcome" to "stuck" and its top-level "reason" to "iteration cap \(2\) reached/);
      });

      it('leaves exit-stalled alone when no cause closed', async () => {
        const { agent, result } = await run(
          [remediate([bd('FS-1', 'a'), bd('FS-2', 'b')]), exitWith('exit-stalled', [bd('FS-1', 'a'), bd('FS-2', 'b')])],
          { debug: debugOk(['FS-1', 'FS-2']), args: { ...two, cap: 3 } }
        );
        expect(result.outcome).toBe('stalled');
        // No kind, key or action was corrected; the one write is the exit's own, after a Debug pass (D18b).
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        expect(syncedState(sync[0]).outcome).toBe('stalled');
        expect(sync[0].prompt).not.toMatch(/the workflow replaced the action the Judge wrote/);
      });
    });

    describe('D15 (now the regression pass): members awaiting a closed cause are re-checked at the exit', () => {
      const four = { criteria: defs(4), cap: 5, ...gate };
      const seeds = () => remediate([bd('FS-1', 'a'), bd('FS-2', 'a'), bd('FS-3', 'a'), bd('FS-4', 'b')]);
      const exitSatisfied = () => exitWith('exit-satisfied', [met('FS-1'), met('FS-4')], { gaps: [], finalRun: passRun });
      // The exit iteration's Exercise and Judge are calls 0..1 (iteration 1) and 2 (the exit's own is the
      // second Judge); a regression round r is the call after them.
      const regressionCalls = (agent, round = 1) => {
        const exercises = labelsOf(agent, 'exercise');
        const judges = labelsOf(agent, 'judge');
        return { exercise: exercises[1 + round], judge: judges[1 + round] };
      };

      it('AC 6: round 1 is one Exercise and one Judge over only the awaiting members, cap = iteration, -regression-1 files, no gate; a member still failing makes a satisfied exit non-satisfied (one repair round and a round 2 follow)', async () => {
        const { agent, result } = await run(
          [seeds(), exitSatisfied(), exitWith('exit-stuck', [met('FS-2'), bd('FS-3', 'a')], { gaps: ['FS-3'] })],
          { debug: debugOk(['FS-1', 'FS-4']), args: four }
        );
        // iteration 1, the exit, round 1, round 2: never a third round (O5); one loop Debug and one repair Debug
        expect(labelsOf(agent, 'exercise')).toHaveLength(4);
        expect(labelsOf(agent, 'judge')).toHaveLength(4);
        expect(labelsOf(agent, 'debug')).toHaveLength(2);
        const { exercise, judge } = regressionCalls(agent);
        expect(exercisedIdsOf(exercise)).toEqual(['FS-2', 'FS-3']);
        expect(exercise.prompt).toMatch(/regression pass 1 at the end of iteration 2/);
        expect(judge.prompt).toMatch(/REGRESSION pass 1 at the end of iteration 2/);
        expect(judge.prompt).toContain('judge-claims-2-regression-1.json');
        expect(judge.prompt).toContain('judge-decide-2-regression-1.json');
        expect(judge.prompt).toContain('judge-report-input-2-regression-1.json');
        expect(judge.prompt).toContain('judge-state-2-regression-1.json');
        // the gate copy is read from the exit's own un-suffixed report input, never from a round's
        expect(judge.prompt).toMatch(/Read [^\s]*judge-report-input-2\.json \(the exit's report input\)/);
        expect(judge.prompt).toMatch(/"cap":2,/);
        expect(judge.prompt).toMatch(/"awaitingRegression":\[\]/);
        // the exit's Judge ran the gate; neither regression prompt carries its command
        expect(labelsOf(agent, 'judge')[1].prompt).toContain('make e2e');
        for (const round of [1, 2]) {
          const calls = regressionCalls(agent, round);
          expect(calls.exercise.prompt).not.toContain('make e2e');
          expect(calls.judge.prompt).not.toContain('make e2e');
        }
        // the old names are gone
        expect(`${exercise.prompt}${judge.prompt}`).not.toMatch(/-confirm|confirmation pass|CONFIRMATION/i);
        // a member still failing: not satisfied
        expect(result.outcome).toBe('stuck');
        expect(result.finalRun).toEqual(passRun); // the exit's gate result, carried
        expect(result.criteria.find((c) => c.id === 'FS-3')).toMatchObject({ status: 'not_met' });
        expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'met' });
      });

      it('AC 7: an exit-stuck from the regression pass names the members still failing and the real cap, not the exit iteration', async () => {
        const { result, agent } = await run(
          [seeds(), exitSatisfied(), exitWith('exit-stuck', [met('FS-2'), bd('FS-3', 'a')], { gaps: ['FS-3'], reason: 'iteration cap (2) reached with 1 gap(s) still open' })],
          { debug: debugOk(['FS-1', 'FS-4']), args: four }
        );
        expect(result.reason).toContain('FS-3');
        expect(result.reason).toContain('of 5');
        expect(result.reason).not.toMatch(/iteration cap \(2\)/);
        // the Judge-written report input is brought in step, with the exercised history marking both rounds
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        expect(syncedState(sync[0]).exercised).toContainEqual({ iteration: 2, ids: ['FS-2', 'FS-3'], regression: 1 });
        expect(syncedState(sync[0]).exercised).toContainEqual({ iteration: 2, ids: ['FS-3'], regression: 2 });
        expect(sync[0].prompt).toMatch(/top-level "outcome" to "stuck" and its top-level "reason" to "[^"]*FS-3/);
        // the LATEST round's own report input is the one patched and re-rendered, not the exit's
        expect(sync[0].prompt).toContain('judge-report-input-2-regression-2.json');
        expect(sync[0].prompt).not.toContain('judge-report-input-2.json');
      });

      it('a false "iteration cap" in a non-stuck regression result is corrected in place when the run had budget left', async () => {
        const { result, agent } = await run(
          [seeds(), exitSatisfied(), exitWith('exit-insufficient-coverage', [met('FS-2'), met('FS-3')], { gaps: [], reason: 'proven ratio 4/4 ... iteration cap (2) reached' })],
          { debug: debugOk(['FS-1', 'FS-4']), args: four }
        );
        expect(result.reason).not.toContain('iteration cap (2) reached');
        expect(result.reason).toContain('the run ended at iteration 2 of 5');
        expect(labelsOf(agent, 'state-sync')[0].prompt).toMatch(/top-level "reason" to "[^"]*the run ended at iteration 2 of 5/);
      });

      it('all members passing keeps the exit satisfied, the awaiting markers gone and the proof stamped with the exit iteration and the round', async () => {
        const { result, agent } = await run(
          [seeds(), exitSatisfied(), exitWith('exit-satisfied', [met('FS-2'), met('FS-3')], { gaps: [], finalRun: passRun })],
          { debug: debugOk(['FS-1', 'FS-4']), args: four }
        );
        expect(result.outcome).toBe('satisfied');
        expect(result.criteria.every((c) => c.status === 'met' && c.awaiting === undefined)).toBe(true);
        // O4: a re-proven criterion's entry carries the exit iteration and the round
        expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ provenAt: 2, regression: 1 });
        expect(result.criteria.find((c) => c.id === 'FS-1')).not.toHaveProperty('regression');
        // after a Debug pass the exit's one state write is made by the regression pass (D18b)
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        expect(syncedState(sync[0]).outcome).toBe('satisfied');
        expect(syncedState(sync[0]).criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'met', provenAt: 2, regression: 1 });
      });

      it('AC 8: exit-unbuilt and exit-setup-failure dispatch no regression pass', async () => {
        for (const action of ['exit-unbuilt', 'exit-setup-failure']) {
          const { agent } = await run([seeds(), exitWith(action, [met('FS-1'), met('FS-4')], { gaps: ['FS-2'], unbuilt: action === 'exit-unbuilt' ? ['FS-2'] : [] })], {
            debug: debugOk(['FS-1', 'FS-4']),
            args: four,
          });
          expect(labelsOf(agent, 'exercise')).toHaveLength(2);
          expect(labelsOf(agent, 'judge')).toHaveLength(2);
          // the exit still gets its one state write, since a Debug pass ran (D18b)
          expect(labelsOf(agent, 'state-sync')).toHaveLength(1);
        }
      });

      it('no member awaiting and no Debug pass means no regression pass and no state write', async () => {
        const { agent } = await run([exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })], { args: { criteria: defs(2), cap: 3 } });
        expect(labelsOf(agent, 'exercise')).toHaveLength(1);
        expect(labelsOf(agent, 'judge')).toHaveLength(1);
        expect(labelsOf(agent, 'state-sync')).toHaveLength(0);
      });
    });
  });

  describe('regression pass, round 1 (regression pass D2-D11, D18)', () => {
    const { coverMatcher } = require('../lib/custody');
    const evidence = '.trd-state/example/evidence';
    const defs = (n) => Array.from({ length: n }, (_, i) => criterion(`FS-${i + 1}`));
    const stateOf = (call) => JSON.parse(call.prompt.match(/exactly as given, to [^\n]*:\n(\{.*\})\n/)[1]);
    const regressionExercises = (agent) => labelsOf(agent, 'exercise').filter((c) => /regression pass \d at the end/.test(c.prompt));
    const underJudgement = (prompt) => JSON.parse(prompt.match(/under judgement this iteration \(\d+ of \d+\):\n(\[.*\])/)[1]).map((c) => c.id);
    const settledIn = (prompt) => JSON.parse(prompt.match(/judgements only:\n(.*)/)[1]);
    const reasonsIn = (logs) => logs.join('\n').match(/regression pass round 1 re-checks ([^;\n]*)/);
    // An Exercise stub that captures every criterion into the evidence directory its own prompt names, so
    // a regression round's claims sit inside its folder.
    const freshClaims = (prompt) => {
      const dir = prompt.match(/\nEvidence directory: (\S+)/)[1];
      const list = JSON.parse(prompt.match(/\nCriteria:\n(\[.*\])\n/)[1]);
      return exercisePlanClaims(list.map((c) => ({ criterion: c.id, artifact: `${dir}/${c.id}.txt` })));
    };
    // FS-1 and FS-2 are proven at iteration 1 while FS-3 is not. Debug fixes FS-3 (reporting `files`), and
    // FS-3 passes at iteration 2. FS-1 covers src/a.js and FS-2 covers src/z.js.
    const baseArgs3 = (over = {}) => ({
      criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')],
      cap: 4,
      criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/z.js'] },
      ...over,
    });
    const debugReporting = (patch) => (prompt) => {
      const { filesChanged: _dropped, ...rest } = debugOk(['FS-3'])(prompt);
      return typeof patch === 'function' ? patch(rest) : { ...rest, ...patch };
    };
    const reproven = exitWith('exit-satisfied', [met('FS-1')], { gaps: [] });
    const journey = (roundJudge = reproven, { files = ['src/a.js'], args = {}, debug, extra, exercise = freshClaims, middle } = {}) =>
      run([remediate([met('FS-1'), met('FS-2'), bd('FS-3', 'k')]), middle || exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), roundJudge], {
        debug: debug || debugReporting({ filesChanged: files }),
        args: baseArgs3(args),
        extra,
        exercise,
      });

    it('O3: a met criterion whose covered file Debug changed is re-checked; ruled not_met there it ends not_met in the result and the synced state', async () => {
      const { agent, result, logs } = await journey(exitWith('exit-stuck', [bd('FS-1', 'regressed')], { gaps: ['FS-1'] }));
      const exercises = regressionExercises(agent);
      // round 1, then (the Judge still rules FS-1 failing) the repair round's round 2
      expect(exercises).toHaveLength(2);
      expect(exercisedIdsOf(exercises[0])).toEqual(['FS-1']);
      expect(underJudgement(labelsOf(agent, 'judge')[2].prompt)).toEqual(['FS-1']);
      expect(reasonsIn(logs)[1]).toBe('FS-1 (covers-changed)');
      expect(result.outcome).toBe('stuck');
      expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_met', kind: 'build-defect', causeKey: 'regressed', regression: 2 });
      const sync = labelsOf(agent, 'state-sync');
      expect(sync).toHaveLength(1);
      expect(stateOf(sync[0]).criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_met', causeKey: 'regressed' });
      expect(stateOf(sync[0]).exercised).toContainEqual({ iteration: 2, ids: ['FS-1'], regression: 1 });
    });

    it('FS-1: the regression pass also runs when the Judge exits at the iteration cap iteration', async () => {
      // cap 2: iteration 2 is the last iteration, so the Judge's exit-stuck there is an exit AT the cap.
      const { agent, result, logs } = await journey(reproven, {
        args: { cap: 2 },
        middle: exitWith('exit-stuck', [bd('FS-3', 'k')], { gaps: ['FS-3'] }),
        files: ['src/a.js'],
      });
      expect(labelsOf(agent, 'judge')).toHaveLength(3);
      const exercises = regressionExercises(agent);
      expect(exercisedIdsOf(exercises[0])).toEqual(['FS-1']);
      expect(reasonsIn(logs)[1]).toBe('FS-1 (covers-changed)');
      expect(result.regression.rounds[0]).toMatchObject({ round: 1, iteration: 2 });
    });

    it('O2: a met criterion whose covers no Debug record touches is in no round prompt and keeps its artifact and provenAt', async () => {
      const { agent, result, logs } = await journey();
      const [exercise] = regressionExercises(agent);
      expect(exercisedIdsOf(exercise)).toEqual(['FS-1']);
      const judge = labelsOf(agent, 'judge')[2].prompt;
      expect(settledIn(judge).map((e) => e.id)).toEqual(['FS-2', 'FS-3']);
      expect(settledIn(judge).find((e) => e.id === 'FS-2')).toMatchObject({ artifact: 'FS-2.txt', provenAt: 1 });
      expect(result.criteria.find((c) => c.id === 'FS-2')).toMatchObject({ status: 'met', artifact: 'FS-2.txt', provenAt: 1 });
      expect(result.criteria.find((c) => c.id === 'FS-2')).not.toHaveProperty('regression');
      expect(logs.join('\n')).toMatch(/not re-walked: FS-2, FS-3/);
    });

    it('O4: a re-proven criterion is settled again with provenAt = the exit iteration and regression: 1', async () => {
      const { result, agent } = await journey();
      expect(result.outcome).toBe('satisfied');
      expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'met', provenAt: 2, regression: 1 });
      expect(stateOf(labelsOf(agent, 'state-sync')[0]).criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'met', provenAt: 2, regression: 1 });
    });

    it('O1c: a met criterion with no covers entry is re-checked when a Debug pass changed any file, and not when every pass returned []', async () => {
      const changed = await journey(reproven, { args: { criterionCovers: {} }, files: ['src/x.js'] });
      expect(reasonsIn(changed.logs)[1]).toBe('FS-1 (no-covers), FS-2 (no-covers)');
      expect(exercisedIdsOf(regressionExercises(changed.agent)[0])).toEqual(['FS-1', 'FS-2']);

      const nothing = await journey(reproven, { args: { criterionCovers: {} }, files: [] });
      expect(regressionExercises(nothing.agent)).toHaveLength(0);
      expect(nothing.logs.join('\n')).toMatch(/regression pass has nothing to re-check/);
      expect(labelsOf(nothing.agent, 'judge')).toHaveLength(2);
    });

    it('a changed path under the state folder is dropped by the script, so it puts no no-covers criterion in scope', async () => {
      const { agent, logs } = await journey(reproven, { args: { criterionCovers: {} }, files: ['.trd-state/example/dispatch.jsonl', './.trd-state/example/judge-x.json'] });
      expect(regressionExercises(agent)).toHaveLength(0);
      expect(logs.join('\n')).toMatch(/regression pass has nothing to re-check/);
      expect(logs.join('\n')).not.toMatch(/changed files no criterion covers/);
    });

    it('an empty covers list counts as no covers record', async () => {
      const { logs } = await journey(reproven, { args: { criterionCovers: { 'FS-1': [], 'FS-2': [] } }, files: ['src/x.js'] });
      expect(reasonsIn(logs)[1]).toBe('FS-1 (no-covers), FS-2 (no-covers)');
    });

    it.each([
      ['a Debug pass that returned nothing', () => undefined],
      ['no filesChanged at all', debugReporting({})],
      ['filesChanged: null', debugReporting({ filesChanged: null })],
      ['a filesChanged that is not an array', debugReporting({ filesChanged: 'src/a.js' })],
      ['a non-string in the list', debugReporting({ filesChanged: ['src/a.js', 7] })],
      ['an absolute path', debugReporting({ filesChanged: ['/repo/src/a.js'] })],
      ['a path climbing out with ..', debugReporting({ filesChanged: ['../outside.js'] })],
      ['a path git quoted', debugReporting({ filesChanged: ['"src/caf\\303\\251.js"'] })],
    ])('changes-unknown: %s puts every met proven at or before it in scope', async (_label, debug) => {
      const { agent, logs } = await journey(reproven, { debug });
      expect(reasonsIn(logs)[1]).toBe('FS-1 (changes-unknown), FS-2 (changes-unknown)');
      expect(exercisedIdsOf(regressionExercises(agent)[0])).toEqual(['FS-1', 'FS-2']);
      if (_label !== 'a Debug pass that returned nothing') expect(logs.join('\n')).toMatch(/Debug returned no usable filesChanged/);
    });

    it('a leading ./ on a changed path is stripped before it is matched', async () => {
      const { logs } = await journey(reproven, { files: ['./src/a.js'] });
      expect(reasonsIn(logs)[1]).toBe('FS-1 (covers-changed)');
    });

    it('D5: a criterion proven at iteration 2 is out of scope for a change recorded at iteration 1, with covers or without', async () => {
      const gap = { id: 'FS-4', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', cause: 'evidence-missing', files: [] };
      const { agent, logs } = await run(
        [
          remediate([met('FS-1'), met('FS-2'), bd('FS-3', 'k'), gap]),
          exitWith('exit-satisfied', [met('FS-3'), met('FS-4')], { gaps: [] }),
          exitWith('exit-satisfied', [met('FS-1')], { gaps: [] }),
        ],
        {
          debug: debugReporting({ filesChanged: ['src/a.js'] }),
          args: { ...baseArgs3({ criteria: defs(4), criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/z.js'], 'FS-3': ['src/a.js'] } }) },
          exercise: freshClaims,
        }
      );
      // FS-3 covers the changed file but was proven AFTER the change; FS-4 has no covers and was too.
      expect(exercisedIdsOf(regressionExercises(agent)[0])).toEqual(['FS-1']);
      expect(logs.join('\n')).toMatch(/not re-walked: FS-2, FS-3, FS-4/);
    });

    it('O1b: members awaiting a closed cause are in round 1 as cause-member, and no pass runs when nothing changed and nothing awaits', async () => {
      const seeded = await run(
        [remediate([bd('FS-1', 'a'), bd('FS-2', 'a'), bd('FS-3', 'a'), bd('FS-4', 'b')]), exitWith('exit-satisfied', [met('FS-1'), met('FS-4')], { gaps: [] }), exitWith('exit-satisfied', [met('FS-2'), met('FS-3')], { gaps: [] })],
        { debug: debugOk(['FS-1', 'FS-4']), args: { criteria: defs(4), cap: 5 }, exercise: freshClaims }
      );
      expect(reasonsIn(seeded.logs)[1]).toBe('FS-2 (cause-member), FS-3 (cause-member)');

      const quiet = await run([exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })], { args: { criteria: defs(2), cap: 3 } });
      expect(labelsOf(quiet.agent, 'exercise')).toHaveLength(1);
      expect(quiet.logs.join('\n')).not.toMatch(/regression pass/);
    });

    describe('D8: only a fresh capture counts', () => {
      const noCovers = { criterionCovers: {}, criteria: defs(4) };
      // FS-1, FS-2 and FS-4 are proven at iteration 1 with FS-3 failing; Debug changes a file nothing covers.
      const regressionClaims = (claimFor) => (prompt) => {
        if (!/regression pass \d at the end/.test(prompt)) return freshClaims(prompt);
        const list = JSON.parse(prompt.match(/\nCriteria:\n(\[.*\])\n/)[1]);
        return exercisePlanClaims(list.map((c) => ({ criterion: c.id, artifact: claimFor(c.id) })));
      };
      const fourJourney = (claimFor, over = {}) =>
        run(
          [remediate([met('FS-1'), met('FS-2'), bd('FS-3', 'k'), met('FS-4')]), exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), exitWith('exit-satisfied', [met('FS-1'), met('FS-2'), met('FS-4')], { gaps: [] })],
          { debug: debugReporting({ filesChanged: ['src/x.js'] }), args: { ...noCovers, cap: 4, ...over }, exercise: regressionClaims(claimFor) }
        );
      const claimsIn = (prompt) => JSON.parse(prompt.match(/This iteration's Exercise claims:\n(\[.*\])/)[1]);

      it('names the round folder in the evidence-directory line and asks for fresh captures', async () => {
        const { agent } = await fourJourney((id) => `${evidence}/regression-1/${id}.txt`);
        const prompt = regressionExercises(agent)[0].prompt;
        expect(prompt).toContain(`Evidence directory: ${evidence}/regression-1 (`);
        expect(prompt).toMatch(/<evidenceDir>, it means \.trd-state\/example\/evidence\/regression-1/);
        expect(prompt).toMatch(/predates the fixes and does not count/);
        expect(prompt).toContain(`starting "${evidence}/regression-1/"`);
        // the loop's own Exercise prompts are untouched
        expect(labelsOf(agent, 'exercise')[0].prompt).toContain(`Evidence directory: ${evidence}\n`);
      });

      it('replaces a claim outside the round folder with a stand-in; keeps ./-prefixed and absolute-inside paths exactly as written', async () => {
        const claimFor = (id) =>
          ({
            'FS-1': `${evidence}/FS-1.txt`, // captured earlier in the run: outside the round folder
            'FS-2': `./${evidence}/regression-1/FS-2.png`,
            'FS-4': `/repo/${evidence}/regression-1/FS-4.png`,
          })[id];
        const { agent } = await fourJourney(claimFor);
        const claims = claimsIn(labelsOf(agent, 'judge')[2].prompt);
        expect(claims.find((c) => c.criterion === 'FS-1')).toEqual({ criterion: 'FS-1', artifact: null, reason: 'not captured in the regression pass', judgeOnly: false });
        expect(claims.find((c) => c.criterion === 'FS-2')).toMatchObject({ artifact: `./${evidence}/regression-1/FS-2.png` });
        expect(claims.find((c) => c.criterion === 'FS-4')).toMatchObject({ artifact: `/repo/${evidence}/regression-1/FS-4.png` });
      });

      it('an absolute path that does not contain the round folder is replaced', async () => {
        const { agent } = await fourJourney(() => `/repo/${evidence}/FS-1.txt`);
        for (const c of claimsIn(labelsOf(agent, 'judge')[2].prompt)) expect(c).toMatchObject({ artifact: null, reason: 'not captured in the regression pass' });
      });

      it('a claim with no artifact keeps its stated reason, and a judge-only claim is not filtered', async () => {
        const judgeOnly = (id) => (id === 'FS-1' ? { tier1: 'judge-only -- pixel comparison' } : {});
        const { agent } = await run(
          [remediate([met('FS-1'), met('FS-2'), bd('FS-3', 'k')]), exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), reproven],
          {
            debug: debugReporting({ filesChanged: ['src/x.js'] }),
            args: { criteria: [criterion('FS-1', judgeOnly('FS-1')), criterion('FS-2'), criterion('FS-3')], criterionCovers: {}, cap: 4 },
            exercise: (prompt) =>
              /regression pass \d at the end/.test(prompt)
                ? exercisePlanClaims([{ criterion: 'FS-1', artifact: 'old/FS-1.png' }, { criterion: 'FS-2', artifact: null, reason: 'the server would not start' }])
                : freshClaims(prompt),
          }
        );
        const claims = claimsIn(labelsOf(agent, 'judge')[2].prompt);
        expect(claims.find((c) => c.criterion === 'FS-1')).toMatchObject({ artifact: 'old/FS-1.png', judgeOnly: true });
        expect(claims.find((c) => c.criterion === 'FS-2')).toMatchObject({ artifact: null, reason: 'the server would not start' });
      });

      it('(16) a check-derived criterion with a captured artifact under <evidenceDir>/regression-1/<skill>/ reaches the Judge unchanged', async () => {
        const skill = 'verify-flow-as-built';
        const checks = { [skill]: 'Capture: walk the flow.\nPage: render it.' };
        const { agent } = await run(
          [remediate([met('FS-1'), met('FS-2'), bd('FS-3', 'k')]), exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), reproven],
          {
            debug: debugReporting({ filesChanged: ['src/x.js'] }),
            args: {
              criteria: [criterion('FS-1'), checkCriterion('FS-2', skill, { tier1: 'locator' }), criterion('FS-3')],
              criterionCovers: {},
              checks,
              pagesDir: '.trd-state/example/pages',
              cap: 4,
            },
            exercise: (prompt) =>
              /regression pass \d at the end/.test(prompt)
                ? exercisePlanClaims([{ criterion: 'FS-1', artifact: `${evidence}/regression-1/FS-1.txt` }, { criterion: 'FS-2', artifact: `${evidence}/regression-1/${skill}/FS-2.json`, locator: 'step 1' }])
                : freshClaims(prompt),
            extra: (prompt, opts) => (opts.label === 'render' ? { rendered: true, page: 'p.html', cards: 1 } : null),
          }
        );
        const exercise = regressionExercises(agent)[0].prompt;
        expect(exercise).toContain(`Evidence directory: ${evidence}/regression-1 (`);
        expect(exercise).toMatch(/CHECK `verify-flow-as-built`/);
        const claims = claimsIn(labelsOf(agent, 'judge')[2].prompt);
        expect(claims.find((c) => c.criterion === 'FS-2')).toMatchObject({ artifact: `${evidence}/regression-1/${skill}/FS-2.json`, locator: 'step 1', judgeOnly: false });
      });

      it('offers no live evidence in a regression round, even when Debug had not run before the resume', async () => {
        const live = [{ artifact: '/repo/.trd-state/example/evidence/live/T-1/home.txt', covers: [{ path: '/repo/src/home.js', sha256: 'abc' }] }];
        const { agent } = await fourJourney((id) => `${evidence}/regression-1/${id}.txt`, { liveEvidence: live });
        expect(regressionExercises(agent)[0].prompt).not.toMatch(/EVIDENCE ALREADY CAPTURED/);
      });
    });

    describe('D10: a capture the pass could not make is recorded, not looped', () => {
      const unchecked = exitWith('exit-satisfied', [{ id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', cause: 'evidence-missing', files: [] }], { gaps: ['FS-1'] });

      it('O6/(9)/(17): a round-1 evidence gap is settled regression-unchecked, not definition-problem, and is not re-exercised', async () => {
        const { agent, result } = await journey(unchecked);
        expect(regressionExercises(agent)).toHaveLength(1);
        expect(labelsOf(agent, 'judge')).toHaveLength(3);
        expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_met', kind: 'evidence-gap', settled: 'regression-unchecked', provenAt: 2, regression: 1 });
        expect(JSON.stringify(result.criteria)).not.toContain('definition-problem');
        // the Judge is told the id is not an open gap and not to capture it again
        expect(labelsOf(agent, 'judge')[2].prompt).toMatch(/recorded as unchecked, and it is NOT sent to Debug and NOT captured again/);
      });

      it('a regression-unchecked entry is not an open gap for the must-pass recheck', async () => {
        const { result, agent } = await journey(unchecked, { args: { mustPassIds: ['FS-1'] }, extra: (prompt, opts) => (opts.label === 'reconcile' ? { reconciled: true } : null) });
        expect(result.outcome).toBe('must-pass-unproven');
        expect(labelsOf(agent, 'reconcile')).toHaveLength(1);
      });

      it('D7: an in-scope id the Judge returned no entry for is never left met: it is recorded as an unchecked capture', async () => {
        const { result, logs } = await journey(exitWith('exit-satisfied', [], { gaps: [] }));
        expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({
          status: 'not_met',
          kind: 'evidence-gap',
          reason: 'the regression pass returned no ruling',
          settled: 'regression-unchecked',
          regression: 1,
        });
        expect(logs.join('\n')).toMatch(/the Judge returned no ruling for FS-1/);
      });

      it('a not-checkable result in a round is re-statused not_verifiable and settled', async () => {
        const { result } = await journey(exitWith('exit-satisfied', [{ id: 'FS-1', status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'no browser', cause: 'capability-absent', files: [] }], { gaps: [] }));
        expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_verifiable', kind: 'not-checkable-here', regression: 1 });
      });
    });

    describe('D4: the inline matcher agrees with custody.js coverMatcher', () => {
      const table = [
        ['src/lib', 'src/lib/x.js'],
        ['src/lib', 'src/lib'],
        ['src/lib', 'src/libx/y.js'],
        ['src/lib/', 'src/lib/deep/x.js'],
        ['src/lib//', 'src/lib/x.js'],
        ['src/a.js', 'src/a.js'],
        ['src/a.js', 'src/a.jsx'],
        ['src/a.js', 'other/src/a.js'],
        ['src/*.js', 'src/a.js'],
        ['src/*.js', 'src/deep/a.js'],
        ['src/**', 'src/deep/deeper/a.js'],
        ['src/**/a.js', 'src/a.js'],
        ['src/**/a.js', 'src/x/y/a.js'],
        ['**/a.js', 'x/y/a.js'],
        ['.claude/commands/{amend,sweep}.md', '.claude/commands/amend.md'],
        ['.claude/commands/{amend,sweep}.md', '.claude/commands/other.md'],
        ['src/?.js', 'src/a.js'],
        ['src/?.js', 'src/ab.js'],
        ['src/[ab].js', 'src/b.js'],
        ['src/[!ab].js', 'src/b.js'],
        ['docs/v1.0/*.md', 'docs/v1x0/a.md'],
      ];
      it.each(table)('cover %s, changed file %s', async (cover, file) => {
        const { logs } = await journey(reproven, { args: { criterionCovers: { 'FS-1': [cover], 'FS-2': ['unrelated/none.js'] } }, files: [file] });
        const inScope = /re-checks FS-1 \(covers-changed\)/.test(logs.join('\n'));
        expect(inScope).toBe(coverMatcher(cover)(file));
      });
    });

    describe('D3: args.criterionCovers is validated before any agent runs', () => {
      const attempt = (criterionCovers) =>
        runWorkflow(SOURCE, {
          agent: makeAgentStub((prompt, opts) => (opts.label === 'exercise' ? claimsFromPrompt(prompt) : opts.label === 'judge' ? satisfiedJudge() : null)),
          args: baseArgs({ criterionCovers }),
        });

      it('throws naming the id when a value is not an array of non-empty strings', async () => {
        await expect(attempt({ 'FS-1': 'src/a.js' })).rejects.toThrow('verify-functional: args.criterionCovers[FS-1] must be an array of non-empty path strings');
        await expect(attempt({ 'FS-2': ['src/a.js', ''] })).rejects.toThrow(/criterionCovers\[FS-2\]/);
        await expect(attempt({ 'FS-2': [7] })).rejects.toThrow(/criterionCovers\[FS-2\]/);
      });

      it('throws when it is not a plain object', async () => {
        for (const bad of ['src/a.js', ['FS-1'], 7, true]) await expect(attempt(bad)).rejects.toThrow(/args\.criterionCovers must be a plain object/);
      });

      it('accepts absent, null and {}; an id that is not one of the criteria is ignored, not an error', async () => {
        for (const ok of [undefined, null, {}, { 'NOT-A-CRITERION': ['src/a.js'] }]) await expect(attempt(ok)).resolves.toBeDefined();
      });

      it('an unknown id never enters the scope', async () => {
        const { logs } = await journey(reproven, { args: { criterionCovers: { 'NOT-A-CRITERION': ['src/a.js'], 'FS-1': ['src/none.js'], 'FS-2': ['src/z.js'] } }, files: ['src/a.js'] });
        expect(logs.join('\n')).toMatch(/changed files no criterion covers: src\/a\.js/);
        expect(logs.join('\n')).not.toMatch(/re-checks/);
      });
    });

    describe('D2: Debug measures what it changed', () => {
      it('the prompt asks for two tree ids from a temporary index and the diff between them, excluding the state and pages folders', async () => {
        const { agent } = await journey(reproven, { args: { pagesDir: '.trd-state/example/pages', checks: {}, } });
        const prompt = labelsOf(agent, 'debug')[0].prompt;
        expect(prompt).toContain('GIT_INDEX_FILE=<fresh temp path> git add -A');
        expect(prompt).toContain('GIT_INDEX_FILE=<that same path> git write-tree');
        expect(prompt).toMatch(/As your FIRST act/);
        expect(prompt).toMatch(/As your LAST act, after the refresh/);
        expect(prompt).toContain('git -c core.quotePath=false diff --no-renames --name-only <BEFORE> <AFTER>');
        expect(prompt).toContain('"filesChanged"');
        expect(prompt).toContain('".trd-state/example"');
        expect(prompt).toContain('".trd-state/example/pages"');
        expect(prompt).toMatch(/Return null if either git step fails/);
        // the temp index is a copy of the real one at a path that did not exist, and the excluded
        // folders are left out by pathspec, so an empty mktemp file or an embedded repo cannot fail it
        expect(prompt).toMatch(/mktemp -d/);
        expect(prompt).toContain('cp "$(git rev-parse --git-path index)" <fresh temp path>');
        expect(prompt).toContain("git add -A -- . ':(exclude).trd-state/example' ':(exclude).trd-state/example/pages'");
      });

      it('filesChanged is required and nullable in the schema', async () => {
        const { agent } = await journey();
        const schema = labelsOf(agent, 'debug')[0].opts.schema;
        expect(schema.required).toContain('filesChanged');
        expect(schema.properties.filesChanged).toEqual({ type: ['array', 'null'], items: { type: 'string' } });
        expect(schema.additionalProperties).toBe(false);
      });

      it('a dead Debug agent is recorded as unknown, so it widens the pass', async () => {
        const { logs } = await journey(reproven, { debug: () => undefined });
        expect(reasonsIn(logs)[1]).toBe('FS-1 (changes-unknown), FS-2 (changes-unknown)');
      });
    });

    describe('D18: an interruption', () => {
      const resumed = (iteration) => ({
        iteration,
        criteria: [
          { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, provenAt: 1 },
          { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, cause: null, provenAt: 2 },
        ],
        gapsClosed: iteration > 0 ? [1] : [],
      });
      const openOne = [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')];

      it('(18) a resume that continues a run (iteration >= 1) puts every resumed met in round 1 as changes-unknown', async () => {
        const { agent, logs } = await run([exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })], {
          args: { criteria: openOne, cap: 5, resume: resumed(2), criterionCovers: { 'FS-1': ['src/none.js'] } },
          exercise: freshClaims,
        });
        expect(reasonsIn(logs)[1]).toBe('FS-1 (changes-unknown), FS-2 (changes-unknown)');
        expect(exercisedIdsOf(regressionExercises(agent)[0])).toEqual(['FS-1', 'FS-2']);
        // iteration 3's own proof of FS-3 postdates the unknown pass
        expect(regressionExercises(agent)).toHaveLength(1);
      });

      it('(18) a fix-round snapshot (iteration 0) seeds nothing: no pass, no state write', async () => {
        const { agent, logs } = await run([exitWith('exit-satisfied', [met('FS-3')], { gaps: [] })], { args: { criteria: openOne, cap: 5, resume: resumed(0) }, exercise: freshClaims });
        expect(regressionExercises(agent)).toHaveLength(0);
        expect(labelsOf(agent, 'state-sync')).toHaveLength(0);
        expect(logs.join('\n')).not.toMatch(/regression pass/);
      });

      it('(20) a fix-round resume carrying a met with provenAt 2, or null, is in round 1 as covers-changed when this invocation\'s iteration-1 Debug changes a covered file', async () => {
        const snapshot = {
          iteration: 0,
          criteria: [
            { id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a.txt', reason: null, cause: null, provenAt: 2 },
            { id: 'FS-2', status: 'met', tier1: 'pass', artifact: 'b.txt', reason: null, cause: null, provenAt: null },
            { id: 'FS-4', status: 'met', tier1: 'pass', artifact: 'd.txt', reason: null, cause: null, provenAt: 1 },
          ],
          gapsClosed: [],
        };
        const { agent, logs } = await run(
          [remediate([bd('FS-3', 'k')]), exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })],
          {
            debug: debugReporting({ filesChanged: ['src/a.js'] }),
            args: { criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3'), criterion('FS-4')], cap: 4, resume: snapshot, criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/'], 'FS-4': ['src/z.js'] } },
            exercise: freshClaims,
          }
        );
        expect(reasonsIn(logs)[1]).toBe('FS-1 (covers-changed), FS-2 (covers-changed)');
        expect(exercisedIdsOf(regressionExercises(agent)[0])).toEqual(['FS-1', 'FS-2']);
        expect(logs.join('\n')).toMatch(/not re-walked: FS-3, FS-4|not re-walked: FS-4/);
      });

      it('(19) once a Debug pass has run, a Judge is told to write outcome null even on an exit, and the sync runs when the scope is empty', async () => {
        const { agent, result } = await journey(reproven, { files: [] });
        const judges = labelsOf(agent, 'judge');
        expect(judges[0].prompt).toMatch(/"outcome": <null when decide-next returned "remediate"; otherwise/);
        expect(judges[0].prompt).not.toMatch(/the workflow writes the final outcome itself/);
        expect(judges[1].prompt).toContain('"outcome": <null, on every action, an exit included: the workflow writes the final outcome itself>');
        expect(judges[1].prompt).toMatch(/records the real outcome itself, in a later write/);
        // empty scope: no round, but the exit's one state write still happens, with the real outcome
        expect(regressionExercises(agent)).toHaveLength(0);
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        expect(stateOf(sync[0]).outcome).toBe('satisfied');
        expect(result.outcome).toBe('satisfied');
      });

      it('(19) a resume that continues a run tells its first Judge to write outcome null', async () => {
        const { agent } = await run([exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), reproven], { args: { criteria: openOne, cap: 5, resume: resumed(2) }, exercise: freshClaims });
        expect(labelsOf(agent, 'judge')[0].prompt).toContain('the workflow writes the final outcome itself');
      });
    });

    describe('REGR-B005: the repair round, round 2 and the record (regression pass D9, D12, D13)', () => {
      const failing = (id = 'FS-1', key = 'regressed') => exitWith('exit-stuck', [bd(id, key)], { gaps: [id] });
      const fixed = (patch = {}) => (prompt) => ({
        results: causesIn(prompt).map((c) => ({ cause: c.cause, addressed: true, result: 'fixed' })),
        refresh: { ran: false, exitCode: null },
        filesChanged: ['src/a.js'],
        ...patch,
      });
      // The loop's own Debug (call 0) fixes FS-3 and changes src/a.js; the repair Debug (call 1) is `repair`.
      const twoDebugs = (repair) => {
        let n = 0;
        return (prompt) => (n++ === 0 ? debugReporting({ filesChanged: ['src/a.js'] })(prompt) : typeof repair === 'function' ? repair(prompt) : repair);
      };
      const repairJourney = (round1, round2, { repair = fixed(), args = {}, extra } = {}) =>
        run([remediate([met('FS-1'), met('FS-2'), bd('FS-3', 'k')]), exitWith('exit-satisfied', [met('FS-3')], { gaps: [] }), round1, round2], {
          debug: twoDebugs(repair),
          args: baseArgs3(args),
          exercise: freshClaims,
          extra,
        });
      const proven1 = exitWith('exit-satisfied', [met('FS-1')], { gaps: [] });
      const judgeAt = (agent, n) => labelsOf(agent, 'judge')[n];

      it('(1) one app-debugger whose gaps hold only the caught ids, then exactly one more Exercise and Judge', async () => {
        const { agent, result } = await repairJourney(failing(), proven1);
        const debugs = labelsOf(agent, 'debug');
        expect(debugs).toHaveLength(2);
        expect(debugs[1].opts).toMatchObject({ agentType: 'app-debugger', phase: 'Debug' });
        expect(causesIn(debugs[1].prompt)).toEqual([expect.objectContaining({ cause: 'regressed', members: [expect.objectContaining({ id: 'FS-1', reason: 'r-FS-1' })] })]);
        expect(causesIn(debugs[1].prompt)[0].representative).toMatchObject({ id: 'FS-1', reason: 'r-FS-1' });
        expect(regressionExercises(agent)).toHaveLength(2);
        expect(labelsOf(agent, 'judge')).toHaveLength(4);
        expect(judgeAt(agent, 3).prompt).toMatch(/REGRESSION pass 2 at the end of iteration 2/);
        expect(judgeAt(agent, 3).prompt).toContain('judge-report-input-2-regression-2.json');
        expect(judgeAt(agent, 3).prompt).toMatch(/"cap":2,/);
        // the repair is a debug attempt like any other
        expect(result.debugAttempts).toHaveLength(2);
        expect(result.debugAttempts[1]).toMatchObject({ iteration: 2, gaps: ['FS-1'] });
        expect(result.outcome).toBe('satisfied');
        expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'met', provenAt: 2, regression: 2 });
      });

      it('(1) a cause round 1 opened and round 2 re-proved is recorded closed, not dropped from the state', async () => {
        const { agent } = await repairJourney(failing(), proven1);
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        const state = JSON.parse(sync[0].prompt.match(/exactly as given, to [^\n]*:\n(\{.*\})\n/)[1]);
        expect(state.causes).toContainEqual(expect.objectContaining({ key: 'regressed', status: 'closed', closedAt: 2, members: ['FS-1'] }));
      });

      it('(1) O5: a round-2 failure dispatches no further Debug, Exercise or Judge', async () => {
        const { agent, result } = await repairJourney(failing(), failing());
        expect(labelsOf(agent, 'debug')).toHaveLength(2);
        expect(regressionExercises(agent)).toHaveLength(2);
        expect(labelsOf(agent, 'judge')).toHaveLength(4);
        expect(result.outcome).toBe('stuck');
        expect(result.reason).toContain('FS-1');
        expect(result.reason).toContain('of 4');
        expect(result.criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'not_met', regression: 2 });
      });

      it('(2) round 2 is scoped by the repair Debug\'s files plus every id sent; a met untouched by it is not re-walked', async () => {
        const { agent, logs } = await repairJourney(failing(), proven1);
        const [, second] = regressionExercises(agent);
        // FS-1 was sent; FS-3 has no covers and a file changed after its proof; FS-2 covers src/z.js only
        expect(exercisedIdsOf(second)).toEqual(['FS-1', 'FS-3']);
        expect(logs.join('\n')).toMatch(/round 2 re-checks FS-1 \(sent-to-debug\), FS-3 \(no-covers\); not re-walked: FS-2/);
        const none = await repairJourney(failing(), proven1, { repair: fixed({ filesChanged: [] }) });
        expect(exercisedIdsOf(regressionExercises(none.agent)[1])).toEqual(['FS-1']);
      });

      it('(3) a dead repair Debug puts every settled met in round 2\'s scope', async () => {
        const { agent, result } = await repairJourney(failing(), proven1, { repair: () => undefined });
        expect(exercisedIdsOf(regressionExercises(agent)[1])).toEqual(['FS-1', 'FS-2', 'FS-3']);
        expect(result.regression.rounds[1].scope).toEqual([
          { id: 'FS-1', reason: 'sent-to-debug' },
          { id: 'FS-2', reason: 'changes-unknown' },
          { id: 'FS-3', reason: 'changes-unknown' },
        ]);
        expect(result.regression.rounds[0].debug).toEqual({ causes: ['regressed'], filesChanged: null });
        expect(result.debugAttempts[1].result).toBe('agent returned nothing');
      });

      it('(4) O6: an evidence gap or a not-checkable ruling in round 1 is not sent to the repair or to round 2', async () => {
        const gapOnly = exitWith('exit-satisfied', [{ id: 'FS-1', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', cause: 'evidence-missing', files: [] }], { gaps: ['FS-1'] });
        const a = await repairJourney(gapOnly, proven1);
        expect(labelsOf(a.agent, 'debug')).toHaveLength(1);
        expect(regressionExercises(a.agent)).toHaveLength(1);
        expect(a.result.regression.rounds).toHaveLength(1);
        expect(a.result.regression.rounds[0].caught).toEqual([]);

        const notCheckable = exitWith('exit-satisfied', [{ id: 'FS-1', status: 'not_verifiable', tier1: 'fail', artifact: null, reason: 'no browser', cause: 'capability-absent', files: [] }], { gaps: [] });
        const b = await repairJourney(notCheckable, proven1);
        expect(labelsOf(b.agent, 'debug')).toHaveLength(1);
        expect(regressionExercises(b.agent)).toHaveLength(1);

        // mixed: FS-1 a build defect, FS-2 an evidence gap -- the repair and round 2 hold FS-1 only
        const mixed = exitWith('exit-stuck', [bd('FS-1', 'regressed'), { id: 'FS-2', status: 'not_met', tier1: 'fail', artifact: null, reason: 'no artifact', cause: 'evidence-missing', files: [] }], { gaps: ['FS-1', 'FS-2'] });
        const c = await repairJourney(mixed, proven1, { args: { criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/a.js'], 'FS-3': ['src/z.js'] } } });
        expect(causesIn(labelsOf(c.agent, 'debug')[1].prompt).flatMap((g) => g.members.map((m) => m.id))).toEqual(['FS-1']);
        expect(exercisedIdsOf(regressionExercises(c.agent)[1])).toEqual(['FS-1']);
        expect(c.result.regression.rounds[0].caught).toEqual(['FS-1']);
        expect(c.result.criteria.find((x) => x.id === 'FS-2')).toMatchObject({ settled: 'regression-unchecked' });
      });

      it('(5) O8: the sync prompt and the result carry the same record, and the state file holds it', async () => {
        const { agent, result } = await repairJourney(failing(), proven1);
        const sync = labelsOf(agent, 'state-sync');
        expect(sync).toHaveLength(1);
        expect(result.regression).toEqual({
          rounds: [
            { round: 1, iteration: 2, scope: [{ id: 'FS-1', reason: 'covers-changed', files: ['src/a.js'] }], caught: ['FS-1'], debug: { causes: ['regressed'], filesChanged: ['src/a.js'] } },
            { round: 2, iteration: 2, scope: [{ id: 'FS-1', reason: 'sent-to-debug' }, { id: 'FS-3', reason: 'no-covers' }], caught: [] },
          ],
          notRewalked: ['FS-2'],
          unclaimedChanges: [],
          gateBeforeEdits: false,
        });
        expect(stateOf(sync[0]).regression).toEqual(result.regression);
        // the report input is patched with the same record, and the per-entry marker is in its patch list
        expect(sync[0].prompt).toContain(`Set the file's top-level "regression" to this object`);
        expect(sync[0].prompt).toContain(JSON.stringify(result.regression));
        expect(sync[0].prompt).toMatch(/"awaiting" and "regression" to the values given/);
        expect(sync[0].prompt).toMatch(/\{"id":"FS-1","status":"met","reason":null,"regression":2\}/);
        expect(stateOf(sync[0]).criteria.find((c) => c.id === 'FS-1')).toMatchObject({ status: 'met', provenAt: 2, regression: 2 });
      });

      it('(5) unclaimedChanges lists a changed file no criterion covers, from both rounds', async () => {
        const { result } = await repairJourney(failing(), proven1, { repair: fixed({ filesChanged: ['src/a.js', 'docs/notes.md'] }) });
        expect(result.regression.unclaimedChanges).toEqual(['docs/notes.md']);
      });

      it('(5) a run with no pass carries regression: null and dispatches no sync for it', async () => {
        const { agent, result } = await run([exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })], { args: { criteria: defs(2), cap: 3 } });
        expect(result.regression).toBeNull();
        expect(labelsOf(agent, 'state-sync')).toHaveLength(0);
        // a pass whose scope is empty is no pass either, though the exit's state write still happens
        const empty = await journey(reproven, { files: [] });
        expect(empty.result.regression).toBeNull();
        expect(stateOf(labelsOf(empty.agent, 'state-sync')[0])).not.toHaveProperty('regression');
        // nor does an exit that runs no pass
        const unbuilt = await run([exitWith('exit-unbuilt', [met('FS-1')], { gaps: ['FS-2'], unbuilt: ['FS-2'] })], { args: { criteria: defs(2), cap: 3 } });
        expect(unbuilt.result.regression).toBeNull();
      });

      it('(6) O7: gateBeforeEdits is true only when a gate command is declared and the repair round ran; no regression prompt carries the command', async () => {
        const gated = await repairJourney(failing(), proven1, { args: { fullRunCommand: 'make e2e' } });
        expect(gated.result.regression.gateBeforeEdits).toBe(true);
        for (const call of [...regressionExercises(gated.agent), judgeAt(gated.agent, 2), judgeAt(gated.agent, 3)]) expect(call.prompt).not.toContain('make e2e');
        // gate declared, no repair round: false
        const noRepair = await journey(reproven, { args: { fullRunCommand: 'make e2e' } });
        expect(noRepair.result.regression.gateBeforeEdits).toBe(false);
        // repair round, no gate declared: false
        const noGate = await repairJourney(failing(), proven1);
        expect(noGate.result.regression.gateBeforeEdits).toBe(false);
      });

      it('(7) exercised holds regression: 1 and regression: 2 entries at the exit iteration', async () => {
        const { agent } = await repairJourney(failing(), proven1);
        const { exercised } = stateOf(labelsOf(agent, 'state-sync')[0]);
        expect(exercised).toContainEqual({ iteration: 2, ids: ['FS-1'], regression: 1 });
        expect(exercised).toContainEqual({ iteration: 2, ids: ['FS-1', 'FS-3'], regression: 2 });
      });

      it('(9) a repair Debug whose refresh exited 1 tells round 2\'s Judge refreshFailed, and a setup-failure there is the final action', async () => {
        const { agent, result } = await repairJourney(failing(), exitWith('exit-setup-failure', [], { gaps: [], reason: 'the last Debug pass\'s refresh failed' }), {
          repair: fixed({ refresh: { ran: true, exitCode: 1 } }),
        });
        expect(judgeAt(agent, 2).prompt).toContain('"refreshFailed":false');
        expect(judgeAt(agent, 3).prompt).toContain('"refreshFailed":true');
        expect(labelsOf(agent, 'judge')).toHaveLength(4);
        expect(result.outcome).toBe('setup-failure');
        expect(result.setup.problems).toEqual([expect.objectContaining({ problem: expect.stringContaining('refresh failed') })]);
      });

      it('no repair when round 1\'s action is an unbuilt or setup-failure exit, even with a caught id', async () => {
        for (const action of ['exit-unbuilt', 'exit-setup-failure']) {
          const { agent, result } = await repairJourney(exitWith(action, [bd('FS-1', 'regressed')], { gaps: ['FS-1'], unbuilt: action === 'exit-unbuilt' ? ['FS-1'] : [] }), proven1);
          expect(labelsOf(agent, 'debug')).toHaveLength(1);
          expect(result.regression.rounds).toHaveLength(1);
          expect(result.regression.rounds[0]).not.toHaveProperty('debug');
        }
      });

      it('the repair Debug records a change record flagged regression: 1 at the exit iteration, and rounds keep that iteration', async () => {
        const { result } = await repairJourney(failing(), proven1);
        expect(result.regression.rounds.map((r) => r.iteration)).toEqual([2, 2]);
        expect(result.iterations).toBe(2);
      });
    });

    it('a state-sync agent that returns nothing is logged, not thrown', async () => {
      const { result, logs } = await journey(reproven, { extra: () => null });
      expect(result.outcome).toBe('satisfied');
      expect(logs.join('\n')).toMatch(/state-sync agent returned nothing/);
    });
  });

  it('AC 9: no state-sync agent runs on an iteration where the script corrected nothing; a replaced causeKey runs one', async () => {
    const clean = await run([exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })], { args: { criteria: [criterion('FS-1'), criterion('FS-2')], cap: 3 } });
    expect(labelsOf(clean.agent, 'state-sync')).toHaveLength(0);
    // A missing key is the script's own default, not a correction: after a Debug pass the only write is
    // the exit's own (regression pass D18b), and it patches no kind or key.
    const afterDebug = await run([remediate([bd('FS-1', 'k'), bd('FS-2'), met('FS-3')]), exitWith('exit-satisfied', [met('FS-1'), met('FS-2')], { gaps: [] })], {
      debug: debugOk(['FS-1', 'FS-2']),
      args: { criteria: [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')], cap: 3 },
    });
    expect(labelsOf(afterDebug.agent, 'state-sync')).toHaveLength(1);
    expect(labelsOf(afterDebug.agent, 'state-sync')[0].prompt).not.toMatch(/"causeKey":"criterion:/);

    const replaced = await run([exitWith('exit-stuck', [bd('FS-1', 'UPPER'), bd('FS-2', 'fine')])], { args: { criteria: [criterion('FS-1'), criterion('FS-2')], cap: 3 } });
    expect(labelsOf(replaced.agent, 'state-sync')).toHaveLength(1);
  });

  it('schemas: the Judge accepts causeKey and awaiting, and the state sync is dispatched with the sonnet pin', async () => {
    const { agent } = await run([exitWith('exit-stuck', [bd('FS-1', 'UPPER')])], { args: { criteria: [criterion('FS-1')], cap: 3 } });
    const judgeSchema = labelsOf(agent, 'judge')[0].opts.schema;
    expect(judgeSchema.properties.criteria.items.properties.causeKey).toBeDefined();
    expect(judgeSchema.properties.criteria.items.properties.awaiting.enum).toEqual(['regression', null]);
    expect(unpinnedLabels(agent)).toEqual([]);
  });
});

// --------------------------------------------------------------------------- off-host proof (OHP-B002)

describe('verify-functional: off-host proof of a not-checkable must-pass criterion (accepted-gaps D6-D10)', () => {
  const GREEN = { id: 'FS-2', workflow: 'ci.yml', job: 'read-aloud', status: 'green', runId: 4242, url: 'https://github.com/o/r/actions/runs/4242', commit: 'abc123' };
  const metC = (id) => ({ id, status: 'met', tier1: 'pass', artifact: `${id}.txt`, reason: null, files: [] });
  const nc = (id = 'FS-2', extra = {}) => ({ id, status: 'not_verifiable', tier1: 'skipped', artifact: null, reason: 'the host cannot reach it', cause: 'capability-absent', files: [], ...extra });
  const bd = (id = 'FS-2', extra = {}) => ({ id, status: 'not_met', tier1: 'fail', artifact: null, reason: 'wrong output', cause: 'judged-failed', files: ['src/other.js'], ...extra });
  const judgeOf = (action, criteria, extra = {}) => ({
    action,
    reason: action === 'exit-must-pass-unproven' ? 'must-pass criteria not proven: FS-2' : 'x',
    criteria,
    gaps: criteria.filter((c) => c.status === 'not_met').map((c) => c.id),
    unbuilt: [],
    closed: [],
    notesUpdated: false,
    ...extra,
  });
  const unproven = (criteria) => judgeOf('exit-must-pass-unproven', criteria);
  const remediate = (criteria, ids = ['FS-1']) =>
    judgeOf('remediate', criteria, { debugGaps: ids.map((id) => ({ id, statement: `statement for ${id}`, reason: 'r', artifact: null, files: ['src/other.js'] })) });

  // judges: one entry per Judge call (the last repeats). debugFiles: what each Debug pass reports changing.
  async function run(judges, { args = {}, debugFiles = ['src/other.js'] } = {}) {
    const queue = [...judges];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }]);
      if (opts.label === 'judge') return queue.length > 1 ? queue.shift() : queue[0];
      if (opts.label === 'debug') return { results: [{ cause: 'criterion:FS-1', addressed: true, result: 'fixed' }], filesChanged: debugFiles };
      if (opts.label === 'state-sync') return { synced: true };
      if (opts.label === 'reconcile') return { reconciled: true };
      return null;
    });
    const out = await runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2'], offHostProofs: [GREEN], cap: 3, ...args }) });
    return { ...out, agent };
  }
  const fs2 = (result) => result.criteria.find((c) => c.id === 'FS-2');
  const syncs = (agent) => agent.calls.filter((c) => c.opts.label === 'state-sync');

  describe('validation (D6)', () => {
    it.each([
      ['not an array', 'x', /offHostProofs must be an array/],
      ['an id that is not must-pass', [{ ...GREEN, id: 'FS-1' }], /offHostProofs\[0\]\.id "FS-1" is not a must-pass criterion of this run/],
      ['an id that is not a criterion', [{ ...GREEN, id: 'NOPE' }], /is not a must-pass criterion/],
      ['an entry that is not an object', [null], /offHostProofs\[0\] must be an object/],
      ['an empty job', [{ ...GREEN, job: '' }], /\.job must be a non-empty string/],
      ['no workflow', [{ ...GREEN, workflow: undefined }], /\.workflow must be a non-empty string/],
      ['a status outside the six', [{ ...GREEN, status: 'running' }], /\.status must be one of/],
      ['a green entry with no url', [{ ...GREEN, url: null }], /green and needs a non-empty string url/],
      ['a green entry with no commit', [{ ...GREEN, commit: '' }], /green and needs a non-empty string commit/],
      ['a green entry with a non-integer runId', [{ ...GREEN, runId: 'x' }], /green and needs an integer runId/],
    ])('throws before any agent for %s', async (_name, offHostProofs, pattern) => {
      const agent = makeAgentStub(() => null);
      await expect(runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2'], offHostProofs }) })).rejects.toThrow(pattern);
      expect(agent.calls).toHaveLength(0);
    });

    it('accepts a red entry that carries no url, run or commit', async () => {
      const { result } = await run([unproven([metC('FS-1'), nc()])], { args: { offHostProofs: [{ id: 'FS-2', workflow: 'ci.yml', job: 'read-aloud', status: 'missing', runId: null, url: null, commit: 'abc123' }] } });
      expect(result.outcome).toBe('must-pass-unproven');
    });
  });

  describe('the settle (D7)', () => {
    it('a green job settles the criterion met: artifact is the run URL, proof names the run, the outcome is satisfied, and the state and report are synced with the proof', async () => {
      const { result, agent } = await run([unproven([metC('FS-1'), nc()])]);
      expect(result.outcome).toBe('satisfied');
      const c = fs2(result);
      expect(c).toMatchObject({
        status: 'met',
        tier1: null,
        artifact: GREEN.url,
        cause: 'capability-absent',
        proof: { kind: 'off-host', workflow: 'ci.yml', job: 'read-aloud', runId: 4242, url: GREEN.url, commit: 'abc123' },
      });
      expect(c).not.toHaveProperty('kind');
      expect(c).not.toHaveProperty('verificationDigest');
      expect(c.reason).toMatch(/ci\.yml#read-aloud/);
      expect(c.reason).toMatch(/4242/);
      expect(result.mustPass.unproven).toEqual([]);
      expect(result.mustPass.overridden).toBe(false);
      expect(result.coverage.proven).toBe(2);
      // D9: the Judge wrote the state without the proof, so the exit syncs it and the report outcome.
      expect(syncs(agent)).toHaveLength(1);
      expect(syncs(agent)[0].prompt).toContain('"proof":{"kind":"off-host"');
      expect(syncs(agent)[0].prompt).toMatch(/also set its "artifact" and "proof"/);
      expect(syncs(agent)[0].prompt).toMatch(/top-level "outcome" to "satisfied"/);
      expect(agent.calls.filter((x) => x.opts.label === 'reconcile')).toHaveLength(0);
    });

    it.each([
      ['red', 'red'],
      ['missing', 'missing'],
      ['pending', 'pending'],
      ['dirty', 'dirty'],
      ['error', 'error'],
    ])('a %s job leaves it not_verifiable and the run must-pass-unproven, the reason naming the job and status', async (status) => {
      const { result } = await run([unproven([metC('FS-1'), nc()])], { args: { offHostProofs: [{ ...GREEN, status, runId: null, url: null, reason: 'for a reason' }] } });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(fs2(result)).toMatchObject({ status: 'not_verifiable', kind: 'not-checkable-here' });
      expect(fs2(result)).not.toHaveProperty('proof');
      expect(fs2(result).reason).toContain('ci.yml#read-aloud');
      expect(fs2(result).reason).toContain(`is ${status}`);
      expect(fs2(result).reason).toContain('for a reason');
      expect(result.mustPass.unproven).toEqual([{ id: 'FS-2', status: 'not_verifiable' }]);
    });

    it('no declared proof leaves must-pass-unproven, and the reason is untouched', async () => {
      const { result } = await run([unproven([metC('FS-1'), nc()])], { args: { offHostProofs: [] } });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(fs2(result).reason).toBe('the host cannot reach it');
    });

    it('a must-pass build-defect with a green entry is never settled, and the run is not satisfied', async () => {
      const { result } = await run([judgeOf('exit-stuck', [metC('FS-1'), bd()])]);
      expect(result.outcome).not.toBe('satisfied');
      expect(fs2(result)).toMatchObject({ status: 'not_met' });
      expect(fs2(result)).not.toHaveProperty('proof');
    });

    it('a must-pass evidence-gap with a green entry is never settled, and the run is not satisfied', async () => {
      const { result } = await run([judgeOf('exit-stuck', [metC('FS-1'), bd('FS-2', { cause: 'evidence-missing' })])]);
      expect(result.outcome).not.toBe('satisfied');
      expect(fs2(result)).not.toHaveProperty('proof');
      expect(fs2(result).status).not.toBe('met');
    });

    it('a build defect in iteration 1, a Debug edit outside its covers, then ruled not checkable in iteration 2 stays unproven, and the run is not satisfied', async () => {
      const { result, logs } = await run([remediate([metC('FS-1'), bd()], ['FS-2']), unproven([nc()])], {
        args: { criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/read.js'] } },
        debugFiles: ['src/other.js'],
      });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(fs2(result).status).toBe('not_verifiable');
      expect(fs2(result)).not.toHaveProperty('proof');
      expect(fs2(result).reason).toMatch(/ruled build-defect earlier in this run/);
      expect(logs.join('\n')).not.toMatch(/settling it met/);
    });

    it('a resume snapshot holding it unbuilt, or not_met as a build defect, refuses it too', async () => {
      for (const held of [{ status: 'unbuilt', cause: 'not-built' }, { status: 'not_met', cause: 'judged-failed' }, { status: 'not_met', cause: null, kind: 'build-defect' }, { status: 'not_met', cause: null }]) {
        const resume = { iteration: 0, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, { id: 'FS-2', artifact: null, reason: 'r', provenAt: 1, ...held }], gapsClosed: [] };
        const { result } = await run([unproven([nc()])], { args: { resume } });
        expect(result.outcome).toBe('must-pass-unproven');
        expect(fs2(result)).not.toHaveProperty('proof');
        expect(fs2(result).reason).toMatch(/in the run it resumes/);
      }
    });

    it('a snapshot not_met whose cause is not checkable is not a refusal', async () => {
      const resume = { iteration: 0, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, { id: 'FS-2', status: 'not_met', cause: 'capability-absent', artifact: null, reason: 'r', provenAt: 1 }], gapsClosed: [] };
      const { result } = await run([unproven([nc()])], { args: { resume } });
      expect(result.outcome).toBe('satisfied');
    });

    describe('a Debug pass of this invocation (rule 3)', () => {
      // FS-2 stays open while Debug runs: the iteration-1 Judge rules only FS-1.
      const journey = (debugFiles, args = {}) =>
        run([remediate([bd('FS-1')]), unproven([metC('FS-1'), nc()])], { args: { criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/read.js'] }, ...args }, debugFiles });

      it('an edit outside its covers leaves the proof standing', async () => {
        const { result } = await journey(['src/other.js']);
        expect(result.outcome).toBe('satisfied');
        expect(fs2(result)).toMatchObject({ status: 'met', proof: { runId: 4242 } });
      });

      it('an edit touching its covers voids the proof', async () => {
        const { result } = await journey(['src/read.js']);
        expect(result.outcome).toBe('must-pass-unproven');
        expect(fs2(result)).toMatchObject({ status: 'not_verifiable' });
        expect(fs2(result)).not.toHaveProperty('proof');
        expect(fs2(result).reason).toMatch(/changed by Debug in this run/);
      });

      it('a files: null record from a Debug pass of this invocation voids the proof', async () => {
        const { result } = await journey(null);
        expect(result.outcome).toBe('must-pass-unproven');
        expect(fs2(result).reason).toMatch(/changed by Debug in this run/);
      });

      it('a criterion with no covers record is voided by any edit, and not by an empty one', async () => {
        const voided = await journey(['src/other.js'], { criterionCovers: {} });
        expect(voided.result.outcome).toBe('must-pass-unproven');
        const kept = await journey([], { criterionCovers: {} });
        expect(kept.result.outcome).toBe('satisfied');
      });
    });

    it('a resumed run (RESUME_ITERATION 1 or more) whose only files: null record is the synthetic resume record settles it', async () => {
      const resume = { iteration: 1, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, { id: 'FS-2', status: 'not_verifiable', cause: 'capability-absent', kind: 'not-checkable-here', verificationDigest: 'd', artifact: null, reason: 'r', provenAt: 1 }], gapsClosed: [] };
      // Seeded met at the resume; the synthetic record puts it in regression round 1, which rules it not checkable again.
      const { result, logs } = await run([judgeOf('exit-satisfied', []), unproven([metC('FS-1'), nc()])], { args: { resume, verificationDigest: 'd', cap: 3 } });
      expect(result.outcome).toBe('satisfied');
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { runId: 4242 } });
      expect(logs.join('\n')).toMatch(/regression pass round 1 re-checks/);
    });

    it('a persisting not-checkable must-pass entry in a fix-round snapshot (iteration 0) with a green entry is seeded met, and is not exercised', async () => {
      const resume = { iteration: 0, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, { id: 'FS-2', status: 'not_verifiable', cause: 'capability-absent', kind: 'not-checkable-here', verificationDigest: 'd', artifact: null, reason: 'r', provenAt: 1 }], gapsClosed: [] };
      const { result, agent } = await run([judgeOf('exit-satisfied', [])], { args: { resume, verificationDigest: 'd' } });
      expect(result.outcome).toBe('satisfied');
      expect(fs2(result)).toMatchObject({ status: 'met', artifact: GREEN.url, proof: { runId: 4242 } });
      expect(fs2(result)).not.toHaveProperty('kind');
      expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(0);
      expect(syncs(agent)).toHaveLength(1); // D9: an exit carrying a proof always syncs
    });

    it('a persisting entry with a red job stays settled not_verifiable, with the reason extended', async () => {
      const resume = { iteration: 0, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, { id: 'FS-2', status: 'not_verifiable', cause: 'capability-absent', kind: 'not-checkable-here', verificationDigest: 'd', artifact: null, reason: 'r', provenAt: 1 }], gapsClosed: [] };
      const { result } = await run([judgeOf('exit-satisfied', [])], { args: { resume, verificationDigest: 'd', offHostProofs: [{ ...GREEN, status: 'red', runId: null, url: null }] } });
      expect(fs2(result)).toMatchObject({ status: 'not_verifiable', kind: 'not-checkable-here' });
      expect(fs2(result).reason).toMatch(/^r; declared off-host proof ci\.yml#read-aloud is red/);
      expect(result.outcome).toBe('must-pass-unproven');
    });

    it('a proof the Judge returns is dropped, on a met entry and on a not-checkable one', async () => {
      const fake = { kind: 'off-host', workflow: 'x', job: 'y', runId: 1, url: 'u', commit: 'c' };
      const { result, logs } = await run([unproven([{ ...metC('FS-1'), proof: fake }, nc('FS-2', { proof: fake })])], { args: { offHostProofs: [] } });
      expect(result.criteria.find((c) => c.id === 'FS-1')).not.toHaveProperty('proof');
      expect(fs2(result)).not.toHaveProperty('proof');
      expect(logs.join('\n')).toMatch(/the Judge returned a proof for FS-1/);
    });
  });

  describe('the exit upgrade (D8)', () => {
    it('a Judge-returned exit-must-pass-unproven with an open not_met never becomes satisfied although the off-host criterion settles', async () => {
      const { result } = await run([judgeOf('exit-must-pass-unproven', [bd('FS-1'), nc()])]);
      expect(result.outcome).toBe('must-pass-unproven');
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { runId: 4242 } });
    });

    it('one below the coverage floor never becomes satisfied', async () => {
      const three = [criterion('FS-1'), criterion('FS-2'), criterion('FS-3')];
      const exercise = { criterion: 'FS-1', artifact: 'a' };
      const agent = makeAgentStub((prompt, opts) => {
        if (opts.label === 'exercise') return exercisePlanClaims([exercise, { criterion: 'FS-2', artifact: 'b' }, { criterion: 'FS-3', artifact: 'c' }]);
        if (opts.label === 'judge') return unproven([nc('FS-1', { cause: 'capability-absent' }), nc('FS-2'), metC('FS-3')]);
        if (opts.label === 'state-sync') return { synced: true };
        return null;
      });
      const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ criteria: three, mustPassIds: ['FS-2'], offHostProofs: [GREEN], coverageFloor: 0.9 }) });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(fs2(result).status).toBe('met');
    });

    it('an uncovered must-pass objective keeps it unproven', async () => {
      const { result } = await run([unproven([metC('FS-1'), nc()])], { args: { mustPassUncovered: [{ id: 'O9', text: 'nothing proves this' }] } });
      expect(result.outcome).toBe('must-pass-unproven');
    });

    it('an exit-insufficient-coverage is never upgraded', async () => {
      const { result } = await run([judgeOf('exit-insufficient-coverage', [metC('FS-1'), nc()])]);
      expect(result.outcome).toBe('insufficient-coverage');
    });

    it('a Judge exit-satisfied with the off-host criterion folded met stays satisfied', async () => {
      const { result } = await run([judgeOf('exit-satisfied', [metC('FS-1'), nc()])]);
      expect(result.outcome).toBe('satisfied');
    });

    it('a Debug pass first: the loop still upgrades and the regression pass owns the one state write, with the proof', async () => {
      const { result, agent } = await run([remediate([bd('FS-1')]), unproven([metC('FS-1'), nc()])], { args: { criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/read.js'] } } });
      expect(result.outcome).toBe('satisfied');
      expect(syncs(agent)).toHaveLength(1);
      expect(syncs(agent)[0].prompt).toContain('"proof":{"kind":"off-host"');
      expect(syncs(agent)[0].prompt).toMatch(/top-level "outcome" to "satisfied"/);
    });

    it('the regression pass upgrades the last round: a round that re-settles it lifts the exit it replaces', async () => {
      // Iteration 1 settles FS-2 from CI and FS-1 met; Debug in iteration 1 touches FS-1's covers (src/a.js),
      // so the regression pass re-checks FS-1 only; its Judge returns must-pass-unproven for FS-2's carried entry.
      const { result, agent } = await run(
        [remediate([bd('FS-1'), nc()]), judgeOf('exit-must-pass-unproven', [metC('FS-1')])],
        { args: { criterionCovers: { 'FS-1': ['src/a.js'], 'FS-2': ['src/read.js'] } }, debugFiles: ['src/a.js'] }
      );
      expect(result.outcome).toBe('satisfied');
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { runId: 4242 } });
      expect(syncs(agent).at(-1).prompt).toMatch(/top-level "outcome" to "satisfied"/);
    });
  });

  describe('a resumed run (D10)', () => {
    const proven = (commit) => ({ id: 'FS-2', status: 'met', tier1: null, artifact: GREEN.url, reason: 'proven off-host', cause: 'capability-absent', provenAt: 2, proof: { kind: 'off-host', workflow: 'ci.yml', job: 'read-aloud', runId: 4242, url: GREEN.url, commit } });
    const snapshot = (commit, iteration = 0) => ({ iteration, criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, proven(commit)], gapsClosed: [] });

    it('an off-host met on the same commit with a green entry is kept settled', async () => {
      const { result, agent } = await run([judgeOf('exit-satisfied', [])], { args: { resume: snapshot('abc123') } });
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { commit: 'abc123' } });
      expect(agent.calls.filter((c) => c.opts.label === 'exercise')).toHaveLength(0);
    });

    it('on a different commit it re-opens and is judged again', async () => {
      const prompts = [];
      const agent = makeAgentStub((prompt, opts) => {
        if (opts.label === 'exercise') return exercisePlanClaims([{ criterion: 'FS-2', artifact: 'b' }]);
        if (opts.label === 'judge') { prompts.push(prompt); return unproven([nc()]); }
        if (opts.label === 'state-sync') return { synced: true };
        return null;
      });
      const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2'], offHostProofs: [{ ...GREEN, commit: 'newer' }], resume: snapshot('abc123') }) });
      expect(openIdsFrom(prompts[0])).toEqual(['FS-2']);
      // Judged not checkable again, and the lookup is green on the new commit, so it settles on that one.
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { commit: 'newer' } });
    });

    it.each([
      ['no entry at all', []],
      ['a red entry', [{ ...GREEN, status: 'red', runId: null, url: null }]],
    ])('with %s it re-opens, and stays unproven when nothing proves it', async (_name, offHostProofs) => {
      const { result } = await run([unproven([nc()])], { args: { resume: snapshot('abc123'), offHostProofs } });
      expect(result.outcome).toBe('must-pass-unproven');
      expect(fs2(result)).toMatchObject({ status: 'not_verifiable' });
      expect(fs2(result)).not.toHaveProperty('proof');
    });

    it('the resume-cap return reports it not_verifiable with proof and artifact dropped, and counts from that list', async () => {
      const { result, agent } = await run([judgeOf('exit-satisfied', [])], { args: { resume: snapshot('abc123', 3), cap: 3, offHostProofs: [{ ...GREEN, commit: 'newer' }] } });
      expect(agent.calls).toHaveLength(0);
      expect(result.outcome).toBe('stuck');
      expect(fs2(result)).toMatchObject({ status: 'not_verifiable', kind: 'not-checkable-here', artifact: null });
      expect(fs2(result)).not.toHaveProperty('proof');
      expect(fs2(result).reason).toMatch(/abc123/);
      expect(result.coverage.proven).toBe(1);
      expect(result.mustPass.unproven).toEqual([{ id: 'FS-2', status: 'not_verifiable' }]);
    });

    it('the resume-cap return keeps a proof the lookup still shows green on the same commit', async () => {
      const { result } = await run([judgeOf('exit-satisfied', [])], { args: { resume: snapshot('abc123', 3), cap: 3 } });
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { commit: 'abc123' } });
      expect(result.mustPass.unproven).toEqual([]);
    });
  });

  describe('every return path carries the same criterion shape', () => {
    const seeded = {
      iteration: 0,
      criteria: [{ id: 'FS-1', status: 'met', tier1: 'pass', artifact: 'a', reason: null, provenAt: 1 }, { id: 'FS-2', status: 'not_verifiable', cause: 'capability-absent', kind: 'not-checkable-here', verificationDigest: 'd', artifact: null, reason: 'r', provenAt: 1 }],
      gapsClosed: [],
    };

    it('the setup-failure return', async () => {
      const agent = makeAgentStub(setupPlan({ setup: setupResult({ action: 'setup-failure', problems: [BROKEN], reason: 'broken' }), record: { recorded: true } }));
      const { result } = await runWorkflow(SOURCE, { agent, args: baseArgs({ mustPassIds: ['FS-2'], offHostProofs: [GREEN], resume: { ...seeded, criteria: [{ id: 'FS-1', status: 'not_met', cause: 'judged-failed', artifact: null, reason: 'r', provenAt: null }, seeded.criteria[1]] }, verificationDigest: 'd', setupTargets: [setupTarget({ criteria: ['FS-1'] })] }) });
      // FS-1 is the only open one; FS-2 settled from CI at the seeding keeps its proof here.
      expect(result.outcome).toBe('setup-failure');
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { runId: 4242 } });
    });

    it('the iteration-cap fall-through', async () => {
      const resume = { ...seeded, criteria: [{ id: 'FS-1', status: 'not_met', cause: 'judged-failed', artifact: null, reason: 'r', provenAt: null }, seeded.criteria[1]] };
      const { result } = await run([remediate([bd('FS-1')])], { args: { resume, verificationDigest: 'd', cap: 1 } });
      expect(result.outcome).toBe('stuck');
      expect(fs2(result)).toMatchObject({ status: 'met', proof: { runId: 4242 } });
    });

    it('the final result, with a red job, has none', async () => {
      const { result } = await run([unproven([metC('FS-1'), nc()])], { args: { offHostProofs: [{ ...GREEN, status: 'red', runId: null, url: null }] } });
      expect(result.criteria.every((c) => !('proof' in c))).toBe(true);
    });
  });
});

describe('verify-functional: mirror parity', () => {
  it('is byte-identical to the .claude/workflows/ copy', () => {
    const mirrorPath = path.join(__dirname, '..', '..', '..', '.claude', 'workflows', 'verify-functional.js');
    const mirrored = fs.readFileSync(mirrorPath, 'utf8');
    expect(mirrored).toBe(SOURCE);
  });
});
