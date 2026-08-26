#!/usr/bin/env node

/**
 * build-judge-prompts.js — single source of truth for the three `type: "prompt"`
 * discipline-hook judgments (docs/TRD/discipline-judgment.md DISC-B004, §2.2.1
 * Shape A, §2.3).
 *
 * WHY ONE GENERATOR INSTEAD OF THREE HAND-WRITTEN PROMPTS
 *
 * All three judgments (async-discipline, subagent-discipline, autonomy-discipline)
 * share four pieces of logic that must never drift apart:
 *   1. The `stop_hook_active` loop guard (§2.2.1 U3) — same precedence, same wording.
 *   2. "Judge the reasoning, not the vocabulary" — the exact framing that failed as
 *      regex (a matcher only catches what someone already thought to pattern for).
 *   3. Self-documentation is not a violation (§2.3.3) — this repo's rule files, TRDs,
 *      and hook source comments are FULL of the words a violation would use.
 *   4. Fail-open on uncertainty — a false block is worse than a missed one.
 *
 * If these were three independent prose files, the exact failure mode this TRD exists
 * to fix — "the fix landed in one place and not the sibling that needed it too"
 * (4.1.8's `\bcompletion\b` fix was itself a single-pattern patch to a battery that
 * had 24 tests, all sharing one vocabulary blind spot) — could recur at the prompt
 * level: someone tightens the loop-guard wording in one hook's prompt during a future
 * edit and forgets the other two. A single SHARED block, spliced into three configs
 * by one function, makes that class of drift structurally impossible: there is only
 * one place to edit.
 *
 * What legitimately differs per hook is real: WHAT counts as a violation, and what the
 * available escape valves are (subagent's ScheduleWakeup removal is structural and
 * unique to SubagentStop; autonomy-discipline's exceptions are the four
 * `.claude/rules/autonomy.md` cases, not an async-machinery check at all). Those live
 * in per-hook `sections` below, clearly separated from SHARED.
 *
 * OUTPUT
 *
 * `node build-judge-prompts.js` regenerates the two ready-to-embed prompt text files in
 * this directory from the templates below:
 *   discipline-stop.prompt.md     (async-discipline + autonomy-discipline merged onto
 *                                   one `Stop` hook -- FIX-002, see
 *                                   docs/TRD/judge-prompt-generative-rule.md)
 *   subagent-discipline.prompt.md (unmerged; SubagentStop)
 *
 * These are literal strings meant to be dropped into a `hooks.manifest.json` entry's
 * `"prompt"` field by DISC-B005/B008 (not this task — this task does not touch the
 * manifest or the hook .js files). They intentionally do NOT reference $ARGUMENTS
 * inside instructional sentences (requirement in the DISC-B004 brief): $ARGUMENTS
 * appears exactly once, in its own labeled "## Payload" block, because the platform
 * echoes the raw configured prompt text (unexpanded $ARGUMENTS included) back to the
 * EVALUATED session as part of "Stop hook feedback: [<prompt>]: <reason>" — weaving
 * $ARGUMENTS into instructional prose caused visible confusion in that echoed context
 * during the U2 probe (docs/modernization/probes/U2-prompt-payload.md §2, "How the
 * substitution actually works").
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// SHARED — identical across all three judgments. Edit here, not per-file.
// ---------------------------------------------------------------------------

const PAYLOAD_BLOCK = `## Payload

$ARGUMENTS`;

const LOOP_GUARD_BLOCK = `## First, the loop guard

If \`stop_hook_active\` is true in the payload, call submit({ ok: true }) immediately and
stop reading. This caps corrections at one round-trip and is checked before anything else.`;

const VOCABULARY_WARNING_BLOCK = (violationReframe) => `## Judge the claim, not the wording

Do not pattern-match trigger phrases. The regex battery this replaced missed a real
violation on a one-word paraphrase, and a mental checklist is just as brittle.
${violationReframe}`;

const SELF_DOC_BLOCK = `## Talking about the rule is not breaking it

This project's rule files, TRDs, commit messages and ordinary conversation are saturated
with the exact words a violation uses, because they describe the rule. Ask only whether
\`last_assistant_message\` is itself making the claim right now, addressed to whoever reads
next. Literal placeholders (\`<count>\`, \`<command-name>\`) mean a template is being
documented, not an assertion made. When unsure, treat it as discussion and allow.`;

const DISCLOSURE_BLOCK = `## Reporting is not claiming

Naming what you did, what remains, or what you are blocked on hands back no decision and
asserts nothing about work in flight. A status banner accurately describing real dispatched
work is fine -- check it against the payload like any other claim. What is not fine is a
status claim that misdescribes what the payload actually shows.`;

// Takes an optional per-hook insert (`imminentActionExtra`) spliced in after the opening
// paragraph. The block is otherwise SHARED and must stay so — the insert exists only for
// evidence that is genuinely hook-specific (async-discipline's participial-form case was
// observed live on `Stop`), not as a general escape hatch for divergence.
const IMMINENT_ACTION_BLOCK = (extra) => `## There is no "about to"

The turn is ending now, so a final message asserting an action as imminent-and-unstarted
("Dispatching all three.", "Next I'll run the tests") has not taken it -- already false,
not merely unfulfilled. Grammar is irrelevant: a bare participle claims it as strongly as
"I will". This covers actions leaving no payload trace, so absent evidence proves nothing.

Two things it must not catch: narration inside a turn that then delivers (you only ever
see the LAST message), and advice about what the USER should do next. When you cannot
tell, allow.${extra ? `\n\n${extra}` : ''}`;

const UNCERTAINTY_BLOCK = `## When uncertain, allow

A missed violation costs one idle turn someone will notice. A false block interrupts
correct work -- and since this project's own rules and docs are written in exactly the
vocabulary a violation uses, a judge that leans toward blocking would eventually block its
own maintenance. Prefer the cheaper mistake.`;

const NO_TOOLS_BLOCK = `## Judge from the payload only

Do not open files or read the transcript. \`last_assistant_message\` is the only text under
evaluation.`;

function violationInstructionBlock(claimDescription, whatToDoInstead) {
  return `## If this is a violation

Call submit with \`ok: false\` and a \`reason\` written directly to the agent whose turn is
being blocked (second person), that:

  1. Names the specific claim or offer in its own words — quote the relevant fragment of
     \`last_assistant_message\`.
  2. States plainly why it doesn't hold up: ${claimDescription}
  3. Tells it exactly what to do in its next turn instead: ${whatToDoInstead}

Keep the reason short and concrete — it is echoed back verbatim as the reason the turn
didn't end, and it is the agent's only signal for what to fix.`;
}

// ---------------------------------------------------------------------------
// Per-hook content — what legitimately differs.
// ---------------------------------------------------------------------------

const HOOKS = {
  // ---------------------------------------------------------------------
  'async-discipline': {
    event: 'Stop',
    intro: `You judge one question: does this turn's final message claim work is happening
asynchronously -- deferring, waiting, promising to notify or report back -- when nothing
backs that up? The failure it catches: an agent says "I'll let you know when it's done",
ends its turn, and nothing will ever tell it. It sits idle until someone nudges it.`,
    escapeValve: `A deferral claim is legitimate only if the payload shows machinery that plausibly IS what
the message says it is waiting on -- a matching entry in \`background_tasks\` or
\`session_crons\`.

Non-empty is not enough. \`background_tasks\` ACCUMULATES and is not a live-process list:
one session with 2 open agents showed 49 entries. Do not count -- ask whether some entry
corresponds to the thing named. A message naming a specific agent, task or workflow the
payload contradicts is the failure this exists to catch; a message gesturing vaguely at
"work in flight" names nothing checkable, so allow it.

\`Bash({run_in_background: true})\` is real async that does NOT appear in
\`background_tasks\`. When a turn points at a specific background process -- a task id, a
PID, a log file -- allow, and judge any other deferral in the same message on its own.

Machinery used earlier in the turn does not excuse a claim made now: if its subject has
already finished and been consumed, nothing is left to wait on.`,
    imminentActionExtra: ``,
    violationReframe: `Is the message asserting, as its current status, that something will notify it later or
that it will come back to check -- with nothing in the payload able to make that true?`,
    claimDescription: `an unbacked claim that something will notify or resume you later`,
    whatToDoInstead: `dispatch it for real (\`Agent({run_in_background: true})\` or \`ScheduleWakeup\`) and say so,
or do the work now and report the actual result instead of promising one`,
  },

  // ---------------------------------------------------------------------
  'subagent-discipline': {
    event: 'SubagentStop',
    intro: `You judge a subagent that is stopping, on two things: (a) did it claim it will resume or
be notified later -- impossible for a subagent, which has no \`ScheduleWakeup\` -- and (b)
did it return no usable result to its caller?`,
    escapeValve: `A subagent cannot schedule its own wake, so a non-empty \`session_crons\` is never a valid
excuse here. A non-empty \`background_tasks\` IS legitimate: the subagent dispatched its own
nested background work.`,
    violationReframe: `Is the subagent claiming it will resume later (it cannot), or stopping without returning a
usable result?`,
    claimDescription: `a deferral a subagent cannot fulfil, or a stop with no usable result`,
    whatToDoInstead: `finish the work now and return the result, or state the blocker plainly and stop`,
  },

  // ---------------------------------------------------------------------
  'autonomy-discipline': {
    event: 'Stop',
    intro: `You judge one question: does this turn's final message hand back a decision or action the
agent could have taken itself? Invoking the command was the authorization; pausing mid-run
to re-ask for it defeats an unattended run.

Grammar is irrelevant. "Should I fix it?", "Want me to fix it?", "I can fix it if you
want", "Say the word and I'll fix it" are the same move, and the declaratives slip past
because they read as disclosing a capability. Measured here: the same investigation was
offered twice as "say the word", allowed both times, and never happened.

Only four pauses are legitimate: a real requirement gap with no default, information that
genuinely cannot be derived, a truly irreversible destructive step, or a STUCK condition
after retries. \`/refine-prd\` and \`/refine-trd\` are interactive by design and exempt.`,
    escapeValve: `No payload field settles this one -- judge from what the message is asking and why. A
legitimate ask informs one bounded decision and usually states the default it will apply
if unanswered. A routine "should I continue?" is a violation whichever command emitted it.`,
    violationReframe: `Is the message inviting the user back into a decision the command was already authorized
to make -- including hedged forms that still function as a pause?`,
    claimDescription: `a pause on a decision the command was already authorized to make`,
    whatToDoInstead: `apply the best available default and continue toward the COMMAND COMPLETE banner without
asking again`,
  },
};

// The LAST thing the judge reads. Deliberately placed after the violation
// instructions, which end on "compose a good reason" and otherwise leave the
// model primed to write prose.
//
// WHY THIS EXISTS: measured 2026-08-16 over one session -- 31 of 251 hook
// evaluations (~12%) recorded a `hookErrors` entry containing the judge's
// KEEP THIS BLOCK (re-justified 2026-08-18 against upstream, after it was queued for
// possible reversion as ~2.5KB spent on a ~1% problem). Research settled which half of
// the "Stop hook error" noise is ours:
//   - BLOCKS rendering as "Stop hook error:" is anthropics/claude-code#62139, an OPEN
//     upstream TUI labelling bug (ok:false is the intended success path for review
//     hooks). Nothing in this file can fix it and nothing here should try.
//   - ALLOWS rendering that way IS ours: the CLI surfaces whatever `reason` is present,
//     so an ok:true verdict that attaches prose is displayed identically to a block.
//     That is precisely what this block forbids. Measured 41 blocks vs 2 such allows.
// #11947 (prompt Stop hook returning {decision, reason} instead of {ok}) is upstream
// evidence that a judge's response shape needs stating explicitly, not assuming.
//
// REASONING TEXT, for ALLOW verdicts as well as blocks. The CLI renders those as
// "Stop hook error:" followed by the entire 13-17 KB prompt, so the operator sees
// pages of prompt and no useful information. The prompt had zero instructions
// that the response must be the tool call alone, and ended on the branch that
// asks for a written reason.
const RESPONSE_CONTRACT_BLOCK = `## Your entire response is one submit call

submit({ ok: true }) or submit({ ok: false, reason: "<short, concrete, second-person>" }).
No prose before, after, or instead of it. If you find yourself explaining why something is
fine, call submit({ ok: true }) instead.`;

function buildPrompt(hookName) {
  const h = HOOKS[hookName];
  if (!h) throw new Error(`Unknown hook "${hookName}". Known: ${Object.keys(HOOKS).join(', ')}`);

  const parts = [
    h.intro,
    PAYLOAD_BLOCK,
    LOOP_GUARD_BLOCK,
    h.escapeValve,
    DISCLOSURE_BLOCK,
    IMMINENT_ACTION_BLOCK(h.imminentActionExtra),
    VOCABULARY_WARNING_BLOCK(h.violationReframe),
    SELF_DOC_BLOCK,
    UNCERTAINTY_BLOCK,
    NO_TOOLS_BLOCK,
    violationInstructionBlock(h.claimDescription, h.whatToDoInstead),
    RESPONSE_CONTRACT_BLOCK,
  ];

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// buildCombinedPrompt — the FIX-002 merge (docs/TRD/judge-prompt-generative-rule.md).
//
// async-discipline and autonomy-discipline both fire on `Stop`, both judge the
// LEAD session's `last_assistant_message`, and both carried a full private copy
// of every SHARED block (PAYLOAD, LOOP_GUARD, DISCLOSURE, IMMINENT_ACTION,
// VOCABULARY_WARNING's scaffolding, SELF_DOC, UNCERTAINTY, NO_TOOLS,
// RESPONSE_CONTRACT) — 33KB+ delivered to the model on every single Stop event
// for text that is, structurally, one shared skeleton wrapped around two
// per-hook cores. subagent-discipline already proves the target shape: ONE
// prompt, TWO independent judgments ((a) structurally-impossible deferral, (b)
// no usable result), sharing one payload/loop-guard/self-doc/uncertainty
// scaffold and resolving to one `submit` call whose `reason` names which
// judgment failed.
//
// This function does the same thing GENERICALLY, for any set of Stop-event
// hooks in HOOKS, by reusing each hook's `intro` / `escapeValve` /
// `imminentActionExtra` / `violationReframe` / `claimDescription` /
// `whatToDoInstead` VERBATIM — the substantive judgment clauses do not change
// a single word; only the connective tissue (which of them is now shared once
// instead of duplicated, and how the final verdict names which judgment
// fired) is new.
function buildCombinedPrompt(hookNames) {
  const hs = hookNames.map((name) => {
    const h = HOOKS[name];
    if (!h) throw new Error(`Unknown hook "${name}". Known: ${Object.keys(HOOKS).join(', ')}`);
    return h;
  });

  const events = new Set(hs.map((h) => h.event));
  if (events.size !== 1) {
    throw new Error(`buildCombinedPrompt requires all hooks to share one event, got: ${[...events].join(', ')}`);
  }

  const header = `You are evaluating a single \`${[...events][0]}\` hook for the LEAD session
(not a subagent). This hook carries ${hs.length} INDEPENDENT judgments about the same
\`last_assistant_message\`, each a violation on its own — evaluate both before responding.
Each is described below, then combined into one \`submit\` call.`;

  const introSection = hs
    .map((h, i) => `## Judgment ${String.fromCharCode(65 + i)} — ${hookNames[i]}\n\n${h.intro}`)
    .join('\n\n');

  const escapeValveSection = hs.map((h) => h.escapeValve).join('\n\n');

  const combinedReframe = hs
    .map((h, i) =>
      i === 0
        ? h.violationReframe
        : `Independently of Judgment ${String.fromCharCode(64 + i)} above, also ask: ${h.violationReframe}`
    )
    .join('\n\n');

  // Only include the block once — it is generic to any imminent-action claim
  // at Stop, not specific to one hook. Use whichever hook actually carries a
  // per-hook `imminentActionExtra` (today: async-discipline only).
  const imminentExtra = hs.map((h) => h.imminentActionExtra).find(Boolean);

  const combinedViolationBlock = (() => {
    const perJudgment = hs
      .map(
        (h, i) =>
          `  **Judgment ${String.fromCharCode(65 + i)} (${hookNames[i]}):** ${h.claimDescription}\n  If this is the one that failed, tell it instead: ${h.whatToDoInstead}`
      )
      .join('\n\n');

    return `## If a judgment is a violation

Call submit with \`ok: false\` and a short \`reason\` addressed to the blocked agent, in the
second person: name which judgment failed, quote the fragment, and say what to do instead.

${perJudgment}

The reason is echoed back verbatim and is the agent's only signal. Don't mention a judgment
that didn't fail. If none is a violation, call submit with \`ok: true\`.`;
  })();

  const parts = [
    header,
    introSection,
    PAYLOAD_BLOCK,
    LOOP_GUARD_BLOCK,
    escapeValveSection,
    DISCLOSURE_BLOCK,
    IMMINENT_ACTION_BLOCK(imminentExtra),
    VOCABULARY_WARNING_BLOCK(combinedReframe),
    SELF_DOC_BLOCK,
    UNCERTAINTY_BLOCK,
    NO_TOOLS_BLOCK,
    combinedViolationBlock,
    RESPONSE_CONTRACT_BLOCK,
  ];

  return parts.join('\n\n');
}

// The Stop-event hooks merged into one prompt/promptFile (FIX-002). Kept as a
// named constant so both main() and the regeneration test iterate the same
// list rather than risking drift between "what's merged" and "what's checked".
const STOP_DISCIPLINE_HOOKS = ['async-discipline', 'autonomy-discipline'];
const STOP_DISCIPLINE_PROMPT_FILE = 'discipline-stop.prompt.md';

function main() {
  // Every hook NOT folded into the merged Stop prompt keeps its own single-hook
  // prompt file (today: subagent-discipline, on SubagentStop). Derived from HOOKS
  // rather than named literally so adding a hook to HOOKS cannot silently produce
  // no prompt file at all.
  for (const hookName of Object.keys(HOOKS).filter((n) => !STOP_DISCIPLINE_HOOKS.includes(n))) {
    const text = buildPrompt(hookName);
    const outPath = path.join(__dirname, `${hookName}.prompt.md`);
    fs.writeFileSync(outPath, text + '\n', 'utf-8');
    console.log(`wrote ${outPath} (${text.length} chars)`);
  }

  // async-discipline + autonomy-discipline merge into one Stop-event prompt.
  const combinedText = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS);
  const combinedPath = path.join(__dirname, STOP_DISCIPLINE_PROMPT_FILE);
  fs.writeFileSync(combinedPath, combinedText + '\n', 'utf-8');
  console.log(`wrote ${combinedPath} (${combinedText.length} chars)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildPrompt,
  buildCombinedPrompt,
  HOOKS,
  STOP_DISCIPLINE_HOOKS,
  STOP_DISCIPLINE_PROMPT_FILE,
};
