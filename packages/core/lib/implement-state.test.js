'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CYCLE_ORDER,
  load,
  save,
  advance,
  recordResult,
  checkpoint,
} = require('./implement-state');

const FIXTURE_PATH = path.join(__dirname, '../../../.trd-state/implement-trd-rework/implement.json');

// NOTE on test doubles: `mock-fs@5.2.0` (the devDependency named in the task) is broken under
// Node 22 in this environment — a standalone repro showed `mockFs({...})` never returns
// (the process hangs/no-ops silently instead of patching `fs`), a known class of issue for
// unmaintained fs-mocking libraries against newer Node internal bindings. Rather than ship
// tests that silently pass against an inert mock, these tests use a real temp directory
// (`fs.mkdtempSync`) for file I/O and `jest.spyOn` on the real `fs` module to simulate a
// mid-write crash. This is a deliberate deviation from the task's stated tooling, flagged
// here and in the delivery report rather than silently swapped.

/** Deep-clone a plain JSON-shaped object. */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'implement-state-test-'));
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CYCLE_ORDER', () => {
  it('matches the four-position collapse specified in TRD §3.3', () => {
    expect(CYCLE_ORDER).toEqual(['implement', 'checks', 'debug', 'complete']);
  });
});

describe('load()', () => {
  it('parses the real fixture (.trd-state/implement-trd-rework/implement.json)', () => {
    const state = load(FIXTURE_PATH);
    expect(state.trd_file).toBe('docs/TRD/implement-trd-rework.md');
    expect(state.tasks).toBeDefined();
    expect(Object.keys(state.tasks).length).toBeGreaterThanOrEqual(19);
    expect(state.tasks['ITR-B001'].status).toBe('success');
  });

  it('parses a well-formed state file', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    fs.writeFileSync(filePath, JSON.stringify({ version: '1.0.0', tasks: {} }));
    const state = load(filePath);
    expect(state.version).toBe('1.0.0');
  });

  it('throws (does not swallow) when the file does not exist', () => {
    const filePath = path.join(tmpDir, 'missing.json');
    expect(() => load(filePath)).toThrow(/ENOENT/);
  });

  it('throws when the file is not valid JSON', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    fs.writeFileSync(filePath, 'not json {');
    expect(() => load(filePath)).toThrow(SyntaxError);
  });
});

describe('save()', () => {
  it('writes JSON that round-trips through load()', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    const state = { version: '1.0.0', tasks: { 'T-1': { status: 'pending' } } };
    save(filePath, state);

    const reloaded = load(filePath);
    expect(reloaded).toEqual(state);
  });

  it('leaves no .tmp file behind on a successful write', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    save(filePath, { version: '1.0.0' });
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('is atomic: a throw mid-rename leaves the original file intact and no .tmp behind', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    const original = { version: '1.0.0', tasks: { 'T-1': { status: 'success' } } };
    fs.writeFileSync(filePath, JSON.stringify(original, null, 2), 'utf-8');

    // Force the rename step to throw, simulating a crash between the temp write landing on
    // disk and the rename that makes it durable — the step most worth proving safe, since
    // that's where a torn write would otherwise happen.
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash during rename');
    });

    expect(() => save(filePath, { version: '2.0.0', tasks: {} })).toThrow(
      'simulated crash during rename'
    );

    renameSpy.mockRestore();

    // Original file survives untouched.
    const survived = load(filePath);
    expect(survived).toEqual(original);

    // No .tmp file left behind — save() cleans up on throw.
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });

  it('is atomic: a throw during the temp-file write also leaves the original intact', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    const original = { version: '1.0.0', tasks: { 'T-1': { status: 'success' } } };
    fs.writeFileSync(filePath, JSON.stringify(original, null, 2), 'utf-8');

    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('simulated disk-full during temp write');
    });

    expect(() => save(filePath, { version: '2.0.0' })).toThrow(
      'simulated disk-full during temp write'
    );

    writeSpy.mockRestore();

    const survived = load(filePath);
    expect(survived).toEqual(original);
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });
});

describe('advance()', () => {
  function baseState() {
    return {
      tasks: {
        'T-1': { status: 'in_progress', cycle_position: 'implement', retry_count: 0, current_problem: null },
        'T-2': { status: 'pending', cycle_position: null },
      },
    };
  }

  it('advances implement -> checks', () => {
    const state = baseState();
    const result = advance(state, 'T-1');
    expect(result).toEqual({ state, from: 'implement', to: 'checks' });
    expect(state.tasks['T-1'].cycle_position).toBe('checks');
    expect(state.tasks['T-1'].last_advanced).toBeDefined();
  });

  it('advances debug -> complete (the recovery path)', () => {
    const state = baseState();
    state.tasks['T-1'].cycle_position = 'debug';
    const result = advance(state, 'T-1');
    expect(result).toEqual({ state, from: 'debug', to: 'complete' });
  });

  it('returns null at the terminal position (complete)', () => {
    const state = baseState();
    state.tasks['T-1'].cycle_position = 'complete';
    expect(advance(state, 'T-1')).toBeNull();
  });

  it('returns null when the task is not in_progress (re-scoped single-active guard)', () => {
    const state = baseState();
    expect(advance(state, 'T-2')).toBeNull();
  });

  it('does not require global exactly-one-in_progress — parallel waves are legitimate', () => {
    const state = baseState();
    state.tasks['T-2'].status = 'in_progress';
    state.tasks['T-2'].cycle_position = 'implement';
    // Both T-1 and T-2 in_progress simultaneously (a parallel wave). Advancing one must not
    // be blocked by the other also being active — the old status.js global guard would have
    // refused this.
    expect(advance(state, 'T-1')).toEqual({ state, from: 'implement', to: 'checks' });
    expect(advance(state, 'T-2')).toEqual({ state, from: 'implement', to: 'checks' });
  });

  it('skips (returns null) when mid-debug retry and NOT at the debug position', () => {
    const state = baseState();
    state.tasks['T-1'].cycle_position = 'implement';
    state.tasks['T-1'].retry_count = 1;
    expect(advance(state, 'T-1')).toBeNull();
  });

  it('skips when current_problem is set and not at debug', () => {
    const state = baseState();
    state.tasks['T-1'].cycle_position = 'checks';
    state.tasks['T-1'].current_problem = 'flaky test';
    expect(advance(state, 'T-1')).toBeNull();
  });

  it('does NOT skip when at debug, even with retry_count > 0 (debug -> complete must be reachable)', () => {
    const state = baseState();
    state.tasks['T-1'].cycle_position = 'debug';
    state.tasks['T-1'].retry_count = 2;
    state.tasks['T-1'].current_problem = 'was failing, now fixed';
    const result = advance(state, 'T-1');
    expect(result).toEqual({ state, from: 'debug', to: 'complete' });
  });

  it('records a migration warning instead of throwing on an unknown cycle_position', () => {
    const state = baseState();
    state.tasks['T-1'].cycle_position = 'verify_red'; // pre-migration value
    const result = advance(state, 'T-1');
    expect(result).toBeNull();
    expect(state.warnings).toHaveLength(1);
    expect(state.warnings[0]).toMatch(/unrecognized cycle_position/);
    expect(state.warnings[0]).toMatch(/verify_red/);
  });

  it('throws on an unknown taskId (programmer error, not a migration case)', () => {
    const state = baseState();
    expect(() => advance(state, 'NOPE')).toThrow(/unknown task/);
  });
});

describe('recordResult()', () => {
  function baseState() {
    return { tasks: { 'T-1': { status: 'in_progress', cycle_position: 'checks', retry_count: 0 } } };
  }

  it('records a failure: increments retry_count and sets current_problem', () => {
    const state = baseState();
    recordResult(state, 'T-1', { status: 'failed', error: 'assertion mismatch' });
    expect(state.tasks['T-1'].status).toBe('failed');
    expect(state.tasks['T-1'].retry_count).toBe(1);
    expect(state.tasks['T-1'].current_problem).toBe('assertion mismatch');
  });

  it('increments retry_count again on a second consecutive failure', () => {
    const state = baseState();
    recordResult(state, 'T-1', { status: 'failed', error: 'first' });
    recordResult(state, 'T-1', { status: 'failed', error: 'second' });
    expect(state.tasks['T-1'].retry_count).toBe(2);
    expect(state.tasks['T-1'].current_problem).toBe('second');
  });

  it('records a success: clears current_problem and stamps completed_at', () => {
    const state = baseState();
    state.tasks['T-1'].current_problem = 'stale problem text';
    recordResult(state, 'T-1', { status: 'success' });
    expect(state.tasks['T-1'].status).toBe('success');
    expect(state.tasks['T-1'].current_problem).toBeNull();
    expect(state.tasks['T-1'].completed_at).toBeDefined();
  });

  it('records filesChanged when provided', () => {
    const state = baseState();
    recordResult(state, 'T-1', { status: 'success', filesChanged: ['a.js', 'b.js'] });
    expect(state.tasks['T-1'].files_changed).toEqual(['a.js', 'b.js']);
  });

  it('throws on an unknown taskId', () => {
    const state = baseState();
    expect(() => recordResult(state, 'NOPE', { status: 'success' })).toThrow(/unknown task/);
  });

  it('records an arbitrary status verbatim (e.g. "blocked") along with an error note', () => {
    const state = baseState();
    recordResult(state, 'T-1', { status: 'blocked', error: 'waiting on external API key' });
    expect(state.tasks['T-1'].status).toBe('blocked');
    expect(state.tasks['T-1'].current_problem).toBe('waiting on external API key');
  });

  it('leaves status/current_problem untouched when neither status nor error is given', () => {
    const state = baseState();
    state.tasks['T-1'].current_problem = 'pre-existing';
    recordResult(state, 'T-1', { filesChanged: ['only-files.js'] });
    expect(state.tasks['T-1'].status).toBe('in_progress');
    expect(state.tasks['T-1'].current_problem).toBe('pre-existing');
    expect(state.tasks['T-1'].files_changed).toEqual(['only-files.js']);
  });
});

describe('checkpoint()', () => {
  it('appends a checkpoint entry and updates the recovery marker', () => {
    const state = { checkpoints: [] };
    checkpoint(state, 2, { commit: 'abc123', review: { findings: 0 } });

    expect(state.checkpoints).toHaveLength(1);
    expect(state.checkpoints[0]).toMatchObject({ phase: 2, commit: 'abc123', review: { findings: 0 } });
    expect(state.checkpoints[0].timestamp).toBeDefined();

    expect(state.recovery.last_healthy_checkpoint).toBe('abc123');
    expect(state.recovery.interrupted).toBe(false);
    expect(state.recovery.interrupt_reason).toBeNull();
  });

  it('creates state.checkpoints when absent', () => {
    const state = {};
    checkpoint(state, 1, { commit: 'sha1' });
    expect(state.checkpoints).toHaveLength(1);
  });

  it('preserves the previous last_healthy_checkpoint when no commit is given', () => {
    const state = { recovery: { last_healthy_checkpoint: 'previous-sha' } };
    checkpoint(state, 3, {});
    expect(state.recovery.last_healthy_checkpoint).toBe('previous-sha');
  });

  it('throws when state is missing', () => {
    expect(() => checkpoint(null, 1, { commit: 'sha1' })).toThrow(/state is required/);
  });

  it('defaults details to {} when omitted', () => {
    const state = {};
    expect(() => checkpoint(state, 1)).not.toThrow();
    expect(state.checkpoints[0].commit).toBeNull();
  });
});

describe('end-to-end: load -> advance -> recordResult -> save round trip', () => {
  it('persists a full implement -> checks -> success cycle atomically', () => {
    const filePath = path.join(tmpDir, 'implement.json');
    const initial = clone({
      version: '3.1.0',
      tasks: {
        'ITR-X001': { status: 'in_progress', cycle_position: 'implement', retry_count: 0, current_problem: null },
      },
    });
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8');

    const state = load(filePath);
    advance(state, 'ITR-X001'); // implement -> checks
    recordResult(state, 'ITR-X001', { status: 'success', filesChanged: ['x.js'] });
    // Caller (command) explicitly skips debug on a passing check — see the documented
    // ambiguity in recordResult()'s JSDoc; this module does not do it implicitly.
    state.tasks['ITR-X001'].cycle_position = 'complete';
    save(filePath, state);

    const reloaded = load(filePath);
    expect(reloaded.tasks['ITR-X001'].cycle_position).toBe('complete');
    expect(reloaded.tasks['ITR-X001'].status).toBe('success');
    expect(reloaded.tasks['ITR-X001'].files_changed).toEqual(['x.js']);
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });
});
