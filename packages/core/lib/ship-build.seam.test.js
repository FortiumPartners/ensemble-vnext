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
const MERGE_UP = path.join(__dirname, 'merge-up.js');
const RECORD_FILES = path.join(__dirname, 'record-files.js');
const LIVE_EVIDENCE = path.join(__dirname, 'live-evidence.js');
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

  /** The push contract's Do, steps 2 and 3: set the anchor if none exists, then push (ungated). */
  function playPush() {
    const r = custody('reconcile', '--set-only', '--state-dir', stateDir, '--trd', TRD, '--closed', `${stateDir}/closed.json`);
    g(repo, 'push', '-u', 'origin', 'feature/f');
    const head = g(repo, 'rev-parse', 'HEAD');
    return { result: 'pushed', data: { branch: 'feature/f', commit: head, head }, reconcile: r };
  }

  /**
   * The custody gate (ship-custody-gate.md) as the merge step runs it: the PR head is what
   * origin holds for the branch (gh is stubbed), reconcile with --head and --base, and on
   * `reverify` repeat it with --reverified.
   */
  function playGate({ reverifiedStatus } = {}) {
    g(repo, 'fetch', 'origin', 'main');
    const prHead = g(repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
    const rec = ['reconcile', '--state-dir', stateDir, '--trd', TRD, '--closed', `${stateDir}/closed.json`,
      '--definition', `${stateDir}/success-definition.md`, '--base', 'origin/main', '--head', prHead];
    let r = custody(...rec);
    if (r.action === 'reverify' && reverifiedStatus) {
      const p = path.join(root, 'reverify-state.json');
      fs.writeFileSync(p, JSON.stringify({ criteria: r.ids.map((id) => ({ id, status: reverifiedStatus })) }));
      r = custody(...rec, '--reverified', p);
    }
    return { result: ['set', 'none', 'moved'].includes(r.action) ? 'go' : 'stop', reconcile: r };
  }
  return { root, repo, g, write, commit, abs, stateDir, seq, custody, start, next, record, status, readCustody, playPush, playGate };
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

describe('custody across push and the merge gate', () => {
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

  test('a fix commit changing shipped source is pushed, but the gate stops the merge until its ids are met', () => {
    const s = withDefinition();
    const anchor = s.readCustody().anchor.commit;
    s.commit('fix', { 'src/b.js': 'b2' });

    // The push is not gated and never moves the anchor.
    const pushed = s.playPush();
    expect(pushed.result).toBe('pushed');
    expect(pushed.reconcile.action).toBe('none');
    expect(s.readCustody().anchor.commit).toBe(anchor);

    const refused = s.playGate({ reverifiedStatus: 'unmet' });
    expect(refused.result).toBe('stop');
    expect(refused.reconcile.action).toBe('refused');
    expect(s.readCustody().anchor.commit).toBe(anchor);

    const passed = s.playGate({ reverifiedStatus: 'met' });
    expect(passed.result).toBe('go');
    expect(passed.reconcile.action).toBe('moved');
    expect(s.readCustody().anchor.commit).toBe(s.g(s.repo, 'rev-parse', 'HEAD'));
    expect(s.readCustody().moves[0]).toMatchObject({ rule: 'reverified', reverified: ['FS-1'] });
  });

  test('a commit made locally and never pushed stops the gate, naming the differing file', () => {
    const s = withDefinition();
    s.commit('sneaky', { 'src/b.js': 'b9' });
    const r = s.playGate();
    expect(r.result).toBe('stop');
    expect(r.reconcile.differing).toEqual(['src/b.js']);
    expect(r.reconcile.reason).toMatch(/src\/b\.js/);
  });

  test('a parked record commit that was never pushed neither moves the anchor nor stops the gate', () => {
    const s = withDefinition();
    const before = s.readCustody().anchor.commit;
    s.g(s.repo, 'add', '--', s.stateDir);
    s.g(s.repo, 'commit', '-m', 'chore(f): ship-build record', '--', s.stateDir);
    const gate = s.playGate();
    expect(gate.result).toBe('go');
    expect(gate.reconcile.action).toBe('none');
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

describe('merge step: bringing the base in, then the gate, pr-head check and gh pr merge', () => {
  const TRD2 = TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | yes |');
  const DEF2 = DEFINITION + '| FS-2 | b | c | e | [read] | locator | | O2 |\n';
  const POLICY = '## Ship\n1. push\n2. open-pr\n3. merge\n';
  const origPath = process.env.PATH;
  const STUB_VARS = ['STUB_BARE', 'STUB_MERGEABLE', 'STUB_STATUS', 'STUB_MERGE_LOG', 'STUB_RED', 'STUB_STATE'];
  let binDir;

  beforeAll(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-seam-bin-'));
    roots.push(binDir);
    // `pr view` answers headRefOid from the bare origin: the merge commit does not exist until
    // the step runs, so a fixed JSON could not carry it. `pr merge` only logs its arguments.
    fs.writeFileSync(path.join(binDir, 'gh'), [
      '#!/bin/sh',
      'if [ "$1 $2" = "pr view" ]; then',
      '  oid=$(git ls-remote "$STUB_BARE" refs/heads/feature/f | cut -f1)',
      // `state` is $STUB_STATE (default OPEN): a test sets MERGED to play a hand merge during the CI wait.
      '  printf \'{"state":"%s","mergeable":"%s","mergeStateStatus":"%s","headRefName":"feature/f","headRefOid":"%s","baseRefName":"main"}\\n\' "${STUB_STATE:-OPEN}" "$STUB_MERGEABLE" "$STUB_STATUS" "$oid"',
      '  exit 0',
      'fi',
      // `pr checks` fails for a head listed in the file $STUB_RED (one oid per line; `*` = every head).
      'if [ "$1 $2" = "pr checks" ]; then',
      '  oid=$(git ls-remote "$STUB_BARE" refs/heads/feature/f | cut -f1)',
      '  if [ -f "$STUB_RED" ] && grep -qxE "$oid|\\*" "$STUB_RED"; then echo "build\tfail"; exit 1; fi',
      '  echo "build\tpass"; exit 0',
      'fi',
      'if [ "$1 $2" = "pr merge" ]; then shift 2; echo "$@" >> "$STUB_MERGE_LOG"; exit 0; fi',
      'echo "unstubbed gh $*" >&2; exit 1',
      '',
    ].join('\n'), { mode: 0o755 });
    process.env.PATH = `${binDir}${path.delimiter}${origPath}`;
  });
  afterAll(() => {
    process.env.PATH = origPath;
    STUB_VARS.forEach((k) => delete process.env[k]);
  });

  /** A closed feature, pushed, with two must-pass criteria: FS-1 covers src/b.js, FS-2 has no manifest. */
  function twoCriteria(policy = POLICY) {
    const s = setup({ policy });
    s.commit('work', { 'src/a.js': 'a2', [TRD]: TRD2 });
    s.write(`${s.stateDir}/success-definition.md`, DEF2);
    const art = (id) => path.join(s.repo, s.stateDir, 'evidence', `${id}.txt`);
    s.write(`${s.stateDir}/evidence/FS-1.txt`, 'proof 1');
    s.write(`${s.stateDir}/evidence/FS-2.txt`, 'proof 2');
    s.write(`${s.stateDir}/verification-state.json`, JSON.stringify({
      criteria: [{ id: 'FS-1', status: 'met', artifact: art('FS-1') }, { id: 'FS-2', status: 'met', artifact: art('FS-2') }],
    }));
    const rec = spawnSync(process.execPath, [LIVE_EVIDENCE, 'record', '--state-dir', s.stateDir, '--task', 'FS-1',
      '--artifact', art('FS-1'), '--covers', path.join(s.repo, 'src/b.js')], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
    expect(rec.status).toBe(0);
    s.start();
    expect(s.playPush().reconcile.action).toBe('set');
    return s;
  }

  /** Another clone lands a commit on origin/main (ported from custody.test.js). */
  function landOnBase(s, files, msg = 'base change') {
    const other = path.join(s.root, 'other');
    s.g(s.root, 'clone', '-q', '-b', 'main', path.join(s.root, 'origin.git'), other);
    s.g(other, 'config', 'user.email', 't@example.com');
    s.g(other, 'config', 'user.name', 't');
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(other, rel)), { recursive: true });
      fs.writeFileSync(path.join(other, rel), text);
    }
    s.g(other, 'add', '-A');
    s.g(other, 'commit', '-m', msg);
    s.g(other, 'push', 'origin', 'main');
    s.g(s.repo, 'fetch', 'origin');
  }

  /**
   * The merge contract's Do, as the lead plays it: decide, merge-base-in + push when told to,
   * the custody gate, the pr-head check, then `gh pr merge --match-head-commit <observed>`.
   * Counts how many times origin's branch ref moved during the step with an `update` hook.
   */
  function playMerge(s, { mergeable, status, redNew = false, mergedDuringWait = false }) {
    const bare = path.join(s.root, 'origin.git');
    const refLog = path.join(s.root, 'ref-moves.log');
    const mergeLog = path.join(s.root, 'merge-calls.log');
    fs.writeFileSync(refLog, '');
    fs.writeFileSync(path.join(bare, 'hooks', 'update'),
      `#!/bin/sh\n[ "$1" = "refs/heads/feature/f" ] && echo "$3" >> "${refLog}"\nexit 0\n`, { mode: 0o755 });
    Object.assign(process.env, { STUB_BARE: bare, STUB_MERGEABLE: mergeable, STUB_STATUS: status, STUB_MERGE_LOG: mergeLog,
      STUB_RED: path.join(s.root, 'red-heads.txt'), STUB_STATE: 'OPEN' });
    const prState = () => JSON.parse(spawnSync('gh', ['pr', 'view', '7', '--json', 'state'], { encoding: 'utf8', env: cleanEnv() }).stdout).state;
    const prHead = () => s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
    const json = (script, args) => {
      const r = spawnSync(process.execPath, [script, ...args], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
      return JSON.parse(r.stdout.trim().split('\n').pop());
    };
    const out = { mergedIn: null };
    out.decide = json(MERGE_UP, ['decide', '--pr', '7']);
    if (out.decide.action === 'merge-in') {
      s.g(s.repo, 'fetch', 'origin', 'main');
      out.mergedIn = json(RECORD_FILES, ['merge-base-in', '--base', 'origin/main', '--branch', 'feature/f', '--pr-head', prHead()]);
      expect(out.mergedIn.ok).toBe(true);
      s.g(s.repo, 'push', 'origin', 'feature/f');
      // The merge contract waits for CI on a head it pushed itself; a red check there returns
      // `red` before the custody gate, so no merge call follows.
      if (redNew) fs.appendFileSync(process.env.STUB_RED, `${prHead()}\n`);
      // Someone merges the PR by hand while the run waits on CI.
      if (mergedDuringWait) process.env.STUB_STATE = 'MERGED';
      if (spawnSync('gh', ['pr', 'checks', '7'], { encoding: 'utf8', env: cleanEnv() }).status !== 0) {
        // Failed checks: re-read the PR state first (One rule for every stop). MERGED goes on to
        // step 2, which proves that merge; anything else returns `red` before the custody gate.
        out.stateAfterRed = prState();
        if (out.stateAfterRed !== 'MERGED') {
          out.red = true;
          out.mergeCalls = [];
          out.head = prHead(); // the red head that was waited on: `red` reports it as data.head
          return out;
        }
      }
    }
    out.gate = s.playGate({ reverifiedStatus: 'met' });
    // Step 3: an already-MERGED PR skips the pr-head check and gh pr merge, straight to the merge link.
    if (prState() === 'MERGED') {
      out.prHead = null;
    } else {
      out.prHead = json(CUSTODY, ['check', '--state-dir', s.stateDir, '--link', 'pr-head', '--pr', '7', '--trd', TRD]);
      if (out.prHead.ok) {
        const m = spawnSync('gh', ['pr', 'merge', '7', '--merge', '--match-head-commit', out.prHead.observed], { encoding: 'utf8', env: cleanEnv() });
        expect(m.status).toBe(0);
      }
    }
    if (process.env.STUB_STATE === 'MERGED') {
      out.mergeLink = json(CUSTODY, ['check', '--state-dir', s.stateDir, '--link', 'merge', '--pr', '7', '--target', 'main', '--trd', TRD]);
    }
    out.refMoves = fs.readFileSync(refLog, 'utf8').split('\n').filter(Boolean);
    out.mergeCalls = fs.existsSync(mergeLog) ? fs.readFileSync(mergeLog, 'utf8').split('\n').filter(Boolean) : [];
    out.head = prHead();
    return out;
  }

  /** Records the steps before merge, plays it, and records merged the way the lead would. */
  function runToMerge(s, stub, expectBase) {
    for (const [word, data] of [['pushed', { head: 'h' }], ['opened', { pr: 7, head: 'h' }]]) s.record(s.next().step.id, word, data);
    const step = s.next();
    expect(step.step.primitive).toBe('merge');
    const played = playMerge(s, stub);
    const rec = s.record(step.step.id, 'merged', { merged: true, mergedHead: played.head, base: expectBase, method: 'merge' });
    return { played, rec };
  }

  test('base change touching no covered file, PR CONFLICTING: one merge commit pushed, one base-merge move, no reverify', () => {
    const s = twoCriteria();
    const before = s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
    landOnBase(s, { 'src/c.js': 'c1' });
    const { played, rec } = runToMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY' }, 'main');

    expect(played.decide).toMatchObject({ ok: true, action: 'merge-in' });
    // Exactly one update of origin's branch ref, and it is a merge commit on top of the old head.
    expect(played.refMoves).toEqual([played.head]);
    expect(s.g(s.repo, 'rev-list', '--parents', '-n', '1', played.head).split(' ')).toEqual([played.head, before, s.g(s.repo, 'rev-parse', 'origin/main')]);
    // The gate made one base-merge move and never asked for re-verification.
    expect(played.gate.reconcile.action).toBe('moved');
    expect(played.gate.reconcile.action).not.toBe('reverify');
    expect(s.readCustody().moves.filter((m) => m.rule === 'base-merge')).toHaveLength(1);
    expect(s.readCustody().moves).toHaveLength(1);
    expect(s.readCustody().anchor.commit).toBe(played.head);
    // The pr-head check observed the pushed merge commit; gh pr merge was matched to it, once.
    expect(played.prHead).toMatchObject({ ok: true, observed: played.head });
    expect(played.mergeCalls).toEqual([`7 --merge --match-head-commit ${played.head}`]);
    expect(rec).toMatchObject({ ok: true });
    expect(rec.status).not.toBe('waiting');
  });

  test('base change touching FS-1\'s covered file: gate reverifies FS-1 only and reuses FS-2', () => {
    const s = twoCriteria();
    landOnBase(s, { 'src/b.js': 'b-from-base' });
    // Plays only the merge-in and the gate: decide and gh pr merge are covered by the cases around it.
    const played = (() => {
      s.g(s.repo, 'fetch', 'origin', 'main');
      const head = s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
      const r = spawnSync(process.execPath, [RECORD_FILES, 'merge-base-in', '--base', 'origin/main', '--branch', 'feature/f', '--pr-head', head], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
      expect(JSON.parse(r.stdout.trim().split('\n').pop()).ok).toBe(true);
      s.g(s.repo, 'push', 'origin', 'feature/f');
      return s.playGate();
    })();
    expect(played.reconcile).toMatchObject({ action: 'reverify', ids: ['FS-1'], reused: ['FS-2'] });
  });

  test('PR MERGEABLE and CLEAN: no merge-in, no push, gate none, gh pr merge called', () => {
    const s = twoCriteria();
    landOnBase(s, { 'src/c.js': 'c1' });
    const before = s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
    const { played, rec } = runToMerge(s, { mergeable: 'MERGEABLE', status: 'CLEAN' }, 'main');
    expect(played.decide).toMatchObject({ ok: true, action: 'skip' });
    expect(played.mergedIn).toBeNull();
    expect(played.refMoves).toEqual([]);
    expect(played.head).toBe(before);
    expect(played.gate.reconcile.action).toBe('none');
    expect(played.prHead).toMatchObject({ ok: true, observed: before });
    expect(played.mergeCalls).toEqual([`7 --merge --match-head-commit ${before}`]);
    expect(rec.ok).toBe(true);
  });

  test('PR MERGEABLE but BEHIND: the base is merged in, pushed once, and the merge matches that commit', () => {
    const s = twoCriteria();
    landOnBase(s, { 'src/c.js': 'c1' });
    const { played } = runToMerge(s, { mergeable: 'MERGEABLE', status: 'BEHIND' }, 'main');
    expect(played.decide).toMatchObject({ ok: true, action: 'merge-in' });
    expect(played.mergedIn.ok).toBe(true);
    expect(played.refMoves).toEqual([played.head]);
    expect(played.gate.reconcile.action).toBe('moved');
    expect(played.prHead.observed).toBe(played.head);
    expect(played.mergeCalls).toEqual([`7 --merge --match-head-commit ${played.head}`]);
  });

  describe('a red merge-up head is fixed by the loop, within its bound', () => {
    const LOOP_POLICY = '## Ship\n1. push\n2. open-pr\n3. repeat rounds=1\n   - wait-ci\n   - collect-findings\n   - fix-findings\n4. merge\n';
    const BEFORE_MERGE = {
      push: ['pushed', { head: 'h' }], 'open-pr': ['opened', { pr: 7, head: 'h' }],
      'wait-ci': ['passed', {}], 'collect-findings': ['clean', { findings: [] }],
    };

    /** Record every step before the first merge hand-out; return that hand-out. */
    function toMerge(s) {
      for (let i = 0; i < 20; i++) {
        const n = s.next();
        if (n.step.primitive === 'merge') return n;
        s.record(n.step.id, ...BEFORE_MERGE[n.step.primitive]);
      }
      throw new Error('merge never handed out');
    }

    /** A loop step as the lead plays it. fix-findings commits to a file no criterion covers. */
    function playLoopStep(s, n, round) {
      const ci = () => (spawnSync('gh', ['pr', 'checks', '7'], { encoding: 'utf8', env: cleanEnv() }).status === 0 ? 'passed' : 'failed');
      switch (n.step.primitive) {
        case 'collect-findings': return ['found', { findings: ['red check'] }];
        case 'fix-findings': s.commit(`fix ${round}`, { [`src/fix${round}.js`]: `f${round}` }); return ['fixed', {}];
        case 'push': { const p = s.playPush(); return [p.result, p.data]; }
        case 'wait-ci': return [ci(), {}];
        default: throw new Error(`unexpected ${n.step.primitive}`);
      }
    }

    test('red head, loop fixes it, CI green: merge runs once on the fixed head', () => {
      const s = twoCriteria(LOOP_POLICY);
      landOnBase(s, { 'src/c.js': 'c1' });
      const mergeStep = toMerge(s);
      const first = playMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY', redNew: true });
      expect(first.red).toBe(true);
      expect(first.mergeCalls).toEqual([]);
      expect(s.record(mergeStep.step.id, 'red', { failed: [{ name: 'build', runId: 1 }], flaky: [], head: first.head })).toMatchObject({ ok: true });

      const handed = [];
      for (let i = 0; i < 4; i++) {
        const n = s.next();
        expect(n.action).toBe('run');
        handed.push(n.step.primitive);
        // The loop's collect-findings must see the red merge-up head's failures, not the earlier green wait-ci's.
        if (n.step.primitive === 'collect-findings') {
          expect(n.step.input.context.failed).toEqual([{ name: 'build', runId: 1 }]);
          expect(n.step.input.context.head).toBe(first.head); // the red merge-up head, not the earlier pushed one
        }
        expect(s.record(n.step.id, ...playLoopStep(s, n, 1))).toMatchObject({ ok: true });
      }
      expect(handed).toEqual(['collect-findings', 'fix-findings', 'push', 'wait-ci']);

      const again = s.next();
      expect(again.step).toMatchObject({ id: mergeStep.step.id, primitive: 'merge' });
      const second = playMerge(s, { mergeable: 'MERGEABLE', status: 'CLEAN' });
      expect(second.red).toBeUndefined();
      expect(second.mergeCalls).toEqual([`7 --merge --match-head-commit ${second.head}`]);
      expect(s.record(again.step.id, 'merged', { merged: true, mergedHead: second.head, base: 'main', method: 'merge' })).toMatchObject({ ok: true });
      expect(s.next()).toMatchObject({ action: 'done', shipped: true });
      expect(s.status()).toMatchObject({ status: 'done', shipped: true });
    });

    test('checks fail but the PR was merged by hand during the wait: no red, the merge is proven and the run ships', () => {
      const s = twoCriteria(LOOP_POLICY);
      landOnBase(s, { 'src/c.js': 'c1' });
      const mergeStep = toMerge(s);
      const played = playMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY', redNew: true, mergedDuringWait: true });
      // The checks failed, the re-read found MERGED, and the step went on to step 2 instead of returning red.
      expect(played.stateAfterRed).toBe('MERGED');
      expect(played.red).toBeUndefined();
      expect(played.gate.result).toBe('go');
      // Already MERGED at step 3: no pr-head check and no gh pr merge on the red head.
      expect(played.prHead).toBeNull();
      expect(played.mergeCalls).toEqual([]);
      // Step 4 proves the hand merge against the anchor the gate moved to the pushed head.
      expect(played.mergeLink).toMatchObject({ ok: true });
      expect(s.record(mergeStep.step.id, 'merged', { merged: true, mergedHead: played.head, base: 'main', method: 'merge' })).toMatchObject({ ok: true });
      expect(s.next()).toMatchObject({ action: 'done', shipped: true });
    });

    test('CI stays red until the bound is spent: stuck naming 2 rounds, gh pr merge never called', () => {
      const s = twoCriteria(LOOP_POLICY);
      landOnBase(s, { 'src/c.js': 'c1' });
      const mergeStep = toMerge(s);
      const first = playMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY', redNew: true });
      expect(first.red).toBe(true);
      s.record(mergeStep.step.id, 'red', { failed: [{ name: 'build', runId: 1 }], flaky: [], head: first.head });
      // From here every head is red.
      fs.writeFileSync(process.env.STUB_RED, '*\n');

      let last;
      for (let round = 1; round <= 2; round++) {
        for (let i = 0; i < 4; i++) {
          const n = s.next();
          expect(n.action).toBe('run');
          last = s.record(n.step.id, ...playLoopStep(s, n, round));
        }
      }
      expect(last).toMatchObject({ status: 'stuck', reason: expect.stringMatching(/loop ended after 2 rounds/) });
      expect(s.status()).toMatchObject({ status: 'stuck' });
      const mergeLog = path.join(s.root, 'merge-calls.log');
      expect(fs.existsSync(mergeLog) ? fs.readFileSync(mergeLog, 'utf8').trim() : '').toBe('');
    });
  });
});
