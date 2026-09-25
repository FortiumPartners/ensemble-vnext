'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { record, readAll, render, ledgerPath, promoteToTrd, MAX_LINE_BYTES } = require('./discovered');
const { parseTrd } = require('./trd-parser');
const { buildGraph } = require('./task-graph');

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

/* Regression tests for the three promoteToTrd defects found by /code-review on 2026-09-20.
 * Each one was reproduced before the fix; each test fails against the previous implementation. */
describe('promoteToTrd', () => {

  const mk = (body) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-'));
    const f = path.join(d, 'trd.md');
    fs.writeFileSync(f, body);
    return f;
  };
  const disc = (summary, file) => ({
    summary, file, kind: 'bug', foundBy: 'code-review', blocksFeature: true,
  });
  const SIX = [
    '## Master Task List', '',
    '| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |',
    '|---|---|---|---|---|---|',
    '| EX-B001 | Build it | O1 | | None | works |', '',
  ].join('\n');
  const FIVE = [
    '## Master Task List', '',
    '| Task ID | Description | Serves | Dependencies | Acceptance Criteria |',
    '|---|---|---|---|---|',
    '| EX-B001 | Build it | O1 | None | works |', '',
  ].join('\n');

  it('numbers from the highest existing id, so a second discovery is not lost', () => {
    const f = mk(SIX);
    expect(promoteToTrd(f, [disc('first thing')]).added).toEqual(['AMEND-001']);
    // Same ledger, grown — exactly what --reconcile re-reads every run.
    const r2 = promoteToTrd(f, [disc('first thing'), disc('second thing')]);
    expect(r2.added).toEqual(['AMEND-002']);          // was [] before the fix
    expect(fs.readFileSync(f, 'utf-8')).toContain('second thing');
  });

  it('emits exactly as many cells as the table header has', () => {
    for (const [body, cols] of [[SIX, 6], [FIVE, 5]]) {
      const f = mk(body);
      promoteToTrd(f, [disc('a defect')]);
      const row = fs.readFileSync(f, 'utf-8').split('\n').find((l) => l.startsWith('| AMEND-001'));
      expect(row.split('|').slice(1, -1).length).toBe(cols);
    }
  });

  it('appends to the LAST task table, not the first', () => {
    const f = mk([SIX, '## Phase 2', '',
      '| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |',
      '|---|---|---|---|---|---|',
      '| EX-B002 | Later work | O2 | | None | works |', ''].join('\n'));
    promoteToTrd(f, [disc('late defect')]);
    const lines = fs.readFileSync(f, 'utf-8').split('\n');
    expect(lines.findIndex((l) => l.startsWith('| AMEND-001')))
      .toBeGreaterThan(lines.findIndex((l) => l.startsWith('| EX-B002')));
  });

  it('dedupes on the summary, not on unrelated prose containing it', () => {
    const f = mk(SIX + '\nSome prose mentioning a defect in passing.\n');
    expect(promoteToTrd(f, [disc('a defect')]).added).toEqual(['AMEND-001']);
    expect(promoteToTrd(f, [disc('a defect')]).added).toEqual([]);   // same one, not re-added
    expect(promoteToTrd(f, [disc('a different defect')]).added).toEqual(['AMEND-002']);
  });

  it('does not emit two rows for the same summary within one call', () => {
    const f = mk(SIX);
    expect(promoteToTrd(f, [disc('dupe'), disc('dupe')]).added).toEqual(['AMEND-001']);
  });

  /* The actual defect this file was asked to close: a promoted task with no grounding block
   * is invisible to `buildGraph`'s file-conflict inference, so two promoted tasks that touch
   * the same file can land in the same wave and lose each other's edits. These three prove
   * the round trip -- promote, re-parse with the real parser, re-build the real graph -- end
   * to end, rather than asserting on `discovered.js`'s own output in isolation. */
  describe('grounding emission', () => {
    it('round-trips a Touches field through the real parser when the record names a file', () => {
      const f = mk(SIX);
      const r = promoteToTrd(f, [disc('a defect', 'packages/core/lib/thing.js')]);
      expect(r.added).toEqual(['AMEND-001']);

      const parsed = parseTrd(fs.readFileSync(f, 'utf-8'));
      expect(parsed.grounding['AMEND-001']).toBeDefined();
      expect(parsed.grounding['AMEND-001'].touches).toContain('packages/core/lib/thing.js');
    });

    it('gives two promoted tasks naming the same file a file-conflict edge, not the same wave', () => {
      const f = mk(SIX);
      const shared = 'packages/core/lib/shared.js';
      const r = promoteToTrd(f, [
        disc('first defect', shared),
        disc('second defect', shared),
      ]);
      expect(r.added).toEqual(['AMEND-001', 'AMEND-002']);

      const parsed = parseTrd(fs.readFileSync(f, 'utf-8'));
      expect(parsed.grounding['AMEND-001'].touches).toContain(shared);
      expect(parsed.grounding['AMEND-002'].touches).toContain(shared);

      const graph = buildGraph(parsed.tasks, parsed.grounding);
      const conflict = graph.edges.find(
        (e) => e.kind === 'file-conflict' &&
          ((e.from === 'AMEND-001' && e.to === 'AMEND-002') ||
           (e.from === 'AMEND-002' && e.to === 'AMEND-001'))
      );
      expect(conflict).toBeDefined();

      const waveOf = (id) => graph.waves.findIndex((w) => w.includes(id));
      expect(waveOf('AMEND-001')).not.toBe(waveOf('AMEND-002'));
    });

    it('writes a grounding block with no fabricated path when the record has no file, and the parser flags the absence', () => {
      const f = mk(SIX);
      const r = promoteToTrd(f, [disc('a defect with no known file')]); // no file arg
      expect(r.added).toEqual(['AMEND-001']);

      const text = fs.readFileSync(f, 'utf-8');
      expect(text).toContain('### AMEND-001');
      const blockStart = text.indexOf('### AMEND-001');
      const nextHeading = text.indexOf('\n### ', blockStart + 1);
      const block = text.slice(blockStart, nextHeading === -1 ? undefined : nextHeading);
      expect(block).not.toContain('**Touches:**');

      const parsed = parseTrd(text);
      expect(parsed.grounding['AMEND-001'].touches).toEqual([]);
      expect(parsed.warnings.some(
        (w) => w.includes('AMEND-001') && w.includes('missing the mandatory Touches field')
      )).toBe(true);
    });
  });
});
