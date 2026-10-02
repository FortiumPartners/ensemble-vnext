'use strict';
/**
 * audit-rounds.js — the round ledger for /audit-build, and the deterministic decision of
 * whether to chain a fix run, re-audit, or close.
 *
 * WHY THIS EXISTS. The rule that let one audit loop run six rounds lived in prose that read
 * sensibly paragraph by paragraph. Like fix-plan.js's plan(), decide() owns it as code with tests.
 *
 * The cap counts RE-AUDITS AFTER DEFECTS: one first audit plus at most two re-audits, so at most
 * three audit runs per feature, counted since the feature was last closed (closed.json).
 *
 * `rounds` passed to decide() INCLUDES the round just recorded (the command records, then
 * decides), so "re-audits used" = rounds.length - 1.
 *
 * CLI (JSON in on stdin or as argv[3], JSON out):
 *   tally       {handoff}  -> {defects, testGaps, uncovered}
 *   decide      {stateDir?|rounds, verdict, defects, testGaps, uncovered, reportOnly}
 *               (or {..., handoff} in place of the three counts)
 *   classify    {action, check}
 *   stale-wake  {stateDir?|rounds, runId, head}
 *   record      {stateDir, round}
 */
const fs = require('fs');
const path = require('path');

const LEDGER = 'audit-rounds.jsonl';
const MAX_REAUDITS = 2;
const NOT_REAUDITED = 'these defect fixes were not re-audited';

/**
 * Class of a finding, a pure function of what the verifier said.
 * @returns {'defect'|'test-gap'|'other'}
 */
function classify({ action, check } = {}) {
  if (action === 'gap-unbuilt') return 'defect';
  if (action === 'mismatch' && check !== 'citation' && check !== 'consistency') return 'defect';
  if (action === 'gap-untested' || action === 'untested') return 'test-gap';
  return 'other';
}

/**
 * Count a reconcile handoff. Uncovered items (no covering task) stop for design and are never
 * handed to the fix run, so they count ONLY as uncovered -- never as defects or test gaps, or
 * a run with nothing but uncovered items would chain an empty fix run.
 */
function tally(handoff = []) {
  const out = { defects: 0, testGaps: 0, uncovered: 0 };
  for (const item of Array.isArray(handoff) ? handoff : []) {
    if (!item) continue;
    if (item.covered === false) { out.uncovered += 1; continue; }
    const cls = classify(item);
    if (cls === 'defect') out.defects += 1;
    else if (cls === 'test-gap') out.testGaps += 1;
  }
  return out;
}

/**
 * Append one round as one JSONL line. Never rewrites earlier lines. A missing or unparseable
 * `ts` is stamped now: readRounds() drops a round whose ts it cannot compare with a close, and
 * a dropped round would never count toward the cap.
 */
function record(stateDir, round) {
  const line = { ...round };
  if (Number.isNaN(Date.parse(line.ts))) line.ts = new Date().toISOString();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.appendFileSync(path.join(stateDir, LEDGER), JSON.stringify(line) + '\n');
}

/**
 * Rounds since the last close (all rounds when never closed). Malformed lines are skipped.
 * `{ all: true }` ignores the close: stale-wake needs it, because an audit that closed the
 * feature wrote its round BEFORE the close, and a since-close read would hide that round.
 */
function readRounds(stateDir, { all = false } = {}) {
  let text;
  try { text = fs.readFileSync(path.join(stateDir, LEDGER), 'utf8'); } catch { return []; }
  let closedAt = null;
  try {
    closedAt = JSON.parse(fs.readFileSync(path.join(stateDir, 'closed.json'), 'utf8')).closedAt || null;
  } catch { /* never closed */ }
  if (all) closedAt = null;
  const closedMs = closedAt ? Date.parse(closedAt) : NaN;
  const rounds = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!Number.isNaN(closedMs)) {
      const t = Date.parse(r.ts);
      if (!(t > closedMs)) continue;
    }
    rounds.push(r);
  }
  return rounds;
}

/**
 * @returns {{chain:boolean, reaudit:boolean, close:boolean, capReached:boolean, caveats:string[]}}
 */
/** True for the VERDICT line's "do not proceed until <named>" form, however it was passed. */
function isDoNotProceed(verdict) {
  return String(verdict || '').replace(/^\s*VERDICT:\s*/i, '').trim().toLowerCase().startsWith('do not proceed');
}

function decide({ rounds = [], verdict, defects = 0, testGaps = 0, uncovered = 0, reportOnly = false } = {}) {
  const out = { chain: false, reaudit: false, close: false, capReached: false, caveats: [] };
  if (reportOnly) return out;
  const used = Math.max(0, rounds.length - 1);
  const handoff = defects + testGaps > 0;
  out.chain = handoff;
  if (uncovered > 0) return out; // those stop for design; feature stays open
  // "do not proceed" never closes on its own: with no defects it stays open (test gaps, if
  // any, still chain); with defects it falls through to re-audit or the cap.
  if (isDoNotProceed(verdict) && defects === 0) return out;
  if (defects === 0) { out.close = true; return out; }
  if (used < MAX_REAUDITS) { out.reaudit = true; return out; }
  out.close = true;
  out.capReached = true;
  out.caveats.push(NOT_REAUDITED);
  return out;
}

/** True when a wake-up has nothing to do: this run already recorded, or nothing changed. */
function staleWake({ rounds = [], runId, head } = {}) {
  if (runId && rounds.some((r) => r.runId === runId)) return true;
  const last = rounds[rounds.length - 1];
  return Boolean(last && head && last.auditedCommit === head);
}

function cli(argv) {
  const [cmd, arg] = argv;
  let input = {};
  const raw = arg !== undefined ? arg : fs.readFileSync(0, 'utf8');
  if (raw && raw.trim()) input = JSON.parse(raw);
  const ledger = (opts) => input.rounds || (input.stateDir ? readRounds(input.stateDir, opts) : []);
  switch (cmd) {
    case 'tally': return tally(input.handoff);
    case 'decide': return decide({ ...input, ...(input.handoff ? tally(input.handoff) : {}), rounds: ledger() });
    case 'classify': return { class: classify(input) };
    case 'stale-wake': return { stale: staleWake({ ...input, rounds: ledger({ all: true }) }) };
    case 'record':
      if (!input.stateDir || !input.round) throw new Error('record needs stateDir and round');
      record(input.stateDir, input.round);
      return { ok: true };
    default: throw new Error('usage: audit-rounds.js tally|decide|classify|stale-wake|record [json]');
  }
}

module.exports = { classify, tally, record, readRounds, decide, isDoNotProceed, staleWake, NOT_REAUDITED };

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n');
  } catch (e) {
    process.stderr.write(`audit-rounds: ${e.message}\n`);
    process.exit(1);
  }
}
