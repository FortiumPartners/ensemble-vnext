'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { comparisonRows } = require('./design-criteria');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'design', 'core-boards');
const TRIPS = path.join(ROOT, 'test', 'fixtures', 'design', 'walk', 'boards', 'trips-refresh');
const SCRIPT = path.join(__dirname, 'design-criteria.js');

/** Copy a fixture design folder into a temp dir; `edit(map)` may change the map. */
function copy(src, edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcrit-'));
  // Not the whole tree: the trips fixture's canvas/ holds links that cpSync cannot copy.
  const png = path.join(src, 'screens', 'png');
  if (fs.existsSync(png)) fs.cpSync(png, path.join(dir, 'screens', 'png'), { recursive: true });
  fs.copyFileSync(path.join(src, 'design-map.json'), path.join(dir, 'design-map.json'));
  const file = path.join(dir, 'design-map.json');
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (edit) edit(map);
  fs.writeFileSync(file, JSON.stringify(map));
  return dir;
}
const ids = (out) => out.rows.map((r) => r.id);
const byId = (out, id) => out.rows.find((r) => r.id === id);

describe('comparisonRows on the 12-board fixture', () => {
  const out = comparisonRows({ dir: FIXTURE });

  it('yields 12 rows, 8 core and 4 evidence-only, nothing missing', () => {
    expect(out.rows).toHaveLength(12);
    expect(out.counts).toEqual({ core: 8, evidenceOnly: 4 });
    expect(out.missing).toEqual([]);
  });

  it('ids are DC-<frame stem>, default frame first per board, in map order', () => {
    expect(ids(out)).toEqual([
      'DC-01-home', 'DC-01-home--loading', 'DC-01-home--empty', 'DC-02-trips', 'DC-02-trips--many',
      'DC-03-profile', 'DC-03-profile--empty', 'DC-04-search', 'DC-05-cart', 'DC-06-checkout',
      'DC-07-about--as-is', 'DC-08-help--as-is',
    ]);
  });

  it('only a default frame of a Core board is core; a state with no props renders no frame', () => {
    expect(out.rows.filter((r) => r.boardClass === 'core').every((r) => r.state === null)).toBe(true);
    expect(byId(out, 'DC-01-home--loading')).toMatchObject({ boardClass: 'evidence-only', board: '01-home', state: 'loading' });
    expect(ids(out)).not.toContain('DC-01-home--error');
  });

  it('yields none for a draft or superseded to-be, a part, a flow, a replaced as-is and a screenshot_match:false as-is', () => {
    const all = ids(out).join(' ');
    for (const gone of ['09-draft', '10-old', '11-mismatch', '12-parts', '13-flow', '01-home--as-is']) expect(all).not.toContain(gone);
  });

  it('carries the skill table text', () => {
    expect(byId(out, 'DC-02-trips--many')).toEqual({
      id: 'DC-02-trips--many',
      statement: 'Screen `02-trips--many` renders as its design frame',
      cites: `${FIXTURE.replace(/\\/g, '/')}/screens/png/02-trips--many.png`,
      evidence: 'the stitched design | build | diff image and manifest for `02-trips--many`, per this skill\'s Capture section',
      derivation: 'check:verify-design-comparison',
      tier1: 'judge-only — a pictorial comparison against the design frame; no text assertion is possible',
      parts: '',
      mustPass: '',
      boardClass: 'evidence-only',
      board: '02-trips',
      state: 'many',
    });
  });

  it('normalises a trailing slash on dir in cites', () => {
    expect(comparisonRows({ dir: FIXTURE + '/' }).rows[0].cites).toBe(`${FIXTURE.replace(/\\/g, '/')}/screens/png/01-home.png`);
  });

  it('keeps the row for a deleted PNG and lists it in missing', () => {
    const dir = copy(FIXTURE);
    fs.rmSync(path.join(dir, 'screens', 'png', '04-search.png'));
    const r = comparisonRows({ dir });
    expect(r.rows).toHaveLength(12);
    expect(r.missing).toEqual([`${dir.replace(/\\/g, '/')}/screens/png/04-search.png`]);
  });

  it('throws on an over-cap map', () => {
    const dir = copy(FIXTURE, (m) => { m.boards.find((b) => b.id === '09-draft').core = true; });
    expect(() => comparisonRows({ dir })).toThrow(/at most 8/);
  });

  it('throws on a missing dir argument', () => {
    expect(() => comparisonRows({})).toThrow(/--dir/);
  });
});

describe('comparisonRows on the trips-refresh fixture', () => {
  const given = (edit) => copy(TRIPS, (m) => {
    for (const b of m.boards) {
      if (b.kind === 'as-is') delete b.screenshot_match; // else the as-is boards yield none for the wrong reason
      b.core = b.kind === 'to-be';
    }
    if (edit) edit(m);
  });

  it('an as-is board replaced by a to-be board (route, platform, viewport) yields no row and is no state of it', () => {
    const out = comparisonRows({ dir: given() });
    expect(ids(out).filter((i) => i.includes('as-is'))).toEqual([]);
    // 4 to-be boards with 4 prop states each (`default` is a state name, so it is an evidence-only frame)
    expect(out.counts.core).toBe(4);
    expect(byId(out, 'DC-01-home').boardClass).toBe('core');
    expect(byId(out, 'DC-01-home--default')).toMatchObject({ boardClass: 'evidence-only', state: 'default' });
    expect(out.rows).toHaveLength(4 + 4 * 5);
  });

  it('an as-is board with a different viewport is not replaced', () => {
    const out = comparisonRows({ dir: given((m) => { m.boards.find((b) => b.id === '01-home--as-is').viewport = [320, 568]; }) });
    expect(ids(out)).toContain('DC-01-home--as-is');
    expect(byId(out, 'DC-01-home--as-is').boardClass).toBe('evidence-only'); // core:false on that board
  });

  it('route-less as-is boards never replace each other', () => {
    const out = comparisonRows({ dir: given((m) => {
      for (const b of m.boards) if (b.kind === 'to-be') b.status = 'draft';
      for (const b of m.boards.filter((x) => x.kind === 'as-is')) delete b.route;
    }) });
    expect(ids(out)).toEqual(['DC-01-home--as-is', 'DC-02-home--as-is', 'DC-03-trips--as-is', 'DC-04-trips--as-is']);
  });

  it('a state whose unsafe name slugs to as-is takes the next free slug (as-is-2)', () => {
    const out = comparisonRows({ dir: given((m) => {
      const home = m.boards.find((b) => b.id === '01-home');
      home.states['as-is?'] = { setup: 'x', props: {} };
    }) });
    expect(ids(out)).toContain('DC-01-home--as-is-2');
    expect(byId(out, 'DC-01-home--as-is-2').state).toBe('as-is?');
  });

  it('a legacy copy (no core keys) makes every default frame core', () => {
    const dir = copy(TRIPS, (m) => { for (const b of m.boards) { delete b.core; delete b.screenshot_match; } });
    const out = comparisonRows({ dir });
    expect(out.rows.filter((r) => r.boardClass === 'core').map((r) => r.id)).toEqual(['DC-01-home', 'DC-02-home', 'DC-03-trips', 'DC-04-trips']);
  });

  it('as-is boards with screenshot_match:false yield none, as shipped', () => {
    const dir = copy(TRIPS, (m) => { for (const b of m.boards) delete b.core; });
    expect(ids(comparisonRows({ dir })).some((i) => i.includes('as-is'))).toBe(false);
  });

  it('every frame of this fixture is missing (it has no PNGs) and still has its row', () => {
    const out = comparisonRows({ dir: given() });
    expect(out.missing).toHaveLength(out.rows.length);
  });
});

describe('CLI', () => {
  const run = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

  it('prints the rows as JSON', () => {
    const r = run('comparison-rows', '--dir', FIXTURE);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).counts).toEqual({ core: 8, evidenceOnly: 4 });
  });

  it('exits 1 with the message on stderr for an over-cap map', () => {
    const dir = copy(FIXTURE, (m) => { m.boards.find((b) => b.id === '09-draft').core = true; });
    const r = run('comparison-rows', '--dir', dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^design-criteria\.js: /);
  });

  it('exits 1 for a missing map, no dir and an unknown verb', () => {
    expect(run('comparison-rows', '--dir', os.tmpdir() + '/nope-dcrit').status).toBe(1);
    expect(run('comparison-rows').status).toBe(1);
    expect(run('bogus', '--dir', FIXTURE).status).toBe(1);
  });
});

describe('installed copy', () => {
  it('.claude/lib/design-criteria.js is byte-identical to packages/core/lib/design-criteria.js', () => {
    expect(fs.readFileSync(path.join(ROOT, '.claude/lib/design-criteria.js'))).toEqual(fs.readFileSync(SCRIPT));
  });

  it('packages/full/lib/design-criteria.js links to the core module', () => {
    const link = path.join(ROOT, 'packages/full/lib/design-criteria.js');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(link)).toEqual(fs.readFileSync(SCRIPT));
  });
});
