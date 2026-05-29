#!/usr/bin/env bats
# =============================================================================
# notify-on-complete.test.sh - Integration tests for NOTIFY_ON_COMPLETE contract
# =============================================================================
# Purpose: Verify the NOTIFY_ON_COMPLETE programmatic completion notify is wired
# correctly across two layers:
#
#   Layer 1 (deterministic shell pattern) — the bracket-guarded Bash invocation
#   itself does the right thing: silent no-op when unset, fires once when set,
#   exports NOTIFY_CMD / NOTIFY_STATUS / NOTIFY_SUMMARY correctly, behaves the
#   same for "complete" and "stuck" statuses, and formats cleanly into a JSON
#   webhook payload.
#
#   Layer 2 (documentation / contract) — the command-status rule + all 18
#   workflow commands document the contract correctly. Catches refactor
#   regressions where someone renames the env var, drops a command from the
#   sweep, or breaks the guarded-Bash invocation pattern.
#
# Both layers are deterministic — no real Claude invocation, no LLM
# non-determinism. The "does the model actually honor the contract at
# runtime?" question is answered manually per the testing recipes in
# `.claude/rules/command-status.md`.
#
# Run with:
#   npx bats test/integration/tests/notify-on-complete.test.sh
# =============================================================================

setup() {
    REPO_ROOT="$(cd "$(dirname "${BATS_TEST_FILENAME}")/../../.." && pwd)"
    CANON_COMMANDS="${REPO_ROOT}/packages/core/commands"
    RULE_FILE="${REPO_ROOT}/.claude/rules/command-status.md"
    RULE_TEMPLATE="${REPO_ROOT}/packages/core/templates/claude-directory/rules/command-status.md"

    LOG_FILE="$(mktemp)"
    unset NOTIFY_ON_COMPLETE
    unset NOTIFY_CMD NOTIFY_STATUS NOTIFY_SUMMARY
}

teardown() {
    [[ -n "$LOG_FILE" && -f "$LOG_FILE" ]] && rm -f "$LOG_FILE"
    unset NOTIFY_ON_COMPLETE NOTIFY_CMD NOTIFY_STATUS NOTIFY_SUMMARY
}

# Helper: invoke the documented bracket-guarded Bash pattern with given context.
# Mirrors what each command runs on its final turn.
invoke_notify() {
    local cmd="$1"
    local status="$2"
    local summary="$3"
    [ -n "$NOTIFY_ON_COMPLETE" ] && \
      NOTIFY_CMD="$cmd" NOTIFY_STATUS="$status" NOTIFY_SUMMARY="$summary" \
      /bin/sh -c "$NOTIFY_ON_COMPLETE"
    return 0
}

# =============================================================================
# Layer 1 — Deterministic shell pattern
# =============================================================================

@test "L1: NOTIFY_ON_COMPLETE unset → silent no-op (no file written, no errors)" {
    unset NOTIFY_ON_COMPLETE
    run invoke_notify "implement-trd-team" "complete" "Phase 4/4 done"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "L1: NOTIFY_ON_COMPLETE empty → silent no-op" {
    export NOTIFY_ON_COMPLETE=""
    run invoke_notify "implement-trd-team" "complete" "Phase 4/4 done"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "L1: NOTIFY_ON_COMPLETE set → fires once with context vars exported" {
    export NOTIFY_ON_COMPLETE="echo \"\$NOTIFY_CMD|\$NOTIFY_STATUS|\$NOTIFY_SUMMARY\" >> $LOG_FILE"
    invoke_notify "implement-trd-team" "complete" "Phase 4/4 done, 23 tasks"
    [ -f "$LOG_FILE" ]
    line="$(cat "$LOG_FILE")"
    [[ "$line" == "implement-trd-team|complete|Phase 4/4 done, 23 tasks" ]]
}

@test "L1: STUCK status passes through with reason in summary" {
    export NOTIFY_ON_COMPLETE="echo \"\$NOTIFY_CMD|\$NOTIFY_STATUS|\$NOTIFY_SUMMARY\" >> $LOG_FILE"
    invoke_notify "implement-trd" "stuck" "AUTH-B005 failed 3 retries — missing OAUTH_CLIENT_SECRET"
    line="$(cat "$LOG_FILE")"
    [[ "$line" == "implement-trd|stuck|AUTH-B005 failed 3 retries — missing OAUTH_CLIENT_SECRET" ]]
}

@test "L1: webhook-style JSON payload formats cleanly" {
    OUTPUT_FILE="$(mktemp)"
    export NOTIFY_ON_COMPLETE="printf '{\"cmd\":\"%s\",\"status\":\"%s\",\"summary\":\"%s\"}\n' \"\$NOTIFY_CMD\" \"\$NOTIFY_STATUS\" \"\$NOTIFY_SUMMARY\" > $OUTPUT_FILE"
    invoke_notify "create-prd" "complete" "PRD written to docs/PRD/user-auth.md"
    payload="$(cat "$OUTPUT_FILE")"
    rm -f "$OUTPUT_FILE"
    [[ "$payload" == '{"cmd":"create-prd","status":"complete","summary":"PRD written to docs/PRD/user-auth.md"}' ]]
}

@test "L1: invoke_notify is silent on the parent's stdout (exports scoped to /bin/sh -c)" {
    # After invocation returns, the env vars should NOT leak into the parent shell.
    export NOTIFY_ON_COMPLETE="true"
    invoke_notify "x" "complete" "y"
    [ -z "${NOTIFY_CMD:-}" ]
    [ -z "${NOTIFY_STATUS:-}" ]
    [ -z "${NOTIFY_SUMMARY:-}" ]
}

@test "L1: context vars survive special chars in summary (quotes, dashes, slashes)" {
    export NOTIFY_ON_COMPLETE="echo \"\$NOTIFY_SUMMARY\" >> $LOG_FILE"
    invoke_notify "fix-issue" "complete" "Fixed ISSUE-42: paths/with-dashes and 'single-quoted' text"
    line="$(cat "$LOG_FILE")"
    [[ "$line" == "Fixed ISSUE-42: paths/with-dashes and 'single-quoted' text" ]]
}

# =============================================================================
# Layer 2 — Documentation / contract
# =============================================================================

@test "L2: command-status rule file exists at .claude/rules/" {
    [ -f "$RULE_FILE" ]
}

@test "L2: rule file documents NOTIFY_ON_COMPLETE as Path B (programmatic)" {
    grep -q "NOTIFY_ON_COMPLETE" "$RULE_FILE"
    grep -q "Path B" "$RULE_FILE"
    grep -q "programmatic" "$RULE_FILE"
}

@test "L2: rule documents all three context vars" {
    grep -q "NOTIFY_CMD" "$RULE_FILE"
    grep -q "NOTIFY_STATUS" "$RULE_FILE"
    grep -q "NOTIFY_SUMMARY" "$RULE_FILE"
}

@test "L2: rule template (framework-shipped) is in sync with dogfood" {
    [ -f "$RULE_TEMPLATE" ]
    diff -q "$RULE_FILE" "$RULE_TEMPLATE"
}

@test "L2: all 18 workflow commands invoke NOTIFY_ON_COMPLETE" {
    local cmds=(implement-trd implement-trd-team verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        if ! grep -q "NOTIFY_ON_COMPLETE" "${CANON_COMMANDS}/${cmd}.md"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands missing NOTIFY_ON_COMPLETE invocation:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2: every command uses the bracket-guarded invocation form" {
    local cmds=(implement-trd implement-trd-team verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        # The guarded form must be present: [ -n "$NOTIFY_ON_COMPLETE" ] && ...
        if ! grep -q '\[ -n "\$NOTIFY_ON_COMPLETE" \]' "${CANON_COMMANDS}/${cmd}.md"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands without bracket-guarded NOTIFY_ON_COMPLETE invocation:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2: every command exports all three context vars in the invocation" {
    local cmds=(implement-trd implement-trd-team verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        local file="${CANON_COMMANDS}/${cmd}.md"
        if ! grep -q 'NOTIFY_CMD=' "$file" || \
           ! grep -q 'NOTIFY_STATUS=' "$file" || \
           ! grep -q 'NOTIFY_SUMMARY=' "$file"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands missing one of NOTIFY_CMD/STATUS/SUMMARY exports:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2: each command's NOTIFY_CMD value matches its own name (no copy-paste drift)" {
    local cmds=(implement-trd implement-trd-team verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local mismatched=()
    for cmd in "${cmds[@]}"; do
        local file="${CANON_COMMANDS}/${cmd}.md"
        # Look for NOTIFY_CMD="<cmd-name>" with the matching name
        if ! grep -q "NOTIFY_CMD=\"${cmd}\"" "$file"; then
            mismatched+=("$cmd")
        fi
    done
    if [[ ${#mismatched[@]} -gt 0 ]]; then
        printf 'Commands whose NOTIFY_CMD value does NOT match their filename (copy-paste drift):\n%s\n' "${mismatched[*]}" >&2
        return 1
    fi
}

@test "L2: dogfood .claude/commands mirrors stay in sync with canonical" {
    local cmds=(implement-trd implement-trd-team verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local drift=()
    for cmd in "${cmds[@]}"; do
        local canon="${CANON_COMMANDS}/${cmd}.md"
        local dog="${REPO_ROOT}/.claude/commands/${cmd}.md"
        if [[ -f "$dog" ]]; then
            if ! diff -q "$canon" "$dog" >/dev/null 2>&1; then
                drift+=("$cmd")
            fi
        fi
    done
    if [[ ${#drift[@]} -gt 0 ]]; then
        printf 'Canonical/dogfood drift in:\n%s\n' "${drift[*]}" >&2
        return 1
    fi
}
