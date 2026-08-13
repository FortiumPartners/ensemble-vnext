#!/usr/bin/env bash
# =============================================================================
# trd-run - Scenario: /create-trd end to end in a throwaway project
# =============================================================================
#
# The artifact chain is PRD -> TRD -> Implementation. Without this scenario the
# harness covered both ends and skipped the middle.
#
# The gap mattered more than completeness. `implement-one-task` feeds
# /implement-trd a HAND-WRITTEN fixture TRD, so the format the implementer
# consumes is authored by the test rather than produced by /create-trd, and
# nothing was checking that the two agree. That seam is exactly what
# improvement-plan item 7 disturbs — it changes /create-trd to emit the task
# graph as data — so without this scenario item 7 would be modifying a command
# with no regression net on its output format.
#
# Asserts observable side effects only:
#   - exit 0
#   - output ends with a COMMAND COMPLETE / COMMAND STUCK banner
#   - docs/TRD/*.md created and non-empty
#   - technical-architect appears in the session log
#   - the TRD has a Master Task List with machine-findable task IDs
#
# Skips (not fails) when the `claude` CLI is unavailable (e.g. CI).
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

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-trdrun.XXXXXX")"
cleanup() { rm -rf "$PROJECT_DIR"; }
trap cleanup EXIT INT TERM

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

# A fixture PRD, so this scenario stays independent of prd-run and can run
# concurrently with it. Chaining them would serialise ~15 minutes of work to
# test a handoff this file asserts structurally instead.
mkdir -p "${PROJECT_DIR}/docs/PRD"
cat > "${PROJECT_DIR}/docs/PRD/smoke-csv.md" <<'PRD'
# PRD: CSV to JSON converter

## Overview
A small CLI utility that reads a CSV file and writes formatted JSON.

## User Stories
- As a developer, I want to convert a CSV file to JSON so I can load it in a JS app.

## Acceptance Criteria
- AC-1: `csv2json input.csv` writes `input.json` next to the input file.
- AC-2: The first CSV row is the header and becomes the JSON keys.
- AC-3: A missing input file exits non-zero with a clear message.

## Non-Goals
- No streaming support for files larger than memory.
PRD
assert_file_exists "${PROJECT_DIR}/docs/PRD/smoke-csv.md" "fixture PRD written"

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
PROMPT='/create-trd docs/PRD/smoke-csv.md'

# NOTE: this internal timeout must stay BELOW the runner's per-scenario cap in
# run-smoke.sh (currently 900s) and ABOVE what the shipped models actually take.
# Raise both together, and never lower the model instead.
smoke_claude "$PROMPT" 840 "$PROJECT_DIR" "$SESSION_FILE"
RC=$?

assert_exit_code 0 "$RC" "claude --print exits 0"

FINAL_TEXT="$(smoke_final_text "$SESSION_FILE")"
BANNER_FILE="${PROJECT_DIR}/.final_text"
printf '%s\n' "$FINAL_TEXT" > "$BANNER_FILE"
assert_tail_matches "$BANNER_FILE" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner"

TRD_COUNT=$(find "${PROJECT_DIR}/docs/TRD" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [[ "${TRD_COUNT:-0}" -gt 0 ]]; then
    assert_pass_raw "docs/TRD/*.md created (${TRD_COUNT} file(s))"
else
    assert_fail_raw "docs/TRD/*.md created (found none)"
fi

TRD_FILE="$(find "${PROJECT_DIR}/docs/TRD" -maxdepth 1 -name '*.md' 2>/dev/null | head -1)"
if [[ -n "$TRD_FILE" && -s "$TRD_FILE" ]]; then
    assert_pass_raw "created TRD file is non-empty"
else
    assert_fail_raw "created TRD file is non-empty"
fi

if smoke_agent_invoked "$SESSION_FILE" "technical-architect"; then
    assert_pass_raw "technical-architect agent invoked (session log)"
else
    assert_fail_raw "technical-architect agent invoked (session log)"
fi

# ---------------------------------------------------------------------------
# The contract with /implement-trd — and a live divergence found while writing
# this scenario.
#
# implement-trd.md Step 3.1 documents the Master Task List as a checkbox list:
#     - [ ] **PREFIX-CATSEQ**: Description
#
# Real TRDs do not look like that. runtime-refresh.md carries 34 task rows in
# MARKDOWN TABLES and zero checkbox tasks; ensemble-vnext.md has 110 and zero.
# Only testing-phase.md, the oldest, uses checkboxes. The documented parser and
# the produced artifact have diverged completely, and it went unnoticed because
# the model reads whichever shape it finds — the prose is advisory, not a parser.
#
# This therefore asserts the WEAKER, TRUE contract: a Master Task List
# containing machine-findable task IDs in EITHER shape. Asserting the documented
# format would fail against every current TRD, which would be testing the
# documentation rather than the product.
#
# Item 7 is where this gets resolved — a real parser demanding one declared
# format. Tighten this assertion then; it becomes the test proving the new
# format actually took.
# ---------------------------------------------------------------------------
if [[ -n "$TRD_FILE" ]] && grep -qi 'master task list' "$TRD_FILE"; then
    assert_pass_raw "TRD contains a Master Task List section"
else
    assert_fail_raw "TRD contains a Master Task List section"
fi

CHECKBOX_TASKS=0
TABLE_TASKS=0
if [[ -n "$TRD_FILE" ]]; then
    CHECKBOX_TASKS=$(grep -cE '^[[:space:]]*[-*][[:space:]]*\[[ xX]\][[:space:]]*\*\*[A-Z][A-Z0-9]*(-[A-Z0-9]+)+' "$TRD_FILE" 2>/dev/null) || CHECKBOX_TASKS=0
    TABLE_TASKS=$(grep -cE '^\|[[:space:]]*[A-Z][A-Z0-9]*(-[A-Z0-9]+)+[[:space:]]*\|' "$TRD_FILE" 2>/dev/null) || TABLE_TASKS=0
fi
TOTAL_TASKS=$(( CHECKBOX_TASKS + TABLE_TASKS ))

if [[ "$TOTAL_TASKS" -gt 0 ]]; then
    assert_pass_raw "TRD declares machine-findable task IDs (${CHECKBOX_TASKS} checkbox, ${TABLE_TASKS} table)"
else
    assert_fail_raw "TRD declares machine-findable task IDs (neither checkbox nor table rows found)"
fi

smoke_finish
