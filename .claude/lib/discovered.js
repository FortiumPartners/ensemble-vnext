'use strict';

/**
 * discovered.js — the channel for work a run FINDS but was not asked to do.
 *
 * WHY THIS EXISTS
 *
 * `/implement-trd` computes its task graph once, before any agent runs
 * (`trd-parser.js` → `task-graph.js`), and `implement-phase.js` iterates a fixed
 * `waves` array. That is deliberate: the orchestrator owns the plan, and a task
 * set that mutates mid-dispatch is a task set nothing can reason about.
 *
 * But real implementation discovers things. An implementer hits a bug outside its
 * scope. A reviewer finds something non-trivial it will not guess a fix for.
 * `/audit-build` reports a traceability gap. Before this module, every one of those
 * went the same way: into a PHASE banner or a commit message, as prose, and died
 * there. The command had no channel for "this run found work it did not do", so the
 * only mechanism was a human reading a commit and remembering.
 *
 * This is that channel. Append-only JSONL beside the rest of the run's state, read
 * by the command at each phase boundary and again at completion.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does NOT add tasks to the running graph. A discovery lands as a RECORD, and
 * what happens next is the orchestrator's decision at a boundary — report it, or
 * write it into the TRD so the next `--resume` picks it up through the normal
 * parse→graph→dispatch path. Nothing here reaches into a dispatch that is already
 * in flight, and nothing here edits the TRD. Both of those belong to the command.
 *
 * The failure this shape avoids: a mid-flight task injection means the wave
 * partition, the file-conflict serialization and the phase gate were all computed
 * against a task set that no longer exists.
 */

const fs = require('fs');
const path = require('path');

/** Keep one appended line under PIPE_BUF (4096) so concurrent O_APPEND writes from
 *  parallel implementers cannot interleave. Same bound, same reason, as
 *  hooks/lib/dispatch-ledger.js. */
const MAX_LINE_BYTES = 2048;

const KINDS = ['bug', 'scope-conflict', 'stale-grounding', 'gap', 'risk'];

function ledgerPath(stateDir) {
  return path.join(stateDir, 'discovered.jsonl');
}

/**
 * Append one discovery. Returns true if written.
 *
 * Swallows its own errors: a run must never fail because it could not record a
 * side-finding. A lost discovery costs a note; a thrown error costs the phase.
 */
function record(stateDir, entry, nowIso) {
  if (!stateDir || !entry || !entry.summary) return false;
  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch {
    return false;
  }

  const row = {
    ts: nowIso || new Date().toISOString(),
    kind: KINDS.includes(entry.kind) ? entry.kind : 'gap',
    // Which task was running when this surfaced. The single most useful field for a
    // human triaging later, and the one an agent is most likely to omit.
    foundBy: String(entry.foundBy || 'unknown').slice(0, 60),
    phase: Number.isInteger(entry.phase) ? entry.phase : null,
    summary: String(entry.summary).slice(0, 400),
  };
  if (entry.file) row.file = String(entry.file).slice(0, 200);
  if (entry.evidence) row.evidence = String(entry.evidence).slice(0, 400);

  let line = JSON.stringify(row);
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
    delete row.evidence;
    line = JSON.stringify(row);
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      row.summary = row.summary.slice(0, 200);
      line = JSON.stringify(row);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return false;
    }
  }

  try {
    fs.appendFileSync(ledgerPath(stateDir), line + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read every discovery. A malformed line is skipped rather than throwing — a
 * truncated final line from a killed run must not blind the reader to the rest.
 */
function readAll(stateDir) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath(stateDir), 'utf-8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object' && row.summary) rows.push(row);
    } catch {
      /* skip */
    }
  }
  return rows;
}

/**
 * Render for a PHASE banner or the completion report.
 *
 * Returns '' when there is nothing — an empty section in a banner reads as "checked,
 * found none" when in fact nothing was recorded, and those are different claims.
 */
function render(stateDir, { phase = null } = {}) {
  const rows = readAll(stateDir).filter((r) => phase === null || r.phase === phase);
  if (rows.length === 0) return '';

  const byKind = {};
  for (const r of rows) (byKind[r.kind] = byKind[r.kind] || []).push(r);

  const lines = [`DISCOVERED — ${rows.length} item(s) this run found but did NOT do:`];
  for (const kind of KINDS) {
    for (const r of byKind[kind] || []) {
      const where = r.file ? ` (${r.file})` : '';
      lines.push(`  [${kind}] ${r.foundBy}${where}: ${r.summary}`);
    }
  }
  lines.push('  These are RECORDS, not tasks. To act on one, add it to the TRD and');
  lines.push('  re-run with --resume; the graph is rebuilt from the TRD every invocation.');
  return lines.join('\n');
}

module.exports = { record, readAll, render, ledgerPath, KINDS, MAX_LINE_BYTES };
