'use strict';

// DSGN-B011 (design-stage TRD, D15): pins the command and contract PROSE that lets /create-trd
// take a design. Documentation-level assertions, same standing as create-trd-grounding-prose.test.js.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const cmd = flat(read('packages/core/commands/create-trd.md'));
const contract = read('packages/core/contracts/trd-authoring.md');
const section = flat(contract.slice(contract.indexOf('### Design as a source'), contract.indexOf('### Section 10: Task Grounding')));

describe('create-trd.md design input', () => {
  test('accepts --design and lists approved boards before the workflow', () => {
    expect(cmd).toContain('--design docs/ui/<slug>');
    expect(cmd.indexOf('design-map.js approved')).toBeGreaterThan(-1);
    expect(cmd.indexOf('design-map.js approved')).toBeLessThan(cmd.indexOf('Workflow({ name: "create-trd"'));
  });
  test('nothing builds from a draft board: approved boards embedding a draft part are held (FS-44)', () => {
    expect(cmd).toContain('node .claude/lib/design-map.js held --dir docs/ui/<slug>');
    expect(cmd).toMatch(/Drop those boards from `boards` before calling the workflow/);
    expect(cmd).toMatch(/never justify one in an open question/);
    expect(flat(contract)).toMatch(/\*\*Nothing builds from a draft board\.\*\* A part board is a design source only when its own status is `approved` or later/);
  });

  test('zero approved boards is STUCK', () => {
    expect(cmd).toMatch(/Zero approved boards is STUCK/);
  });
  test('moves boards to building with the TRD path and commits the map', () => {
    expect(cmd).toContain('--to building --trd docs/TRD/<feature>.md');
    expect(cmd).toContain('git add docs/ui/<slug>/design-map.json');
  });
});

describe('trd-authoring.md "Design as a source"', () => {
  test('section sits before Task Grounding and outside the locked-scope rule', () => {
    expect(section.length).toBeGreaterThan(100);
    expect(contract.indexOf('### Design as a source')).toBeGreaterThan(contract.indexOf('### Section 9b'));
  });
  test.each([
    'board id', 'x-import', 'sc-if', 'links', 'grounding/data.md',      // AC-F11.2
    'Parts boards', 'PNG',                                                // AC-F11.4
    'docs/ui/<slug>/canvas/project/<file>',                               // AC-F11.5
    'New shared components first',                                        // AC-F11.6
    'verify-design-comparison', 'verify-flow-as-built',                   // AC-F11.7
    'verify-data-fidelity', 'verify-design-structure',
  ])('states %s', (needle) => {
    expect(section).toContain(needle);
  });
});
