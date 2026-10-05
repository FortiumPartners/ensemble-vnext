'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CORE_PATH = path.join(__dirname, 'docs-audit.md');
const ROOT = path.join(__dirname, '..', '..', '..');
const MIRROR_PATH = path.join(ROOT, '.claude', 'contracts', 'docs-audit.md');
const LINT = path.join(ROOT, 'packages', 'core', 'scripts', 'lint-command-structure.js');

// The workflow prompts cite these headings verbatim (TRD docs-as-built §3.3).
const HEADINGS = [
  'Correct or cut',
  'No banners',
  'Absence must exhibit its search',
  'Missing paths',
  'Other repositories',
  'PRD procedure',
  'TRD procedure',
  'Loose-doc procedure',
  'Where this lives in the code',
  'What you return',
];

describe('docs-audit contract', () => {
  let text;
  beforeAll(() => {
    text = fs.readFileSync(CORE_PATH, 'utf8');
  });

  test('exists in packages/core/contracts and is mirrored byte-for-byte to .claude/contracts', () => {
    expect(fs.existsSync(MIRROR_PATH)).toBe(true);
    expect(fs.readFileSync(MIRROR_PATH, 'utf8')).toBe(text);
  });

  test('carries the ten section headings verbatim, in order', () => {
    let fenced = false;
    const found = [];
    for (const l of text.split('\n')) {
      if (/^```/.test(l)) fenced = !fenced;
      else if (!fenced && /^## /.test(l)) found.push(l.slice(3).trim());
    }
    expect(found).toEqual(HEADINGS);
  });

  test.each([
    ['Correct or cut', ['AC-F7.1', 'AC-F7.2']],
    ['No banners', ['AC-F7.6']],
    ['Missing paths', ['AC-F7.7']],
    ['Other repositories', ['AC-F12.1']],
    ['PRD procedure', ['AC-F4.1', 'AC-F4.3']],
    ['TRD procedure', ['AC-F5.1', 'AC-F5.2']],
    ['Loose-doc procedure', ['AC-F6.1', 'AC-F6.2']],
    ['Where this lives in the code', ['AC-F8.1', 'AC-F8.2']],
  ])('section "%s" names the ACs it implements', (heading, acs) => {
    const start = text.indexOf(`## ${heading}`);
    const rest = text.slice(start + 3);
    const next = rest.search(/\n## /);
    const body = next === -1 ? rest : rest.slice(0, next);
    for (const ac of acs) expect(body).toContain(ac);
  });

  test('passes lint-command-structure.js', () => {
    const r = spawnSync('node', [LINT, CORE_PATH], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
  describe('PRD procedure: behaviour changes and broken non-goals', () => {
    let prd;
    let ret;
    beforeAll(() => {
      const section = (h) => {
        const rest = text.slice(text.indexOf(`## ${h}`) + 3);
        const next = rest.search(/\n## /);
        return next === -1 ? rest : rest.slice(0, next);
      };
      prd = section('PRD procedure');
      ret = section('What you return');
    });

    test('separates a behaviour change from a mechanism change and records it as a changelog row', () => {
      expect(prd).toMatch(/behaviour/i);
      expect(prd).toMatch(/mechanism/i);
      expect(prd).toMatch(/changelog row/i);
    });

    test('appends the row in the existing table\'s columns and forbids a banner word in it', () => {
      expect(prd).toMatch(/existing (version|changelog)?\s*table'?s? columns|columns of the existing/i);
      expect(prd).toMatch(/superseded/i);
      expect(prd).toMatch(/archived/i);
      expect(prd).toMatch(/deprecated/i);
    });

    test('forbids editing a contradicted non-goal and reports it instead', () => {
      expect(prd).toMatch(/non-goal/i);
      expect(prd).toMatch(/do not (edit|correct|rewrite)[^.]*non-goal|non-goal[^.]*(is not|never) (edited|corrected)/i);
      expect(prd).toContain('brokenNonGoals');
    });

    test('no longer says a contradicted requirement is simply corrected', () => {
      expect(prd).not.toContain('| Built differently |');
      expect(prd).not.toContain('checked as claims only where they assert');
    });

    test('What you return names both new fields', () => {
      expect(ret).toContain('behaviourChanges');
      expect(ret).toContain('brokenNonGoals');
    });
  });
});
