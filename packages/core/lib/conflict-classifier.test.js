'use strict';

/**
 * Tests for conflict-classifier.js: classes, forbidden path forms, mechanical rules and behavioural
 * reasons (asserted by code), stop rules, STUCK text, the CLI, the mirror, and a pinned list of
 * mutations the assertions must catch.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(__dirname, 'conflict-classifier.js');
const cc = require('./conflict-classifier');
const { classify, decide, stuckText, isForbidden } = cc;

const h = (base, ours, theirs) => ({ base, ours, theirs });
const file = (p, hunks, extra = {}) => ({ path: p, hunks, ...extra });
const one = (f, featureTrd) => classify({ files: [f], featureTrd }).files[0];
const barrel = (p = 'src/index.ts') =>
  file(p, [h(['export * from "./a"'], ['export * from "./a"', 'export * from "./b"'], ['export * from "./a"', 'export * from "./c"'])]);

describe('input handling', () => {
  test.each([[undefined], [{}], [{ files: [] }], [{ files: 'x' }], [{ files: [{}] }], [{ files: [{ path: '' }] }], [{ files: [null] }]])(
    'malformed input %j returns ok false',
    (input) => {
      const r = classify(input);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
    },
  );
});

describe('forbidden paths', () => {
  test.each([
    ['.claude/rules/x.md'],
    ['.claude/rules/sub/dir/y.md'],
    ['.claude/rules'],
    ['./.claude/rules/x.md'],
    ['.claude/rules/../rules/x.md'],
    ['.CLAUDE/RULES/x.md'],
    ['.claude//rules//x.md'],
    ['.claude\\rules\\x.md'],
  ])('rules file %s is forbidden with stopNow', (p) => {
    const r = classify({ files: [file(p, [h([], ['a'], ['b'])])] });
    expect(r.class).toBe('forbidden');
    expect(r.stop).toBe(true);
    expect(r.stopNow).toBe(true);
    expect(r.files[0].class).toBe('forbidden');
    expect(r.files[0].reason).toBe('rules-file');
  });

  test.each([['docs/TRD/other.md'], ['docs/TRD/sub/other.md'], ['./docs/TRD/other.md'], ['DOCS/trd/other.md'], ['docs/x/../TRD/other.md']])(
    "another feature's TRD %s is forbidden",
    (p) => {
      const f = one(file(p, [h([], ['a'], ['b'])]), 'docs/TRD/mine.md');
      expect(f.class).toBe('forbidden');
      expect(f.reason).toBe('other-trd');
    },
  );

  test('with no featureTrd every TRD is forbidden', () => {
    expect(one(file('docs/TRD/mine.md', [h([], ['a'], ['b'])])).reason).toBe('other-trd');
  });

  test("the feature's own TRD is not forbidden, in any spelling of its path", () => {
    for (const p of ['docs/TRD/mine.md', './docs/TRD/mine.md', 'docs/TRD/../TRD/mine.md']) {
      expect(one(barrelLike(p), 'docs/TRD/mine.md').class).toBe('mechanical');
    }
    expect(isForbidden('docs/TRD/mine.md', './docs/TRD/mine.md')).toBe(false);
  });

  test('featureTrd is compared exactly, case included', () => {
    expect(isForbidden('docs/TRD/Mine.md', 'docs/TRD/mine.md')).toBe(true);
    expect(isForbidden('docs/TRD/mine.md', 'docs/TRD/mine.md')).toBe(false);
  });

  test('the feature own TRD is graded by its hunks: overlapping edits are behavioural', () => {
    const f = one(file('docs/TRD/mine.md', [h(['x'], ['y'], ['z'])]), 'docs/TRD/mine.md');
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('overlap');
  });

  test.each([['/etc/passwd'], ['C:/x/y.md'], ['c:\\x\\y.md'], ['../outside.md'], ['a/../../outside.md'], ['..']])(
    'path outside the repository %s is forbidden',
    (p) => {
      const f = one(file(p, [h([], ['a'], ['a'])]));
      expect(f.class).toBe('forbidden');
      expect(f.reason).toBe('outside-repo');
    },
  );

  test('oldPath of a rename is checked too', () => {
    const f = one(file('docs/notes.md', [h([], ['a'], ['a'])], { oldPath: '.claude/rules/x.md' }));
    expect(f.class).toBe('forbidden');
    expect(f.reason).toBe('rules-file');
    const g = one(file('docs/notes.md', [h([], ['a'], ['a'])], { oldPath: 'docs/TRD/other.md' }), 'docs/TRD/mine.md');
    expect(g.reason).toBe('other-trd');
  });

  test('a similarly named path is not forbidden', () => {
    expect(isForbidden('.claude/rules-extra/x.md')).toBe(false);
    expect(isForbidden('docs/TRDS/x.md')).toBe(false);
    expect(isForbidden('docs/PRD/x.md')).toBe(false);
  });

  test('forbidden wins over a mechanical file in the same set', () => {
    const r = classify({ files: [barrel(), file('.claude/rules/x.md', [h([], ['a'], ['b'])])] });
    expect(r.class).toBe('forbidden');
    expect(r.stopNow).toBe(true);
  });

  test('a forbidden path is never a record file, even when isRecordFile would say yes', () => {
    jest.isolateModules(() => {
      jest.doMock('./record-files', () => ({ isRecordFile: () => true }));
      const mocked = require('./conflict-classifier');
      const f = mocked.classify({ files: [file('.claude/rules/x.md', [])] }).files[0];
      expect(f.class).toBe('forbidden');
    });
    jest.dontMock('./record-files');
  });
});

function barrelLike(p) {
  return file(p, [h(['- a'], ['- a', '- b'], ['- a', '- c'])]);
}

describe('record files (isRecordFile is called, not copied)', () => {
  test.each([['.trd-state/a/implement.json'], ['OWNER-CALLS.md'], ['.claude/verification-notes.md']])('%s is record', (p) => {
    const r = classify({ files: [file(p, [h(['x'], ['y'], ['z'])])] });
    expect(r.class).toBe('record');
    expect(r.stop).toBe(false);
    expect(r.files[0].reason).toBe('record-file');
  });

  test.each([['./.trd-state/x'], ['.TRD-STATE/x'], ['docs/.trd-state/x']])('%s is not a record file here, as in mergeBase', (p) => {
    expect(one(file(p, [h(['x'], ['y'], ['z'])])).class).toBe('behavioural');
  });

  test('a mocked isRecordFile returning true makes a made-up path record', () => {
    jest.isolateModules(() => {
      jest.doMock('./record-files', () => ({ isRecordFile: (p) => p === 'made/up/path.txt' }));
      const mocked = require('./conflict-classifier');
      expect(mocked.classify({ files: [file('made/up/path.txt', [])] }).class).toBe('record');
      expect(mocked.classify({ files: [file('other.txt', [])] }).class).toBe('behavioural');
    });
    jest.dontMock('./record-files');
  });

  test('isRecordFile receives the path exactly as given', () => {
    const seen = [];
    jest.isolateModules(() => {
      jest.doMock('./record-files', () => ({ isRecordFile: (p) => (seen.push(p), false) }));
      require('./conflict-classifier').classify({ files: [file('./A/b.txt', [h([], ['a'], ['a'])])] });
    });
    jest.dontMock('./record-files');
    expect(seen).toEqual(['./A/b.txt']);
  });

  test('the source defines no record path literal and requires ./record-files', () => {
    const src = fs.readFileSync(LIB, 'utf8');
    expect(src).toMatch(/require\('\.\/record-files'\)/);
    expect(src).not.toMatch(/\.trd-state/);
    expect(src).not.toMatch(/OWNER-CALLS/);
    expect(src).not.toMatch(/verification-notes/);
  });
});

describe('mechanical rules', () => {
  test('(b) both sides add entries to a barrel', () => {
    const f = one(barrel());
    expect(f.class).toBe('mechanical');
    expect(f.reason).toBe('list-additions');
  });

  test('(b) both sides add models to a prisma schema at one place', () => {
    const f = one(file('prisma/schema.prisma', [h([], ['model A {}'], ['model B {}'])]));
    expect(f.class).toBe('mechanical');
  });

  test('(b) additions are list entries by line shape in a non-list path', () => {
    const f = one(file('docs/list.md', [h(['- a'], ['- a', '- b'], ['- a', '- c'])]));
    expect(f.class).toBe('mechanical');
  });

  test('(b) additions at the same place in a non-list file with prose lines are behavioural same-place', () => {
    const f = one(file('src/a.js', [h(['x();'], ['x();', 'doThing(1);'], ['x();', 'doOther(2);'])]));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('same-place');
  });

  test('(a) the package.json comma case is mechanical', () => {
    const f = one(
      file('package.json', [h(['    "a": "1"'], ['    "a": "1",', '    "b": "2"'], ['    "a": "1",', '    "c": "3"'])]),
    );
    expect(f.class).toBe('mechanical');
  });

  test('(a) the same edit by both sides is mechanical', () => {
    const f = one(file('src/a.js', [h(['old'], ['new'], ['new'])]));
    expect(f.class).toBe('mechanical');
  });

  test('(c) edits to adjacent but different base lines are disjoint', () => {
    const f = one(file('src/a.js', [h(['one', 'two'], ['ONE', 'two'], ['one', 'TWO'])]));
    expect(f.class).toBe('mechanical');
    expect(f.reason).toBe('disjoint');
  });

  test('(c) edits far apart are disjoint', () => {
    const base = ['a', 'b', 'c', 'd', 'e'];
    const f = one(file('src/a.js', [h(base, ['A', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'E'])]));
    expect(f.class).toBe('mechanical');
  });

  test('(d) a test file flagged testBrokenByBase with no hunks is mechanical', () => {
    const f = one({ path: 'src/a.test.js', testBrokenByBase: true });
    expect(f.class).toBe('mechanical');
    expect(f.reason).toBe('test-broken-by-base');
    expect(one({ path: 'src/a.test.js', testBrokenByBase: true, hunks: [] }).class).toBe('mechanical');
  });

  test('(d) a flagged test file with hunks is mechanical unless both sides changed the same lines differently', () => {
    expect(one(file('tests/a.js', [h(['x'], ['x', 'y'], ['x'])], { testBrokenByBase: true })).class).toBe('mechanical');
    const bad = one(file('tests/a.js', [h(['x'], ['y'], ['z'])], { testBrokenByBase: true }));
    expect(bad.class).toBe('behavioural');
    expect(bad.reason).toBe('overlap');
  });

  test('(d) the flag on a non-test file does nothing', () => {
    expect(one({ path: 'src/a.js', testBrokenByBase: true }).reason).toBe('no-hunks');
  });

  test('without the flag a test file is graded by its hunks', () => {
    expect(one({ path: 'src/a.test.js' }).reason).toBe('no-hunks');
    expect(one(file('src/a.test.js', [h(['x'], ['y'], ['z'])])).class).toBe('behavioural');
    expect(one(file('src/a.test.js', [h(['a', 'b'], ['A', 'b'], ['a', 'B'])])).class).toBe('mechanical');
  });

  test('a record plus a mechanical file is mechanical', () => {
    const r = classify({ files: [file('.trd-state/a/implement.json', []), barrel()] });
    expect(r.class).toBe('mechanical');
    expect(r.stop).toBe(false);
  });

  test('the feature own TRD is graded mechanical when its hunks are', () => {
    const r = classify({
      files: [file('docs/TRD/mine.md', [h(['a', 'b'], ['A', 'b'], ['a', 'B'])])],
      featureTrd: 'docs/TRD/mine.md',
    });
    expect(r.class).toBe('mechanical');
  });
});

describe('regressions found in review', () => {
  test('a shared first-line edit does not hide a line both sides changed differently', () => {
    const f = one(file('README.md', [h(['- a', '- b'], ['- A', '- b2'], ['- A', '- b3'])]));
    expect(f.class).toBe('behavioural');
  });

  test('a key inserted by one side and written by the other\'s replacement is a same-key clash', () => {
    const f = one(file('config.yaml', [h(['a: 1', 'b: 2', 'c: 3'], ['a: 1', 'b: 2', 'c: 3', 'k: 5'], ['k: 7', 'b: 2', 'c: 3'])]));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('same-key');
  });

  test('the same key added by both sides in different places is a duplicate', () => {
    const f = one(file('config.yaml', [h(['a: 1', 'b: 2', 'c: 3'], ['a: 1', 'k: 9', 'b: 2', 'c: 3'], ['a: 1', 'b: 2', 'c: 3', 'k: 9'])]));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('same-key');
  });

  test('both sides deleting the same lines is a shared edit, mechanical', () => {
    const f = one(file('src/a.js', [h(['a', 'b', 'c'], ['a', 'c'], ['a', 'c'])]));
    expect(f.class).toBe('mechanical');
  });
});

describe('behavioural reasons', () => {
  const reason = (f) => one(f);

  test('overlap: both sides changed the same line differently', () => {
    const f = reason(file('src/a.js', [h(['x'], ['y'], ['z'])]));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('overlap');
    expect(f.clash).toMatch(/"y"/);
    expect(f.clash).toMatch(/"z"/);
  });

  test('overlap: an insertion beside a line the other side changed', () => {
    for (const [ours, theirs] of [
      [['a', 'NEW', 'b'], ['a', 'B']],
      [['a', 'b', 'NEW'], ['a', 'B']],
      [['NEW', 'a', 'b'], ['A', 'b']],
    ]) {
      const f = reason(file('src/a.js', [h(['a', 'b'], ours, theirs)]));
      expect(f.reason).toBe('overlap');
    }
  });

  test('same-key: one key given two values', () => {
    const f = reason(file('config.yml', [h(['a: 1'], ['a: 1', 'port: 80'], ['a: 1', 'port: 81'])]));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('same-key');
    expect(f.clash).toMatch(/port/);
  });

  test('same-key at different places in the hunk', () => {
    const f = reason(file('config.yml', [h(['a: 1', 'b: 2'], ['port: 80', 'a: 1', 'b: 2'], ['a: 1', 'b: 2', 'port: 81'])]));
    expect(f.reason).toBe('same-key');
  });

  test('the same key with the same value is not a clash', () => {
    const f = reason(file('config.yml', [h(['a: 1'], ['a: 1', 'port: 80', 'x: 1'], ['a: 1', 'port: 80', 'y: 1'])]));
    expect(f.class).toBe('mechanical');
  });

  test('same-decl: a same-named declaration added with different bodies', () => {
    const f = reason(file('src/util.js', [h(['// a', '// b'], ['function go() { return 1; }', '// a', '// b'], ['// a', '// b', 'function go() { return 2; }'])]));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('same-decl');
    expect(f.clash).toMatch(/go/);
  });

  test('no-hunks: missing, empty or absent hunks', () => {
    expect(reason({ path: 'src/a.js' }).reason).toBe('no-hunks');
    expect(reason({ path: 'src/a.js', hunks: [] }).reason).toBe('no-hunks');
    expect(reason({ path: 'src/a.js', hunks: null }).reason).toBe('no-hunks');
  });

  test('malformed hunks', () => {
    for (const hunks of ['x', [null], [{ base: [], ours: [] }], [{ base: [1], ours: [], theirs: [] }]]) {
      expect(reason({ path: 'src/a.js', hunks }).reason).toBe('malformed');
    }
  });

  test('deleted: deletedBy', () => {
    const f = reason(file('src/a.js', [h(['x'], ['x'], [])], { deletedBy: 'theirs' }));
    expect(f.class).toBe('behavioural');
    expect(f.reason).toBe('deleted');
    expect(f.clash).toMatch(/theirs/);
  });

  test('binary', () => {
    expect(reason(file('img.png', [], { binary: true })).reason).toBe('binary');
  });

  test('non-regular: symlink and submodule modes', () => {
    for (const mode of ['120000', '160000', 120000]) {
      expect(reason(file('src/a.js', [h(['x'], ['x', 'y'], ['x', 'z'])], { mode })).reason).toBe('non-regular');
    }
  });

  test('regular modes are allowed', () => {
    for (const mode of ['100644', '100755']) {
      expect(reason(barrel('src/index.ts')).class).toBe('mechanical');
      expect(reason({ ...barrel(), mode }).class).toBe('mechanical');
    }
  });

  test('too-large: more than 500 lines on a side, 500 is allowed', () => {
    const lines = (n) => Array.from({ length: n }, (_, i) => 'line ' + i);
    expect(reason(file('src/a.js', [h(lines(501), lines(501), lines(501))])).reason).toBe('too-large');
    expect(reason(file('src/a.js', [h([], lines(501), [])])).reason).toBe('too-large');
    expect(reason(file('src/a.js', [h([], [], lines(501))])).reason).toBe('too-large');
    expect(reason(file('src/a.js', [h(lines(500), lines(500), lines(500))])).class).toBe('mechanical');
  });

  test('one behavioural hunk makes the whole file behavioural', () => {
    const f = reason(file('src/a.js', [h(['a'], ['a', 'b'], ['a']), h(['x'], ['y'], ['z'])]));
    expect(f.reason).toBe('overlap');
  });

  test('behavioural wins over mechanical, forbidden wins over behavioural', () => {
    const r = classify({ files: [barrel(), file('src/a.js', [h(['x'], ['y'], ['z'])])] });
    expect(r.class).toBe('behavioural');
    expect(r.stop).toBe(true);
    expect(r.stopNow).toBe(false);
    const r2 = classify({ files: [file('src/a.js', [h(['x'], ['y'], ['z'])]), file('.claude/rules/a.md', [])] });
    expect(r2.class).toBe('forbidden');
  });

  test('a mechanical set does not stop', () => {
    const r = classify({ files: [barrel()] });
    expect(r).toMatchObject({ ok: true, class: 'mechanical', stop: false, stopNow: false });
  });
});

describe('decide: the stop rules', () => {
  const cls = (files) => classify({ files });
  const mech = cls([barrel()]);

  test('forbidden stops at once', () => {
    const d = decide({ classification: cls([file('.claude/rules/x.md', [])]) });
    expect(d).toMatchObject({ action: 'stop', effectiveClass: 'forbidden', stop: true, escalated: false });
  });

  test('behavioural stops', () => {
    const d = decide({ classification: cls([file('a.js', [h(['x'], ['y'], ['z'])])]) });
    expect(d).toMatchObject({ action: 'stop', effectiveClass: 'behavioural', stop: true, escalated: false });
  });

  test('record is a record-merge', () => {
    const d = decide({ classification: cls([file('.trd-state/a/implement.json', [])]) });
    expect(d).toMatchObject({ action: 'record-merge', effectiveClass: 'record', stop: false });
  });

  test('mechanical, unresolved: resolve', () => {
    expect(decide({ classification: mech, resolved: false })).toMatchObject({ action: 'resolve', stop: false });
  });

  test('mechanical, resolved, checks passing: commit', () => {
    expect(decide({ classification: mech, resolved: true, checksFailed: false })).toMatchObject({ action: 'commit', stop: false });
  });

  test.each([[0], [1], [undefined]])('checks failed with %s failed fix attempts: fix', (n) => {
    const d = decide({ classification: mech, resolved: true, checksFailed: true, failedAttempts: n });
    expect(d).toMatchObject({ action: 'fix', effectiveClass: 'mechanical', stop: false, escalated: false });
  });

  test.each([[2], [3], ['2']])('checks failed with %s failed fix attempts: stop, escalated to behavioural', (n) => {
    const d = decide({ classification: mech, resolved: true, checksFailed: true, failedAttempts: n });
    expect(d).toMatchObject({ action: 'stop', effectiveClass: 'behavioural', stop: true, escalated: true });
  });

  test('the attempt count does not matter while the checks pass', () => {
    expect(decide({ classification: mech, resolved: true, checksFailed: false, failedAttempts: 5 }).action).toBe('commit');
  });

  test('an invalid or missing classification stops as behavioural', () => {
    for (const classification of [undefined, { ok: false, reason: 'x' }]) {
      expect(decide({ classification })).toMatchObject({ action: 'stop', effectiveClass: 'behavioural', stop: true });
    }
    expect(decide()).toMatchObject({ action: 'stop', stop: true });
  });
});

describe('stuckText', () => {
  test('forbidden names the file and the rule, one Reason line', () => {
    const c = classify({ files: [file('.claude/rules/x.md', []), file('docs/TRD/other.md', [])], featureTrd: 'docs/TRD/mine.md' });
    const s = stuckText({ classification: c, command: '/ship-build' });
    expect(s.reason).toContain('.claude/rules/x.md');
    expect(s.reason).toContain('docs/TRD/other.md');
    expect(s.reason).toMatch(/rules file/);
    expect(s.reason).toMatch(/TRD/);
    expect(s.reason).not.toMatch(/\n/);
    expect(s.next).toMatch(/by hand/);
    expect(s.text).toBe('═══ COMMAND STUCK: /ship-build ═══\nReason: ' + s.reason + '\nNext:   ' + s.next);
  });

  test('forbidden text omits files that did not force the stop', () => {
    const c = classify({ files: [barrel('src/index.ts'), file('.claude/rules/x.md', [])] });
    const s = stuckText({ classification: c });
    expect(s.reason).toContain('.claude/rules/x.md');
    expect(s.reason).not.toContain('src/index.ts');
  });

  test('forbidden set also names a behavioural file beside it, with its clash', () => {
    const c = classify({ files: [file('src/a.js', [h(['x'], ['A1'], ['B1'])]), file('.claude/rules/r.md', []), barrel('src/index.ts')] });
    expect(c.class).toBe('forbidden');
    const s = stuckText({ classification: c, command: '/ship-build' });
    expect(s.reason).toContain('.claude/rules/r.md');
    expect(s.reason).toMatch(/rules file/);
    expect(s.reason).toContain('src/a.js');
    expect(s.reason).toContain('A1');
    expect(s.reason).toContain('B1');
    expect(s.reason.indexOf('.claude/rules/r.md')).toBeLessThan(s.reason.indexOf('src/a.js'));
    expect(s.reason).not.toContain('src/index.ts');
    expect(s.reason).not.toMatch(/\n/);
    expect(s.next).toMatch(/by hand/);
  });

  test('behavioural names every clashing file with its differing lines', () => {
    const c = classify({
      files: [file('src/a.js', [h(['x'], ['y1'], ['z1'])]), file('config.yml', [h([], ['port: 80'], ['port: 81'])]), barrel()],
    });
    const s = stuckText({ classification: c, command: '/ship-build' });
    expect(s.reason).toContain('src/a.js');
    expect(s.reason).toContain('y1');
    expect(s.reason).toContain('z1');
    expect(s.reason).toContain('config.yml');
    expect(s.reason).toContain('port');
    expect(s.reason).not.toContain('src/index.ts');
    expect(s.reason).not.toMatch(/\n/);
    expect(s.text.split('\n')).toHaveLength(3);
    expect(s.text.split('\n')[0]).toBe('═══ COMMAND STUCK: /ship-build ═══');
    expect(s.text.split('\n')[2]).toMatch(/^Next: {3}/);
  });

  test('a multi-line failure is flattened to one line', () => {
    const c = classify({ files: [barrel()] });
    const s = stuckText({ classification: c, failedAttempts: 2, lastFailure: 'npm test failed\n  3 tests\n\tfailing' });
    expect(s.reason).not.toMatch(/\n/);
  });

  test('escalated stop names the file, the attempts and the failing check', () => {
    const c = classify({ files: [barrel()] });
    const s = stuckText({ classification: c, command: '/ship-build', failedAttempts: 2, lastFailure: 'npx jest: 3 failed' });
    expect(s.reason).toContain('src/index.ts');
    expect(s.reason).toContain('2 failed fix attempts');
    expect(s.reason).toContain('npx jest: 3 failed');
    expect(s.next).toMatch(/--resume/);
  });

  test('defaults: command /ship-build and a missing failure note', () => {
    const s = stuckText({ classification: classify({ files: [barrel()] }) });
    expect(s.text).toMatch(/^═══ COMMAND STUCK: \/ship-build ═══/);
    expect(s.reason).toMatch(/check output not given/);
  });

  test('does not throw on no arguments', () => {
    expect(stuckText().text).toMatch(/COMMAND STUCK/);
  });
});

describe('CLI', () => {
  const run = (args, input) => {
    const r = spawnSync('node', [LIB, ...args], { encoding: 'utf8', input });
    const lines = r.stdout.split('\n').filter(Boolean);
    return { status: r.status, lines, json: JSON.parse(lines[0]) };
  };
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('classify --file prints one JSON line and exits 0', () => {
    const p = path.join(dir, 'in.json');
    fs.writeFileSync(p, JSON.stringify({ files: [barrel()] }));
    const r = run(['classify', '--file', p]);
    expect(r.status).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.json).toMatchObject({ ok: true, class: 'mechanical', stop: false });
  });

  test('classify --stdin', () => {
    const r = run(['classify', '--stdin'], JSON.stringify({ files: [file('.claude/rules/x.md', [])] }));
    expect(r.status).toBe(0);
    expect(r.json).toMatchObject({ ok: true, class: 'forbidden', stopNow: true });
  });

  test('decide --stdin', () => {
    const classification = classify({ files: [barrel()] });
    const r = run(['decide', '--stdin'], JSON.stringify({ classification, resolved: true, checksFailed: true, failedAttempts: 2 }));
    expect(r.status).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.json).toMatchObject({ ok: true, action: 'stop', effectiveClass: 'behavioural', escalated: true });
  });

  test('decide at 1 failed attempt fixes', () => {
    const classification = classify({ files: [barrel()] });
    const r = run(['decide', '--stdin'], JSON.stringify({ classification, resolved: true, checksFailed: true, failedAttempts: 1 }));
    expect(r.json.action).toBe('fix');
  });

  test('stuck --stdin', () => {
    const classification = classify({ files: [file('.claude/rules/x.md', [])] });
    const r = run(['stuck', '--stdin'], JSON.stringify({ classification, command: '/ship-build' }));
    expect(r.status).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.text).toMatch(/COMMAND STUCK: \/ship-build/);
  });

  test.each([
    [[], undefined],
    [['bogus'], undefined],
    [['classify'], undefined],
    [['classify', '--json'], undefined],
    [['classify', '--stdin'], 'not json'],
    [['classify', '--file', '/no/such/file.json'], undefined],
    [['classify', '--stdin'], '42'],
    [['classify', '--stdin'], 'null'],
  ])('bad usage %j prints ok false and exits 0', (args, input) => {
    const r = run(args, input);
    expect(r.status).toBe(0);
    expect(r.lines).toHaveLength(1);
    expect(r.json.ok).toBe(false);
    expect(typeof r.json.reason).toBe('string');
  });

  test('classify with an empty file set reports ok false', () => {
    expect(run(['classify', '--stdin'], '{"files":[]}').json.ok).toBe(false);
  });

  test('main returns 0 and takes an injected stdin reader', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = cc.main(['classify', '--stdin'], () => JSON.stringify({ files: [barrel()] }));
    const out = write.mock.calls.map((c) => c[0]).join('');
    write.mockRestore();
    expect(code).toBe(0);
    expect(JSON.parse(out).class).toBe('mechanical');
  });
});

describe('mirror', () => {
  const root = path.join(__dirname, '..', '..', '..');
  test('packages/full/lib is a symlink to the core file', () => {
    const p = path.join(root, 'packages', 'full', 'lib', 'conflict-classifier.js');
    expect(fs.lstatSync(p).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(p)).toBe('../../core/lib/conflict-classifier.js');
    expect(fs.realpathSync(p)).toBe(fs.realpathSync(LIB));
  });

  test('.claude/lib holds a byte-identical copy', () => {
    const p = path.join(root, '.claude', 'lib', 'conflict-classifier.js');
    expect(fs.readFileSync(p)).toEqual(fs.readFileSync(LIB));
  });
});

describe('pinned mutations the tests must catch', () => {
  const src = fs.readFileSync(LIB, 'utf8');
  const recordFiles = require.resolve('./record-files');
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-mutant-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const load = (name, code) => {
    const p = path.join(dir, name + '.js');
    fs.writeFileSync(p, code.replace("require('./record-files')", JSON.stringify(recordFiles).replace(/^/, 'require(') + ')'));
    return require(p);
  };

  // Each mutation: a source edit, and the probe whose result the edit must change.
  const mutations = [
    {
      name: 'no normalising of paths',
      from: "let n = path.posix.normalize(s);",
      to: 'let n = s;',
      probe: (m) => String(m.isForbidden('docs/x/../TRD/other.md')) + m.isForbidden('.claude/rules/./x.md') + m.isForbidden('./.claude/rules/x.md'),
    },
    {
      name: 'no featureTrd exception',
      from: 'return own !== null && n === own ? null : \'other-trd\';',
      to: "return 'other-trd';",
      probe: (m) => m.isForbidden('docs/TRD/mine.md', 'docs/TRD/mine.md'),
    },
    {
      name: 'two-attempt limit changed to three',
      from: 'Number(failedAttempts) >= 2',
      to: 'Number(failedAttempts) >= 3',
      probe: (m) =>
        m.decide({ classification: classify({ files: [barrel()] }), resolved: true, checksFailed: true, failedAttempts: 2 }).action,
    },
    {
      name: 'two-attempt limit changed to one',
      from: 'Number(failedAttempts) >= 2',
      to: 'Number(failedAttempts) >= 1',
      probe: (m) =>
        m.decide({ classification: classify({ files: [barrel()] }), resolved: true, checksFailed: true, failedAttempts: 1 }).action,
    },
    {
      name: 'no beside-a-changed-line rule',
      from: 'if (rep.s <= ins.s && ins.s <= rep.e) {',
      to: 'if (false) {',
      probe: (m) => m.classify({ files: [file('src/a.js', [h(['a', 'b'], ['a', 'b', 'NEW'], ['a', 'B'])])] }).class,
    },
  ];

  test.each(mutations)('$name changes an asserted result', ({ name, from, to, probe }) => {
    expect(src).toContain(from); // the mutation must apply, or the pin is stale
    const mutant = load('m' + name.replace(/\W+/g, '_'), src.replace(from, () => to));
    expect(probe(mutant)).not.toEqual(probe(cc));
  });
});
