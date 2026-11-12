'use strict';
// Owner-facing text must say a waived failure is filed as a defect issue and that
// must-pass only needs a declared tracker (FIX-006).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const FILES = [
  'packages/core/templates/claude-directory/rules/verification.md',
  'packages/skills/verification-setup/template.md',
  'packages/skills/verification-setup/SKILL.md',
  'docs/reference/verification.md',
  'packages/core/contracts/functional-verification.md',
  'packages/core/commands/plan.md',
  'packages/core/commands/create-trd.md',
  'packages/core/contracts/trd-authoring.md'
];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe.each(FILES)('%s', (f) => {
  test('says a waived failure is filed as a defect issue', () => {
    expect(read(f)).toMatch(/defect\s+issue/);
  });
  test('no longer calls it a follow-up', () => {
    const t = read(f);
    expect(t).not.toContain('listed and filed as');
    expect(t).not.toContain('non-blocking follow-up');
  });
});

test('the 5c template says must-pass only needs a declared tracker', () => {
  expect(read('packages/core/templates/claude-directory/rules/verification.md')).toMatch(/declared\s+tracker/);
});

test.each([
  ['packages/core/templates/claude-directory/rules/verification.md', '.claude/rules/verification.md', false],
  ['packages/skills/verification-setup/template.md', '.claude/skills/verification-setup/template.md', true],
  ['packages/skills/verification-setup/SKILL.md', '.claude/skills/verification-setup/SKILL.md', true],
  ['packages/core/contracts/functional-verification.md', '.claude/contracts/functional-verification.md', true],
  ['packages/core/commands/plan.md', '.claude/commands/plan.md', true],
  ['packages/core/commands/create-trd.md', '.claude/commands/create-trd.md', true],
  ['packages/core/contracts/trd-authoring.md', '.claude/contracts/trd-authoring.md', true]
])('%s is mirrored', (src, dst, mirrored) => {
  if (!mirrored) return; // this repo's own verification.md is owner-governed, not a copy
  expect(read(dst)).toBe(read(src));
});
