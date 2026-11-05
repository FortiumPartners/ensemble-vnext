'use strict';

/**
 * design-mirror.js -- the three-way sync between a design canvas and its mirror in the repository.
 *
 * WHY THIS EXISTS
 *
 * The canvas has no version history, so "what did it look like at the last sync" has to live in
 * the repository: each `design-map.json` canvas entry carries `files`, a map from mirrored path to
 * the sha256 of its content at the last sync (the base). Per file, comparing the canvas copy and
 * the repository copy to that base says which side changed. Hashes are deterministic and need no
 * git. `plan` only decides (returns data); `apply` only moves files. Committing, publishing and
 * re-deriving the map belong to the design commands, not here.
 *
 * Left out of every comparison, on both sides: `ds/` (the design system is recorded by version,
 * not mirrored) and `*.repo.dc.html` conflict copies (otherwise the next sync would publish the
 * conflict copy to the canvas as if it were a board).
 *
 * CLI (run from the project root; JSON on stdout, error on stderr, exit 1):
 *   node .claude/lib/design-mirror.js <check|plan|apply|refused|base|record> --dir docs/ui/<slug>
 *     [--canvas-dir <path>] [--version <v>] [--canvas <url>] [--work-dir <path>, required by refused]
 *   `record` needs --version: it stores that version and the current `base` hashes on the canvas
 *   entry, which is what the next `check` compares against. Run it after every publish or adopt.
 *
 * Example: node .claude/lib/design-mirror.js plan --dir docs/ui/checkout --canvas-dir /tmp/read/project
 */

const fs = require('fs');
const path = require('path');
const { hashFile } = require('./live-evidence');
const designMap = require('./design-map');

const DEFAULT_MIRROR_DIR = 'canvas/project';
const CANVAS_JSON = 'canvas.json';
const CONFLICT_SUFFIX = '.repo.dc.html';
const MAX_REFUSALS = 3;
const HASH_MAX_BYTES = 100 * 1024 * 1024;
const REFUSAL_FILE = 'mirror-refusals.json';

/** True for paths the mirror ignores: anything under `ds/`, and conflict copies (`*.repo.dc.html`
 *  for a board, `*.repo` for any other file -- see `conflictName`). */
const excluded = (rel) => rel.split('/')[0] === 'ds' || rel.endsWith(CONFLICT_SUFFIX) || rel.endsWith('.repo');

/** Mirrored file paths (posix, relative to `dir`) under `dir`; empty when `dir` does not exist. */
function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (excluded(r)) continue;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** sha256 of one mirrored file; null when absent. A file that exists but cannot be hashed throws,
 *  because a null hash would read as "unchanged" against another null. */
function hashOf(dir, rel) {
  const p = path.join(dir, rel);
  if (!fs.existsSync(p)) return null;
  const h = hashFile(p, HASH_MAX_BYTES);
  if (!h) throw new Error(`cannot hash ${p} (unreadable or over ${HASH_MAX_BYTES} bytes)`);
  return h;
}

/** `changed` when the live canvas version differs from the one recorded for `canvasUrl` (AC-F5.9). */
function check(map, canvasUrl, liveVersion) {
  const entry = (map.canvases || []).find((c) => c.url === canvasUrl);
  if (!entry) throw new Error(`no canvas with url ${canvasUrl} in the design map`);
  // `synced_version` is the name some maps already carry; honour it so they stop reading as changed.
  const recorded = entry.version !== undefined ? entry.version : entry.synced_version;
  return recorded === liveVersion ? 'unchanged' : 'changed';
}

/**
 * Classify every mirrored file as unchanged | canvas | repo | both.
 * A file on one side only is a change on that side; a deletion is a change like an edit.
 * @returns {{ files: Record<string, 'unchanged'|'canvas'|'repo'|'both'> }}
 */
function plan({ repoDir, canvasDir, base = {} }) {
  if (!fs.existsSync(path.join(canvasDir, CANVAS_JSON))) {
    throw new Error(`${path.join(canvasDir, CANVAS_JSON)} is missing; a partial canvas read is never synced`);
  }
  const names = new Set([...listFiles(repoDir), ...listFiles(canvasDir)]);
  const files = {};
  for (const rel of [...names].sort()) {
    const repo = hashOf(repoDir, rel);
    const canvas = hashOf(canvasDir, rel);
    const was = base[rel] || null;
    if (repo === canvas) files[rel] = 'unchanged';
    else if (repo === was) files[rel] = 'canvas';
    else if (canvas === was) files[rel] = 'repo';
    else files[rel] = 'both';
  }
  return { files };
}

/** `<board>.dc.html` -> `<board>.repo.dc.html` (anything else just gains `.repo`). */
const conflictName = (rel) => (rel.endsWith('.dc.html') ? rel.replace(/\.dc\.html$/, CONFLICT_SUFFIX) : `${rel}.repo`);

/**
 * Copy canvas-side changes into the repository. For `both`, the canvas file wins in place and the
 * repository version is kept beside it as `<board>.repo.dc.html` -- never a silent overwrite.
 * @returns {{ adopted: string[], toPublish: string[], conflicts: string[] }}
 */
function apply(p, { repoDir, canvasDir }) {
  const out = { adopted: [], toPublish: [], conflicts: [] };
  const takeCanvas = (rel) => {
    const dest = path.join(repoDir, rel);
    const src = path.join(canvasDir, rel);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    } else {
      fs.rmSync(dest, { force: true });
    }
  };
  for (const [rel, state] of Object.entries(p.files)) {
    if (state === 'canvas') {
      takeCanvas(rel);
      out.adopted.push(rel);
    } else if (state === 'repo') {
      out.toPublish.push(rel);
    } else if (state === 'both') {
      const mine = path.join(repoDir, rel);
      if (fs.existsSync(mine)) fs.copyFileSync(mine, path.join(repoDir, conflictName(rel)));
      takeCanvas(rel);
      out.conflicts.push(rel);
    }
  }
  return out;
}

/**
 * Count one refused publish in the run's work folder (never under docs/ui/, which is committed).
 * `retry` for the first two refusals, `stuck` from the third (AC-F5.6).
 */
function refused(workDir) {
  const file = path.join(workDir, REFUSAL_FILE);
  let count = 0;
  try {
    count = JSON.parse(fs.readFileSync(file, 'utf8')).count || 0;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  count += 1;
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ count }) + '\n');
  return count >= MAX_REFUSALS ? 'stuck' : 'retry';
}

/** The new `files` hash map for the canvas entry after a sync (same exclusions as `plan`). */
function base(dir) {
  const out = {};
  for (const rel of listFiles(dir)) out[rel] = hashOf(dir, rel);
  return out;
}

/**
 * Record a canvas's synced version after a publish or an adopt: sets `version`, `synced_at` and the
 * `files` base on its map entry, and drops the legacy `synced_version`. Without this, `check`
 * compares against a version nobody wrote and always says `changed`.
 */
function record(dir, entry, version) {
  const map = designMap.read(dir);
  const target = (map.canvases || []).find((c) => c.url === entry.url);
  target.version = version;
  delete target.synced_version;
  target.synced_at = new Date().toISOString();
  target.files = base(path.join(dir, target.dir || DEFAULT_MIRROR_DIR));
  designMap.write(dir, map);
  return { url: target.url, version, files: Object.keys(target.files).length };
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new Error(`unexpected argument ${rest[i]}`);
    const key = rest[i].slice(2);
    if (rest[i + 1] === undefined || rest[i + 1].startsWith('--')) throw new Error(`--${key} needs a value`);
    opts[key] = rest[++i];
  }
  return { verb, opts };
}

function main(argv) {
  const { verb, opts } = parseArgs(argv);
  if (!opts.dir) throw new Error('--dir is required');
  const map = designMap.read(opts.dir);
  const entry = opts.canvas ? (map.canvases || []).find((c) => c.url === opts.canvas) : (map.canvases || [])[0];
  if (!entry) throw new Error('no matching canvas in the design map');
  const repoDir = path.join(opts.dir, entry.dir || DEFAULT_MIRROR_DIR);
  const canvasDir = opts['canvas-dir'];
  const need = () => {
    if (!canvasDir) throw new Error('--canvas-dir is required');
    return { repoDir, canvasDir, base: entry.files || {} };
  };
  switch (verb) {
    case 'check':
      if (opts.version === undefined) throw new Error('check needs --version');
      return check(map, entry.url, opts.version);
    case 'plan': return plan(need());
    case 'apply': return apply(plan(need()), need());
    case 'refused':
      // No default: a guessed folder (docs/ui/, or the canvas read's parent) is committed or
      // reused across runs, so the count would never start from zero.
      if (!opts['work-dir']) throw new Error("refused needs --work-dir (the run's scratch folder)");
      return refused(opts['work-dir']);
    case 'base': return base(repoDir);
    case 'record':
      if (opts.version === undefined) throw new Error('record needs --version');
      return record(opts.dir, entry, opts.version);
    default: throw new Error(`unknown verb ${verb}`);
  }
}

module.exports = { check, plan, apply, refused, base, record, parseArgs };

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n');
  } catch (e) {
    process.stderr.write('design-mirror.js: ' + e.message + '\n');
    process.exit(1);
  }
}
