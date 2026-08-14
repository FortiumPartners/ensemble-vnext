# U2 Probe — `type: "prompt"` Hook Payload (Stop / SubagentStop)

> **⚠ PARTIALLY SUPERSEDED — read this first (added 2026-08-14).**
> Findings verified against **CLI v2.1.229**. The payload, schema and output-contract
> findings (§1–§3, §5, §6) still hold. **§4's comparison to
> `subagent-discipline.js`'s `MAX_CONSECUTIVE_BLOCKS` cap is stale**: that file, its
> counter, and its env-var levers were **deleted in 4.1.11**. The loop bound is now the
> `stop_hook_active` self-check inside the shipped prompt, with
> `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default 8) as the platform backstop — see
> `U3-loop-bound.md` §3 and `T003-loop-safety.md` §2, which verify that live against the
> real judge text. §4's underlying warning — that the platform does not bound a
> pathological prompt hook on its own — remains correct and is why the self-check exists.

**Task:** DISC-P002 (`docs/TRD/discipline-judgment.md` §2.1 U2)
**Method:** static extraction from the CLI bundle (`/Users/james/.local/bin/claude`, v2.1.229)
cross-checked against two live probes run in throwaway `mktemp -d` git repos with
`claude --print --setting-sources project --dangerously-skip-permissions`.

Every claim below is tagged **[OBSERVED]** (live probe evidence), **[BUNDLE]** (extracted
literal schema/prompt strings from the CLI binary), or **[INFERRED]** (reasoned from the
other two, not independently confirmed).

---

## 1. Settings.json schema for a prompt-type hook

**[BUNDLE]** — extracted directly from the zod-equivalent schema builder in the CLI bundle:

```
type: "prompt"        // required, literal
prompt: string         // required — the evaluation instruction. Use $ARGUMENTS as a
                        // placeholder for the hook input JSON (see §3 on what actually
                        // gets substituted, and for whom).
if: <condition>         // optional — same `if` gate other hook types support
timeout: number          // optional, positive — timeout in seconds for this evaluation
model: string             // optional — e.g. "claude-sonnet-5". If omitted, uses the
                           // "default small fast model."
continueOnBlock: boolean   // optional, default false — sets the `continue` value on the
                            // decision:"block" output produced when the evaluator returns
                            // ok:false. Default false = turn ends. Whether continue:true
                            // actually lets the turn proceed depends on the event's own
                            // decision:"block" semantics (Stop/SubagentStop vs PostToolUse
                            // differ here — see the bundle's own description text below).
statusMessage: string        // optional — custom spinner text while the hook runs
```

Copy-pasteable minimal example (this is what was used for both live probes):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate the condition... $ARGUMENTS",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

The bundle's own field descriptions (verbatim, **[BUNDLE]**):

- `prompt`: "Prompt to evaluate with LLM. Use $ARGUMENTS placeholder for hook input JSON."
- `timeout`: "Timeout in seconds for this specific prompt evaluation"
- `model`: "Model to use for this prompt hook (e.g., \"claude-sonnet-5\"). If not specified, uses the default small fast model."
- `continueOnBlock`: "Sets the continue value for the decision:\"block\" produced when ok is false. Default false (turn ends). Whether continue:true lets the turn proceed depends on the event's decision:\"block\" semantics. On PostToolUse, the reason is fed back to Claude and the turn continues."

Sibling `type: "agent"` schema (found alongside, not the object of this probe but useful
context — **[BUNDLE]**): same shape plus `once: boolean` ("If true, hook runs once and is
removed after execution"), default model is Haiku instead of the small fast model, default
timeout is 60s, and the agent gets actual tool access (see §5).

## 2. What the evaluating model sees

**[OBSERVED]**, confirmed two ways — extracted bundle prompt-template text, and a live probe
that made the evaluator embed the field list verbatim into its `reason` (methodology: the
hook prompt instructed the evaluator to always return `ok:false` with a reason consisting of
the field names and specific field values, then the reason was read out of the transcript).

### On `Stop`

Live block-reason evidence (exact string emitted by the evaluator, after several loop
iterations — see §4 for why it took several):

```
session_id, transcript_path, cwd, prompt_id, permission_mode, effort, hook_event_name,
stop_hook_active, last_assistant_message, background_tasks, session_crons
| [], true, [], ABSENT
```

i.e. `background_tasks=[]`, `stop_hook_active=true`, `session_crons=[]`, `agent_id=ABSENT`.

No `agent_id`, `agent_transcript_path`, or `agent_type` on `Stop` — consistent with `Stop`
firing on the main session, not a subagent.

### On `SubagentStop`

Live block-reason evidence (the evaluator supplied this as the literal required-format
string once it had the real data — the exact SubagentStop payload for that run):

```
session_id,transcript_path,cwd,prompt_id,permission_mode,agent_id,agent_type,effort,
hook_event_name,stop_hook_active,agent_transcript_path,last_assistant_message,
background_tasks,session_crons
| [] | true | [] | a572260c6fcc1070c | general-purpose
```

i.e. `background_tasks=[]`, `stop_hook_active=true`, `session_crons=[]`,
`agent_id=a572260c6fcc1070c` (the real spawned subagent's id), `agent_type=general-purpose`.

This is an exact match to the command-type `SubagentStop` payload fields already
established in the TRD background (`session_id, transcript_path, cwd, prompt_id, agent_id,
agent_type, last_assistant_message, background_tasks, session_crons, stop_hook_active,
permission_mode, effort, hook_event_name`) plus `agent_transcript_path` — **the prompt-type
evaluator sees the identical field set the command-type hook's stdin JSON would contain.**
Nothing is held back for the prompt-hook path.

### How the substitution actually works (important nuance)

**[OBSERVED]** — `$ARGUMENTS` in the *configured prompt* is what the evaluator model
receives interpolated with the real payload. But the **main/subagent session under
evaluation** — when it receives "Stop hook feedback: [<prompt text>]: <reason>" as
feedback — sees the *raw, unexpanded* `$ARGUMENTS` literal in the echoed prompt text,
because that's just the original settings.json string being echoed back as context, not
the evaluator's actual input. Only the `reason` half carries real evaluator-observed data.
This confused the target assistant in both live probes ("the hook message contains the
literal placeholder `$ARGUMENTS`... I don't receive hook input JSON in my context") — a
reasonable but incorrect inference from its own vantage point. The evaluator itself,
running as a separate model invocation, does get the real JSON; only the feedback string
shown back to the *evaluated* session doesn't re-embed it.

### Bundle-extracted system-prompt template

**[BUNDLE]** — the generic prompt/agent hook evaluator's system prompt is built as:

```
"You are evaluating a ${r} hook in Claude Code. Your task is to evaluate the condition
described in the user message."
```

(`${r}` = `"Stop"` or `"SubagentStop"`), followed by:

```
${R} The conversation transcript is available at: ${u}
You can read this file to analyze the conversation history if needed.

Use the available tools to inspect the codebase and verify the condition.
Use as few steps as possible - be efficient and direct.

When done, return your result using the [submit] tool with:
- ok: true if the condition is met
- ok: false with reason if the condition is not met
```

There is also a distinct, apparently unused-by-default alternate system prompt string in
the bundle — `"You are verifying a stop condition in Claude Code. Your task is to verify
that the agent completed the given plan."` — found adjacent in the same table but not
observed triggered in either live probe; flagging as **[BUNDLE, provenance unclear]**,
possibly a different/older built-in verification path.

Also present in the bundle **[BUNDLE]**, for long sessions: transcripts get truncated to
fit the evaluator's context budget, with a synthetic system note injected:

```
[Earlier conversation truncated to fit the hook evaluator's context window — {N} earlier
messages omitted. Evaluate the condition against the recent transcript below; if the
required evidence may be in the omitted prefix, return {"ok": false, "reason": "insufficient
evidence in transcript"}.]
```

This confirms the evaluator gets the JSON payload fields (`$ARGUMENTS`) directly inline —
not by reading a transcript file for those fields — but conversation *content* (message
history) is supplied via the transcript file/inline messages, separately, and can be
truncated on long sessions.

## 3. Output contract

**[OBSERVED + BUNDLE]** — the evaluator must call a submit/structured-output tool with:

- `ok: true` — condition met, hook passes silently, evaluated session proceeds normally.
- `ok: false` + `reason: <string>` — condition not met. This becomes a `decision:"block"`
  hook output. The `reason` text is delivered to the evaluated session as:
  `"Stop hook feedback: [<original configured prompt text>]: <reason>"` — a synthetic
  `isMeta: true` user-role message appended to the transcript, which triggers another
  assistant turn (i.e. blocks the session/subagent from actually stopping, same as a
  command-type hook returning `{"decision": "block", "reason": ...}`).
- Whether the evaluated session gets to actually stop after a block is governed by
  `continueOnBlock` (default `false` = the block does end the turn eventually per the
  bundle's own doc text, though see §4 — empirically it drove several *additional* full
  turns before the run actually terminated, so "turn ends" does not mean "the block is
  ignored the first time").

For the sibling `agent`-type hook specifically (not the direct object of this probe, but
observed in the bundle in the same code path) **[BUNDLE]**: it gets actual tool access,
caps out at **50 turns** ("Hooks: Agent hook did not complete within 50 turns" →
`tengu_agent_stop_hook_max_turns`, treated as `cancelled`), and errors distinctly if it
never calls the submit tool ("Agent hook did not return structured output").

## 4. Looping behavior (live-observed, relevant to TRD U3)

**[OBSERVED]** — a prompt hook that is designed to always return `ok:false` **does loop**,
confirming the risk flagged in the task brief. Concretely:

- On `Stop`: 4 block/re-evaluate cycles were observed before the assistant unilaterally
  decided to stop retrying ("This is now a loop on its third iteration, so I'll stop
  rather than keep retrying") and produced a final answer instead of continuing to try to
  satisfy the hook. The CLI itself did not appear to hard-cap this — the exit was a
  judgment call by the evaluated model, not an enforced limit.
- On `SubagentStop`: 8 block/re-evaluate cycles were observed with the same pattern
  (the subagent explicitly noted "I've responded to this hook five times now and it will
  keep rejecting") before it stopped retrying and returned control to its caller with the
  original task result plus a note about the stuck hook.
- In neither run did the process hang indefinitely — both terminated on their own via the
  evaluated model choosing to stop engaging with a hook it recognized as permanently
  unsatisfiable — but neither the prompt-type hook mechanism nor (in this minimal repro)
  any other guard imposed a hard iteration cap. This is a materially different safety
  property from `subagent-discipline.js`'s explicit `MAX_CONSECUTIVE_BLOCKS` cap (see
  `.claude/rules/async-discipline.md`) — that cap is a custom guard this project built
  for *its own* hooks; the platform's native prompt-hook block loop has no equivalent
  built-in cap that these two runs surfaced. **A pathological prompt hook (or a model that
  keeps dutifully retrying instead of giving up) is a real, not just theoretical, stuck-loop
  risk** — this project should not assume the platform bounds it.

## 5. Does it work on both `Stop` and `SubagentStop`?

**[OBSERVED]** — yes, confirmed live on both events, with the field set differing exactly
as expected (SubagentStop adds `agent_id`, `agent_type`, `agent_transcript_path`; Stop has
none of the three). This corroborates the already-established fact that `type: "prompt"`
and `type: "agent"` are Stop/SubagentStop-only (attempting them on SessionStart/Setup/
SubagentStart produces the documented "use a command-type hook instead" error — not
independently re-verified in this probe, taken from the task's pre-established background).

## 6. Verdict on TRD §2.2 — is Shape A (judge-only) viable?

**Yes, Shape A is viable on the payload-visibility axis.** The evaluating model for a
`type: "prompt"` Stop/SubagentStop hook receives `background_tasks` and `session_crons`
(and, on SubagentStop, `agent_id`/`agent_type`) as first-class fields in its substituted
`$ARGUMENTS` input — identical to what a command-type hook's stdin JSON contains. There is
no information asymmetry that would force Shape B (a companion command-type hook feeding
context to the judge) purely to expose async-machinery state. A prompt-only hook can
legitimately encode the escape valve directly in its prompt text, e.g.: *"If
`background_tasks` or `session_crons` in the input JSON is non-empty, treat that as
legitimate async machinery in flight and return ok:true."*

**However, viability on the payload axis does not make Shape A free of risk** — §4's
loop finding is the caveat that matters for the *design*, not just the payload question:
a judge-only hook that misjudges (blocks when it shouldn't) has no hard-capped recovery
path built into the platform the way this project's own `subagent-discipline.js` does for
its bespoke guard. If Shape A is adopted, it should either (a) explicitly instruct the
judge to fail open / return `ok:true` on any uncertainty, or (b) be paired with the kind
of consecutive-block counter this project already built for its command-type guards,
because the platform's native loop-breaking here was observed to be "the evaluated model
eventually gives up," not a structural guarantee.

---

## Appendix — cleanup

Both throwaway probe repos (`mktemp -d` under `$CLAUDE_JOB_DIR/tmp`) and their generated
session transcripts under `~/.claude/projects/` were used read-only for evidence extraction
and the repo dirs were deleted after use (`rm -rf`). No files under `packages/`, `.claude/`,
or `test/` in this repository were modified. Only this findings file was created.
