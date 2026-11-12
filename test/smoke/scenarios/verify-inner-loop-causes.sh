#!/usr/bin/env bash
# =============================================================================
# verify-inner-loop-causes - Scenario: the inner loop re-checks one representative
#                            per fixed cause (CAUSE-T001, D23)
# =============================================================================
#
# Proves, with a live Judge and Debug, that /verify-build's second iteration exercises only
# the representative of the cause Debug fixed, not every open criterion
# (docs/TRD/targeted-inner-loop-by-shared-cause.md, O9).
#
#   Fixture: a success definition PRE-SEEDED with six criteria over two root causes:
#     Cause A (fixable)  FS-1..FS-3 all go through `norm()` in src/text/norm.js, which does not
#                        trim or collapse whitespace. One edit fixes all three.
#     Cause B (frozen)   FS-4..FS-6 all go through `fold()` in src/legacy/fold.js, which drops
#                        its first element. The file carries a FROZEN header, so Debug leaves it.
#   One /verify-build run, default cap. Iteration 1 exercises all six; Debug fixes A and not B;
#   iteration 2 should exercise A's representative alone.
#
#   The grouping is the live Judge's, not the fixture's: the seed fixes which criteria exist, not
#   their causeKeys. If the Judge groups them differently, or Debug touches the frozen file, the
#   scenario reports a named INCONCLUSIVE rather than a pass.
#
# Evidence: when SMOKE_EVIDENCE_DIR is set, the report, state file and transcript are
# copied there before the scratch project is removed.
#
# opt-in (LLM_OPT_IN_SCENARIOS) -- skips when `claude`, `jq` or `python3` is unavailable.
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
if ! command -v python3 &>/dev/null; then
    smoke_skip "python3 not installed"
fi

FEATURE="smoke-causes"
TASK_ID="SMOKE-CAUSES-001"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
VERIFICATION_MD_REL=".claude/rules/verification.md"
SHIPPED_VERIFICATION_MD="${REPO_ROOT}/packages/core/templates/claude-directory/rules/verification.md"
GROUP_A="FS-1 FS-2 FS-3"
GROUP_B="FS-4 FS-5 FS-6"

smoke_write_causes_prd() {
    local prd_path="$1"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${FEATURE} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke fixture for the targeted inner loop scenario.

## 2. Functional Requirements

- FR-1: \`slugify(text)\` trims the text, collapses runs of spaces, lowercases it and joins words with hyphens.
- FR-2: \`handle(text)\` returns \`@\` followed by the slug of the text.
- FR-3: \`tag(text)\` returns \`#\` followed by the slug of the text.
- FR-4: \`sum(list)\` returns the sum of the numbers in the list.
- FR-5: \`mean(list)\` returns the average of the numbers in the list.
- FR-6: \`max(list)\` returns the largest number in the list.

## 3. Non-Goals

- Anything beyond these six requirements.
EOF
}

smoke_write_causes_trd() {
    local trd_path="$1"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${FEATURE} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${PRD_REL}\`

## 1. Overview

### 1.1 Technical Summary

Fixture TRD. \`src/text/\` and \`src/legacy/\` already exist; the task list covers only the
text modules.

## 4. Master Task List

### 4.1 Phase 1 — Single task

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${TASK_ID} | Provide \`src/text/slugify.js\`, \`src/text/handle.js\` and \`src/text/tag.js\`. | FR-1, FR-2, FR-3 | | None | \`slugify('  A  B ')\` returns \`'a-b'\`. |

## 5. Execution Plan

### 5.1 Phase 1 — Single task

\`${TASK_ID}\` only.

## 6. Quality Requirements

- FR-1: \`slugify('  A  B ')\` returns \`'a-b'\`.

## 7. Risk Assessment

None.

## 8. Non-Goals

- Anything beyond the listed task.
EOF
}

smoke_write_causes_code() {
    local d="$1"
    mkdir -p "${d}/src/text" "${d}/src/legacy"
    # Cause A: the shared helper is wrong (no trim, no whitespace collapse). Fixable.
    cat > "${d}/src/text/norm.js" <<'EOF'
// Shared by slugify, handle and tag.
module.exports.norm = (text) => text.toLowerCase().replace(/ /g, '-');
EOF
    cat > "${d}/src/text/slugify.js" <<'EOF'
const { norm } = require('./norm');
module.exports.slugify = (text) => norm(text);
EOF
    cat > "${d}/src/text/handle.js" <<'EOF'
const { norm } = require('./norm');
module.exports.handle = (text) => '@' + norm(text);
EOF
    cat > "${d}/src/text/tag.js" <<'EOF'
const { norm } = require('./norm');
module.exports.tag = (text) => '#' + norm(text);
EOF
    # Cause B: the shared fold drops its first element. Frozen, so Debug is told not to edit it.
    cat > "${d}/src/legacy/fold.js" <<'EOF'
// FROZEN: vendored from the legacy billing service. Owner-governed; do NOT modify this file.
module.exports.fold = (list, f, init) => list.slice(1).reduce(f, init);
EOF
    cat > "${d}/src/legacy/stats.js" <<'EOF'
// FROZEN: vendored from the legacy billing service. Owner-governed; do NOT modify this file.
const { fold } = require('./fold');
module.exports.sum = (list) => fold(list, (a, b) => a + b, 0);
module.exports.mean = (list) => module.exports.sum(list) / list.length;
module.exports.max = (list) => fold(list, (a, b) => Math.max(a, b), -Infinity);
EOF
}

# The fixture's own verification.md: the CURRENT template with the local row narrowed.
# Never this repository's verification.md (NG7).
smoke_write_causes_verification_md() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    python3 - "$SHIPPED_VERIFICATION_MD" "$path" <<'PYEOF'
import sys
text = open(sys.argv[1]).read()
text = text.replace("`http://localhost:3000` (`npm run dev`)", "fixture code only — no server, no network")
text = text.replace("| e.g. hot reload — nothing to run |", "| nothing — tests read the working tree |")
open(sys.argv[2], 'w').write(text)
PYEOF
}

smoke_write_causes_definition() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    local row_head="| [read] | locator | | |"
    cat > "$path" <<EOF
# Functional Success Definition: ${FEATURE}

**Source**: ${PRD_REL}
**Source kind**: prd
**Derived**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Criteria**: 6

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | \`slugify('  A  B ')\` returns \`a-b\` | FR-1 | Output of \`node -e "console.log(require('./src/text/slugify').slugify('  A  B '))"\` printing a-b ${row_head}
| FS-2 | \`handle('  Ann  Lee ')\` returns \`@ann-lee\` | FR-2 | Output of \`node -e "console.log(require('./src/text/handle').handle('  Ann  Lee '))"\` printing @ann-lee ${row_head}
| FS-3 | \`tag('  New  Year ')\` returns \`#new-year\` | FR-3 | Output of \`node -e "console.log(require('./src/text/tag').tag('  New  Year '))"\` printing #new-year ${row_head}
| FS-4 | \`sum([1, 2, 3])\` returns 6 | FR-4 | Output of \`node -e "console.log(require('./src/legacy/stats').sum([1,2,3]))"\` printing 6 ${row_head}
| FS-5 | \`mean([2, 4, 6])\` returns 4 | FR-5 | Output of \`node -e "console.log(require('./src/legacy/stats').mean([2,4,6]))"\` printing 4 ${row_head}
| FS-6 | \`max([9, 3, 5])\` returns 9 | FR-6 | Output of \`node -e "console.log(require('./src/legacy/stats').max([9,3,5]))"\` printing 9 ${row_head}
EOF
}

# SMOKE_PROJECT_DIR (optional): an absolute, empty-or-absent folder to use instead of a
# mktemp one, e.g. the verification.md fixtures slot inside the worktree. Needed where
# scaffolding under /tmp fails (cp chmod EPERM on setgid skill dirs).
if [[ -n "${SMOKE_PROJECT_DIR:-}" ]]; then
    PROJECT_DIR="$SMOKE_PROJECT_DIR"
else
    PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-causes.XXXXXX")"
fi

save_evidence() {
    [[ -n "${SMOKE_EVIDENCE_DIR:-}" ]] || return 0
    mkdir -p "$SMOKE_EVIDENCE_DIR"
    local f
    for f in "${PROJECT_DIR}/${STATE_DIR_REL}/verification-report.md" \
             "${PROJECT_DIR}/${STATE_DIR_REL}/verification-state.json"; do
        [[ -f "$f" ]] && cp "$f" "$SMOKE_EVIDENCE_DIR/"
    done
    [[ -f "${PROJECT_DIR}/.session.jsonl" ]] && cp "${PROJECT_DIR}/.session.jsonl" "${SMOKE_EVIDENCE_DIR}/session-transcript.jsonl"
    return 0
}

# PRESERVE THE SCRATCH PROJECT ON FAILURE (same rationale as verify-fix.sh).
cleanup() {
    save_evidence
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch project PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)): $PROJECT_DIR"
        echo "  remove it yourself when done: rm -rf $PROJECT_DIR"
        return 0
    fi
    rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT INT TERM

# Pays for one verification loop that can iterate 3 times with Debug; sized like
# verify-triage-kinds. run-smoke.sh's SCENARIO_TIMEOUT entry must stay above this.
TIMEOUT_RUN=1500

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project ($PROJECT_DIR)"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project ($PROJECT_DIR)"

smoke_write_causes_prd "${PROJECT_DIR}/${PRD_REL}"
smoke_write_causes_trd "${PROJECT_DIR}/${TRD_REL}"
smoke_write_causes_code "$PROJECT_DIR"
smoke_write_causes_verification_md "${PROJECT_DIR}/${VERIFICATION_MD_REL}"
smoke_write_causes_definition "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md"
assert_file_nonempty "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md" "pre-seeded success definition written"
assert_file_nonempty "${PROJECT_DIR}/${VERIFICATION_MD_REL}" "fixture verification.md written"
VERIFICATION_MD_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")"
FOLD_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/src/legacy/fold.js")"
STATS_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/src/legacy/stats.js")"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: inner-loop-causes fixture" --no-verify

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
smoke_claude "/verify-build ${TRD_REL}" "$TIMEOUT_RUN" "$PROJECT_DIR" "$SESSION_FILE"
RUN_RC=$?
assert_exit_code 0 "$RUN_RC" "claude --print exits 0 (/verify-build)"

if [[ "$RUN_RC" -ne 0 ]]; then
    assert_fail_raw "cause assertions — INCONCLUSIVE: run exited ${RUN_RC} (124 = timeout), so its content proves nothing"
    smoke_finish
fi

smoke_final_text "$SESSION_FILE" > "${PROJECT_DIR}/.final_text"
assert_tail_matches "${PROJECT_DIR}/.final_text" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner"

STATE_FILE="${PROJECT_DIR}/${STATE_DIR_REL}/verification-state.json"
REPORT_FILE="${PROJECT_DIR}/${STATE_DIR_REL}/verification-report.md"

if [[ ! -f "$STATE_FILE" || ! -f "$REPORT_FILE" ]]; then
    assert_fail_raw "verification-state.json / verification-report.md missing — INCONCLUSIVE"
    smoke_finish
fi
assert_pass_raw "state file and report written"

# A criterion's cause is read from the state file's top-level `causes` (each cause's key and
# members), never from the per-criterion `causeKey`: a criterion ruled met carries no causeKey,
# so a cause whose members were all proven met would otherwise read as ungrouped.
key_of() { jq -r --arg id "$1" '[(.causes // [])[] | select((.members // []) | index($id))][0].key // "none"' "$STATE_FILE" 2>/dev/null; }

# --- 1. The grouping is the Judge's: it must match the seed, or the run is INCONCLUSIVE. ---
read -r -a IDS_A <<< "$GROUP_A"
read -r -a IDS_B <<< "$GROUP_B"
KEY_A="$(key_of "${IDS_A[0]}")"
KEY_B="$(key_of "${IDS_B[0]}")"
GROUPING_OK=1
for id in "${IDS_A[@]}"; do
    [[ "$(key_of "$id")" == "$KEY_A" ]] || GROUPING_OK=0
done
for id in "${IDS_B[@]}"; do
    [[ "$(key_of "$id")" == "$KEY_B" ]] || GROUPING_OK=0
done
[[ "$KEY_A" != "none" && "$KEY_B" != "none" && "$KEY_A" != "$KEY_B" ]] || GROUPING_OK=0

CAUSE_COUNT="$(jq -r '(.causes // []) | length' "$STATE_FILE" 2>/dev/null)"
if [[ "$GROUPING_OK" -eq 1 && "$CAUSE_COUNT" == "2" ]]; then
    assert_pass_raw "causes holds two causes over the six criteria (A=${KEY_A}: ${GROUP_A}; B=${KEY_B}: ${GROUP_B})"
else
    got="$(jq -c '[(.causes // [])[] | {key, members}]' "$STATE_FILE" 2>/dev/null)"
    assert_fail_raw "grouping INCONCLUSIVE: the Judge did not group the criteria as seeded (expected ${GROUP_A} together and ${GROUP_B} together; causes=${CAUSE_COUNT}: ${got})"
    smoke_finish
fi

# --- 2. Iteration 1 walked everything; iteration 2 (not the confirmation entry) is targeted. ---
ex1="$(jq -r '[.exercised[]? | select(.iteration == 1 and ((.confirmation // false) | not))][0].ids // [] | sort | join(" ")' "$STATE_FILE" 2>/dev/null)"
want1="$(printf '%s\n' "${IDS_A[@]}" "${IDS_B[@]}" | sort | tr '\n' ' ' | sed 's/ $//')"
if [[ "$ex1" == "$want1" ]]; then
    assert_pass_raw "iteration 1 exercised all six criteria (${ex1})"
else
    assert_fail_raw "iteration 1 exercised [${ex1}], expected [${want1}] — INCONCLUSIVE"
fi

HAS_ITER2="$(jq -r '[.exercised[]? | select(.iteration == 2 and ((.confirmation // false) | not))] | length' "$STATE_FILE" 2>/dev/null)"
if [[ "$HAS_ITER2" != "1" ]]; then
    assert_fail_raw "no iteration-2 exercised entry (count ${HAS_ITER2}) — INCONCLUSIVE: the run never reached a second iteration; outcome $(jq -r '.outcome // "none"' "$STATE_FILE")"
    smoke_finish
fi

REP_A="$(jq -r --arg k "$KEY_A" '[.causes[] | select(.key == $k)][0].representative // "none"' "$STATE_FILE" 2>/dev/null)"
ex2="$(jq -r '[.exercised[] | select(.iteration == 2 and ((.confirmation // false) | not))][0].ids | sort | join(" ")' "$STATE_FILE" 2>/dev/null)"

# Frozen files: if Debug edited them, cause B's representative is addressed and iteration 2 is
# legitimately wider than expected.
FROZEN_TOUCHED=0
[[ "$(smoke_file_hash "${PROJECT_DIR}/src/legacy/fold.js")" == "$FOLD_HASH_BEFORE" ]] || FROZEN_TOUCHED=1
[[ "$(smoke_file_hash "${PROJECT_DIR}/src/legacy/stats.js")" == "$STATS_HASH_BEFORE" ]] || FROZEN_TOUCHED=1

# Split iteration 2's ids: the cause-A representative, B members (a miss), and anything else
# (evidence re-captures, named, not failed).
EXTRA=""; B_HITS=""
for id in $ex2; do
    [[ "$id" == "$REP_A" ]] && continue
    if [[ " ${GROUP_B} " == *" ${id} "* ]]; then B_HITS="${B_HITS} ${id}"; else EXTRA="${EXTRA} ${id}"; fi
done

if [[ " $ex2 " != *" ${REP_A} "* ]]; then
    assert_fail_raw "iteration 2 exercised [${ex2}] and did not include cause A's representative ${REP_A} — INCONCLUSIVE or defect"
elif [[ "$FROZEN_TOUCHED" -eq 1 ]]; then
    assert_fail_raw "iteration 2 exercised [${ex2}] — INCONCLUSIVE: Debug edited a FROZEN file, so cause B's representative was addressed"
elif [[ -n "$B_HITS" ]]; then
    assert_fail_raw "iteration 2 exercised [${ex2}] including cause B members [${B_HITS# }] that Debug left unfixed — not targeted"
elif [[ -n "$EXTRA" ]]; then
    assert_pass_raw "iteration 2 exercised cause A's representative ${REP_A} plus named evidence re-capture id(s) [${EXTRA# }]"
else
    assert_pass_raw "iteration 2 exercised cause A's representative ${REP_A} alone"
fi

# A's non-representative members were not walked in iteration 2.
for id in "${IDS_A[@]}"; do
    [[ "$id" == "$REP_A" ]] && continue
    if [[ " $ex2 " == *" ${id} "* ]]; then
        assert_fail_raw "iteration 2 re-exercised cause A member ${id} (not its representative)"
    else
        assert_pass_raw "cause A member ${id} not re-exercised in iteration 2"
    fi
done

# An autonomous run never edits the owner-governed file (the fixture's copy here).
if [[ "$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")" == "$VERIFICATION_MD_HASH_BEFORE" ]]; then
    assert_pass_raw "fixture verification.md byte-unchanged by the run"
else
    assert_fail_raw "fixture verification.md changed during the run"
fi

smoke_finish
