'use strict';

/**
 * narrow-reproof seam test (TRD narrow-reproof-scope NRS-T001).
 *
 * Neither the covers record nor custody owns the join between them: a met design criterion
 * (`ST-<board>`) gets its source files from design-covers through `live-evidence.js
 * record-criteria` (NRS-B004), and `custody.js reconcile` (NRS-B001) reads that record to decide
 * how much to re-prove after a change. This test drives both as their CLIs, in a real temp git
 * repo with a filled design.md and a design map.
 *
 * What is real: git, live-evidence.js, custody.js, design-covers.js, design-map.js, the TRD and
 * success-definition parsers, and functional-verification.js `must-pass-coverage` (custody runs it
 * as a child process). What is stubbed: nothing; the verification state is written by the test, as
 * the verify loop would leave it.
 *
 * Run with: npx jest packages/core/lib/narrow-reproof.seam.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const liveEvidence = require('./live-evidence');
const CUSTODY = path.join(__dirname, 'custody.js');
const LIVE_EVIDENCE = path.join(__dirname, 'live-evidence.js');
const DESIGN_TEMPLATE = path.join(__dirname, '..', '..', 'skills', 'design-setup', 'template.md');

const TRD = 'docs/TRD/f.md';
const STATE = '.trd-state/f';
const BOARD_HOME = '01-home--as-is';
const BOARD_SETTINGS = '02-settings--as-is';
const ID_HOME = `ST-${BOARD_HOME}`;
const ID_SETTINGS = `ST-${BOARD_SETTINGS}`;

const TRD_TEXT = [
  '# F', '', '## Objectives', '',
  '| ID | Objective | Must pass |', '|----|-----------|-----------|', '| O1 | boards are built | yes |', '',
  '## 4. Master Task List', '',
  '| Task ID | Description | Dependencies |', '|---------|-------------|--------------|', '| F-001 | build it | None |', '',
].join('\n');

const row = (id) =>
  `| ${id} | the board is built | c | e | check:verify-design-structure | locator | | O1 |`;
const DEFINITION = [
  '# D', '',
  '| ID | Functional statement | Cites | Evidence | Derivation | Tier 1 | Parts | Must pass |',
  '|----|----|----|----|----|----|----|----|',
  row(ID_HOME),
  row(ID_SETTINGS), '',
].join('\n');

// design.md as the design-setup template lays it out: section 2 names where components live,
// section 3 holds the route list. Several route pairs in the one cell are separated by `;`.
const DESIGN_MD = [
  '# Design', '',
  '## 2. Per platform', '',
  '| Platform | Board component kind (`real` or `parts`) | Tokens source | Component library paths | Viewport sizes |',
  '|----------|------|------|------|------|',
  '| web | real | tokens.css | `src/` | 390x844 |', '',
  '## 3. How to reach a screen', '',
  '| Field | Value |', '|-------|-------|',
  '| Route list (file, command or URL list) | `/home -> app/home/page.tsx`; `/settings -> app/settings/page.tsx` |', '',
].join('\n');

const board = (id, route, components) => ({
  id, file: `${id}.dc.html`, kind: 'as-is', platform: 'web', route, status: 'draft',
  brief_items: ['BI-1'], parts: [], components,
});
const DESIGN_MAP = {
  design_system: { paths: ['src/'] },
  canvases: [],
  brief_items: [{ id: 'BI-1', source: 'docs/briefs/f.md' }],
  boards: [
    board(BOARD_HOME, '/home', ['Lib.Card']),
    board(BOARD_SETTINGS, '/settings', ['Lib.Chip']),
  ],
};

const roots = [];
afterAll(() => roots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const cleanEnv = () => {
  const e = { ...process.env };
  delete e.GIT_DIR;
  delete e.GIT_WORK_TREE;
  delete e.GIT_INDEX_FILE;
  return e;
};

/**
 * A feature branch with the design files committed, the anchor set and both boards met and
 * recorded. `designMd` is the text of .claude/rules/design.md (the unfilled case passes the
 * template itself, which design-map.js `setup()` reports as `unfilled`).
 */
function project({ designMd = DESIGN_MD, trdText = TRD_TEXT, definition = DEFINITION } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reproof-seam-')));
  roots.push(root);
  const bare = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const g = (cwd, ...a) => {
    const r = spawnSync('git', a, { cwd, encoding: 'utf8', env: cleanEnv() });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  g(root, 'init', '--bare', '-b', 'main', bare);
  g(repo, 'init', '-b', 'main');
  g(repo, 'config', 'user.email', 't@example.com');
  g(repo, 'config', 'user.name', 't');
  g(repo, 'remote', 'add', 'origin', bare);
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  };
  const commit = (msg, files = {}) => {
    for (const [rel, text] of Object.entries(files)) write(rel, text);
    g(repo, 'add', '-A');
    g(repo, 'commit', '-m', msg);
    return g(repo, 'rev-parse', 'HEAD');
  };
  const cli = (script, ...args) => {
    // relative paths and cwd=repo: record-criteria resolves design.md and the page files against cwd
    const r = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop() || 'null'), stderr: r.stderr };
  };

  commit('init', { 'README.md': 'r' });
  g(repo, 'push', '-u', 'origin', 'main');
  g(repo, 'checkout', '-b', 'feature/f');
  // Everything under `.claude/rules/` is a shipped-class path, so it goes in before the anchor.
  commit('work', {
    [TRD]: trdText,
    '.claude/rules/design.md': designMd,
    '.claude/skills/design-setup/template.md': fs.readFileSync(DESIGN_TEMPLATE, 'utf8'),
    'docs/ui/f/design-map.json': JSON.stringify(DESIGN_MAP, null, 2),
    'app/home/page.tsx': 'home page',
    'app/settings/page.tsx': 'settings page',
    'src/home/Card.tsx': 'card',
    'src/settings/Chip.tsx': 'chip',
  });
  const reconcile = (...extra) =>
    cli(CUSTODY, 'reconcile', '--state-dir', STATE, '--trd', TRD, ...extra).json;
  reconcile(); // sets the anchor at this commit

  write(`${STATE}/success-definition.md`, definition);
  write(`${STATE}/verification-state.json`, JSON.stringify({
    criteria: [{ id: ID_HOME, status: 'met', artifact: null }, { id: ID_SETTINGS, status: 'met', artifact: null }],
  }));
  const recorded = cli(LIVE_EVIDENCE, 'record-criteria', '--state-dir', STATE, '--trd', TRD,
    '--definition', `${STATE}/success-definition.md`);
  const gate = () => reconcile('--definition', `${STATE}/success-definition.md`);
  const records = () => {
    const p = liveEvidence.criterionCoversPath(path.join(repo, STATE));
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  return { repo, commit, recorded, gate, records };
}

// A design feature whose TRD declares no must-pass objective (core-boards D12): the Core row is
// must-pass by its Board class alone, the evidence-only row is not must-pass at all.
const CORE_TRD_TEXT = TRD_TEXT.replace('| O1 | boards are built | yes |', '| O1 | boards are built | |');
const classRow = (id, cls) => `| ${id} | the board is built | c | e | check:verify-design-comparison | locator | | | ${cls} |`;
const CORE_DEFINITION = [
  '# D', '',
  '| ID | Functional statement | Cites | Evidence | Derivation | Tier 1 | Parts | Must pass | Board class |',
  '|----|----|----|----|----|----|----|----|----|',
  classRow(ID_HOME, 'core'),
  classRow(ID_SETTINGS, 'evidence-only'), '',
].join('\n');

describe('narrow reproof: Core rows (core-boards D12)', () => {
  test('a Core row is in custody\'s re-proof set; an evidence-only row is not', () => {
    const p = project({ trdText: CORE_TRD_TEXT, definition: CORE_DEFINITION });
    p.commit('add a sibling', { 'src/home/Card.extra.tsx': 'more' });
    const r = p.gate();
    expect(r.action).toBe('reverify');
    expect(r.ids).toEqual([ID_HOME]);
    expect(r.ids).not.toContain(ID_SETTINGS);
    expect(r.reused).not.toContain(ID_SETTINGS);
  });
});

describe('narrow reproof: covers record to custody', () => {
  test('record-criteria resolves both boards to their page and component files', () => {
    const p = project();
    expect(p.recorded.status).toBe(0);
    expect(p.recorded.json.recorded.sort()).toEqual([ID_HOME, ID_SETTINGS]);
    expect(p.recorded.json.unresolved).toEqual([]);
    const rec = JSON.stringify(p.records());
    expect(rec).toContain('app/home/page.tsx');
    expect(rec).toContain('src/home/Card.tsx');
    expect(rec).toContain('src/settings/Chip.tsx');
  });

  test('a sibling file beside one board\'s component re-proves that board only (scope: targeted)', () => {
    const p = project();
    p.commit('add a sibling', { 'src/home/Card.extra.tsx': 'more' });
    const r = p.gate();
    expect(r.action).toBe('reverify');
    expect(r.scope).toBe('targeted');
    expect(r.ids).toEqual([ID_HOME]);
    // The other board's cover sits in a different directory, so its proof is reused, not re-run.
    expect(r.reused).toEqual([ID_SETTINGS]);
  });

  test('a change only to .claude/commands/x.md moves the anchor with scope: none', () => {
    const p = project();
    const head = p.commit('edit a command', { '.claude/commands/x.md': 'prose' });
    const r = p.gate();
    expect(r).toMatchObject({ action: 'moved', anchor: head, scope: 'none' });
    expect(r.ids).toBeUndefined();
  });

  test('with design.md still the unfilled template, no covers are recorded and the scope is full', () => {
    // `unfilled` is the one unresolved cause this test uses: design.md equals the template copy in
    // .claude/skills/design-setup/, so design-map.js setup() says `unfilled` and every board fails.
    const p = project({ designMd: fs.readFileSync(DESIGN_TEMPLATE, 'utf8') });
    expect(p.recorded.status).toBe(0);
    expect(p.recorded.json.recorded).toEqual([]);
    expect(p.recorded.json.none.sort()).toEqual([ID_HOME, ID_SETTINGS]);
    expect(p.recorded.json.unresolved.map((u) => u.id).sort()).toEqual([ID_HOME, ID_SETTINGS]);
    expect(p.recorded.json.unresolved[0].reason).toMatch(/unfilled/);
    p.commit('add a sibling', { 'src/home/Card.extra.tsx': 'more' });
    const r = p.gate();
    expect(r.action).toBe('reverify');
    expect(r.scope).toBe('full');
    expect(r.ids.sort()).toEqual([ID_HOME, ID_SETTINGS]);
  });
});
