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

const LOOP_GUARD_BLOCK = `## Precedence — check this FIRST, before anything else

If \`stop_hook_active\` is \`true\` in the payload above, call submit with \`ok: true\`
immediately and do not evaluate anything below this line.

\`stop_hook_active\` is \`false\` the first time this turn reaches this hook, and \`true\` on
every re-entry that followed a block from THIS hook. Letting the second consecutive block
through unconditionally guarantees at most one corrective round-trip — it is the loop
guard, not a suggestion, and it is checked before the substantive judgment on purpose:
whatever you conclude below, a \`stop_hook_active: true\` payload overrides it. Do not try
to be clever here even if the offending text is still present on this second look. This
line is what stands between an occasional wrong call and a wedged session.`;

const VOCABULARY_WARNING_BLOCK = (violationReframe) => `## Judge the reasoning, not the vocabulary

The mechanism this hook replaces was a regex pattern battery, and it failed in production
on a one-character paraphrase: a real subagent wrote "waiting **on** the monitor event for
completion" and was not blocked, because every pattern — and all 24 of the tests written
against them — used "waiting **for**". The battery could only ever catch phrasings someone
had already thought to write a pattern for.

Do not repeat that mistake with a bigger dictionary. Do not build a mental checklist of
trigger phrases ("waiting for", "I'll let you know", "come back", "on hold", "checking
back") and pattern-match against it — any such list is exactly as brittle as the regexes,
just harder to see. Instead, judge the underlying claim however it happens to be phrased:
${violationReframe}`;

const SELF_DOC_BLOCK = `## Self-documentation is not a violation

This repository's own rule files (\`.claude/rules/async-discipline.md\`,
\`.claude/rules/autonomy.md\`), TRDs, hook source comments, commit messages, and everyday
conversation ABOUT these rules are saturated with the exact words a violation would use —
"waiting for", "I'll report back", "deferred", "come back when done", "should I proceed?"
— because they are describing, documenting, or debugging the rule itself, not committing
the act the rule forbids.

Ask one question: is \`last_assistant_message\` itself, right now, ASSERTING "I am waiting"
/ "I will come back later" / "should I continue?" as its own present-tense status or offer
— addressed to whoever reads the turn next? Or is it TALKING ABOUT such assertions — inside
a rule file, a docstring, a "here's what the bug looked like" narration, a quoted example,
a corrected retelling, a report of what a *different* turn said? Only the former is a
violation. Quoted, reported, or explanatory text about a claim is not the claim.

A strong, near-mechanical signal of documentation rather than a live claim: angle-bracket
placeholders or other fill-in-the-blank template syntax (\`<count>\`, \`<command-name>\`,
\`<ScheduleWakeup ETA>\`). No real agent turn contains literal placeholder tokens — a message
built entirely out of them is a template being documented, not an assertion being made,
regardless of which words fill the slots.

When you genuinely cannot tell which of these it is, treat it as discussion — see "when
uncertain" below.`;

const DISCLOSURE_BLOCK = `## Disclosure is not a claim

The question is never "does this text contain deferral-shaped words" — it is whether the
turn is ASSERTING that something will notify or resume IT, specifically, later, with nothing
backing that. Two shapes use that same vocabulary to report state instead, and neither is a
violation on its own:

1. **A status banner reporting real, already-dispatched work.** This repository's own
   \`.claude/rules/command-status.md\` REQUIRES every workflow command to emit a "DISPATCHED"
   banner on handoff to a subagent or teammate — one that literally contains the words
   "waiting on" and "next wake" by design. A judge that blocks a compliant banner would make
   every workflow command in this framework unrunnable, including the very rule file that
   mandates emitting it. Judge a real DISPATCHED banner exactly like any other deferral claim
   — check it against \`background_tasks\` / \`session_crons\` per the escape valve above. An
   accurate report of real dispatched work is precisely the legitimate case the escape valve
   exists for: not exempt from the payload check, but not disqualified by its vocabulary
   either.

2. **An honest blocker handoff.** A turn that delivers real, usable work and then plainly
   states what it cannot do without someone else's input — "18/18 smoke green, tsc clean...
   waiting on the team lead for the commit instruction," "I've sent the blocking question to
   the team-lead and am waiting for the PRD source before proceeding" — is reporting its
   current status and STOPPING, not promising to resume on its own initiative. It hands
   control back rather than asserting a self-driven continuation nothing backs. This is
   exactly the behavior asked for below when nothing further can be done in-turn — do not
   penalize the behavior the fix demands merely because it echoes the word "waiting."
   Contrast this with a claim that something is STILL actively running and will notify the
   agent unprompted ("I will report the results once they finish") — that IS a state claim
   about active machinery, and must still be checked against the payload; an honest blocker
   handoff makes no such claim about anything currently in flight at all.

Neither shape is a blanket exemption: a status claim that misdescribes what the payload
actually shows (e.g., "background tasks are still running" when \`background_tasks\` is empty)
is still a violation — disclosure has to be true, not just shaped like disclosure.`;

// Takes an optional per-hook insert (`imminentActionExtra`) spliced in after the opening
// paragraph. The block is otherwise SHARED and must stay so — the insert exists only for
// evidence that is genuinely hook-specific (async-discipline's participial-form case was
// observed live on `Stop`), not as a general escape hatch for divergence.
const IMMINENT_ACTION_BLOCK = (extra) => `## There is no "about to" at Stop

The turn is ending right now. A final message asserting the agent is *about to* take some
action — imminent, not yet started, framed as what happens next — has not taken it. At the
moment this hook fires that assertion is already false, not merely unfulfilled: the turn
is over, so "next" never arrives. This is the same underlying falsehood as claiming the
action already happened, differing only in tense.
${extra ? `\n${extra}\n` : ''}
**This applies to ANY action, not only ones visible in the payload.** "Next I'll run the
integration tests," "I'll bring up the local stack," "now I'll read the config" — a Bash
call, a file read, an edit — none of these leave a trace in \`background_tasks\` or
\`session_crons\`, and their absence there proves nothing either way. Do not require payload
evidence before flagging. The falsehood is established by the turn ending, not by the
payload.

Where the action WOULD be payload-observable — a background dispatch, a scheduled wake —
an empty \`background_tasks\` or \`session_crons\` is additional corroboration. It is
supporting evidence, never a precondition.

**Guard hard against over-triggering — this is the highest-risk part of this clause.** You
only ever see the turn's FINAL message, never what happened earlier in the same turn. "I'm
going to read the file" followed, within that same turn, by actually reading it and
reporting what it found is ordinary narration — you would never see that intermediate
sentence at all, only the turn's actual last message. So this fires ONLY when the final
message itself leaves an action stated-but-unstarted and the turn stops there.

**Distinguish the agent's own next action from advice to the user.** "Next I'll run the
migration" is the agent asserting what it will do — a claim. "Next step: run
\`npm install\`" or "you'll want to rotate that key" is advice, and a completion summary
recommending what the USER should do next is correct behaviour, not a violation. The test
is whose action it is.

When you genuinely cannot tell whether a "going to" phrase is stage-setting for something
the same message goes on to deliver, versus a bare assertion the turn stops on, fail open —
allow.`;

const UNCERTAINTY_BLOCK = `## When uncertain

Call submit with \`ok: true\`. These two mistakes are not symmetric:

- A missed violation costs one uncaught claim. If it actually stalls the session, that
  becomes visible on its own — an idle session, a nudge from whoever is watching it — and
  is a bounded, recoverable cost.
- A false block interrupts real work that was correctly finishing, and — per the section
  above — a judge that leans toward blocking will eventually block this project's own
  documentation ABOUT this rule, which makes the project unmaintainable. That is not a
  hypothetical: it is the specific failure §6.1 A2 (zero tolerance on self-documentation
  false positives) exists to prevent.

Prefer the cheaper mistake.`;

const NO_TOOLS_BLOCK = `## Answer from the payload alone

Tools may be available to you (e.g. to read the referenced transcript file), but do not use
them for this judgment. Base your decision solely on the fields in the "## Payload" block
above — in particular \`last_assistant_message\`, which is the ONLY text under evaluation.
Do not reach into earlier conversation history for context the current turn didn't restate;
judge the turn that is actually trying to stop, not the session's whole history. This keeps
the judgment scoped correctly and keeps it fast.`;

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
    intro: `You are evaluating a \`Stop\` hook for the LEAD session (not a subagent) in Claude
Code, judging a single question: **did this turn's final message claim it is doing work
asynchronously — deferring, waiting on something external, promising to notify or report
back, or running in the background — when nothing currently backs that claim up?**

This is the async-discipline guard (\`.claude/rules/async-discipline.md\`). The failure it
exists to catch: an agent says "I dispatched X, I'll let you know when it's done" and ends
its turn, but the dispatch was ordinary synchronous work with no notification path back —
the work finishes, but the agent sits idle until the user notices and nudges it. The root
cause is a hallucinated notification: the agent believes something will tell it, but
nothing will.`,
    escapeValve: `## Escape valve — resolve from the payload, not from the prose

A deferral claim is legitimate ONLY if the payload shows real async machinery genuinely in
flight for THIS turn:

- \`background_tasks\` is a non-empty array — at least one harness-tracked background task
  (from \`Agent({run_in_background: true})\` or a teammate spawn) is actually running right
  now.
- \`session_crons\` is a non-empty array — \`ScheduleWakeup\` or \`/schedule\` has actually
  registered a future wake-up or recurring task.

If either is populated, allow the claim it plausibly explains.

**NON-EMPTY IS NOT ENOUGH. The entry must plausibly BE the thing the message claims.**
This is the escape valve's most important limit, and treating the arrays as a boolean
defeats the whole guard.

\`background_tasks\` accumulates. It is not a live-process list you can trust as one, and
nothing in the payload timestamps an entry or marks it finished. Measured 2026-08-16 in this
project: a session whose own dispatch ledger showed **2 open agents** was handed a
\`background_tasks\` array of **49**. A judge that allows on "the array is non-empty" therefore
allows *every* deferral claim for the remainder of any session that has ever dispatched
background work — including claims about work that finished hours earlier, and claims about
work that was never dispatched at all.

So do not count. Ask whether some entry **corresponds to what this message says it is
waiting on**:

- The message names a specific agent, task id, workflow, or process, and an entry matches it
  → allow.
- The message says "the tests are still running" and every entry is an unrelated teammate
  from earlier work → that is an unbacked claim wearing a populated array. **Block it.**
- The message gestures vaguely — "work is in flight", "agents are running" — with nothing
  identifying what → treat as uncertain and allow, per "When uncertain" below. Vagueness is
  weak evidence of a lie, not proof of one.

A claim that names nothing checkable cannot be corroborated *or* refuted, so it fails open.
A claim that names something specific which the payload contradicts is exactly the failure
this guard exists to catch, and a populated-but-irrelevant array must not rescue it.

**A backgrounded shell task is real async machinery that this payload CANNOT show you.**
\`Bash({run_in_background: true})\` is harness-tracked and does re-invoke the session when the
process exits — it is a genuine notification path, not a hallucinated one. But it does **not**
appear in \`background_tasks\`. Measured 2026-08-16: a lead session holding exactly one
background shell task saw \`background_tasks\` list 49 unrelated teammate tasks and not that
shell task. So an empty-or-unrelated \`background_tasks\` is **not** evidence against a claim
that names a background shell command.

Treat it as the uncertain case and **allow** when the turn points at a specific, checkable
background process — a task id, a PID, a log file it has been reading — rather than gesturing
vaguely at "a job running somewhere". You cannot corroborate it from the payload, and per
"When uncertain" the cheaper mistake is to let it through.

This does not license deferring OTHER work alongside it. A turn may legitimately be held open
by a background shell task while still making a separate unbacked promise — "the run is going,
and I'll fix the config afterwards" defers the config edit, which nothing is running. Judge
each claim on its own: the shell task backs claims about the shell task, and nothing else.

**Nuance that matters and that a naive check misses:** async machinery existing somewhere
in this turn's HISTORY does not excuse a deferral claim made NOW unless it is still what's
holding the turn open. A live case: an agent started a \`Monitor\`, was told "you will be
notified, do not poll," then polled the underlying process six times anyway, watched it
finish, and STILL ended the turn on a claim of waiting for it. By the time that final
message was written, the Monitor's subject had already completed and its output had
already been consumed — there was nothing left in flight for it to be "waiting" on. Using
a real async primitive earlier in the turn does not license a false present-tense claim
now. Read \`last_assistant_message\` together with what \`background_tasks\`/\`session_crons\`
say IS happening at this instant, not what tools were used at some point during the turn.`,
    imminentActionExtra: `**The bare participial form counts, and it is the easiest one to miss.** "Dispatching all
three." "Running the suite now." "Kicking off the migration." These carry no auxiliary verb
and no explicit tense marker, so a reader scanning for "I will" or "I'm about to" slides past
them — but they make exactly the same assertion, and a headline-style sentence fragment at the
very end of a turn is a *stronger* claim of imminence than "I'm going to," not a weaker one.
It reads as narrating an action in progress. Judge the assertion, not the grammar that carries
it: if the turn ends there and nothing in the payload or the message shows the action taken,
"Dispatching all three." is unbacked exactly as "I dispatched all three" would be.

Observed live, in this project, in the turn immediately after the model was asked whether this
clause should cover promises of work: it wrote "Dispatching all three." as its closing line and
dispatched nothing. The clause as written at the time did not catch it. That is the case this
paragraph exists for.`,
    violationReframe: `is \`last_assistant_message\` asserting, as its current status, that
something will notify the lead later or that the lead will come back to check — with
nothing in \`background_tasks\` or \`session_crons\` able to make that true right now? Also
watch for the "already consumed" variant described in the escape-valve section: a claim of
still waiting on something whose result the same message already shows was received and
used.`,
    claimDescription: `no \`background_tasks\` or \`session_crons\` entry backs the claim it is making — or whatever async work it points to has already finished and been used, so there is nothing left to actually be waiting on.`,
    whatToDoInstead: `if the deferred work can be dispatched for real right now, dispatch it properly — \`Agent({run_in_background: true, ...})\` or \`ScheduleWakeup({delaySeconds, prompt})\` — and say so plainly; otherwise, do the work synchronously in this turn and report the actual result instead of a promise to report it later.`,
  },

  // ---------------------------------------------------------------------
  'subagent-discipline': {
    event: 'SubagentStop',
    intro: `You are evaluating a \`SubagentStop\` hook for a SUBAGENT (not the lead session) in
Claude Code. This guard is STRICTER than the lead's async-discipline guard, for a structural
reason:

**\`ScheduleWakeup\` is removed from every subagent by the platform's own tool filter — for
both foreground and background subagents.** A subagent claiming it will "come back later,"
"check back once X finishes," or otherwise be re-invoked on its own initiative is FALSE BY
CONSTRUCTION: there is no mechanism by which that could happen. This is not a probabilistic
read of intent the way the lead-session judgment is — it is closer to a fact you can verify
mechanically. \`session_crons\`, even if non-empty, can NEVER legitimately explain a
subagent's own claim, because the subagent has no way to have populated it itself.

You are making TWO related judgments about \`last_assistant_message\`, either one of which is
a violation on its own:

(a) **A structurally-impossible deferral claim** — the "waiting / will come back" claim
    described above.
(b) **No usable result returned.** The failure that most concretely motivated this hook: a
    real subagent burned roughly 240,000 tokens across 179 tool calls and ended its turn
    having produced nothing the orchestrator that spawned it could act on. Ask the direct
    question, not a proxy for it: did this turn hand back something usable — an answer to
    what was asked, a completed artifact, a diagnosis, a concrete result — or does it trail
    off into narration, a plan for what to do next, an unfulfilled intention, or silence
    about the actual outcome? This catches failures that use NO deferral vocabulary at all —
    a shape a pattern matcher can never reach, because there is no phrase to match against
    an absence.`,
    escapeValve: `## Escape valve — resolve from the payload, not from the prose

There is exactly one legitimate escape valve, and it applies to judgment (a) only:

- \`background_tasks\` is a non-empty array — this means the subagent ITSELF dispatched a
  nested \`Agent({run_in_background: true, ...})\` and has a real reason to say it is waiting
  on that. \`Agent({run_in_background: true})\` is NOT filtered from subagents the way
  \`ScheduleWakeup\` is, so this is genuinely possible and genuinely legitimate. If
  \`background_tasks\` is populated, allow a deferral claim it plausibly explains.

**NON-EMPTY IS NOT ENOUGH — the entry must plausibly BE what the message is waiting on.**
\`background_tasks\` accumulates and carries no timestamp or completion marker, so it cannot be
read as a live-process list. Measured 2026-08-16 in this project: a session whose own dispatch
ledger showed **2 open agents** was handed a \`background_tasks\` array of **49**. Treated as a
boolean, this valve stays open for the rest of any session that ever dispatched background
work, and every later deferral claim passes regardless of truth.

So do not count entries — ask whether one CORRESPONDS to the claim. A message naming a
specific nested agent or task that matches an entry: allow. A message claiming its own work
is still running while every entry is unrelated: block. A message too vague to check either
way: allow, per "when uncertain" — vagueness is weak evidence of a lie, not proof.

There is no escape valve for judgment (b) — a turn either hands back something usable or it
doesn't; there is no field in the payload that excuses returning nothing.`,
    violationReframe: `does \`last_assistant_message\` claim the subagent will resume, be
notified, or check back later — with \`background_tasks\` empty, meaning nothing makes that
possible? OR, independent of any deferral language at all, does the turn simply fail to
deliver anything the caller could use: no answer, no artifact, no diagnosis, no explicit
"here is exactly what is blocking me and I cannot proceed further" — just commentary,
intentions, or a dangling plan?`,
    claimDescription: `either \`background_tasks\` is empty so nothing will ever re-invoke you (ScheduleWakeup does not exist for subagents, by platform design — not by mistake), or the turn ended without handing back anything the orchestrator that spawned you can actually use.`,
    whatToDoInstead: `if something you can check directly is what you were "waiting" on (a file, a test result, a command, a Read), check it now and act on what you find, in this turn; if you already dispatched real background work of your own, that only counts if \`background_tasks\` actually shows it — do so now if you meant to; if there is genuinely nothing further you can do until an external system (something a DIFFERENT session controls) finishes, say that PLAINLY as your final answer — state what is blocking you and stop, rather than phrasing it as "I'll wait" or "I'll check back."`,
  },

  // ---------------------------------------------------------------------
  'autonomy-discipline': {
    event: 'Stop',
    intro: `You are evaluating a \`Stop\` hook for the LEAD session running a workflow command
(e.g. \`/implement-trd\`, \`/create-trd\`, \`/audit-build\`), judging: **did this turn's
final message offer a mid-loop pause, ask for permission to continue, or defer to the user
on a decision the command was already authorized to make?**

This is the autonomy-discipline guard (\`.claude/rules/autonomy.md\`). Its premise: invoking
the command IS the user's authorization for everything the command does end to end, up to
its final \`═══ COMMAND COMPLETE ═══\` banner. A command that pauses mid-flight to ask
"should I proceed?" about something it already had enough information to decide is not
being careful — it is defeating the point of an orchestrated, unattended run.

\`.claude/rules/autonomy.md\` names exactly FOUR cases where stopping to ask really is
legitimate:
  1. Genuine requirement ambiguity with no documented default anywhere in scope.
  2. Missing information that cannot be derived from the codebase, env, config, or docs
     (a user-specific secret, URL, or identity — not a technical decision).
  3. A truly irreversible destructive operation (force-push, deleting user-authored files,
     \`--reset-state\` over real progress) — not routine state mutations like commits on the
     feature branch or writing \`implement.json\`.
  4. A STUCK condition: retry exhaustion after the documented mitigations were tried and
     failed.
\`/refine-prd\` and \`/refine-trd\` are exempt entirely — they are intentionally interactive,
so a question mid-flow there is the command working as designed, not a violation.

## THE VIOLATION IS OFTEN NOT A QUESTION

Every example above ends in a question mark, and that is a trap this prompt already fell
into. **A deferral does not need interrogative grammar to be a deferral.** These are the
same move and must be judged identically:

    "Should I fix the config?"                 <- obvious
    "Want me to fix the config?"               <- obvious
    "I can fix the config if you want."        <- NOT a question. Same move.
    "Say the word and I'll fix the config."    <- NOT a question. Same move.
    "Tell me and I'll settle it."              <- NOT a question. Same move.
    "That's available whenever you want it."   <- NOT a question. Same move.

The declarative forms read as DISCLOSING A CAPABILITY rather than requesting permission,
which is exactly why they slip past. **Measured 2026-08-21 in this repository: the same
investigation was offered as "say the word and I'll settle it" twice, two turns apart. This
guard evaluated both turns and ALLOWED BOTH. Neither investigation happened**, and the user
had to ask a third time. The work was deferred as effectively as by any question.

**The test is not the grammar. It is: does the turn end with a decision or an action handed
back to the user that the agent could have made or taken itself?** If yes, it is a violation
whatever punctuation it wears.

Two things this must NOT catch. Reporting what you did and what remains -- "X is done, Y is
open because Z" -- is a status report, not an offer: it hands back no decision. And naming a
genuine blocker you cannot resolve is legitimate under case 2 above.`,
    escapeValve: `## Legitimate exceptions — resolve from the content, not a phrase list

There is no payload field that settles this one the way \`background_tasks\` settles an
async claim — judge it from what \`last_assistant_message\` is actually asking and why.
A pause is legitimate if the text is doing ONE of the four things above: naming a real
requirement gap with no default, naming information that genuinely cannot be derived, flagging
a genuinely irreversible destructive step, or reporting a STUCK condition after documented
retries were exhausted. Legitimate asks usually look like they're informing a specific,
bounded decision (and often state a default they'll apply if unanswered) — not like they're
inviting the user back into a loop the command was already running unattended.

If you cannot tell from the payload alone whether the command in question is \`/refine-prd\`
or \`/refine-trd\` (which are exempt), and the content otherwise reads as a routine
checkpoint rather than one of the four cases, judge the content on its own terms — a
routine "should I continue to phase 2?" is a violation regardless of which command emitted
it, since no command's design calls for it.`,
    violationReframe: `is \`last_assistant_message\` inviting the user back into a decision
loop on something already authorized by invoking the command — "should I proceed?",
"want me to keep going, or pause for a look?", "please review and confirm," "should we
check with X first?" — including HEDGED forms that still function as a pause even while
disclaiming it ("I'll continue unless you'd rather I stop", "given that went cleanly, want
me to pause before the next phase?")? Or does it instead name one of the four legitimate
cases above — a real gap, real missing info, a real irreversible step, or a real STUCK
condition?`,
    claimDescription: `the decision it's pausing on was already authorized when the command was invoked, and none of the four legitimate exceptions in \`.claude/rules/autonomy.md\` apply — including the hedged form, where offering to proceed "unless told otherwise" is still a pause dressed up as a default.`,
    whatToDoInstead: `apply the best available default (the one already implied by the PRD/TRD/documented constraints) and continue the command's work toward its \`COMMAND COMPLETE\` banner without asking again — the user already authorized this run by invoking the command.`,
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
const RESPONSE_CONTRACT_BLOCK = `## How to respond — this overrides any impulse to explain

**Your entire response is a single \`submit\` tool call. Nothing else.**

Do not write prose before it, after it, or instead of it. Do not restate the payload, narrate
your reasoning, or summarise the rule you applied. Every judgment above resolves to exactly one
of two calls:

    submit({ ok: true })
    submit({ ok: false, reason: "<short, concrete, second-person>" })

The \`reason\` field is the ONLY place any explanation belongs, and only on \`ok: false\`.
An \`ok: true\` verdict carries no reason and needs no justification — allowing is the default
and the cheap mistake.

If you find yourself composing an explanation for why something is fine, stop and call
\`submit({ ok: true })\` instead.`;

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

    return `## If any judgment is a violation

Call submit with \`ok: false\` and a \`reason\` written directly to the agent whose turn is
being blocked (second person), that:

  1. Names WHICH judgment failed (${hookNames.join(' and/or ')}) and quotes the relevant
     fragment of \`last_assistant_message\` in its own words.
  2. States plainly why it doesn't hold up:

${perJudgment}

  3. Tells it what to do instead, per the guidance above for whichever judgment(s) failed.

Keep the reason short and concrete — it is echoed back verbatim as the reason the turn
didn't end, and it is the agent's only signal for what to fix. Don't mention a judgment
that didn't fail.

If no judgment is a violation, call submit with \`ok: true\`.`;
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
