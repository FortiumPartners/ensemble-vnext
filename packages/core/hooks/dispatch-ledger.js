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

  // Every agent dispatched INSIDE a workflow records agent_type
  // "workflow-subagent" — measured 2026-08-16 across three real /implement-trd
  // runs. So the ledger cannot tell a per-task agent from a per-phase gate
  // agent, which is exactly the question ITR-T002's acceptance criteria ask it
  // to answer ("measure agent invocations per task from dispatch.jsonl"). The
  // workflow sets opts.label ("task:MP-001" vs "gate:verify-app"); whether that
  // reaches a hook is unknown, and guessing a key name would produce a field
  // that is silently always undefined — the same defect class as a kill switch
  // no test exercises.
  //
  // So: capture any plausible label key that IS present, and record every other
  // unrecognised scalar under `extra`. The next real run then TELLS us the
  // payload shape instead of us asserting it. Values are truncated and bulk
  // keys skipped so a ledger row stays a row.
  const labelled = hookData.label || hookData.agent_name || hookData.name || hookData.description;
  if (labelled) fields.label = String(labelled).slice(0, 200);

  // `.trd-state/<feature>/dispatch.jsonl` is GIT-TRACKED. Anything that lands in
  // `extra` gets committed, so this list is a disclosure boundary, not tidiness.
  //
  // `last_assistant_message` is the dangerous one and it is present on SubagentStop
  // (this module's own probed-payload list says so, and the test fixture carries it).
  // It is a string, so without an explicit exclusion it falls straight through to
  // `extra` — meaning any subagent that closes by quoting a credential, a customer
  // record, or a file excerpt would have 200 bytes of it committed to the repo.
  // Excluded by name rather than by heuristic: a "does this look like a secret"
  // check is exactly the kind of filter that fails on the one payload that matters.
  const KNOWN = new Set([
    'hook_event_name', 'agent_id', 'agent_type', 'session_id', 'prompt_id',
    'agent_transcript_path', 'transcript_path', 'label', 'agent_name', 'name',
    'description', 'cwd', 'prompt', 'stop_hook_active', 'permission_mode',
    'last_assistant_message', 'background_tasks', 'session_crons', 'effort',
  ]);
  const MAX_EXTRA_KEYS = 12;   // bounded so an oversized row is never DROPPED whole
  const extra = {};
  for (const [k, v] of Object.entries(hookData)) {
    if (KNOWN.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;          // never inline nested payloads
    if (Object.keys(extra).length >= MAX_EXTRA_KEYS) break;
    extra[k] = String(v).slice(0, 200);
  }
  if (Object.keys(extra).length) fields.extra = extra;
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
    // Prefer the label when one was captured: inside a workflow every agent_type
    // is "workflow-subagent", so the type column alone cannot tell a task agent
    // from a phase-gate agent.
    const who = a.label ? `${a.label}` : `type=${a.agent_type || '?'}`;
    lines.push(`  ${a.agent_id}  ${who}  running=${age}${flag}`);
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
