'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const { isRecordFile } = require('./record-files');
const cb = require('./ci-baseline');

const FIX = path.join(__dirname, '__fixtures__', 'ci-baseline');
const SCRIPT = path.join(__dirname, 'ci-baseline.js');
const REPO = path.resolve(__dirname, '..', '..', '..');

const read = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8');
const run = (...files) => cb.checkWorkflows(files.map((f) => ({ file: path.basename(f), text: read(f) })));
const status = (r) => Object.fromEntries(Object.entries(r.checks).map(([k, v]) => [k, v.status]));
const gapChecks = (r) => [...new Set(r.gaps.map((g) => g.check))].sort();
const unclearChecks = (r) => [...new Set(r.unclear.map((g) => g.check))].sort();

describe('probe paths', () => {
  test('every record-only probe is a record file (O4)', () => {
    for (const p of cb.RECORD_PROBE) expect(isRecordFile(p)).toBe(true);
  });
  test('docs probes are not record files', () => {
    for (const p of cb.DOCS_PROBE) expect(isRecordFile(p)).toBe(false);
  });
});

describe('matchesFilter (dorny semantics)', () => {
  test('any pattern matching is enough', () => {
    expect(cb.matchesFilter(['src/**', 'lib/**'], 'lib/a.js')).toBe(true);
    expect(cb.matchesFilter(['src/**'], 'README.md')).toBe(false);
  });
  test('a negated pattern matches files that do NOT match it', () => {
    expect(cb.matchesFilter(['!docs/**'], 'README.md')).toBe(true);
    expect(cb.matchesFilter(['!docs/**'], 'docs/guide.md')).toBe(false);
  });
  test('dotfile pin: ** matches .trd-state paths (dot: true)', () => {
    expect(cb.matchesFilter(['**'], '.trd-state/feature/custody.json')).toBe(true);
    expect(cb.matchesFilter(['**/*.json'], '.trd-state/feature/custody.json')).toBe(true);
  });
});

describe('fixtures', () => {
  test('passing: ok with no gaps or unclear', () => {
    const r = run('passing.yml');
    expect(r.ok).toBe(true);
    expect(status(r)).toEqual({ summary: 'pass', docsRecordSkip: 'pass', recordCommitSkip: 'pass' });
    expect(r.gaps).toEqual([]);
    expect(r.unclear).toEqual([]);
    expect(r.noCi).toBe(false);
  });

  test('no-summary: summary gap only on the summary check', () => {
    const r = run('no-summary.yml');
    expect(r.ok).toBe(false);
    expect(status(r)).toEqual({ summary: 'gap', docsRecordSkip: 'pass', recordCommitSkip: 'pass' });
    expect(gapChecks(r)).toEqual(['summary']);
  });

  test('no-path-filter: summary passes, jobs with no if: are gaps for b and c', () => {
    const r = run('no-path-filter.yml');
    expect(status(r)).toEqual({ summary: 'pass', docsRecordSkip: 'gap', recordCommitSkip: 'gap' });
    expect(gapChecks(r)).toEqual(['docsRecordSkip', 'recordCommitSkip']);
  });

  test('full-suite-on-record-commits: dorny gate on pull_request without git mode is a gap for c only', () => {
    const r = run('full-suite-on-record-commits.yml');
    expect(status(r)).toEqual({ summary: 'pass', docsRecordSkip: 'pass', recordCommitSkip: 'gap' });
    expect(gapChecks(r)).toEqual(['recordCommitSkip']);
  });

  test('summary under a trigger-level path filter is a gap (and so is the heavy job)', () => {
    const r = run('summary-trigger-paths.yml');
    expect(r.checks.summary.status).toBe('gap');
    expect(r.checks.docsRecordSkip.status).toBe('gap');
    expect(r.checks.recordCommitSkip.status).toBe('gap');
  });

  test('summary with always() but no needs-result read is a gap', () => {
    const r = run('summary-no-result-read.yml');
    expect(status(r)).toEqual({ summary: 'gap', docsRecordSkip: 'pass', recordCommitSkip: 'pass' });
    expect(r.gaps[0].message).toMatch(/results/);
  });

  test('heavy jobs split into a trigger-filtered second workflow are a gap', () => {
    const r = cb.checkWorkflows(['ci.yml', 'heavy.yml'].map((f) => ({ file: f, text: read(`split/${f}`) })));
    expect(r.checks.summary.status).toBe('pass');
    expect(r.checks.docsRecordSkip.status).toBe('gap');
    expect(r.checks.recordCommitSkip.status).toBe('gap');
    expect(r.gaps.some((g) => g.message.includes('heavy.yml'))).toBe(true);
  });

  test('dorny with base: event.before but the default token on pull_request is a gap for c', () => {
    const r = run('dorny-base-default-token.yml');
    expect(status(r)).toEqual({ summary: 'pass', docsRecordSkip: 'pass', recordCommitSkip: 'gap' });
  });

  test("dorny token: '' plus base: event.before passes c", () => {
    expect(run('passing.yml').checks.recordCommitSkip.status).toBe('pass');
  });

  test('run: detector naming .trd-state passes c; b is unclear (script not evaluated)', () => {
    const r = run('run-detector-trd-state.yml');
    expect(r.checks.recordCommitSkip.status).toBe('pass');
    expect(r.checks.docsRecordSkip.status).toBe('unclear');
    expect(unclearChecks(r)).toEqual(['docsRecordSkip']);
    expect(r.gaps).toEqual([]);
  });

  test('run: detector without .trd-state is unclear for c', () => {
    const r = run('run-detector-no-trd-state.yml');
    expect(r.checks.recordCommitSkip.status).toBe('unclear');
    expect(r.checks.recordCommitSkip.status).not.toBe('pass');
    expect(r.unclear.some((u) => u.check === 'recordCommitSkip' && /\.trd-state/.test(u.message))).toBe(true);
  });

  test('event-scoped deploy job is excluded, not unclear', () => {
    const r = run('event-scoped-deploy.yml');
    expect(r.ok).toBe(true);
    expect(r.unclear).toEqual([]);
  });

  test('an unparseable file is unclear for every check and never a pass or a crash', () => {
    const r = run('unparseable.yml');
    expect(r.ok).toBe(false);
    for (const n of ['summary', 'docsRecordSkip', 'recordCommitSkip']) {
      expect(r.checks[n].status).toBe('unclear');
    }
    expect(unclearChecks(r)).toEqual(['docsRecordSkip', 'recordCommitSkip', 'summary']);
    expect(r.unclear[0].message).toContain('unparseable.yml');
  });

  test('an unparseable file next to a passing one downgrades every pass to unclear', () => {
    const r = run('passing.yml', 'unparseable.yml');
    expect(r.ok).toBe(false);
    expect(Object.values(status(r))).toEqual(['unclear', 'unclear', 'unclear']);
  });

  test('no workflows: noCi with all three as gaps', () => {
    const r = cb.checkWorkflows([]);
    expect(r.noCi).toBe(true);
    expect(r.ok).toBe(false);
    expect(gapChecks(r)).toEqual(['docsRecordSkip', 'recordCommitSkip', 'summary']);
  });
});

describe('reader equivalence with js-yaml', () => {
  const files = [];
  for (const f of fs.readdirSync(FIX)) if (f.endsWith('.yml') && f !== 'unparseable.yml') files.push(path.join(FIX, f));
  for (const f of fs.readdirSync(path.join(FIX, 'split'))) files.push(path.join(FIX, 'split', f));
  const wfDir = path.join(REPO, '.github', 'workflows');
  for (const f of fs.readdirSync(wfDir)) if (/\.ya?ml$/.test(f)) files.push(path.join(wfDir, f));
  for (const rel of [
    'packages/skills/ship-setup/ensemble-ship-resume.yml',
    'packages/core/templates/github/ensemble-ship-resume.yml',
  ]) files.push(path.join(REPO, rel));

  test.each(files.map((f) => [path.relative(REPO, f), f]))('%s parses like js-yaml', (_n, f) => {
    const text = fs.readFileSync(f, 'utf8');
    expect(cb.parseYaml(text)).toEqual(yaml.load(text));
  });

  test('stress fixture: nested filters block scalar parses identically', () => {
    const doc = cb.parseYaml(read('stress.yml'));
    const step = doc.jobs.changes.steps[1];
    expect(cb.parseYaml(step.with.filters)).toEqual(yaml.load(step.with.filters));
    expect(doc.env.GREETING).toBe("it's fine");
    expect(doc.jobs.changes.steps[2].run).toContain('echo a: b');
  });

  test('anchors are rejected as unsupported, not misread', () => {
    expect(() => cb.parseYaml(read('unparseable.yml'))).toThrow(/unsupported/);
  });
});

describe('CLI', () => {
  const cli = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO });

  test('check --dir prints one JSON line and exits 0', () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cib-'));
    fs.copyFileSync(path.join(FIX, 'passing.yml'), path.join(dir, 'ci.yml'));
    const r = cli('check', '--dir', dir);
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    const out = JSON.parse(lines[0]);
    expect(out.ok).toBe(true);
    expect(out.workflows).toEqual(['ci.yml']);
    expect(Object.keys(out.checks).sort()).toEqual(['docsRecordSkip', 'recordCommitSkip', 'summary']);
  });

  test('missing dir reports noCi', () => {
    const out = JSON.parse(cli('check', '--dir', '/nonexistent/ci-baseline-dir').stdout);
    expect(out.noCi).toBe(true);
  });

  test('usage error still exits 0 with one JSON line', () => {
    const r = cli('bogus');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });
});
