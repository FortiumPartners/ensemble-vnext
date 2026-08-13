#!/usr/bin/env node

/**
 * async-claim-detector.js — shared pattern battery + matcher for detecting
 * fire-and-forget / deferred-work claims in assistant text.
 *
 * Extracted from async-discipline.js (the Stop-event guard) so the SAME
 * pattern battery, meta-discussion bypass, and self-documentation escape
 * hatch can be reused by subagent-discipline.js (the SubagentStop-event
 * guard) instead of maintaining a second regex engine. See
 * `.claude/rules/async-discipline.md` for the behavioral rule these patterns
 * encode, and item 5e of docs/modernization/2026-08-improvement-plan.md for
 * why SubagentStop needs its own instance of this check.
 *
 * Callers own their OWN self-documentation markers (SELF_DOC_MARKERS) and
 * may extend FIRE_AND_FORGET_PATTERNS with situational patterns (e.g.
 * subagent-specific "I'll wait for X" phrasing) — findMatch() takes the
 * pattern list as a parameter rather than being hardwired to one list, so
 * extension doesn't require forking the matcher itself.
 */

'use strict';

const { stripCitations } = require('./transcript-text');

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

/**
 * Heuristic: even outside quotes, a fire-and-forget phrase preceded by an
 * explicit meta-discussion marker ("for example", "phrases like", "something
 * like", "e.g.") is talking ABOUT the pattern, not claiming it.
 */
const META_MARKERS = /\b(something like|for example|for instance|such as|phrases? like|claim(s)? like|words? like|messages? like|the phrase|the literal|example of|matched (phrase|text|claim)|saying|catches?|trigger(s)? a block|hook (catches|fires|blocks|would (block|catch))|would (trigger|block))\b/i;

/**
 * Find the first pattern in `patterns` that matches `text`, honoring a
 * self-documentation bypass and a meta-discussion context check.
 *
 * @param {string} text - raw candidate text (assistant message)
 * @param {RegExp[]} patterns - patterns to test, in priority order
 * @param {Object} [opts]
 * @param {RegExp[]} [opts.selfDocMarkers] - if any matches the RAW text, the
 *   whole check is bypassed (the message is discussing the rule itself, not
 *   violating it). Tested before stripCitations so quoting the rule's own
 *   file name still bypasses even inside a code span.
 * @param {RegExp} [opts.metaMarkers] - if this matches the ~80 chars before a
 *   pattern match, that match is skipped (meta-discussion, not a live claim).
 * @returns {string|null} the matched substring, or null if nothing matched.
 */
function findMatch(text, patterns, opts = {}) {
  if (!text) return null;
  const { selfDocMarkers = [], metaMarkers } = opts;

  for (const marker of selfDocMarkers) {
    if (marker.test(text)) return null;
  }

  const cleaned = stripCitations(text);
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    if (metaMarkers) {
      const ctxStart = Math.max(0, (match.index || 0) - 80);
      const before = cleaned.slice(ctxStart, match.index || 0);
      if (metaMarkers.test(before)) continue;
    }
    return match[0];
  }
  return null;
}

module.exports = {
  FIRE_AND_FORGET_PATTERNS,
  META_MARKERS,
  findMatch,
};
