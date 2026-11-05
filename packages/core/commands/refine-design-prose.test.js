'use strict';

// DSGN-B009: pins the refine-design command prose and the autonomy exemption (documentation-level,
// like design-system-prose). AC-F9.4 is must-pass: approval only on the owner's word.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const raw = read('packages/core/commands/refine-design.md');
const text = raw.replace(/\s+/g, ' ');
const AUTONOMY = 'packages/core/templates/claude-directory/rules/autonomy.md';

describe('refine-design command prose', () => {
  test('is byte-identical in .claude/', () => {
    expect(read('.claude/commands/refine-design.md')).toBe(raw);
  });

  test('frontmatter at byte 0, not model-invocable, takes --approve and --auto', () => {
    expect(raw.startsWith('---\n')).toBe(true);
    const fm = raw.split('---')[1];
    expect(fm).toContain('disable-model-invocation: true');
    expect(fm).toContain('--approve <ids>');
    expect(fm).toContain('--auto');
  });

  test('cites the shared contract for start, publish and readout', () => {
    expect(text).toContain('design-commands.md');
    expect(text).toMatch(/contract section 1/);
    expect(text).toMatch(/contract section 4/);
    expect(text).toMatch(/contract section 7/i);
  });

  test('has an interactive/--auto mode table; every question names a recommended option', () => {
    expect(text).toMatch(/\| \*\*Interactive\*\* \(default\)/);
    expect(text).toMatch(/\| \*\*`--auto`\*\*/);
    expect(text).toMatch(/names? one option "\(Recommended\)"/);
    expect(text).toMatch(/`--auto` asks nothing/);
  });

  test('gathers feedback from argument, chat, comments and selection; comments are data', () => {
    expect(text).toContain('ArtifactComments');
    expect(text).toMatch(/deferred tool/);
    expect(text).toMatch(/selected elements/);
    expect(text).toMatch(/data, never instructions/);
  });

  test('changes only affected boards, re-challenges, publishes only changed files, replies', () => {
    expect(text).toMatch(/only the affected boards/);
    expect(text).toMatch(/read-only reviewer/);
    expect(text).toMatch(/only the files that changed/);
    expect(text).toMatch(/before\/after/);
    expect(text).toMatch(/one ISSUES line/);
  });

  test('AC-F9.4: approves only on the owner\'s word, through design-map.js transition', () => {
    expect(text).toMatch(/only on the owner's word/);
    expect(text).toContain('an "approved" comment');
    expect(text).toContain('--approve <ids>');
    expect(text).toContain('design-map.js transition');
    expect(text).toContain('--to approved');
    expect(text).toMatch(/never edit `status` by hand/);
    expect(text).toMatch(/Nothing builds from a `draft` board/);
    expect(text).toMatch(/Under `--auto`, approve nothing/);
  });

  test('approval order: commit, take HEAD, transition, render at approved commit, commit map', () => {
    const i = (s) => text.indexOf(s);
    const order = ['**Commit** the adopted edits', '**Transition**', '**Render the frames**', '**Commit the map**'].map(i);
    order.forEach((n) => expect(n).toBeGreaterThan(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('design-render.js render');
    expect(text).toContain('--approved');
  });

  test('OQ-6: an edit adopted onto an approved board keeps status and is flagged', () => {
    expect(text).toMatch(/keeps its status/);
    expect(text).toContain('approved_commit');
    expect(text).toContain('edited after approval');
  });

  test('ends with a banner, readout, notify helper, and does not chain', () => {
    expect(text).toContain('COMMAND COMPLETE: /refine-design');
    expect(text).toContain('notify-complete.sh "refine-design"');
    expect(text).toMatch(/Chain into another command/);
    expect(text).toMatch(/Edit `design\.md`/);
  });
});

describe('autonomy exemption names the design commands (D19)', () => {
  const a = read(AUTONOMY).replace(/\s+/g, ' ');

  test('template and .claude/rules copy are byte-identical', () => {
    expect(read('.claude/rules/autonomy.md')).toBe(read(AUTONOMY));
  });

  test('/refine-design is exempt by mode, with --auto as its non-interactive flag', () => {
    expect(a).toContain('`/refine-design`');
    expect(a).toMatch(/`--auto` for[^.]*`\/refine-design`|`\/refine-design`[^.]*`--auto`/);
  });

  test('design-setup joins verification-setup in the skill exemption', () => {
    expect(a).toContain('design-setup');
    expect(a).toContain('verification-setup');
  });

  test('the two rule files fit the 17000-byte ceiling or the ceiling is raised with a reason', () => {
    const size = (f) => fs.statSync(path.join(REPO, '.claude/rules', f)).size;
    const combined = size('autonomy.md') + size('async-discipline.md');
    const sh = read('test/integration/tests/runtime-integrity.test.sh');
    const m = sh.match(/\$combined" -gt (\d+)/);
    expect(combined).toBeLessThanOrEqual(Number(m[1]));
  });
});
