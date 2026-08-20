'use strict';

const { buildTrdGraph, aggregateTouches, renderConflicts } = require('./trd-graph');

const trd = (id, files, dependencies = []) => ({
  id,
  dependencies,
  parsed: { grounding: Object.fromEntries(files.map((f, i) => [`${id}-T${i}`, { touches: [f] }])) },
});

describe('aggregateTouches', () => {
  test('unions every task block and sorts', () => {
    expect(aggregateTouches({ grounding: { A: { touches: ['b.js', 'a.js'] }, B: { touches: ['a.js'] } } }))
      .toEqual(['a.js', 'b.js']);
  });
  test('a TRD with no grounding has an empty footprint', () => {
    expect(aggregateTouches({ grounding: {} })).toEqual([]);
    expect(aggregateTouches(undefined)).toEqual([]);
  });
});

describe('buildTrdGraph', () => {
  test('independent TRDs land in one wave', () => {
    const g = buildTrdGraph([trd('alpha', ['a.js']), trd('beta', ['b.js'])]);
    expect(g.waves).toHaveLength(1);
    expect(g.waves[0].sort()).toEqual(['alpha', 'beta']);
    expect(g.cycles).toEqual([]);
  });

  test('a declared dependency serializes into two waves', () => {
    const g = buildTrdGraph([trd('alpha', ['a.js']), trd('beta', ['b.js'], ['alpha'])]);
    expect(g.waves).toEqual([['alpha'], ['beta']]);
  });

  test('a cycle between TRDs is reported, not silently ordered', () => {
    const g = buildTrdGraph([trd('a', ['a.js'], ['b']), trd('b', ['b.js'], ['a'])]);
    expect(g.cycles.length).toBeGreaterThan(0);
  });

  test('a dependency on a TRD outside the set warns instead of vanishing', () => {
    const g = buildTrdGraph([trd('alpha', ['a.js'], ['not-here'])]);
    expect(g.warnings.join(' ')).toMatch(/not in this set/);
    expect(g.waves).toEqual([['alpha']]); // the unknown edge is dropped, not fatal
  });
});

describe('conflicts — the question that only exists at this level', () => {
  test('a shared file SERIALIZES two TRDs — the graph does this itself', () => {
    // The first draft of this test asserted these two would be flagged as RACING in
    // one wave. They are not, and cannot be: buildGraph already pushes nodes that
    // share a file into separate waves. Inheriting that is the point of reusing it.
    const g = buildTrdGraph([trd('alpha', ['shared.js']), trd('beta', ['shared.js'])]);
    expect(g.waves).toHaveLength(2);
    const c = g.conflicts.find((x) => x.file === 'shared.js');
    expect(c.owners.sort()).toEqual(['alpha', 'beta']);
    expect(c.serializedByFile).toBe(true);
    expect(renderConflicts(g)).toMatch(/shared\.js — alpha, beta/);
  });

  test('when a declared dependency ALSO separates them, the file is not the cause', () => {
    // Reporting the file here would be noise — they were never going to run
    // together — and noise is how a real finding gets scrolled past.
    const g = buildTrdGraph([trd('alpha', ['shared.js']), trd('beta', ['shared.js'], ['alpha'])]);
    const c = g.conflicts.find((x) => x.file === 'shared.js');
    expect(c.serializedByFile).toBe(false);
    expect(renderConflicts(g)).toBe('');
  });

  test('a file owned by one TRD is not a conflict at all', () => {
    const g = buildTrdGraph([trd('alpha', ['solo.js']), trd('beta', ['other.js'])]);
    expect(g.conflicts).toEqual([]);
  });

  test('an UNGROUNDED TRD warns rather than looking safe', () => {
    // The silent-failure case: no grounding means an empty footprint, which means
    // it can never be detected as conflicting. It would read as safe to run in
    // parallel with anything.
    const g = buildTrdGraph([{ id: 'bare', parsed: { grounding: {} } }, trd('beta', ['b.js'])]);
    expect(g.warnings.join(' ')).toMatch(/bare.*can never be detected as conflicting/s);
  });

  test('renderConflicts says nothing when there is nothing', () => {
    expect(renderConflicts(buildTrdGraph([trd('a', ['a.js'])]))).toBe('');
  });
});
