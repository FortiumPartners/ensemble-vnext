'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide } = require('./merge-up');

const LIB = path.join(__dirname, 'merge-up.js');
const origPath = process.env.PATH;
let bin;

beforeAll(() => {
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-up-'));
  fs.writeFileSync(
    path.join(bin, 'gh'),
    '#!/bin/sh\n[ -n "$STUB_PR_FAIL" ] && { echo "HTTP 404" >&2; exit 1; }\necho "$STUB_PR_JSON"\n',
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}${path.delimiter}${origPath}`;
});
afterAll(() => {
  process.env.PATH = origPath;
  fs.rmSync(bin, { recursive: true, force: true });
});
afterEach(() => {
  delete process.env.STUB_PR_JSON;
  delete process.env.STUB_PR_FAIL;
});

const pr = (state, mergeable, mergeStateStatus) => {
  process.env.STUB_PR_JSON = JSON.stringify({ state, mergeable, mergeStateStatus });
};

describe('decide', () => {
  test('a merged PR is skipped even though it reads UNKNOWN', () => {
    pr('MERGED', 'UNKNOWN', 'UNKNOWN');
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'skip' });
  });

  test('a closed, unmerged PR is refused, never merged into or polled', () => {
    pr('CLOSED', 'CONFLICTING', 'DIRTY');
    expect(decide({ pr: 7 })).toMatchObject({ ok: false, action: 'refused' });
    pr('CLOSED', 'UNKNOWN', 'UNKNOWN');
    expect(decide({ pr: 7 }).reason).toMatch(/closed/);
  });

  test('UNKNOWN mergeable on an open PR is poll', () => {
    pr('OPEN', 'UNKNOWN', 'UNKNOWN');
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'poll' });
  });

  test('MERGEABLE with an uncomputed status is poll, not skip', () => {
    pr('OPEN', 'MERGEABLE', 'UNKNOWN');
    expect(decide({ pr: 7 }).action).toBe('poll');
  });

  test('CONFLICTING is merge-in', () => {
    pr('OPEN', 'CONFLICTING', 'DIRTY');
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'merge-in' });
  });

  test('MERGEABLE and BEHIND is merge-in, naming the up-to-date requirement', () => {
    pr('OPEN', 'MERGEABLE', 'BEHIND');
    const r = decide({ pr: 7 });
    expect(r.action).toBe('merge-in');
    expect(r.reason).toMatch(/up to date/i);
  });

  test.each(['CLEAN', 'BLOCKED', 'UNSTABLE'])('MERGEABLE and %s is skip', (status) => {
    pr('OPEN', 'MERGEABLE', status);
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'skip' });
  });

  test('a failing gh is ok: false with the reason', () => {
    process.env.STUB_PR_FAIL = '1';
    const r = decide({ pr: 7 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/HTTP 404/);
  });

  test('unparseable gh output is ok: false', () => {
    process.env.STUB_PR_JSON = 'not json';
    const r = decide({ pr: 7 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/parse/i);
  });

  test('a non-integer PR is refused', () => {
    expect(decide({ pr: 'x1' })).toMatchObject({ ok: false });
    expect(decide({})).toMatchObject({ ok: false });
  });
});

describe('CLI', () => {
  const cli = (...args) => spawnSync('node', [LIB, ...args], { encoding: 'utf8', env: process.env });

  test('prints one JSON line and exits 0', () => {
    pr('OPEN', 'MERGEABLE', 'BEHIND');
    const r = cli('decide', '--pr', '7');
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, action: 'merge-in' });
  });

  test('a non-integer --pr prints a usage refusal and exits 0', () => {
    const r = cli('decide', '--pr', 'abc');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, action: 'refused' });
  });

  test('an unknown verb prints a usage refusal', () => {
    expect(JSON.parse(cli('nope').stdout)).toMatchObject({ ok: false, action: 'refused' });
  });

  test('packages/full/lib/merge-up.js is a symlink to the core file', () => {
    const link = path.join(__dirname, '..', '..', 'full', 'lib', 'merge-up.js');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('../../core/lib/merge-up.js');
  });
});

describe('sync-head', () => {
  const { syncHead } = require('./merge-up');
  const g = (cwd, ...a) => {
    const r = spawnSync('git', a, { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const write = (cwd, f, c) => {
    fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true });
    fs.writeFileSync(path.join(cwd, f), c);
  };
  const commit = (cwd, f, c, msg = 'c') => {
    write(cwd, f, c);
    g(cwd, 'add', '-A');
    g(cwd, 'commit', '-q', '-m', msg);
    return g(cwd, 'rev-parse', 'HEAD');
  };
  let root, origin, local, other, A;
  const clone = (dir) => {
    g(root, 'clone', '-q', origin, dir);
    g(path.join(root, dir), 'config', 'user.email', 't@t');
    g(path.join(root, dir), 'config', 'user.name', 't');
    return path.join(root, dir);
  };
  const sync = (judged, extra = {}) => syncHead({ pr: 7, branch: 'feat', base: 'main', judged, cwd: local, ...extra });

  beforeEach(() => {
    process.env.STUB_PR_JSON = JSON.stringify({ state: 'OPEN' });
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-head-'));
    origin = path.join(root, 'origin.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', origin);
    const seed = clone('seed');
    commit(seed, 'README.md', 'x');
    commit(seed, 'src/a.js', '1');
    g(seed, 'push', '-q', 'origin', 'main');
    g(seed, 'checkout', '-q', '-b', 'feat');
    A = commit(seed, 'src/feature.js', 'f');
    g(seed, 'push', '-q', 'origin', 'feat');
    local = clone('local');
    g(local, 'checkout', '-q', 'feat');
    other = clone('other');
    g(other, 'checkout', '-q', 'feat');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const baseMergeOnOther = () => {
    g(other, 'checkout', '-q', 'main');
    commit(other, 'src/base.js', 'b');
    g(other, 'push', '-q', 'origin', 'main');
    g(other, 'checkout', '-q', 'feat');
    g(other, 'merge', '-q', '--no-ff', '--no-edit', 'main');
    g(other, 'push', '-q', 'origin', 'feat');
    return g(other, 'rev-parse', 'HEAD');
  };

  test('(a) tip equals judged and local: not moved, HEAD untouched', () => {
    const r = sync(A);
    expect(r).toMatchObject({ ok: true, head: A, moved: false, sync: 'none' });
    expect(g(local, 'rev-parse', 'HEAD')).toBe(A);
  });

  test('(b) a base merge pushed by another clone: moved, baseOnly, fast-forwarded', () => {
    const B = baseMergeOnOther();
    const r = sync(A);
    expect(r).toMatchObject({ ok: true, head: B, moved: true, baseOnly: true, sync: 'fast-forward', changed: [] });
    expect(g(local, 'rev-parse', 'HEAD')).toBe(B);
  });

  test('(c) a feature-file edit, and a test-only commit, are not base-only', () => {
    const B = commit(other, 'src/feature.js', 'f2');
    g(other, 'push', '-q', 'origin', 'feat');
    expect(sync(A)).toMatchObject({ moved: true, baseOnly: false, changed: ['src/feature.js'], head: B });
    g(local, 'reset', '-q', '--hard', A);
    commit(other, 'src/thing.test.js', 't');
    g(other, 'push', '-q', 'origin', 'feat');
    const r = sync(B);
    expect(r).toMatchObject({ moved: true, baseOnly: false, changed: ['src/thing.test.js'] });
  });

  test('(d) judged equals the tip but local is behind: not moved, still fast-forwarded', () => {
    const B = commit(other, 'src/more.js', 'm');
    g(other, 'push', '-q', 'origin', 'feat');
    expect(sync(B)).toMatchObject({ moved: false, sync: 'fast-forward' });
    expect(g(local, 'rev-parse', 'HEAD')).toBe(B);
  });

  test('(e) a local record-file commit is merged, and custody no longer refuses', () => {
    const { reconcile } = require('./custody');
    commit(local, '.trd-state/f/implement.json', '{}', 'record');
    const B = commit(other, 'src/more.js', 'm');
    g(other, 'push', '-q', 'origin', 'feat');
    const custodyArgs = { stateDir: path.join(local, '.trd-state', 'f'), trdPath: null, cwd: local, head: B };
    // Before the sync: local sits behind the tip (it lacks src/more.js), so custody sees a
    // shipped-file mismatch between the local tree and the PR head and refuses.
    const before = reconcile(custodyArgs);
    expect(before.action).toBe('refused');
    expect(before.differing).toEqual(['src/more.js']);
    const r = sync(A);
    expect(r).toMatchObject({ ok: true, sync: 'merged', head: B });
    // The merge brought the tip in; only the record file differs from it, and custody ignores that.
    expect(g(local, 'diff', '--name-only', B, 'HEAD')).toBe('.trd-state/f/implement.json');
    expect(g(local, 'merge-base', '--is-ancestor', B, 'HEAD') ?? '').toBe('');
    expect(reconcile(custodyArgs).action).not.toBe('refused');
  });

  test('(f) a local source commit not on the tip is a divergence; HEAD unchanged', () => {
    const L = commit(local, 'src/mine.js', 'x');
    commit(other, 'src/more.js', 'm');
    g(other, 'push', '-q', 'origin', 'feat');
    const r = sync(A);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/src\/mine\.js/);
    expect(g(local, 'rev-parse', 'HEAD')).toBe(L);
  });

  test('a conflicting record-file merge is aborted', () => {
    commit(local, '.trd-state/f/a.json', 'local', 'record');
    commit(other, '.trd-state/f/a.json', 'remote');
    g(other, 'push', '-q', 'origin', 'feat');
    const before = g(local, 'rev-parse', 'HEAD');
    expect(sync(A).ok).toBe(false);
    expect(g(local, 'rev-parse', 'HEAD')).toBe(before);
    expect(g(local, 'status', '--porcelain')).toBe('');
  });

  test('(g) a MERGED PR touches nothing; a CLOSED one is refused', () => {
    commit(other, 'src/more.js', 'm');
    g(other, 'push', '-q', 'origin', 'feat');
    process.env.STUB_PR_JSON = JSON.stringify({ state: 'MERGED' });
    expect(sync(A)).toMatchObject({ ok: true, moved: false });
    expect(g(local, 'rev-parse', 'HEAD')).toBe(A);
    expect(g(local, 'rev-parse', '--verify', '-q', 'origin/feat')).toBe(A);
    process.env.STUB_PR_JSON = JSON.stringify({ state: 'CLOSED' });
    expect(sync(A).ok).toBe(false);
  });

  test('(h) a failing gh is ok: false', () => {
    process.env.STUB_PR_FAIL = '1';
    expect(sync(A).ok).toBe(false);
  });

  test('(i) --judged none is moved', () => {
    expect(sync('none')).toMatchObject({ ok: true, moved: true, judged: 'none', baseOnly: false });
  });

  test('an abbreviated or upper-case --judged naming the tip is not moved', () => {
    expect(sync(A.slice(0, 10))).toMatchObject({ ok: true, moved: false });
    expect(sync(A.toUpperCase())).toMatchObject({ ok: true, moved: false });
  });

  test('an unresolvable --judged is moved, with no base excuse', () => {
    expect(sync('deadbeefdeadbeef')).toMatchObject({ ok: true, moved: true, baseOnly: false });
  });

  test('local strictly ahead of the tip (an unpushed own commit) is not a divergence', () => {
    const L = commit(local, 'src/mine.js', 'x');
    expect(sync(A)).toMatchObject({ ok: true, head: A, moved: false, sync: 'none' });
    expect(g(local, 'rev-parse', 'HEAD')).toBe(L);
  });

  test('a checkout on another branch is refused and nothing moves', () => {
    commit(other, 'src/more.js', 'm');
    g(other, 'push', '-q', 'origin', 'feat');
    g(local, 'checkout', '-q', 'main');
    const before = g(local, 'rev-parse', 'HEAD');
    const r = sync(A);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not feat/);
    expect(g(local, 'rev-parse', 'HEAD')).toBe(before);
  });

  test('arguments are validated', () => {
    expect(sync(A, { pr: 'x' }).ok).toBe(false);
    expect(sync(A, { branch: '--upload-pack=x' }).ok).toBe(false);
    expect(sync('--bad').ok).toBe(false);
    expect(sync(A, { base: '-x' }).ok).toBe(false);
  });

  test('the CLI prints one JSON line and exits 0', () => {
    const r = spawnSync('node', [LIB, 'sync-head', '--pr', '7', '--branch', 'feat', '--base', 'main', '--judged', A, '--trd', 'none'], { cwd: local, encoding: 'utf8', env: process.env });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, moved: false });
  });
});
