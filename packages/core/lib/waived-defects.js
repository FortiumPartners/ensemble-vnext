'use strict';
/**
 * Every waived failure is filed as a defect issue.
 *
 * A "waived" row is a discovered.jsonl row whose summary starts `[non-blocking] ` -- a failing
 * criterion the must-pass-only blocking policy let through. This library reads the project's
 * `## Issue Tracker` (stack.md), and before a feature closes makes sure each such criterion has
 * one defect issue, recording the URL as an append-only resolve marker `filed <url>` (the same
 * marker `file-followups` writes, so the two paths agree).
 *
 * GitHub is filed here with `gh` (spawnSync, array args, body via --body-file). Linear and Jira are
 * filed by the command through their skills, then recorded with `record-filed`; until then the
 * gate reports the row `failed` so the close still refuses. Reachability for those two is assumed
 * from the declaration (no read-only probe exists without the skill). `--stack` names the stack.md
 * copy to read (`owner-rules.js path stack.md`, the copy `read-blocking-policy --stack` used).
 *
 * Never creates an issue to probe the tracker: every `gh issue create` files one waived row.
 *
 * CLI (one JSON line on stdout; exit 0 even on a refusal, non-zero only on bad usage):
 *   node waived-defects.js tracker      [--root <dir>] [--stack <stack.md>]
 *   node waived-defects.js gate         --state-dir <dir> [--root <dir>] [--stack <stack.md>]
 *   node waived-defects.js record-filed --state-dir <dir> --ref <id> --url <url>
 *
 * functional-verification.js requires this lazily and vice versa; neither requires the other at
 * the top level.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const discovered = require('./discovered');

const WAIVED_PREFIX = '[non-blocking] ';
const FILED_RE = /^filed (https?:\/\/\S+)$/;
const LABEL = 'defect';

/** Parse `Tracker:` and `Project:` from the `## Issue Tracker` section of stack.md text. */
function parseTracker(stackText) {
  const out = { tracker: 'none', project: '' };
  const lines = String(stackText || '').split(/\r?\n/);
  let i = lines.findIndex((l) => /^##\s+Issue Tracker\s*$/.test(l));
  if (i < 0) return out;
  for (i += 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]) && lines[i].trim() !== '---'; i++) {
    const m = lines[i].match(/^\s*(Tracker|Project):[ \t]*(.*?)\s*$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === 'tracker') {
      const t = m[2].toLowerCase();
      out.tracker = ['github', 'linear', 'jira'].includes(t) ? t : 'none';
    } else out.project = m[2];
  }
  return out;
}

/**
 * `stackPath` is the owner-rules-resolved stack.md (`owner-rules.js path stack.md`), the same copy
 * `read-blocking-policy --stack` judged the waiver against; without it, the branch copy under `root`.
 */
function readTracker(root, stackPath) {
  try {
    return parseTracker(fs.readFileSync(stackPath || path.join(root, '.claude', 'rules', 'stack.md'), 'utf8'));
  } catch {
    return { tracker: 'none', project: '' };
  }
}

/**
 * The waived rows: the latest row per criterion, when it is a waived one. Each carries `url`, the
 * `filed <url>` marker naming ANY waived row of that criterion (a re-recorded row never files twice).
 * A waived row resolved some other way (fixed) with no URL is finished and not listed.
 */
function listWaived(stateDir) {
  const all = discovered.readAll(stateDir);
  let raw = '';
  try {
    raw = fs.readFileSync(discovered.ledgerPath(stateDir), 'utf8');
  } catch { /* none */ }
  const markers = [];
  for (const line of raw.split('\n')) {
    try {
      const m = JSON.parse(line);
      if (m && m.resolves && FILED_RE.test(String(m.summary))) markers.push(m);
    } catch { /* skip */ }
  }
  const urlOf = (row) => {
    const m = markers.find((k) => k.resolves === row.ts && String(row.summary).startsWith(k.resolvesSummary));
    return m ? m.summary.match(FILED_RE)[1] : null;
  };
  const urlByRef = new Map();
  for (const r of all) {
    if (r.ref && String(r.summary).startsWith(WAIVED_PREFIX)) {
      const u = urlOf(r);
      if (u) urlByRef.set(r.ref, u);
    }
  }
  return discovered
    .latestPerRef(all)
    .filter((r) => r.ref && String(r.summary).startsWith(WAIVED_PREFIX))
    .map((r) => ({ ref: r.ref, ts: r.ts, summary: r.summary, resolvedAt: r.resolvedAt || null, url: urlByRef.get(r.ref) || null }))
    .filter((r) => r.url || !r.resolvedAt);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Criterion statement, failure reason and evidence for the issue body. */
function criterionFacts(stateDir, ref, summary) {
  let statement = '';
  try {
    const { readDefinitionRows } = require('./functional-verification'); // lazy: mutual require
    const row = readDefinitionRows(fs.readFileSync(path.join(stateDir, 'success-definition.md'), 'utf8')).find((r) => r.id === ref);
    if (row) {
      const keys = ['criterion', 'statement', 'objective', 'requirement', 'description'];
      const k = keys.find((x) => row.cells[x]) || Object.keys(row.cells).find((x) => x !== 'id' && row.cells[x]);
      statement = k ? String(row.cells[k]).trim() : '';
    }
  } catch { /* definition unreadable: the body says so */ }
  const state = readJson(path.join(stateDir, 'verification-state.json'));
  const c = state && Array.isArray(state.criteria) ? state.criteria.find((x) => x && x.id === ref) : null;
  return {
    statement,
    failure: (c && c.reason) || String(summary).slice(WAIVED_PREFIX.length),
    evidence: (c && c.artifact) || '',
  };
}

/** Title and body of the defect issue for one waived row. */
function buildIssue(stateDir, row) {
  const f = criterionFacts(stateDir, row.ref, row.summary);
  const impl = readJson(path.join(stateDir, 'implement.json')) || {};
  const title = `Defect: ${row.ref} ${f.statement || f.failure}`.replace(/\s+/g, ' ').slice(0, 120);
  const body = [
    `Criterion ${row.ref} failed verification and was waived under \`Blocking: must-pass only\` (it is not must-pass) when the feature was closed.`,
    '',
    `**Criterion:** ${f.statement || '(statement not found in success-definition.md)'}`,
    `**Failure:** ${f.failure}`,
    `**Evidence:** ${f.evidence || '(none recorded)'}`,
    '',
    `**Feature:** ${path.basename(path.resolve(stateDir))}${impl.trd_file ? ` (TRD \`${impl.trd_file}\`)` : ''}`,
    `**Branch:** ${impl.branch || '(not recorded)'}`,
    `**Ledger row:** \`${discovered.ledgerPath(stateDir)}\` ts \`${row.ts}\``,
    '',
    'This is a defect, not a follow-up idea: it stays open until someone decides not to fix it.',
  ].join('\n');
  return { title, body };
}

/** Network calls must never hang a close: a timed-out call counts as failed (owner-rules.js's bound). */
const NETWORK_TIMEOUT_MS = 30000;

function defaultRunner(cmd, args) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: NETWORK_TIMEOUT_MS,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.error ? String(r.error.message) : r.stderr || '' };
}

function errText(r) {
  return String(r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 300);
}

/** Make sure the `defect` label exists (read-only list first; created once when missing). */
function ensureLabel(run, project) {
  const list = run('gh', ['label', 'list', '-R', project, '--search', LABEL, '--json', 'name']);
  if (list.status !== 0) return { ok: false, error: errText(list) };
  let names = [];
  try {
    names = JSON.parse(list.stdout || '[]').map((l) => l.name);
  } catch { /* treat as missing */ }
  if (names.includes(LABEL)) return { ok: true };
  const made = run('gh', ['label', 'create', LABEL, '-R', project, '--description', 'A confirmed defect', '--color', 'D73A4A']);
  return made.status === 0 ? { ok: true } : { ok: false, error: errText(made) };
}

/**
 * File every waived row that has no recorded URL. Refuses (`ok: false`) when any row stays unfiled.
 * @returns {{ok: boolean, tracker: string, filed: object[], already: object[], failed: object[], reason?: string}}
 */
function gate(stateDir, { root = process.cwd(), runner = defaultRunner, stackPath } = {}) {
  const out = { ok: true, tracker: 'none', filed: [], already: [], retired: [], failed: [] };
  const rows = listWaived(stateDir);
  // A criterion the latest full verification run proved `met` is no longer failing: only
  // verify-build's fix loop records a `met` row, so without this a later passing run would still
  // file a defect for it. Its row is resolved so no reader lists it as open again.
  const state = readJson(path.join(stateDir, 'verification-state.json'));
  const metNow = new Set(
    (state && Array.isArray(state.criteria) ? state.criteria : []).filter((c) => c && c.status === 'met').map((c) => c.id)
  );
  const todo = [];
  for (const r of rows) {
    if (r.url) {
      // "Never twice" is per criterion: a newer waived row of a filed criterion is marked with the
      // same URL, so it does not stay open in the ledger for file-followups to list forever.
      if (!r.resolvedAt) discovered.resolve(stateDir, { ts: r.ts, summary: r.summary }, `filed ${r.url}`);
      out.already.push({ ref: r.ref, url: r.url });
    } else if (metNow.has(r.ref)) {
      discovered.resolve(stateDir, { ts: r.ts, summary: r.summary }, 'met in the latest verification run');
      out.retired.push({ ref: r.ref });
    } else todo.push(r);
  }
  if (todo.length === 0) return out;

  const { tracker, project } = readTracker(root, stackPath);
  out.tracker = tracker;
  const refuse = (reason, error) => {
    out.ok = false;
    out.reason = reason;
    for (const r of todo) out.failed.push({ ref: r.ref, summary: r.summary, error: error || reason });
    return out;
  };
  if (tracker === 'none') return refuse('no tracker declared in stack.md');
  if (!project) return refuse('no Project declared under ## Issue Tracker in stack.md');
  if (tracker !== 'github') return refuse(`file via the ${tracker} skill`);

  const view = runner('gh', ['repo', 'view', project, '--json', 'name']);
  if (view.status !== 0) return refuse('tracker not reachable', errText(view));
  const label = ensureLabel(runner, project);
  if (!label.ok) return refuse('could not ensure the defect label', label.error);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waived-defect-'));
  try {
    for (const r of todo) {
      const { title, body } = buildIssue(stateDir, r);
      const file = path.join(dir, 'body.md');
      fs.writeFileSync(file, body);
      const res = runner('gh', ['issue', 'create', '-R', project, '--title', title, '--body-file', file, '--label', LABEL]);
      const url = String(res.stdout || '').trim().split('\n').pop().trim();
      if (res.status !== 0 || !/^https?:\/\/\S+$/.test(url)) {
        out.failed.push({ ref: r.ref, summary: r.summary, error: errText(res) });
        continue;
      }
      if (!discovered.resolve(stateDir, { ts: r.ts, summary: r.summary }, `filed ${url}`)) {
        // The issue exists but the marker is lost: report the URL so a person can record it.
        out.failed.push({ ref: r.ref, summary: r.summary, error: 'issue filed but the filed marker could not be written', url });
        continue;
      }
      out.filed.push({ ref: r.ref, url });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  out.ok = out.failed.length === 0;
  if (!out.ok) out.reason = 'waived failures not filed';
  return out;
}

/** Record the URL of an issue filed out of band (Linear/Jira skill, or by hand) against a waived row. */
function recordFiled(stateDir, ref, url) {
  if (!/^https?:\/\/\S+$/.test(String(url || ''))) return { ok: false, reason: 'url must be an http(s) URL' };
  const row = listWaived(stateDir).find((r) => r.ref === ref);
  if (!row) return { ok: false, reason: `no waived row for ${ref}` };
  if (!discovered.resolve(stateDir, { ts: row.ts, summary: row.summary }, `filed ${url}`)) {
    return { ok: false, reason: 'marker could not be written' };
  }
  return { ok: true, ref, url };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--') || rest[i + 1] === undefined) return usage();
    opt[rest[i].slice(2)] = rest[i + 1];
  }
  const root = opt.root || process.cwd();
  if (cmd === 'tracker') return emit({ ok: true, ...readTracker(root, opt.stack) });
  if (!opt['state-dir']) return usage();
  if (cmd === 'gate') return emit(gate(opt['state-dir'], { root, stackPath: opt.stack }));
  if (cmd === 'record-filed' && opt.ref && opt.url) return emit(recordFiled(opt['state-dir'], opt.ref, opt.url));
  return usage();
}
function emit(o) {
  process.stdout.write(JSON.stringify(o) + '\n');
  return 0;
}
function usage() {
  process.stderr.write('usage: waived-defects.js tracker [--root d] [--stack f] | gate --state-dir d [--root d] [--stack f] | record-filed --state-dir d --ref id --url u\n');
  return 2;
}

module.exports = { parseTracker, readTracker, listWaived, buildIssue, gate, recordFiled, WAIVED_PREFIX };

if (require.main === module) process.exit(main(process.argv.slice(2)));
