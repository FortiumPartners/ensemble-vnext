'use strict';

/**
 * Structural tests for packages/skills/verify-design-structure/SKILL.md (DSGN-B013).
 *
 * These do not judge prose quality (the skill is a prompt, not code) -- they hold the
 * two contracts other stages depend on mechanically:
 *   1. Frontmatter is valid YAML with exactly the keys the TRD's §3.1 common shape names.
 *   2. The seven named sections exist, in order, headed exactly as the TRD requires --
 *      a stage's prompt points at "the Capture section" by that literal heading text.
 *
 * Content assertions below check for the presence of specific load-bearing terms drawn
 * directly from the TRD (D13, D14, D16, D19, D20, O2, O2a, O2b) rather than reproducing
 * the prose itself.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILL_DIR = path.join(__dirname, '..');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');

const REQUIRED_SECTIONS = [
  'When it applies',
  'Inputs',
  'Criteria',
  'Capture',
  'Rubric',
  'Page',
  'Safety'
];

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { data: yaml.load(match[1]), body: match[2] };
}

function sectionHeadingIndexes(body) {
  // Matches an ATX heading whose text is exactly one of the required names, e.g. "## Capture"
  const indexes = {};
  const re = /^#{1,6}\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const title = m[1].trim();
    if (REQUIRED_SECTIONS.includes(title) && !(title in indexes)) {
      indexes[title] = m.index;
    }
  }
  return indexes;
}

function sectionBody(body, name) {
  const indexes = sectionHeadingIndexes(body);
  if (!(name in indexes)) return '';
  const start = indexes[name];
  const headingLineEnd = body.indexOf('\n', start);
  const after = body.slice(headingLineEnd + 1);
  // Cut at the next markdown heading of any level
  const nextHeading = after.match(/^#{1,6}\s+/m);
  return nextHeading ? after.slice(0, nextHeading.index) : after;
}

describe('packages/skills/verify-design-structure/SKILL.md', () => {
  let parsed;
  beforeAll(() => { parsed = parseFrontmatter(readSkill()); });

  test('the file exists and frontmatter parses', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    expect(parsed).not.toBeNull();
  });

  test('frontmatter carries exactly name, description, when_to_use, allowed-tools', () => {
    expect(Object.keys(parsed.data).sort()).toEqual(['allowed-tools', 'description', 'name', 'when_to_use']);
    expect(parsed.data.name).toBe('verify-design-structure');
  });

  test('the seven sections exist, in order', () => {
    const idx = sectionHeadingIndexes(parsed.body);
    expect(Object.keys(idx)).toEqual(REQUIRED_SECTIONS);
    const positions = REQUIRED_SECTIONS.map((n) => idx[n]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('When it applies: a design with real-component boards, React and react-native-web only', () => {
    const s = sectionBody(parsed.body, 'When it applies').toLowerCase();
    expect(s).toMatch(/real/);
    expect(s).toMatch(/react-native-web/);
  });

  test('Inputs name design-map.json components and the route', () => {
    const s = sectionBody(parsed.body, 'Inputs');
    expect(s).toMatch(/design-map\.json/);
    expect(s).toMatch(/`components`/);
    expect(s.toLowerCase()).toMatch(/route/);
  });

  test('Criteria: one per board in scope, ST- ID, locator tier (AC-F12.2)', () => {
    const s = sectionBody(parsed.body, 'Criteria');
    expect(s).toMatch(/ST-<board id>/);
    expect(s).toMatch(/check:verify-design-structure/);
    expect(s).toMatch(/`locator`/);
  });

  // FS-54: a parts board and a non-React stack must each be REPORTED "not verifiable here",
  // never left silent by giving them no row (the 2026-11-05 flutter parts-only run produced
  // "no criteria are created" and no report at all).
  test('Criteria: a parts board gets a row reported not verifiable here, never silence (AC-F12.5)', () => {
    const s = sectionBody(parsed.body, 'Criteria');
    expect(s.toLowerCase()).toMatch(/parts board/);
    expect(s.toLowerCase()).not.toMatch(/no criterion/);
    const partsBullet = s.split('\n- ').find((b) => /\*\*parts board\*\*/i.test(b)) || '';
    expect(partsBullet).toMatch(/`not_verifiable`/);
    expect(partsBullet).toMatch(/artifact: null/);
    expect(s).toMatch(/verify-design-comparison/);
  });

  test('Criteria: a stack other than React or react-native-web gets rows reported not verifiable here', () => {
    const s = sectionBody(parsed.body, 'Criteria');
    expect(s).toMatch(/other than React or react-native-web/);
    expect(s).toMatch(/ST-<design slug>/);
    expect(s.toLowerCase()).toMatch(/never silent/);
  });

  test('when_to_use selects it for every design; it never deselects itself for parts or non-React', () => {
    const w = String(parsed.data.when_to_use);
    expect(w).not.toMatch(/Not selected/);
    expect(w).toMatch(/not verifiable here/);
  });

  test('Capture: fiber walk, namespace prefix removed, screenshot, no source edits, no self-spawn', () => {
    const s = sectionBody(parsed.body, 'Capture');
    expect(s).toMatch(/__reactFiber\$/);
    expect(s).toMatch(/displayName/);
    expect(s.toLowerCase()).toMatch(/namespace prefix/);
    expect(s).toMatch(/\.png/);
    expect(s.toLowerCase()).toMatch(/no source edits/);
    expect(s.toLowerCase()).toMatch(/never spawn a copy of yourself/);
    expect(s).toMatch(/verify-design-structure\/scratch\//);
  });

  test('Rubric: not verifiable here for non-React, minified names and missing Playwright (D17)', () => {
    const s = sectionBody(parsed.body, 'Rubric');
    expect(s).toMatch(/not verifiable here|not_verifiable/);
    expect(s.toLowerCase()).toMatch(/minif/);
    expect(s.toLowerCase()).toMatch(/non-react|not react/);
    expect(s.toLowerCase()).toMatch(/playwright/);
    expect(s.toLowerCase()).toMatch(/parts board/);
  });

  test('framework-skills.txt carries a check row for it', () => {
    const list = fs.readFileSync(path.join(SKILL_DIR, '..', 'framework-skills.txt'), 'utf8');
    expect(list).toMatch(/^verify-design-structure\s+check\b/m);
  });

  test('no script, template or image file ships alongside SKILL.md', () => {
    const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true })
      .filter((e) => e.isFile()).map((e) => e.name);
    expect(entries).toEqual(['SKILL.md']);
  });
});
