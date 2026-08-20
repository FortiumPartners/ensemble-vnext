'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { record, readAll, render, ledgerPath, MAX_LINE_BYTES } = require('./discovered');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('record', () => {
  test('writes a row and creates the state dir', () => {
    const nested = path.join(dir, 'a', 'b');
    expect(record(nested, { kind: 'bug', foundBy: 'FV-B001', phase: 1, summary: 'x' })).toBe(true);
    expect(fs.existsSync(ledgerPath(nested))).toBe(true);
  });

  test('a row with no summary is refused — an entry that says nothing is noise', () => {
    expect(record(dir, { kind: 'bug', foundBy: 'X' })).toBe(false);
    expect(readAll(dir)).toHaveLength(0);
  });

  test('an unknown kind falls back to `gap` rather than being dropped', () => {
    record(dir, { kind: 'not-a-kind', summary: 's' });
    expect(readAll(dir)[0].kind).toBe('gap');
  });

  test('appends rather than overwrites — parallel implementers share the file', () => {
    record(dir, { summary: 'first' });
    record(dir, { summary: 'second' });
    expect(readAll(dir).map((r) => r.summary)).toEqual(['first', 'second']);
  });

  test('a huge evidence blob is truncated at the FIELD, not shed at the line', () => {
    // First draft of this test asserted `evidence` would be dropped entirely. It
    // is not, and the real behaviour is better: per-field caps (400 chars) mean a
    // row cannot reach the 2048-byte line bound in the first place, so the
    // line-level shed below is an unreachable backstop rather than the live path.
    // Recording that here so the next reader does not "fix" the shed to match a
    // wrong expectation.
    const ok = record(dir, { summary: 'keep me', evidence: 'e'.repeat(5000) });
    expect(ok).toBe(true);
    const [row] = readAll(dir);
    expect(row.summary).toBe('keep me');
    expect(row.evidence).toHaveLength(400);
  });

  test('every written line stays under the interleave bound', () => {
    record(dir, { summary: 's'.repeat(1000), evidence: 'e'.repeat(1000), file: 'f'.repeat(500) });
    for (const line of fs.readFileSync(ledgerPath(dir), 'utf-8').split('\n').filter(Boolean)) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(MAX_LINE_BYTES);
    }
  });

  test('never throws on an unwritable path', () => {
    expect(record('/proc/nonexistent-xyz', { summary: 's' })).toBe(false);
  });
});

describe('readAll', () => {
  test('an absent file is empty, not an error', () => {
    expect(readAll(dir)).toEqual([]);
  });

  test('a truncated final line does not blind the reader to the rest', () => {
    record(dir, { summary: 'good' });
    fs.appendFileSync(ledgerPath(dir), '{"summary":"trunc');
    expect(readAll(dir).map((r) => r.summary)).toEqual(['good']);
  });
});

describe('render', () => {
  test('nothing recorded renders EMPTY, not a "none found" section', () => {
    // An empty section reads as "checked, found none". Nothing was recorded at
    // all. Those are different claims and the banner must not conflate them.
    expect(render(dir)).toBe('');
  });

  test('groups by kind and names the task that found each', () => {
    record(dir, { kind: 'bug', foundBy: 'FV-B002', phase: 1, summary: 'null deref', file: 'a.js' });
    record(dir, { kind: 'scope-conflict', foundBy: 'FV-B003', phase: 1, summary: 'needs auth' });
    const out = render(dir);
    expect(out).toContain('2 item(s)');
    expect(out).toContain('[bug] FV-B002 (a.js): null deref');
    expect(out).toContain('[scope-conflict] FV-B003: needs auth');
  });

  test('says plainly that these are records, not tasks', () => {
    record(dir, { summary: 's' });
    expect(render(dir)).toMatch(/RECORDS, not tasks/);
    expect(render(dir)).toMatch(/--resume/);
  });

  test('filters to one phase when asked', () => {
    record(dir, { phase: 1, summary: 'p1' });
    record(dir, { phase: 2, summary: 'p2' });
    expect(render(dir, { phase: 2 })).toContain('p2');
    expect(render(dir, { phase: 2 })).not.toContain('p1');
  });
});
