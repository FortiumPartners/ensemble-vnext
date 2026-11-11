'use strict';

/**
 * ci-baseline.js -- reads a project's GitHub Actions workflows and reports whether three CI
 * properties hold that /ship-build's churn-free shipping depends on. It REPORTS; it never edits
 * a workflow and writes nothing.
 *
 * The three checks (names are the keys of `checks` in the result):
 *   summary          one always-run job that gates on every other job's result, in a workflow
 *                    with no trigger-level path filter, so a required check never sits pending.
 *   docsRecordSkip   every heavy job is skipped on a docs-only and on a record-only change set,
 *                    by a JOB-level condition (dorny/paths-filter output), not a trigger filter.
 *   recordCommitSkip a custody / ship-record commit pushed onto an open PR does not run the
 *                    heavy jobs.
 * Each is `pass`, `gap` (CI is wrong for this) or `unclear` (a mechanism this reader cannot
 * evaluate: reported, never guessed as a pass and never nagged as a gap).
 *
 * DEPENDENCY-FREE ON PURPOSE: only fs, path and ./record-files. This file is copied into
 * consuming projects' `.claude/lib/`, which have no node_modules, so `js-yaml` is not usable;
 * `parseYaml` below reads the subset of YAML that workflow files use.
 *
 * CLI (run from the project root; prints ONE JSON line and exits 0, usage errors included):
 *   node ci-baseline.js check [--dir <workflows dir>]     (default .github/workflows)
 *
 * Example: `node .claude/lib/ci-baseline.js check` ->
 *   {"ok":false,"noCi":false,"workflows":["ci.yml"],"checks":{...},"gaps":[...],"unclear":[]}
 */

const fs = require('fs');
const path = require('path');
const { isRecordFile } = require('./record-files');

/** Change sets a docs-only / record-only commit would carry. */
const DOCS_PROBE = ['README.md', 'docs/guide.md'];
const RECORD_PROBE = ['.trd-state/feature/custody.json', '.trd-state/feature/shipped.json', '.claude/verification-notes.md'];

// A probe that stops being a record file would silently make check (b) test the wrong thing.
for (const p of RECORD_PROBE) {
  if (!isRecordFile(p)) throw new Error(`ci-baseline: RECORD_PROBE entry ${p} is not a record file`);
}

// ---------------------------------------------------------------------------------------------
// YAML subset reader
// ---------------------------------------------------------------------------------------------

const unsupported = (msg) => new Error(`unsupported: ${msg}`);
const perr = (line, msg) => new Error(`parse: ${line ? `line ${line.n}: ` : ''}${msg}`);

/** Cuts a trailing `# comment`, honouring quoted scalars that START a value. */
function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) {
        if (q === "'" && s[i + 1] === "'") { i++; continue; }
        q = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i - 1;
      while (j >= 0 && /\s/.test(s[j])) j--;
      if (j < 0 || ':,[{-'.includes(s[j])) q = c;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

/** Reads a quoted scalar starting at s[start]; returns {value, end} (end is past the closing quote). */
function readQuoted(s, start, line) {
  const q = s[start];
  let out = '';
  let i = start + 1;
  while (i < s.length) {
    const c = s[i];
    if (q === "'") {
      if (c === "'") {
        if (s[i + 1] === "'") { out += "'"; i += 2; continue; }
        return { value: out, end: i + 1 };
      }
      out += c; i++; continue;
    }
    if (c === '"') return { value: out, end: i + 1 };
    if (c === '\\') {
      const n = s[i + 1];
      const simple = { n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' ' };
      if (n in simple) { out += simple[n]; i += 2; continue; }
      if (n === 'x' || n === 'u') {
        const len = n === 'x' ? 2 : 4;
        const hex = s.slice(i + 2, i + 2 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw perr(line, 'bad escape in quoted scalar');
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2 + len; continue;
      }
      out += n; i += 2; continue;
    }
    out += c; i++;
  }
  throw perr(line, 'unterminated quoted scalar');
}

/** Typed plain scalar (YAML 1.2 core schema subset). */
function plainScalar(s) {
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^(null|Null|NULL|~)$/.test(s)) return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function checkIndicator(s, line) {
  if (s && '&*!'.includes(s[0])) throw unsupported(`anchors, aliases and tags (line ${line ? line.n : '?'})`);
}

function scalar(s, line) {
  checkIndicator(s, line);
  if (s[0] === '"' || s[0] === "'") {
    const r = readQuoted(s, 0, line);
    if (s.slice(r.end).trim() !== '') throw perr(line, 'text after quoted scalar');
    return r.value;
  }
  return plainScalar(s);
}

/** True when every [ and { opened outside quotes in s is closed. */
function balanced(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      try { i = readQuoted(s, i).end - 1; } catch (e) { return false; }
    } else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
  }
  return depth <= 0;
}

/** Parses a complete flow collection / scalar string such as `[a, "b"]` or `{k: v}`. */
function parseFlow(s, line) {
  const st = { i: 0 };
  const ws = () => { while (st.i < s.length && /\s/.test(s[st.i])) st.i++; };
  const plain = (stops) => {
    const from = st.i;
    while (st.i < s.length && !stops.includes(s[st.i])) {
      if (s[st.i] === ':' && stops.includes(':') && (st.i + 1 >= s.length || /[\s,\]}]/.test(s[st.i + 1]))) break;
      if (s[st.i] === ':' && !stops.includes(':')) { st.i++; continue; }
      st.i++;
    }
    return s.slice(from, st.i).trim();
  };
  const value = (stops) => {
    ws();
    const c = s[st.i];
    if (c === '[') {
      st.i++;
      const arr = [];
      for (;;) {
        ws();
        if (s[st.i] === ']') { st.i++; return arr; }
        arr.push(value(',]'));
        ws();
        if (s[st.i] === ',') { st.i++; continue; }
        if (s[st.i] === ']') { st.i++; return arr; }
        throw perr(line, 'bad flow sequence');
      }
    }
    if (c === '{') {
      st.i++;
      const obj = {};
      for (;;) {
        ws();
        if (s[st.i] === '}') { st.i++; return obj; }
        let key;
        if (s[st.i] === '"' || s[st.i] === "'") { const r = readQuoted(s, st.i, line); key = r.value; st.i = r.end; }
        else key = plain(',}:');
        checkIndicator(key, line);
        ws();
        let v = null;
        if (s[st.i] === ':') { st.i++; ws(); if (s[st.i] !== ',' && s[st.i] !== '}') v = value(',}'); }
        if (key === '__proto__') throw unsupported('__proto__ key');
        obj[key] = v;
        ws();
        if (s[st.i] === ',') { st.i++; continue; }
        if (s[st.i] === '}') { st.i++; return obj; }
        throw perr(line, 'bad flow mapping');
      }
    }
    if (c === '"' || c === "'") { const r = readQuoted(s, st.i, line); st.i = r.end; return r.value; }
    const text = plain(stops);
    checkIndicator(text, line);
    return text === '' ? null : plainScalar(text);
  };
  const v = value('');
  ws();
  if (st.i < s.length) throw perr(line, 'text after flow collection');
  return v;
}

/** `key: rest` split, or null when the text is not a mapping entry. */
function keySplit(text, line) {
  if (!text || '[{|>'.includes(text[0])) return null;
  let key;
  let from = 0;
  if (text[0] === '"' || text[0] === "'") {
    let r;
    try { r = readQuoted(text, 0, line); } catch (e) { return null; }
    key = r.value;
    from = r.end;
    const after = text.slice(from);
    if (!/^\s*:(\s|$)/.test(after)) return null;
    return { key, rest: after.replace(/^\s*:/, '').trim() };
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ':' && (i + 1 === text.length || text[i + 1] === ' ')) {
      return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
    }
  }
  return null;
}

const isSeqLine = (t) => t === '-' || t.startsWith('- ');

/**
 * Parses the YAML subset GitHub workflow files use: block maps and sequences, flow
 * sequences/maps, quoted and plain scalars, `|` / `>` block scalars, comments.
 * Map keys stay strings (so `on` is the string "on", never boolean true).
 * @param {string} text
 * @returns {*} the parsed value (null for an empty document)
 * @throws {Error} message starts "unsupported:" (anchors, aliases, tags, merge keys,
 *   multi-document) or "parse:" (malformed input)
 */
function parseYaml(text) {
  try {
    return parseYamlUnchecked(String(text));
  } catch (e) {
    if (e && /^(unsupported|parse):/.test(e.message)) throw e;
    throw new Error(`parse: ${e && e.message}`);
  }
}

function parseYamlUnchecked(text) {
  const L = text.replace(/\r\n?/g, '\n').split('\n').map((raw, i) => {
    // Spaces only: a tab after the indentation is content (legal inside a block scalar).
    const indent = raw.length - raw.replace(/^ +/, '').length;
    const t = stripComment(raw.slice(indent));
    return { n: i + 1, raw, indent, text: t, blank: t === '' };
  });
  let seenContent = false;
  for (const l of L) {
    if (l.blank) continue;
    if (/^(---|\.\.\.)(\s|$)/.test(l.raw)) {
      if (!seenContent && l.text === '---') { l.blank = true; continue; }
      throw unsupported('multi-document YAML');
    }
    seenContent = true;
  }
  let pos = 0;
  // Tab indentation is checked here, on structural lines only: block-scalar lines are consumed
  // by blockScalar() and never pass through peek(), so a tab inside a `run: |` script is fine.
  const peek = () => {
    while (pos < L.length && L[pos].blank) pos++;
    if (pos < L.length && /^ *\t/.test(L[pos].raw)) throw perr(L[pos], 'tab used for indentation');
    return pos < L.length ? L[pos] : null;
  };

  function blockScalar(header, indent, line) {
    const m = /^([|>])([+-]?)(\d?)([+-]?)$/.exec(header);
    if (!m) throw perr(line, `bad block scalar header "${header}"`);
    const chomp = m[2] || m[4];
    let blockIndent = m[3] ? indent + Number(m[3]) : null;
    const lines = [];
    let i = pos;
    for (; i < L.length; i++) {
      const raw = L[i].raw;
      if (raw.trim() === '') { lines.push(''); continue; }
      if (blockIndent === null) {
        if (L[i].indent <= indent) break;
        blockIndent = L[i].indent;
      }
      if (L[i].indent < blockIndent) break;
      lines.push(raw.slice(blockIndent));
    }
    pos = i;
    let trailing = 0;
    while (lines.length && lines[lines.length - 1] === '') { lines.pop(); trailing++; }
    if (!lines.length) return '';
    let body;
    if (m[1] === '|') body = lines.join('\n');
    else {
      body = '';
      let blanks = 0;
      let started = false;
      for (const ln of lines) {
        if (ln === '') { blanks++; continue; }
        if (started) body += blanks ? '\n'.repeat(blanks) : ' ';
        body += ln; blanks = 0; started = true;
      }
    }
    if (chomp === '-') return body;
    if (chomp === '+') return `${body}${'\n'.repeat(1 + trailing)}`;
    return `${body}\n`;
  }

  /** Value after `key:` or `- `; `rest` is the text on the same line. */
  function parseValue(rest, indent, line, inSeq) {
    if (rest === '') {
      const nx = peek();
      if (nx && nx.indent > indent) return parseNode(nx.indent);
      if (!inSeq && nx && nx.indent === indent && isSeqLine(nx.text)) return parseSeq(indent);
      return null;
    }
    checkIndicator(rest, line);
    if (rest[0] === '|' || rest[0] === '>') return blockScalar(rest, indent, line);
    if (rest[0] === '[' || rest[0] === '{') {
      let s = rest;
      while (!balanced(s)) {
        if (pos >= L.length) throw perr(line, 'unterminated flow collection');
        s += ` ${L[pos].text}`;
        pos++;
      }
      return parseFlow(s, line);
    }
    if (rest[0] === '"' || rest[0] === "'") return scalar(rest, line);
    let s = rest;
    for (;;) {
      const nx = peek();
      if (nx && nx.indent > indent) { s += ` ${nx.text}`; pos++; } else break;
    }
    return scalar(s, line);
  }

  function parseSeq(indent) {
    const out = [];
    for (;;) {
      const l = peek();
      if (!l || l.indent !== indent || !isSeqLine(l.text)) {
        if (l && l.indent > indent) throw perr(l, 'unexpected indentation');
        break;
      }
      const after = l.text === '-' ? '' : l.text.slice(2);
      const rest = after.trimStart();
      const lead = after.length - rest.length;
      if (rest !== '' && (isSeqLine(rest) || keySplit(rest, l))) {
        // `- key: v` / `- - x`: re-read the line as if the entry began at its own column.
        l.indent = indent + 2 + lead;
        l.text = rest;
        out.push(parseNode(l.indent));
      } else {
        pos++;
        out.push(parseValue(rest, indent, l, true));
      }
    }
    return out;
  }

  function parseMap(indent) {
    const out = {};
    for (;;) {
      const l = peek();
      if (!l || l.indent < indent || isSeqLine(l.text)) break;
      if (l.indent > indent) throw perr(l, 'unexpected indentation');
      const ks = keySplit(l.text, l);
      if (!ks) throw perr(l, 'expected "key: value"');
      checkIndicator(ks.key, l);
      if (ks.key === '<<') throw unsupported('merge keys');
      if (ks.key === '__proto__') throw unsupported('__proto__ key');
      pos++;
      out[ks.key] = parseValue(ks.rest, indent, l, false);
    }
    return out;
  }

  function parseNode(minIndent) {
    const l = peek();
    if (!l || l.indent < minIndent) return null;
    if (isSeqLine(l.text)) return parseSeq(l.indent);
    if (keySplit(l.text, l)) return parseMap(l.indent);
    pos++;
    return parseValue(l.text, l.indent - 1, l, true);
  }

  const result = parseNode(0);
  const extra = peek();
  if (extra) throw perr(extra, 'unexpected content');
  return result;
}

// ---------------------------------------------------------------------------------------------
// GitHub / picomatch-style glob matching (dot: true)
// ---------------------------------------------------------------------------------------------

const REGEX_SPECIAL = /[.+^$()|\\/-]/;

function globToRegex(glob) {
  let re = '';
  let depth = 0;
  const n = glob.length;
  for (let i = 0; i < n; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atStart = i === 0 || glob[i - 1] === '/';
        const j = i + 2;
        if (atStart && glob[j] === '/') { re += '(?:.*/)?'; i = j; continue; }
        if (atStart && j >= n) { re += '.*'; i = j - 1; continue; }
        re += '[^/]*'; i = j - 1; continue;
      }
      re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const close = glob.indexOf(']', i + 2);
      if (close < 0) { re += '\\['; continue; }
      let body = glob.slice(i + 1, close);
      let neg = false;
      if (body[0] === '!' || body[0] === '^') { neg = true; body = body.slice(1); }
      re += `[${neg ? '^' : ''}${body.replace(/\\/g, '\\\\')}]`;
      i = close;
    } else if (c === '{') { depth++; re += '(?:'; }
    else if (c === '}' && depth > 0) { depth--; re += ')'; }
    else if (c === ',' && depth > 0) re += '|';
    else if (c === '\\' && i + 1 < n) { re += `\\${glob[i + 1]}`; i++; }
    else re += REGEX_SPECIAL.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

/**
 * dorny/paths-filter semantics for ONE filter: the file matches when ANY pattern matches it,
 * and a `!p` pattern matches when `p` does NOT (picomatch, dot: true, so `**` matches dotfiles).
 * @param {string[]} patterns
 * @param {string} file repo-relative, forward-slash path
 * @returns {boolean}
 */
function matchesFilter(patterns, file) {
  return patterns.some((p) => (p.startsWith('!') ? !globToRegex(p.slice(1)).test(file) : globToRegex(p).test(file)));
}

// ---------------------------------------------------------------------------------------------
// Workflow analysis
// ---------------------------------------------------------------------------------------------

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normTriggers(on) {
  if (typeof on === 'string') return { [on]: {} };
  if (Array.isArray(on)) return Object.fromEntries(on.map((e) => [String(e), {}]));
  if (isMap(on)) return Object.fromEntries(Object.entries(on).map(([k, v]) => [k, isMap(v) ? v : {}]));
  return {};
}

/** Triggers that make a workflow run on work-in-progress branches. */
function scopeTriggers(trg) {
  const names = [];
  for (const t of ['pull_request', 'pull_request_target']) if (trg[t]) names.push(t);
  // A push trigger that names only tags (tags / tags-ignore, no branches key) never runs on a
  // branch push, so it is out of scope like `branches: [main]`.
  // A `branches:` list holding a glob or a negation (`'**'`, `feature/*`, `'!main'`) reaches
  // work-in-progress branches too, so it is in scope; only a list of literal names is not.
  const p = trg.push;
  const wildBranches = p && 'branches' in p && asList(p.branches).some((b) => /[*?[!]/.test(String(b)));
  if (p && ('branches-ignore' in p || wildBranches || !('branches' in p || 'tags' in p || 'tags-ignore' in p))) names.push('push');
  return names;
}

/**
 * True when a job's `if:` plainly keeps it off work-in-progress branches: one `&&` term (and no
 * `||`) that pins a literal branch or tag ref, names an event that is never a branch push or PR,
 * or requires `push` where push is out of scope. Any other mention of github.event_name or
 * github.ref (e.g. `== 'pull_request'`) does not excuse the job.
 */
function offWipBranches(cond, scope) {
  if (cond === null || /\|\|/.test(cond)) return false;
  const ev = (name) => new RegExp(`github\\.event_name\\s*==\\s*['"]${name}['"]`);
  return cond.split('&&').map((t) => t.trim().replace(/^\(+|\)+$/g, '')).some((t) =>
    /^github\.ref\s*==\s*['"]refs\/(heads|tags)\/[^'"*?[]+['"]$/.test(t) ||
    /^startsWith\(\s*github\.ref\s*,\s*['"]refs\/tags\/['"]\s*\)$/.test(t) ||
    ['release', 'schedule', 'workflow_dispatch', 'repository_dispatch', 'merge_group'].some((n) => ev(n).test(t)) ||
    (!scope.includes('push') && ev('push').test(t)) ||
    (!scope.includes('push') && /github\.event_name\s*!=\s*['"]pull_request['"]/.test(t))
  );
}

function ifText(job) {
  if (job.if == null) return null;
  const s = String(job.if).trim();
  const m = /^\$\{\{([\s\S]*)\}\}$/.exec(s);
  return (m ? m[1] : s).trim();
}

const RE_ALWAYS = /(^|[^\w])always\(\)|!\s*cancelled\(\)/;
const RE_READS_RESULTS = /needs\.(\*|[\w-]+)\.result|toJSON\(\s*needs\s*\)|re-actors\/alls-green/;

/** Parses one workflow into the structure the checks read; throws parse:/unsupported:. */
function analyse(file, text) {
  const wf = parseYaml(text);
  if (!isMap(wf) || !isMap(wf.jobs)) throw new Error('parse: no "jobs" map');
  const triggers = normTriggers(wf.on);
  const scope = scopeTriggers(triggers);
  const jobs = {};
  for (const [id, job] of Object.entries(wf.jobs)) jobs[id] = isMap(job) ? job : {};
  const ids = Object.keys(jobs);
  const role = {};
  for (const id of ids) {
    const cond = ifText(jobs[id]);
    const needs = asList(jobs[id].needs).map(String);
    const readsNeeds = needs.length > 0 && RE_READS_RESULTS.test(JSON.stringify(jobs[id]));
    const alwaysIf = cond !== null && RE_ALWAYS.test(cond);
    const readsOutputs = ids.some((o) => o !== id && ifText(jobs[o]) !== null && new RegExp(`needs\\.${escRe(id)}\\.outputs`).test(ifText(jobs[o])));
    if (offWipBranches(cond, scope)) role[id] = 'event';
    else if (readsOutputs) role[id] = 'detect';
    else if (needs.length > 0 && (alwaysIf || readsNeeds)) role[id] = 'summary';
    else role[id] = 'heavy';
  }
  // Only ONE job is the summary: the candidate needing the most jobs. Any other always()/
  // !cancelled() job with needs (an e2e or report job run after the tests) is a heavy job and
  // must be gated like one, not waved through as a second summary.
  const gates = ids.filter((id) => role[id] === 'summary');
  const gate = gates.reduce((a, id) => (a === null || asList(jobs[id].needs).length > asList(jobs[a].needs).length ? id : a), null);
  for (const id of gates) if (id !== gate) role[id] = 'heavy';
  return { file, triggers, scope, jobs, role, ids };
}

function checkSummary(wfs) {
  const pr = wfs.filter((w) => w.triggers.pull_request && w.scope.includes('pull_request'));
  if (!pr.length) {
    return { status: 'gap', detail: 'No workflow runs on pull requests, so there is no summary check to require.', messages: ['No workflow runs on pull requests, so there is no summary check to require; add a pull_request workflow with one always-run job that needs every other job.'] };
  }
  const messages = [];
  for (const w of pr) {
    const problems = [];
    const cfg = w.triggers.pull_request;
    if (cfg.paths || cfg['paths-ignore']) {
      problems.push('its pull_request trigger has a paths/paths-ignore filter, so the whole workflow is skipped on a filtered push and a required check sits pending; move the filtering into job-level conditions');
    }
    const candidates = w.ids.filter((id) => w.role[id] === 'summary');
    const others = (id) => w.ids.filter((o) => o !== id && w.role[o] !== 'event');
    let best = null;
    for (const id of candidates) {
      const job = w.jobs[id];
      const cond = ifText(job);
      const p = [];
      if (!(cond !== null && RE_ALWAYS.test(cond))) p.push('its if: lacks always() or !cancelled(), so a job skipped by a condition counts as success');
      const needs = asList(job.needs).map(String);
      const missing = others(id).filter((o) => !needs.includes(o));
      if (missing.length) p.push(`it does not list ${missing.join(', ')} in needs:`);
      if (!RE_READS_RESULTS.test(JSON.stringify(job))) p.push('it never reads its needs\' results (needs.<job>.result, toJSON(needs) or re-actors/alls-green), so it reports success when tests fail');
      if (!best || p.length < best.p.length) best = { id, p };
    }
    if (!best) problems.push('it has no summary job (an always-run job that needs every other job and checks their results)');
    else problems.push(...best.p.map((x) => `summary job "${best.id}": ${x}`));
    if (!problems.length) {
      return { status: 'pass', detail: `${w.file} job "${best.id}" always runs, needs every other job and checks their results. Record commits must never carry [skip ci]: it skips every workflow, the summary included.`, messages: [] };
    }
    messages.push(`${w.file}: ${problems.join('; ')}.`);
  }
  return { status: 'gap', detail: `${messages.join(' ')} Record commits must never carry [skip ci].`, messages };
}

/** Resolves needs.X.outputs.Y to a detector: {type:'dorny', step, patternsOf} | {type:'run', script} | {unclear}. */
function resolveDetector(w, x, y) {
  const job = w.jobs[x];
  if (!job) return { unclear: `its condition reads needs.${x}, which is not a job in ${w.file}` };
  const out = isMap(job.outputs) ? job.outputs[y] : undefined;
  const m = /^\s*\$\{\{\s*steps\.([\w-]+)\.outputs\.([\w-]+)\s*\}\}\s*$/.exec(String(out));
  if (!m) return { unclear: `output "${y}" of job "${x}" is not a plain steps.<id>.outputs.<name> reference` };
  const step = asList(job.steps).find((s) => isMap(s) && s.id === m[1]);
  if (!step) return { unclear: `job "${x}" has no step with id "${m[1]}"` };
  if (typeof step.uses === 'string' && step.uses.startsWith('dorny/paths-filter')) {
    const wth = isMap(step.with) ? step.with : {};
    if (String(wth['predicate-quantifier']) === 'every') return { unclear: `step "${m[1]}" uses predicate-quantifier: every, which this check does not evaluate` };
    let filters = wth.filters;
    if (typeof filters === 'string') {
      try { filters = parseYaml(filters); } catch (e) { filters = null; }
    }
    if (!isMap(filters)) return { unclear: `step "${m[1]}" reads its filters from a file or a form this check cannot read; use an inline filters: block` };
    const pats = filters[m[2]];
    const list = asList(pats);
    if (pats === undefined || list.some((p) => typeof p !== 'string')) return { unclear: `filter "${m[2]}" in step "${m[1]}" is missing or not a plain list of patterns` };
    for (const p of list) {
      try { globToRegex(p.startsWith('!') ? p.slice(1) : p); } catch (e) {
        return { unclear: `filter "${m[2]}" in step "${m[1]}" has a pattern this check cannot read: ${p}` };
      }
    }
    return { type: 'dorny', with: wth, patterns: list };
  }
  if (typeof step.run === 'string') return { type: 'run', script: step.run };
  return { unclear: `step "${m[1]}" is neither dorny/paths-filter nor a run: script` };
}

const TERM_OUTPUT = /^needs\.([\w-]+)\.outputs\.([\w-]+)(\s*==\s*(?:'true'|"true"))?$/;
const TERM_PLAIN = new Set(['success()', 'always()', '!cancelled()']);

/** Evaluates one heavy job for checks (b) and (c). */
function evalJob(w, id) {
  const where = `${w.file} job "${id}"`;
  const cond = ifText(w.jobs[id]);
  if (cond === null) {
    return {
      b: { status: 'gap', message: `${where} has no if:, so it runs on docs-only and record-only changes; gate it on a change-detection job's output.` },
      c: { status: 'gap', message: `${where} has no if:, so a custody or ship-record commit pushed onto a PR runs it.` },
    };
  }
  const unclear = (msg) => ({ b: { status: 'unclear', message: `${where}: ${msg}` }, c: { status: 'unclear', message: `${where}: ${msg}` } });
  const terms = cond.split('&&').map((t) => t.trim());
  const dets = [];
  for (const t of terms) {
    if (TERM_PLAIN.has(t)) continue;
    const m = TERM_OUTPUT.exec(t);
    if (!m) return unclear(`its if: contains "${t}", a form this check does not recognise`);
    if (!m[3]) {
      // Job outputs are strings and only '' is falsy, so paths-filter's 'false' reads as true.
      const msg = `${where}: its if: tests needs.${m[1]}.outputs.${m[2]} without == 'true'; a job output is a string and 'false' counts as true, so the job always runs. Compare it to 'true'.`;
      return { b: { status: 'gap', message: msg }, c: { status: 'gap', message: msg } };
    }
    const d = resolveDetector(w, m[1], m[2]);
    if (d.unclear) return unclear(d.unclear);
    dets.push(d);
  }
  if (!dets.length) {
    return {
      b: { status: 'gap', message: `${where} has an if: that never skips it on a docs-only or record-only change.` },
      c: { status: 'gap', message: `${where} has an if: that never skips it for a record commit.` },
    };
  }
  const dorny = dets.filter((d) => d.type === 'dorny');
  const runs = dets.filter((d) => d.type === 'run');
  const skips = (probe) => dorny.some((d) => !probe.some((f) => matchesFilter(d.patterns, f)));
  const docsSkip = skips(DOCS_PROBE);
  const recSkip = skips(RECORD_PROBE);

  let b;
  if (docsSkip && recSkip) b = { status: 'pass', message: '' };
  else if (runs.length) b = { status: 'unclear', message: `${where} is gated by a run: script this check cannot evaluate against docs-only and record-only changes.` };
  else {
    const which = [!docsSkip && 'a docs-only change', !recSkip && 'a record-only change'].filter(Boolean).join(' or ');
    b = { status: 'gap', message: `${where} still runs on ${which}; its paths-filter patterns match those files.` };
  }

  let c;
  if (w.scope.includes('pull_request') || w.scope.includes('pull_request_target')) {
    const good = dorny.some((d) => d.with.token === '' && /github\.event\.before/.test(String(d.with.base)) && !RECORD_PROBE.some((f) => matchesFilter(d.patterns, f)))
      || runs.some((r) => /github\.event\.before/.test(r.script) && /\.trd-state/.test(r.script));
    if (good) c = { status: 'pass', message: '' };
    else if (dorny.length && !runs.length) {
      c = { status: 'gap', message: `${where}: on pull_request, dorny/paths-filter reads the whole PR diff, so a record commit still runs it; set token: '' and base to \${{ github.event.before }} so it diffs only the pushed commits (and make sure record-only changes skip it).` };
    } else {
      const refs = runs.some((r) => /github\.event\.before/.test(r.script));
      c = { status: 'unclear', message: `${where}: its run: detector ${refs ? 'uses github.event.before but never names .trd-state' : 'does not diff against github.event.before'}, so this check cannot tell whether a record commit skips it.` };
    }
  } else if (recSkip) c = { status: 'pass', message: '' };
  else c = { status: b.status === 'unclear' ? 'unclear' : 'gap', message: `${where} is not skipped on a record-only push (see docsRecordSkip).` };
  return { b, c };
}

function checkGates(wfs) {
  const entries = { b: [], c: [] };
  const heavyJobs = [];
  for (const w of wfs) {
    if (!w.scope.length) continue;
    const heavy = w.ids.filter((id) => w.role[id] === 'heavy');
    if (!heavy.length) continue;
    const filtered = w.scope.filter((t) => w.triggers[t].paths || w.triggers[t]['paths-ignore']);
    if (filtered.length) {
      const msg = `${w.file} filters its ${filtered.join('/')} trigger by paths/paths-ignore: the whole workflow vanishes on a filtered push, so its checks sit pending if required; filter per job instead.`;
      entries.b.push({ status: 'gap', message: msg });
      entries.c.push({ status: 'gap', message: msg });
    }
    for (const id of heavy) {
      heavyJobs.push(`${w.file}:${id}`);
      const r = evalJob(w, id);
      entries.b.push(r.b);
      entries.c.push(r.c);
    }
  }
  const fold = (list, passDetail) => {
    const worst = list.some((e) => e.status === 'gap') ? 'gap' : list.some((e) => e.status === 'unclear') ? 'unclear' : 'pass';
    const messages = list.filter((e) => e.message).map((e) => e);
    return {
      status: worst,
      detail: worst === 'pass' ? passDetail : messages.map((e) => e.message).join(' '),
      gaps: messages.filter((e) => e.status === 'gap').map((e) => e.message),
      unclear: messages.filter((e) => e.status === 'unclear').map((e) => e.message),
    };
  };
  const none = 'No job runs on work-in-progress branches, so there is nothing to skip.';
  const jobsText = heavyJobs.length ? ` (${heavyJobs.join(', ')})` : '';
  return {
    docsRecordSkip: fold(entries.b, heavyJobs.length ? `Every heavy job${jobsText} is skipped on docs-only and record-only changes by a job-level condition.` : none),
    recordCommitSkip: fold(entries.c, heavyJobs.length ? `A record commit pushed onto a PR does not run the heavy jobs${jobsText}.` : none),
  };
}

/**
 * Checks a set of workflow files. `gaps` and `unclear` hold at most one `{check, message}` per
 * check: every message a check raised, joined into one.
 * @param {Array<{file: string, text?: string, error?: string}>} files
 * @returns {{ok: boolean, noCi: boolean, workflows: string[], checks: object, gaps: Array, unclear: Array}}
 */
function checkWorkflows(files) {
  const names = ['summary', 'docsRecordSkip', 'recordCommitSkip'];
  const result = { ok: false, noCi: false, workflows: files.map((f) => f.file), checks: {}, gaps: [], unclear: [] };
  if (!files.length) {
    const msg = 'No GitHub Actions workflow was found (.github/workflows/*.yml|yaml); other CI systems are not read.';
    result.noCi = true;
    for (const n of names) {
      result.checks[n] = { status: 'gap', detail: msg };
      result.gaps.push({ check: n, message: msg });
    }
    return result;
  }
  const parsed = [];
  const bad = [];
  for (const f of files) {
    try {
      if (f.error) throw new Error(`parse: ${f.error}`);
      parsed.push(analyse(f.file, f.text));
    } catch (e) {
      bad.push({ file: f.file, message: String(e.message).replace(/^(unsupported|parse):\s*/, '') });
    }
  }
  // With an unreadable file and no readable pull_request workflow, "no summary" would be a guess:
  // the unreadable file may hold it. That is unclear, not a gap.
  const s = bad.length && !parsed.some((w) => w.triggers.pull_request)
    ? { status: 'unclear', detail: '', messages: [] }
    : checkSummary(parsed);
  const g = checkGates(parsed);
  const parts = {
    summary: { ...s, gaps: s.status === 'gap' ? s.messages : [], unclear: [] },
    docsRecordSkip: g.docsRecordSkip,
    recordCommitSkip: g.recordCommitSkip,
  };
  for (const n of names) {
    const p = parts[n];
    let { status, detail } = p;
    const unclear = [...p.unclear];
    for (const b of bad) unclear.push(`${b.file} could not be read (${b.message}), so this check cannot be sure.`);
    if (bad.length && status !== 'gap') {
      status = 'unclear';
      detail = unclear.join(' ');
    }
    result.checks[n] = { status, detail };
    // One entry per check, never one per offending job: the per-job list already sits in
    // checks.<name>.detail, and a reader groups its report by check.
    if (p.gaps.length) result.gaps.push({ check: n, message: p.gaps.join(' ') });
    if (unclear.length) result.unclear.push({ check: n, message: unclear.join(' ') });
  }
  result.ok = names.every((n) => result.checks[n].status === 'pass');
  return result;
}

/** Reads `*.yml|*.yaml` directly inside `dir` (not recursive) and checks them. A missing dir is "no CI". */
function checkDir(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)).sort();
  } catch (e) {
    names = [];
  }
  const files = names.map((file) => {
    try {
      return { file, text: fs.readFileSync(path.join(dir, file), 'utf8') };
    } catch (e) {
      return { file, error: `cannot read file: ${e.message}` };
    }
  });
  return checkWorkflows(files);
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/** CLI entry: prints one JSON line, returns the exit code (always 0). */
function main(argv) {
  const emit = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`); return 0; };
  const usage = 'usage: ci-baseline.js check [--dir <workflows dir>]';
  if (argv[0] !== 'check') return emit({ ok: false, error: usage });
  const dir = flag(argv, '--dir');
  if (argv.includes('--dir') && dir === undefined) return emit({ ok: false, error: usage });
  try {
    return emit(checkDir(dir === undefined ? '.github/workflows' : dir));
  } catch (e) {
    return emit({ ok: false, error: `ci-baseline failed: ${e.message}` });
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { parseYaml, checkWorkflows, checkDir, main, DOCS_PROBE, RECORD_PROBE, matchesFilter };
