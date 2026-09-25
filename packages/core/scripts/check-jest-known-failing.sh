#!/usr/bin/env bash
#
# check-jest-known-failing.sh — every Jest suite excluded from CI as
# "known-failing" must actually still fail.
#
# The failure this exists for is the same one check-test-suites.sh already
# fixed for BATS: an exclusion list that goes stale because nobody re-checks
# it once the underlying bug is fixed. It happened here for real — ci.yml
# excluded packages/core/hooks/status.test.js, test/evals/framework/judge.test.js
# and test/evals/framework/run-eval.test.js as "known-failing, all predating
# this workflow" while all three passed cleanly (67, 60 and 42 tests). 169
# tests sat invisible to CI with nothing checking whether the label was still
# true.
#
# This script does not try to parse --testPathIgnorePatterns out of ci.yml —
# that list also carries structural exclusions (node_modules/, results/) that
# are correct forever and were never "known-failing" in the first place.
# Instead, ci.yml marks each suite it is SKIPPING OUTRIGHT because it is
# believed to fail with a dedicated comment line:
#
#   # KNOWN-FAILING: <path/to/suite.test.js>
#
# and this script greps that marker, runs each named suite on its own, and
# fails the build if any of them now passes — which means the exclusion is
# stale and hiding tests that should be running. A suite that is instead
# excluded from the main run but executed in its OWN step (because it must
# not share a process with other suites, not because it fails — see
# status.test.js's isolation step) is not a "known-failing" marker and this
# script does not touch it.
#
# Usage: check-jest-known-failing.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

WORKFLOW="${REPO_ROOT}/.github/workflows/ci.yml"

if [[ ! -f "$WORKFLOW" ]]; then
    echo "check-jest-known-failing.sh: ${WORKFLOW} not found" >&2
    exit 1
fi

mapfile -t SUITES < <(grep -oE '# KNOWN-FAILING: +\S+' "$WORKFLOW" \
    | sed -E 's/# KNOWN-FAILING: +//' | sort -u)

if [[ ${#SUITES[@]} -eq 0 ]]; then
    echo "no suites declared KNOWN-FAILING in ci.yml — nothing to check"
    exit 0
fi

status=0
for suite in "${SUITES[@]}"; do
    if [[ ! -f "$suite" ]]; then
        echo "KNOWN-FAILING entry points at a file that no longer exists: ${suite}" >&2
        status=1
        continue
    fi
    if npx jest --runInBand "$suite" >/dev/null 2>&1; then
        echo "STALE EXCLUSION — ${suite} is marked KNOWN-FAILING but passes now." >&2
        echo "  Remove it from ci.yml's testPathIgnorePatterns and its KNOWN-FAILING marker." >&2
        status=1
    else
        echo "  confirmed still failing: ${suite}"
    fi
done

[[ $status -eq 0 ]] && echo "all KNOWN-FAILING suites still fail"
exit $status
