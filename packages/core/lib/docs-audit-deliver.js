'use strict';

/**
 * docs-audit-deliver.js — the branch lifecycle of `/audit-docs` (TRD docs-as-built §3.5, D4,
 * D14, D15, D17).
 *
 * Three CLI subcommands, each a thin wrapper over an exported function:
 *
 *   prepare      --repo <dir> --run-id <id> --work <work>
 *   commit-batch --repo <dir> --applied <file> --batch <key>
 *   finalize     --repo <dir> --work <work>
 *
 * The run writes in place on a new local branch `docs-audit/<run-id>` cut from HEAD. This module
 * never pushes, never opens a PR and never merges: `finalize` only PRINTS the hand-off command.
 *
 * Any git failure throws a `DeliverError`; the CLI turns it into exit 2 with the failing
 * command on stderr (the `/audit-docs` command reports COMMAND STUCK, and `<work>/branch.json`
 * names the branch to switch back to).
 *
 * Example:
 *   node docs-audit-deliver.js prepare --repo . --run-id 2026-10-04-abc1234 --work .trd-state/_docs-audit/work/2026-10-04-abc1234
 *   node docs-audit-deliver.js commit-batch --repo . --applied <work>/applied-prd-0.json --batch prd
 *   node docs-audit-deliver.js finalize --repo . --work <work>
 *   # stdout: {"changeSet":"...","branch":"docs-audit/...","originalBranch":"main","pushCommand":"git push -u origin ..."}
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mapSection, parsePorcelain } = require('./docs-audit-apply');

const AUDIT_DIR = '.trd-state/_docs-audit';
const MARKER_PATH = `${AUDIT_DIR}/last-run.json`;
const RUNS_DIR = `${AUDIT_DIR}/runs`;
const INDEX_PATHS = { prd: 'docs/PRD/INDEX.md', trd: 'docs/TRD/INDEX.md' };
const MAP_HEADING = 'Where this lives in the code';

class DeliverError extends Error {}

// ---------------------------------------------------------------------------
// git plumbing — spawnSync with array args only (SEC-1)
// ---------------------------------------------------------------------------

/** Runs git in `repo`; returns stdout; throws DeliverError naming the command on failure. */
function git(repo, args) {
  const r = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.error || r.status !== 0) {
    const why = r.error ? r.error.message : (r.stderr || r.stdout || '').trim();
    throw new DeliverError(`git ${args.join(' ')} failed: ${why}`);
  }
  return r.stdout;
}

/**
 * True for a path this framework's own hooks write (D15): anything under `.trd-state/` except
 * `_docs-audit/`, which belongs to this run. Such state never blocks, is never reverted and is
 * never committed.
 */
function isHookState(p) {
  return p.startsWith('.trd-state/') && !p.startsWith(`${AUDIT_DIR}/`);
}

function trackedChanges(repo) {
  return parsePorcelain(git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=no']));
}

function currentBranch(repo) {
  const b = git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
  return b;
}

function relToRepo(repo, p) {
  const abs = path.resolve(repo, p);
  const rel = path.relative(path.resolve(repo), abs);
  return rel.split(path.sep).join('/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/** Untracked files in the tree, minus the run's own working directory. */
function untrackedFiles(repo, work) {
  const workRel = work ? relToRepo(repo, work) : null;
  return parsePorcelain(git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']))
    .filter((e) => e.x === '?' && e.y === '?')
    .map((e) => e.path)
    .filter((p) => !(workRel && !workRel.startsWith('..') && (p === workRel || p.startsWith(`${workRel}/`))))
    .sort();
}

// ---------------------------------------------------------------------------
// prepare
// ---------------------------------------------------------------------------

/**
 * Checks the tracked tree is clean (ignoring hook-written `.trd-state/` state, D15), records the
 * original branch in `<work>/branch.json`, and creates `docs-audit/<runId>` from HEAD.
 * Changes nothing when the tree is dirty.
 *
 * @returns {{ branch: string, originalBranch: string }}
 */
function prepare({ repo, runId, work }) {
  if (!runId || !/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new DeliverError(`invalid run id: ${JSON.stringify(runId)}`);
  }
  const dirty = trackedChanges(repo).filter((e) => !isHookState(e.path));
  if (dirty.length > 0) {
    throw new DeliverError(
      'tracked tree is not clean; commit or stash these first: ' + dirty.map((e) => e.path).join(', ')
    );
  }
  let originalBranch;
  try {
    originalBranch = currentBranch(repo);
  } catch (e) {
    throw new DeliverError('HEAD is detached; check out a branch first');
  }
  const branch = `docs-audit/${runId}`;
  const untrackedAtStart = untrackedFiles(repo, work);
  writeJson(path.join(work, 'branch.json'), { runId, branch, originalBranch, untrackedAtStart });
  git(repo, ['switch', '-c', branch]);
  return { branch, originalBranch };
}

// ---------------------------------------------------------------------------
// commit-batch
// ---------------------------------------------------------------------------

/**
 * Commits one batch. Stages only `applied.edited`: `docs-audit-apply.js` already ran `git rm` on
 * every `removed` path, and `git add` on a path that no longer exists fails (exit 128).
 * Makes no commit when nothing is staged.
 *
 * @returns {{ committed: boolean, message?: string }}
 */
function commitBatch({ repo, applied, batch }) {
  const result = readJson(applied);
  const edited = result.edited || [];
  const removed = result.removed || [];
  if (edited.length > 0) git(repo, ['add', '--', ...edited]);
  const staged = git(repo, ['diff', '--cached', '--name-only']).trim();
  if (!staged) return { committed: false };

  // Corrections and cuts come from the batch result that sits beside the applied file
  // (`applied-<key>.json` ↔ `batch-<key>.json`); without it, each edited doc counts as one.
  let corrected = edited.length;
  let cut = 0;
  const sibling = path.join(path.dirname(applied), path.basename(applied).replace(/^applied-/, 'batch-'));
  if (sibling !== applied && fs.existsSync(sibling)) {
    const editedSet = new Set(edited);
    const records = (readJson(sibling).records || []).filter((r) => editedSet.has(r.path));
    // A behaviour change is a correction too; it is listed apart (FIX-004) but must still be counted.
    corrected = records.reduce((n, r) => n + (r.corrections || []).length + (r.behaviourChanges || []).length, 0);
    cut = records.reduce((n, r) => n + (r.cuts || []).length, 0);
  }
  const message = `docs-audit(${batch}): ${corrected} corrected, ${cut} cut, ${removed.length} removed`;
  git(repo, ['commit', '-m', message]);
  return { committed: true, message };
}

// ---------------------------------------------------------------------------
// indexes (D14)
// ---------------------------------------------------------------------------

/**
 * Directories a doc's code map lists, each reduced to at most two leading path segments and
 * de-duplicated in order of appearance. `null` when the doc has no map or its map has no entries.
 * Read from the doc's text as it stands now (after the model's edits), never from the assembly.
 */
function readMapDirs(text) {
  const section = mapSection(text);
  if (section === null) return null;
  const dirs = [];
  for (const l of section.split('\n')) {
    const m = /^\s*[-*]\s+`([^`]+)`/.exec(l);
    if (!m) continue;
    const reduced = m[1]
      .replace(/^\.\//, '')
      .replace(/\/+$/, '')
      .split('/')
      .filter(Boolean)
      .slice(0, 2)
      .join('/');
    if (reduced && !dirs.includes(reduced)) dirs.push(reduced);
  }
  return dirs.length > 0 ? dirs : null;
}

function renderIndex(kind, docPaths, repo) {
  const title = kind === 'prd' ? 'PRD' : 'TRD';
  const lines = [
    `# ${title} index`,
    '',
    '<!-- Generated by /audit-docs on every run. Do not edit by hand. -->',
    '',
    `Each entry names a ${title} and the directories its "${MAP_HEADING}" section lists.`,
    '',
  ];
  if (docPaths.length === 0) lines.push('(none)');
  for (const p of docPaths) {
    const dirs = readMapDirs(fs.readFileSync(path.join(repo, p), 'utf8'));
    lines.push(`- \`${p}\` — ${dirs ? dirs.map((d) => `\`${d}\``).join(', ') : 'no map yet'}`);
  }
  return lines.join('\n') + '\n';
}

/** Writes both indexes; returns the repo-relative paths written. */
function writeIndexes(repo, files) {
  const written = [];
  for (const kind of ['prd', 'trd']) {
    const docs = files
      // Untracked and ignored docs are not part of the commit, so a committed index must not name them.
      .filter((f) => f.class === kind && !f.generated && f.git === 'tracked' && f.path !== INDEX_PATHS[kind])
      .map((f) => f.path)
      .filter((p) => fs.existsSync(path.join(repo, p)))
      .sort();
    const target = path.join(repo, INDEX_PATHS[kind]);
    // Don't create docs/PRD or docs/TRD in a repo that has neither docs nor an index.
    if (docs.length === 0 && !fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, renderIndex(kind, docs, repo));
    written.push(INDEX_PATHS[kind]);
  }
  return written;
}

// ---------------------------------------------------------------------------
// change set (D17)
// ---------------------------------------------------------------------------

const cell = (s) => String(s == null ? '—' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function listWork(work, prefix) {
  if (!fs.existsSync(work)) return [];
  return fs
    .readdirSync(work)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .map((f) => readJson(path.join(work, f)));
}

/**
 * Renders the change set from the assembly, every batch result and every apply result, plus the
 * tree state `finalize` found. Pure: returns markdown.
 */
function renderChangeSet({ assembly, batches, applieds, tree, originalBranch = null }) {
  const files = assembly.files || [];
  const records = batches.flatMap((b) => b.records || []);
  const recordByPath = new Map(records.map((r) => [r.path, r]));
  const out = [];
  out.push(`# Docs audit change set — ${assembly.runId}`, '');
  out.push(`- Mode: ${assembly.mode}${assembly.modeReason ? ` (${assembly.modeReason})` : ''}`);
  out.push(`- Reviewed HEAD: ${assembly.head}`);
  // assemble runs after `prepare` has switched to the review branch, so assembly.branch names
  // the review branch itself; the branch it was cut from is the one branch.json recorded.
  out.push(`- Branch: docs-audit/${assembly.runId} (from ${originalBranch || assembly.branch})`, '');

  // Per doc: every record, and every PRD/TRD the batches did not carry (skipped TRDs).
  out.push('## Documents', '', '| Doc | Class | Score | Depth | Outcome |', '|---|---|---|---|---|');
  const rows = [];
  for (const r of records) {
    rows.push({ path: r.path, cls: r.class, score: r.score, depth: r.depth, outcome: r.outcome });
  }
  for (const f of files) {
    if (recordByPath.has(f.path) || f.generated) continue;
    if (f.class !== 'prd' && f.class !== 'trd') continue;
    const skip = f.skip || (f.trd && f.trd.skip) || null;
    if (!skip) continue;
    rows.push({ path: f.path, cls: f.class, score: null, depth: 'none', outcome: `skipped (${skip})` });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const r of rows) {
    out.push(`| \`${cell(r.path)}\` | ${cell(r.cls)} | ${cell(r.score)} | ${cell(r.depth)} | ${cell(r.outcome)} |`);
  }
  if (rows.length === 0) out.push('| (none) | | | | |');
  out.push('');

  const detail = [...records].sort((a, b) => (a.path < b.path ? -1 : 1));
  for (const r of detail) {
    const lines = [];
    if (r.scoreReason) lines.push(`- Score reason: ${r.scoreReason}`);
    for (const c of r.corrections || []) lines.push(`- Corrected — ${c.section}: ${c.what}`);
    for (const c of r.cuts || []) lines.push(`- Cut — ${c.section}: ${c.why}`);
    if (r.statusCorrection) lines.push(`- Status: ${r.statusCorrection.from} → ${r.statusCorrection.to}`);
    if (lines.length === 0) continue;
    out.push(`### \`${r.path}\``, '', ...lines, '');
  }

  const removed = applieds.flatMap((a) => a.removed || []);
  out.push('## Removals', '');
  if (removed.length === 0) out.push('None.');
  for (const x of removed) {
    out.push(`- \`${x.path}\` — ${x.reason} (recover from \`${x.lastCommit}\`: \`git show ${x.lastCommit}:${x.path}\`)`);
  }
  out.push('');

  const blocked = applieds.flatMap((a) => a.blocked || []);
  out.push('## Removals blocked', '');
  if (blocked.length === 0) out.push('None.');
  for (const x of blocked) {
    out.push(`- \`${x.path}\` — ${x.reason}`);
    for (const h of x.hits || []) out.push(`  - ${h}`);
  }
  out.push('');

  // Only edits that landed: a doc reverted for a banner or stray edit changed nothing to confirm.
  const landed = new Set(applieds.flatMap((a) => a.edited || []));
  const confirmLines = [];
  for (const r of records) {
    if (!landed.has(r.path)) continue;
    for (const b of r.behaviourChanges || []) confirmLines.push(`${r.path}: ${b.id} — was: ${b.was}; now: ${b.now}`);
  }
  out.push('## Requirements changed to match the code — confirm', '');
  if (confirmLines.length === 0) out.push('None.');
  for (const l of confirmLines) out.push(`- ${l}`);
  out.push('');

  out.push('## Surfaced for the owner', '');
  const surfaced = [];
  for (const f of files) {
    if (f.disagreement && !f.generated) {
      surfaced.push(`Class disagreement: \`${f.path}\` — folder says ${f.folderClass}, structure says ${f.structureClass}; treated as ${f.class}`);
    }
    if (f.git && f.git !== 'tracked') surfaced.push(`Not reviewed (${f.git}): \`${f.path}\``);
  }
  for (const r of records) {
    for (const u of r.unbuilt || []) surfaced.push(`Unbuilt requirement in \`${r.path}\`: ${u.id} — ${u.statement}`);
    for (const c of r.crossRepo || []) surfaced.push(`Cross-repo claim in \`${r.path}\`: ${c.claim} (${c.path})`);
    for (const g of r.brokenNonGoals || []) surfaced.push(`Broken non-goal in \`${r.path}\`: ${g.id} — ${g.statement} (${g.evidence})`);
    if (r.outcome === 'failed') surfaced.push(`Review failed: \`${r.path}\``);
  }
  for (const b of batches) for (const d of b.dead || []) surfaced.push(`Agent returned nothing: \`${d}\``);
  for (const a of applieds) {
    for (const x of a.reverted || []) surfaced.push(`Reverted (${x.why}): \`${x.path}\``);
    for (const x of a.changelogDefects || []) surfaced.push(`Changelog line missing in \`${x.path}\` for ${x.id}`);
    for (const x of a.mapDefects || []) surfaced.push(`Code map defect (${x.why}): \`${x.path}\``);
    for (const p of a.notTracked || []) surfaced.push(`Removal dropped, not tracked by git: \`${p}\``);
  }
  for (const p of tree.strays) surfaced.push(`Stray tracked edit reverted: \`${p}\``);
  for (const p of tree.untracked) surfaced.push(`Untracked file appeared during the run (left in place): \`${p}\``);
  if (surfaced.length === 0) out.push('None.');
  for (const s of [...new Set(surfaced)]) out.push(`- ${s}`);
  out.push('');

  out.push('## Framework state carried back', '');
  if (tree.hookState.length === 0) out.push('None.');
  for (const p of tree.hookState) {
    out.push(`- \`${p}\` — hook-written, left uncommitted on the original branch`);
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// finalize
// ---------------------------------------------------------------------------

/**
 * Writes indexes, marker and change set; commits those three; reverts stray tracked edits
 * (hook-written `.trd-state/` state excepted); switches back to the original branch.
 * Prints nothing itself and never pushes: it returns the hand-off command.
 */
function finalize({ repo, work }) {
  const meta = readJson(path.join(work, 'branch.json'));
  const assembly = readJson(path.join(work, 'assembly.json'));
  const batches = listWork(work, 'batch-');
  const applieds = listWork(work, 'applied-');

  // Tree state as the batches left it, before this step writes anything.
  const dirty = trackedChanges(repo).filter((e) => !e.path.startsWith(`${AUDIT_DIR}/`));
  const strays = dirty.filter((e) => !isHookState(e.path)).map((e) => e.path).sort();
  const hookState = dirty.filter((e) => isHookState(e.path)).map((e) => e.path).sort();
  const started = new Set(meta.untrackedAtStart || []);
  const untracked = untrackedFiles(repo, work).filter((p) => !started.has(p));

  const indexes = writeIndexes(repo, assembly.files || []);
  const changeSetRel = `${RUNS_DIR}/${assembly.runId}.md`;
  fs.mkdirSync(path.join(repo, RUNS_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(repo, changeSetRel),
    renderChangeSet({ assembly, batches, applieds, tree: { strays, hookState, untracked }, originalBranch: meta.originalBranch })
  );
  writeJson(path.join(repo, MARKER_PATH), {
    sha: assembly.head,
    runId: assembly.runId,
    mode: assembly.mode,
  });

  git(repo, ['add', '--', ...indexes, MARKER_PATH, changeSetRel]);
  git(repo, ['commit', '-m', `docs-audit: indexes, marker and change set for ${assembly.runId}`]);

  // The tree was clean at start apart from hook state, so any other tracked edit is the run's.
  if (strays.length > 0) git(repo, ['checkout', 'HEAD', '--', ...strays]);

  git(repo, ['switch', meta.originalBranch]);
  return {
    changeSet: changeSetRel,
    branch: meta.branch,
    originalBranch: meta.originalBranch,
    pushCommand: `git push -u origin ${meta.branch} && gh pr create --head ${meta.branch} --fill`,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
  }
  return opts;
}

function main(argv) {
  const [sub, ...rest] = argv;
  const o = parseArgs(rest);
  const need = (...names) => {
    for (const n of names) {
      if (!o[n]) throw new DeliverError(`missing --${n}`);
    }
  };
  try {
    if (sub === 'prepare') {
      need('repo', 'run-id', 'work');
      const r = prepare({ repo: path.resolve(o.repo), runId: o['run-id'], work: path.resolve(o.work) });
      console.log(JSON.stringify(r));
    } else if (sub === 'commit-batch') {
      need('repo', 'applied', 'batch');
      console.log(JSON.stringify(commitBatch({ repo: path.resolve(o.repo), applied: path.resolve(o.applied), batch: o.batch })));
    } else if (sub === 'finalize') {
      need('repo', 'work');
      console.log(JSON.stringify(finalize({ repo: path.resolve(o.repo), work: path.resolve(o.work) })));
    } else {
      console.error('Usage: docs-audit-deliver.js prepare|commit-batch|finalize --repo <dir> ...');
      return 1;
    }
    return 0;
  } catch (e) {
    console.error(e instanceof DeliverError ? e.message : `unexpected error: ${e.message}`);
    return 2;
  }
}

module.exports = {
  DeliverError,
  parsePorcelain,
  isHookState,
  readMapDirs,
  renderIndex,
  renderChangeSet,
  prepare,
  commitBatch,
  finalize,
  main,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
