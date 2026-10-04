'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { apply, git, safeDocPath, isSignpostLine, mapSection, main } = require('./docs-audit-apply');

const MAP_OK = '\n## Where this lives in the code\n\n- `packages/core/lib` module\n';

let repo;
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(repo, rel));
const commitAll = (msg) => { git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', msg]); };

/** Minimal assembly: every path in `docs` is a tracked doc of the given class. */
function assemblyFor(docs, extra = {}) {
  return {
    files: Object.entries(docs).map(([p, cls]) => ({ path: p, class: cls, git: 'tracked', ...(extra[p] || {}) })),
    batches: [{ key: 'loose:docs', chunk: 1, docs: Object.keys(docs).sort() }],
  };
}
const rec = (p, o = {}) => ({ path: p, class: 'loose', outcome: 'unchanged', ...o });
const run = (assembly, records, dead = []) =>
  apply({ repo, assembly, result: { batch: { key: 'loose:docs', chunk: 1 }, records, dead } });

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dabs-apply-'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 't@example.com']);
  git(repo, ['config', 'user.name', 'T']);
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('safeDocPath', () => {
  it.each([
    ['docs/a.md', 'docs/a.md'],
    ['docs/./x/../a.md', 'docs/a.md'],
    ['../docs/a.md', null],
    ['/etc/passwd', null],
    ['src/a.md', null],
    ['docs/../src/a.md', null],
    ['docs/', null],
    ['', null],
    [undefined, null],
  ])('%s -> %s', (input, expected) => expect(safeDocPath(input)).toBe(expected));
});

describe('isSignpostLine', () => {
  it.each([
    '> **Archived**',
    'SUPERSEDED',
    'Superseded by docs/TRD/new.md',
    'This document is superseded by the new design.',
    '**Status:** Deprecated',
    '| Status | Archived |',
  ])('flags %j', (l) => expect(isSignpostLine(l)).toBe(true));

  it.each([
    'The `--legacy` flag is deprecated; use `--next`.',
    'Deprecated: the old flag is gone.',
    'Status: Complete',
    'The archived sessions folder is purged weekly.',
    '',
  ])('leaves %j alone', (l) => expect(isSignpostLine(l)).toBe(false));
});

describe('mapSection', () => {
  it('returns null without the heading and stops at the next same-level heading', () => {
    expect(mapSection('# T\n\ntext')).toBeNull();
    const s = mapSection('# T\n## Where this lives in the code\n- `a`\n### sub\n- `b`\n## Next\n- `c`');
    expect(s).toContain('`a`');
    expect(s).toContain('`b`');
    expect(s).not.toContain('`c`');
  });
});

describe('record validation', () => {
  it('rejects a record outside the batch or outside docs/, and acts on neither', () => {
    write('docs/a.md', 'a\n');
    write('src/secret.md', 's\n');
    write('docs/other.md', 'o\n');
    commitAll('init');
    const asm = assemblyFor({ 'docs/a.md': 'loose' });
    asm.batches[0].docs = ['docs/a.md'];
    const out = run(asm, [
      rec('src/secret.md', { outcome: 'remove-proposed', removeReason: 'x' }),
      rec('docs/other.md', { outcome: 'remove-proposed', removeReason: 'x' }),
      rec('../../etc/passwd', { outcome: 'edited' }),
    ]);
    expect(out.rejected.sort()).toEqual(['../../etc/passwd', 'docs/other.md', 'src/secret.md']);
    expect(out.reverted.every((r) => r.why === 'outside-batch')).toBe(true);
    expect(out.removed).toEqual([]);
    expect(exists('src/secret.md')).toBe(true);
    expect(exists('docs/other.md')).toBe(true);
  });

  it('throws when the batch is not in the assembly', () => {
    expect(() => apply({ repo, assembly: { files: [], batches: [] }, result: { batch: { key: 'x', chunk: 1 }, records: [] } }))
      .toThrow(/not found/);
  });
});

describe('stray edits', () => {
  it('reverts a tracked edit no record claims and a failed doc, lists untracked newcomers, exempts hook state', () => {
    write('docs/a.md', 'a\n');
    write('docs/b.md', 'b\n');
    write('docs/c.md', 'c\n');
    write('src/code.js', 'x\n');
    write('.trd-state/_session-log.md', 'log\n');
    commitAll('init');
    write('docs/a.md', 'a changed\n');            // claimed edit
    write('docs/b.md', 'b changed\n');            // agent failed
    write('src/code.js', 'tampered\n');           // unclaimed, outside docs
    write('.trd-state/_session-log.md', 'log2\n'); // hook state
    write('docs/new.md', 'new\n');                // untracked newcomer
    const asm = assemblyFor({ 'docs/a.md': 'loose', 'docs/b.md': 'loose', 'docs/c.md': 'loose' });
    const out = run(asm, [rec('docs/a.md', { outcome: 'edited' }), rec('docs/b.md', { outcome: 'failed' })]);
    expect(read('docs/a.md')).toBe('a changed\n');
    expect(read('docs/b.md')).toBe('b\n');
    expect(read('src/code.js')).toBe('x\n');
    expect(read('.trd-state/_session-log.md')).toBe('log2\n');
    expect(out.reverted).toEqual([
      { path: 'docs/b.md', why: 'agent-failed' },
      { path: 'src/code.js', why: 'outside-batch' },
    ]);
    expect(out.hookState).toEqual(['.trd-state/_session-log.md']);
    expect(out.untracked).toEqual(['docs/new.md']);
    expect(out.edited).toEqual(['docs/a.md']);
    expect(exists('docs/new.md')).toBe(true);
  });

  it('reverts a doc listed in dead even without a record', () => {
    write('docs/a.md', 'a\n');
    commitAll('init');
    write('docs/a.md', 'half done\n');
    const out = run(assemblyFor({ 'docs/a.md': 'loose' }), [], ['docs/a.md']);
    expect(read('docs/a.md')).toBe('a\n');
    expect(out.reverted).toEqual([{ path: 'docs/a.md', why: 'agent-failed' }]);
  });

  it('unstages a file the agent created and staged', () => {
    write('docs/a.md', 'a\n');
    commitAll('init');
    write('docs/new.md', 'n\n');
    git(repo, ['add', 'docs/new.md']);
    const out = run(assemblyFor({ 'docs/a.md': 'loose' }), []);
    expect(out.untracked).toEqual(['docs/new.md']);
    expect(git(repo, ['diff', '--cached', '--name-only']).stdout).toBe('');
  });
});

describe('banner post-check (D12)', () => {
  const setup = () => {
    write('docs/a.md', '# A\n\nThe flag --old works.\n');
    write('docs/b.md', '# B\n\nThe flag --old works.\n');
    commitAll('init');
  };

  it('reverts the whole doc when a SUPERSEDED banner line was added', () => {
    setup();
    write('docs/a.md', '# A\n\nSUPERSEDED\n\nThe flag --new works.\n');
    const out = run(assemblyFor({ 'docs/a.md': 'loose', 'docs/b.md': 'loose' }), [rec('docs/a.md', { outcome: 'edited' })]);
    expect(out.reverted).toEqual([{ path: 'docs/a.md', why: 'banner' }]);
    expect(out.edited).toEqual([]);
    expect(read('docs/a.md')).toContain('--old');
  });

  it('keeps a correction saying a flag is deprecated', () => {
    setup();
    write('docs/a.md', '# A\n\nThe flag --old is deprecated; use --new.\n');
    const out = run(assemblyFor({ 'docs/a.md': 'loose', 'docs/b.md': 'loose' }), [rec('docs/a.md', { outcome: 'edited' })]);
    expect(out.reverted).toEqual([]);
    expect(out.edited).toEqual(['docs/a.md']);
  });
});

describe('code-map check (D12)', () => {
  const prd = (extra) => `# P\n\n## Feature Requirements\ntext\n${extra}`;

  it('reports a missing map, a :42 line reference, and passes a clean map', () => {
    write('docs/PRD/none.md', prd(''));
    write('docs/PRD/lines.md', prd('\n## Where this lives in the code\n\n- `packages/core/lib/x.js:42` thing\n'));
    write('docs/PRD/ok.md', prd(MAP_OK));
    commitAll('init');
    const docs = { 'docs/PRD/none.md': 'prd', 'docs/PRD/lines.md': 'prd', 'docs/PRD/ok.md': 'prd' };
    const asm = assemblyFor(docs);
    const out = run(asm, Object.keys(docs).map((p) => rec(p, { class: 'prd' })));
    expect(out.mapDefects).toEqual([
      { path: 'docs/PRD/lines.md', why: 'line-reference' },
      { path: 'docs/PRD/none.md', why: 'missing' },
    ]);
  });

  it('does not check loose docs or unreviewed PRDs', () => {
    write('docs/PRD/p.md', prd(''));
    write('docs/l.md', 'loose\n');
    commitAll('init');
    const asm = assemblyFor({ 'docs/PRD/p.md': 'prd', 'docs/l.md': 'loose' });
    const out = run(asm, [rec('docs/PRD/p.md', { class: 'prd', outcome: 'not-reviewed' }), rec('docs/l.md')]);
    expect(out.mapDefects).toEqual([]);
  });
});

describe('removals (D10)', () => {
  const remove = (p, reason = 'dead') => rec(p, { outcome: 'remove-proposed', removeReason: reason });

  it('keeps a data file referenced only from a CI YAML and a test, and lists the hits', () => {
    write('docs/data/table.csv', 'a,b\n');
    write('.github/workflows/ci.yml', 'run: cat docs/data/table.csv\n');
    write('test/x.test.js', "const f = 'table.csv';\n");
    commitAll('init');
    const out = run(assemblyFor({ 'docs/data/table.csv': 'loose' }), [remove('docs/data/table.csv')]);
    expect(out.removed).toEqual([]);
    expect(out.blocked).toHaveLength(1);
    expect(out.blocked[0].path).toBe('docs/data/table.csv');
    const files = out.blocked[0].hits.map((h) => h.split(':')[0]).sort();
    expect(files).toEqual(['.github/workflows/ci.yml', 'test/x.test.js']);
    expect(exists('docs/data/table.csv')).toBe(true);
  });

  it('reports an untracked candidate without removing it', () => {
    write('docs/keep.md', 'k\n');
    commitAll('init');
    write('docs/loose.md', 'u\n');
    const asm = assemblyFor({ 'docs/keep.md': 'loose' });
    asm.files.push({ path: 'docs/loose.md', class: 'loose', git: 'untracked' });
    asm.batches[0].docs.push('docs/loose.md');
    const out = run(asm, [remove('docs/loose.md')]);
    expect(out.notTracked).toEqual(['docs/loose.md']);
    expect(out.removed).toEqual([]);
    expect(exists('docs/loose.md')).toBe(true);
  });

  it('removes two candidates that reference only each other', () => {
    write('docs/one.md', 'see docs/two.md\n');
    write('docs/two.md', 'see docs/one.md\n');
    commitAll('init');
    const out = run(assemblyFor({ 'docs/one.md': 'loose', 'docs/two.md': 'loose' }), [remove('docs/one.md'), remove('docs/two.md')]);
    expect(out.removed.map((r) => r.path)).toEqual(['docs/one.md', 'docs/two.md']);
    expect(exists('docs/one.md')).toBe(false);
    expect(exists('docs/two.md')).toBe(false);
  });

  it('removes a candidate that names its own path and basename and nothing else does', () => {
    write('docs/self.md', 'This is docs/self.md, also called self.md\n');
    write('docs/keep.md', 'unrelated\n');
    commitAll('init');
    const out = run(assemblyFor({ 'docs/self.md': 'loose', 'docs/keep.md': 'loose' }), [remove('docs/self.md')]);
    expect(out.removed.map((r) => r.path)).toEqual(['docs/self.md']);
  });

  it('ignores hits in generated indexes and run records', () => {
    write('docs/old.md', 'x\n');
    write('docs/TRD/INDEX.md', '- docs/old.md\n');
    write('.trd-state/_docs-audit/runs/r.md', 'removed docs/old.md\n');
    commitAll('init');
    const out = run(assemblyFor({ 'docs/old.md': 'loose' }), [remove('docs/old.md')]);
    expect(out.removed.map((r) => r.path)).toEqual(['docs/old.md']);
  });

  it('blocks a candidate referenced by a blocked candidate (fixed point)', () => {
    write('docs/a.md', 'plain\n');
    write('docs/b.md', 'refers to docs/a.md\n');
    write('src/use.js', "require('docs/b.md')\n");
    commitAll('init');
    const out = run(assemblyFor({ 'docs/a.md': 'loose', 'docs/b.md': 'loose' }), [remove('docs/a.md'), remove('docs/b.md')]);
    expect(out.removed).toEqual([]);
    expect(out.blocked.map((b) => b.path)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('writes a recovery record with path, last commit and reason, and stages the deletion', () => {
    write('docs/gone.md', 'x\n');
    commitAll('add');
    const sha = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
    const out = run(assemblyFor({ 'docs/gone.md': 'loose' }), [remove('docs/gone.md', 'describes nothing that exists')]);
    expect(out.removed).toEqual([{ path: 'docs/gone.md', lastCommit: sha, reason: 'describes nothing that exists' }]);
    expect(git(repo, ['diff', '--cached', '--name-status']).stdout.trim()).toBe('D\tdocs/gone.md');
  });
});

describe('CLI', () => {
  it('writes the applied file and exits 0; exits 2 on bad usage and bad input', () => {
    write('docs/a.md', 'a\n');
    commitAll('init');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dabs-cli-'));
    const f = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p; };
    const asm = f('asm.json', assemblyFor({ 'docs/a.md': 'loose' }));
    const res = f('res.json', { batch: { key: 'loose:docs', chunk: 1 }, records: [rec('docs/a.md')] });
    const outFile = path.join(dir, 'applied.json');
    const argv = ['apply', '--repo', repo, '--assembly', asm, '--result', res, '--out', outFile];
    const write_ = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(main(argv)).toBe(0);
      expect(JSON.parse(fs.readFileSync(outFile, 'utf8')).edited).toEqual([]);
      expect(main(['nope'])).toBe(2);
      expect(main(['apply', '--repo', repo, '--assembly', path.join(dir, 'missing.json'), '--result', res, '--out', outFile])).toBe(2);
    } finally {
      write_.mockRestore(); err.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs as a script', () => {
    const r = spawnSync('node', [path.join(__dirname, 'docs-audit-apply.js'), 'apply'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/);
  });
});
