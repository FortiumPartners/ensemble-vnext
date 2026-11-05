'use strict';

// DSGN-B006: pins the design-system command prose (documentation-level, like audit-design-prose).

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const raw = read('packages/core/commands/design-system.md');
const text = raw.replace(/\s+/g, ' ');

describe('design-system command prose', () => {
  test('is byte-identical in .claude/', () => {
    expect(read('.claude/commands/design-system.md')).toBe(raw);
  });

  test('frontmatter at byte 0, model-invocable, takes --sync and --chained', () => {
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw.split('---')[1]).not.toContain('disable-model-invocation');
    expect(raw.split('---')[1]).toContain('[--sync] [--chained]');
  });

  test('reads the publishing switch at start; with it off, publishes nothing and ends STUCK (NFR-2)', () => {
    expect(text).toMatch(/Read the publishing switch next\*\* \(contract section 1 step 2\)/);
    expect(text).toMatch(/skip this step and step 7 entirely\*\*: contract section 5 applies/);
    expect(text).toMatch(/end with `COMMAND STUCK: \/design-system`/);
  });

  test('cites the contract sections for start, install and publish', () => {
    expect(text).toContain('design-commands.md');
    expect(text).toMatch(/contract section 1/);
    expect(text).toMatch(/contract section 3/);
    expect(text).toMatch(/contract section 4/);
    expect(text).toMatch(/contract section 5/);
  });

  test('gates the build on design.md and stops STUCK when it is not filled', () => {
    expect(text).toContain('design-map.js setup');
    expect(text).toContain('run `/design-setup`');
    expect(text).toMatch(/only if `design\.md` says the build may run/);
  });

  test('commits built files to docs/ui/_design-system/<folder>/ (D4) and lists stubs', () => {
    expect(text).toContain('docs/ui/_design-system/<folder>/');
    expect(text).toMatch(/Commit the built files/);
    expect(text).toMatch(/lists \*\*every stub\*\*/);
  });

  test('records version and commit in each map, never design.md, and clears drift', () => {
    expect(text).toMatch(/Record the system in each `design-map\.json`\*\*, never in `design\.md`/);
    expect(text).toContain('`code_commit`');
    expect(text).toContain('clear `drift`');
  });

  test('takes the Figma route from the main session', () => {
    expect(text).toContain('from-design-tool.md');
    expect(text).toMatch(/main session only/);
  });

  test('install and publish order: build, commit, publish, install, record', () => {
    const i = (s) => text.indexOf(s);
    const order = ['**Build.**', '**Commit the built files**', '**Publish the Design System artifact**', '**Install on every canvas', '**Record the system'].map(i);
    order.forEach((n) => expect(n).toBeGreaterThan(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('--chained ends on a RETURN line, no banner, no notify; plain run has both', () => {
    expect(text).toContain('[STATUS: /design-system] RETURN');
    expect(text).toMatch(/Under `--chained`\*\*, print one line and stop\. No banner, no `notify-complete\.sh`/);
    expect(text).toContain('COMMAND COMPLETE: /design-system');
    expect(text).toContain('notify-complete.sh "design-system"');
  });
});
