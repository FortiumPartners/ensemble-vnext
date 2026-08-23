'use strict';
const { audit, isFatalWarning } = require('./fix-audit');

const task = (id, serves) => ({ id, serves, description: 'x' });
const ground = (touches) => ({ touches, reuse: [], replaces: [], follow: [], careful: [] });

const good = () => ({
  tasks: [task('FIX-001', ['O1'])],
  grounding: { 'FIX-001': ground(['package.json']) },
  warnings: ['No "Phase <n>" heading found in Master Task List section; all tasks assigned to phase 1'],
});

describe('fix-audit', () => {
  test('a well-formed light TRD passes, phase-default warning and all', () => {
    const r = audit(good(), { objectiveIds: ['O1'] });
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  test('serves is an ARRAY — the bug that motivated this module', () => {
    // The first live /fix run compared task.serves as a string and reported two
    // false failures on a correct TRD. A false failure invites "fixing" a good
    // document to satisfy a broken check.
    const r = audit(good(), { objectiveIds: ['O1'] });
    expect(r.findings.filter((f) => f.check === 'serves')).toEqual([]);
  });

  test('an unbolded Touches field is caught — it parses to nothing and is SILENT', () => {
    const p = good();
    p.grounding['FIX-001'] = ground([]);
    const r = audit(p, { objectiveIds: ['O1'] });
    expect(r.ok).toBe(false);
    expect(r.findings[0].detail).toMatch(/bold/);
  });

  test('a task serving no objective is work nobody asked for', () => {
    const p = good();
    p.tasks = [task('FIX-001', [])];
    expect(audit(p, { objectiveIds: ['O1'] }).findings.some((f) => f.check === 'serves')).toBe(true);
  });

  test('a Serves pointing at an undeclared objective is caught', () => {
    const r = audit({ ...good(), tasks: [task('FIX-001', ['O9'])] }, { objectiveIds: ['O1'] });
    expect(r.findings.some((f) => /resolves to no stated objective/.test(f.detail))).toBe(true);
  });

  test('a cited path that does not exist is caught', () => {
    const p = good();
    p.grounding['FIX-001'] = ground(['nope/does-not-exist.ts']);
    expect(audit(p, { objectiveIds: ['O1'] }).findings.some((f) => f.check === 'citation')).toBe(true);
  });

  test('a path the TRD CREATES is not a missing citation', () => {
    const p = good();
    p.grounding['FIX-001'] = ground(['brand/new.test.js']);
    const r = audit(p, { objectiveIds: ['O1'], expectedNew: ['brand/new.test.js'] });
    expect(r.ok).toBe(true);
  });

  test('a missing grounding block is caught', () => {
    const p = good();
    p.grounding = {};
    expect(audit(p, { objectiveIds: ['O1'] }).findings.some((f) => f.check === 'grounding')).toBe(true);
  });

  test('zero tasks is a finding, not a pass', () => {
    expect(audit({ tasks: [], grounding: {}, warnings: [] }, {}).ok).toBe(false);
  });

  test('the footprint is reported, so scope creep is checkable', () => {
    const r = audit(good(), { objectiveIds: ['O1'] });
    expect(r.footprint).toEqual(['package.json']);
  });
});

describe('isFatalWarning', () => {
  test('the phase-default warning is NOT fatal — every light TRD emits it', () => {
    expect(isFatalWarning('No "Phase <n>" heading found in Master Task List section')).toBe(false);
  });

  test('a real parser warning IS fatal', () => {
    expect(isFatalWarning('Duplicate task id: FIX-001')).toBe(true);
  });
});


describe('fix-audit: guidance, not enforcement', () => {
  // The owner's correction, 2026-08-23: determinism is a guide rail, not a cage.
  // A declared `kind` is the author's call. Surfacing a mismatch is useful;
  // failing the audit over it treats the author as an adversary.
  const parsed = () => ({
    tasks: [task('T1', ['O1'])],
    grounding: { T1: ground(['package.json']) },
    warnings: [],
  });
  const REFACTOR_MD = '## Behaviour Preserved\nthe suite passes today';
  const CHANGE_MD = '## Intended Change\nthe button moves to the header';

  test('a kind/section mismatch is an ADVISORY and does not fail the audit', () => {
    const r = audit(parsed(), { objectiveIds: ['O1'], kind: 'change', markdown: REFACTOR_MD });
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.advisories).toHaveLength(1);
  });

  test('the advisory allows for it being deliberate', () => {
    const r = audit(parsed(), { objectiveIds: ['O1'], kind: 'change', markdown: REFACTOR_MD });
    expect(r.advisories[0].detail).toMatch(/fine if deliberate/);
  });

  test('a matching kind produces no advisory at all', () => {
    const r = audit(parsed(), { objectiveIds: ['O1'], kind: 'change', markdown: CHANGE_MD });
    expect(r.advisories).toEqual([]);
  });

  test('an unknown kind advises the default rather than erroring', () => {
    const r = audit(parsed(), { objectiveIds: ['O1'], kind: 'nonsense', markdown: CHANGE_MD });
    expect(r.ok).toBe(true);
    expect(r.advisories[0].detail).toMatch(/default to defect/);
  });

  test('REAL malformation still fails — advisories did not soften findings', () => {
    const p = parsed();
    p.grounding.T1 = ground([]);   // no Touches: the TRD is malformed
    const r = audit(p, { objectiveIds: ['O1'], kind: 'change', markdown: REFACTOR_MD });
    expect(r.ok).toBe(false);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  test('advisories is always present, so a caller can read it unconditionally', () => {
    expect(audit(parsed(), { objectiveIds: ['O1'] }).advisories).toEqual([]);
  });
});
