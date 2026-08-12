#!/usr/bin/env bats
#
# runtime-refresh.test.sh - BATS Test Suite for the runtime-refresh SessionStart
# hook.
#
# Tests the four guards, the monotonic version-ordering gate, the mandatory
# next-session caveat, and the currently-silent scaffold-failure path.
#
# Run tests with: npx bats packages/core/hooks/runtime-refresh.test.sh
#
# TRD Reference: docs/TRD/runtime-refresh.md RUNTIME-T004, T005, T006
#

# =============================================================================
# Test Setup and Teardown
# =============================================================================

setup() {
    ORIGINAL_DIR="$(pwd)"

    TEST_DIR="$(mktemp -d)"
    export TEST_DIR

    HOOK_PATH="${ORIGINAL_DIR}/packages/core/hooks/runtime-refresh.sh"
    if [[ ! -f "$HOOK_PATH" ]]; then
        HOOK_PATH="${BATS_TEST_DIRNAME}/runtime-refresh.sh"
    fi
    export HOOK_PATH

    # Everything lives under TEST_DIR: a fake $HOME (so the plugin manifests
    # never touch the real ~/.claude/plugins/*.json), a fake plugin install,
    # and a fake target project. Never point at this repo's own .claude/ or
    # packages/ — the hook's own self-repo guard is one of the things under
    # test, and a bug in it must not be able to write into the real repo.
    FAKE_HOME="${TEST_DIR}/home"
    PLUGIN_DIR="${TEST_DIR}/plugin-install"
    TARGET_DIR="${TEST_DIR}/target-project"
    mkdir -p "$FAKE_HOME/.claude/plugins" "$PLUGIN_DIR/scripts" "$TARGET_DIR/.claude"
    export FAKE_HOME PLUGIN_DIR TARGET_DIR

    unset ENSEMBLE_RUNTIME_REFRESH_DISABLE
    unset ENSEMBLE_RUNTIME_REFRESH_DEBUG
}

teardown() {
    cd "$ORIGINAL_DIR" 2>/dev/null || true
    if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
        rm -rf "$TEST_DIR"
    fi
}

# =============================================================================
# Fixture helpers
# =============================================================================

# Write $FAKE_HOME/.claude/plugins/installed_plugins.json with a single
# full@ensemble-vnext entry. install_path must exist on disk (the hook's
# discovery step requires os.path.isdir(installPath)).
_write_installed_plugins() {
    local install_path="$1" version="$2"
    mkdir -p "$(dirname "$install_path")" 2>/dev/null || true
    cat > "$FAKE_HOME/.claude/plugins/installed_plugins.json" <<JSON
{
  "version": 2,
  "plugins": {
    "full@ensemble-vnext": [
      {
        "scope": "user",
        "installPath": "${install_path}",
        "version": "${version}",
        "installedAt": "2026-01-01T00:00:00.000Z",
        "lastUpdated": "2026-01-01T00:00:00.000Z"
      }
    ]
  }
}
JSON
}

# Write $FAKE_HOME/.claude/plugins/known_marketplaces.json with a single
# directory-source marketplace entry pointing at source_path.
_write_marketplace_directory_source() {
    local source_path="$1"
    cat > "$FAKE_HOME/.claude/plugins/known_marketplaces.json" <<JSON
{
  "ensemble-vnext": {
    "source": {
      "source": "directory",
      "path": "${source_path}"
    },
    "installLocation": "${source_path}",
    "lastUpdated": "2026-01-01T00:00:00.000Z"
  }
}
JSON
}

# Write $TARGET_DIR/.claude/settings.json with the given vendored
# ensemble.version. A bare version="" omits the ensemble key entirely
# (simulates a pre-stamp project / unparseable case).
_write_target_settings() {
    local version="$1"
    if [[ -z "$version" ]]; then
        cat > "$TARGET_DIR/.claude/settings.json" <<'JSON'
{
  "hooks": {}
}
JSON
    else
        cat > "$TARGET_DIR/.claude/settings.json" <<JSON
{
  "hooks": {},
  "ensemble": {
    "version": "${version}",
    "agents_dir": ".claude/agents"
  }
}
JSON
    fi
}

# Install a stub scripts/scaffold-project.sh into $PLUGIN_DIR whose behavior
# is controlled by $STUB_SCAFFOLD_MODE:
#   success        - prints a REFRESH_SUMMARY line, touches a marker file,
#                     records its argv for inspection, exits 0.
#   fail_unknown   - simulates a plugin installed from before --refresh
#                     existed: prints "Unknown option: --refresh" to stderr
#                     and exits 1 (packages/core/scripts/scaffold-project.sh's
#                     real -*) branch does exactly this for any flag it
#                     doesn't recognize).
_install_stub_scaffold() {
    local mode="${1:-success}"
    cat > "$PLUGIN_DIR/scripts/scaffold-project.sh" <<STUB
#!/usr/bin/env bash
echo "\$@" > "${TEST_DIR}/stub_scaffold_argv.txt"
touch "${TEST_DIR}/stub_scaffold_invoked"
if [[ "${mode}" == "fail_unknown" ]]; then
    echo "Unknown option: --refresh" >&2
    exit 1
fi
echo "========================================"
echo " Refreshing Ensemble Runtime"
echo "========================================"
echo "REFRESH_SUMMARY commands=1 agents=0 hooks=0 skills=0"
exit 0
STUB
    chmod +x "$PLUGIN_DIR/scripts/scaffold-project.sh"
}

# Recursive content snapshot of a directory: path + hash of every regular
# file, sorted. Used to assert "no writes" across a guard.
_snapshot() {
    local dir="$1"
    find "$dir" -type f -exec shasum {} \; 2>/dev/null | sed "s#${dir}##" | sort
}

# Run the hook with FAKE_HOME as $HOME and TARGET_DIR as the hook's cwd.
# Extra args are forwarded as environment var assignments (e.g. for
# ENSEMBLE_RUNTIME_REFRESH_DEBUG=1).
_run_hook() {
    local json
    json="$(printf '{"cwd": "%s", "session_id": "test-session"}' "$TARGET_DIR")"
    printf '%s' "$json" | HOME="$FAKE_HOME" bash "$HOOK_PATH"
}

_run_hook_debug() {
    local json
    json="$(printf '{"cwd": "%s", "session_id": "test-session"}' "$TARGET_DIR")"
    printf '%s' "$json" | HOME="$FAKE_HOME" ENSEMBLE_RUNTIME_REFRESH_DEBUG=1 bash "$HOOK_PATH"
}

# Extract additionalContext from the hook's JSON stdout without requiring jq
# (python3 is always available in this repo's environment).
_extract_context() {
    python3 -c "
import json, sys
try:
    data = json.loads(sys.argv[1])
    print(data.get('hookSpecificOutput', {}).get('additionalContext', ''))
except Exception:
    print('__PARSE_ERROR__')
" "$1"
}

# =============================================================================
# RUNTIME-T004: suite setup — hook exists, is executable, valid bash, and
# emits parseable JSON on every invocation.
# =============================================================================

@test "T004: runtime-refresh.sh exists and is executable" {
    [ -f "$HOOK_PATH" ]
    [ -x "$HOOK_PATH" ]
}

@test "T004: runtime-refresh.sh is valid bash (bash -n)" {
    run bash -n "$HOOK_PATH"
    [ "$status" -eq 0 ]
}

@test "T004: emits parseable JSON on stdout when plugin absent (guard 1)" {
    # No installed_plugins.json at all under FAKE_HOME.
    _write_target_settings "1.0.0"

    run _run_hook
    [ "$status" -eq 0 ]

    run python3 -m json.tool <<< "$output"
    [ "$status" -eq 0 ]
}

@test "T004: emits parseable JSON on stdout on a successful refresh" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "1.0.0"
    _install_stub_scaffold success

    run _run_hook
    [ "$status" -eq 0 ]

    run python3 -m json.tool <<< "$output"
    [ "$status" -eq 0 ]
}

@test "T004: emits parseable JSON on stdout with malformed stdin" {
    run bash -c "printf 'not valid json' | HOME='$FAKE_HOME' bash '$HOOK_PATH'"
    [ "$status" -eq 0 ]

    run python3 -m json.tool <<< "$output"
    [ "$status" -eq 0 ]
}

@test "T004: emits parseable JSON on stdout with empty stdin" {
    run bash -c "HOME='$FAKE_HOME' bash '$HOOK_PATH' < /dev/null"
    [ "$status" -eq 0 ]

    run python3 -m json.tool <<< "$output"
    [ "$status" -eq 0 ]
}

# =============================================================================
# RUNTIME-T005: all four guards exit 0 and write nothing.
# =============================================================================

# --- Guard 1: plugin absent ---

@test "T005 guard1: plugin absent — silent (empty additionalContext), no writes" {
    # FAKE_HOME/.claude/plugins/ has no installed_plugins.json.
    _write_target_settings "1.0.0"
    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

# --- Guard 2: self-repo (the load-bearing guard) ---
#
# Both sub-cases force the dangerous condition first: vendored version OLDER
# than the plugin version, so guard 4 (version) passes and self-repo is
# genuinely what stops the refresh. Proven via debug output: "guards 1+4
# passed" must appear BEFORE the guard-2 debug line, and no REFRESH_SUMMARY /
# scaffold invocation may follow.

@test "T005 guard2a: self-repo via packages/full/.claude-plugin/plugin.json — version gate passes first, guard 2 stops it" {
    _write_installed_plugins "$PLUGIN_DIR" "9.9.9"
    _write_target_settings "1.0.0"
    _install_stub_scaffold success

    mkdir -p "$TARGET_DIR/packages/full/.claude-plugin"
    echo '{"name": "full"}' > "$TARGET_DIR/packages/full/.claude-plugin/plugin.json"

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    # Proof the version gate (guards 1+4) genuinely passed before guard 2
    # fired — a test where the version gate short-circuits first proves
    # nothing about guard 2 at all. Debug log lines are emitted in
    # execution order, so "guards 1+4 passed" appearing before the guard-2
    # line in the combined stderr+stdout stream proves the ordering, not
    # just that both lines happened to appear somewhere.
    local combined
    combined="$(_run_hook_debug 2>&1 1>/dev/null)"
    [[ "$combined" == *"guards 1+4 passed"* ]]
    [[ "$combined" == *"plugin.json found at ancestor"* ]]
    local pos_gate pos_guard2
    pos_gate="$(printf '%s' "$combined" | grep -n "guards 1+4 passed" | head -1 | cut -d: -f1)"
    pos_guard2="$(printf '%s' "$combined" | grep -n "plugin.json found at ancestor" | head -1 | cut -d: -f1)"
    [ -n "$pos_gate" ]
    [ -n "$pos_guard2" ]
    [ "$pos_gate" -lt "$pos_guard2" ]

    # Silent to the caller (additionalContext empty) and no scaffold call.
    run _run_hook
    [ "$status" -eq 0 ]
    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

@test "T005 guard2b: self-repo via marketplace directory-source path — version gate passes first, guard 2 stops it" {
    _write_installed_plugins "$PLUGIN_DIR" "9.9.9"
    _write_target_settings "1.0.0"
    _install_stub_scaffold success

    # No packages/full marker this time — only the marketplace match.
    _write_marketplace_directory_source "$TARGET_DIR"

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    local combined
    combined="$(_run_hook_debug 2>&1 1>/dev/null)"
    [[ "$combined" == *"guards 1+4 passed"* ]]
    [[ "$combined" == *"matches a directory-source marketplace's source.path"* ]]
    local pos_gate pos_guard2
    pos_gate="$(printf '%s' "$combined" | grep -n "guards 1+4 passed" | head -1 | cut -d: -f1)"
    pos_guard2="$(printf '%s' "$combined" | grep -n "matches a directory-source marketplace's source.path" | head -1 | cut -d: -f1)"
    [ -n "$pos_gate" ]
    [ -n "$pos_guard2" ]
    [ "$pos_gate" -lt "$pos_guard2" ]

    run _run_hook
    [ "$status" -eq 0 ]
    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

# --- Guard 3: in-flight work ---

@test "T005 guard3: in-flight implement.json task — notice emitted, no writes" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "1.0.0"
    _install_stub_scaffold success

    mkdir -p "$TARGET_DIR/.trd-state/some-feature"
    cat > "$TARGET_DIR/.trd-state/some-feature/implement.json" <<'JSON'
{
  "tasks": {
    "AUTH-B003": { "status": "in_progress" }
  }
}
JSON

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [[ "$ctx" == *"AUTH-B003"* ]]
    [[ "$ctx" == *"in_progress"* || "$ctx" == *"in-flight"* || "$ctx" == *"deferred"* ]]

    # Scaffold must not have run.
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

# --- Guard 4: monotonic version (equal and older) ---

@test "T005 guard4: plugin version equal to vendored — no writes" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "2.0.0"
    _install_stub_scaffold success

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

@test "T005 guard4: plugin version older than vendored — no writes" {
    _write_installed_plugins "$PLUGIN_DIR" "1.0.0"
    _write_target_settings "2.0.0"
    _install_stub_scaffold success

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

# =============================================================================
# RUNTIME-T006: monotonic gate specifics.
# =============================================================================

@test "T006: 4.10.0 orders as NEWER than 4.9.0 (semver, not string compare) — refresh proceeds" {
    # A naive string comparison ("4.10.0" < "4.9.0", since '1' < '9'
    # lexically at the second component) would wrongly short-circuit this as
    # "not newer" and skip the refresh entirely. Assert the refresh actually
    # runs, proving real numeric semver comparison is in effect.
    _write_installed_plugins "$PLUGIN_DIR" "4.10.0"
    _write_target_settings "4.9.0"
    _install_stub_scaffold success

    run _run_hook
    [ "$status" -eq 0 ]

    [ -f "${TEST_DIR}/stub_scaffold_invoked" ]
    local argv
    argv="$(cat "${TEST_DIR}/stub_scaffold_argv.txt")"
    [[ "$argv" == *"--refresh"* ]]
    [[ "$argv" == *"$PLUGIN_DIR"* ]]

    local ctx
    ctx="$(_extract_context "$output")"
    [[ "$ctx" == *"4.9.0"* ]]
    [[ "$ctx" == *"4.10.0"* ]]
}

@test "T006: unparseable plugin version — no writes" {
    _write_installed_plugins "$PLUGIN_DIR" "not-a-version"
    _write_target_settings "1.0.0"
    _install_stub_scaffold success

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

@test "T006: unparseable vendored version — no writes" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "also-not-a-version"
    _install_stub_scaffold success

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [ "$ctx" = "" ]
    [ ! -f "${TEST_DIR}/stub_scaffold_invoked" ]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

# =============================================================================
# RUNTIME-B014: mandatory next-session caveat
#
# docs/TRD/runtime-refresh.md §7 recorded empirically that Claude Code loads
# .claude/ BEFORE SessionStart hooks run, so a refreshed command's text is
# not visible until the session after this one. Dropping this line would
# silently apply a change that appears to do nothing.
# =============================================================================

@test "B014: successful refresh's additionalContext contains the next-session caveat" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "1.0.0"
    _install_stub_scaffold success

    run _run_hook
    [ "$status" -eq 0 ]

    local ctx
    ctx="$(_extract_context "$output")"
    [[ "$ctx" == *"NEXT session"* ]]
    [[ "$ctx" == *"already loaded"* ]]
}

# =============================================================================
# Known issue: scaffold-project.sh predating --refresh fails invisibly.
#
# When the installed plugin's scaffold-project.sh does not understand
# --refresh (an install from before this feature shipped), it exits 1 with
# "Unknown option: --refresh" on stderr. The hook's current behavior is:
# exit 0, no writes, no crash (correct — a hook must never block session
# start) — but additionalContext is EMPTY, so the failure is invisible
# outside ENSEMBLE_RUNTIME_REFRESH_DEBUG=1. This test pins that CURRENT
# behavior; it does not assert it is correct. See the reported finding.
# =============================================================================

@test "scaffold --refresh failure (plugin predates the flag) is surfaced to the caller" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "1.0.0"
    _install_stub_scaffold fail_unknown

    local before after
    before="$(_snapshot "$TARGET_DIR")"

    run _run_hook
    [ "$status" -eq 0 ]

    # Scaffold WAS invoked and DID fail...
    [ -f "${TEST_DIR}/stub_scaffold_invoked" ]

    # ...and the failure is now SURFACED to the caller rather than swallowed.
    # Previously additionalContext was empty here, so a project whose installed
    # plugin predates --refresh failed identically every session with the user
    # told nothing — and it never self-heals, because the plugin does not
    # advance on its own. TRD §7's reasoning ("a change that appears to have no
    # effect is worse than a lag the user knows about") applies doubly when the
    # user has a real remedy available.
    local ctx
    ctx="$(_extract_context "$output")"
    [[ "$ctx" == *"refresh unavailable"* ]]
    [[ "$ctx" == *"/rebase-project"* ]]

    after="$(_snapshot "$TARGET_DIR")"
    [ "$before" = "$after" ]
}

@test "KNOWN ISSUE: the same failure IS visible with ENSEMBLE_RUNTIME_REFRESH_DEBUG=1" {
    _write_installed_plugins "$PLUGIN_DIR" "2.0.0"
    _write_target_settings "1.0.0"
    _install_stub_scaffold fail_unknown

    local combined
    combined="$(_run_hook_debug 2>&1 1>/dev/null)"

    [[ "$combined" == *"scaffold-project.sh --refresh exited"* ]]
    [[ "$combined" == *"Unknown option: --refresh"* ]]
}
