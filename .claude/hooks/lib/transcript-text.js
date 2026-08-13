#!/usr/bin/env node

/**
 * transcript-text.js — shared transcript/text helpers for the discipline hooks.
 *
 * Consolidates two pieces of logic that used to live duplicated, byte-for-byte,
 * in both async-discipline.js and autonomy-discipline.js:
 *
 *   - readLastAssistantText(transcriptPath): parse a JSONL transcript backwards
 *     to the most recent user-message boundary, then collect assistant text
 *     produced strictly after it (i.e., the current turn only).
 *   - stripCitations(text): blank out fenced code, inline code, and quoted
 *     strings so meta-discussion ABOUT a pattern (documentation, examples)
 *     doesn't trip the pattern itself.
 *
 * As of the `last_assistant_message` Stop/SubagentStop payload field, this
 * transcript scan is a FALLBACK ONLY — hooks should prefer
 * `hookData.last_assistant_message` when present and call readLastAssistantText
 * only when it is absent. See getLastAssistantMessage() below, which
 * encapsulates that preference so callers don't re-implement it.
 */

'use strict';

const fs = require('fs');

/**
 * Extract the assistant text from the CURRENT turn only — i.e., text produced
 * by the assistant AFTER the most recent user message. This prevents earlier
 * turns' content and any hook-injected BLOCK_REASON (which lives on the user
 * side of the transcript) from being mis-scanned as the current claim.
 *
 * Returns concatenated text content from the current turn's assistant blocks,
 * or '' if no transcript is available.
 *
 * @param {string} transcriptPath
 * @returns {string}
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
  } catch {
    // Defensive: never throw out of a transcript read. Callers treat '' as
    // "nothing to scan" (equivalent to no claim detected).
  }
  return '';
}

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
  //   left  boundary: start of string / whitespace / opening punctuation
  //   right boundary: end of string / whitespace / sentence/closing punctuation
  out = out.replace(/(^|[\s(\[{,;:])'([^'\n]{2,})'(?=[\s.,!?:;)\]}]|$)/g, '$1 ');
  return out;
}

/**
 * Resolve "the assistant's last message" for a hook payload, preferring the
 * platform-provided field over hand-parsing a transcript file.
 *
 * The Stop/SubagentStop payload carries `last_assistant_message` directly.
 * The docs warn the transcript file on disk can lag the in-memory
 * conversation, so treat it strictly as a fallback for when the field is
 * absent (older harness versions, or an event that doesn't populate it).
 *
 * @param {Object} hookData
 * @param {string} [fallbackPathField] - which hookData field to read the
 *   transcript path from when last_assistant_message is absent. Defaults to
 *   'transcript_path'; SubagentStop callers may prefer 'agent_transcript_path'.
 * @returns {string}
 */
function getLastAssistantMessage(hookData, fallbackPathField = 'transcript_path') {
  const data = hookData || {};
  if (typeof data.last_assistant_message === 'string' && data.last_assistant_message.length > 0) {
    return data.last_assistant_message;
  }
  return readLastAssistantText(data[fallbackPathField]);
}

module.exports = {
  readLastAssistantText,
  stripCitations,
  getLastAssistantMessage,
};
