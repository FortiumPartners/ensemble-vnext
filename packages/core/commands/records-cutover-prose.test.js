/**
 * /rebase-project Step 4.7b (records cutover) is described accurately and the three copies match.
 * WHY: the step untracks files, so its prose must say it only stages, never commits, seeds
 * in-flight features only, and how to undo it.
 *
 * Run with: npx jest packages/core/commands/records-cutover-prose.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const COPIES = [
  'packages/core/commands/rebase-project.md',
  '.claude/commands/rebase-project.md',
  'packages/full/commands/plugin-only/rebase-project.md',
];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const text = read(COPIES[0]);
const step = text.slice(text.indexOf('#### 4.7b'), text.indexOf('#### 4.8 '));
const rollback = text.slice(text.indexOf('## Rollback'), text.indexOf('## Error Handling'));

describe('Step 4.7b', () => {
  test('sits after 4.7a and before 4.8', () => {
    const a = text.indexOf('#### 4.7a');
    const b = text.indexOf('#### 4.7b');
    const c = text.indexOf('#### 4.8 ');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
  test('names the mode and says untracking is staged, never committed', () => {
    expect(step).toContain('--records-cutover');
    expect(step).toMatch(/staged, never committed/);
  });
  test('says finished features get no ref', () => {
    expect(step.replace(/\s+/g, ' ')).toMatch(/finished features get no ref/i);
  });
  test('report lists untracked files and seeded refs, with warnings under ISSUES', () => {
    expect(step).toMatch(/Records cutover: .*files untracked/);
    expect(step).toMatch(/refs seeded/);
    expect(step).toMatch(/\[WARN\]/);
    expect(step).toMatch(/ISSUES/);
  });
  test('tells the owner to commit the removal on the base branch', () => {
    expect(step).toMatch(/Commit this removal on the base branch/);
  });
});

describe('Rollback', () => {
  test('names git restore --staged .trd-state', () => {
    expect(rollback).toContain('git restore --staged .trd-state');
  });
  test('no longer claims exactly one commit of change', () => {
    expect(rollback).not.toMatch(/exactly one commit/);
  });
});

describe('4.7a', () => {
  test('no longer says the ignore-only lines are never untracked without scoping it', () => {
    const a = text.slice(text.indexOf('#### 4.7a'), text.indexOf('#### 4.7b'));
    expect(a).not.toMatch(/which are never untracked/);
  });
});

describe('copies', () => {
  test.each(COPIES.slice(1))('%s is identical to the core copy', (p) => {
    expect(read(p)).toBe(text);
  });
});
