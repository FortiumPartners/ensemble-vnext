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

  test('the Owner rulings bullet names both ways out', () => {
    const bullet = derive().split('- **Owner rulings**')[1].split('- **Extra checks**')[0];
    expect(bullet).toMatch(/must-pass/i);
    expect(bullet).toMatch(/OWNER-CALL/);
    expect(bullet).toContain('/verification-setup');
    expect(bullet).toMatch(/remove the must-pass marking/i);
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
