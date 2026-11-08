'use strict';

/**
 * custody.js -- chain of custody for /ship-build: proves that the code which was verified is the
 * code that was pushed, merged and deployed (TRD ship-build 3.5, D9-D12).
 *
 * WHY A SCRIPT: "is this the same code" is deterministic, and a prompt would re-derive it
 * differently each run. One anchor commit is held in `<stateDir>/custody.json`; three links
 * (push, merge, deploy) are each compared to it.
 *
 * CODE EQUALITY (D9, D10): `git diff --no-renames --name-only -z <a> <b>`, each path classified
 *   ignored   anything under `.trd-state/`, and the work's TRD
 *   test-only a test file by D10's patterns
 *   shipped   everything else
 * Two commits are equal when no path is `shipped`. `--no-renames` matters: default rename
 * detection reports only a rename's destination, so a shipped file moved under `.trd-state/`
 * would read as an ignored-only change.
 *
 * CONTRACT
 *   - `reconcile` is the only verb that sets or moves the anchor (D12). `check` never writes.
 *   - Every failure returns `ok: false` / `refused` with a reason; nothing auto-fixes and
 *     nothing throws for an expected condition.
 *   - A short commit id resolves only when it is unique; an ambiguous one is `refused`.
 *   - A missing full commit id is fetched once (`git fetch origin <sha>`).
 *   - Every git/gh call is `spawnSync` with an argument array (no shell).
 *
 * CLI (run from the project root; each prints ONE JSON line and exits 0, even on `refused`):
 *   node custody.js reconcile --state-dir D --trd <path|none> [--closed P] [--definition P]
 *                             [--reason format] [--reverified <verification-state.json>]
 *   node custody.js check --state-dir D --link push --branch B --trd <path|none>
 *   node custody.js check --state-dir D --link merge --pr N --target BASE --trd <path|none>
 *   node custody.js check --state-dir D --link deploy --identity-output <text> --trd <path|none>
 *
 * The deploy link compares whole trees: the identity command must report the commit released
 * from this work. A build from a target branch that moved after this work's base carries other
 * commits' files and fails the link (safe: it stops).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { BUILD_TOKEN } = require('./functional-verification');
const liveEvidence = require('./live-evidence');
const implementState = require('./implement-state');

const FULL_SHA = /^[0-9a-f]{40}$/;
const COMMIT_ID = /^[0-9a-f]{4,40}$/i;

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: !r.error && r.status === 0,
    out: (r.stdout || '').trim(),
    raw: r.stdout || '',
    err: (r.stderr || (r.error && r.error.message) || '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Classification (D10)
// ---------------------------------------------------------------------------

const TEST_BASENAME = [
  /\.test\.(js|cjs|mjs|ts|tsx|jsx|sh)$/,
  /\.spec\.(js|ts|tsx|jsx)$/,
  /\.bats$/,
  /^test_.*\.py$/,
  /_test\.py$/,
  /_test\.go$/,
  /Test\.(java|kt)$/,
  /Tests\.cs$/,
  /_spec\.rb$/,
  /_test\.exs$/,
];
const TEST_SEGMENTS = new Set(['__tests__', '__fixtures__', '__mocks__']);

/** @returns {'ignored'|'test-only'|'shipped'} for a repo-relative, forward-slash path. */
function classifyPath(p, trdRel) {
  if (p === '.trd-state' || p.startsWith('.trd-state/')) return 'ignored';
  if (trdRel && p === trdRel) return 'ignored';
  const segments = p.split('/');
  const base = segments[segments.length - 1];
  if (TEST_BASENAME.some((re) => re.test(base))) return 'test-only';
  if (segments.slice(0, -1).some((s) => TEST_SEGMENTS.has(s))) return 'test-only';
  return 'shipped';
}

/** The TRD path as the repo-relative form git reports, or null (sweep work has no TRD). */
function trdRelative(trdPath, cwd) {
  if (!trdPath || trdPath === 'none') return null;
  return path.relative(cwd, path.resolve(cwd, trdPath)).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Commit resolution
// ---------------------------------------------------------------------------

function hasCommit(sha, cwd) {
  return run('git', ['cat-file', '-e', `${sha}^{commit}`], cwd).ok;
}

/**
 * Resolves a full or short commit id to a full sha.
 * @returns {{sha: string}|{error: 'invalid'|'missing'|'ambiguous'}}
 */
function resolveCommit(id, cwd) {
  const want = String(id || '').trim();
  if (!COMMIT_ID.test(want)) return { error: 'invalid' };
  if (FULL_SHA.test(want.toLowerCase())) {
    const sha = want.toLowerCase();
    if (!hasCommit(sha, cwd)) run('git', ['fetch', 'origin', sha], cwd);
    return hasCommit(sha, cwd) ? { sha } : { error: 'missing' };
  }
  // `rev-parse --verify` exits 1 with no output for both ambiguous and missing, so count the
  // candidates ourselves; counting lines is locale-proof where parsing the message is not.
  const countCommits = () =>
    run('git', ['rev-parse', `--disambiguate=${want}`], cwd).out
      .split('\n')
      .filter(Boolean)
      .filter((c) => run('git', ['cat-file', '-t', c], cwd).out === 'commit');
  let found = countCommits();
  if (found.length === 0) {
    run('git', ['fetch', 'origin'], cwd);
    found = countCommits();
  }
  if (found.length > 1) return { error: 'ambiguous' };
  if (found.length === 0) return { error: 'missing' };
  return { sha: found[0] };
}

function headSha(cwd) {
  const r = run('git', ['rev-parse', 'HEAD'], cwd);
  return r.ok ? r.out : null;
}

/**
 * Code equality of two local commits.
 * @returns {{equal: boolean, differing: string[], shipped: string[], error?: string}}
 *   `differing` lists the shipped paths (what an owner needs to see), in git's order.
 */
function compare(a, b, trdRel, cwd) {
  const r = run('git', ['diff', '--no-renames', '--name-only', '-z', a, b], cwd);
  if (!r.ok) return { equal: false, differing: [], error: `git diff failed: ${r.err}` };
  const shipped = r.raw.split('\0').filter(Boolean).filter((p) => classifyPath(p, trdRel) === 'shipped');
  return { equal: shipped.length === 0, differing: shipped };
}

// ---------------------------------------------------------------------------
// custody.json
// ---------------------------------------------------------------------------

function custodyPath(stateDir) {
  return path.join(stateDir, 'custody.json');
}

function readCustody(stateDir) {
  try {
    const c = JSON.parse(fs.readFileSync(custodyPath(stateDir), 'utf8'));
    if (c && c.anchor && typeof c.anchor.commit === 'string') return c;
  } catch {
    /* absent or unreadable: no anchor */
  }
  return null;
}

function writeCustody(stateDir, custody) {
  fs.mkdirSync(stateDir, { recursive: true });
  implementState.save(custodyPath(stateDir), custody);
}

/** The audited commit recorded by /audit-build in closed.json, or null. */
function auditedCommitOf(closedPath) {
  try {
    const c = JSON.parse(fs.readFileSync(closedPath, 'utf8'));
    const id = c && c.audit && c.audit.auditedCommit;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Affected must-pass criteria (3.5)
// ---------------------------------------------------------------------------

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The must-pass ids a change to `shippedPaths` puts in doubt. The set comes from the one reader,
 * `functional-verification.js must-pass-coverage` (an id is must-pass only when the TRD declares
 * it); every uncovered must-pass objective counts too. An id with no covered-file record counts
 * as affected whenever shipped source changed (OQ-2).
 */
function affectedIds({ stateDir, trdPath, definitionPath, shippedPaths, cwd }) {
  const cli = path.join(__dirname, 'functional-verification.js');
  const r = run(process.execPath, [cli, 'must-pass-coverage', '--trd', trdPath, '--definition', definitionPath], cwd);
  if (!r.ok) return { error: `must-pass-coverage failed: ${r.err || r.out}` };
  let cov;
  try {
    cov = JSON.parse(r.out);
  } catch {
    return { error: 'must-pass-coverage gave unparseable output' };
  }
  const ids = [...new Set([...(cov.criteria || []), ...(cov.uncovered || []).map((u) => u.id)])];

  const top = run('git', ['rev-parse', '--show-toplevel'], cwd);
  const root = fs.realpathSync(top.ok ? top.out : cwd);
  // verification-state.json holds the proving artifact per id; the manifest maps artifact -> covers.
  const state = readJson(path.join(stateDir, 'verification-state.json'));
  const artifactById = new Map(((state && state.criteria) || []).map((c) => [c.id, c.artifact]));
  const coversByArtifact = new Map(
    liveEvidence.read(stateDir).map((e) => [realOrResolved(e.artifact, cwd), e.covers])
  );
  const changed = new Set(shippedPaths);
  const affected = ids.filter((id) => {
    const artifact = artifactById.get(id);
    const covers = artifact ? coversByArtifact.get(realOrResolved(artifact, cwd)) : undefined;
    if (!covers) return true;
    // covers[].path is absolute; git's paths are repo-relative -- compare in one form.
    return covers.some((c) => changed.has(path.relative(root, realOrResolved(c.path, cwd)).split(path.sep).join('/')));
  });
  return { ids: affected };
}

function realOrResolved(p, cwd) {
  const abs = path.resolve(cwd, String(p));
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

// ---------------------------------------------------------------------------
// reconcile
// ---------------------------------------------------------------------------

function move(stateDir, custody, to, rule, reverified) {
  const next = {
    ...custody,
    anchor: { ...custody.anchor, commit: to },
    moves: [
      ...(custody.moves || []),
      { from: custody.anchor.commit, to, rule, reverified, at: new Date().toISOString() },
    ],
  };
  writeCustody(stateDir, next);
  return next;
}

/**
 * Sets the anchor once, then moves it to HEAD only when the change since is proven harmless.
 *
 * @param {{stateDir: string, closedPath?: string, trdPath: string|null, definitionPath?: string|null,
 *          reason?: 'format', reverifiedPath?: string, cwd?: string}} args
 * @returns {{action: 'set'|'none'|'moved'|'reverify'|'refused', anchor: string, ids?: string[],
 *            differing?: string[], reason: string}}
 */
function reconcile(args) {
  const { stateDir, trdPath = null, reason, reverifiedPath, cwd = process.cwd() } = args;
  const closedPath = args.closedPath || path.join(stateDir, 'closed.json');
  const head = headSha(cwd);
  if (!head) return { action: 'refused', anchor: '', reason: 'cannot read HEAD' };
  const trdRel = trdRelative(trdPath, cwd);

  let custody = readCustody(stateDir);
  let justSet = false;
  if (!custody) {
    const audited = auditedCommitOf(closedPath);
    let commit = head;
    let source = 'pushed';
    if (audited) {
      const r = resolveCommit(audited, cwd);
      if (r.error) {
        return { action: 'refused', anchor: '', reason: `audited commit ${audited} is ${r.error}` };
      }
      commit = r.sha;
      source = 'audited';
    }
    custody = { version: 1, anchor: { commit, source }, moves: [] };
    writeCustody(stateDir, custody);
    justSet = true;
  }

  const anchor = custody.anchor.commit;
  if (!hasCommit(anchor, cwd)) run('git', ['fetch', 'origin', anchor], cwd);
  if (!hasCommit(anchor, cwd)) {
    return { action: 'refused', anchor, reason: `anchor commit ${anchor} is not available locally` };
  }
  const cmp = compare(anchor, head, trdRel, cwd);
  if (cmp.error) return { action: 'refused', anchor, reason: cmp.error };
  if (cmp.equal) {
    return {
      action: justSet ? 'set' : 'none',
      anchor,
      reason: justSet ? `anchor set (${custody.anchor.source})` : 'no shipped source changed since the anchor',
    };
  }

  const shipped = cmp.differing;
  if (reason === 'format') {
    const next = move(stateDir, custody, head, 'format', []);
    return { action: 'moved', anchor: next.anchor.commit, differing: shipped, reason: 'moved: formatter commit' };
  }

  const definitionPath = args.definitionPath || path.join(stateDir, 'success-definition.md');
  const trdFile = trdRel && path.resolve(cwd, trdPath);
  if (!trdFile || !fs.existsSync(trdFile) || !fs.existsSync(path.resolve(cwd, definitionPath))) {
    const next = move(stateDir, custody, head, 'no-success-definition', []);
    return { action: 'moved', anchor: next.anchor.commit, differing: shipped, reason: 'moved: no success definition to re-verify against' };
  }

  const aff = affectedIds({ stateDir, trdPath: trdFile, definitionPath: path.resolve(cwd, definitionPath), shippedPaths: shipped, cwd });
  if (aff.error) return { action: 'refused', anchor, differing: shipped, reason: aff.error };
  if (aff.ids.length === 0) {
    const next = move(stateDir, custody, head, 'no-affected-criteria', []);
    return { action: 'moved', anchor: next.anchor.commit, differing: shipped, reason: 'moved: no must-pass criterion is affected' };
  }
  if (!reverifiedPath) {
    return { action: 'reverify', anchor, ids: aff.ids, differing: shipped, reason: `${aff.ids.length} must-pass criteria need re-verification` };
  }
  const re = readJson(reverifiedPath);
  if (!re || !Array.isArray(re.criteria)) {
    return { action: 'refused', anchor, ids: aff.ids, differing: shipped, reason: `cannot read re-verification state ${reverifiedPath}` };
  }
  const statusOf = new Map(re.criteria.map((c) => [c.id, c.status]));
  const notMet = aff.ids.filter((id) => statusOf.get(id) !== 'met');
  if (notMet.length > 0) {
    return { action: 'refused', anchor, ids: notMet, differing: shipped, reason: `not met after re-verification: ${notMet.join(', ')}` };
  }
  const next = move(stateDir, custody, head, 'reverified', aff.ids);
  return { action: 'moved', anchor: next.anchor.commit, ids: aff.ids, differing: shipped, reason: 'moved: affected criteria re-verified' };
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

/** Compares `sha` to the anchor and shapes the link result. */
function judgeLink(link, sha, anchor, trdRel, cwd, label) {
  const resolved = resolveCommit(sha, cwd);
  if (resolved.error) {
    return { ok: false, link, observed: sha, differing: [], reason: `${label} commit ${sha} is ${resolved.error}` };
  }
  const cmp = compare(anchor, resolved.sha, trdRel, cwd);
  if (cmp.error) return { ok: false, link, observed: resolved.sha, differing: [], reason: cmp.error };
  if (!cmp.equal) {
    return { ok: false, link, observed: resolved.sha, differing: cmp.differing, reason: `${label} differs from the verified code in: ${cmp.differing.join(', ')}` };
  }
  return { ok: true, link, observed: resolved.sha, differing: [], reason: `${label} matches the verified code` };
}

/**
 * One link's comparison to the anchor. Never writes.
 * @param {{stateDir: string, link: 'push'|'merge'|'deploy', branch?: string, pr?: number,
 *          target?: string, identityOutput?: string, trdPath?: string|null, cwd?: string}} args
 * @returns {{ok: boolean, link: string, observed: string|null, differing: string[], reason: string}}
 */
function check(args) {
  const { stateDir, link, trdPath = null, cwd = process.cwd() } = args;
  const fail = (reason, observed = null, differing = []) => ({ ok: false, link, observed, differing, reason });
  const custody = readCustody(stateDir);
  if (!custody) return fail('no anchor');
  const anchor = custody.anchor.commit;
  if (!hasCommit(anchor, cwd)) run('git', ['fetch', 'origin', anchor], cwd);
  if (!hasCommit(anchor, cwd)) return fail(`anchor commit ${anchor} is not available locally`);
  const trdRel = trdRelative(trdPath, cwd);

  if (link === 'push') {
    if (!args.branch) return fail('push link needs a branch');
    const ls = run('git', ['ls-remote', 'origin', `refs/heads/${args.branch}`], cwd);
    if (!ls.ok) return fail(`git ls-remote failed: ${ls.err}`);
    const sha = ls.out.split(/\s+/)[0];
    if (!sha) return fail(`branch ${args.branch} is not on origin`);
    return judgeLink('push', sha, anchor, trdRel, cwd, `origin/${args.branch}`);
  }

  if (link === 'merge') {
    if (!Number.isInteger(args.pr) || args.pr <= 0) return fail('merge link needs a PR number');
    const v = run('gh', ['pr', 'view', String(args.pr), '--json', 'state,baseRefName,headRefOid'], cwd);
    if (!v.ok) return fail(`gh pr view failed: ${v.err || v.out}`);
    let pr;
    try {
      pr = JSON.parse(v.out);
    } catch {
      return fail('gh pr view gave unparseable output');
    }
    if (pr.state === 'OPEN') return fail(`PR #${args.pr} is open, not merged`, pr.headRefOid || null);
    if (pr.state === 'CLOSED') return fail(`PR #${args.pr} was closed without merging`, pr.headRefOid || null);
    if (pr.state !== 'MERGED') return fail(`PR #${args.pr} is in state ${pr.state}`, pr.headRefOid || null);
    if (args.target && pr.baseRefName !== args.target) {
      return fail(`PR #${args.pr} merged into ${pr.baseRefName}, not ${args.target}`, pr.headRefOid || null);
    }
    return judgeLink('merge', pr.headRefOid, anchor, trdRel, cwd, `PR #${args.pr} head`);
  }

  if (link === 'deploy') {
    const output = args.identityOutput;
    if (typeof output !== 'string' || output.trim() === '') return fail('the identity command gave no output');
    // `match` only: BUILD_TOKEN is a shared /g object and .test()/.exec() would carry lastIndex.
    const tokens = output.match(BUILD_TOKEN) || [];
    if (tokens.length === 0) return fail('no build token in the identity output');
    // An all-digit token is a number (a count, a date), not a commit (decideSetup's rule).
    const candidates = tokens.filter((t) => /[a-f]/i.test(t));
    if (candidates.length === 0) return fail('only all-digit tokens in the identity output');
    run('git', ['fetch', 'origin'], cwd);
    let last = null;
    for (const t of candidates) {
      const r = resolveCommit(t, cwd);
      if (r.error) continue;
      const j = judgeLink('deploy', r.sha, anchor, trdRel, cwd, `deployed build ${t}`);
      if (j.ok) return j;
      last = j;
    }
    return last || fail('no token in the identity output resolves to a commit');
  }

  return fail(`unknown link ${link}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE =
  'usage: custody.js reconcile --state-dir D --trd <path|none> [--closed P] [--definition P] [--reason format] [--reverified P]\n' +
  '       custody.js check --state-dir D --link push|merge|deploy --trd <path|none> [--branch B] [--pr N --target BASE] [--identity-output TEXT]';

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv) {
  const [cmd] = argv;
  const stateDir = flag(argv, '--state-dir');
  const trd = flag(argv, '--trd');
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o) + '\n');
    return 0;
  };
  if (cmd === 'reconcile' && stateDir && trd) {
    const reason = flag(argv, '--reason');
    if (reason !== undefined && reason !== 'format') return emit({ action: 'refused', anchor: '', reason: USAGE });
    return emit(
      reconcile({
        stateDir,
        trdPath: trd === 'none' ? null : trd,
        closedPath: flag(argv, '--closed'),
        definitionPath: flag(argv, '--definition'),
        reason,
        reverifiedPath: flag(argv, '--reverified'),
      })
    );
  }
  if (cmd === 'check' && stateDir && trd && flag(argv, '--link')) {
    const pr = flag(argv, '--pr');
    return emit(
      check({
        stateDir,
        link: flag(argv, '--link'),
        trdPath: trd === 'none' ? null : trd,
        branch: flag(argv, '--branch'),
        pr: pr === undefined ? undefined : Number(pr),
        target: flag(argv, '--target'),
        identityOutput: flag(argv, '--identity-output'),
      })
    );
  }
  return emit({ ok: false, action: 'refused', reason: USAGE });
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { reconcile, check, classifyPath, resolveCommit, compare, main };
