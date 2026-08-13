#!/usr/bin/env bash
# =============================================================================
# debug-path - Scenario 4: /implement-trd exercises VERIFY -> DEBUG
# =============================================================================
#
# Same shape as implement-one-task, except src/greet.test.js is PRE-CREATED
# asserting an impossible value, so VERIFY fails deterministically no matter
# what the implementer writes. This exercises the VERIFY -> DEBUG path.
#
# A STUCK outcome is a PASS here — the point is that app-debugger got
# involved and a retry was recorded, not that the (unfixable) bug got fixed.
# Retries are capped by implement-trd's own documented retry limit; the
# scenario timeout additionally bounds worst-case wall time.
#
# Asserts:
#   - terminates with a banner (COMPLETE or STUCK — both pass)
#   - app-debugger appears in the session log
#   - retry_count > 0 in implement.json for the task
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

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-debugpath.XXXXXX")"
cleanup() { rm -rf "$PROJECT_DIR"; }
trap cleanup EXIT INT TERM

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

FEATURE="smoke-greet-fail"
TASK_ID="SMOKEFAIL-001"
TRD_REL="docs/TRD/${FEATURE}.md"
smoke_write_trd "${PROJECT_DIR}/${TRD_REL}" "$TASK_ID" "Smoke Greet (deliberately failing)"
smoke_write_failing_test "$PROJECT_DIR"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: add fixture TRD + deliberately-failing test" --no-verify
assert_pass_raw "fixture TRD + pre-failing test written ($TRD_REL)"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
PROMPT="/implement-trd ${TRD_REL}"

# NOTE: this internal timeout must stay BELOW the runner's per-scenario cap in
# run-smoke.sh (currently 900s) and ABOVE what the shipped models actually take.
# prd-run measured 482s on Opus/Sonnet; a 480s value here produced a SIGTERM
# (exit 143) that looked like a behavioral failure but was purely the clock.
# Raise both together, and never lower the model instead.
smoke_claude "$PROMPT" 840 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?

# Both a clean exit and a timeout-under-cap can be legitimate here (a STUCK
# banner after retry exhaustion is a pass); only treat genuinely unexpected
# non-zero/non-timeout exits as a hard failure of the invocation itself.
if [[ "$RC" == "0" || "$RC" == "124" ]]; then
    assert_pass_raw "claude --print completed or hit the scenario timeout cleanly (exit=$RC)"
else
    assert_fail_raw "claude --print exited unexpectedly (exit=$RC)"
fi

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner (STUCK is a pass for this scenario)"

if smoke_agent_invoked "$SESSION_FILE" "app-debugger"; then
    assert_pass_raw "app-debugger agent invoked (VERIFY -> DEBUG path entered)"
else
    assert_fail_raw "app-debugger agent invoked (VERIFY -> DEBUG path entered)"
fi

IMPLEMENT_JSON="${PROJECT_DIR}/.trd-state/${FEATURE}/implement.json"
assert_file_exists "$IMPLEMENT_JSON" "implement.json exists for feature '${FEATURE}'"
if [[ -f "$IMPLEMENT_JSON" ]]; then
    RETRY_COUNT=$(jq -r --arg t "$TASK_ID" '.tasks[$t].retry_count // 0' "$IMPLEMENT_JSON" 2>/dev/null)
    if [[ "${RETRY_COUNT:-0}" -gt 0 ]] 2>/dev/null; then
        assert_pass_raw "retry_count incremented (retry_count=$RETRY_COUNT)"
    else
        assert_fail_raw "retry_count incremented (retry_count=${RETRY_COUNT:-<missing>})"
    fi
fi

smoke_finish
