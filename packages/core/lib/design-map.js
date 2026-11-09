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
 *   node .claude/lib/design-map.js <read|validate|refresh|transition|stale|approved|buildable|held|unsynced|setup|direction|approve>
 *     --dir docs/ui/<slug> [--ids a,b] [--items S1,S2] [--to <status>] [--commit <sha>] [--trd <path>] [--record]
 *     approve: --ids a,b [--commit <sha>] [--runtime <path>, default the pinned runtime] [--reapprove] [--message <text>]
 *   node .claude/lib/design-map.js buildable --dir docs/ui/<slug> --items S2,S3 [--ids a,b]
 *     --items: boards that serve those brief items, as { boards, unmatched, held }; an item no returned
 *     board serves is listed in `unmatched` with the boards that record it; an empty value is an error.
 *     Without --items, `buildable` prints a board array as before.
 *   node .claude/lib/design-map.js unsynced --all [--trd <path>]   (scans every design under docs/ui)
 *   node .claude/lib/design-map.js setup [--dir <project>] [--file <design.md path>]   (--file: e.g. owner-rules.js path design.md)
 *   ... unsynced ... --merged-into <ref> [--merged-head <sha>]   (only boards whose feature's audited commit is merged)
 *
 * Example: node .claude/lib/design-map.js transition --dir docs/ui/checkout --ids 01-cart --to approved
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { frameworkSkillRoles, SKILL_DIRS } = require('./fix-audit');
const { spawnSync } = require('child_process');

const MAP_FILE = 'design-map.json';
const KINDS = ['as-is', 'to-be', 'part', 'flow'];
const STATUSES = ['draft', 'approved', 'building', 'shipped', 'superseded'];
const REQUIRED_BOARD_FIELDS = ['id', 'file', 'kind', 'platform', 'viewport', 'status'];
const DEFAULT_MIRROR_DIR = 'canvas/project';
const DESIGN_RULES = path.join('.claude', 'rules', 'design.md');
const DESIGN_TEMPLATE = path.join('.claude', 'skills', 'design-setup', 'template.md');
// sha256 of each previously shipped design.md template, normalised as setup() does. A project that
// never ran /design-setup holds an older template; without these it would read as `filled` once
// the template changes (D6). Append the outgoing template's hash whenever the template changes.
const PRIOR_TEMPLATE_HASHES = [
  '6a89c44e9481dabcb0646be3e6a4687b72b4b83544d7b2dc39353337178b0496', // before §5 Design direction
];
const normText = (s) => s.replace(/\r\n/g, '\n').trim();

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

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Check the map's top-level `brief_items` list of `{ id, source }` (D16), pushing errors.
 * @returns {Set<string>|null} the item ids, or null when the list is absent or malformed (so the
 * per-board cross-check is skipped rather than reporting every board against a broken list)
 */
function validateItemList(list, errors) {
  if (list === undefined) return null;
  if (!Array.isArray(list) || !list.every((i) => i && typeof i.id === 'string' && i.id)) {
    errors.push('brief_items must be an array of { id, source }');
    return null;
  }
  const ids = new Set();
  for (const { id } of list) {
    if (ids.has(id)) errors.push(`duplicate brief item id ${id}`);
    ids.add(id);
  }
  return ids;
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
  const itemIds = validateItemList(map.brief_items, errors);
  for (const b of map.boards) {
    const name = b && b.id ? b.id : '(no id)';
    if (itemIds && b && isStringArray(b.brief_items)) {
      for (const item of b.brief_items) {
        if (!itemIds.has(item)) errors.push(`board ${name}: brief_items names ${item}, which is not in the map's brief_items list`);
      }
    }
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
    // Optional (maps older than the field have none), but `null` is a malformed value, not an absent one.
    if (b && b.brief_items !== undefined && !isStringArray(b.brief_items)) {
      errors.push(`board ${name}: brief_items must be an array of strings`);
    }
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
 * Boards `buildable` returns (so "may be built now" stays defined once) that record any of `items`
 * in `brief_items`, plus an `unmatched` entry for each named item no returned board serves.
 * `served_by` lists every board in the map recording that item, whatever its kind or status, so
 * "nothing serves it" (empty) reads differently from "only a board already building serves it".
 * `known` appears only when the map records its item list (D16): false for an item not in it.
 * A board with no `brief_items` field serves nothing.
 * @returns {{ boards: object[], unmatched: { item: string, served_by: { id: string, status: string }[], known?: boolean }[] }}
 */
function buildableByItems(map, items, ids) {
  const serves = (b) => Array.isArray(b.brief_items) && items.some((i) => b.brief_items.includes(i));
  const boards = buildable(map, ids).filter(serves);
  const known = Array.isArray(map.brief_items) ? new Set(map.brief_items.map((i) => i && i.id)) : null;
  const unmatched = items
    .filter((item) => !boards.some((b) => b.brief_items.includes(item)))
    .map((item) => ({
      item,
      served_by: map.boards.filter((b) => Array.isArray(b.brief_items) && b.brief_items.includes(item)).map((b) => ({ id: b.id, status: b.status })),
      ...(known ? { known: known.has(item) } : {}),
    }));
  return { boards, unmatched };
}

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

/** Feature name for a TRD path: basename without extension (the rule close-feature and router share). */
const featureOf = (trd) => path.basename(String(trd), path.extname(String(trd)));

/** A git ref or sha taken from the command line: never option-shaped, so it cannot become a flag. */
const refOk = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('-');

/** Full commit id for `rev` in `root`, or null when it is unknown or ambiguous (never a guess). */
function resolveCommit(root, rev) {
  if (!refOk(rev)) return null;
  const r = git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Whether a feature's audited commit (`closed.json` `audit.auditedCommit`, 7 characters on every
 * existing record) is an ancestor of `mergedInto`, or of `mergedHead` when the caller has proven
 * that head merged (a squash or rebase merge never makes the audited commit an ancestor). A
 * feature with no audited commit, or one that does not resolve to exactly one commit, is not merged.
 */
function auditedCommitMerged(root, feature, { mergedInto, mergedHead }) {
  let closed;
  try {
    closed = JSON.parse(fs.readFileSync(path.join(root, '.trd-state', feature, 'closed.json'), 'utf8'));
  } catch { return false; }
  const audited = resolveCommit(root, closed && closed.audit && closed.audit.auditedCommit);
  if (!audited) return false;
  const inside = (target) => !!target && git(root, ['merge-base', '--is-ancestor', audited, target]).status === 0;
  return inside(mergedInto) || inside(resolveCommit(root, mergedHead));
}

/** Resolves --merged-into / --merged-head once, so a bad ref is an error rather than an empty list. */
function mergeScope(root, { mergedInto, mergedHead } = {}) {
  if (mergedInto === undefined) {
    if (mergedHead !== undefined) throw new Error('--merged-head needs --merged-into');
    return null;
  }
  const into = resolveCommit(root, mergedInto);
  if (!into) throw new Error(`--merged-into ${mergedInto} does not name a commit`);
  return { mergedInto: into, mergedHead };
}

/**
 * To-be boards still `building` whose TRD's feature has a close record
 * (`.trd-state/<feature>/closed.json` under `root`): built and closed, but never synced.
 * A board with no `trd`, or in any other status, is never listed. With `trd`, only boards whose
 * TRD names the same feature are kept (compared by feature name, so path spellings do not matter).
 * With `mergedInto`, a board is kept only when its feature's audited commit is an ancestor of that
 * ref or of `mergedHead` (see `auditedCommitMerged`); the caller fetches, this runs read-only git.
 * Otherwise it reads only the map and closed.json; it does not compare screens -- that is
 * /sync-design's job.
 * @returns {{ design: string, id: string, trd: string }[]}
 */
function unsynced(map, design, { root = '.', trd, mergedInto, mergedHead } = {}) {
  const only = trd ? featureOf(trd) : null;
  const scope = mergeScope(root, { mergedInto, mergedHead });
  const merged = new Map(); // feature -> boolean, so a feature's git calls run once
  const out = [];
  for (const b of map.boards || []) {
    if (b.kind !== 'to-be' || b.status !== 'building' || !b.trd) continue;
    const feature = featureOf(b.trd);
    if (only && feature !== only) continue;
    if (!fs.existsSync(path.join(root, '.trd-state', feature, 'closed.json'))) continue;
    if (scope) {
      if (!merged.has(feature)) merged.set(feature, auditedCommitMerged(root, feature, scope));
      if (!merged.get(feature)) continue;
    }
    out.push({ design, id: b.id, trd: b.trd });
  }
  return out;
}

/** `unsynced` over every design map under `root`/docs/ui; no docs/ui folder gives []. */
function unsyncedAll(root, { trd, mergedInto, mergedHead } = {}) {
  mergeScope(root, { mergedInto, mergedHead }); // a bad ref is an error even when no design exists
  const ui = path.join(root, 'docs', 'ui');
  if (!fs.existsSync(ui)) return [];
  const out = [];
  for (const name of fs.readdirSync(ui).sort()) {
    const dir = path.join(ui, name);
    if (!fs.existsSync(mapPath(dir))) continue; // _current, _design-system and the like
    out.push(...unsynced(read(dir), name, { root, trd, mergedInto, mergedHead }));
  }
  return out;
}

/**
 * 'missing' | 'unfilled' | 'filled' for the project's design.md (D9). `file` reads design.md from
 * another path (resolved against projectDir), such as the base-branch copy that
 * `owner-rules.js path design.md` prints; the template is still read from projectDir.
 */
function setup(projectDir, { file } = {}) {
  const norm = normText;
  let content;
  try {
    content = fs.readFileSync(file ? path.resolve(projectDir, file) : path.join(projectDir, DESIGN_RULES), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return 'missing';
    throw e;
  }
  const hash = crypto.createHash('sha256').update(normText(content)).digest('hex');
  if (PRIOR_TEMPLATE_HASHES.includes(hash)) return 'unfilled';
  try {
    const tpl = fs.readFileSync(path.join(projectDir, DESIGN_TEMPLATE), 'utf8');
    if (norm(content) === norm(tpl)) return 'unfilled';
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return 'filled';
}

const LATITUDES = ['keep', 'refine', 'rethink'];
const DIRECTION_FIELDS = [
  ['brand', /^brand\b/i],
  ['style_pack', /^style pack\b/i],
  ['references', /^references\b/i],
  ['departure_latitude', /^departure latitude\b/i],
];

/** Style-pack skill names under the first skill directory that holds any (D4). */
function findPacks(projectDir) {
  for (const dir of SKILL_DIRS) {
    let names;
    try { names = fs.readdirSync(path.join(projectDir, dir)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const packs = names.filter((n) => n.startsWith('style-pack-')
      && fs.existsSync(path.join(projectDir, dir, n, 'SKILL.md'))).sort();
    if (packs.length) return { dir, packs };
  }
  return { dir: null, packs: [] };
}

/**
 * Reads design.md's §5 Design direction and §4 accessibility floor (D4). Blank fields, the
 * latitude, the floor numbers and the style pack are decided here so no prompt has to read prose.
 * Throws on a `missing` or `unfilled` design.md: the commands have already stopped by then.
 * Example: direction('.', { style: 'style-pack-clean-product' }).style_pack.path
 */
function direction(projectDir, { style } = {}) {
  const state = setup(projectDir);
  if (state !== 'filled') throw new Error(`design.md is ${state}; run /design-setup`);
  const content = normText(fs.readFileSync(path.join(projectDir, DESIGN_RULES), 'utf8'));
  const lines = content.split('\n');
  const sectionOf = (re) => {
    const at = lines.findIndex((l) => re.test(l));
    if (at < 0) return [];
    const end = lines.findIndex((l, i) => i > at && /^## /.test(l));
    return lines.slice(at, end < 0 ? undefined : end);
  };
  const s5 = sectionOf(/^## 5\. Design direction\s*$/);
  const fields = {};
  for (const [key, re] of DIRECTION_FIELDS) {
    const row = s5.map((l) => l.split('|').map((c) => c.trim())).find((c) => c.length >= 4 && re.test(c[1]));
    fields[key] = row ? row[2] : '';
  }
  // A pack named by `style` (--style, or the brief's Style pack line) is in use, so its field is not reported blank.
  const blank = DIRECTION_FIELDS.map(([k]) => k).filter((k) => !fields[k] && !(k === 'style_pack' && style));
  const given = fields.departure_latitude.toLowerCase().replace(/[`*]/g, '').trim();
  const latitude = LATITUDES.includes(given) ? given : 'refine';
  if (fields.departure_latitude && !LATITUDES.includes(given)) blank.push('departure_latitude (unrecognised)');
  const line = sectionOf(/^## 4\. Design rules/).find((l) => /accessibility floor/i.test(l)) || '';
  const c = /(\d+(?:\.\d+)?)\s*:\s*1/.exec(line);
  const t = /(\d+(?:\.\d+)?)\s*px/.exec(line);
  const floor = { contrast: c ? Number(c[1]) : null, target: t ? Number(t[1]) : null };
  const { dir, packs } = findPacks(projectDir);
  // Markdown formatting is stripped as for the latitude: `style-pack-x` in a table cell names style-pack-x.
  const name = style || fields.style_pack.replace(/[`*]/g, '').trim() || null;
  const found = name && packs.includes(name);
  return {
    fields, blank, latitude, floor, floor_blank: floor.contrast === null || floor.target === null,
    style_pack: { name, path: found ? path.join(dir, name, 'SKILL.md') : null, missing: !!name && !found },
    craft: craftSkills(projectDir),
    available_packs: packs,
    text: s5.join('\n').trim(),
  };
}

/** SKILL.md paths of the skills framework-skills.txt marks `design`, style packs excluded. */
function craftSkills(projectDir) {
  const roles = frameworkSkillRoles(projectDir) || {};
  const out = [];
  for (const [name, role] of Object.entries(roles)) {
    if (role !== 'design' || name.startsWith('style-pack-')) continue;
    for (const dir of SKILL_DIRS) {
      if (fs.existsSync(path.join(projectDir, dir, name, 'SKILL.md'))) { out.push(path.join(dir, name, 'SKILL.md')); break; }
    }
  }
  return out;
}

/**
 * The one approve sequence the design commands share. Fails (changing nothing) on an unknown or
 * building/shipped/superseded id, or when `commit` is given and the design folder differs from it.
 * Moves named `draft` boards to `approved` (an `approved` board only with `reapprove`, else it is
 * listed in `kept`), writes the map BEFORE rendering (render reads it from disk), renders exactly
 * the moved boards, then commits map + frames by pathspec. Every render failure lands in
 * `renderSkipped`; the approval stands.
 * @returns {Promise<{commit, approved, kept, rendered, renderSkipped, errors}>}
 */
async function approve(dir, { ids, commit, runtime, reapprove = false, message, repo = '.' } = {}) {
  if (!ids || ids.length === 0) throw new Error('approve needs --ids');
  const dirAbs = path.resolve(repo, dir);
  const rel = path.relative(path.resolve(repo), dirAbs);
  const slug = path.basename(dirAbs);
  const map = read(dirAbs);
  for (const id of ids) {
    const b = map.boards.find((x) => x.id === id);
    if (!b) throw new Error(`no board ${id}`);
    if (!['draft', 'approved'].includes(b.status)) throw new Error(`board ${id} is ${b.status}; only draft or approved boards can be approved`);
  }
  const dirty = () => git(repo, ['status', '--porcelain', '-u', '--', rel]).stdout.split('\n').filter(Boolean).map((l) => l.slice(3));
  if (commit) {
    // Resolve to a full sha: an unknown ref must fail, not read as "nothing changed", and a
    // symbolic ref (HEAD, a branch) must never be recorded as approved_commit.
    const v = git(repo, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
    if (v.status !== 0) throw new Error(`--commit ${commit} is not a commit`);
    commit = v.stdout.trim();
    const d = git(repo, ['diff', '--name-only', commit, '--', rel]);
    if (d.status !== 0) throw new Error(`could not compare ${rel} with ${commit}: ${(d.stderr || '').trim()}`);
    const changed = [...new Set([...d.stdout.split('\n').filter(Boolean), ...dirty()])];
    if (changed.length) throw new Error(`${rel} changed after ${commit}: ${changed.join(', ')}`);
  } else {
    if (dirty().length) {
      const a = git(repo, ['add', '--', rel]);
      const c = git(repo, ['commit', '-m', `chore(design): ${slug} board changes before approval`, '--', rel]);
      if (a.status !== 0 || c.status !== 0) throw new Error(`could not commit board changes: ${(c.stderr || a.stderr || '').trim()}`);
    }
    commit = headCommit(repo);
  }
  const moved = ids.filter((id) => reapprove || map.boards.find((x) => x.id === id).status === 'draft');
  const kept = ids.filter((id) => !moved.includes(id));
  if (moved.length) write(dirAbs, transition(map, moved, 'approved', { commit }));
  let rendered = [];
  let renderSkipped = null;
  let errors = {};
  if (moved.length) {
    try {
      // Lazy: design-render requires this module at top level.
      const render = require('./design-render');
      const r = await render.render({
        dir: dirAbs, runtime: runtime || render.PINNED_RUNTIME, out: path.join(dirAbs, 'screens', 'png'), boards: moved, approved: true, repo,
      });
      rendered = r.frames; errors = r.errors || {};
    } catch (e) {
      renderSkipped = e.message;
    }
  }
  let failed = git(repo, ['add', '--', rel]);
  if (failed.status === 0) {
    failed = git(repo, ['diff', '--cached', '--quiet', '--', rel]).status === 0
      ? null
      : git(repo, ['commit', '-m', message || `chore(design): ${slug} boards approved`, '--', rel]);
    if (failed && failed.status === 0) failed = null;
  }
  if (failed) {
    // All or nothing: an uncommitted approval must not stay on disk reading as approved.
    git(repo, ['reset', '-q', '--', rel]);
    write(dirAbs, map);
    throw new Error(`could not commit approval: ${(failed.stderr || '').trim()}`);
  }
  return { commit, approved: moved, kept, rendered, renderSkipped, errors };
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new Error(`unexpected argument ${rest[i]}`);
    const key = rest[i].slice(2);
    if (key === 'record' || key === 'all' || key === 'reapprove') opts[key] = true;
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

async function main(argv) {
  const { verb, opts } = parseArgs(argv);
  if (verb === 'setup') return setup(opts.dir || '.', { file: opts.file });
  if (verb === 'direction') return direction(opts.dir || '.', { style: opts.style });
  if (verb === 'unsynced' && opts.all) return unsyncedAll('.', { trd: opts.trd, mergedInto: opts['merged-into'], mergedHead: opts['merged-head'] });
  if (!opts.dir) throw new Error('--dir is required');
  switch (verb) {
    case 'read': return read(opts.dir);
    case 'validate': return validate(read(opts.dir));
    case 'refresh': return refresh(opts.dir);
    case 'approved': return approved(read(opts.dir));
    case 'buildable': {
      const map = read(opts.dir);
      if (opts.items === undefined) return buildable(map, idList(opts.ids));
      // `--items ""` parses as a value, and idList('') is undefined: test for the flag, not its truthiness,
      // or an empty selection would fall through to plain `buildable` and return every board.
      const items = idList(opts.items);
      if (!items || items.length === 0) throw new Error('--items needs at least one item');
      const out = buildableByItems(map, items, idList(opts.ids));
      return { ...out, held: held(map, opts.dir, out.boards.map((b) => b.id)) };
    }
    case 'held': return held(read(opts.dir), opts.dir, idList(opts.ids));
    case 'unsynced': return unsynced(read(opts.dir), path.basename(path.resolve(opts.dir)), { trd: opts.trd, mergedInto: opts['merged-into'], mergedHead: opts['merged-head'] });
    case 'stale': return stale(read(opts.dir), '.', { record: opts.record, dir: opts.dir });
    case 'transition': {
      if (!opts.ids || !opts.to) throw new Error('transition needs --ids and --to');
      const next = transition(read(opts.dir), idList(opts.ids), opts.to, {
        commit: opts.commit || headCommit('.'), trd: opts.trd,
      });
      write(opts.dir, next);
      return next;
    }
    case 'approve': return approve(opts.dir, {
      ids: idList(opts.ids), commit: opts.commit, runtime: opts.runtime, reapprove: !!opts.reapprove, message: opts.message,
    });
    default: throw new Error(`unknown verb ${verb}`);
  }
}

module.exports = { read, write, validate, derive, refresh, transition, stale, approved, buildable, buildableByItems, held, unsynced, unsyncedAll, setup, direction, approve, parseArgs, KINDS, STATUSES };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (r) => process.stdout.write(JSON.stringify(r) + '\n'),
    (e) => {
      process.stderr.write('design-map.js: ' + e.message + '\n');
      process.exit(1);
    },
  );
}
