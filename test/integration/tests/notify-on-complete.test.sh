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
#   Layer 2 (documentation / contract) — the command-status rule + all 16
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

# `! cmd` does NOT fail a bats test unless it is the LAST line of the test: bash
# suppresses errexit for any command prefixed with `!`. Three assertions here were
# therefore dead, including the L3 injection check. `refute` is a plain command, so
# its non-zero exit trips errexit normally. Found 2026-08-21.
refute() {
    if "$@"; then
        echo "refute: expected failure, but this SUCCEEDED: $*" >&2
        return 1
    fi
    return 0
}

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

@test "L2: all 16 workflow commands invoke the notify-complete.sh helper" {
    # DISCOVERED, not hardcoded. This roster listed fix-issue and
    # investigate-issue and broke the moment item 12 deleted them — the same
    # rot that took the mirror-parity test from a hardcoded 14-file list to a
    # sweep. A roster that must be edited by hand is a roster that will be wrong.
    local cmds=()
    while IFS= read -r f; do cmds+=("$(basename "$f" .md)"); done \
        < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 10 ]
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
    # DISCOVERED, not hardcoded. This roster listed fix-issue and
    # investigate-issue and broke the moment item 12 deleted them — the same
    # rot that took the mirror-parity test from a hardcoded 14-file list to a
    # sweep. A roster that must be edited by hand is a roster that will be wrong.
    local cmds=()
    while IFS= read -r f; do cmds+=("$(basename "$f" .md)"); done \
        < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 10 ]
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
    # DISCOVERED, not hardcoded. This roster listed fix-issue and
    # investigate-issue and broke the moment item 12 deleted them — the same
    # rot that took the mirror-parity test from a hardcoded 14-file list to a
    # sweep. A roster that must be edited by hand is a roster that will be wrong.
    local cmds=()
    while IFS= read -r f; do cmds+=("$(basename "$f" .md)"); done \
        < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 10 ]
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
    # DISCOVERED, not hardcoded. This roster listed fix-issue and
    # investigate-issue and broke the moment item 12 deleted them — the same
    # rot that took the mirror-parity test from a hardcoded 14-file list to a
    # sweep. A roster that must be edited by hand is a roster that will be wrong.
    local cmds=()
    while IFS= read -r f; do cmds+=("$(basename "$f" .md)"); done \
        < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 10 ]
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
    # Discovered, minus the two intentionally-interactive refine commands.
    local cmds=()
    while IFS= read -r f; do
        local base; base="$(basename "$f" .md)"
        case "$base" in refine-prd|refine-trd) continue ;; esac
        cmds+=("$base")
    done < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 8 ]
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

@test "L2b: refine-prd and refine-trd exempt INTERACTIVE mode only, not the command" {
    # The blanket exemption became conditional on mode (item 10). These two commands
    # still omit the standard block -- interactive mode is genuinely exempt -- but each
    # must state that non-interactive mode obeys autonomy discipline, or an unattended
    # refine run could stop to ask questions with nothing forbidding it.
    refute grep -q "Autonomous-execution discipline" "${CANON_COMMANDS}/refine-prd.md"
    refute grep -q "Autonomous-execution discipline" "${CANON_COMMANDS}/refine-trd.md"

    for cmd in refine-prd refine-trd; do
        grep -qi "non-interactive" "${CANON_COMMANDS}/${cmd}.md"
        grep -qi "conditional on mode" "${CANON_COMMANDS}/${cmd}.md"
    done
}

@test "L2b: autonomy.md scopes the refine exemption to interactive mode" {
    for f in "${REPO_ROOT}/.claude/rules/autonomy.md" \
             "${REPO_ROOT}/packages/core/templates/claude-directory/rules/autonomy.md"; do
        grep -qi "non-interactive" "$f"
        grep -qi "conditional on mode" "$f"
    done
}

@test "L2b: autonomy.md forbids hedged 'I'll continue unless...' offers" {
    local f="${REPO_ROOT}/.claude/rules/autonomy.md"
    grep -q "HEDGED OFFERS ARE STILL OFFERS\|Hedged offers to pause are STILL pauses\|even framing.*I'll proceed unless" "$f"
}

@test "L2b: autonomy.md narrows the four ask-cases to STUCK, with no flag to enable it" {
    # This test lost its @test header in the 4.1.19 wiggum cleanup, leaving an orphaned
    # body that broke test GATHERING for the whole file — every test here silently
    # stopped running. Restored, and re-pointed at what autonomy.md says now that
    # autonomy is the default rather than something a flag turned on.
    local f="${REPO_ROOT}/.claude/rules/autonomy.md"
    grep -q "Autonomy is the default" "$f"
    grep -q "There is no flag that enables this and none that disables it" "$f"
    grep -qi "narrow, in practice, to the STUCK condition" "$f"
}

@test "L2b: every non-refine command's embedded block forbids hedged offers" {
    # Discovered, minus the two intentionally-interactive refine commands.
    local cmds=()
    while IFS= read -r f; do
        local base; base="$(basename "$f" .md)"
        case "$base" in refine-prd|refine-trd) continue ;; esac
        cmds+=("$base")
    done < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 8 ]
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

@test "L2b: no command still carries the retired autonomous-mode flag block" {
    # This was the --wiggum test. Its @test header was deleted in the 4.1.19 cleanup
    # and the body left behind, which broke test GATHERING for this entire file — so
    # every test in it silently stopped running rather than failing loudly. Rewritten
    # as the useful inverse: autonomy is now unconditional, so no command may still
    # describe a flag that "doubly enforces" it.
    # Discovered, minus the two intentionally-interactive refine commands.
    local cmds=()
    while IFS= read -r f; do
        local base; base="$(basename "$f" .md)"
        case "$base" in refine-prd|refine-trd) continue ;; esac
        cmds+=("$base")
    done < <(find "$CANON_COMMANDS" -maxdepth 1 -name '*.md' | sort)
    [ "${#cmds[@]}" -gt 8 ]
    local stale=()
    for cmd in "${cmds[@]}"; do
        if grep -qi "doubly enforced\|doubly-enforced\|wiggum" "${CANON_COMMANDS}/${cmd}.md"; then
            stale+=("$cmd")
        fi
    done
    if [[ ${#stale[@]} -gt 0 ]]; then
        printf 'Commands still describing the retired autonomous-mode flag:\n%s\n' "${stale[*]}" >&2
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
    refute grep -q "CLAUDE_SESSION_ID=evil" "$TMP_ENV_FILE"

    rm -f "$TMP_ENV_FILE"
    unset CLAUDE_ENV_FILE
}

# The autonomy-discipline guard is a hookType:"prompt" model judgment as of
# DISC-B008, and its regex predecessor packages/core/hooks/autonomy-discipline.js
# was deleted in 4.1.11 (DISC-B009). The tests that asserted on that file —
# exists/executable/`node --check`, the vendored-copy diff, and the three
# helper-function probes (detectHedgedOffer, isCommandContext, isExemptCommand)
# — went with it. What remains testable at this layer is the delivered artifact:
# its position in the Stop chain, and its presence in the hook enumeration.
#
# FIX-002 (docs/TRD/judge-prompt-generative-rule.md) merged async-discipline and
# autonomy-discipline into ONE Stop-hook prompt (discipline-stop.prompt.md,
# manifest identifier discipline-stop.js) carrying two independent judgments —
# following the pattern subagent-discipline already used for its own two
# judgments. The tests below were re-pointed at the merged artifact.

@test "L4: discipline-stop prompt file exists and is non-empty" {
    local prompt="${REPO_ROOT}/packages/core/hooks/prompts/discipline-stop.prompt.md"
    [ -f "$prompt" ]
    [ -s "$prompt" ]
}

@test "L4: both settings.json Stop chains are [discipline-stop.js, notify.sh]" {
    # discipline-stop.js is hookType:"prompt" (DISC-B008, merged FIX-002) — its
    # settings.json entry carries inlined prompt TEXT, not a "command" field to pull
    # a filename out of, so a name is recovered by matching that text against each
    # promptFile's content.
    for settings in "${REPO_ROOT}/.claude/settings.json" "${REPO_ROOT}/packages/full/.claude/settings.json"; do
        python3 -c "
import json, os, sys

prompts_dir = '${REPO_ROOT}/packages/core/hooks/prompts'
manifest = json.load(open('${REPO_ROOT}/packages/core/hooks/hooks.manifest.json'))
prompt_text_to_file = {}
for h in manifest['hooks']:
    if h.get('hookType') != 'prompt':
        continue
    with open(os.path.join(prompts_dir, h['promptFile'])) as fh:
        prompt_text_to_file[fh.read().rstrip(chr(10))] = h['file']

# The Stop chain after --wiggum's removal (4.1.19) and the FIX-002 merge. This
# list was deleted along with --wiggum, leaving `expected` undefined -- a
# NameError that made this test error out rather than compare, which is how
# 35413ce's settings.json drift went unnoticed.
expected = ['discipline-stop.js', 'notify.sh']

s = json.load(open('$settings'))
names = []
for grp in s['hooks']['Stop']:
    for h in grp['hooks']:
        if h.get('type') == 'prompt':
            names.append(prompt_text_to_file.get(h.get('prompt', ''), '<unrecognized prompt>'))
        else:
            names.append(h['command'].split('hooks/')[-1].split(chr(39))[0])
assert names == expected, f'Stop chain order mismatch: {names} != {expected}'
print('  ', '$settings'.split('/')[-3]+'/.claude/settings.json' if 'packages' in '$settings' else '.claude/settings.json', '→', ' → '.join(names))
"
    done
}

@test "L4: init-project.md hook enumeration includes the merged discipline-stop hook" {
    grep -q "discipline-stop" "${REPO_ROOT}/packages/core/commands/init-project.md"
}

@test "L3: SessionStart no-ops cleanly when CLAUDE_ENV_FILE is not set" {
    unset CLAUDE_ENV_FILE
    run bash -c "echo '{\"session_id\":\"sess_test\"}' | node \"$SESSION_CTX_HOOK\""
    [ "$status" -eq 0 ]
}

# =============================================================================
# Layer 2c — Artifact-link contract (command-status.md + per-command pointers)
# =============================================================================
#
# The convention is defined ONCE in command-status.md and referenced from each
# command that produces a document. These tests exist because the alternative —
# restating it per command — is the failure the fix-plan rework was built to
# stop: one rule written in seven places disagrees with itself in six.

ARTIFACT_CMDS=(create-prd refine-prd create-trd refine-trd investigate verify-build implement-trd)

@test "L2c: command-status.md defines the artifact convention (dogfood + template)" {
    for f in "${REPO_ROOT}/.claude/rules/command-status.md" \
             "${REPO_ROOT}/packages/core/templates/claude-directory/rules/command-status.md"; do
        [ -f "$f" ]
        grep -q '^## Artifact links$' "$f"
        grep -q 'ensemble.publishArtifacts' "$f"
        grep -q 'artifacts.json' "$f"
    done
}

@test "L2c: the rule publishes the FILE and forbids authoring a rendering" {
    local f="${REPO_ROOT}/.claude/rules/command-status.md"
    # The whole cost argument rests on this: publishing the .md is one tool call,
    # authoring an HTML rendering costs output tokens proportional to a document
    # that runs to 129 KB here, and produces a second copy that drifts.
    grep -q 'Publish the FILE. Do not render it.' "$f"
    grep -qi 'mermaid' "$f"
}

@test "L2c: the rule requires the link ABOVE the banner and makes failure non-fatal" {
    local f="${REPO_ROOT}/.claude/rules/command-status.md"
    grep -q 'Above the `COMMAND COMPLETE` banner, never after it' "$f"
    grep -q 'Failure is never fatal' "$f"
}

@test "L2c: settings.json ships publishArtifacts in all three copies" {
    for f in "${REPO_ROOT}/packages/core/templates/claude-directory/settings.json" \
             "${REPO_ROOT}/packages/full/.claude/settings.json" \
             "${REPO_ROOT}/.claude/settings.json"; do
        [ -f "$f" ]
        run node -e '
          const d = require(process.argv[1]);
          if (typeof d.ensemble?.publishArtifacts !== "boolean") process.exit(1);
        ' "$f"
        [ "$status" -eq 0 ]
    done
}

@test "L2c: publishArtifacts ships ON by default (owner decision, 2026-08-24)" {
    # A document nobody can click into is a document nobody reads, and the link
    # is most of the reason to produce one. Publishing does send the document to
    # an external service, so the rule states the off switch explicitly rather
    # than leaving it to be discovered.
    for f in "${REPO_ROOT}/packages/core/templates/claude-directory/settings.json" \
             "${REPO_ROOT}/packages/full/.claude/settings.json" \
             "${REPO_ROOT}/.claude/settings.json"; do
        run node -e '
          const d = require(process.argv[1]);
          process.exit(d.ensemble.publishArtifacts === true ? 0 : 1);
        ' "$f"
        [ "$status" -eq 0 ]
    done
}

@test "L2c: the rule documents the off switch and that a refresh cannot reverse it" {
    local f="${REPO_ROOT}/.claude/rules/command-status.md"
    grep -q 'publishArtifacts.*false' "$f"
    grep -q 'no upgrade may quietly reverse it' "$f"
}

@test "L2c: the backfill uses setdefault so an owner false survives refresh" {
    # Assignment here would silently re-enable publishing on every rebase for
    # every owner who turned it off — the exact shape of bug item 13 collects.
    run grep -n 'ensemble.setdefault("publishArtifacts"' \
        "${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    [ "$status" -eq 0 ]
    run grep -c 'ensemble\["publishArtifacts"\] *=' \
        "${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"
    [ "$output" = "0" ]
}

@test "L2c: every document-producing command points at the rule, not a copy of it" {
    local missing=()
    for cmd in "${ARTIFACT_CMDS[@]}"; do
        local f="${CANON_COMMANDS}/${cmd}.md"
        [ -f "$f" ] || { missing+=("$cmd:absent"); continue; }
        grep -q 'ensemble.publishArtifacts' "$f" || missing+=("$cmd:no-settings-key")
        grep -q 'command-status.md' "$f" || missing+=("$cmd:no-rule-ref")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands missing the artifact pointer:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2c: each command reuses a stored URL rather than minting a second link" {
    # A fresh URL per refinement is the staleness bug wearing a fix's clothes:
    # the owner clicks a link from three passes ago and reads a superseded plan
    # that looks current.
    local missing=()
    for cmd in "${ARTIFACT_CMDS[@]}"; do
        local f="${CANON_COMMANDS}/${cmd}.md"
        [ -f "$f" ] || continue
        grep -q 'artifacts.json' "$f" || missing+=("$cmd")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        printf 'Commands that do not reuse a stored artifact URL:\n%s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "L2c: no command instructs authoring an HTML rendering of a document" {
    # The one drift this convention must not take: a command that decides to
    # "render" the TRD instead of publishing it.
    local bad=()
    for cmd in "${ARTIFACT_CMDS[@]}"; do
        local f="${CANON_COMMANDS}/${cmd}.md"
        [ -f "$f" ] || continue
        if grep -qiE 'Artifact\(\{[^}]*\.html' "$f"; then bad+=("$cmd"); fi
    done
    if [[ ${#bad[@]} -gt 0 ]]; then
        printf 'Commands publishing HTML instead of the source document:\n%s\n' "${bad[*]}" >&2
        return 1
    fi
}
