'use strict';

/**
 * Structural tests for packages/skills/verify-plan-recovery/SKILL.md (VFIX-B006).
 *
 * Mirrors packages/skills/verify-design-comparison/__tests__/skill-md.test.js's scaffolding
 * (frontmatter shape + named-section presence/order), substituting this skill's own five
 * sections from docs/TRD/verification-fix-loop.md §3.7: When it applies, Inputs,
 * Conversation, Writes, Never.
 *
 * These do not judge prose quality (the skill is a prompt, not code) -- they hold the
 * contracts other stages depend on mechanically: frontmatter parses as valid YAML with the
 * expected keys; the five named sections exist, in order, headed exactly as the TRD
 * requires; and the plan file the skill writes carries the `##` headings /verify-build --fix
 * reads, with the two `## Stop rule` keys readStopRule() (functional-verification.js) parses.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILL_DIR = path.join(__dirname, '..');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');

const REQUIRED_SECTIONS = [
  'When it applies',
  'Inputs',
  'Conversation',
  'Writes',
  'Never'
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
  // Matches an ATX heading whose text is exactly one of the required names, e.g. "## Writes"
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

describe('packages/skills/verify-plan-recovery/SKILL.md', () => {
  test('the file exists', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
  });

  let parsed;
  beforeAll(() => {
    if (fs.existsSync(SKILL_PATH)) {
      parsed = parseFrontmatter(readSkill());
    }
  });

  test('frontmatter parses as YAML', () => {
    expect(parsed).not.toBeNull();
    expect(parsed.data).toEqual(expect.any(Object));
  });

  test('frontmatter carries name, description, when_to_use, allowed-tools', () => {
    const keys = Object.keys(parsed.data).sort();
    expect(keys).toEqual(['allowed-tools', 'description', 'name', 'when_to_use'].sort());
  });

  test('frontmatter name is verify-plan-recovery', () => {
    expect(parsed.data.name).toBe('verify-plan-recovery');
  });

  test('the five sections exist, headed exactly as named', () => {
    const indexes = sectionHeadingIndexes(parsed.body);
    for (const name of REQUIRED_SECTIONS) {
      expect(Object.keys(indexes)).toContain(name);
    }
  });

  test('sections appear in the stated order', () => {
    const indexes = sectionHeadingIndexes(parsed.body);
    const positions = REQUIRED_SECTIONS.map((n) => indexes[n]);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  describe('the plan file it writes', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Writes'); });

    test('names the six plan headings /verify-build --fix reads', () => {
      for (const h of ['Blockers', 'Slices', 'Owner rulings', 'Accepted as not verifiable',
        'Extra checks', 'Stop rule']) {
        expect(section).toContain(`## ${h}`);
      }
    });

    test('proposes the stop rule with the two keys readStopRule() parses', () => {
      const conversation = sectionBody(parsed.body, 'Conversation');
      expect(conversation).toMatch(/max-rounds:/);
      expect(conversation).toMatch(/stop-when-closed-below:/);
    });
  });

  describe('directory hygiene', () => {
    test('no script, template or image file ships alongside SKILL.md', () => {
      const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name);
      expect(entries).toEqual(['SKILL.md']);
    });
  });
});
