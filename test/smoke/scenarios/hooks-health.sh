#!/usr/bin/env bash
# =============================================================================
# hooks-health - Scenario: every hook registered in THIS repo loads and exits 0
# =============================================================================
#
# No LLM. Must run in under 15 seconds (enforced structurally: every hook
# invocation gets its own short timeout, and there's a low fixed hook count).
#
# For every hook registered in THIS repo's .claude/settings.json, plus
# notify-complete.sh (invoked directly by commands, not registered as a
# settings.json hook event), feeds it a minimal valid payload on stdin and
# asserts:
#   1. It loads and exits 0 (this is the check that would have caught the
#      permitter shipping broken with "Cannot find module" on every
#      PermissionRequest — nothing ever loaded it).
#   2. Its stdout is either empty or valid JSON.
#
# The hook list is DERIVED from settings.json, not hardcoded — hardcoding is
# exactly what let the hook layer drift undetected in the first place.
#
# Isolation: every hook is invoked with cwd set to a throwaway temp directory
# that contains no .claude/, .trd-state/, or .git/ marker. Hooks that walk up
# looking for project root (resolve-project-root.js, status.js's own walk)
# therefore find nothing and take their documented no-op path — this is what
# keeps the scenario from ever writing into this repo (e.g. precompact.js
# appending to a real .trd-state/<feature>/session-log.md) while still
# exercising the thing that matters: does the hook's code load and run.
#
# NOTE: this checks THIS REPO's hooks, which have always worked in practice.
# It does NOT check that a SCAFFOLDED project's copies of these hooks are
# actually delivered/executable/wired the same way — that gap (the one that
# would have caught the permitter shipping broken) is covered by the
# scaffold-integrity scenario instead.
# =============================================================================

set -uo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_DIR="$(cd "${SCENARIO_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SMOKE_DIR}/.." && cd .. && pwd)"

# shellcheck source=../lib/assert.sh
source "${SMOKE_DIR}/lib/assert.sh"
# shellcheck source=../lib/hookcheck.sh
source "${SMOKE_DIR}/lib/hookcheck.sh"

if ! command -v jq &>/dev/null; then
    smoke_skip "jq not installed"
fi

# SMOKE_SETTINGS_FILE_OVERRIDE lets the deliberate-failure drill (see README)
# point this scenario at a mutated COPY of settings.json without ever
# touching the real one.
SETTINGS_FILE="${SMOKE_SETTINGS_FILE_OVERRIDE:-${REPO_ROOT}/.claude/settings.json}"
if [[ ! -f "$SETTINGS_FILE" ]]; then
    assert_fail_raw "settings.json exists at ${SETTINGS_FILE}"
    smoke_finish
fi

export ENSEMBLE_RUNTIME_REFRESH_DISABLE=1

ISO_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ensemble-smoke-hookshealth.XXXXXX")"
cleanup() { rm -rf "$ISO_DIR"; }
trap cleanup EXIT INT TERM

hookcheck_write_transcript "$ISO_DIR"

# -----------------------------------------------------------------------------
# Derive the hook list from settings.json — event, then absolute hook path.
# -----------------------------------------------------------------------------
HOOK_COUNT=0
while IFS=$'\t' read -r event type command; do
    [[ -z "$event" ]] && continue
    if [[ "$type" == "prompt" ]]; then
        # hookType:"prompt" entries (DISC-B008) are evaluated entirely by the
        # platform's judge — there is no local script for this synthetic-
        # payload harness to invoke, so they are counted but not exercised
        # here. Live behavior is proven separately (see the TRD's DISC-T004
        # live-verification pass), not by this deterministic smoke check.
        HOOK_COUNT=$((HOOK_COUNT + 1))
        continue
    fi
    hook_rel="$(hookcheck_extract_hook_rel "$command")"
    if [[ -z "$hook_rel" ]]; then
        assert_fail_raw "$event: could not extract hook path from command: ${command:0:120}"
        continue
    fi
    hook_path="${REPO_ROOT}/${hook_rel}"
    hook_name="$(basename "$hook_path")"
    HOOK_COUNT=$((HOOK_COUNT + 1))
    hookcheck_run_one "$event" "$hook_path" "$ISO_DIR" "$event/$hook_name"
done < <(hookcheck_derive_from_settings "$SETTINGS_FILE")

if [[ "$HOOK_COUNT" -eq 0 ]]; then
    assert_fail_raw "derived at least one hook from settings.json"
fi

# notify-complete.sh is not a settings.json-registered hook event — it's a
# utility script commands invoke directly on their final turn — but it lives
# alongside the hooks and is explicitly in scope per the smoke-harness spec.
# It takes positional args, not a JSON stdin payload, and is a silent no-op
# when NOTIFY_ON_COMPLETE is unset.
NOTIFY_COMPLETE="${REPO_ROOT}/.claude/hooks/notify-complete.sh"
if [[ -f "$NOTIFY_COMPLETE" ]]; then
    out="$(cd "$ISO_DIR" && unset NOTIFY_ON_COMPLETE; smoke_timeout 5 bash "$NOTIFY_COMPLETE" "smoke-test" "complete" "smoke test summary" 2>"${ISO_DIR}/notify-complete.stderr")"
    rc=$?
    assert_exit_code 0 "$rc" "notify-complete.sh: loads and exits 0"
    assert_json_valid_or_empty "$out" "notify-complete.sh: stdout empty or valid JSON"
else
    assert_fail_raw "notify-complete.sh exists at $NOTIFY_COMPLETE"
fi

echo "Checked ${HOOK_COUNT} registered hook(s) + notify-complete.sh"
smoke_finish
