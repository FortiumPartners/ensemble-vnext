'use strict';
/**
 * fix-sizing.js — decide whether a `/fix` may run unattended.
 *
 * `/fix` collapses PRD+TRD into one lightweight pass for defects and small
 * changes. The thing that keeps that safe is not the size of the diff — it is
 * whether the change can be VERIFIED. This module owns that decision.
 *
 * WHY IT IS A MODULE AND NOT PROSE: the tier gates unattended code changes, so
 * it has to be consistent run to run and testable in isolation. The command
 * gathers the evidence (its greps are visible in the transcript, so it cannot
 * quietly invent a caller count); this module turns evidence into a verdict and
 * is the only place that mapping exists.
 *
 * TIERS
 *   AUTO      chain straight into /implement-trd, no human in the loop
 *   REVIEW    author the TRD, stop, let a human decide
 *   ESCALATE  not light-path work at all — /create-prd, or a human investigator
 *
 * The asymmetry is deliberate: every rule can only LOWER a tier. There is no
 * path by which accumulating weak positive signals produces AUTO.
 */

/** Task count above which this is not small work at all. */
const MAX_TASKS = 3;

/** Touched files above which "small" stops being true regardless of line count. */
const DEFAULT_MAX_FILES = 5;

/**
 * Callers of a changed symbol above which the blast radius is not contained.
 * A one-line change to a helper used in forty places is not a small change; it
 * is forty small changes wearing one diff.
 */
const DEFAULT_MAX_CALLERS = 20;

const TIERS = ['ESCALATE', 'REVIEW', 'AUTO'];

/** Lower of two tiers. Rules may only ever lower, never raise. */
function lower(a, b) {
  return TIERS[Math.min(TIERS.indexOf(a), TIERS.indexOf(b))];
}

/**
 * @param {Object} input
 * @param {number}  input.taskCount        tasks in the light TRD
 * @param {'demonstrated'|'inferred'} input.rootCause
 *        `demonstrated` = the repro was isolated to the mechanism ([ran]);
 *        `inferred` = read from the code and reasoned about ([inferred]).
 * @param {boolean} input.reproducible     a defect that reproduces on demand
 * @param {boolean} input.specCertain      the correct behaviour is known, not a product call
 * @param {number}  input.criteriaCount    rows the success definition derived
 * @param {string[]} input.touches         files the fix will change
 * @param {number}  input.callers          callers of the changed symbols
 * @param {boolean} input.covered          the touched files ALREADY carry tests
 * @param {boolean} [input.addsCoverage]   this change's own tasks add tests for them
 * @param {string[]} [input.neverUnattended] owner-governed path fragments
 * @param {Object}  [opts]
 * @returns {{tier: string, reasons: string[], axes: Object}}
 */
function size(input, opts = {}) {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxCallers = opts.maxCallers ?? DEFAULT_MAX_CALLERS;

  const {
    taskCount = 0,
    rootCause = 'inferred',
    reproducible = false,
    specCertain = false,
    criteriaCount = 0,
    touches = [],
    callers = 0,
    covered = false,
    addsCoverage = false,
    neverUnattended = [],
  } = input || {};

  const reasons = [];
  let tier = 'AUTO';

  const drop = (to, why) => {
    tier = lower(tier, to);
    reasons.push(why);
  };

  // ---- ESCALATE: not light-path work at all -------------------------------
  if (taskCount > MAX_TASKS) {
    drop('ESCALATE', `${taskCount} tasks exceeds the ${MAX_TASKS}-task light-path ceiling`);
  }
  if (!specCertain) {
    // The PRD boundary. "It should not 500" is certain; "what should it show
    // instead" may be a product decision, and deciding it here is exactly the
    // requirement-manufacturing the heavy path exists to prevent.
    drop('ESCALATE', 'the correct behaviour is not settled — this is a product decision, not a defect');
  }
  if (touches.length > maxFiles) {
    drop('ESCALATE', `${touches.length} files touched exceeds the ${maxFiles}-file ceiling`);
  }

  // ---- REVIEW: light path is right, but a human approves ------------------
  if (rootCause !== 'demonstrated') {
    drop('REVIEW', 'root cause is inferred, not demonstrated — the fix rests on a reading of the code');
  }
  if (!reproducible) {
    // Hard rule. Cannot be verified fixed, so it cannot be fixed unattended.
    drop('REVIEW', 'not reproducible — nothing could confirm the fix worked');
  }
  if (criteriaCount === 0) {
    // Hard rule, and the one that covers conversational changes: the success
    // definition derived nothing checkable, so the verification loop would run
    // against an empty criteria set and pass vacuously.
    drop('REVIEW', 'the success definition derived zero criteria — nothing would verify this');
  }
  if (callers > maxCallers) {
    drop('REVIEW', `${callers} callers of the changed symbols — blast radius is not contained`);
  }
  // The axis asks "would a regression be caught?" — and that is about the state
  // AFTER this change lands, not before it. A fix whose own tasks add the missing
  // test satisfies it: from the moment it lands, a regression IS caught.
  //
  // Blocking on the absence of a test the change itself creates measures the
  // wrong instant, and penalises exactly the fixes that improve coverage. Found
  // on the first live run (2026-08-22): a hook fix whose second task added that
  // hook's first-ever test was held at REVIEW for having no tests.
  //
  // The residual this does NOT cover — "did we break the old behaviour, which
  // nothing asserted?" — is real, and is deliberately left to the adversarial
  // audit, which can read the callers and say. A rule cannot judge that; a
  // reader can, and the audit's verdict can still lower this tier.
  if (!covered && !addsCoverage) {
    drop('REVIEW', 'the touched files carry no tests and this change adds none — a regression would not be caught');
  }

  const hit = matchNeverUnattended(touches, neverUnattended);
  if (hit.length > 0) {
    drop('REVIEW', `touches an owner-designated never-unattended path: ${hit.join(', ')}`);
  }

  if (reasons.length === 0) reasons.push('all axes clear');

  return {
    tier,
    reasons,
    axes: {
      rootCause,
      blastRadius: { files: touches.length, callers },
      regressionRisk: { covered, addsCoverage, reproducible },
      specCertainty: specCertain,
      criteriaCount,
      taskCount,
    },
  };
}

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

module.exports = { size, matchNeverUnattended, MAX_TASKS, DEFAULT_MAX_FILES, DEFAULT_MAX_CALLERS };
