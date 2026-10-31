'use strict';

// AMEND-001 (create-trd-grounding-write TRD, FIX-003 acceptance criteria): pins the command
// PROSE that moved Section 10 assembly out of a merge agent and into `trd-grounding.js`.
// create-trd.md and plan.md are read by a model, so these are documentation-level assertions
// (same standing as verify-command-surface.test.js): they prove the command TELLS the model
// to assemble after the workflow and report before the readout, not that a run obeyed.
// Order is asserted with indexOf comparisons, so moving a step is caught, not only deleting it.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const FILES = {
  'create-trd.md': {
    core: path.join(REPO, 'packages/core/commands/create-trd.md'),
    mirror: path.join(REPO, '.claude/commands/create-trd.md'),
  },
  'plan.md': {
    core: path.join(REPO, 'packages/core/commands/plan.md'),
    mirror: path.join(REPO, '.claude/commands/plan.md'),
  },
};

const WORKFLOW = 'Workflow({ name: "create-trd"';
const ASSEMBLE = 'trd-grounding.js assemble';
const REPORT = 'trd-grounding.js report';
const READOUT = '\n## Readout';
const RETIRED = [
  'merge agent assembles',
  'ONE merge agent',
  'assembles one Section 10',
  'a merge step assembles',
];

describe.each(Object.keys(FILES))('%s grounding prose (FIX-003)', (name) => {
  const text = read(FILES[name].core);

  test('mirror under .claude/commands is byte-identical', () => {
    expect(read(FILES[name].mirror)).toBe(text);
  });

  test('assemble appears after the Workflow(create-trd) block', () => {
    const wf = text.indexOf(WORKFLOW);
    expect(wf).toBeGreaterThanOrEqual(0);
    const asm = text.indexOf(ASSEMBLE, wf);
    expect(asm).toBeGreaterThan(wf);
  });

  test('report appears after assemble and before the Readout heading', () => {
    const asm = text.indexOf(ASSEMBLE, text.indexOf(WORKFLOW));
    const rep = text.indexOf(REPORT);
    const readout = text.indexOf(READOUT);
    expect(rep).toBeGreaterThan(asm);
    expect(readout).toBeGreaterThan(rep);
  });

  test('passes grounding_dir under findings/grounding/', () => {
    const wf = text.indexOf(WORKFLOW);
    const m = text.slice(wf, wf + 1500).match(/grounding_dir:\s*"([^"]*)"/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/findings\/grounding\//);
  });

  test.each(RETIRED)('retired phrase "%s" is gone', (phrase) => {
    expect(flat(text)).not.toContain(phrase);
  });
});

describe('create-trd.md only: fallback path and readout wording', () => {
  const text = read(FILES['create-trd.md'].core);

  test('fallback path names the same assemble step', () => {
    const fb = text.indexOf('**Fallback.**');
    expect(fb).toBeGreaterThanOrEqual(0);
    // The fallback paragraph ends at the next blank line.
    const end = text.indexOf('\n\n', fb);
    expect(flat(text.slice(fb, end))).toContain(ASSEMBLE);
  });

  test('Grounding report section names ungrounded and sizing, and says reported, never STUCK', () => {
    const start = text.indexOf('## Grounding report');
    const end = text.indexOf(READOUT);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const section = flat(text.slice(start, end));
    expect(section).toContain('`ungrounded`');
    expect(section).toContain('`sizing`');
    expect(section).toMatch(/reported, never STUCK/);
  });
});

describe('plan.md only: readout wording', () => {
  test('names ungrounded list and sizing, reported never STUCK', () => {
    const text = read(FILES['plan.md'].core);
    const rep = text.indexOf(REPORT);
    const section = flat(text.slice(rep, text.indexOf(READOUT, rep)));
    expect(section).toContain('`ungrounded`');
    expect(section).toContain('`sizing`');
    expect(section).toMatch(/never STUCK/);
  });
});
