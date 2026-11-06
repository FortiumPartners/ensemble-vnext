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
  test('accepts --design and lists buildable boards before the workflow', () => {
    expect(cmd).toContain('--design docs/ui/<slug>');
    expect(cmd.indexOf('design-map.js buildable')).toBeGreaterThan(-1);
    expect(cmd.indexOf('design-map.js buildable')).toBeLessThan(cmd.indexOf('Workflow({ name: "create-trd"'));
  });
  test('AC-F9.4: invocation approves, once, after the TRD is written (DAV-003)', () => {
    expect(cmd).toMatch(/\*\*Invocation is approval \(AC-F9\.4, D18\)\.\*\*/);
    expect(cmd).toMatch(/no canvas comment, no chat remark/);
    // order: held -> source commit -> workflow -> approve -> building
    const held = cmd.indexOf('design-map.js held');
    const source = cmd.indexOf('source commit');
    const wf = cmd.indexOf('Workflow({ name: "create-trd"');
    const approve = cmd.indexOf('design-map.js approve ');
    const building = cmd.indexOf('--to building --trd');
    expect(held).toBeGreaterThan(-1);
    expect(held).toBeLessThan(source);
    expect(source).toBeLessThan(wf);
    expect(wf).toBeLessThan(approve);
    expect(approve).toBeLessThan(building);
    expect(cmd).toContain('--commit <source commit> --runtime <runtime path>');
    // the old hand-written sequence is gone
    expect(cmd).not.toContain('design-map.js approved');
    expect(cmd).not.toContain('--to approved');
    // a run that stops before the TRD is written approves nothing
    expect(cmd).toMatch(/A run that stops before the TRD is written[^.]*approves nothing/);
    expect(cmd).toMatch(/leave the boards unapproved and do not move them to `building`/);
    expect(cmd).toMatch(/`renderSkipped` or render `errors`[^.]*ISSUES line, never STUCK/);
  });
  test('nothing builds from a draft part: boards embedding one are held before approval (FS-44)', () => {
    expect(cmd).toContain('node .claude/lib/design-map.js held --dir docs/ui/<slug> --ids <the listed ids>');
    expect(cmd.indexOf('design-map.js held')).toBeLessThan(cmd.indexOf('design-map.js approve '));
    expect(cmd).toMatch(/Never approve, pass, cite or build a held board/);
    expect(cmd).toMatch(/never justify one in an open question/);
    expect(flat(contract)).toMatch(/\*\*Nothing builds from a draft board\.\*\* A part board is a design source only when its own status is `approved` or later/);
  });

  test('zero buildable boards is STUCK', () => {
    expect(cmd).toMatch(/Zero boards left is STUCK/);
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
  test('says the boards are approved by this run once the TRD is written', () => {
    expect(section).toContain('approved by it once the TRD is written');
    expect(flat(read('packages/core/workflows/create-trd.js'))).toContain('this run approves them once the TRD is written');
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

describe('create-trd.md --boards (DORCH-B006)', () => {
  test('argument-hint and the strip sentence name --boards', () => {
    expect(cmd).toContain('argument-hint: "[path-to-prd] [--design docs/ui/<slug> [--boards <ids>]]"');
    expect(cmd).toContain('`--boards <ids>`) are not part of the PRD path: remove each flag **and its value**');
  });
  test('named boards are checked with buildable and held --ids', () => {
    expect(cmd).toContain('design-map.js buildable --dir docs/ui/<slug> --ids <ids>');
    expect(cmd).toContain('design-map.js held --dir docs/ui/<slug> --ids <ids>');
    expect(cmd).toMatch(/is STUCK, naming it and its status/);
    expect(cmd).toMatch(/STUCK too, naming the part and `\/refine-design <slug> --approve <part>`/);
  });
  test('only the named ids are approved and moved; without --boards keeps today', () => {
    expect(cmd).toMatch(/Only the named ids are approved and moved to `building`/);
    expect(cmd).toMatch(/Without `--boards`, the steps above apply unchanged/);
    expect(cmd).toContain('(with `--boards`, only the named boards: see below)');
  });
});
