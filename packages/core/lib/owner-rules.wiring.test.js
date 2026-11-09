// Wiring: verification and ship steps read owner-governed rules through owner-rules.js
// (issue #90), and every vendored copy matches its source. Stable tokens only.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const WIRED = [
  'commands/implement-trd.md',
  'commands/verify-build.md',
  'commands/ship-build.md',
  'contracts/functional-verification.md',
  'contracts/ship-primitive-release.md',
  'contracts/ship-primitive-close-issue.md',
];

describe('owner-rules wiring', () => {
  test.each(WIRED)('%s calls owner-rules.js', (f) => {
    expect(read(`packages/core/${f}`)).toContain('owner-rules.js');
  });

  test('ship-build does not hand the branch copy of ship.md to --policy', () => {
    expect(read('packages/core/commands/ship-build.md')).not.toContain('--policy .claude/rules/ship.md');
  });

  test('release contract does not read verification.md from the branch path', () => {
    expect(read('packages/core/contracts/ship-primitive-release.md')).not.toContain(
      'readFileSync(".claude/rules/verification.md"'
    );
  });

  test.each(WIRED)('%s has no raw branch-path read of an owner-governed rule', (f) => {
    const t = read(`packages/core/${f}`);
    expect(t).not.toMatch(/readFileSync\(\s*["'`]\.claude\/rules\/(verification|stack|ship)\.md/);
    expect(t).not.toMatch(/(--policy|read-coverage-floor|check-verification-unfilled)\s+\.claude\/rules\//);
  });

  test.each(WIRED)('%s equals its .claude/ copy', (f) => {
    expect(read(`.claude/${f}`)).toBe(read(`packages/core/${f}`));
  });

  test('.claude/lib/owner-rules.js equals the core source', () => {
    expect(read('.claude/lib/owner-rules.js')).toBe(read('packages/core/lib/owner-rules.js'));
  });

  test('packages/full/lib/owner-rules.js is a symlink to the core file', () => {
    const link = path.join(root, 'packages/full/lib/owner-rules.js');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(link)).toBe(fs.realpathSync(path.join(root, 'packages/core/lib/owner-rules.js')));
  });
});
