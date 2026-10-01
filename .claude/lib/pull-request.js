'use strict';

/**
 * pull-request.js — opens (or finds) the pull request for the feature branch a command just
 * finished, so the owner is handed a PR to review instead of a `gh pr create` line to type.
 *
 * WHY A SCRIPT: the git and `gh` work is deterministic and has sharp edges (default branch,
 * closed PRs, detached HEAD). Prose in a command would be re-derived, differently, each run.
 *
 * CONTRACT
 *   - Setting: `ensemble.openPullRequest` in ./.claude/settings.json. `auto` opens the PR;
 *     anything else, or a missing file, is `never`.
 *   - A failure never blocks the calling command: `ensure` always exits 0 and prints ONE JSON
 *     line {action: 'opened'|'updated'|'skipped'|'failed', url, reason}. Nothing is retried.
 *   - Only OPEN PRs are reused; a closed one for the same branch is ignored and a new PR opened.
 *   - The default branch is asked of GitHub (then origin/HEAD). Unknown means skip — never
 *     assume `main`, or a PR could be opened against the wrong base.
 *   - This lib never merges. Merging stays the owner's.
 *
 * CLI
 *   node pull-request.js mode                              -> one JSON line: "auto"|"never"
 *   node pull-request.js ensure --title <t> --body-file <f> -> one JSON line
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

/** @returns {'auto'|'never'} */
function readMode(settingsPath) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return s && s.ensemble && s.ensemble.openPullRequest === 'auto' ? 'auto' : 'never';
  } catch {
    return 'never';
  }
}

/**
 * Pure decision. Returns {action, reason}; action is 'skipped', 'opened' or 'updated'
 * ('opened' means "go and create one"; `ensure` turns a later error into 'failed').
 */
function decide({ mode, branch, defaultBranch, ghAvailable, openPrUrl }) {
  if (mode !== 'auto') return { action: 'skipped', reason: 'openPullRequest is never' };
  if (!branch || branch === 'HEAD') return { action: 'skipped', reason: 'detached HEAD' };
  if (!ghAvailable) return { action: 'skipped', reason: 'gh missing or not authenticated' };
  if (!defaultBranch) return { action: 'skipped', reason: 'default branch unknown' };
  if (branch === defaultBranch) return { action: 'skipped', reason: 'on the default branch' };
  if (openPrUrl) return { action: 'updated', reason: 'open pull request exists' };
  return { action: 'opened', reason: 'no open pull request' };
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: !r.error && r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || (r.error && r.error.message) || '').trim() };
}

/**
 * The line of git/gh stderr that names the error. The literal first line is often noise:
 * a rejected push starts with "To <remote>", and gh prefixes "Warning: N uncommitted changes".
 */
function firstLine(s) {
  const lines = String(s || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const noise = /^(To |hint:|Warning:)/;
  return lines.find((l) => !noise.test(l)) || lines[0] || 'unknown error';
}

function findDefaultBranch() {
  const gh = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']);
  if (gh.ok && gh.out) return gh.out;
  const g = run('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (g.ok && g.out) return g.out.replace(/^refs\/remotes\/origin\//, '');
  return '';
}

function ensure({ title, bodyFile, settingsPath = './.claude/settings.json' }) {
  const mode = readMode(settingsPath);
  const skip = (reason) => ({ action: 'skipped', url: null, reason });
  const b = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = b.ok ? b.out : '';
  // Settle every skip that needs no network first, so `never` makes no gh call at all, and
  // check auth before asking GitHub anything, so a missing gh is reported as that.
  if (mode !== 'auto') return skip(decide({ mode }).reason);
  if (!branch || branch === 'HEAD') return skip(decide({ mode, branch }).reason);
  const ghAvailable = run('gh', ['auth', 'status']).ok;
  const defaultBranch = ghAvailable ? findDefaultBranch() : '';
  const base = { mode, branch, defaultBranch, ghAvailable };
  const pre = decide({ ...base, openPrUrl: null });
  if (pre.action === 'skipped') return skip(pre.reason);

  const push = run('git', ['push', '-u', 'origin', branch]);
  if (!push.ok) return { action: 'failed', url: null, reason: firstLine(push.err) };

  const list = run('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url // empty']);
  // A failed lookup is not "no open PR": creating blind could duplicate one or mislead.
  if (!list.ok) return { action: 'failed', url: null, reason: firstLine(list.err || list.out) };
  const openPrUrl = list.out.split('\n')[0];
  const d = decide({ ...base, openPrUrl });
  if (d.action === 'updated') return { action: 'updated', url: openPrUrl, reason: d.reason };

  const create = run('gh', ['pr', 'create', '--base', defaultBranch, '--head', branch, '--title', title, '--body-file', bodyFile]);
  if (!create.ok) return { action: 'failed', url: null, reason: firstLine(create.err || create.out) };
  const url = create.out.split('\n').filter(Boolean).pop() || null;
  return { action: 'opened', url, reason: d.reason };
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv) {
  const [cmd] = argv;
  if (cmd === 'mode') {
    // JSON, like `ensure`: every subcommand prints one line a caller can JSON.parse.
    process.stdout.write(JSON.stringify(readMode('./.claude/settings.json')) + '\n');
    return 0;
  }
  if (cmd === 'ensure') {
    const title = argValue(argv, '--title');
    const bodyFile = argValue(argv, '--body-file');
    const result = title && bodyFile
      ? ensure({ title, bodyFile })
      : { action: 'failed', url: null, reason: 'usage: ensure --title <t> --body-file <f>' };
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  }
  process.stderr.write('usage: pull-request.js mode | ensure --title <t> --body-file <f>\n');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { readMode, decide, ensure };
