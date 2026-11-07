'use strict';

// SHIP-B017: pins /sync-design --chained and the two "Unsynced boards" paragraphs.
// Commands are read by a model, so these are documentation-level assertions (same standing
// as sync-design-prose.test.js).

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

describe('/sync-design --chained', () => {
  const text = flat(read('packages/core/commands/sync-design.md'));

  test('the argument-hint carries --chained and it is stripped with the other flags', () => {
    expect(read('packages/core/commands/sync-design.md')).toMatch(/^argument-hint: ".*\[--chained\]"$/m);
    expect(text).toContain('Strip `--project <dir>`, `--trd <path>` and `--chained` first');
  });

  test('under --chained: no banner, no notify-complete.sh, one RETURN line with the four counts', () => {
    expect(text).toMatch(/Under `--chained`\*\*, print one line and stop/);
    expect(text).toMatch(/No banner, no `notify-complete\.sh`/);
    expect(text).toContain('[STATUS: /sync-design] RETURN → <n> shipped, <n> rebuilt, <n> uncaptured, <n> skipped');
  });

  test('an unfilled design.md ends on a RETURN line, not a banner', () => {
    expect(text).toMatch(/unfilled or missing `design\.md` ends on this line too/);
    expect(text).toMatch(/becomes a RETURN line/);
  });

  test('the normal banner and notify call are still there for a run without --chained', () => {
    expect(text).toContain('═══ COMMAND COMPLETE: /sync-design ═══');
    expect(text).toContain('.claude/hooks/notify-complete.sh "sync-design" "complete"');
  });
});

describe.each([['audit-build'], ['close-feature']])('%s Unsynced boards paragraph', (name) => {
  const text = flat(read(`packages/core/commands/${name}.md`));

  test('where ship.md lists sync-design the step says the boards sync after the merge and names no /sync-design', () => {
    expect(text).toContain("Where `.claude/rules/ship.md` lists `sync-design`, that step is a line naming that design's boards and saying they sync after the merge, naming no `/sync-design` and carrying no fenced block.");
  });

  test('otherwise unchanged, and the command still never runs /sync-design', () => {
    expect(text).toContain('Otherwise it is a line naming that design\'s boards and saying to check them against the build with `/sync-design` now, or once the PR has merged');
    expect(text).toContain('`/sync-design <slug> --trd <trd-path>` alone in its fenced block');
    expect(text).toContain('this command never runs `/sync-design`');
  });
});

test('commands are byte-identical in .claude/', () => {
  for (const f of ['sync-design', 'audit-build', 'close-feature']) {
    expect(read(`.claude/commands/${f}.md`)).toBe(read(`packages/core/commands/${f}.md`));
  }
});
