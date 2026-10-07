'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  assemble,
  readThresholds,
  classify,
  structureClass,
  extractPathTokens,
  detectMap,
  buildBatches,
  parseDocStatus,
  AssembleError,
  BATCH_CAP,
  MARKER_PATH,
} = require('./docs-audit-assemble');

const MODULE = path.join(__dirname, 'docs-audit-assemble.js');
const TRD_BODY = (extra = '') => `# TRD: Thing

**Status**: Draft

## Master Task List

| ID | Task | Depends |
|----|------|---------|
| T-1 | Build the lib | none |
| T-2 | Write the tests | T-1 |

## Execution Plan

### Session 1
- **Tasks:** T-1
- **Agent:** @backend-implementer

### Session 2
- **Tasks:** T-2
- **Agent:** @verify-app

## Task Grounding

### T-1
- **Touches:** \`src/thing.js\` (new)

### T-2
- **Touches:** \`src/thing.test.js\` (new)
${extra}`;
const PRD_BODY = '# PRD\n\n## Feature Requirements\n\n- F1 does a thing\n';

let n = 0;
const tmpRepos = [];

function sh(repo, args, env = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z', ...env },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function mkRepo() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `dabs-${++n}-`)));
  tmpRepos.push(repo);
  sh(repo, ['init', '-q', '-b', 'main']);
  return repo;
}
function put(repo, rel, content) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
function commit(repo, msg, rels) {
  sh(repo, ['add', '-A', '--', ...rels]);
  sh(repo, ['commit', '-q', '-m', msg]);
  return sh(repo, ['rev-parse', 'HEAD']);
}
function commitFiles(repo, msg, files) {
  for (const [rel, content] of Object.entries(files)) put(repo, rel, content);
  return commit(repo, msg, Object.keys(files));
}
const run = (repo, opts = {}) => assemble({ repo, runDate: '2026-10-04', ...opts });
const entry = (a, p) => a.files.find((f) => f.path === p);

afterAll(() => { for (const r of tmpRepos) fs.rmSync(r, { recursive: true, force: true }); });

describe('classification (D3)', () => {
  test('structureClass reads headings, ignoring fenced lines', () => {
    expect(structureClass(TRD_BODY())).toBe('trd');
    expect(structureClass(PRD_BODY)).toBe('prd');
    expect(structureClass('# Notes\n\n```\n## Master Task List\n```\n')).toBe('none');
    expect(structureClass('## Acceptance Criteria\n## Master Task List\n')).toBe('trd');
  });

  test('a non-PRD file in docs/PRD/ is classed loose and reported as a disagreement', () => {
    const c = classify('docs/PRD/brief.md', '# A brief\n\nJust prose.\n');
    expect(c).toMatchObject({ class: 'loose', folderClass: 'prd', disagreement: true });
  });

  test('agreement keeps the folder class; other folders are loose without disagreement', () => {
    expect(classify('docs/PRD/x.md', PRD_BODY).class).toBe('prd');
    expect(classify('docs/TRD/x.md', TRD_BODY()).class).toBe('trd');
    expect(classify('docs/TRD/x.md', PRD_BODY)).toMatchObject({ class: 'loose', disagreement: true });
    expect(classify('docs/guides/x.md', TRD_BODY())).toMatchObject({ class: 'loose', disagreement: false });
  });

  test('the two generated indexes are loose, generated and never a disagreement', () => {
    expect(classify('docs/PRD/INDEX.md', '# Index\n')).toMatchObject({ class: 'loose', generated: true, disagreement: false });
    expect(classify('docs/TRD/INDEX.md', null)).toMatchObject({ generated: true });
  });

  test('a binary file in docs/PRD/ is loose with text:false', () => {
    const repo = mkRepo();
    commitFiles(repo, 'seed', { 'docs/PRD/a.md': PRD_BODY, 'README.md': 'x' });
    fs.writeFileSync(path.join(repo, 'docs/PRD/pic.png'), Buffer.from([0x89, 0x50, 0, 1, 2]));
    commit(repo, 'pic', ['docs/PRD/pic.png']);
    const a = run(repo);
    expect(entry(a, 'docs/PRD/pic.png')).toMatchObject({ class: 'loose', text: false, disagreement: true });
    expect(entry(a, 'docs/PRD/a.md')).toMatchObject({ class: 'prd', text: true });
  });
});

describe('inventory and git state (AC-F1.1, AC-F1.4)', () => {
  test('tracked, untracked and ignored files are all inventoried and marked; only tracked are batched', () => {
    const repo = mkRepo();
    commitFiles(repo, 'seed', { 'docs/PRD/a.md': PRD_BODY, '.gitignore': 'docs/secret/\n' });
    put(repo, 'docs/PRD/untracked.md', PRD_BODY);
    put(repo, 'docs/secret/hidden.md', '# hidden\n');
    const a = run(repo);
    expect(entry(a, 'docs/PRD/a.md').git).toBe('tracked');
    expect(entry(a, 'docs/PRD/untracked.md').git).toBe('untracked');
    expect(entry(a, 'docs/secret/hidden.md').git).toBe('ignored');
    expect(a.batches.flatMap((b) => b.docs)).toEqual(['docs/PRD/a.md']);
  });

  test('a tracked file deleted from the working tree is not inventoried', () => {
    const repo = mkRepo();
    commitFiles(repo, 'seed', { 'docs/PRD/a.md': PRD_BODY, 'docs/PRD/b.md': PRD_BODY });
    fs.rmSync(path.join(repo, 'docs/PRD/b.md'));
    expect(run(repo).files.map((f) => f.path)).toEqual(['docs/PRD/a.md']);
  });
});

describe('marker, mode and window (D4, D6)', () => {
  function seeded() {
    const repo = mkRepo();
    const c1 = commitFiles(repo, 'one', { 'docs/PRD/a.md': PRD_BODY, 'src/a.js': '1' });
    return { repo, c1 };
  }

  test('no marker -> comprehensive with reason no-marker, no window', () => {
    const { repo } = seeded();
    const a = run(repo);
    expect(a).toMatchObject({ mode: 'comprehensive', modeReason: 'no-marker', window: null });
    expect(a.marker).toEqual({ sha: null, status: 'absent' });
  });

  test('a marker that is not an ancestor of HEAD -> comprehensive, marker-not-ancestor', () => {
    const { repo } = seeded();
    sh(repo, ['checkout', '-q', '-b', 'other']);
    const stray = commitFiles(repo, 'stray', { 'src/stray.js': 's' });
    sh(repo, ['checkout', '-q', 'main']);
    commitFiles(repo, 'main two', { 'src/b.js': '2' });
    put(repo, MARKER_PATH, JSON.stringify({ sha: stray }));
    const a = run(repo);
    expect(a).toMatchObject({ mode: 'comprehensive', modeReason: 'marker-not-ancestor' });
    expect(a.marker.status).toBe('not-ancestor');
  });

  test('a marker naming an unknown commit is not-ancestor; a malformed marker is absent', () => {
    const { repo } = seeded();
    put(repo, MARKER_PATH, JSON.stringify({ sha: 'deadbeefdeadbeefdeadbeef' }));
    expect(run(repo).modeReason).toBe('marker-not-ancestor');
    put(repo, MARKER_PATH, '{not json');
    expect(run(repo).modeReason).toBe('no-marker');
  });

  test('a valid marker -> light run whose window is exactly the commits after it', () => {
    const { repo, c1 } = seeded();
    const c2 = commitFiles(repo, 'two', { 'src/b.js': '2', 'docs/PRD/a.md': PRD_BODY + '\nmore\n' });
    const c3 = commitFiles(repo, 'three', { 'src/c.js': '3' });
    put(repo, MARKER_PATH, JSON.stringify({ sha: c1 }));
    const a = run(repo);
    expect(a).toMatchObject({ mode: 'light', modeReason: 'light' });
    expect(a.window.from).toBe(c1);
    expect(a.window.commits.map((c) => c.sha)).toEqual([c3, c2]);
    expect(a.window.commits[1]).toMatchObject({ subject: 'two', paths: ['docs/PRD/a.md', 'src/b.js'] });
  });

  test('--comprehensive overrides a valid marker (reason flag) and gives per-doc windows', () => {
    const { repo, c1 } = seeded();
    const c2 = commitFiles(repo, 'two', { 'src/b.js': '2' });
    put(repo, MARKER_PATH, JSON.stringify({ sha: c1 }));
    const a = run(repo, { comprehensive: true });
    expect(a).toMatchObject({ mode: 'comprehensive', modeReason: 'flag', window: null });
    const w = entry(a, 'docs/PRD/a.md').docWindow;
    expect(w.from).toBe(c1);
    expect(w.commits.map((c) => c.sha)).toEqual([c2]);
  });

  test('a light run whose window is empty reviews nothing', () => {
    const { repo } = seeded();
    const head = sh(repo, ['rev-parse', 'HEAD']);
    put(repo, MARKER_PATH, JSON.stringify({ sha: head }));
    const a = run(repo);
    expect(a.mode).toBe('light');
    expect(a.window.commits).toEqual([]);
    expect(a.batches).toEqual([]);
    expect(a.workflowArgs).toEqual([]);
  });

  test('a light run excludes loose docs from batches; a comprehensive run includes them', () => {
    const { repo, c1 } = seeded();
    commitFiles(repo, 'two', { 'docs/guide.md': '# g\n', 'docs/ops/run.md': '# r\n' });
    put(repo, MARKER_PATH, JSON.stringify({ sha: c1 }));
    expect(run(repo).batches.map((b) => b.key)).toEqual(['prd']);
    expect(run(repo, { comprehensive: true }).batches.map((b) => b.key)).toEqual(['prd', 'loose:.', 'loose:ops']);
  });
});

describe('missing-path history (D11, AC-F7.7)', () => {
  test('a path that once existed is "removed" with its last commit; one that never did is "never"', () => {
    const repo = mkRepo();
    commitFiles(repo, 'a', { 'src/old.js': 'x', 'src/keep.js': 'k' });
    fs.rmSync(path.join(repo, 'src/old.js'));
    const removedIn = commit(repo, 'rm old', ['src/old.js']);
    commitFiles(repo, 'doc', {
      'docs/guide.md': '# G\n\nSee `src/old.js`, `src/keep.js` and `other-repo/svc/handler.ts`.\n',
    });
    const a = run(repo);
    expect(entry(a, 'docs/guide.md').missingPaths).toEqual([
      { path: 'other-repo/svc/handler.ts', history: 'never', lastCommit: null },
      { path: 'src/old.js', history: 'removed', lastCommit: removedIn },
    ]);
  });

  test('directories and doc-relative links resolve; URLs and paths above the repo are ignored', () => {
    const repo = mkRepo();
    commitFiles(repo, 'a', { 'src/x.js': '1', 'docs/sub/other.md': '# o\n' });
    commitFiles(repo, 'doc', {
      'docs/sub/guide.md': 'See [o](./other.md), `src/`, https://example.com/a/b.html and ../../../../etc/passwd.\n',
    });
    expect(entry(run(repo), 'docs/sub/guide.md').missingPaths).toEqual([]);
  });

  test('extractPathTokens finds slash paths with extensions or trailing slash only, de-duplicated', () => {
    expect(extractPathTokens('use `a/b.js`, a/b.js, and/or `c/d/` or e.g. x.js; plus f/g.')).toEqual(['a/b.js', 'c/d/']);
  });
});

describe('code map and doc status', () => {
  test('detectMap reads the backticked lead of each bullet', () => {
    const text = '# D\n\n## Where this lives in the code\n\n- `packages/core/lib/` the libs\n- `foo` bar\n- plain\n\n## Next\n- `ignored`\n';
    expect(detectMap(text)).toEqual({ present: true, dirs: ['foo', 'packages/core/lib/'] });
    expect(detectMap('# nothing\n')).toEqual({ present: false, dirs: [] });
  });

  test('parseDocStatus reads the header Status line', () => {
    expect(parseDocStatus('# T\n\n**Status**: In Progress\n')).toBe('In Progress');
    expect(parseDocStatus('# T\nno status here\n')).toBeNull();
  });
});

describe('thresholds (D5)', () => {
  function withSettings(thresholds) {
    const repo = mkRepo();
    commitFiles(repo, 'seed', { 'docs/PRD/a.md': PRD_BODY });
    if (thresholds !== undefined) {
      put(repo, '.claude/settings.json', JSON.stringify({ ensemble: { docsAudit: { thresholds } } }));
    }
    return repo;
  }

  test('absent settings -> 70/40', () => {
    expect(readThresholds(withSettings())).toEqual({ high: 70, medium: 40 });
    expect(run(withSettings()).thresholds).toEqual({ high: 70, medium: 40 });
  });

  test('a partial override keeps the other default', () => {
    expect(readThresholds(withSettings({ high: 90 }))).toEqual({ high: 90, medium: 40 });
  });

  test.each([
    [{ high: 30, medium: 60 }, /medium \(60\) must not exceed .*high \(30\)/],
    [{ medium: 80 }, /medium \(80\)/],
    [{ high: 101 }, /thresholds\.high/],
    [{ medium: -1 }, /thresholds\.medium/],
    [{ high: 7.5 }, /thresholds\.high/],
    [{ high: '70' }, /thresholds\.high/],
  ])('invalid %j is an AssembleError naming the setting', (t, re) => {
    const repo = withSettings(t);
    expect(() => readThresholds(repo)).toThrow(AssembleError);
    expect(() => readThresholds(repo)).toThrow(re);
  });

  test('malformed settings.json is refused, not defaulted', () => {
    const repo = withSettings();
    put(repo, '.claude/settings.json', '{nope');
    expect(() => readThresholds(repo)).toThrow(/not valid JSON/);
  });
});

describe('batching (D16)', () => {
  test('splits at 200 docs per batch with 1-based chunk numbers', () => {
    expect(BATCH_CAP).toBe(200);
    const files = Array.from({ length: 450 }, (_, i) => ({ path: `docs/PRD/p${String(i).padStart(3, '0')}.md`, class: 'prd' }));
    const b = buildBatches(files);
    expect(b.map((x) => [x.key, x.chunk, x.docs.length])).toEqual([['prd', 1, 200], ['prd', 2, 200], ['prd', 3, 50]]);
  });

  test('orders prd, trd, then loose folders; docs/ root is its own batch', () => {
    const files = [
      { path: 'docs/zeta/a.md', class: 'loose' }, { path: 'docs/TRD/t.md', class: 'trd' },
      { path: 'docs/a.md', class: 'loose' }, { path: 'docs/PRD/p.md', class: 'prd' },
      { path: 'docs/alpha/b.md', class: 'loose' },
    ];
    expect(buildBatches(files).map((x) => x.key)).toEqual(['prd', 'trd', 'loose:.', 'loose:alpha', 'loose:zeta']);
  });

  test('workflowArgs mirror batches in the 3.2 shape', () => {
    const repo = mkRepo();
    commitFiles(repo, 'seed', { 'docs/PRD/a.md': PRD_BODY, 'docs/note.md': '# n\n' });
    const a = assemble({ repo, runDate: '2026-10-04', assemblyPath: path.join(repo, 'w', 'assembly.json') });
    expect(a.workflowArgs).toHaveLength(a.batches.length);
    expect(a.workflowArgs[0]).toEqual({
      runId: a.runId, mode: 'comprehensive', repo, assemblyPath: path.join(repo, 'w', 'assembly.json'),
      contractPath: '.claude/contracts/docs-audit.md', thresholds: { high: 70, medium: 40 },
      batch: { key: 'prd', chunk: 1, docs: [{ path: 'docs/PRD/a.md', class: 'prd', text: true }] },
    });
    expect(a.runId).toBe(`2026-10-04-${a.head.slice(0, 7)}`);
  });
});

describe('TRD parse and D19 skip tests', () => {
  const TRD = 'docs/TRD/thing.md';
  const implState = (feature, tasks, trdFile = TRD) => ({
    [`.trd-state/${feature}/implement.json`]: JSON.stringify({ trd_file: trdFile, tasks }),
  });

  function trdRepo() {
    const repo = mkRepo();
    commitFiles(repo, 'trd written', { [TRD]: TRD_BODY(), 'README.md': 'r' });
    return repo;
  }

  test('parse output carries doc Status, per-task agent, development flag and Touches', () => {
    const a = run(trdRepo());
    const t = entry(a, TRD).trd;
    expect(t.status).toBe('Draft');
    expect(t.tasks).toEqual([
      { id: 'T-1', status: null, agent: 'backend-implementer', development: true, touches: ['src/thing.js'] },
      { id: 'T-2', status: null, agent: 'verify-app', development: false, touches: ['src/thing.test.js'] },
    ]);
  });

  test('implement.json statuses are joined onto the tasks', () => {
    const repo = trdRepo();
    commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'success' }, 'T-2': { status: 'pending' } }));
    expect(entry(run(repo), TRD).trd.tasks.map((t) => t.status)).toEqual(['success', 'pending']);
  });

  test('no task success anywhere and no Touches file changed after the TRD -> skipped no-implementation', () => {
    const repo = trdRepo();
    commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'pending' }, 'T-2': { status: 'pending' } }));
    const a = run(repo);
    expect(entry(a, TRD).skip).toBe('no-implementation');
    expect(a.skipped).toEqual([{ path: TRD, reason: 'no-implementation' }]);
    expect(a.batches.flatMap((b) => b.docs)).not.toContain(TRD);
  });

  test('with no implement.json at all and untouched Touches files -> skipped no-implementation', () => {
    expect(entry(run(trdRepo()), TRD).skip).toBe('no-implementation');
  });

  test('unclosed implement.json with an open development task -> skipped in-flight', () => {
    const repo = trdRepo();
    commitFiles(repo, 'work', { 'src/thing.js': 'built' });
    commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'pending' }, 'T-2': { status: 'success' } }));
    expect(entry(run(repo), TRD).skip).toBe('in-flight');
  });

  test('a closed.json beside the implement.json makes the same TRD reviewed', () => {
    const repo = trdRepo();
    commitFiles(repo, 'state', {
      ...implState('thing', { 'T-1': { status: 'pending' }, 'T-2': { status: 'success' } }),
      '.trd-state/thing/closed.json': '{}',
    });
    expect(entry(run(repo), TRD).skip).toBeNull();
  });

  test('development tasks all success with only a test task open -> reviewed', () => {
    const repo = trdRepo();
    commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'success' }, 'T-2': { status: 'pending' } }));
    expect(entry(run(repo), TRD).skip).toBeNull();
  });

  test('no implement.json but a Touches file changed after the TRD was written -> reviewed', () => {
    const repo = trdRepo();
    commitFiles(repo, 'built by hand', { 'src/thing.js': 'done' });
    expect(entry(run(repo), TRD).skip).toBeNull();
  });

  test('TRD and a Touches file added in the same (squash) commit, no implement.json -> reviewed', () => {
    const repo = mkRepo();
    commitFiles(repo, 'base', { 'README.md': 'r' });
    commitFiles(repo, 'squash: feature', { [TRD]: TRD_BODY(), 'src/thing.js': 'built' });
    expect(entry(run(repo), TRD).skip).toBeNull();
  });

  test('the same squash commit as the ROOT commit is also reviewed', () => {
    const repo = mkRepo();
    commitFiles(repo, 'squash: feature', { [TRD]: TRD_BODY(), 'src/thing.js': 'built' });
    expect(entry(run(repo), TRD).skip).toBeNull();
  });

  test('a TRD moved to another folder after its code was built is reviewed, not skipped', () => {
    const repo = trdRepo();
    commitFiles(repo, 'built', { 'src/thing.js': 'built' });
    fs.mkdirSync(path.join(repo, 'docs/TRD/completed'), { recursive: true });
    sh(repo, ['mv', TRD, 'docs/TRD/completed/thing.md']);
    sh(repo, ['commit', '-q', '-m', 'archive the TRD']);
    expect(entry(run(repo), 'docs/TRD/completed/thing.md').skip).toBeNull();
  });

  describe('history-aware skip test', () => {
    const withTouches = (list) =>
      TRD_BODY().replace('- **Touches:** `src/thing.js` (new)', `- **Touches:** ${list.map((p) => `\`${p}\``).join(', ')}`);
    const moveTrd = (repo, to) => {
      fs.mkdirSync(path.join(repo, path.dirname(to)), { recursive: true });
      sh(repo, ['mv', TRD, to]);
      sh(repo, ['commit', '-q', '-m', 'archive the TRD']);
    };

    test('implement.json naming the TRD\'s OLD path still counts after the TRD moves', () => {
      const repo = trdRepo();
      commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'success' } }));
      moveTrd(repo, 'docs/TRD/completed/thing.md');
      const e = entry(run(repo), 'docs/TRD/completed/thing.md');
      expect(e.skip).toBeNull();
      expect(e.trd.tasks[0].status).toBe('success');
    });

    test('a Touches path outside the repo does not make git fatal: the in-repo path still decides (changed -> reviewed)', () => {
      const repo = mkRepo();
      commitFiles(repo, 'trd', { [TRD]: withTouches(['../outside/x', 'src/thing.js']), 'README.md': 'r' });
      commitFiles(repo, 'built', { 'src/thing.js': 'built' });
      expect(entry(run(repo), TRD).skip).toBeNull();
    });

    test('out-of-repo Touches are dropped, not merely tolerated: in-repo path never changed -> no-implementation', () => {
      const repo = mkRepo();
      commitFiles(repo, 'trd', { [TRD]: withTouches(['../outside/x', 'src/thing.js']), 'README.md': 'r' });
      commitFiles(repo, 'unrelated', { 'other.txt': 'o' });
      expect(entry(run(repo), TRD).skip).toBe('no-implementation');
    });

    test('a Touches path git rejects is a review, not a skip', () => {
      const repo = mkRepo();
      commitFiles(repo, 'trd', { [TRD]: withTouches([':(bogus)src/thing.js']), 'README.md': 'r' });
      expect(entry(run(repo), TRD).skip).toBeNull();
    });

    test('a failing `git log --follow` is a review, not a skip and not a throw', () => {
      // In-repo Touches that never changed: with working history this TRD would be 'no-implementation'.
      const repo = mkRepo();
      // The TRD is the last commit so its doc window is empty: the orderFile below must break only
      // the `--follow` call, not the unrelated `git log A..B` that builds the window.
      commitFiles(repo, 'unrelated', { 'other.txt': 'o' });
      commitFiles(repo, 'trd', { [TRD]: withTouches(['src/thing.js']), 'README.md': 'r' });
      expect(entry(run(repo), TRD).skip).toBe('no-implementation');
      // A missing diff.orderFile makes `log --follow --name-status` exit 128 while `log -1 -- <path>`
      // still works. Set on this scratch repo only; git is real, never stubbed.
      sh(repo, ['config', 'diff.orderFile', '/nonexistent/order']);
      const failing = spawnSync('git', ['log', '--follow', '--name-status', '-z', '--', TRD], { cwd: repo, encoding: 'utf8' });
      expect(failing.status).not.toBe(0);
      let a;
      expect(() => { a = run(repo); }).not.toThrow();
      expect(entry(a, TRD).skip).toBeNull();
    });

    test('implement.json that is unparseable, not an object, or has no string trd_file never throws and never counts', () => {
      const repo = trdRepo();
      commitFiles(repo, 'bad states', {
        '.trd-state/a/implement.json': '{not json',
        '.trd-state/b/implement.json': 'null',
        '.trd-state/c/implement.json': JSON.stringify({ trd_file: 42, tasks: { 'T-1': { status: 'success' } } }),
        '.trd-state/d/implement.json': JSON.stringify({ tasks: { 'T-1': { status: 'success' } } }),
      });
      let a;
      expect(() => { a = run(repo); }).not.toThrow();
      expect(entry(a, TRD).skip).toBe('no-implementation');
      expect(entry(a, TRD).trd.tasks.map((t) => t.status)).toEqual([null, null]);
    });

    test('a TRD created by copying another does not inherit the original\'s implement.json', () => {
      const repo = trdRepo();
      commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'success' }, 'T-2': { status: 'success' } }));
      commitFiles(repo, 'copy', { 'docs/TRD/copy.md': TRD_BODY('\nCopied from thing.\n') });
      const e = entry(run(repo), 'docs/TRD/copy.md');
      expect(e.trd.tasks.map((t) => t.status)).toEqual([null, null]);
    });

    test('an archived TRD does not inherit the records of a new TRD written at its old path', () => {
      const repo = trdRepo();
      moveTrd(repo, 'docs/TRD/completed/thing.md');
      commitFiles(repo, 'new trd at the old path', {
        [TRD]: TRD_BODY('\nA new feature that reuses the name.\n'),
        ...implState('thing2', { 'T-1': { status: 'in_progress' } }),
      });
      const e = entry(run(repo), 'docs/TRD/completed/thing.md');
      expect(e.skip).not.toBe('in-flight');
      expect(e.trd.tasks.map((t) => t.status)).toEqual([null, null]);
    });

    test('a TRD written at a path a deleted TRD once held does not inherit that TRD\'s history', () => {
      const repo = mkRepo();
      commitFiles(repo, 'old trd', { 'docs/TRD/old.md': TRD_BODY(), 'README.md': 'r' });
      commitFiles(repo, 'state', implState('old', { 'T-1': { status: 'success' } }, 'docs/TRD/old.md'));
      sh(repo, ['mv', 'docs/TRD/old.md', TRD]);
      sh(repo, ['commit', '-q', '-m', 'rename']);
      sh(repo, ['rm', '-q', TRD]);
      sh(repo, ['commit', '-q', '-m', 'delete']);
      commitFiles(repo, 'new trd', { [TRD]: TRD_BODY('\nA different feature.\n') });
      expect(entry(run(repo), TRD).trd.tasks.map((t) => t.status)).toEqual([null, null]);
    });

    test('a moved TRD whose name git would quote still matches its old path', () => {
      const repo = mkRepo();
      const oldPath = 'docs/TRD/th"ing.md';
      commitFiles(repo, 'trd', { [oldPath]: TRD_BODY(), 'README.md': 'r' });
      commitFiles(repo, 'state', implState('thing', { 'T-1': { status: 'success' } }, oldPath));
      fs.mkdirSync(path.join(repo, 'docs/TRD/completed'), { recursive: true });
      sh(repo, ['mv', oldPath, 'docs/TRD/completed/th"ing.md']);
      sh(repo, ['commit', '-q', '-m', 'archive the TRD']);
      const e = entry(run(repo), 'docs/TRD/completed/th"ing.md');
      expect(e.trd.tasks[0].status).toBe('success');
    });
  });

  test('a root-commit TRD whose Touches files never changed is still skipped', () => {
    const repo = mkRepo();
    commitFiles(repo, 'trd only', { [TRD]: TRD_BODY(), 'README.md': 'r' });
    expect(entry(run(repo), TRD).skip).toBe('no-implementation');
  });

  test('an implement.json naming a different TRD does not count', () => {
    const repo = trdRepo();
    commitFiles(repo, 'state', implState('other', { 'T-1': { status: 'success' } }, 'docs/TRD/other.md'));
    expect(entry(run(repo), TRD).skip).toBe('no-implementation');
  });

  test('uncommitted implement.json is not evidence', () => {
    const repo = trdRepo();
    put(repo, '.trd-state/thing/implement.json', JSON.stringify({ trd_file: TRD, tasks: { 'T-1': { status: 'success' } } }));
    expect(entry(run(repo), TRD).skip).toBe('no-implementation');
  });

  test('a TRD with no Touches to test is reviewed rather than skipped', () => {
    const repo = mkRepo();
    commitFiles(repo, 'trd', { [TRD]: '# T\n\n## Master Task List\n\n| ID | Task |\n|----|------|\n| T-1 | thing |\n' });
    expect(entry(run(repo), TRD).skip).toBeNull();
  });

  describe('PRD of a feature in flight', () => {
    const PRD = 'docs/PRD/x.md';
    const inFlightState = (trdFile = TRD) =>
      implState('thing', { 'T-1': { status: 'pending' }, 'T-2': { status: 'success' } }, trdFile);
    const citing = (prdPath) => `**Source PRD**: ${prdPath}\n\n${TRD_BODY()}`;
    const batched = (a) => a.batches.flatMap((b) => b.docs);

    test('a PRD cited by an in-flight TRD is skipped in-flight and not batched', () => {
      const repo = mkRepo();
      commitFiles(repo, 'docs', { [TRD]: citing(PRD), [PRD]: PRD_BODY, 'README.md': 'r' });
      commitFiles(repo, 'work', { 'src/thing.js': 'built' });
      commitFiles(repo, 'state', inFlightState());
      const a = run(repo);
      expect(entry(a, TRD).skip).toBe('in-flight');
      expect(entry(a, PRD).skip).toBe('in-flight');
      expect(a.skipped).toEqual(expect.arrayContaining([{ path: PRD, reason: 'in-flight' }]));
      expect(batched(a)).not.toContain(PRD);
    });

    test('a PRD sharing the in-flight TRD basename, not cited, is skipped', () => {
      const repo = mkRepo();
      commitFiles(repo, 'docs', { [TRD]: TRD_BODY(), 'docs/PRD/thing.md': PRD_BODY, 'README.md': 'r' });
      commitFiles(repo, 'work', { 'src/thing.js': 'built' });
      commitFiles(repo, 'state', inFlightState());
      const a = run(repo);
      expect(entry(a, 'docs/PRD/thing.md').skip).toBe('in-flight');
      expect(batched(a)).not.toContain('docs/PRD/thing.md');
    });

    test('an unrelated PRD stays reviewed beside an in-flight TRD', () => {
      const repo = mkRepo();
      commitFiles(repo, 'docs', { [TRD]: citing(PRD), [PRD]: PRD_BODY, 'docs/PRD/other.md': PRD_BODY });
      commitFiles(repo, 'work', { 'src/thing.js': 'built' });
      commitFiles(repo, 'state', inFlightState());
      const a = run(repo);
      expect(entry(a, 'docs/PRD/other.md').skip).toBeNull();
      expect(batched(a)).toContain('docs/PRD/other.md');
    });

    test('regression: the same TRD closed -> the PRD is batched', () => {
      const repo = mkRepo();
      commitFiles(repo, 'docs', { [TRD]: citing(PRD), [PRD]: PRD_BODY });
      commitFiles(repo, 'state', { ...inFlightState(), '.trd-state/thing/closed.json': '{}' });
      const a = run(repo);
      expect(entry(a, PRD).skip).toBeNull();
      expect(batched(a)).toContain(PRD);
    });

    test('regression: TRD skipped no-implementation -> the PRD is batched', () => {
      const repo = mkRepo();
      commitFiles(repo, 'docs', { [TRD]: citing(PRD), [PRD]: PRD_BODY, 'README.md': 'r' });
      const a = run(repo);
      expect(entry(a, TRD).skip).toBe('no-implementation');
      expect(entry(a, PRD).skip).toBeNull();
      expect(batched(a)).toContain(PRD);
    });
  });

  test('a skipped TRD stays in the inventory but leaves the batches', () => {
    const repo = trdRepo();
    commitFiles(repo, 'prd', { 'docs/PRD/a.md': PRD_BODY });
    const a = run(repo);
    expect(a.files.map((f) => f.path)).toContain(TRD);
    expect(a.batches.map((b) => b.key)).toEqual(['prd']);
  });
});

describe('errors', () => {
  test('not a git repository -> AssembleError exit 2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dabs-nogit-'));
    tmpRepos.push(dir);
    expect(() => run(dir)).toThrow(/not a git repository/);
    try { run(dir); } catch (e) { expect(e.exitCode).toBe(2); }
  });

  test('detached HEAD and an empty repository are refused', () => {
    const repo = mkRepo();
    expect(() => run(repo)).toThrow(/no commits|detached/);
    const c = commitFiles(repo, 'one', { 'docs/a.md': '# a\n' });
    sh(repo, ['checkout', '-q', '--detach', c]);
    expect(() => run(repo)).toThrow(/detached/);
  });

  test('a bad --run-date is refused', () => {
    const repo = mkRepo();
    commitFiles(repo, 'one', { 'docs/a.md': '# a\n' });
    expect(() => assemble({ repo, runDate: '10/04/2026' })).toThrow(/YYYY-MM-DD/);
  });
});

describe('determinism (AC-F1.5)', () => {
  test('two runs on the same input produce identical bytes', () => {
    const repo = mkRepo();
    commitFiles(repo, 'a', { 'docs/PRD/a.md': PRD_BODY, 'docs/TRD/thing.md': TRD_BODY(), 'docs/g.md': 'see `x/y.js`\n' });
    put(repo, 'docs/untracked.md', '# u\n');
    const a = JSON.stringify(run(repo, { comprehensive: true }));
    const b = JSON.stringify(run(repo, { comprehensive: true }));
    expect(a).toBe(b);
  });
});

describe('CLI', () => {
  function cli(args) {
    return spawnSync('node', [MODULE, ...args], { encoding: 'utf8' });
  }

  test('assemble writes the file and prints a one-line summary', () => {
    const repo = mkRepo();
    commitFiles(repo, 'a', { 'docs/PRD/a.md': PRD_BODY });
    const out = path.join(repo, '.trd-state', '_docs-audit', 'work', 'r1', 'assembly.json');
    const r = cli(['assemble', '--repo', repo, '--run-date', '2026-10-04', '--out', out]);
    expect(r.status).toBe(0);
    const written = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(written.workflowArgs[0].assemblyPath).toBe(out);
    expect(JSON.parse(r.stdout)).toMatchObject({ out, mode: 'comprehensive', batches: 1 });
  });

  test('inverted thresholds exit 2 naming the setting; usage errors exit 1', () => {
    const repo = mkRepo();
    commitFiles(repo, 'a', { 'docs/PRD/a.md': PRD_BODY });
    put(repo, '.claude/settings.json', JSON.stringify({ ensemble: { docsAudit: { thresholds: { high: 30, medium: 60 } } } }));
    const r = cli(['assemble', '--repo', repo, '--run-date', '2026-10-04', '--out', path.join(repo, 'o.json')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ensemble\.docsAudit\.thresholds\.medium/);
    expect(cli(['assemble', '--repo', repo]).status).toBe(1);
    expect(cli(['bogus']).status).toBe(1);
  });

  test('a non-repo exits 2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dabs-cli-'));
    tmpRepos.push(dir);
    expect(cli(['assemble', '--repo', dir, '--run-date', '2026-10-04', '--out', path.join(dir, 'o.json')]).status).toBe(2);
  });
});
