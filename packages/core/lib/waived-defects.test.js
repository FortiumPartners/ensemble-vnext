'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const discovered = require('./discovered');
const wd = require('./waived-defects');
const fv = require('./functional-verification');

const URL1 = 'https://github.com/o/r/issues/7';

function setup({ tracker = 'github', project = 'o/r', waived = ['C-1'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'rules', 'stack.md'),
    `# Stack\n\n## Issue Tracker\n\nTracker: ${tracker}\nProject: ${project}\n\n---\n\n## Other\n`
  );
  const stateDir = path.join(root, '.trd-state', 'f');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'success-definition.md'),
    '| ID | Criterion | Must-pass |\n|---|---|---|\n| C-1 | Login shows the dashboard | no |\n| C-2 | Logout works | no |\n'
  );
  fs.writeFileSync(
    path.join(stateDir, 'verification-state.json'),
    JSON.stringify({ criteria: [{ id: 'C-1', status: 'not_met', reason: 'blank page after login', artifact: 'evidence/c1.png' }] })
  );
  for (const id of waived) fv.recordNonBlockingFollowups(stateDir, [id]);
  return { root, stateDir };
}

function stub({ createFails = false, labels = [], viewFails = false } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    expect(cmd).toBe('gh');
    const sub = args.slice(0, 2).join(' ');
    if (sub === 'repo view') return viewFails ? { status: 1, stdout: '', stderr: 'not found' } : { status: 0, stdout: '{"name":"r"}', stderr: '' };
    if (sub === 'label list') return { status: 0, stdout: JSON.stringify(labels.map((name) => ({ name }))), stderr: '' };
    if (sub === 'label create') return { status: 0, stdout: '', stderr: '' };
    if (sub === 'issue create') {
      if (createFails) return { status: 1, stdout: '', stderr: 'HTTP 403 forbidden' };
      const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      calls[calls.length - 1].body = body;
      return { status: 0, stdout: `${URL1}\n`, stderr: '' };
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { run, calls };
}

const creates = (calls) => calls.filter((c) => c[1] === 'issue' && c[2] === 'create');
const ledgerLines = (stateDir) => fs.readFileSync(discovered.ledgerPath(stateDir), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('waived-defects', () => {
  test('(a) files one labelled defect issue, then never again', () => {
    const { root, stateDir } = setup();
    const s = stub();
    const r = wd.gate(stateDir, { root, runner: s.run });
    expect(r.ok).toBe(true);
    expect(r.filed).toEqual([{ ref: 'C-1', url: URL1 }]);
    const [c] = creates(s.calls);
    expect(creates(s.calls)).toHaveLength(1);
    expect(c[c.indexOf('--label') + 1]).toBe('defect');
    expect(c[c.indexOf('--title') + 1]).toContain('C-1');
    expect(c.body).toContain('Login shows the dashboard');
    expect(c.body).toContain('blank page after login');
    expect(c.body).toContain('evidence/c1.png');
    expect(c.body).toContain('stays open until someone decides not to fix it');
    expect(s.calls.some((x) => x[1] === 'label' && x[2] === 'create')).toBe(true);

    const s2 = stub();
    const r2 = wd.gate(stateDir, { root, runner: s2.run });
    expect(r2.ok).toBe(true);
    expect(r2.already).toEqual([{ ref: 'C-1', url: URL1 }]);
    expect(creates(s2.calls)).toHaveLength(0);
    // re-running the follow-up recorder does not mint a second row for a filed criterion
    expect(fv.recordNonBlockingFollowups(stateDir, [{ id: 'C-1' }]).skipped).toEqual(['C-1']);
  });

  test('(b) a failing issue create refuses and writes no marker', () => {
    const { root, stateDir } = setup();
    const before = ledgerLines(stateDir).length;
    const r = wd.gate(stateDir, { root, runner: stub({ createFails: true }).run });
    expect(r.ok).toBe(false);
    expect(r.failed[0]).toMatchObject({ ref: 'C-1' });
    expect(r.failed[0].summary).toMatch(/^\[non-blocking\] C-1/);
    expect(r.failed[0].error).toContain('403');
    expect(ledgerLines(stateDir)).toHaveLength(before);
  });

  test('(c) no tracker with an unfiled waived row refuses', () => {
    const { root, stateDir } = setup({ tracker: 'none', project: '' });
    const s = stub();
    const r = wd.gate(stateDir, { root, runner: s.run });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no tracker declared in stack.md');
    expect(s.calls).toHaveLength(0);
  });

  test('(d) a row with a recorded URL is already, not filed', () => {
    const { root, stateDir } = setup();
    expect(wd.recordFiled(stateDir, 'C-1', URL1).ok).toBe(true);
    const s = stub();
    const r = wd.gate(stateDir, { root, runner: s.run });
    expect(r.already).toHaveLength(1);
    expect(r.filed).toHaveLength(0);
    expect(s.calls).toHaveLength(0);
  });

  test('(e) only issue create, label list, label create and repo view are ever called', () => {
    const { root, stateDir } = setup({ waived: ['C-1', 'C-2'] });
    const s = stub();
    wd.gate(stateDir, { root, runner: s.run });
    for (const c of s.calls) expect(['issue create', 'label list', 'label create', 'repo view']).toContain(`${c[1]} ${c[2]}`);
    expect(creates(s.calls)).toHaveLength(2);
  });

  test('(f) no tracker and no waived rows is ok without calling the runner', () => {
    const { root, stateDir } = setup({ tracker: 'none', project: '', waived: [] });
    const s = stub();
    expect(wd.gate(stateDir, { root, runner: s.run })).toMatchObject({ ok: true });
    expect(s.calls).toHaveLength(0);
  });

  test('(g) a waived row followed by a met row for the same criterion is not filed', () => {
    const { root, stateDir } = setup();
    discovered.record(stateDir, { kind: 'gap', foundBy: 'x', status: 'met', ref: 'C-1', summary: 'C-1 met' }, '2999-01-01T00:00:00.000Z');
    const s = stub();
    expect(wd.gate(stateDir, { root, runner: s.run }).ok).toBe(true);
    expect(s.calls).toHaveLength(0);
  });

  test('(h) a second waived row for a criterion that has a URL reuses it', () => {
    const { root, stateDir } = setup();
    wd.recordFiled(stateDir, 'C-1', URL1);
    discovered.record(stateDir, { kind: 'gap', foundBy: 'x', status: 'not_met', ref: 'C-1', summary: '[non-blocking] C-1: again' }, '2999-01-01T00:00:00.000Z');
    const s = stub();
    const r = wd.gate(stateDir, { root, runner: s.run });
    expect(r.already).toEqual([{ ref: 'C-1', url: URL1 }]);
    expect(creates(s.calls)).toHaveLength(0);
  });

  test('(i) issue created but marker write fails: ok false, failed carries the URL', () => {
    const { root, stateDir } = setup();
    const spy = jest.spyOn(discovered, 'resolve').mockReturnValue(false);
    try {
      const r = wd.gate(stateDir, { root, runner: stub().run });
      expect(r.ok).toBe(false);
      expect(r.failed[0].url).toBe(URL1);
    } finally {
      spy.mockRestore();
    }
  });

  test('(j) record-filed via the CLI is read as already by the next gate', () => {
    const { root, stateDir } = setup({ tracker: 'linear', project: 'ENG' });
    expect(wd.gate(stateDir, { root, runner: stub().run })).toMatchObject({ ok: false, reason: 'file via the linear skill' });
    const cli = spawnSync('node', [path.join(__dirname, 'waived-defects.js'), 'record-filed', '--state-dir', stateDir, '--ref', 'C-1', '--url', 'https://linear.app/x/issue/ENG-1'], { encoding: 'utf8' });
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout).ok).toBe(true);
    const r = wd.gate(stateDir, { root, runner: stub().run });
    expect(r.ok).toBe(true);
    expect(r.already[0].ref).toBe('C-1');
  });

  test('parseTracker and unreachable tracker', () => {
    expect(wd.parseTracker('## Issue Tracker\nTracker: GitHub\nProject: a/b\n')).toEqual({ tracker: 'github', project: 'a/b' });
    expect(wd.parseTracker('nothing')).toEqual({ tracker: 'none', project: '' });
    const { root, stateDir } = setup();
    const r = wd.gate(stateDir, { root, runner: stub({ viewFails: true }).run });
    expect(r).toMatchObject({ ok: false, reason: 'tracker not reachable' });
  });

  test('(h2) the newer waived row of a filed criterion is marked with the same URL, so it is no longer open', () => {
    const { root, stateDir } = setup();
    wd.recordFiled(stateDir, 'C-1', URL1);
    discovered.record(stateDir, { kind: 'gap', foundBy: 'x', status: 'not_met', ref: 'C-1', summary: '[non-blocking] C-1: again' }, '2999-01-01T00:00:00.000Z');
    wd.gate(stateDir, { root, runner: stub().run });
    expect(discovered.readAll(stateDir, { open: true }).filter((r) => r.ref === 'C-1')).toHaveLength(0);
  });

  test('a criterion the latest verification run proved met is retired, not filed', () => {
    const { root, stateDir } = setup();
    fs.writeFileSync(path.join(stateDir, 'verification-state.json'), JSON.stringify({ criteria: [{ id: 'C-1', status: 'met' }] }));
    const s = stub();
    const r = wd.gate(stateDir, { root, runner: s.run });
    expect(r).toMatchObject({ ok: true, retired: [{ ref: 'C-1' }], filed: [] });
    expect(s.calls).toHaveLength(0);
    expect(wd.listWaived(stateDir)).toHaveLength(0);
  });

  test('--stack reads the named stack.md, not the branch copy', () => {
    const { root, stateDir } = setup({ tracker: 'none', project: '' });
    const other = path.join(root, 'base-stack.md');
    fs.writeFileSync(other, '## Issue Tracker\nTracker: github\nProject: o/r\n');
    const r = wd.gate(stateDir, { root, runner: stub().run, stackPath: other });
    expect(r).toMatchObject({ ok: true, tracker: 'github', filed: [{ ref: 'C-1', url: URL1 }] });
  });

  test('a Linear tracker with no Project refuses on the missing Project', () => {
    const { root, stateDir } = setup({ tracker: 'linear', project: '' });
    expect(wd.gate(stateDir, { root, runner: stub().run }).reason).toMatch(/no Project/);
  });

  test('the issue body names the feature, branch and ledger row', () => {
    const { stateDir } = setup();
    fs.writeFileSync(path.join(stateDir, 'implement.json'), JSON.stringify({ branch: 'feature/x', trd_file: 'docs/TRD/f.md' }));
    const [row] = wd.listWaived(stateDir);
    const { body } = wd.buildIssue(stateDir, row);
    expect(body).toContain('**Feature:** f (TRD `docs/TRD/f.md`)');
    expect(body).toContain('**Branch:** feature/x');
    expect(body).toContain(row.ts);
  });

  test('bad CLI usage exits non-zero', () => {
    expect(spawnSync('node', [path.join(__dirname, 'waived-defects.js'), 'gate'], { encoding: 'utf8' }).status).toBe(2);
  });
});
