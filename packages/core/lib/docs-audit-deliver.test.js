'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const deliver = require('./docs-audit-deliver');

const CLI = path.join(__dirname, 'docs-audit-deliver.js');
const RUN_ID = '2026-10-04-abc1234';
const tmpDirs = [];

function sh(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function write(repo, rel, text) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
}
function commitAll(repo, msg) {
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-q', '-m', msg]);
}
/** Runs the CLI entry point in-process (so coverage sees it), capturing stdout/stderr and exit code. */
function cli(repo, args) {
  const out = [];
  const err = [];
  const log = jest.spyOn(console, 'log').mockImplementation((m) => out.push(String(m)));
  const error = jest.spyOn(console, 'error').mockImplementation((m) => err.push(String(m)));
  try {
    const status = deliver.main([...args, '--repo', repo]);
    return { status, stdout: out.join('\n'), stderr: err.join('\n') };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

const PRD_WITH_MAP = [
  '# PRD A',
  '',
  '## Feature Requirements',
  '',
  '## Where this lives in the code',
  '',
  '- `packages/core/lib/x.js` — the thing',
  '- `packages/core/hooks` — hooks',
  '- `.claude/commands/` — commands',
  '- `parseTrd` — a symbol',
  '',
  '## After',
  '- `ignored/dir` — not in the map',
  '',
].join('\n');

/** A repo with a bare remote, one PRD with a map, one TRD without, a hook-written session log. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliver-'));
  tmpDirs.push(root);
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  sh(root, ['init', '-q', '--bare', remote]);
  sh(repo, ['init', '-q', '-b', 'main']);
  sh(repo, ['config', 'user.email', 't@example.com']);
  sh(repo, ['config', 'user.name', 'T']);
  sh(repo, ['config', 'commit.gpgsign', 'false']);
  sh(repo, ['remote', 'add', 'origin', remote]);
  write(repo, 'docs/PRD/a.md', PRD_WITH_MAP);
  write(repo, 'docs/TRD/t.md', '# TRD\n\n## Master Task List\n');
  write(repo, 'docs/TRD/gone.md', '# TRD gone\n\n## Master Task List\n');
  write(repo, 'docs/notes.md', 'loose\n');
  write(repo, '.trd-state/feat/session-log.md', 'log\n');
  write(repo, 'src/code.js', 'x\n');
  commitAll(repo, 'init');
  sh(repo, ['push', '-q', 'origin', 'main']);
  const work = path.join(repo, '.trd-state/_docs-audit/work', RUN_ID);
  fs.mkdirSync(work, { recursive: true });
  return { root, remote, repo, work };
}

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('parsePorcelain / isHookState / readMapDirs', () => {
  it('parses entries and swallows rename origins', () => {
    const out = ' M a.md\0R  new.md\0old.md\0D  b.md\0';
    expect(deliver.parsePorcelain(out).map((e) => e.path)).toEqual(['a.md', 'new.md', 'b.md']);
  });

  it('treats .trd-state outside _docs-audit as hook state', () => {
    expect(deliver.isHookState('.trd-state/_session-log.md')).toBe(true);
    expect(deliver.isHookState('.trd-state/feat/session-log.md')).toBe(true);
    expect(deliver.isHookState('.trd-state/_docs-audit/last-run.json')).toBe(false);
    expect(deliver.isHookState('docs/PRD/a.md')).toBe(false);
  });

  it('reduces map entries to two segments, de-duplicated, stopping at the next heading', () => {
    expect(deliver.readMapDirs(PRD_WITH_MAP)).toEqual(['packages/core', '.claude/commands', 'parseTrd']);
  });

  it('ignores a map heading quoted inside fenced code', () => {
    expect(deliver.readMapDirs('# t\n```\n## Where this lives in the code\n- `x/y`\n```\n')).toBeNull();
  });

  it('returns null when the map is absent or empty', () => {
    expect(deliver.readMapDirs('# t\n')).toBeNull();
    expect(deliver.readMapDirs('## Where this lives in the code\n\nprose only\n')).toBeNull();
  });
});

describe('prepare', () => {
  it('exits 2 on a dirty tracked tree and changes nothing', () => {
    const { repo, work } = fixture();
    write(repo, 'docs/PRD/a.md', PRD_WITH_MAP + 'edit\n');
    const r = cli(repo, ['prepare', '--run-id', RUN_ID, '--work', work]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('docs/PRD/a.md');
    expect(sh(repo, ['branch', '--show-current'])).toBe('main');
    expect(sh(repo, ['branch', '--list', 'docs-audit/*'])).toBe('');
    expect(fs.existsSync(path.join(work, 'branch.json'))).toBe(false);
  });

  it('is not blocked by a modified tracked .trd-state session log, and leaves it alone', () => {
    const { repo, work } = fixture();
    write(repo, '.trd-state/feat/session-log.md', 'log\nmore\n');
    const r = cli(repo, ['prepare', '--run-id', RUN_ID, '--work', work]);
    expect(r.status).toBe(0);
    expect(fs.readFileSync(path.join(repo, '.trd-state/feat/session-log.md'), 'utf8')).toBe('log\nmore\n');
  });

  it('creates the branch from HEAD and records the original branch', () => {
    const { repo, work } = fixture();
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = cli(repo, ['prepare', '--run-id', RUN_ID, '--work', work]);
    expect(r.status).toBe(0);
    expect(sh(repo, ['branch', '--show-current'])).toBe(`docs-audit/${RUN_ID}`);
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
    const meta = JSON.parse(fs.readFileSync(path.join(work, 'branch.json'), 'utf8'));
    expect(meta).toMatchObject({ runId: RUN_ID, branch: `docs-audit/${RUN_ID}`, originalBranch: 'main' });
  });

  it('exits 2 on a detached HEAD and on a bad run id', () => {
    const { repo, work } = fixture();
    expect(cli(repo, ['prepare', '--run-id', 'a b', '--work', work]).status).toBe(2);
    sh(repo, ['checkout', '-q', '--detach']);
    const r = cli(repo, ['prepare', '--run-id', RUN_ID, '--work', work]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('detached');
  });

  it('exits 2 when the branch already exists', () => {
    const { repo, work } = fixture();
    sh(repo, ['branch', `docs-audit/${RUN_ID}`]);
    const r = cli(repo, ['prepare', '--run-id', RUN_ID, '--work', work]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('git switch -c');
  });
});

describe('commit-batch', () => {
  function prepared() {
    const f = fixture();
    expect(cli(f.repo, ['prepare', '--run-id', RUN_ID, '--work', f.work]).status).toBe(0);
    return f;
  }

  it('commits edited docs and an already git-rm-ed removal without re-adding it', () => {
    const { repo, work } = prepared();
    write(repo, 'docs/PRD/a.md', PRD_WITH_MAP + 'fixed\n');
    sh(repo, ['rm', '-q', 'docs/TRD/gone.md']); // what docs-audit-apply.js does
    const applied = path.join(work, 'applied-trd-0.json');
    fs.writeFileSync(
      applied,
      JSON.stringify({
        edited: ['docs/PRD/a.md'],
        removed: [{ path: 'docs/TRD/gone.md', lastCommit: 'x', reason: 'r' }],
      })
    );
    fs.writeFileSync(
      path.join(work, 'batch-trd-0.json'),
      JSON.stringify({ records: [{ path: 'docs/PRD/a.md', corrections: [{}, {}], cuts: [{}] }] })
    );
    const r = cli(repo, ['commit-batch', '--applied', applied, '--batch', 'trd']);
    expect(r.status).toBe(0);
    expect(sh(repo, ['log', '-1', '--format=%s'])).toBe('docs-audit(trd): 2 corrected, 1 cut, 1 removed');
    expect(sh(repo, ['show', '--name-status', '--format=', 'HEAD']).split('\n').sort()).toEqual([
      'D\tdocs/TRD/gone.md',
      'M\tdocs/PRD/a.md',
    ]);
  });

  it('counts behaviour changes with the corrections in the commit message', () => {
    const { repo, work } = prepared();
    write(repo, 'docs/PRD/a.md', PRD_WITH_MAP + 'fixed\n');
    const applied = path.join(work, 'applied-prd-0.json');
    fs.writeFileSync(applied, JSON.stringify({ edited: ['docs/PRD/a.md'], removed: [] }));
    fs.writeFileSync(
      path.join(work, 'batch-prd-0.json'),
      JSON.stringify({ records: [{ path: 'docs/PRD/a.md', corrections: [{}, {}], behaviourChanges: [{ id: 'AC-1' }] }] })
    );
    cli(repo, ['commit-batch', '--applied', applied, '--batch', 'prd']);
    expect(sh(repo, ['log', '-1', '--format=%s'])).toBe('docs-audit(prd): 3 corrected, 0 cut, 0 removed');
  });

  it('falls back to counting edited docs when no batch result sits beside it', () => {
    const { repo, work } = prepared();
    write(repo, 'docs/PRD/a.md', PRD_WITH_MAP + 'fixed\n');
    const applied = path.join(work, 'applied-prd-0.json');
    fs.writeFileSync(applied, JSON.stringify({ edited: ['docs/PRD/a.md'], removed: [] }));
    cli(repo, ['commit-batch', '--applied', applied, '--batch', 'prd']);
    expect(sh(repo, ['log', '-1', '--format=%s'])).toBe('docs-audit(prd): 1 corrected, 0 cut, 0 removed');
  });

  it('makes no commit when nothing changed, and never sweeps in hook state', () => {
    const { repo, work } = prepared();
    write(repo, '.trd-state/feat/session-log.md', 'log\nmore\n');
    const before = sh(repo, ['rev-parse', 'HEAD']);
    const applied = path.join(work, 'applied-prd-0.json');
    fs.writeFileSync(applied, JSON.stringify({ edited: [], removed: [] }));
    const r = cli(repo, ['commit-batch', '--applied', applied, '--batch', 'prd']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ committed: false });
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(before);
  });

  it('exits 2 with the failing command when git fails', () => {
    const { repo, work } = prepared();
    const applied = path.join(work, 'applied-prd-0.json');
    fs.writeFileSync(applied, JSON.stringify({ edited: ['docs/PRD/nope.md'], removed: [] }));
    const r = cli(repo, ['commit-batch', '--applied', applied, '--batch', 'prd']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('git add -- docs/PRD/nope.md');
  });
});

describe('finalize', () => {
  const ASSEMBLY = (head) => ({
    runId: RUN_ID,
    head,
    branch: 'main',
    mode: 'comprehensive',
    modeReason: 'flag',
    files: [
      { path: 'docs/PRD/a.md', class: 'prd', git: 'tracked', disagreement: false, generated: false },
      { path: 'docs/TRD/t.md', class: 'trd', git: 'tracked', disagreement: false, generated: false },
      { path: 'docs/TRD/gone.md', class: 'trd', git: 'tracked', disagreement: false, generated: false },
      { path: 'docs/TRD/skipped.md', class: 'trd', git: 'tracked', skip: 'in-flight', generated: false },
      { path: 'docs/PRD/brief.md', class: 'loose', folderClass: 'prd', structureClass: 'loose', disagreement: true, git: 'tracked', generated: false },
      { path: 'docs/PRD/INDEX.md', class: 'loose', generated: true, git: 'tracked' },
      { path: 'docs/PRD/draft.md', class: 'prd', git: 'untracked', disagreement: false, generated: false },
    ],
  });

  /** Runs prepare, one edit+removal batch, a stray edit and hook-state change, then finalize. */
  function runThrough() {
    const f = fixture();
    const head = sh(f.repo, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(f.work, 'assembly.json'), JSON.stringify(ASSEMBLY(head)));
    write(f.repo, 'docs/PRD/draft.md', PRD_WITH_MAP); // an untracked PRD: never in a committed index
    expect(cli(f.repo, ['prepare', '--run-id', RUN_ID, '--work', f.work]).status).toBe(0);

    // Batch edit: the PRD's map gains a directory, t.md gains one, gone.md is removed.
    write(f.repo, 'docs/PRD/a.md', PRD_WITH_MAP.replace('`parseTrd` — a symbol', '`test/integration` — tests'));
    write(f.repo, 'docs/TRD/t.md', '# TRD\n\n## Master Task List\n\n## Where this lives in the code\n\n- `a/b/c/d.js` — deep\n');
    sh(f.repo, ['rm', '-q', 'docs/TRD/gone.md']);
    fs.writeFileSync(
      path.join(f.work, 'batch-trd-0.json'),
      JSON.stringify({
        batch: { key: 'trd', chunk: 0 },
        records: [
          { path: 'docs/PRD/a.md', class: 'prd', depth: 'opus', score: 82, scoreReason: 'big window', outcome: 'edited', corrections: [{ section: '3', what: 'fixed path' }], cuts: [], unbuilt: [{ id: 'R9', statement: 'not built' }] },
          { path: 'docs/TRD/t.md', class: 'trd', depth: 'sonnet', score: null, scoreReason: null, outcome: 'edited', corrections: [], cuts: [{ section: '2', why: 'absent' }], statusCorrection: { from: 'Draft', to: 'Delivered' } },
          { path: 'docs/TRD/gone.md', class: 'trd', depth: 'sonnet', score: 12, scoreReason: 'a | b', outcome: 'remove-proposed' },
        ],
        dead: ['docs/notes.md'],
      })
    );
    fs.writeFileSync(
      path.join(f.work, 'applied-trd-0.json'),
      JSON.stringify({
        edited: ['docs/PRD/a.md', 'docs/TRD/t.md'],
        removed: [{ path: 'docs/TRD/gone.md', lastCommit: head, reason: 'nothing valid remains' }],
        blocked: [{ path: 'docs/data.md', reason: 'referenced', hits: ['ci.yml:data.md'] }],
        reverted: [{ path: 'docs/x.md', why: 'banner' }],
        mapDefects: [{ path: 'docs/TRD/t.md', why: 'line-reference' }],
        notTracked: [],
      })
    );
    expect(cli(f.repo, ['commit-batch', '--applied', path.join(f.work, 'applied-trd-0.json'), '--batch', 'trd']).status).toBe(0);

    // During the run: a stray edit to code, a hook-written log change, an untracked newcomer.
    write(f.repo, 'src/code.js', 'tampered\n');
    write(f.repo, '.trd-state/feat/session-log.md', 'log\nhook wrote this\n');
    write(f.repo, 'new-file.txt', 'surprise\n');
    return { ...f, head };
  }

  it('commits indexes, marker and change set on the review branch, then switches back', () => {
    const f = runThrough();
    const r = cli(f.repo, ['finalize', '--work', f.work]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toEqual({
      changeSet: `.trd-state/_docs-audit/runs/${RUN_ID}.md`,
      branch: `docs-audit/${RUN_ID}`,
      originalBranch: 'main',
      pushCommand: `git push -u origin docs-audit/${RUN_ID} && gh pr create --head docs-audit/${RUN_ID} --fill`,
    });
    expect(sh(f.repo, ['branch', '--show-current'])).toBe('main');
    const files = sh(f.repo, ['show', '--name-only', '--format=', `docs-audit/${RUN_ID}`]).split('\n').sort();
    expect(files).toEqual([
      '.trd-state/_docs-audit/last-run.json',
      `.trd-state/_docs-audit/runs/${RUN_ID}.md`,
      'docs/PRD/INDEX.md',
      'docs/TRD/INDEX.md',
    ]);
  });

  it('lists exactly the PRDs/TRDs in the tree, with two-segment map dirs or "no map yet"', () => {
    const f = runThrough();
    cli(f.repo, ['finalize', '--work', f.work]);
    const show = (p) => sh(f.repo, ['show', `docs-audit/${RUN_ID}:${p}`]);
    const prd = show('docs/PRD/INDEX.md');
    expect(prd).toContain('- `docs/PRD/a.md` — `packages/core`, `.claude/commands`, `test/integration`');
    expect(prd).not.toContain('brief.md');
    expect(prd).not.toContain('draft.md'); // untracked: not part of the commit
    expect(prd).not.toContain('INDEX.md`');
    const trd = show('docs/TRD/INDEX.md');
    expect(trd).toContain('- `docs/TRD/t.md` — `a/b`'); // read from the edited tree, not the assembly
    expect(trd).not.toContain('gone.md'); // removed this run
    expect(trd).not.toContain('skipped.md'); // absent from the tree
  });

  it('holds the reviewed HEAD in a marker that exists only on the review branch', () => {
    const f = runThrough();
    cli(f.repo, ['finalize', '--work', f.work]);
    const marker = JSON.parse(sh(f.repo, ['show', `docs-audit/${RUN_ID}:.trd-state/_docs-audit/last-run.json`]));
    expect(marker.sha).toBe(f.head);
    expect(fs.existsSync(path.join(f.repo, '.trd-state/_docs-audit/last-run.json'))).toBe(false);
    expect(sh(f.repo, ['ls-tree', '-r', '--name-only', 'main'])).not.toContain('last-run.json');
  });

  it('lists score and depth for every doc, plus removals and surfaced items', () => {
    const f = runThrough();
    cli(f.repo, ['finalize', '--work', f.work]);
    const cs = sh(f.repo, ['show', `docs-audit/${RUN_ID}:.trd-state/_docs-audit/runs/${RUN_ID}.md`]);
    expect(cs).toContain('| `docs/PRD/a.md` | prd | 82 | opus | edited |');
    expect(cs).toContain('| `docs/TRD/t.md` | trd | — | sonnet | edited |');
    expect(cs).toContain('| `docs/TRD/gone.md` | trd | 12 | sonnet | remove-proposed |');
    expect(cs).toContain('| `docs/TRD/skipped.md` | trd | — | none | skipped (in-flight) |');
    expect(cs).toContain('Score reason: a | b');
    expect(cs).toContain('Status: Draft → Delivered');
    expect(cs).toContain('Corrected — 3: fixed path');
    expect(cs).toContain('Cut — 2: absent');
    expect(cs).toContain(`- \`docs/TRD/gone.md\` — nothing valid remains (recover from \`${f.head}\``);
    expect(cs).toContain('ci.yml:data.md');
    expect(cs).toContain('Class disagreement: `docs/PRD/brief.md`');
    expect(cs).toContain('Unbuilt requirement in `docs/PRD/a.md`: R9');
    expect(cs).toContain('Reverted (banner): `docs/x.md`');
    expect(cs).toContain('Code map defect (line-reference): `docs/TRD/t.md`');
    expect(cs).toContain('Agent returned nothing: `docs/notes.md`');
    expect(cs).toContain('Stray tracked edit reverted: `src/code.js`');
    expect(cs).toContain('Untracked file appeared during the run (left in place): `new-file.txt`');
    expect(cs).toContain('`.trd-state/feat/session-log.md` — hook-written');
  });

  it('reverts stray tracked edits, keeps hook state uncommitted on the original branch, deletes nothing untracked', () => {
    const f = runThrough();
    cli(f.repo, ['finalize', '--work', f.work]);
    expect(fs.readFileSync(path.join(f.repo, 'src/code.js'), 'utf8')).toBe('x\n');
    expect(fs.readFileSync(path.join(f.repo, '.trd-state/feat/session-log.md'), 'utf8')).toBe('log\nhook wrote this\n');
    expect(sh(f.repo, ['status', '--porcelain', '--untracked-files=no'])).toBe('M .trd-state/feat/session-log.md');
    expect(fs.existsSync(path.join(f.repo, 'new-file.txt'))).toBe(true);
    // The review branch never committed the hook state.
    expect(sh(f.repo, ['show', '--name-only', '--format=', `docs-audit/${RUN_ID}~1`])).not.toContain('session-log');
    // Reviewed docs are on the branch only; the original branch is untouched.
    expect(fs.readFileSync(path.join(f.repo, 'docs/PRD/a.md'), 'utf8')).toBe(PRD_WITH_MAP);
    expect(fs.existsSync(path.join(f.repo, 'docs/TRD/gone.md'))).toBe(true);
  });

  it('never pushes: the remote is unchanged', () => {
    const f = runThrough();
    const before = sh(f.repo, ['ls-remote', 'origin']);
    cli(f.repo, ['finalize', '--work', f.work]);
    expect(sh(f.repo, ['ls-remote', 'origin'])).toBe(before);
    expect(before).not.toContain('docs-audit');
  });

  it('skips writing an index for a class with no docs and no existing index', () => {
    const f = fixture();
    const head = sh(f.repo, ['rev-parse', 'HEAD']);
    fs.writeFileSync(
      path.join(f.work, 'assembly.json'),
      JSON.stringify({ runId: RUN_ID, head, branch: 'main', mode: 'light', files: [] })
    );
    cli(f.repo, ['prepare', '--run-id', RUN_ID, '--work', f.work]);
    const r = cli(f.repo, ['finalize', '--work', f.work]);
    expect(r.status).toBe(0);
    const files = sh(f.repo, ['show', '--name-only', '--format=', `docs-audit/${RUN_ID}`]).split('\n');
    expect(files).not.toContain('docs/PRD/INDEX.md');
  });
});

describe('CLI errors', () => {
  it('prints usage and exits 1 for an unknown subcommand, 2 for a missing option', () => {
    expect(spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' }).status).toBe(1);
    const r = spawnSync(process.execPath, [CLI, 'prepare'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('missing --repo');
  });

  it('renders an empty change set without throwing', () => {
    const md = deliver.renderChangeSet({
      assembly: { runId: 'r', head: 'h', branch: 'main', mode: 'light', files: [] },
      batches: [],
      applieds: [],
      tree: { strays: [], hookState: [], untracked: [] },
    });
    expect(md).toContain('| (none) | | | | |');
  });

  it('names the branch the review branch was cut from, not the review branch itself', () => {
    // assemble runs after prepare has switched, so assembly.branch is the review branch.
    const md = deliver.renderChangeSet({
      assembly: { runId: 'r', head: 'h', branch: 'docs-audit/r', mode: 'light', files: [] },
      batches: [],
      applieds: [],
      tree: { strays: [], hookState: [], untracked: [] },
      originalBranch: 'main',
    });
    expect(md).toContain('- Branch: docs-audit/r (from main)');
  });

  it('lists a cross-repo claim under Surfaced for the owner, never as a correction or a cut', () => {
    const md = deliver.renderChangeSet({
      assembly: { runId: 'r', head: 'h', branch: 'main', mode: 'light', files: [] },
      batches: [{ records: [{
        path: 'docs/PRD/a.md', class: 'prd', score: 50, depth: 'sonnet', outcome: 'kept',
        corrections: [], cuts: [], unbuilt: [], statusCorrection: null,
        crossRepo: [{ claim: 'the billing service retries 3 times', path: 'other-repo/billing/retry.js' }],
      }] }],
      applieds: [],
      tree: { strays: [], hookState: [], untracked: [] },
    });
    const surfaced = md.split('## Surfaced for the owner')[1].split('\n## ')[0];
    expect(surfaced).toContain(
      'Cross-repo claim in `docs/PRD/a.md`: the billing service retries 3 times (other-repo/billing/retry.js)',
    );
    // Not corrected, not cut, and no per-document detail section: the claim changed nothing.
    expect(md).not.toContain('Corrected —');
    expect(md).not.toContain('Cut —');
    expect(md).not.toContain('### `docs/PRD/a.md`');
    // The document's outcome is untouched by the claim (the change set carries no drift count).
    expect(md).toContain('| `docs/PRD/a.md` | prd | 50 | sonnet | kept |');
  });
  describe('behaviour changes, broken non-goals and changelog defects', () => {
    const render = (records, applieds) =>
      deliver.renderChangeSet({
        assembly: { runId: 'r', head: 'h', branch: 'main', mode: 'light', files: [] },
        batches: [{ records }],
        applieds,
        tree: { strays: [], hookState: [], untracked: [] },
      });
    const prd = (extra) => ({
      path: 'docs/PRD/a.md', class: 'prd', score: 50, depth: 'sonnet', outcome: 'edited',
      corrections: [], cuts: [], unbuilt: [], statusCorrection: null, ...extra,
    });
    const confirm = (md) =>
      md.split('## Requirements changed to match the code — confirm')[1].split('\n## ')[0];

    it('lists a behaviour change whose edit landed, under the confirm heading', () => {
      const md = render(
        [prd({ behaviourChanges: [{ id: 'AC-F2.3', was: 'logs always', now: 'logs only in debug mode' }] })],
        [{ edited: ['docs/PRD/a.md'] }]
      );
      expect(confirm(md)).toContain('- docs/PRD/a.md: AC-F2.3 — was: logs always; now: logs only in debug mode');
      expect(md.indexOf('## Removals blocked')).toBeLessThan(md.indexOf('## Requirements changed'));
      expect(md.indexOf('## Requirements changed')).toBeLessThan(md.indexOf('## Surfaced for the owner'));
    });

    it('does not list a behaviour change whose doc was reverted (not in edited)', () => {
      const md = render(
        [prd({ behaviourChanges: [{ id: 'AC-F2.3', was: 'a', now: 'b' }] })],
        [{ edited: [], reverted: [{ path: 'docs/PRD/a.md', why: 'banner' }] }]
      );
      expect(confirm(md)).not.toContain('AC-F2.3');
      expect(confirm(md)).toContain('None.');
    });

    it('reads None. when no record carries a behaviour change', () => {
      expect(confirm(render([prd({})], [{ edited: ['docs/PRD/a.md'] }]))).toContain('None.');
    });

    it('lists a broken non-goal and a changelog defect under Surfaced for the owner', () => {
      const md = render(
        [prd({ brokenNonGoals: [{ id: 'NG5', statement: 'no metadata injected', evidence: 'hook.js:12' }] })],
        [{ edited: ['docs/PRD/a.md'], changelogDefects: [{ path: 'docs/PRD/a.md', id: 'AC-F2.3' }] }]
      );
      const surfaced = md.split('## Surfaced for the owner')[1].split('\n## ')[0];
      expect(surfaced).toContain('Broken non-goal in `docs/PRD/a.md`: NG5 — no metadata injected (hook.js:12)');
      expect(surfaced).toContain('Changelog line missing in `docs/PRD/a.md` for AC-F2.3');
    });
  });
});
