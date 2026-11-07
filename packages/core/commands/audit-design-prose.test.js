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

  test('--drift tells the caller to pass driftRubric from verify-design-comparison ## Rubric', () => {
    expect(text).toMatch(/`capture` and `driftRubric` \(the `## Capture` and `## Rubric` text of `verify-design-comparison`/);
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

  test('unsynced boards: runs the check and names /sync-design <slug> in NEXT (USB-003)', () => {
    expect(text).toContain('design-map.js unsynced --dir docs/ui/<slug>');
    expect(text).toMatch(/then `\/sync-design <slug>` when boards are unsynced/);
  });

  test('stale system: an ISSUES line however small the change, and /design-system --sync first in NEXT (FS-27)', () => {
    expect(text).toMatch(/On `"stale": true`/);
    expect(text).toMatch(/\*\*ISSUES\*\* line/);
    expect(text).toMatch(/never only a STATE line/);
    expect(text).toMatch(/however small the change looks/);
    expect(text).toMatch(/step 1 of NEXT is `\/design-system --sync`/);
  });

  test('the report carries ## Could Not Verify and reads the previous one first', () => {
    expect(text).toContain('## Could Not Verify');
    expect(text).toMatch(/previous report's `## Could Not Verify` rows/);
  });

  test('traceability row: map-decided brief-item checks, workflow only, with the fallback (DORCH-B005)', () => {
    expect(text).toMatch(/\| `traceability` \|[^|]*brief item with no board, and a to-be board serving no brief item, are decided in code from the map's `brief_items` \(the workflow only;/);
    expect(text).toContain('Could Not Verify row');
  });

  test('cites the contract and ends with its own banner and notify call', () => {
    expect(text).toContain('design-commands.md');
    expect(text).toContain('COMMAND COMPLETE: /audit-design');
    expect(text).toContain('notify-complete.sh "audit-design"');
  });

  test('visual critique (DQ-B008): the visual verifier, direction step, new args, scores section, no runtime', () => {
    expect(text).toMatch(/\| `visual` \|/);
    expect(text).not.toMatch(/\| `render` \|/);
    expect(text).not.toMatch(/Save the render runtime|runtime: "<pinned/);
    expect(text).toMatch(/design-map\.js direction`,\s*adding `--style <name>` when [^ ]*brief\.md` has a `\*\*Style pack:\*\*` line/);
    expect(text).toMatch(/direction: <the direction result>, stylePack: [^,]*, rubric: [^,]*, floor:/);
    expect(text).toContain('VISUAL FINDINGS');
    const readout = text.indexOf('<the readout, verbatim as printed below>');
    const scores = text.indexOf('## Visual critique scores', readout);
    expect(scores).toBeGreaterThan(readout);
    expect(text.indexOf('## Could Not Verify', scores)).toBeGreaterThan(scores);
  });

  test('the report and the scratch frames stay outside docs/ui/', () => {
    expect(text).toMatch(/never under `docs\/ui\/<slug>\/`, and the scratch frames stay out of the tree/);
    expect(text).toMatch(/never `screens\/png\/` or anywhere under `docs\/ui\/<slug>\/`/);
  });
});
