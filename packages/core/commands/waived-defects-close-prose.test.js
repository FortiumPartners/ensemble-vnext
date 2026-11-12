'use strict';

// every-waived-failure-filed-as-a-defect-issue FIX-004: pins the close-gate prose in /close-feature
// and /audit-build (the gate runs before closed.json, a refusal writes no close record and no PR but
// still writes the records ref, and filing needs no ship.md step), and that .claude/ mirrors match.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const GATE = 'node .claude/lib/waived-defects.js gate --state-dir .trd-state/<feature>';

const closeFeature = read('packages/core/commands/close-feature.md');
const auditBuild = read('packages/core/commands/audit-build.md');
const auditClose = auditBuild.slice(auditBuild.indexOf('**4. Close, or re-audit.**'));

describe('waived-defect close gate prose', () => {
  test('close-feature runs the gate before the closed.json write', () => {
    const step = closeFeature.indexOf('## The close step');
    const gate = closeFeature.indexOf(GATE, step);
    const write = closeFeature.indexOf('Write `.trd-state/<feature>/closed.json`', step);
    expect(gate).toBeGreaterThan(step);
    expect(write).toBeGreaterThan(gate);
  });

  test('audit-build runs the gate before performing the close step', () => {
    const gate = auditClose.indexOf(GATE);
    const perform = auditClose.indexOf("perform `/close-feature`'s \"The close step\"");
    expect(gate).toBeGreaterThan(-1);
    expect(perform).toBeGreaterThan(gate);
  });

  test.each([
    ['close-feature', closeFeature],
    ['audit-build', auditClose],
  ])('%s refusal: no close record, records-ref write, record-filed, STUCK', (_n, t) => {
    const f = flat(t);
    expect(f).toMatch(/writes? no close record/i);
    expect(f).toMatch(/still writes? the records ref/i);
    expect(f).toContain('record-filed');
    expect(f).toContain('COMMAND STUCK');
    expect(f).toMatch(/needs? no `ship\.md` step/);
  });

  test('audit-build refusal opens no PR, removes a stale record, and never points NEXT at /close-feature', () => {
    const f = flat(auditClose);
    expect(f).toMatch(/no PR/);
    expect(f).toMatch(/removes? (an existing|the existing|a stale) `closed\.json`/);
    expect(f).toMatch(/Never NEXT `\/close-feature`/);
  });

  test('close-feature framing carries the one exception', () => {
    const f = flat(closeFeature);
    expect(f).not.toContain('This command decides nothing and checks nothing beyond what it needs to find the feature.');
    expect(f).toMatch(/one exception/i);
  });

  test('close-feature keeps the already-closed path unchanged', () => {
    expect(flat(closeFeature)).toContain('**Already closed** (`.trd-state/<feature>/closed.json` exists): change nothing');
  });

  test.each(['audit-build', 'close-feature'])('.claude mirror of %s is byte-identical', (n) => {
    expect(read(`.claude/commands/${n}.md`)).toBe(read(`packages/core/commands/${n}.md`));
  });
});
