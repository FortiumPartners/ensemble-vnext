'use strict';

/**
 * custody.js -- chain of custody for /ship-build: proves that the code which was verified is the
 * code that was pushed, merged and deployed (TRD ship-build 3.5, D9-D12).
 *
 * WHY A SCRIPT: "is this the same code" is deterministic, and a prompt would re-derive it
 * differently each run. One anchor commit is held in `<stateDir>/custody.json` (or, once the run
 * detaches at the merge, beside its detached record: see ship-record-dir.js); three links
 * (pr-head, merge, deploy) are each compared to it.
 *
 * CODE EQUALITY (D9, D10): `git diff --no-renames --name-only -z <a> <b>`, each path classified,
 * checked in this order:
 *   ignored    a record file (`isRecordFile` in record-files.js: anything under `.trd-state/`,
 *              `.claude/verification-notes.md` and the root `OWNER-CALLS.md`) or the work's TRD
 *   test-only  a test file by D10's patterns
 *   ci-config  CI pipeline definitions (`.github/workflows/**`, `.github/actions/**`, `.gitlab-ci.yml`,
 *              `.circleci/**`, `Jenkinsfile`, ...)
 *   deps       dependency LOCKFILES (exact basename). Manifests (`package.json`, `pyproject.toml`)
 *              carry scripts and entry points, so they stay `shipped`
 *   docs       first segment `docs` or `doc`, or a README/CHANGELOG/LICENSE-style basename; never
 *              every `*.md` (a `.md` under `packages/core/commands/` is product)
 *   shipped    everything else
 * Two commits are equal (`compare`) when every differing path is `ignored` or `test-only`: docs, deps and ci-config
 * paths still make the pr-head, merge and deploy links and the `--head` guard fail, because a
 * lockfile or a build workflow does change the built artifact. `--no-renames` matters: default rename
 * detection reports only a rename's destination, so a shipped file moved under `.trd-state/`
 * would read as an ignored-only change.
 *
 * TIERS (reconcile only; `check` and `--set-only` read no setting): what a change since the anchor
 * must re-prove is set by `ensemble.reproof` in `<git toplevel>/.claude/settings.json`:
 *   docs none|ci|reprove (default none)    testOnly (ci)    ciConfig (ci)    deps (ci)
 *   depsReprove [package names] (default [])  -- a lockfile whose diff names one, whole-word, in
 *                                                 the entry a changed line sits in counts as `reprove`
 *   format none|reprove (default none)     `reprove` disables the `--reason format` shortcut
 *   shipped covers|all (default covers)    `all` re-proves every must-pass criterion
 * When every differing and excused path is of a non-shipped class at `none`/`ci`, the anchor moves
 * with no re-proof: rule `tier-none` (all at none) or `tier-ci` (any at ci). A path at `reprove` (or a
 * lockfile hitting depsReprove) is PROMOTED: every must-pass criterion is in doubt, and the base
 * excuse does not soften it. A value outside the allowed set stops reconcile with a reason naming it.
 *
 * BASE EXCUSE (reconcile only, given `--base <ref>`): merging the base branch into the feature
 * brings in files nobody verified here. With baseCommit = `git merge-base <head> <ref>` (the base
 * commit the head actually took in, never the moving tip), a shipped path that differs from the
 * anchor is EXCUSED when the head's blob equals baseCommit's (absent on both counts) AND the
 * feature's own diff (merge-base(anchor, baseCommit)..anchor) never touched it. A conflict
 * resolution, or a resolution that took the base wholesale, therefore stays `differing`. Excused
 * paths put in doubt only the must-pass criteria whose covers record names them, and any must-pass
 * objective no criterion names; a criterion with no covers record keeps its proof across a base-only
 * change (the CI run on the merged head guards base regressions). The others are returned as `reused`.
 * With `--base`, the result also carries `mergeBases: {old, new}`: merge-base(anchor, baseCommit)
 * and baseCommit, i.e. which base commits the head had before and now.
 *
 * CONTRACT
 *   - `reconcile` is the only verb that sets or moves the anchor (D12). `check` never writes.
 *   - Every failure returns `ok: false` / `refused` with a reason; nothing auto-fixes and
 *     nothing throws for an expected condition.
 *   - With no anchor set, `reconcile` anchors at closed.json `audit.anchorCommit` (source
 *     `audit-fixed`: the head after /audit-build's clean chained fix run), else `audit.auditedCommit`
 *     (`audited`), else the head (`pushed`). The first id present is the only one used; if it is
 *     unresolvable the result is `refused` (a later id is never tried in its place).
 *   - A short commit id resolves only when it is unique; an ambiguous one is `refused`.
 *   - A missing full commit id is fetched once (`git fetch origin <sha>`).
 *   - Every git/gh call is `spawnSync` with an argument array (no shell).
 *
 * CLI (run from the project root; each prints ONE JSON line and exits 0, even on `refused`):
 *   node custody.js reconcile --state-dir D --trd <path|none> [--closed P] [--definition P]
 *                             [--reason format] [--reverified <verification-state.json>]
 *                             [--base <ref>] [--head <sha>] [--set-only]
 *   node custody.js check --state-dir D --link pr-head --pr N --trd <path|none>
 *   node custody.js check --state-dir D --link merge --pr N --target BASE --trd <path|none>
 *   node custody.js check --state-dir D --link deploy --identity-output <text> --trd <path|none>
 *   node custody.js detach --state-dir D --started-at T
 *
 * `--head <sha>` judges that commit (the PR head) instead of local HEAD, and refuses when local
 * HEAD has shipped changes not in it (re-verification runs on the working tree). `--set-only` sets
 * an absent anchor and never compares or moves one.
 *
 * The pr-head link reads an OPEN PR's own `headRefOid` (the id `gh pr merge --match-head-commit`
 * compares against) and judges it; its `observed` is what the merge step passes to GitHub.
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
const recordDirs = require('./ship-record-dir');
const { isRecordFile } = require('./record-files');
const { globToRegex } = require('./ci-baseline');
const recordRef = require('./record-ref');

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

const CI_CONFIG_DIRS = ['.github/workflows/', '.github/actions/', '.circleci/', '.buildkite/'];
const CI_CONFIG_FILES = new Set(['.gitlab-ci.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', 'Jenkinsfile']);
const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'Pipfile.lock', 'poetry.lock', 'uv.lock', 'Gemfile.lock', 'go.sum', 'Cargo.lock', 'composer.lock',
  'mix.lock', 'pubspec.lock', 'Podfile.lock', 'packages.lock.json',
]);
const DOC_BASENAME = /^(README|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|AUTHORS|NOTICE)(\.(md|markdown|txt|rst|adoc))?$/i;

/** @returns {'ignored'|'test-only'|'ci-config'|'deps'|'docs'|'shipped'} for a repo-relative, forward-slash path. */
function classifyPath(p, trdRel) {
  if (isRecordFile(p)) return 'ignored';
  if (trdRel && p === trdRel) return 'ignored';
  const segments = p.split('/');
  const base = segments[segments.length - 1];
  if (TEST_BASENAME.some((re) => re.test(base))) return 'test-only';
  if (segments.slice(0, -1).some((s) => TEST_SEGMENTS.has(s))) return 'test-only';
  if (CI_CONFIG_DIRS.some((d) => p.startsWith(d)) || CI_CONFIG_FILES.has(p)) return 'ci-config';
  if (LOCKFILES.has(base)) return 'deps';
  if (segments.length > 1 && (segments[0] === 'docs' || segments[0] === 'doc')) return 'docs';
  if (DOC_BASENAME.test(base)) return 'docs';
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

/** The paths `git diff --no-renames` reports between two commits, or null on failure. */
function diffNames(a, b, cwd) {
  const r = run('git', ['diff', '--no-renames', '--name-only', '-z', a, b], cwd);
  return r.ok ? { names: r.raw.split('\0').filter(Boolean) } : { error: `git diff failed: ${r.err}` };
}

/**
 * Code equality of two local commits, optionally excusing what came in from the base branch.
 * @param {string} [baseCommit] the base commit the head took in; enables the excuse (see header)
 * @returns {{equal: boolean, differing: string[], excused: string[], names: string[], error?: string}}
 *   `names` is every path that differs, any class. `differing` lists the differing paths of every class but ignored and test-only (what an owner needs to see), in git's order; `equal`
 *   means `differing` is empty. `excused` is empty without a baseCommit.
 */
function compare(a, b, trdRel, cwd, baseCommit) {
  const d = diffNames(a, b, cwd);
  if (d.error) return { equal: false, differing: [], excused: [], names: [], error: d.error };
  // Every class but `ignored` and `test-only` differs; the tiers act in reconcile, never here.
  const shipped = d.names.filter((p) => { const c = classifyPath(p, trdRel); return c !== 'ignored' && c !== 'test-only'; });
  if (!baseCommit || shipped.length === 0) return { equal: shipped.length === 0, differing: shipped, excused: [], names: d.names };

  const mb = run('git', ['merge-base', a, baseCommit], cwd);
  if (!mb.ok) return { equal: false, differing: [], excused: [], error: `git merge-base failed: ${mb.err}` };
  const feature = diffNames(mb.out, a, cwd);
  const vsBase = diffNames(b, baseCommit, cwd);
  const failed = feature.error || vsBase.error;
  if (failed) return { equal: false, differing: [], excused: [], error: failed };
  const touchedByFeature = new Set(feature.names);
  const differsFromBase = new Set(vsBase.names);
  const excused = [];
  const differing = [];
  for (const p of shipped) (!differsFromBase.has(p) && !touchedByFeature.has(p) ? excused : differing).push(p);
  return { equal: differing.length === 0, differing, excused, names: d.names };
}

// ---------------------------------------------------------------------------
// custody.json
// ---------------------------------------------------------------------------

// The anchor's file: tracked until the run detaches, then outside the tree (ship-record-dir.js).
const custodyPath = recordDirs.custodyPath;

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
  const file = custodyPath(stateDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  implementState.save(file, custody);
}

/**
 * Copies the tracked custody.json out of the tree, beside the run's detached record, so the merged
 * branch is not left with a file that keeps changing. The tracked copy stays and is never written
 * again (deleting it would dirty the merged branch). No-op when the copy exists or nothing is tracked.
 * @returns {{ok: boolean, action: 'detached'|'none', path: string|null, reason: string}}
 */
function detach({ stateDir, startedAt }) {
  if (!startedAt) return { ok: false, action: 'none', path: null, reason: 'detach needs a startedAt' };
  const dir = recordDirs.recordDir(stateDir);
  if (!dir) return { ok: true, action: 'none', path: null, reason: 'not inside a git directory' };
  const dest = path.join(dir, `${recordDirs.safeName(startedAt)}.custody.json`);
  if (fs.existsSync(dest)) return { ok: true, action: 'none', path: dest, reason: 'already detached' };
  let tracked;
  try {
    tracked = JSON.parse(fs.readFileSync(path.join(stateDir, 'custody.json'), 'utf8'));
  } catch {
    return { ok: true, action: 'none', path: dest, reason: 'no tracked anchor' };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    implementState.save(dest, tracked);
  } catch (e) {
    return { ok: false, action: 'none', path: dest, reason: `cannot write ${dest}: ${e.message}` };
  }
  return { ok: true, action: 'detached', path: dest, reason: 'custody anchor copied out of the tree' };
}

/** A commit id field of closed.json's parsed `audit` object (`auditedCommit`, `anchorCommit`), or null. */
function auditCommitOf(audit, field) {
  const id = audit && audit[field];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

// ---------------------------------------------------------------------------
// ensemble.reproof (tier setting)
// ---------------------------------------------------------------------------

const REPROOF_DEFAULTS = { docs: 'none', testOnly: 'ci', ciConfig: 'ci', deps: 'ci', depsReprove: [], format: 'none', shipped: 'covers' };
const REPROOF_ALLOWED = {
  docs: ['none', 'ci', 'reprove'], testOnly: ['none', 'ci', 'reprove'], ciConfig: ['none', 'ci', 'reprove'],
  deps: ['none', 'ci', 'reprove'], format: ['none', 'reprove'], shipped: ['covers', 'all'],
};

/**
 * `ensemble.reproof` from `<git toplevel>/.claude/settings.json`. Absent file or key -> defaults;
 * a set but invalid value, or a file that is not JSON -> `{error}` naming the setting (reconcile
 * refuses rather than guess what the owner meant). Unknown keys are ignored.
 * @returns {{settings: typeof REPROOF_DEFAULTS}|{error: string}}
 */
function readReproof(cwd) {
  const top = run('git', ['rev-parse', '--show-toplevel'], cwd);
  const file = path.join(top.ok ? top.out : cwd, '.claude', 'settings.json');
  let configured = {};
  if (fs.existsSync(file)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return { error: `ensemble.reproof cannot be read: .claude/settings.json is not valid JSON (${e.message})` };
    }
    const r = parsed && parsed.ensemble && parsed.ensemble.reproof;
    if (r !== undefined && r !== null) {
      if (typeof r !== 'object' || Array.isArray(r)) return { error: 'ensemble.reproof must be an object' };
      configured = r;
    }
  }
  const settings = { ...REPROOF_DEFAULTS };
  for (const [key, allowed] of Object.entries(REPROOF_ALLOWED)) {
    const v = configured[key];
    if (v === undefined || v === null) continue;
    if (!allowed.includes(v)) {
      return { error: `ensemble.reproof.${key} must be one of ${allowed.join(', ')} (got ${JSON.stringify(v)})` };
    }
    settings[key] = v;
  }
  const dr = configured.depsReprove;
  if (dr !== undefined && dr !== null) {
    if (!Array.isArray(dr) || !dr.every((x) => typeof x === 'string' && x.trim() !== '')) {
      return { error: `ensemble.reproof.depsReprove must be an array of non-empty strings (got ${JSON.stringify(dr)})` };
    }
    settings.depsReprove = dr.map((x) => x.trim());
  }
  return { settings };
}

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when a listed package name appears, whole-word, in the lockfile entry a changed line sits in:
 * the changed line itself, the hunk's function context (git's nearest preceding unindented line --
 * the `name = "x"` line of a Cargo/poetry/uv stanza), or a line enclosing it by indentation (the
 * `"requests": {` key of a Pipfile.lock or package-lock.json entry, a yarn.lock header). A version
 * bump in most lockfiles changes only the version and hash lines, never the line naming the
 * package. An unreadable or binary diff counts as a hit (safe).
 */
function lockfileNamesPackage(file, names, anchor, head, cwd) {
  if (names.length === 0) return false;
  const d = run('git', ['diff', '--no-renames', '-U0', anchor, head, '--', file], cwd);
  if (!d.ok || /^Binary files /m.test(d.raw)) return true;
  const res = names.map((n) => new RegExp(`(?<![A-Za-z0-9_.-])${escapeRe(n)}(?![A-Za-z0-9_.-])`));
  const hit = (t) => res.some((re) => re.test(t));
  const sides = {};
  const sideOf = (sign) => {
    if (!sides[sign]) {
      const r = run('git', ['show', `${sign === '-' ? anchor : head}:${file}`], cwd);
      const text = r.ok ? r.raw.split('\n') : [];
      sides[sign] = { text, parent: enclosingIndex(text) };
    }
    return sides[sign];
  };
  const at = { '-': 0, '+': 0 };
  let inHunk = false;
  for (const l of d.raw.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(l);
    if (h) {
      at['-'] = Number(h[1]);
      at['+'] = Number(h[2]);
      inHunk = true;
      if (hit(h[3])) return true;
      continue;
    }
    const sign = l[0];
    if (!inHunk || (sign !== '+' && sign !== '-')) continue;
    if (hit(l.slice(1))) return true;
    const { text, parent } = sideOf(sign);
    for (let i = parent[at[sign] - 1]; i !== undefined && i >= 0; i = parent[i]) if (hit(text[i])) return true;
    at[sign] += 1;
  }
  return false;
}

/** For each line, the index of the nearest preceding non-blank line indented less than it, or -1. */
function enclosingIndex(lines) {
  const indentOf = (t) => t.length - t.trimStart().length;
  const parent = new Array(lines.length).fill(-1);
  const stack = []; // indices of non-blank lines, strictly increasing indent
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      const ind = indentOf(lines[i]);
      while (stack.length && indentOf(lines[stack[stack.length - 1]]) >= ind) stack.pop();
      parent[i] = stack.length ? stack[stack.length - 1] : -1;
      stack.push(i);
    } else {
      parent[i] = stack.length ? stack[stack.length - 1] : -1;
    }
  }
  return parent;
}

/**
 * Partitions the paths changed anchor..head by class (test-only included, ignored dropped) and
 * names the promoted ones: tier `reprove`, or a lockfile hitting depsReprove.
 */
function partitionChanges(names, rs, trdRel, anchor, head, cwd) {
  const tierOf = { docs: rs.docs, 'test-only': rs.testOnly, 'ci-config': rs.ciConfig, deps: rs.deps };
  const classes = new Map(); // class -> paths, only the non-shipped, non-ignored ones
  const promoted = [];
  for (const p of names) {
    const c = classifyPath(p, trdRel);
    if (!(c in tierOf)) continue;
    if (!classes.has(c)) classes.set(c, []);
    classes.get(c).push(p);
    if (tierOf[c] === 'reprove' || (c === 'deps' && lockfileNamesPackage(p, rs.depsReprove, anchor, head, cwd))) promoted.push(p);
  }
  return { classes, promoted, tierOf };
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
 * The must-pass ids a change puts in doubt. `shipped` and `excused` are the SHIPPED-class paths that
 * differ / came in from the base. The set comes from the one reader,
 * `functional-verification.js must-pass-coverage` (an id is must-pass only when the TRD declares
 * it); every uncovered must-pass objective counts too (it never had a proof).
 *
 * Covers per id: live-evidence artifact covers -> the criterion-covers record -> none. Everything is
 * in doubt (a) with `shipped: 'all'`, (b) when a path was `promoted` (tier `reprove`: no covers record
 * names a lockfile or a workflow, so matching would make the promotion a no-op), or (c) when a
 * non-excused shipped path is named by no record of any criterion (Touches lists what a task planned
 * to edit, not everything a criterion depends on: an unclaimed file is where a record could
 * under-cover). Otherwise a criterion with covers is affected when a changed path is on its list; one
 * with none counts as affected whenever a shipped path differs (OQ-2), but not for a base-only change
 * (`shipped` empty), and only when verification-state records it `met`. `reused` is the rest.
 * @returns {{ids: string[], reused: string[]}|{error: string}}
 */
function affectedIds({ stateDir, trdPath, definitionPath, shipped, excused, promoted = [], shippedAll = false, cwd }) {
  const cli = path.join(__dirname, 'functional-verification.js');
  const r = run(process.execPath, [cli, 'must-pass-coverage', '--trd', trdPath, '--definition', definitionPath], cwd);
  if (!r.ok) return { error: `must-pass-coverage failed: ${r.err || r.out}` };
  let cov;
  try {
    cov = JSON.parse(r.out);
  } catch {
    return { error: 'must-pass-coverage gave unparseable output' };
  }
  const criterionIds = new Set(cov.criteria || []);
  const ids = [...new Set([...(cov.criteria || []), ...(cov.uncovered || []).map((u) => u.id)])];
  if (shippedAll || promoted.length > 0) return { ids, reused: [] };

  const top = run('git', ['rev-parse', '--show-toplevel'], cwd);
  const root = fs.realpathSync(top.ok ? top.out : cwd);
  // verification-state.json holds the proving artifact per id; the manifest maps artifact -> covers.
  const state = readJson(path.join(stateDir, 'verification-state.json'));
  const artifactById = new Map(((state && state.criteria) || []).map((c) => [c.id, c.artifact]));
  // Only a criterion verification-state records as met has a proof a base-only change can keep.
  const proven = new Set(((state && state.criteria) || []).filter((c) => c.status === 'met').map((c) => c.id));
  const coversByArtifact = new Map(
    liveEvidence.read(stateDir).map((e) => [realOrResolved(e.artifact, cwd), e.covers])
  );
  const recorded = liveEvidence.readCriterionCovers(stateDir);
  // covers[].path is absolute; git's paths are repo-relative -- compare in one form.
  const coversOf = (id) => {
    const artifact = artifactById.get(id);
    const live = artifact ? coversByArtifact.get(realOrResolved(artifact, cwd)) : undefined;
    if (live) return live.map((c) => path.relative(root, realOrResolved(c.path, cwd)).split(path.sep).join('/'));
    // A record is merged, never pruned: one written when the id was last met outlives a later run
    // that found it not met. Only a criterion verification-state records as met keeps its record.
    return proven.has(id) ? recorded.get(id) : undefined; // undefined: no usable record
  };
  const matchersById = new Map(ids.map((id) => { const c = coversOf(id); return [id, c && c.map(coverMatcher)]; }));
  const allMatchers = [...matchersById.values()].filter(Boolean).flat();
  if (shipped.some((p) => !allMatchers.some((m) => m(p)))) return { ids, reused: [] };

  const changed = [...shipped, ...excused];
  const affected = ids.filter((id) => {
    const matchers = matchersById.get(id);
    // No covers record: only a base-only change keeps a criterion's proof, and only one it was met
    // with; an objective no criterion names, or a criterion never met, has no proof to keep.
    if (!matchers) return !criterionIds.has(id) || !proven.has(id) || shipped.length > 0;
    return changed.some((p) => matchers.some((m) => m(p)));
  });
  return { ids: affected, reused: ids.filter((id) => !affected.includes(id)) };
}

/**
 * A predicate for one repo-relative cover. A Touches entry may name a directory (`src/lib/` or
 * `src/lib`) or a glob (`.claude/commands/{amend,sweep}.md`): exact equality would leave a changed
 * file under it unmatched, and the criterion reused while another criterion claims the file.
 */
function coverMatcher(cover) {
  if (/[*?[{]/.test(cover)) {
    const re = globToRegex(cover);
    return (p) => re.test(p);
  }
  const dir = cover.replace(/\/+$/, '');
  return (p) => p === cover || p.startsWith(`${dir}/`);
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

/** Resolves a base ref to {commit} or {error}. A ref that looks like an option is refused. */
function resolveRef(ref, cwd) {
  const want = String(ref || '').trim();
  if (!want || want.startsWith('-')) return { error: `invalid base ref ${ref}` };
  const r = run('git', ['rev-parse', '--verify', `${want}^{commit}`], cwd);
  return r.ok ? { commit: r.out } : { error: `base ref ${want} does not name a commit` };
}

/**
 * Sets the anchor once, then moves it to the judged commit only when the change since is proven
 * harmless.
 *
 * @param {{stateDir: string, closedPath?: string, trdPath: string|null, definitionPath?: string|null,
 *          reason?: 'format', reverifiedPath?: string, base?: string, head?: string, setOnly?: boolean,
 *          cwd?: string}} args
 *   `base`: ref whose already-merged changes are excused (see header). `head`: the commit judged
 *   instead of local HEAD. `setOnly`: set an absent anchor, never compare or move.
 * @returns {{action: 'set'|'none'|'moved'|'reverify'|'refused', anchor: string, ids?: string[],
 *            reused?: string[], differing?: string[], excused?: string[], mergeBases?: {old: string, new: string}, reason: string}}
 */
function reconcile(args) {
  const { stateDir, trdPath = null, reason, reverifiedPath, cwd = process.cwd() } = args;
  // A re-created worktree has no state folder: bring it back from the records ref before any read.
  // Never throws; any outcome other than a restore reads as "no record", exactly as before.
  // stateDir is read below relative to process.cwd(), so resolve it the same way here.
  recordRef.ensure({ stateDir: typeof stateDir === 'string' && stateDir ? path.resolve(stateDir) : stateDir, cwd });
  const closedPath = args.closedPath || path.join(stateDir, 'closed.json');
  const localHead = headSha(cwd);
  if (!localHead) return { action: 'refused', anchor: '', reason: 'cannot read HEAD' };
  const trdRel = trdRelative(trdPath, cwd);

  let head = localHead;
  if (args.head) {
    const r = resolveCommit(args.head, cwd);
    if (r.error) return { action: 'refused', anchor: '', reason: `head commit ${args.head} is ${r.error}` };
    head = r.sha;
  }

  let custody = readCustody(stateDir);
  if (args.setOnly && custody) {
    return { action: 'none', anchor: custody.anchor.commit, reason: 'anchor already set' };
  }
  if (!args.setOnly && head !== localHead) {
    // Re-verification runs on the working tree, so it must not differ from the judged head.
    const local = compare(head, localHead, trdRel, cwd);
    if (local.error) return { action: 'refused', anchor: '', reason: local.error };
    if (!local.equal) {
      return { action: 'refused', anchor: '', differing: local.differing, reason: `local HEAD has shipped changes not on the PR head (or the PR head has changes not pulled here): ${local.differing.join(', ')}` };
    }
  }

  // The tier setting is read here, before an anchor can be written, so an invalid one stops the run
  // untouched. `--set-only` compares nothing and so reads no setting.
  let rs = null;
  if (!args.setOnly) {
    const read = readReproof(cwd);
    if (read.error) return { action: 'refused', anchor: custody ? custody.anchor.commit : '', reason: read.error };
    rs = read.settings;
  }

  let justSet = false;
  if (!custody) {
    // Preference when no anchor is set: the head the audit's chained fix run ended on (anchorCommit,
    // written by /audit-build only after a clean fix run and a close), then the commit the audit
    // examined (auditedCommit), then the head. A present but unresolvable id is refused, not skipped.
    let commit = head;
    let source = 'pushed';
    const closed = readJson(closedPath);
    const audit = closed && closed.audit;
    for (const [field, label, src] of [
      ['anchorCommit', 'audit anchor commit', 'audit-fixed'],
      ['auditedCommit', 'audited commit', 'audited'],
    ]) {
      const id = auditCommitOf(audit, field);
      if (!id) continue;
      const r = resolveCommit(id, cwd);
      if (r.error) return { action: 'refused', anchor: '', reason: `${label} ${id} is ${r.error}` };
      commit = r.sha;
      source = src;
      break;
    }
    custody = { version: 1, anchor: { commit, source }, moves: [] };
    writeCustody(stateDir, custody);
    justSet = true;
  }
  if (args.setOnly) return { action: 'set', anchor: custody.anchor.commit, reason: `anchor set (${custody.anchor.source})` };

  const anchor = custody.anchor.commit;
  if (!hasCommit(anchor, cwd)) run('git', ['fetch', 'origin', anchor], cwd);
  if (!hasCommit(anchor, cwd)) {
    return { action: 'refused', anchor, reason: `anchor commit ${anchor} is not available locally` };
  }

  let baseCommit;
  let mergeBases;
  if (args.base) {
    const ref = resolveRef(args.base, cwd);
    if (ref.error) return { action: 'refused', anchor, reason: ref.error };
    // The base commit the head actually took in, not the moving tip of the base branch.
    const mb = run('git', ['merge-base', head, ref.commit], cwd);
    if (!mb.ok) return { action: 'refused', anchor, reason: `no merge base between the head and ${args.base}` };
    // A head the base already contains (a PR merged by hand, a merge-commit merge) took nothing in
    // from the base: every change since the anchor would read as base-only. Excuse nothing then.
    if (mb.out !== head) {
      baseCommit = mb.out;
      // Which base commits the head had before (as of the anchor) and has now, so a caller can tell
      // that only the base moved. Left out when the old one cannot be read.
      const old = run('git', ['merge-base', anchor, baseCommit], cwd);
      if (old.ok) mergeBases = { old: old.out, new: baseCommit };
    }
  }

  const cmp = compare(anchor, head, trdRel, cwd, baseCommit);
  if (cmp.error) return { action: 'refused', anchor, reason: cmp.error };
  const shipped = cmp.differing; // every differing class but ignored and test-only; what the owner sees
  const excused = cmp.excused;
  // `excused` and `mergeBases` appear only when a base was given, so a no-flag run reports exactly what it always did.
  const out = (o) => (args.base ? { ...o, excused, ...(mergeBases ? { mergeBases } : {}) } : o);

  // Tiers: partition ALL changed paths (test-only included, which `differing` drops) by class.
  const { classes, promoted, tierOf } = partitionChanges(cmp.names, rs, trdRel, anchor, head, cwd);
  const isShipped = (p) => classifyPath(p, trdRel) === 'shipped';
  const shippedDiff = shipped.filter(isShipped);
  const shippedExcused = excused.filter(isShipped);

  if (shipped.length === 0 && excused.length === 0 && promoted.length === 0) {
    return out({
      action: justSet ? 'set' : 'none',
      anchor,
      reason: justSet ? `anchor set (${custody.anchor.source})` : 'no shipped source changed since the anchor',
    });
  }

  if (reason === 'format' && rs.format !== 'reprove' && promoted.length === 0 && shipped.length > 0 && excused.length === 0) {
    // The formatter commit is the shortcut only when it is the sole change; an earlier unverified
    // change, a promoted path (a test-only one compare() cannot see), or a base-excused path (which still puts must-pass criteria in doubt), would
    // otherwise be waved through with it.
    const parent = run('git', ['rev-parse', '--verify', `${head}^`], cwd);
    if (parent.ok) {
      const before = compare(anchor, parent.out, trdRel, cwd, baseCommit);
      if (!before.error && before.equal) {
        const next = move(stateDir, custody, head, 'format', []);
        return out({ action: 'moved', anchor: next.anchor.commit, differing: shipped, reason: 'moved: formatter commit' });
      }
    }
  }

  // With shipped differences the rules keep their old names; base-only changes move as base-merge.
  const fresh = shippedDiff.length > 0;
  const noneAffectedRule = fresh ? 'no-affected-criteria' : 'base-merge';
  const definitionPath = args.definitionPath || path.join(stateDir, 'success-definition.md');
  const trdFile = trdRel && path.resolve(cwd, trdPath);
  if (!trdFile || !fs.existsSync(trdFile) || !fs.existsSync(path.resolve(cwd, definitionPath))) {
    const rule = shipped.length > 0 || promoted.length > 0 ? 'no-success-definition' : 'base-merge';
    const next = move(stateDir, custody, head, rule, []);
    return out({
      action: 'moved', anchor: next.anchor.commit, differing: shipped,
      reason: rule === 'no-success-definition' ? 'moved: no success definition to re-verify against' : 'moved: only base-branch changes since the anchor',
    });
  }

  // Only non-shipped classes changed, none promoted: nothing to re-prove, the anchor moves.
  if (shippedDiff.length === 0 && shippedExcused.length === 0 && promoted.length === 0) {
    const named = ['docs', 'ci-config', 'deps', 'test-only'].filter((c) => classes.has(c));
    const ci = named.some((c) => tierOf[c] === 'ci');
    const next = move(stateDir, custody, head, ci ? 'tier-ci' : 'tier-none', []);
    return out({
      action: 'moved', anchor: next.anchor.commit, differing: shipped,
      reason: `moved: only ${named.join(', ')} changed (${ci ? 'left to CI' : 'needs no re-proof'})`,
    });
  }

  const aff = affectedIds({
    stateDir, trdPath: trdFile, definitionPath: path.resolve(cwd, definitionPath),
    shipped: shippedDiff, excused: shippedExcused, promoted, shippedAll: rs.shipped === 'all', cwd,
  });
  if (aff.error) return out({ action: 'refused', anchor, differing: shipped, reason: aff.error });
  if (aff.ids.length === 0) {
    const next = move(stateDir, custody, head, noneAffectedRule, []);
    return out({
      action: 'moved', anchor: next.anchor.commit, differing: shipped, reused: aff.reused,
      reason: fresh ? 'moved: no must-pass criterion is affected' : 'moved: only base-branch changes, no must-pass criterion is affected',
    });
  }
  if (!reverifiedPath) {
    return out({ action: 'reverify', anchor, ids: aff.ids, reused: aff.reused, differing: shipped, reason: `${aff.ids.length} must-pass criteria need re-verification` });
  }
  const re = readJson(reverifiedPath);
  if (!re || !Array.isArray(re.criteria)) {
    return out({ action: 'refused', anchor, ids: aff.ids, reused: aff.reused, differing: shipped, reason: `cannot read re-verification state ${reverifiedPath}` });
  }
  const statusOf = new Map(re.criteria.map((c) => [c.id, c.status]));
  const notMet = aff.ids.filter((id) => statusOf.get(id) !== 'met');
  if (notMet.length > 0) {
    return out({ action: 'refused', anchor, ids: notMet, reused: aff.reused, differing: shipped, reason: `not met after re-verification: ${notMet.join(', ')}` });
  }
  const next = move(stateDir, custody, head, 'reverified', aff.ids);
  return out({ action: 'moved', anchor: next.anchor.commit, ids: aff.ids, reused: aff.reused, differing: shipped, reason: 'moved: affected criteria re-verified' });
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
 * @param {{stateDir: string, link: 'pr-head'|'merge'|'deploy', pr?: number,
 *          target?: string, identityOutput?: string, trdPath?: string|null, cwd?: string}} args
 * @returns {{ok: boolean, link: string, observed: string|null, differing: string[], reason: string}}
 */
function check(args) {
  const { stateDir, link, trdPath = null, cwd = process.cwd() } = args;
  recordRef.ensure({ stateDir: typeof stateDir === 'string' && stateDir ? path.resolve(stateDir) : stateDir, cwd }); // see reconcile: restore the folder before reading the anchor
  const fail = (reason, observed = null, differing = []) => ({ ok: false, link, observed, differing, reason });
  if (!['pr-head', 'merge', 'deploy'].includes(link)) return fail(`unknown link ${link}`);
  const custody = readCustody(stateDir);
  if (!custody) return fail('no anchor');
  const anchor = custody.anchor.commit;
  if (!hasCommit(anchor, cwd)) run('git', ['fetch', 'origin', anchor], cwd);
  if (!hasCommit(anchor, cwd)) return fail(`anchor commit ${anchor} is not available locally`);
  const trdRel = trdRelative(trdPath, cwd);

  if (link === 'pr-head') {
    if (!Number.isInteger(args.pr) || args.pr <= 0) return fail('pr-head link needs a PR number');
    const v = run('gh', ['pr', 'view', String(args.pr), '--json', 'state,headRefOid'], cwd);
    if (!v.ok) return fail(`gh pr view failed: ${v.err || v.out}`);
    let pr;
    try {
      pr = JSON.parse(v.out);
    } catch {
      return fail('gh pr view gave unparseable output');
    }
    if (pr.state !== 'OPEN') return fail(`PR #${args.pr} is ${pr.state}, not open`, pr.headRefOid || null);
    if (!pr.headRefOid) return fail(`PR #${args.pr} reports no head commit`);
    return judgeLink('pr-head', pr.headRefOid, anchor, trdRel, cwd, `PR #${args.pr} head`);
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

  return fail(`unknown link ${link}`); // unreachable: the link is validated above
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE =
  'usage: custody.js reconcile --state-dir D --trd <path|none> [--closed P] [--definition P] [--reason format] [--reverified P]\n' +
  '                         [--base REF] [--head SHA] [--set-only]\n' +
  '       custody.js check --state-dir D --link pr-head|merge|deploy --trd <path|none> [--pr N --target BASE] [--identity-output TEXT]\n' +
  '       custody.js detach --state-dir D --started-at T';

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
        base: flag(argv, '--base'),
        head: flag(argv, '--head'),
        setOnly: argv.includes('--set-only'),
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
        pr: pr === undefined ? undefined : Number(pr),
        target: flag(argv, '--target'),
        identityOutput: flag(argv, '--identity-output'),
      })
    );
  }
  if (cmd === 'detach' && stateDir && flag(argv, '--started-at')) {
    return emit(detach({ stateDir, startedAt: flag(argv, '--started-at') }));
  }
  return emit({ ok: false, action: 'refused', reason: USAGE });
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { reconcile, check, detach, classifyPath, resolveCommit, compare, coverMatcher, main };
