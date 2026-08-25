#!/usr/bin/env bash
# =============================================================================
# rebase-old-tree - Scenario: /rebase-project brings a stale tree current
# =============================================================================
#
# LLM opt-in. Costs one model turn.
#
# Closes the half of improvement-plan item 13 sub-item 1 that
# test/integration/tests/scaffold-delivery.test.sh cannot reach.
#
# The DETERMINISTIC half of rebase delivery — scaffold-project.sh --refresh — is
# already covered there and in packages/core/scripts/scaffold-project.test.sh,
# with no model involved. What neither can touch is the part item 13 names: the
# CLASSIFICATION decisions inside /rebase-project, which is a markdown prompt.
# Which commands are stale, which skills are the user's, which rules the
# framework owns — §4.1–4.7 of rebase-project.md is an independently specified
# LLM-executed procedure that never shells out to the refresh script. The only
# way to observe it is to run it.
#
# EVERY ASSERTION READS THE FILESYSTEM. /rebase-project writes a prose Rebase
# Report saying what it changed; asserting against that text would pass for a run
# that reported perfectly and did nothing — the same defect class as
# scaffold-delivery.test.sh's first run, which reported a clean tree that had
# received four files.
#
# The tree is aged BEFORE the model turn and the aging is verified BEFORE
# dispatch (smoke_assert_aged). Without that check, a degradation that silently
# no-opped would make its matching "rebase fixed it" assertion pass trivially,
# because the bug was never planted.
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

command -v claude   &>/dev/null || smoke_skip "claude CLI not found in PATH"
command -v jq       &>/dev/null || smoke_skip "jq not installed"
command -v python3  &>/dev/null || smoke_skip "python3 not installed"

PROJECT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-rebaseold.XXXXXX")"
cleanup() { rm -rf "$PROJECT_DIR"; }
trap cleanup EXIT INT TERM

export ENSEMBLE_RUNTIME_REFRESH_DISABLE=1

# -----------------------------------------------------------------------------
# Scaffold, then age.
# -----------------------------------------------------------------------------
if ! smoke_scaffold_project "$PROJECT_DIR"; then
    assert_fail_raw "scaffold throwaway project"
    smoke_finish
fi
assert_pass_raw "scaffold throwaway project"

GOV_HASHES="$(smoke_age_project "$PROJECT_DIR")"
if smoke_assert_aged "$PROJECT_DIR"; then
    assert_pass_raw "aged tree: every degradation took (precondition for every check below)"
else
    # Without a planted bug there is nothing to fix, so every downstream
    # assertion would pass while proving nothing. Stop here instead.
    assert_fail_raw "aged tree: every degradation took (precondition for every check below)"
    smoke_finish
fi

# -----------------------------------------------------------------------------
# The model turn. Internal budget sits below the runner's cap so a hang shows up
# as this scenario's own timeout rather than the harness's.
# -----------------------------------------------------------------------------
SESSION_FILE="${PROJECT_DIR}/.rebase-session.jsonl"
smoke_claude "/rebase-project" 600 "$PROJECT_DIR" "$SESSION_FILE"
CLAUDE_RC=$?
assert_exit_code 0 "$CLAUDE_RC" "claude --print exits 0"

# -----------------------------------------------------------------------------
# 4.1.18 bug 1: workflows/, lib/ and contracts/ were never delivered.
# Count files — an empty .claude/lib/ on install is itself a named release-breaker,
# and assert_file_exists is `[[ -e ]]`, which an empty directory satisfies.
# -----------------------------------------------------------------------------
for d in workflows lib contracts; do
    n="$(find "${PROJECT_DIR}/.claude/${d}" -type f 2>/dev/null | wc -l | tr -d ' ')"
    assert_true ".claude/${d}/ restored and non-empty (${n} file(s))" -- test "${n:-0}" -gt 0
done

# -----------------------------------------------------------------------------
# 4.1.18 bug 2: hook content copied without restoring the execute bit, so every
# .js/.py hook failed Permission denied on every event.
# -----------------------------------------------------------------------------
NONEXEC="$(find "${PROJECT_DIR}/.claude/hooks" -maxdepth 1 -type f \
    \( -name '*.sh' -o -name '*.js' -o -name '*.py' \) ! -perm -u+x 2>/dev/null | wc -l | tr -d ' ')"
assert_true "every top-level hook is executable again (${NONEXEC} still not)" \
    -- test "${NONEXEC:-1}" -eq 0

# -----------------------------------------------------------------------------
# 4.1.18 bug 3: retired commands classified stale, then not deleted — they stay
# invocable and re-introduce behaviour the framework removed.
# -----------------------------------------------------------------------------
for c in harden-trd-team verify-trd-team implement-trd-team; do
    if [[ -f "${PROJECT_DIR}/.claude/commands/${c}.md" ]]; then
        assert_fail_raw "retired command removed: ${c}.md"
    else
        assert_pass_raw "retired command removed: ${c}.md"
    fi
done

# -----------------------------------------------------------------------------
# 4.1.19 bug: framework rules were preserve-as-is, so they could NEVER update.
# -----------------------------------------------------------------------------
if grep -q -- '--wiggum' "${PROJECT_DIR}/.claude/rules/autonomy.md" 2>/dev/null; then
    assert_fail_raw "framework rule autonomy.md refreshed (stale --wiggum text still present)"
else
    assert_pass_raw "framework rule autonomy.md refreshed (stale --wiggum text gone)"
fi

# -----------------------------------------------------------------------------
# 4.1.19 bug: user-authored skills were classified for deletion. This is the one
# category where a wrong removal destroys work existing nowhere else.
# -----------------------------------------------------------------------------
assert_file_exists "${PROJECT_DIR}/.claude/skills/smoke-user-skill/SKILL.md" \
    "user-authored skill survived the rebase"

# -----------------------------------------------------------------------------
# User governance is never modified — byte-identical, not merely present.
# -----------------------------------------------------------------------------
while read -r name hash; do
    [[ -z "$name" ]] && continue
    now="$(smoke_file_hash "${PROJECT_DIR}/.claude/rules/${name}.md" 2>/dev/null || echo missing)"
    if [[ "$now" == "$hash" ]]; then
        assert_pass_raw "governance file untouched: ${name}.md"
    else
        assert_fail_raw "governance file untouched: ${name}.md (hash changed)"
    fi
done <<< "$GOV_HASHES"

# -----------------------------------------------------------------------------
# Positive control. Everything above except the two preservation checks fails on
# a no-op rebase, but §4.6 gives us a direct witness that the command RAN and
# knew what it was upgrading from: it stamps version + previous_version.
# Without this, "did nothing" and "did everything" are distinguished only by
# absence.
# -----------------------------------------------------------------------------
VER="$(jq -r '.ensemble.version // ""' "${PROJECT_DIR}/.claude/settings.json" 2>/dev/null)"
PREV="$(jq -r '.ensemble.previous_version // ""' "${PROJECT_DIR}/.claude/settings.json" 2>/dev/null)"
assert_true "ensemble.version advanced past the aged 4.0.0 (now '${VER}')" \
    -- test -n "$VER" -a "$VER" != "4.0.0"
assert_true "ensemble.previous_version records the aged value (got '${PREV}')" \
    -- test "$PREV" = "4.0.0"

# -----------------------------------------------------------------------------
# The command must terminate on its banner (command-status.md).
# -----------------------------------------------------------------------------
FINAL="$(smoke_final_text "$SESSION_FILE" 2>/dev/null | grep -v '^\s*$' | tail -12)"
if grep -qE '═══ COMMAND (COMPLETE|STUCK): /rebase-project ═══' <<< "$FINAL"; then
    assert_pass_raw "output carries a COMMAND COMPLETE/STUCK banner"
else
    assert_fail_raw "output carries a COMMAND COMPLETE/STUCK banner"
fi

smoke_finish
