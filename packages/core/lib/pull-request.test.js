'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readMode, decide } = require('./pull-request');

const LIB = path.join(__dirname, 'pull-request.js');
const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prlib-'));
  tmpDirs.push(d);
  return d;
}
afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('readMode', () => {
  const write = (content) => {
    const f = path.join(tmp(), 'settings.json');
    fs.writeFileSync(f, content);
    return f;
  };
  test('auto', () => expect(readMode(write('{"ensemble":{"openPullRequest":"auto"}}'))).toBe('auto'));
  test('never', () => expect(readMode(write('{"ensemble":{"openPullRequest":"never"}}'))).toBe('never'));
  test('missing file', () => expect(readMode('/nonexistent/settings.json')).toBe('never'));
  test('missing key', () => expect(readMode(write('{"ensemble":{}}'))).toBe('never'));
  test('garbage value', () => expect(readMode(write('{"ensemble":{"openPullRequest":"yes"}}'))).toBe('never'));
  test('invalid JSON', () => expect(readMode(write('not json'))).toBe('never'));
});

describe('decide', () => {
  const ok = { mode: 'auto', branch: 'feat', defaultBranch: 'main', ghAvailable: true, openPrUrl: null };
  test('never -> skipped', () => expect(decide({ ...ok, mode: 'never' }).action).toBe('skipped'));
  test('default branch -> skipped', () => expect(decide({ ...ok, branch: 'main' }).action).toBe('skipped'));
  test('detached HEAD -> skipped', () => expect(decide({ ...ok, branch: 'HEAD' }).action).toBe('skipped'));
  test('unknown default -> skipped', () => {
    const d = decide({ ...ok, defaultBranch: '' });
    expect(d).toEqual({ action: 'skipped', reason: 'default branch unknown' });
  });
  test('gh unavailable -> skipped', () => expect(decide({ ...ok, ghAvailable: false }).action).toBe('skipped'));
  test('no open PR -> opened', () => expect(decide(ok).action).toBe('opened'));
  test('open PR -> updated', () => expect(decide({ ...ok, openPrUrl: 'u' }).action).toBe('updated'));
});

describe('ensure CLI', () => {
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout;
  };
  function cleanEnv(extra = {}) {
    const e = { ...process.env, ...extra };
    delete e.GIT_DIR;
    delete e.GIT_WORK_TREE;
    delete e.GIT_INDEX_FILE;
    return e;
  }

  /** Temp repo with a local bare origin and a stub gh that logs argv to calls.log. */
  function setup({ branch = 'feature/x', mode = 'auto' } = {}) {
    const root = tmp();
    const bare = path.join(root, 'origin.git');
    const repo = path.join(root, 'repo');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(repo);
    fs.mkdirSync(bin);
    git(root, 'init', '--bare', '-b', 'main', bare);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.email', 't@example.com');
    git(repo, 'config', 'user.name', 't');
    git(repo, 'remote', 'add', 'origin', bare);
    fs.mkdirSync(path.join(repo, '.claude'));
    fs.writeFileSync(path.join(repo, '.claude', 'settings.json'), JSON.stringify({ ensemble: { openPullRequest: mode } }));
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'init');
    git(repo, 'push', '-u', 'origin', 'main');
    if (branch !== 'main') git(repo, 'checkout', '-b', branch);
    fs.writeFileSync(path.join(repo, 'body.md'), 'body');
    const log = path.join(root, 'calls.log');
    // Behaviour is driven by env vars so each test configures the stub without rewriting it.
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh
echo "$@" >> "${log}"
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") [ -n "$STUB_DEFAULT" ] && { echo "$STUB_DEFAULT"; exit 0; } || exit 1 ;;
  "pr list") [ -n "$STUB_OPEN_URL" ] && echo "$STUB_OPEN_URL"; exit 0 ;;
  "pr create") [ -n "$STUB_CREATE_FAIL" ] && { echo "boom: create failed" >&2; echo "second line" >&2; exit 1; }
               echo "https://example.test/pr/7"; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
    const ensure = (env = {}) => {
      const r = spawnSync('node', [LIB, 'ensure', '--title', 'T', '--body-file', 'body.md'], {
        cwd: repo,
        encoding: 'utf8',
        env: cleanEnv({ PATH: `${bin}:${process.env.PATH}`, ...env }),
      });
      return JSON.parse(r.stdout.trim());
    };
    const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
    return { repo, ensure, calls };
  }

  test('mode subcommand prints the setting relative to cwd', () => {
    const { repo } = setup();
    const r = spawnSync('node', [LIB, 'mode'], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    expect(r.stdout.trim()).toBe('auto');
  });

  test('default branch -> skipped, no pr create', () => {
    const s = setup({ branch: 'main' });
    const out = s.ensure({ STUB_DEFAULT: 'main' });
    expect(out.action).toBe('skipped');
    expect(s.calls()).not.toMatch(/pr create/);
  });

  test('mode never -> skipped without calling gh', () => {
    const s = setup({ mode: 'never' });
    expect(s.ensure({ STUB_DEFAULT: 'main' }).action).toBe('skipped');
    expect(s.calls()).toBe('');
  });

  test('feature branch, no open PR -> opened via pr create --base <default>', () => {
    const s = setup();
    const out = s.ensure({ STUB_DEFAULT: 'main' });
    expect(out).toMatchObject({ action: 'opened', url: 'https://example.test/pr/7' });
    expect(s.calls()).toMatch(/pr create --base main --head feature\/x --title T --body-file body\.md/);
  });

  test('open PR -> updated, no create', () => {
    const s = setup();
    const out = s.ensure({ STUB_DEFAULT: 'main', STUB_OPEN_URL: 'https://example.test/pr/3' });
    expect(out).toMatchObject({ action: 'updated', url: 'https://example.test/pr/3' });
    expect(s.calls()).not.toMatch(/pr create/);
  });

  test('only a closed PR (list --state open prints nothing) -> opened', () => {
    const s = setup();
    const out = s.ensure({ STUB_DEFAULT: 'main' });
    expect(out.action).toBe('opened');
    expect(s.calls()).toMatch(/pr list --head feature\/x --state open/);
  });

  test('default branch unknown -> skipped', () => {
    const s = setup();
    const out = s.ensure(); // stub repo view fails, origin/HEAD unset
    expect(out).toMatchObject({ action: 'skipped', reason: 'default branch unknown' });
    expect(s.calls()).not.toMatch(/pr create/);
  });

  test('falls back to origin/HEAD when gh repo view fails', () => {
    const s = setup();
    git(s.repo, 'remote', 'set-head', 'origin', 'main');
    expect(s.ensure().action).toBe('opened');
    expect(s.calls()).toMatch(/--base main/);
  });

  test('pr create exits non-zero -> failed with first line only', () => {
    const s = setup();
    const out = s.ensure({ STUB_DEFAULT: 'main', STUB_CREATE_FAIL: '1' });
    expect(out).toMatchObject({ action: 'failed', reason: 'boom: create failed' });
  });
});

describe('source safety', () => {
  const src = fs.readFileSync(LIB, 'utf8');
  test('never invokes pr merge', () => expect(src).not.toMatch(/['"]merge['"]/));
  test('never uses execSync', () => expect(src).not.toMatch(/execSync/));
});
