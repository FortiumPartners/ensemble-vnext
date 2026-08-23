#!/usr/bin/env node

/**
 * PreCompact Hook: archive a durable decision-trail checkpoint before compaction.
 *
 * When `/compact` runs (or auto-compaction triggers at ~95% context), the conversation
 * history is summarized — including the reasoning trail behind in-flight decisions. The
 * state files (`implement.json` / `verify.json`) record *what* happened, but not the
 * *why*. This hook appends a structured checkpoint to `.trd-state/<feature>/session-log.md`
 * capturing what can be derived deterministically — feature, phase, in-flight task, recent
 * transitions, retry context — so the post-compaction model has a place to re-anchor.
 *
 * Robust by design:
 *   - Always exits 0 (never blocks compaction).
 *   - No `current.json` present → no-op (no active feature to archive).
 *   - Malformed JSON / missing fields → debug log + skeleton entry.
 *   - Append is idempotent in the sense that we never rewrite history — each invocation
 *     adds a new entry.
 *
 * Environment variables:
 *   ENSEMBLE_PRECOMPACT_DISABLE=1   Skip entirely.
 *   PRECOMPACT_DEBUG=1              Log diagnostics to stderr.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./lib/resolve-project-root');

function debug(msg) {
  if (process.env.PRECOMPACT_DEBUG === '1') {
    const ts = new Date().toISOString();
    console.error(`[precompact ${ts}] ${msg}`);
  }
}

function emit() {
  console.log('{}');
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

/**
 * Derive a session-log path from the TRD path.
 *   docs/TRD/user-auth.md  →  .trd-state/user-auth/session-log.md
 * Falls back to .trd-state/_session-log.md when TRD basename can't be derived.
 */
function sessionLogPath(projectRoot, trdRelPath) {
  if (!trdRelPath || typeof trdRelPath !== 'string') {
    return path.join(projectRoot, '.trd-state', '_session-log.md');
  }
  const base = path.basename(trdRelPath, path.extname(trdRelPath));
  return path.join(projectRoot, '.trd-state', base, 'session-log.md');
}

/**
 * Pull a small set of facts from implement.json:
 *   - phase_cursor / current_phase
 *   - in-flight task id + description + cycle_position
 *   - retry context (if any task has retry_count > 0)
 *   - last N completed task ids (best-effort, by iteration order — JSON preserves insertion)
 */
function summarizeImplement(state) {
  if (!state || typeof state !== 'object') return null;
  const result = {
    phase: state.phase_cursor ?? state.current_phase ?? null,
    strategy: state.strategy ?? null,
    branch: state.branch ?? null,
    inFlight: [],
    retrying: [],
    recentlyCompleted: [],
  };
  const tasks = state.tasks && typeof state.tasks === 'object' ? state.tasks : {};
  const ids = Object.keys(tasks);

  for (const id of ids) {
    const t = tasks[id] || {};
    if (t.status === 'in_progress') {
      result.inFlight.push({
        id,
        cycle: t.cycle_position || null,
        description: t.description || '',
        currentProblem: t.current_problem || null,
      });
    }
    if (typeof t.retry_count === 'number' && t.retry_count > 0) {
      result.retrying.push({ id, retries: t.retry_count, problem: t.current_problem || null });
    }
  }

  // Best-effort "recent": last 5 success entries by iteration order. JSON spec doesn't
  // guarantee key order but V8 preserves insertion for string keys — good enough as a
  // weak signal of "what was just done."
  const completed = ids.filter((id) => tasks[id].status === 'success');
  result.recentlyCompleted = completed.slice(-5).map((id) => ({
    id,
    description: tasks[id].description || '',
  }));

  return result;
}

function formatCheckpoint({ timestamp, trigger, trd, prd, summary, transcriptPath }) {
  const lines = [];
  lines.push('');
  lines.push(`## Compaction checkpoint — ${timestamp}`);
  lines.push('');
  lines.push(`**Trigger:** ${trigger || 'unknown'}`);
  if (prd) lines.push(`**PRD:** ${prd}`);
  if (trd) lines.push(`**TRD:** ${trd}`);

  if (summary) {
    if (summary.phase !== null) lines.push(`**Phase:** ${summary.phase}`);
    if (summary.strategy) lines.push(`**Strategy:** ${summary.strategy}`);
    if (summary.branch) lines.push(`**Branch:** ${summary.branch}`);

    if (summary.inFlight && summary.inFlight.length) {
      lines.push('');
      lines.push('**In-flight tasks:**');
      for (const t of summary.inFlight) {
        const cyc = t.cycle ? ` [${t.cycle}]` : '';
        const desc = t.description ? ` — ${t.description}` : '';
        lines.push(`- \`${t.id}\`${cyc}${desc}`);
        if (t.currentProblem) {
          lines.push(`  - **Current problem:** ${t.currentProblem}`);
        }
      }
    }

    if (summary.retrying && summary.retrying.length) {
      lines.push('');
      lines.push('**Tasks in retry:**');
      for (const t of summary.retrying) {
        lines.push(`- \`${t.id}\` (retry ${t.retries})${t.problem ? ` — ${t.problem}` : ''}`);
      }
    }

    if (summary.recentlyCompleted && summary.recentlyCompleted.length) {
      lines.push('');
      lines.push('**Recently completed (last 5):**');
      for (const t of summary.recentlyCompleted) {
        lines.push(`- \`${t.id}\`${t.description ? ` — ${t.description}` : ''}`);
      }
    }
  }

  lines.push('');
  lines.push('**Decisions & rationale (model: fill on resume):**');
  lines.push('- _Why was the in-flight approach chosen? Anything tried and rejected? Open questions?_');
  lines.push('');
  if (transcriptPath) {
    lines.push(`**Transcript:** \`${transcriptPath}\``);
    lines.push('');
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  if (process.env.ENSEMBLE_PRECOMPACT_DISABLE === '1') {
    debug('disabled via env');
    return emit();
  }

  // Read stdin (hook input)
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf-8');
  } catch (err) {
    debug(`stdin read failed: ${err.message}`);
  }
  let hookData = {};
  if (raw) {
    try { hookData = JSON.parse(raw); } catch (err) {
      debug(`stdin parse failed: ${err.message}`);
    }
  }

  const projectRoot = resolveProjectRoot(hookData);
  debug(`project root: ${projectRoot}`);

  const currentPath = path.join(projectRoot, '.trd-state', 'current.json');
  if (!fs.existsSync(currentPath)) {
    debug('no current.json — nothing to archive');
    return emit();
  }

  const current = safeReadJson(currentPath);
  if (!current) {
    debug('current.json unreadable — skipping');
    return emit();
  }

  // Find implement.json. Two layouts in the wild:
  //   .trd-state/<feature>/implement.json   (per-feature directory)
  //   <current.status>                       (explicit path field, when set)
  let implementState = null;
  if (current.status && typeof current.status === 'string' && current.status.endsWith('.json')) {
    const absStatus = path.isAbsolute(current.status)
      ? current.status
      : path.join(projectRoot, current.status);
    implementState = safeReadJson(absStatus);
  }
  if (!implementState && current.trd) {
    const base = path.basename(current.trd, path.extname(current.trd));
    const guess = path.join(projectRoot, '.trd-state', base, 'implement.json');
    if (fs.existsSync(guess)) implementState = safeReadJson(guess);
  }

  const summary = summarizeImplement(implementState);
  const logPath = sessionLogPath(projectRoot, current.trd);
  const entry = formatCheckpoint({
    timestamp: new Date().toISOString(),
    trigger: hookData.trigger || (hookData.compaction_trigger) || 'compact',
    trd: current.trd || null,
    prd: current.prd || null,
    summary,
    transcriptPath: hookData.transcript_path || null,
  });

  try {
    ensureDirFor(logPath);
    fs.appendFileSync(logPath, entry, 'utf-8');
    debug(`appended checkpoint to ${logPath}`);
  } catch (err) {
    debug(`append failed: ${err.message}`);
    // Fall through — the hook must never block compaction.
  }

  // No model-facing nudge is emitted: PreCompact rejects `hookSpecificOutput`, and the
  // post-compaction "re-read session-log.md" instruction lives in implement-trd.md instead.
  return emit();
}

main();
