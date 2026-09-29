#!/usr/bin/env bash
# =============================================================================
# close-feature - Scenario: /close-feature (owner close, no judgement)
# =============================================================================
#
# Five runs, two throwaway projects. /close-feature decides nothing: the owner
# says a feature is closed, and the command writes `.trd-state/<f>/closed.json`
# ({feature, trd, closedAt, closedBy: "owner", note, audit: null}), nulls
# current.json's four keys when it points at that feature, removes
# implement.lock, and commits the record alone on a non-default branch. Every
# assertion reads a file, the final banner, or git — none judges prose
# quality (README convention). /audit-build's own close path is out of scope.
#
#   PROJECT_1 (branch feature/x, no origin): TRD, an implement.json with one
#     task `success` and one `pending`, an implement.lock, current.json
#     pointing at the feature.
#     Run 1 : /close-feature <trd> "shipped and tested live" -> closed.json
#             parses with closedBy "owner", the note verbatim, audit null;
#             current.json kept with all four keys null; implement.lock gone;
#             HEAD gained exactly one commit whose only file is closed.json;
#             implement.json byte-unchanged; COMPLETE.
#     Run 2 : the same command again -> closed.json byte-unchanged, no new
#             commit, COMPLETE.
#     Run 3 : /implement-trd --resume -> STUCK naming the reopen path,
#             implement.json byte-unchanged, no commit.
#     Run 4 : current.json restored to the feature, /amend <anything> -> the
#             same STUCK text, no tracked file changed, no commit.
#
#   PROJECT_2 (branch main, no origin, so the default branch resolves to the
#     `main` fallback): the same fixture.
#     Run 5 : /close-feature <trd> -> closed.json written, commit count
#             unchanged (the command never commits on the default branch).
#
# opt-in (registered in LLM_OPT_IN_SCENARIOS, not ALL_SCENARIOS) -- skips (not
# fails) when the `claude` CLI or `jq` is unavailable.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
# shellcheck disable=SC2034  # used by lib/project.sh once sourced below
REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"
# shellcheck source=../lib/project.sh
source "${SMOKE_DIR}/lib/project.sh"

if ! command -v claude &>/dev/null; then
    smoke_skip "claude CLI not found in PATH"
fi
if ! command -v jq &>/dev/null; then
    smoke_skip "jq not installed"
fi

FEATURE="smoke-close"
TASK_A="SMK-CL-A"
TASK_B="SMK-CL-B"
TRD_REL="docs/TRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
CLOSED_JSON_REL="${STATE_DIR_REL}/closed.json"
NOTE="shipped and tested live"
RUN_TIMEOUT=300

PROJECT_DIRS=()
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch projects PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)):"
        for d in "${PROJECT_DIRS[@]}"; do echo "    $d"; done
        return 0
    fi
    for d in "${PROJECT_DIRS[@]}"; do rm -rf "$d"; done
}
trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Fixture
# -----------------------------------------------------------------------------

# smoke_write_close_trd <trd_path>
# Two objectives, two tasks. What they say does not matter to /close-feature;
# /implement-trd and /amend need a well-formed TRD to reach their guards.
smoke_write_close_trd() {
    local trd_path="$1"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${FEATURE} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD (close-feature scenario). Two independent behaviors.

### 1.2 Objectives

| ID | Objective |
|----|-----------|
| O1 | Calling \`greetA()\` returns the exact string \`'hello-a'\` |
| O2 | Calling \`greetB()\` returns the exact string \`'hello-b'\` |

## 4. Master Task List

### 4.1 Phase 1

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${TASK_A} | Create \`src/greet-a.js\` exporting \`greetA()\` returning \`'hello-a'\`. | O1 | | None | \`greetA()\` returns \`'hello-a'\`. |
| ${TASK_B} | Create \`src/greet-b.js\` exporting \`greetB()\` returning \`'hello-b'\`. | O2 | | None | \`greetB()\` returns \`'hello-b'\`. |

## 5. Execution Plan

### 5.1 Phase 1

Both tasks, no parallelization.

## 6. Quality Requirements

- O1: \`greetA()\` returns \`'hello-a'\`.
- O2: \`greetB()\` returns \`'hello-b'\`.

## 7. Risk Assessment

None — fixture TRD.

## 8. Non-Goals

- Anything beyond the two functions named above.
EOF
}

# smoke_write_close_fixture <project_dir> <branch>
# TRD, src/greet-a.js, an implement.json with TASK_A `success` and TASK_B
# `pending`, an implement.lock, and current.json pointing at the feature --
# all committed, so any later change to a tracked file is the command's.
smoke_write_close_fixture() {
    local project_dir="$1" branch="$2"
    smoke_write_close_trd "${project_dir}/${TRD_REL}"
    mkdir -p "${project_dir}/src" "${project_dir}/${STATE_DIR_REL}"
    cat > "${project_dir}/src/greet-a.js" <<'EOF'
module.exports.greetA = () => 'hello-a';
EOF
    cat > "${project_dir}/${STATE_DIR_REL}/implement.json" <<EOF
{
  "version": "4.0.0",
  "trd_file": "${TRD_REL}",
  "branch": "${branch}",
  "strategy": "tdd",
  "phase_cursor": 1,
  "tasks": {
    "${TASK_A}": {
      "description": "Create src/greet-a.js exporting greetA() returning 'hello-a'.",
      "phase": 1,
      "status": "success",
      "cycle_position": "complete",
      "files_changed": ["src/greet-a.js"],
      "commit": null
    },
    "${TASK_B}": {
      "description": "Create src/greet-b.js exporting greetB() returning 'hello-b'.",
      "phase": 1,
      "status": "pending",
      "cycle_position": "implement",
      "files_changed": [],
      "commit": null
    }
  },
  "checkpoints": []
}
EOF
    cat > "${project_dir}/${STATE_DIR_REL}/implement.lock" <<EOF
{ "session_id": "smoke-close-stale", "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
EOF
    cat > "${project_dir}/.trd-state/current.json" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": "${STATE_DIR_REL}/implement.json", "branch": "${branch}" }
EOF
    git -C "$project_dir" add -A
    git -C "$project_dir" commit -q -m "smoke: close-feature fixture" --no-verify
}

# run_close <project_dir> <arg_string> <session_file>
# Invokes `/close-feature <arg_string>` and returns claude's exit code.
run_close() {
    local project_dir="$1" arg_string="$2" session_file="$3"
    smoke_claude "/close-feature ${arg_string}" "$RUN_TIMEOUT" "$project_dir" "$session_file"
    return $?
}

# final_banner <session_file> <out_file>
# The last assistant message's text, written to out_file for assert_tail_matches.
final_banner() {
    printf '%s\n' "$(smoke_final_text "$1")" > "$2"
}

# assert_commit_count <project_dir> <expected> <label>
assert_commit_count() {
    local project_dir="$1" expected="$2" label="$3" actual
    actual="$(git -C "$project_dir" rev-list --count HEAD)"
    if [[ "$actual" == "$expected" ]]; then
        assert_pass_raw "${label}: git rev-list --count HEAD is ${expected}"
    else
        assert_fail_raw "${label}: commit count is ${actual}, expected ${expected}"
    fi
}

# =============================================================================
# PROJECT_1 (feature/x): run 1 (owner close), run 2 (close again), run 3
# (/implement-trd --resume STUCK), run 4 (/amend STUCK).
# =============================================================================

PROJECT_1="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close1.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_1")

if ! smoke_scaffold_project "$PROJECT_1"; then
    assert_fail_raw "scaffold PROJECT_1"
    smoke_finish
fi
git -C "$PROJECT_1" branch -M main
git -C "$PROJECT_1" checkout -q -b feature/x
assert_pass_raw "scaffold PROJECT_1 (branch feature/x, no origin)"

smoke_write_close_fixture "$PROJECT_1" "feature/x"
CLOSED_1="${PROJECT_1}/${CLOSED_JSON_REL}"
IMPLEMENT_JSON_1="${PROJECT_1}/${STATE_DIR_REL}/implement.json"
IMPL_HASH_BEFORE="$(smoke_file_hash "$IMPLEMENT_JSON_1")"
COMMITS_BEFORE_1="$(git -C "$PROJECT_1" rev-list --count HEAD)"

# --- Run 1: owner close with a note, on a feature branch --------------------
SESSION_1="${PROJECT_1}/.session-run1.jsonl"
run_close "$PROJECT_1" "${TRD_REL} \"${NOTE}\"" "$SESSION_1"
assert_exit_code 0 "$?" "claude --print exits 0 (run 1)"
BANNER_1="${PROJECT_1}/.final1.txt"
final_banner "$SESSION_1" "$BANNER_1"
assert_tail_matches "$BANNER_1" 12 '═══ COMMAND COMPLETE' "run 1 ends COMPLETE"

if [[ -f "$CLOSED_1" ]] && jq -e . "$CLOSED_1" >/dev/null 2>&1; then
    assert_pass_raw "run 1: closed.json written and parses"
    assert_json_field "$CLOSED_1" '.closedBy' "owner" "run 1: closedBy is owner"
    assert_json_field "$CLOSED_1" '.note' "$NOTE" "run 1: note stored verbatim"
    assert_json_field "$CLOSED_1" '.audit' "null" "run 1: audit is null"
else
    assert_fail_raw "run 1: closed.json missing or does not parse"
fi

CURRENT_1="${PROJECT_1}/.trd-state/current.json"
if [[ -f "$CURRENT_1" ]]; then
    if jq -e '.prd == null and .trd == null and .status == null and .branch == null' "$CURRENT_1" >/dev/null 2>&1; then
        assert_pass_raw "run 1: current.json kept, all four keys null"
    else
        assert_fail_raw "run 1: current.json not fully nulled: $(cat "$CURRENT_1" 2>/dev/null)"
    fi
else
    assert_fail_raw "run 1: current.json removed (it must be kept)"
fi

if [[ -e "${PROJECT_1}/${STATE_DIR_REL}/implement.lock" ]]; then
    assert_fail_raw "run 1: implement.lock still present"
else
    assert_pass_raw "run 1: implement.lock removed"
fi

assert_commit_count "$PROJECT_1" "$((COMMITS_BEFORE_1 + 1))" "run 1 (exactly one new commit)"
HEAD_FILES_1="$(git -C "$PROJECT_1" show --name-only --format= HEAD)"
if [[ "$HEAD_FILES_1" == "$CLOSED_JSON_REL" ]]; then
    assert_pass_raw "run 1: the new commit holds closed.json and nothing else"
else
    assert_fail_raw "run 1: the new commit holds: ${HEAD_FILES_1//$'\n'/ }"
fi

if [[ "$(smoke_file_hash "$IMPLEMENT_JSON_1")" == "$IMPL_HASH_BEFORE" ]]; then
    assert_pass_raw "run 1: implement.json byte-unchanged"
else
    assert_fail_raw "run 1: implement.json changed"
fi

COMMITS_AFTER_RUN1="$(git -C "$PROJECT_1" rev-list --count HEAD)"
CLOSED_HASH_AFTER_RUN1="$(smoke_file_hash "$CLOSED_1" 2>/dev/null)"

# --- Run 2: close again in the SAME project -> unchanged --------------------
SESSION_2="${PROJECT_1}/.session-run2.jsonl"
run_close "$PROJECT_1" "${TRD_REL} \"${NOTE}\"" "$SESSION_2"
assert_exit_code 0 "$?" "claude --print exits 0 (run 2)"
BANNER_2="${PROJECT_1}/.final2.txt"
final_banner "$SESSION_2" "$BANNER_2"
assert_tail_matches "$BANNER_2" 12 '═══ COMMAND COMPLETE' "run 2 ends COMPLETE"
if [[ "$(smoke_file_hash "$CLOSED_1" 2>/dev/null)" == "$CLOSED_HASH_AFTER_RUN1" ]]; then
    assert_pass_raw "run 2: closed.json byte-unchanged"
else
    assert_fail_raw "run 2: closed.json changed on re-run"
fi
assert_commit_count "$PROJECT_1" "$COMMITS_AFTER_RUN1" "run 2 (no new commit)"

# --- Run 3: /implement-trd --resume in the SAME project -> STUCK -----------
SESSION_3="${PROJECT_1}/.session-run3.jsonl"
smoke_claude "/implement-trd ${TRD_REL} --resume" "$RUN_TIMEOUT" "$PROJECT_1" "$SESSION_3"
assert_exit_code 0 "$?" "claude --print exits 0 (run 3, /implement-trd --resume)"
if grep -qi 'delete .trd-state/'"${FEATURE}"'/closed.json to reopen' "$SESSION_3" 2>/dev/null; then
    assert_pass_raw "run 3: STUCK names the reopen path"
else
    assert_fail_raw "run 3: reopen text not found in /implement-trd --resume transcript"
fi
BANNER_3="${PROJECT_1}/.final3.txt"
final_banner "$SESSION_3" "$BANNER_3"
assert_tail_matches "$BANNER_3" 12 '═══ COMMAND STUCK' "run 3 ends STUCK"
if [[ "$(smoke_file_hash "$IMPLEMENT_JSON_1")" == "$IMPL_HASH_BEFORE" ]]; then
    assert_pass_raw "run 3: implement.json byte-unchanged"
else
    assert_fail_raw "run 3: implement.json changed"
fi
assert_commit_count "$PROJECT_1" "$COMMITS_AFTER_RUN1" "run 3 (no new commit)"

# --- Run 4: restore current.json, /amend <anything> -> the same STUCK -------
# Commit the restore (and run 1's uncommitted current.json/implement.lock
# changes) BEFORE invoking /amend: scaffold-project.sh writes no .gitignore
# into a throwaway project, so .trd-state/ is ordinary tracked content here --
# leaving these uncommitted would make the post-/amend `git status` show OUR
# OWN edits, not anything /amend did.
cat > "$CURRENT_1" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": "${STATE_DIR_REL}/implement.json", "branch": "feature/x" }
EOF
git -C "$PROJECT_1" add -A
git -C "$PROJECT_1" commit -q -m "smoke: restore current.json ahead of run 4" --no-verify
COMMITS_BEFORE_RUN4="$(git -C "$PROJECT_1" rev-list --count HEAD)"
SESSION_4="${PROJECT_1}/.session-run4.jsonl"
smoke_claude "/amend make the greeting louder" "$RUN_TIMEOUT" "$PROJECT_1" "$SESSION_4"
assert_exit_code 0 "$?" "claude --print exits 0 (run 4, /amend)"
if grep -qi 'delete .trd-state/'"${FEATURE}"'/closed.json to reopen' "$SESSION_4" 2>/dev/null; then
    assert_pass_raw "run 4: /amend STUCK names the same reopen path"
else
    assert_fail_raw "run 4: reopen text not found in /amend transcript"
fi
TRACKED_AFTER4="$(git -C "$PROJECT_1" status --porcelain --untracked-files=no)"
if [[ -z "$TRACKED_AFTER4" ]]; then
    assert_pass_raw "run 4: no tracked file changed"
else
    assert_fail_raw "run 4: tracked files changed: ${TRACKED_AFTER4}"
fi
assert_commit_count "$PROJECT_1" "$COMMITS_BEFORE_RUN4" "run 4 (/amend added no commit)"

# =============================================================================
# PROJECT_2 (main, no origin): run 5 (owner close on the default branch).
# =============================================================================

PROJECT_2="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close2.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_2")

if ! smoke_scaffold_project "$PROJECT_2"; then
    assert_fail_raw "scaffold PROJECT_2"
else
    # `git init`'s own default is `master` unless init.defaultBranch is set;
    # the command's fallback default branch is `main`, so name it that.
    git -C "$PROJECT_2" branch -M main
    assert_pass_raw "scaffold PROJECT_2 (branch main, no origin)"

    smoke_write_close_fixture "$PROJECT_2" "main"
    COMMITS_BEFORE_2="$(git -C "$PROJECT_2" rev-list --count HEAD)"

    SESSION_5="${PROJECT_2}/.session-run5.jsonl"
    run_close "$PROJECT_2" "${TRD_REL}" "$SESSION_5"
    assert_exit_code 0 "$?" "claude --print exits 0 (run 5)"
    BANNER_5="${PROJECT_2}/.final5.txt"
    final_banner "$SESSION_5" "$BANNER_5"
    assert_tail_matches "$BANNER_5" 12 '═══ COMMAND COMPLETE' "run 5 ends COMPLETE"
    CLOSED_5="${PROJECT_2}/${CLOSED_JSON_REL}"
    if [[ -f "$CLOSED_5" ]] && jq -e . "$CLOSED_5" >/dev/null 2>&1; then
        assert_pass_raw "run 5: closed.json written and parses"
        assert_json_field "$CLOSED_5" '.closedBy' "owner" "run 5: closedBy is owner"
    else
        assert_fail_raw "run 5: closed.json missing or does not parse"
    fi
    assert_commit_count "$PROJECT_2" "$COMMITS_BEFORE_2" "run 5 (no commit on the default branch)"
fi

smoke_finish
