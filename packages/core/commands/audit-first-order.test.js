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

// FS-6 (verification run, 2026-11-16): a Skill call runs /audit-build inline in the caller's turn,
// so no tool result carries its RETURN line; a run that recorded `audit.return` in implement.json
// and never printed the line was observed. Both sides must say the line is printed as text.
describe('the caller-only RETURN line is printed even when the audit runs inline', () => {
  const callerModes = flat(section(audit, '## Caller-only modes', '### `--chained --defer-close`'));
  const discipline = flat(section(audit, '## Output discipline', '**End your final turn'));

  test('audit-build.md: caller-only modes say to print the RETURN line as its own line of text', () => {
    expect(callerModes).toContain('**Print it, every time, as its own line of your reply text.**');
    expect(callerModes).toContain('runs this command inline, in the caller\'s own session and turn');
    expect(callerModes).toContain('does not replace the line');
    expect(discipline).toContain('printed as its own line of text even when the run is inline in its caller\'s turn');
  });

  test('implement-trd.md 7.3: print each call\'s RETURN line before the ledger read and the implement.json write', () => {
    const t = flat(s73);
    const print = t.indexOf('**The skill runs inline in this turn, so printing that line is your job:');
    expect(print).toBeGreaterThanOrEqual(0);
    expect(print).toBeLessThan(t.indexOf('audit-rounds.js pending-close'));
    expect(print).toBeLessThan(t.indexOf('**Write the result into `implement.json`'));
    expect(t).toContain('a return recorded with no printed line does not replace it');
  });

  test('implement-trd.md Step 9: the close-deferred RETURN line is printed before it is branched on', () => {
    expect(flat(s9)).toContain('Print its one RETURN line as text, as at §7.3, then branch on it:');
  });

  test('verify-build.md held-back close: the close-deferred RETURN line is printed as text before it is branched on', () => {
    const t = flat(section(verify, '**The held-back close (D11).**', 'Which runs may close'));
    expect(t).toContain('Print its one RETURN line as text, as at implement-trd §7.3, then branch on it:');
  });
});

// AMEND-002 / AMEND-004: carried-forward verdicts never anchor the close at HEAD. The rule lives in
// model-read prose, so the pins slice each caller's close section by markers and check structure:
// every `--verified` call sits in a block that also excludes carried-forward runs, and every
// carried-forward path names a call or instruction without `--verified`. A loose `.{0,N}` window
// would still pass if an unconditional `--verified` call were re-added beside the sentence.
describe('held-back close drops --verified when verdicts were carried forward', () => {
  /** Raw text from `startMarker` up to (not including) `endMarker`; both must exist, in order. */
  function between(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf(endMarker, start + startMarker.length);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }
  /** Paragraphs and bullets: a block is the unit "its own bullet or paragraph" means. */
  const blocks = (text) =>
    text.split(/\n\s*\n/).flatMap((p) => p.split(/\n(?=\s*- )/)).map(flat);
  const VERIFIED_CALL = /Skill\(\{ skill: "audit-build", args: "[^"]*--close-deferred --verified" \}\)/g;
  const BARE_CALL = /Skill\(\{ skill: "audit-build", args: "[^"]*--close-deferred" \}\)/g;
  const verifiedBlocks = (text) => blocks(text).filter((b) => b.match(VERIFIED_CALL));

  const vbClose = between(verify, '**The held-back close (D11).**', 'Which runs may close');
  const vbRuns = between(verify, 'Which runs may close', '**When the outcome is `stalled`');
  const vbStep6 = between(verify, 'otherwise the held-back close of O4', 'a `setup-failure` outcome is the');
  const itClose = between(implement, '**The held-back close.**', 'Step 8 not run for any other reason');
  const abStep3 = between(audit, '3. Otherwise run step 4', 'consume the deferred round');

  test('verify-build D11: its one --verified call is gated on a fresh walk and excludes --resume/targeted', () => {
    const vb = verifiedBlocks(vbClose);
    expect(vb).toHaveLength(1);
    // Whole file, flattened: an unconditional call added in any other section, or wrapped over a
    // line break, is still counted.
    expect(flat(verify).match(VERIFIED_CALL) || []).toHaveLength(1);
    expect(vb[0]).toContain('`--verified` only when this run walked every criterion afresh');
    expect(vb[0]).toMatch(/a `--resume` or targeted run carried `met` verdicts forward[^)]*calls without `--verified`/);
  });

  test('implement-trd Step 9: its one --verified call excludes the --resume --verify path, and the bare call has its own bullet', () => {
    const vb = verifiedBlocks(itClose);
    expect(vb).toHaveLength(1);
    expect(flat(implement).match(VERIFIED_CALL) || []).toHaveLength(1);
    // The exclusion is in the same bullet and comes before the call.
    const b = vb[0];
    const exclusion = b.indexOf('except on the `--resume --verify` path');
    expect(exclusion).toBeGreaterThanOrEqual(0);
    expect(exclusion).toBeLessThan(b.search(VERIFIED_CALL));
    expect(b).toContain('calls without `--verified` so custody re-proves them');
    // --no-verify: a different bullet, a bare call.
    const bare = blocks(itClose).filter((x) => x.match(BARE_CALL));
    expect(bare).toHaveLength(1);
    expect(bare[0]).toContain('`--no-verify` was set');
    expect(bare[0]).toContain('call without `--verified`');
    expect(bare[0]).not.toMatch(VERIFIED_CALL);
  });

  test('every carried-forward path names a close without --verified', () => {
    // verify-build --resume and targeted runs
    expect(flat(vbClose)).toMatch(/a `--resume` or targeted run carried `met` verdicts forward from an earlier loop[^)]*so it calls without `--verified`/);
    expect(flat(vbRuns)).toContain('A `--resume` run implies `--no-fix` but may complete the close');
    // verify-build fix-loop step 6 never passes it
    expect(flat(vbStep6)).toContain('never with `--verified` here');
    expect(flat(vbStep6)).toContain('carries every `met` verdict forward');
    expect(flat(vbStep6)).not.toMatch(/--close-deferred --verified/);
    // implement-trd --resume --verify
    expect(flat(itClose)).toContain('the loop re-entered from `verification-state.json` carries `met` verdicts');
  });

  // Prose, not library behaviour: the HEAD-or-recorded anchor choice is made by the model at close
  // time; no library function takes `--verified`, so nothing here exercises it behaviourally.
  test('audit-build --close-deferred step 3 says what --verified changes: HEAD instead of the recorded anchor', () => {
    const t = flat(abStep3);
    expect(t).toContain('With `--verified` (verification proved every commit up to the head), `audit.anchorCommit` is the full output of `git rev-parse HEAD` at close time; without it, the line\'s `close.anchorCommit`');
  });
});
