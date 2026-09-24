'use strict';
/**
 * fix-sizing.js — match a set of touched files against the owner's
 * never-unattended policy.
 *
 * This module used to own the whole "may a `/fix` run unattended" verdict — a
 * tier ladder (AUTO / REVIEW / ESCALATE) driven by task and file ceilings, root
 * cause, coverage, and blast radius. That decision moved to `plan-weight.js`,
 * whose `route()` takes a single boolean and no count of any kind (see
 * `docs/TRD/plan-weight-router.md` §1.2 D2/D9). What survives here is the one
 * piece nothing replaced: matching touched files against owner-governed
 * never-unattended paths is policy an owner writes in `verification.md`, not a
 * weight, and it still has to live somewhere callable.
 */

/**
 * Owner-governed paths that force a human into the loop no matter how small the
 * diff — auth, payments, migrations, secrets, deletion. Substring match on the
 * path, deliberately: an owner writing "auth" means anything under it, and a
 * rule that needs a correct glob to protect a credential path is a rule that
 * will one day fail open.
 */
function matchNeverUnattended(touches, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];
  const hits = new Set();
  for (const file of touches) {
    for (const pat of patterns) {
      if (pat && String(file).includes(pat)) hits.add(file);
    }
  }
  return [...hits];
}

module.exports = { matchNeverUnattended };
