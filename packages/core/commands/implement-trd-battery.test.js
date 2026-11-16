'use strict';

/** Text checks for issue #156: the phase-gate battery is not run twice and does not lose long runs. */
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, 'implement-trd.md'), 'utf8');
const flat = raw.replace(/\s+/g, ' ');
const start = raw.indexOf('**Run the deterministic phase-gate battery**');
const end = raw.indexOf('## Step 5');
const battery = raw.slice(start, end).replace(/\s+/g, ' ');
const gate = raw.slice(raw.indexOf('**`verifyPrompt`**'), raw.indexOf('**`reviewPrompt`')).replace(/\s+/g, ' ');

describe('implement-trd phase-gate battery (issue #156)', () => {
  test('the battery section is found', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  test('reuse: a suite that already ran on this tree is not run again, and the banner says so', () => {
    expect(battery).toMatch(/test-baseline\.js reuse/);
    expect(battery).toMatch(/not run again/i);
    expect(battery).toMatch(/same commit, no edit since/);
  });

  test('narrowing: integration and e2e run the related tests, full when shared code changed', () => {
    expect(battery).toMatch(/related/i);
    expect(battery).toContain('--findRelatedTests');
    expect(battery).toContain('vitest related');
    expect(battery).toMatch(/shared code changed/);
    expect(battery).toMatch(/rerun-scope choice above was `full`/);
  });

  test('long suites run with run_in_background, a timeout above their runtime, and Monitor', () => {
    expect(battery).toContain('run_in_background: true');
    expect(battery).toMatch(/timeout` above its runtime/);
    expect(battery).toContain('Monitor');
    expect(battery).toMatch(/last recorded duration/);
    expect(battery).toMatch(/integration or e2e/);
  });

  test('baseline: captured once per feature on the merge base in a worktree, in the run records', () => {
    expect(battery).toMatch(/baseline/i);
    expect(battery).toContain('git worktree add --detach');
    expect(battery).toContain('git merge-base');
    expect(battery).toContain('record-baseline');
    expect(battery).toMatch(/already failing on <base branch>/);
    expect(battery).toMatch(/records ref.*never in a commit of its own/);
  });

  test('a new failure still fails the gate; a baseline-only failure is not red', () => {
    expect(battery).toMatch(/Red means a new failure/);
    expect(battery).toMatch(/`newFailures`/);
    expect(battery).toMatch(/do not retry the phase for them/);
  });

  test('the verify-app gate prompt records its tree, receives the baseline and runs long suites in the background', () => {
    expect(gate).toContain('test-baseline.js record-run');
    expect(gate).toContain('<baseline');
    expect(gate).toContain('run_in_background');
    expect(gate).toMatch(/already failing on/);
  });

  test('the rerun-scope step no longer defers the double run to a later issue', () => {
    expect(flat).not.toMatch(/Making the battery itself stop running twice is issue #156/);
  });
});
