#!/usr/bin/env bash
# =============================================================================
# run-smoke.sh - Behavioral smoke harness runner
# =============================================================================
#
# Answers "did I just break something?" with deterministic checks over
# observable side effects. NOT a quality evaluator (see test/evals/, which
# is deliberately dormant). Runs every scenario in test/smoke/scenarios/,
# prints a per-scenario pass/fail table with elapsed time, and exits
# non-zero if any scenario failed.
#
# Usage:
#   ./run-smoke.sh                        Deterministic checks + implement-one-task canary
#   ./run-smoke.sh hooks-health            Run one scenario by name
#   ./run-smoke.sh hooks-health prd-run    Run a subset by name
#   ./run-smoke.sh --with-llm              Default set + the opt-in LLM scenarios
#   ./run-smoke.sh prd-run                 A single opt-in LLM scenario, by name
#
# Exit codes:
#   0  all scenarios passed or were skipped
#   1  at least one scenario failed
# =============================================================================

set -uo pipefail

# Bash 4+ required: this script uses associative arrays (declare -A) for the
# per-scenario budgets. macOS ships bash 3.2 as /bin/bash, where `declare -A`
# is unsupported and `[hooks-health]=15` parses as an ARITHMETIC subscript,
# failing with the thoroughly unhelpful "hooks: unbound variable". Fail with
# something actionable instead.
if (( BASH_VERSINFO[0] < 4 )); then
    echo "ERROR: bash 4+ required (found ${BASH_VERSION})." >&2
    echo "  macOS /bin/bash is 3.2 — install a modern bash (brew install bash)" >&2
    echo "  or invoke via a bash 4+ already on PATH: bash test/smoke/run-smoke.sh" >&2
    exit 1
fi

SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"

# Per-scenario wall-clock budgets (seconds).
#
# The LLM scenarios run CONCURRENTLY, so the harness total is the SLOWEST of
# them, not their sum. Serially these caps summed to 1665s — nearly 28 minutes —
# which blew the ten-minute design constraint that is the entire point of this
# harness. A harness nobody runs is worth nothing, so wall-clock is a hard
# requirement rather than an aspiration. The scenarios are independent by
# construction (each builds its own throwaway project in its own temp dir), so
# running them concurrently costs nothing.
#
# Measured on this machine: prd-run took 483s on the default models and hit its
# own cap, failing two assertions purely because it ran out of time; with
# CLAUDE_CODE_SUBAGENT_MODEL set to Haiku it finished in 315s and passed all six.
# Hence the model default below.
declare -A SCENARIO_TIMEOUT=(
    [hooks-health]=15
    [scaffold-integrity]=60
    [artifact-contracts]=30
    [prd-run]=900
    [trd-run]=900
    [implement-one-task]=900
    [debug-path]=900
    # verify-functional runs TWO sequential live `/implement-trd` invocations
    # (without the flag, then with it) in separate throwaway projects. The
    # second additionally pays for the Step 3.6 derive pass and Step 8's
    # verification loop (up to 3 exercise/judge/debug iterations), so it is not
    # "double a single dispatch" — it is one dispatch plus a larger one. This
    # cap must exceed the scenario's own TIMEOUT_OFF + TIMEOUT_ON (840 + 1500)
    # plus two scaffolds; raise all three together.
    [verify-functional]=3300
)

# Advisory wall-clock target (seconds). REPORTING ONLY — exceeding it is a
# note, never a failure, and never a reason to weaken what is being tested.
# Concurrency is a legitimate way to cut wall-clock because it does not change
# what runs; substituting models is not.
SMOKE_TOTAL_BUDGET="${SMOKE_TOTAL_BUDGET:-900}"

# NO MODEL OVERRIDE. Deliberately.
#
# An earlier version defaulted CLAUDE_CODE_SUBAGENT_MODEL to Haiku because it
# cut a scenario from 483s to 315s and fit a ten-minute target. That was
# backwards: a harness that runs the agents on a model nobody ships is not
# testing the product. Every scenario would have been validating a
# configuration that never reaches a user, and any regression that only
# manifests on the shipped models — Opus for product-manager, spec-planner,
# technical-architect, code-reviewer, code-simplifier, app-debugger; Sonnet for
# the implementers and verify-app — would have been invisible to precisely the
# thing whose job is to catch it.
#
# The ten-minute figure was a convenience target, not a requirement. Fidelity
# outranks it. If you want a faster run for local iteration, set
# CLAUDE_CODE_SUBAGENT_MODEL yourself for that run — but a result produced that
# way must not be recorded as a baseline.

# The refresh hook must never fire mid-scenario and rewrite a fixture runtime.
export ENSEMBLE_RUNTIME_REFRESH_DISABLE=1

# Default set: deterministic checks (no LLM, no API cost) plus ONE end-to-end
# LLM canary. Every real defect found in this framework recently was SILENT
# ABSENCE (a hook that shipped broken, hooks that never shipped, a manifest
# that never reached the installed plugin, a drift-checker that always exited
# 0) — none of those announce themselves in prompt output, which is exactly
# why the deterministic checks are the default and the LLM scenarios are not.
# implement-one-task stays in the default set as the single canary that the
# full IMPLEMENT -> VERIFY -> SIMPLIFY -> VERIFY -> REVIEW loop still runs
# end to end, including state advancement and the git branch — the highest-
# leverage single LLM scenario to keep paying for by default.
ALL_SCENARIOS=(hooks-health scaffold-integrity artifact-contracts implement-one-task)

# Opt-in LLM scenarios: prd-run, trd-run, debug-path, verify-functional. These
# cost ~5-6 minutes each (verify-functional roughly double, two live runs)
# to assert things a user would notice within seconds ("a PRD file
# appeared") — output QUALITY is test/evals/'s job, deliberately deferred (see
# test/smoke/README.md). Run explicitly by name, or pass --with-llm to add
# the whole set to whatever's already selected.
LLM_OPT_IN_SCENARIOS=(prd-run trd-run debug-path verify-functional)

WITH_LLM=false
EXPLICIT_NAMES=()
for arg in "$@"; do
    if [[ "$arg" == "--with-llm" ]]; then
        WITH_LLM=true
    else
        EXPLICIT_NAMES+=("$arg")
    fi
done

if [[ "${#EXPLICIT_NAMES[@]}" -gt 0 ]]; then
    RUN_SCENARIOS=("${EXPLICIT_NAMES[@]}")
else
    RUN_SCENARIOS=("${ALL_SCENARIOS[@]}")
fi

if [[ "$WITH_LLM" == "true" ]]; then
    RUN_SCENARIOS+=("${LLM_OPT_IN_SCENARIOS[@]}")
fi

echo "=============================================================="
echo " Ensemble vNext — Behavioral Smoke Harness"
echo "=============================================================="
echo ""

TOTAL_START=$(date +%s)

declare -a RESULT_NAMES=()
declare -a RESULT_STATUS=()
declare -a RESULT_ELAPSED=()
declare -a RESULT_ASSERTIONS=()

OVERALL_RC=0

# Run one scenario; write its result as a single line to $3 so a concurrent
# child can report back to the parent without shared-memory games.
run_one() {
    local name="$1" scenario_file="$2" result_file="$3"
    local budget start end elapsed rc out_file assertions_line assertions_summary status

    budget="${SCENARIO_TIMEOUT[$name]:-300}"
    start=$(date +%s)
    out_file="$(mktemp "${TMPDIR:-/tmp}/ensemble-smoke-run.XXXXXX")"
    # Remove on ANY exit from this subshell, not just the happy path — an
    # interrupt or a killed run previously leaked these into /tmp.
    trap 'rm -f "$out_file"' RETURN

    smoke_timeout "$budget" bash "$scenario_file" >"$out_file" 2>&1
    rc=$?

    end=$(date +%s)
    elapsed=$((end - start))

    assertions_line="$(grep -E '^ASSERTIONS: ' "$out_file" | tail -1)"
    assertions_summary="${assertions_line#ASSERTIONS: }"
    [[ -z "$assertions_summary" ]] && assertions_summary="n/a"

    case "$rc" in
        0)   status="PASS" ;;
        2)   status="SKIP" ;;
        124) status="FAIL (timeout after ${budget}s)" ;;
        *)   status="FAIL" ;;
    esac

    # Scenario output is buffered and printed together, so concurrent scenarios
    # don't interleave into unreadable soup.
    {
        echo "--------------------------------------------------------------"
        echo ">> ${name}"
        echo "--------------------------------------------------------------"
        cat "$out_file"
    } >"${result_file}.log"

    printf '%s\t%s\t%s\t%s\n' "$name" "$status" "$elapsed" "$assertions_summary" >"$result_file"
    rm -f "$out_file"
}

# The deterministic scenarios (hooks-health, scaffold-integrity,
# artifact-contracts) run FIRST and serially: none needs an LLM, together
# they finish in single-digit seconds, and if a registered hook cannot even
# load or an artifact contract has drifted, every downstream behavioral
# assertion is noise. Fail fast and cheap before spending minutes on an LLM
# scenario whose result won't matter if the deterministic layer is broken.
DETERMINISTIC_SCENARIOS=(hooks-health scaffold-integrity artifact-contracts)
SERIAL_SCENARIOS=()
PARALLEL_SCENARIOS=()
for name in "${RUN_SCENARIOS[@]}"; do
    is_deterministic=false
    for det in "${DETERMINISTIC_SCENARIOS[@]}"; do
        [[ "$name" == "$det" ]] && is_deterministic=true && break
    done
    if [[ "$is_deterministic" == "true" ]]; then
        SERIAL_SCENARIOS+=("$name")
    else
        PARALLEL_SCENARIOS+=("$name")
    fi
done

RESULT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-results.XXXXXX")"
trap 'rm -rf "$RESULT_DIR"' EXIT

collect_result() {
    local rf="$1" name status elapsed assertions
    IFS=$'\t' read -r name status elapsed assertions <"$rf"
    RESULT_NAMES+=("$name")
    RESULT_STATUS+=("$status")
    RESULT_ELAPSED+=("$elapsed")
    RESULT_ASSERTIONS+=("$assertions")
    [[ "$status" == PASS || "$status" == SKIP ]] || OVERALL_RC=1
}

for name in "${SERIAL_SCENARIOS[@]}"; do
    scenario_file="${SMOKE_DIR}/scenarios/${name}.sh"
    if [[ ! -f "$scenario_file" ]]; then
        echo "!! Unknown scenario: $name (no ${scenario_file})" >&2
        RESULT_NAMES+=("$name"); RESULT_STATUS+=("ERROR")
        RESULT_ELAPSED+=("0"); RESULT_ASSERTIONS+=("n/a")
        OVERALL_RC=1
        continue
    fi
    run_one "$name" "$scenario_file" "${RESULT_DIR}/${name}"
    cat "${RESULT_DIR}/${name}.log"
    collect_result "${RESULT_DIR}/${name}"
done

# Everything else concurrently — independent temp dirs, so the only shared
# resource is the API.
PIDS=()
for name in "${PARALLEL_SCENARIOS[@]}"; do
    scenario_file="${SMOKE_DIR}/scenarios/${name}.sh"
    if [[ ! -f "$scenario_file" ]]; then
        echo "!! Unknown scenario: $name (no ${scenario_file})" >&2
        RESULT_NAMES+=("$name"); RESULT_STATUS+=("ERROR")
        RESULT_ELAPSED+=("0"); RESULT_ASSERTIONS+=("n/a")
        OVERALL_RC=1
        continue
    fi
    echo ">> ${name} (running concurrently)"
    run_one "$name" "$scenario_file" "${RESULT_DIR}/${name}" &
    PIDS+=($!)
done

for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] && wait "$pid" || true
done

for name in "${PARALLEL_SCENARIOS[@]}"; do
    [[ -f "${RESULT_DIR}/${name}.log" ]] && cat "${RESULT_DIR}/${name}.log"
    [[ -f "${RESULT_DIR}/${name}" ]] && collect_result "${RESULT_DIR}/${name}"
done

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

# The ten-minute constraint is the point of this harness, so report against it
# explicitly. Exceeding it is a WARNING, not a failure — a slow run still tells
# you whether something broke — but it is called out loudly, because the moment
# this stops fitting in a coffee break it stops getting run.
BUDGET_NOTE=""
if [[ "$TOTAL_ELAPSED" -gt "$SMOKE_TOTAL_BUDGET" ]]; then
    BUDGET_NOTE="  (over the ${SMOKE_TOTAL_BUDGET}s advisory target — informational only)"
fi

echo "=============================================================="
echo " Results"
echo "=============================================================="
printf "%-22s %-24s %8s   %s\n" "SCENARIO" "STATUS" "ELAPSED" "ASSERTIONS"
printf "%-22s %-24s %8s   %s\n" "--------" "------" "-------" "----------"
for i in "${!RESULT_NAMES[@]}"; do
    printf "%-22s %-24s %7ss   %s\n" \
        "${RESULT_NAMES[$i]}" "${RESULT_STATUS[$i]}" "${RESULT_ELAPSED[$i]}" "${RESULT_ASSERTIONS[$i]}"
done
echo ""
echo "Wall-clock total: ${TOTAL_ELAPSED}s / ${SMOKE_TOTAL_BUDGET}s budget${BUDGET_NOTE}"
echo ""

if [[ "$OVERALL_RC" -ne 0 ]]; then
    echo "RESULT: FAIL — see failing scenario(s) above"
else
    echo "RESULT: PASS"
fi

exit "$OVERALL_RC"
