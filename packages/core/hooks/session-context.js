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

function lastCheckpointSummary(state) {
  if (!state || !Array.isArray(state.checkpoints) || state.checkpoints.length === 0) {
    return null;
  }
  const last = state.checkpoints[state.checkpoints.length - 1];
  const commit = last.commit ? last.commit.slice(0, 8) : '?';
  return `${commit}${last.timestamp ? ' @ ' + last.timestamp : ''}`;
}

async function main(hookData) {
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

  // If the pointer references a state file (implement/verify/harden), summarize it
  if (current.status) {
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

// Stdin handling
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

// Exports for testing
module.exports = {
  main,
  summarizeImplementState,
  summarizeVerifyState,
  lastCheckpointSummary,
};
