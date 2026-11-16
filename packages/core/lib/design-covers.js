'use strict';

/**
 * design-covers.js: turn a design board into the source files a criterion about it depends on.
 *
 * WHY: a criterion proven against a design board (an `ST-<board>` structure row or a `DC-<frame>`
 * comparison row) names no file, so custody and the regression pass could not tell which shipped
 * changes touch it and re-walked it on every change. The board does name a route and its
 * components, and `.claude/rules/design.md` says where pages and components live, so the files can
 * be resolved. Resolution is all-or-nothing per board (D7): a partial record would read a changed
 * component as "unchanged", so a board that cannot be fully resolved yields no covers and an
 * `unresolved` entry with the reason; the caller then falls back to the conservative rules.
 *
 * Rules (TRD narrow-reproof-scope D5-D8):
 *  - Route to page file: `design.md` section 3 "Route list". The cell holds pairs (`/r -> path`,
 *    `/r: path`, `| /r | path |`) and/or names a route file (an existing path) in which the same
 *    pair lines, or a line carrying the route as a quoted literal, are searched. In a quoted-literal
 *    line every other quoted literal containing `/` or `.` is a candidate path.
 *  - Component to file: `design.md` section 2 "Component library paths" for the board's platform
 *    row; the namespace (everything up to and including the first `.`) is stripped, then the name
 *    matches `<Name>.<ext>`, `<Name>/index.<ext>` or a `<Name>/` directory, searched recursively
 *    (skipping node_modules and dot-directories). Every match is a cover; a directory ends in '/'.
 *  - Candidates resolve with extension probing, then `/index.*`, from the repo root, then from the
 *    route-list file's directory.
 *
 * Cell separators (a table cell is one line): several route pairs in the Route list cell are
 * separated by `;` or `<br>`; several paths in "Component library paths" by `,`, `;` or `<br>`.
 * Backticks are stripped.
 *
 * design.md is read from the working tree (`.claude/rules/design.md`), not the base-branch copy.
 *
 * Example:
 *   designCovers({ cwd: '.', rows: [{ id: 'ST-01-home', derivation: 'check:verify-design-structure' }] })
 *   // => { covers: Map { 'ST-01-home' => ['app/page.tsx', 'src/Card.tsx'] }, unresolved: [] }
 *
 * Output paths are repo-relative, forward-slash, never absolute or containing `..`, so they pass
 * live-evidence's `normalizeCoverPath`. Requires only design-map and trd-parser (neither requires
 * custody, live-evidence or functional-verification), so there is no load cycle.
 */

const fs = require('fs');
const path = require('path');
const designMap = require('./design-map');
const { findSection, findTables, maskFencedLines, normalizeLineEndings } = require('./trd-parser');

const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'];
const DESIGN_FILE = path.join('.claude', 'rules', 'design.md');
const SKIP_DIR = (name) => name === 'node_modules' || name.startsWith('.');

const posix = (p) => p.split(path.sep).join('/');
const strip = (s) => String(s || '').replace(/`/g, '').trim();
const splitCell = (cell, re) => strip(cell).split(re).map((s) => s.trim()).filter(Boolean);
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

/** Repo-relative forward-slash path of `abs` when it lies inside `root`, else null. */
function inside(root, abs) {
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return posix(rel);
}

/** Resolve one candidate path to an existing file: as-is, extension probe, then /index.*. */
function resolveCandidate(root, bases, candidate) {
  const c = strip(candidate).replace(/^['"]|['"]$/g, '').replace(/[,;]+$/, '');
  if (!c || /^[a-z]+:\/\//i.test(c)) return null;
  for (const base of bases) {
    const p = path.resolve(base, c.replace(/^\//, ''));
    const tries = [p, ...EXTS.map((e) => p + e), ...EXTS.map((e) => path.join(p, 'index' + e))];
    for (const t of tries) {
      if (isFile(t)) {
        const rel = inside(root, t);
        if (rel) return rel;
      }
    }
  }
  return null;
}

/** Parse a `/route <sep> path` pair out of one line of text; null when it is not one. */
function parsePair(text) {
  const m = /^\s*\|?\s*(\/\S*?)\s*(?:->|=>|\||:(?=\s))\s*(.+?)\s*\|?\s*$/.exec(strip(text));
  return m ? { route: m[1], target: m[2] } : null;
}

/** Quoted literals ('..', "..", `..`) on a line. */
function quoted(line) {
  return [...line.matchAll(/(['"`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);
}

/** Parse design.md into { routeCell, platforms: Map<platform lower-case, string[] paths> }. */
function parseDesign(root) {
  const text = normalizeLineEndings(fs.readFileSync(path.join(root, DESIGN_FILE), 'utf8'));
  const lines = maskFencedLines(text.split('\n'));
  const platforms = new Map();
  const per = findSection(lines, 'Per platform');
  if (per) {
    for (const t of findTables(lines, per.start, per.end)) {
      const head = t.headerCells.map((h) => strip(h).toLowerCase());
      const pi = head.findIndex((h) => h === 'platform');
      const li = head.findIndex((h) => h.startsWith('component library paths'));
      if (pi < 0 || li < 0) continue;
      for (const r of t.dataRows) {
        const name = strip(r.cells[pi]).toLowerCase();
        if (name) platforms.set(name, splitCell(r.cells[li] || '', /<br\s*\/?>|[,;]/i));
      }
    }
  }
  let routeCell = '';
  const reach = findSection(lines, 'How to reach a screen');
  if (reach) {
    for (const t of findTables(lines, reach.start, reach.end)) {
      for (const r of t.dataRows) {
        if (/^route list/i.test(strip(r.cells[0]))) routeCell = r.cells[1] || '';
      }
    }
  }
  return { routeCell, platforms };
}

/** Page file for `route`, or null. */
function resolveRoute(root, routeCell, route) {
  const pieces = splitCell(routeCell, /<br\s*\/?>|;/i);
  for (const piece of pieces) {
    const pair = parsePair(piece);
    if (pair && pair.route === route) {
      const hit = resolveCandidate(root, [root], pair.target);
      if (hit) return hit;
    }
  }
  for (const piece of pieces) {
    const file = path.resolve(root, piece);
    if (!inside(root, file) || !isFile(file)) continue;
    const bases = [root, path.dirname(file)];
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const direct = parsePair(line);
      if (direct && direct.route === route) {
        const hit = resolveCandidate(root, bases, direct.target);
        if (hit) return hit;
      }
      const lits = quoted(line);
      if (!lits.includes(route)) continue;
      for (const lit of lits) {
        if (lit === route || !/[/.]/.test(lit)) continue;
        const hit = resolveCandidate(root, bases, lit);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** Every match for component stem `name` under `dir`, as repo-relative covers. */
function findComponent(root, dir, name, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR(e.name)) continue;
      if (e.name === name) {
        const rel = inside(root, full);
        if (rel) out.push(rel + '/');
        for (const x of EXTS) {
          const idx = path.join(full, 'index' + x);
          if (isFile(idx)) out.push(inside(root, idx));
        }
      }
      findComponent(root, full, name, out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (EXTS.includes(ext) && path.basename(e.name, ext) === name) out.push(inside(root, full));
    }
  }
}

/** All the board maps under docs/ui, as { board, design }. */
function scanBoards(root) {
  const ui = path.join(root, 'docs', 'ui');
  const out = [];
  if (!isDir(ui)) return out;
  for (const name of fs.readdirSync(ui).sort()) {
    const dir = path.join(ui, name);
    if (!fs.existsSync(path.join(dir, 'design-map.json'))) continue; // _current, _design-system
    const map = designMap.read(dir);
    for (const b of (map && map.boards) || []) out.push({ board: b, design: name });
  }
  return out;
}

/** The board ids a design row may name, in preference order; null for another derivation. */
function boardIdsFor(row) {
  const m = /^check:([\w-]+)/.exec(String((row && row.derivation) || ''));
  if (!m) return null;
  if (m[1] === 'verify-design-structure') return [String(row.id).replace(/^ST-/, '')];
  if (m[1] === 'verify-design-comparison') {
    const stem = String(row.id).replace(/^DC-/, '');
    return [stem, stem.replace(/--[^-].*$/, '')];
  }
  return null;
}

/**
 * @param {{ cwd?: string, rows: Array<{ id: string, derivation: string }> }} args
 * @returns {{ covers: Map<string, string[]>, unresolved: Array<{ id: string, reason: string }> }}
 *   covers are repo-relative, forward-slash; a directory cover ends in '/'. Rows of any other
 *   derivation are ignored. Throws only for a design-map.json that exists but is not valid JSON.
 */
function designCovers({ cwd = '.', rows } = {}) {
  const root = path.resolve(cwd);
  const covers = new Map();
  const unresolved = [];
  const mine = [];
  for (const row of rows || []) {
    const ids = boardIdsFor(row);
    if (ids) mine.push({ row, ids });
  }
  if (!mine.length) return { covers, unresolved };

  const fail = (id, reason) => unresolved.push({ id, reason });
  const setup = designMap.setup(root);
  if (setup !== 'filled') {
    for (const { row } of mine) fail(row.id, `design.md is ${setup}`);
    return { covers, unresolved };
  }
  const design = parseDesign(root);
  const boards = scanBoards(root);

  for (const { row, ids } of mine) {
    let found = [];
    for (const id of ids) {
      found = boards.filter((x) => x.board.id === id);
      if (found.length) break;
    }
    if (!found.length) { fail(row.id, 'no board for the row'); continue; }
    if (found.length > 1) { fail(row.id, `board ${found[0].board.id} is in more than one design`); continue; }
    const b = found[0].board;
    if (!b.route) { fail(row.id, `board ${b.id} has no route`); continue; }
    const page = resolveRoute(root, design.routeCell, b.route);
    if (!page) { fail(row.id, `route ${b.route} has no page file`); continue; }
    const names = Array.isArray(b.components) ? b.components : [];
    if (!names.length) { fail(row.id, `board ${b.id} names no components`); continue; }
    const libs = design.platforms.get(String(b.platform || '').toLowerCase()) || [];
    const files = [page];
    let missing = null;
    for (const full of names) {
      const name = String(full).replace(/^[^.]*\./, '');
      const hits = [];
      for (const lib of libs) {
        const abs = path.resolve(root, lib);
        if (inside(root, abs)) findComponent(root, abs, name, hits);
      }
      if (!hits.length) { missing = full; break; }
      files.push(...hits);
    }
    if (missing) { fail(row.id, `component ${missing} not found`); continue; }
    covers.set(row.id, [...new Set(files)]);
  }
  return { covers, unresolved };
}

module.exports = { designCovers };
