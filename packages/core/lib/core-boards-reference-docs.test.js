'use strict';
// The reference docs must describe the Core-boards surface the libraries deliver (CBD-D002).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(root, 'docs', 'reference', f), 'utf8');

describe('docs/reference/verification.md', () => {
  const doc = read('verification.md');
  it('lists the Board class column and its classes', () => {
    expect(doc).toMatch(/\| Board class \|/);
    expect(doc).toContain('evidence-only');
    expect(doc).toContain('coreMustPass');
  });
  it('states the evidence-only drop and the ratio rule', () => {
    expect(doc).toContain('`evidenceOnly`');
    expect(doc).toMatch(/both sides\*\* of the coverage ratio/);
  });
  it('no longer says a check row never contributes a must-pass mark under the waiver', () => {
    expect(doc).toContain('`core` row is must-pass');
  });
});

describe('docs/reference/design.md', () => {
  const doc = read('design.md');
  it.each(['`core`', '`core-marks`', 'design-criteria.js', 'CORE_CAP', '[Core] ', '## Core boards'])('mentions %s', (t) => {
    expect(doc).toContain(t);
  });
  it('does not claim the mark is shown on the canvas', () => {
    expect(doc).toMatch(/written to the `canvas.json` title/);
  });
  it('does not document /sync-design as carrying core', () => {
    expect(doc).toMatch(/does not carry Core/);
  });
});
