'use strict';
const { size, matchNeverUnattended, MAX_TASKS } = require('./fix-sizing');

/** A change that clears every axis. Each test degrades exactly one thing. */
const clean = () => ({
  taskCount: 2,
  rootCause: 'demonstrated',
  reproducible: true,
  specCertain: true,
  criteriaCount: 1,
  touches: ['src/session.ts'],
  callers: 3,
  covered: true,
  neverUnattended: [],
});

describe('fix-sizing: the clean case', () => {
  test('a demonstrated, reproducible, covered, checkable change is AUTO', () => {
    const r = size(clean());
    expect(r.tier).toBe('AUTO');
    expect(r.reasons).toEqual(['all axes clear']);
  });
});

describe('fix-sizing: hard rules that block AUTO', () => {
  // Each of these is a rule the design states as absolute. A regression here
  // means /fix could write code unattended with nothing checking it.
  test('non-reproducible is never AUTO', () => {
    expect(size({ ...clean(), reproducible: false }).tier).toBe('REVIEW');
  });

  test('zero derived criteria is never AUTO — this covers vague conversational changes', () => {
    const r = size({ ...clean(), criteriaCount: 0 });
    expect(r.tier).toBe('REVIEW');
    expect(r.reasons.join(' ')).toMatch(/zero criteria|nothing would verify/i);
  });

  test('an inferred root cause is never AUTO', () => {
    expect(size({ ...clean(), rootCause: 'inferred' }).tier).toBe('REVIEW');
  });

  test('an owner never-unattended path forces REVIEW however small the diff', () => {
    const r = size({
      ...clean(),
      touches: ['src/auth/session.ts'],
      neverUnattended: ['auth'],
    });
    expect(r.tier).toBe('REVIEW');
    expect(r.reasons.join(' ')).toMatch(/never-unattended/);
  });

  test('uncovered files force REVIEW', () => {
    expect(size({ ...clean(), covered: false }).tier).toBe('REVIEW');
  });

  test('a wide blast radius forces REVIEW even at one file', () => {
    const r = size({ ...clean(), callers: 40 });
    expect(r.tier).toBe('REVIEW');
    expect(r.reasons.join(' ')).toMatch(/blast radius/);
  });
});

describe('fix-sizing: ESCALATE — not light-path work', () => {
  test('more tasks than the ceiling escalates', () => {
    expect(size({ ...clean(), taskCount: MAX_TASKS + 1 }).tier).toBe('ESCALATE');
  });

  test('an unsettled spec escalates — that is the PRD boundary', () => {
    const r = size({ ...clean(), specCertain: false });
    expect(r.tier).toBe('ESCALATE');
    expect(r.reasons.join(' ')).toMatch(/product decision/);
  });

  test('too many touched files escalates', () => {
    const r = size({ ...clean(), touches: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(r.tier).toBe('ESCALATE');
  });
});

describe('fix-sizing: rules only ever LOWER a tier', () => {
  test('ESCALATE survives additional REVIEW-level failures', () => {
    // Ordering must not matter: a REVIEW rule evaluated after an ESCALATE rule
    // must not raise the verdict back up.
    const r = size({
      ...clean(),
      taskCount: 99,        // ESCALATE
      reproducible: false,  // REVIEW, evaluated later
      covered: false,       // REVIEW, evaluated later
    });
    expect(r.tier).toBe('ESCALATE');
    expect(r.reasons.length).toBeGreaterThan(1);
  });

  test('no combination of clean axes can raise a lowered tier', () => {
    const r = size({ ...clean(), rootCause: 'inferred' });
    expect(r.tier).not.toBe('AUTO');
  });
});

describe('fix-sizing: defaults fail safe', () => {
  test('an empty input is not AUTO', () => {
    // A caller that forgets to pass evidence must not be rewarded with AUTO.
    expect(size({}).tier).not.toBe('AUTO');
  });

  test('undefined input does not throw and is not AUTO', () => {
    expect(size(undefined).tier).not.toBe('AUTO');
  });
});

describe('matchNeverUnattended', () => {
  test('substring match, so an owner writing "auth" covers everything under it', () => {
    expect(matchNeverUnattended(['src/auth/x.ts', 'src/ui/y.ts'], ['auth'])).toEqual(['src/auth/x.ts']);
  });

  test('no patterns means no hits', () => {
    expect(matchNeverUnattended(['src/auth/x.ts'], [])).toEqual([]);
  });

  test('reports each matching file once', () => {
    const hits = matchNeverUnattended(['src/auth/pay.ts'], ['auth', 'pay']);
    expect(hits).toEqual(['src/auth/pay.ts']);
  });
});

describe('fix-sizing: coverage is about the state AFTER the change', () => {
  const base = {
    taskCount: 2, rootCause: 'demonstrated', reproducible: true, specCertain: true,
    criteriaCount: 1, touches: ['src/a.ts'], callers: 3, neverUnattended: [],
  };

  test('a fix that ADDS the missing test is not blocked for not having had one', () => {
    // Live run 2026-08-22: a hook fix whose second task added the hook's
    // first-ever test was held at REVIEW for having no tests — the gate
    // penalising the fix for the gap it closes.
    expect(size({ ...base, covered: false, addsCoverage: true }).tier).toBe('AUTO');
  });

  test('no tests and adding none is still REVIEW', () => {
    const r = size({ ...base, covered: false, addsCoverage: false });
    expect(r.tier).toBe('REVIEW');
    expect(r.reasons.join(' ')).toMatch(/adds none/);
  });

  test('already-covered still passes without claiming to add anything', () => {
    expect(size({ ...base, covered: true, addsCoverage: false }).tier).toBe('AUTO');
  });

  test('addsCoverage does not rescue any OTHER failing axis', () => {
    // It must relax exactly one rule and nothing else.
    expect(size({ ...base, covered: false, addsCoverage: true, reproducible: false }).tier).toBe('REVIEW');
    expect(size({ ...base, covered: false, addsCoverage: true, criteriaCount: 0 }).tier).toBe('REVIEW');
    expect(size({ ...base, covered: false, addsCoverage: true, rootCause: 'inferred' }).tier).toBe('REVIEW');
    expect(size({ ...base, covered: false, addsCoverage: true, specCertain: false }).tier).toBe('ESCALATE');
  });

  test('it still defaults off — an omitted flag does not unlock AUTO', () => {
    expect(size({ ...base, covered: false }).tier).toBe('REVIEW');
  });
});
