'use strict';

/**
 * Structural tests for packages/skills/verify-data-fidelity/SKILL.md (VART-P003).
 *
 * These do not judge prose quality (the skill is a prompt, not code) -- they hold the
 * two contracts other stages depend on mechanically:
 *   1. Frontmatter is valid YAML with exactly the keys the TRD's §3.1 common shape names.
 *   2. The seven named sections exist, in order, headed exactly as the TRD requires --
 *      a stage's prompt points at "the Capture section" by that literal heading text.
 *
 * Content assertions below check for the presence of specific load-bearing terms drawn
 * directly from the TRD (§3.1 verify-data-fidelity, O8, O9, D16, D20) rather than
 * reproducing the prose itself. Mirrors packages/skills/verify-design-comparison's test
 * shape (VART-P001), adapted to this skill's own criteria and rubric.
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

describe('packages/skills/verify-data-fidelity/SKILL.md', () => {
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

  test('frontmatter name is verify-data-fidelity', () => {
    expect(parsed.data.name).toBe('verify-data-fidelity');
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

    test('names the DF-<view slug> ID rule', () => {
      expect(section).toMatch(/DF-<view slug>/);
    });

    test('cites the source and the screen', () => {
      expect(section.toLowerCase()).toMatch(/source/);
      expect(section.toLowerCase()).toMatch(/screen/);
    });

    test('names the check:verify-data-fidelity derivation', () => {
      expect(section).toMatch(/check:verify-data-fidelity/);
    });

    test('states locator tier 1', () => {
      expect(section.toLowerCase()).toMatch(/\blocator\b/);
    });

    test('gives a row template with the row-table evidence shape', () => {
      expect(section.toLowerCase()).toMatch(/row key/);
      expect(section.toLowerCase()).toMatch(/shown/);
      expect(section.toLowerCase()).toMatch(/verdict/);
    });
  });

  describe('Capture section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Capture'); });

    test('compares rendered rows against the response behind them', () => {
      expect(section.toLowerCase()).toMatch(/rendered rows?/);
      expect(section.toLowerCase()).toMatch(/response/);
    });

    test('fetches the response read-only', () => {
      expect(section.toLowerCase()).toMatch(/read-only/);
    });

    test('states any sample and why', () => {
      expect(section.toLowerCase()).toMatch(/sample/);
      expect(section.toLowerCase()).toMatch(/why|state the sample/);
    });

    test('writes a text row table it takes a locator from', () => {
      expect(section.toLowerCase()).toMatch(/row table/);
      expect(section.toLowerCase()).toMatch(/locator/);
    });

    test('writes one manifest file per criterion, never a shared one', () => {
      expect(section.toLowerCase()).toMatch(/manifest/);
      expect(section.toLowerCase()).toMatch(/never (a |one )?shared|race on it/);
    });

    test('is read-only: no source edits, rebuilds or restarts', () => {
      expect(section.toLowerCase()).toMatch(/no source edits/);
    });

    test('writes any script under scratch/, never into the source tree', () => {
      expect(section.toLowerCase()).toMatch(/scratch\//);
      expect(section.toLowerCase()).toMatch(/never into the source tree/);
    });
  });

  describe('Rubric section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Rubric'); });

    test('maps every displayed field matching to met', () => {
      expect(section.toLowerCase()).toMatch(/\bmet\b/);
      expect(section.toLowerCase()).toMatch(/every.*field|field by field/);
    });

    test('names mismatches on not_met', () => {
      expect(section.toLowerCase()).toMatch(/not_met/);
      expect(section.toLowerCase()).toMatch(/mismatch/);
    });

    test('resolves not_verifiable when the environment or identity is not authorised', () => {
      expect(section.toLowerCase()).toMatch(/not_verifiable/);
      expect(section.toLowerCase()).toMatch(/not authoris|environment or identity/);
    });

    test('resolves a missing screen not_met with reason not built, never unbuilt (D20)', () => {
      expect(section.toLowerCase()).toMatch(/not built/);
      expect(section).toMatch(/D20/);
      expect(section.toLowerCase()).toMatch(/never `?unbuilt`?/);
    });

    test('addresses owner comments', () => {
      expect(section.toLowerCase()).toMatch(/comment/);
    });

    test('writes the verdicts.json entry', () => {
      expect(section).toMatch(/verdicts\.json/);
    });
  });

  describe('Page section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Page'); });

    test('is per view, with the row table and mismatches first', () => {
      expect(section.toLowerCase()).toMatch(/per view/);
      expect(section.toLowerCase()).toMatch(/mismatches first/);
    });

    test('names the environment and fetch time', () => {
      expect(section.toLowerCase()).toMatch(/environment/);
      expect(section.toLowerCase()).toMatch(/fetch time/);
    });

    test('states cross-cutting mismatches once', () => {
      expect(section.toLowerCase()).toMatch(/cross-cutting/);
      expect(section.toLowerCase()).toMatch(/once/);
    });

    test('gives each card its criterion ID as a visible label', () => {
      expect(section.toLowerCase()).toMatch(/criterion id/);
    });
  });

  describe('Safety section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Safety'); });

    test('points at verification.md environment and identity rows', () => {
      expect(section.toLowerCase()).toMatch(/verification\.md/);
      expect(section.toLowerCase()).toMatch(/identity/);
    });

    test('cites S-2 and the must-not-be-touched exception (unreachable even for a read)', () => {
      expect(section).toMatch(/S-2/);
      expect(section.toLowerCase()).toMatch(/must not be touched/);
      expect(section.toLowerCase()).toMatch(/even for a read/);
    });

    test('never writes a credential value, only where it lives (O8)', () => {
      expect(section.toLowerCase()).toMatch(/credential/);
      expect(section.toLowerCase()).toMatch(/never the|never its value/);
    });

    test('forbids self-delegation (constitution: same-type spawn ban)', () => {
      expect(section.toLowerCase()).toMatch(/self-delegat|spawn a copy of yourself|do not spawn/);
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
