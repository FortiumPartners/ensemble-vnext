#!/usr/bin/env bash
# =============================================================================
# verify-blocking-policy - Scenario: under `Blocking: must-pass only`, a failing criterion
#                          that is not must-pass does not stop the run from reporting
#                          satisfied, and is filed as a follow-up
#                          (docs/TRD/block-only-on-material-failures.md)
# =============================================================================
#
# Proves, with a live Judge and Debug, that one /verify-build over a fixture whose own
# verification.md says `Blocking: must-pass only` ends `satisfied` while a non-must-pass
# criterion is still failing, states that in the report, and records one non-blocking
# follow-up row for it.
#
#   Fixture: a success definition PRE-SEEDED with two criteria, a fixture TRD whose Objectives
#   table marks O1 must-pass and O2 not:
#     FS-1  greet('ada') returns "Hello, Ada"        serves O1 (must pass)
#           -> BROKEN at the start: src/greet.js forgets to capitalise the name. Debug can fix it.
#     FS-2  tax(100) returns 8                        serves O2 (not must pass)
#           -> BROKEN at the start in vendor/legacy-tax.js, a vendored file the fixture's
#              .claude/verification-notes.md marks read-only, so Debug has no business fixing it
#              and the failure stays open.
#   Expected: FS-1 ends met, FS-2 stays not_met, outcome satisfied, the state file names FS-2
#   in nonBlocking, the report carries a `**Not blocking**:` line, and discovered.jsonl holds one
#   [non-blocking] row for FS-2 with rankClass "product".
#
#   The live model decides what Debug edits, not the fixture. A run where the setup did not
#   happen (FS-2 got fixed anyway, or FS-1 was left open) is a named INCONCLUSIVE, never a pass.
#   A run where the setup happened but the policy did not behave is a FAIL.
#
# Evidence: when SMOKE_EVIDENCE_DIR is set, the report, state file, discovered.jsonl and
# transcript are copied there before the scratch project is removed.
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

FEATURE="smoke-blocking"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
VERIFICATION_MD_REL=".claude/rules/verification.md"
NOTES_REL=".claude/verification-notes.md"
SHIPPED_VERIFICATION_MD="${REPO_ROOT}/packages/core/templates/claude-directory/rules/verification.md"
BLOCKING_ID="FS-1"      # must pass, fixable
LENIENT_ID="FS-2"       # not must pass, fix out of Debug's reach

smoke_write_blocking_prd() {
    local prd_path="$1"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${FEATURE} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke fixture for the blocking policy scenario.

## 2. Functional Requirements

- FR-1: \`greet(name)\` in \`src/greet.js\` returns \`Hello, \` followed by the name with its first letter capitalised, for example \`Hello, Ada\`.
- FR-2: \`tax(amount)\` in \`src/tax.js\` returns the sales tax at 8 percent, for example \`tax(100)\` is 8. It uses the vendored rate table in \`vendor/legacy-tax.js\`.

## 3. Non-Goals

- Anything beyond these two requirements.
EOF
}

smoke_write_blocking_trd() {
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
| O1 | Greetings capitalise the name. | FR-1 | yes |
| O2 | Sales tax is 8 percent. | FR-2 | |

## 1. Overview

### 1.1 Technical Summary

Fixture TRD. The modules under \`src/\` already exist; \`src/tax.js\` uses the vendored file
\`vendor/legacy-tax.js\`, which this project does not own.

## 4. Master Task List

### 4.1 Phase 1 — Two tasks

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| BLK-001 | Greetings via \`src/greet.js\`. | O1 | | None | \`greet('ada')\` returns \`Hello, Ada\`. |
| BLK-002 | Sales tax via \`src/tax.js\` and \`vendor/legacy-tax.js\`. | O2 | | None | \`tax(100)\` returns \`8\`. |

## 5. Execution Plan

### 5.1 Phase 1 — Two tasks

\`BLK-001\` and \`BLK-002\`, independent.

## 6. Quality Requirements

- FR-1: \`greet('ada')\` returns \`Hello, Ada\`.

## 7. Risk Assessment

None.

## 8. Non-Goals

- Anything beyond the listed tasks.

## 9. Task Grounding

### BLK-001
- **Touches:** \`src/greet.js\`

### BLK-002
- **Touches:** \`src/tax.js\`, \`vendor/legacy-tax.js\`
EOF
}

smoke_write_blocking_code() {
    local d="$1"
    mkdir -p "${d}/src" "${d}/vendor" "$(dirname "${d}/${NOTES_REL}")"
    # FS-1 defect: the name is not capitalised. A one-line fix in a file the project owns.
    cat > "${d}/src/greet.js" <<'EOF'
module.exports.greet = (name) => 'Hello, ' + name;
EOF
    cat > "${d}/src/tax.js" <<'EOF'
const { RATE } = require('../vendor/legacy-tax');
module.exports.tax = (amount) => amount * RATE;
EOF
    # FS-2 defect: the vendored rate is 0.8 where 0.08 is meant. Out of Debug's reach by the
    # fixture's own rule (verification-notes.md), so the failure stays open.
    cat > "${d}/vendor/legacy-tax.js" <<'EOF'
// Vendored from the legacy billing system. Read-only here.
module.exports.RATE = 0.8;
EOF
    cat > "${d}/${NOTES_REL}" <<'EOF'
# Verification notes

- `vendor/` holds third-party code this project does not own. It is READ-ONLY: never edit
  anything under `vendor/`, and do not work around it by overriding its values from `src/`.
  A criterion that fails because of a vendored file is reported as failing and left open.
EOF
}

# The fixture's own verification.md: the CURRENT template with the local row narrowed and the
# policy set. Never this repository's verification.md.
smoke_write_blocking_verification_md() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    python3 - "$SHIPPED_VERIFICATION_MD" "$path" <<'PYEOF'
import sys
text = open(sys.argv[1]).read()
text = text.replace("`http://localhost:3000` (`npm run dev`)", "fixture code only — no server, no network")
text = text.replace("| e.g. hot reload — nothing to run |", "| nothing — tests read the working tree |")
if "Blocking: all criteria" not in text:
    sys.exit("template has no 'Blocking: all criteria' line")
text = text.replace("Blocking: all criteria", "Blocking: must-pass only")
open(sys.argv[2], 'w').write(text)
PYEOF
}

smoke_write_blocking_definition() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    local row_head="| [read] | locator | |"
    cat > "$path" <<EOF
# Functional Success Definition: ${FEATURE}

**Source**: ${PRD_REL}
**Source kind**: prd
**Derived**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Criteria**: 2

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | \`greet('ada')\` returns \`Hello, Ada\` | FR-1, O1 | Output of \`node -e "console.log(require('./src/greet').greet('ada'))"\` printing Hello, Ada ${row_head} O1 |
| FS-2 | \`tax(100)\` returns 8 | FR-2, O2 | Output of \`node -e "console.log(require('./src/tax').tax(100))"\` printing 8 ${row_head} |
EOF
}

# SMOKE_PROJECT_DIR (optional): an absolute, empty-or-absent folder to use instead of a
# mktemp one, e.g. the verification.md fixtures slot inside the worktree.
if [[ -n "${SMOKE_PROJECT_DIR:-}" ]]; then
    PROJECT_DIR="$SMOKE_PROJECT_DIR"
else
    PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-blocking.XXXXXX")"
fi

save_evidence() {
    [[ -n "${SMOKE_EVIDENCE_DIR:-}" ]] || return 0
    mkdir -p "$SMOKE_EVIDENCE_DIR"
    local f
    for f in "${PROJECT_DIR}/${STATE_DIR_REL}/verification-report.md" \
             "${PROJECT_DIR}/${STATE_DIR_REL}/verification-state.json" \
             "${PROJECT_DIR}/${STATE_DIR_REL}/discovered.jsonl"; do
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

# Pays for one verification loop that can iterate 3 times with Debug, plus the closing steps.
# run-smoke.sh's SCENARIO_TIMEOUT entry must stay above this. Raise both together.
TIMEOUT_RUN=1500

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project ($PROJECT_DIR)"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project ($PROJECT_DIR)"

smoke_write_blocking_prd "${PROJECT_DIR}/${PRD_REL}"
smoke_write_blocking_trd "${PROJECT_DIR}/${TRD_REL}"
smoke_write_blocking_code "$PROJECT_DIR"
if ! smoke_write_blocking_verification_md "${PROJECT_DIR}/${VERIFICATION_MD_REL}"; then
    assert_fail_raw "fixture verification.md could not be written (template lacks the Blocking line)"
    smoke_finish
fi
smoke_write_blocking_definition "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md"
assert_file_nonempty "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md" "pre-seeded success definition written"
assert_file_nonempty "${PROJECT_DIR}/${VERIFICATION_MD_REL}" "fixture verification.md written"
if grep -qx 'Blocking: must-pass only' "${PROJECT_DIR}/${VERIFICATION_MD_REL}"; then
    assert_pass_raw "fixture verification.md sets Blocking: must-pass only"
else
    assert_fail_raw "fixture verification.md lacks the Blocking: must-pass only line"
    smoke_finish
fi

VERIFICATION_MD_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")"
VENDOR_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/vendor/legacy-tax.js")"
TAX_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/src/tax.js")"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: blocking-policy fixture" --no-verify

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
smoke_claude "/verify-build ${TRD_REL}" "$TIMEOUT_RUN" "$PROJECT_DIR" "$SESSION_FILE"
RUN_RC=$?
assert_exit_code 0 "$RUN_RC" "claude --print exits 0 (/verify-build)"

if [[ "$RUN_RC" -ne 0 ]]; then
    assert_fail_raw "blocking-policy assertions — INCONCLUSIVE: run exited ${RUN_RC} (124 = timeout), so its content proves nothing"
    smoke_finish
fi

smoke_final_text "$SESSION_FILE" > "${PROJECT_DIR}/.final_text"
assert_tail_matches "${PROJECT_DIR}/.final_text" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
    "output ends with a COMMAND COMPLETE/STUCK banner"

STATE_FILE="${PROJECT_DIR}/${STATE_DIR_REL}/verification-state.json"
REPORT_FILE="${PROJECT_DIR}/${STATE_DIR_REL}/verification-report.md"
DISCOVERED_FILE="${PROJECT_DIR}/${STATE_DIR_REL}/discovered.jsonl"

if [[ ! -f "$STATE_FILE" || ! -f "$REPORT_FILE" ]]; then
    assert_fail_raw "verification-state.json / verification-report.md missing — INCONCLUSIVE"
    smoke_finish
fi
assert_pass_raw "state file and report written"

status_of() { jq -r --arg id "$1" '[.criteria[]? | select(.id == $id)][0].status // "none"' "$STATE_FILE" 2>/dev/null; }

# --- 1. Did the setup happen? Each miss is a named INCONCLUSIVE, not a pass. ---
if [[ "$(smoke_file_hash "${PROJECT_DIR}/vendor/legacy-tax.js")" != "$VENDOR_HASH_BEFORE" \
   || "$(smoke_file_hash "${PROJECT_DIR}/src/tax.js")" != "$TAX_HASH_BEFORE" ]]; then
    assert_fail_raw "INCONCLUSIVE: Debug edited vendor/legacy-tax.js or src/tax.js, so ${LENIENT_ID}'s defect did not stay open (${LENIENT_ID} is $(status_of "$LENIENT_ID"))"
    smoke_finish
fi
if [[ "$(status_of "$LENIENT_ID")" == "met" ]]; then
    assert_fail_raw "INCONCLUSIVE: ${LENIENT_ID} ended met, so there was no non-must-pass failure for the policy to let through"
    smoke_finish
fi
if [[ "$(status_of "$BLOCKING_ID")" != "met" ]]; then
    assert_fail_raw "INCONCLUSIVE: the must-pass criterion ${BLOCKING_ID} is $(status_of "$BLOCKING_ID"), not met — Debug did not fix it (outcome $(jq -r '.outcome // "none"' "$STATE_FILE")), so the policy was never tested"
    smoke_finish
fi
assert_pass_raw "setup held: ${BLOCKING_ID} (must pass) is met and ${LENIENT_ID} (not must pass) is $(status_of "$LENIENT_ID")"

# --- 2. The policy behaved. ---
OUTCOME="$(jq -r '.outcome // "none"' "$STATE_FILE" 2>/dev/null)"
if [[ "$OUTCOME" == "satisfied" ]]; then
    assert_pass_raw "outcome is satisfied despite the open non-must-pass failure"
else
    assert_fail_raw "outcome is [${OUTCOME}], expected satisfied (reason: $(jq -r '.reason // "none"' "$STATE_FILE" 2>/dev/null))"
fi

if jq -e --arg id "$LENIENT_ID" '[.nonBlocking[]? | select(.id == $id)] | length == 1' "$STATE_FILE" >/dev/null 2>&1; then
    assert_pass_raw "state file nonBlocking names ${LENIENT_ID}"
else
    assert_fail_raw "state file nonBlocking does not name ${LENIENT_ID} exactly once (nonBlocking: $(jq -c '.nonBlocking // null' "$STATE_FILE" 2>/dev/null))"
fi
if jq -e --arg id "$BLOCKING_ID" '[.nonBlocking[]? | select(.id == $id)] | length == 0' "$STATE_FILE" >/dev/null 2>&1; then
    assert_pass_raw "the must-pass criterion ${BLOCKING_ID} is not in nonBlocking"
else
    assert_fail_raw "the must-pass criterion ${BLOCKING_ID} appears in nonBlocking"
fi

if grep -q 'Not blocking\*\*:' "$REPORT_FILE" && grep 'Not blocking\*\*:' "$REPORT_FILE" | grep -q "$LENIENT_ID"; then
    assert_pass_raw "the report has a '**Not blocking**:' line naming ${LENIENT_ID}"
else
    assert_fail_raw "the report has no '**Not blocking**:' line naming ${LENIENT_ID}"
fi

# --- 3. The follow-up row. ---
if [[ ! -f "$DISCOVERED_FILE" ]]; then
    assert_fail_raw "no discovered.jsonl: the non-blocking follow-up was not recorded"
else
    ROWS="$(jq -s --arg id "$LENIENT_ID" '[.[] | select(.ref == $id and ((.summary // "") | startswith("[non-blocking]")))] | length' "$DISCOVERED_FILE" 2>/dev/null)"
    if [[ "$ROWS" == "1" ]]; then
        assert_pass_raw "discovered.jsonl holds one [non-blocking] row for ${LENIENT_ID}"
    else
        assert_fail_raw "expected one [non-blocking] row for ${LENIENT_ID} in discovered.jsonl, found [${ROWS}]"
    fi
    if jq -s -e --arg id "$LENIENT_ID" '[.[] | select(.ref == $id and ((.summary // "") | startswith("[non-blocking]")))][0] | .rankClass == "product" and .blocksFeature == false' "$DISCOVERED_FILE" >/dev/null 2>&1; then
        assert_pass_raw "the follow-up row has rankClass product and blocksFeature false"
    else
        assert_fail_raw "the follow-up row lacks rankClass \"product\" / blocksFeature false"
    fi
fi

# An autonomous run never edits the owner-governed file (the fixture's copy here).
if [[ "$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")" == "$VERIFICATION_MD_HASH_BEFORE" ]]; then
    assert_pass_raw "fixture verification.md byte-unchanged by the run"
else
    assert_fail_raw "fixture verification.md changed during the run"
fi

smoke_finish
