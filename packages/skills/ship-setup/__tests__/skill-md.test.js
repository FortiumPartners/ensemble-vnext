'use strict';

/**
 * Structural tests for packages/skills/ship-setup/SKILL.md (SHIP-B014) and the workflow
 * template it installs. The skill is a prompt, so these hold the contracts other stages
 * depend on mechanically; they do not judge prose.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const yaml = require('js-yaml');

const SKILL_DIR = path.join(__dirname, '..');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const CORE = path.join(SKILL_DIR, '..', '..', 'core');
const SHIPPED_TEMPLATE = path.join(CORE, 'templates', 'claude-directory', 'rules', 'ship.md');
const WORKFLOW_TEMPLATE = path.join(CORE, 'templates', 'github', 'ensemble-ship-resume.yml');
const SEQUENCER = path.join(CORE, 'lib', 'ship-sequencer.js');
const CONTRACTS = path.join(CORE, 'contracts');
const FRAMEWORK_SKILLS = path.join(SKILL_DIR, '..', 'framework-skills.txt');

const REQUIRED_SECTIONS = [
  'When it applies',
  'Inputs',
  'Topics',
  'Per-step questions',
  'Writing',
  'Never',
  'Readout'
];

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { data: yaml.load(match[1]), body: match[2] };
}

function sectionIndexes(body) {
  const indexes = {};
  const re = /^#{1,6}\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const title = m[1].trim();
    if (REQUIRED_SECTIONS.includes(title) && !(title in indexes)) indexes[title] = m.index;
  }
  return indexes;
}

function parsePolicy(policyText, contractsDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-setup-parse-'));
  try {
    const file = path.join(dir, 'ship.md');
    fs.writeFileSync(file, policyText);
    const args = [SEQUENCER, 'parse', '--policy', file];
    if (contractsDir) args.push('--contracts', contractsDir);
    const r = spawnSync('node', args, { encoding: 'utf8' });
    return JSON.parse(r.stdout.trim());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('packages/skills/ship-setup/SKILL.md', () => {
  let parsed;
  let body;
  beforeAll(() => {
    parsed = parseFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
    body = parsed.body;
  });

  test('frontmatter carries exactly the five keys and name ship-setup', () => {
    expect(Object.keys(parsed.data).sort()).toEqual(
      ['name', 'description', 'when_to_use', 'disable-model-invocation', 'allowed-tools'].sort()
    );
    expect(parsed.data.name).toBe('ship-setup');
  });

  test('disable-model-invocation is true (O2 -- owner-invoked only)', () => {
    expect(parsed.data['disable-model-invocation']).toBe(true);
  });

  test('the sections exist, in the stated order', () => {
    const idx = sectionIndexes(body);
    for (const n of REQUIRED_SECTIONS) expect(Object.keys(idx)).toContain(n);
    const pos = REQUIRED_SECTIONS.map((n) => idx[n]);
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
  });

  test('offers the default string first (D44, J-5)', () => {
    const topics = body.slice(body.indexOf('## Topics'));
    expect(topics).toMatch(/1\.\s+\*\*The default string\.\*\*\s+Offer it first/);
    expect(topics).toMatch(/one\s+answer/);
  });

  test('asks each offered step\'s contract-declared params, reading them from the contract (D34)', () => {
    expect(body).toContain('`params:`');
    expect(body).toContain('`## Input`');
    expect(body).toContain('ship-primitive-<name>.md');
    expect(body).toMatch(/needs no edit here/);
  });

  test('asks rounds (default 2) per repeat and the bar per collect-findings (AC-F2.1)', () => {
    expect(body).toMatch(/`repeat`\*\* — `rounds` \(default 2\)/);
    expect(body).toMatch(/`collect-findings`\*\* — `bar` \(default `significant`\)/);
  });

  test('reads a contract\'s optional ## Setup section (D34)', () => {
    expect(body).toContain('`## Setup`');
    expect(body).toMatch(/optional `## Setup` section/);
  });

  test('release: env, a command only where verification.md section 2 has none, and an identity warning (D11, AC-F4.6)', () => {
    expect(body).toContain('`env`');
    expect(body).toContain('readFullDeploy');
    expect(body).toMatch(/ask only where[\s\S]*returns no\s+command/);
    expect(body).toContain('`identity`');
    expect(body).toMatch(/must report the commit released from this work/);
  });

  test('offers sync-design only when the project has a design', () => {
    expect(body).toContain('docs/ui/*/design-map.json');
    expect(body).toMatch(/`sync-design` is offered only when/);
  });

  test('offers the trigger workflow only with await-approval, and names the secret, never a value (O6, AC-F17.1)', () => {
    expect(body).toMatch(/Asked only when the chosen string contains `await-approval`/);
    expect(body).toContain('ANTHROPIC_API_KEY');
    expect(body).toMatch(/never sees or writes the value/);
  });

  test('never writes a credential value, and writes no file but ship.md and the workflow (O6)', () => {
    const never = body.slice(body.indexOf('## Never'));
    expect(never).toMatch(/Write a credential's value/);
    expect(never).toMatch(/Edit any file other than `\.claude\/rules\/ship\.md`/);
    expect(never).toContain('.claude/settings.json');
  });

  test('re-parses with ship-sequencer.js parse and reports errors in ISSUES', () => {
    expect(body).toContain('node .claude/lib/ship-sequencer.js parse --policy .claude/rules/ship.md');
    expect(body).toMatch(/report each in ISSUES/);
    const cli = fs.readFileSync(SEQUENCER, 'utf8');
    expect(cli).toContain("cmd === 'parse'");
  });

  test('ends with the readout, the banner and notify-complete.sh (O2)', () => {
    expect(body).toContain('STATE / DECISIONS / ISSUES / NEXT');
    expect(body).toContain('═══ COMMAND COMPLETE: /ship-setup ═══');
    expect(body).toContain('.claude/hooks/notify-complete.sh ship-setup complete');
  });

  test('names no primitive list of its own beyond the ones it special-cases (the contracts are the list)', () => {
    expect(body).toMatch(/Never a list held in this skill/);
  });
});

describe('contract parameters are asked with no skill edit (D34)', () => {
  // The skill tells the model to read `params:` from each contract. Prove that reading works for
  // a contract that did not exist when the skill was written: a fixture primitive's parameter is
  // declared in its front matter, found by the same reading, and accepted by the sequencer.
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-setup-fixture-'));
    for (const f of fs.readdirSync(CONTRACTS)) {
      if (f.startsWith('ship-primitive-') && f.endsWith('.md')) {
        fs.copyFileSync(path.join(CONTRACTS, f), path.join(dir, f));
      }
    }
    fs.writeFileSync(
      path.join(dir, 'ship-primitive-widget.md'),
      '---\nprimitive: widget\nparams: gizmo=7\nresults: done\noutward: no\nneeds:\nsection: any\n---\n\n# Primitive: widget\n\nA fixture.\n\n## Input\n\n`gizmo` (default 7).\n'
    );
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the fixture contract\'s params line is readable from its front matter', () => {
    const fm = parseFrontmatter(fs.readFileSync(path.join(dir, 'ship-primitive-widget.md'), 'utf8'));
    expect(fm.data.params).toBe('gizmo=7');
  });

  test('the sequencer accepts the fixture parameter and rejects an undeclared one', () => {
    const ok = parsePolicy('## Ship\n1. widget gizmo=9\n', dir);
    expect(ok.errors).toEqual([]);
    expect(ok.steps[0].params).toEqual({ gizmo: '9' });
    const bad = parsePolicy('## Ship\n1. widget sprocket=1\n', dir);
    expect(bad.errors.join(' ')).toMatch(/unknown parameter "sprocket"/);
  });

  test('every real contract\'s params reading stays a front-matter line the skill can ask from', () => {
    const files = fs.readdirSync(CONTRACTS).filter((f) => /^ship-primitive-.*\.md$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const fm = parseFrontmatter(fs.readFileSync(path.join(CONTRACTS, f), 'utf8'));
      expect(fm).not.toBeNull();
      expect(fm.data).toHaveProperty('params');
    }
  });
});

describe('the default string the skill offers parses (J-5)', () => {
  test('the template\'s default-string example parses against the real contracts with no errors', () => {
    const tpl = fs.readFileSync(SHIPPED_TEMPLATE, 'utf8');
    const m = tpl.match(/default string, which[\s\S]*?```\n([\s\S]*?)```/);
    expect(m).not.toBeNull();
    const r = parsePolicy(m[1].replace('<command that prints the deployed commit>', 'git rev-parse HEAD'));
    expect(r.errors).toEqual([]);
    expect(r.steps.length).toBeGreaterThan(0);
  });
});

describe('template.md and the workflow link', () => {
  test.each([
    ['template.md', SHIPPED_TEMPLATE],
    ['ensemble-ship-resume.yml', WORKFLOW_TEMPLATE]
  ])('%s is a symlink that resolves to the shipped file byte for byte', (name, shipped) => {
    const link = path.join(SKILL_DIR, name);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(link, 'utf8')).toBe(fs.readFileSync(shipped, 'utf8'));
  });

  test('cp -RL dereferences both into real files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-setup-cp-'));
    try {
      const dest = path.join(tmp, 'dest');
      fs.mkdirSync(dest);
      execFileSync('cp', ['-RL', SKILL_DIR, path.join(dest, 'ship-setup')]);
      for (const name of ['template.md', 'ensemble-ship-resume.yml']) {
        const copied = path.join(dest, 'ship-setup', name);
        expect(fs.lstatSync(copied).isSymbolicLink()).toBe(false);
        expect(fs.lstatSync(copied).isFile()).toBe(true);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('ensemble-ship-resume.yml (D35, AC-F17.1)', () => {
  let wf;
  let text;
  beforeAll(() => {
    text = fs.readFileSync(WORKFLOW_TEMPLATE, 'utf8');
    wf = yaml.load(text);
  });

  test('is valid YAML triggered by a submitted pull request review', () => {
    expect(wf.on.pull_request_review.types).toEqual(['submitted']);
  });

  test('runs only for an approval on a branch of this repository', () => {
    const cond = wf.jobs.resume.if;
    expect(cond).toContain("github.event.review.state == 'approved'");
    expect(cond).toContain('github.repository');
  });

  test('runs /ship-build --resume on the PR branch', () => {
    const steps = wf.jobs.resume.steps;
    expect(steps[0].with.ref).toContain('github.event.pull_request.head.ref');
    expect(steps.some((s) => s.with && s.with.prompt === '/ship-build --resume')).toBe(true);
  });

  test('reads its credential from a repository secret and holds no value (O6)', () => {
    expect(text).toContain('${{ secrets.ANTHROPIC_API_KEY }}');
    expect(text).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
    expect(text).not.toMatch(/ghp_[A-Za-z0-9]{8,}/);
  });
});

describe('framework-skills.txt registration (O3)', () => {
  test('has the row "ship-setup support"', () => {
    const rows = fs
      .readFileSync(FRAMEWORK_SKILLS, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => l.trim().split(/\s+/));
    expect(rows).toContainEqual(['ship-setup', 'support']);
  });
});

describe('directory hygiene', () => {
  test('no file ships alongside SKILL.md other than the two links', () => {
    const entries = fs
      .readdirSync(SKILL_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() || e.isSymbolicLink())
      .map((e) => e.name);
    expect(entries.sort()).toEqual(['SKILL.md', 'ensemble-ship-resume.yml', 'template.md']);
  });
});
