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

test('the 4.7b report names where the untracked files came from and how to list them all', () => {
  expect(text).toContain('git diff --cached --name-only --diff-filter=D -- .trd-state');
  expect(text).toMatch(/files untracked \(staged, not committed\) from </);
});

describe('4.7b report (objective O7)', () => {
  const report = step.slice(step.indexOf('Report:'), step.indexOf('A non-zero exit'));
  const flat = report.replace(/\s+/g, ' ');
  test('names the folders untracked files came from, or the shared logs', () => {
    expect(flat).toContain('from <each `.trd-state/<folder>/` they came from, or the shared logs>');
    expect(flat).toMatch(/name the folders, not every file/);
  });
  test('names each seeded ref with its branch and whether it was pushed or kept local', () => {
    expect(flat).toContain('refs seeded: <slug> on <branch> (pushed or kept local)');
  });
  test('names skipped in-flight features with the reason', () => {
    expect(flat).toContain('skipped: <slug> (why)');
  });
  test('counts finished and branch-mismatch skips rather than naming them', () => {
    expect(flat).toMatch(/count the `finished` and `branch-mismatch` skips rather than naming them/);
  });
  test('tells the owner to commit the removal on the base branch', () => {
    expect(flat).toMatch(/If any file was untracked: "Commit this removal on the base branch/);
  });
  test('sends failed or unexplained skips to ISSUES', () => {
    const tail = step.replace(/\s+/g, ' ');
    expect(tail).toMatch(/each seed that failed or was skipped for a reason other than `finished`, `branch-mismatch`/);
    expect(tail).toContain('`ref-exists`, also goes under ISSUES');
  });
});

describe('Rollback', () => {
  test('names git restore --staged .trd-state', () => {
    expect(rollback).toContain('git restore --staged .trd-state');
  });
  test('says a pushed ref is not undone by git restore', () => {
    expect(rollback.replace(/\s+/g, ' ')).toMatch(/`git restore` does not undo a seeded ref, and it never undoes a ref that was pushed/);
    expect(rollback).toContain('git push origin --delete refs/ensemble/records/<slug>');
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
