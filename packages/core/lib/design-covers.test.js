'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { designCovers } = require('./design-covers');

const TEMPLATE = path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'design-setup', 'template.md');

const ST = (id) => ({ id: `ST-${id}`, derivation: 'check:verify-design-structure' });
const DC = (stem) => ({ id: `DC-${stem}`, derivation: 'check:verify-design-comparison' });

const designMd = ({ routeCell = '`/ -> app/page`', libs = 'src/ui' } = {}) => `# Design

## 2. Per platform

| Platform | Board component kind | Tokens source | Component library paths | Viewport sizes |
|----------|----------------------|---------------|-------------------------|----------------|
| web | real | tokens.css | ${libs} | 390x844 |

## 3. How to reach a screen

| Field | Value |
|-------|-------|
| Route list (file, command or URL list) | ${routeCell} |
| Sign-in | see verification.md |
`;

const board = (o) => ({ id: '01-home', kind: 'to-be', platform: 'web', route: '/', status: 'draft', components: ['FixtureWeb.Card'], ...o });

let root;
const put = (rel, text = '') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const setup = ({ design = designMd(), boards = [board()], slug = 'trips' } = {}) => {
  if (design !== null) put('.claude/rules/design.md', design);
  put(`docs/ui/${slug}/design-map.json`, JSON.stringify({ boards }));
};
const run = (rows) => designCovers({ cwd: root, rows });
const covers = (res, id) => res.covers.get(id);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dcov-'));
  put('.claude/skills/design-setup/template.md', fs.readFileSync(TEMPLATE, 'utf8'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('route to page file', () => {
  it('resolves a `/r -> path` pair with extension probing', () => {
    put('app/page.tsx'); put('src/ui/Card.tsx');
    setup();
    const res = run([ST('01-home')]);
    expect(res.unresolved).toEqual([]);
    expect(covers(res, 'ST-01-home')).toEqual(['app/page.tsx', 'src/ui/Card.tsx']);
  });

  it('resolves a `/r: path` pair and probes /index.*', () => {
    put('app/home/index.jsx'); put('src/ui/Card.tsx');
    setup({ design: designMd({ routeCell: '/: app/home' }) });
    expect(covers(run([ST('01-home')]), 'ST-01-home')).toContain('app/home/index.jsx');
  });

  it('resolves a `| /r | path |` pair (escaped pipes) and picks the right route among several', () => {
    put('app/page.tsx'); put('app/trips.vue'); put('src/ui/Card.tsx');
    setup({ design: designMd({ routeCell: '\\| /trips \\| app/trips \\|; /x -> app/x' }), boards: [board({ route: '/trips' })] });
    expect(covers(run([ST('01-home')]), 'ST-01-home')[0]).toBe('app/trips.vue');
  });

  it('resolves through a named route file, pair line', () => {
    put('routes.txt', '/ -> pages/Home\n');
    put('pages/Home.tsx'); put('src/ui/Card.tsx');
    setup({ design: designMd({ routeCell: '`routes.txt`' }) });
    expect(covers(run([ST('01-home')]), 'ST-01-home')[0]).toBe('pages/Home.tsx');
  });

  it('resolves through a named route file, quoted-literal line, relative to the route file', () => {
    put('src/router.ts', "  { path: '/', component: './views/Home' },\n");
    put('src/views/Home.tsx'); put('src/ui/Card.tsx');
    setup({ design: designMd({ routeCell: 'src/router.ts' }) });
    expect(covers(run([ST('01-home')]), 'ST-01-home')[0]).toBe('src/views/Home.tsx');
  });

  it('is unresolved when the route is not listed', () => {
    put('app/page.tsx'); put('src/ui/Card.tsx');
    setup({ boards: [board({ route: '/other' })] });
    expect(run([ST('01-home')])).toEqual({ covers: new Map(), unresolved: [{ id: 'ST-01-home', reason: 'route /other has no page file' }] });
  });

  it('is unresolved when the board has no route', () => {
    put('src/ui/Card.tsx');
    setup({ boards: [board({ route: '' })] });
    expect(run([ST('01-home')]).unresolved).toEqual([{ id: 'ST-01-home', reason: 'board 01-home has no route' }]);
  });

  it('is unresolved when the route names a page file that does not exist', () => {
    put('src/ui/Card.tsx');
    setup();
    expect(run([ST('01-home')]).unresolved[0].reason).toMatch(/no page file/);
  });
});

describe('component to file', () => {
  beforeEach(() => put('app/page.tsx'));

  it('strips the namespace and matches <Name>.<ext>', () => {
    put('src/ui/deep/Card.tsx');
    setup();
    expect(covers(run([ST('01-home')]), 'ST-01-home')).toContain('src/ui/deep/Card.tsx');
  });

  it('matches <Name>/index.<ext> and the <Name>/ directory', () => {
    put('src/ui/Card/index.ts');
    setup();
    const got = covers(run([ST('01-home')]), 'ST-01-home');
    expect(got).toEqual(expect.arrayContaining(['src/ui/Card/', 'src/ui/Card/index.ts']));
  });

  it('does not take Card.test.tsx or Card.stories.tsx for Card', () => {
    put('src/ui/Card.test.tsx'); put('src/ui/Card.stories.tsx');
    setup();
    expect(run([ST('01-home')]).unresolved[0].reason).toBe('component FixtureWeb.Card not found');
  });

  it('skips node_modules and dot-directories', () => {
    put('src/ui/node_modules/Card.tsx'); put('src/ui/.cache/Card.tsx');
    setup();
    expect(run([ST('01-home')]).covers.size).toBe(0);
  });

  it('is all-or-nothing: one missing component of three leaves the board unresolved', () => {
    put('src/ui/Card.tsx'); put('src/ui/Chip.tsx');
    setup({ boards: [board({ components: ['FixtureWeb.Card', 'FixtureWeb.Chip', 'FixtureWeb.Button'] })] });
    const res = run([ST('01-home')]);
    expect(res.covers.size).toBe(0);
    expect(res.unresolved).toEqual([{ id: 'ST-01-home', reason: 'component FixtureWeb.Button not found' }]);
  });

  it('is unresolved for a board that names no components', () => {
    setup({ boards: [board({ components: [] })] });
    expect(run([ST('01-home')]).unresolved[0].reason).toBe('board 01-home names no components');
  });

  it('is unresolved when the platform has no library row', () => {
    put('src/ui/Card.tsx');
    setup({ boards: [board({ platform: 'ios' })] });
    expect(run([ST('01-home')]).unresolved[0].reason).toMatch(/not found/);
  });
});

describe('DC rows and row selection', () => {
  beforeEach(() => { put('app/page.tsx'); put('src/ui/Card.tsx'); });

  it('a DC-<stem> equal to a board id gets that board\'s covers', () => {
    setup();
    expect(covers(run([DC('01-home')]), 'DC-01-home')).toEqual(['app/page.tsx', 'src/ui/Card.tsx']);
  });

  it('a DC-<board>--<state> frame takes its board', () => {
    setup();
    expect(covers(run([DC('01-home--empty')]), 'DC-01-home--empty')).toEqual(['app/page.tsx', 'src/ui/Card.tsx']);
  });

  it('a DC- stem that is no board id is unresolved', () => {
    setup();
    expect(run([DC('99-nothing')]).unresolved).toEqual([{ id: 'DC-99-nothing', reason: 'no board for the row' }]);
  });

  it('ST-<design slug> is unresolved', () => {
    setup();
    expect(run([ST('trips')]).unresolved).toEqual([{ id: 'ST-trips', reason: 'no board for the row' }]);
  });

  it('a board id in two designs is unresolved', () => {
    setup();
    put('docs/ui/other/design-map.json', JSON.stringify({ boards: [board()] }));
    expect(run([ST('01-home')]).unresolved[0].reason).toMatch(/more than one design/);
  });

  it('ignores rows of other derivations', () => {
    setup();
    const res = run([{ id: 'ST-01-home', derivation: 'check:verify-flow-as-built' }, { id: 'FR-1', derivation: 'task:T-1' }, { id: 'X', derivation: '' }]);
    expect(res).toEqual({ covers: new Map(), unresolved: [] });
  });

  it('skips folders without a design-map.json', () => {
    setup();
    fs.mkdirSync(path.join(root, 'docs/ui/_current'), { recursive: true });
    expect(run([ST('01-home')]).covers.size).toBe(1);
  });
});

describe('design.md state', () => {
  it('missing design.md leaves every design row unresolved', () => {
    setup({ design: null });
    expect(run([ST('01-home')]).unresolved).toEqual([{ id: 'ST-01-home', reason: 'design.md is missing' }]);
  });

  it('unfilled design.md (the template itself) leaves the row unresolved', () => {
    setup({ design: fs.readFileSync(TEMPLATE, 'utf8') });
    expect(run([ST('01-home')]).unresolved).toEqual([{ id: 'ST-01-home', reason: 'design.md is unfilled' }]);
  });

  it('throws naming the file for a malformed design-map.json', () => {
    setup();
    put('docs/ui/trips/design-map.json', '{nope');
    expect(() => run([ST('01-home')])).toThrow(/design-map\.json is not valid JSON/);
  });

  it('reads nothing when no row is a design row', () => {
    expect(run([{ id: 'FR-1', derivation: 'task:T-1' }])).toEqual({ covers: new Map(), unresolved: [] });
  });
});

describe('output shape', () => {
  it('returns repo-relative forward-slash paths with no absolute or .. parts', () => {
    put('app/page.tsx'); put('src/ui/Card/index.tsx');
    setup();
    for (const c of covers(run([ST('01-home')]), 'ST-01-home')) {
      expect(path.isAbsolute(c)).toBe(false);
      expect(c).not.toMatch(/\.\.|\\/);
    }
  });
});
