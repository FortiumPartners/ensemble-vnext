// ABFV-T001 (audit-before-functional-verification, O1/O6/D17): the seam between /audit-build and
// its two callers, /implement-trd and /verify-build. The commands are prose a model reads, so this
// suite pins the contract in that prose: the flags the callers pass exist in audit-build's
// argument-hint, the RETURN outcomes the callers branch on exist among audit-build's RETURN
// lines, and implement-trd orders defer-close (7.3) before verification (8.3) before
// close-deferred (Step 9). Sections are sliced by heading, never by first textual occurrence:
// `Workflow(verify-functional` also appears earlier, in the Execution Model block (D17).
// Mirror parity is asserted elsewhere (verify-command-surface.test.js); not repeated here.
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const cmd = (name) => fs.readFileSync(path.join(REPO, 'packages/core/commands', name), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const implement = cmd('implement-trd.md');
const verify = cmd('verify-build.md');
const audit = cmd('audit-build.md');

/** Text from the line starting `startHeading` up to (not including) the line starting `endHeading`. */
function section(src, startHeading, endHeading) {
  const start = src.search(new RegExp(`^${startHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = src.slice(start + 1);
  const end = rest.search(new RegExp(`^${endHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
  expect(end).toBeGreaterThanOrEqual(0);
  return src.slice(start, start + 1 + end);
}

const s73 = section(implement, '### 7.3 ', '## Step 8');
const s83 = section(implement, '### 8.3 ', '## Step 9');
const s9 = section(implement, '## Step 9: Completion', '### 9.0a');

const AUDIT_CALL = /Skill\(\{ skill: "audit-build", args: "([^"]*)" \}\)/g;
const calls = (src) => [...src.matchAll(AUDIT_CALL)].map((m) => m[1]);
const hint = audit.split('\n').find((l) => l.startsWith('argument-hint:'));

describe('implement-trd.md orders the audit around functional verification', () => {
  test('7.3 sits between 7.2 and Step 8 and holds the defer-close call', () => {
    expect(implement.indexOf('### 7.2 ')).toBeLessThan(implement.indexOf('### 7.3 '));
    expect(s73).toContain('--chained --defer-close');
    expect(s73).not.toContain('--close-deferred');
  });

  test('8.3 holds the verify-functional dispatch', () => {
    expect(s83).toContain('Workflow({ name: "verify-functional"');
  });

  test('Step 9 holds the close-deferred call', () => {
    expect(s9).toContain('--chained --close-deferred');
  });

  test('the three headings come in order: 7.3, 8.3, Step 9', () => {
    const at = (h) => implement.search(new RegExp(`^${h}`, 'm'));
    const a = at('### 7\\.3 ');
    const b = at('### 8\\.3 ');
    const c = at('## Step 9: Completion');
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('audit-build call sites', () => {
  test.each([['implement-trd.md', implement], ['verify-build.md', verify]])(
    '%s: --chained immediately precedes the mode in every call',
    (_n, src) => {
      const all = calls(src);
      expect(all.length).toBeGreaterThan(0);
      for (const args of all) {
        expect(args).toMatch(/--chained --(defer-close|close-deferred)\b/);
      }
    },
  );

  test('every flag the callers pass appears in audit-build.md argument-hint', () => {
    const flags = new Set();
    for (const args of [...calls(implement), ...calls(verify)]) {
      for (const f of args.match(/--[a-z-]+/g)) flags.add(f);
    }
    expect([...flags].sort()).toEqual(
      expect.arrayContaining(['--chained', '--close-deferred', '--defer-close', '--verified']),
    );
    for (const f of flags) expect(hint).toContain(f);
  });
});

describe('RETURN outcomes the callers branch on exist in audit-build.md', () => {
  const prefixOf = (s) => s.split(/[<…]/)[0].trim();
  const returnLines = [...audit.matchAll(/^\[STATUS: \/audit-build\] RETURN → (.+)$/gm)].map((m) => prefixOf(m[1]));

  // Outcomes each caller branches on, by fixed prefix (templated tails are not compared).
  const branched = {
    'implement-trd.md 7.3': [s73, ['re-audit needed', 'cap reached', 'passed, close deferred']],
    'implement-trd.md Step 9': [s9, ['closed; PR', 'stale: the TRD changed since the audit', 'nothing to close', 'STUCK: close refused:']],
    'verify-build.md': [verify, ['closed; PR', 'stale: the TRD changed since the audit', 'nothing to close', 'STUCK: close refused:']],
  };

  test('audit-build.md lists RETURN lines', () => {
    expect(returnLines.length).toBeGreaterThanOrEqual(9);
  });

  test.each(Object.entries(branched))('%s', (_n, [src, outcomes]) => {
    const text = flat(src);
    for (const o of outcomes) {
      expect(text).toContain(o); // the caller really does branch on it
      expect(returnLines.some((l) => l.startsWith(o))).toBe(true); // and audit-build can return it
    }
  });
});

// AMEND-002: carried-forward verdicts never anchor the close at HEAD.
describe('held-back close drops --verified when verdicts were carried forward', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\s+/g, ' ');
  test('verify-build.md: a --resume or targeted run closes without --verified', () => {
    expect(read('verify-build.md')).toMatch(/a `--resume` or targeted run carried `met` verdicts forward.{0,200}calls without `--verified`/);
  });
  test('implement-trd.md: the --resume --verify path closes without --verified', () => {
    expect(read('implement-trd.md')).toMatch(/except on the `--resume --verify` path.{0,200}calls without `--verified`/);
  });
});
