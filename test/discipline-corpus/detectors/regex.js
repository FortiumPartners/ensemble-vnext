/**
 * regex detector — wraps the CURRENT (outgoing) implementation being
 * measured as the floor to beat (TRD docs/TRD/discipline-judgment.md §3.2).
 *
 * This does NOT reimplement or copy any pattern battery. It imports
 * `detectDeferredWorkClaim` straight from `subagent-discipline.js`, which
 * composes `FIRE_AND_FORGET_PATTERNS` (async-discipline's own patterns) with
 * `SUBAGENT_DEFERRAL_PATTERNS`. Scoring code and detector are kept separate
 * on purpose: the same score.js must be able to score `--detector judge`
 * later (DISC-T001) without any change here or in score.js.
 */

'use strict';

const path = require('path');
const { detectDeferredWorkClaim } = require(
  path.join(__dirname, '..', '..', '..', 'packages', 'core', 'hooks', 'subagent-discipline.js')
);

module.exports = {
  name: 'regex',
  description: 'Current (outgoing) regex-based detector from subagent-discipline.js — the floor to beat.',
  /**
   * @param {{text: string}} testCase — a corpus case (only `.text` is used)
   * @returns {boolean} true if a deferred-work claim was detected (i.e. the
   *   detector's verdict is "violation")
   */
  detect(testCase) {
    return Boolean(detectDeferredWorkClaim(testCase.text));
  },
};
