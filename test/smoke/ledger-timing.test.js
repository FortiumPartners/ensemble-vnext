'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { summarize, formatText, median } = require('./ledger-timing');

const CLI = path.join(__dirname, 'ledger-timing.js');
const ev = (sec, event, id, type) =>
  JSON.stringify({ ts: new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString(), event, agent_id: id, ...(type ? { agent_type: type } : {}) });

function fixture(dir, name, lines) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

describe('ledger-timing', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const base = [
    ev(0, 'start', 'a1', 'backend-implementer'), ev(60, 'stop', 'a1'),
    ev(0, 'start', 'a2', 'backend-implementer'), ev(120, 'stop', 'a2'),
    ev(0, 'start', 'v1', 'verify-app'), ev(30, 'stop', 'v1', 'verify-app'),
  ];

  test('median, max and n per agent_type', () => {
    const s = summarize(base);
    expect(s.types['backend-implementer']).toEqual({ median: 90, max: 120, n: 2 });
    expect(s.types['verify-app']).toEqual({ median: 30, max: 30, n: 1 });
    expect(s.unfinished).toBe(0);
  });

  test('unmatched start is unfinished, not a duration; malformed lines skipped', () => {
    const s = summarize([...base, ev(5, 'start', 'x1', 'verify-app'), 'not json', '{"event":"stop"}', '']);
    expect(s.types['verify-app'].n).toBe(1);
    expect(s.unfinished).toBe(1);
  });

  test('missing agent_type groups as unknown', () => {
    const s = summarize([ev(0, 'start', 'u1'), ev(10, 'stop', 'u1')]);
    expect(s.types.unknown).toEqual({ median: 10, max: 10, n: 1 });
  });

  test('text output is one stable line per type', () => {
    const out = formatText(summarize(base));
    expect(out).toContain('backend-implementer median 90s max 120s n=2');
    expect(out).toContain('verify-app median 30s max 30s n=1');
    expect(out).toContain('unfinished 0');
  });

  test('median of even/odd counts', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('CLI pools several files and supports --json', () => {
    const f1 = fixture(dir, 'a.jsonl', base.slice(0, 2));
    const f2 = fixture(dir, 'b.jsonl', base.slice(2));
    const r = spawnSync('node', [CLI, '--json', f1, f2], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.types['backend-implementer']).toEqual({ median: 90, max: 120, n: 2 });
    const t = spawnSync('node', [CLI, f1, f2], { encoding: 'utf8' });
    expect(t.stdout).toContain('backend-implementer median 90s max 120s n=2');
  });

  test('CLI without files or with unreadable file exits non-zero', () => {
    expect(spawnSync('node', [CLI], { encoding: 'utf8' }).status).not.toBe(0);
    expect(spawnSync('node', [CLI, path.join(dir, 'nope')], { encoding: 'utf8' }).status).not.toBe(0);
  });
});
