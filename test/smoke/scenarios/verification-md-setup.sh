#!/usr/bin/env bash
# =============================================================================
# verification-md-setup - Scenario: verification.md's old-shape detection +
#                          coverage floor, end to end through /verify-build
# =============================================================================
#
# Exercises the seam between the CLI (VSET-B001's functional-verification.js
# `check-verification-unfilled` / `read-coverage-floor` subcommands), the
# workflow argument (VSET-B002's `coverageFloor` on the verify-functional
# Workflow) and the command prose (VSET-B003's implement-trd.md §3.6a/§8.1a
# and verify-build.md's identical steps) -- no single VSET task owns this
# seam end to end, so it gets its own scenario.
#
#   Fixture: a HAND-FILLED `.claude/rules/verification.md`, based on the
#   pre-1.5.0 shape (`packages/core/lib/__fixtures__/verification.pre-1.5.0.md`
#   -- D10's `resource-capacity` / `write-permission-column` / `refresh-split`
#   are all genuinely absent from it), with concrete fixture-appropriate
#   values filled in and a hand-appended `## 5a. Coverage floor` section
#   reading `Coverage floor: 50%` (D7's shape -- written directly by this
#   script, not by `/verification-setup`; see below).
#
#   The matching PRD names FOUR requirements: FR-1 (a `greet()` function) is
#   implemented and tested. FR-2/FR-3/FR-4 each name a capability the
#   hand-filled file's §5 lists as unverifiable here (a Salesforce sync, an
#   outbound email, an undeclared staging environment) -- so all three
#   resolve `not_verifiable` at the environment preflight (§3.6a/§8.1a)
#   BEFORE any Exercise attempt, never `unbuilt`. That keeps the run on the
#   `exit-satisfied` -> coverage-relabel path (1 of 4 proven, a 25% ratio
#   below the file's 50% floor) rather than the `exit-unbuilt` path a
#   criterion with genuinely no code would otherwise take (VSET-T001
#   grounding: `unbuilt` wins over the coverage relabel by design, so this
#   fixture must never let a criterion resolve `unbuilt`).
#
#   ONE `/verify-build <trd>` run (no `--fix`, no flags) -- one iteration is
#   enough: no gaps ever open (FR-2/3/4 settle `not_verifiable` before any
#   Exercise attempt runs, FR-1 settles `met`), so no Debug stage and no
#   second iteration.
#
#   The interview skill (`/verification-setup`) is NOT invoked here -- per
#   §6.1 and this task's own text, it asks questions and cannot run headless
#   (VSET-T001 grounding). This scenario proves the reading-and-reporting
#   side only: the readout naming the skill and what verification.md is
#   missing, and the floor actually reaching the Judge.
#
# opt-in (registered in LLM_OPT_IN_SCENARIOS, not ALL_SCENARIOS) -- skips
# (not fails) when the `claude` CLI or `jq` is unavailable.
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

FEATURE="smoke-vset"
TASK_ID="SMOKE-VSET-001"
TRD_REL="docs/TRD/${FEATURE}.md"
PRD_REL="docs/PRD/${FEATURE}.md"
STATE_DIR_REL=".trd-state/${FEATURE}"
VERIFICATION_MD_REL=".claude/rules/verification.md"

# smoke_write_vset_prd <prd_path> <feature_name>
# FOUR requirements: FR-1 is built+tested; FR-2/FR-3/FR-4 each name exactly
# one of the capabilities the fixture's hand-filled verification.md §5 lists
# as unverifiable here -- Salesforce, outbound email, an undeclared staging
# environment -- so the derive agent's criteria for them resolve
# `not_verifiable` at the environment preflight rather than `unbuilt`.
smoke_write_vset_prd() {
    local prd_path="$1" feature_name="$2"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${feature_name} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke-test fixture PRD for the verification-md-setup scenario. Four independent,
trivially-checkable requirements — one built and observable, three that each need a
capability this project's \`.claude/rules/verification.md\` §5 already names as
unverifiable here.

## 2. Functional Requirements

- FR-1: Calling \`greet()\` returns the exact string \`'hello'\`.
- FR-2: Completing a checkout triggers a Salesforce sync record for the order.
- FR-3: A confirmation email is sent to the user after signup.
- FR-4: The staging environment shows the new pricing page within one hour of a deploy.

## 3. Non-Goals

- Anything beyond these four requirements. No CLI, no additional modules, no auth,
  no persistence. FR-2/FR-3/FR-4 are deliberately never built — see \`.claude/rules/verification.md\`
  §5 for why they cannot be verified in this project.
EOF
}

# smoke_write_vset_trd <trd_path> <task_id> <feature_name> <prd_rel>
# Names only FR-1's task. FR-2/FR-3/FR-4 are deliberately unplanned and
# unbuilt — the point of this fixture is that the environment preflight
# resolves them `not_verifiable`, never that a task list omission forces
# `unbuilt` instead.
smoke_write_vset_trd() {
    local trd_path="$1" task_id="$2" feature_name="$3" prd_rel="$4"
    mkdir -p "$(dirname "$trd_path")"
    cat > "$trd_path" <<EOF
# ${feature_name} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${prd_rel}\`

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD (verification-md-setup scenario). Adds a single trivial
module, \`src/greet.js\`, exporting a \`greet()\` function that returns the string
\`'hello'\`, satisfying FR-1. FR-2/FR-3/FR-4 (Salesforce, email, staging) are
intentionally out of scope for this task list — see the fixture PRD's Non-Goals.

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

- FR-2 (Salesforce sync), FR-3 (confirmation email) and FR-4 (staging deploy) are
  deliberately out of THIS task list — each names a capability
  \`.claude/rules/verification.md\` §5 already documents as unverifiable here.
EOF
}

# smoke_write_vset_code <project_dir>
# FR-1 implemented and tested. Nothing else — no salesforce/email/staging code
# at all, which is fine here because those criteria never reach an Exercise
# attempt (they resolve `not_verifiable` at the environment preflight).
smoke_write_vset_code() {
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

# smoke_write_vset_verification_md <path>
# Hand-filled pre-1.5.0-shape verification.md (D10's three sections genuinely
# absent: no §1a resource-capacity heading, no "Loop may WRITE data?" column,
# no "fast refresh"/"full deploy" split) plus a hand-appended `## 5a. Coverage
# floor` section (D7's shape) reading `Coverage floor: 50%`. §5 names the
# three capabilities FR-2/FR-3/FR-4 each depend on, so the environment
# preflight resolves all three `not_verifiable` rather than `unbuilt`.
smoke_write_vset_verification_md() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<'EOF'
# Verification environments

**Owner-governed, like `stack.md`. An agent READS this and never writes it.**

`stack.md` is a declarative inventory — languages, frameworks, hosting. It says nothing
about how to REACH a running instance, and that is exactly what a functional verifier needs.
This file is that missing half, and it is the difference between a verification loop that
can correct itself and one that reports `stalled` because it was measuring a build nobody
refreshed.

**Why the owner writes it and not an agent:** which instance is safe to exercise, whether a
deploy is allowed, where credentials live — these are infrastructure policy, not
observations. An agent inferring them from a codebase is guessing at your rules.

---

## 1. Environments

One row per environment the verifier may encounter. **An environment that is not listed is
not authorized**, and criteria needing it resolve to `not verifiable here` rather than
to a guessed endpoint.

| Name | URL / how to reach it | What it is for | Loop may DEPLOY to it? | Loop may RESTART it? |
|------|----------------------|----------------|------------------------|----------------------|
| local | fixture code only — no server, no network | day-to-day functional verification | n/a — it runs from the working tree | yes, freely |
| dev | | shared integration checks | | |
| production | | — | **never** | **never** |

## 2. Bringing the environment to the new code

**This is the row that makes the correction loop work.** After the loop's Debug stage edits
source, the next Exercise pass measures whatever is RUNNING. If nothing refreshed it, it
measures the old build, the gap cannot close, and the loop exits `stalled` — blaming the
debugger for a fix that in fact worked.

State the command for each environment the loop is allowed to refresh:

| Environment | Refresh command | Roughly how long |
|-------------|-----------------|------------------|
| local | `npm test -- src/greet.test.js` | seconds |
| dev | | |

**If an environment cannot be refreshed by the loop, say so here.** That is a legitimate
answer, and it is far better than silence: the loop then knows to verify once and report,
rather than iterating against a frozen target.

## 3. Test identities and credentials

**Record WHERE a credential lives, never its value.** This file is committed. A test
password written here is a leaked credential in git history.

| What | Where it lives | Notes |
|------|---------------|-------|
| test user | not applicable — this fixture needs no login | |

## 4. Verification tooling actually installed

Not what the stack could support — what is wired up and runnable today.

| Tool | Installed? | Config |
|------|-----------|--------|
| Playwright / browser automation | no | |
| HTTP client for API checks | no | |

## 5. What CANNOT be verified here

**The most valuable section, and the one to fill in first.** An unverifiable capability that
is written down is a stated gap. The same capability unwritten is an invisible one, and the
report will show it as a pass.

- Salesforce sync — no sandbox credentials are configured in this fixture project; the
  integration cannot be exercised headlessly.
- Outbound email delivery — no test inbox is wired up to read from in this fixture project.
- The staging environment — not declared in §1 of this file; nothing here is authorized to
  reach it.

## 5a. Coverage floor

Coverage floor: 50%

Why: fixture value for the verification-md-setup smoke scenario, set so the fixture's
one-of-four proven ratio (25%) falls below it while a genuinely satisfied run of this same
fixture (all four proven) would still clear it.

## 6. Multi-repo

When the system spans repositories, name them and say which holds what. A verifier that
resolves paths against the wrong tree reports gaps that do not exist.

| Repo | Path | Holds |
|------|------|-------|
| | | |
EOF
}

# run_verify_build <project_dir> <session_file> <timeout_secs>
# Scaffolds a fresh throwaway project, overwrites its verification.md with
# the hand-filled fixture above, writes+commits the PRD/TRD/code fixtures,
# runs `claude --print "/verify-build <trd>"`, and returns claude's exit
# code. Leaves the final assistant message in "${project_dir}/.final_text".
run_verify_build() {
    local project_dir="$1" session_file="$2" timeout_s="$3"

    RUN_SCAFFOLD_OK=false
    if ! smoke_scaffold_project "$project_dir"; then
        assert_fail_raw "scaffold throwaway project ($project_dir)"
        return 1
    fi
    RUN_SCAFFOLD_OK=true
    assert_pass_raw "scaffold throwaway project ($project_dir)"

    smoke_write_vset_verification_md "${project_dir}/${VERIFICATION_MD_REL}"
    smoke_write_vset_prd "${project_dir}/${PRD_REL}" "$FEATURE"
    smoke_write_vset_trd "${project_dir}/${TRD_REL}" "$TASK_ID" "$FEATURE" "$PRD_REL"
    smoke_write_vset_code "$project_dir"

    assert_file_nonempty "${project_dir}/${VERIFICATION_MD_REL}" "hand-filled verification.md written ($VERIFICATION_MD_REL)"
    assert_file_nonempty "${project_dir}/${PRD_REL}" "fixture PRD written ($PRD_REL)"
    assert_file_nonempty "${project_dir}/${TRD_REL}" "fixture TRD written ($TRD_REL)"
    assert_file_nonempty "${project_dir}/src/greet.js" "fixture greet.js written (FR-1)"

    # Recorded BEFORE the commit and BEFORE the model runs — this is the
    # baseline "byte-unchanged" (D13/NG2: an autonomous run never edits
    # verification.md) is checked against after the run.
    VERIFICATION_MD_HASH_BEFORE="$(smoke_file_hash "${project_dir}/${VERIFICATION_MD_REL}")"

    git -C "$project_dir" add -A
    git -C "$project_dir" commit -q -m "smoke: add verification-md-setup fixture (hand-filled verification.md, FR-1 built, FR-2/3/4 not)" --no-verify

    smoke_claude "/verify-build ${TRD_REL}" "$timeout_s" "$project_dir" "$session_file"
    local rc=$?
    assert_exit_code 0 "$rc" "claude --print exits 0 (/verify-build ${TRD_REL})"

    local final_text banner_file
    final_text="$(smoke_final_text "$session_file")"
    banner_file="${project_dir}/.final_text"
    printf '%s\n' "$final_text" > "$banner_file"
    assert_tail_matches "$banner_file" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
        "output ends with a COMMAND COMPLETE/STUCK banner"

    return "$rc"
}

# =============================================================================
# Single throwaway project, single run.
# =============================================================================

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-vset.XXXXXX")"

# PRESERVE THE EVIDENCE ON FAILURE (verify-functional.sh's dated rationale,
# unchanged here: a scenario that destroys the state needed to diagnose its
# own failure can only ever tell you THAT something broke).
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch project PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)): $PROJECT_DIR"
        echo "  remove it yourself when done: rm -rf $PROJECT_DIR"
        return 0
    fi
    rm -rf "$PROJECT_DIR"
}
trap cleanup EXIT INT TERM

# Internal timeout, below this scenario's own SCENARIO_TIMEOUT cap in
# run-smoke.sh (that cap must exceed this plus scaffolding/fixture-write
# overhead; raise both together). This run pays for: the foreground
# success-definition derive (product-manager, waited on synchronously —
# verify-build.md §3a) plus ONE verification iteration (Exercise + Judge —
# no Debug stage, since no gaps ever open: FR-2/3/4 settle `not_verifiable`
# at the environment preflight before any Exercise attempt, FR-1 settles
# `met`). Sized like verify-fix.sh's TIMEOUT_RUN1, which pays for the same
# two stages.
TIMEOUT_RUN=1500

SESSION_FILE="${PROJECT_DIR}/.session.jsonl"
RUN_SCAFFOLD_OK=false
run_verify_build "$PROJECT_DIR" "$SESSION_FILE" "$TIMEOUT_RUN"
RUN_RC=$?
# Scaffolding failed: nothing downstream can mean anything — report the one
# real failure rather than a cascade of misleading missing-file assertions.
if [[ "$RUN_SCAFFOLD_OK" != "true" ]]; then
    smoke_finish
fi

if [[ "$RUN_RC" -ne 0 ]]; then
    # VACUOUS-PASS GUARD (verify-functional.sh's discipline): a killed/timed-out
    # run cannot have produced meaningful output, so every downstream
    # assertion about ITS CONTENT is inconclusive, not a pass or a fail on
    # the feature under test.
    assert_fail_raw "run assertions — INCONCLUSIVE: run exited ${RUN_RC} (124 = timeout), so its content proves nothing"
    smoke_finish
fi

STATE_DIR="${PROJECT_DIR}/${STATE_DIR_REL}"
REPORT_FILE="${STATE_DIR}/verification-report.md"
STATE_FILE="${STATE_DIR}/verification-state.json"

# =============================================================================
# 1. The readout names the three missing sections and /verification-setup
#    (D10 -- the fixture's verification.md is FILLED but written to the
#    pre-1.5.0 shape, so `unfilled: false` with `missingSections` non-empty
#    -- implement-trd.md §3.6a's "written to an older template shape" branch).
#    This is reported in the readout (final banner turn), not necessarily in
#    the report file, so check the whole session transcript.
# =============================================================================

ALL_TEXT_FILE="${PROJECT_DIR}/.all_text.txt"
grep '^{' "$SESSION_FILE" 2>/dev/null | jq -rs '
    [.[] | select(.type=="assistant")] |
    map(($.message.content // [])[]? | select(.type=="text") | .text) | join("\n---\n")
' > "$ALL_TEXT_FILE" 2>/dev/null

assert_contains "$ALL_TEXT_FILE" "verification-setup" \
    "readout names /verification-setup (D10/D15)"
assert_contains "$ALL_TEXT_FILE" "resource capacity" \
    "readout names the missing resource-capacity section"
assert_contains "$ALL_TEXT_FILE" "Loop may WRITE data" \
    "readout names the missing write-permission-column section"
if grep -qiE 'fast refresh.*full deploy|full deploy.*fast refresh' "$ALL_TEXT_FILE" 2>/dev/null; then
    assert_pass_raw "readout names the missing refresh-split section"
else
    assert_fail_raw "readout does not name the missing refresh-split section (fast refresh / full deploy)"
fi

# =============================================================================
# 2. verification-state.json (or the report) shows outcome
#    insufficient-coverage, with a reason containing 50%
# =============================================================================

if [[ -f "$STATE_FILE" ]]; then
    assert_pass_raw "verification-state.json written"
    assert_json_field "$STATE_FILE" '.outcome' "insufficient-coverage" \
        "outcome is insufficient-coverage (1/4 proven vs. a 50% floor)"
    STATE_REASON="$(jq -r '.reason // empty' "$STATE_FILE" 2>/dev/null)"
    if [[ "$STATE_REASON" == *"50%"* ]]; then
        assert_pass_raw "verification-state.json reason names the 50% floor"
    else
        assert_fail_raw "verification-state.json reason does not name 50% (got: ${STATE_REASON:0:200})"
    fi
else
    assert_fail_raw "verification-state.json not found"
fi

if [[ -f "$REPORT_FILE" ]]; then
    assert_pass_raw "verification-report.md written"
else
    assert_fail_raw "verification-report.md not found"
fi

# =============================================================================
# 3. The readout says "Coverage floor: 50%" (D19)
# =============================================================================

assert_contains "$ALL_TEXT_FILE" "Coverage floor: 50%" \
    "readout states Coverage floor: 50% (D19)"

# =============================================================================
# 4. The workflow's Judge prompt in the transcript carries "coverageFloor":0.5
#    (D8 -- the fraction, not the percentage, is what crosses the wire). This
#    is inside a tool_use input (the Workflow dispatch), not assistant text,
#    so it is checked against the RAW session file, not the text-only extract
#    above -- same raw-substring fallback style as smoke_agent_invoked.
# =============================================================================

if grep -qF '"coverageFloor":0.5' "$SESSION_FILE" 2>/dev/null; then
    assert_pass_raw 'the coverageFloor:0.5 fraction reached the workflow dispatch (D8)'
else
    assert_fail_raw 'no "coverageFloor":0.5 found anywhere in the session transcript'
fi

# =============================================================================
# 5. .claude/rules/verification.md is byte-unchanged (D13/NG2: an autonomous
#    run never edits this file, even to fill in what it detects is missing)
# =============================================================================

if [[ -f "${PROJECT_DIR}/${VERIFICATION_MD_REL}" ]]; then
    VERIFICATION_MD_HASH_AFTER="$(smoke_file_hash "${PROJECT_DIR}/${VERIFICATION_MD_REL}")"
    if [[ "$VERIFICATION_MD_HASH_AFTER" == "$VERIFICATION_MD_HASH_BEFORE" ]]; then
        assert_pass_raw "verification.md is byte-unchanged after the run (D13/NG2)"
    else
        assert_fail_raw "verification.md CHANGED during the run — an autonomous run must never edit it (D13/NG2)"
    fi
else
    assert_fail_raw "verification.md no longer exists after the run"
fi

smoke_finish
