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
    ! grep -q 'name="success-definition"' "$IMPLEMENT_TRD_MD"
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
    # An absent definition stops it; it must not derive one (second production path).
    grep -qi 'not run: no definition' "$VB"
    grep -qi 'Do not derive one' "$VB"
}

@test "--wiggum is gone, and autonomy is the default rather than a mode" {
    # The flag was registered, tested, scaffolded into every project -- and could
    # never fire: its hook needed WIGGUM_ACTIVE=1 and nothing ever set it. Its five
    # permanently-failing tests were the repo's baseline.
    ! grep -q -- '--wiggum' "$IMPLEMENT_TRD_MD"
    grep -q 'There is no autonomous MODE' "$IMPLEMENT_TRD_MD"
    [ ! -f "${REPO_ROOT}/packages/core/hooks/wiggum.js" ]
    [ ! -f "${REPO_ROOT}/.claude/hooks/wiggum.js" ]
    ! grep -q 'wiggum' "${REPO_ROOT}/packages/core/hooks/hooks.manifest.json"
}
