'use strict';

// DSGN-B010: pins the audit-design command prose. The command is read by a model, so these are
// documentation-level assertions (same standing as create-trd-grounding-prose.test.js).

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const text = flat(read('packages/core/commands/audit-design.md'));

describe('audit-design command prose', () => {
  test('is byte-identical in .claude/ and so is the workflow', () => {
    expect(read('.claude/commands/audit-design.md')).toBe(read('packages/core/commands/audit-design.md'));
    expect(read('.claude/workflows/audit-design.js')).toBe(read('packages/core/workflows/audit-design.js'));
  });

  test('runs stale without --record and writes no map', () => {
    expect(text).toMatch(/design-map\.js stale --dir docs\/ui\/<slug>\s*```/);
    expect(text).toContain('without `--record`');
    expect(text).toMatch(/never writes `design-map\.json`/);
  });

  test('runs the workflow once before writing the report, then records kind audit-design unpublished', () => {
    const wf = text.indexOf('Workflow({ name: "audit-design"');
    const write = text.indexOf('Writing the audit report');
    const record = text.indexOf('--kind audit-design');
    expect(wf).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(wf);
    expect(record).toBeGreaterThan(write);
    expect(text).toContain('--url ""');
  });

  test('the report carries ## Could Not Verify and reads the previous one first', () => {
    expect(text).toContain('## Could Not Verify');
    expect(text).toMatch(/previous report's `## Could Not Verify` rows/);
  });

  test('cites the contract and ends with its own banner and notify call', () => {
    expect(text).toContain('design-commands.md');
    expect(text).toContain('COMMAND COMPLETE: /audit-design');
    expect(text).toContain('notify-complete.sh "audit-design"');
  });
});
