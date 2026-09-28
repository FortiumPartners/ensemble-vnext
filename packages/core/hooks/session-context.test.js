/**
 * SessionStart Hook Test Suite — closed-feature banner (§3.4, CLOSE-B001)
 *
 * Calls the exported `main` in-process rather than spawning a subprocess (the
 * pattern precompact.test.js uses instead, because precompact.js calls `main()`
 * unconditionally at module load). session-context.js's stdin-listener block is
 * now guarded by `require.main === module` specifically so this file CAN require
 * it and call `main` directly without also triggering a second, uncontrolled
 * invocation when this test worker's stdin reaches 'end' — see the comment at
 * that guard for the status.js/dispatch-ledger.js precedent and the failure mode
 * it prevents (a second `main()` call ending in `process.exit(0)`, tearing down
 * the Jest worker mid-run).
 *
 * `main()`'s own `emit()` still calls `console.log` + `process.exit(0)` — that is
 * unchanged production behaviour, not a test artifact — so every test here mocks
 * both before calling `main` and restores them afterward.
 *
 * Both this file and test_router.py's TestFeatureInFlightTerminator read the same
 * fixture, test/integration/fixtures/closed-feature.json, for the "accepted,
 * unfinished tasks" scenario (the cross-seam case: two readers, one on-disk record).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { main } = require('./session-context.js');

const FIXTURE_PATH = path.join(
  __dirname, '..', '..', '..', 'test', 'integration', 'fixtures', 'closed-feature.json'
);

let tmpDir;
let savedProjectDir;
let exitSpy;
let logSpy;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-context-test-'));
  fs.mkdirSync(path.join(tmpDir, '.trd-state'));
  // resolveProjectRoot prefers $CLAUDE_PROJECT_DIR when set; clear it so each test's
  // tmpDir (which carries its own .trd-state marker) resolves as the root.
  savedProjectDir = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (savedProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR;
  } else {
    process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
  }
  exitSpy.mockRestore();
  logSpy.mockRestore();
});

function writeCurrentJson(obj) {
  fs.writeFileSync(path.join(tmpDir, '.trd-state', 'current.json'), JSON.stringify(obj));
}

function writeClosedJson(feature, content) {
  const dir = path.join(tmpDir, '.trd-state', feature);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'closed.json'),
    typeof content === 'string' ? content : JSON.stringify(content)
  );
}

function writeImplementJson(feature, tasks) {
  const dir = path.join(tmpDir, '.trd-state', feature);
  fs.mkdirSync(dir, { recursive: true });
  const implPath = path.join(dir, 'implement.json');
  fs.writeFileSync(implPath, JSON.stringify({ tasks }));
  return path.relative(tmpDir, implPath);
}

/** Runs main() against tmpDir and returns the emitted additionalContext string. */
async function runMain() {
  await main({ cwd: tmpDir });
  expect(exitSpy).toHaveBeenCalledWith(0);
  expect(logSpy).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(logSpy.mock.calls[0][0]);
  return payload.hookSpecificOutput.additionalContext;
}

describe('session-context.js closed-feature banner', () => {
  it('an accepted record with 2 of 2 tasks unfinished prints the accepted-unfinished line and no Impl: line', async () => {
    const record = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
    writeClosedJson('closed-feature', record);
    const status = writeImplementJson('closed-feature', {
      'TASK-A': { status: 'in_progress' },
      'TASK-B': { status: 'deferred' },
    });
    writeCurrentJson({ trd: 'docs/TRD/closed-feature.md', status });

    const ctx = await runMain();

    expect(ctx).toContain('closed with 2 of 2 tasks accepted unfinished');
    expect(ctx).not.toContain('Impl:');
  });

  it('a done-with-gaps record prints the verdict and its gap count', async () => {
    writeClosedJson('gappy-feature', {
      feature: 'gappy-feature',
      trd: 'docs/TRD/gappy-feature.md',
      closedAt: '2026-09-22T09:00:00Z',
      defaultBranch: 'main',
      checkpointCommit: 'deadbee',
      merged: true,
      abandoned: false,
      verdict: 'done-with-gaps',
      outstanding: [
        { item: 'live SSO check', why: 'covered manually, not by the exerciser' },
      ],
      ownerEvidence: null,
      acceptedReason: null,
      tasks: { success: 5 },
      unfinished: [],
      verification: { outcome: 'satisfied', report: null },
      audit: null,
    });
    writeCurrentJson({ trd: 'docs/TRD/gappy-feature.md' });

    const ctx = await runMain();

    expect(ctx).toContain('done-with-gaps');
    expect(ctx).toContain('1 gap');
  });

  it('an unparseable closed.json prints the unreadable-record line and does not throw', async () => {
    writeClosedJson('broken-feature', '{ this is not json');
    writeCurrentJson({ trd: 'docs/TRD/broken-feature.md' });

    const ctx = await runMain();

    expect(ctx).toContain('Closed: record unreadable');
    expect(ctx).toContain('broken-feature/closed.json');
  });

  it('a nulled current.json emits empty context', async () => {
    writeCurrentJson({ prd: null, trd: null, status: null, branch: null });

    const ctx = await runMain();

    expect(ctx).toBe('');
  });

  it('a feature without closed.json still prints its Impl: tally', async () => {
    const status = writeImplementJson('open-feature', {
      'TASK-A': { status: 'success' },
      'TASK-B': { status: 'in_progress' },
    });
    writeCurrentJson({ trd: 'docs/TRD/open-feature.md', status });

    const ctx = await runMain();

    expect(ctx).toContain('Impl:');
    expect(ctx).not.toContain('Closed:');
  });

  it('an abandoned record with acceptedReason renders the abandoned line, not the accepted-unfinished one', async () => {
    writeClosedJson('abandoned-feature', {
      feature: 'abandoned-feature',
      trd: 'docs/TRD/abandoned-feature.md',
      closedAt: '2026-09-23T00:00:00Z',
      defaultBranch: 'main',
      checkpointCommit: null,
      merged: null,
      abandoned: true,
      verdict: 'not-done',
      outstanding: [],
      ownerEvidence: null,
      acceptedReason: 'design shelved before implementation started',
      tasks: {},
      unfinished: [],
      verification: { outcome: null, report: null },
      audit: null,
    });
    writeCurrentJson({ trd: 'docs/TRD/abandoned-feature.md' });

    const ctx = await runMain();

    expect(ctx).toContain('abandoned, never implemented: design shelved before implementation started');
    expect(ctx).not.toContain('accepted unfinished');
  });
});
