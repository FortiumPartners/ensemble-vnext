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

    // Slice the flattened text between two markers, so an assertion is satisfied only by its own
    // section. A match elsewhere in the file (the Step 8 intro, a sibling exit) must not count.
    const between = (from, to) => {
      const start = t.indexOf(from);
      const end = t.indexOf(to, start + from.length);
      if (start < 0 || end < 0) throw new Error(`section markers not found: ${from} .. ${to}`);
      return t.slice(start, end);
    };
    const RECORD = /functional-verification\.js record-not-run/;
    const exits = {
      'no source': between('### 8.1 Resolve the definition', '2. Otherwise (`prd_resolved` is `true`'),
      'no definition': between('Still absent \u2192 record', 'Present \u2192 first record'),
      'blocking policy does not parse': between("**Read the owner's blocking policy", '7. **Resolve `setupTargets`'),
    };

    test('the no-source exit calls the record-not-run subcommand with its reason', () => {
      expect(exits['no source']).toMatch(RECORD);
      expect(exits['no source']).toContain('--reason "no success definition derivable"');
    });

    test('the no-definition exit calls the record-not-run subcommand with its reason', () => {
      expect(exits['no definition']).toMatch(RECORD);
      expect(exits['no definition']).toContain('--reason "<no definition produced');
    });

    test('the blocking-policy exit is recorded through record-not-run, with its own outcome', () => {
      const e = exits['blocking policy does not parse'];
      expect(e).toMatch(/recorded through `record-not-run`/);
      expect(e).toContain('not-run-blocking-policy');
    });

    test('the Step 8 intro lists the exits as recorded through record-not-run', () => {
      expect(between('**The loop is not substitutable.**', '**First, the run-limit check')).toMatch(
        /recorded through `record-not-run`/
      );
    });

    test('no hand-built report', () => {
      expect(t).not.toMatch(/fv-report-input/);
    });

    test('the derive source goes by file path, never pasted', () => {
      // §3.6's background dispatch and §8.1's foreground re-derive each name the path themselves.
      const dispatch = between('### 3.6 Dispatch the background', '### 3.6a');
      expect(dispatch).toContain('.trd-state/<feature>/derive-source.md');
      expect(dispatch).toMatch(/never pasted/);
      expect(between('**Absent', 'Still absent')).toContain('.trd-state/<feature>/derive-source.md');
    });

    test('the derive dispatch is recorded and an absent definition is re-derived once', () => {
      expect(t).toContain('derive_dispatched: true');
      expect(t).toMatch(/re-derive ONCE, in the foreground/);
    });

    test('Step 8 states the loop is not substitutable', () => {
      expect(t).toContain('The loop is not substitutable');
      expect(t).toMatch(/Playwright script/);
    });

    test('the readout tells the owner why verification did not run, sourced from read-outcome', () => {
      expect(t).toContain('"Verification did not run: {reason}."');
      expect(t).toMatch(/the `reason` that `read-outcome --state-dir \.trd-state\/<feature>` prints/);
      // an interrupted run's state holds no reason, so it falls back to the report's Reason line
      expect(t).toMatch(/prints `outcome: null`[^]*the `\*\*Reason\*\*:` line of `verification-report\.md`/);
      expect(t).toMatch(/Never leave a not-run to be inferred from a missing report/);
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
