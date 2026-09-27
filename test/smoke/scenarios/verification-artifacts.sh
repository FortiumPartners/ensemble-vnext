#!/usr/bin/env bash
# =============================================================================
# verification-artifacts - Scenario: /verify-build with a design-comparison check
# =============================================================================
#
# End-to-end coverage for the verification-artifacts TRD's design comparison
# (D12): a fixture project ships a two-frame design handoff (two PNGs under
# docs/design/<slug>/screens/png/) and a tiny static-HTML "app" that stands in
# for the build. Two throwaway projects, each run ONCE with /verify-build and
# publishing off (`ensemble.publishArtifacts: false`, so no live Artifact
# call is made):
#
#   Run A: the fixture TRD's `## Verification Artifacts` section NAMES
#     verify-design-comparison explicitly (a table row).
#   Run B: the fixture TRD has NO `## Verification Artifacts` section at all
#     -- the same PRD, so §8.1b/D9's fallback must select the check from the
#     PRD's own inputs and record why in the readout's DECISIONS section.
#
# Both runs assert on FILES, not prose (VART-T001 grounding, "Careful"):
#   - success-definition.md carries the two check-derived rows
#     (Derivation `check:verify-design-comparison`, IDs `DC-01-home` /
#     `DC-02-detail`, one per design frame).
#   - verification-state.json carries an entry with a status for each ID.
#   - <pagesDir>/verify-design-comparison/index.html exists, holds one card
#     per frame with a status from the six-value set (match/minor/deviates/
#     superseded/uncaptured/spec), an overlay slider (`type="range"`), and
#     verdicts.json sits beside it.
#   - Run B's readout additionally carries a DECISIONS line naming the check
#     as selected from the PRD (the only assertion here that touches the
#     model's prose, and only loosely -- the exact wording is the model's).
#
# What this scenario deliberately does NOT assert: which of the six page
# statuses a frame gets. This repo has no headless-browser / Playwright
# capability installed (confirmed absent from package.json and .mcp.json,
# VART-T001 grounding "Careful") to back a live screen capture, so a real run
# may legitimately end every frame `uncaptured` with a stated reason -- that
# is D16's own escape valve, not a defect, and asserting a forced verdict
# here would be exactly the "never assert an outcome the agents can
# legitimately avoid" mistake verify-functional.sh's own comments warn about
# (see its SHARED_COUNT block). The fixture app and frames exist so a
# capture-capable host CAN produce match/minor/deviates verdicts; a
# capture-incapable host produces uncaptured ones just as validly, and both
# still exercise every file this scenario checks.
#
# One-throwaway-project-per-run (verify-functional.sh's shape, VART-T001
# grounding "Follow") -- fixture PRD/TRD/design assets are written by
# heredocs local to this scenario, never produced by /create-trd or /plan.
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
if ! command -v python3 &>/dev/null; then
    smoke_skip "python3 not installed (needed to write the fixture design PNGs)"
fi

DESIGN_SLUG="smoke-vart-app"
FRAME1_STEM="01-home"
FRAME2_STEM="02-detail"
DC_ID1="DC-${FRAME1_STEM}"
DC_ID2="DC-${FRAME2_STEM}"

# smoke_write_vart_png <path>
# Writes a minimal, valid 1x1 PNG. Content is irrelevant here -- only the
# frame's PRESENCE and file stem matter to the check skill's ID derivation
# (`DC-<frame stem>`) -- so a tiny stock pixel keeps the fixture cheap.
smoke_write_vart_png() {
    local path="$1"
    mkdir -p "$(dirname "$path")"
    python3 - "$path" <<'PY'
import sys, base64
# 1x1 transparent PNG, well-formed (valid IHDR/IDAT/IEND chain).
data = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
with open(sys.argv[1], "wb") as f:
    f.write(data)
PY
}

# smoke_write_vart_fixture_assets <project_dir>
# Writes the two design frames, a routes manifest mapping each frame stem to
# the static page that renders it, and a tiny static-HTML "app" (index.html /
# detail.html) that stands in for a running build.
smoke_write_vart_fixture_assets() {
    local project_dir="$1"
    local design_dir="${project_dir}/docs/design/${DESIGN_SLUG}/screens/png"
    local app_dir="${project_dir}/fixture-app"

    smoke_write_vart_png "${design_dir}/${FRAME1_STEM}.png"
    smoke_write_vart_png "${design_dir}/${FRAME2_STEM}.png"

    mkdir -p "$(dirname "${project_dir}/docs/design/${DESIGN_SLUG}/routes.md")"
    cat > "${project_dir}/docs/design/${DESIGN_SLUG}/routes.md" <<EOF
# ${DESIGN_SLUG} — frame routes

| Frame | Route |
|-------|-------|
| ${FRAME1_STEM} | \`fixture-app/index.html\` |
| ${FRAME2_STEM} | \`fixture-app/detail.html\` |
EOF

    mkdir -p "$app_dir"
    cat > "${app_dir}/index.html" <<'EOF'
<!doctype html>
<html><head><title>Smoke fixture — home</title></head>
<body>
<h1>Home</h1>
<p>Smoke-test fixture app (verification-artifacts scenario). Static, no build step.</p>
<a href="detail.html">Go to detail</a>
</body></html>
EOF
    cat > "${app_dir}/detail.html" <<'EOF'
<!doctype html>
<html><head><title>Smoke fixture — detail</title></head>
<body>
<h1>Detail</h1>
<p>Smoke-test fixture app (verification-artifacts scenario). Static, no build step.</p>
<a href="index.html">Back to home</a>
</body></html>
EOF

    # The fixture's OWN verification.md (.claude/rules/verification.md), read
    # by /verify-build's step 2 preflight (identical to implement-trd.md
    # §3.6a) -- overwrites scaffold-project.sh's blank template so the one
    # declared environment resolves without asking a question.
    mkdir -p "${project_dir}/.claude/rules"
    cat > "${project_dir}/.claude/rules/verification.md" <<EOF
# Verification environments

## 1. Environments

| Name | URL / how to reach it | What it is for | Loop may DEPLOY to it? | Loop may RESTART it? |
|------|------------------------|-----------------|------------------------|------------------------|
| local | \`python3 -m http.server 8420 --directory fixture-app\`, then \`http://localhost:8420/\` | serving the static fixture app for the design-comparison capture | n/a — static files, nothing to deploy | yes, freely |

## 2. Bringing the environment to the new code

| Environment | Refresh command | Roughly how long |
|-------------|-----------------|-------------------|
| local | none — static HTML; a changed file takes effect on the next page load | instant |

## 3. Test identities and credentials

None. The fixture app has no auth.

## 4. Verification tooling actually installed

| Tool | Installed? | Config |
|------|-----------|--------|
| Playwright / browser automation | not installed in this fixture project | — |
| HTTP client for API checks | not needed — no API in this fixture | — |

## 5. What CANNOT be verified here

- Pixel-accurate screen capture — this fixture ships no headless-browser
  capability. If none is reachable in the running session either, capture
  the frame's state by any other means available, or record \`uncaptured\`
  with that reason (D16) rather than guessing.

## 6. Multi-repo

Single repo — this fixture project only.
EOF
}

# smoke_write_vart_prd <prd_path> <feature_name>
# There is no `smoke_write_prd` helper in lib/project.sh (same gap
# verify-functional.sh's grounding names) -- this scenario supplies its own
# minimal PRD whose UI is specified by reference design frames, which is
# verify-design-comparison's own trigger (its SKILL.md "When it applies").
smoke_write_vart_prd() {
    local prd_path="$1" feature_name="$2"
    mkdir -p "$(dirname "$prd_path")"
    cat > "$prd_path" <<EOF
# ${feature_name} — Product Requirements Document

**Version**: 1.0.0
**Status**: Draft

## 1. Overview

Smoke-test fixture PRD for the verification-artifacts scenario. Describes a
trivial two-screen static app whose UI is specified by reference design
frames exported to this repository.

## 2. Design

The UI for this feature is specified by the design frames exported at
\`docs/design/${DESIGN_SLUG}/screens/png/\` (\`${FRAME1_STEM}.png\`,
\`${FRAME2_STEM}.png\`), with routes to reach each frame's state recorded at
\`docs/design/${DESIGN_SLUG}/routes.md\`.

## 3. Functional Requirements

- FR-1: A home screen renders, matching the \`${FRAME1_STEM}\` design frame.
- FR-2: A detail screen renders, matching the \`${FRAME2_STEM}\` design frame.

## 4. Non-Goals

- Anything beyond these two static screens. No CLI, no additional modules,
  no auth, no persistence, no data-driven content.
EOF
}

# smoke_write_vart_trd <trd_path> <feature_name> <prd_rel> <with_section>
# `with_section=true` writes a `## Verification Artifacts` section naming
# verify-design-comparison explicitly (Run A). `with_section=false` omits the
# section entirely (Run B) so §8.1b/D9's PRD-driven fallback is what selects
# the check. `smoke_write_trd()` (lib/project.sh) does not emit a
# `**Source PRD**:` header (VART-T001 grounding "Careful", inherited from
# FV-T001) -- this scenario writes its own fixture with that header, in the
# bare-backticked-path form implement-trd.md §3.6 step 1 documents.
smoke_write_vart_trd() {
    local trd_path="$1" feature_name="$2" prd_rel="$3" with_section="$4"
    mkdir -p "$(dirname "$trd_path")"

    local artifacts_section
    if [[ "$with_section" == "true" ]]; then
        artifacts_section="## Verification Artifacts

| Skill | Inputs | Why it applies |
|-------|--------|-----------------|
| verify-design-comparison | design frames: \`docs/design/${DESIGN_SLUG}/screens/png/\`; routes: \`docs/design/${DESIGN_SLUG}/routes.md\` | the PRD's UI is specified by a design handoff |

Omitted: verify-flow-as-built — no interaction diagram or screen-to-screen journey is named.
Omitted: verify-data-fidelity — this fixture renders no API or store data."
    else
        artifacts_section=""
    fi

    cat > "$trd_path" <<EOF
# ${feature_name} — Technical Requirements Document

**Version**: 1.0.0
**Status**: Draft
**Source PRD**: \`${prd_rel}\`

## 1. Overview

### 1.1 Technical Summary

Smoke-test fixture TRD (verification-artifacts scenario). The build is the
static two-page app already present at \`fixture-app/\`; nothing is
implemented by a task here. This TRD exists only so /verify-build has a TRD
to read and a feature slug to state under.

## 4. Master Task List

None — the fixture app already exists on disk; this scenario exercises
/verify-build alone, never /implement-trd.

## 5. Execution Plan

None.

## 6. Quality Requirements

- FR-1: the home screen renders, matching the ${FRAME1_STEM} design frame.
- FR-2: the detail screen renders, matching the ${FRAME2_STEM} design frame.

## 7. Risk Assessment

None — static two-page fixture, no external dependencies.

## 8. Non-Goals

- Anything beyond the two static screens named in the PRD.
${artifacts_section}
EOF
}

# run_verify_build <project_dir> <session_file> <feature> <with_section> <timeout_secs>
# Scaffolds a fresh throwaway project, turns publishing off, writes the
# fixture design assets + PRD + TRD, commits, runs `claude --print
# /verify-build <trd>` and returns claude's exit code. Leaves the whole final
# assistant message in "${project_dir}/.final_text" -- the banner assertion
# reads only its tail, the readout assertion reads all of it.
run_verify_build() {
    local project_dir="$1" session_file="$2" feature="$3" with_section="$4" timeout_s="$5"
    local trd_rel="docs/TRD/${feature}.md"
    local prd_rel="docs/PRD/${feature}.md"

    RUN_SCAFFOLD_OK=false
    if ! smoke_scaffold_project "$project_dir"; then
        assert_fail_raw "scaffold throwaway project ($project_dir)"
        return 1
    fi
    RUN_SCAFFOLD_OK=true
    assert_pass_raw "scaffold throwaway project ($project_dir)"

    # Publishing off (VART-T001's stated requirement): no live Artifact call.
    if [[ -f "${project_dir}/.claude/settings.json" ]]; then
        local tmp_settings
        tmp_settings="$(mktemp "${TMPDIR:-/tmp}/ensemble-smoke-vart-settings.XXXXXX")"
        jq '.ensemble.publishArtifacts = false' "${project_dir}/.claude/settings.json" > "$tmp_settings" \
            && mv "$tmp_settings" "${project_dir}/.claude/settings.json"
    fi
    assert_json_field "${project_dir}/.claude/settings.json" '.ensemble.publishArtifacts' "false" \
        "publishing turned off in the fixture project ($feature)"

    # Proves D10 end to end: the skill the design comparison needs must have
    # actually reached this throwaway project via scaffold-project.sh's
    # copy_framework_skills(), not merely exist in this repo's own tree.
    assert_file_nonempty "${project_dir}/.claude/skills/verify-design-comparison/SKILL.md" \
        "verify-design-comparison SKILL.md delivered into the scaffolded fixture ($feature)"

    smoke_write_vart_fixture_assets "$project_dir"
    smoke_write_vart_prd "${project_dir}/${prd_rel}" "$feature"
    smoke_write_vart_trd "${project_dir}/${trd_rel}" "$feature" "$prd_rel" "$with_section"

    git -C "$project_dir" add -A
    git -C "$project_dir" commit -q -m "smoke: add verification-artifacts fixture" --no-verify

    assert_file_nonempty "${project_dir}/${prd_rel}" "fixture PRD written ($feature)"
    assert_file_nonempty "${project_dir}/${trd_rel}" "fixture TRD written ($feature)"
    assert_file_nonempty "${project_dir}/docs/design/${DESIGN_SLUG}/screens/png/${FRAME1_STEM}.png" \
        "design frame 1 written ($feature)"
    assert_file_nonempty "${project_dir}/docs/design/${DESIGN_SLUG}/screens/png/${FRAME2_STEM}.png" \
        "design frame 2 written ($feature)"

    smoke_claude "/verify-build ${trd_rel}" "$timeout_s" "$project_dir" "$session_file"
    local rc=$?
    assert_exit_code 0 "$rc" "claude --print exits 0 ($feature)"

    local final_file="${project_dir}/.final_text"
    smoke_final_text "$session_file" > "$final_file"
    assert_tail_matches "$final_file" 12 '(═══ COMMAND COMPLETE|═══ COMMAND STUCK)' \
        "output ends with a COMMAND COMPLETE/STUCK banner ($feature)"

    return "$rc"
}

# assert_check_page <state_dir> <feature_label>
# Shared assertions for both runs: success-definition.md's two check rows,
# verification-state.json's two entries, and the rendered check page.
assert_check_page() {
    local state_dir="$1" label="$2"
    local definition_file="${state_dir}/success-definition.md"
    local state_file="${state_dir}/verification-state.json"
    local pages_dir="${state_dir}/verification-artifacts"
    local page_file="${pages_dir}/verify-design-comparison/index.html"
    local verdicts_file="${pages_dir}/verify-design-comparison/verdicts.json"

    if [[ -f "$definition_file" ]]; then
        assert_pass_raw "success-definition.md exists ($label)"
        # The ID and the Derivation must sit on the SAME table row -- two
        # independent file-wide greps would pass on a DC id cited by some other
        # row plus any one check row.
        local dc_id
        for dc_id in "$DC_ID1" "$DC_ID2"; do
            if grep -F "$dc_id" "$definition_file" | grep -qF "check:verify-design-comparison"; then
                assert_pass_raw "success-definition.md carries ${dc_id} with Derivation check:verify-design-comparison ($label)"
            else
                assert_fail_raw "success-definition.md is missing a ${dc_id} / check:verify-design-comparison row ($label)"
            fi
        done
    else
        assert_fail_raw "success-definition.md not found ($label), cannot check its rows"
    fi

    if [[ -f "$state_file" ]]; then
        assert_pass_raw "verification-state.json exists ($label)"
        local id
        for id in "$DC_ID1" "$DC_ID2"; do
            local status
            status="$(jq -r --arg id "$id" '.criteria[]? | select(.id == $id) | .status' "$state_file" 2>/dev/null | head -1)"
            if [[ -n "$status" && "$status" != "null" ]]; then
                assert_pass_raw "verification-state.json carries a status for ${id} ($label: ${status})"
            else
                assert_fail_raw "verification-state.json has no status for ${id} ($label)"
            fi
        done
    else
        assert_fail_raw "verification-state.json not found ($label), cannot check per-criterion status"
    fi

    if [[ -f "$page_file" ]]; then
        assert_pass_raw "verify-design-comparison/index.html was rendered ($label)"
        assert_contains "$page_file" 'type="range"' "index.html carries an overlay range slider ($label)"
        assert_contains "$page_file" "$DC_ID1" "index.html carries a card for ${DC_ID1} ($label)"
        assert_contains "$page_file" "$DC_ID2" "index.html carries a card for ${DC_ID2} ($label)"
    else
        assert_fail_raw "verify-design-comparison/index.html not found ($label)"
    fi

    assert_file_nonempty "$verdicts_file" "verdicts.json sits beside index.html ($label)"
    if [[ -f "$verdicts_file" ]]; then
        if jq -e . "$verdicts_file" >/dev/null 2>&1; then
            assert_pass_raw "verdicts.json is valid JSON ($label)"
            # Each frame's entry carries a page status from the six-value set
            # (D16 / the skill's Rubric) -- which ONE is not asserted (see
            # header note). Counted as JSON string VALUES in verdicts.json, not
            # as bare words on the page: "match" and "spec" occur in almost any
            # HTML, and a status legend lists all six whatever the cards say.
            local status_count
            status_count="$(jq '[.. | strings | select(IN("match","minor","deviates","superseded","uncaptured","spec"))] | length' "$verdicts_file" 2>/dev/null)"
            if [[ "${status_count:-0}" -ge 2 ]]; then
                assert_pass_raw "verdicts.json carries a page status per frame ($label: ${status_count} status values)"
            else
                assert_fail_raw "verdicts.json carries ${status_count:-0} page status value(s), expected one per frame (2) ($label)"
            fi
        else
            assert_fail_raw "verdicts.json is not valid JSON ($label)"
        fi
    fi
}

# =============================================================================
# Both runs, each its own throwaway project (never the same one twice, so
# neither run's .trd-state/ can leak into or be confused with the other's).
# =============================================================================

PROJECT_DIR_A="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-vart-a.XXXXXX")"
PROJECT_DIR_B="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-vart-b.XXXXXX")"

# PRESERVE THE EVIDENCE ON FAILURE (verify-functional.sh's own lesson,
# 2026-08-19): a scratch project that fails is the only copy of the state
# needed to diagnose it. Clean up on success; keep and announce on failure.
cleanup() {
    if [[ "${ASSERT_FAIL_COUNT:-0}" -gt 0 ]]; then
        echo "  scratch projects PRESERVED for diagnosis (${ASSERT_FAIL_COUNT} failure(s)):"
        [[ -d "$PROJECT_DIR_A" ]] && echo "    Run A (TRD names the check): $PROJECT_DIR_A"
        [[ -d "$PROJECT_DIR_B" ]] && echo "    Run B (no section, PRD fallback): $PROJECT_DIR_B"
        echo "  remove them yourself when done: rm -rf ${TMPDIR:-/tmp}/ensemble-smoke-vart-*"
        return 0
    fi
    rm -rf "$PROJECT_DIR_A" "$PROJECT_DIR_B"
}
trap cleanup EXIT INT TERM

# Internal per-run timeout. /verify-build here pays for: environment
# preflight, the foreground derive pass (Step 3a -- unlike Step 8's
# background derive, this command WAITS for it), then the verification loop
# itself (up to cap 3 iterations, each an Exercise + Judge + Render agent for
# the one selected check, and possibly Debug). verify-functional.sh's
# default-on run (no checks, no Render) measured 1471s on this same class of
# fixture; this run does strictly more per iteration (an extra Render agent,
# a design-comparison Exercise agent attempting a capture), so its budget is
# set higher rather than reused unchanged. Raise this and
# SCENARIO_TIMEOUT[verification-artifacts] in run-smoke.sh together, and
# never lower the model instead.
TIMEOUT_RUN=1800

FEATURE_A="smoke-vart-a"
FEATURE_B="smoke-vart-b"

SESSION_FILE_A="${PROJECT_DIR_A}/.session.jsonl"
RUN_SCAFFOLD_OK=false
run_verify_build "$PROJECT_DIR_A" "$SESSION_FILE_A" "$FEATURE_A" "true" "$TIMEOUT_RUN"
if [[ "$RUN_SCAFFOLD_OK" != "true" ]]; then
    smoke_finish
fi
assert_check_page "${PROJECT_DIR_A}/.trd-state/${FEATURE_A}" "Run A: TRD names the check"

SESSION_FILE_B="${PROJECT_DIR_B}/.session.jsonl"
RUN_SCAFFOLD_OK=false
run_verify_build "$PROJECT_DIR_B" "$SESSION_FILE_B" "$FEATURE_B" "false" "$TIMEOUT_RUN"
if [[ "$RUN_SCAFFOLD_OK" != "true" ]]; then
    smoke_finish
fi
assert_check_page "${PROJECT_DIR_B}/.trd-state/${FEATURE_B}" "Run B: no section, PRD fallback"

# Run B only (D9): with the TRD silent, §8.1b's fallback selects the check
# from the PRD's own inputs and must record ONE DECISIONS line naming it.
# Loose check, deliberately (VART-T001 grounding "Careful": "the readout
# wording is the model's") -- find the DECISIONS section heading, then look
# for the check's name inside that section only (up to the ISSUES or NEXT
# heading), rather than for a fixed sentence. Naming the check in ISSUES,
# NEXT or the banner does not satisfy D9's DECISIONS line. Case folding is
# done with toupper(), not gawk's IGNORECASE, which BSD/macOS awk ignores.
FULL_TEXT_B="${PROJECT_DIR_B}/.final_text"
DECISIONS_BLOCK=""
if [[ -f "$FULL_TEXT_B" ]]; then
    DECISIONS_BLOCK="$(awk '
        { u = toupper($0) }
        u ~ /^[#* ]*DECISIONS([^A-Z]|$)/ { found = 1; print; next }
        found && u ~ /^[#* ]*(ISSUES|NEXT)([^A-Z]|$)/ { exit }
        found { print }
    ' "$FULL_TEXT_B")"
fi
if [[ -n "$DECISIONS_BLOCK" ]]; then
    if printf '%s' "$DECISIONS_BLOCK" | grep -qi 'verify-design-comparison'; then
        assert_pass_raw "Run B's readout names verify-design-comparison in its DECISIONS section"
    else
        assert_fail_raw "Run B's readout has a DECISIONS section but it never names verify-design-comparison"
    fi
else
    assert_fail_raw "Run B's readout has no DECISIONS section to check for the fallback-selection line"
fi

smoke_finish
