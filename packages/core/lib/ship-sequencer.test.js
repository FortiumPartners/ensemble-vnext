/**
 * ship-sequencer.js test suite -- over fixture contracts written to a temp directory, so the
 * suite proves the sequencer is primitive-blind (a contract added to the directory runs with
 * no sequencer change).
 *
 * Run with: npx jest packages/core/lib/ship-sequencer.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const seq = require('./ship-sequencer');

const SCRIPT = path.join(__dirname, 'ship-sequencer.js');

const CONTRACTS = {
  alpha: { primitive: 'alpha', params: '', results: 'done', outward: 'no', provides: 'head', section: 'ship' },
  bravo: {
    primitive: 'bravo', params: 'base=', results: 'opened, reused', outward: 'unless ensemble.openPullRequest=auto',
    needs: 'head', provides: 'pr', section: 'ship',
  },
  charlie: { primitive: 'charlie', params: 'tool', results: 'ok', outward: 'yes', section: 'ship' },
  delta: {
    primitive: 'delta', params: 'bar=significant', results: 'clean, found', outward: 'no', needs: 'head',
    provides: 'findings', section: 'ship', 'repeat-until': 'clean',
  },
  echo: { primitive: 'echo', params: 'format=', results: 'fixed, nothing', outward: 'no', needs: 'findings', section: 'ship' },
  foxtrot: { primitive: 'foxtrot', params: '', results: 'good, bad', outward: 'no', needs: 'head', section: 'ship', 'repeat-until': 'good' },
  golf: { primitive: 'golf', params: 'command', results: 'ran', outward: 'yes', section: 'any', rest: 'command' },
  hotel: { primitive: 'hotel', params: 'below-bar=no', results: 'filed, none', outward: 'yes', section: 'after' },
  'wait-ci': { primitive: 'wait-ci', params: '', results: 'passed, failed, no-checks', 'stops-on': 'failed', outward: 'no', section: 'ship' },
  india: { primitive: 'india', params: '', results: 'gone', outward: 'no', section: 'ship' },
};

function writeContract(dir, fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push('---', '', `# ${fields.primitive}`, '', '## Input', '', '## Do', '', '## Result', '', '## Waiting', '');
  fs.writeFileSync(path.join(dir, `ship-primitive-${fields.primitive}.md`), lines.join('\n'));
}

let tmp;
let contractsDir;
let contracts;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-seq-'));
  contractsDir = path.join(tmp, 'contracts');
  fs.mkdirSync(contractsDir);
  for (const c of Object.values(CONTRACTS)) writeContract(contractsDir, c);
  contracts = seq.loadPrimitives(contractsDir).contracts;
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const policy = (body) => `# Ship\n\n## Ship\n\n${body}\n`;
const errorsOf = (text) => seq.parse(text, contracts).errors;
const stateDir = () => path.join(tmp, 'state');
const startOpts = (text, extra = {}) => {
  const p = path.join(tmp, 'ship.md');
  if (text != null) fs.writeFileSync(p, text);
  return { stateDir: stateDir(), policyPath: p, contractsDir, work: { kind: 'feature', id: 'f', trd: 'docs/TRD/f.md', branch: 'b' }, ...extra };
};
const authorizeAll = () => {
  const a = path.join(tmp, 'autonomy.md');
  fs.writeFileSync(a, `# rules\n\n${seq.AUTHORIZATION_SENTENCE}\n`);
  return { contractsDir, autonomyPath: a, settingsPath: path.join(tmp, 'none.json') };
};
const noAuth = () => ({ contractsDir, autonomyPath: path.join(tmp, 'none.md'), settingsPath: path.join(tmp, 'none.json') });

function drive(opts, results) {
  // results: map of step id -> result word (or array consumed in order)
  const handed = [];
  for (let i = 0; i < 40; i++) {
    const n = seq.next(stateDir(), opts);
    if (n.action !== 'run') return { handed, last: n };
    handed.push({ id: n.step.id, final: n.step.input.final });
    const want = results[n.step.id];
    const result = Array.isArray(want) ? want.shift() : want;
    const r = seq.record(stateDir(), { step: n.step.id, result }, opts);
    if (!r.ok) throw new Error(JSON.stringify(r));
    if (r.status === 'stuck' || r.status === 'waiting') return { handed, last: r };
  }
  throw new Error('did not finish');
}

describe('loadPrimitives', () => {
  test('reads every contract in the directory, parameters and keys', () => {
    expect([...contracts.keys()].sort()).toEqual(Object.keys(CONTRACTS).sort());
    expect(contracts.get('delta').repeatUntil).toBe('clean');
    expect(contracts.get('charlie').params.tool).toEqual({ default: null, required: true });
    expect(contracts.get('echo').params.format).toEqual({ default: null, required: false });
    expect(contracts.get('bravo').outward).toEqual({ unless: 'ensemble.openPullRequest', equals: 'auto' });
  });

  test('reports a contract whose front matter is wrong', () => {
    fs.writeFileSync(path.join(contractsDir, 'ship-primitive-zulu.md'), '---\nprimitive: other\n---\n');
    fs.writeFileSync(path.join(contractsDir, 'ship-primitive-yankee.md'), '---\nprimitive: yankee\nsection: nowhere\n---\n');
    fs.writeFileSync(path.join(contractsDir, 'ship-primitive-xray.md'), 'no front matter');
    fs.writeFileSync(path.join(contractsDir, 'ship-primitive-whiskey.md'), '---\nprimitive: whiskey\nparams: work\n---\n');
    const { errors } = seq.loadPrimitives(contractsDir);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/does not match the file name/);
    expect(errors.join('\n')).toMatch(/section must be/);
    expect(errors.join('\n')).toMatch(/no front matter/);
    expect(errors.join('\n')).toMatch(/reserved/);
  });

  test('keeps `none` as a result word, while `none` still means empty for the other lists', () => {
    expect(contracts.get('hotel').results).toEqual(['filed', 'none']);
    writeContract(contractsDir, { primitive: 'juliet', params: '', results: 'done, none', outward: 'no', needs: 'none', provides: '-', section: 'ship' });
    const juliet = seq.loadPrimitives(contractsDir).contracts.get('juliet');
    expect(juliet.results).toEqual(['done', 'none']);
    expect(juliet.needs).toEqual([]);
    expect(juliet.provides).toEqual([]);
  });

  test('record accepts the result `none` when the contract declares it', () => {
    writeContract(contractsDir, { primitive: 'juliet', params: '', results: 'done, none', outward: 'no', section: 'ship' });
    seq.start(startOpts(policy('1. juliet')));
    seq.next(stateDir(), noAuth());
    expect(seq.record(stateDir(), { step: '1', result: 'none' }, noAuth())).toMatchObject({ ok: true });
  });

  test('a missing directory is an error, not a throw', () => {
    expect(seq.loadPrimitives(path.join(tmp, 'nope')).errors[0]).toMatch(/unreadable/);
  });
});

describe('parse', () => {
  test('unknown primitive names its line', () => {
    expect(errorsOf(policy('1. alpha\n2. nope'))).toEqual([expect.stringMatching(/^line 6: unknown primitive "nope"/)]);
  });

  test('unknown and missing parameters name their line', () => {
    expect(errorsOf(policy('1. alpha\n2. bravo size=big'))[0]).toMatch(/^line 6: unknown parameter "size"/);
    expect(errorsOf(policy('1. alpha\n2. bravo\n3. charlie'))[0]).toMatch(/^line 7: charlie needs tool/);
  });

  test('a step number used twice is an error (the cursor would loop on the first)', () => {
    expect(errorsOf(policy('1. alpha\n1. india'))[0]).toMatch(/^line 6: step number 1 is used twice/);
    expect(errorsOf(`## Ship\n\n1. alpha\n\n## After shipping\n\n1. hotel\n1. hotel\n`)[0]).toMatch(/step number 1 is used twice/);
  });

  test('unmet needs, wrong section', () => {
    expect(errorsOf(policy('1. bravo'))[0]).toMatch(/^line 5: bravo needs head/);
    expect(errorsOf(policy('1. alpha\n2. hotel'))[0]).toMatch(/hotel belongs under ## After shipping/);
    expect(errorsOf(`## Ship\n\n1. alpha\n\n## After shipping\n\n1. alpha\n`)[0]).toMatch(/alpha belongs under ## Ship/);
  });

  test('until that no body primitive declares, and repeat with none or two declared', () => {
    expect(errorsOf(policy('1. alpha\n2. repeat until=fixed rounds=2\n   - delta'))[0]).toMatch(/until=fixed is a result no step/);
    expect(errorsOf(policy('1. alpha\n2. repeat\n   - india'))[0]).toMatch(/^line 6: repeat has no until=/);
    expect(errorsOf(policy('1. alpha\n2. repeat\n   - delta\n   - foxtrot'))[0]).toMatch(/declare different ones \(clean, good\)/);
  });

  test('until naming a failure result (stops-on) of a body step is rejected, so a failure never ends a repeat', () => {
    const errs = errorsOf(policy('1. alpha\n2. repeat until=failed rounds=2\n   - wait-ci\n3. india'));
    expect(errs[0]).toMatch(/until=failed is a failure result of wait-ci/);
    // a success result of the same step is still a valid until
    expect(errorsOf(policy('1. alpha\n2. repeat until=passed rounds=2\n   - wait-ci\n3. india'))).toEqual([]);
  });

  test('nested repeat, stray indented step, empty repeat', () => {
    expect(errorsOf(policy('1. alpha\n2. repeat\n   - delta\n   - repeat'))[0]).toMatch(/cannot be nested/);
    expect(errorsOf(policy('1. alpha\n   - delta'))[0]).toMatch(/not inside a repeat/);
    expect(errorsOf(policy('1. alpha\n2. repeat\n3. alpha'))[0]).toMatch(/repeat has no steps/);
    expect(errorsOf(policy('1. alpha\n2. repeat rounds=0\n   - delta'))[0]).toMatch(/rounds=<positive integer>/);
  });

  test('steps in fences and under Examples (not run) are ignored', () => {
    const text = [
      '## Ship', '', '1. alpha', '', '```', '2. nonsense', '```', '',
      '## Examples (not run)', '', '1. alsonope', '', '## After shipping', '', '1. hotel', '',
    ].join('\n');
    const r = seq.parse(text, contracts);
    expect(r.errors).toEqual([]);
    expect(r.steps.map((s) => s.primitive)).toEqual(['alpha', 'hotel']);
  });

  test('quoted values and the rest of the line', () => {
    const r = seq.parse(policy('1. alpha\n2. golf npm version patch\n3. echo format="npm run fmt -- --all"'), { ...contracts, get: contracts.get.bind(contracts) });
    // echo needs findings: expect that single error only, and golf's rest captured
    expect(r.steps[1].params).toEqual({ command: 'npm version patch' });
    expect(r.steps[2].params).toEqual({ format: 'npm run fmt -- --all' });
  });

  test('a repeat with no until takes the one its body declares; rounds default is 2', () => {
    const r = seq.parse(policy('1. alpha\n2. repeat\n   - delta\n   - echo'), contracts);
    expect(r.errors).toEqual([]);
    expect(r.steps[1].repeat).toEqual({ until: 'clean', rounds: 2 });
    expect(r.steps[1].body.map((b) => b.id)).toEqual(['2.1', '2.2']);
  });

  test('no file and no Ship step are policy none', () => {
    expect(seq.parse(null, contracts)).toEqual({ steps: [], policy: 'none', errors: [] });
    expect(seq.parse('# Ship\n\n## Ship\n\nnothing yet\n', contracts).policy).toBe('none');
  });
});

describe('start', () => {
  test('policy none runs the caller fallback, parsed like any other string', () => {
    const r = seq.start(startOpts(null, { fallback: '1. alpha' }));
    expect(r).toMatchObject({ ok: true, status: 'running', policy: 'none' });
    const st = JSON.parse(fs.readFileSync(path.join(stateDir(), 'shipped.json'), 'utf8'));
    expect(st.version).toBe(2);
    expect(st.steps.map((s) => s.primitive)).toEqual(['alpha']);
  });

  test('start with no policy steps and no fallback is an error naming the argument', () => {
    const r = seq.start(startOpts(null));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/--fallback/);
  });

  test('a fallback that does not parse is an error and writes nothing', () => {
    const r = seq.start(startOpts(null, { fallback: '1. nope' }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/^fallback: line 1: unknown primitive/);
    expect(fs.existsSync(path.join(stateDir(), 'shipped.json'))).toBe(false);
  });

  test('parse errors in ship.md stop start', () => {
    const r = seq.start(startOpts(policy('1. bravo')));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/needs head/);
  });

  describe('requires: trd', () => {
    const GOOD = '# T\n\n## 4. Master Task List\n\n| Task ID | Description | Dependencies |\n|---|---|---|\n| F-001 | x | None |\n';
    const CHECKLIST = '# T\n\n## Master Task List\n\n- [ ] F-001 do it\n';
    const withTrd = (text) => {
      const trd = path.join(tmp, 'trd.md');
      if (text != null) fs.writeFileSync(trd, text);
      return { work: { kind: 'feature', id: 'f', trd, branch: 'b' } };
    };
    beforeEach(() => writeContract(contractsDir, { primitive: 'kilo', params: '', results: 'done', outward: 'no', section: 'ship', requires: 'trd' }));

    test('a checklist TRD is refused naming the path, step and Master Task List; no state', () => {
      const o = withTrd(CHECKLIST);
      const r = seq.start(startOpts(policy('1. kilo'), o));
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toContain(o.work.trd);
      expect(r.errors[0]).toMatch(/step 1 \(kilo\) needs a TRD \/implement-trd can read: .*Master Task List/);
      expect(fs.existsSync(path.join(stateDir(), 'shipped.json'))).toBe(false);
    });

    test('a parseable TRD starts', () => {
      expect(seq.start(startOpts(policy('1. kilo'), withTrd(GOOD))).ok).toBe(true);
    });

    test('a policy with no such step never reads the TRD', () => {
      expect(seq.start(startOpts(policy('1. alpha'), withTrd(null))).ok).toBe(true);
    });

    test('sweep work (no TRD) starts', () => {
      const o = { work: { kind: 'sweep', id: 's', trd: null, branch: 'b' } };
      expect(seq.start(startOpts(policy('1. kilo'), o)).ok).toBe(true);
    });
  });

  test('start on an existing state never re-reads ship.md', () => {
    seq.start(startOpts(policy('1. alpha')));
    const r = seq.start(startOpts('this file is now garbage with 1. nope'));
    expect(r).toMatchObject({ ok: true, resumed: true, status: 'running' });
    expect(seq.next(stateDir(), noAuth()).step.primitive).toBe('alpha');
  });
});

describe('next', () => {
  test('fills defaults and passes work, final, laterNeeds and context', () => {
    seq.start(startOpts(policy('1. alpha\n2. bravo\n3. delta bar=critical')));
    let n = seq.next(stateDir(), authorizeAll());
    expect(n.step).toMatchObject({ id: '1', primitive: 'alpha', contract: path.join(contractsDir, 'ship-primitive-alpha.md') });
    expect(n.step.input.work).toMatchObject({ kind: 'feature', id: 'f', trd: 'docs/TRD/f.md', branch: 'b', stateDir: stateDir() });
    expect(n.step.input.final).toBe(false);
    expect(n.step.input.laterNeeds.sort()).toEqual(['head']);
    seq.record(stateDir(), { step: '1', result: 'done', data: { head: 'abc' } }, authorizeAll());
    seq.next(stateDir(), authorizeAll());
    seq.record(stateDir(), { step: '2', result: 'opened', data: { pr: 7 } }, authorizeAll());
    n = seq.next(stateDir(), authorizeAll());
    expect(n.step.input).toMatchObject({ bar: 'critical', context: { head: 'abc', pr: 7 } });
  });

  test('a default fills in when the line gives none', () => {
    seq.start(startOpts(policy('1. alpha\n2. delta')));
    seq.next(stateDir(), noAuth());
    seq.record(stateDir(), { step: '1', result: 'done' }, noAuth());
    expect(seq.next(stateDir(), noAuth()).step.input.bar).toBe('significant');
  });

  test('done reports the shipped flag', () => {
    seq.start(startOpts(policy('1. alpha')));
    drive(noAuth(), { 1: 'done' });
    expect(seq.next(stateDir(), noAuth())).toEqual({ action: 'done', shipped: true });
  });
});

describe('record', () => {
  beforeEach(() => seq.start(startOpts(policy('1. alpha\n2. india'))));

  test('refuses a step that next has not handed out, another step and an undeclared result', () => {
    expect(seq.record(stateDir(), { step: '1', result: 'done' }, noAuth())).toMatchObject({ ok: false });
    seq.next(stateDir(), noAuth());
    expect(seq.record(stateDir(), { step: '2', result: 'gone' }, noAuth()).reason).toMatch(/not the step handed out/);
    expect(seq.record(stateDir(), { step: '1', result: 'bogus' }, noAuth()).reason).toMatch(/does not declare the result "bogus"/);
    expect(seq.record(stateDir(), { step: '1', result: 'done' }, noAuth())).toMatchObject({ ok: true, status: 'running' });
  });

  test('wait parks the run and the same step is handed out again; so is stop', () => {
    seq.next(stateDir(), noAuth());
    expect(seq.record(stateDir(), { step: '1', result: 'wait', reason: 'for review' }, noAuth())).toMatchObject({ status: 'waiting' });
    expect(seq.status(stateDir())).toMatchObject({ status: 'waiting', waiting: 'for review' });
    expect(seq.next(stateDir(), noAuth()).step.id).toBe('1');
    expect(seq.record(stateDir(), { step: '1', result: 'stop', reason: 'no' }, noAuth())).toMatchObject({ status: 'stuck', reason: 'no' });
    expect(seq.status(stateDir())).toMatchObject({ status: 'stuck', stuck: 'no' });
    expect(seq.next(stateDir(), noAuth()).step.id).toBe('1');
  });

  test('a record after done is refused', () => {
    drive(noAuth(), { 1: 'done', 2: 'gone' });
    expect(seq.record(stateDir(), { step: '2', result: 'gone' }, noAuth()).ok).toBe(false);
  });
});

describe('failure results outside a repeat', () => {
  beforeEach(() => seq.start(startOpts(policy('1. alpha\n2. wait-ci\n3. india'))));

  test('a failed step stops the run on that step and never hands out the next', () => {
    seq.next(stateDir(), noAuth());
    seq.record(stateDir(), { step: '1', result: 'done' }, noAuth());
    seq.next(stateDir(), noAuth());
    const r = seq.record(stateDir(), { step: '2', result: 'failed' }, noAuth());
    expect(r).toMatchObject({ ok: true, status: 'stuck', reason: 'step 2 (wait-ci) recorded failed; the run stops here' });
    expect(seq.status(stateDir()).cursor.step).toBe('2');
    expect(seq.next(stateDir(), noAuth()).step.id).toBe('2');
  });

  test('passed and no-checks still advance', () => {
    expect(drive(noAuth(), { 1: 'done', 2: 'passed', 3: 'gone' }).handed.map((h) => h.id)).toEqual(['1', '2', '3']);
  });

  test('no-checks advances', () => {
    expect(drive(noAuth(), { 1: 'done', 2: 'no-checks', 3: 'gone' }).handed.map((h) => h.id)).toEqual(['1', '2', '3']);
  });
});

describe('repeat', () => {
  const text = policy('1. alpha\n2. repeat rounds=2\n   - delta\n   - echo\n3. india');

  test('exits on its until result and skips the rest of its body', () => {
    seq.start(startOpts(text));
    const { handed } = drive(noAuth(), { 1: 'done', '2.1': 'clean', 3: 'gone' });
    expect(handed.map((h) => h.id)).toEqual(['1', '2.1', '3']);
  });

  test('runs at most rounds more passes and sets final only on the last', () => {
    seq.start(startOpts(text));
    const { handed, last } = drive(noAuth(), { 1: 'done', '2.1': 'found', '2.2': 'fixed' });
    expect(handed.map((h) => h.id)).toEqual(['1', '2.1', '2.2', '2.1', '2.2', '2.1', '2.2']);
    expect(handed.filter((h) => h.final).map((h) => h.id)).toEqual(['2.1', '2.2']);
    expect(handed.slice(0, 5).every((h) => !h.final)).toBe(true);
    expect(last).toMatchObject({ status: 'stuck', reason: 'repeat ended without clean after 2 rounds' });
  });

  test('exits on the final pass when the until result comes', () => {
    seq.start(startOpts(text));
    const { handed } = drive(noAuth(), { 1: 'done', '2.1': ['found', 'found', 'clean'], '2.2': 'fixed', 3: 'gone' });
    expect(handed.map((h) => h.id)).toEqual(['1', '2.1', '2.2', '2.1', '2.2', '2.1', '3']);
  });

  test('laterNeeds counts the body again while another pass remains', () => {
    seq.start(startOpts(policy('1. alpha\n2. repeat rounds=1\n   - delta\n   - echo')));
    seq.next(stateDir(), noAuth());
    seq.record(stateDir(), { step: '1', result: 'done' }, noAuth());
    expect(seq.next(stateDir(), noAuth()).step.input.laterNeeds.sort()).toEqual(['findings', 'head']);
    seq.record(stateDir(), { step: '2.1', result: 'found' }, noAuth());
    // at echo on pass 1, the whole body comes round again
    expect(seq.next(stateDir(), noAuth()).step.input.laterNeeds.sort()).toEqual(['findings', 'head']);
    seq.record(stateDir(), { step: '2.2', result: 'fixed' }, noAuth());
    seq.next(stateDir(), noAuth());
    seq.record(stateDir(), { step: '2.1', result: 'found' }, noAuth());
    // final pass: nothing comes round again
    expect(seq.next(stateDir(), noAuth()).step.input.laterNeeds).toEqual([]);
  });
});

describe('shipped flag', () => {
  test('becomes true after the last Ship step and before the first after-shipping step', () => {
    seq.start(startOpts(`## Ship\n\n1. alpha\n\n## After shipping\n\n1. hotel\n`));
    const opts = authorizeAll();
    seq.next(stateDir(), opts);
    expect(seq.status(stateDir()).shipped).toBe(false);
    expect(seq.record(stateDir(), { step: '1', result: 'done' }, opts)).toMatchObject({ shipped: true, status: 'running' });
    expect(seq.next(stateDir(), opts).step.primitive).toBe('hotel');
    expect(seq.record(stateDir(), { step: 'a1', result: 'filed' }, opts)).toMatchObject({ status: 'done', shipped: true });
  });
});

describe('outward gate', () => {
  const text = policy('1. alpha\n2. charlie tool=x');
  const run = (opts) => {
    seq.next(stateDir(), opts);
    seq.record(stateDir(), { step: '1', result: 'done' }, opts);
    return seq.next(stateDir(), opts);
  };

  test('an outward step is refused without the sentence, then handed out once it is there', () => {
    seq.start(startOpts(text));
    const n = run(noAuth());
    expect(n).toMatchObject({ action: 'stop', reason: 'not authorized: charlie', step: { id: '2' } });
    expect(seq.status(stateDir())).toMatchObject({ status: 'stuck', stuck: 'not authorized: charlie' });
    expect(seq.next(stateDir(), authorizeAll()).action).toBe('run');
  });

  test('the sentence wrapped across two lines is accepted', () => {
    seq.start(startOpts(text));
    const a = path.join(tmp, 'wrapped.md');
    const cut = seq.AUTHORIZATION_SENTENCE.indexOf(' standing');
    const [head, tail] = [seq.AUTHORIZATION_SENTENCE.slice(0, cut), seq.AUTHORIZATION_SENTENCE.slice(cut)];
    fs.writeFileSync(a, `${head}\n  ${tail.trimStart()}\n`);
    expect(run({ contractsDir, autonomyPath: a, settingsPath: '' }).action).toBe('run');
  });

  test('an unless condition is read from settings.json', () => {
    seq.start(startOpts(policy('1. alpha\n2. bravo')));
    const settings = path.join(tmp, 'settings.json');
    const opts = { contractsDir, autonomyPath: path.join(tmp, 'none.md'), settingsPath: settings };
    fs.writeFileSync(settings, JSON.stringify({ ensemble: { openPullRequest: 'never' } }));
    expect(run(opts).action).toBe('stop');
    fs.writeFileSync(settings, JSON.stringify({ ensemble: { openPullRequest: 'auto' } }));
    expect(seq.next(stateDir(), opts).action).toBe('run');
  });

  test('an unparsable settings file means not authorized, never a throw', () => {
    seq.start(startOpts(policy('1. alpha\n2. bravo')));
    const settings = path.join(tmp, 'settings.json');
    fs.writeFileSync(settings, '{ not json');
    expect(run({ contractsDir, autonomyPath: path.join(tmp, 'none.md'), settingsPath: settings }).action).toBe('stop');
  });
});

describe('open for extension, closed for primitives', () => {
  test('a contract added to the directory runs with no sequencer change', () => {
    writeContract(contractsDir, { primitive: 'newcomer', params: 'size=m', results: 'seen', outward: 'no', needs: 'head', section: 'ship' });
    seq.start(startOpts(policy('1. alpha\n2. newcomer size=l')));
    const { handed, last } = drive(noAuth(), { 1: 'done', 2: 'seen' });
    expect(handed.map((h) => h.id)).toEqual(['1', '2']);
    expect(last).toMatchObject({ action: 'done' });
  });

  // A primitive is "named" as a bare word or quoted string. Property access (`out.push(x)`,
  // `.merge(`) is ordinary JS, not a naming, so a preceding `.` is excluded.
  const namesPrimitive = (name) => new RegExp(`(?<![\\w.-])${name}(?![\\w-])`);

  test('the primitive-name guard flags words and quoted names but not method calls', () => {
    expect("case 'release':").toMatch(namesPrimitive('release'));
    expect('const a = "merge";').toMatch(namesPrimitive('merge'));
    expect("x === 'push'").toMatch(namesPrimitive('push'));
    expect('arr.push(x)').not.toMatch(namesPrimitive('push'));
    expect('db.merge(x); this.release()').not.toMatch(namesPrimitive('merge'));
    expect('db.merge(x); this.release()').not.toMatch(namesPrimitive('release'));
  });

  test('the module source names no primitive (names read from the contracts directory)', () => {
    const real = seq.loadPrimitives(path.join(__dirname, '..', 'contracts'));
    const names = [...real.contracts.keys()];
    const results = new Set([...real.contracts.values()].flatMap((c) => c.results));
    const source = fs
      .readFileSync(SCRIPT, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // `run` is also the ordinary action word `next` returns; it is checked as a quoted whole
    // only when no contract named it (a contract directory today may or may not hold it).
    // `none` is likewise generic: the sequencer's own empty-value and no-policy sentinel, which a
    // contract (close-issue) may also declare as a result word.
    const generic = new Set(['run', 'stop', 'wait', 'done', 'none']);
    for (const name of names.filter((n) => !generic.has(n))) {
      expect(source).not.toMatch(namesPrimitive(name));
    }
    for (const word of [...results].filter((w) => !generic.has(w))) {
      expect(source).not.toMatch(new RegExp(`['"\`]${word}['"\`]`));
    }
  });
});

describe('atomic writes', () => {
  test('state is written through a temp file and no temp file remains', () => {
    seq.start(startOpts(policy('1. alpha')));
    seq.next(stateDir(), noAuth());
    seq.record(stateDir(), { step: '1', result: 'done' }, noAuth());
    expect(fs.readdirSync(stateDir())).toEqual(['shipped.json']);
    expect(() => JSON.parse(fs.readFileSync(path.join(stateDir(), 'shipped.json'), 'utf8'))).not.toThrow();
  });
});

describe('authorization', () => {
  const auth = (text, autonomy, settings) => {
    const a = path.join(tmp, 'a.md');
    const st = path.join(tmp, 'st.json');
    if (autonomy != null) fs.writeFileSync(a, autonomy);
    if (settings != null) fs.writeFileSync(st, JSON.stringify(settings));
    return seq.authorization(text, contracts, { autonomyPath: a, settingsPath: st });
  };
  const text = policy('1. alpha\n2. bravo\n3. repeat until=clean\n   - delta\n4. charlie tool=x');

  test('without the sentence only the outward step is refused; an unless that holds is not', () => {
    expect(auth(text, null, { ensemble: { openPullRequest: 'auto' } })).toEqual({ sentence: 'absent', refused: ['charlie'] });
    expect(auth(text, null, {}).refused).toEqual(['bravo', 'charlie']);
  });

  test('with the sentence nothing is refused', () => {
    expect(auth(text, seq.AUTHORIZATION_SENTENCE, {})).toEqual({ sentence: 'present', refused: [] });
  });

  test('CLI prints one JSON line', () => {
    const p = path.join(tmp, 'ship.md');
    fs.writeFileSync(p, text);
    const r = spawnSync('node', [SCRIPT, 'authorization', '--policy', p, '--contracts', contractsDir,
      '--autonomy', path.join(tmp, 'none.md'), '--settings', path.join(tmp, 'none.json')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ sentence: 'absent', refused: ['bravo', 'charlie'] });
  });
});

describe('detach-on', () => {
  const cleanEnv = () => {
    const e = { ...process.env };
    delete e.GIT_DIR;
    delete e.GIT_WORK_TREE;
    delete e.GIT_INDEX_FILE;
    return e;
  };
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const tracked = () => path.join(stateDir(), 'shipped.json');
  const POLICY = policy('1. alpha\n2. mike\n3. india');
  const authOpts = () => authorizeAll();

  beforeEach(() => {
    writeContract(contractsDir, {
      primitive: 'mike', params: '', results: 'merged, blocked', 'detach-on': 'merged, bogus', outward: 'no', section: 'ship',
    });
  });

  // A repo under tmp, state dir inside it at <repo>/.trd-state/f.
  function makeRepo() {
    const root = path.join(tmp, 'repo');
    fs.mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@example.com');
    git(root, 'config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'README'), 'x');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'init');
    git(root, 'checkout', '-q', '-b', 'feature');
    return fs.realpathSync(root);
  }
  const repoState = (root) => path.join(root, '.trd-state', 'f');
  function startIn(root) {
    const p = path.join(tmp, 'ship.md');
    fs.writeFileSync(p, POLICY);
    const o = { stateDir: repoState(root), policyPath: p, contractsDir, work: { kind: 'feature', id: 'f', trd: 'docs/TRD/f.md', branch: 'feature' } };
    expect(seq.start(o).ok).toBe(true);
    return o;
  }
  const handOut = (root, id, opts) => expect(seq.next(repoState(root), opts).step.id).toBe(id);
  const step = (root, id, result, opts) => {
    handOut(root, id, opts);
    return seq.record(repoState(root), { step: id, result }, opts);
  };

  test('only results listed in detach-on are kept by the loader', () => {
    expect(seq.loadPrimitives(contractsDir).contracts.get('mike').detachOn).toEqual(['merged']);
  });

  test('recording a detach-on result writes the external file; the tracked file is never written again', () => {
    const root = makeRepo();
    startIn(root);
    const opts = authOpts();
    step(root, '1', 'done', opts);
    const file = path.join(repoState(root), 'shipped.json');
    handOut(root, '2', opts); // next() still writes the tracked file; only record() detaches
    const before = fs.readFileSync(file, 'utf8');
    const r = seq.record(repoState(root), { step: '2', result: 'merged' }, opts);
    const startedAt = JSON.parse(before).startedAt;
    const expected = path.join(git(root, 'rev-parse', '--git-common-dir').replace(/^\.git$/, path.join(root, '.git')),
      'ensemble', 'ship', 'f', `${startedAt.replace(/[:.]/g, '-')}.json`);
    expect(r.recordPath).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    const r3 = step(root, '3', 'gone', opts);
    expect(r3.recordPath).toBe(expected);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    const st = seq.status(repoState(root));
    expect(st).toMatchObject({ status: 'done', shipped: true, recordPath: expected });
  });

  test('a blocked (non-detach) result keeps the tracked file', () => {
    const root = makeRepo();
    startIn(root);
    const opts = authOpts();
    step(root, '1', 'done', opts);
    const r = step(root, '2', 'blocked', opts);
    expect(r.recordPath).toBe(path.join(repoState(root), 'shipped.json'));
  });

  test('status still reads the detached record after the branch is merged and deleted', () => {
    const root = makeRepo();
    const o = startIn(root);
    const opts = authOpts();
    step(root, '1', 'done', opts);
    handOut(root, '2', opts);
    git(root, 'add', '-f', '.trd-state');
    git(root, 'commit', '-q', '-m', 'pre-merge record');
    seq.record(repoState(root), { step: '2', result: 'merged' }, opts);
    git(root, 'checkout', '-q', 'main');
    git(root, 'merge', '-q', '--ff-only', 'feature');
    git(root, 'branch', '-q', '-D', 'feature');
    // The tracked file as merged is the pre-merge record; the external one completes it.
    expect(JSON.parse(fs.readFileSync(path.join(repoState(root), 'shipped.json'), 'utf8')).cursor.step).toBe('2');
    step(root, '3', 'gone', opts);
    const st = seq.status(repoState(root));
    expect(st).toMatchObject({ status: 'done', shipped: true });
    expect(o.stateDir).toBe(repoState(root));
  });

  test('outside a git repo the tracked file is used', () => {
    startOpts(POLICY);
    expect(seq.start(startOpts(POLICY)).ok).toBe(true);
    const opts = authOpts();
    const first = seq.next(stateDir(), opts);
    seq.record(stateDir(), { step: first.step.id, result: 'done' }, opts);
    const n = seq.next(stateDir(), opts);
    const r = seq.record(stateDir(), { step: n.step.id, result: 'merged' }, opts);
    expect(r.recordPath).toBe(tracked());
    expect(JSON.parse(fs.readFileSync(tracked(), 'utf8')).detached).toBeUndefined();
  });

  test('a new run with a different startedAt never reads the old external record', () => {
    const root = makeRepo();
    startIn(root);
    const opts = authOpts();
    step(root, '1', 'done', opts);
    step(root, '2', 'merged', opts);
    const file = path.join(repoState(root), 'shipped.json');
    const fresh = JSON.parse(fs.readFileSync(file, 'utf8'));
    fresh.startedAt = '2099-01-01T00:00:00.000Z';
    fresh.cursor = { step: '1', pass: 1 };
    fs.writeFileSync(file, JSON.stringify(fresh));
    const st = seq.status(repoState(root));
    expect(st.status).not.toBe('done');
    expect(st.cursor).toEqual({ step: '1', pass: 1 });
    expect(st.recordPath).toBe(file);
  });
});

describe('CLI', () => {
  const cli = (args) => {
    const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : null, err: r.stderr };
  };

  test('start, next, record, status, parse each print one JSON line', () => {
    const p = path.join(tmp, 'ship.md');
    fs.writeFileSync(p, policy('1. alpha\n2. india'));
    const common = ['--contracts', contractsDir];
    expect(cli(['parse', '--policy', p, ...common]).out).toMatchObject({ policy: 'ship.md', errors: [] });
    const s = cli(['start', '--state-dir', stateDir(), '--policy', p, '--kind', 'feature', '--id', 'f', ...common]);
    expect(s).toMatchObject({ code: 0, out: { ok: true, status: 'running' } });
    const n = cli(['next', '--state-dir', stateDir(), ...common]);
    expect(n.out).toMatchObject({ action: 'run', step: { id: '1' } });
    const r = cli(['record', '--state-dir', stateDir(), '--step', '1', '--result', 'done', '--data', '{"head":"abc"}', ...common]);
    expect(r.out).toMatchObject({ ok: true });
    expect(cli(['status', '--state-dir', stateDir()]).out.steps[0]).toMatchObject({ id: '1', result: 'done' });
    expect(cli(['record', '--state-dir', stateDir(), '--step', '2', '--result', 'gone', '--data', 'x', ...common]).out.reason).toMatch(/not valid JSON/);
  });

  test('a usage error exits 2', () => {
    const r = cli(['bogus']);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/usage/);
  });
});
