'use strict';

/**
 * merge-resolve.js tests: a real git fixture (a feature branch, a base that clashes with it, and a
 * bare origin), driven through the library's CLI exactly as the merge contract drives it.
 * Checks come from ensemble.mergeChecks in the fixture's settings.json (node scripts, never the
 * host's lint or tsc), so the cases do not depend on the machine they run on.
 *
 * Run with: npx jest packages/core/lib/merge-resolve.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = path.join(__dirname, 'merge-resolve.js');
const MIRROR = path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'merge-resolve.js');

const roots = [];
afterAll(() => roots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const cleanEnv = () => {
  const e = { ...process.env };
  delete e.GIT_DIR;
  delete e.GIT_WORK_TREE;
  delete e.GIT_INDEX_FILE;
  return e;
};

// A check script: fails when any file it is given holds the word FAIL_MARKER.
const CHECK_JS = [
  "const fs = require('fs');",
  'const bad = process.argv.slice(2).filter((f) => fs.existsSync(f) && fs.readFileSync(f, "utf8").includes("FAIL_MARKER"));',
  'if (bad.length) { console.error("FAIL_MARKER found in " + bad.join(", ")); process.exit(1); }',
  '',
].join('\n');

const settings = (extra = {}) => JSON.stringify({
  ensemble: {
    mergeChecks: {
      lint: ['node', 'scripts/check.js', '{files}'],
      typecheck: false,
      test: ['node', 'scripts/check.js', '{files}'],
      ...extra,
    },
  },
}, null, 2) + '\n';

/**
 * A repo on feature/f with a bare origin. 'pr' and 'base' map paths to text: the PR commit is made
 * on the feature branch, the base commit on main, then the feature branch is checked out again.
 */
function fixture({ pr = {}, base = {}, init = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'merge-resolve-')));
  roots.push(root);
  const bare = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const g = (...a) => {
    const r = spawnSync('git', a, { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr);
    return r.stdout.trim();
  };
  spawnSync('git', ['init', '--bare', '-b', 'main', bare], { encoding: 'utf8', env: cleanEnv() });
  g('init', '-b', 'main');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  g('remote', 'add', 'origin', bare);
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  };
  const commit = (msg, files) => {
    for (const [rel, text] of Object.entries(files)) write(rel, text);
    g('add', '-A');
    g('commit', '--allow-empty', '-m', msg);
  };
  commit('init', {
    'scripts/check.js': CHECK_JS,
    '.claude/settings.json': settings(),
    'src/index.js': "export * from './a';\nexport * from './z';\n",
    'src/mod.js': 'const limit = 10;\nmodule.exports = { limit };\n',
    '.claude/rules/x.md': 'rule: 1\n',
    'OWNER-CALLS.md': '# calls\n',
    'src/notes.js': 'one\ntwo\nthree\nfour\nfive\n',
    ...init,
  });
  g('push', '-u', 'origin', 'main');
  g('checkout', '-b', 'feature/f');
  commit('pr work', pr);
  g('push', '-u', 'origin', 'feature/f');
  g('checkout', 'main');
  commit('base work', base);
  g('push', 'origin', 'main');
  g('checkout', 'feature/f');
  g('fetch', 'origin');
  const prHead = g('rev-parse', 'HEAD');
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SRC, ...args], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    const lines = r.stdout.trim().split('\n');
    expect(r.status).toBe(0);
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0]);
  };
  const start = () => run('start', '--base', 'origin/main', '--branch', 'feature/f', '--pr-head', prHead, '--trd', 'none');
  /** Keeps both sides of every conflict hunk in a file (ours, then theirs): what a model does for a list addition. */
  const keepBoth = (rel, extra = '') => {
    const text = fs.readFileSync(path.join(repo, rel), 'utf8');
    const out = text.replace(/<{7}[^\n]*\n([^]*?)={7}\n([^]*?)>{7}[^\n]*\n/g, (m, ours, theirs) => ours + theirs + extra);
    fs.writeFileSync(path.join(repo, rel), out);
  };
  return { root, repo, g, write, run, start, keepBoth, prHead, bare, read: (rel) => fs.readFileSync(path.join(repo, rel), 'utf8'),
    merging: () => spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: repo, env: cleanEnv() }).status === 0 };
}

const LIST = { pr: { 'src/index.js': "export * from './a';\nexport * from './pr';\nexport * from './z';\n" },
  base: { 'src/index.js': "export * from './a';\nexport * from './base';\nexport * from './z';\n" } };

describe('a mechanical conflict', () => {
  test('is resolved, checked, committed and sent to origin as a plain fast-forward', () => {
    const f = fixture(LIST);
    const before = f.g('rev-parse', 'origin/feature/f');
    const s = f.start();
    expect(s).toMatchObject({ ok: true, outcome: 'resolving', mechanical: ['src/index.js'] });
    expect(f.read('src/index.js')).toMatch(/^<{7}/m);
    expect(f.merging()).toBe(true);

    f.keepBoth('src/index.js');
    const c = f.run('check');
    expect(c).toMatchObject({ ok: true, action: 'commit', failedAttempts: 0 });
    expect(c.checks.map((x) => [x.name, x.status])).toEqual([['lint', 'passed'], ['typecheck', 'skipped'], ['test', 'passed']]);

    const done = f.run('commit');
    expect(done).toMatchObject({ ok: true, outcome: 'resolved' });
    expect(f.g('rev-parse', 'HEAD')).toBe(done.head);
    expect(f.merging()).toBe(false);
    expect(f.g('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toEqual([done.head, f.prHead, f.g('rev-parse', 'origin/main')]);
    expect(f.read('src/index.js')).toBe("export * from './a';\nexport * from './pr';\nexport * from './base';\nexport * from './z';\n");

    // What the contract does next: a plain send of the branch. It must be a fast-forward of origin.
    expect(f.g('merge-base', '--is-ancestor', before, done.head)).toBe('');
    f.g('push', 'origin', 'feature/f');
    expect(f.g('ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0]).toBe(done.head);

    const e = f.run('entry', '--reproof-ids', 'FS-1,FS-2');
    expect(e.resolution).toEqual({
      outcome: 'resolved',
      class: 'mechanical',
      files: [{ path: 'src/index.js', class: 'mechanical' }],
      checks: [
        { name: 'lint', status: 'passed', command: 'node scripts/check.js {files}' },
        { name: 'typecheck', status: 'skipped', reason: 'not set in ensemble.mergeChecks' },
        { name: 'test', status: 'passed', command: 'node scripts/check.js {files}' },
      ],
      reproofScope: 'files: src/index.js; criteria: FS-1, FS-2',
      failedAttempts: 0,
    });
  });

  test('entry before the custody gate has run says the criteria are not read yet', () => {
    const f = fixture(LIST);
    f.start();
    f.keepBoth('src/index.js');
    f.run('check');
    f.run('commit');
    expect(f.run('entry').resolution.reproofScope).toBe('files: src/index.js; criteria: not read yet (run the custody gate)');
    expect(f.run('entry', '--reproof-ids', 'none').resolution.reproofScope).toBe('files: src/index.js; criteria: none');
  });

  test('a check that fails once and is then fixed still commits', () => {
    const f = fixture(LIST);
    f.start();
    f.keepBoth('src/index.js', '// FAIL_MARKER\n');
    const first = f.run('check');
    expect(first).toMatchObject({ ok: true, action: 'fix', failedAttempts: 0 });
    expect(first.failures[0]).toMatchObject({ name: 'lint' });
    expect(first.failures[0].output).toMatch(/FAIL_MARKER found in src\/index\.js/);
    f.write('src/index.js', "export * from './a';\nexport * from './pr';\nexport * from './base';\nexport * from './z';\n");
    expect(f.run('check')).toMatchObject({ ok: true, action: 'commit' });
    expect(f.run('commit')).toMatchObject({ ok: true, outcome: 'resolved' });
  });

  test('checks failing after two fix attempts stop with the STUCK text, the merge left for repair, nothing sent', () => {
    const f = fixture(LIST);
    const originBefore = f.g('ls-remote', 'origin', 'refs/heads/feature/f');
    f.start();
    f.keepBoth('src/index.js', '// FAIL_MARKER\n');
    expect(f.run('check')).toMatchObject({ action: 'fix', failedAttempts: 0 });
    expect(f.run('check')).toMatchObject({ action: 'fix', failedAttempts: 1 });
    const third = f.run('check');
    expect(third).toMatchObject({ ok: false, outcome: 'stopped', action: 'stop', failedAttempts: 2 });
    expect(third.stuck.text).toMatch(/^═══ COMMAND STUCK: \/ship-build ═══\nReason: checks still fail after 2 failed fix attempts on the resolved conflict in src\/index\.js: .*FAIL_MARKER/);
    expect(third.stuck.text).toMatch(/\nNext: {3}Fix the failing check by hand on the branch, then re-run \/ship-build --resume\.$/);
    expect(f.merging()).toBe(true);
    expect(f.g('ls-remote', 'origin', 'refs/heads/feature/f')).toBe(originBefore);
    // commit is refused once stopped
    expect(f.run('commit')).toMatchObject({ ok: false, outcome: 'refused' });
    const e = f.run('entry').resolution;
    expect(e).toMatchObject({ outcome: 'stopped', class: 'behavioural', escalated: true, failedAttempts: 2, reproofScope: 'none: stopped before the custody gate' });
    expect(e.stuck).toBe(third.stuck.text);
    expect(e.checks.find((c) => c.name === 'lint').status).toBe('failed');
    // the abort command settles it
    expect(f.run('abort')).toMatchObject({ ok: true, outcome: 'aborted', merging: true });
    expect(f.merging()).toBe(false);
    expect(f.g('status', '--porcelain', '--untracked-files=no')).toBe('');
  });

  test('a file that still holds conflict markers is refused and costs no attempt', () => {
    const f = fixture(LIST);
    f.start();
    const r = f.run('check');
    expect(r).toMatchObject({ ok: false, outcome: 'refused', markers: ['src/index.js'] });
    f.keepBoth('src/index.js', '// FAIL_MARKER\n');
    expect(f.run('check')).toMatchObject({ action: 'fix', failedAttempts: 0 });
  });

  test('an edit outside the conflict hunks is refused', () => {
    const f = fixture(LIST);
    f.start();
    f.keepBoth('src/index.js');
    f.write('src/index.js', f.read('src/index.js').replace("export * from './z';", "export * from './zzz';"));
    const r = f.run('check');
    expect(r).toMatchObject({ ok: false, outcome: 'refused', editedOutside: ['src/index.js'] });
    expect(r.reason).toMatch(/text outside the conflict hunks changed in src\/index\.js/);
  });

  test('commit refuses before a passing check, and after the file changed since it', () => {
    const f = fixture(LIST);
    f.start();
    f.keepBoth('src/index.js');
    expect(f.run('commit')).toMatchObject({ ok: false, outcome: 'refused', reason: expect.stringMatching(/checks have not passed/) });
    expect(f.run('check').action).toBe('commit');
    f.write('src/index.js', f.read('src/index.js') + '// sneaked in\n');
    expect(f.run('commit')).toMatchObject({ ok: false, outcome: 'refused', reason: expect.stringMatching(/changed since the last passing check/) });
  });

  test('with a record file in the same clash, the record file is unioned and committed with it', () => {
    const f = fixture({
      pr: { ...LIST.pr, 'OWNER-CALLS.md': '# calls\n- pr call\n' },
      base: { ...LIST.base, 'OWNER-CALLS.md': '# calls\n- base call\n' },
    });
    const s = f.start();
    expect(s).toMatchObject({ ok: true, outcome: 'resolving', mechanical: ['src/index.js'], records: ['OWNER-CALLS.md'] });
    expect(f.read('OWNER-CALLS.md')).toBe('# calls\n- pr call\n- base call\n');
    f.keepBoth('src/index.js');
    expect(f.run('check').action).toBe('commit');
    expect(f.run('commit').outcome).toBe('resolved');
    expect(f.g('show', 'HEAD:OWNER-CALLS.md')).toBe('# calls\n- pr call\n- base call');
    const e = f.run('entry').resolution;
    expect(e.files).toHaveLength(2);
    expect(e.files).toEqual(expect.arrayContaining([{ path: 'src/index.js', class: 'mechanical' }, { path: 'OWNER-CALLS.md', class: 'record' }]));
  });

  test('the commands that run are read from the pre-merge HEAD, so a merged settings.json hunk cannot change them', () => {
    // The base adds a second, failing lint command at the same spot where the PR adds another key; both
    // kept, the merged file's last lint wins. If the merged file chose the command, lint would fail.
    const at = '      "typecheck": false,\n';
    const f = fixture({
      pr: { '.claude/settings.json': settings().replace(at, at + '      "extra": true,\n') },
      base: { '.claude/settings.json': settings().replace(at, at + '      "lint": ["node", "-e", "process.exit(7)"],\n') },
    });
    const s = f.start();
    expect(s.mechanical).toEqual(['.claude/settings.json']);
    f.keepBoth('.claude/settings.json');
    expect(f.read('.claude/settings.json')).toMatch(/process\.exit\(7\)/);
    const c = f.run('check');
    expect(c).toMatchObject({ ok: true, action: 'commit' });
    expect(c.checks[0]).toEqual({ name: 'lint', status: 'passed', command: 'node scripts/check.js {files}' });
  });

  test('with no ensemble.mergeChecks, a project with no lint script, tsconfig or jest runs nothing and nothing fails', () => {
    const f = fixture({ ...LIST, init: { '.claude/settings.json': '{}\n' } });
    f.start();
    f.keepBoth('src/index.js');
    const c = f.run('check');
    expect(c.action).toBe('commit');
    expect(c.checks.map((x) => x.status)).toEqual(['skipped', 'skipped', 'skipped']);
    expect(c.checks[0].reason).toBe('no lint script in package.json');
  });
});

describe('a conflict that stops the run', () => {
  const noTrace = (f, headBefore) => {
    expect(f.merging()).toBe(false);
    expect(f.g('rev-parse', 'HEAD')).toBe(headBefore);
    expect(f.g('status', '--porcelain', '--untracked-files=no')).toBe('');
  };

  test('a behavioural clash returns the STUCK text naming the file and the clash, and changes nothing', () => {
    const f = fixture({ pr: { 'src/mod.js': 'const limit = 20;\nmodule.exports = { limit };\n' }, base: { 'src/mod.js': 'const limit = 30;\nmodule.exports = { limit };\n' } });
    const s = f.start();
    expect(s).toMatchObject({ ok: false, outcome: 'stopped', action: 'stop', class: 'behavioural' });
    expect(s.stuck.text).toMatch(/^═══ COMMAND STUCK: \/ship-build ═══\nReason: src\/mod\.js \(overlap: both sides changed the same lines: ours "const limit = 20;" vs theirs "const limit = 30;"\)\nNext: {3}Resolve these conflicts by hand, then re-run \/ship-build --resume\.$/);
    noTrace(f, f.prHead);
    expect(f.run('entry').resolution).toEqual({
      outcome: 'stopped',
      class: 'behavioural',
      files: [{ path: 'src/mod.js', class: 'behavioural', reason: 'overlap' }],
      checks: [],
      reproofScope: 'none: stopped before the custody gate',
      failedAttempts: 0,
      stuck: s.stuck.text,
    });
  });

  test('a forbidden file stops at once, even beside a mechanical one', () => {
    const f = fixture({
      pr: { ...LIST.pr, '.claude/rules/x.md': 'rule: 2\n' },
      base: { ...LIST.base, '.claude/rules/x.md': 'rule: 3\n' },
    });
    const s = f.start();
    expect(s).toMatchObject({ ok: false, outcome: 'stopped', class: 'forbidden' });
    expect(s.stuck.reason).toMatch(/\.claude\/rules\/x\.md \(rules-file: a rules file may never be merged by the model\)/);
    expect(s.stuck.text).toMatch(/the model never merges them/);
    noTrace(f, f.prHead);
    expect(f.run('entry').resolution).toMatchObject({ outcome: 'stopped', class: 'forbidden' });
  });

  test('a file deleted on one side is behavioural', () => {
    const f = fixture({ pr: { 'src/mod.js': 'const limit = 20;\n' }, base: {} });
    // base deletes the file the PR changed
    f.g('checkout', 'main');
    f.g('rm', '-q', 'src/mod.js');
    f.g('commit', '-qm', 'base deletes');
    f.g('push', 'origin', 'main');
    f.g('checkout', 'feature/f');
    f.g('fetch', 'origin');
    const s = f.start();
    expect(s).toMatchObject({ ok: false, outcome: 'stopped', class: 'behavioural' });
    expect(s.stuck.reason).toMatch(/src\/mod\.js \(deleted: deleted by the base\)/);
    noTrace(f, f.prHead);
  });
});

describe('refusals', () => {
  test('the wrong branch, a missing flag and a dirty tree are refused with nothing attempted', () => {
    const f = fixture(LIST);
    expect(f.run('start', '--base', 'origin/main', '--branch', 'other', '--pr-head', f.prHead, '--trd', 'none')).toMatchObject({ ok: false, outcome: 'refused', reason: expect.stringMatching(/not other/) });
    expect(f.run('start', '--base', 'origin/main')).toMatchObject({ ok: false, outcome: 'refused' });
    f.write('src/notes.js', 'dirty\n');
    expect(f.start()).toMatchObject({ ok: false, outcome: 'refused', notRecord: ['src/notes.js'] });
    expect(f.merging()).toBe(false);
  });

  test('check, commit and entry without a start are refused, and an unknown command prints usage', () => {
    const f = fixture(LIST);
    expect(f.run('check')).toMatchObject({ ok: false, outcome: 'refused' });
    expect(f.run('commit')).toMatchObject({ ok: false, outcome: 'refused' });
    expect(f.run('entry')).toMatchObject({ ok: false, outcome: 'refused' });
    expect(f.run('nope').reason).toMatch(/^usage:/);
  });

  test('a base that merges cleanly is committed as clean', () => {
    const f = fixture({ pr: { 'src/notes.js': 'ONE\ntwo\nthree\nfour\nfive\n' }, base: { 'src/notes.js': 'one\ntwo\nthree\nfour\nFIVE\n' } });
    expect(f.start()).toMatchObject({ ok: true, outcome: 'clean' });
  });
});

describe('the library file', () => {
  test('the .claude/lib copy is byte-identical to the source', () => {
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(fs.readFileSync(SRC, 'utf8'));
  });

  test('never sends to a remote and never forces', () => {
    const text = fs.readFileSync(SRC, 'utf8');
    expect(text).not.toMatch(/push/i);
    expect(text).not.toMatch(/--force/);
  });

  test('runs git and the checks without a shell', () => {
    const text = fs.readFileSync(SRC, 'utf8');
    expect(text).not.toMatch(/execSync|shell:\s*true/);
  });
});
