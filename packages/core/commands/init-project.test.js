'use strict';

// VSET-B005: init-project.md ships a second tracked copy under packages/full/commands/plugin-only/
// that no generic mirror check covers (runtime-integrity.test.sh compares packages/core/commands
// with .claude/commands only). This catches forgetting to `cp` that copy after an edit.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');

const CORE_INIT = path.join(REPO, 'packages/core/commands/init-project.md');
const FULL_INIT = path.join(REPO, 'packages/full/commands/plugin-only/init-project.md');

const read = (p) => fs.readFileSync(p, 'utf8');

test('packages/full/commands/plugin-only/init-project.md matches the packages/core source', () => {
  expect(read(FULL_INIT)).toBe(read(CORE_INIT));
});
