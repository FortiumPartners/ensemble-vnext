'use strict';
const { plan, VERIFICATION_SECTION } = require('./fix-plan');

const P = (over = {}) => plan({ weight: 'trivial', route: 'plan', kind: 'defect', slug: 'demo', ...over });

describe('fix-plan: the invariant that prose kept breaking', () => {
  // Each of these pins one of round 3's defects, where the same table was written
  // in five places and disagreed with itself. Repointed for plan-weight-router:
  // tier (AUTO/REVIEW/ESCALATE) is gone, replaced by weight + route.

  test('a pointer is written IFF work actually begins', () => {
    // Was keyed on tier === AUTO, which wrote a pointer on an AUTO --spec-only run
    // — a run that deliberately starts nothing. Now: implement is the only thing
    // that starts work, at every weight.
    expect(P({ implement: true }).writePointer).toBe(true);
    expect(P({ implement: false }).writePointer).toBe(false);
    for (const weight of ['trivial', 'small', 'medium']) {
      expect(P({ weight, implement: false }).writePointer).toBe(false);
    }
  });

  test('chaining and the banner are mutually exclusive', () => {
    // command-status.md: nothing may follow COMMAND COMPLETE. A chained run must
    // emit no banner, because the chained-to command's is the terminator.
    for (const weight of ['trivial', 'small', 'medium']) {
      for (const implement of [false, true]) {
        const p = P({ weight, implement });
        expect(p.chain && p.banner !== null).toBe(false);
        expect(p.chain || p.banner !== null).toBe(true); // exactly one, never neither
      }
    }
    // route: 'prd' also chains, at any weight, regardless of --implement.
    for (const weight of ['trivial', 'small', 'medium']) {
      const p = P({ weight, route: 'prd' });
      expect(p.chain).toBe(true);
      expect(p.banner).toBe(null);
    }
  });

  test('the completion signal never fires at handoff', () => {
    // notify-complete.sh signals webhooks/queues. On a chained run the work is
    // BEGINNING — command-status.md Path B requires exactly-once at real completion.
    expect(P({ implement: true }).notify).toBe(false);
    expect(P({ route: 'prd' }).notify).toBe(false);
  });

  test('the completion signal fires on EVERY terminating path', () => {
    // Including the early reject, which previously ended the command silently.
    expect(P({ implement: false }).notify).toBe(true);
    expect(P({ neverUnattendedHit: ['auth/'] }).notify).toBe(true);
  });

  test('--implement not passed never chains, at any weight', () => {
    for (const weight of ['trivial', 'small', 'medium']) {
      expect(P({ weight, implement: false }).chain).toBe(false);
    }
  });

  test('no --implement reports the FLAG, never an invented failing axis', () => {
    // Nothing about weight or route blocked this; claiming a failing one would
    // report a downgrade nothing computed.
    expect(P({ implement: false }).bannerBody).toMatch(/re-run with --implement/);
    expect(P({ implement: false }).bannerBody).not.toMatch(/axis/);
  });

  test('a chained implement run always carries --verify', () => {
    expect(P({ implement: true }).chainArgs).toMatch(/--verify$/);
  });

  test('the handoff line names the run correctly', () => {
    expect(P({ implement: true }).handoffLine).toMatch(/HANDOFF/);
    expect(P({ implement: true }).handoffLine).not.toMatch(/PHASE 1\/2/);
  });
});

describe('fix-plan: workBegins is identical across weights (AC-F5.1/AC-F5.2)', () => {
  test('workBegins depends only on implement and neverUnattendedHit, never on weight', () => {
    for (const implement of [false, true]) {
      const results = ['trivial', 'small', 'medium'].map(
        (weight) => P({ weight, implement }).writePointer // writePointer mirrors workBegins
      );
      expect(new Set(results).size).toBe(1);
    }
  });

  test('a non-empty neverUnattendedHit suppresses the chain at every weight, even with --implement', () => {
    for (const weight of ['trivial', 'small', 'medium']) {
      const r = P({ weight, implement: true, neverUnattendedHit: ['secrets/'] });
      expect(r.chain).toBe(false);
      expect(r.writePointer).toBe(false);
    }
  });

  test('the neverUnattendedHit reason names the matched paths', () => {
    const r = P({ implement: true, neverUnattendedHit: ['auth/login.js', 'secrets/vault.js'] });
    expect(r.bannerBody).toMatch(/auth\/login\.js/);
    expect(r.bannerBody).toMatch(/secrets\/vault\.js/);
  });
});

describe('fix-plan: route "prd" exits directly (D8, AC-F7.5, AC-F7.2)', () => {
  test('returns banner: null, notify: false, chainSkill: create-prd', () => {
    const r = P({ route: 'prd' });
    expect(r.banner).toBe(null);
    expect(r.notify).toBe(false);
    expect(r.chainSkill).toBe('create-prd');
  });

  test('chains unconditionally, regardless of --implement', () => {
    expect(P({ route: 'prd', implement: false }).chain).toBe(true);
    expect(P({ route: 'prd', implement: true }).chain).toBe(true);
  });

  test('chainArgs derives from slug, per §2.2.5 (docs/plan/<slug>.investigation.md)', () => {
    expect(P({ route: 'prd', slug: 'my-feature' }).chainArgs).toBe(
      'docs/plan/my-feature.investigation.md'
    );
  });

  test('writes no pointer', () => {
    expect(P({ route: 'prd' }).writePointer).toBe(false);
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
  test('an unknown weight throws rather than guessing', () => {
    expect(() => plan({ weight: 'maybe', route: 'plan' })).toThrow(/unknown weight/);
  });

  test('an unknown route throws rather than guessing', () => {
    expect(() => plan({ weight: 'trivial', route: 'nowhere' })).toThrow(/unknown route/);
  });

  test('no input throws', () => {
    expect(() => plan()).toThrow();
  });
});

describe('fix-plan: the two /fix strings are gone', () => {
  test('every runtime string produced by plan() names /plan, never /fix', () => {
    const seen = [];
    for (const weight of ['trivial', 'small', 'medium']) {
      for (const route of ['plan', 'prd']) {
        for (const implement of [false, true]) {
          const r = plan({ weight, route, implement, slug: 'demo' });
          seen.push(r.banner, r.bannerBody, r.handoffLine);
        }
      }
    }
    const text = seen.filter(Boolean).join('\n');
    expect(text).not.toMatch(/\/fix\b/);
    expect(text).toMatch(/COMMAND COMPLETE: \/plan/);
  });
});
