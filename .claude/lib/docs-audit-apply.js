'use strict';

/**
 * docs-audit-apply.js -- the deterministic gate between a docs-audit batch's workflow result
 * and the commit. Agents edit docs in place and PROPOSE removals; nothing a model said is
 * trusted until this module has checked it against git.
 *
 * WHY THIS EXISTS (docs/TRD/docs-as-built.md D10, D12, SEC-1)
 *
 * - A record naming a path outside the batch (or outside docs/) is a model error or an attack;
 *   it is rejected, never acted on.
 * - An agent that edited something it did not report, or whose review failed, leaves a
 *   stray edit; it is reverted so the commit holds only claimed work.
 * - A doc that gained a "this document is superseded/archived" line took the path the owner
 *   rejected (no in-content signposts), so the whole doc reverts. A line saying the CODE
 *   deprecates a flag is a correction and is left alone.
 * - A removal is a model judgement, and wrongly deleting a file referenced only from CI or a
 *   test is the expensive mistake. So a candidate is removed only if it is git-tracked and no
 *   other file in the repo names its path or basename. The check iterates to a fixed point so
 *   two candidates that reference only each other can both go.
 *
 * INPUTS ARE REUSED, NOT RE-DERIVED: whether a doc is tracked comes from the assembly file
 * (docs-audit-assemble.js, AC-F1.4); this module does not re-run `git ls-files` for it.
 *
 * CLI (run from anywhere; paths are explicit):
 *   apply --repo <dir> --assembly <assembly.json> --result <batch-result.json> --out <applied.json>
 * Prints the applied JSON on stdout. Exit 0 on success, 2 on unusable input.
 *
 * Every git call uses spawnSync with an argument array (SEC-1): no shell, no interpolation.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { maskFencedLines } = require('./trd-parser');

const GENERATED_INDEXES = new Set(['docs/PRD/INDEX.md', 'docs/TRD/INDEX.md']);
const RUN_RECORDS_PREFIX = '.trd-state/_docs-audit/';
const STATE_PREFIX = '.trd-state/';
const MAP_HEADING = 'Where this lives in the code';
const MAX_HIT_TEXT = 200;

/** Run git in `repo`; never throws on a non-zero exit. */
function git(repo, args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * Normalise a record path to a repo-relative posix path inside docs/, or null.
 * Rejects absolute paths, traversal and anything outside docs/.
 */
function safeDocPath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0')) return null;
  if (path.posix.isAbsolute(p) || path.win32.isAbsolute(p)) return null;
  const n = path.posix.normalize(p.replace(/\\/g, '/'));
  if (n === '..' || n.startsWith('../') || !n.startsWith('docs/') || n.endsWith('/')) return null;
  return n;
}

// "> **Archived**", "SUPERSEDED", "Superseded by docs/x.md" -- a banner opening the line.
const BANNER_WORD = '(superseded|archived|deprecated)';
const LEAD_MARKUP = '[>\\s*_#|`-]*';
const STATUS_VALUE_RE = new RegExp(`^${LEAD_MARKUP}status[\\s*_|:\`]*${BANNER_WORD}\\b`, 'i');
const LEADING_WORD_RE = new RegExp(`^(${LEAD_MARKUP})(${BANNER_WORD})\\b(.*)$`, 'i');
// "This document is superseded" -- the subject is the document or a part of it.
const SELF_SUBJECT_RE = new RegExp(
  `\\b(this|the)\\s+(document|doc|page|section|prd|trd|file|spec|plan)\\s+` +
    `(is|was|has been|is now|has now been|are)\\s+(now\\s+)?${BANNER_WORD}\\b`,
  'i'
);

/**
 * Does one ADDED line mark the document's own content as superseded/archived/deprecated?
 * A line opening with the keyword counts only when it reads as a banner (markup prefix,
 * capitals, or "by <x>"), so "Deprecated: the --legacy flag" prose is not a signpost.
 */
function isSignpostLine(line) {
  const text = String(line).trim();
  if (!text) return false;
  if (STATUS_VALUE_RE.test(text) || SELF_SUBJECT_RE.test(text)) return true;
  const m = LEADING_WORD_RE.exec(text);
  if (!m) return false;
  const word = m[2];
  const hasMarkup = /[>*_#|]/.test(m[1]);
  const shouting = word === word.toUpperCase();
  const byForm = /^\s*by\b/i.test(m[4]);
  return hasMarkup || shouting || byForm;
}

/** Lines the diff ADDED to a file (`git diff HEAD -U0`), excluding the +++ header. */
function addedLines(repo, p) {
  const r = git(repo, ['diff', 'HEAD', '-U0', '--no-color', '--', p]);
  return r.stdout
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

/**
 * The text of the code-map section of a doc, or null when it has none. Shared with
 * docs-audit-deliver.js (the index reads the same section). Headings inside fenced code are
 * not headings: a doc quoting the format in a fence neither gains nor ends a map there.
 */
function mapSection(text) {
  const lines = String(text).split(/\r?\n/);
  const masked = maskFencedLines(lines);
  let start = -1;
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(masked[i]);
    if (m && m[2].toLowerCase() === MAP_HEADING.toLowerCase()) { start = i; depth = m[1].length; break; }
  }
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(masked[i]);
    if (m && m[1].length <= depth) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

// A file extension followed by :digits, a GitHub-style #L12, or "line 12".
const LINE_REF_RE = /\.[A-Za-z0-9]+:\d+|#L\d+|\blines?\s+\d+/i;

/**
 * Parses `git status --porcelain=v1 -z` output into `{ x, y, path }` entries. A rename or copy
 * (in either column) carries its origin as an extra NUL field, which is consumed and ignored.
 * Shared with docs-audit-deliver.js.
 */
function parsePorcelain(out) {
  const fields = out.split('\0');
  const entries = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.length < 4) continue;
    const x = f[0];
    const y = f[1];
    entries.push({ x, y, path: f.slice(3) });
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++;
  }
  return entries;
}

/** `git status` entries: [{ x, y, path }], NUL-delimited so odd filenames survive. */
function statusEntries(repo) {
  return parsePorcelain(git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout);
}

/**
 * Hits of `needles` in tracked files: [{ file, line, text }]. Returns null when git grep itself
 * failed (exit > 1): the caller must treat that as "references unknown", never as "none".
 */
function grepHits(repo, needles) {
  if (needles.length === 0) return [];
  const args = ['grep', '-F', '-I', '-n', '-z', '--no-color'];
  for (const n of needles) args.push('-e', n);
  const r = git(repo, args);
  if (r.status === 1) return [];
  if (r.status !== 0) return null;
  // -z -n output is `file \0 lineno \0 text \n`; a match's text never holds a newline.
  const hits = [];
  for (const row of r.stdout.split('\n')) {
    const i = row.indexOf('\0');
    const j = row.indexOf('\0', i + 1);
    if (i < 0 || j < 0) continue;
    // Full line text: attribution to a candidate must see a needle wherever it sits on the line.
    hits.push({ file: row.slice(0, i), line: row.slice(i + 1, j), text: row.slice(j + 1) });
  }
  return hits;
}

/**
 * Fixed-point reference check. A candidate is blocked when a file OTHER than itself, the
 * generated indexes, the run records or another still-removable candidate names its path
 * or basename. Blocking one candidate can expose another (the blocked file is no longer
 * going away), so repeat until nothing changes.
 */
function referenceCheck(repo, candidates) {
  const remaining = new Set(candidates);
  const blocked = new Map();
  const hitsFor = new Map();
  // One scan of the repo for every candidate's path and basename, then attribute each hit.
  const needlesFor = new Map(candidates.map((c) => [c, [c, path.posix.basename(c)]]));
  const all = grepHits(repo, [...new Set([...needlesFor.values()].flat())]);
  if (all === null) {
    // A failed scan proves nothing; deleting on it would fail open on the expensive mistake.
    for (const c of candidates) blocked.set(c, ['git grep failed; references could not be checked']);
    return { removable: [], blocked };
  }
  for (const c of candidates) {
    const needles = needlesFor.get(c);
    hitsFor.set(c, all.filter((h) => needles.some((n) => h.text.includes(n))));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of [...remaining]) {
      const real = hitsFor.get(c).filter((h) => {
        if (h.file === c) return false;
        if (GENERATED_INDEXES.has(h.file) || h.file.startsWith(RUN_RECORDS_PREFIX)) return false;
        if (remaining.has(h.file)) return false;
        return true;
      });
      if (real.length) {
        remaining.delete(c);
        blocked.set(c, real.map((h) => `${h.file}:${h.line}:${h.text.trim().slice(0, MAX_HIT_TEXT)}`));
        changed = true;
      }
    }
  }
  return { removable: candidates.filter((c) => remaining.has(c)), blocked };
}

/**
 * Apply one batch result to the working tree.
 * @param {{repo:string, assembly:object, result:object}} input
 * @returns {{edited:string[], removed:object[], blocked:object[], reverted:object[],
 *            mapDefects:object[], changelogDefects:{path:string,id:string}[], notTracked:string[], hookState:string[], untracked:string[],
 *            rejected:string[]}}
 */
function apply({ repo, assembly, result }) {
  const batchRef = (result && result.batch) || {};
  const batch = (assembly.batches || []).find((b) => b.key === batchRef.key && b.chunk === batchRef.chunk);
  if (!batch) throw new Error(`batch ${batchRef.key}#${batchRef.chunk} not found in the assembly`);
  const inBatch = new Set(batch.docs);
  const files = new Map((assembly.files || []).map((f) => [f.path, f]));

  const out = { edited: [], removed: [], blocked: [], reverted: [], mapDefects: [], changelogDefects: [], notTracked: [], hookState: [], untracked: [], rejected: [] };
  const revertedPaths = new Set();
  const markReverted = (p, why) => {
    if (!revertedPaths.has(p)) { revertedPaths.add(p); out.reverted.push({ path: p, why }); }
  };

  // 1. Validate record paths: inside docs/ and inside this batch.
  const records = new Map();
  for (const rec of (result && result.records) || []) {
    const p = safeDocPath(rec && rec.path);
    if (!p || !inBatch.has(p)) {
      out.rejected.push(String(rec && rec.path));
      markReverted(String((rec && rec.path) || ''), 'outside-batch');
      continue;
    }
    records.set(p, rec);
  }
  const dead = new Set(((result && result.dead) || []).map(safeDocPath).filter(Boolean));
  const failed = (p) => dead.has(p) || (records.get(p) && records.get(p).outcome === 'failed');
  const claimed = (p) => records.has(p) && records.get(p).outcome === 'edited';
  const proposedRemoval = (p) => records.has(p) && records.get(p).outcome === 'remove-proposed';

  // 2. Revert changes no record claims. Hook-written .trd-state is exempt and only listed.
  for (const { x, y, path: p } of statusEntries(repo)) {
    if (x === '?' && y === '?') {
      if (!p.startsWith(STATE_PREFIX) && !files.has(p)) out.untracked.push(p);
      continue;
    }
    if (p.startsWith(STATE_PREFIX) && !p.startsWith(RUN_RECORDS_PREFIX)) { out.hookState.push(p); continue; }
    if (p.startsWith(RUN_RECORDS_PREFIX)) continue;
    if (claimed(p)) continue;
    if (proposedRemoval(p) && x !== 'A') {
      // The doc is going away if the reference check allows it: drop the stray edit quietly so
      // the removal is still decided in step 4, rather than mislabelled and silently dropped.
      git(repo, ['checkout', 'HEAD', '--', p]);
      continue;
    }
    if (x === 'A') { // a file the agent created and staged: unstage, report as a newcomer
      git(repo, ['reset', '-q', 'HEAD', '--', p]);
      out.untracked.push(p);
      continue;
    }
    git(repo, ['checkout', 'HEAD', '--', p]);
    markReverted(p, failed(p) ? 'agent-failed' : 'outside-batch');
  }
  out.untracked.sort();
  out.hookState.sort();
  // A reviewed doc whose agent returned nothing must not keep half-finished edits.
  for (const p of dead) {
    if (inBatch.has(p) && !revertedPaths.has(p) && git(repo, ['diff', 'HEAD', '--quiet', '--', p]).status === 1) {
      git(repo, ['checkout', 'HEAD', '--', p]);
      markReverted(p, 'agent-failed');
    }
  }

  // 3. Post-checks on each claimed edit (D12): a signpost line reverts the whole doc.
  const edited = [];
  const addedByPath = new Map(); // reused by the changelog check: one `git diff` per doc
  for (const [p, rec] of records) {
    if (rec.outcome !== 'edited' || revertedPaths.has(p)) continue;
    if (!fs.existsSync(path.join(repo, p))) continue;
    const added = addedLines(repo, p);
    if (added.some(isSignpostLine)) {
      git(repo, ['checkout', 'HEAD', '--', p]);
      markReverted(p, 'banner');
      continue;
    }
    addedByPath.set(p, added);
    edited.push(p);
  }
  out.edited = edited.sort();

  // Changelog row for each behaviour change (reported, never reverted): the diff must add a line
  // naming the requirement id and the run date (first 10 chars of runId, `<YYYY-MM-DD>-<sha7>`).
  const runDate = String(assembly.runId || '').slice(0, 10);
  for (const p of out.edited) {
    const changes = records.get(p).behaviourChanges;
    if (!Array.isArray(changes) || !changes.length) continue;
    const added = addedByPath.get(p);
    for (const c of changes) {
      const id = String((c && c.id) || '');
      if (!id || !added.some((l) => l.includes(id) && l.includes(runDate))) out.changelogDefects.push({ path: p, id });
    }
  }

  // Code-map presence and format on every reviewed PRD/TRD (reported, never reverted).
  const reviewed = ['edited', 'unchanged', 'kept'];
  for (const [p, rec] of [...records].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const cls = (files.get(p) || {}).class || rec.class;
    if ((cls !== 'prd' && cls !== 'trd') || !reviewed.includes(rec.outcome) || revertedPaths.has(p)) continue;
    const abs = path.join(repo, p);
    if (!fs.existsSync(abs)) continue;
    const section = mapSection(fs.readFileSync(abs, 'utf8'));
    if (section === null) out.mapDefects.push({ path: p, why: 'missing' });
    else if (LINE_REF_RE.test(section)) out.mapDefects.push({ path: p, why: 'line-reference' });
  }

  // 4. Removals (D10): tracked only, then the fixed-point reference check, then git rm.
  const candidates = [];
  for (const [p, rec] of [...records].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (rec.outcome !== 'remove-proposed' || revertedPaths.has(p)) continue;
    const f = files.get(p);
    if (!f || f.git !== 'tracked') { out.notTracked.push(p); continue; }
    candidates.push(p);
  }
  const { removable, blocked } = referenceCheck(repo, candidates);
  for (const [p, hits] of blocked) {
    out.blocked.push({ path: p, reason: (records.get(p).removeReason || 'proposed for removal'), hits });
  }
  for (const p of removable) {
    const lastCommit = git(repo, ['log', '-1', '--format=%H', '--', p]).stdout.trim() || null;
    const rm = git(repo, ['rm', '-q', '-f', '--', p]);
    if (rm.status !== 0) {
      out.blocked.push({ path: p, reason: 'git rm failed', hits: [rm.stderr.trim().slice(0, MAX_HIT_TEXT)] });
      continue;
    }
    out.removed.push({ path: p, lastCommit, reason: records.get(p).removeReason || 'no reason recorded' });
  }
  out.blocked.sort((a, b) => (a.path < b.path ? -1 : 1));
  out.reverted.sort((a, b) => (a.path < b.path ? -1 : 1));
  return out;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
  }
  return o;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const a = parseArgs(rest);
  if (cmd !== 'apply' || !a.repo || !a.assembly || !a.result || !a.out) {
    process.stderr.write('usage: docs-audit-apply.js apply --repo <dir> --assembly <f> --result <f> --out <f>\n');
    return 2;
  }
  try {
    const assembly = JSON.parse(fs.readFileSync(a.assembly, 'utf8'));
    const result = JSON.parse(fs.readFileSync(a.result, 'utf8'));
    const applied = apply({ repo: path.resolve(a.repo), assembly, result });
    fs.writeFileSync(a.out, JSON.stringify(applied, null, 2) + '\n');
    process.stdout.write(JSON.stringify(applied) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`docs-audit-apply: ${e.message}\n`);
    return 2;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { apply, git, safeDocPath, isSignpostLine, mapSection, parsePorcelain, referenceCheck, main };
