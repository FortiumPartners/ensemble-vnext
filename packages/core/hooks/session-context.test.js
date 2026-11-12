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
 * fixture, test/integration/fixtures/closed-feature.json (an owner close with a
 * note, over unfinished tasks: the cross-seam case of two readers, one on-disk record).
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
  it('an owner close prints the date and note and no Impl: line', async () => {
    const record = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
    writeClosedJson('closed-feature', record);
    const status = writeImplementJson('closed-feature', {
      'TASK-A': { status: 'in_progress' },
      'TASK-B': { status: 'deferred' },
    });
    writeCurrentJson({ trd: 'docs/TRD/closed-feature.md', status });

    const ctx = await runMain();

    expect(ctx).toContain('Closed: 2026-09-20 by owner: shipped anyway');
    expect(ctx).not.toContain('Impl:');
  });

  it('an audit close prints the verdict without its VERDICT: prefix', async () => {
    writeClosedJson('audited-feature', {
      feature: 'audited-feature',
      trd: 'docs/TRD/audited-feature.md',
      closedAt: '2026-09-22T09:00:00Z',
      closedBy: 'audit',
      note: null,
      audit: {
        verdict: 'VERDICT: safe to proceed — every requirement is implemented and tested',
        report: '.trd-state/audited-feature/audit-build-report.md',
        auditedCommit: 'deadbee',
      },
    });
    writeCurrentJson({ trd: 'docs/TRD/audited-feature.md' });

    const ctx = await runMain();

    expect(ctx).toContain('Closed: 2026-09-22 by audit — safe to proceed');
    expect(ctx).not.toContain('VERDICT:');
  });

  it('an owner close with no note prints no trailing colon', async () => {
    writeClosedJson('quiet-feature', {
      feature: 'quiet-feature',
      trd: 'docs/TRD/quiet-feature.md',
      closedAt: '2026-09-23T00:00:00Z',
      closedBy: 'owner',
      note: null,
      audit: null,
    });
    writeCurrentJson({ trd: 'docs/TRD/quiet-feature.md' });

    const ctx = await runMain();

    expect(ctx).toMatch(/Closed: 2026-09-23 by owner\s*(\n|$)/);
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
});

// ---------------------------------------------------------------------------------------------
// Ref fallback: with no .trd-state/<slug>/ folder, the banner reads the local records ref.
// ---------------------------------------------------------------------------------------------

const { spawnSync } = require('child_process');
const recordRef = require('../lib/record-ref');

describe('session-context.js falls back to the local records ref', () => {
  const SLUG = 'ref-feature';
  const REF = `refs/ensemble/records/${SLUG}`;
  let repo;
  let savedForge;

  const git = (cwd, args) => {
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    return { status: r.status, out: (r.stdout || '').trim() };
  };

  // A repo whose records ref holds `files`, with the worktree folder then removed.
  function repoWithRef(files) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-ref-')));
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'user.email', 't@example.com']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-q', '-m', 'init']);
    const folder = path.join(dir, '.trd-state', SLUG);
    fs.mkdirSync(folder, { recursive: true });
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), body);
    const w = recordRef.write({ stateDir: `.trd-state/${SLUG}`, command: 'test', step: 'x', push: false, cwd: dir });
    expect(w.ok).toBe(true);
    fs.rmSync(folder, { recursive: true, force: true });
    fs.writeFileSync(
      path.join(dir, '.trd-state', 'current.json'),
      JSON.stringify({ trd: `docs/TRD/${SLUG}.md`, status: `.trd-state/${SLUG}/implement.json` })
    );
    return dir;
  }

  async function bannerFor(dir) {
    const saved = tmpDir;
    tmpDir = dir;
    try {
      return await runMain();
    } finally {
      tmpDir = saved;
    }
  }

  beforeEach(() => {
    savedForge = process.env.FORGE_FEATURE_ID;
    delete process.env.FORGE_FEATURE_ID;
  });

  afterEach(() => {
    if (savedForge === undefined) delete process.env.FORGE_FEATURE_ID;
    else process.env.FORGE_FEATURE_ID = savedForge;
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
    repo = null;
  });

  it('(a) a ref holding closed.json gives the Closed: line', async () => {
    repo = repoWithRef({
      'closed.json': JSON.stringify({ closedAt: '2026-10-01T00:00:00Z', closedBy: 'owner', note: 'done' }),
    });
    const ctx = await bannerFor(repo);
    expect(ctx).toContain('Closed: 2026-10-01 by owner: done');
    expect(fs.existsSync(path.join(repo, '.trd-state', SLUG))).toBe(false);
  });

  it('(a) a ref holding implement.json instead gives the Impl: line', async () => {
    repo = repoWithRef({ 'implement.json': JSON.stringify({ tasks: { A: { status: 'success' }, B: { status: 'pending' } } }) });
    const ctx = await bannerFor(repo);
    expect(ctx).toContain('Impl:   1/2 tasks complete');
    expect(ctx).not.toContain('Closed:');
  });

  it('(a2) a ref owned by a different feature gives no Closed: line and creates no folder', async () => {
    repo = repoWithRef({
      'closed.json': JSON.stringify({ closedAt: '2026-10-01T00:00:00Z', closedBy: 'owner', note: 'done' }),
    });
    git(repo, ['checkout', '-q', '-b', 'other-feature']);
    const ctx = await bannerFor(repo);
    expect(ctx).toContain(`TRD:    docs/TRD/${SLUG}.md`);
    expect(ctx).not.toContain('Closed:');
    expect(fs.existsSync(path.join(repo, '.trd-state', SLUG))).toBe(false);
  });

  it('(b) neither a folder nor a ref: output is the same as without the fallback', async () => {
    repo = repoWithRef({ 'implement.json': '{}' });
    git(repo, ['update-ref', '-d', REF]);
    const ctx = await bannerFor(repo);
    expect(ctx).toContain(`TRD:    docs/TRD/${SLUG}.md`);
    expect(ctx).not.toContain('Closed:');
    expect(ctx).not.toContain('Impl:');
  });

  it('(c) a bare origin holding the ref, local ref absent: no Closed: line and no fetch', async () => {
    repo = repoWithRef({ 'closed.json': JSON.stringify({ closedAt: '2026-10-01T00:00:00Z', closedBy: 'owner' }) });
    const origin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-origin-')));
    git(origin, ['init', '-q', '--bare', '-b', 'main']);
    git(repo, ['remote', 'add', 'origin', origin]);
    expect(git(repo, ['push', '-q', 'origin', `${REF}:${REF}`]).status).toBe(0);
    git(repo, ['update-ref', '-d', REF]);
    try {
      const ctx = await bannerFor(repo);
      expect(ctx).not.toContain('Closed:');
      expect(git(repo, ['rev-parse', '--verify', '-q', REF]).status).not.toBe(0);
    } finally {
      fs.rmSync(origin, { recursive: true, force: true });
    }
  });

  it('(e) never throws when git is not on PATH', async () => {
    repo = repoWithRef({ 'closed.json': JSON.stringify({ closedAt: '2026-10-01T00:00:00Z', closedBy: 'owner' }) });
    const savedPath = process.env.PATH;
    process.env.PATH = '/nonexistent';
    try {
      const ctx = await bannerFor(repo);
      expect(typeof ctx).toBe('string');
      expect(ctx).not.toContain('Closed:');
    } finally {
      process.env.PATH = savedPath;
    }
  });
});
