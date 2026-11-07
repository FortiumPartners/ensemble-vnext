'use strict';

/**
 * Structural tests for packages/skills/design-setup/SKILL.md (DSGN-P001).
 *
 * These do not judge prose quality (the skill is a prompt, not code) -- they hold the
 * contracts other stages depend on mechanically:
 *   1. Frontmatter is valid YAML, carries `disable-model-invocation: true` (D1), and the
 *      other keys the TRD's §3.5 names.
 *   2. The six named sections exist, in order, headed exactly as the TRD requires.
 *   3. The functional-verification.js subcommands it names are real subcommands.
 *   4. `template.md` resolves (through its symlink) to the shipped template (D5).
 *
 * Parsing approach (parseFrontmatter / sectionHeadingIndexes) is copied from
 * packages/skills/verify-data-fidelity/__tests__/skill-md.test.js rather than reimplemented
 * (DSGN-P001 grounding: Reuse).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SKILL_DIR = path.join(__dirname, '..');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const TEMPLATE_PATH = path.join(SKILL_DIR, 'template.md');
const SHIPPED_TEMPLATE_PATH = path.join(
  SKILL_DIR,
  '..',
  '..',
  'core',
  'templates',
  'claude-directory',
  'rules',
  'design.md'
);

const REQUIRED_SECTIONS = [
  'When it applies',
  'Inputs',
  'Topics',
  'Writing',
  'Never',
  'Readout'
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
  // Matches an ATX heading whose text is exactly one of the required names, e.g. "## Never"
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

describe('packages/skills/design-setup/SKILL.md', () => {
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

  test('frontmatter carries exactly name, description, when_to_use, disable-model-invocation, allowed-tools', () => {
    const keys = Object.keys(parsed.data).sort();
    expect(keys).toEqual(
      ['name', 'description', 'when_to_use', 'disable-model-invocation', 'allowed-tools'].sort()
    );
  });

  test('frontmatter name is design-setup', () => {
    expect(parsed.data.name).toBe('design-setup');
  });

  test('offers 4.5:1 and 44 px as a default and records the owner answer (AC-F1.6)', () => {
    expect(parsed.body).toContain('4.5:1');
    expect(parsed.body).toContain('44 px');
    expect(parsed.body).toContain('records the owner');
  });

  test('sign-in points at verification.md section 3 and the template has no credential field', () => {
    expect(parsed.body).toContain('verification.md');
    const tpl = fs.readFileSync(SHIPPED_TEMPLATE_PATH, 'utf8');
    expect(tpl).toContain('verification.md` §3');
    expect(tpl).not.toMatch(/password|secret|api[ _-]?key/i);
  });

  test('template has the four sections (AC-F1.1 to AC-F1.4)', () => {
    const tpl = fs.readFileSync(SHIPPED_TEMPLATE_PATH, 'utf8');
    for (const h of ['## 1. Design system', '## 2. Per platform', '## 3. How to reach a screen', '## 4. Design rules']) {
      expect(tpl).toContain(h);
    }
    for (const f of ['namespace', 'Source of truth', 'Build command', 'Board component kind', 'Tokens source', 'Component library paths', 'Viewport sizes', 'Route list', 'Capture command', 'screenshots live', 'Reuse', 'Process rules']) {
      expect(tpl).toContain(f);
    }
    expect(tpl).not.toContain('Competitor references');
  });

  test('template has the design direction section with four fields and three levels (AC-F1.1, AC-F1.4, D5)', () => {
    const tpl = fs.readFileSync(SHIPPED_TEMPLATE_PATH, 'utf8');
    const s5 = tpl.slice(tpl.indexOf('## 5. Design direction'));
    expect(s5).not.toBe('');
    for (const f of ['Brand', 'Style pack', 'References', 'Departure latitude']) expect(s5).toContain(f);
    for (const l of ['`keep`', '`refine`', '`rethink`']) expect(s5).toContain(l);
    expect(tpl).toContain("Reuse:** the design system's components and tokens; a new component needs a reason");
    expect(tpl).toContain("§5's departure latitude");
    expect(tpl).not.toContain('the commands stop and name it rather than guess');
  });

  test('SKILL.md has a fifth Design direction topic with a default per field (AC-F1.2, AC-F1.7)', () => {
    const body = parsed.body;
    expect(body).toMatch(/5\. \*\*§5 Design direction\*\*/);
    expect(body).toContain('available_packs');
    expect(body).toMatch(/Departure latitude[\s\S]*Default: `refine`/);
    expect(body).toContain('contrast <n>:1, targets <n> px');
    expect(body).not.toMatch(/competitor references,/);
  });

  test('disable-model-invocation is true (D1 -- owner-invoked only)', () => {
    expect(parsed.data['disable-model-invocation']).toBe(true);
  });

  test('the six sections exist, headed exactly as named', () => {
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

  describe('template.md (D5)', () => {
    test('exists and is a symlink', () => {
      expect(fs.existsSync(TEMPLATE_PATH)).toBe(true);
      const stat = fs.lstatSync(TEMPLATE_PATH);
      expect(stat.isSymbolicLink()).toBe(true);
    });

    test('resolves to the shipped template, byte-for-byte', () => {
      expect(fs.existsSync(SHIPPED_TEMPLATE_PATH)).toBe(true);
      const linked = fs.readFileSync(TEMPLATE_PATH, 'utf8');
      const shipped = fs.readFileSync(SHIPPED_TEMPLATE_PATH, 'utf8');
      expect(linked).toBe(shipped);
    });

    test('cp -RL (the scaffolding mechanism) dereferences it into a real file, never a link', () => {
      const os = require('os');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-setup-cp-'));
      try {
        const { execFileSync } = require('child_process');
        const destParent = path.join(tmp, 'dest');
        fs.mkdirSync(destParent);
        execFileSync('cp', ['-RL', SKILL_DIR, path.join(destParent, 'design-setup')]);
        const copiedTemplate = path.join(destParent, 'design-setup', 'template.md');
        expect(fs.lstatSync(copiedTemplate).isSymbolicLink()).toBe(false);
        expect(fs.lstatSync(copiedTemplate).isFile()).toBe(true);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('directory hygiene', () => {
    test('no file ships alongside SKILL.md other than template.md', () => {
      const entries = fs.readdirSync(SKILL_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() || e.isSymbolicLink())
        .map((e) => e.name);
      expect(entries.sort()).toEqual(['SKILL.md', 'template.md'].sort());
    });
  });

  test("§4's reuse default is the template's reuse rule, offered over the old 'existing view' wording (AC-F4.1)", () => {
    const flat = (t) => t.replace(/\s+/g, ' ');
    const tmpl = fs.readFileSync(SHIPPED_TEMPLATE_PATH, 'utf8');
    const rule = tmpl.match(/^- \*\*Reuse:\*\* (.+)$/m)[1].trim();
    expect(rule).toMatch(/components and tokens/);
    expect(rule).toMatch(/departure latitude/);
    const skill = flat(readSkill());
    expect(skill).toContain(`**Reuse** — default: "${flat(rule)}"`);
    expect(skill).toMatch(/even when the current file still carries the old wording \("an existing view beats a new one"\)/);
  });
});
