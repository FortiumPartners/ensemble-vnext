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
// An exclude pathspec (`':(exclude).trd-state'`) keeps records OUT of the add: not a hit.
const EXCLUDE = /':(\(exclude\)|!)\.trd-state\/?'/g;
const badLines = (text) => text.split('\n').filter((l) => BAD_GIT.test(l.replace(EXCLUDE, '')));

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
  test('an exclude pathspec for the records is not a hit, an include still is', () => {
    expect(badLines("git add -A -- . ':(exclude).trd-state'")).toEqual([]);
    expect(badLines("git add -A -- . ':!.trd-state/'")).toEqual([]);
    expect(badLines("git add -A -- . ':(exclude).trd-state' .trd-state/x")).toHaveLength(1);
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

// Pinned count of `record-ref.js write` occurrences per touched file, as they stand today.
// WHY an exact count and not toContain: removing one of several write lines must fail.
// A change that adds or removes a write line must update this map on purpose.
const WRITE_COUNTS = {
  'commands/implement-trd.md': 3,
  'commands/audit-build.md': 1,
  'commands/close-feature.md': 1,
  'commands/ship-build.md': 2,
  'commands/verify-build.md': 2,
  'commands/plan.md': 2,
  'commands/amend.md': 1,
  'commands/refine-verification.md': 1,
  'commands/task.md': 1,
  'commands/sweep.md': 2,
  'contracts/ship-primitive-push.md': 1,
};
const countWrites = (text) => text.split(WRITE).length - 1;

describe('touched writers name record-ref.js write the pinned number of times', () => {
  test('the map covers every TOUCHED command and the push contract', () => {
    expect(Object.keys(WRITE_COUNTS).sort()).toEqual(
      [...TOUCHED.map((f) => `commands/${f}`), 'contracts/ship-primitive-push.md'].sort(),
    );
  });
  test.each(Object.entries(WRITE_COUNTS))('%s has %i', (rel, n) => {
    expect(countWrites(read(path.join(ROOT, 'packages/core', rel)))).toBe(n);
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

// Step 5 order of /implement-trd. WHY: the checkpoint must record the commit this phase produced,
// and the records-ref write must carry the checkpoint that names it. Reading COMMIT_SHA before the
// commit records the previous phase's commit; writing before the checkpoint ships a stale record.
describe('implement-trd.md Step 5 order', () => {
  const step5 = (file) => {
    const text = read(file);
    const from = text.indexOf('## Step 5');
    const to = text.indexOf('## Step 6');
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    return text.slice(from, to);
  };
  const idx = (section, needle) => {
    const i = section.indexOf(needle);
    expect(i).toBeGreaterThanOrEqual(0); // a missing anchor must fail, not compare as -1
    return i;
  };

  test.each([
    ['template', path.join(CMD_DIR, 'implement-trd.md')],
    ['.claude copy', path.join(ROOT, '.claude/commands/implement-trd.md')],
  ])('%s: add -> commit -> COMMIT_SHA -> checkpoint -> records write', (_label, file) => {
    const s = step5(file);
    const add = idx(s, 'git add -A');
    const commit = idx(s, 'git commit');
    const sha = idx(s, 'COMMIT_SHA=$(git rev-parse HEAD)');
    const checkpoint = idx(s, 'checkpoint(state');
    const write = idx(s, 'record-ref.js write');
    const step = idx(s, '--step "phase N checkpoint"');
    expect(add).toBeLessThan(commit);
    expect(commit).toBeLessThan(sha);
    expect(sha).toBeLessThan(checkpoint);
    expect(checkpoint).toBeLessThan(write);
    expect(write).toBeLessThan(step);
  });

  test('template and .claude copy are identical', () => {
    expect(read(path.join(ROOT, '.claude/commands/implement-trd.md'))).toBe(read(path.join(CMD_DIR, 'implement-trd.md')));
  });
});
