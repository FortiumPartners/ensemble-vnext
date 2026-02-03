#!/usr/bin/env bash
#
# notify.sh - Stop hook for session end notifications
#
# Fires on Stop and optionally notifies an orchestrating agent via the
# NOTIFY_ON_STOP environment variable. When set, executes the specified
# command to signal session completion. This enables orchestration patterns
# where a parent process or external system needs to know when a Claude
# Code session has finished.
#
# =============================================================================
# PURPOSE
# =============================================================================
#
# This hook enables external orchestration of Claude Code sessions by:
# 1. Detecting when a session stops (locally or remotely)
# 2. Executing a user-defined notification command
# 3. Falling back to openclaw gateway wake if the command fails
# 4. Never blocking the session stop (always exits 0)
#
# Common use cases:
# - Notifying a tmux pane that a session is complete
# - Triggering webhooks for CI/CD pipelines
# - Writing signal files for shell script orchestration
# - Sending messages to queue systems (SQS, Redis, etc.)
#
# =============================================================================
# ENVIRONMENT VARIABLES
# =============================================================================
#
#   INPUT (set by user):
#
#   NOTIFY_ON_STOP       - Command to execute when session stops (optional)
#                          If unset, empty, or whitespace-only: silent exit
#                          The command is executed via /bin/sh -c with a 30s timeout
#
#   NOTIFY_HOOK_DEBUG    - Enable debug logging to stderr (default: "0")
#                          Set to "1" to see detailed execution logs
#                          Sensitive values are masked in debug output
#
#   NOTIFY_HOOK_DISABLE  - Set to "1" to disable hook entirely (default: "0")
#                          Useful for temporarily disabling notifications
#
#   OUTPUT (exported to NOTIFY_ON_STOP command):
#
#   NOTIFY_SESSION_ID    - Session ID from hook input (or "unknown" if missing)
#   NOTIFY_CWD           - Working directory from hook input (or "unknown" if missing)
#   NOTIFY_TRANSCRIPT_PATH - Transcript path from hook input (or "unknown" if missing)
#
# =============================================================================
# HOOK TYPE: Stop
# =============================================================================
#
#   - Fires when Claude Code session stops (user types /exit, session ends)
#   - Executes user-provided notification command
#   - Falls back to openclaw gateway wake on failure
#   - Non-blocking: always exits 0 and returns {"continue": true}
#   - Timeout: 60 seconds (configured in settings.json)
#
# =============================================================================
# INPUT (JSON via stdin)
# =============================================================================
#
#   {
#     "cwd": "/path/to/working/directory",
#     "transcript_path": "/path/to/session/transcript.jsonl",
#     "session_id": "abc123..."
#   }
#
# =============================================================================
# OUTPUT (JSON to stdout)
# =============================================================================
#
#   {"continue": true}
#
# =============================================================================
# EXIT CODES
# =============================================================================
#
#   0 - Hook processed successfully (always non-blocking)
#       Note: Returns 0 even if notification command fails to avoid
#       blocking the session stop process.
#
# =============================================================================
# USAGE EXAMPLES
# =============================================================================
#
# Pattern 1: tmux Notification (notify orchestrating pane)
#   export NOTIFY_ON_STOP="tmux send-keys -t orchestrator 'echo Session complete' Enter"
#   claude --remote "Implement feature X"
#
# Pattern 2: Webhook Notification (trigger CI/CD)
#   export NOTIFY_ON_STOP="curl -X POST https://webhook.example.com/session-complete"
#   claude --remote "Run tests"
#
# Pattern 3: File-based Signal (shell script orchestration)
#   export NOTIFY_ON_STOP="touch /tmp/session-complete-signal"
#   claude --remote "Build project"
#
# Pattern 4: Message Queue (AWS SQS, Redis, etc.)
#   export NOTIFY_ON_STOP="aws sqs send-message --queue-url https://sqs... --message-body 'done'"
#   claude --remote "Deploy to staging"
#
# Pattern 5: Multiple notifications (chain commands)
#   export NOTIFY_ON_STOP="touch /tmp/done && curl -s https://api.example.com/notify"
#   claude --remote "Process data"
#
# Pattern 6: Using session context (available to NOTIFY_ON_STOP command)
#   export NOTIFY_ON_STOP='echo "Session $NOTIFY_SESSION_ID completed in $NOTIFY_CWD"'
#   claude --remote "Implement feature"
#   # The command receives: NOTIFY_SESSION_ID, NOTIFY_CWD, NOTIFY_TRANSCRIPT_PATH
#
# =============================================================================
# TESTING
# =============================================================================
#
# Unit tests: packages/core/hooks/notify.test.sh
# Run tests:  npx bats packages/core/hooks/notify.test.sh
#
# Manual testing with debug mode:
#   export NOTIFY_HOOK_DEBUG=1
#   export NOTIFY_ON_STOP="echo 'Test notification'"
#   echo '{"cwd": "/tmp", "session_id": "test"}' | .claude/hooks/notify.sh
#
# =============================================================================
# TRD REFERENCE
# =============================================================================
#
# Implementation: NOTIFY-P001, NOTIFY-P002, NOTIFY-B001-B008
# Tests:          NOTIFY-T001 through NOTIFY-T008
#

set -euo pipefail

# Command timeout in seconds
readonly COMMAND_TIMEOUT=30

# Fallback notification command
readonly FALLBACK_COMMAND='openclaw gateway wake --text "Session stopped (notify failed)" --mode now'

#######################################
# Debug logging function
# Logs to stderr only when NOTIFY_HOOK_DEBUG=1
# Sensitive data is masked in output
# Arguments:
#   $1 - Message to log
# Outputs:
#   Writes timestamped log to stderr if debug enabled
#######################################
debug_log() {
    if [[ "${NOTIFY_HOOK_DEBUG:-0}" == "1" ]]; then
        echo "[NOTIFY $(date -Iseconds)] $1" >&2
    fi
}

#######################################
# Output hook result to stdout
# Stop hooks should only return {"continue": true}
# Arguments:
#   None
# Outputs:
#   Writes JSON to stdout
#######################################
output_result() {
    echo '{"continue": true}'
}

#######################################
# Parse hook input from stdin
# Reads JSON input if available from stdin
# Arguments:
#   None
# Outputs:
#   Writes JSON input to stdout (empty string if stdin is a tty)
#######################################
parse_input() {
    local input=""
    if [[ ! -t 0 ]]; then
        input=$(cat)
    fi
    echo "$input"
}

#######################################
# Extract a field from JSON input
# Uses jq if available, falls back to grep/sed for basic extraction
# Arguments:
#   $1 - JSON input string
#   $2 - Field name to extract
#   $3 - Default value if field not found
# Outputs:
#   Writes field value to stdout
#######################################
extract_json_field() {
    local json="$1"
    local field="$2"
    local default="${3:-unknown}"
    local value=""

    if [[ -z "$json" ]]; then
        echo "$default"
        return
    fi

    # Try jq first (most reliable)
    if command -v jq &>/dev/null; then
        value=$(echo "$json" | jq -r ".$field // empty" 2>/dev/null)
        if [[ -n "$value" && "$value" != "null" ]]; then
            echo "$value"
            return
        fi
    fi

    # Fallback: use grep/sed for basic JSON field extraction
    # This handles simple cases like {"field": "value"}
    # Pattern: "field": "value" or "field":"value"
    value=$(echo "$json" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | \
            sed 's/^"[^"]*"[[:space:]]*:[[:space:]]*"\(.*\)"$/\1/' 2>/dev/null)

    if [[ -n "$value" ]]; then
        echo "$value"
    else
        echo "$default"
    fi
}

#######################################
# Export session context as environment variables
# Extracts fields from JSON input and exports them for use by NOTIFY_ON_STOP
# Arguments:
#   $1 - JSON input string
# Exports:
#   NOTIFY_SESSION_ID    - Session ID from input
#   NOTIFY_CWD           - Working directory from input
#   NOTIFY_TRANSCRIPT_PATH - Transcript path from input
#######################################
export_context_vars() {
    local json="$1"

    export NOTIFY_SESSION_ID
    export NOTIFY_CWD
    export NOTIFY_TRANSCRIPT_PATH

    NOTIFY_SESSION_ID=$(extract_json_field "$json" "session_id" "unknown")
    NOTIFY_CWD=$(extract_json_field "$json" "cwd" "unknown")
    NOTIFY_TRANSCRIPT_PATH=$(extract_json_field "$json" "transcript_path" "unknown")

    debug_log "Exported context: SESSION_ID=${NOTIFY_SESSION_ID:0:20}..., CWD=${NOTIFY_CWD}"
}

#######################################
# Check NOTIFY_ON_STOP environment variable
# Returns success if variable is set and non-empty (after trimming whitespace)
# Arguments:
#   None
# Returns:
#   0 if NOTIFY_ON_STOP is set and non-empty
#   1 if unset, empty, or whitespace-only
#######################################
check_notify_env() {
    local value="${NOTIFY_ON_STOP:-}"

    # Check if unset or empty
    if [[ -z "$value" ]]; then
        debug_log "NOTIFY_ON_STOP is unset or empty"
        return 1
    fi

    # Check if whitespace-only (trim and compare)
    local trimmed
    trimmed=$(echo "$value" | tr -d '[:space:]')
    if [[ -z "$trimmed" ]]; then
        debug_log "NOTIFY_ON_STOP contains only whitespace"
        return 1
    fi

    debug_log "NOTIFY_ON_STOP is set (value masked for security)"
    return 0
}

#######################################
# Execute a command with timeout
# Uses platform-appropriate timeout mechanism
# Arguments:
#   $1 - Command to execute (passed to /bin/sh -c)
#   $2 - Timeout in seconds
# Returns:
#   Exit code from command, or 124 on timeout
# Outputs:
#   Command output to stdout/stderr
#######################################
execute_with_timeout() {
    local cmd="$1"
    local timeout_secs="${2:-$COMMAND_TIMEOUT}"

    # Check for GNU timeout (Linux)
    if command -v timeout &>/dev/null; then
        timeout "$timeout_secs" /bin/sh -c "$cmd" 2>&1
        return $?
    fi

    # Check for gtimeout (macOS with coreutils)
    if command -v gtimeout &>/dev/null; then
        gtimeout "$timeout_secs" /bin/sh -c "$cmd" 2>&1
        return $?
    fi

    # Fallback: use perl for timeout (available on most systems)
    if command -v perl &>/dev/null; then
        perl -e '
            alarm shift;
            exec @ARGV;
        ' "$timeout_secs" /bin/sh -c "$cmd" 2>&1
        return $?
    fi

    # Last resort: run without timeout
    debug_log "Warning: No timeout command available, running without timeout"
    /bin/sh -c "$cmd" 2>&1
    return $?
}

#######################################
# Execute user-provided notification command
# Runs NOTIFY_ON_STOP via /bin/sh -c with timeout
# Arguments:
#   None (reads NOTIFY_ON_STOP from environment)
# Returns:
#   0 on success
#   Non-zero on failure or timeout
# Outputs:
#   Command output logged via debug_log
#######################################
execute_command() {
    local cmd="${NOTIFY_ON_STOP:-}"
    local output=""
    local exit_code=0

    debug_log "Executing notification command"

    output=$(execute_with_timeout "$cmd" "$COMMAND_TIMEOUT" 2>&1) || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        debug_log "Notification command succeeded"
    elif [[ $exit_code -eq 124 ]]; then
        debug_log "Notification command timed out after ${COMMAND_TIMEOUT}s"
    else
        debug_log "Notification command failed with exit code $exit_code"
        if [[ -n "$output" ]]; then
            # Truncate long output for logging
            debug_log "Output: ${output:0:200}"
        fi
    fi

    return $exit_code
}

#######################################
# Execute fallback notification command
# Runs openclaw gateway wake as a fallback when primary command fails
# Arguments:
#   None
# Returns:
#   0 on success
#   Non-zero on failure
# Outputs:
#   Command output logged via debug_log
#######################################
execute_fallback() {
    local output=""
    local exit_code=0

    debug_log "Executing fallback notification: $FALLBACK_COMMAND"

    output=$(execute_with_timeout "$FALLBACK_COMMAND" "$COMMAND_TIMEOUT" 2>&1) || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        debug_log "Fallback notification succeeded"
    else
        debug_log "Fallback notification failed with exit code $exit_code"
        if [[ -n "$output" ]]; then
            debug_log "Output: ${output:0:200}"
        fi
    fi

    return $exit_code
}

#######################################
# Main hook logic
# Orchestrates the notification flow:
# 1. Check if disabled
# 2. Parse input from stdin
# 3. Export session context as environment variables
# 4. Check if NOTIFY_ON_STOP is set
# 5. Execute notification command
# 6. On failure, execute fallback
# 7. Always return {"continue": true}
# Arguments:
#   None
# Returns:
#   0 (always non-blocking)
#######################################
main() {
    # 1. Check if hook is disabled
    if [[ "${NOTIFY_HOOK_DISABLE:-0}" == "1" ]]; then
        debug_log "Hook disabled (NOTIFY_HOOK_DISABLE=1)"
        output_result
        exit 0
    fi

    # 2. Parse input from stdin (for hook context)
    local input
    input=$(parse_input)

    if [[ -n "$input" ]]; then
        debug_log "Received input: ${input:0:200}..."
    else
        debug_log "No input received from stdin"
    fi

    # 3. Export session context as environment variables
    export_context_vars "$input"

    # 4. Check if NOTIFY_ON_STOP is set and non-empty
    if ! check_notify_env; then
        debug_log "No notification configured, exiting silently"
        output_result
        exit 0
    fi

    # 5. Execute the notification command
    if execute_command; then
        debug_log "Notification completed successfully"
        output_result
        exit 0
    fi

    # 6. Primary command failed, try fallback
    debug_log "Primary notification failed, attempting fallback"

    if ! execute_fallback; then
        debug_log "Fallback notification also failed, but continuing anyway"
    fi

    # 7. Always return success (non-blocking hook)
    output_result
    exit 0
}

# Run main
main "$@"
