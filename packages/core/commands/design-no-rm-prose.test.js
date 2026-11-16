'use strict';

// Issue 151: a design critic ran a wildcard rm, which raised Claude Code's dangerous-rm prompt and
// hung an unattended run. Every place a design agent renders to a scratch folder carries the no-rm
// rule: a fresh mktemp -d folder, never rm a glob or an unresolved path, cleanup left to the scratchpad.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const FILES = [
  'contracts/design-commands.md',
  'commands/refine-design.md',
  'workflows/audit-design.js',
  'workflows/create-design.js',
];

describe('design commands carry the no-rm rule (issue 151)', () => {
  test.each(FILES)('%s names mktemp -d, no rm on a glob or unresolved path, and scratchpad cleanup', (f) => {
    const t = flat(read(`packages/core/${f}`));
    expect(t).toMatch(/`?mktemp -d`?/);
    expect(t).toMatch(/never runs? `?rm`? on a glob or an unresolved path/i);
    expect(t).toMatch(/cleanup to the scratchpad/);
  });

  test('the contract states it in both section 2 (render pass) and section 8 (visual critique)', () => {
    const t = read('packages/core/contracts/design-commands.md');
    const s2 = t.slice(t.indexOf('## 2. Render pass'), t.indexOf('## 3.'));
    const s8 = t.slice(t.indexOf('## 8. Visual critique'));
    expect(s2).toMatch(/\*\*No `rm`\.\*\*/);
    expect(s8).toMatch(/\*\*No `rm`\.\*\*/);
  });

  test.each(FILES)('.claude copy of %s is identical', (f) => {
    expect(read(`.claude/${f}`)).toBe(read(`packages/core/${f}`));
  });
});
