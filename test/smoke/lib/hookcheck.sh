#!/usr/bin/env bash
# =============================================================================
# hookcheck.sh - Shared hook-invocation payload builder + runner
# =============================================================================
#
# Sourced (after lib/assert.sh) by any scenario that needs to feed a hook file
# a minimal, event-appropriate payload and assert it loads and exits 0. Single
# owner for this logic so it has exactly one place to fix — hooks-health.sh
# (this repo's own .claude/hooks/) and scaffold-integrity.sh (a SCAFFOLDED
# project's .claude/hooks/) both source this rather than each keeping their
# own copy of the payload shapes.
#
# =============================================================================

set -uo pipefail

# hookcheck_write_transcript <dir>
# Writes a minimal two-line JSONL transcript at <dir>/transcript.jsonl for
# events that read transcript_path (SubagentStop, Stop, PreCompact).
hookcheck_write_transcript() {
    local dir="$1"
    cat > "${dir}/transcript.jsonl" <<'EOF'
{"role":"user","content":"smoke test prompt"}
{"role":"assistant","content":"Smoke test transcript line, nothing to see here."}
EOF
}

# hookcheck_payload_for_event <event> <work_dir>
# Echoes a minimal valid JSON payload on stdout for the given hook event.
# <work_dir> must already contain transcript.jsonl (see
# hookcheck_write_transcript) if the event needs transcript_path.
hookcheck_payload_for_event() {
    local event="$1" work_dir="$2"
    case "$event" in
        UserPromptSubmit)
            printf '{"prompt":"smoke test","cwd":"%s","session_id":"smoke-test"}' "$work_dir"
            ;;
        PostToolUse)
            # .txt has no configured formatter -> fast "no_formatter" no-op path,
            # avoids spawning prettier/npx during the health check.
            local f="${work_dir}/sample.txt"
            echo "sample" > "$f"
            printf '{"tool_name":"Write","tool_input":{"file_path":"%s"},"tool_response":{"filePath":"%s"},"cwd":"%s"}' "$f" "$f" "$work_dir"
            ;;
        SubagentStop)
            printf '{"transcript_path":"%s","cwd":"%s","session_id":"smoke-test"}' "${work_dir}/transcript.jsonl" "$work_dir"
            ;;
        Stop)
            printf '{"transcript_path":"%s","background_tasks":[],"session_crons":[],"stop_hook_active":false,"cwd":"%s","session_id":"smoke-test"}' "${work_dir}/transcript.jsonl" "$work_dir"
            ;;
        SessionStart)
            printf '{"cwd":"%s","session_id":"smoke-test"}' "$work_dir"
            ;;
        PreCompact)
            printf '{"trigger":"manual","transcript_path":"%s","cwd":"%s","session_id":"smoke-test"}' "${work_dir}/transcript.jsonl" "$work_dir"
            ;;
        *)
            printf '{"cwd":"%s"}' "$work_dir"
            ;;
    esac
}

# hookcheck_interpreter_for <hook_path>
# Echoes the interpreter binary for a hook file's extension, or "" if unknown.
hookcheck_interpreter_for() {
    case "$1" in
        *.py) echo "python3" ;;
        *.js) echo "node" ;;
        *.sh) echo "bash" ;;
        *) echo "" ;;
    esac
}

# hookcheck_run_one <event> <hook_path> <work_dir> <label>
# Feeds <hook_path> the event-appropriate payload with cwd=<work_dir>, and
# asserts (via assert_exit_code / assert_json_valid_or_empty, so the caller's
# ASSERT_*_COUNT accumulates normally):
#   1. it loads and exits 0
#   2. stdout is empty or valid JSON
# <label> is the assertion description prefix (e.g. "Stop/wiggum.js").
hookcheck_run_one() {
    local event="$1" hook_path="$2" work_dir="$3" label="$4"
    local interp
    interp="$(hookcheck_interpreter_for "$hook_path")"

    if [[ -z "$interp" ]]; then
        assert_fail_raw "$label: unknown interpreter for extension"
        return
    fi
    if [[ ! -f "$hook_path" ]]; then
        assert_fail_raw "$label: hook file missing at $hook_path"
        return
    fi

    local payload out rc stderr_file
    payload="$(hookcheck_payload_for_event "$event" "$work_dir")"
    stderr_file="${work_dir}/.hookcheck-$(basename "$hook_path").stderr"
    out="$(cd "$work_dir" && printf '%s' "$payload" | smoke_timeout 5 "$interp" "$hook_path" 2>"$stderr_file")"
    rc=$?

    assert_exit_code 0 "$rc" "$label: loads and exits 0"
    assert_json_valid_or_empty "$out" "$label: stdout empty or valid JSON"
}

# hookcheck_derive_from_settings <settings_json_file>
# Emits "<event>\t<full command string>" TSV, one line per registered hook
# entry, matching the shape settings.json's hooks block uses everywhere in
# this repo (event -> [{matcher, hooks:[{type,command,timeout}]}]).
hookcheck_derive_from_settings() {
    local settings_file="$1"
    jq -r '.hooks | to_entries[] | .key as $event | .value[].hooks[] | [$event, .command] | @tsv' "$settings_file" 2>/dev/null
}

# hookcheck_extract_hook_rel <command_string>
# Pulls the ".claude/hooks/<file>" reference out of a wrapped `bash -c`
# settings.json command string. Echoes "" (and returns 1) if none found.
hookcheck_extract_hook_rel() {
    local command="$1"
    grep -oE '\.claude/hooks/[A-Za-z0-9_.-]+' <<< "$command" | head -1
}
