'use strict';

/**
 * Structural tests for packages/skills/verification-setup/SKILL.md (VSET-B004).
 *
 * These do not judge prose quality (the skill is a prompt, not code) -- they hold the
 * contracts other stages depend on mechanically:
 *   1. Frontmatter is valid YAML, carries `disable-model-invocation: true` (D1), and the
 *      other keys the TRD's §3.5 names.
 *   2. The seven named sections exist, in order, headed exactly as the TRD requires.
 *   3. The functional-verification.js subcommands it names are real subcommands.
 *   4. `template.md` resolves (through its symlink) to the shipped template (D5).
 *
 * Parsing approach (parseFrontmatter / sectionHeadingIndexes) is copied from
 * packages/skills/verify-data-fidelity/__tests__/skill-md.test.js rather than reimplemented
 * (VSET-B004 grounding: Reuse).
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
  'verification.md'
);

const REQUIRED_SECTIONS = [
  'When it applies',
  'Inputs',
  'Topics',
  'Coverage floor',
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

describe('packages/skills/verification-setup/SKILL.md', () => {
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

  test('frontmatter name is verification-setup', () => {
    expect(parsed.data.name).toBe('verification-setup');
  });

  test('disable-model-invocation is true (D1 -- owner-invoked only)', () => {
    expect(parsed.data['disable-model-invocation']).toBe(true);
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

  describe('CLI subcommands the skill tells the model to run', () => {
    // A renamed or removed subcommand would leave the skill instructing a call that fails.
    const CLI_PATH = path.join(SKILL_DIR, '..', '..', 'core', 'lib', 'functional-verification.js');
    const cli = fs.readFileSync(CLI_PATH, 'utf8');

    test.each([
      'check-verification-unfilled',
      'read-coverage-floor',
      'recommend-coverage-floor',
      'read-never-unattended'
    ])(
      '%s is named by the skill and dispatched by functional-verification.js',
      (name) => {
        expect(parsed.body).toContain(name);
        expect(cli).toContain(`subcommand === '${name}'`);
      }
    );
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
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-setup-cp-'));
      try {
        const { execFileSync } = require('child_process');
        const destParent = path.join(tmp, 'dest');
        fs.mkdirSync(destParent);
        execFileSync('cp', ['-RL', SKILL_DIR, path.join(destParent, 'verification-setup')]);
        const copiedTemplate = path.join(destParent, 'verification-setup', 'template.md');
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
});
