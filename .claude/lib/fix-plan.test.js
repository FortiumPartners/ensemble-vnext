'use strict';
const { plan, VERIFICATION_SECTION } = require('./fix-plan');

const P = (over = {}) => plan({ tier: 'AUTO', kind: 'defect', slug: 'demo', ...over });

describe('fix-plan: the invariant that prose kept breaking', () => {
  // Each of these pins one of round 3's defects, where the same table was written
  // in five places and disagreed with itself.

  test('a pointer is written IFF work actually begins', () => {
    // Was keyed on tier === AUTO, which wrote a pointer on an AUTO --spec-only run
    // — a run that deliberately starts nothing.
    expect(P({ tier: 'AUTO', implement: true }).writePointer).toBe(true);
    expect(P({ tier: 'AUTO', implement: false }).writePointer).toBe(false);
    expect(P({ tier: 'REVIEW' }).writePointer).toBe(false);
    expect(P({ tier: 'ESCALATE' }).writePointer).toBe(false);
  });

  test('chaining and the banner are mutually exclusive', () => {
    // command-status.md: nothing may follow COMMAND COMPLETE. A chained run must
    // emit no banner, because implement-trd's is the terminator.
    for (const tier of ['AUTO', 'REVIEW', 'ESCALATE']) {
      for (const implement of [false, true]) {
        const p = P({ tier, implement });
        expect(p.chain && p.banner !== null).toBe(false);
        expect(p.chain || p.banner !== null).toBe(true); // exactly one, never neither
      }
    }
  });

  test('the completion signal never fires at handoff', () => {
    // notify-complete.sh signals webhooks/queues. On a chained run the work is
    // BEGINNING — command-status.md Path B requires exactly-once at real completion.
    expect(P({ tier: 'AUTO', implement: true }).notify).toBe(false);
  });

  test('the completion signal fires on EVERY terminating path', () => {
    // Including the early reject, which previously ended the command silently.
    expect(P({ tier: 'AUTO', implement: false }).notify).toBe(true);
    expect(P({ tier: 'REVIEW' }).notify).toBe(true);
    expect(P({ tier: 'ESCALATE' }).notify).toBe(true);
  });

  test('--spec-only never chains, at any tier', () => {
    for (const tier of ['AUTO', 'REVIEW', 'ESCALATE']) {
      expect(P({ tier, implement: false }).chain).toBe(false);
    }
  });

  test('AUTO + --spec-only reports the FLAG, never an invented failing axis', () => {
    // Every axis passed; claiming a failing one would report a downgrade the
    // sizing lib never returned.
    expect(P({ tier: 'AUTO', implement: false }).bannerBody).toMatch(/re-run with --implement/);
    expect(P({ tier: 'AUTO', implement: false }).bannerBody).not.toMatch(/axis/);
  });

  test('ESCALATE KEEPS the TRD, marked as investigation rather than plan', () => {
    // CHANGED 2026-08-29 (owner). It used to return writeTrd:false, so a run that had
    // reproduced the defect, found the root cause and grounded every touched file ended with
    // nothing on disk -- measured in lightning-lane-beta-phase2: "I deleted the TRD I'd
    // written... What it produced: Nothing." That investigation is exactly what /create-prd
    // needs as input, so discarding it means paying for it twice.
    const r = plan({ tier: 'ESCALATE', slug: 'demo' });
    expect(r.writeTrd).toBe(true);
    expect(r.escalated).toBe(true);
    // Kept, but must never read as an approved plan.
    expect(r.chain).toBe(false);
    expect(r.writePointer).toBe(false);
    expect(r.bannerBody).toMatch(/Do NOT run \/implement-trd/);
    expect(r.bannerBody).toMatch(/create-prd/);
  });

  test('a chained run always carries --verify', () => {
    expect(P({ tier: 'AUTO', implement: true }).chainArgs).toMatch(/--verify$/);
  });

  test('the handoff line does not imply a phase 2 of /fix', () => {
    expect(P({ tier: 'AUTO', implement: true }).handoffLine).toMatch(/HANDOFF/);
    expect(P({ tier: 'AUTO', implement: true }).handoffLine).not.toMatch(/PHASE 1\/2/);
  });
});

describe('fix-plan: verification source follows the kind of work', () => {
  test.each([
    ['defect', '## Reproduction'],
    ['change', '## Intended Change'],
    ['refactor', '## Behaviour Preserved'],
  ])('%s -> %s', (kind, section) => {
    expect(P({ kind }).verificationSection).toBe(section);
  });

  test('an unknown kind falls back to the defect section rather than undefined', () => {
    expect(P({ kind: 'nonsense' }).verificationSection).toBe(VERIFICATION_SECTION.defect);
  });
});

describe('fix-plan: refuses what it cannot plan', () => {
  test('an unknown tier throws rather than guessing', () => {
    expect(() => plan({ tier: 'MAYBE' })).toThrow(/unknown tier/);
  });

  test('no input throws', () => {
    expect(() => plan()).toThrow();
  });
});
