'use strict';
const { plan, VERIFICATION_SECTION } = require('./fix-plan');

const P = (over = {}) => plan({ tier: 'AUTO', kind: 'defect', slug: 'demo', ...over });

describe('fix-plan: the invariant that prose kept breaking', () => {
  // Each of these pins one of round 3's defects, where the same table was written
  // in five places and disagreed with itself.

  test('a pointer is written IFF work actually begins', () => {
    // Was keyed on tier === AUTO, which wrote a pointer on an AUTO --spec-only run
    // — a run that deliberately starts nothing.
    expect(P({ tier: 'AUTO', specOnly: false }).writePointer).toBe(true);
    expect(P({ tier: 'AUTO', specOnly: true }).writePointer).toBe(false);
    expect(P({ tier: 'REVIEW' }).writePointer).toBe(false);
    expect(P({ tier: 'ESCALATE' }).writePointer).toBe(false);
  });

  test('chaining and the banner are mutually exclusive', () => {
    // command-status.md: nothing may follow COMMAND COMPLETE. A chained run must
    // emit no banner, because implement-trd's is the terminator.
    for (const tier of ['AUTO', 'REVIEW', 'ESCALATE']) {
      for (const specOnly of [false, true]) {
        const p = P({ tier, specOnly });
        expect(p.chain && p.banner !== null).toBe(false);
        expect(p.chain || p.banner !== null).toBe(true); // exactly one, never neither
      }
    }
  });

  test('the completion signal never fires at handoff', () => {
    // notify-complete.sh signals webhooks/queues. On a chained run the work is
    // BEGINNING — command-status.md Path B requires exactly-once at real completion.
    expect(P({ tier: 'AUTO', specOnly: false }).notify).toBe(false);
  });

  test('the completion signal fires on EVERY terminating path', () => {
    // Including the early reject, which previously ended the command silently.
    expect(P({ tier: 'AUTO', specOnly: true }).notify).toBe(true);
    expect(P({ tier: 'REVIEW' }).notify).toBe(true);
    expect(P({ tier: 'ESCALATE' }).notify).toBe(true);
  });

  test('--spec-only never chains, at any tier', () => {
    for (const tier of ['AUTO', 'REVIEW', 'ESCALATE']) {
      expect(P({ tier, specOnly: true }).chain).toBe(false);
    }
  });

  test('AUTO + --spec-only reports the FLAG, never an invented failing axis', () => {
    // Every axis passed; claiming a failing one would report a downgrade the
    // sizing lib never returned.
    expect(P({ tier: 'AUTO', specOnly: true }).bannerBody).toMatch(/stopped at --spec-only/);
    expect(P({ tier: 'AUTO', specOnly: true }).bannerBody).not.toMatch(/axis/);
  });

  test('ESCALATE writes no TRD — a light TRD would be the wrong artifact', () => {
    const p = P({ tier: 'ESCALATE' });
    expect(p.writeTrd).toBe(false);
    expect(p.bannerBody).toMatch(/create-prd/);
  });

  test('a chained run always carries --verify', () => {
    expect(P({ tier: 'AUTO', specOnly: false }).chainArgs).toMatch(/--verify$/);
  });

  test('the handoff line does not imply a phase 2 of /fix', () => {
    expect(P({ tier: 'AUTO', specOnly: false }).handoffLine).toMatch(/HANDOFF/);
    expect(P({ tier: 'AUTO', specOnly: false }).handoffLine).not.toMatch(/PHASE 1\/2/);
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
