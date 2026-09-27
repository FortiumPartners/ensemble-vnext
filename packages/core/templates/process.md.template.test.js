'use strict';

// VSET-D001: /verification-setup gains a MAINTENANCE entry in both authored copies of
// process.md, and docs/TRD/verification-convergence.md's D9 and OQ-1 rows get an inline
// pointer to it. These are documentation-level assertions, same standing as
// packages/core/commands/verify-command-surface.test.js's: they pin the PROSE, not any
// executed behaviour.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const RULES_PROCESS = path.join(REPO_ROOT, '.claude/rules/process.md');
const TEMPLATE_PROCESS = path.join(
  REPO_ROOT,
  'packages/core/templates/process.md.template'
);
const VERIFICATION_CONVERGENCE = path.join(
  REPO_ROOT,
  'docs/TRD/verification-convergence.md'
);

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('process.md MAINTENANCE list names /verification-setup', () => {
  it.each([
    ['.claude/rules/process.md', RULES_PROCESS],
    ['packages/core/templates/process.md.template', TEMPLATE_PROCESS],
  ])('%s has a /verification-setup MAINTENANCE line', (_label, filePath) => {
    const content = read(filePath);
    expect(content).toMatch(/\/verification-setup\s+-->\s+.+/);
  });

  it('the /verification-setup line reads identically in both copies', () => {
    const rulesLine = read(RULES_PROCESS).match(/^\/verification-setup\s+-->.+$/m)[0];
    const templateLine = read(TEMPLATE_PROCESS).match(
      /^\/verification-setup\s+-->.+$/m
    )[0];
    expect(rulesLine).toBe(templateLine);
  });

  it('sits inside the MAINTENANCE fenced block, alongside /update-project', () => {
    const content = read(RULES_PROCESS);
    const maintenanceBlock = content.split('MAINTENANCE')[1].split('```')[0];
    expect(maintenanceBlock).toMatch(/\/update-project/);
    expect(maintenanceBlock).toMatch(/\/verification-setup/);
  });
});

describe('verification-convergence.md D9 and OQ-1 point at verification.md §5a', () => {
  const content = read(VERIFICATION_CONVERGENCE);

  it('D9 row keeps COVERAGE_FLOOR = null unchanged and adds the pointer', () => {
    const d9Row = content.split('\n').find((line) => line.startsWith('| D9 |'));
    expect(d9Row).toBeDefined();
    expect(d9Row).toMatch(/COVERAGE_FLOOR = null/);
    expect(d9Row).toMatch(/verification\.md.*§5a/);
    expect(d9Row).toMatch(/verification-md-setup/);
  });

  it('OQ-1 row keeps "leave it unset" unchanged and adds the pointer', () => {
    const oq1Row = content.split('\n').find((line) => line.startsWith('| OQ-1 |'));
    expect(oq1Row).toBeDefined();
    expect(oq1Row).toMatch(/Leave it UNSET/);
    expect(oq1Row).toMatch(/verification\.md.*§5a/);
    expect(oq1Row).toMatch(/verification-md-setup/);
  });

  it('gains a new Changelog row documenting the amendment', () => {
    const changelogSection = content
      .split('## Changelog')[1]
      .split('\n\n---')[0];
    expect(changelogSection).toMatch(/verification-md-setup/);
    expect(changelogSection).toMatch(/§5a/);
  });
});
