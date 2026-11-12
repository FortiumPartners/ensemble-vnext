/**
 * Writers send run records to the records ref, never to a branch commit.
 * WHY: records kept on `refs/ensemble/records/<feature>` must not also ride a hand-written
 * `git add`/`git commit` of a `.trd-state/` path; the library's own fallback is the only one.
 *
 * Run with: npx jest packages/core/commands/records-ref-writers-prose.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CMD_DIR = __dirname;
const ROOT = path.resolve(__dirname, '../../..');
const CONTRACT_DIR = path.join(ROOT, 'packages/core/contracts');
const WRITE = 'record-ref.js write';

// Line-based: a git add/commit naming a records path in the same code span (no backtick between,
// so prose like "`git commit` line ... names `.trd-state/`" or a later `discovered.resolve(<work.stateDir>…)` is not a hit).
const BAD_GIT = /git\s+(add|commit)\b[^`]*(\.trd-state|<state-dir>|<work\.stateDir>)/;

const read = (p) => fs.readFileSync(p, 'utf8');
const badLines = (text) => text.split('\n').filter((l) => BAD_GIT.test(l));

const TOUCHED = [
  'implement-trd.md', 'audit-build.md', 'close-feature.md', 'ship-build.md', 'verify-build.md',
  'plan.md', 'amend.md', 'refine-verification.md', 'task.md', 'sweep.md',
];
const commandFiles = fs.readdirSync(CMD_DIR).filter((f) => f.endsWith('.md'));
const contractFiles = fs.readdirSync(CONTRACT_DIR).filter((f) => f.endsWith('.md'));

describe('matcher', () => {
  test('flags records paths in git add/commit lines', () => {
    expect(BAD_GIT.test('git commit -- .trd-state/x')).toBe(true);
    expect(BAD_GIT.test('git add -- <state-dir>')).toBe(true);
    expect(BAD_GIT.test('  git commit -m x -- <work.stateDir>')).toBe(true);
  });
  test('ignores other lines', () => {
    expect(BAD_GIT.test('check-never-unattended --files .trd-state/<slug>-sweep/')).toBe(false);
    expect(BAD_GIT.test('git commit -m "fix" -- src/a.js')).toBe(false);
    expect(BAD_GIT.test('no `git commit` line names a `.trd-state/` path')).toBe(false);
  });
});

describe('no hand-written commit of a records path', () => {
  test.each(commandFiles)('command %s', (f) => {
    expect(badLines(read(path.join(CMD_DIR, f)))).toEqual([]);
  });
  test.each(contractFiles)('contract %s', (f) => {
    expect(badLines(read(path.join(CONTRACT_DIR, f)))).toEqual([]);
  });
});

describe('touched writers name record-ref.js write', () => {
  test.each(TOUCHED)('%s', (f) => {
    expect(read(path.join(CMD_DIR, f))).toContain(WRITE);
  });
  test('ship-primitive-push.md', () => {
    expect(read(path.join(CONTRACT_DIR, 'ship-primitive-push.md'))).toContain(WRITE);
  });
});

describe('plan.md §7a.5', () => {
  test('commit-list sentence names no .trd-state/ path', () => {
    const s = read(path.join(CMD_DIR, 'plan.md'));
    const start = s.indexOf('5. **`commit`.**');
    expect(start).toBeGreaterThan(-1);
    const next = s.indexOf('**Before `git add`', start);
    const block = s.slice(start, next > start ? next : undefined);
    // the commit-list sentence: from "The list is" to its full stop
    const m = block.match(/The list is[^.]*\./);
    expect(m).not.toBeNull();
    expect(m[0]).not.toContain('.trd-state/');
  });
});

describe('command-status.md carries the rule', () => {
  const copies = [
    path.join(ROOT, 'packages/core/templates/claude-directory/rules/command-status.md'),
    path.join(ROOT, '.claude/rules/command-status.md'),
  ];
  test.each(copies)('%s', (p) => {
    const s = read(p);
    expect(s).toContain(WRITE);
    expect(s).toContain('record-ref.js ensure');
  });
  test('template and .claude copy are identical', () => {
    expect(read(copies[0])).toBe(read(copies[1]));
  });
});

describe('.claude/commands copies', () => {
  test.each(TOUCHED)('%s is byte-identical', (f) => {
    expect(read(path.join(ROOT, '.claude/commands', f))).toBe(read(path.join(CMD_DIR, f)));
  });
});
