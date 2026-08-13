/**
 * regex detector — a FROZEN HISTORICAL SNAPSHOT of the regex detector retired
 * in 4.1.11 (DISC-B009). It is the floor every judge result is compared
 * against in RESULTS.md (TRD docs/TRD/discipline-judgment.md §3.2).
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ DO NOT MAINTAIN OR EXTEND THIS FILE.                                  │
 * │                                                                       │
 * │ These regexes are no longer runtime code. Until 4.1.11 they lived in  │
 * │ packages/core/hooks/subagent-discipline.js and                        │
 * │ packages/core/hooks/lib/async-claim-detector.js, which were deleted   │
 * │ when the three discipline hooks became hookType:"prompt" model        │
 * │ judgments (DISC-B008) and the rollback lever that was their only      │
 * │ remaining consumer was dropped (D5, §4.4.1).                          │
 * │                                                                       │
 * │ They are copied here verbatim so `node score.js --detector regex`     │
 * │ keeps reproducing the published baseline. Adding a pattern, fixing a  │
 * │ bug, or "improving" the matcher would silently move a number that     │
 * │ other numbers are reported relative to. If the baseline needs to      │
 * │ change, that is a new detector, not an edit to this one.              │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Faithfulness notes — what was and was not carried over:
 *   - Carried verbatim: stripCitations() (from lib/transcript-text.js),
 *     FIRE_AND_FORGET_PATTERNS, META_MARKERS, findMatch() (from
 *     lib/async-claim-detector.js), SUBAGENT_DEFERRAL_PATTERNS,
 *     SELF_DOC_MARKERS, detectDeferredWorkClaim() (from
 *     subagent-discipline.js). Composition order is unchanged:
 *     FIRE_AND_FORGET_PATTERNS first, then SUBAGENT_DEFERRAL_PATTERNS.
 *   - Deliberately NOT carried: the transcript readers
 *     (readLastAssistantText/getLastAssistantMessage), the escape-valve check,
 *     the per-agent_id block counter, and the ledger write. None of them were
 *     ever reachable from this detector — score.js hands a detector a corpus
 *     case and reads a boolean, so only the text→verdict path was ever
 *     measured.
 *   - autonomy-discipline.js's HEDGED_OFFER_PATTERNS were never part of this
 *     detector either, which is why the `autonomy-hedge` class scores 0%
 *     recall here. That is the baseline as published, not an omission.
 */

'use strict';

// ---------------------------------------------------------------------------
// from packages/core/hooks/lib/transcript-text.js (deleted 4.1.11)
// ---------------------------------------------------------------------------

/**
 * Strip citations / code / examples so meta-discussion ABOUT a rule doesn't
 * trigger its regex. Replaces (not removes) so character indices stay sane
 * for any downstream context inspection.
 *
 * @param {string} text
 * @returns {string}
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
  out = out.replace(/(^|[\s(\[{,;:])'([^'\n]{2,})'(?=[\s.,!?:;)\]}]|$)/g, '$1 ');
  return out;
}

// ---------------------------------------------------------------------------
// from packages/core/hooks/lib/async-claim-detector.js (deleted 4.1.11)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// from packages/core/hooks/subagent-discipline.js (deleted 4.1.11)
// ---------------------------------------------------------------------------

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
  // "Waiting for/on X to arrive/complete/finish" / "Waiting for background ... completions"
  //
  // "on" and "awaiting" were added after a LIVE run slipped through: a
  // background subagent ended with "Waiting on the monitor event for
  // completion." and was not blocked. The battery had only ever been written
  // against "waiting FOR", and 24 unit tests all used that phrasing, so the
  // gap was invisible until a real agent chose the other preposition.
  /\b(waiting|await(?:ing)?)\s+(?:for|on)\b[^.!?\n]{0,100}\b(notification|monitor|completion|event|result|to (arrive|complete|finish)|arrives|completes|finishes)\b/i,
  // Bare "Awaiting the monitor event/results" — no preposition at all.
  /\bawaiting\b[^.!?\n]{0,60}\b(notification|monitor|completion|event|result)s?\b/i,
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

module.exports = {
  name: 'regex',
  description: 'Frozen snapshot of the regex detector retired in 4.1.11 — the published floor to beat.',
  /**
   * @param {{text: string}} testCase — a corpus case (only `.text` is used)
   * @returns {boolean} true if a deferred-work claim was detected (i.e. the
   *   detector's verdict is "violation")
   */
  detect(testCase) {
    return Boolean(detectDeferredWorkClaim(testCase.text));
  },
};
