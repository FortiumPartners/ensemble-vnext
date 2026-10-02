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
    if (sub === 'read') {
      out.write(JSON.stringify(read(f['state-dir'])) + '\n');
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
    throw new Error('usage: live-evidence.js record|read --state-dir D ...');
  } catch (e) {
    err.write(`live-evidence: ${e.message}\n`);
    return 2;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { record, recordWithReason, read, manifestPath, hashFile, main, MAX_LINE_BYTES, COVERS_HASH_BYTES };
