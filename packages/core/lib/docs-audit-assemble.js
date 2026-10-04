'use strict';

/**
 * docs-audit-assemble.js — the deterministic half of `/audit-docs` that runs BEFORE any model.
 *
 * Inventories and classifies `docs/`, validates the last-run marker, computes the commit
 * window(s), precomputes the git history of every missing path a doc names, parses each TRD,
 * decides which TRDs are skipped (D19), splits the work into batches and builds the per-batch
 * `Workflow(audit-docs)` args. No model call, no clock read: the output depends only on the
 * tree, git state, flags and `--run-date`, so two runs on the same input are byte-identical
 * (AC-F1.5). See `docs/TRD/docs-as-built.md` §3.1 and decisions D1, D3, D4, D5, D6, D11, D16,
 * D19.
 *
 * The key names in the assembly are read by docs-audit-apply.js, docs-audit-deliver.js and the
 * audit-docs workflow. Renaming one is a cross-module break.
 *
 * CLI:
 *   node docs-audit-assemble.js assemble --repo <dir> --run-date <YYYY-MM-DD> \
 *        [--comprehensive] --out <work>/assembly.json
 * Exit 0 on success; exit 2 with a message on stderr for a refusal the command turns into
 * COMMAND STUCK (not a git repo, detached HEAD, invalid threshold); exit 1 for a usage error.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  parseTrd,
  findSection,
  maskFencedLines,
  normalizeLineEndings,
} = require('./trd-parser');

const DEFAULT_THRESHOLDS = Object.freeze({ high: 70, medium: 40 });
/** 1000 agents per workflow / 5 agents per doc at most (scorer + 3 verifiers + apply). D16. */
const BATCH_CAP = 200;
const MARKER_PATH = '.trd-state/_docs-audit/last-run.json';
const CONTRACT_PATH = '.claude/contracts/docs-audit.md';
const GENERATED_INDEXES = Object.freeze(['docs/PRD/INDEX.md', 'docs/TRD/INDEX.md']);
const MAP_HEADING = 'Where this lives in the code';
const DEV_AGENTS = Object.freeze([
  'frontend-implementer',
  'backend-implementer',
  'mobile-implementer',
  'agent-implementer',
]);

/** A refusal the command reports as COMMAND STUCK. Carries the process exit code. */
class AssembleError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'AssembleError';
    this.exitCode = exitCode;
  }
}

// ---------------------------------------------------------------------------
// git — spawnSync with array arguments only (CLAUDE.md: command-injection rule)
// ---------------------------------------------------------------------------

function git(repo, args, { allowFail = false } = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw new AssembleError(`git could not run: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) {
    throw new AssembleError(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  }
  return { ok: r.status === 0, out: r.stdout || '' };
}

const lines = (s) => s.split('\n').filter((l) => l.length > 0);
const nulList = (s) => s.split('\0').filter((l) => l.length > 0);
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// Thresholds (D5)
// ---------------------------------------------------------------------------

/**
 * Read `ensemble.docsAudit.thresholds.{high,medium}` from `<repo>/.claude/settings.json`.
 * Absent -> 70/40 (owner ruling 2026-09-27). Set but invalid -> AssembleError naming the setting,
 * because the command must stop before any model call rather than guess.
 */
function readThresholds(repo) {
  const file = path.join(repo, '.claude', 'settings.json');
  let configured = {};
  if (fs.existsSync(file)) {
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new AssembleError(`.claude/settings.json is not valid JSON: ${e.message}`);
    }
    const t = settings && settings.ensemble && settings.ensemble.docsAudit
      && settings.ensemble.docsAudit.thresholds;
    if (t && typeof t === 'object') configured = t;
  }
  const out = { ...DEFAULT_THRESHOLDS };
  for (const key of ['high', 'medium']) {
    if (configured[key] === undefined || configured[key] === null) continue;
    const v = configured[key];
    if (!Number.isInteger(v) || v < 0 || v > 100) {
      throw new AssembleError(
        `ensemble.docsAudit.thresholds.${key} must be an integer from 0 to 100 (got ${JSON.stringify(v)})`
      );
    }
    out[key] = v;
  }
  if (out.medium > out.high) {
    throw new AssembleError(
      `ensemble.docsAudit.thresholds.medium (${out.medium}) must not exceed ensemble.docsAudit.thresholds.high (${out.high})`
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification (D3)
// ---------------------------------------------------------------------------

/** What the document's own headings say it is: 'trd' | 'prd' | 'none'. Fenced lines are masked. */
function structureClass(text) {
  const ls = maskFencedLines(normalizeLineEndings(text).split('\n'));
  if (findSection(ls, 'Master Task List')) return 'trd';
  if (findSection(ls, 'Feature Requirements') || findSection(ls, 'Acceptance Criteria')) return 'prd';
  return 'none';
}

/** Folder proposes, structure confirms; disagreement -> loose, reported (AC-F1.2). */
function classify(relPath, text) {
  if (GENERATED_INDEXES.includes(relPath)) {
    return { class: 'loose', folderClass: relPath.startsWith('docs/PRD/') ? 'prd' : 'trd',
      structureClass: 'none', disagreement: false, generated: true };
  }
  const folderClass = relPath.startsWith('docs/PRD/') ? 'prd'
    : relPath.startsWith('docs/TRD/') ? 'trd' : 'loose';
  const structure = text === null ? 'none' : structureClass(text);
  if (folderClass === 'loose') {
    return { class: 'loose', folderClass, structureClass: structure, disagreement: false, generated: false };
  }
  const agrees = structure === folderClass;
  return { class: agrees ? folderClass : 'loose', folderClass, structureClass: structure,
    disagreement: !agrees, generated: false };
}

// ---------------------------------------------------------------------------
// Inventory (AC-F1.1, AC-F1.4)
// ---------------------------------------------------------------------------

function readDoc(repo, rel) {
  const abs = path.join(repo, rel);
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) return null;
    const buf = fs.readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) return null;
    return buf.toString('utf8');
  } catch (e) {
    return null;
  }
}

/** Every file under docs/ in the working tree: [{ path, git }] sorted by path. */
function inventory(repo) {
  const seen = new Map();
  const add = (rels, state) => {
    for (const rel of rels) {
      if (seen.has(rel)) continue;
      if (!fs.existsSync(path.join(repo, rel)) && !isLink(path.join(repo, rel))) continue;
      seen.set(rel, state);
    }
  };
  add(nulList(git(repo, ['ls-files', '-z', '--', 'docs']).out), 'tracked');
  add(nulList(git(repo, ['ls-files', '-z', '--others', '--exclude-standard', '--', 'docs']).out), 'untracked');
  add(nulList(git(repo, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', 'docs']).out), 'ignored');
  return [...seen.entries()].map(([p, g]) => ({ path: p, git: g })).sort((a, b) => byString(a.path, b.path));
}

function isLink(abs) {
  try { return fs.lstatSync(abs).isSymbolicLink(); } catch (e) { return false; }
}

// ---------------------------------------------------------------------------
// Marker and windows (D4, D6)
// ---------------------------------------------------------------------------

/** Validate the committed last-run marker: ok | absent | not-ancestor (D4). */
function readMarker(repo) {
  const file = path.join(repo, MARKER_PATH);
  if (!fs.existsSync(file)) return { sha: null, status: 'absent' };
  let sha = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed.sha === 'string' && /^[0-9a-f]{7,64}$/i.test(parsed.sha)) sha = parsed.sha;
  } catch (e) { /* unreadable marker is an absent marker */ }
  if (!sha) return { sha: null, status: 'absent' };
  const full = git(repo, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { allowFail: true });
  if (!full.ok) return { sha, status: 'not-ancestor' };
  const anc = git(repo, ['merge-base', '--is-ancestor', full.out.trim(), 'HEAD'], { allowFail: true });
  return { sha: full.out.trim(), status: anc.ok ? 'ok' : 'not-ancestor' };
}

/** Commits in `from..to` (git's own order, newest first), each with its sorted changed paths. */
function commitsBetween(repo, from, to) {
  const SEP = '\u001e';
  const out = git(repo, ['log', '-z', `--format=${SEP}%H%x1f%s`, '--name-only', `${from}..${to}`]).out;
  const commits = [];
  for (const chunk of out.split(SEP).filter(Boolean)) {
    // With -z the header and its names are NUL-separated: "<sha>\x1f<subject>\0<p1>\0<p2>\0\0"
    // git also puts a newline between the header and the first name; strip it.
    const parts = chunk.split('\0').map((x) => x.replace(/^\n+/, '')).filter((x) => x.length > 0);
    const [sha, ...subject] = parts[0].split('\u001f');
    commits.push({ sha, subject: subject.join('\u001f'), paths: parts.slice(1).sort(byString) });
  }
  return commits;
}

// ---------------------------------------------------------------------------
// Missing-path history (D11, AC-F7.7)
// ---------------------------------------------------------------------------

const PATH_TOKEN_RE = /(?:^|[\s`'"(<\[])((?:\.{1,2}\/)?(?:[A-Za-z0-9_.@~-]+\/)+(?:[A-Za-z0-9_.@~-]*))/g;

/** Path-shaped tokens a doc names: contain a slash, and end in an extension or a slash. */
function extractPathTokens(text) {
  const found = new Set();
  let m;
  PATH_TOKEN_RE.lastIndex = 0;
  while ((m = PATH_TOKEN_RE.exec(text)) !== null) {
    let tok = m[1].replace(/[.,;:]+$/, '');
    if (!tok || tok.includes('://')) continue;
    const isDir = tok.endsWith('/');
    if (!isDir && !/\.[A-Za-z0-9]+$/.test(tok)) continue;
    if (/^\.{1,2}\/?$/.test(tok)) continue;
    found.add(tok);
  }
  return [...found].sort(byString);
}

/** Set of every file path and directory path present at HEAD. */
function headPathSet(repo) {
  const set = new Set();
  for (const f of nulList(git(repo, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']).out)) {
    set.add(f);
    let d = path.posix.dirname(f);
    while (d && d !== '.' && !set.has(d)) { set.add(d); d = path.posix.dirname(d); }
  }
  return set;
}

/**
 * For a doc, each path it names that is absent from HEAD and from the working tree, with
 * whether it ever existed on this branch's history ("removed", with the last commit that
 * touched it) or never did ("never" — also the cross-repo signal of D20).
 */
function missingPathsFor(repo, docPath, text, headSet, historyCache) {
  const out = [];
  const docDir = path.posix.dirname(docPath);
  for (const raw of extractPathTokens(text)) {
    const token = raw.replace(/\/$/, '');
    const candidates = [path.posix.normalize(token)];
    if (token.startsWith('./') || token.startsWith('../')) {
      candidates.length = 0;
      candidates.push(path.posix.normalize(path.posix.join(docDir, token)));
    } else {
      candidates.push(path.posix.normalize(path.posix.join(docDir, token)));
    }
    const exists = candidates.some(
      (c) => !c.startsWith('..') && (headSet.has(c) || fs.existsSync(path.join(repo, c)))
    );
    if (exists) continue;
    const target = candidates[0];
    if (target.startsWith('..')) continue; // points outside the repository
    if (!historyCache.has(target)) {
      const last = git(repo, ['log', '-1', '--format=%H', 'HEAD', '--', target], { allowFail: true }).out.trim();
      historyCache.set(target, last ? { history: 'removed', lastCommit: last } : { history: 'never', lastCommit: null });
    }
    out.push({ path: target, ...historyCache.get(target) });
  }
  const seen = new Set();
  return out.filter((e) => (seen.has(e.path) ? false : seen.add(e.path))).sort((a, b) => byString(a.path, b.path));
}

// ---------------------------------------------------------------------------
// Code map (D13)
// ---------------------------------------------------------------------------

/** { present, dirs } for a "## Where this lives in the code" section: backticked lead of each bullet. */
function detectMap(text) {
  const ls = maskFencedLines(normalizeLineEndings(text).split('\n'));
  const section = findSection(ls, MAP_HEADING);
  if (!section) return { present: false, dirs: [] };
  const dirs = new Set();
  for (const line of ls.slice(section.start, section.end)) {
    const m = /^\s*[-*]\s+`([^`]+)`/.exec(line);
    if (m) dirs.add(m[1]);
  }
  return { present: true, dirs: [...dirs].sort(byString) };
}

// ---------------------------------------------------------------------------
// TRD parse and D19 review state
// ---------------------------------------------------------------------------

/** Document-level `**Status**: X` (or `Status: X`) line, first one in the header area. */
function parseDocStatus(text) {
  for (const line of normalizeLineEndings(text).split('\n').slice(0, 40)) {
    const m = /^\s*(?:[-*]\s*)?\*{0,2}Status\*{0,2}\s*:\s*\*{0,2}\s*(.+?)\s*$/i.exec(line);
    if (m) return m[1].replace(/\*+/g, '').trim();
  }
  return null;
}

/** Committed `.trd-state/<feature>/implement.json` files: [{ path, feature, closed, data }]. */
function readImplementStates(repo) {
  const tracked = new Set(nulList(git(repo, ['ls-files', '-z', '--', '.trd-state']).out));
  const states = [];
  for (const p of [...tracked].sort(byString)) {
    const m = /^\.trd-state\/([^/]+)\/implement\.json$/.exec(p);
    if (!m) continue;
    const shown = git(repo, ['show', `HEAD:${p}`], { allowFail: true });
    if (!shown.ok) continue;
    let data;
    try { data = JSON.parse(shown.out); } catch (e) { continue; }
    if (!data || typeof data !== 'object') continue;
    states.push({ path: p, feature: m[1], closed: tracked.has(`.trd-state/${m[1]}/closed.json`), data });
  }
  return states;
}

function normalizeRepoPath(p, repo) {
  if (typeof p !== 'string') return '';
  let s = p.trim().replace(/\\/g, '/');
  if (path.isAbsolute(s) && s.startsWith(repo.replace(/\\/g, '/') + '/')) s = s.slice(repo.length + 1);
  return path.posix.normalize(s);
}

/** Cleaned Touches paths for a grounding block (the union over the TRD's tasks). */
function touchedFiles(trdResult) {
  const files = new Set();
  for (const g of Object.values(trdResult.grounding || {})) {
    for (const raw of g.touches || []) {
      const cleaned = String(raw).replace(/`/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (cleaned && !/\s/.test(cleaned) && cleaned.includes('/')) files.add(cleaned);
    }
  }
  return [...files].sort(byString);
}

/**
 * D19: decide whether a TRD is skipped. Returns 'no-implementation' | 'in-flight' | null.
 * A TRD is skipped only when no implementation work exists or the work is clearly in flight;
 * every other TRD is reviewed. When the evidence cannot be established (parse failure, no
 * Touches to test) the TRD is reviewed — an unreviewed doc is the failure G1 forbids.
 */
function trdSkip(repo, docPath, parsed, implementStates) {
  if (!parsed) return null;
  const mine = implementStates.filter((s) => normalizeRepoPath(s.data.trd_file, repo) === docPath);
  const taskState = (id) => {
    for (const s of mine) {
      const t = s.data.tasks && s.data.tasks[id];
      if (t && t.status === 'success') return 'success';
    }
    return null;
  };
  const anySuccess = mine.some((s) => Object.values(s.data.tasks || {}).some((t) => t && t.status === 'success'));

  if (!anySuccess) {
    const touched = touchedFiles(parsed);
    if (touched.length > 0) {
      const first = git(repo, ['log', '--format=%H', '--reverse', '--', docPath]).out.split('\n')[0];
      if (first) {
        const changedAfter = touched.some(
          (f) => git(repo, ['rev-list', '-1', `${first}..HEAD`, '--', f], { allowFail: true }).out.trim() !== ''
        );
        if (!changedAfter) return 'no-implementation';
      }
    }
  }
  const open = parsed.tasks.some((t) => DEV_AGENTS.includes(t.agentType) && taskState(t.id) !== 'success');
  if (mine.some((s) => !s.closed) && open) return 'in-flight';
  return null;
}

/** The `trd` block for a file entry plus the skip decision: { trd, skip, warnings }. */
function analyseTrd(repo, docPath, text, implementStates) {
  let parsed;
  try {
    parsed = parseTrd(text, { path: docPath });
  } catch (e) {
    return { trd: null, skip: null, warning: `parseTrd rejected ${docPath}: ${e.message}` };
  }
  const mine = implementStates.filter((s) => normalizeRepoPath(s.data.trd_file, repo) === docPath);
  const statusOf = (id) => {
    let status = null;
    for (const s of mine) {
      const t = s.data.tasks && s.data.tasks[id];
      if (t && t.status && (status === null || t.status === 'success')) status = t.status;
    }
    return status;
  };
  const trd = {
    status: parseDocStatus(text),
    tasks: parsed.tasks.map((t) => ({
      id: t.id,
      status: statusOf(t.id),
      agent: t.agentType,
      development: DEV_AGENTS.includes(t.agentType),
      touches: ((parsed.grounding[t.id] && parsed.grounding[t.id].touches) || []).slice(),
    })),
    warnings: parsed.warnings.slice(),
  };
  return { trd, skip: trdSkip(repo, docPath, parsed, implementStates), warning: null };
}

// ---------------------------------------------------------------------------
// Batching (D16)
// ---------------------------------------------------------------------------

function batchKey(file) {
  if (file.class === 'prd') return 'prd';
  if (file.class === 'trd') return 'trd';
  const rest = file.path.slice('docs/'.length);
  const slash = rest.indexOf('/');
  return `loose:${slash === -1 ? '.' : rest.slice(0, slash)}`;
}

/** Group file entries into batches of at most BATCH_CAP docs: prd, trd, then loose folders. */
function buildBatches(files, cap = BATCH_CAP) {
  const groups = new Map();
  for (const f of files) {
    const k = batchKey(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const order = (k) => (k === 'prd' ? '0' : k === 'trd' ? '1' : `2${k}`);
  const batches = [];
  for (const k of [...groups.keys()].sort((a, b) => byString(order(a), order(b)))) {
    const docs = groups.get(k).sort((a, b) => byString(a.path, b.path));
    for (let i = 0; i < docs.length; i += cap) {
      batches.push({ key: k, chunk: i / cap + 1, docs: docs.slice(i, i + cap).map((d) => d.path) });
    }
  }
  return batches;
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

/**
 * Build the assembly object. Pure with respect to its inputs (tree, git state, flags, runDate).
 * @param {{repo: string, runDate: string, comprehensive?: boolean, assemblyPath?: string}} opts
 */
function assemble({ repo, runDate, comprehensive = false, assemblyPath = null }) {
  if (!repo || !fs.existsSync(repo)) throw new AssembleError(`repository not found: ${repo}`);
  repo = path.resolve(repo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(runDate))) {
    throw new AssembleError(`--run-date must be YYYY-MM-DD (got ${JSON.stringify(runDate)})`);
  }
  const inside = git(repo, ['rev-parse', '--is-inside-work-tree'], { allowFail: true });
  if (!inside.ok || inside.out.trim() !== 'true') throw new AssembleError(`${repo} is not a git repository`);
  const top = git(repo, ['rev-parse', '--show-toplevel']).out.trim();
  if (fs.realpathSync(top) !== fs.realpathSync(repo)) {
    throw new AssembleError(`--repo must be the repository root (root is ${top})`);
  }
  const branch = git(repo, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true });
  if (!branch.ok) throw new AssembleError('HEAD is detached; check out a branch first');
  const head = git(repo, ['rev-parse', 'HEAD'], { allowFail: true });
  if (!head.ok) throw new AssembleError('the repository has no commits');
  const headSha = head.out.trim();

  const thresholds = readThresholds(repo);
  const marker = readMarker(repo);
  const mode = comprehensive || marker.status !== 'ok' ? 'comprehensive' : 'light';
  const modeReason = comprehensive ? 'flag'
    : marker.status === 'absent' ? 'no-marker'
    : marker.status === 'not-ancestor' ? 'marker-not-ancestor' : 'light';
  const window = mode === 'light'
    ? { from: marker.sha, to: headSha, commits: commitsBetween(repo, marker.sha, headSha) }
    : null;

  const implementStates = readImplementStates(repo);
  const headSet = headPathSet(repo);
  const historyCache = new Map();
  const warnings = [];
  const files = [];

  for (const item of inventory(repo)) {
    const text = readDoc(repo, item.path);
    const cls = classify(item.path, text);
    const entry = {
      path: item.path, class: cls.class,
      folderClass: cls.folderClass, structureClass: cls.structureClass,
      disagreement: cls.disagreement, generated: cls.generated,
      git: item.git, text: text !== null, lastCommit: null,
      docWindow: null, trd: null, skip: null, missingPaths: [],
      map: { present: false, dirs: [] },
    };
    if (item.git === 'tracked') {
      const last = git(repo, ['log', '-1', '--format=%H', '--', item.path], { allowFail: true }).out.trim();
      entry.lastCommit = last || null;
    }
    if (text !== null) {
      entry.map = detectMap(text);
      if (item.git === 'tracked' && !cls.generated) {
        entry.missingPaths = missingPathsFor(repo, item.path, text, headSet, historyCache);
      }
    }
    if (item.git === 'tracked' && text !== null && (cls.class === 'prd' || cls.class === 'trd')) {
      if (mode === 'comprehensive' && entry.lastCommit) {
        entry.docWindow = { from: entry.lastCommit, to: headSha, commits: commitsBetween(repo, entry.lastCommit, headSha) };
      }
      if (cls.class === 'trd') {
        const a = analyseTrd(repo, item.path, text, implementStates);
        entry.trd = a.trd;
        entry.skip = a.skip;
        if (a.warning) warnings.push({ path: item.path, message: a.warning });
      }
    }
    files.push(entry);
  }

  // Only tracked PRD/TRD/loose docs are reviewed (OQ-6); loose docs only in a comprehensive run;
  // a skipped TRD leaves the batches; a light run with an empty window reviews nothing (D5).
  const reviewable = files.filter((f) =>
    f.git === 'tracked' && !f.generated && f.skip === null &&
    (f.class !== 'loose' || mode === 'comprehensive'));
  const emptyLightWindow = mode === 'light' && window.commits.length === 0;
  const batches = emptyLightWindow ? [] : buildBatches(reviewable);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const runId = `${runDate}-${headSha.slice(0, 7)}`;
  const workflowArgs = batches.map((b) => ({
    runId, mode, repo, assemblyPath: assemblyPath ? path.resolve(assemblyPath) : null,
    contractPath: CONTRACT_PATH, thresholds,
    batch: {
      key: b.key, chunk: b.chunk,
      docs: b.docs.map((p) => ({ path: p, class: byPath.get(p).class, text: byPath.get(p).text })),
    },
  }));

  return {
    runId, head: headSha, branch: branch.out.trim(), mode, modeReason,
    marker, thresholds, window,
    files, batches, workflowArgs,
    skipped: files.filter((f) => f.skip !== null).map((f) => ({ path: f.path, reason: f.skip })),
    warnings: warnings.sort((a, b) => byString(a.path, b.path)),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { comprehensive: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--comprehensive') opts.comprehensive = true;
    else if (a === '--repo' || a === '--run-date' || a === '--out') {
      if (i + 1 >= argv.length) throw new AssembleError(`${a} needs a value`, 1);
      opts[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else throw new AssembleError(`unknown argument: ${a}`, 1);
  }
  return opts;
}

function main(argv) {
  try {
    if (argv[0] !== 'assemble') throw new AssembleError('Usage: docs-audit-assemble.js assemble --repo <dir> --run-date <YYYY-MM-DD> [--comprehensive] --out <file>', 1);
    const o = parseArgs(argv.slice(1));
    if (!o.repo || !o.runDate || !o.out) throw new AssembleError('assemble needs --repo, --run-date and --out', 1);
    const result = assemble({ repo: o.repo, runDate: o.runDate, comprehensive: o.comprehensive, assemblyPath: o.out });
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    fs.writeFileSync(o.out, JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify({
      out: path.resolve(o.out), runId: result.runId, mode: result.mode, modeReason: result.modeReason,
      files: result.files.length, batches: result.batches.length, skipped: result.skipped.length,
    }) + '\n');
    return 0;
  } catch (e) {
    if (!(e instanceof AssembleError)) throw e;
    process.stderr.write(`docs-audit-assemble: ${e.message}\n`);
    return e.exitCode;
  }
}

module.exports = {
  assemble,
  readThresholds,
  classify,
  structureClass,
  extractPathTokens,
  detectMap,
  buildBatches,
  readMarker,
  parseDocStatus,
  AssembleError,
  DEFAULT_THRESHOLDS,
  BATCH_CAP,
  MARKER_PATH,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
