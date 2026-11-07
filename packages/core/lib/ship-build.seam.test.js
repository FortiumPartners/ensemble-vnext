'use strict';

/**
 * ship-build seam test (TRD ship-build SHIP-B013).
 *
 * /ship-build is a prompt, so this test PLAYS THE LEAD: it does what the command and the
 * contracts tell a session to do, step by step. What is real: ship-sequencer.js (as its CLI),
 * the shipped contracts in packages/core/contracts, custody.js (as its CLI) and git against a
 * bare origin. What is stubbed: `gh`, the model's judgement (each step's result word is chosen
 * by the test) and any chained build. It proves the sequencer, the contracts' CLI calls and
 * custody compose; it does not prove a model obeyed the prose (the surface test pins that).
 *
 * Run with: npx jest packages/core/lib/ship-build.seam.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const discovered = require('./discovered');

const SEQ = path.join(__dirname, 'ship-sequencer.js');
const CUSTODY = path.join(__dirname, 'custody.js');
const AUTH_SENTENCE = 'A step listed in `.claude/rules/ship.md` is the owner\'s standing authorization for that act.';

const TRD = 'docs/TRD/f.md';
const TRD_TEXT = ['# F', '', '## Objectives', '', '| ID | Objective | Must pass |', '|----|-----------|-----------|', '| O1 | first | yes |', '', '## 4. Master Task List', '', '| Task ID | Description | Dependencies |', '|---------|-------------|--------------|', '| F-001 | build it | None |', ''].join('\n');
const DEFINITION = [
  '# D', '',
  '| ID | Functional statement | Cites | Evidence | Derivation | Tier 1 | Parts | Must pass |',
  '|----|----|----|----|----|----|----|----|',
  '| FS-1 | a | c | e | [read] | locator | | O1 |', '',
].join('\n');

const roots = [];
afterAll(() => roots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const cleanEnv = (extra = {}) => {
  const e = { ...process.env, ...extra };
  delete e.GIT_DIR;
  delete e.GIT_WORK_TREE;
  delete e.GIT_INDEX_FILE;
  return e;
};

/** A feature branch with a bare origin, a TRD, a closed feature and an authorizing autonomy.md. */
function setup({ policy } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ship-seam-')));
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
  commit('init', { 'src/a.js': 'a1', 'src/b.js': 'b1', [TRD]: TRD_TEXT });
  g(repo, 'push', '-u', 'origin', 'main');
  g(repo, 'checkout', '-b', 'feature/f');
  const stateDir = '.trd-state/f';
  const abs = (rel) => path.join(repo, rel);
  write(`${stateDir}/closed.json`, JSON.stringify({ feature: 'f', closedBy: 'audit', audit: { auditedCommit: null } }));
  write('.claude/rules/autonomy.md', `# Autonomy\n\n${AUTH_SENTENCE}\n`);
  if (policy) write('.claude/rules/ship.md', policy);
  const seq = (...args) => {
    const r = spawnSync(process.execPath, [SEQ, ...args], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) };
  };
  const custody = (...args) => {
    const r = spawnSync(process.execPath, [CUSTODY, ...args], { cwd: repo, encoding: 'utf8', env: cleanEnv() });
    return JSON.parse(r.stdout.trim().split('\n').pop());
  };
  const start = (fallback = '1. push') =>
    seq('start', '--state-dir', stateDir, '--policy', '.claude/rules/ship.md', '--fallback', fallback,
      '--kind', 'feature', '--id', 'f', '--trd', TRD, '--branch', 'feature/f').json;
  const next = () => seq('next', '--state-dir', stateDir).json;
  const record = (step, result, data) =>
    seq('record', '--state-dir', stateDir, '--step', step, '--result', result, ...(data ? ['--data', JSON.stringify(data)] : [])).json;
  const status = () => seq('status', '--state-dir', stateDir).json;
  const readCustody = () => JSON.parse(fs.readFileSync(abs(`${stateDir}/custody.json`), 'utf8'));

  /** The push contract's Do, steps 2 to 4: reconcile, push, prove the push link. */
  function playPush({ reverifiedStatus } = {}) {
    const common = ['--state-dir', stateDir, '--trd', TRD];
    const rec = ['reconcile', ...common, '--closed', `${stateDir}/closed.json`, '--definition', `${stateDir}/success-definition.md`];
    let r = custody(...rec);
    if (r.action === 'reverify' && reverifiedStatus) {
      const p = path.join(root, 'reverify-state.json');
      fs.writeFileSync(p, JSON.stringify({ criteria: r.ids.map((id) => ({ id, status: reverifiedStatus })) }));
      r = custody(...rec, '--reverified', p);
    }
    if (!['set', 'none', 'moved'].includes(r.action)) return { result: 'stop', reconcile: r };
    g(repo, 'push', '-u', 'origin', 'feature/f');
    const chk = custody('check', ...common, '--link', 'push', '--branch', 'feature/f');
    if (!chk.ok) return { result: 'stop', reconcile: r, check: chk };
    return { result: 'pushed', data: { branch: 'feature/f', commit: g(repo, 'rev-parse', 'HEAD'), head: g(repo, 'rev-parse', 'HEAD') }, reconcile: r, check: chk };
  }
  return { root, repo, g, write, commit, abs, stateDir, seq, custody, start, next, record, status, readCustody, playPush };
}

const EXAMPLE_5 = [
  '## Ship',
  '1. push',
  '2. open-pr',
  '3. repeat rounds=2',
  '   - push',
  '   - request-review tool=coderabbit',
  '   - wait-ci',
  '   - collect-findings',
  '   - fix-findings',
  '4. merge',
  '5. release identity="echo deployed"',
  '',
  '## After shipping',
  '1. close-issue',
  '',
].join('\n');

describe('example 5 runs to done on stubbed results', () => {
  test('every step is handed out in order, with its contract, and the run ends shipped', () => {
    const s = setup({ policy: EXAMPLE_5 });
    expect(s.start()).toMatchObject({ ok: true, policy: 'ship.md' });

    // The result each primitive reports (the lead's judgement is the only stubbed part).
    const results = {
      push: ['pushed', { head: 'h1' }],
      'open-pr': ['opened', { pr: 7, head: 'h1' }],
      'request-review': ['reviewed', {}],
      'wait-ci': ['passed', {}],
      'collect-findings': ['clean', { findings: [] }],
      merge: ['merged', { merged: true, mergedHead: 'h1' }],
      release: ['released', { commit: 'h1' }],
      'close-issue': ['closed', {}],
    };
    const seen = [];
    for (let i = 0; i < 30; i++) {
      const n = s.next();
      if (n.action === 'done') {
        expect(n.shipped).toBe(true);
        break;
      }
      expect(n.action).toBe('run');
      // `next` names the contract the lead must read, and it is a real file.
      expect(n.step.contract).toMatch(/ship-primitive-[a-z-]+\.md$/);
      expect(fs.existsSync(n.step.contract)).toBe(true);
      seen.push(n.step.primitive);
      const [word, data] = results[n.step.primitive];
      const rec = s.record(n.step.id, word, data);
      if (!rec.ok) throw new Error(`${n.step.primitive}: ${JSON.stringify(rec)}`);
    }
    // collect-findings was clean on pass 1, so the block ended there and fix-findings never ran.
    expect(seen).toEqual(['push', 'open-pr', 'push', 'request-review', 'wait-ci', 'collect-findings', 'merge', 'release', 'close-issue']);
    expect(s.status()).toMatchObject({ status: 'done', shipped: true });
  });

  test('without ship.md the fallback "1. push" is the whole run', () => {
    const s = setup();
    expect(s.start()).toMatchObject({ ok: true, policy: 'none' });
    const n = s.next();
    expect(n.step.primitive).toBe('push');
    s.record(n.step.id, 'pushed', { head: 'h' });
    expect(s.next()).toMatchObject({ action: 'done', shipped: true });
  });

  test('a step the owner has not authorized is stopped by the sequencer, not run', () => {
    const s = setup({ policy: '## Ship\n1. push\n2. open-pr\n' });
    fs.writeFileSync(s.abs('.claude/rules/autonomy.md'), '# Autonomy\n');
    expect(s.start()).toMatchObject({ ok: true });
    const p = s.next();
    s.record(p.step.id, 'pushed', { head: 'h' });
    const gated = s.next();
    expect(gated).toMatchObject({ action: 'stop', reason: 'not authorized: open-pr' });
    expect(s.status().status).toBe('stuck');
  });
});

describe('custody across push', () => {
  function withDefinition() {
    const s = setup({ policy: '## Ship\n1. push\n' });
    s.commit('work', { 'src/a.js': 'a2' });
    s.write(`${s.stateDir}/success-definition.md`, DEFINITION);
    s.write(`${s.stateDir}/verification-state.json`, JSON.stringify({
      criteria: [{ id: 'FS-1', status: 'met', artifact: path.join(s.repo, s.stateDir, 'evidence', 'FS-1.txt') }],
    }));
    s.write(`${s.stateDir}/evidence/FS-1.txt`, 'proof');
    s.start();
    const first = s.playPush();
    expect(first.result).toBe('pushed');
    expect(first.reconcile.action).toBe('set');
    return s;
  }

  test('a fix commit changing shipped source cannot pass push until re-verification shows its ids met', () => {
    const s = withDefinition();
    const anchor = s.readCustody().anchor.commit;
    s.commit('fix', { 'src/b.js': 'b2' });

    const refused = s.playPush({ reverifiedStatus: 'unmet' });
    expect(refused.result).toBe('stop');
    expect(refused.reconcile.action).toBe('refused');
    expect(s.readCustody().anchor.commit).toBe(anchor);
    // Nothing left the machine: origin still holds the audited code.
    expect(s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f')).toContain(anchor);

    const passed = s.playPush({ reverifiedStatus: 'met' });
    expect(passed.result).toBe('pushed');
    expect(passed.reconcile.action).toBe('moved');
    expect(s.readCustody().anchor.commit).not.toBe(anchor);
    expect(s.readCustody().moves[0]).toMatchObject({ rule: 'reverified', reverified: ['FS-1'] });
  });

  test('a custody mismatch at the push link names the differing file', () => {
    const s = withDefinition();
    // A commit made after reconcile and before the push check, as a step that commits would do.
    const common = ['--state-dir', s.stateDir, '--trd', TRD];
    s.commit('sneaky', { 'src/b.js': 'b9' });
    s.g(s.repo, 'push', '-u', 'origin', 'feature/f');
    const chk = s.custody('check', ...common, '--link', 'push', '--branch', 'feature/f');
    expect(chk.ok).toBe(false);
    expect(chk.differing).toEqual(['src/b.js']);
    expect(chk.reason).toMatch(/src\/b\.js/);
  });

  test('committing the state directory does not move the anchor', () => {
    const s = withDefinition();
    const before = s.readCustody().anchor.commit;
    s.g(s.repo, 'add', '--', s.stateDir);
    s.g(s.repo, 'commit', '-m', 'chore(f): ship-build record', '--', s.stateDir);
    const again = s.playPush();
    expect(again.reconcile.action).toBe('none');
    expect(again.result).toBe('pushed');
    expect(s.readCustody().anchor.commit).toBe(before);
  });
});

describe('a wait parks the run and resumes at the same step', () => {
  test('await-approval returns wait, the state survives, and next hands out the same step', () => {
    const s = setup({ policy: '## Ship\n1. push\n2. open-pr base=main\n3. await-approval\n' });
    s.start();
    for (const [word, data] of [['pushed', { head: 'h' }], ['opened', { pr: 3, head: 'h' }]]) {
      const n = s.next();
      s.record(n.step.id, word, data);
    }
    const parked = s.next();
    expect(parked.step.primitive).toBe('await-approval');
    expect(s.record(parked.step.id, 'wait', { remoteResume: false })).toMatchObject({ ok: true, status: 'waiting' });
    expect(s.status().status).toBe('waiting');

    // A later session: start loads the state file and never re-reads ship.md.
    fs.rmSync(s.abs('.claude/rules/ship.md'));
    expect(s.start()).toMatchObject({ ok: true, resumed: true });
    const again = s.next();
    expect(again.action).toBe('run');
    expect(again.step.id).toBe(parked.step.id);
    expect(s.record(again.step.id, 'approved', { decision: 'APPROVED', head: 'h' })).toMatchObject({ ok: true });
    expect(s.next()).toMatchObject({ action: 'done', shipped: true });
  });
});

describe('a finding filed once is not filed on a re-run', () => {
  test('resolving a row with the filed marker removes it from the open set', () => {
    const s = setup();
    const dir = s.abs(s.stateDir);
    discovered.record(dir, { kind: 'gap', foundBy: 'collect-findings', phase: 0, summary: '[below-critical] a minor thing', file: 'src/a.js', evidence: 'review' });
    const open1 = discovered.readAll(dir, { open: true });
    expect(open1).toHaveLength(1);
    // file-followups: file the row, then mark it filed.
    expect(discovered.resolve(dir, open1[0], 'filed https://example.test/issues/1')).toBe(true);
    // The re-run reads the same ledger and finds nothing left to file.
    expect(discovered.readAll(dir, { open: true })).toHaveLength(0);
  });
});
