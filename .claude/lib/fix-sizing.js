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
 * @param {'defect'|'change'|'refactor'} [input.kind]
 *        WHAT KIND OF WORK THIS IS. Axes that cannot apply are not consulted:
 *          defect   — root cause and reproducibility both apply
 *          change   — neither applies; the outcome statement carries the weight
 *          refactor — neither applies, AND coverage becomes mandatory (below)
 *        Defaults to `defect`, the strictest reading, so an omitted kind cannot
 *        buy a laxer verdict.
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
    kind = 'defect',
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
  const remedies = [];
  let tier = 'AUTO';

  // Every drop carries what would LIFT it. A gate that says only "no" is a cage;
  // one that says "no, because X, and here is what changes X" is a guide rail —
  // and the owner stays in control, because every remedy is something they decide
  // to do or not. Added 2026-08-23 on the owner's rule: determinism, not at the
  // expense of flexibility.
  const drop = (to, why, remedy) => {
    tier = lower(tier, to);
    reasons.push(why);
    if (remedy) remedies.push(remedy);
  };

  // ---- ESCALATE: not light-path work at all -------------------------------
  if (taskCount > MAX_TASKS) {
    drop('ESCALATE', `${taskCount} tasks exceeds the ${MAX_TASKS}-task light-path ceiling`,
      'split it into separate /fix runs, or use /create-prd if the parts are not independent');
  }
  if (!specCertain) {
    // The PRD boundary. "It should not 500" is certain; "what should it show
    // instead" may be a product decision, and deciding it here is exactly the
    // requirement-manufacturing the heavy path exists to prevent.
    drop('ESCALATE', 'the correct behaviour is not settled — this is a product decision, not a defect',
      'if the correct behaviour IS decided and you can state it, say so and re-run — otherwise /create-prd');
  }
  if (touches.length > maxFiles) {
    drop('ESCALATE', `${touches.length} files touched exceeds the ${maxFiles}-file ceiling`,
      'narrow the change, or use /create-prd');
  }

  // ---- REVIEW: light path is right, but a human approves ------------------
  // Root cause and reproducibility are DEFECT axes. A refactor fixes nothing, so
  // it has no root cause to demonstrate and nothing to reproduce; a change has an
  // outcome rather than a mechanism. Scoring those two against work they cannot
  // describe capped every refactor at REVIEW no matter how safe — measured
  // 2026-08-23 on a one-file, fully-covered, four-caller extraction.
  if (kind === 'defect') {
    if (rootCause !== 'demonstrated') {
      drop('REVIEW', 'root cause is inferred, not demonstrated — the fix rests on a reading of the code',
        'isolate the mechanism with the reproduction and re-run — or accept REVIEW and read the TRD yourself');
    }
    if (!reproducible) {
      // Hard rule for a defect: cannot be verified fixed, so cannot be fixed unattended.
      drop('REVIEW', 'not reproducible — nothing could confirm the fix worked',
        'if you can reproduce it, record the steps in ## Reproduction and re-run');
    }
  }
  if (criteriaCount === 0) {
    // Hard rule, and the one that covers conversational changes: the success
    // definition derived nothing checkable, so the verification loop would run
    // against an empty criteria set and pass vacuously.
    drop('REVIEW', 'the success definition derived zero criteria — nothing would verify this',
      'state one outcome that could be checked, however small, and re-run');
  }
  if (callers > maxCallers) {
    drop('REVIEW', `${callers} callers of the changed symbols — blast radius is not contained`,
      'narrow the change, or accept REVIEW and run /implement-trd yourself');
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
  if (kind === 'refactor') {
    // STRICTER for a refactor, not laxer, and this is the point of separating the
    // kinds. A refactor's whole claim is "behaviour is unchanged", and the only
    // evidence for that is a test suite that passed BEFORE and still passes after.
    //
    // `addsCoverage` must NOT rescue it: tests written as part of the refactor are
    // written against the NEW structure, so they cannot witness that the OLD
    // behaviour survived. Refactoring untested code is exactly the case a human
    // should see.
    if (!covered) {
      drop('REVIEW', 'refactoring code with no existing tests — nothing witnesses that behaviour was preserved, and tests added by this change would only describe the new structure',
        'land tests for the CURRENT behaviour first as a separate /fix (kind: change, where addsCoverage counts), then re-run this one');
    }
  } else if (!covered && !addsCoverage) {
    drop('REVIEW', 'the touched files carry no tests and this change adds none — a regression would not be caught',
      'add a task that writes the test and pass addsCoverage: true, or accept REVIEW');
  }

  const hit = matchNeverUnattended(touches, neverUnattended);
  if (hit.length > 0) {
    drop('REVIEW', `touches an owner-designated never-unattended path: ${hit.join(', ')}`,
      'your own policy in verification.md — run /implement-trd yourself when you are satisfied');
  }

  if (reasons.length === 0) reasons.push('all axes clear');

  return {
    tier,
    reasons,
    // Never empty when a tier was lowered: whatever the gate says no to, it says
    // how to change the answer. The owner decides whether any of it is worth doing.
    remedies,
    axes: {
      kind,
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
