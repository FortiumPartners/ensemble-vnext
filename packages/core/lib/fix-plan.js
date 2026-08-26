'use strict';
/**
 * fix-plan.js — what `/fix` DOES, once the tier is known.
 *
 * WHY THIS EXISTS. Across three test rounds, ~16 of ~16 defects found in /fix were
 * in its prose, and none in its libs. The largest single cluster was one decision
 * — "tier + flags -> what happens next" — expressed inconsistently in FIVE places:
 *
 *   Step 3.2's verdict table said AUTO chains, unconditionally (--spec-only ignored)
 *   Step 4 keyed the state-pointer write on the TIER, when its own stated reason
 *     was whether WORK BEGINS — so an AUTO --spec-only run wrote a pointer for work
 *     that deliberately starts nothing
 *   Step 6's headings were the only place --spec-only was handled
 *   The output-discipline section resolved it only by inference, on the word "chained"
 *   notify-complete.sh carried no guard at all, so a chained run signalled webhooks
 *     "complete" at the moment the work BEGAN
 *
 * Every one of those is the same table, written five times. Prose cannot hold a
 * five-way consistency invariant; a function can, and a test can pin it.
 *
 * The judgment half of /fix — investigating, root-causing, grounding, deciding
 * whether a criterion is checkable — stays prose, because it is judgment. This is
 * only the mechanical half.
 */

/** Which TRD section carries the success definition, per kind of work. */
const VERIFICATION_SECTION = {
  defect: '## Reproduction',
  change: '## Intended Change',
  refactor: '## Behaviour Preserved',
};

/**
 * @param {Object} input
 * @param {'AUTO'|'REVIEW'|'ESCALATE'} input.tier   from fix-sizing.size()
 * @param {boolean} [input.implement]               --implement was passed. DEFAULT FALSE:
 *   /investigate investigates and stops. Chaining into work is an explicit request, not a
 *   consequence of the tier being clean. The tier answers "may this be done unattended?";
 *   the flag answers "do you want it done?" Collapsing the two is what made --spec-only
 *   feel like a workaround — it was intent smuggled in as a negation.
 * @param {boolean} [input.specOnly]                DEPRECATED alias. `specOnly: true` is
 *   now the default and means nothing; it is still accepted so existing callers and the
 *   command's own older prose do not break. Ignored when `implement` is given.
 * @param {'defect'|'change'|'refactor'} [input.kind]
 * @param {string} [input.slug]                     for the chain argument
 * @returns {Object} the run plan
 */
function plan(input) {
  const { tier, implement = false, kind = 'defect', slug = '<slug>' } = input || {};
  if (!['AUTO', 'REVIEW', 'ESCALATE'].includes(tier)) {
    throw new Error(`fix-plan: unknown tier ${JSON.stringify(tier)}`);
  }

  // ESCALATE stops BEFORE writing anything: it is not light-path work, so a light
  // TRD would be a wrong artifact rather than an incomplete one.
  if (tier === 'ESCALATE') {
    return finish({
      writeTrd: false, reason: 'not light-path work — use /create-prd', kind, slug,
    });
  }

  // The one condition that matters, and the one the prose kept re-deriving:
  // does work actually BEGIN? Only then does a state pointer or a chain make sense.
  const workBegins = tier === 'AUTO' && implement;

  if (!workBegins) {
    return finish({
      writeTrd: true,
      reason: tier === 'AUTO'
        // There is no failing axis here — every axis passed, and stopping is simply
        // what this command does unless asked otherwise. Inventing a failing axis
        // would report a downgrade the sizing lib never made.
        ? 'investigation complete — re-run with --implement to build it'
        : 'tier REVIEW — a human approves before implementing',
      kind, slug,
    });
  }

  return {
    writeTrd: true,
    writePointer: true,
    chain: true,
    chainSkill: 'implement-trd',
    // --verify is not optional: re-running the recorded criterion IS the acceptance
    // check. Without it the run asserts "done" on a suite that also passed before.
    chainArgs: `docs/TRD/${slug}.md --verify`,
    handoffLine: `[STATUS: /fix] HANDOFF → TRD authored, tier AUTO, chaining to /implement-trd`,
    // NO banner and NO notify on a chained run. command-status.md: nothing may
    // follow COMMAND COMPLETE, and /implement-trd emits the run's terminator.
    // notify-complete.sh must fire exactly once at real completion, never at
    // dispatch — here the work is only beginning.
    banner: null,
    bannerBody: null,
    notify: false,
    verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
  };
}

/** Every path that ENDS the command: banner, notify, no chain, no pointer. */
function finish({ writeTrd, reason, kind, slug }) {
  return {
    writeTrd,
    writePointer: false,
    chain: false,
    chainSkill: null,
    chainArgs: null,
    handoffLine: null,
    banner: '═══ COMMAND COMPLETE: /fix ═══',
    bannerBody: writeTrd
      ? `${slug}: ${reason}. TRD at docs/TRD/${slug}.md. Run /implement-trd --verify when satisfied.`
      : `${slug}: ${reason}.`,
    // Fires on EVERY terminating path, including the early reject — otherwise the
    // completion signal depends on which way the command happened to finish.
    notify: true,
    verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
  };
}

module.exports = { plan, VERIFICATION_SECTION };
