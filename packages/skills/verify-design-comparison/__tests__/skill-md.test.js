'use strict';

/**
 * Structural tests for packages/skills/verify-design-comparison/SKILL.md (VART-P001).
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

describe('packages/skills/verify-design-comparison/SKILL.md', () => {
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

  test('frontmatter carries exactly name, description, when_to_use, allowed-tools', () => {
    const keys = Object.keys(parsed.data).sort();
    expect(keys).toEqual(['allowed-tools', 'description', 'name', 'when_to_use'].sort());
  });

  test('frontmatter name is verify-design-comparison', () => {
    expect(parsed.data.name).toBe('verify-design-comparison');
  });

  test('the seven sections exist, headed exactly as named', () => {
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

  describe('Criteria section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Criteria'); });

    test('names the DC-<frame stem> ID rule', () => {
      expect(section).toMatch(/DC-<frame stem>/);
    });

    test('cites the frame path', () => {
      expect(section.toLowerCase()).toMatch(/frame'?s? path|frame path/);
    });

    test('names the check:verify-design-comparison derivation', () => {
      expect(section).toMatch(/check:verify-design-comparison/);
    });

    test('states judge-only tier 1 with a reason', () => {
      expect(section).toMatch(/judge-only/);
      expect(section.toLowerCase()).toMatch(/no text assertion is possible|pictorial/);
    });

    test('excludes spec-page frames from criteria rows', () => {
      expect(section.toLowerCase()).toMatch(/spec/);
    });
  });

  describe('Capture section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Capture'); });

    test('reaches the state the frame depicts, not the data', () => {
      expect(section.toLowerCase()).toMatch(/state/);
      expect(section.toLowerCase()).toMatch(/not the data|data differs/);
    });

    test('reuses the newest screenshot across evidence folders, with its commit (D13)', () => {
      expect(section.toLowerCase()).toMatch(/newest/);
      expect(section.toLowerCase()).toMatch(/commit/);
    });

    test('re-captures on a missing commit, on working-tree drift, and on a still-open frame', () => {
      expect(section.toLowerCase()).toMatch(/working tree/);
      expect(section.toLowerCase()).toMatch(/re-captur/);
    });

    test('writes one manifest file per criterion, never a shared one', () => {
      expect(section.toLowerCase()).toMatch(/manifest/);
      expect(section.toLowerCase()).toMatch(/never (a |one )?shared/);
    });

    test('claims the stitched image as the artifact', () => {
      expect(section.toLowerCase()).toMatch(/stitched/);
    });

    test('forbids self-delegation (constitution: same-type spawn ban)', () => {
      expect(section.toLowerCase()).toMatch(/self-delegat|spawn a copy of yourself|do not spawn/);
    });
  });

  describe('Rubric section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Rubric'); });

    test('requires opening every stitched image before ruling', () => {
      expect(section.toLowerCase()).toMatch(/open every stitched image/);
    });

    test('states the diff percentage never sets the status', () => {
      expect(section.toLowerCase()).toMatch(/never sets? the status/);
    });

    test('names all six page statuses', () => {
      for (const s of ['match', 'minor', 'deviates', 'superseded', 'uncaptured', 'spec']) {
        expect(section.toLowerCase()).toContain(s);
      }
    });

    test('maps verdicts to loop statuses per D16', () => {
      expect(section).toMatch(/D16/);
      expect(section.toLowerCase()).toMatch(/met\b/);
      expect(section.toLowerCase()).toMatch(/not_met|not verifiable|not_verifiable/);
    });

    test('requires a cited owner ruling for superseded (D14)', () => {
      expect(section).toMatch(/D14/);
      expect(section.toLowerCase()).toMatch(/owner ruling|owner comment/);
    });

    test('treats a frame with no current evidence as uncaptured', () => {
      expect(section.toLowerCase()).toMatch(/uncaptured/);
    });

    test('addresses owner comments (D18)', () => {
      expect(section.toLowerCase()).toMatch(/comment/);
    });

    test('writes the verdicts.json entry', () => {
      expect(section).toMatch(/verdicts\.json/);
    });
  });

  describe('Page section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Page'); });

    test('names the four-panel layout with the fade slider', () => {
      expect(section.toLowerCase()).toMatch(/design/);
      expect(section.toLowerCase()).toMatch(/build/);
      expect(section.toLowerCase()).toMatch(/diff/);
      expect(section.toLowerCase()).toMatch(/overlay/);
      expect(section.toLowerCase()).toMatch(/fade/);
    });

    test('names the filter bar and jump strip', () => {
      expect(section.toLowerCase()).toMatch(/filter/);
      expect(section.toLowerCase()).toMatch(/jump strip/);
    });

    test('gives each card its criterion ID as a visible label (D18)', () => {
      expect(section.toLowerCase()).toMatch(/criterion id/);
    });

    test('carries the iteration / loop-outcome line', () => {
      expect(section.toLowerCase()).toMatch(/iteration/);
      expect(section.toLowerCase()).toMatch(/outcome|exited|still running/);
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
