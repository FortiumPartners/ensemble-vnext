#!/usr/bin/env bash
# =============================================================================
# close-feature - Scenario: /close-feature (TRD feature-close-out, §3.7)
# =============================================================================
#
# Eleven runs, five throwaway projects, exercising the judgement, the three
# deterministic stops, and the closed-feature guards on /implement-trd and
# /amend. Every assertion reads a file, the final banner, or git — none judges
# prose quality (README convention).
#
#   PROJECT_1 (branch main): fixture "deferred" — one core task `success`, one
#     `[LIVE]` verification task `deferred` with a deferred-by-design row.
#     Run 1 : verification-state.json satisfied, every criterion `met`, no
#             audit report -> done-with-gaps, "never audited".
#     Run 9 : re-run in the SAME project -> already-closed, record unchanged.
#     Run 10: /implement-trd --resume in the SAME project -> STUCK, reopen text.
#     Run 11: current.json restored to the feature, /amend <anything> -> the
#             same STUCK text, no tracked file changed.
#
#   PROJECT_2 (branch main): fixture "deferred" too (task map IDENTICAL to
#     PROJECT_1's, per the TRD's own note that runs 1 and 2 must share one).
#     Run 2 : the core-behavior criterion is `not_verifiable` and nothing else
#             covers that objective -> STUCK, nothing written.
#     Run 3 : same project, + owner evidence + a stale audit report (audited
#             commit predates the fixture code) + current.json pointing at a
#             DIFFERENT feature -> done, owner-evidence coverage, "audit is of".
#
#   PROJECT_3 (branch main): fixture "two-pending" — two tasks, neither built,
#     the only checkpoint value the literal string "pending".
#     Run 4 : no --accept -> STUCK, nothing written.
#     Run 5 : same project, --accept "superseded by another design" -> not-done,
#             accepted, no checkpoint commit recorded.
#
#   PROJECT_4 (branch main): TRD written, no implement.json at all.
#     Run 6 : no --accept -> STUCK, nothing written.
#     Run 7 : same project, --accept "design abandoned" -> abandoned, not-done.
#
#   PROJECT_5 (branch feature/x): PROJECT_1's fixture, wrong branch.
#     Run 8 : STUCK naming main, nothing written.
#
# Across every project, `git rev-list --count HEAD` is unchanged after each
# /close-feature run: the command never commits.
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

FEATURE="smoke-close"
TASK_CORE="SMK-CL-001"
TASK_LIVE="SMK-CL-LIVE-001"
TASK_A="SMK-CL-A"
TASK_B="SMK-CL-B"
TRD_REL="docs/TRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
RUN_TIMEOUT=300

PROJECT_DIRS=()
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch projects PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)):"
        for d in "${PROJECT_DIRS[@]}"; do echo "    $d"; done
        return 0
    fi
    for d in "${PROJECT_DIRS[@]}"; do rm -rf "$d"; done
}
trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# Fixture writers
# -----------------------------------------------------------------------------

# smoke_close_scaffold_main <target_dir>
# Scaffolds a throwaway project (via the shared helper) then renames its
# branch to `main` explicitly -- `git init`'s own default is `master` unless
# `init.defaultBranch` is set, and this scenario's whole point (per the TRD's
# unverified claim) is exercising D4's `main` FALLBACK, which only fires with
# no `origin` remote (already true here) on a branch actually named `main`.
smoke_close_scaffold_main() {
    local target_dir="$1"
    smoke_scaffold_project "$target_dir" || return 1
    git -C "$target_dir" branch -M main
    return 0
}

# smoke_write_close_trd_deferred <trd_path>
# Two objectives; TASK_CORE serves O1 and is meant to be `success` with real
# code (src/greet.js) backing it; TASK_LIVE serves O2 and is deferred by
# design. A Task Grounding block names src/greet.js as TASK_CORE's Touches,
# which run 3's staleness check (D12/OQ-7) needs.
smoke_write_close_trd_deferred() {
    local trd_path="$1"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${FEATURE} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD (close-feature scenario). One core behavior
(\`greet()\` returns \`'hello'\`) and one live-environment check deferred by
design.

### 1.2 Objectives

| ID | Objective |
|----|-----------|
| O1 | Calling \`greet()\` returns the exact string \`'hello'\` |
| O2 | The live deployment is confirmed reachable and healthy |

## 4. Master Task List

### 4.1 Phase 1

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${TASK_CORE} | Create \`src/greet.js\` exporting \`greet()\` returning \`'hello'\`. | O1 | | None | \`greet()\` returns \`'hello'\`. |
| ${TASK_LIVE} | [LIVE] Have a human additionally eyeball the live deployment as a final sanity check, beyond the automated health check. | O2 | | None | A human additionally confirms the live deployment looks right. |

## 5. Execution Plan

### 5.1 Phase 1

Both tasks, no parallelization.

## 6. Quality Requirements

- O1: \`greet()\` returns \`'hello'\`.
- O2: live deployment confirmed reachable and healthy.

## 7. Risk Assessment

None — fixture TRD.

## 8. Non-Goals

- Anything beyond \`greet()\` and the live check named above.

## Deferred by design

| Task ID | Why it cannot run now |
|---------|------------------------|
| ${TASK_LIVE} | Needs the live deployed environment; this project's verification.md lists it as unverifiable here. |

## Task Grounding

### ${TASK_CORE}

- **Touches:** \`src/greet.js\`
EOF
}

# smoke_write_close_trd_twopending <trd_path>
# Two objectives, two tasks, neither ever built. No Deferred section.
smoke_write_close_trd_twopending() {
    local trd_path="$1"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${FEATURE} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD (close-feature scenario, unbuilt-core variant). Two
independent behaviors, neither implemented.

### 1.2 Objectives

| ID | Objective |
|----|-----------|
| O1 | Calling \`greetA()\` returns the exact string \`'hello-a'\` |
| O2 | Calling \`greetB()\` returns the exact string \`'hello-b'\` |

## 4. Master Task List

### 4.1 Phase 1

| Task ID | Description | Serves | Skills | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------|--------------|----------------------|
| ${TASK_A} | Create \`src/greet-a.js\` exporting \`greetA()\` returning \`'hello-a'\`. | O1 | | None | \`greetA()\` returns \`'hello-a'\`. |
| ${TASK_B} | Create \`src/greet-b.js\` exporting \`greetB()\` returning \`'hello-b'\`. | O2 | | None | \`greetB()\` returns \`'hello-b'\`. |

## 5. Execution Plan

### 5.1 Phase 1

Both tasks, no parallelization.

## 6. Quality Requirements

- O1: \`greetA()\` returns \`'hello-a'\`.
- O2: \`greetB()\` returns \`'hello-b'\`.

## 7. Risk Assessment

None — fixture TRD.

## 8. Non-Goals

- Anything beyond the two functions named above.
EOF
}

# smoke_write_close_code <project_dir>
# Backing code for the "deferred" fixture's core task.
smoke_write_close_code() {
    local project_dir="$1"
    mkdir -p "${project_dir}/src"
    cat > "${project_dir}/src/greet.js" <<'EOF'
module.exports.greet = () => 'hello';
EOF
}

# smoke_write_close_implement_json <path> <trd_rel> <commit_or_pending> <live_status>
# "deferred" variant: TASK_CORE success, TASK_LIVE $live_status ("deferred" by
# default). One checkpoint carrying $commit_or_pending.
smoke_write_close_implement_json_deferred() {
    local path="$1" trd_rel="$2" commit_val="$3"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<EOF
{
  "version": "4.0.0",
  "trd_file": "${trd_rel}",
  "branch": "main",
  "strategy": "tdd",
  "phase_cursor": 1,
  "tasks": {
    "${TASK_CORE}": {
      "description": "Create src/greet.js exporting greet() returning 'hello'.",
      "phase": 1,
      "status": "success",
      "cycle_position": "complete",
      "files_changed": ["src/greet.js"],
      "commit": null
    },
    "${TASK_LIVE}": {
      "description": "[LIVE] Have a human additionally eyeball the live deployment as a final sanity check, beyond the automated health check.",
      "phase": 1,
      "status": "deferred",
      "cycle_position": "implement",
      "files_changed": [],
      "commit": null
    }
  },
  "checkpoints": [
    { "phase": 1, "commit": "${commit_val}" }
  ]
}
EOF
}

# smoke_write_close_implement_json_twopending <path> <trd_rel>
smoke_write_close_implement_json_twopending() {
    local path="$1" trd_rel="$2"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<EOF
{
  "version": "4.0.0",
  "trd_file": "${trd_rel}",
  "branch": "main",
  "strategy": "tdd",
  "phase_cursor": 1,
  "tasks": {
    "${TASK_A}": {
      "description": "Create src/greet-a.js exporting greetA() returning 'hello-a'.",
      "phase": 1,
      "status": "pending",
      "cycle_position": "implement",
      "files_changed": [],
      "commit": null
    },
    "${TASK_B}": {
      "description": "Create src/greet-b.js exporting greetB() returning 'hello-b'.",
      "phase": 1,
      "status": "pending",
      "cycle_position": "implement",
      "files_changed": [],
      "commit": null
    }
  },
  "checkpoints": [
    { "phase": 1, "commit": "pending" }
  ]
}
EOF
}

# smoke_write_close_verification_state <path> <live_status> <live_reason>
# FS-1 (O1, greet() — already independently proven by TASK_CORE's own `success`
# status, so it is never the fixture's at-risk objective) is always `met`.
# FS-2 (O2, the live deployment) is the ONLY thing this scenario varies: O2 is
# backed by nothing but a DEFERRED task (never `success`) and this criterion,
# so its status alone decides whether O2 is proven, covered-with-a-gap, or
# unproven -- this is the "sole evidence" seam runs 2/3 exercise.
smoke_write_close_verification_state() {
    local path="$1" live_status="$2" live_reason="$3"
    # A run whose criteria are all met or not_verifiable exits "satisfied" (the
    # Outcome line carries the unexercised count); "unbuilt" would claim
    # src/greet.js was never built and hand the judgement a different reason to
    # STUCK than the sole-evidence seam run 2 exists to exercise.
    local outcome="satisfied"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<EOF
{
  "iteration": 1,
  "outcome": "${outcome}",
  "criteria": [
    {
      "id": "FS-1",
      "status": "met",
      "reason": "src/greet.js was executed under an automated Jest test and returned the exact string 'hello'.",
      "statement": "Calling greet() returns the exact string 'hello'"
    },
    {
      "id": "FS-2",
      "status": "${live_status}",
      "reason": "${live_reason}",
      "statement": "The live deployment is confirmed reachable and healthy"
    }
  ]
}
EOF
}

# smoke_write_close_audit_report <path> <trd_rel> <audited_commit> <verdict_line>
smoke_write_close_audit_report() {
    local path="$1" trd_rel="$2" audited_commit="$3" verdict_line="$4"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<EOF
# Audit report: ${FEATURE}

- Date: $(date -u +%Y-%m-%d)
- Audited commit: ${audited_commit}
- TRD: ${trd_rel}
- PRD: none
- Findings: 0 · applied: 0 · rejected: 0 · still unverified: 0 · verifiers reporting: 5/5

AUDIT-BUILD: ${trd_rel}    PRD: none

${verdict_line}

NO ACTION — implemented, tested, sourced
EOF
}

# run_close <project_dir> <arg_string> <session_file>
# Invokes `/close-feature <arg_string>` and returns claude's exit code.
run_close() {
    local project_dir="$1" arg_string="$2" session_file="$3"
    smoke_claude "/close-feature ${arg_string}" "$RUN_TIMEOUT" "$project_dir" "$session_file"
    return $?
}

CLOSED_JSON_REL="${STATE_DIR_REL}/closed.json"

# assert_commit_count_unchanged <project_dir> <count_before> <label>
# /close-feature never commits (D4, D11): the count after a run must equal the
# count taken before it.
assert_commit_count_unchanged() {
    local project_dir="$1" before="$2" label="$3" after
    after="$(git -C "$project_dir" rev-list --count HEAD)"
    if [[ "$after" == "$before" ]]; then
        assert_pass_raw "${label}: git rev-list --count HEAD unchanged (no commit)"
    else
        assert_fail_raw "${label}: commit count changed (${before} -> ${after}); /close-feature must never commit"
    fi
}

# =============================================================================
# PROJECT_1: run 1 (done-with-gaps, never audited), then run 9 (already
# closed), run 10 (/implement-trd --resume STUCK), run 11 (/amend STUCK).
# =============================================================================

PROJECT_1="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close1.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_1")

if ! smoke_close_scaffold_main "$PROJECT_1"; then
    assert_fail_raw "scaffold PROJECT_1"
    smoke_finish
fi
assert_pass_raw "scaffold PROJECT_1 (branch main, no origin)"

smoke_write_close_trd_deferred "${PROJECT_1}/${TRD_REL}"
smoke_write_close_code "$PROJECT_1"
git -C "$PROJECT_1" add -A
git -C "$PROJECT_1" commit -q -m "smoke: close-feature fixture (deferred variant)" --no-verify
CHECKPOINT_1="$(git -C "$PROJECT_1" rev-parse HEAD)"

smoke_write_close_implement_json_deferred "${PROJECT_1}/${STATE_DIR_REL}/implement.json" "$TRD_REL" "$CHECKPOINT_1"
smoke_write_close_verification_state "${PROJECT_1}/${STATE_DIR_REL}/verification-state.json" "met" "Automated post-deploy smoke check hit the staging health endpoint and received HTTP 200 with the expected banner text."
cat > "${PROJECT_1}/.trd-state/current.json" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": ".trd-state/${FEATURE}/implement.json", "branch": "main" }
EOF

COMMITS_BEFORE_1="$(git -C "$PROJECT_1" rev-list --count HEAD)"
SESSION_1="${PROJECT_1}/.session-run1.jsonl"
run_close "$PROJECT_1" "${TRD_REL}" "$SESSION_1"
RC_1=$?
assert_exit_code 0 "$RC_1" "claude --print exits 0 (run 1)"

BANNER_1="${PROJECT_1}/.final1.txt"
printf '%s\n' "$(smoke_final_text "$SESSION_1")" > "$BANNER_1"
assert_tail_matches "$BANNER_1" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' "run 1 ends with a banner"

CLOSED_1="${PROJECT_1}/${CLOSED_JSON_REL}"
if [[ -f "$CLOSED_1" ]]; then
    assert_pass_raw "run 1: closed.json written"
    assert_json_field "$CLOSED_1" '.verdict' "done-with-gaps" "run 1: verdict is done-with-gaps"
    OUTSTANDING_NAMES_LIVE="$(jq -r '.outstanding // [] | map(.item) | join(" ")' "$CLOSED_1" 2>/dev/null)"
    if [[ "$OUTSTANDING_NAMES_LIVE" == *"${TASK_LIVE}"* ]]; then
        assert_pass_raw "run 1: outstanding names ${TASK_LIVE}"
    else
        assert_fail_raw "run 1: outstanding does not name ${TASK_LIVE} (got: ${OUTSTANDING_NAMES_LIVE})"
    fi
    assert_json_field "$CLOSED_1" '.merged' "true" "run 1: merged is true"
    assert_json_field "$CLOSED_1" '.audit' "null" "run 1: audit is null"
else
    assert_fail_raw "run 1: closed.json not written"
fi

if [[ -f "${PROJECT_1}/.trd-state/current.json" ]]; then
    ALL_NULL="$(jq -e '.prd == null and .trd == null and .status == null and .branch == null' "${PROJECT_1}/.trd-state/current.json" >/dev/null 2>&1 && echo yes || echo no)"
    if [[ "$ALL_NULL" == "yes" ]]; then
        assert_pass_raw "run 1: current.json nulled, all four keys, file kept"
    else
        assert_fail_raw "run 1: current.json not fully nulled: $(cat "${PROJECT_1}/.trd-state/current.json" 2>/dev/null)"
    fi
else
    assert_fail_raw "run 1: current.json missing entirely (must be kept, per D9)"
fi
grep -qF 'never audited' "$SESSION_1" 2>/dev/null && assert_pass_raw "run 1: ISSUES contains 'never audited'" || assert_fail_raw "run 1: 'never audited' not found in transcript"

if grep -qF "$FEATURE" "$BANNER_1" 2>/dev/null; then
    assert_pass_raw "run 1: final banner/summary names the feature (notify summary shares this text)"
else
    assert_fail_raw "run 1: final banner/summary does not name the feature ${FEATURE}"
fi

assert_commit_count_unchanged "$PROJECT_1" "$COMMITS_BEFORE_1" "run 1"
CLOSED_1_HASH_BEFORE9="$(shasum -a 256 "$CLOSED_1" 2>/dev/null | cut -d' ' -f1)"

# --- Run 9: re-run in the SAME project -> already closed ------------------
SESSION_9="${PROJECT_1}/.session-run9.jsonl"
run_close "$PROJECT_1" "${TRD_REL}" "$SESSION_9"
RC_9=$?
assert_exit_code 0 "$RC_9" "claude --print exits 0 (run 9)"
BANNER_9="${PROJECT_1}/.final9.txt"
printf '%s\n' "$(smoke_final_text "$SESSION_9")" > "$BANNER_9"
grep -qi 'already closed' "$SESSION_9" 2>/dev/null && assert_pass_raw "run 9: readout says already closed" || assert_fail_raw "run 9: no 'already closed' text found"
CLOSED_1_HASH_AFTER9="$(shasum -a 256 "$CLOSED_1" 2>/dev/null | cut -d' ' -f1)"
if [[ "$CLOSED_1_HASH_BEFORE9" == "$CLOSED_1_HASH_AFTER9" ]]; then
    assert_pass_raw "run 9: closed.json byte-unchanged"
else
    assert_fail_raw "run 9: closed.json changed on re-run"
fi

# --- Run 10: /implement-trd --resume in the SAME project -> STUCK ----------
IMPLEMENT_JSON_1="${PROJECT_1}/${STATE_DIR_REL}/implement.json"
IMPL_HASH_BEFORE10="$(shasum -a 256 "$IMPLEMENT_JSON_1" 2>/dev/null | cut -d' ' -f1)"
SESSION_10="${PROJECT_1}/.session-run10.jsonl"
smoke_claude "/implement-trd ${TRD_REL} --resume" "$RUN_TIMEOUT" "$PROJECT_1" "$SESSION_10"
RC_10=$?
assert_exit_code 0 "$RC_10" "claude --print exits 0 (run 10, /implement-trd --resume)"
if grep -qi 'delete .trd-state/'"${FEATURE}"'/closed.json to reopen' "$SESSION_10" 2>/dev/null; then
    assert_pass_raw "run 10: STUCK names the reopen path"
else
    assert_fail_raw "run 10: reopen text not found in /implement-trd --resume transcript"
fi
BANNER_10="${PROJECT_1}/.final10.txt"
printf '%s\n' "$(smoke_final_text "$SESSION_10")" > "$BANNER_10"
assert_tail_matches "$BANNER_10" 12 '═══ COMMAND STUCK' "run 10 ends STUCK"
IMPL_HASH_AFTER10="$(shasum -a 256 "$IMPLEMENT_JSON_1" 2>/dev/null | cut -d' ' -f1)"
if [[ "$IMPL_HASH_BEFORE10" == "$IMPL_HASH_AFTER10" ]]; then
    assert_pass_raw "run 10: implement.json byte-unchanged"
else
    assert_fail_raw "run 10: implement.json changed"
fi

COMMITS_BEFORE_RESTORE_1="$(git -C "$PROJECT_1" rev-list --count HEAD)"
if [[ "$COMMITS_BEFORE_1" == "$COMMITS_BEFORE_RESTORE_1" ]]; then
    assert_pass_raw "PROJECT_1: git rev-list --count HEAD unchanged across runs 1/9/10 (none commits)"
else
    assert_fail_raw "PROJECT_1: commit count changed across runs 1/9/10 (${COMMITS_BEFORE_1} -> ${COMMITS_BEFORE_RESTORE_1})"
fi

# --- Run 11: restore current.json, /amend <anything> -> the same STUCK -----
# Commit the restore BEFORE invoking /amend: unlike a real checkout (where
# .gitignore excludes .trd-state/current.json), scaffold-project.sh writes no
# .gitignore into a throwaway project, so current.json is an ordinary tracked
# file there from the initial commit -- leaving this write uncommitted would
# make the post-/amend `git status` show OUR OWN edit, not anything /amend did.
cat > "${PROJECT_1}/.trd-state/current.json" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": ".trd-state/${FEATURE}/implement.json", "branch": "main" }
EOF
git -C "$PROJECT_1" add -A
git -C "$PROJECT_1" commit -q -m "smoke: restore current.json ahead of run 11" --no-verify
SESSION_11="${PROJECT_1}/.session-run11.jsonl"
smoke_claude "/amend make the greeting louder" "$RUN_TIMEOUT" "$PROJECT_1" "$SESSION_11"
RC_11=$?
assert_exit_code 0 "$RC_11" "claude --print exits 0 (run 11, /amend)"
if grep -qi 'delete .trd-state/'"${FEATURE}"'/closed.json to reopen' "$SESSION_11" 2>/dev/null; then
    assert_pass_raw "run 11: /amend STUCK names the same reopen path"
else
    assert_fail_raw "run 11: reopen text not found in /amend transcript"
fi
TRACKED_AFTER11="$(git -C "$PROJECT_1" status --porcelain --untracked-files=no)"
if [[ -z "$TRACKED_AFTER11" ]]; then
    assert_pass_raw "run 11: no tracked file changed"
else
    assert_fail_raw "run 11: tracked files changed: ${TRACKED_AFTER11}"
fi

COMMITS_AFTER_1="$(git -C "$PROJECT_1" rev-list --count HEAD)"
# Exactly one more than the pre-restore count: the harness's own restore
# commit, and nothing /amend added on top of it.
if [[ "$COMMITS_AFTER_1" == "$((COMMITS_BEFORE_RESTORE_1 + 1))" ]]; then
    assert_pass_raw "PROJECT_1: run 11 (/amend) added no commit of its own (only the harness's restore commit)"
else
    assert_fail_raw "PROJECT_1: commit count changed (${COMMITS_BEFORE_RESTORE_1} + 1 restore -> ${COMMITS_AFTER_1}); /amend on a closed feature must not commit"
fi

# =============================================================================
# PROJECT_2: run 2 (sole-evidence STUCK) then run 3 (same project, owner
# evidence + stale audit + current.json pointing elsewhere -> done).
# =============================================================================

PROJECT_2="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close2.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_2")

if ! smoke_close_scaffold_main "$PROJECT_2"; then
    assert_fail_raw "scaffold PROJECT_2"
else
    assert_pass_raw "scaffold PROJECT_2 (branch main, no origin)"

    smoke_write_close_trd_deferred "${PROJECT_2}/${TRD_REL}"
    git -C "$PROJECT_2" add -A
    git -C "$PROJECT_2" commit -q -m "smoke: close-feature fixture, pre-code (audited commit for run 3)" --no-verify
    AUDITED_COMMIT_2="$(git -C "$PROJECT_2" rev-parse HEAD)"

    smoke_write_close_code "$PROJECT_2"
    git -C "$PROJECT_2" add -A
    git -C "$PROJECT_2" commit -q -m "smoke: close-feature fixture (deferred variant, matches PROJECT_1's task map)" --no-verify
    CHECKPOINT_2="$(git -C "$PROJECT_2" rev-parse HEAD)"

    smoke_write_close_implement_json_deferred "${PROJECT_2}/${STATE_DIR_REL}/implement.json" "$TRD_REL" "$CHECKPOINT_2"
    smoke_write_close_verification_state "${PROJECT_2}/${STATE_DIR_REL}/verification-state.json" "not_verifiable" "needs the live environment"
    cat > "${PROJECT_2}/.trd-state/current.json" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": ".trd-state/${FEATURE}/implement.json", "branch": "main" }
EOF

    COMMITS_BEFORE_2="$(git -C "$PROJECT_2" rev-list --count HEAD)"

    # --- Run 2: sole evidence for O2 is not_verifiable -> STUCK ------------
    SESSION_2="${PROJECT_2}/.session-run2.jsonl"
    run_close "$PROJECT_2" "${TRD_REL}" "$SESSION_2"
    RC_2=$?
    assert_exit_code 0 "$RC_2" "claude --print exits 0 (run 2)"
    BANNER_2="${PROJECT_2}/.final2.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_2")" > "$BANNER_2"
    assert_tail_matches "$BANNER_2" 12 '═══ COMMAND STUCK' "run 2 ends STUCK (no other criterion covers O2)"
    if [[ -f "${PROJECT_2}/${CLOSED_JSON_REL}" ]]; then
        assert_fail_raw "run 2: closed.json was written, expected none"
    else
        assert_pass_raw "run 2: no closed.json written"
    fi

    # --- Run 3: same project + owner evidence + stale audit + retargeted
    #     current.json -> done -------------------------------------------
    smoke_write_close_audit_report "${PROJECT_2}/${STATE_DIR_REL}/audit-build-report.md" "$TRD_REL" \
        "$(git -C "$PROJECT_2" rev-parse --short "$AUDITED_COMMIT_2")" \
        "VERDICT: safe to proceed — every requirement is implemented and tested"
    cat > "${PROJECT_2}/.trd-state/current.json" <<'EOF'
{ "prd": null, "trd": "docs/TRD/some-other-feature.md", "status": null, "branch": null }
EOF
    CURRENT_2_HASH_BEFORE_RUN3="$(shasum -a 256 "${PROJECT_2}/.trd-state/current.json" | cut -d' ' -f1)"

    SESSION_3="${PROJECT_2}/.session-run3.jsonl"
    run_close "$PROJECT_2" "${TRD_REL} \"deployed to staging on 2026-09-27 and I ran the live check myself; it passed\"" "$SESSION_3"
    RC_3=$?
    assert_exit_code 0 "$RC_3" "claude --print exits 0 (run 3)"
    BANNER_3="${PROJECT_2}/.final3.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_3")" > "$BANNER_3"
    assert_tail_matches "$BANNER_3" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' "run 3 ends with a banner"

    CLOSED_3="${PROJECT_2}/${CLOSED_JSON_REL}"
    if [[ -f "$CLOSED_3" ]]; then
        assert_pass_raw "run 3: closed.json written"
        assert_json_field "$CLOSED_3" '.verdict' "done" "run 3: verdict is done"
        assert_json_field "$CLOSED_3" '.ownerEvidence.attestedBy' "owner" "run 3: ownerEvidence.attestedBy is owner"
        EVIDENCE_TEXT="$(jq -r '.ownerEvidence.text // empty' "$CLOSED_3" 2>/dev/null)"
        if [[ "$EVIDENCE_TEXT" == "deployed to staging on 2026-09-27 and I ran the live check myself; it passed" ]]; then
            assert_pass_raw "run 3: ownerEvidence.text stored verbatim"
        else
            assert_fail_raw "run 3: ownerEvidence.text was '${EVIDENCE_TEXT}', expected the evidence verbatim"
        fi
        assert_json_field "$CLOSED_3" '.acceptedReason' "null" "run 3: acceptedReason is null (no --accept given)"
        # "Covered by owner evidence" is checked structurally, not by grepping prose for a
        # phrase this command's prompt never mandates verbatim (only the ISSUES lines are
        # literal, per close-feature.md) -- a live run correctly worded this as "your
        # statement... marked as your own claim, not checked by tooling" and failed a
        # substring match on "owner evidence" alone. `outstanding` empty is what "done" (D6)
        # actually requires: the deferred task's own gap must be fully discharged, not merely
        # explained.
        OUTSTANDING_COUNT_3="$(jq '.outstanding | length' "$CLOSED_3" 2>/dev/null)"
        if [[ "$OUTSTANDING_COUNT_3" == "0" ]]; then
            assert_pass_raw "run 3: outstanding is empty (owner evidence fully discharged the deferred task)"
        else
            assert_fail_raw "run 3: outstanding has ${OUTSTANDING_COUNT_3} entries, expected 0 for a done verdict"
        fi
    else
        assert_fail_raw "run 3: closed.json not written"
    fi
    if grep -qF "$TASK_LIVE" "$SESSION_3" 2>/dev/null; then
        assert_pass_raw "run 3: readout names the [LIVE] task ${TASK_LIVE}"
    else
        assert_fail_raw "run 3: readout never names ${TASK_LIVE}"
    fi
    grep -qF 'audit is of' "$SESSION_3" 2>/dev/null && assert_pass_raw "run 3: ISSUES contains 'audit is of'" || assert_fail_raw "run 3: 'audit is of' not found in transcript"
    CURRENT_2_HASH_AFTER="$(shasum -a 256 "${PROJECT_2}/.trd-state/current.json" 2>/dev/null | cut -d' ' -f1)"
    if [[ "$CURRENT_2_HASH_AFTER" == "$CURRENT_2_HASH_BEFORE_RUN3" ]]; then
        assert_pass_raw "run 3: current.json byte-unchanged (it names a different feature)"
    else
        assert_fail_raw "run 3: current.json changed even though it pointed at a different feature"
    fi
    assert_commit_count_unchanged "$PROJECT_2" "$COMMITS_BEFORE_2" "PROJECT_2 runs 2/3"
fi

# =============================================================================
# PROJECT_3: run 4 (unbuilt core, no --accept -> STUCK) then run 5 (same
# project, --accept -> not-done, accepted, no checkpoint commit recorded).
# =============================================================================

PROJECT_3="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close3.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_3")

if ! smoke_close_scaffold_main "$PROJECT_3"; then
    assert_fail_raw "scaffold PROJECT_3"
else
    assert_pass_raw "scaffold PROJECT_3 (branch main, no origin)"

    smoke_write_close_trd_twopending "${PROJECT_3}/${TRD_REL}"
    smoke_write_close_implement_json_twopending "${PROJECT_3}/${STATE_DIR_REL}/implement.json" "$TRD_REL"
    git -C "$PROJECT_3" add -A
    git -C "$PROJECT_3" commit -q -m "smoke: close-feature fixture (two-pending variant, zero success)" --no-verify
    cat > "${PROJECT_3}/.trd-state/current.json" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": ".trd-state/${FEATURE}/implement.json", "branch": "main" }
EOF

    COMMITS_BEFORE_3="$(git -C "$PROJECT_3" rev-list --count HEAD)"
    SESSION_4="${PROJECT_3}/.session-run4.jsonl"
    run_close "$PROJECT_3" "${TRD_REL}" "$SESSION_4"
    RC_4=$?
    assert_exit_code 0 "$RC_4" "claude --print exits 0 (run 4)"
    BANNER_4="${PROJECT_3}/.final4.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_4")" > "$BANNER_4"
    assert_tail_matches "$BANNER_4" 12 '═══ COMMAND STUCK' "run 4 ends STUCK (zero success, no --accept)"
    if [[ -f "${PROJECT_3}/${CLOSED_JSON_REL}" ]]; then
        assert_fail_raw "run 4: closed.json was written, expected none"
    else
        assert_pass_raw "run 4: no closed.json written"
    fi

    SESSION_5="${PROJECT_3}/.session-run5.jsonl"
    run_close "$PROJECT_3" "${TRD_REL} --accept \"superseded by another design\"" "$SESSION_5"
    RC_5=$?
    assert_exit_code 0 "$RC_5" "claude --print exits 0 (run 5)"
    BANNER_5="${PROJECT_3}/.final5.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_5")" > "$BANNER_5"
    assert_tail_matches "$BANNER_5" 12 '═══ COMMAND COMPLETE' "run 5 ends COMPLETE (--accept given)"

    CLOSED_5="${PROJECT_3}/${CLOSED_JSON_REL}"
    if [[ -f "$CLOSED_5" ]]; then
        assert_pass_raw "run 5: closed.json written"
        assert_json_field "$CLOSED_5" '.verdict' "not-done" "run 5: verdict is not-done"
        assert_json_field "$CLOSED_5" '.acceptedReason' "superseded by another design" "run 5: acceptedReason verbatim"
        UNFINISHED_COUNT="$(jq '.unfinished | length' "$CLOSED_5" 2>/dev/null)"
        if [[ "$UNFINISHED_COUNT" == "2" ]]; then
            assert_pass_raw "run 5: unfinished lists both tasks (2)"
        else
            assert_fail_raw "run 5: unfinished has ${UNFINISHED_COUNT} entries, expected 2"
        fi
        assert_json_field "$CLOSED_5" '.checkpointCommit' "null" "run 5: checkpointCommit is null"
        assert_json_field "$CLOSED_5" '.merged' "null" "run 5: merged is null"
    else
        assert_fail_raw "run 5: closed.json not written"
    fi
    grep -qF '2 of 2 tasks accepted unfinished' "$SESSION_5" 2>/dev/null && assert_pass_raw "run 5: ISSUES contains '2 of 2 tasks accepted unfinished'" || assert_fail_raw "run 5: that ISSUES text was not found"
    grep -qi 'no checkpoint commit' "$SESSION_5" 2>/dev/null && assert_pass_raw "run 5: readout says no checkpoint commit was recorded" || assert_fail_raw "run 5: readout does not say so"
    assert_commit_count_unchanged "$PROJECT_3" "$COMMITS_BEFORE_3" "PROJECT_3 runs 4/5"
fi

# =============================================================================
# PROJECT_4: run 6 (never implemented, no --accept -> STUCK) then run 7
# (same project, --accept -> abandoned, not-done).
# =============================================================================

PROJECT_4="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close4.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_4")

if ! smoke_close_scaffold_main "$PROJECT_4"; then
    assert_fail_raw "scaffold PROJECT_4"
else
    assert_pass_raw "scaffold PROJECT_4 (branch main, no origin)"

    smoke_write_close_trd_deferred "${PROJECT_4}/${TRD_REL}"
    git -C "$PROJECT_4" add -A
    git -C "$PROJECT_4" commit -q -m "smoke: close-feature fixture, TRD only, no implement.json" --no-verify

    COMMITS_BEFORE_4="$(git -C "$PROJECT_4" rev-list --count HEAD)"
    SESSION_6="${PROJECT_4}/.session-run6.jsonl"
    run_close "$PROJECT_4" "${TRD_REL}" "$SESSION_6"
    RC_6=$?
    assert_exit_code 0 "$RC_6" "claude --print exits 0 (run 6)"
    BANNER_6="${PROJECT_4}/.final6.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_6")" > "$BANNER_6"
    assert_tail_matches "$BANNER_6" 12 '═══ COMMAND STUCK' "run 6 ends STUCK (never implemented, no --accept)"
    if [[ -f "${PROJECT_4}/${CLOSED_JSON_REL}" ]]; then
        assert_fail_raw "run 6: closed.json was written, expected none"
    else
        assert_pass_raw "run 6: no closed.json written"
    fi

    SESSION_7="${PROJECT_4}/.session-run7.jsonl"
    run_close "$PROJECT_4" "${TRD_REL} --accept \"design abandoned\"" "$SESSION_7"
    RC_7=$?
    assert_exit_code 0 "$RC_7" "claude --print exits 0 (run 7)"
    BANNER_7="${PROJECT_4}/.final7.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_7")" > "$BANNER_7"
    assert_tail_matches "$BANNER_7" 12 '═══ COMMAND COMPLETE' "run 7 ends COMPLETE (--accept given)"

    CLOSED_7="${PROJECT_4}/${CLOSED_JSON_REL}"
    if [[ -f "$CLOSED_7" ]]; then
        assert_pass_raw "run 7: closed.json written"
        assert_json_field "$CLOSED_7" '.abandoned' "true" "run 7: abandoned is true"
        assert_json_field "$CLOSED_7" '.verdict' "not-done" "run 7: verdict is not-done"
    else
        assert_fail_raw "run 7: closed.json not written"
    fi
    assert_commit_count_unchanged "$PROJECT_4" "$COMMITS_BEFORE_4" "PROJECT_4 runs 6/7"
fi

# =============================================================================
# PROJECT_5: run 8 (PROJECT_1's fixture, wrong branch -> STUCK naming main).
# =============================================================================

PROJECT_5="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-close5.XXXXXX")"
PROJECT_DIRS+=("$PROJECT_5")

if ! smoke_close_scaffold_main "$PROJECT_5"; then
    assert_fail_raw "scaffold PROJECT_5"
else
    assert_pass_raw "scaffold PROJECT_5 (branch main, no origin)"

    smoke_write_close_trd_deferred "${PROJECT_5}/${TRD_REL}"
    smoke_write_close_code "$PROJECT_5"
    git -C "$PROJECT_5" add -A
    git -C "$PROJECT_5" commit -q -m "smoke: close-feature fixture (deferred variant)" --no-verify
    CHECKPOINT_5="$(git -C "$PROJECT_5" rev-parse HEAD)"
    smoke_write_close_implement_json_deferred "${PROJECT_5}/${STATE_DIR_REL}/implement.json" "$TRD_REL" "$CHECKPOINT_5"
    smoke_write_close_verification_state "${PROJECT_5}/${STATE_DIR_REL}/verification-state.json" "met" "Automated post-deploy smoke check hit the staging health endpoint and received HTTP 200 with the expected banner text."
    cat > "${PROJECT_5}/.trd-state/current.json" <<EOF
{ "prd": null, "trd": "${TRD_REL}", "status": ".trd-state/${FEATURE}/implement.json", "branch": "feature/x" }
EOF
    git -C "$PROJECT_5" checkout -q -b feature/x

    SESSION_8="${PROJECT_5}/.session-run8.jsonl"
    run_close "$PROJECT_5" "${TRD_REL}" "$SESSION_8"
    RC_8=$?
    assert_exit_code 0 "$RC_8" "claude --print exits 0 (run 8)"
    BANNER_8="${PROJECT_5}/.final8.txt"
    printf '%s\n' "$(smoke_final_text "$SESSION_8")" > "$BANNER_8"
    assert_tail_matches "$BANNER_8" 12 '═══ COMMAND STUCK' "run 8 ends STUCK (wrong branch)"
    # The final message only: the whole stream-json transcript mentions "main"
    # (tool calls, the fallback itself, "remaining"...) whatever the banner says.
    grep -qw 'main' "$BANNER_8" 2>/dev/null && assert_pass_raw "run 8: STUCK names main" || assert_fail_raw "run 8: 'main' not found in the final STUCK message"
    if [[ -f "${PROJECT_5}/${CLOSED_JSON_REL}" ]]; then
        assert_fail_raw "run 8: closed.json was written, expected none"
    else
        assert_pass_raw "run 8: no closed.json written"
    fi
fi

smoke_finish
