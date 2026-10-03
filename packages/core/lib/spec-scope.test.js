'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('./spec-scope');

const SPEC = fs.readFileSync(path.join(__dirname, '__fixtures__', 'spec-scope-item4.md'), 'utf8');
const SECTION = 'Item 4 — Sign up and get in, Disney optional';
const SPEC_PATH = 'docs/plans/trip-management-correction-roadmap.md';
const AC = Array.from({ length: 18 }, (_, i) => `AC-4.${i + 1}`);
const SWEPT = ['AC-4.2', 'AC-4.3', 'AC-4.14'];
const CORE = AC.filter((id) => !SWEPT.includes(id));

const TRD = [
  '# TRD: demo',
  '',
  '**Source PRD**: None',
  '**Kind**: change',
  '',
  '## Objectives',
  '',
  '| ID | Objective | Source |',
  '|----|-----------|--------|',
  '| O1 | something the model typed | owner |',
  '',
  '## Intended Change',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '```',
  '## Objectives',
  '| x | y |',
  '```',
  '',
].join('\n');

const render = (ids = CORE) => S.renderObjectives({ trdMarkdown: TRD, specMarkdown: SPEC, specPath: SPEC_PATH, section: SECTION, ids });
const sweep = (ids = SWEPT, coreTrd = 'docs/TRD/demo.md') => S.renderSweep({ specMarkdown: SPEC, specPath: SPEC_PATH, section: SECTION, ids, coreTrd });
const chk = (over = {}) => S.check({ specMarkdown: SPEC, section: SECTION, sweepMarkdown: sweep(), trdMarkdown: render(), ...over });

describe('extract', () => {
  const { criteria, verification } = S.extract(SPEC, { section: SECTION });

  test('yields exactly AC-4.1..AC-4.18 plus guards RG-4.1, RG-4.2', () => {
    expect(criteria.filter((c) => c.kind === 'criterion').map((c) => c.id)).toEqual(AC);
    expect(criteria.filter((c) => c.kind === 'guard').map((c) => c.id)).toEqual(['RG-4.1', 'RG-4.2']);
  });
  test('none of the W-/WM-/M- findings are criteria', () => {
    expect(criteria.some((c) => /^(W|WM|M|M2)-/.test(c.id))).toBe(false);
  });
  test('text includes the surface and drops the traces', () => {
    const c = criteria.find((x) => x.id === 'AC-4.1');
    expect(c.text.startsWith('Web desktop + Web phone width: Registering signs the user in')).toBe(true);
    expect(c.surface).toBe('Web desktop + Web phone width');
    expect(c.traces).toBe('W-006, WM-002');
    expect(c.text).not.toMatch(/Traces/);
  });
  test('guard text has no colon or bold residue', () => {
    expect(criteria.find((x) => x.id === 'RG-4.1').text).toBe('Onboarding for Disney-linked users is unchanged.');
  });
  test('ranges are expanded in the verification map', () => {
    for (const id of ['AC-4.1', 'AC-4.2', 'AC-4.3', 'AC-4.5', 'AC-4.9', 'AC-4.12', 'AC-4.17']) {
      expect(verification[id]).toMatch(/real browser at 1280px/);
    }
    expect(verification['AC-4.4']).toMatch(/Simulator HUD screenshot/);
    expect(verification['AC-4.11']).toMatch(/Maestro/);
    expect(verification['AC-4.16']).toMatch(/API tests/);
  });
  test('a section that is absent, or a document without the heading, yields nothing', () => {
    expect(S.extract(SPEC, { section: 'Item 99' }).criteria).toEqual([]);
    expect(S.extract('# x\n\n- **AC-1** · not under the heading\n').criteria).toEqual([]);
  });
  test('only the named section is read', () => {
    const two = `${SPEC}\n## Item 5 — other\n\n### Acceptance criteria\n\n- **AC-5.1** · Web: five.\n`;
    expect(S.extract(two, { section: SECTION }).criteria.map((c) => c.id)).not.toContain('AC-5.1');
    expect(S.extract(two, { section: 'Item 5 — other' }).criteria.map((c) => c.id)).toEqual(['AC-5.1']);
  });
  test('a wrapped criterion with a nested bullet and table rows are read', () => {
    const md = [
      '## S', '', '### Acceptance criteria', '',
      '- **X-1** · Web: first line',
      '  continues here',
      '  - nested point',
      '  *(Traces: T-1)*',
      '- **X-2:** Server: lazy',
      'wrapped line',
      '',
      '| **X-3** | Mobile: from a table row |',
      '',
    ].join('\n');
    const c = S.extract(md, { section: 'S' }).criteria;
    expect(c.map((x) => [x.id, x.text])).toEqual([
      ['X-1', 'Web: first line continues here nested point'],
      ['X-2', 'Server: lazy wrapped line'],
      ['X-3', 'Mobile: from a table row'],
    ]);
    expect(c[0].traces).toBe('T-1');
  });
});

describe('source', () => {
  test('reads spec and section from a TRD', () => {
    expect(S.source(render())).toEqual({ spec: SPEC_PATH, section: SECTION });
  });
  test('a sweep file also returns the core TRD, including none', () => {
    expect(S.source(sweep())).toEqual({ spec: SPEC_PATH, section: SECTION, coreTrd: 'docs/TRD/demo.md' });
    expect(S.source(sweep(SWEPT, 'none')).coreTrd).toBe('none');
  });
  test('throws on an absent or malformed header', () => {
    expect(() => S.source(TRD)).toThrow(/no \*\*Source spec\*\*/);
    expect(() => S.source('**Source spec**: only/a/path.md\n')).toThrow(/does not parse/);
  });
  test('a header inside a code fence is ignored', () => {
    expect(() => S.source('```\n**Source spec**: a § b\n```\n')).toThrow();
  });
});

describe('renderSweep', () => {
  test('reads back through extract with no section as its items plus the guards', () => {
    const { criteria } = S.extract(sweep());
    expect(criteria.filter((c) => c.kind === 'criterion').map((c) => c.id)).toEqual(SWEPT);
    expect(criteria.filter((c) => c.kind === 'guard').map((c) => c.id)).toEqual(['RG-4.1', 'RG-4.2']);
    const spec = S.extract(SPEC, { section: SECTION }).criteria;
    for (const c of criteria) expect(c.text).toBe(spec.find((s) => s.id === c.id).text);
  });
  test('rejects an id that is not a criterion', () => {
    expect(() => sweep(['W-006'])).toThrow(/not an acceptance criterion/);
    expect(() => sweep(['RG-4.1'])).toThrow(/not an acceptance criterion/);
  });
});

describe('renderObjectives', () => {
  test('replaces only the Objectives table and the header line; the rest is byte-identical', () => {
    const out = render();
    const a = TRD.split('\n');
    const b = out.split('\n');
    // Line-diff: drop the new header line and the new table, compare what is left.
    const tableStart = b.indexOf('| ID | Objective | Source |');
    const tableEnd = b.indexOf('', tableStart);
    const rest = [...b.slice(0, tableStart), ...b.slice(tableEnd)].filter((l) => !l.startsWith('**Source spec**:'));
    const orig = [...a.slice(0, a.indexOf('| ID | Objective | Source |')), ...a.slice(a.indexOf('', a.indexOf('| ID | Objective | Source |')))];
    expect(rest).toEqual(orig);
    expect(out).toContain(`**Source spec**: ${SPEC_PATH} § ${SECTION}`);
    expect(out).not.toContain('something the model typed');
  });
  test('writes one row per core criterion then one per guard', () => {
    const ids = S.objectiveRows(render()).map((r) => r.id);
    expect(ids).toEqual([...CORE, 'RG-4.1', 'RG-4.2']);
  });
  test('replaces an existing header line instead of adding a second', () => {
    const once = render();
    const twice = S.renderObjectives({ trdMarkdown: once, specMarkdown: SPEC, specPath: SPEC_PATH, section: SECTION, ids: CORE });
    expect(twice).toBe(once);
    expect(twice.match(/\*\*Source spec\*\*:/g)).toHaveLength(1);
  });
  test('the Objectives heading inside a fence is not touched', () => {
    expect(render()).toContain('```\n## Objectives\n| x | y |\n```');
  });
  test('throws without an Objectives section', () => {
    expect(() => S.renderObjectives({ trdMarkdown: '# T\n', specMarkdown: SPEC, specPath: 'p', section: SECTION, ids: CORE })).toThrow(/Objectives/);
  });
});

describe('wrapped and pipe-bearing criteria round-trip', () => {
  const spec = [
    '## S', '', '### Acceptance criteria', '',
    '- **P-1** · Web: wraps over',
    '  two lines *(Traces: Z)*',
    '- **P-2** · Server: accepts `a | b` as one value',
    '',
    '**Regression guards:**',
    '',
    '- **G-1:** Still works.',
    '',
  ].join('\n');
  const trd = '# T\n\n**Source PRD**: None\n\n## Objectives\n\n| ID | Objective | Source |\n|---|---|---|\n';
  test('render then check is ok, and the pipe is escaped in the table', () => {
    const out = S.renderObjectives({ trdMarkdown: trd, specMarkdown: spec, specPath: 's.md', section: 'S', ids: ['P-1', 'P-2'] });
    expect(out).toContain('a \\| b');
    expect(S.check({ specMarkdown: spec, section: 'S', trdMarkdown: out })).toMatchObject({ ok: true, reworded: [] });
    expect(S.objectiveRows(out).find((r) => r.id === 'P-2').text).toBe('Server: accepts `a | b` as one value');
  });
});

describe('check', () => {
  test('a clean split is ok', () => {
    expect(chk()).toEqual({ missing: [], duplicated: [], added: [], reworded: [], noHeader: false, ok: true });
  });
  test('missing: a criterion in neither document', () => {
    expect(chk({ sweepMarkdown: sweep(['AC-4.2', 'AC-4.3']) }).missing).toEqual(['AC-4.14']);
  });
  test('missing: a guard absent from the TRD', () => {
    const trd = render().replace(/^\| RG-4\.2 .*\n?/m, '');
    const r = chk({ trdMarkdown: trd });
    expect(r.missing).toEqual(['RG-4.2']);
    expect(r.ok).toBe(false);
  });
  test('duplicated: a criterion in both, never a guard', () => {
    expect(chk({ sweepMarkdown: sweep(['AC-4.2', 'AC-4.3', 'AC-4.14', 'AC-4.1']) }).duplicated).toEqual(['AC-4.1']);
    expect(chk().duplicated).toEqual([]);
  });
  test('added: an objective that is neither a criterion nor a guard (a guard is not added)', () => {
    const trd = render().replace('| AC-4.1 |', '| X-9 | invented | s |\n| AC-4.1 |');
    const r = chk({ trdMarkdown: trd });
    expect(r.added).toEqual(['X-9']);
    expect(r.ok).toBe(false);
  });
  test('reworded: a row or a sweep item whose text differs', () => {
    expect(chk({ trdMarkdown: render().replace('Registering signs', 'Registering quickly signs') }).reworded).toEqual(['AC-4.1']);
    expect(chk({ sweepMarkdown: sweep().replace('Terms and Privacy', 'Terms') }).reworded).toEqual(['AC-4.2']);
  });
  test('whitespace differences are not rewording', () => {
    expect(chk({ trdMarkdown: render().replace('Registering signs', 'Registering   signs') }).reworded).toEqual([]);
  });
  test('noHeader: absent and unparseable', () => {
    expect(chk({ trdMarkdown: render().replace(/^\*\*Source spec\*\*:.*\n/m, '') }).noHeader).toBe(true);
    expect(chk({ trdMarkdown: render().replace(/ § .*$/m, '') }).noHeader).toBe(true);
  });
  test('all swept: no TRD, guards are read from the sweep file', () => {
    const r = S.check({ specMarkdown: SPEC, section: SECTION, sweepMarkdown: sweep(AC) });
    expect(r.ok).toBe(true);
  });
});

describe('criteria', () => {
  const now = () => new Date('2026-10-02T00:00:00Z');
  const def = S.criteria({ specMarkdown: SPEC, specPath: SPEC_PATH, section: SECTION, ids: CORE, feature: 'demo', now });
  const rows = def.split('\n').filter((l) => /^\| (AC|RG)-/.test(l)).map((l) => l.split(' | '));

  test('header lines and count', () => {
    expect(def).toContain('**Source kind**: spec');
    expect(def).toContain('**Derived**: 2026-10-02T00:00:00.000Z');
    expect(def).toContain(`**Criteria**: ${CORE.length + 2}`);
  });
  test('rows match the spec text and carry the guards', () => {
    const spec = S.extract(SPEC, { section: SECTION }).criteria;
    for (const r of rows) {
      const id = r[0].replace('| ', '');
      expect(r[1]).toBe(spec.find((c) => c.id === id).text);
    }
    expect(rows.map((r) => r[0].replace('| ', '')).slice(-2)).toEqual(['RG-4.1', 'RG-4.2']);
  });
  test('the Simulator-screenshot criterion is judge-only, others locator', () => {
    const tier = (id) => rows.find((r) => r[0] === `| ${id}`)[5];
    expect(tier('AC-4.4')).toMatch(/^judge-only/);
    expect(tier('AC-4.1')).toBe('locator');
    expect(tier('RG-4.1')).toBe('locator');
  });
  test('evidence quotes the verification line; blank when there is none', () => {
    expect(rows.find((r) => r[0] === '| AC-4.16')[3]).toMatch(/API tests/);
    expect(rows.find((r) => r[0] === '| RG-4.1')[3]).toBe('');
  });
  test('rows are grouped by surface', () => {
    const surfaces = rows.filter((r) => r[0].startsWith('| AC')).map((r) => r[1].split(': ')[0]);
    const seen = [];
    for (const s of surfaces) {
      if (seen[seen.length - 1] !== s) { expect(seen).not.toContain(s); seen.push(s); }
    }
  });
});

describe('overlap', () => {
  const trd = '### FIX-1\n- **Touches:** `apps/web/app/login.tsx`, `apps/web/app/x.ts`\n';
  test('reports a shared file and only a whole-path match', () => {
    expect(S.overlap({ sweepFiles: ['apps/web/app/login.tsx', 'apps/web/app/log.tsx', 'web/app/x.ts'], trdMarkdown: trd }))
      .toEqual({ shared: ['apps/web/app/login.tsx'], ok: false });
  });
  test('no shared file is ok', () => {
    expect(S.overlap({ sweepFiles: ['a.js'], trdMarkdown: trd })).toEqual({ shared: [], ok: true });
  });
});

describe('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-scope-'));
  const run = (...args) => spawnSync('node', [path.join(__dirname, 'spec-scope.js'), ...args], { cwd: dir, encoding: 'utf8' });
  const specFile = path.join(dir, 'spec.md');
  const trdFile = path.join(dir, 'trd.md');
  const sweepFile = path.join(dir, 'x.sweep.md');
  beforeAll(() => { fs.writeFileSync(specFile, SPEC); fs.writeFileSync(trdFile, TRD); });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('extract', () => {
    const r = run('extract', '--file', specFile, '--section', SECTION);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).criteria).toHaveLength(20);
  });
  test('render-sweep, render-objectives, check, source and criteria compose', () => {
    expect(run('render-sweep', '--spec', specFile, '--section', SECTION, '--ids', SWEPT.join(','), '--core-trd', 'docs/TRD/x.md', '--out', sweepFile).status).toBe(0);
    expect(run('render-objectives', '--spec', specFile, '--section', SECTION, '--ids', CORE.join(','), '--trd', trdFile).status).toBe(0);
    const c = run('check', '--spec', specFile, '--section', SECTION, '--sweep', sweepFile, '--trd', trdFile);
    expect(c.status).toBe(0);
    expect(JSON.parse(c.stdout).ok).toBe(true);
    expect(JSON.parse(run('source', '--file', sweepFile).stdout).coreTrd).toBe('docs/TRD/x.md');
    const d = run('criteria', '--spec', specFile, '--section', SECTION, '--ids', 'AC-4.4');
    expect(JSON.parse(d.stdout).markdown).toContain('judge-only');
  });
  test('check exits non-zero when not ok; source exits non-zero without a header', () => {
    expect(run('check', '--spec', specFile, '--section', SECTION).status).toBe(1);
    fs.writeFileSync(path.join(dir, 'none.md'), '# nothing\n');
    const s = run('source', '--file', path.join(dir, 'none.md'));
    expect(s.status).toBe(1);
    expect(s.stderr).toMatch(/Source spec/);
  });
  test('overlap and usage errors', () => {
    expect(JSON.parse(run('overlap', '--sweep-files', 'a.js', '--trd', trdFile).stdout).ok).toBe(true);
    expect(run('bogus').status).toBe(1);
    expect(run('extract').status).toBe(1);
  });
});
