'use strict';
// fix-implement-skips-verification-loop FIX-005: pins the prose of /implement-trd, /plan and
// /verify-build that makes a skipped verification loop visible and unsubstitutable. The commands
// are prompts, so the wording is the behaviour. Each file must also match its .claude/ twin.
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const load = (name) => {
  const core = fs.readFileSync(path.join(REPO, 'packages/core/commands', name), 'utf8');
  const vendored = fs.readFileSync(path.join(REPO, '.claude/commands', name), 'utf8');
  return { core, vendored, flat: core.replace(/\s+/g, ' ') };
};
const implement = load('implement-trd.md');
const plan = load('plan.md');
const verify = load('verify-build.md');

describe('verification not-run prose', () => {
  test.each([
    ['implement-trd.md', implement],
    ['plan.md', plan],
    ['verify-build.md', verify],
  ])('%s matches its vendored copy byte for byte', (_n, f) => {
    expect(f.vendored).toBe(f.core);
  });

  describe('implement-trd.md', () => {
    const t = implement.flat;

    test('not-run exits go through the record-not-run subcommand, not a hand-built report', () => {
      expect((t.match(/functional-verification\.js record-not-run/g) || []).length).toBeGreaterThanOrEqual(2);
      expect(t).toMatch(/recorded through `record-not-run`/);
      expect(t).not.toMatch(/fv-report-input/);
    });

    test('the derive source goes by file path, never pasted', () => {
      expect(t).toContain('.trd-state/<feature>/derive-source.md');
      expect(t).toMatch(/never pasted/);
    });

    test('the derive dispatch is recorded and an absent definition is re-derived once', () => {
      expect(t).toContain('derive_dispatched: true');
      expect(t).toMatch(/re-derive ONCE, in the foreground/);
    });

    test('Step 8 states the loop is not substitutable', () => {
      expect(t).toContain('The loop is not substitutable');
      expect(t).toMatch(/Playwright script/);
    });

    test('closing reads the outcome from disk and requires satisfied and fresh', () => {
      expect(t).toContain('functional-verification.js read-outcome --state-dir');
      expect(t).toContain('outcome: "satisfied"');
      expect(t).toContain('fresh: true');
    });
  });

  describe('plan.md', () => {
    test('the chained run takes verification from /implement-trd, not a check of its own', () => {
      expect(plan.flat).toMatch(/nothing substitutes for it/);
      expect(plan.flat).toMatch(/Playwright script/);
      expect(plan.flat).toMatch(/never from a check run here/);
    });
  });

  describe('verify-build.md', () => {
    test('3a passes the derive source by file path, never pasted', () => {
      expect(verify.flat).toContain('.trd-state/<feature>/derive-source.md');
      expect(verify.flat).toMatch(/never the pasted text/);
      expect(verify.flat).not.toContain('+ <the source> +');
    });
  });
});
