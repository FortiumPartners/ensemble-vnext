#!/usr/bin/env bash
# =============================================================================
# project.sh - Throwaway project + claude-CLI helpers for behavioral scenarios
# =============================================================================
#
# Sourced (after lib/assert.sh) by scenarios 2-4. Provides:
#   - smoke_scaffold_project <dir>   deterministic .claude/ scaffold (no LLM)
#   - smoke_claude <prompt> <secs> <project_dir> <session_file> [extra args...]
#                                    headless `claude --print` invocation
#
# Deliberately reimplements the CLI invocation pattern documented in this
# repo's CLAUDE.md ("Headless Testing with Claude CLI" -> `--setting-sources
# project`) rather than shelling out to test/integration/scripts/run-headless.sh
# unmodified, for two independent reasons discovered while building this:
#
#   1. run-headless.sh hardcodes `--setting-sources local`, which conflicts
#      with CLAUDE.md's own current guidance to use `--setting-sources
#      project` (needed so a scaffolded project's committed .claude/settings.json
#      hooks actually load, rather than only .claude/settings.local.json).
#   2. run-headless.sh shells out to the bare `timeout` command, which is a
#      GNU coreutils binary not present on stock macOS (confirmed absent on
#      the machine this harness was built on, no `timeout` or `gtimeout`).
#      Patching run-headless.sh silently was out of scope ("report broken
#      things, don't silently fix them") — see test/smoke/README.md.
#
# The scaffold step deliberately does NOT run `/init-project` as an LLM turn:
# that command's own steps 1-14 (stack detection, interactive prompts even in
# "minimal" mode, CLAUDE.md rewriting, validation, completion report) are
# themselves a multi-minute non-deterministic LLM turn we don't want to pay
# for/depend on in every scenario invocation — especially since Scenario 1
# already exercises the deterministic half of that pipeline (the hooks). What
# scaffold-project.sh (the deterministic script /init-project's Step 9
# delegates to) produces is functionally identical for our purposes: a
# .claude/{agents,commands,hooks,rules,settings.json} tree and .trd-state/.
#
# =============================================================================

# smoke_scaffold_project <target_dir>
# Deterministically scaffolds a throwaway project's .claude/ + docs/ + .trd-state/
# tree using scaffold-project.sh (no LLM turn), then fills in the rules files
# /init-project would otherwise generate interactively (constitution.md,
# stack.md) with fixed, minimal content matching this repo's own settings —
# unit-only verification, so scenarios stay deterministic and fast.
smoke_scaffold_project() {
    local target_dir="$1"
    local scaffold_script="${REPO_ROOT}/packages/core/scripts/scaffold-project.sh"

    if [[ ! -x "$scaffold_script" ]]; then
        echo "smoke_scaffold_project: scaffold-project.sh not found or not executable at $scaffold_script" >&2
        return 1
    fi

    mkdir -p "$target_dir"
    if ! "$scaffold_script" --plugin-dir "${REPO_ROOT}/packages/full" --force "$target_dir" \
        >"${target_dir}/.scaffold.log" 2>&1; then
        echo "smoke_scaffold_project: scaffold-project.sh failed, see ${target_dir}/.scaffold.log" >&2
        return 1
    fi

    mkdir -p "${target_dir}/.claude/rules"
    cat > "${target_dir}/.claude/rules/constitution.md" <<'EOF'
# Smoke-Test Project Constitution

## Verification Requirements

verification_level: unit-only

## Quality Gates

- [ ] Tests pass (unit >= 0%, integration >= 0%) — smoke-test project, no real
      coverage bar; scenarios assert on file/state side effects, not coverage.

## Approval Requirements

No approval needed for any operation in this throwaway project.
EOF
    cat > "${target_dir}/.claude/rules/stack.md" <<'EOF'
# Smoke-Test Project Stack

Node.js (no framework). Jest available if needed. No database.
EOF
    # process.md is one of validate-init.sh's required governance files
    # (Section 3) alongside constitution.md/stack.md; without it every
    # scaffolded-project scenario that runs validate-init.sh would FAIL on a
    # file /init-project would normally have generated interactively.
    cat > "${target_dir}/.claude/rules/process.md" <<'EOF'
# Smoke-Test Project Process

Deterministic smoke-test project. No interactive workflow — scaffolded
directly by scaffold-project.sh, not by /init-project.
EOF

    # implement-trd's git branch management needs a real, clean repo.
    if [[ ! -d "${target_dir}/.git" ]]; then
        git -C "$target_dir" init -q
        git -C "$target_dir" config user.email "smoke@example.com"
        git -C "$target_dir" config user.name "Smoke Harness"
    fi
    git -C "$target_dir" add -A
    git -C "$target_dir" commit -q -m "smoke: scaffold throwaway project" --no-verify
    return 0
}

# smoke_claude <prompt> <timeout_secs> <project_dir> <session_file>
# Headless `claude --print` invocation per CLAUDE.md's documented pattern.
# Writes the full stream-json transcript to session_file. Returns claude's
# exit code (124 on timeout, via smoke_timeout).
smoke_claude() {
    local prompt="$1" timeout_s="$2" project_dir="$3" session_file="$4"
    local plugin_dir="${PLUGIN_DIR:-${REPO_ROOT}/packages/full}"
    (
        cd "$project_dir" || exit 90
        export CLAUDE_CODE_ENABLE_TELEMETRY=0
        export ENSEMBLE_RUNTIME_REFRESH_DISABLE=1
        smoke_timeout "$timeout_s" claude \
            --print \
            --verbose \
            --plugin-dir "$plugin_dir" \
            --setting-sources project \
            --permission-mode bypassPermissions \
            --output-format stream-json \
            "$prompt" \
            >"$session_file" 2>&1
    )
    return $?
}

# smoke_final_text <session_file>
# Text of the LAST assistant message — the banner, when the command followed
# the command-status contract.
#
# Deliberately NOT verify-output.sh's get_final_response: that helper reads
# `.content` / `.role` at the top level of each JSONL record, but current
# `claude --print --output-format stream-json` records nest assistant text
# under `.message.content` / `.message.role` (top-level `.role` doesn't
# exist; top-level `.content` is always null) — get_final_response silently
# returns empty against real output. Also: the CLI prepends one non-JSON
# preamble line ("Ignoring N permissions.allow entries...") before the
# stream-json records begin, which breaks naive `jq` over the whole file
# (parse error on line 1) unless filtered out first. Both gaps are reported
# in test/smoke/README.md rather than patched in verify-output.sh.
smoke_final_text() {
    local session_file="$1"
    grep '^{' "$session_file" 2>/dev/null | jq -rs '
        [.[] | select(.type=="assistant")] | last as $m |
        ($m.message.content // [])[]? | select(.type=="text") | .text
    ' 2>/dev/null
}

# smoke_write_trd <trd_path> <task_id> <feature_name>
# Writes a minimal, valid single-task TRD: one Master Task List entry (as a
# GFM table under a "Phase <n>" heading — the shape `trd-parser.js` is built
# against per trd-authoring.md §5, e.g. `docs/TRD/*.md`'s own
# `| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |`
# tables), one Execution Plan phase, Risk Assessment + Non-Goals sections
# (required by constitution.md's task-graph expectations). The task creates
# src/greet.js exporting a function that returns 'hello' — deliberately
# trivial so implement-one-task's assertions are about wiring (did the loop
# advance the task through IMPLEMENT -> ... -> success), not code quality.
#
# ITR-B015: this used to be a bullet-list body, which trd-parser.js's
# table-only Master Task List extraction parses to zero tasks. Converting the
# fixture (not widening the parser) matches D2's rule that trd-authoring.md
# is the format authority, not a test fixture.
smoke_write_trd() {
    local trd_path="$1" task_id="$2" feature_name="$3"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${feature_name} — Technical Requirements Document

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD. Adds a single trivial module, \`src/greet.js\`, exporting
a \`greet()\` function that returns the string \`'hello'\`. No other behavior.

## 4. Master Task List

### 4.1 Phase 1 — Single task

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${task_id} | Create \`src/greet.js\` exporting \`greet()\`: \`module.exports.greet = () => 'hello';\` (or equivalent ESM export). Add a Jest test at \`src/greet.test.js\` asserting \`greet() === 'hello'\`. | AC-1 | | None | \`greet()\` returns the exact string \`'hello'\`, verified by a passing Jest test. |

## 5. Execution Plan

### 5.1 Phase 1 — Single task

\`${task_id}\` only. No parallelization, no dependencies.

## 6. Quality Requirements

- AC-1: \`greet()\` returns the exact string \`'hello'\`, verified by a passing Jest test.

## 7. Risk Assessment

None — single trivial fixture task, no external dependencies.

## 8. Non-Goals

- Anything beyond the single \`greet()\` export. No CLI, no additional modules,
  no refactor of unrelated files.
EOF
}

# smoke_write_failing_test <project_dir>
# Pre-creates src/greet.test.js asserting an impossible value, so VERIFY
# fails no matter what the implementer writes for greet.js — used by the
# debug-path scenario to deterministically exercise VERIFY -> DEBUG without
# depending on the model producing a bug.
smoke_write_failing_test() {
    local project_dir="$1"
    mkdir -p "${project_dir}/src"
    cat > "${project_dir}/src/greet.test.js" <<'EOF'
// Deliberately-failing fixture test (test/smoke debug-path scenario).
// Asserts an impossible value so VERIFY fails regardless of implementation,
// exercising the VERIFY -> DEBUG path deterministically.
const { greet } = require('./greet');

test('greet returns a value no implementation can produce', () => {
  expect(greet()).toBe('__smoke_test_impossible_value__');
});
EOF
}

# smoke_agent_invoked <session_file> <agent_name>
# True (echoes "1") if a Task/Agent tool call targeting subagent_type
# <agent_name> appears anywhere in the session log. Not covered by
# verify-telemetry.sh / verify-skill.sh (checked: neither greps for
# subagent_type or the Agent tool) despite the modernization plan describing
# verify-telemetry.sh as already doing this — see test/smoke/README.md.
smoke_agent_invoked() {
    local session_file="$1" agent_name="$2"
    if [[ ! -f "$session_file" ]]; then
        return 1
    fi
    # Filter to JSON lines first: `claude --print --output-format stream-json`
    # prepends a non-JSON preamble line ("Ignoring N permissions.allow
    # entries...") that a plain `jq` (non-slurp) pass over the whole file
    # chokes on before it ever reaches the valid records. See smoke_final_text.
    if grep '^{' "$session_file" 2>/dev/null | jq -e --arg a "$agent_name" '
        select(.type=="assistant") | .message.content[]? |
        select(.type=="tool_use") |
        select(.name=="Agent" or .name=="Task") |
        select(.input.subagent_type==$a)
    ' >/dev/null 2>&1; then
        return 0
    fi
    # Fallback: raw substring match (covers stream-json shape drift).
    grep -qF "\"subagent_type\":\"${agent_name}\"" "$session_file" 2>/dev/null
}
