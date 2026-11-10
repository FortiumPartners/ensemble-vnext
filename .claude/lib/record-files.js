'use strict';

/**
 * record-files.js -- the one definition of a "record file" (a file the framework itself writes
 * while a feature runs) and the merge step that resolves clashes in them.
 *
 * WHY ONE MODULE: custody.classifyPath (what counts as unshipped) and /ship-build's merge-base
 * step (what may be auto-resolved) must agree on which files are record files, so both read
 * `isRecordFile` from here. This file must not require custody.js (that would be a cycle).
 *
 * RECORD FILES: `.claude/verification-notes.md`, `.trd-state`, anything under `.trd-state/`.
 * (`.trd-statex/...` is not one.)
 *
 * mergeBase decides what clashes with a REAL local `git merge --no-ff --no-commit`, so the
 * project's own `.gitattributes` (a union line included) applies exactly as for a person.
 * Union order is "ours, then theirs" (`git merge-file --union`).
 *
 * CLI (run from the project root; prints ONE JSON line and exits 0, even on refusal):
 *   node record-files.js merge-base-in --base <ref> --branch <name> --pr-head <sha>
 *
 * Every git call is `spawnSync` with an argument array (no shell).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const NOTES_FILE = '.claude/verification-notes.md';

/** True for a repo-relative, forward-slash path the framework writes itself. */
function isRecordFile(p) {
  return p === NOTES_FILE || p === '.trd-state' || String(p).startsWith('.trd-state/');
}

/** @returns {{recordOnly: boolean, notRecord: string[]}} for a list of unmerged paths. */
function classifyClash(paths) {
  const notRecord = paths.filter((p) => !isRecordFile(p));
  return { recordOnly: notRecord.length === 0, notRecord };
}

function git(args, cwd, input) {
  const r = spawnSync('git', args, { cwd, env: process.env, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    out: (r.stdout || '').trim(),
    raw: r.stdout || '',
    err: ((r.stderr || '') + (r.stdout && r.status ? r.stdout : '') || (r.error && r.error.message) || '').trim(),
  };
}

const refuse = (reason, extra) => ({ ok: false, outcome: 'refused', reason, ...extra });
const stopped = (reason, extra) => ({ ok: false, outcome: 'stopped', reason, ...extra });

/** Tracked paths with uncommitted changes (rename sources included). */
function dirtyTracked(cwd) {
  const r = git(['status', '--porcelain=v1', '-z', '--untracked-files=no', '--no-renames'], cwd);
  if (!r.ok) return null;
  return r.raw
    .split('\0')
    .filter(Boolean)
    .map((e) => e.slice(3));
}

/** Content of an index stage, or null when that stage is absent. */
function stage(n, p, cwd) {
  const r = git(['show', `:${n}:${p}`], cwd);
  return r.ok ? r.raw : null;
}

/** The union of both sides of one clashing record file, or {error}. */
function unionOf(p, cwd, tmpDir) {
  const base = stage(1, p, cwd) || '';
  const ours = stage(2, p, cwd);
  const theirs = stage(3, p, cwd);
  if (ours === null || theirs === null) return { error: `${p}: deleted on one side, cannot be merged` };
  const files = { ours, base, theirs };
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(tmpDir, k), v);
  const r = git(['merge-file', '--union', '-p', path.join(tmpDir, 'ours'), path.join(tmpDir, 'base'), path.join(tmpDir, 'theirs')], cwd);
  // merge-file exits with the number of conflicts (0 under --union) and a negative/255 on error.
  if (!r.ok) return { error: `${p}: git merge-file failed: ${r.err}` };
  return { text: r.raw };
}

/**
 * Merges `base` into the current branch, keeping both sides of any clashing record file.
 * @param {{base: string, branch: string, prHead: string}} opts
 * @param {string} [cwd]
 * @returns {{ok: true, outcome: 'clean'|'resolved', head: string, resolved?: string[]}
 *   | {ok: false, outcome: 'refused'|'stopped', reason: string, notRecord?: string[], invalidJson?: string[]}}
 *   `refused` means nothing was attempted; `stopped` means the merge was attempted and aborted.
 *   Either way HEAD and the working tree are as they were.
 */
function mergeBase({ base, branch, prHead }, cwd = process.cwd()) {
  if (!base || !branch || !prHead) return refuse('merge-base-in needs --base, --branch and --pr-head');
  const cur = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!cur.ok || cur.out !== branch) return refuse(`current branch is ${cur.out || 'unknown'}, not ${branch}`);
  if (!git(['merge-base', '--is-ancestor', prHead, 'HEAD'], cwd).ok) {
    return refuse(`HEAD does not contain the PR head ${prHead}`);
  }
  const dirty = dirtyTracked(cwd);
  if (dirty === null) return refuse('git status failed');
  const dirtyCode = dirty.filter((p) => !isRecordFile(p));
  if (dirtyCode.length) return refuse(`uncommitted changes outside the record files: ${dirtyCode.join(', ')}`, { notRecord: dirtyCode });

  const m = git(['merge', '--no-ff', '--no-commit', base], cwd);
  const mergeInProgress = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd).ok;
  const unmerged = git(['diff', '--name-only', '--diff-filter=U', '-z'], cwd).raw.split('\0').filter(Boolean);

  if (!m.ok && !mergeInProgress && unmerged.length === 0) {
    // git refused before merging (for example a dirty record file the merge would overwrite).
    return stopped(`git merge refused: ${m.err}`);
  }
  const abort = (reason, extra) => {
    git(['merge', '--abort'], cwd);
    return stopped(reason, extra);
  };

  if (unmerged.length === 0) {
    if (mergeInProgress) {
      const c = git(['commit', '--no-edit'], cwd);
      if (!c.ok) return abort(`git commit failed: ${c.err}`);
    }
    return { ok: true, outcome: 'clean', head: git(['rev-parse', 'HEAD'], cwd).out };
  }

  const { recordOnly, notRecord } = classifyClash(unmerged);
  if (!recordOnly) return abort(`clashes outside the record files: ${notRecord.join(', ')}`, { notRecord });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-files-'));
  try {
    const resolved = [];
    for (const p of unmerged) {
      const u = unionOf(p, cwd, tmpDir);
      if (u.error) return abort(u.error);
      if (p.endsWith('.json')) {
        try {
          JSON.parse(u.text);
        } catch (e) {
          return abort(`${p}: both sides kept is not valid JSON`, { invalidJson: [p] });
        }
      }
      resolved.push({ p, text: u.text });
    }
    for (const { p, text } of resolved) {
      fs.writeFileSync(path.join(cwd, p), text);
      const a = git(['add', '--', p], cwd);
      if (!a.ok) return abort(`git add ${p} failed: ${a.err}`);
    }
    const c = git(['commit', '--no-edit'], cwd);
    if (!c.ok) return abort(`git commit failed: ${c.err}`);
    return { ok: true, outcome: 'resolved', head: git(['rev-parse', 'HEAD'], cwd).out, resolved: unmerged };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE = 'usage: record-files.js merge-base-in --base REF --branch NAME --pr-head SHA';

function main(argv) {
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o) + '\n');
    return 0;
  };
  if (argv[0] === 'merge-base-in') {
    return emit(mergeBase({ base: flag(argv, '--base'), branch: flag(argv, '--branch'), prHead: flag(argv, '--pr-head') }));
  }
  return emit({ ok: false, outcome: 'refused', reason: USAGE });
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { isRecordFile, classifyClash, mergeBase, main };
