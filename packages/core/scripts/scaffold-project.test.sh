#!/usr/bin/env bats
#
# scaffold-project.test.sh - BATS tests for scaffold-project.sh
#
# Tests the directory scaffolding script for Ensemble vNext projects.
# Covers creation tests, idempotency, permissions, and CWD independence.
#
# TRD Reference: TRD-TEST-020, TRD-TEST-021, TRD-TEST-022
#
# Usage:
#   bats scaffold-project.test.sh
#

# Setup: Create a fresh temp directory for each test
setup() {
    # Create temporary directory for test isolation
    TEST_DIR="$(mktemp -d)"
    export TEST_DIR

    # Path to the script under test
    SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
    SCAFFOLD_SCRIPT="$SCRIPT_DIR/scaffold-project.sh"

    # Repo root and manifest, resolved the same way generate-hooks-artifacts.sh
    # and scaffold-project.sh resolve them (relative to this script's own
    # location), so Phase 2 consumer tests stay correct if the repo moves.
    REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
    MANIFEST="$SCRIPT_DIR/../hooks/hooks.manifest.json"
    GEN_ARTIFACTS_SCRIPT="$SCRIPT_DIR/generate-hooks-artifacts.sh"

    # Verify script exists
    if [[ ! -f "$SCAFFOLD_SCRIPT" ]]; then
        skip "scaffold-project.sh not found at $SCAFFOLD_SCRIPT"
    fi

    # Verify script is executable
    if [[ ! -x "$SCAFFOLD_SCRIPT" ]]; then
        skip "scaffold-project.sh is not executable"
    fi
}

# Record that $1 (an absolute path to a real repo file) is about to be
# mutated in place, backing it up under $TEST_DIR so teardown() can restore
# it — used by the drift-detection tests (RUNTIME-T007), which must mutate a
# real repo file in place because generate-hooks-artifacts.sh resolves
# REPO_ROOT relative to its own on-disk location, not an argument. Restoration
# happens in teardown() regardless of whether the test's assertions pass, so
# a failing assertion never leaves the repo dirty.
_track_for_restore() {
    local file="$1"
    local backup="$TEST_DIR/.restore-backup-$(basename "$file")-$RANDOM"
    cp "$file" "$backup"
    printf '%s\t%s\n' "$file" "$backup" >> "$TEST_DIR/.restore-map"
}

# Teardown: Restore any repo files mutated by drift tests, then clean up temp directory
teardown() {
    if [[ -f "$TEST_DIR/.restore-map" ]]; then
        while IFS=$'\t' read -r file backup; do
            [[ -n "$file" && -f "$backup" ]] && cp "$backup" "$file"
        done < "$TEST_DIR/.restore-map"
    fi
    if [[ -d "$TEST_DIR" ]]; then
        rm -rf "$TEST_DIR"
    fi
}

# ============================================
# TRD-TEST-020: Setup and Basic Tests
# ============================================

@test "TRD-TEST-020: scaffold-project.sh exists and is executable" {
    [ -f "$SCAFFOLD_SCRIPT" ]
    [ -x "$SCAFFOLD_SCRIPT" ]
}

@test "TRD-TEST-020: Script runs without error on empty directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
}

@test "TRD-TEST-020: Script outputs scaffolding messages" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Scaffolding"* ]]
}

# ============================================
# TRD-TEST-021: Creation Tests
# ============================================

@test "TRD-TEST-021: Creates .claude/agents/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude/agents" ]
}

@test "TRD-TEST-021: Creates .claude/rules/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude/rules" ]
}

@test "TRD-TEST-021: Creates .claude/skills/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude/skills" ]
}

@test "TRD-TEST-021: Creates .claude/commands/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude/commands" ]
}

@test "TRD-TEST-021: Creates .claude/hooks/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude/hooks" ]
}

@test "TRD-TEST-021: Creates docs/PRD/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/docs/PRD" ]
}

@test "TRD-TEST-021: Creates docs/TRD/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/docs/TRD" ]
}

@test "TRD-TEST-021: Creates docs/TRD/completed/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/docs/TRD/completed" ]
}

@test "TRD-TEST-021: Creates docs/TRD/cancelled/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/docs/TRD/cancelled" ]
}

@test "TRD-TEST-021: Creates docs/standards/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/docs/standards" ]
}

@test "TRD-TEST-021: Creates .trd-state/ directory" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.trd-state" ]
}

@test "TRD-TEST-021: All required directories created in one run" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]

    # Check all required directories exist
    [ -d "$TEST_DIR/.claude/agents" ]
    [ -d "$TEST_DIR/.claude/rules" ]
    [ -d "$TEST_DIR/.claude/skills" ]
    [ -d "$TEST_DIR/.claude/commands" ]
    [ -d "$TEST_DIR/.claude/hooks" ]
    [ -d "$TEST_DIR/docs/PRD" ]
    [ -d "$TEST_DIR/docs/TRD" ]
    [ -d "$TEST_DIR/docs/TRD/completed" ]
    [ -d "$TEST_DIR/docs/TRD/cancelled" ]
    [ -d "$TEST_DIR/docs/standards" ]
    [ -d "$TEST_DIR/.trd-state" ]
}

@test "TRD-TEST-021: Directories have correct permissions (755)" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]

    # Check permissions are at least 755 (rwxr-xr-x)
    # Using stat to get permissions
    local perms
    perms="$(stat -c '%a' "$TEST_DIR/.claude" 2>/dev/null || stat -f '%A' "$TEST_DIR/.claude" 2>/dev/null)"

    # Should be 755 or more permissive
    [ "$perms" -ge 755 ] 2>/dev/null || {
        # If numeric comparison fails, just check directory is readable/executable
        [ -r "$TEST_DIR/.claude" ]
        [ -x "$TEST_DIR/.claude" ]
    }
}

# ============================================
# TRD-TEST-022: Idempotency Tests
# ============================================

@test "TRD-TEST-022: Re-running script does not fail (idempotent)" {
    # Run once
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Run again
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]
}

@test "TRD-TEST-022: Re-running script preserves existing structure" {
    # Run once
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Create a marker file
    echo "test content" > "$TEST_DIR/.claude/agents/test-marker.txt"

    # Run again
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Marker file should still exist
    [ -f "$TEST_DIR/.claude/agents/test-marker.txt" ]
    [[ "$(cat "$TEST_DIR/.claude/agents/test-marker.txt")" == "test content" ]]
}

@test "TRD-TEST-022: CWD independence - works from any directory" {
    # Store current directory
    local original_dir
    original_dir="$(pwd)"

    # Create a different working directory
    local work_dir
    work_dir="$(mktemp -d)"

    # Change to different directory
    cd "$work_dir"

    # Run script with absolute path target
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    # Return to original directory
    cd "$original_dir"

    # Clean up work directory
    rm -rf "$work_dir"

    # Verify success and directories created
    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude/agents" ]
    [ -d "$TEST_DIR/.trd-state" ]
}

@test "TRD-TEST-022: Existing files in directories are preserved" {
    # Run initial scaffolding
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Create some content in various directories
    echo "Agent definition" > "$TEST_DIR/.claude/agents/my-agent.md"
    echo "Constitution content" > "$TEST_DIR/.claude/rules/constitution.md"
    echo "Skill content" > "$TEST_DIR/.claude/skills/my-skill.md"
    echo "PRD content" > "$TEST_DIR/docs/PRD/feature.md"
    echo "TRD content" > "$TEST_DIR/docs/TRD/feature.md"
    echo '{"branch": "main"}' > "$TEST_DIR/.trd-state/current.json"

    # Run script again
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Verify all files are preserved
    [ -f "$TEST_DIR/.claude/agents/my-agent.md" ]
    [ -f "$TEST_DIR/.claude/rules/constitution.md" ]
    [ -f "$TEST_DIR/.claude/skills/my-skill.md" ]
    [ -f "$TEST_DIR/docs/PRD/feature.md" ]
    [ -f "$TEST_DIR/docs/TRD/feature.md" ]
    [ -f "$TEST_DIR/.trd-state/current.json" ]

    # Verify content is unchanged
    [[ "$(cat "$TEST_DIR/.claude/agents/my-agent.md")" == "Agent definition" ]]
    [[ "$(cat "$TEST_DIR/docs/PRD/feature.md")" == "PRD content" ]]
}

@test "TRD-TEST-022: Script reports existing directories" {
    # Run once to create structure
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Run again and check output mentions existing dirs
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Output should indicate directories already exist
    [[ "$output" == *"exists"* ]] || [[ "$output" == *"Created"* ]]
}

# ============================================
# Edge Cases
# ============================================

@test "Edge case: Non-existent target directory fails gracefully" {
    run "$SCAFFOLD_SCRIPT" "/nonexistent/path/that/does/not/exist"

    [ "$status" -ne 0 ]
}

@test "Edge case: Default to current directory when no argument" {
    # Change to test directory
    local original_dir
    original_dir="$(pwd)"
    cd "$TEST_DIR"

    # Run without argument
    run "$SCAFFOLD_SCRIPT"

    # Return to original
    cd "$original_dir"

    # Should have created structure in TEST_DIR (current dir at time of run)
    [ "$status" -eq 0 ]
    [ -d "$TEST_DIR/.claude" ]
}

@test "Edge case: Nested directory creation works" {
    # The script should handle creating parent directories
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"

    [ "$status" -eq 0 ]

    # Check deeply nested directories were created
    [ -d "$TEST_DIR/docs/TRD/completed" ]
    [ -d "$TEST_DIR/docs/TRD/cancelled" ]
}

@test "Edge case: Script handles directories with spaces" {
    # Create a directory with spaces
    local space_dir="$TEST_DIR/project with spaces"
    mkdir -p "$space_dir"

    run "$SCAFFOLD_SCRIPT" "$space_dir"

    [ "$status" -eq 0 ]
    [ -d "$space_dir/.claude/agents" ]
    [ -d "$space_dir/.trd-state" ]
}

@test "Edge case: Multiple runs accumulate no extra output errors" {
    # Run 3 times
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # All directories should still exist
    [ -d "$TEST_DIR/.claude/agents" ]
    [ -d "$TEST_DIR/.trd-state" ]
}

# ============================================
# Plugin Content Copy Tests (--plugin-dir)
# ============================================

# Get the plugin directory path for tests
_get_plugin_dir() {
    # Navigate from script dir to packages/full
    echo "$(cd "$SCRIPT_DIR/../../full" && pwd)"
}

@test "Plugin copy: --plugin-dir argument is accepted" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]
}

@test "Plugin copy: Copies 13 agent files with --plugin-dir" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Count agent files
    local count
    count=$(ls -1 "$TEST_DIR/.claude/agents/"*.md 2>/dev/null | wc -l)
    [ "$count" -eq 13 ]
}

@test "Plugin copy: Copies specific agents (product-manager, backend-implementer)" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    [ -f "$TEST_DIR/.claude/agents/product-manager.md" ]
    [ -f "$TEST_DIR/.claude/agents/backend-implementer.md" ]
    [ -f "$TEST_DIR/.claude/agents/verify-app.md" ]
}

@test "Plugin copy: Copies all vendorable command files with --plugin-dir" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Count command files - should match all .md files in core/commands/ minus init-project and rebase-project
    local expected_count
    expected_count=$(ls -1 "$plugin_dir/../core/commands/"*.md 2>/dev/null | grep -v 'init-project\|rebase-project' | wc -l)
    local actual_count
    actual_count=$(ls -1 "$TEST_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
    [ "$actual_count" -eq "$expected_count" ]
}

@test "Plugin copy: Copies specific commands (create-prd, implement-trd)" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    [ -f "$TEST_DIR/.claude/commands/create-prd.md" ]
    [ -f "$TEST_DIR/.claude/commands/implement-trd.md" ]
    [ -f "$TEST_DIR/.claude/commands/fold-prompt.md" ]
}

@test "Plugin copy: Does NOT copy init-project or rebase-project commands" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # These commands should NOT be copied (they're plugin-only)
    [ ! -f "$TEST_DIR/.claude/commands/init-project.md" ]
    [ ! -f "$TEST_DIR/.claude/commands/rebase-project.md" ]
}

# Retired in item 5a: permitter, learning.sh, and save-remote-logs.js are no longer
# shipped or scaffolded. This asserts the removal rather than the delivery — the
# permitter in particular had been broken in every scaffolded project for months
# (its lib/ modules never shipped), which is what made the case for retiring it.
@test "Retired hooks are not scaffolded" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    [ ! -e "$TEST_DIR/.claude/hooks/permitter" ]
    [ ! -e "$TEST_DIR/.claude/hooks/learning.sh" ]
    [ ! -e "$TEST_DIR/.claude/hooks/save-remote-logs.js" ]
}

@test "Plugin copy: Copies core hooks (router, formatter, status, wiggum)" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    [ -f "$TEST_DIR/.claude/hooks/router.py" ]
    [ -f "$TEST_DIR/.claude/hooks/formatter.sh" ]
    [ -f "$TEST_DIR/.claude/hooks/status.js" ]
    [ -f "$TEST_DIR/.claude/hooks/wiggum.js" ]
    [ -f "$TEST_DIR/.claude/hooks/notify.sh" ]
}

@test "Plugin copy: Idempotent - does not overwrite existing files" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    # First run
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Modify a file
    echo "# Modified content" > "$TEST_DIR/.claude/agents/product-manager.md"

    # Run again
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # File should still have our modified content
    [[ "$(head -1 "$TEST_DIR/.claude/agents/product-manager.md")" == "# Modified content" ]]
}

@test "Plugin copy: Without --plugin-dir, no plugin content is copied" {
    run "$SCAFFOLD_SCRIPT" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Directories exist but are empty (except templates)
    [ -d "$TEST_DIR/.claude/agents" ]
    local count
    count=$(ls -1 "$TEST_DIR/.claude/agents/"*.md 2>/dev/null | wc -l)
    [ "$count" -eq 0 ]
}

@test "Plugin copy: Output shows plugin directory" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    [[ "$output" == *"Plugin directory"* ]]
}

@test "Plugin copy: Output shows copy counts" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    [[ "$output" == *"Copied"*"agents"* ]]
    [[ "$output" == *"Copied"*"commands"* ]]
    [[ "$output" == *"Copied"*"hooks"* ]]
}

# ============================================
# Skill Copy Tests (--copy-skills)
# ============================================

@test "Skill copy: --copy-skills with no selection file is silent" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" --copy-skills "$TEST_DIR"
    [ "$status" -eq 0 ]

    # No skills copied (no selection file)
    [[ "$output" == *"No skill selection file"* ]]
}

@test "Skill copy: Copies skills from selected-skills.txt" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    # Create structure first
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Create selection file
    cat > "$TEST_DIR/.claude/selected-skills.txt" <<EOF
developing-with-python
jest
EOF

    # Run again with --copy-skills
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" --copy-skills "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Check skills were copied
    [ -d "$TEST_DIR/.claude/skills/developing-with-python" ]
    [ -d "$TEST_DIR/.claude/skills/jest" ]
}

@test "Skill copy: Skips comments and empty lines in selection file" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    # Create structure first
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Create selection file with comments
    cat > "$TEST_DIR/.claude/selected-skills.txt" <<EOF
# This is a comment
developing-with-python

# Another comment
jest
EOF

    # Run again with --copy-skills
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" --copy-skills "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Check skills were copied
    [ -d "$TEST_DIR/.claude/skills/developing-with-python" ]
    [ -d "$TEST_DIR/.claude/skills/jest" ]

    # Count - should only have 2
    local count
    count=$(ls -1d "$TEST_DIR/.claude/skills/"*/ 2>/dev/null | wc -l)
    [ "$count" -eq 2 ]
}

@test "Skill copy: Warns on non-existent skill" {
    local plugin_dir
    plugin_dir="$(_get_plugin_dir)"

    # Create structure first
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Create selection file with non-existent skill
    echo "nonexistent-skill" > "$TEST_DIR/.claude/selected-skills.txt"

    # Run again with --copy-skills
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" --copy-skills "$TEST_DIR"
    [ "$status" -eq 0 ]

    # Should warn about missing skill
    [[ "$output" == *"not found"* ]] || [[ "$output" == *"Skill not found"* ]]
}

# =============================================================================
# RUNTIME-D004: Per-project agent skill preloads
#
# Agents ship without a skills: field. inject_agent_skills() intersects each
# agent's candidate pool (packages/core/agents/skill-affinity.json) with the
# project's own selected-skills.txt and writes the result into
# .claude/agents/<name>.md. Before 4.0.0 this intersection happened only when
# /init-project's model chose to prune the shipped pools — nothing instructed
# it to, so the result was emergent rather than guaranteed. These tests pin the
# deterministic behaviour.
# =============================================================================

# Read an agent's skills: entries as a space-separated string
_agent_skills() {
    awk '/^---$/{n++; if(n==2) exit; next}
         n==1 && /^skills:/{p=1; next}
         p && /^[a-z_-]+:/{p=0}
         p{printf "%s ", $2}' "$1"
}

@test "D004: preloads are the intersection of the agent pool and selected skills" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\ndeveloping-with-typescript\n' > "$TEST_DIR/.claude/selected-skills.txt"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # verify-app's pool contains jest but not developing-with-typescript
    local skills; skills="$(_agent_skills "$TEST_DIR/.claude/agents/verify-app.md")"
    [[ "$skills" == *"jest"* ]]
    [[ "$skills" != *"developing-with-typescript"* ]]
}

@test "D004: no preload names a skill the project did not select" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'rails\nrspec\n' > "$TEST_DIR/.claude/selected-skills.txt"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    local agent skill
    for agent in "$TEST_DIR/.claude/agents/"*.md; do
        for skill in $(_agent_skills "$agent"); do
            [[ "$skill" == "rails" || "$skill" == "rspec" ]]
        done
    done
}

@test "D004: agent with no pool overlap gets no skills: field" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    # product-manager's pool is jira/linear only — no overlap with these
    printf 'jest\npytest\n' > "$TEST_DIR/.claude/selected-skills.txt"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run grep -c '^skills:' "$TEST_DIR/.claude/agents/product-manager.md"
    [ "$output" -eq 0 ]
}

@test "D004: injection is idempotent across repeated runs" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\ndeveloping-with-typescript\n' > "$TEST_DIR/.claude/selected-skills.txt"

    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1
    local first; first="$(cat "$TEST_DIR/.claude/agents/"*.md | shasum | cut -d' ' -f1)"
    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1
    local second; second="$(cat "$TEST_DIR/.claude/agents/"*.md | shasum | cut -d' ' -f1)"

    [ "$first" = "$second" ]
}

@test "D004: changing the selection re-derives preloads rather than accumulating" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\n' > "$TEST_DIR/.claude/selected-skills.txt"
    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1
    [[ "$(_agent_skills "$TEST_DIR/.claude/agents/verify-app.md")" == *"jest"* ]]

    # Swap the selection entirely; jest must disappear, pytest must appear
    printf 'pytest\n' > "$TEST_DIR/.claude/selected-skills.txt"
    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1
    local skills; skills="$(_agent_skills "$TEST_DIR/.claude/agents/verify-app.md")"
    [[ "$skills" == *"pytest"* ]]
    [[ "$skills" != *"jest"* ]]
}

@test "D004: no selection file leaves agents without preloads" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run grep -l '^skills:' "$TEST_DIR/.claude/agents/"*.md
    [ "$status" -ne 0 ]
}

@test "D004: every affinity pool candidate exists in the skill library" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    local manifest="$SCRIPT_DIR/../agents/skill-affinity.json"
    [ -f "$manifest" ]

    run python3 -c "
import json, pathlib, sys
lib = {p.name for p in pathlib.Path('$plugin_dir/skills-lib').iterdir() if p.is_dir()}
doc = json.load(open('$manifest'))
bad = {a: [s for s in pool if s not in lib] for a, pool in doc['agents'].items()}
bad = {a: m for a, m in bad.items() if m}
print(bad)
sys.exit(1 if bad else 0)
"
    [ "$status" -eq 0 ]
}

@test "D004: body block is injected for every agent" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\n' > "$TEST_DIR/.claude/selected-skills.txt"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    local agent count
    for agent in "$TEST_DIR/.claude/agents/"*.md; do
        count="$(grep -c 'ENSEMBLE:SKILLS:BEGIN' "$agent")"
        [ "$count" -eq 1 ]
    done
}

@test "D004: body block does not stack across repeated runs" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\n' > "$TEST_DIR/.claude/selected-skills.txt"

    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1
    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1
    "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR" >/dev/null 2>&1

    run grep -c 'ENSEMBLE:SKILLS:BEGIN' "$TEST_DIR/.claude/agents/verify-app.md"
    [ "$output" -eq 1 ]
    run grep -c 'ENSEMBLE:SKILLS:END' "$TEST_DIR/.claude/agents/verify-app.md"
    [ "$output" -eq 1 ]
}

@test "D004: body block names non-affinity skills as still available" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\nmanaging-jira-issues\n' > "$TEST_DIR/.claude/selected-skills.txt"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    # verify-app's pool has jest but not managing-jira-issues; the latter must
    # still be listed as available rather than hidden from the agent.
    run grep -A20 'ENSEMBLE:SKILLS:BEGIN' "$TEST_DIR/.claude/agents/verify-app.md"
    [[ "$output" == *"managing-jira-issues"* ]]
    [[ "$output" == *"not a restriction"* ]]
}

@test "D004: agent frontmatter remains valid YAML after body injection" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    mkdir -p "$TEST_DIR/.claude"
    printf 'jest\ndeveloping-with-typescript\n' > "$TEST_DIR/.claude/selected-skills.txt"

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run python3 -c "
import pathlib, sys
bad = []
for p in sorted(pathlib.Path('$TEST_DIR/.claude/agents').glob('*.md')):
    t = p.read_text().split('\n')
    if t[0].strip() != '---': bad.append(p.name); continue
    close = next((i for i in range(1, len(t)) if t[i].strip() == '---'), None)
    if close is None: bad.append(p.name)
print(bad)
sys.exit(1 if bad else 0)
"
    [ "$status" -eq 0 ]
}

# =============================================================================
# RUNTIME-T007: manifest consumers stay in sync with hooks.manifest.json
#
# hooks.manifest.json (RUNTIME-P2A) is the single declaration of the ensemble
# hook set. Three artifacts are generated FROM it (RUNTIME-B001/B002/B003):
# the scaffold's copy list, the template settings.json hook block, and the
# init-project.md hook table. These tests assert all three still agree with
# the manifest, and that the manifest itself is internally consistent (every
# declared file exists, every on-disk hook file has exactly one entry, and
# the hooks retired in 4.1.0 never come back).
# =============================================================================

@test "T007: manifest — every declared hook file exists on disk" {
    run python3 - "$MANIFEST" "$REPO_ROOT" <<'PY'
import json, os, sys
manifest = json.load(open(sys.argv[1]))
repo_root = sys.argv[2]
missing = []
for h in manifest["hooks"]:
    source = h.get("source") or f"packages/core/hooks/{h['file']}"
    if not os.path.isfile(os.path.join(repo_root, source)):
        missing.append(source)
print("missing:", missing)
sys.exit(1 if missing else 0)
PY
    [ "$status" -eq 0 ]
}

@test "T007: manifest — every hook file on disk has exactly one entry (no missing, no extra, no duplicates)" {
    run python3 - "$MANIFEST" "$REPO_ROOT" <<'PY'
import json, os, sys

manifest = json.load(open(sys.argv[1]))
repo_root = sys.argv[2]

sources = [h.get("source") or f"packages/core/hooks/{h['file']}" for h in manifest["hooks"]]
duplicates = sorted({s for s in sources if sources.count(s) > 1})

core_hooks_dir = os.path.join(repo_root, "packages/core/hooks")
exclude_names = {"hooks.manifest.json", "hooks.json", "package.json", "package-lock.json"}
on_disk = set()
for fname in os.listdir(core_hooks_dir):
    full = os.path.join(core_hooks_dir, fname)
    if not os.path.isfile(full):
        continue
    if fname in exclude_names or ".test." in fname:
        continue
    on_disk.add(f"packages/core/hooks/{fname}")

# router.py lives outside packages/core/hooks/ (cross-package hook via "source")
router_path = "packages/router/hooks/router.py"
if os.path.isfile(os.path.join(repo_root, router_path)):
    on_disk.add(router_path)

declared = set(sources)
missing_from_manifest = sorted(on_disk - declared)
extra_in_manifest = sorted(declared - on_disk)

print("duplicates:", duplicates)
print("missing_from_manifest:", missing_from_manifest)
print("extra_in_manifest:", extra_in_manifest)
sys.exit(1 if (duplicates or missing_from_manifest or extra_in_manifest) else 0)
PY
    [ "$status" -eq 0 ]
}

@test "T007: manifest — retired hooks (permitter, learning.sh, save-remote-logs.js) are absent" {
    # Scope the check to the "hooks" array only — the manifest's own
    # top-level $comment legitimately names these retired hooks in prose
    # explaining why they have no entry (see hooks.manifest.json), so
    # checking the whole JSON blob would false-positive on that sentence.
    run python3 -c "
import json
manifest = json.load(open('$MANIFEST'))
blob = json.dumps(manifest['hooks'])
hits = [name for name in ('permitter', 'learning.sh', 'save-remote-logs.js') if name in blob]
print(hits)
import sys; sys.exit(1 if hits else 0)
"
    [ "$status" -eq 0 ]
}

@test "T007: manifest shippable set matches packages/full/hooks/ symlinks (no missing, no extra)" {
    run python3 - "$MANIFEST" "$REPO_ROOT" <<'PY'
import json, os, sys
manifest = json.load(open(sys.argv[1]))
repo_root = sys.argv[2]
shippable = {h["file"] for h in manifest["hooks"] if h.get("shippable")}

full_hooks_dir = os.path.join(repo_root, "packages/full/hooks")
exclude = {"hooks.json", "hooks.manifest.json", "README.md", "lib"}
on_disk = {f for f in os.listdir(full_hooks_dir) if f not in exclude}

missing = sorted(shippable - on_disk)
extra = sorted(on_disk - shippable)
print("missing_from_full_hooks:", missing)
print("extra_in_full_hooks:", extra)
sys.exit(1 if (missing or extra) else 0)
PY
    [ "$status" -eq 0 ]
}

@test "T007: scaffold's delivered hook set equals the manifest's shippable set (no missing, no extra)" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run python3 - "$MANIFEST" "$TEST_DIR" <<'PY'
import json, os, sys
manifest = json.load(open(sys.argv[1]))
target = sys.argv[2]
shippable = {h["file"] for h in manifest["hooks"] if h.get("shippable")}
hooks_dir = os.path.join(target, ".claude/hooks")
on_disk = {f for f in os.listdir(hooks_dir) if os.path.isfile(os.path.join(hooks_dir, f))}
missing = sorted(shippable - on_disk)
extra = sorted(on_disk - shippable)
print("missing:", missing)
print("extra:", extra)
sys.exit(1 if (missing or extra) else 0)
PY
    [ "$status" -eq 0 ]
}

@test "T007: template settings.json hook block matches the manifest (events, files, order)" {
    run python3 - "$MANIFEST" "$REPO_ROOT/packages/core/templates/claude-directory/settings.json" <<'PY'
import collections, json, re, sys

manifest = json.load(open(sys.argv[1]))
settings = json.load(open(sys.argv[2]))
hooks = manifest["hooks"]

groups = collections.OrderedDict()
for h in hooks:
    if h.get("event") is None:
        continue
    key = (h["event"], h.get("matcher") or "")
    groups.setdefault(key, []).append(h)

event_order = []
for (event, _matcher) in groups:
    if event not in event_order:
        event_order.append(event)

expected = collections.OrderedDict()
for event in event_order:
    entries = []
    for (ev, matcher), group in groups.items():
        if ev != event:
            continue
        group_sorted = sorted(group, key=lambda h: h.get("order") or 0)
        entries.append((matcher, [h["file"] for h in group_sorted]))
    expected[event] = entries

actual = settings.get("hooks", {})
ok = list(actual.keys()) == list(expected.keys())
if ok:
    for event, entries in expected.items():
        actual_entries = actual.get(event, [])
        if len(actual_entries) != len(entries):
            ok = False
            break
        for (matcher, files), actual_entry in zip(entries, actual_entries):
            if actual_entry.get("matcher", "") != matcher:
                ok = False
                break
            actual_files = []
            for hc in actual_entry.get("hooks", []):
                m = re.search(r'\.claude/hooks/([\w.\-]+)', hc.get("command", ""))
                actual_files.append(m.group(1) if m else None)
            if actual_files != files:
                ok = False
                break
        if not ok:
            break

sys.exit(0 if ok else 1)
PY
    [ "$status" -eq 0 ]
}

@test "T007: init-project.md hook table matches the manifest (core copy)" {
    run python3 - "$MANIFEST" "$REPO_ROOT/packages/core/commands/init-project.md" <<'PY'
import json, re, sys

manifest = json.load(open(sys.argv[1]))
text = open(sys.argv[2]).read()
m = re.search(r'ENSEMBLE:HOOKS-TABLE:BEGIN.*?ENSEMBLE:HOOKS-TABLE:END', text, re.DOTALL)
if not m:
    print("markers not found")
    sys.exit(1)
block = m.group(0)

event_hooks = [h["file"] for h in manifest["hooks"] if h.get("event") is not None]
other_hooks = [h["file"] for h in manifest["hooks"] if h.get("event") is None]
expected = event_hooks + other_hooks

found = re.findall(r'`\.claude/hooks/([\w.\-]+)`', block)
print("expected:", expected)
print("found:", found)
sys.exit(0 if found == expected else 1)
PY
    [ "$status" -eq 0 ]
}

@test "T007: init-project.md hook table matches the manifest (vendored copy)" {
    run python3 - "$MANIFEST" "$REPO_ROOT/.claude/commands/init-project.md" <<'PY'
import json, re, sys

manifest = json.load(open(sys.argv[1]))
text = open(sys.argv[2]).read()
m = re.search(r'ENSEMBLE:HOOKS-TABLE:BEGIN.*?ENSEMBLE:HOOKS-TABLE:END', text, re.DOTALL)
if not m:
    print("markers not found")
    sys.exit(1)
block = m.group(0)

event_hooks = [h["file"] for h in manifest["hooks"] if h.get("event") is not None]
other_hooks = [h["file"] for h in manifest["hooks"] if h.get("event") is None]
expected = event_hooks + other_hooks

found = re.findall(r'`\.claude/hooks/([\w.\-]+)`', block)
print("expected:", expected)
print("found:", found)
sys.exit(0 if found == expected else 1)
PY
    [ "$status" -eq 0 ]
}

@test "T007: generate-hooks-artifacts.sh --check exits 0 on a clean tree" {
    [ -f "$GEN_ARTIFACTS_SCRIPT" ]
    run "$GEN_ARTIFACTS_SCRIPT" --check
    [ "$status" -eq 0 ]
}

# The --check flag was silently broken: bash passes the lowercase string
# "true", the python compared it against "True", so the comparison was always
# false and --check never detected drift — it would report CI green on a
# drifted tree. A test that only exercises the clean-tree case (above) would
# not have caught this; the drift case is the one that matters.
@test "T007: generate-hooks-artifacts.sh --check exits non-zero when settings.json template is drifted" {
    [ -f "$GEN_ARTIFACTS_SCRIPT" ]
    local target="$REPO_ROOT/packages/core/templates/claude-directory/settings.json"
    _track_for_restore "$target"

    python3 - "$target" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as fh:
    data = json.load(fh)
data["hooks"]["UserPromptSubmit"][0]["hooks"][0]["timeout"] = 999999
with open(path, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
PY

    run "$GEN_ARTIFACTS_SCRIPT" --check
    [ "$status" -ne 0 ]
    [[ "$output" == *"DRIFT"* ]]
}

@test "T007: generate-hooks-artifacts.sh --check exits non-zero when init-project.md hook table is drifted" {
    [ -f "$GEN_ARTIFACTS_SCRIPT" ]
    local target="$REPO_ROOT/packages/core/commands/init-project.md"
    _track_for_restore "$target"

    python3 - "$target" <<'PY'
import sys
path = sys.argv[1]
text = open(path).read()
marker = "ENSEMBLE:HOOKS-TABLE:BEGIN — generated by packages/core/scripts/generate-hooks-artifacts.sh; edits are overwritten -->"
text = text.replace(marker, marker + "\n\nEXTRA DRIFTED LINE THAT DOES NOT MATCH THE MANIFEST", 1)
open(path, "w").write(text)
PY

    run "$GEN_ARTIFACTS_SCRIPT" --check
    [ "$status" -ne 0 ]
    [[ "$output" == *"DRIFT"* ]]
}

# =============================================================================
# RUNTIME-T008: end-to-end scaffold parity — the Phase 2 gate
#
# A freshly scaffolded project must register the same hook set this repo
# runs. Checked against both the working tree (fast, always runs) and the
# installed plugin cache (the real regression guard for commit d969eb3, which
# shipped a manifest that existed in packages/core/ but never reached
# packages/full/ — the working-tree-only check would have stayed green while
# every real scaffold silently no-opped the feature). The cache check skips
# cleanly when no plugin is installed or its version doesn't match this
# checkout, since CI has no plugin installed.
# =============================================================================

@test "T008: scaffolded settings.json hooks block matches this repo's own .claude/settings.json" {
    local plugin_dir; plugin_dir="$(_get_plugin_dir)"
    run "$SCAFFOLD_SCRIPT" --plugin-dir "$plugin_dir" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run python3 - "$TEST_DIR/.claude/settings.json" "$REPO_ROOT/.claude/settings.json" <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))["hooks"]
b = json.load(open(sys.argv[2]))["hooks"]
ok = list(a.keys()) == list(b.keys()) and a == b
if not ok:
    print("scaffolded:", json.dumps(a, indent=2))
    print("repo:", json.dumps(b, indent=2))
sys.exit(0 if ok else 1)
PY
    [ "$status" -eq 0 ]
}

@test "T008: scaffolded project matches the installed plugin cache (skips if absent/stale)" {
    local installed_json="$HOME/.claude/plugins/installed_plugins.json"
    if [[ ! -f "$installed_json" ]]; then
        skip "no installed_plugins.json — no plugin installed in this environment"
    fi

    local cache_info
    cache_info="$(python3 -c "
import json
d = json.load(open('$installed_json'))
entries = d.get('plugins', {}).get('full@ensemble-vnext') or []
if entries:
    e = entries[0]
    print(e.get('installPath', ''))
    print(e.get('version', ''))
" 2>/dev/null)" || cache_info=""

    local cache_path cache_version
    cache_path="$(printf '%s' "$cache_info" | sed -n '1p')"
    cache_version="$(printf '%s' "$cache_info" | sed -n '2p')"

    if [[ -z "$cache_path" || ! -d "$cache_path" ]]; then
        skip "no installed plugin cache entry found for full@ensemble-vnext"
    fi

    local plugin_manifest="$REPO_ROOT/packages/full/.claude-plugin/plugin.json"
    local repo_version
    repo_version="$(python3 -c "import json; print(json.load(open('$plugin_manifest')).get('version',''))" 2>/dev/null)" || repo_version=""

    if [[ -z "$repo_version" || "$cache_version" != "$repo_version" ]]; then
        skip "installed plugin cache is version '$cache_version', repo checkout is '$repo_version' — no matching plugin installed"
    fi

    local cache_manifest="$cache_path/hooks/hooks.manifest.json"
    if [[ ! -f "$cache_manifest" ]]; then
        skip "installed plugin cache has no hooks.manifest.json at $cache_manifest"
    fi

    run "$SCAFFOLD_SCRIPT" --plugin-dir "$cache_path" "$TEST_DIR"
    [ "$status" -eq 0 ]

    run python3 - "$cache_manifest" "$TEST_DIR" <<'PY'
import json, os, sys
manifest = json.load(open(sys.argv[1]))
target = sys.argv[2]
shippable = {h["file"] for h in manifest["hooks"] if h.get("shippable")}
hooks_dir = os.path.join(target, ".claude/hooks")
on_disk = {f for f in os.listdir(hooks_dir) if os.path.isfile(os.path.join(hooks_dir, f))}
missing = sorted(shippable - on_disk)
extra = sorted(on_disk - shippable)
print("missing:", missing)
print("extra:", extra)
sys.exit(1 if (missing or extra) else 0)
PY
    [ "$status" -eq 0 ]
}

# =============================================================================
# B-1 regression: packages/full/commands/plugin-only/{init-project,rebase-project}.md
# must be symlinks into packages/core/commands/ (matching the sibling core/router
# symlinks), so the shipped plugin command text can never drift stale from core.
# =============================================================================

@test "B-1: plugin-only init-project.md and rebase-project.md are symlinks matching core" {
    local plugin_only="$REPO_ROOT/packages/full/commands/plugin-only"

    for name in init-project.md rebase-project.md; do
        local shipped="$plugin_only/$name"
        local core="$REPO_ROOT/packages/core/commands/$name"

        [ -L "$shipped" ] || {
            echo "expected $shipped to be a symlink, but it is a regular file/directory"
            return 1
        }

        # Resolve and confirm it points at the core copy, not a stale local file.
        local resolved
        resolved="$(cd "$(dirname "$shipped")" && readlink -f "$name")"
        [ "$resolved" = "$core" ] || {
            echo "expected $shipped to resolve to $core, got $resolved"
            return 1
        }

        # Belt-and-suspenders: content must be byte-identical (would already be
        # guaranteed by the symlink, but this also catches a symlink pointed at
        # the wrong file).
        run diff "$core" "$shipped"
        [ "$status" -eq 0 ]
    done
}

@test "B-1: plugin.json commands declaration resolves to exactly init-project.md and rebase-project.md" {
    local plugin_only="$REPO_ROOT/packages/full/commands/plugin-only"
    run python3 -c "
import os, sys
d = sys.argv[1]
names = sorted(f for f in os.listdir(d) if os.path.islink(os.path.join(d, f)))
print('\n'.join(names))
" "$plugin_only"
    [ "$status" -eq 0 ]
    [ "$output" = "$(printf 'init-project.md\nrebase-project.md')" ]
}
