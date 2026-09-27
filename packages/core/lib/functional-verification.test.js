'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  checkEvidence,
  decideNext,
  renderReport,
  readStopRule,
  decideFixRound,
  renderFixSummary,
  isVerificationUnfilled,
  CAUSES,
  DEFAULT_CAP,
  COVERAGE_FLOOR,
  LOCATOR_SCAN_BYTES,
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

  // The --verify --resume composition (TRD §3.2, §3.7 step 2). That path skips the
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
    const [underHeadOnly] = checkEvidence(
      [{ criterion: 'FS-1', artifact, locator: 'evidence' }],
      headSec
    );
    expect(underHeadOnly.tier1).toBe('pass');

    // The floor as specified: max(HEAD commit time, loop start time).
    const sinceSec = Math.max(headSec, loopStartSec);
    expect(sinceSec).toBe(loopStartSec);
    const [underMaxFloor] = checkEvidence(
      [{ criterion: 'FS-1', artifact, locator: 'evidence' }],
      sinceSec
    );
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

    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact, locator: 'iteration 1' }],
      loopStartSec
    );
    expect(verdict.tier1).toBe('pass');
  });

  test('pass — exists, non-empty, strictly newer than sinceSec, locator found', () => {
    const artifact = path.join(tmpDir, 'fresh.txt');
    fs.writeFileSync(artifact, 'evidence');
    const stat = fs.statSync(artifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);
    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact, locator: 'evidence' }],
      mtimeSec - 3600
    );
    expect(verdict).toMatchObject({
      criterion: 'FS-1',
      tier1: 'pass',
      artifact,
      bytes: 8,
      locator: 'evidence',
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
    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact: dir, locator: 'x' }],
      mtimeSec - 3600
    );
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('not-a-file');
  });

  test('a symlink to a valid artifact still passes — statSync follows it to a real file', () => {
    const target = path.join(tmpDir, 'real.txt');
    fs.writeFileSync(target, 'evidence');
    const link = path.join(tmpDir, 'link.txt');
    fs.symlinkSync(target, link);
    const mtimeSec = Math.floor(fs.statSync(link).mtimeMs / 1000);
    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact: link, locator: 'evidence' }],
      mtimeSec - 3600
    );
    expect(verdict.tier1).toBe('pass');
  });

  test('maps multiple claims independently, preserving order', () => {
    const passArtifact = path.join(tmpDir, 'pass.txt');
    fs.writeFileSync(passArtifact, 'x');
    const stat = fs.statSync(passArtifact);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);

    const claims = [
      { criterion: 'FS-1', artifact: null },
      { criterion: 'FS-2', artifact: passArtifact, locator: 'x' },
      { criterion: 'FS-3', artifact: path.join(tmpDir, 'missing.txt') },
    ];
    const verdicts = checkEvidence(claims, mtimeSec - 10);
    expect(verdicts.map((v) => v.criterion)).toEqual(['FS-1', 'FS-2', 'FS-3']);
    expect(verdicts[0].failure).toBe('no-artifact');
    expect(verdicts[1].tier1).toBe('pass');
    expect(verdicts[2].failure).toBe('missing');
  });

  // ---------------------------------------------------------------------------
  // the locator check (D6, VCON-B001) — appended last, after the five existing failure modes
  // ---------------------------------------------------------------------------

  test('no-locator — artifact clears every existing check but no locator was supplied', () => {
    const artifact = path.join(tmpDir, 'no-locator.txt');
    fs.writeFileSync(artifact, 'some content');
    const mtimeSec = Math.floor(fs.statSync(artifact).mtimeMs / 1000);
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact }], mtimeSec - 3600);
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('no-locator');
  });

  test('no-locator — a whitespace-only locator counts as absent, not as a match', () => {
    const artifact = path.join(tmpDir, 'ws-locator.txt');
    fs.writeFileSync(artifact, 'some content');
    const mtimeSec = Math.floor(fs.statSync(artifact).mtimeMs / 1000);
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact, locator: ' ' }], mtimeSec - 3600);
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('no-locator');
  });

  test('locator-not-found — artifact exists and is fresh, but does not contain the locator', () => {
    const artifact = path.join(tmpDir, 'wrong-content.txt');
    fs.writeFileSync(artifact, 'some content');
    const mtimeSec = Math.floor(fs.statSync(artifact).mtimeMs / 1000);
    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact, locator: 'not present here' }],
      mtimeSec - 3600
    );
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('locator-not-found');
    expect(verdict.truncated).toBeFalsy();
  });

  test('locator-not-found carries truncated: true when the scan hits LOCATOR_SCAN_BYTES', () => {
    const artifact = path.join(tmpDir, 'huge.txt');
    // One byte past the cap, and the locator is placed in the very last byte -- past where
    // the scan stops -- so this proves both that the cap is honoured and that missing it
    // there (not merely being large) is what produces the failure.
    const body = Buffer.alloc(LOCATOR_SCAN_BYTES + 1, 'a');
    body.write('ZZZ', LOCATOR_SCAN_BYTES - 2);
    fs.writeFileSync(artifact, body);
    const mtimeSec = Math.floor(fs.statSync(artifact).mtimeMs / 1000);
    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact, locator: 'ZZZ' }],
      mtimeSec - 3600
    );
    expect(verdict.tier1).toBe('fail');
    expect(verdict.failure).toBe('locator-not-found');
    expect(verdict.truncated).toBe(true);
  });

  test('one artifact, two criteria, two different locators — one passes, one fails not-found', () => {
    const artifact = path.join(tmpDir, 'shared.txt');
    fs.writeFileSync(artifact, 'the quick brown fox');
    const mtimeSec = Math.floor(fs.statSync(artifact).mtimeMs / 1000);
    const claims = [
      { criterion: 'FS-1', artifact, locator: 'quick brown' },
      { criterion: 'FS-2', artifact, locator: 'slow red' },
    ];
    const [passVerdict, failVerdict] = checkEvidence(claims, mtimeSec - 3600);
    expect(passVerdict.tier1).toBe('pass');
    expect(failVerdict.tier1).toBe('fail');
    expect(failVerdict.failure).toBe('locator-not-found');
  });

  test('judgeOnly short-circuits to tier1: "skipped" with no failure, before any stat', () => {
    const [verdict] = checkEvidence(
      [{ criterion: 'FS-1', artifact: path.join(tmpDir, 'does-not-exist.txt'), judgeOnly: true }],
      0
    );
    expect(verdict.tier1).toBe('skipped');
    expect(verdict.failure).toBeUndefined();
  });

  test('judgeOnly with no artifact at all still skips rather than failing no-artifact', () => {
    const [verdict] = checkEvidence([{ criterion: 'FS-1', artifact: null, judgeOnly: true }], 0);
    expect(verdict).toEqual({
      criterion: 'FS-1',
      tier1: 'skipped',
      artifact: null,
      bytes: null,
      mtimeSec: null,
    });
  });

  test('LOCATOR_SCAN_BYTES is 2,000,000', () => {
    expect(LOCATOR_SCAN_BYTES).toBe(2_000_000);
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
      met: [],
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
      met: [],
    });
    expect(result.action).toBe('exit-unbuilt');
  });

  test('exit-satisfied when no gaps and nothing unbuilt', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: ['FS-1'],
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('exit-stalled when previousGaps is non-null and nothing closed', () => {
    const result = decideNext({
      iteration: 2,
      gaps: ['FS-1', 'FS-2'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      met: [],
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
      met: [],
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
    const result = decideNext({
      iteration: 2,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: [],
      met: [],
      cap: 3,
    });
    expect(result.action).toBe('remediate');
  });

  test('exit-stuck when iteration reaches the cap with gaps still open', () => {
    const result = decideNext({
      iteration: 3,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      met: [],
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
      met: [],
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
      met: [],
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
      met: [],
    });
    expect(remediateResult.action).toBe('remediate');

    const stuckResult = decideNext({
      iteration: 3,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      met: [],
    });
    expect(stuckResult.action).toBe('exit-stuck');
  });

  test('every result includes a non-empty reason string', () => {
    for (const input of [
      { iteration: 1, gaps: [], unbuilt: ['FS-1'], previousGaps: null, met: [] },
      { iteration: 1, gaps: [], unbuilt: [], previousGaps: null, met: [] },
      { iteration: 2, gaps: ['FS-1'], unbuilt: [], previousGaps: ['FS-1'], met: [] },
      { iteration: 3, gaps: ['FS-1'], unbuilt: [], previousGaps: [], met: [] },
      { iteration: 1, gaps: ['FS-1'], unbuilt: [], previousGaps: null, met: [] },
    ]) {
      const result = decideNext(input);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// decideNext — the coverage re-label (D8, D9, VCON-B002)
// ---------------------------------------------------------------------------

describe('decideNext: the coverage re-label', () => {
  test('an explicit floor re-labels exit-satisfied when the proven ratio is below it (OQ-7)', () => {
    // A zero-gap iteration that would otherwise be exit-satisfied -- the case OQ-7 asked about
    // by name: a run resolving mostly not_verifiable has no gaps and no unbuilt, so it reaches
    // the satisfied branch at near-zero coverage.
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: ['FS-1'],
      total: 10,
      coverageFloor: 0.5,
    });
    expect(result.action).toBe('exit-insufficient-coverage');
    expect(result.reason).toMatch(/1\/10/);
    expect(result.reason).toMatch(/0\.5/);
  });

  test('an explicit floor re-labels exit-stalled', () => {
    const result = decideNext({
      iteration: 2,
      gaps: ['FS-1', 'FS-2'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      met: ['FS-3'],
      total: 10,
      coverageFloor: 0.9,
    });
    expect(result.action).toBe('exit-insufficient-coverage');
  });

  test('an explicit floor re-labels exit-stuck', () => {
    const result = decideNext({
      iteration: 3,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: ['FS-1', 'FS-2'],
      met: ['FS-3'],
      total: 10,
      coverageFloor: 0.9,
      cap: 3,
    });
    expect(result.action).toBe('exit-insufficient-coverage');
  });

  test('a remediate action is never re-labelled, at any floor', () => {
    const result = decideNext({
      iteration: 1,
      gaps: ['FS-1'],
      unbuilt: [],
      previousGaps: null,
      met: [],
      total: 10,
      coverageFloor: 1, // the highest possible floor -- if anything could force a re-label, this would
    });
    expect(result.action).toBe('remediate');
  });

  test('exit-unbuilt is never re-labelled, at any floor', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: ['FS-1'],
      previousGaps: null,
      met: [],
      total: 10,
      coverageFloor: 1,
    });
    expect(result.action).toBe('exit-unbuilt');
  });

  test('with coverageFloor null (COVERAGE_FLOOR, the shipped default) exit-satisfied is unaffected even at near-zero coverage', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: ['FS-1'],
      total: 62, // the PRD's own 18% (11 of 62) shape, exaggerated further to 1/62
      // coverageFloor omitted -- defaults to COVERAGE_FLOOR (null)
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('coverageFloor: null passed explicitly behaves the same as omitting it', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: [],
      total: 10,
      coverageFloor: null,
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('a met ratio at or above the floor is not re-labelled', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: ['FS-1', 'FS-2', 'FS-3', 'FS-4', 'FS-5'],
      total: 10,
      coverageFloor: 0.5, // 5/10 === 0.5, not strictly below it
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('a missing (undefined) total skips the re-label rather than dividing by it', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: [],
      coverageFloor: 0.5,
      // total omitted
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('a zero total skips the re-label', () => {
    const result = decideNext({
      iteration: 1,
      gaps: [],
      unbuilt: [],
      previousGaps: null,
      met: [],
      total: 0,
      coverageFloor: 0.5,
    });
    expect(result.action).toBe('exit-satisfied');
  });

  test('COVERAGE_FLOOR is exported as an explicitly-unset (null) named constant', () => {
    expect(COVERAGE_FLOOR).toBeNull();
  });

  test('a missing met throws rather than defaulting', () => {
    expect(() =>
      decideNext({ iteration: 1, gaps: [], unbuilt: [], previousGaps: null, total: 10 })
    ).toThrow(/input\.met is required/);
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

  test('a satisfied outcome with not_verifiable criteria states the unverified count on the Outcome line', () => {
    // decideNext's "satisfied" means "no gaps" -- a not_verifiable criterion does not block it
    // (§3.4). Left unqualified, "Satisfied" alone reads as full coverage even when some
    // criteria were never exercised. Regression for the issue where a run reported satisfied
    // with several criteria still not_verifiable and nothing on the headline said so.
    const satisfiedWithGaps = {
      ...baseInput,
      outcome: 'satisfied',
      criteria: [
        baseInput.criteria[0], // met
        baseInput.criteria[2], // not_verifiable
      ],
    };
    const report = renderReport(satisfiedWithGaps);
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toContain('Satisfied');
    expect(outcomeLine).toContain('1 of 2 not verifiable');
  });

  test('a satisfied outcome with no not_verifiable criteria leaves the Outcome line unqualified', () => {
    const cleanSatisfied = {
      ...baseInput,
      outcome: 'satisfied',
      criteria: [baseInput.criteria[0]], // met only
    };
    const report = renderReport(cleanSatisfied);
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toBe('**Outcome**: Satisfied');
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

  // -------------------------------------------------------------------------
  // The coverage line, the Tier 1 / Proven at columns, the insufficient-coverage
  // label and the optional finalEnvironmentRun (D8, D9, D14, VCON-B002)
  // -------------------------------------------------------------------------

  test('the Coverage line names the proven ratio and the uncovered membership', () => {
    const report = renderReport(baseInput);
    const coverageLine = report.split('\n').find((l) => l.startsWith('**Coverage**'));
    // baseInput: FS-1 met, FS-2/FS-3/FS-4 not met/not_verifiable/unbuilt -- 1 of 4 proven.
    expect(coverageLine).toContain('1 of 4 proven');
    expect(coverageLine).toContain('FS-2');
    expect(coverageLine).toContain('FS-3');
    expect(coverageLine).toContain('FS-4');
    expect(coverageLine).not.toContain('FS-1');
  });

  test('the Coverage line says "none" when every criterion is proven', () => {
    const allMet = { ...baseInput, criteria: [baseInput.criteria[0]] };
    const report = renderReport(allMet);
    const coverageLine = report.split('\n').find((l) => l.startsWith('**Coverage**'));
    expect(coverageLine).toContain('1 of 1 proven');
    expect(coverageLine).toContain('uncovered: none');
  });

  test('OUTCOME_LABEL renders insufficient-coverage as a readable label', () => {
    const report = renderReport({ ...baseInput, outcome: 'insufficient-coverage' });
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toContain('Insufficient Coverage');
  });

  test('the Not Met table gains a Tier 1 column sourced from the criterion', () => {
    const withTier1 = {
      ...baseInput,
      criteria: [
        baseInput.criteria[0],
        { ...baseInput.criteria[1], tier1: 'fail' },
      ],
    };
    const report = renderReport(withTier1);
    expect(report).toContain('| Tier 1 |');
    const notMetSection = report.split('## Not Met')[1].split('## Not Verifiable')[0];
    expect(notMetSection).toContain('fail');
  });

  test('a Not Met criterion missing tier1 renders a blank cell, not a fabricated value', () => {
    const report = renderReport(baseInput); // baseInput's FS-2 (not_met) carries no tier1
    const notMetRow = report.split('\n').find((l) => l.startsWith('| FS-2 '));
    // Tier 1 is the 3rd column: | ID | Statement | Tier 1 | Reason | Blocker | Attempts |
    expect(notMetRow.split('|')[3].trim()).toBe('');
  });

  test('the Met table gains a Proven at column sourced from the criterion', () => {
    const withProvenAt = {
      ...baseInput,
      criteria: [{ ...baseInput.criteria[0], provenAt: 2 }],
    };
    const report = renderReport(withProvenAt);
    expect(report).toContain('| Proven at |');
    const metSection = report.split('## Met')[1].split('## Not Met')[0];
    expect(metSection).toContain('| 2 |');
  });

  test('a Met criterion missing provenAt renders a blank cell, not "0"', () => {
    const report = renderReport(baseInput); // baseInput's FS-1 (met) carries no provenAt
    const metRow = report.split('\n').find((l) => l.startsWith('| FS-1 '));
    // Proven at is the 4th column: | ID | Statement | Artifact | Proven at |
    expect(metRow.split('|')[4].trim()).toBe('');
  });

  test('finalEnvironmentRun.status "fail" carries the failure on the Outcome line even when satisfied', () => {
    const report = renderReport({
      ...baseInput,
      outcome: 'satisfied',
      criteria: [baseInput.criteria[0]],
      finalEnvironmentRun: { command: 'npm run deploy:check', status: 'fail' },
    });
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toContain('Satisfied');
    expect(outcomeLine).toMatch(/final full-environment run FAILED/i);
  });

  test('finalEnvironmentRun {command: "", status: "skipped"} says no full-environment run was declared', () => {
    const report = renderReport({
      ...baseInput,
      outcome: 'satisfied',
      criteria: [baseInput.criteria[0]],
      finalEnvironmentRun: { command: '', status: 'skipped' },
    });
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toMatch(/no full-environment run declared/i);
  });

  test('finalEnvironmentRun.status "pass" adds nothing to the Outcome line', () => {
    const report = renderReport({
      ...baseInput,
      outcome: 'satisfied',
      criteria: [baseInput.criteria[0]],
      finalEnvironmentRun: { command: 'npm run deploy:check', status: 'pass' },
    });
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toBe('**Outcome**: Satisfied');
  });

  test('an absent finalEnvironmentRun leaves the Outcome line exactly as before', () => {
    const report = renderReport({
      ...baseInput,
      outcome: 'satisfied',
      criteria: [baseInput.criteria[0]],
    });
    const outcomeLine = report.split('\n').find((l) => l.startsWith('**Outcome**'));
    expect(outcomeLine).toBe('**Outcome**: Satisfied');
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
    const claims = JSON.stringify([{ criterion: 'FS-1', artifact, locator: 'proof' }]);

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
      met: [],
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
      JSON.stringify([
        { criterion: 'FS-1', artifact, locator: 'proof', reason: "couldn't start the server" },
      ])
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
    const claims = JSON.stringify([
      { criterion: 'FS-1', artifact, locator: 'proof', reason: "couldn't start it" },
    ]);

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
      JSON.stringify({ iteration: 1, gaps: [], unbuilt: [], previousGaps: null, met: [] })
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
// isVerificationUnfilled — preflight for /implement-trd §3.6a and /verify-build §2
// ---------------------------------------------------------------------------

describe('isVerificationUnfilled', () => {
  test('identical content is unfilled, and matches the current template', () => {
    const content = '# Verification environments\n\n| Name | URL |\n';
    expect(isVerificationUnfilled(content, content)).toEqual({
      unfilled: true,
      matchedTemplate: 'current',
    });
  });

  test('differs only by trailing whitespace/newline is still unfilled', () => {
    const template = '# Verification environments\n\nsome text\n';
    const project = '# Verification environments\n\nsome text\n\n\n';
    expect(isVerificationUnfilled(project, template)).toEqual({
      unfilled: true,
      matchedTemplate: 'current',
    });
  });

  test('differs only by CRLF vs LF is still unfilled', () => {
    const template = '# Verification environments\n\nsome text\n';
    const project = '# Verification environments\r\n\r\nsome text\r\n';
    expect(isVerificationUnfilled(project, template)).toEqual({
      unfilled: true,
      matchedTemplate: 'current',
    });
  });

  test('a filled-in project file is not flagged', () => {
    const template = '# Verification environments\n\n| Name | URL |\n|---|---|\n';
    const project =
      '# Verification environments\n\n| Name | URL |\n|---|---|\n| local | http://localhost:3000 |\n';
    expect(isVerificationUnfilled(project, template)).toEqual({
      unfilled: false,
      matchedTemplate: null,
    });
  });

  // -------------------------------------------------------------------------
  // KNOWN_UNFILLED_DIGESTS (D13, VCON-B008) — a project whose verification.md still matches
  // a PRIOR shipped template must still be reported unfilled, and the response must say
  // WHICH one matched, once the live template moves on past it.
  // -------------------------------------------------------------------------

  test('a project file matching the pre-resource-table template is still reported unfilled, naming that template', () => {
    const priorTemplate = fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'verification.pre-1.5.0.md'),
      'utf8'
    );
    const currentTemplate = fs.readFileSync(
      path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'verification.md'),
      'utf8'
    );

    // The project's copy is byte-identical to the OLD template, not the current one -- the
    // exact shape every project scaffolded before this change is in.
    expect(isVerificationUnfilled(priorTemplate, currentTemplate)).toEqual({
      unfilled: true,
      matchedTemplate: 'pre-resource-table',
    });
  });

  test('a project file matching the first resource-table template is still reported unfilled, naming it', () => {
    const priorTemplate = fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'verification.resource-table-v1.md'),
      'utf8'
    );
    const currentTemplate = fs.readFileSync(
      path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'verification.md'),
      'utf8'
    );

    // Shipped live from 005c389 until §1a gained the instance-naming rule; a project
    // scaffolded in that window holds exactly this copy.
    expect(isVerificationUnfilled(priorTemplate, currentTemplate)).toEqual({
      unfilled: true,
      matchedTemplate: 'resource-table-v1',
    });
  });

  test('a project file matching the pre-resource-table template, re-saved with CRLF, is still recognised', () => {
    const priorTemplate = fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'verification.pre-1.5.0.md'),
      'utf8'
    );
    const currentTemplate = fs.readFileSync(
      path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'verification.md'),
      'utf8'
    );
    const crlfProject = priorTemplate.replace(/\n/g, '\r\n');

    expect(isVerificationUnfilled(crlfProject, currentTemplate)).toEqual({
      unfilled: true,
      matchedTemplate: 'pre-resource-table',
    });
  });

  test('a project file that has since been filled in does not match the prior-template digest either', () => {
    const priorTemplate = fs.readFileSync(
      path.join(__dirname, '__fixtures__', 'verification.pre-1.5.0.md'),
      'utf8'
    );
    const currentTemplate = fs.readFileSync(
      path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'verification.md'),
      'utf8'
    );
    const filledIn = `${priorTemplate}\n| local | http://localhost:4000 |\n`;

    expect(isVerificationUnfilled(filledIn, currentTemplate)).toEqual({
      unfilled: false,
      matchedTemplate: null,
    });
  });

  describe('CLI', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-unfilled-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('reports unfilled: true when the project file matches the template', () => {
      const templatePath = path.join(tmpDir, 'template.md');
      const projectPath = path.join(tmpDir, 'project.md');
      fs.writeFileSync(templatePath, '# Verification environments\n');
      fs.writeFileSync(projectPath, '# Verification environments\n');

      const stdout = execFileSync('node', [
        MODULE_PATH,
        'check-verification-unfilled',
        projectPath,
        templatePath,
      ]).toString();
      expect(JSON.parse(stdout)).toEqual({ unfilled: true, matchedTemplate: 'current' });
    });

    test('reports unfilled: false when the project file has been edited', () => {
      const templatePath = path.join(tmpDir, 'template.md');
      const projectPath = path.join(tmpDir, 'project.md');
      fs.writeFileSync(templatePath, '# Verification environments\n');
      fs.writeFileSync(projectPath, '# Verification environments\n\n| local | http://x |\n');

      const stdout = execFileSync('node', [
        MODULE_PATH,
        'check-verification-unfilled',
        projectPath,
        templatePath,
      ]).toString();
      expect(JSON.parse(stdout)).toEqual({ unfilled: false, matchedTemplate: null });
    });

    test('reports a project file matching the pre-resource-table template as unfilled, naming it', () => {
      const priorTemplate = fs.readFileSync(
        path.join(__dirname, '__fixtures__', 'verification.pre-1.5.0.md'),
        'utf8'
      );
      const currentTemplate = fs.readFileSync(
        path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'verification.md'),
        'utf8'
      );
      const templatePath = path.join(tmpDir, 'template.md');
      const projectPath = path.join(tmpDir, 'project.md');
      fs.writeFileSync(templatePath, currentTemplate);
      fs.writeFileSync(projectPath, priorTemplate);

      const stdout = execFileSync('node', [
        MODULE_PATH,
        'check-verification-unfilled',
        projectPath,
        templatePath,
      ]).toString();
      expect(JSON.parse(stdout)).toEqual({ unfilled: true, matchedTemplate: 'pre-resource-table' });
    });

    test('reports a missing project file distinctly, not as either verdict', () => {
      const templatePath = path.join(tmpDir, 'template.md');
      const projectPath = path.join(tmpDir, 'does-not-exist.md');
      fs.writeFileSync(templatePath, '# Verification environments\n');

      const stdout = execFileSync('node', [
        MODULE_PATH,
        'check-verification-unfilled',
        projectPath,
        templatePath,
      ]).toString();
      expect(JSON.parse(stdout)).toEqual({ unfilled: null, reason: 'missing', path: projectPath });
    });

    test('missing arguments print usage and exit non-zero', () => {
      expect(() => {
        execFileSync('node', [MODULE_PATH, 'check-verification-unfilled'], { stdio: 'pipe' });
      }).toThrow();
    });
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

// ---------------------------------------------------------------------------
// The shipped verification.md template carries what the loop reads from it (O5, VCON-B008).
// §3.6a resolves lanes, permissions and refresh/full-run commands from these sections by
// NAME; a template edit that drops one would leave every project resolving to the serial,
// nothing-declared defaults with no error anywhere.
// ---------------------------------------------------------------------------

describe('shipped verification.md template content', () => {
  const template = fs.readFileSync(
    path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'verification.md'),
    'utf8'
  );

  test('carries the §1a resource-capacity table and its three count rules', () => {
    expect(template).toMatch(/^## 1a\. Resource capacity — how many may exist at once$/m);
    expect(template).toMatch(/\| Resource \| How many may exist at once \| Which environments need it \| How the loop creates and destroys one \|/);
    expect(template).toMatch(/\*\*`N`\*\* — a \*\*pool\*\*/);
    expect(template).toMatch(/\*\*`1`\*\* — a \*\*queue\*\*/);
    expect(template).toMatch(/\*\*`0`\*\* — \*\*must not be touched\.\*\*/);
  });

  test('states the two safety defaults as rules: no row counts as 1, a blank create cell withholds creation', () => {
    expect(template).toMatch(/An environment with no row in this table counts as one resource of its own, with a count\s+of `1`\./);
    expect(template).toMatch(/A blank create\/destroy cell means the loop may not create one, whatever the count says\./);
  });

  test('leaves telling existing instances apart to the project', () => {
    expect(template).toMatch(/When N already exist, say how parallel checks tell them apart\./);
  });

  test('declares data permission per environment, including the preview row', () => {
    expect(template).toMatch(/Loop may WRITE data\?/);
    expect(template).toMatch(/must not be touched/);
    expect(template).toMatch(/^\| preview \|/m);
  });

  test('splits a fast per-iteration refresh from an end-of-run full deploy', () => {
    expect(template).toMatch(/\| Fast refresh \(per iteration\) \| Full deploy \(end of run\) \|/);
  });
});

// ---------------------------------------------------------------------------
// VFIX-B001: CAUSES, the Diagnosis/Next lines, readStopRule, decideFixRound,
// renderFixSummary (docs/TRD/verification-fix-loop.md §3.1, §3.5, D10)
// ---------------------------------------------------------------------------

describe('CAUSES', () => {
  test('is the fixed §3.1 vocabulary, exported for JUDGE_CRITERION_SCHEMA to match exactly', () => {
    expect(CAUSES).toEqual([
      'evidence-missing',
      'evidence-stale',
      'locator-not-found',
      'never-exercised',
      'judged-failed',
      'not-built',
      'environment-unreachable',
      'capability-absent',
    ]);
  });
});

describe('renderReport: Diagnosis and Next lines', () => {
  const criterionWithCause = (id, status, cause) => ({
    id,
    statement: `statement for ${id}`,
    cites: 'FR-1',
    status,
    artifact: null,
    reason: 'because',
    attempts: [],
    blocker: null,
    cause,
  });

  const baseFor = (outcome, criteria) => ({
    feature: 'demo',
    prd: 'docs/PRD/demo.md',
    definitionPath: '.trd-state/demo/success-definition.md',
    outcome,
    reason: 'iteration closed no gaps',
    criteria,
  });

  test('appears under Coverage for stalled, stuck, unbuilt and insufficient-coverage', () => {
    for (const outcome of ['stalled', 'stuck', 'unbuilt', 'insufficient-coverage']) {
      const report = renderReport(
        baseFor(outcome, [criterionWithCause('FS-1', 'not_met', 'evidence-missing')])
      );
      expect(report).toMatch(/\*\*Diagnosis\*\*: /);
      expect(report).toContain(
        '**Next**: agree a recovery plan with `/verify-plan-recovery`, then run `/verify-build --fix`'
      );
      // Diagnosis must render after Coverage, not before.
      expect(report.indexOf('**Coverage**')).toBeLessThan(report.indexOf('**Diagnosis**'));
    }
  });

  test('does not appear for satisfied or not-run', () => {
    for (const outcome of ['satisfied', 'not-run']) {
      const report = renderReport(baseFor(outcome, [criterionWithCause('FS-1', 'met', null)]));
      expect(report).not.toContain('**Diagnosis**');
      expect(report).not.toContain('/verify-plan-recovery');
    }
  });

  test('counts by cause in descending order', () => {
    const report = renderReport(
      baseFor('stalled', [
        criterionWithCause('FS-1', 'not_met', 'evidence-missing'),
        criterionWithCause('FS-2', 'not_met', 'evidence-missing'),
        criterionWithCause('FS-3', 'not_verifiable', 'environment-unreachable'),
        criterionWithCause('FS-4', 'not_met', 'environment-unreachable'),
        criterionWithCause('FS-5', 'not_met', 'environment-unreachable'),
        criterionWithCause('FS-6', 'not_met', 'environment-unreachable'),
        criterionWithCause('FS-7', 'met', null),
      ])
    );
    const diagnosisLine = report.split('\n').find((l) => l.startsWith('**Diagnosis**'));
    expect(diagnosisLine).toBe(
      '**Diagnosis**: 6 open — 4 environment not reachable, 2 evidence missing'
    );
  });

  test('renders causes in words, not slugs', () => {
    const report = renderReport(
      baseFor('unbuilt', [criterionWithCause('FS-1', 'unbuilt', 'not-built')])
    );
    expect(report).toContain('not built');
    expect(report).not.toContain('not-built');
  });

  test('counts a cause-less row as unrecorded', () => {
    const report = renderReport(
      baseFor('stuck', [criterionWithCause('FS-1', 'not_met', undefined)])
    );
    const diagnosisLine = report.split('\n').find((l) => l.startsWith('**Diagnosis**'));
    expect(diagnosisLine).toBe('**Diagnosis**: 1 open — 1 unrecorded');
  });

  test('never counts a met criterion into Diagnosis', () => {
    const report = renderReport(
      baseFor('stalled', [
        criterionWithCause('FS-1', 'met', null),
        criterionWithCause('FS-2', 'not_met', 'judged-failed'),
      ])
    );
    const diagnosisLine = report.split('\n').find((l) => l.startsWith('**Diagnosis**'));
    expect(diagnosisLine).toBe('**Diagnosis**: 1 open — 1 judged failed');
  });
});

describe('readStopRule', () => {
  const plan = (stopRuleBody) => `# Verification plan: demo

**Written**: 2026-09-27T00:00:00Z by verify-plan-recovery
**From run**: stalled at 2/6, report \`.trd-state/demo/verification-report.md\`

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| B1 | fix the thing | \`src/x.js\` | — | SC-3 |

## Stop rule
${stopRuleBody}
`;

  test('reads max-rounds and stop-when-closed-below', () => {
    const result = readStopRule(plan('max-rounds: 5\nstop-when-closed-below: 2\nalways: stop when nothing is left to build'));
    expect(result).toEqual({ maxRounds: 5, closedBelow: 2, errors: [] });
  });

  test('stop-when-closed-below: none reads as null, with no error', () => {
    const result = readStopRule(plan('max-rounds: 3\nstop-when-closed-below: none\nalways: stop when nothing is left to build'));
    expect(result.closedBelow).toBeNull();
    expect(result.errors).toEqual([]);
  });

  test('a missing max-rounds is an error', () => {
    const result = readStopRule(plan('stop-when-closed-below: none\nalways: stop when nothing is left to build'));
    expect(result.maxRounds).toBeNull();
    expect(result.errors.some((e) => /max-rounds/.test(e))).toBe(true);
  });

  test('a non-positive max-rounds is an error', () => {
    for (const bad of ['0', '-1', 'not-a-number']) {
      const result = readStopRule(plan(`max-rounds: ${bad}\nstop-when-closed-below: none\nalways: stop when nothing is left to build`));
      expect(result.maxRounds).toBeNull();
      expect(result.errors.some((e) => /max-rounds/.test(e))).toBe(true);
    }
  });

  test('no "## Stop rule" section at all is an error, not a thrown exception', () => {
    const result = readStopRule('# Verification plan: demo\n\n## Blockers\nnone\n');
    expect(result.maxRounds).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('reads the LAST "## Stop rule" section, and ignores one inside a fenced block', () => {
    const text = `# Verification plan: demo

Some prose mentioning \`## Stop rule\` inline, followed by a fenced example:

\`\`\`markdown
## Stop rule
max-rounds: 999
\`\`\`

## Stop rule
max-rounds: 4
stop-when-closed-below: none
always: stop when nothing is left to build
`;
    const result = readStopRule(text);
    expect(result.maxRounds).toBe(4);
    expect(result.errors).toEqual([]);
  });
});

describe('decideFixRound', () => {
  const base = { round: 1, maxRounds: 5, closedBelow: null, closedThisRound: 2, buildableOpen: 3 };

  test('continues when buildable work remains, under the round cap, and above the closed-below floor', () => {
    expect(decideFixRound(base)).toMatchObject({ action: 'continue' });
  });

  test('stops when nothing buildable is left, even mid-cap', () => {
    const result = decideFixRound({ ...base, buildableOpen: 0 });
    expect(result).toMatchObject({ action: 'stop', reason: 'nothing left to build' });
  });

  test('stops when the round has reached max-rounds', () => {
    const result = decideFixRound({ ...base, round: 5, maxRounds: 5 });
    expect(result.action).toBe('stop');
    expect(result.reason).toMatch(/max-rounds/);
  });

  test('stops when fewer criteria closed this round than stop-when-closed-below', () => {
    const result = decideFixRound({ ...base, closedBelow: 3, closedThisRound: 1 });
    expect(result.action).toBe('stop');
    expect(result.reason).toMatch(/closed-below|closed 1/);
  });

  test('the closed-below floor never fires when closedBelow is null (no such rule)', () => {
    const result = decideFixRound({ ...base, closedBelow: null, closedThisRound: 0 });
    expect(result.action).toBe('continue');
  });

  test('evaluation order: nothing-buildable wins even when the round is also past max-rounds', () => {
    const result = decideFixRound({ ...base, buildableOpen: 0, round: 5, maxRounds: 5 });
    expect(result.reason).toBe('nothing left to build');
  });

  test('throws on a missing field, as decideNext does', () => {
    const { buildableOpen, ...withoutBuildableOpen } = base;
    expect(() => decideFixRound(withoutBuildableOpen)).toThrow(/buildableOpen/);

    const { round, ...withoutRound } = base;
    expect(() => decideFixRound(withoutRound)).toThrow(/round/);

    const { maxRounds, ...withoutMaxRounds } = base;
    expect(() => decideFixRound(withoutMaxRounds)).toThrow(/maxRounds/);

    const { closedThisRound, ...withoutClosedThisRound } = base;
    expect(() => decideFixRound(withoutClosedThisRound)).toThrow(/closedThisRound/);

    const { closedBelow, ...withoutClosedBelow } = base;
    expect(() => decideFixRound(withoutClosedBelow)).toThrow(/closedBelow/);
  });

  test('an explicit closedBelow: null is accepted, distinct from a missing key', () => {
    expect(() => decideFixRound({ ...base, closedBelow: null })).not.toThrow();
  });
});

describe('renderFixSummary', () => {
  test('renders one row per round: tasks promoted, criteria closed, still open', () => {
    const md = renderFixSummary({
      rounds: [
        { round: 1, tasksPromoted: 2, criteriaClosed: 3, criteriaOpen: 5 },
        { round: 2, tasksPromoted: 1, criteriaClosed: 1, criteriaOpen: 4 },
      ],
      criteria: [],
    });
    expect(md).toContain('## Fix run');
    expect(md).toMatch(/\| Round \| Tasks promoted \| Criteria closed \| Still open \|/);
    expect(md).toContain('| 1 | 2 | 3 | 5 |');
    expect(md).toContain('| 2 | 1 | 1 | 4 |');
  });

  test('lists every non-met criterion with status, cause and stop reason', () => {
    const md = renderFixSummary({
      rounds: [{ round: 1, tasksPromoted: 1, criteriaClosed: 1, criteriaOpen: 2 }],
      criteria: [
        {
          id: 'FS-2',
          statement: 'a repeated submit does not create two orders',
          status: 'not_met',
          cause: 'evidence-missing',
          stopReason: 'not buildable by cause',
        },
        {
          id: 'FS-3',
          statement: 'mobile push notifications are delivered within 5s',
          status: 'not_verifiable',
          cause: 'environment-unreachable',
          stopReason: 'not verifiable here',
        },
      ],
    });
    expect(md).toContain('FS-2');
    expect(md).toContain('not_met');
    expect(md).toContain('evidence missing');
    expect(md).toContain('not buildable by cause');
    expect(md).toContain('FS-3');
    expect(md).toContain('environment not reachable');
    expect(md).toContain('not verifiable here');
  });

  test('a cause-less criterion renders unrecorded, never guessed', () => {
    const md = renderFixSummary({
      rounds: [],
      criteria: [
        {
          id: 'FS-9',
          statement: 'x',
          status: 'not_met',
          cause: null,
          stopReason: 'stop rule reached',
        },
      ],
    });
    expect(md).toContain('unrecorded');
  });

  test('empty rounds and criteria render without a broken table', () => {
    const md = renderFixSummary({ rounds: [], criteria: [] });
    expect(md).toContain('## Fix run');
    expect(md).toContain('_No rounds ran._');
    expect(md).toContain('_None still open._');
  });

  test('throws when rounds or criteria are missing', () => {
    expect(() => renderFixSummary({ criteria: [] })).toThrow(/rounds/);
    expect(() => renderFixSummary({ rounds: [] })).toThrow(/criteria/);
  });
});

describe('CLI: decide-fix-round and render-fix-summary', () => {
  test('decide-fix-round subcommand: JSON in, JSON object out', () => {
    const input = JSON.stringify({
      round: 1,
      maxRounds: 5,
      closedBelow: null,
      closedThisRound: 2,
      buildableOpen: 3,
    });
    const stdout = execFileSync('node', [MODULE_PATH, 'decide-fix-round', input]).toString();
    const parsed = JSON.parse(stdout);
    expect(parsed.action).toBe('continue');
  });

  test('render-fix-summary subcommand: JSON in, markdown out (not JSON)', () => {
    const input = JSON.stringify({
      rounds: [{ round: 1, tasksPromoted: 1, criteriaClosed: 1, criteriaOpen: 0 }],
      criteria: [],
    });
    const stdout = execFileSync('node', [MODULE_PATH, 'render-fix-summary', input]).toString();
    expect(stdout).toContain('## Fix run');
    expect(() => JSON.parse(stdout)).toThrow();
  });
});

describe('the existing functional-verification.test.js cases still pass', () => {
  test('sanity: decideNext and renderReport basics are untouched by the VFIX-B001 changes', () => {
    expect(
      decideNext({ iteration: 1, gaps: [], unbuilt: [], previousGaps: null, met: [] })
    ).toMatchObject({ action: 'exit-satisfied' });
    expect(renderReport({
      feature: 'demo',
      prd: 'docs/PRD/demo.md',
      definitionPath: '.trd-state/demo/success-definition.md',
      outcome: 'satisfied',
      reason: 'all criteria met',
      criteria: [],
    })).toContain('# Functional Verification Report: demo');
  });
});

