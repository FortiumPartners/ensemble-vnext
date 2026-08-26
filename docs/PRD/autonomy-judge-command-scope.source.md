# Source package — autonomy-judge-command-scope

Verbatim source handed to `/create-prd` on 2026-08-26. Persisted so `/audit-prd` can check
the PRD against what was actually reported, rather than only for internal consistency.

## The defect, measured

`node packages/core/scripts/hook-verdict-rate.js --project -Users-james-dev-lightning-lane-prompt-fixes`
reports 957 evaluations, 100 blocks (10.4%), 3 anomalous allows (0.3%), with the tool's own
VERDICT "block rate 10.4% exceeds 8% — the guards are interrupting correct work. Shorten or
narrow them; a disabled guard is worth nothing." The 8% ceiling was added by the owner in
commit 1c490e9 ("the block rate had no ceiling, so over-blocking was unreportable"), so 10.4%
is the first reading from an instrument built for this.

87% of sampled blocks are Judgment B (autonomy-discipline). Classifying the nine short
conversational finals by hand: four are clear false positives, four are correct blocks, one
ambiguous. The four false positives are a bare factual answer ("`pwd` — `cwd` isn't a command.
You're in /Users/..."), the single word "Idle.", and TWO direct answers to the owner's own
repeated question "What test account did you use??" — which is why the owner had to ask three
times in that session. One block's own reason reads "This is a conversational assessment in
response to a direct question" and it blocked anyway.

## Root cause

`.claude/rules/autonomy.md` opens "Status: active. Applies to every workflow command." That
scope never reached the judge: grep the shipped prompt
`packages/core/hooks/prompts/discipline-stop.prompt.md` (and the 6708-byte copy embedded in
`.claude/settings.json`) for "workflow command", "conversational" or "direct question" and all
three return zero. So Judgment B evaluates every Stop, including purely conversational turns,
as though a command were mid-run. The prompt already has one working precondition of exactly
the right shape — the loop guard, "If `stop_hook_active` is true, call submit({ok: true})
immediately and stop reading" — measured bounding at max 2 consecutive blocks, zero over the cap.

## What the probes established (three isolated experiments, 2026-08-26)

The Stop payload carries a fixed field set — `session_id`, `transcript_path`, `cwd`,
`prompt_id`, `permission_mode`, `effort`, `hook_event_name`, `stop_hook_active`,
`last_assistant_message`, `background_tasks`, `session_crons` — and NO field names the active
command. Channels tested:

1. A flag file on disk — **NO**. The judge self-reported `NO_TOOL_ACCESS` when instructed to
   read one. This settles a live contradiction between
   `docs/modernization/probes/U2-prompt-payload.md` ("the agent gets actual tool access") and
   `U5-kill-switch-mechanism.md` ("no tool access") in U5's favour for prompt-type hooks;
   U2's line applies to agent-type hooks.
2. Environment variables — **NO**, already established in U5.
3. A custom payload field — **NO**, the set is fixed.
4. Context injected by a `UserPromptSubmit` hook — **YES**, verdict `SEES_MARKER`: the judge's
   context includes injected context from earlier in the session, not merely the payload JSON.

Evidence base for (4) is ONE clean observation; the Stop hook fired inconsistently under
`claude --print`, so the probe should be re-run before building.

## The proposed change, two coupled halves

**Half one.** `.claude/hooks/router.py` (195 lines, already registered on UserPromptSubmit,
already emits `hookSpecificOutput.additionalContext`, already runs on every prompt) currently
SUPPRESSES its output on slash-command prompts — `should_skip()` returns "slash command carries
its own instructions" when `prompt.lstrip().startswith("/")`. That reasoning is correct for the
orientation reminder and exactly backwards for a command marker. Change it to emit current
command state on EVERY prompt rather than nothing on command turns, because the judge sees the
whole conversation and a marker injected only at command start would go stale and remain visible
long after that run ended. The router has file access, so it can consult
`.trd-state/current.json` and the phase cursor rather than trusting prompt text alone — which
matters for the case where a command spans many assistant turns after one user prompt, and where
the user interjects mid-run. Real copies to keep in sync: `.claude/hooks/router.py` and
`packages/router/hooks/router.py` (`packages/full/hooks/router.py` is a symlink). It has an
existing pytest suite.

**Half two.** `packages/core/hooks/prompts/build-judge-prompts.js` gains a precondition block for
Judgment B, structurally parallel to the loop guard — if the most recent `ENSEMBLE_COMMAND` line
says no command is active, Judgment B does not apply. Judgment A must still run: a false async
claim is a false async claim on a conversational turn too. Regenerating touches two generated
`.md` prompts and three `settings.json` copies
(`packages/core/templates/claude-directory/settings.json`, `.claude/settings.json`,
`packages/full/.claude/settings.json`) — `generate-hooks-artifacts.sh` writes all three, and its
header records commit `35413ce` shipping a prompt fix to the template while leaving both live
copies on the old prompt.

## Why this is not /fix

`fix-sizing` returned ESCALATE at 9 files ("9 files touched exceeds the 5-file ceiling", remedy
"narrow the change, or use /create-prd"). Six of the nine are generated, so ANY judge-prompt
change is structurally over the AUTO ceiling — arguably correct, since it changes the guard on
every session on the machine.

## Risk to design against

This change deliberately REDUCES blocking in a system whose historical failure mode was MISSING
violations — the 4.1.8 regex miss on "waiting on the monitor event for completion" is the
founding case. So it must be scored PRE/POST through `test/discipline-corpus/compare-runs.js`
(72 cases, 45 clean / 27 violation) using majority verdict across runs, not a single run, per
that script's own header. The corpus currently has NO class for the conversational /
no-command-running shape, so it structurally cannot catch this regression today; real extracted
cases must be added, and `test/discipline-corpus/README.md`'s constraint D3 requires real
transcript text rather than authored examples. `RESULTS.md` also warns the offline harness
understates the real judge on payload- and precedence-sensitive cases. Finally the `SEES_MARKER`
mechanism is undocumented platform behaviour that could change, so it wants a smoke scenario
pinning it.

## Related committed work

`docs/TRD/discipline-rules-accuracy.md` (commits `1f2d70f`, `1c9a834`, `600c91c`) already
corrected the stale measurement claims in `async-discipline.md`, added the `/goal`
unbounded-loop caveat at all four sites, and records these probe results.
