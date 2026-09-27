'use strict';

/**
 * discovered-ref.test.js — D5 (TRD §3.2): `ref`/`after` on record(), latest-per-ref in
 * promotable(), and observation-keyed dedupe / follow-up rows / per-row Serves+Dependencies
 * in promoteToTrd().
 *
 * Lives in a fresh file, not discovered.test.js, because discovered.test.js is excluded from
 * CI (jest.config.ci.js) for an unidentified hang on the GitHub runner — these new cases must
 * not inherit that exclusion.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { record, readAll, promoteToTrd, promotable } = require('./discovered');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-ref-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('record — ref and after', () => {
  test('a ref is kept, capped at 80 chars', () => {
    record(dir, { summary: 's', ref: 'x'.repeat(200) });
    expect(readAll(dir)[0].ref).toHaveLength(80);
  });

  test('no ref field at all when none is given', () => {
    record(dir, { summary: 's' });
    expect(readAll(dir)[0]).not.toHaveProperty('ref');
  });

  test('after is kept as an array of refs, each capped, list capped at 20', () => {
    const after = Array.from({ length: 25 }, (_, i) => `r${i}`.padEnd(90, 'z'));
    record(dir, { summary: 's', ref: 'plan:B2', after });
    const row = readAll(dir)[0];
    expect(row.after).toHaveLength(20);
    expect(row.after[0]).toHaveLength(80);
  });

  test('an empty after array is not stored', () => {
    record(dir, { summary: 's', ref: 'SC-1', after: [] });
    expect(readAll(dir)[0]).not.toHaveProperty('after');
  });
});

describe('promotable — latest-per-ref pre-pass', () => {
  const row = (over) => ({
    kind: 'gap', foundBy: 'x', summary: 's', blocksFeature: true, ...over,
  });

  test('two not_met rows for one ref: only the latest survives', () => {
    const rows = [
      row({ ref: 'SC-12', ts: '2026-01-01T00:00:00.000Z', status: 'not_met', summary: 'first' }),
      row({ ref: 'SC-12', ts: '2026-01-02T00:00:00.000Z', status: 'not_met', summary: 'second' }),
    ];
    const out = promotable(rows);
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe('second');
  });

  test('a later met row for the ref promotes nothing (met is dropped by the status filter, and the earlier not_met row is retired by latest-per-ref)', () => {
    const rows = [
      row({ ref: 'SC-12', ts: '2026-01-01T00:00:00.000Z', status: 'not_met', summary: 'fails' }),
      row({ ref: 'SC-12', ts: '2026-01-02T00:00:00.000Z', status: 'met', summary: 'now passes' }),
    ];
    expect(promotable(rows)).toHaveLength(0);
  });

  test('rows without ref are unaffected — order and content preserved', () => {
    const rows = [
      row({ summary: 'a' }),
      row({ ref: 'SC-1', ts: '2026-01-01T00:00:00.000Z', status: 'not_met', summary: 'ref row' }),
      row({ summary: 'b' }),
    ];
    const out = promotable(rows);
    expect(out.map((r) => r.summary)).toEqual(['a', 'ref row', 'b']);
  });

  test('two different refs each keep their own latest independently', () => {
    const rows = [
      row({ ref: 'SC-1', ts: '2026-01-01T00:00:00.000Z', status: 'not_met', summary: 'sc1-old' }),
      row({ ref: 'SC-2', ts: '2026-01-01T00:00:00.000Z', status: 'not_met', summary: 'sc2-old' }),
      row({ ref: 'SC-1', ts: '2026-01-02T00:00:00.000Z', status: 'not_met', summary: 'sc1-new' }),
    ];
    const out = promotable(rows);
    expect(out.map((r) => r.summary).sort()).toEqual(['sc1-new', 'sc2-old']);
  });
});

describe('promoteToTrd — observation-keyed dedupe, follow-ups, Serves/Dependencies', () => {
  const mk = (body) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-ref-'));
    const f = path.join(d, 'trd.md');
    fs.writeFileSync(f, body);
    return f;
  };
  const SIX = [
    '## Master Task List', '',
    '| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |',
    '|---|---|---|---|---|---|',
    '| EX-B001 | Build it | O1 | | None | works |', '',
  ].join('\n');

  const critRow = (over) => ({
    kind: 'gap', foundBy: 'verify-build --fix', summary: 'criterion fails', blocksFeature: true,
    status: 'not_met', ref: 'SC-12', ts: '2026-01-01T00:00:00.000Z', ...over,
  });

  it('the same observation re-run promotes nothing', () => {
    const f = mk(SIX);
    const r1 = promoteToTrd(f, [critRow()]);
    expect(r1.added).toEqual(['AMEND-001']);

    // Re-run with the exact same ledger row (same ref@ts) — must not re-promote.
    const r2 = promoteToTrd(f, [critRow()]);
    expect(r2.added).toEqual([]);
  });

  it('a second observation for the same ref, after the first row already exists, promotes a follow-up row depending on the first', () => {
    const f = mk(SIX);
    const r1 = promoteToTrd(f, [critRow({ ts: '2026-01-01T00:00:00.000Z', summary: 'first failure' })]);
    expect(r1.added).toEqual(['AMEND-001']);

    const r2 = promoteToTrd(f, [critRow({ ts: '2026-01-02T00:00:00.000Z', summary: 'second failure' })]);
    expect(r2.added).toEqual(['AMEND-002']);

    const lines = fs.readFileSync(f, 'utf-8').split('\n');
    const row2 = lines.find((l) => l.startsWith('| AMEND-002'));
    const cells = row2.split('|').slice(1, -1).map((c) => c.trim());
    // Header: Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria
    expect(cells[1]).toContain('follow-up to AMEND-001');
    expect(cells[1]).toContain('which did not close it');
    expect(cells[4]).toBe('AMEND-001');
  });

  it('Serves reads "criterion <ref>" for a criterion ref', () => {
    const f = mk(SIX);
    promoteToTrd(f, [critRow()]);
    const row = fs.readFileSync(f, 'utf-8').split('\n').find((l) => l.startsWith('| AMEND-001'));
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    expect(cells[2]).toBe('criterion SC-12');
  });

  it('Serves reads "plan blocker <id>" for a plan-blocker ref, stripping the plan: prefix', () => {
    const f = mk(SIX);
    promoteToTrd(f, [critRow({ ref: 'plan:B1', summary: 'blocker not resolved' })]);
    const row = fs.readFileSync(f, 'utf-8').split('\n').find((l) => l.startsWith('| AMEND-001'));
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    expect(cells[2]).toBe('plan blocker B1');
  });

  it('a plan blocker keyed by the plan\'s timestamp is promoted once across two runs', () => {
    const f = mk(SIX);
    const blocker = () => critRow({
      ref: 'plan:B1', ts: '2026-02-01T00:00:00.000Z', summary: 'blocker unresolved',
    });
    const r1 = promoteToTrd(f, [blocker()]);
    expect(r1.added).toEqual(['AMEND-001']);

    // Second run over the same plan (same ts) — must not re-promote the blocker.
    const r2 = promoteToTrd(f, [blocker()]);
    expect(r2.added).toEqual([]);
  });

  it('after maps to the promoted IDs of those refs, including a sibling promoted earlier in the same call', () => {
    const f = mk(SIX);
    const r = promoteToTrd(f, [
      critRow({ ref: 'plan:B1', ts: '2026-03-01T00:00:00.000Z', summary: 'blocker one', after: undefined }),
      critRow({
        ref: 'plan:B2', ts: '2026-03-01T00:00:00.000Z', summary: 'blocker two', after: ['plan:B1'],
      }),
    ]);
    expect(r.added).toEqual(['AMEND-001', 'AMEND-002']);

    const lines = fs.readFileSync(f, 'utf-8').split('\n');
    const row2 = lines.find((l) => l.startsWith('| AMEND-002'));
    const cells = row2.split('|').slice(1, -1).map((c) => c.trim());
    expect(cells[4]).toBe('AMEND-001');
  });

  it('rows without ref behave as before — summary-based dedupe, "None" dependencies, default Serves', () => {
    const f = mk(SIX);
    const disc = (summary) => ({
      summary, kind: 'bug', foundBy: 'code-review', blocksFeature: true,
    });
    expect(promoteToTrd(f, [disc('a defect')]).added).toEqual(['AMEND-001']);
    expect(promoteToTrd(f, [disc('a defect')]).added).toEqual([]); // still deduped, unchanged

    const row = fs.readFileSync(f, 'utf-8').split('\n').find((l) => l.startsWith('| AMEND-001'));
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    expect(cells[2]).toBe('amendment — no objective recorded');
    expect(cells[4]).toBe('None');
  });

  it('opts.serves still wins over the per-row ref-derived Serves value', () => {
    const f = mk(SIX);
    promoteToTrd(f, [critRow()], { serves: 'O9' });
    const row = fs.readFileSync(f, 'utf-8').split('\n').find((l) => l.startsWith('| AMEND-001'));
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    expect(cells[2]).toBe('O9');
  });
});
