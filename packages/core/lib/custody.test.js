'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const custody = require('./custody');
const liveEvidence = require('./live-evidence');
const recordRef = require('./record-ref');

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

/**
 * Deploy-link token from a commit sha: the shortest prefix of at least `n` characters that
 * contains a letter a-f, because custody.js rejects an all-digit token as a build number.
 * Returns the full sha when it has no letter at all.
 */
function tokenOf(sha, n) {
  const i = sha.search(/[a-f]/);
  return i < 0 ? sha : sha.slice(0, Math.max(n, i + 1));
}

describe('tokenOf', () => {
  test('extends an all-digit prefix to the first letter', () => {
    expect(tokenOf('2012004412' + 'ab' + '0'.repeat(28), 8)).toBe('2012004412a');
  });
  test('keeps exactly n characters when the prefix already has a letter', () => {
    expect(tokenOf('1234567a' + '0'.repeat(32), 8)).toBe('1234567a');
    expect(tokenOf('a' + '0'.repeat(39), 8)).toHaveLength(8);
  });
  test('returns the full sha when it has no letter', () => {
    const sha = '1'.repeat(40);
    expect(tokenOf(sha, 8)).toBe(sha);
  });
});

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
    ['.claude/verification-notes.md', 'ignored'],
    ['.claude/other.md', 'shipped'],
    ['docs/TRD/other.md', 'docs'],
    ['docs/guides/x.md', 'docs'],
    ['doc/x.txt', 'docs'],
    ['README.md', 'docs'],
    ['pkg/CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    ['sub/readme.rst', 'docs'],
    ['README.tpl', 'shipped'],
    ['packages/core/commands/x.md', 'shipped'],
    ['notes.md', 'shipped'],
    ['package.json', 'shipped'],
    ['pyproject.toml', 'shipped'],
    ['package-lock.json', 'deps'],
    ['web/yarn.lock', 'deps'],
    ['pnpm-lock.yaml', 'deps'],
    ['Pipfile.lock', 'deps'],
    ['go.sum', 'deps'],
    ['Cargo.lock', 'deps'],
    ['mix.lock', 'deps'],
    ['app/packages.lock.json', 'deps'],
    ['.github/workflows/ci.yml', 'ci-config'],
    ['.github/actions/x/action.yml', 'ci-config'],
    ['.gitlab-ci.yml', 'ci-config'],
    ['azure-pipelines.yml', 'ci-config'],
    ['bitbucket-pipelines.yml', 'ci-config'],
    ['Jenkinsfile', 'ci-config'],
    ['.circleci/config.yml', 'ci-config'],
    ['.buildkite/pipeline.yml', 'ci-config'],
    ['.github/CODEOWNERS', 'shipped'],
    ['.github/workflows/x.test.js', 'test-only'],
    ['OWNER-CALLS.md', 'ignored'],
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

  describe('audit.anchorCommit (post-fix head)', () => {
    function history(anchorCommit) {
      const s = setup();
      const A = s.commit('audited', { 'src/a.js': 'a2' });
      s.commit('fix run', { 'src/b.js': 'b2' });
      const F = s.commit('fix run 2', { 'src/a.js': 'a3' });
      const closed = { audit: { auditedCommit: A } };
      if (anchorCommit !== undefined) closed.audit.anchorCommit = anchorCommit === 'F' ? F : anchorCommit;
      fs.writeFileSync(path.join(s.stateDir, 'closed.json'), JSON.stringify(closed));
      git(s.repo, 'add', '-A');
      git(s.repo, 'commit', '-m', 'close');
      return { s, A, F };
    }

    test('anchors at the post-fix head (audit-fixed); a second reconcile is none', () => {
      const { s, F } = history('F');
      expect(reconcile(s.args())).toMatchObject({ action: 'set', anchor: F });
      expect(s.readCustody().anchor).toEqual({ commit: F, source: 'audit-fixed' });
      expect(reconcile(s.args()).action).toBe('none');
    });

    test('a null anchorCommit falls back to the audited commit', () => {
      const { s, A } = history(null);
      const r = reconcile(s.args());
      // The anchor starts at A (then moves, as today), so read where it began from the first move.
      const c = s.readCustody();
      expect(c.anchor.source).toBe('audited');
      expect(c.moves.length).toBeGreaterThan(0);
      expect(c.moves[0].from).toBe(A);
      expect(['set', 'none']).not.toContain(r.action);
    });

    test('an anchorCommit that names no commit is refused, naming it', () => {
      const { s } = history('deadbee');
      const r = reconcile(s.args());
      expect(r.action).toBe('refused');
      expect(r.reason).toMatch(/audit anchor commit deadbee/);
      expect(fs.existsSync(path.join(s.stateDir, 'custody.json'))).toBe(false);
    });
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
    ['only to the root OWNER-CALLS.md log', { 'OWNER-CALLS.md': 'call' }],
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

    test('a manifest whose covered files did not change, but the changed file is claimed by no record: reverify (unclaimed-path guard)', () => {
      const s = withDefinition();
      expect(liveEvidence.record(s.stateDir, {
        task: 'T', artifact: path.join(s.stateDir, 'evidence', 'FS-1.txt'), covers: [path.join(s.repo, 'src/a.js')],
      })).toBe(true);
      s.commit('unrelated fix', { 'src/b.js': 'b2' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1'] });
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

// ---------------------------------------------------------------------------
// Change classes and ensemble.reproof (re-prove-only-what-a-change-can-affect)
// ---------------------------------------------------------------------------

describe('reconcile: change classes and ensemble.reproof', () => {
  const TRD2 = TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | yes |');
  const DEF2 = DEFINITION.replace(/\n$/, '\n| FS-2 | b | c | e | [read] | locator | | O2 |\n');

  /**
   * Anchored repo with A (FS-1) and B (FS-2), both met. `recA`/`recB` are the repo paths each criterion's
   * covers record names (null: no record). `extra` files and `reproof` settings go into the commit
   * before the anchor, so neither shows up as a difference afterwards.
   */
  const write = (s, rel, text) => s.write(rel, text);
  function twoCriteria({ recA = ['src/a.js'], recB = null, reproof, settingsRaw, lateSettings, extra = {} } = {}) {
    const s = setup();
    const files = { 'src/b.js': 'b2', [TRD]: TRD2, ...extra };
    if (reproof !== undefined) files['.claude/settings.json'] = JSON.stringify({ ensemble: { reproof } });
    if (settingsRaw !== undefined) files['.claude/settings.json'] = settingsRaw;
    s.commit('work', files);
    reconcile(s.args());
    fs.writeFileSync(path.join(s.stateDir, 'success-definition.md'), DEF2);
    fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({
      criteria: [{ id: 'FS-1', status: 'met', artifact: null }, { id: 'FS-2', status: 'met', artifact: null }],
    }));
    const map = new Map();
    if (recA) map.set('FS-1', { covers: recA, source: 'touches' });
    if (recB) map.set('FS-2', { covers: recB, source: 'touches' });
    liveEvidence.recordCriterionCovers(s.stateDir, map);
    // An invalid setting would stop the anchoring reconcile above, so a test of one writes it afterwards.
    if (lateSettings !== undefined) write(s, '.claude/settings.json', lateSettings);
    return s;
  }

  describe('defaults: docs, lockfile and CI config ask for no re-proof', () => {
    test.each([
      ['docs-only', { 'docs/guide.md': 'g' }, 'tier-none', /docs/],
      ['README-only', { 'README.md': 'r2' }, 'tier-none', /docs/],
      ['lockfile-only', { 'package-lock.json': '{}' }, 'tier-ci', /deps/],
      ['workflow-only', { '.github/workflows/ci.yml': 'on: push' }, 'tier-ci', /ci-config/],
    ])('%s since the anchor moves (rule %s), never reverify', (_n, files, rule, named) => {
      const s = twoCriteria();
      const before = s.readCustody().anchor.commit;
      const head = s.commit('change', files);
      const r = reconcile(s.args());
      expect(r).toMatchObject({ action: 'moved', anchor: head });
      expect(r.ids).toBeUndefined();
      expect(r.reason).toMatch(named);
      expect(s.readCustody().moves).toEqual([
        expect.objectContaining({ from: before, to: head, rule, reverified: [] }),
      ]);
    });

    test('docs plus a workflow is tier-ci, the reason naming both classes', () => {
      const s = twoCriteria();
      s.commit('change', { 'docs/g.md': 'g', '.github/workflows/ci.yml': 'x' });
      const r = reconcile(s.args());
      expect(r.action).toBe('moved');
      expect(r.reason).toMatch(/docs, ci-config/);
      expect(s.readCustody().moves[0].rule).toBe('tier-ci');
    });

    test('docs plus a test-only file moves (test-only paths join the partition)', () => {
      const s = twoCriteria();
      s.commit('change', { 'docs/g.md': 'g', 'src/a.test.js': 't' });
      expect(reconcile(s.args())).toMatchObject({ action: 'moved' });
    });

    test('a docs change beside a shipped one does not hide the shipped one', () => {
      const s = twoCriteria({ recB: ['src/b.js'] });
      s.commit('change', { 'docs/g.md': 'g', 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1'] });
    });

    test('with no success definition the old no-success-definition move still wins', () => {
      const s = setup();
      s.commit('work', { 'src/a.js': 'a2' });
      reconcile(s.args());
      s.commit('docs', { 'docs/g.md': 'g' });
      reconcile(s.args());
      expect(s.readCustody().moves[0].rule).toBe('no-success-definition');
    });
  });

  describe('a state written by the regression pass (one caught, one re-proven)', () => {
    // FS-1 was met at iteration 1, then the end-of-run pass caught it; FS-2 was re-proven by the pass.
    // The caught entry carries no artifact, so no live-evidence covers can speak for it.
    const regressionState = (s, fs1) => fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({
      criteria: [
        fs1,
        { id: 'FS-2', status: 'met', artifact: null, provenAt: 3, regression: 1 },
      ],
    }));
    const CAUGHT = { id: 'FS-1', status: 'not_met', artifact: null, regression: 1 };
    const reverifiedFile = (s, criteria) => {
      const p = path.join(s.root, 'reverify-state.json');
      fs.writeFileSync(p, JSON.stringify({ criteria }));
      return p;
    };

    test('the caught id is not proven: its old covers record is not used, a met id keeps its own', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      s.commit('fix', { 'src/b.js': 'b3' });
      // Control: while FS-1 stands met, its record (src/a.js) says the change cannot affect it.
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-2'], reused: ['FS-1'] });
      regressionState(s, CAUGHT);
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'], reused: [] });
    });

    test('FS-12: a re-proven entry\'s artifact covers decide its re-proof, not only its status', () => {
      // src/c.js must exist when recorded (live-evidence hashes it), so it joins the anchoring commit.
      const s = twoCriteria({ recA: ['src/a.js'], extra: { 'src/c.js': 'c1' } });
      fs.mkdirSync(path.join(s.stateDir, 'evidence'), { recursive: true });
      const artifact = path.join(s.stateDir, 'evidence', 'FS-2.txt');
      fs.writeFileSync(artifact, 'proof');
      liveEvidence.record(s.stateDir, { task: 'T', artifact, covers: [path.join(s.repo, 'src/c.js')] });
      fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({
        criteria: [
          { id: 'FS-1', status: 'met', artifact: null },
          { id: 'FS-2', status: 'met', artifact, provenAt: 3, regression: 1 },
        ],
      }));
      s.commit('fix', { 'src/c.js': 'c2' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-2'], reused: ['FS-1'] });
    });

    test('--reverified refuses while the caught id is still not met, naming it; a round-2 met moves', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      regressionState(s, CAUGHT);
      const before = s.readCustody().anchor.commit;
      const head = s.commit('fix', { 'src/b.js': 'b3' });

      const refused = reconcile(s.args({
        reverifiedPath: reverifiedFile(s, [
          { id: 'FS-1', status: 'not_met', regression: 1 },
          { id: 'FS-2', status: 'met', regression: 1 },
        ]),
      }));
      expect(refused.action).toBe('refused');
      expect(refused.reason).toMatch(/FS-1/);
      expect(s.readCustody().anchor.commit).toBe(before);

      const moved = reconcile(s.args({
        reverifiedPath: reverifiedFile(s, [
          { id: 'FS-1', status: 'met', provenAt: 3, regression: 2 },
          { id: 'FS-2', status: 'met', provenAt: 3, regression: 1 },
        ]),
      }));
      expect(moved).toMatchObject({ action: 'moved', anchor: head, ids: ['FS-1', 'FS-2'] });
    });
  });

  describe('a criterion proven off-host (met, with a run-URL artifact and proof) is custody\'s like any other met one (D15)', () => {
    const RUN_URL = 'https://github.com/o/r/actions/runs/123';
    // FS-1 settled by a CI job: artifact is a URL (matches no live-evidence manifest entry, so custody falls
    // back to the criterion-covers record) and `proof` is an extra key custody never reads.
    const ciProven = (s) => {
      const proof = {
        kind: 'off-host', workflow: '.github/workflows/ci.yml', job: 'read-aloud', runId: 123,
        url: RUN_URL, commit: s.readCustody().anchor.commit,
      };
      fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({
        criteria: [
          { id: 'FS-1', status: 'met', artifact: RUN_URL, proof },
          { id: 'FS-2', status: 'met', artifact: null },
        ],
      }));
      return proof;
    };
    const reverifiedFile = (s, criteria) => {
      const p = path.join(s.root, 'reverify-state.json');
      fs.writeFileSync(p, JSON.stringify({ criteria }));
      return p;
    };

    test('no covered file changed: the CI-proven id is reused, only the other is re-proved', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      ciProven(s);
      s.commit('fix', { 'src/b.js': 'b3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-2'], reused: ['FS-1'] });
    });

    test('a covered file changed: the CI-proven id is listed for re-proof, the other is reused', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      ciProven(s);
      s.commit('fix', { 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1'], reused: ['FS-2'] });
    });

    test('--reverified with the id met again (proof carried) moves the anchor', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      const proof = ciProven(s);
      const before = s.readCustody().anchor.commit;
      const head = s.commit('fix', { 'src/a.js': 'a3' });
      const moved = reconcile(s.args({
        reverifiedPath: reverifiedFile(s, [{ id: 'FS-1', status: 'met', artifact: RUN_URL, proof: { ...proof, commit: head } }]),
      }));
      expect(moved).toMatchObject({ action: 'moved', anchor: head, ids: ['FS-1'] });
      expect(s.readCustody().moves[0]).toMatchObject({ rule: 'reverified', reverified: ['FS-1'], from: before, to: head });
    });

    test('TR4 pin: a change to ci.yml alone moves the anchor (tier-ci) with the CI-proven id not re-proved', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      ciProven(s);
      const before = s.readCustody().anchor.commit;
      const head = s.commit('ci', { '.github/workflows/ci.yml': 'on: push\njobs: {}' });
      const r = reconcile(s.args());
      expect(r).toMatchObject({ action: 'moved', anchor: head });
      expect(r.ids).toBeUndefined();
      expect(r.reason).toMatch(/ci-config/);
      expect(s.readCustody().moves[0]).toMatchObject({ from: before, to: head, rule: 'tier-ci', reverified: [] });
    });
  });

  describe('shipped changes re-prove by covers', () => {
    test('a change to a file in A\'s record re-proves A only (B\'s record names another file)', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      s.commit('fix', { 'src/a.js': 'a3' });
      const r = reconcile(s.args());
      expect(r).toMatchObject({ action: 'reverify', ids: ['FS-1'], reused: ['FS-2'] });
    });

    test('a change to a file no record names re-proves A and B', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      s.commit('fix', { 'src/c.js': 'c' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('shipped: all re-proves B when only A\'s file changed', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'], reproof: { shipped: 'all' } });
      s.commit('fix', { 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('a no-record criterion is still re-proved by any shipped change (fallback unchanged)', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: null });
      s.commit('fix', { 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test.each([
      ['a directory with a slash', ['src/']],
      ['a directory without one', ['src']],
      ['a glob', ['src/*.js']],
      ['a brace list', ['src/{a,b}.js']],
    ])('a record naming %s covers a changed file under it', (_n, recB) => {
      const s = twoCriteria({ recA: ['src/a.js'], recB });
      s.commit('fix', { 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('a record left from a run where the criterion was met is not used once it is no longer met', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({
        criteria: [{ id: 'FS-1', status: 'met', artifact: null }, { id: 'FS-2', status: 'not_met', artifact: null }],
      }));
      s.commit('fix', { 'src/a.js': 'a3' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });
  });

  describe('promotion', () => {
    test('docs: reprove makes a docs-only change reverify every must-pass id', () => {
      const s = twoCriteria({ reproof: { docs: 'reprove' } });
      s.commit('docs', { 'docs/g.md': 'g' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('testOnly: reprove makes a test-only change reverify every must-pass id', () => {
      const s = twoCriteria({ reproof: { testOnly: 'reprove' } });
      s.commit('tests', { 'src/a.test.js': 't' });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('ciConfig: reprove and deps: reprove promote their classes', () => {
      const s = twoCriteria({ reproof: { ciConfig: 'reprove', deps: 'reprove' } });
      s.commit('ci', { '.github/workflows/ci.yml': 'x' });
      expect(reconcile(s.args()).action).toBe('reverify');
      const t = twoCriteria({ reproof: { ciConfig: 'reprove', deps: 'reprove' } });
      t.commit('lock', { 'yarn.lock': 'x' });
      expect(reconcile(t.args()).action).toBe('reverify');
    });

    test('tier ci and none are both accepted values', () => {
      const s = twoCriteria({ reproof: { docs: 'ci', deps: 'none' } });
      s.commit('docs and lock', { 'docs/g.md': 'g', 'package-lock.json': '{}' });
      const r = reconcile(s.args());
      expect(r.action).toBe('moved');
      expect(s.readCustody().moves[0].rule).toBe('tier-ci');
    });

    test('depsReprove: a listed package on a changed lockfile line reverifies; one not named does not', () => {
      // As in a real lockfile, a bump changes the version and resolved lines, not the key line.
      const lock = (pkgs) => JSON.stringify({ packages: Object.fromEntries(Object.entries(pkgs).map(([k, v]) => [k, { ...v, resolved: `https://registry.npmjs.org/${k.split('/')[1]}/-/${k.split('/')[1]}-${v.version}.tgz` }])) }, null, 1);
      const reproof = { depsReprove: ['left-pad'] };
      const hit = twoCriteria({ reproof, extra: { 'package-lock.json': lock({ 'node_modules/left-pad': { version: '1.0.0' } }) } });
      hit.commit('bump', { 'package-lock.json': lock({ 'node_modules/left-pad': { version: '1.3.0' } }) });
      expect(reconcile(hit.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });

      const miss = twoCriteria({ reproof, extra: { 'package-lock.json': lock({ 'node_modules/left-pad': { version: '1.0.0' }, 'node_modules/other': { version: '1.0.0' } }) } });
      miss.commit('bump', { 'package-lock.json': lock({ 'node_modules/left-pad': { version: '1.0.0' }, 'node_modules/other': { version: '2.0.0' } }) });
      expect(reconcile(miss.args())).toMatchObject({ action: 'moved' });
      expect(miss.readCustody().moves[0].rule).toBe('tier-ci');
    });

    test('depsReprove matches whole words only', () => {
      const s = twoCriteria({ reproof: { depsReprove: ['pad'] }, extra: { 'package-lock.json': '"left-pad": "1.0.0"\n' } });
      s.commit('bump', { 'package-lock.json': '"left-pad": "1.3.0"\n' });
      expect(reconcile(s.args()).action).toBe('moved');
    });

    test.each([
      ['Cargo.lock (name on the stanza line above)', 'Cargo.lock',
        (v) => `[[package]]\nname = "serde"\nversion = "${v}"\nchecksum = "c${v}"\n\n[[package]]\nname = "other"\nversion = "1.0.0"\n`],
      ['Pipfile.lock (name on the enclosing key)', 'Pipfile.lock',
        (v) => `{\n    "default": {\n        "serde": {\n            "hashes": [\n                "sha256:h${v}"\n            ],\n            "version": "==${v}"\n        }\n    }\n}\n`],
    ])('depsReprove: a bump in %s that changes only version lines still reverifies', (_n, file, lock) => {
      const s = twoCriteria({ reproof: { depsReprove: ['serde'] }, extra: { [file]: lock('1.0.0') } });
      s.commit('bump', { [file]: lock('1.0.1') });
      expect(reconcile(s.args())).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('depsReprove: a bump of another package in a Cargo.lock does not reverify', () => {
      const lock = (v) => `[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "other"\nversion = "${v}"\n`;
      const s = twoCriteria({ reproof: { depsReprove: ['serde'] }, extra: { 'Cargo.lock': lock('1.0.0') } });
      s.commit('bump', { 'Cargo.lock': lock('2.0.0') });
      expect(reconcile(s.args()).action).toBe('moved');
    });

    test('a test-only change at reprove is not waved through by the formatter shortcut', () => {
      const s = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'], reproof: { testOnly: 'reprove' } });
      s.commit('tests', { 'src/a.test.js': 't' });
      s.commit('prettier', { 'src/a.js': 'a2 ' });
      expect(reconcile(s.args({ reason: 'format' }))).toMatchObject({ action: 'reverify', ids: ['FS-1', 'FS-2'] });
    });

    test('format: reprove disables the formatter shortcut; the default honours it', () => {
      const ok = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'] });
      ok.commit('prettier', { 'src/a.js': 'a2 ' });
      expect(reconcile(ok.args({ reason: 'format' }))).toMatchObject({ action: 'moved', reason: 'moved: formatter commit' });

      const off = twoCriteria({ recA: ['src/a.js'], recB: ['src/b.js'], reproof: { format: 'reprove' } });
      off.commit('prettier', { 'src/a.js': 'a2 ' });
      expect(reconcile(off.args({ reason: 'format' }))).toMatchObject({ action: 'reverify', ids: ['FS-1'] });
    });
  });

  describe('reading the setting', () => {
    test.each([
      ['docs: "skip"', { docs: 'skip' }, /ensemble\.reproof\.docs must be one of none, ci, reprove \(got "skip"\)/],
      ['testOnly: 3', { testOnly: 3 }, /ensemble\.reproof\.testOnly/],
      ['deps: "x"', { deps: 'x' }, /ensemble\.reproof\.deps/],
      ['ciConfig: "x"', { ciConfig: 'x' }, /ensemble\.reproof\.ciConfig/],
      ['format: "ci"', { format: 'ci' }, /ensemble\.reproof\.format must be one of none, reprove/],
      ['shipped: "some"', { shipped: 'some' }, /ensemble\.reproof\.shipped must be one of covers, all/],
      ['depsReprove: "x"', { depsReprove: 'x' }, /ensemble\.reproof\.depsReprove/],
      ['depsReprove: [""]', { depsReprove: [''] }, /ensemble\.reproof\.depsReprove/],
      ['depsReprove: [1]', { depsReprove: [1] }, /ensemble\.reproof\.depsReprove/],
    ])('%s is refused naming the setting, and the anchor does not move', (_n, reproof, reason) => {
      const s = twoCriteria({ lateSettings: JSON.stringify({ ensemble: { reproof } }) });
      const before = s.readCustody().anchor.commit;
      s.commit('docs', { 'docs/g.md': 'g' });
      const r = reconcile(s.args());
      expect(r.action).toBe('refused');
      expect(r.reason).toMatch(reason);
      expect(s.readCustody().anchor.commit).toBe(before);
    });

    test('ensemble.reproof that is not an object is refused', () => {
      const s = twoCriteria({ lateSettings: JSON.stringify({ ensemble: { reproof: 'docs' } }) });
      s.commit('docs', { 'docs/g.md': 'g' });
      expect(reconcile(s.args())).toMatchObject({ action: 'refused', reason: expect.stringMatching(/ensemble\.reproof/) });
    });

    test('unparseable .claude/settings.json is refused naming ensemble.reproof', () => {
      const s = twoCriteria({ lateSettings: '{ nope' });
      s.commit('docs', { 'docs/g.md': 'g' });
      expect(reconcile(s.args())).toMatchObject({ action: 'refused', reason: expect.stringMatching(/ensemble\.reproof.*JSON/) });
    });

    test('an unknown key is ignored, and an absent file or key means defaults', () => {
      const s = twoCriteria({ reproof: { docs: 'none', somethingElse: 'x' } });
      s.commit('docs', { 'docs/g.md': 'g' });
      expect(reconcile(s.args()).action).toBe('moved');
    });

    test('--set-only succeeds with an invalid setting (it compares nothing)', () => {
      const s = setup();
      s.commit('work', { '.claude/settings.json': JSON.stringify({ ensemble: { reproof: { docs: 'skip' } } }) });
      expect(reconcile(s.args({ setOnly: true })).action).toBe('set');
    });

    test('check reads no setting: an invalid one does not stop a link check', () => {
      const s = twoCriteria({ lateSettings: JSON.stringify({ ensemble: { reproof: { docs: 'skip' } } }) });
      expect(check(s.args({ link: 'bogus' })).reason).toBe('unknown link bogus');
    });
  });
});

describe('check: unknown link (the push link is gone)', () => {
  test('--link push is unknown with or without an anchor', () => {
    const s = setup();
    expect(check(s.args({ link: 'push' }))).toMatchObject({ ok: false, reason: 'unknown link push' });
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    expect(check(s.args({ link: 'push' }))).toMatchObject({ ok: false, reason: 'unknown link push' });
  });
});

describe('detach: custody follows the run out of the tree', () => {
  const dirs = require('./ship-record-dir');
  const STARTED = '2026-11-08T10:00:00.000Z';
  const anchored = () => {
    const s = setup();
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    return s;
  };
  const external = (s, started = STARTED) => path.join(dirs.recordDir(s.stateDir), `${dirs.safeName(started)}.custody.json`);

  test('detach copies the anchor out; later moves land there, and check survives deleting .trd-state', () => {
    const s = anchored();
    const anchor = s.readCustody().anchor.commit;
    dirs.writePointer(s.stateDir, { startedAt: STARTED, work: { kind: 'feature', id: 'f', branch: 'feature/x' } });
    const r = custody.detach({ stateDir: s.stateDir, startedAt: STARTED });
    expect(r).toMatchObject({ ok: true, action: 'detached', path: external(s) });
    expect(JSON.parse(fs.readFileSync(external(s), 'utf8')).anchor.commit).toBe(anchor);
    expect(custody.detach({ stateDir: s.stateDir, startedAt: STARTED }).action).toBe('none');

    // a later reconcile move writes the external file, not the tracked one
    const moved = s.commit('more', { 'src/b.js': 'b2' });
    expect(reconcile(s.args({ trdPath: 'none' })).action).toBe('moved');
    expect(JSON.parse(fs.readFileSync(external(s), 'utf8')).anchor.commit).toBe(moved);
    expect(s.readCustody().anchor.commit).toBe(anchor);

    fs.rmSync(path.join(s.repo, '.trd-state'), { recursive: true, force: true });
    git(s.repo, 'checkout', '--', '.');
    expect(check(s.args({ link: 'nope' })).reason).toBe('unknown link nope');
    expect(custody.check({ stateDir: s.stateDir, link: 'deploy', identityOutput: moved, trdPath: TRD, cwd: s.repo }).reason)
      .not.toBe('no anchor');
  });

  test('no tracked anchor, no pointer or outside git: detach is a no-op / custodyPath stays tracked', () => {
    const s = setup();
    expect(custody.detach({ stateDir: s.stateDir, startedAt: STARTED })).toMatchObject({ ok: true, action: 'none' });
    expect(dirs.custodyPath(s.stateDir)).toBe(path.join(s.stateDir, 'custody.json'));
    const outside = path.join(tmp(), 'f');
    expect(dirs.custodyPath(outside)).toBe(path.join(outside, 'custody.json'));
    expect(custody.detach({ stateDir: s.stateDir, startedAt: '' }).ok).toBe(false);
  });

  test('two runs share a state-dir name: the tracked shipped.json names run B, so A\'s custody is ignored', () => {
    const s = anchored();
    const anchorB = s.readCustody().anchor.commit;
    dirs.writePointer(s.stateDir, { startedAt: STARTED });
    fs.writeFileSync(external(s), JSON.stringify({ version: 1, anchor: { commit: 'a'.repeat(40), source: 'pushed' }, moves: [] }));
    fs.writeFileSync(path.join(s.stateDir, 'shipped.json'), JSON.stringify({ startedAt: '2026-11-09T00:00:00.000Z' }));
    expect(dirs.custodyPath(s.stateDir)).toBe(path.join(s.stateDir, 'custody.json'));
    expect(reconcile(s.args()).anchor).toBe(anchorB);
    expect(check(s.args({ link: 'deploy', identityOutput: 'x' })).reason).not.toMatch(/aaaa/);
  });

  test('with the run\'s detached record present and no anchor yet, --set-only writes the external file', () => {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    dirs.writePointer(s.stateDir, { startedAt: STARTED });
    fs.writeFileSync(path.join(dirs.recordDir(s.stateDir), `${dirs.safeName(STARTED)}.json`), '{}');
    expect(reconcile(s.args({ setOnly: true }))).toMatchObject({ action: 'set', anchor: head });
    expect(JSON.parse(fs.readFileSync(external(s), 'utf8')).anchor.commit).toBe(head);
    expect(fs.existsSync(path.join(s.stateDir, 'custody.json'))).toBe(false);
  });

  test('the CLI detach verb prints one JSON line', () => {
    const s = anchored();
    const r = spawnSync('node', [LIB, 'detach', '--state-dir', s.stateDir, '--started-at', STARTED], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout.trim())).toMatchObject({ ok: true, action: 'detached' });
  });
});

describe('detach: a run held on the records ref', () => {
  const dirs = require('./ship-record-dir');
  const STARTED = '2026-11-08T10:00:00.000Z';
  const REF = 'refs/ensemble/records/f';
  const origPath = process.env.PATH;
  const savedId = process.env.FORGE_FEATURE_ID;
  beforeAll(() => {
    // Pin identity to the branch rule so an ambient FORGE_FEATURE_ID cannot change the match.
    delete process.env.FORGE_FEATURE_ID;
    const bin = path.join(tmp(), 'bin-held');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "$STUB_PR_JSON"\n', { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${origPath}`;
  });
  afterAll(() => {
    process.env.PATH = origPath;
    delete process.env.STUB_PR_JSON;
    if (savedId !== undefined) process.env.FORGE_FEATURE_ID = savedId;
  });

  /** Anchor A tracked, tracked shipped.json for run S, and a detached copy of it on the ref. */
  function held() {
    const s = setup();
    const anchorA = s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    const run = { startedAt: STARTED, updatedAt: STARTED, detached: true, work: { kind: 'feature', id: 'f', branch: 'feature/x', forge_feature_id: null } };
    fs.writeFileSync(path.join(s.stateDir, 'shipped.json'), JSON.stringify({ ...run, detached: false }));
    const w = recordRef.writeFiles({
      cwd: s.repo, slug: 'f', files: [{ rel: 'shipped.json', content: JSON.stringify(run) }],
      identity: { branch: 'feature/x', forge_feature_id: null }, command: 'ship-build', step: 'merge',
    });
    expect(w.ok).toBe(true);
    return { s, anchorA };
  }
  const onRef = (s, file) => JSON.parse(git(s.repo, 'show', `${REF}:${file}`));

  test('detach writes the tracked anchor to the ref, stamped with startedAt; no folder file appears', () => {
    const { s, anchorA } = held();
    const r = custody.detach({ stateDir: s.stateDir, startedAt: STARTED });
    expect(r).toMatchObject({ ok: true, action: 'detached', path: `${REF}:custody.json` });
    expect(onRef(s, 'custody.json')).toMatchObject({ startedAt: STARTED, anchor: { commit: anchorA } });
    expect(fs.existsSync(path.join(dirs.recordDir(s.stateDir)))).toBe(false);
    expect(custody.detach({ stateDir: s.stateDir, startedAt: STARTED })).toMatchObject({ ok: true, action: 'none', reason: 'already detached' });
  });

  test('detach with no tracked anchor is a no-op', () => {
    const { s } = held();
    fs.rmSync(path.join(s.stateDir, 'custody.json'));
    expect(custody.detach({ stateDir: s.stateDir, startedAt: STARTED })).toMatchObject({ ok: true, action: 'none', reason: 'no tracked anchor' });
  });

  test('merge and deploy links resolve the ref anchor while the tracked custody.json names another commit', () => {
    const { s, anchorA } = held();
    custody.detach({ stateDir: s.stateDir, startedAt: STARTED });
    const b = s.commit('more', { 'src/b.js': 'b2' }); // commit B: shipped code differs from A
    const tracked = s.readCustody();
    fs.writeFileSync(path.join(s.stateDir, 'custody.json'), JSON.stringify({ ...tracked, anchor: { ...tracked.anchor, commit: b } }));

    process.env.STUB_PR_JSON = JSON.stringify({ state: 'MERGED', baseRefName: 'main', headRefOid: anchorA });
    const m = check(s.args({ link: 'merge', pr: 1, base: 'main' }));
    expect(m).toMatchObject({ ok: true });
    const d = check(s.args({ link: 'deploy', identityOutput: `build ${tokenOf(anchorA, 8)}` }));
    expect(d).toMatchObject({ ok: true, observed: anchorA });
    // against B the same output would differ in shipped code, so the ref anchor is what was used
    expect(check(s.args({ link: 'deploy', identityOutput: `build ${tokenOf(b, 8)}` })).ok).toBe(false);
  });

  test('a reconcile move lands on the ref, not the tracked file', () => {
    const { s, anchorA } = held();
    custody.detach({ stateDir: s.stateDir, startedAt: STARTED });
    const moved = s.commit('docs only', { 'README.md': 'r2' });
    expect(reconcile(s.args({ trdPath: 'none' })).action).toBe('moved');
    const stored = onRef(s, 'custody.json');
    expect(stored).toMatchObject({ startedAt: STARTED, anchor: { commit: moved } });
    expect(s.readCustody().anchor.commit).toBe(anchorA);
  });
});

describe('check: pr-head link (stub gh)', () => {
  const origPath = process.env.PATH;
  beforeAll(() => {
    const bin = path.join(tmp(), 'bin-prhead');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "$STUB_PR_JSON"\n', { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${origPath}`;
  });
  afterAll(() => {
    process.env.PATH = origPath;
    delete process.env.STUB_PR_JSON;
  });
  const pr = (state, headRefOid) => {
    process.env.STUB_PR_JSON = JSON.stringify({ state, headRefOid });
  };
  const anchored = () => {
    const s = setup();
    s.commit('work', { 'src/a.js': 'a2' });
    reconcile(s.args());
    return s;
  };

  test('passes for an open PR whose head differs only under .trd-state/', () => {
    const s = anchored();
    const head = s.commit('record', { '.trd-state/x/note.md': 'parked' });
    pr('OPEN', head);
    expect(check(s.args({ link: 'pr-head', pr: 7 }))).toMatchObject({ ok: true, observed: head });
  });

  test('fails for a shipped-file difference, naming the file', () => {
    const s = anchored();
    pr('OPEN', s.commit('late', { 'src/b.js': 'b2' }));
    const r = check(s.args({ link: 'pr-head', pr: 7 }));
    expect(r.ok).toBe(false);
    expect(r.differing).toEqual(['src/b.js']);
  });

  test.each(['MERGED', 'CLOSED'])('fails for a %s PR', (state) => {
    const s = anchored();
    pr(state, s.commit('x', { '.trd-state/y': '1' }));
    expect(check(s.args({ link: 'pr-head', pr: 7 })).reason).toMatch(/not open/);
  });

  test('needs a PR number', () => {
    expect(check(anchored().args({ link: 'pr-head' })).reason).toMatch(/PR number/);
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

  test('fails on a docs-only difference from the anchor (tiers do not weaken the link)', () => {
    const { s } = anchoredAt();
    const head = s.commit('docs', { 'docs/g.md': 'g' });
    pr('MERGED', 'main', head);
    const r = check(s.args({ link: 'merge', pr: 7, target: 'main' }));
    expect(r.ok).toBe(false);
    expect(r.differing).toEqual(['docs/g.md']);
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
    const r = deploy(s, `v1.2.3-4-g${tokenOf(head, 9)}`);
    expect(r).toMatchObject({ ok: true, observed: head });
  });

  test('passes on a later test-only commit; fails on a shipped one, naming the file', () => {
    const { s } = anchoredAt();
    const t = s.commit('tests', { 'src/x.test.js': 't' });
    expect(deploy(s, `build ${tokenOf(t, 8)}`).ok).toBe(true);
    const bad = s.commit('sneaky', { 'src/b.js': 'b2' });
    const r = deploy(s, `build ${tokenOf(bad, 8)}`);
    expect(r.ok).toBe(false);
    expect(r.differing).toEqual(['src/b.js']);
  });

  test('skips an all-digit token and passes on the real one beside it', () => {
    const { s, head } = anchoredAt();
    expect(deploy(s, `1234567 ${tokenOf(head, 8)}`).ok).toBe(true);
  });
});

describe('reconcile: base, head and set-only', () => {
  const origPath = process.env.PATH;
  beforeAll(() => {
    const bin = path.join(tmp(), 'bin-base');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "$STUB_PR_JSON"\n', { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${origPath}`;
  });
  afterAll(() => {
    process.env.PATH = origPath;
    delete process.env.STUB_PR_JSON;
  });

  /** Another clone lands a commit on origin/main (the feature checkout never leaves its branch). */
  function landOnBase(s, files, msg = 'base change') {
    const other = path.join(tmp(), 'other');
    git(s.root, 'clone', '-q', '-b', 'main', path.join(s.root, 'origin.git'), other);
    git(other, 'config', 'user.email', 't@example.com');
    git(other, 'config', 'user.name', 't');
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(other, rel)), { recursive: true });
      fs.writeFileSync(path.join(other, rel), text);
    }
    git(other, 'add', '-A');
    git(other, 'commit', '-m', msg);
    git(other, 'push', 'origin', 'main');
    git(s.repo, 'fetch', 'origin');
  }
  /** Merges origin/main into the feature; `resolve` maps conflicted paths to their final text. */
  function mergeBase(s, resolve = {}) {
    const r = spawnSync('git', ['merge', '--no-ff', '-m', 'merge main', 'origin/main'], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
    if (r.status !== 0) {
      for (const [rel, text] of Object.entries(resolve)) fs.writeFileSync(path.join(s.repo, rel), text);
      git(s.repo, 'add', '-A');
      git(s.repo, 'commit', '-m', 'merge main (resolved)');
    }
    return git(s.repo, 'rev-parse', 'HEAD');
  }
  const anchored = () => {
    const s = setup();
    s.commit('work', { 'src/b.js': 'b2' });
    reconcile(s.args());
    return s;
  };
  const withDefinition = (s, covers) => {
    fs.writeFileSync(path.join(s.stateDir, 'success-definition.md'), DEFINITION);
    fs.mkdirSync(path.join(s.stateDir, 'evidence'), { recursive: true });
    const artifact = path.join(s.stateDir, 'evidence', 'FS-1.txt');
    fs.writeFileSync(artifact, 'proof');
    fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({ criteria: [{ id: 'FS-1', status: 'met', artifact }] }));
    if (covers) liveEvidence.record(s.stateDir, { task: 'T', artifact, covers: covers.map((c) => path.join(s.repo, c)) });
  };

  test('base files only: moves with base-merge, also after the base tip moves on; pr-head then passes', () => {
    const s = anchored();
    landOnBase(s, { 'src/c.js': 'c1' });
    const merged = mergeBase(s);
    landOnBase(s, { 'src/d.js': 'd1' }, 'later base change');
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r).toMatchObject({ action: 'moved', anchor: merged, differing: [], excused: ['src/c.js'] });
    expect(s.readCustody().moves[0]).toMatchObject({ rule: 'base-merge' });

    process.env.STUB_PR_JSON = JSON.stringify({ state: 'OPEN', headRefOid: merged });
    expect(check(s.args({ link: 'pr-head', pr: 7 })).ok).toBe(true);
    // An anchor at the head plus a .trd-state/-only commit still passes.
    process.env.STUB_PR_JSON = JSON.stringify({ state: 'OPEN', headRefOid: s.commit('record', { '.trd-state/x/n.md': 'n' }) });
    expect(check(s.args({ link: 'pr-head', pr: 7 })).ok).toBe(true);
  });

  test('without --base the same merge stays differing and re-fails as before', () => {
    const s = anchored();
    landOnBase(s, { 'src/c.js': 'c1' });
    mergeBase(s);
    expect(reconcile(s.args())).toMatchObject({ action: 'moved', differing: ['src/c.js'] });
    expect(s.readCustody().moves[0].rule).toBe('no-success-definition');
  });

  test('a feature edit after the anchor, beside the base merge, is still differing', () => {
    const s = anchored();
    s.commit('late feature edit', { 'src/b.js': 'b3' });
    landOnBase(s, { 'src/c.js': 'c1' });
    mergeBase(s);
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r.differing).toEqual(['src/b.js']);
    expect(r.excused).toEqual(['src/c.js']);
  });

  test('a head the base already contains (merged by hand) excuses nothing', () => {
    const s = anchored();
    s.commit('late feature edit', { 'src/b.js': 'b3' });
    git(s.repo, 'push', 'origin', 'HEAD:main');
    git(s.repo, 'fetch', 'origin');
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r.differing).toEqual(['src/b.js']);
    expect(r.excused).toEqual([]);
    expect(s.readCustody().moves[0].rule).toBe('no-success-definition');
  });

  test('a conflict-resolved file, and a resolution taking the base wholesale, stay differing', () => {
    const s = anchored();
    landOnBase(s, { 'src/b.js': 'b-base' });
    mergeBase(s, { 'src/b.js': 'b-merged' });
    expect(reconcile(s.args({ base: 'origin/main' }))).toMatchObject({ differing: ['src/b.js'], excused: [] });

    const w = anchored();
    landOnBase(w, { 'src/b.js': 'b-base' });
    mergeBase(w, { 'src/b.js': 'b-base' });
    const r = reconcile(w.args({ base: 'origin/main' }));
    expect(r.differing).toEqual(['src/b.js']);
    expect(r.excused).toEqual([]);
  });

  test('a base-only change to a covered file reverifies that id; untouched covers are reused', () => {
    const s = anchored();
    withDefinition(s, ['src/a.js']);
    landOnBase(s, { 'src/a.js': 'a-base' });
    mergeBase(s);
    const hit = reconcile(s.args({ base: 'origin/main' }));
    expect(hit).toMatchObject({ action: 'reverify', ids: ['FS-1'], reused: [], differing: [], excused: ['src/a.js'] });

    const t = anchored();
    withDefinition(t, ['src/b.js']);
    landOnBase(t, { 'src/a.js': 'a-base' });
    const merged = mergeBase(t);
    const miss = reconcile(t.args({ base: 'origin/main' }));
    expect(miss).toMatchObject({ action: 'moved', anchor: merged, reused: ['FS-1'] });
    expect(miss.ids).toBeUndefined();
    expect(t.readCustody().moves[0].rule).toBe('base-merge');
  });

  test('a base-only change keeps the proof of a no-covers must-pass criterion (moves as base-merge)', () => {
    const s = anchored();
    withDefinition(s, null);
    landOnBase(s, { 'src/c.js': 'c1' });
    const merged = mergeBase(s);
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r).toMatchObject({ action: 'moved', anchor: merged, reused: ['FS-1'], differing: [], excused: ['src/c.js'] });
    expect(r.ids).toBeUndefined();
    expect(s.readCustody().moves[0].rule).toBe('base-merge');
  });

  test('a base-only change still re-verifies a no-covers must-pass criterion that was never met', () => {
    const s = anchored();
    withDefinition(s, null);
    fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({ criteria: [{ id: 'FS-1', status: 'not_met', artifact: null }] }));
    landOnBase(s, { 'src/c.js': 'c1' });
    mergeBase(s);
    expect(reconcile(s.args({ base: 'origin/main' }))).toMatchObject({ action: 'reverify', ids: ['FS-1'], reused: [] });
  });

  test('a base-only change still re-verifies a must-pass objective no criterion names', () => {
    const s = anchored();
    withDefinition(s, null);
    fs.writeFileSync(path.join(s.repo, TRD), TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | yes |'));
    git(s.repo, 'add', '-A');
    git(s.repo, 'commit', '-m', 'trd');
    landOnBase(s, { 'src/c.js': 'c1' });
    mergeBase(s);
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r).toMatchObject({ action: 'reverify', ids: ['O2'], reused: ['FS-1'] });
  });

  test('a base-only change to a file in FS-1 covers but not FS-2 covers re-verifies only FS-1', () => {
    const s = anchored();
    fs.writeFileSync(path.join(s.repo, TRD), TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | yes |'));
    git(s.repo, 'add', '-A');
    git(s.repo, 'commit', '-m', 'trd');
    fs.writeFileSync(path.join(s.stateDir, 'success-definition.md'), DEFINITION.replace(/\n$/, '\n| FS-2 | b | c | e | [read] | locator | | O2 |\n'));
    fs.mkdirSync(path.join(s.stateDir, 'evidence'), { recursive: true });
    const criteria = [['FS-1', 'src/a.js'], ['FS-2', 'src/b.js']].map(([id, cover]) => {
      const artifact = path.join(s.stateDir, 'evidence', `${id}.txt`);
      fs.writeFileSync(artifact, 'proof');
      liveEvidence.record(s.stateDir, { task: 'T', artifact, covers: [path.join(s.repo, cover)] });
      return { id, status: 'met', artifact };
    });
    fs.writeFileSync(path.join(s.stateDir, 'verification-state.json'), JSON.stringify({ criteria }));
    landOnBase(s, { 'src/a.js': 'a-base' });
    mergeBase(s);
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r).toMatchObject({ action: 'reverify', ids: ['FS-1'], reused: ['FS-2'] });
  });

  test('a non-must-pass criterion recorded not_met (a non-blocking follow-up) never enters reverify ids', () => {
    const s = anchored();
    // O2 is not marked must-pass, so FS-2 (which names it) is outside the custody set.
    fs.writeFileSync(path.join(s.repo, TRD), TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | no |'));
    git(s.repo, 'add', '-A');
    git(s.repo, 'commit', '-m', 'trd');
    fs.writeFileSync(path.join(s.stateDir, 'success-definition.md'), DEFINITION.replace(/\n$/, '\n| FS-2 | b | c | e | [read] | locator | | O2 |\n'));
    fs.mkdirSync(path.join(s.stateDir, 'evidence'), { recursive: true });
    const proof = path.join(s.stateDir, 'evidence', 'FS-1.txt');
    fs.writeFileSync(proof, 'proof');
    liveEvidence.record(s.stateDir, { task: 'T', artifact: proof, covers: [path.join(s.repo, 'src/a.js')] });
    fs.writeFileSync(
      path.join(s.stateDir, 'verification-state.json'),
      JSON.stringify({ outcome: 'satisfied', criteria: [{ id: 'FS-1', status: 'met', artifact: proof }, { id: 'FS-2', status: 'not_met', artifact: null }] })
    );
    landOnBase(s, { 'src/a.js': 'a-base' });
    mergeBase(s);
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r).toMatchObject({ action: 'reverify', ids: ['FS-1'] });
    expect(r.ids).not.toContain('FS-2');
    expect(r.reused).not.toContain('FS-2');
  });

  test('a feature-side shipped change still re-verifies a no-covers criterion (OQ-2 unchanged)', () => {
    const s = anchored();
    withDefinition(s, null);
    s.commit('late feature edit', { 'src/b.js': 'b3' });
    landOnBase(s, { 'src/c.js': 'c1' });
    mergeBase(s);
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r).toMatchObject({ action: 'reverify', ids: ['FS-1'], differing: ['src/b.js'] });
  });

  test('a promoted lockfile that came in from the base (excused) still reverifies', () => {
    const s = setup();
    // The setting is committed before the anchor, so it is not itself a difference.
    s.commit('work', { 'src/b.js': 'b2', '.claude/settings.json': JSON.stringify({ ensemble: { reproof: { deps: 'reprove' } } }) });
    reconcile(s.args());
    withDefinition(s, null);
    landOnBase(s, { 'yarn.lock': 'x' });
    const merged = mergeBase(s);
    const before = s.readCustody().anchor.commit;
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r.excused).toContain('yarn.lock');
    expect(r).toMatchObject({ action: 'reverify', ids: ['FS-1'] });
    expect(s.readCustody().anchor.commit).toBe(before);
    expect(merged).not.toBe(before);
  });

  test('mergeBases reports the old and new merge bases as full shas, only when --base is given', () => {
    const s = anchored();
    const oldBase = git(s.repo, 'rev-parse', 'origin/main');
    landOnBase(s, { 'src/c.test.js': 'only a test' });
    mergeBase(s);
    const newBase = git(s.repo, 'rev-parse', 'origin/main');
    const r = reconcile(s.args({ base: 'origin/main' }));
    expect(r.mergeBases).toEqual({ old: oldBase, new: newBase });
    expect(r.mergeBases.old).toMatch(/^[0-9a-f]{40}$/);
    expect(reconcile(s.args()).mergeBases).toBeUndefined();
  });

  test('a base ref that names no commit is refused', () => {
    const s = anchored();
    expect(reconcile(s.args({ base: 'origin/nope' })).action).toBe('refused');
  });

  test('--head judges that commit, not local HEAD, and a .trd-state/-only local commit is accepted', () => {
    const s = anchored();
    const prHead = s.commit('pr head', { 'src/b.js': 'b3' });
    s.commit('local state', { '.trd-state/x/n.md': 'n' });
    const r = reconcile(s.args({ head: prHead }));
    expect(r).toMatchObject({ action: 'moved', anchor: prHead });
    expect(s.readCustody().anchor.commit).toBe(prHead);
  });

  test('--head is refused when local HEAD has a shipped change not on it', () => {
    const s = anchored();
    const before = s.readCustody().anchor.commit;
    const prHead = s.commit('pr head', { 'src/b.js': 'b3' });
    s.commit('unpushed', { 'src/a.js': 'a9' });
    const r = reconcile(s.args({ head: prHead }));
    expect(r.action).toBe('refused');
    expect(r.reason).toContain('local HEAD has shipped changes not on the PR head');
    expect(s.readCustody().anchor.commit).toBe(before);
  });

  test('--reason format does not move when an earlier unverified change precedes the formatter commit', () => {
    const s = anchored();
    s.commit('unverified change', { 'src/b.js': 'b3' });
    s.commit('prettier', { 'src/a.js': 'a1 ' });
    reconcile(s.args({ reason: 'format' }));
    // Pin the rule that did apply: a bare .not.toBe('format') would also pass for any other (wrong) rule.
    expect(s.readCustody().moves.map((m) => m.rule)).toEqual(['no-success-definition']);
  });

  test('--set-only sets an absent anchor and never moves an existing one', () => {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    expect(reconcile(s.args({ setOnly: true }))).toMatchObject({ action: 'set', anchor: head });
    s.commit('more', { 'src/b.js': 'b2' });
    const again = reconcile(s.args({ setOnly: true }));
    expect(again).toMatchObject({ action: 'none', anchor: head, reason: 'anchor already set' });
    expect(s.readCustody().anchor.commit).toBe(head);
    expect(s.readCustody().moves).toEqual([]);
  });

  test('the CLI passes --base, --head and --set-only through', () => {
    const s = setup();
    const head = s.commit('work', { 'src/a.js': 'a2' });
    const r = spawnSync('node', [LIB, 'reconcile', '--state-dir', s.stateDir, '--trd', TRD, '--set-only', '--head', head], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
    expect(JSON.parse(r.stdout.trim())).toMatchObject({ action: 'set', anchor: head });
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
    const chk = cli(s.repo, ['check', '--state-dir', s.stateDir, '--link', 'push', '--trd', TRD]);
    expect(chk).toMatchObject({ status: 0, json: { ok: false, reason: 'unknown link push' } });
    const sweep = cli(s.repo, ['reconcile', '--state-dir', s.stateDir, '--trd', 'none']);
    expect(sweep.json.action).toBe('none');
  });

  test('bad usage and a bad --reason report usage as refused, exit 0', () => {
    const s = setup();
    expect(cli(s.repo, ['nope']).json.reason).toMatch(/usage/);
    expect(cli(s.repo, ['reconcile', '--state-dir', s.stateDir, '--trd', TRD, '--reason', 'oops']).json.action).toBe('refused');
  });
});

describe('reconcile and check: fall back to the records ref', () => {
  const origPath = process.env.PATH;
  beforeAll(() => {
    const bin = path.join(tmp(), 'bin-ref');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "$STUB_PR_JSON"\n', { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${origPath}`;
  });
  afterAll(() => {
    process.env.PATH = origPath;
    delete process.env.STUB_PR_JSON;
  });

  /** Writes closed.json + custody.json to the ref, then deletes the folder's files. */
  function refOnly() {
    const s = setup();
    const anchor = s.commit('audited', { 'src/a.js': 'a2' });
    fs.writeFileSync(path.join(s.stateDir, 'closed.json'), JSON.stringify({ audit: { anchorCommit: anchor } }));
    fs.writeFileSync(
      path.join(s.stateDir, 'custody.json'),
      JSON.stringify({ version: 1, anchor: { commit: anchor, source: 'audited' }, moves: [] }),
    );
    const w = recordRef.write({ stateDir: s.stateDir, command: 'c', step: 's', cwd: s.repo });
    expect(w.ok).toBe(true);
    fs.rmSync(s.stateDir, { recursive: true, force: true });
    return { s, anchor };
  }

  test('reconcile --set-only restores the ref and keeps its anchor', () => {
    const { s, anchor } = refOnly();
    const r = reconcile(s.args({ setOnly: true }));
    expect(r).toMatchObject({ action: 'none', anchor });
    expect(fs.existsSync(path.join(s.stateDir, 'closed.json'))).toBe(true);
  });

  test('check --link pr-head resolves the ref anchor', () => {
    const { s, anchor } = refOnly();
    process.env.STUB_PR_JSON = JSON.stringify({ state: 'OPEN', headRefOid: anchor });
    const r = check({ stateDir: s.stateDir, link: 'pr-head', pr: 1, trdPath: TRD, cwd: s.repo });
    expect(r.ok).toBe(true);
    expect(r.observed).toBe(anchor);
  });

  test('a ref owned by a different feature is no record: reconcile sets a fresh anchor, check finds none', () => {
    // Identity is the Forge feature id when both sides have one, else the branch. Pin it to the
    // branch rule so an ambient FORGE_FEATURE_ID cannot make the two sessions "the same feature".
    const savedId = process.env.FORGE_FEATURE_ID;
    delete process.env.FORGE_FEATURE_ID;
    try {
      const { s, anchor } = refOnly();
      git(s.repo, 'checkout', '-q', '-b', 'other-feature');
      expect(git(s.repo, 'rev-parse', 'HEAD')).toBe(anchor); // same commit, so only the identity check can differ
      const r = reconcile(s.args({ setOnly: true }));
      expect(r.action).toBe('set');
      expect(fs.existsSync(path.join(s.stateDir, 'closed.json'))).toBe(false); // the ref's closed.json was not restored
      fs.rmSync(s.stateDir, { recursive: true, force: true });
      expect(check({ stateDir: s.stateDir, link: 'pr-head', pr: 1, trdPath: TRD, cwd: s.repo }))
        .toMatchObject({ ok: false, reason: 'no anchor' });
      expect(fs.existsSync(s.stateDir)).toBe(false);
    } finally {
      if (savedId !== undefined) process.env.FORGE_FEATURE_ID = savedId;
    }
  });

  test('neither folder nor ref: behaves as the no-closed.json case', () => {
    const s = setup();
    const head = git(s.repo, 'rev-parse', 'HEAD');
    fs.rmSync(s.stateDir, { recursive: true, force: true });
    expect(reconcile(s.args())).toMatchObject({ action: 'set', anchor: head });
    expect(check({ stateDir: path.join(s.repo, '.trd-state', 'gone'), link: 'pr-head', pr: 1, trdPath: TRD, cwd: s.repo }))
      .toMatchObject({ ok: false, reason: 'no anchor' });
  });
});
