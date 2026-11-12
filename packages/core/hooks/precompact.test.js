/**
 * PreCompact Hook Test Suite
 *
 * Asserts the SHAPE of the JSON payload precompact.js emits on stdout — not its
 * wording (see grounding note: a test coupled to message text breaks on every
 * copy edit and teaches people to ignore it).
 *
 * PreCompact does not support `hookSpecificOutput` the way SessionStart/UserPromptSubmit
 * do (see session-context.js for the pattern that DOES apply there). The pre-fix
 * `emit()` in precompact.js printed a `hookSpecificOutput` envelope, which the platform
 * rejected with "Hook JSON output validation failed" on every compaction — while the
 * checkpoint was (correctly) still appended to session-log.md on disk. That's the
 * defect this test pins:
 *
 *   pre-fix:  stdout is {"hookSpecificOutput":{...}}  -> rejected by the platform
 *   post-fix: stdout is exactly `{}`                  -> every documented top-level
 *                                                        key is optional, so it validates
 *
 * There is deliberately NO model-facing payload post-fix: the post-compaction
 * "re-read session-log.md" instruction lives in implement-trd.md, not in this hook.
 *
 * Run with: npx jest packages/core/hooks/precompact.test.js
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK_PATH = path.join(__dirname, 'precompact.js');

// The top-level keys a PreCompact hook response may use: the fields the platform
// documents as common to EVERY hook event. All are optional, which is why `{}`
// validates.
//
// Deliberately excluded, because none of these are PreCompact top-level keys and
// emitting one would be rejected in exactly the way the defect this suite pins was:
//   - `hookSpecificOutput` — the envelope that caused the bug; it belongs to events
//     (SessionStart, UserPromptSubmit, ...) that support additionalContext.
//   - `decision` / `reason` — PreToolUse / Stop / SubagentStop only.
//   - `permissionDecision` — a field INSIDE PreToolUse's hookSpecificOutput, never a
//     top-level key on any event.
// Keeping those out of the set is what lets the key-set test below actually catch a
// recurrence; per the TRD's "Could Not Verify", this suite is the only thing that will.
const ALLOWED_KEYS = new Set([
  'continue',
  'stopReason',
  'suppressOutput',
  'systemMessage',
]);

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Run precompact.js against an ISOLATED cwd (never the repo — otherwise the
 * hook appends bogus checkpoints to the live .trd-state session log).
 */
function runHook({ cwd, payload, env = {} }) {
  const transcriptPath = path.join(cwd, 'transcript.jsonl');
  fs.writeFileSync(
    transcriptPath,
    '{"role":"user","content":"test"}\n{"role":"assistant","content":"test"}\n',
    'utf-8'
  );

  const fullPayload = Object.assign(
    {
      trigger: 'manual',
      transcript_path: transcriptPath,
      cwd,
      session_id: 'precompact-test',
    },
    payload
  );

  // Strip CLAUDE_PROJECT_DIR so resolveProjectRoot() can't escape the tmp
  // sandbox and touch the real repo's .trd-state.
  const childEnv = Object.assign({}, process.env, env);
  delete childEnv.CLAUDE_PROJECT_DIR;

  const result = spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: JSON.stringify(fullPayload),
    env: childEnv,
    encoding: 'utf-8',
  });

  return result;
}

function writeFeatureFixture(cwd, { featureName = 'test-feature' } = {}) {
  const stateDir = path.join(cwd, '.trd-state');
  const featureDir = path.join(stateDir, featureName);
  fs.mkdirSync(featureDir, { recursive: true });

  fs.writeFileSync(
    path.join(stateDir, 'current.json'),
    JSON.stringify({
      prd: `docs/PRD/${featureName}.md`,
      trd: `docs/TRD/${featureName}.md`,
      status: `.trd-state/${featureName}/implement.json`,
      branch: `${featureName}-phase1`,
    }),
    'utf-8'
  );

  fs.writeFileSync(
    path.join(featureDir, 'implement.json'),
    JSON.stringify({
      phase_cursor: 2,
      strategy: 'tdd',
      branch: `${featureName}-phase1`,
      tasks: {
        'TRD-001': {
          status: 'in_progress',
          cycle_position: 'implement',
          description: 'Implement widget',
        },
        'TRD-000': {
          status: 'success',
          description: 'Scaffold widget module',
        },
      },
    }),
    'utf-8'
  );

  return { stateDir, featureDir };
}

describe('precompact.js emitted payload shape', () => {
  test('exits 0 and stdout is valid JSON', () => {
    const result = runHook({ cwd: tmpDir, payload: {} });
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  test('never emits a hookSpecificOutput key (PreCompact does not support it)', () => {
    writeFeatureFixture(tmpDir);
    const result = runHook({ cwd: tmpDir, payload: {} });
    const payload = JSON.parse(result.stdout);
    expect(Object.prototype.hasOwnProperty.call(payload, 'hookSpecificOutput')).toBe(false);
  });

  test('every top-level key emitted is in the documented allowed set', () => {
    writeFeatureFixture(tmpDir);
    const result = runHook({ cwd: tmpDir, payload: {} });
    const payload = JSON.parse(result.stdout);
    for (const key of Object.keys(payload)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });

  // This is the assertion that pins the actual defect. Pre-fix, emit() printed a
  // `hookSpecificOutput` envelope that PreCompact has no union member for, so the
  // platform rejected it on every compaction. Post-fix the hook emits exactly `{}`
  // — every documented top-level key is optional, so the empty object validates.
  // Asserts on the emitted SHAPE, never on message wording.
  test('emits exactly {} even when a checkpoint was archived', () => {
    writeFeatureFixture(tmpDir);
    const result = runHook({ cwd: tmpDir, payload: {} });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
    expect(Object.keys(JSON.parse(result.stdout))).toEqual([]);
  });

  test('with no active feature (no current.json), payload has no keys and no archive occurs', () => {
    const result = runHook({ cwd: tmpDir, payload: {} });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(Object.keys(payload).length).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, '.trd-state'))).toBe(false);
  });

  test('when disabled via env, payload has no keys and no archive occurs', () => {
    writeFeatureFixture(tmpDir);
    const result = runHook({
      cwd: tmpDir,
      payload: {},
      env: { ENSEMBLE_PRECOMPACT_DISABLE: '1' },
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(Object.keys(payload).length).toBe(0);
    const logPath = path.join(tmpDir, '.trd-state', 'test-feature', 'session-log.md');
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

describe('precompact.js still archives to session-log.md (must not regress the deliverable)', () => {
  test('appends a compaction checkpoint entry for the in-flight feature', () => {
    const { featureDir } = writeFeatureFixture(tmpDir);
    const result = runHook({ cwd: tmpDir, payload: {} });

    expect(result.status).toBe(0);

    const logPath = path.join(featureDir, 'session-log.md');
    expect(fs.existsSync(logPath)).toBe(true);

    const contents = fs.readFileSync(logPath, 'utf-8');
    expect(contents).toContain('## Compaction checkpoint');
    // Sanity: the archived entry actually reflects the fixture's in-flight task,
    // proving the archive path itself (not just file existence) still works.
    expect(contents).toContain('TRD-001');
  });

  test('a second PreCompact invocation appends rather than overwrites', () => {
    const { featureDir } = writeFeatureFixture(tmpDir);
    runHook({ cwd: tmpDir, payload: {} });
    runHook({ cwd: tmpDir, payload: {} });

    const logPath = path.join(featureDir, 'session-log.md');
    const contents = fs.readFileSync(logPath, 'utf-8');
    const occurrences = contents.split('## Compaction checkpoint').length - 1;
    expect(occurrences).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Ref fallback: ensure the folder from the local records ref; never create a one-file folder.
// ---------------------------------------------------------------------------------------------

describe('precompact.js and the records ref', () => {
  const { spawnSync: sp } = require('child_process');
  const recordRef = require('../lib/record-ref');
  const SLUG = 'ref-feature';
  const REF = `refs/ensemble/records/${SLUG}`;

  const gitEnv = () => {
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'FORGE_FEATURE_ID']) delete env[k];
    return env;
  };
  const git = (cwd, args) => sp('git', args, { cwd, encoding: 'utf8', env: gitEnv() });

  // tmpDir becomes a repo; optionally its records ref holds implement.json; folder removed.
  function setup({ withRef }) {
    git(tmpDir, ['init', '-q', '-b', 'main']);
    git(tmpDir, ['config', 'user.name', 'T']);
    git(tmpDir, ['config', 'user.email', 't@example.com']);
    git(tmpDir, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'x\n');
    git(tmpDir, ['add', 'README.md']);
    git(tmpDir, ['commit', '-q', '-m', 'init']);
    const folder = path.join(tmpDir, '.trd-state', SLUG);
    if (withRef) {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, 'implement.json'),
        JSON.stringify({ phase_cursor: 1, tasks: { 'TRD-001': { status: 'in_progress', description: 'Ref task' } } })
      );
      const saved = process.env.FORGE_FEATURE_ID;
      delete process.env.FORGE_FEATURE_ID;
      const w = recordRef.write({ stateDir: `.trd-state/${SLUG}`, command: 't', step: 'x', push: false, cwd: tmpDir });
      if (saved !== undefined) process.env.FORGE_FEATURE_ID = saved;
      expect(w.ok).toBe(true);
      fs.rmSync(folder, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(tmpDir, '.trd-state'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.trd-state', 'current.json'),
      JSON.stringify({ trd: `docs/TRD/${SLUG}.md`, status: `.trd-state/${SLUG}/implement.json` })
    );
    return folder;
  }

  test('(d) ref and no folder: the folder is restored and the checkpoint summarises the ref', () => {
    const folder = setup({ withRef: true });
    const r = runHook({ cwd: tmpDir, payload: {}, env: { FORGE_FEATURE_ID: '' } });
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(folder, 'implement.json'))).toBe(true);
    const log = fs.readFileSync(path.join(folder, 'session-log.md'), 'utf-8');
    expect(log).toContain('TRD-001');
    expect(log).toContain('Ref task');
  });

  test('(d3) ref owned by a different feature: nothing restored; checkpoint goes to _session-log.md', () => {
    const folder = setup({ withRef: true });
    git(tmpDir, ['checkout', '-q', '-b', 'other-feature']);
    const r = runHook({ cwd: tmpDir, payload: {}, env: { FORGE_FEATURE_ID: '' } });
    expect(r.status).toBe(0);
    expect(fs.existsSync(folder)).toBe(false);
    const log = fs.readFileSync(path.join(tmpDir, '.trd-state', '_session-log.md'), 'utf-8');
    expect(log).toContain('## Compaction checkpoint');
    expect(log).not.toContain('Ref task');
  });

  test('(d2) neither folder nor ref: the checkpoint lands in _session-log.md and no folder appears', () => {
    const folder = setup({ withRef: false });
    const r = runHook({ cwd: tmpDir, payload: {} });
    expect(r.status).toBe(0);
    expect(fs.existsSync(folder)).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, '.trd-state', '_session-log.md'), 'utf-8')).toContain(
      '## Compaction checkpoint'
    );
  });

  test('(d2) with the folder present the checkpoint stays in the feature session-log.md', () => {
    setup({ withRef: false });
    const folder = path.join(tmpDir, '.trd-state', SLUG);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'implement.json'), '{"tasks":{}}');
    runHook({ cwd: tmpDir, payload: {} });
    expect(fs.existsSync(path.join(folder, 'session-log.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.trd-state', '_session-log.md'))).toBe(false);
  });

  test('(c) local ref absent, origin holds it: no fetch', () => {
    setup({ withRef: true });
    const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-origin-'));
    try {
      git(origin, ['init', '-q', '--bare', '-b', 'main']);
      git(tmpDir, ['remote', 'add', 'origin', origin]);
      git(tmpDir, ['push', '-q', 'origin', `${REF}:${REF}`]);
      git(tmpDir, ['update-ref', '-d', REF]);
      runHook({ cwd: tmpDir, payload: {} });
      expect(git(tmpDir, ['rev-parse', '--verify', '-q', REF]).status).not.toBe(0);
      expect(fs.existsSync(path.join(tmpDir, '.trd-state', SLUG))).toBe(false);
    } finally {
      fs.rmSync(origin, { recursive: true, force: true });
    }
  });

  test('(e) exits 0 when git is not on PATH', () => {
    setup({ withRef: true });
    const r = runHook({ cwd: tmpDir, payload: {}, env: { PATH: '/nonexistent' } });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('{}');
  });
});

describe('precompact.js writes _session-log.md to the shared records ref', () => {
  const { execFileSync } = require('child_process');
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  // A real repo: mock-fs breaks real git (why status has its own test file).
  function initRepoWithNoFeature(cwd) {
    git(cwd, 'init', '-q', '-b', 'topic');
    git(cwd, 'config', 'user.email', 't@example.com');
    git(cwd, 'config', 'user.name', 't');
    fs.writeFileSync(path.join(cwd, 'README.md'), 'x\n');
    git(cwd, 'add', 'README.md');
    git(cwd, 'commit', '-q', '-m', 'init');
    fs.mkdirSync(path.join(cwd, '.trd-state'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.trd-state', 'current.json'), JSON.stringify({}));
  }

  test('with no feature in flight, the log lands on refs/ensemble/records/_shared without a branch commit', () => {
    initRepoWithNoFeature(tmpDir);
    const before = git(tmpDir, 'rev-parse', 'HEAD');
    const result = runHook({ cwd: tmpDir, payload: {} });
    expect(result.status).toBe(0);
    expect(git(tmpDir, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(tmpDir, 'log', '--oneline').split('\n')).toHaveLength(1);
    expect(git(tmpDir, 'rev-parse', '--verify', 'refs/ensemble/records/_shared')).toMatch(/^[0-9a-f]{40}$/);
    const files = git(tmpDir, 'ls-tree', '-r', '--name-only', 'refs/ensemble/records/_shared');
    expect(files).toContain('_session-log.md');
  });

  test('exits 0 and leaves HEAD alone when objects/ is unwritable (no remote, so nothing is fetched or pushed)', () => {
    initRepoWithNoFeature(tmpDir);
    const before = git(tmpDir, 'rev-parse', 'HEAD');
    const objects = path.join(tmpDir, '.git', 'objects');
    fs.chmodSync(objects, 0o555);
    try {
      const result = runHook({ cwd: tmpDir, payload: {} });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({});
    } finally {
      fs.chmodSync(objects, 0o755);
    }
    expect(git(tmpDir, 'rev-parse', 'HEAD')).toBe(before);
  });

  test('exits 0 when git is unavailable', () => {
    initRepoWithNoFeature(tmpDir);
    const result = runHook({ cwd: tmpDir, payload: {}, env: { PATH: '/nonexistent' } });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });
});
