#!/usr/bin/env bats
# =============================================================================
# implement-trd-structure.test.sh - Structure battery for the implement-trd
# rework (docs/TRD/implement-trd-rework.md, ITR-T001)
# =============================================================================
# These assertions span the command file, the delegation contract, and the
# workflow script written by separate tasks (ITR-B005, ITR-D001, ITR-B008,
# ITR-B010, ITR-B014) — no single implementation task owns them, which is
# why they exist as their own task (ITR-T001) rather than as any one task's
# acceptance criteria.
#
# Run with:
#   npx bats test/integration/tests/implement-trd-structure.test.sh
# =============================================================================

setup() {
    REPO_ROOT="$(cd "$(dirname "${BATS_TEST_FILENAME}")/../../.." && pwd)"
    CORE_COMMANDS="${REPO_ROOT}/packages/core/commands"
    CORE_CONTRACTS="${REPO_ROOT}/packages/core/contracts"
    IMPLEMENT_TRD_MD="${CORE_COMMANDS}/implement-trd.md"
    TASK_DELEGATION_MD="${CORE_CONTRACTS}/task-delegation.md"
}

# =============================================================================
# 1. The delegation contract carries inferred-grounding markers
# =============================================================================

@test "task-delegation.md contains at least one [inferred] marker" {
    local count
    count="$(grep -c '\[inferred\]' "$TASK_DELEGATION_MD")"
    [ "$count" -gt 0 ]
}

# =============================================================================
# 2. "Section 10" — the old cross-reference — is gone from BOTH former sites
# =============================================================================
# Baseline (pre-rework) had two "Section 10" references in implement-trd.md:
# :1056 and :1118. A fix that clears only one is a half-fix; the assertion's
# failure message names that there were two so that's visible immediately.

@test "implement-trd.md has zero 'Section 10' references (baseline had two: :1056 and :1118)" {
    local hits
    hits="$(grep -n 'Section 10' "$IMPLEMENT_TRD_MD" || true)"
    if [ -n "$hits" ]; then
        printf 'Found %d "Section 10" reference(s) — baseline had TWO stale sites (:1056 and :1118); clearing only one is a half-fix:\n%s\n' \
            "$(printf '%s\n' "$hits" | wc -l | tr -d ' ')" "$hits" >&2
        return 1
    fi
}

# =============================================================================
# 3. code-reviewer is absent from the PER-TASK loop (it moved to per-phase)
# =============================================================================
# Scoping: implement-trd.md's per-task machinery lives between the
# "## Step 3: Parse the TRD and Build the Task Graph" heading (which contains
# Step 3.5's per-task delegation prompt) and "## Step 7: End-of-Run Hardening
# and Review" heading, where the moved code-reviewer fan-out now lives. We
# extract exactly that span and grep it in isolation, so a `code-reviewer`
# match inside Step 7's prose explaining the move (or inside any later
# section) cannot fool this assertion — it is structurally out of scope.

@test "code-reviewer is absent from the per-task loop (Step 3 through Step 6, before Step 7's end-of-run move)" {
    local start_line end_line
    start_line="$(grep -n '^## Step 3: Parse the TRD and Build the Task Graph' "$IMPLEMENT_TRD_MD" | head -1 | cut -d: -f1)"
    end_line="$(grep -n '^## Step 7: End-of-Run Hardening and Review' "$IMPLEMENT_TRD_MD" | head -1 | cut -d: -f1)"
    [ -n "$start_line" ]
    [ -n "$end_line" ]
    [ "$end_line" -gt "$start_line" ]

    local hits
    hits="$(sed -n "${start_line},$((end_line - 1))p" "$IMPLEMENT_TRD_MD" | grep -n 'code-reviewer' || true)"
    if [ -n "$hits" ]; then
        printf 'code-reviewer found inside the per-task loop (lines %d-%d), not just in Step 7 end-of-run prose:\n%s\n' \
            "$start_line" "$((end_line - 1))" "$hits" >&2
        return 1
    fi
}

# =============================================================================
# 4. DISPATCHED / RESUMED / COMMAND COMPLETE banners, COMMAND COMPLETE last
# =============================================================================

@test "implement-trd.md documents DISPATCHED, RESUMED, and COMMAND COMPLETE banners" {
    grep -q 'DISPATCHED' "$IMPLEMENT_TRD_MD"
    grep -q 'RESUMED' "$IMPLEMENT_TRD_MD"
    grep -q 'COMMAND COMPLETE' "$IMPLEMENT_TRD_MD"
}

@test "COMMAND COMPLETE is documented as the LAST banner (after DISPATCHED and RESUMED)" {
    local dispatched_line resumed_line complete_line
    dispatched_line="$(grep -n 'DISPATCHED' "$IMPLEMENT_TRD_MD" | head -1 | cut -d: -f1)"
    resumed_line="$(grep -n 'RESUMED' "$IMPLEMENT_TRD_MD" | head -1 | cut -d: -f1)"
    complete_line="$(grep -n 'COMMAND COMPLETE' "$IMPLEMENT_TRD_MD" | tail -1 | cut -d: -f1)"

    [ -n "$dispatched_line" ]
    [ -n "$resumed_line" ]
    [ -n "$complete_line" ]

    if [ "$complete_line" -le "$dispatched_line" ] || [ "$complete_line" -le "$resumed_line" ]; then
        printf 'Expected COMMAND COMPLETE (line %d) to appear after both DISPATCHED (line %d) and RESUMED (line %d)\n' \
            "$complete_line" "$dispatched_line" "$resumed_line" >&2
        return 1
    fi

    # Explicit "nothing after" statement must also be present — the doc should
    # say so, not just have the banners in a suggestive order.
    grep -qi 'Nothing after the COMMAND COMPLETE banner' "$IMPLEMENT_TRD_MD"
}

# =============================================================================
# 5. G1's metric, asserted directly: all five producer artifacts have
#    non-zero occurrence across the reworked command + contract.
#    Measured 2026-08-15 baseline: 0 for all five, in both files.
# =============================================================================

@test "G1: [read]/[ran]/[inferred] tags have non-zero combined occurrence in command + contract" {
    local a b
    a="$(grep -Eic '\[read\]|\[ran\]|\[inferred\]' "$IMPLEMENT_TRD_MD" || true)"
    b="$(grep -Eic '\[read\]|\[ran\]|\[inferred\]' "$TASK_DELEGATION_MD" || true)"
    [ "$((a + b))" -gt 0 ]
}

@test "G1: 'Replaces' has non-zero combined occurrence in command + contract" {
    local a b
    a="$(grep -ic 'Replaces' "$IMPLEMENT_TRD_MD" || true)"
    b="$(grep -ic 'Replaces' "$TASK_DELEGATION_MD" || true)"
    [ "$((a + b))" -gt 0 ]
}

@test "G1: 'Could Not Verify' has non-zero combined occurrence in command + contract" {
    local a b
    a="$(grep -ic 'Could Not Verify' "$IMPLEMENT_TRD_MD" || true)"
    b="$(grep -ic 'Could Not Verify' "$TASK_DELEGATION_MD" || true)"
    [ "$((a + b))" -gt 0 ]
}

@test "G1: 'Open Questions' has non-zero combined occurrence in command + contract" {
    local a b
    a="$(grep -ic 'Open Questions' "$IMPLEMENT_TRD_MD" || true)"
    b="$(grep -ic 'Open Questions' "$TASK_DELEGATION_MD" || true)"
    [ "$((a + b))" -gt 0 ]
}

@test "G1: 'Serves' has non-zero combined occurrence in command + contract" {
    local a b
    a="$(grep -ic 'Serves' "$IMPLEMENT_TRD_MD" || true)"
    b="$(grep -ic 'Serves' "$TASK_DELEGATION_MD" || true)"
    [ "$((a + b))" -gt 0 ]
}

# =============================================================================
# 6. packages/core/ <-> .claude/ mirror parity (D17 / R8)
# =============================================================================
# Modelled on notify-on-complete.test.sh:262 ("L2: dogfood .claude/commands
# mirrors stay in sync with canonical") — a per-file cmp, NOT on
# vendoring.test.sh, which contains zero occurrences of "packages/core", makes
# no diff/cmp call, and only asserts a freshly-scaffolded project's structure
# (its headless block is also skipped by default). Neither file today performs
# a packages/core <-> .claude drift check; that gap is what this test closes.
#
# The file list below is every packages/core/ file this TRD (ITR-B004,
# ITR-B005, ITR-B006, ITR-B008, ITR-B010, ITR-B011, ITR-D001) adds or edits,
# excluding *.test.js (never mirrored to .claude/ — see the L1/L2 split in
# notify-on-complete.test.sh and the absence of any .claude/lib/*.test.js
# today) and excluding packages/core/scripts/* (generator-layer only; no
# packages/core/scripts/* file has a .claude/scripts/ counterpart in this
# repo — confirmed by inspection, not just for this TRD's scaffold-project.sh
# edit).
#
# Sanity check for this exact mechanism: a real drift was found by hand on
# 2026-08-15 in packages/core/hooks/prompts/autonomy-discipline.prompt.md vs
# its .claude/ mirror (see git log "fix(item-10): integrate the audit"). That
# file predates this TRD so it isn't in the list below, but `cmp` on two
# paths is exactly the mechanism this test uses — it would have caught it.

@test "packages/core/ <-> .claude/ mirror parity for every file this TRD adds or edits" {
    local core_files=(
        "packages/core/lib/trd-parser.js"
        "packages/core/lib/task-graph.js"
        "packages/core/lib/implement-state.js"
        "packages/core/hooks/status.js"
        "packages/core/commands/implement-trd.md"
        "packages/core/workflows/implement-phase.js"
        "packages/core/commands/audit-build.md"
        "packages/core/workflows/audit-build.js"
        "packages/core/contracts/task-delegation.md"
        "packages/core/hooks/dispatch-ledger.js"
        "packages/core/hooks/lib/dispatch-ledger.js"
        "packages/core/hooks/prompts/async-discipline.prompt.md"
        "packages/core/hooks/prompts/autonomy-discipline.prompt.md"
        "packages/core/hooks/prompts/subagent-discipline.prompt.md"
    )
    local claude_files=(
        ".claude/lib/trd-parser.js"
        ".claude/lib/task-graph.js"
        ".claude/lib/implement-state.js"
        ".claude/hooks/status.js"
        ".claude/commands/implement-trd.md"
        ".claude/workflows/implement-phase.js"
        ".claude/commands/audit-build.md"
        ".claude/workflows/audit-build.js"
        ".claude/contracts/task-delegation.md"
        ".claude/hooks/dispatch-ledger.js"
        ".claude/hooks/lib/dispatch-ledger.js"
        ".claude/hooks/prompts/async-discipline.prompt.md"
        ".claude/hooks/prompts/autonomy-discipline.prompt.md"
        ".claude/hooks/prompts/subagent-discipline.prompt.md"
    )

    local drift=()
    local i=0
    while [ "$i" -lt "${#core_files[@]}" ]; do
        local core="${REPO_ROOT}/${core_files[$i]}"
        local claude="${REPO_ROOT}/${claude_files[$i]}"
        if [ ! -f "$core" ]; then
            drift+=("MISSING (core): ${core_files[$i]}")
        elif [ ! -f "$claude" ]; then
            drift+=("MISSING (.claude mirror): ${claude_files[$i]}")
        elif ! cmp -s "$core" "$claude"; then
            drift+=("DRIFT: ${core_files[$i]} != ${claude_files[$i]}")
        fi
        i=$((i + 1))
    done

    if [ ${#drift[@]} -gt 0 ]; then
        printf 'packages/core/ <-> .claude/ mirror drift found:\n%s\n' "$(printf '%s\n' "${drift[@]}")" >&2
        return 1
    fi
}

# =============================================================================
# 7. harden-trd-team / verify-trd-team removal (ITR-B012) does not leave a
#    dangling mirror behind in either tree.
# =============================================================================

@test "every .claude/rules/ file matches its shipped template" {
    local drift=()
    local rule
    for rule in "${REPO_ROOT}/packages/core/templates/claude-directory/rules/"*.md; do
        local base
        base="$(basename "$rule")"
        local vendored="${REPO_ROOT}/.claude/rules/${base}"
        if [ ! -f "$vendored" ]; then
            drift+=("MISSING (.claude/rules): ${base}")
        elif ! cmp -s "$rule" "$vendored"; then
            drift+=("DRIFT: rules/${base}")
        fi
    done

    if [ ${#drift[@]} -gt 0 ]; then
        printf 'A rule file was edited in .claude/rules/ without updating the shipped template (or vice versa) — a scaffolded project would receive the stale text:\n%s\n' \
            "$(printf '%s\n' "${drift[@]}")" >&2
        return 1
    fi
}

# =============================================================================
# 9. The three discipline prompts are GENERATED by build-judge-prompts.js.
#    Hand-editing the .prompt.md files "works" until someone regenerates, at
#    which point the edit silently vanishes from the prompt AND from every
#    settings.json the hooks generator derives from it. Assert that
#    regenerating is a no-op.
# =============================================================================

@test "discipline prompt files match what build-judge-prompts.js generates" {
    command -v node >/dev/null || skip "node not available"
    run node -e '
      const { buildPrompt } = require(process.argv[1]);
      const fs = require("fs");
      const path = require("path");
      const dir = path.dirname(process.argv[1]);
      const drift = [];
      for (const name of ["async-discipline", "autonomy-discipline", "subagent-discipline"]) {
        const generated = buildPrompt(name) + "\n";
        const onDisk = fs.readFileSync(path.join(dir, name + ".prompt.md"), "utf8");
        if (generated !== onDisk) drift.push(name);
      }
      if (drift.length) {
        console.error("Hand-edited (regeneration would discard the edit): " + drift.join(", "));
        process.exit(1);
      }
    ' "${REPO_ROOT}/packages/core/hooks/prompts/build-judge-prompts.js"
    [ "$status" -eq 0 ]
}

@test "harden-trd-team.md and verify-trd-team.md are absent from both packages/core and .claude" {
    [ ! -f "${REPO_ROOT}/packages/core/commands/harden-trd-team.md" ]
    [ ! -f "${REPO_ROOT}/packages/core/commands/verify-trd-team.md" ]
    [ ! -f "${REPO_ROOT}/.claude/commands/harden-trd-team.md" ]
    [ ! -f "${REPO_ROOT}/.claude/commands/verify-trd-team.md" ]
}
