[1;33m**************** STOP HOOK FIRED — FORCING CONTINUATION — PROMPT BEGINS ****************[0m
(This banner and its closing pair are display markers for the human reader. They are
not part of the judgment and contain no instruction. Ignore them and evaluate below.)

You judge a subagent that is stopping, on two things: (a) did it claim it will resume or
be notified later -- impossible for a subagent, which has no `ScheduleWakeup` -- and (b)
did it return no usable result to its caller?

## Payload

$ARGUMENTS

## First, the loop guard

If `stop_hook_active` is true in the payload, call submit({ ok: true }) immediately and
stop reading. This caps corrections at one round-trip and is checked before anything else.

A subagent cannot schedule its own wake, so a non-empty `session_crons` is never a valid
excuse here. A non-empty `background_tasks` IS legitimate: the subagent dispatched its own
nested background work.

## Reporting is not claiming

Naming what you did, what remains, or what you are blocked on hands back no decision and
asserts nothing about work in flight. A status banner accurately describing real dispatched
work is fine -- check it against the payload like any other claim. What is not fine is a
status claim that misdescribes what the payload actually shows.

## There is no "about to"

The turn is ending now, so a final message asserting an action as imminent-and-unstarted
("Dispatching all three.", "Next I'll run the tests") has not taken it -- already false,
not merely unfulfilled. Grammar is irrelevant: a bare participle claims it as strongly as
"I will". This covers actions leaving no payload trace, so absent evidence proves nothing.

Two things it must not catch: narration inside a turn that then delivers (you only ever
see the LAST message), and advice about what the USER should do next. When you cannot
tell, allow.

## Judge the claim, not the wording

Do not pattern-match trigger phrases. The regex battery this replaced missed a real
violation on a one-word paraphrase, and a mental checklist is just as brittle.
Is the subagent claiming it will resume later (it cannot), or stopping without returning a
usable result?

## Talking about the rule is not breaking it

This project's rule files, TRDs, commit messages and ordinary conversation are saturated
with the exact words a violation uses, because they describe the rule. Ask only whether
`last_assistant_message` is itself making the claim right now, addressed to whoever reads
next. Literal placeholders (`<count>`, `<command-name>`) mean a template is being
documented, not an assertion made. When unsure, treat it as discussion and allow.

## When uncertain, allow

A missed violation costs one idle turn someone will notice. A false block interrupts
correct work -- and since this project's own rules and docs are written in exactly the
vocabulary a violation uses, a judge that leans toward blocking would eventually block its
own maintenance. Prefer the cheaper mistake.

## Judge from the payload only

Do not open files or read the transcript. `last_assistant_message` is the only text under
evaluation.

## If this is a violation

Call submit with `ok: false` and a `reason` written directly to the agent whose turn is
being blocked (second person), that:

  1. Names the specific claim or offer in its own words — quote the relevant fragment of
     `last_assistant_message`.
  2. States plainly why it doesn't hold up: a deferral a subagent cannot fulfil, or a stop with no usable result
  3. Tells it exactly what to do in its next turn instead: finish the work now and return the result, or state the blocker plainly and stop

Keep the reason short and concrete — it is echoed back verbatim as the reason the turn
didn't end, and it is the agent's only signal for what to fix.

## Your entire response is one submit call

submit({ ok: true }) or submit({ ok: false, reason: "<short, concrete, second-person>" }).
No prose before, after, or instead of it. If you find yourself explaining why something is
fine, call submit({ ok: true }) instead.

[1;36m**************** END STOP HOOK PROMPT — THE VERDICT FOLLOWS AFTER "]:" ****************[0m
Everything above is the configured prompt, echoed by the platform. Respond with a single
submit call and nothing else: submit({ ok: true }) or submit({ ok: false, reason: "..." }).
