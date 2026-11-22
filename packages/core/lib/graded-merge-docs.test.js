'use strict';
/**
 * The graded-merge documentation (document-the-graded-merge, DOC-001): the entry under
 * [4.17.12] in CHANGELOG.md and the section in docs/guides/ship-build.md must carry what the
 * TRD's objectives require: the two issues, the one sentence for Storybook's PM, and the
 * live-proof result with its caveats. Reads the two files as they are on disk.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const changelog = read('CHANGELOG.md');
const unreleased = changelog.slice(
  changelog.indexOf('## [4.17.12]'),
  changelog.indexOf('\n## [', changelog.indexOf('## [4.17.12]') + 1)
);
const guide = read('docs', 'guides', 'ship-build.md');
const guideSection = guide.slice(guide.indexOf('### The graded merge'), guide.indexOf('#### Resolution record'));

const storybookSentence = /Storybook's PM[\s\S]{0,120}you may turn on Forge's `ship_queue` `merge` scope[\s\S]{0,80}that setting is yours to make/;

describe('CHANGELOG.md [4.17.12] carries the graded-merge entry', () => {
  test('the entry sits under [4.17.12], the release that ships it', () => {
    expect(unreleased.length).toBeGreaterThan(500);
    expect(unreleased).toMatch(/graded merge/i);
    // the section's own heading is a version heading; no other version heading may sit inside it
    expect(unreleased.slice(unreleased.indexOf('\n'))).not.toMatch(/^## \[4\./m);
  });

  test('names issue #97 (its graded-merge part) and issue #136', () => {
    expect(unreleased).toMatch(/issue #97, its graded-merge part/);
    expect(unreleased).toMatch(/issue #136/);
  });

  test("tells Storybook's PM it may turn on ship_queue merge, and that the setting is theirs", () => {
    expect(unreleased).toMatch(storybookSentence);
    expect(unreleased).toMatch(/nothing in Forge or Storybook was changed/);
  });

  test('states the live proof with its three runs and its three caveats', () => {
    expect(unreleased).toMatch(/### Live proof of the graded merge/);
    expect(unreleased).toMatch(/islayjames\/ship-build-live-test/);
    for (const pr of ['PR #7', 'PR #8', 'PR #9']) expect(unreleased).toContain(pr);
    expect(unreleased).toMatch(/did not exercise the shipped package/);
    expect(unreleased).toMatch(/narrowed re-proof was not shown/);
    expect(unreleased).toMatch(/Checks needed configuration/);
  });
});

describe('docs/guides/ship-build.md describes the graded merge, its issues and the live proof', () => {
  test('the section exists', () => {
    expect(guideSection.length).toBeGreaterThan(500);
  });

  test('names issues #97 (its graded-merge part) and #136', () => {
    expect(guideSection).toMatch(/Issues #97 \(its graded-merge part\) and #136/);
  });

  test("tells Storybook's PM about the ship_queue merge scope, and that the setting is theirs", () => {
    expect(guideSection.replace(/\s+/g, ' ')).toMatch(storybookSentence);
  });

  test('states the live proof with its caveats', () => {
    const s = guideSection.replace(/\s+/g, ' ');
    expect(s).toMatch(/Live proof \(2026-11-21, `islayjames\/ship-build-live-test`\)/);
    expect(s).toMatch(/did not exercise the shipped package/);
    expect(s).toMatch(/narrowed re-proof was not shown/);
  });
});
