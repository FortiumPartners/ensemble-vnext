/**
 * /rebase-project's records-cutover prose is described accurately and the three copies match.
 * WHY: the cutover untracks files, so the prompt must say it only stages, never commits, how the
 * readout finds what happened, and how to undo it. The cutover itself is now the engine's
 * (`scaffold-project.sh --rebase`, step `recordsCutover`); the prompt only reads the result
 * from git and reports it, so these tests pin that contract and not the old per-step prose.
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
const flatten = (s) => s.replace(/\s+/g, ' ');
const readout = text.slice(text.indexOf('### Step 3: Readout'), text.indexOf('## Rollback'));
const rollback = text.slice(text.indexOf('## Rollback'), text.indexOf('## Error Handling'));

describe('Step 3 readout: records cutover', () => {
  test('sits after the engine call (Step 1) and conflict resolution (Step 2)', () => {
    const one = text.indexOf('### Step 1');
    const two = text.indexOf('### Step 2');
    const three = text.indexOf('### Step 3');
    expect(one).toBeGreaterThan(-1);
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
  });
  test('the engine owns the cutover: one call, and a recordsCutover step in its result', () => {
    expect(text).toContain('scaffold-project.sh" --rebase');
    expect(text).toMatch(/`recordsCutover`/);
    // The prompt must not carry its own cutover invocation any more.
    expect(text).not.toContain('--records-cutover');
  });
  test('reads untracked files from git, named by folder, with the full listing command', () => {
    expect(text).toContain('git diff --cached --name-only --diff-filter=D -- .trd-state');
    expect(flatten(readout)).toMatch(/named by feature folder/);
  });
  test('reads seeded refs and pushed-or-local from git, not from the engine', () => {
    expect(readout).toContain('git for-each-ref refs/ensemble/records/');
    expect(readout).toContain("git ls-remote origin 'refs/ensemble/records/*'");
    expect(flatten(readout)).toMatch(/no remote means local only/);
    expect(flatten(readout)).toMatch(/the engine does not report why a feature was not seeded/);
  });
  test('tells the owner to commit the untracking on the base branch', () => {
    expect(readout).toMatch(/commit the untracking on the base branch/);
  });
  test('sends a failed or unexpectedly skipped step to ISSUES', () => {
    expect(readout).toMatch(/ISSUES/);
    expect(readout).toMatch(/`failed: <why>`/);
  });
});

describe('Rollback', () => {
  test('names git restore --staged .trd-state', () => {
    expect(rollback).toContain('git restore --staged .trd-state');
  });
  test('says a pushed ref is not undone by git restore', () => {
    expect(flatten(rollback)).toMatch(/`git restore` does not undo a seeded ref, and it never undoes a ref that was pushed/);
    expect(rollback).toContain('git push origin --delete refs/ensemble/records/<slug>');
  });
  test('no longer claims exactly one commit of change', () => {
    expect(rollback).not.toMatch(/exactly one commit/);
  });
});

describe('copies', () => {
  test.each(COPIES.slice(1))('%s is identical to the core copy', (p) => {
    expect(read(p)).toBe(text);
  });
});
