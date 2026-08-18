#!/usr/bin/env node
'use strict';
/**
 * hook-verdict-rate.js — measure how often prompt-type hook evaluations leak
 * PROSE instead of calling `submit`.
 *
 * WHY THIS EXISTS
 *
 * A prompt hook is supposed to answer with a single `submit` tool call. When it
 * answers in prose instead, the harness has no structured verdict and records the
 * loose output as a `hookErrors` entry — `[<the entire 13-17 KB prompt>]: <text>`
 * — which the CLI renders as `Stop hook error:` followed by pages of prompt.
 *
 * Measured 2026-08-16 before the fix: 31 of 251 evaluations, ~12%. It occurred on
 * ALLOW verdicts as well as blocks, which is what proved it was a response-format
 * defect and not a guard failing.
 *
 * The fix (RESPONSE_CONTRACT_BLOCK in build-judge-prompts.js) is verified by
 * COUNTING, not by looking: 88% of evaluations were already invisible, so absence
 * of the symptom in a few turns proves nothing.
 *
 * TWO TRAPS THIS SCRIPT AVOIDS, both of which cost real time during the
 * investigation:
 *
 *   1. Count ARRAY ENTRIES, not records. One Stop event where two guards both
 *      fire yields ONE record with a two-element `hookErrors` array. Counting
 *      records produced a phantom discrepancy and sent the investigation down a
 *      wrong path.
 *   2. `preventedContinuation` is NOT "was this blocked?". It was `false` on all
 *      251 records including every one carrying a block, because the session
 *      continued afterward with corrected behaviour.
 *
 * Usage:
 *   node hook-verdict-rate.js <transcript.jsonl> [...]
 *   node hook-verdict-rate.js --project <slug>     # newest transcript for a project
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

function newestTranscript(slug) {
  const dir = path.join(PROJECTS, slug);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files.length ? files[0].f : null;
}

function scan(file) {
  let evaluations = 0;   // stop_hook_summary records = hook evaluation rounds
  let leaked = 0;        // hookErrors ENTRIES (not records)
  let recordsWithLeak = 0;
  const samples = [];

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.type !== 'system' || r.subtype !== 'stop_hook_summary') continue;
    evaluations++;
    const he = r.hookErrors;
    if (!he) continue;
    const entries = Array.isArray(he) ? he : [he];
    if (!entries.length) continue;
    recordsWithLeak++;
    leaked += entries.length;              // TRAP 1: entries, not records
    for (const e of entries) {
      const m = /\]:\s*([\s\S]+)$/.exec(String(e));
      if (m && samples.length < 5) samples.push(m[1].trim().replace(/\s+/g, ' ').slice(0, 100));
    }
  }
  return { file, evaluations, leaked, recordsWithLeak, samples };
}

function main(argv) {
  let files = [];
  const pi = argv.indexOf('--project');
  if (pi !== -1) {
    const t = newestTranscript(argv[pi + 1]);
    if (!t) { console.error(`no transcript for project ${argv[pi + 1]}`); return 1; }
    files = [t];
  } else {
    files = argv.filter((a) => a.endsWith('.jsonl'));
  }
  if (!files.length) {
    console.error('usage: hook-verdict-rate.js <transcript.jsonl>... | --project <slug>');
    return 1;
  }

  let E = 0, L = 0;
  for (const f of files) {
    const r = scan(f);
    E += r.evaluations; L += r.leaked;
    const pct = r.evaluations ? ((100 * r.leaked) / r.evaluations).toFixed(1) : '0.0';
    console.log(`\n  ${path.basename(r.file)}`);
    console.log(`    hook evaluations:        ${r.evaluations}`);
    console.log(`    prose leaks (entries):   ${r.leaked}  in ${r.recordsWithLeak} record(s)`);
    console.log(`    leak rate:               ${pct}%`);
    for (const s of r.samples) console.log(`      - ${s}`);
  }

  const pct = E ? (100 * L) / E : 0;
  console.log(`\n  TOTAL: ${L}/${E} = ${pct.toFixed(1)}%   (pre-fix baseline: 12.4%)`);
  // A leak rate at or above ~5% means the response contract is not holding.
  if (pct >= 5) { console.log('  VERDICT: response contract NOT holding'); return 2; }
  console.log('  VERDICT: within tolerance');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { scan };
