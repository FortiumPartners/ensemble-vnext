'use strict';
// VRL-D004: the reference pages, the O4 amendment marker and the CHANGELOG entry for the
// per-feature verification run limit (docs/TRD/cap-verification-runs-per-feature.md).
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

describe('run limit reference docs', () => {
  test.each([
    'docs/reference/verification.md',
    'docs/reference/implement-trd.md',
    'docs/reference/other-commands.md',
  ])('%s names the setting, its default and the ruling request', (f) => {
    const t = flat(read(f));
    expect(t).toMatch(/ensemble\.verificationRunLimit/);
    expect(t).toMatch(/default (is )?2|default 2|shipped default is 2/);
    expect(t).toMatch(/ruling-request\.md/);
  });

  test('verification.md states the counting rules and who acts', () => {
    const t = flat(read('docs/reference/verification.md'));
    expect(t).toMatch(/setup-failure/);
    expect(t).toMatch(/--reset-state/);
    expect(t).toMatch(/verification-runs\.js/);
    expect(t).toMatch(/at least 1/);
  });

  test('other-commands.md no longer says a plan loop is unbounded', () => {
    expect(read('docs/reference/other-commands.md')).not.toMatch(/refine, run, repeat\.\s*$/m);
  });

  test('refine-verification TRD O4 carries the dated marker, original wording kept', () => {
    const row = read('docs/TRD/refine-verification.md').split('\n').find((l) => l.startsWith('| O4 |'));
    expect(row).toMatch(/AMENDED 2026-11-16 by docs\/TRD\/cap-verification-runs-per-feature\.md D13/);
    expect(row).toMatch(/NEXT is `\/refine-verification`, then `\/verify-build`/);
  });

  test('CHANGELOG release section names the feature', () => {
    const c = read('CHANGELOG.md');
    const unreleased = c.slice(c.indexOf('## [4.17.9]'), c.indexOf('## [4.17.8]'));
    expect(unreleased).toMatch(/Per-feature verification run limit/);
  });
});
