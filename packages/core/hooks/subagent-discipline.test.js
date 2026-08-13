/**
 * subagent-discipline.js Test Suite
 *
 * Run with: npx jest subagent-discipline.test.js
 */

'use strict';

const {
  main,
  detectDeferredWorkClaim,
  detectSubagentAsyncEscape,
  MAX_CONSECUTIVE_BLOCKS,
  readBlockCount,
  writeBlockCount,
  resetBlockCount,
  stateFilePath,
} = require('./subagent-discipline');

const originalEnv = { ...process.env };

function uniqueAgentId(label) {
  return `jest-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

beforeEach(() => {
  delete process.env.ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE;
  delete process.env.ENSEMBLE_SUBAGENT_DISCIPLINE_DEBUG;
});

afterEach(() => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
});

describe('detectDeferredWorkClaim', () => {
  it('detects "I will wait for X to arrive"', () => {
    expect(detectDeferredWorkClaim('I will wait for the monitor notifications to arrive.')).toBeTruthy();
  });

  it('detects the observed "Waiting for background scenario completions" shape', () => {
    expect(detectDeferredWorkClaim('Waiting for background scenario completions to finish.')).toBeTruthy();
  });

  it('detects "I\'ll let you know when done" (shared FIRE_AND_FORGET pattern)', () => {
    expect(detectDeferredWorkClaim("I'll let you know when it's done.")).toBeTruthy();
  });

  it('does not flag plain completion reporting', () => {
    expect(detectDeferredWorkClaim('The fix is complete and all tests pass.')).toBeNull();
  });

  it('does not flag empty text', () => {
    expect(detectDeferredWorkClaim('')).toBeNull();
    expect(detectDeferredWorkClaim(undefined)).toBeNull();
  });

  it('bypasses on self-documentation markers', () => {
    expect(detectDeferredWorkClaim('This message discusses subagent-discipline.js and fire-and-forget claims.')).toBeNull();
  });

  it('does not flag meta-discussion of the pattern', () => {
    expect(detectDeferredWorkClaim('For example, phrases like "waiting for the monitor to arrive" would trigger a block.')).toBeNull();
  });
});

describe('detectSubagentAsyncEscape', () => {
  it('treats non-empty background_tasks as a legitimate escape valve', () => {
    expect(detectSubagentAsyncEscape({ background_tasks: [{ id: 'bg1' }] })).toMatch(/background_tasks/);
  });

  it('does NOT treat non-empty session_crons as an escape valve (ScheduleWakeup unavailable to subagents)', () => {
    expect(detectSubagentAsyncEscape({ background_tasks: [], session_crons: [{ id: 'cron1' }] })).toBeNull();
  });

  it('returns null when both are empty', () => {
    expect(detectSubagentAsyncEscape({ background_tasks: [], session_crons: [] })).toBeNull();
  });

  it('handles missing fields gracefully', () => {
    expect(detectSubagentAsyncEscape({})).toBeNull();
  });
});

describe('block-count persistence (loop guard)', () => {
  it('starts at 0 for an unseen agent_id', () => {
    const id = uniqueAgentId('fresh');
    expect(readBlockCount(id)).toBe(0);
  });

  it('round-trips a written count', () => {
    const id = uniqueAgentId('roundtrip');
    writeBlockCount(id, 1);
    expect(readBlockCount(id)).toBe(1);
    resetBlockCount(id);
  });

  it('resetBlockCount clears the counter back to 0', () => {
    const id = uniqueAgentId('reset');
    writeBlockCount(id, 2);
    expect(readBlockCount(id)).toBe(2);
    resetBlockCount(id);
    expect(readBlockCount(id)).toBe(0);
  });

  it('resetBlockCount on a never-written id is a safe no-op', () => {
    const id = uniqueAgentId('never-written');
    expect(() => resetBlockCount(id)).not.toThrow();
  });

  it('produces a stable, filesystem-safe path for arbitrary agent_id characters', () => {
    const p = stateFilePath('weird/id:with*chars');
    const base = p.split(/[/\\]/).pop();
    expect(base).toBe('weird_id_with_chars.json');
  });
});

describe('main (end-to-end via console/exit spies)', () => {
  let consoleSpy;
  let exitSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function lastOutput() {
    return JSON.parse(consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0]);
  }

  it('allows a clean completion message', async () => {
    await main({ agent_id: uniqueAgentId('clean'), last_assistant_message: 'All tests pass, implementation complete.' });
    const out = lastOutput();
    expect(out.decision).toBeUndefined();
    expect(out.continue).toBe(true);
  });

  it('blocks a deferred-work claim with no escape valve', async () => {
    const id = uniqueAgentId('block');
    await main({ agent_id: id, last_assistant_message: 'Waiting for background scenario completions to finish.', background_tasks: [], session_crons: [] });
    const out = lastOutput();
    expect(out.decision).toBe('block');
    expect(out.reason).toMatch(/SUBAGENT-DISCIPLINE GUARD/);
    resetBlockCount(id);
  });

  it('allows through when a legitimate background_tasks escape valve is present', async () => {
    const id = uniqueAgentId('escape');
    await main({ agent_id: id, last_assistant_message: 'Waiting for background scenario completions to finish.', background_tasks: [{ id: 'bg1' }], session_crons: [] });
    const out = lastOutput();
    expect(out.decision).toBeUndefined();
  });

  it('respects ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE', async () => {
    process.env.ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE = '1';
    await main({ agent_id: uniqueAgentId('disabled'), last_assistant_message: 'Waiting for background scenario completions to finish.' });
    const out = lastOutput();
    expect(out.decision).toBeUndefined();
  });

  it('degrades to allow when agent_id is absent, even for a real claim', async () => {
    await main({ last_assistant_message: 'Waiting for background scenario completions to finish.' });
    const out = lastOutput();
    expect(out.decision).toBeUndefined();
  });

  it('prefers hookData.last_assistant_message over transcript_path when both are present', async () => {
    const id = uniqueAgentId('prefer-field');
    await main({
      agent_id: id,
      last_assistant_message: 'Implementation complete, all tests pass.',
      transcript_path: '/nonexistent/should-not-be-read.jsonl',
    });
    const out = lastOutput();
    expect(out.decision).toBeUndefined();
  });

  it('enforces the consecutive-block loop cap: blocks up to MAX_CONSECUTIVE_BLOCKS, then allows and resets', async () => {
    const id = uniqueAgentId('loopcap');
    const payload = { agent_id: id, last_assistant_message: 'Waiting for background scenario completions to finish.', background_tasks: [], session_crons: [] };

    for (let i = 1; i <= MAX_CONSECUTIVE_BLOCKS; i++) {
      await main(payload);
      const out = lastOutput();
      expect(out.decision).toBe('block');
    }

    // One more consecutive claim beyond the cap must be let through.
    await main(payload);
    const capOut = lastOutput();
    expect(capOut.decision).toBeUndefined();
    expect(readBlockCount(id)).toBe(0);

    // And the cycle can begin again fresh afterward.
    await main(payload);
    const freshOut = lastOutput();
    expect(freshOut.decision).toBe('block');
    resetBlockCount(id);
  });

  it('never throws and always exits 0 on malformed hookData', async () => {
    await expect(main(null)).resolves.not.toThrow();
    await expect(main({})).resolves.not.toThrow();
  });
});
