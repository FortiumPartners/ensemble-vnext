#!/usr/bin/env node

/**
 * autonomy-discipline.js — Stop hook catching hedged-pause-offers in workflow commands.
 *
 * Prevents the failure mode where a workflow command finishes a phase/step cleanly,
 * KNOWS the right answer is to continue, and then asks the user anyway via a hedged
 * "I'll proceed unless you want to pause" / "Want me to keep going, or pause for a
 * look?" framing. Such offers force the user back into the loop and defeat the
 * orchestrated-autonomous-execution design (see .claude/rules/autonomy.md).
 *
 * Algorithm:
 *   1. If disabled via env, allow.
 *   2. If stop_hook_active (we're inside another Stop-hook continuation), allow —
 *      don't stack blocks.
 *   3. Read last assistant text (current turn only) from transcript_path.
 *   4. If no command-execution context (no [STATUS: /...] / COMMAND banner) → allow.
 *      This avoids blocking normal conversational questions.
 *   5. If the active command is /refine-prd or /refine-trd (intentionally interactive)
 *      → allow.
 *   6. If self-documentation marker present (we're discussing the rule, not violating
 *      it) → allow.
 *   7. If no hedged-pause-offer pattern matched → allow.
 *   8. Otherwise → BLOCK with a reason instructing the model to delete the offer
 *      and continue.
 *
 * Output (to stdout, always exits 0):
 *   pass:  {"continue": true}
 *   block: {"continue": true, "decision": "block", "reason": "<instructional>"}
 *
 * Env vars:
 *   ENSEMBLE_AUTONOMY_DISCIPLINE_DISABLE=1   skip the guard
 *   ENSEMBLE_AUTONOMY_DISCIPLINE_DEBUG=1     stderr diagnostics
 *
 * See .claude/rules/autonomy.md for the behavioral rule.
 */

'use strict';

const fs = require('fs');

// Hedged-offer / continue-prompt patterns. All target NEXT-ACTION questions about
// the MODEL (continue/proceed/pause/review/keep going), not domain questions.
const HEDGED_OFFER_PATTERNS = [
  // "I'll [continue|proceed|keep going|go on|move on] [...] unless [you|otherwise]"
  /\bI'?ll\s+(continue|proceed|keep going|go on|move on|advance)[^.!?\n]{0,80}\bunless\b[^.!?\n]{0,60}\b(you|otherwise)\b/i,
  // "Want me to [continue|proceed|keep going|pause|review|stop|move on]"
  /\b(do you )?want me to\s+(continue|proceed|keep going|pause|review|move on|stop)\b/i,
  // "Would you like me to ..."
  /\bwould you like me to\s+(continue|proceed|pause|review|stop|move on|keep going)\b/i,
  // "Should I [proceed|continue|move on|advance] (to|with|into|now)?"
  /\bshould I\s+(proceed|continue|move on|advance)\b/i,
  // "Shall I [proceed|continue|move on]"
  /\bshall I\s+(proceed|continue|move on)\b/i,
  // "OK/Okay/Ready to [proceed|continue|move on]?"
  /\b(ok|okay|ready)\s+to\s+(proceed|continue|move on|advance)\??/i,
  // "Let me know if you (want|need|prefer) me to ..."
  /\blet me know if you\s+(want|need|would like|prefer)\s+me to\s+(continue|proceed|pause|review|stop)\b/i,
  // bare "continue?" / "proceed?" at end of line
  /\b(continue|proceed)\s+(now|here)?\?\s*$/im,
  // "pause and review" / "pause for a look" / "pause for review"
  /\bpause (and (review|inspect|check)|for (a look|review|inspection|check))\b/i,
  // literal "keep going, or pause" (the user-reported symptom)
  /\bkeep going[,]?\s+or\s+pause\b/i,
  // "checkpoint reached" + question mark
  /\bcheckpoint (reached|complete)\b[^.!?\n]{0,80}\?/i,
  // "ready for (the )?next [phase|step|round|iteration|...]?"
  /\bready for (the )?next\b/i,
];

// Self-documentation markers — text discussing the rule itself, not violating it.
const SELF_DOC_MARKERS = [
  /\[AUTONOMY (GUARD|DISCIPLINE)/i,
  /autonomy\.md/,
  /autonomy-discipline\.js/,
  /\bAutonomous-execution discipline\b/,
  /\bHEDGED OFFERS ARE STILL OFFERS\b/,
  /\bfour valid (AskUserQuestion )?cases\b/i,
  /\banti-patterns?\s+(to|the)\s+(eliminate|forbid|avoid)\b/i,
];

// Meta-discussion markers — phrases preceded by these are talking ABOUT the pattern.
const META_MARKERS = /\b(something like|for example|for instance|such as|phrases? like|the phrase|the literal|example of|matched (phrase|text)|saying|catches?|would (trigger|block|catch))\b/i;

function debug(msg) {
  if (process.env.ENSEMBLE_AUTONOMY_DISCIPLINE_DEBUG === '1') {
    const ts = new Date().toISOString();
    console.error(`[autonomy-discipline ${ts}] ${msg}`);
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
 * Read assistant text produced AFTER the most recent user message — strict turn
 * boundary (prevents earlier-turn content and hook-injected reasons from leaking in).
 */
function readLastAssistantText(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return '';
  if (!fs.existsSync(transcriptPath)) return '';
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n').filter(Boolean);
    const roleOf = (entry) => entry.role || (entry.message && entry.message.role) || entry.type;

    let lastUserIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (roleOf(entry) === 'user') { lastUserIdx = i; break; }
    }

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

function stripCitations(text) {
  let out = text;
  out = out.replace(/```[\s\S]*?```/g, ' ');
  out = out.replace(/`[^`\n]+`/g, ' ');
  out = out.replace(/"[^"\n]*"/g, ' ');
  out = out.replace(/“[^“”\n]*”/g, ' ');
  out = out.replace(/(^|[\s(\[{,;:])'([^'\n]{2,})'(?=[\s.,!?:;)\]}]|$)/g, '$1 ');
  return out;
}

/**
 * Detect command-execution context. Only enforce autonomy discipline when the
 * recent text shows a workflow-command is running.
 */
function isCommandContext(text) {
  if (!text) return null;
  const statusMatch = text.match(/\[STATUS:\s*\/([a-z][a-z0-9-]*)\]/i);
  if (statusMatch) return { command: statusMatch[1].toLowerCase(), source: 'STATUS' };
  const cmdMatch = text.match(/═══ COMMAND (?:COMPLETE|STUCK):\s*\/([a-z][a-z0-9-]*)/i);
  if (cmdMatch) return { command: cmdMatch[1].toLowerCase(), source: 'COMMAND' };
  return null;
}

function isExemptCommand(ctx) {
  if (!ctx || !ctx.command) return false;
  return ctx.command === 'refine-prd' || ctx.command === 'refine-trd';
}

function detectHedgedOffer(text) {
  if (!text) return null;

  for (const marker of SELF_DOC_MARKERS) {
    if (marker.test(text)) {
      debug(`self-doc marker (${marker.source}) — bypassing`);
      return null;
    }
  }

  const cleaned = stripCitations(text);
  for (const pattern of HEDGED_OFFER_PATTERNS) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    const ctxStart = Math.max(0, (match.index || 0) - 80);
    const before = cleaned.slice(ctxStart, match.index || 0);
    if (META_MARKERS.test(before)) continue;
    return match[0];
  }
  return null;
}

const BLOCK_REASON_TEMPLATE = (offer, cmd) => `[AUTONOMY GUARD — hedged-pause-offer detected in workflow command]

Your last message offered the user a pause / review / "should I continue?" question:

  "${offer.slice(0, 160)}${offer.length > 160 ? '…' : ''}"

…inside a /${cmd || '<workflow-command>'} run. Per .claude/rules/autonomy.md, the user
already authorized the run by invoking the command; mid-loop confirmation prompts
(including HEDGED ones like "I'll proceed unless you want to pause") are anti-patterns.
You knew the right answer when you drafted the message — that's why you hedged.

What to do now:

  1. Delete the pause-offer sentence(s) from your output.
  2. Continue execution: emit the next [STATUS: /${cmd || '<cmd>'}] DISPATCHED line,
     spawn the next phase, or finish the work and emit ═══ COMMAND COMPLETE.
  3. If you genuinely cannot continue (one of the FOUR valid AskUserQuestion cases
     applies — see autonomy.md), say WHICH case applies and ask the specific question
     directly. Do NOT hedge.

The only legitimate Stop point in a workflow command is COMMAND COMPLETE (or
COMMAND STUCK after retry exhaustion). Routine phase boundaries, "given X went cleanly"
checkpoints, and "want me to keep going?" prompts are not legitimate.

If --wiggum is set, the four valid cases shrink to ONE (STUCK only). Asking under
--wiggum is doubly forbidden.`;

async function main(hookData) {
  if (process.env.ENSEMBLE_AUTONOMY_DISCIPLINE_DISABLE === '1') {
    debug('disabled via ENSEMBLE_AUTONOMY_DISCIPLINE_DISABLE=1');
    return emit(false);
  }

  if (hookData && hookData.stop_hook_active) {
    debug('stop_hook_active — bypassing to avoid stacked block');
    return emit(false);
  }

  const text = readLastAssistantText(hookData && hookData.transcript_path);
  if (!text) {
    debug('no assistant text — allow');
    return emit(false);
  }

  const ctx = isCommandContext(text);
  if (!ctx) {
    debug('no workflow-command context — allow (normal conversation)');
    return emit(false);
  }

  if (isExemptCommand(ctx)) {
    debug(`exempt command /${ctx.command} (intentionally interactive) — allow`);
    return emit(false);
  }

  const offer = detectHedgedOffer(text);
  if (!offer) {
    debug(`no hedged-offer pattern in /${ctx.command} — allow`);
    return emit(false);
  }

  debug(`BLOCK: /${ctx.command} hedged-offer "${offer.slice(0, 80)}"`);
  return emit(true, BLOCK_REASON_TEMPLATE(offer, ctx.command));
}

// Only execute the stdin-driven flow when invoked as a script (not when require'd
// from test code or another module).
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
      emit(false);
    }
  });
  process.stdin.on('error', (err) => {
    debug(`stdin error: ${err.message}`);
    emit(false);
  });
}

module.exports = {
  HEDGED_OFFER_PATTERNS,
  SELF_DOC_MARKERS,
  detectHedgedOffer,
  isCommandContext,
  isExemptCommand,
  stripCitations,
  readLastAssistantText,
};
