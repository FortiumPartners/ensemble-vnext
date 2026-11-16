'use strict';

/**
 * rerun-scope.js -- the facts a command reads before it chooses how much to re-run
 * (`.claude/contracts/rerun-scope.md`): the files that changed since an anchor commit, each
 * marked with a class. It DECIDES NOTHING. The model picks none, targeted or full from these
 * facts and the contract; this module only lists them, so the choice rests on a diff and not
 * on memory.
 *
 * CLASSES (a repo-relative, forward-slash path gets exactly one):
 *   record     a file the framework writes itself (`.trd-state/`, the owner-call log, notes)
 *   doc        documentation (`docs/`, README, CHANGELOG and the like)
 *   framework  the vendored framework tree (`.claude/`: rules, rulings, commands, hooks)
 *   test       a test file or fixture
 *   ci         CI configuration
 *   deps       a lockfile
 *   code       anything else (what the checks exercise)
 *
 * `readable: false` means the anchor could not be read as a commit (missing, not an ancestor
 * of the head, or git failed). The contract treats that as `full`, never as `none`.
 *
 * CLI (prints ONE JSON line, exits 0 even when the change cannot be read):
 *   node rerun-scope.js changed --anchor <commit> [--head <ref>] [--trd <path>]
 *
 * Every git call is `spawnSync` with an argument array (no shell).
 */

const { spawnSync } = require('child_process');
const { isRecordFile } = require('./record-files');
const { classifyPath } = require('./custody');

const CLASSES = ['record', 'doc', 'framework', 'test', 'ci', 'deps', 'code'];

/** @returns {'record'|'doc'|'framework'|'test'|'ci'|'deps'|'code'} for one repo-relative path. */
function classify(p, trdRel) {
  if (isRecordFile(p)) return 'record';
  const c = classifyPath(p, trdRel);
  // classifyPath returns 'ignored' only for a record file or the TRD itself; a TRD is a doc.
  if (c === 'ignored') return 'doc';
  if (c === 'docs') return 'doc';
  if (c === 'test-only') return 'test';
  if (c === 'ci-config') return 'ci';
  if (c === 'deps') return 'deps';
  if (p.startsWith('.claude/')) return 'framework';
  return 'code';
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, out: r.stdout || '', err: (r.stderr || (r.error && r.error.message) || '').trim() };
}

/**
 * @param {{anchor: string, head?: string, trd?: string|null, cwd?: string}} args
 * @returns {{readable: boolean, anchor: string, head: string, files: {path: string, class: string}[],
 *   counts: Object<string, number>, reason?: string}}
 */
function changed({ anchor, head = 'HEAD', trd = null, cwd = process.cwd() }) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const fail = (reason) => ({ readable: false, anchor: String(anchor || ''), head, files: [], counts, reason });
  if (!anchor || !/^[0-9a-zA-Z][0-9a-zA-Z._\/-]*$/.test(anchor)) return fail('no anchor given');
  if (!/^[0-9a-zA-Z][0-9a-zA-Z._\/-]*$/.test(head)) return fail('head is not a plain ref');
  const a = git(['rev-parse', '--verify', '--quiet', `${anchor}^{commit}`], cwd);
  if (!a.ok) return fail(`anchor ${anchor} is not a commit here`);
  const h = git(['rev-parse', '--verify', '--quiet', `${head}^{commit}`], cwd);
  if (!h.ok) return fail(`head ${head} is not a commit here`);
  const sha = { anchor: a.out.trim(), head: h.out.trim() };
  // The anchor must be an ancestor of the head, or "changed since" has no meaning.
  if (!git(['merge-base', '--is-ancestor', sha.anchor, sha.head], cwd).ok) {
    return fail(`anchor ${sha.anchor.slice(0, 8)} is not an ancestor of ${head}`);
  }
  const d = git(['diff', '--no-renames', '--name-only', '-z', sha.anchor, sha.head], cwd);
  if (!d.ok) return fail(`git diff failed: ${d.err}`);
  const files = d.out
    .split('\0')
    .filter(Boolean)
    .map((p) => ({ path: p, class: classify(p, trd) }));
  for (const f of files) counts[f.class] += 1;
  return { readable: true, anchor: sha.anchor, head: sha.head, files, counts };
}

const USAGE = 'usage: rerun-scope.js changed --anchor <commit> [--head <ref>] [--trd <path>]';

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv) {
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o) + '\n');
    return 0;
  };
  if (argv[0] !== 'changed' || !flag(argv, '--anchor')) return emit({ ok: false, error: USAGE });
  return emit(changed({ anchor: flag(argv, '--anchor'), head: flag(argv, '--head') || 'HEAD', trd: flag(argv, '--trd') || null }));
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { changed, classify, CLASSES, main };
