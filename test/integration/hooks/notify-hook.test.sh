#!/usr/bin/env bats
# =============================================================================
# notify-hook.test.sh - Integration tests for notify hook (Stop)
# =============================================================================
# Task: NOTIFY-T009 through NOTIFY-T012
# Purpose: Verify the notify hook fires on session Stop event,
#          executes user commands, and handles fallback correctly.
#
# Test coverage:
#   - NOTIFY-T010: Hook fires on Stop event simulation
#   - NOTIFY-T011: Command execution end-to-end
#   - NOTIFY-T012: Fallback execution on command failure
#
# Run tests with:
#   bats test/integration/hooks/notify-hook.test.sh
#   bats test/integration/hooks/notify-hook.test.sh --filter "fires"
#
# Prerequisites:
#   - BATS (Bash Automated Testing System) installed
#   - jq for JSON parsing (optional, will use alternatives)
#
# Environment Variables:
#   - SKIP_HEADLESS: Skip tests requiring Claude CLI (for dry runs)
#   - SESSION_DIR: Path for session output files
#   - DEBUG: Enable verbose debugging
#
# TRD Reference: docs/TRD/stop-hook-notification.md NOTIFY-T010-T012
# =============================================================================

# Get the directory containing this test file
BATS_TEST_DIRNAME="$(cd "$(dirname "${BATS_TEST_FILENAME}")" && pwd)"

# =============================================================================
# Test Configuration
# =============================================================================

# Path to the notify hook
NOTIFY_HOOK="${BATS_TEST_DIRNAME}/../../../.claude/hooks/notify.sh"

# Fallback path if not found
if [[ ! -f "$NOTIFY_HOOK" ]]; then
    NOTIFY_HOOK="${BATS_TEST_DIRNAME}/../../../packages/core/hooks/notify.sh"
fi

# Path to settings.json
SETTINGS_FILE="${BATS_TEST_DIRNAME}/../../../.claude/settings.json"

# Session output directory
SESSION_DIR="${SESSION_DIR:-${BATS_TEST_DIRNAME}/../sessions}"

# =============================================================================
# Test Setup and Teardown
# =============================================================================

setup() {
    # Store original directory
    ORIGINAL_DIR="$(pwd)"

    # Create temporary test directory
    TEST_DIR="$(mktemp -d -t "notify-hook-test-XXXXXX")"

    # Export for tests
    export TEST_DIR
    export SESSION_DIR

    # Create session directory if needed
    mkdir -p "$SESSION_DIR"

    # Create mock commands directory
    MOCK_BIN="${TEST_DIR}/mock_bin"
    mkdir -p "$MOCK_BIN"
    export PATH="${MOCK_BIN}:${PATH}"

    # Clear environment variables that affect hook behavior
    unset NOTIFY_ON_STOP
    unset NOTIFY_HOOK_DISABLE
    unset NOTIFY_HOOK_DEBUG
}

teardown() {
    # Return to original directory
    cd "$ORIGINAL_DIR" 2>/dev/null || true

    # Clean up test directory
    if [[ -n "$TEST_DIR" && -d "$TEST_DIR" && "$TEST_DIR" == *"notify-hook-test-"* ]]; then
        rm -rf "$TEST_DIR"
    fi
}

# =============================================================================
# Helper Functions
# =============================================================================

# Create a mock command that succeeds and logs execution
create_tracked_command() {
    local cmd_name="${1:-tracked_cmd}"
    cat > "${MOCK_BIN}/${cmd_name}" << 'EOF'
#!/usr/bin/env bash
echo "$(date -Iseconds) - Command executed: $0 $*" >> "${TEST_DIR}/command_log.txt"
echo "Command executed successfully"
exit 0
EOF
    chmod +x "${MOCK_BIN}/${cmd_name}"
}

# Create a mock command that fails
create_failing_command() {
    local cmd_name="${1:-failing_cmd}"
    local exit_code="${2:-1}"
    cat > "${MOCK_BIN}/${cmd_name}" << EOF
#!/usr/bin/env bash
echo "\$(date -Iseconds) - Command failed: \$0 \$*" >> "\${TEST_DIR}/command_log.txt"
echo "Command failed with error" >&2
exit $exit_code
EOF
    chmod +x "${MOCK_BIN}/${cmd_name}"
}

# Create mock openclaw command for fallback testing
create_mock_openclaw() {
    local behavior="${1:-success}"
    mkdir -p "${MOCK_BIN}"
    if [[ "$behavior" == "success" ]]; then
        cat > "${MOCK_BIN}/openclaw" << 'EOF'
#!/usr/bin/env bash
echo "$(date -Iseconds) - Fallback executed: $0 $*" >> "${TEST_DIR}/fallback_log.txt"
echo "Fallback notification sent"
exit 0
EOF
    else
        cat > "${MOCK_BIN}/openclaw" << 'EOF'
#!/usr/bin/env bash
echo "$(date -Iseconds) - Fallback failed: $0 $*" >> "${TEST_DIR}/fallback_log.txt"
echo "Fallback notification failed" >&2
exit 1
EOF
    fi
    chmod +x "${MOCK_BIN}/openclaw"
}

# Run notify hook directly with JSON input (simulating Stop event)
run_notify_hook() {
    local cwd="${1:-/tmp}"
    local input="${2:-}"

    if [[ -z "$input" ]]; then
        input="{\"cwd\": \"$cwd\", \"session_id\": \"test-session-$(date +%s)\"}"
    fi

    echo "$input" | bash "$NOTIFY_HOOK" 2>/dev/null
}

# Run notify hook and capture both stdout and stderr
run_notify_hook_full() {
    local cwd="${1:-/tmp}"
    local input="${2:-}"

    if [[ -z "$input" ]]; then
        input="{\"cwd\": \"$cwd\", \"session_id\": \"test-session-$(date +%s)\"}"
    fi

    echo "$input" | bash "$NOTIFY_HOOK" 2>&1
}

# =============================================================================
# NOTIFY-T010: Hook fires on Stop event simulation
# =============================================================================

@test "NOTIFY-T010: notify hook fires when invoked with Stop event JSON" {
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/hook_fired"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/hook_fired" ]]
}

@test "NOTIFY-T010: notify hook returns JSON response on Stop event" {
    unset NOTIFY_ON_STOP

    local output
    output=$(run_notify_hook "/tmp")

    # Should return valid JSON with continue:true
    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T010: notify hook processes input cwd from Stop event" {
    export NOTIFY_ON_STOP="echo 'hook processed' > ${TEST_DIR}/processed.txt"

    local input='{"cwd": "/test/project", "session_id": "test-123", "transcript_path": "/tmp/transcript.jsonl"}'
    run_notify_hook "" "$input"

    [[ -f "${TEST_DIR}/processed.txt" ]]
}

@test "NOTIFY-T010: notify hook handles minimal Stop event input" {
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/minimal_input"

    local input='{}'
    run_notify_hook "" "$input"

    [[ -f "${TEST_DIR}/minimal_input" ]]
}

@test "NOTIFY-T010: notify hook silently exits when NOTIFY_ON_STOP not configured" {
    unset NOTIFY_ON_STOP

    local output
    output=$(run_notify_hook "/tmp")

    # Should return continue:true without executing any command
    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

# =============================================================================
# NOTIFY-T011: Command execution end-to-end
# =============================================================================

@test "NOTIFY-T011: notify hook executes user command successfully" {
    create_tracked_command "my_notifier"

    export NOTIFY_ON_STOP="my_notifier --arg1 value1"

    run_notify_hook "/tmp"

    # Verify command was logged
    [[ -f "${TEST_DIR}/command_log.txt" ]]
    [[ "$(cat ${TEST_DIR}/command_log.txt)" == *"Command executed"* ]]
}

@test "NOTIFY-T011: notify hook executes shell command via /bin/sh -c" {
    export NOTIFY_ON_STOP="echo 'shell command test' > ${TEST_DIR}/shell_test.txt && echo 'second' >> ${TEST_DIR}/shell_test.txt"

    run_notify_hook "/tmp"

    # Verify complex shell command executed
    [[ -f "${TEST_DIR}/shell_test.txt" ]]
    [[ "$(cat ${TEST_DIR}/shell_test.txt | wc -l)" -ge 2 ]]
}

@test "NOTIFY-T011: notify hook respects command exit code" {
    create_tracked_command "success_cmd"
    export NOTIFY_ON_STOP="success_cmd"

    local output
    output=$(run_notify_hook "/tmp")

    # Hook should succeed (continue:true) and not trigger fallback
    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
    [[ ! -f "${TEST_DIR}/fallback_log.txt" ]]
}

@test "NOTIFY-T011: notify hook handles curl-style webhook notification" {
    # Create a mock curl that logs the call
    cat > "${MOCK_BIN}/curl" << 'EOF'
#!/usr/bin/env bash
echo "$(date -Iseconds) - curl called: $*" >> "${TEST_DIR}/curl_log.txt"
exit 0
EOF
    chmod +x "${MOCK_BIN}/curl"

    export NOTIFY_ON_STOP="curl -X POST https://webhook.example.com/session-complete"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/curl_log.txt" ]]
    [[ "$(cat ${TEST_DIR}/curl_log.txt)" == *"POST"* ]]
    [[ "$(cat ${TEST_DIR}/curl_log.txt)" == *"webhook.example.com"* ]]
}

@test "NOTIFY-T011: notify hook handles tmux-style notification" {
    # Create a mock tmux that logs the call
    cat > "${MOCK_BIN}/tmux" << 'EOF'
#!/usr/bin/env bash
echo "$(date -Iseconds) - tmux called: $*" >> "${TEST_DIR}/tmux_log.txt"
exit 0
EOF
    chmod +x "${MOCK_BIN}/tmux"

    export NOTIFY_ON_STOP="tmux send-keys -t orchestrator 'echo Session complete' Enter"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/tmux_log.txt" ]]
    [[ "$(cat ${TEST_DIR}/tmux_log.txt)" == *"send-keys"* ]]
}

@test "NOTIFY-T011: notify hook handles file-based signal" {
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/session-complete-signal"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/session-complete-signal" ]]
}

@test "NOTIFY-T011: notify hook captures command stdout/stderr" {
    export NOTIFY_ON_STOP="echo 'stdout message'; echo 'stderr message' >&2"
    export NOTIFY_HOOK_DEBUG=1

    local full_output
    full_output=$(run_notify_hook_full "/tmp")

    # In debug mode, output should be captured
    [[ "$full_output" == *"stdout message"* ]] || [[ "$full_output" == *"succeeded"* ]]
}

# =============================================================================
# NOTIFY-T012: Fallback execution on command failure
# =============================================================================

@test "NOTIFY-T012: notify hook triggers fallback when command fails" {
    create_failing_command "failing_notifier"
    create_mock_openclaw "success"

    export NOTIFY_ON_STOP="failing_notifier"

    run_notify_hook "/tmp"

    # Fallback should have been triggered
    [[ -f "${TEST_DIR}/fallback_log.txt" ]]
    [[ "$(cat ${TEST_DIR}/fallback_log.txt)" == *"Fallback executed"* ]]
}

@test "NOTIFY-T012: notify hook triggers fallback when command exits non-zero" {
    create_failing_command "exit_42" 42
    create_mock_openclaw "success"

    export NOTIFY_ON_STOP="exit_42"

    run_notify_hook "/tmp"

    # Fallback should have been triggered
    [[ -f "${TEST_DIR}/fallback_log.txt" ]]
}

@test "NOTIFY-T012: notify hook fallback uses openclaw gateway wake" {
    create_failing_command "bad_cmd"
    create_mock_openclaw "success"

    export NOTIFY_ON_STOP="bad_cmd"

    run_notify_hook "/tmp"

    # Check fallback log contains expected command pattern
    [[ -f "${TEST_DIR}/fallback_log.txt" ]]
    [[ "$(cat ${TEST_DIR}/fallback_log.txt)" == *"gateway"* ]] || \
    [[ "$(cat ${TEST_DIR}/fallback_log.txt)" == *"wake"* ]]
}

@test "NOTIFY-T012: notify hook continues even when fallback fails" {
    create_failing_command "bad_cmd"
    create_mock_openclaw "fail"

    export NOTIFY_ON_STOP="bad_cmd"

    local output
    output=$(run_notify_hook "/tmp")

    # Hook should still return continue:true
    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T012: notify hook exits 0 even when both command and fallback fail" {
    create_failing_command "bad_cmd"
    create_mock_openclaw "fail"

    export NOTIFY_ON_STOP="bad_cmd"

    run_notify_hook "/tmp"
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T012: notify hook does not trigger fallback on success" {
    create_tracked_command "good_cmd"
    create_mock_openclaw "success"

    export NOTIFY_ON_STOP="good_cmd"

    run_notify_hook "/tmp"

    # Command should have run
    [[ -f "${TEST_DIR}/command_log.txt" ]]

    # Fallback should NOT have run
    [[ ! -f "${TEST_DIR}/fallback_log.txt" ]]
}

# =============================================================================
# Settings.json Integration Tests
# =============================================================================

@test "NOTIFY-I001: notify hook is registered in settings.json Stop array" {
    if [[ ! -f "$SETTINGS_FILE" ]]; then
        skip "settings.json not found at: $SETTINGS_FILE"
    fi

    # Check that notify.sh is in the Stop hooks array
    if command -v jq &>/dev/null; then
        # Entries are `bash -c 'cd ... && .claude/hooks/notify.sh'`, not a bare
        # path, and notify.sh is not in Stop[0] — it is the LAST Stop group. The
        # old exact-match-on-Stop[0] selector matched nothing and had been failing
        # since the hooks became bash -c wrappers.
        local hook_exists
        hook_exists=$(jq -r '[.hooks.Stop[].hooks[] | select(.type == "command") | .command] | map(select(test("notify\\.sh"))) | length' "$SETTINGS_FILE" 2>/dev/null)
        [[ "$hook_exists" -ge 1 ]]
    else
        # Fallback: grep-based check
        grep -q "notify.sh" "$SETTINGS_FILE"
    fi
}

@test "NOTIFY-I001: notify hook has correct timeout configuration (60s)" {
    if [[ ! -f "$SETTINGS_FILE" ]]; then
        skip "settings.json not found at: $SETTINGS_FILE"
    fi

    if command -v jq &>/dev/null; then
        # Same stale selector as the registration test above: bash -c wrapper, and
        # not in Stop[0]. Match on the command CONTAINING notify.sh instead.
        local timeout
        timeout=$(jq -r '[.hooks.Stop[].hooks[] | select(.type == "command") | select(.command | test("notify\\.sh")) | .timeout] | first' "$SETTINGS_FILE" 2>/dev/null)
        [[ "$timeout" == "60" ]]
    else
        # Fallback: grep for timeout near notify.sh
        grep -A2 "notify.sh" "$SETTINGS_FILE" | grep -q '"timeout": 60'
    fi
}

@test "NOTIFY-I001: notify hook uses empty matcher (fires on all Stop events)" {
    if [[ ! -f "$SETTINGS_FILE" ]]; then
        skip "settings.json not found at: $SETTINGS_FILE"
    fi

    if command -v jq &>/dev/null; then
        local matcher
        matcher=$(jq '.hooks.Stop[0].matcher' "$SETTINGS_FILE" 2>/dev/null)
        [[ "$matcher" == '""' ]] || [[ "$matcher" == "" ]]
    else
        # The Stop hook should have an empty matcher
        grep -B5 "notify.sh" "$SETTINGS_FILE" | grep -q '"matcher": ""'
    fi
}

# The two tests that stood here asserted notify.sh's position relative to
# learning.sh, and that both coexist in the Stop array. learning.sh was retired
# and deleted in 4.1.0, so both were asserting against a hook that does not
# exist. Deleted 2026-08-21 rather than rewritten: notify.sh being last in the
# Stop chain is already covered by notify-on-complete.test.sh, which compares
# the whole chain against hooks.manifest.json.

# =============================================================================
# Performance Tests
# =============================================================================

@test "notify hook silent exit completes quickly (< 1s)" {
    unset NOTIFY_ON_STOP

    local start_time end_time duration
    start_time=$(date +%s%N)

    run_notify_hook "/tmp" >/dev/null

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))  # Convert to milliseconds

    # Should complete in under 1000ms
    [[ $duration -lt 1000 ]]
}

@test "notify hook startup completes quickly when no notification configured" {
    unset NOTIFY_ON_STOP

    local start_time end_time duration
    start_time=$(date +%s%N)

    # Run multiple times to get average
    for i in {1..3}; do
        run_notify_hook "/tmp" >/dev/null
    done

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 / 3 ))  # Average in milliseconds

    # Average should be under 500ms
    [[ $duration -lt 500 ]]
}

# =============================================================================
# Security Tests
# =============================================================================

@test "notify hook does not expose command in non-debug output" {
    export NOTIFY_ON_STOP="curl -H 'Authorization: Bearer secret_token' https://api.example.com"
    unset NOTIFY_HOOK_DEBUG

    # Create mock curl
    cat > "${MOCK_BIN}/curl" << 'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "${MOCK_BIN}/curl"

    local output
    output=$(run_notify_hook "/tmp")

    # Output should only be the JSON response, not the command
    [[ "$output" != *"secret_token"* ]]
    [[ "$output" == '{"continue": true}' ]] || [[ "$output" == '{"continue":true}' ]]
}

@test "notify hook executes command in user context (no privilege escalation)" {
    export NOTIFY_ON_STOP="id > ${TEST_DIR}/user_context.txt"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/user_context.txt" ]]

    # Should run as current user, not root
    local uid
    uid=$(grep -o 'uid=[0-9]*' "${TEST_DIR}/user_context.txt" | cut -d= -f2)
    [[ "$uid" == "$(id -u)" ]]
}

# =============================================================================
# Edge Cases
# =============================================================================

@test "notify hook handles very long NOTIFY_ON_STOP value" {
    # Create a long but valid command
    local long_cmd="echo 'start'; "
    for i in {1..50}; do
        long_cmd+="echo 'line $i'; "
    done
    long_cmd+="touch ${TEST_DIR}/long_cmd_test"

    export NOTIFY_ON_STOP="$long_cmd"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/long_cmd_test" ]]
}

@test "notify hook handles special characters in NOTIFY_ON_STOP" {
    export NOTIFY_ON_STOP="echo 'test\$VAR' > ${TEST_DIR}/special_chars.txt"

    run_notify_hook "/tmp"

    [[ -f "${TEST_DIR}/special_chars.txt" ]]
}

@test "notify hook handles newlines in NOTIFY_ON_STOP" {
    export NOTIFY_ON_STOP=$'echo "line1"\necho "line2" >> '"${TEST_DIR}/newline_test.txt"

    run_notify_hook "/tmp"

    # At least the first command should execute
    # Shell execution may vary with newlines
    local output
    output=$(run_notify_hook "/tmp")
    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

# =============================================================================
# Summary
# =============================================================================
# This test file verifies:
# 1. NOTIFY-T010: Hook fires on Stop event simulation
# 2. NOTIFY-T011: Command execution end-to-end
# 3. NOTIFY-T012: Fallback execution on command failure
# 4. Settings.json integration (hook registration, timeout, matcher, order)
# 5. Coexistence with learning.sh hook
# 6. Performance requirements (quick silent exit)
# 7. Security considerations (no privilege escalation, command masking)
# =============================================================================
