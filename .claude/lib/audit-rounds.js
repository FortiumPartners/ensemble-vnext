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
 *   tally       {handoff, deferred?, index?} -> {defects, testGaps, uncovered, notes, deferred}
 *   decide      {stateDir?|rounds, verdict, defects, testGaps, uncovered, reportOnly,
 *               deferred?, index?} (or {..., handoff, deferred?, index?} in place of the
 *               counts; notes and deferred items never count, so only they remaining closes).
 *               With counts, deferred and index are accepted and ignored: the counts already
 *               came from tally, which applied them. With a handoff they go to tally.
 *   classify    {id?, action, check, deferred?, index?} -> {class: defect|test-gap|note|deferred|other}
 *               deferred: task ids; index: {requirements: [{id, served_by}]} (or keyed by id)
 *   stale-wake  {stateDir?|rounds, runId}
 *   record      {stateDir, round}
 *   trd-hash    {trd}      -> {trdHash}
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeLineEndings, maskFencedLines, findSection } = require('./trd-parser');

const LEDGER = 'audit-rounds.jsonl';
const MAX_REAUDITS = 2;

/**
 * The task ids that serve requirement `id` in `index.requirements`, or null when the index does
 * not list it. Accepts an array of {id, served_by} or an object keyed by requirement id.
 */
function servedBy(index, id) {
  const reqs = index && index.requirements;
  if (!reqs || id === undefined) return null;
  const req = Array.isArray(reqs) ? reqs.find((r) => r && r.id === id) : reqs[id];
  return req && Array.isArray(req.served_by) ? req.served_by : null;
}

/**
 * True when the item's id is a deferred task, or a requirement served ONLY by deferred tasks.
 * `deferred` may be bare ids or the parser's {id, why} entries: the command passes the same list
 * to the workflow and here, and a Set of objects would match nothing, silently.
 */
function isDeferredId(id, { deferred = [], index } = {}) {
  const ids = (Array.isArray(deferred) ? deferred : []).map((d) => (d && typeof d === 'object' ? d.id : d));
  const set = new Set(ids.filter((d) => typeof d === 'string' && d));
  if (id === undefined || !set.size) return false;
  if (set.has(id)) return true;
  const servers = servedBy(index, id);
  return Boolean(servers && servers.length > 0 && servers.every((t) => set.has(t)));
}

/**
 * Class of a finding, a pure function of what the verifier said and which tasks are deferred.
 * A deferred task is "not built yet" by design, so only the GAP actions on it are reclassified;
 * a mismatch on a deferred id is code that exists and is wrong, so it stays a defect.
 * @param {{id?:string, action?:string, check?:string}} item
 * @param {{deferred?:string[], index?:object}} [ctx]
 * @returns {'defect'|'test-gap'|'note'|'deferred'|'other'}
 */
function classify({ id, action, check } = {}, ctx = {}) {
  // A citation already fixed in place, or a gap on a task deferred by design, is not work for
  // the fix run whatever check reported it -- test-quality included, or a deferred task (which
  // has no tests by design) would be chained to the fix run as a test gap.
  if (action === 'fix-citation') return 'note';
  const gap = action === 'gap-unbuilt' || action === 'gap-untested' || action === 'untested';
  if (gap && isDeferredId(id, ctx)) return 'deferred';
  // Tests are not the product: a test-quality finding is a test gap whatever its action. A weak
  // test that masks a real defect is reported by its own check (verification/traceability).
  if (check === 'test-quality') return 'test-gap';
  if (action === 'gap-unbuilt') return 'defect';
  if (action === 'mismatch') return check === 'citation' || check === 'consistency' ? 'note' : 'defect';
  if (action === 'gap-untested' || action === 'untested') return 'test-gap';
  return 'other';
}

/**
 * Count a reconcile handoff. Uncovered items (no covering task) stop for design and are never
 * handed to the fix run, so they count ONLY as uncovered -- never as defects or test gaps, or
 * a run with nothing but uncovered items would chain an empty fix run. Notes and deferred items
 * are counted for the report but never toward defects/testGaps, so decide() can close on them.
 */
function tally(handoff = [], ctx = {}) {
  const out = { defects: 0, testGaps: 0, uncovered: 0, notes: 0, deferred: 0 };
  for (const item of Array.isArray(handoff) ? handoff : []) {
    if (!item) continue;
    // A fixed citation is already done: no task covers a descriptive sentence, so the agent may
    // well mark it covered:false, and counting it uncovered would hold the feature open forever.
    if (item.covered === false && item.action !== 'fix-citation') { out.uncovered += 1; continue; }
    const cls = classify(item, ctx);
    if (cls === 'defect') out.defects += 1;
    else if (cls === 'test-gap') out.testGaps += 1;
    else if (cls === 'note') out.notes += 1;
    else if (cls === 'deferred') out.deferred += 1;
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

// deferred/index may be passed (audit-build.md passes them on every call); decide ignores them
// because its counts come from tally, which already applied both.
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
  // At the cap with defects open: they still go to the fix run, but the feature never closes
  // (not even with a caveat) and no further re-audit runs; what happens next is the owner's call.
  out.capReached = true;
  return out;
}

/**
 * True when a wake-up has nothing to do: this run id already recorded. Run id only -- a same-commit
 * rule could silence a new audit still in progress at an unchanged commit.
 */
function staleWake({ rounds = [], runId } = {}) {
  return Boolean(runId && rounds.some((r) => r.runId === runId));
}

/**
 * The TRD hash that decides whether a re-audit may reuse the previous requirement list: sha256
 * over ONLY the Objectives and Master Task List sections, so promoted rows and a rewritten
 * Could Not Verify section do not defeat reuse. Sections are found the way trd-parser finds
 * them -- loose heading match (so "## 4. Master Task List" counts), fenced examples ignored.
 * When NEITHER section exists the whole text is hashed: hashing two empty strings would give
 * every edit of such a TRD the same hash and reuse a stale requirement list forever.
 */
function trdHash(text) {
  const lines = normalizeLineEndings(String(text || '')).split('\n');
  const masked = maskFencedLines(lines);
  const parts = ['Objectives', 'Master Task List']
    .map((phrase) => findSection(masked, phrase))
    .filter(Boolean)
    .map((sec) => lines.slice(sec.headingIndex, sec.end).join('\n'));
  const body = parts.length ? parts.join('\n') : lines.join('\n');
  return crypto.createHash('sha256').update(body).digest('hex');
}

function cli(argv) {
  const [cmd, arg] = argv;
  let input = {};
  const raw = arg !== undefined ? arg : fs.readFileSync(0, 'utf8');
  if (raw && raw.trim()) input = JSON.parse(raw);
  const ledger = (opts) => input.rounds || (input.stateDir ? readRounds(input.stateDir, opts) : []);
  const ctx = { deferred: input.deferred, index: input.index };
  switch (cmd) {
    case 'tally': return tally(input.handoff, ctx);
    case 'decide': return decide({ ...input, ...(input.handoff ? tally(input.handoff, ctx) : {}), rounds: ledger() });
    case 'classify': return { class: classify(input, ctx) };
    case 'stale-wake': return { stale: staleWake({ ...input, rounds: ledger({ all: true }) }) };
    case 'trd-hash':
      if (!input.trd) throw new Error('trd-hash needs trd (a path)');
      return { trdHash: trdHash(fs.readFileSync(input.trd, 'utf8')) };
    case 'record':
      if (!input.stateDir || !input.round) throw new Error('record needs stateDir and round');
      record(input.stateDir, input.round);
      return { ok: true };
    default: throw new Error('usage: audit-rounds.js tally|decide|classify|stale-wake|record|trd-hash [json]');
  }
}

module.exports = { classify, tally, record, readRounds, decide, isDoNotProceed, staleWake, trdHash };

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n');
  } catch (e) {
    process.stderr.write(`audit-rounds: ${e.message}\n`);
    process.exit(1);
  }
}
