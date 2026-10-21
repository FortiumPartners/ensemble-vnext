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

describe('pairing, per-task and compare', () => {
  const { pairAgents, perTask, compareRuns, transcriptStats } = require('./ledger-timing');
  const stopT = (sec, id, tp) => JSON.stringify({ ts: new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString(), event: 'stop', agent_id: id, agent_transcript_path: tp });
  const asst = (id, content, out) => JSON.stringify({ type: 'assistant', message: { id, role: 'assistant', content, usage: { output_tokens: out } } });
  const files = {};
  const readFile = (p) => { if (p in files) return files[p]; throw new Error('ENOENT'); };
  const agent = (id, type, startSec, stopSec, label, phase, transcript) => {
    const tp = `/t/${id}.jsonl`;
    files[tp.replace('.jsonl', '.meta.json')] = JSON.stringify({ description: label, workflowPhase: phase });
    files[tp] = transcript || '';
    return [ev(startSec, 'start', id, type), stopT(stopSec, id, tp)];
  };
  beforeEach(() => { for (const k of Object.keys(files)) delete files[k]; });

  test('pairAgents: first start/stop win, unfinished has null seconds', () => {
    const a = pairAgents([ev(0, 'start', 'x', 't'), ev(10, 'stop', 'x'), ev(99, 'stop', 'x'), ev(5, 'start', 'y', 't')]);
    expect(a.map((r) => [r.id, r.seconds])).toEqual([['x', 10], ['y', null]]);
  });

  test('streamed message.id counts once for tokens (max) and every tool_use for calls', () => {
    const t = [asst('m1', [{ type: 'text' }], 41), asst('m1', [{ type: 'tool_use' }], 123), asst('m2', [{ type: 'tool_use' }], 10)].join('\n');
    expect(transcriptStats(t)).toEqual({ toolCalls: 2, outputTokens: 133 });
    const one = [asst('m1', [{ type: 'text' }], 41), asst('m1', [{ type: 'tool_use' }], 123)].join('\n');
    expect(transcriptStats(one)).toEqual({ toolCalls: 1, outputTokens: 123 });
  });

  test('perTask reads label/phase from meta, skips unfinished, falls back to archived transcripts', () => {
    const lines = [...agent('a', 'backend-implementer', 0, 60, 'task:T1', 'Phase 1', asst('m', [{ type: 'tool_use' }], 5)), ev(0, 'start', 'u', 'x')];
    const rows = perTask(lines, readFile);
    expect(rows).toEqual([{ id: 'a', type: 'backend-implementer', label: 'task:T1', phase: 'Phase 1', seconds: 60, toolCalls: 1, outputTokens: 5 }]);
    const arch = {};
    arch['/ledger/transcripts/a.meta.json'] = files['/t/a.meta.json'];
    arch['/ledger/transcripts/a.jsonl'] = files['/t/a.jsonl'];
    const r2 = perTask(lines, (p) => { if (p in arch) return arch[p]; throw new Error('ENOENT'); }, { ledgerDir: '/ledger' });
    expect(r2[0].label).toBe('task:T1');
    expect(r2[0].toolCalls).toBe(1);
  });

  const run = (a, b, gate) => perTask([
    ...agent(`a${a}`, 'backend-implementer', 0, a, 'task:T1', 'Phase 1'),
    ...agent(`b${b}`, 'workflow-subagent', 0, b, 'task:T2', 'Phase 1'),
    ...agent(`g${gate}`, 'verify-app', 0, gate, 'gate:verify-app', 'Phase 2'),
  ], readFile);

  test('compareRuns pairs run k with run k: -25%, 0%, implementer median -12.5%', () => {
    const r = compareRuns([run(60, 120, 30)], [run(45, 120, 30)]);
    const [t1, t2, g] = r.pairs[0].keys;
    expect([t1.key, t1.seconds.change, t2.seconds.change, g.key, g.seconds.change]).toEqual(['task:T1', -0.25, 0, 'Phase 2', 0]);
    expect(r.medians.implementer).toBe(-0.125);
    expect(r.medians.gate).toBe(0);
  });

  test('compareRuns: one-sided label unmatched; repeated key summed with dispatch count', () => {
    const before = perTask([...agent('p', 'x', 0, 10, 'task:A', 'Phase 1'), ...agent('q', 'x', 0, 20, 'task:A', 'Phase 1'), ...agent('r', 'x', 0, 5, 'task:B', 'Phase 1')], readFile);
    const after = perTask([...agent('s', 'x', 0, 15, 'task:A', 'Phase 1'), ...agent('t', 'x', 0, 5, 'task:C', 'Phase 1')], readFile);
    const r = compareRuns([before], [after]);
    expect(r.pairs[0].keys[0].seconds).toEqual({ before: 30, after: 15, change: -0.5 });
    expect(r.pairs[0].keys[0].dispatches).toEqual({ before: 2, after: 1 });
    expect(r.pairs[0].unmatched).toEqual({ before: ['task:B'], after: ['task:C'] });
  });

  test('CLI --per-task and --compare; bad usage exits 2', () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-'));
    try {
      fs.mkdirSync(path.join(dir2, 'transcripts'));
      fs.writeFileSync(path.join(dir2, 'transcripts', 'a.jsonl'), asst('m', [{ type: 'tool_use' }], 7));
      fs.writeFileSync(path.join(dir2, 'transcripts', 'a.meta.json'), JSON.stringify({ description: 'task:T1', workflowPhase: 'Phase 1' }));
      const led = fixture(dir2, 'd.jsonl', [ev(0, 'start', 'a', 'backend-implementer'), stopT(40, 'a', '/gone/a.jsonl')]);
      const r = spawnSync('node', [CLI, '--per-task', led], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('task:T1 Phase 1 40s tools 1 tokens 7');
      const c = spawnSync('node', [CLI, '--compare', '--before', led, '--after', led], { encoding: 'utf8' });
      expect(c.status).toBe(0);
      expect(c.stdout).toContain('median implementer 0.0%');
      expect(spawnSync('node', [CLI, '--compare', led], { encoding: 'utf8' }).status).toBe(2);
      expect(spawnSync('node', [CLI, '--per-task'], { encoding: 'utf8' }).status).toBe(2);
    } finally { fs.rmSync(dir2, { recursive: true, force: true }); }
  });
});
