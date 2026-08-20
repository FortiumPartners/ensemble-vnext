'use strict';

const { aggregate, groupKey, blank, add } = require('./token-usage');

const usage = (o = {}) => ({
  output_tokens: o.out || 0,
  input_tokens: o.in || 0,
  cache_creation_input_tokens: o.cw || 0,
  cache_read_input_tokens: o.cr || 0,
});
const T = (s) => Date.parse(s);

describe('the four token classes stay separate', () => {
  test('no `total` field is produced — a caller must own that decision', () => {
    // Summing them is the obvious mistake and it is badly wrong: cache_read dwarfs
    // output by ~500x in real data, so a combined figure tracks session LENGTH, not
    // cost. Measured on this machine over 7 days: 12.7M output vs 6.0B cache-read.
    expect(Object.keys(blank()).sort()).toEqual(
      ['cacheCreate', 'cacheRead', 'input', 'msgs', 'output'].sort()
    );
    expect(blank()).not.toHaveProperty('total');
    expect(blank()).not.toHaveProperty('tokens');
  });

  test('each class accumulates into its own bucket', () => {
    const a = blank();
    add(a, usage({ out: 1, in: 2, cw: 3, cr: 4 }));
    add(a, usage({ out: 10, in: 20, cw: 30, cr: 40 }));
    expect(a).toEqual({ output: 11, input: 22, cacheCreate: 33, cacheRead: 44, msgs: 2 });
  });

  test('a missing class counts as zero, not NaN', () => {
    const a = blank();
    add(a, {});
    expect(a).toEqual({ output: 0, input: 0, cacheCreate: 0, cacheRead: 0, msgs: 1 });
  });
});

describe('groupKey', () => {
  test('project strips the ~/.claude/projects slug prefix and restores slashes', () => {
    expect(groupKey('project', { dir: '-Users-james-dev-fortium-ensemble-vnext' }))
      .toBe('dev/fortium/ensemble/vnext');
  });
  test('model falls back to `unknown` rather than dropping the row', () => {
    expect(groupKey('model', { model: '' })).toBe('unknown');
    expect(groupKey('model', { model: 'claude-opus-5' })).toBe('claude-opus-5');
  });
  test('day is the UTC date', () => {
    expect(groupKey('day', { ts: T('2026-08-20T23:59:00Z') })).toBe('2026-08-20');
  });
});

describe('aggregate', () => {
  const rows = [
    { usage: usage({ out: 100, cr: 5000 }), dir: '-Users-james-dev-a', model: 'opus', ts: T('2026-08-20T10:00:00Z') },
    { usage: usage({ out: 50,  cr: 1000 }), dir: '-Users-james-dev-b', model: 'haiku', ts: T('2026-08-20T11:00:00Z') },
    { usage: usage({ out: 999, cr: 9999 }), dir: '-Users-james-dev-a', model: 'opus', ts: T('2026-08-01T10:00:00Z') },
  ];

  test('groups by project and totals across them', () => {
    const { groups, total } = aggregate(rows, 'project', T('2026-08-19T00:00:00Z'));
    expect(groups['dev/a'].output).toBe(100);
    expect(groups['dev/b'].output).toBe(50);
    expect(total.output).toBe(150);
  });

  test('the since cutoff EXCLUDES older rows — the window is the whole point', () => {
    const { total } = aggregate(rows, 'project', T('2026-08-19T00:00:00Z'));
    expect(total.msgs).toBe(2);          // the 2026-08-01 row is out of window
    expect(total.output).toBe(150);      // and its 999 is not counted
  });

  test('a row with no usage block is skipped, not counted as an empty message', () => {
    const { total } = aggregate([{ dir: 'x', ts: Date.now() }], 'project', 0);
    expect(total.msgs).toBe(0);
  });

  test('cache-read does not leak into output', () => {
    // The specific confusion this report exists to prevent.
    const { total } = aggregate(rows, 'project', 0);
    expect(total.output).toBe(1149);
    expect(total.cacheRead).toBe(15999);
  });
});
