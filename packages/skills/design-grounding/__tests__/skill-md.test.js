'use strict';

/**
 * Structural tests for packages/skills/design-grounding/SKILL.md (DSGN-P004).
 * Scaffolding copied from design-setup's test (parseFrontmatter / sectionHeadingIndexes).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILL_DIR = path.join(__dirname, '..');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const REQUIRED_SECTIONS = ['When it applies', 'Inventory', 'Capture', 'Output'];

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { data: yaml.load(match[1]), body: match[2] };
}

function sectionHeadingIndexes(body) {
  const indexes = {};
  const re = /^#{1,6}\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const title = m[1].trim();
    if (REQUIRED_SECTIONS.includes(title) && !(title in indexes)) indexes[title] = m.index;
  }
  return indexes;
}

describe('packages/skills/design-grounding/SKILL.md', () => {
  let parsed;
  beforeAll(() => {
    parsed = parseFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
  });

  test('frontmatter carries name, description, when_to_use, allowed-tools and is model-invocable', () => {
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed.data).sort()).toEqual(
      ['allowed-tools', 'description', 'name', 'when_to_use']
    );
    expect(parsed.data.name).toBe('design-grounding');
    expect(parsed.data['disable-model-invocation']).toBeUndefined();
  });

  test('required sections exist, in order', () => {
    const idx = sectionHeadingIndexes(parsed.body);
    expect(Object.keys(idx)).toEqual(expect.arrayContaining(REQUIRED_SECTIONS));
    const pos = REQUIRED_SECTIONS.map((n) => idx[n]);
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
  });

  test('no file ships alongside SKILL.md', () => {
    const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() || e.isSymbolicLink()).map((e) => e.name);
    expect(entries).toEqual(['SKILL.md']);
  });

  test('is listed in framework-skills.txt as support', () => {
    const list = fs.readFileSync(path.join(SKILL_DIR, '..', 'framework-skills.txt'), 'utf8');
    expect(list).toMatch(/^design-grounding\s+support\b/m);
  });

  test('covers screens, components, flows and data, per stack (AC-F7.3)', () => {
    for (const t of ['screens', 'components', 'flows', 'data', 'React', 'React Native', 'Next', 'Flutter']) {
      expect(parsed.body).toContain(t);
    }
  });

  test('capture points at existing skills and rules instead of restating them', () => {
    expect(parsed.body).toContain('playwright-automation');
    expect(parsed.body).toContain('verify-design-comparison');
    expect(parsed.body).toContain('verification.md');
  });

  test('names the five grounding files', () => {
    for (const f of ['screens.md', 'components.md', 'flows.md', 'data.md', 'standards.md']) {
      expect(parsed.body).toContain(f);
    }
  });
});
