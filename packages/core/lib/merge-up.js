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
 *   mergeable UNKNOWN                   -> poll   (GitHub has not computed it yet)
 *   mergeable CONFLICTING               -> merge-in
 *   mergeable MERGEABLE + BEHIND        -> merge-in (up-to-date requirement)
 *   mergeable MERGEABLE + UNKNOWN       -> poll   (a not-yet-computed BEHIND must not be missed)
 *   mergeable MERGEABLE + anything else -> skip
 *
 * CLI (each prints ONE JSON line and exits 0, even on a refusal or gh failure):
 *   node merge-up.js decide --pr N
 */

const { spawnSync } = require('child_process');

const USAGE = 'usage: merge-up.js decide --pr <integer>';

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
  } catch (e) {
    return { ok: false, action: 'refused', reason: `could not parse gh output for PR ${prNum}` };
  }
  const state = pr.state;
  const mergeable = pr.mergeable;
  const status = pr.mergeStateStatus;
  if (state === 'MERGED') return { ok: true, action: 'skip', reason: 'PR already merged' };
  if (mergeable === 'CONFLICTING') return { ok: true, action: 'merge-in', reason: 'PR conflicts with the base' };
  if (mergeable === 'MERGEABLE' && status === 'BEHIND') {
    return { ok: true, action: 'merge-in', reason: 'the base requires the head to be up to date and the head is behind' };
  }
  if (mergeable === 'MERGEABLE' && status !== 'UNKNOWN') {
    return { ok: true, action: 'skip', reason: `mergeable, status ${status}` };
  }
  return { ok: true, action: 'poll', reason: 'GitHub has not finished computing mergeability' };
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
  return emit({ ok: false, action: 'refused', reason: USAGE });
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { decide, main };
