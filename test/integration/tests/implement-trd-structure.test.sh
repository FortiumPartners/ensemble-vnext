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

# `! cmd` does NOT fail a bats test unless it is the LAST line: bash suppresses
# errexit for any command prefixed with `!` (POSIX: "the -e setting shall be ignored
# ... when the command is preceded by !"). Every negated assertion above the last
# line of its test was therefore dead — `! true` passed. Found 2026-08-21 when a
# reintroduced backup step failed to trip its own guard. `refute` is a plain command,
# so its non-zero exit DOES trip errexit.
refute() {
    if "$@"; then
        echo "refute: expected failure, but this SUCCEEDED: $*" >&2
        return 1
    fi
    return 0
}

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
        "packages/core/hooks/prompts/discipline-stop.prompt.md"
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
        ".claude/hooks/prompts/discipline-stop.prompt.md"
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
      const { buildPrompt, buildCombinedPrompt, STOP_DISCIPLINE_HOOKS, STOP_DISCIPLINE_PROMPT_FILE } =
        require(process.argv[1]);
      const fs = require("fs");
      const path = require("path");
      const dir = path.dirname(process.argv[1]);
      const drift = [];

      // subagent-discipline: single-hook prompt, unmerged (SubagentStop).
      {
        const generated = buildPrompt("subagent-discipline") + "\n";
        const onDisk = fs.readFileSync(path.join(dir, "subagent-discipline.prompt.md"), "utf8");
        if (generated !== onDisk) drift.push("subagent-discipline");
      }

      // async-discipline + autonomy-discipline: merged onto one Stop prompt (FIX-002).
      {
        const generated = buildCombinedPrompt(STOP_DISCIPLINE_HOOKS) + "\n";
        const onDisk = fs.readFileSync(path.join(dir, STOP_DISCIPLINE_PROMPT_FILE), "utf8");
        if (generated !== onDisk) drift.push(STOP_DISCIPLINE_PROMPT_FILE);
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

# =============================================================================
# 8. The --verify --resume composition gate reads `outcome`
# =============================================================================
# The gate at Step 3.6 step 0 is PROSE executed by a model, not code, so this is
# a documentation-level assertion — it proves the command tells the model to read
# the terminality marker, not that a given run obeyed. That is the strongest
# check available at this layer, and it is worth having: the gate was written as
# "resumable iff the state file records a non-terminal outcome" while the Judge
# wrote no outcome key at all, so every state file read as non-terminal and
# `--verify --resume` skipped the derive pass, the whole phase loop
# and Step 7 even after a run that exited satisfied.

@test "Step 3.6's resume gate names the outcome key and both of its readings" {
    # The gate's own sentence, not merely the word "outcome" — which already
    # appeared elsewhere in this file (Step 8.4 carries the workflow's outcome)
    # and so would pass vacuously.
    grep -q 'top-level `outcome` key is `null`' "$IMPLEMENT_TRD_MD"
    # Read the marker and nothing else; a terminal outcome must NOT be resumed.
    grep -q 'Read `outcome` and nothing else' "$IMPLEMENT_TRD_MD"
    # And the gate must forbid the derivation that looks right and is not.
    grep -qi 'Do NOT try to infer terminality from' "$IMPLEMENT_TRD_MD"
}

@test "Step 8.2 does not forward outcome into the workflow's resume argument" {
    # The state file has four keys; only three reach the workflow. The command
    # must say so, or the next editor "fixes" the asymmetry by forwarding a field
    # nothing would read.
    grep -q 'resume: { iteration, criteria, gapsClosed }' "$IMPLEMENT_TRD_MD"
    # That three-key line predates the marker, so it passes vacuously on its own.
    # The load-bearing half is the stated reason for the asymmetry.
    grep -q 'not passed to the workflow' "$IMPLEMENT_TRD_MD"
}

# =============================================================================
# FR-1 / AC-1 — "the derive pass never sees the TRD".
#
# /audit-build reported this as a TRACEABILITY GAP: implemented as prose at
# Step 3.6 with FV-B004's acceptance column naming exactly the check that should
# exist, and no test implementing it. The only reachable proof was the opt-in
# smoke scenario, which is not in CI and has never completed a live run — but
# the dispatch SHAPE is greppable, needs no LLM, and closes the cheap half.
#
# Documentation-level, like the two above: it proves the command instructs the
# model correctly, not that a run obeyed.

@test "Step 3.6 dispatches the derive pass as a background SUBAGENT, not a teammate" {
    grep -q 'subagent_type="product-manager"' "$IMPLEMENT_TRD_MD"
    grep -q 'run_in_background: true' "$IMPLEMENT_TRD_MD"

    # REGRESSION GUARD. This shipped as `name="success-definition"`, which makes
    # it a TEAMMATE spawn (async-discipline.md, "Teammate spawns") rather than a
    # background subagent -- violating FV-B004's acceptance criteria and
    # contradicting Step 7.1 of this same file, which explicitly forgoes
    # Agent({name}) to satisfy AC-F14.5. Caught by the phase-2 review.
    refute grep -q 'name="success-definition"' "$IMPLEMENT_TRD_MD"
}

@test "Step 3.6's derive prompt is barred from carrying the TRD" {
    # FR-1/AC-1: the definition is derived from the PRD ALONE. A TRD path or
    # excerpt in this prompt would let the deriving agent inherit the very plan
    # the loop is supposed to check independently -- the criteria would then
    # describe what was built rather than what was asked for.
    grep -q 'no TRD path, no' "$IMPLEMENT_TRD_MD"
    grep -qi 'TRD excerpt' "$IMPLEMENT_TRD_MD"
}

# =============================================================================
# The completion report is not the end of the output. Measured 2026-08-19 on the
# third live run of the verify-functional scenario: the run completed cleanly,
# wrote every artifact, and then continued past the report block with three
# paragraphs of real analysis instead of the banner — so the scenario's
# terminator assertion failed on an otherwise green run. Step 9 ended on the
# report and said nothing about what followed, so there was nothing to obey.

@test "Step 9 tells the run the banner is the last line, with nothing after it" {
    grep -q 'The banner closes the turn' "$IMPLEMENT_TRD_MD"
    # The specific failure mode, named: useful trailing analysis is still trailing.
    grep -q 'not a caveat, not a finding' "$IMPLEMENT_TRD_MD"
    # And the report's own rule must not be mistaken for the terminator.
    grep -qi 'the end of the output; the banner is' "$IMPLEMENT_TRD_MD"
}

# =============================================================================
# The discovered-work channel. Before it, an implementer that hit a bug outside
# its scope had nowhere to put it: the finding went into its return summary, got
# compressed to one line by TASK_RESULT_SCHEMA, and died. The command computes its
# graph once and implement-phase.js iterates a fixed WAVES array, so there was no
# mechanism at all for "this run found work it did not do".

@test "the per-task prompt gives implementers a place to record out-of-scope finds" {
    grep -q '<discovered>' "$IMPLEMENT_TRD_MD"
    grep -q 'lib/discovered' "$IMPLEMENT_TRD_MD"
    # Record and carry on -- NOT fix, NOT expand scope, NOT spawn.
    grep -qi 'do not spawn an agent for it' "$IMPLEMENT_TRD_MD"
}

@test "discoveries are records, not tasks, and never injected mid-flight" {
    # The load-bearing constraint: acting on one goes through the TRD and --resume,
    # never into a dispatch already in flight.
    grep -qi 'never by injecting a task into a dispatch already in' "$IMPLEMENT_TRD_MD"
    grep -qi 'discoveries are NOT a pause condition' "$IMPLEMENT_TRD_MD"
}

@test "an empty discovery channel prints nothing rather than 'none found'" {
    # "DISCOVERED: none" claims a check happened. Nothing being recorded is a
    # different claim, and the banner must not conflate them.
    grep -q 'reads as "checked, found none"' "$IMPLEMENT_TRD_MD"
}

# =============================================================================
# /rebase-project defects reported from a live rebase, 2026-08-20.

@test "rebase restores the execute bit on every hook, not just .sh" {
    REBASE_MD="${CORE_COMMANDS}/rebase-project.md"
    # Hooks are invoked DIRECTLY by the harness, so a copy that drops the mode
    # yields "/bin/sh: .claude/hooks/router.py: Permission denied" on every event.
    # scaffold-project.sh has always chmod'd every hook regardless of extension;
    # this step did not, so a scaffolded-then-rebased project came out WORSE than
    # one never rebased. Six hooks lost the bit in the reported case.
    grep -q 'RESTORE THE EXECUTE BIT ON EVERY HOOK' "$REBASE_MD"
    grep -q 'chmod +x .claude/hooks/\*.js' "$REBASE_MD"
    grep -q 'Permission denied' "$REBASE_MD"
}

@test "stale removal is stated as an instruction, not a judgement call" {
    REBASE_MD="${CORE_COMMANDS}/rebase-project.md"
    # A live rebase classified files as stale and then declined to remove them.
    grep -qi 'This is not a judgement call' "$REBASE_MD"
    grep -qi 'Leaving it in place is the failure' "$REBASE_MD"
}

@test "agents have a STALE category at all — they had none" {
    REBASE_MD="${CORE_COMMANDS}/rebase-project.md"
    # The real defect: agents carry no `category:` marker, so "in vendored, not in
    # plugin" resolved to Custom -> preserved for EVERY such file. A retired
    # framework agent survived every rebase forever, and the run had no category to
    # put it in rather than being timid.
    grep -q 'Removed stale agent' "$REBASE_MD"
    grep -qi 'there is no marker' "$REBASE_MD"
    grep -qi 'Retired framework agents' "$REBASE_MD"
}

@test "the retired -team commands are named for deletion, not left to inference" {
    REBASE_MD="${CORE_COMMANDS}/rebase-project.md"
    # All three shipped with a valid `category:`, so the frontmatter rule already
    # classifies them Stale. Naming them removes the inference step between
    # classifying and acting -- which is exactly where a live rebase failed.
    grep -q 'harden-trd-team.md' "$REBASE_MD"
    grep -q 'verify-trd-team.md' "$REBASE_MD"
    grep -q 'implement-trd-team.md' "$REBASE_MD"
    # And the reason they matter more than an inert stale file.
    grep -qi 'working alternate path that bypasses the phase gate' "$REBASE_MD"
}

@test "the orchestrator may not fix the verification loop's gaps in flight" {
    # Observed in fanfare 2026-08-20: the loop surfaced a real editor crash, the owner
    # asked about interim results, and the orchestrator offered to fix it "in parallel"
    # while the loop was still running. Nothing in Step 8 forbade it.
    grep -q 'its gaps are NOT yours to fix' "$IMPLEMENT_TRD_MD"
    # The offer is the failure, not the fixing.
    grep -qi 'that offer is the failure, not the' "$IMPLEMENT_TRD_MD"
    # And the correctness reason, not just the tidiness one.
    grep -qi 'destroys the evidence gate' "$IMPLEMENT_TRD_MD"
}

@test "the environment is preflighted before iterations are spent" {
    grep -q 'Preflight the environment BEFORE spending iterations' "$IMPLEMENT_TRD_MD"
    # One batched question, up front, with a stated default -- not a mid-loop discovery.
    grep -qi 'asked' "$IMPLEMENT_TRD_MD"
    grep -q 'ONCE, here, as a single batched question' "$IMPLEMENT_TRD_MD"
    # And partial verification beats none.
    grep -qi 'worth far more than no verification' "$IMPLEMENT_TRD_MD"
}

@test "the debugger must bring the environment to the new code" {
    CONTRACT="${REPO_ROOT}/packages/core/contracts/functional-verification.md"
    grep -q 'Brings the environment to the new code' "$CONTRACT"
    # The specific failure: a working fix reported as a debugger failure.
    grep -qi 'blaming the debugger for a fix that actually worked' "$CONTRACT"
    # And that no sandbox rule was ever written.
    grep -qi 'no rule anywhere that forbids the loop from deploying' "$CONTRACT"
}

# =============================================================================
# DISCOVERED parity, not a curated list. The test above enumerates 14 files --
# "every file this TRD adds or edits" -- which was true when written and cannot
# stay true. Found 2026-08-21: .claude/hooks/wiggum.js had been sitting COMMITTED
# at an older revision than packages/core/hooks/wiggum.js, missing the
# retry-context feature entirely, because wiggum.js was not on the list. This
# repo dogfoods its own runtime, so it had been running the stale hook.
#
# This walks the trees instead. A new mirrored file is covered the moment it
# exists, with nobody remembering to add it.

@test "every file mirrored into .claude/ matches its packages/ source" {
    run python3 - "$REPO_ROOT" <<'PY'
import os, sys, filecmp
root = sys.argv[1]
PAIRS = [('packages/core/hooks', '.claude/hooks'),
         ('packages/core/hooks/lib', '.claude/hooks/lib'),
         ('packages/core/lib', '.claude/lib'),
         ('packages/core/workflows', '.claude/workflows'),
         ('packages/core/contracts', '.claude/contracts'),
         ('packages/core/commands', '.claude/commands'),
         ('packages/full/agents', '.claude/agents')]
# Tests and their harness are deliberately NOT shipped into a project -- a tree
# with no runner wired up does not need them (copy_workflows/copy_libs skip them).
SKIP = lambda f: f.endswith('.test.js') or f == 'test-harness.js'
drift = []
for a, b in PAIRS:
    da, db = os.path.join(root, a), os.path.join(root, b)
    if not (os.path.isdir(da) and os.path.isdir(db)):
        continue
    for f in sorted(os.listdir(da)):
        fa, fb = os.path.join(da, f), os.path.join(db, f)
        if not os.path.isfile(fa) or not os.path.isfile(fb) or SKIP(f):
            continue
        if not filecmp.cmp(fa, fb, shallow=False):
            drift.append(f"{a}/{f} != {b}/{f}")
if drift:
    print("MIRROR DRIFT:")
    for d in drift: print("  " + d)
    sys.exit(1)
PY
    [ "$status" -eq 0 ] || { echo "$output"; false; }
}

@test "verify-build runs the loop standalone and never implements" {
    VB="${CORE_COMMANDS}/verify-build.md"
    grep -q 'This command never implements' "$VB"
    # Same loop, one dispatch -- not a reimplementation of Step 8.
    grep -q 'name: "verify-functional"' "$VB"
    # AN ABSENT DEFINITION IS DERIVED, NOT A DEAD END. This test previously asserted
    # 'Do not derive one', which locked in a defect reported from the field
    # 2026-08-23: a run without --verify followed by /verify-build stopped at
    # "no definition produced" and refused to derive, citing Step 8's reasoning.
    # That reasoning was inherited without checking its premises. Step 8 cannot
    # derive because §3.6 already dispatched a background agent it cannot block on;
    # /verify-build dispatched nothing, so there is nothing to race.
    #
    # A /verify-build that refuses to derive can only run SECOND, after an --verify
    # run that already did the work — precisely when it is not needed.
    grep -q 'DERIVE it' "$VB"
    grep -qi 'Foreground, not background' "$VB"
    refute grep -qi 'Do not derive one' "$VB"

    # It must be the CONTRACT'S agent, not an inline derivation — that distinction
    # is what makes it the same production path rather than a second one.
    grep -q 'functional-verification.md text' "$VB"
    grep -q 'product-manager' "$VB"

    # The only real dead end is having no SOURCE to derive from.
    grep -q 'no success definition derivable' "$VB"
}

@test "autonomy is the default, with no flag anywhere in the runtime" {
    refute grep -qi 'wiggum' "$IMPLEMENT_TRD_MD"
    grep -q 'Autonomy is the default' "$IMPLEMENT_TRD_MD"
    # And nothing in the shipped runtime still references it.
    refute grep -rqi 'wiggum' "${REPO_ROOT}/packages/core/commands" "${REPO_ROOT}/packages/core/hooks" "${REPO_ROOT}/.claude/rules"
    [ ! -f "${REPO_ROOT}/packages/core/hooks/wiggum.js" ]
    [ ! -f "${REPO_ROOT}/.claude/hooks/wiggum.js" ]
    refute grep -q 'wiggum' "${REPO_ROOT}/packages/core/hooks/hooks.manifest.json"
}

@test "the router banner does not advertise retired commands" {
    # It runs on EVERY UserPromptSubmit, so a stale banner is the most-repeated
    # wrong statement in the framework. It advertised /harden-trd-team and
    # /verify-trd-team for five releases after ITR-B012 deleted them.
    R="${REPO_ROOT}/packages/router/hooks/router.py"
    refute grep -q 'harden-trd-team' "$R"
    refute grep -q 'verify-trd-team' "$R"
    grep -q 'verify-build' "$R"
}

@test "autonomy.md covers the declarative offer, not just the question form" {
    A="${REPO_ROOT}/.claude/rules/autonomy.md"
    # "Would you like me to X?" was covered; "say the word and I'll X" was not --
    # same move, different grammar, and it is the one that slips through.
    grep -qi "Say the word and I'll do X" "$A"
    grep -qi 'declarative form of the same offer' "$A"
}

@test "the autonomy JUDGE PROMPT covers non-interrogative deferrals" {
    # The guard is a model judge, not a regex -- but its prompt once carried six exemplars
    # and every one ended in a question mark. It told the judge to "judge the reasoning, not
    # the vocabulary" and then anchored it entirely on interrogatives, so declarative
    # deferrals passed. Measured: the same investigation was offered as "say the word and
    # I'll settle it" twice, two turns apart, and this guard allowed both.
    #
    # Asserts the INTENT, not the prose. The 2026-08-25 shortening cut the prompts by ~80%
    # after the owner reported the length itself was the product defect ("I'd rather disable
    # these hooks"). A test pinned to exact sentences makes the prompt unshortenable, which
    # is the opposite of what is wanted -- so it checks that the declarative form is covered
    # and that the principle is stated, by whatever wording.
    P="${REPO_ROOT}/packages/core/hooks/prompts/discipline-stop.prompt.md"
    [ -f "$P" ]
    # a declarative (non-question) offer appears as an example
    grep -qi "say the word" "$P"
    # and the principle that grammar is not the test
    grep -qiE 'grammar is irrelevant|not the grammar|same move' "$P"
    # Generated from the generator, never hand-edited.
    grep -q 'autonomy-discipline' "${REPO_ROOT}/packages/core/hooks/prompts/build-judge-prompts.js"
}

@test "discipline rules state the CURRENT measurement, and caveat /goal at every site" {
    # Two documentation defects found 2026-08-26 while investigating the guards' block
    # rate, both of which had gone unnoticed because nothing asserted either fact:
    #
    #  1. async-discipline.md told the reader to verify the response-contract fix by
    #     counting against "31/251 (~12%)" -- a figure taken under a metric that
    #     hook-verdict-rate.js itself retired on 2026-08-18, calling the old framing
    #     "wrong and actively misleading". A reader counting today gets a number that
    #     is not comparable and no way to know it.
    #  2. /goal was recommended as the fourth of four co-equal async primitives at four
    #     separate sites, with no mention that it is the only one with no bound. It was
    #     measured at 17 consecutive re-invocations while the discipline hooks beside it
    #     bounded at 2.
    #
    # Asserts INTENT, not prose -- same principle as the autonomy-block test above. A
    # test pinned to exact sentences makes these files unrewritable, which is the
    # opposite of what is wanted. Note the deliberate absence of a bare-word negative
    # grep: an earlier draft of this check used `grep -c "still\|not fixed"`, which
    # returns 8 on innocuous prose ("still recommended", "still in flight") and could
    # never pass.
    local A="${REPO_ROOT}/.claude/rules/async-discipline.md"
    local A_TPL="${REPO_ROOT}/packages/core/templates/claude-directory/rules/async-discipline.md"
    local C="${REPO_ROOT}/.claude/rules/constitution.md"
    local C_TPL="${REPO_ROOT}/packages/core/templates/constitution.md.template"
    for f in "$A" "$A_TPL" "$C" "$C_TPL"; do [ -f "$f" ]; done

    # (1) the metric-redefinition fact is stated, by whatever wording
    grep -qiE '2026-08-18|metric .*(retired|redefin|correct)|not comparable' "$A"
    # and the current measurement is present, not just the historical one
    grep -qE '957|0\.3%' "$A"

    # (2) every site that recommends /goal also says it does not self-limit
    for f in "$A" "$A_TPL" "$C" "$C_TPL"; do
        grep -q '/goal' "$f"
        grep -qiE 'no bound of its own|not interchangeable|does not self-limit' "$f"
    done

    # the shipped copies carry it too -- a scaffolded project must not be born stale
    cmp -s "$A" "$A_TPL"
}

@test "framework-shipped rules are UPDATED on rebase, not frozen on first install" {
    # Found 2026-08-21 from a live rebase in another project: its autonomy.md still
    # documented an autonomous-mode flag deleted five releases earlier. Nothing had
    # failed — rebase-project's §4.7 declared "two categories with opposite update
    # policies" and then gave BOTH categories the same policy (preserve-as-is), so a
    # framework rule was copied once and could never be updated again. Rules were
    # getting strictly worse treatment than commands, which are replaced-if-differs.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SECTION="$(sed -n '/^#### 4.7 Rules/,/^<\/selective-update>/p' "$RP")"
    [ -n "$SECTION" ]

    # The framework category must say UPDATED, and must NOT say preserve-as-is.
    grep -q 'Framework-shipped rules (UPDATED on rebase' <<<"$SECTION"
    refute grep -q 'copied-if-missing on rebase' <<<"$SECTION"
    refute grep -q 'preserve as-is' <<<"$SECTION"

    # Replacement must point at git for recovery — no parallel backup copies.
    grep -q 'Recovery is git' <<<"$SECTION"
    refute grep -q 'bak-' <<<"$SECTION"

    # User-owned governance must STILL be untouchable. The fix must not have
    # widened to constitution/stack/process.
    grep -q 'NEVER modified by rebase' <<<"$SECTION"
    for g in constitution stack process; do
        grep -q "rules/${g}.md" <<<"$SECTION"
    done
    grep -q 'still never modified' <<<"$SECTION"
}

@test "every framework rule template matches the live copy it ships" {
    # The rebase fix above only delivers current rules if the TEMPLATE is current.
    # A drifted template ships a stale rule to every project on the next rebase,
    # which is the same failure one layer up.
    TPL="${REPO_ROOT}/packages/core/templates/claude-directory/rules"
    [ -d "$TPL" ]
    count=0
    for t in "$TPL"/*.md; do
        base="$(basename "$t")"
        live="${REPO_ROOT}/.claude/rules/${base}"
        [ -f "$live" ]
        diff -q "$t" "$live"
        count=$((count + 1))
    done
    # Discovered, not hardcoded — but a template dir that went empty must fail.
    [ "$count" -ge 4 ]
}

@test "a user-authored skill is never removed by rebase" {
    # Found 2026-08-21 from a live rebase. Commands get a frontmatter discriminator,
    # agents get a name list, hooks get extension rules — skills had NOTHING. The
    # stack-match table only knows plugin skills, so a project-authored skill matched
    # nothing and was classified "no longer matches the stack" -> removed, on EVERY
    # rebase. Four survived only because that agent overrode its own instructions.
    # This is the one category where a wrong removal destroys unrecoverable work.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"

    # The diff step must carry a Custom row keyed on absence from the plugin library.
    grep -q 'does not exist in the plugin.s skill library at all' "$RP"

    # The APPLY step must check it before deleting — a table row nothing reads is not a guard.
    APPLY="$(sed -n '/^#### 4.2 Update Skills/,/^#### 4.3/p' "$RP")"
    grep -q 'Check the Custom guard FIRST' <<<"$APPLY"
    grep -q 'Do not delete it' <<<"$APPLY"

    # The discriminator it names must actually be a real, populated directory.
    [ -d "${REPO_ROOT}/packages/skills" ]
    [ "$(ls "${REPO_ROOT}/packages/skills" | wc -l)" -gt 10 ]
}

@test "the skill stack-match table has no rows orphaned outside it" {
    # Three rows (Tailwind, Jira, Linear) sat AFTER a prose paragraph, outside the
    # table, so they rendered as stray text and read as not-part-of-the-mapping.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"
    SECTION="$(sed -n '/^#### 2.2 Skill Diff/,/^#### 2.3/p' "$RP")"
    # Every pipe-delimited mapping row must be preceded by another row or a header
    # separator — never by a blank line or prose.
    mapfile -t LINES <<<"$SECTION"
    for i in "${!LINES[@]}"; do
        line="${LINES[$i]}"
        [[ "$line" =~ ^[[:space:]]*\|.*\|[[:space:]]*$ ]] || continue
        prev="${LINES[$((i - 1))]:-}"
        next="${LINES[$((i + 1))]:-}"
        # Legitimate: a body row following another row, or a header row whose
        # very next line is the |---|---| separator.
        [[ "$prev" =~ ^[[:space:]]*\| ]] && continue
        [[ "$next" =~ ^[[:space:]]*\|[[:space:]]*-+ ]] && continue
        echo "orphaned table row: $line (preceded by: '$prev')" >&2
        false
    done
}

@test "rebase writes no backup copies — git is the undo" {
    # Backups duplicated git (.claude/ is committed per constitution.md), cluttered the
    # user's tree with four parallel <dir>.backup.<timestamp>/ directories, needed their
    # own cleanup step, and made rollback MORE dangerous than git: the documented restore
    # was `rm -rf .claude/skills && mv .claude/skills.backup.<ts> .claude/skills`, which
    # destroys any skill added since the backup was taken.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"

    # No step may instruct creating a backup directory.
    refute grep -qi 'Create backup' "$RP"
    refute grep -q 'copy to `.claude/commands.backup' "$RP"
    refute grep -q 'copy the entire current' "$RP"
    refute grep -qi 'Cleanup Old Backups' "$RP"
    refute grep -qi 'always-backup\|always backs up\|Backups are always created' "$RP"

    # Rollback must be git, and must not tell the user to rm -rf and mv a backup in.
    ROLLBACK="$(sed -n '/^## Rollback/,/^## Error Handling/p' "$RP")"
    grep -q 'git restore .claude/' <<<"$ROLLBACK"
    refute grep -q 'mv .claude/skills.backup.<timestamp>' <<<"$ROLLBACK"
}

@test "rebase refuses to run on a dirty or unversioned .claude tree" {
    # With no backups, a clean tree is the ONLY thing between an uncommitted local edit
    # and permanent loss. The command previously had no git check of any kind.
    RP="${REPO_ROOT}/packages/core/commands/rebase-project.md"

    # The check must live in the EXECUTION path (Step 0), not only in prose.
    STEP0="$(sed -n '/^### Step 0: Validate Installation/,/^### Path Resolution/p' "$RP")"
    grep -q 'git status --porcelain -- .claude/' <<<"$STEP0"
    grep -q 'BEFORE anything else writes' <<<"$STEP0"

    # Both failure modes must be named, and both must abort.
    grep -q 'Uncommitted changes under `.claude/`' "$RP"
    grep -q 'Not a git repository' "$RP"

    # --force must be a documented flag, since the precondition points at it.
    grep -q 'argument-hint.*--force' "$RP"
    grep -q '`--force` - Proceed even when' "$RP"
}

@test "every command the router banner names exists on disk" {
    # The banner is hand-maintained prose injected on EVERY UserPromptSubmit, so a
    # stale name is the most-repeated wrong statement in the framework. It pushed
    # /harden-trd-team and /verify-trd-team for five releases after ITR-B012
    # deleted them. Test 33 greps for those two names specifically; this is the
    # general form, and it fails in BOTH directions — a deleted command still
    # advertised, and a command advertised before it is built.
    R="${REPO_ROOT}/packages/router/hooks/router.py"
    CMD_DIR="${REPO_ROOT}/packages/core/commands"

    # Slash tokens inside the banner constant only.
    banner="$(python3 - "$R" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'FRAMEWORK_HINT = """(.*?)"""', src, re.S)
print(m.group(1) if m else '')
PY
)"
    [ -n "$banner" ]

    # A slash-COMMAND follows whitespace or starts a line; a path SEGMENT follows a
    # path character. Without that boundary this matched `current` in
    # `.trd-state/current.json` and `rules` in `.claude/rules/`.
    missing=()
    for name in $(grep -oE '(^|[[:space:]])/[a-z][a-z0-9-]+' <<<"$banner" \
                  | sed -E 's|^[[:space:]]*/||' | sort -u); do
        # Platform built-ins, not project commands.
        case "$name" in
            goal|compact|clear|help) continue ;;
        esac
        [ -f "${CMD_DIR}/${name}.md" ] || missing+=("$name")
    done

    if [ ${#missing[@]} -gt 0 ]; then
        printf 'Router banner names commands with no .md in packages/core/commands:\n%s\n' "${missing[*]}" >&2
        false
    fi
}

@test "--verify derives a success definition without a PRD, preserving deriver isolation" {
    # Before this, --verify on a PRD-less TRD was a SILENT no-op: Step 3.6 recorded
    # "no PRD resolved" and dispatched nothing, Step 8 rendered a not-run report and
    # made no Workflow call. That makes /fix (item 12) impossible — nothing would
    # ever check the bug stopped happening.
    CONTRACT="${REPO_ROOT}/packages/core/contracts/functional-verification.md"

    # Step 3.6 falls through to the TRD's own sections, in order.
    grep -q '## Reproduction' "$IMPLEMENT_TRD_MD"
    grep -q '## Intended Change' "$IMPLEMENT_TRD_MD"
    grep -q 'source_kind' "$IMPLEMENT_TRD_MD"

    # The not-run reason is about a SOURCE, not a PRD — the condition always meant.
    grep -q 'no success definition derivable' "$IMPLEMENT_TRD_MD"
    refute grep -q 'no PRD resolved' "$IMPLEMENT_TRD_MD"

    # D5 ISOLATION IS THE POINT: the deriver gets extracted TEXT, never the TRD path.
    # Handing over the TRD would hand over the task list, and a deriver that sees the
    # plan writes criteria the plan satisfies by construction — circular verification.
    grep -q 'Never pass the TRD path' "$IMPLEMENT_TRD_MD"
    grep -q 'no TRD path, no' "$IMPLEMENT_TRD_MD"

    # The contract admits three sources and its citation rule is no longer PRD-only.
    grep -q 'Three source kinds are valid' "$CONTRACT"
    grep -q 'a line or section of the' "$CONTRACT"
    refute grep -q 'Every row.s .Cites. column names a PRD line or section' "$CONTRACT"
}

@test "/fix replaces investigate-issue and fix-issue, and cannot bypass its own gate" {
    FIX="${REPO_ROOT}/packages/core/commands/fix.md"
    [ -f "$FIX" ]

    # The two it replaces are GONE, not left invokable. A retired command that
    # still runs is a working alternate path that bypasses the newer gates —
    # §13's third delivery bug, and the reason the -team commands had to be named
    # for deletion explicitly.
    [ ! -f "${REPO_ROOT}/packages/core/commands/fix-issue.md" ]
    [ ! -f "${REPO_ROOT}/packages/core/commands/investigate-issue.md" ]
    [ ! -f "${REPO_ROOT}/.claude/commands/fix-issue.md" ]
    [ ! -f "${REPO_ROOT}/.claude/commands/investigate-issue.md" ]

    # Sizing is delegated to the lib, never re-derived in prose.
    grep -q 'fix-sizing' "$FIX"
    grep -q 'lib owns this decision' "$FIX"

    # The escape hatch that would defeat the gate must not exist. Check the
    # ARGUMENT SURFACE, not the word — the command legitimately mentions
    # --force-auto in the sentence explaining why there isn't one.
    refute grep -q 'argument-hint:.*force-auto' "$FIX"
    # The gate constrains what a MACHINE does unattended, never the owner: the
    # capability is theirs either way via /implement-trd. What the missing flag
    # prevents is the COMMAND deciding on their behalf that the gate did not apply.
    grep -q 'no `--force-auto` flag' "$FIX"
    grep -q 'never meant to constrain you' "$FIX"
    # And every lowered tier must hand back a remedy, not just a verdict.
    grep -q 'remedies' "$FIX"

    # AUTO chains with --verify. That invariant moved into fix-plan.js (which
    # always appends --verify and has a test for it) when five inconsistent prose
    # copies of the same table were collapsed into one function. What this checks
    # is that the command delegates rather than re-deriving.
    grep -q 'lib/fix-plan' "$FIX"
    grep -q 'Do not re-derive any of this in prose' "$FIX"
    [ -f "${REPO_ROOT}/packages/core/lib/fix-plan.js" ]

    # Both verification sources are named — the defect path AND the conversational
    # path. Omitting either ships that half of /fix unverified.
    grep -q '## Reproduction' "$FIX"
    grep -q '## Intended Change' "$FIX"

    # A chaining run must NOT emit its own COMMAND COMPLETE (nothing may follow it).
    # fix-plan.js returns banner:null for that case and a test pins it; the command
    # must explain the null rather than leave a reader to override it on instinct.
    grep -q 'banner: null' "$FIX"
    grep -q 'the run is over. Emit' "$FIX"
}

@test "no command spawns teammates any more" {
    # /fix-issue was the last one. The rule files asserted otherwise until the
    # command was deleted, which is how a rule goes stale: the claim was true
    # when written and nothing re-checked it.
    refute grep -rqE 'Agent\(\{ *(subagent_type[^)]*name:|name:)' "${REPO_ROOT}/packages/core/commands"
    grep -q 'NO command in this framework spawns teammates' \
        "${REPO_ROOT}/.claude/rules/async-discipline.md"
}
