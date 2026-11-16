'use strict';

/**
 * verification-runs.js -- the one owner of "how many verification runs has this feature had".
 *
 * `/verify-build`, `/implement-trd` (its verification pass) and `/refine-verification` call the
 * CLI below at fixed points instead of each re-deriving the count in prose. Nothing here calls a
 * model; the framework writes the ruling request and never chooses an outcome.
 *
 * STORAGE. `.trd-state/<feature>/implement.json` -> `functional_verification.runs`, an
 * append-only array; the count is its length. Every write goes through `implement-state.js`
 * `load()`/`save()` (loaded with `{ local: true }`: no network call, because the commands run
 * `record-ref.js ensure` first). Other `functional_verification` keys (`prd_path`, `environments`,
 * `ruling`, ...) are carried through every write untouched.
 *
 * SEEDING. `start` on an absent `implement.json` writes a stub holding ONLY
 * `{ functional_verification: { runs: [...] } }`. It lacks the fields `/implement-trd` State
 * Validation requires (`version, trd_file, trd_hash, phase_cursor, tasks`); that command treats a
 * file with `functional_verification` and no `tasks` as this stub, not as corruption.
 *
 * ONE RUN (docs/TRD/cap-verification-runs-per-feature.md D4). The first dispatch of the
 * verify-functional workflow over a feature's own definition. A resume of an INTERRUPTED run (last
 * entry unfinished and `verification-state.json` has `outcome: null`) is not a new run: `start`
 * returns `continued: true` and writes nothing. An unfinished last entry whose state file HAS an
 * outcome (ended STUCK after the workflow returned, or `finish` was lost) is closed by `start` as
 * `outcome: 'abandoned'` and counts.
 *
 * `open` (per run, set by `finish`) = ids whose status is not `met` in `verification-state.json`
 * overlaid by `reverify/verification-state.json` (the re-proof wins per id, as `offHostProven`
 * does: a custody re-proof is not counted as a run but can close a criterion). A definition
 * problem is stored as `status: 'not_met'` with `settled: 'definition-problem'`, so it is in.
 *
 * LIMIT. `ensemble.verificationRunLimit` in `<root>/.claude/settings.json`: integer >= 1; absent
 * or null -> 2; anything else (0, -1, "2", 2.5) or unparseable settings -> `RunLimitError`.
 *
 * CLI (prints ONE JSON object):
 *   node verification-runs.js check          --state-dir <d> [--root <r>]
 *   node verification-runs.js start          --state-dir <d> --command </implement-trd|/verify-build> --scope <full|targeted> [--root <r>]
 *   node verification-runs.js finish         --state-dir <d> --outcome <o> [--root <r>]
 *   node verification-runs.js request        --state-dir <d> [--command <c>] [--root <r>]
 *   node verification-runs.js record-ruling  --state-dir <d> --outcome <ship|fix|drop> [--criterion <id>] --by <who> [--root <r>]
 *
 * EXIT CODES. A REFUSAL IS NOT AN ERROR: `check` and `start` at the limit exit 0 with
 * `allowed: false` (and `start` writes nothing); callers branch on `allowed`. Exit 2: an invalid
 * setting (`{"error": "ensemble.verificationRunLimit must be ..."}`) or bad usage / bad argument.
 * Exit 1: `finish` with no run in progress, `record-ruling --outcome fix` naming a non-open id.
 *
 * Example:
 *   node .claude/lib/verification-runs.js check --state-dir .trd-state/my-feature
 *   -> {"count":2,"limit":2,"allowed":false,"continuing":false,"runs":[...]}
 */

const fs = require('fs');
const path = require('path');
const { load, save } = require('./implement-state');

const DEFAULT_LIMIT = 2;
const SETTING = 'ensemble.verificationRunLimit';
const COMMANDS = ['/implement-trd', '/verify-build'];
const SCOPES = ['full', 'targeted'];
const OUTCOMES = ['ship', 'fix', 'drop'];
const REQUEST_FILE = 'ruling-request.md';
const REPORT_FILE = 'verification-report.md';

class RunLimitError extends Error {}
/** `finish` with no unfinished entry. */
class NoRunError extends Error {}
/** A bad argument to `record-ruling` (outcome, criterion, by). */
class RulingError extends Error {}

/** @returns {number} the run limit; throws RunLimitError naming the setting when invalid. */
function readLimit(root = process.cwd()) {
  const file = path.join(root, '.claude', 'settings.json');
  if (!fs.existsSync(file)) return DEFAULT_LIMIT;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new RunLimitError(`${SETTING} cannot be read: .claude/settings.json is not valid JSON (${e.message})`);
  }
  const v = settings && settings.ensemble ? settings.ensemble.verificationRunLimit : undefined;
  if (v === undefined || v === null) return DEFAULT_LIMIT;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new RunLimitError(`${SETTING} must be an integer of at least 1 (got ${JSON.stringify(v)})`);
  }
  return v;
}

const implementPath = (stateDir) => path.join(stateDir, 'implement.json');

/** The parsed implement.json, or null when absent. Other read errors propagate. */
function loadState(stateDir) {
  try {
    return load(implementPath(stateDir), { local: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

const runsOf = (state) => {
  const r = state && state.functional_verification && state.functional_verification.runs;
  return Array.isArray(r) ? r : [];
};

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Criteria of verification-state.json overlaid by reverify/ (re-proof wins per id), in order. */
function currentCriteria(stateDir) {
  const byId = new Map();
  const files = [path.join(stateDir, 'verification-state.json'), path.join(stateDir, 'reverify', 'verification-state.json')];
  for (const f of files) {
    const s = readJson(f);
    for (const c of s && Array.isArray(s.criteria) ? s.criteria : []) if (c && c.id) byId.set(c.id, c);
  }
  return [...byId.values()];
}

const openCriteria = (stateDir) => currentCriteria(stateDir).filter((c) => c.status !== 'met');

/** An interrupted run: verification-state.json exists with `outcome: null` (verify-build step 1a.1). */
function stateInterrupted(stateDir) {
  const s = readJson(path.join(stateDir, 'verification-state.json'));
  return Boolean(s) && s.outcome === null;
}

const lastRun = (runs) => (runs.length ? runs[runs.length - 1] : null);
const isUnfinished = (r) => Boolean(r) && !r.finished_at;

/** @returns {{count:number, limit:number, allowed:boolean, continuing:boolean, runs:object[]}} */
function status(stateDir, { root } = {}) {
  const limit = readLimit(root);
  const runs = runsOf(loadState(stateDir));
  const continuing = isUnfinished(lastRun(runs)) && stateInterrupted(stateDir);
  return { count: runs.length, limit, allowed: runs.length < limit || continuing, continuing, runs };
}

/**
 * Begin (or continue) a counted run. At the limit: `allowed: false`, nothing written.
 * @returns {{allowed:boolean, continued:boolean, run:object|null, count:number, limit:number, runs:object[]}}
 */
function start(stateDir, { command, scope, root, nowIso } = {}) {
  if (!COMMANDS.includes(command)) throw new RulingError(`--command must be one of ${COMMANDS.join(', ')}`);
  if (!SCOPES.includes(scope)) throw new RulingError(`--scope must be one of ${SCOPES.join(', ')}`);
  const limit = readLimit(root);
  const state = loadState(stateDir) || {};
  const runs = runsOf(state).map((r) => ({ ...r }));
  const last = lastRun(runs);
  if (isUnfinished(last)) {
    if (stateInterrupted(stateDir)) {
      return { allowed: true, continued: true, run: last, count: runs.length, limit, runs };
    }
    // Ended after the workflow returned without `finish`: it counts, as abandoned.
    last.outcome = 'abandoned';
    last.finished_at = nowIso || new Date().toISOString();
  }
  if (runs.length >= limit) return { allowed: false, continued: false, run: null, count: runs.length, limit, runs };
  const run = {
    n: runs.length + 1,
    command,
    started_at: nowIso || new Date().toISOString(),
    scope,
    outcome: null,
    finished_at: null,
    open: [],
  };
  runs.push(run);
  persist(stateDir, state, runs);
  return { allowed: true, continued: false, run, count: runs.length, limit, runs };
}

/** Write `runs` into state.functional_verification, keeping every other key. */
function persist(stateDir, state, runs, extra = {}) {
  const next = { ...state, functional_verification: { ...(state.functional_verification || {}), ...extra, runs } };
  save(implementPath(stateDir), next);
  return next;
}

/**
 * Close the last unfinished run. When the limit is reached and the run fell short, also point the
 * report's `**Next**:` line at the ruling request (only that line changes).
 * @returns {{run:object, count:number, limit:number, rulingDue:boolean, runs:object[]}}
 */
function finish(stateDir, { outcome, root, nowIso } = {}) {
  if (!outcome || typeof outcome !== 'string') throw new RulingError('--outcome is required');
  const limit = readLimit(root);
  const state = loadState(stateDir) || {};
  const runs = runsOf(state).map((r) => ({ ...r }));
  const run = lastRun(runs);
  if (!isUnfinished(run)) throw new NoRunError('no run in progress');
  const open = openCriteria(stateDir);
  run.outcome = outcome;
  run.finished_at = nowIso || new Date().toISOString();
  run.open = open.map((c) => c.id);
  persist(stateDir, state, runs);
  // A definition problem keeps a `satisfied` run from being the end of the road (D13).
  const definitionProblem = open.some((c) => c.settled === 'definition-problem');
  const rulingDue = runs.length >= limit && (outcome !== 'satisfied' || definitionProblem);
  if (rulingDue) rewriteReportNext(stateDir);
  return { run, count: runs.length, limit, rulingDue, runs };
}

/** Replace the first `**Next**:` line of verification-report.md; no report -> nothing to do. */
function rewriteReportNext(stateDir) {
  const file = path.join(stateDir, REPORT_FILE);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  const line = `**Next**: the run limit is reached; the product PM rules on \`${REQUEST_FILE}\` (ship as is, fix one named thing, or drop it)`;
  const next = text.replace(/^\*\*Next\*\*:.*$/m, () => line);
  if (next !== text) fs.writeFileSync(file, next);
}

const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const words = (s) => oneLine(s).replace(/[-_]+/g, ' ');

/** The statement for each criterion id, from the definition's `functional statement` column. */
function readStatements(stateDir) {
  try {
    const { readDefinitionRows } = require('./functional-verification');
    const rows = readDefinitionRows(fs.readFileSync(path.join(stateDir, 'success-definition.md'), 'utf8'));
    return new Map(rows.map((r) => [r.id, oneLine(r.cells['functional statement'])]));
  } catch {
    return new Map();
  }
}

/** Open criteria with the facts the request lists. */
function openItems(stateDir, runs) {
  const statements = readStatements(stateDir);
  let criteria = openCriteria(stateDir);
  if (criteria.length === 0 && currentCriteria(stateDir).length === 0) {
    // No state file: fall back to the last finished run's open ids.
    const fin = runs.filter((r) => r.finished_at);
    criteria = (fin.length ? fin[fin.length - 1].open : []).map((id) => ({ id }));
  }
  return criteria.map((c) => ({
    id: c.id,
    statement: statements.get(c.id) || oneLine(c.reason) || '(no statement recorded)',
    kind: c.kind || null,
    cause: c.cause || null,
    reason: oneLine(c.reason),
    settled: c.settled || null,
    runsOpen: Math.max(1, runs.filter((r) => Array.isArray(r.open) && r.open.includes(c.id)).length),
  }));
}

/**
 * Write `<stateDir>/ruling-request.md`: deterministic from runs, verification-state.json and
 * success-definition.md (no clock, no caller name), so every command writes the same document.
 * `command` and `nowIso` are accepted for call-site symmetry and deliberately not rendered.
 * @returns {{path:string, open:object[]}}
 */
function renderRulingRequest(stateDir, { feature, root } = {}) {
  const name = feature || path.basename(path.resolve(stateDir));
  const limit = readLimit(root);
  const state = loadState(stateDir) || {};
  const runs = runsOf(state);
  const open = openItems(stateDir, runs);
  const dir = `.trd-state/${name}`;
  const cli = (args) => `node .claude/lib/verification-runs.js record-ruling --state-dir ${dir} ${args}`;
  const out = [];
  out.push(`# Ruling request: ${name}`, '');
  out.push(
    `For the product PM, who may escalate to the owner. This feature has had ${runs.length} of ${limit} verification runs, ` +
      'so no further run or plan will start until you rule. The framework does not choose; you do.',
    ''
  );
  out.push('## Runs', '');
  if (runs.length === 0) out.push('No run is recorded.', '');
  else {
    out.push('| Run | Command | Started | Outcome |', '|---|---|---|---|');
    for (const r of runs) out.push(`| ${r.n} | \`${r.command}\` | ${r.started_at} | ${r.outcome || 'in progress'} |`);
    out.push('');
  }
  out.push('## Still open', '');
  if (open.length === 0) out.push('All criteria are met; nothing is open.', '');
  else {
    for (const o of open) {
      out.push(`- **${o.id}** — ${o.statement}`);
      const why = [o.kind && `kind: ${words(o.kind)}`, `cause: ${o.cause ? words(o.cause) : 'unrecorded'}`, o.settled && `settled: ${words(o.settled)}`]
        .filter(Boolean)
        .join('; ');
      out.push(`  - ${why}`);
      if (o.reason) out.push(`  - last reason: ${o.reason}`);
      out.push(`  - open in ${o.runsOpen} of ${runs.length} run${runs.length === 1 ? '' : 's'}`);
    }
    out.push('');
  }
  out.push('## The three outcomes', '', 'Pick exactly one. Each step is run by a person; the framework never runs `record-ruling` itself.', '');
  out.push('1. **Ship as is.** Everything open is shipped and filed as a defect issue.');
  out.push(`   1. \`${cli('--outcome ship --by <who>')}\``, '   2. `/audit-build`', '');
  out.push('2. **Fix one named thing.** The named criterion is built; the rest are shipped and filed as defect issues.');
  out.push(`   1. \`${cli('--outcome fix --criterion <id> --by <who>')}\``);
  out.push('   2. `/amend "<the criterion in words>"`', '   3. `/audit-build`', '');
  out.push('3. **Drop it.** Everything open is dropped from this feature and filed as a defect issue.');
  out.push(`   1. \`${cli('--outcome drop --by <who>')}\``, '   2. `/audit-build`', '');
  const ruling = state.functional_verification && state.functional_verification.ruling;
  if (ruling) {
    out.push('## Recorded ruling', '');
    out.push(`${ruling.outcome}${ruling.criterion ? ` (${ruling.criterion})` : ''}, by ${ruling.by}, ${ruling.recorded_at}`, '');
  }
  const file = path.join(stateDir, REQUEST_FILE);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(file, out.join('\n'));
  return { path: file, open };
}

/**
 * Store the ruling and file what it leaves open as waived (`[non-blocking] `) discovery rows,
 * which `waived-defects.js gate` turns into defect issues. `fix` waives every open id but the
 * named one. A second ruling replaces `ruling`; rows already written stay (idempotent per ref).
 * @returns {{ruling:object, waived:{recorded:string[], skipped:string[], failed:string[]}}}
 */
function recordRuling(stateDir, { outcome, criterion, by, nowIso } = {}) {
  if (!OUTCOMES.includes(outcome)) throw new RulingError(`--outcome must be one of ${OUTCOMES.join(', ')}`);
  if (!by || !oneLine(by)) throw new RulingError('--by is required');
  const open = openCriteria(stateDir).map((c) => c.id);
  if (outcome === 'fix' && !open.includes(criterion)) {
    throw new RulingError(`--criterion ${criterion || '(missing)'} is not an open criterion (open: ${open.join(', ') || 'none'})`);
  }
  const at = nowIso || new Date().toISOString();
  const state = loadState(stateDir) || {};
  const ruling = { outcome, criterion: outcome === 'fix' ? criterion : criterion || null, by: oneLine(by), recorded_at: at };
  persist(stateDir, state, runsOf(state), { ruling });
  const verb = outcome === 'drop' ? 'dropped' : 'shipped as is';
  const rows = open.filter((id) => outcome !== 'fix' || id !== criterion).map((id) => ({ id, reason: `${verb} by ruling ${at.slice(0, 10)}` }));
  const { recordNonBlockingFollowups } = require('./functional-verification');
  return { ruling, waived: recordNonBlockingFollowups(stateDir, rows, at) };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new RulingError(`unexpected argument ${argv[i]}`);
    opt[argv[i].slice(2)] = argv[i + 1];
  }
  return opt;
}

function emit(o, code = 0) {
  process.stdout.write(JSON.stringify(o) + '\n');
  return code;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  try {
    const opt = parseArgs(rest);
    const stateDir = opt['state-dir'];
    const root = opt.root || process.cwd();
    if (!stateDir || !['check', 'start', 'finish', 'request', 'record-ruling'].includes(cmd)) {
      throw new RulingError('usage: verification-runs.js check|start|finish|request|record-ruling --state-dir <d> [...]');
    }
    if (cmd === 'check') return emit(status(stateDir, { root }));
    if (cmd === 'start') return emit(start(stateDir, { command: opt.command, scope: opt.scope, root }));
    if (cmd === 'finish') return emit(finish(stateDir, { outcome: opt.outcome, root }));
    if (cmd === 'request') return emit(renderRulingRequest(stateDir, { command: opt.command, root }));
    const r = recordRuling(stateDir, { outcome: opt.outcome, criterion: opt.criterion, by: opt.by });
    // Keep an existing request in step with the ruling it now shows.
    if (fs.existsSync(path.join(stateDir, REQUEST_FILE))) renderRulingRequest(stateDir, { root });
    return emit(r);
  } catch (e) {
    if (e instanceof RunLimitError) return emit({ error: e.message }, 2);
    if (e instanceof NoRunError) return emit({ error: e.message }, 1);
    if (e instanceof RulingError) return emit({ error: e.message }, /usage|unexpected argument|must be one of|is required/.test(e.message) ? 2 : 1);
    return emit({ error: String(e && e.message) }, 2);
  }
}

module.exports = {
  DEFAULT_LIMIT,
  RunLimitError,
  readLimit,
  status,
  start,
  finish,
  renderRulingRequest,
  recordRuling,
  main,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
