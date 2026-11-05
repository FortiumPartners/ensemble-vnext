'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const dm = require('./design-map');

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, ...args) => spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dmap-'));

const board = (o) => ({ id: '01-a', file: '01-a.dc.html', kind: 'to-be', replaces: null, platform: 'web', viewport: [800, 600], route: '/', states: {}, components: [], parts: [], links: [], brief_items: [], status: 'draft', trd: null, shipped_commit: null, ...o });
const mapOf = (boards, extra = {}) => ({ canvases: [{ url: 'u1', version: '1', synced_at: 'x', files: {} }], design_system: { url: 'd', version: '1', code_commit: 'abc', paths: ['src/ds'] }, boards, ...extra });

describe('derive', () => {
  const src = `<x-import component-from-global-scope="Ds.Button" name="b"></x-import>
    <x-import component-from-global-scope="Ds.Card"></x-import><x-import component-from-global-scope="Ds.Button"></x-import>
    <dc-import src="parts/nav-bar.dc.html"></dc-import>
    <a href="02-b.dc.html">go</a><a href="https://x.com">out</a><a href="02-b.dc.html#top">again</a><a href="nope.dc.html">n</a>`;
  it('reads components, parts, links in first-appearance order without duplicates', () => {
    expect(dm.derive(src, { '02-b.dc.html': '02-b' })).toEqual({
      components: ['Ds.Button', 'Ds.Card'], parts: ['nav-bar'], links: ['02-b'],
    });
  });
  it('returns empty lists for a bare board', () => {
    expect(dm.derive('<div></div>', {})).toEqual({ components: [], parts: [], links: [] });
  });
});

describe('validate', () => {
  it('accepts a good map', () => expect(dm.validate(mapOf([board()]))).toEqual([]));
  it('flags kind, status, missing field, bad canvas, empty paths', () => {
    const m = mapOf([board({ kind: 'x', status: 'y', canvas: 'zzz' }), board({ id: '02', platform: undefined })]);
    m.design_system.paths = [];
    const e = dm.validate(m).join('\n');
    expect(e).toMatch(/unknown kind x/);
    expect(e).toMatch(/unknown status y/);
    expect(e).toMatch(/names no listed canvas/);
    expect(e).toMatch(/missing platform/);
    expect(e).toMatch(/design_system.paths/);
  });
  it('requires canvas with two canvases and accepts two valid canvases', () => {
    const m = mapOf([board({ canvas: 'u1' }), board({ id: '02', canvas: 'u2' })]);
    m.canvases.push({ url: 'u2', version: '1', synced_at: 'x', files: {} });
    expect(dm.validate(m)).toEqual([]);
    delete m.boards[0].canvas;
    expect(dm.validate(m).join()).toMatch(/canvas is required/);
  });
  it('rejects a non-object', () => expect(dm.validate(null)).toHaveLength(1));
});

describe('transition', () => {
  const m = mapOf([board()]);
  it('draft -> approved sets approved_commit; re-approval updates it', () => {
    const a = dm.transition(m, ['01-a'], 'approved', { commit: 'c1' });
    expect(a.boards[0]).toMatchObject({ status: 'approved', approved_commit: 'c1' });
    expect(dm.transition(a, ['01-a'], 'approved', { commit: 'c2' }).boards[0].approved_commit).toBe('c2');
    expect(m.boards[0].status).toBe('draft'); // pure
  });
  it('approved -> building -> shipped', () => {
    const a = dm.transition(m, ['01-a'], 'approved', { commit: 'c1' });
    const b = dm.transition(a, ['01-a'], 'building', { trd: 'docs/TRD/x.md' });
    expect(b.boards[0]).toMatchObject({ status: 'building', trd: 'docs/TRD/x.md' });
    expect(dm.transition(b, ['01-a'], 'shipped', { commit: 's' }).boards[0]).toMatchObject({ status: 'shipped', shipped_commit: 's' });
  });
  it('any status -> superseded', () => {
    expect(dm.transition(m, ['01-a'], 'superseded').boards[0].status).toBe('superseded');
  });
  it('throws on an illegal move naming board and statuses', () => {
    expect(() => dm.transition(m, ['01-a'], 'shipped', {})).toThrow(/01-a.*draft -> shipped/);
    expect(() => dm.transition(m, ['01-a'], 'building', {})).toThrow(/illegal/);
    expect(() => dm.transition(m, ['01-a'], 'draft')).toThrow(/cannot move/);
    expect(() => dm.transition(m, ['nope'], 'approved')).toThrow(/no board/);
  });
});

describe('approved', () => {
  it('returns only approved to-be boards', () => {
    const m = mapOf([board({ status: 'approved' }), board({ id: '2', status: 'draft' }), board({ id: '3', kind: 'as-is', status: 'approved' })]);
    expect(dm.approved(m).map((b) => b.id)).toEqual(['01-a']);
  });
});

describe('held', () => {
  it('holds an approved board whose source embeds a draft part, even with no derived parts', () => {
    const dir = tmp();
    const m = mapOf([
      board({ id: '01-settings', file: '01-settings.dc.html', status: 'approved' }),
      board({ id: 'toggle', file: 'part-toggle.dc.html', kind: 'part', status: 'draft' }),
      board({ id: '02-home', file: '02-home.dc.html', status: 'approved' }),
    ]);
    fs.mkdirSync(path.join(dir, 'canvas/project'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'canvas/project/01-settings.dc.html'), '<x-part src="part-toggle.dc.html"></x-part>');
    fs.writeFileSync(path.join(dir, 'canvas/project/02-home.dc.html'), '<div></div>');
    expect(dm.held(m, dir)).toEqual([{ id: '01-settings', draft_parts: ['toggle'] }]);
  });
  it('holds nothing once the part is approved, and matches derived parts by file stem', () => {
    const dir = tmp();
    const parts = [board({ id: 'nav', file: 'nav-bar.dc.html', kind: 'part', status: 'draft' })];
    expect(dm.held(mapOf([board({ status: 'approved', parts: ['nav-bar'] }), ...parts]), dir)).toEqual([{ id: '01-a', draft_parts: ['nav'] }]);
    parts[0].status = 'approved';
    expect(dm.held(mapOf([board({ status: 'approved', parts: ['nav-bar'] }), ...parts]), dir)).toEqual([]);
  });
  it('does not match a draft part file name inside a longer one', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'canvas/project'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'canvas/project/01-a.dc.html'), '<x-part src="part-toggle.dc.html"></x-part>');
    const m = mapOf([
      board({ id: '01-a', file: '01-a.dc.html', status: 'approved' }),
      board({ id: 'toggle', file: 'toggle.dc.html', kind: 'part', status: 'draft' }),
      board({ id: 'part-toggle', file: 'part-toggle.dc.html', kind: 'part', status: 'approved' }),
    ]);
    expect(dm.held(m, dir)).toEqual([]);
  });
  it('follows parts transitively: an approved part embedding a draft part holds the board', () => {
    const dir = tmp();
    const m = mapOf([
      board({ id: '01-a', status: 'approved', parts: ['card'] }),
      board({ id: 'card', file: 'card.dc.html', kind: 'part', status: 'approved', parts: ['badge'] }),
      board({ id: 'badge', file: 'badge.dc.html', kind: 'part', status: 'draft' }),
    ]);
    expect(dm.held(m, dir)).toEqual([{ id: '01-a', draft_parts: ['badge'] }]);
  });
  it('with ids, checks the named boards whatever their status (a draft board before approval)', () => {
    const dir = tmp();
    const m = mapOf([
      board({ id: '01-a', status: 'draft', parts: ['nav'] }),
      board({ id: '02-b', file: '02-b.dc.html', status: 'draft' }),
      board({ id: 'nav', file: 'nav.dc.html', kind: 'part', status: 'draft' }),
    ]);
    expect(dm.held(m, dir)).toEqual([]);
    expect(dm.held(m, dir, ['01-a', '02-b'])).toEqual([{ id: '01-a', draft_parts: ['nav'] }]);
  });
  it('with a part among the ids, still follows that part transitively for a later board', () => {
    const dir = tmp();
    const m = mapOf([
      board({ id: 'shell', file: 'shell.dc.html', kind: 'part', status: 'approved', parts: ['nav'] }),
      board({ id: '01-a', status: 'draft', parts: ['shell'] }),
      board({ id: 'nav', file: 'nav.dc.html', kind: 'part', status: 'draft' }),
    ]);
    expect(dm.held(m, dir, ['shell', '01-a'])).toEqual([
      { id: 'shell', draft_parts: ['nav'] },
      { id: '01-a', draft_parts: ['nav'] },
    ]);
  });
});

describe('buildable (AC-F9.4: invocation is approval)', () => {
  const m = () => mapOf([
    board({ id: '01-a', status: 'draft' }),
    board({ id: '02-b', file: '02-b.dc.html', status: 'approved' }),
    board({ id: '03-c', file: '03-c.dc.html', status: 'building' }),
    board({ id: '04-d', file: '04-d.dc.html', status: 'shipped' }),
    board({ id: '05-e', file: '05-e.dc.html', kind: 'as-is', status: 'draft' }),
    board({ id: 'p', file: 'p.dc.html', kind: 'part', status: 'draft' }),
  ]);
  it('lists draft and approved to-be boards only', () => {
    expect(dm.buildable(m()).map((b) => b.id)).toEqual(['01-a', '02-b']);
  });
  it('limits to the named ids, dropping a named board that is not buildable', () => {
    expect(dm.buildable(m(), ['01-a', '03-c', '05-e']).map((b) => b.id)).toEqual(['01-a']);
  });
  it('a draft board an invocation names can be approved (recording the commit) and then moved to building', () => {
    const approved = dm.transition(m(), ['01-a'], 'approved', { commit: 'abc123' });
    const b = approved.boards.find((x) => x.id === '01-a');
    expect(b).toMatchObject({ status: 'approved', approved_commit: 'abc123' });
    const building = dm.transition(approved, ['01-a'], 'building', { trd: 'docs/TRD/x.md' });
    expect(building.boards.find((x) => x.id === '01-a')).toMatchObject({ status: 'building', approved_commit: 'abc123', trd: 'docs/TRD/x.md' });
  });
});

describe('read / refresh / write', () => {
  it('reads back a two-canvas map and refresh only touches derived fields', () => {
    const dir = tmp();
    const m = mapOf([board({ canvas: 'u1', status: 'approved' }), board({ id: '02-b', file: '02-b.dc.html', canvas: 'u2' })]);
    m.canvases.push({ url: 'u2', version: '1', synced_at: 'x', files: {}, dir: 'other' });
    dm.write(dir, m);
    fs.mkdirSync(path.join(dir, 'canvas/project'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'other'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'canvas/project/01-a.dc.html'), '<x-import component-from-global-scope="Ds.B"></x-import><a href="02-b.dc.html">x</a>');
    expect(dm.validate(dm.read(dir))).toEqual([]);
    const r = dm.refresh(dir);
    expect(r.boards[0]).toMatchObject({ components: ['Ds.B'], links: ['02-b'], status: 'approved' });
    expect(r.boards[1].components).toEqual([]); // source missing: untouched
  });
  it('malformed JSON throws naming the file and does not rewrite it', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'design-map.json'), '{bad');
    expect(() => dm.read(dir)).toThrow(/design-map\.json/);
    expect(fs.readFileSync(path.join(dir, 'design-map.json'), 'utf8')).toBe('{bad');
  });
});

describe('stale', () => {
  let repo; let c1;
  beforeEach(() => {
    repo = tmp();
    sh(repo, 'init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(repo, 'src/ds'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src/ds/a.ts'), '1');
    sh(repo, 'add', '.'); sh(repo, 'commit', '-qm', 'one');
    c1 = sh(repo, 'rev-parse', 'HEAD').stdout.trim();
  });
  const m = () => { const x = mapOf([board()]); x.design_system.code_commit = c1; return x; };

  it('is not stale with no change under paths', () => {
    fs.writeFileSync(path.join(repo, 'other.txt'), 'x'); sh(repo, 'add', '.'); sh(repo, 'commit', '-qm', 'two');
    expect(dm.stale(m(), repo)).toMatchObject({ stale: false, changed_paths: [] });
  });
  it('lists changed paths once each', () => {
    fs.writeFileSync(path.join(repo, 'src/ds/a.ts'), '2'); sh(repo, 'commit', '-qam', 'two');
    fs.writeFileSync(path.join(repo, 'src/ds/a.ts'), '3'); sh(repo, 'commit', '-qam', 'three');
    expect(dm.stale(m(), repo)).toMatchObject({ stale: true, changed_paths: ['src/ds/a.ts'] });
  });
  it('unknown code_commit is stale with null paths and a reason', () => {
    const x = m(); x.design_system.code_commit = 'deadbeef00000000000000000000000000000000';
    const r = dm.stale(x, repo);
    expect(r.stale).toBe(true); expect(r.changed_paths).toBeNull(); expect(r.reason).toMatch(/not found/);
  });
  it('--record writes drift', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(repo, 'src/ds/a.ts'), '2'); sh(repo, 'commit', '-qam', 'two');
    dm.write(dir, m());
    dm.stale(dm.read(dir), repo, { record: true, dir });
    expect(dm.read(dir).design_system.drift).toMatchObject({ changed_paths: ['src/ds/a.ts'] });
  });
});

describe('setup', () => {
  const proj = (rules, tpl) => {
    const d = tmp();
    if (rules !== undefined) { fs.mkdirSync(path.join(d, '.claude/rules'), { recursive: true }); fs.writeFileSync(path.join(d, '.claude/rules/design.md'), rules); }
    if (tpl !== undefined) { fs.mkdirSync(path.join(d, '.claude/skills/design-setup'), { recursive: true }); fs.writeFileSync(path.join(d, '.claude/skills/design-setup/template.md'), tpl); }
    return d;
  };
  it('missing', () => expect(dm.setup(proj(undefined, 'T'))).toBe('missing'));
  it('unfilled for a copy of the template (line endings and trim ignored)', () => expect(dm.setup(proj('T\r\nx\r\n', ' T\nx'))).toBe('unfilled'));
  it('filled otherwise', () => {
    expect(dm.setup(proj('mine', 'T'))).toBe('filled');
    expect(dm.setup(proj('mine'))).toBe('filled');
  });
});

describe('CLI', () => {
  const cli = (cwd, ...args) => spawnSync('node', [path.join(__dirname, 'design-map.js'), ...args], { cwd, env: ENV, encoding: 'utf8' });
  it('transition resolves HEAD itself; errors exit 1', () => {
    const repo = tmp();
    sh(repo, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(repo, 'f'), '1'); sh(repo, 'add', '.'); sh(repo, 'commit', '-qm', 'x');
    const head = sh(repo, 'rev-parse', 'HEAD').stdout.trim();
    fs.mkdirSync(path.join(repo, 'd')); dm.write(path.join(repo, 'd'), mapOf([board()]));
    const ok = cli(repo, 'transition', '--dir', 'd', '--ids', '01-a', '--to', 'approved');
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).boards[0].approved_commit).toBe(head);
    expect(JSON.parse(cli(repo, 'approved', '--dir', 'd').stdout)).toHaveLength(1);
    expect(JSON.parse(cli(repo, 'validate', '--dir', 'd').stdout)).toEqual([]);
    expect(JSON.parse(cli(repo, 'stale', '--record', '--dir', 'd').stdout).head).toBe(head);
    expect(JSON.parse(cli(repo, 'read', '--dir', 'd').stdout).boards).toHaveLength(1);
    expect(JSON.parse(cli(repo, 'setup').stdout)).toBe('missing');
    const bad = cli(repo, 'transition', '--dir', 'd', '--ids', '01-a', '--to', 'shipped');
    expect(bad.status).toBe(1); expect(bad.stderr).toMatch(/^design-map\.js:/);
    expect(cli(repo, 'bogus', '--dir', 'd').status).toBe(1);
    expect(cli(repo, 'read').status).toBe(1);
  });
});
