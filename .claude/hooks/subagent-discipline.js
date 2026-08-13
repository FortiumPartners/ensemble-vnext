#!/usr/bin/env node

/**
 * subagent-discipline.js — SubagentStop guard against fire-and-forget /
 * deferred-work claims made by a SUBAGENT.
 *
 * async-discipline.js catches this failure mode on the main session's Stop
 * event; this hook catches it where it actually happened in the wild: three
 * subagents in one session ended with "I'll wait for the monitor
 * notifications to arrive" / "Waiting for background scenario completions",
 * burning ~240k tokens across 179 tool calls and returning nothing.
 * `async-discipline` never looked because it only runs on `Stop`.
 *
 * Why SubagentStop, and why the rule is STRICTER here than on Stop:
 *   - `ScheduleWakeup` is removed from every subagent by the platform's first
 *     tool filter (foreground and background alike). A subagent claiming it
 *     will "come back later" or "check back when X finishes" is therefore
 *     false BY CONSTRUCTION — there is no mechanism by which it could. The
 *     main-session guard has to check background_tasks/session_crons because
 *     the claim MIGHT be true; for a subagent it never is for the
 *     ScheduleWakeup/session_crons half. A fuzzy semantic judgment becomes
 *     near-deterministic.
 *   - `Agent({run_in_background: true})` is not filtered the same way, so a
 *     non-empty `background_tasks` IS still treated as a legitimate escape
 *     valve (a subagent that itself dispatched a nested background agent).
 *     `session_crons` is NOT treated as an escape valve here, even if
 *     non-empty, because a subagent cannot have populated it itself.
 *
 * Empirically verified 2026-08-12 (see docs/modernization/2026-08-improvement-plan.md
 * item 5e — the hooks reference is wrong or silent on all four points):
 *   - {"decision":"block","reason":...} WORKS on SubagentStop; the subagent resumes.
 *   - The `reason` reaches the subagent — its next turn answers the reason directly.
 *   - `stop_hook_active` IS present in the SubagentStop payload — usable as a loop guard.
 *   - `background_tasks` / `session_crons` ARE present on SubagentStop too.
 *   - Blocking CONTINUES the same subagent with its existing context — it does not
 *     respawn a fresh one, which is why blocking is worth doing here at all.
 *
 * Loop safety (mandatory — blocking forever is worse than the failure being guarded):
 *   - A per-agent_id consecutive-block counter, persisted to a small state file
 *     under the OS temp dir (hook invocations are isolated processes; nothing
 *     else survives between them). Capped at MAX_CONSECUTIVE_BLOCKS. Once the
 *     cap is hit, the guard allows the stop through unconditionally and resets
 *     the counter — a subagent that genuinely cannot proceed must be allowed
 *     to stop, with the situation visible in its final message, rather than be
 *     blocked forever.
 *   - The counter resets whenever a turn does NOT contain a deferred-work claim
 *     (i.e., the subagent either made progress or gave up cleanly).
 *   - If `agent_id` is absent from the payload, the loop cannot be bounded
 *     safely, so the guard degrades to allow (never blocks without a stable key).
 *
 * Pattern battery: reuses FIRE_AND_FORGET_PATTERNS, META_MARKERS, and the
 * matching algorithm from ./lib/async-claim-detector.js (async-discipline.js's
 * own machinery) rather than maintaining a second regex engine, extended with
 * a small set of SUBAGENT_DEFERRAL_PATTERNS for the "waiting/pausing/will
 * report when X finishes" shape seen in the wild.
 *
 * Output (to stdout, always exits 0):
 *   pass:  {"continue": true}
 *   block: {"continue": true, "decision": "block", "reason": "<instructional>"}
 *
 * Env vars:
 *   ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE=1   skip the guard
 *   ENSEMBLE_SUBAGENT_DISCIPLINE_DEBUG=1     stderr diagnostics
 *
 * See .claude/rules/async-discipline.md for the behavioral rule this pairs with.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getLastAssistantMessage } = require('./lib/transcript-text');
const { FIRE_AND_FORGET_PATTERNS, META_MARKERS, findMatch } = require('./lib/async-claim-detector');

const MAX_CONSECUTIVE_BLOCKS = 2;
const STATE_DIR = path.join(os.tmpdir(), 'ensemble-subagent-discipline');

function debug(msg) {
  if (process.env.ENSEMBLE_SUBAGENT_DISCIPLINE_DEBUG === '1') {
    const ts = new Date().toISOString();
    console.error(`[subagent-discipline ${ts}] ${msg}`);
  }
}

function emit(block, reason) {
  const out = { continue: true };
  if (block && reason) {
    out.decision = 'block';
    out.reason = reason;
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

// Additional deferral shapes specific to subagents narrating that they are
// waiting/pausing for something to arrive later — the exact shape observed
// in the wild ("I'll wait for the monitor notifications to arrive",
// "Waiting for background scenario completions"). Distinct from
// FIRE_AND_FORGET_PATTERNS' "I'll let you know when..." framing, which is
// about the subagent claiming IT will notify the caller; these are about the
// subagent claiming it is idling until something else notifies IT.
const SUBAGENT_DEFERRAL_PATTERNS = [
  // "I'll wait for the monitor / notifications / results to arrive/complete/finish"
  /\b(I'?ll|I will|I'?m going to|going to)\s+wait\s+for\b[^.!?\n]{0,100}\b(to (arrive|complete|finish)|arrives|completes|finishes)\b/i,
  // "Waiting for X to arrive/complete/finish" / "Waiting for background ... completions"
  /\bwaiting for\b[^.!?\n]{0,100}\b(notification|monitor|completion|to (arrive|complete|finish)|arrives|completes|finishes)\b/i,
  // "Pausing until/for ..."
  /\b(pausing|paused)\b[^.!?\n]{0,80}\b(until|for)\b/i,
  // "I'll report/check/come back once/when/after X"
  /\b(I'?ll|I will)\s+(report|check|come)\s+back\b[^.!?\n]{0,80}\b(once|when|after)\b/i,
  // "will report/update once the ... finishes/completes/is done"
  /\bwill\s+(report|update|notify)\b[^.!?\n]{0,80}\b(once|when|after)\b[^.!?\n]{0,80}\b(done|complete|completes|finished|finishes|ready)\b/i,
];

const ALL_DEFERRAL_PATTERNS = [...FIRE_AND_FORGET_PATTERNS, ...SUBAGENT_DEFERRAL_PATTERNS];

// Self-documentation bypass, mirroring async-discipline.js's own: a message
// discussing this rule (development, documentation, debugging) should never
// trip the rule itself.
const SELF_DOC_MARKERS = [
  /\[SUBAGENT-DISCIPLINE GUARD/,
  /subagent-discipline\.js/,
  /async-discipline\.md/,
  /async-discipline\.js/,
  /\bfire-and-forget\b/i,
];

function detectDeferredWorkClaim(text) {
  return findMatch(text, ALL_DEFERRAL_PATTERNS, { selfDocMarkers: SELF_DOC_MARKERS, metaMarkers: META_MARKERS });
}

/**
 * Legitimate async escape valve for a SUBAGENT's deferred-work claim.
 *
 * Unlike the main-session guard, session_crons is NOT checked: ScheduleWakeup
 * is unavailable to subagents, so a subagent's own claim of future return can
 * never be backed by it, regardless of what happens to be in that field.
 * background_tasks IS checked: Agent({run_in_background: true}) is not
 * filtered the same way, so a subagent that itself dispatched a nested
 * background agent has a real reason to say so.
 *
 * @param {Object} hookData
 * @returns {string|null} description of the active escape valve, or null
 */
function detectSubagentAsyncEscape(hookData) {
  const bg = hookData && hookData.background_tasks;
  if (Array.isArray(bg) && bg.length > 0) return `background_tasks (${bg.length})`;
  return null;
}

function sanitizeKey(agentId) {
  return String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

function stateFilePath(agentId) {
  return path.join(STATE_DIR, `${sanitizeKey(agentId)}.json`);
}

/**
 * Read the persisted consecutive-block count for agentId. Returns 0 on any
 * failure (missing file, corrupt JSON, permission error) — the counter is a
 * best-effort loop guard, not a source of truth that should ever throw.
 */
function readBlockCount(agentId) {
  try {
    const raw = fs.readFileSync(stateFilePath(agentId), 'utf-8');
    const data = JSON.parse(raw);
    return typeof data.count === 'number' && data.count >= 0 ? data.count : 0;
  } catch {
    return 0;
  }
}

function writeBlockCount(agentId, count) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const tmpPath = stateFilePath(agentId) + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify({ count, updated: new Date().toISOString() }), 'utf-8');
    fs.renameSync(tmpPath, stateFilePath(agentId));
  } catch (err) {
    debug(`failed to persist block count for ${agentId}: ${err.message}`);
  }
}

function resetBlockCount(agentId) {
  try {
    fs.unlinkSync(stateFilePath(agentId));
  } catch {
    // Nothing to reset — fine.
  }
}

const BLOCK_REASON_TEMPLATE = (claim, attempt, cap) => `[SUBAGENT-DISCIPLINE GUARD — deferred-work claim with no way to come back]

Your last message claimed you are waiting/pausing for something to happen later —
"${claim.slice(0, 160)}${claim.length > 160 ? '…' : ''}" —
but you are a SUBAGENT. ScheduleWakeup is unavailable to subagents (removed by the
platform's tool filter), so there is no mechanism by which you could resume later on
your own. A claim of "I'll wait" / "I'll come back when X finishes" is false by
construction here — nothing will re-invoke you, and this session will sit idle,
having done no useful work, until the orchestrator notices and nudges you.

This is attempt ${attempt} of ${cap} — after ${cap} consecutive blocks you will be allowed
to stop regardless, so this is not an infinite loop, but you should not need it.

What to do right now, in THIS turn:

  1. If the thing you were "waiting for" is something YOU can check directly (a file,
     a test result, a Bash command, a Read), check it now and act on what you find.
  2. If there is genuinely nothing more you can do until an external system finishes
     (e.g. a background task a DIFFERENT session dispatched, that only the
     orchestrator can observe), say so PLAINLY as your final answer — do not phrase
     it as "I'll wait" or "I'll check back". State what is blocking you and stop.
  3. If you dispatched your OWN background work via Agent({run_in_background: true}),
     that is a legitimate reason to defer — but it will show up in background_tasks,
     which was checked and found empty this time. If you intended to dispatch one,
     do so now in this turn rather than claiming you already are.

See .claude/rules/async-discipline.md.`;

async function main(hookData) {
  if (process.env.ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE === '1') {
    debug('disabled via ENSEMBLE_SUBAGENT_DISCIPLINE_DISABLE=1');
    return emit(false);
  }

  const data = hookData || {};
  const agentId = data.agent_id;

  const text = getLastAssistantMessage(data, 'agent_transcript_path');
  debug(`agent_id=${agentId || '(none)'} stop_hook_active=${!!data.stop_hook_active} text_len=${text.length}`);

  const claim = detectDeferredWorkClaim(text);
  if (!claim) {
    debug('no deferred-work claim detected — allow');
    if (agentId) resetBlockCount(agentId);
    return emit(false);
  }
  debug(`detected deferred-work claim: "${claim.slice(0, 80)}…"`);

  const escape = detectSubagentAsyncEscape(data);
  if (escape) {
    debug(`legitimate escape valve present (${escape}); allowing stop`);
    if (agentId) resetBlockCount(agentId);
    return emit(false);
  }

  if (!agentId) {
    // Cannot bound a retry loop without a stable per-subagent key. Degrade to
    // allow rather than risk blocking without a cap.
    debug('claim detected but no agent_id in payload — cannot apply loop cap, allowing stop');
    return emit(false);
  }

  const priorBlocks = readBlockCount(agentId);
  if (priorBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    debug(`agent ${agentId} already blocked ${priorBlocks}/${MAX_CONSECUTIVE_BLOCKS} times — cap reached, allowing stop`);
    resetBlockCount(agentId);
    return emit(false);
  }

  const attempt = priorBlocks + 1;
  writeBlockCount(agentId, attempt);
  debug(`BLOCK (${attempt}/${MAX_CONSECUTIVE_BLOCKS}) agent=${agentId}: "${claim.slice(0, 80)}"`);
  return emit(true, BLOCK_REASON_TEMPLATE(claim, attempt, MAX_CONSECUTIVE_BLOCKS));
}

// Stdin handling
if (require.main === module) {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { inputData += chunk; });
  process.stdin.on('end', async () => {
    try {
      const hookData = inputData.trim() ? JSON.parse(inputData) : {};
      await main(hookData);
    } catch (err) {
      debug(`fatal: ${err.message}`);
      emit(false); // defensive: never block on hook error
    }
  });
  process.stdin.on('error', (err) => {
    debug(`stdin error: ${err.message}`);
    emit(false);
  });
}

module.exports = {
  main,
  detectDeferredWorkClaim,
  detectSubagentAsyncEscape,
  SUBAGENT_DEFERRAL_PATTERNS,
  SELF_DOC_MARKERS,
  MAX_CONSECUTIVE_BLOCKS,
  readBlockCount,
  writeBlockCount,
  resetBlockCount,
  stateFilePath,
};
