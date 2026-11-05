'use strict';

/**
 * design-map.js -- the design map: which boards a design has, what each one is built from, and
 * where each stands (draft -> approved -> building -> shipped).
 *
 * WHY THIS EXISTS
 *
 * `docs/ui/<slug>/design-map.json` is read by every design command and by the build-side checks.
 * One module owns its shape, its legal status moves, and the three fields that are DERIVED from
 * board source (components, parts, links) -- those are never typed by hand, so they cannot drift
 * from the boards (AC-F2.1 to AC-F2.4). Pure functions with a thin CLI; git runs with an
 * argument array, never a shell string.
 *
 * CLI (run from the project root; JSON on stdout, error on stderr, exit 1):
 *   node .claude/lib/design-map.js <read|validate|refresh|transition|stale|approved|buildable|held|setup>
 *     --dir docs/ui/<slug> [--ids a,b] [--to <status>] [--commit <sha>] [--trd <path>] [--record]
 *
 * Example: node .claude/lib/design-map.js transition --dir docs/ui/checkout --ids 01-cart --to approved
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MAP_FILE = 'design-map.json';
const KINDS = ['as-is', 'to-be', 'part', 'flow'];
const STATUSES = ['draft', 'approved', 'building', 'shipped', 'superseded'];
const REQUIRED_BOARD_FIELDS = ['id', 'file', 'kind', 'platform', 'viewport', 'status'];
const DEFAULT_MIRROR_DIR = 'canvas/project';
const DESIGN_RULES = path.join('.claude', 'rules', 'design.md');
const DESIGN_TEMPLATE = path.join('.claude', 'skills', 'design-setup', 'template.md');

const mapPath = (dir) => path.join(dir, MAP_FILE);

/** Read and parse the map. Malformed JSON throws naming the file; the file is never rewritten. */
function read(dir) {
  const p = mapPath(dir);
  const text = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${p} is not valid JSON: ${e.message}`);
  }
}

/** Write the map atomically (temp file, then rename). */
function write(dir, map) {
  const p = mapPath(dir);
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n');
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean */ }
    throw e;
  }
}

/** A list of error strings; empty when the map is valid. */
function validate(map) {
  const errors = [];
  if (!map || typeof map !== 'object') return ['map is not an object'];
  const canvases = Array.isArray(map.canvases) ? map.canvases : [];
  if (!Array.isArray(map.canvases)) errors.push('canvases must be an array');
  const urls = new Set(canvases.map((c) => c.url));
  const ds = map.design_system;
  if (!ds || !Array.isArray(ds.paths) || ds.paths.length === 0) {
    // An empty list makes `git log A..HEAD --` match every commit: the map would always be stale.
    errors.push('design_system.paths must be a non-empty array');
  }
  if (!Array.isArray(map.boards)) {
    errors.push('boards must be an array');
    return errors;
  }
  for (const b of map.boards) {
    const name = b && b.id ? b.id : '(no id)';
    for (const f of REQUIRED_BOARD_FIELDS) {
      if (!b || b[f] === undefined || b[f] === null) errors.push(`board ${name}: missing ${f}`);
    }
    if (b && b.kind && !KINDS.includes(b.kind)) errors.push(`board ${name}: unknown kind ${b.kind}`);
    // design-render.js reads viewport[0]/[1] as pixels and states as { <name>: { setup, props } }.
    if (b && b.viewport != null && !(Array.isArray(b.viewport) && b.viewport.length === 2 && b.viewport.every(Number.isFinite))) {
      errors.push(`board ${name}: viewport must be [width, height] in pixels`);
    }
    if (b && b.states != null && (typeof b.states !== 'object' || Array.isArray(b.states))) {
      errors.push(`board ${name}: states must be an object keyed by state name`);
    }
    if (b && b.status && !STATUSES.includes(b.status)) errors.push(`board ${name}: unknown status ${b.status}`);
    if (b && b.canvas !== undefined && !urls.has(b.canvas)) {
      errors.push(`board ${name}: canvas ${b.canvas} names no listed canvas`);
    }
    if (b && b.canvas === undefined && canvases.length > 1) {
      errors.push(`board ${name}: canvas is required when there is more than one canvas`);
    }
  }
  return errors;
}

/** Unique values in first-appearance order. */
const unique = (list) => [...new Set(list)];

/** All values of `attr="..."` on tags named `tag` in `source`. */
function attrValues(source, tag, attr) {
  const out = [];
  const tagRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  for (const m of source.match(tagRe) || []) {
    const a = m.match(attrRe);
    if (a) out.push(a[1]);
  }
  return out;
}

/**
 * Derive components, parts and links from one board's source.
 * @param {string} source board .dc.html text
 * @param {Record<string,string>} fileToId board file name -> board id
 */
function derive(source, fileToId) {
  const components = attrValues(source, 'x-import', 'component-from-global-scope');
  // The part's file is named by the dc-import tag; the exact attribute is not pinned, so take the
  // first attribute whose value is a .dc.html file.
  const parts = [];
  for (const tag of source.match(/<dc-import\b[^>]*>/gi) || []) {
    const m = tag.match(/=\s*["']([^"']*\.dc\.html)["']/i);
    if (m) parts.push(path.basename(m[1], '.dc.html'));
  }
  const links = [];
  for (const href of attrValues(source, 'a', 'href')) {
    const file = path.basename(href.split(/[?#]/)[0]);
    if (fileToId[file]) links.push(fileToId[file]);
  }
  return { components: unique(components), parts: unique(parts), links: unique(links) };
}

/**
 * Re-derive components/parts/links for every board from its mirror folder. Touches no other
 * field. Returns the updated map (and writes it).
 */
/** A board's source file on disk: its canvas's mirror folder (the first canvas when unnamed). */
function boardPath(map, dir, b) {
  const canvas = (map.canvases || []).find((c) => c.url === b.canvas) || (map.canvases || [])[0] || {};
  return path.join(dir, canvas.dir || DEFAULT_MIRROR_DIR, b.file);
}

function refresh(dir) {
  const map = read(dir);
  const fileToId = {};
  for (const b of map.boards) fileToId[b.file] = b.id;
  for (const b of map.boards) {
    const file = boardPath(map, dir, b);
    if (!fs.existsSync(file) || /\.repo\.dc\.html$/.test(b.file)) continue;
    Object.assign(b, derive(fs.readFileSync(file, 'utf8'), fileToId));
  }
  write(dir, map);
  return map;
}

const ALLOWED = {
  approved: (b, o) => (['draft', 'approved'].includes(b.status) ? { approved_commit: o.commit } : null),
  building: (b, o) => (b.status === 'approved' ? { trd: o.trd } : null),
  shipped: (b, o) => (b.status === 'building' ? { shipped_commit: o.commit } : null),
  superseded: () => ({}),
};

/** Move boards to a new status; throws on an illegal move, naming the board. Pure: returns a copy. */
function transition(map, ids, to, { commit, trd } = {}) {
  if (!STATUSES.includes(to) || to === 'draft') throw new Error(`cannot move to status ${to}`);
  const next = JSON.parse(JSON.stringify(map));
  for (const id of ids) {
    const b = next.boards.find((x) => x.id === id);
    if (!b) throw new Error(`no board ${id}`);
    const patch = ALLOWED[to](b, { commit, trd });
    if (!patch) throw new Error(`board ${id}: illegal transition ${b.status} -> ${to}`);
    Object.assign(b, patch, { status: to });
  }
  return next;
}

function git(repo, args) {
  return spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Has the design system's code changed since `code_commit`? Optionally records drift in the map. */
function stale(map, repo, { record = false, dir } = {}) {
  const ds = map.design_system;
  const head = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  let result;
  if (!ds || !ds.code_commit || !Array.isArray(ds.paths) || ds.paths.length === 0) {
    // With no paths, `git log A..HEAD --` would match every commit; with no system, nothing to compare.
    result = { stale: true, head, changed_paths: null, reason: 'design_system.code_commit or design_system.paths is missing' };
  } else {
    const r = git(repo, ['log', '--name-only', '--format=', `${ds.code_commit}..HEAD`, '--', ...ds.paths]);
    if (r.status !== 0) {
      result = { stale: true, head, changed_paths: null, reason: `code_commit ${ds.code_commit} not found: ${(r.stderr || '').trim()}` };
    } else {
      const changed = unique(r.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
      result = { stale: changed.length > 0, head, changed_paths: changed };
    }
  }
  if (record && dir) {
    const m = read(dir);
    m.design_system = { ...(m.design_system || {}), drift: { checked_at: new Date().toISOString(), head, changed_paths: result.changed_paths } };
    write(dir, m);
  }
  return result;
}

/** To-be boards awaiting build. */
const approved = (map) => map.boards.filter((b) => b.kind === 'to-be' && b.status === 'approved');

/**
 * To-be boards an invocation may approve and build (AC-F9.4, invocation is approval): `draft` or
 * `approved`, limited to `ids` when given. A board already `building`, `shipped` or `superseded`
 * is not listed, and neither is an as-is, part or flow board.
 */
const buildable = (map, ids) => map.boards.filter((b) => b.kind === 'to-be' && ['draft', 'approved'].includes(b.status)
  && (!ids || ids.includes(b.id)));

/**
 * Approved to-be boards that embed a `draft` part board, so nothing may build from them yet
 * (AC-F2.3: nothing builds from a draft board, and a part reached through an approved board is
 * still a draft board). A board embeds a part when its derived `parts` name it (by id or file
 * stem) or its source names the part's file -- the source is read because `parts` is derived
 * from `dc-import` tags only and a board may reference a part another way. The file name must
 * stand alone (`toggle.dc.html` does not match inside `part-toggle.dc.html`), and parts are
 * followed transitively: an approved part that embeds a draft part also holds its board.
 * With `ids`, the named boards are checked whatever their status, so a command can test a
 * `draft` board it is about to approve before approving it.
 * @returns {{ id: string, draft_parts: string[] }[]} only the held boards
 */
function held(map, dir, ids) {
  const partBoards = map.boards.filter((b) => b.kind === 'part');
  if (!partBoards.some((p) => p.status === 'draft')) return [];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cache = new Map();
  const embeds = (b) => {
    if (cache.has(b)) return cache.get(b);
    const file = boardPath(map, dir, b);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const named = new Set(b.parts || []);
    const hit = partBoards.filter((p) => p !== b && (named.has(p.id) || named.has(path.basename(p.file, '.dc.html'))
      || new RegExp(`(^|[^\\w.-])${escape(p.file)}(?![\\w.-])`).test(source)));
    cache.set(b, hit);
    return hit;
  };
  const out = [];
  const roots = ids ? map.boards.filter((b) => ids.includes(b.id)) : approved(map);
  for (const b of roots) {
    const seen = new Set();
    const stack = [...embeds(b)]; // a copy: popping the cached array would empty it for later lookups
    while (stack.length) {
      const p = stack.pop();
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      stack.push(...embeds(p));
    }
    const hits = partBoards.filter((p) => seen.has(p.id) && p.status === 'draft');
    if (hits.length) out.push({ id: b.id, draft_parts: hits.map((p) => p.id) });
  }
  return out;
}

/** 'missing' | 'unfilled' | 'filled' for the project's design.md (D9). */
function setup(projectDir) {
  const norm = (s) => s.replace(/\r\n/g, '\n').trim();
  let content;
  try {
    content = fs.readFileSync(path.join(projectDir, DESIGN_RULES), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return 'missing';
    throw e;
  }
  try {
    const tpl = fs.readFileSync(path.join(projectDir, DESIGN_TEMPLATE), 'utf8');
    if (norm(content) === norm(tpl)) return 'unfilled';
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return 'filled';
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new Error(`unexpected argument ${rest[i]}`);
    const key = rest[i].slice(2);
    if (key === 'record') opts.record = true;
    else if (rest[i + 1] === undefined || rest[i + 1].startsWith('--')) throw new Error(`--${key} needs a value`);
    else opts[key] = rest[++i];
  }
  return { verb, opts };
}

/** `--ids a, b` -> ['a', 'b']; undefined when the flag is absent. */
const idList = (ids) => (ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function headCommit(repo) {
  return git(repo, ['rev-parse', 'HEAD']).stdout.trim();
}

function main(argv) {
  const { verb, opts } = parseArgs(argv);
  if (verb === 'setup') return setup(opts.dir || '.');
  if (!opts.dir) throw new Error('--dir is required');
  switch (verb) {
    case 'read': return read(opts.dir);
    case 'validate': return validate(read(opts.dir));
    case 'refresh': return refresh(opts.dir);
    case 'approved': return approved(read(opts.dir));
    case 'buildable': return buildable(read(opts.dir), idList(opts.ids));
    case 'held': return held(read(opts.dir), opts.dir, idList(opts.ids));
    case 'stale': return stale(read(opts.dir), '.', { record: opts.record, dir: opts.dir });
    case 'transition': {
      if (!opts.ids || !opts.to) throw new Error('transition needs --ids and --to');
      const next = transition(read(opts.dir), idList(opts.ids), opts.to, {
        commit: opts.commit || headCommit('.'), trd: opts.trd,
      });
      write(opts.dir, next);
      return next;
    }
    default: throw new Error(`unknown verb ${verb}`);
  }
}

module.exports = { read, write, validate, derive, refresh, transition, stale, approved, buildable, held, setup, parseArgs, KINDS, STATUSES };

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n');
  } catch (e) {
    process.stderr.write('design-map.js: ' + e.message + '\n');
    process.exit(1);
  }
}
