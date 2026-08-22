#!/usr/bin/env bash
# =============================================================================
# verify-functional - Scenario: /implement-trd --verify
# =============================================================================
#
# Runs `/implement-trd` headlessly TWICE against a fixture TRD with exactly
# ONE task and a matching one-requirement PRD:
#
#   1. WITHOUT --verify  -> asserts a COMMAND COMPLETE/STUCK banner
#      and that NO .trd-state/<feature>/success-definition.md appears (Step
#      3.6 is skipped entirely when the flag is absent).
#   2. WITH --verify     -> asserts the banner, a success
#      definition whose every row carries a `Cites` value or a
#      `domain-derived` label, a verification-state.json carrying an
#      iteration number and a per-criterion status, and a
#      verification-report.md naming every criterion in the definition.
#
# Each run gets its OWN throwaway project (not the same one twice) so the
# second run's implement.json/branch state can never leak into or be
# confused with the first's -- see functional-verification TRD FV-T001 and
# implement-trd.md Step 3.6/Step 8.
#
# opt-in (registered in LLM_OPT_IN_SCENARIOS, not ALL_SCENARIOS, AC-6/NG4).
# Skips (not fail) when the `claude` CLI or `jq` is unavailable.
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

FEATURE="smoke-fv"
TASK_ID="SMOKE-FV-001"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"

# smoke_write_fv_prd <prd_path> <feature_name>
# There is no `smoke_write_prd` helper in lib/project.sh (careful note,
# FV-T001 grounding) -- this scenario supplies its own minimal PRD fixture
# with exactly one functional requirement the derive agent (product-manager,
# Step 3.6) can cite.
smoke_write_fv_prd() {
    local prd_path="$1" feature_name="$2"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${feature_name} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke-test fixture PRD for the functional-verification scenario. Describes a
single, trivially-checkable user-facing behavior.

## 2. Functional Requirements

- FR-1: Calling \`greet()\` returns the exact string \`'hello'\`.

## 3. Aspirations (non-normative)

The greeting should feel warm and modern, and the module should be pleasant to
work with. Nothing here is a requirement; this section exists so the fixture
contains something a deriving agent may be tempted to promote.

## 4. Non-Goals

- Anything beyond the single \`greet()\` behavior. No CLI, no additional
  modules, no auth, no persistence.
EOF
}

# smoke_write_fv_trd <trd_path> <task_id> <feature_name> <prd_rel>
# `smoke_write_trd()` (lib/project.sh) does NOT emit a `**Source PRD**:`
# header (careful note, FV-T001 grounding) -- Step 3.6's PRD-path resolution
# needs one, so this scenario writes its own fixture with the header in the
# bare-backticked-path form implement-trd.md Step 3.6 §1 documents.
smoke_write_fv_trd() {
    local trd_path="$1" task_id="$2" feature_name="$3" prd_rel="$4"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${feature_name} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${prd_rel}\`

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD. Adds a single trivial module, \`src/greet.js\`, exporting
a \`greet()\` function that returns the string \`'hello'\`, satisfying FR-1 of the
matching fixture PRD. No other behavior.

## 4. Master Task List

### 4.1 Phase 1 — Single task

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${task_id} | Create \`src/greet.js\` exporting \`greet()\`: \`module.exports.greet = () => 'hello';\` (or equivalent ESM export). Add a Jest test at \`src/greet.test.js\` asserting \`greet() === 'hello'\`. | FR-1 | | None | \`greet()\` returns the exact string \`'hello'\`, verified by a passing Jest test. |

## 5. Execution Plan

### 5.1 Phase 1 — Single task

\`${task_id}\` only. No parallelization, no dependencies.

## 6. Quality Requirements

- FR-1: \`greet()\` returns the exact string \`'hello'\`, verified by a passing Jest test.

## 7. Risk Assessment

None — single trivial fixture task, no external dependencies.

## 8. Non-Goals

- Anything beyond the single \`greet()\` export. No CLI, no additional modules,
  no refactor of unrelated files.
EOF
}

# run_implement_trd <project_dir> <session_file> <prompt> <timeout_secs>
# Scaffolds a fresh throwaway project, writes+commits the PRD/TRD fixtures,
# runs `claude --print` with the given prompt, and returns claude's exit
# code. Leaves the banner text in "${project_dir}/.final_text".
run_implement_trd() {
    local project_dir="$1" session_file="$2" prompt="$3" timeout_s="$4"

    RUN_SCAFFOLD_OK=false
    if ! smoke_scaffold_project "$project_dir"; then
        assert_fail_raw "scaffold throwaway project ($project_dir)"
        return 1
    fi
    RUN_SCAFFOLD_OK=true
    assert_pass_raw "scaffold throwaway project ($project_dir)"

    smoke_write_fv_prd "${project_dir}/${PRD_REL}" "$FEATURE"
    smoke_write_fv_trd "${project_dir}/${TRD_REL}" "$TASK_ID" "$FEATURE" "$PRD_REL"
    git -C "$project_dir" add -A
    git -C "$project_dir" commit -q -m "smoke: add fixture PRD+TRD" --no-verify
    # Assert the fixtures actually landed rather than announcing it — a
    # heredoc that failed (unwritable dir, full disk) would otherwise be
    # reported as a pass and every later assertion would fail confusingly.
    assert_file_nonempty "${project_dir}/${PRD_REL}" "fixture PRD written ($PRD_REL)"
    assert_file_nonempty "${project_dir}/${TRD_REL}" "fixture TRD written ($TRD_REL)"

    smoke_claude "$prompt" "$timeout_s" "$project_dir" "$session_file"
    local rc=$?
    assert_exit_code 0 "$rc" "claude --print exits 0 ($prompt)"

    local final_text banner_file
    final_text="$(smoke_final_text "$session_file")"
    banner_file="${project_dir}/.final_text"
    printf '%s\n' "$final_text" > "$banner_file"
    assert_tail_matches "$banner_file" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
        "output ends with a COMMAND COMPLETE/STUCK banner ($prompt)"

    return "$rc"
}

# =============================================================================
# Run 1: WITHOUT --verify
# =============================================================================

PROJECT_DIR_OFF="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-fvoff.XXXXXX")"
PROJECT_DIR_ON="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-fvon.XXXXXX")"
# PRESERVE THE EVIDENCE ON FAILURE. Measured 2026-08-19: the second live run of
# this scenario failed with verification-state.json and verification-report.md
# absent while success-definition.md was present -- a real, non-deterministic
# defect in the loop -- and the trap deleted the only copy of the scaffolded
# project before it could be examined. A scenario that destroys the state needed
# to diagnose its own failure can only ever tell you THAT something broke.
#
# Clean up on success; keep and announce the path on failure.
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch projects PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)):"
        [[ -d "$PROJECT_DIR_OFF" ]] && echo "    no-flag: $PROJECT_DIR_OFF"
        [[ -d "$PROJECT_DIR_ON" ]] && echo "    flag:    $PROJECT_DIR_ON"
        echo "  remove them yourself when done: rm -rf /tmp/ensemble-smoke-fv*"
        return 0
    fi
    rm -rf "$PROJECT_DIR_OFF" "$PROJECT_DIR_ON"
}
trap cleanup EXIT INT TERM

# Internal per-run timeouts. Both must stay BELOW the runner's per-scenario cap
# in run-smoke.sh (their sum, plus scaffolding) and ABOVE what the shipped
# models actually take. implement-one-task measured 341s for a bare
# `/implement-trd` (test/smoke/baseline.json), so 840s is ~2.5x headroom for
# run 1. Run 2 additionally pays for the Step 3.6 derive pass AND Step 8's
# verification loop (up to `cap: 3` iterations, each an exerciser + a judge and
# possibly a debugger), so it gets its own, larger budget — sizing it the same
# as run 1 would produce a SIGTERM that reads as a behavioral failure but is
# purely the clock. Raise these and SCENARIO_TIMEOUT[verify-functional]
# together, and never lower the model instead.
# Measured 2026-08-19 on the first real run of this scenario: the flag run, which
# does strictly MORE work (derive pass + verification loop on top of the same
# implement loop), completed in 1471s. The no-flag run was killed at 840s having
# not finished, so the base loop alone needs more than that on this fixture. 840
# was extrapolated from implement-one-task's 341s in baseline.json; this TRD is
# heavier. Both arms now get the same budget.
TIMEOUT_OFF=1500
TIMEOUT_ON=1500

SESSION_FILE_OFF="${PROJECT_DIR_OFF}/.session.jsonl"
RUN_SCAFFOLD_OK=false
run_implement_trd "$PROJECT_DIR_OFF" "$SESSION_FILE_OFF" "/implement-trd ${TRD_REL}" "$TIMEOUT_OFF"
RUN_OFF_RC=$?
# Scaffolding failed: nothing downstream can mean anything. Report the one real
# failure rather than a cascade of misleading missing-file assertions. (A
# global flag, not the return code — the function also returns claude's exit
# code, which must not be confused with a scaffold failure.)
if [[ "$RUN_SCAFFOLD_OK" != "true" ]]; then
    smoke_finish
fi

# AC-6 / FV-P001 is "no `.trd-state/*/success-definition.md` appears" — glob the
# whole tree rather than only the feature dir this scenario expects, so a
# definition written under an unexpected feature slug is caught instead of
# silently passing.
SD_OFF_FOUND="$(find "${PROJECT_DIR_OFF}/.trd-state" -name success-definition.md 2>/dev/null | head -1)"
if [[ -n "$SD_OFF_FOUND" ]]; then
    assert_fail_raw "no success-definition.md without --verify (found: $SD_OFF_FOUND)"
elif [[ "$RUN_OFF_RC" -ne 0 ]]; then
    # VACUOUS-PASS GUARD, and it caught itself on 2026-08-19. The baseline run
    # hit the timeout (exit 124) and was killed mid-loop, so of course no
    # definition existed -- and this assertion PASSED, reporting AC-6 proven by
    # a run that never reached the point where a definition could be written.
    # Absence only means something when the run got far enough to produce one.
    assert_fail_raw "no success-definition.md without --verify — INCONCLUSIVE: the baseline run exited $RUN_OFF_RC (124 = timeout) so absence proves nothing"
else
    assert_pass_raw "no success-definition.md without --verify"
fi

# =============================================================================
# Run 2: WITH --verify
# =============================================================================

SESSION_FILE_ON="${PROJECT_DIR_ON}/.session.jsonl"
RUN_SCAFFOLD_OK=false
run_implement_trd "$PROJECT_DIR_ON" "$SESSION_FILE_ON" "/implement-trd ${TRD_REL} --verify" "$TIMEOUT_ON"
if [[ "$RUN_SCAFFOLD_OK" != "true" ]]; then
    smoke_finish
fi

STATE_DIR="${PROJECT_DIR_ON}/.trd-state/${FEATURE}"
DEFINITION_FILE="${STATE_DIR}/success-definition.md"
STATE_FILE="${STATE_DIR}/verification-state.json"
REPORT_FILE="${STATE_DIR}/verification-report.md"

assert_file_nonempty "$DEFINITION_FILE" "success-definition.md was written and non-empty"
assert_file_nonempty "$STATE_FILE" "verification-state.json was written and non-empty"
assert_file_nonempty "$REPORT_FILE" "verification-report.md was written and non-empty"

# Every data row of success-definition.md's table (§3.1) must carry a Cites
# value or the literal `domain-derived` label -- and every ID that survives
# must be named somewhere in the rendered report (renderReport() lists every
# criterion across its Met/Not Met/Not Verifiable/Unbuilt sections).
if [[ -f "$DEFINITION_FILE" ]]; then
    # Collect data rows. `mapfile` is bash 4+ only and leaves the array UNSET
    # (fatal under `set -u`) on zero matches in some 4.x releases — a read loop
    # with an explicit init is safe everywhere and behaves identically.
    #
    # The ID cell must contain at least one alphanumeric and must not be the
    # literal `ID`: the GFM separator row is written `|----|` by the contract's
    # own example but LLM-authored files also emit `| --- | --- |`, which a
    # `[A-Za-z0-9_.-]+` class matches — yielding a phantom criterion whose ID
    # and Cites are both `---`. That row PASSES every check below (a markdown
    # report always contains `---`), so it is a vacuous pass, not a visible
    # failure. Reject it structurally.
    FS_ROWS=()
    while IFS= read -r _row; do
        [[ -n "$_row" ]] && FS_ROWS+=("$_row")
    done < <(grep -E '^\|[[:space:]]*[A-Za-z0-9_.-]*[A-Za-z0-9][A-Za-z0-9_.-]*[[:space:]]*\|' "$DEFINITION_FILE" \
             | grep -Ev '^\|[[:space:]]*ID[[:space:]]*\|')
    if [[ "${#FS_ROWS[@]}" -eq 0 ]]; then
        # AC-3: zero rows is a legitimate outcome, but it must be recorded
        # explicitly, not silently -- and it is out of scope for FR-1's
        # single citable requirement, so treat it as a finding, not a pass.
        assert_contains "$DEFINITION_FILE" '**Criteria**: 0' \
            "empty definition (0 rows) is explicitly recorded, if produced"
    else
        for row in "${FS_ROWS[@]}"; do
            fs_id="$(echo "$row" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')"
            cites="$(echo "$row" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $4); print $4}')"
            if [[ -n "$fs_id" && -n "$cites" ]]; then
                assert_pass_raw "criterion ${fs_id} carries a Cites value ('${cites}')"
            else
                assert_fail_raw "criterion row has an empty ID or Cites column: ${row}"
            fi
            if [[ -n "$fs_id" ]]; then
                assert_contains "$REPORT_FILE" "$fs_id" "verification-report.md names criterion ${fs_id}"
            fi
            # AC-2, the DROP half. Until 2026-08-19 the fixture was a
            # one-requirement PRD with nothing uncitable in it, so "a row that can
            # neither cite nor be labelled domain-derived is DROPPED, not invented"
            # had nothing to bite on -- /audit-build reported it as a traceability
            # gap on exactly that ground. The PRD now carries a non-normative
            # Aspirations section ("warm and modern", "pleasant to work with"),
            # which is precisely the shape a deriving agent promotes into an
            # acceptance criterion. No row may be built from it.
            if printf '%s' "$row" | grep -qiE 'warm|modern|pleasant'; then
                assert_fail_raw "criterion ${fs_id} was promoted from the non-normative Aspirations section: ${row}"
            else
                assert_pass_raw "criterion ${fs_id} was not promoted from a non-normative aspiration"
            fi
        done
    fi
else
    assert_fail_raw "success-definition.md not found, cannot check Cites/domain-derived rows"
fi

# verification-state.json (§3.3a/D9): iteration number + per-criterion status.
if [[ -f "$STATE_FILE" ]]; then
    ITERATION_VAL="$(jq -r '.iteration' "$STATE_FILE" 2>/dev/null)"
    if [[ "$ITERATION_VAL" =~ ^[0-9]+$ ]]; then
        assert_pass_raw "verification-state.json carries a numeric iteration (${ITERATION_VAL})"
    else
        assert_fail_raw "verification-state.json .iteration is not a number (got: ${ITERATION_VAL})"
    fi

    # Establish that `.criteria` IS an array before counting statuses. Without
    # this, a state file with no `criteria` key at all makes `[.criteria[]?]`
    # yield zero and the status check pass having examined nothing — green for
    # a check that never ran, the exact defect class this scenario exists for.
    if jq -e '.criteria | type == "array"' "$STATE_FILE" >/dev/null 2>&1; then
        assert_pass_raw "verification-state.json carries a criteria array"

        CRIT_COUNT="$(jq '.criteria | length' "$STATE_FILE" 2>/dev/null)"
        MISSING_STATUS="$(jq '[.criteria[] | select(.status == null or .status == "")] | length' "$STATE_FILE" 2>/dev/null)"
        if [[ "$MISSING_STATUS" == "0" ]]; then
            assert_pass_raw "every criterion in verification-state.json carries a status (${CRIT_COUNT} total)"
        else
            assert_fail_raw "verification-state.json has ${MISSING_STATUS} criteria missing a status"
        fi
    else
        assert_fail_raw "verification-state.json has no .criteria array (cannot check per-criterion status)"
    fi
fi

smoke_finish
