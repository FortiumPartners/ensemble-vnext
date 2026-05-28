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
 *   2. Read last assistant text from transcript_path.
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

const fs = require('fs');

// Patterns require BOTH a deferral verb AND a completion-deferred trigger
// (when/once/after + done/complete/finished/ready/finishes/completes) — so
// "I'll let you know what I find" (immediate observation) does NOT match, but
// "I'll let you know when it's done" (deferred completion) does.
const COMPLETION_DEFER = '(when|once|after|as soon as|whenever)\\b[^.!?\\n]{0,80}\\b(done|complete|completes|finished|finishes|ready|finish)';
const NOTIFY_VERB = '(let you know|notify you|tell you|inform you|ping you|come back to (you|this))';

const FIRE_AND_FORGET_PATTERNS = [
  // "I'll [let you know|notify|ping you|tell you|come back to you] when X is done/complete/ready"
  new RegExp(`\\bI'?ll\\b[^.!?\\n]{0,40}\\b${NOTIFY_VERB}\\b[^.!?\\n]{0,40}\\b${COMPLETION_DEFER}\\b`, 'i'),
  // Variants without the "I'll" contraction
  new RegExp(`\\b(I will|I am going to|I'?m going to|let me)\\b[^.!?\\n]{0,40}\\b${NOTIFY_VERB}\\b[^.!?\\n]{0,40}\\b${COMPLETION_DEFER}\\b`, 'i'),
  // "I'll report back when …" / "I'll check back when …" / "I'll come back when …"
  /\bI'?ll\b[^.!?\n]{0,40}\b(report back|check back|come back)\b[^.!?\n]{0,80}\b(when|once|after|as soon as|with the (results|outcome|update))\b/i,
  // Background-task self-narration (direct fire-and-forget indicators regardless of context)
  /\brunning (it |this |that |them )?in the background\b/i,
  /\bhappening in the background\b/i,
  /\b(running|executing) (it |this |that )?asynchronously\b/i,
  /\bin the background (and|while|until)\b/i,
  // Dispatched / kicked off / started + notification intent + completion-defer language
  /\b(dispatched|kicked off|started running|started the)\b[^.!?\n]{0,120}\b(let you know|report back|come back|notify|ping you)\b[^.!?\n]{0,80}\b(when|once|after|as soon as|with the (results|outcome))\b/i,
  // "When it's done, I'll …"
  /\bwhen (it'?s|that'?s|the (work|task|job) (is|will be)) (done|complete|finished|ready)\b[^.!?\n]{0,80}\bI'?ll\b[^.!?\n]{0,40}\b(let you know|notify|report|ping you|tell you)\b/i,
];

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

/**
 * Extract the assistant text from the CURRENT turn only — i.e., text produced by
 * the assistant AFTER the most recent user message. This prevents earlier turns'
 * content and any hook-injected BLOCK_REASON (which lives on the user side of the
 * transcript) from being mis-scanned as the current claim.
 *
 * Returns concatenated text content from the current turn's assistant blocks,
 * or '' if no transcript is available.
 */
function readLastAssistantText(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return '';
  if (!fs.existsSync(transcriptPath)) return '';
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n').filter(Boolean);

    const roleOf = (entry) => entry.role || (entry.message && entry.message.role) || entry.type;

    // Find the most recent user message — turn boundary.
    let lastUserIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (roleOf(entry) === 'user') { lastUserIdx = i; break; }
    }

    // Collect assistant text entries STRICTLY after the boundary.
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    const texts = [];
    for (let i = startIdx; i < lines.length; i++) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (roleOf(entry) !== 'assistant') continue;
      const content = entry.content || (entry.message && entry.message.content);
      if (!content) continue;
      if (typeof content === 'string') { texts.push(content); continue; }
      if (Array.isArray(content)) {
        const blockTexts = content
          .filter((c) => c && (c.type === 'text' || typeof c.text === 'string'))
          .map((c) => c.text || '');
        if (blockTexts.length) texts.push(blockTexts.join('\n'));
      }
    }
    return texts.join('\n');
  } catch (err) {
    debug(`error reading transcript: ${err.message}`);
  }
  return '';
}

/**
 * Strip citations / code / examples so meta-discussion ABOUT the rule doesn't
 * trigger the regex. Replaces (not removes) so character indices stay sane for
 * any downstream context inspection.
 */
function stripCitations(text) {
  let out = text;
  // Fenced code blocks (multi-line ``` ... ```)
  out = out.replace(/```[\s\S]*?```/g, ' ');
  // Inline code spans (`...`) — anchored so apostrophes in prose don't collapse content
  out = out.replace(/`[^`\n]+`/g, ' ');
  // Straight double-quoted strings ("...")
  out = out.replace(/"[^"\n]*"/g, ' ');
  // Curly double-quoted strings (“...”)
  out = out.replace(/“[^“”\n]*”/g, ' ');
  // Single-quoted citations — require both quotes to sit on word/sentence boundaries
  // so contractions ("don't", "I'll", "it's") and possessives are NOT eaten.
  //   left  boundary: start of string / whitespace / opening punctuation
  //   right boundary: end of string / whitespace / sentence/closing punctuation
  out = out.replace(/(^|[\s(\[{,;:])'([^'\n]{2,})'(?=[\s.,!?:;)\]}]|$)/g, '$1 ');
  return out;
}

/**
 * Heuristic: even outside quotes, a fire-and-forget phrase preceded by an
 * explicit meta-discussion marker ("for example", "phrases like", "something
 * like", "e.g.") is talking ABOUT the pattern, not claiming it.
 */
const META_MARKERS = /\b(something like|for example|for instance|such as|phrases? like|claim(s)? like|words? like|messages? like|the phrase|the literal|example of|matched (phrase|text|claim)|saying|catches?|trigger(s)? a block|hook (catches|fires|blocks|would (block|catch))|would (trigger|block))\b/i;

// Self-documentation bypass: a message containing any of these is discussing the
// rule itself, not claiming async work. We are developing/documenting/debugging
// the rule. Skip the whole match check so the hook never trips on its own writeup.
const SELF_DOC_MARKERS = [
  /\[ASYNC-DISCIPLINE GUARD/,
  /async-discipline\.md/,
  /async-discipline\.js/,
  /\bfire-and-forget\b/i,
];

function detectFireAndForgetClaim(text) {
  if (!text) return null;

  // Bypass if the message is self-evidently about the rule (development /
  // documentation / debug discussion).
  for (const marker of SELF_DOC_MARKERS) {
    if (marker.test(text)) {
      debug(`text contains self-documentation marker (${marker.source}) — bypassing match check`);
      return null;
    }
  }

  // First strip quoted citations + code spans so prose meta-discussion doesn't trigger.
  const cleaned = stripCitations(text);
  for (const pattern of FIRE_AND_FORGET_PATTERNS) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    // Secondary defense: skip if a meta marker appears in the ~80 chars before the match
    const ctxStart = Math.max(0, match.index - 80);
    const before = cleaned.slice(ctxStart, match.index);
    if (META_MARKERS.test(before)) continue;
    return match[0];
  }
  return null;
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

  const text = readLastAssistantText(hookData.transcript_path);
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
  stripCitations,
  SELF_DOC_MARKERS,
};
