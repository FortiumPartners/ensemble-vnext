'use strict';

/**
 * Structural tests for packages/skills/designing-on-canvas/SKILL.md (DSGN-P004).
 * Scaffolding copied from design-setup's test (parseFrontmatter / sectionHeadingIndexes).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILL_DIR = path.join(__dirname, '..');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const REQUIRED_SECTIONS = ['When it applies', 'Conventions', 'Canvas rules arrive live', 'Never'];

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

describe('packages/skills/designing-on-canvas/SKILL.md', () => {
  let parsed;
  beforeAll(() => {
    parsed = parseFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
  });

  test('frontmatter carries name, description, when_to_use, allowed-tools and is model-invocable', () => {
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed.data).sort()).toEqual(
      ['allowed-tools', 'description', 'name', 'when_to_use']
    );
    expect(parsed.data.name).toBe('designing-on-canvas');
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
    expect(list).toMatch(/^designing-on-canvas\s+support\b/m);
  });

  test('lists exactly the seven AC-F7.1 conventions', () => {
    const body = parsed.body;
    for (const t of ['x-import', 'dc-import', 'is_interactive', 'data-props', 'pages', 'NN-name', 'title', 'inline cop']) {
      expect(body).toContain(t);
    }
    const section = body.split(/^## Conventions$/m)[1].split(/^## /m)[0];
    expect((section.match(/^\d+\. /gm) || []).length).toBe(7);
  });

  test('says the rules come live from the Design type, via a canvas url, and are not in the skill (AC-F7.2, NG4)', () => {
    expect(parsed.body).toContain('artifact-type/reference/');
    expect(parsed.body).toMatch(/type_url[^\n]*(only|just)[^\n]*SKILL\.md/);
    expect(parsed.body).toMatch(/never copied|not copied|not in this skill/i);
  });

  test('leaves local renders to our code, not the drawing agent (AC-F3.6)', () => {
    expect(parsed.body).toContain('design-render.js');
  });
});
