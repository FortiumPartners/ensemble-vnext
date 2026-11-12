#!/usr/bin/env bash
# =============================================================================
# verify-triage-kinds - Scenario: unmet results are triaged by kind (TRIAGE-T001)
# =============================================================================
#
# Proves, with a live Judge, that /verify-build sorts three unmet criteria into the
# three kinds docs/TRD/triage-unmet-results-by-kind.md defines.
#
#   Fixture: a success definition PRE-SEEDED with exactly three criteria (so the
#   derive agent is not a source of variation; verify-build.md step 3 "present -> use it"):
#     FS-1 build defect       `total()` must sum a list; src/legacy/total.js is wrong and
#                             marked frozen, so the loop's Debug stage should leave it be.
#     FS-2 evidence gap       `slugify()` works and writes its trace, but the build
#                             removes the trace on process exit, so the file the criterion's
#                             evidence asks for is never left on disk.
#     FS-3 not checkable here a hardware signing token; the fixture's own verification.md
#                             section 5 says no such device is reachable from this host.
#   One /verify-build run, default cap. Asserts the state file's `.criteria[].kind` and the
#   report text. The kinds come from a live Judge: an unexpected cause is reported as a named
#   INCONCLUSIVE (the Judge ruled differently), not as a silent pass.
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

FEATURE="smoke-triage"
TASK_ID="SMOKE-TRIAGE-001"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
VERIFICATION_MD_REL=".claude/rules/verification.md"
SHIPPED_VERIFICATION_MD="${REPO_ROOT}/packages/core/templates/claude-directory/rules/verification.md"

smoke_write_triage_prd() {
    local prd_path="$1"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${FEATURE} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke fixture for the unmet-results-by-kind scenario.

## 2. Functional Requirements

- FR-1: \`total(list)\` returns the sum of the numbers in the list.
- FR-2: \`slugify(text)\` returns the text lowercased with spaces replaced by hyphens, and the
  build writes a trace file \`trace/slugify.trace.json\` for every call (the trace is
  ephemeral: the build cleans it up on exit).
- FR-3: Release artifacts are signed with the hardware signing token.

## 3. Non-Goals

- Anything beyond these three requirements.
EOF
}

smoke_write_triage_trd() {
    local trd_path="$1"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${FEATURE} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${PRD_REL}\`

## 1. Overview

### 1.1 Technical Summary

Fixture TRD. \`src/legacy/total.js\` and \`src/slugify.js\` already exist; the task list covers
only the slugify module.

## 4. Master Task List

### 4.1 Phase 1 — Single task

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${TASK_ID} | Provide \`src/slugify.js\` exporting \`slugify()\`. | FR-2 | | None | \`slugify('A B')\` returns \`'a-b'\`. |

## 5. Execution Plan

### 5.1 Phase 1 — Single task

\`${TASK_ID}\` only.

## 6. Quality Requirements

- FR-2: \`slugify('A B')\` returns \`'a-b'\`.

## 7. Risk Assessment

None.

## 8. Non-Goals

- Anything beyond the listed task.
EOF
}

smoke_write_triage_code() {
    local project_dir="$1"
    mkdir -p "${project_dir}/src/legacy"
    # FS-1: the defect. Frozen, so the Debug stage is told not to edit it.
    cat > "${project_dir}/src/legacy/total.js" <<'EOF'
// FROZEN: vendored from the legacy billing service. Owner-governed; do NOT modify this file.
module.exports.total = (list) => list.reduce((a, b) => a - b, 0);
EOF
    # FS-2: correct behaviour, trace written as designed, but removed on exit -- the evidence the
    # criterion asks for (the file left on disk) is something the build deliberately does not leave.
    cat > "${project_dir}/src/slugify.js" <<'EOF'
const fs = require('fs');
const path = require('path');

const traceFile = path.join('trace', 'slugify.trace.json');

// The trace is ephemeral: cleaned up on exit. This is the build's intended behaviour, so a
// trace file is never left on disk after the process ends.
process.on('exit', () => {
  try { fs.unlinkSync(traceFile); } catch (e) { /* nothing to clean up */ }
});

module.exports.slugify = (text) => {
  const output = text.toLowerCase().replace(/ /g, '-');
  fs.mkdirSync('trace', { recursive: true });
  fs.writeFileSync(traceFile, JSON.stringify({ input: text, output }));
  return output;
};
EOF
}

# The fixture's own verification.md: the CURRENT template with the local row narrowed and
# section 5 naming the signing token. Never this repository's verification.md (NG9).
smoke_write_triage_verification_md() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    python3 - "$SHIPPED_VERIFICATION_MD" "$path" <<'PYEOF'
import re, sys
text = open(sys.argv[1]).read()
text = text.replace("`http://localhost:3000` (`npm run dev`)", "fixture code only — no server, no network")
text = text.replace('- e.g. "Salesforce close flows — the sandbox token expires weekly and re-auth is manual."',
    '- Hardware signing token (HSM) — no token device is reachable from this host, so signing of release artifacts is not verifiable here.')
text = text.replace('- e.g. "Email delivery — no inbox we can read from in dev."\n', '')
text = text.replace("| e.g. hot reload — nothing to run |", "| nothing — tests read the working tree |")
open(sys.argv[2], 'w').write(text)
PYEOF
}

smoke_write_triage_definition() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<EOF
# Functional Success Definition: ${FEATURE}

**Source**: ${PRD_REL}
**Source kind**: prd
**Derived**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Criteria**: 3

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | \`total([1, 2, 3])\` returns 6 | FR-1 | Output of \`node -e "console.log(require('./src/legacy/total').total([1,2,3]))"\` printing 6 | [read] | locator | | |
| FS-2 | \`slugify('A B')\` returns \`a-b\` and the build writes a trace file for the call | FR-2 | The file \`trace/slugify.trace.json\` left on disk after calling \`slugify('A B')\`, showing the input and output | [read] | locator | | |
| FS-3 | Release artifacts are signed with the hardware signing token | FR-3 | A signature produced by the hardware signing token over a release artifact | [read] | judge-only | | |
EOF
}

# SMOKE_PROJECT_DIR (optional): an absolute, empty-or-absent folder to use instead of a
# mktemp one, e.g. the verification.md fixtures slot inside the worktree. Needed where
# scaffolding under /tmp fails (cp chmod EPERM on setgid skill dirs).
if [[ -n "${SMOKE_PROJECT_DIR:-}" ]]; then
    PROJECT_DIR="$SMOKE_PROJECT_DIR"
else
    PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-triage.XXXXXX")"
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
# verify-fix's TIMEOUT_RUN1. run-smoke.sh's SCENARIO_TIMEOUT entry must stay above this.
TIMEOUT_RUN=1500

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project ($PROJECT_DIR)"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project ($PROJECT_DIR)"

smoke_write_triage_prd "${PROJECT_DIR}/${PRD_REL}"
smoke_write_triage_trd "${PROJECT_DIR}/${TRD_REL}"
smoke_write_triage_code "$PROJECT_DIR"
smoke_write_triage_verification_md "${PROJECT_DIR}/${VERIFICATION_MD_REL}"
smoke_write_triage_definition "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md"
assert_file_nonempty "${PROJECT_DIR}/${STATE_DIR_REL}/success-definition.md" "pre-seeded success definition written"
assert_file_nonempty "${PROJECT_DIR}/${VERIFICATION_MD_REL}" "fixture verification.md written"
VERIFICATION_MD_HASH_BEFORE="$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")"
git -C "$PROJECT_DIR" add -A
git -C "$PROJECT_DIR" commit -q -m "smoke: triage-kinds fixture" --no-verify

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
smoke_claude "/verify-build ${TRD_REL}" "$TIMEOUT_RUN" "$PROJECT_DIR" "$SESSION_FILE"
RUN_RC=$?
assert_exit_code 0 "$RUN_RC" "claude --print exits 0 (/verify-build)"

if [[ "$RUN_RC" -ne 0 ]]; then
    assert_fail_raw "kind assertions — INCONCLUSIVE: run exited ${RUN_RC} (124 = timeout), so its content proves nothing"
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

kind_of() { jq -r --arg id "$1" '[.criteria[] | select(.id == $id)][0].kind // "none"' "$STATE_FILE" 2>/dev/null; }
cause_of() { jq -r --arg id "$1" '[.criteria[] | select(.id == $id)][0].cause // "none"' "$STATE_FILE" 2>/dev/null; }
status_of() { jq -r --arg id "$1" '[.criteria[] | select(.id == $id)][0].status // "none"' "$STATE_FILE" 2>/dev/null; }

# check_kind <id> <expected kind> <what>
check_kind() {
    local id="$1" want="$2" what="$3" got
    got="$(kind_of "$id")"
    if [[ "$got" == "$want" ]]; then
        assert_pass_raw "${id} (${what}) carries kind ${want}"
    elif [[ "$got" == "none" && "$(status_of "$id")" == "met" ]]; then
        assert_fail_raw "${id} (${what}) INCONCLUSIVE: the Judge ruled it met (or Debug repaired it), expected kind ${want}"
    else
        assert_fail_raw "${id} (${what}) INCONCLUSIVE: kind ${got}, cause $(cause_of "$id"), status $(status_of "$id"); expected kind ${want}"
    fi
}

check_kind FS-1 build-defect "seeded build defect"
check_kind FS-2 evidence-gap "the trace the build writes but removes on exit"
check_kind FS-3 not-checkable-here "needs a signing token not reachable from this host"

# The report shows the kinds: a definition-problems section and a not-checkable result.
if grep -qiE '^## Evidence gaps \(definition problems\)' "$REPORT_FILE"; then
    assert_pass_raw "report has the Evidence gaps (definition problems) section"
else
    assert_fail_raw "report has no Evidence gaps (definition problems) section"
fi
if grep -qiE 'not checkable here' "$REPORT_FILE"; then
    assert_pass_raw "report names a not-checkable-here result"
else
    assert_fail_raw "report never says 'not checkable here'"
fi
if grep -qiE 'build defect' "$REPORT_FILE"; then
    assert_pass_raw "report names a build defect"
else
    assert_fail_raw "report never says 'build defect'"
fi

# An autonomous run never edits the owner-governed file (the fixture's copy here).
if [[ "$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")" == "$VERIFICATION_MD_HASH_BEFORE" ]]; then
    assert_pass_raw "fixture verification.md byte-unchanged by the run"
else
    assert_fail_raw "fixture verification.md changed during the run"
fi

smoke_finish
