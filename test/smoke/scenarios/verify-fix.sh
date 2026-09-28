#!/usr/bin/env bash
# =============================================================================
# verify-fix - Scenario: /verify-build --fix (the recovery loop, VFIX)
# =============================================================================
#
# Exercises the NEW --fix recovery loop (docs/TRD/verification-fix-loop.md) on top
# of the base functional-verification loop verify-functional.sh already covers.
# ONE throwaway project, used for BOTH runs (unlike verify-functional.sh's two
# separate projects) -- the whole point of this scenario is state carrying over
# between them: the ledger row, the TRD amendment and implement.json's `fix.rounds`
# all live in the SAME feature directory across the two invocations.
#
#   Fixture: a PRD with two functional requirements. FR-1 (`greet()` returns
#   'hello') is implemented and tested; FR-2 (`farewell()` returns 'goodbye') is
#   named in the PRD but has NO corresponding TRD task and NO code at all --
#   deliberately biased toward the `not-built` cause (D4), never a mechanics
#   cause (`evidence-missing`/`locator-not-found`), per VFIX-T001's "Careful" note:
#   a mechanics cause would make round 1 of `--fix` report "nothing to build" and
#   never exercise the chained build this scenario exists to prove.
#
#   Run 1: `/verify-build <trd>` (no flag). Asserts the report's Diagnosis line
#   and its Next line naming `--fix`.
#
#   Hand-written bridge: `verification-plan.md` is written BY THIS SCRIPT, in
#   §3.4's exact shape, with `max-rounds: 1` -- the bridge (`verify-plan-recovery`)
#   is a chat and cannot run headless (VFIX-T001 grounding), so nothing here
#   invokes that skill. The plan's Slices row names the actual FR-2 criterion id
#   read back from Run 1's own verification-state.json, never guessed.
#
#   Run 2: `/verify-build <trd> --fix`. Asserts: the discovery ledger holds a row
#   with `ref` for the FR-2 criterion; the TRD gains one AMEND row whose Serves
#   names that criterion; the transcript holds exactly one COMMAND COMPLETE/STUCK
#   banner for /verify-build and NONE for /implement-trd (chained mode emits a
#   RETURN line, never a banner -- §3.3); implement.json's
#   `functional_verification.fix.rounds` holds exactly one entry (round 0 never
#   counts -- OQ-6); the report ends with `## Fix run`; and the scaffolded
#   project's `.claude/rules/verification.md` is still byte-identical to the
#   shipped template (D13/O6: an autonomous `--fix` run never edits it).
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

FEATURE="smoke-fix"
TASK_ID="SMOKE-FIX-001"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"

# smoke_write_vfix_prd <prd_path> <feature_name>
# Two requirements: FR-1 is implemented, FR-2 is deliberately NOT -- biased
# toward the `not-built` cause (D4), never a mechanics one (VFIX-T001 "Careful").
smoke_write_vfix_prd() {
    local prd_path="$1" feature_name="$2"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${feature_name} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke-test fixture PRD for the verify-fix (\`--fix\` recovery loop) scenario. Describes
two independent, trivially-checkable behaviors — one built, one not.

## 2. Functional Requirements

- FR-1: Calling \`greet()\` returns the exact string \`'hello'\`.
- FR-2: Calling \`farewell()\` returns the exact string \`'goodbye'\`.

## 3. Non-Goals

- Anything beyond these two functions. No CLI, no additional modules, no auth,
  no persistence.
EOF
}

# smoke_write_vfix_trd <trd_path> <task_id> <feature_name> <prd_rel>
# Deliberately names ONLY FR-1's task. FR-2 (farewell) has no task at all --
# it must be discovered by the verification loop and promoted as a NEW
# AMEND-* task, not reopened from a pre-existing one that reconcile would
# otherwise catch on its own (which would not exercise the ledger/AMEND path
# this scenario is built to prove).
smoke_write_vfix_trd() {
    local trd_path="$1" task_id="$2" feature_name="$3" prd_rel="$4"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${feature_name} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${prd_rel}\`

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD (verify-fix scenario). Adds a single trivial module,
\`src/greet.js\`, exporting a \`greet()\` function that returns the string
\`'hello'\`, satisfying FR-1. FR-2 (\`farewell()\`) is intentionally left
unplanned and unbuilt so the \`--fix\` loop must discover and promote it itself.

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

- Anything beyond the single \`greet()\` export named above. FR-2 (\`farewell()\`) is
  deliberately out of THIS task list — it is discovered by the verification loop.
EOF
}

# smoke_write_vfix_code <project_dir>
# FR-1 implemented and tested. FR-2 (farewell) has NO file at all.
smoke_write_vfix_code() {
    local project_dir="$1"
    mkdir -p "${project_dir}/src"
    cat > "${project_dir}/src/greet.js" <<'EOF'
module.exports.greet = () => 'hello';
EOF
    cat > "${project_dir}/src/greet.test.js" <<'EOF'
const { greet } = require('./greet');

test('greet returns hello', () => {
  expect(greet()).toBe('hello');
});
EOF
}

# run_verify_build_first <project_dir> <session_file> <timeout_secs>
# Scaffolds a fresh throwaway project, writes the PRD/TRD/code fixtures,
# commits, runs `claude --print "/verify-build <trd>"`, and returns claude's
# exit code. Leaves the final assistant message in "${project_dir}/.final_run1.txt".
run_verify_build_first() {
    local project_dir="$1" session_file="$2" timeout_s="$3"

    RUN_SCAFFOLD_OK=false
    if ! smoke_scaffold_project "$project_dir"; then
        assert_fail_raw "scaffold throwaway project ($project_dir)"
        return 1
    fi
    RUN_SCAFFOLD_OK=true
    assert_pass_raw "scaffold throwaway project ($project_dir)"

    smoke_write_vfix_prd "${project_dir}/${PRD_REL}" "$FEATURE"
    smoke_write_vfix_trd "${project_dir}/${TRD_REL}" "$TASK_ID" "$FEATURE" "$PRD_REL"
    smoke_write_vfix_code "$project_dir"
    git -C "$project_dir" add -A
    git -C "$project_dir" commit -q -m "smoke: add verify-fix fixture (FR-1 built, FR-2 not)" --no-verify

    assert_file_nonempty "${project_dir}/${PRD_REL}" "fixture PRD written ($PRD_REL)"
    assert_file_nonempty "${project_dir}/${TRD_REL}" "fixture TRD written ($TRD_REL)"
    assert_file_nonempty "${project_dir}/src/greet.js" "fixture greet.js written (FR-1)"
    if [[ -e "${project_dir}/src/farewell.js" ]]; then
        assert_fail_raw "fixture farewell.js must NOT exist (FR-2 must be unbuilt): found"
    else
        assert_pass_raw "fixture farewell.js correctly absent (FR-2 unbuilt by construction)"
    fi

    smoke_claude "/verify-build ${TRD_REL}" "$timeout_s" "$project_dir" "$session_file"
    local rc=$?
    assert_exit_code 0 "$rc" "claude --print exits 0 (run 1: /verify-build)"

    local final_text banner_file
    final_text="$(smoke_final_text "$session_file")"
    banner_file="${project_dir}/.final_run1.txt"
    printf '%s\n' "$final_text" > "$banner_file"
    assert_tail_matches "$banner_file" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
        "run 1 output ends with a COMMAND COMPLETE/STUCK banner"

    return "$rc"
}

# run_verify_build_fix <project_dir> <session_file> <timeout_secs>
# Runs `claude --print "/verify-build <trd> --fix"` in the SAME (already
# scaffolded, already fixture-committed) project. Leaves the final assistant
# message in "${project_dir}/.final_run2.txt" and the WHOLE session's
# concatenated assistant text in "${project_dir}/.all_run2.txt" (banner counting
# needs every turn, not just the last).
run_verify_build_fix() {
    local project_dir="$1" session_file="$2" timeout_s="$3"

    smoke_claude "/verify-build ${TRD_REL} --fix" "$timeout_s" "$project_dir" "$session_file"
    local rc=$?
    assert_exit_code 0 "$rc" "claude --print exits 0 (run 2: /verify-build --fix)"

    local final_text banner_file
    final_text="$(smoke_final_text "$session_file")"
    banner_file="${project_dir}/.final_run2.txt"
    printf '%s\n' "$final_text" > "$banner_file"
    assert_tail_matches "$banner_file" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
        "run 2 output ends with a COMMAND COMPLETE/STUCK banner"

    grep '^{' "$session_file" 2>/dev/null | jq -rs '
        [.[] | select(.type=="assistant")] |
        map((.message.content // [])[]? | select(.type=="text") | .text) | join("\n---\n")
    ' > "${project_dir}/.all_run2.txt" 2>/dev/null

    return "$rc"
}

# =============================================================================
# Single throwaway project, used for BOTH runs.
# =============================================================================

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-vfix.XXXXXX")"

# PRESERVE THE EVIDENCE ON FAILURE (verify-functional.sh's dated rationale,
# unchanged here: a scenario that destroys the state needed to diagnose its own
# failure can only ever tell you THAT something broke).
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch project PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)): $PROJECT_DIR"
        echo "  remove it yourself when done: rm -rf $PROJECT_DIR"
        return 0
    fi
    rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT INT TERM

# Internal per-run timeouts. Both must stay BELOW this scenario's own cap in
# run-smoke.sh's SCENARIO_TIMEOUT (their sum, plus scaffolding and fixture
# writes); raise all three together, never lower the model instead.
#
# Run 1 pays for: the foreground success-definition derive (product-manager,
# waited on synchronously — verify-build.md §3a, unlike Step 8's backgrounded
# derive) plus one verification loop (exercise + judge, up to cap:3 iterations).
# Sized like verify-functional.sh's TIMEOUT_ON (which pays for the same two
# stages via /implement-trd's own derive+verify).
#
# Run 2 (--fix) pays for MORE: steps 1-3c again, round 0 (a no-op chained
# build — the plan's Blockers table is empty — plus a re-verify), then round 1
# (record the FR-2 failure, chain `/implement-trd --reconcile --chained` to
# actually build farewell(), verify again, close the round). That is
# effectively one verify-functional pass PLUS one implement-one-task pass, so
# it gets the larger budget.
TIMEOUT_RUN1=1500
TIMEOUT_RUN2=1800

SESSION_FILE_1="${PROJECT_DIR}/.session-run1.jsonl"
RUN_SCAFFOLD_OK=false
run_verify_build_first "$PROJECT_DIR" "$SESSION_FILE_1" "$TIMEOUT_RUN1"
RUN1_RC=$?
# Scaffolding failed: nothing downstream can mean anything — report the one
# real failure rather than a cascade of misleading missing-file assertions.
if [[ "$RUN_SCAFFOLD_OK" != "true" ]]; then
    smoke_finish
fi

STATE_DIR="${PROJECT_DIR}/${STATE_DIR_REL}"
REPORT_FILE_1="${STATE_DIR}/verification-report.md"
STATE_FILE_1="${STATE_DIR}/verification-state.json"
LEDGER_FILE="${STATE_DIR}/discovered.jsonl"
IMPLEMENT_JSON="${STATE_DIR}/implement.json"
PLAN_FILE="${STATE_DIR}/verification-plan.md"
VERIFICATION_MD="${PROJECT_DIR}/.claude/rules/verification.md"
SHIPPED_VERIFICATION_MD="${REPO_ROOT}/packages/core/templates/claude-directory/rules/verification.md"

# =============================================================================
# Run 1 assertions: the Diagnosis + Next lines (VFIX-B001 D3, §3.1)
# =============================================================================

if [[ "$RUN1_RC" -ne 0 ]]; then
    # VACUOUS-PASS GUARD (verify-functional.sh's discipline): a killed/timed-out
    # run cannot have produced a meaningful report, so every downstream
    # assertion about ITS CONTENT is inconclusive, not a pass or a fail on the
    # feature under test.
    assert_fail_raw "run 1 report assertions — INCONCLUSIVE: run 1 exited ${RUN1_RC} (124 = timeout), so its content proves nothing"
elif [[ -f "$REPORT_FILE_1" ]]; then
    assert_pass_raw "verification-report.md written by run 1"
    if grep -qE '\*\*Diagnosis\*\*:' "$REPORT_FILE_1"; then
        assert_pass_raw "run 1 report carries a Diagnosis line"
    else
        assert_fail_raw "run 1 report has no Diagnosis line (only expected for stalled/stuck/unbuilt/insufficient-coverage outcomes)"
    fi
    if grep -qE '\*\*Next\*\*:.*--fix' "$REPORT_FILE_1"; then
        assert_pass_raw "run 1 report's Next line names --fix"
    else
        assert_fail_raw "run 1 report has no Next line naming --fix"
    fi
else
    assert_fail_raw "verification-report.md not found after run 1, cannot check Diagnosis/Next"
fi

# =============================================================================
# Hand-write the bridge's output: verification-plan.md, in §3.4's exact shape.
# The bridge (verify-plan-recovery) is a chat and cannot run headless
# (VFIX-T001 grounding) -- this substitutes for it deliberately.
# =============================================================================

# FR-2's criterion is the success-definition row about farewell(); the state file carries ids
# but not statements. Taking "the first non-met criterion" instead could pick FR-1 if the judge
# also failed it, and every downstream check would then validate the wrong amendment.
CRIT_ID=""
DEFINITION_FILE_1="${STATE_DIR}/success-definition.md"
if [[ -f "$DEFINITION_FILE_1" && -f "$STATE_FILE_1" ]]; then
    CRIT_ID="$(grep -E '^\|[[:space:]]*FS-[0-9]+' "$DEFINITION_FILE_1" | grep -i 'farewell' | head -1 \
        | sed -E 's/^\|[[:space:]]*(FS-[0-9]+).*/\1/')"
    if [[ -n "$CRIT_ID" ]]; then
        CRIT_STATUS="$(jq -r --arg id "$CRIT_ID" '.criteria[] | select(.id == $id) | .status' "$STATE_FILE_1" 2>/dev/null | head -1)"
        if [[ "$CRIT_STATUS" == "met" ]]; then
            assert_fail_raw "FR-2's criterion ${CRIT_ID} is already met after run 1 — the fixture should leave it unbuilt"
            CRIT_ID=""
        fi
    fi
fi

if [[ -z "$CRIT_ID" ]]; then
    assert_fail_raw "could not read a non-met criterion id from run 1's verification-state.json — INCONCLUSIVE from here on (cannot write a plan naming FR-2's criterion, cannot check the ledger/AMEND ref downstream)"
else
    assert_pass_raw "read FR-2's non-met criterion id from run 1's state file ($CRIT_ID)"
fi

mkdir -p "$STATE_DIR"
cat > "$PLAN_FILE" <<EOF
# Verification plan: ${FEATURE}

**Written**: $(date -u +%Y-%m-%dT%H:%M:%SZ) by verify-plan-recovery
**From run**: unbuilt at 1/2, report \`${STATE_DIR_REL}/verification-report.md\`

## Blockers
| ID | Blocker | Files | After | Unblocks |
|----|---------|-------|-------|----------|
| none | | | | |

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | farewell | ${CRIT_ID:-none} |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| none | | |

## Accepted as not verifiable
| Criterion | Ruling | Why |
|-----------|--------|-----|
| none | | |

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 1
stop-when-closed-below: 1
always: stop when nothing is left to build
EOF

assert_file_nonempty "$PLAN_FILE" "hand-written verification-plan.md exists"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: hand-write verification-plan.md (bridge substitute)" --no-verify

# =============================================================================
# Run 2: /verify-build --fix
# =============================================================================

SESSION_FILE_2="${PROJECT_DIR}/.session-run2.jsonl"
run_verify_build_fix "$PROJECT_DIR" "$SESSION_FILE_2" "$TIMEOUT_RUN2"
RUN2_RC=$?

if [[ "$RUN2_RC" -ne 0 ]]; then
    assert_fail_raw "run 2 (--fix) assertions — INCONCLUSIVE: run 2 exited ${RUN2_RC} (124 = timeout), so its content proves nothing"
    smoke_finish
fi

# --- Ledger: a row with `ref` for the FR-2 criterion (D5, §3.2) ------------
if [[ -n "$CRIT_ID" ]]; then
    if [[ -f "$LEDGER_FILE" ]]; then
        LEDGER_REF_COUNT="$(jq -s --arg id "$CRIT_ID" '[.[] | select(.ref == $id)] | length' "$LEDGER_FILE" 2>/dev/null)"
        if [[ "$LEDGER_REF_COUNT" =~ ^[0-9]+$ ]] && (( LEDGER_REF_COUNT >= 1 )); then
            assert_pass_raw "discovery ledger holds a row with ref=${CRIT_ID} (${LEDGER_REF_COUNT})"
        else
            assert_fail_raw "discovery ledger has no row with ref=${CRIT_ID}"
        fi
    else
        assert_fail_raw "discovered.jsonl not found after run 2, cannot check the ${CRIT_ID} ref row"
    fi
else
    assert_fail_raw "ledger ref check skipped — INCONCLUSIVE (no criterion id was available from run 1)"
fi

# --- TRD: one AMEND row whose Serves names the FR-2 criterion --------------
TRD_FILE="${PROJECT_DIR}/${TRD_REL}"
if [[ -n "$CRIT_ID" && -f "$TRD_FILE" ]]; then
    AMEND_ROWS="$(grep -E '^\|[[:space:]]*AMEND-' "$TRD_FILE" || true)"
    # Read the Serves CELL, located by the nearest preceding table header -- an id appearing in
    # the description or acceptance text alone must not count.
    # Serves may carry the criterion (`criterion FS-n`, promoteToTrd's default) or the PRD
    # requirement it verifies (FR-2) when the caller passes one -- the TRD's §3.2 lets a caller's
    # value win, and the first live run did exactly that. Either is correct provenance.
    SERVES_OK="$(python3 - "$TRD_FILE" "$CRIT_ID|FR-2" <<'PYEOF'
import re, sys
cells = lambda l: [c.strip() for c in re.split(r'(?<!\\)\|', l.strip())[1:-1]]
serves_col, hit = None, False
for line in open(sys.argv[1]):
    if not line.lstrip().startswith('|'):
        continue
    row = cells(line)
    if 'Serves' in row:
        serves_col = row.index('Serves')
    elif row and row[0].startswith('AMEND-') and serves_col is not None and serves_col < len(row):
        if any(re.search(r'\b' + re.escape(t) + r'\b', row[serves_col]) for t in sys.argv[2].split('|')):
            hit = True
print('yes' if hit else 'no')
PYEOF
)"
    if [[ "$SERVES_OK" == "yes" ]]; then
        assert_pass_raw "TRD gained an AMEND row whose Serves cell names ${CRIT_ID} or FR-2"
    else
        assert_fail_raw "no AMEND-* row has ${CRIT_ID} or FR-2 in its Serves cell"
    fi
    AMEND_ROW_COUNT="$(printf '%s\n' "$AMEND_ROWS" | grep -cE '^\|[[:space:]]*AMEND-' || true)"
    if [[ "${AMEND_ROW_COUNT:-0}" -eq 1 ]]; then
        assert_pass_raw "TRD gained exactly one AMEND row (${AMEND_ROW_COUNT})"
    else
        assert_fail_raw "TRD has ${AMEND_ROW_COUNT:-0} AMEND-* rows, expected exactly 1"
    fi
else
    assert_fail_raw "TRD AMEND-row check skipped — INCONCLUSIVE (no criterion id, or TRD file missing)"
fi

# --- Transcript: exactly one COMMAND COMPLETE/STUCK banner, for /verify-build,
#     and NONE for /implement-trd (--chained emits a RETURN line, never a
#     banner — §3.3) -------------------------------------------------------
ALL_TEXT_FILE="${PROJECT_DIR}/.all_run2.txt"
if [[ -f "$ALL_TEXT_FILE" ]]; then
    VB_BANNERS="$(grep -cE '═══ COMMAND (COMPLETE|STUCK): /verify-build ═══' "$ALL_TEXT_FILE" || true)"
    IT_BANNERS="$(grep -cE '═══ COMMAND (COMPLETE|STUCK): /implement-trd ═══' "$ALL_TEXT_FILE" || true)"
    if [[ "${VB_BANNERS:-0}" -eq 1 ]]; then
        assert_pass_raw "exactly one /verify-build COMMAND COMPLETE/STUCK banner in run 2 (${VB_BANNERS})"
    else
        assert_fail_raw "run 2 transcript carries ${VB_BANNERS:-0} /verify-build banners, expected exactly 1"
    fi
    if [[ "${IT_BANNERS:-0}" -eq 0 ]]; then
        assert_pass_raw "no /implement-trd banner anywhere in run 2's transcript (chained mode correctly suppressed it)"
    else
        assert_fail_raw "run 2 transcript carries ${IT_BANNERS} /implement-trd banner(s) — --chained must never emit one"
    fi
else
    assert_fail_raw "could not extract run 2's full assistant transcript, cannot count banners"
fi

# --- implement.json: functional_verification.fix.rounds has one entry ------
if [[ -f "$IMPLEMENT_JSON" ]]; then
    if jq -e '.functional_verification.fix.rounds | type == "array"' "$IMPLEMENT_JSON" >/dev/null 2>&1; then
        ROUNDS_LEN="$(jq '.functional_verification.fix.rounds | length' "$IMPLEMENT_JSON" 2>/dev/null)"
        if [[ "$ROUNDS_LEN" == "1" ]]; then
            assert_pass_raw "implement.json's functional_verification.fix.rounds holds exactly one entry"
        else
            assert_fail_raw "implement.json's functional_verification.fix.rounds holds ${ROUNDS_LEN} entries, expected 1"
        fi
    else
        assert_fail_raw "implement.json has no functional_verification.fix.rounds array"
    fi
else
    assert_fail_raw "implement.json not found after run 2, cannot check functional_verification.fix.rounds"
fi

# --- Report ends with "## Fix run" (D10) -----------------------------------
if [[ -f "$REPORT_FILE_1" ]]; then
    if grep -qF '## Fix run' "$REPORT_FILE_1"; then
        assert_pass_raw "verification-report.md carries a ## Fix run section"
    else
        assert_fail_raw "verification-report.md has no ## Fix run section after run 2"
    fi
    LAST_HEADING="$(grep -E '^#{1,2} ' "$REPORT_FILE_1" | tail -1)"
    if [[ "$LAST_HEADING" == "## Fix run" ]]; then
        assert_pass_raw "## Fix run is the report's LAST top-level/second-level section"
    else
        assert_fail_raw "report's last heading is '${LAST_HEADING}', expected '## Fix run'"
    fi
else
    assert_fail_raw "verification-report.md not found after run 2, cannot check ## Fix run"
fi

# --- FR-2 is actually met after run 2 ----------------------------------------
# A COMPLETE banner and a ## Fix run section can both appear when max-rounds stops the run with
# FR-2 still open; only the final state says whether the fix round closed the gap.
if [[ -n "$CRIT_ID" && -f "$STATE_FILE_1" ]]; then
    FINAL_STATUS="$(jq -r --arg id "$CRIT_ID" '.criteria[] | select(.id == $id) | .status' "$STATE_FILE_1" 2>/dev/null | head -1)"
    if [[ "$FINAL_STATUS" == "met" ]]; then
        assert_pass_raw "FR-2's criterion ${CRIT_ID} is met after run 2"
    else
        assert_fail_raw "FR-2's criterion ${CRIT_ID} is '${FINAL_STATUS:-absent}' after run 2, expected met"
    fi
else
    assert_fail_raw "FR-2 final-status check skipped — INCONCLUSIVE (no criterion id or state file)"
fi

# --- .claude/rules/verification.md is byte-unchanged (O6, NG7) -------------
if [[ -f "$VERIFICATION_MD" && -f "$SHIPPED_VERIFICATION_MD" ]]; then
    if cmp -s "$VERIFICATION_MD" "$SHIPPED_VERIFICATION_MD"; then
        assert_pass_raw ".claude/rules/verification.md is still byte-identical to the shipped template"
    else
        assert_fail_raw ".claude/rules/verification.md was modified — an autonomous --fix run must never edit it (O6, NG7)"
    fi
else
    assert_fail_raw "verification.md check skipped — file missing in the scaffolded project or the shipped template"
fi

smoke_finish
