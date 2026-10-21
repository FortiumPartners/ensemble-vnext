'use strict';
// Guards FIX-001's optional prompt append (docs/TRD/speed-sentence.md, AMEND-001):
// implement-one-task.sh builds its /implement-trd prompt from SMOKE_IMPL_ARGS.
// The test pulls the real FEATURE=, TRD_REL= and PROMPT= lines out of the script and
// evaluates just those in bash under the script's own set -uo pipefail, so it checks the
// shipped expression rather than a copy of it, and never starts claude or the scenario.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'scenarios', 'implement-one-task.sh');

const scriptLines = fs.readFileSync(SCRIPT, 'utf8').split('\n');
const linesMatching = (re) => scriptLines.filter((l) => re.test(l));
const promptLines = linesMatching(/^PROMPT=/);
// The prompt's inputs come from the script too, so a renamed FEATURE or TRD path shows up here.
const inputLines = [...linesMatching(/^FEATURE=/), ...linesMatching(/^TRD_REL=/)];

function promptFor(implArgs) {
  if (promptLines.length !== 1) throw new Error(`expected one PROMPT= line in ${SCRIPT}, found ${promptLines.length}`);
  const env = { PATH: process.env.PATH };
  if (implArgs !== undefined) env.SMOKE_IMPL_ARGS = implArgs;
  // Same shell options as the scenario, so an expansion that trips nounset fails here too.
  const body = ['set -uo pipefail', ...inputLines, promptLines[0], 'printf %s "$PROMPT"'].join('\n');
  const r = spawnSync('bash', ['-c', body], { encoding: 'utf8', env });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  return r.stdout;
}

describe('implement-one-task.sh prompt (SMOKE_IMPL_ARGS)', () => {
  it('has exactly one PROMPT= line, and one FEATURE= and TRD_REL= line feeding it', () => {
    expect(promptLines).toHaveLength(1);
    expect(inputLines).toHaveLength(2);
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
