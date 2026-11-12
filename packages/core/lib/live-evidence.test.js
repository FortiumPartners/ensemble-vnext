'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { deriveCriterionCovers, recordCriterionCovers, readCriterionCovers, criterionCoversPath, record, read, readFresh, manifestPath, main, MAX_LINE_BYTES, COVERS_HASH_BYTES } = require('./live-evidence');

let dir; let state; let artifact; let src;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'live-ev-')));
  state = path.join(dir, 'state');
  artifact = path.join(dir, 'shot.png');
  src = path.join(dir, 'a.js');
  fs.writeFileSync(artifact, 'png');
  fs.writeFileSync(src, 'one');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const entry = (o = {}) => ({ task: 'LIVE-1', artifact, shows: 'login ok', environment: 'local', covers: [src], ...o });

describe('record', () => {
  test('appends one line under the cap, with absolute paths, hashes and the injected clock', () => {
    expect(record(state, entry(), '2026-01-01T00:00:00.000Z')).toBe(true);
    const text = fs.readFileSync(manifestPath(state), 'utf8');
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(Buffer.byteLength(text)).toBeLessThan(MAX_LINE_BYTES);
    const row = JSON.parse(text);
    expect(row.ts).toBe('2026-01-01T00:00:00.000Z');
    expect(row.covers).toEqual([{ path: src, sha256: sha('one') }, { path: artifact, sha256: sha('png') }]);
    expect(path.isAbsolute(row.covers[0].path)).toBe(true);
  });

  test('the artifact itself is covered, so a later different capture at the same path reads as changed', () => {
    record(state, entry());
    const own = read(state)[0].covers.find((c) => c.path === artifact);
    expect(own).toEqual({ path: artifact, sha256: sha('png') });
  });

  test('a relative artifact path is stored absolute', () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try { expect(record(state, entry({ artifact: 'shot.png' }))).toBe(true); } finally { process.chdir(cwd); }
    expect(read(state)[0].artifact).toBe(artifact);
  });

  test('a covered file over COVERS_HASH_BYTES is rejected, not recorded as never-reusable', () => {
    const big = path.join(dir, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(COVERS_HASH_BYTES + 1));
    expect(record(state, entry({ covers: [big] }))).toBe(false);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
  });

  test('a relative covered path is stored absolute', () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try { expect(record(state, entry({ covers: ['a.js'] }))).toBe(true); } finally { process.chdir(cwd); }
    expect(read(state)[0].covers[0].path).toBe(src);
  });

  test('a symlink records its target, so retargeting it changes the hash', () => {
    const link = path.join(dir, 'link.js');
    fs.symlinkSync(src, link);
    record(state, entry({ covers: [link] }));
    expect(read(state)[0].covers[0]).toEqual({ path: src, sha256: sha('one') });
  });

  test.each([
    ['no artifact', { artifact: undefined }],
    ['artifact that does not exist', { artifact: '/nope/x.png' }],
    ['artifact that is a directory', { artifact: '__DIR__' }],
    ['empty covers', { covers: [] }],
    ['covers not an array', { covers: 'a.js' }],
    ['a missing covered path', { covers: ['/nope/missing.js'] }],
    ['a covered directory', { covers: ['__DIR__'] }],
    ['no task', { task: '' }],
  ])('rejects %s and writes nothing', (_n, over) => {
    for (const k of Object.keys(over)) if (over[k] === '__DIR__') over[k] = k === 'covers' ? [dir] : dir;
    expect(record(state, entry(over))).toBe(false);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
  });

  test('a line that would exceed the cap is rejected whole, never truncated', () => {
    const many = [];
    for (let i = 0; i < 40; i++) {
      const f = path.join(dir, `f-${'x'.repeat(40)}-${i}.js`);
      fs.writeFileSync(f, String(i));
      many.push(f);
    }
    expect(record(state, entry({ covers: many }))).toBe(false);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
  });
});

describe('read', () => {
  test('[] when the manifest is absent', () => {
    expect(read(state)).toEqual([]);
  });

  test('skips malformed lines and rows without artifact/covers', () => {
    record(state, entry());
    fs.appendFileSync(
      manifestPath(state),
      'not json\n{"artifact":"x"}\n{"covers":[]}\n{"artifact":"y","covers":[]}\n{"artifact":"","covers":[{"path":"/a","sha256":"b"}]}\n\n'
    );
    expect(read(state)).toHaveLength(1);
  });

  test('last entry for a repeated artifact wins', () => {
    record(state, entry({ shows: 'first' }));
    fs.writeFileSync(src, 'two');
    record(state, entry({ shows: 'second' }));
    const rows = read(state);
    expect(rows).toHaveLength(1);
    expect(rows[0].shows).toBe('second');
    expect(rows[0].covers[0].sha256).toBe(sha('two'));
  });
});

describe('readFresh', () => {
  test('drops an entry whose covered file changed and counts it', () => {
    record(state, entry());
    expect(readFresh(state)).toMatchObject({ dropped: 0, entries: [{ task: 'LIVE-1' }] });
    fs.writeFileSync(src, 'edited by review');
    const r = readFresh(state);
    expect(r.entries).toEqual([]);
    expect(r.dropped).toBe(1);
  });

  test('a deleted covered file counts as changed', () => {
    record(state, entry());
    fs.rmSync(src);
    expect(readFresh(state).dropped).toBe(1);
  });
});

describe('CLI', () => {
  const run = (...args) => spawnSync('node', [path.join(__dirname, 'live-evidence.js'), ...args], { encoding: 'utf8' });

  test('record then read round-trips', () => {
    const r = run('record', '--state-dir', state, '--task', 'LIVE-1', '--artifact', artifact,
      '--covers', src, '--shows', 'login ok', '--environment', 'local');
    expect(r.status).toBe(0);
    const out = JSON.parse(run('read', '--state-dir', state).stdout);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ task: 'LIVE-1', artifact, shows: 'login ok', environment: 'local' });
    expect(out[0].covers[0].sha256).toBe(sha('one'));
  });

  test('read omits stale entries and reports the count on stderr', () => {
    run('record', '--state-dir', state, '--task', 'T', '--artifact', artifact, '--covers', src);
    fs.writeFileSync(src, 'changed');
    const r = run('read', '--state-dir', state);
    expect(JSON.parse(r.stdout)).toEqual([]);
    expect(r.stderr).toMatch(/dropped 1 stale entry/);
  });

  test('read of an absent manifest prints []', () => {
    expect(run('read', '--state-dir', state).stdout.trim()).toBe('[]');
  });

  test('a rejected record exits 1 and writes nothing; bad usage exits 2', () => {
    const r = run('record', '--state-dir', state, '--task', 'T', '--artifact', artifact, '--covers', '/nope');
    expect(r.status).toBe(1);
    expect(fs.existsSync(manifestPath(state))).toBe(false);
    expect(run('bogus', '--state-dir', state).status).toBe(2);
    expect(run('read').status).toBe(2);
  });

  test('a line over the cap is rejected with a stderr reason naming the cap, not a missing flag', () => {
    const many = [];
    for (let i = 0; i < 40; i++) {
      const f = path.join(dir, `f-${'x'.repeat(40)}-${i}.js`);
      fs.writeFileSync(f, String(i));
      many.push(f);
    }
    const r = run('record', '--state-dir', state, '--task', 'T', '--artifact', artifact, '--covers', many.join(','));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/line cap/);
    expect(r.stderr).not.toMatch(/need --task/);
  });

  test('main is callable in-process', () => {
    const chunks = [];
    expect(main(['read', '--state-dir', state], { write: (s) => chunks.push(s) })).toBe(0);
    expect(chunks.join('')).toBe('[]\n');
  });
});

describe('criterion covers', () => {
  const TRD = `# TRD: t

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | First | x | yes |
| O2 | Second | x | yes |
| O3 | Third | x | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| T-1 | Edit things | O1 | None | ok |
| T-2 | Edit others | O2 | None | ok |
| T-3 | Change \`lib/rowonly.js\` and \`../escape.js\` and \`/abs.js\` and \`lib/missing.js\` | O3 | None | ok |

## Task Grounding

### T-1
- **Touches:** \`lib/a.js\`, \`lib/a.test.js\`, \`../out.js\`, \`/etc/passwd\`

### T-2
- **Touches:** \`lib/b.js\`
`;
  const DEF = `# Definition

| ID | Statement | Must pass |
|----|-----------|-----------|
| C-1 | does one | O1 |
| C-2 | does two, see T-1 | O2 |
| C-3 | does three | O3 |
| C-4 | does nothing mapped | |
`;
  let trd; let def;
  beforeEach(() => {
    trd = path.join(dir, 'trd.md'); def = path.join(dir, 'def.md');
    fs.writeFileSync(trd, TRD); fs.writeFileSync(def, DEF);
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'lib', 'rowonly.js'), 'x');
  });
  const derive = (ids) => deriveCriterionCovers({ trdPath: trd, definitionPath: def, ids, cwd: dir });

  test('derives from Touches via Serves, dropping ../ and absolute paths', () => {
    expect(derive(['C-1']).get('C-1')).toEqual({ covers: ['lib/a.js', 'lib/a.test.js'], source: 'touches' });
  });

  test('a task id named in the row adds that task as well as the Serves match', () => {
    expect(derive(['C-2']).get('C-2').covers).toEqual(['lib/a.js', 'lib/a.test.js', 'lib/b.js']);
  });

  test('a task with no Touches falls back to existing backticked paths in its row', () => {
    expect(derive(['C-3']).get('C-3')).toEqual({ covers: ['lib/rowonly.js'], source: 'task-row' });
  });

  test('no record when nothing maps, and ids not asked for are not derived', () => {
    const m = derive(['C-4', 'C-1']);
    expect(m.has('C-4')).toBe(false);
    expect([...m.keys()]).toEqual(['C-1']);
  });

  test('a second record merges with the first and a re-record of one id replaces it', () => {
    recordCriterionCovers(state, new Map([['C-1', { covers: ['a.js'], source: 'touches' }]]), '2026-01-01T00:00:00.000Z');
    recordCriterionCovers(state, new Map([['C-2', { covers: ['b.js'], source: 'task-row' }]]));
    expect([...readCriterionCovers(state).keys()].sort()).toEqual(['C-1', 'C-2']);
    recordCriterionCovers(state, new Map([['C-1', { covers: ['z.js'], source: 'touches' }]]));
    expect(readCriterionCovers(state).get('C-1')).toEqual(['z.js']);
    expect(readCriterionCovers(state).get('C-2')).toEqual(['b.js']);
    expect(fs.readdirSync(path.dirname(criterionCoversPath(state)))).toEqual(['criterion-covers.json']);
  });

  test('a criterion with 60 covered files is recorded intact', () => {
    const covers = Array.from({ length: 60 }, (_, i) => `packages/core/lib/some-long-file-name-${i}.js`);
    recordCriterionCovers(state, new Map([['C-1', { covers, source: 'touches' }]]));
    expect(readCriterionCovers(state).get('C-1')).toEqual(covers);
  });

  test('absent, unreadable and malformed files read as empty', () => {
    expect(readCriterionCovers(state).size).toBe(0);
    fs.mkdirSync(path.dirname(criterionCoversPath(state)), { recursive: true });
    fs.writeFileSync(criterionCoversPath(state), '{not json');
    expect(readCriterionCovers(state).size).toBe(0);
    fs.rmSync(criterionCoversPath(state));
    fs.mkdirSync(criterionCoversPath(state)); // a directory: unreadable as a file
    expect(readCriterionCovers(state).size).toBe(0);
  });

  test('CLI records only met ids and prints {recorded, none}', () => {
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, 'verification-state.json'), JSON.stringify({
      criteria: [{ id: 'C-1', status: 'met' }, { id: 'C-2', status: 'unmet' }, { id: 'C-4', status: 'met' }],
    }));
    const cwd = process.cwd();
    process.chdir(dir);
    const chunks = [];
    let code;
    try {
      code = main(['record-criteria', '--state-dir', state, '--trd', trd, '--definition', def], { write: (c) => chunks.push(c) }, { write: () => {} });
    } finally { process.chdir(cwd); }
    expect(code).toBe(0);
    expect(JSON.parse(chunks.join(''))).toEqual({ recorded: ['C-1'], none: ['C-4'] });
    expect([...readCriterionCovers(state).keys()]).toEqual(['C-1']);
  });

  test('ids: [] returns an empty map, ids: null means every id in the definition', () => {
    expect(derive([]).size).toBe(0);
    expect([...derive(null).keys()].sort()).toEqual(['C-1', 'C-2', 'C-3']);
    expect([...derive(undefined).keys()].sort()).toEqual(['C-1', 'C-2', 'C-3']);
  });

  describe('derive-criteria CLI', () => {
    const run = (args) => {
      const cwd = process.cwd();
      process.chdir(dir);
      const chunks = []; const errs = [];
      let code;
      try { code = main(args, { write: (c) => chunks.push(c) }, { write: (c) => errs.push(c) }); } finally { process.chdir(cwd); }
      return { code, out: chunks.join(''), err: errs.join('') };
    };

    test('prints {id: covers} for every mappable criterion, no source, none for unmapped', () => {
      const r = run(['derive-criteria', '--state-dir', state, '--trd', trd, '--definition', def]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.out)).toEqual({
        'C-1': ['lib/a.js', 'lib/a.test.js'],
        'C-2': ['lib/a.js', 'lib/a.test.js', 'lib/b.js'],
        'C-3': ['lib/rowonly.js'],
      });
    });

    test('a missing --trd or --definition exits 2 with a message', () => {
      const r = run(['derive-criteria', '--state-dir', state, '--definition', def]);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/derive-criteria needs --trd and --definition/);
    });

    test('an unreadable TRD exits 2', () => {
      const r = run(['derive-criteria', '--state-dir', state, '--trd', path.join(dir, 'nope.md'), '--definition', def]);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/live-evidence:/);
    });
  });

  test('CLI without --trd is a usage error', () => {
    expect(main(['record-criteria', '--state-dir', state], { write: () => {} }, { write: () => {} })).toBe(2);
  });

  describe('real data: ci-baseline-check', () => {
    const root = path.resolve(__dirname, '../../..');
    const realTrd = path.join(root, 'docs/TRD/ci-baseline-check.md');
    const realDef = path.join(root, '.trd-state/ci-baseline-check/success-definition.md');
    const ready = fs.existsSync(realTrd) && fs.existsSync(realDef);
    (ready ? test : test.skip)('every criterion whose Must pass cell names an objective gets a record', () => {
      const rows = fs.readFileSync(realDef, 'utf8').split('\n').filter((l) => /^\| FS-\d+ /.test(l));
      const withObjective = rows
        .map((l) => ({ id: l.split('|')[1].trim(), mp: l.split('|').slice(-2)[0] }))
        .filter((r) => /\bO\d+\b/.test(r.mp)).map((r) => r.id);
      expect(withObjective.length).toBeGreaterThan(0);
      const m = deriveCriterionCovers({ trdPath: realTrd, definitionPath: realDef, ids: withObjective, cwd: root });
      for (const id of withObjective) expect(m.get(id) && m.get(id).covers.length).toBeGreaterThan(0);
    });
  });
});
