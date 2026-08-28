# U7 Probe — does `UserPromptSubmit` `additionalContext` reach the `Stop` judge?

**Run:** 2026-08-26. **Task:** AJCS-P001 (`docs/TRD/autonomy-judge-command-scope.md`), the
Phase 1 gate. **Status: all 4 questions answered; the gate PASSES.**

Evidence markers follow the convention of the sibling probes: **[OBSERVED]** = run here and
the output read; **[INFERRED]** = reasoned, not executed.

---

## Summary

| # | Question | Verdict |
|---|----------|---------|
| a | Does `UserPromptSubmit` `additionalContext` still reach the `Stop` judge? | **YES [OBSERVED]** — reproduced in a second, differently-shaped session |
| b | Does the `UserPromptSubmit` payload carry `session_id`? | **YES [OBSERVED]** — with `transcript_path`, `prompt_id`, `permission_mode` |
| c | Why does the `Stop` hook fire inconsistently under `claude --print`? | **RESOLVED [OBSERVED]** — it does not. It fires reliably; a missing record is a silent `ok: true` |
| d | D3's ordering premise: which marker does the judge act on? | **THE LAST ONE [OBSERVED]** |

AC-F6.3 halts Phase 2+ only on (a) failing. It did not fail. **The build may proceed.**

---

## (a) and (d) — one two-turn session settles both

**[OBSERVED].** An isolated project, a `UserPromptSubmit` command hook emitting a *different*
marker on each successive prompt (driven by a counter file), and a `Stop` prompt hook asked to
report how many `ENSEMBLE_COMMAND:` lines it can see and what the most recent one says. Two
turns of one session via `--session-id` then `--resume`:

| Turn | Injected by the hook | Judge verdict |
|------|---------------------|---------------|
| 1 | `ENSEMBLE_COMMAND: active /implement-trd` | `COUNT=1 LAST=active /implement-trd` |
| 2 | `ENSEMBLE_COMMAND: none` | `COUNT=2 LAST=none` |

Three facts, and the second is the one the design turns on:

1. **(a) reproduces.** This is the second independent observation, and unlike the first it is a
   multi-turn `--resume` session rather than a single `--print` call. The 2026-08-26 record in
   `docs/TRD/discipline-rules-accuracy.md` (lines 130-147) stated its evidence base was one
   clean observation; it is now two, in different session shapes.
2. **Markers ACCUMULATE.** `COUNT=2` on turn 2 proves the judge sees every marker injected so
   far in the session, not just the latest. The stickiness hazard the PRD's OQ-2 warns about is
   real and measured, not theoretical.
3. **(d) The judge acts on the LAST marker.** `LAST=none` on turn 2, with the `active` line
   still in context. D3's "last matching marker wins" premise holds, and `AJCS-B005` may write
   the precondition text as designed.

Facts 2 and 3 together are what make the design work, and they are why the router must emit
current state on **every** prompt rather than only when a command starts: because markers
accumulate, a start-only marker would remain visible for the rest of the session, and only
"last wins" makes a per-turn refresh able to correct it.

## (b) — the payload carries `session_id`

**[OBSERVED].** The hook dumped its own stdin. The `UserPromptSubmit` payload keys:

```
cwd, hook_event_name, permission_mode, prompt, prompt_id, session_id, transcript_path
```

So the router can bind a per-session run-state file to `session_id` directly, and D3/D4's
session-binding fallback is not needed.

**Worth noting for `AJCS-B003`:** `router.py:176-177` currently reads only `prompt` and `cwd`
from this payload. `session_id` is available but unused today.

Contrast the `Stop` payload, which carries `session_id` too but **no field naming the active
command** — that asymmetry is the whole reason this channel exists
(`U2-prompt-payload.md:93`, `U5-kill-switch-mechanism.md:110-114`).

## (c) — RESOLVED: the hook fires reliably; a missing record means ALLOW

**[OBSERVED].** The ambiguity was that a silent `ok: true` and a hook that never fired look
identical in the transcript. An always-blocking hook separates them: register a `Stop` prompt
that returns `ok: false, reason: "FIRED"` on every evaluation (with the usual `stop_hook_active`
early-allow), then run five independent `--print` sessions.

```
5/5 sessions produced a Stop verdict
```

So the hook is **not** firing inconsistently. Every earlier "no verdict" run was the judge
returning `ok: true`, which by design writes nothing.

**Consequence, and it removes a blocker rather than adding one:** `AJCS-T002`'s corpus scoring
under `--print` is sound, provided the scorer treats an absent record as an ALLOW rather than as
a missing evaluation. The concern that scoring was unreliable — raised when this document was
first written — was unfounded.

One residual, milder observation: in the (a)/(d) probe the judge was instructed to always return
one of three `ok: false` reasons and sometimes returned none, i.e. it allowed against
instruction. That prompt had three branches and asked the judge to inspect context; the
single-branch prompt here complied 5/5. **[INFERRED]** complex multi-branch judge prompts are
likelier to fall through to allow — which is the safe direction, and consistent with this
project's own "when uncertain, allow" instruction.

---

## Reproduction

Isolated project, nothing in this repository touched:

```bash
# .claude/hooks/marker.sh — emits a different marker per prompt via a counter file
#   n==1 -> "ENSEMBLE_COMMAND: active /implement-trd"
#   else -> "ENSEMBLE_COMMAND: none"
# printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}'

# .claude/settings.json registers marker.sh on UserPromptSubmit and a prompt-type
# Stop hook asking for COUNT=<n> LAST=<value>, with a stop_hook_active early-allow.

SID=$(uuidgen)
claude --print --setting-sources project --dangerously-skip-permissions --session-id "$SID" "Say A."
claude --print --setting-sources project --dangerously-skip-permissions --resume    "$SID" "Say B."

# Read the verdicts out of the session transcript:
#   ~/.claude/projects/<encoded-cwd>/<SID>.jsonl
#   -> user records containing "Stop hook feedback", tail after "]: "
```

For (b), replace the hook body with `RAW=$(cat); echo "$RAW" > .claude/.payload.json` and read
the keys.

## What this probe does NOT establish

- Whether the channel survives a **truncated** transcript. `U2-prompt-payload.md` records that
  long sessions are truncated for the evaluator with a synthetic note. A marker early in a long
  session may be dropped — untested. Per-turn injection is the mitigation and is the design.
- Whether behaviour differs on `SubagentStop`. Out of scope (TRD NG3).
- Behaviour under an interactive (non-`--print`) session was not separately measured for (c).
