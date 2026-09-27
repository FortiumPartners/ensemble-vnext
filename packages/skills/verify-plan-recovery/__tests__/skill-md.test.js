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
 * expected keys, and the five named sections exist, in order, headed exactly as the TRD
 * requires. Content assertions check for specific load-bearing terms drawn from the TRD
 * (D4, D12, D13, O1, O2, O6, OQ-2) rather than reproducing the prose itself.
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

  describe('When it applies section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'When it applies'); });

    test('names the four stall outcomes', () => {
      for (const outcome of ['stalled', 'stuck', 'unbuilt', 'insufficient-coverage']) {
        expect(section.toLowerCase()).toContain(outcome);
      }
    });

    test('allows the owner to invoke it with no fresh stall', () => {
      expect(section.toLowerCase()).toMatch(/owner asks|no fresh stall/);
    });
  });

  describe('Inputs section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Inputs'); });

    test('names the verification report', () => {
      expect(section.toLowerCase()).toMatch(/verification-report\.md/);
    });

    test('names the state file', () => {
      expect(section.toLowerCase()).toMatch(/implement\.json|state file/);
    });

    test('names the discovery ledger', () => {
      expect(section.toLowerCase()).toMatch(/discovered\.jsonl/);
    });

    test('names an existing plan as optional input', () => {
      expect(section.toLowerCase()).toMatch(/verification-plan\.md/);
    });

    test('names the PRD and TRD', () => {
      expect(section).toMatch(/PRD/);
      expect(section).toMatch(/TRD/);
    });

    test('names framework-skills.txt', () => {
      expect(section.toLowerCase()).toMatch(/framework-skills\.txt/);
    });
  });

  describe('Conversation section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Conversation'); });

    test('leads with the diagnosis, in plain words', () => {
      expect(section.toLowerCase()).toMatch(/diagnosis/);
      expect(section.toLowerCase()).toMatch(/plain words/);
    });

    test('proposes each plan section with an evidence-based default', () => {
      expect(section.toLowerCase()).toMatch(/default/);
    });

    test('names the stop-rule default proposal of 3 rounds, closed-below 1', () => {
      expect(section).toMatch(/max-rounds:\s*3/);
      expect(section).toMatch(/stop-when-closed-below:\s*1/);
    });

    test('states the stop rule is a proposal the owner accepts or changes', () => {
      expect(section.toLowerCase()).toMatch(/owner accepts|owner decides|the owner (accepts|changes)/);
    });

    test('restricts extra checks to check-role skills', () => {
      expect(section.toLowerCase()).toMatch(/`check`-role|check-role/);
    });

    test('never treats comment text or prior rulings as instructions', () => {
      expect(section.toLowerCase()).toMatch(/data|never treated as instructions/);
    });
  });

  describe('Writes section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Writes'); });

    test('writes verification-plan.md in the TRD section shape', () => {
      expect(section.toLowerCase()).toMatch(/verification-plan\.md/);
      expect(section).toMatch(/## Blockers/);
      expect(section).toMatch(/## Slices/);
      expect(section).toMatch(/## Owner rulings/);
      expect(section).toMatch(/## Accepted as not verifiable/);
      expect(section).toMatch(/## Extra checks/);
      expect(section).toMatch(/## Stop rule/);
    });

    test('writes only on a clear yes from the owner', () => {
      expect(section.toLowerCase()).toMatch(/clear yes/);
    });

    test('writes rulings into the PRD or TRD with a dated changelog line', () => {
      expect(section.toLowerCase()).toMatch(/changelog/);
    });
  });

  describe('Never section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Never'); });

    test('never edits verification.md', () => {
      expect(section).toMatch(/verification\.md/);
      expect(section.toLowerCase()).toMatch(/never edits/);
    });

    test('never writes a credential value', () => {
      expect(section.toLowerCase()).toMatch(/credential/);
    });

    test('never starts --fix', () => {
      expect(section).toMatch(/--fix/);
      expect(section.toLowerCase()).toMatch(/never starts/);
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
