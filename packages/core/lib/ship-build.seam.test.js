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
const RANK = path.join(__dirname, 'followup-rank.js');
const AUTH_SENTENCE = 'A step listed in `.claude/rules/ship.md` is the owner\'s standing authorization for that act.';

// Deploy-link token from a commit sha: custody.js rejects an all-digit token as a build number,
// so extend the prefix to the first letter a-f (same helper as custody.test.js).
function tokenOf(sha, n) {
  const i = sha.search(/[a-f]/);
  return i < 0 ? sha : sha.slice(0, Math.max(n, i + 1));
}

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

describe('file-followups files product items first (issue #113)', () => {
  const openRows = (...dirs) => {
    const r = spawnSync('node', [RANK, 'open', ...dirs.flatMap((d) => ['--state-dir', d])], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout);
  };
  const rec = (dir, summary, extra = {}) => discovered.record(dir, { kind: 'gap', foundBy: 'FIX-003', phase: 1, summary, file: 'src/a.js', evidence: 'e', ...extra });

  test('a mixed work + task ledger is filed and reported product, host, tooling, paperwork, not-verifiable', () => {
    const s = setup();
    const work = s.abs(s.stateDir);
    const task = s.abs('.trd-state/task-x');
    // Recorded deliberately OUT of rank order: ledger order would put not-verifiable first.
    expect(rec(work, '[not-verifiable] cannot reach staging', { status: 'not_verifiable' })).toBe(true);
    expect(rec(work, 'stale Touches in F-001', { kind: 'stale-grounding' })).toBe(true);
    expect(rec(task, '[flaky-ci] lint job flaked')).toBe(true);
    expect(rec(work, 'paperwork row', { rankClass: 'paperwork' })).toBe(true);
    expect(rec(task, 'host row', { rankClass: 'host' })).toBe(true);
    expect(rec(work, '[below-bar] nit about naming')).toBe(true);
    expect(rec(task, '[review:major] missing null check')).toBe(true);
    expect(rec(work, 'product row')).toBe(true);

    const rows = openRows(work, task);
    const selected = rows.filter((r) => !r.summary.startsWith('[below-bar]'));
    const unfiled = rows.filter((r) => r.summary.startsWith('[below-bar]')).map((r) => r.summary);
    const filed = [];
    selected.forEach((row, i) => {
      const url = `https://example.test/issues/${i + 1}`;
      expect(discovered.resolve(row.dir, row, `filed ${url}`)).toBe(true);
      filed.push({ summary: row.summary, url, class: row.class });
    });

    expect(filed.map((f) => f.class)).toEqual(['product', 'product', 'host', 'tooling', 'paperwork', 'paperwork', 'not-verifiable']);
    // Within a class, ledger order is kept: the work ledger is read before the task ledger.
    expect(filed.map((f) => f.summary).slice(0, 2)).toEqual(['product row', '[review:major] missing null check']);
    const byClass = Object.fromEntries(filed.map((f) => [f.summary, f.class]));
    expect(byClass['[not-verifiable] cannot reach staging']).toBe('not-verifiable');
    expect(byClass['[flaky-ci] lint job flaked']).toBe('tooling');
    expect(byClass['[review:major] missing null check']).toBe('product');
    expect(byClass['stale Touches in F-001']).toBe('paperwork');
    expect(unfiled).toEqual(['[below-bar] nit about naming']);
    // The below-bar row is still open and keeps its class; filed rows are not filed again.
    const again = openRows(work, task);
    expect(again.map((r) => r.summary)).toEqual(['[below-bar] nit about naming']);
    expect(again[0].class).toBe('product');
  });

  test('a legacy row with only a summary prefix gets its class from the CLI', () => {
    const s = setup();
    const work = s.abs(s.stateDir);
    rec(work, '[flaky-capped] job capped');
    const rows = openRows(work);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ class: 'tooling', dir: work });
    expect(rows[0].rankClass).toBeUndefined();
  });
});

describe('merge step: bringing the base in, then the gate, pr-head check and gh pr merge', () => {
  const TRD2 = TRD_TEXT.replace('| O1 | first | yes |', '| O1 | first | yes |\n| O2 | second | yes |');
  const DEF2 = DEFINITION + '| FS-2 | b | c | e | [read] | locator | | O2 |\n';
  const POLICY = '## Ship\n1. push\n2. open-pr\n3. merge\n';
  const origPath = process.env.PATH;
  const STUB_VARS = ['STUB_BARE', 'STUB_MERGEABLE', 'STUB_STATUS', 'STUB_MERGE_LOG', 'STUB_RED', 'STUB_STATE', 'STUB_CHECK_LOG'];
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
      // Which head the checks were read on: the seam cases assert the CI wait ran on the right one.
      '  [ -n "$STUB_CHECK_LOG" ] && echo "$oid" >> "$STUB_CHECK_LOG"',
      '  if [ -f "$STUB_RED" ] && grep -qxE "$oid|\\*" "$STUB_RED"; then echo "build\tfail"; exit 1; fi',
      '  echo "build\tpass"; exit 0',
      'fi',
      // As GitHub does: a merge pinned to a head that is not the branch's head is refused.
      'if [ "$1 $2" = "pr merge" ]; then',
      '  shift 2; args="$*"; want=""',
      '  while [ $# -gt 0 ]; do [ "$1" = "--match-head-commit" ] && want="$2"; shift; done',
      '  oid=$(git ls-remote "$STUB_BARE" refs/heads/feature/f | cut -f1)',
      '  if [ -n "$want" ] && [ "$want" != "$oid" ]; then echo "Head branch was modified. Review the latest commit and try again." >&2; exit 1; fi',
      '  echo "$args" >> "$STUB_MERGE_LOG"; exit 0',
      'fi',
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

  /** Another session pushes to the PR branch: a clone of origin commits `files` (or merges the base) and pushes. */
  function peerPushes(s, files, { mergeBase = false } = {}) {
    const peer = path.join(s.root, `peer-${fs.readdirSync(s.root).length}`);
    s.g(s.root, 'clone', '-q', '-b', 'feature/f', path.join(s.root, 'origin.git'), peer);
    s.g(peer, 'config', 'user.email', 'p@example.com');
    s.g(peer, 'config', 'user.name', 'p');
    if (mergeBase) {
      s.g(peer, 'merge', '--no-ff', '--no-edit', 'origin/main');
    } else {
      for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(peer, rel)), { recursive: true });
        fs.writeFileSync(path.join(peer, rel), text);
      }
      s.g(peer, 'add', '-A');
      s.g(peer, 'commit', '-m', 'peer work');
    }
    s.g(peer, 'push', 'origin', 'feature/f');
    return s.g(peer, 'rev-parse', 'HEAD');
  }

  /**
   * The merge contract's Do, as the lead plays it: step 0 `sync-head` with the recorded
   * `context.judgedHead`, decide, merge-base-in + push when told to, the CI wait on every head
   * that is not `judgedHead`, the custody gate, the pr-head check, then
   * `gh pr merge --match-head-commit <observed>`. `step` is the hand-out from `next` (its
   * `step.input.context` and `step.input.loop`); without one the head reads as unjudged and no loop exists.
   * `sync: false` plays the contract as it read before step 0 (no catch-up), for the contrast case.
   * Counts how many times origin's branch ref moved during the step with an `update` hook.
   */
  function playMerge(s, { mergeable, status, redNew = false, mergedDuringWait = false, step = null, sync = true }) {
    const bare = path.join(s.root, 'origin.git');
    const refLog = path.join(s.root, 'ref-moves.log');
    const mergeLog = path.join(s.root, 'merge-calls.log');
    const checkLog = path.join(s.root, 'check-heads.log');
    fs.writeFileSync(refLog, '');
    fs.writeFileSync(checkLog, '');
    fs.writeFileSync(path.join(bare, 'hooks', 'update'),
      `#!/bin/sh\n[ "$1" = "refs/heads/feature/f" ] && echo "$3" >> "${refLog}"\nexit 0\n`, { mode: 0o755 });
    Object.assign(process.env, { STUB_BARE: bare, STUB_MERGEABLE: mergeable, STUB_STATUS: status, STUB_MERGE_LOG: mergeLog,
      STUB_RED: path.join(s.root, 'red-heads.txt'), STUB_STATE: 'OPEN', STUB_CHECK_LOG: checkLog });
    const ctx = (step && step.step.input.context) || {};
    const loop = step ? step.step.input.loop : null;
    const prState = () => JSON.parse(spawnSync('gh', ['pr', 'view', '7', '--json', 'state'], { encoding: 'utf8', env: cleanEnv() }).stdout).state;
    const prHead = () => s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
    const json = (script, args) => {
      const r = spawnSync(process.execPath, [script, ...args], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
      return JSON.parse(r.stdout.trim().split('\n').pop());
    };
    const out = { mergedIn: null, issues: [] };
    const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
    const finish = () => {
      out.refMoves = lines(refLog);
      out.mergeCalls = lines(mergeLog);
      out.ciHeads = lines(checkLog);
      out.head = prHead();
      return out;
    };
    if (sync) {
      out.sync = json(MERGE_UP, ['sync-head', '--pr', '7', '--branch', 'feature/f', '--base', 'main',
        '--judged', ctx.judgedHead || 'none', '--trd', TRD]);
      expect(out.sync.ok).toBe(true);
    }
    out.decide = json(MERGE_UP, ['decide', '--pr', '7']);
    if (out.decide.action === 'merge-in') {
      s.g(s.repo, 'fetch', 'origin', 'main');
      out.mergedIn = json(RECORD_FILES, ['merge-base-in', '--base', 'origin/main', '--branch', 'feature/f', '--pr-head', prHead()]);
      expect(out.mergedIn.ok).toBe(true);
      s.g(s.repo, 'push', 'origin', 'feature/f');
    }
    // The CI wait: every PR head that is not the judged one. A red check there returns `red`
    // before the custody gate, so no merge call follows.
    if (prHead() !== ctx.judgedHead) {
      const waited = prHead();
      if (redNew) fs.appendFileSync(process.env.STUB_RED, `${waited}\n`);
      // Someone merges the PR by hand while the run waits on CI.
      if (mergedDuringWait) process.env.STUB_STATE = 'MERGED';
      if (spawnSync('gh', ['pr', 'checks', '7'], { encoding: 'utf8', env: cleanEnv() }).status !== 0) {
        // Failed checks: re-read the PR state first (One rule for every stop). MERGED goes on to
        // step 2, which proves that merge; anything else returns `red` before the custody gate.
        out.stateAfterRed = prState();
        if (out.stateAfterRed !== 'MERGED') {
          out.red = true;
          out.mergeCalls = [];
          out.redData = { failed: [{ name: 'build', runId: 1 }], flaky: [], head: waited, judgedHead: waited };
          return finish(); // `head` is the red head that was waited on
        }
      } else if (ctx.judgedHead && out.sync && out.sync.moved && !out.sync.baseOnly && prState() !== 'MERGED') {
        // Green on a head another writer pushed. Only when a judgedHead is recorded: with none, `moved`
        // means "not yet judged", the one CI wait above is all it asks for, and the step goes on to the
        // custody gate with no `moved` result and no issues line (ship-primitive-merge.md, "A green wait
        // on a moved head"). With one and a round left, hand it to the loop as `moved`.
        if (loop && loop.roundsLeft > 0 && loop.on.includes('moved')) {
          out.moved = true;
          out.movedData = { failed: [], flaky: [], head: waited, judgedHead: waited };
          return finish();
        }
        out.issues.push('merged with another session\'s commits and no findings collected on them');
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
        out.mergeStatus = m.status;
        out.mergeErr = m.stderr;
      }
    }
    if (process.env.STUB_STATE === 'MERGED') {
      out.mergeLink = json(CUSTODY, ['check', '--state-dir', s.stateDir, '--link', 'merge', '--pr', '7', '--target', 'main', '--trd', TRD]);
    }
    return finish();
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

  describe('the detached run record lives on the records ref', () => {
    const savedForge = process.env.FORGE_FEATURE_ID;
    beforeEach(() => { process.env.FORGE_FEATURE_ID = 'forge-f'; });
    afterEach(() => {
      if (savedForge === undefined) delete process.env.FORGE_FEATURE_ID;
      else process.env.FORGE_FEATURE_ID = savedForge;
      delete process.env.STUB_STATE;
    });
    const REF = 'refs/ensemble/records/f';
    const refJson = (s, file) => JSON.parse(s.g(s.repo, 'show', `${REF}:${file}`));
    const refRead = (s, file) => JSON.parse(spawnSync(process.execPath, [path.join(__dirname, 'record-ref.js'), 'read-record',
      '--state-dir', s.stateDir, '--file', file], { cwd: s.repo, encoding: 'utf8', env: cleanEnv() }).stdout.trim().split('\n').pop());

    test('a merge that records merged leaves shipped.json and custody.json on the ref, nothing in the git directory, and the links read the anchor from the ref', () => {
      const s = twoCriteria();
      const startedAt = s.status().startedAt || JSON.parse(fs.readFileSync(s.abs(`${s.stateDir}/shipped.json`), 'utf8')).startedAt;
      const { played, rec } = runToMerge(s, { mergeable: 'MERGEABLE', status: 'CLEAN' }, 'main');
      expect(rec).toMatchObject({ ok: true });

      const shipped = refJson(s, 'shipped.json');
      expect(shipped.detached).toBe(true);
      expect(shipped.startedAt).toBe(startedAt);
      expect(shipped.work.branch).toBe('feature/f');
      expect(shipped.work).toHaveProperty('forge_feature_id');
      expect(shipped.work.forge_feature_id).toBe('forge-f');
      // The post-merge cursor: every step recorded, the run done.
      expect(shipped).toMatchObject({ status: 'done', shipped: true, cursor: null, recordRef: REF });
      expect(shipped.results.map((x) => x.result)).toEqual(['pushed', 'opened', 'merged']);

      const custodyOnRef = refJson(s, 'custody.json');
      expect(custodyOnRef.startedAt).toBe(startedAt);
      expect(custodyOnRef.anchor.commit).toBe(played.head);

      const common = path.resolve(s.repo, s.g(s.repo, 'rev-parse', '--git-common-dir'));
      expect(fs.existsSync(path.join(common, 'ensemble', 'ship'))).toBe(false);

      // The links resolve the anchor from the ref: poison the tracked file with another commit first.
      const other = s.g(s.repo, 'rev-list', '--max-parents=0', 'HEAD');
      fs.mkdirSync(path.dirname(s.abs(`${s.stateDir}/custody.json`)), { recursive: true });
      fs.writeFileSync(s.abs(`${s.stateDir}/custody.json`), JSON.stringify({ anchor: { commit: other }, moves: [] }));
      process.env.STUB_STATE = 'MERGED';
      const merge = s.custody('check', '--state-dir', s.stateDir, '--link', 'merge', '--pr', '7', '--target', 'main', '--trd', TRD);
      expect(merge).toMatchObject({ ok: true, link: 'merge', observed: played.head });
      const deploy = s.custody('check', '--state-dir', s.stateDir, '--link', 'deploy', '--identity-output', `build ${tokenOf(played.head, 12)}`, '--trd', TRD);
      expect(deploy).toMatchObject({ ok: true, link: 'deploy' });
    });

    test('a plain start with closed.json only on the ref anchors custody at the audited commit, not HEAD', () => {
      const s = setup({ policy: POLICY });
      const audited = s.g(s.repo, 'rev-parse', 'HEAD');
      s.write(`${s.stateDir}/closed.json`, JSON.stringify({ feature: 'f', closedBy: 'audit', audit: { auditedCommit: audited } }));
      const w = spawnSync(process.execPath, [path.join(__dirname, 'record-ref.js'), 'write', '--state-dir', s.stateDir, '--command', 'audit-build', '--step', 'close'],
        { cwd: s.repo, encoding: 'utf8', env: cleanEnv() });
      expect(JSON.parse(w.stdout.trim().split('\n').pop())).toMatchObject({ ok: true });
      fs.rmSync(s.abs(s.stateDir), { recursive: true, force: true });
      // A later commit, so HEAD is not the audited commit.
      const head = s.commit('later work', { 'src/a.js': 'a2' });
      expect(head).not.toBe(audited);

      s.start();
      const r = s.custody('reconcile', '--set-only', '--state-dir', s.stateDir, '--trd', TRD, '--closed', `${s.stateDir}/closed.json`);
      expect(r.anchor).toBe(audited);
      expect(r.anchor).not.toBe(head);
      expect(s.readCustody().anchor).toMatchObject({ commit: audited, source: 'audited' });
    });

    test('with closed.json in neither the folder nor the ref, read-record reports found:false', () => {
      const s = setup({ policy: POLICY });
      fs.rmSync(s.abs(s.stateDir), { recursive: true, force: true });
      expect(refRead(s, 'closed.json')).toMatchObject({ found: false });
    });
  });

  describe('a red merge-up head is fixed by the loop, within its bound', () => {
    const LOOP_POLICY = '## Ship\n1. push\n2. open-pr\n3. repeat rounds=1\n   - wait-ci\n   - collect-findings\n   - fix-findings\n4. merge\n';
    // The head a judging step read: wait-ci and collect-findings record it as `judgedHead`.
    const originHead = (s) => s.g(s.repo, 'ls-remote', 'origin', 'refs/heads/feature/f').split(/\s+/)[0];
    const beforeMerge = (s) => ({
      push: ['pushed', { head: 'h' }], 'open-pr': ['opened', { pr: 7, head: 'h' }],
      'wait-ci': ['passed', { judgedHead: originHead(s) }], 'collect-findings': ['clean', { findings: [], judgedHead: originHead(s) }],
    });

    /** Record every step before the first merge hand-out; return that hand-out. */
    function toMerge(s) {
      for (let i = 0; i < 20; i++) {
        const n = s.next();
        if (n.step.primitive === 'merge') return n;
        s.record(n.step.id, ...beforeMerge(s)[n.step.primitive]);
      }
      throw new Error('merge never handed out');
    }

    /** A loop step as the lead plays it. fix-findings commits to a file no criterion covers. */
    function playLoopStep(s, n, round) {
      const ci = () => (spawnSync('gh', ['pr', 'checks', '7'], { encoding: 'utf8', env: cleanEnv() }).status === 0 ? 'passed' : 'failed');
      switch (n.step.primitive) {
        case 'collect-findings': return ['found', { findings: ['red check'], judgedHead: originHead(s) }];
        case 'fix-findings': s.commit(`fix ${round}`, { [`src/fix${round}.js`]: `f${round}` }); return ['fixed', {}];
        case 'push': { const p = s.playPush(); return [p.result, p.data]; }
        case 'wait-ci': return [ci(), { judgedHead: originHead(s) }];
        default: throw new Error(`unexpected ${n.step.primitive}`);
      }
    }

    test('red head, loop fixes it, CI green: merge runs once on the fixed head', () => {
      const s = twoCriteria(LOOP_POLICY);
      landOnBase(s, { 'src/c.js': 'c1' });
      const mergeStep = toMerge(s);
      const first = playMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY', redNew: true, step: mergeStep });
      expect(first.red).toBe(true);
      expect(first.redData.judgedHead).toBe(first.head);
      expect(first.mergeCalls).toEqual([]);
      expect(s.record(mergeStep.step.id, 'red', first.redData)).toMatchObject({ ok: true });

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
      const second = playMerge(s, { mergeable: 'MERGEABLE', status: 'CLEAN', step: again });
      expect(second.ciHeads).toEqual([]); // the loop's wait-ci judged the fixed head: no second wait
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
      const played = playMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY', redNew: true, mergedDuringWait: true, step: mergeStep });
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
      const first = playMerge(s, { mergeable: 'CONFLICTING', status: 'DIRTY', redNew: true, step: mergeStep });
      expect(first.red).toBe(true);
      s.record(mergeStep.step.id, 'red', first.redData);
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

    describe('a head another session pushed while the run was parked (issue #98)', () => {
      const OPEN = { mergeable: 'MERGEABLE', status: 'CLEAN' };
      const MERGE_ARGS = (head) => `7 --merge --match-head-commit ${head}`;

      test('(a) base-only move: sync-head catches up, CI is waited on B, and the merge is pinned to B; the old play is refused by custody', () => {
        const s = twoCriteria(LOOP_POLICY);
        const A = originHead(s);
        const mergeStep = toMerge(s);
        landOnBase(s, { 'src/c.js': 'c1' });
        const B = peerPushes(s, {}, { mergeBase: true });
        expect(B).not.toBe(A);
        expect(mergeStep.step.input.context.judgedHead).toBe(A);

        const played = playMerge(s, { ...OPEN, step: mergeStep });
        expect(played.sync).toMatchObject({ ok: true, head: B, judged: A, moved: true, sync: 'fast-forward', baseOnly: true });
        expect(played.ciHeads).toEqual([B]); // the wait ran on B, not on the head the run knew
        expect(played.moved).toBeUndefined(); // a base-only move is not handed to the loop
        expect(played.gate.result).toBe('go');
        expect(played.prHead).toMatchObject({ ok: true, observed: B });
        expect(played.mergeCalls).toEqual([MERGE_ARGS(B)]);
        expect(s.record(mergeStep.step.id, 'merged', { merged: true, mergedHead: B, base: 'main', method: 'merge' })).toMatchObject({ ok: true });
        expect(s.next()).toMatchObject({ action: 'done', shipped: true });

        // The same start with the play as it read before step 0: local is still A, so custody refuses.
        const s2 = twoCriteria(LOOP_POLICY);
        const step2 = toMerge(s2);
        landOnBase(s2, { 'src/c.js': 'c1' });
        peerPushes(s2, {}, { mergeBase: true });
        const old = playMerge(s2, { ...OPEN, step: step2, sync: false });
        expect(old.prHead.ok).toBe(false);
        expect(old.mergeCalls).toEqual([]);
      });

      test('(b) CI red on B: red carrying judgedHead B, and no merge call', () => {
        const s = twoCriteria();
        const mergeStep = toMerge(s);
        const B = peerPushes(s, { 'src/peer.js': 'p1' });
        fs.writeFileSync(path.join(s.root, 'red-heads.txt'), `${B}\n`);
        const played = playMerge(s, { ...OPEN, step: mergeStep });
        expect(played.red).toBe(true);
        expect(played.redData).toMatchObject({ head: B, judgedHead: B });
        expect(played.ciHeads).toEqual([B]);
        expect(played.mergeCalls).toEqual([]);
        expect(s.record(mergeStep.step.id, 'red', played.redData)).toMatchObject({ ok: true });
      });

      test('(c) non-base move with a loop: moved, collect-findings sees B, then the merge does not wait on B again and merges B', () => {
        const s = twoCriteria(LOOP_POLICY);
        const mergeStep = toMerge(s);
        const B = peerPushes(s, { 'src/peer.js': 'p1' });
        expect(mergeStep.step.input.loop).toMatchObject({ on: ['red', 'moved'], roundsLeft: 2 });

        const first = playMerge(s, { ...OPEN, step: mergeStep });
        expect(first.sync).toMatchObject({ head: B, moved: true, baseOnly: false, changed: ['src/peer.js'] });
        expect(first.ciHeads).toEqual([B]);
        expect(first.moved).toBe(true);
        expect(first.mergeCalls).toEqual([]);
        expect(s.record(mergeStep.step.id, 'moved', first.movedData)).toMatchObject({ ok: true, status: 'running' });

        const collect = s.next();
        expect(collect.step.primitive).toBe('collect-findings');
        expect(collect.step.input.context.head).toBe(B);
        expect(collect.step.input.context.judgedHead).toBe(B);
        expect(s.record(collect.step.id, 'clean', { findings: [], judgedHead: B })).toMatchObject({ ok: true });

        const again = s.next();
        expect(again.step).toMatchObject({ id: mergeStep.step.id, primitive: 'merge' });
        const second = playMerge(s, { ...OPEN, step: again });
        expect(second.sync).toMatchObject({ head: B, moved: false });
        expect(second.ciHeads).toEqual([]);
        expect(second.mergeCalls).toEqual([MERGE_ARGS(B)]);
        expect(s.record(again.step.id, 'merged', { merged: true, mergedHead: B, base: 'main', method: 'merge' })).toMatchObject({ ok: true });
        expect(s.next()).toMatchObject({ action: 'done', shipped: true });
      });

      test('(d) the bar rule: a red head the loop\'s collect-findings records clean on is merged with no second CI wait', () => {
        const s = twoCriteria(LOOP_POLICY);
        const mergeStep = toMerge(s);
        const B = peerPushes(s, { 'src/peer.js': 'p1' });
        fs.writeFileSync(path.join(s.root, 'red-heads.txt'), `${B}\n`);
        const first = playMerge(s, { ...OPEN, step: mergeStep });
        expect(first.red).toBe(true);
        expect(s.record(mergeStep.step.id, 'red', first.redData)).toMatchObject({ ok: true });

        const collect = s.next();
        expect(collect.step.primitive).toBe('collect-findings');
        expect(collect.step.input.context.failed).toEqual(first.redData.failed);
        // The owner's bar accepts the failure: clean, on the head CI judged.
        expect(s.record(collect.step.id, 'clean', { findings: [], judgedHead: B })).toMatchObject({ ok: true });

        const again = s.next();
        const second = playMerge(s, { ...OPEN, step: again });
        expect(second.red).toBeUndefined();
        expect(second.ciHeads).toEqual([]); // B is red in the stub, yet it is not waited on again
        expect(second.mergeCalls).toEqual([MERGE_ARGS(B)]);
      });

      test('(e) await-approval recording head B without judging it: the merge still syncs and waits on B', () => {
        const s = twoCriteria('## Ship\n1. push\n2. open-pr\n3. wait-ci\n4. await-approval\n5. merge\n');
        const A = originHead(s);
        const B = peerPushes(s, { 'src/peer.js': 'p1' });
        s.record(s.next().step.id, 'pushed', { head: A });
        s.record(s.next().step.id, 'opened', { pr: 7, head: A });
        s.record(s.next().step.id, 'passed', { judgedHead: A });
        s.record(s.next().step.id, 'approved', { head: B }); // the PR's head at approval: seen, not judged
        const mergeStep = s.next();
        expect(mergeStep.step.primitive).toBe('merge');
        expect(mergeStep.step.input.context).toMatchObject({ head: B, judgedHead: A });
        expect(mergeStep.step.input.loop).toBeNull();

        const played = playMerge(s, { ...OPEN, step: mergeStep });
        expect(played.sync).toMatchObject({ head: B, moved: true, sync: 'fast-forward' });
        expect(played.ciHeads).toEqual([B]);
        // No loop round to collect findings: it merges B and says so.
        expect(played.issues).toHaveLength(1);
        expect(played.mergeCalls).toEqual([MERGE_ARGS(B)]);
      });

      test('(f) a run saved before judgedHead (snapshot loop.on "red", no judgedHead anywhere): CI waited once on B, merge pinned to B, no moved, no loop round, no issues line', () => {
        const s = twoCriteria(LOOP_POLICY);
        const mergeStep = toMerge(s);
        // Make the record look like Storybook\'s: strip every judgedHead the new contracts wrote.
        const file = s.abs(`${s.stateDir}/shipped.json`);
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const r of saved.results) delete r.data.judgedHead;
        const owner = saved.steps.find((x) => x.primitive === 'merge');
        expect(owner.loop.on).toBe('red');
        fs.writeFileSync(file, JSON.stringify(saved));
        const B = peerPushes(s, { 'src/peer.js': 'p1' });

        const step = s.next();
        expect(step.step.input.context.judgedHead).toBeUndefined();
        const roundsBefore = step.step.input.loop && step.step.input.loop.roundsLeft;
        const played = playMerge(s, { ...OPEN, step });
        expect(played.sync).toMatchObject({ head: B, judged: 'none', moved: true });
        expect(played.ciHeads).toEqual([B]); // unknown means wait, once
        // No judgedHead recorded: `moved` only means "not yet judged", so nothing is handed to the loop
        // and no issues line is added.
        expect(played.moved).toBeUndefined();
        expect(played.issues).toEqual([]);
        expect(played.gate.result).toBe('go');
        expect(played.prHead).toMatchObject({ ok: true, observed: B });
        expect(played.mergeCalls).toEqual([MERGE_ARGS(B)]);
        const rec = s.record(mergeStep.step.id, 'merged', { merged: true, mergedHead: B, base: 'main', method: 'merge' });
        expect(rec).toMatchObject({ ok: true });
        // No loop round was spent: the step went straight to merged, and the loop still has all its rounds.
        expect(roundsBefore).toBeGreaterThan(0);
        expect(s.next()).toMatchObject({ action: 'done', shipped: true });
      });
    });
  });
});
