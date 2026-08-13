#!/usr/bin/env bash
# =============================================================================
# prd-run - Scenario 2: /create-prd end to end in a throwaway project
# =============================================================================
#
# Runs `/create-prd` headlessly against a short feature description and
# asserts observable side effects only:
#   - exit 0
#   - last output line matches the COMMAND COMPLETE / COMMAND STUCK banner
#   - docs/PRD/*.md was created and is non-empty
#   - product-manager appears in the session log
#
# Skips (not fail) when the `claude` CLI is unavailable (e.g. CI).
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

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-prdrun.XXXXXX")"
cleanup() { rm -rf "$PROJECT_DIR"; }
trap cleanup EXIT INT TERM

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
PROMPT='/create-prd A small CLI utility that converts a CSV file to formatted JSON.'

smoke_claude "$PROMPT" 480 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?

assert_exit_code 0 "$RC" "claude --print exits 0"

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner (glyph line + one-line summary)"

PRD_COUNT=$(find "${PROJECT_DIR}/docs/PRD" -maxdepth 1 -name '*.md' -newer "${PROJECT_DIR}/.scaffold.log" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$PRD_COUNT" -gt 0 ]]; then
    assert_pass_raw "docs/PRD/*.md created ($PRD_COUNT file(s))"
    PRD_FILE=$(find "${PROJECT_DIR}/docs/PRD" -maxdepth 1 -name '*.md' -newer "${PROJECT_DIR}/.scaffold.log" 2>/dev/null | head -1)
    assert_file_nonempty "$PRD_FILE" "created PRD file is non-empty"
else
    assert_fail_raw "docs/PRD/*.md created (found 0 new files)"
fi

if smoke_agent_invoked "$SESSION_FILE" "product-manager"; then
    assert_pass_raw "product-manager agent invoked (session log)"
else
    assert_fail_raw "product-manager agent invoked (session log)"
fi

smoke_finish
