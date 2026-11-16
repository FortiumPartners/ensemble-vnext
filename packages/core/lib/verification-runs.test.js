'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const vr = require('./verification-runs');
const wd = require('./waived-defects');

const CLI = path.join(__dirname, 'verification-runs.js');

function fixture({ setting, runs = [], vstate, definition, report } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  if (setting !== undefined) {
    fs.mkdirSync(path.join(root, '.claude'));
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), typeof setting === 'string' ? setting : JSON.stringify({ ensemble: setting }));
  }
  const dir = path.join(root, '.trd-state', 'f');
  fs.mkdirSync(dir, { recursive: true });
  const impl = { functional_verification: { prd_path: 'docs/PRD/f.md', environments: ['local'], runs } };
  fs.writeFileSync(path.join(dir, 'implement.json'), JSON.stringify(impl));
  if (vstate) fs.writeFileSync(path.join(dir, 'verification-state.json'), JSON.stringify(vstate));
  if (definition) fs.writeFileSync(path.join(dir, 'success-definition.md'), definition);
  if (report) fs.writeFileSync(path.join(dir, 'verification-report.md'), report);
  return { root, dir };
}

const run = (n, over = {}) => ({ n, command: '/verify-build', started_at: `2026-11-1${n}T00:00:00Z`, scope: 'full', outcome: 'stalled', finished_at: `2026-11-1${n}T01:00:00Z`, open: [], ...over });
const cli = (args) => {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status, json: r.stdout ? JSON.parse(r.stdout.trim().split('\n').pop()) : null };
};
const impl = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'implement.json'), 'utf8'));
const DEF = '| ID | Functional statement | Must pass |\n|---|---|---|\n| C-1 | Login shows the dashboard | no |\n| C-2 | Logout works | no |\n';

describe('readLimit', () => {
  test('absent file and absent setting give 2', () => {
    expect(vr.readLimit(fixture().root)).toBe(2);
    expect(vr.readLimit(fixture({ setting: {} }).root)).toBe(2);
    expect(vr.readLimit(fixture({ setting: { verificationRunLimit: null } }).root)).toBe(2);
  });
  test('an integer of at least 1 is used', () => {
    expect(vr.readLimit(fixture({ setting: { verificationRunLimit: 5 } }).root)).toBe(5);
  });
  test.each([0, -1, '2', 2.5])('%p is refused naming the setting', (v) => {
    const { root, dir } = fixture({ setting: { verificationRunLimit: v } });
    expect(() => vr.readLimit(root)).toThrow(/ensemble\.verificationRunLimit/);
    const r = cli(['check', '--state-dir', dir, '--root', root]);
    expect(r.status).toBe(2);
    expect(r.json.error).toMatch(/ensemble\.verificationRunLimit/);
  });
  test('settings that are not JSON are refused', () => {
    expect(() => vr.readLimit(fixture({ setting: '{nope' }).root)).toThrow(/ensemble\.verificationRunLimit/);
  });
});

describe('start / check', () => {
  test('two finished runs then start is refused and the file is unchanged', () => {
    const { root, dir } = fixture({ runs: [run(1), run(2)] });
    const before = fs.readFileSync(path.join(dir, 'implement.json'), 'utf8');
    const r = vr.start(dir, { command: '/verify-build', scope: 'full', root });
    expect(r).toMatchObject({ allowed: false, count: 2, limit: 2, run: null });
    expect(fs.readFileSync(path.join(dir, 'implement.json'), 'utf8')).toBe(before);
    const c = cli(['check', '--state-dir', dir, '--root', root]);
    expect(c.status).toBe(0);
    expect(c.json).toMatchObject({ allowed: false, count: 2 });
  });

  test('start appends and keeps the other functional_verification keys', () => {
    const { root, dir } = fixture({ runs: [run(1)] });
    const r = vr.start(dir, { command: '/implement-trd', scope: 'targeted', root, nowIso: '2026-11-16T00:00:00Z' });
    expect(r).toMatchObject({ allowed: true, continued: false, count: 2 });
    expect(r.run).toMatchObject({ n: 2, command: '/implement-trd', scope: 'targeted', outcome: null, finished_at: null, open: [] });
    const fv = impl(dir).functional_verification;
    expect(fv.prd_path).toBe('docs/PRD/f.md');
    expect(fv.environments).toEqual(['local']);
    expect(fv.runs).toHaveLength(2);
  });

  test('a limit of 5 allows a third run', () => {
    const { root, dir } = fixture({ setting: { verificationRunLimit: 5 }, runs: [run(1), run(2)] });
    expect(vr.start(dir, { command: '/verify-build', scope: 'full', root }).allowed).toBe(true);
  });

  test('an unfinished entry with outcome null in the state file is continued, not added', () => {
    const { root, dir } = fixture({ runs: [run(1), run(2, { outcome: null, finished_at: null })], vstate: { outcome: null, criteria: [] } });
    expect(vr.status(dir, { root })).toMatchObject({ allowed: true, continuing: true, count: 2 });
    const r = vr.start(dir, { command: '/verify-build', scope: 'full', root });
    expect(r).toMatchObject({ allowed: true, continued: true, count: 2 });
    expect(impl(dir).functional_verification.runs).toHaveLength(2);
  });

  test('an unfinished entry whose state file has an outcome is closed abandoned and counts', () => {
    const one = fixture({ runs: [run(1, { outcome: null, finished_at: null })], vstate: { outcome: 'stalled', criteria: [] } });
    const r1 = vr.start(one.dir, { command: '/verify-build', scope: 'full', root: one.root });
    expect(r1).toMatchObject({ allowed: true, continued: false, count: 2 });
    expect(impl(one.dir).functional_verification.runs[0].outcome).toBe('abandoned');

    const two = fixture({ runs: [run(1), run(2, { outcome: null, finished_at: null })], vstate: { outcome: 'stalled', criteria: [] } });
    const before = fs.readFileSync(path.join(two.dir, 'implement.json'), 'utf8');
    expect(vr.start(two.dir, { command: '/verify-build', scope: 'full', root: two.root })).toMatchObject({ allowed: false, count: 2 });
    expect(fs.readFileSync(path.join(two.dir, 'implement.json'), 'utf8')).toBe(before);
  });

  test('start seeds a runs-only stub when implement.json is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
    const dir = path.join(root, '.trd-state', 'g');
    expect(vr.status(dir, { root })).toMatchObject({ count: 0, allowed: true });
    vr.start(dir, { command: '/verify-build', scope: 'full', root });
    expect(Object.keys(impl(dir))).toEqual(['functional_verification']);
  });

  test('a bad command or scope is a usage error', () => {
    const { dir } = fixture();
    expect(cli(['start', '--state-dir', dir, '--command', '/nope', '--scope', 'full']).status).toBe(2);
  });
});

describe('finish', () => {
  const vstate = {
    outcome: 'stalled',
    criteria: [
      { id: 'C-1', status: 'not_met', cause: 'judged-failed', reason: 'blank page' },
      { id: 'C-2', status: 'met' },
    ],
  };
  const open1 = (extra = {}) => run(1, { outcome: null, finished_at: null, ...extra });

  test('with no unfinished entry exits non-zero', () => {
    const { dir } = fixture({ runs: [run(1)] });
    const r = cli(['finish', '--state-dir', dir, '--outcome', 'stalled']);
    expect(r.status).not.toBe(0);
    expect(r.json.error).toMatch(/no run in progress/);
  });

  test('reads open from verification-state.json (not met only)', () => {
    const { root, dir } = fixture({ runs: [open1()], vstate });
    const r = vr.finish(dir, { outcome: 'stalled', root, nowIso: '2026-11-16T02:00:00Z' });
    expect(r.run).toMatchObject({ outcome: 'stalled', finished_at: '2026-11-16T02:00:00Z', open: ['C-1'] });
    expect(impl(dir).functional_verification.runs[0].open).toEqual(['C-1']);
    expect(impl(dir).functional_verification.prd_path).toBe('docs/PRD/f.md');
  });

  test('a custody re-proof that met a criterion takes it out of open', () => {
    const { root, dir } = fixture({ runs: [open1()], vstate });
    fs.mkdirSync(path.join(dir, 'reverify'));
    fs.writeFileSync(path.join(dir, 'reverify', 'verification-state.json'), JSON.stringify({ criteria: [{ id: 'C-1', status: 'met' }] }));
    expect(vr.finish(dir, { outcome: 'satisfied', root }).run.open).toEqual([]);
  });

  test.each([
    ['stalled', 'stalled', 2, false, true],
    ['stalled', 'stalled', 1, false, false],
    ['satisfied', 'satisfied', 2, false, false],
    ['satisfied', 'satisfied', 2, true, true],
    ['setup-failure', 'setup-failure', 2, false, true],
  ])('%s at %i of 2 (definition problem %s) -> rulingDue %s', (_n, outcome, count, dp, due) => {
    const prior = count === 2 ? [run(1)] : [];
    const crit = dp ? [{ id: 'C-1', status: 'not_met', settled: 'definition-problem' }] : [{ id: 'C-1', status: outcome === 'satisfied' ? 'met' : 'not_met' }];
    const { root, dir } = fixture({ runs: [...prior, run(prior.length + 1, { outcome: null, finished_at: null })], vstate: { outcome, criteria: crit } });
    expect(vr.finish(dir, { outcome, root }).rulingDue).toBe(due);
  });

  test('when ruling is due only the Next line of the report changes', () => {
    const report = '# Report\n\n**Outcome**: stalled\n**Next**: refine the plan with `/refine-verification`\n\n## Rest\nbody\n';
    const { root, dir } = fixture({ runs: [run(1), open1({ n: 2 })], vstate, report });
    const r = vr.finish(dir, { outcome: 'stalled', root });
    expect(r.rulingDue).toBe(true);
    const after = fs.readFileSync(path.join(dir, 'verification-report.md'), 'utf8').split('\n');
    const was = report.split('\n');
    expect(after).toHaveLength(was.length);
    after.forEach((l, i) => {
      if (was[i].startsWith('**Next**:')) expect(l).toContain('ruling-request.md');
      else expect(l).toBe(was[i]);
    });
  });

  test('the report is left alone when no ruling is due', () => {
    const report = '**Next**: `/audit-build`\n';
    const { root, dir } = fixture({ runs: [open1()], vstate: { outcome: 'satisfied', criteria: [{ id: 'C-1', status: 'met' }] }, report });
    vr.finish(dir, { outcome: 'satisfied', root });
    expect(fs.readFileSync(path.join(dir, 'verification-report.md'), 'utf8')).toBe(report);
  });
});

describe('ruling request', () => {
  const state = { outcome: 'stalled', criteria: [{ id: 'C-1', status: 'not_met', kind: 'behaviour', cause: 'judged-failed', reason: 'blank page' }, { id: 'C-2', status: 'met' }] };

  test('lists each open criterion with statement, cause and runs-open count', () => {
    const { root, dir } = fixture({ runs: [run(1, { open: ['C-1'] }), run(2, { open: ['C-1', 'C-3'] })], vstate: state, definition: DEF });
    const { path: p, open } = vr.renderRulingRequest(dir, { root });
    expect(open).toHaveLength(1);
    const text = fs.readFileSync(p, 'utf8');
    expect(text).toContain('**C-1** — Login shows the dashboard');
    expect(text).toContain('cause: judged failed');
    expect(text).toContain('open in 2 of 2 runs');
    expect(text).not.toContain('C-2**');
    expect(text).toMatch(/product PM, who may escalate to the owner/);
    for (const o of ['Ship as is', 'Fix one named thing', 'Drop it']) expect(text).toContain(o);
    expect(text).toContain('record-ruling --state-dir .trd-state/f --outcome ship');
    expect(text).toContain('/amend');
    expect(text.match(/\/audit-build/g)).toHaveLength(3);
  });

  test('falls back to the state reason when the definition has no statement', () => {
    const { root, dir } = fixture({ runs: [run(1, { open: ['C-1'] })], vstate: state });
    expect(fs.readFileSync(vr.renderRulingRequest(dir, { root }).path, 'utf8')).toContain('**C-1** — blank page');
  });

  test('says nothing is open for an empty list and still lists the outcomes', () => {
    const { root, dir } = fixture({ runs: [run(1), run(2)], vstate: { outcome: 'satisfied', criteria: [{ id: 'C-1', status: 'met' }] } });
    const text = fs.readFileSync(vr.renderRulingRequest(dir, { root }).path, 'utf8');
    expect(text).toContain('nothing is open');
    expect(text).toContain('Ship as is');
  });

  test('rendering twice with unchanged inputs gives identical text', () => {
    const { root, dir } = fixture({ runs: [run(1, { open: ['C-1'] })], vstate: state, definition: DEF });
    const a = fs.readFileSync(vr.renderRulingRequest(dir, { root, nowIso: '2026-11-16T00:00:00Z' }).path, 'utf8');
    const b = fs.readFileSync(vr.renderRulingRequest(dir, { root, nowIso: '2026-12-01T00:00:00Z', command: '/refine-verification' }).path, 'utf8');
    expect(b).toBe(a);
  });
});

describe('record-ruling', () => {
  const two = { criteria: [{ id: 'C-1', status: 'not_met', reason: 'a' }, { id: 'C-2', status: 'unbuilt', reason: 'b' }, { id: 'C-3', status: 'met' }] };
  const mk = () => fixture({ runs: [run(1), run(2)], vstate: two, definition: DEF });

  test('ship writes one [non-blocking] row per open id and listWaived returns them', () => {
    const { dir } = mk();
    const r = vr.recordRuling(dir, { outcome: 'ship', by: 'pm', nowIso: '2026-11-16T00:00:00Z' });
    expect(r.waived.recorded.sort()).toEqual(['C-1', 'C-2']);
    const w = wd.listWaived(dir);
    expect(w.map((x) => x.ref).sort()).toEqual(['C-1', 'C-2']);
    w.forEach((x) => expect(x.summary.startsWith('[non-blocking] ')).toBe(true));
    expect(w[0].summary).toContain('shipped as is by ruling 2026-11-16');
    expect(impl(dir).functional_verification).toMatchObject({ prd_path: 'docs/PRD/f.md', ruling: { outcome: 'ship', by: 'pm' } });
    expect(impl(dir).functional_verification.runs).toHaveLength(2);
  });

  test('fix --criterion X waives all but X', () => {
    const { dir } = mk();
    vr.recordRuling(dir, { outcome: 'fix', criterion: 'C-1', by: 'pm' });
    expect(wd.listWaived(dir).map((x) => x.ref)).toEqual(['C-2']);
  });

  test('fix with a non-open id is non-zero and writes nothing', () => {
    const { dir } = mk();
    const r = cli(['record-ruling', '--state-dir', dir, '--outcome', 'fix', '--criterion', 'C-3', '--by', 'pm']);
    expect(r.status).not.toBe(0);
    expect(r.json.error).toMatch(/C-3/);
    expect(wd.listWaived(dir)).toEqual([]);
    expect(impl(dir).functional_verification.ruling).toBeUndefined();
  });

  test('drop rows say dropped by ruling', () => {
    const { dir } = mk();
    vr.recordRuling(dir, { outcome: 'drop', by: 'pm', nowIso: '2026-11-16T00:00:00Z' });
    wd.listWaived(dir).forEach((x) => expect(x.summary).toContain('dropped by ruling'));
  });

  test('an issue filed from a ruling row is worded as waived by the PM ruling', () => {
    const { dir } = mk();
    vr.recordRuling(dir, { outcome: 'ship', by: 'pm' });
    const row = wd.listWaived(dir).find((x) => x.ref === 'C-1');
    const { body } = wd.buildIssue(dir, row);
    expect(body).toContain("Shipped as is by the product PM's ruling");
    expect(body).not.toContain('Blocking: must-pass only');
  });

  test('the CLI re-renders an existing request so it shows the ruling', () => {
    const { root, dir } = mk();
    vr.renderRulingRequest(dir, { root });
    const r = cli(['record-ruling', '--state-dir', dir, '--outcome', 'drop', '--by', 'pm', '--root', root]);
    expect(r.status).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'ruling-request.md'), 'utf8')).toContain('## Recorded ruling');
  });

  test('--by is required', () => {
    const { dir } = mk();
    expect(cli(['record-ruling', '--state-dir', dir, '--outcome', 'ship']).status).not.toBe(0);
  });
});
