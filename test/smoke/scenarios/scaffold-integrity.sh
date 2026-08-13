#!/usr/bin/env bash
# =============================================================================
# scaffold-integrity - Scenario: a freshly-scaffolded project's runtime works
# =============================================================================
#
# No LLM. Target: under 30 seconds.
#
# hooks-health checks THIS REPO's hooks, which have always worked — the
# permitter failure that motivated this harness was in a SCAFFOLDED project's
# hooks (broken "Cannot find module" on every invocation, for months, because
# nothing ever ran it from inside a real scaffold). This scenario closes that
# gap: it scaffolds a throwaway project with scaffold-project.sh, then asserts
# the delivered runtime is coherent by actually invoking it.
#
# Central assertion (the one that would have caught the permitter): every hook
# registered in the SCAFFOLDED project's .claude/settings.json exists on disk,
# is executable, loads, and exits 0 on a minimal event-appropriate payload —
# run with cwd inside that project (not an isolated temp dir), so path
# resolution (resolve-project-root.js, status.js's .trd-state walk) exercises
# the real thing instead of a documented no-op.
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
# shellcheck source=../lib/hookcheck.sh
source "${SMOKE_DIR}/lib/hookcheck.sh"

if ! command -v jq &>/dev/null; then
    smoke_skip "jq not installed"
fi
if ! command -v python3 &>/dev/null; then
    smoke_skip "python3 not installed"
fi

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-scaffoldintegrity.XXXXXX")"
cleanup() { rm -rf "$PROJECT_DIR"; }
trap cleanup EXIT INT TERM

export ENSEMBLE_RUNTIME_REFRESH_DISABLE=1

if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

SETTINGS_FILE="${PROJECT_DIR}/.claude/settings.json"

# -----------------------------------------------------------------------------
# Central assertion: every hook registered in the SCAFFOLDED project loads and
# exits 0, run FROM INSIDE that project (cwd=PROJECT_DIR, not an isolated
# dir) — this is the exact check that would have caught the permitter.
# -----------------------------------------------------------------------------
if [[ -f "$SETTINGS_FILE" ]]; then
    hookcheck_write_transcript "$PROJECT_DIR"
    SCAFFOLD_HOOK_COUNT=0
    while IFS=$'\t' read -r event command; do
        [[ -z "$event" ]] && continue
        hook_rel="$(hookcheck_extract_hook_rel "$command")"
        if [[ -z "$hook_rel" ]]; then
            assert_fail_raw "$event: could not extract hook path from command: ${command:0:120}"
            continue
        fi
        hook_path="${PROJECT_DIR}/${hook_rel}"
        hook_name="$(basename "$hook_path")"
        SCAFFOLD_HOOK_COUNT=$((SCAFFOLD_HOOK_COUNT + 1))
        hookcheck_run_one "$event" "$hook_path" "$PROJECT_DIR" "scaffolded/$event/$hook_name"
    done < <(hookcheck_derive_from_settings "$SETTINGS_FILE")
    if [[ "$SCAFFOLD_HOOK_COUNT" -eq 0 ]]; then
        assert_fail_raw "derived at least one hook from scaffolded settings.json"
    else
        assert_pass_raw "checked ${SCAFFOLD_HOOK_COUNT} registered hook(s) in scaffolded project"
    fi
else
    assert_fail_raw "scaffolded .claude/settings.json exists"
fi

# -----------------------------------------------------------------------------
# validate-init.sh — reuse it, don't reimplement its checks.
# -----------------------------------------------------------------------------
VALIDATE_INIT="${REPO_ROOT}/packages/core/scripts/validate-init.sh"
if [[ -x "$VALIDATE_INIT" ]]; then
    VALIDATE_OUT="${PROJECT_DIR}/.validate-init.out"
    smoke_timeout 20 "$VALIDATE_INIT" "$PROJECT_DIR" >"$VALIDATE_OUT" 2>&1
    VALIDATE_RC=$?
    assert_exit_code 0 "$VALIDATE_RC" "validate-init.sh passes against the scaffolded project"
    if [[ "$VALIDATE_RC" -ne 0 ]]; then
        tail -20 "$VALIDATE_OUT" >&2
    fi
else
    assert_fail_raw "validate-init.sh exists and is executable at $VALIDATE_INIT"
fi

# -----------------------------------------------------------------------------
# 13 agents present, each with parseable frontmatter, an explicit
# `background:`, and `disallowedTools: Agent` on the three leaf agents.
# -----------------------------------------------------------------------------
REQUIRED_AGENTS=(
    product-manager technical-architect spec-planner
    frontend-implementer backend-implementer mobile-implementer agent-implementer
    verify-app code-simplifier code-reviewer app-debugger
    devops-engineer cicd-specialist
)
LEAF_AGENTS_NO_SPAWN=(code-reviewer code-simplifier verify-app)

frontmatter_block() {
    # Prints the lines strictly between the opening and closing `---`
    # delimiters, or nothing (and a non-zero exit) if malformed.
    local file="$1"
    local first close
    first="$(head -n1 "$file")"
    [[ "$first" == "---" ]] || return 1
    close="$(awk 'NR>1 && /^---$/{print NR; exit}' "$file")"
    [[ -n "$close" ]] || return 1
    sed -n "2,$((close - 1))p" "$file"
    return 0
}

AGENTS_PRESENT=0
for agent in "${REQUIRED_AGENTS[@]}"; do
    agent_file="${PROJECT_DIR}/.claude/agents/${agent}.md"
    if [[ -f "$agent_file" ]]; then
        AGENTS_PRESENT=$((AGENTS_PRESENT + 1))
    else
        assert_fail_raw "agent present: ${agent}.md"
        continue
    fi

    if ! block="$(frontmatter_block "$agent_file" 2>/dev/null)"; then
        assert_fail_raw "${agent}.md: frontmatter parseable (missing/malformed --- delimiters)"
        continue
    fi
    assert_pass_raw "${agent}.md: frontmatter parseable (--- delimiters found)"

    if grep -qE '^name:[[:space:]]*\S' <<< "$block"; then
        assert_pass_raw "${agent}.md: frontmatter has name: field"
    else
        assert_fail_raw "${agent}.md: frontmatter has name: field"
    fi

    if grep -qE '^background:[[:space:]]*(true|false)[[:space:]]*$' <<< "$block"; then
        assert_pass_raw "${agent}.md: explicit background: field"
    else
        assert_fail_raw "${agent}.md: explicit background: field"
    fi
done
assert_true "all ${#REQUIRED_AGENTS[@]} required agents present ($AGENTS_PRESENT found)" \
    -- test "$AGENTS_PRESENT" -eq "${#REQUIRED_AGENTS[@]}"

for agent in "${LEAF_AGENTS_NO_SPAWN[@]}"; do
    agent_file="${PROJECT_DIR}/.claude/agents/${agent}.md"
    block="$(frontmatter_block "$agent_file" 2>/dev/null || true)"
    if grep -qE '^disallowedTools:[[:space:]]*Agent[[:space:]]*$' <<< "$block"; then
        assert_pass_raw "${agent}.md: disallowedTools: Agent present"
    else
        assert_fail_raw "${agent}.md: disallowedTools: Agent present"
    fi
done

# -----------------------------------------------------------------------------
# Every shippable hook in hooks.manifest.json was delivered, plus lib/.
# -----------------------------------------------------------------------------
MANIFEST="${REPO_ROOT}/packages/core/hooks/hooks.manifest.json"
if [[ -f "$MANIFEST" ]]; then
    # `unique` matters: a hook registered on several events (dispatch-ledger.js
    # on SubagentStart + SubagentStop) has one manifest entry PER EVENT but is
    # still one file on disk. Without dedupe the expected count exceeds the
    # delivered count and this assertion fails on a correct scaffold.
    SHIPPABLE_FILES="$(jq -r '[.hooks[] | select(.shippable == true) | .file] | unique | .[]' "$MANIFEST" 2>/dev/null)"
    SHIPPABLE_COUNT=0
    DELIVERED_COUNT=0
    while IFS= read -r hookfile; do
        [[ -z "$hookfile" ]] && continue
        SHIPPABLE_COUNT=$((SHIPPABLE_COUNT + 1))
        dest="${PROJECT_DIR}/.claude/hooks/${hookfile}"
        if [[ -f "$dest" ]]; then
            DELIVERED_COUNT=$((DELIVERED_COUNT + 1))
            if [[ "$hookfile" == *.sh || "$hookfile" == *.js || "$hookfile" == *.py ]] && [[ ! -x "$dest" ]]; then
                assert_fail_raw "hook executable: ${hookfile}"
            fi
        fi
    done <<< "$SHIPPABLE_FILES"
    assert_true "all $SHIPPABLE_COUNT shippable manifest hooks delivered ($DELIVERED_COUNT found)" \
        -- test "$DELIVERED_COUNT" -eq "$SHIPPABLE_COUNT"

    LIB_SRC="${REPO_ROOT}/packages/core/hooks/lib"
    if [[ -d "$LIB_SRC" ]]; then
        LIB_OK=true
        for libfile in "$LIB_SRC"/*.js; do
            [[ -f "$libfile" ]] || continue
            libname="$(basename "$libfile")"
            [[ -f "${PROJECT_DIR}/.claude/hooks/lib/${libname}" ]] || LIB_OK=false
        done
        if [[ "$LIB_OK" == "true" ]]; then
            assert_pass_raw "hooks lib/ delivered to scaffolded project"
        else
            assert_fail_raw "hooks lib/ delivered to scaffolded project"
        fi
    fi
else
    assert_fail_raw "hooks.manifest.json exists at $MANIFEST"
fi

# -----------------------------------------------------------------------------
# .claude/settings.json: valid JSON, hook set matches this repo's own, every
# referenced hook path resolves.
# -----------------------------------------------------------------------------
if [[ -f "$SETTINGS_FILE" ]]; then
    if jq empty "$SETTINGS_FILE" 2>/dev/null; then
        assert_pass_raw "scaffolded .claude/settings.json is valid JSON"
    else
        assert_fail_raw "scaffolded .claude/settings.json is valid JSON"
    fi

    REPO_SETTINGS="${REPO_ROOT}/.claude/settings.json"
    if diff -q <(jq -S '.hooks' "$SETTINGS_FILE" 2>/dev/null) \
               <(jq -S '.hooks' "$REPO_SETTINGS" 2>/dev/null) >/dev/null 2>&1; then
        assert_pass_raw "scaffolded hook set matches this repo's .claude/settings.json"
    else
        assert_fail_raw "scaffolded hook set matches this repo's .claude/settings.json"
    fi

    RESOLVE_FAILS=0
    while IFS=$'\t' read -r event command; do
        [[ -z "$event" ]] && continue
        hook_rel="$(hookcheck_extract_hook_rel "$command")"
        [[ -z "$hook_rel" ]] && continue
        [[ -f "${PROJECT_DIR}/${hook_rel}" ]] || RESOLVE_FAILS=$((RESOLVE_FAILS + 1))
    done < <(hookcheck_derive_from_settings "$SETTINGS_FILE")
    assert_true "every referenced hook path in settings.json resolves ($RESOLVE_FAILS unresolved)" \
        -- test "$RESOLVE_FAILS" -eq 0
else
    assert_fail_raw "scaffolded .claude/settings.json exists (for JSON/hook-set checks)"
fi

# -----------------------------------------------------------------------------
# ensemble.version stamped, all seven template ensemble keys preserved.
# -----------------------------------------------------------------------------
if [[ -f "$SETTINGS_FILE" ]]; then
    VERSION_STAMPED="$(jq -r '.ensemble.version // ""' "$SETTINGS_FILE" 2>/dev/null)"
    if [[ -n "$VERSION_STAMPED" ]]; then
        assert_pass_raw "ensemble.version stamped ($VERSION_STAMPED)"
    else
        assert_fail_raw "ensemble.version stamped"
    fi

    TEMPLATE_KEYS=(agents_dir skills_dir rules_dir state_dir docs_dir prd_dir trd_dir)
    MISSING_KEYS=0
    for key in "${TEMPLATE_KEYS[@]}"; do
        val="$(jq -r --arg k "$key" '.ensemble[$k] // ""' "$SETTINGS_FILE" 2>/dev/null)"
        [[ -z "$val" ]] && MISSING_KEYS=$((MISSING_KEYS + 1))
    done
    assert_true "all ${#TEMPLATE_KEYS[@]} template ensemble keys preserved ($MISSING_KEYS missing)" \
        -- test "$MISSING_KEYS" -eq 0
fi

# -----------------------------------------------------------------------------
# Commands vendored, init-project.md/rebase-project.md correctly EXCLUDED.
# -----------------------------------------------------------------------------
CMD_DIR="${PROJECT_DIR}/.claude/commands"
CMD_COUNT="$(find "$CMD_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')"
assert_true "commands vendored into scaffolded project (${CMD_COUNT} found)" \
    -- test "${CMD_COUNT:-0}" -gt 0

for excluded in init-project.md rebase-project.md; do
    if [[ -f "${CMD_DIR}/${excluded}" ]]; then
        assert_fail_raw "${excluded} correctly excluded from vendored commands"
    else
        assert_pass_raw "${excluded} correctly excluded from vendored commands"
    fi
done

# -----------------------------------------------------------------------------
# .trd-state/ and docs/ structure created.
# -----------------------------------------------------------------------------
for dir in ".trd-state" "docs/PRD" "docs/TRD"; do
    assert_file_exists "${PROJECT_DIR}/${dir}" "${dir}/ created"
done

# -----------------------------------------------------------------------------
# No retired component anywhere in the delivered output.
# -----------------------------------------------------------------------------
RETIRED_HITS="$(grep -rIl -E 'permitter|learning\.sh|save-remote-logs\.js' \
    "${PROJECT_DIR}/.claude" "${PROJECT_DIR}/docs" 2>/dev/null || true)"
if [[ -z "$RETIRED_HITS" ]]; then
    assert_pass_raw "no retired component (permitter/learning.sh/save-remote-logs.js) in scaffolded output"
else
    assert_fail_raw "no retired component in scaffolded output (found in: $(tr '\n' ' ' <<< "$RETIRED_HITS"))"
fi

smoke_finish
