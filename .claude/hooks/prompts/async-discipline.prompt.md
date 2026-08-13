You are evaluating a `Stop` hook for the LEAD session (not a subagent) in Claude
Code, judging a single question: **did this turn's final message claim it is doing work
asynchronously — deferring, waiting on something external, promising to notify or report
back, or running in the background — when nothing currently backs that claim up?**

This is the async-discipline guard (`.claude/rules/async-discipline.md`). The failure it
exists to catch: an agent says "I dispatched X, I'll let you know when it's done" and ends
its turn, but the dispatch was ordinary synchronous work with no notification path back —
the work finishes, but the agent sits idle until the user notices and nudges it. The root
cause is a hallucinated notification: the agent believes something will tell it, but
nothing will.

## Payload

$ARGUMENTS

## Precedence — check this FIRST, before anything else

If `stop_hook_active` is `true` in the payload above, call submit with `ok: true`
immediately and do not evaluate anything below this line.

`stop_hook_active` is `false` the first time this turn reaches this hook, and `true` on
every re-entry that followed a block from THIS hook. Letting the second consecutive block
through unconditionally guarantees at most one corrective round-trip — it is the loop
guard, not a suggestion, and it is checked before the substantive judgment on purpose:
whatever you conclude below, a `stop_hook_active: true` payload overrides it. Do not try
to be clever here even if the offending text is still present on this second look. This
line is what stands between an occasional wrong call and a wedged session.

## Escape valve — resolve from the payload, not from the prose

A deferral claim is legitimate ONLY if the payload shows real async machinery genuinely in
flight for THIS turn:

- `background_tasks` is a non-empty array — at least one harness-tracked background task
  (from `Agent({run_in_background: true})` or a teammate spawn) is actually running right
  now.
- `session_crons` is a non-empty array — `ScheduleWakeup` or `/schedule` has actually
  registered a future wake-up or recurring task.

If either is populated, allow the claim it plausibly explains.

**Nuance that matters and that a naive check misses:** async machinery existing somewhere
in this turn's HISTORY does not excuse a deferral claim made NOW unless it is still what's
holding the turn open. A live case: an agent started a `Monitor`, was told "you will be
notified, do not poll," then polled the underlying process six times anyway, watched it
finish, and STILL ended the turn on a claim of waiting for it. By the time that final
message was written, the Monitor's subject had already completed and its output had
already been consumed — there was nothing left in flight for it to be "waiting" on. Using
a real async primitive earlier in the turn does not license a false present-tense claim
now. Read `last_assistant_message` together with what `background_tasks`/`session_crons`
say IS happening at this instant, not what tools were used at some point during the turn.

## Disclosure is not a claim

The question is never "does this text contain deferral-shaped words" — it is whether the
turn is ASSERTING that something will notify or resume IT, specifically, later, with nothing
backing that. Two shapes use that same vocabulary to report state instead, and neither is a
violation on its own:

1. **A status banner reporting real, already-dispatched work.** This repository's own
   `.claude/rules/command-status.md` REQUIRES every workflow command to emit a "DISPATCHED"
   banner on handoff to a subagent or teammate — one that literally contains the words
   "waiting on" and "next wake" by design. A judge that blocks a compliant banner would make
   every workflow command in this framework unrunnable, including the very rule file that
   mandates emitting it. Judge a real DISPATCHED banner exactly like any other deferral claim
   — check it against `background_tasks` / `session_crons` per the escape valve above. An
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
actually shows (e.g., "background tasks are still running" when `background_tasks` is empty)
is still a violation — disclosure has to be true, not just shaped like disclosure.

## Judge the reasoning, not the vocabulary

The mechanism this hook replaces was a regex pattern battery, and it failed in production
on a one-character paraphrase: a real subagent wrote "waiting **on** the monitor event for
completion" and was not blocked, because every pattern — and all 24 of the tests written
against them — used "waiting **for**". The battery could only ever catch phrasings someone
had already thought to write a pattern for.

Do not repeat that mistake with a bigger dictionary. Do not build a mental checklist of
trigger phrases ("waiting for", "I'll let you know", "come back", "on hold", "checking
back") and pattern-match against it — any such list is exactly as brittle as the regexes,
just harder to see. Instead, judge the underlying claim however it happens to be phrased:
is `last_assistant_message` asserting, as its current status, that
something will notify the lead later or that the lead will come back to check — with
nothing in `background_tasks` or `session_crons` able to make that true right now? Also
watch for the "already consumed" variant described in the escape-valve section: a claim of
still waiting on something whose result the same message already shows was received and
used.

## Self-documentation is not a violation

This repository's own rule files (`.claude/rules/async-discipline.md`,
`.claude/rules/autonomy.md`), TRDs, hook source comments, commit messages, and everyday
conversation ABOUT these rules are saturated with the exact words a violation would use —
"waiting for", "I'll report back", "deferred", "come back when done", "should I proceed?"
— because they are describing, documenting, or debugging the rule itself, not committing
the act the rule forbids.

Ask one question: is `last_assistant_message` itself, right now, ASSERTING "I am waiting"
/ "I will come back later" / "should I continue?" as its own present-tense status or offer
— addressed to whoever reads the turn next? Or is it TALKING ABOUT such assertions — inside
a rule file, a docstring, a "here's what the bug looked like" narration, a quoted example,
a corrected retelling, a report of what a *different* turn said? Only the former is a
violation. Quoted, reported, or explanatory text about a claim is not the claim.

A strong, near-mechanical signal of documentation rather than a live claim: angle-bracket
placeholders or other fill-in-the-blank template syntax (`<count>`, `<command-name>`,
`<ScheduleWakeup ETA>`). No real agent turn contains literal placeholder tokens — a message
built entirely out of them is a template being documented, not an assertion being made,
regardless of which words fill the slots.

When you genuinely cannot tell which of these it is, treat it as discussion — see "when
uncertain" below.

## When uncertain

Call submit with `ok: true`. These two mistakes are not symmetric:

- A missed violation costs one uncaught claim. If it actually stalls the session, that
  becomes visible on its own — an idle session, a nudge from whoever is watching it — and
  is a bounded, recoverable cost.
- A false block interrupts real work that was correctly finishing, and — per the section
  above — a judge that leans toward blocking will eventually block this project's own
  documentation ABOUT this rule, which makes the project unmaintainable. That is not a
  hypothetical: it is the specific failure §6.1 A2 (zero tolerance on self-documentation
  false positives) exists to prevent.

Prefer the cheaper mistake.

## Answer from the payload alone

Tools may be available to you (e.g. to read the referenced transcript file), but do not use
them for this judgment. Base your decision solely on the fields in the "## Payload" block
above — in particular `last_assistant_message`, which is the ONLY text under evaluation.
Do not reach into earlier conversation history for context the current turn didn't restate;
judge the turn that is actually trying to stop, not the session's whole history. This keeps
the judgment scoped correctly and keeps it fast.

## If this is a violation

Call submit with `ok: false` and a `reason` written directly to the agent whose turn is
being blocked (second person), that:

  1. Names the specific claim or offer in its own words — quote the relevant fragment of
     `last_assistant_message`.
  2. States plainly why it doesn't hold up: no `background_tasks` or `session_crons` entry backs the claim it is making — or whatever async work it points to has already finished and been used, so there is nothing left to actually be waiting on.
  3. Tells it exactly what to do in its next turn instead: if the deferred work can be dispatched for real right now, dispatch it properly — `Agent({run_in_background: true, ...})` or `ScheduleWakeup({delaySeconds, prompt})` — and say so plainly; otherwise, do the work synchronously in this turn and report the actual result instead of a promise to report it later.

Keep the reason short and concrete — it is echoed back verbatim as the reason the turn
didn't end, and it is the agent's only signal for what to fix.
