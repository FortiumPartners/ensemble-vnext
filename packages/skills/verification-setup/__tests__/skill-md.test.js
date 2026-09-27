'use strict';

/**
 * Structural tests for packages/skills/verification-setup/SKILL.md (VSET-B004).
 *
 * These do not judge prose quality (the skill is a prompt, not code) -- they hold the
 * contracts other stages depend on mechanically:
 *   1. Frontmatter is valid YAML, carries `disable-model-invocation: true` (D1), and the
 *      other keys the TRD's §3.5 names.
 *   2. The seven named sections exist, in order, headed exactly as the TRD requires.
 *   3. `template.md` resolves (through its symlink) to the shipped template (D5).
 *
 * Parsing approach (parseFrontmatter / sectionHeadingIndexes / sectionBody) is copied from
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

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
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

  describe('Topics section (D3)', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Topics'); });

    test('states the eight topics in file order', () => {
      expect(section).toMatch(/§1 Environments/);
      expect(section).toMatch(/§1a Resource capacity/);
      expect(section).toMatch(/§2 Refresh and deploy/);
      expect(section).toMatch(/§3 Test identities/);
      expect(section).toMatch(/§4 Tooling/);
      expect(section).toMatch(/§5 What cannot be verified here/);
      expect(section).toMatch(/§5a Coverage floor/);
      expect(section).toMatch(/§6 Multi-repo/);
    });

    test('states the re-run rule: only ask what is missing, stale, or a recorded need names', () => {
      expect(section.toLowerCase()).toMatch(/re-run/);
      expect(section.toLowerCase()).toMatch(/missing/);
      expect(section.toLowerCase()).toMatch(/differs|out of date|stale/);
      expect(section.toLowerCase()).toMatch(/recorded need/);
    });

    test('states the "keep" rule (D2): keep or skipping leaves the section untouched', () => {
      expect(section).toMatch(/"keep"/);
      expect(section.toLowerCase()).toMatch(/untouched/);
    });
  });

  describe('Coverage floor section (D6)', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Coverage floor'); });

    test('shows the recommendation with its working (which run, and the rounding)', () => {
      expect(section.toLowerCase()).toMatch(/lowest/);
      expect(section.toLowerCase()).toMatch(/round(ed|ing)/);
    });

    test('handles no eligible run, and accepts any answer including none', () => {
      expect(normalizeWhitespace(section.toLowerCase())).toMatch(/no floor recommended yet/);
      expect(normalizeWhitespace(section)).toMatch(/`none`/);
    });
  });

  describe('Writing section (D2)', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Writing'); });

    test('states there is no preview step and no second confirmation', () => {
      const normalized = normalizeWhitespace(section.toLowerCase());
      expect(normalized).toMatch(/no preview/);
      expect(normalized).toMatch(/no (second )?confirmation/);
    });

    test('re-runs check-verification-unfilled and read-coverage-floor after writing', () => {
      expect(section).toMatch(/check-verification-unfilled/);
      expect(section).toMatch(/read-coverage-floor/);
    });
  });

  describe('Never section', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Never'); });

    test('forbids writing a credential value (D4/O2 -- locations only)', () => {
      expect(section.toLowerCase()).toMatch(/credential/);
      expect(section.toLowerCase()).toMatch(/never a password|value/);
    });

    test('forbids contacting or probing an environment (D4)', () => {
      expect(section.toLowerCase()).toMatch(/contact or probe/);
    });

    test('forbids editing any file other than verification.md', () => {
      expect(section).toMatch(/verification\.md/);
      expect(section.toLowerCase()).toMatch(/any file other than/);
    });

    test('forbids starting a verification run or any other command (O3 scope)', () => {
      expect(section.toLowerCase()).toMatch(/start a verification run/);
      expect(section.toLowerCase()).toMatch(/any other command/);
    });
  });

  describe('Inputs section (D4, D12)', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Inputs'); });

    test('names key names only for .env* files (D4)', () => {
      expect(section).toMatch(/\.env\*/);
      expect(section.toLowerCase()).toMatch(/key names only/);
    });

    test('names the discovered.jsonl ledger rows (D12)', () => {
      expect(section).toMatch(/discovered\.jsonl/);
    });
  });

  describe('Readout section (D18)', () => {
    let section;
    beforeAll(() => { section = sectionBody(parsed.body, 'Readout'); });

    test('names the four standard readout sections', () => {
      expect(section).toMatch(/STATE/);
      expect(section).toMatch(/DECISIONS/);
      expect(section).toMatch(/ISSUES/);
      expect(section).toMatch(/NEXT/);
    });

    test('names the COMMAND COMPLETE banner and the notify-complete.sh call', () => {
      expect(section).toMatch(/COMMAND COMPLETE: \/verification-setup/);
      expect(section).toMatch(/notify-complete\.sh/);
    });
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
