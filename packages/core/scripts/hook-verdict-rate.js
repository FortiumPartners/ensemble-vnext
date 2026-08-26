#!/usr/bin/env node
/**
 * hook-verdict-rate.js — count prompt-hook VERDICTS recorded in a session transcript.
 *
 * WHAT THIS MEASURES, corrected 2026-08-18: `hookErrors` entries are overwhelmingly
 * BLOCKS being delivered, not failures. Measured over one full session: 42 entries,
 * 36 of them blocks the agent received as feedback and acted on. A high count means
 * the guards caught a lot, which is the guards WORKING.
 *
 * The earlier version of this file called every entry a "prose leak" and printed
 * "VERDICT: response contract NOT holding" above 5%. That was wrong and actively
 * misleading: it reported the fix had made things 2.5x worse (11.4% -> 28.6%) when
 * the real cause was simply that the agent got blocked more often in that window.
 * A tool that misreads a working guard as a regression is worse than no tool.
 *
 * THE ONE ANOMALOUS SHAPE is an ALLOW appearing as an entry. An allow has nothing
 * to report — the turn proceeds — so an allow surfacing to the operator as
 * "Stop hook error:" is a genuine malfunction. Measured at ~1% of evaluations
 * (2 unambiguous cases in 50 post-fix evaluations, 4-ish in 245 before).
 *
 * Blocks vs allows are separated by a structural signal, not a keyword list: a block
 * reason always INSTRUCTS the agent what to do next; an allow reason only describes.
 * Keyword matching was tried and misclassified repeatedly.
 *
 * NO LONGER UNKNOWN (researched 2026-08-18): a BLOCK surfacing as "Stop hook error:"
 * is an UPSTREAM DISPLAY BUG, not a fault in our hooks. anthropics/claude-code#62139,
 * "[UX] Distinguish 'Stop hook execution error' from 'Stop hook objection' when hook
 * returns ok:false" — OPEN, labelled area:hooks / area:tui / enhancement. Its
 * reproduction is a `type: "prompt"` Stop hook returning `{ok: false, reason: "test"}`;
 * the CLI renders `Stop hook error: ...: test`. The issue states plainly that returning
 * ok:false is the INTENDED success path for review-style hooks and that the label
 * misrepresents correct behaviour. Affects prompt and command hooks on all OSes.
 * Related: #34600 (exit-code-2 Stop hook displays as error rather than feedback),
 * #34713 (false "Hook Error" on exit 0 / valid JSON).
 *
 * So the operator-visible "error" for a block needs no fix on our side and will not get
 * one until upstream relabels it. Measured here: 41 of 43 entries are blocks.
 *
 * THE OTHER 2 ARE THE REAL DEFECT and they are ours to reduce: an ok:true verdict that
 * carries a `reason` anyway. Upstream surfaces any reason present, so an allow with
 * prose attached is displayed exactly like a block. build-judge-prompts.js's
 * RESPONSE_CONTRACT_BLOCK exists to stop that ("an ok:true verdict carries no reason");
 * it reduced but did not eliminate it, because it is a model-compliance problem.
 * Adjacent upstream evidence that the judge's response shape is not reliably held:
 * #11947, where a prompt Stop hook returned {decision, reason} instead of {ok}, giving
 * "Stop hook error: Schema validation failed ... path: [ok]" — closed as not planned.
 *
 * TWO TRAPS, both of which cost real time:
 *   1. Count ARRAY ENTRIES, not records. One Stop event where two guards fire yields
 *      ONE record with a two-element array.
 *   2. `preventedContinuation` is NOT "was this blocked?". It was false on all 251
 *      records including every one carrying a block, because the session continued
 *      afterward with corrected behaviour.
 *
 * Usage:
 *   node hook-verdict-rate.js <transcript.jsonl> [...]
 *   node hook-verdict-rate.js --project <slug>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Above this share of evaluations the guards cost more than they catch.
const BLOCK_RATE_CEILING = 8;

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
  // Classify by detecting the ALLOW shape, not the block shape. Allows are the rare,
  // distinctive case — they state that the message did NOT do the thing — whereas block
  // reasons are open-ended second-person prose with no reliable common phrasing. An
  // earlier pass matched block-like verbs instead and misfiled 4 of 43.
  const ALLOW_SHAPE = /\b(do(es)? not (claim|violate|offer|defer|assert)|is not a violation|no (violation|deferral claim|async claim)|guard applies only|not running a workflow command|allowing)\b/i;
  let evaluations = 0;   // stop_hook_summary records = hook evaluation rounds
  let blocks = 0;        // ENTRIES whose reason instructs — the guard working
  let allows = 0;        // ENTRIES whose reason only describes — ANOMALOUS
  let recordsWithEntries = 0;
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
    recordsWithEntries++;                  // TRAP 1: count entries below, not records
    for (const e of entries) {
      const m = /\]:\s*([\s\S]+)$/.exec(String(e));
      const reason = m ? m[1].trim() : '';
      if (!ALLOW_SHAPE.test(reason)) blocks++;
      else {
        allows++;
        if (samples.length < 5) samples.push(reason.replace(/\s+/g, ' ').slice(0, 100));
      }
    }
  }
  return { file, evaluations, blocks, allows, recordsWithEntries, samples };
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

  let E = 0, B = 0, A = 0;
  for (const f of files) {
    const r = scan(f);
    E += r.evaluations; B += r.blocks; A += r.allows;
    console.log(`\n  ${path.basename(r.file)}`);
    console.log(`    hook evaluations:            ${r.evaluations}`);
    console.log(`    BLOCKS delivered:            ${r.blocks}   <- the guards working, not failures`);
    console.log(`    ALLOWS surfaced (anomalous): ${r.allows}`);
    for (const s of r.samples) console.log(`      allow: ${s}`);
  }

  const allowPct = E ? (100 * A) / E : 0;
  const blockPct = E ? (100 * B) / E : 0;
  console.log(`\n  TOTAL: ${E} evaluations | ${B} blocks (${blockPct.toFixed(1)}%) | ${A} anomalous allows (${allowPct.toFixed(1)}%)`);
  console.log('  Blocks are the guards working UP TO A POINT. Above ~8% of evaluations they are\n  interrupting correct work more than they are catching defects -- a guard the owner\n  disables protects nothing. Both rates are defect signals; they just fail differently.');
  console.log('  A block shown as "Stop hook error:" is anthropics/claude-code#62139 — an OPEN upstream');
  console.log('  TUI labelling bug, not a fault here. An ALLOW shown that way is ours: it means the');
  console.log('  judge attached a `reason` to an ok:true verdict. See build-judge-prompts.js.');
  // Two independent verdicts. The block rate had NO ceiling until 2026-08-25: this tool
  // told every reader that a high block count was the guards working, so no measurement
  // could ever have reported over-blocking. Measured that day: 72 blocks in 443
  // evaluations — 16%, one interruption every six turn-ends — reported as nominal.
  let rc = 0;
  if (blockPct >= BLOCK_RATE_CEILING) {
    console.log(`  VERDICT: block rate ${blockPct.toFixed(1)}% exceeds ${BLOCK_RATE_CEILING}% — the guards are`);
    console.log('           interrupting correct work. Shorten or narrow them; a disabled guard is worth nothing.');
    rc = 3;
  } else {
    console.log(`  VERDICT: block rate ${blockPct.toFixed(1)}% nominal`);
  }
  if (allowPct >= 5) { console.log('  VERDICT: allow-leak rate is elevated — worth investigating'); return 2; }
  console.log('  VERDICT: allow-leak rate nominal');
  return rc;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { scan };
