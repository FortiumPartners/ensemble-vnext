'use strict';
// Guards FIX-001's optional prompt append (docs/TRD/speed-sentence.md, AMEND-001):
// implement-one-task.sh builds its /implement-trd prompt from SMOKE_IMPL_ARGS.
// The test pulls the real PROMPT= line out of the script and evaluates just that
// line in bash, so it checks the shipped expression rather than a copy of it, and
// never starts claude or the scenario.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'scenarios', 'implement-one-task.sh');
const TRD_REL = 'docs/TRD/smoke-greet.md';

const promptLines = fs
  .readFileSync(SCRIPT, 'utf8')
  .split('\n')
  .filter((l) => /^PROMPT=/.test(l));

function promptFor(implArgs) {
  const env = { PATH: process.env.PATH };
  if (implArgs !== undefined) env.SMOKE_IMPL_ARGS = implArgs;
  // TRD_REL is set by the scenario earlier (FEATURE="smoke-greet"); recreate only that input.
  const r = spawnSync('bash', ['-c', `TRD_REL="${TRD_REL}"; ${promptLines[0]}; printf %s "$PROMPT"`], {
    encoding: 'utf8',
    env,
  });
  expect(r.status).toBe(0);
  return r.stdout;
}

describe('implement-one-task.sh prompt (SMOKE_IMPL_ARGS)', () => {
  it('has exactly one PROMPT= line to evaluate', () => {
    expect(promptLines).toHaveLength(1);
  });

  it('unset: the prompt is exactly the bare /implement-trd command', () => {
    expect(promptFor(undefined)).toBe('/implement-trd docs/TRD/smoke-greet.md');
  });

  it('empty string: behaves like unset (no trailing space)', () => {
    expect(promptFor('')).toBe('/implement-trd docs/TRD/smoke-greet.md');
  });

  it('set to --no-verify: the prompt ends with " --no-verify"', () => {
    const p = promptFor('--no-verify');
    expect(p).toBe('/implement-trd docs/TRD/smoke-greet.md --no-verify');
    expect(p.endsWith(' --no-verify')).toBe(true);
  });
});
