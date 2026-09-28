/**
 * hook-verdict-rate.test.js
 *
 * The defect this covers: since the 4.10.1 prompt rewrite, the shipped Stop prompt
 * (discipline-stop.source.md) requires a `reason` on the ALLOW branch too --
 * `{"ok": true, "reason": "no case A or B"}` -- because upstream displays any reason
 * present as a `hookErrors` entry, whether the verdict was ok:true or ok:false. That
 * fixed, short reason must classify as a normal, expected allow -- never as a block,
 * and never as the anomalous "leak" this tool exists to catch. Only a LONGER,
 * descriptive allow reason (the shape the retired RESPONSE_CONTRACT_BLOCK forbade) is
 * the real leak.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classify, scan } = require('./hook-verdict-rate');

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-verdict-rate-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return file;
}

function stopHookSummary(hookErrors) {
  return { type: 'system', subtype: 'stop_hook_summary', hookErrors };
}

describe('classify', () => {
  it('treats the fixed compliant allow reason as a normal allow, not a leak', () => {
    expect(classify('no case A or B')).toBe('normal-allow');
  });

  it('treats a longer, descriptive allow reason as an anomalous leak', () => {
    expect(classify('This does not claim to be doing work asynchronously.')).toBe('leak-allow');
  });

  it('treats instructive, second-person prose as a block', () => {
    expect(classify('You are claiming async work without a background task. Dispatch it properly or drop the claim.')).toBe('block');
  });
});

describe('scan', () => {
  it('counts a compliant allow separately from blocks and leaks', () => {
    const file = writeTranscript([
      stopHookSummary(['[some prompt]: no case A or B']),
    ]);
    const r = scan(file);
    expect(r.evaluations).toBe(1);
    expect(r.blocks).toBe(0);
    expect(r.allows).toBe(1);
    expect(r.leaks).toBe(0);
  });

  it('still counts a real block as a block', () => {
    const file = writeTranscript([
      stopHookSummary(['[some prompt]: You are claiming async work. Dispatch it properly or drop the claim.']),
    ]);
    const r = scan(file);
    expect(r.blocks).toBe(1);
    expect(r.allows).toBe(0);
    expect(r.leaks).toBe(0);
  });

  it('counts a descriptive-prose allow as a leak, and samples it', () => {
    const file = writeTranscript([
      stopHookSummary(['[some prompt]: This does not claim to be doing work asynchronously.']),
    ]);
    const r = scan(file);
    expect(r.leaks).toBe(1);
    expect(r.blocks).toBe(0);
    expect(r.allows).toBe(0);
    expect(r.samples).toHaveLength(1);
  });

  it('counts evaluations with no hookErrors at all as neither block nor allow nor leak', () => {
    const file = writeTranscript([{ type: 'system', subtype: 'stop_hook_summary' }]);
    const r = scan(file);
    expect(r.evaluations).toBe(1);
    expect(r.blocks + r.allows + r.leaks).toBe(0);
  });

  it('counts each array entry, not each record (two guards firing in one Stop event)', () => {
    const file = writeTranscript([
      stopHookSummary([
        '[prompt one]: no case A or B',
        '[prompt two]: You must dispatch properly. Do X.',
      ]),
    ]);
    const r = scan(file);
    expect(r.evaluations).toBe(1);
    expect(r.recordsWithEntries).toBe(1);
    expect(r.allows).toBe(1);
    expect(r.blocks).toBe(1);
  });
});
