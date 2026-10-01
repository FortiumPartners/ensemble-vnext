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
  // Every scenario's stub-gh log reader, so one check can cover them all.
  const ghLogs = [];
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
  "auth status") [ -n "$STUB_AUTH_FAIL" ] && exit 1; exit 0 ;;
  "repo view") [ -n "$STUB_DEFAULT" ] && { echo "$STUB_DEFAULT"; exit 0; } || exit 1 ;;
  "pr list") [ -n "$STUB_LIST_FAIL" ] && { echo "HTTP 502: list failed" >&2; exit 1; }
             [ -n "$STUB_OPEN_URL" ] && echo "$STUB_OPEN_URL"
             # A closed PR is only listed when the query does not filter to open ones.
             case "$*" in *"--state open"*) ;; *) [ -n "$STUB_CLOSED_URL" ] && echo "$STUB_CLOSED_URL" ;; esac
             exit 0 ;;
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
    ghLogs.push(calls);
    return { repo, ensure, calls };
  }

  // Runs after the scenarios below (inner afterAll runs before the file-level temp cleanup).
  afterAll(() => {
    const all = ghLogs.map((f) => f()).join('\n');
    expect(all).toMatch(/pr create/); // the logs were really populated
    expect(all.split('\n').filter((l) => l.trim().split(/\s+/).includes('merge'))).toEqual([]);
  });

  test('mode subcommand prints the setting relative to cwd', () => {
    const { repo } = setup();
    const r = spawnSync('node', [LIB, 'mode'], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    expect(r.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(r.stdout)).toBe('auto');
  });

  test('mode subcommand prints never as one JSON line', () => {
    const { repo } = setup({ mode: 'never' });
    const r = spawnSync('node', [LIB, 'mode'], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    expect(r.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(r.stdout)).toBe('never');
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
    const out = s.ensure({ STUB_DEFAULT: 'main', STUB_CLOSED_URL: 'https://example.test/pr/1' });
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

  test('gh not authenticated -> skipped with that reason, no repo view', () => {
    const s = setup();
    const out = s.ensure({ STUB_AUTH_FAIL: '1' });
    expect(out).toMatchObject({ action: 'skipped', reason: 'gh missing or not authenticated' });
    expect(s.calls()).not.toMatch(/repo view/);
  });

  test('pr list fails -> failed, no blind create', () => {
    const s = setup();
    const out = s.ensure({ STUB_DEFAULT: 'main', STUB_LIST_FAIL: '1' });
    expect(out).toMatchObject({ action: 'failed', reason: 'HTTP 502: list failed' });
    expect(s.calls()).not.toMatch(/pr create/);
  });

  test('rejected push -> reason names the rejection, not the "To <remote>" line', () => {
    const s = setup();
    // Put a diverging commit on origin's feature/x so the push is non-fast-forward.
    git(s.repo, 'commit', '--allow-empty', '-m', 'local');
    git(s.repo, 'push', '-u', 'origin', 'feature/x');
    git(s.repo, 'reset', '--hard', 'HEAD~1');
    git(s.repo, 'commit', '--allow-empty', '-m', 'diverged');
    const out = s.ensure({ STUB_DEFAULT: 'main' });
    expect(out.action).toBe('failed');
    expect(out.reason).not.toMatch(/^To /);
    expect(out.reason).toMatch(/rejected/);
  });
});

describe('source safety', () => {
  // Drop // and /* */ comments but keep string and template-literal contents, so prose may say
  // "merge" while any executable use (string, template, or argument) is still seen.
  function stripComments(code) {
    let out = '';
    let i = 0;
    while (i < code.length) {
      const c = code[i];
      const n = code[i + 1];
      if (c === '/' && n === '/') {
        while (i < code.length && code[i] !== '\n') i++;
      } else if (c === '/' && n === '*') {
        const end = code.indexOf('*/', i + 2);
        i = end === -1 ? code.length : end + 2;
      } else if (c === "'" || c === '"' || c === '`') {
        let j = i + 1;
        while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
        out += code.slice(i, j + 1);
        i = j + 1;
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }
  const mentionsMerge = (code) => /merge/i.test(stripComments(code));

  const src = fs.readFileSync(LIB, 'utf8');
  test('never invokes pr merge in executable code', () => expect(mentionsMerge(src)).toBe(false));
  test('the merge check ignores comments but catches every invocation form', () => {
    expect(mentionsMerge('// never merge\n/* gh pr merge */ run("gh", ["pr", "create"]);')).toBe(false);
    expect(mentionsMerge("run('gh', ['pr', 'merge'])")).toBe(true);
    expect(mentionsMerge('run("gh", ["pr", "merge"])')).toBe(true);
    expect(mentionsMerge("run('gh', 'pr merge 7'.split(' '))")).toBe(true);
    expect(mentionsMerge('run(`gh pr merge ${n}`)')).toBe(true);
    expect(mentionsMerge("const sub = 'merge'; run('gh', ['pr', sub])")).toBe(true);
    expect(mentionsMerge("run('gh', ['pr', \"merge\", '--auto'])")).toBe(true);
  });
  test('never uses execSync', () => expect(src).not.toMatch(/execSync/));
});
