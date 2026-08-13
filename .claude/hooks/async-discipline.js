#!/usr/bin/env node

/**
 * async-discipline.js — Stop hook catching fire-and-forget async claims.
 *
 * Prevents the failure mode where an agent claims "I'll let you know when done"
 * (or equivalent) without actually using a real async primitive (Agent
 * run_in_background, ScheduleWakeup, Monitor, /goal). Such claims leave the agent
 * idle until the user nudges; the work completes silently meanwhile.
 *
 * Algorithm:
 *   1. If disabled via env, allow.
 *   2. Read last assistant text — prefers hookData.last_assistant_message
 *      (the platform-provided field); falls back to hand-parsing
 *      transcript_path only when that field is absent.
 *   3. If no fire-and-forget claim → allow.
 *   4. If claim AND hookData.background_tasks OR session_crons non-empty → allow
 *      (real async machinery is in flight).
 *   5. Otherwise → BLOCK with a reason instructing the agent to either dispatch
 *      via a real async primitive in this turn or complete the work synchronously.
 *
 * Notes on what's NOT independently checked:
 *   - Monitor: if active, Stop wouldn't fire (Monitor holds the turn).
 *   - /goal:   if active, Stop wouldn't fire to completion.
 *   So both are implicitly handled by the fact that we're being called at all.
 *
 * Output (to stdout, always exits 0):
 *   pass:  {"continue": true}
 *   block: {"continue": true, "decision": "block", "reason": "<instructional>"}
 *
 * Env vars:
 *   ENSEMBLE_ASYNC_DISCIPLINE_DISABLE=1   skip the guard
 *   ENSEMBLE_ASYNC_DISCIPLINE_DEBUG=1     stderr diagnostics
 *
 * See .claude/rules/async-discipline.md for the behavioral rule.
 */

'use strict';

const { readLastAssistantText, getLastAssistantMessage } = require('./lib/transcript-text');
const { FIRE_AND_FORGET_PATTERNS, META_MARKERS, findMatch } = require('./lib/async-claim-detector');

function debug(msg) {
  if (process.env.ENSEMBLE_ASYNC_DISCIPLINE_DEBUG === '1') {
    const ts = new Date().toISOString();
    console.error(`[async-discipline ${ts}] ${msg}`);
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

// Self-documentation bypass: a message containing any of these is discussing the
// rule itself, not claiming async work. We are developing/documenting/debugging
// the rule. Skip the whole match check so the hook never trips on its own writeup.
const SELF_DOC_MARKERS = [
  /\[ASYNC-DISCIPLINE GUARD/,
  /async-discipline\.md/,
  /async-discipline\.js/,
  /\bfire-and-forget\b/i,
];

// stripCitations, the pattern battery (FIRE_AND_FORGET_PATTERNS), META_MARKERS,
// and the matching algorithm now live in ./lib/async-claim-detector.js and
// ./lib/transcript-text.js, shared with subagent-discipline.js (the
// SubagentStop counterpart of this guard) so there is exactly one pattern
// battery to maintain, not two.
function detectFireAndForgetClaim(text) {
  return findMatch(text, FIRE_AND_FORGET_PATTERNS, { selfDocMarkers: SELF_DOC_MARKERS, metaMarkers: META_MARKERS });
}

function detectActiveAsync(hookData) {
  const bg = hookData.background_tasks;
  if (Array.isArray(bg) && bg.length > 0) return `background_tasks (${bg.length})`;
  const crons = hookData.session_crons;
  if (Array.isArray(crons) && crons.length > 0) return `session_crons (${crons.length})`;
  return null;
}

const BLOCK_REASON_TEMPLATE = (claim) => `[ASYNC-DISCIPLINE GUARD — fire-and-forget claim with no async machinery]

Your last message claimed async work — "${claim.slice(0, 120)}${claim.length > 120 ? '…' : ''}" —
but no async primitive is active in this session:

  background_tasks: empty   (no Agent run_in_background in flight)
  session_crons:    empty   (no ScheduleWakeup / /schedule registered)
  Monitor:          not holding the turn  (you reached Stop)
  /goal:            not active            (you reached Stop)

A claim of async work that isn't backed by a real async primitive is a hallucinated
notification — nothing will tell you when the work completes; you will sit idle until the
user nudges you. See .claude/rules/async-discipline.md.

Choose one of these and continue:

  1. Re-dispatch using a real async primitive THIS turn:
       Agent({subagent_type, run_in_background: true, …})  — harness re-invokes you on completion
       ScheduleWakeup({delaySeconds: <ETA>, prompt: <next-action>}) — self-rendezvous after delay
       Monitor — hold the current turn open until the work completes (no idle gap)
       /goal <machine-checkable condition>                  — loop until the condition holds

  2. OR complete the work synchronously in this turn (Bash / Read / etc., no claim of async),
     and report results inline.

  3. OR, if there is genuine pending work the user must wait for that you cannot dispatch
     async (e.g. a long external job you don't control), explicitly say so and ask the user
     how to proceed — do not claim "I'll let you know" when you actually can't.`;

async function main(hookData) {
  if (process.env.ENSEMBLE_ASYNC_DISCIPLINE_DISABLE === '1') {
    debug('disabled via ENSEMBLE_ASYNC_DISCIPLINE_DISABLE=1');
    emit(false);
    return;
  }

  // Avoid stacking blocks on top of other Stop hooks (e.g. wiggum re-injection).
  // If the harness signals we're already inside a stop-hook continuation, pass through.
  if (hookData.stop_hook_active) {
    debug('hookData.stop_hook_active set; passing through to avoid stacked blocks');
    emit(false);
    return;
  }

  const text = getLastAssistantMessage(hookData);
  debug(`last assistant text length: ${text.length}`);

  const claim = detectFireAndForgetClaim(text);
  if (!claim) {
    debug('no fire-and-forget claim detected');
    emit(false);
    return;
  }
  debug(`detected fire-and-forget claim: "${claim.slice(0, 80)}…"`);

  const activeAsync = detectActiveAsync(hookData);
  if (activeAsync) {
    debug(`async machinery active (${activeAsync}); allowing stop`);
    emit(false);
    return;
  }

  debug('claim with no active async — BLOCKING stop');
  emit(true, BLOCK_REASON_TEMPLATE(claim));
}

// Stdin handling
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

module.exports = {
  FIRE_AND_FORGET_PATTERNS,
  detectFireAndForgetClaim,
  detectActiveAsync,
  readLastAssistantText,
  getLastAssistantMessage,
  SELF_DOC_MARKERS,
};
