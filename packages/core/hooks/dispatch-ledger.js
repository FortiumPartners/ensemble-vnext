#!/usr/bin/env node

/**
 * dispatch-ledger.js — records subagent dispatch/completion to a durable
 * append-only ledger, and reports the still-open set on demand.
 *
 * Registered on TWO events (the only hook in the set that is):
 *   SubagentStart — order 1, writes the "start" row
 *   SubagentStop  — order 3, writes the "stop" row (after status.js advances
 *                   state and subagent-discipline.js decides whether to block;
 *                   when it does block, IT appends the compensating "blocked"
 *                   row, so this hook does not need to know about blocking)
 *
 * Also runnable directly by an orchestrator, which is the point of the whole
 * thing:
 *
 *     node .claude/hooks/dispatch-ledger.js --open [--session <id>] [--json]
 *
 * prints the subagents whose last recorded event is not "stop", oldest first.
 *
 * WHY A HOOK AND NOT JUST THE MODEL TRACKING IT
 *
 * The orchestrator cannot schedule its own wake from a hook — hooks are
 * separate processes with no tool surface, and `SubagentStart` is command-type
 * only (a prompt-type hook there is rejected outright), so there is no path by
 * which a hook creates a cron. The lead must still call `ScheduleWakeup`
 * itself. What the hook CAN do is make that wake useful: on re-entry the lead
 * reads this ledger instead of trying to recall a dispatch list that may have
 * been summarized away.
 *
 * See lib/dispatch-ledger.js for the probed payload shapes and the reasoning
 * behind keying on `agent_id` rather than the (unavailable) agent name.
 *
 * Never blocks, never fails a session: always exits 0, always prints
 * {"continue": true} in hook mode.
 */

'use strict';

const { resolveProjectRoot } = require('./lib/resolve-project-root');
const ledger = require('./lib/dispatch-ledger');

// Read at CALL time, not module-load time. A kill switch latched at import is
// one that cannot be exercised by a test — and an untested kill switch is the
// same defect class as the --check flag that silently always passed.
function isDisabled() {
  return process.env.ENSEMBLE_DISPATCH_LEDGER_DISABLE === '1';
}

function debug(msg) {
  if (process.env.ENSEMBLE_DISPATCH_LEDGER_DEBUG === '1') {
    process.stderr.write(`[dispatch-ledger] ${msg}\n`);
  }
}

function emit() {
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}

/** Hook entry point. Returns the row written (or null) for testability. */
function main(hookData) {
  if (isDisabled()) {
    debug('disabled via ENSEMBLE_DISPATCH_LEDGER_DISABLE');
    return null;
  }

  const event = hookData && hookData.hook_event_name;
  const agentId = hookData && hookData.agent_id;

  // agent_id is the ledger's key. Without it a row is unjoinable and would
  // only add noise, so skip rather than write a partial record.
  if (!agentId) {
    debug(`no agent_id on ${event || 'unknown event'} — skipping`);
    return null;
  }

  let kind;
  if (event === 'SubagentStart') kind = 'start';
  else if (event === 'SubagentStop') kind = 'stop';
  else {
    debug(`unexpected hook_event_name=${event} — skipping`);
    return null;
  }

  const projectRoot = resolveProjectRoot(hookData);
  if (!projectRoot) {
    debug('could not resolve project root — skipping');
    return null;
  }

  const fields = {
    agent_id: agentId,
    agent_type: hookData.agent_type,
    session_id: hookData.session_id,
    prompt_id: hookData.prompt_id,
  };
  // SubagentStop only — how to inspect what a suspect agent actually did.
  if (kind === 'stop') fields.agent_transcript_path = hookData.agent_transcript_path;

  const ok = ledger.appendEvent(projectRoot, kind, fields);
  debug(`${ok ? 'wrote' : 'FAILED to write'} ${kind} row for ${agentId} (${hookData.agent_type || 'unknown type'})`);
  return ok ? { event: kind, agent_id: agentId } : null;
}

/** `--open` reporting mode. Returns the formatted text. */
function reportOpen(argv, cwd) {
  const sessionIdx = argv.indexOf('--session');
  const sessionId = sessionIdx !== -1 ? argv[sessionIdx + 1] : null;
  const asJson = argv.includes('--json');

  const projectRoot = resolveProjectRoot({ cwd: cwd || process.cwd() });
  if (!projectRoot) return asJson ? '[]' : 'No project root found.';

  const open = ledger.openAgents(projectRoot, sessionId);
  if (asJson) return JSON.stringify(open, null, 2);

  if (open.length === 0) return 'No subagents currently open.';

  const now = Date.now();
  const lines = [`${open.length} subagent(s) still open (oldest first):`];
  for (const a of open) {
    const started = Date.parse(a.started_at);
    const age = Number.isNaN(started)
      ? 'unknown'
      : `${Math.round((now - started) / 1000)}s`;
    const flag = a.last_event === 'blocked' ? ' [resumed after discipline block]' : '';
    lines.push(`  ${a.agent_id}  type=${a.agent_type || '?'}  running=${age}${flag}`);
  }
  lines.push('');
  lines.push('Nudge one with: SendMessage({to: "<agent_id>", message: "status check — what have you completed and what is blocking you?"})');
  return lines.join('\n');
}

if (require.main === module) {
  if (process.argv.includes('--open')) {
    process.stdout.write(reportOpen(process.argv.slice(2)) + '\n');
    process.exit(0);
  }

  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', () => {
    try {
      main(inputData.trim() ? JSON.parse(inputData) : {});
    } catch (err) {
      debug(`fatal: ${err.message}`);
    }
    emit();
  });
  process.stdin.on('error', (err) => {
    debug(`stdin error: ${err.message}`);
    emit();
  });
}

module.exports = { main, reportOpen };
