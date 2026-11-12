'use strict';

/**
 * records-cutover.js -- seeds the records ref of every feature that is in flight in an existing project.
 *
 * WHY: run records now live on `refs/ensemble/records/<slug>`, written by the next
 * `record-ref.js write`. A project that already has features mid-build holds their records only
 * in worktree folders; until a feature's next write its ref does not exist, so Forge's reader
 * sees nothing. This seeds each such ref once, at `/rebase-project` time, through
 * `record-ref.js write` run IN THE FEATURE'S OWN WORKTREE with `fallback: false` (so the ref's
 * identity is the feature's own branch, and nothing is committed or folded). It never touches
 * HEAD, the index or any branch. Full design: `docs/TRD/cutover-for-existing-projects.md`.
 *
 * IN FLIGHT: the folder's recorded branch (`implement.json` `branch`, else `shipped.json`
 * `work.branch`) is the branch checked out in the worktree holding the folder, AND the feature is
 * unfinished: `implement.json` with no `closed.json`, or a folder whose current ship run (read through
 * `ship-record-dir.js resolveRun`, so a post-merge copy on the ref beats the tracked one) is not
 * `done`. A feature whose branch has no worktree is not seeded; it crosses over on its own next write.
 *
 * Skip reasons: `finished`, `no-branch`, `branch-mismatch`, `ref-exists` (local or on origin; its
 * tip is never touched), `remote-unknown` (origin exists but cannot be listed, so a stale copy might
 * be reconciled over newer records), or the write's own refusal/failure text.
 *
 * CLI (project root; prints ONE JSON line, exit 0 always, even on refusal):
 *   node records-cutover.js seed [--no-push]
 * => { ok, seeded: [{slug, worktree, branch, ref, commit, push}], skipped: [{slug, worktree, reason}], remoteError? }
 *
 * Every git call is `spawnSync` with an argument array. Nothing here throws to a caller.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const recordRef = require('./record-ref');
const shipRecordDir = require('./ship-record-dir');

const STATE_ROOT = '.trd-state';
const COMMAND = '/rebase-project';
const STEP = 'cutover seed';

function git(args, cwd) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, out: (r.stdout || '').trim() };
}

const realOr = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

function readJson(p) {
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const str = (v) => (typeof v === 'string' && v ? v : null);

/** Worktrees with a branch checked out (bare, prunable and detached ones are left out). */
function worktrees(cwd) {
  const r = git(['worktree', 'list', '--porcelain'], cwd);
  if (!r.ok) return [];
  const out = [];
  for (const block of r.out.split(/\n\s*\n/)) {
    const w = {};
    for (const line of block.split('\n')) {
      const i = line.indexOf(' ');
      const k = i < 0 ? line : line.slice(0, i);
      w[k] = i < 0 ? true : line.slice(i + 1);
    }
    if (!w.worktree || w.bare || w.prunable || w.detached || typeof w.branch !== 'string') continue;
    if (!w.branch.startsWith('refs/heads/')) continue;
    const dir = realOr(w.worktree);
    if (!fs.existsSync(dir)) continue;
    out.push({ dir, branch: w.branch.slice('refs/heads/'.length) });
  }
  return out;
}

/**
 * True when the folder's feature is unfinished: it has `implement.json` and no `closed.json`, or its
 * current ship run is not `done`. A folder with no `implement.json` (a sweep's `ship-<id>` folder)
 * never has a `closed.json`, so its ship run alone decides.
 */
function isUnfinished(folder, implement, shipped) {
  if (implement && !fs.existsSync(path.join(folder, 'closed.json'))) return true;
  const run = shipRecordDir.resolveRun(folder, shipped, { local: true });
  return Boolean(run && run.state && run.state.status !== 'done');
}

/**
 * Seeds the ref of each in-flight feature that has none.
 * @param {{cwd?: string, push?: boolean}} [opts] `push: false` keeps every seeded ref local.
 * @returns {{ok: boolean, seeded: object[], skipped: object[], remoteError?: string, reason?: string}}
 * @example seed({cwd: '/repo'}) // => { ok: true, seeded: [{slug: 'f', branch: 'feature/f', push: 'pushed', ...}], skipped: [...] }
 */
function seed(opts = {}) {
  try {
    return seedInner(opts);
  } catch (e) {
    return { ok: false, seeded: [], skipped: [], reason: `unexpected error: ${e && e.message}` };
  }
}

function seedInner(opts) {
  const cwd = opts.cwd || process.cwd();
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  if (!top.ok || !top.out) return { ok: false, seeded: [], skipped: [], reason: 'not a git work tree' };
  const root = realOr(top.out);

  const hasOrigin = git(['remote', 'get-url', 'origin'], root).ok;
  const listed = recordRef.list({ remote: hasOrigin, cwd: root });
  if (!listed.ok) return { ok: false, seeded: [], skipped: [], reason: listed.reason || 'could not list record refs' };
  const taken = new Set();
  for (const r of listed.refs) taken.add(r.slug);
  const remoteError = hasOrigin ? listed.remoteError : undefined;

  const seeded = [];
  const skipped = [];
  for (const wt of worktrees(root)) {
    const stateRoot = path.join(wt.dir, STATE_ROOT);
    let names = [];
    try {
      names = fs.readdirSync(stateRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch {
      continue;
    }
    for (const slug of names) {
      if (slug.startsWith('_') || !recordRef.isSafeSlug(slug)) continue;
      const folder = path.join(stateRoot, slug);
      const implement = readJson(path.join(folder, 'implement.json'));
      const shipped = readJson(path.join(folder, 'shipped.json'));
      if (!implement && !shipped) continue; // no records of a run: nothing to seed
      const skip = (reason) => skipped.push({ slug, worktree: wt.dir, reason });

      const recorded = str(implement && implement.branch) || str(shipped && shipped.work && shipped.work.branch);
      // The cheap string check first: every worktree carries the base branch's legacy folders, and
      // `isUnfinished` spawns git (resolveRun) for each closed one.
      if (recorded && recorded !== wt.branch) {
        skip('branch-mismatch');
        continue;
      }
      if (!isUnfinished(folder, implement, shipped)) {
        skip('finished');
        continue;
      }
      if (!recorded) {
        skip('no-branch');
        continue;
      }
      if (taken.has(slug)) {
        skip('ref-exists');
        continue;
      }
      if (remoteError) {
        skip('remote-unknown');
        continue;
      }
      const w = recordRef.write({
        stateDir: folder,
        command: COMMAND,
        step: STEP,
        push: opts.push !== false,
        fallback: false,
        // The folder's own feature id, never the env's: a rebase run inside one Forge session
        // must not stamp its feature id onto other features' refs.
        forgeFeatureId: str(shipped && shipped.work && shipped.work.forge_feature_id),
        cwd: wt.dir,
      });
      if (w.ok && w.outcome === 'ref') {
        taken.add(slug);
        seeded.push({ slug, worktree: wt.dir, branch: wt.branch, ref: recordRef.REF_PREFIX + slug, commit: w.commit, push: w.push });
      } else {
        const why = w.reason || w.refError || w.outcome || 'write failed';
        skip(w.detail ? `${why}: ${w.detail}` : why);
      }
    }
  }
  return { ok: true, seeded, skipped, ...(remoteError ? { remoteError } : {}) };
}

function main(argv) {
  const result = argv[0] === 'seed' ? seed({ push: !argv.includes('--no-push') }) : { ok: false, seeded: [], skipped: [], reason: 'usage: records-cutover.js seed [--no-push]' };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = 0;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { seed };
