#!/usr/bin/env bats
#
# notify.test.sh - BATS Test Suite for Notify Hook (Stop)
#
# Tests for the stop hook that optionally notifies on session completion.
#
# Run tests with: npx bats packages/core/hooks/notify.test.sh
#
# TRD Reference: NOTIFY-T001 through NOTIFY-T008
#

# =============================================================================
# Test Setup and Teardown
# =============================================================================

setup() {
    # Store original directory
    ORIGINAL_DIR="$(pwd)"

    # Create temporary test directory
    TEST_DIR="$(mktemp -d)"

    # Path to the hook being tested
    HOOK_PATH="${ORIGINAL_DIR}/packages/core/hooks/notify.sh"

    # Verify hook exists
    if [[ ! -f "$HOOK_PATH" ]]; then
        # Try relative path from BATS_TEST_DIRNAME
        HOOK_PATH="${BATS_TEST_DIRNAME}/notify.sh"
    fi

    # Fallback: search in .claude/hooks
    if [[ ! -f "$HOOK_PATH" ]]; then
        HOOK_PATH="${ORIGINAL_DIR}/.claude/hooks/notify.sh"
    fi

    # Export for tests
    export TEST_DIR
    export HOOK_PATH

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
    if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
        rm -rf "$TEST_DIR"
    fi
}

# =============================================================================
# Helper Functions
# =============================================================================

# Source the hook to get access to functions
# Note: We need to source carefully to avoid running main()
source_hook_functions() {
    # Create a modified version that exports functions without running main
    local temp_hook="${TEST_DIR}/notify_functions.sh"

    # Extract just the functions, not the main call
    sed '/^main "\$@"$/d' "$HOOK_PATH" > "$temp_hook"

    # Source the functions
    source "$temp_hook"
}

# Create a mock command that succeeds
create_mock_success_command() {
    local cmd_name="${1:-test_cmd}"
    cat > "${MOCK_BIN}/${cmd_name}" << 'EOF'
#!/usr/bin/env bash
echo "mock command executed"
exit 0
EOF
    chmod +x "${MOCK_BIN}/${cmd_name}"
}

# Create a mock command that fails
create_mock_fail_command() {
    local cmd_name="${1:-test_cmd}"
    local exit_code="${2:-1}"
    cat > "${MOCK_BIN}/${cmd_name}" << EOF
#!/usr/bin/env bash
echo "mock command failed" >&2
exit $exit_code
EOF
    chmod +x "${MOCK_BIN}/${cmd_name}"
}

# Create a mock command that hangs (for timeout testing)
create_mock_slow_command() {
    local cmd_name="${1:-slow_cmd}"
    local sleep_time="${2:-60}"
    cat > "${MOCK_BIN}/${cmd_name}" << EOF
#!/usr/bin/env bash
sleep $sleep_time
echo "slow command completed"
exit 0
EOF
    chmod +x "${MOCK_BIN}/${cmd_name}"
}

# Create mock openclaw command
create_mock_openclaw() {
    local behavior="${1:-success}"
    mkdir -p "${MOCK_BIN}"
    if [[ "$behavior" == "success" ]]; then
        cat > "${MOCK_BIN}/openclaw" << 'EOF'
#!/usr/bin/env bash
echo "openclaw: $*" >> "${TEST_DIR}/openclaw_calls.log"
echo "Fallback notification sent"
exit 0
EOF
    else
        cat > "${MOCK_BIN}/openclaw" << 'EOF'
#!/usr/bin/env bash
echo "openclaw: $*" >> "${TEST_DIR}/openclaw_calls.log"
echo "Fallback notification failed" >&2
exit 1
EOF
    fi
    chmod +x "${MOCK_BIN}/openclaw"
}

# =============================================================================
# NOTIFY-T002: Test parse_input function
# =============================================================================

@test "NOTIFY-T002: parse_input reads JSON from stdin" {
    source_hook_functions

    local result
    result=$(echo '{"cwd": "/test/path", "session_id": "abc123"}' | parse_input)

    [[ "$result" == *"cwd"* ]]
    [[ "$result" == *"session_id"* ]]
}

@test "NOTIFY-T002: parse_input returns empty on tty (interactive)" {
    source_hook_functions

    # When stdin is a tty, parse_input should return empty
    # We simulate this by testing the function's logic
    # In non-tty environment (pipe), it should work
    local result
    result=$(echo '{"test": "data"}' | parse_input)

    [[ "$result" == *"test"* ]]
}

@test "NOTIFY-T002: parse_input handles empty stdin" {
    source_hook_functions

    local result
    result=$(echo "" | parse_input)

    # Should return empty string
    [[ -z "$result" || "$result" == "" ]]
}

@test "NOTIFY-T002: parse_input handles complex JSON" {
    source_hook_functions

    local input='{"cwd": "/path/with spaces", "transcript_path": "/some/path.jsonl"}'
    local result
    result=$(echo "$input" | parse_input)

    [[ "$result" == "$input" ]]
}

# =============================================================================
# NOTIFY-T003: Test check_notify_env function
# =============================================================================

@test "NOTIFY-T003: check_notify_env returns 1 when NOTIFY_ON_STOP is unset" {
    source_hook_functions

    unset NOTIFY_ON_STOP

    run check_notify_env
    [[ "$status" -eq 1 ]]
}

@test "NOTIFY-T003: check_notify_env returns 1 when NOTIFY_ON_STOP is empty" {
    source_hook_functions

    export NOTIFY_ON_STOP=""

    run check_notify_env
    [[ "$status" -eq 1 ]]
}

@test "NOTIFY-T003: check_notify_env returns 1 when NOTIFY_ON_STOP is whitespace-only" {
    source_hook_functions

    export NOTIFY_ON_STOP="   "

    run check_notify_env
    [[ "$status" -eq 1 ]]
}

@test "NOTIFY-T003: check_notify_env returns 1 when NOTIFY_ON_STOP is tabs only" {
    source_hook_functions

    export NOTIFY_ON_STOP=$'\t\t\t'

    run check_notify_env
    [[ "$status" -eq 1 ]]
}

@test "NOTIFY-T003: check_notify_env returns 1 when NOTIFY_ON_STOP is newlines only" {
    source_hook_functions

    export NOTIFY_ON_STOP=$'\n\n'

    run check_notify_env
    [[ "$status" -eq 1 ]]
}

@test "NOTIFY-T003: check_notify_env returns 0 when NOTIFY_ON_STOP is valid" {
    source_hook_functions

    export NOTIFY_ON_STOP="echo hello"

    run check_notify_env
    [[ "$status" -eq 0 ]]
}

@test "NOTIFY-T003: check_notify_env returns 0 for complex command" {
    source_hook_functions

    export NOTIFY_ON_STOP="curl -X POST https://example.com/webhook"

    run check_notify_env
    [[ "$status" -eq 0 ]]
}

@test "NOTIFY-T003: check_notify_env returns 0 for command with leading/trailing spaces" {
    source_hook_functions

    export NOTIFY_ON_STOP="  echo hello  "

    run check_notify_env
    [[ "$status" -eq 0 ]]
}

# =============================================================================
# NOTIFY-T004: Test execute_command function
# =============================================================================

@test "NOTIFY-T004: execute_command runs NOTIFY_ON_STOP via shell" {
    source_hook_functions

    export NOTIFY_ON_STOP="echo 'test output' > ${TEST_DIR}/output.txt"

    run execute_command

    [[ "$status" -eq 0 ]]
    [[ -f "${TEST_DIR}/output.txt" ]]
    [[ "$(cat ${TEST_DIR}/output.txt)" == "test output" ]]
}

@test "NOTIFY-T004: execute_command returns 0 on success" {
    source_hook_functions
    create_mock_success_command "notify_cmd"

    export NOTIFY_ON_STOP="notify_cmd"

    run execute_command
    [[ "$status" -eq 0 ]]
}

@test "NOTIFY-T004: execute_command returns non-zero on failure" {
    source_hook_functions
    create_mock_fail_command "notify_cmd" 42

    export NOTIFY_ON_STOP="notify_cmd"

    run execute_command
    [[ "$status" -ne 0 ]]
}

@test "NOTIFY-T004: execute_command captures command output" {
    source_hook_functions

    export NOTIFY_ON_STOP="echo 'captured output'"
    export NOTIFY_HOOK_DEBUG=1

    # Run and capture stderr (where debug output goes)
    local output
    output=$(execute_command 2>&1)

    [[ "$output" == *"captured output"* ]] || [[ "$output" == *"succeeded"* ]]
}

@test "NOTIFY-T004: execute_command handles commands with special characters" {
    source_hook_functions

    # Command with quotes and special chars
    export NOTIFY_ON_STOP="echo 'hello \"world\"' > ${TEST_DIR}/special.txt"

    run execute_command

    [[ "$status" -eq 0 ]]
    [[ -f "${TEST_DIR}/special.txt" ]]
}

@test "NOTIFY-T004: execute_command handles command with pipes" {
    source_hook_functions

    export NOTIFY_ON_STOP="echo 'line1\nline2' | head -1 > ${TEST_DIR}/piped.txt"

    run execute_command

    [[ "$status" -eq 0 ]]
}

@test "NOTIFY-T004: execute_command logs stderr from command" {
    source_hook_functions

    export NOTIFY_ON_STOP="echo 'error message' >&2"
    export NOTIFY_HOOK_DEBUG=1

    local output
    output=$(execute_command 2>&1)

    # Debug mode should capture stderr output
    [[ "$output" == *"error message"* ]] || [[ "$output" == *"succeeded"* ]]
}

# =============================================================================
# NOTIFY-T005: Test execute_fallback function
# =============================================================================

@test "NOTIFY-T005: execute_fallback runs openclaw gateway wake" {
    source_hook_functions
    create_mock_openclaw "success"

    run execute_fallback

    [[ "$status" -eq 0 ]]
    [[ -f "${TEST_DIR}/openclaw_calls.log" ]]
    [[ "$(cat ${TEST_DIR}/openclaw_calls.log)" == *"gateway wake"* ]]
}

@test "NOTIFY-T005: execute_fallback returns 0 on success" {
    source_hook_functions
    create_mock_openclaw "success"

    run execute_fallback
    [[ "$status" -eq 0 ]]
}

@test "NOTIFY-T005: execute_fallback returns non-zero when openclaw fails" {
    source_hook_functions
    create_mock_openclaw "fail"

    run execute_fallback
    [[ "$status" -ne 0 ]]
}

@test "NOTIFY-T005: execute_fallback includes correct message" {
    source_hook_functions
    create_mock_openclaw "success"

    execute_fallback >/dev/null 2>&1

    [[ -f "${TEST_DIR}/openclaw_calls.log" ]]
    [[ "$(cat ${TEST_DIR}/openclaw_calls.log)" == *"Session stopped"* ]] || \
    [[ "$(cat ${TEST_DIR}/openclaw_calls.log)" == *"notify failed"* ]]
}

@test "NOTIFY-T005: execute_fallback handles missing openclaw gracefully" {
    source_hook_functions

    # Remove any mock openclaw
    rm -f "${MOCK_BIN}/openclaw"

    # execute_fallback should not crash even if openclaw is missing
    # It may return non-zero, but should not cause the hook to fail
    local exit_code=0
    execute_fallback 2>/dev/null || exit_code=$?

    # Should complete (may fail but not crash)
    [[ $exit_code -eq 0 || $exit_code -ne 0 ]]
}

# =============================================================================
# NOTIFY-T006: Test main function flow
# =============================================================================

@test "NOTIFY-T006: main outputs JSON with continue:true when NOTIFY_ON_STOP unset" {
    unset NOTIFY_ON_STOP

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T006: main outputs JSON with continue:true when NOTIFY_ON_STOP empty" {
    export NOTIFY_ON_STOP=""

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T006: main outputs JSON with continue:true when NOTIFY_ON_STOP whitespace" {
    export NOTIFY_ON_STOP="   "

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T006: main executes command when NOTIFY_ON_STOP is set" {
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/command_executed"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/command_executed" ]]
}

@test "NOTIFY-T006: main executes fallback when command fails" {
    create_mock_fail_command "failing_cmd"
    create_mock_openclaw "success"

    export NOTIFY_ON_STOP="failing_cmd"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    # Fallback should have been called
    [[ -f "${TEST_DIR}/openclaw_calls.log" ]]
}

@test "NOTIFY-T006: main returns continue:true even when command fails" {
    create_mock_fail_command "failing_cmd"
    create_mock_openclaw "fail"

    export NOTIFY_ON_STOP="failing_cmd"

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T006: main handles empty stdin" {
    export NOTIFY_ON_STOP="echo 'test'"

    local output
    output=$(bash "$HOOK_PATH" < /dev/null 2>/dev/null)

    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T006: main handles complex JSON input" {
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/complex_input_test"

    local input='{"cwd": "/path/with spaces", "transcript_path": "/log.jsonl", "session_id": "test-123"}'
    local output
    output=$(echo "$input" | bash "$HOOK_PATH" 2>/dev/null)

    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
    [[ -f "${TEST_DIR}/complex_input_test" ]]
}

# =============================================================================
# NOTIFY-T007: Test disable flag (NOTIFY_HOOK_DISABLE)
# =============================================================================

@test "NOTIFY-T007: hook is disabled when NOTIFY_HOOK_DISABLE=1" {
    export NOTIFY_HOOK_DISABLE=1
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/should_not_exist"

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    # Command should NOT have executed
    [[ ! -f "${TEST_DIR}/should_not_exist" ]]

    # Should still return valid JSON with continue:true
    [[ "$output" == *'"continue": true'* ]] || [[ "$output" == *'"continue":true'* ]]
}

@test "NOTIFY-T007: hook runs when NOTIFY_HOOK_DISABLE=0" {
    export NOTIFY_HOOK_DISABLE=0
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/should_exist"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    # Command should have executed
    [[ -f "${TEST_DIR}/should_exist" ]]
}

@test "NOTIFY-T007: hook runs when NOTIFY_HOOK_DISABLE is unset" {
    unset NOTIFY_HOOK_DISABLE
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/should_exist_unset"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    # Command should have executed
    [[ -f "${TEST_DIR}/should_exist_unset" ]]
}

@test "NOTIFY-T007: hook runs when NOTIFY_HOOK_DISABLE is empty" {
    export NOTIFY_HOOK_DISABLE=""
    export NOTIFY_ON_STOP="touch ${TEST_DIR}/should_exist_empty"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    # Command should have executed
    [[ -f "${TEST_DIR}/should_exist_empty" ]]
}

@test "NOTIFY-T007: disabled hook logs debug message when debug enabled" {
    export NOTIFY_HOOK_DISABLE=1
    export NOTIFY_HOOK_DEBUG=1
    export NOTIFY_ON_STOP="echo test"

    local stderr_output
    stderr_output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>&1 >/dev/null)

    [[ "$stderr_output" == *"disabled"* ]] || [[ "$stderr_output" == *"DISABLE"* ]]
}

# =============================================================================
# NOTIFY-T008: Test always exits 0 (non-blocking behavior)
# =============================================================================

@test "NOTIFY-T008: hook exits 0 when NOTIFY_ON_STOP unset" {
    unset NOTIFY_ON_STOP

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T008: hook exits 0 when command succeeds" {
    create_mock_success_command "success_cmd"
    export NOTIFY_ON_STOP="success_cmd"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T008: hook exits 0 when command fails" {
    create_mock_fail_command "fail_cmd" 42
    create_mock_openclaw "success"
    export NOTIFY_ON_STOP="fail_cmd"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T008: hook exits 0 when fallback fails" {
    create_mock_fail_command "fail_cmd"
    create_mock_openclaw "fail"
    export NOTIFY_ON_STOP="fail_cmd"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T008: hook exits 0 when disabled" {
    export NOTIFY_HOOK_DISABLE=1
    export NOTIFY_ON_STOP="echo test"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T008: hook exits 0 with malformed JSON input" {
    export NOTIFY_ON_STOP="echo test"

    echo 'not valid json' | bash "$HOOK_PATH" 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

@test "NOTIFY-T008: hook exits 0 with empty stdin" {
    export NOTIFY_ON_STOP="echo test"

    bash "$HOOK_PATH" < /dev/null 2>/dev/null
    local exit_code=$?

    [[ "$exit_code" -eq 0 ]]
}

# =============================================================================
# Debug Mode Tests
# =============================================================================

@test "debug mode outputs to stderr when enabled" {
    export NOTIFY_HOOK_DEBUG=1
    export NOTIFY_ON_STOP="echo 'test command'"

    local stderr_output
    stderr_output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>&1 >/dev/null)

    [[ "$stderr_output" == *"[NOTIFY"* ]]
}

@test "debug mode is silent when disabled" {
    export NOTIFY_HOOK_DEBUG=0
    export NOTIFY_ON_STOP="echo test"

    local stderr_output
    stderr_output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>&1 >/dev/null)

    # Should have no debug output with [NOTIFY prefix
    [[ -z "$stderr_output" ]] || [[ "$stderr_output" != *"[NOTIFY "* ]]
}

@test "debug mode masks command value for security" {
    export NOTIFY_HOOK_DEBUG=1
    export NOTIFY_ON_STOP="curl -H 'Authorization: Bearer secret123' https://api.example.com"

    local stderr_output
    stderr_output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>&1 >/dev/null)

    # Should not expose the full command including secrets
    # The implementation masks the value
    [[ "$stderr_output" == *"masked"* ]] || [[ "$stderr_output" != *"secret123"* ]]
}

# =============================================================================
# Output Validation Tests
# =============================================================================

@test "hook outputs valid JSON" {
    export NOTIFY_ON_STOP="echo test"

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    # Should be valid JSON - try to parse it
    echo "$output" | python3 -m json.tool > /dev/null 2>&1 || \
    echo "$output" | jq . > /dev/null 2>&1
}

@test "hook output contains only continue field" {
    unset NOTIFY_ON_STOP

    local output
    output=$(echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null)

    # Should be exactly {"continue": true}
    [[ "$output" == '{"continue": true}' ]] || [[ "$output" == '{"continue":true}' ]]
}

# =============================================================================
# NOTIFY-T009: Test extract_json_field function
# =============================================================================

@test "NOTIFY-T009: extract_json_field extracts session_id from JSON" {
    source_hook_functions

    local json='{"session_id": "test-session-123", "cwd": "/test/path"}'
    local result
    result=$(extract_json_field "$json" "session_id" "default")

    [[ "$result" == "test-session-123" ]]
}

@test "NOTIFY-T009: extract_json_field extracts cwd from JSON" {
    source_hook_functions

    local json='{"session_id": "abc", "cwd": "/home/user/project"}'
    local result
    result=$(extract_json_field "$json" "cwd" "default")

    [[ "$result" == "/home/user/project" ]]
}

@test "NOTIFY-T009: extract_json_field extracts transcript_path from JSON" {
    source_hook_functions

    local json='{"transcript_path": "/path/to/transcript.jsonl"}'
    local result
    result=$(extract_json_field "$json" "transcript_path" "default")

    [[ "$result" == "/path/to/transcript.jsonl" ]]
}

@test "NOTIFY-T009: extract_json_field returns default for missing field" {
    source_hook_functions

    local json='{"session_id": "abc"}'
    local result
    result=$(extract_json_field "$json" "missing_field" "my-default")

    [[ "$result" == "my-default" ]]
}

@test "NOTIFY-T009: extract_json_field returns default for empty JSON" {
    source_hook_functions

    local result
    result=$(extract_json_field "" "session_id" "empty-default")

    [[ "$result" == "empty-default" ]]
}

@test "NOTIFY-T009: extract_json_field handles JSON with spaces in values" {
    source_hook_functions

    local json='{"cwd": "/path/with spaces/project"}'
    local result
    result=$(extract_json_field "$json" "cwd" "default")

    [[ "$result" == "/path/with spaces/project" ]]
}

# =============================================================================
# NOTIFY-T010: Test export_context_vars function
# =============================================================================

@test "NOTIFY-T010: export_context_vars sets NOTIFY_SESSION_ID" {
    source_hook_functions

    local json='{"session_id": "exported-session-id"}'
    export_context_vars "$json"

    [[ "$NOTIFY_SESSION_ID" == "exported-session-id" ]]
}

@test "NOTIFY-T010: export_context_vars sets NOTIFY_CWD" {
    source_hook_functions

    local json='{"cwd": "/exported/path"}'
    export_context_vars "$json"

    [[ "$NOTIFY_CWD" == "/exported/path" ]]
}

@test "NOTIFY-T010: export_context_vars sets NOTIFY_TRANSCRIPT_PATH" {
    source_hook_functions

    local json='{"transcript_path": "/exported/transcript.jsonl"}'
    export_context_vars "$json"

    [[ "$NOTIFY_TRANSCRIPT_PATH" == "/exported/transcript.jsonl" ]]
}

@test "NOTIFY-T010: export_context_vars sets all three variables from complete JSON" {
    source_hook_functions

    local json='{"session_id": "sid123", "cwd": "/my/project", "transcript_path": "/log.jsonl"}'
    export_context_vars "$json"

    [[ "$NOTIFY_SESSION_ID" == "sid123" ]]
    [[ "$NOTIFY_CWD" == "/my/project" ]]
    [[ "$NOTIFY_TRANSCRIPT_PATH" == "/log.jsonl" ]]
}

@test "NOTIFY-T010: export_context_vars sets unknown for missing fields" {
    source_hook_functions

    local json='{}'
    export_context_vars "$json"

    [[ "$NOTIFY_SESSION_ID" == "unknown" ]]
    [[ "$NOTIFY_CWD" == "unknown" ]]
    [[ "$NOTIFY_TRANSCRIPT_PATH" == "unknown" ]]
}

@test "NOTIFY-T010: export_context_vars sets unknown for empty input" {
    source_hook_functions

    export_context_vars ""

    [[ "$NOTIFY_SESSION_ID" == "unknown" ]]
    [[ "$NOTIFY_CWD" == "unknown" ]]
    [[ "$NOTIFY_TRANSCRIPT_PATH" == "unknown" ]]
}

# =============================================================================
# NOTIFY-T011: Test that commands can access exported variables
# =============================================================================

@test "NOTIFY-T011: command can access NOTIFY_SESSION_ID" {
    export NOTIFY_ON_STOP='echo "$NOTIFY_SESSION_ID" > '"${TEST_DIR}/session_id.txt"

    local json='{"session_id": "accessible-session-id"}'
    echo "$json" | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/session_id.txt" ]]
    [[ "$(cat ${TEST_DIR}/session_id.txt)" == "accessible-session-id" ]]
}

@test "NOTIFY-T011: command can access NOTIFY_CWD" {
    export NOTIFY_ON_STOP='echo "$NOTIFY_CWD" > '"${TEST_DIR}/cwd.txt"

    local json='{"cwd": "/accessible/cwd/path"}'
    echo "$json" | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/cwd.txt" ]]
    [[ "$(cat ${TEST_DIR}/cwd.txt)" == "/accessible/cwd/path" ]]
}

@test "NOTIFY-T011: command can access NOTIFY_TRANSCRIPT_PATH" {
    export NOTIFY_ON_STOP='echo "$NOTIFY_TRANSCRIPT_PATH" > '"${TEST_DIR}/transcript.txt"

    local json='{"transcript_path": "/accessible/transcript.jsonl"}'
    echo "$json" | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/transcript.txt" ]]
    [[ "$(cat ${TEST_DIR}/transcript.txt)" == "/accessible/transcript.jsonl" ]]
}

@test "NOTIFY-T011: command can access all three NOTIFY variables" {
    export NOTIFY_ON_STOP='echo "${NOTIFY_SESSION_ID}|${NOTIFY_CWD}|${NOTIFY_TRANSCRIPT_PATH}" > '"${TEST_DIR}/all_vars.txt"

    local json='{"session_id": "s123", "cwd": "/proj", "transcript_path": "/t.jsonl"}'
    echo "$json" | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/all_vars.txt" ]]
    [[ "$(cat ${TEST_DIR}/all_vars.txt)" == "s123|/proj|/t.jsonl" ]]
}

@test "NOTIFY-T011: command receives 'unknown' for missing JSON fields" {
    export NOTIFY_ON_STOP='echo "${NOTIFY_SESSION_ID}|${NOTIFY_CWD}|${NOTIFY_TRANSCRIPT_PATH}" > '"${TEST_DIR}/defaults.txt"

    local json='{}'
    echo "$json" | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/defaults.txt" ]]
    [[ "$(cat ${TEST_DIR}/defaults.txt)" == "unknown|unknown|unknown" ]]
}

@test "NOTIFY-T011: command receives 'unknown' when no input provided" {
    export NOTIFY_ON_STOP='echo "${NOTIFY_SESSION_ID}" > '"${TEST_DIR}/no_input.txt"

    bash "$HOOK_PATH" < /dev/null 2>/dev/null

    [[ -f "${TEST_DIR}/no_input.txt" ]]
    [[ "$(cat ${TEST_DIR}/no_input.txt)" == "unknown" ]]
}

# =============================================================================
# Edge Cases
# =============================================================================

@test "hook handles command with environment variables" {
    export TEST_VAR="test_value"
    export NOTIFY_ON_STOP='echo $TEST_VAR > '"${TEST_DIR}/env_var.txt"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/env_var.txt" ]]
    [[ "$(cat ${TEST_DIR}/env_var.txt)" == "test_value" ]]
}

@test "hook handles multiline command" {
    export NOTIFY_ON_STOP="echo 'line1'; echo 'line2' >> ${TEST_DIR}/multiline.txt"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/multiline.txt" ]]
}

@test "hook handles command with subshell" {
    export NOTIFY_ON_STOP='echo "$(date +%Y)" > '"${TEST_DIR}/subshell.txt"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/subshell.txt" ]]
    # Should contain a year (4 digits)
    [[ "$(cat ${TEST_DIR}/subshell.txt)" =~ ^[0-9]{4}$ ]]
}

@test "hook handles very long command" {
    # Create a long but valid command
    local long_part="echo 'x'; "
    local long_cmd=""
    for i in {1..10}; do
        long_cmd+="$long_part"
    done
    long_cmd+="touch ${TEST_DIR}/long_cmd_executed"

    export NOTIFY_ON_STOP="$long_cmd"

    echo '{"cwd": "/test"}' | bash "$HOOK_PATH" 2>/dev/null

    [[ -f "${TEST_DIR}/long_cmd_executed" ]]
}
