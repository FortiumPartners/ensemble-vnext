/**
 * dispatch-ledger.js (lib) — append-only record of subagent dispatches.
 *
 * WHY THIS EXISTS
 *
 * `.claude/rules/async-discipline.md` documents a scheduled-nudge pattern: the
 * orchestrator dispatches background subagents, schedules a wake, and on wake
 * nudges anything still running via `SendMessage`. The weak point is that on
 * wake the orchestrator has to REMEMBER what it dispatched — and that memory is
 * exactly what degrades across compaction, which is the case the pattern exists
 * to survive. A lead that has been compacted mid-loop cannot reliably enumerate
 * its own in-flight agents.
 *
 * This ledger moves that knowledge to disk, written by hooks that fire whether
 * or not the lead remembers anything.
 *
 * WHAT THE PLATFORM ACTUALLY PROVIDES (probed 2026-08-12, not taken from docs —
 * the hooks reference has been wrong or silent on every payload question this
 * project has asked of it):
 *
 *   SubagentStart payload keys:
 *     session_id, transcript_path, cwd, prompt_id, agent_id, agent_type,
 *     hook_event_name
 *
 *   SubagentStop payload keys:
 *     session_id, transcript_path, cwd, prompt_id, agent_id, agent_type,
 *     agent_transcript_path, last_assistant_message, background_tasks,
 *     session_crons, stop_hook_active, permission_mode, effort, hook_event_name
 *
 * Two consequences drove this design:
 *
 *   1. There is NO `name` field on either event. The `name` passed to
 *      `Agent({name: "probe-alpha"})` never reaches a hook. So the ledger keys
 *      on `agent_id`, which IS addressable: the lead renders agents as
 *      `probe-alpha (ae5ed58fc661530ad)` and `SendMessage` accepts an id or a
 *      name. `agent_id` is also the SAFER key — the CLI changelog records
 *      `SendMessage` misrouting when a re-spawned agent reused a previous
 *      agent's name, a collision an opaque id cannot have.
 *
 *   2. `agent_transcript_path` (SubagentStop only) is distinct from
 *      `transcript_path` (the lead's). It is how an orchestrator can inspect
 *      what a suspect agent actually did, so it is recorded.
 *
 * DERIVING THE OPEN SET
 *
 * The file is append-only JSONL; state is the LAST event per `agent_id`:
 *
 *   start   → running
 *   blocked → running  (see below)
 *   stop    → finished
 *
 * The `blocked` row is what makes this exact rather than approximate.
 * `subagent-discipline.js` can BLOCK a SubagentStop, which continues the same
 * subagent — so the `stop` row that fired alongside the block describes an
 * agent that did not, in fact, stop. Without a compensating row the ledger
 * would report a still-running agent as finished, and the orchestrator would
 * skip precisely the agent most likely to need a nudge. So the discipline hook
 * appends `blocked` after it blocks, reopening the row.
 *
 * CONCURRENCY
 *
 * Subagents start concurrently, so several hook processes append at once. Each
 * row is a single `appendFileSync` of one short line; with O_APPEND, writes
 * under PIPE_BUF (4096 bytes on Linux/macOS) do not interleave. Rows are kept
 * small deliberately, and `agent_transcript_path` — the only field that can get
 * long — is truncated to keep the line under that bound.
 *
 * FAILURE POSTURE
 *
 * Bookkeeping must never break a session. Every function here swallows its own
 * errors and degrades to a no-op or an empty result; a hook that cannot write
 * its ledger row still exits 0 and lets the subagent proceed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Keep a single appended line comfortably under PIPE_BUF (4096) so
 *  concurrent O_APPEND writes cannot interleave. */
const MAX_LINE_BYTES = 2048;

/** Rotate at 1 MB (~5k dispatches). Bounded without needing a reader/writer
 *  lock: rotation is a rename, and a lost row under a rotation race costs one
 *  ledger entry, not correctness of the session. */
const MAX_LEDGER_BYTES = 1024 * 1024;

/**
 * Resolve the ledger path for a project root.
 *
 * Mirrors precompact.js's convention: per-feature when `.trd-state/current.json`
 * names a TRD, and a shared fallback when it does not — subagent dispatches are
 * worth recording even outside an active feature (that is when an orchestrator
 * is most likely to be running ad-hoc fan-out).
 */
function ledgerPath(projectRoot) {
  const stateDir = path.join(projectRoot, '.trd-state');
  let feature = null;
  try {
    const current = JSON.parse(
      fs.readFileSync(path.join(stateDir, 'current.json'), 'utf-8')
    );
    const trd = current && current.trd;
    if (trd && typeof trd === 'string') {
      const base = path.basename(trd).replace(/\.md$/i, '');
      // Reject anything that isn't a plain name — current.json is
      // user/command-authored and must not be able to steer a write out of
      // .trd-state/ via "../" or an absolute path.
      if (base && base !== '.' && base !== '..' && !base.includes('/') && !base.includes('\\')) {
        feature = base;
      }
    }
  } catch {
    // absent or unreadable current.json → shared ledger
  }
  return feature
    ? path.join(stateDir, feature, 'dispatch.jsonl')
    : path.join(stateDir, '_dispatch.jsonl');
}

function rotateIfLarge(file) {
  try {
    if (fs.statSync(file).size > MAX_LEDGER_BYTES) {
      fs.renameSync(file, file + '.1');
    }
  } catch {
    // missing file, or a concurrent rotation won the race — either is fine
  }
}

/**
 * Append one event row. Returns true if written.
 *
 * `event` is one of "start" | "stop" | "blocked". Unknown values are still
 * written — a future event type should degrade to "recorded but not
 * interpreted" rather than be silently dropped.
 */
function appendEvent(projectRoot, event, fields, nowIso) {
  if (!projectRoot) return false;
  const file = ledgerPath(projectRoot);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    return false;
  }
  rotateIfLarge(file);

  const row = { ts: nowIso || new Date().toISOString(), event };
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null || v === '') continue;
    // Plain objects (currently only `extra`, the unrecognised-payload-keys bag)
    // are kept as structure. String(v) would render one "[object Object]" — a
    // row that looks populated and carries nothing, which is worse than an
    // absent field because it reads as data.
    if (typeof v === 'object' && !Array.isArray(v)) {
      if (Object.keys(v).length) row[k] = v;
      continue;
    }
    row[k] = typeof v === 'string' ? v : String(v);
  }

  let line = JSON.stringify(row);
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
    // agent_transcript_path is the only realistically-long field; drop it
    // rather than risk an interleaved partial line.
    delete row.agent_transcript_path;
    line = JSON.stringify(row);
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) return false;
  }

  try {
    fs.appendFileSync(file, line + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all rows (current file only; a rotated `.1` is history, not state).
 * Malformed lines are skipped rather than throwing — a truncated final line
 * from a killed process must not blind the reader to every row before it.
 */
function readRows(projectRoot) {
  try {
    const raw = fs.readFileSync(ledgerPath(projectRoot), 'utf-8');
    const rows = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row && typeof row === 'object' && row.agent_id) rows.push(row);
      } catch {
        // skip malformed line
      }
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Agents whose last recorded event is `start` or `blocked`, oldest dispatch
 * first — i.e. the ones an orchestrator should consider nudging, with the
 * longest-running at the top.
 *
 * `session_id` filters to the current session when provided; a shared ledger
 * accumulates rows across sessions and another session's agents are not this
 * orchestrator's to nudge.
 */
function openAgents(projectRoot, sessionId) {
  const last = new Map();
  const firstSeen = new Map();
  for (const row of readRows(projectRoot)) {
    if (sessionId && row.session_id && row.session_id !== sessionId) continue;
    last.set(row.agent_id, row);
    if (row.event === 'start' && !firstSeen.has(row.agent_id)) {
      firstSeen.set(row.agent_id, row.ts);
    }
  }
  const open = [];
  for (const [agentId, row] of last) {
    if (row.event === 'stop') continue;
    open.push({
      agent_id: agentId,
      agent_type: row.agent_type || null,
      // Carried so --open can name a workflow agent by what it DOES. Inside a
      // workflow every agent_type is "workflow-subagent", so without this the
      // open-set report cannot distinguish a task agent from a phase gate.
      label: row.label || null,
      started_at: firstSeen.get(agentId) || row.ts || null,
      last_event: row.event,
      last_event_at: row.ts || null,
      prompt_id: row.prompt_id || null,
      agent_transcript_path: row.agent_transcript_path || null,
    });
  }
  open.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  return open;
}

module.exports = {
  ledgerPath,
  appendEvent,
  readRows,
  openAgents,
  MAX_LINE_BYTES,
  MAX_LEDGER_BYTES,
};
