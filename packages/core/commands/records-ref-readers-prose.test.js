/**
 * Resume paths restore a feature's records from the records ref before their first state read.
 * WHY: with records kept on a ref, a fresh worktree has no `.trd-state/<feature>/`; a command
 * that reads first would see "not closed" or "no state". `plan.md` needs no prose of its own.
 *
 * Run with: npx jest packages/core/commands/records-ref-readers-prose.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ENSURE = 'record-ref.js ensure --state-dir';

// file -> the text of the first state read that follows its argument parsing
const FIRST_READ = {
  'implement-trd.md': 'Then, if `.trd-state/<feature>/closed.json` exists:',
  'amend.md': 'Then, if `.trd-state/<feature>/closed.json` exists,',
  'task.md': 'Resume the most recent unclosed',
  'verify-build.md': '- `.trd-state/<feature>/success-definition.md`',
  'refine-verification.md': '| Latest verification report',
  'ship-build.md': 'A full feature with no `.trd-state/<feature>/closed.json`',
};

describe('records-ref readers: ensure before the first state read', () => {
  test.each(Object.keys(FIRST_READ))('%s', (file) => {
    const s = read(file);
    const e = s.indexOf(ENSURE);
    const r = s.indexOf(FIRST_READ[file]);
    expect(e).toBeGreaterThan(-1);
    expect(r).toBeGreaterThan(-1);
    expect(e).toBeLessThan(r);
    expect(s).toContain('records ref could not be fetched');
  });

  test('implement-trd ensures before any closed.json check', () => {
    const s = read('implement-trd.md');
    expect(s.indexOf(ENSURE)).toBeLessThan(s.indexOf('`.trd-state/<feature>/closed.json` exists'));
  });

  test('task names the single task-* fetch, read-record --local and list --remote', () => {
    const s = read('task.md');
    expect(s).toContain("git fetch origin '+refs/ensemble/records/task-*:refs/ensemble/records/task-*'");
    expect(s).toContain('record-ref.js read-record --local');
    expect(s).toContain('record-ref.js list --remote');
  });

  test('plan.md still reads its stored link through artifacts.js get and adds no ensure', () => {
    const s = read('plan.md');
    expect(s).toMatch(/artifacts\.js get/);
    expect(s).not.toContain(ENSURE);
  });

  test('.claude/commands copies are byte-identical', () => {
    for (const f of Object.keys(FIRST_READ)) {
      expect(fs.readFileSync(path.join(__dirname, '../../../.claude/commands', f), 'utf8')).toBe(read(f));
    }
  });

  test('ship-build restores only under --resume and otherwise reads closed.json alone, with the identity check', () => {
    const s = fs.readFileSync(path.join(__dirname, 'ship-build.md'), 'utf8');
    expect(s).toContain('Under\n`--resume`, restore the folder');
    expect(s).toContain('record-ref.js read-record --state-dir .trd-state/<feature> --file closed.json');
  });
});
