'use strict';

/**
 * merge-up.js -- decides whether /ship-build must merge the base branch into a PR's head before
 * the custody gate and the merge (TRD merge-up-reproves-only-changed).
 *
 * WHY A SCRIPT: the answer is GitHub's own verdict on the PR, read the same way every run; a
 * prompt would re-derive it differently. Branch protection is never read: `mergeStateStatus`
 * BEHIND is GitHub's statement that the head is out of date under a rule or ruleset that
 * requires it, and the protection API would miss rulesets and need admin scope.
 *
 * RULES (state is checked first: a merged PR reads mergeable UNKNOWN forever)
 *   MERGED                              -> skip
 *   CLOSED (not merged)                 -> refused (ok: false; nothing to bring the base into)
 *   mergeable UNKNOWN                   -> poll   (GitHub has not computed it yet)
 *   mergeable CONFLICTING               -> merge-in
 *   mergeable MERGEABLE + BEHIND        -> merge-in (up-to-date requirement)
 *   mergeable MERGEABLE + UNKNOWN       -> poll   (a not-yet-computed BEHIND must not be missed)
 *   mergeable MERGEABLE + anything else -> skip
 *
 * CLI (each prints ONE JSON line and exits 0, even on a refusal or gh failure):
 *   node merge-up.js decide --pr N
 *   node merge-up.js sync-head --pr N --branch B --base <base> --judged <sha|none> --trd <path|none>
 *
 * SYNC-HEAD (TRD resume-re-proves-a-moved-pr-head): brings local HEAD up to the PR branch's pushed
 * tip and says whether that tip is a head CI has not judged. Stateless: the caller passes the head
 * its steps last judged (`none` when it has none). The head is the fetched `origin/<branch>` tip,
 * not GitHub's `headRefOid`, which trails a push by about 80s. Local HEAD moves only by
 * `--ff-only`, or by a local `--no-ff` merge whose own side touched only record files (a fallback
 * run-record commit); a conflicting merge is aborted. Other local-only commits are a conflict.
 * Returns {ok, head, judged, moved, sync, baseOnly, changed}; `moved` is `head !== judged`.
 * `--trd` is accepted for the contract's argument list and not read.
 */

const { spawnSync } = require('child_process');
const { isRecordFile } = require('./record-files');

const USAGE = 'usage: merge-up.js decide --pr <integer> | sync-head --pr <integer> --branch <name> --base <name> --judged <sha|none> --trd <path|none>';

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: !r.error && r.status === 0,
    out: (r.stdout || '').trim(),
    err: (r.stderr || (r.error && r.error.message) || '').trim(),
  };
}

/** @param {{pr: number|string, cwd?: string}} args @returns {{ok: boolean, action: string, reason: string}} */
function decide(args) {
  const prNum = args && args.pr;
  if (!/^[0-9]+$/.test(String(prNum === undefined ? '' : prNum))) return { ok: false, action: 'refused', reason: USAGE };
  const v = run('gh', ['pr', 'view', String(prNum), '--json', 'state,mergeable,mergeStateStatus'], args.cwd);
  if (!v.ok) return { ok: false, action: 'refused', reason: `could not read PR ${prNum}: ${v.err || 'gh failed'}` };
  let pr;
  try {
    pr = JSON.parse(v.out);
  } catch {
    return { ok: false, action: 'refused', reason: `could not parse gh output for PR ${prNum}` };
  }
  const state = pr.state;
  const mergeable = pr.mergeable;
  const status = pr.mergeStateStatus;
  if (state === 'MERGED') return { ok: true, action: 'skip', reason: 'PR already merged' };
  // A closed PR must not be merged into, pushed to, or polled: stop now, not after 8 polls.
  if (state === 'CLOSED') return { ok: false, action: 'refused', reason: `PR ${prNum} is closed without being merged` };
  if (mergeable === 'CONFLICTING') return { ok: true, action: 'merge-in', reason: 'PR conflicts with the base' };
  if (mergeable === 'MERGEABLE' && status === 'BEHIND') {
    return { ok: true, action: 'merge-in', reason: 'the base requires the head to be up to date and the head is behind' };
  }
  if (mergeable === 'MERGEABLE' && status !== 'UNKNOWN') {
    return { ok: true, action: 'skip', reason: `mergeable, status ${status}` };
  }
  return { ok: true, action: 'poll', reason: 'GitHub has not finished computing mergeability' };
}

const gitRun = (args, cwd) => run('git', args, cwd);
const names = (out) => out.split('\n').filter(Boolean);

/** Paths that differ between two commits, or null when git could not say. */
function diffNames(a, b, cwd) {
  const r = gitRun(['diff', '--name-only', '--no-renames', a, b], cwd);
  return r.ok ? names(r.out) : null;
}

/**
 * Of the paths that changed between the judged head and the tip (record files aside), which are
 * NOT from the base? custody.compare's base excuse, applied to every class (test files included:
 * a test-only commit from another session is more than a base merge): a path is from the base
 * when the tip's blob equals the base commit's and the feature's own diff never touched it.
 */
function featureChanges(judged, tip, base, cwd) {
  const d = diffNames(judged, tip, cwd);
  if (!d) return null;
  const changed = d.filter((p) => !isRecordFile(p));
  if (changed.length === 0) return [];
  const mb = gitRun(['merge-base', tip, `origin/${base}`], cwd);
  if (!mb.ok) return changed;
  const fmb = gitRun(['merge-base', judged, mb.out], cwd);
  const feature = fmb.ok ? diffNames(fmb.out, judged, cwd) : null;
  const vsBase = diffNames(tip, mb.out, cwd);
  if (!feature || !vsBase) return changed;
  const touched = new Set(feature);
  const differs = new Set(vsBase);
  return changed.filter((p) => differs.has(p) || touched.has(p));
}

/**
 * @param {{pr: number|string, branch: string, base: string, judged: string, trd?: string, cwd?: string}} args
 * @returns {{ok: boolean, reason?: string, head?: string, judged?: string, moved?: boolean, sync?: string, baseOnly?: boolean, changed?: string[]}}
 */
function syncHead(args) {
  const a = args || {};
  const fail = (reason) => ({ ok: false, reason });
  if (!/^[0-9]+$/.test(String(a.pr === undefined ? '' : a.pr))) return fail(USAGE);
  for (const k of ['branch', 'base', 'judged']) {
    if (typeof a[k] !== 'string' || !a[k] || a[k].startsWith('-')) return fail(`${USAGE} (bad --${k})`);
  }
  if (a.judged !== 'none' && !/^[0-9a-f]{7,64}$/i.test(a.judged)) return fail(`${USAGE} (--judged must be a sha or none)`);
  const cwd = a.cwd;
  const judgedIn = a.judged === 'none' ? 'none' : a.judged;

  const v = run('gh', ['pr', 'view', String(a.pr), '--json', 'state'], cwd);
  if (!v.ok) return fail(`could not read PR ${a.pr}: ${v.err || 'gh failed'}`);
  let state;
  try {
    state = JSON.parse(v.out).state;
  } catch {
    return fail(`could not parse gh output for PR ${a.pr}`);
  }
  if (state === 'MERGED') return { ok: true, head: null, judged: judgedIn, moved: false, sync: 'none', baseOnly: false, changed: [] };
  if (state === 'CLOSED') return fail(`PR ${a.pr} is closed without being merged`);
  // Only the PR's own branch may be moved: a fast-forward or merge on any other checkout would
  // rewrite the wrong branch (record-files merge-base-in refuses the same way).
  const cur = gitRun(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!cur.ok || cur.out !== a.branch) return fail(`current branch is ${cur.out || 'unknown'}, not ${a.branch}`);

  const f = gitRun(['fetch', 'origin', `+refs/heads/${a.branch}:refs/remotes/origin/${a.branch}`, `+refs/heads/${a.base}:refs/remotes/origin/${a.base}`], cwd);
  if (!f.ok) return fail(`could not fetch origin ${a.branch} and ${a.base}: ${f.err}`);
  const tipR = gitRun(['rev-parse', '--verify', `refs/remotes/origin/${a.branch}^{commit}`], cwd);
  if (!tipR.ok) return fail(`origin/${a.branch} does not name a commit`);
  const tip = tipR.out;
  const localR = gitRun(['rev-parse', '--verify', 'HEAD'], cwd);
  if (!localR.ok) return fail('could not read local HEAD');
  const local = localR.out;

  let sync = 'none';
  // Local strictly ahead of the tip (this run's own commit whose push has not landed yet, e.g. a
  // merge-in whose push failed before a resume): origin has not moved, there is nothing to catch
  // up with, and it is not two writers. Custody's local-versus-head check still guards the merge.
  if (local !== tip && !gitRun(['merge-base', '--is-ancestor', tip, local], cwd).ok) {
    if (gitRun(['merge-base', '--is-ancestor', local, tip], cwd).ok) {
      const ff = gitRun(['merge', '--ff-only', tip], cwd);
      if (!ff.ok) return fail(`could not fast-forward to ${tip}: ${ff.err}`);
      sync = 'fast-forward';
    } else {
      // Three-dot: what local changed since it left the tip's history.
      const own = gitRun(['diff', '--name-only', '--no-renames', `${tip}...HEAD`], cwd);
      const ownPaths = own.ok ? names(own.out) : null;
      const bad = ownPaths ? ownPaths.filter((p) => !isRecordFile(p)) : null;
      if (!ownPaths || bad.length > 0) {
        const commits = names(gitRun(['rev-list', '--oneline', `${tip}..HEAD`], cwd).out).join('; ');
        return fail(`local branch has commits that are not on origin/${a.branch} and change non-record files${bad ? ` (${bad.join(', ')})` : ''}: ${commits}. Two writers on one branch is a conflict, not a moved head: push or rebase them yourself`);
      }
      const m = gitRun(['merge', '--no-ff', '--no-edit', tip], cwd);
      if (!m.ok) {
        gitRun(['merge', '--abort'], cwd);
        return fail(`merging origin/${a.branch} into the local record-file commits conflicted; the merge was aborted: ${m.err}`);
      }
      sync = 'merged';
    }
  }

  // Compare full ids: an abbreviated or upper-case --judged naming the tip is not a move.
  // Unresolvable (or `none`) is unknown, and unknown means wait.
  const j = a.judged === 'none' ? null : gitRun(['rev-parse', '--verify', '--quiet', `${a.judged}^{commit}`], cwd);
  const judgedFull = j && j.ok ? j.out : null;
  const moved = tip !== judgedFull;
  let baseOnly = false;
  let changed = [];
  if (moved && judgedFull) {
    const fc = featureChanges(judgedFull, tip, a.base, cwd);
    if (fc) {
      changed = fc;
      baseOnly = fc.length === 0;
    }
  }
  return { ok: true, head: tip, judged: judgedIn, moved, sync, baseOnly, changed };
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv) {
  const emit = (o) => {
    process.stdout.write(JSON.stringify(o) + '\n');
    return 0;
  };
  if (argv[0] === 'decide') return emit(decide({ pr: flag(argv, '--pr') }));
  if (argv[0] === 'sync-head') {
    return emit(syncHead({ pr: flag(argv, '--pr'), branch: flag(argv, '--branch'), base: flag(argv, '--base'), judged: flag(argv, '--judged'), trd: flag(argv, '--trd') }));
  }
  return emit({ ok: false, action: 'refused', reason: USAGE });
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { decide, syncHead, main };
