'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CORE = path.join(__dirname, 'rerun-scope.md');
const MIRROR = path.join(ROOT, '.claude', 'contracts', 'rerun-scope.md');
const COMMANDS = ['verify-build', 'refine-verification', 'audit-build', 'ship-build', 'implement-trd'];

describe('rerun-scope contract', () => {
  let text;
  beforeAll(() => {
    text = fs.readFileSync(CORE, 'utf8');
  });

  test('exists in both packages/core/contracts and .claude/contracts, byte-identical', () => {
    expect(fs.existsSync(MIRROR)).toBe(true);
    expect(fs.readFileSync(MIRROR, 'utf8')).toBe(text);
  });

  test('states the three scopes and the quality floor', () => {
    expect(text).toMatch(/\*\*none\*\*/);
    expect(text).toMatch(/\*\*targeted\*\*/);
    expect(text).toMatch(/\*\*full\*\*/);
    expect(text).toMatch(/always re-checked/);
    expect(text).toMatch(/cannot be read/);
  });

  test.each([
    ['/verify-build', /satisfied/],
    ['/ship-build custody re-proof', /custody anchor/],
    ['/ship-build CI rerun', /last green CI run/],
    ['/audit-build re-audit', /auditedCommit/],
    ['/implement-trd phase gate', /last green phase gate/],
  ])('names the anchor for %s', (name, re) => {
    const row = text.split('\n').find((l) => l.startsWith('|') && l.includes(name.split(' ')[0]) && re.test(l));
    expect(row).toBeDefined();
  });

  test('says how the choice appears in the readout', () => {
    expect(text).toMatch(/DECISIONS/);
    expect(text).toContain('Rerun scope: targeted.');
  });

  test('says what to do when unsure: ask interactively, COMMAND STUCK unattended, never default to full', () => {
    expect(text).toMatch(/Do not default to `full`/);
    expect(text).toMatch(/Interactive/);
    expect(text).toMatch(/one question with the scope you would take as the default/);
    expect(text).toMatch(/Unattended/);
    expect(text).toContain('COMMAND STUCK');
    expect(text).toMatch(/proposed default/);
  });

  test('leaves the four mechanism fixes to their own issues', () => {
    for (const n of ['#153', '#154', '#155', '#156']) expect(text).toContain(n);
  });

  test.each(COMMANDS)('%s reads the contract (both copies)', (c) => {
    for (const dir of [path.join(ROOT, 'packages', 'core', 'commands'), path.join(ROOT, '.claude', 'commands')]) {
      expect(fs.readFileSync(path.join(dir, `${c}.md`), 'utf8')).toContain('rerun-scope');
    }
  });

  test('the custody gate and wait-ci contracts reference it', () => {
    for (const f of ['ship-custody-gate.md', 'ship-primitive-wait-ci.md']) {
      expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).toContain('rerun-scope');
      expect(fs.readFileSync(path.join(ROOT, '.claude', 'contracts', f), 'utf8')).toContain('rerun-scope');
    }
  });

  test('/verify-build continues a restarted run from verification-state.json', () => {
    const vb = fs.readFileSync(path.join(ROOT, 'packages', 'core', 'commands', 'verify-build.md'), 'utf8');
    expect(vb).toMatch(/restarted session continues, it does not start over/);
    expect(vb).toMatch(/`outcome` is `null`/);
  });

  test('the helper is mirrored into .claude/lib', () => {
    expect(fs.readFileSync(path.join(ROOT, '.claude', 'lib', 'rerun-scope.js'), 'utf8')).toBe(
      fs.readFileSync(path.join(ROOT, 'packages', 'core', 'lib', 'rerun-scope.js'), 'utf8')
    );
  });
});
