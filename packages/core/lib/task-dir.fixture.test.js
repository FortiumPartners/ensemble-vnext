/**
 * Fixture test for a /task state directory (task-command TASK-005).
 *
 * Builds the directory the way task.md instructs (implement-state `save` + `recordResult`,
 * plus a closed.json in the TRD's shape) and checks that the writer persisted `deferred` and
 * that the two readers that scan `.trd-state/` cope with it: session-context.js's banner
 * summary renders without error, and status.js's scan finds the file and leaves it untouched.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { load, save, recordResult } = require('./implement-state');
const { summarizeImplementState, closedFeatureLine } = require('../hooks/session-context');
const status = require('../hooks/status');

let root;
let dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-dir-'));
  dir = path.join(root, '.trd-state', 'task-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, 'report.md'), '# findings\n');

  const mk = (description) => ({
    description, status: 'pending', started_at: null, completed_at: null,
    cycle_position: 'implement', retry_count: 0,
  });
  const state = {
    version: 1, kind: 'task', trd_file: null, brief: null, phase_cursor: 1,
    tasks: { 'STEP-001': mk('capture'), 'STEP-002': mk('grade') },
    checkpoints: [], created_at: new Date().toISOString(),
  };
  const file = path.join(dir, 'implement.json');
  save(file, state);
  const s = load(file);
  recordResult(s, 'STEP-001', { status: 'success', filesChanged: ['report.md'] }, { projectRoot: root });
  recordResult(s, 'STEP-002', { status: 'deferred', error: 'no simulator free' }, { projectRoot: root });
  save(file, s);

  fs.writeFileSync(path.join(dir, 'closed.json'), JSON.stringify({
    feature: 'task-demo', trd: null, closedAt: '2026-10-31T12:00:00Z', closedBy: 'task',
    note: null, audit: null, reason: 'task-complete', outputs: ['report.md'],
    followups: [{ summary: 'regressions', evidence: 'report.md' }],
  }, null, 2));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a /task state directory', () => {
  test('recordResult persisted success and deferred, with the reason', () => {
    const s = load(path.join(dir, 'implement.json'));
    expect(s.kind).toBe('task');
    expect(s.trd_file).toBeNull();
    expect(s.tasks['STEP-001'].status).toBe('success');
    expect(s.tasks['STEP-002'].status).toBe('deferred');
    expect(JSON.stringify(s.tasks['STEP-002'])).toContain('no simulator free');
  });

  test('session-context renders the banner summary and closed line without error', () => {
    const s = load(path.join(dir, 'implement.json'));
    const summary = summarizeImplementState(s);
    expect(summary).toMatch(/^1\/2 tasks complete/);
    expect(closedFeatureLine(root, 'task-demo')).toMatch(/^ {2}Closed: 2026-10-31 by /);
  });

  test("status.js's scan finds the directory and leaves it unchanged", () => {
    const before = {
      impl: fs.readFileSync(path.join(dir, 'implement.json'), 'utf8'),
      closed: fs.readFileSync(path.join(dir, 'closed.json'), 'utf8'),
    };
    const stateDir = status.findTrdStateDir(root);
    const files = status.findImplementFiles(stateDir);
    expect(files).toEqual([path.join(dir, 'implement.json')]);
    const parsed = status.readImplementJson(files[0]);
    expect(parsed.tasks['STEP-002'].status).toBe('deferred');
    expect(status.advanceCyclePosition(files[0], parsed)).toBe(false);

    expect(fs.readFileSync(path.join(dir, 'implement.json'), 'utf8')).toBe(before.impl);
    expect(fs.readFileSync(path.join(dir, 'closed.json'), 'utf8')).toBe(before.closed);
    expect(fs.readdirSync(dir).sort()).toEqual(['closed.json', 'implement.json']);
  });
});
