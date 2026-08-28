#!/usr/bin/env bash
# =============================================================================
# judge-sees-marker - Does UserPromptSubmit additionalContext reach the Stop
#                     judge? Automates docs/modernization/probes/U7-injected-
#                     context-marker.md's reproduction.
# =============================================================================
#
# The autonomy-discipline judgment (packages/core/hooks/prompts/discipline-
# stop.prompt.md) decides whether it applies by looking, in the conversation
# it is judging, for an ENSEMBLE_COMMAND marker line injected by router.py's
# UserPromptSubmit `additionalContext`. That channel is UNDOCUMENTED platform
# behaviour (U7). If a future platform change silently stops delivering
# `additionalContext` into what the Stop judge sees, the whole
# active/none-marker design (TRD decisions D2-D5, D8, D12) goes quiet: no
# error, just a judge that can no longer tell whether a command is running.
# This scenario is the tripwire for exactly that.
#
# It does NOT scaffold the ensemble framework and does NOT use
# lib/project.sh's smoke_scaffold_project — it builds the minimal fixture
# from U7's own reproduction directly: a throwaway git repo with its own
# .claude/settings.json registering (a) a UserPromptSubmit command hook that
# always injects one ENSEMBLE_COMMAND marker line via additionalContext, and
# (b) a Stop prompt hook that UNCONDITIONALLY blocks (after the standard
# stop_hook_active loop-guard allow) reporting whether it can see that line.
# Forcing a block on every evaluation is deliberate and mirrors U7 (c): an
# allow writes nothing to the transcript, so a hook that never fires and a
# hook that fired and silently allowed are indistinguishable UNLESS the judge
# is made to always report. That is what makes SKIP (hook never fired) and
# FAIL (fired, marker not seen) tell apart cleanly instead of collapsing.
#
# Outcomes (verified by hand before writing this file — see
# AJCS-T003's task readout for the transcript excerpts):
#   PASS - a "Stop hook feedback" record's reason is SEES_MARKER: <line>
#   FAIL - a record exists but its reason is NO_MARKER (or anything else that
#          isn't SEES_MARKER) - the Stop hook fired, additionalContext did
#          not reach it. Names the mechanism and points at the probe doc.
#   FAIL - the turn did not complete (non-zero exit / timeout) and no verdict
#          record exists. Nothing was measured, so this must NOT degrade to
#          SKIP: `smoke_skip` reports "0 passed, 0 failed" and would erase the
#          failure already recorded for the bad exit.
#   SKIP - the turn completed cleanly and no "Stop hook feedback" record
#          appears at all - the Stop hook itself never fired (not: it fired
#          and allowed silently, since this hook cannot allow except via the
#          loop guard on a SECOND evaluation, and the FIRST evaluation of a
#          fresh --print turn always has stop_hook_active=false).
#
# Costs one real model invocation (one `claude --print` turn, no subagents).
# Opt-in LLM scenario - never in the default set.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
# shellcheck disable=SC2034  # not used by this scenario; kept for convention parity
REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"

command -v claude  &>/dev/null || smoke_skip "claude CLI not found in PATH"
# jq and python3 are load-bearing here, not incidental: python3 writes the
# fixture's settings.json and jq reads the verdict back out. Without these
# checks a missing interpreter produces an empty verdict, which the read-back
# below cannot distinguish from "the Stop hook never fired" — i.e. a missing
# tool would be reported as SKIP, and this tripwire would go quiet in exactly
# the way it exists to prevent.
command -v jq      &>/dev/null || smoke_skip "jq not installed"
command -v python3 &>/dev/null || smoke_skip "python3 not installed"

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-seesmarker.XXXXXX")"
# PRESERVE THE EVIDENCE. Both the FAIL and the no-verdict paths below point the
# reader at the transcript; an unconditional `rm -rf` deletes the only copy of
# it before anyone can look. Same rationale as verify-functional.sh's cleanup.
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 || "${PRESERVE_FIXTURE:-0}" == "1" ]]; then
        echo "  scratch project PRESERVED for diagnosis: $PROJECT_DIR"
        echo "  remove it yourself when done: rm -rf $PROJECT_DIR"
        return 0
    fi
    rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT INT TERM

# --- Build the minimal U7-reproduction fixture (no ensemble scaffold) -------

mkdir -p "${PROJECT_DIR}/.claude/hooks"

# Emits exactly the D2 marker shape (TRD §1.2 decision table) on every prompt,
# unconditionally - this scenario only needs to prove the CHANNEL works, not
# exercise D3/D4's accumulate-and-supersede behaviour (that's U7 (a)/(d),
# already probed; NG9 forbids building further design on one observation of
# this channel, which is a different thing from re-verifying the channel
# itself stays open).
cat > "${PROJECT_DIR}/.claude/hooks/marker.sh" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"ENSEMBLE_COMMAND state=active session=smoke command=/smoke-marker-test"}}'
EOF
chmod +x "${PROJECT_DIR}/.claude/hooks/marker.sh"

# The judge prompt: force a submit({ok:false, reason: SEES_MARKER:... | NO_MARKER})
# on every evaluation except the loop-guard re-entry, so absence of a verdict
# in the transcript can only mean the hook never fired at all.
JUDGE_PROMPT='If stop_hook_active is true in the payload below, call submit({ok:true}) immediately and stop reading.

Otherwise: look at the context available to you in this conversation, including any additional context injected when the prompt was submitted. Does it contain a line beginning with the literal text ENSEMBLE_COMMAND?

If yes: call submit({ok:false, reason:"SEES_MARKER: " + <the exact line, verbatim>}).
If no such line is anywhere in your context: call submit({ok:false, reason:"NO_MARKER"}).

Payload:
$ARGUMENTS

Your entire response is a single submit call. Nothing else.'

python3 - "$PROJECT_DIR" "$JUDGE_PROMPT" <<'PY'
import json, sys
project_dir, prompt = sys.argv[1], sys.argv[2]
settings = {
    "hooks": {
        "UserPromptSubmit": [
            {"matcher": "", "hooks": [
                {"type": "command", "command": "bash .claude/hooks/marker.sh", "timeout": 5}
            ]}
        ],
        "Stop": [
            {"matcher": "", "hooks": [
                {"type": "prompt", "prompt": prompt, "timeout": 30}
            ]}
        ]
    }
}
with open(f"{project_dir}/.claude/settings.json", "w") as f:
    json.dump(settings, f, indent=2)
PY

# Prove the fixture actually got written. `set -e` is deliberately off in this
# harness, so a python3 failure above would otherwise sail past and leave a
# project with NO hooks registered — which reads downstream as "the Stop hook
# never fired" (SKIP) rather than as the setup failure it is.
if [[ ! -s "${PROJECT_DIR}/.claude/settings.json" ]] \
   || ! jq -e '.hooks.UserPromptSubmit and .hooks.Stop' "${PROJECT_DIR}/.claude/settings.json" >/dev/null 2>&1; then
    assert_fail_raw "fixture settings.json was not written with both hooks registered — cannot run the tripwire"
    smoke_finish
fi

git -C "$PROJECT_DIR" init -q
git -C "$PROJECT_DIR" config user.email "smoke@example.com"
git -C "$PROJECT_DIR" config user.name "Smoke Harness"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: judge-sees-marker fixture" --no-verify
assert_pass_raw "fixture project built (marker hook + always-blocking judge hook)"

# --- Run one live turn --------------------------------------------------

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
(
    cd "$PROJECT_DIR" || exit 90
    export CLAUDE_CODE_ENABLE_TELEMETRY=0
    smoke_timeout 60 claude \
        --print \
        --verbose \
        --setting-sources project \
        --permission-mode bypassPermissions \
        --output-format stream-json \
        "Say hello." \
        >"$SESSION_FILE" 2>&1
)
RC=$?

if [[ "$RC" == "0" ]]; then
    assert_pass_raw "claude --print completed (exit=$RC)"
else
    assert_fail_raw "claude --print exited unexpectedly (exit=$RC)"
fi

# --- Read the verdict back out of the transcript ------------------------
#
# Per U7's documented read: a "Stop hook feedback:" record is a `user`-role
# synthetic message whose text is "Stop hook feedback:\n[<prompt>]: <reason>".
# Extract the field with jq rather than a raw grep -o over the JSON line: the
# judge PROMPT ITSELF contains literal double quotes (`reason:"SEES_MARKER:
# ..."`), and a naive `[^"]*"` grep terminates at the first of those - well
# before the actual verdict, which comes after the prompt text - silently
# capturing a truncated, wrong string instead of the judge's answer. Measured
# while building this scenario: that exact bug produced a false FAIL.
#
# grep '^{' filters the one non-JSON preamble line `claude --print
# --output-format stream-json` prepends ("Ignoring N permissions.allow
# entries...") - see lib/project.sh's smoke_final_text for the same gap.
VERDICT_TEXT="$(grep '^{' "$SESSION_FILE" 2>/dev/null | jq -rs '
    [.[] | select(.type=="user") | .message.content[]? |
     select(.type=="text") | .text | select(startswith("Stop hook feedback:"))] |
    if length > 0 then last else empty end
' 2>/dev/null)"

if [[ -z "$VERDICT_TEXT" ]]; then
    # No verdict record at all. Two very different causes, and collapsing them
    # is how a tripwire stops being one:
    #
    #  - the turn itself never completed (non-zero exit / timeout). Nothing was
    #    measured, and `smoke_skip` would DISCARD the failure already recorded
    #    above (it prints "0 passed, 0 failed" and exits 2), turning a broken
    #    run into a green-ish SKIP. Fail instead.
    #  - the turn completed cleanly and STILL produced no verdict -> the Stop
    #    hook itself never fired. A single fresh --print turn's first Stop
    #    evaluation always has stop_hook_active=false, so the loop-guard allow
    #    (the hook's only non-reporting path) cannot be why nothing shows up.
    #    That is a genuine environment/platform precondition -> SKIP.
    PRESERVE_FIXTURE=1
    if [[ "$RC" != "0" ]]; then
        assert_fail_raw "no Stop-hook verdict AND the turn did not complete (exit=$RC) - nothing was measured; transcript: ${SESSION_FILE}"
        smoke_finish
    fi
    smoke_skip "Stop hook never fired - no 'Stop hook feedback' record in the transcript at all (see ${SESSION_FILE})"
fi

assert_pass_raw "Stop hook fired - a verdict record is present in the transcript"

# Take the reason after the LAST "]: " - the prompt text itself may contain
# "]: " sequences in general, so anchor on the last occurrence, not the first.
REASON="${VERDICT_TEXT##*]: }"

if [[ "$REASON" == "SEES_MARKER:"* ]]; then
    assert_pass_raw "judge saw the injected ENSEMBLE_COMMAND marker (additionalContext channel is open): ${REASON:0:200}"
elif [[ "$REASON" == "NO_MARKER"* ]]; then
    assert_fail_raw "judge did NOT see the injected marker - the UserPromptSubmit additionalContext channel that carries ENSEMBLE_COMMAND to the Stop judge appears closed. This is the mechanism probed in docs/modernization/probes/U7-injected-context-marker.md; re-run that probe's reproduction by hand and, if confirmed, treat the D2-D5/D8/D12 marker design (docs/TRD/autonomy-judge-command-scope.md) as broken until the channel is restored."
else
    assert_fail_raw "judge's Stop-hook verdict was neither SEES_MARKER nor NO_MARKER - unexpected reason: ${REASON:0:300}"
fi

smoke_finish
