'use strict';

// DSGN-B015: pins the sync-design and audit-build NEXT prose and the audit-design --drift prose.
// The commands are read by a model, so these are documentation-level assertions (same standing
// as audit-design-prose.test.js).

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const sync = flat(read('packages/core/commands/sync-design.md'));
const auditBuild = flat(read('packages/core/commands/audit-build.md'));
const auditDesign = flat(read('packages/core/commands/audit-design.md'));

describe('sync-design command prose', () => {
  test('command, workflow and the edited commands are byte-identical in .claude/', () => {
    for (const f of ['commands/sync-design.md', 'commands/audit-build.md', 'commands/audit-design.md', 'workflows/sync-design.js', 'workflows/audit-design.js']) {
      expect(read(`.claude/${f}`)).toBe(read(`packages/core/${f}`));
    }
  });

  test('only an owner ruling accepts a difference; an architect TRD decision does not', () => {
    expect(sync).toContain('Only an owner ruling counts');
    expect(sync).toContain('verification-artifacts.md` D14');
    expect(sync).toMatch(/TRD decision the architect wrote does not/);
  });

  test('moves matched boards to shipped with a commit and the old as-is to History', () => {
    expect(sync).toMatch(/design-map\.js transition --dir docs\/ui\/<slug> --ids <matched ids> --to shipped --commit/);
    expect(sync).toContain('History');
  });

  test('chains /design-system --sync --chained and ends with its own single banner', () => {
    expect(sync).toContain('args: "--sync --chained"');
    expect(sync).toContain('COMMAND COMPLETE: /sync-design');
    expect(sync).toContain('notify-complete.sh "sync-design"');
    expect(sync).toContain('design-commands.md');
  });

  test('captures only against a listed environment, never staging or production', () => {
    expect(sync).toMatch(/never `staging` or `production`/);
  });
});

describe('audit-build NEXT names /sync-design without chaining it', () => {
  test('names /sync-design <slug> when the closed feature cites a design, as a line and not a Skill call', () => {
    expect(auditBuild).toContain('/sync-design <slug>');
    expect(auditBuild).toMatch(/design-map\.json.*`trd`/);
    expect(auditBuild).not.toMatch(/Skill\(\{ skill: "sync-design"/);
  });
});

describe('audit-design --drift prose', () => {
  test('documents the flag, scratch captures and that no board changes', () => {
    expect(auditDesign).toContain('[--drift]');
    expect(auditDesign).toContain('"drift": true');
    expect(auditDesign).toMatch(/scratch folder/);
    expect(auditDesign).toMatch(/lists each undesigned screen for `\/create-design`/);
  });
});
