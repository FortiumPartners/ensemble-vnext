'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const custody = require('./custody');
const liveEvidence = require('./live-evidence');

const { reconcile, check, classifyPath } = custody;
const LIB = path.join(__dirname, 'custody.js');

const tmpDirs = [];
function tmp() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'custody-')));
  tmpDirs.push(d);
  return d;
}
afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function cleanEnv(extra = {}) {
  const e = { ...process.env, ...extra };
  delete e.GIT_DIR;
  delete e.GIT_WORK_TREE;
  delete e.GIT_INDEX_FILE;
  return e;
}
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

const TRD = 'docs/TRD/f.md';
const TRD_TEXT = [
  '# F', '', '## Objectives', '',
  '| ID | Objective | Must pass |', '|----|-----------|-----------|',
  '| O1 | first | yes |', '',
].join('\n');
const DEFINITION = [
  '# D', '',
  '| ID | Functional statement | Cites | Evidence | Derivation | Tier 1 | Parts | Must pass |',
  '|----|----|----|----|----|----|----|----|',
  '| FS-1 | a | c | e | [read] | locator | | O1 |', '',
].join('\n');

/** A temp repo on branch feature/x with a local bare origin, a TRD and a state directory. */
function setup() {
  const root = tmp();
  const bare = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(root, 'init', '--bare', '-b', 'main', bare);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'remote', 'add', 'origin', bare);
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  };
  const commit = (msg, files = {}) => {
    for (const [rel, text] of Object.entries(files)) write(rel, text);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', msg);
    return git(repo, 'rev-parse', 'HEAD');
  };
  commit('init', { 'src/a.js': 'a1', 'src/b.js': 'b1', [TRD]: TRD_TEXT, 'README.md': 'r' });
  git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'checkout', '-b', 'feature/x');
  const stateDir = path.join(repo, '.trd-state', 'f');
  fs.mkdirSync(stateDir, { recursive: true });
  const readCustody = () => JSON.parse(fs.readFileSync(path.join(stateDir, 'custody.json'), 'utf8'));
  const args = (extra = {}) => ({ stateDir, trdPath: TRD, cwd: repo, ...extra });
  return { root, repo, stateDir, write, commit, readCustody, args };
}

describe('classifyPath (D10)', () => {
  test.each([
    ['.trd-state/f/implement.json', 'ignored'],
    ['.trd-state/f/audit-build-report.md', 'ignored'],
    ['docs/TRD/f.md', 'ignored'],
    ['docs/TRD/other.md', 'shipped'],
    ['src/a.test.js', 'test-only'],
    ['src/a.test.sh', 'test-only'],
    ['src/a.spec.tsx', 'test-only'],
    ['t/x.bats', 'test-only'],
    ['pkg/test_x.py', 'test-only'],
    ['pkg/x_test.py', 'test-only'],
    ['pkg/x_test.go', 'test-only'],
    ['pkg/FooTest.java', 'test-only'],
    ['pkg/FooTests.cs', 'test-only'],
    ['spec/x_spec.rb', 'test-only'],
    ['test/x_test.exs', 'test-only'],
    ['src/__tests__/helper.js', 'test-only'],
    ['src/__fixtures__/data.json', 'test-only'],
    ['src/__mocks__/m.js', 'test-only'],
    ['test/helpers/setup.js', 'shipped'],
    ['src/a.js', 'shipped'],
    ['a.spec.rb', 'shipped'],
  ])('%s is %s', (p, expected) => {
    expect(classifyPath(p, TRD)).toBe(expected);
  });
});

describe('reconcile: setting the anchor', () => {
  test('no audit: the anchor is HEAD, source pushed', () => {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    const r = reconcile(s.args());
    expect(r).toMatchObject({ action: 'set', anchor: head });
    expect(s.readCustody()).toEqual({ version: 1, anchor: { commit: head, source: 'pushed' }, moves: [] });
  });

  test('a unique short audited id resolves to the full sha and is source audited', () => {
    const s = setup();
    const audited = s.commit('audited', { 'src/a.js': 'a2' });
    s.commit('pre-ship fix', { 'src/b.js': 'b2' });
    fs.writeFileSync(path.join(s.stateDir, 'closed.json'), JSON.stringify({ audit: { auditedCommit: audited.slice(0, 7) } }));
    const r = reconcile(s.args());
    // The anchor is the audited commit; the later fix is then judged against it (no definition -> moved).
    expect(s.readCustody().moves[0]).toMatchObject({ from: audited, rule: 'no-success-definition' });
    expect(s.readCustody().anchor.source).toBe('audited');
    expect(r.action).toBe('moved');
  });

  test('an ambiguous short id is refused with that reason and sets no anchor', () => {
    const s = setup();
    const tree = git(s.repo, 'rev-parse', 'HEAD^{tree}');
    const seen = new Map();
    let prefix = null;
    for (let i = 0; i < 6000 && !prefix; i++) {
      const sha = git(s.repo, 'commit-tree', tree, '-m', `c${i}`);
      const p = sha.slice(0, 4);
      if (seen.has(p)) prefix = p;
      seen.set(p, sha);
    }
    expect(prefix).not.toBeNull();
    fs.writeFileSync(path.join(s.stateDir, 'closed.json'), JSON.stringify({ audit: { auditedCommit: prefix } }));
    const r = reconcile(s.args());
    expect(r.action).toBe('refused');
    expect(r.reason).toMatch(/ambiguous/);
    expect(fs.existsSync(path.join(s.stateDir, 'custody.json'))).toBe(false);
  });

  test('an audited id that names no commit is refused', () => {
    const s = setup();
    fs.writeFileSync(path.join(s.stateDir, 'closed.json'), JSON.stringify({ audit: { auditedCommit: 'deadbee' } }));
    expect(reconcile(s.args())).toMatchObject({ action: 'refused', reason: expect.stringMatching(/missing/) });
  });
});

describe('reconcile: moving the anchor', () => {
  function anchored() {
    const s = setup();
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    return s;
  }

  test.each([
    ['only under .trd-state/', { '.trd-state/f/audit-build-report.md': 'x' }],
    ['only to the TRD', { [TRD]: TRD_TEXT + '\nmore' }],
    ['only to a test-only file', { 'src/a.test.js': 't', 'src/__tests__/h.js': 'h' }],
  ])('a change %s is equal: none, anchor stays', (_n, files) => {
    const s = anchored();
    const before = s.readCustody().anchor.commit;
    s.commit('ignored change', files);
    const r = reconcile(s.args());
    expect(r.action).toBe('none');
    expect(s.readCustody().anchor.commit).toBe(before);
    expect(s.readCustody().moves).toEqual([]);
  });

  test('a shipped file renamed under .trd-state/ is not equal', () => {
    const s = anchored();
    const before = s.readCustody().anchor.commit;
    fs.mkdirSync(path.join(s.repo, '.trd-state/f'), { recursive: true });
    git(s.repo, 'mv', 'src/b.js', '.trd-state/f/b.js');
    git(s.repo, 'commit', '-m', 'hide shipped file');
    const r = reconcile(s.args({ reason: 'format' }));
    expect(r.differing).toEqual(['src/b.js']);
    expect(r.action).toBe('moved');
    expect(s.readCustody().anchor.commit).not.toBe(before);
  });

  test('a shipped-source change with no TRD (sweep work) moves with no-success-definition, no throw', () => {
    const s = anchored();
    const from = s.readCustody().anchor.commit;
    const head = s.commit('more', { 'src/b.js': 'b2' });
    const r = reconcile(s.args({ trdPath: null }));
    expect(r).toMatchObject({ action: 'moved', anchor: head });
    expect(s.readCustody().moves).toEqual([
      expect.objectContaining({ from, to: head, rule: 'no-success-definition', reverified: [] }),
    ]);
  });

  test('a missing success-definition.md also moves with no-success-definition', () => {
    const s = anchored();
    s.commit('more', { 'src/b.js': 'b2' });
    reconcile(s.args());
    expect(s.readCustody().moves[0].rule).toBe('no-success-definition');
  });

  test('--reason format moves without re-verification', () => {
    const s = anchored();
    fs.writeFileSync(path.join(s.stateDir, 'success-definition.md'), DEFINITION);
    const head = s.commit('prettier', { 'src/a.js': 'a2 ' });
    const r = reconcile(s.args({ reason: 'format' }));
    expect(r).toMatchObject({ action: 'moved', anchor: head });
    expect(s.readCustody().moves[0]).toMatchObject({ rule: 'format', reverified: [] });
  });

  describe('with a success definition', () => {
    function withDefinition() {
      const s = anchored();
      fs.writeFileSync(path.join(s.stateDir, 'success-definition.md'), DEFINITION);
      fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({
        criteria: [{ id: 'FS-1', status: 'met', artifact: path.join(s.stateDir, 'evidence', 'FS-1.txt') }],
      }));
      fs.mkdirSync(path.join(s.stateDir, 'evidence'));
      fs.writeFileSync(path.join(s.stateDir, 'evidence', 'FS-1.txt'), 'proof');
      return s;
    }
    const reverified = (s, status) => {
      const p = path.join(s.root, 'reverify-state.json');
      fs.writeFileSync(p, JSON.stringify({ criteria: [{ id: 'FS-1', status }] }));
      return p;
    };

    test('no manifest: every must-pass id is uncovered, so reverify names it; the anchor does not move', () => {
      const s = withDefinition();
      const before = s.readCustody().anchor.commit;
      s.commit('fix', { 'src/b.js': 'b2' });
      const r = reconcile(s.args());
      expect(r.action).toBe('reverify');
      expect(r.ids).toEqual(['FS-1']);
      expect(r.differing).toEqual(['src/b.js']);
      expect(s.readCustody().anchor.commit).toBe(before);
    });

    test('an uncovered TRD objective (no criterion carries it) is listed too', () => {
      const s = withDefinition();
      fs.writeFileSync(path.join(s.repo, TRD), TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | yes |'));
      git(s.repo, 'add', '-A');
      git(s.repo, 'commit', '-m', 'trd');
      s.commit('fix', { 'src/b.js': 'b2' });
      expect(reconcile(s.args()).ids.sort()).toEqual(['FS-1', 'O2']);
    });

    test('a manifest whose covered files did not change: no-affected-criteria', () => {
      const s = withDefinition();
      expect(liveEvidence.record(s.stateDir, {
        task: 'T', artifact: path.join(s.stateDir, 'evidence', 'FS-1.txt'), covers: [path.join(s.repo, 'src/a.js')],
      })).toBe(true);
      const head = s.commit('unrelated fix', { 'src/b.js': 'b2' });
      const r = reconcile(s.args());
      expect(r).toMatchObject({ action: 'moved', anchor: head });
      expect(s.readCustody().moves[0]).toMatchObject({ rule: 'no-affected-criteria', reverified: [] });
    });

    test('a manifest whose covered file changed: reverify; --reverified met moves, not met is refused', () => {
      const s = withDefinition();
      liveEvidence.record(s.stateDir, {
        task: 'T', artifact: path.join(s.stateDir, 'evidence', 'FS-1.txt'), covers: [path.join(s.repo, 'src/a.js')],
      });
      const before = s.readCustody().anchor.commit;
      const head = s.commit('fix covered file', { 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1'] });

      const refused = reconcile(s.args({ reverifiedPath: reverified(s, 'unmet') }));
      expect(refused.action).toBe('refused');
      expect(refused.reason).toMatch(/FS-1/);
      expect(s.readCustody().anchor.commit).toBe(before);

      const moved = reconcile(s.args({ reverifiedPath: reverified(s, 'met') }));
      expect(moved).toMatchObject({ action: 'moved', anchor: head, ids: ['FS-1'] });
      expect(s.readCustody().moves[0]).toMatchObject({ rule: 'reverified', reverified: ['FS-1'], from: before, to: head });
      expect(s.readCustody().moves[0].at).toMatch(/^\d{4}-/);
    });

    test('an unreadable --reverified file is refused', () => {
      const s = withDefinition();
      s.commit('fix', { 'src/b.js': 'b2' });
      const r = reconcile(s.args({ reverifiedPath: path.join(s.root, 'nope.json') }));
      expect(r.action).toBe('refused');
    });
  });

  test('committing the state directory does not move the anchor', () => {
    const s = anchored();
    const before = s.readCustody().anchor.commit;
    git(s.repo, 'add', '-A');
    git(s.repo, 'commit', '-m', 'state');
    expect(reconcile(s.args()).action).toBe('none');
    expect(s.readCustody().anchor.commit).toBe(before);
  });
});

describe('check: push link', () => {
  test('passes when the pushed branch is code-equal to the anchor', () => {
    const s = setup();
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    git(s.repo, 'push', '-u', 'origin', 'feature/x');
    const r = check(s.args({ link: 'push', branch: 'feature/x' }));
    expect(r).toMatchObject({ ok: true, link: 'push', differing: [] });
  });

  test('a test-only commit pushed after the anchor still passes', () => {
    const s = setup();
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    s.commit('tests', { 'src/a.test.js': 't' });
    git(s.repo, 'push', '-u', 'origin', 'feature/x');
    expect(check(s.args({ link: 'push', branch: 'feature/x' })).ok).toBe(true);
  });

  test('fails naming the shipped file that differs', () => {
    const s = setup();
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    s.commit('sneaky', { 'src/b.js': 'b2' });
    git(s.repo, 'push', '-u', 'origin', 'feature/x');
    const r = check(s.args({ link: 'push', branch: 'feature/x' }));
    expect(r.ok).toBe(false);
    expect(r.differing).toEqual(['src/b.js']);
    expect(r.reason).toMatch(/src\/b\.js/);
  });

  test('fails when the branch is not on origin, and with no anchor', () => {
    const s = setup();
    expect(check(s.args({ link: 'push', branch: 'feature/x' })).reason).toBe('no anchor');
    reconcile(s.args());
    expect(check(s.args({ link: 'push', branch: 'feature/x' })).reason).toMatch(/not on origin/);
    expect(fs.existsSync(path.join(s.stateDir, 'custody.json'))).toBe(true);
  });
});

describe('check: merge link (stub gh)', () => {
  const origPath = process.env.PATH;
  let bin;
  beforeAll(() => {
    bin = path.join(tmp(), 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\n[ -n "$STUB_PR_FAIL" ] && { echo "HTTP 404" >&2; exit 1; }\necho "$STUB_PR_JSON"\n', { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${origPath}`;
  });
  afterAll(() => {
    process.env.PATH = origPath;
    delete process.env.STUB_PR_JSON;
    delete process.env.STUB_PR_FAIL;
  });
  afterEach(() => {
    delete process.env.STUB_PR_JSON;
    delete process.env.STUB_PR_FAIL;
  });

  function anchoredAt() {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    return { s, head };
  }
  const pr = (state, base, headRefOid) => {
    process.env.STUB_PR_JSON = JSON.stringify({ state, baseRefName: base, headRefOid });
  };

  test('passes: merged, right base, code-equal head', () => {
    const { s, head } = anchoredAt();
    pr('MERGED', 'main', head);
    expect(check(s.args({ link: 'merge', pr: 7, target: 'main' }))).toMatchObject({ ok: true, observed: head });
  });

  test('fails for an open PR, naming that', () => {
    const { s, head } = anchoredAt();
    pr('OPEN', 'main', head);
    expect(check(s.args({ link: 'merge', pr: 7, target: 'main' })).reason).toMatch(/open, not merged/);
  });

  test('fails for a closed-unmerged PR, naming that', () => {
    const { s, head } = anchoredAt();
    pr('CLOSED', 'main', head);
    expect(check(s.args({ link: 'merge', pr: 7, target: 'main' })).reason).toMatch(/closed without merging/);
  });

  test('fails for a wrong base, naming both', () => {
    const { s, head } = anchoredAt();
    pr('MERGED', 'develop', head);
    const r = check(s.args({ link: 'merge', pr: 7, target: 'main' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/develop/);
    expect(r.reason).toMatch(/main/);
  });

  test('fails when the merged head differs in shipped source, naming the file', () => {
    const { s } = anchoredAt();
    const other = s.commit('late change', { 'src/b.js': 'b2' });
    pr('MERGED', 'main', other);
    const r = check(s.args({ link: 'merge', pr: 7, target: 'main' }));
    expect(r.ok).toBe(false);
    expect(r.differing).toEqual(['src/b.js']);
  });

  test('fails when gh fails or the PR number is missing', () => {
    const { s } = anchoredAt();
    process.env.STUB_PR_FAIL = '1';
    expect(check(s.args({ link: 'merge', pr: 7, target: 'main' })).reason).toMatch(/gh pr view failed/);
    expect(check(s.args({ link: 'merge', target: 'main' })).reason).toMatch(/PR number/);
  });
});

describe('check: deploy link', () => {
  function anchoredAt() {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    return { s, head };
  }
  const deploy = (s, identityOutput) => check(s.args({ link: 'deploy', identityOutput }));

  test('fails with no output', () => {
    const { s } = anchoredAt();
    expect(deploy(s, '').reason).toMatch(/no output/);
    expect(deploy(s, undefined).ok).toBe(false);
  });

  test('fails with no token', () => {
    const { s } = anchoredAt();
    expect(deploy(s, 'version unknown').reason).toMatch(/no build token/);
  });

  test('fails with only an all-digit token', () => {
    const { s } = anchoredAt();
    expect(deploy(s, 'build 1234567').reason).toMatch(/all-digit/);
  });

  test('fails with a token that resolves to no commit', () => {
    const { s } = anchoredAt();
    const r = deploy(s, 'build deadbee');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/resolves to a commit/);
  });

  test('passes when a token (git describe form) resolves to a code-equal commit', () => {
    const { s, head } = anchoredAt();
    const r = deploy(s, `v1.2.3-4-g${head.slice(0, 9)}`);
    expect(r).toMatchObject({ ok: true, observed: head });
  });

  test('passes on a later test-only commit; fails on a shipped one, naming the file', () => {
    const { s } = anchoredAt();
    const t = s.commit('tests', { 'src/x.test.js': 't' });
    expect(deploy(s, `build ${t.slice(0, 8)}`).ok).toBe(true);
    const bad = s.commit('sneaky', { 'src/b.js': 'b2' });
    const r = deploy(s, `build ${bad.slice(0, 8)}`);
    expect(r.ok).toBe(false);
    expect(r.differing).toEqual(['src/b.js']);
  });

  test('skips an all-digit token and passes on the real one beside it', () => {
    const { s, head } = anchoredAt();
    expect(deploy(s, `1234567 ${head.slice(0, 8)}`).ok).toBe(true);
  });
});

describe('CLI', () => {
  const cli = (cwd, args) => {
    const r = spawnSync('node', [LIB, ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
    return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) };
  };

  test('reconcile then check prints one JSON line each and exits 0', () => {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    const rec = cli(s.repo, ['reconcile', '--state-dir', s.stateDir, '--trd', TRD]);
    expect(rec).toMatchObject({ status: 0, json: { action: 'set', anchor: head } });
    git(s.repo, 'push', '-u', 'origin', 'feature/x');
    const chk = cli(s.repo, ['check', '--state-dir', s.stateDir, '--link', 'push', '--branch', 'feature/x', '--trd', TRD]);
    expect(chk).toMatchObject({ status: 0, json: { ok: true, link: 'push' } });
    const sweep = cli(s.repo, ['reconcile', '--state-dir', s.stateDir, '--trd', 'none']);
    expect(sweep.json.action).toBe('none');
  });

  test('bad usage and a bad --reason report usage as refused, exit 0', () => {
    const s = setup();
    expect(cli(s.repo, ['nope']).json.reason).toMatch(/usage/);
    expect(cli(s.repo, ['reconcile', '--state-dir', s.stateDir, '--trd', TRD, '--reason', 'oops']).json.action).toBe('refused');
  });
});
