'use strict';
/**
 * plan-weight.js — the two axes, once `/plan` has decided the work is not `feature`.
 *
 * WHY THIS IS A MODULE AND NOT PROSE: `/plan` replaces the retired single tier ladder with
 * two independent axes — `kind` (what kind of change) and `weight` (how much verification
 * it earns). Nine cells fall out of crossing them, and this module is the ONLY place that
 * mapping exists. `fix-sizing.js`'s header records what happens when a decision like this
 * one is instead expressed in prose scattered across a command file: the same table written
 * five times, disagreeing with itself. This module holds it once, and pins it with tests.
 *
 * NG10 (TRD non-goal): none of the nine cells gets its own name, here or anywhere else. The
 * axes are named; the cells are not. Nothing this module exports is keyed by a cell.
 *
 * `route()`'s job is narrower still: the one content-based question of whether a PRD would
 * hold anything a TRD would not (AC-F4.1, AC-F4.2). It takes no count of any kind — there is
 * nowhere in its input shape to put a task count or a touched-file count, which is what
 * makes "the sizing ceiling no longer participates in this decision" a structural fact
 * rather than a promise kept by convention.
 */

const { VERIFICATION_SECTION } = require('./fix-plan');

/** The `kind` axis: what sort of change this is. */
const KINDS = ['defect', 'change', 'refactor'];

/** The `weight` axis: how much verification the work earns. */
const WEIGHTS = ['trivial', 'small', 'medium'];

/** The two outcomes `route()` can return. */
const ROUTES = ['plan', 'prd'];

/**
 * `kind` and `weight` are validated the same way, so the message-shaping lives once.
 *
 * @param {string} axisName   'kind' or 'weight', for the error message
 * @param {string[]} values   the accepted values for this axis
 * @param {*} value           what was passed
 * @param {boolean} required  when false (kind only), an undefined value is left alone —
 *   the caller applies its own default. weight is always required: a silent default would
 *   pick a pipeline shape nobody chose.
 */
function assertAxis(axisName, values, value, required) {
  if (value === undefined && !required) {
    return;
  }
  if (value === 'feature') {
    throw new Error(
      `plan-weight: 'feature' is not a ${axisName} — it is a routing outcome, not an axis value. ` +
        `See route({ prdWouldHaveContent: true }).`
    );
  }
  if (!values.includes(value)) {
    throw new Error(
      `plan-weight: unknown ${axisName} ${JSON.stringify(value)} — expected one of ${values.join(', ')}`
    );
  }
}

/**
 * The whole nine-cell grid, computed from two axes. No cell is named.
 *
 * The stage list varies only with `weight` — `kind` is validated but does not change which
 * stages run, only (via `verification()`) how they're checked. The superset relation is the
 * invariant that matters: set(trivial) ⊂ set(small) ⊂ set(medium), independent of order.
 *
 * @param {Object} input
 * @param {'defect'|'change'|'refactor'} [input.kind]   defaults to 'defect'
 * @param {'trivial'|'small'|'medium'} input.weight      REQUIRED — no default
 * @returns {{stages: string[], trdFormat: 'light'|'phased'}}
 */
function stages(input) {
  const { kind = 'defect', weight } = input || {};
  assertAxis('kind', KINDS, kind, false);
  assertAxis('weight', WEIGHTS, weight, true);

  if (weight === 'trivial') {
    return { stages: ['investigate', 'author-trd', 'implement'], trdFormat: 'light' };
  }
  if (weight === 'small') {
    return { stages: ['investigate', 'author-trd', 'adversarial', 'implement'], trdFormat: 'light' };
  }
  // medium — small's list plus ground and audit (AC-F2.3, D4). 'audit' appears in no
  // stage list except this one (AC-F2.5).
  return {
    stages: ['investigate', 'author-trd', 'ground', 'adversarial', 'audit', 'implement'],
    trdFormat: 'phased',
  };
}

/**
 * The kind-specific verification shape for one cell.
 *
 * NOTE on `beforeRun`/`afterRun`/`surfaceCheck` at `refactor`: an earlier draft of this TRD
 * assumed `beforeRun` held at every weight for a refactor. Owner decision on OQ-T3
 * (TRD changelog 1.1.0) went the other way and is what AC-F3.5 states: a refactor at
 * `trivial` or `small` gets NO before-run, after-run, or public-surface check at all —
 * `## Behaviour Preserved` is required only at `medium`. This implementation follows
 * AC-F3.5, the later and more specific source; the stale sentence in TRD §3.1's Behavior
 * bullets was flagged as stale-grounding rather than followed silently.
 *
 * @param {Object} input
 * @param {'defect'|'change'|'refactor'} [input.kind]   defaults to 'defect'
 * @param {'trivial'|'small'|'medium'} input.weight      REQUIRED — no default
 * @param {number} input.openQuestionCount
 * @returns {{
 *   section: string,
 *   rootCauseRequired: boolean,
 *   beforeRun: boolean,
 *   afterRun: boolean,
 *   surfaceCheck: boolean,
 *   beforeRunForbidden: boolean,
 *   refineTrdRecommended: boolean,
 * }}
 */
function verification(input) {
  const { kind = 'defect', weight, openQuestionCount = 0 } = input || {};
  assertAxis('kind', KINDS, kind, false);
  assertAxis('weight', WEIGHTS, weight, true);

  const isRefactorAtMedium = kind === 'refactor' && weight === 'medium';

  return {
    // Reused from fix-plan.js, never redefined — the exact failure mode fix-plan.js's own
    // header documents (one decision expressed in five disagreeing places).
    section: VERIFICATION_SECTION[kind],
    rootCauseRequired: kind === 'defect', // AC-F3.4: a refactor is never asked for one
    beforeRun: isRefactorAtMedium, // AC-F3.1, AC-F3.5 (OQ-T3)
    afterRun: isRefactorAtMedium, // AC-F3.1
    surfaceCheck: isRefactorAtMedium, // AC-F3.2
    beforeRunForbidden: kind === 'change', // AC-F3.3: a change is never asked for one
    refineTrdRecommended: kind === 'change' && weight === 'medium' && openQuestionCount > 0, // AC-F6.3
  };
}

/**
 * The exit test. ONE input, content only — no task count, no touched-file count, no tier.
 * `openQuestionCount` is deliberately not a parameter: the presence of an open question
 * must not by itself route work to /create-prd (AC-F6.1).
 *
 * @param {Object} input
 * @param {boolean} input.prdWouldHaveContent
 * @returns {'plan'|'prd'}
 */
function route(input) {
  const { prdWouldHaveContent } = input || {};
  return prdWouldHaveContent ? 'prd' : 'plan';
}

module.exports = { KINDS, WEIGHTS, ROUTES, stages, verification, route };
