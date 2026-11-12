#!/usr/bin/env bash
# =============================================================================
# verify-regression-pass - Scenario: the end-of-run regression pass catches a fix that
#                          broke an earlier-met criterion (REGR-T001, D17)
# =============================================================================
#
# Proves, with a live Judge and Debug, that /verify-build's closing regression pass re-checks
# the earlier-met criterion whose covered file a Debug fix changed, catches it when the fix
# broke it, and does NOT re-walk the met criteria whose covered files nothing edited
# (docs/TRD/one-full-regression-pass-at-the-end.md, O1-O3, O5, O8, O9).
#
#   Fixture: a success definition PRE-SEEDED with four criteria, a fixture TRD whose Objectives
#   table and Task Grounding Touches let `live-evidence.js derive-criteria` map every criterion
#   to the files it depends on:
#     FS-1  invoice totals show two decimals ("$10.00")      covers invoice.js + format.js
#           -> BROKEN at the start: format.js prints "$10". Debug is expected to fix format.js.
#     FS-2  receipt lines show whole dollars ("$5")          covers receipt.js + format.js
#           -> MET at the start, through the same format.js. A two-decimal fix to format.js
#              breaks it: invoice.js and receipt.js are FROZEN, so the shared formatter is the
#              only file Debug may edit and it cannot satisfy both.
#     FS-3  slugify('  A  B ') is "a-b"                       covers src/text/slugify.js
#     FS-4  sum([1, 2, 3]) is 6                               covers src/stats/sum.js
#           -> FS-3 and FS-4 are MET and no Debug edit touches their files.
#   One /verify-build run, default cap. Expected: iteration 1 exercises all four; Debug edits
#   format.js; iteration 2 exercises FS-1 (met); the regression pass re-checks FS-1 (it was the
#   fixed cause) and FS-2 (covers-changed), catches FS-2, and leaves FS-3 and FS-4 unwalked.
#
#   The live model decides what Debug edits and how the Judge rules, not the fixture. A run where
#   the setup did not happen (Debug left format.js alone, edited a frozen file, fixed FS-1
#   without breaking FS-2, or reported its changes as unknown) is a named INCONCLUSIVE, never a
#   pass. A regression pass that did not behave as designed given the setup is a FAIL.
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

FEATURE="smoke-regression"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
VERIFICATION_MD_REL=".claude/rules/verification.md"
SHIPPED_VERIFICATION_MD="${REPO_ROOT}/packages/core/templates/claude-directory/rules/verification.md"
VICTIM_ID="FS-2"      # met early, covers the file Debug edits
UNTOUCHED_IDS="FS-3 FS-4"

smoke_write_regression_prd() {
    local prd_path="$1"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${FEATURE} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke fixture for the regression pass scenario.

## 2. Functional Requirements

- FR-1: \`total(items)\` in \`src/money/invoice.js\` returns the sum of the amounts shown with two decimals, for example \`\$10.00\`.
- FR-2: \`line(amount)\` in \`src/money/receipt.js\` returns the amount shown in whole dollars, for example \`\$5\`.
- FR-3: \`slugify(text)\` trims the text, collapses runs of spaces, lowercases it and joins words with hyphens.
- FR-4: \`sum(list)\` returns the sum of the numbers in the list.

## 3. Non-Goals

- Anything beyond these four requirements.
EOF
}

# The Objectives table, the Serves column and the Task Grounding Touches lines are what
# `derive-criteria` reads; without them every criterion would have no covers and the pass would
# re-check all of them, which defeats the "untouched met criteria are not re-walked" assertion.
smoke_write_regression_trd() {
    local trd_path="$1"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${FEATURE} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${PRD_REL}\`

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Invoice totals show two decimals. | FR-1 | |
| O2 | Receipt lines show whole dollars. | FR-2 | |
| O3 | Slugs are trimmed, collapsed and hyphenated. | FR-3 | |
| O4 | Sums add up. | FR-4 | |

## 1. Overview

### 1.1 Technical Summary

Fixture TRD. The modules under \`src/\` already exist; the task list covers only the four
requirements. \`src/money/invoice.js\` and \`src/money/receipt.js\` are vendored and frozen.

## 4. Master Task List

### 4.1 Phase 1 — Four tasks

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| RGX-001 | Invoice totals via \`src/money/invoice.js\` and \`src/money/format.js\`. | O1 | | None | \`total([4, 6])\` returns \`\$10.00\`. |
| RGX-002 | Receipt lines via \`src/money/receipt.js\` and \`src/money/format.js\`. | O2 | | None | \`line(5)\` returns \`\$5\`. |
| RGX-003 | Slugs via \`src/text/slugify.js\`. | O3 | | None | \`slugify('  A  B ')\` returns \`a-b\`. |
| RGX-004 | Sums via \`src/stats/sum.js\`. | O4 | | None | \`sum([1, 2, 3])\` returns \`6\`. |

## 5. Execution Plan

### 5.1 Phase 1 — Four tasks

\`RGX-001\` to \`RGX-004\`, independent.

## 6. Quality Requirements

- FR-1: \`total([4, 6])\` returns \`\$10.00\`.

## 7. Risk Assessment

None.

## 8. Non-Goals

- Anything beyond the listed tasks.

## 9. Task Grounding

### RGX-001
- **Touches:** \`src/money/invoice.js\`, \`src/money/format.js\`

### RGX-002
- **Touches:** \`src/money/receipt.js\`, \`src/money/format.js\`

### RGX-003
- **Touches:** \`src/text/slugify.js\`

### RGX-004
- **Touches:** \`src/stats/sum.js\`
EOF
}

smoke_write_regression_code() {
    local d="$1"
    mkdir -p "${d}/src/money" "${d}/src/text" "${d}/src/stats"
    # The shared formatter: prints whole dollars, so invoice totals lack their two decimals (FS-1
    # fails) while receipt lines are right (FS-2 passes). Editing it for one breaks the other.
    cat > "${d}/src/money/format.js" <<'EOF'
// Shared by invoice.js and receipt.js.
module.exports.fmt = (amount) => '$' + amount;
EOF
    cat > "${d}/src/money/invoice.js" <<'EOF'
// FROZEN: vendored from the legacy billing service. Owner-governed; do NOT modify this file.
const { fmt } = require('./format');
module.exports.total = (items) => fmt(items.reduce((a, b) => a + b, 0));
EOF
    cat > "${d}/src/money/receipt.js" <<'EOF'
// FROZEN: vendored from the legacy billing service. Owner-governed; do NOT modify this file.
const { fmt } = require('./format');
module.exports.line = (amount) => fmt(amount);
EOF
    cat > "${d}/src/text/slugify.js" <<'EOF'
module.exports.slugify = (text) => text.trim().toLowerCase().split(/\s+/).join('-');
EOF
    cat > "${d}/src/stats/sum.js" <<'EOF'
module.exports.sum = (list) => list.reduce((a, b) => a + b, 0);
EOF
}

# The fixture's own verification.md: the CURRENT template with the local row narrowed.
# Never this repository's verification.md (NG7).
smoke_write_regression_verification_md() {
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

smoke_write_regression_definition() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    local row_head="| [read] | locator | | |"
    cat > "$path" <<EOF
# Functional Success Definition: ${FEATURE}

**Source**: ${PRD_REL}
**Source kind**: prd
**Derived**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Criteria**: 4

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | \`total([4, 6])\` returns \`\$10.00\` | FR-1, O1 | Output of \`node -e "console.log(require('./src/money/invoice').total([4,6]))"\` printing \$10.00 ${row_head}
| FS-2 | \`line(5)\` returns \`\$5\` | FR-2, O2 | Output of \`node -e "console.log(require('./src/money/receipt').line(5))"\` printing \$5 ${row_head}
| FS-3 | \`slugify('  A  B ')\` returns \`a-b\` | FR-3, O3 | Output of \`node -e "console.log(require('./src/text/slugify').slugify('  A  B '))"\` printing a-b ${row_head}
| FS-4 | \`sum([1, 2, 3])\` returns 6 | FR-4, O4 | Output of \`node -e "console.log(require('./src/stats/sum').sum([1,2,3]))"\` printing 6 ${row_head}
EOF
}

# SMOKE_PROJECT_DIR (optional): an absolute, empty-or-absent folder to use instead of a
# mktemp one, e.g. the verification.md fixtures slot inside the worktree. Needed where
# scaffolding under /tmp fails (cp chmod EPERM on setgid skill dirs).
if [[ -n "${SMOKE_PROJECT_DIR:-}" ]]; then
    PROJECT_DIR="$SMOKE_PROJECT_DIR"
else
    PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-regression.XXXXXX")"
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

# Pays for one verification loop that can iterate 3 times with Debug, plus the closing pass
# (up to two Exercise+Judge rounds, one Debug, one state sync). run-smoke.sh's SCENARIO_TIMEOUT
# entry must stay above this. Raise both together.
TIMEOUT_RUN=1800

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project ($PROJECT_DIR)"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project ($PROJECT_DIR)"

smoke_write_regression_prd "${PROJECT_DIR}/${PRD_REL}"
smoke_write_regression_trd "${PROJECT_DIR}/${TRD_REL}"
smoke_write_regression_code "$PROJECT_DIR"
smoke_write_regression_verification_md "${PROJECT_DIR}/${VERIFICATION_MD_REL}"
smoke_write_regression_definition "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md"
assert_file_nonempty "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md" "pre-seeded success definition written"
assert_file_nonempty "${PROJECT_DIR}/${VERIFICATION_MD_REL}" "fixture verification.md written"

# The fixture is only a test of the pass if every criterion maps to files: check the derive step
# on the seed, before the model turn, so a TRD the parser cannot map fails here and not as a
# confusing "no covers" result later.
DERIVED="$(cd "$PROJECT_DIR" && node .claude/lib/live-evidence.js derive-criteria \
    --state-dir "$STATE_DIR_REL" --trd "$TRD_REL" --definition "${STATE_DIR_REL}/success-definition.md" 2>/dev/null)"
if jq -e '(.["FS-1"] // []) as $a | (.["FS-2"] // []) as $b | (.["FS-3"] // []) as $c | (.["FS-4"] // []) as $d
          | ($a|index("src/money/format.js")) and ($b|index("src/money/format.js"))
          and ($c == ["src/text/slugify.js"]) and ($d == ["src/stats/sum.js"])' <<< "$DERIVED" >/dev/null 2>&1; then
    assert_pass_raw "derive-criteria maps all four criteria (FS-1/FS-2 share format.js; FS-3, FS-4 own files)"
else
    assert_fail_raw "derive-criteria did not map the seed as designed: ${DERIVED:-<no output>}"
    smoke_finish
fi

VERIFICATION_MD_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")"
INVOICE_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/src/money/invoice.js")"
RECEIPT_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/src/money/receipt.js")"
FORMAT_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/src/money/format.js")"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: regression-pass fixture" --no-verify

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
smoke_claude "/verify-build ${TRD_REL}" "$TIMEOUT_RUN" "$PROJECT_DIR" "$SESSION_FILE"
RUN_RC=$?
assert_exit_code 0 "$RUN_RC" "claude --print exits 0 (/verify-build)"

if [[ "$RUN_RC" -ne 0 ]]; then
    assert_fail_raw "regression assertions — INCONCLUSIVE: run exited ${RUN_RC} (124 = timeout), so its content proves nothing"
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

# --- 1. Did the setup happen? Each miss is a named INCONCLUSIVE, not a pass. ---
ex1="$(jq -r '[.exercised[]? | select(.iteration == 1 and ((.confirmation // false) or (.regression // false) | not))][0].ids // [] | sort | join(" ")' "$STATE_FILE" 2>/dev/null)"
if [[ "$ex1" == "FS-1 FS-2 FS-3 FS-4" ]]; then
    assert_pass_raw "iteration 1 exercised all four criteria (${ex1})"
else
    assert_fail_raw "iteration 1 exercised [${ex1}], expected all four — INCONCLUSIVE"
    smoke_finish
fi

FROZEN_TOUCHED=0
[[ "$(smoke_file_hash "${PROJECT_DIR}/src/money/invoice.js")" == "$INVOICE_HASH_BEFORE" ]] || FROZEN_TOUCHED=1
[[ "$(smoke_file_hash "${PROJECT_DIR}/src/money/receipt.js")" == "$RECEIPT_HASH_BEFORE" ]] || FROZEN_TOUCHED=1
if [[ "$FROZEN_TOUCHED" -eq 1 ]]; then
    assert_fail_raw "INCONCLUSIVE: Debug edited a FROZEN file (invoice.js or receipt.js), so the fix did not go through the shared formatter"
    smoke_finish
fi

if [[ "$(smoke_file_hash "${PROJECT_DIR}/src/money/format.js")" == "$FORMAT_HASH_BEFORE" ]]; then
    assert_fail_raw "INCONCLUSIVE: src/money/format.js is unchanged, so no Debug fix touched the file ${VICTIM_ID} covers (outcome $(jq -r '.outcome // "none"' "$STATE_FILE"))"
    smoke_finish
fi
assert_pass_raw "Debug edited the shared formatter src/money/format.js and no frozen file"

REGRESSION="$(jq -c '.regression // null' "$STATE_FILE" 2>/dev/null)"
if [[ "$REGRESSION" == "null" || -z "$REGRESSION" ]]; then
    assert_fail_raw "no top-level regression record in the state file (outcome $(jq -r '.outcome // "none"' "$STATE_FILE")) — INCONCLUSIVE if the run never reached a clean exit, a defect otherwise"
    smoke_finish
fi
assert_pass_raw "state file holds a regression record"

reason_of() { jq -r --arg id "$1" '[.regression.rounds[0].scope[]? | select(.id == $id)][0].reason // "none"' "$STATE_FILE" 2>/dev/null; }

# A Debug that could not name its changes widens the scope to everything (TR1): the setup for
# "untouched criteria are not re-walked" did not exist.
for id in $UNTOUCHED_IDS; do
    if [[ "$(reason_of "$id")" == "changes-unknown" ]]; then
        assert_fail_raw "INCONCLUSIVE: ${id} was re-checked as changes-unknown — Debug did not report filesChanged (unverified claim TR1)"
        smoke_finish
    fi
done

# --- 2. The victim was re-checked for the right reason and caught. ---
VICTIM_REASON="$(reason_of "$VICTIM_ID")"
if [[ "$VICTIM_REASON" != "covers-changed" ]]; then
    assert_fail_raw "${VICTIM_ID} entered regression round 1 for reason [${VICTIM_REASON}], expected covers-changed (scope: $(jq -c '.regression.rounds[0].scope' "$STATE_FILE"))"
else
    assert_pass_raw "${VICTIM_ID} was re-checked in regression round 1 with reason covers-changed"
fi

IN_R1="$(jq -r --arg id "$VICTIM_ID" '[.exercised[]? | select(.regression == 1) | select((.ids // []) | index($id))] | length' "$STATE_FILE" 2>/dev/null)"
if [[ "$IN_R1" -ge 1 ]]; then
    assert_pass_raw "${VICTIM_ID} appears in a regression: 1 exercised entry"
else
    assert_fail_raw "${VICTIM_ID} is in no regression: 1 exercised entry (exercised: $(jq -c '[.exercised[]? | {iteration, ids, regression}]' "$STATE_FILE"))"
fi

CAUGHT="$(jq -r --arg id "$VICTIM_ID" '[.regression.rounds[0].caught[]? | select(. == $id)] | length' "$STATE_FILE" 2>/dev/null)"
if [[ "$CAUGHT" -ge 1 ]]; then
    assert_pass_raw "${VICTIM_ID} is in regression.rounds[0].caught: the fix broke it and the pass said so"
else
    # Re-checked and ruled met: the fix did not break the earlier criterion, which is the
    # setup failing (D17), not the pass failing.
    VICTIM_STATUS="$(jq -r --arg id "$VICTIM_ID" '[.criteria[]? | select(.id == $id)][0].status // "none"' "$STATE_FILE" 2>/dev/null)"
    if [[ "$VICTIM_REASON" == "covers-changed" && "$VICTIM_STATUS" == "met" ]]; then
        assert_fail_raw "INCONCLUSIVE: ${VICTIM_ID} was re-checked and is still met — Debug's fix to format.js did not break it, so nothing was there to catch (caught: $(jq -c '.regression.rounds[0].caught' "$STATE_FILE"))"
    else
        assert_fail_raw "${VICTIM_ID} not in regression.rounds[0].caught (status ${VICTIM_STATUS}, caught: $(jq -c '.regression.rounds[0].caught' "$STATE_FILE"))"
    fi
fi

# --- 3. Untouched met criteria were not re-walked. ---
for id in $UNTOUCHED_IDS; do
    WALKED="$(jq -r --arg id "$id" '[.exercised[]? | select((.regression // null) != null) | select((.ids // []) | index($id))] | length' "$STATE_FILE" 2>/dev/null)"
    LISTED="$(jq -r --arg id "$id" '[.regression.notRewalked[]? | select(. == $id)] | length' "$STATE_FILE" 2>/dev/null)"
    if [[ "$WALKED" == "0" && "$LISTED" -ge 1 ]]; then
        assert_pass_raw "${id} (covered files untouched) was not re-walked and is in regression.notRewalked"
    else
        assert_fail_raw "${id} should be unwalked and listed in notRewalked: walked in ${WALKED} regression entr(ies), listed ${LISTED}, reason [$(reason_of "$id")]"
    fi
done

# --- 4. Never a third round. ---
N_REG="$(jq -r '[.exercised[]? | select((.regression // null) != null)] | length' "$STATE_FILE" 2>/dev/null)"
if [[ "$N_REG" =~ ^[0-9]+$ && "$N_REG" -ge 1 && "$N_REG" -le 2 ]]; then
    assert_pass_raw "${N_REG} regression exercised entr(ies), at most two"
else
    assert_fail_raw "expected 1 or 2 regression exercised entries, found [${N_REG}]"
fi

# --- 5. The report shows the catch and the not-re-walked ids. ---
SECTION="$(awk '/^## Regression pass/{f=1; next} /^## /{f=0} f' "$REPORT_FILE")"
if [[ -z "$SECTION" ]]; then
    assert_fail_raw "the report has no '## Regression pass' section"
else
    assert_pass_raw "the report has a '## Regression pass' section"
    if grep -q "$VICTIM_ID" <<< "$SECTION"; then
        assert_pass_raw "the Regression pass section names ${VICTIM_ID}"
    else
        assert_fail_raw "the Regression pass section does not name ${VICTIM_ID}"
    fi
    for id in $UNTOUCHED_IDS; do
        if grep -q "$id" <<< "$SECTION"; then
            assert_pass_raw "the Regression pass section lists ${id} as not re-walked"
        else
            assert_fail_raw "the Regression pass section does not mention ${id}"
        fi
    done
fi

# An autonomous run never edits the owner-governed file (the fixture's copy here).
if [[ "$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")" == "$VERIFICATION_MD_HASH_BEFORE" ]]; then
    assert_pass_raw "fixture verification.md byte-unchanged by the run"
else
    assert_fail_raw "fixture verification.md changed during the run"
fi

smoke_finish
