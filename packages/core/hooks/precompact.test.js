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
