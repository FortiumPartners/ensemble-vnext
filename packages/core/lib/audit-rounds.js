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
 *   decide      {stateDir?|rounds, verdict, defects, testGaps, uncovered, reportOnly}
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

/** Append one round as one JSONL line. Never rewrites earlier lines. */
function record(stateDir, round) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.appendFileSync(path.join(stateDir, LEDGER), JSON.stringify(round) + '\n');
}

/** Rounds since the last close (all rounds when never closed). Malformed lines are skipped. */
function readRounds(stateDir) {
  let text;
  try { text = fs.readFileSync(path.join(stateDir, LEDGER), 'utf8'); } catch { return []; }
  let closedAt = null;
  try {
    closedAt = JSON.parse(fs.readFileSync(path.join(stateDir, 'closed.json'), 'utf8')).closedAt || null;
  } catch { /* never closed */ }
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
function decide({ rounds = [], verdict, defects = 0, testGaps = 0, uncovered = 0, reportOnly = false } = {}) {
  const out = { chain: false, reaudit: false, close: false, capReached: false, caveats: [] };
  if (reportOnly) return out;
  const used = Math.max(0, rounds.length - 1);
  const handoff = defects + testGaps > 0;
  out.chain = handoff;
  if (uncovered > 0) return out; // those stop for design; feature stays open
  if (verdict === 'do not proceed' && !handoff) return out;
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
  const rounds = input.rounds || (input.stateDir ? readRounds(input.stateDir) : []);
  switch (cmd) {
    case 'decide': return decide({ ...input, rounds });
    case 'classify': return { class: classify(input) };
    case 'stale-wake': return { stale: staleWake({ ...input, rounds }) };
    case 'record':
      if (!input.stateDir || !input.round) throw new Error('record needs stateDir and round');
      record(input.stateDir, input.round);
      return { ok: true };
    default: throw new Error('usage: audit-rounds.js decide|classify|stale-wake|record [json]');
  }
}

module.exports = { classify, record, readRounds, decide, staleWake, NOT_REAUDITED };

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n');
  } catch (e) {
    process.stderr.write(`audit-rounds: ${e.message}\n`);
    process.exit(1);
  }
}
