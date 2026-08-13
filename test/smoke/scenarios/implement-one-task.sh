#!/usr/bin/env bash
# =============================================================================
# implement-one-task - Scenario 3: /implement-trd, single trivial task
# =============================================================================
#
# Runs `/implement-trd` headlessly against a fixture TRD with exactly ONE
# task ("create src/greet.js exporting a function that returns 'hello'") and
# asserts:
#   - terminates with a COMMAND COMPLETE/STUCK banner
#   - src/greet.js exists
#   - .trd-state/<feature>/implement.json shows the task at status "success"
#     and cycle_position "complete"
#   - an implementer agent + verify-app appear in the session log
#   - git is on the expected feature branch
#
# Skips (not fail) when the `claude` CLI is unavailable.
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

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-impltask.XXXXXX")"
cleanup() { rm -rf "$PROJECT_DIR"; }
trap cleanup EXIT INT TERM

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

FEATURE="smoke-greet"
TASK_ID="SMOKE-001"
TRD_REL="docs/TRD/${FEATURE}.md"
smoke_write_trd "${PROJECT_DIR}/${TRD_REL}" "$TASK_ID" "Smoke Greet"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: add fixture TRD" --no-verify
assert_pass_raw "fixture TRD written ($TRD_REL)"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
PROMPT="/implement-trd ${TRD_REL}"

smoke_claude "$PROMPT" 480 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?

assert_exit_code 0 "$RC" "claude --print exits 0"

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner (glyph line + one-line summary)"

assert_file_exists "${PROJECT_DIR}/src/greet.js" "src/greet.js was created"

IMPLEMENT_JSON="${PROJECT_DIR}/.trd-state/${FEATURE}/implement.json"
assert_file_exists "$IMPLEMENT_JSON" "implement.json exists for feature '${FEATURE}'"
assert_json_field "$IMPLEMENT_JSON" ".tasks.\"${TASK_ID}\".status" "success" \
    "task ${TASK_ID} status is success"
assert_json_field "$IMPLEMENT_JSON" ".tasks.\"${TASK_ID}\".cycle_position" "complete" \
    "task ${TASK_ID} cycle_position is complete"

IMPLEMENTER_SEEN=false
for agent in backend-implementer frontend-implementer mobile-implementer agent-implementer; do
    if smoke_agent_invoked "$SESSION_FILE" "$agent"; then
        assert_pass_raw "implementer agent invoked ($agent)"
        IMPLEMENTER_SEEN=true
        break
    fi
done
if [[ "$IMPLEMENTER_SEEN" == "false" ]]; then
    assert_fail_raw "an implementer agent invoked (backend/frontend/mobile/agent-implementer)"
fi

if smoke_agent_invoked "$SESSION_FILE" "verify-app"; then
    assert_pass_raw "verify-app agent invoked"
else
    assert_fail_raw "verify-app agent invoked"
fi

assert_git_branch "$PROJECT_DIR" '.+' "git is on a feature branch (not detached/empty)"

smoke_finish
