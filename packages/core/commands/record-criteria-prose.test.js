'use strict';

// re-prove-only-what-a-change-can-affect FIX-004: pins the command prose that records each proven
// criterion's covers, the CLI line it names (run for real against a copy of a finished feature's
// state), and the docs that name ensemble.reproof. Same standing as the other *-prose tests.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const implement = flat(read('packages/core/commands/implement-trd.md'));
const verify = flat(read('packages/core/commands/verify-build.md'));
const gate = flat(read('packages/core/contracts/ship-custody-gate.md'));
const guide = flat(read('docs/guides/ship-build.md'));

const CLI = 'node .claude/lib/live-evidence.js record-criteria';

describe('record-criteria command prose', () => {
  test.each([
    ['implement-trd Step 8.4', implement],
    ['verify-build outcome step', verify],
  ])('%s runs record-criteria once and treats a failure as an ISSUES line, never STUCK', (_n, t) => {
    expect(t).toContain(CLI);
    expect(t).toMatch(/--state-dir <[^>]+> --trd <[^>]+> --definition <[^>]+>/);
    expect(t).toMatch(/a failure is one ISSUES line, never STUCK/i);
  });

  test('mirrors are byte copies', () => {
    for (const p of ['commands/implement-trd.md', 'commands/verify-build.md', 'contracts/ship-custody-gate.md']) {
      expect(read(`.claude/${p}`)).toBe(read(`packages/core/${p}`));
    }
  });

  test('the CLI line, run against a copy of a finished feature, records every must-pass criterion', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
    try {
      const feature = 'ci-baseline-check';
      const stateDir = path.join(tmp, '.trd-state', feature);
      fs.mkdirSync(path.dirname(stateDir), { recursive: true });
      fs.mkdirSync(stateDir, { recursive: true });
      for (const f of ['verification-state.json', 'success-definition.md']) {
        fs.copyFileSync(path.join(__dirname, '__fixtures__', feature, f), path.join(stateDir, f));
      }
      fs.mkdirSync(path.join(tmp, 'docs', 'TRD'), { recursive: true });
      fs.copyFileSync(path.join(REPO, 'docs/TRD', `${feature}.md`), path.join(tmp, 'docs/TRD', `${feature}.md`));
      const r = spawnSync('node', [
        path.join(REPO, '.claude/lib/live-evidence.js'), 'record-criteria',
        '--state-dir', `.trd-state/${feature}`, '--trd', `docs/TRD/${feature}.md`,
        '--definition', `.trd-state/${feature}/success-definition.md`,
      ], { cwd: tmp, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout.trim());
      const file = path.join(stateDir, 'evidence', 'criterion-covers.json');
      expect(fs.existsSync(file)).toBe(true);
      const recs = JSON.parse(fs.readFileSync(file, 'utf8')).criteria;

      // Every must-pass criterion (the definition's last-column mark) that was met has a record.
      const defn = fs.readFileSync(path.join(stateDir, 'success-definition.md'), 'utf8');
      const mustPass = defn.split('\n').filter((l) => /^\|\s*FS-\d+\s*\|/.test(l))
        .filter((l) => { const c = l.split('|'); return (c[c.length - 2] || '').trim() !== ''; })
        .map((l) => l.split('|')[1].trim());
      expect(mustPass.length).toBeGreaterThan(0);
      for (const id of mustPass) expect(Object.keys(recs)).toContain(id);
      expect(out.recorded.sort()).toEqual(Object.keys(recs).sort());
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('ensemble.reproof documentation', () => {
  test.each([
    ['ship-custody-gate step 4', gate],
    ['ship-build guide', guide],
  ])('%s names the setting, its defaults and the move rules', (_n, t) => {
    expect(t).toContain('ensemble.reproof');
    expect(t).toContain('tier-none');
    expect(t).toContain('tier-ci');
    expect(t).toMatch(/docs[^.]*`none`/);
  });

  test('the guide lists every key with its default', () => {
    for (const k of ['docs', 'testOnly', 'ciConfig', 'deps', 'depsReprove', 'format', 'shipped']) {
      expect(guide).toContain(`\`${k}\``);
    }
  });
});
