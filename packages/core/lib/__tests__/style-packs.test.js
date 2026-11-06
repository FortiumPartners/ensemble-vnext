'use strict';

/**
 * Structural tests for the six style packs (DQ-B002, AC-F2.4, D7):
 * packages/skills/style-pack-<slug>/SKILL.md. One loop over the six directories, kept here so
 * no per-pack __tests__ folder ships into every project.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILLS = path.join(__dirname, '..', '..', '..', 'skills');
const SLUGS = ['clean-product', 'dense-enterprise', 'expressive-editorial',
  'playful-consumer', 'modern-consumer', 'modern-b2b-saas'];
const SECTIONS = ['The look', 'Do and don\'t', 'Within the design system'];

function parse(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  return m ? { data: yaml.load(m[1]), body: m[2] } : null;
}

describe.each(SLUGS)('style-pack-%s', (slug) => {
  const dir = path.join(SKILLS, `style-pack-${slug}`);
  let parsed;
  beforeAll(() => { parsed = parse(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')); });

  test('frontmatter: name, description, owner-only invocation', () => {
    expect(parsed).not.toBeNull();
    expect(parsed.data.name).toBe(`style-pack-${slug}`);
    expect(typeof parsed.data.description).toBe('string');
    expect(parsed.data.description.length).toBeGreaterThan(20);
    expect(parsed.data['disable-model-invocation']).toBe(true);
  });

  test('the three sections exist, in order', () => {
    const heads = [...parsed.body.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]);
    const pos = SECTIONS.map((s) => heads.indexOf(s));
    pos.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  test('states it never overrides a token or replaces a component', () => {
    expect(parsed.body).toMatch(/never overrides a token/);
    expect(parsed.body).toMatch(/replaces a component/);
    expect(parsed.body).toMatch(/departure latitude/);
  });

  test('no executable code and nothing else ships beside SKILL.md', () => {
    expect(parsed.body).not.toMatch(/^```/m);
    expect(fs.readdirSync(dir)).toEqual(['SKILL.md']);
  });
});

test('modern-consumer names Spotify; modern-b2b-saas says not too rounded, dark, compact', () => {
  const read = (s) => fs.readFileSync(path.join(SKILLS, `style-pack-${s}`, 'SKILL.md'), 'utf8');
  expect(read('modern-consumer')).toMatch(/Spotify/);
  const b2b = read('modern-b2b-saas');
  expect(b2b).toMatch(/not too rounded/i);
  expect(b2b).toMatch(/dark/i);
  expect(b2b).toMatch(/compact/i);
});
