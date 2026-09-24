'use strict';
/**
 * fix-plan.js — what `/plan` DOES, once the weight and route are known.
 *
 * WHY THIS EXISTS. Across three test rounds, ~16 of ~16 defects found in the predecessor
 * command (`/fix`) were in its prose, and none in its libs. The largest single cluster was
 * one decision — "tier + flags -> what happens next" — expressed inconsistently in FIVE
 * places:
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
 * REPOINTED (plan-weight-router, PLAN-B002): the tier ladder (AUTO/REVIEW/ESCALATE) is
 * gone. `/plan` decides on two independent axes instead — `weight` (trivial/small/medium,
 * from plan-weight.js) and `route` ('plan'/'prd', also from plan-weight.js) — plus the
 * owner-governed `neverUnattendedHit` list from fix-sizing.js's matchNeverUnattended(). The
 * weight answers "how much machinery does this need"; it does NOT gate whether work may
 * begin unattended — that is `implement` (did the owner ask?) and `neverUnattendedHit`
 * (did the owner rule this path out?) alone. See TRD §3.2 for the full interface.
 *
 * The judgment half of `/plan` — investigating, root-causing, grounding, deciding
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
 * @param {'trivial'|'small'|'medium'} input.weight   from plan-weight.js's stages()
 * @param {'plan'|'prd'} input.route                  from plan-weight.js's route()
 * @param {boolean} [input.implement]                 --implement was passed. DEFAULT FALSE:
 *   /plan investigates and stops. Chaining into work is an explicit request, not a
 *   consequence of the weight being small. The weight answers "how much machinery does this
 *   need?"; the flag answers "do you want it done?" The weight is deliberately NOT part of
 *   workBegins — a unit test asserts workBegins is identical across all three weights for
 *   otherwise identical other inputs (AC-F5.1/AC-F5.2).
 * @param {'defect'|'change'|'refactor'} [input.kind]
 * @param {string} [input.slug]                       for the chain argument
 * @param {string[]} [input.neverUnattendedHit]        path fragments matched by
 *   fix-sizing.js's matchNeverUnattended() against this run's touches. Non-empty means the
 *   owner has ruled this path out for unattended work (O-NU) — this is a policy rule, not a
 *   weight outcome, so it suppresses the chain regardless of weight or route.
 * @returns {Object} the run plan
 */
function plan(input) {
  const {
    weight,
    route,
    implement = false,
    kind = 'defect',
    slug = '<slug>',
    neverUnattendedHit = [],
  } = input || {};

  if (!['trivial', 'small', 'medium'].includes(weight)) {
    throw new Error(`fix-plan: unknown weight ${JSON.stringify(weight)}`);
  }
  if (!['plan', 'prd'].includes(route)) {
    throw new Error(`fix-plan: unknown route ${JSON.stringify(route)}`);
  }

  // route: 'prd' exits the /plan feature entirely — the investigation found enough content
  // for a PRD, and /create-prd takes it from here (D8, AC-F7.5). This is not a stop-and-wait
  // path like the old ESCALATE: it chains immediately, same as the workBegins branch below,
  // and for the same reason — command-status.md: nothing may follow COMMAND COMPLETE, and
  // /create-prd emits the run's terminator, not /plan.
  if (route === 'prd') {
    return {
      writeTrd: false,
      writePointer: false,
      chain: true,
      chainSkill: 'create-prd',
      chainArgs: `docs/plan/${slug}.investigation.md`,
      handoffLine: `[STATUS: /plan] HANDOFF → investigation record complete, route prd, chaining to /create-prd`,
      banner: null,
      bannerBody: null,
      notify: false,
      verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
    };
  }

  // The owner's own policy overrides everything else: a path they have named as
  // never-unattended stops work regardless of weight, kind or how confidently --implement
  // was passed. The reason must name the matched paths so the run is legible, not just
  // refused (O-NU).
  if (neverUnattendedHit.length > 0) {
    return finish({
      writeTrd: true,
      reason: `owner policy — ${neverUnattendedHit.join(', ')} ${neverUnattendedHit.length === 1 ? 'is' : 'are'} marked never-unattended in verification.md; run /implement-trd yourself when you are satisfied`,
      kind,
      slug,
    });
  }

  // The one condition that matters, and the one the prose kept re-deriving: does work
  // actually BEGIN? Only then does a state pointer or a chain make sense. The weight is
  // deliberately NOT in this expression (AC-F5.1) — a unit test pins that workBegins is
  // identical across all three weights for otherwise identical input (AC-F5.2).
  const workBegins = implement === true && neverUnattendedHit.length === 0;

  if (!workBegins) {
    return finish({
      writeTrd: true,
      // There is no failing axis here — nothing about the weight or route blocked this;
      // stopping is simply what this command does unless asked otherwise. Inventing a
      // failing axis would report a downgrade nothing computed.
      reason: 'investigation complete — re-run with --implement to build it',
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
    handoffLine: `[STATUS: /plan] HANDOFF → TRD authored, chaining to /implement-trd`,
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
    banner: '═══ COMMAND COMPLETE: /plan ═══',
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
