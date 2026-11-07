'use strict';

/**
 * ship-sequencer.js -- runs the string of shipping primitives an owner wrote in `ship.md`.
 *
 * WHY A LIBRARY: order, a bounded `repeat` block, the `wait` and `stop` results, resume and the
 * outward-authorization gate are deterministic and have sharp edges; prose in a command would
 * be re-derived, differently, on every run (TRD ship-build D1, D45).
 *
 * PRIMITIVE-BLIND: this module names no primitive and no primitive's result word. Everything
 * it knows about a primitive it reads from that primitive's contract file,
 * `ship-primitive-<name>.md`, in the contracts directory beside this library (front matter:
 * `primitive`, `params`, `results`, `outward`, `needs`, `provides`, `section`, `rest`,
 * `repeat-until`, `stops-on`). A new primitive is one new contract file and no change here (D41).
 *
 * `ship.md` GRAMMAR (D2): under `## Ship` and `## After shipping`, numbered lines
 *   `N. <primitive> key=value key="quoted value"`
 * A primitive whose contract declares `rest: <param>` puts the rest of the line in that
 * parameter. `N. repeat [until=<result>] [rounds=<n>]` is followed by indented
 * `- <primitive> ...` lines (no nesting). Fenced blocks and anything under a heading
 * "Examples (not run)" are never parsed.
 *
 * Contract front-matter keys: primitive, params, results, outward, needs, provides, section,
 * rest, stops-on, repeat-until, requires (`trd`: the work's TRD must parse at start).
 *
 * STATE: `<stateDir>/shipped.json` (TRD 3.4). This module is its only writer. It holds the
 * step snapshot taken at `start`, so a resume never re-reads `ship.md`.
 *
 * CLI (one JSON line per call; exit 0, except exit 2 on a usage error -- the convention of
 * `pull-request.js`):
 *   parse  --policy <file> [--contracts <dir>]
 *   start  --state-dir <dir> --policy <file> --fallback "<string>" --kind <k> --id <id>
 *          [--trd <path>] [--branch <b>] [--contracts <dir>]
 *   next   --state-dir <dir> [--contracts <dir>] [--autonomy <file>] [--settings <file>]
 *   record --state-dir <dir> --step <id> --result <word> [--data '<json>'] [--reason <text>]
 *   status --state-dir <dir>
 *
 * `next` returns `{action: 'run', step}` (a step handed out again after `wait` or `stop` is
 * the same step), `{action: 'stop', step, reason}` (the outward gate refused it) or
 * `{action: 'done', shipped}`.
 */

const fs = require('fs');
const path = require('path');
const { maskFencedLines, parseTrd } = require('./trd-parser');
const implementState = require('./implement-state');

const STATE_FILE = 'shipped.json';
const DEFAULT_ROUNDS = 2;

/** The names `next` adds to a step's input; a contract may not declare a parameter by one. */
const RESERVED_INPUT = ['work', 'final', 'laterNeeds', 'context'];

/**
 * The sentence `autonomy.md` must carry for outward steps to be authorized (TRD 3.10).
 * Compared after collapsing whitespace, so a wrapped copy still matches.
 */
const AUTHORIZATION_SENTENCE =
  "A step listed in `.claude/rules/ship.md` is the owner's standing authorization for that act.";

const DEFAULT_CONTRACTS_DIR = path.join(__dirname, '..', 'contracts');

// ---------------------------------------------------------------------------
// small text helpers
// ---------------------------------------------------------------------------

function collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** Split on commas and whitespace that are outside double quotes; quotes are kept. */
function splitTokens(text) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && (ch === ',' || /\s/.test(ch))) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return { tokens: out, unterminated: inQuote };
}

function unquote(v) {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

/** `key=value` or `key="quoted"` or bare `key` -> {key, value|undefined}. */
function splitPair(token) {
  const i = token.indexOf('=');
  if (i < 0) return { key: token, value: undefined };
  return { key: token.slice(0, i), value: unquote(token.slice(i + 1)) };
}

// ---------------------------------------------------------------------------
// contracts
// ---------------------------------------------------------------------------

function parseFrontMatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0].trim() !== '---') return null;
  const fm = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return fm;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (m) fm[m[1]] = m[2].trim();
  }
  return null; // never closed
}

function listOf(value, { keepNone = false } = {}) {
  if (!value) return [];
  // `none` / `-` mean "empty list" for params, needs and the rest, but in `results` `none` is a
  // real result word (close-issue: the work named no issue, so nothing was closed).
  return splitTokens(value).tokens.map(unquote).filter((t) => !(keepNone ? /^-$/ : /^(none|-)$/).test(t));
}

function parseOutward(value) {
  const v = (value || 'no').trim();
  if (v === 'no' || v === 'yes') return v;
  const m = /^unless\s+(\S+?)=(.+)$/.exec(v);
  if (m) return { unless: m[1], equals: unquote(m[2].trim()) };
  return null;
}

/**
 * Read every `ship-primitive-*.md` in `dir`.
 * @returns {{contracts: Map<string, object>, errors: string[]}}
 */
function loadPrimitives(dir = DEFAULT_CONTRACTS_DIR) {
  const contracts = new Map();
  const errors = [];
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => /^ship-primitive-.+\.md$/.test(f)).sort();
  } catch (err) {
    return { contracts, errors: [`contracts directory unreadable: ${dir} (${err.code || err.message})`] };
  }
  for (const file of files) {
    const full = path.join(dir, file);
    const expected = file.replace(/^ship-primitive-/, '').replace(/\.md$/, '');
    const fm = parseFrontMatter(fs.readFileSync(full, 'utf8'));
    if (!fm) {
      errors.push(`${file}: no front matter`);
      continue;
    }
    if (fm.primitive !== expected) {
      errors.push(`${file}: front matter primitive "${fm.primitive}" does not match the file name`);
      continue;
    }
    const outward = parseOutward(fm.outward);
    if (!outward) {
      errors.push(`${file}: outward must be no, yes or "unless <settings key>=<value>"`);
      continue;
    }
    const section = fm.section || 'any';
    if (!['ship', 'after', 'any'].includes(section)) {
      errors.push(`${file}: section must be ship, after or any`);
      continue;
    }
    const params = {};
    let bad = false;
    for (const tok of splitTokens(fm.params || '').tokens) {
      const { key, value } = splitPair(tok);
      if (RESERVED_INPUT.includes(key)) {
        errors.push(`${file}: parameter "${key}" is reserved for the sequencer's own input`);
        bad = true;
      }
      // A bare name is required; `name=` (empty) is optional with no default.
      params[key] = { default: value === undefined || value === '' ? null : value, required: value === undefined };
    }
    if (bad) continue;
    const rest = fm.rest && fm.rest !== 'none' ? fm.rest : null;
    if (rest && !params[rest]) {
      errors.push(`${file}: rest names "${rest}", which is not a declared parameter`);
      continue;
    }
    const results = listOf(fm.results, { keepNone: true });
    contracts.set(expected, {
      primitive: expected,
      params,
      results,
      outward,
      needs: listOf(fm.needs),
      requires: listOf(fm.requires),
      provides: listOf(fm.provides),
      section,
      rest,
      // Results that are failures, not success (`stops-on:` in the contract). Outside a repeat,
      // recording one stops the run on that step (AC-F3.2). Absent means every result continues.
      stopsOn: listOf(fm['stops-on']).filter((w) => results.includes(w)),
      repeatUntil: fm['repeat-until'] && fm['repeat-until'] !== 'none' ? fm['repeat-until'] : null,
      path: full,
    });
  }
  return { contracts, errors };
}

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

function headingOf(line) {
  const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

/**
 * Collect the raw step lines under the `## Ship` and `## After shipping` headings.
 * Fence-aware; text under a heading containing "Examples (not run)" is skipped.
 * @returns {{ship: {n:number,text:string}[], after: {n:number,text:string}[]}}
 */
function collectSections(text) {
  const lines = maskFencedLines(String(text).replace(/\r\n/g, '\n').split('\n'));
  const out = { ship: [], after: [] };
  let current = null; // 'ship' | 'after' | null
  let sectionLevel = 0;
  let skipLevel = 0; // >0 while inside an Examples heading of that level
  lines.forEach((line, idx) => {
    const h = headingOf(line);
    if (h) {
      if (skipLevel && h.level <= skipLevel) skipLevel = 0;
      if (!skipLevel) {
        if (/examples\s*\(not run\)/i.test(h.text)) {
          skipLevel = h.level;
        } else if (h.level === 2 && /^ship$/i.test(h.text)) {
          current = 'ship';
          sectionLevel = 2;
        } else if (h.level === 2 && /^after shipping$/i.test(h.text)) {
          current = 'after';
          sectionLevel = 2;
        } else if (h.level <= sectionLevel || h.level <= 2) {
          current = null;
          sectionLevel = 0;
        }
      }
      return;
    }
    if (current && !skipLevel) out[current].push({ n: idx + 1, text: line });
  });
  return out;
}

/** Parse the params of one step line against its contract (or repeat's own two). */
function parseParams(restText, contract, lineNo, errors) {
  const params = {};
  if (contract.rest) {
    const value = restText.trim();
    if (value) params[contract.rest] = value;
  } else {
    const { tokens, unterminated } = splitTokens(restText);
    if (unterminated) errors.push(`line ${lineNo}: unterminated quote`);
    for (const tok of tokens) {
      const { key, value } = splitPair(tok);
      if (value === undefined) {
        errors.push(`line ${lineNo}: "${key}" is not key=value`);
        continue;
      }
      if (!contract.params[key]) {
        errors.push(`line ${lineNo}: unknown parameter "${key}" for ${contract.primitive}`);
        continue;
      }
      params[key] = value;
    }
  }
  for (const [name, spec] of Object.entries(contract.params)) {
    if (spec.required && (params[name] === undefined || params[name] === '')) {
      errors.push(`line ${lineNo}: ${contract.primitive} needs ${name}`);
    }
  }
  return params;
}

function parseSectionSteps(rawLines, section, contracts, errors) {
  const steps = [];
  let openRepeat = null;
  for (const { n, text } of rawLines) {
    const top = /^(\d+)\.\s+(\S+)(.*)$/.exec(text);
    const body = /^\s+[-*]\s+(\S+)(.*)$/.exec(text);
    if (top) {
      openRepeat = null;
      const [, num0, name, restText] = top;
      // After-shipping ids carry an "a" so they never collide with a `## Ship` id.
      const num = section === 'after' ? `a${num0}` : num0;
      if (name === 'repeat') {
        const { tokens } = splitTokens(restText);
        const step = { id: num, section, primitive: 'repeat', line: n, repeat: { until: null, rounds: DEFAULT_ROUNDS }, body: [] };
        for (const tok of tokens) {
          const { key, value } = splitPair(tok);
          if (key === 'until' && value) step.repeat.until = value;
          else if (key === 'rounds' && /^[1-9]\d*$/.test(value || '')) step.repeat.rounds = Number(value);
          else errors.push(`line ${n}: repeat takes until=<result> and rounds=<positive integer>, not "${tok}"`);
        }
        steps.push(step);
        openRepeat = step;
        continue;
      }
      const contract = contracts.get(name);
      if (!contract) {
        errors.push(`line ${n}: unknown primitive "${name}"`);
        continue;
      }
      steps.push({ id: num, section, primitive: name, line: n, params: parseParams(restText, contract, n, errors) });
    } else if (body && /^\s/.test(text)) {
      const [, name, restText] = body;
      if (!openRepeat) {
        errors.push(`line ${n}: indented step "${name}" is not inside a repeat`);
        continue;
      }
      if (name === 'repeat') {
        errors.push(`line ${n}: repeat blocks cannot be nested`);
        continue;
      }
      const contract = contracts.get(name);
      if (!contract) {
        errors.push(`line ${n}: unknown primitive "${name}"`);
        continue;
      }
      openRepeat.body.push({
        id: `${openRepeat.id}.${openRepeat.body.length + 1}`,
        section,
        primitive: name,
        line: n,
        params: parseParams(restText, contract, n, errors),
      });
    } else if (text.trim() !== '' && !/^\s/.test(text)) {
      openRepeat = null; // prose ends a repeat block; prose itself is ignored
    }
  }
  return steps;
}

/** Validation that needs the whole string: section, needs, repeat bodies. */
function validateSteps(steps, contracts, errors) {
  const provided = new Set();
  const seen = (step, section, extra) => {
    const c = contracts.get(step.primitive);
    if (!c) return;
    if (c.section !== 'any' && c.section !== section) {
      errors.push(`line ${step.line}: ${step.primitive} belongs under ${c.section === 'ship' ? '## Ship' : '## After shipping'}`);
    }
    for (const key of c.needs) {
      if (!provided.has(key)) errors.push(`line ${step.line}: ${step.primitive} needs ${key}, which no earlier step provides`);
    }
    c.provides.forEach((k) => provided.add(k));
    return extra;
  };
  // A step is found again by its id (`locate`), so two steps sharing one would send the cursor
  // back to the first every time: a `1.` `1.` `1.` list would push forever.
  const ids = new Set();
  for (const step of steps) {
    if (ids.has(step.id)) {
      errors.push(`line ${step.line}: step number ${step.id.replace(/^a/, '')} is used twice in this section; number the steps 1, 2, 3...`);
    }
    ids.add(step.id);
  }
  for (const step of steps) {
    if (step.primitive !== 'repeat') {
      seen(step, step.section);
      continue;
    }
    if (step.body.length === 0) {
      errors.push(`line ${step.line}: repeat has no steps`);
      continue;
    }
    for (const b of step.body) seen(b, step.section);
    const bodyContracts = step.body.map((b) => contracts.get(b.primitive)).filter(Boolean);
    if (step.repeat.until) {
      // A failure result must never be what ends a repeat: the owner would move on to merge or
      // release on the strength of "failed". Failures keep the loop going or stop the run.
      const failing = bodyContracts.find((c) => c.stopsOn.includes(step.repeat.until));
      if (failing) errors.push(`line ${step.line}: until=${step.repeat.until} is a failure result of ${failing.primitive}; a failure cannot end a repeat`);
      if (!bodyContracts.some((c) => c.results.includes(step.repeat.until))) {
        errors.push(`line ${step.line}: until=${step.repeat.until} is a result no step in the repeat declares`);
      }
    } else {
      const declared = [...new Set(bodyContracts.map((c) => c.repeatUntil).filter(Boolean))];
      if (declared.length === 1) step.repeat.until = declared[0];
      else if (declared.length === 0) errors.push(`line ${step.line}: repeat has no until= and no step in it declares a repeat-until result`);
      else errors.push(`line ${step.line}: repeat has no until= and its steps declare different ones (${declared.join(', ')})`);
    }
  }
}

/**
 * Parse `ship.md` text (or a fallback string, passed as `## Ship` lines).
 * @param {string|null} text file text, or null for no file
 * @returns {{steps: object[], policy: 'ship.md'|'none', errors: string[]}}
 */
function parse(text, contracts) {
  const errors = [];
  if (text == null) return { steps: [], policy: 'none', errors };
  const raw = collectSections(text);
  const shipSteps = parseSectionSteps(raw.ship, 'ship', contracts, errors);
  const afterSteps = parseSectionSteps(raw.after, 'after', contracts, errors);
  const steps = shipSteps.concat(afterSteps);
  if (shipSteps.length === 0 && errors.length === 0) return { steps: [], policy: 'none', errors };
  validateSteps(steps, contracts, errors);
  return { steps, policy: 'ship.md', errors };
}

/** Parse a bare fallback string (numbered lines, no headings) as the `## Ship` section. */
function parseFallback(fallback, contracts) {
  const errors = [];
  const lines = String(fallback).replace(/\\n/g, '\n').split('\n').map((text, i) => ({ n: i + 1, text }));
  const steps = parseSectionSteps(lines, 'ship', contracts, errors);
  if (steps.length === 0 && errors.length === 0) errors.push('the fallback string holds no step');
  validateSteps(steps, contracts, errors);
  return { steps, errors };
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const statePath = (stateDir) => path.join(stateDir, STATE_FILE);
const now = () => new Date().toISOString();

function loadState(stateDir) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath(stateDir), 'utf8'));
  } catch (err) {
    return { error: err.code === 'ENOENT' ? `no ${STATE_FILE} in ${stateDir}; run start first` : `${STATE_FILE} unreadable: ${err.message}` };
  }
  if (state.version !== 2) return { error: `${STATE_FILE} has version ${state.version}, expected 2` };
  return { state };
}

function saveState(stateDir, state) {
  state.updatedAt = now();
  fs.mkdirSync(stateDir, { recursive: true });
  implementState.save(statePath(stateDir), state);
}

/** Leaf steps in execution order, each with where it sits. */
function flatten(steps) {
  const flat = [];
  steps.forEach((step, top) => {
    if (step.repeat) step.body.forEach((b, bi) => flat.push({ step: b, top, bodyIndex: bi, repeat: step }));
    else flat.push({ step, top, bodyIndex: -1, repeat: null });
  });
  return flat;
}

/**
 * A contract's `requires: trd` means the work's TRD must be one /implement-trd can read. Returns
 * an error string naming the TRD path, the first such step and the parser's message, or null.
 * Sweep work has no TRD and is not checked; the primitive's name comes from the contract.
 */
function trdRefusal(steps, contracts, trdPath) {
  if (!trdPath) return null;
  const step = flatten(steps).map((f) => f.step).find((st) => (contracts.get(st.primitive).requires || []).includes('trd'));
  if (!step) return null;
  const lead = `${trdPath}: step ${step.id} (${step.primitive}) needs a TRD /implement-trd can read: `;
  let text;
  try {
    text = fs.readFileSync(path.resolve(trdPath), 'utf8');
  } catch (err) {
    return lead + `unreadable (${err.code || err.message})`;
  }
  try {
    const parsed = parseTrd(text, { path: trdPath });
    if (parsed.tasks.length === 0) return lead + (parsed.warnings[0] || 'no Master Task List tasks parsed');
  } catch (err) {
    return lead + err.message;
  }
  return null;
}

/**
 * Begin a run, or load the one in progress. With no state file the steps are parsed from the
 * policy (or, with no policy, from the caller's fallback string) and snapshotted; with one,
 * `ship.md` is never read again.
 */
function start({ stateDir, policyPath, fallback, work, contractsDir }) {
  if (!stateDir) return { ok: false, status: null, errors: ['start needs a state directory'] };
  const existing = loadState(stateDir);
  if (existing.state) return { ok: true, status: existing.state.status, errors: [], resumed: true };
  if (!existing.error.startsWith('no ')) return { ok: false, status: null, errors: [existing.error] };

  const { contracts, errors: loadErrors } = loadPrimitives(contractsDir);
  if (loadErrors.length) return { ok: false, status: null, errors: loadErrors };

  let text = null;
  try {
    if (policyPath) text = fs.readFileSync(policyPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') return { ok: false, status: null, errors: [`policy unreadable: ${policyPath} (${err.code || err.message})`] };
  }
  let parsed = parse(text, contracts);
  if (parsed.errors.length) return { ok: false, status: null, errors: parsed.errors };
  if (parsed.policy === 'none') {
    // Without a policy the caller's fallback is the whole string; the sequencer names none.
    if (!fallback) return { ok: false, status: null, errors: ['no ship.md step and no --fallback string given'] };
    const fb = parseFallback(fallback, contracts);
    if (fb.errors.length) return { ok: false, status: null, errors: fb.errors.map((e) => `fallback: ${e}`) };
    parsed = { steps: fb.steps, policy: 'none', errors: [] };
  }

  const refusal = trdRefusal(parsed.steps, contracts, work.trd);
  if (refusal) return { ok: false, status: null, errors: [refusal] };

  const flat = flatten(parsed.steps);
  const first = flat[0];
  const t = now();
  const state = {
    version: 2,
    work: { kind: work.kind, id: work.id, trd: work.trd || null, branch: work.branch || null, stateDir },
    policy: parsed.policy,
    steps: parsed.steps,
    cursor: { step: first.step.id, pass: 1 },
    results: [],
    status: 'running',
    shipped: false,
    startedAt: t,
    updatedAt: t,
    shippedAt: null,
  };
  saveState(stateDir, state);
  return { ok: true, status: 'running', errors: [], policy: parsed.policy };
}

// ---------------------------------------------------------------------------
// outward gate (D24)
// ---------------------------------------------------------------------------

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Authorized when autonomy.md carries the sentence, or the contract's `unless` holds. */
function isAuthorized(contract, { autonomyPath, settingsPath }) {
  if (contract.outward === 'no') return true;
  const autonomy = readText(autonomyPath);
  if (autonomy != null && collapse(autonomy).includes(collapse(AUTHORIZATION_SENTENCE))) return true;
  if (typeof contract.outward === 'object') {
    const raw = readText(settingsPath);
    if (raw != null) {
      try {
        let v = JSON.parse(raw);
        for (const k of contract.outward.unless.split('.')) v = v == null ? undefined : v[k];
        if (v !== undefined && String(v) === contract.outward.equals) return true;
      } catch {
        /* unparsable settings means not authorized, never a throw */
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// next / record / status
// ---------------------------------------------------------------------------

function locate(state, stepId) {
  return flatten(state.steps).find((e) => e.step.id === stepId) || null;
}

function mergedContext(state) {
  return state.results.reduce((acc, r) => Object.assign(acc, r.data || {}), {});
}

function laterNeedsOf(state, entry, contracts) {
  const flat = flatten(state.steps);
  const i = flat.findIndex((e) => e.step.id === entry.step.id);
  const later = flat.slice(i + 1);
  // Another pass of the same repeat re-runs the whole body, this step included.
  if (entry.repeat && state.cursor.pass < entry.repeat.repeat.rounds + 1) {
    later.push(...flat.slice(0, i + 1).filter((e) => e.repeat === entry.repeat));
  }
  const needs = new Set();
  for (const e of later) (contracts.get(e.step.primitive) || { needs: [] }).needs.forEach((k) => needs.add(k));
  return [...needs];
}

function next(stateDir, opts = {}) {
  const loaded = loadState(stateDir);
  if (loaded.error) return { action: 'stop', step: null, reason: loaded.error };
  const { state } = loaded;
  if (state.status === 'done') return { action: 'done', shipped: state.shipped };

  const { contracts, errors } = loadPrimitives(opts.contractsDir);
  if (errors.length) return { action: 'stop', step: null, reason: errors[0] };
  const entry = locate(state, state.cursor.step);
  if (!entry) return { action: 'stop', step: null, reason: `cursor step ${state.cursor.step} is not in the snapshot` };
  const contract = contracts.get(entry.step.primitive);
  if (!contract) return { action: 'stop', step: null, reason: `contract for ${entry.step.primitive} is gone` };

  const gate = {
    autonomyPath: opts.autonomyPath || path.join('.claude', 'rules', 'autonomy.md'),
    settingsPath: opts.settingsPath || path.join('.claude', 'settings.json'),
  };
  if (!isAuthorized(contract, gate)) {
    const reason = `not authorized: ${contract.primitive}`;
    state.status = 'stuck';
    state.reason = reason;
    state.handedOut = null;
    state.results.push({ step: entry.step.id, pass: state.cursor.pass, result: 'stop', data: {}, reason, at: now() });
    saveState(stateDir, state);
    return { action: 'stop', step: { id: entry.step.id, primitive: contract.primitive }, reason };
  }

  const input = {};
  for (const [name, spec] of Object.entries(contract.params)) {
    const v = entry.step.params[name] !== undefined ? entry.step.params[name] : spec.default;
    if (v !== null && v !== undefined) input[name] = v;
  }
  const final = entry.repeat ? state.cursor.pass === entry.repeat.repeat.rounds + 1 : false;
  Object.assign(input, {
    work: state.work,
    final,
    laterNeeds: laterNeedsOf(state, entry, contracts),
    context: mergedContext(state),
  });

  state.status = 'running'; // a wait or stop is over once the step is handed out again
  state.reason = null;
  state.handedOut = { step: entry.step.id, pass: state.cursor.pass };
  saveState(stateDir, state);
  return {
    action: 'run',
    step: { id: entry.step.id, primitive: contract.primitive, contract: contract.path, input },
  };
}

function moveToTop(state, topIndex) {
  const next = state.steps[topIndex];
  if (!state.shipped && (!next || next.section === 'after')) {
    state.shipped = true;
    state.shippedAt = now();
  }
  if (!next) {
    state.status = 'done';
    state.cursor = null;
    return;
  }
  const first = next.repeat ? next.body[0] : next;
  state.cursor = { step: first.id, pass: 1 };
}

function record(stateDir, { step, result, data, reason }, opts = {}) {
  const loaded = loadState(stateDir);
  if (loaded.error) return { ok: false, status: null, reason: loaded.error };
  const { state } = loaded;
  if (state.status === 'done') return { ok: false, status: 'done', reason: 'the run is already done' };
  const h = state.handedOut;
  if (!h || h.step !== step || h.pass !== state.cursor.pass || state.cursor.step !== step) {
    return { ok: false, status: state.status, reason: `step ${step} was not the step handed out by next (${h ? h.step : 'none handed out'})` };
  }
  const { contracts } = loadPrimitives(opts.contractsDir);
  const entry = locate(state, step);
  const contract = entry && contracts.get(entry.step.primitive);
  if (!contract) return { ok: false, status: state.status, reason: `no contract for step ${step}` };
  if (result !== 'wait' && result !== 'stop' && !contract.results.includes(result)) {
    return { ok: false, status: state.status, reason: `${contract.primitive} does not declare the result "${result}" (declares ${contract.results.join(', ')})` };
  }

  state.results.push({ step, pass: state.cursor.pass, result, data: data || {}, reason: reason || null, at: now() });
  state.handedOut = null;
  state.reason = null;

  if (result === 'stop') {
    state.status = 'stuck';
    state.reason = reason || 'stopped';
  } else if (result === 'wait') {
    state.status = 'waiting';
    state.reason = reason || 'waiting';
  } else if (entry.repeat) {
    const r = entry.repeat.repeat;
    if (result === r.until) {
      moveToTop(state, entry.top + 1);
    } else if (entry.bodyIndex + 1 < entry.repeat.body.length) {
      state.cursor = { step: entry.repeat.body[entry.bodyIndex + 1].id, pass: state.cursor.pass };
    } else if (state.cursor.pass < r.rounds + 1) {
      state.cursor = { step: entry.repeat.body[0].id, pass: state.cursor.pass + 1 };
    } else {
      state.status = 'stuck';
      state.reason = `repeat ended without ${r.until} after ${r.rounds} rounds`;
    }
  } else if (contract.stopsOn.includes(result)) {
    // The cursor stays on this step, so next() never hands out the step after it.
    state.status = 'stuck';
    state.reason = `step ${step} (${contract.primitive}) recorded ${result}; the run stops here`;
  } else {
    moveToTop(state, entry.top + 1);
  }
  saveState(stateDir, state);
  return { ok: true, status: state.status, shipped: state.shipped, ...(state.reason ? { reason: state.reason } : {}) };
}

function status(stateDir) {
  const loaded = loadState(stateDir);
  if (loaded.error) return { status: null, error: loaded.error };
  const { state } = loaded;
  const steps = flatten(state.steps).map((e) => {
    const last = [...state.results].reverse().find((r) => r.step === e.step.id);
    return { id: e.step.id, primitive: e.step.primitive, result: last ? last.result : null, pass: last ? last.pass : null };
  });
  const out = { status: state.status, shipped: state.shipped, policy: state.policy, cursor: state.cursor, steps };
  if (state.status === 'waiting') out.waiting = state.reason;
  if (state.status === 'stuck') out.stuck = state.reason;
  return out;
}

/**
 * Which listed steps of a policy the outward gate would refuse, and whether autonomy.md carries
 * the authorizing sentence. Read-only: it reports, it never edits `autonomy.md`.
 * A step whose `unless` setting holds counts as authorized, so it is not listed.
 * @param {string|null} text ship.md text
 * @returns {{sentence: 'present'|'absent', refused: string[]}} refused: distinct primitives,
 *   steps inside a repeat included, in first-listed order
 */
function authorization(text, contracts, { autonomyPath, settingsPath }) {
  const autonomy = readText(autonomyPath);
  const sentence = autonomy != null && collapse(autonomy).includes(collapse(AUTHORIZATION_SENTENCE)) ? 'present' : 'absent';
  const listed = [];
  for (const step of parse(text, contracts).steps) {
    for (const s of step.primitive === 'repeat' ? step.body : [step]) listed.push(s.primitive);
  }
  const refused = [...new Set(listed)].filter((name) => {
    const c = contracts.get(name);
    return c && !isAuthorized(c, { autonomyPath, settingsPath });
  });
  return { sentence, refused };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE =
  'usage: ship-sequencer.js parse --policy <file> | authorization --policy <file> | start --state-dir <d> --policy <f> --fallback <s> --kind <k> --id <id> [--trd <p>] [--branch <b>] | next --state-dir <d> | record --state-dir <d> --step <id> --result <r> [--data <json>] [--reason <t>] | status --state-dir <d>   (all: [--contracts <dir>] [--autonomy <f>] [--settings <f>])\n';

function main(argv) {
  const [cmd] = argv;
  const arg = (f) => argValue(argv, f);
  const contractsDir = arg('--contracts');
  const opts = { contractsDir, autonomyPath: arg('--autonomy'), settingsPath: arg('--settings') };
  const stateDir = arg('--state-dir');
  const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

  if (cmd === 'parse' && arg('--policy')) {
    const { contracts, errors: loadErrors } = loadPrimitives(contractsDir);
    if (loadErrors.length) return emit({ policy: null, steps: [], errors: loadErrors }), 0;
    const text = readText(arg('--policy'));
    const r = parse(text, contracts);
    emit({ policy: r.policy, steps: r.steps, errors: r.errors });
    return 0;
  }
  if (cmd === 'authorization' && arg('--policy')) {
    const { contracts, errors: loadErrors } = loadPrimitives(contractsDir);
    if (loadErrors.length) return emit({ sentence: null, refused: [], errors: loadErrors }), 0;
    emit(authorization(readText(arg('--policy')), contracts, {
      autonomyPath: opts.autonomyPath || path.join('.claude', 'rules', 'autonomy.md'),
      settingsPath: opts.settingsPath || path.join('.claude', 'settings.json'),
    }));
    return 0;
  }
  if (cmd === 'start' && stateDir && arg('--kind') && arg('--id')) {
    emit(start({
      stateDir,
      policyPath: arg('--policy'),
      fallback: arg('--fallback'),
      contractsDir,
      work: { kind: arg('--kind'), id: arg('--id'), trd: arg('--trd'), branch: arg('--branch') },
    }));
    return 0;
  }
  if (cmd === 'next' && stateDir) {
    emit(next(stateDir, opts));
    return 0;
  }
  if (cmd === 'record' && stateDir && arg('--step') && arg('--result')) {
    let data;
    if (arg('--data') !== undefined) {
      try {
        data = JSON.parse(arg('--data'));
      } catch {
        emit({ ok: false, status: null, reason: '--data is not valid JSON' });
        return 0;
      }
    }
    emit(record(stateDir, { step: arg('--step'), result: arg('--result'), data, reason: arg('--reason') }, opts));
    return 0;
  }
  if (cmd === 'status' && stateDir) {
    emit(status(stateDir));
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  AUTHORIZATION_SENTENCE,
  loadPrimitives,
  parse,
  authorization,
  start,
  next,
  record,
  status,
};
