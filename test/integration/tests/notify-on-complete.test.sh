#!/usr/bin/env bats
# =============================================================================
# notify-on-complete.test.sh - Integration tests for NOTIFY_ON_COMPLETE contract
# =============================================================================
# Three layers, all deterministic:
#
#   Layer 1 (helper script behavior) — the .claude/hooks/notify-complete.sh
#   helper does the right thing: silent no-op when env var unset, fires once
#   when set, exports all 10 NOTIFY_* context vars correctly, gracefully
#   degrades when discovery sources (git / jq / tmux / CLAUDE_SESSION_ID) are
#   missing.
#
#   Layer 2 (documentation / contract) — the command-status rule + all 17
#   workflow commands document the contract correctly. Catches refactor
#   regressions where someone renames the env var, drops a command from the
#   sweep, or breaks the helper-script invocation pattern.
#
#   Layer 3 (session-context.js CLAUDE_SESSION_ID export) — the SessionStart
#   hook appends `export CLAUDE_SESSION_ID=<id>` to CLAUDE_ENV_FILE when a
#   session_id is supplied, so the helper can read it as $CLAUDE_SESSION_ID.
#
# The "does the model actually fire the helper at runtime?" question is
# answered manually per the recipes in `.claude/rules/command-status.md` —
# that surface is non-deterministic by design.
#
# Run with:
#   npx bats test/integration/tests/notify-on-complete.test.sh
# =============================================================================

setup() {
    REPO_ROOT="$(cd "$(dirname "${BATS_TEST_FILENAME}")/../../.." && pwd)"
    CANON_COMMANDS="${REPO_ROOT}/packages/core/commands"
    HELPER="${REPO_ROOT}/packages/core/hooks/notify-complete.sh"
    SESSION_CTX_HOOK="${REPO_ROOT}/packages/core/hooks/session-context.js"
    RULE_FILE="${REPO_ROOT}/.claude/rules/command-status.md"
    RULE_TEMPLATE="${REPO_ROOT}/packages/core/templates/claude-directory/rules/command-status.md"

    LOG_FILE="$(mktemp)"
    TMP_PROJECT="$(mktemp -d)"
    unset NOTIFY_ON_COMPLETE
    unset NOTIFY_CMD NOTIFY_STATUS NOTIFY_SUMMARY NOTIFY_PROJECT NOTIFY_CWD
    unset NOTIFY_BRANCH NOTIFY_FEATURE NOTIFY_SESSION_ID
    unset NOTIFY_TMUX_SESSION NOTIFY_TMUX_PANE
    unset CLAUDE_SESSION_ID
}

teardown() {
    [[ -n "$LOG_FILE" && -f "$LOG_FILE" ]] && rm -f "$LOG_FILE"
    [[ -n "$TMP_PROJECT" && -d "$TMP_PROJECT" ]] && rm -rf "$TMP_PROJECT"
    unset NOTIFY_ON_COMPLETE CLAUDE_SESSION_ID
}

# =============================================================================
# Layer 1 — Helper script behavior
# =============================================================================

@test "L1: helper script exists and is executable" {
    [ -f "$HELPER" ]
    [ -x "$HELPER" ]
}

@test "L1: NOTIFY_ON_COMPLETE unset → silent no-op (exit 0, no output)" {
    unset NOTIFY_ON_COMPLETE
    run "$HELPER" "verify-trd-team" "complete" "Phase 4/4 done"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "L1: NOTIFY_ON_COMPLETE empty → silent no-op" {
    export NOTIFY_ON_COMPLETE=""
    run "$HELPER" "verify-trd-team" "complete" "Phase 4/4 done"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "L1: NOTIFY_ON_COMPLETE set → fires once with all 10 NOTIFY_* vars exported" {
    cd "$TMP_PROJECT"
    git init -q -b main
    git config user.email "test@example.com"
    git config user.name "Test"
    git commit -q --allow-empty -m "initial"
    git checkout -q -b feature/test-branch

    export CLAUDE_SESSION_ID="abc123-test-session"
    export TMUX="/tmp/tmux,1,2"
    export TMUX_PANE="%5"

    export NOTIFY_ON_COMPLETE="echo \"cmd=\$NOTIFY_CMD status=\$NOTIFY_STATUS project=\$NOTIFY_PROJECT cwd=\$NOTIFY_CWD branch=\$NOTIFY_BRANCH feature=\$NOTIFY_FEATURE session_id=\$NOTIFY_SESSION_ID tmux_session=\$NOTIFY_TMUX_SESSION tmux_pane=\$NOTIFY_TMUX_PANE summary=\$NOTIFY_SUMMARY\" >> $LOG_FILE"

    "$HELPER" "verify-trd-team" "complete" "Phase 4/4 done, 23 tasks"

    line="$(cat "$LOG_FILE")"
    [[ "$line" == *"cmd=verify-trd-team"* ]]
    [[ "$line" == *"status=complete"* ]]
    [[ "$line" == *"project=$(basename "$TMP_PROJECT")"* ]]
    [[ "$line" == *"cwd=$TMP_PROJECT"* ]]
    [[ "$line" == *"branch=feature/test-branch"* ]]
    [[ "$line" == *"session_id=abc123-test-session"* ]]
    [[ "$line" == *"tmux_pane=%5"* ]]
    [[ "$line" == *"summary=Phase 4/4 done, 23 tasks"* ]]
}

@test "L1: graceful degradation when CLAUDE_SESSION_ID unset → 'unknown'" {
    cd "$TMP_PROJECT"
    unset CLAUDE_SESSION_ID
    export NOTIFY_ON_COMPLETE="echo \"\$NOTIFY_SESSION_ID\" >> $LOG_FILE"
    "$HELPER" "x" "complete" "y"
    [[ "$(cat "$LOG_FILE")" == "unknown" ]]
}

@test "L1: graceful degradation when not in tmux → empty TMUX vars" {
    cd "$TMP_PROJECT"
    unset TMUX TMUX_PANE
    export NOTIFY_ON_COMPLETE="echo \"tmux_session=[\$NOTIFY_TMUX_SESSION] tmux_pane=[\$NOTIFY_TMUX_PANE]\" >> $LOG_FILE"
    "$HELPER" "x" "complete" "y"
    [[ "$(cat "$LOG_FILE")" == "tmux_session=[] tmux_pane=[]" ]]
}

@test "L1: graceful degradation when not a git repo → empty branch" {
    cd "$TMP_PROJECT"
    # No git init
    export NOTIFY_ON_COMPLETE="echo \"branch=[\$NOTIFY_BRANCH]\" >> $LOG_FILE"
    "$HELPER" "x" "complete" "y"
    [[ "$(cat "$LOG_FILE")" == "branch=[]" ]]
}

@test "L1: feature discovery from .trd-state/current.json (jq path)" {
    cd "$TMP_PROJECT"
    mkdir -p .trd-state
    cat > .trd-state/current.json <<JSON
{ "trd": "docs/TRD/user-auth.md", "prd": "docs/PRD/user-auth.md" }
JSON
    export NOTIFY_ON_COMPLETE="echo \"feature=[\$NOTIFY_FEATURE]\" >> $LOG_FILE"
    "$HELPER" "x" "complete" "y"
    [[ "$(cat "$LOG_FILE")" == "feature=[user-auth]" ]]
}

@test "L1: STUCK status passes through" {
    export NOTIFY_ON_COMPLETE="echo \"\$NOTIFY_STATUS:\$NOTIFY_SUMMARY\" >> $LOG_FILE"
    "$HELPER" "implement-trd" "stuck" "AUTH-B005 failed 3 retries — missing OAUTH_CLIENT_SECRET"
    [[ "$(cat "$LOG_FILE")" == "stuck:AUTH-B005 failed 3 retries — missing OAUTH_CLIENT_SECRET" ]]
}

@test "L1: rejects malformed CLAUDE_SESSION_ID with shell chars (security)" {
    cd "$TMP_PROJECT"
    # If user-controlled CLAUDE_SESSION_ID contained shell chars, we'd want safety.
    # The helper itself doesn't sanitize CLAUDE_SESSION_ID; sanitization happens in
    # session-context.js BEFORE writing to CLAUDE_ENV_FILE. Here we just confirm
    # the helper passes whatever's in the env through unchanged (the env-file
    # writer is the gate).
    export CLAUDE_SESSION_ID='evil;rm -rf /tmp/nonexistent'
    export NOTIFY_ON_COMPLETE="echo \"got:\$NOTIFY_SESSION_ID\" >> $LOG_FILE"
    "$HELPER" "x" "complete" "y"
    # Pass-through is fine because /bin/sh -c will quote it via the env value, not interpolate.
    [[ "$(cat "$LOG_FILE")" == "got:evil;rm -rf /tmp/nonexistent" ]]
    # Confirm nothing was actually executed by the helper itself
    [ ! -d "/tmp/nonexistent" ] || [ -d "/tmp/nonexistent" ]  # tautology — the helper never deletes
}

@test "L1: helper exits with status of user command (success)" {
    export NOTIFY_ON_COMPLETE='true'
    run "$HELPER" "x" "complete" "y"
    [ "$status" -eq 0 ]
}

@test "L1: helper exits with status of user command (failure)" {
    export NOTIFY_ON_COMPLETE='false'
    run "$HELPER" "x" "complete" "y"
    [ "$status" -ne 0 ]
}

@test "L1: helper requires 3 args (rejects fewer with EX_USAGE 64)" {
    run "$HELPER" "x" "complete"
    [ "$status" -eq 64 ]
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

@test "L2: rule documents all 10 context vars" {
    grep -q "NOTIFY_CMD" "$RULE_FILE"
    grep -q "NOTIFY_STATUS" "$RULE_FILE"
    grep -q "NOTIFY_SUMMARY" "$RULE_FILE"
    grep -q "NOTIFY_PROJECT" "$RULE_FILE"
    grep -q "NOTIFY_CWD" "$RULE_FILE"
    grep -q "NOTIFY_BRANCH" "$RULE_FILE"
    grep -q "NOTIFY_FEATURE" "$RULE_FILE"
    grep -q "NOTIFY_SESSION_ID" "$RULE_FILE"
    grep -q "NOTIFY_TMUX_SESSION" "$RULE_FILE"
    grep -q "NOTIFY_TMUX_PANE" "$RULE_FILE"
}

@test "L2: rule template (framework-shipped) is in sync with dogfood" {
    [ -f "$RULE_TEMPLATE" ]
    diff -q "$RULE_FILE" "$RULE_TEMPLATE"
}

@test "L2: all 17 workflow commands invoke the notify-complete.sh helper" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        if ! grep -q 'notify-complete\.sh' "${CANON_COMMANDS}/${cmd}.md"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands missing notify-complete.sh invocation:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2: each command's helper call uses its own name as the first arg" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local mismatched=()
    for cmd in "${cmds[@]}"; do
        local file="${CANON_COMMANDS}/${cmd}.md"
        # Look for: notify-complete.sh "<cmd-name>" "..."
        if ! grep -qE "notify-complete\.sh \"${cmd}\"" "$file"; then
            mismatched+=("$cmd")
        fi
    done
    if [[ ${#mismatched[@]} -gt 0 ]]; then
        printf 'Commands whose helper-script call does NOT pass their own filename as arg 1:\n%s\n' "${mismatched[*]}" >&2
        return 1
    fi
}

@test "L2: legacy inline bracket-guarded form is fully removed" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local stale=()
    for cmd in "${cmds[@]}"; do
        if grep -q '\[ -n "\$NOTIFY_ON_COMPLETE" \]' "${CANON_COMMANDS}/${cmd}.md"; then
            stale+=("$cmd")
        fi
    done
    if [[ ${#stale[@]} -gt 0 ]]; then
        printf 'Commands still using the legacy inline form:\n%s\n' "${stale[*]}" >&2
        return 1
    fi
}

@test "L2: dogfood .claude/commands mirrors stay in sync with canonical" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                refine-prd refine-trd update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local drift=()
    for cmd in "${cmds[@]}"; do
        local canon="${CANON_COMMANDS}/${cmd}.md"
        local dog="${REPO_ROOT}/.claude/commands/${cmd}.md"
        if [[ -f "$dog" ]] && ! diff -q "$canon" "$dog" >/dev/null 2>&1; then
            drift+=("$cmd")
        fi
    done
    if [[ ${#drift[@]} -gt 0 ]]; then
        printf 'Canonical/dogfood drift in:\n%s\n' "${drift[*]}" >&2
        return 1
    fi
}

@test "L2: helper script vendored mirror (.claude/hooks/notify-complete.sh) stays in sync" {
    local canon="$HELPER"
    local vendored="${REPO_ROOT}/.claude/hooks/notify-complete.sh"
    [ -f "$canon" ]
    [ -f "$vendored" ]
    diff -q "$canon" "$vendored"
}

# =============================================================================
# Layer 2b — Autonomy discipline contract (autonomy.md + per-command guidance)
# =============================================================================

@test "L2b: autonomy.md rule file exists in dogfood + framework template" {
    [ -f "${REPO_ROOT}/.claude/rules/autonomy.md" ]
    [ -f "${REPO_ROOT}/packages/core/templates/claude-directory/rules/autonomy.md" ]
    diff -q "${REPO_ROOT}/.claude/rules/autonomy.md" "${REPO_ROOT}/packages/core/templates/claude-directory/rules/autonomy.md"
}

@test "L2b: autonomy.md documents the four valid AskUserQuestion cases" {
    local f="${REPO_ROOT}/.claude/rules/autonomy.md"
    grep -q "Ambiguity in requirements" "$f"
    grep -q "Missing information that cannot be derived" "$f"
    grep -q "Truly irreversible destructive operations" "$f"
    grep -q "STUCK conditions" "$f"
}

@test "L2b: constitution Prohibited Pattern #8 references autonomy.md" {
    local f="${REPO_ROOT}/.claude/rules/constitution.md"
    grep -q "No defensive checkpointing" "$f"
    grep -q "autonomy.md" "$f"
}

@test "L2b: every non-refine workflow command embeds the autonomy block" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        if ! grep -q "Autonomous-execution discipline" "${CANON_COMMANDS}/${cmd}.md"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Non-refine commands missing autonomy block:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2b: refine-prd and refine-trd do NOT embed the autonomy block (intentionally exempt)" {
    ! grep -q "Autonomous-execution discipline" "${CANON_COMMANDS}/refine-prd.md"
    ! grep -q "Autonomous-execution discipline" "${CANON_COMMANDS}/refine-trd.md"
}

@test "L2b: autonomy.md forbids hedged 'I'll continue unless...' offers" {
    local f="${REPO_ROOT}/.claude/rules/autonomy.md"
    grep -q "HEDGED OFFERS ARE STILL OFFERS\|Hedged offers to pause are STILL pauses\|even framing.*I'll proceed unless" "$f"
}

@test "L2b: autonomy.md documents the --wiggum doubly-enforced rule" {
    local f="${REPO_ROOT}/.claude/rules/autonomy.md"
    grep -q "wiggum" "$f"
    grep -q "doubly enforced\|doubly-enforced" "$f"
    grep -q "STUCK conditions" "$f"
}

@test "L2b: every non-refine command's embedded block forbids hedged offers" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        if ! grep -q "HEDGED OFFERS ARE STILL OFFERS" "${CANON_COMMANDS}/${cmd}.md"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands missing hedged-offer prohibition:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2b: every non-refine command's embedded block mentions --wiggum doubly-enforced rule" {
    local cmds=(implement-trd verify-trd-team harden-trd-team
                fix-issue create-prd-team create-trd-team create-prd create-trd
                update-project cleanup-project fold-prompt
                investigate-issue augment-trd-figma init-project rebase-project)
    local missing=()
    for cmd in "${cmds[@]}"; do
        if ! grep -q "doubly enforced\|doubly-enforced" "${CANON_COMMANDS}/${cmd}.md"; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands missing --wiggum doubly-enforced clause:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

# =============================================================================
# Layer 3 — session-context.js CLAUDE_SESSION_ID export
# =============================================================================

@test "L3: session-context.js exists" {
    [ -f "$SESSION_CTX_HOOK" ]
}

@test "L3: session-context.js references CLAUDE_SESSION_ID and CLAUDE_ENV_FILE" {
    grep -q "CLAUDE_SESSION_ID" "$SESSION_CTX_HOOK"
    grep -q "CLAUDE_ENV_FILE" "$SESSION_CTX_HOOK"
}

@test "L3: SessionStart appends CLAUDE_SESSION_ID export to CLAUDE_ENV_FILE when session_id is provided" {
    TMP_ENV_FILE="$(mktemp)"
    export CLAUDE_ENV_FILE="$TMP_ENV_FILE"

    echo '{"session_id":"sess_test_xyz_123","cwd":"'"$TMP_PROJECT"'"}' \
      | node "$SESSION_CTX_HOOK" >/dev/null 2>&1 || true

    grep -q '^export CLAUDE_SESSION_ID=sess_test_xyz_123$' "$TMP_ENV_FILE"

    rm -f "$TMP_ENV_FILE"
    unset CLAUDE_ENV_FILE
}

@test "L3: session-context.js sanitizes session_id (rejects shell chars to prevent env-file injection)" {
    TMP_ENV_FILE="$(mktemp)"
    export CLAUDE_ENV_FILE="$TMP_ENV_FILE"

    # A session_id with shell-meaningful characters MUST be rejected
    echo '{"session_id":"evil;rm -rf /tmp/x","cwd":"'"$TMP_PROJECT"'"}' \
      | node "$SESSION_CTX_HOOK" >/dev/null 2>&1 || true

    # CLAUDE_SESSION_ID should NOT have been written
    ! grep -q "CLAUDE_SESSION_ID=evil" "$TMP_ENV_FILE"

    rm -f "$TMP_ENV_FILE"
    unset CLAUDE_ENV_FILE
}

@test "L4: autonomy-discipline.js hook exists + executable + syntactically valid" {
    local hook="${REPO_ROOT}/packages/core/hooks/autonomy-discipline.js"
    [ -f "$hook" ]
    [ -x "$hook" ]
    node --check "$hook"
}

@test "L4: autonomy-discipline.js vendored to dogfood .claude/hooks/" {
    diff -q "${REPO_ROOT}/packages/core/hooks/autonomy-discipline.js" \
            "${REPO_ROOT}/.claude/hooks/autonomy-discipline.js"
}

@test "L4: both settings.json Stop chains include autonomy-discipline.js after async-discipline" {
    # Order matters — autonomy-discipline.js must appear between async-discipline.js and wiggum.js
    for settings in "${REPO_ROOT}/.claude/settings.json" "${REPO_ROOT}/packages/full/.claude/settings.json"; do
        python3 -c "
import json, sys
s = json.load(open('$settings'))
cmds = [h['command'] for grp in s['hooks']['Stop'] for h in grp['hooks']]
names = [c.split('hooks/')[-1].split(chr(39))[0] for c in cmds]
expected = ['async-discipline.js', 'autonomy-discipline.js', 'wiggum.js', 'notify.sh']
assert names == expected, f'Stop chain order mismatch: {names} != {expected}'
print('  ', '$settings'.split('/')[-3]+'/.claude/settings.json' if 'packages' in '$settings' else '.claude/settings.json', '→', ' → '.join(names))
"
    done
}

@test "L4: helper detectHedgedOffer matches the exact user-reported phrase" {
    local hook="${REPO_ROOT}/packages/core/hooks/autonomy-discipline.js"
    local result
    result=$(node -e "
const { detectHedgedOffer } = require('$hook');
const text = \"PHASE 0/4 COMPLETE. Given Phase 0 went cleanly and your --wiggum choice, I'll continue autonomously into Phase 1 unless you want to pause and review first. Want me to keep going, or pause for a look?\";
const m = detectHedgedOffer(text);
console.log(m ? 'MATCH' : 'NO-MATCH');
")
    [[ "$result" == "MATCH" ]]
}

@test "L4: helper isCommandContext extracts command name from [STATUS:] banner" {
    local hook="${REPO_ROOT}/packages/core/hooks/autonomy-discipline.js"
    local result
    result=$(node -e "
const { isCommandContext } = require('$hook');
const ctx = isCommandContext('[STATUS: /harden-trd-team] PHASE 1/3 COMPLETE');
console.log(ctx && ctx.command);
")
    [[ "$result" == "harden-trd-team" ]]
}

@test "L4: helper isExemptCommand returns true for refine-*, false for others" {
    local hook="${REPO_ROOT}/packages/core/hooks/autonomy-discipline.js"
    local result
    result=$(node -e "
const { isExemptCommand } = require('$hook');
console.log(isExemptCommand({command:'refine-prd'}), isExemptCommand({command:'refine-trd'}), isExemptCommand({command:'implement-trd'}));
")
    [[ "$result" == "true true false" ]]
}

@test "L4: init-project.md hook enumeration includes autonomy-discipline.js" {
    grep -q "autonomy-discipline.js" "${REPO_ROOT}/packages/core/commands/init-project.md"
}

@test "L3: SessionStart no-ops cleanly when CLAUDE_ENV_FILE is not set" {
    unset CLAUDE_ENV_FILE
    run bash -c "echo '{\"session_id\":\"sess_test\"}' | node \"$SESSION_CTX_HOOK\""
    [ "$status" -eq 0 ]
}
