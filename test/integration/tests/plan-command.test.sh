#!/usr/bin/env bats
#
# The pin for the /investigate -> /plan rename (D11, plan-weight-router TRD). Two
# claims, checked separately per PLAN-T001's objective:
#
#   1. /plan is registered in BOTH mirrored trees (packages/core/commands/ is the
#      generator layer, .claude/commands/ is the vendored runtime — see
#      constitution.md's Two-Layer Architecture). investigate.md is gone from both
#      (D1: deleted, not aliased).
#   2. No LIVE surface anywhere in either tree still names the command form
#      `/investigate` (word-boundary — the bare word "investigate"/"investigates"
#      is ordinary English and survives the rename, e.g. app-debugger's own
#      description and the router's orientation hint; only the SLASH-COMMAND form
#      is a rename miss).
#
# This second claim is what makes the pin worth anything: a sweep that renamed the
# command file but left five old references in prose would still pass claim 1. A
# single-tree grep would also pass a sweep applied to only one mirror — so each
# tree is asserted on SEPARATELY (notify-on-complete.test.sh's mirror-parity
# lesson: a hand-run grep across "the repo" silently blends two trees together and
# a miss in one hides behind a hit in the other's absence).
#
# EXCLUSION SET — a visible array, not a grep -v chain, so a future addition to
# this list is an edit to data, not to a pipeline:
#
#   CHANGELOG.md                        historical record, expected to mention old names
#   docs/PRD/                           point-in-time product documents
#   docs/TRD/                           point-in-time technical documents (this TRD names
#                                        /investigate throughout, by necessity, since it IS
#                                        the rename)
#   docs/modernization/                 planning history, not a live surface
#   test/evals/analysis-archive/        archived eval output, not a live surface
#   ensemble-vnext-test-fixtures/       frozen fixture trees for OTHER tests; not this
#                                        project's own live surfaces
#   .trd-state/                         tracking state (discovered.jsonl, implement.json)
#                                        that legitimately records the rename happening
#   .claude.backup.*                    pre-refresh backups, not live
#   .claude/worktrees/                  GITIGNORED (`.gitignore`) and UNTRACKED
#                                        (`git ls-files .claude/worktrees | wc -l` -> 0
#                                        [ran]), but physically present on disk today as
#                                        stale parallel git-worktree checkouts nested
#                                        INSIDE .claude/ — one of the two trees this test
#                                        scans. Measured 2026-09-23 [ran]: 40 files under
#                                        .claude/worktrees/ contain /investigate. Omitting
#                                        this entry would mask a real miss behind 40
#                                        phantom hits from checkouts nobody ships.
#
# INCLUDED (what actually gets scanned, so a reader can see the coverage, not just
# the exclusions): packages/core/commands/, packages/core/lib/,
# packages/core/workflows/, packages/core/templates/, packages/router/,
# .claude/commands/, .claude/lib/, .claude/workflows/, .claude/rules/, and CLAUDE.md.
#
# This test is written to FAIL against the tree as it stood before this rename
# swept clean — reasoned, not reverted (PLAN-T001's own instruction forbids
# reverting to check): before PLAN-B005/D002/D001 ran, packages/core/commands/
# had no plan.md, .claude/commands/ had no plan.md, and both trees' commands/
# rules/lib/workflows carried /investigate throughout (the command file itself,
# CLAUDE.md's workflow diagram, autonomy.md's example table, etc.) — every
# assertion below would have failed. See "reasoning about what it greps" note
# above each @test.

setup_file() {
    set -euo pipefail
    REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
    export REPO_ROOT

    # The generator layer (constitution.md's "Plugin (Generator Layer)").
    export PKG_COMMANDS="${REPO_ROOT}/packages/core/commands"
    export PKG_LIB="${REPO_ROOT}/packages/core/lib"
    export PKG_WORKFLOWS="${REPO_ROOT}/packages/core/workflows"
    export PKG_TEMPLATES="${REPO_ROOT}/packages/core/templates"
    export PKG_ROUTER="${REPO_ROOT}/packages/router"

    # The vendored runtime (constitution.md's "Vendored Runtime (Execution Layer)").
    export CC_COMMANDS="${REPO_ROOT}/.claude/commands"
    export CC_LIB="${REPO_ROOT}/.claude/lib"
    export CC_WORKFLOWS="${REPO_ROOT}/.claude/workflows"
    export CC_RULES="${REPO_ROOT}/.claude/rules"

    export CLAUDE_MD="${REPO_ROOT}/CLAUDE.md"

    # The exclusion array itself — a visible list, edited as data. Entries are
    # matched as substrings of the file path (relative to REPO_ROOT).
    EXCLUSIONS=(
        "CHANGELOG.md"
        "docs/PRD/"
        "docs/TRD/"
        "docs/modernization/"
        "test/evals/analysis-archive/"
        "ensemble-vnext-test-fixtures/"
        ".trd-state/"
        ".claude.backup."
        ".claude/worktrees/"
    )
    export EXCLUSIONS_STR="${EXCLUSIONS[*]}"
}

# Word-boundary grep for the COMMAND form only: "/investigate" preceded by
# something that is not a path/word character (or start of line), so it catches
# `/investigate`, "`/investigate`", "(/investigate)" and misses "investigate",
# "investigates", "fix-issue" — the bare verb is ordinary English that survives
# the rename (router hint, app-debugger description) and must not fail this test.
_grep_investigate_command_form() {
    local dir="$1"
    [ -d "$dir" ] || return 0
    grep -rnE '(^|[^A-Za-z0-9_/-])/investigate([^A-Za-z0-9_-]|$)' "$dir" 2>/dev/null || true
}

# Drops any hit whose path contains one of EXCLUSIONS_STR's entries as a substring.
_filter_exclusions() {
    local hits="$1"
    local excluded=()
    read -r -a excluded <<< "$EXCLUSIONS_STR"
    local line kept=""
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local path="${line%%:*}"
        local rel="${path#"$REPO_ROOT"/}"
        local skip=0
        local e
        for e in "${excluded[@]}"; do
            [[ "$rel" == *"$e"* ]] && skip=1 && break
        done
        [ "$skip" -eq 0 ] && kept+="${line}"$'\n'
    done <<< "$hits"
    printf '%s' "$kept"
}

@test "the exclusion set is a visible array, not a grep -v chain" {
    # Guards the array itself against silent drift into a pipeline: if this ever
    # stops being a bash array declaration, the file's own header claim is false.
    grep -q '^    EXCLUSIONS=($' "$BATS_TEST_FILENAME"
    [ "${#EXCLUSIONS_STR}" -gt 0 ]
}

@test "packages/core tree: /plan is registered, /investigate command file is gone" {
    [ -f "${PKG_COMMANDS}/plan.md" ]
    [ ! -f "${PKG_COMMANDS}/investigate.md" ]
    [ ! -f "${PKG_COMMANDS}/investigate-issue.md" ]
    [ ! -f "${PKG_COMMANDS}/fix-issue.md" ]
}

@test ".claude tree: /plan is registered, /investigate command file is gone" {
    [ -f "${CC_COMMANDS}/plan.md" ]
    [ ! -f "${CC_COMMANDS}/investigate.md" ]
    [ ! -f "${CC_COMMANDS}/investigate-issue.md" ]
    [ ! -f "${CC_COMMANDS}/fix-issue.md" ]
}

@test "packages/core tree: no live surface names the /investigate command form" {
    local hits=""
    for d in "$PKG_COMMANDS" "$PKG_LIB" "$PKG_WORKFLOWS" "$PKG_TEMPLATES" "$PKG_ROUTER"; do
        hits+="$(_grep_investigate_command_form "$d")"$'\n'
    done
    hits+="$(_grep_investigate_command_form "$CLAUDE_MD")"$'\n'
    local kept
    kept="$(_filter_exclusions "$hits")"
    if [ -n "$(echo "$kept" | tr -d '[:space:]')" ]; then
        printf 'Live /investigate references in packages/core tree (sweep incomplete):\n%s\n' "$kept" >&2
        return 1
    fi
}

@test ".claude tree: no live surface names the /investigate command form" {
    local hits=""
    for d in "$CC_COMMANDS" "$CC_LIB" "$CC_WORKFLOWS" "$CC_RULES"; do
        hits+="$(_grep_investigate_command_form "$d")"$'\n'
    done
    local kept
    kept="$(_filter_exclusions "$hits")"
    if [ -n "$(echo "$kept" | tr -d '[:space:]')" ]; then
        printf 'Live /investigate references in .claude tree (sweep incomplete):\n%s\n' "$kept" >&2
        return 1
    fi
}

@test "both trees are actually scanned (a test that greps nothing proves nothing)" {
    # Sanity floor: if either tree suddenly has zero files under its scanned
    # dirs, the two tests above would pass vacuously. Guard against that.
    local pkg_count cc_count
    pkg_count=$(find "$PKG_COMMANDS" "$PKG_LIB" "$PKG_WORKFLOWS" "$PKG_TEMPLATES" "$PKG_ROUTER" -type f 2>/dev/null | wc -l | tr -d ' ')
    cc_count=$(find "$CC_COMMANDS" "$CC_LIB" "$CC_WORKFLOWS" "$CC_RULES" -type f 2>/dev/null | wc -l | tr -d ' ')
    [ "$pkg_count" -gt 10 ]
    [ "$cc_count" -gt 10 ]
}
