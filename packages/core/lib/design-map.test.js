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

describe('validate: brief_items (D3, D16)', () => {
  it.each([['a string', 'S1'], ['an array of numbers', [1]], ['null', null], ['an object', {}]])('rejects a board brief_items that is %s, naming the board', (_n, v) => {
    expect(dm.validate(mapOf([board({ id: 'zed', brief_items: v })])).join()).toMatch(/board zed: brief_items must be an array of strings/);
  });
  it('accepts absent and empty', () => {
    const b = board(); delete b.brief_items;
    expect(dm.validate(mapOf([b, board({ id: '02', brief_items: [] }), board({ id: '03', brief_items: ['S1'] })]))).toEqual([]);
  });
  it('with a top-level item list: rejects a duplicate id and a board id not in the list', () => {
    const list = [{ id: 'S1', source: 'a' }, { id: 'S1', source: 'b' }];
    expect(dm.validate(mapOf([board()], { brief_items: list })).join()).toMatch(/duplicate brief item id S1/);
    const e = dm.validate(mapOf([board({ id: 'x', brief_items: ['S1', 'S9'] })], { brief_items: [{ id: 'S1', source: 'a' }] })).join();
    expect(e).toMatch(/board x: brief_items names S9/);
    expect(e).not.toMatch(/S1 which|names S1/);
  });
  it('rejects a top-level list that is not an array of { id }', () => {
    expect(dm.validate(mapOf([board()], { brief_items: 'S1' })).join()).toMatch(/brief_items must be an array of \{ id, source \}/);
    expect(dm.validate(mapOf([board()], { brief_items: [{ source: 'x' }] })).join()).toMatch(/brief_items must be an array of \{ id, source \}/);
  });
  it('a valid list with matching boards passes', () => {
    expect(dm.validate(mapOf([board({ brief_items: ['S1'] })], { brief_items: [{ id: 'S1', source: 'a' }] }))).toEqual([]);
  });
});

describe('buildableByItems (D4, D5)', () => {
  const m = (extra) => {
    const nb = board({ id: 'nofield', file: 'nofield.dc.html' }); delete nb.brief_items;
    return mapOf([
      board({ id: 'a', file: 'a.dc.html', status: 'draft', brief_items: ['S1', 'S2'] }),
      board({ id: 'b', file: 'b.dc.html', status: 'approved', brief_items: ['S2', 'S3'] }),
      board({ id: 'c', file: 'c.dc.html', status: 'building', brief_items: ['S4'] }),
      board({ id: 'asis', file: 'asis.dc.html', kind: 'as-is', brief_items: ['S5'] }),
      nb,
    ], extra);
  };
  const ids = (r) => r.boards.map((b) => b.id);
  it('returns only buildable to-be boards recording a named item', () => {
    expect(ids(dm.buildableByItems(m(), ['S2']))).toEqual(['a', 'b']);
    expect(ids(dm.buildableByItems(m(), ['S1']))).toEqual(['a']);
  });
  it('--ids intersects', () => {
    expect(ids(dm.buildableByItems(m(), ['S2'], ['b', 'c']))).toEqual(['b']);
  });
  it('an item served only by a building board is unmatched with its server and status', () => {
    expect(dm.buildableByItems(m(), ['S4']).unmatched).toEqual([{ item: 'S4', served_by: [{ id: 'c', status: 'building' }] }]);
  });
  it('an item no board records has empty served_by', () => {
    expect(dm.buildableByItems(m(), ['S9']).unmatched).toEqual([{ item: 'S9', served_by: [] }]);
  });
  it('served_by lists boards of any kind', () => {
    expect(dm.buildableByItems(m(), ['S5']).unmatched[0].served_by).toEqual([{ id: 'asis', status: 'draft' }]);
  });
  it('a board with no brief_items field is never returned', () => {
    const r = dm.buildableByItems(m(), ['S1', 'S2', 'S3']);
    expect(ids(r)).not.toContain('nofield');
    expect(r.unmatched).toEqual([]);
  });
  it('buildable stays an array and is not narrowed by this function', () => {
    expect(Array.isArray(dm.buildable(m()))).toBe(true);
  });
  it('with a top-level list, flags an unknown item known: false and leaves known items known', () => {
    const r = dm.buildableByItems(m({ brief_items: [{ id: 'S4', source: 'x' }, { id: 'S6', source: 'y' }] }), ['S4', 'S6', 'S9']);
    expect(r.unmatched).toEqual([
      { item: 'S4', served_by: [{ id: 'c', status: 'building' }], known: true },
      { item: 'S6', served_by: [], known: true },
      { item: 'S9', served_by: [], known: false },
    ]);
  });
  it('without a top-level list, entries carry no known field', () => {
    expect(dm.buildableByItems(m(), ['S9']).unmatched[0]).not.toHaveProperty('known');
  });
});

describe('CLI buildable --items', () => {
  const cli = (cwd, ...args) => spawnSync('node', [path.join(__dirname, 'design-map.js'), ...args], { cwd, env: ENV, encoding: 'utf8' });
  const repo = () => {
    const r = tmp(); fs.mkdirSync(path.join(r, 'd', 'canvas', 'project'), { recursive: true });
    fs.writeFileSync(path.join(r, 'd', 'canvas', 'project', 'a.dc.html'), '<dc-import src="parts/p.dc.html"></dc-import>');
    fs.writeFileSync(path.join(r, 'd', 'canvas', 'project', 'b.dc.html'), '<div></div>');
    fs.writeFileSync(path.join(r, 'd', 'canvas', 'project', 'p.dc.html'), '<div></div>');
    dm.write(path.join(r, 'd'), mapOf([
      board({ id: 'a', file: 'a.dc.html', brief_items: ['S1'] }),
      board({ id: 'b', file: 'b.dc.html', brief_items: ['S2'] }),
      board({ id: 'p', file: 'p.dc.html', kind: 'part', brief_items: [] }),
    ]));
    return r;
  };
  it('prints { boards, unmatched, held } and names a returned board that embeds a draft part', () => {
    const r = repo();
    const o = cli(r, 'buildable', '--dir', 'd', '--items', 'S1,S2,S9');
    expect(o.status).toBe(0);
    const out = JSON.parse(o.stdout);
    expect(out.boards.map((b) => b.id)).toEqual(['a', 'b']);
    expect(out.unmatched).toEqual([{ item: 'S9', served_by: [] }]);
    expect(out.held).toEqual([{ id: 'a', draft_parts: ['p'] }]);
  });
  it('--items with --ids intersects', () => {
    const out = JSON.parse(cli(repo(), 'buildable', '--dir', 'd', '--items', 'S1,S2', '--ids', 'b').stdout);
    expect(out.boards.map((b) => b.id)).toEqual(['b']);
    expect(out.held).toEqual([]);
  });
  it.each([[''], [','], [' , ']])('--items %j exits 1 and never falls through to plain buildable', (v) => {
    const o = cli(repo(), 'buildable', '--dir', 'd', '--items', v);
    expect(o.status).toBe(1);
    expect(o.stderr).toMatch(/^design-map\.js: .*--items/);
    expect(o.stdout).toBe('');
  });
  it('--items with no value exits 1', () => {
    expect(cli(repo(), 'buildable', '--dir', 'd', '--items').status).toBe(1);
  });
  it('buildable without --items still prints an array', () => {
    const out = JSON.parse(cli(repo(), 'buildable', '--dir', 'd').stdout);
    expect(Array.isArray(out)).toBe(true);
    expect(out.map((b) => b.id)).toEqual(['a', 'b']);
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

describe('setup, prior templates (D6)', () => {
  const crypto = require('crypto');
  const SHIPPED = path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'design.md');
  it('the shipped template is unfilled against the project copy of itself', () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, '.claude/rules'), { recursive: true });
    fs.mkdirSync(path.join(d, '.claude/skills/design-setup'), { recursive: true });
    const tplNow = fs.readFileSync(SHIPPED, 'utf8');
    fs.writeFileSync(path.join(d, '.claude/rules/design.md'), tplNow);
    fs.writeFileSync(path.join(d, '.claude/skills/design-setup/template.md'), tplNow);
    expect(dm.setup(d)).toBe('unfilled');
  });
  it('matches by sha256 of the normalised text', () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, '.claude/rules'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude/rules/design.md'), 'filled by owner');
    expect(dm.setup(d)).toBe('filled');
    expect(crypto.createHash('sha256').update('x').digest('hex')).toHaveLength(64);
  });
  it('a design.md holding the pre-direction template reads unfilled (fixture, not git history)', () => {
    const old = fs.readFileSync(path.join(__dirname, '__fixtures__', 'design', 'design-template-pre-direction.md'), 'utf8');
    expect(old).not.toContain('5. Design direction');
    // The fixture is the template as shipped before section 5; its hash must be the recorded one.
    expect(crypto.createHash('sha256').update(old.replace(/\r\n/g, '\n').trim()).digest('hex'))
      .toBe('6a89c44e9481dabcb0646be3e6a4687b72b4b83544d7b2dc39353337178b0496');
    const d = tmp();
    fs.mkdirSync(path.join(d, '.claude/rules'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude/rules/design.md'), old.replace(/\n/g, '\r\n'));
    expect(dm.setup(d)).toBe('unfilled');
  });
  it('an old template with an owner edit reads filled', () => {
    const old = fs.readFileSync(path.join(__dirname, '__fixtures__', 'design', 'design-template-pre-direction.md'), 'utf8');
    const d = tmp();
    fs.mkdirSync(path.join(d, '.claude/rules'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude/rules/design.md'), old + '\n- own rule\n');
    expect(dm.setup(d)).toBe('filled');
  });
});

describe('direction', () => {
  const FILLED = [
    '# Design', '', '## 4. Design rules', '',
    '- **Reuse:** x', '- **Accessibility floor:** contrast 4.5:1, touch targets 44 px', '- **Process rules:** y', '',
  ];
  const sect5 = (rows) => ['## 5. Design direction', '', '| Field | Value |', '|---|---|',
    `| Brand (voice) | ${rows.brand || ''} |`, `| Style pack (a skill) | ${rows.pack || ''} |`,
    `| References (any) | ${rows.refs || ''} |`, `| Departure latitude (\`keep\`) | ${rows.lat || ''} |`, ''];
  const project = (lines, { packs = ['style-pack-a', 'style-pack-b'], skillsDir = 'packages/skills', roles } = {}) => {
    const d = tmp();
    fs.mkdirSync(path.join(d, '.claude/rules'), { recursive: true });
    fs.writeFileSync(path.join(d, '.claude/rules/design.md'), lines.join('\n'));
    for (const p of packs) { fs.mkdirSync(path.join(d, skillsDir, p), { recursive: true }); fs.writeFileSync(path.join(d, skillsDir, p, 'SKILL.md'), 'x'); }
    if (roles) {
      fs.mkdirSync(path.join(d, skillsDir), { recursive: true });
      fs.writeFileSync(path.join(d, skillsDir, 'framework-skills.txt'), roles);
      for (const l of roles.split('\n')) { const n = l.split(/\s+/)[0]; if (n && !n.startsWith('#') && !n.startsWith('style-pack')) { fs.mkdirSync(path.join(d, skillsDir, n), { recursive: true }); fs.writeFileSync(path.join(d, skillsDir, n, 'SKILL.md'), 'x'); } }
    }
    return d;
  };
  it('all four fields blank on a pre-release design.md; latitude refine', () => {
    const r = dm.direction(project(FILLED));
    expect(r.blank).toEqual(['brand', 'style_pack', 'references', 'departure_latitude']);
    expect(r.latitude).toBe('refine');
    expect(r.text).toBe('');
    expect(r.available_packs).toEqual(['style-pack-a', 'style-pack-b']);
  });
  it('reads filled fields and the latitude', () => {
    const r = dm.direction(project([...FILLED, ...sect5({ brand: 'warm', pack: 'style-pack-a', refs: 'Linear', lat: '`rethink`' })]));
    expect(r.fields).toEqual({ brand: 'warm', style_pack: 'style-pack-a', references: 'Linear', departure_latitude: '`rethink`' });
    expect(r.blank).toEqual([]);
    expect(r.latitude).toBe('rethink');
    expect(r.style_pack).toEqual({ name: 'style-pack-a', path: path.join('packages/skills', 'style-pack-a', 'SKILL.md'), missing: false });
    expect(r.text).toContain('## 5. Design direction');
  });
  it('unknown latitude falls back to refine and is listed as blank', () => {
    const r = dm.direction(project([...FILLED, ...sect5({ brand: 'b', pack: 'style-pack-a', refs: 'r', lat: 'wild' })]));
    expect(r.latitude).toBe('refine');
    expect(r.blank).toEqual(['departure_latitude (unrecognised)']);
  });
  it('parses the floor from "contrast 4.5:1, touch targets 44 px"', () => {
    const r = dm.direction(project(FILLED));
    expect(r.floor).toEqual({ contrast: 4.5, target: 44 });
    expect(r.floor_blank).toBe(false);
  });
  it('a style pack given as `style` is not reported blank; a fractional target is read whole', () => {
    const d = project([...FILLED.map((l) => (/Accessibility/.test(l) ? '- **Accessibility floor:** contrast 4.5:1, targets 24.5 px' : l)), ...sect5({ brand: 'b', refs: 'r', lat: 'keep' })]);
    const r = dm.direction(d, { style: 'style-pack-b' });
    expect(r.blank).toEqual([]);
    expect(r.style_pack.name).toBe('style-pack-b');
    expect(r.floor.target).toBe(24.5);
  });
  it('an unparseable floor line is floor_blank', () => {
    const r = dm.direction(project(FILLED.map((l) => (/Accessibility/.test(l) ? '- **Accessibility floor:** (the owner\'s answer, recorded by `/design-setup`)' : l))));
    expect(r.floor).toEqual({ contrast: null, target: null });
    expect(r.floor_blank).toBe(true);
  });
  it('--style overrides the field; a missing pack is flagged', () => {
    const d = project([...FILLED, ...sect5({ pack: 'style-pack-a' })]);
    expect(dm.direction(d, { style: 'style-pack-b' }).style_pack.name).toBe('style-pack-b');
    const m = dm.direction(d, { style: 'style-pack-zzz' });
    expect(m.style_pack).toEqual({ name: 'style-pack-zzz', path: null, missing: true });
  });
  it('craft lists design-role skills and excludes style-pack-*', () => {
    const d = project(FILLED, { roles: 'frontend-design design\nstyle-pack-a design\nverify-x check\n' });
    expect(dm.direction(d).craft).toEqual([path.join('packages/skills', 'frontend-design', 'SKILL.md')]);
  });
  it('falls back past a skills dir holding no pack', () => {
    const d = project(FILLED, { packs: [] });
    fs.mkdirSync(path.join(d, '.claude/skills/jest'), { recursive: true });
    fs.mkdirSync(path.join(d, 'packages/skills/style-pack-q'), { recursive: true });
    fs.writeFileSync(path.join(d, 'packages/skills/style-pack-q/SKILL.md'), 'x');
    expect(dm.direction(d).available_packs).toEqual(['style-pack-q']);
  });
  it('throws on a missing or unfilled design.md', () => {
    expect(() => dm.direction(tmp())).toThrow(/missing/);
  });
  it('CLI: direction runs without --dir', () => {
    const d = project(FILLED);
    const r = spawnSync('node', [path.join(__dirname, 'design-map.js'), 'direction', '--style', 'style-pack-b'], { cwd: d, env: ENV, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).style_pack.name).toBe('style-pack-b');
  });
});

describe('AC-N2: nothing in the framework writes rules/design.md', () => {
  it('no write call names the design.md rules path under commands, workflows, lib or contracts', () => {
    const base = path.join(__dirname, '..');
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__fixtures__') walk(p); } else if (/\.(js|md|sh)$/.test(e.name) && !/\.test\.js$/.test(e.name)) files.push(p); } };
    for (const sub of ['commands', 'workflows', 'lib', 'contracts']) walk(path.join(base, sub));
    const writer = /(writeFile(Sync)?|appendFile(Sync)?|copyFile(Sync)?|rename(Sync)?|unlink(Sync)?|rmSync)\s*\([^)]*(DESIGN_RULES|rules[/'", ]+design\.md)/;
    const offenders = files.filter((f) => writer.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
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

describe('unsynced', () => {
  const project = () => {
    const root = tmp();
    const put = (name, boards) => {
      const d = path.join(root, 'docs', 'ui', name);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'design-map.json'), JSON.stringify(mapOf(boards)));
    };
    const close = (f) => {
      fs.mkdirSync(path.join(root, '.trd-state', f), { recursive: true });
      fs.writeFileSync(path.join(root, '.trd-state', f, 'closed.json'), '{}');
    };
    return { root, put, close };
  };
  const b = (id, o) => board({ id, file: `${id}.dc.html`, status: 'building', trd: 'docs/TRD/done.md', ...o });

  it('lists only closed-feature building to-be boards with a trd', () => {
    const { root, put, close } = project();
    close('done');
    put('one', [
      b('01'), b('02', { trd: 'docs/TRD/open.md' }), b('03', { status: 'approved' }), b('04', { status: 'shipped' }),
      b('05', { kind: 'as-is' }), b('06', { trd: null }), b('07', { trd: undefined }),
    ]);
    expect(dm.unsyncedAll(root)).toEqual([{ design: 'one', id: '01', trd: 'docs/TRD/done.md' }]);
  });
  it('scans two designs, sets design, and skips a folder with no map', () => {
    const { root, put, close } = project();
    close('done');
    put('a', [b('01')]);
    put('b', [b('02')]);
    fs.mkdirSync(path.join(root, 'docs', 'ui', '_current'));
    expect(dm.unsyncedAll(root).map((e) => `${e.design}/${e.id}`)).toEqual(['a/01', 'b/02']);
  });
  it('gives [] when there is no docs/ui folder', () => expect(dm.unsyncedAll(tmp())).toEqual([]));
  it('--trd matches by feature name across path spellings and filters others out', () => {
    const { root, put, close } = project();
    close('done'); close('other');
    put('a', [b('01'), b('02', { trd: 'docs/TRD/other.md' })]);
    for (const spelling of ['./docs/TRD/done.md', path.join(root, 'docs/TRD/done.md'), 'docs/TRD/done.md']) {
      expect(dm.unsyncedAll(root, { trd: spelling }).map((e) => e.id)).toEqual(['01']);
    }
  });
  it('single design via the CLI verb, and --all via the CLI', () => {
    const { root, put, close } = project();
    close('done');
    put('a', [b('01')]);
    const script = path.join(__dirname, 'design-map.js');
    const run = (...a) => spawnSync('node', [script, 'unsynced', ...a], { cwd: root, encoding: 'utf8' });
    expect(JSON.parse(run('--dir', 'docs/ui/a').stdout)).toEqual([{ design: 'a', id: '01', trd: 'docs/TRD/done.md' }]);
    expect(JSON.parse(run('--all').stdout)).toHaveLength(1);
    expect(JSON.parse(run('--all', '--trd', 'docs/TRD/nope.md').stdout)).toEqual([]);
    expect(run().status).toBe(1);
  });
});

describe('unsynced --merged-into', () => {
  // A real repository: main holds the audited commit of "merged", a side branch holds "unmerged".
  const fixture = () => {
    const root = tmp();
    sh(root, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(root, 'a.txt'), '1');
    sh(root, 'add', '-A'); sh(root, 'commit', '-qm', 'base');
    const base = sh(root, 'rev-parse', 'HEAD').stdout.trim();
    sh(root, 'checkout', '-q', '-b', 'side');
    fs.writeFileSync(path.join(root, 'b.txt'), '2');
    sh(root, 'add', '-A'); sh(root, 'commit', '-qm', 'side work');
    const side = sh(root, 'rev-parse', 'HEAD').stdout.trim();
    sh(root, 'checkout', '-q', 'main');
    const put = (name, boards) => {
      const d = path.join(root, 'docs', 'ui', name);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'design-map.json'), JSON.stringify(mapOf(boards)));
    };
    const close = (f, audit) => {
      fs.mkdirSync(path.join(root, '.trd-state', f), { recursive: true });
      fs.writeFileSync(path.join(root, '.trd-state', f, 'closed.json'), JSON.stringify({ feature: f, audit }));
    };
    const b = (id, f) => board({ id, file: `${id}.dc.html`, status: 'building', trd: `docs/TRD/${f}.md` });
    return { root, base, side, put, close, b };
  };
  const ids = (list) => list.map((e) => e.id);

  it('lists a board whose audited commit is an ancestor of the ref, and not one that is not', () => {
    const { root, base, side, put, close, b } = fixture();
    close('merged', { auditedCommit: base.slice(0, 7) }); // short id, as every real record has
    close('unmerged', { auditedCommit: side });
    put('d', [b('01', 'merged'), b('02', 'unmerged')]);
    expect(ids(dm.unsyncedAll(root, { mergedInto: 'main' }))).toEqual(['01']);
  });
  it('lists a squash-merged feature with --merged-head and not without it', () => {
    const { root, side, put, close, b } = fixture();
    close('sq', { auditedCommit: side });
    put('d', [b('01', 'sq')]);
    expect(dm.unsyncedAll(root, { mergedInto: 'main' })).toEqual([]);
    expect(ids(dm.unsyncedAll(root, { mergedInto: 'main', mergedHead: side }))).toEqual(['01']);
  });
  it('does not list a feature with "audit": null, no audit key, or an unknown commit', () => {
    const { root, put, close, b } = fixture();
    close('n', null);
    fs.mkdirSync(path.join(root, '.trd-state', 'bare'), { recursive: true });
    fs.writeFileSync(path.join(root, '.trd-state', 'bare', 'closed.json'), '{}');
    close('ghost', { auditedCommit: 'deadbee' });
    put('d', [b('01', 'n'), b('02', 'bare'), b('03', 'ghost')]);
    expect(dm.unsyncedAll(root, { mergedInto: 'main', mergedHead: 'main' })).toEqual([]);
  });
  it('treats an ambiguous short id as not merged', () => {
    const { root, put, close, b } = fixture();
    close('amb', { auditedCommit: '' });
    put('d', [b('01', 'amb')]);
    expect(dm.unsyncedAll(root, { mergedInto: 'main' })).toEqual([]);
  });
  it('without --merged-into the output is unchanged (closed.json need not name a commit)', () => {
    const { root, put, close, b } = fixture();
    close('n', null);
    put('d', [b('01', 'n')]);
    expect(ids(dm.unsyncedAll(root))).toEqual(['01']);
  });
  it('rejects an unresolvable ref, an option-shaped ref, and --merged-head alone', () => {
    const { root, put, close, b, base } = fixture();
    close('m', { auditedCommit: base });
    put('d', [b('01', 'm')]);
    expect(() => dm.unsyncedAll(root, { mergedInto: 'no-such-ref' })).toThrow(/merged-into/);
    expect(() => dm.unsyncedAll(root, { mergedInto: '--all' })).toThrow(/merged-into/);
    expect(() => dm.unsyncedAll(root, { mergedHead: base })).toThrow(/merged-head needs --merged-into/);
  });
  it('works through the CLI with --all and with --dir', () => {
    const { root, base, put, close, b } = fixture();
    close('m', { auditedCommit: base });
    put('d', [b('01', 'm')]);
    const script = path.join(__dirname, 'design-map.js');
    const run = (...a) => spawnSync('node', [script, 'unsynced', ...a], { cwd: root, encoding: 'utf8' });
    expect(ids(JSON.parse(run('--all', '--merged-into', 'main').stdout))).toEqual(['01']);
    expect(ids(JSON.parse(run('--dir', 'docs/ui/d', '--merged-into', 'main').stdout))).toEqual(['01']);
    expect(run('--all', '--merged-head', base).status).toBe(1);
  });
});

describe('installed copy', () => {
  it('.claude/lib/design-map.js is byte-identical to packages/core/lib/design-map.js', () => {
    const root = path.join(__dirname, '..', '..', '..');
    expect(fs.readFileSync(path.join(root, '.claude/lib/design-map.js'))).toEqual(fs.readFileSync(path.join(root, 'packages/core/lib/design-map.js')));
  });
});

describe('approve', () => {
  const render = require('./design-render');
  const fileOf = (id) => `${id}.dc.html`;
  const fixture = () => {
    const repo = tmp();
    const dir = path.join(repo, 'docs', 'ui', 'd');
    fs.mkdirSync(dir, { recursive: true });
    const ids = { draft: 'a-draft', appr: 'b-appr', build: 'c-build', ship: 'd-ship', part: 'p-part' };
    const boards = [
      board({ id: ids.draft, file: fileOf(ids.draft) }),
      board({ id: ids.appr, file: fileOf(ids.appr), status: 'approved', approved_commit: 'old1' }),
      board({ id: ids.build, file: fileOf(ids.build), status: 'building' }),
      board({ id: ids.ship, file: fileOf(ids.ship), status: 'shipped' }),
      board({ id: ids.part, file: fileOf(ids.part), kind: 'part' }),
    ];
    for (const b of boards) fs.writeFileSync(path.join(dir, b.file), '<div>1</div>');
    fs.writeFileSync(path.join(dir, 'design-map.json'), JSON.stringify(mapOf(boards)));
    fs.writeFileSync(path.join(repo, 'other.txt'), 'x');
    sh(repo, 'init', '-q'); sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', 'init');
    // approve() commits through its own git calls, which do not see this file's ENV; give the
    // repo an identity so those commits work where no global git identity exists (CI).
    sh(repo, 'config', 'user.name', 't'); sh(repo, 'config', 'user.email', 't@t');
    return { repo, dir, rel: 'docs/ui/d', ids };
  };
  const head = (repo) => sh(repo, 'rev-parse', 'HEAD').stdout.trim();
  const status = (dir, id) => dm.read(dir).boards.find((b) => b.id === id);
  let spy;
  // approve() always renders now; stub it so tests that care about the map, not the frames, launch no Chromium.
  beforeEach(() => { spy = jest.spyOn(render, 'render').mockResolvedValue({ frames: [], errors: {} }); });
  afterEach(() => { if (spy) spy.mockRestore(); spy = null; });

  it('commits an uncommitted board edit first and approves drafts, part included, at that commit', async () => {
    const { repo, dir, rel, ids } = fixture();
    fs.writeFileSync(path.join(dir, fileOf(ids.draft)), '<div>2</div>');
    spy = jest.spyOn(render, 'render').mockResolvedValue({ frames: [{ board: ids.draft }], errors: { x: ['e'] } });
    const r = await dm.approve(rel, { ids: [ids.draft, ids.part], runtime: path.join(repo, 'rt.js'), repo });
    const approvalCommit = sh(repo, 'rev-parse', 'HEAD~1').stdout.trim();
    expect(sh(repo, 'log', '-2', '--format=%s').stdout).toMatch(/boards approved\nchore\(design\): d board changes before approval/);
    expect(r).toMatchObject({ commit: approvalCommit, approved: [ids.draft, ids.part], kept: [], renderSkipped: null, errors: { x: ['e'] } });
    expect(spy.mock.calls[0][0]).toMatchObject({ boards: [ids.draft, ids.part], approved: true });
    expect(status(dir, ids.draft)).toMatchObject({ status: 'approved', approved_commit: approvalCommit });
    expect(status(dir, ids.part).status).toBe('approved');
  });

  it('keeps an approved board unless --reapprove', async () => {
    const { repo, dir, rel, ids } = fixture();
    const r = await dm.approve(rel, { ids: [ids.appr], repo });
    expect(r).toMatchObject({ approved: [], kept: [ids.appr] });
    expect(status(dir, ids.appr).approved_commit).toBe('old1');
    const r2 = await dm.approve(rel, { ids: [ids.appr], reapprove: true, repo });
    expect(r2.approved).toEqual([ids.appr]);
    expect(status(dir, ids.appr).approved_commit).toBe(r2.commit);
    expect(r2.commit).not.toBe('old1');
  });

  it('uses --commit verbatim and fails naming the file when the folder changed after it', async () => {
    const { repo, dir, rel, ids } = fixture();
    const sha = head(repo);
    const ok = await dm.approve(rel, { ids: [ids.draft], commit: sha, repo });
    expect(ok.commit).toBe(sha);
    expect(status(dir, ids.draft).approved_commit).toBe(sha);
    const f = fixture();
    const sha2 = head(f.repo);
    fs.writeFileSync(path.join(f.dir, fileOf(f.ids.draft)), '<div>changed</div>');
    sh(f.repo, 'commit', '-aqm', 'later');
    await expect(dm.approve(f.rel, { ids: [f.ids.draft], commit: sha2, repo: f.repo })).rejects.toThrow(fileOf(f.ids.draft));
    expect(status(f.dir, f.ids.draft).status).toBe('draft');
  });

  it('rejects an unknown --commit and records a symbolic one as its full sha', async () => {
    const { repo, dir, rel, ids } = fixture();
    await expect(dm.approve(rel, { ids: [ids.draft], commit: 'deadbeef', repo })).rejects.toThrow(/not a commit/);
    expect(status(dir, ids.draft).status).toBe('draft');
    const r = await dm.approve(rel, { ids: [ids.draft], commit: 'HEAD', repo });
    expect(r.commit).toBe(sh(repo, 'rev-parse', 'HEAD~1').stdout.trim());
    expect(status(dir, ids.draft).approved_commit).toBe(r.commit);
  });

  it('a failed approval commit restores the map and leaves nothing staged', async () => {
    const { repo, dir, rel, ids } = fixture();
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    fs.chmodSync(hook, 0o755);
    await expect(dm.approve(rel, { ids: [ids.draft], commit: head(repo), repo })).rejects.toThrow(/could not commit approval/);
    expect(status(dir, ids.draft).status).toBe('draft');
    expect(sh(repo, 'diff', '--cached', '--name-only').stdout.trim()).toBe('');
  });

  it.each(['c-build', 'd-ship', 'nope'])('fails on %s and changes nothing', async (id) => {
    const { repo, dir, rel, ids } = fixture();
    fs.writeFileSync(path.join(dir, fileOf(ids.draft)), '<div>2</div>');
    const before = head(repo);
    await expect(dm.approve(rel, { ids: [ids.draft, id], repo })).rejects.toThrow(id);
    expect(head(repo)).toBe(before);
    expect(status(dir, ids.draft).status).toBe('draft');
  });

  it('with no runtime renders with the pinned runtime and still commits the map', async () => {
    const { repo, rel, ids } = fixture();
    const r = await dm.approve(rel, { ids: [ids.draft], repo });
    expect(r.renderSkipped).toBeNull();
    expect(spy.mock.calls[0][0].runtime).toBe(render.PINNED_RUNTIME);
    expect(sh(repo, 'status', '--porcelain').stdout).toBe('');
    expect(sh(repo, 'log', '-1', '--format=%s').stdout.trim()).toBe('chore(design): d boards approved');
  });

  it.each([['ToolError', () => new render.ToolError('no playwright')], ['plain Error', () => new Error('git archive failed')]])('a render throwing %s is skipped, map committed', async (_n, mk) => {
    const { repo, dir, rel, ids } = fixture();
    spy = jest.spyOn(render, 'render').mockRejectedValue(mk());
    const r = await dm.approve(rel, { ids: [ids.draft], runtime: 'rt.js', repo });
    expect(r.renderSkipped).toMatch(/playwright|git archive/);
    expect(status(dir, ids.draft).status).toBe('approved');
    expect(sh(repo, 'status', '--porcelain').stdout).toBe('');
  });

  it('leaves a file staged outside the design folder out of the commit; --message is used', async () => {
    const { repo, rel, ids } = fixture();
    fs.writeFileSync(path.join(repo, 'other.txt'), 'staged');
    sh(repo, 'add', 'other.txt');
    await dm.approve(rel, { ids: [ids.draft], message: 'custom msg', repo });
    expect(sh(repo, 'log', '-1', '--format=%s').stdout.trim()).toBe('custom msg');
    expect(sh(repo, 'show', '--name-only', '--format=', 'HEAD').stdout).not.toMatch(/other\.txt/);
    expect(sh(repo, 'diff', '--cached', '--name-only').stdout.trim()).toBe('other.txt');
  });

  it('CLI awaits approve and prints its result', () => {
    const { repo, rel, ids } = fixture();
    const o = spawnSync('node', [path.join(__dirname, 'design-map.js'), 'approve', '--dir', rel, '--ids', ids.draft, '--reapprove'], { cwd: repo, env: ENV, encoding: 'utf8' });
    expect(o.status).toBe(0);
    expect(JSON.parse(o.stdout)).toMatchObject({ approved: [ids.draft], renderSkipped: expect.any(String) });
    const bad = spawnSync('node', [path.join(__dirname, 'design-map.js'), 'approve', '--dir', rel, '--ids', 'nope'], { cwd: repo, env: ENV, encoding: 'utf8' });
    expect(bad.status).toBe(1);
  });
});
