'use strict';

/**
 * live-evidence.js -- the manifest of evidence a `[LIVE]` task captured, with the content hash
 * of every source file that evidence depends on.
 *
 * WHY THIS EXISTS
 *
 * The functional-verification checker (`functional-verification.js`) treats an artifact older
 * than the run's `since` as stale, so a live check captured earlier in the same build is thrown
 * away and captured again. Freshness by mtime cannot fix that (a checkout or rebase rewrites
 * mtimes; a retargeted symlink dodges them), so a live task declares `covers` -- the files whose
 * behaviour the artifact exercises -- and this module stores each one's sha256 at record time.
 * The checker recomputes the hashes later: identical bytes mean the evidence still describes the
 * code. `covers` is declared by the task that captured the evidence, never by the exerciser.
 *
 * Append-only JSONL at `<stateDir>/evidence/live-manifest.jsonl`, shaped like `discovered.js`:
 * injectable clock, one line under PIPE_BUF so parallel appends cannot interleave. Unlike
 * `discovered.js`, a record that cannot be stored faithfully is REJECTED, not trimmed -- a
 * truncated `covers` list would silently weaken the freshness gate.
 *
 * CLI (run from the project root):
 *   node .claude/lib/live-evidence.js record --state-dir D --task T --artifact P \
 *        --covers a.js,b.js [--shows S] [--environment E]
 *   node .claude/lib/live-evidence.js read --state-dir D       # JSON array; [] when absent
 *
 *   node .claude/lib/live-evidence.js record-criteria --state-dir D --trd T --definition P \
 *        [--state verification-state.json]    # prints {"recorded":[...],"none":[...]}
 *
 * CRITERION COVERS (separate from the manifest above): for each criterion proven `met`, the repo
 * paths of the TRD tasks that serve it, so custody (`custody.js reconcile`) can re-prove only the
 * criteria a later change can affect. One JSON file, `<stateDir>/evidence/criterion-covers.json`,
 * written whole and atomically and merged with what is there -- no line cap, because the
 * multi-task criteria with the longest lists are exactly where the saving is largest. Derived
 * from the TRD here, at proof time, never re-derived in custody.
 *
 * `read` on the CLI drops entries whose covered files no longer hash as recorded (a review edit
 * after capture) and says how many on stderr, so the exerciser is never offered evidence that is
 * already stale and has to learn so from the Judge.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Same bound, same reason, as discovered.js: keep one append under PIPE_BUF (4096). */
const MAX_LINE_BYTES = 2048;

/**
 * The most a single covered file is read for hashing, here and in the checker
 * (`functional-verification.js` imports this). A file over it is rejected at record time rather
 * than recorded and then silently treated as "changed" by every later check.
 */
const COVERS_HASH_BYTES = 10_000_000;

function manifestPath(stateDir) {
  return path.join(stateDir, 'evidence', 'live-manifest.jsonl');
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * sha256 of a file's bytes, or null when it is not a regular file, is larger than `maxBytes`
 * (never hashed from a partial read, which could report identical bytes after a change past the
 * cap), or cannot be read.
 */
function hashFile(p, maxBytes = COVERS_HASH_BYTES) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > maxBytes) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch {
    return null;
  }
}

/** One covered path -> `{path, sha256}` with its real absolute path, or a rejection reason. */
function coverEntry(p) {
  if (!p || !isFile(p)) return { reason: `covered path is not an existing file: ${p}` };
  let real;
  try {
    real = fs.realpathSync(p);
  } catch {
    return { reason: `covered path cannot be resolved: ${p}` };
  }
  const sha256 = hashFile(real);
  if (!sha256) return { reason: `covered file is unreadable or larger than ${COVERS_HASH_BYTES} bytes: ${p}` };
  return { path: real, sha256 };
}

/**
 * `record`'s body, returning why a record was rejected so the CLI can say so -- an agent told
 * "fix the call, do not skip it" cannot fix a call whose error names the wrong cause.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function recordWithReason(stateDir, entry, nowIso) {
  if (!stateDir || !entry || !entry.task || !entry.artifact) {
    return { ok: false, reason: 'need --state-dir, --task and --artifact' };
  }
  const artifact = path.resolve(String(entry.artifact));
  if (!isFile(artifact)) return { ok: false, reason: `artifact is not an existing file: ${entry.artifact}` };
  if (!Array.isArray(entry.covers) || entry.covers.length === 0) {
    return { ok: false, reason: '--covers must name at least one source file' };
  }

  const covers = [];
  // The artifact itself is covered too: the manifest is matched by artifact PATH, so without its
  // own hash a different capture later written to the same path (with no successful record of
  // its own) would be reused under this record's `covers` and `shows`.
  for (const p of [...entry.covers.map((c) => (typeof c === 'string' ? c : c && c.path)), artifact]) {
    const c = coverEntry(p);
    if (c.reason) return { ok: false, reason: c.reason };
    if (!covers.some((x) => x.path === c.path)) covers.push(c);
  }

  const row = {
    ts: nowIso || new Date().toISOString(),
    task: String(entry.task).slice(0, 60),
    artifact,
    shows: String(entry.shows || '').slice(0, 300),
    environment: String(entry.environment || '').slice(0, 80),
    covers,
  };
  const line = JSON.stringify(row);
  const bytes = Buffer.byteLength(line);
  if (bytes > MAX_LINE_BYTES) {
    return {
      ok: false,
      reason:
        `the record is ${bytes} bytes, over the ${MAX_LINE_BYTES}-byte line cap (${covers.length} covered ` +
        `files). Never drop a file the artifact depends on to fit: split the capture into ` +
        `narrower artifacts, each covering fewer files, and record each one`,
    };
  }

  try {
    fs.mkdirSync(path.dirname(manifestPath(stateDir)), { recursive: true });
    fs.appendFileSync(manifestPath(stateDir), line + '\n');
  } catch (e) {
    return { ok: false, reason: `cannot write the manifest: ${e.message}` };
  }
  return { ok: true };
}

/**
 * Append one live-evidence entry. Returns true if written, false if rejected (nothing written).
 *
 * Rejects: no stateDir/task/artifact, an artifact that is not an existing file, empty `covers`,
 * a covered path that is not an existing file or is over COVERS_HASH_BYTES, or a line over
 * MAX_LINE_BYTES. The artifact is stored as an absolute path. `covers` paths are resolved
 * through symlinks to absolute real paths, so a symlink records its target and a later retarget
 * changes the hash; the artifact itself is appended to `covers`, binding the record to its bytes.
 */
function record(stateDir, entry, nowIso) {
  return recordWithReason(stateDir, entry, nowIso).ok;
}

/**
 * Entries in file order, one per artifact (the LAST entry for an artifact wins, so a re-capture
 * supersedes an earlier record). Malformed lines and rows without a non-empty `artifact` and a
 * non-empty `covers` are skipped -- the same standard `verify-functional` validates `liveEvidence`
 * against, so one degenerate line cannot make the whole verification run throw. `[]` when the
 * manifest is absent.
 */
function read(stateDir) {
  let text;
  try {
    text = fs.readFileSync(manifestPath(stateDir), 'utf8');
  } catch {
    return [];
  }
  const byArtifact = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row.artifact !== 'string' || row.artifact === '') continue;
    if (!Array.isArray(row.covers) || row.covers.length === 0) continue;
    byArtifact.delete(row.artifact); // re-insert so order follows the latest record
    byArtifact.set(row.artifact, row);
  }
  return [...byArtifact.values()];
}

/**
 * True when every covered file still hashes as recorded. A file now missing, unreadable, or
 * over the hash cap counts as changed (hashFile returns null), matching the checker.
 */
function isStillFresh(row) {
  return row.covers.every((c) => c && typeof c.path === 'string' && hashFile(c.path) === c.sha256);
}

/**
 * `read`, minus entries whose covered files changed since they were recorded.
 * @returns {{entries: object[], dropped: number}}
 */
function readFresh(stateDir) {
  const all = read(stateDir);
  const entries = all.filter(isStillFresh);
  return { entries, dropped: all.length - entries.length };
}

// ---------------------------------------------------------------------------
// Criterion covers
// ---------------------------------------------------------------------------

function criterionCoversPath(stateDir) {
  return path.join(stateDir, 'evidence', 'criterion-covers.json');
}

/** A repo-relative forward-slash path, or null for an absolute path, a `..` segment, or nothing. */
function normalizeCoverPath(p) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!s || s.startsWith('/') || /^[A-Za-z]:/.test(s)) return null;
  if (s.split('/').some((seg) => seg === '..')) return null;
  return s.replace(/\/{2,}/g, '/');
}

/** Paths in backticks in a task row's description that exist on disk (the no-Touches fallback). */
function backtickedExistingPaths(text, cwd) {
  const out = [];
  for (const m of String(text || '').matchAll(/`([^`]+)`/g)) {
    if (/\s/.test(m[1])) continue;
    const p = normalizeCoverPath(m[1]);
    if (p && isFile(path.join(cwd, p))) out.push(p);
  }
  return out;
}

/**
 * Maps each criterion id to the repo paths its TRD tasks plan to touch.
 *
 * A criterion's definition row names objective ids (its `Must pass` cell, or any declared
 * objective id anywhere in the row) and possibly task ids. Tasks whose `Serves` includes a named
 * objective, plus tasks named directly, contribute their grounding Touches; a task with no
 * Touches contributes the existing paths backticked in its Master Task List row (`source:
 * 'task-row'`). No task or no path means no entry. Throws when the TRD or the definition cannot
 * be read (the CLI turns that into exit 2), so a wrong path is never mistaken for "nothing maps".
 *
 * Requires `trd-parser`/`spec-scope`/`functional-verification` inside the function:
 * `functional-verification.js` requires this module at load, so a top-level require is a cycle.
 *
 * @returns {Map<string, {covers: string[], source: 'touches'|'task-row'}>}
 */
function deriveCriterionCovers({ trdPath, definitionPath, ids, cwd = process.cwd() }) {
  const { parseTrd, maskFencedLines, findTables } = require('./trd-parser');
  const { objectiveRows } = require('./spec-scope');
  const result = new Map();
  const want = new Set(ids || []);
  if (want.size === 0) return result;

  const trdText = fs.readFileSync(trdPath, 'utf8');
  const parsed = parseTrd(trdText);
  const objectiveIds = objectiveRows(trdText).map((o) => o.id);
  // parseTrd strips backticks from a task's description, so the fallback reads the raw table row.
  const rawRow = (taskId) =>
    maskFencedLines(trdText.split(/\r?\n/)).find((l) => l.replace(/[|\s*`]/g, ' ').trim().split(/\s+/)[0] === taskId && l.trim().startsWith('|')) || '';

  const lines = maskFencedLines(fs.readFileSync(definitionPath, 'utf8').split(/\r?\n/));
  const clean = (h) => String(h ?? '').replace(/\*\*|`/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const table = findTables(lines, 0, lines.length).find((t) => t.headerCells.some((h) => clean(h) === 'id'));
  if (!table) return result;
  const idCol = table.headerCells.findIndex((h) => clean(h) === 'id');

  const named = (text, candidates) =>
    candidates.filter((c) => new RegExp(`(^|[^A-Za-z0-9_-])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_-])`).test(text));

  for (const row of table.dataRows) {
    const id = String(row.cells[idCol] ?? '').replace(/\*\*|`/g, '').trim();
    if (!want.has(id)) continue;
    const rowText = row.cells.join(' | ');
    const objs = named(rowText, objectiveIds);
    const taskIds = new Set(named(rowText, parsed.tasks.map((t) => t.id)));
    for (const t of parsed.tasks) if ((t.serves || []).some((o) => objs.includes(o))) taskIds.add(t.id);

    const covers = new Set();
    let fromRow = false;
    for (const t of parsed.tasks.filter((x) => taskIds.has(x.id))) {
      const touches = ((parsed.grounding[t.id] || {}).touches || []).map(normalizeCoverPath).filter(Boolean);
      if (touches.length) touches.forEach((p) => covers.add(p));
      else for (const p of backtickedExistingPaths(rawRow(t.id), cwd)) { covers.add(p); fromRow = true; }
    }
    if (covers.size) result.set(id, { covers: [...covers], source: fromRow ? 'task-row' : 'touches' });
  }
  return result;
}

/**
 * Merges `map` (id -> `{covers, source}`) into the criterion-covers file, one atomic write; a
 * re-record of an id replaces that id's entry. Entries with no usable covers are skipped.
 * @returns {string[]} the ids recorded
 */
function recordCriterionCovers(stateDir, map, nowIso) {
  const file = criterionCoversPath(stateDir);
  let criteria = {};
  try {
    const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cur && cur.criteria && typeof cur.criteria === 'object' && !Array.isArray(cur.criteria)) criteria = cur.criteria;
  } catch { /* absent or unreadable: start empty */ }
  const ts = nowIso || new Date().toISOString();
  const recorded = [];
  for (const [id, v] of map instanceof Map ? map : Object.entries(map || {})) {
    const covers = [...new Set(((v && v.covers) || []).map(normalizeCoverPath).filter(Boolean))];
    if (!covers.length) continue;
    criteria[id] = { covers, source: v.source === 'task-row' ? 'task-row' : 'touches', ts };
    recorded.push(id);
  }
  if (recorded.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    require('./implement-state').save(file, { version: 1, criteria });
  }
  return recorded;
}

/** id -> covers array. Empty map when the file is absent, unreadable or malformed. */
function readCriterionCovers(stateDir) {
  const out = new Map();
  try {
    const cur = JSON.parse(fs.readFileSync(criterionCoversPath(stateDir), 'utf8'));
    for (const [id, v] of Object.entries((cur && cur.criteria) || {})) {
      if (v && Array.isArray(v.covers) && v.covers.length) out.set(id, v.covers.filter((p) => typeof p === 'string'));
    }
  } catch { /* empty */ }
  return out;
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--')) throw new Error(`unexpected argument: ${args[i]}`);
    if (args[i + 1] === undefined) throw new Error(`${args[i]} needs a value`);
    flags[args[i].slice(2)] = args[i + 1];
  }
  return flags;
}

/** CLI entry. Returns the process exit code. */
function main(argv, out = process.stdout, err = process.stderr) {
  const [sub, ...rest] = argv;
  try {
    const f = parseFlags(rest);
    if (!f['state-dir']) throw new Error('--state-dir is required');
    if (sub === 'record-criteria') {
      if (!f.trd || !f.definition) throw new Error('record-criteria needs --trd and --definition');
      const stateFile = f.state || path.join(f['state-dir'], 'verification-state.json');
      const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const met = (Array.isArray(st.criteria) ? st.criteria : []).filter((c) => c && c.status === 'met').map((c) => String(c.id));
      const derived = deriveCriterionCovers({ trdPath: f.trd, definitionPath: f.definition, ids: met });
      const recorded = recordCriterionCovers(f['state-dir'], derived);
      out.write(JSON.stringify({ recorded, none: met.filter((id) => !recorded.includes(id)) }) + '\n');
      return 0;
    }
    if (sub === 'read') {
      const { entries, dropped } = readFresh(f['state-dir']);
      if (dropped > 0) err.write(`live-evidence: dropped ${dropped} stale entr${dropped === 1 ? 'y' : 'ies'} (covered files changed since capture)\n`);
      out.write(JSON.stringify(entries) + '\n');
      return 0;
    }
    if (sub === 'record') {
      const covers = (f.covers || '').split(',').map((s) => s.trim()).filter(Boolean);
      const r = recordWithReason(f['state-dir'], {
        task: f.task, artifact: f.artifact, shows: f.shows, environment: f.environment, covers,
      });
      if (!r.ok) {
        err.write(`live-evidence: rejected -- ${r.reason}\n`);
        return 1;
      }
      return 0;
    }
    throw new Error('usage: live-evidence.js record|read|record-criteria --state-dir D ...');
  } catch (e) {
    err.write(`live-evidence: ${e.message}\n`);
    return 2;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { deriveCriterionCovers, recordCriterionCovers, readCriterionCovers, criterionCoversPath, record, recordWithReason, read, readFresh, manifestPath, hashFile, main, MAX_LINE_BYTES, COVERS_HASH_BYTES };
