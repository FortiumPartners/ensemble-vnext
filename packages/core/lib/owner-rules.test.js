'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { OWNER_GOVERNED, resolve, pathFor } = require('./owner-rules');

const LIB = path.join(__dirname, 'owner-rules.js');
const FV = path.join(__dirname, 'functional-verification.js');
const VER = '.claude/rules/verification.md';
const tmpRoots = [];

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(repo, rel, text) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
}

function commit(repo, rel, text) {
  write(repo, rel, text);
  g(repo, 'add', rel);
  g(repo, 'commit', '-q', '-m', `edit ${rel}`);
}

/** bare origin + clone on main with verification.md at 50%, then branch `feature`. */
function fixture() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'owner-rules-')));
  tmpRoots.push(dir);
  const origin = path.join(dir, 'origin.git');
  const repo = path.join(dir, 'repo');
  g(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  g(dir, 'clone', '-q', origin, repo);
  g(repo, 'checkout', '-q', '-b', 'main');
  commit(repo, VER, '## 5a. Coverage floor\n\nCoverage floor: 50%\n');
  g(repo, 'push', '-q', 'origin', 'main');
  g(repo, 'remote', 'set-head', 'origin', 'main');
  g(repo, 'checkout', '-q', '-b', 'feature');
  return repo;
}

/** advance main on origin to `text` without disturbing the feature checkout. */
function advanceMain(repo, text) {
  g(repo, 'checkout', '-q', 'main');
  commit(repo, VER, text);
  g(repo, 'push', '-q', 'origin', 'main');
  g(repo, 'checkout', '-q', 'feature');
}

const opts = (repo) => ({ root: repo, base: 'main', gh: false });
const cli = (args) => spawnSync('node', [LIB, ...args], { encoding: 'utf8' });

afterAll(() => tmpRoots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('owner-rules', () => {
  test('OWNER_GOVERNED equals AUTHORED_RULES in scaffold-project.sh', () => {
    const sh = fs.readFileSync(path.join(__dirname, '../scripts/scaffold-project.sh'), 'utf8');
    const m = sh.match(/AUTHORED_RULES=\(([^)]*)\)/);
    const parsed = m[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
    expect([...OWNER_GOVERNED].sort()).toEqual([...parsed].sort());
  });

  test('base-only change: uses the base copy, names file and origin/main, floor reads 0.8', () => {
    const repo = fixture();
    advanceMain(repo, '## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    const r = resolve({ ...opts(repo), fetch: true });
    const f = r.files['verification.md'];
    expect(f.source).toBe('base');
    expect(f.use).not.toBe(VER);
    expect(fs.readFileSync(f.use, 'utf8')).toBe('## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    expect(f).toMatchObject({ branchChanged: false, baseChanged: true, differs: true });
    expect(r.notices.join(' ')).toMatch(/verification\.md/);
    expect(r.notices.join(' ')).toMatch(/origin\/main/);
    // the tracked tree is untouched
    expect(fs.readFileSync(path.join(repo, VER), 'utf8')).toBe('## 5a. Coverage floor\n\nCoverage floor: 50%\n');
    expect(g(repo, 'status', '--porcelain')).toBe('');

    const p = cli(['path', 'verification.md', '--root', repo, '--no-gh', '--base', 'main']);
    expect(p.status).toBe(0);
    const fv = spawnSync('node', [FV, 'read-coverage-floor', p.stdout.trim()], { encoding: 'utf8' });
    expect(JSON.parse(fv.stdout).floor).toBe(0.8);
  });

  test('path form agrees with resolve and never fetches', () => {
    const repo = fixture();
    advanceMain(repo, '## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    // reset the remote-tracking ref so only a fetch could reveal the advance
    g(repo, 'update-ref', 'refs/remotes/origin/main', g(repo, 'merge-base', 'feature', 'origin/main'));
    expect(pathFor('verification.md', opts(repo))).toBe(VER);
    resolve({ ...opts(repo), fetch: true });
    const viaResolve = resolve({ ...opts(repo), fetch: false }).files['verification.md'].use;
    expect(pathFor('verification.md', opts(repo))).toBe(viaResolve);
    expect(viaResolve).not.toBe(VER);
  });

  test('identical: branch path, no notices', () => {
    const repo = fixture();
    const r = resolve(opts(repo));
    expect(r.files['verification.md'].use).toBe(VER);
    expect(r.files['verification.md'].source).toBe('branch');
    expect(r.notices).toEqual([]);
  });

  test('branch-only change (committed or uncommitted): branch copy with a notice', () => {
    const repo = fixture();
    write(repo, VER, '## 5a. Coverage floor\n\nCoverage floor: 70%\n');
    const r = resolve(opts(repo));
    expect(r.files['verification.md']).toMatchObject({ use: VER, source: 'branch', branchChanged: true, baseChanged: false });
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatch(/verification\.md.*origin\/main/);
  });

  test('both changed: base copy with a loud notice', () => {
    const repo = fixture();
    commit(repo, VER, '## 5a. Coverage floor\n\nCoverage floor: 70%\n');
    advanceMain(repo, '## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    const r = resolve(opts(repo));
    const f = r.files['verification.md'];
    expect(f.source).toBe('base');
    expect(fs.readFileSync(f.use, 'utf8')).toBe('## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    expect(r.notices[0]).toMatch(/both/);
    expect(r.notices[0]).toMatch(/NOT read/);
  });

  test('no remote: branch copies, exactly one notice, exit 0', () => {
    const repo = fixture();
    g(repo, 'remote', 'remove', 'origin');
    const r = cli(['resolve', '--root', repo, '--no-gh', '--base', 'main', '--no-fetch']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.notices).toHaveLength(1);
    expect(out.files['verification.md'].use).toBe(VER);
  });

  test('no base determinable: branch copies, one notice', () => {
    const repo = fixture();
    g(repo, 'remote', 'remove', 'origin');
    const r = resolve({ root: repo, gh: false, fetch: false });
    expect(r.base).toBeNull();
    expect(r.notices).toHaveLength(1);
    expect(r.files['verification.md'].use).toBe(VER);
  });

  test('root not the git top level: branch copies, one notice', () => {
    const repo = fixture();
    const nested = path.join(repo, 'slot');
    fs.mkdirSync(nested);
    const r = resolve({ root: nested, base: 'main', gh: false });
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatch(/top level/);
    expect(r.files['verification.md'].use).toBe(VER);
  });

  test('base resolved from origin/HEAD when none is given', () => {
    const repo = fixture();
    advanceMain(repo, '## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    const r = resolve({ root: repo, gh: false });
    expect(r.base).toBe('main');
    expect(r.files['verification.md'].source).toBe('base');
  });

  test('a file on neither side keeps the branch path with no notice', () => {
    const repo = fixture();
    const r = resolve(opts(repo));
    expect(r.files['ship.md']).toMatchObject({ use: '.claude/rules/ship.md', differs: false });
    expect(r.notices).toEqual([]);
  });

  test('path reuses the base a fetching resolve recorded, instead of looking it up again', () => {
    const repo = fixture();
    // a second base branch whose copy differs; origin/HEAD still points at main
    g(repo, 'checkout', '-q', '-b', 'develop', 'main');
    commit(repo, VER, '## 5a. Coverage floor\n\nCoverage floor: 90%\n');
    g(repo, 'push', '-q', 'origin', 'develop');
    g(repo, 'checkout', '-q', 'feature');
    resolve({ root: repo, base: 'develop', gh: false, fetch: true });
    const p = pathFor('verification.md', { root: repo, gh: false });
    expect(fs.readFileSync(p, 'utf8')).toContain('90%');
  });

  test('a fetching resolve that falls back clears the recorded base', () => {
    const repo = fixture();
    g(repo, 'checkout', '-q', '-b', 'develop', 'main');
    commit(repo, VER, '## 5a. Coverage floor\n\nCoverage floor: 90%\n');
    g(repo, 'push', '-q', 'origin', 'develop');
    g(repo, 'checkout', '-q', 'feature');
    resolve({ root: repo, base: 'develop', gh: false, fetch: true });
    // the next step's base has no origin ref: its resolve falls back, and so must later reads
    const r = resolve({ root: repo, base: 'gone', gh: false, fetch: true });
    expect(r.files['verification.md'].use).toBe(VER);
    g(repo, 'remote', 'set-head', 'origin', '--delete');
    expect(pathFor('verification.md', { root: repo, gh: false })).toBe(VER);
  });

  test('a base recorded on another branch of the checkout is not reused', () => {
    const repo = fixture();
    g(repo, 'checkout', '-q', '-b', 'develop', 'main');
    commit(repo, VER, '## 5a. Coverage floor\n\nCoverage floor: 90%\n');
    g(repo, 'push', '-q', 'origin', 'develop');
    g(repo, 'checkout', '-q', 'feature');
    resolve({ root: repo, base: 'develop', gh: false, fetch: true });
    g(repo, 'checkout', '-q', '-b', 'other', 'main');
    // origin/HEAD is main, whose copy equals this branch's: the develop record must not apply
    expect(pathFor('verification.md', { root: repo, gh: false })).toBe(VER);
  });

  test('a CRLF checkout of an unchanged file is not a branch edit', () => {
    const repo = fixture();
    write(repo, '.gitattributes', '*.md text eol=crlf\n');
    write(repo, VER, '## 5a. Coverage floor\r\n\r\nCoverage floor: 50%\r\n');
    const r = resolve(opts(repo));
    expect(r.files['verification.md']).toMatchObject({ use: VER, branchChanged: false, differs: false });
    expect(r.notices).toEqual([]);
  });

  test('a base that is not a plain branch name falls back to the branch copies', () => {
    const repo = fixture();
    for (const bad of ['--upload-pack=touch x', 'main:main']) {
      const r = resolve({ root: repo, base: bad, gh: false, fetch: true });
      expect(r.files['verification.md']).toMatchObject({ use: VER, source: 'branch' });
      expect(r.notices).toHaveLength(1);
      expect(r.notices[0]).toMatch(/not a valid branch name/);
    }
  });

  test('a one-line edit reports 1 line differing; an unchanged base copy is not rewritten', () => {
    const repo = fixture();
    advanceMain(repo, '## 5a. Coverage floor\n\nCoverage floor: 80%\n');
    const r = resolve({ ...opts(repo), fetch: true });
    expect(r.notices[0]).toMatch(/\(1 lines differ\)/);
    const use = r.files['verification.md'].use;
    fs.utimesSync(use, new Date(0), new Date(0));
    resolve(opts(repo));
    expect(fs.statSync(use).mtimeMs).toBe(0);
    expect(fs.readdirSync(path.dirname(use)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  test('a file the base removed keeps the branch copy and says it was removed', () => {
    const repo = fixture();
    g(repo, 'checkout', '-q', 'main');
    g(repo, 'rm', '-q', VER);
    g(repo, 'commit', '-q', '-m', 'drop');
    g(repo, 'push', '-q', 'origin', 'main');
    g(repo, 'checkout', '-q', 'feature');
    const r = resolve(opts(repo));
    expect(r.files['verification.md']).toMatchObject({ use: VER, source: 'branch' });
    expect(r.notices[0]).toMatch(/removed on origin\/main/);
  });

  test('usage errors exit 2', () => {
    expect(cli([]).status).toBe(2);
    expect(cli(['path']).status).toBe(2);
    expect(cli(['path', 'README.md']).status).toBe(2);
  });
});
