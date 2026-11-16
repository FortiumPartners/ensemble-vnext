'use strict';

// Pins the per-feature run-limit check in refine-verification.md (cap-verification-runs-per-feature
// D7, D8, D9, D10): the check sits in Inputs after `record-ref.js ensure` and before Derive, covers
// both modes, and at the limit no plan is written. Prose-level, like refine-recommend-prose.test.js.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const raw = fs.readFileSync(path.join(REPO, 'packages/core/commands/refine-verification.md'), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const idx = (s) => raw.indexOf(s);
const section = (heading, endRe) => {
  const start = raw.indexOf(heading);
  if (start < 0) return '';
  const rest = raw.slice(start + heading.length);
  const next = rest.search(endRe);
  return flat(next < 0 ? rest : rest.slice(0, next));
};
const inputs = section('\n## Inputs', /\n## /);
const writes = section('\n## Writes', /\n## /);
const never = section('\n## Never', /\n---/);
const readout = section('\n## Readout', /\n## |$(?![\s\S])/);

describe('refine-verification.md run-limit check', () => {
  const CHECK = 'verification-runs.js check';

  test('the check is in Inputs, after record-ref ensure and before the Derive heading', () => {
    const ensure = idx('record-ref.js ensure');
    const check = idx(CHECK);
    const derive = idx('\n## Derive');
    expect(ensure).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(ensure);
    expect(derive).toBeGreaterThan(check);
    expect(inputs).toContain(CHECK);
  });

  test('both modes are covered by the same check and it asks nothing', () => {
    expect(inputs).toMatch(/both modes/i);
    expect(inputs).toMatch(/--auto/);
    expect(inputs).toMatch(/before .*(product-manager|agent)/i);
  });

  test('the limit wins over the satisfied-with-nothing-open sentence (D9)', () => {
    expect(inputs).toMatch(/limit .*(wins|first)/i);
    expect(inputs).toMatch(/satisfied/);
  });

  test('the decline calls request, records and publishes the ruling request', () => {
    expect(inputs).toContain('verification-runs.js request');
    expect(inputs).toContain('--kind ruling-request');
    expect(inputs).toContain('publishArtifacts');
  });

  test('the D8 reason line is present', () => {
    expect(raw).toContain('verification run limit reached (<n> of <limit> runs)');
    expect(inputs).toMatch(/COMMAND STUCK/);
  });

  test('the decline text uses no markdown fence (functional-verification.test.js takes the first one)', () => {
    const fences = [...raw.matchAll(/^[ \t]*```markdown$/gm)].map((m) => m.index);
    expect(fences.length).toBeGreaterThan(0);
    expect(fences[0]).toBeGreaterThan(idx('\n## Writes'));
  });

  test('Writes says no plan is written at the limit and lists the decline writes', () => {
    expect(writes).toMatch(/except at the run limit/i);
    expect(writes).toMatch(/no `?verification-plan\.md`? is written/i);
    expect(writes).toContain('ruling-request.md');
  });

  test('Never and Readout name the decline branch', () => {
    expect(never).toMatch(/run limit/i);
    expect(readout).toMatch(/except at the run limit/i);
    expect(readout).toContain('--step "run limit declined"');
  });
});
