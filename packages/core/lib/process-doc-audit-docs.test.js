'use strict';
// No lint keeps .claude/rules/process.md and its template in step, so this pins the
// /audit-docs content both must carry (DABS-D001).
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const files = {
  rules: path.join(root, '.claude/rules/process.md'),
  template: path.join(root, 'packages/core/templates/process.md.template'),
};

describe.each(Object.entries(files))('/audit-docs in %s', (_name, file) => {
  const text = fs.readFileSync(file, 'utf8');
  const section = text.split('### /audit-docs')[1] || '';

  it('is listed in the workflow overview', () => {
    expect(text).toMatch(/^\/audit-docs\s+-->/m);
  });
  it('has a command reference entry with the --comprehensive flag', () => {
    expect(section).toContain('--comprehensive');
    expect(section).toContain('**Purpose**');
    expect(section).toContain('**Process**');
  });
  it('documents the threshold setting and its defaults', () => {
    expect(section).toContain('ensemble.docsAudit.thresholds');
    expect(section).toMatch(/high[^\n]*70/);
    expect(section).toMatch(/medium[^\n]*40/);
    expect(section).toContain('COMMAND STUCK');
  });
});
