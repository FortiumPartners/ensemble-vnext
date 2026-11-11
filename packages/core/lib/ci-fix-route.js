'use strict';

/**
 * ci-fix-route.js -- decides whether a CI failure may be fixed directly (a test file or CI
 * config edit) or must go through reconciliation (anything touching product code).
 *
 * WHY ONE MODULE: the fix-findings contract needs one answer to "how big is this fix?".
 * "Test file" and "record file" come from custody.classifyPath, so they mean one thing in
 * custody and here. Routing is fail-closed: anything unclear reconciles.
 *
 * ROUTE (`direct` only when ALL hold): the row names files (`files`, or singular `file`);
 * every file is test or ci-config (record files are ignored, but at least one test/ci-config
 * file must remain); the summary does not start with `[lint]`; every path is repo-relative
 * (no absolute path, no `..` segment). Otherwise `reconcile` with a reason.
 *
 * CHECK-DIFF: after a direct fix, every changed path must still be test or ci-config, and no
 * added/removed line of a ci-config file may touch `permissions`, `secrets` (or `github.token`),
 * `uses:`, the `on:` key or a trigger event key under it (a supply-chain surface the owner
 * keeps). A ci-config file the fix CREATED is untracked, so `git diff` shows none of it: every
 * one of its lines is scanned as added.
 *
 * CLI (prints ONE JSON line; exit 0 on success, 1 with {ok:false,error} on bad usage):
 *   node ci-fix-route.js route --state-dir <dir> --trd <path|none>
 *   node ci-fix-route.js check-diff [--base <commit>] [--trd <path|none>]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const custody = require('./custody');
const discovered = require('./discovered');

const CI_CONFIG = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.gitlab-ci\.yml$/,
  /^\.circleci\/config\.yml$/,
  /^azure-pipelines\.yml$/,
  /^bitbucket-pipelines\.yml$/,
  /^Jenkinsfile$/,
];

// Lines of a CI config whose change alters trust, secrets or triggers. A trigger event key
// (`push:`, `workflow_run:` ...) is listed because adding one under an existing `on:` changes
// when the workflow runs without touching the `on:` line itself. Keys may be quoted.
const TRIGGERS = [
  'on', 'pull_request_target', 'pull_request', 'push', 'workflow_dispatch', 'workflow_run',
  'workflow_call', 'repository_dispatch', 'schedule', 'release', 'issue_comment', 'issues',
  'pull_request_review', 'pull_request_review_comment', 'merge_group', 'deployment', 'deployment_status',
];
const SENSITIVE_LINE = new RegExp(
  `(^|\\s)["']?(permissions|uses|${TRIGGERS.join('|')})["']?\\s*:|\\bsecrets\\b|\\bgithub\\.token\\b|\\bGITHUB_TOKEN\\b`,
);

/** @returns {'test'|'ci-config'|'record'|'other'} for a repo-relative, forward-slash path. */
function classifyFile(p, trdRel) {
  const c = custody.classifyPath(p, trdRel);
  if (c === 'ignored') return 'record';
  if (c === 'test-only') return 'test';
  if (CI_CONFIG.some((re) => re.test(p))) return 'ci-config';
  return 'other';
}

function unsafe(p) {
  return typeof p !== 'string' || p === '' || path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.split(/[\\/]/).includes('..');
}

/** @returns {{route:'direct'|'reconcile', classes:string[], files:string[], reason:string}} */
function routeRow(row, { trdRel = null } = {}) {
  const files = [].concat(row.files || [], row.file ? [row.file] : []).filter((f) => f != null);
  const out = (route, classes, reason) => ({ route, classes, files, reason });
  if (files.length === 0) return out('reconcile', [], 'no files recorded');
  const bad = files.find(unsafe);
  if (bad !== undefined) return out('reconcile', [], `unsafe path: ${bad}`);
  const classes = files.map((f) => classifyFile(f, trdRel));
  if (/^\s*\[lint\]/i.test(String(row.summary || ''))) return out('reconcile', classes, 'lint row');
  const product = files.find((_, i) => classes[i] === 'other');
  if (product !== undefined) return out('reconcile', classes, `product code: ${product}`);
  if (!classes.some((c) => c === 'test' || c === 'ci-config')) return out('reconcile', classes, 'only record files');
  return out('direct', classes, 'test or CI config only');
}

/**
 * Split a unified diff into {path -> changed lines (without the +/- marker)}. Only lines inside
 * a hunk (after `@@`) count, so a content line that happens to start `-- ` or `++ ` is still
 * scanned rather than mistaken for a `---`/`+++` header.
 */
function changedLinesByFile(diffText) {
  const byFile = {};
  let cur = null;
  let inHunk = false;
  for (const line of String(diffText || '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/ b\/(.+)$/);
      cur = m ? m[1] : null;
      inHunk = false;
    } else if (line.startsWith('@@')) {
      inHunk = true;
    } else if (cur && inHunk && (line[0] === '+' || line[0] === '-')) {
      (byFile[cur] = byFile[cur] || []).push(line.slice(1));
    }
  }
  return byFile;
}

/** A file the fix created, rendered as a diff where every line is added. */
function addedFileDiff(p, content) {
  const body = String(content).split('\n').map((l) => `+${l}`).join('\n');
  return `diff --git a/${p} b/${p}\n--- /dev/null\n+++ b/${p}\n@@ -0,0 +1 @@\n${body}\n`;
}

function checkDiff({ paths, diffText, trdRel = null }) {
  const refused = [];
  const lines = changedLinesByFile(diffText);
  for (const p of paths) {
    const cls = unsafe(p) ? 'other' : classifyFile(p, trdRel);
    if (cls === 'other') refused.push({ path: p, reason: unsafe(p) ? 'unsafe path' : 'product code' });
    else if (cls === 'ci-config') {
      const hit = (lines[p] || []).find((l) => SENSITIVE_LINE.test(l));
      if (hit !== undefined) refused.push({ path: p, reason: `sensitive CI line: ${hit.trim()}` });
    }
  }
  return { ok: refused.length === 0, paths, refused };
}

function git(args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument: ${argv[i]}`);
    o[argv[i].slice(2)] = argv[i + 1];
  }
  return o;
}

const trdRelative = (trd) =>
  !trd || trd === 'none' ? null : path.relative(process.cwd(), path.resolve(trd)).split(path.sep).join('/');

function main(argv) {
  const [cmd, ...rest] = argv;
  const o = parseArgs(rest);
  const trdRel = trdRelative(o.trd);
  if (cmd === 'route') {
    if (!o['state-dir'] || !o.trd) throw new Error('route needs --state-dir and --trd');
    const rows = discovered
      .readAll(o['state-dir'], { open: true })
      .filter((r) => r.blocksFeature === true)
      .map((r) => ({ ts: r.ts, summary: r.summary, ...routeRow(r, { trdRel }) }));
    return { ok: true, rows };
  }
  if (cmd === 'check-diff') {
    const base = o.base || 'HEAD';
    let diffText = git(['diff', '--no-renames', base]);
    const tracked = git(['diff', '--no-renames', '--name-only', '-z', base]).split('\0').filter(Boolean);
    const untracked = git(['status', '--porcelain', '--untracked-files=all', '-z'])
      .split('\0')
      .filter((e) => e.startsWith('?? '))
      .map((e) => e.slice(3));
    const paths = [...new Set([...tracked, ...untracked])].filter((p) => !p.startsWith('.trd-state/'));
    // Untracked files are absent from `git diff`; a created CI config must still be scanned.
    for (const p of untracked) {
      if (unsafe(p) || classifyFile(p, trdRel) !== 'ci-config') continue;
      let content = '';
      try {
        content = fs.readFileSync(p, 'utf8');
      } catch {
        content = 'permissions: unreadable';
      }
      diffText += addedFileDiff(p, content);
    }
    return checkDiff({ paths, diffText, trdRel });
  }
  throw new Error('usage: ci-fix-route.js route|check-diff ...');
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2))));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
  }
}

module.exports = { classifyFile, routeRow, checkDiff, main };
