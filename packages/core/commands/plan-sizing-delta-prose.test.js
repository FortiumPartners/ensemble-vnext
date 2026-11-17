'use strict';

// docs/TRD/fix-plan-sizing-delta-and-claims.md: pins plan.md's size line, delta check and claim wording.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const raw = read('packages/core/commands/plan.md');
const text = raw.replace(/\s+/g, ' ');
const at = (s, from = 0) => text.indexOf(s, from);

const start = at('### 2e.1. State the size');
const end = at('### 2f.', start);
const section = text.slice(start, end);
const step4 = text.slice(at('## Step 4:'), at('## Step 5:'));
const readout = text.slice(at('## Readout') >= 0 ? at('## Readout') : text.length);

describe('plan.md sizing delta and claims', () => {
  test('2e.1 sits after 2e and before 2f, Step 4 and Step 5', () => {
    expect(start).toBeGreaterThan(at('### 2e.'));
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(start).toBeLessThan(at('## Step 4:'));
    expect(start).toBeLessThan(at('## Step 5:'));
  });

  test('states a files-touched size line before any task is written', () => {
    expect(section).toContain('Before any task is written, state the size of the change as a count of the files it touches');
    expect(section).toContain('files touched');
    expect(section).toContain('It is a figure, not a ceiling');
  });

  test('finds a recent predecessor from git history and flags rebuilt work', () => {
    expect(section).toContain('git log <base branch> --merges');
    expect(section).toContain('already provides');
    expect(section).toContain('flag each planned task that rebuilds or re-tests');
    expect(section).toContain('there is no recent predecessor and nothing is flagged');
  });

  test('claim lines come in kept and cut forms', () => {
    expect(section).toContain('the description asks for <X> beyond the change; kept - <why>');
    expect(section).toContain('the description asks for <X> beyond the change; cut - <why>');
  });

  test('a must-pass criterion is never cut, and the spec path reports rather than cuts', () => {
    expect(section).toContain('A criterion the owner marked must-pass is never cut by this rule');
    expect(section).toContain('On the spec path (2g), scope is locked');
    expect(section).toContain('reported, not built');
    expect(section).toContain('is reported with the line, never cut');
  });

  test('Step 4 weighs the stated size and delta and keeps the no-ceiling wording', () => {
    expect(step4).toContain('**Weigh the stated size and the delta, not the description\'s list.**');
    expect(step4).toContain('no task-or-file ceiling to consult');
  });

  test('the readout mentions the beyond-the-change lines', () => {
    expect(text).toContain('DECISIONS carries every `the description asks for <X> beyond the change; kept / cut` line');
    expect(at('DECISIONS carries every `the description asks for <X> beyond the change')).toBeGreaterThan(at('## Step 5:'));
  });

  test('vendored .claude/ copy is byte-identical', () => {
    expect(read('.claude/commands/plan.md')).toBe(raw);
  });
});
