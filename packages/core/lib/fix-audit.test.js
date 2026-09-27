'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
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
  const VERIFICATION_ARTIFACTS_NONE = '\n\n## Verification Artifacts\n\nNone apply — no UI, no flow, no data view touched.\n';
  const REFACTOR_MD = '## Behaviour Preserved\nthe suite passes today' + VERIFICATION_ARTIFACTS_NONE;
  const CHANGE_MD = '## Intended Change\nthe button moves to the header' + VERIFICATION_ARTIFACTS_NONE;

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

describe('fix-audit: the Verification Artifacts section (TRD §3.4)', () => {
  // A well-formed light TRD, reused as the base for each markdown fixture below.
  const parsed = () => ({
    tasks: [task('T1', ['O1'])],
    grounding: { T1: ground(['package.json']) },
    warnings: [],
  });
  const opts = (markdown, extra = {}) => ({ objectiveIds: ['O1'], markdown, ...extra });
  const vaFindings = (r) => r.findings.filter((f) => f.check === 'verification-artifacts');
  const vaAdvisories = (r) => r.advisories.filter((a) => a.check === 'verification-artifacts');

  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-audit-va-'));
    // Two real skills, so a legitimate row/Omitted line resolves cleanly.
    for (const name of ['verify-design-comparison', 'verify-data-fidelity']) {
      fs.mkdirSync(path.join(root, '.claude', 'skills', name), { recursive: true });
      fs.writeFileSync(path.join(root, '.claude', 'skills', name, 'SKILL.md'), '# stub\n');
    }
    // The two repo paths §3.2's worked example cites, one present.
    fs.mkdirSync(path.join(root, 'docs', 'design', 'create-alert', 'screens', 'png'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('markdown with no ## Verification Artifacts heading is a finding, ok: false', () => {
    const md = '## Non-Goals\nnone\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(r.ok).toBe(false);
    expect(vaFindings(r).some((f) => /section missing/.test(f.detail))).toBe(true);
  });

  test('a None apply — line is not a finding', () => {
    const md = '## Verification Artifacts\n\nNone apply — no UI, no flow, no data view.\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r)).toEqual([]);
  });

  test('a section holding only an Omitted: line WITH a reason is not a finding', () => {
    const md = '## Verification Artifacts\n\nOmitted: verify-data-fidelity — this change touches no data view.\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r)).toEqual([]);
  });

  test('a section with none of the three forms (no rows, no Omitted, no None apply) is a finding', () => {
    const md = '## Verification Artifacts\n\nsee the design doc for details.\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /no rows, no Omitted lines and no None apply/.test(f.detail))).toBe(true);
  });

  test('an Omitted: line with no reason after the dash is a finding', () => {
    const md = '## Verification Artifacts\n\nOmitted: verify-data-fidelity\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /gives no reason/.test(f.detail))).toBe(true);
  });

  test('a Skill cell naming no SKILL.md is a finding', () => {
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-nonexistent | `package.json` | made up |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /Skill cell names no SKILL\.md: verify-nonexistent/.test(f.detail))).toBe(true);
  });

  test('an Omitted: line naming no SKILL.md is a finding', () => {
    const md = '## Verification Artifacts\n\nOmitted: verify-nonexistent — not applicable.\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /Omitted line names no SKILL\.md: verify-nonexistent/.test(f.detail))).toBe(true);
  });

  test("§3.2's worked example cell (two backticked paths, both present) is not a finding", () => {
    fs.writeFileSync(path.join(root, 'docs', 'design', 'create-alert', 'routes.md'), 'routes\n');
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-design-comparison | design frames: `docs/design/create-alert/screens/png/`; routes: `docs/design/create-alert/routes.md` | the PRD\'s UI is specified by a design handoff |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r)).toEqual([]);
  });

  test('the same example cell with ONE path missing yields exactly one finding, naming that path', () => {
    // routes.md is never written this time — only screens/png/ exists.
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-design-comparison | design frames: `docs/design/create-alert/screens/png/`; routes: `docs/design/create-alert/routes.md` | the PRD\'s UI is specified by a design handoff |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r)).toHaveLength(1);
    expect(vaFindings(r)[0].detail).toMatch(/docs\/design\/create-alert\/routes\.md/);
  });

  test('a path listed in expectedNew is not a finding', () => {
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-design-comparison | `docs/design/not-yet-written.md` | the PRD\'s UI is specified by a design handoff |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root, expectedNew: ['docs/design/not-yet-written.md'] }));
    expect(vaFindings(r)).toEqual([]);
  });

  test('a backticked URL yields an advisory only, never a finding', () => {
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-design-comparison | figma: `https://figma.com/file/abc123` | the PRD points at a Figma handoff |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r)).toEqual([]);
    expect(vaAdvisories(r).some((a) => /not checked \(URL\)/.test(a.detail))).toBe(true);
  });

  test('a ## Verification Artifacts heading inside a code fence is not read as the section', () => {
    const md = [
      '## Non-Goals',
      'none',
      '',
      '```markdown',
      '## Verification Artifacts',
      '',
      'None apply — example only, inside the template fence.',
      '```',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /section missing/.test(f.detail))).toBe(true);
  });

  test('audit() without markdown returns exactly what it returns today — no verification-artifacts check runs', () => {
    const r = audit(parsed(), { objectiveIds: ['O1'] });
    expect(r.ok).toBe(true);
    expect(vaFindings(r)).toEqual([]);
    expect(vaAdvisories(r)).toEqual([]);
  });

  test('a Skill row naming a skill whose framework-skills.txt role is not "check" is a finding (D14)', () => {
    // verify-plan-recovery is real (a SKILL.md exists) but its role is "support" — it is
    // shipped for the bridge conversation, never a selectable verification check.
    fs.mkdirSync(path.join(root, 'packages', 'skills', 'verify-plan-recovery'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'skills', 'verify-plan-recovery', 'SKILL.md'), '# stub\n');
    fs.writeFileSync(
      path.join(root, 'packages', 'skills', 'framework-skills.txt'),
      '# name role\nverify-design-comparison check\nverify-plan-recovery support\n'
    );
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-plan-recovery | `package.json` | made up |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /verify-plan-recovery: role is "support", not a selectable check/.test(f.detail))).toBe(true);
    // The skill IS real, so no "names no SKILL.md" finding should also fire.
    expect(vaFindings(r).some((f) => /names no SKILL\.md/.test(f.detail))).toBe(false);
  });

  test('an Omitted: line naming a non-check-role skill is also a finding', () => {
    fs.mkdirSync(path.join(root, 'packages', 'skills', 'verify-plan-recovery'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'skills', 'verify-plan-recovery', 'SKILL.md'), '# stub\n');
    fs.writeFileSync(
      path.join(root, 'packages', 'skills', 'framework-skills.txt'),
      'verify-plan-recovery support\n'
    );
    const md = '## Verification Artifacts\n\nOmitted: verify-plan-recovery — not applicable.\n';
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r).some((f) => /verify-plan-recovery: role is "support", not a selectable check/.test(f.detail))).toBe(true);
  });

  test('when framework-skills.txt is absent, no role check runs — no crash, no false finding', () => {
    // root's beforeEach never writes framework-skills.txt; a check-role skill still passes.
    const md = [
      '## Verification Artifacts',
      '',
      '| Skill | Inputs | Why it applies |',
      '|-------|--------|----------------|',
      '| verify-design-comparison | `docs/design/create-alert/screens/png/` | made up |',
      '',
    ].join('\n');
    const r = audit(parsed(), opts(md, { root }));
    expect(vaFindings(r)).toEqual([]);
  });
});
