#!/usr/bin/env node

/**
 * SessionStart Hook: inject in-flight ensemble feature context.
 *
 * On session start, looks for `.trd-state/current.json` and surfaces a brief about the
 * in-flight feature (PRD path, TRD path + phase/task progress or verify assertions, branch,
 * last checkpoint commit). Removes the friction of "remind me what we're working on" at the
 * start of every session.
 *
 * Robust by design:
 *   - Always exits 0 (never blocks a session).
 *   - No current.json present → empty context (no-op).
 *   - Malformed JSON / missing fields → debug log + empty context.
 *   - State file inside .trd-state/* missing → still surfaces top-level current.json fields.
 *
 * Environment variables:
 *   ENSEMBLE_SESSION_CONTEXT_DISABLE=1  Skip injection entirely.
 *   SESSION_CONTEXT_DEBUG=1             Log diagnostics to stderr.
 *
 * Output (always JSON to stdout):
 *   {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./lib/resolve-project-root');

function debug(msg) {
  if (process.env.SESSION_CONTEXT_DEBUG === '1') {
    const ts = new Date().toISOString();
    console.error(`[session-context ${ts}] ${msg}`);
  }
}

function emit(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: additionalContext || '',
    },
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (err) {
    debug(`could not read/parse ${p}: ${err.message}`);
    return null;
  }
}

function summarizeImplementState(state) {
  if (!state || !state.tasks) return null;
  const ids = Object.keys(state.tasks);
  const total = ids.length;
  if (total === 0) return null;
  const tasks = ids.map((id) => ({ id, ...state.tasks[id] }));
  const done = tasks.filter((t) => t.status === 'success' || t.status === 'complete').length;
  const inProgress = tasks.find((t) => t.status === 'in_progress');
  const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked').length;

  const parts = [`${done}/${total} tasks complete`];
  if (failed) parts.push(`${failed} failed/blocked`);
  if (inProgress) {
    parts.push(`in-progress: ${inProgress.id} (${inProgress.cycle_position || 'implement'})`);
  }
  if (typeof state.phase_cursor === 'number') parts.push(`phase cursor ${state.phase_cursor}`);
  return parts.join('; ');
}

function summarizeVerifyState(state) {
  if (!state || !state.assertions) return null;
  const ids = Object.keys(state.assertions);
  const total = ids.length;
  if (total === 0) return null;
  const verdicts = ids.map((id) => state.assertions[id].verdict);
  const pass = verdicts.filter((v) => v === 'pass').length;
  const fail = verdicts.filter((v) => v === 'fail').length;
  const blocked = verdicts.filter((v) => v === 'blocked').length;
  const pending = verdicts.filter((v) => v === 'pending').length;

  const parts = [`${pass}/${total} assertions pass`];
  if (fail) parts.push(`${fail} fail`);
  if (blocked) parts.push(`${blocked} blocked`);
  if (pending) parts.push(`${pending} pending`);
  if (state.run_counter != null) {
    parts.push(`run ${state.run_counter}/${state.max_runs || '?'}`);
  }
  return parts.join('; ');
}

/**
 * Return the "Closed:" banner line for a feature whose close record exists, or
 * `null` when there is no `closed.json` for it (§3.4 of docs/TRD/feature-close-out.md).
 *
 * Presence alone means closed (D5) — even a record that fails to parse, or that is
 * missing the fields this reads, still returns the "unreadable" line rather than
 * falling through to the ordinary Impl:/Verify: tally, because that tally would
 * describe a feature the owner already closed.
 *
 * @param {string} root - project root (as resolved by resolveProjectRoot).
 * @param {string} feature - TRD basename without extension.
 * @returns {string|null} the line to push onto the banner, or null if not closed.
 */
function closedFeatureLine(root, feature) {
  const closedPath = path.join(root, '.trd-state', feature, 'closed.json');
  if (!fs.existsSync(closedPath)) return null;

  const unreadable = `  Closed: record unreadable (.trd-state/${feature}/closed.json)`;
  const record = safeReadJson(closedPath);
  if (!record || typeof record !== 'object') return unreadable;

  const date = typeof record.closedAt === 'string' ? record.closedAt.slice(0, 10) : null;
  if (!date) return unreadable;

  // Checked first: an abandoned record always also carries acceptedReason, and the
  // abandoned wording takes priority over the generic "accepted unfinished" wording.
  if (record.abandoned) {
    // acceptedReason is always set by /close-feature, but the record is hand-deletable
    // and hand-editable; never print the literal "undefined" into the banner.
    const reason = record.acceptedReason ? `: ${record.acceptedReason}` : '';
    return `  Closed: ${date} — abandoned, never implemented${reason}`;
  }

  if (record.acceptedReason) {
    const unfinished = Array.isArray(record.unfinished) ? record.unfinished.length : 0;
    const total =
      record.tasks && typeof record.tasks === 'object'
        ? Object.values(record.tasks).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
        : 0;
    return `  Closed: ${date} — not done; closed with ${unfinished} of ${total} tasks accepted unfinished: ${record.acceptedReason}`;
  }

  if (typeof record.verdict !== 'string') return unreadable;

  if (record.verdict === 'done-with-gaps') {
    const gaps = Array.isArray(record.outstanding) ? record.outstanding.length : 0;
    return `  Closed: ${date} — ${record.verdict} (${gaps} gap${gaps === 1 ? '' : 's'})`;
  }

  return `  Closed: ${date} — ${record.verdict}`;
}

function lastCheckpointSummary(state) {
  if (!state || !Array.isArray(state.checkpoints) || state.checkpoints.length === 0) {
    return null;
  }
  const last = state.checkpoints[state.checkpoints.length - 1];
  const commit = last.commit ? last.commit.slice(0, 8) : '?';
  return `${commit}${last.timestamp ? ' @ ' + last.timestamp : ''}`;
}

async function main(hookData) {
  // Persist the Claude Code session ID into CLAUDE_ENV_FILE so it's available
  // to every Bash tool invocation in this session (the NOTIFY_ON_COMPLETE
  // notify-complete.sh helper reads it as $CLAUDE_SESSION_ID for cross-session
  // attribution). CLAUDE_ENV_FILE is set ONLY in SessionStart hooks; append
  // (don't clobber) so other SessionStart hooks' exports coexist.
  // Runs UNCONDITIONALLY — before disable-env / project-root / current.json
  // checks — because the session ID is useful for notifications even in
  // projects with no .trd-state.
  try {
    const envFile = process.env.CLAUDE_ENV_FILE;
    const sid = (hookData && (hookData.session_id || hookData.sessionId)) || '';
    if (envFile && sid) {
      // Sanitize: session_id is a UUID-ish string; reject anything containing
      // shell-meaningful characters to prevent injection into the env file.
      if (/^[A-Za-z0-9_.\-]+$/.test(sid)) {
        fs.appendFileSync(envFile, `export CLAUDE_SESSION_ID=${sid}\n`);
        debug(`exported CLAUDE_SESSION_ID=${sid} to CLAUDE_ENV_FILE`);
      } else {
        debug(`session_id rejected for env-file export (suspicious chars): ${sid}`);
      }
    }
  } catch (err) {
    debug(`could not export CLAUDE_SESSION_ID: ${err.message}`);
    // Non-fatal; the notify pattern handles missing CLAUDE_SESSION_ID gracefully.
  }

  if (process.env.ENSEMBLE_SESSION_CONTEXT_DISABLE === '1') {
    debug('disabled via ENSEMBLE_SESSION_CONTEXT_DISABLE=1');
    emit('');
    return;
  }

  const root = resolveProjectRoot(hookData);
  debug(`project root resolved to: ${root}`);

  const currentPath = path.join(root, '.trd-state', 'current.json');
  if (!fs.existsSync(currentPath)) {
    debug('no .trd-state/current.json — emitting empty context');
    emit('');
    return;
  }

  const current = safeReadJson(currentPath);
  if (!current || typeof current !== 'object') {
    emit('');
    return;
  }

  const lines = ['ENSEMBLE — in-flight feature context (auto-loaded from .trd-state/current.json):'];
  if (current.prd) lines.push(`  PRD:    ${current.prd}`);
  if (current.trd) lines.push(`  TRD:    ${current.trd}`);
  if (current.branch) lines.push(`  Branch: ${current.branch}`);

  // A closed feature (D5/D10) replaces the task tally with one Closed: line rather
  // than presenting alongside it — the tally describes work the owner already closed.
  const feature = current.trd ? path.basename(current.trd, path.extname(current.trd)) : null;
  const closedLine = feature ? closedFeatureLine(root, feature) : null;

  if (closedLine) {
    lines.push(closedLine);
  } else if (current.status) {
    // If the pointer references a state file (implement.json; verify/harden are legacy
    // shapes from the retired team commands), summarize it
    const statusPath = path.join(root, current.status);
    const state = safeReadJson(statusPath);
    if (state) {
      const fileName = path.basename(statusPath);
      const mode = state.mode || '';
      // Verify state has assertions; implement/harden have tasks
      if (fileName === 'verify.json' || mode === 'verify') {
        const s = summarizeVerifyState(state);
        if (s) lines.push(`  Verify: ${s}`);
      } else {
        const s = summarizeImplementState(state);
        if (s) {
          const label = fileName === 'harden.json' || mode === 'harden' ? 'Harden' : 'Impl';
          lines.push(`  ${label}:   ${s}`);
        }
      }
      const cp = lastCheckpointSummary(state);
      if (cp) lines.push(`  Last checkpoint: ${cp}`);
      if (state.strategy) lines.push(`  Strategy: ${state.strategy}`);
    } else {
      debug(`status file not readable: ${statusPath}`);
    }
  }

  if (lines.length === 1) {
    // Only the header — current.json had no useful fields. Skip rather than noise.
    debug('current.json present but no useful fields; emitting empty context');
    emit('');
    return;
  }

  lines.push('');
  lines.push('Use this context to skip "what are we working on?" — it is here.');

  emit(lines.join('\n'));
}

// Stdin handling — guarded by `require.main === module` so that requiring this file
// (as session-context.test.js does, to call the exported `main` in-process) never
// also attaches these listeners. Without the guard, `main()` fires a second,
// uncontrolled time whenever this process's stdin reaches 'end' — and since `emit()`
// ends in `process.exit(0)`, that second firing can tear down the whole Jest worker
// mid-run. `status.js` and `dispatch-ledger.js` hit exactly this (status.js:376-387,
// dispatch-ledger.js:182) and carry the same guard for the same reason.
if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    inputData += chunk;
  });
  process.stdin.on('end', async () => {
    try {
      const hookData = inputData.trim() ? JSON.parse(inputData) : {};
      await main(hookData);
    } catch (err) {
      debug(`fatal: ${err.message}`);
      emit('');
    }
  });
  process.stdin.on('error', (err) => {
    debug(`stdin error: ${err.message}`);
    emit('');
  });
}

// Exports for testing
module.exports = {
  main,
  summarizeImplementState,
  summarizeVerifyState,
  lastCheckpointSummary,
  closedFeatureLine,
};
