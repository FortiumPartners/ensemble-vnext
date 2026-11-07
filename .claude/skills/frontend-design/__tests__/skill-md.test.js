'use strict';

/**
 * Structural tests for packages/skills/frontend-design/SKILL.md (DQ-B003, D13).
 *
 * Line 14 of the skill used to say "reuse beats a bold new look", a fixed rule the
 * design-quality PRD supersedes. The reuse of an existing product's components and tokens
 * stays; how far the look departs is the design direction's departure latitude.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILL_PATH = path.join(__dirname, '..', 'SKILL.md');
const text = fs.readFileSync(SKILL_PATH, 'utf8');
const lines = text.split('\n');

describe('frontend-design SKILL.md', () => {
  test('frontmatter is valid YAML and names the skill', () => {
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    expect(m).not.toBeNull();
    expect(yaml.load(m[1]).name).toBe('frontend-design');
  });

  test('the reuse line keeps components and tokens and names departure latitude', () => {
    const reuse = lines.find((l) => /components and tokens/.test(l));
    expect(reuse).toBeDefined();
    expect(reuse).toMatch(/departure latitude/);
    expect(reuse).toMatch(/design system is silent/);
  });

  test('the superseded fixed rule is gone', () => {
    expect(text).not.toMatch(/reuse beats a bold new look/);
  });
});
