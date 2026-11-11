'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { isRecordFile, classifyClash, mergeBase } = require('./record-files');
const { classifyPath } = require('./custody');

const tmpDirs = [];
afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function cleanEnv() {
  const e = { ...process.env };
  delete e.GIT_DIR;
  delete e.GIT_WORK_TREE;
  delete e.GIT_INDEX_FILE;
  return e;
}
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}${r.stdout}`);
  return r.stdout.trim();
};

/**
 * A repo on main; `files` are committed on main, then branch feature/x is cut. Returns helpers
 * to commit on either side.
 */
function setup(files = {}, extraMain = {}) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'recfiles-')));
  tmpDirs.push(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 't');
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  };
  const commit = (msg, f) => {
    for (const [rel, text] of Object.entries(f)) write(rel, text);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', msg);
  };
  commit('init', { 'src/app.js': 'a\n', ...extraMain, ...files });
  git(repo, 'checkout', '-b', 'feature/x');
  const onMain = (msg, f) => {
    git(repo, 'checkout', 'main');
    commit(msg, f);
    git(repo, 'checkout', 'feature/x');
  };
  const opts = () => ({ base: 'main', branch: 'feature/x', prHead: git(repo, 'rev-parse', 'HEAD') });
  return { repo, write, commit, onMain, opts };
}

const NOTES = '.claude/verification-notes.md';

describe('isRecordFile and custody.classifyPath share one definition', () => {
  const cases = [
    [NOTES, true],
    ['.trd-state/x/y.json', true],
    ['.trd-statex/file', false],
    ['.claude/other.md', false],
    ['src/app.js', false],
  ];
  test.each(cases)('%s -> %s', (p, expected) => {
    expect(isRecordFile(p)).toBe(expected);
    expect(classifyPath(p, null) === 'ignored').toBe(expected);
  });

  test('custody.js uses record-files.js and has no list of its own', () => {
    const src = fs.readFileSync(path.join(__dirname, 'custody.js'), 'utf8');
    expect(src).toMatch(/require\('\.\/record-files'\)/);
    expect(src).not.toMatch(/FRAMEWORK_WRITTEN/);
  });
});

describe('classifyClash', () => {
  test('record paths only', () => {
    expect(classifyClash([NOTES, '.trd-state/current.json'])).toEqual({ recordOnly: true, notRecord: [] });
  });
  test('a code path is named', () => {
    expect(classifyClash([NOTES, 'src/app.js'])).toEqual({ recordOnly: false, notRecord: ['src/app.js'] });
  });
});

describe('mergeBase', () => {
  const base = { [NOTES]: 'one\n', '.trd-state/current.json': '{"a":1}\n' };

  test('code clash: stopped, nothing changes', () => {
    const s = setup(base);
    s.commit('f', { [NOTES]: 'one\nfeature\n', '.trd-state/current.json': '{"a":2}\n', 'src/app.js': 'f\n' });
    s.onMain('b', { [NOTES]: 'one\nbase\n', '.trd-state/current.json': '{"a":3}\n', 'src/app.js': 'b\n' });
    const head = git(s.repo, 'rev-parse', 'HEAD');
    const status = git(s.repo, 'status', '--porcelain');
    const r = mergeBase(s.opts(), s.repo);
    expect(r).toMatchObject({ ok: false, outcome: 'stopped', notRecord: ['src/app.js'] });
    expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(s.repo, 'status', '--porcelain')).toBe(status);
  });

  test('notes-only clash: resolved, feature line then base line, no markers', () => {
    const s = setup(base);
    s.commit('f', { [NOTES]: 'one\nfeature\n' });
    s.onMain('b', { [NOTES]: 'one\nbase\n' });
    const before = git(s.repo, 'rev-parse', 'HEAD');
    const r = mergeBase(s.opts(), s.repo);
    expect(r).toMatchObject({ ok: true, outcome: 'resolved' });
    expect(git(s.repo, 'rev-parse', 'HEAD')).not.toBe(before);
    expect(git(s.repo, 'rev-list', '--parents', '-n1', 'HEAD').split(' ')).toHaveLength(3);
    const text = fs.readFileSync(path.join(s.repo, NOTES), 'utf8');
    expect(text).toBe('one\nfeature\nbase\n');
    expect(text).not.toMatch(/<<<<<<<|>>>>>>>/);
    expect(git(s.repo, 'status', '--porcelain')).toBe('');
  });

  test('a .trd-state json whose union is invalid: stopped, names the file, branch unchanged', () => {
    const s = setup({ '.trd-state/x.json': '{"a":1}\n' });
    s.commit('f', { '.trd-state/x.json': '{"a":2}\n' });
    s.onMain('b', { '.trd-state/x.json': '{"a":3}\n' });
    const head = git(s.repo, 'rev-parse', 'HEAD');
    const r = mergeBase(s.opts(), s.repo);
    expect(r.ok).toBe(false);
    expect(r.invalidJson).toEqual(['.trd-state/x.json']);
    expect(r.reason).toContain('.trd-state/x.json');
    expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(s.repo, 'status', '--porcelain')).toBe('');
  });

  test('a union line in .gitattributes: git resolves it, outcome clean, both lines kept', () => {
    const s = setup({ ...base, '.gitattributes': `${NOTES} merge=union\n` });
    s.commit('f', { [NOTES]: 'one\nfeature\n' });
    s.onMain('b', { [NOTES]: 'one\nbase\n' });
    const r = mergeBase(s.opts(), s.repo);
    expect(r).toMatchObject({ ok: true, outcome: 'clean' });
    const text = fs.readFileSync(path.join(s.repo, NOTES), 'utf8');
    expect(text).toContain('feature');
    expect(text).toContain('base');
    expect(text).not.toMatch(/<<<<<<</);
  });

  test('a record file deleted on one side: stopped, names the file, branch unchanged', () => {
    const s = setup(base);
    s.commit('f', { [NOTES]: 'one\nfeature\n' });
    git(s.repo, 'checkout', 'main');
    git(s.repo, 'rm', '-q', NOTES);
    git(s.repo, 'commit', '-m', 'rm');
    git(s.repo, 'checkout', 'feature/x');
    const head = git(s.repo, 'rev-parse', 'HEAD');
    const r = mergeBase(s.opts(), s.repo);
    expect(r).toMatchObject({ ok: false, outcome: 'stopped' });
    expect(r.reason).toContain(NOTES);
    expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(s.repo, 'status', '--porcelain')).toBe('');
  });

  test('run from a subdirectory: the resolved file is written at the top level', () => {
    const s = setup({ ...base, 'src/keep.txt': 'k\n' });
    s.commit('f', { [NOTES]: 'one\nfeature\n' });
    s.onMain('b', { [NOTES]: 'one\nbase\n' });
    const r = mergeBase(s.opts(), path.join(s.repo, 'src'));
    expect(r).toMatchObject({ ok: true, outcome: 'resolved' });
    expect(fs.readFileSync(path.join(s.repo, NOTES), 'utf8')).toBe('one\nfeature\nbase\n');
    expect(fs.existsSync(path.join(s.repo, 'src', NOTES))).toBe(false);
  });

  describe('refusals', () => {
    test('wrong current branch', () => {
      const s = setup(base);
      const head = git(s.repo, 'rev-parse', 'HEAD');
      const r = mergeBase({ ...s.opts(), branch: 'other' }, s.repo);
      expect(r).toMatchObject({ ok: false, outcome: 'refused' });
      expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(head);
    });

    test('a PR head not in HEAD', () => {
      const s = setup(base);
      s.onMain('b', { 'other.txt': 'x\n' });
      const mainTip = git(s.repo, 'rev-parse', 'main');
      const head = git(s.repo, 'rev-parse', 'HEAD');
      const r = mergeBase({ ...s.opts(), prHead: mainTip }, s.repo);
      expect(r).toMatchObject({ ok: false, outcome: 'refused' });
      expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(head);
    });

    test('an uncommitted change to code', () => {
      const s = setup(base);
      const o = s.opts();
      s.write('src/app.js', 'dirty\n');
      const head = git(s.repo, 'rev-parse', 'HEAD');
      const r = mergeBase(o, s.repo);
      expect(r).toMatchObject({ ok: false, outcome: 'refused', notRecord: ['src/app.js'] });
      expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(head);
    });
  });

  test('an uncommitted .trd-state change the merge does not touch is allowed and stays uncommitted', () => {
    const s = setup(base);
    s.commit('f', { [NOTES]: 'one\nfeature\n' });
    s.onMain('b', { [NOTES]: 'one\nbase\n' });
    s.write('.trd-state/current.json', '{"a":99}\n');
    const r = mergeBase(s.opts(), s.repo);
    expect(r).toMatchObject({ ok: true, outcome: 'resolved' });
    expect(git(s.repo, 'status', '--porcelain')).toBe('M .trd-state/current.json');
    expect(fs.readFileSync(path.join(s.repo, '.trd-state/current.json'), 'utf8')).toBe('{"a":99}\n');
  });

  test('CLI verb prints one JSON line', () => {
    const s = setup(base);
    const o = s.opts();
    const r = spawnSync(
      'node',
      [path.join(__dirname, 'record-files.js'), 'merge-base-in', '--base', 'main', '--branch', 'feature/x', '--pr-head', o.prHead],
      { cwd: s.repo, encoding: 'utf8', env: cleanEnv() }
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true });
  });
});

describe('gitattributes-additions template', () => {
  // Each union line is only safe if /ship-build's merge-base step treats the same path as a
  // record file; isRecordFile stays the single definition, so the template must agree with it.
  test('every path in gitattributes-additions.txt satisfies isRecordFile', () => {
    const tpl = path.join(__dirname, '..', 'templates', 'gitattributes-additions.txt');
    const paths = fs
      .readFileSync(tpl, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split(/\s+/)[0]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect([p, isRecordFile(p)]).toEqual([p, true]);
  });
});
