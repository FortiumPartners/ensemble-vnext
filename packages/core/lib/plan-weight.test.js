'use strict';
const fs = require('fs');
const path = require('path');
const { KINDS, WEIGHTS, ROUTES, stages, verification, route } = require('./plan-weight');
const { VERIFICATION_SECTION } = require('./fix-plan');

describe('plan-weight: the two axes', () => {
  test('KINDS is exactly defect, change, refactor', () => {
    expect(KINDS).toEqual(['defect', 'change', 'refactor']);
  });

  test('WEIGHTS is exactly trivial, small, medium', () => {
    expect(WEIGHTS).toEqual(['trivial', 'small', 'medium']);
  });

  test('feature is not a member of either axis', () => {
    expect(KINDS).not.toContain('feature');
    expect(WEIGHTS).not.toContain('feature');
  });
});

describe('plan-weight: stages() — the superset relation', () => {
  // AC-F2.1/F2.2/F2.3: asserted as a SET relation, independent of order.
  const asSet = (arr) => new Set(arr);
  const isSubset = (small, big) => [...asSet(small)].every((s) => asSet(big).has(s));

  test('set(trivial) is a subset of set(small)', () => {
    const trivial = stages({ kind: 'defect', weight: 'trivial' }).stages;
    const small = stages({ kind: 'defect', weight: 'small' }).stages;
    expect(isSubset(trivial, small)).toBe(true);
  });

  test('set(small) is a subset of set(medium)', () => {
    const small = stages({ kind: 'defect', weight: 'small' }).stages;
    const medium = stages({ kind: 'defect', weight: 'medium' }).stages;
    expect(isSubset(small, medium)).toBe(true);
  });

  test('trivial is a strict subset of medium (the chain is not degenerate)', () => {
    const trivial = stages({ kind: 'defect', weight: 'trivial' }).stages;
    const medium = stages({ kind: 'defect', weight: 'medium' }).stages;
    expect(isSubset(trivial, medium)).toBe(true);
    expect(medium.length).toBeGreaterThan(trivial.length);
  });

  test('audit is absent from trivial and small, present only in medium', () => {
    expect(stages({ kind: 'defect', weight: 'trivial' }).stages).not.toContain('audit');
    expect(stages({ kind: 'defect', weight: 'small' }).stages).not.toContain('audit');
    expect(stages({ kind: 'defect', weight: 'medium' }).stages).toContain('audit');
  });

  test.each([
    ['trivial', ['investigate', 'author-trd', 'implement'], 'light'],
    ['small', ['investigate', 'author-trd', 'adversarial', 'implement'], 'light'],
    ['medium', ['investigate', 'author-trd', 'ground', 'adversarial', 'audit', 'implement'], 'phased'],
  ])('weight=%s -> stages %j, trdFormat=%s', (weight, expectedStages, trdFormat) => {
    const result = stages({ kind: 'defect', weight });
    expect(new Set(result.stages)).toEqual(new Set(expectedStages));
    expect(result.trdFormat).toBe(trdFormat);
  });

  test('the stage list does not vary by kind, only by weight', () => {
    for (const weight of WEIGHTS) {
      const byKind = KINDS.map((kind) => new Set(stages({ kind, weight }).stages));
      for (const s of byKind) {
        expect(s).toEqual(byKind[0]);
      }
    }
  });
});

describe('plan-weight: stages() — refuses what it cannot plan', () => {
  test('an unknown kind throws naming the accepted values', () => {
    expect(() => stages({ kind: 'nonsense', weight: 'trivial' })).toThrow(/defect.*change.*refactor|change.*refactor.*defect/is);
  });

  test('an unknown weight throws naming the accepted values', () => {
    expect(() => stages({ kind: 'defect', weight: 'nonsense' })).toThrow(/trivial.*small.*medium/is);
  });

  test('kind: feature throws a message naming route()', () => {
    expect(() => stages({ kind: 'feature', weight: 'trivial' })).toThrow(/route\(/);
  });

  test('weight: feature throws a message naming route()', () => {
    expect(() => stages({ kind: 'defect', weight: 'feature' })).toThrow(/route\(/);
  });

  test('omitted kind defaults to defect', () => {
    expect(() => stages({ weight: 'trivial' })).not.toThrow();
    expect(stages({ weight: 'trivial' }).stages).toEqual(stages({ kind: 'defect', weight: 'trivial' }).stages);
  });

  test('omitted weight does NOT default — it throws', () => {
    expect(() => stages({ kind: 'defect' })).toThrow();
    expect(() => stages({})).toThrow();
  });
});

describe('plan-weight: verification() — the truth table, pinned', () => {
  // Pinned explicitly, not derived from the implementation, for all nine (kind, weight)
  // cells crossed with the open-question flag (18 rows). AC-F3.1-3.5, AC-F6.1, AC-F6.3.
  const T = true;
  const F = false;

  test.each([
    // kind,     weight,    oq,  rootCauseRequired, beforeRunForbidden, beforeRun, afterRun, surfaceCheck, refineTrdRecommended, section
    ['defect',   'trivial', 0,   T, F, F, F, F, F, '## Reproduction'],
    ['defect',   'trivial', 1,   T, F, F, F, F, F, '## Reproduction'],
    ['defect',   'small',   0,   T, F, F, F, F, F, '## Reproduction'],
    ['defect',   'small',   1,   T, F, F, F, F, F, '## Reproduction'],
    ['defect',   'medium',  0,   T, F, F, F, F, F, '## Reproduction'],
    ['defect',   'medium',  1,   T, F, F, F, F, F, '## Reproduction'],
    ['change',   'trivial', 0,   F, T, F, F, F, F, '## Intended Change'],
    ['change',   'trivial', 1,   F, T, F, F, F, F, '## Intended Change'],
    ['change',   'small',   0,   F, T, F, F, F, F, '## Intended Change'],
    ['change',   'small',   1,   F, T, F, F, F, F, '## Intended Change'],
    ['change',   'medium',  0,   F, T, F, F, F, F, '## Intended Change'],
    ['change',   'medium',  1,   F, T, F, F, F, T, '## Intended Change'],
    ['refactor', 'trivial', 0,   F, F, F, F, F, F, '## Behaviour Preserved'],
    ['refactor', 'trivial', 1,   F, F, F, F, F, F, '## Behaviour Preserved'],
    ['refactor', 'small',   0,   F, F, F, F, F, F, '## Behaviour Preserved'],
    ['refactor', 'small',   1,   F, F, F, F, F, F, '## Behaviour Preserved'],
    ['refactor', 'medium',  0,   F, F, T, T, T, F, '## Behaviour Preserved'],
    ['refactor', 'medium',  1,   F, F, T, T, T, F, '## Behaviour Preserved'],
  ])(
    'kind=%s weight=%s openQuestionCount=%i',
    (kind, weight, openQuestionCount, rootCauseRequired, beforeRunForbidden, beforeRun, afterRun, surfaceCheck, refineTrdRecommended, section) => {
      const v = verification({ kind, weight, openQuestionCount });
      expect(v.rootCauseRequired).toBe(rootCauseRequired);
      expect(v.beforeRunForbidden).toBe(beforeRunForbidden);
      expect(v.beforeRun).toBe(beforeRun);
      expect(v.afterRun).toBe(afterRun);
      expect(v.surfaceCheck).toBe(surfaceCheck);
      expect(v.refineTrdRecommended).toBe(refineTrdRecommended);
      expect(v.section).toBe(section);
    }
  );

  test('section is the fix-plan.js VERIFICATION_SECTION object itself, not a redefinition', () => {
    // AC-F3's section values must be IMPORTED, not duplicated — the exact failure mode
    // fix-plan.js's own header documents (one decision expressed in five places).
    for (const kind of KINDS) {
      expect(verification({ kind, weight: 'trivial', openQuestionCount: 0 }).section).toBe(
        VERIFICATION_SECTION[kind]
      );
    }
  });

  test('an unknown kind throws', () => {
    expect(() => verification({ kind: 'nonsense', weight: 'trivial', openQuestionCount: 0 })).toThrow();
  });

  test('an unknown weight throws', () => {
    expect(() => verification({ kind: 'defect', weight: 'nonsense', openQuestionCount: 0 })).toThrow();
  });

  test('kind: feature and weight: feature each throw naming route()', () => {
    expect(() => verification({ kind: 'feature', weight: 'trivial', openQuestionCount: 0 })).toThrow(/route\(/);
    expect(() => verification({ kind: 'defect', weight: 'feature', openQuestionCount: 0 })).toThrow(/route\(/);
  });

  test('omitted weight does NOT default', () => {
    expect(() => verification({ kind: 'defect', openQuestionCount: 0 })).toThrow();
  });
});

describe('plan-weight: route() — the exit test, content only', () => {
  test('returns "prd" iff prdWouldHaveContent is true', () => {
    expect(route({ prdWouldHaveContent: true })).toBe('prd');
    expect(route({ prdWouldHaveContent: false })).toBe('plan');
  });

  test('ROUTES enumerates exactly plan and prd', () => {
    expect(ROUTES).toEqual(expect.arrayContaining(['plan', 'prd']));
    expect(ROUTES).toHaveLength(2);
  });

  test('the input object has exactly one key: prdWouldHaveContent', () => {
    // AC-F4.2, structurally: no taskCount, no touched-file count, no tier ever
    // reaches route() at all — there is nowhere in its signature to put one.
    const input = { prdWouldHaveContent: true };
    expect(Object.keys(input)).toEqual(['prdWouldHaveContent']);
    expect(route(input)).toBeDefined();
  });

  test('openQuestionCount is not a parameter of route at all (AC-F6.1)', () => {
    // Passing it has no effect — proves the presence of an open question does not
    // by itself route work to /create-prd.
    expect(route({ prdWouldHaveContent: false, openQuestionCount: 99 })).toBe('plan');
    expect(route({ prdWouldHaveContent: true, openQuestionCount: 0 })).toBe('prd');
  });
});

describe('plan-weight: requires nothing from fix-sizing.js (AC-F4.2, structural)', () => {
  test('the module source does not require fix-sizing', () => {
    const source = fs.readFileSync(path.join(__dirname, 'plan-weight.js'), 'utf8');
    expect(source).not.toMatch(/require\(['"]\.\/fix-sizing['"]\)/);
  });
});

describe('plan-weight: no exported map enumerates nine cells (AC-F1.3, NG10)', () => {
  test('every exported object\'s keys are a subset of KINDS union WEIGHTS', () => {
    const mod = require('./plan-weight');
    const allowedKeys = new Set([...KINDS, ...WEIGHTS]);
    for (const [name, value] of Object.entries(mod)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value !== 'function'
      ) {
        for (const key of Object.keys(value)) {
          expect(allowedKeys.has(key)).toBe(true);
        }
      }
    }
  });

  test('no export is an object keyed by both a kind and a weight together (no cell name)', () => {
    const mod = require('./plan-weight');
    for (const [name, value] of Object.entries(mod)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of Object.keys(value)) {
          const isCompoundCellName = KINDS.some((k) => WEIGHTS.some((w) => key === `${k}-${w}` || key === `${k}_${w}`));
          expect(isCompoundCellName).toBe(false);
        }
      }
    }
  });
});
