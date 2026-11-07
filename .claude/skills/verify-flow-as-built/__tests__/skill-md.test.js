'use strict';

/**
 * Structural tests for packages/skills/verify-flow-as-built/SKILL.md (DSGN-B013).
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

describe('packages/skills/verify-flow-as-built/SKILL.md', () => {
  let parsed;
  beforeAll(() => { parsed = parseFrontmatter(readSkill()); });

  test('the file exists and frontmatter parses', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    expect(parsed).not.toBeNull();
  });

  test('frontmatter carries exactly name, description, when_to_use, allowed-tools', () => {
    expect(Object.keys(parsed.data).sort()).toEqual(['allowed-tools', 'description', 'name', 'when_to_use']);
    expect(parsed.data.name).toBe('verify-flow-as-built');
  });

  test('the seven sections exist, in order', () => {
    const idx = sectionHeadingIndexes(parsed.body);
    expect(Object.keys(idx)).toEqual(REQUIRED_SECTIONS);
    const positions = REQUIRED_SECTIONS.map((n) => idx[n]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('Inputs take board links in design-map.json as designed edges (AC-F12.3)', () => {
    const section = sectionBody(parsed.body, 'Inputs');
    expect(section).toMatch(/design-map\.json/);
    expect(section).toMatch(/`links`/);
    expect(section.toLowerCase()).toMatch(/designed edges/);
  });

  test('When it applies names design-map.json', () => {
    expect(sectionBody(parsed.body, 'When it applies')).toMatch(/design-map\.json/);
  });

  test('keeps the FL-<journey slug> ID rule and the locator tier', () => {
    const section = sectionBody(parsed.body, 'Criteria');
    expect(section).toMatch(/FL-<journey slug>/);
    expect(section).toMatch(/`locator`/);
  });

  test('no script, template or image file ships alongside SKILL.md', () => {
    const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true })
      .filter((e) => e.isFile()).map((e) => e.name);
    expect(entries).toEqual(['SKILL.md']);
  });
});
