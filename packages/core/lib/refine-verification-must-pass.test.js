'use strict';
// VMP-B007 (D16): refine-verification.md must never route a must-pass criterion into
// "Accepted as not verifiable"; it becomes an owner ruling (OWNER-CALL under --auto).
const fs = require('fs');
const path = require('path');

const PACKAGE = path.join(__dirname, '..', 'commands', 'refine-verification.md');
const MIRROR = path.join(__dirname, '..', '..', '..', '.claude', 'commands', 'refine-verification.md');
const text = fs.readFileSync(PACKAGE, 'utf8');

function derive() {
  const start = text.indexOf('## Derive (both modes)');
  const end = text.indexOf('## Open items');
  return text.slice(start, end);
}

describe('refine-verification.md must-pass handling (D16)', () => {
  test('Diagnose names the unproven must-pass criteria first', () => {
    const diagnose = derive().split('**2.')[0];
    expect(diagnose).toMatch(/must-pass/i);
    expect(diagnose.search(/must-pass/i)).toBeLessThan(diagnose.search(/causes\s+by name and count/));
  });

  test('the Accepted-as-not-verifiable bullet excludes must-pass criteria', () => {
    const bullet = derive().split('- **Accepted as not verifiable**')[1].split('- **Owner rulings**')[0];
    expect(bullet).toMatch(/never a must-pass criterion|except a must-pass|not a must-pass/i);
  });

  test('the Owner rulings bullet names three ways out', () => {
    const bullet = derive().split('- **Owner rulings**')[1].split('- **Extra checks**')[0];
    expect(bullet).toMatch(/must-pass/i);
    expect(bullet).toMatch(/OWNER-CALL/);
    expect(bullet).toContain('/verification-setup');
    expect(bullet).toMatch(/remove the must-pass marking/i);
    expect(bullet).toMatch(/three ways out/);
    expect(bullet).toMatch(/off-host proof/i);
  });

  test('--auto never writes, edits or removes an Off-host proof cell (D16)', () => {
    const flat = (x) => x.replace(/\s+/g, ' ');
    const bullet = flat(derive().split('- **Owner rulings**')[1].split('- **Extra checks**')[0]);
    const para = flat(text.split('**Access only the owner has is never guessed.**')[1].split('\n---')[0]);
    const never = flat(text.split('\n## Never')[1].split('\n---')[0]);
    for (const x of [bullet, para, never]) {
      expect(x).toMatch(/never write, edit or remove an `Off-host proof` cell|never writes, edits or removes an `Off-host proof` cell/i);
    }
    expect(never).toMatch(/--auto/);
  });

  test('the interactive path writes the TRD only, naming it under Written into', () => {
    const bullet = derive().split('- **Owner rulings**')[1].split('- **Extra checks**')[0].replace(/\s+/g, ' ');
    expect(bullet).toMatch(/TRD Objectives rows only/);
    expect(bullet).toMatch(/adding the `Off-host proof` column if absent/);
    expect(bullet).toMatch(/name the TRD under `Written into`/);
    expect(bullet).toMatch(/success definition is not written/);
  });

  test('the --auto owner-only-access paragraph records an OWNER-CALL for must-pass', () => {
    const para = text.split('**Access only the owner has is never guessed.**')[1].split('\n---')[0];
    expect(para).toMatch(/must-pass/i);
    expect(para).toMatch(/OWNER-CALL/);
  });

  test('the mirror is byte-identical', () => {
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
  });
});

describe('refine-verification.md routes by kind (TRIAGE-B005, D15/D20/D24)', () => {
  const blockers = () => derive().split('- **Blockers**')[1].split('- **Slices**')[0];
  const accepted = () => derive().split('- **Accepted as not verifiable**')[1].split('- **Owner rulings**')[0];
  const rulings = () => derive().split('- **Owner rulings**')[1].split('- **Extra checks**')[0];

  test('Blockers are keyed on kind build-defect, with the cause fallback named', () => {
    expect(blockers()).toMatch(/`build-defect`/);
    expect(blockers()).toMatch(/`kind` is absent/);
    expect(blockers()).toMatch(/`judged-failed`/);
    expect(blockers()).toMatch(/`not-built`/);
  });

  test('CAUSE-B005 (D21): an awaiting entry is "awaiting re-check", neither Blocker nor ruling', () => {
    const b = blockers().replace(/\s+/g, ' ');
    expect(b).toMatch(/carrying `awaiting`/);
    expect(b).toMatch(/"awaiting re-check"/);
    expect(b).toMatch(/neither a Blocker nor a ruling/);
  });

  test('Accepted is keyed on kind not-checkable-here, with the cause fallback named', () => {
    expect(accepted()).toMatch(/`not-checkable-here`/);
    expect(accepted().replace(/\s+/g, ' ')).toMatch(/`kind` is absent/);
    expect(accepted()).toMatch(/`environment-unreachable`/);
  });

  test('a settled definition problem goes under Owner rulings, never Blockers', () => {
    expect(rulings()).toMatch(/settled: 'definition-problem'/);
    expect(rulings()).toMatch(/definition problem/i);
    expect(rulings()).toMatch(/OWNER-CALL/);
    expect(blockers()).toMatch(/never a Blocker/i);
  });

  test('reader rule: a non-null kindOf(cause) wins over a disagreeing stored kind', () => {
    expect(derive()).toMatch(/kindOf\(cause\)/);
    expect(derive()).toMatch(/stored `kind` stands/);
  });

  test('a satisfied run with definition problems applies', () => {
    expect(text).toMatch(/satisfied.{0,80}definition problem/s);
  });
});
