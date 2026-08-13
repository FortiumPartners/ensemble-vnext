#!/usr/bin/env bash
# =============================================================================
# hooks-health - Scenario 1: every registered hook loads and exits 0
# =============================================================================
#
# No LLM. Must run in under 15 seconds (enforced structurally: every hook
# invocation gets its own short timeout, and there's a low fixed hook count).
#
# For every hook registered in .claude/settings.json, plus notify-complete.sh
# (invoked directly by commands, not registered as a settings.json hook event),
# feeds it a minimal valid payload on stdin and asserts:
#   1. It loads and exits 0 (this is the check that would have caught the
#      permitter shipping broken with "Cannot find module" on every
#      PermissionRequest — nothing ever loaded it).
#   2. Its stdout is either empty or valid JSON.
#
# The hook list is DERIVED from settings.json, not hardcoded — hardcoding is
# exactly what let the hook layer drift undetected in the first place.
#
# Isolation: every hook is invoked with cwd set to a throwaway temp directory
# that contains no .claude/, .trd-state/, or .git/ marker. Hooks that walk up
# looking for project root (resolve-project-root.js, status.js's own walk)
# therefore find nothing and take their documented no-op path — this is what
# keeps the scenario from ever writing into this repo (e.g. precompact.js
# appending to a real .trd-state/<feature>/session-log.md) while still
# exercising the thing that matters: does the hook's code load and run.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"

if ! command -v jq &>/dev/null; then
    smoke_skip "jq not installed"
fi

# SMOKE_SETTINGS_FILE_OVERRIDE lets the deliberate-failure drill (see README)
# point this scenario at a mutated COPY of settings.json without ever
# touching the real one.
SETTINGS_FILE="${SMOKE_SETTINGS_FILE_OVERRIDE:-${REPO_ROOT}/.claude/settings.json}"
if [[ ! -f "$SETTINGS_FILE" ]]; then
    assert_fail_raw "settings.json exists at ${SETTINGS_FILE}"
    smoke_finish
fi

export ENSEMBLE_RUNTIME_REFRESH_DISABLE=1

ISO_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-hookshealth.XXXXXX")"
cleanup() { rm -rf "$ISO_DIR"; }
trap cleanup EXIT INT TERM

FIXTURE_TRANSCRIPT="${ISO_DIR}/transcript.jsonl"
cat > "$FIXTURE_TRANSCRIPT" <<'EOF'
{"role":"user","content":"smoke test prompt"}
{"role":"assistant","content":"Smoke test transcript line, nothing to see here."}
EOF

# -----------------------------------------------------------------------------
# Payload builder: one JSON payload per hook event type.
# -----------------------------------------------------------------------------
payload_for_event() {
    local event="$1"
    case "$event" in
        UserPromptSubmit)
            printf '{"prompt":"smoke test","cwd":"%s","session_id":"smoke-test"}' "$ISO_DIR"
            ;;
        PostToolUse)
            # .txt has no configured formatter -> fast "no_formatter" no-op path,
            # avoids spawning prettier/npx during the health check.
            local f="${ISO_DIR}/sample.txt"
            echo "sample" > "$f"
            printf '{"tool_name":"Write","tool_input":{"file_path":"%s"},"tool_response":{"filePath":"%s"},"cwd":"%s"}' "$f" "$f" "$ISO_DIR"
            ;;
        SubagentStop)
            printf '{"transcript_path":"%s","cwd":"%s","session_id":"smoke-test"}' "$FIXTURE_TRANSCRIPT" "$ISO_DIR"
            ;;
        Stop)
            printf '{"transcript_path":"%s","background_tasks":[],"session_crons":[],"stop_hook_active":false,"cwd":"%s","session_id":"smoke-test"}' "$FIXTURE_TRANSCRIPT" "$ISO_DIR"
            ;;
        SessionStart)
            printf '{"cwd":"%s","session_id":"smoke-test"}' "$ISO_DIR"
            ;;
        PreCompact)
            printf '{"trigger":"manual","transcript_path":"%s","cwd":"%s","session_id":"smoke-test"}' "$FIXTURE_TRANSCRIPT" "$ISO_DIR"
            ;;
        *)
            printf '{"cwd":"%s"}' "$ISO_DIR"
            ;;
    esac
}

interpreter_for() {
    case "$1" in
        *.py) echo "python3" ;;
        *.js) echo "node" ;;
        *.sh) echo "bash" ;;
        *) echo "" ;;
    esac
}

run_one_hook() {
    local event="$1" hook_path="$2"
    local hook_name
    hook_name="$(basename "$hook_path")"
    local interp
    interp="$(interpreter_for "$hook_path")"

    if [[ -z "$interp" ]]; then
        assert_fail_raw "$event/$hook_name: unknown interpreter for extension"
        return
    fi
    if [[ ! -f "$hook_path" ]]; then
        assert_fail_raw "$event/$hook_name: hook file missing at $hook_path"
        return
    fi

    local payload
    payload="$(payload_for_event "$event")"

    local out rc
    out="$(cd "$ISO_DIR" && printf '%s' "$payload" | smoke_timeout 5 "$interp" "$hook_path" 2>"${ISO_DIR}/${hook_name}.stderr")"
    rc=$?

    assert_exit_code 0 "$rc" "$event/$hook_name: loads and exits 0"
    assert_json_valid_or_empty "$out" "$event/$hook_name: stdout empty or valid JSON"
}

# -----------------------------------------------------------------------------
# Derive the hook list from settings.json — event, then absolute hook path.
# One line per (event, command) pair: "<event>\t<command>"
# -----------------------------------------------------------------------------
HOOK_COUNT=0
while IFS=$'\t' read -r event command; do
    [[ -z "$event" ]] && continue
    # Pull the .claude/hooks/<file> reference out of the wrapped bash -c command.
    hook_rel="$(grep -oE '\.claude/hooks/[A-Za-z0-9_.-]+' <<< "$command" | head -1)"
    if [[ -z "$hook_rel" ]]; then
        assert_fail_raw "$event: could not extract hook path from command: ${command:0:120}"
        continue
    fi
    hook_path="${REPO_ROOT}/${hook_rel}"
    HOOK_COUNT=$((HOOK_COUNT + 1))
    run_one_hook "$event" "$hook_path"
done < <(jq -r '.hooks | to_entries[] | .key as $event | .value[].hooks[] | [$event, .command] | @tsv' "$SETTINGS_FILE" 2>/dev/null)

if [[ "$HOOK_COUNT" -eq 0 ]]; then
    assert_fail_raw "derived at least one hook from settings.json"
fi

# notify-complete.sh is not a settings.json-registered hook event — it's a
# utility script commands invoke directly on their final turn — but it lives
# alongside the hooks and is explicitly in scope per the smoke-harness spec.
# It takes positional args, not a JSON stdin payload, and is a silent no-op
# when NOTIFY_ON_COMPLETE is unset.
NOTIFY_COMPLETE="${REPO_ROOT}/.claude/hooks/notify-complete.sh"
if [[ -f "$NOTIFY_COMPLETE" ]]; then
    out="$(cd "$ISO_DIR" && unset NOTIFY_ON_COMPLETE; smoke_timeout 5 bash "$NOTIFY_COMPLETE" "smoke-test" "complete" "smoke test summary" 2>"${ISO_DIR}/notify-complete.stderr")"
    rc=$?
    assert_exit_code 0 "$rc" "notify-complete.sh: loads and exits 0"
    assert_json_valid_or_empty "$out" "notify-complete.sh: stdout empty or valid JSON"
else
    assert_fail_raw "notify-complete.sh exists at $NOTIFY_COMPLETE"
fi

echo "Checked ${HOOK_COUNT} registered hook(s) + notify-complete.sh"
smoke_finish
