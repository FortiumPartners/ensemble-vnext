'use strict';

/**
 * artifacts.js -- the manifest of documents a feature's commands produced, and where each lives.
 *
 * WHY THIS EXISTS
 *
 * `.trd-state/<feature>/artifacts.json` used to hold only published-page URLs, written by hand
 * from prose in each command prompt. Forge finds and serves a feature's documents by PATH, and
 * publishing to claude.ai is optional, so the manifest has to say where each document is whether
 * or not it was ever published. This module is the one writer: commands call the CLI and never
 * edit the JSON, so the shape cannot drift between the dozen prompts that touch it.
 *
 * File shape (version 2). Kinds sit at the top level beside `version`:
 *   { "version": 2,
 *     "prd": { "path": "docs/PRD/x.md", "url": "https://...", "updated_at": "<ISO>", "command": "/create-prd" } }
 * A kind is any lower-case slug (check-skill page names are kinds too); `KINDS` lists the eight
 * document kinds, for documentation only. `version` is reserved.
 *
 * Old files (a bare URL string per kind, and the key `audit-build-report`) are upgraded on READ
 * and written back as version 2 on the next `record`. `url` of "" means "never published".
 * A `record` that changes nothing writes nothing, so republishing to the same URL does not
 * leave the tracked file dirty.
 *
 * CLI (run from the project root):
 *   node .claude/lib/artifacts.js record --state-dir D --kind K --path P --command C [--url U]
 *   node .claude/lib/artifacts.js get    --state-dir D --kind K   # URL + newline, or nothing
 *   node .claude/lib/artifacts.js read   --state-dir D            # normalised JSON
 */

const fs = require('fs');
const path = require('path');

const VERSION = 2;
const FILE = 'artifacts.json';
const KIND_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** The eight document kinds. Documentation only: any valid slug is accepted. */
const KINDS = [
  'prd', 'trd', 'audit-prd', 'audit-trd', 'success-definition',
  'verification-plan', 'verification-report', 'audit-build',
];

const manifestPath = (stateDir) => path.join(stateDir, FILE);

/** The file's text, or null when absent. */
function readText(stateDir) {
  try {
    return fs.readFileSync(manifestPath(stateDir), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Parse the file's text; null when absent. Malformed JSON throws -- never silently replaced. */
function parseRaw(stateDir, text) {
  if (text === null) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${manifestPath(stateDir)} is not valid JSON: ${e.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${manifestPath(stateDir)} must hold a JSON object`);
  }
  return data;
}

function normaliseEntry(v) {
  if (typeof v === 'string') return { path: null, url: v, updated_at: null, command: null };
  const o = v && typeof v === 'object' ? v : {};
  return {
    path: typeof o.path === 'string' ? o.path : null,
    url: typeof o.url === 'string' ? o.url : '',
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : null,
    command: typeof o.command === 'string' ? o.command : null,
  };
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function normalise(data) {
  const out = { version: VERSION };
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'version' || key === 'audit-build-report') continue;
    // defineProperty, not assignment: a stored "__proto__" key stays an ordinary entry.
    Object.defineProperty(out, key, { value: normaliseEntry(value), enumerable: true, writable: true, configurable: true });
  }
  // The old key is the same kind under its former name; the new key wins when both exist.
  if (data && 'audit-build-report' in data && !('audit-build' in data)) {
    out['audit-build'] = normaliseEntry(data['audit-build-report']);
  }
  return out;
}

/** The manifest, normalised to version 2. `{version: 2}` when the file is absent. */
function read(stateDir) {
  return normalise(parseRaw(stateDir, readText(stateDir)));
}

/** The stored URL for a kind, or '' when there is no entry or it was never published. */
function get(stateDir, kind) {
  const data = read(stateDir);
  const entry = own(data, kind) ? data[kind] : undefined;
  return entry && typeof entry === 'object' ? entry.url : '';
}

/** Validate a project-relative path to an existing file inside `root`; return it with '/' separators. */
function checkPath(p, root) {
  if (typeof p !== 'string' || p === '') throw new Error('path is required');
  if (path.isAbsolute(p)) throw new Error(`path must be project-relative, got absolute: ${p}`);
  const base = path.resolve(root);
  const abs = path.resolve(base, p);
  const rel = path.relative(base, abs);
  if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`path escapes the project root: ${p}`);
  }
  let st;
  try {
    st = fs.statSync(abs);
  } catch (e) {
    throw new Error(`no file at ${p}`);
  }
  if (!st.isFile()) throw new Error(`not a file: ${p}`);
  // Store the normalised form, so `./docs/x.md` and `docs/x.md` are one path.
  return rel.split(path.sep).join('/');
}

/**
 * Record where a document lives. `url` undefined keeps the stored URL ('' for a new kind);
 * '' clears it. Returns the stored entry. Throws, leaving the file untouched, on a bad kind,
 * command or path.
 *
 * @example record('.trd-state/x', 'prd', { path: 'docs/PRD/x.md', command: '/create-prd', url })
 */
function record(stateDir, kind, entry, { root = process.cwd(), now = () => new Date() } = {}) {
  if (typeof kind !== 'string' || kind === 'version' || !KIND_RE.test(kind)) {
    throw new Error(`invalid kind: ${JSON.stringify(kind)} (a lower-case slug other than "version")`);
  }
  const { path: p, url, command } = entry || {};
  if (typeof command !== 'string' || command.trim() === '') throw new Error('command is required');
  if (url !== undefined && typeof url !== 'string') throw new Error('url must be a string');
  const storedPath = checkPath(p, root);

  const existingText = readText(stateDir);
  const data = normalise(parseRaw(stateDir, existingText)); // throws on malformed JSON
  const prev = own(data, kind) ? data[kind] : undefined;
  const next = {
    path: storedPath,
    url: url !== undefined ? url : (prev ? prev.url : ''),
    updated_at: null,
    command,
  };
  const unchanged = prev && prev.path === next.path && prev.url === next.url && prev.command === next.command
    && prev.updated_at !== null;
  next.updated_at = unchanged ? prev.updated_at : now().toISOString();
  data[kind] = next;

  // Compare serialised bytes: an unchanged entry in an already-v2 file rewrites nothing, while
  // an old-format file differs from its upgraded form and so is always rewritten.
  const text = JSON.stringify(data, null, 2) + '\n';
  if (text !== existingText) {
    fs.mkdirSync(stateDir, { recursive: true });
    const tmp = path.join(stateDir, `.${FILE}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, manifestPath(stateDir));
  }
  return next;
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`);
    if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
    flags[a.slice(2)] = argv[++i];
  }
  return flags;
}

function main(argv) {
  const [verb, ...rest] = argv;
  const f = parseArgs(rest);
  if (!f['state-dir']) throw new Error('--state-dir is required');
  switch (verb) {
    case 'read':
      process.stdout.write(JSON.stringify(read(f['state-dir']), null, 2) + '\n');
      return;
    case 'get': {
      if (!f.kind) throw new Error('--kind is required');
      const url = get(f['state-dir'], f.kind);
      if (url) process.stdout.write(url + '\n');
      return;
    }
    case 'record':
      record(f['state-dir'], f.kind, { path: f.path, url: f.url, command: f.command });
      return;
    default:
      throw new Error('usage: artifacts.js read|get|record --state-dir D [--kind K --path P --command C --url U]');
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`artifacts.js: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { KINDS, read, get, record };
