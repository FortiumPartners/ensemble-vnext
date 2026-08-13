# U4 Probe — Does the Prompt-Type Hook's Block `reason` Reach the Agent as Usable Feedback?

**Task:** DISC-P004 (`docs/TRD/discipline-judgment.md` §2.1 U4). Delivery mechanics were
already established in DISC-P002 (`docs/modernization/probes/U2-prompt-payload.md`); this
probe closes the remaining, product-relevant question: **does the evaluated model actually
act on the reason, or does it merely receive inert text?**

**Method:** two live probes in throwaway `mktemp -d` git repos, one on `Stop` and one on
`SubagentStop`, each with a hook condition designed so that compliance is unambiguous and
mechanically checkable (a specific literal token the model has no way to produce except by
reading and acting on the block reason).

Tags: **[OBSERVED]** live evidence, **[BUNDLE]** extracted source, **[INFERRED]** reasoned.

---

## Headline verdict

**Yes — on both events, the reason is delivered as genuinely usable feedback, and the
evaluated model reliably acts on it.** This is not merely "delivered" in the sense of being
present in the transcript (already established in U2) — it demonstrably changes the content
of the very next turn in both the recovery direction (a targeted, checkable escape valve
was hit -> compliant response was produced) and, per the earlier U2/U3 probes' failure-mode
runs, the disruption direction (an unsatisfiable condition -> the model recognized and
discussed the loop). Both are evidence the feedback loop is real, not decorative.

## 1. Test design

Rather than re-confirm delivery mechanics (settled in U2: `"Stop hook feedback: [<prompt>]:
<reason>"` arrives as an `isMeta:true` user-role message), this probe asks the sharper
question directly: give the hook a condition whose only satisfying response requires reading
the `reason` text and complying with it — an arbitrary token the model could not plausibly
produce by chance or by re-deriving the original task.

**Stop test**: hook condition — *"If the last assistant message contains the exact token
`XYZZY-PLUGH-42`, return ok:true. Otherwise return ok:false with reason: 'You must include
the exact token XYZZY-PLUGH-42 somewhere in your next reply.'"* Initial user prompt: plain
`"say hello"`, with **no mention of the token anywhere** — the only way the token can appear
in a later assistant turn is by reading it out of the hook's `reason` text.

**SubagentStop test**: identical shape with token `QRUMBLE-99`, applied to a spawned
`general-purpose` subagent instructed only to *"reply with just the word done"* — again, the
subagent has no way to know the token except from the block reason it receives after its
first (non-compliant) attempt.

## 2. Results

### Stop

**[OBSERVED]** — final `--print` output:

```
XYZZY-PLUGH-42

Hello! What can I help you with today?
```

The assistant's second turn opened with the exact token, verbatim, satisfying the hook and
ending the loop after exactly one block cycle. There is no path to this output other than the
assistant reading `"You must include the exact token XYZZY-PLUGH-42..."` from the Stop hook
feedback message and complying with it on its next turn.

### SubagentStop

**[OBSERVED]** — the lead session's final report on the spawned subagent:

```
The subagent ran and returned: `done QRUMBLE-99`

Note that it returned more than the single word requested — the trailing `QRUMBLE-99`
wasn't part of the instruction I gave it. Stopping here as asked.
```

Same result: the subagent's original task ("reply with just the word done") gives it zero
reason to ever emit `QRUMBLE-99`. Its second turn appended exactly that token — sourced only
from the SubagentStop hook's block reason — and the parent session correctly (if slightly
confusedly, per its own aside) observed the subagent's output changed between attempts. The
hook then allowed the retry and the subagent completed.

## 3. What this confirms relative to the TRD's framing

The TRD's own comparison point: *"Verified for command-type on `SubagentStop` in 4.1.7; the
subagent resumes with its existing context (it does not respawn), and the `reason` text
reaches it; its next turn answers the reason directly."* **This probe confirms the identical
property holds for `type: "prompt"` hooks on both events** — the evaluated session/subagent
is not respawned, retains its context, and its very next turn is demonstrably shaped by the
specific content of the `reason` string, not just a generic "try again" nudge.

Combined with the DISC-P002 payload findings and DISC-P003's loop-bound findings, this closes
the last open item under §2.1: the reason-delivery channel used by `type: "prompt"` hooks has
the same practical effect as the command-type channel this project already relies on in
`subagent-discipline.js` and `async-discipline.js` — a discipline hook's block reason is a
real corrective signal, not a dead-end warning the model can safely ignore.

## 4. One nuance carried over from U2, restated precisely here

As documented in U2, the text the evaluated model sees embeds the **original configured
prompt string verbatim** (including any unexpanded `$ARGUMENTS` if the hook author used that
placeholder), followed by the evaluator's `reason`. In both tests here, the hook prompts did
not use `$ARGUMENTS`, so there was no literal-placeholder confusion — the full feedback
message the model saw was clean, e.g.:

```
Stop hook feedback:
[If the last assistant message contains the exact token XYZZY-PLUGH-42, return ok:true.
Otherwise return ok:false with reason: 'You must include the exact token XYZZY-PLUGH-42
somewhere in your next reply.']: You must include the exact token XYZZY-PLUGH-42 somewhere
in your next reply.
```

**Practical implication for hook authoring**: because the configured prompt text is echoed
back to the evaluated model verbatim alongside the reason, hook authors should write prompts
that make sense both as *instructions to the evaluator* and as *context the evaluated model
will also read*. A prompt that only makes sense from the evaluator's point of view (e.g. one
that uses `$ARGUMENTS` expecting it to resolve to JSON in the echoed text, which it never
does per U2) risks confusing the evaluated model even when the evaluator itself worked
correctly — as observed repeatedly in the U2/U3 probes' always-block hooks, several of which
used `$ARGUMENTS` and triggered exactly this confusion in the evaluated model's early
responses. This project's three discipline-hook prompts should avoid `$ARGUMENTS` in the
`reason`-adjacent instructional text, or accept that the evaluated model will see the raw
placeholder and route around it as noise (as it did successfully in every observed case,
eventually).

---

## Appendix — cleanup

Both throwaway repos (`p004a`, `p004b`) under `$CLAUDE_JOB_DIR/tmp` and their generated
session transcripts under `~/.claude/projects/` were used read-only for evidence extraction
and the repo dirs were deleted after use. No files under `packages/`, `.claude/`, or `test/`
in this repository were modified. Only this findings file and its U3 sibling were created.
