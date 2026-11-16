'use strict';

// cap-verification-runs-per-feature VRL-D002: pins the /verify-build prose that wires the
// per-feature verification run limit (docs/TRD/cap-verification-runs-per-feature.md D4, D7, D8,
// D10, D13). The command is a prompt, so the wording is the behaviour.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const CORE = path.join(REPO, 'packages/core/commands/verify-build.md');
const MIRROR = path.join(REPO, '.claude/commands/verify-build.md');

const raw = fs.readFileSync(CORE, 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

/** Text between two literal markers of the raw file (first occurrence of each). */
function between(start, end) {
  const a = raw.indexOf(start);
  const b = raw.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${start} .. ${end}`);
  return raw.slice(a, b);
}

const CLI = 'node .claude/lib/verification-runs.js';
const step1b = flat(between('### 1b. Check the run limit', '### 2. Preflight the environment'));
const step4 = flat(between('### 4. Dispatch', '### 5. Report'));
const step5 = flat(between('### 5. Report', '## Readout'));
const readout = flat(between('## Readout', '## `--chained`'));
const resumeAndFix = flat(between('## `--fix [plan-path]`', '## Output discipline'));
const fixStep3 = flat(between('3. **Round k ≥ 1 — build.**', '4. **Verify.**'));
const fixStep6 = flat(between('6. **Render and close.**', '## Output discipline'));
const artifactLink = flat(between('### Artifact link', '## Autonomous-execution discipline'));

describe('verify-build run limit (cap-verification-runs-per-feature)', () => {
  test('mirror is byte-identical', () => {
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(raw);
  });

  test('step 1b sits after 1a and before step 2, and calls check', () => {
    expect(raw.indexOf('### 1b. Check the run limit')).toBeGreaterThan(raw.indexOf('### 1a.'));
    expect(raw.indexOf('### 1b. Check the run limit')).toBeLessThan(raw.indexOf('### 2. Preflight'));
    expect(step1b).toContain(`${CLI} check --state-dir .trd-state/<feature>`);
    expect(step1b).toMatch(/targeted. or .full./);
  });

  test('the check call does not appear after step 2 begins', () => {
    const afterStep2 = flat(raw.slice(raw.indexOf('### 2. Preflight')));
    expect(afterStep2).not.toContain(`${CLI} check`);
  });

  test('scope none, a sweep file and --criteria are each stated as not counted', () => {
    expect(step1b).toMatch(/scope `none`[^.]*not counted/);
    expect(step1b).toMatch(/a sweep file[^.]*not counted/);
    expect(step1b).toMatch(/`--criteria`[^.]*not counted/);
  });

  test('the resume skip is worded as an interrupted run (`outcome: null`), and a finished --resume is counted', () => {
    expect(step1b).toContain('an interrupted run (`outcome: null`)');
    expect(step1b).toMatch(/"continuing": true/);
    expect(step1b).toMatch(/`--resume` of a state file that has an outcome[^.]*checked and counted like a plain run/);
  });

  test('a refusal carries the D8 reason, ensures the records first, requests, records and publishes', () => {
    expect(step1b).toContain('Reason: verification run limit reached (<n> of <limit> runs)');
    expect(step1b).toContain('COMMAND STUCK: /verify-build');
    expect(step1b).toContain('node .claude/lib/record-ref.js ensure --state-dir .trd-state/<feature>');
    expect(step1b).toContain(`${CLI} request --state-dir .trd-state/<feature> --command /verify-build`);
    expect(step1b).toContain('(kind `ruling-request`)');
    expect(step1b).toMatch(/Next: .*ruling-request\.md/);
    expect(step1b).toMatch(/exit code 2[^.]*ensemble\.verificationRunLimit/i);
  });

  test('the check happens once the scope is known, so a scope question can still come first', () => {
    expect(step1b).toMatch(/as soon as the scope is known/);
  });

  test('step 4 starts the run at the first dispatch only', () => {
    expect(step4).toContain(`${CLI} start --state-dir .trd-state/<feature> --command /verify-build --scope <full|targeted>`);
    expect(step4).toMatch(/first dispatch only/);
    expect(step4).toMatch(/Not at a fix round's step 4/);
    expect(step4).toMatch(/not at the `--criteria` retry/);
    expect(step4).toMatch(/copy the printed `runs` into `state\.functional_verification\.runs`/i);
  });

  test('finish runs after step 5 and after the fix loop, with the rulingDue handling', () => {
    expect(step5).toContain(`${CLI} finish --state-dir .trd-state/<feature> --outcome`);
    expect(step5).toMatch(/fix loop's step 6/);
    expect(step5).toMatch(/`rulingDue`/);
    expect(fixStep6).toContain(`${CLI} finish`);
  });

  test("fix-loop step 3's RETURN → STUCK path calls finish before the STUCK banner", () => {
    expect(fixStep3).toContain(`${CLI} finish`);
    expect(fixStep3.indexOf('finish')).toBeLessThan(fixStep3.indexOf('COMMAND STUCK'));
  });

  test('the readout NEXT rule has a rulingDue branch that replaces /refine-verification', () => {
    expect(readout).toMatch(/`rulingDue: true`/);
    expect(readout).toMatch(/ruling-request\.md/);
    expect(readout).toMatch(/replaces[^.]*`\/refine-verification`/);
    expect(fixStep6).toMatch(/`rulingDue`/);
  });

  test("the 'report's Next line says the same' sentence names the at-limit exception", () => {
    expect(readout).toMatch(/report's Next line says the same[^]*at the run limit[^]*`finish` rewrites/);
  });

  test("'Refine, run, repeat' names the limit", () => {
    expect(resumeAndFix).toMatch(/Refine, run, repeat[^.]*ends at the run limit/);
  });

  test('the Artifact link section publishes and records ruling-request', () => {
    expect(artifactLink).toMatch(/ruling-request/);
    expect(artifactLink).toContain('--kind ruling-request --path .trd-state/<feature>/ruling-request.md --command /verify-build');
    expect(artifactLink).toContain('artifacts.js get --state-dir .trd-state/<feature> --kind ruling-request');
  });
});
