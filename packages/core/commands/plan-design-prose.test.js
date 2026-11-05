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
    expect(text).toContain('node .claude/lib/design-map.js held --dir docs/ui/<slug> --ids <ids>');
    expect(text).toMatch(/No task cites or builds a draft board/);
  });
  test('AC-F9.4 (owner ruling R1): naming a board approves it, then it moves to building', () => {
    expect(text).toMatch(/\*\*Invocation is approval \(AC-F9\.4, D18\):\*\* naming a board here is the owner's approval of it/);
    expect(text).toContain('node .claude/lib/design-map.js buildable --dir docs/ui/<slug> --ids <ids>');
    expect(text).toContain('node .claude/lib/design-map.js approve --dir docs/ui/<slug> --ids');
    expect(text).not.toContain('--to approved');
    expect(text).not.toContain('design-render.js render --dir docs/ui/<slug> --runtime');
    const held = text.indexOf('design-map.js held');
    const written = text.indexOf('the TRD is written', held);
    const approve = text.indexOf('design-map.js approve --dir docs/ui/<slug> --ids');
    expect(written).toBeGreaterThan(held);
    expect(approve).toBeGreaterThan(held);
    expect(approve).toBeGreaterThan(written);
    expect(approve).toBeLessThan(text.indexOf('--ids <ids> --to building'));
    expect(text).toContain('git rev-parse HEAD');
    expect(text).toContain('--commit <source commit>');
    expect(text).toContain('boards approved by /plan');
    expect(text).not.toContain('Check each named board is `approved`');
  });

  test('moves the named boards to building with the TRD path', () => {
    expect(text).toContain('--ids <ids> --to building --trd docs/TRD/<slug>.md');
  });
  test('passes design to the create-trd workflow at medium weight', () => {
    expect(text.indexOf('design: { dir: "docs/ui/<slug>"')).toBeGreaterThan(text.indexOf('Workflow({ name: "create-trd"'));
  });
});
