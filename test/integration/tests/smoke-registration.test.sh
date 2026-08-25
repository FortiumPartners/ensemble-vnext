#!/usr/bin/env bats
#
# The smoke harness's own roster. A scenario file that exists but is registered
# nowhere never runs, and reports nothing — it looks like coverage while being
# none. That is the same silent-zero class check-test-suites.sh was written for
# in the bats suites; this is its counterpart for test/smoke/.
#
# Rosters are DISCOVERED, never hardcoded. notify-on-complete.test.sh records
# why: its command roster was a hand-maintained list and broke the moment item 12
# deleted two commands. A list that must be edited by hand is a list that will be
# wrong.

setup_file() {
    set -euo pipefail
    REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
    export REPO_ROOT
    export RUNNER="${REPO_ROOT}/test/smoke/run-smoke.sh"
    export SCENARIO_DIR="${REPO_ROOT}/test/smoke/scenarios"
}

# Names as the runner would see them, read from the arrays themselves.
_names_in_array() {
    sed -n "s/^${1}=(\(.*\))\$/\1/p" "$RUNNER" | tr ' ' '\n' | grep -v '^$'
}

@test "the runner and the scenarios directory both exist" {
    [ -x "$RUNNER" ]
    [ -d "$SCENARIO_DIR" ]
    run bash -c 'find "$1" -maxdepth 1 -name "*.sh" | wc -l' _ "$SCENARIO_DIR"
    [ "$output" -ge 5 ]
}

@test "every scenario file is registered in exactly one roster" {
    local unregistered=() both=()
    local all llm
    all="$(_names_in_array ALL_SCENARIOS)"
    llm="$(_names_in_array LLM_OPT_IN_SCENARIOS)"
    # Both arrays must have parsed — a sed that matched nothing would make this
    # test pass vacuously by finding every scenario "unregistered" in neither.
    [ -n "$all" ]
    [ -n "$llm" ]
    while IFS= read -r f; do
        local n; n="$(basename "$f" .sh)"
        local in_all=0 in_llm=0
        grep -qx "$n" <<< "$all" && in_all=1
        grep -qx "$n" <<< "$llm" && in_llm=1
        if [ $((in_all + in_llm)) -eq 0 ]; then unregistered+=("$n"); fi
        if [ $((in_all + in_llm)) -eq 2 ]; then both+=("$n"); fi
    done < <(find "$SCENARIO_DIR" -maxdepth 1 -name '*.sh' | sort)
    if [ "${#unregistered[@]}" -gt 0 ]; then
        printf 'Scenario files registered in no roster (they never run): %s\n' "${unregistered[*]}" >&2
        return 1
    fi
    if [ "${#both[@]}" -gt 0 ]; then
        printf 'Scenario files in BOTH rosters (would run twice under --with-llm): %s\n' "${both[*]}" >&2
        return 1
    fi
}

@test "every registered scenario name has a file behind it" {
    local missing=()
    local n
    while IFS= read -r n; do
        [ -z "$n" ] && continue
        [ -f "${SCENARIO_DIR}/${n}.sh" ] || missing+=("$n")
    done < <(_names_in_array ALL_SCENARIOS; _names_in_array LLM_OPT_IN_SCENARIOS)
    if [ "${#missing[@]}" -gt 0 ]; then
        printf 'Registered names with no scenario file: %s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "every registered scenario has an explicit SCENARIO_TIMEOUT budget" {
    # run-smoke.sh defaults to 300s when a key is absent. For an LLM scenario
    # that surfaces as a confusing timeout FAIL rather than a missing-budget
    # error, so the budget is required to be stated rather than inherited.
    local missing=()
    local n
    while IFS= read -r n; do
        [ -z "$n" ] && continue
        grep -qE "^\s*\[${n}\]=[0-9]+" "$RUNNER" || missing+=("$n")
    done < <(_names_in_array ALL_SCENARIOS; _names_in_array LLM_OPT_IN_SCENARIOS)
    if [ "${#missing[@]}" -gt 0 ]; then
        printf 'Registered scenarios with no SCENARIO_TIMEOUT entry: %s\n' "${missing[*]}" >&2
        return 1
    fi
}

@test "no LLM scenario is in the default no-model set" {
    # ALL_SCENARIOS is the set that runs with a bare ./run-smoke.sh. A model
    # scenario landing there turns a seconds-long check into a many-minute one
    # and makes the default set cost money — the specific misregistration the
    # runner's own comment above ALL_SCENARIOS warns about.
    # ONE model scenario in the default set is deliberate: test/smoke/baseline.json
    # records implement-one-task under default_set with "llm": true, and the
    # harness's rationale wants one end-to-end loop measured by default. This
    # test guards against an UNINTENDED second one, so the sanctioned exception
    # is named here rather than the check being dropped.
    local SANCTIONED_LLM_IN_DEFAULT=(implement-one-task)
    local leaked=()
    local n s
    while IFS= read -r n; do
        [ -z "$n" ] && continue
        local f="${SCENARIO_DIR}/${n}.sh"
        [ -f "$f" ] || continue
        local sanctioned=0
        for s in "${SANCTIONED_LLM_IN_DEFAULT[@]}"; do
            [ "$n" = "$s" ] && sanctioned=1
        done
        [ "$sanctioned" -eq 1 ] && continue
        # smoke_claude is the only path to a model turn in this harness.
        if grep -q 'smoke_claude' "$f"; then leaked+=("$n"); fi
    done < <(_names_in_array ALL_SCENARIOS)
    if [ "${#leaked[@]}" -gt 0 ]; then
        printf 'Unsanctioned model scenarios in the default no-model set: %s\n' "${leaked[*]}" >&2
        return 1
    fi
}

@test "rebase-old-tree is registered as an LLM opt-in scenario" {
    run bash -c 'sed -n "s/^LLM_OPT_IN_SCENARIOS=(\(.*\))$/\1/p" "$1"' _ "$RUNNER"
    [[ "$output" == *"rebase-old-tree"* ]]
    [ -x "${SCENARIO_DIR}/rebase-old-tree.sh" ]
}
