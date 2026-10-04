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
 * @param {string|null} [input.neverUnattendedStatus] check-never-unattended's `status`;
 *   'invalid' (the §5b list could not be read) suppresses the chain even with empty hits.
 * @param {boolean} [input.sweepList]   a sweep list (`docs/plan/<slug>.sweep.md`) was written
 *   (plan-from-spec). The sweep must be built, verified and committed BEFORE the core TRD is
 *   built, so this path never writes the pointer. Without `implement` (or with a hit, or an
 *   `invalid` list) it does not chain and its banner gives the four ordered steps; with
 *   `implement` and an empty brake it returns the sweep chain (`chainSteps`, sequenced by
 *   sweepChainNext). Read only when true.
 * @param {boolean} [input.coreTrd]      with `sweepList`: whether a core TRD exists (default
 *   true). False means every criterion was swept — no TRD is kept and no `/implement-trd` step.
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
    neverUnattendedStatus = null,
    sweepList = false,
    coreTrd = true,
  } = input || {};

  if (!['trivial', 'small', 'medium'].includes(weight)) {
    throw new Error(`fix-plan: unknown weight ${JSON.stringify(weight)}`);
  }
  if (!['plan', 'prd'].includes(route)) {
    throw new Error(`fix-plan: unknown route ${JSON.stringify(route)}`);
  }

  // route: 'prd' exits the /plan feature entirely — the investigation found enough content
  // for a PRD, and /create-prd takes it from here (D8, AC-F7.5). This is not a stop-and-wait
  // path like the old ESCALATE: it chains immediately. Unlike the workBegins branch below,
  // the chained create-prd workflow emits no terminator, so /plan does.
  if (route === 'prd') {
    return {
      writeTrd: false,
      writePointer: false,
      chain: true,
      chainSkill: 'create-prd',
      chainArgs: `docs/plan/${slug}.investigation.md`,
      handoffLine: `[STATUS: /plan] HANDOFF → investigation record complete, route prd, chaining to /create-prd`,
      // The one chain that ends inside this command: the create-prd workflow prints no
      // terminator of its own, so /plan emits the run's single banner and signal here.
      banner: '═══ COMMAND COMPLETE: /plan ═══',
      bannerBody: `${slug}: investigation captured, PRD authored at docs/PRD/${slug}.md (unverified — run /audit-prd)`,
      notify: true,
      verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
    };
  }

  // The sweep path owns its own ending. Going through finish() would say "re-run with
  // --implement" and always report a TRD at docs/TRD/<slug>.md, both wrong here: the order is
  // sweep -> verify the sweep -> commit -> implement the core, and there may be no core TRD.
  if (sweepList === true) {
    return finishSweep({ coreTrd: coreTrd !== false, kind, slug, implement, neverUnattendedHit, neverUnattendedStatus });
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

  // An unreadable never-unattended list (check-never-unattended's `status: 'invalid'`) comes
  // back with EMPTY hits — matching against a list that could not be read finds nothing. It
  // must still stop the chain: an unreadable list is never "no brake".
  if (neverUnattendedStatus === 'invalid') {
    return finish({
      writeTrd: true,
      reason: 'owner policy — the never-unattended list in verification.md §5b could not be read, so nothing is built unattended; fix it (or run /verification-setup), then run /implement-trd yourself when you are satisfied',
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
    // Functional verification now runs by default (docs/TRD/verification-convergence.md
    // VCON-B009), so this explicit --verify is redundant, not wrong — it just states
    // out loud what the default flip already does. Left in place because a test pins
    // this literal string (fix-plan.test.js); changing it would be an untested behaviour
    // change smuggled into a comment fix.
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
      ? `${slug}: ${reason}. TRD at docs/TRD/${slug}.md. Run /implement-trd docs/TRD/${slug}.md when satisfied (functional verification runs by default).`
      : `${slug}: ${reason}.`,
    // Fires on EVERY terminating path, including the early reject — otherwise the
    // completion signal depends on which way the command happened to finish.
    notify: true,
    verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
  };
}

/**
 * The sweep path's ending (plan-from-spec): the sweep chain under `--implement` with an empty
 * brake; otherwise the ordered steps, and no chain.
 * `/sweep` never commits, and `/implement-trd` needs a clean tree and commits phases with
 * `git add -A`, so the owner commits the swept fixes between the two.
 */
function finishSweep({ coreTrd, kind, slug, implement, neverUnattendedHit, neverUnattendedStatus }) {
  const sweep = `docs/plan/${slug}.sweep.md`;

  // With --implement, an empty brake and a readable list, the sweep ending chains: `/plan`
  // runs the steps itself, deciding each with sweepChainNext(). chainSteps is a LOOKUP of
  // what each step runs, never an order — a fold-back can create a core TRD mid-run, which an
  // order fixed here could not follow. The run's banner and signal come from the last step.
  if (implement === true && neverUnattendedHit.length === 0 && neverUnattendedStatus !== 'invalid') {
    return {
      writeTrd: coreTrd,
      writePointer: false,
      chain: true,
      chainSkill: null,
      chainArgs: null,
      chainSteps: {
        sweep: { skill: 'sweep', args: `${sweep} --chained` },
        verify: { skill: 'verify-build', args: `${sweep} --chained` },
        implement: { skill: 'implement-trd', args: `docs/TRD/${slug}.md` },
      },
      handoffLine: `[STATUS: /plan] HANDOFF → investigation record complete, chaining the sweep, its verification and its commit${coreTrd ? ', then /implement-trd' : ''}`,
      banner: null,
      bannerBody: null,
      notify: false,
      verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
    };
  }
  const steps = [
    `/sweep ${sweep}`,
    `/verify-build ${sweep}`,
    'commit the swept fixes (/sweep never commits)',
  ];
  // Each step is one command and nothing else: NEXT puts a slash command in its own fence for a
  // one-tap copy, and prose inside it would be pasted as arguments.
  if (coreTrd) steps.push(`/implement-trd docs/TRD/${slug}.md`);

  let policy = '';
  if (coreTrd && neverUnattendedHit.length > 0) {
    policy = ` Owner policy: ${neverUnattendedHit.join(', ')} ${neverUnattendedHit.length === 1 ? 'is' : 'are'} marked never-unattended in verification.md, so nothing is built for you.`;
  } else if (neverUnattendedStatus === 'invalid') {
    // No `coreTrd &&` here: an unreadable list stops the chain with or without a core TRD,
    // so the stop must say why either way.
    policy = ' Owner policy: the never-unattended list in verification.md §5b could not be read, so nothing is built for you.';
  }

  const where = coreTrd ? `sweep list at ${sweep}, core TRD at docs/TRD/${slug}.md` : `sweep list at ${sweep}, no core TRD (every criterion is swept)`;
  return {
    writeTrd: coreTrd,
    writePointer: false,
    chain: false,
    chainSkill: null,
    chainArgs: null,
    handoffLine: null,
    banner: '═══ COMMAND COMPLETE: /plan ═══',
    bannerBody: `${slug}: investigation complete; ${where}. The sweep is built, verified and committed first. In order: ${steps.map((t, i) => `${i + 1}. ${t}`).join('; ')}${coreTrd ? ' (functional verification runs by default)' : ''}.${policy}`,
    notify: true,
    nextSteps: steps,
    verificationSection: VERIFICATION_SECTION[kind] || VERIFICATION_SECTION.defect,
  };
}

/** The keys sweepChainNext() reads; plan.md builds its call payload from this list. */
const SWEEP_CHAIN_INPUTS = [
  'after', 'slug', 'notSweepItems', 'overlap', 'sweepIdsLeft', 'verificationOutcome',
  'coreTrdExists', 'sweepNeverUnattendedHit', 'sweepNeverUnattendedStatus',
  'coreNeverUnattendedHit', 'coreNeverUnattendedStatus',
];

/**
 * The only sequencer of the chained sweep ending: given the step that just finished and what
 * it left on disk (values plan.md reads and passes in; this function touches no file), say what
 * runs next. Returns `{ action, ids? , banner, bannerBody, notify, notifyStatus }` where action
 * is 'fold-back' | 'verify' | 'commit' | 'implement' | 'stop'. Only a stop carries a banner.
 *
 * @param {Object} input
 * @param {'sweep'|'fold-back'|'verify'|'commit'} input.after   the step that just finished
 * @param {string} [input.slug]
 * @param {string[]} [input.notSweepItems]       sweep-result.json: ids that are not sweep items
 * @param {Object<string,string[]>} [input.overlap]  sweep-result.json: id -> overlapping files
 * @param {string[]} [input.sweepIdsLeft]        after a fold-back: sweep ids still in the sweep file
 * @param {string|null} [input.verificationOutcome]  null when this run wrote none (stale state)
 * @param {boolean} [input.coreTrdExists]        plan.md checked docs/TRD/<slug>.md just now
 * @param {string[]} [input.sweepNeverUnattendedHit]    §5b hits over the sweep's changed files
 * @param {string|null} [input.sweepNeverUnattendedStatus]
 * @param {string[]} [input.coreNeverUnattendedHit]     §5b hits over the core TRD's touches
 * @param {string|null} [input.coreNeverUnattendedStatus]
 */
function sweepChainNext(input) {
  const {
    after,
    slug = '<slug>',
    notSweepItems = [],
    overlap = {},
    sweepIdsLeft = [],
    verificationOutcome = null,
    coreTrdExists = false,
    sweepNeverUnattendedHit = [],
    sweepNeverUnattendedStatus = null,
    coreNeverUnattendedHit = [],
    coreNeverUnattendedStatus = null,
  } = input || {};

  const go = (action, extra = {}) => ({ action, banner: null, bannerBody: null, notify: false, notifyStatus: null, ...extra });
  const stop = (reason, done = false) => ({
    action: 'stop',
    banner: done ? '═══ COMMAND COMPLETE: /plan ═══' : '═══ COMMAND STUCK: /plan ═══',
    bannerBody: done ? `${slug}: ${reason}` : `Reason: ${reason}`,
    notify: true,
    notifyStatus: done ? 'complete' : 'stuck',
  });
  const sweepFile = `docs/plan/${slug}.sweep.md`;
  const coreTrdPath = `docs/TRD/${slug}.md`;
  // A stop leaves the remaining steps to the owner; name all of them, in order, so the swept
  // fixes are verified and committed before /implement-trd (whose `git add -A` phase commit
  // would otherwise take them in unverified).
  const thenImplement = coreTrdExists ? `, then run /implement-trd ${coreTrdPath}` : '';

  // Brake over the sweep's changed files, shared by every road into the commit.
  const sweepBrake = () => {
    if (sweepNeverUnattendedStatus === 'invalid') {
      return stop(`the never-unattended list in verification.md §5b could not be read, so the swept fixes in the working tree are not committed; fix the list, commit the swept fixes${thenImplement}`);
    }
    if (sweepNeverUnattendedHit.length > 0) {
      return stop(`the sweep edited ${sweepNeverUnattendedHit.join(', ')}, marked never-unattended in verification.md §5b; the fixes are left uncommitted in the working tree for you to review, commit${thenImplement}`);
    }
    return null;
  };

  switch (after) {
    case 'sweep': {
      const ids = [...new Set([...notSweepItems, ...Object.keys(overlap || {})])];
      return ids.length > 0 ? go('fold-back', { ids }) : go('verify');
    }
    case 'fold-back': {
      // The swept fixes are still uncommitted here (and unverified when sweep ids remain), so
      // a stop names those steps before /implement-trd, never /implement-trd alone.
      const pending = `the swept fixes are left uncommitted: ${sweepIdsLeft.length > 0 ? `run /verify-build ${sweepFile}, then ` : ''}commit them, then run /implement-trd ${coreTrdPath} yourself when you are satisfied`;
      if (coreNeverUnattendedStatus === 'invalid') {
        return stop(`the never-unattended list in verification.md §5b could not be read, so the folded-back core TRD is not built; ${pending}`);
      }
      if (coreNeverUnattendedHit.length > 0) {
        return stop(`the core TRD now touches ${coreNeverUnattendedHit.join(', ')}, marked never-unattended in verification.md §5b; ${pending}`);
      }
      if (sweepIdsLeft.length > 0) return go('verify');
      return sweepBrake() || go('commit');
    }
    case 'verify': {
      if (verificationOutcome !== 'satisfied') {
        return stop(`verifying ${sweepFile} ended ${verificationOutcome === null ? 'with no outcome recorded this run' : `'${verificationOutcome}'`}, not 'satisfied'; re-run /sweep ${sweepFile} then /verify-build ${sweepFile}, commit the swept fixes${thenImplement}`);
      }
      return sweepBrake() || go('commit');
    }
    case 'commit':
      return coreTrdExists
        ? go('implement')
        : stop(`every criterion was swept, verified and committed; no core TRD to build (sweep list at ${sweepFile})`, true);
    default:
      throw new Error(`fix-plan: unknown chain step ${JSON.stringify(after)}`);
  }
}

module.exports = { plan, sweepChainNext, SWEEP_CHAIN_INPUTS, VERIFICATION_SECTION };
