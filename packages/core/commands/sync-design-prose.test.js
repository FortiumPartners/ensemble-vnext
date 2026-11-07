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
    for (const f of ['commands/sync-design.md', 'commands/audit-build.md', 'commands/close-feature.md', 'commands/audit-design.md', 'workflows/sync-design.js', 'workflows/audit-design.js']) {
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
    expect(sync).toContain('It may run on a feature branch before its PR merges; its commits land on that branch.');
    expect(sync).toContain('argument-hint: "<slug> [--trd <path>] [--project <dir>] [--chained]"');
    expect(sync).toMatch(/--trd <path>.{0,200}only `building` boards whose `trd` has that feature name/);
    expect(sync).toContain(
      '**`--trd <path>`** (stripped with its value, like `--project`) limits the run to one feature: only `building` boards whose `trd` has that feature name are put in the map text passed to the workflow, and every other board is left untouched.');
    expect(sync).toContain('(with `--trd`, `building` ones of that feature)');
    expect(sync).toContain('**Strip `--project <dir>`, `--trd <path>` and `--chained` first**, remembering each.');
    expect(sync).not.toMatch(/--trd[^.]{0,80}(syncs|includes|captures) (every|all) (board|building)/i);
    expect(sync).toContain('notify-complete.sh "sync-design"');
    expect(sync).toContain('design-commands.md');
  });

  test('captures only against a listed environment, never staging or production', () => {
    expect(sync).toMatch(/never `staging` or `production`/);
  });
});

const closeFeature = flat(read('packages/core/commands/close-feature.md'));

describe.each([['audit-build', auditBuild], ['close-feature', closeFeature]])(
  '%s readout names unsynced boards without chaining /sync-design',
  (_name, text) => {
    test('runs unsynced --all --trd after the close record is written', () => {
      expect(text).toContain('design-map.js unsynced --all --trd <trd-path>');
      expect(text).toMatch(/After `closed\.json` is written, run `node \.claude\/lib\/design-map\.js unsynced/);
    });

    test('merged-PR and default-branch wordings', () => {
      expect(text).toMatch(/now, or once the PR has merged/);
      expect(text).not.toMatch(/when the feature closed on the default branch/);
      expect(text).not.toMatch(/where there is no PR/);
    });

    test('one numbered step per design with /sync-design <slug> alone in a fenced block', () => {
      expect(text).toMatch(/one numbered step per design/);
      expect(text).toContain('`/sync-design <slug> --trd <trd-path>` alone in its fenced block');
    });

    test('with none, says nothing about syncing', () => {
      expect(text).toMatch(/With none, (NEXT )?say(s)? nothing about syncing/);
    });

    test('a failed check is an ISSUES line, never STUCK', () => {
      expect(text).toMatch(/failing check is one ISSUES line, never STUCK/);
    });

    test('names /sync-design but never runs it as a Skill call', () => {
      expect(text).toContain('/sync-design');
      expect(text).not.toMatch(/Skill\(\{ skill: "sync-design"/);
    });

    test('no longer names /sync-design unconditionally by a design-map trd scan', () => {
      expect(text).not.toMatch(/design-map\.json.*`trd`/);
    });
  },
);

describe('audit-design --drift prose', () => {
  test('documents the flag, scratch captures and that no board changes', () => {
    expect(auditDesign).toContain('[--drift]');
    expect(auditDesign).toContain('"drift": true');
    expect(auditDesign).toMatch(/scratch folder/);
    expect(auditDesign).toMatch(/lists each undesigned screen for `\/create-design`/);
  });
});
