'use strict';
// A not-run verification is recorded by the library, the derive source goes by path, and the
// loop is not substitutable (fix-implement-skips-verification-loop FIX-002).
const fs = require('fs');
const path = require('path');

const core = path.join(__dirname, 'implement-trd.md');
const vendored = path.join(__dirname, '..', '..', '..', '.claude', 'commands', 'implement-trd.md');
const text = fs.readFileSync(core, 'utf8');

describe('implement-trd not-run prose', () => {
  test('the vendored copy is byte-identical', () => {
    expect(fs.readFileSync(vendored, 'utf8')).toBe(text);
  });

  test('section 3.6 passes the source by path and records the dispatch', () => {
    expect(text).toMatch(/\.trd-state\/<feature>\/derive-source\.md/);
    expect(text).toMatch(/never pasted/);
    expect(text).toMatch(/derive_dispatched: true/);
  });

  test('every not-run exit calls record-not-run and no hand-built report input remains', () => {
    expect((text.match(/functional-verification\.js record-not-run/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(/recorded through `record-not-run`/);
    expect(text).not.toMatch(/fv-report-input/);
    expect(text).toMatch(/re-derive ONCE, in the foreground/);
  });

  test('Step 8 says the loop is not substitutable', () => {
    expect(text).toMatch(/The loop is not substitutable/);
  });
});
