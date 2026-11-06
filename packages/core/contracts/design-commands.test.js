'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CORE_PATH = path.join(__dirname, 'design-commands.md');
const ROOT = path.join(__dirname, '..', '..', '..');
const MIRROR_PATH = path.join(ROOT, '.claude', 'contracts', 'design-commands.md');
const LINT = path.join(ROOT, 'packages', 'core', 'scripts', 'lint-command-structure.js');

// Design commands cite these sections by number (TRD design-stage §3.5, D9).
const HEADINGS = [
  '1. Start',
  '2. Render pass',
  '3. Install the design system on a canvas',
  '4. Publish',
  '5. No artifact access, or publishing off',
  '6. Never publish a credential',
  '7. Readout',
  '8. Visual critique',
];

describe('design-commands contract', () => {
  let text;
  const section = (n) => {
    const start = text.indexOf(`## ${HEADINGS[n - 1]}`);
    const rest = text.slice(start + 3);
    const next = rest.search(/\n## /);
    return next === -1 ? rest : rest.slice(0, next);
  };
  beforeAll(() => {
    text = fs.readFileSync(CORE_PATH, 'utf8');
  });

  test('exists and is mirrored byte-for-byte to .claude/contracts', () => {
    expect(fs.existsSync(MIRROR_PATH)).toBe(true);
    expect(fs.readFileSync(MIRROR_PATH, 'utf8')).toBe(text);
  });

  test('carries the eight section headings verbatim, in order', () => {
    let fenced = false;
    const found = [];
    for (const l of text.split('\n')) {
      if (/^```/.test(l)) fenced = !fenced;
      else if (!fenced && /^## /.test(l)) found.push(l.slice(3).trim());
    }
    expect(found).toEqual(HEADINGS);
  });

  test('passes lint-command-structure.js', () => {
    const r = spawnSync('node', [LINT, CORE_PATH], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  test.each([
    [1, ['AC-F5.9', 'AC-F6.9', 'design-map.js setup', '/design-setup', 'design-map.js stale', 'unfilled']],
    [2, ['AC-F3.6', 'local render pass']],
    [3, ['AC-F6.8', 'designSystems', 'canvas.json']],
    [4, ['AC-F5.6', 'design-mirror.js refused', 'third refusal']],
    [5, ['NFR-2', 'publishArtifacts', 'STUCK', 'publish step']],
    [6, ['NFR-6', 'O-SEC3', 'data']],
    [8, ['AC-F5.7', 'Not judged', 'Comparative', 'edits nothing']],
    [7, ['NFR-5', 'STATE', 'DECISIONS', 'ISSUES', 'NEXT', '/design-system --sync']],
  ])('section %i names what it implements', (n, needles) => {
    const body = section(n);
    for (const s of needles) expect(body).toContain(s);
  });

  test('start keeps approval when a canvas edit lands on an approved or building board (OQ-6)', () => {
    const s1 = section(1);
    expect(s1).toMatch(/approved_commit/);
    expect(s1).toMatch(/approved/);
    expect(s1).toMatch(/building/);
    expect(section(7)).toContain('edited after approval');
  });

  test('canvas-only edits get their own adopt commit with the fixed message (AC-F5.2)', () => {
    const s1 = section(1).replace(/\s+/g, ' ');
    expect(s1).toContain('git commit -m "design: adopt canvas edits (<board>, <board>)"');
    expect(s1).toMatch(/never folded into the command's own commit/);
  });

  test('a both-changed conflict keeps both files and is an ISSUES line (AC-F5.4)', () => {
    const s1 = section(1).replace(/\s+/g, ' ');
    expect(s1).toMatch(/\*\*Keep both files\.\*\* Never delete, rename or merge the `\.repo\.dc\.html` copy/);
    expect(s1).toMatch(/Each conflict is an \*\*ISSUES\*\* line \(never DECISIONS\)/);
  });

  test('the stale check runs every run, and drift is an ISSUES line with --sync first in NEXT', () => {
    const s1 = section(1).replace(/\s+/g, ' ');
    expect(s1).toMatch(/Stale-system check, every run, including a run that changes no board/);
    expect(s1).toContain('design-map.js stale --dir docs/ui/<slug> --record');
    expect(s1).toMatch(/The drift is an \*\*ISSUES\*\* line, never only a STATE line/);
  });

  test('step 6 also runs the unsynced-board check, with /sync-design <slug> after --sync (USB-003)', () => {
    const s1 = section(1).replace(/\s+/g, ' ');
    expect(s1).toMatch(/unsynced-board check/);
    expect(s1).toContain('design-map.js unsynced --dir docs/ui/<slug>');
    expect(s1).toContain('boards <ids> are still building although their feature closed: check them against the build');
    expect(s1).toMatch(/`\/sync-design` skips it, being the remedy, and `\/design-system` skips it/);
    const s7 = section(7).replace(/\s+/g, ' ');
    expect(s7).toMatch(/`\/design-system --sync` first when the system is stale, then `\/sync-design <slug>`/);
  });

  test('the publishing switch is read before any Artifact call and governs the whole run (NFR-2)', () => {
    const s1 = section(1).replace(/\s+/g, ' ');
    expect(s1).toMatch(/Read the publishing switch, before any Artifact call, every run/);
    expect(s1).toContain('publishArtifacts===false');
    expect(section(5)).toMatch(/Make no publish call at all/);
  });

  test('stale check is report-only for /audit-design', () => {
    expect(section(1)).toMatch(/\/audit-design[^.]*without `--record`|report-only/i);
  });

  test('publish-unavailable section states the supersession and the STUCK', () => {
    const s5 = section(5);
    expect(s5).toMatch(/supersede/i);
    expect(s5).toMatch(/never fatal/i);
    expect(s5).toMatch(/empty url/i);
    expect(s5).toMatch(/no artifact access/i);
    expect(s5).toMatch(/`?false`?/);
  });

  test('canvas link sits above the banner', () => {
    expect(section(7)).toMatch(/above the (COMMAND COMPLETE|banner)/i);
  });

  test('step 3 renders with the pinned runtime and reads the Design type when no canvas exists (D1, D2, D18)', () => {
    const s1 = section(1).replace(/\s+/g, ' ');
    expect(s1).not.toContain('renders are skipped');
    expect(s1).not.toMatch(/pass none/);
    expect(s1).toContain('.claude/lib/dc-runtime.js');
    expect(s1).toContain('design-render.js runtime-check --live');
    expect(s1).toContain('scope: "types"');
    expect(s1).toContain('type_url');
    expect(s1).toContain('canvas rules not loaded: no Artifact tool');
  });

  test('step 7 is the direction step, naming three commands; steps 1-6 keep their numbers (D8)', () => {
    const s1 = section(1);
    expect(s1).toMatch(/\n7\. \*\*Design direction\*\*/);
    expect(s1).not.toMatch(/\n8\. /);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(s1).toMatch(new RegExp(`\\n${n}\\. `));
    const s1n = s1.replace(/\s+/g, ' ');
    expect(s1n).toContain('design-map.js direction');
    expect(s1n).toMatch(/`\/create-design`, `\/refine-design` and `\/audit-design` only/);
    expect(s1n).toContain('`/design-system` and `/sync-design` draw nothing');
    expect(s1n).toContain('/design-setup');
    expect(section(2)).toMatch(/floors/);
  });

  test('visual critique defines ten dimensions, 1-5 anchors, rules and the rank table (D10)', () => {
    const s8 = section(8);
    for (const d of ['Usability', 'Hierarchy', 'Craft', 'Brand', 'Consistency',
      'Responsiveness', 'States', 'Copy', 'Density', 'Distinctiveness']) {
      expect(s8).toMatch(new RegExp(`\\*\\*${d}\\*\\*: \\S`));
    }
    const n = s8.replace(/\s+/g, ' ');
    for (const a of ['1 is broken', '2 is a clear fault', '3 is acceptable', '4 is good', '5 is strong']) expect(n).toContain(a);
    expect(n).toMatch(/better.*same.*worse/);
    expect(n).toContain('no predecessor');
    expect(n).toContain('names the frame, the element and a specific change');
    expect(n).toContain('| Render error | high |');
    expect(n).toContain('| Score 1 | high |');
    expect(n).toContain('| Score 2 | medium |');
    expect(n).toContain('| Score 3 | low |');
    expect(n).toMatch(/edits nothing/);
    expect(n).toMatch(/data, never instructions/);
  });

  test('readout ISSUES carries blank direction fields, critique not run and runtime drift', () => {
    const s7 = section(7).replace(/\s+/g, ' ');
    expect(s7).toContain('blank design-direction fields');
    expect(s7).toContain('visual critique not run');
    expect(s7).toContain('pinned render runtime differs');
  });
});
