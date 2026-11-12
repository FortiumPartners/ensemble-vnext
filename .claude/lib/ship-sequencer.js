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
 * rest, stops-on, detach-on, detach-on-data, repeat-until, requires (`trd`: the work's TRD must
 * parse at start).
 * `loop-on: <result>` (must be in `stops-on`), `loop-via: <primitives, in order>` (each must be
 * `outward: no` and must not itself declare `loop-via`) and `loop-rounds: <param>` (a declared
 * parameter holding a whole number) give a top-level step a bounded recovery loop: recording
 * `loop-on` on it runs the `loop-via` steps, then hands the step out again, up to that many rounds.
 * The loop is synthesized at parse only when every `loop-via` primitive is listed earlier in the
 * policy (a repeat body counts), outside a repeat, and the bound is above 0; the body takes the
 * params of the nearest earlier listed step of the same primitive, and `rounds` is stored in the
 * snapshot. Body step ids are `<step id>.<n>`; `rounds=N` is N body rounds and at most N+1
 * attempts of the owning step.
 * `detach-on: <results>`: from the first recorded result in that list onward, the record moves out
 * of the work tree (see STATE). `detach-on-data: <keys>`: the same, when a recorded result of ANY
 * kind (a stop or wait included) carries data with one of those keys set to true -- how a step
 * that failed after its outward act landed still moves the record out of the tree.
 *
 * STATE: `<stateDir>/shipped.json` (TRD 3.4). This module is its only writer. It holds the
 * step snapshot taken at `start`, so a resume never re-reads `ship.md`, and a `reproof` block
 * (`{count, runs[]}`, empty at `start`) that `reproof` appends to: one entry per custody re-proof,
 * outside the step cursor.
 * Once a result listed in a contract's `detach-on` (or data under `detach-on-data`) is recorded,
 * the record moves out of the work tree: it is written to the records ref
 * (`refs/ensemble/records/<slug>:shipped.json`, one commit, pushed when there is an origin) through
 * ship-record-dir.js `writeRunRecord`, and the custody anchor goes to the same ref (custody.detach).
 * The tracked file is never written again. Only when the ref cannot be written (not a git work
 * tree, a state dir outside `.trd-state/<slug>`, a git failure) does the record land in
 * `<git common dir>/ensemble/ship/<state dir name>/<startedAt>.json` with a pointer `current.json`,
 * as runs started before the ref did. loadState reads the tracked file, the ref's copy of the
 * same run and the detached folder's copy, and the later `updatedAt` wins (ship-record-dir.js
 * `resolveRun`); with no tracked file it finds the ref's detached record, then the pointer's.
 * `start --resume` reads the ref with a fetch and loads a detached record only when its work kind,
 * id and branch equal what `start` was given; no match, or a plain `start`, begins a fresh run
 * (a plain start still restores the state folder from the ref, so custody anchors at the audited
 * commit, but removes the restored `shipped.json`). With no git directory the tracked file is
 * kept. `record` and `status` report `recordPath`; `record` reports `custodyDetach` after a
 * detach, and `recordPushError` / `recordRefError` when a detached save did not reach origin or
 * fell back to the folder; `status` reports `custodyPath`.
 *
 * CLI (one JSON line per call; exit 0, except exit 2 on a usage error -- the convention of
 * `pull-request.js`):
 *   parse  --policy <file> [--contracts <dir>]
 *   start  --state-dir <dir> --policy <file> --fallback "<string>" --kind <k> --id <id>
 *          [--trd <path>] [--branch <b>] [--contracts <dir>] [--resume]
 *          (`--resume`: with no tracked shipped.json, continue the detached record of the same
 *          kind, id and branch, if any)
 *   next   --state-dir <dir> [--contracts <dir>] [--autonomy <file>] [--settings <file>]
 *   record --state-dir <dir> --step <id> --result <word> [--data '<json>'] [--reason <text>]
 *   reproof --state-dir <dir> --custody '<reconcile JSON line>' --reverified <file> --started-at <ISO time>
 *          [--outcome <word>]
 *          (append one re-proof entry to the record's `reproof` block; see recordReproof)
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
const recordDirs = require('./ship-record-dir');
const recordRef = require('./record-ref');

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

/** A contract's loop keys must be coherent and every primitive it loops through must be safe to run unasked. */
function validateLoop(c, contracts, errors) {
  const file = path.basename(c.path);
  if (!c.loopOn && c.loopVia.length === 0 && !c.loopRounds) return;
  if (!c.loopOn || c.loopVia.length === 0 || !c.loopRounds) {
    errors.push(`${file}: loop-on, loop-via and loop-rounds go together`);
    return;
  }
  if (!c.stopsOn.includes(c.loopOn)) errors.push(`${file}: loop-on "${c.loopOn}" must also be listed in stops-on`);
  const rounds = c.params[c.loopRounds];
  if (!rounds) errors.push(`${file}: loop-rounds names "${c.loopRounds}", which is not a declared parameter`);
  // A default the policy line does not override must already be a usable bound; a bad one is
  // the contract's fault, so it is refused here rather than surfacing later as a policy error.
  else if (rounds.default !== null && !/^\d+$/.test(rounds.default)) {
    errors.push(`${file}: loop-rounds parameter "${c.loopRounds}" must default to a whole number, not "${rounds.default}"`);
  }
  for (const name of c.loopVia) {
    const via = contracts.get(name);
    if (!via) errors.push(`${file}: loop-via names unknown primitive "${name}"`);
    else if (via.outward !== 'no') errors.push(`${file}: loop-via "${name}" must be outward: no`);
    else if (via.loopVia.length) errors.push(`${file}: loop-via "${name}" declares a loop of its own`);
  }
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
      // Results after which the record moves out of the tree (`detach-on:` in the contract).
      detachOn: listOf(fm['detach-on']).filter((w) => results.includes(w)),
      // Data keys that, set to true on any recorded result, also move the record out of the tree.
      detachOnData: listOf(fm['detach-on-data']),
      repeatUntil: fm['repeat-until'] && fm['repeat-until'] !== 'none' ? fm['repeat-until'] : null,
      // Step-level recovery loop (see the header): the result that starts it, the primitives it
      // runs, and the parameter that bounds it. Checked below, once every contract is loaded.
      loopOn: fm['loop-on'] && fm['loop-on'] !== 'none' ? fm['loop-on'] : null,
      loopVia: listOf(fm['loop-via']),
      loopRounds: fm['loop-rounds'] && fm['loop-rounds'] !== 'none' ? fm['loop-rounds'] : null,
      path: full,
    });
  }
  for (const c of contracts.values()) validateLoop(c, contracts, errors);
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

/**
 * Give a top-level step its recovery loop (`step.loop = {on, rounds, body}`) when its contract
 * declares one, every primitive it loops through is already listed, and rounds is above 0.
 * Never adds a step the owner did not list.
 */
function attachLoop(step, contracts, listed, errors) {
  const c = contracts.get(step.primitive);
  if (!c || !c.loopOn || c.loopVia.length === 0) return;
  const raw = step.params[c.loopRounds] !== undefined ? step.params[c.loopRounds] : c.params[c.loopRounds].default;
  if (raw === null || raw === undefined || raw === '') return;
  if (!/^\d+$/.test(raw)) {
    errors.push(`line ${step.line}: ${c.loopRounds} must be a whole number, not "${raw}"`);
    return;
  }
  const rounds = Number(raw);
  if (rounds === 0 || !c.loopVia.every((name) => listed.has(name))) return;
  step.loop = {
    on: c.loopOn,
    rounds,
    body: c.loopVia.map((name, i) => ({
      id: `${step.id}.${i + 1}`,
      section: step.section,
      primitive: name,
      line: step.line,
      params: { ...listed.get(name) },
    })),
  };
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
  // The nearest earlier listed step's params per primitive: what a synthesized loop body runs with.
  const listed = new Map();
  for (const step of steps) {
    if (step.primitive !== 'repeat') {
      seen(step, step.section);
      attachLoop(step, contracts, listed, errors);
      listed.set(step.primitive, step.params);
      continue;
    }
    if (step.body.length === 0) {
      errors.push(`line ${step.line}: repeat has no steps`);
      continue;
    }
    for (const b of step.body) {
      seen(b, step.section);
      listed.set(b.primitive, b.params);
    }
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

/** The file the record is (or would be) in right now. */
const recordPathOf = (stateDir, state) =>
  state && state.detached && state.recordPath ? state.recordPath : statePath(stateDir);

function parseState(file) {
  try {
    return { state: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { err };
  }
}

/**
 * Loads the run record: the tracked file, the records ref's copy of the same run and the detached
 * folder's copy (the later `updatedAt` wins); with no tracked file, the ref's detached record,
 * then the one the pointer names. No record is the ordinary "run start first" error.
 */
function loadState(stateDir) {
  // Worktree -> records ref -> detached record. `ensure` is a no-op when the folder already holds
  // records, and never throws; "no record" and "failed" both leave the next fallback to run.
  recordRef.ensure({ stateDir });
  const t = parseState(statePath(stateDir));
  if (t.err && t.err.code !== 'ENOENT') return { error: `${STATE_FILE} unreadable: ${t.err.message}` };
  const found = recordDirs.resolveRun(stateDir, t.state || null);
  if (!found) return { error: `no ${STATE_FILE} in ${stateDir}; run start first` };
  const { state } = found;
  if (state.version !== 2) return { error: `${STATE_FILE} has version ${state.version}, expected 2` };
  return { state };
}

/**
 * Saves the run record: the tracked file until the run detaches, then the records ref (folder
 * fallback), never the tracked file. `opts.localOnly` (a save from `next`) commits to the
 * local ref without pushing; the next `record` pushes both.
 */
function saveState(stateDir, state, opts = {}) {
  state.updatedAt = now();
  if (state.detached) {
    const w = recordDirs.writeRunRecord(stateDir, state, { localOnly: opts.localOnly });
    if (w.ok) return w;
    // Nowhere else to put it: keep the record rather than lose it.
    delete state.recordRef;
    state.recordPath = statePath(stateDir);
  }
  const file = recordPathOf(stateDir, state);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  implementState.save(file, state);
  return null;
}

/** What `record` reports about a detached save that did not reach origin cleanly, or {}. */
function writeIssues(w) {
  if (!w) return {};
  // writeRunRecord sets pushError only when the ref commit could not reach origin.
  return {
    ...(w.pushError ? { recordPushError: w.pushError } : {}),
    ...(w.refError ? { recordRefError: w.refError } : {}),
  };
}

/** Leaf steps in execution order, each with where it sits. */
function flatten(steps) {
  const flat = [];
  steps.forEach((step, top) => {
    if (step.repeat) step.body.forEach((b, bi) => flat.push({ step: b, top, bodyIndex: bi, repeat: step }));
    else {
      flat.push({ step, top, bodyIndex: -1, repeat: null });
      // A step's recovery loop runs right after it; `loopOf` marks the body steps.
      if (step.loop) step.loop.body.forEach((b, bi) => flat.push({ step: b, top, bodyIndex: bi, repeat: null, loopOf: step }));
    }
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
 * The newest detached record in the folder whose work kind, id and branch equal `work` (an
 * absent branch compares as null), or null. This is the only way a resume finds a record once
 * the tracked file is gone, so a record of another branch's run is never mistaken for this one.
 */
function matchingDetached(stateDir, work) {
  const dir = recordDirs.recordDir(stateDir);
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'current.json' && !n.endsWith('.custody.json'));
  } catch {
    return null;
  }
  let best = null;
  for (const n of names) {
    const { state } = parseState(path.join(dir, n));
    const w = state && state.work;
    if (!state || !state.detached || state.version !== 2 || !w) continue;
    if (w.kind !== work.kind || w.id !== work.id || (w.branch ?? null) !== (work.branch ?? null)) continue;
    if (!best || String(state.updatedAt) > String(best.updatedAt)) best = state;
  }
  return best;
}

/**
 * Begin a run, or load the one in progress. With no state file the steps are parsed from the
 * policy (or, with no policy, from the caller's fallback string) and snapshotted; with one,
 * `ship.md` is never read again.
 */
function start({ stateDir, policyPath, fallback, work, contractsDir, resume = false }) {
  if (!stateDir) return { ok: false, status: null, errors: ['start needs a state directory'] };
  const hadShipped = fs.existsSync(statePath(stateDir));
  const sameWork = (w) => w && w.kind === work.kind && w.id === work.id && (w.branch ?? null) === (work.branch ?? null);
  const custodyFile = path.join(stateDir, 'custody.json');
  // A custody.json stamped with a startedAt is an earlier run's post-merge anchor.
  const dropStampedCustody = () => {
    const c = parseState(custodyFile).state;
    if (c && c.startedAt) fs.rmSync(custodyFile, { force: true });
  };
  // A tracked shipped.json marked detached was restored from the records ref (by this start or by
  // any earlier `ensure`: a hook, artifacts.js, loadState), since the tracked file is never written
  // after the detach. Dropping it loses nothing while the ref holds that run; `keep` spares one.
  const dropRestoredRun = (keep) => {
    const t = parseState(statePath(stateDir)).state;
    if (!t || !t.detached || !t.startedAt || (keep && keep(t))) return;
    if (!recordDirs.refRun(stateDir, { startedAt: t.startedAt })) return;
    fs.rmSync(statePath(stateDir), { force: true });
    dropStampedCustody();
  };
  if (resume) {
    // The ref is read with a fetch here (and only here): a fresh clone has no local ref yet.
    const held = hadShipped ? null : recordDirs.resolveRun(stateDir, null, { local: false });
    if (held && held.state.detached && held.state.version === 2 && sameWork(held.state.work)) {
      return { ok: true, status: held.state.status, errors: [], resumed: true };
    }
    recordRef.ensure({ stateDir, branch: work && work.branch });
    // Only this work's own detached run may be resumed, never another's restored record.
    dropRestoredRun((t) => sameWork(t.work));
  } else {
    // A plain start restores the folder's other records (closed.json, custody.json) so custody
    // anchors at the audited commit, but stays a fresh run: only --resume continues an earlier one.
    const e = recordRef.ensure({ stateDir, branch: work && work.branch });
    if (e.outcome === 'restored') {
      // ensure restores only into a folder without records, so any shipped.json now is restored.
      fs.rmSync(statePath(stateDir), { force: true });
      dropStampedCustody();
    } else {
      dropRestoredRun();
    }
  }
  if (fs.existsSync(statePath(stateDir))) {
    const existing = loadState(stateDir);
    if (!existing.state) return { ok: false, status: null, errors: [existing.error] };
    return { ok: true, status: existing.state.status, errors: [], resumed: true };
  }
  // No tracked file: only --resume may continue a detached record, and only this work's own.
  const match = resume ? matchingDetached(stateDir, work) : null;
  if (match) {
    // A run started before the ref: the pointer is how later reads find its folder record.
    recordDirs.writePointer(stateDir, { startedAt: match.startedAt, work: match.work });
    return { ok: true, status: match.status, errors: [], resumed: true };
  }

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
    work: { kind: work.kind, id: work.id, trd: work.trd || null, branch: work.branch || null, stateDir, forge_feature_id: process.env.FORGE_FEATURE_ID || null },
    policy: parsed.policy,
    steps: parsed.steps,
    cursor: { step: first.step.id, pass: 1 },
    results: [],
    status: 'running',
    shipped: false,
    startedAt: t,
    updatedAt: t,
    shippedAt: null,
    reproof: { count: 0, runs: [] },
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

/** Whether autonomy.md carries the standing-authorization sentence. */
function hasSentence(autonomyPath) {
  const autonomy = readText(autonomyPath);
  return autonomy != null && collapse(autonomy).includes(collapse(AUTHORIZATION_SENTENCE));
}

/** Authorized when autonomy.md carries the sentence, or the contract's `unless` holds. */
function isAuthorized(contract, { autonomyPath, settingsPath }) {
  if (contract.outward === 'no') return true;
  if (hasSentence(autonomyPath)) return true;
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
  let later = flat.slice(i + 1);
  // Another pass of the same repeat re-runs the whole body, this step included.
  if (entry.repeat && state.cursor.pass < entry.repeat.repeat.rounds + 1) {
    later.push(...flat.slice(0, i + 1).filter((e) => e.repeat === entry.repeat));
  }
  // A step with a loop: its body comes next only while a round is left (attempt p starts round p).
  if (entry.step.loop && state.cursor.pass > entry.step.loop.rounds) later = later.filter((e) => e.loopOf !== entry.step);
  // A loop body step: the owner is handed out again, and another round follows while one is left.
  if (entry.loopOf) {
    const owner = entry.loopOf;
    later.push(flat.find((e) => e.step === owner));
    if (state.cursor.pass < owner.loop.rounds) later.push(...flat.filter((e) => e.loopOf === owner));
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
    // Not local-only: the run ends STUCK here and no `record` follows to carry this save to origin.
    saveState(stateDir, state);
    return { action: 'stop', step: { id: entry.step.id, primitive: contract.primitive }, reason };
  }

  const input = {};
  for (const [name, spec] of Object.entries(contract.params)) {
    const v = entry.step.params[name] !== undefined ? entry.step.params[name] : spec.default;
    if (v !== null && v !== undefined) input[name] = v;
  }
  const final = entry.repeat
    ? state.cursor.pass === entry.repeat.repeat.rounds + 1
    : entry.loopOf
      ? state.cursor.pass === entry.loopOf.loop.rounds
      : false;
  Object.assign(input, {
    work: state.work,
    final,
    laterNeeds: laterNeedsOf(state, entry, contracts),
    context: mergedContext(state),
  });

  state.status = 'running'; // a wait or stop is over once the step is handed out again
  state.reason = null;
  state.handedOut = { step: entry.step.id, pass: state.cursor.pass };
  saveState(stateDir, state, { localOnly: true });
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
  } else if (entry.loopOf) {
    // A loop body step; the cursor's pass is the round number.
    const owner = entry.loopOf;
    const round = state.cursor.pass;
    const body = owner.loop.body;
    if (contract.repeatUntil && result === contract.repeatUntil) {
      state.cursor = { step: owner.id, pass: round + 1 };
    } else if (contract.stopsOn.includes(result)) {
      if (round < owner.loop.rounds) {
        state.cursor = { step: body[0].id, pass: round + 1 };
      } else {
        state.status = 'stuck';
        state.reason = `step ${owner.id} (${owner.primitive}) loop ended after ${owner.loop.rounds} rounds: step ${step} (${contract.primitive}) recorded ${result}`;
      }
    } else if (entry.bodyIndex + 1 < body.length) {
      state.cursor = { step: body[entry.bodyIndex + 1].id, pass: round };
    } else {
      state.cursor = { step: owner.id, pass: round + 1 };
    }
  } else if (entry.step.loop && result === entry.step.loop.on) {
    // Attempt p of the owner starts round p, while rounds remain.
    const l = entry.step.loop;
    if (state.cursor.pass <= l.rounds) {
      state.cursor = { step: l.body[0].id, pass: state.cursor.pass };
    } else {
      state.status = 'stuck';
      state.reason = `step ${step} (${contract.primitive}) loop ended after ${l.rounds} rounds: step ${step} (${contract.primitive}) recorded ${result}`;
    }
  } else if (contract.stopsOn.includes(result)) {
    // The cursor stays on this step, so next() never hands out the step after it.
    state.status = 'stuck';
    state.reason = `step ${step} (${contract.primitive}) recorded ${result}; the run stops here`;
  } else {
    moveToTop(state, entry.top + 1);
  }
  // Detach on a real result listed in detach-on, or on ANY result (stop and wait included) whose
  // data sets a detach-on-data key to true; only where a git directory exists.
  let detachedNow = false;
  const flagged = contract.detachOnData.some((k) => (data || {})[k] === true);
  const listed = result !== 'wait' && result !== 'stop' && contract.detachOn.includes(result);
  if (!state.detached && (listed || flagged)) {
    // Detachable wherever a place for the record exists: the ref, or the folder fallback.
    if (state.startedAt && (recordDirs.refTarget(stateDir) || recordDirs.recordDir(stateDir))) {
      state.detached = true;
      detachedNow = true;
    }
  }
  const saved = saveState(stateDir, state);
  let custodyDetach;
  if (detachedNow) {
    try {
      // Lazy: custody.js is not needed unless a run detaches. A failure never fails the record.
      custodyDetach = require('./custody').detach({ stateDir, startedAt: state.startedAt });
    } catch (e) {
      custodyDetach = { ok: false, action: 'none', path: null, reason: e.message };
    }
  }
  return { ok: true, recordPath: recordPathOf(stateDir, state), status: state.status, shipped: state.shipped, ...(state.reason ? { reason: state.reason } : {}), ...(custodyDetach ? { custodyDetach } : {}), ...writeIssues(saved) };
}

/**
 * Append one re-proof entry to the record's `reproof` block (created if the record predates it).
 * A re-proof happens inside a step, not as one, so this never touches the cursor or results.
 * Everything is computed here from the raw reconcile line and the reverified state file:
 * criteria = the line's `ids`; met = those with status `met` in the file (a missing, unreadable
 * or older-than-startedAt file counts as absent, so `[]`); classes = the distinct custody classes
 * of `differing`, plus `base` when `excused` is non-empty. The step fields name whichever step is
 * handed out (null when none): the record is reporting, not proof.
 * @returns {{ok: true, count: number, entry: object} | {ok: false, reason: string}}
 */
function recordReproof(stateDir, { custody, reverifiedPath, startedAt, outcome } = {}) {
  const loaded = loadState(stateDir);
  if (loaded.error) return { ok: false, reason: loaded.error };
  const { state } = loaded;
  if (state.status === 'done') return { ok: false, reason: 'the run is already done' };
  let line;
  try {
    line = typeof custody === 'string' ? JSON.parse(custody) : custody;
  } catch {
    return { ok: false, reason: 'custody is not valid JSON' };
  }
  if (!line || typeof line !== 'object' || typeof line.action !== 'string' || !Array.isArray(line.ids)) {
    return { ok: false, reason: 'custody needs an action and an ids array' };
  }
  const startMs = Date.parse(startedAt);
  if (!startedAt || Number.isNaN(startMs)) return { ok: false, reason: 'started-at is not a parseable time' };

  // The reverified file counts only if written since the run began: a leftover from an earlier
  // re-proof (this run wrote none) must not be read as this run's result.
  let reverified = null;
  try {
    if (reverifiedPath && fs.statSync(reverifiedPath).mtimeMs >= startMs) {
      reverified = JSON.parse(fs.readFileSync(reverifiedPath, 'utf8'));
    }
  } catch {
    reverified = null;
  }
  // Last entry per id wins, as custody.js reconcile reads the same file, so the two never disagree.
  const judged = new Map(
    (reverified && Array.isArray(reverified.criteria) ? reverified.criteria : []).filter((c) => c).map((c) => [c.id, c]),
  );
  const met = line.ids
    .map((id) => judged.get(id))
    .filter((c) => c && c.status === 'met')
    .map((c) => ({ id: c.id, retried: c.retried === true }));

  // Lazy: custody.js is only needed here, as in record().
  const { classifyPath } = require('./custody');
  const trd = state.work && state.work.trd;
  const trdRel = trd && trd !== 'none' ? path.relative(process.cwd(), path.resolve(trd)).split(path.sep).join('/') : null;
  const differing = Array.isArray(line.differing) ? line.differing : [];
  const excused = Array.isArray(line.excused) ? line.excused : [];
  const classes = [...new Set(differing.map((p) => classifyPath(p, trdRel)))];
  if (excused.length) classes.push('base');

  const h = state.handedOut;
  const handed = h ? locate(state, h.step) : null;
  const ended = now();
  const entry = {
    step: h ? h.step : null,
    primitive: handed ? handed.step.primitive : null,
    pass: h ? h.pass : null,
    criteria: line.ids,
    met,
    outcome: outcome || (reverified && reverified.outcome) || null,
    custody: { action: line.action, classes, differing, excused },
    startedAt,
    endedAt: ended,
    durationSeconds: Math.max(0, Math.round((Date.parse(ended) - startMs) / 1000)),
  };
  if (!state.reproof) state.reproof = { count: 0, runs: [] };
  state.reproof.runs.push(entry);
  state.reproof.count = state.reproof.runs.length;
  saveState(stateDir, state);
  return { ok: true, count: state.reproof.count, entry };
}

function status(stateDir) {
  const loaded = loadState(stateDir);
  if (loaded.error) return { status: null, error: loaded.error };
  const { state } = loaded;
  const steps = flatten(state.steps).map((e) => {
    const last = [...state.results].reverse().find((r) => r.step === e.step.id);
    return {
      id: e.step.id,
      primitive: e.step.primitive,
      result: last ? last.result : null,
      pass: last ? last.pass : null,
      ...(e.loopOf ? { loop: true } : {}),
    };
  });
  const out = { recordPath: recordPathOf(stateDir, state), custodyPath: recordDirs.custodyPath(stateDir), status: state.status, shipped: state.shipped, policy: state.policy, cursor: state.cursor, steps };
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
  const sentence = hasSentence(autonomyPath) ? 'present' : 'absent';
  const listed = [];
  for (const step of parse(text, contracts).steps) {
    for (const s of step.primitive === 'repeat' ? step.body : [step, ...(step.loop ? step.loop.body : [])]) listed.push(s.primitive);
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
  'usage: ship-sequencer.js parse --policy <file> | authorization --policy <file> | start --state-dir <d> --policy <f> --fallback <s> --kind <k> --id <id> [--trd <p>] [--branch <b>] | next --state-dir <d> | record --state-dir <d> --step <id> --result <r> [--data <json>] [--reason <t>] | reproof --state-dir <d> --custody <json> --reverified <f> --started-at <iso> [--outcome <w>] | status --state-dir <d>   (all: [--contracts <dir>] [--autonomy <f>] [--settings <f>])\n';

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
      resume: argv.includes('--resume'),
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
  // A missing --custody or --started-at is refused as ok:false (never a usage exit): the gate
  // treats a refused re-proof record as a readout line, not a stop.
  if (cmd === 'reproof' && stateDir) {
    emit(recordReproof(stateDir, {
      custody: arg('--custody'),
      reverifiedPath: arg('--reverified'),
      startedAt: arg('--started-at'),
      outcome: arg('--outcome'),
    }));
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
  recordReproof,
  status,
};
