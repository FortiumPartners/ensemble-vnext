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

/** sha256 of a file's bytes, or null when it cannot be read as a file. */
function hashFile(p) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Append one live-evidence entry. Returns true if written, false if rejected (nothing written).
 *
 * Rejects: no stateDir/task/artifact, an artifact that is not an existing file, empty `covers`,
 * a covered path that is not an existing file, or a line over MAX_LINE_BYTES.
 * `covers` paths are resolved through symlinks to absolute real paths, so a symlink records
 * its target and a later retarget changes the hash.
 */
function record(stateDir, entry, nowIso) {
  if (!stateDir || !entry || !entry.task || !entry.artifact) return false;
  if (!isFile(String(entry.artifact))) return false;
  if (!Array.isArray(entry.covers) || entry.covers.length === 0) return false;

  const covers = [];
  for (const c of entry.covers) {
    const p = typeof c === 'string' ? c : c && c.path;
    if (!p || !isFile(p)) return false;
    let real;
    try {
      real = fs.realpathSync(p);
    } catch {
      return false;
    }
    const sha256 = hashFile(real);
    if (!sha256) return false;
    if (!covers.some((x) => x.path === real)) covers.push({ path: real, sha256 });
  }

  const row = {
    ts: nowIso || new Date().toISOString(),
    task: String(entry.task).slice(0, 60),
    artifact: String(entry.artifact),
    shows: String(entry.shows || '').slice(0, 300),
    environment: String(entry.environment || '').slice(0, 80),
    covers,
  };
  const line = JSON.stringify(row);
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) return false;

  try {
    fs.mkdirSync(path.dirname(manifestPath(stateDir)), { recursive: true });
    fs.appendFileSync(manifestPath(stateDir), line + '\n');
  } catch {
    return false;
  }
  return true;
}

/**
 * Entries in file order, one per artifact (the LAST entry for an artifact wins, so a re-capture
 * supersedes an earlier record). Malformed lines and rows missing `artifact`/`covers` are
 * skipped. `[]` when the manifest is absent.
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
    if (!row || typeof row.artifact !== 'string' || !Array.isArray(row.covers)) continue;
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
      const ok = record(f['state-dir'], {
        task: f.task, artifact: f.artifact, shows: f.shows, environment: f.environment, covers,
      });
      if (!ok) {
        err.write('live-evidence: rejected -- need --task, an existing --artifact file, and --covers naming existing files\n');
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

module.exports = { record, read, manifestPath, hashFile, main, MAX_LINE_BYTES };
