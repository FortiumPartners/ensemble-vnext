'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  checkEvidence,
  decideNext,
  renderReport,
  DEFAULT_CAP,
} = require('./functional-verification');

const MODULE_PATH = path.join(__dirname, 'functional-verification.js');

// ---------------------------------------------------------------------------
// checkEvidence
// ---------------------------------------------------------------------------

describe('checkEvidence', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('no-artifact — claim carries null artifact', () => {
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact: null }], 0);
    expect(verdict).toEqual({
      criterion: 'FS-1',
      tier1: 'fail',
      artifact: null,
      bytes: null,
      mtimeSec: null,
      failure: 'no-artifact',
    });
  });

  test('missing — path does not exist', () => {
    const artifact = path.join(tmpDir, 'does-not-exist.txt');
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], 0);
    expect(verdict).toMatchObject({
      criterion: 'FS-1',
      tier1: 'fail',
      artifact,
      bytes: null,
      mtimeSec: null,
      failure: 'missing',
    });
  });

  test('empty — exists with zero bytes', () => {
    const artifact = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(artifact, '');
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], 0);
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('empty');
    expect(verdict.bytes).toBe(0);
  });

  test('stale — mtime not strictly greater than sinceSec', () => {
    const artifact = path.join(tmpDir, 'stale.txt');
    fs.writeFileSync(artifact, 'evidence');
    const stat = fs.statSync(artifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);
    // sinceSec == mtimeSec: "not strictly greater than" must fail.
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], mtimeSec);
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('stale');
  });

  test('pass — exists, non-empty, strictly newer than sinceSec', () => {
    const artifact = path.join(tmpDir, 'fresh.txt');
    fs.writeFileSync(artifact, 'evidence');
    const stat = fs.statSync(artifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], mtimeSec - 3600);
    expect(verdict).toMatchObject({
      criterion: 'FS-1',
      tier1: 'pass',
      artifact,
      bytes: 8,
    });
    expect(verdict.failure).toBeUndefined();
  });

  test('maps multiple claims independently, preserving order', () => {
    const passArtifact = path.join(tmpDir, 'pass.txt');
    fs.writeFileSync(passArtifact, 'x');
    const stat = fs.statSync(passArtifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);

    const claims = [
      { criterion: 'FS-1', artifact: null },
      { criterion: 'FS-2', artifact: passArtifact },
      { criterion: 'FS-3', artifact: path.join(tmpDir, 'missing.txt') },
    ];
    const verdicts = checkEvidence(claims, mtimeSec - 10);
    expect(verdicts.map((v) => v.criterion)).toEqual(['FS-1', 'FS-2', 'FS-3']);
    expect(verdicts[0].failure).toBe('no-artifact');
    expect(verdicts[1].tier1).toBe('pass');
    expect(verdicts[2].failure).toBe('missing');
  });
});

// ---------------------------------------------------------------------------
// decideNext
// ---------------------------------------------------------------------------

describe('decideNext', () => {
  test('exit-unbuilt wins even with a non-empty gaps set (branch order, D14)', () => {
    const result = decideNext({
      iteration: 1,
      gaps: ['FS-2'],
      unbuilt: ['FS-1'],
      previousGaps: null,
    });
    expect(result.action).toBe('exit-unbuilt');
  });

  test('one unbuilt criterion with no other gaps exits unbuilt, not satisfied', () => {
    // The careful note this task is built around: unbuilt is checked BEFORE
    // gaps.length === 0, so this must not resolve to exit-satisfied.
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: ['FS-1'],
      previousGaps: null,
    });
    expect(result.action).toBe('exit-unbuilt');
  });

  test('exit-satisfied when no gaps and nothing unbuilt', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('exit-stalled when previousGaps is non-null and nothing closed', () => {
    const result = decideNext({
      iteration: 2,
      gaps: ['FS-1', 'FS-2'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
    });
    expect(result.action).toBe('exit-stalled');
    expect(result.closed).toEqual([]);
  });

  test('previousGaps === null on the first iteration never triggers stalled', () => {
    // Even though closed.length === 0 trivially (nothing to close), the stall rule
    // requires previousGaps to be non-null (i.e. not a fresh run).
    const result = decideNext({
      iteration: 1,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: null,
    });
    expect(result.action).toBe('remediate');
    expect(result.closed).toEqual([]);
  });

  test('exit-stuck when iteration reaches the cap with gaps still open', () => {
    const result = decideNext({
      iteration: 3,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      cap: 3,
    });
    // closed = ['FS-2'] so it does not fall into stalled; it reaches the cap instead.
    expect(result.closed).toEqual(['FS-2']);
    expect(result.action).toBe('exit-stuck');
  });

  test('remediate when gaps remain, some closed, cap not reached', () => {
    const result = decideNext({
      iteration: 2,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      cap: 3,
    });
    expect(result.closed).toEqual(['FS-2']);
    expect(result.action).toBe('remediate');
  });

  test('honours args.cap rather than only the module default', () => {
    // cap of 1 forces exit-stuck on iteration 1 instead of remediate.
    const result = decideNext({
      iteration: 1,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: null,
      cap: 1,
    });
    expect(result.action).toBe('exit-stuck');
  });

  test('default cap is 3 when args.cap is omitted', () => {
    expect(DEFAULT_CAP).toBe(3);
    const remediateResult = decideNext({
      iteration: 2,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
    });
    expect(remediateResult.action).toBe('remediate');

    const stuckResult = decideNext({
      iteration: 3,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
    });
    expect(stuckResult.action).toBe('exit-stuck');
  });

  test('every result includes a non-empty reason string', () => {
    for (const input of [
      { iteration: 1, gaps: [], unbuilt: ['FS-1'], previousGaps: null },
      { iteration: 1, gaps: [], unbuilt: [], previousGaps: null },
      { iteration: 2, gaps: ['FS-1'], unbuilt: [], previousGaps: ['FS-1'] },
      { iteration: 3, gaps: ['FS-1'], unbuilt: [], previousGaps: [] },
      { iteration: 1, gaps: ['FS-1'], unbuilt: [], previousGaps: null },
    ]) {
      const result = decideNext(input);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// renderReport
// ---------------------------------------------------------------------------

describe('renderReport', () => {
  const baseInput = {
    feature: 'functional-verification',
    prd: 'docs/PRD/functional-verification.md',
    definitionPath: '.trd-state/functional-verification/success-definition.md',
    outcome: 'stalled',
    reason: 'iteration closed no gaps',
    criteria: [
      {
        id: 'FS-1',
        statement: 'A user can sign in and reach the dashboard',
        cites: 'FR-2',
        status: 'met',
        artifact: '.trd-state/functional-verification/evidence/fs-1.png',
        reason: null,
        attempts: [],
        blocker: null,
      },
      {
        id: 'FS-2',
        statement: 'A repeated submit does not create two orders',
        cites: 'domain-derived',
        status: 'not_met',
        artifact: null,
        reason: 'second POST created a second order row',
        attempts: [{ iteration: 1, result: 'added idempotency-key check; still duplicated' }],
        blocker: 'race condition in order creation',
      },
      {
        id: 'FS-3',
        statement: 'Mobile push notifications are delivered within 5s',
        cites: 'FR-9',
        status: 'not_verifiable',
        artifact: null,
        reason: 'project has no mobile harness',
        attempts: [],
        blocker: null,
      },
      {
        id: 'FS-4',
        statement: 'An admin can export usage reports as CSV',
        cites: 'FR-11',
        status: 'unbuilt',
        artifact: null,
        reason: 'no export endpoint or UI exists',
        attempts: [],
        blocker: null,
      },
    ],
  };

  test('every criterion in the definition appears in the report (AC-9)', () => {
    const report = renderReport(baseInput);
    for (const c of baseInput.criteria) {
      expect(report).toContain(c.id);
    }
  });

  test('renders one section per status, with unbuilt and not_verifiable kept separate', () => {
    const report = renderReport(baseInput);
    expect(report).toContain('## Unbuilt');
    expect(report).toContain('## Met');
    expect(report).toContain('## Not Met');
    expect(report).toContain('## Not Verifiable');

    // not_verifiable must not be folded into Not Met, and vice versa.
    const notMetSection = report.split('## Not Met')[1].split('## Not Verifiable')[0];
    expect(notMetSection).not.toContain('FS-3');
    expect(notMetSection).toContain('FS-2');

    const notVerifiableSection = report.split('## Not Verifiable')[1];
    expect(notVerifiableSection).toContain('FS-3');
    expect(notVerifiableSection).not.toContain('FS-2');
  });

  test('unbuilt criteria render under an outcome line saying implementation did not deliver', () => {
    const report = renderReport(baseInput);
    const unbuiltSection = report.split('## Unbuilt')[1].split('## Met')[0];
    expect(unbuiltSection.toLowerCase()).toContain('did not deliver');
    expect(unbuiltSection).toContain('FS-4');
  });

  test('includes feature, prd, outcome and reason header fields', () => {
    const report = renderReport(baseInput);
    expect(report).toContain(baseInput.feature);
    expect(report).toContain(baseInput.prd);
    expect(report).toContain(baseInput.reason);
  });

  test('an empty Met section renders _None._ rather than a headerless table', () => {
    const noneMet = {
      ...baseInput,
      criteria: baseInput.criteria.filter((c) => c.status !== 'met'),
    };
    const report = renderReport(noneMet);
    const metSection = report.split('## Met')[1].split('## Not Met')[0];
    expect(metSection).toContain('_None._');
    expect(metSection).not.toContain('| ID |');
  });

  test('handles a criteria set with no entries in a given status without throwing', () => {
    const onlyMet = {
      ...baseInput,
      outcome: 'satisfied',
      criteria: [baseInput.criteria[0]],
    };
    const report = renderReport(onlyMet);
    expect(report).toContain('_None._');
    expect(report).toContain('FS-1');
  });
});

// ---------------------------------------------------------------------------
// CLI subcommands
// ---------------------------------------------------------------------------

describe('CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('check-evidence subcommand: JSON in, JSON array out', () => {
    const artifact = path.join(tmpDir, 'evidence.txt');
    fs.writeFileSync(artifact, 'proof');
    const stat = fs.statSync(artifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);
    const claims = JSON.stringify([{ criterion: 'FS-1', artifact }]);

    const stdout = execFileSync('node', [
      MODULE_PATH,
      'check-evidence',
      claims,
      String(mtimeSec - 10),
    ]).toString();

    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ criterion: 'FS-1', tier1: 'pass' });
  });

  test('decide-next subcommand: JSON in, JSON object out', () => {
    const input = JSON.stringify({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
    });

    const stdout = execFileSync('node', [MODULE_PATH, 'decide-next', input]).toString();
    const parsed = JSON.parse(stdout);
    expect(parsed.action).toBe('exit-satisfied');
    expect(Array.isArray(parsed.closed)).toBe(true);
  });

  test('render-report subcommand: JSON in, markdown out (not JSON)', () => {
    const input = JSON.stringify({
      feature: 'demo',
      prd: 'docs/PRD/demo.md',
      definitionPath: '.trd-state/demo/success-definition.md',
      outcome: 'satisfied',
      reason: 'all criteria met',
      criteria: [
        {
          id: 'FS-1',
          statement: 'demo works',
          cites: 'FR-1',
          status: 'met',
          artifact: 'evidence.png',
          reason: null,
          attempts: [],
          blocker: null,
        },
      ],
    });

    const stdout = execFileSync('node', [MODULE_PATH, 'render-report', input]).toString();
    expect(stdout).toContain('# Functional Verification Report: demo');
    expect(() => JSON.parse(stdout)).toThrow();
  });

  test('unknown subcommand exits non-zero with usage on stderr', () => {
    expect(() => {
      execFileSync('node', [MODULE_PATH, 'bogus-subcommand'], { stdio: 'pipe' });
    }).toThrow();
  });

  test('missing arguments exits non-zero with usage on stderr', () => {
    expect(() => {
      execFileSync('node', [MODULE_PATH, 'check-evidence'], { stdio: 'pipe' });
    }).toThrow();
  });

  test('check-evidence rejects a non-numeric sinceSec rather than reporting everything stale', () => {
    // Number('not-a-number') is NaN, and `mtimeSec > NaN` is false for every artifact, so
    // an unvalidated argument would silently mark all evidence `stale` and fabricate gaps.
    const artifact = path.join(tmpDir, 'evidence.txt');
    fs.writeFileSync(artifact, 'proof');
    const claims = JSON.stringify([{ criterion: 'FS-1', artifact }]);

    expect(() => {
      execFileSync('node', [MODULE_PATH, 'check-evidence', claims, 'not-a-number'], {
        stdio: 'pipe',
      });
    }).toThrow();
  });

  // -------------------------------------------------------------------------
  // --file / stdin payload input (Finding: shell-quoting hazard with inline JSON)
  // -------------------------------------------------------------------------

  test('check-evidence accepts the claims payload via --file <path>', () => {
    const artifact = path.join(tmpDir, 'evidence.txt');
    fs.writeFileSync(artifact, 'proof');
    const stat = fs.statSync(artifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);

    // A reason string carrying an apostrophe -- the exact shape that breaks a '<json>'-quoted
    // inline argument -- must round-trip cleanly through a file.
    const claimsFile = path.join(tmpDir, 'claims.json');
    fs.writeFileSync(
      claimsFile,
      JSON.stringify([{ criterion: 'FS-1', artifact, reason: "couldn't start the server" }])
    );

    const stdout = execFileSync('node', [
      MODULE_PATH,
      'check-evidence',
      '--file',
      claimsFile,
      String(mtimeSec - 10),
    ]).toString();

    const parsed = JSON.parse(stdout);
    expect(parsed[0]).toMatchObject({ criterion: 'FS-1', tier1: 'pass' });
  });

  test('check-evidence accepts the claims payload via stdin (-)', () => {
    const artifact = path.join(tmpDir, 'evidence.txt');
    fs.writeFileSync(artifact, 'proof');
    const stat = fs.statSync(artifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);
    const claims = JSON.stringify([{ criterion: 'FS-1', artifact, reason: "couldn't start it" }]);

    const stdout = execFileSync('node', [MODULE_PATH, 'check-evidence', '-', String(mtimeSec - 10)], {
      input: claims,
    }).toString();

    const parsed = JSON.parse(stdout);
    expect(parsed[0]).toMatchObject({ criterion: 'FS-1', tier1: 'pass' });
  });

  test('decide-next accepts the input payload via --file <path>', () => {
    const inputFile = path.join(tmpDir, 'decide.json');
    fs.writeFileSync(
      inputFile,
      JSON.stringify({ iteration: 1, gaps: [], unbuilt: [], previousGaps: null })
    );

    const stdout = execFileSync('node', [MODULE_PATH, 'decide-next', '--file', inputFile]).toString();
    const parsed = JSON.parse(stdout);
    expect(parsed.action).toBe('exit-satisfied');
  });

  test('render-report accepts the input payload via --file <path>', () => {
    const inputFile = path.join(tmpDir, 'report.json');
    fs.writeFileSync(
      inputFile,
      JSON.stringify({
        feature: 'demo',
        prd: 'docs/PRD/demo.md',
        definitionPath: '.trd-state/demo/success-definition.md',
        outcome: 'satisfied',
        reason: 'all criteria met',
        criteria: [],
      })
    );

    const stdout = execFileSync('node', [MODULE_PATH, 'render-report', '--file', inputFile]).toString();
    expect(stdout).toContain('# Functional Verification Report: demo');
  });
});

// ---------------------------------------------------------------------------
// Mirror parity — packages/core/lib is copied to .claude/lib by plain `cp`,
// not symlinked, so a change to one copy and not the other drifts silently.
// ---------------------------------------------------------------------------

describe('mirror parity', () => {
  const MIRROR_PATH = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'lib',
    'functional-verification.js'
  );

  test('exists in both packages/core/lib and .claude/lib', () => {
    expect(fs.existsSync(MODULE_PATH)).toBe(true);
    expect(fs.existsSync(MIRROR_PATH)).toBe(true);
  });

  test('the two copies are byte-identical', () => {
    expect(fs.readFileSync(MIRROR_PATH, 'utf8')).toBe(fs.readFileSync(MODULE_PATH, 'utf8'));
  });
});
