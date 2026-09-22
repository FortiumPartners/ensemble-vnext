/**
 * run-profile.test.js
 *
 * The properties that matter, each one learned by getting it wrong first:
 *   - a "run" is a burst of activity, not a session (one real ledger held ONE session
 *     spanning 64 hours with 36-hour gaps, and reported 0.01x parallelism);
 *   - overlapping agents count once toward busy time, or "outside agents" goes negative;
 *   - an agent that never returned has no duration and must not be invented.
 */
'use strict';

const { toIntervals, unionMs, splitRuns } = require('./run-profile');

const at = (min) => new Date(Date.UTC(2026, 0, 1, 0, min)).toISOString();
const row = (id, event, min, type = 'backend-implementer') => ({
  ts: at(min), event, agent_id: id, agent_type: type, session_id: 's1',
});

describe('splitRuns', () => {
  it('keeps one burst of work together', () => {
    const rows = [row('a', 'start', 0), row('a', 'stop', 5), row('b', 'start', 6), row('b', 'stop', 9)];
    expect(splitRuns(rows)).toHaveLength(1);
  });

  it('splits on a long silence, even inside ONE session', () => {
    // The defect this replaced: session scoping reported a 64-hour "run" because a single
    // session_id spanned several days of a human working and sleeping.
    const rows = [row('a', 'start', 0), row('a', 'stop', 5), row('b', 'start', 600), row('b', 'stop', 610)];
    expect(splitRuns(rows)).toHaveLength(2);
  });

  it('does not split on a gap shorter than the threshold', () => {
    const rows = [row('a', 'start', 0), row('a', 'stop', 5), row('b', 'start', 25), row('b', 'stop', 30)];
    expect(splitRuns(rows)).toHaveLength(1);
  });
});

describe('toIntervals', () => {
  it('pairs start and stop by agent id', () => {
    const { done } = toIntervals([row('a', 'start', 0), row('a', 'stop', 3)]);
    expect(done).toHaveLength(1);
    expect(done[0].ms).toBe(3 * 60 * 1000);
  });

  it('reports an agent that never returned instead of guessing its duration', () => {
    const { done, open } = toIntervals([row('a', 'start', 0), row('b', 'start', 1), row('b', 'stop', 4)]);
    expect(done.map((d) => d.id)).toEqual(['b']);
    expect(open.map((o) => o.id)).toEqual(['a']);
  });

  it('keys on agent_id, because prompt_id is not stable across a lifetime', () => {
    // A live run produced a stop row whose prompt_id differed from its own start row.
    const start = { ...row('a', 'start', 0), prompt_id: 'p1' };
    const stop = { ...row('a', 'stop', 2), prompt_id: 'p2' };
    expect(toIntervals([start, stop]).done).toHaveLength(1);
  });
});

describe('unionMs', () => {
  it('counts overlapping agents once', () => {
    // Two agents running 0-10 and 5-15 were busy for 15 minutes, not 20. Double-counting
    // here drives "outside agents" negative and makes the whole report nonsense.
    const iv = [{ start: 0, stop: 10 }, { start: 5, stop: 15 }];
    expect(unionMs(iv)).toBe(15);
  });

  it('adds disjoint intervals and excludes the gap between them', () => {
    expect(unionMs([{ start: 0, stop: 10 }, { start: 20, stop: 30 }])).toBe(20);
  });

  it('is zero for no intervals', () => {
    expect(unionMs([])).toBe(0);
  });
});
