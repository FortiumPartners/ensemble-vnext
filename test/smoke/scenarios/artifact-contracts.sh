#!/usr/bin/env bash
# =============================================================================
# artifact-contracts - Scenario: static contracts between shipped artifacts
# =============================================================================
#
# No LLM, no scaffolding — purely static assertions over the repo checkout
# itself. Target: under 10 seconds.
#
# Checks:
#   - Every TRD under docs/TRD/ that has a "Master Task List" section
#     contains machine-findable task IDs in at least one recognised shape
#     (checkbox `- [ ] **ID**: ...` OR markdown-table `| ID | ... |`), and
#     the format implement-trd.md Step 3.1 documents (checkbox) matches at
#     least one shape actually in use across current TRDs.
#   - packages/core/commands/*.md and .claude/commands/*.md are byte-identical
#     for every command present in both.
#   - packages/full/agents/*.md and .claude/agents/*.md are byte-identical.
#   - packages/full/commands/plugin-only/*.md are REAL FILES byte-identical to
#     packages/core/commands/ (symlinked plugin commands silently do not load),
#     and the installed plugin actually exposes them.
#   - generate-hooks-artifacts.sh --check exits 0 (no manifest drift).
#   - check-version-sync.sh exits 0 (no version-manifest drift).
#   - No retired component (permitter/learning.sh/save-remote-logs.js)
#     referenced in packages/, .claude/, or docs/guides/.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"

# -----------------------------------------------------------------------------
# TRD task-ID format contract.
# -----------------------------------------------------------------------------
# Task-ID shape: PREFIX-SEG(-SEG...), e.g. TRD-P001, RUNTIME-B001,
# TRD-TEST-093 (two hyphenated segments), SMOKE-001. One-or-more
# hyphen-segments, not exactly one — TRD-TEST-093 would otherwise silently
# fail to match and understate real usage.
ID_RE='[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)+'
# Shape A: checkbox list, per implement-trd.md Step 3.1's documented format.
CHECKBOX_RE="^[[:space:]]*-[[:space:]]*\[[ xX]\][[:space:]]*\*\*${ID_RE}\*\*"
# Shape B: markdown table row whose first cell is a task ID.
TABLE_RE="^\|[[:space:]]*${ID_RE}[[:space:]]*\|"
MTL_HEADING_RE='^#+[[:space:]]*[0-9]*\.?[[:space:]]*Master Task List'

TRD_FILES=()
while IFS= read -r -d '' f; do
    TRD_FILES+=("$f")
done < <(find "${REPO_ROOT}/docs/TRD" -maxdepth 1 -name '*.md' -type f -print0 2>/dev/null)

if [[ "${#TRD_FILES[@]}" -eq 0 ]]; then
    assert_fail_raw "at least one TRD found under docs/TRD/"
else
    CHECKBOX_SEEN_ANYWHERE=false
    TABLE_SEEN_ANYWHERE=false
    for trd in "${TRD_FILES[@]}"; do
        name="$(basename "$trd")"
        if ! grep -qE "$MTL_HEADING_RE" "$trd"; then
            # Not a task-bearing TRD (e.g. free-form feedback notes, a
            # reference doc with no Master Task List heading at all) —
            # nothing to check here, and asserting against it would be
            # asserting the format of a document that isn't a TRD task list.
            continue
        fi
        has_checkbox=false
        has_table=false
        grep -qE "$CHECKBOX_RE" "$trd" && has_checkbox=true
        grep -qE "$TABLE_RE" "$trd" && has_table=true
        if [[ "$has_checkbox" == "true" ]]; then CHECKBOX_SEEN_ANYWHERE=true; fi
        if [[ "$has_table" == "true" ]]; then TABLE_SEEN_ANYWHERE=true; fi

        if [[ "$has_checkbox" == "true" || "$has_table" == "true" ]]; then
            assert_pass_raw "$name: Master Task List has machine-findable task IDs (checkbox=$has_checkbox table=$has_table)"
        else
            assert_fail_raw "$name: Master Task List has machine-findable task IDs in a recognised shape (checkbox or table)"
        fi
    done

    # implement-trd.md Step 3.1 documents the checkbox shape
    # (`- [ ] **PREFIX-CATSEQ**: Description`). Assert that shape matches AT
    # LEAST ONE shape actually in use across current TRDs — not that every
    # TRD uses it (most use tables today; asserting the stale documented
    # format alone would fail against nearly every current TRD). If NEITHER
    # documented shape nor any recognised shape is in use anywhere, the docs
    # have fully diverged from reality and that divergence must be visible.
    if [[ "$CHECKBOX_SEEN_ANYWHERE" == "true" ]]; then
        assert_pass_raw "implement-trd.md's documented checkbox format matches at least one TRD in use"
    else
        assert_fail_raw "implement-trd.md's documented checkbox format matches at least one TRD in use (docs say checkbox; TRDs in use: checkbox=${CHECKBOX_SEEN_ANYWHERE} table=${TABLE_SEEN_ANYWHERE} — update implement-trd.md Step 3.1 to document the table shape, or add a checkbox-format TRD)"
    fi
fi

# -----------------------------------------------------------------------------
# packages/core/commands/*.md <-> .claude/commands/*.md byte-identical.
# -----------------------------------------------------------------------------
CORE_CMD_DIR="${REPO_ROOT}/packages/core/commands"
VENDORED_CMD_DIR="${REPO_ROOT}/.claude/commands"
CMD_COMPARED=0
for f in "$CORE_CMD_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f")"
    other="${VENDORED_CMD_DIR}/${name}"
    [[ -f "$other" ]] || continue
    CMD_COMPARED=$((CMD_COMPARED + 1))
    if cmp -s "$f" "$other"; then
        assert_pass_raw "commands/$name: core and vendored copies byte-identical"
    else
        assert_fail_raw "commands/$name: core and vendored copies byte-identical"
    fi
done
assert_true "at least one command pair compared" -- test "$CMD_COMPARED" -gt 0

# -----------------------------------------------------------------------------
# packages/full/agents/*.md <-> .claude/agents/*.md byte-identical.
# -----------------------------------------------------------------------------
FULL_AGENTS_DIR="${REPO_ROOT}/packages/full/agents"
VENDORED_AGENTS_DIR="${REPO_ROOT}/.claude/agents"
AGENT_COMPARED=0
for f in "$FULL_AGENTS_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f")"
    other="${VENDORED_AGENTS_DIR}/${name}"
    [[ -f "$other" ]] || continue
    AGENT_COMPARED=$((AGENT_COMPARED + 1))
    if cmp -s "$f" "$other"; then
        assert_pass_raw "agents/$name: packages/full and vendored copies byte-identical"
    else
        assert_fail_raw "agents/$name: packages/full and vendored copies byte-identical"
    fi
done
assert_true "at least one agent pair compared" -- test "$AGENT_COMPARED" -gt 0

# -----------------------------------------------------------------------------
# packages/full/commands/plugin-only/*.md must be REAL FILES, byte-identical to
# packages/core/commands/.
#
# They were symlinked in 4.1.2 to stop them going stale. That broke the plugin
# outright: Claude Code does not load plugin commands through symlinks, so
# `claude plugin details` reported Skills (0) instead of Skills (2) and
# /init-project became "Unknown command" — the plugin's only two commands, and
# therefore its whole purpose.
#
# The original version of THIS assertion checked that the symlinks *resolved*,
# and passed happily for the entire time the plugin was exposing nothing. It was
# testing the filesystem instead of the product. Hence the second assertion
# below, which asks the CLI what the plugin actually exposes.
# -----------------------------------------------------------------------------
PLUGIN_ONLY_DIR="${REPO_ROOT}/packages/full/commands/plugin-only"
PLUGIN_ONLY_CHECKED=0
if [[ -d "$PLUGIN_ONLY_DIR" ]]; then
    for f in "$PLUGIN_ONLY_DIR"/*.md; do
        [[ -e "$f" ]] || continue
        name="$(basename "$f")"
        PLUGIN_ONLY_CHECKED=$((PLUGIN_ONLY_CHECKED + 1))
        if [[ -L "$f" ]]; then
            assert_fail_raw "plugin-only/$name: is a real file, not a symlink (symlinked plugin commands do not load)"
        else
            assert_pass_raw "plugin-only/$name: is a real file, not a symlink"
        fi
        if cmp -s "${CORE_CMD_DIR}/${name}" "$f"; then
            assert_pass_raw "plugin-only/$name: byte-identical to packages/core/commands/"
        else
            assert_fail_raw "plugin-only/$name: byte-identical to packages/core/commands/ (run generate-hooks-artifacts.sh)"
        fi
    done
fi
assert_true "at least one plugin-only command checked" -- test "$PLUGIN_ONLY_CHECKED" -gt 0

# The assertion that would actually have caught it: ask the CLI what the plugin
# exposes. Skips when the plugin is not installed, since that is normal in CI.
if command -v claude &>/dev/null; then
    PLUGIN_INV="$(cd "$HOME" && claude plugin details full@ensemble-vnext 2>/dev/null || true)"
    if [[ -z "$PLUGIN_INV" ]]; then
        assert_skip_raw "plugin inventory check (full@ensemble-vnext not installed)" 2>/dev/null \
            || assert_pass_raw "plugin inventory check skipped (plugin not installed)"
    elif grep -qE 'Skills \(0\)' <<<"$PLUGIN_INV"; then
        assert_fail_raw "installed plugin exposes its commands (reports Skills (0) — commands are not loading)"
    elif grep -qE 'init-project' <<<"$PLUGIN_INV"; then
        assert_pass_raw "installed plugin exposes init-project/rebase-project"
    else
        assert_fail_raw "installed plugin exposes init-project/rebase-project (not found in inventory)"
    fi
fi

# -----------------------------------------------------------------------------
# generate-hooks-artifacts.sh --check and check-version-sync.sh both exit 0.
# -----------------------------------------------------------------------------
GEN_HOOKS="${REPO_ROOT}/packages/core/scripts/generate-hooks-artifacts.sh"
if [[ -x "$GEN_HOOKS" ]]; then
    OUT="$("$GEN_HOOKS" --check 2>&1)"
    RC=$?
    assert_exit_code 0 "$RC" "generate-hooks-artifacts.sh --check exits 0 (no manifest drift)"
    [[ "$RC" -ne 0 ]] && echo "$OUT" >&2
else
    assert_fail_raw "generate-hooks-artifacts.sh exists and is executable"
fi

VERSION_SYNC="${REPO_ROOT}/packages/core/scripts/check-version-sync.sh"
if [[ -x "$VERSION_SYNC" ]]; then
    OUT="$("$VERSION_SYNC" --quiet 2>&1)"
    RC=$?
    assert_exit_code 0 "$RC" "check-version-sync.sh exits 0 (no version-manifest drift)"
    [[ "$RC" -ne 0 ]] && echo "$OUT" >&2
else
    assert_fail_raw "check-version-sync.sh exists and is executable"
fi

# -----------------------------------------------------------------------------
# No retired component referenced in packages/, .claude/, or docs/guides/.
# -----------------------------------------------------------------------------
# Files that legitimately name the retired components ON PURPOSE — either
# documenting the retirement/removal itself, or testing that they stay
# absent — are not drift and are excluded here explicitly (mirrors
# hooks.manifest.json's own $comment, which explains the retirement by name
# and is excluded for the same reason). Anything NOT on this list that still
# mentions them is a live reference to something that no longer ships, which
# is exactly the "silent absence" class of bug this harness exists to catch.
RETIRED_ALLOWLIST=(
    "packages/core/hooks/hooks.manifest.json"          # documents the retirement by name
    "packages/core/scripts/scaffold-project.test.sh"    # asserts they are ABSENT from scaffolds
    "packages/core/commands/rebase-project.md"          # documents detecting + offering removal
    ".claude/commands/rebase-project.md"                # vendored copy of the above
    "packages/full/commands/plugin-only/rebase-project.md"  # shipped copy of the above
    ".claude/rules/constitution.md"                     # documents the 4.1.0 retirement history
)

RETIRED_HITS="$(grep -rIl -E 'permitter|learning\.sh|save-remote-logs\.js' \
    "${REPO_ROOT}/packages" "${REPO_ROOT}/.claude" "${REPO_ROOT}/docs/guides" 2>/dev/null || true)"
for allowed in "${RETIRED_ALLOWLIST[@]}"; do
    RETIRED_HITS="$(grep -vF "${REPO_ROOT}/${allowed}" <<< "$RETIRED_HITS" || true)"
done

if [[ -z "$RETIRED_HITS" ]]; then
    assert_pass_raw "no retired component (permitter/learning.sh/save-remote-logs.js) referenced in packages/, .claude/, docs/guides/"
else
    assert_fail_raw "no retired component referenced in packages/, .claude/, docs/guides/ (found in: $(tr '\n' ' ' <<< "$RETIRED_HITS"))"
fi

# -----------------------------------------------------------------------------
# Hook-managing commands must carry the generated hook table, not prose.
#
# rebase-project.md described the hook set in prose, rotted when the set changed,
# and silently shipped a merge rule that dropped three model-judged hooks into a
# real project. --check was blind to it because it only validated the consumers
# it already knew about.
# -----------------------------------------------------------------------------
if python3 "${REPO_ROOT}/packages/core/scripts/check-hook-prose.py" "${REPO_ROOT}" 2>/dev/null; then
    assert_pass_raw "hook-managing commands carry the generated hook table"
else
    assert_fail_raw "hook-managing commands carry the generated hook table"
fi

smoke_finish
