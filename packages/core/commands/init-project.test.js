'use strict';

// VSET-B005: /init-project names `verification.md` and `/verification-setup` in two places
// (D15, O7) -- Step 4.4's framework-shipped-rules list (so a new project's owner learns the
// file exists and how to fill it) and the completion report's Next Steps list (so the owner
// sees the action item once scaffolding finishes). This suite asserts on the PROSE these two
// files carry, same standing as verify-command-surface.test.js's -- it proves the command
// TELLS the model/owner what to do, not that a given run obeyed.
//
// Nothing in `/init-project` runs `/verification-setup` (NG2) -- it only names it.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');

const CORE_INIT = path.join(REPO, 'packages/core/commands/init-project.md');
const CLAUDE_INIT = path.join(REPO, '.claude/commands/init-project.md');
const FULL_INIT = path.join(REPO, 'packages/full/commands/plugin-only/init-project.md');

const read = (p) => fs.readFileSync(p, 'utf8');
// Prose wraps at ~80 columns, so a phrase that reads as one sentence to a human can straddle
// a line break in the source. Flatten before matching a multi-word phrase so a cosmetic
// rewrap never fails this suite for a reason that has nothing to do with content.
const flat = (s) => s.replace(/\s+/g, ' ');

describe('init-project.md is identical across its two tracked copies', () => {
  test('.claude/ mirror matches packages/core source', () => {
    expect(read(CLAUDE_INIT)).toBe(read(CORE_INIT));
  });

  test('packages/full/commands/plugin-only copy matches packages/core source', () => {
    expect(read(FULL_INIT)).toBe(read(CORE_INIT));
  });
});

describe('Step 4.4 names verification.md and /verification-setup (D15, O7)', () => {
  const src = () => flat(read(CORE_INIT));

  test('lists verification.md as a framework-shipped rule', () => {
    expect(src()).toMatch(/`verification\.md`/);
  });

  test('names /verification-setup as how it gets filled', () => {
    expect(src()).toMatch(/`verification\.md`[\s\S]{0,300}\/verification-setup/);
  });
});

describe('Completion report Next Steps names /verification-setup after the stack.md item (D15)', () => {
  test('the stack.md review line is immediately followed by a /verification-setup line', () => {
    const src = read(CORE_INIT);
    const lines = src.split('\n');
    const stackIdx = lines.findIndex((l) => /Review \.claude\/rules\/stack\.md for accuracy/.test(l));
    expect(stackIdx).toBeGreaterThan(-1);
    expect(lines[stackIdx + 1]).toMatch(/\/verification-setup/);
    expect(lines[stackIdx + 1]).toMatch(/verification\.md/);
  });
});

describe('scope discipline (NG2): /init-project never invokes /verification-setup', () => {
  test('the skill is only named, never dispatched or run', () => {
    const src = flat(read(CORE_INIT));
    expect(src).not.toMatch(/[Rr]un(?:ning)? the `?\/verification-setup`? skill\b.*for you/);
    expect(src).not.toMatch(/[Ii]nvoke `?\/verification-setup`? automatically/);
  });
});
