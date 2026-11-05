'use strict';

// DSGN-B011 (design-stage TRD, D15): pins plan.md's design input -- one board or a small set.

const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(path.join(__dirname, 'plan.md'), 'utf8').replace(/\s+/g, ' ');

describe('plan.md design input', () => {
  test('accepts --design and --boards, and strips the values with the flags', () => {
    expect(text).toContain('--design docs/ui/<slug> --boards <ids>');
    expect(text).toContain('remove the flag **and its value**');
  });
  test('limits the TRD to the named boards and cites the contract section', () => {
    expect(text).toContain('built from those boards and no others');
    expect(text).toContain('"Design as a source" in `.claude/contracts/trd-authoring.md`');
  });
  test('a named board that embeds a draft part is STUCK; no task builds from a draft board (FS-44)', () => {
    expect(text).toContain('node .claude/lib/design-map.js held --dir docs/ui/<slug>');
    expect(text).toMatch(/No task cites or builds a draft board/);
  });

  test('moves the named boards to building with the TRD path', () => {
    expect(text).toContain('--ids <ids> --to building --trd docs/TRD/<slug>.md');
  });
  test('passes design to the create-trd workflow at medium weight', () => {
    expect(text.indexOf('design: { dir: "docs/ui/<slug>"')).toBeGreaterThan(text.indexOf('Workflow({ name: "create-trd"'));
  });
});
