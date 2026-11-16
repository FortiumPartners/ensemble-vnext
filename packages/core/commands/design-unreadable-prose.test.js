'use strict';

// Defect O1-O3 (issues 150, 152): a recorded canvas or design-system artifact the owner cannot read
// (deleted, or no access) used to end a design command STUCK asking a person to share it. The contract
// now carries one "Unreadable recorded artifact" rule, and design-system.md and refine-design.md point at it.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const contract = read('packages/core/contracts/design-commands.md');

// The paragraph runs from its bold lead-in to the next numbered step or section heading.
function paragraph() {
  const start = contract.indexOf('**Unreadable recorded artifact.**');
  if (start === -1) return '';
  const rest = contract.slice(start + 10);
  const end = rest.search(/\n\d+\. |\n## /);
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

describe('contract: Unreadable recorded artifact rule', () => {
  const p = paragraph();

  test('the paragraph exists, in section 1 before the render of step 5', () => {
    expect(p).not.toBe('');
    const at = contract.indexOf('**Unreadable recorded artifact.**');
    expect(at).toBeGreaterThan(contract.indexOf('4. **Canvas sync**'));
    expect(at).toBeLessThan(contract.indexOf('## 2. Render pass'));
  });

  test('triggers only on not-found or no-access and records previous_url', () => {
    expect(p).toMatch(/not-found or no-access/);
    expect(p).toMatch(/previous_url/);
    expect(p).toMatch(/any other read error/i);
  });

  // FS-10: a malformed recorded URL ("not an artifact URL") was read as "cannot be read" and the
  // canvas was republished. The rule must say how to recognise the two triggers, and that every
  // other error leaves the map alone.
  test('recognises not-found and no-access by the error text', () => {
    expect(p).toMatch(/`artifact not found`/);
    expect(p).toMatch(/`404 Not Found`/);
    expect(p).toMatch(/`403`/);
  });

  test('a malformed URL or any other error republishes nothing and leaves the map unchanged', () => {
    expect(p).toMatch(/`not an artifact URL`/);
    expect(p).toMatch(/never triggers a republish/);
    expect(p).toMatch(/run no `design-map\.js republished`, write no `previous_url`/);
    expect(p).toMatch(/URL in the map and in `artifacts\.js` unchanged/);
    expect(p).toMatch(/could not be read \(<the exact error>\): not republished/);
  });

  test.each(['design-system.md', 'refine-design.md'])('%s says a malformed URL republishes nothing', (f) => {
    const t = flat(read(`packages/core/commands/${f}`));
    expect(t).toMatch(/only a not-found or no-access error/i);
    expect(t).toMatch(/malformed URL \(`not an artifact URL`\) included, republishes nothing/);
  });

  test('republishes from the committed copies and records the move', () => {
    expect(p).toMatch(/docs\/ui\/<slug>\/canvas\//);
    expect(p).toMatch(/docs\/ui\/_design-system\/<folder>\//);
    expect(p).toMatch(/design-map\.js republished/);
    expect(p).toMatch(/--kind canvas\|system/);
    expect(p).toMatch(/artifacts\.js record/);
  });

  test('adds a DECISIONS line naming the old and new URL, and never STUCK', () => {
    expect(p).toMatch(/DECISIONS/);
    expect(p).toMatch(/old and new URL/);
    expect(p).toMatch(/never STUCK/i);
  });

  test('excludes /audit-design, publish: off and the no-canvas-recorded case', () => {
    expect(p).toMatch(/\/audit-design/);
    expect(p).toMatch(/publish: off/);
    expect(p).toMatch(/no canvas recorded/i);
  });

  test('reinstalls the system per section 3', () => {
    expect(p).toMatch(/reinstall/i);
    expect(p).toMatch(/section 3|§3/);
  });

  test('sections 3 and 4 point at it', () => {
    const s3 = contract.slice(contract.indexOf('## 3.'), contract.indexOf('## 4.'));
    const s4 = contract.slice(contract.indexOf('## 4.'), contract.indexOf('## 5.'));
    expect(s3).toMatch(/Unreadable recorded artifact/);
    expect(s4).toMatch(/Unreadable recorded artifact/);
  });
});

describe('commands point at the rule', () => {
  test.each(['design-system.md', 'refine-design.md'])('%s names it', (f) => {
    expect(flat(read(`packages/core/commands/${f}`))).toMatch(/Unreadable recorded artifact/);
  });

  test('design-system.md points at it from the publish and record steps (6-8)', () => {
    const t = read('packages/core/commands/design-system.md');
    const steps = t.slice(t.indexOf('6. **Publish the Design System'), t.indexOf('9. **Readout'));
    expect(steps).toMatch(/Unreadable recorded artifact/);
  });
});

// FS-8: a /design-system --sync run that replaced an unreadable system page and canvas reported
// the replacement only in STATE. The readout instruction itself must put it in DECISIONS.
describe('the readout carries the republish in DECISIONS', () => {
  test('design-system.md readout names the DECISIONS line with old and new URL', () => {
    const t = read('packages/core/commands/design-system.md');
    const readout = flat(t.slice(t.indexOf('## Readout'), t.indexOf('## Completion signal')));
    expect(readout).toMatch(/DECISIONS carries one line for each canvas or design system this run republished/);
    expect(readout).toMatch(/Unreadable recorded artifact/);
    expect(readout).toMatch(/old <old url>, new <new url>/);
    expect(readout).toMatch(/only in STATE is wrong/);
  });

  test('contract section 7 DECISIONS bullet names the republish', () => {
    const s7 = flat(contract.slice(contract.indexOf('## 7. Readout'), contract.indexOf('## 8.')));
    expect(s7).toMatch(/DECISIONS: one line per canvas or design system republished/);
    expect(s7).toMatch(/old and new URL, even when STATE also mentions it/);
  });
});
