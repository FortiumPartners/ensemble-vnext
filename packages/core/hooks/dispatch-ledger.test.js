/**
 * Tests for dispatch-ledger.js and lib/dispatch-ledger.js.
 *
 * Payload fixtures below are VERBATIM captures from a live probe on
 * 2026-08-12 (a real session spawning two concurrent subagents with capture
 * hooks registered on both events), not hand-written from documentation. The
 * absence of a `name` field in particular is a probed fact that shaped the
 * design — see lib/dispatch-ledger.js's header.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('./lib/dispatch-ledger');
const hook = require('./dispatch-ledger');

// --- Verbatim probe captures -------------------------------------------------

const START_ALPHA = {
  session_id: '982855c2-e01c-46bc-85d3-f7eda8b3f498',
  transcript_path: '/Users/james/.claude/projects/-private-tmp-x/982855c2.jsonl',
  cwd: '/private/tmp/sastart-probe.W3FONx',
  prompt_id: 'b5963966-75d6-4cc9-aafc-08cb0bbd007f',
  agent_id: 'ae5ed58fc661530ad',
  agent_type: 'general-purpose',
  hook_event_name: 'SubagentStart',
};

const START_BETA = {
  ...START_ALPHA,
  agent_id: 'a9ed12da50cfd6077',
};

const STOP_ALPHA = {
  session_id: START_ALPHA.session_id,
  transcript_path: START_ALPHA.transcript_path,
  agent_transcript_path: '/Users/james/.claude/projects/-private-tmp-x/agent-ae5ed58.jsonl',
  cwd: START_ALPHA.cwd,
  prompt_id: START_ALPHA.prompt_id,
  agent_id: 'ae5ed58fc661530ad',
  agent_type: 'general-purpose',
  last_assistant_message: 'DONE',
  background_tasks: [],
  session_crons: [],
  stop_hook_active: false,
  permission_mode: 'bypassPermissions',
  effort: 'medium',
  hook_event_name: 'SubagentStop',
};

// --- Harness -----------------------------------------------------------------

let projectRoot;

function makeProject({ currentJson } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensemble-ledger-test-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.trd-state'), { recursive: true });
  if (currentJson) {
    fs.writeFileSync(
      path.join(dir, '.trd-state', 'current.json'),
      JSON.stringify(currentJson)
    );
  }
  return dir;
}

function withRoot(data, root) {
  return { ...data, cwd: root };
}

beforeEach(() => {
  projectRoot = makeProject();
  delete process.env.ENSEMBLE_DISPATCH_LEDGER_DISABLE;
  delete process.env.CLAUDE_PROJECT_DIR;
});

afterEach(() => {
  try { fs.rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

// --- ledgerPath --------------------------------------------------------------

describe('ledgerPath', () => {
  test('uses the shared fallback when no current.json exists', () => {
    expect(lib.ledgerPath(projectRoot)).toBe(
      path.join(projectRoot, '.trd-state', '_dispatch.jsonl')
    );
  });

  test('uses a per-feature path derived from current.json', () => {
    const root = makeProject({ currentJson: { trd: 'docs/TRD/runtime-refresh.md' } });
    expect(lib.ledgerPath(root)).toBe(
      path.join(root, '.trd-state', 'runtime-refresh', 'dispatch.jsonl')
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('falls back when current.json is malformed', () => {
    fs.writeFileSync(path.join(projectRoot, '.trd-state', 'current.json'), '{not json');
    expect(lib.ledgerPath(projectRoot)).toBe(
      path.join(projectRoot, '.trd-state', '_dispatch.jsonl')
    );
  });

  test('refuses a traversal attempt in current.json.trd', () => {
    // current.json is command-authored; a "../../etc/x.md" trd must not steer
    // the ledger write outside .trd-state/.
    const root = makeProject({ currentJson: { trd: '../../../../tmp/evil.md' } });
    const p = lib.ledgerPath(root);
    expect(p.startsWith(path.join(root, '.trd-state'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

// --- appendEvent / readRows --------------------------------------------------

describe('appendEvent', () => {
  test('writes a parseable JSONL row', () => {
    expect(lib.appendEvent(projectRoot, 'start', { agent_id: 'a1', agent_type: 'x' })).toBe(true);
    const rows = lib.readRows(projectRoot);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: 'start', agent_id: 'a1', agent_type: 'x' });
    expect(typeof rows[0].ts).toBe('string');
  });

  test('omits empty/null fields rather than writing nulls', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1', agent_type: null, prompt_id: '' });
    const row = lib.readRows(projectRoot)[0];
    expect(row).not.toHaveProperty('agent_type');
    expect(row).not.toHaveProperty('prompt_id');
  });

  test('returns false without a project root instead of throwing', () => {
    expect(lib.appendEvent(null, 'start', { agent_id: 'a1' })).toBe(false);
  });

  test('keeps each line under PIPE_BUF so concurrent appends cannot interleave', () => {
    lib.appendEvent(projectRoot, 'stop', {
      agent_id: 'a1',
      agent_transcript_path: '/very/long/' + 'x'.repeat(5000) + '.jsonl',
    });
    const raw = fs.readFileSync(lib.ledgerPath(projectRoot), 'utf-8');
    expect(Buffer.byteLength(raw)).toBeLessThan(lib.MAX_LINE_BYTES + 1);
    // the oversized field is dropped, but the row still lands
    const row = lib.readRows(projectRoot)[0];
    expect(row.agent_id).toBe('a1');
    expect(row).not.toHaveProperty('agent_transcript_path');
  });

  test('survives concurrent appends from separate writes', () => {
    for (let i = 0; i < 50; i++) {
      lib.appendEvent(projectRoot, 'start', { agent_id: `a${i}` });
    }
    expect(lib.readRows(projectRoot)).toHaveLength(50);
  });
});

describe('readRows', () => {
  test('returns [] when the ledger does not exist', () => {
    expect(lib.readRows(projectRoot)).toEqual([]);
  });

  test('skips a truncated final line without losing earlier rows', () => {
    const file = lib.ledgerPath(projectRoot);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ ts: 't', event: 'start', agent_id: 'a1' }) + '\n' + '{"ts":"t","ev'
    );
    const rows = lib.readRows(projectRoot);
    expect(rows).toHaveLength(1);
    expect(rows[0].agent_id).toBe('a1');
  });

  test('skips rows with no agent_id (unjoinable)', () => {
    const file = lib.ledgerPath(projectRoot);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ts: 't', event: 'start' }) + '\n');
    expect(lib.readRows(projectRoot)).toEqual([]);
  });
});

// --- openAgents (the actual product) ----------------------------------------

describe('openAgents', () => {
  test('reports a started agent as open', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1', agent_type: 'backend-implementer' });
    const open = lib.openAgents(projectRoot);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ agent_id: 'a1', agent_type: 'backend-implementer', last_event: 'start' });
  });

  test('drops an agent once it stops', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'stop', { agent_id: 'a1' });
    expect(lib.openAgents(projectRoot)).toEqual([]);
  });

  test('REOPENS an agent whose stop was blocked — the core correctness case', () => {
    // subagent-discipline.js can block a SubagentStop; the subagent then keeps
    // running. Without the compensating "blocked" row the orchestrator would
    // read this agent as finished and skip nudging the one most likely stuck.
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'stop', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'blocked', { agent_id: 'a1', attempt: '1' });
    const open = lib.openAgents(projectRoot);
    expect(open).toHaveLength(1);
    expect(open[0].last_event).toBe('blocked');
  });

  test('closes again when the blocked agent really stops', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'stop', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'blocked', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'stop', { agent_id: 'a1' });
    expect(lib.openAgents(projectRoot)).toEqual([]);
  });

  test('tracks several agents independently', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1' });
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a2' });
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a3' });
    lib.appendEvent(projectRoot, 'stop', { agent_id: 'a2' });
    expect(lib.openAgents(projectRoot).map((a) => a.agent_id).sort()).toEqual(['a1', 'a3']);
  });

  test('filters to the requested session', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1', session_id: 's1' });
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a2', session_id: 's2' });
    const open = lib.openAgents(projectRoot, 's1');
    expect(open).toHaveLength(1);
    expect(open[0].agent_id).toBe('a1');
  });

  test('preserves the ORIGINAL start time across a blocked row, so age is real', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'a1' }, '2026-08-12T00:00:00.000Z');
    lib.appendEvent(projectRoot, 'stop', { agent_id: 'a1' }, '2026-08-12T00:10:00.000Z');
    lib.appendEvent(projectRoot, 'blocked', { agent_id: 'a1' }, '2026-08-12T00:10:01.000Z');
    expect(lib.openAgents(projectRoot)[0].started_at).toBe('2026-08-12T00:00:00.000Z');
  });

  test('sorts oldest dispatch first', () => {
    lib.appendEvent(projectRoot, 'start', { agent_id: 'newer' }, '2026-08-12T00:05:00.000Z');
    lib.appendEvent(projectRoot, 'start', { agent_id: 'older' }, '2026-08-12T00:01:00.000Z');
    expect(lib.openAgents(projectRoot).map((a) => a.agent_id)).toEqual(['older', 'newer']);
  });
});

// --- hook behavior on real payloads -----------------------------------------

describe('hook main()', () => {
  test('writes a start row from a verbatim SubagentStart payload', () => {
    const res = hook.main(withRoot(START_ALPHA, projectRoot));
    expect(res).toMatchObject({ event: 'start', agent_id: 'ae5ed58fc661530ad' });
    const row = lib.readRows(projectRoot)[0];
    expect(row).toMatchObject({
      event: 'start',
      agent_id: 'ae5ed58fc661530ad',
      agent_type: 'general-purpose',
      session_id: START_ALPHA.session_id,
      prompt_id: START_ALPHA.prompt_id,
    });
  });

  test('writes a stop row including agent_transcript_path', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    hook.main(withRoot(STOP_ALPHA, projectRoot));
    const rows = lib.readRows(projectRoot);
    expect(rows).toHaveLength(2);
    expect(rows[1].event).toBe('stop');
    expect(rows[1].agent_transcript_path).toBe(STOP_ALPHA.agent_transcript_path);
  });

  test('start then stop leaves nothing open', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    hook.main(withRoot(STOP_ALPHA, projectRoot));
    expect(lib.openAgents(projectRoot)).toEqual([]);
  });

  test('two concurrent dispatches both land', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    hook.main(withRoot(START_BETA, projectRoot));
    expect(lib.openAgents(projectRoot)).toHaveLength(2);
  });

  test('one finishing leaves the other open', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    hook.main(withRoot(START_BETA, projectRoot));
    hook.main(withRoot(STOP_ALPHA, projectRoot));
    const open = lib.openAgents(projectRoot);
    expect(open).toHaveLength(1);
    expect(open[0].agent_id).toBe('a9ed12da50cfd6077');
  });

  test('skips a payload with no agent_id', () => {
    const { agent_id, ...noId } = START_ALPHA;
    expect(hook.main(withRoot(noId, projectRoot))).toBeNull();
    expect(lib.readRows(projectRoot)).toEqual([]);
  });

  test('ignores unrelated hook events', () => {
    expect(hook.main(withRoot({ ...START_ALPHA, hook_event_name: 'Stop' }, projectRoot))).toBeNull();
    expect(lib.readRows(projectRoot)).toEqual([]);
  });

  test('honors the disable env var', () => {
    process.env.ENSEMBLE_DISPATCH_LEDGER_DISABLE = '1';
    expect(hook.main(withRoot(START_ALPHA, projectRoot))).toBeNull();
    expect(lib.readRows(projectRoot)).toEqual([]);
  });

  test('does not throw on an empty payload', () => {
    expect(() => hook.main({})).not.toThrow();
  });
});

// --- --open reporting --------------------------------------------------------

describe('reportOpen', () => {
  test('says so plainly when nothing is open', () => {
    expect(hook.reportOpen([], projectRoot)).toMatch(/No subagents currently open/);
  });

  test('lists open agents with an age and a usable nudge command', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    const out = hook.reportOpen([], projectRoot);
    expect(out).toMatch(/1 subagent\(s\) still open/);
    expect(out).toContain('ae5ed58fc661530ad');
    expect(out).toContain('general-purpose');
    expect(out).toMatch(/SendMessage/);
  });

  test('flags an agent that resumed after a discipline block', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    hook.main(withRoot(STOP_ALPHA, projectRoot));
    lib.appendEvent(projectRoot, 'blocked', { agent_id: START_ALPHA.agent_id });
    expect(hook.reportOpen([], projectRoot)).toMatch(/resumed after discipline block/);
  });

  test('--json emits machine-readable output', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    const parsed = JSON.parse(hook.reportOpen(['--json'], projectRoot));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].agent_id).toBe('ae5ed58fc661530ad');
  });

  test('--session filters the report', () => {
    hook.main(withRoot(START_ALPHA, projectRoot));
    const out = hook.reportOpen(['--session', 'some-other-session', '--json'], projectRoot);
    expect(JSON.parse(out)).toEqual([]);
  });
});
