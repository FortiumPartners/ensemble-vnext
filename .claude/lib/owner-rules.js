'use strict';

/**
 * owner-rules.js — tells a reader which copy of an owner-governed rule file to read: the
 * feature branch's, or the base branch's.
 *
 * WHY A SCRIPT: a feature branch is cut at one moment and the owner keeps running
 * `/verification-setup` (and edits constitution.md, ship.md ...) on the base branch afterwards.
 * A verifier reading the branch copy measures yesterday's rules (a stale Storybook port, an old
 * coverage floor). But a plain "always read the base" would discard an answer the owner gave on
 * the branch itself. A three-way comparison against the merge-base tells the two apart.
 * The git work has sharp edges, so it is code, not prose each command re-derives.
 *
 * CONTRACT
 *   - Owner-governed files: the six `scaffold-project.sh` refuses to overwrite (OWNER_GOVERNED).
 *   - Per file, comparing the working-tree copy (uncommitted edits count) with origin/<base>
 *     and with their merge-base:
 *       neither changed       -> branch path ".claude/rules/<file>", no notice
 *       base changed only     -> the base copy (a file written under the git dir), no notice
 *       branch changed only   -> branch copy, a notice (the owner edited it here)
 *       both changed, differ  -> base copy, a loud notice
 *     Copies with identical bytes never produce a notice.
 *   - Base lookup order: --base; `gh pr view` base; `gh repo view` default branch; origin/HEAD.
 *     Never assumes `main`. --no-gh skips both gh steps.
 *   - Fallback to the branch copy with ONE notice: no base, no origin/<base>, no merge-base, or
 *     root is not the top level of its git repo (a fixture slot nested inside another repo).
 *   - Nothing tracked is ever written. Base copies go under `git rev-parse --git-path
 *     ensemble/owner-rules`, else a per-repo dir in the OS temp dir, else the branch copy.
 *   - `path` never fetches; `resolve` fetches `origin <base>` (GIT_TERMINAL_PROMPT=0), and a
 *     failed fetch is not an error: it reports fetched:false and works from what is local.
 *   - Every comparison outcome exits 0; 2 is a usage error.
 *
 * CLI
 *   node owner-rules.js resolve [--base <b>] [--root <dir>] [--no-fetch] [--no-gh]
 *       -> one JSON line {base, ref, mergeBase, fetched, files:{<name>:{use, source, differs,
 *          branchChanged, baseChanged}}, notices:[...]}
 *   node owner-rules.js path <file> [--base <b>] [--root <dir>] [--no-gh]
 *       -> the `use` path for <file> (same answer as resolve, without fetching)
 *
 * Example: node .claude/lib/functional-verification.js read-coverage-floor \
 *            "$(node .claude/lib/owner-rules.js path verification.md)"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

/** Must equal AUTHORED_RULES in scaffold-project.sh (a test keeps them equal). */
const OWNER_GOVERNED = ['constitution.md', 'stack.md', 'process.md', 'verification.md', 'design.md', 'ship.md'];

const RULES_DIR = '.claude/rules';

function run(cmd, args, cwd, { binary = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: binary ? 'buffer' : 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = r.stdout == null ? (binary ? Buffer.alloc(0) : '') : r.stdout;
  return { ok: !r.error && r.status === 0, out: binary ? out : out.trim() };
}

const git = (args, cwd, opts) => run('git', args, cwd, opts);

function realpath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/** First base found, in the documented order; '' when none. */
function findBase({ root, base, gh }) {
  if (base) return base;
  if (gh) {
    const pr = run('gh', ['pr', 'view', '--json', 'baseRefName', '--jq', '.baseRefName'], root);
    if (pr.ok && pr.out) return pr.out;
    const repo = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], root);
    if (repo.ok && repo.out) return repo.out;
  }
  const sym = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], root);
  return sym.ok && sym.out ? sym.out.replace(/^refs\/remotes\/origin\//, '') : '';
}

/** A writable directory for base copies, or '' when none can be had. */
function copyDir(root, topLevel) {
  const gp = git(['rev-parse', '--git-path', 'ensemble/owner-rules'], root);
  const candidates = [];
  if (gp.ok && gp.out) candidates.push(path.resolve(root, gp.out));
  const id = crypto.createHash('sha1').update(topLevel).digest('hex').slice(0, 12);
  candidates.push(path.join(os.tmpdir(), `ensemble-owner-rules-${id}`));
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch { /* try the next */ }
  }
  return '';
}

/** How many lines differ between two buffers (lines present in one and not the other). */
function linesDiffer(a, b) {
  const count = new Map();
  for (const l of a.toString('utf8').split('\n')) count.set(l, (count.get(l) || 0) + 1);
  for (const l of b.toString('utf8').split('\n')) count.set(l, (count.get(l) || 0) - 1);
  let n = 0;
  for (const v of count.values()) n += Math.abs(v);
  return n;
}

const same = (a, b) => (a === null || b === null ? a === b : a.equals(b));

function gitShow(rev, file, root) {
  const r = git(['show', `${rev}:${RULES_DIR}/${file}`], root, { binary: true });
  return r.ok ? r.out : null;
}

function fallback(root, base, notice) {
  const files = {};
  for (const f of OWNER_GOVERNED) {
    files[f] = { use: `${RULES_DIR}/${f}`, source: 'branch', differs: null, branchChanged: null, baseChanged: null };
  }
  return { base: base || null, ref: null, mergeBase: null, fetched: false, files, notices: [notice] };
}

/**
 * @param {{root?: string, base?: string, fetch?: boolean, gh?: boolean}} opts
 * @returns the same object the `resolve` CLI prints
 */
function resolve({ root = process.cwd(), base, fetch = true, gh = true } = {}) {
  root = path.resolve(root);
  const top = git(['rev-parse', '--show-toplevel'], root);
  if (!top.ok) return fallback(root, base, 'Not inside a git repository, so the branch copies of the owner-governed rules are used.');
  if (realpath(root) !== realpath(top.out)) {
    return fallback(root, base, `${root} is not the top level of its git repository (${top.out}), so the branch copies of the owner-governed rules are used.`);
  }
  const baseName = findBase({ root, base, gh });
  if (!baseName) return fallback(root, null, 'No base branch could be determined, so the branch copies of the owner-governed rules are used.');

  const ref = `origin/${baseName}`;
  let fetched = false;
  if (fetch) fetched = git(['fetch', '--quiet', 'origin', baseName], root).ok;
  if (!git(['rev-parse', '--verify', '--quiet', `refs/remotes/${ref}`], root).ok) {
    return fallback(root, baseName, `${ref} does not exist here, so the branch copies of the owner-governed rules are used.`);
  }
  const mb = git(['merge-base', 'HEAD', ref], root);
  if (!mb.ok || !mb.out) {
    return fallback(root, baseName, `No merge-base between HEAD and ${ref}, so the branch copies of the owner-governed rules are used.`);
  }

  const notices = [];
  const files = {};
  let dir; // resolved lazily, only when a base copy is needed
  for (const f of OWNER_GOVERNED) {
    const rel = `${RULES_DIR}/${f}`;
    let branchBuf = null;
    try { branchBuf = fs.readFileSync(path.join(root, rel)); } catch { /* absent */ }
    const baseBuf = gitShow(ref, f, root);
    const mbBuf = gitShow(mb.out, f, root);
    const branchChanged = !same(branchBuf, mbBuf);
    const baseChanged = !same(baseBuf, mbBuf);
    const differs = !same(branchBuf, baseBuf);
    let use = rel;
    let source = 'branch';

    if (differs && baseChanged && baseBuf !== null) {
      if (dir === undefined) dir = copyDir(root, top.out);
      const target = dir ? path.join(dir, f) : '';
      let written = false;
      if (target) {
        try { fs.writeFileSync(target, baseBuf); written = true; } catch { /* fall through */ }
      }
      if (written) {
        use = target;
        source = 'base';
      } else {
        notices.push(`${f} differs from ${ref} but no writable place was found for the base copy, so the branch copy is used.`);
      }
    }
    if (differs && source === 'branch' && !(baseChanged && baseBuf !== null)) {
      // Branch-only edit (or base deleted the file): the branch copy stands, but say so.
      const n = branchBuf && baseBuf ? `${linesDiffer(branchBuf, baseBuf)} lines differ` : 'the file exists on one side only';
      notices.push(`${f} was edited on this branch and differs from ${ref} (${n}); the branch copy is used.`);
    } else if (differs && source === 'base') {
      const n = branchBuf ? `${linesDiffer(branchBuf, baseBuf)} lines differ` : 'the branch has no copy';
      notices.push(branchChanged
        ? `${f} changed on both this branch and ${ref} (${n}); the ${ref} copy is used, and the branch edit is NOT read.`
        : `${f} on this branch is behind ${ref} (${n}); the ${ref} copy is used.`);
    }
    files[f] = { use, source, differs, branchChanged, baseChanged };
  }
  return { base: baseName, ref, mergeBase: mb.out, fetched, files, notices };
}

/** The path to read for one owner-governed file. Never fetches. */
function pathFor(file, opts = {}) {
  if (!OWNER_GOVERNED.includes(file)) throw new Error(`not an owner-governed rule file: ${file}`);
  return resolve({ ...opts, fetch: false }).files[file].use;
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE = 'usage: owner-rules.js resolve [--base <b>] [--root <dir>] [--no-fetch] [--no-gh] | path <file> [--base <b>] [--root <dir>] [--no-gh]\n';

function main(argv) {
  const [cmd, second] = argv;
  const opts = { base: argValue(argv, '--base'), root: argValue(argv, '--root') || process.cwd(), gh: !argv.includes('--no-gh') };
  if (cmd === 'resolve') {
    process.stdout.write(JSON.stringify(resolve({ ...opts, fetch: !argv.includes('--no-fetch') })) + '\n');
    return 0;
  }
  if (cmd === 'path' && second && OWNER_GOVERNED.includes(second)) {
    process.stdout.write(pathFor(second, opts) + '\n');
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { OWNER_GOVERNED, resolve, pathFor };
