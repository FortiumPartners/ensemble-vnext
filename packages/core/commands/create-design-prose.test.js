'use strict';

// DSGN-B007: pins the create-design command prose (documentation-level, like design-system-prose).

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const raw = read('packages/core/commands/create-design.md');
const text = raw.replace(/\s+/g, ' ');
const at = (s) => text.indexOf(s);

describe('create-design command prose', () => {
  test('command and workflow are byte-identical in .claude/', () => {
    expect(read('.claude/commands/create-design.md')).toBe(raw);
    expect(read('.claude/workflows/create-design.js')).toBe(read('packages/core/workflows/create-design.js'));
  });

  test('frontmatter at byte 0, not model-invocable, takes --new and --auto', () => {
    expect(raw.startsWith('---\n')).toBe(true);
    const fm = raw.split('---')[1];
    expect(fm).toContain('disable-model-invocation: true');
    expect(fm).toContain('[--new] [--auto]');
  });

  test('ends STUCK on a missing or unfilled design.md', () => {
    expect(text).toMatch(/`missing` or `unfilled` ends the command STUCK with "run `\/design-setup`"/);
  });

  test('unsynced boards: runs the check and names /sync-design <slug> in NEXT (USB-003)', () => {
    expect(text).toContain('design-map.js unsynced --dir docs/ui/<slug>');
    expect(text).toMatch(/then `\/sync-design <slug>` when boards are\s+unsynced/);
  });

  test('carries on past a stale system and puts /design-system --sync first in NEXT, asking nothing', () => {
    expect(text).toContain('design-map.js stale --dir docs/ui/<slug> --record');
    expect(text).toMatch(/carry on against the installed system, list the drift\s+under \*\*ISSUES\*\* \(not only STATE\), and put `\/design-system --sync` first in NEXT\. Ask nothing/);
    expect(text).toMatch(/on every run\s+\(including a re-run that draws nothing\)/);
  });

  test('runs ground, then the question round, then draw', () => {
    const ground = at('stage: "ground"');
    const round = at('The question round');
    const draw = at('stage: "draw"');
    expect(ground).toBeGreaterThan(0);
    expect(round).toBeGreaterThan(ground);
    expect(draw).toBeGreaterThan(round);
  });

  // FS-34: an as-is board was judged against a screenshot captured from a wider layout.
  test('as-is comparison needs a fresh capture via design-grounding; a width mismatch is a capture error (FS-34)', () => {
    expect(text).toMatch(/captured fresh at the board's viewport by the `design-grounding` skill's Capture section/);
    expect(text).toMatch(/never a stored screenshot/);
    expect(text).toMatch(/`window\.innerWidth` differing from the board's width is a capture error, not a board difference/);
  });

  // FS-34 round 1: a home screenshot with a repeated nav and card was flagged, kept and committed.
  test('a screenshot showing what the page does not render is recaptured, never committed (FS-34)', () => {
    expect(text).toMatch(/shows anything the page does not render \(a repeated nav or card/);
    expect(text).toMatch(/recapture it now, so the canvas never\s+keeps it, and never commit a screenshot any agent's note calls wrong/);
  });

  // DSGN-T004 follow-up: the recapture ran after the publish, so the canvas kept the wrong screenshot.
  test('the mismatched as-is recapture runs before any publish call, publishing on or off', () => {
    const recapture = text.indexOf("Before any publish call, check every as-is board's `mismatch_note`");
    expect(recapture).toBeGreaterThan(0);
    expect(recapture).toBeLessThan(text.indexOf('publish `canvas.json` and the parts, then the boards in order'));
    expect(text).toMatch(/This runs even with publishing off/);
  });

  test('asks at most four questions, only with a person present and not --auto, each with a recommended option', () => {
    expect(text).toContain('at most four questions');
    expect(text).toMatch(/Only with a person present and not `--auto`/);
    expect(text).toMatch(/cannot be, treat the run as `--auto`/);
    expect(text).toContain('"(Recommended)"');
    expect(text).toMatch(/never a checkpoint/);
  });

  test('publishes in the AC-F8.9 order: adopted edits, publish and install, render, commit, record', () => {
    const order = ['Commit adopted canvas edits first', 'whole-artifact read', 'publish `canvas.json` and the parts, then the boards in order',
      'Install the design system', 'Render and export', 'Commit `docs/ui/<slug>/`', '--kind design'].map(at);
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  test('writes the map once with status draft, and not from an agent', () => {
    expect(text).toContain('Write the map once');
    expect(text).toContain('`status: "draft"`');
    expect(text).toContain('Write `design-map.json` from a drawing agent');
  });

  test('exports screens/png with design-render.js', () => {
    expect(text).toContain('design-render.js render --dir docs/ui/<slug>');
    expect(text).toContain('--out docs/ui/<slug>/screens/png');
  });

  test('with publishing off or no artifact access, finishes disk work then ends STUCK naming the publish step', () => {
    expect(text).toMatch(/Read the publishing switch\s+next\*\*/);
    expect(text).toMatch(/With `publish: off` or no\s+Artifact tool, skip the publish\*\* \(no publish call, no canvas created, no system installed;\s+the recapture above still runs\)/);
    expect(text).toMatch(/contract section 5 applies, so finish steps 8 and 9 on disk \(url recorded\s+empty\), then end with `COMMAND STUCK` naming the publish step, never `COMMAND COMPLETE`/);
  });

  test('records kind design against a file, with the canvas link above the banner', () => {
    expect(text).toContain('--kind design --path docs/ui/<slug>/design-map.json');
    expect(text).toMatch(/canvas link goes \*\*above\*\* the banner/);
  });

  test('cites the contract and ends with its own banner and notify call', () => {
    expect(text).toContain('design-commands.md');
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(text.toLowerCase()).toContain(`contract section ${n}`);
    expect(text).toContain('COMMAND COMPLETE: /create-design');
    expect(text).toContain('notify-complete.sh "create-design"');
  });
});
