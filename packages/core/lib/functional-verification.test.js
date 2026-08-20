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

  // The --verify-functional --resume composition (TRD §3.2, §3.7 step 2). That path skips the
  // phase loop, so HEAD dates from the PRIOR run and the prior run's leftover evidence -- at
  // the same paths under .trd-state/<feature>/evidence/ -- all postdates it. Under a HEAD-only
  // floor every one of those cleared the gate having proved nothing about the current run.
  // Both halves are asserted: the artifact must PASS the old floor (or this test proves
  // nothing) and FAIL the floor as specified.
  test("stale — a prior run's artifact postdates HEAD but predates this run's loop start", () => {
    const artifact = path.join(tmpDir, 'prior-run-evidence.txt');
    fs.writeFileSync(artifact, 'evidence from the run before this one');

    const headSec = 1_700_000_000; // HEAD, dating from the prior run
    const artifactSec = headSec + 60; // the prior run wrote this AFTER that commit
    const loopStartSec = headSec + 3600; // this resumed run's loop starts an hour later
    fs.utimesSync(artifact, new Date(artifactSec * 1000), new Date(artifactSec * 1000));

    // The old floor: HEAD's commit time alone. The stale artifact sailed through.
    const [underHeadOnly] = checkEvidence([{ criterion: 'FS-1', artifact }], headSec);
    expect(underHeadOnly.tier1).toBe('pass');

    // The floor as specified: max(HEAD commit time, loop start time).
    const sinceSec = Math.max(headSec, loopStartSec);
    expect(sinceSec).toBe(loopStartSec);
    const [underMaxFloor] = checkEvidence([{ criterion: 'FS-1', artifact }], sinceSec);
    expect(underMaxFloor.tier1).toBe('fail');
    expect(underMaxFloor.failure).toBe('stale');
  });

  // The max() is not redundant: a commit authored on a machine with a skewed clock can carry a
  // timestamp ahead of local now, and the floor must not fall below HEAD when it does. Without
  // this the line reads as "max of two things where one always wins" and gets simplified away.
  test('the floor takes HEAD when a skewed-clock commit postdates the loop start', () => {
    const artifact = path.join(tmpDir, 'evidence.txt');
    fs.writeFileSync(artifact, 'evidence');

    const loopStartSec = 1_700_000_000;
    const headSec = loopStartSec + 3600; // commit timestamp ahead of local now
    const artifactSec = loopStartSec + 60; // after the loop started, before HEAD's stamp
    fs.utimesSync(artifact, new Date(artifactSec * 1000), new Date(artifactSec * 1000));

    const sinceSec = Math.max(headSec, loopStartSec);
    expect(sinceSec).toBe(headSec);
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], sinceSec);
    expect(verdict.failure).toBe('stale');
  });

  // CHARACTERIZATION of the half the per-run floor does NOT close (TRD `## Could Not Verify`):
  // it is per-RUN, so iteration 1's artifact still clears it when iteration 3 is judged. Pinned
  // so the remaining gap stays visible rather than being rediscovered.
  test('KNOWN GAP: an earlier iteration\'s artifact still clears the per-run floor', () => {
    const artifact = path.join(tmpDir, 'iteration-1-evidence.txt');
    fs.writeFileSync(artifact, 'produced by iteration 1');

    const loopStartSec = 1_700_000_000;
    const artifactSec = loopStartSec + 30; // iteration 1 wrote it; iteration 3 is judging now
    fs.utimesSync(artifact, new Date(artifactSec * 1000), new Date(artifactSec * 1000));

    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], loopStartSec);
    expect(verdict.tier1).toBe('pass');
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

  test('a directory is not an artifact — non-empty and fresh, but nothing to read', () => {
    // A directory satisfies every byte/mtime condition (statSync reports a non-zero size and
    // a current mtime) while containing no evidence a judge could read. Passing tier 1 here
    // is a vacuous pass: the deterministic gate, the one thing an agent cannot set, waves
    // through a claim whose "artifact" is the evidence directory itself.
    const dir = path.join(tmpDir, 'evidence-dir');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'inner.txt'), 'x');
    const mtimeSec = Math.floor(fs.statSync(dir).mtimeMs / 1000);
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact: dir }], mtimeSec - 3600);
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('not-a-file');
  });

  test('a symlink to a valid artifact still passes — statSync follows it to a real file', () => {
    const target = path.join(tmpDir, 'real.txt');
    fs.writeFileSync(target, 'evidence');
    const link = path.join(tmpDir, 'link.txt');
    fs.symlinkSync(target, link);
    const mtimeSec = Math.floor(fs.statSync(link).mtimeMs / 1000);
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact: link }], mtimeSec - 3600);
    expect(verdict.tier1).toBe('pass');
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

  test('previousGaps === [] never triggers stalled — no gap existed to close', () => {
    // Reachable from a resume: verify-functional.js seeds previousGaps by filtering the resume
    // snapshot for `not_met`, so a snapshot in which nothing was not_met (a prior run that
    // exited satisfied or unbuilt) yields [] rather than null. Treating that as a stall
    // reports "remediation is not converging" on an iteration where no remediation ran, and
    // exits before the Debug stage is ever dispatched.
    const result = decideNext({ iteration: 2, gaps: ['FS-1'], unbuilt: [], previousGaps: [], cap: 3 });
    expect(result.action).toBe('remediate');
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

  test('a criterion with an unrecognised status still appears, and is not counted as absent', () => {
    // renderReport()'s input file is written by the Judge agent by hand and is not validated
    // by JUDGE_SCHEMA (that schema covers the agent's RETURN value, not the report-input file
    // it writes in STEP 5). A single typo -- `not-met` for `not_met` -- made the criterion
    // vanish from every section while the header still counted it in the total, under an
    // Outcome line reading "Satisfied". The contract requires every criterion to appear.
    const withTypo = {
      ...baseInput,
      outcome: 'satisfied',
      criteria: [
        baseInput.criteria[0],
        { ...baseInput.criteria[1], status: 'not-met' },
      ],
    };
    const report = renderReport(withTypo);
    expect(report).toContain('FS-2');
    expect(report).toContain('not-met');
    expect(report).toMatch(/1 unrecognised status/);
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

  test('check-evidence rejects a zero or negative sinceSec rather than passing every artifact', () => {
    // Number('') === 0 and 0 is finite, so this slipped past the non-numeric guard. With
    // sinceSec 0 every mtime since 1970 is "strictly greater than" it, and the staleness rule
    // — the part of tier 1 that ties evidence to the code it claims to prove — passes an
    // artifact of any age. A year-2000 file returned tier1 "pass" and exit 0.
    const artifact = path.join(tmpDir, 'ancient.txt');
    fs.writeFileSync(artifact, 'x');
    fs.utimesSync(artifact, new Date(2000, 0, 1), new Date(2000, 0, 1));
    const claims = JSON.stringify([{ criterion: 'FS-1', artifact }]);
    for (const bad of ['0', '-1', '']) {
      expect(() => {
        execFileSync('node', [MODULE_PATH, 'check-evidence', claims, bad], { stdio: 'pipe' });
      }).toThrow();
    }
  });

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

// ---------------------------------------------------------------------------
// Regressions from the 2026-08-19 LIVE smoke run. Both were found independently
// by two separate reviews inside that run, which is what makes them solid — and
// neither was reachable from unit tests written against the happy path.
// ---------------------------------------------------------------------------

describe('decideNext: missing array fields are rejected, not defaulted', () => {
  const base = { gaps: [], unbuilt: [], previousGaps: null, iteration: 1, cap: 3 };

  test('an omitted `unbuilt` throws and names the field', () => {
    const { unbuilt, ...withoutUnbuilt } = base;
    expect(() => decideNext(withoutUnbuilt)).toThrow(/input\.unbuilt is required/);
  });

  test('an omitted `gaps` throws and names the field', () => {
    const { gaps, ...withoutGaps } = base;
    expect(() => decideNext(withoutGaps)).toThrow(/input\.gaps is required/);
  });

  test('the message says WHY defaulting would be worse', () => {
    // Defaulting `unbuilt` to [] reads as "nothing is unbuilt", so never-built
    // criteria fall through to remediate and reach the debugger — the one thing
    // D14 forbids. The next person to "simplify" this guard needs that in reach.
    const { unbuilt, ...withoutUnbuilt } = base;
    expect(() => decideNext(withoutUnbuilt)).toThrow(/D14/);
  });
});

describe('renderReport: a cell cannot break out of its row', () => {
  const render = (statement) =>
    renderReport({
      feature: 'f', prd: 'p', definitionPath: 'd',
      outcome: 'satisfied', iterations: 1, exercised: '1/1',
      criteria: [{ id: 'FS-1', statement, status: 'met', reason: '' }],
    }).split('\n').find((l) => l.startsWith('| FS-1 '));

  // Count only UNESCAPED pipes — a naive split('|') counts the escaped ones too,
  // which is how a first draft of this test "passed" while measuring nothing.
  const cellBreaks = (row) => row.replace(/\\\|/g, '').split('|').length;
  const PLAIN = cellBreaks(render('plain statement'));

  test('a backslash before a pipe does not shift the columns', () => {
    // The bug: `|` was escaped before `\`, so `\|` became `\\|` — a literal
    // backslash followed by an UNescaped cell break.
    expect(cellBreaks(render('a b\\|c'))).toBe(PLAIN);
  });

  test('a carriage return does not split the row', () => {
    const row = render('before\rafter');
    expect(row).toContain('before after');
    expect(cellBreaks(row)).toBe(PLAIN);
  });

  test('a CRLF collapses to one space, not two', () => {
    expect(render('before\r\nafter')).toContain('before after');
  });
});
